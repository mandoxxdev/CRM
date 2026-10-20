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
import RecebimentosAlmoxarifado from './RecebimentosAlmoxarifado';

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
jest.mock('../../utils/systemPermissions', () => ({ ...jest.requireActual('../../utils/systemPermissions'), filterVisibleUsers: (users) => users }));
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
  await digitar(input, 'pa'); // Fase 5 r3 C45: a regua esta em 2 letras (nao 3)
  expect(sugestoes().some((t) => t.includes('PARAFUSO M8'))).toBe(true);
});

test('[RN-160.06, C395, Fase 5 r3 C46/C47] Novo recebimento: o seletor de material apara, mede o minimo no aparado e nao quebra com material sem nome', async () => {
  const MATS = [
    { id: 1, nome: 'PARAFUSO M8', codigo: 'PAR-08', unidade: 'UN' },
    { id: 2, nome: null, codigo: 'SEM-NOME-160', unidade: 'UN' },
    { id: 3, nome: 'VÁLVULA ESFERA', codigo: 'VAL-01', unidade: 'UN' },
  ];
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: MATS });
    return Promise.resolve({ data: [] });
  });
  await montar(<RecebimentosAlmoxarifado />);
  const novo = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Novo Recebimento'));
  await act(async () => { novo.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  for (let i = 0; i < 4; i++) await act(async () => { await pausa(0); });
  const modal = container.querySelector('.almox-modal');
  const input = modal.querySelector('input[placeholder="Buscar material..."]');
  expect(input).toBeTruthy();
  const sugestoes = () => [...modal.querySelectorAll('.almox-search-result-item')].map((b) => b.textContent);
  await digitar(input, ' parafuso ');
  expect(sugestoes()).toEqual(['PAR-08 — PARAFUSO M8']);
  await digitar(input, 'válvula');
  expect(sugestoes()).toEqual(['VAL-01 — VÁLVULA ESFERA']);
  await digitar(input, 'sem-nome');
  expect(sugestoes()).toEqual(['SEM-NOME-160 — ']);
  for (const curto of ['  ', ' p ']) {
    await digitar(input, curto);
    expect(sugestoes()).toEqual([]);
  }
  await digitar(input, 'pa');
  expect(sugestoes()).toEqual(['PAR-08 — PARAFUSO M8']);
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
  await digitar(input, 'bia@'); // Fase 5 r3 C51: o e-mail tambem
  expect(nomes()).toEqual(['Bia']);
});

describe('[RN-160.06, C395, Fase 5 r3 C48-C50] os filtros das Configuracoes aparam e nao quebram com campo nulo', () => {
  const DADOS = {
    '/almoxarifado/materiais': [
      { id: 10, codigo: 'M-001', nome: 'PARAFUSO M8', quantidade_atual: 5, unidade: 'UN', quantidade_minima: 2, quantidade_maxima: 9, ponto_pedido: 3, prazo_reposicao_dias: 4 },
      { id: 11, codigo: 'M-SEM-NOME', nome: null, quantidade_atual: 1, unidade: 'UN', quantidade_minima: 0, quantidade_maxima: 0, ponto_pedido: 0, prazo_reposicao_dias: 0 },
    ],
    '/almoxarifado/configuracoes/liberacao-valor': { ativo: true, limite: 800, aprovadorIds: [] },
    '/usuarios': [{ id: 7, nome: 'Ana Aprovadora', email: 'ana@x.com', ativo: 1 }, { id: 8, nome: 'Bruno', email: 'bruno@x.com', ativo: 1 }],
    '/almoxarifado/perfis-usuario': {
      usuarios: [{ id: 7, nome: 'Ana Perfil', email: 'ana@x.com', perfil: null }, { id: 8, nome: 'Bruno Perfil', email: null, perfil: null }],
      perfis: ['PRODUCAO'],
    },
  };
  beforeEach(() => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url in DADOS ? DADOS[url] : [] }));
  });
  const aba = async (tab) => {
    const ConfiguracoesAlmoxarifado = require('./ConfiguracoesAlmoxarifado').default;
    await montar(<ConfiguracoesAlmoxarifado />, `/almoxarifado/configuracoes?tab=${tab}`);
  };
  test('Estoques minimos: " parafuso " acha o material; o sem nome nao quebra e e achado pelo codigo', async () => {
    await aba('estoques');
    const filtro = container.querySelector('input[placeholder="Filtrar materiais..."]');
    expect(filtro).toBeTruthy();
    const codigos = () => [...container.querySelectorAll('tbody tr')].map((tr) => tr.textContent).filter((t) => /M-/.test(t));
    await digitar(filtro, ' parafuso ');
    expect(codigos().length).toBe(1);
    expect(codigos()[0]).toContain('M-001');
    await digitar(filtro, 'm-sem');
    expect(codigos().length).toBe(1);
    expect(codigos()[0]).toContain('M-SEM-NOME');
  });
  test('Liberacao por valor: " ana" acha a Ana; o sem par esvazia', async () => {
    await aba('liberacao-valor');
    const input = container.querySelector('input[placeholder="Buscar usuário..."]');
    expect(input).toBeTruthy();
    const nomes = () => [...container.querySelectorAll('label span')].map((s) => s.textContent).filter((t) => /Ana|Bruno/.test(t) && !t.includes('@'));
    await digitar(input, ' ana');
    expect(nomes()).toEqual(['Ana Aprovadora']);
    await digitar(input, 'nada160');
    expect(nomes()).toEqual([]);
  });
  test('Perfis de acesso: " bruno " acha o Bruno (sem e-mail, nao quebra)', async () => {
    await aba('perfis');
    const input = container.querySelector('input[placeholder="Buscar por nome ou e-mail..."]');
    expect(input).toBeTruthy();
    const linhasDe = () => [...container.querySelectorAll('tbody tr')].map((tr) => tr.textContent);
    await digitar(input, ' bruno ');
    expect(linhasDe().length).toBe(1);
    expect(linhasDe()[0]).toContain('Bruno Perfil');
    await digitar(input, 'ana@');
    expect(linhasDe().length).toBe(1);
    expect(linhasDe()[0]).toContain('Ana Perfil');
  });
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

test('[RN-160.06, Fase 5 r3 C54/C55] Materiais: a falha de um pedido anterior nao mostra o erro, e o carregando so sai com o ultimo', async () => {
  const { toast } = require('react-toastify');
  toast.error.mockClear();
  api.get.mockImplementation(async (url, cfg) => {
    if (url !== '/almoxarifado/materiais') return { data: [] };
    const s = (cfg && cfg.params && cfg.params.search) || '';
    if (s === 'aa') { await pausa(500); throw new Error('o anterior caiu'); }
    if (s === 'aab') { await pausa(700); return { data: [{ id: 2, codigo: 'AAB-160', nome: 'O ULTIMO', quantidade_atual: 1, quantidade_minima: 0 }] }; }
    return { data: [{ id: 3, codigo: 'TODOS-160', nome: 'TODOS', quantidade_atual: 1, quantidade_minima: 0 }] };
  });
  await montar(<MateriaisAlmoxarifado />);
  await act(async () => { await pausa(350); });
  const input = container.querySelector('.almox-search-input');
  await digitar(input, 'aa');
  await act(async () => { await pausa(320); }); // sai o "aa"
  await digitar(input, 'aab');
  await act(async () => { await pausa(320); }); // sai o "aab" (o "aa" ainda em voo)
  await act(async () => { await pausa(300); }); // o "aa" falha agora, depois de o "aab" sair
  expect(toast.error).not.toHaveBeenCalled();
  expect(container.querySelector('.skeleton-table, .almox-loading, [class*="skeleton"]')).toBeTruthy();
  await act(async () => { await pausa(800); });
  expect(container.textContent).toContain('AAB-160');
  expect(toast.error).not.toHaveBeenCalled();
});
