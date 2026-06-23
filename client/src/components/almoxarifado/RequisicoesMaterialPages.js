import React from 'react';
import { RequisicoesMaterialProvider } from './RequisicoesMaterialContext';
import RequisicaoForm from './RequisicaoForm';
import RequisicoesList from './RequisicoesList';
import { MODULOS_REQUISICAO } from '../../config/requisicoesMaterialConfig';

export function RequisicoesMaterialNovaPage({ moduloKey }) {
  const config = { ...MODULOS_REQUISICAO[moduloKey] };
  if (moduloKey === 'almoxarifado') config.warehouseMode = false;
  return (
    <RequisicoesMaterialProvider override={config}>
      <RequisicaoForm />
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
