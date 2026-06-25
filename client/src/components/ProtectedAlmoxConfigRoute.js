import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canConfigureModule } from '../utils/systemPermissions';
import { getEffectiveUser } from '../services/permissionsCache';
import { RouteLoading } from './LazyPage';

const ProtectedAlmoxConfigRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <RouteLoading module="almoxarifado" />;
  }

  if (!canConfigureModule(getEffectiveUser(user), 'almoxarifado')) {
    return <Navigate to="/almoxarifado" replace />;
  }

  return children;
};

export default ProtectedAlmoxConfigRoute;
