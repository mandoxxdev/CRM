/**
 * Etapa 156 (RN-156.01, C369) — com o banco ocupado (503), a camada de comunicacao reconhece o MESMO pedido de leitura pelo metodo, pelo
 * endereco, pelos filtros (`params`, sem depender da ordem; `undefined`/`null` nao contam) e pelo `responseType`. Antes a chave era
 * `metodo-url`: o segundo pedido ao mesmo endereco com OUTROS filtros, feito enquanto o primeiro esperava, era recusado na hora.
 *
 * O axios e o REAL (o build CommonJS — o jest 27 do CRA nao le o `exports` do axios 1.x) e a fronteira HTTP e um adaptador falso: o
 * interceptor, a montagem do config e a repeticao sao os de producao.
 */
jest.mock('axios', () => jest.requireActual('axios/dist/browser/axios.cjs'));
const axios = require('axios');

let api;
let chamadas;
let roteiro;
const RAPIDO = { retryAfter: 0.01 };

function ocupado(config) {
  return new axios.AxiosError('ocupado', 'ERR_BAD_RESPONSE', config, null,
    { status: 503, statusText: 'Service Unavailable', data: { error: 'Banco em inicialização.', ...RAPIDO }, headers: {}, config });
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  api = require('./api').default;
  api.defaults.adapter = async (config) => {
    chamadas.push({ metodo: config.method, url: config.url, params: config.params, data: config.data });
    return roteiro(config, chamadas.length);
  };
});

beforeEach(() => { chamadas = []; });

const comPrazo = (p, ms = 3000) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`a repeticao nao terminou em ${ms} ms (travou?)`)), ms)),
]);

test('[RN-156.01 a] dois GET ao mesmo endereco com filtros diferentes: os dois esperam e repetem, cada um com o seu filtro', async () => {
  const vistos = {};
  roteiro = (config) => {
    const q = config.params.q;
    vistos[q] = (vistos[q] || 0) + 1;
    if (vistos[q] === 1) throw ocupado(config);
    return { status: 200, data: { termo: q }, headers: {}, config };
  };
  const [a, b] = await comPrazo(Promise.allSettled([
    api.get('/busca-global', { params: { q: 'ab' } }),
    api.get('/busca-global', { params: { q: 'abc' } }),
  ]));
  expect(b.status).toBe('fulfilled'); // antes: rejected na hora, com o 503 do irmao
  expect(a.status).toBe('fulfilled');
  expect(a.value.data).toEqual({ termo: 'ab' });
  expect(b.value.data).toEqual({ termo: 'abc' });
  expect(chamadas).toHaveLength(4);
});

test('[RN-156.01 b] o mesmo GET duas vezes: o segundo espera a mesma repeticao (3 pedidos ao servidor) e recebe a sua copia dos dados', async () => {
  let n = 0;
  roteiro = (config) => {
    n += 1;
    if (n <= 2) throw ocupado(config);
    return { status: 200, data: { lista: [{ id: 1 }] }, headers: {}, config };
  };
  const [a, b] = await comPrazo(Promise.allSettled([
    api.get('/almoxarifado/estoque', { params: { ativo: 1 } }),
    api.get('/almoxarifado/estoque', { params: { ativo: 1 } }),
  ]));
  expect(a.status).toBe('fulfilled');
  expect(b.status).toBe('fulfilled'); // antes: rejected na hora
  expect(a.value.data).toEqual({ lista: [{ id: 1 }] });
  expect(b.value.data).toEqual({ lista: [{ id: 1 }] });
  expect(b.value.data).not.toBe(a.value.data); // quem espera nao mexe no objeto da dona
  expect(chamadas).toHaveLength(3);
});

test('[RN-156.01 c] a ordem das chaves de params nao muda o pedido; undefined e null nao contam', async () => {
  let n = 0;
  roteiro = (config) => {
    n += 1;
    if (n <= 2) throw ocupado(config);
    return { status: 200, data: { ok: true }, headers: {}, config };
  };
  const [a, b] = await comPrazo(Promise.allSettled([
    api.get('/almoxarifado/reservas', { params: { status: 'ATIVA', projeto_id: 7 } }),
    api.get('/almoxarifado/reservas', { params: { projeto_id: 7, material_id: undefined, status: 'ATIVA', x: null } }),
  ]));
  expect([a.status, b.status]).toEqual(['fulfilled', 'fulfilled']);
  expect(chamadas).toHaveLength(3); // um pedido so repetido
});

test('[RN-156.01 d] o mesmo GET com o banco sempre ocupado: os dois rejeitam com a frase de sempre, 5 pedidos (A, B e 3 repeticoes)', async () => {
  roteiro = (config) => { throw ocupado(config); };
  const [a, b] = await comPrazo(Promise.allSettled([
    api.get('/projetos'),
    api.get('/projetos'),
  ]));
  expect(a.status).toBe('rejected');
  expect(b.status).toBe('rejected');
  expect(a.reason.message).toBe('Banco de dados não está disponível. Tente recarregar a página.');
  expect(b.reason.message).toBe('Banco de dados não está disponível. Tente recarregar a página.');
  expect(chamadas).toHaveLength(5);
});

test('[RN-156.01 e] as gravacoes ficam como estavam: o segundo POST ao mesmo endereco e recusado na hora com o 503 dele; o primeiro repete', async () => {
  let n = 0;
  roteiro = (config) => {
    n += 1;
    if (n <= 2) throw ocupado(config);
    return { status: 200, data: { gravado: JSON.parse(config.data) }, headers: {}, config };
  };
  const [a, b] = await comPrazo(Promise.allSettled([
    api.post('/almoxarifado/movimentacoes', { quantidade: 1 }),
    api.post('/almoxarifado/movimentacoes', { quantidade: 2 }),
  ]));
  expect(a.status).toBe('fulfilled');
  expect(a.value.data).toEqual({ gravado: { quantidade: 1 } });
  expect(b.status).toBe('rejected');
  expect(b.reason.response.status).toBe(503);
  expect(chamadas).toHaveLength(3);
});

test('[RN-156.01 f] a metade positiva: sem 503, os pedidos vao direto (um pedido cada)', async () => {
  roteiro = (config) => ({ status: 200, data: { q: config.params.q }, headers: {}, config });
  const [a, b] = await Promise.all([api.get('/busca-global', { params: { q: 'x' } }), api.get('/busca-global', { params: { q: 'x' } })]);
  expect([a.data, b.data]).toEqual([{ q: 'x' }, { q: 'x' }]);
  expect(chamadas).toHaveLength(2);
});

describe('[RN-156.01] chaveDoPedido', () => {
  const { chaveDoPedido } = require('../utils/chaveDoPedido');
  test('leitura: metodo, endereco, filtros ordenados e responseType', () => {
    expect(chaveDoPedido({ method: 'get', url: '/a', params: { b: 2, a: 1 } }))
      .toBe(chaveDoPedido({ method: 'GET', url: '/a', params: { a: 1, b: 2 } }));
    expect(chaveDoPedido({ method: 'get', url: '/a', params: { q: 'a', x: undefined, y: null } }))
      .toBe(chaveDoPedido({ method: 'get', url: '/a', params: { q: 'a' } }));
    expect(chaveDoPedido({ method: 'get', url: '/a', params: { q: '' } }))
      .not.toBe(chaveDoPedido({ method: 'get', url: '/a' }));
    expect(chaveDoPedido({ method: 'get', url: '/a', params: { q: 'ab' } }))
      .not.toBe(chaveDoPedido({ method: 'get', url: '/a', params: { q: 'abc' } }));
    expect(chaveDoPedido({ method: 'get', url: '/a', params: { ids: [1, 2] } }))
      .not.toBe(chaveDoPedido({ method: 'get', url: '/a', params: { ids: [2, 1] } }));
    expect(chaveDoPedido({ method: 'get', url: '/a', responseType: 'blob' }))
      .not.toBe(chaveDoPedido({ method: 'get', url: '/a' }));
    expect(chaveDoPedido({ url: '/a' })).toBe(chaveDoPedido({ method: 'get', url: '/a' }));
    expect(chaveDoPedido({ method: 'get', url: '/a', params: new URLSearchParams('b=2&a=1') }))
      .toBe(chaveDoPedido({ method: 'get', url: '/a', params: { a: '1', b: '2' } }));
  });
  test('gravacao: a chave de antes (metodo-url), sem filtros nem corpo', () => {
    expect(chaveDoPedido({ method: 'post', url: '/a', data: '{"x":1}' })).toBe('post-/a');
    expect(chaveDoPedido({ method: 'put', url: '/a', params: { z: 1 } })).toBe('put-/a');
    expect(chaveDoPedido({ method: 'delete', url: '/a/1' })).toBe('delete-/a/1');
  });
});
