import { CARDS } from './catalog';
import type { GameAction, GameState, PlayerId, TargetRef } from './types';

export const opponentOf = (id: PlayerId): PlayerId => id === 'player' ? 'bot' : 'player';

export function enemyTargets(state: GameState, playerId: PlayerId): TargetRef[] {
  const enemyId = opponentOf(playerId);
  return [
    { type: 'hero', playerId: enemyId },
    ...state.players[enemyId].board.map((minion): TargetRef => ({ type: 'minion', playerId: enemyId, instanceId: minion.id })),
  ];
}

export function getLegalActions(state: GameState, playerId: PlayerId): GameAction[] {
  if ((playerId !== 'player' && playerId !== 'bot') || state.phase === 'finished') return [];
  const self = state.players[playerId];
  const actions: GameAction[] = [];
  if (state.phase === 'mulligan') {
    if (!self.mulliganDone) {
      // At most four cards: expose all choices through the same command contract.
      for (let mask = 0; mask < 2 ** self.hand.length; mask += 1) {
        actions.push({ type: 'mulligan', playerId, cardIds: self.hand.filter((_, index) => mask & 2 ** index).map((card) => card.id) });
      }
    }
  } else if (state.activePlayer === playerId) {
    const enemies = enemyTargets(state, playerId);
    for (const card of self.hand) {
      const definition = CARDS[card.cardId];
      if (!definition || definition.cost > self.mana) continue;
      if (definition.type === 'minion') {
        if (self.board.length >= 7) continue;
        for (let position = 0; position <= self.board.length; position += 1) {
          actions.push({ type: 'playCard', playerId, cardInstanceId: card.id, position });
        }
      } else if (definition.effect?.type === 'damage') {
        for (const target of enemies) actions.push({ type: 'playCard', playerId, cardInstanceId: card.id, target });
      } else if (definition.effect?.type === 'buff') {
        for (const minion of self.board) actions.push({ type: 'playCard', playerId, cardInstanceId: card.id, target: { type: 'minion', playerId, instanceId: minion.id } });
      } else {
        if (definition.effect?.type === 'summon' && self.board.length >= 7) continue;
        actions.push({ type: 'playCard', playerId, cardInstanceId: card.id });
      }
    }
    const taunts = state.players[opponentOf(playerId)].board.filter((minion) => CARDS[minion.cardId].taunt);
    const attackTargets = taunts.length
      ? taunts.map((minion): TargetRef => ({ type: 'minion', playerId: opponentOf(playerId), instanceId: minion.id }))
      : enemies;
    for (const minion of self.board) {
      if (minion.canAttack && minion.attack > 0) {
        for (const target of attackTargets) actions.push({ type: 'attack', playerId, attackerId: minion.id, target });
      }
    }
    if (!self.heroPowerUsed && self.mana >= 2) {
      if (self.heroId === 'mage') {
        for (const target of enemies) actions.push({ type: 'heroPower', playerId, target });
      } else if (self.board.length < 7) actions.push({ type: 'heroPower', playerId });
    }
    actions.push({ type: 'endTurn', playerId });
  }
  // Concession is available while waiting as well as during one's own turn.
  actions.push({ type: 'concede', playerId });
  return actions;
}

function sameTarget(a: TargetRef | undefined, b: TargetRef | undefined): boolean {
  if (!a || !b) return a === b;
  return a.type === b.type && a.playerId === b.playerId &&
    (a.type === 'hero' || (b.type === 'minion' && a.instanceId === b.instanceId));
}

/** Validation shares its source of truth with interaction highlights and the bot. */
export function validateAction(state: GameState, action: GameAction): string | undefined {
  if (!action || typeof action !== 'object' || (action.playerId !== 'player' && action.playerId !== 'bot')) return 'Неизвестный игрок.';
  if (state.phase === 'finished') return 'Матч уже завершён.';
  if (action.type === 'mulligan') {
    if (state.phase !== 'mulligan' || state.players[action.playerId].mulliganDone) return 'Замена стартовых карт уже завершена.';
    if (!Array.isArray(action.cardIds) || new Set(action.cardIds).size !== action.cardIds.length ||
      action.cardIds.some((id) => !state.players[action.playerId].hand.some((card) => card.id === id))) return 'Нельзя заменить выбранные карты.';
    return undefined;
  }
  const valid = getLegalActions(state, action.playerId).some((legal) => {
    if (legal.type !== action.type) return false;
    switch (action.type) {
      case 'playCard': {
        if (legal.type !== 'playCard' || legal.cardInstanceId !== action.cardInstanceId || !sameTarget(legal.target, action.target)) return false;
        const position = action.position ?? (legal.position === undefined ? undefined : state.players[action.playerId].board.length);
        return legal.position === position;
      }
      case 'attack': return legal.type === 'attack' && legal.attackerId === action.attackerId && sameTarget(legal.target, action.target);
      case 'heroPower': return legal.type === 'heroPower' && sameTarget(legal.target, action.target);
      case 'endTurn':
      case 'concede': return true;
      default: return false;
    }
  });
  return valid ? undefined : 'Сейчас это действие недоступно.';
}
