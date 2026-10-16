/**
 * Etapa 119 (T4) — integracao que cruza Movimentacoes, Estorno, Devolucoes e Series: o que ja valeu nao se perde, e o que vem
 * depois aceita.
 *
 * (i) a saida com lote que falha no 2o endereco -> a mesma saida de novo passa -> o estorno dela com a auditoria falhando
 *     responde 200 -> o lote volta inteiro -> uma saida de 6 do lote passa (C249 + C248).
 * (ii) series, duas devolucoes da mesma saida: devolve pela lista -> estorna a entrada da devolucao -> a lista oferece de novo ->
 *     devolve de novo -> estorna de novo -> estorna a saida -> estorna a entrada original (200) -> Entrada nova com os mesmos
 *     numeros reativa (C242).
 *
 * Executar: cd server && node tests/api/oQueJaValeuIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };

(async () => {
  const { app, db, close } = await createTestApp({ user: SUPER });
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `OJI119-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, codigo])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const loc = async () => (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?, 'oji119', 1)",
    [`OJI119-L${++seq}`])).lastID;
  const ultimo = async (m, tipo) => (await dbGet(db,
    'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1', [m.id, tipo])).id;
  const v2 = (m, body) => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'oji119',
    justificativa: 'oji119', documento_vinculado: 'NF-OJI119', ...body });
  const mov = async (m, body) => {
    const r = await v2(m, body);
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    return ultimo(m, body.tipo);
  };
  const estornar = (movId) => request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'oji119' });
  const devolver = (m, saidaId, quantidade, extra = {}) => request(app).post('/api/almoxarifado/devolucoes')
    .send({ material_id: m.id, quantidade, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId, ...extra });
  const lista = async (m, saidaId) => {
    const r = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${m.id}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.find((s) => s.id === saidaId);
  };
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q;
  const somaLote = async (m, lt) => (await dbGet(db,
    'SELECT COALESCE(SUM(quantidade), 0) q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id = ?', [m.id, lt])).q;
  const negativas = async (m) => (await dbGet(db,
    'SELECT COUNT(*) n FROM estoque_saldo_almoxarifado WHERE material_id = ? AND quantidade < 0', [m.id])).n;
  const series = async (m) => (await dbAll(db, 'SELECT status FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id]))
    .map((x) => x.status);

  function gancho(alvo, casa, n, mensagem) {
    return async (fn) => {
      const original = db[alvo];
      let vistos = 0; let disparou = false;
      db[alvo] = function (sql, params, cb) {
        if (typeof params === 'function') { cb = params; params = []; }
        if (!disparou && typeof sql === 'string' && casa(sql, params) && ++vistos === n) {
          disparou = true;
          setImmediate(() => cb.call({}, new Error(mensagem)));
          return this;
        }
        return original.call(db, sql, params, cb);
      };
      let res;
      try { res = await fn(); } finally { db[alvo] = original; }
      assert.ok(disparou, `gancho nao disparou: ${mensagem}`);
      return res;
    };
  }
  const comDebitoFalhando = gancho('get', (sql) => sql.includes('UPDATE estoque_saldo_almoxarifado') && sql.includes('RETURNING id'), 2,
    'falha forcada do debito do endereco (teste)');
  const comAuditoriaCancelamentoFalhando = gancho('run', (sql, p) => sql.includes('INSERT INTO auditoria_log_almoxarifado')
    && Array.isArray(p) && p.includes('CANCELAMENTO'), 1, 'falha forcada da auditoria CANCELAMENTO (teste)');

  console.log('\n=== Etapa 119 (T4): integracao — o que ja valeu nao se perde, e o que vem depois aceita ===\n');

  await test('(i) lote: saida falha no 2o endereco -> de novo 201 -> estorno com a auditoria falhando 200 -> o lote inteiro -> saida de 6 passa', async () => {
    const m = await material({ controle_lote: 1 });
    const A = await loc(); const B = await loc();
    await mov(m, { tipo: 'ENTRADA', quantidade: 3, lote: 'L1', localizacao_destino_id: A });
    await mov(m, { tipo: 'ENTRADA', quantidade: 3, lote: 'L1', localizacao_destino_id: B });
    const lt = (await dbGet(db, "SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = 'L1'", [m.id])).id;
    const falhou = await comDebitoFalhando(() => v2(m, { tipo: 'SAIDA', quantidade: 5, lote_id: lt }));
    assert.strictEqual(falhou.status, 500, JSON.stringify(falhou.body));
    assert.strictEqual(await somaLote(m, lt), 6, 'o lote perdeu o endereco ja debitado');
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 5, lote_id: lt });
    assert.strictEqual(await somaLote(m, lt), 1);
    const r = await comAuditoriaCancelamentoFalhando(() => estornar(saidaId));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await fisico(m), 6);
    assert.strictEqual(await somaLote(m, lt), 6);
    assert.strictEqual(await negativas(m), 0);
    const s6 = await v2(m, { tipo: 'SAIDA', quantidade: 6, lote_id: lt });
    assert.strictEqual(s6.status, 201, JSON.stringify(s6.body));
    assert.strictEqual(await fisico(m), 0);
    assert.strictEqual(await somaLote(m, lt), 0);
  });

  await test('(ii) series: duas devolucoes desfeitas da mesma saida -> estorno da saida -> estorno da entrada original 200 -> Entrada nova reativa', async () => {
    const m = await material({ controle_serie: 1 });
    const e1 = await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['J1', 'J2'] });
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const s1 = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: ids });
    for (let volta = 1; volta <= 2; volta++) {
      const s = await lista(m, s1);
      assert.strictEqual(s && s.saldo_devolvivel, 2, `volta ${volta}: a lista nao oferece a saida`);
      const d = await devolver(m, s1, 2, { series: ['J1', 'J2'] });
      assert.strictEqual(d.status, 201, `volta ${volta}: ${JSON.stringify(d.body)}`);
      assert.deepStrictEqual(await series(m), ['EM_ESTOQUE', 'EM_ESTOQUE']);
      const r = await estornar(await ultimo(m, 'ENTRADA_DEVOLUCAO'));
      assert.strictEqual(r.status, 200, `volta ${volta}: ${JSON.stringify(r.body)}`);
      assert.deepStrictEqual(await series(m), ['ENTREGUE', 'ENTREGUE']);
    }
    let r = await estornar(s1);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await fisico(m), 2);
    r = await estornar(e1);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await fisico(m), 0);
    assert.deepStrictEqual(await series(m), ['ESTORNADA', 'ESTORNADA']);
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['J1', 'J2'] });
    assert.strictEqual(await fisico(m), 2);
    assert.deepStrictEqual(await series(m), ['EM_ESTOQUE', 'EM_ESTOQUE']);
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
