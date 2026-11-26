/**
 * Etapa 265 (C76, B1624; RN-265.06) — na Transferência (Movimentações → Nova Movimentação) de material com número de série, a tela pede
 * as séries que mudam de prateleira: as presentes (EM_ESTOQUE e BLOQUEADA) do lote da transferência (lote em branco: só as sem lote), as
 * da origem escolhida primeiro, com a prateleira de cada uma; o envio leva `serie_ids` e para no toast se a contagem não bate; a recusa
 * do servidor relê a lista. A decisão 9 da Etapa 7 ("a transferência não pede série") foi revista nesta etapa.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MovimentacoesTransferenciaSeries --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MovimentacoesAlmoxarifado from './MovimentacoesAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';

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

jest.mock('./ExtratoMaterialModal', () => ({ __esModule: true, default: () => null }));

const MATERIAIS = [
  { id: 10, codigo: 'MED-1', nome: 'Medidor serializado', unidade: 'UN', quantidade_atual: 4, controle_serie: 1, controle_lote: 0 },
  { id: 20, codigo: 'PAR-1', nome: 'Parafuso', unidade: 'UN', quantidade_atual: 40, controle_serie: 0, controle_lote: 0 },
];
const serie = (id, numero, { status = 'EM_ESTOQUE', loteId = null, lote = null, locId = null, loc = null } = {}) => ({
  id, numero, status, lote_id: loteId, lote_codigo: lote, localizacao_id: locId, localizacao_codigo: loc,
});
const LOTE_L1 = { id: 7, codigo: 'L1', status: 'ATIVO', elegivel: true, saldo: 3 };

let container;
let root;
let seriesEmEstoque;
let seriesBloqueadas;
let lotes;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  seriesEmEstoque = [];
  seriesBloqueadas = [];
  lotes = [];
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: MATERIAIS });
    if (url === '/almoxarifado/localizacoes') {
      return Promise.resolve({ data: [{ id: 1, codigo: 'COR-A-03' }, { id: 2, codigo: 'COR-B-01' }] });
    }
    if (url === '/almoxarifado/materiais/10/series?status=EM_ESTOQUE') return Promise.resolve({ data: seriesEmEstoque });
    if (url === '/almoxarifado/materiais/10/series?status=BLOQUEADA') return Promise.resolve({ data: seriesBloqueadas });
    if (url === '/almoxarifado/materiais/10/lotes?com_saldo=1') return Promise.resolve({ data: lotes });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { success: true } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function esperar() {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

function preencher(elemento, valor) {
  const proto = elemento.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
    : elemento.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

const selects = () => [...container.querySelectorAll('.almox-modal select.almox-form-select')];
const campoQuantidade = () => container.querySelector('.almox-modal input[type="number"]');
const selectDoRotulo = (texto) => [...container.querySelectorAll('.almox-modal label.almox-label')]
  .find((l) => l.textContent === texto)?.parentElement.querySelector('select');
const lista = () => container.querySelector('#mov-series-transferencia');
const caixa = (id) => container.querySelector(`#mov-series-transferencia input[data-serie-id="${id}"]`);
const linha = (id) => caixa(id)?.closest('label');
const ordem = () => [...container.querySelectorAll('#mov-series-transferencia input[data-serie-id]')].map((i) => Number(i.dataset.serieId));
const fraseLote = () => container.querySelector('#mov-series-transferencia-lote');
const dica = () => container.querySelector('#mov-series-transferencia-dica');
const contador = () => container.querySelector('#mov-series-transferencia-contador')?.textContent.trim();

async function abrir(tipo, quantidade = '1', material = '10') {
  await act(async () => {
    root.render(<MemoryRouter><MovimentacoesAlmoxarifado /></MemoryRouter>);
  });
  await esperar();
  const botaoNova = [...container.querySelectorAll('.almox-header-actions button')]
    .find((b) => b.textContent.includes('Nova Movimentação'));
  await act(async () => { botaoNova.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperar();
  preencher(selects()[0], material);
  preencher(selects()[1], tipo);
  await esperar();
  await esperar();
  preencher(campoQuantidade(), quantidade);
}

function clicar(el) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

async function enviar() {
  const motivo = [...container.querySelectorAll('.almox-modal input.almox-input')]
    .find((i) => i.previousElementSibling?.textContent?.startsWith('Motivo'));
  if (motivo) preencher(motivo, 'uso');
  const form = container.querySelector('.almox-modal form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await esperar();
}
const postsV2 = () => api.post.mock.calls.filter(([url]) => url === '/almoxarifado/movimentacoes/v2');
const getsDasSeries = () => api.get.mock.calls.filter(([url]) => url.startsWith('/almoxarifado/materiais/10/series?')).length;

describe('Etapa 265 — a transferência de material com série escolhe as séries (RN-265.06)', () => {
  test('[RN-265.06] a lista aparece só na Transferência de material com série', async () => {
    seriesEmEstoque = [serie(301, 'S1')];
    await abrir('TRANSFERENCIA');
    expect(lista()).not.toBeNull();
    expect(container.textContent).toContain('Séries a transferir *');
    expect(caixa(301)).not.toBeNull();
    // Saída do mesmo material: a lista da Saída, não a da transferência
    preencher(selects()[1], 'SAIDA');
    await esperar();
    await esperar();
    expect(lista()).toBeNull();
    expect(container.querySelector('#mov-series-saida')).not.toBeNull();
  });

  test('[RN-265.06] material sem série: nem a lista nem a dica', async () => {
    await abrir('TRANSFERENCIA', '1', '20');
    expect(lista()).toBeNull();
    expect(dica()).toBeNull();
    expect(container.textContent).not.toContain('Séries a transferir');
  });

  test('[RN-265.06] EM_ESTOQUE e BLOQUEADA juntas, com a prateleira, "sem prateleira" e "bloqueada"', async () => {
    seriesEmEstoque = [serie(301, 'S1', { locId: 1, loc: 'COR-A-03' }), serie(302, 'S2')];
    seriesBloqueadas = [serie(303, 'S3', { status: 'BLOQUEADA', locId: 2, loc: 'COR-B-01' })];
    await abrir('TRANSFERENCIA');
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/materiais/10/series?status=EM_ESTOQUE');
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/materiais/10/series?status=BLOQUEADA');
    expect(linha(301).textContent).toBe('S1 · COR-A-03');
    expect(linha(302).textContent).toBe('S2 · sem prateleira');
    expect(linha(303).textContent).toBe('S3 · COR-B-01 · bloqueada');
  });

  test('[RN-265.06] as séries da origem escolhida vêm primeiro; sem origem, a ordem recebida', async () => {
    seriesEmEstoque = [serie(301, 'S1', { locId: 1, loc: 'COR-A-03' }), serie(302, 'S2'), serie(304, 'S4', { locId: 2, loc: 'COR-B-01' })];
    seriesBloqueadas = [serie(303, 'S3', { status: 'BLOQUEADA', locId: 2, loc: 'COR-B-01' })];
    await abrir('TRANSFERENCIA');
    expect(ordem()).toEqual([301, 302, 304, 303]);
    preencher(selectDoRotulo('Localização de origem'), '2');
    expect(ordem()).toEqual([304, 303, 301, 302]);
    preencher(selectDoRotulo('Localização de origem'), '1');
    expect(ordem()).toEqual([301, 302, 304, 303]);
  });

  test('[RN-265.06] lote escolhido (FEFO): só as séries do lote; lote em branco: só as sem lote e a frase das séries em lote', async () => {
    seriesEmEstoque = [serie(101, 'A1', { loteId: 7, lote: 'L1' }), serie(301, 'S1')];
    seriesBloqueadas = [serie(102, 'A2', { status: 'BLOQUEADA', loteId: 7, lote: 'L1' })];
    lotes = [LOTE_L1];
    await abrir('TRANSFERENCIA');
    expect(container.querySelector('#mov-lote').value).toBe('7');
    expect(ordem()).toEqual([101, 102]);
    expect(fraseLote()).toBeNull();
    preencher(container.querySelector('#mov-lote'), '');
    expect(ordem()).toEqual([301]);
    expect(fraseLote().textContent).toBe('Há séries em lote: escolha o lote para vê-las.');
  });

  test('[RN-265.06] lote em branco e nenhuma série em lote: sem a frase', async () => {
    seriesEmEstoque = [serie(301, 'S1'), serie(302, 'S2')];
    await abrir('TRANSFERENCIA');
    expect(ordem()).toEqual([301, 302]);
    expect(fraseLote()).toBeNull();
  });

  test('[RN-265.06] a marcada que some ao trocar o lote sai do envio (o lote em branco só leva as sem lote)', async () => {
    seriesEmEstoque = [serie(101, 'A1', { loteId: 7, lote: 'L1' }), serie(301, 'S1')];
    lotes = [LOTE_L1];
    await abrir('TRANSFERENCIA');
    clicar(caixa(101));
    expect(contador()).toBe('1/1 série(s) selecionada(s)');
    preencher(container.querySelector('#mov-lote'), '');
    expect(contador()).toBe('0/1 série(s) selecionada(s)');
    await enviar();
    expect(postsV2()).toHaveLength(0);
  });

  test('[RN-265.06] a dica literal e o contador', async () => {
    seriesEmEstoque = [serie(301, 'S1'), serie(302, 'S2')];
    await abrir('TRANSFERENCIA', '2');
    expect(dica().textContent).toBe('Marque as séries que estão mudando de prateleira: cada uma passa a constar no destino.');
    expect(contador()).toBe('0/2 série(s) selecionada(s)');
    clicar(caixa(302));
    expect(contador()).toBe('1/2 série(s) selecionada(s)');
  });

  test('[RN-265.06] contagem diferente da quantidade -> toast e nenhum POST', async () => {
    seriesEmEstoque = [serie(301, 'S1'), serie(302, 'S2')];
    await abrir('TRANSFERENCIA', '2');
    clicar(caixa(301));
    await enviar();
    expect(toast.error).toHaveBeenCalledWith('Selecione exatamente a quantidade de séries informada');
    expect(postsV2()).toHaveLength(0);
  });

  test('[RN-265.06] contagem certa -> POST v2 TRANSFERENCIA com as séries marcadas', async () => {
    seriesEmEstoque = [serie(301, 'S1', { locId: 1, loc: 'COR-A-03' }), serie(302, 'S2')];
    seriesBloqueadas = [serie(303, 'S3', { status: 'BLOQUEADA', locId: 1, loc: 'COR-A-03' })];
    await abrir('TRANSFERENCIA', '2');
    preencher(selectDoRotulo('Localização de origem'), '1');
    preencher(selectDoRotulo('Localização de destino'), '2');
    clicar(caixa(303));
    clicar(caixa(301));
    await enviar();
    expect(postsV2()).toHaveLength(1);
    const corpo = postsV2()[0][1];
    expect(corpo.tipo).toBe('TRANSFERENCIA');
    expect(corpo.serie_ids).toEqual([303, 301]);
    expect(corpo.localizacao_origem_id).toBe(1);
    expect(corpo.localizacao_destino_id).toBe(2);
  });

  test('[RN-265.06] material sem série: a transferência vai sem serie_ids', async () => {
    await abrir('TRANSFERENCIA', '3', '20');
    await enviar();
    expect(postsV2()).toHaveLength(1);
    expect(postsV2()[0][1].tipo).toBe('TRANSFERENCIA');
    expect(postsV2()[0][1]).not.toHaveProperty('serie_ids');
  });

  test('[RN-265.06] recusa do servidor -> a lista de séries é relida (a levada some), sem reler os lotes', async () => {
    seriesEmEstoque = [serie(301, 'S1'), serie(302, 'S2')];
    await abrir('TRANSFERENCIA');
    clicar(caixa(301));
    const antes = getsDasSeries();
    const lotesAntes = api.get.mock.calls.filter(([u]) => u.includes('/lotes')).length;
    seriesEmEstoque = [serie(302, 'S2')];
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'serie S1 nao esta presente' } } });
    await enviar();
    await esperar();
    expect(toast.error).toHaveBeenCalledWith('serie S1 nao esta presente');
    expect(getsDasSeries()).toBe(antes + 2); // EM_ESTOQUE e BLOQUEADA
    expect(api.get.mock.calls.filter(([u]) => u.includes('/lotes')).length).toBe(lotesAntes);
    expect(caixa(301)).toBeNull();
    expect(contador()).toBe('0/1 série(s) selecionada(s)');
  });
});
