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

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);




