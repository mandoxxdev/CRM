import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/animations.css';
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




