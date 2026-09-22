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
import { toast } from 'react-toastify';
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

// Etapa 39 (T3) — pedidos ATRASADOS, como a rota passou a devolve-los na T1 (`437aed2`):
// `atrasado` e 0|1 (numero, nunca boolean) e `dias_atraso` e inteiro positivo ou `null`.
const PEDIDO_420_ATRASADO_3 = {
  id: 420, numero: 'PC-2026-420', fornecedor_nome: 'Parafusos Sul', valor_total: 90,
  data_pedido: '2026-09-10', previsao_entrega: '2026-09-25', status: 'pendente',
  atrasado: 1, dias_atraso: 3,
};
const PEDIDO_421_ATRASADO_1 = { ...PEDIDO_420_ATRASADO_3, id: 421, numero: 'PC-2026-421', dias_atraso: 1 };
// Itens do 420, para o export (uma linha por ITEM — contrato do F6 da 38).
const ITENS_420 = [{
  id: 4201, material_id: 907, codigo: 'ALM-0907', descricao: 'Chapa Aço 3mm',
  unidade: 'KG', quantidade: 3, valor_unitario: 30, quantidade_recebida: 0,
}];

// Etapa 41 (RN-F14) — cotacoes como `GET /compras/cotacoes` passou a devolve-las na T2: a lista
// traz `pedido_id`/`pedido_numero` (LEFT JOIN em `pedidos_compra`), nunca os itens. Ids 770/771/772
// (cotacoes) e 650 (pedido gerado) — fora do conjunto ocupado pelas outras suites.
//   770: aprovada, sem pedido  → e a UNICA que ganha o botao "Gerar pedido"
//   771: aprovada, JA convertida (pedido 650) → link para a edicao do pedido, sem botao
//   772: rejeitada, sem pedido → sem botao (RN-F09 na tela: `rejeitado`/`cancelado` nao geram)
const COTACOES_E41 = [
  { id: 770, numero: 'COT-2026-770', fornecedor_nome: 'Aços Vale Ltda', valor_total: 27, data_cotacao: '2026-09-20', validade: '2026-10-20', status: 'aprovado', pedido_id: null, pedido_numero: null },
  { id: 771, numero: 'COT-2026-771', fornecedor_nome: 'Parafusos Sul', valor_total: 90, data_cotacao: '2026-09-18', validade: null, status: 'aprovado', pedido_id: 650, pedido_numero: 'PC-2026-650' },
  { id: 772, numero: 'COT-2026-772', fornecedor_nome: 'Parafusos Sul', valor_total: 1, data_cotacao: '2026-09-18', validade: null, status: 'rejeitado', pedido_id: null, pedido_numero: null },
];

let container; let root; let pedidosDoBanco; let fornecedoresDoBanco; let itensDoBanco; let cotacoesDoBanco;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  pedidosDoBanco = [];
  fornecedoresDoBanco = FORNECEDORES_E39;
  itensDoBanco = {};
  cotacoesDoBanco = [];
  // Etapa 41: o unico POST que esta aba faz e a conversao (`…/gerar-pedido`, T2). Resolve com o
  // pedido gerado (`obterPedido` devolve `{ id, numero, … }`); qualquer outra URL REJEITA, pela
  // mesma razao do fallback do `api.get` abaixo.
  api.post.mockImplementation((url) => (url.endsWith('/gerar-pedido')
    ? Promise.resolve({ data: { id: 650, numero: 'PC-2026-650' } })
    : Promise.reject(new Error(`POST inesperado: ${url}`))));
  // Implementação aqui e não na fábrica do `jest.mock`: o `resetMocks` do react-scripts apaga
  // implementações entre cenários.
  //
  // O fallback REJEITA (convenção do almoxarifado): um fallback que resolvesse com `{ data: [] }`
  // deixaria a suíte cega — URL escrita errada devolveria lista vazia em silêncio e o cenário
  // mediria o `catch` da tela achando que mediu a tela.
  api.get.mockImplementation((url) => {
    if (url === '/compras/fornecedores') return Promise.resolve({ data: fornecedoresDoBanco });
    if (url === '/compras/pedidos') return Promise.resolve({ data: pedidosDoBanco });
    if (url === '/compras/cotacoes') return Promise.resolve({ data: cotacoesDoBanco });
    // Igualdade ANTES da regex (molde de `compras/PedidoCompraForm.test.js:177-182`):
    // `/compras/pedidos` e PREFIXO de `/compras/pedidos/:id`. A exportacao faz 1 GET por pedido
    // desde o F6 da 38 (`ba6278e`) — sem este ramo o fallback REJEITA e os cenarios de export
    // mediriam o `catch` da tela (itens = []), nao a tela.
    if (/^\/compras\/pedidos\/\d+$/.test(url)) {
      const id = Number(url.split('/').pop());
      const daLista = pedidosDoBanco.find((p) => p.id === id) || { id };
      return Promise.resolve({ data: { ...daLista, itens: itensDoBanco[id] || [] } });
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
// O checkbox mora DENTRO do `<label>` (nao ha `htmlFor`/`id`), entao o rotulo e o caminho ate ele.
// Devolve `null` quando nao existe — de proposito: o RED do cenario (f) tem de ser "clicar em
// null", visivel, e nao um seletor que silenciosamente acha outra coisa.
const checkboxPorRotulo = (t) => {
  const rotulo = [...container.querySelectorAll('label')].find((l) => l.textContent.includes(t));
  return rotulo ? rotulo.querySelector('input[type="checkbox"]') : null;
};
const chamadasDePedidos = () => api.get.mock.calls.filter((c) => c[0] === '/compras/pedidos');

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

// ── (c) RN-D07 pedido com dias_atraso 3 mostra "Atrasado ha 3 dias" ───────────────────────────
//
// A literal do contrato e `Atrasado há N dia(s)` RESOLVIDA: o parenteses e notacao do contrato,
// nunca texto de tela.
test('(c) pedido com dias_atraso 3 mostra "Atrasado ha 3 dias" na celula da previsao', async () => {
  pedidosDoBanco = [PEDIDO_420_ATRASADO_3];

  await renderizarEm('/compras/pedidos');

  expect(texto()).toContain('Atrasado há 3 dias');
  // e a data continua na MESMA celula (o badge nao SUBSTITUI a previsao — a informacao e SOBRE
  // ela; trocar uma pela outra tiraria do comprador o dado que ele usa para cobrar o fornecedor):
  expect(texto()).toContain('25/09/2026');
  const cels = celulasDaLinha(0);
  expect(cels[4].textContent).toContain('25/09/2026');
  expect(cels[4].textContent).toContain('Atrasado há 3 dias');
}, 10000);

// ── (d) RN-D07 singular ───────────────────────────────────────────────────────────────────────
test('(d) dias_atraso 1 mostra "Atrasado ha 1 dia" (singular), e nunca a literal com parenteses', async () => {
  pedidosDoBanco = [PEDIDO_421_ATRASADO_1];

  await renderizarEm('/compras/pedidos');

  expect(texto()).toContain('Atrasado há 1 dia');
  expect(texto()).not.toContain('Atrasado há 1 dias');
  expect(texto()).not.toContain('dia(s)'); // a literal e RESOLVIDA, nao copiada do contrato
}, 10000);

// ── (e) RN-D07 metade positiva de (c)/(d): no prazo nao mostra a frase ────────────────────────
//
// Nasce VERDE (a frase nao existia em lugar nenhum antes desta task) — e e exatamente por isso
// que nao basta sozinha: sem (c)/(d) ela ficaria verde com a feature inteira ausente.
test('(e) pedido no prazo NAO mostra a frase de atraso', async () => {
  pedidosDoBanco = [PEDIDO_419_NO_PRAZO]; // atrasado: 0, dias_atraso: null

  await renderizarEm('/compras/pedidos');

  expect(texto()).toContain('PC-2026-419'); // ancora: a linha do pedido esta na tela
  expect(texto()).not.toContain('Atrasado há');
  expect(texto()).not.toContain('null');
}, 10000);

// ── (f) RN-D07 o checkbox "So atrasados" manda `atrasados=1` — e so quando marcado ────────────
test('(f) marcar "So atrasados" dispara UMA listagem com atrasados=1; desmarcar dispara outra SEM a chave', async () => {
  pedidosDoBanco = [PEDIDO_420_ATRASADO_3];

  await renderizarEm('/compras/pedidos');

  const antes = chamadasDePedidos().length; // 1: a listagem da montagem
  expect(antes).toBe(1);
  expect('atrasados' in chamadasDePedidos()[0][1].params).toBe(false);

  await clicar(checkboxPorRotulo('Só atrasados'));

  const chamadas = chamadasDePedidos();
  expect(chamadas).toHaveLength(antes + 1); // UMA a mais, nao duas
  expect(chamadas[antes][1].params.atrasados).toBe(1);

  await clicar(checkboxPorRotulo('Só atrasados'));

  const depois = chamadasDePedidos();
  expect(depois).toHaveLength(antes + 2);
  // A chave NAO viaja com `0`: o servidor so liga com a string '1', entao `atrasados=0` seria
  // ruido de contrato viajando em toda listagem.
  expect('atrasados' in depois[antes + 1][1].params).toBe(false);
}, 10000);

// ── (g) RN-D07 o checkbox e CONDICIONAL a aba Pedidos ─────────────────────────────────────────
//
// O `<div className="filters">` e renderizado FORA do switch de abas e e COMPARTILHADO pelas
// tres: um controle incondicional apareceria na aba de Fornecedores fazendo NADA.
test('(g) na aba Fornecedores o checkbox nao existe, e a chave nunca viaja para a rota dela', async () => {
  await renderizarEm('/compras/fornecedores');

  expect(texto()).toContain('Parafusos Sul'); // ancora: a aba carregou de verdade
  expect(texto()).not.toContain('Só atrasados');
  expect(container.querySelector('input[type="checkbox"]')).toBeNull();

  const f = api.get.mock.calls.filter((c) => c[0] === '/compras/fornecedores');
  expect(f.length).toBeGreaterThan(0);
  f.forEach((c) => expect('atrasados' in c[1].params).toBe(false));
}, 10000);

// ── (h) RN-D02/RN-D08 o Excel leva a data do banco e as duas colunas novas ────────────────────
test('(h) o Excel exportado leva a data do banco e as colunas Atrasado/Dias de atraso NO FIM', async () => {
  pedidosDoBanco = [PEDIDO_420_ATRASADO_3];
  itensDoBanco[420] = ITENS_420;

  await renderizarEm('/compras/pedidos');
  await clicar(botaoPorTexto('Exportar Excel'));

  expect(exportToExcel).toHaveBeenCalledTimes(1);
  const [linhas, arquivo] = exportToExcel.mock.calls[0];
  expect(arquivo).toBe('pedidos_compra');
  expect(linhas).toHaveLength(1);
  expect(linhas[0]['Data']).toBe('10/09/2026');             // RN-D02: NAO 09/09/2026
  expect(linhas[0]['Previsão Entrega']).toBe('25/09/2026'); //         NAO 24/09/2026
  expect(linhas[0]['Atrasado']).toBe('Sim');
  expect(linhas[0]['Dias de atraso']).toBe(3);
  expect(typeof linhas[0]['Dias de atraso']).toBe('number'); // numero, nao '3': a planilha soma
  // AS 11 COLUNAS DA ETAPA 38 CONTINUAM IDENTICAS (e a assercao que protege o cenario (p) de
  // `compras/PedidoCompraForm.test.js:785` de cair por causa desta task):
  expect(linhas[0]['Código']).toBe('ALM-0907');
  expect(linhas[0]['Quantidade']).toBe(3);
  expect(linhas[0]['Valor Unitário']).toBe(30);
  expect(Object.keys(linhas[0])).toEqual([
    'Número', 'Fornecedor', 'Código', 'Descrição', 'Unidade', 'Quantidade', 'Valor Unitário',
    'Valor Total', 'Status', 'Data', 'Previsão Entrega', 'Atrasado', 'Dias de atraso',
  ]); // ORDEM congelada: as duas novas NO FIM
}, 10000);

// ── (i) RN-D08 metade negativa do (h): no prazo exporta "Nao" e a coluna de dias VAZIA ────────
test('(i) pedido no prazo exporta "Nao" e a coluna de dias vazia (nunca 0, nunca "-")', async () => {
  pedidosDoBanco = [PEDIDO_419_NO_PRAZO]; // dias_atraso: null

  await renderizarEm('/compras/pedidos');
  await clicar(botaoPorTexto('Exportar Excel'));

  expect(exportToExcel).toHaveBeenCalledTimes(1);
  const [linhas] = exportToExcel.mock.calls[0];
  expect(linhas).toHaveLength(1);
  expect(linhas[0]['Atrasado']).toBe('Não');
  // `''` e nao `null`/`0`/`'-'`: `null` sai como celula com a palavra em alguns leitores, `0`
  // mente ("zero dias de atraso" e diferente de "nao esta atrasado") e `'-'` quebraria a coluna
  // como numerica para quem filtrar a planilha.
  expect(linhas[0]['Dias de atraso']).toBe('');
}, 10000);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Etapa 41, Task 4 — a aba Cotacoes ganha a coluna Pedido e o botao "Gerar pedido" (RN-F14).
//
// A conversao e do SERVIDOR (design D5): a tela so faz o POST e vai para a edicao do pedido
// gerado, onde o comprador confere datas e previsao. O botao e CONDICIONAL — some quando a
// cotacao ja tem `pedido_id` (RN-F10 na tela) e quando o status e `rejeitado`/`cancelado`
// (RN-F09) — e nao tem `window.confirm` (decisao M6 da Fase 2: a acao e reversivel pela lixeira
// do pedido, que LIBERA a cotacao — RN-F12).
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// ── (j) RN-F14 coluna Pedido e botao condicional ──────────────────────────────────────────────
//
// RED medido contra o codigo velho: o `toEqual` dos `<th>` cai com 7 colunas (sem `Pedido`).
test('(j) RN-F14 coluna Pedido: "-" sem pedido, link PC- com pedido; botao Gerar pedido so em 770', async () => {
  cotacoesDoBanco = COTACOES_E41;

  await renderizarEm('/compras/cotacoes');

  expect([...container.querySelectorAll('thead th')].map((th) => th.textContent))
    .toEqual(['Número', 'Fornecedor', 'Valor Total', 'Data', 'Validade', 'Status', 'Pedido', 'Ações']);
  expect(celulasDaLinha(0)[6].textContent).toBe('-');
  const link = celulasDaLinha(1)[6].querySelector('a');
  expect(link.textContent).toBe('PC-2026-650');
  expect(link.getAttribute('href')).toBe('/compras/pedidos/editar/650');
  expect(container.querySelector('[data-testid="gerar-pedido-770"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="gerar-pedido-771"]')).toBeNull(); // ja tem pedido
  expect(container.querySelector('[data-testid="gerar-pedido-772"]')).toBeNull(); // rejeitado
}, 10000);

// ── (k) RN-F14 clicar em Gerar pedido: POST, toast e navegacao para a edicao do pedido ────────
test('(k) RN-F14 clicar em Gerar pedido -> POST na URL certa, toast com PC e numero, navega para a edicao do pedido', async () => {
  cotacoesDoBanco = COTACOES_E41;
  pedidosDoBanco = [{ id: 650, numero: 'PC-2026-650', fornecedor_id: 312, fornecedor_nome: 'Aços Vale Ltda', valor_total: 27, status: 'pendente', teve_recebimento: 0, itens: [] }];

  await renderizarEm('/compras/cotacoes');
  await clicar(container.querySelector('[data-testid="gerar-pedido-770"]'));

  expect(api.post.mock.calls).toHaveLength(1);
  expect(api.post.mock.calls[0][0]).toBe('/compras/cotacoes/770/gerar-pedido');
  expect(toast.success).toHaveBeenCalledWith('Pedido PC-2026-650 gerado da cotação COT-2026-770');
  // ⚠️ Fase 2 (C1): `PedidoCompraForm` esta em `reais` do Proxy desta suite (`:41-45`), entao ao
  // navegar a tela REAL monta — nao ha `data-stub`. A prova de que navegou e o h1 da edicao e o GET
  // por id (a regex `/compras/pedidos/\d+` do mock devolve a linha de `pedidosDoBanco`).
  expect(texto()).toContain('Editar pedido de compra');
  expect(api.get.mock.calls.filter(([u]) => u === '/compras/pedidos/650')).toHaveLength(1);
  expect(texto()).not.toContain('Gestão de fornecedores, pedidos e cotações');
}, 10000);

// ── (l) RN-F14 erro do servidor no toast, sem navegar; export com a coluna Pedido NO FIM ──────
//
// A literal e a DO SERVIDOR (`cotacaoJaGerouPedido`, T2) — mesmo canal e mesma razao da lixeira
// (`handleDelete`): um 409 trocado por texto generico fica indistinguivel de um 500 para quem
// clica, e o comprador tentaria de novo sem saber que o pedido ja existe.
test('(l) RN-F14 409 do servidor -> toast.error com a literal, sem navegar; export tem a coluna Pedido no fim', async () => {
  cotacoesDoBanco = COTACOES_E41;
  api.post.mockImplementation(() => Promise.reject({ response: { status: 409, data: { error: 'Cotação COT-2026-770 já gerou o pedido PC-2026-650' } } }));

  await renderizarEm('/compras/cotacoes');
  await clicar(container.querySelector('[data-testid="gerar-pedido-770"]'));

  expect(toast.error).toHaveBeenCalledWith('Cotação COT-2026-770 já gerou o pedido PC-2026-650');
  expect(toast.success).not.toHaveBeenCalled();
  expect(texto()).toContain('Gestão de fornecedores, pedidos e cotações'); // continua na aba

  await clicar(botaoPorTexto('Exportar Excel'));

  expect(exportToExcel).toHaveBeenCalledTimes(1);
  const [linhas, arquivo] = exportToExcel.mock.calls[0];
  expect(arquivo).toBe('cotacoes');
  expect(linhas).toHaveLength(3);
  // ORDEM congelada: as 6 colunas da aba continuam identicas e `Pedido` entra NO FIM.
  expect(Object.keys(linhas[0])).toEqual(['Número', 'Fornecedor', 'Valor', 'Status', 'Data', 'Validade', 'Pedido']);
  expect(linhas[1].Pedido).toBe('PC-2026-650');
  expect(linhas[0].Pedido).toBe(''); // sem pedido: '' e nao null/'-' (mesma razao do (i))
}, 10000);
