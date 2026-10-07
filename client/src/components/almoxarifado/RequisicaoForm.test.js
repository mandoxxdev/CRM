/**
 * Etapa 67, T4b (Fase 2, critico 1): nenhuma tela gravava `data_necessidade`, entao o "% no
 * prazo" nasceria "—" para sempre. O formulario ganha o campo opcional "Data de necessidade"
 * (<input type="date">, valor AAAA-MM-DD). Contrato do servidor (fd159b6): vazio/ausente = sem
 * prazo; formato invalido -> 400 "data_necessidade deve estar no formato AAAA-MM-DD", que a tela
 * mostra literal no toast.
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=RequisicaoForm
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RequisicaoForm from './RequisicaoForm';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, nome: 'Admin', perfil_almoxarifado: 'ADMINISTRADOR' } }),
}));

const MATERIAL = { id: 5, nome: 'Parafuso M8', codigo: 'PAR-08', unidade: 'UN', quantidade_atual: 40 };

function mockarApi() {
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL] });
    if (url === '/almoxarifado/setores-requisicao') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/centros-custo') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
  api.post.mockResolvedValue({ data: { id: 1, numero: 'REQ-0001', aprovacao: 'manual' } });
}

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockarApi();
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
async function renderizar() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/requisicoes-material/nova?material_id=5']}>
        <RequisicaoForm />
      </MemoryRouter>,
    );
  });
  await esperarEfeitos();
  // RN-A (Etapa 33, da main): toda saida de material exige numero de OS — sem ele o submit para
  // no toast antes do POST. O assunto desta suite e a data de necessidade, entao a OS e
  // preenchida aqui, como pre-condicao, e nao em cada caso.
  await digitarOS('OS 1714');
}
const campoOS = () => [...container.querySelectorAll('.almox-field')]
  .find((d) => /Número da OS/.test(d.querySelector('.almox-label')?.textContent || ''))
  .querySelector('input');
async function digitarOS(valor) {
  const input = campoOS();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
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
async function enviar() {
  const form = container.querySelector('form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await esperarEfeitos();
}

describe('RequisicaoForm — Data de necessidade (Etapa 67, T4b)', () => {
  test('o campo existe, é opcional e é do tipo date, com o rótulo "Data de necessidade"', async () => {
    await renderizar();
    const input = campoData();
    expect(input).toBeTruthy();
    expect(input.required).toBe(false);
    expect(input.closest('.almox-field').textContent).toContain('Data de necessidade');
  });

  test('(+) preenchida: o payload leva data_necessidade "AAAA-MM-DD"', async () => {
    await renderizar();
    await digitarData('2026-10-15');
    await enviar();
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, payload] = api.post.mock.calls[0];
    expect(url).toBe('/almoxarifado/requisicoes');
    expect(payload.data_necessidade).toBe('2026-10-15');
    expect(payload.itens).toEqual([{ material_id: 5, quantidade: 1, observacoes: '' }]);
  });

  test('(−) vazia: o payload NÃO leva a chave data_necessidade (sem prazo)', async () => {
    await renderizar();
    await enviar();
    expect(api.post).toHaveBeenCalledTimes(1);
    const payload = api.post.mock.calls[0][1];
    expect(Object.prototype.hasOwnProperty.call(payload, 'data_necessidade')).toBe(false);
  });

  test('preenchida e depois apagada volta a não mandar a chave', async () => {
    await renderizar();
    await digitarData('2026-10-15');
    await digitarData('');
    await enviar();
    const payload = api.post.mock.calls[0][1];
    expect(Object.prototype.hasOwnProperty.call(payload, 'data_necessidade')).toBe(false);
  });

  test('400 do servidor: o toast mostra o error literal', async () => {
    api.post.mockRejectedValueOnce({
      response: { status: 400, data: { error: 'data_necessidade deve estar no formato AAAA-MM-DD' } },
    });
    await renderizar();
    await digitarData('2026-10-15');
    await enviar();
    expect(toast.error).toHaveBeenCalledWith('data_necessidade deve estar no formato AAAA-MM-DD');
  });
});
