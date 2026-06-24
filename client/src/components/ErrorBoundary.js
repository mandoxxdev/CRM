import React from 'react';
import './ErrorBoundary.css';

const CHUNK_RELOAD_KEY = 'chunk_reload_boundary';

function isChunkLoadError(error) {
  const msg = error?.message || String(error);
  return (
    msg.includes('Loading chunk') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('ChunkLoadError')
  );
}

class ErrorBoundaryClass extends React.Component {
  state = { hasError: false, error: null, isChunkError: false };

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
      isChunkError: isChunkLoadError(error),
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary:', error, errorInfo);

    if (isChunkLoadError(error)) {
      try {
        if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
          window.location.reload();
          return;
        }
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      if (this.state.isChunkError) {
        return (
          <div className="error-boundary">
            <h1>Atualização disponível</h1>
            <p>
              Uma nova versão do sistema foi publicada. Atualize a página para carregar os
              arquivos mais recentes.
            </p>
            <div className="error-boundary-actions">
              <button type="button" onClick={() => window.location.reload()}>
                Atualizar página
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="error-boundary">
          <h1>Algo deu errado</h1>
          <p>Ocorreu um erro inesperado. Tente voltar à tela inicial ou atualizar a página.</p>
          <div className="error-boundary-actions">
            <button type="button" onClick={() => { window.location.href = '/'; }}>
              Ir para tela inicial
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              Atualizar página (F5)
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ErrorBoundary({ children, fallback }) {
  return (
    <ErrorBoundaryClass fallback={fallback}>
      {children}
    </ErrorBoundaryClass>
  );
}

export default ErrorBoundary;
