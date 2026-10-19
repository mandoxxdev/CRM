/**
 * Etapa 157: a tela de Custos de viagem com a camada de comunicacao REAL (`services/api.js`, axios real, adaptador falso na fronteira HTTP).
 *
 *   RN-157.01 (C372)  abrir um custo para editar nao troca os valores gravados: a rota recalculada aparece como sugestao (com a frase), o
 *                     Atualizar sem mexer manda os gravados; mudar um campo que recalcula volta ao comportamento do cadastro; a resposta
 *                     velha nao toca em nada; o Novo depois de editar comeca com a data da volta vazia.
 *   RN-157.02 (C374)  a confirmacao da passagem aerea e o Aplicar Valores Sugeridos preenchem como o automatico (a taxa de embarque).
 *   RN-157.03 (C375)  (integracao T5) a coordenada do cliente sem endereco vem do servidor; a resposta de quem ja nao e o escolhido nao vale.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('axios', () => jest.requireActual('axios/dist/browser/axios.cjs'));
jest.mock('recharts', () => {
  const Nada = () => null;
  return { __esModule: true, BarChart: Nada, Bar: Nada, XAxis: Nada, YAxis: Nada, CartesianGrid: Nada, Tooltip: Nada, Legend: Nada,
    ResponsiveContainer: Nada, PieChart: Nada, Pie: Nada, Cell: Nada };
});
// a biblioteca do mapa, na fronteira: o marcador vira um elemento com a posicao (a PreviewRota e real)
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

const api = require('../services/api').default;
const CustosViagens = require('./CustosViagens').default;

const FRASE = 'Sugestão recalculada agora — os valores gravados foram mantidos. Clique em Aplicar Valores Sugeridos para usá-la.';
const CLIENTE = { id: 5, razao_social: 'Cliente Campinas', cidade: 'CAMPINAS', estado: 'SP', endereco: null, status: 'ativo' };
const CLIENTE_B = { id: 6, razao_social: 'Cliente Jundiai', cidade: 'JUNDIAI', estado: 'SP', endereco: null, status: 'ativo' };
const GRAVADO = {
  id: 1, codigo_visita: 'V-0001', cliente_id: 5, cliente_nome: 'Cliente Campinas', data_viagem: '2026-10-20', data_volta: null,
  tipo_viagem: null, numero_pessoas: null, origem_cidade: 'São Bernardo do Campo', origem_estado: 'SP', destino: 'CAMPINAS - SP',
  destino_cidade: 'CAMPINAS', destino_estado: 'SP', distancia_km: 20, tempo_estimado_horas: 0.5, custo_transporte: 50,
  custo_hospedagem: 0, custo_alimentacao: 30, custo_outros: 0, custo_sugerido: 80, total_custo: 80, status_aprovacao: 'pendente',
};

function terrestre(km, pessoas) {
  const d = { custo_combustivel: km * 0.5, custo_pedagio: 10, custo_alimentacao: 40 * pessoas, custo_hospedagem: 0,
    custo_estacionamento: km > 250 ? 20 : 0, numero_pessoas: pessoas, tipo_transporte: 'carro' };
  return { distancia_km: km, tempo_estimado_horas: km / 75, requer_passagem_aerea: false, detalhes: d,
    custo_sugerido: d.custo_combustivel + d.custo_pedagio + d.custo_alimentacao + d.custo_estacionamento };
}
function aereo(km, pessoas) {
  const d = { custo_passagem_aerea: 800 * pessoas, custo_taxa_embarque: 75 * pessoas, custo_pedagio: 0, custo_alimentacao: 60 * pessoas,
    custo_hospedagem: 150 * pessoas, numero_pessoas: pessoas, tipo_transporte: 'aereo' };
  return { distancia_km: km, tempo_estimado_horas: km / 800, requer_passagem_aerea: true, detalhes: d,
    custo_sugerido: d.custo_passagem_aerea + d.custo_taxa_embarque + d.custo_alimentacao + d.custo_hospedagem };
}

let proximosPara; let custos; let rotaPara; let atrasoDaRota; let coordPara; let atrasoDaCoord; let pedidos; let corpos;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
function resposta(config, status, data) {
  if (status >= 400) {
    const axios = require('axios');
    throw new axios.AxiosError(`status ${status}`, 'ERR_BAD_RESPONSE', config, null, { status, statusText: '', data, headers: {}, config });
  }
  return { status, statusText: 'OK', data, headers: {}, config };
}

let container; let root;
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  custos = [GRAVADO];
  rotaPara = (q) => terrestre(104, Number(q.get('numero_pessoas')) || 1);
  atrasoDaRota = () => 0;
  coordPara = (id) => ({ 5: [-22.9056, -47.0608], 6: [-23.1857, -46.8978] }[id]);
  atrasoDaCoord = () => 0;
  pedidos = [];
  corpos = [];
  proximosPara = () => [];
  api.defaults.adapter = async (config) => {
    const [caminho, consulta] = config.url.split('?');
    const q = new URLSearchParams(consulta || '');
    pedidos.push(`${config.method.toUpperCase()} ${config.url}`);
    if (config.method !== 'get') corpos.push({ metodo: config.method.toUpperCase(), url: caminho, corpo: JSON.parse(config.data || '{}') });
    if (caminho === '/custos-viagens' && config.method === 'get') return resposta(config, 200, custos);
    if (caminho === '/custos-viagens/resumo') return resposta(config, 200, {});
    if (caminho === '/clientes') return resposta(config, 200, [CLIENTE, CLIENTE_B]);
    if (caminho === '/custos-viagens/calcular-rota') {
      const atraso = atrasoDaRota(q);
      const r = rotaPara(q);
      if (atraso) await pausa(atraso);
      return resposta(config, 200, r);
    }
    let m = caminho.match(/^\/custos-viagens\/coordenadas-cliente\/(\d+)$/);
    if (m) {
      const atraso = atrasoDaCoord(m[1]);
      if (atraso) await pausa(atraso);
      const c = coordPara(m[1]);
      if (!c) return resposta(config, 403, { error: 'Acesso negado ao módulo' });
      return resposta(config, 200, { coordenadas: c, lat: c[0], lon: c[1] });
    }
    m = caminho.match(/^\/custos-viagens\/verificar-elegibilidade\/(\d+)$/);
    if (m) return resposta(config, 200, { todas_obrigatorias_atendidas: true, regras: {}, cliente_id: Number(m[1]) });
    if (/^\/custos-viagens\/clientes-proximos\//.test(caminho)) return resposta(config, 200, proximosPara(caminho.split('/').pop()));
    if (config.method === 'put' || config.method === 'post') return resposta(config, 200, { message: 'ok', id: 99 });
    if (caminho === '/custos-viagens/analise/cliente') return resposta(config, 200, []);
    return resposta(config, 200, []);
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
  while (Date.now() < fim) {
    if (cond()) return true;
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await pausa(20); });
  }
  return cond();
}
const texto = () => container.textContent;
const clicar = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
function campo(rotulo) {
  const g = [...container.querySelectorAll('.custo-form .form-group')].find((x) => x.querySelector('label')?.textContent.trim() === rotulo);
  if (!g) throw new Error(`campo nao achado: ${rotulo}`);
  return g.querySelector('input, select');
}
async function digitar(el, valor) {
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  await act(async () => {
    setValue.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
const pedidosDaRota = () => pedidos.filter((p) => p.includes('/custos-viagens/calcular-rota'));
const botao = (rotulo) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().includes(rotulo));
async function montar() {
  await act(async () => { root.render(<CustosViagens />); });
  expect(await esperar(() => !!container.querySelector('button[title="Editar"]'))).toBe(true);
}
async function abrirEdicao() {
  await clicar(container.querySelector('button[title="Editar"]'));
  expect(texto()).toContain('Editar Custo de Viagem');
}
async function atualizar() {
  const form = container.querySelector('form.custo-form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(await esperar(() => corpos.some((c) => c.metodo === 'PUT'))).toBe(true);
  return corpos.find((c) => c.metodo === 'PUT').corpo;
}
const n = (x) => parseFloat(x) || 0;
const custosDoCorpo = (c) => [n(c.custo_transporte), n(c.custo_hospedagem), n(c.custo_alimentacao), n(c.custo_outros)];
const custosDoForm = () => ['Custo Transporte (R$)', 'Custo Hospedagem (R$)', 'Custo Alimentação (R$)', 'Custo Outros (R$)'].map((r) => campo(r).value);

test('[RN-157.01, C372] (a) abrir um custo gravado (20 km, com nulos) mostra a sugestao recalculada; Atualizar sem mexer manda os gravados', async () => {
  await montar();
  await abrirEdicao();
  expect(await esperar(() => texto().includes('104 km') && texto().includes(FRASE))).toBe(true);
  expect(pedidosDaRota().length).toBe(1);
  expect(container.querySelector('[role="status"]').textContent).toContain(FRASE);
  expect(custosDoForm()).toEqual(['50', '', '30', '']);
  const corpo = await atualizar();
  expect([corpo.distancia_km, corpo.tempo_estimado_horas, corpo.custo_sugerido]).toEqual([20, 0.5, 80]);
  expect(custosDoCorpo(corpo)).toEqual([50, 0, 30, 0]);
});

test('[RN-157.01/02] (b) abrir e Aplicar Valores Sugeridos: o PUT leva os valores da rota (distancia, tempo, sugerido) e a frase some', async () => {
  await montar();
  await abrirEdicao();
  expect(await esperar(() => texto().includes(FRASE))).toBe(true);
  await clicar(botao('Aplicar Valores Sugeridos'));
  expect(texto()).not.toContain(FRASE);
  expect(texto()).toContain('104 km'); // a metade positiva: o quadro continua
  const r = terrestre(104, 1);
  const corpo = await atualizar();
  expect([corpo.distancia_km, corpo.tempo_estimado_horas, corpo.custo_sugerido]).toEqual([104, r.tempo_estimado_horas, r.custo_sugerido]);
  expect(custosDoCorpo(corpo)).toEqual([62, 0, 40, 0]);
});

test('[RN-157.01] (c) abrir e mudar o numero de pessoas: o formulario recalcula (como o cadastro) e a frase some', async () => {
  await montar();
  await abrirEdicao();
  expect(await esperar(() => texto().includes(FRASE))).toBe(true);
  await digitar(campo('Número de Pessoas'), '2');
  expect(await esperar(() => campo('Custo Alimentação (R$)').value === '80.00')).toBe(true);
  expect(custosDoForm()).toEqual(['62.00', '0.00', '80.00', '0.00']);
  expect(texto()).not.toContain(FRASE);
  expect(texto()).toContain('Detalhes (2 pessoas)');
  // voltar o campo ao valor gravado nao traz de volta o modo sugestao (RN-157.01)
  await digitar(campo('Número de Pessoas'), '1');
  expect(await esperar(() => campo('Custo Alimentação (R$)').value === '40.00')).toBe(true);
  expect(texto()).not.toContain(FRASE);
});

test('[RN-157.01] (d) abrir um custo terrestre de 500 km cuja rota agora da 700 km aerea: nenhum modal, o aviso de passagem no quadro, o PUT com os gravados', async () => {
  custos = [{ ...GRAVADO, distancia_km: 500, tempo_estimado_horas: 6.7, custo_transporte: 300, custo_sugerido: 330 }];
  rotaPara = (q) => aereo(700, Number(q.get('numero_pessoas')) || 1);
  await montar();
  await abrirEdicao();
  expect(await esperar(() => texto().includes('700 km') && texto().includes(FRASE))).toBe(true);
  expect(texto()).toContain('Esta viagem requer passagem aérea');
  expect(botao('Aceitar e Continuar com Passagem Aérea')).toBeUndefined();
  const corpo = await atualizar();
  expect([corpo.distancia_km, corpo.custo_sugerido]).toEqual([500, 330]);
  expect(custosDoCorpo(corpo)).toEqual([300, 0, 30, 0]);
});

test('[RN-157.01] (e1) duas mudancas seguidas (a primeira lenta): os campos e o quadro sao os da ultima', async () => {
  await montar();
  await abrirEdicao();
  expect(await esperar(() => texto().includes(FRASE))).toBe(true);
  atrasoDaRota = (q) => (q.get('numero_pessoas') === '2' ? 300 : 0);
  await digitar(campo('Número de Pessoas'), '2');
  await digitar(campo('Número de Pessoas'), '3');
  await act(async () => { await pausa(450); });
  expect(pedidosDaRota().some((p) => p.includes('numero_pessoas=2'))).toBe(true); // o lento foi pedido (e respondeu depois)
  expect(campo('Custo Alimentação (R$)').value).toBe('120.00');
  expect(texto()).toContain('Detalhes (3 pessoas)');
});

test('[RN-157.01] (e2) a resposta lenta da abertura chega depois da mudanca: o quadro e o da mudanca e a frase nao volta', async () => {
  atrasoDaRota = (q) => (q.get('numero_pessoas') === '1' ? 300 : 0);
  await montar();
  await abrirEdicao();
  await digitar(campo('Número de Pessoas'), '2');
  await act(async () => { await pausa(450); });
  expect(pedidosDaRota().some((p) => p.includes('numero_pessoas=1'))).toBe(true);
  expect(texto()).toContain('Detalhes (2 pessoas)');
  expect(texto()).not.toContain(FRASE);
  expect(campo('Custo Alimentação (R$)').value).toBe('80.00');
});

test('[RN-157.01] (e3) mudar (calculo lento), fechar e abrir o Novo: a resposta velha nao preenche o Novo', async () => {
  await montar();
  await abrirEdicao();
  expect(await esperar(() => texto().includes(FRASE))).toBe(true);
  atrasoDaRota = () => 300;
  await digitar(campo('Número de Pessoas'), '2');
  await clicar(container.querySelector('.custo-form .form-actions .btn-secondary'));
  await clicar(container.querySelector('.btn-premium'));
  expect(texto()).toContain('Novo Custo de Viagem');
  await act(async () => { await pausa(450); });
  expect(pedidosDaRota().some((p) => p.includes('numero_pessoas=2'))).toBe(true);
  expect(custosDoForm()).toEqual(['', '', '', '']);
  expect(texto()).not.toContain('Detalhes (');
});

test('[RN-157.02, C374] (f) no Novo, uma rota terrestre e depois uma aerea: Aceitar a passagem poe passagem + taxa e outros 0 (a soma = o sugerido)', async () => {
  rotaPara = (q) => (q.get('destino_cidade') === 'RECIFE' ? aereo(2600, 1) : terrestre(300, 1));
  await montar();
  await clicar(container.querySelector('.btn-premium'));
  await digitar(campo('Cliente *'), '5');
  expect(await esperar(() => campo('Custo Outros (R$)').value === '20.00')).toBe(true); // o estacionamento da terrestre
  await digitar(campo('Destino - Cidade *'), 'RECIFE');
  expect(await esperar(() => !!botao('Aceitar e Continuar com Passagem Aérea'))).toBe(true);
  expect(texto()).toContain('Taxa de Embarque: R$');
  await clicar(botao('Aceitar e Continuar com Passagem Aérea'));
  const a = aereo(2600, 1);
  expect(custosDoForm()).toEqual(['875.00', '150.00', '60.00', '0.00']);
  expect(custosDoForm().reduce((s, x) => s + n(x), 0)).toBeCloseTo(a.custo_sugerido, 2);
});

test('[RN-157.01/02, B1004] (g) na edicao, Aplicar uma sugestao aerea: passagem + taxa; mudar a data da volta (mesma distancia) nao abre o modal', async () => {
  rotaPara = (q) => aereo(700, Number(q.get('numero_pessoas')) || 1);
  await montar();
  await abrirEdicao();
  expect(await esperar(() => texto().includes(FRASE))).toBe(true);
  await clicar(botao('Aplicar Valores Sugeridos'));
  expect(custosDoForm()).toEqual(['875.00', '150.00', '60.00', '0.00']);
  const antes = pedidosDaRota().length;
  await digitar(campo('Data da Volta *'), '2026-10-22');
  expect(await esperar(() => pedidosDaRota().length === antes + 1)).toBe(true);
  await act(async () => { await pausa(60); });
  expect(botao('Aceitar e Continuar com Passagem Aérea')).toBeUndefined();
  expect(texto()).toContain('700 km');
  const corpo = await atualizar();
  expect(n(corpo.custo_transporte)).toBe(875);
  expect([corpo.distancia_km, corpo.custo_sugerido]).toEqual([700, aereo(700, 1).custo_sugerido]);
});

// ── T5 (integracao — cruza a T2 e a T3) ─────────────────────────────────────────────────────────────────────────────────────────
async function salvarNovo() {
  const form = container.querySelector('form.custo-form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(await esperar(() => corpos.some((c) => c.metodo === 'POST' && c.url === '/custos-viagens'))).toBe(true);
  return corpos.find((c) => c.metodo === 'POST' && c.url === '/custos-viagens').corpo;
}

test('[RN-157.03, C375, Fase 2 K1] no Novo: o cliente sem endereco pergunta a coordenada ao servidor; escolher A (lento) e logo B: vale B', async () => {
  atrasoDaCoord = (id) => (id === '5' ? 300 : 0);
  await montar();
  await clicar(container.querySelector('.btn-premium'));
  await digitar(campo('Cliente *'), '5');
  await digitar(campo('Cliente *'), '6');
  await act(async () => { await pausa(450); });
  expect(pedidos).toContain('GET /custos-viagens/coordenadas-cliente/5'); // antes: sem endereco, nenhum pedido (a lista do client)
  expect(pedidos).toContain('GET /custos-viagens/coordenadas-cliente/6');
  expect(pedidos).toContain('GET /custos-viagens/verificar-elegibilidade/6');
  expect(pedidos).not.toContain('GET /custos-viagens/verificar-elegibilidade/5'); // a resposta de A chegou depois e nao disparou nada
  expect(pedidos.filter((p) => p.startsWith('GET /custos-viagens/clientes-proximos/5'))).toEqual([]);
  const corpo = await salvarNovo();
  expect(String(corpo.cliente_id)).toBe('6');
  expect(corpo.clientes_viagem).toEqual([{ id: 6, ordem: 1, distancia_km: null }]);
});

test('[RN-157.03, integracao T2+T3] escolher um cliente sem endereco, adicionar um proximo e Salvar: a Preview com os dois nas coordenadas do servidor', async () => {
  const PROXIMO = { id: 8, razao_social: 'Vizinho Valinhos', cidade: 'VALINHOS', estado: 'SP', endereco: null, distancia_km: 12,
    coordenadas: [-22.9706, -46.9958], lat: -22.9706, lon: -46.9958 };
  proximosPara = (id) => (id === '5' ? [PROXIMO] : []);
  await montar();
  await clicar(container.querySelector('.btn-premium'));
  await digitar(campo('Cliente *'), '5');
  expect(await esperar(() => !!botao('Adicionar'))).toBe(true);
  await clicar(botao('Adicionar'));
  expect(await esperar(() => texto().includes('Continuar com 2 cliente(s)'))).toBe(true);
  await clicar(botao('Continuar com 2 cliente(s)'));
  const corpo = await salvarNovo();
  expect(corpo.clientes_viagem.map((c) => c.id)).toEqual([5, 8]);
  expect(await esperar(() => container.querySelectorAll('[data-marcador]').length === 3)).toBe(true);
  const pos = [...container.querySelectorAll('[data-marcador]')].map((m) => JSON.parse(m.getAttribute('data-marcador')));
  expect(pos).toEqual([[-23.715, -46.555], [-22.9056, -47.0608], PROXIMO.coordenadas]);
  expect(texto()).toContain('Total: 3 ponto(s) na rota');
  expect(texto()).not.toContain('(sem localização no mapa)');
});
