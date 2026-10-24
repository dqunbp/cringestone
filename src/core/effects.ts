import { CARDS } from './catalog';
import { opponentOf } from './rules';
import type { CardInstance, Effect, GameEvent, GameState, Minion, PlayerId, TargetRef } from './types';

export interface Resolution { state: GameState; events: GameEvent[] }

export function newCard(state: GameState, cardId: string): CardInstance {
  return { id: `c${state.nextId++}`, cardId };
}

export function damage(context: Resolution, target: TargetRef, amount: number, source?: string): void {
  if (amount <= 0) return;
  const player = context.state.players[target.playerId];
  const recipient = target.type === 'hero' ? player : player.board.find((minion) => minion.id === target.instanceId);
  if (!recipient) return;
  recipient.health -= amount;
  context.events.push({ type: 'damage', target: { ...target }, amount, source });
}

/** Call only after an atomic batch (combat or area damage), not per victim. */
export function settle(context: Resolution): void {
  const { state, events } = context;
  for (const playerId of ['player', 'bot'] as const) {
    const player = state.players[playerId];
    for (const minion of player.board) {
      if (minion.health <= 0) events.push({ type: 'death', playerId, minion: { ...minion } });
    }
    player.board = player.board.filter((minion) => minion.health > 0);
  }
  const playerDead = state.players.player.health <= 0;
  const botDead = state.players.bot.health <= 0;
  if (state.phase !== 'finished' && (playerDead || botDead)) {
    state.winner = playerDead && botDead ? 'draw' : playerDead ? 'bot' : 'player';
    state.phase = 'finished';
    events.push({ type: 'matchEnd', winner: state.winner });
  }
}

export function drawCards(context: Resolution, playerId: PlayerId, amount: number): void {
  const player = context.state.players[playerId];
  for (let index = 0; index < amount && context.state.phase !== 'finished'; index += 1) {
    const card = player.deck.shift();
    if (!card) {
      player.fatigue += 1;
      damage(context, { type: 'hero', playerId }, player.fatigue, 'fatigue');
      settle(context);
    } else if (player.hand.length >= 10) {
      context.events.push({ type: 'cardBurned', playerId, card: { ...card } });
    } else {
      player.hand.push(card);
      context.events.push({ type: 'cardDrawn', playerId, card: { ...card } });
    }
  }
}

export function summon(context: Resolution, playerId: PlayerId, card: CardInstance, position?: number): Minion | undefined {
  const player = context.state.players[playerId];
  if (player.board.length >= 7) return undefined;
  const definition = CARDS[card.cardId];
  const minion: Minion = { ...card, attack: definition.attack!, health: definition.health!, maxHealth: definition.health!, canAttack: false };
  player.board.splice(position ?? player.board.length, 0, minion);
  context.events.push({ type: 'summon', playerId, minion: { ...minion } });
  return minion;
}

export function resolveEffect(context: Resolution, playerId: PlayerId, effect: Effect, target?: TargetRef, source?: string): void {
  const player = context.state.players[playerId];
  const enemyId = opponentOf(playerId);
  switch (effect.type) {
    case 'damage':
      if (target) damage(context, target, effect.amount, source);
      break;
    case 'damageEnemyHero':
      damage(context, { type: 'hero', playerId: enemyId }, effect.amount, source);
      break;
    case 'areaDamage':
      for (const minion of context.state.players[enemyId].board) damage(context, { type: 'minion', playerId: enemyId, instanceId: minion.id }, effect.amount, source);
      break;
    case 'draw':
      drawCards(context, playerId, effect.amount);
      break;
    case 'healHero': {
      const amount = Math.min(effect.amount, player.maxHealth - player.health);
      player.health += amount;
      if (amount > 0) context.events.push({ type: 'heal', target: { type: 'hero', playerId }, amount, source });
      break;
    }
    case 'summon':
      for (let index = 0; index < effect.amount && player.board.length < 7; index += 1) summon(context, playerId, newCard(context.state, 'intern'));
      break;
    case 'buff': {
      const minion = target?.type === 'minion' ? player.board.find((item) => item.id === target.instanceId) : undefined;
      if (minion && target) {
        minion.attack += effect.attack;
        minion.health += effect.health;
        minion.maxHealth += effect.health;
        context.events.push({ type: 'buff', target: { ...target }, attack: effect.attack, health: effect.health });
      }
      break;
    }
    case 'coin':
      player.mana = Math.min(10, player.mana + 1);
      context.events.push({ type: 'coin', playerId });
      break;
  }
  settle(context);
}
