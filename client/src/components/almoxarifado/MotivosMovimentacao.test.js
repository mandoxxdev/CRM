/**
 * Aba "Motivos de Movimentação" (`TabMotivosMovimentacao` em ConfiguracoesAlmoxarifado.js) —
 * Etapa 66 (T4). Molde: `Categorias.test.js` (um arquivo de teste por aba).
 *
 * O contrato HTTP e congelado por `server/tests/api/motivosMovimentacaoCrud.api.test.js` (T1):
 *   GET  /almoxarifado/motivos-movimentacao?todos=1 -> [{ id, nome, tipos: string[], ativo: 0|1 }]
 *   GET  /almoxarifado/motivos-movimentacao/tipos   -> string[] (os 15 tipos da rota generica)
 *   POST { nome, tipos } -> 201 | PUT /:id { nome?, tipos?, ativo? } | DELETE /:id (desativa)
 *
 * O que SO o cliente prova:
 *   - a aba pede `?todos=1` (sem ele o desativado some da unica tela que o reativa);
 *   - os checkboxes de tipo vem de `/tipos` — a tela nao tem uma terceira copia da lista. O
 *     fixture usa um tipo que NAO existe no servidor ("TIPO_SO_DO_FIXTURE") para provar isso;
 *   - criar manda `{ nome, tipos }` EXATO; editar manda `PUT` SEM `ativo` (nao ressuscita);
 *     reativar manda `PUT { ativo: 1 }`;
 *   - a recusa aparece com a MENSAGEM DO SERVIDOR (o duplicado de desativado manda reativar);
 *   - sem `configurar` os botoes de escrita somem (metade positiva: com ela aparecem). O
 *     servidor continua decidindo — isto e so para nao abrir formulario que vai dar 403.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MotivosMovimentacao --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ConfiguracoesAlmoxarifado from './ConfiguracoesAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, nome: 'Admin', perfil_almoxarifado: 'ADMINISTRADOR' } }),
}));

jest.mock('../../services/permissionsCache', () => ({
  getEffectiveUser: (u) => u,
}));

let mockPode = () => true;
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  invalidarAlmoxPermissoes: jest.fn(),
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR',
    pode: (acao) => mockPode(acao),
    bloquearSeNaoPode: (acao) => mockPode(acao),
    loading: false,
  }),
}));

// Forma real de `paraContrato` (services/almoxarifado/motivoMovimentacao.js).
const MOTIVOS_DO_SERVIDOR = [
  { id: 7, nome: 'Avaria no manuseio', tipos: ['AJUSTE', 'PERDA'], ativo: 1 },
  { id: 3, nome: 'Inventário anual', tipos: ['AJUSTE'], ativo: 1 },
  { id: 9, nome: 'Obsoleto', tipos: ['SAIDA'], ativo: 0 },
];
// Inclui um tipo que o codigo da tela nao tem como conhecer: se aparecer como checkbox, a lista
// veio do servidor.
const TIPOS_DO_SERVIDOR = ['ENTRADA', 'SAIDA', 'AJUSTE', 'PERDA', 'TIPO_SO_DO_FIXTURE'];

let container;
let root;
let confirmOriginal;

const respostaPorUrl = (url) => {
  const u = String(url);
  if (u === '/almoxarifado/motivos-movimentacao/tipos') return Promise.resolve({ data: TIPOS_DO_SERVIDOR });
  if (u.startsWith('/almoxarifado/motivos-movimentacao')) return Promise.resolve({ data: MOTIVOS_DO_SERVIDOR });
  return Promise.resolve({ data: [] });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPode = () => true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.get.mockImplementation(respostaPorUrl);
  api.post.mockResolvedValue({ data: { id: 42, nome: 'Quebra', tipos: ['PERDA'], ativo: 1 } });
  api.put.mockResolvedValue({ data: { id: 7, nome: 'Avaria', tipos: ['PERDA'], ativo: 1 } });
  api.delete.mockResolvedValue({ data: { success: true } });
  confirmOriginal = window.confirm;
  window.confirm = jest.fn(() => true);
});

afterEach(() => {
  window.confirm = confirmOriginal;
  act(() => root.unmount());
  container.remove();
});

async function renderAba() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/configuracoes?tab=motivos-movimentacao']}>
        <ConfiguracoesAlmoxarifado />
      </MemoryRouter>
    );
  });
}

const linhaDa = (nome) => [...container.querySelectorAll('tbody tr')]
  .find(tr => tr.querySelector('td')?.textContent.trim() === nome);

const botaoDaLinha = (nome, rotulo) => {
  const tr = linhaDa(nome);
  if (!tr) return null;
  return [...tr.querySelectorAll('button')]
    .find(b => new RegExp(rotulo, 'i').test(b.getAttribute('title') || b.textContent)) || null;
};

const botaoPorTexto = (regex) => [...container.querySelectorAll('button')]
  .find(b => regex.test(b.textContent)) || null;

const preencher = (el, valor) => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, valor);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

const inputNome = () => container.querySelector('input.almox-input[type="text"], input.almox-input:not([type])');
const checkboxDoTipo = (tipo) => container.querySelector(`input[type="checkbox"][value="${tipo}"]`);

async function clicar(el) {
  await act(async () => { el.click(); });
}

/* ── Listar ── */

test('lista ativos e desativados com a situacao e os tipos, pedindo ?todos=1', async () => {
  await renderAba();

  expect(api.get).toHaveBeenCalledWith('/almoxarifado/motivos-movimentacao?todos=1');
  expect(linhaDa('Avaria no manuseio')).not.toBeUndefined();
  expect(linhaDa('Inventário anual')).not.toBeUndefined();
  expect(linhaDa('Obsoleto')).not.toBeUndefined();

  expect(linhaDa('Avaria no manuseio').textContent).toMatch(/AJUSTE/);
  expect(linhaDa('Avaria no manuseio').textContent).toMatch(/PERDA/);
  expect(linhaDa('Obsoleto').textContent).toMatch(/Inativo/);
  expect(linhaDa('Avaria no manuseio').textContent).not.toMatch(/Inativo/);
  expect(linhaDa('Avaria no manuseio').textContent).toMatch(/Ativo/);
});

/* ── Criar ── */

test('criar: checkboxes vem de /tipos e o POST leva { nome, tipos } exato', async () => {
  await renderAba();
  await clicar(botaoPorTexto(/Novo Motivo/));

  expect(api.get).toHaveBeenCalledWith('/almoxarifado/motivos-movimentacao/tipos');
  // Um checkbox por tipo do servidor — inclusive o que so existe no fixture.
  expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(TIPOS_DO_SERVIDOR.length);
  expect(checkboxDoTipo('TIPO_SO_DO_FIXTURE')).not.toBeNull();

  await act(async () => { preencher(inputNome(), 'Quebra'); });
  await clicar(checkboxDoTipo('PERDA'));
  await clicar(checkboxDoTipo('AJUSTE'));
  await clicar(botaoPorTexto(/Salvar Motivo/));

  expect(api.post).toHaveBeenCalledTimes(1);
  // Ordem dos tipos = ordem do servidor, nao a dos cliques.
  expect(api.post).toHaveBeenCalledWith('/almoxarifado/motivos-movimentacao', { nome: 'Quebra', tipos: ['AJUSTE', 'PERDA'] });
  expect(toast.success).toHaveBeenCalled();
});

test('criar com nome duplicado mostra a mensagem do servidor crua', async () => {
  const MSG = 'Já existe um motivo desativado com este nome — reative-o';
  api.post.mockRejectedValueOnce({ response: { status: 400, data: { error: MSG } } });
  await renderAba();
  await clicar(botaoPorTexto(/Novo Motivo/));
  await act(async () => { preencher(inputNome(), 'obsoleto'); });
  await clicar(checkboxDoTipo('SAIDA'));
  await clicar(botaoPorTexto(/Salvar Motivo/));

  // Metade positiva: a chamada saiu.
  expect(api.post).toHaveBeenCalledWith('/almoxarifado/motivos-movimentacao', { nome: 'obsoleto', tipos: ['SAIDA'] });
  expect(toast.error).toHaveBeenCalledWith(MSG);
});

/* ── Editar ── */

test('editar abre com nome e tipos marcados e manda PUT { nome, tipos } sem ativo', async () => {
  await renderAba();
  await clicar(botaoDaLinha('Avaria no manuseio', 'Editar'));

  expect(inputNome().value).toBe('Avaria no manuseio');
  expect(checkboxDoTipo('AJUSTE').checked).toBe(true);
  expect(checkboxDoTipo('PERDA').checked).toBe(true);
  expect(checkboxDoTipo('SAIDA').checked).toBe(false);

  await act(async () => { preencher(inputNome(), 'Avaria'); });
  await clicar(checkboxDoTipo('AJUSTE')); // desmarca
  await clicar(botaoPorTexto(/Salvar Motivo/));

  expect(api.put).toHaveBeenCalledTimes(1);
  const [url, corpo] = api.put.mock.calls[0];
  expect(url).toBe('/almoxarifado/motivos-movimentacao/7');
  expect(corpo).toEqual({ nome: 'Avaria', tipos: ['PERDA'] });
  expect('ativo' in corpo).toBe(false);
});

/* ── Desativar / reativar ── */

test('desativar chama DELETE e reativar manda PUT { ativo: 1 }', async () => {
  await renderAba();

  await clicar(botaoDaLinha('Inventário anual', 'Desativar'));
  expect(window.confirm).toHaveBeenCalled();
  expect(api.delete).toHaveBeenCalledWith('/almoxarifado/motivos-movimentacao/3');

  await clicar(botaoDaLinha('Obsoleto', 'Reativar'));
  expect(api.put).toHaveBeenCalledWith('/almoxarifado/motivos-movimentacao/9', { ativo: 1 });
});

test('recusa do servidor ao desativar aparece crua no toast', async () => {
  api.delete.mockRejectedValueOnce({ response: { status: 404, data: { error: 'Motivo de movimentação não encontrado' } } });
  await renderAba();
  await clicar(botaoDaLinha('Inventário anual', 'Desativar'));
  expect(api.delete).toHaveBeenCalledWith('/almoxarifado/motivos-movimentacao/3');
  expect(toast.error).toHaveBeenCalledWith('Motivo de movimentação não encontrado');
});

/* ── Permissão ── */

test('sem configurar nao mostra botoes de escrita (mas lista); com configurar mostra', async () => {
  mockPode = (acao) => acao !== 'configurar';
  await renderAba();

  expect(linhaDa('Avaria no manuseio')).not.toBeUndefined();
  expect(botaoPorTexto(/Novo Motivo/)).toBeNull();
  expect(botaoDaLinha('Avaria no manuseio', 'Editar')).toBeNull();
  expect(botaoDaLinha('Avaria no manuseio', 'Desativar')).toBeNull();
  expect(botaoDaLinha('Obsoleto', 'Reativar')).toBeNull();

  // Metade positiva, no mesmo teste: remonta com a permissao.
  act(() => root.unmount());
  root = createRoot(container);
  mockPode = () => true;
  await renderAba();
  expect(botaoPorTexto(/Novo Motivo/)).not.toBeNull();
  expect(botaoDaLinha('Avaria no manuseio', 'Editar')).not.toBeNull();
  expect(botaoDaLinha('Avaria no manuseio', 'Desativar')).not.toBeNull();
  expect(botaoDaLinha('Obsoleto', 'Reativar')).not.toBeNull();
});
