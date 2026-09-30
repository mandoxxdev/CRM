/**
 * Etapa 56 (T2, RN-03/04) — "Confirmar endereço lido" no formulário de nova movimentação.
 *
 * O campo é opcional e segue a regra dos selects de localização: destino para ENTRADA e
 * TRANSFERÊNCIA, origem para SAÍDA, PERDA e TRANSFERÊNCIA. Aceita o código puro ou a URL da
 * etiqueta (extrai `codigo`); o body leva `codigo_lido_origem`/`codigo_lido_destino` só quando
 * preenchidos. Quem compara e recusa é o servidor — a tela só mostra `err.response.data.error`.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MovimentacoesConfirmacaoLeitura --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'react-toastify';
import MovimentacoesAlmoxarifado from './MovimentacoesAlmoxarifado';
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

jest.mock('./ExtratoMaterialModal', () => ({ __esModule: true, default: () => null }));

const URL_ETIQUETA = `https://crm.gmp.ind.br/almoxarifado/mapa?loc=2&codigo=${encodeURIComponent('A&B#1+2')}`;

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais') {
      return Promise.resolve({ data: [{ id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC', quantidade_atual: 50 }] });
    }
    if (url === '/almoxarifado/localizacoes') {
      return Promise.resolve({ data: [{ id: 1, codigo: 'COR-A-03' }, { id: 2, codigo: 'A&B#1+2' }] });
    }
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

async function abrirModal() {
  await act(async () => {
    root.render(<MemoryRouter><MovimentacoesAlmoxarifado /></MemoryRouter>);
  });
  await esperar();
  const botaoNova = [...container.querySelectorAll('.almox-header-actions button')]
    .find((b) => b.textContent.includes('Nova Movimentação'));
  await act(async () => { botaoNova.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
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
const seletorMaterial = () => selects()[0];
const seletorTipo = () => selects()[1];
const selectPorRotulo = (rotulo) => selects().find((s) => s.previousElementSibling?.textContent === rotulo);
const campoDestino = () => container.querySelector('#mov-codigo-lido-destino');
const campoOrigem = () => container.querySelector('#mov-codigo-lido-origem');

async function montar(tipo, quantidade = '5') {
  await abrirModal();
  preencher(seletorMaterial(), '10');
  preencher(seletorTipo(), tipo);
  await esperar();
  preencher(container.querySelector('.almox-modal input[type="number"]'), quantidade);
  const motivo = [...container.querySelectorAll('.almox-modal input.almox-input')]
    .find((i) => i.previousElementSibling?.textContent?.startsWith('Motivo'));
  if (motivo) preencher(motivo, 'teste');
}

async function enviar() {
  const form = container.querySelector('.almox-modal form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await esperar();
}

const body = () => {
  const chamada = api.post.mock.calls.find(([url]) => url === '/almoxarifado/movimentacoes/v2');
  expect(chamada).toBeTruthy();
  return chamada[1];
};

describe('quais campos de confirmação aparecem (mesma regra dos selects de localização)', () => {
  test.each([
    ['ENTRADA', true, false],
    ['SAIDA', false, true],
    ['PERDA', false, true],
    ['TRANSFERENCIA', true, true],
    ['AJUSTE', false, false],
  ])('%s: destino=%s origem=%s', async (tipo, destino, origem) => {
    await abrirModal();
    preencher(seletorTipo(), tipo);
    expect(!!campoDestino()).toBe(destino);
    expect(!!campoOrigem()).toBe(origem);
    expect(!!selectPorRotulo('Localização de destino')).toBe(destino);
    expect(!!selectPorRotulo('Localização de origem')).toBe(origem);
  });
});

describe('o que vai no POST', () => {
  test('ENTRADA com a URL da etiqueta lida: manda o código extraído (decodificado) no destino', async () => {
    await montar('ENTRADA');
    preencher(selectPorRotulo('Localização de destino'), '2');
    preencher(campoDestino(), `  ${URL_ETIQUETA}  `);
    await enviar();
    expect(body()).toEqual(expect.objectContaining({ tipo: 'ENTRADA', localizacao_destino_id: 2, codigo_lido_destino: 'A&B#1+2' }));
    expect(body()).not.toHaveProperty('codigo_lido_origem');
  });

  test('SAIDA com código puro lido: manda na origem', async () => {
    await montar('SAIDA');
    preencher(selectPorRotulo('Localização de origem'), '1');
    preencher(campoOrigem(), ' cor-a-03 ');
    await enviar();
    expect(body()).toEqual(expect.objectContaining({ tipo: 'SAIDA', localizacao_origem_id: 1, codigo_lido_origem: 'cor-a-03' }));
    expect(body()).not.toHaveProperty('codigo_lido_destino');
  });

  test('TRANSFERENCIA com os dois lidos: manda os dois', async () => {
    await montar('TRANSFERENCIA');
    preencher(selectPorRotulo('Localização de origem'), '1');
    preencher(selectPorRotulo('Localização de destino'), '2');
    preencher(campoOrigem(), 'COR-A-03');
    preencher(campoDestino(), URL_ETIQUETA);
    await enviar();
    expect(body()).toEqual(expect.objectContaining({ codigo_lido_origem: 'COR-A-03', codigo_lido_destino: 'A&B#1+2' }));
  });

  test('URL estragada pelo layout do teclado: manda o texto cru (o servidor recusa com a mensagem dele)', async () => {
    const estragada = 'httpsÇ;;crm.gmp.ind.br;almoxarifado;mapa°loc=2/codigo=A-01';
    await montar('ENTRADA');
    preencher(campoDestino(), estragada);
    await enviar();
    expect(body().codigo_lido_destino).toBe(estragada);
  });

  test('vazio ou só espaços: NÃO manda a chave (ausente = comportamento de antes)', async () => {
    await montar('TRANSFERENCIA');
    preencher(selectPorRotulo('Localização de origem'), '1');
    preencher(selectPorRotulo('Localização de destino'), '2');
    preencher(campoOrigem(), '   ');
    await enviar();
    expect(body()).not.toHaveProperty('codigo_lido_origem');
    expect(body()).not.toHaveProperty('codigo_lido_destino');
  });

  test('trocar de tipo limpa o campo que o novo tipo não mostra (não vaza escondido para o body)', async () => {
    await montar('TRANSFERENCIA');
    preencher(campoOrigem(), 'COR-A-03');
    preencher(campoDestino(), 'A-01');
    preencher(seletorTipo(), 'ENTRADA');         // origem some; destino continua
    preencher(seletorTipo(), 'TRANSFERENCIA');   // origem volta — vazia
    expect(campoOrigem().value).toBe('');
    expect(campoDestino().value).toBe('A-01');
    await enviar();
    expect(body()).not.toHaveProperty('codigo_lido_origem');
    expect(body().codigo_lido_destino).toBe('A-01');
  });

  test('Enter do leitor no campo não submete o formulário', async () => {
    await montar('ENTRADA');
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    act(() => { campoDestino().dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
  });

  test('recusa do servidor: a tela mostra a mensagem dele, literal', async () => {
    const msg = 'Endereço lido (A-01) não confere com a localização de destino (A&B#1+2) — se a etiqueta é antiga, reimprima';
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { error: msg } } });
    await montar('ENTRADA');
    preencher(selectPorRotulo('Localização de destino'), '2');
    preencher(campoDestino(), 'A-01');
    await enviar();
    expect(toast.error).toHaveBeenCalledWith(msg);
  });
});
