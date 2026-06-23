import React, { createContext, useContext, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  getRequisicaoConfig,
  getModuloFromPath,
  MODULOS_REQUISICAO,
  applyTipoOverridesToConfig,
} from '../../config/requisicoesMaterialConfig';
import { useModulosTipoConfig } from '../../hooks/useModulosTipoConfig';

const RequisicoesMaterialContext = createContext(null);

export function RequisicoesMaterialProvider({ children, override }) {
  const location = useLocation();
  const { tipoOverrides, loading } = useModulosTipoConfig();

  const value = useMemo(() => {
    let base = override;
    if (!base) {
      base = getRequisicaoConfig(location.pathname);
    }
    if (!base) base = MODULOS_REQUISICAO.almoxarifado;

    if (loading) return base;
    return applyTipoOverridesToConfig(base, tipoOverrides);
  }, [location.pathname, override, tipoOverrides, loading]);

  return (
    <RequisicoesMaterialContext.Provider value={value}>
      {children}
    </RequisicoesMaterialContext.Provider>
  );
}

export function useRequisicoesMaterialContext() {
  return useContext(RequisicoesMaterialContext) || MODULOS_REQUISICAO.almoxarifado;
}

export default RequisicoesMaterialContext;
