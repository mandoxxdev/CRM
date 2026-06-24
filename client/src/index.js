import './publicPath';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
// Design System Premium - Ordem de importação importante
import './styles/design-tokens.css';
import './styles/typography.css';
import './styles/components.css';
import './styles/animations.css';
import './styles/layout.css';
import './styles/utilities.css';
import './styles/glassmorphism.css';
import './styles/modern-layout.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { markChunkRecoveryReady } from './utils/chunkLoadRecovery';
import { registerServiceWorker } from './utils/pushNotifications';

if (process.env.NODE_ENV === 'development' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
} else if (process.env.NODE_ENV === 'production') {
  registerServiceWorker();
}

// Strip cache-bust query param after recovery reload
try {
  const url = new URL(window.location.href);
  if (url.searchParams.has('_cb')) {
    url.searchParams.delete('_cb');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
} catch {
  /* ignore */
}

markChunkRecoveryReady();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);




