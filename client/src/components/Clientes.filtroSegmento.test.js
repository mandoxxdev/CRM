/**
 * Etapa 159 (RN-159.01, C384; Fase 2 I4) — a lista de clientes manda o segmento escolhido e so a resposta do ultimo pedido vale.
 * A camada de comunicacao REAL (`services/api.js`, axios real), adaptador falso na fronteira HTTP.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

jest.mock('axios', () => jest.requireActual('axios/dist/browser/axios.cjs'));

const axios = require('axios');
const api = require('../services/api').default;
const Clientes = require('./Clientes').default;

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
jest.setTimeout(20000); // os cenarios das respostas lentas passam de 3 s
const COSM = { id: 1, razao_social: 'CLIENTE COSMETICO 159', segmento: 'COSMÉTICOS', status: 'ativo' };
const QUIM = { id: 2, razao_social: 'CLIENTE QUIMICO 159', segmento: 'QUÍMICO', status: 'ativo' };

let pedidos; let atrasoPara; let container; let root;
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  pedidos = [];
  atrasoPara = () => 0;
  api.defaults.adapter = async (config) => {
    const uri = axios.getUri(config);
    const [caminho, consulta] = uri.split('?');
    const qs = new URLSearchParams(consulta || '');
    if (caminho.endsWith('/clientes')) {
      pedidos.push(Object.fromEntries(qs));
      const seg = qs.get('segmento');
      const atraso = atrasoPara(seg);
      if (atraso) await pausa(atraso);
      const data = seg === 'Cosméticos' ? [COSM] : seg === 'Químico' ? [QUIM] : [COSM, QUIM];
      return { status: 200, statusText: 'OK', data, headers: {}, config };
    }
    return { status: 200, statusText: 'OK', data: [], headers: {}, config };
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function escolher(sel, valor) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  set.call(sel, valor);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}
async function esperar(cond, ms = 3000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (cond()) return; await act(async () => { await pausa(20); }); }
  throw new Error('a condicao nao chegou');
}

test('[RN-159.01] o segmento vai no pedido e a lista mostra o que o servidor devolveu', async () => {
  await act(async () => { root.render(<MemoryRouter><Clientes /></MemoryRouter>); });
  await esperar(() => container.textContent.includes('CLIENTE QUIMICO 159'));
  expect(pedidos[0]).toEqual({});
  const sel = container.querySelector('select.filter-select');
  await act(async () => { escolher(sel, 'Cosméticos'); });
  await esperar(() => pedidos.some((p) => p.segmento === 'Cosméticos'));
  await esperar(() => !container.textContent.includes('CLIENTE QUIMICO 159'));
  expect(container.textContent).toContain('CLIENTE COSMETICO 159');
});

test('[RN-159.01, Fase 2 I4] a resposta lenta do segmento anterior chega depois e nao troca a lista', async () => {
  atrasoPara = (seg) => (seg === 'Cosméticos' ? 900 : 0);
  await act(async () => { root.render(<MemoryRouter><Clientes /></MemoryRouter>); });
  await esperar(() => container.textContent.includes('CLIENTE QUIMICO 159'));
  const sel = container.querySelector('select.filter-select');
  await act(async () => { escolher(sel, 'Cosméticos'); });
  await esperar(() => pedidos.some((p) => p.segmento === 'Cosméticos'));
  await act(async () => { escolher(sel, 'Químico'); });
  await esperar(() => pedidos.some((p) => p.segmento === 'Químico'));
  await esperar(() => !container.textContent.includes('CLIENTE COSMETICO 159'));
  // a resposta do Cosméticos (900 ms) chega agora
  await act(async () => { await pausa(1100); });
  expect(container.textContent).toContain('CLIENTE QUIMICO 159');
  expect(container.textContent).not.toContain('CLIENTE COSMETICO 159');
});

test('[RN-159.02] a busca vai aparada; so espacos nao vai', async () => {
  await act(async () => { root.render(<MemoryRouter><Clientes /></MemoryRouter>); });
  await esperar(() => pedidos.length >= 1);
  const input = container.querySelector('.search-box input');
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { set.call(input, '  acme '); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await esperar(() => pedidos.some((p) => p.search === 'acme'));
  const n = pedidos.length;
  await act(async () => { set.call(input, '   '); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await esperar(() => pedidos.length > n);
  expect(pedidos[pedidos.length - 1]).toEqual({});
});

test('[RN-159.01, Fase 5 r3 C02] o pedido anterior que termina antes do ultimo nao tira o "carregando" (a lista velha nao reaparece)', async () => {
  // o Cosméticos responde DEPOIS de o Químico sair (a pausa da tela e de 300 ms) e ANTES de ele responder
  atrasoPara = (seg) => (seg === 'Cosméticos' ? 900 : seg === 'Químico' ? 2500 : 0);
  await act(async () => { root.render(<MemoryRouter><Clientes /></MemoryRouter>); });
  await esperar(() => container.textContent.includes('CLIENTE QUIMICO 159'));
  const sel = container.querySelector('select.filter-select');
  await act(async () => { escolher(sel, 'Cosméticos'); });
  await esperar(() => pedidos.some((p) => p.segmento === 'Cosméticos'));
  await act(async () => { escolher(sel, 'Químico'); });
  await esperar(() => pedidos.some((p) => p.segmento === 'Químico'));
  // a resposta do Cosméticos chega agora; a do Químico ainda nao: a tela continua carregando, sem a lista de antes
  await act(async () => { await pausa(900); });
  expect(container.textContent).not.toContain('CLIENTE COSMETICO 159');
  await esperar(() => container.textContent.includes('CLIENTE QUIMICO 159'));
  expect(container.textContent).not.toContain('CLIENTE COSMETICO 159');
});
