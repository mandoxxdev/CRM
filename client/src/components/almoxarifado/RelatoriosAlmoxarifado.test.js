/**
 * Etapa 13, Task 3 — tela "/almoxarifado/relatorios" contra o contrato HTTP CONGELADO (RN-01/
 * 02/03) medido em server/routes/almoxarifado/extended.js, não contra o design aspiracional
 * (a lista real só devolve `{ tipo, titulo, categoria, params }` — sem `exportavel`/`limite`/
 * `colunas`; ver o cabeçalho de RelatoriosAlmoxarifado.js para as duas decisões que isso força).
 *
 * Fixtures usam formas realistas espelhando server/services/almoxarifado/reportRegistry.js
 * (títulos, categorias, nomes de params reais como `de`/`ate` da sucata-financeiro), mas o
 * componente nunca é testado por conhecer um tipo específico — os asserts de "menu só com o
 * listado" e "tabela genérica" são o que garantem isso.
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
// verdade da etapa: cliente_id do materiais-cliente).
const LISTA_FIXTURE = [
  { tipo: 'estoque-atual', titulo: 'Estoque atual', categoria: 'Estoque', params: [] },
  {
    tipo: 'materiais-mais-consumidos', titulo: 'Materiais mais consumidos', categoria: 'Movimentações',
    params: [
      { nome: 'data_inicio', rotulo: 'Data início', tipo: 'date', obrigatorio: false },
      { nome: 'data_fim', rotulo: 'Data fim', tipo: 'date', obrigatorio: false },
    ],
  },
  {
    tipo: 'sucata-financeiro', titulo: 'Sucata — financeiro', categoria: 'Gestão',
    params: [
      { nome: 'de', rotulo: 'De', tipo: 'date', obrigatorio: false },
      { nome: 'ate', rotulo: 'Até', tipo: 'date', obrigatorio: false },
    ],
  },
  {
    tipo: 'materiais-cliente', titulo: 'Posição por cliente', categoria: 'Terceiros e clientes',
    params: [{ nome: 'cliente_id', rotulo: 'Cliente', tipo: 'number', obrigatorio: true }],
  },
  {
    tipo: 'indicadores', titulo: 'Indicadores gerenciais', categoria: 'Gestão',
    params: [{ nome: 'janela_dias', rotulo: 'Janela (dias)', tipo: 'number', obrigatorio: false }],
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
    expect(texto()).toContain('Estoque');
    expect(texto()).toContain('Movimentações');
    expect(texto()).toContain('Gestão');
    expect(texto()).toContain('Terceiros e clientes');
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
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/sucata-financeiro'
      ? Promise.resolve({ data: { periodo: {}, movimentacoes: [], vendas: [], totais: {}, por_classificacao: [] } })
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
      ? Promise.resolve({ data: [{ codigo: 'MAT-03', ultimo_erro: null, created_at: '2026-08-18 01:00:00' }] })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Consultar'));

    const tds = container.querySelectorAll('.almox-table tbody tr')[0].querySelectorAll('td');
    expect(tds[1].textContent).toBe('—');
    const esperado = new Date('2026-08-18T01:00:00Z').toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    expect(tds[2].textContent).toBe(esperado);
  });
});

describe('RelatoriosAlmoxarifado — payload objeto (indicadores)', () => {
  test('renderiza escalares como cards e arrays internos como tabelas, genericamente', async () => {
    await renderizar();
    await selecionarRelatorio('indicadores');
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/indicadores'
      ? Promise.resolve({
        data: {
          janela_dias: 90,
          giro: { valor_consumido: 1234.5, valor_estoque_atual: 5000, indice: 0.25 },
          rupturas: {
            total: 2,
            materiais: [
              { codigo: 'MAT-07', nome: 'Chapa 3mm', data: '2026-08-10' },
            ],
          },
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
  });
});

describe('RelatoriosAlmoxarifado — aviso de limite', () => {
  test('linhas === limite conhecido (10, materiais-mais-consumidos) mostra o aviso', async () => {
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

  test('linhas < limite conhecido NÃO mostra o aviso (sabotagem-alvo: remover o aviso passa despercebido sem este par negativo)', async () => {
    await renderizar();
    await selecionarRelatorio('materiais-mais-consumidos');
    const noveLinhas = Array.from({ length: 9 }, (_, i) => ({ codigo: `MAT-${i}`, total_consumido: i }));
    api.get.mockImplementation((url) => (url === '/almoxarifado/relatorios/materiais-mais-consumidos'
      ? Promise.resolve({ data: noveLinhas })
      : Promise.reject(new Error(`inesperado: ${url}`))));
    await clicar(botao('Consultar'));

    expect(container.querySelector('[data-testid="aviso-limite"]')).toBeNull();
  });
});

describe('RelatoriosAlmoxarifado — exportar XLSX', () => {
  test('export usa a MESMA querystring da última consulta e só existe quando o payload é array (proxy de exportavel)', async () => {
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
