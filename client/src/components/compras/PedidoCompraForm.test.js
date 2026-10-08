/**
 * Etapa 38, Task 5 (RN-C12) — o formulário de pedido de compra, e as rotas que faltavam.
 *
 * O FURO QUE ESTA SUÍTE PAGA: a aba "Pedidos de Compra" do módulo Compras tinha dois `<Link>`
 * escritos e **nenhuma rota que os casasse** — `Compras.js` aponta para `/compras/pedidos/novo`
 * (o botão "Novo Pedido") e para `/compras/pedidos/editar/:id` (o lápis de cada linha), e
 * `App.js` não declarava nenhum dos dois. Clicar voltava para a própria lista.
 *
 * ⚠️ E A EXPLICAÇÃO QUE **NÃO** VALE, escrita aqui para ninguém a reintroduzir: não era o
 * `<Route path="*">` "vencendo" por estar declarado antes. `react-router-dom` aqui é **6.30.4** e
 * o v6 casa por **ranking de especificidade**, não por ordem de declaração — prova no próprio
 * `App.js`: `path="*"` é declarado ANTES de `path="fornecedores-homologados"` e
 * `/compras/fornecedores-homologados` renderiza `<GruposFornecedores/>`. Os links estavam mortos
 * porque **rota nenhuma casava**; o `*` era só quem sobrava. Consequência para a régua: a
 * sabotagem útil é **REMOVER** a `<Route>`, não movê-la de lugar.
 *
 * POR QUE OS CENÁRIOS RENDERIZAM `AppRoutes` E NÃO O COMPONENTE SOLTO:
 * um cenário que montasse `<PedidoCompraForm/>` direto passaria com `App.js` **sem rota nenhuma** —
 * ele provaria o formulário e deixaria o furo desta task (as rotas) sem régua. Por isso `AppRoutes`
 * passou a ser exportado de `App.js` e os cenários navegam por URL, com `MemoryRouter`. É também o
 * que permite clicar nos dois `<Link>` de `Compras.js` e afirmar que agora eles **chegam** na tela.
 *
 * POR QUE O FALLBACK DO MOCK DE `api` REJEITA (convenção do almoxarifado; molde:
 * `RecebimentosAlmoxarifado.test.js`): um fallback que resolvesse com `{ data: [] }` deixaria a
 * suíte cega — URL escrita errada devolveria lista vazia em silêncio e o cenário mediria o `catch`
 * da tela achando que mediu a tela. Aqui a URL inesperada estoura.
 *
 * POR QUE AS ASSERÇÕES DE TEXTO NORMALIZAM ` `:
 * `Intl.NumberFormat('pt-BR', { style: 'currency' })` separa `R$` do número com **espaço
 * inquebrável** (medido: `52 24 a0 …`). Um `includes('Total: R$ 100,00')` com espaço comum
 * **falha** contra o DOM real. O helper `texto()` troca NBSP por espaço — e é por isso que a
 * literal do contrato (`Total: R$ 100,00`) pode ser afirmada como está escrita no plano.
 *
 * POR QUE O TIPO É AFIRMADO ALÉM DO `toEqual`:
 * o schema do servidor é `z.number()` **sem coerção** (medido na Task 2: `'5'` → 400), e
 * `<input type="number">`/`<select>` devolvem **string**. O `toEqual` distingue `'4'` de `4`, mas
 * as três linhas de `typeof` ficam porque são o que **explica** a coação com `Number()` — e
 * sobrevivem a quem trocar o `toEqual` por `toMatchObject`.
 *
 * Executar:
 *   cd client && CI=true npx react-scripts test --watchAll=false \
 *     src/components/compras/PedidoCompraForm.test.js
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { AppRoutes } from '../../App';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { exportToExcel } from '../../utils/exportExcel';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
// Onda de correcao, F6: a exportacao da aba Pedidos passou a ser uma linha por ITEM, com a coluna
// `Código` — sem ela o export do proprio CRM nao se reimportava. O mock intercepta a planilha para
// que o cenario (p) possa AFIRMAR as colunas, em vez de provar que "nao deu erro".
jest.mock('../../utils/exportExcel', () => ({ exportToExcel: jest.fn() }));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn(), warning: jest.fn() },
  ToastContainer: () => null,
}));
// `App.js` importa ~150 páginas por `./routes/lazyModules`, todas via `React.lazy`. Stubar o
// módulo com um Proxy é o que torna a árvore de rotas inteira montável num teste: as duas telas
// que ESTE arquivo exercita vêm REAIS (é o ponto), o `Layout` vira um `<Outlet/>` nu (o de verdade
// carrega menu, permissões e consultas que nada têm a ver com esta régua) e todo o resto vira uma
// caixa vazia. Sem o Proxy seriam 150 linhas de stub, e cada página nova do sistema quebraria
// este arquivo.
jest.mock('../../routes/lazyModules', () => {
  const ReactMock = require('react');
  const { Outlet } = require('react-router-dom');
  const reais = {
    Compras: require('../Compras').default,
    PedidoCompraForm: require('./PedidoCompraForm').default,
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
// As três barreiras de módulo/config do `App.js` viram passagem: o que esta task mede é a TABELA
// de rotas, e o gate de módulo do Compras é o mesmo das rotas que já existiam (`ProtectedModuleRoute
// modulo="compras"`) — ele não muda nesta etapa e tem régua própria no servidor.
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

// Fornecedor **312** e material **907** são as fixtures que o plano fixou para o client desta
// etapa. Nenhum é `1` e nenhum é o PRIMEIRO da sua lista, de propósito: um formulário que
// escolhesse `lista[0]` sozinho (ou que deixasse o `<select>` no primeiro option) passaria por
// acidente. O `312` daqui é FORNECEDOR — em `RecebimentosAlmoxarifado.test.js` o `312` é um
// pedido, em outro arquivo, e isso está dito para o próximo leitor não achar que é o mesmo objeto.
const FORNECEDORES = [
  { id: 355, razao_social: 'Parafusos Sul', status: 'ativo' },
  { id: 312, razao_social: 'Aços Vale Ltda', status: 'ativo' },
];

const MATERIAIS_CHAPA = [
  { id: 901, codigo: 'ALM-0901', descricao: 'Chapa Aço 2mm', unidade: 'KG' },
  { id: 907, codigo: 'ALM-0907', descricao: 'Chapa Aço 3mm', unidade: 'KG' },
];

// O pedido do modo edição. `quantidade_recebida: 0` porque a régua da Task 3 recusa o `PUT` de
// pedido com recebimento — o cenário (g2) exercita essa recusa pela resposta do servidor, não por
// um estado local da tela (quem decide é o backend).
const PEDIDO_418 = {
  id: 418,
  numero: 'PC-2026-418',
  fornecedor_id: 312,
  fornecedor_nome: 'Aços Vale Ltda',
  valor_total: 315,
  data_pedido: '2026-09-10',
  previsao_entrega: '2026-09-25',
  status: 'aprovado',
  observacoes: 'Entregar no portão 2',
  // Onda de correção, F4: o `GET /:id` passou a devolver `teve_recebimento` (0|1, número — o
  // SQLite não tem boolean), derivado pelas MESMAS duas pernas da guarda do servidor. `0` aqui é
  // explícito de propósito: o contrato existe, e este pedido é o editável.
  teve_recebimento: 0,
  itens: [{
    id: 4181, material_id: 907, codigo: 'ALM-0907', descricao: 'Chapa Aço 3mm',
    unidade: 'KG', quantidade: 9, valor_unitario: 35, quantidade_recebida: 0,
  }],
};

/**
 * O MESMO pedido, depois de recebido pelo almoxarifado (onda de correção, F4).
 *
 * ⚠️ `quantidade_recebida` na linha continua **0** de propósito: este fixture representa o
 * recebimento CRIADO E NÃO PROCESSADO (perna 2 da régua do servidor, RN-23 da Etapa 37), que é
 * justamente o caso que uma tela olhando só para `quantidade_recebida` perderia. Quem decide é o
 * `teve_recebimento` do servidor, não uma conta local.
 */
const PEDIDO_418_RECEBIDO = { ...PEDIDO_418, teve_recebimento: 1 };

/**
 * ── Etapa 39 (RN-39.06/07) — as OPCOES do documento e o pedido COM o documento ─────────────────
 *
 * O contrato congelado de `GET /compras/pedidos-aux/opcoes`: listas fixas unidas ao DISTINCT do
 * que ja foi usado. As chaves sao as do plano (`frete_modalidades`, `condicoes_pagamento`, …), e
 * NAO as da Etapa 32 (`frete_modalidade`, `condicao_pagamento`, `ipi`) — a tela nova consome o
 * contrato novo. O frete tem `valor` (a string da SEFAZ, que e o que GRAVA) e `curto` (o rotulo
 * do botao): o cenario (39a) afirma que o payload leva o VALOR, nao o rotulo.
 */
const FRETE_CIF = '0-Contratação do Frete por conta do Remetente (CIF)';
const FRETE_FOB = '1-Contratação do Frete por conta do Destinatário (FOB)';
const ENDERECO_EMPRESA = 'Rua das Prensas, 100 - Caxias do Sul - RS - 95000-000';
const OPCOES = {
  frete_modalidades: [
    { valor: FRETE_CIF, curto: 'CIF — fornecedor paga' },
    { valor: FRETE_FOB, curto: 'FOB — nós pagamos' },
  ],
  condicoes_pagamento: ['À vista', 'Boleto', '30/60'],
  vias_transporte: ['Rodoviário', 'Retirada no fornecedor'],
  unidades: [{ valor: 'UN', curto: 'UN' }, { valor: 'KG', curto: 'KG' }],
  ipi_sugerido: [0, 3.25, 5, 6.5, 10, 15],
  transportadoras: ['Transportes Vale'],
  tabelas_preco: [],
  empresa: { nome: 'GMP Industriais', endereco: ENDERECO_EMPRESA },
};

/**
 * A SIMULACAO do servidor para `POST /compras/pedidos/calcular` (RN-39.02/05): arredonda por linha
 * e soma, como `pedidoTotais.js`. Esta e a conta do MOCK, usada para os cenarios que precisam de
 * um total plausivel ((f), (39f)); o cenario (39d) a SUBSTITUI por totais impossiveis justamente
 * para provar que o navegador mostra o que o servidor devolveu e nao o que ele mesmo somaria.
 */
const arred2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
function calcularComoServidor(corpo) {
  const itens = (corpo.itens || []).map((it) => {
    const valor_linha = arred2((Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0));
    const ipi_linha = arred2(valor_linha * (Number(it.ipi_percentual) || 0) / 100);
    return { ...it, valor_linha, ipi_linha };
  });
  const total_produtos = arred2(itens.reduce((s, it) => s + it.valor_linha, 0));
  const total_ipi = arred2(itens.reduce((s, it) => s + it.ipi_linha, 0));
  const total_icms_st = arred2(corpo.total_icms_st);
  const valor_frete = arred2(corpo.valor_frete);
  const total_desconto = arred2(corpo.total_desconto);
  return {
    itens,
    totais: {
      total_produtos, total_ipi, total_icms_st, total_desconto, valor_frete,
      total_geral: arred2(total_produtos + total_ipi + total_icms_st + valor_frete - total_desconto),
    },
  };
}

// O 418 COM o documento (RN-39.03): condicoes, IPI/NCM/peso/observacao por item e os `totais`.
// 315 + 31,50 (IPI 10%) + 10 (ICMS-ST) + 80 (frete) - 36,50 (desconto) = 400.
const PEDIDO_418_DOCUMENTO = {
  ...PEDIDO_418,
  valor_total: 400,
  condicao_pagamento: 'Boleto',
  frete_modalidade: FRETE_FOB,
  transportadora: 'Transportes Vale',
  transportadora_telefone: '(54) 3222-1000',
  via_transporte: 'Rodoviário',
  tabela_preco: 'Tabela 2026',
  contato: 'Sr. Paulo',
  local_entrega: ENDERECO_EMPRESA,
  local_cobranca: 'Av. Fiscal, 9',
  total_icms_st: 10,
  valor_frete: 80,
  total_desconto: 36.5,
  itens: [{
    ...PEDIDO_418.itens[0],
    item_numero: 1, ipi_percentual: 10, ncm: '7208.51.00', peso_unitario: 2.5,
    observacao: 'Pintura epóxi', valor_linha: 315, ipi_linha: 31.5,
  }],
  totais: {
    total_produtos: 315, total_ipi: 31.5, total_icms_st: 10, total_desconto: 36.5,
    valor_frete: 80, total_geral: 400,
  },
  fornecedor: { nome: 'Aços Vale Ltda', cnpj: '11.222.333/0001-44', origem: 'snapshot' },
};

// A linha da LISTA (aba Pedidos de `Compras.js`) usada pelos cenários de clique e da lixeira.
const PEDIDO_418_LISTA = {
  id: 418, numero: 'PC-2026-418', fornecedor_nome: 'Aços Vale Ltda', valor_total: 315,
  data_pedido: '2026-09-10', previsao_entrega: '2026-09-25', status: 'aprovado',
};

const LITERAL_409_DELETE = 'Pedido de compra PC-2026-418 já teve recebimento — não pode ser excluído';
const LITERAL_400_PUT = 'Pedido de compra PC-2026-418 já teve recebimento — não pode mais ser editado';
const LITERAL_400_ZOD = 'Dados inválidos — itens.0.quantidade: quantidade do item do pedido deve ser um número maior que zero';
const LITERAL_SEM_ITEM = 'Inclua ao menos um item no pedido de compra';
const LITERAL_AVISO_PRECO = 'Sem preço o custo médio do material não é alimentado no recebimento.';
const LITERAL_AVISO_NUMERO = 'O número do pedido é gerado pelo sistema.';
// Onda de correcao, F6: a literal do fracasso total da importacao (201 com `pedidos: []`).
const LITERAL_NADA_IMPORTADO = 'Nenhum pedido importado — veja os motivos abaixo';
// Onda de correcao F4 (Etapa 39): as duas literais da faixa do pedido ja recebido. Escritas AQUI e
// nao importadas do componente, como todas as outras deste arquivo — uma literal importada do
// proprio codigo que ela mede afirma "o componente concorda consigo mesmo" e nao o contrato.
const LITERAL_SO_STATUS = 'Este pedido já teve recebimento — só o status pode ser alterado';
const LITERAL_STATUS_ATUALIZADO = 'Status do pedido atualizado';

let container; let root; let pedidosDoBanco;
// Onda de correcao, F4: o detalhe do 418 passou a ser TROCAVEL por cenario — o unico que o troca e
// o (r), que precisa de `teve_recebimento: 1`. Restaurado a cada `beforeEach`, e nao no proprio
// cenario, para um `expect` que falhe no meio nao vazar o fixture recebido para os outros 22.
let detalhe418;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  pedidosDoBanco = [];
  detalhe418 = PEDIDO_418;
  // Implementação aqui e não na fábrica do `jest.mock`: o `resetMocks` do react-scripts apaga
  // implementações entre cenários.
  api.get.mockImplementation((url) => {
    if (url === '/compras/fornecedores') return Promise.resolve({ data: FORNECEDORES });
    if (url === '/compras/pedidos') return Promise.resolve({ data: pedidosDoBanco });
    if (url === '/compras/cotacoes') return Promise.resolve({ data: [] });
    // Igualdade ANTES da regex: `/compras/pedidos` é PREFIXO de `/compras/pedidos/:id`, e um
    // `startsWith` daria o ARRAY da lista ao formulário de edição — que renderizaria sem `itens`
    // e com a suíte verde.
    if (/^\/compras\/pedidos\/\d+$/.test(url)) {
      const id = Number(url.split('/').pop());
      return id === PEDIDO_418.id
        ? Promise.resolve({ data: detalhe418 })
        : Promise.reject(new Error(`Pedido ${id} fora da fixture`));
    }
    if (url === '/compras/materiais') return Promise.resolve({ data: MATERIAIS_CHAPA });
    if (url === '/compras/pedidos-aux/opcoes') return Promise.resolve({ data: OPCOES });
    return Promise.reject(new Error(`URL inesperada no teste: ${url}`));
  });
  // Etapa 39: o POST e por URL — `/calcular` responde a conta simulada (ver `calcularComoServidor`)
  // e o resto continua sendo a criacao. Os cenarios que trocam `api.post` por um `reject` geral
  // ((g), (k), (m)…) derrubam TAMBEM o `/calcular`: a tela tem de seguir de pe sem ele.
  api.post.mockImplementation((url, corpo) => (url === '/compras/pedidos/calcular'
    ? Promise.resolve({ data: calcularComoServidor(corpo) })
    : Promise.resolve({ data: { id: 640, numero: 'PC-2026-640' } })));
  api.put.mockImplementation(() => Promise.resolve({ data: { id: 418, numero: 'PC-2026-418' } }));
  // Onda de correcao, F4: a porta nova `PATCH /compras/pedidos/:id/status`. O `api` e um instance
  // do axios (que TEM `patch`); o mock precisava ganhar a chave, senao o cenario novo mediria
  // `undefined is not a function` e nao o contrato.
  api.patch.mockImplementation(() => Promise.resolve({ data: { id: 418, numero: 'PC-2026-418', status: 'recebido' } }));
  api.delete.mockImplementation(() => Promise.resolve({ data: { message: 'Pedido de compra excluído com sucesso' } }));
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
// + evento `input`, que é o que o React ouve. Molde: o helper `digitar` de `RequisicoesList.test.js`
// (referência por NOME, não por linha — número de linha derivou três vezes nesta branch).
function digitar(input, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function digitarTextarea(el, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
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
    container.querySelector('form[data-testid="form-pedido-compra"]')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await esperarEfeitos();
}

/**
 * A planilha é DE VERDADE (workbook `xlsx` escrito e lido), como no cenário (k): um mock de `xlsx`
 * provaria o POST e não a leitura. O `FileReader` do jsdom é assíncrono — uma volta de microtasks
 * não basta, daí as seis.
 */
async function importarPlanilha(aoa) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Pedidos');
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const arquivo = new File([bytes], 'pedidos.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const input = porTestId('importar-planilha');
  Object.defineProperty(input, 'files', { value: [arquivo], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  for (let i = 0; i < 6; i += 1) await esperarEfeitos();
}

// NBSP → espaço: ver o cabeçalho. Toda asserção de literal passa por aqui.
const texto = () => container.textContent.replace(/ /g, ' ');
const porTestId = (id) => container.querySelector(`[data-testid="${id}"]`);
const alertas = () => [...container.querySelectorAll('[role="alert"]')]
  .map((el) => el.textContent.replace(/ /g, ' ')).join(' | ');
const chamadasPost = () => api.post.mock.calls.filter(([url]) => url === '/compras/pedidos');
const chamadasPut = (id) => api.put.mock.calls.filter(([url]) => url === `/compras/pedidos/${id}`);
const chamadasPatchStatus = (id) => api.patch.mock.calls
  .filter(([url]) => url === `/compras/pedidos/${id}/status`);
const chamadasMateriais = () => api.get.mock.calls.filter(([url]) => url === '/compras/materiais');
const chamadasDetalhe = (id) => api.get.mock.calls.filter(([url]) => url === `/compras/pedidos/${id}`);
const chamadasLista = () => api.get.mock.calls.filter(([url]) => url === '/compras/pedidos');
const chamadasImportar = () => api.post.mock.calls.filter(([url]) => url === '/compras/pedidos/importar');
const chamadasCalcular = () => api.post.mock.calls.filter(([url]) => url === '/compras/pedidos/calcular');
const chamadasOpcoes = () => api.get.mock.calls.filter(([url]) => url === '/compras/pedidos-aux/opcoes');
// O debounce do `/calcular` e de 300 ms (RN-39.07); com timers REAIS, esperar 350 ms e o que faz
// a conta chegar ao DOM. Os cenarios de TEMPO ((39d)) usam timers falsos e nao passam por aqui.
const esperarCalculo = async () => {
  await act(async () => { await new Promise((r) => setTimeout(r, 350)); });
};
const textoDe = (id) => (porTestId(id)?.textContent || '').replace(/ /g, ' ');
const botaoPorTexto = (t) => [...container.querySelectorAll('button')]
  .find((b) => b.textContent.trim().includes(t));
const linkPorTexto = (t) => [...container.querySelectorAll('a')]
  .find((a) => a.textContent.trim().includes(t));

// Preenche o cabeçalho e UM item (material 907, 4 x 25) — o estado do cenário (c).
async function preencherPedidoValido() {
  await selecionar(porTestId('pedido-fornecedor'), '312');
  digitar(porTestId('pedido-data'), '2026-09-16');
  digitar(porTestId('pedido-previsao'), '2026-09-30');
  await esperarEfeitos();
  digitar(porTestId('busca-material'), 'CHAPA');
  await clicar(porTestId('botao-buscar-material'));
  await clicar(porTestId('adicionar-material-907'));
  digitar(porTestId('qtd-item-907'), '4');
  digitar(porTestId('valor-item-907'), '25');
  await esperarEfeitos();
}

// ── (a) a rota /compras/pedidos/novo EXISTE ───────────────────────────────────────────────────
test('(a) /compras/pedidos/novo renderiza o formulario, e nao a lista de pedidos', async () => {
  await renderizarEm('/compras/pedidos/novo');

  expect(texto()).toContain('Novo pedido de compra');
  // A metade que prova que não é a lista se disfarçando de tela nova: `Compras.js` renderiza
  // SEMPRE o subtítulo do módulo, e a aba Pedidos com fixture vazia renderiza "Nenhum pedido
  // encontrado". Sem a `<Route>`, o `path="*"` sobra e as duas frases aparecem.
  expect(texto()).not.toContain('Nenhum pedido encontrado');
  expect(texto()).not.toContain('Gestão de fornecedores, pedidos e cotações');
  // O aviso do número (decisão 5: o número é gerado) e a AUSÊNCIA de campo de número.
  expect(texto()).toContain(LITERAL_AVISO_NUMERO);
  expect(porTestId('pedido-numero')).toBeNull();
  // Metade positiva do `<select>` de fornecedor: ele veio da rota mockada, com as duas razões
  // sociais. Um `<select>` vazio deixaria o cenário (c) submeter `fornecedor_id: NaN`.
  const opcoes = [...porTestId('pedido-fornecedor').querySelectorAll('option')].map((o) => o.textContent);
  expect(opcoes).toContain('Aços Vale Ltda');
  expect(opcoes).toContain('Parafusos Sul');
  // A tabela de itens nasce vazia, com a literal do contrato.
  expect(texto()).toContain('Nenhum item adicionado');
});

// ── (b) a busca de material bate na porta do PRÓPRIO módulo Compras ───────────────────────────
test('(b) a busca de material chama GET /compras/materiais com o termo digitado', async () => {
  await renderizarEm('/compras/pedidos/novo');
  // A montagem NÃO consulta materiais: a busca é ato do usuário (a porta tem LIMIT 50 e a lista
  // inteira de materiais não cabe num `<select>`).
  expect(chamadasMateriais()).toHaveLength(0);

  digitar(porTestId('busca-material'), 'CHAPA');
  await clicar(porTestId('botao-buscar-material'));

  expect(chamadasMateriais()).toHaveLength(1);
  expect(chamadasMateriais()[0][1].params.search).toBe('CHAPA');
  // Metade positiva: o resultado virou opção clicável, com código E descrição (a porta devolve
  // `descricao` de `COALESCE(nome, descricao)` justamente para a opção não sair em branco).
  expect(texto()).toContain('ALM-0907');
  expect(texto()).toContain('Chapa Aço 3mm');
  expect(porTestId('adicionar-material-907')).not.toBeNull();
});

// ── (c) o payload exato, e os TIPOS ───────────────────────────────────────────────────────────
test('(c) submeter manda UM POST com o payload exato, sem numero e sem valor_total', async () => {
  await renderizarEm('/compras/pedidos/novo');
  await preencherPedidoValido();
  await submeter();

  expect(chamadasPost()).toHaveLength(1);
  const payload = chamadasPost()[0][1];
  // Etapa 39: o cabecalho ganhou as 9 condicoes (strings, vazias quando nao escolhidas) e os 3
  // encargos (numeros); o item ganhou IPI/NCM/peso/observacao. O cenario (39e) afirma o payload
  // COM o documento preenchido; este continua afirmando o pedido MINIMO — e que nada mais viaja.
  expect(payload).toEqual({
    fornecedor_id: 312,
    data_pedido: '2026-09-16',
    previsao_entrega: '2026-09-30',
    status: 'pendente',
    observacoes: '',
    condicao_pagamento: '',
    frete_modalidade: '',
    transportadora: '',
    transportadora_telefone: '',
    via_transporte: '',
    tabela_preco: '',
    contato: '',
    local_entrega: '',
    local_cobranca: '',
    total_icms_st: 0,
    valor_frete: 0,
    total_desconto: 0,
    itens: [{
      material_id: 907, quantidade: 4, valor_unitario: 25,
      ipi_percentual: 0, ncm: '', peso_unitario: '', observacao: '',
    }],
  });
  expect('numero' in payload).toBe(false);
  expect('valor_total' in payload).toBe(false);
  // Os tipos, que é o que o servidor recusa (`z.number()` sem coerção).
  expect(typeof payload.fornecedor_id).toBe('number');
  expect(typeof payload.itens[0].material_id).toBe('number');
  expect(typeof payload.itens[0].quantidade).toBe('number');
  expect(typeof payload.itens[0].valor_unitario).toBe('number');
  // Metade positiva do fim do fluxo: sucesso avisa e sai da tela.
  expect(toast.success).toHaveBeenCalledTimes(1);
});

// ── (d) a guarda do item, com a metade positiva ───────────────────────────────────────────────
test('(d) submeter sem item nao chama a API e mostra a literal do servidor', async () => {
  await renderizarEm('/compras/pedidos/novo');
  await selecionar(porTestId('pedido-fornecedor'), '312');
  await submeter();

  expect(api.post.mock.calls).toHaveLength(0);
  expect(alertas()).toContain(LITERAL_SEM_ITEM);

  // Metade positiva NO MESMO cenário: com um item, o mesmo submit passa. Sem ela, um formulário
  // que recusasse TUDO ficaria verde aqui.
  digitar(porTestId('busca-material'), 'CHAPA');
  await clicar(porTestId('botao-buscar-material'));
  await clicar(porTestId('adicionar-material-907'));
  digitar(porTestId('qtd-item-907'), '4');
  digitar(porTestId('valor-item-907'), '25');
  await esperarEfeitos();
  await submeter();
  expect(chamadasPost()).toHaveLength(1);
});

// ── (e) modo edição ───────────────────────────────────────────────────────────────────────────
test('(e) /compras/pedidos/editar/418 carrega o GET /:id, mostra os itens e submete por PUT', async () => {
  await renderizarEm('/compras/pedidos/editar/418');

  expect(chamadasDetalhe(418)).toHaveLength(1);
  expect(texto()).toContain('Editar pedido de compra');
  expect(texto()).toContain('PC-2026-418');
  // Os itens que VIERAM do servidor, não uma tabela vazia.
  expect(texto()).not.toContain('Nenhum item adicionado');
  expect(porTestId('qtd-item-907').value).toBe('9');
  expect(porTestId('valor-item-907').value).toBe('35');
  expect(porTestId('pedido-fornecedor').value).toBe('312');
  expect(porTestId('pedido-status').value).toBe('aprovado');

  await submeter();

  expect(chamadasPut(418)).toHaveLength(1);
  expect(api.post.mock.calls).toHaveLength(0);
  // O 418 desta fixture e ANTERIOR ao documento (sem condicoes, sem `totais`): a edicao de um
  // pedido legado manda as condicoes vazias e o item com IPI 0 — o servidor completa NCM/peso.
  expect(chamadasPut(418)[0][1]).toEqual({
    fornecedor_id: 312,
    data_pedido: '2026-09-10',
    previsao_entrega: '2026-09-25',
    status: 'aprovado',
    observacoes: 'Entregar no portão 2',
    condicao_pagamento: '',
    frete_modalidade: '',
    transportadora: '',
    transportadora_telefone: '',
    via_transporte: '',
    tabela_preco: '',
    contato: '',
    local_entrega: '',
    local_cobranca: '',
    total_icms_st: 0,
    valor_frete: 0,
    total_desconto: 0,
    itens: [{
      material_id: 907, quantidade: 9, valor_unitario: 35,
      ipi_percentual: 0, ncm: '', peso_unitario: '', observacao: '',
    }],
  });
});

// ── (f) o total calculado ─────────────────────────────────────────────────────────────────────
//
// Etapa 39: o total deixou de ser uma conta local — e o que `/calcular` devolve (aqui, a
// simulacao `calcularComoServidor` do mock), 300 ms depois da ultima tecla. O cenario (39d) e quem
// prova que o navegador NAO soma; este prova que o total ACOMPANHA o que se digita.
test('(f) o total calculado aparece e acompanha a quantidade', async () => {
  await renderizarEm('/compras/pedidos/novo');
  await preencherPedidoValido();
  await esperarCalculo();

  expect(textoDe('total-geral')).toContain('R$ 100,00');
  expect(textoDe('subtotal-item-907')).toContain('R$ 100,00');

  // Metade positiva: mudar a quantidade muda o total (um total hard-coded passaria na primeira).
  digitar(porTestId('qtd-item-907'), '5');
  await esperarCalculo();
  expect(textoDe('total-geral')).toContain('R$ 125,00');
  expect(textoDe('total-geral')).not.toContain('R$ 100,00');
});

// ── (g) o 400 do servidor chega ao DOM e o formulário fica de pé ───────────────────────────────
test('(g) o 400 do POST aparece em role=alert e os campos continuam preenchidos', async () => {
  api.post.mockImplementation(() => Promise.reject({
    response: { status: 400, data: { error: LITERAL_400_ZOD } },
  }));
  await renderizarEm('/compras/pedidos/novo');
  await preencherPedidoValido();
  await submeter();

  expect(chamadasPost()).toHaveLength(1);
  expect(alertas()).toContain(LITERAL_400_ZOD);
  // O formulário FICA DE PÉ: continua sendo o formulário, e com o que foi digitado.
  expect(texto()).toContain('Novo pedido de compra');
  expect(porTestId('pedido-fornecedor').value).toBe('312');
  expect(porTestId('qtd-item-907').value).toBe('4');
  expect(porTestId('valor-item-907').value).toBe('25');
});

// ── (g2) o 400 do PUT da Task 3 (pedido já recebido) chega ao DOM ─────────────────────────────
test('(g2) a recusa do PUT por recebimento aparece em role=alert, e o PUT bom passa', async () => {
  api.put.mockImplementation(() => Promise.reject({
    response: { status: 400, data: { error: LITERAL_400_PUT } },
  }));
  await renderizarEm('/compras/pedidos/editar/418');
  await submeter();

  expect(chamadasPut(418)).toHaveLength(1);
  expect(alertas()).toContain(LITERAL_400_PUT);
  expect(texto()).toContain('Editar pedido de compra');

  // Metade positiva no MESMO cenário: com o servidor aceitando, o mesmo gesto grava e avisa —
  // senão "mostra a recusa" passaria numa tela que nunca consegue salvar.
  api.put.mockImplementation(() => Promise.resolve({ data: { id: 418, numero: 'PC-2026-418' } }));
  await submeter();
  expect(chamadasPut(418)).toHaveLength(2);
  expect(toast.success).toHaveBeenCalledTimes(1);
});

// ── (h2) o 409 da RN-C08 chega a quem clica na lixeira ────────────────────────────────────────
test('(h2) a lixeira da aba Pedidos mostra a literal do 409, nao a generica', async () => {
  pedidosDoBanco = [PEDIDO_418_LISTA];
  const confirmOriginal = window.confirm;
  window.confirm = jest.fn(() => true);
  api.delete.mockImplementation(() => Promise.reject({
    response: { status: 409, data: { error: LITERAL_409_DELETE } },
  }));
  try {
    await renderizarEm('/compras/pedidos');
    expect(texto()).toContain('PC-2026-418');

    const lixeira = [...container.querySelectorAll('button[title="Excluir"]')][0];
    await clicar(lixeira);

    expect(api.delete.mock.calls).toHaveLength(1);
    expect(api.delete.mock.calls[0][0]).toBe('/compras/pedidos/418');
    // A literal DO SERVIDOR. Hoje o `catch` de `Compras.js` troca qualquer erro por
    // 'Erro ao excluir item' e o 409 que a Task 3 congela fica indistinguível de um 500.
    expect(toast.error).toHaveBeenCalledWith(LITERAL_409_DELETE);
    expect(toast.error).not.toHaveBeenCalledWith('Erro ao excluir item');
    // E a linha continua na lista: recusado é recusado.
    expect(texto()).toContain('PC-2026-418');

    // Metade positiva no MESMO cenário: com o DELETE passando, o toast é de sucesso e a lista é
    // recarregada. Sem ela, um `catch` que mostrasse a literal e engolisse o sucesso passaria.
    const listasAntes = chamadasLista().length;
    api.delete.mockImplementation(() => Promise.resolve({
      data: { message: 'Pedido de compra excluído com sucesso' },
    }));
    await clicar([...container.querySelectorAll('button[title="Excluir"]')][0]);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(chamadasLista().length).toBe(listasAntes + 1);
  } finally {
    window.confirm = confirmOriginal;
  }
});

// ── (i) os dois `<Link>` mortos de `Compras.js` agora chegam na tela ──────────────────────────
test('(i) clicar em "Novo Pedido" e no "Editar" da linha chega ao formulario', async () => {
  pedidosDoBanco = [PEDIDO_418_LISTA];
  await renderizarEm('/compras/pedidos');

  await clicar(linkPorTexto('Novo Pedido'));
  expect(texto()).toContain('Novo pedido de compra');
  expect(texto()).not.toContain('Gestão de fornecedores, pedidos e cotações');

  // Segundo link, render novo: o lápis da linha 418.
  await act(async () => { root.unmount(); });
  container.remove();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await renderizarEm('/compras/pedidos');
  await clicar(container.querySelector('a[title="Editar"]'));
  expect(texto()).toContain('Editar pedido de compra');
  expect(chamadasDetalhe(418)).toHaveLength(1);
});

// ── (j) o aviso de preço 0 (decisão: preço é opcional, e tem custo) ───────────────────────────
test('(j) item com valor_unitario 0 mostra o aviso do custo medio, e com preco o aviso sai', async () => {
  await renderizarEm('/compras/pedidos/novo');
  await selecionar(porTestId('pedido-fornecedor'), '312');
  digitar(porTestId('busca-material'), 'CHAPA');
  await clicar(porTestId('botao-buscar-material'));
  await clicar(porTestId('adicionar-material-907'));
  digitar(porTestId('qtd-item-907'), '4');
  digitar(porTestId('valor-item-907'), '0');
  await esperarEfeitos();

  expect(texto()).toContain(LITERAL_AVISO_PRECO);

  // Metade positiva: com preço, o aviso sai (um aviso permanente não avisa nada).
  digitar(porTestId('valor-item-907'), '25');
  await esperarEfeitos();
  expect(texto()).not.toContain(LITERAL_AVISO_PRECO);

  // E o aviso NÃO barra o submit: `valor_unitario: 0` é aceito pelo servidor (201) de propósito.
  // O submit vem POR ÚLTIMO porque o sucesso sai da tela — e um `digitar` depois dele mediria um
  // input que não existe mais.
  digitar(porTestId('valor-item-907'), '0');
  await esperarEfeitos();
  await submeter();
  expect(chamadasPost()).toHaveLength(1);
  expect(chamadasPost()[0][1].itens[0].valor_unitario).toBe(0);
  expect(typeof chamadasPost()[0][1].itens[0].valor_unitario).toBe('number');
});

// ── (k) a importação por planilha ─────────────────────────────────────────────────────────────
test('(k) importar planilha manda as linhas lidas no navegador e mostra pedidos e ignorados', async () => {
  api.post.mockImplementation((url) => {
    if (url !== '/compras/pedidos/importar') return Promise.reject(new Error(`POST inesperado: ${url}`));
    return Promise.resolve({
      data: {
        pedidos: [
          { id: 640, numero: 'PC-2026-640', itens: 2 },
          { id: 641, numero: 'PC-2026-641', itens: 1 },
        ],
        itens: 3,
        ignorados: [{ linha: 4, motivo: 'material não encontrado pelo código ALM-9999' }],
      },
    });
  });
  await renderizarEm('/compras/pedidos/novo');

  // A planilha é lida NO NAVEGADOR (precedente medido: `ItensFornecedor.js`, `XLSX.read`) e o que
  // sai para a porta é JSON. O workbook abaixo é de verdade — um mock de `xlsx` provaria o POST e
  // não a leitura.
  const linhas = [
    ['pedido', 'codigo', 'quantidade', 'valor_unitario'],
    ['OC-77', 'ALM-0907', 4, 25],
    ['OC-77', 'ALM-0901', 2, 10],
    ['OC-78', 'ALM-0907', 1, 25],
    ['OC-78', 'ALM-9999', 3, 5],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), 'Pedidos');
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const arquivo = new File([bytes], 'pedidos.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const input = porTestId('importar-planilha');
  Object.defineProperty(input, 'files', { value: [arquivo], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  // O `FileReader` do jsdom é assíncrono: uma volta de microtasks não basta.
  for (let i = 0; i < 6; i += 1) await esperarEfeitos();

  expect(chamadasImportar()).toHaveLength(1);
  expect(chamadasImportar()[0][1]).toEqual({
    linhas: [
      { pedido: 'OC-77', codigo: 'ALM-0907', quantidade: 4, valor_unitario: 25 },
      { pedido: 'OC-77', codigo: 'ALM-0901', quantidade: 2, valor_unitario: 10 },
      { pedido: 'OC-78', codigo: 'ALM-0907', quantidade: 1, valor_unitario: 25 },
      { pedido: 'OC-78', codigo: 'ALM-9999', quantidade: 3, valor_unitario: 5 },
    ],
  });
  // O cabeçalho virou CHAVE e não linha de dados — se ele viajasse, o servidor devolveria uma
  // recusa a mais em `ignorados` e ninguém entenderia por quê.
  expect(chamadasImportar()[0][1].linhas).toHaveLength(4);

  const resultado = porTestId('resultado-importacao').textContent;
  expect(resultado).toContain('2 pedidos criados, 3 itens');
  expect(resultado).toContain('PC-2026-640');
  expect(resultado).toContain('PC-2026-641');
  expect(resultado).toContain('Linhas ignoradas');
  expect(resultado).toContain('Linha 4: material não encontrado pelo código ALM-9999');
});

// ── (k2) a metade negativa da importação: o 400 da porta ──────────────────────────────────────
test('(k2) o 400 da importacao aparece no DOM e nao inventa uma segunda frase', async () => {
  const LITERAL_400_IMPORT = 'Envie "linhas" ou "rows" com array de objetos (qualquer formato de planilha)';
  api.post.mockImplementation(() => Promise.reject({
    response: { status: 400, data: { error: LITERAL_400_IMPORT } },
  }));
  await renderizarEm('/compras/pedidos/novo');

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['pedido', 'codigo'], ['OC-77', 'ALM-0907']]), 'P');
  const arquivo = new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], 'p.xlsx');
  const input = porTestId('importar-planilha');
  Object.defineProperty(input, 'files', { value: [arquivo], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  for (let i = 0; i < 6; i += 1) await esperarEfeitos();

  expect(chamadasImportar()).toHaveLength(1);
  expect(alertas()).toContain(LITERAL_400_IMPORT);
  expect(porTestId('resultado-importacao')).toBeNull();
});

// ── (l) o pré-preenchimento por query, que a Task 6 vai consumir ──────────────────────────────
test('(l) /novo?solicitacao&material&quantidade pre-carrega o item e manda solicitacao_id', async () => {
  await renderizarEm('/compras/pedidos/novo?solicitacao=77&material=907&quantidade=6&material_nome=Chapa%20A%C3%A7o%203mm');

  // O item já nasce na tabela — e SEM consultar `/compras/materiais` (não existe porta que
  // resolva um material por id no módulo Compras; a Reposição manda o nome junto).
  expect(texto()).not.toContain('Nenhum item adicionado');
  expect(porTestId('qtd-item-907').value).toBe('6');
  expect(texto()).toContain('Chapa Aço 3mm');
  expect(chamadasMateriais()).toHaveLength(0);

  await selecionar(porTestId('pedido-fornecedor'), '312');
  digitar(porTestId('pedido-data'), '2026-09-16');
  digitar(porTestId('valor-item-907'), '25');
  await esperarEfeitos();
  await submeter();

  expect(chamadasPost()).toHaveLength(1);
  expect(chamadasPost()[0][1].solicitacao_id).toBe(77);
  expect(typeof chamadasPost()[0][1].solicitacao_id).toBe('number');
  expect(chamadasPost()[0][1].itens).toEqual([{
    material_id: 907, quantidade: 6, valor_unitario: 25,
    ipi_percentual: 0, ncm: '', peso_unitario: '', observacao: '',
  }]);
});

// ── (m) o 403 do gate condicional do vínculo (fix 1 da Task 2) vira frase ─────────────────────
test('(m) o 403 de gerenciar_reposicao vira a frase de permissao no DOM', async () => {
  api.post.mockImplementation(() => Promise.reject({
    response: {
      status: 403,
      data: { error: 'Sem permissão para esta operação', acao: 'gerenciar_reposicao', perfil: 'PRODUCAO' },
    },
  }));
  await renderizarEm('/compras/pedidos/novo?solicitacao=77&material=907&quantidade=6');
  await selecionar(porTestId('pedido-fornecedor'), '312');
  digitar(porTestId('valor-item-907'), '25');
  await esperarEfeitos();
  await submeter();

  // `formatarErroPermissao` já existe e rotula `acao`/`perfil` — a tela nova usa o mesmo utilitário
  // em vez de mostrar 'Sem permissão para esta operação' cru.
  expect(alertas()).toContain('Sem permissão para gerenciar reposição e compras — seu perfil é Produção.');
});

// ── (n) o textarea de observações viaja, e o campo de número não existe ───────────────────────
test('(n) observacoes preenchido viaja no payload e continua sem chave numero', async () => {
  await renderizarEm('/compras/pedidos/novo');
  await preencherPedidoValido();
  digitarTextarea(porTestId('pedido-observacoes'), 'Urgente — parada de linha');
  await selecionar(porTestId('pedido-status'), 'aprovado');
  // O botão é afirmado ANTES do submit: o sucesso navega para a lista e a tela deixa de existir.
  expect(botaoPorTexto('Salvar pedido')).not.toBeNull();
  await submeter();

  expect(chamadasPost()).toHaveLength(1);
  expect(chamadasPost()[0][1].observacoes).toBe('Urgente — parada de linha');
  expect(chamadasPost()[0][1].status).toBe('aprovado');
  expect('numero' in chamadasPost()[0][1]).toBe(false);
});

// ── (o) Etapa 38, Task 6 — o vínculo NÃO-FATAL do servidor tem de chegar a quem clicou ────────
//
// Decisão 10 do design (corrigida pelo fix 1 da Task 2): o `POST` com `solicitacao_id` cria o
// pedido e SÓ DEPOIS chama `vincularPedidoCompra`, em `try/catch` — falhar ali responde **201**
// com `vinculo_solicitacao: 'falhou'`. Sem este cenário, o único consumidor do campo era uma
// linha de código que ninguém exercitava: o pedido nasceria, a solicitação continuaria PENDENTE
// e quem clicou em "Gerar pedido" na Reposição iria embora achando que o ciclo fechou.
test('(o) vinculo_solicitacao "falhou" avisa quem criou o pedido', async () => {
  api.post.mockImplementation(() => Promise.resolve({
    data: { id: 640, numero: 'PC-2026-640', vinculo_solicitacao: 'falhou' },
  }));
  await renderizarEm('/compras/pedidos/novo?solicitacao=641&material=907&quantidade=16');
  await selecionar(porTestId('pedido-fornecedor'), '312');
  digitar(porTestId('valor-item-907'), '25');
  await esperarEfeitos();
  await submeter();

  expect(chamadasPost()).toHaveLength(1);
  expect(chamadasPost()[0][1].solicitacao_id).toBe(641);
  expect(toast.success).toHaveBeenCalledWith('Pedido PC-2026-640 criado');
  expect(toast.warn).toHaveBeenCalledWith('O pedido foi criado, mas a solicitação não pôde ser vinculada.');
});

// ── (k3) ONDA DE CORREÇÃO, F6 — a importação 100% recusada era anunciada em VERDE ─────────────
//
// A porta responde **201 com sucesso parcial** por contrato, inclusive com `pedidos: []`. A tela
// mostrava `toast.success('0 pedido(s) importado(s)')`. E o caso é o mais provável de todos: uma
// planilha com a coluna `Material`/`Item`/`Cód.` recusa TODAS as linhas — inclusive o export da
// própria aba Pedidos, que até este fix-round não tinha coluna de código (cenário (p) abaixo).
test('(k3) 201 com pedidos: [] mostra toast de ERRO e o motivo no DOM, nao sucesso verde', async () => {
  const MOTIVO = 'linha sem código de material';
  api.post.mockImplementation((url) => {
    if (url !== '/compras/pedidos/importar') return Promise.reject(new Error(`POST inesperado: ${url}`));
    return Promise.resolve({
      data: { pedidos: [], itens: 0, ignorados: [{ linha: 1, motivo: MOTIVO }, { linha: 2, motivo: MOTIVO }] },
    });
  });
  await renderizarEm('/compras/pedidos/novo');
  await importarPlanilha([['material', 'quantidade'], ['Chapa', 2]]);

  expect(chamadasImportar()).toHaveLength(1);
  // ⚠️ AS ASSERÇÕES QUE MEDEM O DANO: o toast é de ERRO e o de sucesso NÃO foi chamado.
  expect(toast.error).toHaveBeenCalledWith(LITERAL_NADA_IMPORTADO);
  expect(toast.success).not.toHaveBeenCalled();
  // E o motivo chega ao DOM, que é o que diz ao operador o que arrumar na planilha.
  const resultado = porTestId('resultado-importacao').textContent;
  expect(resultado).toContain(LITERAL_NADA_IMPORTADO);
  expect(resultado).toContain(`Linha 1: ${MOTIVO}`);
  expect(resultado).not.toContain('Importação concluída');

  // METADE POSITIVA no mesmo cenário: com UM pedido criado, o mesmo gesto volta a ser sucesso
  // (senão "sempre erro" passaria nas asserções acima).
  api.post.mockImplementation(() => Promise.resolve({
    data: { pedidos: [{ id: 700, numero: 'PC-2026-700', itens: 1 }], itens: 1, ignorados: [] },
  }));
  await importarPlanilha([['codigo', 'quantidade'], ['ALM-0907', 2]]);
  expect(toast.success).toHaveBeenCalledWith('1 pedido(s) importado(s)');
  expect(porTestId('resultado-importacao').textContent).toContain('Importação concluída');
});

// ── (k4) o teto da lista de recusas: 5.000 `<li>` travavam a aba ──────────────────────────────
test('(k4) 25 ignorados renderizam 20 <li> e a linha "e mais 5"', async () => {
  const ignorados = Array.from({ length: 25 }, (_, i) => ({
    linha: i + 1, motivo: 'linha sem código de material',
  }));
  api.post.mockImplementation(() => Promise.resolve({
    data: {
      pedidos: [{ id: 701, numero: 'PC-2026-701', itens: 1 }],
      itens: 1,
      ignorados,
      avisos: [{ linha: 3, campo: 'previsao_entrega', motivo: 'previsão de entrega não reconhecida (use AAAA-MM-DD ou DD/MM/AAAA)' }],
    },
  }));
  await renderizarEm('/compras/pedidos/novo');
  await importarPlanilha([['codigo', 'quantidade'], ['ALM-0907', 2]]);

  // ⚠️ A CONTAGEM É NA LISTA DE IGNORADOS (`data-testid` próprio): um `querySelectorAll('li')` no
  // container inteiro pegaria também o `<li>` do pedido criado e mediria 21 sem que nada estivesse
  // errado.
  const itensLista = porTestId('ignorados-lista').querySelectorAll('li');
  expect(itensLista).toHaveLength(20);
  expect(porTestId('ignorados-restantes').textContent).toContain('e mais 5');
  // A primeira e a vigésima estão lá, a vigésima primeira não — o corte é no fim, não no meio.
  expect(itensLista[0].textContent).toContain('Linha 1:');
  expect(itensLista[19].textContent).toContain('Linha 20:');
  expect(porTestId('resultado-importacao').textContent).not.toContain('Linha 21:');

  // E os `avisos` do F3 são OUTRA lista, com o nome do campo: a linha do aviso ENTROU no pedido.
  const avisos = porTestId('avisos-lista').querySelectorAll('li');
  expect(avisos).toHaveLength(1);
  expect(avisos[0].textContent).toContain('Linha 3 (previsao_entrega)');
  expect(avisos[0].textContent).toContain('previsão de entrega não reconhecida');
});

// ── (p) F6 — o Excel exportado da aba Pedidos tem de ser REIMPORTÁVEL ─────────────────────────
//
// O export era uma linha por PEDIDO e **sem coluna de código**: reimportar o próprio arquivo do CRM
// recusava todas as linhas com `linha sem código de material` (e, antes do F6, num toast verde).
test('(p) exportar a aba Pedidos gera UMA LINHA POR ITEM, com Codigo, Quantidade e Valor Unitario', async () => {
  pedidosDoBanco = [PEDIDO_418_LISTA];
  await renderizarEm('/compras/pedidos');

  await clicar(botaoPorTexto('Exportar Excel'));

  expect(exportToExcel).toHaveBeenCalledTimes(1);
  const [linhas, arquivo] = exportToExcel.mock.calls[0];
  expect(arquivo).toBe('pedidos_compra');
  // Uma linha por ITEM do pedido — os itens vieram do `GET /compras/pedidos/418`.
  expect(chamadasDetalhe(418)).toHaveLength(1);
  expect(linhas).toHaveLength(1);
  // ⚠️ AS ASSERÇÕES QUE MEDEM O DANO: as colunas que a importação LÊ.
  expect(linhas[0]['Código']).toBe('ALM-0907');
  expect(linhas[0]['Número']).toBe('PC-2026-418');
  expect(linhas[0]['Fornecedor']).toBe('Aços Vale Ltda');
  // Número, e não texto formatado: `R$ 35,00` viraria 0 na reimportação, em silêncio, e o pedido
  // reimportado nasceria sem preço (desfazendo o custo médio do recebimento na Etapa 37).
  expect(linhas[0]['Quantidade']).toBe(9);
  expect(linhas[0]['Valor Unitário']).toBe(35);
  expect(typeof linhas[0]['Valor Unitário']).toBe('number');
  // E as colunas de leitura humana continuam lá.
  expect(linhas[0]['Status']).toBe('aprovado');
  expect(String(linhas[0]['Valor Total'])).toContain('315');
});

test('(o2) vinculo_solicitacao "ok" NAO avisa nada (metade positiva do (o))', async () => {
  api.post.mockImplementation(() => Promise.resolve({
    data: { id: 640, numero: 'PC-2026-640', vinculo_solicitacao: 'ok' },
  }));
  await renderizarEm('/compras/pedidos/novo?solicitacao=641&material=907&quantidade=16');
  await selecionar(porTestId('pedido-fornecedor'), '312');
  digitar(porTestId('valor-item-907'), '25');
  await esperarEfeitos();
  await submeter();

  expect(chamadasPost()).toHaveLength(1);
  expect(toast.success).toHaveBeenCalledWith('Pedido PC-2026-640 criado');
  expect(toast.warn).not.toHaveBeenCalled();
});

// ── (q) RN-D03 o formulario nasce com a data LOCAL, nao com a de amanha ───────────────────────
//
// Etapa 39, Task 2 (defeito ESCAPADO da Etapa 38). 23:30 em -03 e 02:30 do DIA SEGUINTE em UTC:
// `new Date().toISOString().slice(0,10)` (a implementacao antiga de `hojeISO`) devolve 2026-09-17
// e o comprador que abre o formulario depois das 21h ja nasce com a data errada — e grava com ela.
//
// ⚠️ POR QUE NAO `jest.useFakeTimers().setSystemTime(...)` (o que o design §7.4 mandava): o Jest
// desta base e 27.5.1, onde os timers modernos fakeiam TAMBEM o `setTimeout` — e `esperarEfeitos()`
// espera um `setTimeout(0)`, que nunca resolveria (o `doNotFake` so existe do Jest 28 em diante);
// o cenario morreria por timeout dos 5s em vez de medir a data. Trocar `global.Date` por uma
// subclasse fixa o relogio sem tocar nos timers, e o construtor continua sendo o LOCAL que a
// RN-D03 exige. Restaurado no `finally` para nao vazar para os outros cenarios.
test('(q) o formulario nasce com a data LOCAL, nao com a de amanha', async () => {
  const DateReal = global.Date;
  const INSTANTE = new DateReal(2026, 8, 16, 23, 30); // construtor LOCAL, de proposito
  // CONTROLE POSITIVO: prova que o fuso esta aplicado E que a implementacao antiga erraria.
  expect(INSTANTE.toISOString().slice(0, 10)).toBe('2026-09-17');
  class DataFixa extends DateReal {
    constructor(...args) { super(...(args.length ? args : [INSTANTE.getTime()])); }
    static now() { return INSTANTE.getTime(); }
  }
  global.Date = DataFixa;
  try {
    await renderizarEm('/compras/pedidos/novo');
    expect(porTestId('pedido-data').value).toBe('2026-09-16');
  } finally {
    global.Date = DateReal;
  }
});

// ── (r) F4 pedido JA RECEBIDO: a faixa, os campos travados e o PATCH de status ────────────────
//
// Etapa 39, onda de correcao F4 (achado I1 da revisao de regra de negocio). ATE AQUI a tela nao
// sabia que o pedido tinha recebimento: o comprador preenchia o formulario inteiro, clicava em
// "Salvar pedido" e so entao levava o 400 do cenario (g2) — e era justamente o pedido preso no
// beco da RN-D12 (recebido com atraso, "Atrasado" para sempre) cujo conserto a tela nao deixava
// completar. Agora o `GET /:id` devolve `teve_recebimento` e o mesmo botao vira `PATCH .../status`.
test('(r) com teve_recebimento 1 a tela mostra a faixa, trava os campos e salva por PATCH de status', async () => {
  detalhe418 = PEDIDO_418_RECEBIDO;
  await renderizarEm('/compras/pedidos/editar/418');

  // A FAIXA, literal exata e em `role="alert"` (o comprador precisa saber POR QUE travou).
  expect(alertas()).toContain(LITERAL_SO_STATUS);

  // OS CAMPOS TRAVADOS — fornecedor, as duas datas e os itens.
  expect(porTestId('pedido-fornecedor').disabled).toBe(true);
  expect(porTestId('pedido-data').disabled).toBe(true);
  expect(porTestId('pedido-previsao').disabled).toBe(true);
  expect(porTestId('pedido-observacoes').disabled).toBe(true);
  expect(porTestId('qtd-item-907').disabled).toBe(true);
  expect(porTestId('valor-item-907').disabled).toBe(true);
  expect(porTestId('remover-item-907').disabled).toBe(true);
  expect(porTestId('busca-material').disabled).toBe(true);
  // ⚠️ E O STATUS **NAO** trava: e o unico campo que a porta nova escreve, e travar tudo deixaria
  // o pedido preso no beco com uma faixa explicando que ele esta preso.
  expect(porTestId('pedido-status').disabled).toBe(false);

  await selecionar(porTestId('pedido-status'), 'recebido');
  await submeter();

  // URL e corpo EXATOS: um `PUT` com corpo de pedido inteiro nesta porta seria a mentira que o
  // `strip` do Zod conserta do lado do servidor.
  expect(chamadasPatchStatus(418)).toHaveLength(1);
  expect(chamadasPatchStatus(418)[0][1]).toEqual({ status: 'recebido' });
  // A METADE QUE MEDE O DANO: o `PUT` NAO pode ser chamado. Ele faz DELETE+INSERT das linhas no
  // servidor e zeraria `quantidade_recebida` — o operador receberia o mesmo material duas vezes.
  expect(chamadasPut(418)).toHaveLength(0);
  expect(toast.success).toHaveBeenCalledWith(LITERAL_STATUS_ATUALIZADO);
});

// ── (r2) F4 a metade negativa: com teve_recebimento 0 nada muda ───────────────────────────────
//
// Sem este cenario, um `soStatus` que nascesse `true` (ou um `Boolean(p.teve_recebimento)` sobre
// um contrato que devolvesse a string '0') travaria o formulario de TODO pedido e o (r) continuaria
// verde — o defeito mais caro possivel, porque a tela pararia de salvar pedido nenhum.
test('(r2) com teve_recebimento 0 nao ha faixa, os campos ficam livres e o salvar continua sendo PUT', async () => {
  await renderizarEm('/compras/pedidos/editar/418');

  expect(texto()).not.toContain(LITERAL_SO_STATUS);
  expect(porTestId('pedido-fornecedor').disabled).toBe(false);
  expect(porTestId('pedido-previsao').disabled).toBe(false);
  expect(porTestId('qtd-item-907').disabled).toBe(false);

  await submeter();

  expect(chamadasPut(418)).toHaveLength(1);
  expect(api.patch.mock.calls).toHaveLength(0);
  expect(toast.success).toHaveBeenCalledWith('Pedido de compra atualizado');
});

// ── (r3) F4 o erro do PATCH chega ao DOM, como o do PUT ──────────────────────────────────────
test('(r3) a recusa do PATCH aparece em role=alert e o formulario fica de pe', async () => {
  detalhe418 = PEDIDO_418_RECEBIDO;
  const LITERAL_400_STATUS = 'status do pedido inválido (use pendente, aprovado, rejeitado, em_analise, enviado, recebido ou cancelado)';
  api.patch.mockImplementation(() => Promise.reject({
    response: { status: 400, data: { error: LITERAL_400_STATUS } },
  }));
  await renderizarEm('/compras/pedidos/editar/418');
  await submeter();

  expect(chamadasPatchStatus(418)).toHaveLength(1);
  expect(alertas()).toContain(LITERAL_400_STATUS);
  expect(texto()).toContain('Editar pedido de compra');
  expect(toast.success).not.toHaveBeenCalled();
});

/**
 * ═══ Etapa 39 — RN-39.07: o formulario ganha o DOCUMENTO da Etapa 32 ═══════════════════════════
 *
 * No merge de 2026-10-07 o pedido da branch venceu o da Etapa 32 — e com ele sumiram as condicoes
 * comerciais, o IPI por item, NCM/peso/observacao do item e a conta do servidor. Esta describe porta
 * o documento SOBRE o formulario atual: busca de material, importacao por planilha, 7 status, numero
 * gerado e "so status" apos recebimento continuam (cenarios (a)…(r3) acima seguem valendo).
 *
 * Tres regras que estes cenarios medem e que uma leitura do JSX nao mede:
 *  - O payload leva o VALOR da opcao, nunca o rotulo do botao ((39a): o frete grava a string da
 *    SEFAZ, o chip mostra "FOB — nós pagamos").
 *  - O que se digita em "Outro" e o que viaja ((39b)) — e o servidor o devolve como botao no
 *    proximo pedido (RN-39.06), por isso nao existe cadastro de condicao.
 *  - O NAVEGADOR NAO SOMA ((39d)): os seis totais sao os da resposta de `/calcular`, chamado com
 *    debounce de 300 ms. O mock devolve totais IMPOSSIVEIS (R$ 999,99 para 7 × 25) e o DOM tem de
 *    mostra-los — um formulario que somasse localmente passaria em (f) e cairia aqui.
 *
 * A importacao por planilha NAO ganha cenario novo: (k)/(k2)/(k3)/(k4) ja a medem, e o mock deles
 * REJEITA todo POST que nao seja `/importar` — inclusive `/calcular` — entao eles tambem provam que
 * a tela fica de pe sem a conta do servidor.
 *
 * Divergencia declarada: `GET /compras/materiais` devolve so `id, codigo, descricao, unidade`
 * (medido em `pedidoCompraService.buscarMateriais`), entao NCM e peso nascem VAZIOS na criacao
 * (`''` = "o do material", RN-39.01) e so na edicao vem preenchidos, do `GET /:id`.
 */
describe('RN-39', () => {
  const itemDe = (payload, materialId) => payload.itens.find((it) => it.material_id === materialId);

  // ── (39a) as opcoes viram chips; o payload leva o VALOR, nao o rotulo ──────────────────────
  test('(39a) as opcoes carregadas viram chips, a escolha e unica e o payload leva o VALOR', async () => {
    await renderizarEm('/compras/pedidos/novo');

    expect(chamadasOpcoes()).toHaveLength(1);
    expect(texto()).toContain('3. Condições');
    // O rotulo CURTO do frete esta no botao; o valor longo da SEFAZ nao aparece na tela.
    expect(porTestId(`chip-frete_modalidade-${FRETE_FOB}`).textContent).toContain('FOB — nós pagamos');
    expect(texto()).not.toContain(FRETE_FOB);
    // A ajuda que explica por que nao existe cadastro de condicao.
    expect(texto()).toContain('vira botão no próximo pedido');

    await clicar(porTestId('chip-condicao_pagamento-À vista'));
    await clicar(porTestId('chip-condicao_pagamento-Boleto'));
    // Escolha UNICA: o segundo clique tira o primeiro.
    expect(porTestId('chip-condicao_pagamento-Boleto').getAttribute('aria-pressed')).toBe('true');
    expect(porTestId('chip-condicao_pagamento-À vista').getAttribute('aria-pressed')).toBe('false');
    await clicar(porTestId(`chip-frete_modalidade-${FRETE_FOB}`));
    await clicar(porTestId('chip-via_transporte-Rodoviário'));
    await clicar(porTestId('chip-transportadora-Transportes Vale'));

    await preencherPedidoValido();
    await submeter();

    expect(chamadasPost()).toHaveLength(1);
    const payload = chamadasPost()[0][1];
    expect(payload.condicao_pagamento).toBe('Boleto');
    expect(payload.frete_modalidade).toBe(FRETE_FOB);
    expect(payload.via_transporte).toBe('Rodoviário');
    expect(payload.transportadora).toBe('Transportes Vale');
  });

  // ── (39b) "Outro" vira o valor digitado ───────────────────────────────────────────────────
  test('(39b) "Outro" abre um campo e o que for digitado e o que viaja no payload', async () => {
    await renderizarEm('/compras/pedidos/novo');

    // Antes do clique o campo nao existe: a tela e de botao, o campo e a excecao.
    expect(porTestId('outro-condicao_pagamento')).toBeNull();
    await clicar(porTestId('chip-condicao_pagamento-outro'));
    digitar(porTestId('outro-condicao_pagamento'), '45 D.D.L.');
    await esperarEfeitos();
    // O proprio botao "Outro" passa a mostrar o valor, pressionado.
    expect(porTestId('chip-condicao_pagamento-outro').textContent).toContain('45 D.D.L.');
    expect(porTestId('chip-condicao_pagamento-outro').getAttribute('aria-pressed')).toBe('true');

    await clicar(porTestId('chip-transportadora-outro'));
    digitar(porTestId('outro-transportadora'), 'Jamef');
    // `tabelas_preco` veio VAZIA do servidor: so o "Outro" existe, e ele tem de bastar.
    await clicar(porTestId('chip-tabela_preco-outro'));
    digitar(porTestId('outro-tabela_preco'), 'Tabela 2026');
    digitar(porTestId('pedido-transportadora-telefone'), '54999998888');
    digitar(porTestId('pedido-contato'), 'Sr. Paulo');
    // Entregar em: o endereco da EMPRESA vem de `opcoes.empresa`; cobrar em: outro endereco.
    await clicar(porTestId('chip-local_entrega-empresa'));
    await clicar(porTestId('chip-local_cobranca-outro'));
    digitar(porTestId('outro-local_cobranca'), 'Av. Fiscal, 9');
    await esperarEfeitos();

    await preencherPedidoValido();
    await submeter();

    expect(chamadasPost()).toHaveLength(1);
    const payload = chamadasPost()[0][1];
    expect(payload.condicao_pagamento).toBe('45 D.D.L.');
    expect(payload.transportadora).toBe('Jamef');
    expect(payload.tabela_preco).toBe('Tabela 2026');
    // A mascara e a mesma dos demais telefones do sistema (`utils/telefone`).
    expect(payload.transportadora_telefone).toBe('(54) 99999-8888');
    expect(payload.contato).toBe('Sr. Paulo');
    expect(payload.local_entrega).toBe(ENDERECO_EMPRESA);
    expect(payload.local_cobranca).toBe('Av. Fiscal, 9');
  });

  // ── (39c) IPI por item: padrao 0, chip, "Outro"; NCM/peso/observacao ──────────────────────
  test('(39c) IPI do item por chip e por "Outro", e NCM/peso/observacao do item viajam', async () => {
    await renderizarEm('/compras/pedidos/novo');
    await selecionar(porTestId('pedido-fornecedor'), '312');
    digitar(porTestId('busca-material'), 'CHAPA');
    await clicar(porTestId('botao-buscar-material'));
    await clicar(porTestId('adicionar-material-907'));
    await clicar(porTestId('adicionar-material-901'));
    digitar(porTestId('qtd-item-907'), '4');
    digitar(porTestId('valor-item-907'), '25');
    digitar(porTestId('qtd-item-901'), '2');
    digitar(porTestId('valor-item-901'), '10');
    await esperarEfeitos();

    // O painel de detalhes do item nasce FECHADO (a linha e compacta: 50 itens cabem na tela).
    expect(porTestId('ncm-item-907')).toBeNull();
    await clicar(porTestId('detalhes-item-907'));
    await clicar(porTestId('chip-ipi-907-10'));
    expect(porTestId('chip-ipi-907-10').getAttribute('aria-pressed')).toBe('true');
    // NCM e peso nascem VAZIOS na criacao (a busca de material nao os traz) — e sao editaveis.
    expect(porTestId('ncm-item-907').value).toBe('');
    expect(porTestId('peso-item-907').value).toBe('');
    digitar(porTestId('ncm-item-907'), '7208.51.00');
    digitar(porTestId('peso-item-907'), '2.5');
    digitar(porTestId('obs-item-907'), 'Pintura epóxi');
    await esperarEfeitos();

    // O 901: IPI fora da lista, por "Outro".
    await clicar(porTestId('detalhes-item-901'));
    await clicar(porTestId('chip-ipi-901-outro'));
    digitar(porTestId('outro-ipi-901'), '4.5');
    await esperarEfeitos();
    // A linha fechada DIZ o IPI do item, para um entre cinquenta nao passar despercebido.
    expect(porTestId('detalhes-item-901').textContent).toContain('4,5%');

    await submeter();

    expect(chamadasPost()).toHaveLength(1);
    const payload = chamadasPost()[0][1];
    const i907 = itemDe(payload, 907);
    const i901 = itemDe(payload, 901);
    expect(i907.ipi_percentual).toBe(10);
    expect(typeof i907.ipi_percentual).toBe('number');
    expect(i907.ncm).toBe('7208.51.00');
    expect(i907.peso_unitario).toBe(2.5);
    expect(typeof i907.peso_unitario).toBe('number');
    expect(i907.observacao).toBe('Pintura epóxi');
    expect(i901.ipi_percentual).toBe(4.5);
    // `''` em ncm/peso = "o do material" (RN-39.01): a tela NAO manda 0 nem null, que o servidor
    // trataria como valor preenchido.
    expect(i901.ncm).toBe('');
    expect(i901.peso_unitario).toBe('');
    expect(i901.observacao).toBe('');
    // E `item_numero` e do servidor: nunca sai do navegador.
    expect('item_numero' in i907).toBe(false);
  });

  // ── (39c2) o IPI PADRAO do pedido aplica a todos; o item pode divergir depois ──────────────
  test('(39c2) o IPI padrao do pedido vale para todos os itens, e um item pode divergir', async () => {
    await renderizarEm('/compras/pedidos/novo');
    await selecionar(porTestId('pedido-fornecedor'), '312');
    digitar(porTestId('busca-material'), 'CHAPA');
    await clicar(porTestId('botao-buscar-material'));
    await clicar(porTestId('adicionar-material-907'));
    await clicar(porTestId('chip-ipi_padrao-5'));
    // Item adicionado DEPOIS do padrao nasce com ele.
    await clicar(porTestId('adicionar-material-901'));
    digitar(porTestId('qtd-item-907'), '1');
    digitar(porTestId('valor-item-907'), '1');
    digitar(porTestId('qtd-item-901'), '1');
    digitar(porTestId('valor-item-901'), '1');
    await clicar(porTestId('detalhes-item-907'));
    await clicar(porTestId('chip-ipi-907-15'));
    await esperarEfeitos();

    await submeter();
    const payload = chamadasPost()[0][1];
    expect(itemDe(payload, 907).ipi_percentual).toBe(15);
    expect(itemDe(payload, 901).ipi_percentual).toBe(5);
  });

  // ── (39d) /calcular com debounce de 300 ms; o navegador NAO soma ──────────────────────────
  test('(39d) /calcular e chamado 300 ms depois da ultima tecla e os seis totais sao os da resposta', async () => {
    const IMPOSSIVEL = {
      itens: [{ material_id: 907, valor_linha: 123.45, ipi_linha: 6.78 }],
      totais: {
        total_produtos: 777.77, total_ipi: 11.11, total_icms_st: 22.22,
        total_desconto: 33.33, valor_frete: 44.44, total_geral: 999.99,
      },
    };
    api.post.mockImplementation((url) => (url === '/compras/pedidos/calcular'
      ? Promise.resolve({ data: IMPOSSIVEL })
      : Promise.resolve({ data: { id: 640, numero: 'PC-2026-640' } })));
    await renderizarEm('/compras/pedidos/novo');
    // Sem item nenhum nao ha o que calcular: nenhuma viagem ao servidor.
    expect(chamadasCalcular()).toHaveLength(0);
    await preencherPedidoValido();
    await esperarCalculo();
    const antes = chamadasCalcular().length;
    expect(antes).toBeGreaterThanOrEqual(1);

    // Daqui em diante o relogio e FALSO (instalado depois da montagem: `esperarEfeitos` espera
    // um `setTimeout(0)` real e nunca resolveria com os timers do Jest 27 — ver cenario (q)).
    jest.useFakeTimers();
    try {
      digitar(porTestId('qtd-item-907'), '7');
      digitar(porTestId('qtd-item-907'), '70');
      digitar(porTestId('qtd-item-907'), '7');
      await act(async () => { jest.advanceTimersByTime(299); });
      // 299 ms depois da ultima tecla: NADA. Tres teclas, zero chamadas — e o debounce.
      expect(chamadasCalcular()).toHaveLength(antes);
      await act(async () => { jest.advanceTimersByTime(1); });
      expect(chamadasCalcular()).toHaveLength(antes + 1);
      // O corpo EXATO: os itens com IPI e os tres encargos, numeros (o schema e tolerante, mas a
      // tela manda o que o servidor grava).
      expect(chamadasCalcular()[antes][1]).toEqual({
        itens: [{ material_id: 907, quantidade: 7, valor_unitario: 25, ipi_percentual: 0 }],
        total_icms_st: 0, valor_frete: 0, total_desconto: 0,
      });
      await act(async () => { await Promise.resolve(); });

      // ⚠️ AS ASSERCOES QUE MEDEM O DANO: 7 × 25 = 175, e o DOM mostra 777,77 / 999,99 — os
      // numeros da RESPOSTA. Um formulario que somasse localmente mostraria 175,00 aqui.
      expect(textoDe('total-produtos')).toContain('R$ 777,77');
      expect(textoDe('total-ipi')).toContain('R$ 11,11');
      expect(textoDe('total-icms-st')).toContain('R$ 22,22');
      expect(textoDe('total-desconto')).toContain('R$ 33,33');
      expect(textoDe('total-frete')).toContain('R$ 44,44');
      expect(textoDe('total-geral')).toContain('R$ 999,99');
      expect(texto()).not.toContain('R$ 175,00');
      // O subtotal da LINHA tambem e o do servidor (`valor_linha`), nao qtd × unitario.
      expect(textoDe('subtotal-item-907')).toContain('R$ 123,45');

      // Os encargos tambem disparam a conta, e viajam como NUMERO.
      digitar(porTestId('pedido-frete'), '50');
      await act(async () => { jest.advanceTimersByTime(300); });
      expect(chamadasCalcular()).toHaveLength(antes + 2);
      expect(chamadasCalcular()[antes + 1][1].valor_frete).toBe(50);
    } finally {
      jest.useRealTimers();
    }
  });

  // ── (39e) o POST completo ─────────────────────────────────────────────────────────────────
  test('(39e) o POST leva o cabecalho e os itens do documento, sem item_numero e sem valor_total', async () => {
    await renderizarEm('/compras/pedidos/novo');
    await preencherPedidoValido();
    await clicar(porTestId('chip-condicao_pagamento-Boleto'));
    digitar(porTestId('pedido-frete'), '80');
    digitar(porTestId('pedido-desconto'), '36.5');
    digitar(porTestId('pedido-icms-st'), '10');
    await esperarEfeitos();
    await submeter();

    expect(chamadasPost()).toHaveLength(1);
    const payload = chamadasPost()[0][1];
    expect(payload).toEqual({
      fornecedor_id: 312,
      data_pedido: '2026-09-16',
      previsao_entrega: '2026-09-30',
      status: 'pendente',
      observacoes: '',
      condicao_pagamento: 'Boleto',
      frete_modalidade: '',
      transportadora: '',
      transportadora_telefone: '',
      via_transporte: '',
      tabela_preco: '',
      contato: '',
      local_entrega: '',
      local_cobranca: '',
      total_icms_st: 10,
      valor_frete: 80,
      total_desconto: 36.5,
      itens: [{
        material_id: 907, quantidade: 4, valor_unitario: 25,
        ipi_percentual: 0, ncm: '', peso_unitario: '', observacao: '',
      }],
    });
    expect('valor_total' in payload).toBe(false);
    expect('numero' in payload).toBe(false);
    expect(typeof payload.valor_frete).toBe('number');
    expect(typeof payload.total_desconto).toBe('number');
    expect(typeof payload.total_icms_st).toBe('number');
  });

  // ── (39f) edicao: o que esta gravado aparece, e os totais do GET nao sao recalculados a toa ─
  test('(39f) a edicao carrega condicoes, IPI/NCM/peso/observacao e os totais do GET, e o PUT os devolve', async () => {
    detalhe418 = PEDIDO_418_DOCUMENTO;
    await renderizarEm('/compras/pedidos/editar/418');

    expect(porTestId('chip-condicao_pagamento-Boleto').getAttribute('aria-pressed')).toBe('true');
    expect(porTestId(`chip-frete_modalidade-${FRETE_FOB}`).getAttribute('aria-pressed')).toBe('true');
    expect(porTestId('chip-via_transporte-Rodoviário').getAttribute('aria-pressed')).toBe('true');
    expect(porTestId('chip-transportadora-Transportes Vale').getAttribute('aria-pressed')).toBe('true');
    // 'Tabela 2026' nao esta na lista (veio vazia): e o "Outro" que a mostra, pressionado.
    expect(porTestId('chip-tabela_preco-outro').getAttribute('aria-pressed')).toBe('true');
    expect(porTestId('outro-tabela_preco').value).toBe('Tabela 2026');
    expect(porTestId('pedido-transportadora-telefone').value).toBe('(54) 3222-1000');
    expect(porTestId('pedido-contato').value).toBe('Sr. Paulo');
    expect(porTestId('chip-local_entrega-empresa').getAttribute('aria-pressed')).toBe('true');
    expect(porTestId('outro-local_cobranca').value).toBe('Av. Fiscal, 9');
    expect(porTestId('pedido-frete').value).toBe('80');
    expect(porTestId('pedido-desconto').value).toBe('36.5');
    expect(porTestId('pedido-icms-st').value).toBe('10');

    // Os seis totais sao os do GET, mostrados de imediato — e SEM uma viagem ao `/calcular`
    // para refazer o que o servidor acabou de devolver (mesmo depois do prazo do debounce).
    expect(textoDe('total-geral')).toContain('R$ 400,00');
    expect(textoDe('total-ipi')).toContain('R$ 31,50');
    expect(textoDe('subtotal-item-907')).toContain('R$ 315,00');
    await esperarCalculo();
    expect(chamadasCalcular()).toHaveLength(0);

    // O item: IPI na linha fechada; NCM/peso/observacao no painel.
    expect(porTestId('detalhes-item-907').textContent).toContain('10%');
    await clicar(porTestId('detalhes-item-907'));
    expect(porTestId('chip-ipi-907-10').getAttribute('aria-pressed')).toBe('true');
    expect(porTestId('ncm-item-907').value).toBe('7208.51.00');
    expect(porTestId('peso-item-907').value).toBe('2.5');
    expect(porTestId('obs-item-907').value).toBe('Pintura epóxi');

    // Metade positiva: MUDAR algo volta a chamar a conta.
    digitar(porTestId('qtd-item-907'), '10');
    await esperarCalculo();
    expect(chamadasCalcular()).toHaveLength(1);
    expect(textoDe('total-produtos')).toContain('R$ 350,00');

    await submeter();
    expect(chamadasPut(418)).toHaveLength(1);
    expect(chamadasPut(418)[0][1]).toEqual({
      fornecedor_id: 312,
      data_pedido: '2026-09-10',
      previsao_entrega: '2026-09-25',
      status: 'aprovado',
      observacoes: 'Entregar no portão 2',
      condicao_pagamento: 'Boleto',
      frete_modalidade: FRETE_FOB,
      transportadora: 'Transportes Vale',
      transportadora_telefone: '(54) 3222-1000',
      via_transporte: 'Rodoviário',
      tabela_preco: 'Tabela 2026',
      contato: 'Sr. Paulo',
      local_entrega: ENDERECO_EMPRESA,
      local_cobranca: 'Av. Fiscal, 9',
      total_icms_st: 10,
      valor_frete: 80,
      total_desconto: 36.5,
      itens: [{
        material_id: 907, quantidade: 10, valor_unitario: 35,
        ipi_percentual: 10, ncm: '7208.51.00', peso_unitario: 2.5, observacao: 'Pintura epóxi',
      }],
    });
  });

  // ── (39g) pedido ja recebido: o documento inteiro trava, e o salvar continua PATCH de status ─
  test('(39g) com teve_recebimento 1 as condicoes, o IPI e os encargos travam e o salvar continua so status', async () => {
    detalhe418 = { ...PEDIDO_418_DOCUMENTO, teve_recebimento: 1 };
    await renderizarEm('/compras/pedidos/editar/418');

    expect(alertas()).toContain(LITERAL_SO_STATUS);
    expect(porTestId('chip-condicao_pagamento-Boleto').disabled).toBe(true);
    expect(porTestId('chip-condicao_pagamento-outro').disabled).toBe(true);
    expect(porTestId('chip-ipi_padrao-5').disabled).toBe(true);
    expect(porTestId('pedido-frete').disabled).toBe(true);
    expect(porTestId('pedido-desconto').disabled).toBe(true);
    expect(porTestId('pedido-icms-st').disabled).toBe(true);
    expect(porTestId('pedido-contato').disabled).toBe(true);
    await clicar(porTestId('detalhes-item-907'));
    expect(porTestId('chip-ipi-907-10').disabled).toBe(true);
    expect(porTestId('ncm-item-907').disabled).toBe(true);
    expect(porTestId('obs-item-907').disabled).toBe(true);
    // O que esta gravado continua VISIVEL (travado nao e escondido).
    expect(textoDe('total-geral')).toContain('R$ 400,00');

    await selecionar(porTestId('pedido-status'), 'recebido');
    await submeter();
    expect(chamadasPatchStatus(418)).toHaveLength(1);
    expect(chamadasPatchStatus(418)[0][1]).toEqual({ status: 'recebido' });
    expect(chamadasPut(418)).toHaveLength(0);
  });
});

// ═══ Etapa 78 (RN-78.06) — o botao "Documento (PDF)" no rodape do formulario ════════════════
//
// O rodape `.header-actions` fica DENTRO do `<form>`: um `<button>` sem `type="button"` e um
// botao de submit, e o clique salvaria o pedido (PUT em edicao; PATCH de status no modo "so
// status"). E o que o (s) e o (s2) medem — a sabotagem util e tirar o `type`. Na criacao (sem
// `id`) nao ha documento a imprimir: o botao nao existe (s3).
describe('Etapa 78 — Documento (PDF) no formulario', () => {
  let cliquesNoLink;
  beforeEach(() => {
    window.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    window.URL.revokeObjectURL = jest.fn();
    cliquesNoLink = [];
    jest.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(function registrar() {
      cliquesNoLink.push(this.download);
    });
    const anterior = api.get.getMockImplementation();
    api.get.mockImplementation((url, opcoes) => (url === '/compras/pedidos/418/documento.pdf'
      ? Promise.resolve({ data: new Blob(['%PDF-1.4']), headers: {} })
      : anterior(url, opcoes)));
  });
  afterEach(() => { window.HTMLAnchorElement.prototype.click.mockRestore(); });

  const chamadasDocumento = () => api.get.mock.calls.filter(([url]) => url === '/compras/pedidos/418/documento.pdf');

  test('(s) em edicao o botao existe, e type="button", baixa por blob e NAO submete o pedido', async () => {
    await renderizarEm('/compras/pedidos/editar/418');
    const botao = botaoPorTexto('Documento (PDF)');
    expect(botao).toBeDefined();
    expect(botao.getAttribute('type')).toBe('button');
    expect(container.querySelector('form[data-testid="form-pedido-compra"]').contains(botao)).toBe(true);

    await clicar(botao);

    expect(chamadasDocumento()).toHaveLength(1);
    expect(chamadasDocumento()[0][1]).toEqual({ responseType: 'blob' });
    expect(cliquesNoLink).toEqual(['pedido-compra-PC-2026-418.pdf']); // fallback: o numero do form
    // A METADE QUE MEDE O DANO: nada foi salvo.
    expect(chamadasPut(418)).toHaveLength(0);
    expect(chamadasPost()).toHaveLength(0);
    expect(chamadasPatchStatus(418)).toHaveLength(0);
    expect(texto()).toContain('Editar pedido de compra'); // nao navegou
  });

  test('(s2) no modo "so status" o botao continua la e o clique nao dispara o PATCH', async () => {
    detalhe418 = PEDIDO_418_RECEBIDO;
    await renderizarEm('/compras/pedidos/editar/418');
    expect(alertas()).toContain(LITERAL_SO_STATUS); // ancora: e o modo so status
    const botao = botaoPorTexto('Documento (PDF)');
    expect(botao).toBeDefined();
    expect(botao.disabled).toBe(false);

    await clicar(botao);

    expect(chamadasDocumento()).toHaveLength(1);
    expect(chamadasPatchStatus(418)).toHaveLength(0);
    expect(chamadasPut(418)).toHaveLength(0);
  });

  test('(s3) na criacao (/novo) nao ha botao de documento', async () => {
    await renderizarEm('/compras/pedidos/novo');
    expect(texto()).toContain('Novo pedido de compra');
    expect(botaoPorTexto('Documento (PDF)')).toBeUndefined();
  });
});
