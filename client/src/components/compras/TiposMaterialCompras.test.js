/**
 * Etapa 215 (RN-215.01, RN-215.04) — Compras → Tipos de Material: quem cadastra material (admin do Compras ou do sistema) grava pelas
 * portas do Compras; o resto vê só o aviso de quem pode, sem a lista. A fronteira HTTP é mockada: `/compras/materiais/aux/minhas-permissoes`,
 * a lista `/compras/materiais/aux/tipos-material` e as gravações `/compras/materiais/tipos-material[/:id]`.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import TiposMaterialCompras, { AVISO_SEM_ACESSO_CATEGORIAS_E_TIPOS } from './TiposMaterialCompras';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { invalidarAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));

const AVISO = 'Seu acesso não permite cadastrar categorias e tipos de material. Peça a um administrador do sistema para marcar '
  + 'você como administrador do módulo Compras.';
const EPI = { id: 4, nome: 'EPI', descricao: 'proteção', icone: '🛡️', cor: '#ef5350', is_epi: 1, is_controlado: 0, requer_assinatura: 1, requer_termo: 0 };
let acoes;
let container; let root; let confirmOriginal;
const tick = async () => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  invalidarAlmoxPermissoes();
  api.get.mockImplementation((url) => {
    if (url === '/compras/materiais/aux/minhas-permissoes') return Promise.resolve({ data: { perfil: 'COMPRAS', acoes } });
    if (url === '/compras/materiais/aux/tipos-material') return Promise.resolve({ data: [EPI] });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 5 } });
  api.put.mockResolvedValue({ data: { id: 4 } });
  api.delete.mockResolvedValue({ data: { success: true } });
  confirmOriginal = window.confirm;
  window.confirm = jest.fn(() => true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { window.confirm = confirmOriginal; act(() => root.unmount()); container.remove(); });

async function render() {
  await act(async () => { root.render(<MemoryRouter><TiposMaterialCompras /></MemoryRouter>); });
  await tick();
}
const botao = (re) => [...container.querySelectorAll('button')].filter((b) => re.test(b.textContent));
const porTitulo = (t) => container.querySelector(`button[title="${t}"]`);
const preencher = (el, valor) => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, valor);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('Compras → Tipos de Material — Etapa 215', () => {
  test('[RN-215.04] a literal exportada é a do plano', () => {
    expect(AVISO_SEM_ACESSO_CATEGORIAS_E_TIPOS).toBe(AVISO);
  });

  test('[RN-215.01] quem cadastra material: os cartões pela porta do Compras, com Novo, Editar e Excluir', async () => {
    acoes = { criar_material: true, editar_material: true };
    await render();
    expect(api.get).toHaveBeenCalledWith('/compras/materiais/aux/tipos-material');
    expect(api.get).not.toHaveBeenCalledWith('/almoxarifado/tipos-material');
    expect(container.textContent).toContain('proteção');
    expect(botao(/Novo Tipo de Material/)).toHaveLength(1);
    expect(porTitulo('Editar')).not.toBeNull();
    expect(porTitulo('Excluir')).not.toBeNull();
    expect(container.textContent).not.toContain(AVISO);
    expect(container.querySelector('.almox-tipos-somente-leitura')).toBeNull();
  });

  test('[RN-215.01] criar, editar e excluir gravam pelas portas /compras/materiais/tipos-material, com os toasts de antes', async () => {
    acoes = { criar_material: true, editar_material: false };
    await render();
    // criar
    await act(async () => { botao(/Novo Tipo de Material/)[0].click(); });
    await act(async () => { preencher(container.querySelector('input.almox-input'), 'Ferramenta'); });
    await act(async () => { botao(/Salvar Tipo/)[0].click(); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][0]).toBe('/compras/materiais/tipos-material');
    expect(api.post.mock.calls[0][1].nome).toBe('Ferramenta');
    expect(toast.success).toHaveBeenCalledWith('Tipo criado!');
    await tick();
    // editar
    await act(async () => { porTitulo('Editar').click(); });
    expect(container.querySelector('input.almox-input').value).toBe('EPI');
    await act(async () => { botao(/Salvar Tipo/)[0].click(); });
    expect(api.put).toHaveBeenCalledWith('/compras/materiais/tipos-material/4', expect.objectContaining({ nome: 'EPI', is_epi: true }));
    expect(toast.success).toHaveBeenCalledWith('Tipo atualizado!');
    await tick();
    // excluir
    await act(async () => { porTitulo('Excluir').click(); });
    expect(window.confirm).toHaveBeenCalledWith('Deletar este tipo? Materiais vinculados perderão o tipo.');
    expect(api.delete).toHaveBeenCalledWith('/compras/materiais/tipos-material/4');
    expect(toast.success).toHaveBeenCalledWith('Tipo removido');
    const gravacoes = [...api.post.mock.calls, ...api.put.mock.calls, ...api.delete.mock.calls];
    expect(gravacoes).toHaveLength(3);
    expect(gravacoes.some(([u]) => u.startsWith('/almoxarifado'))).toBe(false);
  });

  test('[RN-215.04] quem não cadastra material: só o aviso, sem os cartões e sem pedir a lista', async () => {
    acoes = { criar_material: false, editar_material: false };
    await render();
    expect(container.querySelector('[data-testid="tipos-compras-sem-acesso"]').textContent).toContain(AVISO);
    expect(botao(/Novo Tipo de Material/)).toHaveLength(0);
    expect(container.textContent).not.toContain('proteção');
    expect(api.get).toHaveBeenCalledWith('/compras/materiais/aux/minhas-permissoes'); // metade positiva: perguntou quem e
    expect(api.get).not.toHaveBeenCalledWith('/compras/materiais/aux/tipos-material');
    expect(container.querySelector('h1').textContent).toBe('Tipos de Material');
  });
});
