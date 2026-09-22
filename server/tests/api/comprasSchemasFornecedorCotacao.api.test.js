/**
 * Etapa 40, Task 1 — os schemas `FornecedorSchema` e `CotacaoSchema` por `safeParse`, ANTES de
 * qualquer rota usa-los. Cada literal e afirmada VERBATIM contra a constante exportada, porque a
 * rota (T2/T3) so as repassa.
 *
 * ⚠️ Os payloads (a)-(d) sao os QUATRO que `client/src/components/FornecedoresDoGrupo.js` manda
 * hoje (`:217`, `:131`, `:167`, `:191`), copiados chave a chave. Se um deles deixar de passar,
 * o modal do grupo quebra em producao com a suite de rotas verde.
 *
 * Executar: cd server && node tests/api/comprasSchemasFornecedorCotacao.api.test.js
 */
const assert = require('assert');
const S = require('../../services/compras/schemas');

let passed = 0; let failed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
// Tolera sucesso: `assert.ok(r.success, msgs(r))` avalia o segundo argumento ANTES de olhar o
// primeiro, e num parse verde `r.error` e undefined (o plano trazia a versao sem a guarda e os
// quatro cenarios do modal caiam com "Cannot read properties of undefined (reading 'issues')").
const msgs = (r) => (r.success ? '' : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));

(async () => {
  // ── Fornecedor: os quatro payloads REAIS do modal do grupo ─────────────────────────────────
  await test('(a) POST do modal: 4 chaves, grupo_id STRING -> passa e grupo_id vira 3', () => {
    const r = S.FornecedorSchema.safeParse({ razao_social: 'ACME', nome_fantasia: '', cnpj: '', grupo_id: '3' });
    assert.ok(r.success, msgs(r));
    assert.strictEqual(r.data.grupo_id, 3);
    assert.strictEqual(r.data.nome_fantasia, '');
  });
  await test('(b) PUT editar do modal: 7 textos vazios + grupo_id string -> passa, textos ficam ""', () => {
    const r = S.FornecedorSchema.safeParse({
      razao_social: 'ACME', nome_fantasia: '', cnpj: '', contato: '', email: '', telefone: '', endereco: '', grupo_id: '7',
    });
    assert.ok(r.success, msgs(r));
    assert.strictEqual(r.data.email, '');
    assert.strictEqual(r.data.grupo_id, 7);
  });
  await test('(c) PUT remover do grupo: grupo_id null -> passa e continua null (NAO undefined)', () => {
    const r = S.FornecedorSchema.safeParse({ razao_social: 'ACME', nome_fantasia: '', cnpj: '', contato: '', email: '', telefone: '', endereco: '', grupo_id: null });
    assert.ok(r.success, msgs(r));
    assert.strictEqual(r.data.grupo_id, null);
    assert.ok('grupo_id' in r.data, 'a chave tem de sobreviver para a rota distinguir "limpar" de "nao mexer"');
  });
  await test('(d) grupo_id AUSENTE -> passa e a chave NAO existe no parsed (a rota nao mexe)', () => {
    const r = S.FornecedorSchema.safeParse({ razao_social: 'ACME' });
    assert.ok(r.success, msgs(r));
    assert.strictEqual(r.data.grupo_id, undefined);
  });
  await test('(e) RN-E01 razao_social vazia, so espacos e ausente -> a literal RAZAO_SOCIAL_OBRIGATORIA', () => {
    for (const corpo of [{ razao_social: '' }, { razao_social: '   ' }, {}]) {
      const r = S.FornecedorSchema.safeParse(corpo);
      assert.ok(!r.success, `devia recusar ${JSON.stringify(corpo)}`);
      assert.strictEqual(msgs(r), `razao_social: ${S.RAZAO_SOCIAL_OBRIGATORIA}`);
    }
    assert.strictEqual(S.RAZAO_SOCIAL_OBRIGATORIA, 'Razão social é obrigatória');
  });
  await test('(f) RN-E03 grupo_id "", 0, -2 -> null (limpa); "abc", 3.5, 1e21, "99999999999999999999" -> 400 com a literal', () => {
    for (const v of ['', 0, -2, 'NaN']) {
      const r = S.FornecedorSchema.safeParse({ razao_social: 'A', grupo_id: v });
      if (v === 'NaN') { assert.ok(!r.success); continue; }
      assert.ok(r.success, `${JSON.stringify(v)}: ${r.success ? '' : msgs(r)}`);
      assert.strictEqual(r.data.grupo_id, null, `grupo_id ${JSON.stringify(v)} devia virar null`);
    }
    // Onda de correcao da Etapa 40, F5 (review da T1, Minor 2): 1e21 e a string de 20 digitos
    // passam pelo preprocess como NUMERO inteiro maior que 2^53 e caem no `.int()` do union — que,
    // sem literal propria, respondia em ingles ("Too big: expected int to be <=9007199254740991").
    // E a armadilha 2 do cabecalho de schemas.js: a literal tem de estar TAMBEM no refinamento.
    for (const v of ['abc', 3.5, {}, 1e21, '99999999999999999999']) {
      const r = S.FornecedorSchema.safeParse({ razao_social: 'A', grupo_id: v });
      assert.ok(!r.success, `devia recusar grupo_id ${JSON.stringify(v)}`);
      assert.strictEqual(msgs(r), `grupo_id: ${S.GRUPO_FORNECEDOR_INVALIDO}`, `grupo_id ${JSON.stringify(v)} saiu como "${msgs(r)}"`);
    }
  });
  await test('(g) RN-E04 status ativo/inativo passam; "x" -> literal com a lista; ausente -> undefined', () => {
    assert.ok(S.FornecedorSchema.safeParse({ razao_social: 'A', status: 'inativo' }).success);
    const r = S.FornecedorSchema.safeParse({ razao_social: 'A', status: 'x' });
    assert.ok(!r.success);
    assert.strictEqual(msgs(r), `status: ${S.STATUS_FORNECEDOR_INVALIDO}`);
    assert.strictEqual(S.STATUS_FORNECEDOR_INVALIDO, 'status do fornecedor inválido (use ativo ou inativo)');
    assert.strictEqual(S.FornecedorSchema.safeParse({ razao_social: 'A' }).data.status, undefined);
  });
  await test('(h) looseObject: chave desconhecida (cidade) SOBREVIVE ao parse', () => {
    const r = S.FornecedorSchema.safeParse({ razao_social: 'A', cidade: 'Joinville' });
    assert.strictEqual(r.data.cidade, 'Joinville');
  });
  await test('(i) textos com espacos sao trimados; null fica null', () => {
    const r = S.FornecedorSchema.safeParse({ razao_social: '  ACME  ', email: '  a@b.c ', contato: null });
    assert.strictEqual(r.data.razao_social, 'ACME');
    assert.strictEqual(r.data.email, 'a@b.c');
    assert.strictEqual(r.data.contato, null);
  });

  // ── Cotacao ────────────────────────────────────────────────────────────────────────────────
  await test('(j) cotacao minima passa; status/valor_total ausentes ficam undefined (default e do servico)', () => {
    const r = S.CotacaoSchema.safeParse({ numero: 'COT-1', fornecedor_id: 3 });
    assert.ok(r.success, r.success ? '' : msgs(r));
    assert.strictEqual(r.data.status, undefined);
    assert.strictEqual(r.data.valor_total, undefined);
  });
  await test('(k) RN-E07 numero vazio/so espacos/ausente -> NUMERO_COTACAO_OBRIGATORIO', () => {
    for (const corpo of [{ numero: '', fornecedor_id: 3 }, { numero: '  ', fornecedor_id: 3 }, { fornecedor_id: 3 }]) {
      const r = S.CotacaoSchema.safeParse(corpo);
      assert.ok(!r.success);
      assert.strictEqual(msgs(r), `numero: ${S.NUMERO_COTACAO_OBRIGATORIO}`);
    }
  });
  await test('(l) RN-E08 fornecedor_id ausente, "3", 0, 2.5 -> FORNECEDOR_COTACAO_OBRIGATORIO (sem coercao)', () => {
    for (const v of [undefined, '3', 0, 2.5]) {
      const r = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: v });
      assert.ok(!r.success, `devia recusar fornecedor_id ${JSON.stringify(v)}`);
      assert.strictEqual(msgs(r), `fornecedor_id: ${S.FORNECEDOR_COTACAO_OBRIGATORIO}`);
    }
  });
  await test('(m) RN-E09 datas: "" -> null; AAAA-MM-DD passa; 31/12/2026 -> literal por campo', () => {
    const ok = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, data_cotacao: '', validade: '2026-12-31' });
    assert.strictEqual(ok.data.data_cotacao, null);
    assert.strictEqual(ok.data.validade, '2026-12-31');
    const r1 = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, data_cotacao: '31/12/2026' });
    assert.strictEqual(msgs(r1), `data_cotacao: ${S.DATA_COTACAO_INVALIDA}`);
    const r2 = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, validade: '31/12/2026' });
    assert.strictEqual(msgs(r2), `validade: ${S.VALIDADE_COTACAO_INVALIDA}`);
  });
  await test('(n) RN-E10 status "aprovada" (feminino) -> literal com as 4 opcoes', () => {
    const r = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, status: 'aprovada' });
    assert.strictEqual(msgs(r), `status: ${S.STATUS_COTACAO_INVALIDO}`);
    assert.strictEqual(S.STATUS_COTACAO_INVALIDO, 'status da cotação inválido (use em_analise, aprovado, rejeitado ou cancelado)');
    assert.deepStrictEqual(S.STATUS_COTACAO, ['em_analise', 'aprovado', 'rejeitado', 'cancelado']);
  });
  await test('(o) RN-E11 valor_total "10" e -1 -> VALOR_COTACAO_NEGATIVO; 0 e 12.5 passam', () => {
    for (const v of ['10', -1]) {
      const r = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, valor_total: v });
      assert.strictEqual(msgs(r), `valor_total: ${S.VALOR_COTACAO_NEGATIVO}`);
    }
    assert.ok(S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, valor_total: 0 }).success);
    assert.ok(S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, valor_total: 12.5 }).success);
  });

  // ── Etapa 41, Task 1 — a cotacao ganha `itens` (OPCIONAL, D2) com literais PROPRIAS ────────
  await test('(p) RN-F02 itens ausente -> undefined; [] passa; item minimo passa com valor_unitario undefined', () => {
    assert.strictEqual(S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1 }).data.itens, undefined);
    const r = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, itens: [] });
    assert.ok(r.success, r.success ? '' : msgs(r));
    assert.deepStrictEqual(r.data.itens, []);
    const r2 = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, itens: [{ material_id: 912, quantidade: 2 }] });
    assert.ok(r2.success, r2.success ? '' : msgs(r2));
    assert.strictEqual(r2.data.itens[0].valor_unitario, undefined);
  });
  await test('(q) itens "abc" -> ITENS_COTACAO_INVALIDOS (a armadilha 2 vale para o tipo do array)', () => {
    const r = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, itens: 'abc' });
    assert.ok(!r.success, 'itens "abc" devia ser recusado');
    assert.strictEqual(msgs(r), `itens: ${S.ITENS_COTACAO_INVALIDOS}`);
    assert.strictEqual(S.ITENS_COTACAO_INVALIDOS, 'itens da cotação devem ser uma lista');
  });
  await test('(r) RN-F01 item: material ausente/"3"/0 -> literal; quantidade 0/"2" -> literal; valor_unitario -1 -> literal; caminho itens.0.<campo>', () => {
    for (const v of [undefined, '3', 0]) {
      const r = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, itens: [{ material_id: v, quantidade: 1 }] });
      assert.ok(!r.success, `devia recusar material_id ${JSON.stringify(v)}`);
      assert.strictEqual(msgs(r), `itens.0.material_id: ${S.MATERIAL_ITEM_COTACAO_OBRIGATORIO}`);
    }
    for (const v of [0, '2']) {
      const r = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, itens: [{ material_id: 912, quantidade: v }] });
      assert.strictEqual(msgs(r), `itens.0.quantidade: ${S.QTD_ITEM_COTACAO_INVALIDA}`, `quantidade ${JSON.stringify(v)} saiu como "${msgs(r)}"`);
    }
    const r3 = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, itens: [{ material_id: 912, quantidade: 1, valor_unitario: -1 }] });
    assert.strictEqual(msgs(r3), `itens.0.valor_unitario: ${S.VALOR_UNITARIO_ITEM_COTACAO_NEGATIVO}`);
    // o segundo item errado aponta itens.1
    const r4 = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, itens: [{ material_id: 912, quantidade: 1 }, { material_id: 912, quantidade: 0 }] });
    assert.strictEqual(msgs(r4), `itens.1.quantidade: ${S.QTD_ITEM_COTACAO_INVALIDA}`);
  });
  await test('(s) as literais do item da cotacao sao DIFERENTES das do item do pedido (um dono por frase)', () => {
    assert.notStrictEqual(S.MATERIAL_ITEM_COTACAO_OBRIGATORIO, S.MATERIAL_ITEM_OBRIGATORIO);
    assert.notStrictEqual(S.QTD_ITEM_COTACAO_INVALIDA, S.QTD_ITEM_PEDIDO_INVALIDA);
    assert.notStrictEqual(S.VALOR_UNITARIO_ITEM_COTACAO_NEGATIVO, S.VALOR_UNITARIO_ITEM_NEGATIVO);
    assert.ok(/da cotação/.test(S.QTD_ITEM_COTACAO_INVALIDA), 'a literal da quantidade tem de dizer "da cotação"');
  });

  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
