/**
 * Etapa 40, Task 4 (RN-E14/E15, RN-E02/E03/E04/E06) — o formulário de fornecedor e as duas rotas
 * que faltavam.
 *
 * O FURO QUE ESTA SUÍTE PAGA: a aba "Fornecedores" do módulo Compras tinha dois `<Link>` escritos
 * (`/compras/fornecedores/novo` no botão "Novo Fornecedor" e `/compras/fornecedores/editar/:id` no
 * lápis da linha) e nenhuma rota que os casasse em `App.js` — os dois caíam no `path="*"` e
 * voltavam para a própria lista. Mesma classe do furo que a Etapa 38 pagou para pedidos.
 *
 * POR QUE RENDERIZA `AppRoutes` E NÃO O COMPONENTE SOLTO: um cenário que montasse
 * `<FornecedorForm/>` direto passaria com `App.js` sem rota nenhuma. Navegando por URL com
 * `MemoryRouter`, a régua cobre a TABELA de rotas e os dois `<Link>` de `Compras.js`.
 *
 * O QUE ESTA TELA SABE DO SERVIDOR (contrato congelado no design §5.2/§5.5, servidor MOCKADO aqui):
 *   - o `PUT` é SUBSTITUIÇÃO TOTAL dos sete textos — o payload manda TODOS, sempre (RN-E02);
 *   - `grupo_id` viaja como STRING do `<select>`; `''` = "Sem grupo" e o servidor LIMPA (RN-E03);
 *   - `status` só existe na edição (RN-E04/E06);
 *   - erro do servidor vai para `role="alert"`, toast só no sucesso (D11).
 *
 * POR QUE O FALLBACK DO MOCK DE `api` REJEITA (convenção do almoxarifado): URL inesperada estoura
 * em vez de devolver lista vazia em silêncio.
 *
 * Executar:
 *   cd client && CI=true npx react-scripts test --watchAll=false \
 *     src/components/compras/FornecedorForm.test.js
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../../App';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../utils/exportExcel', () => ({ exportToExcel: jest.fn() }));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn(), warning: jest.fn() },
  ToastContainer: () => null,
}));
// `App.js` importa ~150 páginas por `./routes/lazyModules`, todas via `React.lazy`. O Proxy deixa
// REAIS só as duas telas que este arquivo exercita (a aba Compras e o FornecedorForm), o `Layout`
// vira um `<Outlet/>` nu e todo o resto vira uma caixa vazia. Molde: `PedidoCompraForm.test.js`.
jest.mock('../../routes/lazyModules', () => {
  const ReactMock = require('react');
  const { Outlet } = require('react-router-dom');
  const reais = {
    Compras: require('../Compras').default,
    FornecedorForm: require('./FornecedorForm').default,
    Layout: () => ReactMock.createElement(Outlet),
  };
  const vazios = {};
  return new Proxy({}, {
    get(_alvo, prop) {
      if (prop === '__esModule') return true;
      if (reais[prop]) return reais[prop];
      if (!vazios[prop]) {
        const Stub = () => ReactMock.createElement('div', { 'data-stub': String(prop) });
        Stub.displayName = `Stub(${String(prop)})`;
        vazios[prop] = Stub;
      }
      return vazios[prop];
    },
  });
});
// As barreiras de módulo/config do `App.js` viram passagem: o que esta task mede é a TABELA de
// rotas; o gate de módulo do Compras não muda nesta etapa e tem régua própria no servidor.
jest.mock('../../components/ProtectedModuleRoute', () => ({
  __esModule: true, default: ({ children }) => children,
}));
jest.mock('../../components/ProtectedModuleConfigRoute', () => ({
  __esModule: true, default: ({ children }) => children,
}));
jest.mock('../../components/ProtectedAlmoxConfigRoute', () => ({
  __esModule: true, default: ({ children }) => children,
}));
jest.mock('../../components/almoxarifado/RequisicoesMaterialContext', () => ({
  RequisicoesMaterialProvider: ({ children }) => children,
  useRequisicoesMaterial: () => ({}),
}));
jest.mock('../../context/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({ user: { id: 64, nome: 'Comprador Teste' }, loading: false }),
}));

// Fixtures com ids fora do conjunto ocupado pelas outras suítes ({312, 355, 418-421, 640, 901, 907}).
const GRUPOS = [{ id: 71, nome: 'Aços' }, { id: 72, nome: 'Fixadores' }];
const FORNECEDOR_530 = {
  id: 530, razao_social: 'Metalúrgica Norte', nome_fantasia: 'MetNorte', cnpj: '11222333000144',
  contato: 'Ana', email: 'ana@metnorte.com', telefone: '(47) 99999-1111', endereco: 'Rua A, 10',
  cidade: null, estado: null, cep: null, status: 'ativo', grupo_id: 72, foto: null,
  created_at: '2026-09-01 10:00:00', updated_at: '2026-09-01 10:00:00',
};
const LISTA = [{ id: 530, razao_social: 'Metalúrgica Norte', nome_fantasia: 'MetNorte', cnpj: '11222333000144', contato: 'Ana', email: 'ana@metnorte.com', telefone: '(47) 99999-1111', status: 'ativo' }];
const LITERAL_409_COTACAO = 'Fornecedor possui cotações — não pode ser excluído';

let container; let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  // Implementação aqui e não na fábrica do `jest.mock`: o `resetMocks` do react-scripts apaga
  // implementações entre cenários.
  api.get.mockImplementation((url) => {
    if (url === '/compras/fornecedores') return Promise.resolve({ data: LISTA });
    if (url === '/compras/grupos') return Promise.resolve({ data: GRUPOS });
    // Igualdade, não `startsWith`: `/compras/fornecedores` é PREFIXO de `/compras/fornecedores/:id`.
    if (url === '/compras/fornecedores/530') return Promise.resolve({ data: FORNECEDOR_530 });
    if (url === '/compras/pedidos') return Promise.resolve({ data: [] });
    if (url === '/compras/cotacoes') return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`URL inesperada no teste: ${url}`));
  });
  api.post.mockImplementation(() => Promise.resolve({ data: { id: 531, razao_social: 'Nova', nome_fantasia: '', grupo_id: null } }));
  api.put.mockImplementation(() => Promise.resolve({ data: { message: 'Fornecedor atualizado' } }));
  api.delete.mockImplementation(() => Promise.resolve({ data: { message: 'Item excluído com sucesso' } }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

async function renderizarEm(rota) {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[rota]}><AppRoutes /></MemoryRouter>);
  });
  await esperarEfeitos();
}
async function clicar(el) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });
  await esperarEfeitos();
}
// Input controlado do React: setar `.value` direto não dispara o `onChange` — usa o setter nativo
// + evento `input`, que é o que o React ouve.
function digitar(input, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function selecionar(select, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => {
    setter.call(select, valor);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await esperarEfeitos();
}
async function submeter() {
  await act(async () => {
    container.querySelector('form[data-testid="fornecedor-form"]')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await esperarEfeitos();
}

// NBSP → espaço: toda asserção de literal passa por aqui.
const texto = () => container.textContent.replace(/ /g, ' ');
const porTestId = (id) => container.querySelector(`[data-testid="${id}"]`);
const alertas = () => [...container.querySelectorAll('[role="alert"]')]
  .map((el) => el.textContent.replace(/ /g, ' ')).join(' | ');
const linkPorTexto = (t) => [...container.querySelectorAll('a')]
  .find((a) => a.textContent.trim().includes(t));

// ── (a) a rota `novo` existe e abre o formulário ──────────────────────────────────────────────
test('(a) /compras/fornecedores/novo renderiza "Novo fornecedor" e o form (nao volta para a lista)', async () => {
  await renderizarEm('/compras/fornecedores/novo');
  expect(texto()).toContain('Novo fornecedor');
  expect(porTestId('fornecedor-form')).not.toBeNull();
  expect(texto()).not.toContain('Gestão de fornecedores, pedidos e cotações');
  expect(porTestId('fornecedor-status')).toBeNull(); // status so na edicao
});

// ── (b) os dois `<Link>` mortos de `Compras.js` agora chegam na tela ──────────────────────────
test('(b) "Novo Fornecedor" da aba e o lapis da linha chegam ao formulario', async () => {
  await renderizarEm('/compras/fornecedores');
  await clicar(linkPorTexto('Novo Fornecedor'));
  expect(texto()).toContain('Novo fornecedor');
  // Segundo link, render novo: o lápis da linha 530.
  await act(async () => { root.unmount(); }); container.remove();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await renderizarEm('/compras/fornecedores');
  await clicar(container.querySelector('a[title="Editar"]'));
  expect(texto()).toContain('Editar fornecedor');
  expect(api.get.mock.calls.filter(([u]) => u === '/compras/fornecedores/530')).toHaveLength(1);
});

// ── (c) RN-E15: recusa local, sem ir ao servidor ──────────────────────────────────────────────
test('(c) RN-E15 submit sem razao social -> alerta local, POST nao chamado', async () => {
  await renderizarEm('/compras/fornecedores/novo');
  await submeter();
  expect(alertas()).toContain('Razão social é obrigatória');
  expect(api.post).not.toHaveBeenCalled();
});

// ── (d) RN-E14: o POST exato ──────────────────────────────────────────────────────────────────
test('(d) RN-E14 POST exato: 7 textos + grupo_id, e navega para a aba com toast', async () => {
  await renderizarEm('/compras/fornecedores/novo');
  digitar(porTestId('fornecedor-razao'), 'Parafusos Norte');
  digitar(porTestId('fornecedor-email'), 'x@y.z');
  await selecionar(porTestId('fornecedor-grupo'), '71');
  await submeter();
  expect(api.post.mock.calls).toHaveLength(1);
  expect(api.post.mock.calls[0]).toEqual(['/compras/fornecedores', {
    razao_social: 'Parafusos Norte', nome_fantasia: '', cnpj: '', contato: '', email: 'x@y.z', telefone: '', endereco: '', grupo_id: '71',
  }]);
  expect(toast.success).toHaveBeenCalledWith('Fornecedor salvo');
  expect(texto()).toContain('Gestão de fornecedores, pedidos e cotações'); // voltou para a lista
});

// ── (e) RN-E02/E04/E06: edição carrega por GET /:id e o PUT é substituição total ──────────────
test('(e) RN-E02/E04/E06 edicao: GET /:id preenche, PUT manda TODOS os campos + status', async () => {
  await renderizarEm('/compras/fornecedores/editar/530');
  expect(porTestId('fornecedor-razao').value).toBe('Metalúrgica Norte');
  expect(porTestId('fornecedor-grupo').value).toBe('72');
  expect(porTestId('fornecedor-status').value).toBe('ativo');
  await selecionar(porTestId('fornecedor-status'), 'inativo');
  await submeter();
  expect(api.put.mock.calls).toHaveLength(1);
  expect(api.put.mock.calls[0]).toEqual(['/compras/fornecedores/530', {
    razao_social: 'Metalúrgica Norte', nome_fantasia: 'MetNorte', cnpj: '11222333000144', contato: 'Ana',
    email: 'ana@metnorte.com', telefone: '(47) 99999-1111', endereco: 'Rua A, 10', grupo_id: '72', status: 'inativo',
  }]);
  expect(toast.success).toHaveBeenCalledWith('Fornecedor salvo');
});

// ── (f) D11: erro do servidor em `role="alert"`, sem toast de erro ────────────────────────────
test('(f) 400 do servidor vai para role=alert com a literal, sem toast de erro', async () => {
  api.post.mockImplementation(() => Promise.reject({ response: { status: 400, data: { error: 'Dados inválidos — grupo_id: grupo do fornecedor inválido' } } }));
  await renderizarEm('/compras/fornecedores/novo');
  digitar(porTestId('fornecedor-razao'), 'X');
  await submeter();
  expect(alertas()).toContain('Dados inválidos — grupo_id: grupo do fornecedor inválido');
  expect(toast.error).not.toHaveBeenCalled();
  expect(texto()).toContain('Novo fornecedor'); // continua na tela
});

// ── (g) a lixeira da aba mostra a literal do 409 por cotação ──────────────────────────────────
test('(g) a lixeira da aba Fornecedores mostra a literal do 409 por cotacao', async () => {
  const confirmOriginal = window.confirm; window.confirm = jest.fn(() => true);
  api.delete.mockImplementation(() => Promise.reject({ response: { status: 409, data: { error: LITERAL_409_COTACAO } } }));
  try {
    await renderizarEm('/compras/fornecedores');
    await clicar(container.querySelector('button[title="Excluir"]'));
    expect(api.delete.mock.calls[0][0]).toBe('/compras/fornecedores/530');
    expect(toast.error).toHaveBeenCalledWith(LITERAL_409_COTACAO);
    expect(texto()).toContain('Metalúrgica Norte');
    // Metade positiva no MESMO cenário: com o DELETE passando, o toast é de sucesso.
    api.delete.mockImplementation(() => Promise.resolve({ data: { message: 'Item excluído com sucesso' } }));
    await clicar(container.querySelector('button[title="Excluir"]'));
    expect(toast.success).toHaveBeenCalledTimes(1);
  } finally { window.confirm = confirmOriginal; }
});

// ── (h) RN-E03: "Sem grupo" viaja como `''` ───────────────────────────────────────────────────
test('(h) RN-E03 "Sem grupo" viaja como grupo_id "" (o servidor limpa)', async () => {
  await renderizarEm('/compras/fornecedores/editar/530');
  await selecionar(porTestId('fornecedor-grupo'), '');
  await submeter();
  expect(api.put.mock.calls[0][1].grupo_id).toBe('');
});
