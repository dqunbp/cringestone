// Vite-only regression fixture. Never imported by the production app.
import { StrictMode, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CARDS } from '../../src/core/catalog';
import type { GameEvent, PlayerView, VisiblePlayer } from '../../src/core/types';
import { getDiagnosticReport } from '../../src/diagnostics/runtime';
import { GameScene } from '../../src/scene/GameScene';

declare global {
  interface Window { readSceneLoadingDiagnostics: typeof getDiagnosticReport }
}
window.readSceneLoadingDiagnostics = getDiagnosticReport;
const cardIds = Object.keys(CARDS);
const noop = () => {};
function player(id: 'player' | 'bot'): VisiblePlayer {
  return { id, heroId: id === 'player' ? 'goblin' : 'mage', health: 30, maxHealth: 30, mana: 10, maxMana: 10, hand: [], handCount: 0, deckCount: 20, board: [], fatigue: 0, heroPowerUsed: false, mulliganDone: true };
}
function fixture(index: number): PlayerView {
  const card = { id: `loading-${index}`, cardId: cardIds[index] };
  return { phase: 'playing', activePlayer: 'player', firstPlayer: 'player', turn: index + 1, winner: null, selfId: 'player', self: { ...player('player'), hand: [card], handCount: 1 }, opponent: player('bot') };
}

function Harness() {
  const [ready, setReady] = useState(false);
  const [packet, setPacket] = useState<{ view: PlayerView | null; events: GameEvent[]; sequence: number }>({ view: null, events: [], sequence: 0 });
  const [settled, setSettled] = useState(0);
  const onReady = useCallback(() => setReady(true), []);
  const onComplete = useCallback((sequence: number) => setSettled(sequence), []);
  const next = () => {
    const view = fixture(packet.sequence);
    setPacket({ view, events: [
      { type: 'cardDrawn', playerId: 'player', card: view.self.hand[0] },
      { type: 'heal', target: { type: 'hero', playerId: 'player' }, amount: 1 },
    ], sequence: packet.sequence + 1 });
  };
  return <><GameScene {...packet} selection={null} legalActions={[]} busy={packet.sequence !== settled} eventSequence={packet.sequence} onCardSelect={noop} onAttackerSelect={noop} onTarget={noop} onBoardDrop={noop} onCancel={noop} onInspect={noop} onReady={onReady} onAnimationComplete={onComplete} /><div className="controls">
    <button onClick={next} disabled={!ready || packet.sequence !== settled || packet.sequence === cardIds.length}>Next unseen card</button>
    <output data-testid="loading-status">{ready ? 'ready' : 'loading'}</output> · <output data-testid="sequence">{packet.sequence}</output> / <output data-testid="settled">{settled}</output>
  </div></>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>);
