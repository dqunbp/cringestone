import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installDiagnostics } from './diagnostics/runtime';

const stopDiagnostics = installDiagnostics();
if (import.meta.hot) import.meta.hot.dispose(stopDiagnostics);

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
