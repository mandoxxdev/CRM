/**
 * Etapa 169 (RN-169.01/02/03/04, B1073–B1076) — as datas das Aprovações, das Ordens de Serviço e das Tarefas no dia e na hora de Brasília.
 *
 * Tres leituras erradas, uma por forma de coluna:
 *   - so data (`'AAAA-MM-DD'` — a abertura e a previsao da OS, o prazo da tarefa): `new Date(texto)` e a meia-noite UTC — a VESPERA, o dia
 *     inteiro; e a contagem de *vencidas* contava a OS prevista para hoje (o aviso do cartao, desde as 21h da vespera);
 *   - instante do banco (`CURRENT_TIMESTAMP`, `'AAAA-MM-DD HH:MM:SS'` UTC sem fuso): lido como hora local (3 h adiantada; das 21h a
 *     meia-noite, o dia seguinte) — o *Criada* das tarefas e a *Data Aprovacao* das propostas aprovadas;
 *   - as Aprovacoes liam como UTC E tiravam mais 3 h a mao — 3 h atrasadas.
 *
 * O RELOGIO fica parado as 22h30 de 20/10/2026 (Brasilia — 01h30 de 21/10 em UTC), a janela em que o dia UTC ja virou: `global.Date` vira
 * uma subclasse com o "agora" fixo (o Jest 27 desta base fakeia o `setTimeout` junto com o relogio — o molde do PedidoCompraForm (q)).
 * DEPENDE DO FUSO: o `client/jest.globalSetup.js` fixa America/Sao_Paulo; a guarda abaixo derruba o arquivo fora dele.
 * O mock de `services/api` e so a fronteira HTTP (as rotas devolvem as colunas cruas — Fase 0 do plano).
 * Plano: docs/superpowers/plans/2026-10-20-almoxarifado-etapa169-as-datas-das-aprovacoes-das-os-e-das-tarefas-no-dia-de-brasilia.md
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import api from '../services/api';
import Aprovacoes from './Aprovacoes';
import OrdensServicoComercial, { osVencida } from './OrdensServicoComercial';
import OSComercialForm from './OSComercialForm';
import OrdensServico from './operacional/OrdensServico';
import OSFormPage from './operacional/OSFormPage';
import ProducaoMES from './operacional/Producao';
import TodolistBoard from './todolist/TodolistBoard';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn(), patch: jest.fn(), defaults: { baseURL: '/api' } },
}));
const mockAuth = { user: { id: 1, nome: 'Admin 169', role: 'admin', is_superadmin: 1, email: 'a169@t' }, loading: false };
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../utils/userFilters', () => ({
  fetchModuleUsers: () => Promise.resolve([]),
  fetchComercialResponsaveis: () => Promise.resolve([]),
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn(), warn: jest.fn() } }));

const RealDate = Date;
// 22h30 de 20/10/2026 em Brasilia (o construtor LOCAL, de proposito) = 01h30 de 21/10 em UTC
const AGORA = new RealDate(2026, 9, 20, 22, 30, 0);
class DataFixa extends RealDate {
  constructor(...a) { if (a.length === 0) super(AGORA.getTime()); else super(...a); }
  static now() { return AGORA.getTime(); }
}

// o instante do banco: 22h30m05s de Brasilia de 20/10/2026
const BANCO = '2026-10-21 01:30:05';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
let container; let root; let respostas;
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  respostas = {};
  const caminho = (url) => String(url).split('?')[0];
  api.get.mockImplementation((url) => Promise.resolve({ data: caminho(url) in respostas ? respostas[caminho(url)] : [] }));
  api.post.mockResolvedValue({ data: {} });
  api.put.mockResolvedValue({ data: {} });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  global.Date = DataFixa;
});
afterEach(() => {
  global.Date = RealDate;
  act(() => root.unmount());
  container.remove();
});
async function esperar(cond, ms = 4000) {
  const fim = RealDate.now() + ms; // o Date.now() da suite esta parado
  while (RealDate.now() < fim) { if (cond()) return; await act(async () => { await pausa(20); }); }
  throw new Error('a condicao nao chegou: ' + container.textContent.slice(0, 400));
}
const clicar = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const montar = async (el, entrada = '/') => {
  await act(async () => { root.render(<MemoryRouter initialEntries={[entrada]}>{el}</MemoryRouter>); });
};
const celulas = (tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim());
const linhaDe = (texto) => [...container.querySelectorAll('tr')].find((tr) => tr.textContent.includes(texto));

test('guarda: o fuso e o de Brasilia e o relogio esta parado as 22h30 de 20/10 (ja 21/10 em UTC)', () => {
  expect(new RealDate('2026-10-21T01:30:05Z').toLocaleString('pt-BR')).toBe('20/10/2026, 22:30:05');
  expect(new RealDate('2026-10-20').toLocaleDateString('pt-BR')).toBe('19/10/2026'); // a leitura antiga erra — o teste discrimina
  global.Date = DataFixa;
  expect(new Date().toISOString()).toBe('2026-10-21T01:30:00.000Z');
  expect(new Date().getDate()).toBe(20);
  expect(new Date('2026-10-20').getUTCDate()).toBe(20); // com argumento, a data pedida
});

test('[RN-169.01] Aprovacoes: a Data da lista, a Data da Solicitacao e a decisao na hora de Brasilia (antes 3 h atrasadas)', async () => {
  respostas['/aprovacoes'] = [
    { id: 1, proposta_id: 11, numero_proposta: 'PROP-169-NOITE', status: 'aprovado', valor_total: 1000, valor_com_desconto: 900,
      valor_desconto: 10, created_at: '2026-10-21 01:30:00', aprovado_em: '2026-10-21 04:30:00', aprovado_por_nome: 'APROVADOR 169',
      solicitado_por: 2, solicitado_por_nome: 'VEND 169', cliente_nome: 'CLI 169' },
    { id: 2, proposta_id: 12, numero_proposta: 'PROP-169-ILEGIVEL', status: 'rejeitado', valor_total: 1000, valor_com_desconto: 900,
      valor_desconto: 10, created_at: 'lixo', aprovado_em: '2026-10-20 15:00:00', aprovado_por_nome: 'APROVADOR 169',
      solicitado_por: 2, solicitado_por_nome: 'VEND 169', cliente_nome: 'CLI 169' },
    { id: 3, proposta_id: 13, numero_proposta: 'PROP-169-SEM', status: 'pendente', valor_total: 1000, valor_com_desconto: 900,
      valor_desconto: 10, created_at: null, solicitado_por: 2, solicitado_por_nome: 'VEND 169', cliente_nome: 'CLI 169' },
  ];
  await montar(<Aprovacoes />);
  await esperar(() => container.textContent.includes('PROP-169-NOITE'));
  // a celula exata: 22:30 (antes 19:30)
  expect(celulas(linhaDe('PROP-169-NOITE'))).toContain('20/10/2026 às 22:30');
  expect(linhaDe('PROP-169-NOITE').textContent).not.toContain('19:30');
  expect(celulas(linhaDe('PROP-169-ILEGIVEL'))).toContain('lixo'); // antes '-'
  expect(celulas(linhaDe('PROP-169-SEM'))).toContain('-');
  // o gesto seguinte: abrir o detalhe — a solicitacao (22h30 de 20/10) e a aprovacao (01h30 de 21/10 — antes 22:30 da VESPERA)
  await clicar(linhaDe('PROP-169-NOITE').querySelector('button[title="Ver detalhes"]'));
  await esperar(() => container.textContent.includes('Data da Solicitação'));
  const solicitacao = [...container.querySelectorAll('.detail-item')].find((d) => d.textContent.includes('Data da Solicitação'));
  expect(solicitacao.querySelector('span').textContent).toBe('20/10/2026 às 22:30');
  const aprovado = [...container.querySelectorAll('.detail-section')].find((d) => d.textContent.includes('Aprovado Por'));
  expect(aprovado.querySelector('p').textContent).toBe('APROVADOR 169 em 21/10/2026 às 01:30');
});

test('[RN-169.01] Aprovacoes: a Data da Rejeicao no detalhe (antes 3 h atrasada)', async () => {
  respostas['/aprovacoes'] = [
    { id: 2, proposta_id: 12, numero_proposta: 'PROP-169-REJ', status: 'rejeitado', valor_total: 1000, valor_com_desconto: 900,
      valor_desconto: 10, created_at: '2026-10-20 15:00:00', aprovado_em: '2026-10-21 01:30:00', aprovado_por_nome: 'APROVADOR 169',
      motivo_rejeicao: 'caro', solicitado_por: 2, solicitado_por_nome: 'VEND 169', cliente_nome: 'CLI 169' },
  ];
  await montar(<Aprovacoes />);
  await esperar(() => container.textContent.includes('PROP-169-REJ'));
  expect(celulas(linhaDe('PROP-169-REJ'))).toContain('20/10/2026 às 12:00');
  await clicar(linhaDe('PROP-169-REJ').querySelector('button[title="Ver detalhes"]'));
  await esperar(() => container.textContent.includes('Data da Rejeição'));
  const rotulo = [...container.querySelectorAll('label')].find((l) => l.textContent === 'Data da Rejeição:');
  expect(rotulo.parentElement.querySelector('p').textContent).toBe('20/10/2026 às 22:30'); // antes 20/10/2026 às 19:30
});

const OS_COMERCIAL = [
  { id: 1, numero_os: 'OS-169-ONTEM', status: 'pendente', data_abertura: '2026-10-10', data_prevista: '2026-10-19', cliente_nome: 'C1' },
  { id: 2, numero_os: 'OS-169-HOJE', status: 'pendente', data_abertura: '2026-10-20', data_prevista: '2026-10-20', cliente_nome: 'C2' },
  { id: 3, numero_os: 'OS-169-AMANHA', status: 'em_andamento', data_abertura: '2026-10-20', data_prevista: '2026-10-21', cliente_nome: 'C3' },
  { id: 4, numero_os: 'OS-169-CONCLUIDA', status: 'concluido', data_abertura: '2026-10-01', data_prevista: '2026-10-19', cliente_nome: 'C4' },
  { id: 5, numero_os: 'OS-169-SEM', status: 'pendente', data_abertura: '2026-10-20', data_prevista: null, cliente_nome: 'C5' },
];

test('[RN-169.03] a regra da OS vencida: a prevista ANTES de hoje (o dia local), nao concluida', () => {
  const agora = new RealDate(2026, 9, 20, 22, 30);
  expect(OS_COMERCIAL.map((os) => osVencida(os, agora))).toEqual([true, false, false, false, false]);
  expect(osVencida({ status: 'pendente', data_prevista: 'lixo' }, agora)).toBe(false);
  expect(osVencida({ status: 'pendente', data_prevista: '2026-10-20 23:00:00' }, agora)).toBe(false); // o prefixo vale
  expect(osVencida({ status: 'pendente', data_prevista: '2026-10-20' }, new RealDate(2026, 9, 21, 0, 0))).toBe(true); // a meia-noite vira
  expect(osVencida({ status: 'cancelado', data_prevista: '2026-10-19' }, agora)).toBe(true); // C424: inalterado
});

const cartaoDe = (numero) => [...container.querySelectorAll('.os-card')].find((c) => c.textContent.includes(numero));
const valorDoCartao = (cartao, rotulo) => {
  const linha = [...cartao.querySelectorAll('.os-info-row')].find((r) => r.querySelector('strong')?.textContent === rotulo);
  return linha && linha.querySelector('span').textContent;
};

test('[RN-169.02/03] OS do Comercial: as datas do cartao no dia gravado; Vencidas conta so a de ontem — no contador, no filtro e no aviso', async () => {
  respostas['/comercial/ordens-servico'] = OS_COMERCIAL;
  await montar(<OrdensServicoComercial />, '/comercial/ordens-servico');
  const abaOs = [...container.querySelectorAll('button')].find((b) => /Ordens de Servi/.test(b.textContent));
  await clicar(abaOs);
  await esperar(() => !!cartaoDe('OS-169-HOJE'));
  // as datas do cartao (antes a vespera)
  expect(valorDoCartao(cartaoDe('OS-169-HOJE'), 'Data Abertura')).toBe('20/10/2026');
  expect(valorDoCartao(cartaoDe('OS-169-HOJE'), 'Data Prevista')).toBe('20/10/2026');
  expect(valorDoCartao(cartaoDe('OS-169-ONTEM'), 'Data Prevista')).toBe('19/10/2026 ⚠️');
  expect(valorDoCartao(cartaoDe('OS-169-AMANHA'), 'Data Prevista')).toBe('21/10/2026');
  // o aviso do cartao: so a de ontem (antes as tres primeiras — a de amanha desde as 21h)
  const vencidos = OS_COMERCIAL.map((o) => cartaoDe(o.numero_os).classList.contains('vencida'));
  expect(vencidos).toEqual([true, false, false, false, false]);
  // o contador (antes 2 — a de hoje contava)
  expect(container.querySelector('.os-stat-card.stat-vencida h3').textContent).toBe('1');
  // o gesto seguinte: o filtro Vencidas
  const filtro = [...container.querySelectorAll('.status-filter-btn')].find((b) => /Vencidas/.test(b.textContent));
  await clicar(filtro);
  await esperar(() => !cartaoDe('OS-169-HOJE'));
  expect([...container.querySelectorAll('.os-card h3')].map((h) => h.textContent)).toEqual(['OS-169-ONTEM']);
  expect(container.querySelector('.os-stat-card.stat-vencida h3').textContent).toBe('1');
});

test('[RN-169.02] OS do Comercial: a Data Aprovacao da aba Propostas Aprovadas no dia de Brasilia (antes o dia seguinte); ilegivel, o texto', async () => {
  respostas['/comercial/ordens-servico'] = [];
  respostas['/propostas'] = [
    { id: 21, numero_proposta: 'PROP-169-APROV', cliente_nome: 'C', status: 'aprovada', valor_total: 10, updated_at: BANCO },
    { id: 22, numero_proposta: 'PROP-169-LIXO', cliente_nome: 'C', status: 'aprovada', valor_total: 10, updated_at: 'lixo' },
  ];
  respostas['/propostas/21'] = { itens: [] };
  respostas['/propostas/22'] = { itens: [] };
  await montar(<OrdensServicoComercial />, '/comercial/ordens-servico');
  await esperar(() => !!linhaDe('PROP-169-APROV'));
  expect(celulas(linhaDe('PROP-169-APROV'))[3]).toBe('20/10/2026');
  expect(celulas(linhaDe('PROP-169-LIXO'))[3]).toBe('lixo');
});

test('[RN-169.02] OS do Operacional: a Abertura e a Prevista da lista no dia gravado (antes a vespera)', async () => {
  respostas['/operacional/ordens-servico'] = [
    { id: 7, numero_os: 'OS-169-FAB', status: 'pendente', tipo_os: 'fabricacao', prioridade: 'normal', data_abertura: '2026-10-20',
      data_prevista: '2026-10-21', cliente_nome: 'C' },
    { id: 8, numero_os: 'OS-169-FAB-SEM', status: 'pendente', tipo_os: 'fabricacao', prioridade: 'normal', data_abertura: '2026-10-20',
      data_prevista: null, cliente_nome: 'C' },
  ];
  await montar(<OrdensServico />, '/fabrica/ordens-servico');
  await esperar(() => !!linhaDe('OS-169-FAB'));
  const c = celulas(linhaDe('OS-169-FAB'));
  expect(c).toContain('20/10/2026');
  expect(c).toContain('21/10/2026');
  expect(c).not.toContain('19/10/2026');
  expect(celulas(linhaDe('OS-169-FAB-SEM'))).toContain('-');
});

test('[RN-169.02] Detalhes da OS (Editar): a Data Abertura e a Data Prevista no dia gravado (antes a vespera)', async () => {
  respostas['/operacional/ordens-servico/9'] = { id: 9, numero_os: 'OS-169-DET', status: 'pendente', tipo_os: 'fabricacao',
    prioridade: 'normal', data_abertura: '2026-10-20', data_prevista: '2026-10-21', cliente_nome: 'C' };
  respostas['/operacional/ordens-servico/9/itens'] = [];
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/fabrica/ordens-servico/editar/9']}>
        <Routes><Route path="/fabrica/ordens-servico/editar/:id" element={<OSFormPage />} /></Routes>
      </MemoryRouter>,
    );
  });
  await esperar(() => container.textContent.includes('Data Abertura'));
  const valor = (rotulo) => [...container.querySelectorAll('.info-item-content')]
    .find((d) => d.querySelector('.info-item-label')?.textContent === rotulo).querySelector('.info-item-value').textContent.trim();
  expect(valor('Data Abertura')).toBe('20/10/2026');
  expect(valor('Data Prevista')).toBe('21/10/2026');
});

test('[RN-169.02] a previa ao criar a OS (Ver Preview): a abertura de hoje e a prevista digitada no dia gravado (antes a vespera)', async () => {
  const proposta = { id: 31, numero_proposta: 'PROP-169-PREV', cliente_id: 1, cliente_nome: 'C', valor_total: 10,
    itens: [{ id: 1, descricao: 'ITEM 169', quantidade: 1, valor_unitario: 10, valor_total: 10 }] };
  respostas['/operacional/ordens-servico/proximo-numero'] = { numero_os: 'OS-169-NOVA' };
  await montar(<OSComercialForm proposta={proposta} onClose={() => {}} />, '/comercial/ordens-servico/nova/31');
  const prevista = await (async () => {
    await esperar(() => [...container.querySelectorAll('label')].some((l) => /Data Prevista/.test(l.textContent)));
    return [...container.querySelectorAll('label')].find((l) => /Data Prevista/.test(l.textContent)).parentElement.querySelector('input');
  })();
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(prevista, '2026-10-21');
    prevista.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const botao = [...container.querySelectorAll('button')].find((b) => /Ver Preview/.test(b.textContent));
  expect(botao.disabled).toBe(false);
  await clicar(botao);
  await esperar(() => [...container.querySelectorAll('.info-item-label')].some((l) => l.textContent === 'Data Abertura'));
  const valor = (rotulo) => [...container.querySelectorAll('.info-item-content')]
    .find((d) => d.querySelector('.info-item-label')?.textContent === rotulo).querySelector('.info-item-value').textContent.trim();
  expect(valor('Data Abertura')).toBe('20/10/2026'); // o hoje local do formulario (antes 19/10/2026)
  expect(valor('Data Prevista')).toBe('21/10/2026'); // antes 20/10/2026
});

test('[RN-169.02] o quadro da Producao: o prazo do cartao no dia gravado (antes a vespera)', async () => {
  respostas['/operacional/producao/kanban'] = {
    etapas: ['CORTE'], colaboradores: [],
    itens: [{ id: 1, os_id: 9, descricao: 'ITEM 169 KANBAN', quantidade: 2, unidade: 'un', etapa_fabricacao: null, status_item: 'pendente',
      numero_os: 'OS-169-K', prioridade: 'NORMAL', data_prevista: '2026-10-20', cliente: 'C', percentual_conclusao: 0 }],
  };
  await montar(<ProducaoMES />);
  await esperar(() => container.textContent.includes('ITEM 169 KANBAN'));
  const meta = [...container.querySelectorAll('.producao-card-meta span')].map((s) => s.textContent.trim());
  expect(meta).toEqual(['2 un', '20/10/2026']);
});

test('[RN-169.04] Tarefas: o prazo e o Criada do cartao; o Criada em e o Resolvida em do formulario', async () => {
  respostas['/todolist/board'] = {
    usuarios: [],
    tarefas: [
      { id: 1, titulo: 'TAREFA 169 NOITE', status: 'a_fazer', prioridade: 'media', prazo: '2026-10-20', created_at: BANCO },
      { id: 2, titulo: 'TAREFA 169 FEITA', status: 'concluido', prioridade: 'media', prazo: '2026-10-20T02:00:00.000Z', created_at: BANCO,
        data_conclusao: '2026-10-21T01:30:05.000Z' },
      { id: 3, titulo: 'TAREFA 169 PRAZO LIXO', status: 'a_fazer', prioridade: 'media', prazo: 'amanha cedo talvez', created_at: null },
    ],
  };
  await montar(<TodolistBoard />);
  await esperar(() => container.textContent.includes('TAREFA 169 NOITE'));
  const cartao = (t) => [...container.querySelectorAll('.todolist-card')].find((c) => c.textContent.includes(t));
  const meta = (t) => [...cartao(t).querySelectorAll('.todolist-card-meta span')].map((s) => s.textContent.trim());
  const datas = (t) => [...cartao(t).querySelectorAll('.todolist-card-datas span')].map((s) => s.textContent.trim());
  expect(meta('TAREFA 169 NOITE')).toEqual(['Sem responsável', '20/10/2026']); // antes 19/10/2026
  expect(datas('TAREFA 169 NOITE')).toEqual(['Criada 20/10/2026']); // antes 21/10/2026
  expect(meta('TAREFA 169 FEITA')).toEqual(['Sem responsável', '20/10/2026']); // o prefixo, como o formulario
  expect(datas('TAREFA 169 FEITA')).toEqual(['Criada 20/10/2026', 'Resolvida 20/10/2026, 22:30']);
  expect(meta('TAREFA 169 PRAZO LIXO')).toEqual(['Sem responsável', 'amanha ced']);
  expect(datas('TAREFA 169 PRAZO LIXO')).toEqual(['Criada']);
  // o gesto seguinte: abrir a tarefa — o Criada em e o prazo do formulario
  await clicar(cartao('TAREFA 169 FEITA'));
  await esperar(() => container.textContent.includes('Criada em:'));
  const info = [...container.querySelectorAll('.todolist-meta-info span')].map((s) => s.textContent.trim());
  expect(info).toEqual(['Criada em: 20/10/2026, 22:30', 'Resolvida em: 20/10/2026, 22:30']); // antes Criada em: 21/10/2026, 01:30
  expect(container.querySelector('input[type="date"]').value).toBe('2026-10-20');
});

test('[RN-169.04] Tarefas: o Criada em sem data continua "—"', async () => {
  respostas['/todolist/board'] = { usuarios: [], tarefas: [{ id: 3, titulo: 'TAREFA 169 SEM', status: 'a_fazer', prioridade: 'media', created_at: null }] };
  await montar(<TodolistBoard />);
  await esperar(() => container.textContent.includes('TAREFA 169 SEM'));
  await clicar([...container.querySelectorAll('.todolist-card')].find((c) => c.textContent.includes('TAREFA 169 SEM')));
  await esperar(() => container.textContent.includes('Criada em:'));
  expect(container.querySelector('.todolist-meta-info span').textContent.trim()).toBe('Criada em: —');
});
