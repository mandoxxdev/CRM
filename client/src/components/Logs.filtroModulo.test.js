/**
 * Logs de Auditoria — o filtro de módulo (Etapa 111, G17, RN-111.09; achado da Fase 2).
 *
 * Até a 110 o filtro tinha 6 opções escritas à mão (sem engenharia, engenharia/projetos, almoxarifado, frota e
 * TODOLIST; admin como "Admin"), enquanto a coluna Módulo da mesma tela mostra "Administração" e — desde esta
 * etapa — o 403 do almoxarifado com o nome. O filtro passa a sair de `MODULOS_ORDEM` + `NOMES_MODULO`.
 * Escrito antes da troca: nasce vermelho.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/Logs.filtroModulo --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Logs from './Logs';
import api from '../services/api';

jest.mock('../services/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../utils/exportExcel', () => ({ exportToExcel: jest.fn() }));

global.IS_REACT_ACT_ENVIRONMENT = true;

let container; let root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.get.mockImplementation(() => Promise.resolve({ data: [] }));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render() {
  await act(async () => { root.render(<Logs />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const selectModulo = () => [...container.querySelectorAll('select')]
  .find((s) => [...s.options].some((o) => o.textContent === 'Todos os Módulos'));

test('RN-111.09 o filtro oferece os 11 módulos com o nome da coluna (Administração, não Admin)', async () => {
  await render();
  const sel = selectModulo();
  expect(sel).toBeTruthy();
  expect([...sel.options].map((o) => [o.value, o.textContent])).toEqual([
    ['', 'Todos os Módulos'],
    ['comercial', 'Comercial'],
    ['compras', 'Compras'],
    ['financeiro', 'Financeiro'],
    ['operacional', 'Operacional'],
    ['engenharia', 'Cálculos de Engenharia'],
    ['engenharia_projetos', 'Engenharia / Projetos'],
    ['almoxarifado', 'Almoxarifado'],
    ['frota', 'Frota'],
    ['todolist', 'TODOLIST'],
    ['administrativo', 'Administrativo'],
    ['admin', 'Administração'],
  ]);
});

test('RN-111.09 escolher Almoxarifado pede os logs com modulo=almoxarifado', async () => {
  await render();
  const sel = selectModulo();
  api.get.mockClear();
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(sel, 'almoxarifado');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(api.get).toHaveBeenCalledWith('/auditoria/logs', { params: { modulo: 'almoxarifado' } });
});
