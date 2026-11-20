/**
 * Etapa 255 (T2) — os filtros da Fila de separação: setor, projeto e localização (RN-255.03..09).
 *
 * O que se prova: as opções saem da fila (setor aparado, "Sem …"), cada filtro esconde sem reordenar, a localização é hierárquica por
 * segmento, "filtro sem resultado" não é "fila vazia", a lista de coleta de todas segue o filtro, o projeto aparece no cartão, e as
 * escolhas sobrevivem ao Atualizar e ao Abrir e voltar (navegador), sem quebrar quando o armazenamento falha.
 *
 * Plano: docs/superpowers/plans/2026-11-20-almoxarifado-etapa255-fila-separacao-filtros.md
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/FilaSeparacaoFiltros --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FilaSeparacao from './FilaSeparacao';
import api from '../../services/api';
import { CHAVE_FILTROS } from '../../utils/filtrosFilaSeparacao';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const mockGerar = [];
jest.mock('../../utils/listaColetaPdf', () => ({
  ...jest.requireActual('../../utils/listaColetaPdf'),
  gerarListaColetaPDF: (args) => { mockGerar.push(args); },
}));

const item = (over = {}) => ({
  item_id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa', unidade: 'PC',
  a_separar: 2, separavel: 2, a_entregar: 0, entregavel: 0, disponivel: 5, origem_separacao_codigo: null,
  origem_separacao_caminho: null, lote_separacao_codigo: null, material_critico: false, pegar_em: null, pegar_em_aviso: null, ...over,
});
const pegar = (caminho) => ({ localizacao_codigo: caminho.split(' / ').pop(), caminho, quantidade_sugerida: 2, cobre: true });
const req = (over = {}) => ({
  id: 1, numero: 'REQ-1', status: 'APROVADO', urgencia: 'NORMAL', data_necessidade: null, solicitante_nome: 'Maria', setor: null,
  created_at: '2026-11-01 10:00:00', etapas: ['SEPARAR'], acionavel: true, conferencia_pendente: false, separadores: [],
  posso_conferir: true, projeto_id: null, projeto_nome: null, itens: [item()], ordem_coleta: [], ...over,
});

// A ordem do servidor (4, 1, 2, 3) não é a de id nem a alfabética — um sort na tela aparece.
const R4 = req({
  id: 4, numero: 'REQ-004', setor: 'Manutenção', projeto_id: 7, projeto_nome: 'Linha 2',
  itens: [item({ item_id: 41, pegar_em: pegar('ALM / B / B-02') })],
  ordem_coleta: [{ item_id: 41, caminho: 'ALM / B / B-02', material_codigo: 'MAT-1', quantidade_sugerida: 2 }],
});
const R1 = req({
  id: 1, numero: 'REQ-001', setor: 'Produção', projeto_id: 7, projeto_nome: 'Linha 2',
  itens: [item({ item_id: 11, pegar_em: pegar('ALM / A / A-01') })],
  ordem_coleta: [{ item_id: 11, caminho: 'ALM / A / A-01', material_codigo: 'MAT-1', quantidade_sugerida: 2 }],
});
const R2 = req({
  id: 2, numero: 'REQ-002', status: 'PRONTA_PARA_RETIRADA', setor: '  Produção ', etapas: ['ENTREGAR'],
  itens: [item({ item_id: 21, a_separar: 0, separavel: 0, a_entregar: 2, entregavel: 2, origem_separacao_codigo: 'AB-01',
    origem_separacao_caminho: 'ALM / AB / AB-01' })],
});
const R3 = req({
  id: 3, numero: 'REQ-003', status: 'AGUARDANDO_COMPRA', setor: '   ', projeto_id: 8, projeto_nome: null, etapas: ['AGUARDANDO_SALDO'],
  acionavel: false, itens: [item({ item_id: 31, separavel: 0 })],
});
const FILA = [R4, R1, R2, R3];

let container;
let root;

const flush = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};
const montar = async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/fila-separacao']}>
        <Routes>
          <Route path="/almoxarifado/fila-separacao" element={<FilaSeparacao />} />
        </Routes>
      </MemoryRouter>
    );
  });
  await flush();
};
const desmontar = () => {
  act(() => root.unmount());
  container.remove();
};
const q = (sel) => container.querySelector(sel);
const visiveis = () => Array.from(container.querySelectorAll('[data-testid="fila-numero"]')).map((n) => n.textContent);
const opcoes = (testid) => Array.from(q(`[data-testid="${testid}"]`).options).map((o) => o.textContent);
const escolher = async (testid, valor) => {
  const sel = q(`[data-testid="${testid}"]`);
  await act(async () => {
    sel.value = valor;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(sel.value).toBe(valor); // a opção existe (senão o <select> volta para a primeira)
};
const clicar = async (sel) => {
  await act(async () => { q(sel).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush();
};

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockGerar.length = 0;
  window.localStorage.clear();
  api.get.mockReset();
  api.get.mockResolvedValue({ data: FILA });
});

afterEach(() => {
  if (container && container.isConnected) desmontar();
  jest.restoreAllMocks();
});

test('RN-255.03/04: as opções saem da fila — setor aparado, projeto pelo id, localização com os prefixos, e os "Sem …"', async () => {
  await montar();
  expect(visiveis()).toEqual(['REQ-004', 'REQ-001', 'REQ-002', 'REQ-003']);
  expect(opcoes('fila-filtro-setor')).toEqual(['Todos', 'Manutenção', 'Produção', 'Sem setor']);
  expect(opcoes('fila-filtro-projeto')).toEqual(['Todos', 'Linha 2', 'Projeto #8', 'Sem projeto']);
  expect(opcoes('fila-filtro-local')).toEqual([
    'Todos', 'ALM', 'ALM / A', 'ALM / A / A-01', 'ALM / AB', 'ALM / AB / AB-01', 'ALM / B', 'ALM / B / B-02', 'Sem localização',
  ]);
  expect(q('[data-testid="fila-contagem"]')).toBeNull();
  expect(q('[data-testid="fila-limpar-filtros"]')).toBeNull();
});

test('RN-255.03/05: setor (com o aparado) e "Sem setor", na ordem do servidor', async () => {
  await montar();
  await escolher('fila-filtro-setor', 'Produção');
  expect(visiveis()).toEqual(['REQ-001', 'REQ-002']);
  await escolher('fila-filtro-setor', '__sem__');
  expect(visiveis()).toEqual(['REQ-003']);
  expect(q('[data-testid="fila-aguardando"]').textContent).toContain('REQ-003'); // o grupo continua o mesmo
});

test('RN-255.03: projeto pelo id, "Projeto #8" e "Sem projeto"', async () => {
  await montar();
  await escolher('fila-filtro-projeto', '7');
  expect(visiveis()).toEqual(['REQ-004', 'REQ-001']);
  await escolher('fila-filtro-projeto', '8');
  expect(visiveis()).toEqual(['REQ-003']);
  await escolher('fila-filtro-projeto', '__sem__');
  expect(visiveis()).toEqual(['REQ-002']);
});

test('RN-255.04: localização hierárquica por segmento — "ALM / A" não pega "ALM / AB"; origem separada conta; "Sem localização"', async () => {
  await montar();
  await escolher('fila-filtro-local', 'ALM / A');
  expect(visiveis()).toEqual(['REQ-001']);
  await escolher('fila-filtro-local', 'ALM / AB');
  expect(visiveis()).toEqual(['REQ-002']);
  await escolher('fila-filtro-local', 'ALM');
  expect(visiveis()).toEqual(['REQ-004', 'REQ-001', 'REQ-002']);
  await escolher('fila-filtro-local', '__sem__');
  expect(visiveis()).toEqual(['REQ-003']);
});

test('RN-255.05/06: os filtros combinam; "Mostrando N de M"; sem resultado é outra frase, com Limpar filtros', async () => {
  await montar();
  await escolher('fila-filtro-setor', 'Produção');
  await escolher('fila-filtro-projeto', '7');
  expect(visiveis()).toEqual(['REQ-001']);
  expect(q('[data-testid="fila-contagem"]').textContent).toBe('Mostrando 1 de 4 requisições.');
  await escolher('fila-filtro-local', 'ALM / B');
  expect(visiveis()).toEqual([]);
  expect(q('[data-testid="fila-filtro-vazio"]').textContent).toContain('Nenhuma requisição da fila com estes filtros.');
  expect(q('[data-testid="fila-vazia"]')).toBeNull();
  expect(q('[data-testid="fila-contagem"]')).toBeNull();
  await clicar('[data-testid="fila-limpar-filtros"]');
  expect(visiveis()).toEqual(['REQ-004', 'REQ-001', 'REQ-002', 'REQ-003']);
  expect(q('[data-testid="fila-filtro-vazio"]')).toBeNull();
  expect(q('[data-testid="fila-filtro-setor"]').value).toBe('');
});

test('RN-255.07: "Imprimir lista de coleta (todas)" imprime só o visível; nada imprimível visível -> apagado', async () => {
  await montar();
  await escolher('fila-filtro-local', 'ALM / B');
  await clicar('[data-testid="fila-imprimir-todas"]');
  expect(mockGerar).toHaveLength(1);
  expect(mockGerar[0].requisicoes.map((r) => r.id)).toEqual([4]);
  await escolher('fila-filtro-local', 'ALM / AB'); // só a REQ-002, etapa Entregar: nada a imprimir
  expect(q('[data-testid="fila-imprimir-todas"]').disabled).toBe(true);
  await escolher('fila-filtro-local', '');
  expect(q('[data-testid="fila-imprimir-todas"]').disabled).toBe(false);
});

test('RN-255.08: o projeto no cartão — o nome, ou "Projeto #id"; sem projeto, nada', async () => {
  await montar();
  expect(q('[data-testid="fila-projeto-1"]').textContent).toBe('Projeto: Linha 2');
  expect(q('[data-testid="fila-projeto-3"]').textContent).toBe('Projeto #8');
  expect(q('[data-testid="fila-req-2"]')).not.toBeNull();
  expect(q('[data-testid="fila-projeto-2"]')).toBeNull();
});

test('RN-255.09: Atualizar mantém o filtro; o projeto que sumiu continua escolhido, como "Projeto #id", com a frase do sem resultado', async () => {
  await montar();
  await escolher('fila-filtro-projeto', '8');
  expect(visiveis()).toEqual(['REQ-003']);
  api.get.mockResolvedValue({ data: [R4, R1, R2] });
  await clicar('[data-testid="fila-atualizar"]');
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(q('[data-testid="fila-filtro-projeto"]').value).toBe('8');
  expect(opcoes('fila-filtro-projeto')).toEqual(['Todos', 'Linha 2', 'Projeto #8', 'Sem projeto']);
  expect(visiveis()).toEqual([]);
  expect(q('[data-testid="fila-filtro-vazio"]')).not.toBeNull();
});

test('RN-255.09: Abrir e voltar (desmontar e montar) não perde o filtro', async () => {
  await montar();
  await escolher('fila-filtro-setor', 'Manutenção');
  expect(visiveis()).toEqual(['REQ-004']);
  desmontar();
  await montar();
  expect(q('[data-testid="fila-filtro-setor"]').value).toBe('Manutenção');
  expect(visiveis()).toEqual(['REQ-004']);
  expect(JSON.parse(window.localStorage.getItem(CHAVE_FILTROS))).toEqual({ setor: 'Manutenção', projeto: '', local: '' });
});

test('RN-255.09: armazenamento que falha -> a tela abre com "Todos" e filtra normalmente', async () => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
  await montar();
  expect(visiveis()).toEqual(['REQ-004', 'REQ-001', 'REQ-002', 'REQ-003']);
  await escolher('fila-filtro-setor', 'Manutenção');
  expect(visiveis()).toEqual(['REQ-004']);
});

test('RN-255.03: a barra some na fila vazia e no 403 (a escolha guardada não vira "fila vazia")', async () => {
  window.localStorage.setItem(CHAVE_FILTROS, JSON.stringify({ setor: 'Manutenção', projeto: '', local: '' }));
  api.get.mockResolvedValue({ data: [] });
  await montar();
  expect(q('[data-testid="fila-vazia"]')).not.toBeNull();
  expect(q('[data-testid="fila-filtros"]')).toBeNull();
  expect(q('[data-testid="fila-filtro-vazio"]')).toBeNull();
  desmontar();
  api.get.mockRejectedValue({ response: { status: 403, data: { error: 'sem permissao' } } });
  await montar();
  expect(q('[data-testid="fila-sem-permissao"]')).not.toBeNull();
  expect(q('[data-testid="fila-filtros"]')).toBeNull();
});
