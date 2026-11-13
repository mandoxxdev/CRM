/**
 * Etapa 215 (RN-215.01, RN-215.04) — Compras → Categorias: quem cadastra material grava pelas portas do Compras; o resto vê só o aviso
 * de quem pode, sem a lista. Os gestos de categoria (criar, renomear sem `ativo`, desativar, reativar com `ativo: 1`) estão em
 * `almoxarifado/Categorias.test.js`, montando a mesma aba com `ROTAS_CATEGORIAS_COMPRAS`; aqui, a página e a permissão.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import CategoriasCompras, { AVISO_SEM_ACESSO_CATEGORIAS_E_TIPOS } from './CategoriasCompras';
import api from '../../services/api';
import { invalidarAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));

const AVISO = 'Seu acesso não permite cadastrar categorias e tipos de material. Peça a um administrador do sistema para marcar '
  + 'você como administrador do módulo Compras.';
const CATEGORIAS = [{ id: 3, nome: 'Consumível', ativo: 1 }, { id: 9, nome: 'Obsoleta', ativo: 0 }];
let acoes;
let container; let root;
const tick = async () => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  invalidarAlmoxPermissoes();
  api.get.mockImplementation((url) => {
    if (url === '/compras/materiais/aux/minhas-permissoes') return Promise.resolve({ data: { perfil: 'COMPRAS', acoes } });
    if (url === '/compras/materiais/aux/categorias?todos=1') return Promise.resolve({ data: CATEGORIAS });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 42, nome: 'Elétrico', ativo: 1 } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function render() {
  await act(async () => { root.render(<MemoryRouter><CategoriasCompras /></MemoryRouter>); });
  await tick();
}
const botao = (re) => [...container.querySelectorAll('button')].filter((b) => re.test(b.textContent));
const preencher = (el, valor) => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, valor);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('Compras → Categorias — Etapa 215', () => {
  test('[RN-215.04] a literal é a MESMA de Compras → Tipos de Material', () => {
    expect(AVISO_SEM_ACESSO_CATEGORIAS_E_TIPOS).toBe(AVISO);
  });

  test('[RN-215.01] quem cadastra material: ativas e inativas pela porta do Compras, com Nova, Renomear, Desativar e Reativar', async () => {
    acoes = { criar_material: false, editar_material: true };
    await render();
    expect(api.get).toHaveBeenCalledWith('/compras/materiais/aux/categorias?todos=1');
    expect(container.textContent).toContain('Consumível');
    expect(container.textContent).toContain('Obsoleta');
    expect(botao(/Nova Categoria/)).toHaveLength(1);
    expect(container.querySelector('button[title="Renomear"]')).not.toBeNull();
    expect(container.querySelector('button[title="Desativar"]')).not.toBeNull();
    expect(container.querySelector('button[title="Reativar"]')).not.toBeNull();
    expect(container.textContent).not.toContain(AVISO);
    expect(container.querySelector('.almox-categorias-somente-leitura')).toBeNull();
  });

  test('[RN-215.01] criar grava em /compras/materiais/categorias, não no Almoxarifado', async () => {
    acoes = { criar_material: true, editar_material: true };
    await render();
    await act(async () => { botao(/Nova Categoria/)[0].click(); });
    await act(async () => { preencher(container.querySelector('input.almox-input'), 'Elétrico'); });
    await act(async () => { botao(/Salvar Categoria/)[0].click(); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/compras/materiais/categorias', { nome: 'Elétrico' });
  });

  test('[RN-215.04] quem não cadastra material: só o aviso, sem a lista e sem pedir a lista', async () => {
    acoes = { criar_material: false, editar_material: false };
    await render();
    expect(container.querySelector('[data-testid="categorias-compras-sem-acesso"]').textContent).toContain(AVISO);
    expect(botao(/Nova Categoria/)).toHaveLength(0);
    expect(container.textContent).not.toContain('Consumível');
    expect(api.get).toHaveBeenCalledWith('/compras/materiais/aux/minhas-permissoes'); // metade positiva: perguntou quem e
    expect(api.get).not.toHaveBeenCalledWith('/compras/materiais/aux/categorias?todos=1');
    expect(container.querySelector('h1').textContent).toBe('Categorias');
  });
});
