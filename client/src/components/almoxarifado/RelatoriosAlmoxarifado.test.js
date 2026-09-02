/**
 * Etapa 13, Task 3 — tela "/almoxarifado/relatorios" contra o contrato HTTP CONGELADO (RN-01/
 * 02/03/05) medido em server/routes/almoxarifado/extended.js: a lista devolve, por relatório,
 * `{ tipo, titulo, categoria, params, exportavel, limite, nota, colunas }` (dois fix-rounds:
 * `cfdbbe5` acrescentou exportavel/limite/nota; `bc1e2de` acrescentou `colunas` depois que a
 * revisão adversarial mediu C1 — a tabela genérica sem `colunas` renderizava a linha CRUA do
 * SELECT * na tela, vazando `custo_medio`/`proprietario_cliente_id` como cabeçalho pra qualquer
 * usuário do módulo, o mesmo vazamento que o export já corrigia via `colunas` no XLSX).
 *
 * Fixtures usam formas realistas espelhando server/services/almoxarifado/reportRegistry.js
 * (títulos, categorias, nomes de params reais como `de`/`ate` da sucata-financeiro), mas o
 * componente nunca é testado por conhecer um tipo específico — os asserts de "menu só com o
 * listado" e "tabela genérica" são o que garantem isso. Uma entrada de fixture (
 * `diagnostico-consistencia`) é deliberadamente FICTÍCIA, com `limite:3` (valor que nunca
 * existiu em nenhuma tabela hardcoded desta tela) e `exportavel:false` mesmo respondendo um
 * payload ARRAY — é o par de testes que prova que o campo da lista é a fonte, não mais um
 * proxy sobre o formato do payload.
 *
 * `indicadores` (Task 2, `bc1e2de`) já existe no servidor — a fixture usada aqui é o shape REAL
 * de `reportService.relatorioIndicadores` (conferido linha a linha: `janela_dias` escalar,
 * `giro`/`cobertura`/`atendimento_requisicoes` objetos aninhados, `rupturas` com `total` +
 * `materiais` array aninhado, `valor_por_grupo` array de objetos), não mais uma fixture
 * "antecipada" adivinhando o shape.
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=RelatoriosAlmoxarifado
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RelatoriosAlmoxarifado from './RelatoriosAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

// Espelha um recorte realista do registro real (2 categorias, um relatório sem params, um com
// params opcionais de nomes REAIS diferentes de data_inicio/data_fim, e o único obrigatório de
// verdade da etapa: cliente_id do materiais-cliente). Cada entrada já traz exportavel/limite/
// nota (contrato alargado pelo fix-round cfdbbe5).
const NOTA_MATERIAIS_MAIS_CONSUMIDOS = 'Top 10 por quantidade, contando apenas saídas diretas '
  + '(SAIDA, SAIDA_PRODUCAO, SAIDA_MONTAGEM, SAIDA_ASSISTENCIA).';

// `colunas` real do estoque-atual (reportRegistry.js) — usada pelo teste de projeção (C1): a
// consulta abaixo devolve uma linha CRUA com 10+ chaves, e só estas 3 podem virar cabeçalho.
const COLUNAS_ESTOQUE_ATUAL = [
  { chave: 'codigo', rotulo: 'Código' },
  { chave: 'nome', rotulo: 'Nome' },
  { chave: 'valor_total', rotulo: 'Valor total' },
];

const LISTA_FIXTURE = [
  {
    tipo: 'estoque-atual', titulo: 'Estoque atual', categoria: 'Estoque', params: [],
    exportavel: true, limite: null, nota: null, colunas: COLUNAS_ESTOQUE_ATUAL,
  },
  {
    tipo: 'materiais-mais-consumidos', titulo: 'Materiais mais consumidos', categoria: 'Movimentações',
    params: [
      { nome: 'data_inicio', rotulo: 'Data início', tipo: 'date', obrigatorio: false },
      { nome: 'data_fim', rotulo: 'Data fim', tipo: 'date', obrigatorio: false },
    ],
    // colunas:null de propósito — este relatório prova o FALLBACK (sem colunas declaradas, cai
    // em Object.keys da primeira linha), o caminho oposto do estoque-atual acima.
    exportavel: true, limite: 10, nota: NOTA_MATERIAIS_MAIS_CONSUMIDOS, colunas: null,
  },
  {
    tipo: 'sucata-financeiro', titulo: 'Sucata — financeiro', categoria: 'Gestão',
    params: [
      { nome: 'de', rotulo: 'De', tipo: 'date', obrigatorio: false },
      { nome: 'ate', rotulo: 'Até', tipo: 'date', obrigatorio: false },
    ],
    exportavel: false, limite: null, nota: null, colunas: null,
  },
  {
    tipo: 'materiais-cliente', titulo: 'Posição por cliente', categoria: 'Terceiros e clientes',
    params: [{ nome: 'cliente_id', rotulo: 'Cliente', tipo: 'number', obrigatorio: true }],
    exportavel: false, limite: null, nota: null, colunas: null,
  },
  {
    tipo: 'indicadores', titulo: 'Indicadores gerenciais', categoria: 'Gestão',
    params: [{ nome: 'janela_dias', rotulo: 'Janela (dias)', tipo: 'number', obrigatorio: false }],
    exportavel: false, limite: null, nota: null, colunas: null,
  },
  // Entrada FICTÍCIA de propósito (não existe em reportRegistry.js): limite:3 é um valor que
  // NUNCA esteve em nenhuma tabela hardcoded desta tela, e exportavel:false combinado com um
  // payload ARRAY é o caso que o antigo proxy Array.isArray acertava por acidente. As duas
  // coisas juntas provam que hoje é o CAMPO da lista que decide, não uma inferência do payload.
  {
    tipo: 'diagnostico-consistencia', titulo: 'Diagnóstico de consistência', categoria: 'Estoque',
    params: [], exportavel: false, limite: 3, nota: null, colunas: null,
  },
];

let container; let root;

const mockarLista = (itens = LISTA_FIXTURE) => {
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/relatorios') return Promise.resolve({ data: { relatorios: itens } });
    return Promise.reject(new Error(`URL inesperada no mock: ${url}`));
  });
};

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockarLista();
  // jsdom NÃO implementa URL.createObjectURL/revokeObjectURL (medido: undefined) — sem isto,
  // handleExportar lança no meio do fluxo de download e o catch engole em silêncio ANTES de
  // chegar no link.setAttribute('download', ...), o que faria o teste do nome do arquivo (C2)
  // falhar por um motivo que não tem nada a ver com o componente.
  window.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
  window.URL.revokeObjectURL = jest.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function renderizar() {
  await act(async () => { root.render(<MemoryRouter initialEntries={['/almoxarifado/relatorios']}><RelatoriosAlmoxarifado /></MemoryRouter>); });
  await esperarEfeitos();
}
const texto = () => container.textContent;
function botao(t, escopo = container) {
  return [...escopo.querySelectorAll('button')]
    .find((b) => b.textContent.trim().includes(t));
}
async function clicar(b) {
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
async function digitar(input, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function selecionarRelatorio(tipo) {
  const btn = container.querySelector(`[data-testid="menu-relatorio-${tipo}"]`);
  await clicar(btn);
}

describe('RelatoriosAlmoxarifado — menu dirigido pela lista', () => {
  test('menu mostra SÓ os relatórios que a lista devolveu, agrupados por categoria', async () => {
    await renderizar();

    LISTA_FIXTURE.forEach((r) => {
      expect(container.querySelector(`[data-testid="menu-relatorio-${r.tipo}"]`)).toBeTruthy();
    });
    // Categorias como títulos de seção — sabotagem-alvo: menu hardcode ignorando a lista faria
    // um tipo NÃO presente na fixture (ex.: "abaixo-minimo") aparecer mesmo assim.
    expect(container.querySelector('[data-testid="menu-relatorio-abaixo-minimo"]')).toBeNull();
    // Revisão da Task 3 (C5): preso por NÓ do menu (data-testid do título de grupo), não por
    // substring solta em todo o texto do container — um `texto().toContain('Estoque')` passaria
    // mesmo com o agrupamento quebrado, se qualquer outro texto da tela contivesse a palavra.
    const categoriasMenu = [...container.querySelectorAll('[data-testid="menu-categoria-titulo"]')]
      .map((el) => el.textContent);
    expect(categoriasMenu).toEqual(['Estoque', 'Movimentações', 'Gestão', 'Terceiros e clientes']);
  });

  test('lista com só 2 relatórios (perfil sem gate) não mostra os outros 3 da fixture completa', async () => {
    mockarLista([LISTA_FIXTURE[0], LISTA_FIXTURE[1]]);
    await renderizar();

    expect(container.querySelector('[data-testid="menu-relatorio-estoque-atual"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="menu-relatorio-materiais-mais-consumidos"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="menu-relatorio-materiais-cliente"]')).toBeNull();
    expect(container.querySelector('[data-testid="menu-relatorio-indicadores"]')).toBeNull();
  });
});

describe('RelatoriosAlmoxarifado — formulário de parâmetros por declaração', () => {
  test('parâmetro obrigatório (cliente_id) bloqueia a consulta e NÃO chama a API', async () => {
    await renderizar();
    await selecionarRelatorio('materiais-cliente');
    api.get.mockClear();
    mockarLista(); // reinstala o mock da lista (mockClear apagou a implementação anterior)

    await clicar(botao('Consultar'));

    expect(container.querySelector('[data-testid="aviso-obrigatorios"]')).toBeTruthy();
    expect(texto()).toContain('Cliente');
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/relatorios/materiais-cliente'), expect.anything());
  });

  test('consulta manda querystring certa: params preenchidos vão, vazios são omitidos', async () => {
    await renderizar();
    await selecionarRelatorio('materiais-mais-consumidos');

    const inputInicio = container.querySelector('#param-data_inicio');
    await digitar(inputInicio, '2026-08-01');
    // data_fim fica vazio de propósito.

    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/relatorios/materiais-mais-consumidos') {
        return Promise.resolve({ data: [] });
      }
      return Promise.reject(new Error(`inesperado: ${url}`));
    });
    await clicar(botao('Consultar'));

    expect(api.get).toHaveBeenCalledWith(
      '/almoxarifado/relatorios/materiais-mais-consumidos',
      { params: { data_inicio: '2026-08-01' } },
    );
  });

  test('nomes de parâmetro vêm do registro (sucata-financeiro usa de/ate, não data_inicio/data_fim)', async () => {
    await renderizar();
    await selecionarRelatorio('sucata-financeiro');

    expect(container.querySelector('#param-de')).toBeTruthy();
    expect(container.querySelector('#param-ate')).toBeTruthy();
    expect(container.querySelector('#param-data_inicio')).toBeNull();

    const inputDe = container.querySelector('#param-de');
    await digitar(inputDe, '2026-01-01');
    // Shape real de reportService.relatorioSucataFinanceiro inclui `nota` de primeiro nível
    // (C4) — presente aqui só para fidelidade de fixture; o comportamento de `nota` de payload
    // é testado à parte, no describe "nota do PAYLOAD" (C3).
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/sucata-financeiro'
      ? Promise.resolve({
        data: {
          periodo: { de: '2026-01-01', ate: null }, movimentacoes: [], vendas: [],
          totais: { quantidade_sucateada: 0, valor_estimado_total: 0, valor_vendido_total: 0 },
          por_classificacao: [],
          nota: 'Valor estimado calculado pelo custo ATUAL do material (custoUnitarioSql).',
        },
      })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Consultar'));

    expect(api.get).toHaveBeenCalledWith('/almoxarifado/relatorios/sucata-financeiro', { params: { de: '2026-01-01' } });
  });
});

describe('RelatoriosAlmoxarifado — tabela genérica (payload array)', () => {
  const LINHAS = [
    { codigo: 'MAT-01', nome: 'Parafuso M8', unidade: 'UN', total_consumido: 120 },
    { codigo: 'MAT-02', nome: 'Porca M8', unidade: 'UN', total_consumido: 87 },
  ];

  test('renderiza cabeçalhos das chaves e valores por célula, números distintos por linha', async () => {
    await renderizar();
    await selecionarRelatorio('materiais-mais-consumidos');
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/materiais-mais-consumidos'
      ? Promise.resolve({ data: LINHAS })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Consultar'));

    const tabela = container.querySelector('.almox-table');
    expect(tabela).toBeTruthy();
    const cabecalhos = [...tabela.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(cabecalhos).toEqual(['codigo', 'nome', 'unidade', 'total_consumido']);

    const linhas = tabela.querySelectorAll('tbody tr');
    expect(linhas).toHaveLength(2);
    const tdsLinha1 = linhas[0].querySelectorAll('td');
    expect(tdsLinha1[0].textContent).toBe('MAT-01');
    expect(tdsLinha1[3].textContent).toBe('120');
    const tdsLinha2 = linhas[1].querySelectorAll('td');
    expect(tdsLinha2[0].textContent).toBe('MAT-02');
    expect(tdsLinha2[3].textContent).toBe('87');
  });

  test('célula nula vira travessão, data UTC-safe cruzando meia-noite não muda de dia', async () => {
    await renderizar();
    await selecionarRelatorio('materiais-mais-consumidos');
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/materiais-mais-consumidos'
      ? Promise.resolve({ data: [{ codigo: 'MAT-03', ultimo_erro: null, created_at: '2026-08-18 01:00:00', total_consumido: 0, ativo: false }] })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Consultar'));

    const tds = container.querySelectorAll('.almox-table tbody tr')[0].querySelectorAll('td');
    expect(tds[1].textContent).toBe('—');
    // Revisao final (lente B, S4 — a unica sabotagem sobrevivente das 7): o par NEGATIVO do
    // travessao. Um `if (!v)` renderizaria 0 e false como '—' — numa tela de relatorios,
    // divergencia 0 (bateu) e ajustado 0 virariam "desconhecido".
    expect(tds[3].textContent).toBe('0');
    expect(tds[4].textContent).toBe('false');
    const esperado = new Date('2026-08-18T01:00:00Z').toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    expect(tds[2].textContent).toBe(esperado);
  });
});

describe('RelatoriosAlmoxarifado — tabela projetada por `colunas` da lista (C1, Major)', () => {
  test('linha crua com 10+ chaves mostra SÓ os rótulos das colunas declaradas, nada de chave crua', async () => {
    await renderizar();
    await selecionarRelatorio('estoque-atual'); // fixture com colunas: COLUNAS_ESTOQUE_ATUAL (3)
    // Linha CRUA como um SELECT * devolveria — o achado C1 media exatamente isto: sem projeção,
    // custo_medio/proprietario_cliente_id/ativo etc. vazavam como cabeçalho pra qualquer usuário.
    const linhaCrua = {
      codigo: 'MAT-01', nome: 'Parafuso M8', categoria: 'Fixação', unidade: 'UN',
      quantidade_atual: 100, disponivel: 80, valor_total: 500.5,
      custo_medio: 4.5, custo_unitario: 5, proprietario_cliente_id: null, ativo: 1,
    };
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/estoque-atual'
      ? Promise.resolve({ data: [linhaCrua] })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Consultar'));

    const tabela = container.querySelector('.almox-table');
    expect(tabela).toBeTruthy();
    const cabecalhos = [...tabela.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(cabecalhos).toEqual(['Código', 'Nome', 'Valor total']);
    expect(cabecalhos).not.toContain('custo_medio');
    expect(cabecalhos).not.toContain('proprietario_cliente_id');
    expect(cabecalhos).not.toContain('ativo');

    const tds = tabela.querySelectorAll('tbody td');
    expect(tds).toHaveLength(3); // só as 3 colunas declaradas, não as 11 chaves da linha crua
    expect(tds[0].textContent).toBe('MAT-01');
    expect(tds[1].textContent).toBe('Parafuso M8');
    expect(tds[2].textContent).toBe('500,5');
  });

  test('relatório sem `colunas` (materiais-mais-consumidos) mantém o fallback: cabeçalhos das chaves da linha', async () => {
    // Par negativo do teste acima — prova que o fallback continua existindo para quem não
    // declara colunas (a lista traz colunas:null de propósito nesta fixture).
    await renderizar();
    await selecionarRelatorio('materiais-mais-consumidos');
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/materiais-mais-consumidos'
      ? Promise.resolve({ data: [{ codigo: 'MAT-09', total_consumido: 3 }] })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Consultar'));

    const cabecalhos = [...container.querySelectorAll('.almox-table thead th')].map((th) => th.textContent);
    expect(cabecalhos).toEqual(['codigo', 'total_consumido']);
  });
});

describe('RelatoriosAlmoxarifado — payload objeto (indicadores, shape REAL de relatorioIndicadores)', () => {
  test('renderiza escalares como cards, objetos aninhados como cards próprios e arrays internos como tabelas, genericamente', async () => {
    await renderizar();
    await selecionarRelatorio('indicadores');
    // Shape IDÊNTICO ao `return` de reportService.relatorioIndicadores (Task 2, bc1e2de): os 6
    // campos de primeiro nível, na mesma forma (giro/cobertura/atendimento_requisicoes objetos,
    // rupturas com total+materiais, valor_por_grupo array de {categoria,valor}).
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/indicadores'
      ? Promise.resolve({
        data: {
          janela_dias: 90,
          giro: { valor_consumido: 1234.5, valor_estoque_atual: 5000, indice: 0.25 },
          cobertura: { mediana_dias: 12.5, materiais_sem_consumo: 3 },
          rupturas: {
            total: 2,
            materiais: [
              { codigo: 'MAT-07', nome: 'Chapa 3mm', data: '2026-08-10' },
            ],
          },
          valor_por_grupo: [
            { categoria: 'Fixação', valor: 1000 },
            { categoria: 'Sem categoria', valor: 250.75 },
          ],
          atendimento_requisicoes: { media_horas: 6.5, total_consideradas: 40 },
        },
      })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Consultar'));

    // Escalar de primeiro nível como card.
    expect(texto()).toContain('janela_dias');
    const cardJanela = [...container.querySelectorAll('.almox-kpi-card')]
      .find((c) => c.textContent.includes('janela_dias'));
    expect(cardJanela.querySelector('.almox-kpi-value').textContent).toBe('90');

    // Objeto aninhado (giro) vira seção com cards próprios.
    expect(texto()).toContain('giro');
    const cardIndice = [...container.querySelectorAll('.almox-kpi-card')]
      .find((c) => c.textContent.includes('indice'));
    expect(cardIndice.querySelector('.almox-kpi-value').textContent).toBe('0,25');

    // Array interno (rupturas.materiais) vira tabela — não uma lista solta de texto.
    const tabelaRupturas = [...container.querySelectorAll('.almox-table')]
      .find((t) => t.textContent.includes('MAT-07'));
    expect(tabelaRupturas).toBeTruthy();
    expect(tabelaRupturas.querySelector('tbody td').textContent).toBe('MAT-07');

    // valor_por_grupo (array de objetos NÃO aninhado sob outra chave) também vira tabela.
    const tabelaValorPorGrupo = [...container.querySelectorAll('.almox-table')]
      .find((t) => t.textContent.includes('Fixação'));
    expect(tabelaValorPorGrupo).toBeTruthy();
    const linhaFixacao = [...tabelaValorPorGrupo.querySelectorAll('tbody tr')]
      .find((tr) => tr.textContent.includes('Fixação'));
    expect(linhaFixacao.querySelectorAll('td')[1].textContent).toBe('1.000');
  });
});

describe('RelatoriosAlmoxarifado — aviso de limite (campo `limite` da lista)', () => {
  test('linhas === limite da lista (10, materiais-mais-consumidos) mostra o aviso', async () => {
    await renderizar();
    await selecionarRelatorio('materiais-mais-consumidos');
    const dezLinhas = Array.from({ length: 10 }, (_, i) => ({ codigo: `MAT-${i}`, total_consumido: i }));
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/materiais-mais-consumidos'
      ? Promise.resolve({ data: dezLinhas })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Consultar'));

    const aviso = container.querySelector('[data-testid="aviso-limite"]');
    expect(aviso).toBeTruthy();
    expect(aviso.textContent).toContain('10');
  });

  test('linhas < limite da lista NÃO mostra o aviso (sabotagem-alvo: remover o aviso passa despercebido sem este par negativo)', async () => {
    await renderizar();
    await selecionarRelatorio('materiais-mais-consumidos');
    const noveLinhas = Array.from({ length: 9 }, (_, i) => ({ codigo: `MAT-${i}`, total_consumido: i }));
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/materiais-mais-consumidos'
      ? Promise.resolve({ data: noveLinhas })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Consultar'));

    expect(container.querySelector('[data-testid="aviso-limite"]')).toBeNull();
  });

  test('limite ATÍPICO (3, diagnostico-consistencia) prova que o aviso é dirigido pelo campo, não por uma tabela local', async () => {
    // 3 nunca esteve em nenhuma tabela hardcoded desta tela (os únicos valores reais do
    // registro são 500 e 10) — só passa se o componente ler `entradaSelecionada.limite`.
    await renderizar();
    await selecionarRelatorio('diagnostico-consistencia');
    const tresLinhas = [{ codigo: 'X1' }, { codigo: 'X2' }, { codigo: 'X3' }];
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/diagnostico-consistencia'
      ? Promise.resolve({ data: tresLinhas })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Consultar'));

    const aviso = container.querySelector('[data-testid="aviso-limite"]');
    expect(aviso).toBeTruthy();
    expect(aviso.textContent).toContain('3');
  });
});

describe('RelatoriosAlmoxarifado — nota/régua declarada no rodapé (campo `nota` da lista)', () => {
  test('nota aparece, com o texto exato do registro, já ao selecionar o relatório (antes de consultar)', async () => {
    await renderizar();
    await selecionarRelatorio('materiais-mais-consumidos');

    const nota = container.querySelector('[data-testid="nota-relatorio"]');
    expect(nota).toBeTruthy();
    expect(nota.textContent).toBe(NOTA_MATERIAIS_MAIS_CONSUMIDOS);
  });

  test('relatório sem nota declarada (null) não renderiza o bloco de nota', async () => {
    await renderizar();
    await selecionarRelatorio('estoque-atual');

    expect(container.querySelector('[data-testid="nota-relatorio"]')).toBeNull();
  });
});

describe('RelatoriosAlmoxarifado — nota do PAYLOAD vira rodapé, não card KPI (C3)', () => {
  test('sucata-financeiro: campo `nota` do payload aparece como texto de rodapé, fora da grade de cards', async () => {
    await renderizar();
    await selecionarRelatorio('sucata-financeiro');
    const NOTA_PAYLOAD_SUCATA = 'Valor estimado calculado pelo custo ATUAL do material '
      + '(custoUnitarioSql) — a movimentacao nao guarda custo historico.';
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/sucata-financeiro'
      ? Promise.resolve({
        data: {
          periodo: { de: null, ate: null },
          movimentacoes: [],
          vendas: [],
          totais: { quantidade_sucateada: 0, valor_estimado_total: 0, valor_vendido_total: 0 },
          por_classificacao: [],
          nota: NOTA_PAYLOAD_SUCATA,
        },
      })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Consultar'));

    const notaPayload = container.querySelector('[data-testid="nota-payload"]');
    expect(notaPayload).toBeTruthy();
    expect(notaPayload.textContent).toBe(NOTA_PAYLOAD_SUCATA);

    // Sabotagem-alvo do achado C3: sem o tratamento especial, `nota` cairia na grade de
    // escalares como mais um card KPI com rótulo "nota" — este assert prova que NÃO existe tal
    // card, só o parágrafo de rodapé acima.
    const cardNota = [...container.querySelectorAll('.almox-kpi-card .almox-kpi-label')]
      .find((el) => el.textContent === 'nota');
    expect(cardNota).toBeUndefined();
  });
});

describe('RelatoriosAlmoxarifado — exportar XLSX', () => {
  test('export usa a MESMA querystring da última consulta (relatório com exportavel:true)', async () => {
    await renderizar();
    await selecionarRelatorio('materiais-mais-consumidos');

    const inputInicio = container.querySelector('#param-data_inicio');
    await digitar(inputInicio, '2026-08-01');
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/materiais-mais-consumidos'
      ? Promise.resolve({ data: [{ codigo: 'MAT-01', total_consumido: 5 }] })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Consultar'));

    const btnExportar = botao('Exportar XLSX');
    expect(btnExportar).toBeTruthy();

    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/materiais-mais-consumidos/export'
      ? Promise.resolve({ data: new Blob(['x']) })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(btnExportar);

    // Sabotagem-alvo: apontar para o dispatcher (sem "/export") faz este assert de URL cair.
    expect(api.get).toHaveBeenCalledWith(
      '/almoxarifado/relatorios/materiais-mais-consumidos/export',
      { params: { data_inicio: '2026-08-01' }, responseType: 'blob' },
    );
  });

  test('botão Exportar XLSX NÃO existe para relatório cujo payload é objeto (materiais-cliente)', async () => {
    await renderizar();
    await selecionarRelatorio('materiais-cliente');
    const inputCliente = container.querySelector('#param-cliente_id');
    await digitar(inputCliente, '42');
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/materiais-cliente'
      ? Promise.resolve({ data: { cliente: { id: 42, nome: 'Cliente X' }, itens: [], aplicacoes: [] } })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Consultar'));

    expect(botao('Exportar XLSX')).toBeUndefined();
  });

  test('botão Exportar XLSX não aparece antes de qualquer consulta', async () => {
    await renderizar();
    await selecionarRelatorio('materiais-mais-consumidos');
    expect(botao('Exportar XLSX')).toBeUndefined();
  });

  test('exportavel:false esconde o botão MESMO com payload array (o caso que o proxy Array.isArray errava)', async () => {
    await renderizar();
    await selecionarRelatorio('diagnostico-consistencia');
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/diagnostico-consistencia'
      ? Promise.resolve({ data: [{ codigo: 'X1' }, { codigo: 'X2' }] }) // payload TABULAR de propósito
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Consultar'));

    // A tabela genérica renderiza normalmente (payload é array) — só o botão de export some.
    expect(container.querySelector('.almox-table')).toBeTruthy();
    expect(botao('Exportar XLSX')).toBeUndefined();
  });
});

describe('RelatoriosAlmoxarifado — nome do arquivo, troca de relatório, querystring congelada (C2)', () => {
  test('download usa o nome de arquivo <tipo>-<AAAA-MM-DD>.xlsx', async () => {
    await renderizar();
    await selecionarRelatorio('materiais-mais-consumidos');
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/materiais-mais-consumidos'
      ? Promise.resolve({ data: [{ codigo: 'MAT-01', total_consumido: 5 }] })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Consultar'));

    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/materiais-mais-consumidos/export'
      ? Promise.resolve({ data: new Blob(['x']) })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    const setAttributeSpy = jest.spyOn(window.HTMLAnchorElement.prototype, 'setAttribute');
    await clicar(botao('Exportar XLSX'));

    const chamadaDownload = setAttributeSpy.mock.calls.find(([atributo]) => atributo === 'download');
    expect(chamadaDownload).toBeTruthy();
    expect(chamadaDownload[1]).toMatch(/^materiais-mais-consumidos-\d{4}-\d{2}-\d{2}\.xlsx$/);
    setAttributeSpy.mockRestore();
  });

  test('trocar de relatório limpa o resultado anterior — a tabela de A NÃO aparece sob o título de B', async () => {
    await renderizar();
    await selecionarRelatorio('estoque-atual');
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/estoque-atual'
      ? Promise.resolve({ data: [{ codigo: 'A1', nome: 'Material A', valor_total: 1 }] })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Consultar'));
    expect(texto()).toContain('A1');
    expect(container.querySelector('.almox-table')).toBeTruthy();

    // Troca para B SEM consultar B — o `setDadosRelatorio(null)` do `selecionarRelatorio` é o
    // que garante que o resultado de A não fica grudado sob o título de B.
    await selecionarRelatorio('materiais-mais-consumidos');

    expect(texto()).not.toContain('A1');
    expect(container.querySelector('.almox-table')).toBeNull();
  });

  test('alterar um input DEPOIS de consultar não muda a querystring do export (usa a da ÚLTIMA consulta)', async () => {
    await renderizar();
    await selecionarRelatorio('materiais-mais-consumidos');
    const inputInicio = container.querySelector('#param-data_inicio');
    await digitar(inputInicio, '2026-08-01');
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/materiais-mais-consumidos'
      ? Promise.resolve({ data: [{ codigo: 'MAT-01', total_consumido: 5 }] })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Consultar'));

    // Muda o input DEPOIS de consultar, sem clicar Consultar de novo.
    await digitar(inputInicio, '2026-12-25');

    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/materiais-mais-consumidos/export'
      ? Promise.resolve({ data: new Blob(['x']) })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Exportar XLSX'));

    // Continua com o valor da CONSULTA (2026-08-01), não o valor ao vivo do input (2026-12-25).
    expect(api.get).toHaveBeenCalledWith(
      '/almoxarifado/relatorios/materiais-mais-consumidos/export',
      { params: { data_inicio: '2026-08-01' }, responseType: 'blob' },
    );
  });
});

describe('RelatoriosAlmoxarifado — painel de erro por estado (403/rede nunca viram lista vazia)', () => {
  test('403 na lista de relatórios mostra o painel de erro, não "nenhum relatório"', async () => {
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios'
      ? Promise.reject({ response: { status: 403, data: { error: 'Sem permissão para o módulo' } } })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await renderizar();

    expect(toast.error).toHaveBeenCalledWith('Sem permissão para o módulo');
    expect(texto()).toContain('Dados indisponíveis no momento');
    expect(texto()).toContain('Sem permissão para o módulo');
    expect(container.querySelector('[data-testid="menu-relatorio-estoque-atual"]')).toBeNull();

    api.get.mockClear();
    mockarLista();
    await clicar(botao('Tentar novamente'));
    expect(container.querySelector('[data-testid="menu-relatorio-estoque-atual"]')).toBeTruthy();
  });

  test('erro de rede na consulta de um relatório mostra o painel, mantém o menu e o formulário', async () => {
    await renderizar();
    await selecionarRelatorio('estoque-atual');
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/estoque-atual'
      ? Promise.reject(new Error('Network Error'))
      : Promise.reject(new Error(`inesperado: ${url}`))));

    await clicar(botao('Consultar'));

    expect(texto()).toContain('Dados indisponíveis no momento');
    expect(texto()).toContain('Não foi possível consultar o relatório');
    // Menu continua disponível — o erro é só da consulta, não da tela inteira.
    expect(container.querySelector('[data-testid="menu-relatorio-materiais-cliente"]')).toBeTruthy();
  });
});

describe('RelatoriosAlmoxarifado — botão desabilitado em voo', () => {
  test('Consultar desabilita durante a chamada e reabilita depois', async () => {
    await renderizar();
    await selecionarRelatorio('estoque-atual');
    api.get.mockClear();

    let resolver;
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/estoque-atual'
      ? new Promise((res) => { resolver = res; })
      : Promise.reject(new Error(`inesperado: ${url}`))));

    await act(async () => { botao('Consultar').dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const btnEmVoo = botao('Consultando...');
    expect(btnEmVoo).toBeTruthy();
    expect(btnEmVoo.disabled).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(1);

    await act(async () => { resolver({ data: [] }); });
    expect(botao('Consultar').disabled).toBe(false);
    // Duplo clique não deve ter disparado uma segunda chamada.
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
