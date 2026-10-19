/**
 * Etapa 157 (RN-157.03, C375): a Preview da Rota sem lista de cidades — a coordenada do servidor, e o cliente sem resposta fica sem
 * localizacao (fora do mapa e da rota, marcado na legenda). A biblioteca do mapa e simulada na fronteira (o marcador vira um elemento com a
 * posicao); o centro e o zoom nao sao conferidos (o MapContainer do react-leaflet v4 so os le na montagem).
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('axios', () => jest.requireActual('axios/dist/browser/axios.cjs'));
jest.mock('leaflet', () => ({ __esModule: true, default: { divIcon: () => ({}) } }));
jest.mock('leaflet/dist/leaflet.css', () => ({}));
jest.mock('react-leaflet', () => {
  const R = require('react');
  return {
    __esModule: true,
    MapContainer: ({ children }) => R.createElement('div', { 'data-mapa': '1' }, children),
    TileLayer: () => null,
    Marker: ({ position, children }) => R.createElement('div', { 'data-marcador': JSON.stringify(position) }, children),
    Popup: ({ children }) => R.createElement('div', null, children),
    Polyline: ({ positions }) => R.createElement('div', { 'data-linha': JSON.stringify(positions) }),
  };
});

const axios = require('axios');
const api = require('../services/api').default;
const PreviewRota = require('./PreviewRota').default;

const ORIGEM = [-23.715, -46.555];
const CAMPINAS = [-22.9056, -47.0608];
let pedidos; let container; let root;
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  pedidos = [];
  api.defaults.adapter = async (config) => {
    pedidos.push(config.url);
    if (config.url === '/custos-viagens/coordenadas-cliente/5') {
      return { status: 200, statusText: 'OK', data: { coordenadas: CAMPINAS, lat: CAMPINAS[0], lon: CAMPINAS[1] }, headers: {}, config };
    }
    throw new axios.AxiosError('status 403', 'ERR_BAD_RESPONSE', config, null,
      { status: 403, statusText: '', data: { error: 'Acesso negado ao módulo' }, headers: {}, config });
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperar(cond, ms = 3000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (cond()) return true;
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await pausa(20); });
  }
  return cond();
}
const marcadores = () => [...container.querySelectorAll('[data-marcador]')].map((m) => JSON.parse(m.getAttribute('data-marcador')));

test('[RN-157.03, C375] um cliente sem endereco na coordenada do servidor; o recusado sem localizacao (fora do mapa, marcado na legenda)', async () => {
  const clientes = [
    { id: 5, razao_social: 'Cliente Campinas', cidade: 'CAMPINAS', estado: 'SP', endereco: null },
    { id: 9, razao_social: 'Cliente Recusado', cidade: 'SOROCABA', estado: 'SP', endereco: null },
  ];
  await act(async () => { root.render(<PreviewRota origem={ORIGEM} clientes={clientes} onClose={() => {}} />); });
  expect(await esperar(() => marcadores().length === 2)).toBe(true); // a origem e o localizado
  expect(marcadores()).toEqual([ORIGEM, CAMPINAS]); // antes: o de Campinas sem endereco ia para Sao Bernardo (deslocado pelo id)
  expect(pedidos.sort()).toEqual(['/custos-viagens/coordenadas-cliente/5', '/custos-viagens/coordenadas-cliente/9']);
  const legenda = container.textContent;
  expect(legenda).toContain('1. Cliente Campinas');
  expect(legenda).toMatch(/2\. Cliente Recusado\s*\(sem localização no mapa\)/);
  expect(legenda).not.toMatch(/Cliente Campinas\s*\(sem localização no mapa\)/);
  expect(legenda).toContain('Total: 2 ponto(s) na rota');
  const linha = JSON.parse(container.querySelector('[data-linha]').getAttribute('data-linha'));
  expect(linha).toEqual([ORIGEM, CAMPINAS]);
});

test('[RN-157.03] a coordenada que ja veio (os proximos) nao e pedida de novo', async () => {
  const clientes = [{ id: 6, razao_social: 'Proximo', cidade: 'JUNDIAI', estado: 'SP', coordenadas: [-23.1857, -46.8978] }];
  await act(async () => { root.render(<PreviewRota origem={ORIGEM} clientes={clientes} onClose={() => {}} />); });
  expect(await esperar(() => marcadores().length === 2)).toBe(true);
  expect(marcadores()[1]).toEqual([-23.1857, -46.8978]);
  expect(pedidos).toEqual([]);
});
