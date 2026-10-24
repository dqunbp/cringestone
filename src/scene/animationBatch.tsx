import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';

export interface AnimationBatch {
  hold: () => () => void;
  seal: () => void;
  cancel: () => void;
}

function createBatch(onComplete: () => void): AnimationBatch {
  let pending = 0;
  let sealed = false;
  let cancelled = false;
  let notified = false;
  let generation = 0;
  const check = () => {
    if (!sealed || pending || cancelled || notified) return;
    const current = generation;
    queueMicrotask(() => {
      if (generation !== current || !sealed || pending || cancelled || notified) return;
      notified = true;
      onComplete();
    });
  };
  return {
    hold() {
      // React StrictMode replays mount effects on the same memoized batch.
      if (cancelled) cancelled = false;
      if (notified) return () => {};
      pending += 1;
      let released = false;
      const current = generation;
      return () => { if (!released && generation === current) { released = true; pending -= 1; check(); } };
    },
    seal() { sealed = true; check(); },
    cancel() { cancelled = true; sealed = false; notified = false; pending = 0; generation += 1; },
  };
}

const Context = createContext<AnimationBatch | null>(null);

export function useAnimationBatch(sequence: number, onComplete?: (sequence: number) => void) {
  const callback = useRef(onComplete);
  callback.current = onComplete;
  return useMemo(() => createBatch(() => callback.current?.(sequence)), [sequence]);
}

export function AnimationProvider({ batch, children }: { batch: AnimationBatch; children: ReactNode }) {
  return <Context.Provider value={batch}>{children}</Context.Provider>;
}

export function useBatch() {
  const batch = useContext(Context);
  if (!batch) throw new Error('Battle effects require an AnimationProvider.');
  return batch;
}
