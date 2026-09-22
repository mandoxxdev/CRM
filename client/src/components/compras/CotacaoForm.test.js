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
 * - Etapa 41, Task 3 (cenarios (i)–(n)): a cotacao ganha ITENS (D2/D3/D10). Fixtures novas: a
 *   cotacao 770 com dois itens (7701/7702) e o material 912; o (e) passa a esperar `itens: []`.
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
  // Etapa 41 (RN-F04): o GET /:id devolve `itens[]` e a lista devolve `pedido_id`/`pedido_numero`.
  itens: [], pedido_id: null, pedido_numero: null,
};
// Etapa 41 (D10, RN-F13): a busca de material e a cotacao COM itens. Ids fora do conjunto ocupado:
// 770 (cotacao), 7701/7702 (itens), 912 (material novo); o 907 ja existe no molde do pedido.
const MATERIAIS = [{ id: 912, codigo: 'ALM-0912', descricao: 'Chapa Aço 5mm', unidade: 'KG' }];
const COTACAO_770 = {
  ...COTACAO_760, id: 770, numero: 'COT-2026-770', valor_total: 27,
  itens: [
    { id: 7701, material_id: 912, codigo: 'ALM-0912', descricao: 'Chapa Aço 5mm', unidade: 'KG', quantidade: 2, valor_unitario: 10 },
    { id: 7702, material_id: 907, codigo: 'ALM-0907', descricao: 'Chapa Aço 3mm', unidade: 'KG', quantidade: 1, valor_unitario: 7 },
  ],
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
    if (url === '/compras/cotacoes/770') return Promise.resolve({ data: COTACAO_770 });
    if (url === '/compras/materiais') return Promise.resolve({ data: MATERIAIS });
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

// ── (a) RN-D03 a cotacao nasce com a data LOCAL, nao com a de amanha ─────────────────────────
//
// Onda de correcao da Etapa 40 (F2, achado I1 da revisao de UX). A versao anterior deste cenario
// era TAUTOLOGICA: calculava o "esperado" com `new Date()` + getters locais — o MESMO calculo do
// componente — e so divergia da implementacao errada (`toISOString().slice(0,10)`, UTC) entre 21h
// e meia-noite no fuso do Brasil. Das 00:00 as 20:59 ela passava com o `hojeISO` quebrado.
//
// Molde: o (q) de `PedidoCompraForm.test.js`. O relogio e fixado em 2026-09-17T02:30:00Z, que e
// 23:30 de 16/09 em America/Sao_Paulo (o globalSetup fixa o TZ): UTC e local discordam de dia, e
// a implementacao UTC devolveria 2026-09-17. `global.Date` vira uma subclasse fixa (e nao
// `jest.useFakeTimers`, que no Jest 27 fakeia o `setTimeout` de `esperarEfeitos()`); o construtor
// sem argumentos continua sendo LOCAL, como a RN-D03 exige. Restaurado no `finally`.
test('(a) /compras/cotacoes/nova renderiza "Nova cotação" e o form, com a data de hoje LOCAL', async () => {
  const DateReal = global.Date;
  const INSTANTE = new DateReal('2026-09-17T02:30:00Z');
  class DataFixa extends DateReal {
    constructor(...args) { super(...(args.length ? args : [INSTANTE.getTime()])); }
    static now() { return INSTANTE.getTime(); }
  }
  global.Date = DataFixa;
  try {
    // CONTROLE POSITIVO, dentro do cenario: o relogio fixo esta instalado E na janela em que UTC e
    // local divergem — a implementacao antiga (UTC) responderia 17, a certa (local) responde 16.
    expect(new Date().getTimezoneOffset()).toBe(180);
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-09-17');
    expect(new Date().getDate()).toBe(16);
    await renderizarEm('/compras/cotacoes/nova');
    expect(texto()).toContain('Nova cotação');
    expect(porTestId('cotacao-form')).not.toBeNull();
    expect(texto()).not.toContain('Gestão de fornecedores, pedidos e cotações');
    expect(porTestId('cotacao-data').value).toBe('2026-09-16');
    expect(porTestId('cotacao-status').value).toBe('em_analise');
  } finally {
    global.Date = DateReal;
  }
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
  // F4 (UX M2): sem `min` no valor — o servidor decide (D3/D11) e a literal do 400 chega ao
  // `role="alert"` (cenario (h)); com `min="0"` o navegador barrava o submit com tooltip nativa.
  expect(porTestId('cotacao-valor').hasAttribute('min')).toBe(false);
  expect(porTestId('cotacao-valor').getAttribute('step')).toBe('0.01');
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
  // Etapa 41 (D3, Fase 2 M1): a 760 nao tem itens, entao `valor_total` continua no payload e
  // `itens: []` viaja junto — 8 chaves. Com itens, o (j)/(m) provam que `valor_total` NAO vai.
  expect(api.put.mock.calls[0]).toEqual(['/compras/cotacoes/760', {
    numero: 'COT-2026-760', fornecedor_id: 312, valor_total: 1500.5, data_cotacao: '2026-09-10', validade: '2026-10-10', status: 'aprovado', observacoes: 'frete incluso',
    itens: [],
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

// ── (h) F4 (UX M2) valor negativo VIAJA e o 400 do servidor chega ao role="alert" ─────────────
//
// Politica da etapa (D3/D11): a tela nao valida o que o servidor ja valida; a literal do Zod
// (`VALOR_COTACAO_NEGATIVO`, `schemas.js`) e o que o comprador le. Este cenario mede a composicao
// client<->servidor: `-1` sai da tela como numero, o `validate()` responde
// `{ error: 'Dados inválidos — valor_total: ...' }` (`validation.js`) e a faixa mostra isso.
// O `min="0"` em si e medido no (d): em jsdom o submit por evento nao roda a validacao nativa,
// entao este cenario passaria mesmo com o atributo — e o (d) que cai na sabotagem.
test('(h) F4 valor_total -1 viaja no POST e o 400 do servidor aparece em role=alert', async () => {
  const LITERAL_400 = 'Dados inválidos — valor_total: valor total da cotação não pode ser negativo';
  api.post.mockImplementation(() => Promise.reject({ response: { status: 400, data: { error: LITERAL_400 } } }));
  await renderizarEm('/compras/cotacoes/nova');
  digitar(porTestId('cotacao-numero'), 'COT-NEG');
  await selecionar(porTestId('cotacao-fornecedor'), '312');
  digitar(porTestId('cotacao-valor'), '-1');
  expect(porTestId('cotacao-valor').value).toBe('-1');
  await submeter();
  expect(api.post.mock.calls).toHaveLength(1);
  expect(api.post.mock.calls[0][1].valor_total).toBe(-1);
  expect(alertas()).toContain(LITERAL_400);
  expect(toast.error).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
  expect(texto()).toContain('Nova cotação'); // ficou no form
});

// ── Etapa 41, Task 3 (RN-F13, RN-F05) — a cotacao ganha itens ────────────────────────────────
//
// D3 (duas regras para `valor_total`): com linha, o campo `cotacao-valor` fica `readOnly` e mostra a
// soma, e o payload NAO leva `valor_total` (o servidor deriva); sem linha, e digitavel e viaja
// (cenarios (d)/(e)/(h) seguem iguais). D10: o bloco de itens e copia do `PedidoCompraForm`, com os
// `data-testid` prefixados `cotacao-` e SEM `min="0"` nas linhas (F4 da 40).
const chamadasMateriais = () => api.get.mock.calls.filter(([u]) => u === '/compras/materiais');
async function adicionar912() {
  digitar(porTestId('cotacao-busca-material'), 'chapa');
  await clicar(porTestId('cotacao-botao-buscar-material'));
  await clicar(porTestId('cotacao-adicionar-material-912'));
}

test('(i) RN-F13 busca com search, adiciona 912, total soma e o campo Valor total trava com a soma', async () => {
  await renderizarEm('/compras/cotacoes/nova');
  digitar(porTestId('cotacao-valor'), '55');           // digitavel enquanto nao ha linha
  await adicionar912();
  expect(chamadasMateriais()[0][1]).toEqual({ params: { search: 'chapa' } });
  expect(porTestId('cotacao-qtd-item-912').value).toBe('1');
  // F4 da 40, estendido as linhas: sem `min` — o servidor decide e a literal chega ao alert ((n)).
  expect(porTestId('cotacao-qtd-item-912').hasAttribute('min')).toBe(false);
  expect(porTestId('cotacao-valor-item-912').hasAttribute('min')).toBe(false);
  digitar(porTestId('cotacao-valor-item-912'), '12.5');
  expect(texto()).toContain('Total: R$ 12,50');
  expect(porTestId('cotacao-valor').readOnly).toBe(true);
  expect(porTestId('cotacao-valor').value).toBe('12.5');
  await clicar(porTestId('cotacao-remover-item-912'));
  expect(porTestId('cotacao-valor').readOnly).toBe(false);
  expect(porTestId('cotacao-valor').value).toBe('55');   // volta o digitado
});

test('(j) RN-F13 POST com itens em Number() e SEM valor_total', async () => {
  await renderizarEm('/compras/cotacoes/nova');
  digitar(porTestId('cotacao-numero'), 'COT-9');
  await selecionar(porTestId('cotacao-fornecedor'), '312');
  await adicionar912();
  digitar(porTestId('cotacao-qtd-item-912'), '3');
  digitar(porTestId('cotacao-valor-item-912'), '2.5');
  await submeter();
  expect(api.post.mock.calls).toHaveLength(1);
  const corpo = api.post.mock.calls[0][1];
  expect(corpo.itens).toEqual([{ material_id: 912, quantidade: 3, valor_unitario: 2.5 }]);
  expect('valor_total' in corpo).toBe(false);
  expect(toast.success).toHaveBeenCalledWith('Cotação salva');
});

test('(k) RN-F13 sem item -> POST com valor_total digitado e itens []', async () => {
  await renderizarEm('/compras/cotacoes/nova');
  digitar(porTestId('cotacao-numero'), 'COT-9');
  await selecionar(porTestId('cotacao-fornecedor'), '312');
  digitar(porTestId('cotacao-valor'), '99.9');
  await submeter();
  const corpo = api.post.mock.calls[0][1];
  expect(corpo.valor_total).toBe(99.9);
  expect(corpo.itens).toEqual([]);
});

test('(l) RN-F13 edicao da 770 pre-carrega 2 linhas sem buscar material; campo travado com 27', async () => {
  await renderizarEm('/compras/cotacoes/editar/770');
  expect(porTestId('cotacao-qtd-item-912').value).toBe('2');
  expect(porTestId('cotacao-valor-item-907').value).toBe('7');
  expect(chamadasMateriais()).toHaveLength(0);
  expect(porTestId('cotacao-valor').readOnly).toBe(true);
  expect(porTestId('cotacao-valor').value).toBe('27');
  expect(texto()).toContain('Total: R$ 27,00');
});

test('(m) RN-F05 remover uma linha e salvar -> PUT com 1 item', async () => {
  await renderizarEm('/compras/cotacoes/editar/770');
  await clicar(porTestId('cotacao-remover-item-907'));
  await submeter();
  expect(api.put.mock.calls).toHaveLength(1);
  expect(api.put.mock.calls[0][0]).toBe('/compras/cotacoes/770');
  const corpo = api.put.mock.calls[0][1];
  expect(corpo.itens).toEqual([{ material_id: 912, quantidade: 2, valor_unitario: 10 }]);
  expect('valor_total' in corpo).toBe(false);
});

test('(n) 400 de item do servidor vai para role=alert com a literal', async () => {
  api.post.mockImplementation(() => Promise.reject({ response: { status: 400, data: { error: 'Dados inválidos — itens.0.quantidade: quantidade do item da cotação deve ser um número maior que zero' } } }));
  await renderizarEm('/compras/cotacoes/nova');
  digitar(porTestId('cotacao-numero'), 'COT-9');
  await selecionar(porTestId('cotacao-fornecedor'), '312');
  await adicionar912();
  await submeter();
  expect(alertas()).toContain('itens.0.quantidade: quantidade do item da cotação');
  expect(toast.error).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
  expect(texto()).toContain('Nova cotação'); // ficou no form
});
