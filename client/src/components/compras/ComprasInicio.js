import React from 'react';
import {
  FiCheckCircle, FiShoppingCart, FiFileText, FiTruck, FiPackage, FiLayers, FiGrid, FiTag, FiClipboard, FiList,
} from 'react-icons/fi';
import api from '../../services/api';
import InicioModulo from '../InicioModulo';

/**
 * Inicio do modulo Compras (24/11/2026). Antes, abrir /compras caia numa tela em branco:
 * nao havia rota index, e o `*` rendia o componente generico sem aba escolhida. Os numeros
 * vem das listas que as proprias abas ja usam (pedidos, cotacoes, fornecedores, materiais);
 * se uma falhar, o numero fica como traco.
 */
const contar = (rota, filtro) => async () => {
  const { data } = await api.get(rota);
  const lista = Array.isArray(data) ? data : (Array.isArray(data?.itens) ? data.itens : (Array.isArray(data?.data) ? data.data : []));
  return filtro ? lista.filter(filtro).length : lista.length;
};

const ABERTO = (p) => !/^(recebid|conclu|cancel|finaliz|encerr)/i.test(String(p.status || ''));

const KPIS = [
  { chave: 'pedidos', label: 'Pedidos em aberto', carregar: contar('/compras/pedidos', ABERTO), detalhe: 'ainda não recebidos' },
  { chave: 'cotacoes', label: 'Cotações', carregar: contar('/compras/cotacoes'), detalhe: 'registradas' },
  { chave: 'fornecedores', label: 'Fornecedores', carregar: contar('/compras/fornecedores'), detalhe: 'cadastrados' },
  { chave: 'materiais', label: 'Materiais', carregar: contar('/compras/materiais'), detalhe: 'no cadastro' },
];

const ATALHOS = [
  { path: '/compras/solicitacoes', icon: FiCheckCircle, label: 'Solicitações de Compra', descricao: 'Aprovação do que os setores pediram', cor: '#0A84FF' },
  { path: '/compras/pedidos', icon: FiShoppingCart, label: 'Pedidos de Compra', descricao: 'Emitir e acompanhar pedidos', cor: '#AF52DE' },
  { path: '/compras/cotacoes', icon: FiFileText, label: 'Cotações', descricao: 'Comparar preços de fornecedores', cor: '#32ADE6' },
  { path: '/compras/fornecedores', icon: FiTruck, label: 'Fornecedores', descricao: 'Cadastro e contatos', cor: '#34C759' },
  { path: '/compras/fornecedores-homologados', icon: FiPackage, label: 'Fornecedores homologados', descricao: 'Quem fornece o quê, por grupo', cor: '#FF9500' },
  { path: '/compras/materiais', icon: FiLayers, label: 'Materiais', descricao: 'Cadastro de materiais e códigos', cor: '#FF3B30' },
  { path: '/compras/familias', icon: FiGrid, label: 'Famílias', descricao: 'Famílias e subfamílias de material', cor: '#5856D6' },
  { path: '/compras/tipos-material', icon: FiPackage, label: 'Tipos de Material', descricao: 'Tipos e suas regras', cor: '#FF2D55' },
  { path: '/compras/categorias', icon: FiTag, label: 'Categorias', descricao: 'Categorias de material', cor: '#0A84FF' },
  { path: '/compras/requisicoes-material/nova', icon: FiClipboard, label: 'Solicitar Material', descricao: 'Pedir material ao almoxarifado', cor: '#34C759' },
  { path: '/compras/requisicoes-material', icon: FiList, label: 'Minhas Requisições', descricao: 'O que você já pediu', cor: '#FF9500' },
  { path: '/almoxarifado/recebimentos', icon: FiPackage, label: 'Recebimento NF/Material', descricao: 'Dar entrada no que chegou', cor: '#AF52DE' },
];

export default function ComprasInicio() {
  return <InicioModulo titulo="Compras" subtitulo="Fornecedores, pedidos e cotações" kpis={KPIS} atalhos={ATALHOS} />;
}
