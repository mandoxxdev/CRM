import React from 'react';
import './ErrorBoundary.css';

class ErrorBoundaryClass extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-boundary">
          <h1>Algo deu errado</h1>
          <p>Ocorreu um erro inesperado. Tente voltar à tela inicial ou atualizar a página.</p>
          <div className="error-boundary-actions">
            <button type="button" onClick={() => window.location.href = '/'}>
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

// Wrapper para usar useNavigate no fallback (opcional)
function ErrorBoundary({ children, fallback }) {
  return (
    <ErrorBoundaryClass fallback={fallback}>
      {children}
    </ErrorBoundaryClass>
  );
}

export default ErrorBoundary;
