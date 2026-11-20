/**
 * Etapa 252 (item 22, C495; RN-252.03) — a troca pelo automático diz de qual prateleira saiu, quando foi de uma só.
 *
 * O servidor passa a gravar `saiu_codigo` também com `automatica: 1` (a saída toda de um endereço). O bloco "Substituições" do detalhe diz
 * "saiu de B-02 — lote L-8 (automático)"; sem endereço, o texto de antes ("saiu de automático"); a troca escolhida à mão, como antes.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesSubstituicaoEndereco --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RequisicoesList from './RequisicoesList';
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

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 99, nome: 'Almoxarife Teste', role: 'admin' } }),
}));

jest.mock('./RequisicoesMaterialContext', () => ({
  useRequisicoesMaterialContext: () => ({ warehouseMode: true, basePath: '', setor: null }),
}));

const REQ = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL', status: 'ENTREGUE',
  solicitante_id: 99, solicitante_nome: 'Almoxarife Teste', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-09-30T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
  itens: [{
    id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm', material_unidade: 'PC', unidade: 'PC',
    quantidade_solicitada: 5, quantidade_separada: 5, quantidade_entregue: 5, quantidade_atendida: 5, quantidade_entregavel: 0,
  }],
};

const SUB = (extra) => ({
  item_id: 1, material_codigo: 'MAT-1', quantidade: 2, planejada_codigo: 'A-01', planejada_lote: null,
  saiu_codigo: null, saiu_lote: null, automatica: 1, motivo: null, usuario_nome: 'Bruno', em: '2026-10-01T10:00:00', ...extra,
});

let container;
let root;
let requisicao;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, ...linha } = requisicao;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    return Promise.resolve({ data: [] });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function renderizar() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/requisicoes?id=55']}>
        <RequisicoesList />
      </MemoryRouter>
    );
  });
}

const texto = (id) => container.querySelector(`[data-testid="substituicao-texto-${id}"]`).textContent;

describe('Etapa 252 (RN-252.03): o endereço da troca pelo automático', () => {
  test('automático com endereço (e lote, e motivo) diz a prateleira e "(automático)"; sem endereço, o texto de antes; à mão, igual', async () => {
    requisicao = {
      ...REQ,
      substituicoes: [
        SUB({ id: 1, saiu_codigo: 'B-02' }),
        SUB({ id: 2, saiu_codigo: 'B-02', saiu_lote: 'L-8', planejada_lote: 'L-7', motivo: 'A interditada' }),
        SUB({ id: 3 }),
        SUB({ id: 4, saiu_codigo: 'C-03', automatica: 0 }),
      ],
    };
    await renderizar();
    expect(container.querySelector('[data-testid="substituicoes-origem"]').textContent).toContain('Substituições (4)');
    expect(texto(1)).toBe('MAT-1: 2 — separado de A-01 · saiu de B-02 (automático)');
    expect(texto(2)).toBe('MAT-1: 2 — separado de A-01 — lote L-7 · saiu de B-02 — lote L-8 (automático) · A interditada');
    expect(texto(3)).toBe('MAT-1: 2 — separado de A-01 · saiu de automático');
    expect(texto(4)).toBe('MAT-1: 2 — separado de A-01 · saiu de C-03');
  });
});
