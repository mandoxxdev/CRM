import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FiZap, FiTrendingUp, FiShoppingCart, FiDollarSign, 
  FiBriefcase, FiSettings, FiTarget, FiTool, FiX, FiShield, FiArchive, FiSliders
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
  },
  engenharia: {
    icon: FiSliders,
    title: 'CÁLCULOS DE ENGENHARIA',
    subtitle: 'Tampo, pressão e dimensionamento',
    loadingText: 'Carregando módulo de engenharia...',
    gradientColors: ['rgba(180, 83, 9, 0.15)', 'rgba(234, 88, 12, 0.1)', 'rgba(180, 83, 9, 0.15)'],
    accentColor: '#ea580c'
  },
  engenharia_projetos: {
    icon: FiBriefcase,
    title: 'ENGENHARIA / PROJETOS',
    subtitle: 'Solicitações e cadastros',
    loadingText: 'Carregando módulo de projetos...',
    gradientColors: ['rgba(55, 48, 163, 0.15)', 'rgba(99, 102, 241, 0.1)', 'rgba(55, 48, 163, 0.15)'],
    accentColor: '#6366f1'
  },
  almoxarifado: {
    icon: FiArchive,
    title: 'ALMOXARIFADO',
    subtitle: 'Materiais, estoque, requisições e conferências',
    loadingText: 'Carregando módulo de almoxarifado...',
    gradientColors: ['rgba(120, 53, 15, 0.15)', 'rgba(161, 98, 7, 0.1)', 'rgba(120, 53, 15, 0.15)'],
    accentColor: '#a16207'
  },
  frota: {
    icon: FiTool,
    title: 'GESTÃO DE FROTA',
    subtitle: 'Veículos, manutenções, combustível e documentação',
    loadingText: 'Carregando módulo de frota...',
    gradientColors: ['rgba(234, 88, 12, 0.15)', 'rgba(185, 28, 28, 0.1)', 'rgba(234, 88, 12, 0.15)'],
    accentColor: '#ea580c'
  }
};

const SPLASH_MIN_MS = 900;
const SPLASH_MAX_MS = 2000;

const SplashScreen = ({
  onComplete,
  module = 'sistema',
  showError = false,
  ready = false,
  minDuration = SPLASH_MIN_MS,
  maxDuration = SPLASH_MAX_MS,
}) => {
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);
  const readyRef = useRef(ready);
  const completedRef = useRef(false);
  const progressRef = useRef(0);

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  // Acesso negado: levar a barra a 100% para disparar a exibição do X vermelho.
  // Sem isto a animação travava em 95% (cap do estado "ready") e o erro nunca aparecia.
  useEffect(() => {
    if (showError) {
      progressRef.current = 100;
      setProgress(100);
    }
  }, [showError]);

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

  // Verificar se deve mostrar erro quando showError mudar ou progresso chegar a 100%
  useEffect(() => {
    if (showError && progress >= 100 && !errorVisible) {
      setErrorVisible(true);
      // Após mostrar o erro por 2 segundos, chamar onComplete
      setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => {
          onComplete();
        }, 600);
      }, 2000);
    }
  }, [showError, progress, errorVisible, onComplete]);

  const finishSplash = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setProgress(100);
    setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => {
        onComplete();
      }, 320);
    }, 120);
  }, [onComplete]);

  useEffect(() => {
    if (errorVisible) {
      return undefined;
    }

    const startTime = performance.now();
    const updateInterval = 16;
    progressRef.current = 0;

    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const timeProgress = Math.min((elapsed / maxDuration) * 100, 100);
      const targetProgress = readyRef.current
        ? Math.min(95, (elapsed / minDuration) * 95)
        : Math.min(90, timeProgress);
      const easedProgress = Math.max(progressRef.current, targetProgress);
      progressRef.current = easedProgress;

      setProgress(Math.round(easedProgress * 100) / 100);

      const canFinish = elapsed >= minDuration && (readyRef.current || elapsed >= maxDuration);
      if (canFinish) {
        clearInterval(interval);
        if (!showError) {
          finishSplash();
        }
      }
    }, updateInterval);

    return () => clearInterval(interval);
  }, [showError, errorVisible, minDuration, maxDuration, finishSplash]);

  // Se fadeOut, não renderizar nada
  if (fadeOut) {
    return null;
  }

  return (
    <div 
      className={`splash-screen premium-splash splash-module-${module} ${fadeOut ? 'fade-out' : ''}`}
      data-module={module}
    >
      {/* Fundo animado do software - COM MUITO MAIS LINHAS */}
      <div className="splash-background-wrapper">
        <AnimatedBackground nodeCount={48} connectionDistance={180} />
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

