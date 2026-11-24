/**
 * Tradutor da proposta bilíngue no SERVIDOR (services/tradutorWeb.js) — pedido de 24/11/2026: "deve funcionar em qualquer navegador".
 * O serviço da internet é trocado por um `fetch` falso; um teste opcional (TRADUTOR_WEB_REAL=1) bate no de verdade.
 *
 * Executar: node tests/tradutorWeb.test.js
 */
const assert = require('assert');
const { traduzirLote, agruparEmPedidos, manterInicialMaiuscula, ErroTradutorWeb, MAX_TEXTOS_POR_PEDIDO } = require('../services/tradutorWeb');

let passed = 0; let failed = 0;
const testes = [];
const test = (n, fn) => testes.push([n, fn]);

// fetch falso: devolve "EN:" + texto, como o serviço (array de strings, na ordem dos q).
function fetchFalso({ status = 200, corpo } = {}) {
  const chamadas = [];
  const fn = async (url, opcoes) => {
    const q = new URLSearchParams(opcoes.body.toString()).getAll('q');
    chamadas.push({ url, q });
    return { ok: status === 200, status, json: async () => (corpo !== undefined ? corpo : q.map((t) => `EN:${t}`)) };
  };
  fn.chamadas = chamadas;
  return fn;
}

test('traduz em lote, na mesma ordem, com sl=pt e o idioma pedido', async () => {
  const f = fetchFalso();
  const r = await traduzirLote(['Garantia', 'Prazo ⟦0⟧'], 'es', { fetchImpl: f, url: 'http://x/t' });
  assert.deepStrictEqual(r, ['EN:Garantia', 'EN:Prazo ⟦0⟧']);
  assert.strictEqual(f.chamadas.length, 1);
  assert.match(f.chamadas[0].url, /^http:\/\/x\/t\?client=gtx&sl=pt&tl=es&format=text$/);
});

test('muitos textos: divide em pedidos de no máximo 40 e de ~4.500 caracteres, sem perder a ordem', async () => {
  const textos = Array.from({ length: 95 }, (_, i) => `t${i}`);
  const f = fetchFalso();
  const r = await traduzirLote(textos, 'en', { fetchImpl: f, url: 'http://x/t' });
  assert.deepStrictEqual(f.chamadas.map((c) => c.q.length), [40, 40, 15]);
  assert.deepStrictEqual(r, textos.map((t) => `EN:${t}`));
  // 3000 + 3000 passa de 4.500: cada um vai num pedido; o de 4.900 vai sozinho; o pequeno não cabe junto dele.
  assert.deepStrictEqual(agruparEmPedidos(['a'.repeat(3000), 'b'.repeat(3000), 'c'.repeat(4900), 'd']), [[0], [1], [2], [3]]);
  assert.deepStrictEqual(agruparEmPedidos(['a'.repeat(2000), 'b'.repeat(2000), 'c']), [[0, 1, 2]]);
  assert.strictEqual(MAX_TEXTOS_POR_PEDIDO, 40);
});

test('resposta com [texto, língua] (sl=auto) e texto único como string solta também valem', async () => {
  assert.deepStrictEqual(await traduzirLote(['a', 'b'], 'en', { fetchImpl: fetchFalso({ corpo: [['A', 'pt'], ['B', 'pt']] }), url: 'u' }), ['A', 'B']);
  assert.deepStrictEqual(await traduzirLote(['a'], 'en', { fetchImpl: fetchFalso({ corpo: 'Só' }), url: 'u' }), ['Só']);
});

test('falha do serviço (HTTP 429, formato errado, rede) = ErroTradutorWeb — a rota responde 502 e nada é gravado', async () => {
  await assert.rejects(traduzirLote(['a'], 'en', { fetchImpl: fetchFalso({ status: 429 }), url: 'u' }), ErroTradutorWeb);
  await assert.rejects(traduzirLote(['a', 'b'], 'en', { fetchImpl: fetchFalso({ corpo: ['só um'] }), url: 'u' }), ErroTradutorWeb);
  await assert.rejects(traduzirLote(['a'], 'en', { fetchImpl: async () => { throw new TypeError('fetch failed'); }, url: 'u' }), ErroTradutorWeb);
});

test('mantém a inicial maiúscula que o serviço perdeu ("Prazo de entrega" -> "tiempo de entrega")', () => {
  assert.strictEqual(manterInicialMaiuscula('Prazo de entrega', 'tiempo de entrega'), 'Tiempo de entrega');
  assert.strictEqual(manterInicialMaiuscula('prazo', 'plazo'), 'plazo');
  assert.strictEqual(manterInicialMaiuscula('⟦0⟧ deverá', '⟦0⟧ shall'), '⟦0⟧ shall');
  assert.strictEqual(manterInicialMaiuscula('Um', null), null);
});

test('o lote aplica a inicial maiúscula no que o serviço devolveu', async () => {
  const r = await traduzirLote(['Prazo de entrega', 'garantia'], 'es', { fetchImpl: fetchFalso({ corpo: ['tiempo de entrega', 'garantía'] }), url: 'u' });
  assert.deepStrictEqual(r, ['Tiempo de entrega', 'garantía']);
});

if (process.env.TRADUTOR_WEB_REAL === '1') {
  test('[rede] o serviço de verdade devolve as fichas intactas em inglês e espanhol', async () => {
    for (const idioma of ['en', 'es']) {
      // eslint-disable-next-line no-await-in-loop
      const [r] = await traduzirLote(['O ⟦0⟧ deverá pagar a ⟦1⟧ em 30 dias após a emissão da ⟦2⟧.'], idioma);
      assert.ok(/⟦0⟧/.test(r) && /⟦1⟧/.test(r) && /⟦2⟧/.test(r), r);
      console.log(`    ${idioma}: ${r}`);
    }
  });
}

(async () => {
  for (const [n, fn] of testes) {
    try { await fn(); passed++; console.log(`  ok  ${n}`); } catch (e) { failed++; console.log(`  FALHOU  ${n}\n    ${e.stack}`); }
  }
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})();
