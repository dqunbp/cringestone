import { useEffect, useRef, useState } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameAction, TargetRef } from '../core/types';
import type { SceneProps } from '../presentation/types';

export interface DragSource { type: 'card' | 'attacker'; instanceId: string }
export interface DragState { source: DragSource; position: THREE.Vector3; moved: boolean }

function matchesSource(action: GameAction, source: DragSource) {
  return source.type === 'card'
    ? action.type === 'playCard' && action.cardInstanceId === source.instanceId
    : action.type === 'attack' && action.attackerId === source.instanceId;
}

export function sameTarget(a?: TargetRef, b?: TargetRef) {
  return a?.type === b?.type && a?.playerId === b?.playerId && (a?.type !== 'minion' || (b?.type === 'minion' && a.instanceId === b.instanceId));
}

export function useSceneInteractions(props: SceneProps) {
  const { gl, camera, scene } = useThree();
  const latest = useRef(props);
  latest.current = props;
  const drag = useRef<DragState | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const suppressClickUntil = useRef(0);
  const [dragSource, setDragSource] = useState<DragSource | null>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -.95));

  useEffect(() => {
    const cast = (event: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      const p = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.current.setFromCamera(p, camera);
    };
    const move = (event: PointerEvent) => {
      if (!drag.current) return;
      if (Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 8) {
        drag.current.moved = true;
        gl.domElement.style.cursor = 'grabbing';
        document.body.style.cursor = 'grabbing';
      }
      cast(event);
      raycaster.current.ray.intersectPlane(plane.current, drag.current.position);
    };
    const end = (event: PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      const p = latest.current;
      drag.current = null;
      setDragSource(null);
      gl.domElement.style.cursor = 'default';
      document.body.style.cursor = 'default';
      suppressClickUntil.current = performance.now() + 100;
      if (p.busy || !p.view) return;
      if (!current.moved) {
        if (current.source.type === 'card') p.onCardSelect(current.source.instanceId);
        else if (p.selection?.type === 'card' || p.selection?.type === 'power') p.onTarget({ type: 'minion', playerId: p.view.selfId, instanceId: current.source.instanceId });
        else p.onAttackerSelect(current.source.instanceId);
        return;
      }
      cast(event);
      const hits = raycaster.current.intersectObjects(scene.children, true);
      let target: TargetRef | undefined;
      for (const hit of hits) {
        let object: THREE.Object3D | null = hit.object;
        while (object) {
          if (object.userData.target) { target = object.userData.target as TargetRef; break; }
          object = object.parent;
        }
        if (target && (target.type !== 'minion' || target.instanceId !== current.source.instanceId)) break;
        target = undefined;
      }
      const candidates = p.legalActions.filter(action => matchesSource(action, current.source));
      const targeted = candidates.find(action => 'target' in action && action.target && sameTarget(action.target, target));
      const boardDrop = current.position.z > -.1 && current.position.z < 3.2 && Math.abs(current.position.x) < 5;
      const position = THREE.MathUtils.clamp(Math.round(current.position.x / 1.31 + p.view.self.board.length / 2), 0, p.view.self.board.length);
      const untargeted = boardDrop ? candidates.find(action => action.type === 'playCard' && !action.target && (action.position === undefined || action.position === position)) : undefined;
      const action = targeted ?? untargeted;
      if (action) p.onAction?.(action);
    };
    const cancel = () => { drag.current = null; setDragSource(null); gl.domElement.style.cursor = 'default'; document.body.style.cursor = 'default'; };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.cursor = 'default';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key);
    };
  }, [camera, gl, scene]);

  useEffect(() => {
    if (!props.view || props.busy) { drag.current = null; setDragSource(null); }
  }, [props.busy, props.view?.phase]);

  const start = (event: ThreeEvent<PointerEvent>, source: DragSource) => {
    event.stopPropagation();
    if (latest.current.busy || event.button !== 0) return;
    origin.current = { x: event.clientX, y: event.clientY };
    drag.current = { source, position: event.point.clone().setY(.95), moved: false };
    setDragSource(source);
  };
  const clickTarget = (target: TargetRef) => {
    if (latest.current.busy || performance.now() < suppressClickUntil.current) return;
    latest.current.onTarget(target);
  };
  const clickBoard = (point: THREE.Vector3) => {
    if (latest.current.busy || performance.now() < suppressClickUntil.current) return;
    if (latest.current.selection?.type === 'card' && point.z >= 0 && latest.current.view) {
      const count = latest.current.view.self.board.length;
      latest.current.onBoardDrop(THREE.MathUtils.clamp(Math.round(point.x / 1.31 + count / 2), 0, count));
    }
    else latest.current.onCancel();
  };
  const isValidTarget = (target: TargetRef) => {
    const selection = dragSource ?? props.selection;
    return props.legalActions.some(action => {
      if (!('target' in action) || !action.target || !sameTarget(action.target, target)) return false;
      if (selection?.type === 'power') return action.type === 'heroPower';
      return selection ? matchesSource(action, selection) : false;
    });
  };
  return { drag, dragSource, start, clickTarget, clickBoard, isValidTarget };
}
