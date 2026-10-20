/**
 * Etapa 168 (RN-168.01/02/03/05, B1069/B1070) — a hora de criacao no relogio de Brasilia nas telas do nucleo, de Custos de Viagem, das
 * Solicitacoes de Compra e do modelo da proposta; a data da viagem no dia gravado.
 *
 * O `created_at` do banco e `'AAAA-MM-DD HH:MM:SS'` em UTC e sem fuso (`CURRENT_TIMESTAMP`); `new Date(texto)` o lia como hora LOCAL: o
 * `'2026-10-21 01:30:05'` (22h30 de Brasilia de 20/10) aparecia *21/10/2026, 01:30:05*. E a `data_viagem` (`'AAAA-MM-DD'`) aparecia na vespera.
 * Cada cenario vai do gesto do usuario (abrir a tela, clicar, exportar) ate o texto, com a metade positiva (o certo ESTA la) e a negativa.
 *
 * DEPENDE DO FUSO: o `client/jest.globalSetup.js` fixa America/Sao_Paulo; a guarda abaixo derruba o arquivo fora dele.
 * O mock de `services/api`, do `axios` (o editor do modelo o usa direto) e do `exportToExcel` e so a fronteira.
 * Plano: docs/superpowers/plans/2026-10-20-almoxarifado-etapa168-a-hora-de-criacao-no-relogio-de-brasilia-no-nucleo-na-viagem-e-nas-solicitacoes.md
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import api from '../services/api';
import { exportToExcel } from '../utils/exportExcel';
import Clientes from './Clientes';
import Usuarios from './Usuarios';
import Logs from './Logs';
import CustosViagens from './CustosViagens';
import MinhasSolicitacoesCompra from './MinhasSolicitacoesCompra';
import EditorTemplateProposta from './EditorTemplateProposta';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn(), patch: jest.fn(), defaults: {} },
}));
jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() } }));
jest.mock('../utils/exportExcel', () => ({ exportToExcel: jest.fn() }));
const mockAuth = { user: { id: 1, nome: 'Admin 168', role: 'admin', is_superadmin: 1, email: 'a168@t' }, loading: false };
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn(), warn: jest.fn() } }));
jest.mock('recharts', () => {
  const Nada = () => null;
  return { __esModule: true, BarChart: Nada, Bar: Nada, XAxis: Nada, YAxis: Nada, CartesianGrid: Nada, Tooltip: Nada, Legend: Nada,
    ResponsiveContainer: Nada, PieChart: Nada, Pie: Nada, Cell: Nada, LineChart: Nada, Line: Nada };
});
jest.mock('leaflet', () => ({ __esModule: true, default: { divIcon: () => ({}) } }));
jest.mock('leaflet/dist/leaflet.css', () => ({}));
jest.mock('react-leaflet', () => {
  const R = require('react');
  return { __esModule: true, MapContainer: ({ children }) => R.createElement('div', null, children), TileLayer: () => null,
    Marker: ({ children }) => R.createElement('div', null, children), Popup: ({ children }) => R.createElement('div', null, children),
    Polyline: () => null };
});

// o instante do banco: 22h30m05s de Brasilia de 20/10/2026
const BANCO = '2026-10-21 01:30:05';
const CERTO = '20/10/2026, 22:30:05';
const ERRADO = '21/10/2026, 01:30:05'; // o que o new Date(texto) mostrava

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
let container; let root; let respostas; let respostasAxios;
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  respostas = {};
  respostasAxios = {};
  const caminho = (url) => String(url).split('?')[0];
  api.get.mockImplementation((url) => Promise.resolve({ data: caminho(url) in respostas ? respostas[caminho(url)] : [] }));
  api.post.mockResolvedValue({ data: {} });
  api.put.mockResolvedValue({ data: {} });
  axios.get.mockImplementation((url) => Promise.resolve({ data: caminho(url) in respostasAxios ? respostasAxios[caminho(url)] : null }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
async function esperar(cond, ms = 4000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (cond()) return; await act(async () => { await pausa(20); }); }
  throw new Error('a condicao nao chegou: ' + container.textContent.slice(0, 400));
}
const clicar = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const montar = async (el) => { await act(async () => { root.render(<MemoryRouter>{el}</MemoryRouter>); }); };
const exportado = () => exportToExcel.mock.calls[exportToExcel.mock.calls.length - 1][0];

test('guarda: o fuso desta suite e o de Brasilia (a 01h30 UTC e 22h30 da vespera; a meia-noite UTC, 21h da vespera)', () => {
  expect(new Date('2026-10-21T01:30:05Z').toLocaleString('pt-BR')).toBe(CERTO);
  expect(new Date(BANCO).toLocaleString('pt-BR')).toBe(ERRADO); // a leitura antiga, neste fuso, erra — o teste discrimina
  expect(new Date('2026-10-20').toLocaleDateString('pt-BR')).toBe('19/10/2026');
});

test('[RN-168.01/02] Clientes: o Cadastrado em da planilha no dia de Brasilia; sem data, vazio', async () => {
  respostas['/clientes'] = [
    { id: 1, razao_social: 'CLIENTE 168 NOITE', status: 'ativo', created_at: BANCO },
    { id: 2, razao_social: 'CLIENTE 168 SEM DATA', status: 'ativo', created_at: null },
  ];
  await montar(<Clientes />);
  await esperar(() => container.textContent.includes('CLIENTE 168 NOITE'));
  await clicar(container.querySelector('button[title="Exportar para Excel (Ctrl+E)"]'));
  expect(exportado().map((l) => l['Cadastrado em'])).toEqual(['20/10/2026', '']); // antes 21/10/2026
});

test('[RN-168.01/02] Usuarios: o Cadastrado em da lista e da planilha; sem data, "—" (antes 31/12/1969)', async () => {
  respostas['/usuarios'] = [
    { id: 7, nome: 'USUARIO 168 NOITE', email: 'u168@t', role: 'usuario', ativo: 1, is_superadmin: 0, admin_modulos: '[]', created_at: BANCO },
    { id: 8, nome: 'USUARIO 168 SEM DATA', email: 'v168@t', role: 'usuario', ativo: 1, is_superadmin: 0, admin_modulos: '[]', created_at: null },
  ];
  await act(async () => { root.render(<MemoryRouter><Usuarios deferMs={0} /></MemoryRouter>); });
  await esperar(() => container.textContent.includes('USUARIO 168 NOITE'));
  const linha = (nome) => [...container.querySelectorAll('tr')].find((tr) => tr.textContent.includes(nome));
  expect(linha('USUARIO 168 NOITE').textContent).toContain('20/10/2026');
  expect(linha('USUARIO 168 NOITE').textContent).not.toContain('21/10/2026');
  expect(linha('USUARIO 168 SEM DATA').textContent).toContain('—');
  expect(linha('USUARIO 168 SEM DATA').textContent).not.toContain('1969');
  await clicar(container.querySelector('button[title="Exportar para Excel (Ctrl+E)"]'));
  expect(exportado().map((l) => l['Cadastrado em'])).toEqual(['20/10/2026', '']);
});

test('[RN-168.01/02/03] Logs: a Data/Hora na tabela e na planilha; o filtro do dia 20 pede o dia 20 e mostra a linha das 22h30', async () => {
  respostas['/auditoria/logs'] = [
    { id: 1, usuario_nome: 'LOG 168 NOITE', tipo: 'acesso_negado', modulo: 'comercial', created_at: BANCO },
    { id: 2, usuario_nome: 'LOG 168 ILEGIVEL', tipo: 'login', modulo: 'comercial', created_at: 'lixo' },
  ];
  await montar(<Logs />);
  await esperar(() => container.textContent.includes('LOG 168 NOITE'));
  const linha = (nome) => [...container.querySelectorAll('tr')].find((tr) => tr.textContent.includes(nome));
  expect(linha('LOG 168 NOITE').textContent).toContain(CERTO);
  expect(linha('LOG 168 NOITE').textContent).not.toContain(ERRADO);
  expect(linha('LOG 168 ILEGIVEL').textContent).toContain('lixo'); // antes Invalid Date
  expect(linha('LOG 168 ILEGIVEL').textContent).not.toContain('Invalid Date');
  await clicar(container.querySelector('button[title="Exportar Excel"]'));
  expect(exportado().map((l) => l['Data/Hora'])).toEqual([CERTO, 'lixo']);
  // o gesto seguinte: filtrar o dia 20 (o dia que a linha mostra) — a rota real (T3) devolve o log das 22h30 nesse dia
  respostas['/auditoria/logs'] = [{ id: 1, usuario_nome: 'LOG 168 NOITE', tipo: 'acesso_negado', modulo: 'comercial', created_at: BANCO }];
  const [ini, fim] = container.querySelectorAll('input[type="date"]');
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  for (const el of [ini, fim]) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { setValue.call(el, '2026-10-20'); el.dispatchEvent(new Event('input', { bubbles: true })); });
  }
  await esperar(() => api.get.mock.calls.some(([u, c]) => u === '/auditoria/logs' && c && c.params && c.params.data_fim === '2026-10-20'));
  const ultima = api.get.mock.calls.filter(([u]) => u === '/auditoria/logs').pop();
  expect(ultima[1].params).toEqual({ data_inicio: '2026-10-20', data_fim: '2026-10-20' });
  await esperar(() => !container.textContent.includes('LOG 168 ILEGIVEL'));
  expect(linha('LOG 168 NOITE').textContent).toContain('20/10/2026');
});

test('[RN-168.01/05] Custos de Viagem: a Data da lista no dia gravado; o comprovante, o historico e a autorizacao no relogio de Brasilia', async () => {
  respostas['/custos-viagens'] = [{ id: 31, codigo_visita: 'V-168', cliente_id: 5, cliente_nome: 'CLIENTE VIAGEM 168', data_viagem: '2026-10-20',
    destino: 'CAMPINAS - SP', total_custo: 80, status_aprovacao: 'pendente' }];
  respostas['/custos-viagens/resumo'] = {};
  respostas['/custos-viagens/31/comprovantes'] = [{ id: 1, nome_original: 'nota168.pdf', tipo_comprovante: 'nota', tamanho: 2048,
    uploaded_by_nome: 'QUEM ENVIOU 168', created_at: BANCO }];
  respostas['/custos-viagens/31/historico'] = [{ id: 1, alterado_por_nome: 'QUEM ALTEROU 168', created_at: BANCO, mudancas: [],
    dados_anteriores: {}, dados_novos: {} }];
  respostas['/custos-viagens/31/logs-autorizacao'] = [{ id: 1, autorizado_por_nome: 'QUEM AUTORIZOU 168', motivo_autorizacao: 'motivo 168',
    regras_nao_atendidas: [], created_at: BANCO }];
  await montar(<CustosViagens />);
  await esperar(() => !!container.querySelector('button[title="Editar"]'));
  const linha = [...container.querySelectorAll('tr')].find((tr) => tr.textContent.includes('V-168'));
  expect(linha.textContent).toContain('20/10/2026'); // antes 19/10/2026 (a vespera)
  expect(linha.textContent).not.toContain('19/10/2026');

  await clicar(container.querySelector('button[title="Comprovantes"]'));
  await esperar(() => container.textContent.includes('QUEM ENVIOU 168'));
  expect(container.textContent).toContain(`Enviado por QUEM ENVIOU 168 em ${CERTO}`);
  expect(container.textContent).not.toContain(ERRADO);

  await clicar(container.querySelector('button[title="Histórico"]'));
  await esperar(() => container.textContent.includes('Alteração #1'));
  const item = [...container.querySelectorAll('strong')].find((s) => s.textContent.includes('Alteração #1')).parentElement;
  expect(item.textContent).toContain(CERTO);
  expect(item.textContent).not.toContain(ERRADO);

  await clicar(container.querySelector('button[title="Editar"]'));
  await esperar(() => container.textContent.includes('Autorização #1'));
  const data = container.querySelector('.log-autorizacao-item .log-date');
  expect(data.textContent).toBe('20/10/2026, 22:30'); // antes 21/10/2026, 01:30
});

test('[RN-168.01] Minhas Solicitacoes de Compra: a criacao no relogio de Brasilia', async () => {
  respostas['/solicitacoes-compra/minhas'] = { solicitacoes: [
    { id: 1, titulo: 'SOLICITACAO 168', setor: 'COMPRAS', status: 'pendente', created_at: BANCO },
    { id: 2, titulo: 'SOLICITACAO 168 SEM DATA', setor: 'COMPRAS', status: 'pendente', created_at: null },
  ] };
  await montar(<MinhasSolicitacoesCompra />);
  await esperar(() => container.textContent.includes('#2'));
  expect(container.textContent).toContain(CERTO);
  expect(container.textContent).not.toContain(ERRADO);
  expect([...container.querySelectorAll('.msc-muted')].map((d) => d.textContent)).toContain('—');
});

test('[RN-168.01] o editor do modelo da proposta: a data do modelo salvo no dia de Brasilia', async () => {
  respostasAxios['/api/proposta-template/list'] = [{ id: 1, nome_template: 'MODELO 168', familia: 'ESTRUTURA', is_padrao: 0, created_at: BANCO,
    updated_at: BANCO }];
  await montar(<EditorTemplateProposta />);
  await esperar(() => axios.get.mock.calls.some(([u]) => String(u).startsWith('/api/proposta-template/list')));
  const botao = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Carregar Template'));
  await clicar(botao);
  await esperar(() => container.textContent.includes('MODELO 168'));
  const meta = container.querySelector('.template-item-meta');
  expect(meta.textContent).toContain('20/10/2026'); // antes 21/10/2026
  expect(meta.textContent).not.toContain('21/10/2026');
});
