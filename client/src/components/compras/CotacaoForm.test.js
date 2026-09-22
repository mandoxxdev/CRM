/**
 * Etapa 40, Task 5 (RN-E13..E16) — o formulario de COTACAO e as duas rotas que faltavam.
 *
 * O FURO QUE ESTA SUITE PAGA: a aba "Cotacoes" do modulo Compras tinha dois `<Link>` escritos
 * (`/compras/cotacoes/nova` no botao e `/compras/cotacoes/editar/:id` no lapis) e NENHUMA rota que
 * os casasse em `App.js` — clicar caia no `*` e voltava para a propria lista. Mesmo furo, mesma
 * regua e mesmo molde da Etapa 38 (`PedidoCompraForm.test.js`): os cenarios renderizam `AppRoutes`
 * por URL, com `MemoryRouter`, para que um `App.js` sem as rotas fique VERMELHO.
 *
 * O que muda em relacao ao molde:
 * - `reais` traz `CotacaoForm` (a tela desta task) e um `Layout` com DOIS `<Link>` — o cenario (g)
 *   troca de aba SEM remontar a raiz, exatamente como o menu do sistema navega, porque as tres
 *   rotas da aba renderizam o MESMO `<Compras/>` e o React Router v6 preserva o state.
 * - o fallback do mock de `api` REJEITA (convencao do almoxarifado): URL inesperada estoura em vez
 *   de devolver lista vazia em silencio.
 * - ids das fixtures fora do conjunto ocupado pelas outras suites ({312, 355, 418-421, 640, 901,
 *   907}): a cotacao e 760, o POST devolve 761. O fornecedor escolhido e o 312 — nao e o primeiro
 *   da lista, de proposito.
 *
 * Executar:
 *   cd client && CI=true npx react-scripts test --watchAll=false \
 *     src/components/compras/CotacaoForm.test.js
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
// Proxy sobre `lazyModules` (ver o cabecalho de `PedidoCompraForm.test.js`): so `Compras`,
// `CotacaoForm` e um `Layout` minimo vem reais; todo o resto vira caixa vazia.
jest.mock('../../routes/lazyModules', () => {
  const ReactMock = require('react');
  const { Outlet, Link } = require('react-router-dom');
  const reais = {
    Compras: require('../Compras').default,
    CotacaoForm: require('./CotacaoForm').default,
    // Dois links de menu: o cenario (g) navega entre abas sem remontar a raiz.
    Layout: () => ReactMock.createElement(
      ReactMock.Fragment,
      null,
      ReactMock.createElement(Link, { to: '/compras/cotacoes' }, 'ir-cotacoes'),
      ReactMock.createElement(Link, { to: '/compras/fornecedores' }, 'ir-fornecedores'),
      ReactMock.createElement(Outlet),
    ),
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

const FORNECEDORES = [
  { id: 355, razao_social: 'Parafusos Sul', status: 'ativo' },
  { id: 312, razao_social: 'Aços Vale Ltda', status: 'ativo' },
];
const COTACAO_760 = {
  id: 760, numero: 'COT-2026-760', fornecedor_id: 312, fornecedor_nome: 'Aços Vale Ltda', valor_total: 1500.5,
  data_cotacao: '2026-09-10', validade: '2026-10-10', status: 'em_analise', observacoes: 'frete incluso',
  created_at: '2026-09-10 09:00:00', updated_at: '2026-09-10 09:00:00',
};
const LISTA = [{ ...COTACAO_760 }];

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  // Implementacao aqui e nao na fabrica do `jest.mock`: o `resetMocks` do react-scripts apaga
  // implementacoes entre cenarios.
  api.get.mockImplementation((url) => {
    if (url === '/compras/fornecedores') return Promise.resolve({ data: FORNECEDORES });
    if (url === '/compras/cotacoes') return Promise.resolve({ data: LISTA });
    if (url === '/compras/cotacoes/760') return Promise.resolve({ data: COTACAO_760 });
    if (url === '/compras/pedidos') return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`URL inesperada no teste: ${url}`));
  });
  api.post.mockImplementation(() => Promise.resolve({ data: { ...COTACAO_760, id: 761, numero: 'COT-2026-761' } }));
  api.put.mockImplementation(() => Promise.resolve({ data: COTACAO_760 }));
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
    container.querySelector('form[data-testid="cotacao-form"]')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await esperarEfeitos();
}

// NBSP -> espaco, como no molde: toda assercao de literal passa por aqui.
const texto = () => container.textContent.replace(/ /g, ' ');
const porTestId = (id) => container.querySelector(`[data-testid="${id}"]`);
const alertas = () => [...container.querySelectorAll('[role="alert"]')]
  .map((el) => el.textContent.replace(/ /g, ' ')).join(' | ');
const linkPorTexto = (t) => [...container.querySelectorAll('a')]
  .find((a) => a.textContent.trim().includes(t));

test('(a) /compras/cotacoes/nova renderiza "Nova cotação" e o form, com a data de hoje LOCAL', async () => {
  // controle de fuso, como Compras.test.js:197-202: o globalSetup fixa America/Sao_Paulo
  expect(new Date().getTimezoneOffset()).toBe(180);
  await renderizarEm('/compras/cotacoes/nova');
  expect(texto()).toContain('Nova cotação');
  expect(porTestId('cotacao-form')).not.toBeNull();
  expect(texto()).not.toContain('Gestão de fornecedores, pedidos e cotações');
  const hoje = new Date();
  const esperado = [hoje.getFullYear(), String(hoje.getMonth() + 1).padStart(2, '0'), String(hoje.getDate()).padStart(2, '0')].join('-');
  expect(porTestId('cotacao-data').value).toBe(esperado);
  expect(porTestId('cotacao-status').value).toBe('em_analise');
});

test('(b) RN-E16 o botao da aba diz "Nova Cotação" e chega ao form; o lapis tambem', async () => {
  await renderizarEm('/compras/cotacoes');
  expect(linkPorTexto('Novo Cotação')).toBeUndefined();
  await clicar(linkPorTexto('Nova Cotação'));
  expect(texto()).toContain('Nova cotação');
  await act(async () => { root.unmount(); }); container.remove();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await renderizarEm('/compras/cotacoes');
  await clicar(container.querySelector('a[title="Editar"]'));
  expect(texto()).toContain('Editar cotação');
  expect(porTestId('cotacao-numero').value).toBe('COT-2026-760');
  expect(api.get.mock.calls.filter(([u]) => u === '/compras/cotacoes/760')).toHaveLength(1);
});

test('(c) RN-E15 sem numero -> alerta; com numero e sem fornecedor -> alerta; POST nao chamado', async () => {
  await renderizarEm('/compras/cotacoes/nova');
  await submeter();
  expect(alertas()).toContain('Número da cotação é obrigatório');
  digitar(porTestId('cotacao-numero'), 'COT-1');
  await submeter();
  expect(alertas()).toContain('Fornecedor da cotação é obrigatório');
  expect(alertas()).not.toContain('Número da cotação é obrigatório');
  expect(api.post).not.toHaveBeenCalled();
});

test('(d) RN-E14 POST com Number() nos numericos e navega com toast', async () => {
  await renderizarEm('/compras/cotacoes/nova');
  digitar(porTestId('cotacao-numero'), 'COT-1');
  await selecionar(porTestId('cotacao-fornecedor'), '312');
  digitar(porTestId('cotacao-valor'), '99.9');
  digitar(porTestId('cotacao-validade'), '2026-12-01');
  await submeter();
  expect(api.post.mock.calls).toHaveLength(1);
  const [url, corpo] = api.post.mock.calls[0];
  expect(url).toBe('/compras/cotacoes');
  expect(corpo.fornecedor_id).toBe(312);
  expect(corpo.valor_total).toBe(99.9);
  expect(corpo.numero).toBe('COT-1');
  expect(corpo.validade).toBe('2026-12-01');
  expect(corpo.status).toBe('em_analise');
  expect(typeof corpo.data_cotacao).toBe('string');
  expect(toast.success).toHaveBeenCalledWith('Cotação salva');
  expect(texto()).toContain('Gestão de fornecedores, pedidos e cotações');
});

test('(e) RN-E13 edicao: GET /:id preenche e o PUT manda o cabecalho inteiro', async () => {
  await renderizarEm('/compras/cotacoes/editar/760');
  expect(porTestId('cotacao-fornecedor').value).toBe('312');
  expect(porTestId('cotacao-valor').value).toBe('1500.5');
  await selecionar(porTestId('cotacao-status'), 'aprovado');
  await submeter();
  expect(api.put.mock.calls).toHaveLength(1);
  expect(api.put.mock.calls[0]).toEqual(['/compras/cotacoes/760', {
    numero: 'COT-2026-760', fornecedor_id: 312, valor_total: 1500.5, data_cotacao: '2026-09-10', validade: '2026-10-10', status: 'aprovado', observacoes: 'frete incluso',
  }]);
  expect(toast.success).toHaveBeenCalledWith('Cotação salva');
});

test('(f) 409 do numero vai para role=alert com a literal', async () => {
  api.post.mockImplementation(() => Promise.reject({ response: { status: 409, data: { error: 'Já existe uma cotação com o número COT-1' } } }));
  await renderizarEm('/compras/cotacoes/nova');
  digitar(porTestId('cotacao-numero'), 'COT-1');
  await selecionar(porTestId('cotacao-fornecedor'), '355');
  await submeter();
  expect(alertas()).toContain('Já existe uma cotação com o número COT-1');
  expect(toast.error).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
  expect(texto()).toContain('Nova cotação'); // ficou no form
});

test('(g) RN-E16 o select de status mostra so as opcoes da aba, e trocar de aba SEM remontar nao leva o filtro junto', async () => {
  // SEM remontar a raiz entre as abas (Fase 2, I1): as tres rotas renderizam o MESMO <Compras/>
  // e o state sobrevive a troca. O stub do Layout deste arquivo tem dois <Link> justamente para
  // navegar como o menu navega.
  const select = () => porTestId('filtro-status');
  const opcoes = () => [...select().querySelectorAll('option')].map((o) => o.value);
  const chamadas = (url) => api.get.mock.calls.filter(([u]) => u === url);
  await renderizarEm('/compras/fornecedores');
  expect(opcoes()).toEqual(['', 'ativo', 'inativo']);
  await selecionar(select(), 'inativo');
  expect(chamadas('/compras/fornecedores').at(-1)[1].params.status).toBe('inativo');
  await clicar(linkPorTexto('ir-cotacoes'));
  expect(opcoes()).toEqual(['', 'em_analise', 'aprovado', 'rejeitado', 'cancelado']);
  expect(select().value).toBe('');
  expect(chamadas('/compras/cotacoes').at(-1)[1].params.status).toBe('');
});
