import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import type { GameEvent, PlayerView, VisiblePlayer } from '../core/types';
import type { PieceRegistry } from './Pieces';
import { sourcePosition, targetKey, targetPosition } from './spatial';
import { prefersReducedMotion } from './motion';
import type { AnimationBatch } from './animationBatch';

function retainActors(previous: VisiblePlayer, next: VisiblePlayer, impact: boolean): VisiblePlayer {
  return {
    ...next,
    health: impact ? next.health : previous.health,
    board: [
      ...previous.board.map(old => {
        const current = next.board.find(unit => unit.id === old.id);
        return impact ? current ?? { ...old, health: 0 } : old;
      }),
      ...next.board.filter(unit => !previous.board.some(old => old.id === unit.id)),
    ],
  };
}

export function useBattlePresentation(view: PlayerView | null, events: GameEvent[], sequence: number, registry: PieceRegistry, batchScope: AnimationBatch) {
  const [display, setDisplay] = useState(view);
  const [effectView, setEffectView] = useState(view);
  const previous = useRef(view);
  const currentInput = useRef({ view, events });
  currentInput.current = { view, events };
  useEffect(() => {
    const { view: next, events: batch } = currentInput.current;
    const old = previous.current;
    previous.current = next;
    if (!next || !old || batch.some(event => event.type === 'matchStart') || next.phase === 'mulligan') {
      setDisplay(next); setEffectView(next);
      if (!next) { batchScope.cancel(); return; }
      const complete = batchScope.hold();
      const frame = requestAnimationFrame(complete);
      batchScope.seal();
      return () => { batchScope.cancel(); cancelAnimationFrame(frame); };
    }
    const retained = { ...next, self: retainActors(old.self, next.self, false), opponent: retainActors(old.opponent, next.opponent, false) };
    setDisplay(retained);
    setEffectView(retained);
    const complete = batchScope.hold();
    let timeline: gsap.core.Timeline | undefined;
    const frame = requestAnimationFrame(() => {
      timeline = gsap.timeline({ onComplete: complete });
      for (const event of batch) {
        if (prefersReducedMotion()) continue;
        if (event.type === 'attack') {
          const node = registry.get(event.attackerId);
          if (!node) continue;
          const from = sourcePosition(retained, event.playerId, event.attackerId);
          const to = targetPosition(retained, event.target);
          timeline.to(node.position, { x: (to[0] - from[0]) * .72, y: .34, z: (to[2] - from[2]) * .72, duration: .2, ease: 'power3.in' }, .08);
          timeline.to(node.position, { x: 0, y: 0, z: 0, duration: .32, ease: 'back.out(1.5)' }, .3);
        }
        if (event.type === 'summon') {
          const node = registry.get(event.minion.id);
          if (!node) continue;
          timeline.fromTo(node.scale, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1, duration: .55, ease: 'back.out(1.8)' }, .18);
          timeline.fromTo(node.position, { y: .8 }, { y: 0, duration: .42, ease: 'bounce.out' }, .18);
        }
        if (event.type === 'damage') {
          const node = registry.get(targetKey(event.target));
          if (!node) continue;
          timeline.to(node.position, { x: .075, duration: .045, yoyo: true, repeat: 3, ease: 'none' }, .3);
          timeline.to(node.position, { x: 0, duration: .05 }, .5);
        }
        if (event.type === 'death') {
          const node = registry.get(event.minion.id);
          if (!node) continue;
          timeline.to(node.position, { y: -.24, duration: .34, ease: 'power2.in' }, .65);
          timeline.to(node.scale, { x: 0, y: 0, z: 0, duration: .34, ease: 'back.in(1.4)' }, .65);
          timeline.to(node.rotation, { z: .18, duration: .34 }, .65);
        }
        if (event.type === 'heroPower') {
          const node = registry.get(`hero:${event.playerId}`);
          if (node) timeline.fromTo(node.scale, { x: 1, y: 1, z: 1 }, { x: 1.1, y: 1.1, z: 1.1, duration: .18, yoyo: true, repeat: 1, ease: 'power2.out' }, .04);
        }
      }
      timeline.call(() => setDisplay({ ...next, self: retainActors(old.self, next.self, true), opponent: retainActors(old.opponent, next.opponent, true) }), [], .33);
      timeline.call(() => setDisplay(next), [], 1.12);
    });
    batchScope.seal();
    return () => {
      batchScope.cancel();
      cancelAnimationFrame(frame);
      timeline?.kill();
      for (const node of registry.values()) { node.position.set(0, 0, 0); node.scale.set(1, 1, 1); }
    };
  }, [sequence, view === null, registry, batchScope]);
  return { display, effectView };
}
