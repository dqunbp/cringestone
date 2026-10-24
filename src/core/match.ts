import { CARDS, DECKS } from './catalog';
import { damage, drawCards, newCard, resolveEffect, settle, summon, type Resolution } from './effects';
import { randomStep, shuffle } from './random';
import { opponentOf, validateAction } from './rules';
import type { GameAction, GameState, HeroId, PlayerId, PlayerState, PlayerView, Transition, VisiblePlayer } from './types';

function createPlayer(id: PlayerId, heroId: HeroId): PlayerState {
  return { id, heroId, health: 30, maxHealth: 30, mana: 0, maxMana: 0, hand: [], deck: [], board: [], fatigue: 0, heroPowerUsed: false, mulliganDone: false };
}

export function createMatch(options: { seed: number; heroId: HeroId; firstPlayer?: PlayerId }): GameState {
  if (!Number.isFinite(options.seed) || !Number.isInteger(options.seed)) throw new Error('Seed must be a finite integer.');
  if (options.heroId !== 'goblin' && options.heroId !== 'mage') throw new Error('Unknown hero.');
  if (options.firstPlayer !== undefined && options.firstPlayer !== 'player' && options.firstPlayer !== 'bot') throw new Error('Unknown first player.');
  const rngState = randomStep(options.seed);
  const firstPlayer = options.firstPlayer ?? (rngState % 2 === 0 ? 'player' : 'bot');
  const state: GameState = {
    phase: 'mulligan', activePlayer: firstPlayer, firstPlayer, turn: 0, rngState, nextId: 1, winner: null,
    players: { player: createPlayer('player', options.heroId), bot: createPlayer('bot', options.heroId === 'mage' ? 'goblin' : 'mage') },
  };
  for (const id of ['player', 'bot'] as const) {
    const player = state.players[id];
    player.deck = DECKS[player.heroId].map((cardId) => newCard(state, cardId));
    shuffle(player.deck, state);
    player.hand = player.deck.splice(0, id === firstPlayer ? 3 : 4);
  }
  return state;
}

function startTurn(context: Resolution, playerId: PlayerId): void {
  const { state, events } = context;
  state.activePlayer = playerId;
  state.turn += 1;
  const player = state.players[playerId];
  player.maxMana = Math.min(10, player.maxMana + 1);
  player.mana = player.maxMana;
  player.heroPowerUsed = false;
  for (const minion of player.board) minion.canAttack = true;
  events.push({ type: 'turnStart', playerId, turn: state.turn });
  drawCards(context, playerId, 1);
}

function performMulligan(context: Resolution, action: Extract<GameAction, { type: 'mulligan' }>): void {
  const { state, events } = context;
  const player = state.players[action.playerId];
  const returned = player.hand.filter((card) => action.cardIds.includes(card.id));
  player.hand = player.hand.map((card) => action.cardIds.includes(card.id) ? player.deck.shift()! : card);
  player.deck.push(...returned);
  shuffle(player.deck, state);
  player.mulliganDone = true;
  events.push({ type: 'mulligan', playerId: action.playerId, count: returned.length });
  if (state.players.player.mulliganDone && state.players.bot.mulliganDone) {
    const secondId = opponentOf(state.firstPlayer);
    const coin = newCard(state, 'coin');
    state.players[secondId].hand.push(coin);
    events.push({ type: 'cardDrawn', playerId: secondId, card: { ...coin } });
    state.phase = 'playing';
    events.push({ type: 'matchStart' });
    startTurn(context, state.firstPlayer);
  }
}

export function applyAction(original: GameState, action: GameAction): Transition {
  const error = validateAction(original, action);
  if (error) return { ok: false, state: original, events: [], error };
  const state = structuredClone(original);
  const context: Resolution = { state, events: [] };
  const player = state.players[action.playerId];
  switch (action.type) {
    case 'mulligan':
      performMulligan(context, action);
      break;
    case 'playCard': {
      const index = player.hand.findIndex((card) => card.id === action.cardInstanceId);
      const [card] = player.hand.splice(index, 1);
      const definition = CARDS[card.cardId];
      player.mana -= definition.cost;
      context.events.push({ type: 'cardPlayed', playerId: action.playerId, card: { ...card }, target: action.target ? { ...action.target } : undefined });
      if (definition.type === 'minion') summon(context, action.playerId, card, action.position);
      if (definition.effect) resolveEffect(context, action.playerId, definition.effect, action.target, card.id);
      break;
    }
    case 'attack': {
      const attacker = player.board.find((minion) => minion.id === action.attackerId)!;
      const defender = action.target.type === 'minion'
        ? state.players[action.target.playerId].board.find((minion) => minion.id === (action.target as { instanceId: string }).instanceId)!
        : undefined;
      attacker.canAttack = false;
      context.events.push({ type: 'attack', playerId: action.playerId, attackerId: attacker.id, target: { ...action.target } });
      damage(context, action.target, attacker.attack, attacker.id);
      if (defender) damage(context, { type: 'minion', playerId: action.playerId, instanceId: attacker.id }, defender.attack, defender.id);
      settle(context);
      break;
    }
    case 'heroPower':
      player.mana -= 2;
      player.heroPowerUsed = true;
      context.events.push({ type: 'heroPower', playerId: action.playerId, target: action.target ? { ...action.target } : undefined });
      resolveEffect(context, action.playerId, player.heroId === 'mage' ? { type: 'damage', amount: 1 } : { type: 'summon', amount: 1 }, action.target, 'heroPower');
      break;
    case 'endTurn':
      startTurn(context, opponentOf(action.playerId));
      break;
    case 'concede':
      state.phase = 'finished';
      state.winner = opponentOf(action.playerId);
      context.events.push({ type: 'matchEnd', winner: state.winner });
      break;
  }
  return { ok: true, state, events: context.events };
}

export function getPlayerView(state: GameState, playerId: PlayerId): PlayerView {
  if (playerId !== 'player' && playerId !== 'bot') throw new Error('Unknown player.');
  const visible = (id: PlayerId): VisiblePlayer => {
    const { deck, hand, ...publicState } = state.players[id];
    return { ...publicState, hand: id === playerId ? hand : [], handCount: hand.length, deckCount: deck.length };
  };
  // The view owns its arrays and objects; callers cannot mutate the match.
  return structuredClone({ phase: state.phase, activePlayer: state.activePlayer, firstPlayer: state.firstPlayer,
    turn: state.turn, winner: state.winner, selfId: playerId, self: visible(playerId), opponent: visible(opponentOf(playerId)) });
}
