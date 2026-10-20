/**
 * Etapa 165 (RN-165.07, B1058; RN-165.05, B1056) — as datas das telas do Comercial no dia gravado e os instantes no relogio de Brasilia.
 *
 * `new Date('AAAA-MM-DD')` e a meia-noite UTC: no Brasil, 21h da VESPERA. Era assim que o sino, as Atividades (o cartao, o modal, a ordem),
 * o calendario, o painel (a tabela de lembretes e o mes do grafico) e a previsao de fechamento mostravam o lembrete e a validade — o dia
 * inteiro. E o `'AAAA-MM-DD HH:MM:SS'` do banco (UTC sem fuso) era lido como hora local (+3 h) na *Criada em*, na *Enviada em* e nos historicos.
 *
 * DEPENDE DO FUSO: o `client/jest.globalSetup.js` fixa America/Sao_Paulo; a guarda abaixo derruba o arquivo fora dele.
 * O mock de `services/api` e so a fronteira HTTP.
 * Plano: docs/superpowers/plans/2026-10-20-almoxarifado-etapa165-os-lembretes-e-a-validade-das-propostas-no-dia-de-brasilia.md
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import api from '../services/api';
import { lerDataDoBanco, formatarDataDoBanco, hojeLocalISO } from '../utils/dataLocal';
import { formatDateTimeBR } from '../utils/formatDate';
import Notificacoes from './Notificacoes';
import Atividades, { ordenarAtividades } from './Atividades';
import CalendarioAtividades from './CalendarioAtividades';
import DashboardVendas from './DashboardVendas';
import Dashboard, { rotuloDoMesDoHistorico } from './Dashboard';
import PropostaForm from './proposta/PropostaForm';
import HistoricoEdicoes from './proposta/HistoricoEdicoes';
import PropostaDetalhe from './proposta/PropostaDetalhe';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn(), defaults: {} },
}));
const mockAuth = { user: { id: 7, nome: 'Vend 165', role: 'admin', email: 'v165@t' }, loading: false };
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));
// o calendario de verdade guarda os eventos e a funcao de estilo que a tela lhe passa
const mockCal = { props: null };
// os graficos guardam os dados que a tela lhes passa (Fase 5 r3 K01: o rotulo do mes tem de chegar ao grafico)
const mockGraficos = {};
jest.mock('recharts', () => new Proxy({ __esModule: true }, { get: (alvo, nome) => (nome in alvo ? alvo[nome] : (p) => { (mockGraficos[nome] = mockGraficos[nome] || []).push(p); return p && p.children ? p.children : null; }) }));
jest.mock('react-big-calendar', () => ({ Calendar: (p) => { mockCal.props = p; return null; }, dateFnsLocalizer: () => ({}) }));

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
let container; let root; let respostas;
beforeAll(() => {
  // o jsdom nao tem os dois observadores que o painel e os graficos usam
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
  api.put.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: {} });
  mockCal.props = null;
  for (const k of Object.keys(mockGraficos)) delete mockGraficos[k];
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
const somaDias = (iso, n) => { const [a, m, d] = iso.split('-').map(Number); return hojeLocalISO(new Date(a, m - 1, d + n)); };
const BR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

test('guarda: o fuso desta suite e o de Brasilia (a meia-noite UTC e a vespera)', () => {
  expect(new Date('2026-10-20T00:00:00Z').getDate()).toBe(19);
});

test('[RN-165.07] lerDataDoBanco / formatarDataDoBanco / formatDateTimeBR: so data no dia gravado, instante do banco como UTC, ilegivel vazio', () => {
  const d = lerDataDoBanco('2026-10-20');
  expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 20, 0]);
  expect(formatarDataDoBanco('2026-10-20')).toBe('20/10/2026');
  expect(formatarDataDoBanco('2026-10-21 01:30:00')).toBe('20/10/2026'); // 22h30 de Brasilia
  expect(formatarDataDoBanco('2026-10-21T01:30:00.000Z')).toBe('20/10/2026');
  for (const v of ['', null, undefined, '30/10/2026', '2026-02-30', 'lixo', 42]) expect(formatarDataDoBanco(v)).toBe('-');
  expect(formatarDataDoBanco(null, '—')).toBe('—');
  expect(lerDataDoBanco('2026-02-30')).toBeNull();
  // Fase 5 r1 M1: coluna so de data com hora gravada pela API — o prefixo vale (como no servidor); sem soData, o instante UTC
  expect(formatarDataDoBanco('2026-11-30 01:00:00', '-', { soData: true })).toBe('30/11/2026');
  expect(formatarDataDoBanco('2026-11-30T01:00:00.000Z', '-', { soData: true })).toBe('30/11/2026');
  expect(formatarDataDoBanco('2026-11-30 01:00:00')).toBe('29/11/2026');
  expect(formatarDataDoBanco('2026-02-30 01:00:00', '-', { soData: true })).toBe('-');
  expect(formatDateTimeBR('2026-10-21 01:30:00')).toBe('20/10/2026 22:30'); // antes 21/10/2026 01:30
  expect(formatDateTimeBR('2026-10-20T13:00:00.000Z')).toBe('20/10/2026 10:00');
  expect(formatDateTimeBR('')).toBe('—');
});

test('[RN-165.07, Fase 2 I3] ordenarAtividades: o lembrete de amanha (so data) depois da atividade de hoje as 22h; vencidos primeiro; ilegivel no fim', () => {
  const agora = new Date(2026, 9, 20, 15, 0);
  const lista = [
    { id: 'amanha', data_agendada: '2026-10-21' },
    { id: 'ilegivel', data_agendada: '30/10/2026' },
    { id: 'ativ22h', data_agendada: '2026-10-21T01:00:00.000Z' }, // 20/10 22h de Brasilia
    { id: 'hoje', data_agendada: '2026-10-20' },
    { id: 'semData', data_agendada: null },
    { id: 'ontem', data_agendada: '2026-10-19' },
  ];
  expect(ordenarAtividades(lista, { vencidosPrimeiro: true }, agora).map((a) => a.id)).toEqual(['ontem', 'hoje', 'ativ22h', 'amanha', 'ilegivel', 'semData']);
  expect(ordenarAtividades(lista, {}, agora).map((a) => a.id)).toEqual(['ontem', 'hoje', 'ativ22h', 'amanha', 'ilegivel', 'semData']);
  // o vencido acima da data futura. (A particao "vencidos primeiro" e EQUIVALENTE a ordem pela data — vencido = data antes de hoje —, por
  // isso tira-la nao derruba nada: controle positivo C03 da 165, declarado; fica pela fidelidade ao comportamento de antes.)
  expect(ordenarAtividades([{ id: 'f', data_agendada: '2026-10-25' }, { id: 'v', data_agendada: '2026-10-01' }], { vencidosPrimeiro: true }, agora).map((a) => a.id)).toEqual(['v', 'f']);
  expect(lista[0].id).toBe('amanha'); // nao muda a lista recebida
  // Fase 5 r1 M1: o lembrete com hora conta pelo prefixo (o dia 21), depois da atividade de 20/10 22h; sem o tipo, seria 20/10 21h30 e ficaria antes
  expect(ordenarAtividades([{ id: 'lh', tipo: 'lembrete', data_agendada: '2026-10-21 00:30:00' }, { id: 'a', data_agendada: '2026-10-21T01:00:00.000Z' }], {}, agora).map((a) => a.id)).toEqual(['a', 'lh']);
});

test('[RN-165.07] o sino mostra a data do lembrete no dia gravado', async () => {
  respostas['/notificacoes'] = [{ id: 1, tipo: 'lembrete_proposta', titulo: 'Lembrete: E165-1', mensagem: 'ligar', data: '2026-10-20', prioridade: 'hoje', proposta_id: 1, cliente_nome: 'CLIENTE 165' },
    { id: 2, tipo: 'lembrete_proposta', titulo: 'Lembrete: E165-2', mensagem: 'com hora', data: '2026-10-21 01:00:00', prioridade: 'futuro', proposta_id: 2, cliente_nome: 'CLIENTE 165' }];
  await act(async () => { root.render(<MemoryRouter><Notificacoes /></MemoryRouter>); });
  await esperar(() => container.querySelector('.notificacoes-bell'));
  await clicar(container.querySelector('.notificacoes-bell'));
  const [item, comHora] = container.querySelectorAll('.notificacao-item');
  expect(item.textContent).toContain('20/10/2026');
  expect(item.textContent).not.toContain('19/10/2026');
  expect(comHora.textContent).toContain('21/10/2026'); // Fase 5 r1 M1: o prefixo (antes da correcao, 20/10)
});

test('[RN-165.07, Fase 2 I3/M13] as Atividades: o cartao e o modal no dia gravado, a ordem com o instante e o lembrete ilegivel sem derrubar a tela', async () => {
  const hoje = hojeLocalISO();
  const amanha = somaDias(hoje, 1);
  const as22 = new Date(...hoje.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))), 22, 0).toISOString();
  respostas['/atividades'] = [
    { id: 'lembrete_1', titulo: 'Lembrete: L-AMANHA', tipo: 'lembrete', origem: 'lembrete', proposta_id: 1, numero_proposta: 'L-AMANHA', data_agendada: amanha, status: 'pendente', prioridade: 'media' },
    { id: 'lembrete_2', titulo: 'Lembrete: L-ILEGIVEL', tipo: 'lembrete', origem: 'lembrete', proposta_id: 2, numero_proposta: 'L-ILEGIVEL', data_agendada: '30/10/2026', status: 'pendente', prioridade: 'media' },
    { id: 33, titulo: 'VISITA 22H', tipo: 'visita', data_agendada: as22, status: 'pendente', prioridade: 'media' },
  ];
  await act(async () => { root.render(<MemoryRouter><Atividades /></MemoryRouter>); });
  await esperar(() => container.querySelectorAll('.atividade-card').length === 3);
  const cards = [...container.querySelectorAll('.atividade-card')];
  expect(cards.map((c) => c.querySelector('h3').textContent)).toEqual(['VISITA 22H', 'Lembrete: L-AMANHA', 'Lembrete: L-ILEGIVEL']);
  expect(cards[1].textContent).toContain(`Lembrete para: ${BR(amanha)}`);
  expect(cards[2].textContent).toContain('Lembrete para: -');
  await clicar(cards[1]);
  await esperar(() => container.querySelector('.modal-lembrete'));
  expect(container.querySelector('.modal-lembrete').textContent).toContain(`Data do Lembrete: ${BR(amanha)}`);
});

test('[RN-165.07] o calendario: o lembrete no dia gravado (9h), sem o vermelho de vencido hoje; o de ontem escuro; o ilegivel fora', async () => {
  const hoje = hojeLocalISO();
  const ontem = somaDias(hoje, -1);
  const atividades = [
    { id: 'l1', titulo: 'L HOJE', tipo: 'lembrete', data_agendada: hoje, prioridade: 'alta' },
    { id: 'l2', titulo: 'L ONTEM', tipo: 'lembrete', data_agendada: ontem, prioridade: 'alta' },
    { id: 'l3', titulo: 'L ILEGIVEL', tipo: 'lembrete', data_agendada: '30/10/2026', prioridade: 'media' },
    { id: 'l4', titulo: 'L HOJE COM HORA', tipo: 'lembrete', data_agendada: `${hoje} 01:00:00`, prioridade: 'alta' },
  ];
  await act(async () => {
    root.render(<CalendarioAtividades atividades={atividades} view="month" date={new Date()} onNavigate={() => {}} onViewChange={() => {}}
      filtroTipo="todos" onFiltroTipoChange={() => {}} onSelectEvent={() => {}} clientes={[]} usuarios={[]} />);
  });
  await esperar(() => mockCal.props);
  const ev = Object.fromEntries(mockCal.props.events.map((e) => [e.id, e]));
  expect(Object.keys(ev).sort()).toEqual(['l1', 'l2', 'l4']);
  expect(hojeLocalISO(ev.l4.start)).toBe(hoje); // Fase 5 r1 M1: o prefixo do lembrete com hora (sem soData, a vespera)
  expect([hojeLocalISO(ev.l1.start), ev.l1.start.getHours()]).toEqual([hoje, 9]);
  expect(hojeLocalISO(ev.l2.start)).toBe(ontem);
  expect(mockCal.props.eventPropGetter(ev.l1).style.backgroundColor).toBe('#e74c3c');
  expect(mockCal.props.eventPropGetter(ev.l2).style.backgroundColor).toBe('#c0392b');
});

test('[RN-165.07] o painel: a data do lembrete no dia gravado e o rotulo do mes do historico', async () => {
  expect(rotuloDoMesDoHistorico('2026-10')).toBe(new Date(2026, 9, 1).toLocaleString('pt-BR', { month: 'short' }));
  expect(rotuloDoMesDoHistorico('2026-01')).toBe(new Date(2026, 0, 1).toLocaleString('pt-BR', { month: 'short' }));
  expect(rotuloDoMesDoHistorico('2026-10')).not.toBe(new Date(2026, 8, 1).toLocaleString('pt-BR', { month: 'short' }));
  expect(rotuloDoMesDoHistorico(null)).toBeNull();
  respostas['/dashboard'] = {};
  respostas['/dashboard/avancado'] = { cotacoesComLembrete: [
    { id: 9, numero_proposta: 'E165-9', razao_social: 'CLIENTE 165', titulo: 'T', lembrete_data: '2026-10-20', lembrete_mensagem: 'm', status: 'enviada', lembrete_vencido: 0 },
    { id: 10, numero_proposta: 'E165-10', razao_social: 'CLIENTE 165', titulo: 'T', lembrete_data: '2026-10-21 01:00:00', lembrete_mensagem: 'm', status: 'enviada', lembrete_vencido: 0 },
  ] };
  await act(async () => { root.render(<MemoryRouter><Dashboard /></MemoryRouter>); });
  await esperar(() => container.querySelector('.lembretes-table'));
  const linha = [...container.querySelectorAll('.lembretes-table tbody tr')].find((tr) => tr.textContent.includes('E165-9'));
  expect(linha.textContent).toContain('20/10/2026');
  expect(linha.textContent).not.toContain('19/10/2026');
  const comHora = [...container.querySelectorAll('.lembretes-table tbody tr')].find((tr) => tr.textContent.includes('E165-10'));
  expect(comHora.textContent).toContain('21/10/2026');
});

test('[RN-165.07] a previsao de fechamento mostra a validade no dia gravado', async () => {
  respostas['/dashboard/vendas'] = { funilVendas: [], pipeline: { valorTotal: 0, valorPorEtapa: {}, tempoMedioPorEtapa: {}, previsaoFechamento: [
    { id: 1, numero_proposta: 'E165-V', titulo: 'T', valor: 10, validade: '2026-10-20', dias_restantes: 0, probabilidade: 80 },
    { id: 2, numero_proposta: 'E165-H', titulo: 'T', valor: 10, validade: '2026-10-21 01:00:00', dias_restantes: 1, probabilidade: 80 },
  ] }, analisePipeline: { totalPropostas: 0, valorTotal: 0, taxaConversao: 0, tempoMedioFechamento: 0 } };
  await act(async () => { root.render(<DashboardVendas />); });
  await esperar(() => container.querySelector('.previsao-item'));
  const [v1, v2] = container.querySelectorAll('.previsao-item');
  expect(v1.textContent).toContain('Validade: 20/10/2026');
  expect(v2.textContent).toContain('Validade: 21/10/2026'); // Fase 5 r1 M1: a validade com hora pelo prefixo
});

test('[RN-165.07, Fase 2 I8] o historico de edicoes da proposta: o instante do banco no relogio de Brasilia', async () => {
  respostas['/propostas/5/edicoes-log'] = { logs: [{ id: 1, tipo: 'campo', campo: 'titulo', usuario_nome: 'V', created_at: '2026-10-21 01:30:00', valor_anterior: 'a', valor_novo: 'b' }], total: 1 };
  await act(async () => { root.render(<HistoricoEdicoes propostaId={5} />); });
  await esperar(() => container.querySelector('.he-data'));
  expect(container.querySelector('.he-data').textContent).toContain('20/10/2026');
  expect(container.querySelector('.he-data').textContent).toContain('22:30');
});

test('[RN-165.05, B1056, Fase 2 I1] o formulario da proposta: marcar Aprovada as 22h30 preenche o fechamento com o dia local', async () => {
  // o relogio parado as 22h30 de 20/10 so para o `new Date()` sem argumento (os timers continuam os de verdade — o Jest 27 nao separa)
  const Real = Date;
  const as2230 = new Real(2026, 9, 20, 22, 30).getTime();
  global.Date = class extends Real { constructor(...a) { if (a.length === 0) super(as2230); else super(...a); } static now() { return as2230; } };
  try {
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-21'); // guarda: o dia UTC ja e amanha
    respostas['/propostas/1'] = { id: 1, numero_proposta: 'P-1', cliente_id: 3, titulo: 'T', status: 'enviada', margem_desconto: 0, valor_total: 10, responsavel_id: 7, itens: [] };
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/comercial/propostas/editar/1']}>
          <Routes><Route path="/comercial/propostas/editar/:id" element={<PropostaForm />} /></Routes>
        </MemoryRouter>
      );
    });
    await esperar(() => container.querySelector('option[value="aprovada"]'));
    const sel = container.querySelector('option[value="aprovada"]').closest('select');
    const campo = () => [...container.querySelectorAll('input[type="date"]')].find((i) => /fechamento/i.test(i.closest('div, label').textContent));
    expect(campo().value).toBe('');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, 'aprovada');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(campo().value).toBe('2026-10-20');
  } finally {
    global.Date = Real;
  }
});

test('[RN-165.07, Fase 2 M7] as cinco ordenacoes das Atividades (carregar, remover lembrete e as tres recargas do calendario) passam pelo ordenarAtividades', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, 'Atividades.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  expect(src.split('ordenarAtividades(atividadesRes.data, { vencidosPrimeiro: true })').length - 1).toBe(2);
  expect(src.split('ordenarAtividades(atividadesRes.data)').length - 1).toBe(3);
  expect(src).not.toMatch(/new Date\([ab]\.data_agendada\)/);
  expect(src).not.toMatch(/\(atividadesRes\.data \|\| \[\]\)\.sort/);
});

// ── Fase 5 r3: as asserções que faltavam no navegador (cada uma nomeia a sabotagem que derruba) ──
test('[Fase 5 r3 K13] o detalhe da proposta: Criada em, Enviada em e o historico de status no relogio de Brasilia', async () => {
  respostas['/propostas/5'] = { id: 5, numero_proposta: 'E165-D', titulo: 'T', status: 'enviada', valor_total: 10, validade: '2026-10-30',
    created_at: '2026-10-21 01:30:00', enviada_em: '2026-10-21 02:00:00' };
  respostas['/propostas/5/status-history'] = [{ created_at: '2026-10-21 01:45:00', status_anterior: 'rascunho', status_novo: 'enviada', usuario_nome: 'V' }];
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/comercial/propostas/detalhe/5']}><Routes><Route path="/comercial/propostas/detalhe/:id" element={<PropostaDetalhe />} /></Routes></MemoryRouter>);
  });
  await esperar(() => container.textContent.includes('Criada em'));
  const texto = container.textContent;
  expect(texto).toContain('Criada em20/10/2026 22:30');
  expect(texto).toContain('Enviada em20/10/2026 23:00');
  expect(container.querySelector('.proposta-detalhe-timeline .data').textContent).toBe('20/10/2026 22:45');
  expect(texto).toContain('Validade30/10/2026');
});

test('[Fase 5 r3 K01] o painel usa o rotulo do mes no grafico de evolucao (os dados que chegam ao grafico)', async () => {
  respostas['/dashboard'] = {};
  respostas['/dashboard/historico'] = [{ mes: '2026-10', clientes: 1, projetos: 1, propostas_aprovadas: 0 }];
  await act(async () => { root.render(<MemoryRouter><Dashboard /></MemoryRouter>); });
  await esperar(() => (mockGraficos.ComposedChart || []).some((p) => p && Array.isArray(p.data) && p.data.length === 1));
  const chamadas = (mockGraficos.ComposedChart || []).filter((p) => p && Array.isArray(p.data));
  expect(chamadas.length).toBeGreaterThan(0);
  const nomes = chamadas[chamadas.length - 1].data.map((x) => x.name);
  expect(nomes).toEqual([new Date(2026, 9, 1).toLocaleString('pt-BR', { month: 'short' })]);
});

test('[Fase 5 r3 K03/K05/K20] bordas: o historico de edicoes com data ilegivel, o instante sem segundos ou com fracao, o ano de dois digitos', async () => {
  expect(formatDateTimeBR('2026-10-21 01:30')).toBe('20/10/2026 22:30');
  expect(formatDateTimeBR('2026-10-21 01:30:00.123')).toBe('20/10/2026 22:30');
  expect(lerDataDoBanco('0050-01-01')).toBeNull();
  respostas['/propostas/6/edicoes-log'] = { logs: [{ id: 1, tipo: 'campo', campo: 'titulo', usuario_nome: 'V', created_at: 'lixo', valor_anterior: 'a', valor_novo: 'b' }], total: 1 };
  await act(async () => { root.render(<HistoricoEdicoes propostaId={6} />); });
  await esperar(() => container.querySelector('.he-data'));
  expect(container.querySelector('.he-data').textContent).toBe('—');
});

test('[Fase 5 r3 K04] o formulario da proposta: marcar Rejeitada as 22h30 tambem preenche o fechamento com o dia local', async () => {
  const Real = Date;
  const as2230 = new Real(2026, 9, 20, 22, 30).getTime();
  global.Date = class extends Real { constructor(...a) { if (a.length === 0) super(as2230); else super(...a); } static now() { return as2230; } };
  try {
    respostas['/propostas/1'] = { id: 1, numero_proposta: 'P-1', cliente_id: 3, titulo: 'T', status: 'enviada', margem_desconto: 0, valor_total: 10, responsavel_id: 7, itens: [] };
    await act(async () => {
      root.render(<MemoryRouter initialEntries={['/comercial/propostas/editar/1']}><Routes><Route path="/comercial/propostas/editar/:id" element={<PropostaForm />} /></Routes></MemoryRouter>);
    });
    await esperar(() => container.querySelector('option[value="rejeitada"]'));
    const sel = container.querySelector('option[value="rejeitada"]').closest('select');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, 'rejeitada');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const campo = [...container.querySelectorAll('input[type="date"]')].find((i) => /fechamento/i.test(i.closest('div, label').textContent));
    expect(campo.value).toBe('2026-10-20');
  } finally {
    global.Date = Real;
  }
});
