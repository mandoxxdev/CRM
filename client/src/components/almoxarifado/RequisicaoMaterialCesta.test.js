/**
 * Etapa 67, T4b (Fase 2, critico 1): a cesta de requisicao (setores fora do almoxarifado) ganha
 * o campo opcional "Data de necessidade" (<input type="date">). Payload leva
 * `data_necessidade: 'AAAA-MM-DD'` so quando preenchido (vazio = sem prazo); o 400 de formato do
 * servidor aparece literal no toast.
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=RequisicaoMaterialCesta
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RequisicaoMaterialCesta from './RequisicaoMaterialCesta';
import RequisicoesMaterialContext from './RequisicoesMaterialContext';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

const CTX = {
  setor: 'Administrativo',
  moduloOrigem: 'administrativo',
  basePath: '/configuracoes',
  label: 'Administrativo',
  tipoSetor: 'administrativo',
  useCesta: true,
};
const MATERIAL = { id: 7, nome: 'Caneta azul', codigo: 'CAN-01', unidade: 'UN', disponibilidade: 'em_estoque' };

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => (url === '/requisicoes-material/materiais'
    ? Promise.resolve({ data: [MATERIAL] })
    : Promise.resolve({ data: {} })));
  api.post.mockImplementation((url) => (url === '/requisicoes-material/disponibilidade'
    ? Promise.resolve({ data: [] })
    : Promise.resolve({ data: { id: 1, numero: 'REQ-0002' } })));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => {
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
};
const postsCriacao = () => api.post.mock.calls.filter(([url]) => url === '/requisicoes-material');
function botao(t) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
}
async function clicar(b) {
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
async function renderizarComItem() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <RequisicoesMaterialContext.Provider value={CTX}>
          <RequisicaoMaterialCesta />
        </RequisicoesMaterialContext.Provider>
      </MemoryRouter>,
    );
  });
  await esperarEfeitos();
  await clicar(botao('Adicionar'));
}
const campoData = () => container.querySelector('input[type="date"][name="data_necessidade"]');
async function digitarData(valor) {
  const input = campoData();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('RequisicaoMaterialCesta — Data de necessidade (Etapa 67, T4b)', () => {
  test('o campo existe, é opcional e é do tipo date, com o rótulo "Data de necessidade"', async () => {
    await renderizarComItem();
    const input = campoData();
    expect(input).toBeTruthy();
    expect(input.required).toBe(false);
    expect(input.closest('.engc-obs').textContent).toContain('Data de necessidade');
  });

  test('(+) preenchida: o payload leva data_necessidade "AAAA-MM-DD"', async () => {
    await renderizarComItem();
    await digitarData('2026-11-03');
    await clicar(botao('Enviar solicitação'));
    expect(postsCriacao().length).toBe(1);
    const payload = postsCriacao()[0][1];
    expect(payload.data_necessidade).toBe('2026-11-03');
    expect(payload.itens).toEqual([{ material_id: 7, quantidade: 1 }]);
  });

  test('(−) vazia: o payload NÃO leva a chave data_necessidade (sem prazo)', async () => {
    await renderizarComItem();
    await clicar(botao('Enviar solicitação'));
    expect(postsCriacao().length).toBe(1);
    const payload = postsCriacao()[0][1];
    expect(Object.prototype.hasOwnProperty.call(payload, 'data_necessidade')).toBe(false);
  });

  test('400 do servidor: o toast mostra o error literal', async () => {
    api.post.mockImplementation((url) => (url === '/requisicoes-material'
      ? Promise.reject({ response: { status: 400, data: { error: 'data_necessidade deve estar no formato AAAA-MM-DD' } } })
      : Promise.resolve({ data: [] })));
    await renderizarComItem();
    await digitarData('2026-11-03');
    await clicar(botao('Enviar solicitação'));
    expect(toast.error).toHaveBeenCalledWith('data_necessidade deve estar no formato AAAA-MM-DD');
  });
});
