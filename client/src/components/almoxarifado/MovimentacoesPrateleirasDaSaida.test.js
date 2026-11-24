/**
 * Etapa 261 (D (252) 1, RN-261.05; B1615) — o histórico de Movimentações diz de quais prateleiras a peça saiu.
 *
 * `GET /almoxarifado/movimentacoes` devolve `prateleiras: [{ localizacao_id, codigo, quantidade, padrao? }]` por movimento (RN-261.03/04).
 * A coluna Quantidade mostra, abaixo do número, "Saiu de: A-01 3 · B-02 3"; linha sem endereço → "sem endereço"; a parte da posição
 * padrão do Ajuste do total → "posição padrão". Sem registro (lista vazia ou ausente, servidor antigo): nada, como antes.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MovimentacoesPrateleirasDaSaida --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MovimentacoesAlmoxarifado from './MovimentacoesAlmoxarifado';
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
jest.mock('./ExtratoMaterialModal', () => ({ __esModule: true, default: () => null }));

const movimento = (id, tipo, extra = {}) => ({
  id, tipo, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm', unidade: 'PC',
  quantidade: 6, saldo_anterior: 8, saldo_posterior: 2, usuario_nome: 'Maria', created_at: '2026-11-23T10:00:00Z', cancelado: 0, ...extra,
});

const MOVIMENTOS = [
  movimento(1, 'SAIDA', { prateleiras: [{ localizacao_id: 5, codigo: 'A-01', quantidade: 3 }, { localizacao_id: 6, codigo: 'B-02', quantidade: 3 }] }),
  movimento(2, 'AJUSTE', { prateleiras: [{ localizacao_id: 6, codigo: 'B-02', quantidade: 3 },
    { localizacao_id: null, codigo: null, padrao: true, quantidade: 3 }] }),
  movimento(3, 'SAIDA', { prateleiras: [{ localizacao_id: null, codigo: null, quantidade: 1.5 }] }),
  movimento(4, 'ENTRADA', { prateleiras: [], saldo_anterior: 2, saldo_posterior: 8 }),
  movimento(5, 'SAIDA'), // servidor sem o campo
];

let container;
let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/movimentacoes') return Promise.resolve({ data: MOVIMENTOS });
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

const renderizar = async () => {
  await act(async () => { root.render(<MemoryRouter><MovimentacoesAlmoxarifado /></MemoryRouter>); });
};
const linhas = () => [...container.querySelectorAll('.almox-table tbody tr')];
const saiuDe = (i) => {
  const el = linhas()[i].querySelector('[data-testid="mov-prateleiras"]');
  return el ? el.textContent : null;
};

describe('Movimentações — "Saiu de" (RN-261.05)', () => {
  test('a Saída que tirou de duas prateleiras diz as duas, com a quantidade de cada uma', async () => {
    await renderizar();
    expect(linhas()).toHaveLength(MOVIMENTOS.length);
    expect(saiuDe(0)).toBe('Saiu de: A-01 3 · B-02 3');
  });

  test('o Ajuste do total diz a parte da posição padrão; a linha sem endereço diz "sem endereço"', async () => {
    await renderizar();
    expect(saiuDe(1)).toBe('Saiu de: B-02 3 · posição padrão 3');
    expect(saiuDe(2)).toBe('Saiu de: sem endereço 1,5');
  });

  test('sem registro (lista vazia ou sem o campo) não mostra nada — e a linha com registro mostra', async () => {
    await renderizar();
    expect(saiuDe(3)).toBeNull();
    expect(saiuDe(4)).toBeNull();
    expect(saiuDe(0)).not.toBeNull();
  });
});
