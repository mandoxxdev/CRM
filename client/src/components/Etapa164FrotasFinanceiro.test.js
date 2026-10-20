/**
 * Etapa 164 (RN-164.06, RN-164.09, B1048, B1050, Fase 2 M11; T3) — no navegador: os formularios de Frotas abrem com o dia LOCAL, a tela do
 * Financeiro mostra a data sem hora no dia gravado (na lista e na planilha), e o "Atualizar" do painel de Frotas fura o cache do servidor.
 *
 * DEPENDE DO FUSO: so prova algo fora de UTC (em UTC o dia local e o UTC coincidem). O fuso da suite e o do `client/jest.globalSetup.js`
 * (atribuir process.env.TZ aqui nao vale sob Jest); a guarda abaixo DERRUBA o arquivo num processo em UTC.
 * O `api` simulado na fronteira HTTP (o molde da Etapa161Fabrica.test.js).
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import api from '../services/api';
import Financeiro from './Financeiro';
import { ENTITY_CONFIGS } from './frotas/frotasEntityConfigs';
import { fetchFrotasDashboard } from '../utils/frotasApi';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: '/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn(), warning: jest.fn() },
}));
jest.mock('../utils/exportExcel', () => ({ exportToExcel: jest.fn() }));

const { exportToExcel } = require('../utils/exportExcel');

global.IS_REACT_ACT_ENVIRONMENT = true;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

test('guarda: o processo esta em UTC-3 (a meia-noite UTC de 20/10 e 19/10 local) — senao os cenarios abaixo nao provam nada', () => {
  expect(new Date('2026-10-20T00:00:00Z').getDate()).toBe(19);
  expect(new Date('2026-10-20').toLocaleDateString('pt-BR')).toBe('19/10/2026'); // a regua antiga do Financeiro, neste fuso
});

// o relogio parado em 19/10/2026 22:30 LOCAL (o dia UTC ja e 20/10)
const RealDate = Date;
const AS_2230 = new RealDate(2026, 9, 19, 22, 30);
function pararRelogio() {
  class Parado extends RealDate {
    constructor(...args) { if (args.length === 0) super(AS_2230.getTime()); else super(...args); }
    static now() { return AS_2230.getTime(); }
  }
  global.Date = Parado;
  return () => { global.Date = RealDate; };
}

describe('[RN-164.06, B1048] os formularios de Frotas abrem com o hoje local', () => {
  test.each([
    ['manutencoes', 'data_manutencao'],
    ['abastecimentos', 'data_abastecimento'],
    ['checklists', 'data_checklist'],
  ])('%s: %s = 2026-10-19 as 22h30 (o toISOString daria 2026-10-20)', (entidade, campo) => {
    const soltar = pararRelogio();
    try {
      expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-20'); // o relogio parado pegou (o dia UTC e outro)
      expect(ENTITY_CONFIGS[entidade].getDefaultForm()[campo]).toBe('2026-10-19');
    } finally { soltar(); }
  });
});

describe('[Fase 2 M11] o Atualizar do painel de Frotas manda refresh=1', () => {
  test('force: true -> refresh=1; sem force -> sem parametro', async () => {
    api.get.mockReset();
    api.get.mockResolvedValue({ data: { alertas: [] } });
    await fetchFrotasDashboard({ force: true });
    expect(api.get).toHaveBeenLastCalledWith('/frotas/dashboard', { params: { refresh: 1 } });
    api.get.mockClear();
    await fetchFrotasDashboard({ force: true });
    await fetchFrotasDashboard(); // dentro do cache do cliente: nao chama
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});

describe('[RN-164.09, B1050] o Financeiro mostra a data sem hora no dia gravado', () => {
  let container; let root;
  beforeAll(() => { jest.spyOn(console, 'error').mockImplementation(() => {}); });
  beforeEach(() => {
    api.get.mockReset();
    exportToExcel.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  async function montar(rota) {
    await act(async () => { root.render(<MemoryRouter initialEntries={[rota]}><Financeiro /></MemoryRouter>); });
    const fim = RealDate.now() + 3000;
    while (RealDate.now() < fim && !container.querySelector('tbody tr td')) await act(async () => { await pausa(20); });
  }
  const linha = () => [...container.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));

  test('contas a pagar: o vencimento 2026-10-20 sai 20/10/2026 (nao 19/10), o pagamento vazio sai "-", e a planilha leva o mesmo', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url.includes('contas-pagar')
      ? [{ id: 1, descricao: 'CONTA E164', fornecedor: 'F', valor: 10, data_vencimento: '2026-10-20', data_pagamento: null, status: 'pendente' }]
      : [] }));
    await montar('/financeiro/contas-pagar');
    const celulas = linha().find((l) => l.some((t) => t.includes('CONTA E164')));
    expect(celulas).toBeTruthy();
    expect(celulas).toContain('20/10/2026');
    expect(celulas).not.toContain('19/10/2026');
    expect(celulas).toContain('-');
    const botao = [...container.querySelectorAll('button')].find((b) => /Exportar Excel/.test(b.textContent));
    await act(async () => { botao.click(); });
    expect(exportToExcel).toHaveBeenCalledTimes(1);
    const [dados] = exportToExcel.mock.calls[0];
    expect(dados[0].Vencimento).toBe('20/10/2026');
    expect(dados[0].Pagamento).toBe('-');
  });

  test('contas a receber e fluxo de caixa: o dia gravado', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url.includes('contas-receber')
      ? [{ id: 2, descricao: 'REC E164', cliente: 'C', valor: 5, data_vencimento: '2026-11-01', data_recebimento: '2026-10-31', status: 'recebido' }]
      : [{ id: 3, descricao: 'FLUXO E164', tipo: 'entrada', valor: 1, data: '2026-01-01' }] }));
    await montar('/financeiro/contas-receber');
    const rec = linha().find((l) => l.some((t) => t.includes('REC E164')));
    expect(rec).toEqual(expect.arrayContaining(['01/11/2026', '31/10/2026']));
    act(() => root.unmount());
    root = createRoot(container);
    await montar('/financeiro/fluxo-caixa');
    const fl = linha().find((l) => l.some((t) => t.includes('FLUXO E164')));
    expect(fl).toContain('01/01/2026');
  });
});
