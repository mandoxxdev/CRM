/**
 * Etapa 117 (C235, RN-06; B762) — no estorno de Saida, o registro no livro e o desfazer rodam DENTRO da secao da trava do
 * material. Ate a 117 os dois rodavam depois de soltar: com o INSERT do livro falhando, uma Saida do mesmo material cabia
 * entre o credito do estorno e o desfazer (que subtrai sem guarda) e o fisico ia a -2.
 *
 * A Saida "do meio" e disparada de dentro do gancho no INSERT do livro, mas FORA do contexto da secao (AsyncResource ligado
 * no topo): de dentro ela herdaria a secao (AsyncLocalStorage) e passaria pela trava como se ja a tivesse — o teste provaria
 * nada (a licao da Fase 5 da 116).
 *
 * Executar: cd server && node tests/api/estornoLivroNaTrava.api.test.js
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
    const codigo = `LT117-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, codigo])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const mov = async (m, body) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'lt117',
      justificativa: 'preparo lt117', documento_vinculado: 'NF-LT117', ...body });
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    return (await dbGet(db, 'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1',
      [m.id, body.tipo])).id;
  };
  const estornar = (movId) => request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'lt117' });
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q;
  const somaLinhas = async (m) => (await dbGet(db,
    'SELECT COALESCE(SUM(quantidade), 0) t FROM estoque_saldo_almoxarifado WHERE material_id = ?', [m.id])).t;
  const cancelado = async (id) => (await dbGet(db, 'SELECT COALESCE(cancelado, 0) c FROM movimentacoes_almoxarifado WHERE id = ?', [id])).c;

  /**
   * Roda `fn` com o INSERT da linha ESTORNO falhando uma vez. Se `meio` vier, ele e disparado (fora da secao) no instante do
   * INSERT, e o INSERT so falha depois de ele terminar ou de 150 ms (o que vier antes) — com a trava, ele espera ate o fim.
   */
  async function comLivroFalhando(fn, meio) {
    const original = db.run;
    const estado = { armado: true };
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (estado.armado && typeof sql === 'string' && sql.includes('INSERT INTO movimentacoes_almoxarifado')
        && Array.isArray(params) && params.includes('ESTORNO')) {
        estado.armado = false;
        estado.meio = meio ? foraDaSecao(() => meio().then((ok) => ({ ok }), (err) => ({ err: err.message }))) : null;
        estado.terminouAntes = false;
        estado.falhou = false;
        // "terminou antes" = a Saida do meio acabou ANTES de o INSERT falhar (sem a trava ela roda no meio do estorno)
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

  await test('[RN-06] livro falhando + Saida de 5 no meio: estorno 500, a Saida espera e e recusada, fisico 3 (era -2)', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const { res, meio, terminouAntes } = await comLivroFalhando(() => estornar(saidaId),
      () => stockService.registrarMovimentacao(db, SUPER, { material_id: m.id, tipo: 'SAIDA', quantidade: 5, motivo: 'meio',
        justificativa: 'meio', documento_vinculado: 'NF-MEIO' }));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.strictEqual(terminouAntes, false, `a Saida do meio terminou antes do desfazer: nao esperou a trava (${JSON.stringify(meio)})`);
    assert.ok(meio.err, `a Saida do meio passou: ${JSON.stringify(meio)}`);
    assert.strictEqual(await fisico(m), 3);
    assert.strictEqual(await somaLinhas(m), 3);
    assert.strictEqual(await cancelado(saidaId), 0);
    const de_novo = await estornar(saidaId);
    assert.strictEqual(de_novo.status, 200, JSON.stringify(de_novo.body));
    assert.strictEqual(await fisico(m), 5);
    assert.strictEqual(await somaLinhas(m), 5);
  });

  await test('[RN-06] livro falhando + Saida de 3 no meio: a Saida espera e passa DEPOIS do desfazer (fisico 0, nunca negativo)', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const { res, meio, terminouAntes } = await comLivroFalhando(() => estornar(saidaId),
      () => stockService.registrarMovimentacao(db, SUPER, { material_id: m.id, tipo: 'SAIDA', quantidade: 3, motivo: 'meio',
        justificativa: 'meio', documento_vinculado: 'NF-MEIO' }));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.strictEqual(terminouAntes, false, 'a Saida do meio terminou antes do desfazer');
    assert.ok(meio.ok, JSON.stringify(meio));
    assert.strictEqual(await fisico(m), 0);
    assert.strictEqual(await somaLinhas(m), 0);
    assert.strictEqual(await cancelado(saidaId), 0);
  });

  await test('[RN-06] livro falhando sem ninguem no meio: desfaz uma vez so (fisico 3, nao 1), e o retry estorna', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const { res } = await comLivroFalhando(() => estornar(saidaId));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.strictEqual(await fisico(m), 3);
    assert.strictEqual(await somaLinhas(m), 3);
    assert.strictEqual(await cancelado(saidaId), 0);
    const n = (await dbGet(db, "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ESTORNO'", [m.id])).n;
    assert.strictEqual(n, 0);
    assert.strictEqual((await estornar(saidaId)).status, 200);
    assert.strictEqual(await fisico(m), 5);
  });

  await test('[RN-06] com series: livro falhando -> as 2 series voltam a Entregue, fisico 0; retry -> Em estoque, fisico 2', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['LT-A', 'LT-B'] });
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: ids });
    const { res } = await comLivroFalhando(() => estornar(saidaId));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    const st = async () => (await dbAll(db, 'SELECT status FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id]))
      .map((x) => x.status);
    assert.deepStrictEqual(await st(), ['ENTREGUE', 'ENTREGUE']);
    assert.strictEqual(await fisico(m), 0);
    assert.strictEqual((await estornar(saidaId)).status, 200);
    assert.deepStrictEqual(await st(), ['EM_ESTOQUE', 'EM_ESTOQUE']);
    assert.strictEqual(await fisico(m), 2);
  });

  await test('[RN-06] o estorno de ENTRADA com o livro falhando continua desfazendo como antes (fisico 5)', async () => {
    const m = await material();
    const entradaId = await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const { res } = await comLivroFalhando(() => estornar(entradaId));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.strictEqual(await fisico(m), 5);
    assert.strictEqual(await somaLinhas(m), 5);
    assert.strictEqual(await cancelado(entradaId), 0);
  });

  await test('[RN-06] controle: o estorno de Saida sem falha grava uma linha ESTORNO e o movimento_estorno_id', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const r = await estornar(saidaId);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const est = await dbGet(db, "SELECT id, saldo_anterior a, saldo_posterior p FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ESTORNO'", [m.id]);
    const orig = await dbGet(db, 'SELECT movimento_estorno_id e FROM movimentacoes_almoxarifado WHERE id = ?', [saidaId]);
    assert.deepStrictEqual([orig.e, est.a, est.p, r.body.estorno_id], [est.id, 3, 5, est.id]);
  });

  // ── Fase 2 (R4): qualquer falha DEPOIS do credito, dentro da secao, desfaz sob a trava; e o vinculo que falha tira a linha ─
  await test('[R4] a linha de saldo falhando no ramo de saida, com uma Saida de 5 no meio: a Saida espera e recusa, fisico 3', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const original = db.get;
    const estado = { armado: true, falhou: false, terminouAntes: false };
    db.get = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (estado.armado && /^\s*UPDATE estoque_saldo_almoxarifado/.test(String(sql)) && Array.isArray(params)
        && Number(params[0]) === 2 && Number(params[1]) === m.id) {
        estado.armado = false;
        estado.meio = foraDaSecao(() => stockService.registrarMovimentacao(db, SUPER, { material_id: m.id, tipo: 'SAIDA',
          quantidade: 5, motivo: 'meio', justificativa: 'meio', documento_vinculado: 'NF-MEIO' })
          .then((ok) => ({ ok }), (err) => ({ err: err.message })));
        Promise.race([estado.meio.then(() => { if (!estado.falhou) estado.terminouAntes = true; }),
          new Promise((r) => setTimeout(r, 150))])
          .then(() => { estado.falhou = true; cb.call({}, new Error('falha forcada da linha de saldo (teste)')); });
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res;
    try { res = await estornar(saidaId); } finally { db.get = original; }
    assert.strictEqual(estado.armado, false, 'gancho nao disparou');
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    const meio = await estado.meio;
    assert.strictEqual(estado.terminouAntes, false, `a Saida do meio nao esperou o desfazer (${JSON.stringify(meio)})`);
    assert.ok(meio.err, JSON.stringify(meio));
    assert.strictEqual(await fisico(m), 3);
    assert.strictEqual(await somaLinhas(m), 3);
    assert.strictEqual(await cancelado(saidaId), 0);
  });

  await test('[R4] o vinculo (movimento_estorno_id) falhando: a linha ESTORNO sai de novo, fisico 3, e o retry estorna', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const original = db.run;
    let armado = true;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (armado && /SET movimento_estorno_id = \?/.test(String(sql))) {
        armado = false;
        cb.call({}, new Error('falha forcada do vinculo do estorno (teste)'));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res;
    try { res = await estornar(saidaId); } finally { db.run = original; }
    assert.strictEqual(armado, false, 'gancho nao disparou');
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    const n = async () => (await dbGet(db, "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ESTORNO'", [m.id])).n;
    assert.strictEqual(await n(), 0, 'a linha ESTORNO ficou no livro de um estorno desfeito');
    assert.strictEqual(await fisico(m), 3);
    assert.strictEqual(await cancelado(saidaId), 0);
    assert.strictEqual((await estornar(saidaId)).status, 200);
    assert.strictEqual(await n(), 1);
    assert.strictEqual(await fisico(m), 5);
  });

  await test('[RN-06] o desfazer lento (100 ms no fisico) continua sob a trava: a Saida de 5 do meio espera e recusa, fisico 3', async () => {
    // Sem o desfazer DENTRO da secao, o catch de fora desfaz depois de soltar — e so a ordem das escritas no SQLite fazia a
    // Saida do meio chegar depois. Atrasar o desfazer do fisico tira a sorte: fora da trava, a Saida leva os 5 (fisico -2).
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const original = db.run;
    const estado = { livro: true, desfazer: true };
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      const texto = String(sql);
      if (estado.livro && texto.includes('INSERT INTO movimentacoes_almoxarifado') && Array.isArray(params) && params.includes('ESTORNO')) {
        estado.livro = false;
        estado.meio = foraDaSecao(() => stockService.registrarMovimentacao(db, SUPER, { material_id: m.id, tipo: 'SAIDA',
          quantidade: 5, motivo: 'meio', justificativa: 'meio', documento_vinculado: 'NF-MEIO' })
          .then((ok) => ({ ok }), (err) => ({ err: err.message })));
        setTimeout(() => cb.call({}, new Error('falha forcada do livro do estorno (teste)')), 20);
        return this;
      }
      if (!estado.livro && estado.desfazer && /SET quantidade_atual = /.test(texto) && Array.isArray(params) && Number(params[0]) === -2) {
        estado.desfazer = false;
        setTimeout(() => original.call(db, sql, params, cb), 100);
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res;
    try { res = await estornar(saidaId); } finally { db.run = original; }
    assert.deepStrictEqual([estado.livro, estado.desfazer], [false, false], 'gancho nao disparou');
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    const meio = await estado.meio;
    assert.ok(meio.err, `a Saida do meio passou: ${JSON.stringify(meio)}`);
    assert.strictEqual(await fisico(m), 3);
    assert.strictEqual(await cancelado(saidaId), 0);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
