import { CARDS } from '../core/catalog';
import type { Effect, GameAction, Minion, PlayerView, TargetRef } from '../core/types';

export function chooseMulligan(view: PlayerView): string[] {
  return view.self.hand.filter(({ cardId }) => {
    const card = CARDS[cardId];
    return card.type === 'minion' ? card.cost > 3 : cardId !== 'spark';
  }).map((card) => card.id);
}

const valueOf = (minion: Pick<Minion, 'attack' | 'health'>) => minion.attack * 1.5 + minion.health * 0.65;

function targetMinion(view: PlayerView, target?: TargetRef): Minion | undefined {
  if (target?.type !== 'minion') return undefined;
  return (target.playerId === view.selfId ? view.self.board : view.opponent.board).find((minion) => minion.id === target.instanceId);
}

function damageScore(view: PlayerView, amount: number, target?: TargetRef): number {
  if (!target) return -100;
  if (target.type === 'hero') {
    if (amount >= view.opponent.health) return 10_000;
    const readyDamage = view.self.board.filter((minion) => minion.canAttack).reduce((sum, minion) => sum + minion.attack, 0);
    if (!view.opponent.board.some((minion) => CARDS[minion.cardId].taunt) && amount + readyDamage >= view.opponent.health) return 100;
    return view.opponent.health <= 12 ? amount * 0.6 : -0.5;
  }
  const minion = targetMinion(view, target);
  if (!minion) return -100;
  return amount >= minion.health ? valueOf(minion) + 2 : Math.min(amount, minion.health) * 0.55;
}

function effectScore(view: PlayerView, effect: Effect, target?: TargetRef): number {
  switch (effect.type) {
    case 'damage': return damageScore(view, effect.amount, target);
    case 'damageEnemyHero': return damageScore(view, effect.amount, { type: 'hero', playerId: view.opponent.id });
    case 'areaDamage': return view.opponent.board.reduce((sum, minion) => sum + damageScore(view, effect.amount, { type: 'minion', playerId: view.opponent.id, instanceId: minion.id }), 0) - 2;
    case 'draw': {
      const available = Math.min(effect.amount, view.self.deckCount, 10 - view.self.handCount + 1);
      const failed = Math.max(0, effect.amount - view.self.deckCount);
      const fatigue = failed * view.self.fatigue + failed * (failed + 1) / 2;
      return available * 2.4 - fatigue * 2 - (view.self.handCount > 7 ? 3 : 0);
    }
    case 'healHero': {
      const healed = Math.min(effect.amount, view.self.maxHealth - view.self.health);
      return healed * (view.self.health <= 12 ? 1.5 : 0.45) - 1;
    }
    case 'summon': return Math.min(effect.amount, 7 - view.self.board.length) * 2.5;
    case 'buff': {
      const minion = targetMinion(view, target);
      return minion ? effect.attack * 1.6 + effect.health * 0.8 + (minion.canAttack ? 2 : 0) : -100;
    }
    case 'coin': {
      if (view.self.mana >= 10) return -100;
      const unlocks = view.self.hand.some(({ cardId }) => {
        const card = CARDS[cardId];
        if (card.cost !== view.self.mana + 1) return false;
        if (card.type === 'minion') return view.self.board.length < 7;
        if (card.effect?.type === 'buff') return view.self.board.length > 0;
        if (card.effect?.type === 'summon') return view.self.board.length < 7;
        if (card.effect?.type === 'healHero') return view.self.health <= 24;
        if (card.effect?.type === 'areaDamage') return view.opponent.board.length > 1;
        return true;
      });
      return unlocks ? 12 : -10;
    }
  }
}

function score(view: PlayerView, action: GameAction): number {
  switch (action.type) {
    case 'playCard': {
      const instance = view.self.hand.find((card) => card.id === action.cardInstanceId);
      if (!instance) return -100;
      const card = CARDS[instance.cardId];
      const effect = card.effect ? effectScore(view, card.effect, action.target) : 0;
      if (card.type === 'minion') return card.attack! * 1.5 + card.health! * 0.7 + (card.taunt ? 1.5 : 0) + Math.max(0, effect) + (action.position ?? 0) * 0.001;
      return effect - card.cost * 0.25;
    }
    case 'attack': {
      const attacker = view.self.board.find((minion) => minion.id === action.attackerId)!;
      if (action.target.type === 'hero') {
        if (attacker.attack >= view.opponent.health) return 10_000;
        return attacker.attack * (view.opponent.health <= 12 ? 1.7 : 0.8);
      }
      const defender = targetMinion(view, action.target)!;
      const kill = attacker.attack >= defender.health;
      const survives = defender.attack < attacker.health;
      const threat = view.opponent.board.reduce((sum, minion) => sum + minion.attack, 0);
      return (kill ? valueOf(defender) + 1 : attacker.attack * 0.55) -
        (survives ? defender.attack * 0.35 : valueOf(attacker)) +
        (kill && survives ? 3 : 0) + (kill && threat >= view.self.health ? defender.attack * 2 : 0);
    }
    case 'heroPower':
      return view.self.heroId === 'goblin' ? 1.8 : damageScore(view, 1, action.target) - 0.4;
    case 'endTurn': return 0;
    case 'concede': return -Infinity;
    case 'mulligan': return -100;
  }
}

/** Uses only the masked view and supplied legal commands, including for lookups. */
export function chooseBotAction(view: PlayerView, legalActions: GameAction[]): GameAction {
  if (legalActions.length === 0) throw new Error('No legal actions available.');
  if (view.phase === 'mulligan') {
    const replace = chooseMulligan(view);
    const mulligan = legalActions.find((action) => action.type === 'mulligan' && action.cardIds.length === replace.length && action.cardIds.every((id) => replace.includes(id)));
    if (mulligan) return mulligan;
  }
  let selected = legalActions[0];
  let best = -Infinity;
  for (const action of legalActions) {
    const candidate = score(view, action);
    if (candidate > best) {
      best = candidate;
      selected = action;
    }
  }
  return selected;
}
