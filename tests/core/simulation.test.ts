import { describe, expect, it } from 'vitest';
import { chooseBotAction } from '../../src/bot';
import { applyAction, createMatch, getLegalActions, getPlayerView, type GameAction, type GameState } from '../../src/core';

function checkInvariants(state: GameState): void {
  const ids: string[] = [];
  for (const player of Object.values(state.players)) {
    expect(player.mana).toBeGreaterThanOrEqual(0);
    expect(player.mana).toBeLessThanOrEqual(10);
    expect(player.maxMana).toBeGreaterThanOrEqual(0);
    expect(player.maxMana).toBeLessThanOrEqual(10);
    expect(player.hand.length).toBeLessThanOrEqual(10);
    expect(player.board.length).toBeLessThanOrEqual(7);
    for (const minion of player.board) {
      expect(minion.health).toBeGreaterThan(0);
      expect(minion.health).toBeLessThanOrEqual(minion.maxHealth);
    }
    ids.push(...player.hand.map((card) => card.id), ...player.deck.map((card) => card.id), ...player.board.map((card) => card.id));
  }
  expect(new Set(ids).size).toBe(ids.length);
}

describe('bot matches', () => {
  it('finishes 100 seeded matches with legal commands and invariant-preserving transitions', () => {
    const wins = { goblin: 0, mage: 0, draw: 0 };
    let maxTurns = 0;
    let totalCommands = 0;
    for (let seed = 1; seed <= 100; seed += 1) {
      let state = createMatch({ seed, heroId: seed % 2 ? 'mage' : 'goblin' });
      let commands = 0;
      while (state.phase !== 'finished' && commands < 700) {
        const playerId = state.phase === 'mulligan' ? state.players.player.mulliganDone ? 'bot' : 'player' : state.activePlayer;
        const actions = getLegalActions(state, playerId);
        const action = chooseBotAction(getPlayerView(state, playerId), actions);
        expect(actions).toContainEqual(action);
        expect(action.type).not.toBe('concede');
        const before = JSON.stringify(state);
        const result = applyAction(state, action);
        expect(result.ok, `seed ${seed}, command ${commands}: ${JSON.stringify(action)}`).toBe(true);
        expect(JSON.stringify(state)).toBe(before);
        state = result.state;
        checkInvariants(state);
        commands += 1;
      }
      expect(state.phase, `seed ${seed} failed to terminate after ${commands} commands`).toBe('finished');
      expect(state.winner).not.toBeNull();
      if (state.winner === 'draw') wins.draw += 1;
      else if (state.winner) wins[state.players[state.winner].heroId] += 1;
      maxTurns = Math.max(maxTurns, state.turn);
      totalCommands += commands;
    }
    console.info('100 seed simulation:', { wins, maxTurns, totalCommands });
  }, 30_000);

  it('is reproducible from the same seed and serialized commands', () => {
    const seed = 731;
    let state = createMatch({ seed, heroId: 'mage' });
    const actions: GameAction[] = [];
    for (let index = 0; index < 40 && state.phase !== 'finished'; index += 1) {
      const playerId = state.phase === 'mulligan' ? state.players.player.mulliganDone ? 'bot' : 'player' : state.activePlayer;
      const action = chooseBotAction(getPlayerView(state, playerId), getLegalActions(state, playerId));
      actions.push(action);
      const result = applyAction(state, action);
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    let replay = createMatch({ seed, heroId: 'mage' });
    for (const action of JSON.parse(JSON.stringify(actions)) as GameAction[]) {
      const result = applyAction(replay, action);
      if (!result.ok) throw new Error(result.error);
      replay = JSON.parse(JSON.stringify(result.state)) as GameState;
    }
    expect(replay).toEqual(state);
  });

  it('takes immediate lethal and never relies on hidden enemy identities', () => {
    let state = createMatch({ seed: 81, heroId: 'mage', firstPlayer: 'player' });
    for (const playerId of ['player', 'bot'] as const) {
      const result = applyAction(state, { type: 'mulligan', playerId, cardIds: [] });
      state = result.state;
    }
    state.players.player.mana = 4;
    state.players.player.hand = [{ id: 'lethal', cardId: 'fireball' }];
    state.players.bot.health = 6;
    const actions = getLegalActions(state, 'player');
    const chosen = chooseBotAction(getPlayerView(state, 'player'), actions);
    expect(chosen).toEqual({ type: 'playCard', playerId: 'player', cardInstanceId: 'lethal', target: { type: 'hero', playerId: 'bot' } });
    state.players.bot.hand = state.players.bot.hand.map((card) => ({ ...card, cardId: 'dragon' }));
    state.players.bot.deck.reverse();
    expect(chooseBotAction(getPlayerView(state, 'player'), getLegalActions(state, 'player'))).toEqual(chosen);
  });
});
