/**
 * Etapa 101 (T3, C195, RN-07) — a tela oferece a saída que a rota aceita na *Em Separação* vazia.
 *
 * - Caixa vazia e nada entregue → **Cancelar Requisição** (dono nos dois modos; no modo almoxarifado também o
 *   administrador do sistema), que chama a rota de cancelamento do modo.
 * - Caixa vazia com algo entregue → **Encerrar Requisição** (modo almoxarifado).
 * - Material na caixa → nenhum dos dois.
 * - O predicado do cliente (`destinoDaSeparacaoVazia`, `requisicaoLabels.js`) é o do servidor
 *   (`requisitionStateMachine.js`), conferido numa tabela de itens.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesSeparacaoVaziaSaida --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RequisicoesList from './RequisicoesList';
import { destinoDaSeparacaoVazia } from './requisicaoLabels';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

let mockUser = { id: 7, nome: 'Maria', role: 'user' };
let mockWarehouse = true;
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));
jest.mock('./RequisicoesMaterialContext', () => ({
  useRequisicoesMaterialContext: () => ({ warehouseMode: mockWarehouse, basePath: '', setor: 'Produção' }),
}));

const ITEM = {
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm',
  material_unidade: 'PC', material_foto: null, unidade: 'PC', quantidade_solicitada: 4,
  saldo_atual: 8, localizacao_nome: null, almoxarifado_nome: null,
  origem_separacao_id: null, lote_separacao_id: null, origem_separacao_codigo: null, lote_separacao_codigo: null,
};
const REQ = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL', status: 'EM_SEPARACAO',
  solicitante_id: 7, solicitante_nome: 'Maria', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-10-15T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};
const comItem = (over, req = {}) => ({ ...REQ, ...req, itens: [{ ...ITEM, ...over }] });
const VAZIA = { quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0 };
const VAZIA_COM_ENTREGA = { quantidade_separada: 2, quantidade_entregue: 2, quantidade_atendida: 2 };
const COM_CAIXA = { quantidade_separada: 2, quantidade_entregue: 0, quantidade_atendida: 0 };

let container;
let root;
let requisicao;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockUser = { id: 7, nome: 'Maria', role: 'user' };
  mockWarehouse = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes' || url === '/requisicoes-material') {
      const { itens, ...linha } = requisicao;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55' || url === '/requisicoes-material/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: { success: true } });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

async function renderizar() {
  const caminho = mockWarehouse ? '/almoxarifado/requisicoes?id=55' : '/comercial/requisicoes-material?id=55';
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[caminho]}>
        <RequisicoesList />
      </MemoryRouter>
    );
  });
}

const botaoPorTexto = (texto) => [...container.querySelectorAll('button')]
  .find((b) => b.textContent.trim().includes(texto));

describe('Etapa 101 — a Em Separação vazia tem saída na tela (RN-07)', () => {
  test('(a) modo almoxarifado, dono, caixa vazia sem entrega: mostra Cancelar (e não Encerrar); clicar chama a rota do almoxarifado', async () => {
    requisicao = comItem(VAZIA);
    await renderizar();
    expect(container.textContent).toContain('REQ-055');
    const b = botaoPorTexto('Cancelar Requisição');
    expect(b).toBeTruthy();
    expect(botaoPorTexto('Encerrar Requisição')).toBeFalsy();
    await act(async () => { b.click(); });
    expect(api.put).toHaveBeenCalledWith('/almoxarifado/requisicoes/55/cancelar');
  });

  test('(b) fora do modo almoxarifado, dono, caixa vazia sem entrega: mostra Cancelar; clicar chama a rota dos outros módulos', async () => {
    mockWarehouse = false;
    requisicao = comItem(VAZIA);
    await renderizar();
    expect(container.textContent).toContain('REQ-055');
    const b = botaoPorTexto('Cancelar Requisição');
    expect(b).toBeTruthy();
    await act(async () => { b.click(); });
    expect(api.put).toHaveBeenCalledWith('/requisicoes-material/55/cancelar');
  });

  test('(c) modo almoxarifado, administrador do sistema que não pediu: mostra Cancelar; fora do modo, quem não pediu não vê', async () => {
    mockUser = { id: 99, nome: 'Adm', role: 'admin' };
    requisicao = comItem(VAZIA);
    await renderizar();
    expect(botaoPorTexto('Cancelar Requisição')).toBeTruthy();
    act(() => root.unmount());
    root = createRoot(container);
    mockWarehouse = false;
    mockUser = { id: 98, nome: 'Outro', role: 'user' };
    await renderizar();
    expect(container.textContent).toContain('REQ-055');
    expect(botaoPorTexto('Cancelar Requisição')).toBeFalsy();
  });

  test('(d) caixa vazia com algo entregue: mostra Encerrar (modo almoxarifado) e não Cancelar', async () => {
    mockUser = { id: 99, nome: 'Adm', role: 'admin' };
    requisicao = comItem(VAZIA_COM_ENTREGA);
    await renderizar();
    expect(botaoPorTexto('Encerrar Requisição')).toBeTruthy();
    expect(botaoPorTexto('Cancelar Requisição')).toBeFalsy();
  });

  test('(e) material na caixa: nem Cancelar nem Encerrar (metade positiva: a tela da requisição está lá)', async () => {
    mockUser = { id: 7, nome: 'Maria', role: 'admin' };
    requisicao = comItem(COM_CAIXA);
    await renderizar();
    expect(container.textContent).toContain('REQ-055');
    expect(botaoPorTexto('Cancelar Requisição')).toBeFalsy();
    expect(botaoPorTexto('Encerrar Requisição')).toBeFalsy();
  });

  test('(f) o entregue só em quantidade_atendida (legado) conta como entrega: Encerrar, não Cancelar', async () => {
    mockUser = { id: 7, nome: 'Maria', role: 'admin' };
    requisicao = comItem({ quantidade_separada: 1, quantidade_entregue: null, quantidade_atendida: 1 });
    await renderizar();
    expect(botaoPorTexto('Encerrar Requisição')).toBeTruthy();
    expect(botaoPorTexto('Cancelar Requisição')).toBeFalsy();
  });

  // Fase 5 (revisor 2): o Encerrar segue o modo e o status, não só os itens.
  test('(h) fora do modo almoxarifado, caixa vazia com entrega: sem Encerrar (a rota exige o perfil de aprovação)', async () => {
    mockWarehouse = false;
    requisicao = comItem(VAZIA_COM_ENTREGA);
    await renderizar();
    expect(container.textContent).toContain('REQ-055');
    expect(botaoPorTexto('Encerrar Requisição')).toBeFalsy();
  });

  test('(i) Encerrada e Cancelada com itens de caixa vazia e entrega: sem Encerrar (metade positiva: a mesma fixture em Em Separação mostra)', async () => {
    mockUser = { id: 99, nome: 'Adm', role: 'admin' };
    for (const status of ['ENCERRADA', 'CANCELADO']) {
      requisicao = comItem(VAZIA_COM_ENTREGA, { status });
      // eslint-disable-next-line no-await-in-loop
      await renderizar();
      expect(container.textContent).toContain('REQ-055');
      expect(botaoPorTexto('Encerrar Requisição')).toBeFalsy();
      act(() => root.unmount());
      root = createRoot(container);
    }
    requisicao = comItem(VAZIA_COM_ENTREGA);
    await renderizar();
    expect(botaoPorTexto('Encerrar Requisição')).toBeTruthy();
  });

  test('(g) o predicado do cliente é o do servidor (tabela de itens)', () => {
    // eslint-disable-next-line global-require, import/no-unresolved
    const servidor = require('../../../../server/services/almoxarifado/requisitionStateMachine');
    expect(typeof servidor.destinoDaSeparacaoVazia).toBe('function');
    const casos = [
      [], [VAZIA], [VAZIA_COM_ENTREGA], [COM_CAIXA],
      [{ quantidade_separada: 2.0000001, quantidade_entregue: 2 }],
      [{ quantidade_separada: 2.000001, quantidade_entregue: 2 }],
      [{ quantidade_separada: 2, quantidade_entregue: 1.9999999 }], // Fase 5: o resto no entregue (legado)
      [{ quantidade_separada: 1, quantidade_entregue: null, quantidade_atendida: 1 }],
      [{ quantidade_separada: null }], [{}],
      [VAZIA, VAZIA_COM_ENTREGA], [VAZIA, COM_CAIXA], [VAZIA_COM_ENTREGA, COM_CAIXA],
      [{ quantidade_separada: '2', quantidade_entregue: '2' }],
      [{ quantidade_separada: 0, quantidade_entregue: 1e-10 }],
    ];
    const resultados = casos.map((c) => destinoDaSeparacaoVazia(c));
    // Guarda da guarda: a tabela cobre os três desfechos.
    expect(new Set(resultados)).toEqual(new Set([null, 'ENCERRADA', 'CANCELADO']));
    casos.forEach((c, i) => {
      expect([i, destinoDaSeparacaoVazia(c)]).toEqual([i, servidor.destinoDaSeparacaoVazia(c)]);
    });
  });
});
