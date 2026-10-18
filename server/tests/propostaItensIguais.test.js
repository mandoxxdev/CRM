/**
 * Etapa 142 (propostas) — a identidade do item no salvamento, pelas funcoes puras (C298, C308, C309).
 *
 *   RN-142.02 pareamento por id (o id vale: inteiro, de um atual nao usado, mesma identidade ou os dois sem codigo)
 *   RN-142.03 sem id que vale, por posicao entre os iguais
 *   RN-142.04 a mesclagem preserva do par; sem par, do ultimo igual que nao saiu (C308)
 *   RN-142.05 a religacao pelo par (contagem que nao bate: nada)
 *   RN-142.06 o atual que saiu tem as variaveis aposentadas (nos dois modos; todos saem com itens [])
 *   RN-142.07 o reparo da leitura agrupa por item velho e so preenche item sem linha viva (C309)
 *   RN-142.09 id que nao vale e ignorado
 *   RN-142.11 o plano de materializacao (move o que o reparo poe, aposenta a orfa que nao cabe)
 *
 * Plano: docs/superpowers/plans/2026-10-18-almoxarifado-etapa142-itens-iguais-na-proposta.md
 * Executar: cd server && node tests/propostaItensIguais.test.js
 */
const assert = require('assert');
const { parearItens, identidadeDe, mesclarItensPreservandoCampos } = require('../propostaItensDiff');
const { planoReligacao, repararVariaveisManuais, planoMaterializacao } = require('../variaveisManuaisItens');

let passed = 0; let failed = 0;
function test(n, f) { try { f(); passed++; console.log('  ✓ ' + n); } catch (e) { failed++; console.error('  ✗ ' + n + ': ' + e.message); } }

const P = (id, extra = {}) => ({ id, codigo_produto: 'P', descricao: 'PROD P', ...extra });
const ids = (pares) => pares.map((p) => (p ? p.id : null));

// ── identidade ────────────────────────────────────────────────────────────────────────────
test('[identidade] codigo, senao descricao, sem espacos nas pontas e sem caixa', () => {
  assert.strictEqual(identidadeDe({ codigo_produto: ' p-1 ', descricao: 'x' }), 'P-1');
  assert.strictEqual(identidadeDe({ codigo_produto: '', descricao: ' Item 1 ' }), 'ITEM 1');
  assert.strictEqual(identidadeDe({}), '');
  assert.strictEqual(identidadeDe(null), '');
});
test('[identidade] codigo so de espacos cai para a descricao (como o item_chave gravado; Fase 5 r1 M-1)', () => {
  assert.strictEqual(identidadeDe({ codigo_produto: '   ', descricao: 'Item Livre' }), 'ITEM LIVRE');
  const r = repararVariaveisManuais([{ id: 1, item_id: 5, chave: 'tag', valor: 'A', item_chave: 'Item Livre', item_removido_em: null }], [{ id: 10, codigo_produto: ' ', descricao: 'ITEM LIVRE' }]);
  assert.deepStrictEqual(r.map((l) => l.item_id), [10]);
});

// ── RN-142.02 ─────────────────────────────────────────────────────────────────────────────
test('[RN-142.02] C298: atuais [P1, P2], corpo [{P, id 2}] -> por id, pareado 2, saiu 1', () => {
  const r = parearItens([P(1), P(2)], [{ codigo_produto: 'P', id: 2 }]);
  assert.strictEqual(r.porId, true);
  assert.deepStrictEqual(ids(r.pares), [2]);
  assert.deepStrictEqual(r.sairam.map((a) => a.id), [1]);
});
test('[RN-142.02] por id: item sem id e novo (sem par), mesmo havendo igual sobrando', () => {
  const r = parearItens([P(1), P(2)], [{ codigo_produto: 'P', id: 1 }, { codigo_produto: 'P' }]);
  assert.deepStrictEqual(ids(r.pares), [1, null]);
  assert.deepStrictEqual(r.sairam.map((a) => a.id), [2]);
});
test('[RN-142.02] id em texto so de digitos vale (com espacos nas pontas e zero a esquerda)', () => {
  for (const id of ['2', ' 2', '02', '0002 ']) {
    const r = parearItens([P(1), P(2)], [{ codigo_produto: 'P', id }]);
    assert.deepStrictEqual(ids(r.pares), [2], 'id ' + JSON.stringify(id));
  }
});
test('[RN-142.02] item manual cujo codigo foi apagado (o id fica): e produto trocado — saiu + novo (B925)', () => {
  const r = parearItens([{ id: 1, codigo_produto: 'X1', descricao: 'A' }], [{ id: 1, codigo_produto: '', descricao: 'A' }]);
  assert.deepStrictEqual(ids(r.pares), [null]);
  assert.deepStrictEqual(r.sairam.map((a) => a.id), [1]);
});
test('[RN-142.02] codigo so de espacos conta como sem codigo (o id do item manual vale)', () => {
  const r = parearItens([{ id: 1, codigo_produto: '  ', descricao: 'A' }], [{ id: 1, codigo_produto: '', descricao: 'B' }]);
  assert.deepStrictEqual(ids(r.pares), [1]);
});
test('[RN-142.02] item manual com a descricao editada: o id vale (nenhum dos dois tem codigo)', () => {
  const r = parearItens([{ id: 7, codigo_produto: null, descricao: 'BOMBA' }], [{ id: 7, codigo_produto: null, descricao: 'BOMBA X' }]);
  assert.strictEqual(r.porId, true);
  assert.deepStrictEqual(ids(r.pares), [7]);
  assert.deepStrictEqual(r.sairam, []);
});
test('[RN-142.02] produto trocado na mesma linha: o id nao vale (saiu + novo), tambem numa proposta de um item', () => {
  const r = parearItens([P(1)], [{ codigo_produto: 'Q', id: 1 }]);
  assert.deepStrictEqual(ids(r.pares), [null]);
  assert.deepStrictEqual(r.sairam.map((a) => a.id), [1]);
});
test('[RN-142.02] identidade sem caixa: id com descricao em outra caixa vale', () => {
  const r = parearItens([{ id: 3, codigo_produto: 'abc' }], [{ id: 3, codigo_produto: 'ABC' }]);
  assert.deepStrictEqual(ids(r.pares), [3]);
});

// ── RN-142.09 ─────────────────────────────────────────────────────────────────────────────
test('[RN-142.09] id repetido: so o primeiro vale; o segundo fica sem par', () => {
  const r = parearItens([P(1), P(2)], [{ codigo_produto: 'P', id: 1 }, { codigo_produto: 'P', id: 1 }]);
  assert.strictEqual(r.porId, true);
  assert.deepStrictEqual(ids(r.pares), [1, null]);
  assert.deepStrictEqual(r.sairam.map((a) => a.id), [2]);
});
test('[RN-142.09] ids que nao valem (inexistente, texto, fracao, null, undefined) -> por posicao', () => {
  for (const id of [99, 'abc', 1.5, '1.0', null, undefined, '', true, [1], { id: 1 }]) {
    const r = parearItens([P(1), P(2)], [{ codigo_produto: 'P', id }]);
    assert.strictEqual(r.porId, false, 'id ' + JSON.stringify(id) + ' virou por id');
    assert.deepStrictEqual(ids(r.pares), [1], 'id ' + JSON.stringify(id));
    assert.deepStrictEqual(r.sairam.map((a) => a.id), [2], 'id ' + JSON.stringify(id));
  }
});
test('[RN-142.09] atuais sem id (testes antigos) nunca pareiam com corpo sem id por "undefined"', () => {
  const r = parearItens([{ codigo_produto: 'P' }, { codigo_produto: 'Q' }], [{ codigo_produto: 'Q' }]);
  assert.strictEqual(r.porId, false);
  assert.strictEqual(r.pares[0].codigo_produto, 'Q');
});

// ── RN-142.03 ─────────────────────────────────────────────────────────────────────────────
test('[RN-142.03] por posicao: o k-esimo igual com o k-esimo; sobra do corpo sem par; saem os ultimos', () => {
  const r = parearItens([P(1), { id: 5, codigo_produto: 'Q' }, P(2), P(3)], [{ codigo_produto: 'Q' }, { codigo_produto: 'p' }, { codigo_produto: 'R' }]);
  assert.strictEqual(r.porId, false);
  assert.deepStrictEqual(ids(r.pares), [5, 1, null]);
  assert.deepStrictEqual(r.sairam.map((a) => a.id), [2, 3]);
});
test('[RN-142.03] por posicao, item manual com a descricao em outra caixa casa (identidade sem caixa)', () => {
  const r = parearItens([{ id: 1, codigo_produto: null, descricao: 'BOMBA' }], [{ codigo_produto: null, descricao: 'Bomba' }]);
  assert.deepStrictEqual(ids(r.pares), [1]);
});
test('[RN-142.03] corpo vazio, null ou nao-lista: todos saem', () => {
  for (const corpo of [[], null, undefined, 'x']) {
    const r = parearItens([P(1), P(2)], corpo);
    assert.deepStrictEqual(r.pares, []);
    assert.deepStrictEqual(r.sairam.map((a) => a.id), [1, 2]);
  }
});

// ── RN-142.04 (C308) ──────────────────────────────────────────────────────────────────────
test('[RN-142.04] C308: dois P sem ids -> cada um com os campos do seu (antes os dois com os do ultimo)', () => {
  const m = mesclarItensPreservandoCampos(
    [P(1, { tag: 'X', descricao_tabela: 'linha 1' }), P(2, { tag: 'Y', descricao_tabela: 'linha 2' })],
    [{ codigo_produto: 'P' }, { codigo_produto: 'P' }]
  );
  assert.deepStrictEqual(m.map((x) => x.tag + '/' + x.descricao_tabela), ['X/linha 1', 'Y/linha 2']);
});
test('[RN-142.04] por id: o que ficou mantem os seus campos (tirou o primeiro)', () => {
  const m = mesclarItensPreservandoCampos(
    [P(1, { tag: 'X', descricao_tabela: 'linha 1' }), P(2, { tag: 'Y', descricao_tabela: 'linha 2' })],
    [{ codigo_produto: 'P', id: 2 }]
  );
  assert.deepStrictEqual(m.map((x) => x.tag + '/' + x.descricao_tabela), ['Y/linha 2']);
});
// Fase 5 (r1 I-1): a primeira versao excluia o que saiu ("Fase 2 M3") e o produto tirado e incluido de novo no mesmo salvamento perdia a
// descricao da tabela e o descritivo. Voltou ao de antes da etapa: sem par, o ultimo gravado da mesma identidade (B920).
test('[RN-142.04] sem par: herda do ultimo gravado da mesma identidade, mesmo o que saiu (B920, o de antes da etapa)', () => {
  const m = mesclarItensPreservandoCampos(
    [P(1, { descricao_tabela: 'linha 1' }), P(2, { descricao_tabela: 'linha 2' })],
    [{ codigo_produto: 'P', id: 1 }, { codigo_produto: 'P' }]
  );
  assert.deepStrictEqual(m.map((x) => x.descricao_tabela), ['linha 1', 'linha 2']);
});
test('[RN-142.04] tirar P e incluir P de novo no mesmo salvamento (com Q ficando): o P novo recupera os campos', () => {
  const m = mesclarItensPreservandoCampos([P(1, { descricao_tabela: 'linha 1', descritivo_tecnico: 'DT' }), { id: 2, codigo_produto: 'Q' }], [{ codigo_produto: 'Q', id: 2 }, { codigo_produto: 'P' }]);
  assert.deepStrictEqual([m[1].descricao_tabela, m[1].descritivo_tecnico], ['linha 1', 'DT']);
});
test('[RN-142.04] por posicao, o item a mais de um produto presente herda do ultimo igual (o de hoje)', () => {
  const m = mesclarItensPreservandoCampos([P(1, { modelo: 'M1' }), P(2, { modelo: 'M2' })], [{ codigo_produto: 'P' }, { codigo_produto: 'P' }, { codigo_produto: 'P' }]);
  assert.deepStrictEqual(m.map((x) => x.modelo), ['M1', 'M2', 'M2']);
});
test('[RN-142.04] item manual com descricao editada (id) preserva os campos', () => {
  const m = mesclarItensPreservandoCampos([{ id: 7, descricao: 'BOMBA', descritivo_tecnico: 'DT' }], [{ id: 7, descricao: 'BOMBA X' }]);
  assert.strictEqual(m[0].descritivo_tecnico, 'DT');
});
test('[RN-142.04] a mesclagem nao muta a entrada e respeita o campo que veio', () => {
  const atuais = [P(1, { tag: 'X' })];
  const corpo = [{ codigo_produto: 'P', tag: 'NOVA' }];
  const m = mesclarItensPreservandoCampos(atuais, corpo);
  assert.strictEqual(m[0].tag, 'NOVA');
  assert.strictEqual(corpo[0].tag, 'NOVA');
  assert.strictEqual(atuais[0].tag, 'X');
  assert.notStrictEqual(m[0], corpo[0]);
});

// ── RN-142.05 / 06 ────────────────────────────────────────────────────────────────────────
test('[RN-142.05/06] C298 por id: move 2 -> novo, aposenta 1', () => {
  const p = planoReligacao([P(1), P(2)], [{ codigo_produto: 'P', id: 2 }], [10]);
  assert.deepStrictEqual(p, { mover: [[2, 10]], aposentar: [1] });
});
test('[RN-142.05/06] por posicao: move na ordem e aposenta o ultimo que sobrou', () => {
  const p = planoReligacao([P(1), P(2)], [{ codigo_produto: 'P' }], [10]);
  assert.deepStrictEqual(p, { mover: [[1, 10]], aposentar: [2] });
});
test('[RN-142.06] itens [] aposenta todos', () => {
  assert.deepStrictEqual(planoReligacao([P(1), P(2)], [], []), { mover: [], aposentar: [1, 2] });
});
test('[RN-142.05] item novo nao recebe nada; os pareados vao para a linha do seu indice', () => {
  const p = planoReligacao([P(1), { id: 2, codigo_produto: 'Q' }], [{ codigo_produto: 'Q', id: 2 }, { codigo_produto: 'R' }, { codigo_produto: 'P', id: 1 }], [20, 21, 22]);
  assert.deepStrictEqual(p, { mover: [[2, 20], [1, 22]], aposentar: [] });
});
test('[RN-142.05] contagem de linhas novas diferente do corpo: nada', () => {
  assert.deepStrictEqual(planoReligacao([P(1), P(2)], [{ codigo_produto: 'P', id: 2 }], []), { mover: [], aposentar: [] });
  assert.deepStrictEqual(planoReligacao([P(1)], [{ codigo_produto: 'P' }], [10, 11]), { mover: [], aposentar: [] });
});

// ── RN-142.07 (C309) ──────────────────────────────────────────────────────────────────────
const v = (id, item_id, chave, valor, extra = {}) => ({ id, item_id, chave, valor, item_chave: 'P', item_removido_em: null, ...extra });
const porItem = (linhas) => linhas.map((l) => `${l.item_id}:${l.chave}=${l.valor}`).sort();
test('[RN-142.07] C309: duas variaveis do mesmo item orfao vao juntas para o primeiro P (antes: uma para cada)', () => {
  const r = repararVariaveisManuais([v(1, 5, 'tag', 'A'), v(2, 5, 'serie', 'S')], [P(10), P(11)]);
  assert.deepStrictEqual(porItem(r), ['10:serie=S', '10:tag=A']);
});
test('[RN-142.07] todos orfaos (a religacao nunca aconteceu): grupos por id velho -> itens na ordem', () => {
  const r = repararVariaveisManuais([v(1, 6, 'tag', 'B'), v(2, 5, 'tag', 'A')], [P(10), P(11)]);
  assert.deepStrictEqual(porItem(r), ['10:tag=A', '11:tag=B']);
});
test('[RN-142.07] C298: TAG-A aposentada e TAG-B viva no P que ficou -> so TAG-B no item', () => {
  const r = repararVariaveisManuais([v(1, 1, 'tag', 'A', { item_removido_em: '2026-10-18 10:00:00' }), v(2, 10, 'tag', 'B')], [P(10)]);
  assert.deepStrictEqual(r.filter((l) => l.item_id === 10).map((l) => l.valor), ['B']);
});
test('[RN-142.07] nunca dobra (item, chave): orfa viva nao vai para item com linha viva', () => {
  const r = repararVariaveisManuais([v(1, 2, 'tag', 'B'), v(2, 10, 'tag', 'A')], [P(10)]);
  assert.deepStrictEqual(r.filter((l) => l.item_id === 10).map((l) => l.valor), ['A']);
});
test('[RN-142.07] aposentada nunca e candidata, nem com item vazio do mesmo produto', () => {
  const r = repararVariaveisManuais([v(1, 1, 'tag', 'A', { item_removido_em: 'x' })], [P(10)]);
  assert.deepStrictEqual(r.map((l) => l.item_id), [1]);
});
test('[RN-142.07] item_chave em outra caixa casa; sem item_chave fica como esta', () => {
  const r = repararVariaveisManuais([v(1, 5, 'tag', 'A', { item_chave: 'p' }), v(2, 6, 'tag', 'Z', { item_chave: null })], [P(10), P(11)]);
  assert.deepStrictEqual(porItem(r), ['10:tag=A', '6:tag=Z']);
});
test('[RN-142.07] ids velhos em ordem NUMERICA (99 antes de 100), nao de texto', () => {
  const r = repararVariaveisManuais([v(1, 100, 'tag', 'B'), v(2, 99, 'tag', 'A')], [P(200), P(201)]);
  assert.deepStrictEqual(porItem(r), ['200:tag=A', '201:tag=B']);
});
test('[RN-142.07] item_removido_em vazio ("" — a coluna limpa com texto vazio) conta como viva', () => {
  const r = repararVariaveisManuais([v(1, 5, 'tag', 'A', { item_removido_em: '' })], [P(10)]);
  assert.deepStrictEqual(r.map((l) => l.item_id), [10]);
});
test('[RN-142.07] sem orfa: devolve as linhas como estao; vazio -> []', () => {
  const linhas = [v(1, 10, 'tag', 'A')];
  assert.strictEqual(repararVariaveisManuais(linhas, [P(10)]), linhas);
  assert.deepStrictEqual(repararVariaveisManuais([], [P(10)]), []);
  assert.deepStrictEqual(repararVariaveisManuais(null, [P(10)]), []);
});
test('[RN-142.07] nao muta as linhas de entrada', () => {
  const linhas = [v(1, 5, 'tag', 'A')];
  repararVariaveisManuais(linhas, [P(10)]);
  assert.strictEqual(linhas[0].item_id, 5);
});

// ── RN-142.11 ─────────────────────────────────────────────────────────────────────────────
test('[RN-142.11] legado da C298 (A viva no 3, B orfa do 2): B nao cabe -> aposentar', () => {
  const p = planoMaterializacao([v(1, 3, 'tag', 'A'), v(2, 2, 'tag', 'B')], [P(3)]);
  assert.deepStrictEqual(p, { mover: [], aposentar: [2] });
});
test('[RN-142.11] orfas que cabem sao movidas (pelo id da linha); as sem identidade e as que sobram, aposentadas', () => {
  const p = planoMaterializacao(
    [v(1, 5, 'tag', 'A'), v(2, 5, 'serie', 'S'), v(3, 6, 'tag', 'B'), v(4, 7, 'tag', 'Z', { item_chave: null }), v(5, 8, 'tag', 'Y', { item_removido_em: 'x' })],
    [P(10)]
  );
  assert.deepStrictEqual(p, { mover: [[1, 10], [2, 10]], aposentar: [3, 4] });
});
test('[RN-142.11] sem orfa: nada', () => {
  assert.deepStrictEqual(planoMaterializacao([v(1, 10, 'tag', 'A')], [P(10)]), { mover: [], aposentar: [] });
});

// ── a fiação no index.js: o /pdf (que o teste da rota não abre — Puppeteer) usa o mesmo reparo e a mesma leitura do /premium ──
test('[RN-142.07/08] o /premium e o /pdf leem SELECT * e passam pelo reparo do modulo; o index.js nao tem copia propria', () => {
  // eslint-disable-next-line global-require
  const fonte = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.js'), 'utf8');
  assert.strictEqual(fonte.split("db.all('SELECT * FROM proposta_variaveis_manuais WHERE proposta_id = ?', [id], (errVM, vmRows) => {").length, 2, '/premium');
  assert.strictEqual(fonte.split('templateConfig.variaveis_manuais = repararVariaveisManuais(vmRows, itens);').length, 2, '/premium');
  assert.strictEqual(fonte.split("db.all('SELECT * FROM proposta_variaveis_manuais WHERE proposta_id = ?', [id], (err, rows) => resolve(rows || []));").length, 2, '/pdf');
  assert.strictEqual(fonte.split('templateConfig.variaveis_manuais = repararVariaveisManuais(variaveisManuaisPdf, itens);').length, 2, '/pdf');
  assert.ok(!/function repararVariaveisManuais\s*\(/.test(fonte), 'o index.js voltou a ter a sua copia');
  assert.ok(/require\('\.\/variaveisManuaisItens'\)/.test(fonte));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
