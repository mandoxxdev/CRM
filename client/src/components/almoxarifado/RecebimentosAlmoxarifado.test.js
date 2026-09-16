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
// + evento `input`, que é o que o React ouve (molde `RequisicoesList.test.js:214-220`).
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
