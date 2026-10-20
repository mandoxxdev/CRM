/**
 * Etapa 162 (Almoxarifado, navegador) — RN-162.08 (C405): os "dias em espera" das Inspecoes pendentes contam do instante real do
 * recebimento. O `created_at` chega do banco como 'AAAA-MM-DD HH:MM:SS' em UTC, sem fuso; lido como hora local (o `new Date(texto)`),
 * ficava 3 h depois do real no Brasil e o recebimento de 24h30 atras aparecia "hoje". Blocos de 24 h (B1036).
 *
 * DEPENDE DO FUSO: so prova algo a OESTE de UTC (a maquina deste projeto e UTC-3). A guarda derruba em UTC e a leste, onde o certo e o
 * errado coincidem (a leste, o decorrido errado sai MAIOR e continua 1 dia — Fase 2 da 162). O relogio e fixo (Date.now).
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import api from '../../services/api';
import InspecoesAlmoxarifado from './InspecoesAlmoxarifado';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: '/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn(), warning: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => {
  const user = { id: 1, nome: 'Admin', role: 'admin', perfil_almoxarifado: 'ADMINISTRADOR' };
  return { useAuth: () => ({ user }) };
});
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({ perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false }),
}));

global.IS_REACT_ACT_ENVIRONMENT = true;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
let container; let root;
const AGORA = Date.parse('2026-10-20T15:00:00Z'); // 20/10 12:00 em Brasilia
/** o texto do banco (UTC sem fuso) de `horas` atras */
const atras = (horas) => new Date(AGORA - horas * 3600000).toISOString().slice(0, 19).replace('T', ' ');

beforeAll(() => { jest.spyOn(console, 'error').mockImplementation(() => {}); });
beforeEach(() => {
  expect(new Date().getTimezoneOffset()).toBeGreaterThan(0); // guarda: a oeste de UTC (senao o teste passa vazio)
  jest.spyOn(Date, 'now').mockReturnValue(AGORA);
  api.get.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Date.now.mockRestore();
});

test('[RN-162.08, C405] dias em espera: 24h30 atras = "há 1 dia", 48h30 = "há 2 dias", 23h30 = "hoje"; vazio nao mostra nada', async () => {
  const linhas = [
    { item_id: 1, id: 1, material_id: 1, material_nome: 'MAT 24H30', material_codigo: 'M-1', quantidade_retida: 1, recebimento_numero: 'REC-1', data_entrada: atras(24.5) },
    { item_id: 2, id: 2, material_id: 1, material_nome: 'MAT 48H30', material_codigo: 'M-2', quantidade_retida: 1, recebimento_numero: 'REC-2', data_entrada: atras(48.5) },
    { item_id: 3, id: 3, material_id: 1, material_nome: 'MAT 23H30', material_codigo: 'M-3', quantidade_retida: 1, recebimento_numero: 'REC-3', data_entrada: atras(23.5) },
    { item_id: 4, id: 4, material_id: 1, material_nome: 'MAT SEM DATA', material_codigo: 'M-4', quantidade_retida: 1, recebimento_numero: 'REC-4', data_entrada: null },
  ];
  api.get.mockImplementation(async (url) => (url === '/almoxarifado/inspecoes/pendentes' ? { data: linhas } : { data: [] }));
  await act(async () => { root.render(<MemoryRouter><InspecoesAlmoxarifado /></MemoryRouter>); });
  for (let i = 0; i < 6; i++) await act(async () => { await pausa(0); });
  const linha = (nome) => {
    const tr = [...container.querySelectorAll('tbody tr')].find((x) => x.textContent.includes(nome));
    expect(tr).toBeTruthy();
    return tr.textContent;
  };
  expect(linha('MAT 24H30')).toContain('há 1 dia');
  expect(linha('MAT 24H30')).not.toContain('hoje');
  expect(linha('MAT 48H30')).toContain('há 2 dias');
  expect(linha('MAT 23H30')).toContain('hoje');
  expect(linha('MAT 23H30')).not.toContain('há ');
  expect(linha('MAT SEM DATA')).not.toMatch(/hoje|há \d/);
});
