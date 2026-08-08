/**
 * Livro de movimentações — quais linhas oferecem o botão de estorno.
 *
 * Achado do review final da Etapa 5: `podeEstornar` só excluía ESTORNO/RESERVA/LIBERACAO_RESERVA,
 * então o botão aparecia HABILITADO nas linhas de quarentena/inspeção. Não é cosmético: antes da
 * correção do servidor, clicar nele gravava uma linha ESTORNO e marcava a original cancelada SEM
 * reverter `quantidade_em_inspecao` — o livro afirmava uma reversão que nunca aconteceu. Com o
 * servidor recusando, o botão só entregaria um 400. Nos dois casos a tela não pode oferecê-lo.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado --watchAll=false
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

// Permissões liberadas: o alvo aqui é a regra da tela, e o gate real é do servidor.
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

jest.mock('./ExtratoMaterialModal', () => ({
  __esModule: true,
  default: () => null,
}));

const movimento = (id, tipo) => ({
  id, tipo, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm', unidade: 'PC',
  quantidade: 10, saldo_anterior: 100, saldo_posterior: tipo === 'SAIDA' ? 90 : 100,
  usuario_nome: 'Maria', created_at: '2026-08-08T10:00:00Z', cancelado: 0,
});

// Uma linha de cada tipo cujo estorno o servidor recusa, mais uma SAIDA de controle: sem ela o
// teste passaria com um `podeEstornar` que devolvesse false para tudo.
const MOVIMENTOS = [
  movimento(1, 'SAIDA'),
  movimento(2, 'QUARENTENA'),
  movimento(3, 'LIBERACAO_INSPECAO'),
  movimento(4, 'REPROVACAO_INSPECAO'),
  movimento(5, 'DECISAO_INSPECAO'),
  movimento(6, 'RESERVA'),
  movimento(7, 'LIBERACAO_RESERVA'),
  { ...movimento(8, 'ESTORNO'), quantidade: 10 },
];

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  // Implementações aqui, não na fábrica do jest.mock: clearAllMocks apaga implementações e só
  // o primeiro teste teria dados.
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/movimentacoes') return Promise.resolve({ data: MOVIMENTOS });
    if (url === '/almoxarifado/materiais') {
      return Promise.resolve({ data: [{ id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC' }] });
    }
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { success: true } });
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
    root.render(<MemoryRouter><MovimentacoesAlmoxarifado /></MemoryRouter>);
  });
}

const linhas = () => [...container.querySelectorAll('.almox-table tbody tr')];

/** Índice da linha (na ordem de MOVIMENTOS) tem botão de estorno? */
const temBotaoEstorno = (i) => !!linhas()[i]
  .querySelector('.almox-btn-icon.danger');

describe('MovimentacoesAlmoxarifado — botão de estorno por tipo', () => {
  test('oferece estorno numa SAIDA comum', async () => {
    await renderizar();
    expect(linhas()).toHaveLength(MOVIMENTOS.length);
    expect(temBotaoEstorno(0)).toBe(true);
  });

  test('não oferece estorno nos tipos de quarentena/inspeção (reversão é pela tela de Inspeções)', async () => {
    await renderizar();
    // índices 1..4 = QUARENTENA, LIBERACAO_INSPECAO, REPROVACAO_INSPECAO, DECISAO_INSPECAO
    [1, 2, 3, 4].forEach((i) => {
      expect(`${MOVIMENTOS[i].tipo}: ${temBotaoEstorno(i)}`).toBe(`${MOVIMENTOS[i].tipo}: false`);
    });
  });

  test('continua sem oferecer estorno em reserva e em estorno', async () => {
    await renderizar();
    [5, 6, 7].forEach((i) => {
      expect(`${MOVIMENTOS[i].tipo}: ${temBotaoEstorno(i)}`).toBe(`${MOVIMENTOS[i].tipo}: false`);
    });
  });
});
