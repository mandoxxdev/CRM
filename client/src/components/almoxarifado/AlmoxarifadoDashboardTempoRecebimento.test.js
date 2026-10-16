/**
 * Etapa 128 (T2, RN-09) — o cartão "Tempo médio de recebimento" do dashboard, lido do bloco `tempo_recebimento` do mesmo
 * `GET /almoxarifado/relatorios/indicadores`. Média null (nenhum recebimento concluído na janela) mostra "—", nunca "0.00h";
 * incompletos > 0 aparecem como linha à parte; sem o bloco (servidor antigo), os cartões de antes e nenhum novo. Mock na
 * fronteira HTTP por URL (molde: AlmoxarifadoDashboard.test.js).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/AlmoxarifadoDashboardTempoRecebimento --watchAll=false
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
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));

const BASE = {
  janela_dias: 45,
  giro: { valor_consumido: 500, valor_estoque_atual: 1000, indice: 0.5 },
  cobertura: { mediana_dias: 12, materiais_sem_consumo: 3 },
  rupturas: { total: 4, materiais: [] },
  valor_por_grupo: [],
  atendimento_requisicoes: { media_horas: 7.25, total_consideradas: 10 },
  requisicoes_no_prazo: { percentual: 75, no_prazo: 3, fora_do_prazo: 1, consideradas: 4, em_aberto_no_dia: 0, sem_data_valida: 0 },
};
const com = (bloco) => ({ ...BASE, tempo_recebimento: bloco });

let indicadores;
function mockarApi() {
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/relatorios/indicadores') return Promise.resolve({ data: indicadores });
    if (url === '/almoxarifado/dashboard/requisicoes') return Promise.resolve({ data: { requisicoesPendentes: 0, abertas: [] } });
    if (url === '/almoxarifado/dashboard') {
      return Promise.resolve({ data: { totalMateriais: 1, materiaisCriticos: 0, materiaisZerados: 0, valorTotalEstoque: 0, movimentacoesHoje: 0, listaMateriaisCriticos: [], ultimasMovimentacoes: [], graficoMovimentacoes: [] } });
    }
    return Promise.resolve({ data: [] });
  });
}

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

async function renderizar(dados) {
  indicadores = dados;
  mockarApi();
  await act(async () => { root.render(<MemoryRouter><AlmoxarifadoDashboard /></MemoryRouter>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const secao = () => container.querySelector('[data-testid="indicadores-secao"]');
const kpi = () => secao().querySelector('[data-testid="kpi-tempo-recebimento"]');

describe('AlmoxarifadoDashboard — cartão "Tempo médio de recebimento" (Etapa 128, RN-09)', () => {
  test('(+) média 6.5 h e mediana 4 h: "6.50h", legenda com a janela efetiva e a mediana', async () => {
    await renderizar(com({ media_horas: 6.5, mediana_horas: 4, considerados: 3, incompletos: 0 }));
    expect(kpi()).toBeTruthy();
    expect(kpi().textContent).toBe('6.50h');
    const cartao = kpi().closest('.almox-kpi-card').textContent;
    expect(cartao).toContain('Tempo médio de recebimento');
    expect(cartao).toContain('Janela de 45 dias · da chegada à entrada no estoque · mediana 4.00h');
    expect(cartao).not.toContain('fora da conta');
    expect(secao().querySelectorAll('.almox-kpi-card').length).toBe(5);
  });

  test('(−) média null: "—", o subtítulo honesto e sem a mediana; nunca "0.00h"', async () => {
    await renderizar(com({ media_horas: null, mediana_horas: null, considerados: 0, incompletos: 0 }));
    expect(kpi().textContent).toBe('—');
    const cartao = kpi().closest('.almox-kpi-card').textContent;
    expect(cartao).toContain('sem recebimentos concluídos no período');
    expect(cartao).not.toContain('mediana');
    expect(cartao).not.toContain('0.00h');
    expect(cartao).not.toMatch(/undefined|NaN|null/);
    expect(cartao).toContain('Tempo médio de recebimento'); // metade positiva: o cartão está lá
  });

  test('incompletos > 0: a linha "⟨n⟩ com entrada incompleta, fora da conta" (com e sem média)', async () => {
    await renderizar(com({ media_horas: 2, mediana_horas: 2, considerados: 1, incompletos: 2 }));
    expect(kpi().closest('.almox-kpi-card').textContent).toContain('2 com entrada incompleta, fora da conta');
    act(() => root.unmount());
    root = createRoot(container);
    await renderizar(com({ media_horas: null, mediana_horas: null, considerados: 0, incompletos: 1 }));
    const cartao = kpi().closest('.almox-kpi-card').textContent;
    expect(cartao).toContain('1 com entrada incompleta, fora da conta');
    expect(cartao).toContain('sem recebimentos concluídos no período');
  });

  test('sem o bloco (servidor antigo): os quatro cartões de antes e nenhum novo, sem erro', async () => {
    await renderizar(BASE);
    expect(kpi()).toBeNull();
    expect(secao().querySelectorAll('.almox-kpi-card').length).toBe(4);
    expect(secao().textContent).not.toContain('Tempo médio de recebimento');
    expect(secao().textContent).toContain('Requisições no prazo'); // metade positiva: os outros estão lá
  });

  test('bloco malformado (media_horas texto): não quebra o dashboard; mostra "—"', async () => {
    await renderizar(com({ media_horas: '6', mediana_horas: undefined, considerados: 1, incompletos: '3' }));
    expect(kpi().textContent).toBe('—');
    expect(secao().textContent).toContain('Giro de estoque');
    // Fase 5 (r3, D1/D2): o malformado nao inventa incompletos nem esconde o "sem recebimentos"
    const cartao = kpi().closest('.almox-kpi-card').textContent;
    expect(cartao).not.toContain('fora da conta');
    expect(cartao).toContain('sem recebimentos concluídos no período');
  });
});
