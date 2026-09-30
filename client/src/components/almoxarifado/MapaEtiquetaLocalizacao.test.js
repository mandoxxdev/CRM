/**
 * Etapa 56 (T2, RN-01) — o Mapa aberto pela etiqueta de localização (`?loc=<id>&codigo=<impresso>`).
 *
 * O Mover renumera o código e mantém o id: a etiqueta velha continua abrindo a localização certa,
 * mas o código impresso não é mais o dela. O Mapa compara e avisa. `?loc` fora da lista (o mapa só
 * traz ativas) também avisa, em vez de abrir o mapa sem seleção.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MapaEtiquetaLocalizacao --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MapaLocalizacoesAlmoxarifado from './MapaLocalizacoesAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, nome: 'Operador' } }),
}));

jest.mock('../../services/permissionsCache', () => ({
  getEffectiveUser: (u) => u,
}));

const LOCS = [
  { id: 7, codigo: 'COR-A-03', setor: 'Corredor A', tipo: 'Prateleira', almoxarifado_id: 1, quantidade_total: 0, itens_criticos: 0, itens_baixo_minimo: 0 },
  { id: 8, codigo: 'A&B#1+2', setor: 'Corredor B', tipo: 'Prateleira', almoxarifado_id: 1, quantidade_total: 0, itens_criticos: 0, itens_baixo_minimo: 0 },
];

let container;
let root;
let mapaImpl;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mapaImpl = () => Promise.resolve({ data: LOCS });
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/mapa/localizacoes') return mapaImpl();
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

async function renderMapa(query) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/almoxarifado/mapa${query}`]}>
        <MapaLocalizacoesAlmoxarifado />
      </MemoryRouter>
    );
  });
  await flush();
}

const aviso = (id) => container.querySelector(`[data-testid="${id}"]`);

test('etiqueta com código velho (o Mover renumerou): avisa "desatualizada" com os dois códigos', async () => {
  await renderMapa('?loc=7&codigo=COR-A-01');
  const el = aviso('aviso-etiqueta-desatualizada');
  expect(el).toBeTruthy();
  expect(el.textContent).toBe('Etiqueta desatualizada: COR-A-01 → COR-A-03. Reimprima.');
  expect(aviso('aviso-loc-nao-encontrada')).toBeNull();
});

test('etiqueta em dia (código com & # + vindo encodado): sem aviso', async () => {
  await renderMapa(`?loc=8&codigo=${encodeURIComponent('A&B#1+2')}`);
  expect(aviso('aviso-etiqueta-desatualizada')).toBeNull();
  expect(aviso('aviso-loc-nao-encontrada')).toBeNull();
});

test('?loc sem codigo (link antigo do mapa): sem aviso', async () => {
  await renderMapa('?loc=7');
  expect(aviso('aviso-etiqueta-desatualizada')).toBeNull();
  expect(aviso('aviso-loc-nao-encontrada')).toBeNull();
});

test('?loc fora da lista (inativa ou apagada): avisa "não encontrada ou inativa"', async () => {
  await renderMapa('?loc=999&codigo=X-1');
  const el = aviso('aviso-loc-nao-encontrada');
  expect(el).toBeTruthy();
  expect(el.textContent).toBe('Localização não encontrada ou inativa');
  expect(aviso('aviso-etiqueta-desatualizada')).toBeNull();
});

test('mapa vazio (nenhuma ativa) com ?loc: também avisa', async () => {
  mapaImpl = () => Promise.resolve({ data: [] });
  await renderMapa('?loc=7&codigo=COR-A-03');
  expect(aviso('aviso-loc-nao-encontrada')).toBeTruthy();
});

test('carga do mapa falhou: não afirma "não encontrada" (o erro vai no toast)', async () => {
  mapaImpl = () => Promise.reject(new Error('rede'));
  await renderMapa('?loc=7&codigo=COR-A-03');
  expect(aviso('aviso-loc-nao-encontrada')).toBeNull();
});
