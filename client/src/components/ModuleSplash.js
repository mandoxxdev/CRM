import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import SplashScreen from './SplashScreen';

const ModuleSplash = ({ children }) => {
  const location = useLocation();
  const [showSplash, setShowSplash] = useState(false);
  const [currentModule, setCurrentModule] = useState(null);
  const previousModuleRef = useRef(null);
  const isInitialMount = useRef(true);

  // Esconder sidebar e garantir que splash apareça no mobile
  useEffect(() => {
    if (showSplash) {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.style.display = 'none';
        sidebar.style.zIndex = '-1';
      }
      // Garantir que body não tenha scroll no mobile
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
    } else {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.style.display = '';
        sidebar.style.zIndex = '';
      }
      // Restaurar scroll do body
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    }
    
    return () => {
      // Cleanup
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    };
  }, [showSplash]);

  // Detectar qual módulo está ativo baseado na rota
  const getModuleFromPath = (path) => {
    if (path === '/') return 'sistema'; // Tela inicial = sistema
    if (path.startsWith('/compras')) return 'compras';
    if (path.startsWith('/financeiro')) return 'financeiro';
    if (path.startsWith('/fabrica')) return 'operacional';
    if (path.startsWith('/configuracoes') || path.startsWith('/admin')) return 'administrativo';
    if (path.startsWith('/comercial') || path.startsWith('/comercial/clientes') || path.startsWith('/comercial/oportunidades') || 
        path.startsWith('/comercial/propostas') || path.startsWith('/comercial/produtos') || path.startsWith('/comercial/projetos') ||
        path.startsWith('/comercial/atividades') || path.startsWith('/comercial/relatorios')) return 'comercial';
    return null; // Não mostrar splash para rotas desconhecidas
  };

  // Verificar se a rota é protegida (ProtectedModuleRoute cuida do splash)
  const isProtectedRoute = (path) => {
    return path.startsWith('/compras') || 
           path.startsWith('/financeiro') || 
           path.startsWith('/fabrica') || 
           path.startsWith('/configuracoes') || 
           path.startsWith('/admin');
  };

  // Verificar se é a tela inicial (seleção de módulos)
  const isHomeRoute = (path) => {
    return path === '/';
  };

  useEffect(() => {
    const newModule = getModuleFromPath(location.pathname);
    
    // Se for rota protegida, não mostrar splash aqui (ProtectedModuleRoute cuida)
    if (isProtectedRoute(location.pathname)) {
      // Forçar fechar qualquer splash que esteja aberto
      setShowSplash(false);
      setCurrentModule(null);
      previousModuleRef.current = newModule;
      // Restaurar sidebar imediatamente
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.style.display = '';
        sidebar.style.zIndex = '';
      }
      return;
    }
    
    // Se for a tela inicial (seleção de módulos), mostrar splash do sistema
    if (isHomeRoute(location.pathname)) {
      // Se mudou para a tela inicial, mostrar splash do sistema
      if (previousModuleRef.current !== 'sistema') {
        setCurrentModule('sistema');
        setShowSplash(true);
        previousModuleRef.current = 'sistema';
      }
      return;
    }
    
    // Na primeira vez, apenas salvar o módulo sem mostrar splash
    if (isInitialMount.current) {
      previousModuleRef.current = newModule;
      isInitialMount.current = false;
      return;
    }

    // Mostrar splash apenas se mudou de módulo E não for rota protegida
    if (newModule && newModule !== previousModuleRef.current && !isProtectedRoute(location.pathname)) {
      setCurrentModule(newModule);
      setShowSplash(true);
      previousModuleRef.current = newModule;
    } else if (newModule === previousModuleRef.current) {
      // Se o módulo não mudou, garantir que não mostre splash
      setShowSplash(false);
    }
  }, [location.pathname]);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  // Se mostrar splash, renderizar apenas o splash (cobre tudo)
  if (showSplash && currentModule) {
    return (
      <>
        <SplashScreen onComplete={handleSplashComplete} module={currentModule} />
        {/* Renderizar children mas escondido para manter estado */}
        <div style={{ display: 'none' }}>{children}</div>
      </>
    );
  }

  return <>{children}</>;
};

export default ModuleSplash;

