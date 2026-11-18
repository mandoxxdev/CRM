/**
 * Etapa 234 (D (233) 2; B1533) — na Saída e na Perda avulsas (Movimentações → Nova Movimentação) de material com série e sem controle
 * de lote, com o lote em branco, a tela diz de qual lote as séries marcadas saem; com séries de lotes diferentes ela avisa e o envio para
 * (o servidor recusa — uma saída por lote). Todas sem lote, lote escolhido ou material com controle de lote: nada muda.
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa234-saida-avulsa-lote-das-series.md (RN-234.06).
 * Etapa 246 (plano 2026-11-18-almoxarifado-etapa246-saida-avulsa-frase-e-recarga-das-series.md): a frase de um lote só quando o lote tem a
 * peça (RN-246.02) e a lista de séries relida depois de uma recusa (RN-246.03).
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
// Etapa 246 (RN-246.01): `lote_saldo_positivo` como o servidor manda — o saldo do lote da série na régua do motor; null sem lote.
const serie = (id, numero, loteId, lote, situacao, saldoLote = 4) => ({
  id, numero, status: 'EM_ESTOQUE', lote_id: loteId, lote_codigo: lote, lote_saldo_positivo: lote != null ? saldoLote : null, ...situacao,
});
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

describe('Etapa 246 — a frase só quando o lote tem a peça (RN-246.02) e a lista relida depois da recusa (RN-246.03)', () => {
  test('[RN-246.02] lote sem a peça no saldo (série regularizada) -> sem frase; o lote que cobre -> a frase', async () => {
    // X1 diz L1 mas o saldo positivo do L1 é 0 (a peça está no "sem lote"): o servidor grava a saída sem lote (C539)
    seriesEmEstoque = [serie(101, 'X1', 7, 'L1', ok, 0), serie(201, 'B1', 12, 'L2', ok, 2)];
    await abrir('SAIDA');
    clicar(caixa(101));
    expect(caixa(101).checked).toBe(true);
    expect(fraseLote()).toBeNull();
    // metade positiva: trocando para B1 (L2 com 2), a frase aparece
    clicar(caixa(101));
    clicar(caixa(201));
    expect(fraseLote().textContent).toBe('As séries marcadas saem do lote L2.');
  });
  test('[RN-246.02] duas séries do L1 com 1 peça no lote -> sem frase; uma só -> a frase', async () => {
    seriesEmEstoque = [serie(101, 'A1', 7, 'L1', ok, 1), serie(102, 'X1', 7, 'L1', ok, 1)];
    await abrir('SAIDA', '2');
    clicar(caixa(101));
    expect(fraseLote().textContent).toBe('As séries marcadas saem do lote L1.');
    clicar(caixa(102));
    expect(caixa(102).checked).toBe(true);
    expect(fraseLote()).toBeNull();
  });
  test('[RN-246.02] a mistura não olha o saldo: a frase de lotes diferentes continua', async () => {
    seriesEmEstoque = [serie(101, 'A1', 7, 'L1', ok, 0), serie(201, 'B1', 12, 'L2', ok, 0)];
    await abrir('SAIDA', '2');
    clicar(caixa(101));
    clicar(caixa(201));
    expect(fraseLote().textContent).toBe(MISTURA);
  });

  const getsDasSeries = () => api.get.mock.calls.filter(([url]) => url === '/almoxarifado/materiais/10/series?status=EM_ESTOQUE').length;
  test('[RN-246.03] Saída recusada (lote bloqueado no meio) -> a lista é relida, a série volta apagada e desmarcada', async () => {
    seriesEmEstoque = [serie(201, 'B1', 12, 'L2', ok, 2)];
    await abrir('SAIDA');
    clicar(caixa(201));
    expect(caixa(201).checked).toBe(true);
    const antes = getsDasSeries();
    // outra pessoa bloqueou o L2 com o formulário aberto
    seriesEmEstoque = [serie(201, 'B1', 12, 'L2', BLOQUEADO, 2)];
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Lote L2 esta bloqueado e nao pode ser utilizado' } } });
    await enviar();
    await esperar();
    expect(toast.error).toHaveBeenCalledWith('Lote L2 esta bloqueado e nao pode ser utilizado');
    expect(getsDasSeries()).toBe(antes + 1);
    expect(caixa(201).disabled).toBe(true);
    expect(caixa(201).checked).toBe(false);
    expect(rotulo(201).textContent).toContain('lote L2');
    expect(contadorSaida()).toBe('0/1 série(s) selecionada(s)');
  });
  test('[RN-246.03] Perda recusada (série levada por outra pessoa) -> a série some da lista', async () => {
    seriesEmEstoque = [serie(201, 'B1', 12, 'L2', ok, 2), serie(202, 'B2', 12, 'L2', ok, 2)];
    await abrir('PERDA');
    clicar(caixa(201));
    seriesEmEstoque = [serie(202, 'B2', 12, 'L2', ok, 1)];
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'serie B1 nao esta disponivel' } } });
    await enviar();
    await esperar();
    expect(caixa(201)).toBeNull();
    expect(caixa(202)).not.toBeNull();
    expect(contadorSaida()).toBe('0/1 série(s) selecionada(s)');
  });
  test('[RN-246.03] metade positiva: Saída aceita não relê a lista (o formulário fecha)', async () => {
    seriesEmEstoque = [serie(201, 'B1', 12, 'L2', ok, 2)];
    await abrir('SAIDA');
    clicar(caixa(201));
    const antes = getsDasSeries();
    await enviar();
    await esperar();
    expect(postsV2()).toHaveLength(1);
    expect(getsDasSeries()).toBe(antes);
    expect(container.querySelector('.almox-modal form')).toBeNull();
  });
});

describe('Etapa 246 (Fase 5, achado 1) — a releitura depois da recusa que falha não apaga a lista', () => {
  test('[RN-246.03] POST sem resposta e a releitura das séries falha -> a lista e a marcação continuam (sem "Nenhuma série disponível")', async () => {
    seriesEmEstoque = [serie(201, 'B1', 12, 'L2', ok, 2)];
    await abrir('SAIDA');
    clicar(caixa(201));
    const original = api.get.getMockImplementation();
    api.get.mockImplementation((url) => (url === '/almoxarifado/materiais/10/series?status=EM_ESTOQUE'
      ? Promise.reject(new Error('Network Error')) : original(url)));
    api.post.mockRejectedValueOnce(new Error('Network Error'));
    await enviar();
    await esperar();
    expect(toast.error).toHaveBeenCalledWith('Erro ao registrar movimentação');
    expect(api.get.mock.calls.filter(([u]) => u === '/almoxarifado/materiais/10/series?status=EM_ESTOQUE').length).toBeGreaterThan(1);
    expect(caixa(201)).not.toBeNull();
    expect(caixa(201).checked).toBe(true);
    expect(container.querySelector('#mov-series-saida').textContent).not.toContain('Nenhuma série disponível');
    expect(contadorSaida()).toBe('1/1 série(s) selecionada(s)');
  });
  test('[RN-246.03] metade positiva: depois disso, trocar o tipo com a busca falhando limpa a lista (a regra de antes)', async () => {
    seriesEmEstoque = [serie(201, 'B1', 12, 'L2', ok, 2)];
    await abrir('SAIDA');
    clicar(caixa(201));
    const original = api.get.getMockImplementation();
    api.get.mockImplementation((url) => (url === '/almoxarifado/materiais/10/series?status=EM_ESTOQUE'
      ? Promise.reject(new Error('Network Error')) : original(url)));
    api.post.mockRejectedValueOnce(new Error('Network Error'));
    await enviar();
    await esperar();
    expect(caixa(201)).not.toBeNull();
    await trocarTipo('PERDA');
    expect(caixa(201)).toBeNull();
    expect(container.querySelector('#mov-series-saida').textContent).toContain('Nenhuma série disponível');
  });
  test('[RN-246.03] a releitura que ainda não voltou e a troca do tipo: a busca do tipo novo que falha limpa a lista (a chave é material e tipo)', async () => {
    seriesEmEstoque = [serie(201, 'B1', 12, 'L2', ok, 2)];
    await abrir('SAIDA');
    clicar(caixa(201));
    const original = api.get.getMockImplementation();
    // a releitura da recusa fica pendurada; a busca seguinte (o tipo novo) falha
    let chamadas = 0;
    api.get.mockImplementation((url) => {
      if (url !== '/almoxarifado/materiais/10/series?status=EM_ESTOQUE') return original(url);
      chamadas += 1;
      return chamadas === 1 ? new Promise(() => {}) : Promise.reject(new Error('Network Error'));
    });
    api.post.mockRejectedValueOnce(new Error('Network Error'));
    await enviar();
    expect(chamadas).toBe(1);
    await trocarTipo('PERDA');
    expect(chamadas).toBe(2);
    expect(caixa(201)).toBeNull();
    expect(container.querySelector('#mov-series-saida').textContent).toContain('Nenhuma série disponível');
  });
});
