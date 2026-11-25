/**
 * Cotação da moeda da proposta (services/cambio.js) — o Banco Central trocado por um fetch falso.
 * Executar: node tests/cambio.test.js   (CAMBIO_REAL=1 também consulta a PTAX de verdade)
 */
const assert = require('assert');
const cambio = require('../services/cambio');

let falhas = 0;
const testes = [];
const test = (n, fn) => testes.push([n, fn]);
const resposta = (value, ok = true) => async () => ({ ok, json: async () => ({ value }) });

test('a PTAX de VENDA do boletim de FECHAMENTO mais recente', async () => {
  cambio._cache.clear();
  const c = await cambio.cotacaoDoDia('usd', { fetchImpl: resposta([
    { cotacaoVenda: 5.8776, dataHoraCotacao: '2026-11-24 13:07:40.46', tipoBoletim: 'Intermediário' },
    { cotacaoVenda: 5.8573, dataHoraCotacao: '2026-11-24 13:07:40.48', tipoBoletim: 'Fechamento' }]) });
  assert.deepStrictEqual(c, { valor: 5.8573, data: '2026-11-24' });
});

test('guarda por 1 hora (não consulta de novo)', async () => {
  let chamadas = 0;
  const f = async () => { chamadas++; return { ok: true, json: async () => ({ value: [{ cotacaoVenda: 9, dataHoraCotacao: '2026-11-24', tipoBoletim: 'Fechamento' }] }) }; };
  const c = await cambio.cotacaoDoDia('USD', { fetchImpl: f });
  assert.strictEqual(c.valor, 5.8573, 'veio do guardado');
  assert.strictEqual(chamadas, 0);
});

test('real, moeda inválida, Banco Central fora do ar ou lista vazia = null', async () => {
  cambio._cache.clear();
  assert.strictEqual(await cambio.cotacaoDoDia('BRL'), null);
  assert.strictEqual(await cambio.cotacaoDoDia('GBP'), null);
  assert.strictEqual(await cambio.cotacaoDoDia('EUR', { fetchImpl: resposta([], false) }), null);
  assert.strictEqual(await cambio.cotacaoDoDia('EUR', { fetchImpl: resposta([]) }), null);
  assert.strictEqual(await cambio.cotacaoDoDia('EUR', { fetchImpl: async () => { throw new Error('rede'); } }), null);
});

test('cotação digitada: vírgula ou ponto; fora do plausível = null', () => {
  assert.strictEqual(cambio.taxaValida('5,8573'), 5.8573);
  assert.strictEqual(cambio.taxaValida('5.8573'), 5.8573);
  assert.strictEqual(cambio.taxaValida(6.426), 6.426);
  for (const v of ['', null, undefined, '0', '-1', 'abc', '5000']) assert.strictEqual(cambio.taxaValida(v), null, String(v));
});

// 25/11/2026 ("coloquei 128 mil reais e na proposta aparece US$ 128.990,00"): o valor gravado e em REAIS em qualquer moeda. A regra
// da manha (gravado x cotacao) tomava o gravado como dolar. Roda o SQL de verdade num banco em memoria.
test('o SQL: em reais e o gravado; na moeda do documento e o gravado / cotacao (real ou sem cotacao: o gravado)', async () => {
  const sqlite3 = require('sqlite3');
  const db = new sqlite3.Database(':memory:');
  const all = (sql, p = []) => new Promise((ok, ko) => db.all(sql, p, (e, r) => (e ? ko(e) : ok(r))));
  await all('CREATE TABLE propostas (id INTEGER, valor_total REAL, moeda TEXT, taxa_cambio REAL)');
  await all("INSERT INTO propostas VALUES (1, 128990, 'USD', 5.8573), (2, 5000, 'USD', NULL), (3, 7000, 'BRL', NULL), (4, 100, NULL, 9)");
  const r = await all(`SELECT id, ${cambio.valorEmReaisSql('p')} AS reais, ROUND(${cambio.valorNaMoedaSql('p')}, 2) AS moeda FROM propostas p ORDER BY id`);
  db.close();
  assert.deepStrictEqual(r.map((x) => [x.id, x.reais, x.moeda]), [[1, 128990, 22022.09], [2, 5000, 5000], [3, 7000, 7000], [4, 100, 100]]);
});

test('moedaDoDocumento: dolar/euro so com cotacao valida; sem ela, o documento sai em reais', () => {
  assert.deepStrictEqual(cambio.moedaDoDocumento({ moeda: 'usd', taxa_cambio: '5,8573' }), { moeda: 'USD', taxa_cambio: 5.8573 });
  assert.deepStrictEqual(cambio.moedaDoDocumento({ moeda: 'USD', taxa_cambio: null }), { moeda: 'BRL', taxa_cambio: null });
  assert.deepStrictEqual(cambio.moedaDoDocumento({ moeda: 'BRL', taxa_cambio: 5 }), { moeda: 'BRL', taxa_cambio: null });
  assert.strictEqual(cambio.ehMoedaEstrangeira(' eur '), true);
  assert.strictEqual(cambio.ehMoedaEstrangeira('BRL'), false);
});

if (process.env.CAMBIO_REAL === '1') {
  test('[rede] a PTAX de verdade responde dólar e euro', async () => {
    cambio._cache.clear();
    for (const m of ['USD', 'EUR']) {
      // eslint-disable-next-line no-await-in-loop
      const c = await cambio.cotacaoDoDia(m);
      assert.ok(c && c.valor > 1 && c.valor < 20, `${m}: ${JSON.stringify(c)}`);
      console.log(`    ${m}: ${c.valor} (${c.data})`);
    }
  });
}

(async () => {
  for (const [n, fn] of testes) {
    try { await fn(); console.log('  ✓ ' + n); } catch (e) { falhas++; console.log('  ✗ ' + n + '\n    ' + e.message); }
  }
  console.log(`\n${falhas} failed`);
  process.exit(falhas ? 1 : 0);
})();
