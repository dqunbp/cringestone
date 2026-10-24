import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyAction, createMatch, getLegalActions, getPlayerView } from '../core';
import { chooseBotAction, chooseMulligan } from '../bot';
import type { GameAction, GameEvent, GameState, HeroId } from '../core/types';
import { describeEvent } from './events';

export interface LogEntry { id: number; text: string }

export function useGameSession(sceneReady: boolean, paused: boolean) {
  const [state, setState] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [eventSequence, setSequence] = useState(0);
  const [uiPresentationPending, setUiPresentationPending] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  const stateRef = useRef(state);
  const busyRef = useRef(false);
  const epochRef = useRef(0);
  const sequenceRef = useRef(0);
  const completionRef = useRef<{ sequence: number; scene: boolean; ui: boolean } | null>(null);
  const logIdRef = useRef(0);
  const enabledRef = useRef(false);
  enabledRef.current = sceneReady && visible && !paused;

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const dispatch = useCallback((action: GameAction): boolean => {
    const current = stateRef.current;
    if (!current || busyRef.current || !enabledRef.current) return false;
    const result = applyAction(current, action);
    if (!result.ok) { setError(result.error); return false; }
    stateRef.current = result.state;
    busyRef.current = true;
    const sequence = ++sequenceRef.current;
    const needsUi = result.events.some((event) => event.type === 'mulligan' && event.playerId === 'player');
    completionRef.current = { sequence, scene: false, ui: !needsUi };
    setState(result.state);
    setBusy(true);
    setUiPresentationPending(needsUi);
    setEvents(result.events);
    setSequence(sequence);
    setError('');
    const entries = result.events.flatMap((event) => {
      const text = describeEvent(event, result.state);
      return text ? [{ id: ++logIdRef.current, text }] : [];
    });
    setLog((previous) => [...entries.reverse(), ...previous].slice(0, 24));
    return true;
  }, []);

  const start = useCallback((heroId: HeroId) => {
    epochRef.current += 1;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const next = createMatch({ seed, heroId });
    stateRef.current = next;
    busyRef.current = true;
    const sequence = ++sequenceRef.current;
    completionRef.current = { sequence, scene: false, ui: false };
    setState(next);
    setBusy(true);
    setUiPresentationPending(true);
    setEvents([{ type: 'matchStart' }]);
    setSequence(sequence);
    setLog([]);
    setError('');
  }, []);

  const reset = useCallback(() => {
    epochRef.current += 1;
    stateRef.current = null;
    busyRef.current = false;
    completionRef.current = null;
    setState(null);
    setBusy(false);
    setUiPresentationPending(false);
    setEvents([]);
    setSequence(++sequenceRef.current);
    setLog([]);
    setError('');
  }, []);

  const completePresentation = useCallback((source: 'scene' | 'ui', sequence: number) => {
    // A late callback from a previous action or abandoned match cannot unlock
    // the current action. The scene owns timing; the session owns permission.
    const completion = completionRef.current;
    if (sequence !== sequenceRef.current || !stateRef.current || !busyRef.current || completion?.sequence !== sequence) return;
    completion[source] = true;
    if (source === 'ui') setUiPresentationPending(false);
    if (completion.scene && completion.ui) {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);
  const completeAnimation = useCallback((sequence: number) => completePresentation('scene', sequence), [completePresentation]);
  const completeUiAnimation = useCallback((sequence: number) => completePresentation('ui', sequence), [completePresentation]);

  useEffect(() => {
    if (!state || busy || !visible || !sceneReady || paused || state.phase === 'finished') return;
    const needsMulligan = state.phase === 'mulligan' && state.players.player.mulliganDone && !state.players.bot.mulliganDone;
    const needsTurn = state.phase === 'playing' && state.activePlayer === 'bot';
    if (!needsMulligan && !needsTurn) return;
    const epoch = epochRef.current;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (!current || epochRef.current !== epoch || busyRef.current || !enabledRef.current) return;
      const view = getPlayerView(current, 'bot');
      if (current.phase === 'mulligan') {
        dispatch({ type: 'mulligan', playerId: 'bot', cardIds: chooseMulligan(view) });
      } else if (current.phase === 'playing' && current.activePlayer === 'bot') {
        const action = chooseBotAction(view, getLegalActions(current, 'bot'));
        if (action) dispatch(action);
      }
    }, needsMulligan ? 300 : 700);
    return () => window.clearTimeout(timer);
  }, [state, busy, visible, sceneReady, paused, dispatch]);

  useEffect(() => () => { epochRef.current += 1; }, []);
  const view = useMemo(() => state ? getPlayerView(state, 'player') : null, [state]);
  const legalActions = useMemo(() => state ? getLegalActions(state, 'player') : [], [state]);
  return { state, view, busy, events, eventSequence, legalActions, log, error, visible, dispatch, start, reset, completeAnimation, completeUiAnimation, uiPresentationPending };
}
