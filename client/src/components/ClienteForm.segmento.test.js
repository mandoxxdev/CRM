/**
 * Etapa 160 (RN-160.08, C389; T7) — o seletor Segmento do formulario do cliente, ao editar: o gravado "COSMÉTICOS" (o servidor poe em
 * maiusculas) mostra "Cosméticos" (antes: "Selecione..."); o que nao casa com nenhuma opcao aparece como opcao a mais; o vazio mostra
 * "Selecione..."; salvar sem mexer manda o segmento. O `api` simulado na fronteira HTTP.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import api from '../services/api';
import ClienteForm from './ClienteForm';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: '/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;
let container; let root;
beforeAll(() => { jest.spyOn(console, 'error').mockImplementation(() => {}); window.alert = jest.fn(); });
beforeEach(() => {
  api.get.mockReset(); api.put.mockReset();
  api.put.mockResolvedValue({ data: { message: 'ok' } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function abrir(segmento) {
  api.get.mockResolvedValue({ data: { id: 7, razao_social: 'CLIENTE 160', segmento, status: 'ativo', telefone: '' } });
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/comercial/clientes/editar/7']}>
        <Routes><Route path="/comercial/clientes/editar/:id" element={<ClienteForm />} /></Routes>
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 6; i++) await act(async () => {});
  return container.querySelector('select[name="segmento"]');
}

test('o gravado "COSMÉTICOS" mostra "Cosméticos", sem opcao a mais; salvar sem mexer manda o segmento', async () => {
  const sel = await abrir('COSMÉTICOS');
  expect(sel.value).toBe('Cosméticos');
  expect(sel.options[sel.selectedIndex].textContent).toBe('Cosméticos');
  expect(sel.options.length).toBe(8); // "Selecione..." + as 7 opcoes
  await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  for (let i = 0; i < 4; i++) await act(async () => {});
  expect(api.put).toHaveBeenCalledTimes(1);
  expect(api.put.mock.calls[0][1].segmento).toBe('Cosméticos'); // o servidor grava "COSMÉTICOS" de novo
});

test('o gravado que nao casa com nenhuma opcao aparece como opcao a mais, selecionada', async () => {
  const sel = await abrir('INDÚSTRIA PESADA');
  expect(sel.value).toBe('INDÚSTRIA PESADA');
  expect(sel.options.length).toBe(9);
});

test('o segmento vazio ou nulo mostra "Selecione...", sem opcao a mais', async () => {
  for (const vazio of [null, '', '   ']) {
    const sel = await abrir(vazio);
    expect(sel.value).toBe('');
    expect(sel.options[sel.selectedIndex].textContent).toBe('Selecione...');
    expect(sel.options.length).toBe(8);
  }
});
