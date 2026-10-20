/**
 * Etapa 161 (RN-161.01, RN-161.05, RN-161.07; T4) — as telas da Fabrica: so o ULTIMO pedido de cada lista mexe na tela (a resposta lenta
 * e a falha de um pedido anterior sao descartadas, e o carregando so sai com o ultimo); os Relatorios da producao zeram os dados ao
 * trocar de aba; as datas padrao sao o dia/hora LOCAL do navegador; e o Setor dos Colaboradores nao encolhe com o filtro.
 * O `api` simulado na fronteira HTTP (o molde da Etapa160Fabrica.test.js).
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import api from '../../services/api';
import OrdensProducao from '../producao/OrdensProducao';
import MaquinasProducao from '../producao/MaquinasProducao';
import RelatoriosProducao from '../producao/RelatoriosProducao';
import OrdemProducaoFormPage from '../producao/OrdemProducaoFormPage';
import Colaboradores from './Colaboradores';
import Equipamentos from './Equipamentos';
import ControlePresenca from './ControlePresenca';
import AtividadesColaboradores from './AtividadesColaboradores';
import HorasExtras from './HorasExtras';
import PresencaForm from './PresencaForm';
import HoraExtraForm from './HoraExtraForm';
import OSForm from './OSForm';
import AtividadeForm from './AtividadeForm';
import OSComercialForm from '../OSComercialForm';

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
jest.mock('../../utils/userFilters', () => ({
  fetchModuleUsers: () => Promise.resolve([]),
  fetchComercialResponsaveis: () => Promise.resolve([]),
}));

const { toast } = require('react-toastify');

global.IS_REACT_ACT_ENVIRONMENT = true;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
let container; let root;
beforeAll(() => { jest.spyOn(console, 'error').mockImplementation(() => {}); });
beforeEach(() => {
  api.get.mockReset();
  toast.error.mockClear();
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
async function mudar(el, valor) {
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const set = Object.getOwnPropertyDescriptor(proto, 'value').set;
  await act(async () => {
    set.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function esperar(cond, ms = 3000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (cond()) return; await act(async () => { await pausa(20); }); }
  throw new Error('a condicao nao chegou');
}
const selectCom = (valor) => [...container.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === valor));
const texto = () => container.textContent;

/**
 * Cada lista da RN-161.01: a URL, o parametro que distingue os pedidos, como troca-lo, como desenhar uma linha com uma marca, e o
 * carregando. A abertura responde a marca ABERTURA; o pedido A e o anterior; o pedido B e o ultimo.
 */
const carregandoTexto = () => texto().includes('Carregando...');
const carregandoSkeleton = () => Boolean(container.querySelector('.skeleton-table'));
const TELAS = [
  {
    nome: 'OPs (producao/OrdensProducao)', el: () => <OrdensProducao />, url: '/producao/ops', param: 'status', A: 'liberada', B: 'concluida',
    trocar: (v) => mudar(selectCom('liberada'), v), linha: (m) => ({ id: 1, numero_op: m, status: 'planejada' }), carregando: carregandoTexto,
  },
  {
    nome: 'Maquinas (producao/MaquinasProducao)', el: () => <MaquinasProducao />, url: '/producao/maquinas', param: 'search', A: 'aa', B: 'bb',
    trocar: (v) => mudar(container.querySelector('.producao-search input'), v), linha: (m) => ({ id: 1, codigo: m, nome: 'M', status: 'disponivel' }),
    carregando: carregandoTexto,
  },
  {
    nome: 'Colaboradores (operacional/Colaboradores)', el: () => <Colaboradores />, url: '/operacional/colaboradores', param: 'status', A: 'ativo', B: 'inativo',
    trocar: (v) => mudar(selectCom('inativo'), v), linha: (m) => ({ id: 1, nome: m, setor: 'S1', status_trabalho: 'disponivel' }),
    carregando: carregandoSkeleton,
  },
  {
    nome: 'Equipamentos (operacional/Equipamentos)', el: () => <Equipamentos />, url: '/operacional/equipamentos', param: 'status', A: 'em_uso', B: 'manutencao',
    trocar: (v) => mudar(selectCom('manutencao'), v), linha: (m) => ({ id: 1, nome: m, status: 'disponivel' }), carregando: carregandoSkeleton,
  },
  {
    nome: 'Presenca (operacional/ControlePresenca)', el: () => <ControlePresenca />, url: '/operacional/controle-presenca', param: 'data_inicio',
    A: '2026-01-01', B: '2026-02-01', trocar: (v) => mudar(container.querySelector('input[type="date"]'), v),
    linha: (m) => ({ id: 1, colaborador_nome: m, data: '2026-10-19', status: 'presente' }), carregando: carregandoSkeleton,
  },
  {
    nome: 'Atividades (operacional/AtividadesColaboradores)', el: () => <AtividadesColaboradores />, url: '/operacional/atividades-colaboradores',
    param: 'status', A: 'concluida', B: 'cancelada', trocar: (v) => mudar(selectCom('cancelada'), v),
    linha: (m) => ({ id: 1, colaborador_nome: m, tipo_atividade: 'T', status: 'concluida' }), carregando: carregandoSkeleton,
  },
  {
    nome: 'Horas extras (operacional/HorasExtras)', el: () => <HorasExtras />, url: '/operacional/horas-extras', param: 'status', A: 'aprovado',
    B: 'rejeitado', trocar: (v) => mudar(selectCom('rejeitado'), v),
    linha: (m) => ({ id: 1, colaborador_nome: m, data: '2026-10-19', horas_extras: 1, tipo_hora_extra: 'normal', status: 'aprovado' }),
    carregando: carregandoSkeleton,
  },
  {
    nome: 'Relatorios da producao (producao/RelatoriosProducao)', el: () => <RelatoriosProducao />, url: '/producao/relatorios/producao',
    param: 'data_inicio', A: '2026-01-01', B: '2026-02-01', trocar: (v) => mudar(container.querySelector('input[type="date"]'), v),
    linha: (m) => ({ porDia: [{ dia: m, produzido: 1, refugo: 0, apontamentos: 1 }], porOp: [] }), carregando: carregandoTexto, objeto: true,
  },
];

/** O mock: a meta da producao responde vazio; a lista responde pelo parametro conforme o `plano` ({ A: fn, B: fn, abertura: fn }). */
function simular(tela, plano) {
  api.get.mockImplementation(async (url, cfg) => {
    if (url === '/producao/meta') return { data: { statusOp: ['planejada', 'liberada', 'concluida'] } };
    if (url !== tela.url) return { data: [] };
    const v = ((cfg && cfg.params) || {})[tela.param];
    const resp = (m) => ({ data: tela.objeto ? tela.linha(m) : [tela.linha(m)] });
    if (v === tela.A) return plano.A(resp);
    if (v === tela.B) return plano.B(resp);
    return resp('MARCA-ABERTURA-161');
  });
}

describe.each(TELAS)('[RN-161.01, C396] $nome: so o ultimo pedido mexe na tela', (tela) => {
  test('[RN-161.01, C396] a resposta lenta do pedido anterior chega depois e nao troca a lista', async () => {
    simular(tela, {
      A: async (resp) => { await pausa(300); return resp('MARCA-VELHA-161'); },
      B: async (resp) => resp('MARCA-NOVA-161'),
    });
    await montar(tela.el());
    await esperar(() => texto().includes('MARCA-ABERTURA-161'));
    await tela.trocar(tela.A);
    await tela.trocar(tela.B);
    await esperar(() => texto().includes('MARCA-NOVA-161'));
    await act(async () => { await pausa(450); }); // o anterior ja respondeu
    expect(texto()).toContain('MARCA-NOVA-161');
    expect(texto()).not.toContain('MARCA-VELHA-161');
  });

  test('[RN-161.01, C396] a falha do pedido anterior que chega depois nao mostra o aviso; o carregando so sai com o ultimo', async () => {
    simular(tela, {
      A: async () => { await pausa(100); throw new Error('o anterior caiu'); },
      B: async (resp) => { await pausa(400); return resp('MARCA-NOVA-161'); },
    });
    await montar(tela.el());
    await esperar(() => texto().includes('MARCA-ABERTURA-161'));
    await tela.trocar(tela.A);
    await tela.trocar(tela.B);
    await act(async () => { await pausa(200); }); // o anterior ja falhou; o ultimo ainda nao respondeu
    expect(toast.error).not.toHaveBeenCalled();
    expect(tela.carregando()).toBe(true);
    await esperar(() => texto().includes('MARCA-NOVA-161'));
    expect(tela.carregando()).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('[RN-161.01, C396] os Relatorios da producao: a troca de aba', () => {
  const aba = (rotulo) => [...container.querySelectorAll('button')].find((b) => b.textContent === rotulo);
  test('[RN-161.01, C396] a troca de aba zera os dados: a aba nova nunca desenha a resposta da anterior', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/producao/relatorios/producao') return { data: { porDia: [], porOp: [], mediaEficiencia: 'MARCA-VELHA-161' } };
      if (url === '/producao/relatorios/eficiencia') { await pausa(200); return { data: { mediaEficiencia: 88, ops: [] } }; }
      return { data: {} };
    });
    await montar(<RelatoriosProducao />);
    await esperar(() => texto().includes('Produção por dia'));
    // o que for desenhado, por um instante que seja, fica nos registros do observador
    const desenhados = [];
    const obs = new MutationObserver((regs) => regs.forEach((r) => r.addedNodes.forEach((n) => desenhados.push(n.textContent || ''))));
    obs.observe(container, { childList: true, subtree: true, characterData: true });
    await act(async () => { aba('Eficiência').click(); });
    await esperar(() => texto().includes('Eficiência média: 88%'));
    obs.disconnect();
    expect(desenhados.join(' | ')).not.toContain('MARCA-VELHA-161');
  });

  test('[RN-161.01, C396] a resposta da aba anterior que chega depois da troca nao e desenhada', async () => {
    let n = 0;
    api.get.mockImplementation(async (url) => {
      if (url === '/producao/relatorios/producao') {
        n += 1;
        if (n === 1) return { data: { porDia: [{ dia: 'MARCA-ABERTURA-161', produzido: 1, refugo: 0, apontamentos: 1 }], porOp: [] } };
        await pausa(300);
        return { data: { porDia: [], porOp: [], mediaEficiencia: 'MARCA-VELHA-161' } };
      }
      if (url === '/producao/relatorios/eficiencia') return { data: { mediaEficiencia: 88, ops: [] } };
      return { data: {} };
    });
    await montar(<RelatoriosProducao />);
    await esperar(() => texto().includes('MARCA-ABERTURA-161'));
    await mudar(container.querySelector('input[type="date"]'), '2026-03-01'); // a aba Producao pede de novo: lenta
    await act(async () => { aba('Eficiência').click(); });
    await esperar(() => texto().includes('Eficiência média: 88%'));
    await act(async () => { await pausa(450); }); // a da aba anterior ja respondeu
    expect(texto()).toContain('Eficiência média: 88%');
    expect(texto()).not.toContain('MARCA-VELHA-161');
  });
});

/**
 * RN-161.05 — o relogio parado em 19/10/2026 23:30 LOCAL. Em UTC-3 o dia UTC ja e 20/10 (o `toISOString` antigo); o local e 19/10.
 * So o construtor sem argumento e o `Date.now` sao congelados, e so durante a montagem (as pausas do teste usam o relogio real).
 */
const RealDate = Date;
const AS_2330 = new RealDate(2026, 9, 19, 23, 30);
function congelarRelogio() {
  class Parado extends RealDate {
    constructor(...a) { if (a.length === 0) super(AS_2330.getTime()); else super(...a); }
    static now() { return AS_2330.getTime(); }
  }
  global.Date = Parado;
  return () => { global.Date = RealDate; };
}
async function montarAs2330(el) {
  const soltar = congelarRelogio();
  try { await montar(el); } finally { soltar(); }
}
const inputDoRotulo = (re) => {
  const rot = [...container.querySelectorAll('label')].find((l) => re.test(l.textContent));
  return rot && rot.parentElement.querySelector('input');
};

describe('[RN-161.05, C397] o dia/hora local do navegador', () => {
  beforeEach(() => { api.get.mockResolvedValue({ data: [] }); });
  test('guarda: o processo do teste nao esta em UTC (o cenario das 23h30 so prova algo fora de UTC)', () => {
    expect(AS_2330.getTimezoneOffset()).not.toBe(0);
  });
  test('[RN-161.05, C397] o filtro padrao da Presenca e o hoje local', async () => {
    await montarAs2330(<ControlePresenca />);
    const pedido = api.get.mock.calls.find(([u]) => u === '/operacional/controle-presenca');
    expect(pedido[1].params).toMatchObject({ data_inicio: '2026-10-19', data_fim: '2026-10-19' });
  });
  test('[RN-161.05, C397] o periodo padrao dos Relatorios da producao e o mes local', async () => {
    await montarAs2330(<RelatoriosProducao />);
    const pedido = api.get.mock.calls.find(([u]) => u === '/producao/relatorios/producao');
    expect(pedido[1].params).toEqual({ data_inicio: '2026-10-01', data_fim: '2026-10-19' });
  });
  test('[RN-161.05, C397] a presenca nova vem com o hoje local', async () => {
    await montarAs2330(<PresencaForm onClose={() => {}} />);
    expect(inputDoRotulo(/^Data \*/).value).toBe('2026-10-19');
  });
  test('[RN-161.05, C397] a hora extra nova vem com o hoje local', async () => {
    await montarAs2330(<HoraExtraForm onClose={() => {}} />);
    expect(inputDoRotulo(/^Data \*/).value).toBe('2026-10-19');
  });
  test('[RN-161.05, C397] a OS nova vem com a abertura no hoje local', async () => {
    await montarAs2330(<OSForm onClose={() => {}} />);
    expect(inputDoRotulo(/^Data Abertura/).value).toBe('2026-10-19');
  });
  test('[RN-161.05, C397] a OS aberta pelo Comercial vem com a abertura no hoje local', async () => {
    await montarAs2330(<OSComercialForm proposta={{ id: 7, itens: [] }} onClose={() => {}} />);
    expect(inputDoRotulo(/^Data de Abertura/).value).toBe('2026-10-19');
  });
  test('[RN-161.05, C397] a OP nova vem com a data planejada no hoje local', async () => {
    api.get.mockImplementation(async (url) => (url === '/producao/ops/proximo-numero' ? { data: { numero_op: 'OP-1' } } : { data: {} }));
    await montarAs2330(<OrdemProducaoFormPage />);
    expect(inputDoRotulo(/^Data planejada/).value).toBe('2026-10-19');
  });
  test('[RN-161.05, C397] a atividade nova vem com o agora local no datetime-local', async () => {
    await montarAs2330(<AtividadeForm onClose={() => {}} />);
    expect(container.querySelector('input[type="datetime-local"]').value).toBe('2026-10-19T23:30');
  });
  test('[RN-161.05, C397] a edicao da atividade mostra a hora gravada (texto local do datetime-local), sem converte-la para UTC', async () => {
    await montar(<AtividadeForm atividade={{ id: 3, colaborador_id: 1, tipo_atividade: 'T', data_inicio: '2026-10-19T22:30' }} onClose={() => {}} />);
    expect(container.querySelector('input[type="datetime-local"]').value).toBe('2026-10-19T22:30');
  });
  test('[RN-161.05, C397] a edicao da atividade gravada com fuso (Z) mostra a hora local', async () => {
    await montar(<AtividadeForm atividade={{ id: 3, colaborador_id: 1, tipo_atividade: 'T', data_inicio: '2026-10-20T01:30:00.000Z' }} onClose={() => {}} />);
    const esperado = new RealDate('2026-10-20T01:30:00.000Z');
    const dois = (x) => String(x).padStart(2, '0');
    const local = `${esperado.getFullYear()}-${dois(esperado.getMonth() + 1)}-${dois(esperado.getDate())}T${dois(esperado.getHours())}:${dois(esperado.getMinutes())}`;
    expect(container.querySelector('input[type="datetime-local"]').value).toBe(local);
  });
});

describe('[RN-161.07, C399/C400] os Colaboradores: o Setor e o Trabalho', () => {
  const TODOS = [
    { id: 1, nome: 'ANA-161', setor: 'SOLDA', status_trabalho: 'trabalhando' },
    { id: 2, nome: 'BETO-161', setor: 'PINTURA', status_trabalho: 'disponivel' },
    { id: 3, nome: 'CAIO-161', setor: 'MONTAGEM', status_trabalho: 'ausente' },
  ];
  const selSetor = () => selectCom('SOLDA') || [...container.querySelectorAll('select')].find((s) => s.options[0] && s.options[0].textContent === 'Todos os setores');
  const opcoesSetor = () => [...selSetor().options].map((o) => o.value).filter(Boolean).sort();
  beforeEach(() => {
    api.get.mockImplementation(async (url, cfg) => {
      const setor = cfg && cfg.params && cfg.params.setor;
      return { data: setor ? TODOS.filter((c) => c.setor === setor) : TODOS };
    });
  });
  test('[RN-161.07, C399] com o filtro de setor escolhido, as opcoes continuam todas', async () => {
    await montar(<Colaboradores />);
    await esperar(() => texto().includes('ANA-161'));
    expect(opcoesSetor()).toEqual(['MONTAGEM', 'PINTURA', 'SOLDA']);
    await mudar(selSetor(), 'SOLDA');
    await esperar(() => !texto().includes('BETO-161'));
    expect(texto()).toContain('ANA-161');
    expect(opcoesSetor()).toEqual(['MONTAGEM', 'PINTURA', 'SOLDA']);
  });
  test('[RN-161.07, C400] mudar o Trabalho filtra no navegador, sem novo pedido ao servidor', async () => {
    await montar(<Colaboradores />);
    await esperar(() => texto().includes('ANA-161'));
    const n0 = api.get.mock.calls.length;
    await mudar(selectCom('parado'), 'trabalhando');
    for (let i = 0; i < 4; i++) await act(async () => {});
    expect(api.get.mock.calls.length).toBe(n0);
    expect(texto()).toContain('ANA-161');
    expect(texto()).not.toContain('BETO-161');
  });
});

describe('[C402] a coluna Data (so o dia) da Presenca e das Horas extras mostra o dia gravado', () => {
  test('guarda: fora de UTC (em UTC-3 o new Date("2026-10-19") e 18/10)', () => {
    expect(new Date(2026, 9, 19).getTimezoneOffset()).toBeGreaterThan(0);
  });
  test('[C402] Presenca gravada em 2026-10-19 aparece 19/10/2026 (e nao 18/10/2026)', async () => {
    api.get.mockResolvedValue({ data: [{ id: 1, colaborador_nome: 'ANA-161', data: '2026-10-19', status: 'presente' }] });
    await montar(<ControlePresenca />);
    await esperar(() => container.textContent.includes('ANA-161'));
    expect(container.textContent).toContain('19/10/2026');
    expect(container.textContent).not.toContain('18/10/2026');
  });
  test('[C402] Hora extra de 2026-10-19 aparece 19/10/2026 (e nao 18/10/2026)', async () => {
    api.get.mockResolvedValue({ data: [{ id: 1, colaborador_nome: 'ANA-161', data: '2026-10-19', status: 'pendente', horas: 2 }] });
    await montar(<HorasExtras />);
    await esperar(() => container.textContent.includes('ANA-161'));
    expect(container.textContent).toContain('19/10/2026');
    expect(container.textContent).not.toContain('18/10/2026');
  });
});

describe('[RN-161.01, C01 da sabotagem r3] os Relatorios da producao: clicar na aba ja aberta', () => {
  const aba = (rotulo) => [...container.querySelectorAll('button')].find((b) => b.textContent === rotulo);
  test('[RN-161.01] clicar na aba que ja esta aberta mantem os dados (nao zera nem pede de novo)', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/producao/relatorios/producao') return { data: { porDia: [{ dia: 'MARCA-ABERTA-161', produzido: 1, refugo: 0, apontamentos: 1 }], porOp: [] } };
      return { data: {} };
    });
    await montar(<RelatoriosProducao />);
    await esperar(() => texto().includes('MARCA-ABERTA-161'));
    const n0 = api.get.mock.calls.length;
    await act(async () => { aba('Produção').click(); });
    for (let i = 0; i < 4; i++) await act(async () => { await pausa(10); });
    expect(texto()).toContain('MARCA-ABERTA-161');
    expect(texto()).not.toContain('Sem dados para o período');
    expect(api.get.mock.calls.length).toBe(n0);
  });
});
