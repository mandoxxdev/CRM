import React, { useState, useEffect, useCallback } from 'react';
import { 
  FiZap, FiTrendingUp, FiShoppingCart, FiDollarSign, 
  FiBriefcase, FiSettings, FiTarget, FiTool, FiX, FiShield
} from 'react-icons/fi';
import AnimatedBackground from './AnimatedBackground';
import './SplashScreen.css';

// Configurações de design para cada módulo
const moduleConfigs = {
  sistema: {
    icon: FiZap,
    title: 'SISTEMA GMP',
    subtitle: 'Gestão Integrada de Módulos',
    loadingText: 'Carregando Sistema GMP...',
    gradientColors: ['rgba(255, 152, 0, 0.15)', 'rgba(255, 193, 7, 0.1)', 'rgba(255, 152, 0, 0.15)'],
    accentColor: '#ff9800'
  },
  comercial: {
    icon: FiTarget,
    title: 'CRM GMP INDUSTRIAIS',
    subtitle: 'Gestão Inteligente de Relacionamento',
    loadingText: 'Carregando módulo comercial...',
    gradientColors: ['rgba(0, 102, 204, 0.15)', 'rgba(0, 200, 83, 0.1)', 'rgba(0, 102, 204, 0.15)'],
    accentColor: '#0066cc'
  },
  compras: {
    icon: FiShoppingCart,
    title: 'MÓDULO DE COMPRAS',
    subtitle: 'Gestão de Fornecedores e Pedidos',
    loadingText: 'Carregando módulo de compras...',
    gradientColors: ['rgba(255, 152, 0, 0.15)', 'rgba(255, 193, 7, 0.1)', 'rgba(255, 152, 0, 0.15)'],
    accentColor: '#ff9800'
  },
  financeiro: {
    icon: FiDollarSign,
    title: 'MÓDULO FINANCEIRO',
    subtitle: 'Contas a Pagar, Receber e Fluxo de Caixa',
    loadingText: 'Carregando módulo financeiro...',
    gradientColors: ['rgba(76, 175, 80, 0.15)', 'rgba(139, 195, 74, 0.1)', 'rgba(76, 175, 80, 0.15)'],
    accentColor: '#4caf50'
  },
  operacional: {
    icon: FiTool,
    title: 'MÓDULO OPERACIONAL',
    subtitle: 'Controle de Fábrica, OS e Produção',
    loadingText: 'Carregando módulo operacional...',
    gradientColors: ['rgba(156, 39, 176, 0.15)', 'rgba(171, 71, 188, 0.1)', 'rgba(156, 39, 176, 0.15)'],
    accentColor: '#9c27b0'
  },
  administrativo: {
    icon: FiSettings,
    title: 'MÓDULO ADMINISTRATIVO',
    subtitle: 'Configurações e Gestão do Sistema',
    loadingText: 'Carregando módulo administrativo...',
    gradientColors: ['rgba(158, 158, 158, 0.15)', 'rgba(189, 189, 189, 0.1)', 'rgba(158, 158, 158, 0.15)'],
    accentColor: '#9e9e9e'
  },
  admin: {
    icon: FiShield,
    title: 'MÓDULO ADMIN',
    subtitle: 'Gestão de Usuários e Permissões',
    loadingText: 'Carregando módulo de administração...',
    gradientColors: ['rgba(33, 150, 243, 0.15)', 'rgba(63, 81, 181, 0.1)', 'rgba(33, 150, 243, 0.15)'],
    accentColor: '#2196f3'
  }
};

const SplashScreen = ({ onComplete, module = 'sistema', showError = false }) => {
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);
  
  // Obter configuração do módulo ou usar padrão
  const config = moduleConfigs[module] || moduleConfigs.sistema;
  const IconComponent = config.icon;

  // Esconder sidebar quando splash estiver ativo
  useEffect(() => {
    // Adicionar classe ao body para CSS poder esconder sidebar
    document.body.classList.add('splash-active');
    
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.style.display = 'none';
      sidebar.style.zIndex = '-1';
    }
    document.body.style.overflow = 'hidden';

    return () => {
      // Remover classe do body
      document.body.classList.remove('splash-active');
      
      // Sempre restaurar a sidebar quando o componente desmontar
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.style.display = '';
        sidebar.style.zIndex = '';
      }
      document.body.style.overflow = '';
    };
  }, []);

  // Limpar splash do body de forma síncrona antes de onComplete (evita tela branca ao montar Layout)
  const completeSplash = useCallback(() => {
    document.body.classList.remove('splash-active');
    document.body.style.overflow = '';
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.style.display = '';
      sidebar.style.zIndex = '';
    }
    onComplete();
  }, [onComplete]);

  // Verificar se deve mostrar erro quando showError mudar ou progresso chegar a 100%
  useEffect(() => {
    if (showError && progress >= 100 && !errorVisible) {
      setErrorVisible(true);
      // Após mostrar o erro por 2 segundos, chamar onComplete
      setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => completeSplash(), 600);
      }, 2000);
    }
  }, [showError, progress, errorVisible, onComplete, completeSplash]);

  useEffect(() => {
    // Se já mostrou erro, não fazer nada
    if (errorVisible) {
      return;
    }

    // Carregamento de 5 segundos com progresso sincronizado
    const duration = 5000; // 5 segundos
    const startTime = performance.now();
    const updateInterval = 16; // ~60fps para animação suave
    
    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const newProgress = Math.min(Math.max(0, (elapsed / duration) * 100), 100);
      
      // Atualizar progresso com valor arredondado para 2 casas decimais
      setProgress(Math.round(newProgress * 100) / 100);
      
      if (newProgress >= 100) {
        clearInterval(interval);
        // Garantir que fique em 100% antes de fechar
        setProgress(100);
        
        // Se não deve mostrar erro, fechar normalmente
        if (!showError) {
          setTimeout(() => {
            setFadeOut(true);
            setTimeout(() => completeSplash(), 600);
          }, 300);
        }
        // Se deve mostrar erro, o useEffect acima vai tratar
      }
    }, updateInterval);

    return () => clearInterval(interval);
  }, [onComplete, showError, errorVisible, completeSplash]);

  // Se fadeOut, manter overlay com fundo do app para evitar tela branca até onComplete
  if (fadeOut) {
    return (
      <div
        className="splash-screen premium-splash splash-fade-out-cover"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          background: 'var(--gmp-bg)',
          zIndex: 9999999,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <div 
      className={`splash-screen premium-splash splash-module-${module} ${fadeOut ? 'fade-out' : ''}`}
      data-module={module}
    >
      {/* Fundo animado do software - COM MUITO MAIS LINHAS */}
      <div className="splash-background-wrapper">
        <AnimatedBackground nodeCount={150} connectionDistance={250} />
        <div 
          className="splash-background-overlay"
          style={{
            background: `linear-gradient(135deg, ${config.gradientColors.join(', ')})`
          }}
        ></div>
      </div>

      {/* Conteúdo principal */}
      <div className="splash-content premium-splash-content">
        <div className="splash-logo-container">
          <div className="splash-logo premium-logo">
            <div 
              className="splash-logo-glow"
              style={{ 
                boxShadow: `0 0 40px ${config.accentColor}40, 0 0 80px ${config.accentColor}20` 
              }}
            ></div>
            <img src="/logo.png" alt="GMP INDUSTRIAIS" />
          </div>
          <div 
            className="splash-icon premium-icon-rotate"
            style={{ color: config.accentColor }}
          >
            <IconComponent />
          </div>
        </div>
        
        <div className="splash-text-container">
          <h1 
            className="splash-title premium-title"
            style={{ 
              background: `linear-gradient(135deg, ${config.accentColor}, ${config.accentColor}dd)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}
          >
            {config.title}
          </h1>
          <p className="splash-subtitle premium-subtitle">{config.subtitle}</p>
        </div>

        <div className="splash-progress premium-progress">
          <div className="splash-progress-bar premium-progress-bar">
            <div 
              className="splash-progress-fill premium-progress-fill" 
              style={{ 
                width: `${Math.min(100, Math.max(0, progress))}%`,
                background: errorVisible 
                  ? 'linear-gradient(90deg, #e74c3c, #c0392b)' 
                  : `linear-gradient(90deg, ${config.accentColor}, ${config.accentColor}dd)`,
                transition: 'none' // Garantir atualização instantânea
              }}
            >
              <div className="progress-shine"></div>
            </div>
          </div>
          <div className="splash-progress-info">
            <span className="splash-progress-text">{Math.round(progress)}%</span>
            <span className="splash-progress-label">
              {errorVisible ? 'Acesso negado' : config.loadingText}
            </span>
          </div>
        </div>

        {/* X vermelho grande quando erro */}
        {errorVisible && (
          <div className="splash-error-icon">
            <FiX />
          </div>
        )}
      </div>

      {/* Efeito de brilho decorativo */}
      <div className="splash-glow-effects">
        <div 
          className="glow-circle glow-1"
          style={{ 
            background: `radial-gradient(circle, ${config.accentColor}30, transparent 70%)` 
          }}
        ></div>
        <div 
          className="glow-circle glow-2"
          style={{ 
            background: `radial-gradient(circle, ${config.accentColor}20, transparent 70%)` 
          }}
        ></div>
        <div 
          className="glow-circle glow-3"
          style={{ 
            background: `radial-gradient(circle, ${config.accentColor}15, transparent 70%)` 
          }}
        ></div>
      </div>
    </div>
  );
};

export default SplashScreen;

