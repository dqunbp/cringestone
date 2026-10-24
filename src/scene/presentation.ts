import { useEffect, useMemo, useRef, useState } from 'react';
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

/** A flying card and the settled hand must never own the same visible card. */
export function getHandPresentation(view: PlayerView, events: GameEvent[], active: boolean) {
  const hideHands = active && view.phase === 'playing' && events.some(event => event.type === 'matchStart');
  const drawn = active ? events.filter((event): event is Extract<GameEvent, { type: 'cardDrawn' | 'cardBurned' }> => event.type === 'cardDrawn') : [];
  const hiddenSelfIds = new Set(drawn.filter(event => event.playerId === view.selfId).map(event => event.card.id));
  const opponentDraws = drawn.filter(event => event.playerId !== view.selfId).length;
  return { hideHands, hiddenSelfIds, opponentCount: hideHands ? 0 : Math.max(0, view.opponent.handCount - opponentDraws) };
}

export function createPresentationPacket(sequence: number, next: PlayerView | null, old: PlayerView | null, events: GameEvent[]) {
  const immediate = !next || !old || events.some(event => event.type === 'matchStart') || next.phase === 'mulligan';
  const retained = immediate ? next : { ...next, self: retainActors(old.self, next.self, false), opponent: retainActors(old.opponent, next.opponent, false) };
  return { sequence, next, old, events, immediate, retained };
}

export function useBattlePresentation(view: PlayerView | null, events: GameEvent[], sequence: number, registry: PieceRegistry, batchScope: AnimationBatch) {
  const [staged, setStaged] = useState({ sequence, view });
  const previous = useRef(view);
  // Capture the event packet and its view together before mounting new effects.
  // A passive effect cannot prepare this: children would already have started
  // their layout-effect timelines against the previous packet's hand geometry.
  const projection = useMemo(() => createPresentationPacket(sequence, view, previous.current, events), [sequence, view, events]);
  useEffect(() => {
    const { next, old, events: batch, immediate, retained } = projection;
    previous.current = next;
    if (immediate || !next || !old || !retained) {
      setStaged({ sequence, view: next });
      if (!next) { batchScope.cancel(); return; }
      const complete = batchScope.hold();
      const frame = requestAnimationFrame(complete);
      batchScope.seal();
      return () => { batchScope.cancel(); cancelAnimationFrame(frame); };
    }
    setStaged({ sequence, view: retained });
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
      timeline.call(() => setStaged({ sequence, view: { ...next, self: retainActors(old.self, next.self, true), opponent: retainActors(old.opponent, next.opponent, true) } }), [], .33);
      timeline.call(() => setStaged({ sequence, view: next }), [], 1.12);
    });
    batchScope.seal();
    return () => {
      batchScope.cancel();
      cancelAnimationFrame(frame);
      timeline?.kill();
      for (const node of registry.values()) { node.position.set(0, 0, 0); node.scale.set(1, 1, 1); }
    };
  }, [projection, registry, batchScope]);
  return { display: staged.sequence === sequence ? staged.view : projection.retained, effectView: projection.retained };
}
