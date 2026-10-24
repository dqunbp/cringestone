import { describe, expect, it } from 'vitest';
import { applyAction, createMatch, getPlayerView } from '../../src/core';
import type { GameEvent, PlayerView } from '../../src/core/types';
import { createPresentationPacket, getHandPresentation } from '../../src/scene/presentation';

function opening() {
  const initial = createMatch({ seed: 41, heroId: 'mage', firstPlayer: 'player' });
  const playerMulligan = applyAction(initial, { type: 'mulligan', playerId: 'player', cardIds: [] });
  if (!playerMulligan.ok) throw new Error(playerMulligan.error);
  const ready = applyAction(playerMulligan.state, { type: 'mulligan', playerId: 'bot', cardIds: [] });
  if (!ready.ok) throw new Error(ready.error);
  return { before: getPlayerView(playerMulligan.state, 'player'), after: getPlayerView(ready.state, 'player'), events: ready.events };
}

describe('card presentation ownership', () => {
  it('pairs opening effects with the final hand, including coin and first draw', () => {
    const { before, after, events } = opening();
    expect(before.self.hand).toHaveLength(3);
    expect(after.self.hand).toHaveLength(4);
    expect(events.filter(event => event.type === 'cardDrawn')).toHaveLength(2);
    const packet = createPresentationPacket(7, after, before, events);
    expect(packet.sequence).toBe(7);
    expect(packet.retained?.phase).toBe('playing');
    expect(packet.retained?.self.hand).toEqual(after.self.hand);
    expect(packet.retained?.opponent.handCount).toBe(after.opponent.handCount);
    expect(before.self.hand).toHaveLength(3);
  });

  it('gives opening cards to the flight until completion, then to the normal hand', () => {
    const { after, events } = opening();
    const flying = getHandPresentation(after, events, true);
    expect(flying.hideHands).toBe(true);
    expect(flying.opponentCount).toBe(0);
    const settled = getHandPresentation(after, events, false);
    expect(settled.hideHands).toBe(false);
    expect(settled.hiddenSelfIds.size).toBe(0);
    expect(settled.opponentCount).toBe(after.opponent.handCount);
  });

  it('reserves only arriving cards during a multi-draw and never adds a burned card', () => {
    const { after } = opening();
    const first = { id: 'draw-one', cardId: 'spark' };
    const second = { id: 'draw-two', cardId: 'insight' };
    const view: PlayerView = { ...after, self: { ...after.self, hand: [...after.self.hand, first, second], handCount: after.self.handCount + 2 }, opponent: { ...after.opponent, handCount: after.opponent.handCount + 1 } };
    const events: GameEvent[] = [
      { type: 'cardDrawn', playerId: 'player', card: first },
      { type: 'cardDrawn', playerId: 'player', card: second },
      { type: 'cardDrawn', playerId: 'bot', card: { id: 'hidden-draw', cardId: 'squire' } },
      { type: 'cardBurned', playerId: 'player', card: { id: 'burned', cardId: 'fireball' } },
    ];
    const presentation = getHandPresentation(view, events, true);
    expect(presentation.hideHands).toBe(false);
    expect([...presentation.hiddenSelfIds]).toEqual([first.id, second.id]);
    expect(presentation.opponentCount).toBe(after.opponent.handCount);
    const settledIds = view.self.hand.filter(card => !presentation.hiddenSelfIds.has(card.id)).map(card => card.id);
    const renderedIds = [...settledIds, first.id, second.id];
    expect(new Set(renderedIds).size).toBe(view.self.handCount);
    expect(renderedIds).not.toContain('burned');
    expect(getHandPresentation(view, events, false).hiddenSelfIds.size).toBe(0);
  });

  it('does not start a second 3D deal under the DOM mulligan', () => {
    const { before } = opening();
    const presentation = getHandPresentation(before, [{ type: 'matchStart' }], true);
    expect(presentation.hideHands).toBe(false);
    expect(presentation.opponentCount).toBe(before.opponent.handCount);
  });

  it('retains impact actors without borrowing the preceding packet hand', () => {
    const { after } = opening();
    const next = structuredClone(after);
    next.self.health = 26;
    next.self.hand.push({ id: 'new-card', cardId: 'squire' });
    next.self.handCount += 1;
    const events: GameEvent[] = [{ type: 'damage', target: { type: 'hero', playerId: 'player' }, amount: 4 }];
    const packet = createPresentationPacket(8, next, after, events);
    expect(packet.retained?.self.health).toBe(after.self.health);
    expect(packet.retained?.self.hand).toEqual(next.self.hand);
    expect(packet.events).toBe(events);
    expect(packet.sequence).toBe(8);
  });
});
