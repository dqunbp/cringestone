// This fixture is served only by Vite's development server and is not imported by the app.
import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameScene } from '../../src/scene/GameScene';
import { CARDS } from '../../src/core/catalog';
import type { GameEvent, Minion, PlayerView, VisiblePlayer } from '../../src/core/types';

declare global {
  interface Window {
    __cringestonePerf?: { ready: boolean; completions: number; sequence: number; setEffects: (enabled: boolean) => void };
  }
}

const units = ['squire', 'mushroom', 'duelist', 'guard', 'sentinel', 'dragon', 'ogre'];
const hand = ['squire', 'mushroom', 'duelist', 'turtle', 'troll', 'ogre', 'dragon', 'guard', 'sentinel', 'librarian'];
function player(id: 'player' | 'bot'): VisiblePlayer {
  const board: Minion[] = units.map((cardId, index) => ({ id: `${id}-minion-${index}`, cardId, attack: CARDS[cardId].attack!, health: CARDS[cardId].health!, maxHealth: CARDS[cardId].health!, canAttack: true }));
  return { id, heroId: id === 'player' ? 'goblin' : 'mage', health: 30, maxHealth: 30, mana: 10, maxMana: 10, hand: id === 'player' ? hand.map((cardId, index) => ({ id: `hand-${index}`, cardId })) : [], handCount: 10, deckCount: 20, board, fatigue: 0, heroPowerUsed: false, mulliganDone: true };
}
const fixture: PlayerView = { phase: 'playing', activePlayer: 'player', firstPlayer: 'player', turn: 10, winner: null, selfId: 'player', self: player('player'), opponent: player('bot') };
const noop = () => {};

function Harness() {
  const [ready, setReady] = useState(false);
  const [effects, setEffects] = useState(false);
  const [sequence, setSequence] = useState(1);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [completions, setCompletions] = useState(0);
  const onReady = useCallback(() => setReady(true), []);
  const onComplete = useCallback(() => setCompletions(value => value + 1), []);
  useEffect(() => { window.__cringestonePerf = { ready, completions, sequence, setEffects }; }, [ready, completions, sequence]);
  useEffect(() => {
    if (!ready || !effects) return;
    const timer = window.setInterval(() => {
      setEvents([
        { type: 'attack', playerId: 'player', attackerId: 'player-minion-0', target: { type: 'minion', playerId: 'bot', instanceId: 'bot-minion-0' } },
        ...fixture.opponent.board.map((unit): GameEvent => ({ type: 'damage', target: { type: 'minion', playerId: 'bot', instanceId: unit.id }, amount: 2 })),
        { type: 'heal', target: { type: 'hero', playerId: 'player' }, amount: 6 },
        { type: 'heroPower', playerId: 'player' },
      ]);
      setSequence(value => value + 1);
    }, 1600);
    return () => window.clearInterval(timer);
  }, [ready, effects]);
  return <><GameScene view={fixture} selection={null} legalActions={[]} busy={false} events={events} eventSequence={sequence} onCardSelect={noop} onAttackerSelect={noop} onTarget={noop} onBoardDrop={noop} onCancel={noop} onInspect={noop} onReady={onReady} onAnimationComplete={onComplete} /><div className="bench-label">Performance fixture · 14 units · 10 cards · {effects ? 'area damage + attack + heal' : 'idle'} · {ready ? 'ready' : 'loading'}</div></>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>);
