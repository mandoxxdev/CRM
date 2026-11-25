/**
 * Lista de propostas (a da rota /comercial/propostas) com proposta em dólar — 25/11/2026: "coloquei 128 mil reais e na proposta
 * aparece US$ 128.990,00". O valor gravado é em reais; a lista mostra o do documento (÷ a cotação) e o em reais embaixo. A primeira
 * versão (manhã de 25/11) mudou o Propostas.js, que não está em rota nenhuma — a lista da tela continuou em R$.
 *
 * O mock de `services/api` é só a fronteira HTTP.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import PropostasList from './PropostasList';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, role: 'admin', nome: 'Vend' }, loading: false }),
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));

const propostas = [
  { id: 1, numero_proposta: 'P-USD', titulo: 'EM DOLAR', status: 'enviada', valor_total: 128990, moeda: 'USD', taxa_cambio: 5.8573, margem_desconto: 0, razao_social: 'CLI' },
  { id: 2, numero_proposta: 'P-SEM', titulo: 'SEM COTACAO', status: 'enviada', valor_total: 5000, moeda: 'USD', taxa_cambio: null, margem_desconto: 0, razao_social: 'CLI' },
  { id: 3, numero_proposta: 'P-BRL', titulo: 'EM REAL', status: 'enviada', valor_total: 7000, moeda: 'BRL', margem_desconto: 0, razao_social: 'CLI' },
];

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/propostas' ? propostas : [] }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

test('em dolar com cotacao: o valor do documento e o em reais embaixo; sem cotacao e em real: so reais', async () => {
  await act(async () => { root.render(<MemoryRouter><PropostasList /></MemoryRouter>); });
  for (let k = 0; k < 6; k++) await act(async () => { await Promise.resolve(); });
  const texto = container.textContent.replace(/ /g, ' ');
  expect(texto).toContain('EM DOLAR');
  expect(texto).toContain('US$ 22.022,09');
  expect(texto).toContain('R$ 128.990,00');
  expect(texto).not.toContain('US$ 128.990,00');
  expect(texto).toContain('R$ 5.000,00'); // sem cotacao: em reais, como o documento
  expect(texto).not.toContain('US$ 5.000,00');
  expect(texto).toContain('R$ 7.000,00');
});
