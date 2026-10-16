/**
 * Etapa 128 (T4, RN-18) — o aviso da retenção no ajuste com endereço (C209). O servidor grava a contagem e, quando o disponível
 * ficou NEGATIVO com reserva, bloqueio, inspeção ou terceiros acima do estoque, devolve `aviso_retencao` (literal A2 do plano) na
 * resposta 201 de `POST /almoxarifado/movimentacoes/v2`. A tela mostra o texto do servidor, LITERAL, num `toast.warn` que não
 * fecha sozinho, depois do sucesso e depois do `aviso_caixa` quando os dois vêm. Sem a chave (ou não-texto), só o sucesso.
 * Molde: MovimentacoesAvisoCaixa.test.js (a mesma montagem).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MovimentacoesAvisoRetencao --watchAll=false
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

const AVARIA = { id: 7, nome: 'Avaria no manuseio', tipos: ['AJUSTE', 'PERDA'], ativo: 1 };
const MOTIVOS_POR_TIPO = { AJUSTE: [AVARIA] };

const ehMotivos = (url) => String(url).startsWith('/almoxarifado/motivos-movimentacao');
const tipoDaUrl = (url) => new URLSearchParams(String(url).split('?')[1] || '').get('tipo');

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/movimentacoes') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/materiais') {
      return Promise.resolve({ data: [{ id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC', quantidade_atual: 50 }] });
    }
    if (ehMotivos(url)) {
      return Promise.resolve({ data: MOTIVOS_POR_TIPO[tipoDaUrl(url)] || [] });
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
const selectMotivo = () => container.querySelector('#mov-motivo-cadastro');

async function abrirCom(tipo) {
  await renderizar();
  const botaoNova = [...container.querySelectorAll('.almox-header-actions button')]
    .find((b) => b.textContent.includes('Nova Movimentação'));
  await act(async () => { botaoNova.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperar();
  preencher(selects()[0], '10');
  preencher(selects()[1], tipo);
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

const A1 = 'Ajuste gravado, mas o disponível de MAT-1 ficou em 0 PC, abaixo dos 4 PC separados para a requisição REQ-1: a '
  + 'entrega fica limitada ao disponível. Se o material está na caixa, a contagem não o incluiu — estorne o ajuste que '
  + 'baixou o estoque (perfil Administrador ou Gestor do almoxarifado); se ele se perdeu, devolva-o à prateleira na requisição.';

async function ajustar(resposta) {
  api.post.mockResolvedValue(resposta);
  await abrirCom('AJUSTE');
  preencher(selectMotivo(), '7');
  await enviar();
  expect(payload()).not.toBeNull();
}

const A2 = 'Ajuste gravado, mas o disponível de MAT-1 ficou negativo: o estoque (0 PC) é menor que o retido (reservada: 4, '
  + 'total retido: 4 PC), e nada dele sai pela entrega de requisição enquanto for assim. Se o material existe e a contagem não '
  + 'o incluiu, estorne o ajuste que baixou o estoque (perfil Administrador ou Gestor do almoxarifado); se ele se perdeu, libere '
  + 'da reserva ou do bloqueio o que se perdeu.';

describe('Movimentação — aviso da retenção no ajuste com endereço (Etapa 128, RN-18)', () => {
  test('[128 RN-18] com aviso_retencao: o sucesso E o aviso literal, sem fechar sozinho, depois do sucesso', async () => {
    await ajustar({ data: { id: 1, saldo_anterior: 4, saldo_posterior: 0, aviso_retencao: A2 } });
    expect(toast.success).toHaveBeenCalledWith('Movimentação registrada!');
    expect(toast.warn).toHaveBeenCalledTimes(1);
    expect(toast.warn).toHaveBeenCalledWith(A2, { autoClose: false });
    expect(toast.success.mock.invocationCallOrder[0]).toBeLessThan(toast.warn.mock.invocationCallOrder[0]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('[128 RN-18] os dois avisos: o da caixa primeiro, o da retenção depois, cada um literal', async () => {
    await ajustar({ data: { id: 1, saldo_anterior: 4, saldo_posterior: 0, aviso_caixa: A1, aviso_retencao: A2 } });
    expect(toast.warn).toHaveBeenCalledTimes(2);
    expect(toast.warn.mock.calls[0]).toEqual([A1, { autoClose: false }]);
    expect(toast.warn.mock.calls[1]).toEqual([A2, { autoClose: false }]);
  });

  test('[128 RN-18] sem aviso_retencao: só o sucesso (metade positiva: o sucesso apareceu)', async () => {
    await ajustar({ data: { id: 1, saldo_anterior: 4, saldo_posterior: 2 } });
    expect(toast.success).toHaveBeenCalledWith('Movimentação registrada!');
    expect(toast.warn).not.toHaveBeenCalled();
  });

  test('[128 RN-18] aviso_retencao que não é texto (objeto, vazio, número): só o sucesso', async () => {
    for (const ruim of [{ x: 1 }, '', 7, null]) {
      jest.clearAllMocks();
      act(() => root.unmount());
      root = createRoot(container);
      await ajustar({ data: { id: 1, saldo_anterior: 4, saldo_posterior: 0, aviso_retencao: ruim } });
      expect(toast.success).toHaveBeenCalledWith('Movimentação registrada!');
      expect(toast.warn).not.toHaveBeenCalled();
    }
  });
});
