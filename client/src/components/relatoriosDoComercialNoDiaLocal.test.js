/**
 * Etapa 166 (RN-166.05, B1061; RN-166.06, B1062) — os atalhos de periodo do painel e a *Ultima Proposta* dos Relatorios no dia local.
 *
 * Os atalhos *Este mes* / *Ultimos 3 meses* / *Este ano* preenchiam o *Ate* com `new Date().toISOString()` — o dia UTC: das 21h a
 * meia-noite, AMANHA (no ultimo dia do mes, o dia 1o do mes seguinte). A *Ultima Proposta* dos Relatorios lia o `'AAAA-MM-DD HH:MM:SS'`
 * UTC do banco como hora local: a proposta criada das 21h a meia-noite mostrava o dia seguinte. Os nomes dos arquivos baixados (o PDF dos
 * Relatorios e o PNG do modal de grafico) tambem saiam com o dia UTC.
 *
 * DEPENDE DO FUSO: o `client/jest.globalSetup.js` fixa America/Sao_Paulo; a guarda abaixo derruba o arquivo fora dele.
 * O mock de `services/api` e so a fronteira HTTP.
 * Plano: docs/superpowers/plans/2026-10-20-almoxarifado-etapa166-os-relatorios-por-mes-e-a-data-no-texto-da-proposta-no-dia-de-brasilia.md
 */
import React, { act } from 'react';
import fs from 'fs';
import path from 'path';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import api from '../services/api';
import Dashboard from './Dashboard';
import Relatorios from './Relatorios';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn(), defaults: {} },
}));
const mockAuth = { user: { id: 7, nome: 'Vend 166', role: 'admin', email: 'v166@t' }, loading: false };
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));
jest.mock('recharts', () => new Proxy({ __esModule: true }, { get: (alvo, nome) => (nome in alvo ? alvo[nome] : (p) => (p && p.children ? p.children : null)) }));
jest.mock('./MapaClientes', () => () => null);
jest.mock('./ReportBuilder', () => () => null);
jest.mock('./WorkflowEngine', () => () => null);
// o jsPDF toca no canvas ao carregar (o jsdom nao tem) — o PDF nao e exercitado aqui (a guarda no fonte cobre a celula dele)
jest.mock('jspdf', () => function JsPdfFalso() { return {}; });
jest.mock('jspdf-autotable', () => ({}));

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
let container; let root; let respostas;
const Real = Date;
beforeAll(() => {
  global.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  respostas = {};
  api.get.mockImplementation((url) => Promise.resolve({ data: url in respostas ? respostas[url] : [] }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  global.Date = Real;
});
async function esperar(cond, ms = 4000) {
  const fim = Real.now() + ms;
  while (Real.now() < fim) { if (cond()) return; await act(async () => { await pausa(20); }); }
  throw new Error('a condicao nao chegou: ' + container.textContent.slice(0, 400));
}
const clicar = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
/** o relogio da pagina parado nas hh:mm locais de (a, m, d) */
const relogio = (a, m, d, hh, mm) => {
  const t = new Real(a, m, d, hh, mm).getTime();
  global.Date = class extends Real { constructor(...x) { if (x.length === 0) super(t); else super(...x); } static now() { return t; } };
};
const semComentarios = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

test('guarda: o fuso desta suite e o de Brasilia (a meia-noite UTC e a vespera)', () => {
  expect(new Date('2026-10-20T00:00:00Z').getDate()).toBe(19);
});

test('[RN-166.05, B1061] os atalhos do painel as 22h30 do ultimo dia do mes: o Ate e hoje (antes, o 1o do mes seguinte)', async () => {
  relogio(2026, 9, 31, 22, 30);
  respostas['/dashboard'] = {};
  await act(async () => { root.render(<MemoryRouter><Dashboard /></MemoryRouter>); });
  await esperar(() => container.querySelector('.dashboard-filtros .btn-filter'));
  await clicar(container.querySelector('.dashboard-filtros .btn-filter'));
  const botao = (rotulo) => [...container.querySelectorAll('.dashboard-filtros-atalhos button')].find((b) => b.textContent === rotulo);
  const ultimaChamada = (url) => { const c = api.get.mock.calls.filter(([u]) => u === url); return c.length ? (c[c.length - 1][1] || {}).params : null; };
  const campos = () => [...container.querySelectorAll('.dashboard-filtros-painel input[type="date"]')].map((i) => i.value);
  for (const [rotulo, inicio] of [['Este mês', '2026-10-01'], ['Últimos 3 meses', '2026-08-01'], ['Este ano', '2026-01-01']]) {
    await clicar(botao(rotulo));
    await esperar(() => { const p = ultimaChamada('/dashboard'); return p && p.inicio === inicio; });
    expect(ultimaChamada('/dashboard')).toEqual({ inicio, fim: '2026-10-31' });
    expect(ultimaChamada('/dashboard/avancado')).toEqual({ inicio, fim: '2026-10-31' });
    expect(campos()).toEqual([inicio, '2026-10-31']);
  }
});

test('[RN-166.05] os atalhos as 0h30 do dia 1o: o mes e o dia locais (controle do outro lado da meia-noite)', async () => {
  relogio(2026, 10, 1, 0, 30);
  respostas['/dashboard'] = {};
  await act(async () => { root.render(<MemoryRouter><Dashboard /></MemoryRouter>); });
  await esperar(() => container.querySelector('.dashboard-filtros .btn-filter'));
  await clicar(container.querySelector('.dashboard-filtros .btn-filter'));
  await clicar([...container.querySelectorAll('.dashboard-filtros-atalhos button')].find((b) => b.textContent === 'Este mês'));
  await esperar(() => api.get.mock.calls.some(([u, o]) => u === '/dashboard' && o && o.params && o.params.fim));
  const c = api.get.mock.calls.filter(([u]) => u === '/dashboard');
  expect(c[c.length - 1][1].params).toEqual({ inicio: '2026-11-01', fim: '2026-11-01' });
});

test('[RN-166.06, B1062] Relatorios: a Ultima Proposta no dia de Brasilia; sem proposta = Nunca; ilegivel = -', async () => {
  respostas['/relatorios/executivo'] = {
    kpis: {}, graficos: {}, recomendacoes: [],
    insights: { clientesParaVisitar: [
      { id: 1, razao_social: 'CLI 22H30', cidade: 'C', estado: 'SP', ultima_proposta: '2026-11-01 01:30:00', total_propostas_historico: 2 },
      { id: 2, razao_social: 'CLI NUNCA', cidade: 'C', estado: 'SP', ultima_proposta: null, total_propostas_historico: 0 },
      { id: 3, razao_social: 'CLI LIXO', cidade: 'C', estado: 'SP', ultima_proposta: 'lixo', total_propostas_historico: 1 },
      { id: 4, razao_social: 'CLI TARDE', cidade: 'C', estado: 'SP', ultima_proposta: '2026-10-31 18:00:00', total_propostas_historico: 1 },
    ] },
  };
  respostas['/relatorios/visitas-tecnicas'] = { elegiveis: [], naoElegiveis: [], total: 0, totalElegiveis: 0, totalNaoElegiveis: 0 };
  await act(async () => { root.render(<MemoryRouter><Relatorios /></MemoryRouter>); });
  await esperar(() => [...container.querySelectorAll('tr')].some((tr) => tr.textContent.includes('CLI 22H30')));
  const celula = (nome) => {
    const tr = [...container.querySelectorAll('tr')].find((x) => x.textContent.includes(nome));
    return tr.querySelectorAll('td')[2].textContent.trim();
  };
  expect(celula('CLI 22H30')).toBe('31/10/2026');
  expect(celula('CLI NUNCA')).toBe('Nunca');
  expect(celula('CLI LIXO')).toBe('-');
  expect(celula('CLI TARDE')).toBe('31/10/2026');
});

test('[RN-166.06, B1062] no fonte (sem comentarios): a Ultima Proposta do PDF pela mesma funcao, e os nomes dos arquivos sem o dia UTC', () => {
  const rel = semComentarios('Relatorios.js');
  expect(rel).not.toMatch(/new Date\(cliente\.ultima_proposta\)/);
  expect(rel.split('? formatarDataDoBanco(cliente.ultima_proposta)').length - 1).toBe(2);
  expect(rel).toMatch(/Relatorios_GMP_\$\{hojeLocalISO\(\)\}\.pdf/);
  expect(rel).not.toMatch(/toISOString/);
  const modal = semComentarios('ModalGrafico.js');
  expect(modal).not.toMatch(/toISOString/);
  expect(modal.split('_${hojeLocalISO()}.png').length - 1).toBe(2);
  expect(semComentarios('Dashboard.js')).not.toMatch(/toISOString/);
});
