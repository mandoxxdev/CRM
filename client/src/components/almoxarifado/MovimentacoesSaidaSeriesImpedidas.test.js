/**
 * Etapa 233 (D (232) 1; B1528-B1530) — na Saída e na Perda avulsas (Movimentações → Nova Movimentação) de material com série, a série
 * que AQUELE tipo não pode baixar vem apagada, com o lote e a situação ao lado, e uma frase embaixo; ela sai da marcação. Saída: lote
 * bloqueado, reprovado ou vencido sem liberação. Perda: só bloqueado ou reprovado (o vencido sai por Perda). O ajuste não muda.
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa233-saida-avulsa-series-lote-impedido.md (RN-233.05 a .09).
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MovimentacoesSaidaSeriesImpedidas --watchAll=false
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

const FRASE_SAIDA = 'Séries de lote bloqueado, reprovado ou vencido vêm apagadas: só saem depois que o lote for liberado na tela Lotes e Séries.';
const FRASE_PERDA = 'Séries de lote bloqueado ou reprovado vêm apagadas: só saem depois que o lote for liberado na tela Lotes e Séries.';

describe('Saída avulsa: a série de lote impedido vem apagada (RN-233.05)', () => {
  test('Saída, lote em branco: B1 (L2 bloqueado) apagada com o rótulo; A1 habilitada; a frase da Saída', async () => {
    seriesEmEstoque = [serie(101, 'A1', 7, 'L1', ok), serie(201, 'B1', 12, 'L2', BLOQUEADO)];
    await abrir('SAIDA');
    expect(caixa(201).disabled).toBe(true);
    expect(rotulo(201).textContent).toBe(' · lote L2 — Bloqueado: não sai');
    expect(linha(201).textContent).not.toContain(' · lote L2 · ');
    expect(caixa(101).disabled).toBe(false);
    expect(rotulo(101)).toBeNull();
    expect(linha(101).textContent).toContain('A1 · lote L1');
    expect(frase().textContent).toBe(FRASE_SAIDA);
  });
  test('controle: sem série impedida -> todas habilitadas e sem frase', async () => {
    seriesEmEstoque = [serie(101, 'A1', 7, 'L1', ok), serie(102, 'A2', 7, 'L1', ok)];
    await abrir('SAIDA');
    expect(caixa(101).disabled).toBe(false);
    expect(caixa(102).disabled).toBe(false);
    expect(frase()).toBeNull();
  });
});

describe('Com um lote escolhido (Fase 5)', () => {
  test('o FEFO escolhe L1: só A1 e A2 na lista, sem frase; controle: com o lote em branco a frase aparece', async () => {
    seriesEmEstoque = [serie(101, 'A1', 7, 'L1', ok), serie(201, 'B1', 12, 'L2', BLOQUEADO)];
    lotes = [{ id: 7, codigo: 'L1', status: 'ATIVO', elegivel: true, saldo: 1 }, { id: 12, codigo: 'L2', status: 'BLOQUEADO', elegivel: false, saldo: 1 }];
    await abrir('SAIDA');
    expect(container.querySelector('#mov-lote').value).toBe('7');
    expect(caixa(101)).toBeTruthy();
    expect(caixa(201)).toBeNull();
    expect(frase()).toBeNull();
    preencher(container.querySelector('#mov-lote'), '');
    expect(caixa(201).disabled).toBe(true);
    expect(frase().textContent).toBe(FRASE_SAIDA);
  });
});

describe('Por tipo: a Perda só apaga bloqueado/reprovado (RN-233.06)', () => {
  test('L2 vencido: na Saída apagada com "Vencido em 12/11/2026"; na Perda habilitada, sem rótulo nem frase', async () => {
    seriesEmEstoque = [serie(101, 'A1', 7, 'L1', ok), serie(201, 'B1', 12, 'L2', VENCIDO)];
    await abrir('SAIDA');
    expect(caixa(201).disabled).toBe(true);
    expect(rotulo(201).textContent).toBe(' · lote L2 — Vencido em 12/11/2026: não sai');
    await trocarTipo('PERDA');
    expect(caixa(201).disabled).toBe(false);
    expect(rotulo(201)).toBeNull();
    expect(frase()).toBeNull();
  });
  test('L2 bloqueado E vencido: na Perda o rótulo só diz "Bloqueado"; na Saída diz os dois (Fase 5)', async () => {
    seriesEmEstoque = [serie(201, 'B1', 12, 'L2', { ...VENCIDO, lote_status: 'BLOQUEADO' })];
    await abrir('PERDA');
    expect(caixa(201).disabled).toBe(true);
    expect(rotulo(201).textContent).toBe(' · lote L2 — Bloqueado: não sai');
    await trocarTipo('SAIDA');
    expect(rotulo(201).textContent).toBe(' · lote L2 — Bloqueado · Vencido em 12/11/2026: não sai');
  });
  test('L2 reprovado na Perda: apagada, "Reprovado", a frase da Perda', async () => {
    seriesEmEstoque = [serie(101, 'A1', 7, 'L1', ok), serie(201, 'B1', 12, 'L2', REPROVADO)];
    await abrir('PERDA');
    expect(caixa(201).disabled).toBe(true);
    expect(rotulo(201).textContent).toBe(' · lote L2 — Reprovado: não sai');
    expect(frase().textContent).toBe(FRASE_PERDA);
  });
});

describe('A série apagada sai da marcação (RN-233.07)', () => {
  test('Perda, L2 vencido: marca B1 (1/1); troca para Saída -> B1 desmarcada (0/1) e o envio não a leva', async () => {
    seriesEmEstoque = [serie(101, 'A1', 7, 'L1', ok), serie(201, 'B1', 12, 'L2', VENCIDO)];
    await abrir('PERDA');
    clicar(caixa(201));
    expect(caixa(201).checked).toBe(true);
    expect(contadorSaida()).toBe('1/1 série(s) selecionada(s)');
    await trocarTipo('SAIDA');
    expect(caixa(201).checked).toBe(false);
    expect(caixa(201).disabled).toBe(true);
    expect(contadorSaida()).toBe('0/1 série(s) selecionada(s)');
    const motivo = [...container.querySelectorAll('.almox-modal input.almox-input')]
      .find((i) => i.previousElementSibling?.textContent?.startsWith('Motivo'));
    if (motivo) preencher(motivo, 'uso');
    const form = container.querySelector('.almox-modal form');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await esperar();
    // Fase 5: com 0 de 1 marcada o envio para antes do servidor (a dica de quantidade) — nada vai, e B1 não vai
    expect(api.post.mock.calls.filter(([url]) => url === '/almoxarifado/movimentacoes/v2')).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith('Selecione exatamente a quantidade de séries informada');
  });
});

describe('Resposta antiga ou valor torto -> como antes (RN-233.08)', () => {
  test('sem os campos, ou com 1 / "true": todas habilitadas, sem rótulo nem frase', async () => {
    seriesEmEstoque = [
      { id: 101, numero: 'A1', status: 'EM_ESTOQUE', lote_id: 7, lote_codigo: 'L1' },
      serie(201, 'B1', 12, 'L2', { ...BLOQUEADO, lote_esta_impedido: 1 }),
      serie(202, 'B2', 12, 'L2', { ...BLOQUEADO, lote_esta_impedido: 'true' }),
    ];
    await abrir('SAIDA');
    [101, 201, 202].forEach((id) => {
      expect(caixa(id).disabled).toBe(false);
      expect(rotulo(id)).toBeNull();
    });
    expect(frase()).toBeNull();
  });
});

describe('O ajuste negativo não apaga (RN-233.09)', () => {
  test('AJUSTE de 2 para 1 com B1 de L2 bloqueado: a caixa habilitada, sem rótulo', async () => {
    seriesEmEstoque = [serie(101, 'A1', 7, 'L1', ok), serie(201, 'B1', 12, 'L2', BLOQUEADO)];
    await abrir('AJUSTE', '1');
    await esperar();
    const c = container.querySelector('#ajuste-serie-baixa input[data-serie-id="201"]');
    expect(c).toBeTruthy();
    expect(c.disabled).toBe(false);
    expect(container.querySelector('#ajuste-serie-baixa [data-serie-situacao]')).toBeNull();
    expect(frase()).toBeNull();
    // Fase 2 I2: marcada no ajuste, continua marcada (a régua por tipo não vale para o ajuste — o servidor aceita)
    clicar(c);
    await esperar();
    expect(container.querySelector('#ajuste-serie-baixa input[data-serie-id="201"]').checked).toBe(true);
    expect(container.querySelector('[data-testid="ajuste-serie-contador"]').textContent.trim()).toBe('1 de 1');
  });
});

