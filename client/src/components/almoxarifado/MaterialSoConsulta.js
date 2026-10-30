/**
 * Etapa 193 (RN-193.01) — os caminhos do cadastro de material no Almoxarifado depois que o cadastro passou a ser só do Compras.
 *
 *  - `/almoxarifado/materiais/ver/:id` — a ficha "Ver": o MESMO formulário, só para leitura (`ROTAS_ALMOXARIFADO_CONSULTA`).
 *  - `/almoxarifado/materiais/editar/:id` (favorito antigo, link de outra tela) — leva à ficha "Ver" do mesmo material, em
 *    vez de abrir um formulário cujo Salvar o servidor recusaria (403).
 *  - `/almoxarifado/materiais/novo` (favorito antigo, `?familia_id=` das Configurações) — leva à lista, que mostra o aviso
 *    "O cadastro de materiais é feito em Compras → Materiais.".
 * `replace` nos dois redirecionamentos: o Voltar do navegador não cai de novo no caminho antigo.
 */
import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import MaterialAlmoxarifadoForm from './MaterialAlmoxarifadoForm';
import { ROTAS_ALMOXARIFADO_CONSULTA } from './rotasCadastroMaterial';

export const MaterialVer = () => <MaterialAlmoxarifadoForm rotas={ROTAS_ALMOXARIFADO_CONSULTA} />;

export const EditarMaterialVirouVer = () => {
  const { id } = useParams();
  return <Navigate to={ROTAS_ALMOXARIFADO_CONSULTA.tela.ver(id)} replace />;
};

export const NovoMaterialVirouLista = () => <Navigate to={ROTAS_ALMOXARIFADO_CONSULTA.tela.lista} replace />;
