import React, { createContext, useContext, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { getRequisicaoConfig, MODULOS_REQUISICAO } from '../../config/requisicoesMaterialConfig';

const RequisicoesMaterialContext = createContext(null);

export function RequisicoesMaterialProvider({ children, override }) {
  const location = useLocation();
  const value = useMemo(() => {
    if (override) return override;
    const fromPath = getRequisicaoConfig(location.pathname);
    if (fromPath) return fromPath;
    return MODULOS_REQUISICAO.almoxarifado;
  }, [location.pathname, override]);

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
