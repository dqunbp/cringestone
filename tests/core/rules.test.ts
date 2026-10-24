import { describe, expect, it } from 'vitest';
import { applyAction, CARDS, createMatch, DECKS, getLegalActions, getPlayerView, type GameAction, type GameState, type HeroId, type PlayerId } from '../../src/core';

function step(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function playing(heroId: HeroId = 'mage', firstPlayer: PlayerId = 'player'): GameState {
  let state = createMatch({ seed: 42, heroId, firstPlayer });
  state = step(state, { type: 'mulligan', playerId: 'player', cardIds: [] });
  return step(state, { type: 'mulligan', playerId: 'bot', cardIds: [] });
}

function give(state: GameState, cardId: string, playerId: PlayerId = 'player') {
  const card = { id: `c${state.nextId++}`, cardId };
  state.players[playerId].hand.push(card);
  return card;
}

function board(state: GameState, cardId: string, playerId: PlayerId = 'player', ready = true) {
  const definition = CARDS[cardId];
  const minion = { id: `c${state.nextId++}`, cardId, attack: definition.attack!, health: definition.health!, maxHealth: definition.health!, canAttack: ready };
  state.players[playerId].board.push(minion);
  return minion;
}

function fund(state: GameState) { state.players.player.mana = 10; state.players.player.maxMana = 10; }

describe('catalog and setup', () => {
  it('contains twenty original deck cards, two tokens, and fixed thirty-card decks', () => {
    expect(Object.keys(CARDS)).toHaveLength(22);
    for (const ids of Object.values(DECKS)) {
      expect(ids).toHaveLength(30);
      expect(new Set(ids).size).toBe(15);
      for (const id of new Set(ids)) {
        expect(ids.filter((candidate) => candidate === id)).toHaveLength(2);
        expect(CARDS[id].faction).not.toBe('token');
      }
    }
  });

  it.each(['player', 'bot'] as const)('deals 3/4 then grants the coin and first-turn draw when %s starts', (firstPlayer) => {
    let state = createMatch({ seed: 12, heroId: 'goblin', firstPlayer });
    const second = firstPlayer === 'player' ? 'bot' : 'player';
    expect(state.players[firstPlayer].hand).toHaveLength(3);
    expect(state.players[second].hand).toHaveLength(4);
    expect(Object.values(state.players).flatMap((player) => player.hand).some((card) => card.cardId === 'coin')).toBe(false);
    state = step(state, { type: 'mulligan', playerId: firstPlayer, cardIds: [] });
    expect(state.phase).toBe('mulligan');
    state = step(state, { type: 'mulligan', playerId: second, cardIds: [] });
    expect(state.phase).toBe('playing');
    expect(state.players[firstPlayer].hand).toHaveLength(4);
    expect(state.players[second].hand).toHaveLength(5);
    expect(state.players[second].hand.at(-1)?.cardId).toBe('coin');
    expect(state.players[firstPlayer].mana).toBe(1);
    expect(state.players[second].mana).toBe(0);
  });

  it('redraws without immediately returning the rejected instances and preserves kept slots', () => {
    const state = createMatch({ seed: 2, heroId: 'mage', firstPlayer: 'player' });
    const hand = state.players.player.hand;
    const after = step(state, { type: 'mulligan', playerId: 'player', cardIds: [hand[0].id, hand[2].id] });
    expect(after.players.player.hand[1]).toEqual(hand[1]);
    expect(after.players.player.hand.map((card) => card.id)).not.toContain(hand[0].id);
    expect(after.players.player.hand.map((card) => card.id)).not.toContain(hand[2].id);
    expect(after.players.player.deck.map((card) => card.id)).toEqual(expect.arrayContaining([hand[0].id, hand[2].id]));
    expect(state.players.player.mulliganDone).toBe(false);
    const invalid = applyAction(state, { type: 'mulligan', playerId: 'player', cardIds: [hand[0].id, hand[0].id] });
    expect(invalid.ok).toBe(false);
    expect(invalid.state).toBe(state);
    expect(applyAction(after, { type: 'mulligan', playerId: 'player', cardIds: [] }).ok).toBe(false);
  });

  it('reproduces shuffles from seed and rejects malformed setup', () => {
    expect(createMatch({ seed: 7, heroId: 'mage' })).toEqual(createMatch({ seed: 7, heroId: 'mage' }));
    expect(createMatch({ seed: 7, heroId: 'mage' }).players.player.deck).not.toEqual(createMatch({ seed: 8, heroId: 'mage' }).players.player.deck);
    expect(() => createMatch({ seed: NaN, heroId: 'mage' })).toThrow();
  });
});

describe('turns and combat', () => {
  it('does not permit summoning sickness, off-turn attacks, or repeated attacks', () => {
    let state = playing();
    fund(state);
    const card = give(state, 'duelist');
    state = step(state, { type: 'playCard', playerId: 'player', cardInstanceId: card.id });
    const attack: GameAction = { type: 'attack', playerId: 'player', attackerId: card.id, target: { type: 'hero', playerId: 'bot' } };
    expect(applyAction(state, attack).ok).toBe(false);
    state = step(state, { type: 'endTurn', playerId: 'player' });
    expect(applyAction(state, attack).ok).toBe(false);
    state = step(state, { type: 'endTurn', playerId: 'bot' });
    state = step(state, attack);
    expect(state.players.bot.health).toBe(27);
    expect(applyAction(state, attack).ok).toBe(false);
  });

  it('exchanges combat damage simultaneously and removes both lethal minions', () => {
    const state = playing();
    const attacker = board(state, 'duelist');
    const defender = board(state, 'mushroom', 'bot');
    const result = applyAction(state, { type: 'attack', playerId: 'player', attackerId: attacker.id, target: { type: 'minion', playerId: 'bot', instanceId: defender.id } });
    expect(result.ok).toBe(true);
    expect(result.state.players.player.board).toHaveLength(0);
    expect(result.state.players.bot.board).toHaveLength(0);
    expect(result.events.map((event) => event.type)).toEqual(['attack', 'damage', 'damage', 'death', 'death']);
    expect(state.players.player.board[0].health).toBe(2);
  });

  it('requires attacking a taunt while spells and mage power can reach the hero', () => {
    let state = playing();
    fund(state);
    const attacker = board(state, 'dragon');
    board(state, 'guard', 'bot');
    expect(applyAction(state, { type: 'attack', playerId: 'player', attackerId: attacker.id, target: { type: 'hero', playerId: 'bot' } }).ok).toBe(false);
    const card = give(state, 'spark');
    state = step(state, { type: 'playCard', playerId: 'player', cardInstanceId: card.id, target: { type: 'hero', playerId: 'bot' } });
    state = step(state, { type: 'heroPower', playerId: 'player', target: { type: 'hero', playerId: 'bot' } });
    expect(state.players.bot.health).toBe(27);
    expect(applyAction(state, { type: 'heroPower', playerId: 'player', target: { type: 'hero', playerId: 'bot' } }).ok).toBe(false);
  });

  it('caps mana at ten and temporary coin mana does not grow the next turn maximum', () => {
    let state = playing();
    state.players.player.mana = 1;
    const card = give(state, 'coin');
    state = step(state, { type: 'playCard', playerId: 'player', cardInstanceId: card.id });
    expect(state.players.player.mana).toBe(2);
    expect(state.players.player.maxMana).toBe(1);
    state = step(state, { type: 'endTurn', playerId: 'player' });
    state = step(state, { type: 'endTurn', playerId: 'bot' });
    expect(state.players.player.mana).toBe(2);
    expect(state.players.player.maxMana).toBe(2);
    fund(state);
    const extra = give(state, 'coin');
    state = step(state, { type: 'playCard', playerId: 'player', cardInstanceId: extra.id });
    expect(state.players.player.mana).toBe(10);
  });
});

describe('effects and limits', () => {
  it('caps board summons and rejects a full-board hero power, minion, and summon spell', () => {
    let state = playing('goblin');
    fund(state);
    for (let index = 0; index < 5; index += 1) board(state, 'intern');
    const chief = give(state, 'chief');
    state = step(state, { type: 'playCard', playerId: 'player', cardInstanceId: chief.id, position: 2 });
    expect(state.players.player.board).toHaveLength(7);
    expect(state.players.player.board[2].cardId).toBe('chief');
    const recruits = give(state, 'recruits');
    const squire = give(state, 'squire');
    expect(applyAction(state, { type: 'heroPower', playerId: 'player' }).ok).toBe(false);
    expect(applyAction(state, { type: 'playCard', playerId: 'player', cardInstanceId: recruits.id }).ok).toBe(false);
    expect(applyAction(state, { type: 'playCard', playerId: 'player', cardInstanceId: squire.id }).ok).toBe(false);
  });

  it('allows the goblin power once per turn and gives summoned tokens summoning sickness', () => {
    let state = playing('goblin');
    fund(state);
    state = step(state, { type: 'heroPower', playerId: 'player' });
    expect(state.players.player.board[0]).toMatchObject({ cardId: 'intern', attack: 1, health: 1, canAttack: false });
    expect(state.players.player.mana).toBe(8);
    expect(applyAction(state, { type: 'heroPower', playerId: 'player' }).ok).toBe(false);
  });

  it('resolves area damage as one batch before removing deaths', () => {
    const state = playing();
    fund(state);
    board(state, 'guard', 'bot');
    board(state, 'turtle', 'bot');
    board(state, 'troll', 'bot');
    const card = give(state, 'storm');
    const result = applyAction(state, { type: 'playCard', playerId: 'player', cardInstanceId: card.id });
    expect(result.state.players.bot.board).toHaveLength(1);
    expect(result.state.players.bot.board[0]).toMatchObject({ cardId: 'troll', health: 1 });
    expect(result.events.map((event) => event.type)).toEqual(['cardPlayed', 'damage', 'damage', 'damage', 'death', 'death']);
  });

  it('increases current and maximum health with a buff and caps hero healing', () => {
    let state = playing('goblin');
    fund(state);
    const minion = board(state, 'mushroom');
    minion.health = 1;
    const promotion = give(state, 'promotion');
    state = step(state, { type: 'playCard', playerId: 'player', cardInstanceId: promotion.id, target: { type: 'minion', playerId: 'player', instanceId: minion.id } });
    expect(state.players.player.board[0]).toMatchObject({ attack: 4, health: 3, maxHealth: 5 });
    state.players.player.health = 28;
    const soup = give(state, 'soup');
    state = step(state, { type: 'playCard', playerId: 'player', cardInstanceId: soup.id });
    expect(state.players.player.health).toBe(30);
  });

  it('burns a drawn card at ten cards without removing an existing hand card', () => {
    let state = playing('mage', 'bot');
    while (state.players.player.hand.length < 10) give(state, 'squire');
    const previousHand = structuredClone(state.players.player.hand);
    const top = state.players.player.deck[0];
    const result = applyAction(state, { type: 'endTurn', playerId: 'bot' });
    state = result.state;
    expect(state.players.player.hand).toEqual(previousHand);
    expect(state.players.player.deck.some((card) => card.id === top.id)).toBe(false);
    expect(result.events).toContainEqual({ type: 'cardBurned', playerId: 'player', card: top });
  });

  it('applies fatigue on every failed draw and stops resolving after a lethal draw', () => {
    let state = playing();
    fund(state);
    state.players.player.deck = [];
    const insight = give(state, 'insight');
    state = step(state, { type: 'playCard', playerId: 'player', cardInstanceId: insight.id });
    expect(state.players.player.fatigue).toBe(2);
    expect(state.players.player.health).toBe(27);
    state.players.player.health = 3;
    const second = give(state, 'insight');
    const result = applyAction(state, { type: 'playCard', playerId: 'player', cardInstanceId: second.id });
    expect(result.state.phase).toBe('finished');
    expect(result.state.winner).toBe('bot');
    expect(result.state.players.player.fatigue).toBe(3);
    expect(result.events.filter((event) => event.type === 'matchEnd')).toHaveLength(1);
  });

  it('executes battlecries on play, including a game-winning apprentice', () => {
    const state = playing();
    fund(state);
    state.players.bot.health = 1;
    const apprentice = give(state, 'apprentice');
    const result = applyAction(state, { type: 'playCard', playerId: 'player', cardInstanceId: apprentice.id });
    expect(result.state.phase).toBe('finished');
    expect(result.state.winner).toBe('player');
    expect(result.state.players.player.board).toHaveLength(1);
    expect(getLegalActions(result.state, 'player')).toEqual([]);
    expect(applyAction(result.state, { type: 'endTurn', playerId: 'player' }).ok).toBe(false);
  });
});

describe('command boundary and hidden state', () => {
  it('rejects bad targets, malformed positions, unknown cards and repeated commands without mutation', () => {
    const state = playing();
    fund(state);
    const spark = give(state, 'spark');
    const minion = give(state, 'squire');
    const cases: GameAction[] = [
      { type: 'playCard', playerId: 'player', cardInstanceId: spark.id, target: { type: 'hero', playerId: 'player' } },
      { type: 'playCard', playerId: 'player', cardInstanceId: spark.id },
      { type: 'playCard', playerId: 'player', cardInstanceId: 'missing' },
      ...[-1, 0.5, NaN, 8].map((position): GameAction => ({ type: 'playCard', playerId: 'player', cardInstanceId: minion.id, position })),
    ];
    const snapshot = structuredClone(state);
    for (const action of cases) {
      const result = applyAction(state, action);
      expect(result.ok).toBe(false);
      expect(result.state).toBe(state);
      expect(result.events).toEqual([]);
      expect(state).toEqual(snapshot);
    }
    const action: GameAction = { type: 'playCard', playerId: 'player', cardInstanceId: minion.id };
    const after = step(state, action);
    expect(applyAction(after, action).ok).toBe(false);
  });

  it('masks the opponent hand, both decks and RNG and owns independent nested objects', () => {
    const state = playing();
    const creature = board(state, 'dragon', 'bot');
    const view = getPlayerView(state, 'player');
    expect(view.self.hand).toEqual(state.players.player.hand);
    expect(view.opponent.hand).toEqual([]);
    expect(view.opponent.handCount).toBe(state.players.bot.hand.length);
    expect(view.self).not.toHaveProperty('deck');
    expect(view.opponent).not.toHaveProperty('deck');
    expect(view).not.toHaveProperty('rngState');
    view.self.hand.length = 0;
    view.opponent.board[0].health = 999;
    expect(state.players.player.hand.length).toBeGreaterThan(0);
    expect(creature.health).toBe(7);
  });

  it('permits conceding off-turn but not after a match ends', () => {
    const state = playing();
    const result = step(state, { type: 'concede', playerId: 'bot' });
    expect(result.winner).toBe('player');
    expect(applyAction(result, { type: 'concede', playerId: 'player' }).ok).toBe(false);
  });
});
