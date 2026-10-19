/**
 * Etapa 157 (RN-157.03, C375): a coordenada do cliente vem do servidor (a camada de comunicacao real, adaptador falso na fronteira HTTP).
 */
jest.mock('axios', () => jest.requireActual('axios/dist/browser/axios.cjs'));

const axios = require('axios');
const api = require('../services/api').default;
const { coordenadaValida, obterCoordenadasDoCliente } = require('./coordenadasDoCliente');

let pedidos; let responder;
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
beforeEach(() => {
  pedidos = [];
  api.defaults.adapter = async (config) => {
    pedidos.push(config.url);
    const [status, data] = responder(config);
    if (status === 'rede') throw new axios.AxiosError('Network Error', 'ERR_NETWORK', config, {}, undefined);
    if (status >= 400) throw new axios.AxiosError(`status ${status}`, 'ERR_BAD_RESPONSE', config, null, { status, statusText: '', data, headers: {}, config });
    return { status, statusText: 'OK', data, headers: {}, config };
  };
});

test('[RN-157.03, C375] o cliente SEM endereco: pergunta ao servidor (antes: a lista do client, que mandava CAMPINAS para Sao Bernardo)', async () => {
  responder = () => [200, { coordenadas: [-22.9056, -47.0608], lat: -22.9056, lon: -47.0608 }];
  const c = await obterCoordenadasDoCliente({ id: 5, cidade: 'CAMPINAS', estado: 'SP', endereco: null });
  expect(c).toEqual([-22.9056, -47.0608]);
  expect(pedidos).toEqual(['/custos-viagens/coordenadas-cliente/5']);
});

test('[RN-157.03] recusa (403) e erro do banco (500): sem localizacao (null), nunca um ponto inventado', async () => {
  responder = () => [403, { error: 'Acesso negado ao módulo' }];
  expect(await obterCoordenadasDoCliente({ id: 5, cidade: 'CAMPINAS', estado: 'SP' })).toBeNull();
  responder = () => [500, { error: 'SQLITE_BUSY' }];
  expect(await obterCoordenadasDoCliente({ id: 5, cidade: 'CAMPINAS', estado: 'SP' })).toBeNull();
  expect(pedidos.length).toBe(2);
});

test('[RN-157.03] a rede caida (a camada repete uma vez): null', async () => {
  responder = () => ['rede'];
  expect(await obterCoordenadasDoCliente({ id: 7, cidade: 'JUNDIAI', estado: 'SP' })).toBeNull();
  expect(pedidos.length).toBeGreaterThanOrEqual(1);
}, 10000);

test('[RN-157.03] a coordenada que ja veio nao e pedida de novo; a invalida do servidor vira null; sem id, null sem pedido', async () => {
  responder = () => [200, { coordenadas: ['x', null] }];
  expect(await obterCoordenadasDoCliente({ id: 5, coordenadas: [-23.18, -46.89] })).toEqual([-23.18, -46.89]);
  expect(pedidos).toEqual([]);
  expect(await obterCoordenadasDoCliente({ id: 5, coordenadas: [undefined, undefined] })).toBeNull(); // pediu e a do servidor e invalida
  expect(pedidos).toEqual(['/custos-viagens/coordenadas-cliente/5']);
  expect(await obterCoordenadasDoCliente({ cidade: 'CAMPINAS' })).toBeNull();
  expect(await obterCoordenadasDoCliente(null)).toBeNull();
  expect(pedidos.length).toBe(1);
  expect([coordenadaValida([1, 2]), coordenadaValida([1, NaN]), coordenadaValida(['1', 2]), coordenadaValida([1]), coordenadaValida(null)])
    .toEqual([true, false, false, false, false]);
});


// Fase 5 r3 U03
test('[RN-157.03, Fase 5 r3 U03] id vazio (o select sem cliente): null, sem pedido', async () => {
  responder = () => [404, { error: 'nao achou' }];
  expect(await obterCoordenadasDoCliente({ id: '', cidade: 'CAMPINAS', estado: 'SP' })).toBeNull();
  expect(pedidos).toEqual([]);
});
