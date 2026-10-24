/** Local, bounded troubleshooting history. Nothing is sent over the network. */
type Details = Record<string, unknown>;
export interface DiagnosticEntry { at: string; elapsedMs: number; type: string; details?: Details }
const KEY = 'cringestone.diagnostics.v1';
const LIMIT = 300;
const started = new Date().toISOString();
const entries: DiagnosticEntry[] = [];
let previous: unknown = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

try { previous = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { /* Storage may be unavailable. */ }

export function recordDiagnostic(type: string, details?: Details) {
  entries.push({ at: new Date().toISOString(), elapsedMs: Math.round(performance.now()), type, details });
  if (entries.length > LIMIT) entries.splice(0, entries.length - LIMIT);
  if (!saveTimer) saveTimer = setTimeout(flushDiagnostics, 500);
}

function flushDiagnostics() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  try { sessionStorage.setItem(KEY, JSON.stringify({ started, entries })); } catch { /* The in-memory report still works. */ }
}

export function getDiagnosticReport() {
  return {
    version: 1, started, exportedAt: new Date().toISOString(),
    browser: navigator.userAgent,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    visibility: document.visibilityState,
    previous, entries: [...entries],
  };
}

export function downloadDiagnostics() {
  recordDiagnostic('report.export');
  flushDiagnostics();
  const url = URL.createObjectURL(new Blob([JSON.stringify(getDiagnosticReport(), null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `cringestone-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function installDiagnostics() {
  const error = (event: ErrorEvent) => recordDiagnostic('javascript.error', {
    message: event.message, source: event.filename, line: event.lineno,
    stack: event.error instanceof Error ? event.error.stack?.slice(0, 8000) : undefined,
  });
  const rejection = (event: PromiseRejectionEvent) => recordDiagnostic('javascript.unhandled-rejection', {
    message: String(event.reason).slice(0, 2000),
    stack: event.reason instanceof Error ? event.reason.stack?.slice(0, 8000) : undefined,
  });
  const visibility = () => recordDiagnostic('document.visibility', { state: document.visibilityState });
  const resize = () => recordDiagnostic('window.resize', { width: innerWidth, height: innerHeight });
  const creationError = (event: Event) => recordDiagnostic('webgl.context.creation-error', { statusMessage: (event as WebGLContextEvent).statusMessage });
  window.addEventListener('error', error);
  window.addEventListener('unhandledrejection', rejection);
  window.addEventListener('pagehide', flushDiagnostics);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('webglcontextcreationerror', creationError, true);
  recordDiagnostic('app.start');
  return () => {
    window.removeEventListener('error', error);
    window.removeEventListener('unhandledrejection', rejection);
    window.removeEventListener('pagehide', flushDiagnostics);
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', visibility);
    document.removeEventListener('webglcontextcreationerror', creationError, true);
    flushDiagnostics();
  };
}
