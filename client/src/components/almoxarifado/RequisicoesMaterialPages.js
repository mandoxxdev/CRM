import React from 'react';
import { RequisicoesMaterialProvider } from './RequisicoesMaterialContext';
import RequisicaoForm from './RequisicaoForm';
import RequisicaoMaterialCesta from './RequisicaoMaterialCesta';
import RequisicoesList from './RequisicoesList';
import { buildModuloRequisicaoConfig, usesCestaFlow } from '../../config/requisicoesMaterialConfig';
import { useModulosTipoConfig } from '../../hooks/useModulosTipoConfig';

export function RequisicoesMaterialNovaPage({ moduloKey }) {
  const { tipoOverrides, loading } = useModulosTipoConfig();
  let config = buildModuloRequisicaoConfig(moduloKey, tipoOverrides);
  if (moduloKey === 'almoxarifado' && config) config = { ...config, warehouseMode: false };
  const CestaOuForm = !loading && usesCestaFlow(moduloKey, tipoOverrides)
    ? RequisicaoMaterialCesta
    : RequisicaoForm;

  return (
    <RequisicoesMaterialProvider override={config}>
      <CestaOuForm />
    </RequisicoesMaterialProvider>
  );
}

export function RequisicoesMaterialListaPage({ moduloKey }) {
  const { tipoOverrides } = useModulosTipoConfig();
  let config = buildModuloRequisicaoConfig(moduloKey, tipoOverrides);
  if (moduloKey === 'almoxarifado' && config) config = { ...config, warehouseMode: false };

  return (
    <RequisicoesMaterialProvider override={config}>
      <RequisicoesList />
    </RequisicoesMaterialProvider>
  );
}

export default RequisicoesMaterialListaPage;
