/**
 * Etapa 34, Task 6 — o plug do `AnexosDocumento` no painel de detalhe do Recebimento de NF.
 *
 * Esta tela tem 799 linhas e **nunca teve arquivo de teste** (varredura do repositório inteiro
 * confirma). Então esta suíte não é só a guarda do bloco de anexos: ela é o primeiro arnês da
 * tela, e por isso ancora também a lista e a abertura do painel — sem isso, uma asserção de
 * anexos verde não distingue "o bloco está no lugar certo" de "a tela nem montou".
 *
 * Por que o fallback do mock REJEITA (e não resolve com `{ data: [] }`):
 * um fallback que resolve é exactamente o que deixaria esta etapa cega. Se amanhã o componente
 * passar a consultar uma rota nova (ou se uma URL do mock for escrita errada), o fallback que
 * resolve devolve lista vazia em silêncio e a suíte fica verde provando nada. Aqui a URL
 * inesperada estoura — e os `catch` da tela, que engolem a rejeição, deixam o sintoma visível
 * pelas CONTAGENS abaixo, não pela mensagem de erro.
 *
 * Por que igualdade + regex, nunca `startsWith`:
 * `/almoxarifado/recebimentos` é PREFIXO de `/almoxarifado/recebimentos/:id` (`:77` e `:113`).
 * Com `startsWith`, `abrirDetalhe` receberia o ARRAY da lista, `setDetalhe([...])` renderizaria o
 * painel sem `id`, e o `Number(undefined)` de `AnexosDocumento.js:124` mandaria
 * `entidade_id: NaN` — com a suíte verde. Molde: `AnexosDocumento.test.js:112-125`.
 *
 * Por que o cenário da lista CONTA LINHAS:
 * os três `catch` de `:74-84`, `:92-96` e `:99-108` engolem a rejeição (o `toast` é mockado). Com
 * uma URL mal escrita, `recebimentos` fica `[]`, a tela renderiza "Nenhum recebimento registrado"
 * (`:447-455`) e um cenário que só afirmasse "renderizou sem erro" passaria com a tela VAZIA — e
 * o cenário da RN-02 (a lista não consulta anexos) passaria por não haver linha nenhuma. Daí a
 * contagem contra a fixture, e a metade POSITIVA dentro do mesmo teste.
 *
 * Executar:
 *   cd client && CI=true npx react-scripts test --watchAll=false \
 *     src/components/almoxarifado/RecebimentosAlmoxarifado.test.js
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RecebimentosAlmoxarifado from './RecebimentosAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
// `RecebimentosAlmoxarifado` não importa o hook — mas o `AnexosDocumento` importa (`:5`). Sem
// este mock o hook REAL dispararia `GET /almoxarifado/minhas-permissoes`, que o fallback que
// rejeita não conhece: o bloco cairia no estado de erro dele em todo cenário.
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

// Fixture da lista: TRÊS linhas, e nenhum id é 1. O painel dos cenários de anexo é o **58** — nem
// 1 (que empataria com um `entidadeId` hard-coded), nem o primeiro da lista (que empataria com
// `recebimentos[0].id`, o defeito da sabotagem (b)).
const RECEBIMENTOS = [
  {
    id: 41, numero: 'REC-2026-041', nota_fiscal: 'NF-4100', pedido_compra_numero: null,
    fornecedor_nome: 'Aços Vale Ltda', status: 'RECEBIDO', created_at: '2026-09-10T11:00:00Z',
  },
  {
    id: 58, numero: 'REC-2026-058', nota_fiscal: 'NF-5800', pedido_compra_numero: 'PC-0099',
    fornecedor_nome: 'Parafusos Sul', status: 'EM_CONFERENCIA', created_at: '2026-09-12T08:30:00Z',
  },
  {
    id: 77, numero: 'REC-2026-077', nota_fiscal: null, pedido_compra_numero: null,
    fornecedor_nome: 'Ferramentas Norte', status: 'CONFERIDO_ALMOX', created_at: '2026-09-14T16:45:00Z',
  },
  // Revisão final (F2): o documento na etapa de FATURAMENTO — o único status em que o botão
  // "Preencher Dados da NF" existe (`renderAcoes`) — e com `tipo_recebimento` FORA do enum, que é
  // o estado de acervo que travava toda gravação fiscal. Ver o cenário (r).
  {
    id: 84, numero: 'REC-2026-084', nota_fiscal: 'NF-8400', pedido_compra_numero: null,
    fornecedor_nome: 'Metais Legado', status: 'ENCAMINHADO_FATURAMENTO',
    created_at: '2026-09-15T10:00:00Z',
  },
];

const DETALHES = {
  41: {
    ...RECEBIMENTOS[0], fornecedor_cnpj: '11.111.111/0001-11', valor_total_nota: 1500,
    chave_nfe: null, nota_serie: '1', observacoes: null, contas_pagar_id: null,
    // DOIS itens, e é o 41 que carrega o par do fix-round 1 da T5 (cenário (q)): um item já
    // CONFERIDO (`conferencia_quantidade: true`, gravado por uma conferência anterior) ao lado de
    // um item com a quantidade preenchida. Só com dois itens o cenário tem as duas metades no
    // MESMO save — o item preenchido leva as duas chaves, o de campo vazio não leva nenhuma.
    // O 41 e não o 58 de propósito: os cenários (m), (n), (o) e (p) leem
    // `api.put.mock.calls[0][1]` com `toEqual` e um segundo item no 58 os quebraria — e o arnês
    // das Etapas 34/35 que usa o 41 ((e), (k), (l)) não conta itens nem inputs.
    itens: [
      {
        id: 411, material_id: 5, material_nome: 'Chapa Aço 3mm', material_codigo: 'ALM-0033',
        unidade: 'KG', quantidade_esperada: 50, quantidade_recebida: 50,
      },
      {
        id: 412, material_id: 5, material_nome: 'Chapa Aço 6mm', material_codigo: 'ALM-0034',
        unidade: 'KG', quantidade_esperada: 30, quantidade_recebida: 30,
        conferencia_quantidade: true,
      },
    ],
  },
  58: {
    ...RECEBIMENTOS[1], fornecedor_cnpj: '22.222.222/0001-22', valor_total_nota: 890.5,
    chave_nfe: '3526', nota_serie: '2', observacoes: 'Caixa amassada',
    // Com conta a pagar gerada: o banner de `:577-582` aparece, e é DEPOIS dele que o bloco de
    // anexos tem de nascer (o cenário (c) checa a ordem no DOM).
    contas_pagar_id: 909,
    itens: [{
      id: 581, material_id: 9, material_nome: 'Parafuso M8', material_codigo: 'ALM-0100',
      unidade: 'PC', quantidade_esperada: 200, quantidade_recebida: 200,
    }],
  },
  77: {
    ...RECEBIMENTOS[2], fornecedor_cnpj: null, valor_total_nota: null, chave_nfe: null,
    nota_serie: null, observacoes: null, contas_pagar_id: null, itens: [],
  },
  // Revisão final (F2): `tipo_recebimento: 'legado'` — valor FORA do enum da RN-11, gravado antes
  // de o enum existir. O modal fiscal não tem controle nenhum para esse campo, então ele só pode
  // ser ecoado — e ecoado, o Zod da rota responde 400 em toda gravação.
  84: {
    ...RECEBIMENTOS[3], fornecedor_cnpj: '44.444.444/0001-44', tipo_recebimento: 'legado',
    valor_total_nota: 2400, chave_nfe: null, nota_serie: '3', observacoes: null,
    contas_pagar_id: null,
    itens: [{
      id: 841, material_id: 5, material_nome: 'Chapa Aço 3mm', material_codigo: 'ALM-0033',
      unidade: 'KG', quantidade_esperada: 120, quantidade_recebida: 120,
    }],
  },
  // O recebimento que o POST cria: quem acabou de registrar cai no painel por
  // `abrirDetalhe(res.data.id)` (`:303`) e já pode anexar a nota fiscal. Id fora da lista de
  // propósito — o painel do recém-criado não depende de a lista já tê-lo.
  91: {
    id: 91, numero: 'REC-2026-091', nota_fiscal: 'NF-9100', pedido_compra_numero: null,
    fornecedor_nome: 'Aços Vale Ltda', fornecedor_cnpj: null, status: 'RECEBIDO',
    created_at: '2026-09-16T09:00:00Z', valor_total_nota: null, chave_nfe: null,
    nota_serie: null, observacoes: null, contas_pagar_id: null, itens: [],
  },
};

const MATERIAIS = [
  { id: 5, codigo: 'ALM-0033', nome: 'Chapa Aço 3mm', unidade: 'KG', controle_serie: 0 },
  { id: 9, codigo: 'ALM-0100', nome: 'Parafuso M8', unidade: 'PC', controle_serie: 0 },
];

// Etapa 37 (T5, RN-26): a fixture do PEDIDO DE COMPRA, e ela tem de entrar nas DUAS URLs — a da
// lista (que alimenta o `<select>`) e a de itens. Mockar só a de itens deixaria o `<select>` sem
// opção nenhuma, o `change` nunca dispararia e os três cenários passariam por VACUIDADE (era o
// estado do `beforeEach` até aqui: `data: []`).
// Ids `312`/`313` e não `1` nem o primeiro de outra fixture: os recebimentos já usam 41/58/77/91,
// e um id repetido faria a leitura do teste não distinguir pedido de recebimento.
const PEDIDOS = [
  {
    id: 312, numero: 'PC-2026-312', fornecedor_nome: 'Aços Vale Ltda',
    fornecedor_cnpj: '11.111.111/0001-11', status: 'aprovado', valor_total: 350,
    quantidade_pedida: 10, quantidade_recebida: 0, saldo_pendente: 10,
    situacao_recebimento: 'ABERTO',
  },
  // O pedido QUITADO continua na lista de propósito: `?pendentes=1` filtra no SERVIDOR, e a lista
  // do modal foi carregada na montagem da tela — entre a carga e o clique do operador o pedido
  // pode ter sido completado por outro recebimento. A tela tem de sobreviver a isso dizendo o que
  // houve, e é essa a metade do cenário (w).
  {
    id: 313, numero: 'PC-2026-313', fornecedor_nome: 'Parafusos Sul',
    fornecedor_cnpj: '22.222.222/0001-22', status: 'aprovado', valor_total: 900,
    quantidade_pedida: 40, quantidade_recebida: 40, saldo_pendente: 0,
    situacao_recebimento: 'RECEBIDO',
  },
  // O pedido do fix 1 da T4: DUAS linhas do mesmo material, uma delas recebida a mais (excedente
  // autorizado). O saldo da LINHA que sobrou é 10, mas o teto que a porta aceita para o material é
  // 5 — porque a linha estourada entra NEGATIVA no agregado.
  {
    id: 314, numero: 'PC-2026-314', fornecedor_nome: 'Aços Vale Ltda',
    fornecedor_cnpj: '11.111.111/0001-11', status: 'aprovado', valor_total: 700,
    quantidade_pedida: 20, quantidade_recebida: 15, saldo_pendente: 5,
    situacao_recebimento: 'PARCIAL',
  },
];

// A resposta de `GET /recebimentos-aux/pedidos-compra/:id/itens` (contrato congelado na T4 +
// fix 1): `id` é o id da LINHA do pedido (`itens_pedido_compra.id`), que é o `pedido_item_id` que
// o client devolve no POST; só saem linhas com `saldo_pendente > 0` (quem filtra é a ROTA); e
// `saldo_pendente_material` é o TETO que a porta aceita para aquele material.
const ITENS_PEDIDO = {
  312: [{
    id: 9312, material_id: 9, material_nome: 'Parafuso M8', material_codigo: 'ALM-0100',
    codigo: 'ALM-0100', descricao: 'Parafuso M8 zincado', unidade: 'PC',
    quantidade: 10, quantidade_recebida: 0, saldo_pendente: 10,
    saldo_pendente_material: 10, valor_unitario: 3.5,
  }],
  // Pedido quitado: 200 com `[]`, que NÃO é erro — é a informação de que não há o que receber.
  313: [],
  // Fix 1 da T4: a linha A (10 pedidos, 15 recebidos) NÃO volta — a rota só devolve linha com
  // `saldo_pendente > 0`. Volta a B, com `saldo_pendente: 10` (o que falta NELA) e
  // `saldo_pendente_material: 5` (o teto que `assertSaldoDoPedidoPermitido` compara, porque a
  // linha A entra NEGATIVA no agregado do material). Os dois números divergem aqui de propósito:
  // é o único jeito de uma asserção distinguir qual deles a tela usou.
  314: [{
    id: 9314, material_id: 9, material_nome: 'Parafuso M8', material_codigo: 'ALM-0100',
    codigo: 'ALM-0100', descricao: 'Parafuso M8 zincado', unidade: 'PC',
    quantidade: 10, quantidade_recebida: 0, saldo_pendente: 10,
    saldo_pendente_material: 5, valor_unitario: 3.5,
  }],
};

let container; let root; let recebimentosDoBanco;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  recebimentosDoBanco = RECEBIMENTOS;
  // Implementação aqui, não na fábrica do `jest.mock`: `clearAllMocks` apaga implementações.
  api.get.mockImplementation((url) => {
    // Igualdade ANTES da regex, e nunca `startsWith` — ver o cabeçalho.
    if (url === '/almoxarifado/recebimentos') return Promise.resolve({ data: recebimentosDoBanco });
    if (/^\/almoxarifado\/recebimentos\/\d+$/.test(url)) {
      const id = Number(url.split('/').pop());
      return DETALHES[id]
        ? Promise.resolve({ data: DETALHES[id] })
        : Promise.reject(new Error(`Recebimento ${id} fora da fixture`));
    }
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: MATERIAIS });
    if (url === '/almoxarifado/recebimentos-aux/pedidos-compra') return Promise.resolve({ data: PEDIDOS });
    // Etapa 37 (T5): a rota de itens do pedido. Igualdade ANTES da regex (a linha de cima é
    // PREFIXO desta), e a URL desconhecida continua REJEITANDO — sem esta linha os cenários do
    // pedido mediriam o `catch` da tela, não o bloco de itens.
    if (/^\/almoxarifado\/recebimentos-aux\/pedidos-compra\/\d+\/itens$/.test(url)) {
      const id = Number(url.split('/')[4]);
      return ITENS_PEDIDO[id]
        ? Promise.resolve({ data: ITENS_PEDIDO[id] })
        : Promise.reject(new Error(`Pedido ${id} fora da fixture`));
    }
    if (url === '/almoxarifado/recebimentos-aux/fornecedores') return Promise.resolve({ data: [] });
    // Etapa 34: a rota que o bloco de anexos consulta ao montar dentro do painel.
    if (url === '/almoxarifado/anexos') return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`URL inesperada no teste: ${url}`));
  });
  api.post.mockImplementation(() => Promise.resolve({ data: { id: 91, numero: 'REC-2026-091' } }));
  // Etapa 36 (T5): `api.put` era um `jest.fn()` SEM implementação — devolvia `undefined`, o
  // `await undefined` passava, o `catch` da tela nunca disparava e um cenário de conferência
  // ficaria verde sem nunca ter havido payload. Implementação aqui e não na fábrica do
  // `jest.mock` pelo mesmo motivo do `api.get`: o `resetMocks` do react-scripts apaga
  // implementações entre cenários.
  api.put.mockImplementation(() => Promise.resolve({ data: { success: true } }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

async function renderizar() {
  await act(async () => {
    root.render(<MemoryRouter><RecebimentosAlmoxarifado /></MemoryRouter>);
  });
  await esperarEfeitos();
}
async function clicar(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
// Input controlado do React: setar `.value` direto não dispara o `onChange` — usa o setter nativo
// + evento `input`, que é o que o React ouve (molde: o helper `digitar` de
// `RequisicoesList.test.js` — referência por NOME, não por linha: o número já estava errado em ~15
// linhas antes da revisão final desta etapa, e é o terceiro caso de drift dessa forma na branch).
function digitar(input, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const linhas = () => [...container.querySelectorAll('.almox-table tbody tr')];
const linhaDe = (numero) => linhas().find((tr) => tr.textContent.includes(numero));
const painel = () => container.querySelector('.almox-detail-panel');
const blocoAnexos = () => container.querySelector('[data-testid="anexos-documento"]');
const chamadasAnexos = () => api.get.mock.calls.filter(([url]) => url === '/almoxarifado/anexos');
const chamadasDetalhe = (id) => api.get.mock.calls.filter(([url]) => url === `/almoxarifado/recebimentos/${id}`);
const botaoPorTexto = (texto) => [...container.querySelectorAll('button')]
  .find((b) => b.textContent.trim().includes(texto));
// A barra de passos do `AlmoxPageHeader`: `active` e a classe que ele poe no passo corrente
// (`AlmoxPageHeader.js`, `idx = currentStep ?? -1`). `null` aqui significa "nenhum passo aceso".
const passoAtivo = () => container.querySelector('.almox-flow-step.active');
// Etapa 36 (T5): o campo de quantidade conferida. Referência por TÍTULO e não por posição —
// `querySelectorAll('input')` no painel casaria os inputs fiscais e o input de arquivo do bloco
// de anexos, e a ordem entre eles muda a cada etapa.
const inputConferida = () => container.querySelector('[title="Qtd. conferida"]');
const caixaExcedente = () => [...(painel()?.querySelectorAll('label') || [])]
  .find((l) => l.textContent.includes('Autorizo o recebimento acima do pedido'))
  ?.querySelector('input[type="checkbox"]');
const chamadasConferir = (id) => api.put.mock.calls
  .filter(([url]) => url === `/almoxarifado/recebimentos/${id}/conferir`);

// ── Etapa 37 (T5): o modal de NOVO recebimento ────────────────────────────────────────────────
// `.almox-modal` e não `container` inteiro: o texto da LISTA e o do painel também estão no
// container, e uma asserção de literal medida no container passaria por achar a frase fora do
// modal. Só um modal fica aberto por vez nesta tela.
const modalNovo = () => container.querySelector('.almox-modal');
// Referência por LABEL e não por posição: a ordem dos `<select>` do modal muda a cada etapa.
const selectPorLabel = (texto) => [...container.querySelectorAll('.almox-field')]
  .find((d) => d.querySelector('label')?.textContent.includes(texto))
  ?.querySelector('select');
// `data-testid` com o `pedido_item_id` (9312, nem `1` nem o primeiro de outra fixture): duas
// linhas do MESMO material são caso legítimo do pedido, então a chave da linha não pode ser o
// material.
const inputQtdPedido = (pedidoItemId) => container
  .querySelector(`[data-testid="qtd-pedido-${pedidoItemId}"]`);
const caixaExcedenteModal = () => [...(modalNovo()?.querySelectorAll('label') || [])]
  .find((l) => l.textContent.includes('Autorizo o recebimento acima do pedido'))
  ?.querySelector('input[type="checkbox"]');
const chamadasItensPedido = (id) => api.get.mock.calls
  .filter(([url]) => url === `/almoxarifado/recebimentos-aux/pedidos-compra/${id}/itens`);
const chamadasCriar = () => api.post.mock.calls
  .filter(([url]) => url === '/almoxarifado/recebimentos');
// `<select>` controlado do React: mesmo motivo do helper `digitar` — setar `.value` direto não
// dispara o `onChange`; o React ouve o evento `change` no select.
async function selecionar(select, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => {
    setter.call(select, valor);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await esperarEfeitos();
}
async function submeterModal() {
  await act(async () => {
    modalNovo().querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await esperarEfeitos();
}
// O gesto completo até o bloco de itens: abrir o modal, trocar a forma de recebimento e escolher
// o pedido. Devolve o `<select>` de pedidos, que os cenários reusam para TROCAR de pedido.
async function escolherPedido(numeroId) {
  await clicar(botaoPorTexto('Novo Recebimento'));
  await selecionar(selectPorLabel('Forma de recebimento'), 'PEDIDO_COMPRA');
  const selPedido = selectPorLabel('Número do Pedido de Compra');
  await selecionar(selPedido, String(numeroId));
  return selPedido;
}

/* ── (a) a lista ───────────────────────────────────────────────────────────────────────────────
 * Conta linhas contra a fixture, e não "renderizou sem erro": com uma URL errada no mock a tela
 * mostra "Nenhum recebimento registrado" e um teste frouxo passaria com a tela vazia.
 */
test('(a) a lista renderiza UMA linha por recebimento da fixture, com numero, NF e fornecedor', async () => {
  await renderizar();

  expect(api.get).toHaveBeenCalledWith('/almoxarifado/recebimentos', { params: {} });
  expect(linhas()).toHaveLength(RECEBIMENTOS.length);
  expect(container.textContent).not.toContain('Nenhum recebimento registrado');

  const l58 = linhaDe('REC-2026-058');
  expect(l58).not.toBeUndefined();
  expect(l58.textContent).toContain('NF-5800');
  expect(l58.textContent).toContain('Parafusos Sul');
  expect(l58.textContent).toContain('Em Conferência');

  // Nada de painel antes do clique.
  expect(painel()).toBeNull();
});

/* ── (b) o painel ─────────────────────────────────────────────────────────────────────────────*/
test('(b) clicar na linha abre o painel de detalhe do recebimento clicado', async () => {
  await renderizar();
  await clicar(linhaDe('REC-2026-058'));

  expect(chamadasDetalhe(58)).toHaveLength(1);
  const p = painel();
  expect(p).not.toBeNull();
  expect(p.textContent).toContain('REC-2026-058');
  expect(p.textContent).toContain('Parafuso M8');
  // O detalhe carregado é o 58 e não o 41 — o `startsWith` do mock (que devolveria o array da
  // lista) morreria aqui antes de contaminar os cenários de anexo.
  expect(p.textContent).not.toContain('REC-2026-041');
});

/* ── (c) o bloco de anexos ────────────────────────────────────────────────────────────────────
 * O que cada asserção guarda:
 * - os `params` guardam o defeito mais barato de cometer e o mais invisível: o `AnexosDocumento`
 *   é genérico para seis entidades, e com a chave trocada a tela lista os anexos de OUTRO
 *   registro sem 400, sem erro e sem sintoma visual;
 * - `entidade_id: 58` guarda o bloco pendurado no registro errado (o primeiro da lista, um id
 *   hard-coded, ou o `NaN` do painel sem `id`);
 * - `toHaveLength(1)` guarda consulta duplicada por montagem;
 * - a ordem no DOM guarda o ponto de inserção: o bloco vem DEPOIS do banner de contas a pagar,
 *   no fim do painel, não no meio dos itens.
 */
test('(c) o painel mostra o bloco de anexos consultando entidade=recebimento e o id DO DETALHE, uma vez', async () => {
  await renderizar();
  await clicar(linhaDe('REC-2026-058'));

  const bloco = blocoAnexos();
  expect(bloco).not.toBeNull();
  // Dentro do painel, não pendurado na lista.
  expect(painel().contains(bloco)).toBe(true);
  // E com superfície para anexar: um plug `somenteLeitura` deixaria a etapa sem onde anexar a NF.
  expect(bloco.querySelector('[data-testid="anexo-arquivo"]')).not.toBeNull();

  expect(api.get).toHaveBeenCalledWith('/almoxarifado/anexos', {
    params: { entidade: 'recebimento', entidade_id: 58 },
  });
  expect(chamadasAnexos()).toHaveLength(1);

  // Fim do painel: depois do banner da conta a pagar gerada (`contas_pagar_id: 909`).
  const banner = [...painel().querySelectorAll('.almox-hint-banner')]
    .find((b) => b.textContent.includes('Conta a pagar #909'));
  expect(banner).not.toBeUndefined();
  expect(banner.compareDocumentPosition(bloco) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

/* ── (d) RN-02: a lista sozinha não consulta anexos ───────────────────────────────────────────
 * As duas metades no MESMO teste: sem a positiva, este cenário passaria com a tela vazia (e é
 * exatamente essa a sabotagem (b), que pendura o bloco na lista).
 */
test('(d) lista fechada NAO consulta anexos — 100 recebimentos nao viram 100 requisicoes — e abrir passa a consultar', async () => {
  await renderizar();

  // metade negativa, ancorada: a lista TEM linhas e mesmo assim nenhum GET de anexos.
  expect(linhas()).toHaveLength(RECEBIMENTOS.length);
  expect(painel()).toBeNull();
  expect(blocoAnexos()).toBeNull();
  expect(chamadasAnexos()).toHaveLength(0);
  expect(api.get).not.toHaveBeenCalledWith('/almoxarifado/anexos', expect.anything());

  // metade positiva: o clique abre o painel e só aí o bloco nasce e consulta.
  await clicar(linhaDe('REC-2026-058'));
  expect(blocoAnexos()).not.toBeNull();
  expect(chamadasAnexos()).toHaveLength(1);
});

/* ── (e) trocar de recebimento ────────────────────────────────────────────────────────────────
 * O bloco lê `detalhe.id`, então trocar o painel tem de trocar o `entidade_id`. Um bloco que
 * lesse um id congelado na primeira montagem continuaria mostrando os anexos do 58 com o painel
 * do 41 aberto — anexo cruzado, sem erro na tela.
 */
test('(e) trocar de linha refaz a consulta com o novo id, e a ULTIMA chamada e a do segundo recebimento', async () => {
  await renderizar();
  await clicar(linhaDe('REC-2026-058'));
  expect(chamadasAnexos()).toHaveLength(1);

  await clicar(linhaDe('REC-2026-041'));
  expect(painel().textContent).toContain('REC-2026-041');
  const ultima = chamadasAnexos().at(-1);
  expect(ultima[1].params).toEqual({ entidade: 'recebimento', entidade_id: 41 });

  // E fechar o painel derruba o bloco — nada de consulta pendurada num painel invisível.
  await clicar(container.querySelector('.almox-modal-close'));
  expect(painel()).toBeNull();
  expect(blocoAnexos()).toBeNull();
});

/* ── (f) o caso de uso real ───────────────────────────────────────────────────────────────────
 * `handleCriar` termina em `abrirDetalhe(res.data.id)` (`:303`): quem registrou o recebimento cai
 * no painel e já pode anexar a nota fiscal ali, sem procurar a linha na lista. O `id` vem do
 * POST — se o bloco lesse qualquer outra coisa (o primeiro da lista, a URL), o recém-criado
 * abriria com os anexos de outro recebimento.
 */
test('(f) depois de registrar, o painel do recem-criado ja traz o bloco de anexos com o id devolvido pelo POST', async () => {
  await renderizar();
  await clicar(botaoPorTexto('Novo Recebimento'));

  // Um item é obrigatório (o submit fica `disabled` sem item): busca com 2+ caracteres para a
  // lista de resultados aparecer, e clica no material.
  const busca = container.querySelector('input.almox-search-input');
  digitar(busca, 'Parafuso');
  await esperarEfeitos();
  await clicar(botaoPorTexto('ALM-0100'));

  await act(async () => {
    container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await esperarEfeitos();

  expect(api.post).toHaveBeenCalledWith('/almoxarifado/recebimentos', expect.objectContaining({
    itens: [expect.objectContaining({ material_id: 9, quantidade: 1 })],
  }));
  expect(chamadasDetalhe(91)).toHaveLength(1);
  expect(painel().textContent).toContain('REC-2026-091');

  const bloco = blocoAnexos();
  expect(bloco).not.toBeNull();
  expect(painel().contains(bloco)).toBe(true);
  expect(chamadasAnexos()).toHaveLength(1);
  expect(chamadasAnexos()[0][1].params).toEqual({ entidade: 'recebimento', entidade_id: 91 });
});

/* ── (g) F2 da revisão da branch: o refetch do detalhe não pode remontar o bloco ───────────────
 * `workflow` (`:145-158`), `salvarFiscal` (`:195`) e `processarNota` (`:212`) terminam em
 * `abrirDetalhe(detalhe.id)`, que começa com `setLoadingDetalhe(true)` (`:112`). Com o bloco
 * DENTRO do ternário `{loadingDetalhe ? … : corpo}` (`:496`), cada uma dessas ações desmontava o
 * corpo do painel: o `AnexosDocumento` perdia o arquivo já escolhido no input (estado local,
 * `AnexosDocumento.js:110-112`) e remontava vazio, com um SEGUNDO GET. O usuário que escolheu a
 * NF digitalizada, clicou em "Finalizar Conferência" e só então em "Anexar" recebia
 * "Arquivo é obrigatório", sem nada na tela explicando o porquê.
 *
 * A régua é IDENTIDADE DE NÓ (`toBe`), não presença: presença não distingue "continua montado"
 * de "remontou igual". E a contagem de `/almoxarifado/anexos` continua 1 — o `entidade_id` não
 * mudou, então não existe motivo para reconsultar.
 *
 * Por que o GET do refetch é DEFERIDO à mão aqui:
 * a primeira versão deste cenário só clicava e media no fim — e passava COM O BLOCO NO LUGAR
 * ERRADO (medido). A razão é o `act`: com o refetch resolvendo dentro do mesmo `act`, o React
 * coalesce o commit intermediário e o estado `loadingDetalhe === true` nunca chega ao DOM — ou
 * seja, o teste nunca via a janela em que o navegador de verdade desmonta o corpo do painel.
 * Segurando a resposta do detalhe, a janela fica observável e o cenário mede o que o usuário
 * vive: o bloco tem de continuar montado ENQUANTO o detalhe recarrega.
 */
test('(g) refetch do detalhe por acao de workflow NAO desmonta o bloco nem repete a consulta', async () => {
  await renderizar();
  await clicar(linhaDe('REC-2026-058'));

  const antes = blocoAnexos();
  expect(antes).not.toBeNull();
  expect(chamadasAnexos()).toHaveLength(1);

  // Segura só o SEGUNDO GET do detalhe 58; todo o resto segue pela implementação original.
  const original = api.get.getMockImplementation();
  let liberarDetalhe;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos/58') {
      return new Promise((resolve) => { liberarDetalhe = () => resolve({ data: DETALHES[58] }); });
    }
    return original(url);
  });

  // REC-058 está em EM_CONFERENCIA: a ação disponível é "Finalizar Conferência" (`:365-370`).
  await clicar(botaoPorTexto('Finalizar Conferência'));

  // Ancora: a ação e o refetch REALMENTE aconteceram — senão o resto passaria por não ter havido
  // nada para desmontar.
  expect(api.post).toHaveBeenCalledWith('/almoxarifado/recebimentos/58/workflow',
    { acao: 'finalizar_conferencia' });
  expect(chamadasDetalhe(58)).toHaveLength(2);
  expect(liberarDetalhe).toBeInstanceOf(Function);

  // EM VOO, com `loadingDetalhe === true`: é aqui que o corpo do painel desmontava e levava o
  // arquivo já escolhido no input embora. O bloco tem de ser o MESMO nó.
  expect(painel().querySelector('.almox-loading')).not.toBeNull();
  expect(blocoAnexos()).toBe(antes);

  // E depois que o detalhe chega, continua o mesmo nó, sem segunda consulta de anexos.
  await act(async () => { liberarDetalhe(); });
  await esperarEfeitos();
  expect(blocoAnexos()).toBe(antes);
  expect(chamadasAnexos()).toHaveLength(1);
});

/* ── (h) RN-04: rede caida NAO pode virar "Nenhum recebimento registrado" ────────────────────
 * O `catch` de `:80-82` so dispara um toast — e o toast e MOCKADO aqui (`:42-44`), some em
 * segundos no navegador e nao deixa rastro no DOM. Com `recebimentos` em `[]` (`:47`), a tela
 * renderiza a frase de `:448` e o operador conclui que nao ha recebimento nenhum — e registra de
 * novo um recebimento que ja existe.
 * O fallback do mock NAO serve para este cenario: `/almoxarifado/recebimentos` esta mapeada em
 * `:120` e RESOLVE. Tem de sobrescrever (molde `HistoricoInspecoes.test.js:211-216`).
 */
test('(h) a lista que NAO carregou mostra erro, nunca "Nenhum recebimento registrado"', async () => {
  const original = api.get.getMockImplementation();
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos') {
      return Promise.reject({ response: { data: { error: 'Sem acesso ao módulo' } } });
    }
    return original(url);
  });
  await renderizar();

  // Metade POSITIVA: a tela montou (senao este cenario passaria com a tela vazia).
  expect(container.textContent).toContain('Recebimentos NF');
  // O que TEM de estar la:
  expect(container.textContent).toContain('Não foi possível carregar os recebimentos.');
  expect(container.textContent).toContain('Sem acesso ao módulo');
  expect(container.textContent).toContain('Tentar de novo');
  // E o que NAO pode estar — a frase que faz o operador concluir que a lista esta vazia:
  expect(container.textContent).not.toContain('Nenhum recebimento registrado');

  // O botao tem de FUNCIONAR, nao so existir: sem isto, um <button> sem `onClick` passa verde e a
  // metade util do estado de erro fica sem prova. Molde: `HistoricoInspecoes.test.js:227-242`.
  api.get.mockImplementation(original);
  await clicar(botaoPorTexto('Tentar de novo'));
  expect(linhas()).toHaveLength(RECEBIMENTOS.length);
  expect(container.textContent).not.toContain('Não foi possível carregar os recebimentos.');
});

/* ── (i) RN-05: a lista OBSOLETA e o segundo caso, e o plano da 34 nao o nomeava ───────────────
 * O `catch` nao zera `recebimentos`: um refresh que falha (botao `:409`, ou troca de filtro pela
 * dep de `:85`) deixava as linhas antigas na tela sem nenhuma marca de que os dados sao velhos —
 * pior que a lista vazia, porque parece fresco.
 */
test('(i) refresh que falha nao deixa a lista velha na tela', async () => {
  await renderizar();
  expect(linhas()).toHaveLength(RECEBIMENTOS.length);      // metade positiva: carregou mesmo

  const original = api.get.getMockImplementation();
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos') {
      return Promise.reject({ response: { data: { error: 'Timeout do servidor' } } });
    }
    return original(url);
  });
  // O botao de refresh do cabecalho (`:409`) e so um icone, sem texto nem nome acessivel — a
  // Etapa 35 lhe deu `title="Atualizar lista"` no produto, que e o que torna este seletor
  // possivel (e o botao, anunciavel por leitor de tela). Precedente:
  // o botao `title="Atualizar detalhe e saldos"` de `RequisicoesList.js` (referência por título,
  // não por linha — o número citado aqui antes já estava errado).
  await clicar(container.querySelector('[title="Atualizar lista"]'));
  // A ORDEM destas tres asserções é ela mesma um achado, medido no controle positivo desta task:
  // `linhas()` VEM PRIMEIRO de propósito. O único jeito de a tabela velha voltar a renderizar é o
  // par "`setErro` não acontece" + "`setRecebimentos([])` não acontece" — e com os `toContain` na
  // frente, o Jest estoura neles e `linhas()` nunca chega a rodar. Era o que acontecia na ordem
  // original: a régua que nomeia a RN-05 ("a lista obsoleta passando por fresca") ficava sem
  // controle positivo nenhum, dominada pelas duas asserções anteriores. Com `linhas()` na frente,
  // a sabotagem 2c derruba este cenário com `Received 3` — as três linhas velhas na tela.
  expect(linhas()).toHaveLength(0);
  expect(container.textContent).toContain('Não foi possível carregar os recebimentos.');
  expect(container.textContent).toContain('Timeout do servidor');
});

/* ── (j) RN-06: o `catch` silencioso de `loadMateriais` (`:97`) ────────────────────────────────
 * Ele alimenta a busca de material do modal "Novo Recebimento". Falhando em silencio, o operador
 * digita o nome de um material que EXISTE e conclui que nao esta cadastrado. E a falha de um
 * carregamento nao pode contaminar o outro: a lista continua resolvendo neste cenario.
 */
test('(j) falha ao carregar materiais aparece DENTRO do modal de novo recebimento', async () => {
  const original = api.get.getMockImplementation();
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais') return Promise.reject(new Error('rede'));
    return original(url);
  });
  await renderizar();
  // Metade positiva dupla: a lista carregou e NAO esta em estado de erro.
  expect(linhas()).toHaveLength(RECEBIMENTOS.length);
  expect(container.textContent).not.toContain('Não foi possível carregar os recebimentos.');

  await clicar(botaoPorTexto('Novo Recebimento'));
  expect(container.querySelector('input.almox-search-input')).not.toBeNull();   // o modal montou
  expect(container.textContent).toContain('Não foi possível carregar a lista de materiais.');
});

/* ── (k) RN-07: trocar de linha nao pode mostrar o registro anterior sob o id novo ─────────────
 * `abrirDetalhe` nunca anulava `detalhe` (hoje ele anula, sob a guarda de `idCarregadoRef`): so
 * chamava `setLoadingDetalhe(true)` e
 * `setDetalhe(res.data)` no SUCESSO. Com o bloco de anexos FORA do ternario de `loadingDetalhe`
 * (fix `c5d9e99` da Etapa 34, cenario (g) acima), clicar em B deixava o painel exibindo A inteiro
 * — cabecalho, itens e `AnexosDocumento` com o `entidade_id` de A — ate o GET de B chegar. Um
 * arquivo escolhido nessa janela era anexado a A, sem erro nenhum na tela.
 *
 * O GET de B e DEFERIDO a mao pelo mesmo motivo do (g) — ver o porque escrito no cabecalho
 * daquele cenario: sem segurar a resposta, o `act` coalesce o commit intermediario e a janela
 * que o usuario vive nunca chega ao DOM — o cenario ficaria verde medindo outra coisa.
 */
test('(k) trocar de linha nao mostra o recebimento anterior sob o id novo', async () => {
  await renderizar();
  await clicar(linhaDe('REC-2026-058'));
  const blocoDo58 = blocoAnexos();
  expect(blocoDo58).not.toBeNull();                       // metade positiva
  expect(chamadasAnexos()).toHaveLength(1);
  // Metade positiva do achado F2 da revisao final: com o 58 carregado a barra de passos TEM um
  // passo aceso (EM_CONFERENCIA -> etapa 1 -> "Almoxarifado").
  expect(passoAtivo()).not.toBeNull();
  expect(passoAtivo().textContent).toContain('Almoxarifado');

  const original = api.get.getMockImplementation();
  let liberar41;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos/41') {
      return new Promise((resolve) => { liberar41 = () => resolve({ data: DETALHES[41] }); });
    }
    return original(url);
  });

  await clicar(linhaDe('REC-2026-041'));
  expect(liberar41).toBeInstanceOf(Function);             // ancora: o GET do 41 esta EM VOO

  // A janela que o usuario vive: o painel existe (nao pisca — `selectedId` o sustenta), mas nao
  // mostra mais o 58, e o bloco de anexos do 58 saiu de cena.
  expect(painel()).not.toBeNull();
  expect(painel().querySelector('.almox-loading')).not.toBeNull();
  expect(painel().textContent).not.toContain('REC-2026-058');
  expect(blocoAnexos()).toBeNull();
  expect(chamadasAnexos()).toHaveLength(1);               // e nenhuma consulta nova ainda
  // Achado F2 da revisao final: o 8o consumidor de `detalhe` era o `currentStep` do cabecalho, que
  // ficava `0` com `detalhe` nulo — a barra desabava para o passo 1 ACESO durante a carga e
  // voltava ao chegar o detalhe. Com `detalhe` nulo nenhum passo fica aceso: a barra congela em
  // vez de mentir e piscar.
  expect(passoAtivo()).toBeNull();

  // Metade positiva do outro lado: quando o 41 chega, o bloco volta com o id DELE.
  await act(async () => { liberar41(); });
  await esperarEfeitos();
  expect(painel().textContent).toContain('REC-2026-041');
  expect(passoAtivo()).not.toBeNull();                    // e a barra volta a acender
  expect(blocoAnexos()).not.toBeNull();
  expect(chamadasAnexos().at(-1)[1].params).toEqual({ entidade: 'recebimento', entidade_id: 41 });
});

/* ── (l) RN-08: resposta fora de ordem ────────────────────────────────────────────────────────
 * Anular `detalhe` fecha a janela do painel mentiroso, mas NAO a corrida: sem contador de
 * sequencia, dois cliques rapidos deixam duas requisicoes em voo e a ULTIMA A RESPONDER vence.
 * Se o 58 (clicado primeiro) responder depois do 41, o painel termina no 58 com o usuario tendo
 * clicado no 41 — e o `AnexosDocumento` anexaria ao 58. Molde: `RequisicoesList.js`, o par
 * `fetchSeq`/`detalheFetchSeqRef` de `abrirDetalhe`.
 */
test('(l) resposta fora de ordem nao vence — o ULTIMO clique manda', async () => {
  await renderizar();
  const original = api.get.getMockImplementation();
  let liberar58;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos/58') {
      return new Promise((resolve) => { liberar58 = () => resolve({ data: DETALHES[58] }); });
    }
    return original(url);
  });

  await clicar(linhaDe('REC-2026-058'));     // fica em voo
  await clicar(linhaDe('REC-2026-041'));     // resolve normalmente
  expect(painel().textContent).toContain('REC-2026-041');    // metade positiva
  expect(liberar58).toBeInstanceOf(Function);

  await act(async () => { liberar58(); });   // a resposta ATRASADA do 58 chega por ultimo
  await esperarEfeitos();

  expect(painel().textContent).toContain('REC-2026-041');
  expect(painel().textContent).not.toContain('REC-2026-058');
  expect(painel().querySelector('.almox-loading')).toBeNull();   // o `finally` fora de ordem nao deixa o painel girando
  expect(chamadasAnexos().at(-1)[1].params).toEqual({ entidade: 'recebimento', entidade_id: 41 });
});

/* ── (m) RN-16: o campo que faltava — quantidade conferida → PUT /conferir ─────────────────────
 * Medido na Fase 0 da Etapa 36: NÃO existia, em lugar nenhum do client, campo para dizer quanto
 * chegou de verdade. `atualizarItemDetalhe` era chamado em 8 pontos e `quantidade_recebida` não
 * estava entre os campos; o painel mostrava UMA quantidade só (`recebida || esperada`); no modal
 * de criar, `quantidade_recebida` nascia IGUAL a `quantidade_esperada`; e
 * `PUT /almoxarifado/recebimentos/:id/conferir` — a rota que existe exatamente para isto — não
 * tinha chamador nenhum (achado Crítico registrado em `alertaEventoGanchos.api.test.js:9`).
 * Consequência: o alerta `DIVERGENCIA_RECEBIMENTO` tinha consumidor, dedupe, e-mail e central de
 * alertas, e ZERO produtor alcançável pela tela — enquanto o manual descrevia o alerta e até o
 * dedupe ("corrigir a quantidade e errar de novo"), texto que só faz sentido se houvesse onde
 * corrigir a quantidade.
 *
 * O que cada asserção guarda:
 * - `toHaveLength(1)` guarda o PUT duplicado por re-render (`toHaveBeenCalledWith` solto é
 *   satisfeito por 1, 2 ou 10 chamadas);
 * - o `toEqual` (e não `toMatchObject`) guarda a AUSÊNCIA de `status` no payload, que é contrato
 *   congelado: salvar a contagem não avança o workflow — conferir e finalizar a conferência
 *   continuam sendo dois gestos;
 * - `quantidade_recebida: 187` NÚMERO, não `'187'`: o input devolve string e o contrato congelado
 *   pede número (o servidor faz `parseFloat`, mas o payload do manual é o desta asserção);
 * - o id `581` é o do item da fixture — nem `1`, nem o item do primeiro recebimento da lista.
 *
 * CONTROLE POSITIVO declarado antes do código: sem o input, o payload levaria **200** (a recebida
 * nasce igual à esperada na fixture, como nascia no produto). É o `187` deste `toEqual` que
 * distingue "leu o que o usuário digitou" de "repetiu a quantidade esperada".
 */
test('(m) digitar a quantidade conferida chama PUT /conferir uma vez, com o payload literal e SEM status', async () => {
  await renderizar();
  await clicar(linhaDe('REC-2026-058'));

  const input = inputConferida();
  expect(input).not.toBeNull();
  digitar(input, '187');
  await esperarEfeitos();

  const botao = botaoPorTexto('Salvar Conferência');
  expect(botao).not.toBeUndefined();
  await clicar(botao);

  expect(chamadasConferir(58)).toHaveLength(1);
  expect(api.put.mock.calls[0][1]).toEqual({
    itens: [{ id: 581, quantidade_recebida: 187, conferencia_quantidade: false }],
  });
});

/* ── (n) RN-17: a divergência aparece na tela, com as DUAS quantidades ─────────────────────────
 * ⚠️ A asserção de "contém 187" lê o texto em NEGRITO da linha do item, NÃO o input: `textContent`
 * não inclui o `value` de um `<input>`. O `187` só chega ao DOM porque `atualizarItemDetalhe`
 * atualiza `detalhe.itens` e a linha da quantidade re-renderiza com ele. Quem "consertar" esta
 * asserção achando que ela lia o input vai derrubar a régua da RN-17 sem perceber.
 *
 * A literal é a MESMA que vai para o manual — daí ser comparada por inteiro, com a diferença e a
 * esperada entre parênteses, e não por pedaços ("Divergência" + "13").
 */
test('(n) divergencia aparece com as DUAS quantidades, e bater com a esperada apaga o aviso', async () => {
  await renderizar();
  await clicar(linhaDe('REC-2026-058'));

  const input = inputConferida();
  expect(input).not.toBeNull();
  digitar(input, '187');
  await esperarEfeitos();

  expect(painel().textContent).toContain('Divergência: 13 a menos que o esperado (200)');
  expect(painel().textContent).toContain('187');
  expect(painel().textContent).toContain('Esperada: 200');

  // Metade POSITIVA no mesmo cenário: sem ela, um `avisoDivergencia` que devolvesse sempre o
  // aviso passaria a primeira parte, e um que nunca renderizasse a esperada passaria a segunda.
  digitar(input, '200');
  await esperarEfeitos();
  expect(painel().textContent).not.toContain('Divergência:');
  expect(painel().textContent).toContain('Esperada: 200');
});

/* ── (o) RN-18: excedente pede autorização, e a recusa do servidor chega ao DOM ────────────────
 * Duas coisas distintas, de propósito no mesmo cenário:
 *
 * 1. A UI OFERECE a caixa quando algum item passa da quantidade esperada, e manda
 *    `autorizar_excedente: true` só quando ela está marcada.
 * 2. Quem DECIDE é o backend. A caixa é escondida por `pode('autorizar_excedente')`, e esse hook
 *    FALHA ABERTO de propósito (`useAlmoxPermissoes.js`) — então quem não tem a ação pode ver a
 *    caixa por um instante e tomar 403 do servidor. É o desenho, não defeito.
 *
 * ⚠️ Achado declarado do controle positivo (sabotagem 4 da T5): esta suíte NÃO protege o
 * esconder-por-permissão. O mock do hook no topo devolve `pode: () => true`, então remover o
 * `&& pode('autorizar_excedente')` da caixa não derruba nada aqui. Não se forja vermelho para
 * isso: a barreira real é o 403 do servidor, travado por `recebimentoExcedente.api.test.js`.
 *
 * A metade negativa afirma a literal congelada da T3 NO DOM, e não no toast: o `toast` é mockado
 * nesta suíte e, no navegador, ele some em segundos — um operador que tomou 403 e virou a cabeça
 * fica sem nenhum rastro do motivo na tela. Mesma régua que a Etapa 35 aplicou à lista que não
 * carregou (RN-04).
 */
test('(o) excedente oferece a autorizacao, manda a flag, e o 403 do servidor aparece no painel', async () => {
  await renderizar();
  await clicar(linhaDe('REC-2026-058'));

  const input = inputConferida();
  expect(input).not.toBeNull();
  digitar(input, '250');
  await esperarEfeitos();

  expect(painel().textContent).toContain('Divergência: 50 a mais que o esperado (200)');
  expect(painel().textContent).toContain('Autorizo o recebimento acima do pedido');

  const caixa = caixaExcedente();
  expect(caixa).not.toBeUndefined();
  await clicar(caixa);
  await clicar(botaoPorTexto('Salvar Conferência'));

  expect(chamadasConferir(58)).toHaveLength(1);
  expect(api.put.mock.calls[0][1]).toEqual({
    itens: [{ id: 581, quantidade_recebida: 250, conferencia_quantidade: false }],
    autorizar_excedente: true,
  });

  // ── metade negativa: o servidor recusa, com a literal congelada na T3 ──────────────────────
  const LITERAL_403 = 'Autorizar recebimento acima do pedido exige a permissão '
    + '"autorizar_excedente" (seu perfil: ALMOXARIFE).';
  api.put.mockClear();
  api.put.mockImplementation(() => Promise.reject({ response: { data: { error: LITERAL_403 } } }));

  const input2 = inputConferida();
  expect(input2).not.toBeNull();       // âncora: o refetch do sucesso não desmontou o campo
  digitar(input2, '250');
  await esperarEfeitos();
  await clicar(caixaExcedente());
  await clicar(botaoPorTexto('Salvar Conferência'));

  expect(chamadasConferir(58)).toHaveLength(1);
  expect(painel()).not.toBeNull();
  expect(painel().textContent).toContain('Parafuso M8');      // o painel continua de pé
  expect(painel().textContent).toContain(LITERAL_403);
});

/* ── (p) campo LIMPO não pode virar zero ───────────────────────────────────────────────────────
 * `Number('')` é **0**, e o input nasce `value={item.quantidade_recebida ?? ''}`. Com um
 * `Number(...)` ingênuo, limpar o campo e salvar mandaria `quantidade_recebida: 0` — que o
 * servidor GRAVA (0 é menor que a esperada, não é excedente, responde 200) e que DISPARA o alerta
 * de divergência com "0 recebidos". É o dano novo que esta task poderia ter criado ao destravar a
 * rota.
 *
 * O par que faz "não digitei" ser diferente de "chegou zero" tem dois lados, e este cenário é o
 * lado do client: aqui o campo é OMITIDO do payload; no servidor, o `COALESCE` da T3 preserva a
 * coluna de quem não mandou o campo (antes dela, `quantidade_recebida = ?` e `observacoes = ?`
 * sobrescreviam com nulo — duas colunas apagadas, medido por sonda).
 *
 * `'quantidade_recebida' in payload` e não `toBeUndefined()`: a chave presente com `undefined`
 * viraria `null` no JSON e apagaria a coluna do mesmo jeito.
 *
 * ⚠️ Fix-round 1: o `toEqual` deste cenário mudou de `{ id: 581, conferencia_quantidade: false }`
 * para `{ id: 581 }`. O booleano segue a MESMA regra da quantidade — ver o cenário (q) logo
 * abaixo, que é a régua do achado.
 */
test('(p) campo limpo sai SEM a chave quantidade_recebida — nunca zero', async () => {
  await renderizar();
  await clicar(linhaDe('REC-2026-058'));

  const input = inputConferida();
  expect(input).not.toBeNull();
  digitar(input, '');
  await esperarEfeitos();
  expect(painel().textContent).not.toContain('Divergência:');   // campo vazio não é divergência

  await clicar(botaoPorTexto('Salvar Conferência'));

  expect(chamadasConferir(58)).toHaveLength(1);
  const payload = api.put.mock.calls[0][1];
  expect('quantidade_recebida' in payload.itens[0]).toBe(false);
  expect(payload).toEqual({ itens: [{ id: 581 }] });
});

/* ── (q) fix-round 1: o booleano da conferência NÃO pode desmarcar sozinho ─────────────────────
 * Achado da revisão da T5, e ele é do mesmo tipo do (p) — um dano NOVO que o primeiro chamador da
 * rota criava. `salvarConferencia` mandava `conferencia_quantidade` SEMPRE, com um booleano
 * concreto (`preenchida && recebida === esperada`), então o `COALESCE` que a T3 pôs na coluna
 * (`receiptService.js`, `conferirRecebimento`) estava MORTO para este chamador: ele só preserva o
 * valor gravado quando o cliente OMITE a chave (o serviço só converte para 0/1 quando o campo
 * `!= null`).
 *
 * O caminho do dano, com os dois lados: item conferido e marcado `true` num save; o operador
 * reabre o painel, limpa o campo "Qtd. conferida" DAQUELE item (ou nunca o digita) e clica em
 * "Salvar Conferência" para gravar a contagem de OUTRO item. O payload omitia
 * `quantidade_recebida` (o COALESCE preservava a quantidade, certo) e mandava
 * `conferencia_quantidade: false` — sobrescrevendo o `true` gravado. A conferência se desmarcava
 * sozinha, em silêncio, por causa de um save de outro item.
 *
 * A régua tem as DUAS metades no MESMO save, e é por isso que o 41 tem dois itens:
 * - item `412` (já `true`, campo vazio) → payload SEM as duas chaves;
 * - item `411` (campo preenchido, 50 de 50) → payload COM as duas chaves, o booleano computado.
 * Sem a metade positiva, omitir SEMPRE os dois campos passaria este cenário e quebraria a task
 * inteira em silêncio.
 */
test('(q) item ja conferido com campo vazio nao manda conferencia_quantidade — e o item preenchido manda as duas chaves', async () => {
  await renderizar();
  await clicar(linhaDe('REC-2026-041'));

  // O 41 tem dois campos de conferência; o do item 412 é o SEGUNDO.
  const campos = [...painel().querySelectorAll('[title="Qtd. conferida"]')];
  expect(campos).toHaveLength(2);
  digitar(campos[1], '');
  await esperarEfeitos();

  await clicar(botaoPorTexto('Salvar Conferência'));

  expect(chamadasConferir(41)).toHaveLength(1);
  const payload = api.put.mock.calls[0][1];

  const item412 = payload.itens.find((i) => i.id === 412);
  expect(item412).not.toBeUndefined();
  expect('conferencia_quantidade' in item412).toBe(false);
  expect('quantidade_recebida' in item412).toBe(false);
  expect(item412).toEqual({ id: 412 });

  // Metade POSITIVA, no mesmo save: quem tem o campo preenchido leva as duas chaves.
  const item411 = payload.itens.find((i) => i.id === 411);
  expect(item411).toEqual({ id: 411, quantidade_recebida: 50, conferencia_quantidade: true });
});

/* ── (r) revisão final, F2: o payload fiscal não pode ECOAR `tipo_recebimento` ─────────────────
 * Achado Alto da revisão da branch. `abrirDetalhe` carregava `tipo_recebimento` do registro para
 * dentro do `fiscalForm`, e `salvarFiscal` espalha o `fiscalForm` inteiro no `PUT /fiscal` — mas o
 * modal de NF **não tem controle nenhum** para esse campo (o `<select>` de tipo vive no modal de
 * *novo* recebimento, que usa outro estado, o `form`). Resultado: uma linha com
 * `tipo_recebimento` fora do enum da RN-11 — acervo gravado antes de o enum existir — ecoava o
 * valor inválido de volta e o Zod da rota respondia 400 em **toda** gravação fiscal, sem nenhum
 * campo na tela que o operador pudesse corrigir.
 *
 * A correção é aqui e não no servidor: o servidor está certo em recusar valor fora do enum, e
 * afrouxar o Zod desfaria a RN-11 inteira. Quem não edita um campo não o reenvia — o `COALESCE`
 * do `salvarDadosFiscal` preserva a coluna de quem não manda o campo.
 *
 * `'tipo_recebimento' in payload` e não `toBeUndefined()`: a chave presente com `undefined` sai
 * ausente do JSON, mas um `fiscalForm` que volte a carregar o campo entregaria a string de novo —
 * é a PRESENÇA da chave que esta régua proíbe.
 */
test('(r) o payload fiscal sai SEM tipo_recebimento, mesmo com valor legado no registro', async () => {
  await renderizar();
  await clicar(linhaDe('REC-2026-084'));
  expect(painel().textContent).toContain('REC-2026-084');

  await clicar(botaoPorTexto('Preencher Dados da NF'));
  const formFiscal = container.querySelector('.almox-modal form');
  expect(formFiscal).not.toBeNull();                       // âncora: o modal montou mesmo

  await act(async () => {
    formFiscal.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await esperarEfeitos();

  const chamadas = api.put.mock.calls.filter(([url]) => url === '/almoxarifado/recebimentos/84/fiscal');
  expect(chamadas).toHaveLength(1);
  const payload = chamadas[0][1];
  expect('tipo_recebimento' in payload).toBe(false);

  // Metade POSITIVA: o resto do formulário continua indo, com os valores carregados do registro —
  // sem isto, um payload vazio (ou um submit que nem disparou) passaria este cenário.
  expect(payload.nota_serie).toBe('3');
  expect(payload.nota_fiscal).toBe('NF-8400');
  expect(payload.valor_total_nota).toBe(2400);
  expect(payload.itens).toEqual([expect.objectContaining({ id: 841, quantidade_recebida: 120 })]);
});

/* ── (s) revisão final, R2: o caminho de recuperação do 400 — recusa, autorizo, salvo ──────────
 * O cenário (o) prova a caixa marcada ANTES do primeiro save. Este prova o caminho que o operador
 * real percorre: digita a contagem, salva, **toma 400**, lê na tela quem autoriza, marca a caixa e
 * salva de novo. As duas coisas que podiam quebrar aqui e que nenhum cenário anterior cobria:
 *
 * 1. a quantidade digitada tem de SOBREVIVER ao 400 — o `catch` não pode refazer o detalhe (o
 *    refetch zeraria o campo e o operador redigitaria a contagem inteira);
 * 2. o segundo `PUT` tem de levar `autorizar_excedente: true` **e a mesma quantidade** — uma
 *    tela que zerasse o `autorizarExcedente` no erro (como `abrirDetalhe` e `fecharDetalhe` fazem,
 *    de propósito, na TROCA de painel) mandaria o segundo save idêntico ao primeiro e o operador
 *    ficaria em loop de 400 sem nenhuma saída.
 */
test('(s) 400 de excedente, marcar a autorizacao e salvar de novo manda a flag com a MESMA quantidade', async () => {
  await renderizar();
  await clicar(linhaDe('REC-2026-058'));

  const LITERAL_400 = 'Quantidade recebida (250) maior que a esperada (200) no item #581 '
    + '— a autorização de excedente é de Compras ou do Administrador';
  api.put.mockImplementation(() => Promise.reject({ response: { data: { error: LITERAL_400 } } }));

  digitar(inputConferida(), '250');
  await esperarEfeitos();
  await clicar(botaoPorTexto('Salvar Conferência'));

  // A recusa ficou na tela, e o payload do primeiro save NÃO levou a flag.
  expect(chamadasConferir(58)).toHaveLength(1);
  expect(painel().textContent).toContain(LITERAL_400);
  expect('autorizar_excedente' in api.put.mock.calls[0][1]).toBe(false);
  // E a contagem digitada sobreviveu ao 400: sem isto o operador redigita tudo.
  expect(inputConferida().value).toBe('250');

  // Agora o gesto que a literal manda: alguém de Compras marca a autorização e salva de novo.
  api.put.mockImplementation(() => Promise.resolve({ data: { success: true } }));
  await clicar(caixaExcedente());
  await clicar(botaoPorTexto('Salvar Conferência'));

  const chamadas = chamadasConferir(58);
  expect(chamadas).toHaveLength(2);
  expect(chamadas[1][1]).toEqual({
    itens: [{ id: 581, quantidade_recebida: 250, conferencia_quantidade: false }],
    autorizar_excedente: true,
  });
  // O sucesso limpa a recusa da tela — senão o banner vermelho fica mentindo depois de salvar.
  expect(painel().textContent).not.toContain(LITERAL_400);
});

/* ── (t) revisão final, R7: a divergência não pode dizer "0" quando existe ─────────────────────
 * O aviso arredondava a diferença para DUAS casas (`Number(diff.toFixed(2))`), para não mostrar
 * `13.000000000000001`. Mas com `200.001` contra `200` esperados o mesmo arredondamento produzia
 * **"Divergência: 0 a mais que o esperado (200)"** — a tela afirmando que a diferença é zero
 * enquanto o servidor, que compara os números crus, barra o save com 400 de excedente. O operador
 * lia "0 a mais" e não tinha o que corrigir.
 *
 * Régua: abaixo de meio centésimo, o aviso mostra até QUATRO casas. O formato é o número cru do
 * JS (ponto decimal), igual ao resto deste aviso — congelado aqui.
 */
test('(t) diferenca que arredonda para zero a duas casas aparece com 4 casas, nunca como "0"', async () => {
  await renderizar();
  await clicar(linhaDe('REC-2026-058'));

  digitar(inputConferida(), '200.001');
  await esperarEfeitos();

  expect(painel().textContent).toContain('Divergência: 0.001 a mais que o esperado (200)');
  expect(painel().textContent).not.toContain('Divergência: 0 a mais');
  // Metade POSITIVA: a diferença NORMAL continua em duas casas, sem cauda binária — sem isto,
  // "sempre 4 casas" passaria este cenário e encheria o aviso de zeros.
  digitar(inputConferida(), '187');
  await esperarEfeitos();
  expect(painel().textContent).toContain('Divergência: 13 a menos que o esperado (200)');
});

/* ── (u) RN-26: escolher o pedido CARREGA os itens, e o payload leva a linha do pedido ─────────
 * O defeito que esta task paga: `selecionarPedido` limpava `itens: []` e `handleCriar` mandava a
 * lista VAZIA no caminho `PEDIDO_COMPRA` — o servidor então preenchia os itens com o saldo INTEIRO
 * do pedido, e o gesto "chegaram 6 dos 10" não existia na tela. O manual 14.1 promete o contrário
 * ("o sistema traz os itens, as quantidades e os valores unitários já preenchidos").
 *
 * As três metades positivas do cenário, cada uma matando um jeito de ele ficar verde vazio:
 * - as OPÇÕES do `<select>` conferidas contra a fixture (sem isso o `change` não dispara e o
 *   cenário mede um select vazio);
 * - `Saldo pendente: 10` no DOM (sem isso, "renderizou sem erro" passaria com o modal em branco);
 * - o payload lido de `api.post.mock.calls[0][1]` com a chamada CONTADA — `toHaveBeenCalledWith`
 *   solto é satisfeito por 1, 2 ou 10 chamadas.
 *
 * O payload NÃO leva `quantidade_esperada`: a esperada nasce do SALDO, no servidor (contrato 1 da
 * etapa). Mandá-la daqui desligaria em silêncio a barreira da Etapa 36, que compara a contagem do
 * `/conferir` com a esperada GRAVADA.
 */
test('(u) escolher o pedido carrega os itens com o saldo e o payload leva pedido_item_id — nunca itens vazio', async () => {
  await renderizar();
  await clicar(botaoPorTexto('Novo Recebimento'));
  await selecionar(selectPorLabel('Forma de recebimento'), 'PEDIDO_COMPRA');

  const selPedido = selectPorLabel('Número do Pedido de Compra');
  expect(selPedido).not.toBeUndefined();
  expect([...selPedido.options].map((o) => o.value)).toEqual(['', '312', '313', '314']);
  await selecionar(selPedido, '312');

  // UMA chamada à rota de itens, e com o id DO PEDIDO escolhido.
  expect(chamadasItensPedido(312)).toHaveLength(1);
  expect(chamadasItensPedido(313)).toHaveLength(0);

  expect(modalNovo().textContent).toContain('Itens do pedido');
  expect(modalNovo().textContent).toContain('Parafuso M8');
  expect(modalNovo().textContent).toContain('ALM-0100');
  expect(modalNovo().textContent).toContain('Saldo pendente: 10');
  expect(modalNovo().textContent).not.toContain('Este pedido já foi recebido por completo.');

  const input = inputQtdPedido(9312);
  expect(input).not.toBeNull();
  expect(input.value).toBe('10');            // a quantidade nasce igual ao saldo, e é EDITÁVEL

  // FRONTEIRA: receber o saldo INTEIRO não é excedente. Com `>=` no lugar de `>` no aviso, o caso
  // MAIS COMUM da tela (chegou tudo) nasceria acusado de estar acima do pedido, e a caixa de
  // autorização apareceria por reflexo — é a única asserção que prende o comparador, porque
  // `recebida >= saldo` só difere de `recebida > saldo` na IGUALDADE.
  expect(modalNovo().textContent).not.toContain('Acima do saldo:');
  expect(caixaExcedenteModal()).toBeUndefined();

  digitar(input, '6');
  await esperarEfeitos();

  await submeterModal();

  expect(chamadasCriar()).toHaveLength(1);
  const payload = api.post.mock.calls[0][1];
  expect(payload.tipo_recebimento).toBe('PEDIDO_COMPRA');
  expect(payload.pedido_compra_id).toBe('312');
  expect(payload.itens).toEqual([
    { material_id: 9, pedido_item_id: 9312, quantidade: 6, quantidade_recebida: 6 },
  ]);
});

/* ── (v) RN-26: o aviso de excedente do PEDIDO, e o teto é o saldo POR MATERIAL ────────────────
 * A literal usa palavras DIFERENTES do painel da Etapa 36 (`Acima do saldo:` em vez de
 * `Divergência:`) de propósito: são duas medidas distintas — saldo do pedido de compra × esperada
 * gravada no item —, e reusar a frase faria o operador ler a mesma coisa para dois fatos
 * diferentes.
 *
 * O teto é `saldo_pendente_material` (fix 1 da T4), que é o MESMO número que
 * `assertSaldoDoPedidoPermitido` compara. O client não soma as linhas para chegar nele: isso seria
 * uma segunda definição de saldo, do lado que não decide.
 *
 * `Number('')` é ZERO, e aí está a terceira metade: campo LIMPO não é "chegou zero", é "não
 * digitei". A linha sai do payload, e um payload de pedido sem NENHUMA linha informada é RECUSADO
 * antes do POST — mandá-lo vazio é exatamente o defeito que esta task paga (o servidor preencheria
 * o saldo inteiro).
 */
test('(v) acima do saldo do material mostra o aviso e a caixa; bater com o saldo apaga o aviso; campo limpo nao vira zero', async () => {
  await renderizar();
  await escolherPedido(312);

  const input = inputQtdPedido(9312);
  digitar(input, '12');
  await esperarEfeitos();

  expect(modalNovo().textContent).toContain('Acima do saldo: 2 a mais que o saldo do pedido (10)');
  expect(modalNovo().textContent).toContain('Autorizo o recebimento acima do pedido');
  expect(modalNovo().textContent).not.toContain('Divergência:');
  expect(caixaExcedenteModal()).not.toBeUndefined();

  // ── metade POSITIVA: dentro do saldo, nem aviso nem caixa — e o saldo continua na tela ──────
  digitar(inputQtdPedido(9312), '6');
  await esperarEfeitos();
  expect(modalNovo().textContent).not.toContain('Acima do saldo:');
  expect(modalNovo().textContent).toContain('Saldo pendente: 10');
  expect(caixaExcedenteModal()).toBeUndefined();

  // ── campo LIMPO: nenhum aviso, e NADA é enviado (nunca `quantidade_recebida: 0`) ────────────
  digitar(inputQtdPedido(9312), '');
  await esperarEfeitos();
  expect(modalNovo().textContent).not.toContain('Acima do saldo:');
  await submeterModal();
  expect(chamadasCriar()).toHaveLength(0);
  expect(modalNovo()).not.toBeNull();        // o modal fica de pé para o operador digitar

  // ── metade POSITIVA do excedente: marcada a caixa, a FLAG viaja com a quantidade digitada ───
  digitar(inputQtdPedido(9312), '12');
  await esperarEfeitos();
  await clicar(caixaExcedenteModal());
  await submeterModal();

  expect(chamadasCriar()).toHaveLength(1);
  const payload = api.post.mock.calls[0][1];
  expect(payload.autorizar_excedente).toBe(true);
  expect(payload.itens).toEqual([
    { material_id: 9, pedido_item_id: 9312, quantidade: 12, quantidade_recebida: 12 },
  ]);
});

/* ── (w) a recusa do SERVIDOR fica no DOM, e o pedido quitado avisa em vez de oferecer itens ───
 * Quem decide é o backend: `pode('autorizar_excedente')` esconde a caixa por conveniência de
 * interface e o hook FALHA ABERTO de propósito. Então a régua real desta tela são as duas recusas
 * da porta, e as duas dizem QUEM resolve — num toast de cinco segundos elas não chegam a ser
 * lidas, e o operador fica com "não salvou" e nenhum motivo.
 *
 * E o formulário NÃO pode ser limpo no `catch`: quem tomou 403 não pode perder o que digitou —
 * ele precisa levar o número exato a quem autoriza.
 *
 * A terceira metade é o pedido QUITADO: a rota devolve `200 []` (não é erro), e a tela diz o que
 * houve em vez de mostrar um bloco de itens vazio que pareceria "pedido sem material cadastrado".
 * Ele continua no `<select>` porque a lista foi carregada na montagem da tela — `?pendentes=1`
 * filtra no servidor, no momento da carga, não no momento do clique.
 */
test('(w) 400 e 403 do servidor aparecem no modal com role=alert sem limpar o formulario; pedido quitado avisa', async () => {
  const LITERAL_400 = 'Quantidade recebida (12) maior que o saldo do pedido (10) para o material '
    + 'ALM-0100 — a autorização de excedente é de Compras ou do Administrador';
  const LITERAL_403 = 'Autorizar recebimento acima do pedido exige a permissão '
    + '"autorizar_excedente" (seu perfil: ALMOXARIFE).';

  await renderizar();
  const selPedido = await escolherPedido(312);

  digitar(inputQtdPedido(9312), '12');
  await esperarEfeitos();

  api.post.mockImplementation(() => Promise.reject({ response: { data: { error: LITERAL_400 } } }));
  await submeterModal();

  expect(chamadasCriar()).toHaveLength(1);
  const alerta400 = modalNovo().querySelector('[role="alert"]');
  expect(alerta400).not.toBeNull();
  expect(alerta400.textContent).toContain(LITERAL_400);
  // O modal continua de pé, COM o que foi digitado e com o saldo à vista.
  expect(inputQtdPedido(9312).value).toBe('12');
  expect(modalNovo().textContent).toContain('Saldo pendente: 10');

  // ── marcar a caixa NÃO vence o backend: o 403 é dele, e chega ao DOM do mesmo jeito ──────────
  api.post.mockImplementation(() => Promise.reject({ response: { data: { error: LITERAL_403 } } }));
  await clicar(caixaExcedenteModal());
  await submeterModal();

  expect(chamadasCriar()).toHaveLength(2);
  expect(api.post.mock.calls[1][1].autorizar_excedente).toBe(true);
  expect(modalNovo().querySelector('[role="alert"]').textContent).toContain(LITERAL_403);
  expect(inputQtdPedido(9312).value).toBe('12');

  // ── pedido QUITADO: `200 []` vira aviso, não bloco vazio; e a recusa do outro pedido sai ────
  await selecionar(selPedido, '313');

  expect(chamadasItensPedido(313)).toHaveLength(1);
  expect(modalNovo().textContent).toContain('Este pedido já foi recebido por completo.');
  expect(modalNovo().textContent).not.toContain('Saldo pendente:');
  expect(inputQtdPedido(9312)).toBeNull();
  expect(modalNovo().querySelector('[role="alert"]')).toBeNull();

  await submeterModal();
  expect(chamadasCriar()).toHaveLength(2);   // nada é enviado para um pedido sem saldo

  // ── o TETO é o saldo AGREGADO POR MATERIAL, nunca o da linha (fix 1 da T4) ──────────────────
  // A linha B do pedido 314 tem `saldo_pendente: 10` e `saldo_pendente_material: 5`. Usar o saldo
  // da LINHA faria a tela prometer 10, o operador digitar 10 e a porta recusar com
  // "maior que o saldo do pedido (5)" — sem nenhum aviso antes, que é exatamente o furo que o
  // fix 1 fechou do lado da leitura. Esta é a única asserção que distingue os dois campos.
  await selecionar(selPedido, '314');

  expect(chamadasItensPedido(314)).toHaveLength(1);
  expect(modalNovo().textContent).toContain('Saldo pendente: 10');  // o saldo DA LINHA é exibido
  expect(inputQtdPedido(9314).value).toBe('5');                     // o campo nasce no TETO
  expect(modalNovo().textContent).not.toContain('Acima do saldo:');

  digitar(inputQtdPedido(9314), '10');
  await esperarEfeitos();
  expect(modalNovo().textContent).toContain('Acima do saldo: 5 a mais que o saldo do pedido (5)');
});
