/**
 * Etapa 160 (RN-160.01, RN-160.05, RN-160.08; T5) — as telas da Fabrica: o painel da producao que passa do cache do servidor, as paradas
 * em andamento do pedido filtrado, a busca das atividades e das horas extras (no navegador, sem recarregar), a lista das OS que descarta a
 * resposta velha e mostra o selo da prioridade, e a edicao da OS com as opcoes do gravado em maiusculas.
 * O `api` simulado na fronteira HTTP.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import api from '../../services/api';
import { fetchProducaoDashboard, invalidateProducaoDashboardCache } from '../../utils/producaoApi';
import ParadasProducao from '../producao/ParadasProducao';
import AtividadesColaboradores from './AtividadesColaboradores';
import HorasExtras from './HorasExtras';
import OrdensServico from './OrdensServico';
import OSForm from './OSForm';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: '/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn(), warning: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => {
  const user = { id: 1, nome: 'ADMIN', role: 'admin' };
  return { useAuth: () => ({ user }) };
});
jest.mock('../../utils/userFilters', () => ({ fetchModuleUsers: () => Promise.resolve([]) }));

global.IS_REACT_ACT_ENVIRONMENT = true;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
let container; let root;
beforeAll(() => { jest.spyOn(console, 'error').mockImplementation(() => {}); });
beforeEach(() => {
  api.get.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
async function montar(el) {
  await act(async () => { root.render(<MemoryRouter>{el}</MemoryRouter>); });
  for (let i = 0; i < 6; i++) await act(async () => {});
}
async function digitar(input, valor) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { set.call(input, valor); input.dispatchEvent(new Event('input', { bubbles: true })); });
  for (let i = 0; i < 4; i++) await act(async () => {});
}
async function esperar(cond, ms = 3000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (cond()) return; await act(async () => { await pausa(20); }); }
  throw new Error('a condicao nao chegou');
}

describe('[RN-160.05, C394] o painel da producao', () => {
  test('o Atualizar (force) manda refresh=1; a invalidacao depois de uma acao faz a proxima busca mandar; sem acao, o cache vale', async () => {
    const pedidos = [];
    let n = 0;
    api.get.mockImplementation((url, cfg) => { pedidos.push([url, cfg && cfg.params]); n += 1; return Promise.resolve({ data: { n } }); });
    await fetchProducaoDashboard({ force: true });
    expect(pedidos[pedidos.length - 1]).toEqual(['/producao/dashboard', { refresh: '1' }]);
    const antes = pedidos.length;
    await fetchProducaoDashboard();
    expect(pedidos.length).toBe(antes); // o cache do navegador
    invalidateProducaoDashboardCache();
    await fetchProducaoDashboard();
    expect(pedidos[pedidos.length - 1]).toEqual(['/producao/dashboard', { refresh: '1' }]);
    // a invalidacao vale uma vez: a busca seguinte, com o cache limpo, nao forca de novo
    invalidateProducaoDashboardCache();
    await fetchProducaoDashboard();
    const depois = pedidos.length;
    // forca a expirar o cache do navegador sem nova acao: uma busca forcada e uma normal com o cache cheio
    await fetchProducaoDashboard();
    expect(pedidos.length).toBe(depois);
  });

  test('a resposta de uma busca anterior que termina depois nao vale: as duas devolvem a da ultima (Fase 2 M6)', async () => {
    const resolve = [];
    api.get.mockImplementation(() => new Promise((r) => resolve.push(r)));
    const p1 = fetchProducaoDashboard({ force: true });
    const p2 = fetchProducaoDashboard({ force: true });
    resolve[1]({ data: { quem: 'ultima' } });
    resolve[0]({ data: { quem: 'velha' } });
    expect(await p2).toEqual({ quem: 'ultima' });
    expect(await p1).toEqual({ quem: 'ultima' });
    api.get.mockImplementation(() => Promise.resolve({ data: { quem: 'nova' } }));
    expect(await fetchProducaoDashboard()).toEqual({ quem: 'ultima' }); // o cache guardou a da ultima, nao a velha
  });
});

test('[RN-160.05, C394] Paradas: as em andamento vem do pedido em_andamento=1, mesmo fora do historico (as 500 ultimas)', async () => {
  api.get.mockImplementation((url, cfg) => {
    if (url === '/producao/meta') return Promise.resolve({ data: { maquinas: [], motivos: [], ops: [] } });
    if (url === '/producao/paradas' && cfg && cfg.params && cfg.params.em_andamento === '1') {
      return Promise.resolve({ data: [{ id: 7, maquina_codigo: 'MQ-ANTIGA-160', motivo_texto: 'aberta antiga', data_inicio: '2026-01-01T10:00:00Z', data_fim: null }] });
    }
    if (url === '/producao/paradas') {
      return Promise.resolve({ data: [{ id: 9, maquina_codigo: 'MQ-RECENTE-160', motivo_texto: 'encerrada', data_inicio: '2026-10-19T10:00:00Z', data_fim: '2026-10-19T11:00:00Z' }] });
    }
    return Promise.resolve({ data: [] });
  });
  await montar(<ParadasProducao />);
  await esperar(() => container.textContent.includes('Paradas em andamento'));
  const quadro = [...container.querySelectorAll('.producao-card')].find((c) => c.textContent.includes('Paradas em andamento'));
  expect(quadro.textContent).toContain('MQ-ANTIGA-160');
  expect(quadro.textContent).not.toContain('MQ-RECENTE-160');
  expect(container.textContent).toContain('MQ-RECENTE-160'); // o historico continua
});

describe('[RN-160.05, C394] a busca das atividades e das horas extras filtra no navegador e nao recarrega', () => {
  test('Atividades: " joão " mostra so a do JOÃO (pelo colaborador); "manutenção" pela descricao; "OS-160" pela OS; nenhum pedido novo', async () => {
    const ATV = [
      { id: 1, colaborador_nome: 'JOÃO SILVA', tipo_atividade: 'producao', descricao: 'SOLDA', numero_os: 'OS-1', status: 'em_andamento' },
      { id: 2, colaborador_nome: 'MARIA', tipo_atividade: 'manutencao', descricao: 'MANUTENÇÃO DA BOMBA', numero_os: 'OS-2', status: 'em_andamento' },
      { id: 3, colaborador_nome: 'PEDRO', tipo_atividade: 'producao', descricao: null, numero_os: 'OS-160', status: 'concluida' },
    ];
    api.get.mockResolvedValue({ data: ATV });
    await montar(<AtividadesColaboradores />);
    const linhas = () => [...container.querySelectorAll('tbody tr')].map((tr) => tr.textContent);
    expect(linhas().length).toBe(3);
    const n0 = api.get.mock.calls.length;
    const input = container.querySelector('.search-box input');
    await digitar(input, ' joão ');
    expect(linhas().length).toBe(1);
    expect(linhas()[0]).toContain('JOÃO SILVA');
    await digitar(input, 'manutenção');
    expect(linhas().length).toBe(1);
    expect(linhas()[0]).toContain('MARIA');
    await digitar(input, 'os-160');
    expect(linhas().length).toBe(1);
    expect(linhas()[0]).toContain('PEDRO');
    await digitar(input, 'nada160');
    expect(container.textContent).toContain('Nenhuma atividade encontrada');
    expect(api.get.mock.calls.length).toBe(n0);
  });

  test('Horas extras: " maria " mostra so a da MARIA; pelo tipo tambem; nenhum pedido novo', async () => {
    const HE = [
      { id: 1, colaborador_nome: 'JOÃO SILVA', data: '2026-10-19', horas_extras: 2, tipo_hora_extra: 'normal', valor_total: 10, status: 'pendente' },
      { id: 2, colaborador_nome: 'MARIA ÂNGELA', data: '2026-10-19', horas_extras: 1, tipo_hora_extra: 'feriado', valor_total: 20, status: 'aprovado' },
    ];
    api.get.mockResolvedValue({ data: HE });
    await montar(<HorasExtras />);
    const linhas = () => [...container.querySelectorAll('tbody tr')].map((tr) => tr.textContent);
    expect(linhas().length).toBe(2);
    const n0 = api.get.mock.calls.length;
    const input = container.querySelector('.search-box input');
    await digitar(input, ' ângela ');
    expect(linhas().length).toBe(1);
    expect(linhas()[0]).toContain('MARIA ÂNGELA');
    await digitar(input, 'FERIADO');
    expect(linhas().length).toBe(1);
    expect(linhas()[0]).toContain('MARIA ÂNGELA');
    expect(api.get.mock.calls.length).toBe(n0);
  });
});

test('[RN-160.01, C390] a lista das OS: a prioridade vai no pedido, a resposta lenta do filtro anterior nao troca a lista, e o selo usa a classe em minusculas', async () => {
  const pedidos = [];
  const TODAS = [{ id: 1, numero_os: 'OS-TODAS-160', prioridade: 'NORMAL', status: 'pendente' }, { id: 2, numero_os: 'OS-ALTA-160', prioridade: 'ALTA', status: 'pendente' }];
  api.get.mockImplementation(async (url, cfg) => {
    const p = cfg && cfg.params;
    pedidos.push(p);
    if (p && p.prioridade === 'alta') return { data: [TODAS[1]] };
    if (pedidos.length > 1) await pausa(300); // o pedido sem filtro de DEPOIS da abertura demora
    return { data: TODAS };
  });
  await montar(<OrdensServico />);
  await esperar(() => container.textContent.includes('OS-TODAS-160'));
  const sel = [...container.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'alta'));
  const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  // troca para "Todos os status" de novo (um pedido lento) e logo para "Alta" (rapido): o lento chega por ultimo
  const selStatus = [...container.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'concluido'));
  await act(async () => { set.call(selStatus, 'pendente'); selStatus.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => { set.call(sel, 'alta'); sel.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => { await pausa(500); });
  expect(pedidos[pedidos.length - 1]).toMatchObject({ prioridade: 'alta' });
  expect(container.textContent).toContain('OS-ALTA-160');
  expect(container.textContent).not.toContain('OS-TODAS-160');
  const selo = container.querySelector('.priority-badge');
  expect(selo.className).toContain('priority-alta');
  expect(selo.className).not.toContain('priority-ALTA');
});

describe('[RN-160.08, Fase 2 I1] a edicao da OS: o gravado em maiusculas escolhe a opcao certa', () => {
  const OS = { id: 5, numero_os: 'OS-160-5', tipo_os: 'MANUTENCAO', prioridade: 'ALTA', status: 'pendente', data_abertura: '2026-10-19' };
  beforeEach(() => { api.get.mockResolvedValue({ data: [] }); });
  const selectDe = (valor) => [...container.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === valor));
  test('MANUTENCAO mostra "Manutenção" e ALTA mostra "Alta" (antes: "Fabricação" e "Baixa")', async () => {
    await montar(<OSForm os={OS} onClose={() => {}} />);
    const tipo = selectDe('fabricacao');
    const prio = selectDe('urgente');
    expect(tipo.value).toBe('manutencao');
    expect(tipo.options[tipo.selectedIndex].textContent).toBe('Manutenção');
    expect(prio.value).toBe('alta');
    expect(prio.options[prio.selectedIndex].textContent).toBe('Alta');
    expect(tipo.options.length).toBe(4); // nenhuma opcao a mais quando casa
  });
  test('o gravado que nao casa com nenhuma opcao aparece como opcao a mais, selecionada', async () => {
    await montar(<OSForm os={{ ...OS, prioridade: 'MEDIA' }} onClose={() => {}} />);
    const prio = selectDe('urgente');
    expect(prio.value).toBe('MEDIA');
    expect(prio.options.length).toBe(5);
  });
});
