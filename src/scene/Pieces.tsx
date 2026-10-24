import { assetUrl } from '../presentation/assetUrl';
import { useLayoutEffect, useRef, type MutableRefObject } from 'react';
import { Text } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { gsap } from 'gsap';
import * as THREE from 'three';
import type { CardDefinition, HeroDefinition, Minion, TargetRef } from '../core/types';
import { StatGem } from './Card';
import type { DragSource, DragState } from './interactions';
import type { Position } from './spatial';
import { prefersReducedMotion } from './motion';
import { useArtTexture } from './SceneAssets';

export type PieceRegistry = Map<string, THREE.Group>;

function SelectionRing({ radius, color, enabled }: { radius: number; color: string; enabled: boolean }) {
  const glow = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (glow.current && !prefersReducedMotion()) {
      const scale = 1 + Math.sin(clock.elapsedTime * 3) * .025;
      glow.current.scale.setScalar(scale);
    }
  });
  if (!enabled) return null;
  return <mesh ref={glow} position-z={-.02}>
    <ringGeometry args={[radius, radius + .055, 48]} />
    <meshBasicMaterial color={color} toneMapped={false} transparent opacity={.9} />
  </mesh>;
}

export interface MinionPieceProps {
  unit: Minion;
  definition: CardDefinition;
  position: Position;
  target: TargetRef;
  mine: boolean;
  active: boolean;
  selected: boolean;
  validTarget: boolean;
  busy: boolean;
  registry: PieceRegistry;
  drag: MutableRefObject<DragState | null>;
  onStart: (event: ThreeEvent<PointerEvent>, source: DragSource) => void;
  onTarget: (target: TargetRef) => void;
  onInspect: (id: string | null) => void;
}

export function MinionPiece({ unit, definition, position, target, mine, active, selected, validTarget, busy, registry, onStart, onTarget, onInspect }: MinionPieceProps) {
  const layout = useRef<THREE.Group>(null);
  const actor = useRef<THREE.Group>(null);
  const texture = useArtTexture(definition.art);
  useLayoutEffect(() => {
    if (actor.current) registry.set(unit.id, actor.current);
    return () => { registry.delete(unit.id); };
  }, [registry, unit.id]);
  useLayoutEffect(() => {
    if (!layout.current) return;
    const tween = gsap.to(layout.current.position, { x: position[0], y: position[1], z: position[2], duration: prefersReducedMotion() ? 0 : .27, ease: 'power2.out' });
    return () => { tween.kill(); };
  }, [position[0], position[1], position[2]]);
  return <group ref={layout} position={position} name={`minion-${unit.id}`} userData={{ target }}
    onPointerDown={mine ? event => onStart(event, { type: 'attacker', instanceId: unit.id }) : undefined}
    onClick={event => { event.stopPropagation(); if (!mine) onTarget(target); }}
    onPointerOver={event => { event.stopPropagation(); onInspect(definition.id); document.body.style.cursor = validTarget || (mine && unit.canAttack && !busy) ? 'pointer' : 'help'; }}
    onPointerOut={() => { onInspect(null); document.body.style.cursor = 'default'; }}>
    <group ref={actor}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {definition.taunt && <mesh position-z={-.03} scale={[1, 1, 1.14]} rotation={[Math.PI / 2, Math.PI / 8, 0]} castShadow><cylinderGeometry args={[.69, .65, .1, 8]} /><meshStandardMaterial color="#77817a" metalness={.64} roughness={.39} /></mesh>}
        <mesh rotation-x={Math.PI / 2} scale={[1, 1, 1.13]} castShadow><cylinderGeometry args={[.565, .59, .14, 40]} /><meshStandardMaterial color="#4b3529" metalness={.2} roughness={.6} /></mesh>
        <mesh position-z={.078} scale={[1, 1.13, 1]}><circleGeometry args={[.505, 40]} /><meshBasicMaterial map={texture} toneMapped={false} /></mesh>
        <mesh position-z={.09} scale={[1, 1.13, 1]}><torusGeometry args={[.54, .045, 8, 40]} /><meshStandardMaterial color={definition.faction === 'mage' ? '#ab8ca7' : '#be9a5d'} metalness={.67} roughness={.34} /></mesh>
        <group scale={[1, 1.13, 1]}><SelectionRing radius={.61} color={validTarget ? '#efbf76' : '#8ec7a2'} enabled={validTarget || selected || (mine && active && unit.canAttack && !busy)} /></group>
        <StatGem value={unit.attack} position={[-.44, -.49, .16]} color={unit.attack > (definition.attack ?? 0) ? '#63845b' : '#8f6b2a'} size={.195} />
        <StatGem value={unit.health} position={[.44, -.49, .16]} color={unit.health < unit.maxHealth ? '#b43e35' : '#863d37'} size={.195} />
        {!unit.canAttack && mine && <Text position={[.4, .5, .15]} font={assetUrl('/assets/fonts/heading.ttf')} fontSize={.16} color="#d3ceaf" outlineWidth={.007} outlineColor="#2a332d">z</Text>}
        {definition.taunt && <mesh position={[0, .65, .11]} rotation-z={Math.PI / 4}><ringGeometry args={[.08, .115, 4]} /><meshStandardMaterial color="#e4e0bd" metalness={.7} roughness={.35} /></mesh>}
      </group>
    </group>
  </group>;
}

export interface HeroPieceProps {
  hero: HeroDefinition;
  health: number;
  position: Position;
  target: TargetRef;
  active: boolean;
  validTarget: boolean;
  registry: PieceRegistry;
  onTarget: (target: TargetRef) => void;
  size?: number;
}

export function HeroPiece({ hero, health, position, target, active, validTarget, registry, onTarget, size = 1 }: HeroPieceProps) {
  const actor = useRef<THREE.Group>(null);
  const texture = useArtTexture(hero.art);
  useLayoutEffect(() => {
    const key = `hero:${target.playerId}`;
    if (actor.current) registry.set(key, actor.current);
    return () => { registry.delete(key); };
  }, [registry, target.playerId]);
  return <group position={position} scale={size} name={`hero-${target.playerId}`} userData={{ target }} onClick={event => { event.stopPropagation(); onTarget(target); }} onPointerOver={event => { event.stopPropagation(); document.body.style.cursor = validTarget ? 'crosshair' : 'default'; }} onPointerOut={() => { document.body.style.cursor = 'default'; }}>
    <group ref={actor} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh rotation-x={Math.PI / 2} castShadow><cylinderGeometry args={[.87, .93, .17, 48]} /><meshStandardMaterial color="#493527" roughness={.5} metalness={.3} /></mesh>
      <mesh position-z={.09}><circleGeometry args={[.76, 48]} /><meshBasicMaterial map={texture} toneMapped={false} /></mesh>
      <mesh position-z={.11}><torusGeometry args={[.81, .06, 8, 48]} /><meshStandardMaterial color={hero.color} metalness={.63} roughness={.32} /></mesh>
      <mesh position-z={.1}><torusGeometry args={[.91, .018, 6, 48]} /><meshStandardMaterial color="#c9a96f" metalness={.8} roughness={.25} /></mesh>
      <SelectionRing radius={.97} color={validTarget ? '#f4bd74' : '#a4bd8c'} enabled={validTarget || active} />
      <StatGem value={health} position={[.68, -.56, .18]} size={.24} />
      <Text position={[0, -.98, .13]} font={assetUrl('/assets/fonts/heading.ttf')} fontSize={.16} color="#e1c998" outlineWidth={.007} outlineColor="#322820" anchorX="center">{hero.name}</Text>
      {[0, 1, 2].map(i => <mesh key={i} position={[(i - 1) * .19, .85 + (i === 1 ? .08 : 0), .1]} rotation-z={Math.PI / 4}><boxGeometry args={[.14, .14, .1]} /><meshStandardMaterial color={hero.color} metalness={.6} roughness={.4} /></mesh>)}
    </group>
  </group>;
}

export function DeckStack({ count, mine }: { count: number; mine: boolean }) {
  const texture = useArtTexture('/assets/card-back.png');
  const layers = Math.max(1, Math.ceil(count / 6));
  return <group position={[4.22, .44, mine ? 3.56 : -3.56]} rotation-y={mine ? -.08 : .08}>
    {Array.from({ length: layers }, (_, i) => <mesh key={i} position={[0, i * .027, 0]} castShadow><boxGeometry args={[.83, .025, 1.22]} /><meshStandardMaterial color={i % 2 ? '#baa274' : '#67513b'} roughness={.8} /></mesh>)}
    <mesh position-y={layers * .027} rotation-x={-Math.PI / 2}><planeGeometry args={[.83, 1.22]} /><meshBasicMaterial map={texture} toneMapped={false} /></mesh>
    <Text position={[0, layers * .027 + .02, .85]} rotation={[-Math.PI / 2, 0, 0]} font={assetUrl('/assets/fonts/heading.ttf')} fontSize={.18} color="#d9bd86">{count}</Text>
  </group>;
}
