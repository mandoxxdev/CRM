import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchUserPermissions,
  getCachedUserPermissions,
  hasModuleAccess,
} from '../services/permissionsCache';
import { bypassModuleRestrictions } from '../utils/systemPermissions';
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

function getModuloFromPath(path) {
  if (path.startsWith('/compras')) return 'compras';
  if (path.startsWith('/financeiro')) return 'financeiro';
  if (path.startsWith('/fabrica')) return 'operacional';
  if (path.startsWith('/configuracoes')) return 'administrativo';
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/engenharia-projetos')) return 'engenharia_projetos';
  if (path.startsWith('/engenharia')) return 'engenharia';
  if (path.startsWith('/almoxarifado')) return 'almoxarifado';
  if (path.startsWith('/frota')) return 'frota';
  if (path.startsWith('/comercial')) return 'comercial';
  return null;
}

function resolveAccessSync(user, mod) {
  if (!mod) return true;
  if (!user?.id) return false;
  if (bypassModuleRestrictions(user)) return true;
  const cached = getCachedUserPermissions(user.id);
  if (cached) {
    return hasModuleAccess(cached.permissoes, mod, user);
  }
  return null;
}

const ProtectedModuleRoute = ({ children, modulo, nomeModulo }) => {
  const { user } = useAuth();
  const location = useLocation();
  const moduloDetectado = modulo || getModuloFromPath(location.pathname);
  const sessionActive = activeModuleSessionRef.current === moduloDetectado;

  const [temAcesso, setTemAcesso] = useState(() => resolveAccessSync(user, moduloDetectado));
  const [loading, setLoading] = useState(() => resolveAccessSync(user, moduloDetectado) === null);
  const [showError, setShowError] = useState(false);
  const [splashComplete, setSplashComplete] = useState(() => {
    if (!moduloDetectado) return true;
    return sessionActive || lastModuleSplashRef.module === moduloDetectado;
  });

  const enteredModuleRef = useRef(moduloDetectado);

  useEffect(() => {
    const modFromPath = getModuloFromPath(location.pathname);
    if (activeModuleSessionRef.current && modFromPath !== activeModuleSessionRef.current) {
      activeModuleSessionRef.current = null;
    }
  }, [location.pathname]);

  useEffect(() => {
    const mod = moduloDetectado;
    if (!mod) {
      setSplashComplete(true);
      return;
    }

    const isSubRouteWithinModule =
      enteredModuleRef.current === mod && activeModuleSessionRef.current === mod;

    if (isSubRouteWithinModule || activeModuleSessionRef.current === mod || lastModuleSplashRef.module === mod) {
      setSplashComplete(true);
      setShowError(false);
      return;
    }

    if (enteredModuleRef.current !== mod) {
      enteredModuleRef.current = mod;
      setSplashComplete(false);
      setLoading(true);
      const cachedAccess = resolveAccessSync(user, mod);
      if (cachedAccess === null) {
        setTemAcesso(null);
      }
    }
  }, [location.pathname, moduloDetectado, user]);

  useEffect(() => {
    let cancelled = false;

    const verificarAcesso = async () => {
      const mod = moduloDetectado;

      if (!mod) {
        if (!cancelled) {
          setTemAcesso(true);
          setLoading(false);
        }
        return;
      }

      const syncAccess = resolveAccessSync(user, mod);
      if (syncAccess !== null) {
        if (!cancelled) {
          setTemAcesso(syncAccess);
          setLoading(false);
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

      try {
        const { permissoes } = await fetchUserPermissions(user.id);
        if (!cancelled) {
          setTemAcesso(hasModuleAccess(permissoes, mod, user));
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
  }, [splashComplete, moduloDetectado]);

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

    const preloadChildren = temAcesso === true;

    return (
      <>
        <SplashScreen
          key={modParaSplash}
          module={modParaSplash}
          onComplete={handleSplashComplete}
          showError={!loading && temAcesso === false}
          ready={!loading && temAcesso !== null}
        />
        {preloadChildren && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              width: 0,
              height: 0,
              overflow: 'hidden',
              visibility: 'hidden',
              pointerEvents: 'none',
            }}
          >
            {children}
          </div>
        )}
      </>
    );
  }

  if (temAcesso === null && loading && !sessionActive) {
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
      frota: 'Frota',
      administrativo: 'Administrativo',
      admin: 'Administração',
    };

    const nomeModuloExibir = nomeModulo || nomesModulos[moduloDetectado] || 'este módulo';
    return <AcessoNegado modulo={moduloDetectado} nomeModulo={nomeModuloExibir} />;
  }

  return <>{children}</>;
};

export default ProtectedModuleRoute;
