import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { recordDiagnostic } from '../diagnostics/runtime';

/** Stays mounted outside Suspense so a hidden scene and a lost context remain observable. */
export function SceneDiagnostics({ sequence }: { sequence: number }) {
  const { gl } = useThree();
  const currentSequence = useRef(sequence);
  const previousFrame = useRef<number | null>(null);
  currentSequence.current = sequence;
  useEffect(() => {
    const context = gl.getContext();
    const hardware = context.getExtension('WEBGL_debug_renderer_info');
    const details = () => ({ sequence: currentSequence.current, visibility: document.visibilityState, contextLost: context.isContextLost(), textures: gl.info.memory.textures, geometries: gl.info.memory.geometries, programs: gl.info.programs?.length, drawingBuffer: [context.drawingBufferWidth, context.drawingBufferHeight] });
    recordDiagnostic('scene.mount', { ...details(), renderer: context.getParameter(hardware?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER), vendor: context.getParameter(hardware?.UNMASKED_VENDOR_WEBGL ?? context.VENDOR), pixelRatio: gl.getPixelRatio() });
    const lost = (event: Event) => recordDiagnostic('webgl.context.lost', { ...details(), statusMessage: (event as WebGLContextEvent).statusMessage });
    const restored = () => recordDiagnostic('webgl.context.restored', details());
    const creationError = (event: Event) => recordDiagnostic('webgl.context.creation-error', { ...details(), statusMessage: (event as WebGLContextEvent).statusMessage });
    const canvas = gl.domElement;
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    canvas.addEventListener('webglcontextcreationerror', creationError);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      canvas.removeEventListener('webglcontextcreationerror', creationError);
      recordDiagnostic('scene.unmount', details());
    };
  }, [gl]);
  useFrame(() => {
    const now = performance.now();
    const elapsed = previousFrame.current === null ? 0 : now - previousFrame.current;
    previousFrame.current = now;
    if (elapsed > 250) recordDiagnostic('scene.frame-gap', { milliseconds: Math.round(elapsed), sequence: currentSequence.current, visibility: document.visibilityState, contextLost: gl.getContext().isContextLost(), drawCalls: gl.info.render.calls });
  });
  useEffect(() => { recordDiagnostic('scene.sequence', { sequence, visibility: document.visibilityState }); }, [sequence]);
  return null;
}

export function SceneLoading({ sequence }: { sequence: number }) {
  const currentSequence = useRef(sequence);
  currentSequence.current = sequence;
  useEffect(() => {
    recordDiagnostic('scene.suspense.enter', { sequence: currentSequence.current, visibility: document.visibilityState });
    return () => { recordDiagnostic('scene.suspense.exit', { sequence: currentSequence.current, visibility: document.visibilityState }); };
  }, []);
  return null;
}
