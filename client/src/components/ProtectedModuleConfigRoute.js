import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canConfigureModule, canAccessAdministrativoConfig } from '../utils/systemPermissions';
import { getEffectiveUser } from '../services/permissionsCache';
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
  const allowed = administrativoConfig
    ? canAccessAdministrativoConfig(effectiveUser)
    : canConfigureModule(effectiveUser, module);

  if (!allowed) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
};

export default ProtectedModuleConfigRoute;
