/**
 * Etapa 260 (item 3) — RN-260.07..09: a Fila de separação agrupada por setor ou por projeto.
 *
 * O que se prova: a opção Agrupar (padrão "Sem agrupar" = a tela de antes, sem título de bloco); os blocos por setor (aparado) e por
 * projeto (pelo id, com o desempate do filtro), na ordem da primeira requisição de cada um (a mais urgente) e, dentro do bloco, na ordem
 * do servidor; acionáveis e "Aguardando" agrupados cada um por si; os filtros valem antes; Limpar filtros não mexe no agrupamento; a
 * opção sobrevive a Abrir e voltar e a falha do armazenamento; e a lista de coleta de todas sai na ordem da tela.
 *
 * Plano: docs/superpowers/plans/2026-11-23-almoxarifado-etapa260-fornecedores-na-busca-projeto-e-fila-agrupada.md
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/FilaSeparacaoAgrupada --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FilaSeparacao from './FilaSeparacao';
import api from '../../services/api';
import { CHAVE_AGRUPAR, agruparFila, rotulosDosProjetos } from '../../utils/filtrosFilaSeparacao';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const mockGerar = [];
jest.mock('../../utils/listaColetaPdf', () => ({
  ...jest.requireActual('../../utils/listaColetaPdf'),
  gerarListaColetaPDF: (args) => { mockGerar.push(args); },
}));

const pegar = (caminho) => ({ localizacao_codigo: caminho.split(' / ').pop(), caminho, quantidade_sugerida: 2, cobre: true });
const item = (id, over = {}) => ({
  item_id: id, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa', unidade: 'PC', a_separar: 2, separavel: 2,
  a_entregar: 0, entregavel: 0, disponivel: 5, origem_separacao_codigo: null, origem_separacao_caminho: null, lote_separacao_codigo: null,
  material_critico: false, pegar_em: pegar('ALM / A / A-01'), pegar_em_aviso: null, ...over,
});
const req = (id, over = {}) => ({
  id, numero: `REQ-${id}`, status: 'APROVADO', urgencia: 'NORMAL', data_necessidade: null, solicitante_nome: 'Maria', setor: null,
  created_at: '2026-11-01 10:00:00', etapas: ['SEPARAR'], acionavel: true, conferencia_pendente: false, separadores: [],
  posso_conferir: true, projeto_id: null, projeto_nome: null, itens: [item(id * 10)],
  ordem_coleta: [{ item_id: id * 10, caminho: 'ALM / A / A-01', material_codigo: 'MAT-1', quantidade_sugerida: 2 }], ...over,
});

// A ordem do servidor: 5 (Produção, Linha 2), 3 (Manutenção, Linha 2 #9 — outro projeto de mesmo nome), 8 (sem setor, sem projeto),
// 1 (" Produção ", Linha 2), 6 (Manutenção, Linha 2 #9), e no Aguardando 4 (Produção) e 2 (Manutenção, sem projeto).
// Os setores intercalam: um agrupamento que ordenasse por nome, ou pela ordem de id, aparece.
const FILA = [
  req(5, { setor: 'Produção', projeto_id: 7, projeto_nome: 'Linha 2' }),
  req(3, { setor: 'Manutenção', projeto_id: 9, projeto_nome: 'Linha 2' }),
  req(8, { setor: '  ' }),
  req(1, { setor: ' Produção ', projeto_id: 7, projeto_nome: 'Linha 2' }),
  req(6, { setor: 'Manutenção', projeto_id: 9, projeto_nome: 'Linha 2' }),
  req(4, { setor: 'Produção', etapas: ['AGUARDANDO_SALDO'], acionavel: false, projeto_id: 7, projeto_nome: 'Linha 2' }),
  req(2, { setor: 'Manutenção', etapas: ['AGUARDANDO_SALDO'], acionavel: false }),
];

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
const qa = (sel) => Array.from(container.querySelectorAll(sel));
const numerosEm = (el) => Array.from(el.querySelectorAll('[data-testid="fila-numero"]')).map((n) => n.textContent);
const visiveis = () => numerosEm(container);
const escolher = async (testid, valor) => {
  const sel = q(`[data-testid="${testid}"]`);
  await act(async () => {
    sel.value = valor;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(sel.value).toBe(valor);
};
/** Os blocos de um grupo: [[titulo, [numeros]]]. */
const blocos = (grupo) => qa(`[data-testid^="fila-bloco-${grupo}-"]`).filter((b) => !/titulo/.test(b.getAttribute('data-testid')))
  .map((b) => [b.querySelector('h3').textContent, numerosEm(b)]);

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

test('RN-260.07: padrão "Sem agrupar" — a tela de antes, na ordem do servidor e sem título de bloco', async () => {
  await montar();
  const sel = q('[data-testid="fila-agrupar"]');
  expect(Array.from(sel.options).map((o) => [o.value, o.textContent]))
    .toEqual([['', 'Sem agrupar'], ['setor', 'Por setor'], ['projeto', 'Por projeto']]);
  expect(sel.value).toBe('');
  expect(visiveis()).toEqual(['REQ-5', 'REQ-3', 'REQ-8', 'REQ-1', 'REQ-6', 'REQ-4', 'REQ-2']);
  expect(qa('[data-testid^="fila-bloco-"]')).toHaveLength(0);
});

test('RN-260.08: por setor — blocos na ordem da primeira requisição, dentro na ordem do servidor; "Aguardando" à parte', async () => {
  await montar();
  await escolher('fila-agrupar', 'setor');
  expect(blocos('acionaveis')).toEqual([
    ['Setor: Produção — 2 requisições', ['REQ-5', 'REQ-1']],
    ['Setor: Manutenção — 2 requisições', ['REQ-3', 'REQ-6']],
    ['Sem setor — 1 requisição', ['REQ-8']],
  ]);
  expect(blocos('aguardando')).toEqual([
    ['Setor: Produção — 1 requisição', ['REQ-4']],
    ['Setor: Manutenção — 1 requisição', ['REQ-2']],
  ]);
  expect(q('[data-testid="fila-aguardando"]').textContent).toContain('Aguardando');
});

test('RN-260.08: por projeto — pelo id, com o desempate de nome igual; "Sem projeto"', async () => {
  await montar();
  await escolher('fila-agrupar', 'projeto');
  expect(blocos('acionaveis')).toEqual([
    ['Projeto: Linha 2 (#7) — 2 requisições', ['REQ-5', 'REQ-1']],
    ['Projeto: Linha 2 (#9) — 2 requisições', ['REQ-3', 'REQ-6']],
    ['Sem projeto — 1 requisição', ['REQ-8']],
  ]);
  expect(blocos('aguardando')).toEqual([
    ['Projeto: Linha 2 (#7) — 1 requisição', ['REQ-4']],
    ['Sem projeto — 1 requisição', ['REQ-2']],
  ]);
});

test('RN-260.08: os filtros valem antes do agrupamento; Limpar filtros não mexe no Agrupar', async () => {
  await montar();
  await escolher('fila-agrupar', 'setor');
  await escolher('fila-filtro-projeto', '7');
  expect(blocos('acionaveis')).toEqual([['Setor: Produção — 2 requisições', ['REQ-5', 'REQ-1']]]);
  expect(blocos('aguardando')).toEqual([['Setor: Produção — 1 requisição', ['REQ-4']]]);
  await act(async () => { q('[data-testid="fila-limpar-filtros"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush();
  expect(q('[data-testid="fila-agrupar"]').value).toBe('setor');
  expect(blocos('acionaveis')).toHaveLength(3);
});

test('RN-260.08: o título do bloco usa o mesmo rótulo do filtro de projeto, mesmo com o outro "Linha 2" escondido pelo filtro', async () => {
  await montar();
  await escolher('fila-agrupar', 'projeto');
  await escolher('fila-filtro-setor', 'Produção');
  const opcaoDoFiltro = Array.from(q('[data-testid="fila-filtro-projeto"]').options).find((o) => o.value === '7').textContent;
  expect(opcaoDoFiltro).toBe('Linha 2 (#7)');
  expect(blocos('acionaveis')).toEqual([['Projeto: Linha 2 (#7) — 2 requisições', ['REQ-5', 'REQ-1']]]);
});

test('RN-260.07: a opção sobrevive a Abrir e voltar (navegador); valor estranho ou armazenamento que falha = Sem agrupar', async () => {
  await montar();
  await escolher('fila-agrupar', 'projeto');
  expect(window.localStorage.getItem(CHAVE_AGRUPAR)).toBe('projeto');
  desmontar();
  await montar();
  expect(q('[data-testid="fila-agrupar"]').value).toBe('projeto');
  expect(blocos('acionaveis')[0][0]).toBe('Projeto: Linha 2 (#7) — 2 requisições');
  desmontar();

  window.localStorage.setItem(CHAVE_AGRUPAR, 'localizacao');
  await montar();
  expect(q('[data-testid="fila-agrupar"]').value).toBe('');
  desmontar();

  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
  await montar();
  expect(q('[data-testid="fila-agrupar"]').value).toBe('');
  await escolher('fila-agrupar', 'setor');
  expect(blocos('acionaveis')).toHaveLength(3); // a tela funciona sem lembrar
});

test('RN-260.09: com agrupamento, a lista de coleta de todas sai na ordem da tela', async () => {
  await montar();
  await escolher('fila-agrupar', 'setor');
  await act(async () => { q('[data-testid="fila-imprimir-todas"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(mockGerar).toHaveLength(1);
  // os do Aguardando não têm a etapa Separar: ficam fora do papel, como antes
  expect(mockGerar[0].requisicoes.map((r) => r.numero)).toEqual(['REQ-5', 'REQ-1', 'REQ-3', 'REQ-6', 'REQ-8']);
});

test('agruparFila (função pura): sem agrupar = um bloco sem título; lista vazia = nenhum bloco; modo desconhecido = sem agrupar', () => {
  const rot = rotulosDosProjetos(FILA);
  expect(agruparFila(FILA.slice(0, 2), '', rot)).toEqual([{ chave: '', titulo: null, requisicoes: FILA.slice(0, 2) }]);
  expect(agruparFila([], 'setor', rot)).toEqual([]);
  expect(agruparFila(FILA.slice(0, 1), 'xyz', rot)[0].titulo).toBeNull();
  // projeto sem nome: "Projeto #<id>"
  const semNome = [req(11, { projeto_id: 12, projeto_nome: null })];
  expect(agruparFila(semNome, 'projeto', rotulosDosProjetos(semNome))[0].titulo).toBe('Projeto: Projeto #12 — 1 requisição');
});
