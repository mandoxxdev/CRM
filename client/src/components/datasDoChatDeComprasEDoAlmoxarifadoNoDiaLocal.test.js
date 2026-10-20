/**
 * Etapa 170 (RN-170.01/02/03/04, B1079–B1082) — as datas do Chat, de Compras e do Almoxarifado (telas e os dois PDFs) no dia e na hora
 * de Brasília.
 *
 * Todas as colunas desta etapa sao o `CURRENT_TIMESTAMP` do SQLite (`'AAAA-MM-DD HH:MM:SS'` em UTC, sem fuso) ou o `toISOString()` de
 * quem clica; tres leituras erradas:
 *   - lido como hora LOCAL (`parseISO(v.replace(' ', 'T'))`, `new Date(v)`): 3 h adiantada; das 21h a meia-noite, o dia de amanha
 *     (o Chat, o *Salva em* da planilha, o certificado do lote, os anexos);
 *   - os 10 primeiros caracteres: o dia UTC (o *Cadastrado em* da exportacao de fornecedores, a *Retirada* da ferramenta);
 *   - `{ timeZone: 'UTC' }` explicito: o dia UTC no papel (o *Gerado em* dos PDFs de remessa e de posicao do cliente).
 *
 * O RELOGIO fica parado as 22h30 de 20/10/2026 (Brasilia — 01h30 de 21/10 em UTC), a janela em que o dia UTC ja virou: `global.Date`
 * vira uma subclasse com o "agora" fixo (o molde do `datasDasOsEDasTarefasNoDiaLocal.test.js`), e o `beforeEach` PROVA que ele vale
 * (lição da r3 da 169: sem a prova, a suite passava de dia provando nada da janela das 21h). O `isToday`/`isYesterday` do date-fns le o
 * `Date.now()` global — o da subclasse.
 * DEPENDE DO FUSO: o `client/jest.globalSetup.js` fixa America/Sao_Paulo; a guarda derruba o arquivo fora dele.
 * Mockadas so as fronteiras: `services/api` (HTTP — as rotas devolvem as colunas cruas, Fase 0 do plano), `services/chatSocket` (o
 * socket), `utils/exportExcel` (o arquivo) e `jspdf` (o papel: o mock guarda cada `text()` impresso).
 * Plano: docs/superpowers/plans/2026-10-20-almoxarifado-etapa170-as-datas-do-chat-de-compras-e-do-almoxarifado-no-dia-de-brasilia-e-o-limite-dos-logs.md
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import api from '../services/api';
import { exportToExcel } from '../utils/exportExcel';
import ChatPage from './chat/ChatPage';
import Compras from './Compras';
import ItensFornecedor from './ItensFornecedor';
import LotesAlmoxarifado from './almoxarifado/LotesAlmoxarifado';
import AnexosDocumento from './almoxarifado/AnexosDocumento';
import FerramentasAlmoxarifado from './almoxarifado/FerramentasAlmoxarifado';
import RemessasTerceirosAlmoxarifado from './almoxarifado/RemessasTerceirosAlmoxarifado';
import MateriaisClienteAlmoxarifado from './almoxarifado/MateriaisClienteAlmoxarifado';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn(), patch: jest.fn(), defaults: { baseURL: '/api' } },
}));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, nome: 'Ana 170', role: 'admin', email: 'a170@t' }, loading: false }),
}));
jest.mock('../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));
// o socket: o handler de `nova_mensagem` fica guardado para o cenario empurrar uma mensagem
const mockSocket = { handlers: {} };
jest.mock('../services/chatSocket', () => ({
  connectChatSocket: () => ({
    on: (ev, fn) => { mockSocket.handlers[ev] = fn; },
    off: () => {},
  }),
  joinConversa: () => {},
  leaveConversa: () => {},
  emitTyping: () => {},
  resolveMediaUrl: (p) => (p ? `http://srv${p}` : ''),
}));
jest.mock('../utils/exportExcel', () => ({ exportToExcel: jest.fn() }));
jest.mock('../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({ perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false }),
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn(), warn: jest.fn() } }));
// o papel: cada text() impresso vai para mockPapel (o descritor nao e mockado — e o montador REAL que formata a data)
const mockPapel = [];
jest.mock('jspdf', () => {
  function FakePdf() {}
  FakePdf.prototype.text = function text(t) { mockPapel.push(Array.isArray(t) ? t.join('\n') : String(t)); };
  FakePdf.prototype.setFontSize = function setFontSize() {};
  FakePdf.prototype.line = function line() {};
  FakePdf.prototype.addPage = function addPage() {};
  FakePdf.prototype.splitTextToSize = function splitTextToSize(t) { return [String(t)]; };
  FakePdf.prototype.save = function save() {};
  return { __esModule: true, default: FakePdf };
});

const RealDate = Date;
// 22h30 de 20/10/2026 em Brasilia (o construtor LOCAL, de proposito) = 01h30 de 21/10 em UTC
const AGORA = new RealDate(2026, 9, 20, 22, 30, 0);
class DataFixa extends RealDate {
  constructor(...a) { if (a.length === 0) super(AGORA.getTime()); else super(...a); }
  static now() { return AGORA.getTime(); }
}

// o instante do banco: 22h30m05s de Brasilia de 20/10/2026 (01h30m05s de 21/10 em UTC)
const BANCO = '2026-10-21 01:30:05';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
let container; let root; let rotas;
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  mockPapel.length = 0;
  mockSocket.handlers = {};
  rotas = [];
  // cada rota: [teste(url, opcoes) -> bool, resposta]; a primeira que casa responde (a URL inteira, com a query — a posicao a usa)
  api.get.mockImplementation((url, opcoes) => {
    const r = rotas.find(([casa]) => casa(String(url), opcoes));
    return Promise.resolve({ data: r ? (typeof r[1] === 'function' ? r[1](url, opcoes) : r[1]) : [] });
  });
  api.post.mockResolvedValue({ data: {} });
  api.put.mockResolvedValue({ data: {} });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  global.Date = DataFixa;
  // o relogio parado TEM de valer em cada cenario (a lição da r3 da 169)
  expect(Date.now()).toBe(AGORA.getTime());
  expect(new Date().getHours()).toBe(22);
  expect(new Date().toISOString()).toBe('2026-10-21T01:30:00.000Z');
});
afterEach(() => {
  global.Date = RealDate;
  act(() => root.unmount());
  container.remove();
});
const em = (caminho, resposta) => rotas.push([(u) => u.split('?')[0] === caminho, resposta]);
async function esperar(cond, ms = 4000) {
  const fim = RealDate.now() + ms; // o Date.now() da suite esta parado
  while (RealDate.now() < fim) { if (cond()) return; await act(async () => { await pausa(20); }); }
  throw new Error('a condicao nao chegou: ' + container.textContent.slice(0, 400));
}
const clicar = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })); }); };
const montar = async (el, entrada = '/') => {
  await act(async () => { root.render(<MemoryRouter initialEntries={[entrada]}>{el}</MemoryRouter>); });
};
const botao = (t, escopo = container) => [...escopo.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t));
const escolher = async (select, valor) => {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => { setValue.call(select, String(valor)); select.dispatchEvent(new Event('change', { bubbles: true })); });
};

test('guarda: o fuso e o de Brasilia e o relogio esta parado as 22h30 de 20/10 (ja 21/10 em UTC)', () => {
  expect(new RealDate('2026-10-21T01:30:05Z').toLocaleString('pt-BR')).toBe('20/10/2026, 22:30:05');
  expect(new RealDate('2026-10-21 01:30:05').toLocaleString('pt-BR')).toBe('21/10/2026, 01:30:05'); // a leitura antiga erra — discrimina
  expect(new RealDate('2026-10-21T01:30:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' })).toBe('21/10/2026');
  expect(new Date().getDate()).toBe(20);
});

// ── Chat ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const MSG = (id, created_at, conteudo, extra = {}) => ({
  id, conversa_id: 1, usuario_id: 2, tipo: 'texto', conteudo, created_at, autor_nome: 'Bia', ...extra,
});
const bolha = (conteudo) => [...container.querySelectorAll('.chat-bubble')].find((b) => b.querySelector('p')?.textContent === conteudo);
const horaDe = (conteudo) => bolha(conteudo).querySelector('.chat-bubble-meta time').textContent;
const separadores = () => [...container.querySelectorAll('.chat-date-separator span')].map((s) => s.textContent);
// a ordem do DOM: cada separador e cada bolha, na sequencia em que aparecem
const sequencia = () => [...container.querySelectorAll('.chat-date-separator span, .chat-bubble p')].map((n) => (
  n.closest('.chat-date-separator') ? `[${n.textContent}]` : n.textContent));

function rotasDoChat({ mensagens, conversas, hasMore = false, antigas = [] }) {
  em('/chat/conversas', { conversas });
  em('/chat/usuarios', { usuarios: [] });
  rotas.unshift([(u, o) => u === '/chat/conversas/1/mensagens' && o?.params?.before !== undefined, { mensagens: antigas, hasMore: false }]);
  em('/chat/conversas/1/mensagens', { mensagens, hasMore });
}
async function abrirConversa() {
  await montar(<ChatPage />);
  await esperar(() => container.querySelector('.chat-conv-item'));
  await clicar(container.querySelector('.chat-conv-item'));
  await esperar(() => container.querySelector('.chat-bubble'));
}

test('[RN-170.01] Chat: a hora, o Hoje/Ontem e o separador de dia na hora de Brasilia; a lista de conversas', async () => {
  rotasDoChat({
    conversas: [
      { id: 1, tipo: 'direta', titulo: 'Bia', nao_lidas: 0, updated_at: '2026-10-21 01:30:00',
        ultima_mensagem: { conteudo: 'NOITE', tipo: 'texto', autor_nome: 'Bia', created_at: '2026-10-21 01:30:00' } },
      { id: 2, tipo: 'direta', titulo: 'Caio', nao_lidas: 0, updated_at: '2026-10-20 02:00:00', ultima_mensagem: null },
      { id: 3, tipo: 'direta', titulo: 'Duda', nao_lidas: 0, updated_at: '2026-10-18 15:00:00', ultima_mensagem: null },
    ],
    mensagens: [
      MSG(10, '2026-10-18 15:00:00', 'ANTIGA'), // 18/10 12h00
      MSG(11, '2026-10-20 02:00:00', 'ONTEM-NOITE'), // 19/10 23h00 — antes lida 20/10 02:00 ("hoje")
      MSG(12, '2026-10-20 14:00:00', 'HOJE-TARDE'), // 20/10 11h00
      MSG(13, '2026-10-21 01:30:00', 'HOJE-NOITE'), // 20/10 22h30 — antes lida 21/10 01:30 (amanha)
    ],
  });
  await abrirConversa();
  // a lista: a conversa da noite sai com a hora (antes 21/10); a de ontem a noite, Ontem (antes 02:00); a antiga, a data
  const horaDaConversa = (titulo) => [...container.querySelectorAll('.chat-conv-item')]
    .find((b) => b.querySelector('strong').textContent === titulo).querySelector('time').textContent;
  expect(horaDaConversa('Bia')).toBe('22:30');
  expect(horaDaConversa('Caio')).toBe('Ontem');
  expect(horaDaConversa('Duda')).toBe('18/10');
  // as bolhas: a hora exata de cada uma
  expect(horaDe('HOJE-NOITE')).toBe('22:30'); // antes 21/10/26
  expect(horaDe('HOJE-TARDE')).toBe('11:00'); // antes 14:00
  expect(horaDe('ONTEM-NOITE')).toBe('Ontem'); // antes 02:00
  expect(horaDe('ANTIGA')).toBe('18/10/26');
  // os separadores, na ordem e no lugar: a de ontem a noite fica sob *Ontem*, as duas de hoje sob *Hoje* (antes [20/10 hoje] e [21/10])
  expect(sequencia()).toEqual(['[18/10/2026]', 'ANTIGA', '[Ontem]', 'ONTEM-NOITE', '[Hoje]', 'HOJE-TARDE', 'HOJE-NOITE']);
});

test('[RN-170.01] Chat: a mensagem que chega pelo socket e a resposta do envio as 22h30 saem 22:30 sob o mesmo *Hoje*', async () => {
  rotasDoChat({
    conversas: [{ id: 1, tipo: 'direta', titulo: 'Bia', nao_lidas: 0, updated_at: '2026-10-20 14:00:00', ultima_mensagem: null }],
    mensagens: [MSG(12, '2026-10-20 14:00:00', 'HOJE-TARDE')],
  });
  await abrirConversa();
  expect(sequencia()).toEqual(['[Hoje]', 'HOJE-TARDE']);
  // o socket entrega a linha do banco (mapMessage) — o mesmo formato
  await act(async () => { mockSocket.handlers.nova_mensagem(MSG(14, '2026-10-21 01:30:05', 'PELO-SOCKET')); });
  await esperar(() => bolha('PELO-SOCKET'));
  expect(horaDe('PELO-SOCKET')).toBe('22:30'); // antes 21/10/26, e um separador novo [21/10/2026]
  // o envio: a resposta do POST traz a mensagem lida do banco
  api.post.mockResolvedValueOnce({ data: { mensagem: MSG(15, '2026-10-21 01:31:00', 'ENVIADA', { usuario_id: 1, autor_nome: 'Ana 170' }) } });
  const caixa = container.querySelector('input.chat-composer-input');
  expect(caixa).toBeTruthy();
  const proto = caixa.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(caixa, 'ENVIADA');
    caixa.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await clicar(container.querySelector('button.chat-send-btn'));
  await esperar(() => bolha('ENVIADA'));
  expect(horaDe('ENVIADA')).toBe('22:31');
  expect(sequencia()).toEqual(['[Hoje]', 'HOJE-TARDE', 'PELO-SOCKET', 'ENVIADA']);
});

test('[RN-170.01] Chat: a emenda da segunda pagina compara o dia certo (ontem a noite x hoje de manha)', async () => {
  rotasDoChat({
    conversas: [{ id: 1, tipo: 'direta', titulo: 'Bia', nao_lidas: 0, updated_at: '2026-10-20 14:00:00', ultima_mensagem: null }],
    mensagens: [MSG(21, '2026-10-20 11:00:00', 'HOJE-MANHA')], // 20/10 08h00
    hasMore: true,
    antigas: [MSG(20, '2026-10-20 02:00:00', 'ONTEM-NOITE')], // 19/10 23h00 — antes, o MESMO dia (20/10) que a de hoje
  });
  await abrirConversa();
  const lista = container.querySelector('.chat-conv-item') && bolha('HOJE-MANHA').closest('[class*="messages"]');
  expect(lista).toBeTruthy();
  await act(async () => { lista.dispatchEvent(new Event('scroll', { bubbles: true })); });
  await esperar(() => bolha('ONTEM-NOITE'));
  expect(sequencia()).toEqual(['[Ontem]', 'ONTEM-NOITE', '[Hoje]', 'HOJE-MANHA']); // antes ['[Hoje]', 'ONTEM-NOITE', 'HOJE-MANHA']
});

test('[RN-170.01] Chat: a mensagem ilegivel nao derruba a tela (antes RangeError) e a seguinte compara com a ultima legivel', async () => {
  rotasDoChat({
    conversas: [{ id: 1, tipo: 'direta', titulo: 'Bia', nao_lidas: 0, updated_at: 'lixo',
      ultima_mensagem: { conteudo: 'X', tipo: 'texto', autor_nome: 'Bia', created_at: 'lixo' } }],
    mensagens: [
      MSG(30, '2026-10-18 15:00:00', 'ANTIGA'),
      MSG(31, 'lixo', 'ILEGIVEL'),
      MSG(32, '2026-10-21 01:30:00', 'HOJE-NOITE'),
      MSG(33, '', 'VAZIA'),
    ],
  });
  await abrirConversa();
  expect(container.querySelector('.chat-conv-item time').textContent).toBe('');
  expect(horaDe('ILEGIVEL')).toBe('');
  expect(horaDe('VAZIA')).toBe('');
  expect(horaDe('HOJE-NOITE')).toBe('22:30'); // a metade positiva
  expect(sequencia()).toEqual(['[18/10/2026]', 'ANTIGA', 'ILEGIVEL', '[Hoje]', 'HOJE-NOITE', 'VAZIA']);
  expect(separadores()).not.toContain('');
});

// ── Compras ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const PLANILHA = { nome: 'precos.xlsx', linhas: [['Codigo', 'Preco'], ['A1', '10']] };

test('[RN-170.02] a planilha do fornecedor recarregada: *Salva em* na hora de Brasilia, na pagina e no modal', async () => {
  em('/compras/fornecedores/7', { id: 7, razao_social: 'FORN 170' });
  em('/compras/fornecedores/7/itens', []);
  em('/compras/fornecedores/7/planilha', { ...PLANILHA, atualizado_em: BANCO });
  await montar(<Routes><Route path="/f/:fornecedorId" element={<ItensFornecedor />} /></Routes>, '/f/7');
  await esperar(() => container.textContent.includes('Salva em'));
  const salvas = () => [...container.querySelectorAll('p')].filter((p) => p.textContent.startsWith('Salva em')).map((p) => p.textContent);
  expect(salvas()).toEqual(['Salva em 20/10/2026, 22:30:05']); // antes 21/10/2026, 01:30:05
  await clicar(botao('Visualizar'));
  await esperar(() => salvas().length === 2);
  expect(salvas()).toEqual(['Salva em 20/10/2026, 22:30:05', 'Salva em 20/10/2026, 22:30:05']);
});

test('[RN-170.02] a planilha logo depois de salvar (o ISO com Z do relogio) e recarregada dizem a mesma hora', async () => {
  em('/compras/fornecedores/7', { id: 7, razao_social: 'FORN 170' });
  em('/compras/fornecedores/7/itens', []);
  em('/compras/fornecedores/7/planilha', {});
  api.post.mockResolvedValue({ data: { success: true } });
  await montar(<Routes><Route path="/f/:fornecedorId" element={<ItensFornecedor />} /></Routes>, '/f/7');
  await esperar(() => container.querySelector('input[type="file"]'));
  const input = container.querySelector('input[type="file"]');
  const arquivo = new File(['Codigo,Preco\nA1,10\n'], 'precos.csv', { type: 'text/csv' });
  Object.defineProperty(input, 'files', { value: [arquivo] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await esperar(() => container.textContent.includes('Salva em'));
  expect(api.post).toHaveBeenCalledWith('/compras/fornecedores/7/planilha', expect.objectContaining({ nome: 'precos.csv' }));
  expect([...container.querySelectorAll('p')].find((p) => p.textContent.startsWith('Salva em')).textContent)
    .toBe('Salva em 20/10/2026, 22:30:00');
});

test('[RN-170.02] a exportacao de fornecedores: *Cadastrado em* no dia de Brasilia (antes o dia UTC)', async () => {
  em('/compras/fornecedores', [
    { id: 1, razao_social: 'NOITE 170', status: 'ativo', created_at: BANCO }, // 20/10 22h30 — antes 21/10
    { id: 2, razao_social: 'DIA 170', status: 'ativo', created_at: '2026-09-16 10:33:00' },
    { id: 3, razao_social: 'MADRUGADA 170', status: 'ativo', created_at: '2026-10-20 02:59:59' }, // 19/10 23h59 — antes 20/10
    { id: 4, razao_social: 'SEM 170', status: 'ativo', created_at: null },
    { id: 5, razao_social: 'ILEGIVEL 170', status: 'ativo', created_at: 'lixo' },
  ]);
  await montar(<Compras />, '/compras/fornecedores');
  await esperar(() => container.textContent.includes('NOITE 170'));
  await clicar(botao('Exportar Excel'));
  expect(exportToExcel).toHaveBeenCalledTimes(1);
  const [linhas] = exportToExcel.mock.calls[0];
  expect(linhas.map((l) => [l['Razão Social'], l['Cadastrado em']])).toEqual([
    ['NOITE 170', '20/10/2026'], ['DIA 170', '16/09/2026'], ['MADRUGADA 170', '19/10/2026'], ['SEM 170', '-'], ['ILEGIVEL 170', 'lixo'],
  ]);
});

// ── Almoxarifado: telas ───────────────────────────────────────────────────────────────────────────────────────────────────────────
test('[RN-170.03] o lote: *(anexado em …)* do certificado no dia de Brasilia; ilegivel, o texto gravado', async () => {
  em('/almoxarifado/materiais', [{ id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC' }]);
  const LOTE = { status: 'ATIVO', data_validade: '2030-01-01', vencido: false, vencimento_liberado: false, saldo: 1, elegivel: true,
    certificado_arquivo: 'c.pdf', certificado_url: '/api/uploads/almoxarifado/c.pdf?exp=1&sig=a' };
  em('/almoxarifado/materiais/10/lotes', [
    { ...LOTE, id: 1, codigo: 'L-NOITE', certificado_em: BANCO },
    { ...LOTE, id: 2, codigo: 'L-ILEGIVEL', certificado_em: 'lixo' },
    { ...LOTE, id: 3, codigo: 'L-DIA', certificado_em: '2026-10-20 15:00:00' },
  ]);
  await montar(<LotesAlmoxarifado />);
  await esperar(() => container.querySelector('.almox-filters select.almox-select option[value="10"]'));
  await escolher(container.querySelector('.almox-filters select.almox-select'), 10);
  await esperar(() => container.textContent.includes('L-NOITE'));
  const anexadoDe = (codigo) => {
    const tr = [...container.querySelectorAll('.almox-table tbody tr')].find((t) => t.textContent.includes(codigo));
    return /\(anexado em ([^)]*)\)/.exec(tr.textContent)[1];
  };
  expect(anexadoDe('L-NOITE')).toBe('20/10/2026'); // antes 21/10/2026
  expect(anexadoDe('L-ILEGIVEL')).toBe('lixo'); // antes Invalid Date
  expect(anexadoDe('L-DIA')).toBe('20/10/2026');
});

test('[RN-170.03] os anexos: a data do anexo no dia de Brasilia; vazio some, ilegivel aparece como veio', async () => {
  em('/almoxarifado/anexos', [
    { id: 1, nome_original: 'NOITE.pdf', tipo: 'OUTRO', tamanho_bytes: 2048, uploaded_by_nome: 'Ana', created_at: BANCO },
    { id: 2, nome_original: 'SEM.pdf', tipo: 'OUTRO', tamanho_bytes: 2048, uploaded_by_nome: 'Ana', created_at: null },
    { id: 3, nome_original: 'ILEGIVEL.pdf', tipo: 'OUTRO', tamanho_bytes: 2048, uploaded_by_nome: 'Ana', created_at: 'lixo' },
  ]);
  await montar(<AnexosDocumento entidade="recebimento" entidadeId={5} titulo="Anexos" />);
  await esperar(() => container.querySelector('[data-testid="anexo-linha-1"]'));
  const meta = (id) => container.querySelector(`[data-testid="anexo-linha-${id}"] .almox-anexos-meta`).textContent;
  expect(meta(1)).toBe('Outro · 2.0 KB · Ana · 20/10/2026'); // antes … · 21/10/2026
  expect(meta(2)).toBe('Outro · 2.0 KB · Ana');
  expect(meta(3)).toBe('Outro · 2.0 KB · Ana · lixo');
});

test('[RN-170.03] as ferramentas: a *Retirada* no dia de Brasilia, no formato da tela (AAAA-MM-DD)', async () => {
  em('/almoxarifado/ferramentas', []);
  em('/almoxarifado/calibracoes/painel', { vencidas: [], a_vencer: [] });
  const E = { ferramenta_id: 1, ferramenta_nome: 'Paquimetro', colaborador_nome: 'Joao', setor: null, data_prevista_devolucao: '2026-10-25',
    data_devolucao_real: null, status: 'EMPRESTADA', observacoes: null };
  em('/almoxarifado/emprestimos', [
    { ...E, id: 1, codigo_patrimonio: 'FER-NOITE', data_retirada: BANCO },
    { ...E, id: 2, codigo_patrimonio: 'FER-SODATA', data_retirada: '2026-08-01' },
    { ...E, id: 3, codigo_patrimonio: 'FER-ILEGIVEL', data_retirada: 'lixo-de-texto' },
  ]);
  await montar(<FerramentasAlmoxarifado />, '/almoxarifado/ferramentas');
  await esperar(() => botao('Empréstimos'));
  await clicar(botao('Empréstimos'));
  await esperar(() => container.textContent.includes('FER-NOITE'));
  const retirada = (cod) => {
    const tr = [...container.querySelectorAll('.almox-emprestimo-lista tbody tr')].find((t) => t.textContent.includes(cod));
    return tr.querySelectorAll('td')[2].textContent;
  };
  expect(retirada('FER-NOITE')).toBe('2026-10-20'); // antes 2026-10-21
  expect(retirada('FER-SODATA')).toBe('2026-08-01');
  expect(retirada('FER-ILEGIVEL')).toBe('lixo-de-te');
});

// ── Almoxarifado: os dois PDFs, do clique ao papel ────────────────────────────────────────────────────────────────────────────────
test('[RN-170.04] o PDF da remessa gerado as 22h30: *Gerado em 20/10/2026* (antes 21/10) e o prazo no dia gravado', async () => {
  const REM = { id: 1, numero: 'REM-170', fornecedor_nome: 'Galvan 170', tipo_servico: 'Galvanizacao', status: 'ENVIADA',
    prazo_previsto: '2026-10-21', vencida: 0, itens_total: 1, proprietario_cliente_id: null, proprietario_cliente_nome: null };
  rotas.push([(u) => u.startsWith('/almoxarifado/remessas-terceiros/1'), { ...REM, itens: [
    { id: 11, material_id: 101, material_codigo: 'CHP-3MM', material_nome: 'Chapa', unidade: 'PC', quantidade: 3, quantidade_retornada: 0,
      pendente: 3, peso: null }], retornos: [] }]);
  rotas.push([(u) => u.startsWith('/almoxarifado/remessas-terceiros'), [REM]]);
  await montar(<RemessasTerceirosAlmoxarifado />);
  await esperar(() => container.textContent.includes('REM-170'));
  const linha = [...container.querySelectorAll('.almox-remessa-lista tbody tr')].find((tr) => tr.textContent.includes('REM-170'));
  await clicar(botao('Abrir', linha));
  await esperar(() => botao('PDF da remessa'));
  await clicar(botao('PDF da remessa'));
  expect(mockPapel).toContain('Gerado em 20/10/2026');
  expect(mockPapel.filter((t) => t.startsWith('Gerado em'))).toEqual(['Gerado em 20/10/2026']);
  expect(mockPapel).toContain('Prazo previsto: 21/10/2026   ·   Status: ENVIADA');
});

test('[RN-170.04] o PDF da posicao do cliente gerado as 22h30: *Gerado em 20/10/2026* (antes 21/10)', async () => {
  em('/almoxarifado/materiais-cliente/clientes', [{ cliente_id: 1, cliente_nome: 'CLI 170', materiais: 1, saldo_total: 4 }]);
  rotas.push([(u) => u.includes('/materiais-cliente/posicao?cliente_id=1'), {
    cliente: { id: 1, razao_social: 'CLI 170' },
    itens: [{ material_id: 11, codigo: 'CHP', nome: 'Chapa', unidade: 'PC', recebido: 4, consumido: 0, devolvido: 0, saldo: 4, saldo_disponivel: 4 }],
    aplicacoes: [],
  }]);
  await montar(<MateriaisClienteAlmoxarifado />);
  await esperar(() => container.querySelector('.almox-filters select.almox-select option[value="1"]'));
  await escolher(container.querySelector('.almox-filters select.almox-select'), 1);
  await esperar(() => botao('PDF') && !botao('PDF').disabled);
  await clicar(botao('PDF'));
  expect(mockPapel.filter((t) => t.startsWith('Gerado em'))).toEqual(['Gerado em 20/10/2026']);
  expect(mockPapel).toContain('Posição de materiais — CLI 170'); // a metade positiva: o papel e o desta posicao
});
