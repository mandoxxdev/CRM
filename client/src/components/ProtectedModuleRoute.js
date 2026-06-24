import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchUserPermissions,
  getCachedUserPermissions,
  hasModuleAccess,
} from '../services/permissionsCache';
import AcessoNegado from './AcessoNegado';
import SplashScreen from './SplashScreen';
import { RouteLoading } from './LazyPage';

const lastModuleSplashRef = { module: null, at: 0 };
const activeModuleSessionRef = { current: null };

export function resetModuleSplashSession() {
  lastModuleSplashRef.module = null;
  lastModuleSplashRef.at = 0;
  activeModuleSessionRef.current = null;
}

const ProtectedModuleRoute = ({ children, modulo, nomeModulo }) => {
  const { user } = useAuth();
  const location = useLocation();
  const [temAcesso, setTemAcesso] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showError, setShowError] = useState(false);

  const getModuloFromPath = (path) => {
    if (path.startsWith('/compras')) return 'compras';
    if (path.startsWith('/financeiro')) return 'financeiro';
    if (path.startsWith('/fabrica')) return 'operacional';
    if (path.startsWith('/configuracoes')) return 'administrativo';
    if (path.startsWith('/admin')) return 'admin';
    if (path.startsWith('/engenharia-projetos')) return 'engenharia_projetos';
    if (path.startsWith('/engenharia')) return 'engenharia';
    if (path.startsWith('/almoxarifado')) return 'almoxarifado';
    if (path.startsWith('/frota')) return 'comercial';
    if (path.startsWith('/comercial')) return 'comercial';
    return null;
  };

  const moduloDetectado = modulo || getModuloFromPath(location.pathname);
  const previousModuleRef = useRef(null);

  const [splashComplete, setSplashComplete] = useState(() => {
    if (!moduloDetectado) return true;
    return activeModuleSessionRef.current === moduloDetectado;
  });

  useEffect(() => {
    try {
      sessionStorage.removeItem('orion_skip_module_splash');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const mod = moduloDetectado;
    if (!mod) return;

    const mudouModulo = previousModuleRef.current !== mod;
    previousModuleRef.current = mod;

    setShowError(false);

    const alreadyInModule = activeModuleSessionRef.current === mod;
    const recentSplash =
      lastModuleSplashRef.module === mod &&
      Date.now() - lastModuleSplashRef.at < 4000;

    if (alreadyInModule || recentSplash) {
      setSplashComplete(true);
      return;
    }

    if (mudouModulo) {
      setSplashComplete(false);
      setLoading(true);
      setTemAcesso(null);
    }
  }, [location.pathname, moduloDetectado]);

  useEffect(() => {
    const modFromPath = getModuloFromPath(location.pathname);
    if (activeModuleSessionRef.current && modFromPath !== activeModuleSessionRef.current) {
      activeModuleSessionRef.current = null;
    }
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;

    const verificarAcesso = async () => {
      const mod = moduloDetectado;

      if (!mod) {
        if (!cancelled) {
          setTemAcesso(true);
          setLoading(false);
          setSplashComplete(true);
        }
        return;
      }

      if (!user?.id) {
        if (!cancelled) {
          setTemAcesso(false);
          setLoading(false);
        }
        return;
      }

      const userRole = String(user.role || '').toLowerCase();
      if (userRole === 'admin') {
        if (!cancelled) {
          setTemAcesso(true);
          setLoading(false);
        }
        return;
      }

      const cached = getCachedUserPermissions(user.id);
      if (cached) {
        const permitido = hasModuleAccess(cached.permissoes, mod, userRole);
        if (!cancelled) {
          setTemAcesso(permitido);
          setLoading(false);
        }
        return;
      }

      try {
        const { permissoes } = await fetchUserPermissions(user.id);
        if (!cancelled) {
          const permitido = hasModuleAccess(permissoes, mod, userRole);
          setTemAcesso(permitido);
          setLoading(false);
        }
      } catch (error) {
        console.error('Erro ao verificar permissões:', error);
        if (!cancelled) {
          setTemAcesso(false);
          setLoading(false);
        }
      }
    };

    verificarAcesso();

    return () => {
      cancelled = true;
    };
  }, [user, moduloDetectado]);

  useEffect(() => {
    const shouldShowSplash = Boolean(moduloDetectado) && !splashComplete;

    if (shouldShowSplash) {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.style.display = 'none';
        sidebar.style.zIndex = '-1';
      }
      document.body.style.overflow = 'hidden';
    } else {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.style.display = '';
        sidebar.style.zIndex = '';
      }
      document.body.style.overflow = '';
      document.body.classList.remove('splash-active');
    }

    return () => {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.style.display = '';
        sidebar.style.zIndex = '';
      }
      document.body.style.overflow = '';
      document.body.classList.remove('splash-active');
    };
  }, [loading, splashComplete, moduloDetectado, temAcesso]);

  const handleSplashComplete = () => {
    if (moduloDetectado) {
      lastModuleSplashRef.module = moduloDetectado;
      lastModuleSplashRef.at = Date.now();
      activeModuleSessionRef.current = moduloDetectado;
    }
    setSplashComplete(true);

    setTimeout(() => {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.style.display = '';
        sidebar.style.zIndex = '';
      }
      document.body.style.overflow = '';
      document.body.classList.remove('splash-active');
    }, 80);
  };

  const shouldShowSplash = Boolean(moduloDetectado) && !splashComplete;

  if (shouldShowSplash) {
    const modParaSplash = moduloDetectado || modulo || getModuloFromPath(location.pathname);

    if (!modParaSplash) {
      return null;
    }

    return (
      <SplashScreen
        key={modParaSplash}
        module={modParaSplash}
        onComplete={handleSplashComplete}
        showError={!loading && temAcesso === false}
        ready={!loading && temAcesso !== null}
      />
    );
  }

  if (temAcesso === null) {
    return <RouteLoading module={moduloDetectado || 'sistema'} />;
  }

  if (temAcesso === false) {
    const nomesModulos = {
      comercial: 'Comercial',
      compras: 'Compras',
      financeiro: 'Financeiro',
      operacional: 'Operacional',
      engenharia: 'Cálculos de Engenharia',
      engenharia_projetos: 'Engenharia / Projetos',
      almoxarifado: 'Almoxarifado',
      administrativo: 'Administrativo',
      admin: 'Administração',
    };

    const nomeModuloExibir = nomeModulo || nomesModulos[moduloDetectado] || 'este módulo';
    return <AcessoNegado modulo={moduloDetectado} nomeModulo={nomeModuloExibir} />;
  }

  return <>{children}</>;
};

export default ProtectedModuleRoute;
