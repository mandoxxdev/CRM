/**
 * Etapa 56 (T2, RN-01) — Configurações → Localizações imprime etiqueta de localização: "Etiqueta"
 * por linha e "Etiquetas" para as listadas. A tela só monta os descritores; quem desenha o PDF é o
 * EtiquetasPdfModal (mockado aqui para capturar o que recebe).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/LocalizacaoEtiqueta --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ConfiguracoesAlmoxarifado from './ConfiguracoesAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, nome: 'Admin', perfil_almoxarifado: 'ADMINISTRADOR' } }),
}));

jest.mock('../../services/permissionsCache', () => ({
  getEffectiveUser: (u) => u,
}));

const mockModalProps = [];
jest.mock('./EtiquetasPdfModal', () => ({
  __esModule: true,
  default: (props) => { mockModalProps.push(props); return null; },
}));

const LOCS = [
  { id: 7, codigo: 'COR-A-03', descricao: 'Prateleira 3', setor: 'Corredor A', tipo: 'Prateleira', almoxarifado_id: 1, endereco_completo: 'ALM-01 / Corredor A / COR-A-03' },
  { id: 8, codigo: 'A&B#1+2', descricao: 'Gaveta', setor: 'Corredor B', tipo: 'Gaveta', almoxarifado_id: 1, endereco_completo: 'ALM-01 / Corredor B / A&B#1+2' },
];

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  mockModalProps.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/localizacoes') return Promise.resolve({ data: LOCS });
    if (url === '/almoxarifado/meta/tipos-material') return Promise.resolve({ data: { localizacoes_tipos: [], tipos: [] } });
    if (url === '/almoxarifado/almoxarifados') return Promise.resolve({ data: [{ id: 1, codigo: 'ALM-01', nome: 'Geral', ativo: 1 }] });
    return Promise.resolve({ data: [] });
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };

async function renderAba() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/configuracoes?tab=localizacoes']}>
        <ConfiguracoesAlmoxarifado />
      </MemoryRouter>
    );
  });
  await flush();
}

const clicar = async (el) => {
  expect(el).toBeTruthy();
  await act(async () => { el.click(); });
  await flush();
};

const ultimasEtiquetas = () => mockModalProps[mockModalProps.length - 1].etiquetas;

test('modal começa fechado (etiquetas null)', async () => {
  await renderAba();
  expect(mockModalProps.length).toBeGreaterThan(0);
  expect(ultimasEtiquetas()).toBeNull();
});

test('"Etiqueta" na linha monta UMA etiqueta daquela localização, com QR para o Mapa', async () => {
  await renderAba();
  await clicar(container.querySelector('button[aria-label="Etiqueta A&B#1+2"]'));
  const etiquetas = ultimasEtiquetas();
  expect(etiquetas).toHaveLength(1);
  const [e] = etiquetas;
  expect(e.codigo).toBe('A&B#1+2');
  expect(e.nome).toBe('ALM-01 / Corredor B / A&B#1+2');
  const url = new URL(e.qrUrl);
  expect(url.pathname).toBe('/almoxarifado/mapa');
  expect(url.searchParams.get('loc')).toBe('8');
  expect(url.searchParams.get('codigo')).toBe('A&B#1+2');
});

test('"Etiquetas (N)" monta uma por localização listada, na ordem da lista', async () => {
  await renderAba();
  const botao = [...container.querySelectorAll('button')].find(b => /^\s*Etiquetas \(2\)/.test(b.textContent));
  await clicar(botao);
  expect(ultimasEtiquetas().map(e => e.codigo)).toEqual(['COR-A-03', 'A&B#1+2']);
});
