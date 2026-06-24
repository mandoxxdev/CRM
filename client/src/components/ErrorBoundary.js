import React from 'react';
import ModuleLoading from './ModuleLoading';
import { attemptChunkRecovery, isChunkLoadError } from '../utils/chunkLoadRecovery';
import './ErrorBoundary.css';

class ErrorBoundaryClass extends React.Component {
  state = {
    hasError: false,
    error: null,
    isChunkError: false,
    isRecoveringChunk: false,
  };

  static getDerivedStateFromError(error) {
    const chunkError = isChunkLoadError(error);
    if (chunkError) {
      return { hasError: false, error, isChunkError: true, isRecoveringChunk: true };
    }
    return { hasError: true, error, isChunkError: false, isRecoveringChunk: false };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary:', error, errorInfo);

    if (!isChunkLoadError(error)) {
      return;
    }

    attemptChunkRecovery().then((action) => {
      if (action === 'reload') {
        return;
      }
      this.setState({ hasError: true, isChunkError: true, isRecoveringChunk: false });
    });
  }

  render() {
    if (this.state.isRecoveringChunk && !this.state.hasError) {
      return <ModuleLoading module="sistema" inline />;
    }

    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      if (this.state.isChunkError) {
        return (
          <div className="error-boundary error-boundary--orion">
            <div className="error-boundary__panel">
              <img src="/orion-logo.png" alt="Orion" className="error-boundary__logo" />
              <h1>Atualização disponível</h1>
              <p>
                Uma nova versão do sistema foi publicada. Atualize a página para carregar os
                arquivos mais recentes.
              </p>
              <div className="error-boundary-actions">
                <button
                  type="button"
                  onClick={() => {
                    const url = new URL(window.location.href);
                    url.searchParams.set('_cb', String(Date.now()));
                    window.location.replace(`${window.location.origin}${url.pathname}${url.search}${url.hash}`);
                  }}
                >
                  Atualizar página
                </button>
              </div>
            </div>
          </div>
        );
      }

      const detail = this.state.error?.message || 'Erro desconhecido';

      return (
        <div className="error-boundary error-boundary--orion">
          <div className="error-boundary__panel">
            <img src="/orion-logo.png" alt="Orion" className="error-boundary__logo" />
            <h1>Algo deu errado</h1>
            <p>Ocorreu um erro inesperado nesta tela. Tente voltar à tela inicial ou atualizar a página.</p>
            {process.env.NODE_ENV === 'development' && (
              <pre className="error-boundary__detail">{detail}</pre>
            )}
            <div className="error-boundary-actions">
              <button type="button" onClick={() => { window.location.href = '/'; }}>
                Ir para tela inicial
              </button>
              <button type="button" className="error-boundary-actions__secondary" onClick={() => window.location.reload()}>
                Atualizar página
              </button>
            </div>
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
