/**
 * Etapa 260 (item 1) — RN-260.02, B1610: a lista de materiais (Compras e Almoxarifado, a mesma tabela) mostra abaixo do nome os
 * fornecedores da seção Fornecedores do material, e não mais o texto antigo do Fornecedor Principal — que só aparece, marcado como
 * antigo, quando o material não tem nenhum fornecedor vinculado. E as duas telas mandam a busca para o servidor (que acha pelo
 * fornecedor, RN-260.01).
 *
 * Plano: docs/superpowers/plans/2026-11-23-almoxarifado-etapa260-fornecedores-na-busca-projeto-e-fila-agrupada.md
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/TabelaMateriaisFornecedores --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TabelaMateriais, FiltrosMateriais, textoFornecedores } from './TabelaMateriais';

let container;
let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const mat = (over) => ({ id: 1, codigo: 'CHP-001', nome: 'Chapa inox', unidade: 'KG', quantidade_atual: 3, quantidade_minima: 0, ativo: 1,
  fornecedores: [], fornecedor_principal: null, ...over });
const linha = (id) => container.querySelector(`[data-testid="fornecedores-${id}"]`);

test('[RN-260.02] os fornecedores do material aparecem abaixo do nome; o texto antigo não, quando há fornecedor vinculado', async () => {
  const M = mat({ id: 1, fornecedores: ['Aços Brasil', 'BETA METAIS SA'], fornecedor_principal: 'TEXTO ANTIGO' });
  await act(async () => { root.render(<TabelaMateriais materiais={[M]} loading={false} renderAcoes={() => null} />); });
  expect(linha(1).textContent).toBe('Fornecedores: Aços Brasil, BETA METAIS SA');
  expect(container.textContent).not.toContain('TEXTO ANTIGO');
});

test('[RN-260.02] mais de três: os três primeiros e "+N"; exatamente três: sem "+"', () => {
  expect(textoFornecedores(mat({ fornecedores: ['A', 'B', 'C', 'D', 'E'] }))).toBe('Fornecedores: A, B, C +2');
  expect(textoFornecedores(mat({ fornecedores: ['A', 'B', 'C'] }))).toBe('Fornecedores: A, B, C');
  expect(textoFornecedores(mat({ fornecedores: ['A'] }))).toBe('Fornecedores: A');
});

test('[B1610] sem fornecedor vinculado: o texto antigo, marcado como antigo; sem os dois, nenhuma linha', async () => {
  const comAntigo = mat({ id: 2, fornecedores: [], fornecedor_principal: ' Metalúrgica Zé ' });
  const semNada = mat({ id: 3, fornecedores: [], fornecedor_principal: '   ' });
  const semCampo = mat({ id: 4, fornecedores: undefined, fornecedor_principal: null });
  await act(async () => {
    root.render(<TabelaMateriais materiais={[comAntigo, semNada, semCampo]} loading={false} renderAcoes={() => null} />);
  });
  expect(linha(2).textContent).toBe('Fornecedor (cadastro antigo): Metalúrgica Zé');
  expect(linha(3)).toBeNull();
  expect(linha(4)).toBeNull();
  expect(container.textContent).toContain('Chapa inox'); // a metade positiva: as linhas estão lá
});

test('[RN-260.01] a busca diz que acha pelo fornecedor e pelo código dele', async () => {
  await act(async () => {
    root.render(<FiltrosMateriais search="" onSearch={() => {}} categoria="" onCategoria={() => {}} familiaFilter=""
      onFamilia={() => {}} statusFilter="" onStatus={() => {}} familias={[]} categorias={[]} />);
  });
  expect(container.querySelector('input.almox-search-input').getAttribute('placeholder'))
    .toBe('Buscar por nome, código, fornecedor ou código do fornecedor...');
});
