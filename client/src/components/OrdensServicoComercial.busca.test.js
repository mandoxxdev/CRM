/**
 * Etapa 159 (RN-159.02, C385; Fase 2 I3) — a busca da tela das OS do Comercial vai aparada ao servidor e o filtro do navegador apara
 * tambem: " são josé " mostra a OS que o servidor devolveu (antes, o servidor nao aparava e o navegador procurava " são josé " com os
 * espacos, e a lista ficava vazia).
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import OrdensServicoComercial from './OrdensServicoComercial';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: '/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn(), warning: jest.fn() },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

const OS = [
  { id: 10, numero_os: 'OS-159-10', status: 'pendente', cliente_nome: 'SÃO JOSÉ USINAGEM', descricao: 'MANUTENÇÃO' },
  { id: 11, numero_os: 'OS-159-11', status: 'pendente', cliente_nome: 'ACME', descricao: 'OUTRA' },
];
// a aba Propostas: o servidor devolve as aprovadas e a tela filtra no navegador (Fase 5 r3 OS01)
const PROPOSTAS = [
  { id: 1, numero_proposta: 'P-159-A', cliente_nome: 'SÃO JOSÉ USINAGEM', titulo: 'TANQUE', status: 'aprovada' },
  { id: 2, numero_proposta: 'P-159-B', cliente_nome: 'ACME', titulo: 'MISTURADOR', status: 'aprovada' },
];
let pedidosOs;
beforeEach(() => {
  pedidosOs = [];
  api.get.mockImplementation((url, cfg) => {
    if (url === '/comercial/ordens-servico') {
      const s = (cfg && cfg.params && cfg.params.search) || '';
      pedidosOs.push(cfg && cfg.params);
      // o servidor de verdade (desde a 159): aparado; sem termo, todas
      return Promise.resolve({ data: s ? OS.filter((o) => o.cliente_nome.includes(s.toUpperCase())) : OS });
    }
    if (url === '/propostas') return Promise.resolve({ data: PROPOSTAS });
    if (url.startsWith('/propostas/')) return Promise.resolve({ data: { itens: [] } });
    return Promise.resolve({ data: [] });
  });
});

let container; let root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test('[RN-159.02, Fase 2 I3] " são josé " vai aparado e a OS que o servidor devolveu aparece; a outra nao', async () => {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/comercial/ordens-servico']}><OrdensServicoComercial /></MemoryRouter>);
  });
  for (let i = 0; i < 4; i++) await act(async () => {});
  const aba = [...container.querySelectorAll('[role="tab"]')].find((t) => t.textContent.includes('Ordens de Serviço'));
  await act(async () => { aba.click(); });
  for (let i = 0; i < 4; i++) await act(async () => {});
  expect(container.textContent).toContain('OS-159-11');
  const input = container.querySelector('.search-box input');
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { set.call(input, ' são josé '); input.dispatchEvent(new Event('input', { bubbles: true })); });
  for (let i = 0; i < 6; i++) await act(async () => {});
  expect(pedidosOs[pedidosOs.length - 1]).toEqual({ search: 'são josé' });
  expect(container.textContent).toContain('OS-159-10');
  expect(container.textContent).not.toContain('OS-159-11');
});

test('[RN-159.02, Fase 5 r3 OS01] a aba Propostas com " são josé " mostra a proposta do cliente (o filtro do navegador apara)', async () => {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/comercial/ordens-servico']}><OrdensServicoComercial /></MemoryRouter>);
  });
  for (let i = 0; i < 4; i++) await act(async () => {});
  expect(container.textContent).toContain('P-159-B');
  const input = container.querySelector('.search-box input');
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { set.call(input, ' são josé '); input.dispatchEvent(new Event('input', { bubbles: true })); });
  for (let i = 0; i < 6; i++) await act(async () => {});
  expect(container.textContent).toContain('P-159-A');
  expect(container.textContent).not.toContain('P-159-B');
});
