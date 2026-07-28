import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canConfigureModule, canAccessAdministrativoConfig } from '../utils/systemPermissions';
import { getEffectiveUser, getCachedUserPermissions, hasModuleAccess } from '../services/permissionsCache';
import { RouteLoading } from './LazyPage';

const ProtectedModuleConfigRoute = ({
  module,
  administrativoConfig = false,
  children,
  redirectTo = '/',
}) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <RouteLoading module={module || 'config'} />;
  }

  const effectiveUser = getEffectiveUser(user);
  // A tela de configurações É o conteúdo do módulo Administrativo: quem recebeu a
  // PERMISSÃO do módulo no painel Admin também entra (senão a concessão não servia para
  // nada — o usuário passava pelo portão do módulo e era devolvido para a seleção).
  // O cache já foi populado pelo ProtectedModuleRoute que envolve esta rota.
  const cached = administrativoConfig && effectiveUser?.id ? getCachedUserPermissions(effectiveUser.id) : null;
  const allowed = administrativoConfig
    ? (canAccessAdministrativoConfig(effectiveUser)
        || (cached ? hasModuleAccess(cached.permissoes, 'administrativo', effectiveUser) : false))
    : canConfigureModule(effectiveUser, module);

  if (!allowed) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
};

export default ProtectedModuleConfigRoute;
