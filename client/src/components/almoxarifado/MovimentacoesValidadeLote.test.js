/**
 * Etapa 190 (T3, RN-190.10) — a validade do lote na Entrada manual (C450). Na Entrada, com o campo Lote preenchido, aparece
 * "Validade do lote" (`<input type="date" id="mov-validade">`, opcional). O payload de `POST /almoxarifado/movimentacoes/v2` leva
 * `data_validade` só com Entrada + lote + data; apagar o lote ou trocar o tipo zera a data. O servidor devolve `aviso_validade`
 * (texto literal) — a tela o mostra num `toast.warn` que não fecha sozinho, depois dos avisos de caixa/retenção. 400 → toast.error
 * com a literal e o modal aberto, a data preservada. Mock só na fronteira HTTP, com as respostas do contrato congelado do plano.
 * Molde: MovimentacoesAvisoRetencao.test.js (a mesma montagem).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MovimentacoesValidadeLote --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MovimentacoesAlmoxarifado from './MovimentacoesAlmoxarifado';
import { toast } from 'react-toastify';
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

jest.mock('./ExtratoMaterialModal', () => ({
  __esModule: true,
  default: () => null,
}));

// As literais do contrato (plano da Etapa 190) — o texto do servidor, que a tela mostra como veio.
const AVISO_PREENCHIDA = 'O lote L-1 não tinha validade; ela foi gravada agora (31/03/2027) e vale também para o saldo que já estava nele.';
const CONFLITO = 'O lote L-1 já tem validade 31/01/2027. A validade é do lote, não da entrada: deixe o campo em branco ou informe a '
  + 'mesma data. Se a validade gravada está errada, peça a correção do lote.';
const TEXTO_AJUDA = 'Opcional. Se o lote já existe com validade, deixe em branco.';

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/movimentacoes') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/materiais') {
      return Promise.resolve({ data: [{ id: 10, codigo: 'MAT-1', nome: 'Cola PU', unidade: 'UN', quantidade_atual: 5 }] });
    }
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 1, saldo_anterior: 0, saldo_posterior: 5 } });
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

async function renderizar() {
  await act(async () => {
    root.render(<MemoryRouter><MovimentacoesAlmoxarifado /></MemoryRouter>);
  });
  await esperar();
}

function preencher(elemento, valor) {
  const proto = elemento.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

const selects = () => [...container.querySelectorAll('.almox-modal select.almox-form-select')];
const campoLote = () => container.querySelector('#mov-lote');
const campoValidade = () => container.querySelector('#mov-validade');

async function abrirEntrada() {
  await renderizar();
  const botaoNova = [...container.querySelectorAll('.almox-header-actions button')]
    .find((b) => b.textContent.includes('Nova Movimentação'));
  await act(async () => { botaoNova.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperar();
  preencher(selects()[0], '10');
  preencher(selects()[1], 'ENTRADA');
  await esperar();
  preencher(container.querySelector('.almox-modal input[type="number"]'), '5');
}

async function enviar() {
  const form = container.querySelector('.almox-modal form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await esperar();
}

const payload = () => {
  const chamada = api.post.mock.calls.find(([u]) => u === '/almoxarifado/movimentacoes/v2');
  return chamada ? chamada[1] : null;
};

describe('Movimentação — validade do lote na Entrada (Etapa 190, RN-190.10)', () => {
  test('[RN-190.10] campo aparece so com Entrada e lote', async () => {
    await abrirEntrada();
    expect(campoLote()).not.toBeNull();
    expect(campoValidade()).toBeNull();
    preencher(campoLote(), 'L-1');
    expect(campoValidade()).not.toBeNull();
    expect(campoValidade().type).toBe('date');
    const rotulo = container.querySelector('label[for="mov-validade"]');
    expect(rotulo && rotulo.textContent).toBe('Validade do lote');
    expect(container.querySelector('.almox-modal').textContent).toContain(TEXTO_AJUDA);
    preencher(selects()[1], 'SAIDA');
    await esperar();
    expect(campoValidade()).toBeNull();
  });

  test('[RN-190.10] payload leva data_validade', async () => {
    await abrirEntrada();
    preencher(campoLote(), 'L-1');
    preencher(campoValidade(), '2027-03-31');
    await enviar();
    expect(payload()).toMatchObject({ tipo: 'ENTRADA', lote: 'L-1', data_validade: '2027-03-31' });
  });

  test('[RN-190.10] sem data, sem chave', async () => {
    await abrirEntrada();
    preencher(campoLote(), 'L-1');
    await enviar();
    expect(payload()).not.toBeNull();
    expect(payload().lote).toBe('L-1');
    expect(Object.prototype.hasOwnProperty.call(payload(), 'data_validade')).toBe(false);
  });

  test('[RN-190.10] apagar o lote zera a validade', async () => {
    await abrirEntrada();
    preencher(campoLote(), 'L-1');
    preencher(campoValidade(), '2027-03-31');
    preencher(campoLote(), '');
    expect(campoValidade()).toBeNull();
    preencher(campoLote(), 'L-2');
    expect(campoValidade().value).toBe('');
    await enviar();
    expect(payload().lote).toBe('L-2');
    expect(Object.prototype.hasOwnProperty.call(payload(), 'data_validade')).toBe(false);
  });

  test('[RN-190.10] trocar de tipo zera a validade', async () => {
    await abrirEntrada();
    preencher(campoLote(), 'L-1');
    preencher(campoValidade(), '2027-03-31');
    preencher(selects()[1], 'AJUSTE');
    await esperar();
    preencher(selects()[1], 'ENTRADA');
    await esperar();
    preencher(campoLote(), 'L-1');
    expect(campoValidade().value).toBe('');
  });

  test('[RN-190.10] aviso_validade vira toast.warn persistente, depois do sucesso e dos outros avisos', async () => {
    api.post.mockResolvedValue({ data: { id: 1, saldo_anterior: 6, saldo_posterior: 11, aviso_retencao: 'RET', aviso_validade: AVISO_PREENCHIDA } });
    await abrirEntrada();
    preencher(campoLote(), 'L-1');
    preencher(campoValidade(), '2027-03-31');
    await enviar();
    expect(toast.success).toHaveBeenCalledWith('Movimentação registrada!');
    expect(toast.warn).toHaveBeenCalledTimes(2);
    expect(toast.warn.mock.calls[0]).toEqual(['RET', { autoClose: false }]);
    expect(toast.warn.mock.calls[1]).toEqual([AVISO_PREENCHIDA, { autoClose: false }]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('[RN-190.10] sem aviso_validade: so o sucesso', async () => {
    await abrirEntrada();
    preencher(campoLote(), 'L-1');
    preencher(campoValidade(), '2027-03-31');
    await enviar();
    expect(toast.success).toHaveBeenCalledWith('Movimentação registrada!');
    expect(toast.warn).not.toHaveBeenCalled();
  });

  test('[RN-190.10] 400 CONFLITO mantem o modal e a data', async () => {
    api.post.mockRejectedValue({ response: { status: 400, data: { error: CONFLITO } } });
    await abrirEntrada();
    preencher(campoLote(), 'L-1');
    preencher(campoValidade(), '2027-03-31');
    await enviar();
    expect(toast.error).toHaveBeenCalledWith(CONFLITO);
    expect(container.querySelector('.almox-modal')).not.toBeNull();
    expect(campoValidade().value).toBe('2027-03-31');
    expect(campoLote().value).toBe('L-1');
  });
});
