/**
 * Etapa 34, RN-34.08 — a lista de fornecedores mostra os DOIS telefones na coluna Telefone
 * (empresa em cima, vendedor embaixo) e a exportação para Excel ganha "Telefone vendedor".
 *
 * Mínimo de propósito: `Compras.js` não tinha teste nenhum em `main`; este cobre só o que a
 * etapa tocou. Servidor e exportação mockados na fronteira.
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=Compras.fornecedores
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Compras from './Compras';
import api from '../services/api';
import { exportToExcel } from '../utils/exportExcel';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../utils/exportExcel', () => ({ exportToExcel: jest.fn() }));

const FORNECEDORES = [
  { id: 1, razao_social: 'TECNOPAR FIXADORES LTDA', nome_fantasia: 'TECNOPAR', cnpj: '54.984.382/0001-64',
    contato: 'Carlos', email: 'contato@tecnopar.com.br', telefone: '(11) 4177-2311',
    telefone_vendedor: '(11) 98765-4321', status: 'ativo', created_at: '2026-01-01 10:00:00' },
  { id: 2, razao_social: 'SO EMPRESA LTDA', nome_fantasia: '', cnpj: '', contato: '', email: '',
    telefone: '(19) 3222-3333', telefone_vendedor: null, status: 'ativo', created_at: '2026-01-02 10:00:00' },
];

let container;
let root;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.get.mockImplementation((url) => {
    if (url === '/compras/fornecedores') return Promise.resolve({ data: FORNECEDORES });
    return Promise.resolve({ data: [] });
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderLista() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/compras/fornecedores']}>
        <Routes>
          <Route path="*" element={<Compras />} />
        </Routes>
      </MemoryRouter>
    );
    await new Promise((r) => setTimeout(r, 0));
  });
}

const colunaTelefone = () => [...container.querySelectorAll('thead th')].findIndex((th) => th.textContent.trim() === 'Telefone');
const celulaTelefone = (linha) => container.querySelectorAll('tbody tr')[linha].querySelectorAll('td')[colunaTelefone()];

test('a coluna Telefone mostra a empresa em cima e o vendedor embaixo (cell-secondary) quando houver', async () => {
  await renderLista();
  expect(container.querySelectorAll('tbody tr').length).toBe(2);
  const c1 = celulaTelefone(0);
  expect(c1.querySelector('.cell-primary').textContent).toBe('(11) 4177-2311');
  expect(c1.querySelector('.cell-secondary').textContent).toBe('(11) 98765-4321');
  const c2 = celulaTelefone(1);
  expect(c2.querySelector('.cell-primary').textContent).toBe('(19) 3222-3333');
  expect(c2.querySelector('.cell-secondary')).toBeNull();
});

test('exportar para Excel inclui a coluna "Telefone vendedor"', async () => {
  await renderLista();
  const botao = [...container.querySelectorAll('button')].find((b) => /Exportar Excel/.test(b.textContent));
  await act(async () => { botao.click(); });
  expect(exportToExcel).toHaveBeenCalledTimes(1);
  const linhas = exportToExcel.mock.calls[0][0];
  expect(linhas[0]['Telefone']).toBe('(11) 4177-2311');
  expect(linhas[0]['Telefone vendedor']).toBe('(11) 98765-4321');
  expect(linhas[1]['Telefone vendedor']).toBe('');
});
