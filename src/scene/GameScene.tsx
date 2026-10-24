import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CARDS, HEROES } from '../core/catalog';
import type { SceneProps } from '../presentation/types';
import { Arena } from './Arena';
import { HandCard, OpponentHand } from './Card';
import { DeckStack, HeroPiece, MinionPiece, type PieceRegistry } from './Pieces';
import { BattleEffects, TargetArrow } from './Effects';
import { useSceneInteractions } from './interactions';
import { getHandPresentation, useBattlePresentation } from './presentation';
import { boardPosition, heroPosition } from './spatial';
import { AnimationProvider, useAnimationBatch } from './animationBatch';
import { SceneAssets } from './SceneAssets';
import { SceneDiagnostics, SceneLoading } from './SceneDiagnostics';
import { recordDiagnostic } from '../diagnostics/runtime';

function CameraRig() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const narrow = Math.max(1, 1.58 / (size.width / Math.max(size.height, 1)));
    cam.position.set(0, 11.3 * narrow, 10.1 * narrow);
    cam.lookAt(0, .2, .45);
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

function SceneContent(props: SceneProps) {
  const registry = useMemo<PieceRegistry>(() => new Map(), []);
  const [settledSequence, setSettledSequence] = useState<number | null>(null);
  const currentSequence = useRef(props.eventSequence);
  currentSequence.current = props.eventSequence;
  const batch = useAnimationBatch(props.eventSequence, sequence => {
    if (sequence !== currentSequence.current) return;
    setSettledSequence(sequence);
    props.onAnimationComplete?.(sequence);
  });
  const { display, effectView } = useBattlePresentation(props.view, props.events, props.eventSequence, registry, batch);
  const handMotionsActive = settledSequence !== props.eventSequence;
  const handPresentation = display && getHandPresentation(display, props.events, handMotionsActive);
  const interaction = useSceneInteractions(props);
  const cardSelection = interaction.dragSource?.type === 'card' ? interaction.dragSource : props.selection?.type === 'card' ? props.selection : null;
  const selectedCard = cardSelection && display?.self.hand.find(card => card.id === cardSelection.instanceId);
  const placingMinion = selectedCard && CARDS[selectedCard.cardId].type === 'minion' && props.legalActions.some(action => action.type === 'playCard' && action.cardInstanceId === selectedCard.id);
  useEffect(() => { recordDiagnostic('scene.ready'); props.onReady?.(); }, [props.onReady]);
  return <AnimationProvider batch={batch}>
    <CameraRig />
    <Arena />
    <mesh position={[0, .4, 0]} rotation-x={-Math.PI / 2} onClick={event => { event.stopPropagation(); interaction.clickBoard(event.point); }} name="battlefield-drop-area">
      <planeGeometry args={[10, 6.1]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
    {display && <>
      {placingMinion && <group position={[0, .405, 1.05]}>
        <mesh rotation-x={-Math.PI / 2} raycast={() => {}}><planeGeometry args={[9.55, 2]} /><meshBasicMaterial color="#b5d6a6" transparent opacity={.07} depthWrite={false} /></mesh>
        {Array.from({ length: display.self.board.length + 1 }, (_, index) => <mesh key={index} position={[(index - display.self.board.length / 2) * 1.31, .015, 0]} rotation-x={-Math.PI / 2} raycast={() => {}}><ringGeometry args={[.15, .18, 32]} /><meshBasicMaterial color="#d9dfb0" transparent opacity={.55} depthWrite={false} /></mesh>)}
      </group>}
      <OpponentHand count={display.opponent.handCount} visibleCount={handPresentation!.opponentCount} />
      <DeckStack count={display.self.deckCount} mine />
      <DeckStack count={display.opponent.deckCount} mine={false} />
      {[display.self, display.opponent].map(player => {
        const mine = player.id === display.selfId;
        const heroTarget = { type: 'hero' as const, playerId: player.id };
        return <group key={player.id}>
          <HeroPiece hero={HEROES[player.heroId]} health={player.health} position={heroPosition(mine)} target={heroTarget} active={display.phase === 'playing' && display.activePlayer === player.id} validTarget={interaction.isValidTarget(heroTarget)} registry={registry} onTarget={interaction.clickTarget} size={mine ? .9 : 1} />
          {player.board.map((unit, index) => {
            const target = { type: 'minion' as const, playerId: player.id, instanceId: unit.id };
            return <MinionPiece key={unit.id} unit={unit} definition={CARDS[unit.cardId]} position={boardPosition(index, player.board.length, mine)} target={target} mine={mine} active={display.activePlayer === player.id} selected={props.selection?.type === 'attacker' && props.selection.instanceId === unit.id} validTarget={interaction.isValidTarget(target)} busy={props.busy} registry={registry} drag={interaction.drag} onStart={interaction.start} onTarget={interaction.clickTarget} onInspect={props.onInspect} />;
          })}
        </group>;
      })}
      {display.phase !== 'mulligan' && !handPresentation!.hideHands && display.self.hand.map((card, index) => handPresentation!.hiddenSelfIds.has(card.id) ? null : <HandCard key={card.id} instanceId={card.id} definition={CARDS[card.cardId]} index={index} count={display.self.hand.length} selected={props.selection?.type === 'card' && props.selection.instanceId === card.id} playable={props.legalActions.some(action => action.type === 'playCard' && action.cardInstanceId === card.id)} disabled={props.busy || display.activePlayer !== display.selfId || display.phase !== 'playing'} drag={interaction.drag} onStart={interaction.start} onInspect={props.onInspect} />)}
      <TargetArrow drag={interaction.drag} view={display} />
      {effectView && <BattleEffects key={props.eventSequence} events={props.events} view={effectView} sequence={props.eventSequence} handMotionsActive={handMotionsActive} />}
    </>}
  </AnimationProvider>;
}

/** The 3D scene only presents committed game state; all commands go through the session. */
export function GameScene(props: SceneProps) {
  return <Canvas className="game-canvas" data-testid="game-canvas" shadows dpr={[1, 1.5]} camera={{ fov: 43, near: .1, far: 60, position: [0, 11.3, 10.1] }} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }} onPointerMissed={() => props.onCancel()} onCreated={({ gl }) => {
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    gl.shadowMap.type = THREE.PCFShadowMap;
  }}>
    <SceneDiagnostics sequence={props.eventSequence} />
    <Suspense fallback={<SceneLoading sequence={props.eventSequence} />}><SceneAssets><SceneContent {...props} /></SceneAssets></Suspense>
  </Canvas>;
}
