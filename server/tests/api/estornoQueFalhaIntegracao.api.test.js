/**
 * Etapa 118 (T3) — integracao que cruza Movimentacoes, Devolucoes e Series: o estorno que falha no meio desfaz tudo, e o que
 * vem DEPOIS (o estorno de novo, a lista de saidas elegiveis, a devolucao, a Saida pela rota) aceita o que o desfazer deixou.
 * Tudo pelas rotas; o "do meio" disparado FORA do contexto da secao (AsyncResource), como em estornoQueFalhaDesfaz.
 *
 * Executar: cd server && node tests/api/estornoQueFalhaIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { AsyncResource } = require('async_hooks');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };

(async () => {
  const { app, db, close } = await createTestApp({ user: SUPER });
  const foraDaSecao = AsyncResource.bind((fn) => fn());
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `EI118-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, codigo])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const loc = async () => (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?, 'ei118', 1)",
    [`EI118-L${++seq}`])).lastID;
  const ultimo = async (m, tipo) => (await dbGet(db,
    'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1', [m.id, tipo])).id;
  const v2 = (m, body) => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'ei118',
    justificativa: 'ei118', documento_vinculado: 'NF-EI118', ...body });
  const mov = async (m, body) => {
    const r = await v2(m, body);
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    return ultimo(m, body.tipo);
  };
  const estornar = (movId) => request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'ei118' });
  const devolver = (m, saidaId, quantidade, extra = {}) => request(app).post('/api/almoxarifado/devolucoes')
    .send({ material_id: m.id, quantidade, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId, ...extra });
  const lista = async (m, saidaId) => {
    const r = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${m.id}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.find((s) => s.id === saidaId);
  };
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q;
  const linha = async (m, l) => (await dbGet(db,
    'SELECT COALESCE(SUM(quantidade), 0) q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?', [m.id, l])).q;
  const series = async (m) => (await dbAll(db, 'SELECT status FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id]))
    .map((x) => x.status);

  /** O INSERT da linha ESTORNO falha uma vez; `meio` (opcional) dispara fora da secao e a falha espera ele ou 150 ms. */
  async function comLivroFalhando(fn, meio) {
    const original = db.run;
    const estado = { armado: true, falhou: false, terminouAntes: false };
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (estado.armado && typeof sql === 'string' && sql.includes('INSERT INTO movimentacoes_almoxarifado')
        && Array.isArray(params) && params.includes('ESTORNO')) {
        estado.armado = false;
        estado.meio = meio ? foraDaSecao(() => meio()) : null;
        const espera = estado.meio
          ? Promise.race([estado.meio.then(() => { if (!estado.falhou) estado.terminouAntes = true; }),
            new Promise((r) => setTimeout(r, 150))])
          : Promise.resolve();
        espera.then(() => { estado.falhou = true; cb.call({}, new Error('falha forcada do livro do estorno (teste)')); });
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res;
    try { res = await fn(); } finally { db.run = original; }
    assert.strictEqual(estado.armado, false, 'gancho nao disparou');
    return { res, meio: estado.meio ? await estado.meio : null, terminouAntes: estado.terminouAntes };
  }

  console.log('\n=== Etapa 118 (T3): integracao — o estorno que falha desfaz, e o que vem depois aceita ===\n');

  await test('(i) series: devolucao -> estorno da entrada dela com o livro falhando e a avulsa no meio -> estorno de novo -> a lista oferece 2 -> devolve com as series -> 201', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['I1A', 'I1B'] });
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: ids });
    assert.strictEqual((await devolver(m, saidaId, 2, { series: ['I1A', 'I1B'] })).status, 201);
    const entDev = await ultimo(m, 'ENTRADA_DEVOLUCAO');
    const { res, meio, terminouAntes } = await comLivroFalhando(() => estornar(entDev),
      () => devolver(m, null, 2, { series: ['I1A', 'I1B'] }).then((r) => ({ status: r.status, error: r.body && r.body.error })));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.strictEqual(terminouAntes, false, `a devolucao avulsa do meio nao esperou (${JSON.stringify(meio)})`);
    assert.notStrictEqual(meio.status, 201, `a devolucao avulsa do meio passou: ${JSON.stringify(meio)}`);
    assert.strictEqual(await fisico(m), 2);
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM devolucoes_material_almoxarifado WHERE material_id = ?', [m.id])).n, 1,
      'a devolucao recusada deixou a linha');
    assert.strictEqual((await lista(m, saidaId)).saldo_devolvivel, 0, 'a devolucao ainda esta viva');
    const de_novo = await estornar(entDev);
    assert.strictEqual(de_novo.status, 200, JSON.stringify(de_novo.body));
    assert.strictEqual(await fisico(m), 0);
    assert.deepStrictEqual(await series(m), ['ENTREGUE', 'ENTREGUE']);
    const s = await lista(m, saidaId);
    assert.strictEqual(s.saldo_devolvivel, 2);
    const d = await devolver(m, saidaId, s.saldo_devolvivel, { series: ['I1A', 'I1B'] });
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    assert.strictEqual(await fisico(m), 2);
    assert.deepStrictEqual(await series(m), ['EM_ESTOQUE', 'EM_ESTOQUE']);
  });

  await test('(ii) bloqueio: estorno com o livro falhando e uma Saida de 5 pela rota no meio -> recusada; estorno de novo -> 200 -> a Saida de 5 passa', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    await stockService.registrarMovimentacao(db, SUPER, { material_id: m.id, tipo: 'BLOQUEIO', quantidade: 2, motivo: 'ei118',
      justificativa: 'avaria' });
    const blq = await ultimo(m, 'BLOQUEIO');
    const { res, meio, terminouAntes } = await comLivroFalhando(() => estornar(blq),
      () => v2(m, { tipo: 'SAIDA', quantidade: 5 }).then((r) => ({ status: r.status, error: r.body && r.body.error })));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.strictEqual(terminouAntes, false, `a Saida do meio nao esperou (${JSON.stringify(meio)})`);
    assert.strictEqual(meio.status, 400, `a Saida do meio levou o bloqueado: ${JSON.stringify(meio)}`);
    assert.strictEqual(await fisico(m), 5);
    const de_novo = await estornar(blq);
    assert.strictEqual(de_novo.status, 200, JSON.stringify(de_novo.body));
    assert.strictEqual((await v2(m, { tipo: 'SAIDA', quantidade: 5 })).status, 201);
    assert.strictEqual(await fisico(m), 0);
  });

  await test('(iii) transferencia: estorno com o livro falhando -> a transferencia segue valendo: Saida de 3 do destino pela rota -> 201 -> o estorno recusa', async () => {
    const m = await material();
    const A = await loc(); const B = await loc();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: A });
    const tr = await mov(m, { tipo: 'TRANSFERENCIA', quantidade: 3, localizacao_origem_id: A, localizacao_destino_id: B });
    const { res } = await comLivroFalhando(() => estornar(tr));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.deepStrictEqual([await linha(m, A), await linha(m, B)], [2, 3]);
    const s = await v2(m, { tipo: 'SAIDA', quantidade: 3, localizacao_origem_id: B });
    assert.strictEqual(s.status, 201, JSON.stringify(s.body));
    const e = await estornar(tr);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, 'Não é possível estornar: o destino não tem mais o saldo transferido');
    assert.deepStrictEqual([await fisico(m), await linha(m, A), await linha(m, B)], [2, 2, 0]);
  });

  await test('(iv) devolucao no meio de um estorno de Saida que falha -> E1 -> devolver -> 201 -> o estorno da saida recusa (devolvida)', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const { res, meio } = await comLivroFalhando(() => estornar(saidaId),
      () => devolver(m, saidaId, 2).then((r) => ({ status: r.status, error: r.body && r.body.error })));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.deepStrictEqual(meio, { status: 400, error: `A saída ${saidaId} tem um estorno em andamento que ainda não concluiu — nada foi gravado. Tente de novo em instantes; se a recusa continuar, o estorno foi interrompido: avise o administrador do almoxarifado.` });
    assert.strictEqual((await lista(m, saidaId)).saldo_devolvivel, 2);
    assert.strictEqual((await devolver(m, saidaId, 2)).status, 201);
    assert.strictEqual(await fisico(m), 5);
    const e = await estornar(saidaId);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.ok(e.body.error.startsWith('Não é possível estornar: esta saída já foi devolvida inteira'), e.body.error);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
