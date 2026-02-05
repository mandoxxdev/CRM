import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import AcessoNegado from './AcessoNegado';
import SplashScreen from './SplashScreen';

const ProtectedModuleRoute = ({ children, modulo, nomeModulo }) => {
  const { user } = useAuth();
  const location = useLocation();
  const [temAcesso, setTemAcesso] = useState(null); // null = verificando, true = tem acesso, false = sem acesso
  const [loading, setLoading] = useState(true);
  const [showError, setShowError] = useState(false);
  const [splashComplete, setSplashComplete] = useState(false);

  // Mapeamento de rotas para módulos
  const getModuloFromPath = (path) => {
    if (path.startsWith('/compras')) return 'compras';
    if (path.startsWith('/financeiro')) return 'financeiro';
    if (path.startsWith('/fabrica')) return 'operacional';
    if (path.startsWith('/configuracoes')) return 'administrativo';
    if (path.startsWith('/admin')) return 'admin';
    if (path.startsWith('/comercial') || path.startsWith('/comercial/clientes') || path.startsWith('/comercial/oportunidades') ||
        path.startsWith('/comercial/propostas') || path.startsWith('/comercial/produtos') || path.startsWith('/comercial/projetos') ||
        path.startsWith('/comercial/atividades') || path.startsWith('/comercial/maquinas-vendidas') ||
        path.startsWith('/comercial/custos-viagens') || path.startsWith('/comercial/relatorios')) return 'comercial';
    return null;
  };

  // Detectar módulo imediatamente
  const moduloDetectado = modulo || getModuloFromPath(location.pathname);

  // Ref para rastrear o módulo anterior
  const previousModuleRef = useRef(null);
  // Ref para rastrear se já inicializou
  const initializedRef = useRef(false);

  // Detectar mudança de módulo e resetar estados ANTES de verificar acesso
  useEffect(() => {
    const mod = modulo || getModuloFromPath(location.pathname);
    
    // Se mudou de módulo OU é a primeira vez (não inicializado), SEMPRE resetar estados e mostrar splash
    const mudouModulo = mod && (previousModuleRef.current !== mod || !initializedRef.current);
    
    if (mudouModulo) {
      // SEMPRE mostrar splash ao mudar de módulo, independente de ter permissão
      setSplashComplete(false);
      setShowError(false);
      setLoading(true); // Resetar loading para mostrar splash
      setTemAcesso(null); // Resetar acesso para verificar novamente
      previousModuleRef.current = mod;
      initializedRef.current = true;
    }
  }, [location.pathname, modulo]);

  useEffect(() => {
    const verificarAcesso = async () => {
      // Usar módulo já detectado
      const mod = modulo || getModuloFromPath(location.pathname);
      
      // Verificar se mudou de módulo (para não mostrar splash duplicado)
      const mudouModulo = mod && (previousModuleRef.current !== mod || !initializedRef.current);
      
      // Se mudou de módulo, já foi tratado no useEffect anterior
      // Continuar para verificar acesso, mas manter loading true para mostrar splash
      if (mod && previousModuleRef.current === mod && splashComplete && !mudouModulo) {
        // Se é o mesmo módulo e já completou o splash, não mostrar novamente
        // Verificar acesso rapidamente sem mostrar splash
        if (!user?.id) {
          setTemAcesso(false);
          setLoading(false);
          return;
        }
        const userRole = String(user.role || '').toLowerCase();
        if (userRole === 'admin') {
          setTemAcesso(true);
          setLoading(false);
          return;
        }
        try {
          const response = await api.get(`/usuarios/${user.id}/grupos`);
          const { permissoes } = response.data;
          let temPermissao = false;
          if (permissoes && permissoes.length > 0) {
            temPermissao = permissoes.some(perm => 
              perm.modulo === mod && perm.permissao === 1
            );
          } else {
            temPermissao = mod === 'comercial';
          }
          setTemAcesso(temPermissao);
          setLoading(false);
        } catch (error) {
          setTemAcesso(false);
          setLoading(false);
        }
        return;
      }
      
      if (!mod) {
        setTemAcesso(true);
        // Se mudou de módulo, manter loading true para mostrar splash
        if (!mudouModulo) {
          setLoading(false);
          setSplashComplete(true);
        }
        return;
      }

      if (!user?.id) {
        setTemAcesso(false);
        // Se mudou de módulo, manter loading true para mostrar splash
        if (!mudouModulo) {
          setLoading(false);
        }
        return;
      }

      // Verificar se é admin
      const userRole = String(user.role || '').toLowerCase();
      const isAdmin = userRole === 'admin';

      if (isAdmin) {
        setTemAcesso(true);
        // Se mudou de módulo, manter loading true para mostrar splash (mesmo sendo admin)
        // O loading só será setado para false quando o splash completar
        if (!mudouModulo) {
          setLoading(false);
        }
        return;
      }

      try {
        // Buscar permissões do usuário
        const response = await api.get(`/usuarios/${user.id}/grupos`);
        const { permissoes } = response.data;

        // Verificar se o usuário tem acesso ao módulo
        let temPermissao = false;

        if (permissoes && permissoes.length > 0) {
          // Verificar se há alguma permissão para este módulo
          temPermissao = permissoes.some(perm => 
            perm.modulo === mod && perm.permissao === 1
          );
        } else {
          // Se não tem permissões específicas, apenas comercial por padrão
          temPermissao = mod === 'comercial';
        }

        setTemAcesso(temPermissao);
        // Se mudou de módulo, manter loading true para mostrar splash (mesmo tendo permissão)
        // O loading só será setado para false quando o splash completar
        if (!mudouModulo) {
          setLoading(false);
        }
      } catch (error) {
        console.error('Erro ao verificar permissões:', error);
        // Em caso de erro, negar acesso por segurança
        setTemAcesso(false);
        // Se mudou de módulo, manter loading true para mostrar splash
        if (!mudouModulo) {
          setLoading(false);
        }
      }
    };

    verificarAcesso();
  }, [user, location.pathname, modulo]);

  // Esconder sidebar quando mostrar splash
  useEffect(() => {
    const shouldShowSplash = (loading && !splashComplete) || (!loading && !temAcesso && !splashComplete);
    
    if (shouldShowSplash && moduloDetectado) {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.style.display = 'none';
        sidebar.style.zIndex = '-1';
      }
      document.body.style.overflow = 'hidden';
    } else {
      // Sempre restaurar quando não deve mostrar splash
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.style.display = '';
        sidebar.style.zIndex = '';
      }
      document.body.style.overflow = '';
      document.body.classList.remove('splash-active');
    }

    return () => {
      // Garantir que a sidebar seja restaurada ao desmontar
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.style.display = '';
        sidebar.style.zIndex = '';
      }
      document.body.style.overflow = '';
      document.body.classList.remove('splash-active');
    };
  }, [loading, splashComplete, moduloDetectado, temAcesso]);

  // Handler para quando o splash completar
  const handleSplashComplete = () => {
    setSplashComplete(true);
    setLoading(false); // Setar loading como false quando o splash completar
    
    // Garantir que a sidebar seja restaurada
    setTimeout(() => {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.style.display = '';
        sidebar.style.zIndex = '';
      }
      document.body.style.overflow = '';
      document.body.classList.remove('splash-active');
    }, 100);
  };
  
  // Garantir que a sidebar seja sempre restaurada quando não há splash
  useEffect(() => {
    if (splashComplete && !loading && temAcesso) {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.style.display = '';
        sidebar.style.zIndex = '';
      }
      document.body.style.overflow = '';
      document.body.classList.remove('splash-active');
    }
  }, [splashComplete, loading, temAcesso]);

  // Só mostrar splash se:
  // 1. Ainda está verificando permissões (loading) E ainda não completou o splash
  // 2. OU se não tem acesso (para mostrar o erro)
  // Não mostrar splash se já tem acesso confirmado e não está mais carregando
  const shouldShowSplash = (loading && !splashComplete) || (!loading && !temAcesso && !splashComplete);
  
  if (shouldShowSplash) {
    // Se não conseguir detectar o módulo, tentar detectar novamente
    const modParaSplash = moduloDetectado || modulo || getModuloFromPath(location.pathname);
    
    if (!modParaSplash) {
      return (
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Carregando...</p>
        </div>
      );
    }
    
    return (
      <SplashScreen 
        module={modParaSplash} 
        onComplete={handleSplashComplete}
        showError={!loading && !temAcesso}
      />
    );
  }

  // Se não tem acesso e o splash completou, exibir AcessoNegado
  if (!temAcesso) {
    const nomesModulos = {
      'comercial': 'Comercial',
      'compras': 'Compras',
      'financeiro': 'Financeiro',
      'operacional': 'Operacional',
      'administrativo': 'Administrativo',
      'admin': 'Administração'
    };
    
    const nomeModuloExibir = nomeModulo || nomesModulos[moduloDetectado] || 'este módulo';
    
    return <AcessoNegado modulo={moduloDetectado} nomeModulo={nomeModuloExibir} />;
  }

  return <>{children}</>;
};

export default ProtectedModuleRoute;

