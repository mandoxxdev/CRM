/**
 * Etapa 39, Tasks 2 e 3 — a aba "Pedidos de Compra" do modulo Compras.
 *
 * O COMPONENTE NUNCA TEVE ARQUIVO DE TESTE, e "nao tem teste" e ENGANOSO como cobertura:
 * `compras/PedidoCompraForm.test.js` renderiza `AppRoutes` e ja exercita esta aba em dois
 * cenarios (a lixeira e a exportacao). Quem ler "nao tem teste" vai supor que pode mudar a aba
 * livremente. Nao pode — rode os dois arquivos.
 *
 * ⚠️ ESTE ARQUIVO **NAO** SETA `process.env.TZ`, de proposito. `client/jest.globalSetup.js` ja
 * fixa `America/Sao_Paulo` ANTES de o Jest forkar os workers, e registra a medicao de que a
 * atribuicao em runtime e **no-op** quando o processo ja tem TZ (achado A1 da Etapa 22). O que
 * este arquivo faz e AFIRMAR o fuso, num controle positivo: sem ele, um worker em UTC deixaria o
 * cenario (a) verde com o bug no lugar.
 *
 * Executar:
 *   cd client && CI=true npx react-scripts test --watchAll=false src/components/Compras.test.js
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App';
import api from '../services/api';
import { exportToExcel } from '../utils/exportExcel';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../utils/exportExcel', () => ({ exportToExcel: jest.fn() }));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn(), warning: jest.fn() },
  ToastContainer: () => null,
}));
// `App.js` importa ~150 páginas por `./routes/lazyModules`, todas via `React.lazy`. Stubar o
// módulo com um Proxy é o que torna a árvore de rotas inteira montável num teste: a tela que ESTE
// arquivo exercita vem REAL (é o ponto), o `Layout` vira um `<Outlet/>` nu e todo o resto vira
// uma caixa vazia. Molde: `compras/PedidoCompraForm.test.js`.
jest.mock('../routes/lazyModules', () => {
  const ReactMock = require('react');
  const { Outlet } = require('react-router-dom');
  const reais = {
    Compras: require('./Compras').default,
    PedidoCompraForm: require('./compras/PedidoCompraForm').default,
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
jest.mock('../components/ProtectedModuleRoute', () => ({
  __esModule: true, default: ({ children }) => children,
}));
jest.mock('../components/ProtectedModuleConfigRoute', () => ({
  __esModule: true, default: ({ children }) => children,
}));
jest.mock('../components/ProtectedAlmoxConfigRoute', () => ({
  __esModule: true, default: ({ children }) => children,
}));
jest.mock('../components/almoxarifado/RequisicoesMaterialContext', () => ({
  RequisicoesMaterialProvider: ({ children }) => children,
  useRequisicoesMaterial: () => ({}),
}));
jest.mock('../context/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({ user: { id: 64, nome: 'Comprador Teste' }, loading: false }),
}));

// Pedido 419: previsao NO PASSADO de proposito — e o caso que a Etapa 39 existe para mostrar, e
// o 418 de `PedidoCompraForm.test.js` tem previsao futura (por isso nada la cai).
const PEDIDO_419_NO_PRAZO = {
  id: 419, numero: 'PC-2026-419', fornecedor_nome: 'Aços Vale Ltda', valor_total: 315,
  data_pedido: '2026-09-10', previsao_entrega: '2026-09-16', status: 'aprovado',
  atrasado: 0, dias_atraso: null,
};

// Etapa 39 (RN-D01, metade positiva do (b)): `created_at` e DATETIME do SQLite ('AAAA-MM-DD
// HH:MM:SS'), e e o UNICO valor com hora que passa por `formatDate` nesta tela (Compras.js:180,
// coluna 'Cadastrado em' da EXPORTACAO de fornecedores). Sem a hora aqui, a metade positiva do
// (b) mediria o ramo do '-' de novo.
//
// A segunda linha (`21:40`) e de proposito: as 21:40 locais o instante UTC ja e o DIA SEGUINTE,
// entao ela e a que separa "cortar 10 caracteres" de "converter fuso".
const FORNECEDORES_E39 = [
  { id: 355, razao_social: 'Parafusos Sul', status: 'ativo', created_at: '2026-09-16 10:33:00' },
  { id: 312, razao_social: 'Aços Vale Ltda', status: 'ativo', created_at: '2026-09-10 21:40:00' },
];

let container; let root; let pedidosDoBanco; let fornecedoresDoBanco;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  pedidosDoBanco = [];
  fornecedoresDoBanco = FORNECEDORES_E39;
  // Implementação aqui e não na fábrica do `jest.mock`: o `resetMocks` do react-scripts apaga
  // implementações entre cenários.
  //
  // O fallback REJEITA (convenção do almoxarifado): um fallback que resolvesse com `{ data: [] }`
  // deixaria a suíte cega — URL escrita errada devolveria lista vazia em silêncio e o cenário
  // mediria o `catch` da tela achando que mediu a tela.
  api.get.mockImplementation((url) => {
    if (url === '/compras/fornecedores') return Promise.resolve({ data: fornecedoresDoBanco });
    if (url === '/compras/pedidos') return Promise.resolve({ data: pedidosDoBanco });
    if (url === '/compras/cotacoes') return Promise.resolve({ data: [] });
    if (/^\/compras\/pedidos\/\d+$/.test(url)) {
      return Promise.resolve({ data: { id: Number(url.split('/').pop()), itens: [] } });
    }
    return Promise.reject(new Error(`URL inesperada no teste: ${url}`));
  });
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
// Trocar de aba DENTRO do mesmo cenário exige raiz nova, e isso foi MEDIDO: um segundo
// `root.render` com outro `initialEntries` NÃO muda de rota — `MemoryRouter` só lê
// `initialEntries` na montagem, então a segunda renderização continuava na aba Pedidos (o
// cenário (b) exportou as linhas de PEDIDO achando que exportava fornecedores). Desmontar e
// recriar a raiz é o que dá um histórico novo.
async function remontarEm(rota) {
  await act(async () => { root.unmount(); });
  container.remove();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await renderizarEm(rota);
}
async function clicar(el) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });
  await esperarEfeitos();
}

// NBSP → espaço: `Intl.NumberFormat('pt-BR', { style: 'currency' })` separa `R$` do número com
// espaço inquebrável. Toda asserção de literal passa por aqui.
const texto = () => container.textContent.replace(/ /g, ' ');
const celulasDaLinha = (i = 0) => [
  ...container.querySelectorAll('table.data-table tbody tr')[i].querySelectorAll('td'),
];
const botaoPorTexto = (t) => [...container.querySelectorAll('button')]
  .find((b) => b.textContent.trim().includes(t));

// ── (a) RN-D01 a data exibida e a do banco, nao a do fuso ─────────────────────────────────────
//
// O DEFEITO ESCAPADO DA ETAPA 38: `formatDate` era `new Date(date).toLocaleDateString('pt-BR')`.
// `new Date('2026-09-16')` e meia-noite **UTC**; renderizada no fuso local (-03) vira o dia
// ANTERIOR. RED medido contra o codigo velho: `Expected substring: "16/09/2026"` e o DOM trazendo
// `15/09/2026`.
test('(a) a data exibida e a do banco, nao a do fuso', async () => {
  // CONTROLE POSITIVO PRIMEIRO — se esta linha cair, o resto do cenario nao prova nada: quer
  // dizer que "o fuso do processo nao e -03" (o `client/jest.globalSetup.js` deveria ter fixado
  // America/Sao_Paulo antes de forkar os workers). Um worker em UTC deixaria as quatro assercoes
  // abaixo VERDES com o bug no lugar — e e por isso que esta linha vem primeiro, nao depois.
  expect(new Date('2026-09-16').toLocaleDateString('pt-BR')).toBe('15/09/2026');
  pedidosDoBanco = [PEDIDO_419_NO_PRAZO];

  await renderizarEm('/compras/pedidos');

  expect(texto()).toContain('16/09/2026'); // previsao_entrega
  expect(texto()).toContain('10/09/2026'); // data_pedido
  expect(texto()).not.toContain('15/09/2026');
  expect(texto()).not.toContain('09/09/2026');
}, 10000);

// ── (b) RN-D01 valores fora do contrato mostram '-'; valor com hora vira os 10 primeiros ──────
test('(b) previsao null e data vazia mostram "-", e o valor com hora vira DD/MM/AAAA', async () => {
  pedidosDoBanco = [{ ...PEDIDO_419_NO_PRAZO, previsao_entrega: null, data_pedido: '' }];

  await renderizarEm('/compras/pedidos');

  // Colunas da aba Pedidos: Número | Fornecedor | Valor Total | Data Pedido | Previsão | Status | Ações
  const cels = celulasDaLinha(0);
  expect(cels[0].textContent).toContain('PC-2026-419'); // ancora: a linha e a do pedido, nao o "no-data"
  expect(cels[3].textContent).toBe('-'); // data_pedido: ''
  expect(cels[4].textContent).toBe('-'); // previsao_entrega: null

  // METADE POSITIVA, no MESMO cenario: `created_at` tem HORA, e `formatDate` tem de cortar os 10
  // primeiros caracteres — sem converter fuso. A tabela de fornecedores NAO renderiza
  // `created_at` (medido: as colunas sao Razão Social/CNPJ/Contato/Email/Telefone/Status/Ações);
  // a UNICA chamada de `formatDate` com DATETIME nesta tela e a coluna 'Cadastrado em' da
  // EXPORTACAO (`Compras.js`, `handleExportExcel`). Por isso a metade positiva exporta.
  await remontarEm('/compras/fornecedores');
  await clicar(botaoPorTexto('Exportar Excel'));

  expect(exportToExcel).toHaveBeenCalledTimes(1);
  const [linhas] = exportToExcel.mock.calls[0];
  expect(linhas).toHaveLength(2);
  expect(linhas[0]['Cadastrado em']).toBe('16/09/2026'); // '2026-09-16 10:33:00'
  // 21:40 locais ja e 2026-09-11 em UTC: esta linha separa "cortar 10 caracteres" de "converter fuso".
  expect(linhas[1]['Cadastrado em']).toBe('10/09/2026'); // '2026-09-10 21:40:00'
}, 10000);
