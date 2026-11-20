/**
 * Etapa 251 (C489; C518) — a entrega divide o teto do lote entre os itens que disputam o mesmo lote, e o um clique não manda a caixa separada
 * de um lote cuja peça presa não deixa sair a parte guardada.
 *
 * - Os campos vêm do detalhe (GET /requisicoes/:id, aditivos): `saldo_entregavel_lote` (o que o item entregaria sozinho, a régua da
 *   conferência) e `saldo_entregavel_lote_proprio` (a parte que sai da guarda dele); `lote_separacao_nao_cobre` e `lote_separacao_pode_sair`.
 * - RN-251.02: o pré-preenchimento (janela e um clique) divide na ordem do pedido — 3 e 0, antes 3 e 3 (a entrega dos dois recusava).
 * - RN-251.03: o máximo de cada item na janela considera o que os outros estão entregando agora.
 * - RN-251.12: com `lote_separacao_nao_cobre`, o um clique se apaga com a frase, e a janela abre no automático.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesEntregaLoteDividido --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RequisicoesList from './RequisicoesList';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 99, nome: 'Almoxarife Teste', role: 'admin' } }),
}));
jest.mock('./RequisicoesMaterialContext', () => ({
  useRequisicoesMaterialContext: () => ({ warehouseMode: true, basePath: '', setor: null }),
}));

const ITEM_BASE = {
  material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm',
  material_unidade: 'PC', material_foto: null, unidade: 'PC', quantidade_solicitada: 3,
  saldo_atual: 8, localizacao_nome: null, almoxarifado_nome: null,
  origem_separacao_id: null, lote_separacao_id: null, origem_separacao_codigo: null, lote_separacao_codigo: null,
  quantidade_separada: 3, quantidade_entregue: 0, quantidade_atendida: 0,
};
const REQ_BASE = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL', status: 'PRONTA_PARA_RETIRADA',
  solicitante_id: 99, solicitante_nome: 'Almoxarife Teste', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-09-30T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};
// C489: L1 vencido, L2 3; dois itens de 3 separados sem origem — cada um sozinho entregaria 3 (o teto), nenhum tem parte própria
const item = (id, extra = {}) => ({ ...ITEM_BASE, id, quantidade_entregavel: 3, saldo_entregavel: 3, saldo_entregavel_proprio: 3, ...extra });
const DOIS_NO_LOTE = { ...REQ_BASE, itens: [
  item(1, { saldo_entregavel_lote: 3, saldo_entregavel_lote_proprio: 0 }),
  item(2, { saldo_entregavel_lote: 3, saldo_entregavel_lote_proprio: 0 }),
] };
// C518: caixa de 3 separada de XB-01/L1; do L1 só 2 podem sair
const NAO_COBRE = (podeSair = 2, extra = {}) => ({ ...REQ_BASE, itens: [item(1, {
  origem_separacao_id: 2, lote_separacao_id: 7, origem_separacao_codigo: 'XB-01', lote_separacao_codigo: 'L1',
  quantidade_origem_separacao: 3, lote_separacao_esta_impedido: false, lote_separacao_nao_cobre: true, lote_separacao_pode_sair: podeSair,
  ...extra,
})] });
const SALDOS = [
  { id: 4, material_id: 10, localizacao_id: 2, localizacao_codigo: 'XB-01', lote_id: 7, lote: 'L1', quantidade: 4,
    separado_outras: 0, sobra: 4, lote_livre: 2, lote_bloqueado: 2, lote_inspecao: 0 },
  { id: 5, material_id: 10, localizacao_id: 3, localizacao_codigo: 'P-01', lote_id: 9, lote: 'L2', quantidade: 5,
    separado_outras: 0, sobra: 5, lote_livre: null, lote_bloqueado: null, lote_inspecao: null },
];

let container;
let root;
let requisicao;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, separacoes, ...linha } = requisicao;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    if (url === '/almoxarifado/estoque/10/saldos?requisicao_id=55') return Promise.resolve({ data: SALDOS });
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: { parcial: true } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function renderizar() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/requisicoes?id=55']}>
        <RequisicoesList />
      </MemoryRouter>
    );
  });
}
const botaoPorTexto = (texto) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().includes(texto));
const clicar = async (texto) => { await act(async () => { botaoPorTexto(texto).click(); }); };
const inputs = () => [...container.querySelectorAll('.almox-modal input.almox-count-input')];
const digitar = (input, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => { setter.call(input, valor); input.dispatchEvent(new Event('input', { bubbles: true })); });
};
const UM_CLIQUE = 'Confirmar Entrega e Baixar Estoque';
const JANELA = 'Entregar escolhendo de onde sai';
const payload = () => api.put.mock.calls.find((c) => c[0] === '/almoxarifado/requisicoes/55/entregar')[1].itens_atendidos;
const fraseUmClique = () => container.querySelector('#entrega-direta-lote-impedido');

describe('Etapa 251: o entregável dividido pelo lote (C489)', () => {
  test('[RN-251.02] o um clique manda 3 do primeiro e nada do segundo (antes 3 + 3, que a entrega recusava)', async () => {
    requisicao = DOIS_NO_LOTE;
    await renderizar();
    expect(botaoPorTexto(UM_CLIQUE).disabled).toBe(false);
    await clicar(UM_CLIQUE);
    expect(payload()).toEqual([{ item_id: 1, quantidade_atendida: 3 }]);
  });

  test('[RN-251.02/03] a janela abre com 3 e vazio (máximos 3 e 0); o primeiro em 1 -> o segundo pode 2', async () => {
    requisicao = DOIS_NO_LOTE;
    await renderizar();
    await clicar(JANELA);
    expect(inputs().map((i) => i.value)).toEqual(['3', '']);
    expect(inputs().map((i) => i.max)).toEqual(['3', '0']);
    digitar(inputs()[0], '1');
    expect(inputs().map((i) => i.max)).toEqual(['3', '2']);
  });

  test('[RN-251.04] a parte própria não divide: guardado 2 (teto 4, próprio 2) e dois sem origem de teto 2 -> 2, 2 e vazio', async () => {
    requisicao = { ...REQ_BASE, itens: [
      item(1, { quantidade_solicitada: 2, quantidade_separada: 2, quantidade_entregavel: 2, saldo_entregavel: 2, saldo_entregavel_proprio: 2,
        saldo_entregavel_lote: 4, saldo_entregavel_lote_proprio: 2, origem_separacao_id: 3, lote_separacao_id: 9,
        origem_separacao_codigo: 'P-01', lote_separacao_codigo: 'L2', quantidade_origem_separacao: 2, lote_separacao_nao_cobre: false }),
      item(2, { quantidade_solicitada: 2, quantidade_separada: 2, quantidade_entregavel: 2, saldo_entregavel: 2, saldo_entregavel_proprio: 2,
        saldo_entregavel_lote: 2, saldo_entregavel_lote_proprio: 0 }),
      item(3, { quantidade_solicitada: 2, quantidade_separada: 2, quantidade_entregavel: 2, saldo_entregavel: 2, saldo_entregavel_proprio: 2,
        saldo_entregavel_lote: 2, saldo_entregavel_lote_proprio: 0 }),
    ] };
    await renderizar();
    await clicar(UM_CLIQUE);
    expect(payload()).toEqual([{ item_id: 1, quantidade_atendida: 2 }, { item_id: 2, quantidade_atendida: 2 }]);
  });

  test('[RN-251.06] servidor sem os campos do lote: 3 e 3 como antes', async () => {
    requisicao = { ...REQ_BASE, itens: [item(1), item(2)] };
    await renderizar();
    await clicar(UM_CLIQUE);
    expect(payload()).toEqual([{ item_id: 1, quantidade_atendida: 3 }, { item_id: 2, quantidade_atendida: 3 }]);
  });
});

describe('Etapa 251: a caixa separada de um lote que não deixa sair a parte (C518)', () => {
  test('[RN-251.12] o um clique se apaga com a frase; a janela abre no automático e manda origem_automatica', async () => {
    requisicao = NAO_COBRE(2);
    await renderizar();
    expect(botaoPorTexto(UM_CLIQUE).disabled).toBe(true);
    expect(fraseUmClique().textContent).toBe('Chapa 3mm: separado de XB-01 — lote L1: das 3 PC separadas dele, só 2 podem sair (peça presa '
      + 'no lote). A entrega direta sairia de lá e seria recusada — use "Entregar escolhendo de onde sai…".');
    await clicar(JANELA);
    expect(container.querySelector('#entrega-origem-1').value).toBe('');
    await clicar('✅ Confirmar Entrega');
    expect(payload()).toEqual([expect.objectContaining({ item_id: 1, quantidade_atendida: 3, origem_automatica: true })]);
  });

  test('[RN-251.12] singular e nenhuma: só 1 pode sair; nenhuma pode sair', async () => {
    requisicao = NAO_COBRE(1);
    await renderizar();
    expect(fraseUmClique().textContent).toContain('das 3 PC separadas dele, só 1 pode sair (peça presa no lote)');
    act(() => root.unmount());
    root = createRoot(container);
    requisicao = NAO_COBRE(0, { quantidade_origem_separacao: 1, quantidade_separada: 1, quantidade_solicitada: 1, quantidade_entregavel: 1,
      saldo_entregavel: 1, saldo_entregavel_proprio: 1 });
    await renderizar();
    expect(fraseUmClique().textContent).toContain('da 1 PC separada dele, nenhuma pode sair (peça presa no lote)');
  });

  test('[RN-251.15, Fase 5] o irmão anterior divide e o item fica dentro do que o lote deixa sair: o um clique acende e manda pela origem', async () => {
    // Y (sem origem) leva 2 do teto do lote; X (caixa 3 de XB-01/L1, só 2 podem sair) fica com 2 — a origem cobre os 2.
    requisicao = { ...REQ_BASE, itens: [
      item(1, { quantidade_solicitada: 2, quantidade_separada: 2, quantidade_entregavel: 2, saldo_entregavel: 2, saldo_entregavel_proprio: 2,
        saldo_entregavel_lote: 2, saldo_entregavel_lote_proprio: 0 }),
      item(2, { saldo_entregavel_lote: 4, saldo_entregavel_lote_proprio: 0, origem_separacao_id: 2, lote_separacao_id: 7,
        origem_separacao_codigo: 'XB-01', lote_separacao_codigo: 'L1', quantidade_origem_separacao: 3, lote_separacao_esta_impedido: false,
        lote_separacao_nao_cobre: true, lote_separacao_pode_sair: 2 }),
    ] };
    await renderizar();
    expect(fraseUmClique()).toBeNull();
    expect(botaoPorTexto(UM_CLIQUE).disabled).toBe(false);
    await clicar(UM_CLIQUE);
    expect(payload()).toEqual([{ item_id: 1, quantidade_atendida: 2 }, { item_id: 2, quantidade_atendida: 2 }]);
  });

  test('[RN-251.15, Fase 5] na janela, o mesmo: X abre na planejada (2 cabem na origem)', async () => {
    requisicao = { ...REQ_BASE, itens: [
      item(1, { quantidade_solicitada: 2, quantidade_separada: 2, quantidade_entregavel: 2, saldo_entregavel: 2, saldo_entregavel_proprio: 2,
        saldo_entregavel_lote: 2, saldo_entregavel_lote_proprio: 0 }),
      item(2, { saldo_entregavel_lote: 4, saldo_entregavel_lote_proprio: 0, origem_separacao_id: 2, lote_separacao_id: 7,
        origem_separacao_codigo: 'XB-01', lote_separacao_codigo: 'L1', quantidade_origem_separacao: 3, lote_separacao_esta_impedido: false,
        lote_separacao_nao_cobre: true, lote_separacao_pode_sair: 2 }),
    ] };
    await renderizar();
    await clicar(JANELA);
    expect(inputs().map((i) => i.value)).toEqual(['2', '2']);
    expect(container.querySelector('#entrega-origem-2').value).toBe('2:7');
  });

  test('[RN-251.13] o lote cobre: o um clique acende, sem frase, e a janela pré-seleciona a planejada', async () => {
    requisicao = NAO_COBRE(2, { lote_separacao_nao_cobre: false, lote_separacao_pode_sair: undefined });
    await renderizar();
    expect(botaoPorTexto(UM_CLIQUE).disabled).toBe(false);
    expect(fraseUmClique()).toBeNull();
    await clicar(JANELA);
    expect(container.querySelector('#entrega-origem-1').value).toBe('2:7');
  });
});
