import React from 'react';
import { RequisicoesMaterialProvider } from './RequisicoesMaterialContext';
import RequisicaoForm from './RequisicaoForm';
import RequisicaoMaterialCesta from './RequisicaoMaterialCesta';
import RequisicoesList from './RequisicoesList';
import { MODULOS_REQUISICAO, usesCestaFlow } from '../../config/requisicoesMaterialConfig';

export function RequisicoesMaterialNovaPage({ moduloKey }) {
  const config = { ...MODULOS_REQUISICAO[moduloKey] };
  if (moduloKey === 'almoxarifado') config.warehouseMode = false;
  const CestaOuForm = usesCestaFlow(moduloKey) ? RequisicaoMaterialCesta : RequisicaoForm;
  return (
    <RequisicoesMaterialProvider override={config}>
      <CestaOuForm />
    </RequisicoesMaterialProvider>
  );
}

export function RequisicoesMaterialListaPage({ moduloKey }) {
  const config = { ...MODULOS_REQUISICAO[moduloKey] };
  if (moduloKey === 'almoxarifado') config.warehouseMode = false;
  return (
    <RequisicoesMaterialProvider override={config}>
      <RequisicoesList />
    </RequisicoesMaterialProvider>
  );
}

export default RequisicoesMaterialListaPage;
