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
];

const DETALHES = {
  41: {
    ...RECEBIMENTOS[0], fornecedor_cnpj: '11.111.111/0001-11', valor_total_nota: 1500,
    chave_nfe: null, nota_serie: '1', observacoes: null, contas_pagar_id: null,
    itens: [{
      id: 411, material_id: 5, material_nome: 'Chapa Aço 3mm', material_codigo: 'ALM-0033',
      unidade: 'KG', quantidade_esperada: 50, quantidade_recebida: 50,
    }],
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
    if (url === '/almoxarifado/recebimentos-aux/pedidos-compra') return Promise.resolve({ data: [] });
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
  expect(payload).toEqual({ itens: [{ id: 581, conferencia_quantidade: false }] });
});
