import { assetUrl } from '../presentation/assetUrl';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { RoundedBox, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { prefersReducedMotion } from './motion';
import { gsap } from 'gsap';
import { useBatch } from './animationBatch';
import { RoundedPlate } from './RoundedPlate';

const WOOD = '#4a2b20';
const BRASS = '#b88a46';

function woodTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = Math.sin(x * .15 + Math.sin(y * .025) * 2 + Math.sin(y * .1) * .3);
    const fine = Math.sin(x * 1.8 + y * .014) * .025;
    const value = Math.round(170 + grain * 14 + fine * 255);
    const i = (y * size + x) * 4;
    data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, .7);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function Candle({ position, height = .65 }: { position: [number, number, number]; height?: number }) {
  const flame = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (flame.current && !prefersReducedMotion()) flame.current.scale.y = .19 * (1 + Math.sin(clock.elapsedTime * 7 + position[0]) * .12);
  });
  return <group position={position}>
    <mesh castShadow position-y={.055}><cylinderGeometry args={[.28, .34, .11, 20]} /><meshStandardMaterial color={BRASS} metalness={.7} roughness={.34} /></mesh>
    <mesh castShadow position-y={height / 2 + .1}><cylinderGeometry args={[.105, .13, height, 20]} /><meshStandardMaterial color="#e4c38d" roughness={.8} /></mesh>
    <mesh position-y={height + .13}><cylinderGeometry args={[.012, .012, .09, 6]} /><meshBasicMaterial color="#35241c" /></mesh>
    <mesh ref={flame} position-y={height + .26} scale={[.065, .19, .065]}><sphereGeometry args={[1, 12, 12]} /><meshBasicMaterial color="#ffe6a5" toneMapped={false} /></mesh>
    <pointLight position={[0, height + .3, 0]} color="#ffa740" intensity={3.5} distance={3.8} decay={2} />
  </group>;
}

function Book({ position, rotation = 0, color = '#466158' }: { position: [number, number, number]; rotation?: number; color?: string }) {
  return <group position={position} rotation-y={rotation}>
    <RoundedBox args={[.93, .23, 1.3]} radius={.04} smoothness={2} castShadow><meshStandardMaterial color={color} roughness={.85} /></RoundedBox>
    <mesh position={[.02, .02, .02]}><boxGeometry args={[.84, .16, 1.23]} /><meshStandardMaterial color="#c8ae7b" roughness={1} /></mesh>
    <mesh position-y={.14}><boxGeometry args={[.96, .045, 1.34]} /><meshStandardMaterial color={color} roughness={.75} /></mesh>
    <mesh position={[-.24, .168, 0]}><boxGeometry args={[.035, .012, 1.22]} /><meshStandardMaterial color={BRASS} metalness={.5} roughness={.5} /></mesh>
    <mesh position={[.24, .168, 0]}><boxGeometry args={[.035, .012, 1.22]} /><meshStandardMaterial color={BRASS} metalness={.5} roughness={.5} /></mesh>
    <mesh position={[0, .17, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[.19, .018, 6, 24]} /><meshStandardMaterial color={BRASS} metalness={.7} roughness={.3} /></mesh>
  </group>;
}

function Bottle({ position, color, scale = 1 }: { position: [number, number, number]; color: string; scale?: number }) {
  return <group position={position} scale={scale}>
    <mesh castShadow position-y={.28}><sphereGeometry args={[.26, 16, 12]} /><meshPhysicalMaterial color={color} transparent opacity={.72} roughness={.15} metalness={.1} /></mesh>
    <mesh position-y={.24} scale={[1, .65, 1]}><sphereGeometry args={[.22, 16, 10]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.32} roughness={.3} /></mesh>
    <mesh position-y={.54}><cylinderGeometry args={[.09, .11, .28, 12]} /><meshPhysicalMaterial color={color} transparent opacity={.65} roughness={.18} /></mesh>
    <mesh castShadow position-y={.71}><cylinderGeometry args={[.085, .085, .13, 10]} /><meshStandardMaterial color="#8b603c" roughness={1} /></mesh>
    <mesh position={[0, .27, .235]}><planeGeometry args={[.22, .15]} /><meshStandardMaterial color="#cfb379" roughness={1} side={THREE.DoubleSide} /></mesh>
  </group>;
}

function Motes() {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const a = new Float32Array(60 * 3);
    for (let i = 0; i < 60; i++) { a[i * 3] = Math.sin(i * 41.37) * 6; a[i * 3 + 1] = .8 + ((i * 13) % 23) / 10; a[i * 3 + 2] = Math.cos(i * 17.39) * 5; }
    return a;
  }, []);
  useFrame(({ clock }) => { if (points.current && !prefersReducedMotion()) points.current.rotation.y = Math.sin(clock.elapsedTime * .025) * .07; });
  return <points ref={points}><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry><pointsMaterial size={.022} color="#f2c484" transparent opacity={.42} depthWrite={false} /></points>;
}

export function Arena() {
  const grain = useMemo(woodTexture, []);
  const entrance = useRef<THREE.Group>(null);
  const entranceBatch = useRef(useBatch());
  useEffect(() => () => grain.dispose(), [grain]);
  useLayoutEffect(() => {
    if (!entrance.current) return;
    const complete = entranceBatch.current.hold();
    const tween = gsap.fromTo(entrance.current.position, { y: -.3 }, { y: 0, duration: prefersReducedMotion() ? 0 : .65, ease: 'power2.out', onComplete: complete });
    return () => { tween.kill(); complete(); };
  }, []);
  return <>
    <color attach="background" args={['#15151c']} />
    <fog attach="fog" args={['#15151c', 19, 34]} />
    <ambientLight intensity={.55} color="#c3bed9" />
    <hemisphereLight args={['#b4c2ea', '#3b1c13', .95]} />
    <directionalLight position={[-3, 9, 5]} intensity={2.4} color="#ffe0ad" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={8} shadow-camera-bottom={-8} shadow-normalBias={.035} shadow-bias={-.0002} />
    <pointLight position={[4, 4, -3]} intensity={12} color="#95a8f9" distance={14} decay={2} />
    <group ref={entrance}>
    <mesh receiveShadow rotation-x={-Math.PI / 2} position-y={-.8}><planeGeometry args={[80, 80]} /><meshStandardMaterial color="#211b21" roughness={1} /></mesh>
    <RoundedBox args={[13.3, .65, 10.8]} radius={.24} smoothness={3} position-y={-.3} castShadow receiveShadow><meshStandardMaterial color="#231a1b" roughness={.7} /></RoundedBox>
    <RoundedPlate width={13.05} height={10.55} thickness={.16} radius={.25} rotation-x={-Math.PI / 2} position-y={.02} castShadow><meshStandardMaterial color="#9a6b39" metalness={.55} roughness={.5} /></RoundedPlate>
    <RoundedPlate width={12.88} height={10.38} thickness={.28} radius={.2} rotation-x={-Math.PI / 2} position-y={.15} receiveShadow castShadow><meshStandardMaterial color={WOOD} roughness={.72} map={grain} /></RoundedPlate>
    {Array.from({ length: 9 }, (_, i) => <mesh key={i} position={[-5.65 + i * 1.41, .295, 0]} receiveShadow><boxGeometry args={[1.39, .025, 9.9]} /><meshStandardMaterial color={i % 2 ? '#604030' : '#674532'} roughness={.84} map={grain} /></mesh>)}
    <RoundedPlate width={10.15} height={6.2} thickness={.07} radius={.36} rotation-x={-Math.PI / 2} position={[0, .325, 0]} receiveShadow><meshStandardMaterial color="#283e3c" roughness={1} /></RoundedPlate>
    <RoundedPlate width={9.97} height={6.01} thickness={.018} radius={.3} rotation-x={-Math.PI / 2} position={[0, .369, 0]} receiveShadow><meshStandardMaterial color="#344b45" roughness={.94} /></RoundedPlate>
    <mesh position={[0, .383, 0]} rotation-x={-Math.PI / 2}><ringGeometry args={[1.48, 1.5, 64]} /><meshStandardMaterial color="#b09359" transparent opacity={.24} roughness={.8} /></mesh>
    <mesh position={[0, .384, 0]} rotation-x={-Math.PI / 2}><ringGeometry args={[1.32, 1.33, 64]} /><meshStandardMaterial color="#b09359" transparent opacity={.18} roughness={.8} /></mesh>
    <mesh position={[0, .388, 0]} rotation-x={-Math.PI / 2} rotation-z={Math.PI / 4}><ringGeometry args={[.61, .63, 4]} /><meshStandardMaterial color="#b09359" transparent opacity={.22} roughness={.8} /></mesh>
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[0, .39, side * .055]}><boxGeometry args={[9.1, .012, .008]} /><meshStandardMaterial color="#b59861" transparent opacity={.23} /></mesh>
      {[-1, 1].map(end => <mesh key={end} position={[end * 5.95, .34, side * 4.73]} rotation-x={-Math.PI / 2}><cylinderGeometry args={[.11, .11, .025, 8]} /><meshStandardMaterial color={BRASS} metalness={.8} roughness={.4} /></mesh>)}
    </group>)}
    <Candle position={[-5.7, .33, -3.25]} height={.8} />
    <Candle position={[-6.04, .33, -2.58]} height={.45} />
    <Candle position={[5.65, .33, 2.9]} height={.6} />
    <Book position={[5.65, .44, -3.65]} rotation={-.18} color="#4f405c" />
    <Book position={[5.56, .72, -3.62]} rotation={.06} color="#674136" />
    <Book position={[-5.5, .45, 3.5]} rotation={-.23} color="#3e5251" />
    <Bottle position={[5.8, .34, -1.88]} color="#52b7a1" />
    <Bottle position={[5.42, .34, -2.48]} color="#ab78c0" scale={.75} />
    <Bottle position={[-5.62, .34, 1.9]} color="#e4a14c" scale={.8} />
    {[-1, 1].map(side => <group key={`gem${side}`} position={[side * 5.72, .52, side * .2]}>
      <mesh rotation={[.2, .5, .2]} castShadow><octahedronGeometry args={[.25, 0]} /><meshStandardMaterial color={side < 0 ? '#80b6bf' : '#ad98d4'} emissive={side < 0 ? '#3b94a5' : '#7861b0'} emissiveIntensity={.35} roughness={.21} metalness={.35} /></mesh>
      <mesh position={[.27, -.1, .24]} rotation={[.4, .2, .7]}><octahedronGeometry args={[.12, 0]} /><meshStandardMaterial color="#c9b16e" roughness={.3} metalness={.5} /></mesh>
    </group>)}
    <Text position={[0, .34, -4.65]} rotation={[-Math.PI / 2, 0, 0]} font={assetUrl('/assets/fonts/heading.ttf')} fontSize={.29} letterSpacing={.16} color="#b19563" anchorX="center" anchorY="middle">CRINGESTONE</Text>
    <Motes />
    </group>
  </>;
}
