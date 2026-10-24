import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameEvent } from '../core/types';

interface SoundSettings { enabled: boolean; volume: number }
function readSettings(): SoundSettings {
  try {
    const saved = JSON.parse(localStorage.getItem('cringestone-sound') || 'null');
    return { enabled: saved?.enabled !== false, volume: typeof saved?.volume === 'number' ? Math.min(1, Math.max(0, saved.volume)) : 0.45 };
  } catch { return { enabled: true, volume: 0.45 }; }
}

export function useSound(events: GameEvent[], sequence: number, visible: boolean) {
  const [settings, setSettings] = useState(readSettings);
  const contextRef = useRef<AudioContext | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const timersRef = useRef<number[]>([]);
  const voicesRef = useRef(new Set<AudioScheduledSourceNode>());

  const stop = useCallback(() => {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
    for (const oscillator of voicesRef.current) {
      try { oscillator.stop(); } catch { /* The voice may already have ended. */ }
    }
    voicesRef.current.clear();
  }, []);

  const tone = useCallback((frequency: number, duration: number, type: OscillatorType = 'sine', delay = 0, ending?: number, intensity = 1) => {
    const context = contextRef.current;
    const current = settingsRef.current;
    if (!context || context.state !== 'running' || !current.enabled || document.hidden) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (ending) oscillator.frequency.exponentialRampToValueAtTime(ending, at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, current.volume * 0.12 * intensity), at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    voicesRef.current.add(oscillator);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.03);
    oscillator.onended = () => { voicesRef.current.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
  }, []);

  const drawWhoosh = useCallback(() => {
    const context = contextRef.current;
    const current = settingsRef.current;
    if (!context || context.state !== 'running' || !current.enabled || document.hidden) return;
    const duration = 0.18;
    const at = context.currentTime + 0.1;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.Q.value = 0.65;
    filter.frequency.setValueAtTime(1700, at);
    filter.frequency.exponentialRampToValueAtTime(550, at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, current.volume * 0.1), at + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    voicesRef.current.add(source);
    source.start(at);
    source.stop(at + duration);
    source.onended = () => { voicesRef.current.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }, []);

  const unlock = useCallback(() => {
    try {
      const context = contextRef.current ?? new AudioContext();
      contextRef.current = context;
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
    } catch { /* Sound is optional; the game remains playable. */ }
  }, []);
  const click = useCallback(() => { unlock(); tone(360, 0.1, 'triangle', 0, 250); }, [tone, unlock]);
  useEffect(() => {
    try { localStorage.setItem('cringestone-sound', JSON.stringify(settings)); } catch { /* Private storage may be unavailable. */ }
  }, [settings]);
  useEffect(() => {
    stop();
    if (!visible || !settings.enabled) return;
    const kinds = new Set(events.map((event) => event.type));
    if (kinds.has('matchStart')) [196, 247, 294, 392].forEach((note, i) => tone(note, 0.5, 'triangle', i * 0.14));
    if (kinds.has('cardPlayed') || kinds.has('mulligan')) tone(420, 0.15, 'triangle', 0, 180);
    if (kinds.has('cardDrawn') || kinds.has('cardBurned')) drawWhoosh();
    if (kinds.has('attack') || kinds.has('damage')) {
      timersRef.current.push(window.setTimeout(() => tone(105, 0.22, 'triangle', 0, 38), 300));
    }
    if (kinds.has('heroPower') || kinds.has('buff')) [440, 660, 880].forEach((note, i) => tone(note, 0.22, 'sine', i * 0.07));
    if (kinds.has('heal')) [330, 440, 550].forEach((note, i) => tone(note, 0.32, 'sine', i * 0.08));
    if (kinds.has('death')) tone(160, 0.32, 'triangle', 0.65, 45, 0.55);
    if (kinds.has('turnStart')) { tone(294, 0.28, 'triangle'); tone(392, 0.35, 'triangle', 0.12); }
    if (kinds.has('matchEnd')) {
      const event = events.find((item) => item.type === 'matchEnd');
      const notes = event?.type === 'matchEnd' && event.winner === 'player' ? [262, 330, 392, 523] : [294, 262, 220, 147];
      notes.forEach((note, i) => tone(note, 0.6, 'triangle', 0.75 + i * 0.12));
    }
    return stop;
    // Each committed batch plays once, never again after a settings change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence]);
  useEffect(() => { if (!settings.enabled) stop(); }, [settings.enabled, stop]);
  useEffect(() => {
    const context = contextRef.current;
    if (!visible && context?.state === 'running') void context.suspend();
    else if (visible && context?.state === 'suspended') void context.resume().catch(() => undefined);
  }, [visible]);
  useEffect(() => () => {
    stop();
    void contextRef.current?.close();
    contextRef.current = null;
  }, [stop]);
  return {
    ...settings, unlock, click,
    toggle: () => { unlock(); setSettings((current) => ({ ...current, enabled: !current.enabled })); },
    setVolume: (volume: number) => setSettings((current) => ({ ...current, volume })),
  };
}
