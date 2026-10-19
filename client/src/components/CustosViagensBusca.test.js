/**
 * Etapa 159 (RN-159.03, C386; Fase 2 I5/I6) — a busca de texto da lista dos custos de viagem, com a camada de comunicacao REAL
 * (`services/api.js`, axios real, adaptador falso na fronteira HTTP).
 *
 *   o texto vai como `busca` (nunca `codigo_visita`), 300 ms depois da ultima tecla, num pedido so; escolher a sugestao manda `cliente_id`
 *   sem `busca`; voltar a digitar depois da sugestao nao pede na hora; distancia/valor recarregam; Limpar recarrega sem filtro; a resposta
 *   (e a falha) de um pedido anterior que chega depois nao troca a lista; a sugestao com espaco no fim continua (RN-159.02).
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('axios', () => jest.requireActual('axios/dist/browser/axios.cjs'));
jest.mock('recharts', () => {
  const Nada = () => null;
  return { __esModule: true, BarChart: Nada, Bar: Nada, XAxis: Nada, YAxis: Nada, CartesianGrid: Nada, Tooltip: Nada, Legend: Nada,
    ResponsiveContainer: Nada, PieChart: Nada, Pie: Nada, Cell: Nada };
});
jest.mock('leaflet', () => ({ __esModule: true, default: { divIcon: () => ({}) } }));
jest.mock('leaflet/dist/leaflet.css', () => ({}));
jest.mock('react-leaflet', () => ({ __esModule: true, MapContainer: () => null, TileLayer: () => null, Marker: () => null, Popup: () => null, Polyline: () => null }));

const axios = require('axios');
const api = require('../services/api').default;
const CustosViagens = require('./CustosViagens').default;

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const CLIENTE = { id: 5, razao_social: 'ACME CAMPINAS', cidade: 'CAMPINAS', estado: 'SP', endereco: null, status: 'ativo' };
const custo = (id, codigo, km, extra = {}) => ({ id, codigo_visita: codigo, cliente_id: 5, cliente_nome: 'ACME CAMPINAS', data_viagem: '2026-10-20',
  tipo_viagem: 'IDA_E_VOLTA', destino: 'CAMPINAS - SP', destino_cidade: 'CAMPINAS', destino_estado: 'SP', distancia_km: km, total_custo: 100,
  custo_transporte: 100, status_aprovacao: 'pendente', ...extra });
const TODOS = [custo(1, 'VIS-0001', 50), custo(2, 'VIS-0002', 300)];

let pedidosLista; let respostaDaLista; let container; let root;
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  pedidosLista = [];
  respostaDaLista = () => ({ data: TODOS });
  api.defaults.adapter = async (config) => {
    const [caminho, consulta] = axios.getUri(config).split('?');
    const q = new URLSearchParams(consulta || '');
    const ok = (data) => ({ status: 200, statusText: 'OK', data, headers: {}, config });
    if (caminho.endsWith('/custos-viagens') && config.method === 'get') {
      const p = Object.fromEntries(q);
      delete p.ordenar_por; delete p.ordem;
      pedidosLista.push(p);
      const r = respostaDaLista(p);
      if (r.atraso) await pausa(r.atraso);
      if (r.falha) throw new axios.AxiosError('status 500', 'ERR_BAD_RESPONSE', config, null, { status: 500, statusText: '', data: {}, headers: {}, config });
      return ok(r.data);
    }
    if (caminho.endsWith('/custos-viagens/resumo')) return ok({});
    if (caminho.endsWith('/clientes')) return ok([CLIENTE]);
    return ok([]);
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function esperar(cond, ms = 3000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (cond()) return true; await act(async () => { await pausa(20); }); } // eslint-disable-line no-await-in-loop
  return cond();
}
const texto = () => container.textContent;
const clicar = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
async function digitar(el, valor) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { set.call(el, valor); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const busca = () => container.querySelector('input.busca-input-moderno');
const botao = (rotulo) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().includes(rotulo));
async function montar() {
  await act(async () => { root.render(<CustosViagens />); });
  expect(await esperar(() => texto().includes('VIS-0002'))).toBe(true);
  await act(async () => { await pausa(400); }); // nenhum recarregamento com pausa na montagem
  expect(pedidosLista).toEqual([{}]);
}

test('[RN-159.03, C386] o texto vai como busca 300 ms depois da ultima tecla, num pedido so (nunca codigo_visita), e a lista mostra o que o servidor devolveu', async () => {
  respostaDaLista = (p) => ({ data: p.busca === 'acme' ? [TODOS[0]] : TODOS });
  await montar();
  await digitar(busca(), 'ac');
  await digitar(busca(), 'acm');
  await digitar(busca(), 'acme ');
  await act(async () => { await pausa(150); });
  expect(pedidosLista.length).toBe(1); // ainda na pausa
  expect(await esperar(() => pedidosLista.length === 2)).toBe(true);
  expect(pedidosLista[1]).toEqual({ busca: 'acme' });
  await act(async () => { await pausa(400); });
  expect(pedidosLista.length).toBe(2);
  expect(pedidosLista.some((p) => 'codigo_visita' in p)).toBe(false);
  expect(await esperar(() => !texto().includes('VIS-0002'))).toBe(true);
  expect(texto()).toContain('VIS-0001');
});

test('[RN-159.03, Fase 2 I5a] escolher a sugestao manda cliente_id sem busca; voltar a digitar nao pede na hora, so depois da pausa, com busca', async () => {
  await montar();
  // a sugestao com espaco no fim (RN-159.02): "campinas " — sem aparar, "acme campinas".includes("campinas ") e falso (Fase 5 do controle C6:
  // "acme " casava pelo espaco do meio do nome e nao provava nada)
  await digitar(busca(), 'campinas ');
  expect(await esperar(() => !!container.querySelector('.sugestao-item-moderno:not(.sem-resultados)'))).toBe(true);
  await clicar(container.querySelector('.sugestao-item-moderno'));
  expect(await esperar(() => pedidosLista.some((p) => p.cliente_id === '5'))).toBe(true);
  await act(async () => { await pausa(400); });
  const comCliente = pedidosLista.filter((p) => p.cliente_id === '5');
  expect(comCliente).toEqual([{ cliente_id: '5' }]);
  const n = pedidosLista.length;
  await digitar(busca(), 'ACME CAMPINA');
  await act(async () => { await pausa(100); });
  expect(pedidosLista.length).toBe(n); // o cliente_id que se apagou nao disparou pedido na hora
  expect(await esperar(() => pedidosLista.length === n + 1)).toBe(true);
  expect(pedidosLista[n]).toEqual({ busca: 'ACME CAMPINA' });
});

test('[RN-159.03, Fase 2 I6] a distancia maxima recarrega e filtra; Limpar Filtros recarrega sem filtro', async () => {
  await montar();
  await clicar(botao('Mais Filtros'));
  const dist = [...container.querySelectorAll('.filtro-avancado-item')].find((g) => g.textContent.includes('Distância Máxima')).querySelector('input');
  await digitar(dist, '100');
  expect(await esperar(() => pedidosLista.length === 2)).toBe(true);
  expect(await esperar(() => !texto().includes('VIS-0002'))).toBe(true);
  expect(texto()).toContain('VIS-0001');
  await clicar(botao('Limpar Filtros'));
  expect(await esperar(() => pedidosLista.length === 3)).toBe(true);
  expect(pedidosLista[2]).toEqual({});
  expect(await esperar(() => texto().includes('VIS-0002'))).toBe(true);
});

test('[RN-159.03, Fase 2 I5b] a resposta lenta e a falha lenta do pedido anterior chegam depois e nao trocam a lista', async () => {
  await montar();
  respostaDaLista = (p) => (p.busca === 'vis-0001' ? { atraso: 900, data: [TODOS[0]] }
    : p.busca === 'vis-0002' ? { data: [TODOS[1]] } : { data: TODOS });
  await digitar(busca(), 'vis-0001');
  expect(await esperar(() => pedidosLista.some((p) => p.busca === 'vis-0001'))).toBe(true);
  await digitar(busca(), 'vis-0002');
  expect(await esperar(() => pedidosLista.some((p) => p.busca === 'vis-0002'))).toBe(true);
  expect(await esperar(() => !texto().includes('VIS-0001'))).toBe(true);
  await act(async () => { await pausa(1000); });
  expect(texto()).toContain('VIS-0002');
  expect(texto()).not.toContain('VIS-0001');
  // a falha lenta
  respostaDaLista = (p) => (p.busca === 'falha' ? { atraso: 900, falha: true } : p.busca === 'vis-0002' ? { data: [TODOS[1]] } : { data: TODOS });
  await digitar(busca(), 'falha');
  expect(await esperar(() => pedidosLista.some((p) => p.busca === 'falha'))).toBe(true);
  await digitar(busca(), 'vis-0002');
  const n = pedidosLista.length;
  expect(await esperar(() => pedidosLista.length > n)).toBe(true);
  await act(async () => { await pausa(1000); });
  expect(texto()).toContain('VIS-0002');
});
