/**
 * Selo de propriedade no extrato do material (Etapa 8, Task 9).
 *
 * O extrato é a tela onde se decide o que fazer com o saldo (movimentar, reservar, requisitar).
 * `GET /materiais/:id/extrato` é leitura por id — classe B da auditoria da Task 1, NÃO filtra o
 * dono de propósito, senão o extrato do material de cliente viria vazio. A contrapartida de não
 * filtrar é dizer de quem é: sem o selo, o extrato da chapa do cliente é idêntico ao da nossa.
 *
 * As duas metades andam juntas: só exigir a presença do selo seria aprovado por uma implementação
 * que o pinta em todo material.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/ExtratoMaterialModal --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ExtratoMaterialModal from './ExtratoMaterialModal';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const MATERIAL_BASE = {
  id: 5, codigo: 'CHP-005', nome: 'Chapa 3mm', categoria: 'Chapas', unidade: 'PC',
  quantidade_atual: 40, quantidade_reservada: 0, quantidade_bloqueada: 0,
  quantidade_em_inspecao: 0, quantidade_disponivel: 40, custo_medio: 25,
  controle_serie: 0, controle_lote: 0,
};

let container;
let root;
const fechar = () => {};

function mockExtrato(material) {
  api.get.mockImplementation((url) => {
    if (url === `/almoxarifado/materiais/${material.id}/extrato`) {
      return Promise.resolve({
        data: { material, saldos_localizacao: [], movimentacoes: [], reservas: [] },
      });
    }
    return Promise.resolve({ data: [] });
  });
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function renderizar(material) {
  mockExtrato(material);
  await act(async () => {
    root.render(<ExtratoMaterialModal materialId={material.id} onClose={fechar} />);
  });
}

describe('ExtratoMaterialModal — selo de propriedade', () => {
  test('extrato de material de cliente mostra o selo com a razão social', async () => {
    await renderizar({ ...MATERIAL_BASE, proprietario_cliente_id: 7, proprietario_cliente_nome: 'Cliente Alfa LTDA' });
    const selo = container.querySelector('.almox-badge-cliente');
    expect(selo).not.toBeNull();
    expect(selo.textContent).toContain('Cliente Alfa LTDA');
  });

  test('[controle positivo] extrato de material nosso não mostra selo', async () => {
    await renderizar({ ...MATERIAL_BASE, proprietario_cliente_id: null, proprietario_cliente_nome: null });
    expect(container.querySelector('.almox-badge-cliente')).toBeNull();
  });
});
