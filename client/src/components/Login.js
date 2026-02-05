import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FiMail, FiLock, FiLogIn, FiAlertCircle } from 'react-icons/fi';
import './Login.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Desativar scroll do body quando o componente montar
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    // Reativar scroll quando o componente desmontar
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, senha);

    if (result.success) {
      navigate('/');
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-background">
        <div className="login-shapes">
          <div className="shape shape-1"></div>
          <div className="shape shape-2"></div>
          <div className="shape shape-3"></div>
          <div className="shape shape-4"></div>
        </div>
        <div className="spinning-bars">
          <div className="spinning-bar bar-1"></div>
          <div className="spinning-bar bar-2"></div>
          <div className="spinning-bar bar-3"></div>
          <div className="spinning-bar bar-4"></div>
        </div>
        <div className="handshake-background">
          <svg viewBox="0 0 800 600" className="handshake-svg">
            {/* Mão esquerda */}
            <g className="hand-left">
              <path d="M 150 300 Q 120 280 100 300 Q 90 310 100 320 Q 110 330 120 320 Q 130 310 140 320 Q 150 330 160 320 Q 170 310 180 320 Q 190 330 200 320 Q 210 310 220 300 Q 230 290 240 300 Q 250 310 260 300 Q 270 290 280 300 Q 290 310 300 300 Q 310 290 320 300" 
                    stroke="rgba(255, 255, 255, 0.15)" 
                    strokeWidth="2" 
                    fill="none" 
                    strokeLinecap="round"/>
              <path d="M 150 300 Q 140 280 130 270 Q 120 260 130 250 Q 140 240 150 250 Q 160 260 170 250 Q 180 240 190 250" 
                    stroke="rgba(255, 255, 255, 0.12)" 
                    strokeWidth="1.5" 
                    fill="none"/>
              <circle cx="100" cy="320" r="3" fill="rgba(255, 255, 255, 0.2)"/>
              <circle cx="140" cy="320" r="3" fill="rgba(255, 255, 255, 0.2)"/>
              <circle cx="180" cy="320" r="3" fill="rgba(255, 255, 255, 0.2)"/>
              <circle cx="220" cy="300" r="3" fill="rgba(255, 255, 255, 0.2)"/>
            </g>
            {/* Mão direita */}
            <g className="hand-right">
              <path d="M 650 300 Q 680 280 700 300 Q 710 310 700 320 Q 690 330 680 320 Q 670 310 660 320 Q 650 330 640 320 Q 630 310 620 320 Q 610 330 600 320 Q 590 310 580 320 Q 570 330 560 320 Q 550 310 540 300 Q 530 290 520 300 Q 510 310 500 300 Q 490 290 480 300 Q 470 310 460 300 Q 450 290 440 300" 
                    stroke="rgba(255, 255, 255, 0.15)" 
                    strokeWidth="2" 
                    fill="none" 
                    strokeLinecap="round"/>
              <path d="M 650 300 Q 660 280 670 270 Q 680 260 670 250 Q 660 240 650 250 Q 640 260 630 250 Q 620 240 610 250" 
                    stroke="rgba(255, 255, 255, 0.12)" 
                    strokeWidth="1.5" 
                    fill="none"/>
              <circle cx="700" cy="320" r="3" fill="rgba(255, 255, 255, 0.2)"/>
              <circle cx="660" cy="320" r="3" fill="rgba(255, 255, 255, 0.2)"/>
              <circle cx="620" cy="320" r="3" fill="rgba(255, 255, 255, 0.2)"/>
              <circle cx="580" cy="300" r="3" fill="rgba(255, 255, 255, 0.2)"/>
            </g>
            {/* Conexões entre as mãos */}
            <g className="connections">
              <line x1="320" y1="300" x2="440" y2="300" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1" strokeDasharray="3,3"/>
              <line x1="300" y1="310" x2="460" y2="310" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" strokeDasharray="2,4"/>
              <line x1="280" y1="320" x2="480" y2="320" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1" strokeDasharray="3,3"/>
            </g>
            {/* Pontos de conexão */}
            <g className="connection-points">
              <circle cx="380" cy="300" r="4" fill="rgba(255, 255, 255, 0.15)"/>
              <circle cx="400" cy="310" r="3" fill="rgba(255, 255, 255, 0.12)"/>
              <circle cx="380" cy="320" r="4" fill="rgba(255, 255, 255, 0.15)"/>
            </g>
          </svg>
        </div>
      </div>
      <div className="login-box">
        <div className="login-header">
          <div className="logo-container">
            <img src="/logo.png" alt="GMP INDUSTRIAIS" className="login-logo" />
          </div>
          <div className="login-header-content">
            <h1>GMP INDUSTRIAIS</h1>
            <h2>CRM - Sistema de Gestão</h2>
            <p className="login-subtitle">Acesse sua conta para continuar</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="error-message">
              <FiAlertCircle />
              <span>{error}</span>
            </div>
          )}
          <div className="form-group">
            <label htmlFor="email">E-mail</label>
            <div className="input-wrapper input-wrapper-email">
              <FiMail className="input-icon input-icon-email" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                autoComplete="email"
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="senha">Senha</label>
            <div className="input-wrapper input-wrapper-password">
              <FiLock className="input-icon input-icon-password" />
              <input
                id="senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
          </div>
          <button type="submit" disabled={loading} className="login-button">
            {loading ? (
              <>
                <span className="button-spinner"></span>
                Entrando...
              </>
            ) : (
              <>
                <FiLogIn />
                Entrar
              </>
            )}
          </button>
        </form>
        <div className="login-footer">
          <p>© 2026 GMP INDUSTRIAIS - Todos os direitos reservados</p>
        </div>
      </div>
    </div>
  );
};

export default Login;



