/**
 * Etapa 232 (D (231) 1; B1523 a B1526) — na janela de entrega, a série de lote impedido (bloqueado, reprovado ou vencido) vem apagada, com o
 * lote e a situação ao lado e uma frase embaixo, e não conta para o Confirmar. A situação vem na listagem de séries (B1523). Mock só na
 * fronteira HTTP.
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa232-entrega-series-lote-impedido.md
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesEntregaSeriesImpedidas --watchAll=false
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

const REQ_BASE = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL',
  solicitante_id: 99, solicitante_nome: 'Almoxarife Teste', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-11-13T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};
// Separou 5 (3 de Z-02/L2, L2 bloqueado — Etapa 231: a janela abre em "Escolha de onde sai"), entregou 2: entrega 3.
const item = (extra = {}) => ({
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm',
  material_unidade: 'PC', material_foto: null, unidade: 'PC', quantidade_solicitada: 5,
  saldo_atual: 20, localizacao_nome: null, almoxarifado_nome: null,
  origem_separacao_id: 4, lote_separacao_id: 12, origem_separacao_codigo: 'Z-02', lote_separacao_codigo: 'L2',
  quantidade_origem_separacao: 3, quantidade_separada: 5, quantidade_entregue: 2, quantidade_atendida: 2, quantidade_entregavel: 3,
  lote_separacao_status: 'BLOQUEADO', lote_separacao_validade: null, lote_separacao_esta_impedido: true,
  lote_separacao_vencido_sem_liberacao: false,
  ...extra,
});
const PARCIAL = (extra) => ({ ...REQ_BASE, status: 'PARCIALMENTE_ATENDIDA', itens: [item(extra)] });

const BOM = { lote_status: 'ATIVO', lote_validade: null, lote_vencimento_liberado_em: null, lote_esta_impedido: false,
  lote_vencido_sem_liberacao: false };
const SEM_LOTE = { lote_status: null, lote_validade: null, lote_vencimento_liberado_em: null, lote_esta_impedido: false,
  lote_vencido_sem_liberacao: false };
const linha = (extra) => ({ material_id: 10, separado_outras: 0, lote_livre: null, lote_bloqueado: null, lote_inspecao: null, ...extra });
const A01 = linha({ id: 1, localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote: null, quantidade: 10, sobra: 10, ...SEM_LOTE });
const XB01 = linha({ id: 2, localizacao_id: 2, localizacao_codigo: 'XB-01', lote_id: 7, lote: 'L1', quantidade: 4, sobra: 4, ...BOM });
const Z02 = linha({ id: 3, localizacao_id: 4, localizacao_codigo: 'Z-02', lote_id: 12, lote: 'L2', quantidade: 6, sobra: 6,
  ...BOM, lote_status: 'BLOQUEADO', lote_esta_impedido: true });

// As séries (B1523): S1–S3 em L1 (ATIVO), S4–S5 em L2 (BLOQUEADO).
const SIT_L1 = { lote_status: 'ATIVO', lote_validade: null, lote_esta_impedido: false, lote_vencido_sem_liberacao: false };
const SIT_L2 = { lote_status: 'BLOQUEADO', lote_validade: null, lote_esta_impedido: true, lote_vencido_sem_liberacao: false };
const serie = (id, numero, loteId, lote, sit) => ({ id, numero, material_id: 10, status: 'EM_ESTOQUE', lote_id: loteId, lote_codigo: lote,
  localizacao_id: null, localizacao_descricao: null, ...sit });
const SERIES = (l2 = SIT_L2, l1 = SIT_L1) => [
  serie(101, 'S1', 7, 'L1', l1), serie(102, 'S2', 7, 'L1', l1), serie(103, 'S3', 7, 'L1', l1),
  serie(104, 'S4', 12, 'L2', l2), serie(105, 'S5', 12, 'L2', l2),
];

let container;
let root;
let requisicao;
let series;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  series = SERIES();
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, separacoes, ...lin } = requisicao;
      return Promise.resolve({ data: [lin] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    if (url === '/almoxarifado/estoque/10/saldos?requisicao_id=55') return Promise.resolve({ data: [A01, XB01, Z02] });
    if (url === '/almoxarifado/materiais/10') return Promise.resolve({ data: { id: 10, controle_serie: 1 } });
    if (url === '/almoxarifado/materiais/10/series?status=EM_ESTOQUE') return Promise.resolve({ data: series });
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
async function abrirJanela() {
  await renderizar();
  const b = [...container.querySelectorAll('button')].find((x) => x.textContent.trim().includes('Completar Entrega'));
  await act(async () => { b.click(); });
}
const botaoPorTexto = (texto) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().includes(texto));
const escolher = (select, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => { setter.call(select, valor); select.dispatchEvent(new Event('change', { bubbles: true })); });
};
const digitar = (input, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => { setter.call(input, valor); input.dispatchEvent(new Event('input', { bubbles: true })); });
};
const selectEntrega = () => container.querySelector('#entrega-origem-1');
const confirmarJanela = () => botaoPorTexto('Confirmar Entrega');
const caixa = (id) => container.querySelector(`#entrega-series-1 input[data-serie-id="${id}"]`);
const marcar = (id) => act(() => { caixa(id).click(); });
const rotulo = (id) => container.querySelector(`#entrega-series-1 [data-serie-situacao="${id}"]`);
const contador = () => container.querySelector('#entrega-series-contador-1')?.textContent;
const frase = () => container.querySelector('#entrega-series-impedidas-1');
const desabilitadas = () => [101, 102, 103, 104, 105].filter((id) => caixa(id) && caixa(id).disabled);
const FRASE = 'Séries de lote bloqueado, reprovado ou vencido vêm apagadas: só saem depois que o lote for liberado na tela Lotes e Séries.';

describe('Etapa 232: a entrega não deixa marcar série de lote impedido', () => {
  test('[RN-232.03] em "Escolha de onde sai": as séries de L2 apagadas com o rótulo, as de L1 livres, e a frase', async () => {
    requisicao = PARCIAL();
    await abrirJanela();
    expect(selectEntrega().value).toBe('__escolher__');
    expect(desabilitadas()).toEqual([104, 105]);
    expect(rotulo(104).textContent).toBe(' · lote L2 — Bloqueado: não sai');
    expect(rotulo(105).textContent).toBe(' · lote L2 — Bloqueado: não sai');
    expect(rotulo(101)).toBeNull();
    expect(frase().textContent).toBe(FRASE);
  });

  test('[RN-232.03 controle] sem série impedida: todas livres, sem rótulo nem frase', async () => {
    series = SERIES(SIT_L1);
    requisicao = PARCIAL();
    await abrirJanela();
    expect(desabilitadas()).toEqual([]);
    expect(rotulo(104)).toBeNull();
    expect(frase()).toBeNull();
  });

  test('[RN-232.04] XB-01/L1 mostra só as de L1, sem frase; "Qualquer endereço" com S1–S3 marca 3 de 3 e o PUT leva só elas', async () => {
    requisicao = PARCIAL();
    await abrirJanela();
    escolher(selectEntrega(), '2:7');
    expect(caixa(104)).toBeNull();
    expect(frase()).toBeNull();
    escolher(selectEntrega(), '');
    expect(frase().textContent).toBe(FRASE);
    marcar(101); marcar(102); marcar(103);
    expect(contador()).toBe('3 de 3');
    expect(confirmarJanela().disabled).toBe(false);
    await act(async () => { confirmarJanela().click(); });
    const [, corpo] = api.put.mock.calls.find(([u]) => u.endsWith('/entregar'));
    expect(corpo.itens_atendidos[0]).toMatchObject({ item_id: 1, quantidade_atendida: 3, origem_automatica: true,
      serie_ids: [101, 102, 103] });
  });

  test('[RN-232.04] só duas boas para 3: o Confirmar fica apagado (a impedida não completa a conta)', async () => {
    series = SERIES().filter((s) => s.id !== 103);
    requisicao = PARCIAL();
    await abrirJanela();
    escolher(selectEntrega(), '');
    marcar(101); marcar(102);
    expect(caixa(104).disabled).toBe(true);
    expect(contador()).toBe('2 de 3');
    expect(confirmarJanela().disabled).toBe(true);
    const qtd = container.querySelector('.almox-count-input');
    digitar(qtd, '2');
    expect(contador()).toBe('2 de 2');
    expect(confirmarJanela().disabled).toBe(false);
  });

  test('[RN-232.05] a entrega recusada relê as séries: a marcada cujo lote ficou bloqueado é desmarcada e apagada', async () => {
    requisicao = PARCIAL();
    await abrirJanela();
    escolher(selectEntrega(), '');
    marcar(101); marcar(102); marcar(103);
    expect(confirmarJanela().disabled).toBe(false);
    api.put.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Chapa 3mm: Lote L1 esta bloqueado e nao pode ser utilizado' } } });
    series = SERIES(SIT_L2, { ...SIT_L1, lote_status: 'BLOQUEADO', lote_esta_impedido: true });
    await act(async () => { confirmarJanela().click(); });
    expect(desabilitadas()).toEqual([101, 102, 103, 104, 105]);
    expect([101, 102, 103].map((id) => caixa(id).checked)).toEqual([false, false, false]);
    expect(rotulo(101).textContent).toBe(' · lote L1 — Bloqueado: não sai');
    expect(contador()).toBe('0 de 3');
    expect(confirmarJanela().disabled).toBe(true);
  });

  test('[RN-232.05, Fase 2] o estado também é limpo: liberado o lote e relidas as séries, a de antes não volta marcada', async () => {
    const L3 = [serie(106, 'S6', 9, 'L3', SIT_L1), serie(107, 'S7', 9, 'L3', SIT_L1), serie(108, 'S8', 9, 'L3', SIT_L1)];
    series = [...SERIES(), ...L3];
    requisicao = PARCIAL();
    await abrirJanela();
    escolher(selectEntrega(), '');
    marcar(101); marcar(102); marcar(103);
    api.put.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Chapa 3mm: Lote L1 esta bloqueado e nao pode ser utilizado' } } });
    series = [...SERIES(SIT_L2, { ...SIT_L1, lote_status: 'BLOQUEADO', lote_esta_impedido: true }), ...L3];
    await act(async () => { confirmarJanela().click(); });
    expect(contador()).toBe('0 de 3');
    marcar(106); marcar(107); marcar(108);
    expect(contador()).toBe('3 de 3');
    // outra recusa; na releitura o L1 já foi liberado — S1–S3 voltam livres, mas não marcadas (só S6–S8 contam)
    api.put.mockRejectedValueOnce({ response: { status: 400, data: { error: 'outra recusa' } } });
    series = [...SERIES(), ...L3];
    await act(async () => { confirmarJanela().click(); });
    expect([101, 102, 103].map((id) => caixa(id).checked)).toEqual([false, false, false]);
    expect(contador()).toBe('3 de 3');
    expect(confirmarJanela().disabled).toBe(false);
  });

  test('[RN-232.06] as palavras do extrato: Reprovado; Vencido em 10/11/2026', async () => {
    series = SERIES({ ...SIT_L2, lote_status: 'REPROVADO' });
    requisicao = PARCIAL();
    await abrirJanela();
    expect(rotulo(104).textContent).toBe(' · lote L2 — Reprovado: não sai');
    act(() => root.unmount());
    root = createRoot(container);
    series = SERIES({ lote_status: 'ATIVO', lote_validade: '2026-11-10', lote_esta_impedido: true, lote_vencido_sem_liberacao: true });
    await abrirJanela();
    expect(rotulo(104).textContent).toBe(' · lote L2 — Vencido em 10/11/2026: não sai');
    expect(caixa(104).disabled).toBe(true);
  });

  test('[RN-232.07] sem o campo (resposta antiga): todas livres, sem rótulo nem frase', async () => {
    series = SERIES().map(({ lote_status, lote_validade, lote_esta_impedido, lote_vencido_sem_liberacao, ...s }) => s);
    requisicao = PARCIAL();
    await abrirJanela();
    expect(desabilitadas()).toEqual([]);
    expect(rotulo(104)).toBeNull();
    expect(frase()).toBeNull();
  });

  test('[RN-232.07, Fase 2] só `=== true` conta: lote_esta_impedido 1 ou "true" não apaga', async () => {
    series = SERIES().map((s) => (s.id === 104 ? { ...s, lote_esta_impedido: 1 } : s.id === 105 ? { ...s, lote_esta_impedido: 'true' } : s));
    requisicao = PARCIAL();
    await abrirJanela();
    expect(desabilitadas()).toEqual([]);
    expect(rotulo(104)).toBeNull();
    expect(frase()).toBeNull();
  });
});
