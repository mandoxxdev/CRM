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
import ModalGrafico from './ModalGrafico';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn(), defaults: {} },
}));
const mockAuth = { user: { id: 7, nome: 'Vend 166', role: 'admin', email: 'v166@t' }, loading: false };
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));
// o BarChart desenha um <svg> (o caminho 1 do PNG do modal de grafico, que serializa o SVG); o resto devolve os filhos
jest.mock('recharts', () => new Proxy({ __esModule: true }, {
  get: (alvo, nome) => (nome in alvo ? alvo[nome]
    : nome === 'BarChart' ? () => require('react').createElement('svg', { width: 10, height: 10 })
      : (p) => (p && p.children ? p.children : null)),
}));
// o caminho 2 do PNG (sem SVG): o html2canvas falso devolve um canvas que entrega um blob
jest.mock('html2canvas', () => jest.fn(() => Promise.resolve({ toBlob: (cb) => cb(new Blob(['png'])) })));
jest.mock('./MapaClientes', () => () => null);
jest.mock('./ReportBuilder', () => () => null);
jest.mock('./WorkflowEngine', () => () => null);
// o jsPDF toca no canvas ao carregar (o jsdom nao tem) — o PDF nao e exercitado aqui (a guarda no fonte cobre a celula dele)
// o jsPDF falso guarda o nome do arquivo salvo e as tabelas (Fase 5 r3 C07: provar o PDF pelo comportamento, nao so pelo fonte)
const mockPdf = { saves: [], tabelas: [] };
jest.mock('jspdf', () => function JsPdfFalso() {
  const doc = {
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 }, getNumberOfPages: () => 1 },
    lastAutoTable: { finalY: 20 },
    save: (n) => { mockPdf.saves.push(n); },
    autoTable: (o) => { mockPdf.tabelas.push(o); },
    splitTextToSize: (t) => [String(t)],
  };
  return new Proxy(doc, { get: (alvo, p) => (p in alvo ? alvo[p] : () => undefined) });
});
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

/** abre um atalho no painel e devolve os params da ultima chamada a /dashboard que o reflete */
async function atalho(rotulo, inicioEsperado) {
  await clicar([...container.querySelectorAll('.dashboard-filtros-atalhos button')].find((b) => b.textContent === rotulo));
  const ultima = () => { const c = api.get.mock.calls.filter(([u]) => u === '/dashboard'); return c.length ? (c[c.length - 1][1] || {}).params : null; };
  await esperar(() => { const p = ultima(); return p && p.inicio === inicioEsperado; }).catch(() => {});
  return ultima();
}
async function abrirFiltros() {
  respostas['/dashboard'] = {};
  await act(async () => { root.render(<MemoryRouter><Dashboard /></MemoryRouter>); });
  await esperar(() => container.querySelector('.dashboard-filtros .btn-filter'));
  await clicar(container.querySelector('.dashboard-filtros .btn-filter'));
}

test('[Fase 5 r3 C04] Este ano as 22h30 de 31/12: o ano local (o UTC ja e o seguinte)', async () => {
  relogio(2026, 11, 31, 22, 30);
  await abrirFiltros();
  expect(await atalho('Este ano', '2026-01-01')).toEqual({ inicio: '2026-01-01', fim: '2026-12-31' });
});

test('[Fase 5 r3 C12] Ultimos 3 meses em janeiro: vira o ano', async () => {
  relogio(2027, 0, 15, 10, 0);
  await abrirFiltros();
  expect(await atalho('Últimos 3 meses', '2026-11-01')).toEqual({ inicio: '2026-11-01', fim: '2027-01-15' });
});

test('[RN-166.06, B1062, Fase 5 r3 C07] o PDF dos Relatorios as 22h30 de 31/10: o nome com o dia local e a Ultima Proposta no dia de Brasilia', async () => {
  relogio(2026, 9, 31, 22, 30);
  mockPdf.saves.length = 0; mockPdf.tabelas.length = 0;
  respostas['/relatorios/executivo'] = {
    kpis: {}, graficos: {}, recomendacoes: [],
    insights: { clientesParaVisitar: [
      { id: 1, razao_social: 'CLI 22H30', cidade: 'C', estado: 'SP', ultima_proposta: '2026-11-01 01:30:00', total_propostas_historico: 2 },
      { id: 2, razao_social: 'CLI NUNCA', cidade: 'C', estado: 'SP', ultima_proposta: null, total_propostas_historico: 0 },
      { id: 3, razao_social: 'CLI LIXO', cidade: 'C', estado: 'SP', ultima_proposta: 'lixo', total_propostas_historico: 1 },
    ] },
  };
  respostas['/relatorios/visitas-tecnicas'] = { elegiveis: [], naoElegiveis: [], total: 0, totalElegiveis: 0, totalNaoElegiveis: 0 };
  await act(async () => { root.render(<MemoryRouter><Relatorios /></MemoryRouter>); });
  await esperar(() => [...container.querySelectorAll('button')].some((b) => b.textContent.includes('Exportar PDF')));
  await clicar([...container.querySelectorAll('button')].find((b) => b.textContent.includes('Exportar PDF')));
  await esperar(() => mockPdf.saves.length > 0);
  expect(mockPdf.saves).toEqual(['Relatorios_GMP_2026-10-31.pdf']);
  const tabela = mockPdf.tabelas.find((t) => (t.body || []).some((l) => l[0] === 'CLI 22H30'));
  expect(tabela && tabela.body.map((l) => l[2])).toEqual(['31/10/2026', 'Nunca', '-']);
});

describe('[B1062, Fase 5 r3 C07] o PNG do modal de grafico as 22h30 de 31/10: o nome com o dia local nos dois caminhos', () => {
  let baixados; let clickOrig; let ctxOrig; let blobOrig; let imageOrig;
  beforeEach(() => {
    baixados = [];
    clickOrig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function capturar() { baixados.push(this.download); };
    global.URL.createObjectURL = () => 'blob:falso';
    global.URL.revokeObjectURL = () => {};
    ctxOrig = HTMLCanvasElement.prototype.getContext;
    blobOrig = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {} });
    HTMLCanvasElement.prototype.toBlob = function blob(cb) { cb(new Blob(['png'])); };
    imageOrig = global.Image;
    global.Image = class { set src(v) { setTimeout(() => this.onload && this.onload(), 0); } };
    // o CRA liga o resetMocks: a implementacao do mock volta a cada teste
    require('html2canvas').mockImplementation(() => Promise.resolve({ toBlob: (cb) => cb(new Blob(['png'])) }));
  });
  afterEach(() => {
    HTMLAnchorElement.prototype.click = clickOrig;
    HTMLCanvasElement.prototype.getContext = ctxOrig;
    HTMLCanvasElement.prototype.toBlob = blobOrig;
    global.Image = imageOrig;
  });
  for (const [caminho, tipo] of [['1 (o SVG do grafico)', 'bar'], ['2 (html2canvas, sem SVG)', 'pie']]) {
    test(`caminho ${caminho}`, async () => {
      relogio(2026, 9, 31, 22, 30);
      await act(async () => {
        root.render(<ModalGrafico isOpen onClose={() => {}} titulo="Evolucao" descricao="" tipoGrafico={tipo} dados={[{ name: 'a', value: 1 }]} cores={['#000']} />);
      });
      const botao = document.querySelector('button[title="Exportar gráfico como PNG"]');
      expect(botao).toBeTruthy();
      await clicar(botao);
      await esperar(() => baixados.length > 0, 5000);
      expect(baixados).toEqual(['Evolucao_2026-10-31.png']);
    });
  }
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
