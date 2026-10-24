import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Text } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { CardDefinition } from '../core/types';
import type { DragState, DragSource } from './interactions';
import { prefersReducedMotion } from './motion';
import { useArtTexture } from './SceneAssets';
import { RoundedPlate } from './RoundedPlate';
import { HAND_Y, HAND_Z } from './spatial';

const heading = '/assets/fonts/heading.ttf';
const body = '/assets/fonts/body.ttf';

export function StatGem({ value, position, color = '#a73c36', size = .18 }: { value: number | string; position: [number, number, number]; color?: string; size?: number }) {
  return <group position={position}>
    <mesh><circleGeometry args={[size + .028, 24]} /><meshBasicMaterial color="#35271f" /></mesh>
    <mesh position-z={.004}><circleGeometry args={[size, 24]} /><meshStandardMaterial color={color} roughness={.4} metalness={.22} /></mesh>
    <mesh position-z={.008}><ringGeometry args={[size - .018, size, 24]} /><meshStandardMaterial color="#dec28a" metalness={.7} roughness={.35} /></mesh>
    <Text position={[0, -.008, .016]} font={heading} fontSize={size * 1.47} color="#fff1c8" outlineWidth={.007} outlineColor="#312218" anchorX="center" anchorY="middle">{String(value)}</Text>
  </group>;
}

export function CardFace({ definition, back = false, glowing = false }: { definition?: CardDefinition; back?: boolean; glowing?: boolean }) {
  const texture = useArtTexture(back || !definition ? '/assets/card-back.png' : definition.art);
  const faction = definition?.faction;
  const frame = faction === 'mage' ? '#79608b' : faction === 'goblin' ? '#98743c' : '#886d4b';
  return <group>
    <RoundedPlate width={1.36} height={1.96} thickness={.075} radius={.075} castShadow><meshStandardMaterial color="#35271f" roughness={.66} /></RoundedPlate>
    <RoundedPlate width={1.32} height={1.92} thickness={.025} radius={.06} position-z={.041}><meshStandardMaterial color={glowing ? '#d0b86d' : frame} metalness={.4} roughness={.4} emissive={glowing ? '#8b924b' : '#000000'} emissiveIntensity={.35} /></RoundedPlate>
    {back || !definition ? <mesh position-z={.058}><planeGeometry args={[1.22, 1.82]} /><meshBasicMaterial map={texture} toneMapped={false} /></mesh> : <>
      <mesh position={[0, .12, .058]}><planeGeometry args={[1.18, 1.59]} /><meshStandardMaterial color="#dfc99b" roughness={.95} /></mesh>
      <mesh position={[0, .395, .065]}><planeGeometry args={[1.15, .95]} /><meshBasicMaterial map={texture} toneMapped={false} /></mesh>
      <mesh position={[0, -.14, .075]}><planeGeometry args={[1.24, .27]} /><meshStandardMaterial color="#594331" metalness={.1} roughness={.8} /></mesh>
      <mesh position={[0, -.305, .071]}><planeGeometry args={[1.11, .019]} /><meshBasicMaterial color="#9f7c4e" /></mesh>
      <Text position={[0, -.14, .09]} font={heading} fontSize={.115} maxWidth={1.11} lineHeight={1.04} textAlign="center" anchorX="center" anchorY="middle" color="#f9e7bd">{definition.name}</Text>
      <Text position={[0, -.44, .075]} font={body} fontSize={.085} maxWidth={1.05} lineHeight={1.2} textAlign="center" anchorX="center" anchorY="middle" color="#503e2d">{definition.description || 'Существо'}</Text>
      <Text position={[0, -.72, .075]} font={heading} fontSize={.055} letterSpacing={.06} color="#92764c" anchorX="center">{definition.type === 'spell' ? 'ЗАКЛИНАНИЕ' : 'СУЩЕСТВО'}</Text>
      <StatGem value={definition.cost} position={[-.54, .79, .105]} color="#355d83" size={.19} />
      {definition.type === 'minion' && <>
        <StatGem value={definition.attack ?? 0} position={[-.51, -.83, .1]} color="#92702d" />
        <StatGem value={definition.health ?? 0} position={[.51, -.83, .1]} />
      </>}
      {definition.taunt && <mesh position={[.5, .79, .083]} rotation-z={Math.PI / 4}><ringGeometry args={[.09, .13, 4]} /><meshStandardMaterial color="#cbd4d0" metalness={.7} roughness={.3} /></mesh>}
    </>}
  </group>;
}

export interface HandCardProps {
  instanceId: string;
  definition: CardDefinition;
  index: number;
  count: number;
  selected: boolean;
  playable: boolean;
  disabled: boolean;
  drag: MutableRefObject<DragState | null>;
  onStart: (event: ThreeEvent<PointerEvent>, source: DragSource) => void;
  onInspect: (cardId: string | null) => void;
}

export function HandCard({ instanceId, definition, index, count, selected, playable, disabled, drag, onStart, onInspect }: HandCardProps) {
  const group = useRef<THREE.Group>(null);
  const hitArea = useRef<THREE.Mesh>(null);
  const faceProbe = useMemo(() => new THREE.Mesh(new THREE.PlaneGeometry(1.56, 2.12), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), []);
  const faceOffset = useMemo(() => new THREE.Matrix4().makeTranslation(0, 0, .14), []);
  const targetPosition = useRef(new THREE.Vector3());
  const targetScale = useRef(new THREE.Vector3());
  const [hovered, setHovered] = useState(false);
  const center = index - (count - 1) / 2;
  const spread = Math.min(1.5, 7.4 / Math.max(count - 1, 1));
  const angle = center * Math.min(.065, .36 / Math.max(count - 1, 1));
  useEffect(() => () => { faceProbe.geometry.dispose(); faceProbe.material.dispose(); }, [faceProbe]);
  // Keep one event object while the pointer crosses artwork, text, gems, or
  // the space occupied before lifting. Decorative meshes never own hover.
  const raycast = useCallback((raycaster: THREE.Raycaster, intersections: THREE.Intersection[]) => {
    if (!hitArea.current || !group.current) return;
    const hits: THREE.Intersection[] = [];
    THREE.Mesh.prototype.raycast.call(hitArea.current, raycaster, hits);
    faceProbe.matrixWorld.copy(group.current.matrixWorld).multiply(faceOffset);
    faceProbe.raycast(raycaster, hits);
    const nearest = hits.sort((a, b) => a.distance - b.distance)[0];
    if (nearest) intersections.push({ ...nearest, object: hitArea.current });
  }, [faceProbe, faceOffset]);
  useFrame((_, delta) => {
    if (!group.current) return;
    const dragging = drag.current?.source.instanceId === instanceId && drag.current.moved;
    const lifted = (hovered && !disabled) || selected;
    const target = dragging ? drag.current!.position : targetPosition.current.set(center * spread, lifted ? 1.8 : HAND_Y + index * .013, (lifted ? 3.85 : HAND_Z) + Math.abs(center) ** 2 * .025);
    const rate = prefersReducedMotion() ? 1 : 1 - Math.exp(-18 * delta);
    group.current.position.lerp(target, rate);
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, dragging ? -1.15 : lifted ? -.87 : -1.07, rate);
    group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, dragging || lifted ? 0 : -angle, rate);
    const scale = lifted || dragging ? 1.16 : 1;
    group.current.scale.lerp(targetScale.current.setScalar(scale), rate);
  });
  return <group name={`hand-${instanceId}`}>
    <mesh ref={hitArea} name={`hand-hit-${instanceId}`} raycast={raycast}
      onPointerDown={event => { if (!disabled) onStart(event, { type: 'card', instanceId }); else event.stopPropagation(); }}
      onPointerOver={event => { event.stopPropagation(); setHovered(true); onInspect(definition.id); document.body.style.cursor = disabled ? 'default' : 'grab'; }}
      onPointerOut={() => { setHovered(false); onInspect(null); document.body.style.cursor = 'default'; }}
      position={[center * spread, HAND_Y + index * .013, HAND_Z + Math.abs(center) ** 2 * .025]} rotation={[-1.07, 0, -angle]}>
      <planeGeometry args={[1.56, 2.12]} /><meshBasicMaterial colorWrite={false} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
    <group ref={group} position={[center * spread, HAND_Y + index * .013, HAND_Z + Math.abs(center) ** 2 * .025]} rotation={[-1.07, 0, -angle]}>
      <CardFace definition={definition} glowing={selected || (playable && !disabled)} />
    </group>
  </group>;
}

export function OpponentHand({ count, visibleCount = count }: { count: number; visibleCount?: number }) {
  return <group>{Array.from({ length: visibleCount }, (_, i) => {
    const center = i - (count - 1) / 2;
    return <group key={i} position={[center * Math.min(.32, 2.8 / Math.max(1, count - 1)), .65 + i * .008, -4.28 + Math.abs(center) * .035]} rotation={[-Math.PI / 2, 0, Math.PI + center * .07]} scale={.53}><CardFace back /></group>;
  })}</group>;
}
