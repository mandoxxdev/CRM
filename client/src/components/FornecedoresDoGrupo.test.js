/**
 * Etapa 103 (RN-103.07) — a tela de um grupo de fornecedores aberta por endereco: desativado mostra o
 * aviso com "Reativar grupo" e NAO oferece vincular; inexistente diz "Grupo não encontrado".
 *
 * Antes desta etapa o `GET /compras/grupos/:id` de um grupo desativado respondia 404, a tela mostrava
 * o titulo "Grupo" e os botoes "Vincular fornecedor" / "Novo fornecedor" gravavam fornecedor no grupo
 * desativado. O servidor agora recusa (RN-103.08, `comprasGrupoDesativado.api.test.js`); a tela tem de
 * dizer o estado antes do clique.
 *
 * Servidor mockado na fronteira HTTP (`services/api`).
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=FornecedoresDoGrupo
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FornecedoresDoGrupo from './FornecedoresDoGrupo';
import api from '../services/api';
import { toast } from 'react-toastify';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(), defaults: { baseURL: '/api' } },
}));
jest.mock('react-toastify', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn(), warning: jest.fn() }),
}));

const AVISO_DESATIVADO = 'Este grupo está desativado — reative-o para vincular fornecedores.';
const FORN_DO_GRUPO = { id: 11, razao_social: 'ACME LTDA', nome_fantasia: '', status: 'ativo', grupo_id: 7 };
const FORN_LIVRE = { id: 12, razao_social: 'LIVRE LTDA', nome_fantasia: '', status: 'ativo', grupo_id: null };

let container;
let root;
const flush = () => new Promise((r) => setTimeout(r, 0));

/** `grupo` = linha do GET /compras/grupos/7, ou `{ status }` para um erro HTTP. */
function servidor(grupo) {
  api.get.mockImplementation((url) => {
    if (url === '/compras/grupos/7') {
      if (grupo.status) return Promise.reject({ response: { status: grupo.status, data: { error: 'Grupo não encontrado' } } });
      return Promise.resolve({ data: grupo });
    }
    if (url === '/compras/grupos/7/fornecedores') return Promise.resolve({ data: [FORN_DO_GRUPO] });
    if (url === '/compras/fornecedores') return Promise.resolve({ data: [FORN_DO_GRUPO, FORN_LIVRE] });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.put.mockResolvedValue({ data: { message: 'Fornecedor atualizado' } });
  window.confirm = jest.fn(() => true);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/compras/fornecedores-homologados/grupo/7']}>
        <Routes>
          <Route path="/compras/fornecedores-homologados/grupo/:grupoId" element={<FornecedoresDoGrupo />} />
        </Routes>
      </MemoryRouter>
    );
    await flush();
  });
}
async function clicar(el) {
  if (!el) throw new Error('elemento nao existe');
  await act(async () => { el.click(); await flush(); });
}
const botaoComTexto = (re) => [...container.querySelectorAll('button')].find((b) => re.test(b.textContent));
const titulo = () => container.querySelector('h1').textContent;

describe('FornecedoresDoGrupo — RN-103.07 grupo desativado ou inexistente', () => {
  test('pede o grupo com incluir_inativos', async () => {
    servidor({ id: 7, nome: 'Insumos', ativo: 1 });
    await render();
    expect(api.get).toHaveBeenCalledWith('/compras/grupos/7', { params: { incluir_inativos: 1 } });
  });

  test('METADE POSITIVA: grupo ativo — sem aviso, com "Vincular fornecedor" e "Novo fornecedor"', async () => {
    servidor({ id: 7, nome: 'Insumos', ativo: 1 });
    await render();
    expect(titulo()).toBe('Fornecedores – Insumos');
    expect(container.querySelector('[data-testid="aviso-grupo-desativado"]')).toBeNull();
    expect(botaoComTexto(/Vincular fornecedor/)).toBeTruthy();
    expect(botaoComTexto(/Novo fornecedor/)).toBeTruthy();
  });

  test('desativado: aviso literal + "Reativar grupo"; sem Vincular/Novo; Editar e Remover do grupo continuam', async () => {
    servidor({ id: 7, nome: 'Insumos', ativo: 0 });
    await render();
    expect(titulo()).toBe('Fornecedores – Insumos');
    const aviso = container.querySelector('[data-testid="aviso-grupo-desativado"]');
    expect(aviso).not.toBeNull();
    expect(aviso.textContent).toContain(AVISO_DESATIVADO);
    expect(botaoComTexto(/Reativar grupo/)).toBeTruthy();
    expect(botaoComTexto(/Vincular fornecedor/)).toBeUndefined();
    expect(botaoComTexto(/Novo fornecedor/)).toBeUndefined();
    // O fornecedor que ja esta no grupo continua listado, editavel e removivel.
    expect(container.textContent).toContain('ACME LTDA');
    expect(container.querySelector('button[title="Editar fornecedor"]')).not.toBeNull();
    await clicar(container.querySelector('button[title="Remover do grupo"]'));
    expect(api.put).toHaveBeenCalledWith('/compras/fornecedores/11', expect.objectContaining({ grupo_id: null }));
  });

  test('desativado sem fornecedores: o estado vazio tambem nao oferece vincular', async () => {
    servidor({ id: 7, nome: 'Insumos', ativo: 0 });
    api.get.mockImplementation((url) => {
      if (url === '/compras/grupos/7') return Promise.resolve({ data: { id: 7, nome: 'Insumos', ativo: 0 } });
      return Promise.resolve({ data: [] });
    });
    await render();
    expect(container.textContent).toContain('Nenhum fornecedor neste grupo.');
    expect(botaoComTexto(/Vincular fornecedor/)).toBeUndefined();
    expect(container.querySelector('[data-testid="aviso-grupo-desativado"]')).not.toBeNull();
  });

  test('"Reativar grupo" chama POST /reativar, avisa e recarrega — os botoes de vincular voltam', async () => {
    let ativo = 0;
    servidor({ id: 7, nome: 'Insumos', ativo: 0 });
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => (url === '/compras/grupos/7'
      ? Promise.resolve({ data: { id: 7, nome: 'Insumos', ativo } })
      : base(url, cfg)));
    api.post.mockImplementation(() => { ativo = 1; return Promise.resolve({ data: { message: 'Grupo reativado' } }); });
    await render();
    await clicar(botaoComTexto(/Reativar grupo/));
    expect(api.post).toHaveBeenCalledWith('/compras/grupos/7/reativar');
    expect(toast.success).toHaveBeenCalledWith('Grupo reativado');
    expect(container.querySelector('[data-testid="aviso-grupo-desativado"]')).toBeNull();
    expect(botaoComTexto(/Vincular fornecedor/)).toBeTruthy();
  });

  test('erro ao reativar: toast com a mensagem do servidor; continua desativado', async () => {
    servidor({ id: 7, nome: 'Insumos', ativo: 0 });
    api.post.mockRejectedValue({ response: { data: { error: 'Grupo não encontrado' } } });
    await render();
    await clicar(botaoComTexto(/Reativar grupo/));
    expect(toast.error).toHaveBeenCalledWith('Grupo não encontrado');
    expect(container.querySelector('[data-testid="aviso-grupo-desativado"]')).not.toBeNull();
  });

  test('inexistente (404): titulo "Grupo não encontrado", aviso, sem Vincular/Novo', async () => {
    servidor({ status: 404 });
    await render();
    expect(titulo()).toBe('Fornecedores – Grupo não encontrado');
    expect(container.querySelector('[data-testid="aviso-grupo-inexistente"]').textContent).toBe('Grupo não encontrado.');
    expect(botaoComTexto(/Vincular fornecedor/)).toBeUndefined();
    expect(botaoComTexto(/Novo fornecedor/)).toBeUndefined();
    expect(botaoComTexto(/Reativar grupo/)).toBeUndefined();
  });

  test('erro que nao e 404 (500): como antes — titulo "Grupo" e os botoes disponiveis (o servidor decide)', async () => {
    servidor({ status: 500 });
    await render();
    expect(titulo()).toBe('Fornecedores – Grupo');
    expect(container.querySelector('[data-testid="aviso-grupo-desativado"]')).toBeNull();
    expect(container.querySelector('[data-testid="aviso-grupo-inexistente"]')).toBeNull();
    expect(botaoComTexto(/Vincular fornecedor/)).toBeTruthy();
  });
});
