/**
 * Tela de seleção de módulos — os cartões (Etapa 109, G7, RN-109.11).
 *
 * Escrito ANTES de `TipoSelecao` passar a ler os módulos de `constants/modulosMeta.js`, verde no código
 * antigo: prende o que a unificação não pode mudar — os 11 cartões, a ordem desta tela (que não é a das
 * badges), nome, ícone, cor, rota do clique e a descrição (que só aparece na busca), e quem vê o quê
 * (admin vê todos; usuário comum só os módulos com permissão, o resto em "Sem acesso").
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/TipoSelecao.modulos --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  FiTarget, FiTool, FiShoppingCart, FiDollarSign, FiPackage,
  FiSettings, FiSliders, FiBriefcase, FiArchive, FiShield, FiCheckSquare,
} from 'react-icons/fi';
import TipoSelecao from './TipoSelecao';
import { fetchUserPermissions, getCachedUserPermissions } from '../services/permissionsCache';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
let mockUser;
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../hooks/useModulosTipoConfig', () => ({
  useModulosTipoConfig: () => ({ tipoOverrides: {}, updateModuloTipo: jest.fn() }),
}));
let mockPermissoes = [];
// O jest do CRA roda com resetMocks: as implementacoes vao no beforeEach.
jest.mock('../services/permissionsCache', () => ({ fetchUserPermissions: jest.fn(), getCachedUserPermissions: jest.fn() }));
jest.mock('../routes/lazyModules', () => ({ prefetchModule: jest.fn(), prefetchModuleByRoute: jest.fn() }));
jest.mock('./FloatingBallsBackground', () => () => null);
jest.mock('./ProtectedModuleRoute', () => ({ resetModuleSplashSession: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

global.IS_REACT_ACT_ENVIRONMENT = true;

/** O que a tela mostrava até a Etapa 108, literal por literal (lido de `TipoSelecao.todosModulos`). */
const ESPERADO = [
  ['comercial', 'Comercial', 'Vendas, propostas e oportunidades', FiTarget, '/comercial', 'linear-gradient(135deg, #6d28d9 0%, #be185d 100%)'],
  ['frota', 'Frota', 'Gestão completa de veículos, manutenções e custos', FiTool, '/frota', 'linear-gradient(135deg, #ea580c 0%, #b91c1c 100%)'],
  ['compras', 'Compras', 'Fornecedores, pedidos e cotações', FiShoppingCart, '/compras', 'linear-gradient(135deg, #0f766e 0%, #0891b2 100%)'],
  ['financeiro', 'Financeiro', 'Contas, fluxo de caixa e bancos', FiDollarSign, '/financeiro', 'linear-gradient(135deg, #047857 0%, #10b981 100%)'],
  ['operacional', 'Operacional', 'Fábrica, OS e produção', FiPackage, '/fabrica', 'linear-gradient(135deg, #1e40af 0%, #4338ca 100%)'],
  ['administrativo', 'Administrativo', 'Configurações do sistema', FiSettings, '/configuracoes', 'linear-gradient(135deg, #334155 0%, #6d28d9 100%)'],
  ['engenharia', 'Cálculos de Engenharia', 'Tampo, pressão e dimensionamento', FiSliders, '/engenharia', 'linear-gradient(135deg, #b45309 0%, #ea580c 100%)'],
  ['engenharia_projetos', 'Engenharia / Projetos', 'Solicitações e cadastros', FiBriefcase, '/engenharia-projetos', 'linear-gradient(135deg, #3730a3 0%, #6366f1 100%)'],
  ['almoxarifado', 'Almoxarifado', 'Materiais, estoque, requisições e conferências', FiArchive, '/almoxarifado', 'linear-gradient(135deg, #78350f 0%, #a16207 100%)'],
  ['todolist', 'TODOLIST', 'Kanban de atividades e controle de programação', FiCheckSquare, '/todolist', 'linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%)'],
  ['admin', 'Admin', 'Usuários e permissões', FiShield, '/admin', 'linear-gradient(135deg, #450a0a 0%, #991b1b 100%)'],
];

let container; let root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mockNavigate.mockClear();
  mockPermissoes = [];
  fetchUserPermissions.mockImplementation(() => Promise.resolve({ permissoes: mockPermissoes }));
  getCachedUserPermissions.mockImplementation(() => ({ permissoes: mockPermissoes }));
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render() {
  await act(async () => { root.render(<MemoryRouter><TipoSelecao forceShow /></MemoryRouter>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const secao = (titulo) => [...container.querySelectorAll('section')]
  .find((s) => s.querySelector('h2')?.textContent.trim() === titulo);
const nomesNaSecao = (titulo) => [...(secao(titulo)?.querySelectorAll('.orion-tile__nome') || [])]
  .map((h) => h.textContent.trim());
const tile = (nome) => [...container.querySelectorAll('button.orion-tile')]
  .find((b) => b.getAttribute('aria-label').replace(' — sem acesso', '') === nome);
async function buscar(termo) {
  const input = container.querySelector('input[type="search"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, termo);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

test('RN-109.11 admin vê os 11 cartões, na ordem desta tela, com os nomes de sempre', async () => {
  mockUser = { id: 1, nome: 'Admin Teste', role: 'admin' };
  await render();
  expect(nomesNaSecao('Seus módulos')).toEqual(ESPERADO.map((e) => e[1]));
  expect(secao('Sem acesso')).toBeUndefined();
});

test('RN-109.11 cada cartão tem o ícone e a cor de sempre, e o clique leva à rota de sempre', async () => {
  mockUser = { id: 1, nome: 'Admin Teste', role: 'admin' };
  await render();
  for (const [, nome, , Icone, rota, gradiente] of ESPERADO) {
    const b = tile(nome);
    expect(b).toBeTruthy();
    expect(b.style.getPropertyValue('--tile-gradient')).toBe(gradiente);
    expect(b.querySelector('.orion-tile__icon-wrap').innerHTML)
      .toBe(renderToStaticMarkup(<Icone className="orion-tile__icon" />));
    mockNavigate.mockClear();
    await act(async () => { b.click(); });
    expect(mockNavigate).toHaveBeenCalledWith(rota, { replace: true });
  }
});

test('RN-109.11 a busca acha cada módulo pela descrição de sempre', async () => {
  mockUser = { id: 1, nome: 'Admin Teste', role: 'admin' };
  await render();
  for (const [, nome, descricao] of ESPERADO) {
    await buscar(descricao.toLowerCase());
    expect(nomesNaSecao('Resultados')).toContain(nome);
  }
});

test('RN-109.11 quem vê o quê não muda: usuário comum com Compras e Almoxarifado — os dois liberados, os outros 9 em "Sem acesso"', async () => {
  mockUser = { id: 7, nome: 'Comum Teste', role: 'usuario' };
  mockPermissoes = [
    { modulo: 'compras', permissao: 1 }, { modulo: 'almoxarifado', permissao: 1 }, { modulo: 'frota', permissao: 0 },
  ];
  await render();
  expect(nomesNaSecao('Seus módulos')).toEqual(['Compras', 'Almoxarifado']);
  expect(nomesNaSecao('Sem acesso')).toEqual(
    ESPERADO.map((e) => e[1]).filter((n) => !['Compras', 'Almoxarifado'].includes(n))
  );
});

// Etapa 111 (G17, RN-111.08) — "sem nenhuma linha de permissão": a seleção libera só Comercial (o portão de rota
// libera Comercial ou Frota; o servidor, Comercial só sem grupo ativo). Divergência CONGELADA, decisão do P.O. (B63).
test('RN-111.08 usuário sem nenhuma linha de permissão: só Comercial liberado, os outros 10 em "Sem acesso"', async () => {
  mockUser = { id: 8, nome: 'Sem Linha', role: 'usuario' };
  mockPermissoes = [];
  await render();
  expect(nomesNaSecao('Seus módulos')).toEqual(['Comercial']);
  expect(nomesNaSecao('Sem acesso')).toEqual(ESPERADO.map((e) => e[1]).filter((n) => n !== 'Comercial'));
});

test('RN-111.08 a busca das permissões falha: só Comercial liberado (como sem linha)', async () => {
  mockUser = { id: 9, nome: 'Falha', role: 'usuario' };
  getCachedUserPermissions.mockImplementation(() => null);
  fetchUserPermissions.mockImplementation(() => Promise.reject(new Error('rede')));
  const erro = jest.spyOn(console, 'error').mockImplementation(() => {});
  await render();
  erro.mockRestore();
  expect(nomesNaSecao('Seus módulos')).toEqual(['Comercial']);
});

// Sem usuário a tela só mostra "Carregando..." — os dois pontos que liberam Comercial sem usuário não têm efeito
// visível (medido na revisão da Fase 5 da 111; o teste abaixo prende isso, e o "usuário sem id" prende o outro ponto).
test('RN-111.08 sem usuário: a tela fica em "Carregando..." e não mostra cartão nenhum', async () => {
  mockUser = null;
  await render();
  expect(container.textContent).toContain('Carregando...');
  expect(container.querySelectorAll('button.orion-tile')).toHaveLength(0);
});

test('RN-111.08 usuário sem id: só Comercial liberado', async () => {
  mockUser = { nome: 'Sem Id', role: 'usuario' };
  await render();
  expect(nomesNaSecao('Seus módulos')).toEqual(['Comercial']);
});
