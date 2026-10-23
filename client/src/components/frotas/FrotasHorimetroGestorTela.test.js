/**
 * Frota Etapa 3 — Fase 5 (front x back, achado 4): a tela do gestor de verdade (FrotasEntityPage + configs) manda os campos de
 * horimetro no corpo que o servidor le (RN-F3.15) e mostra as horas na lista (RN-F3.11). O FrotasHorimetroGestor.test.js so confere
 * a configuracao; este renderiza a pagina, abre a edicao e le o PUT.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import FrotasEntityPage from './FrotasEntityPage';
import api from '../../services/api';
import { fetchFrotasMeta } from '../../utils/frotasApi';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../utils/frotasApi', () => ({ fetchFrotasMeta: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, nome: 'Gestor', role: 'user', admin_modulos: ['frota'] }, logout: jest.fn() }),
}));
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));

const MAQUINA = { id: 2, placa: 'EMP0001', tipo_medicao: 'horimetro' };
const VIAGEM_ABERTA = {
  id: 9, veiculo_id: 2, placa: 'EMP0001', motorista_id: null, motorista_nome: null, data_saida: '2026-10-23T07:00', data_retorno: null,
  km_saida: null, km_retorno: null, km_rodado: null, horimetro_saida: 125, horimetro_retorno: null, origem: '', destino: 'Galpao',
  finalidade: '', setor: null, status: 'em_andamento', observacoes: null,
};
const VIAGEM_FECHADA = { ...VIAGEM_ABERTA, id: 10, horimetro_retorno: 131.5, status: 'concluida' };

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  fetchFrotasMeta.mockResolvedValue({ statusViagem: ['solicitada', 'aprovada', 'em_andamento', 'concluida'] });
  api.get.mockImplementation((url) => {
    if (url === '/frotas/viagens') return Promise.resolve({ data: [VIAGEM_ABERTA, VIAGEM_FECHADA] });
    if (url === '/frotas/veiculos') return Promise.resolve({ data: [MAQUINA] });
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: {} });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

function campo(rotulo) {
  const grupo = [...container.querySelectorAll('.frotas-form-group')].find((g) => g.querySelector('label')?.textContent.trim() === rotulo);
  if (!grupo) throw new Error(`campo ${rotulo} nao encontrado`);
  return grupo.querySelector('input, select, textarea');
}

test('Viagens: lista mostra as horas; fechar a viagem da maquina manda horimetro_retorno e mantem o horimetro_saida', async () => {
  await act(async () => {
    root.render(<MemoryRouter><FrotasEntityPage entityKey="viagens" /></MemoryRouter>);
  });
  expect(container.textContent).toContain('6,5 h');
  const editar = container.querySelector('.frotas-actions .frotas-action-btn');
  await act(async () => { editar.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(campo('Horímetro saída (máquina)').value).toBe('125');
  const ret = campo('Horímetro retorno (máquina)');
  expect(ret.getAttribute('type')).toBe('number');
  act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(ret, '135');
    ret.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(api.put).toHaveBeenCalledTimes(1);
  const [url, corpo] = api.put.mock.calls[0];
  expect(url).toBe('/frotas/viagens/9');
  expect(Number(corpo.horimetro_retorno)).toBe(135);
  expect(Number(corpo.horimetro_saida)).toBe(125);
  expect(corpo.km_retorno).toBeNull();
});
