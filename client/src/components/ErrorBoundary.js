import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('❌ ERRO CAPTURADO PELO ERRORBOUNDARY:', error);
    console.error('Error Info:', errorInfo);
    console.error('Stack:', error.stack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          textAlign: 'center',
          backgroundColor: '#f8fafc',
          color: '#1e293b'
        }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#f44336' }}>
            Oops! Algo deu errado
          </h1>
          <p style={{ marginBottom: '2rem', color: '#64748b' }}>
            Ocorreu um erro ao carregar a aplicação.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: '12px 24px',
              backgroundColor: '#0066cc',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 600
            }}
          >
            Recarregar Página
          </button>
          {this.state.error && (
            <details style={{ marginTop: '2rem', textAlign: 'left', maxWidth: '600px' }}>
              <summary style={{ cursor: 'pointer', marginBottom: '1rem' }}>
                Detalhes do erro
              </summary>
              <pre style={{
                backgroundColor: '#1e293b',
                color: '#f1f5f9',
                padding: '1rem',
                borderRadius: '8px',
                overflow: 'auto',
                fontSize: '12px'
              }}>
                {this.state.error.toString()}
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

