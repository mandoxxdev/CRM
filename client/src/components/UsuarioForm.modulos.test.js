/**
 * Cadastro de usuário — os cartões "Módulos de Acesso" (Etapa 109, G7, RN-109.12).
 *
 * Escrito ANTES de `UsuarioForm` passar a ler os módulos de `constants/modulosMeta.js`. Verde no código
 * antigo em tudo, MENOS no rótulo de engenharia, que muda de propósito ("Engenharia" → "Cálculos de
 * Engenharia", o nome do módulo no resto do sistema — B60). Prende: os 12 cartões e a ordem (as 11 telas
 * + `relatorios`), as descrições, onde aparece "Administrador do módulo" (todos menos Admin), e que salvar
 * um usuário que tem `relatorios` regrava a mesma linha (a lista não filtra o que é salvo).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/UsuarioForm.modulos --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import UsuarioForm from './UsuarioForm';
import api from '../services/api';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
const mockAdmin = { id: 1, nome: 'Admin', role: 'admin' };
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockAdmin, refreshUser: () => Promise.resolve(mockAdmin) }),
}));
jest.mock('../services/api', () => ({ get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn() }));
jest.mock('../services/permissionsCache', () => ({ invalidatePermissionsCache: jest.fn() }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const ESPERADO = [
  ['Comercial', 'Gestão de vendas, propostas e oportunidades'],
  ['Compras', 'Gestão de fornecedores, pedidos e cotações'],
  ['Financeiro', 'Contas a pagar/receber, fluxo de caixa e bancos'],
  ['Operacional', 'Gestão de projetos e atividades'],
  ['Cálculos de Engenharia', 'Cálculos e utilitários de engenharia'],
  ['Engenharia / Projetos', 'Solicitações (cesta), cadastro e OS (projetos)'],
  ['Almoxarifado', 'Materiais, estoque, requisições e conferências'],
  ['Frota', 'Veículos, manutenções, combustível e documentação'],
  ['TODOLIST', 'Kanban de atividades e controle de programação'],
  ['Relatórios', 'Análises e relatórios executivos'],
  ['Administrativo', 'Configurações e gestão do sistema'],
  ['Admin', 'Gestão de usuários e permissões'],
];

let container; let root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(window, 'alert').mockImplementation(() => {});
  api.get.mockImplementation((url) => {
    if (url === '/usuarios/5') {
      return Promise.resolve({ data: { id: 5, nome: 'Fulano', email: 'f@x.com', role: 'usuario', ativo: 1, admin_modulos: '["compras"]' } });
    }
    if (url === '/usuarios/5/grupos') {
      return Promise.resolve({ data: { grupos: [], permissoes: [
        { grupo_id: null, modulo: 'compras', permissao: 1 },
        { grupo_id: null, modulo: 'relatorios', permissao: 1 },
      ] } });
    }
    return Promise.reject(new Error(`GET inesperado ${url}`));
  });
  api.put.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: {} });
  api.delete.mockResolvedValue({ data: {} });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

async function renderEditar() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/admin/usuarios/editar/5']}>
        <Routes><Route path="/admin/usuarios/editar/:id" element={<UsuarioForm />} /></Routes>
      </MemoryRouter>
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const cartoes = () => [...container.querySelectorAll('.modulos-grid .modulo-card')];
const rotulo = (c) => c.querySelector('.modulo-card-content h3').textContent.trim();

test('RN-109.12 os 12 cartões, na ordem de sempre, com as descrições de sempre (engenharia com o nome do módulo)', async () => {
  await renderEditar();
  expect(cartoes().map((c) => [rotulo(c), c.querySelector('.modulo-card-content p').textContent.trim()]))
    .toEqual(ESPERADO);
});

test('RN-109.12 "Administrador do módulo" em todos os cartões menos Admin', async () => {
  await renderEditar();
  const comToggle = cartoes().filter((c) => c.textContent.includes('Administrador do módulo')).map(rotulo);
  expect(comToggle).toEqual(ESPERADO.map((e) => e[0]).filter((n) => n !== 'Admin'));
});

test('RN-109.12 o usuário carregado vem com Compras e Relatórios marcados; salvar regrava os dois e o admin de Compras', async () => {
  await renderEditar();
  const marcados = cartoes().filter((c) => c.querySelector('.modulo-card-header input[type="checkbox"]').checked).map(rotulo);
  expect(marcados).toEqual(['Compras', 'Relatórios']);
  await act(async () => {
    container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(api.put).toHaveBeenCalledWith('/usuarios/5', expect.objectContaining({ admin_modulos: ['compras'] }));
  expect(api.delete).toHaveBeenCalledWith('/permissoes/usuario/5/modulos');
  const gravados = api.post.mock.calls.filter(([url]) => url === '/permissoes').map(([, body]) => body.modulo);
  expect(gravados.sort()).toEqual(['compras', 'relatorios']);
});
