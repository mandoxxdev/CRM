/**
 * Etapa 121 (C252; B784) — a Auditoria de um ato ja gravado nao derruba o ato: o helper `audit.registrarAuditoriaDoAto`.
 *
 * As portas que o usam tem cada uma o seu arquivo (`auditoriaDoAto{Requisicao,Recebimento,Cadastros,Sucata}.api.test.js`);
 * aqui, o helper (RN-09) e a guarda de que ele NAO foi espalhado onde a falha precisa abortar (RN-14: a Auditoria de serie
 * dentro do motor, antes do livro — o catch amplo do motor compensa, e a resposta de erro e a verdade).
 *
 * Executar: cd server && node tests/api/auditoriaDoAto.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const audit = require('../../services/almoxarifado/audit');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };

(async () => {
  const { app, db, close } = await createTestApp({ user: SUPER });

  /** O INSERT da Auditoria com `entidade`/`acao` falha uma vez. */
  async function comAuditoriaFalhando(entidade, acao, fn) {
    const original = db.run;
    let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && sql.includes('INSERT INTO auditoria_log_almoxarifado')
        && Array.isArray(params) && params[0] === entidade && params[2] === acao) {
        disparou = true;
        setImmediate(() => cb.call({}, new Error(`falha forcada da auditoria ${entidade}/${acao} (teste)`)));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res;
    try { res = await fn(); } finally { db.run = original; }
    assert.ok(disparou, `gancho da auditoria ${entidade}/${acao} nao disparou`);
    return res;
  }
  const linhas = async (entidade, acao) => (await dbGet(db,
    'SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade = ? AND acao = ?', [entidade, acao])).n;

  console.log('\n=== Etapa 121: a Auditoria do ato (C252) — o helper ===\n');

  await test('[RN-09] o helper grava a linha e resolve true; com o banco falhando resolve false, nao lanca, e o log diz', async () => {
    const ok = await audit.registrarAuditoriaDoAto(db, { entidade: 'teste121', entidade_id: 7, acao: 'GRAVA', usuario_id: 1 });
    assert.strictEqual(ok, true);
    assert.strictEqual(await linhas('teste121', 'GRAVA'), 1);
    const avisos = []; const warn = console.warn; console.warn = (...a) => avisos.push(a.join(' '));
    let r;
    try {
      r = await comAuditoriaFalhando('teste121', 'FALHA',
        () => audit.registrarAuditoriaDoAto(db, { entidade: 'teste121', entidade_id: 8, acao: 'FALHA' }));
    } finally { console.warn = warn; }
    assert.strictEqual(r, false);
    assert.strictEqual(await linhas('teste121', 'FALHA'), 0);
    assert.ok(avisos.some((l) => l.includes('[almoxarifado] auditoria do ato falhou (teste121 8, FALHA): falha forcada')),
      `o log nao registrou: ${JSON.stringify(avisos)}`);
    // E a de sempre continua fatal (quem precisa abortar usa ela).
    await assert.rejects(() => comAuditoriaFalhando('teste121', 'FATAL',
      () => audit.registrarAuditoria(db, { entidade: 'teste121', acao: 'FATAL' })), /falha forcada/);
  });

  await test('[RN-14] fica fatal de proposito: a Auditoria de serie dentro do motor, antes do livro -> 500, nada gravado', async () => {
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
      custo_unitario, ativo, controle_serie) VALUES ('ADA121-1', 'ADA121-1', 'PC', 0, 0, 10, 1, 1)`)).lastID;
    const entrada = () => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: id, tipo: 'ENTRADA',
      quantidade: 1, series: ['A1'], motivo: 'ada121', justificativa: 'ada121', documento_vinculado: 'NF-ADA121' });
    const r = await comAuditoriaFalhando('serie', 'CRIACAO', entrada);
    assert.strictEqual(r.status, 500, `a Auditoria de serie virou nao-fatal: ${r.status} ${JSON.stringify(r.body)}`);
    const est = await dbGet(db, `SELECT m.quantidade_atual f, (SELECT COUNT(*) FROM movimentacoes_almoxarifado WHERE material_id = m.id) l,
      (SELECT COUNT(*) FROM series_almoxarifado WHERE material_id = m.id AND status = 'EM_ESTOQUE') s
      FROM materiais_almoxarifado m WHERE m.id = ?`, [id]);
    assert.deepStrictEqual({ ...est }, { f: 0, l: 0, s: 0 }, 'o motor nao compensou');
    const r2 = await entrada();
    assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_atual f FROM materiais_almoxarifado WHERE id = ?', [id])).f, 1);
  });

  await test('[RN-14b] (Fase 5, r3) fica fatal: a Auditoria da REATIVACAO de serie (Entrada de serie Entregue) -> 500, nada gravado', async () => {
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
      custo_unitario, ativo, controle_serie) VALUES ('ADA121-2', 'ADA121-2', 'PC', 0, 0, 10, 1, 1)`)).lastID;
    const v2 = (b) => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: id, motivo: 'ada121',
      justificativa: 'ada121', documento_vinculado: 'NF-ADA121', ...b });
    assert.strictEqual((await v2({ tipo: 'ENTRADA', quantidade: 1, series: ['R1'] })).status, 201);
    const sid = (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ?', [id])).id;
    assert.strictEqual((await v2({ tipo: 'SAIDA', quantidade: 1, serie_ids: [sid] })).status, 201);
    const r = await comAuditoriaFalhando('serie', 'REATIVACAO', () => v2({ tipo: 'ENTRADA', quantidade: 1, series: ['R1'] }));
    assert.strictEqual(r.status, 500, `a Auditoria da reativacao virou nao-fatal: ${r.status} ${JSON.stringify(r.body)}`);
    const est = await dbGet(db, `SELECT m.quantidade_atual f, (SELECT status FROM series_almoxarifado WHERE id = ?) s,
      (SELECT COUNT(*) FROM movimentacoes_almoxarifado WHERE material_id = m.id) l FROM materiais_almoxarifado m WHERE m.id = ?`, [sid, id]);
    assert.deepStrictEqual({ ...est }, { f: 0, s: 'ENTREGUE', l: 2 }, 'o motor nao compensou');
    assert.strictEqual((await v2({ tipo: 'ENTRADA', quantidade: 1, series: ['R1'] })).status, 201);
  });

  await test('[RN-14c] (Fase 5, r3) fica fatal: a Auditoria da SAIDA de serie, antes do livro -> 500, nada gravado', async () => {
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
      custo_unitario, ativo, controle_serie) VALUES ('ADA121-3', 'ADA121-3', 'PC', 0, 0, 10, 1, 1)`)).lastID;
    const v2 = (b) => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: id, motivo: 'ada121',
      justificativa: 'ada121', documento_vinculado: 'NF-ADA121', ...b });
    assert.strictEqual((await v2({ tipo: 'ENTRADA', quantidade: 1, series: ['S1'] })).status, 201);
    const sid = (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ?', [id])).id;
    const r = await comAuditoriaFalhando('serie', 'SAIDA', () => v2({ tipo: 'SAIDA', quantidade: 1, serie_ids: [sid] }));
    assert.strictEqual(r.status, 500, `a Auditoria da saida de serie virou nao-fatal: ${r.status} ${JSON.stringify(r.body)}`);
    const est = await dbGet(db, `SELECT m.quantidade_atual f, (SELECT status FROM series_almoxarifado WHERE id = ?) s,
      (SELECT COUNT(*) FROM movimentacoes_almoxarifado WHERE material_id = m.id) l FROM materiais_almoxarifado m WHERE m.id = ?`, [sid, id]);
    assert.deepStrictEqual({ ...est }, { f: 1, s: 'EM_ESTOQUE', l: 1 }, 'o motor nao compensou');
    assert.strictEqual((await v2({ tipo: 'SAIDA', quantidade: 1, serie_ids: [sid] })).status, 201);
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
