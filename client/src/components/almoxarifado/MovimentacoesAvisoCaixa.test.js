/**
 * Etapa 104 (T2, RN-06) — o aviso do ajuste com endereço que deixou o estoque abaixo da caixa (C186, B704).
 *
 * O servidor grava a contagem e, quando o total ficou abaixo do material separado na caixa de uma requisição, devolve
 * `aviso_caixa` (literal A1) na resposta 201 de `POST /almoxarifado/movimentacoes/v2`. A tela mostra o texto do
 * servidor, LITERAL, num `toast.warn` que não fecha sozinho, depois do "Movimentação registrada!". Sem a chave (ou com
 * algo que não é texto), só o sucesso.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MovimentacoesAvisoCaixa --watchAll=false
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

describe('Movimentação — aviso da caixa no ajuste com endereço (Etapa 104, RN-06)', () => {
  test('[104 RN-06] com aviso_caixa: o sucesso E o aviso literal, sem fechar sozinho', async () => {
    await ajustar({ data: { id: 1, saldo_anterior: 4, saldo_posterior: 0, aviso_caixa: A1 } });
    expect(toast.success).toHaveBeenCalledWith('Movimentação registrada!');
    expect(toast.warn).toHaveBeenCalledTimes(1);
    expect(toast.warn).toHaveBeenCalledWith(A1, { autoClose: false });
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('[104 RN-06] sem aviso_caixa: só o sucesso', async () => {
    await ajustar({ data: { id: 1, saldo_anterior: 4, saldo_posterior: 0 } });
    expect(toast.success).toHaveBeenCalledWith('Movimentação registrada!');
    expect(toast.warn).not.toHaveBeenCalled();
  });

  test('[104 RN-06] aviso_caixa vazio, não texto, ou resposta sem corpo: só o sucesso (nada quebra)', async () => {
    for (const resposta of [{ data: { id: 1, aviso_caixa: '' } }, { data: { id: 1, aviso_caixa: 42 } }, { data: null }, undefined]) {
      // eslint-disable-next-line no-await-in-loop
      await ajustar(resposta);
      expect(toast.success).toHaveBeenCalledWith('Movimentação registrada!');
      expect(toast.warn).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
      act(() => root.unmount());
      container.remove();
      jest.clearAllMocks();
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }
  });
});
