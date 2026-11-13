/**
 * Etapa 211 (RN-211.01, RN-211.04) — Compras → Famílias: quem cadastra material (admin do Compras ou do sistema) grava; o resto vê
 * só o aviso de quem pode (a porta de leitura também recusa). A fronteira HTTP é mockada: `/compras/materiais/aux/minhas-permissoes`
 * e a lista `/compras/materiais/aux/familias?ativo=all`.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import FamiliasCompras, { AVISO_SEM_ACESSO_FAMILIAS } from './FamiliasCompras';
import api from '../../services/api';
import { invalidarAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));

const ROL = { id: 1, codigo: 'ROL', nome: 'Rolamentos', descricao: '', parent_id: null, tipo_uso: 'ambos', ativo: 1, qtd_itens: 0 };
let acoes;
let container; let root;
const tick = async () => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  invalidarAlmoxPermissoes();
  api.get.mockImplementation((url) => {
    if (url === '/compras/materiais/aux/minhas-permissoes') return Promise.resolve({ data: { perfil: 'COMPRAS', acoes } });
    if (url === '/compras/materiais/aux/familias?ativo=all') return Promise.resolve({ data: [ROL] });
    return Promise.resolve({ data: [] });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function render() {
  await act(async () => { root.render(<MemoryRouter><FamiliasCompras /></MemoryRouter>); });
  await tick();
}
const botao = (re) => [...container.querySelectorAll('button')].filter((b) => re.test(b.textContent));

describe('Compras → Famílias — Etapa 211', () => {
  test('[RN-211.01] quem cadastra material: a árvore pelas portas do Compras, com Nova Família e Editar', async () => {
    acoes = { criar_material: true, editar_material: true };
    await render();
    expect(api.get).toHaveBeenCalledWith('/compras/materiais/aux/familias?ativo=all');
    expect(container.textContent).toContain('Rolamentos');
    expect(botao(/Nova Família/)).toHaveLength(1);
    expect(container.textContent).not.toContain(AVISO_SEM_ACESSO_FAMILIAS);
  });

  test('[RN-211.04] quem não cadastra material: só o aviso, sem a árvore e sem pedir a lista', async () => {
    acoes = { criar_material: false, editar_material: false };
    await render();
    expect(container.querySelector('[data-testid="familias-compras-sem-acesso"]').textContent).toContain(AVISO_SEM_ACESSO_FAMILIAS);
    expect(botao(/Nova Família/)).toHaveLength(0);
    expect(api.get).not.toHaveBeenCalledWith('/compras/materiais/aux/familias?ativo=all');
    expect(container.textContent).toContain('Famílias'); // o cabeçalho da página está lá
  });
});
