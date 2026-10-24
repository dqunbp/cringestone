import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { gsap } from 'gsap';
import * as THREE from 'three';
import { CARDS } from '../core/catalog';
import type { GameEvent, PlayerView } from '../core/types';
import type { DragState } from './interactions';
import { CardFace } from './Card';
import { boardPosition, heroPosition, targetPosition, HAND_Y, HAND_Z, type Position } from './spatial';
import { prefersReducedMotion } from './motion';
import { useBatch } from './animationBatch';

function Burst({ position, color, delay = .26, gentle = false }: { position: Position; color: string; delay?: number; gentle?: boolean }) {
  const batch = useBatch();
  const root = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const particles = useRef<(THREE.Mesh | null)[]>([]);
  const elapsed = useRef(0);
  const complete = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    elapsed.current = 0;
    complete.current = batch.hold();
    return () => complete.current();
  }, [batch]);
  useFrame((_, delta) => {
    elapsed.current += delta;
    const t = elapsed.current - delay;
    if (!root.current) return;
    root.current.visible = t >= 0 && t < .85;
    if (t >= .85) { complete.current(); return; }
    if (t < 0) return;
    if (ring.current) ring.current.scale.setScalar(.2 + t * (gentle ? 1.8 : 2.5));
    for (let i = 0; i < particles.current.length; i++) {
      const mesh = particles.current[i];
      if (!mesh) continue;
      const angle = i / 12 * Math.PI * 2;
      mesh.position.set(Math.cos(angle) * t * 1.25, .16 + Math.sin(t / .85 * Math.PI) * (gentle ? .3 : .65), Math.sin(angle) * t * 1.25);
      mesh.scale.setScalar(Math.max(0, 1 - t / .85));
    }
  });
  return <group ref={root} position={position} visible={false}>
    <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={.04}><ringGeometry args={[.32, .35, 40]} /><meshBasicMaterial color={color} transparent opacity={.65} toneMapped={false} depthWrite={false} /></mesh>
    {Array.from({ length: 12 }, (_, i) => <mesh key={i} ref={node => { particles.current[i] = node; }}><octahedronGeometry args={[gentle ? .045 : .065, 0]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>)}
  </group>;
}

function FloatingNumber({ position, value, color }: { position: Position; value: string; color: string }) {
  const batch = useBatch();
  const group = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    if (!group.current) return;
    const complete = batch.hold();
    const timeline = gsap.timeline({ onComplete: complete });
    const reduced = prefersReducedMotion();
    timeline.fromTo(group.current.scale, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1, duration: reduced ? 0 : .17, ease: 'back.out(2)' }, .28);
    if (!reduced) timeline.to(group.current.position, { y: position[1] + 1.5, duration: .83, ease: 'power1.out' }, .28);
    timeline.to(group.current.scale, { x: 0, y: 0, z: 0, duration: reduced ? 0 : .2 }, .95);
    return () => { timeline.kill(); complete(); };
  }, [batch]);
  return <group ref={group} position={[position[0], position[1] + .55, position[2]]} scale={0}>
    <Billboard><Text font="/assets/fonts/heading.ttf" fontSize={.57} color={color} outlineColor="#2b1b1c" outlineWidth={.028} anchorX="center" anchorY="middle">{value}</Text></Billboard>
  </group>;
}

function SpellProjectile({ from, to, color }: { from: Position; to: Position; color: string }) {
  const batch = useBatch();
  const core = useRef<THREE.Group>(null);
  const trail = useRef<(THREE.Mesh | null)[]>([]);
  const elapsed = useRef(0);
  const complete = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    elapsed.current = 0;
    complete.current = batch.hold();
    return () => complete.current();
  }, [batch]);
  useFrame((_, delta) => {
    elapsed.current += delta;
    const p = Math.max(0, Math.min(1, (elapsed.current - .025) / .27));
    const visible = elapsed.current >= .025 && p < 1;
    if (core.current) {
      core.current.visible = visible;
      core.current.position.set(THREE.MathUtils.lerp(from[0], to[0], p), THREE.MathUtils.lerp(from[1], to[1], p) + .3 + Math.sin(p * Math.PI) * .75, THREE.MathUtils.lerp(from[2], to[2], p));
    }
    trail.current.forEach((mesh, index) => {
      if (!mesh) return;
      mesh.visible = visible;
      const lag = Math.max(0, p - (index + 1) * .055);
      mesh.position.set(THREE.MathUtils.lerp(from[0], to[0], lag), THREE.MathUtils.lerp(from[1], to[1], lag) + .3 + Math.sin(lag * Math.PI) * .75, THREE.MathUtils.lerp(from[2], to[2], lag));
    });
    if (p >= 1) complete.current();
  });
  return <group>
    <group ref={core} visible={false}>
      <mesh><sphereGeometry args={[.11, 12, 8]} /><meshBasicMaterial color="#fff5d5" toneMapped={false} /></mesh>
      <mesh><sphereGeometry args={[.21, 12, 8]} /><meshBasicMaterial color={color} transparent opacity={.3} depthWrite={false} toneMapped={false} /></mesh>
    </group>
    {Array.from({ length: 5 }, (_, index) => <mesh key={index} visible={false} ref={node => { trail.current[index] = node; }}><sphereGeometry args={[.09 - index * .012, 8, 6]} /><meshBasicMaterial color={color} transparent opacity={.75 - index * .12} depthWrite={false} toneMapped={false} /></mesh>)}
  </group>;
}

function PlayedCard({ event, view }: { event: Extract<GameEvent, { type: 'cardPlayed' }>; view: PlayerView }) {
  const batch = useBatch();
  const group = useRef<THREE.Group>(null);
  const mine = event.playerId === view.selfId;
  const definition = CARDS[event.card.cardId];
  useLayoutEffect(() => {
    if (!group.current) return;
    const complete = batch.hold();
    const timeline = gsap.timeline({ onComplete: complete });
    timeline.to(group.current.position, { y: 1.7, z: mine ? 1.7 : -1.7, duration: .22, ease: 'power2.out' }, 0);
    timeline.to(group.current.scale, { x: 0, y: 0, z: 0, duration: .24, ease: 'power2.in' }, .25);
    return () => { timeline.kill(); complete(); };
  }, [batch]);
  return <group ref={group} position={[0, 1, mine ? 3.7 : -3.7]} rotation={[-1.05, 0, 0]} scale={.7}><CardFace definition={definition} /></group>;
}

function handPose(index: number, count: number, mine: boolean) {
  const center = index - (count - 1) / 2;
  const spread = mine ? Math.min(1.5, 7.4 / Math.max(count - 1, 1)) : Math.min(.32, 2.8 / Math.max(count - 1, 1));
  const position: Position = [center * spread, mine ? HAND_Y + index * .013 : .65 + index * .008, mine ? HAND_Z + Math.abs(center) ** 2 * .025 : -4.28 + Math.abs(center) * .035];
  const rotation: Position = [mine ? -1.07 : -Math.PI / 2, 0, mine ? -center * Math.min(.065, .36 / Math.max(count - 1, 1)) : Math.PI + center * .07];
  return { position, rotation, scale: mine ? 1 : .53 };
}

function DrawnCard({ event, view, drawIndex, drawCount }: { event: Extract<GameEvent, { type: 'cardDrawn' | 'cardBurned' }>; view: PlayerView; drawIndex: number; drawCount: number }) {
  const batch = useBatch();
  const group = useRef<THREE.Group>(null);
  const mine = event.playerId === view.selfId;
  const burned = event.type === 'cardBurned';
  const reduced = prefersReducedMotion();
  const count = mine ? view.self.hand.length : view.opponent.handCount;
  const index = mine ? view.self.hand.findIndex(card => card.id === event.card.id) : count - drawCount + drawIndex;
  const pose = handPose(Math.max(0, index), count, mine);
  useLayoutEffect(() => {
    if (!group.current) return;
    const complete = batch.hold();
    const timeline = gsap.timeline({ onComplete: complete });
    const delay = .08 + drawIndex * .12;
    const duration = reduced ? 0 : .5;
    timeline.to(group.current.position, { x: burned ? 2.6 : pose.position[0], y: burned ? 1.8 : pose.position[1], z: burned ? (mine ? 2.4 : -2.4) : pose.position[2], duration, ease: 'power2.inOut' }, delay);
    if (burned) timeline.to(group.current.scale, { x: 0, y: 0, z: 0, duration: reduced ? 0 : .3 }, .8);
    else {
      timeline.to(group.current.rotation, { x: pose.rotation[0], y: pose.rotation[1], z: pose.rotation[2], duration, ease: 'power2.inOut' }, delay);
      timeline.to(group.current.scale, { x: pose.scale, y: pose.scale, z: pose.scale, duration, ease: 'power2.inOut' }, delay);
    }
    return () => { timeline.kill(); complete(); };
  }, [batch]);
  return <>
    <group name={`drawn-card-${event.card.id}`} ref={group} position={[4.22, .8, mine ? 3.56 : -3.56]} rotation={[-1.1, 0, .15]} scale={burned ? .86 : .58}><CardFace definition={mine || burned ? CARDS[event.card.cardId] : undefined} back={!mine && !burned} /></group>
    {burned && !reduced && <Burst position={[2.6, 1.6, mine ? 2.4 : -2.4]} color="#ff9d56" delay={.45} />}
  </>;
}

function DealtCard({ view, index, mine }: { view: PlayerView; index: number; mine: boolean }) {
  const batch = useBatch();
  const group = useRef<THREE.Group>(null);
  const count = mine ? view.self.hand.length : view.opponent.handCount;
  const pose = handPose(index, count, mine);
  useLayoutEffect(() => {
    if (!group.current) return;
    const complete = batch.hold();
    const timeline = gsap.timeline({ onComplete: complete });
    const delay = .16 + index * .12 + (mine ? 0 : .07);
    const duration = prefersReducedMotion() ? 0 : .55;
    timeline.set(group.current, { visible: true }, delay);
    timeline.to(group.current.position, { x: pose.position[0], y: pose.position[1], z: pose.position[2], duration, ease: 'power2.out' }, delay);
    timeline.to(group.current.rotation, { x: pose.rotation[0], y: pose.rotation[1], z: pose.rotation[2], duration, ease: 'power2.out' }, delay);
    timeline.to(group.current.scale, { x: pose.scale, y: pose.scale, z: pose.scale, duration, ease: 'power2.out' }, delay);
    return () => { timeline.kill(); complete(); };
  }, [batch]);
  return <group name={`dealt-card-${mine ? view.self.hand[index].id : `opponent-${index}`}`} ref={group} visible={false} position={[4.22, .8, mine ? 3.56 : -3.56]} rotation={[-Math.PI / 2, 0, -.12]} scale={.58}>
    <CardFace definition={mine ? CARDS[view.self.hand[index].cardId] : undefined} back={!mine} />
  </group>;
}

function InitialDeal({ view }: { view: PlayerView }) {
  return <group>
    {view.self.hand.map((card, index) => <DealtCard key={card.id} view={view} index={index} mine />)}
    {Array.from({ length: view.opponent.handCount }, (_, index) => <DealtCard key={`opponent-${index}`} view={view} index={index} mine={false} />)}
  </group>;
}

export function BattleEffects({ events, view, sequence, handMotionsActive }: { events: GameEvent[]; view: PlayerView; sequence: number; handMotionsActive: boolean }) {
  const reduced = prefersReducedMotion();
  const initialDeal = view.phase === 'playing' && events.some(event => event.type === 'matchStart');
  return <group key={sequence}>{events.flatMap((event, index) => {
    const key = `${sequence}:${index}`;
    // The DOM owns mulligan dealing. At the first turn, one full hand flight
    // includes the coin and opening draw: neither gets a second DrawnCard.
    if (event.type === 'matchStart') return handMotionsActive && initialDeal ? [<InitialDeal key={key} view={view} />] : [];
    if (event.type === 'damage' || event.type === 'heal' || event.type === 'buff') {
      const pos = targetPosition(view, event.target);
      const heal = event.type !== 'damage';
      const value = event.type === 'buff' ? `+${event.attack}/+${event.health}` : `${heal ? '+' : '−'}${event.amount}`;
      return [!reduced && <Burst key={`${key}b`} position={pos} color={heal ? '#a7e1b2' : '#ffc47c'} gentle={heal} />, <FloatingNumber key={`${key}n`} position={pos} value={value} color={heal ? '#c2f2c8' : '#ffe0ab'} />];
    }
    if (reduced && event.type !== 'cardBurned' && event.type !== 'cardDrawn') return [];
    if (event.type === 'summon') {
      const mine = event.playerId === view.selfId;
      const board = mine ? view.self.board : view.opponent.board;
      return [<Burst key={key} position={boardPosition(Math.max(0, board.findIndex(unit => unit.id === event.minion.id)), board.length, mine)} color="#c7b5ee" delay={.15} gentle />];
    }
    if (event.type === 'heroPower' || event.type === 'turnStart') return [<Burst key={key} position={heroPosition(event.playerId === view.selfId)} color={event.type === 'heroPower' ? '#c9a8f2' : '#ead39b'} delay={.04} gentle />, event.type === 'heroPower' && event.target ? <SpellProjectile key={`${key}p`} from={heroPosition(event.playerId === view.selfId)} to={targetPosition(view, event.target)} color="#c9a8f2" /> : null];
    if (event.type === 'cardPlayed') return [<PlayedCard key={key} event={event} view={view} />, event.target && CARDS[event.card.cardId].effect?.type === 'damage' ? <SpellProjectile key={`${key}p`} from={heroPosition(event.playerId === view.selfId)} to={targetPosition(view, event.target)} color={event.card.cardId === 'spark' ? '#a7caff' : '#ffbd72'} /> : null];
    if (event.type === 'cardDrawn' || event.type === 'cardBurned') {
      if (!handMotionsActive || initialDeal && event.type === 'cardDrawn') return [];
      const draws = events.filter(candidate => candidate.type === 'cardDrawn' && candidate.playerId === event.playerId);
      const drawIndex = event.type === 'cardDrawn' ? draws.indexOf(event) : 0;
      return [<DrawnCard key={key} event={event} view={view} drawIndex={drawIndex} drawCount={draws.length} />];
    }
    return [];
  })}</group>;
}

export function TargetArrow({ drag, view }: { drag: React.MutableRefObject<DragState | null>; view: PlayerView }) {
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), []);
  const line = useRef<THREE.Line>(null);
  const tip = useRef<THREE.Mesh>(null);
  const lineObject = useMemo(() => new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#f2be78', depthTest: false })), [geometry]);
  useEffect(() => () => { geometry.dispose(); (lineObject.material as THREE.Material).dispose(); }, [geometry, lineObject]);
  useFrame(() => {
    const current = drag.current;
    if (!line.current || !tip.current) return;
    const show = !!current?.moved && current.source.type === 'attacker';
    line.current.visible = tip.current.visible = show;
    if (!current || !show) return;
    const index = view.self.board.findIndex(unit => unit.id === current.source.instanceId);
    const source = boardPosition(index, view.self.board.length, true);
    const points = geometry.attributes.position as THREE.BufferAttribute;
    points.setXYZ(0, source[0], 1, source[2]);
    points.setXYZ(1, current.position.x, 1, current.position.z);
    points.needsUpdate = true;
    tip.current.position.copy(current.position).setY(1);
    tip.current.rotation.y = Math.atan2(current.position.x - source[0], current.position.z - source[2]);
  });
  return <group>
    <primitive object={lineObject} ref={line} visible={false} renderOrder={50} frustumCulled={false} />
    <mesh ref={tip} visible={false} rotation-x={Math.PI / 2} renderOrder={50}><coneGeometry args={[.13, .3, 3]} /><meshBasicMaterial color="#f2be78" depthTest={false} /></mesh>
  </group>;
}
