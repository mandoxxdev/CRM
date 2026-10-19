/**
 * Etapa 160 (RN-160.06, C395; T6) — os filtros do navegador do Almoxarifado aparam o termo e nao quebram com material sem nome (o
 * seletor da Nova requisicao; o filtro dos aprovadores das regras), e a lista de Materiais so mostra a resposta do ultimo pedido.
 * O `api` simulado na fronteira HTTP.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import api from '../../services/api';
import RequisicaoForm from './RequisicaoForm';
import TabRegrasAprovacao from './TabRegrasAprovacao';
import MateriaisAlmoxarifado from './MateriaisAlmoxarifado';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: '/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn(), warning: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => {
  const user = { id: 1, nome: 'Admin', role: 'admin', perfil_almoxarifado: 'ADMINISTRADOR' };
  return { useAuth: () => ({ user }) };
});
jest.mock('../../utils/systemPermissions', () => ({ filterVisibleUsers: (users) => users }));
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({ perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false }),
}));

global.IS_REACT_ACT_ENVIRONMENT = true;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
let container; let root;
beforeAll(() => { jest.spyOn(console, 'error').mockImplementation(() => {}); });
beforeEach(() => {
  api.get.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
async function montar(el, entrada = '/') {
  await act(async () => { root.render(<MemoryRouter initialEntries={[entrada]}>{el}</MemoryRouter>); });
  for (let i = 0; i < 6; i++) await act(async () => { await pausa(0); });
}
async function digitar(input, valor) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { set.call(input, valor); input.dispatchEvent(new Event('input', { bubbles: true })); });
  for (let i = 0; i < 4; i++) await act(async () => {});
}

test('[RN-160.06, C395] Nova requisicao: " parafuso " acha o material (aparado); "  " e " p" ficam abaixo das 2 letras; o material sem nome nao quebra', async () => {
  const MATS = [
    { id: 1, nome: 'PARAFUSO M8', codigo: 'PAR-08', unidade: 'UN', quantidade_atual: 40, ativo: 1 },
    { id: 2, nome: null, codigo: 'SEM-NOME-160', unidade: 'UN', quantidade_atual: 5, ativo: 1 },
    { id: 3, nome: 'VÁLVULA ESFERA', codigo: 'VAL-01', unidade: 'UN', quantidade_atual: 5, ativo: 1 },
  ];
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais' || url === '/requisicoes-material/materiais') return Promise.resolve({ data: MATS });
    return Promise.resolve({ data: [] });
  });
  await montar(<RequisicaoForm />, '/almoxarifado/requisicoes/nova');
  const abrir = [...container.querySelectorAll('button')].find((b) => /Adicionar material/i.test(b.textContent));
  if (abrir) await act(async () => { abrir.click(); });
  const input = container.querySelector('input[placeholder="Buscar material por nome ou código..."]');
  expect(input).toBeTruthy();
  const sugestoes = () => [...container.querySelectorAll('div[style*="cursor: pointer"]')].map((d) => d.textContent);
  await digitar(input, ' parafuso ');
  expect(sugestoes().some((t) => t.includes('PARAFUSO M8'))).toBe(true);
  expect(sugestoes().some((t) => t.includes('VÁLVULA'))).toBe(false);
  await digitar(input, 'válvula');
  expect(sugestoes().some((t) => t.includes('VÁLVULA ESFERA'))).toBe(true);
  await digitar(input, 'sem-nome');
  expect(sugestoes().some((t) => t.includes('SEM-NOME-160'))).toBe(true);
  for (const curto of ['  ', ' p ']) {
    await digitar(input, curto);
    expect(sugestoes()).toEqual([]);
  }
});

test('[RN-160.06, C395] Regras de aprovacao: " ana" acha a Ana (antes, comparava sem aparar); a metade negativa', async () => {
  const USUARIOS = [{ id: 11, nome: 'Ana Gestora', email: 'ana@ex.com', ativo: 1 }, { id: 12, nome: 'Bia', email: 'bia@ex.com', ativo: 1 }];
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/regras-aprovacao') return Promise.resolve({ data: [] });
    if (url === '/usuarios') return Promise.resolve({ data: USUARIOS });
    return Promise.resolve({ data: [] });
  });
  await montar(<TabRegrasAprovacao />);
  const nova = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Nova regra'));
  await act(async () => { nova.click(); });
  const form = container.querySelector('[data-testid="form-regra"]');
  const input = form.querySelector('input[placeholder="Buscar usuário..."]');
  const nomes = () => [...form.querySelectorAll('label span')].map((s) => s.textContent).filter((t) => !t.includes('@'));
  await digitar(input, ' ana');
  expect(nomes()).toEqual(['Ana Gestora']);
  await digitar(input, 'GESTORA ');
  expect(nomes()).toEqual(['Ana Gestora']);
  await digitar(input, '  ');
  expect(nomes()).toEqual(['Ana Gestora', 'Bia']);
});

test('[RN-160.06, C395] Materiais: a resposta lenta de um pedido anterior nao troca a lista do ultimo', async () => {
  const pedidos = [];
  api.get.mockImplementation(async (url, cfg) => {
    if (url !== '/almoxarifado/materiais') return { data: [] };
    const s = (cfg && cfg.params && cfg.params.search) || '';
    pedidos.push(s);
    if (s === 'val') {
      await pausa(600); // o pedido de "val" demora e chega depois do de "valv"
      return { data: [{ id: 1, codigo: 'VAL-LENTO', nome: 'RESPOSTA VELHA', quantidade_atual: 1, quantidade_minima: 0 }] };
    }
    if (s === 'valv') return { data: [{ id: 2, codigo: 'VALV-NOVO', nome: 'RESPOSTA DO ULTIMO', quantidade_atual: 1, quantidade_minima: 0 }] };
    return { data: [{ id: 3, codigo: 'TODOS-160', nome: 'TODOS', quantidade_atual: 1, quantidade_minima: 0 }] };
  });
  await montar(<MateriaisAlmoxarifado />);
  await act(async () => { await pausa(350); });
  const input = container.querySelector('.almox-search-input');
  await digitar(input, 'val');
  await act(async () => { await pausa(350); }); // sai o pedido de "val"
  await digitar(input, 'valv');
  await act(async () => { await pausa(350); }); // sai o de "valv", que responde na hora
  expect(container.textContent).toContain('VALV-NOVO');
  await act(async () => { await pausa(500); }); // chega o de "val"
  expect(pedidos).toContain('val');
  expect(container.textContent).toContain('VALV-NOVO');
  expect(container.textContent).not.toContain('VAL-LENTO');
});
