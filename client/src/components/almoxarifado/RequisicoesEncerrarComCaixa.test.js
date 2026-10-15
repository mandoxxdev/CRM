/**
 * Etapa 102 (T3, C204, RN-07) — a tela oferece o encerramento que a rota aceita.
 *
 * - *Parcialmente Atendida* com material na caixa → sem **Encerrar Requisição**; no lugar, a nota com a literal E1 do
 *   servidor (`encerrar-bloqueado-caixa`). Com a caixa vazia → o botão.
 * - *Entregue* → o botão (mesmo com separado > entregue de legado: não retém caixa).
 * - Fora do modo almoxarifado → nem botão nem nota.
 * - `podeEncerrar` (cliente) é `validarTransicao(s,'ENCERRADA').ok && recusaEncerrar(s, itens) === null` (servidor),
 *   conferido numa tabela de status × itens, e a literal E1 do cliente é a do servidor.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesEncerrarComCaixa --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RequisicoesList from './RequisicoesList';
import { podeEncerrar, MSG_ENCERRAR_COM_CAIXA } from './requisicaoLabels';
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
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL', status: 'PARCIALMENTE_ATENDIDA',
  solicitante_id: 7, solicitante_nome: 'Maria', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-10-15T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};
const comItem = (over, req = {}) => ({ ...REQ, ...req, itens: [{ ...ITEM, ...over }] });
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

const COM_CAIXA_PARCIAL = { quantidade_separada: 4, quantidade_entregue: 1, quantidade_atendida: 1 };
const PARCIAL_VAZIA = { quantidade_separada: 2, quantidade_entregue: 2, quantidade_atendida: 2 };
const nota = () => container.querySelector('[data-testid="encerrar-bloqueado-caixa"]');

describe('Etapa 102 — encerrar com material na caixa (RN-07)', () => {
  test('(a) Parcialmente Atendida com 3 na caixa: sem Encerrar; a nota com a literal E1 no lugar', async () => {
    mockUser = { id: 99, nome: 'Adm', role: 'admin' };
    requisicao = comItem(COM_CAIXA_PARCIAL);
    await renderizar();
    expect(container.textContent).toContain('REQ-055');
    expect(botaoPorTexto('Encerrar Requisição')).toBeFalsy();
    expect(nota()).toBeTruthy();
    expect(nota().textContent).toContain(MSG_ENCERRAR_COM_CAIXA);
  });

  test('(b) Parcialmente Atendida com a caixa vazia: o botão, sem a nota; clicar e confirmar chama a rota de encerrar', async () => {
    mockUser = { id: 99, nome: 'Adm', role: 'admin' };
    requisicao = comItem(PARCIAL_VAZIA);
    await renderizar();
    expect(nota()).toBeFalsy();
    const b = botaoPorTexto('Encerrar Requisição');
    expect(b).toBeTruthy();
    await act(async () => { b.click(); });
    const confirmar = botaoPorTexto('Confirmar Encerramento');
    expect(confirmar).toBeTruthy();
    await act(async () => { confirmar.click(); });
    expect(api.put).toHaveBeenCalledWith('/almoxarifado/requisicoes/55/encerrar', expect.anything());
  });

  test('(c) Entregue, mesmo com separado > entregue (legado): o botão, sem a nota', async () => {
    mockUser = { id: 99, nome: 'Adm', role: 'admin' };
    requisicao = comItem({ quantidade_separada: 5, quantidade_entregue: 4, quantidade_atendida: 4, quantidade_solicitada: 4 }, { status: 'ENTREGUE' });
    await renderizar();
    expect(botaoPorTexto('Encerrar Requisição')).toBeTruthy();
    expect(nota()).toBeFalsy();
  });

  test('(d) dois itens, a caixa só no segundo: sem Encerrar, com a nota', async () => {
    mockUser = { id: 99, nome: 'Adm', role: 'admin' };
    requisicao = { ...REQ, itens: [{ ...ITEM, ...PARCIAL_VAZIA }, { ...ITEM, id: 2, ...COM_CAIXA_PARCIAL }] };
    await renderizar();
    expect(botaoPorTexto('Encerrar Requisição')).toBeFalsy();
    expect(nota()).toBeTruthy();
  });

  test('(e) fora do modo almoxarifado: nem botão nem nota (metade positiva: a requisição está lá)', async () => {
    mockWarehouse = false;
    requisicao = comItem(COM_CAIXA_PARCIAL);
    await renderizar();
    expect(container.textContent).toContain('REQ-055');
    expect(botaoPorTexto('Encerrar Requisição')).toBeFalsy();
    expect(nota()).toBeFalsy();
  });

  test('(f) Em Separação com material na caixa: sem botão e SEM a nota (é a separação em curso)', async () => {
    mockUser = { id: 99, nome: 'Adm', role: 'admin' };
    requisicao = comItem({ quantidade_separada: 2, quantidade_entregue: 0, quantidade_atendida: 0 }, { status: 'EM_SEPARACAO' });
    await renderizar();
    expect(container.textContent).toContain('REQ-055');
    expect(botaoPorTexto('Encerrar Requisição')).toBeFalsy();
    expect(nota()).toBeFalsy();
  });

  test('(g) podeEncerrar é o do servidor (tabela status × itens) e a literal é a E1 do servidor', () => {
    // eslint-disable-next-line global-require, import/no-unresolved
    const servidor = require('../../../../server/services/almoxarifado/requisitionStateMachine');
    expect(typeof servidor.recusaEncerrar).toBe('function');
    expect(MSG_ENCERRAR_COM_CAIXA).toBe(servidor.MSG_SAIDA_SEPARACAO.E1);
    const statusTodos = [...new Set([...Object.keys(servidor.TRANSICOES), 'ENCERRADA', 'CANCELADO', 'REJEITADO'])];
    const itens = [
      [], [{}], [COM_CAIXA_PARCIAL], [PARCIAL_VAZIA], [{ quantidade_separada: 0, quantidade_entregue: 0 }],
      [{ quantidade_separada: 2.0000001, quantidade_entregue: 2 }], [{ quantidade_separada: 2.000001, quantidade_entregue: 2 }],
      [{ quantidade_separada: 2, quantidade_entregue: 1.9999999 }],
      [{ quantidade_separada: 2, quantidade_entregue: null, quantidade_atendida: 2 }],
      [{ quantidade_separada: 2, quantidade_entregue: null, quantidade_atendida: 1 }],
      [PARCIAL_VAZIA, COM_CAIXA_PARCIAL], [{ quantidade_separada: '4', quantidade_entregue: '1' }],
    ];
    const esperadoServidor = (s, it) => servidor.validarTransicao(s, 'ENCERRADA').ok && servidor.recusaEncerrar(s, it) === null;
    let verdadeiros = 0; let falsos = 0;
    statusTodos.forEach((s) => itens.forEach((it, i) => {
      const e = esperadoServidor(s, it);
      if (e) verdadeiros++; else falsos++;
      expect([s, i, podeEncerrar(s, it)]).toEqual([s, i, e]);
    }));
    // Guarda da guarda: a tabela tem os dois desfechos, e a Parcialmente Atendida tem os dois.
    expect(verdadeiros).toBeGreaterThan(0); expect(falsos).toBeGreaterThan(0);
    expect(podeEncerrar('PARCIALMENTE_ATENDIDA', [COM_CAIXA_PARCIAL])).toBe(false);
    expect(podeEncerrar('PARCIALMENTE_ATENDIDA', [PARCIAL_VAZIA])).toBe(true);
  });
});
