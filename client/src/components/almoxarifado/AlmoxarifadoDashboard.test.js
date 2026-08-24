/**
 * Etapa 13, Task 4 — RN-06: dashboard consome `GET /almoxarifado/relatorios/indicadores` UMA
 * vez e renderiza 3 cartões novos (giro, rupturas na janela, tempo médio de atendimento), com
 * legenda citando a janela efetiva devolvida pelo servidor (`res.janela_dias`) — exceto no
 * cartão de atendimento, cuja régua NÃO é janelada (desvio declarado da Task 2/reportService.js:
 * `atendimento_requisicoes` lê TODO o histórico de requisições com entrega completa), e a
 * legenda diz isso.
 *
 * A falha deste endpoint tem de ficar LOCALIZADA nos 3 cartões — os KPIs que já existiam
 * (materiais ativos, crítico, zerados, valor em estoque, movimentações hoje, requisições) não
 * podem sumir nem quebrar. Mock na fronteira HTTP por URL, um endpoint rejeitado por vez —
 * molde: NotificacoesAlmoxarifado.test.js.
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=AlmoxarifadoDashboard
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import AlmoxarifadoDashboard from './AlmoxarifadoDashboard';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, nome: 'Admin', perfil_almoxarifado: 'ADMINISTRADOR' } }),
}));

jest.mock('../../services/permissionsCache', () => ({
  getEffectiveUser: (u) => u,
}));

// Números DELIBERADAMENTE distintos entre si (pega troca de célula/coluna).
const STATS_FIXTURE = {
  totalMateriais: 321,
  materiaisCriticos: 7,
  materiaisZerados: 2,
  valorTotalEstoque: 15000,
  movimentacoesHoje: 9,
  listaMateriaisCriticos: [],
  ultimasMovimentacoes: [],
  graficoMovimentacoes: [],
};
const REQUISICOES_FIXTURE = {
  requisicoesPendentes: 3,
  requisicoesUrgentes: 1,
  requisicoesEmitidas: 20,
  requisicoesEncerradas: 15,
  abertas: [],
};
// janela_dias=45 (nem o default 90 nem o de outro teste, para pegar legenda hardcoded).
const INDICADORES_FIXTURE = {
  janela_dias: 45,
  giro: { valor_consumido: 500, valor_estoque_atual: 1000, indice: 0.5 },
  cobertura: { mediana_dias: 12, materiais_sem_consumo: 3 },
  rupturas: { total: 4, materiais: [{ codigo: 'MAT-01', nome: 'Material Um', data: '2026-08-01' }] },
  valor_por_grupo: [{ categoria: 'ACO', valor: 100 }],
  atendimento_requisicoes: { media_horas: 7.25, total_consideradas: 10 },
};

const URLS = {
  dashboard: '/almoxarifado/dashboard',
  requisicoes: '/almoxarifado/dashboard/requisicoes',
  indicadores: '/almoxarifado/relatorios/indicadores',
};

/**
 * Dispatcher por URL — cada chamada de api.get responde de acordo com o endpoint, como o
 * axios real faria (nunca uma resposta genérica igual para todos, que esconderia troca de
 * endpoint). `overrides` permite substituir/rejeitar uma URL específica sem mexer nas outras.
 */
function mockarApi(overrides = {}) {
  api.get.mockImplementation((url) => {
    if (url === URLS.indicadores) {
      if (overrides.indicadores) return overrides.indicadores();
      return Promise.resolve({ data: INDICADORES_FIXTURE });
    }
    if (url === URLS.requisicoes) {
      if (overrides.requisicoes) return overrides.requisicoes();
      return Promise.resolve({ data: REQUISICOES_FIXTURE });
    }
    if (url.startsWith('/almoxarifado/relatorios/consumo-os')) return Promise.resolve({ data: [] });
    if (url.startsWith('/almoxarifado/relatorios/materiais-mais-consumidos')) return Promise.resolve({ data: [] });
    if (url === URLS.dashboard) {
      if (overrides.dashboard) return overrides.dashboard();
      return Promise.resolve({ data: STATS_FIXTURE });
    }
    return Promise.resolve({ data: {} });
  });
}

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockarApi();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
async function renderizar() {
  await act(async () => { root.render(<MemoryRouter><AlmoxarifadoDashboard /></MemoryRouter>); });
  await esperarEfeitos();
}
const secaoIndicadores = () => container.querySelector('[data-testid="indicadores-secao"]');
function botao(t, escopo = container) {
  return [...escopo.querySelectorAll('button')]
    .find((b) => b.textContent.trim().includes(t));
}
async function clicar(b) {
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}

describe('AlmoxarifadoDashboard — cartões de indicadores (RN-06)', () => {
  test('cartão de giro mostra o índice exato da fixture e a janela efetiva na legenda', async () => {
    await renderizar();
    const secao = secaoIndicadores();
    expect(secao.querySelector('[data-testid="kpi-giro"]').textContent).toBe('0.50');
    expect(secao.textContent).toContain('Janela de 45 dias');
  });

  test('cartão de rupturas mostra o total exato da fixture, com a janela efetiva na legenda', async () => {
    await renderizar();
    const secao = secaoIndicadores();
    expect(secao.querySelector('[data-testid="kpi-rupturas"]').textContent).toBe('4');
    // Duas legendas "Janela de 45 dias" no total (giro + rupturas) — a de atendimento é diferente.
    const ocorrencias = (secao.textContent.match(/Janela de 45 dias/g) || []).length;
    expect(ocorrencias).toBe(2);
  });

  test('cartão de atendimento mostra as horas exatas da fixture e legenda "todo o histórico" (NÃO janelado — desvio declarado)', async () => {
    await renderizar();
    const secao = secaoIndicadores();
    expect(secao.querySelector('[data-testid="kpi-atendimento"]').textContent).toBe('7.25h');
    expect(secao.textContent).toContain('todo o histórico');
    // O cartão de atendimento não pode citar a janela em dias, ao contrário dos outros dois.
    const legendaAtendimento = secao.querySelector('[data-testid="kpi-atendimento"]')
      .closest('.almox-kpi-card').textContent;
    expect(legendaAtendimento).not.toContain('Janela de 45 dias');
  });

  test('busca indicadores/ UMA vez só (nenhuma segunda chamada por causa do período dos outros gráficos)', async () => {
    await renderizar();
    const chamadasIndicadores = api.get.mock.calls.filter(([url]) => url === URLS.indicadores);
    expect(chamadasIndicadores.length).toBe(1);
  });
});

describe('AlmoxarifadoDashboard — falha localizada do endpoint de indicadores', () => {
  test('403 SÓ no indicadores: painel de erro nos 3 cartões, KPIs existentes intactos', async () => {
    mockarApi({
      indicadores: () => Promise.reject({ response: { status: 403, data: { error: 'Sem permissão para ver os indicadores.' } } }),
    });
    await renderizar();

    // KPIs pré-existentes continuam de pé, com os números certos.
    expect(container.textContent).toContain('321');
    expect(container.textContent).toContain('Materiais Ativos');
    expect(container.textContent).toContain('R$'); // valor em estoque formatado

    // A seção de indicadores mostra o painel de erro, não os 3 cartões nem NaN/undefined.
    const secao = secaoIndicadores();
    expect(secao.querySelector('[data-testid="indicadores-erro"]')).toBeTruthy();
    expect(secao.querySelector('[data-testid="kpi-giro"]')).toBeNull();
    expect(secao.querySelector('[data-testid="kpi-rupturas"]')).toBeNull();
    expect(secao.querySelector('[data-testid="kpi-atendimento"]')).toBeNull();
    expect(secao.textContent).toContain('Sem permissão para ver os indicadores.');
    expect(secao.textContent).not.toMatch(/undefined|NaN/);
  });

  test('retry no painel de erro busca os indicadores de novo e, se der certo, os 3 cartões aparecem', async () => {
    mockarApi({
      indicadores: () => Promise.reject({ response: { status: 500, data: { error: 'Erro interno' } } }),
    });
    await renderizar();
    const secao = secaoIndicadores();
    expect(secao.querySelector('[data-testid="indicadores-erro"]')).toBeTruthy();

    mockarApi(); // próxima chamada de indicadores volta a resolver com a fixture
    await clicar(botao('Tentar novamente', secao));

    expect(secaoIndicadores().querySelector('[data-testid="indicadores-erro"]')).toBeNull();
    expect(secaoIndicadores().querySelector('[data-testid="kpi-giro"]').textContent).toBe('0.50');
  });

  test('rede fora do ar SÓ no indicadores (sem response) mostra o painel, e nunca derruba o dashboard inteiro', async () => {
    mockarApi({ indicadores: () => Promise.reject(new Error('Network Error')) });
    await renderizar();

    // O `loadError` de página inteira (usado para 403 do módulo) NÃO deve aparecer — é um
    // endpoint diferente do que falhou.
    expect(container.textContent).not.toContain('Dados indisponíveis no momento');
    expect(container.textContent).toContain('321');

    const secao = secaoIndicadores();
    expect(secao.querySelector('[data-testid="indicadores-erro"]')).toBeTruthy();
    expect(secao.textContent).toContain('Não foi possível conectar ao servidor.');
  });
});
