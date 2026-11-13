/**
 * Etapa 234 (D (233) 2; B1533) — na Saída e na Perda avulsas (Movimentações → Nova Movimentação) de material com série e sem controle
 * de lote, com o lote em branco, a tela diz de qual lote as séries marcadas saem; com séries de lotes diferentes ela avisa e o envio para
 * (o servidor recusa — uma saída por lote). Todas sem lote, lote escolhido ou material com controle de lote: nada muda.
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa234-saida-avulsa-lote-das-series.md (RN-234.06).
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MovimentacoesSaidaLoteDasSeries --watchAll=false
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
];
const ok = { lote_status: 'ATIVO', lote_validade: null, lote_esta_impedido: false, lote_vencido_sem_liberacao: false };
const serie = (id, numero, loteId, lote, situacao) => ({ id, numero, status: 'EM_ESTOQUE', lote_id: loteId, lote_codigo: lote, ...situacao });
const BLOQUEADO = { lote_status: 'BLOQUEADO', lote_validade: null, lote_esta_impedido: true, lote_vencido_sem_liberacao: false };
const REPROVADO = { lote_status: 'REPROVADO', lote_validade: null, lote_esta_impedido: true, lote_vencido_sem_liberacao: false };
const VENCIDO = { lote_status: 'ATIVO', lote_validade: '2026-11-12', lote_esta_impedido: true, lote_vencido_sem_liberacao: true };

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
    if (url === '/almoxarifado/localizacoes') return Promise.resolve({ data: [{ id: 1, codigo: 'COR-A-03' }] });
    if (url === '/almoxarifado/materiais/10/series?status=EM_ESTOQUE') return Promise.resolve({ data: seriesEmEstoque });
    if (url === '/almoxarifado/materiais/10/series?status=BLOQUEADA') return Promise.resolve({ data: seriesBloqueadas });
    if (url === '/almoxarifado/materiais/10/lotes?com_saldo=1') return Promise.resolve({ data: lotes });
    return Promise.resolve({ data: [] }); // lotes: nenhum por padrão -> o lote fica em branco ("Sem lote")
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
const caixa = (id) => container.querySelector(`#mov-series-saida input[data-serie-id="${id}"]`);
const linha = (id) => caixa(id)?.closest('label');
const rotulo = (id) => container.querySelector(`#mov-series-saida [data-serie-situacao="${id}"]`);
const frase = () => container.querySelector('#mov-series-impedidas');
const contadorSaida = () => container.querySelector('#mov-series-saida-contador')?.textContent.trim();

async function abrir(tipo, quantidade = '1') {
  await act(async () => {
    root.render(<MemoryRouter><MovimentacoesAlmoxarifado /></MemoryRouter>);
  });
  await esperar();
  const botaoNova = [...container.querySelectorAll('.almox-header-actions button')]
    .find((b) => b.textContent.includes('Nova Movimentação'));
  await act(async () => { botaoNova.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperar();
  preencher(selects()[0], '10');
  preencher(selects()[1], tipo);
  await esperar();
  await esperar();
  preencher(campoQuantidade(), quantidade);
}

async function trocarTipo(tipo) {
  preencher(selects()[1], tipo);
  await esperar();
  await esperar();
}

function clicar(el) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

const fraseLote = () => container.querySelector('#mov-series-lote-da-saida');
const MISTURA = 'As séries marcadas são de lotes diferentes (L1, L2): faça uma saída para cada lote.';

async function enviar() {
  const motivo = [...container.querySelectorAll('.almox-modal input.almox-input')]
    .find((i) => i.previousElementSibling?.textContent?.startsWith('Motivo'));
  if (motivo) preencher(motivo, 'uso');
  const form = container.querySelector('.almox-modal form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await esperar();
}
const postsV2 = () => api.post.mock.calls.filter(([url]) => url === '/almoxarifado/movimentacoes/v2');

describe('A tela diz de qual lote as séries saem (RN-234.06)', () => {
  test('lote em branco: nada marcado -> sem frase; marca B1 -> "saem do lote L2"', async () => {
    seriesEmEstoque = [serie(101, 'A1', 7, 'L1', ok), serie(201, 'B1', 12, 'L2', ok)];
    await abrir('SAIDA');
    expect(fraseLote()).toBeNull();
    clicar(caixa(201));
    expect(fraseLote().textContent).toBe('As séries marcadas saem do lote L2.');
  });
  test('na Perda também; e o envio com um lote só vai ao servidor sem lote_id (o servidor deriva)', async () => {
    seriesEmEstoque = [serie(101, 'A1', 7, 'L1', ok), serie(201, 'B1', 12, 'L2', ok)];
    await abrir('PERDA');
    clicar(caixa(101));
    expect(fraseLote().textContent).toBe('As séries marcadas saem do lote L1.');
    await enviar();
    expect(postsV2()).toHaveLength(1);
    expect(postsV2()[0][1].serie_ids).toEqual([101]);
    expect(postsV2()[0][1].lote_id).toBeUndefined();
  });
  test('marca A1 e B1 -> a frase de lotes diferentes, e o envio para no toast com ela (sem POST)', async () => {
    seriesEmEstoque = [serie(101, 'A1', 7, 'L1', ok), serie(201, 'B1', 12, 'L2', ok)];
    await abrir('SAIDA', '2');
    clicar(caixa(201));
    clicar(caixa(101));
    expect(fraseLote().textContent).toBe(MISTURA);
    await enviar();
    expect(postsV2()).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith(MISTURA);
    // controle: desmarcando B1 e com quantidade 1, o envio vai
    clicar(caixa(201));
    preencher(campoQuantidade(), '1');
    expect(fraseLote().textContent).toBe('As séries marcadas saem do lote L1.');
    await enviar();
    expect(postsV2()).toHaveLength(1);
  });
  test('série sem lote e série do L1 -> "(L1, sem lote)"', async () => {
    seriesEmEstoque = [serie(101, 'A1', 7, 'L1', ok), serie(301, 'S1', null, null, ok)];
    await abrir('SAIDA', '2');
    clicar(caixa(301));
    clicar(caixa(101));
    expect(fraseLote().textContent).toBe('As séries marcadas são de lotes diferentes (L1, sem lote): faça uma saída para cada lote.');
  });
  test('séries todas sem lote -> sem frase', async () => {
    seriesEmEstoque = [serie(301, 'S1', null, null, ok), serie(302, 'S2', null, null, ok)];
    await abrir('SAIDA', '2');
    clicar(caixa(301));
    clicar(caixa(302));
    expect(fraseLote()).toBeNull();
  });
  test('lote escolhido (FEFO) -> sem frase; controle: em branco, com a mesma marcação, a frase aparece', async () => {
    seriesEmEstoque = [serie(101, 'A1', 7, 'L1', ok), serie(201, 'B1', 12, 'L2', ok)];
    lotes = [{ id: 7, codigo: 'L1', status: 'ATIVO', elegivel: true, saldo: 1 }];
    await abrir('SAIDA');
    expect(container.querySelector('#mov-lote').value).toBe('7');
    clicar(caixa(101));
    expect(caixa(101).checked).toBe(true);
    expect(fraseLote()).toBeNull();
    preencher(container.querySelector('#mov-lote'), '');
    expect(caixa(101).checked).toBe(true); // a marcação continua (A1 segue visível)
    expect(fraseLote().textContent).toBe('As séries marcadas saem do lote L1.');
  });
  test('material COM controle de lote -> sem frase (o servidor pede o lote)', async () => {
    MATERIAIS[0].controle_lote = 1;
    try {
      seriesEmEstoque = [serie(101, 'A1', 7, 'L1', ok), serie(201, 'B1', 12, 'L2', ok)];
      await abrir('SAIDA', '2');
      clicar(caixa(101));
      clicar(caixa(201));
      expect(caixa(201).checked).toBe(true);
      expect(fraseLote()).toBeNull();
    } finally {
      MATERIAIS[0].controle_lote = 0;
    }
  });
});

describe('Fase 5 (revisor de testes): mesmo lote, ordem e lote apagado', () => {
  test('duas séries do MESMO lote -> "saem do lote L1", e o envio vai', async () => {
    seriesEmEstoque = [serie(101, 'A1', 7, 'L1', ok), serie(102, 'A2', 7, 'L1', ok), serie(201, 'B1', 12, 'L2', ok)];
    await abrir('SAIDA', '2');
    clicar(caixa(102));
    clicar(caixa(101));
    expect(fraseLote().textContent).toBe('As séries marcadas saem do lote L1.');
    await enviar();
    expect(postsV2()).toHaveLength(1);
  });
  test('a lista vem com o L2 antes do L1 -> a frase em ordem de código "(L1, L2)"', async () => {
    seriesEmEstoque = [serie(201, 'B1', 7, 'L2', ok), serie(101, 'A1', 12, 'L1', ok)];
    await abrir('SAIDA', '2');
    clicar(caixa(201));
    clicar(caixa(101));
    expect(fraseLote().textContent).toBe(MISTURA);
  });
  test('série com lote_id mas sem lote_codigo (lote apagado) -> "sem lote"', async () => {
    seriesEmEstoque = [serie(101, 'A1', 7, 'L1', ok), serie(301, 'X1', 99, null, ok)];
    await abrir('SAIDA', '2');
    clicar(caixa(301));
    clicar(caixa(101));
    expect(fraseLote().textContent).toBe('As séries marcadas são de lotes diferentes (L1, sem lote): faça uma saída para cada lote.');
  });
});
