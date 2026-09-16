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

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
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
  itens: [{
    id: 4181, material_id: 907, codigo: 'ALM-0907', descricao: 'Chapa Aço 3mm',
    unidade: 'KG', quantidade: 9, valor_unitario: 35, quantidade_recebida: 0,
  }],
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

let container; let root; let pedidosDoBanco;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  pedidosDoBanco = [];
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
        ? Promise.resolve({ data: PEDIDO_418 })
        : Promise.reject(new Error(`Pedido ${id} fora da fixture`));
    }
    if (url === '/compras/materiais') return Promise.resolve({ data: MATERIAIS_CHAPA });
    return Promise.reject(new Error(`URL inesperada no teste: ${url}`));
  });
  api.post.mockImplementation(() => Promise.resolve({ data: { id: 640, numero: 'PC-2026-640' } }));
  api.put.mockImplementation(() => Promise.resolve({ data: { id: 418, numero: 'PC-2026-418' } }));
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

// NBSP → espaço: ver o cabeçalho. Toda asserção de literal passa por aqui.
const texto = () => container.textContent.replace(/ /g, ' ');
const porTestId = (id) => container.querySelector(`[data-testid="${id}"]`);
const alertas = () => [...container.querySelectorAll('[role="alert"]')]
  .map((el) => el.textContent.replace(/ /g, ' ')).join(' | ');
const chamadasPost = () => api.post.mock.calls.filter(([url]) => url === '/compras/pedidos');
const chamadasPut = (id) => api.put.mock.calls.filter(([url]) => url === `/compras/pedidos/${id}`);
const chamadasMateriais = () => api.get.mock.calls.filter(([url]) => url === '/compras/materiais');
const chamadasDetalhe = (id) => api.get.mock.calls.filter(([url]) => url === `/compras/pedidos/${id}`);
const chamadasLista = () => api.get.mock.calls.filter(([url]) => url === '/compras/pedidos');
const chamadasImportar = () => api.post.mock.calls.filter(([url]) => url === '/compras/pedidos/importar');
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
  expect(payload).toEqual({
    fornecedor_id: 312,
    data_pedido: '2026-09-16',
    previsao_entrega: '2026-09-30',
    status: 'pendente',
    observacoes: '',
    itens: [{ material_id: 907, quantidade: 4, valor_unitario: 25 }],
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
  expect(chamadasPut(418)[0][1]).toEqual({
    fornecedor_id: 312,
    data_pedido: '2026-09-10',
    previsao_entrega: '2026-09-25',
    status: 'aprovado',
    observacoes: 'Entregar no portão 2',
    itens: [{ material_id: 907, quantidade: 9, valor_unitario: 35 }],
  });
});

// ── (f) o total calculado ─────────────────────────────────────────────────────────────────────
test('(f) o total calculado aparece e acompanha a quantidade', async () => {
  await renderizarEm('/compras/pedidos/novo');
  await preencherPedidoValido();

  expect(texto()).toContain('Total: R$ 100,00');

  // Metade positiva: mudar a quantidade muda o total (um total hard-coded passaria na primeira).
  digitar(porTestId('qtd-item-907'), '5');
  await esperarEfeitos();
  expect(texto()).toContain('Total: R$ 125,00');
  expect(texto()).not.toContain('Total: R$ 100,00');
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
  expect(chamadasPost()[0][1].itens).toEqual([{ material_id: 907, quantidade: 6, valor_unitario: 25 }]);
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
