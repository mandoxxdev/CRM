/**
 * Etapa 103 (RN-103.06) — Fornecedores homologados: os grupos desativados pelo "Remover grupo"
 * aparecem numa secao propria e voltam pelo botao "Reativar".
 *
 * Servidor mockado na fronteira HTTP (`services/api`): a rota tem teste proprio em
 * `server/tests/api/comprasGrupoDesativado.api.test.js`. O alvo aqui e o que so a tela erra — os DOIS
 * carregamentos pedindo `incluir_inativos` (o do `onSaved` do modal tambem), a grade so com ativos,
 * o botao que aparece inclusive com zero ativos, e a chamada de reativar seguida do recarregamento.
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=GruposFornecedores
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import GruposFornecedores from './GruposFornecedores';
import api from '../services/api';
import { toast } from 'react-toastify';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(), defaults: { baseURL: '/api' } },
}));
jest.mock('react-toastify', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn(), warning: jest.fn() }),
}));

const ATIVO = { id: 1, nome: 'Insumos', numero: 10, ativo: 1 };
const DESATIVADO = { id: 2, nome: 'Peças antigas', numero: 20, ativo: 0 };

let container;
let root;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  window.confirm = jest.fn(() => true);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/compras/fornecedores-homologados']}>
        <Routes>
          <Route path="/compras/fornecedores-homologados" element={<GruposFornecedores />} />
          <Route path="/compras/fornecedores-homologados/grupo/:grupoId" element={<div data-testid="tela-grupo">GRUPO</div>} />
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
const nomesNaGrade = () => [...container.querySelectorAll('.grupos-grid:not([data-testid="grupos-desativados"]) .grupo-card-nome')].map((n) => n.textContent);

describe('GruposFornecedores — RN-103.06 grupos desativados e Reativar', () => {
  test('pede incluir_inativos; a grade mostra so o ativo; o botao abre a secao com selo "Desativado"', async () => {
    api.get.mockResolvedValue({ data: [ATIVO, DESATIVADO] });
    await render();
    expect(api.get).toHaveBeenCalledWith('/compras/grupos', { params: { incluir_inativos: 1 } });
    expect(nomesNaGrade()).toEqual(['Insumos']);
    expect(container.querySelector('[data-testid="grupos-desativados"]')).toBeNull();
    const toggle = container.querySelector('[data-testid="toggle-desativados"]');
    expect(toggle.textContent).toBe('Mostrar grupos desativados (1)');
    await clicar(toggle);
    const secao = container.querySelector('[data-testid="grupos-desativados"]');
    expect(secao).not.toBeNull();
    expect(secao.textContent).toContain('Peças antigas');
    expect(secao.textContent).toContain('Desativado');
    expect(container.querySelector('[data-testid="toggle-desativados"]').textContent).toBe('Ocultar grupos desativados');
  });

  test('sem desativados nao ha botao (metade negativa) e a grade continua com os ativos', async () => {
    api.get.mockResolvedValue({ data: [ATIVO] });
    await render();
    expect(nomesNaGrade()).toEqual(['Insumos']);
    expect(container.querySelector('[data-testid="toggle-desativados"]')).toBeNull();
  });

  test('Reativar chama POST /reativar, avisa "Grupo reativado" e recarrega com incluir_inativos — o grupo volta a grade', async () => {
    api.get
      .mockResolvedValueOnce({ data: [ATIVO, DESATIVADO] })
      .mockResolvedValueOnce({ data: [ATIVO, { ...DESATIVADO, ativo: 1 }] });
    api.post.mockResolvedValue({ data: { message: 'Grupo reativado' } });
    await render();
    await clicar(container.querySelector('[data-testid="toggle-desativados"]'));
    await clicar(botaoComTexto(/^\s*Reativar\s*$/));
    expect(api.post).toHaveBeenCalledWith('/compras/grupos/2/reativar');
    expect(toast.success).toHaveBeenCalledWith('Grupo reativado');
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.get).toHaveBeenLastCalledWith('/compras/grupos', { params: { incluir_inativos: 1 } });
    expect(nomesNaGrade()).toEqual(['Insumos', 'Peças antigas']);
    expect(container.querySelector('[data-testid="toggle-desativados"]')).toBeNull();
  });

  test('erro ao reativar mostra a mensagem do servidor (ou o texto padrao)', async () => {
    api.get.mockResolvedValue({ data: [ATIVO, DESATIVADO] });
    api.post.mockRejectedValueOnce({ response: { data: { error: 'Grupo não encontrado' } } });
    await render();
    await clicar(container.querySelector('[data-testid="toggle-desativados"]'));
    await clicar(botaoComTexto(/^\s*Reativar\s*$/));
    expect(toast.error).toHaveBeenCalledWith('Grupo não encontrado');
    api.post.mockRejectedValueOnce(new Error('rede'));
    await clicar(botaoComTexto(/^\s*Reativar\s*$/));
    expect(toast.error).toHaveBeenLastCalledWith('Erro ao reativar grupo');
  });

  test('com ZERO ativos o botao continua alcancavel e o vazio diz "Nenhum grupo ativo."', async () => {
    api.get.mockResolvedValue({ data: [DESATIVADO] });
    await render();
    expect(container.querySelector('.grupos-empty').textContent).toContain('Nenhum grupo ativo.');
    expect(container.querySelector('.grupos-empty').textContent).not.toContain('Nenhum grupo cadastrado.');
    const toggle = container.querySelector('[data-testid="toggle-desativados"]');
    expect(toggle).not.toBeNull();
    await clicar(toggle);
    expect(container.querySelector('[data-testid="grupo-desativado-2"]')).not.toBeNull();
  });

  test('o recarregamento do modal (onSaved, depois de "Remover grupo") tambem pede incluir_inativos', async () => {
    api.get
      .mockResolvedValueOnce({ data: [ATIVO] })
      .mockResolvedValueOnce({ data: [{ ...ATIVO, ativo: 0 }] });
    api.delete.mockResolvedValue({ data: { message: 'Grupo desativado' } });
    await render();
    await clicar(container.querySelector('.btn-icon-grupo'));
    await clicar(botaoComTexto(/Remover grupo/));
    expect(api.delete).toHaveBeenCalledWith('/compras/grupos/1');
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.get).toHaveBeenLastCalledWith('/compras/grupos', { params: { incluir_inativos: 1 } });
    expect(nomesNaGrade()).toEqual([]);
    expect(container.querySelector('[data-testid="toggle-desativados"]').textContent).toBe('Mostrar grupos desativados (1)');
  });

  test('cartao desativado abre a tela do grupo (que mostra o aviso)', async () => {
    api.get.mockResolvedValue({ data: [ATIVO, DESATIVADO] });
    await render();
    await clicar(container.querySelector('[data-testid="toggle-desativados"]'));
    await clicar(container.querySelector('[data-testid="grupo-desativado-2"]'));
    expect(container.querySelector('[data-testid="tela-grupo"]')).not.toBeNull();
  });
});
