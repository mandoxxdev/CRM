/**
 * Selo de propriedade na tela de Materiais (Etapa 8, Task 9).
 *
 * A Etapa 8 unificou material de cliente e material proprio na MESMA tabela e nas MESMAS telas
 * (classe C da auditoria da Task 1: o catalogo operacional mistura de proposito, porque a chapa
 * do cliente ocupa prateleira, e movimentada e etiquetada como qualquer outra). Sem identificacao
 * visual, a chapa do Cliente X e a nossa ficam indistinguiveis na listagem — a unificacao CRIA a
 * confusao que a spec 13 mandava evitar ("identificacao visual de propriedade em todas as
 * listagens que misturam materiais").
 *
 * As duas metades do teste sao obrigatorias: exigir so a PRESENCA do selo na linha do cliente
 * seria aprovado por uma implementacao que pinta o selo em toda linha — que nao identifica nada.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MateriaisAlmoxarifado --watchAll=false
 */
import React, { act } from 'react';
import fs from 'fs';
import path from 'path';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MateriaisAlmoxarifado from './MateriaisAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// Permissões liberadas POR PADRÃO: o alvo da maior parte deste arquivo é o que a tela mostra, e o
// gate real é do servidor. Mas a Etapa 30 (Task 2) precisa da metade NEGATIVA — `bloquearSeNaoPode`
// devolvendo `false` — para provar que a ação de plano de inspeção é barrada antes do modal. Por
// isso a fábrica deixou de devolver `() => true` fixo e passou a delegar numa variável trocável
// por teste (o prefixo `mock` é o que o hoist do jest permite referenciar de dentro da fábrica).
let mockBloquearSeNaoPode = jest.fn(() => true);
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true,
    bloquearSeNaoPode: (...args) => mockBloquearSeNaoPode(...args), loading: false,
  }),
}));

// Etapa 30, Task 2 — o modal é escrito em paralelo (Task 1). O stub abaixo torna este teste
// independente da implementação dele e ainda deixa a prop recebida à vista: o contrato C5 do plano
// diz que a prop é o OBJETO `material` (código, nome e unidade vão para o cabeçalho do modal), e
// não o `materialId` escalar dos outros seis modais desta base.
const mockPlanoMateriaisRecebidos = [];
jest.mock('./PlanoInspecaoModal', () => ({
  __esModule: true,
  default: (props) => {
    const ReactStub = require('react');
    mockPlanoMateriaisRecebidos.push(props.material);
    return ReactStub.createElement(
      'div',
      { 'data-testid': 'plano-inspecao-modal' },
      props.material ? String(props.material.codigo) : 'sem material',
    );
  },
}), { virtual: true });

const MATERIAL_NOSSO = {
  id: 1, codigo: 'CHP-001', nome: 'Chapa 3mm nossa', categoria: 'Chapas', unidade: 'PC',
  quantidade_atual: 50, quantidade_minima: 10, quantidade_maxima: 100,
  proprietario_cliente_id: null, proprietario_cliente_nome: null,
};
const MATERIAL_CLIENTE = {
  id: 2, codigo: 'CHP-002', nome: 'Chapa 3mm do cliente', categoria: 'Chapas', unidade: 'PC',
  quantidade_atual: 50, quantidade_minima: 10, quantidade_maxima: 100,
  proprietario_cliente_id: 7, proprietario_cliente_nome: 'Cliente Alfa LTDA',
};
// O servidor devolve `proprietario_cliente_id` desde a Task 1 (o SELECT e `m.*`), mas o nome do
// dono depende de um LEFT JOIN em clientes. Enquanto esse JOIN nao existir na rota da lista, o
// selo tem de continuar identificando a propriedade — um selo vazio seria a mesma falha muda que
// o badge sem classe CSS.
const MATERIAL_CLIENTE_SEM_NOME = {
  id: 3, codigo: 'CHP-003', nome: 'Chapa 3mm sem nome de dono', categoria: 'Chapas', unidade: 'PC',
  quantidade_atual: 50, quantidade_minima: 10, quantidade_maxima: 100,
  proprietario_cliente_id: 9,
};

// Etapa 26 — o catálogo do cliente (GET /almoxarifado/categorias), que substitui a 3ª cópia da
// lista hardcoded (a que o design da Fase 0 tinha deixado de fora da varredura).
const CATALOGO = [
  { id: 1, nome: 'Aço carbono', parent_id: null, ativo: 1 },
  { id: 2, nome: 'Chapas', parent_id: null, ativo: 1 },
  { id: 3, nome: 'Ferramentas', parent_id: null, ativo: 1 },
];

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockBloquearSeNaoPode = jest.fn(() => true);
  mockPlanoMateriaisRecebidos.length = 0;
  // Implementações aqui, não na fábrica do jest.mock: clearAllMocks apaga implementações e só o
  // primeiro teste teria dados.
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais') {
      return Promise.resolve({ data: [MATERIAL_NOSSO, MATERIAL_CLIENTE, MATERIAL_CLIENTE_SEM_NOME] });
    }
    if (url === '/almoxarifado/categorias') return Promise.resolve({ data: CATALOGO });
    return Promise.resolve({ data: [] });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

// A busca de materiais é debounced em 300ms (useEffect com setTimeout); sem avançar o relógio a
// tabela ainda está no skeleton e o teste leria zero linhas — passando por vazio.
async function renderizar() {
  await act(async () => {
    root.render(<MemoryRouter><MateriaisAlmoxarifado /></MemoryRouter>);
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 350)); });
}

const linhaDe = (codigo) => [...container.querySelectorAll('tbody tr')]
  .find((tr) => tr.textContent.includes(codigo));

describe('MateriaisAlmoxarifado — selo de propriedade', () => {
  test('material de cliente mostra o selo com a razão social', async () => {
    await renderizar();
    const linhaCliente = linhaDe('CHP-002');
    expect(linhaCliente).toBeDefined();
    const selo = linhaCliente.querySelector('.almox-badge-cliente');
    expect(selo).not.toBeNull();
    expect(selo.textContent).toContain('Cliente Alfa LTDA');
  });

  test('[controle positivo] material nosso NÃO mostra selo nenhum', async () => {
    // Sem esta metade, um selo pintado em TODA linha passaria como se identificasse propriedade.
    await renderizar();
    const linhaNossa = linhaDe('CHP-001');
    expect(linhaNossa).toBeDefined();
    expect(linhaNossa.querySelector('.almox-badge-cliente')).toBeNull();
    // Nem o `0`/`null` vazado por um `{m.proprietario_cliente_id && ...}` escrito solto.
    expect(linhaNossa.textContent).not.toContain('cliente');
  });

  test('o selo diz a consequência prática no title, não só o nome do dono', async () => {
    await renderizar();
    const selo = linhaDe('CHP-002').querySelector('.almox-badge-cliente');
    expect(selo.getAttribute('title')).toContain('Cliente Alfa LTDA');
    expect(selo.getAttribute('title')).toMatch(/OS ou projeto/);
  });

  test('material de cliente sem o nome do dono na resposta ainda é identificado', async () => {
    await renderizar();
    const selo = linhaDe('CHP-003').querySelector('.almox-badge-cliente');
    expect(selo).not.toBeNull();
    expect(selo.textContent.trim().length).toBeGreaterThan(0);
  });

  test('a classe .almox-badge-cliente existe no CSS (badge sem cor já foi entregue nesta base)', () => {
    // O template `almox-badge-${cls}` não acha a classe, o navegador não reclama e nenhum teste
    // de comportamento pega — foi exatamente assim que a Etapa 7 entregou um badge invisível.
    // Este é o único teste da suíte que olha estilo, e existe por causa daquele precedente.
    const css = fs.readFileSync(path.join(__dirname, 'Almoxarifado.css'), 'utf8');
    const regra = css.match(/\.almox-badge-cliente\s*\{[^}]*\}/);
    expect(regra).not.toBeNull();
    expect(regra[0]).toMatch(/color\s*:/);
    expect(regra[0]).toMatch(/background\s*:/);
  });
});

/**
 * Etapa 26, Task 2 — RN-01 nesta tela. Este arquivo é a 3ª cópia da lista hardcoded, a que a
 * varredura da Fase 0 tinha deixado de fora (achado A1). O filtro é o caso mais visível de
 * lista errada: nenhum material da GMP tem `EPI`, então filtrar por `EPI` devolvia zero linhas
 * — e "zero linhas" parece estoque vazio, não filtro inútil.
 *
 * As metades andam juntas: o mock termina em `{ data: [] }` como catch-all, então "não tem
 * CONSUMÍVEL" sozinho seria satisfeito por um select sem nenhuma opção.
 */
const filtroCategoria = () => [...container.querySelectorAll('.almox-filters select')]
  .find((s) => s.querySelector('option')?.textContent.trim() === 'Todas categorias');

function escolher(el, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('MateriaisAlmoxarifado — RN-01: o filtro de categoria vem do catálogo', () => {
  test('as opções são as do endpoint, e a lista hardcoded sumiu', async () => {
    await renderizar();
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/categorias');
    const opcoes = [...filtroCategoria().querySelectorAll('option')].map((o) => o.textContent.trim());
    expect(opcoes).toContain('Aço carbono');
    expect(opcoes).toContain('Chapas');
    expect(opcoes).toContain('Ferramentas');
    expect(opcoes).not.toContain('CONSUMÍVEL');
    expect(opcoes).not.toContain('EPI');
    expect(opcoes[0]).toBe('Todas categorias');
  });

  test('trocar o catálogo do mock troca as opções — não é constante do front', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL_NOSSO] });
      if (url === '/almoxarifado/categorias') return Promise.resolve({ data: [{ id: 9, nome: 'Rolamentos', ativo: 1 }] });
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    const opcoes = [...filtroCategoria().querySelectorAll('option')].map((o) => o.textContent.trim());
    expect(opcoes).toContain('Rolamentos');
    expect(opcoes).not.toContain('Aço carbono');
  });

  test('escolher uma categoria manda o filtro para o servidor', async () => {
    await renderizar();
    escolher(filtroCategoria(), 'Chapas');
    await act(async () => { await new Promise((r) => setTimeout(r, 350)); });
    const chamadas = api.get.mock.calls.filter((c) => c[0] === '/almoxarifado/materiais');
    expect(chamadas[chamadas.length - 1][1]).toEqual({ params: { categoria: 'Chapas' } });
  });
});

/**
 * Etapa 30, Task 2 — RN-01: a ação *Plano de inspeção* na lista de Materiais.
 *
 * Antes desta etapa o plano de inspeção só nascia por `curl`: o CRUD existe desde a Etapa 27 e a
 * Etapa 29 entregou o bloco *Medidas do plano*, mas sem tela de cadastro esse bloco não aparecia
 * para ninguém. Esta é a porta de entrada.
 *
 * Duas linhas de materiais DIFERENTES na fixture não são detalhe: com uma linha só, uma
 * implementação que passasse um material fixo (o primeiro da lista, uma variável de fora do
 * `map`) passaria idêntica.
 */
const clicar = (el) => act(() => {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});

const botaoPlano = (codigo) => linhaDe(codigo)?.querySelector('button[title="Plano de inspeção"]');

describe('MateriaisAlmoxarifado — RN-01: a ação Plano de inspeção', () => {
  test('o botão aparece em toda linha e abre o modal DO material daquela linha', async () => {
    await renderizar();
    expect(botaoPlano('CHP-001')).not.toBeNull();
    expect(botaoPlano('CHP-002')).not.toBeNull();
    expect(botaoPlano('CHP-003')).not.toBeNull();

    // Fechado, o modal não está montado.
    expect(container.querySelector('[data-testid="plano-inspecao-modal"]')).toBeNull();

    clicar(botaoPlano('CHP-002'));

    const modal = container.querySelector('[data-testid="plano-inspecao-modal"]');
    expect(modal).not.toBeNull();
    // O contrato C5 é o OBJETO material, não o id escalar — e tem de ser o da linha clicada.
    const recebido = mockPlanoMateriaisRecebidos[mockPlanoMateriaisRecebidos.length - 1];
    expect(recebido).toBeTruthy();
    expect(recebido.id).toBe(MATERIAL_CLIENTE.id);
    expect(recebido.codigo).toBe('CHP-002');
    expect(recebido.nome).toBe(MATERIAL_CLIENTE.nome);
    expect(recebido.unidade).toBe(MATERIAL_CLIENTE.unidade);
    expect(modal.textContent).toContain('CHP-002');
    expect(modal.textContent).not.toContain('CHP-001');
  });

  test('clicar noutra linha abre o modal daquele outro material', async () => {
    // O par do cenário acima: sem ele, `material={materiais[1]}` cravado passaria.
    await renderizar();
    clicar(botaoPlano('CHP-001'));
    const recebido = mockPlanoMateriaisRecebidos[mockPlanoMateriaisRecebidos.length - 1];
    expect(recebido.id).toBe(MATERIAL_NOSSO.id);
    expect(recebido.codigo).toBe('CHP-001');
    expect(container.querySelector('[data-testid="plano-inspecao-modal"]').textContent)
      .toContain('CHP-001');
  });

  test('sem gerenciar_plano_inspecao o modal NÃO abre — e o botão continua lá, barrado pelo gate', async () => {
    // Global Constraint 9: a metade positiva anda no mesmo teste. "O modal não abre" passaria
    // igual com o botão ausente, com o `onClick` vazio ou com a permissão errada no gate.
    mockBloquearSeNaoPode = jest.fn(() => false);
    await renderizar();

    const botao = botaoPlano('CHP-002');
    expect(botao).not.toBeNull();

    clicar(botao);

    expect(mockBloquearSeNaoPode).toHaveBeenCalledWith('gerenciar_plano_inspecao', expect.anything());
    expect(container.querySelector('[data-testid="plano-inspecao-modal"]')).toBeNull();
    expect(mockPlanoMateriaisRecebidos).toHaveLength(0);
  });
});

describe('MateriaisAlmoxarifado — anexos do material (Etapa 34)', () => {
  const URL_ANEXOS = '/almoxarifado/anexos';
  const chamadasDeAnexo = () => api.get.mock.calls.filter(([u]) => u === URL_ANEXOS);
  const abrirAnexos = async (id) => {
    await act(async () => {
      container.querySelector(`[data-testid="anexos-material-${id}"]`)
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  // O TERCEIRO material, nunca o primeiro. `entidade_id: 1` e indistinguivel de tres defeitos
  // diferentes — `entidadeId={materiais[0].id}`, `entidadeId={1}` literal, e estado obsoleto que
  // reabre sempre o primeiro. Em producao isso e o usuario clicar o clipe da terceira linha e
  // receber os anexos do primeiro material, sem 400 e sem erro nenhum.
  test('o clipe abre o modal de anexos DO material da linha — e nao do primeiro', async () => {
    await renderizar();
    const clipe = container.querySelector('[data-testid="anexos-material-3"]');
    expect(clipe).not.toBeNull();

    await abrirAnexos(3);

    expect(container.querySelector('[data-testid="anexos-modal"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="anexos-documento"]')).not.toBeNull();
    expect(api.get).toHaveBeenCalledWith(URL_ANEXOS,
      { params: { entidade: 'material', entidade_id: 3 } });
    // RN-02: "uma requisicao". `toHaveBeenCalledWith` sozinho aceitaria dez, e esta tela
    // re-renderiza a lista a cada 300ms de debounce da busca.
    expect(chamadasDeAnexo()).toHaveLength(1);
  });

  test('reabrir em outra linha consulta a linha nova, nao a anterior', async () => {
    await renderizar();
    await abrirAnexos(1);
    await act(async () => {
      container.querySelector('.almox-modal-close')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await abrirAnexos(3);
    const chamadas = chamadasDeAnexo();
    expect(chamadas[chamadas.length - 1][1].params.entidade_id).toBe(3);
  });

  // RN-02, negativo COM a metade positiva no mesmo teste: sozinho, o negativo passaria com a
  // tabela vazia. O `querySelector(...).dispatchEvent` lanca se a linha nao renderizou.
  test('a lista sozinha nao consulta anexos; so o clique consulta', async () => {
    await renderizar();
    expect(chamadasDeAnexo()).toHaveLength(0);
    await abrirAnexos(3);
    expect(chamadasDeAnexo()).toHaveLength(1);
  });

  // O botao NAO passa por `bloquearSeNaoPode` — e a decisao da Fase 0, e sem cenario ela seria
  // "corrigida" pelo proximo que passasse aqui e visse os seis vizinhos gateados.
  test('o clipe nao e gateado por permissao de edicao', async () => {
    await renderizar();
    await abrirAnexos(3);
    expect(mockBloquearSeNaoPode).not.toHaveBeenCalledWith('editar_material', expect.anything());
    expect(mockBloquearSeNaoPode).not.toHaveBeenCalledWith('anexar_documento', expect.anything());
    expect(container.querySelector('[data-testid="anexos-modal"]')).not.toBeNull();
  });
});

/**
 * Etapa 37 (RN-37.06) — o filtro de família lista a ÁRVORE (raiz; "— sub" indentada) e, ao
 * escolher uma subfamília, manda `subfamilia_id` (+ `familia_id` da raiz) para o servidor.
 *
 * Até aqui o <select> listava raízes e subs misturadas e mandava `familia_id=<sub>` — e o
 * material grava `familia_id` = raiz, então escolher uma subfamília devolvia ZERO linhas, que
 * parece estoque vazio. Os params são derivados de `familias.find(...)` na hora da busca, sem
 * state novo (o reset de "Limpar filtros" e a condição que o mostra continuam valendo).
 */
const RAIZ_ROL = { id: 1, codigo: 'ROL', nome: 'Rolamentos', parent_id: null, ativo: 1, qtd_itens: 3 };
const SUB_ESF = { id: 3, codigo: 'ROL-ESF', nome: 'Esferas', parent_id: 1, ativo: 1, qtd_itens: 2 };
const RAIZ_PAR = { id: 2, codigo: 'PAR', nome: 'Parafusos', parent_id: null, ativo: 1, qtd_itens: 0 };

const filtroFamilia = () => [...container.querySelectorAll('.almox-filters select')]
  .find((s) => s.querySelector('option')?.textContent.trim() === 'Todas famílias');
const ultimaBusca = () => {
  const chamadas = api.get.mock.calls.filter((c) => c[0] === '/almoxarifado/materiais');
  return chamadas[chamadas.length - 1][1];
};
const aguardarDebounce = () => act(async () => { await new Promise((r) => setTimeout(r, 350)); });

describe('MateriaisAlmoxarifado — RN-37.06: filtrar por subfamília', () => {
  beforeEach(() => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL_NOSSO] });
      if (url === '/almoxarifado/categorias') return Promise.resolve({ data: CATALOGO });
      if (url === '/almoxarifado/familias') return Promise.resolve({ data: [SUB_ESF, RAIZ_PAR, RAIZ_ROL] });
      return Promise.resolve({ data: [] });
    });
  });

  test('o select lista a árvore: raiz, depois as subs dela como "— ⟨código⟩ ⟨nome⟩"', async () => {
    await renderizar();
    const opcoes = [...filtroFamilia().querySelectorAll('option')].map((o) => o.textContent.trim());
    expect(opcoes[0]).toBe('Todas famílias');
    // Raízes por nome (Parafusos antes de Rolamentos), a sub logo depois da raiz dela.
    expect(opcoes.slice(1)).toEqual(['PAR — Parafusos', 'ROL — Rolamentos', '— ROL-ESF Esferas']);
  });

  test('escolher a sub manda familia_id da raiz E subfamilia_id da sub; limpar tira as duas chaves', async () => {
    await renderizar();
    escolher(filtroFamilia(), '3');
    await aguardarDebounce();
    expect(ultimaBusca()).toEqual({ params: { familia_id: 1, subfamilia_id: 3 } });

    const limpar = [...container.querySelectorAll('button')].find((b) => /Limpar filtros/.test(b.textContent));
    expect(limpar).toBeDefined();
    clicar(limpar);
    await aguardarDebounce();
    expect(ultimaBusca()).toEqual({ params: {} });
    expect(ultimaBusca().params).not.toHaveProperty('familia_id');
    expect(ultimaBusca().params).not.toHaveProperty('subfamilia_id');
  });

  test('[controle] escolher a raiz continua mandando só familia_id', async () => {
    await renderizar();
    escolher(filtroFamilia(), '1');
    await aguardarDebounce();
    const { params } = ultimaBusca();
    expect(String(params.familia_id)).toBe('1');
    expect(params).not.toHaveProperty('subfamilia_id');
  });
});

/**
 * Etapa 38 (RN-38.05 — G11 da Etapa 37). A ressalva aceita na 37 era: `?familia_id=<sub>` na URL
 * ANTES de `familias` chegar manda só `familia_id=<sub>` (zero linhas até mexer no filtro). O
 * motivo é o closure: o `setTimeout(loadMateriais, 300)` guarda a função da render em que o
 * efeito rodou, com `familias = []`; a lista chegar depois não reagenda nada porque `familias`
 * não estava nas dependências. Com `familias` nas deps, a chegada da lista reagenda a busca e a
 * última chamada já vai com `{ familia_id: raiz, subfamilia_id: sub }`.
 *
 * O mock das famílias responde com ATRASO (50ms) de propósito: com resposta imediata o cenário
 * ainda falha (o closure é da primeira render), mas o atraso é o que acontece na rede e deixa a
 * corrida explícita.
 */
describe('MateriaisAlmoxarifado — RN-38.05: ?familia_id=<sub> na URL rebusca quando as famílias chegam', () => {
  beforeEach(() => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL_NOSSO] });
      if (url === '/almoxarifado/categorias') return Promise.resolve({ data: CATALOGO });
      if (url === '/almoxarifado/familias') {
        return new Promise((resolve) => setTimeout(() => resolve({ data: [SUB_ESF, RAIZ_PAR, RAIZ_ROL] }), 50));
      }
      return Promise.resolve({ data: [] });
    });
  });

  async function renderizarComUrl(query) {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/almoxarifado/materiais${query}`]}>
          <MateriaisAlmoxarifado />
        </MemoryRouter>,
      );
    });
    // Dois `act` de propósito: dentro de um `act` o React enfileira os updates e só os aplica no
    // fim dele — num `act` único de 700ms a chegada das famílias seria renderizada tarde demais
    // para reagendar o debounce antes da asserção. O primeiro deixa as famílias chegarem (50ms) e
    // aplica a render; o segundo cobre o debounce reagendado (300ms) com folga.
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
  }

  test('a última busca leva familia_id da raiz E subfamilia_id da sub, sem mexer no filtro', async () => {
    await renderizarComUrl('?familia_id=3');
    expect(filtroFamilia().value).toBe('3');
    expect(ultimaBusca()).toEqual({ params: { familia_id: 1, subfamilia_id: 3 } });
  });

  test('[controle] ?familia_id=<raiz> continua mandando só familia_id', async () => {
    await renderizarComUrl('?familia_id=1');
    const { params } = ultimaBusca();
    expect(String(params.familia_id)).toBe('1');
    expect(params).not.toHaveProperty('subfamilia_id');
  });
});
