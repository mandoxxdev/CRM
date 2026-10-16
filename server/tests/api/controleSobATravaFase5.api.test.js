/**
 * Etapa 115 (Fase 5) — cenarios que a revisao adversarial achou sem prova ou errados.
 *
 * M2 (revisor 1): a guarda previa do desligar da serie nao relia o saldo de inativar — uma Entrada entre a leitura do
 * material e a contagem das series fazia a E1 (403) sair antes da recusa de inativar (400), invertendo a RN-07.
 *
 * Executar: cd server && node tests/api/controleSobATravaFase5.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 400)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `F115-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, `Peca ${seq}`])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const put = (u, id, body) => as(u, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send(body));
  const linha = (id) => dbGet(db, 'SELECT ativo, controle_serie FROM materiais_almoxarifado WHERE id = ?', [id]);

  let injecoes = [];
  const getOriginal = db.get.bind(db);
  db.get = function (sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    const s = String(sql).replace(/\s+/g, ' ').trim();
    const i = injecoes.findIndex((inj) => inj.sql.test(s));
    if (i >= 0) {
      const inj = injecoes[i]; injecoes.splice(i, 1);
      return inj.antes().then(() => getOriginal(sql, params, cb), (e) => cb(e));
    }
    return getOriginal(sql, params, cb);
  };
  const SQL_PRESENTES = /^SELECT quantidade_atual AS fisico, \(SELECT COUNT\(\*\) FROM series_almoxarifado sr WHERE/;

  await test('[M2] inativar + desligar a serie, com uma Entrada de 2 series antes da contagem: 400 de inativar, nao a E1', async () => {
    const m = await material({ controle_serie: 1 });
    injecoes = [{ sql: SQL_PRESENTES, antes: async () => {
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 2 WHERE id = ?', [m.id]);
      await dbRun(db, "INSERT INTO series_almoxarifado (material_id, numero, status) VALUES (?, 'M1', 'EM_ESTOQUE'), (?, 'M2', 'EM_ESTOQUE')",
        [m.id, m.id]);
    } }];
    const r = await put(ALMOXARIFE, m.id, { ativo: 0, controle_serie: 0 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(/^Não é possível inativar o material F115-\d+: o saldo físico é 2\./.test(r.body.error), r.body.error);
    assert.deepStrictEqual(await linha(m.id), { ativo: 1, controle_serie: 1 });
  });

  await test('[M2] controle: so desligar (sem inativar), mesma Entrada antes da contagem -> E1 "ha 2"', async () => {
    const m = await material({ controle_serie: 1 });
    injecoes = [{ sql: SQL_PRESENTES, antes: async () => {
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 2 WHERE id = ?', [m.id]);
      await dbRun(db, "INSERT INTO series_almoxarifado (material_id, numero, status) VALUES (?, 'N1', 'EM_ESTOQUE'), (?, 'N2', 'EM_ESTOQUE')",
        [m.id, m.id]);
    } }];
    const r = await put(ALMOXARIFE, m.id, { controle_serie: 0 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.ok(/há 2 série\(s\) em estoque\. Depois de desligar/.test(r.body.error), r.body.error);
  });

  // ── Revisor 2 (achado 2, B750): o Administrador nao regrava calado o controle que outra aba mudou ─────────────────
  const SQL_LEITURA = /^SELECT \* FROM materiais_almoxarifado WHERE id = \?$/;
  const E4 = (codigo) => `O cadastro do material ${codigo} mudou enquanto era salvo — nada foi gravado. Recarregue o material `
    + 'e salve de novo.';
  // gancho que roda DEPOIS da leitura (a mudanca da outra aba cai entre a leitura do PUT e o UPDATE dele)
  const depoisDaLeitura = (filtro, depois) => {
    const estado = { armado: true };
    const original = db.get;
    db.get = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (estado.armado && SQL_LEITURA.test(String(sql).replace(/\s+/g, ' ').trim()) && filtro(params)) {
        estado.armado = false;
        return original.call(db, sql, params, (err, row) => { depois().then(() => cb(err, row), cb); });
      }
      return original.call(db, sql, params, cb);
    };
    estado.soltar = () => { db.get = original; };
    return estado;
  };

  await test('[B750] o Administrador renomeia (le a serie desligada) e outra aba liga a serie na janela: 409 E4, o ligar fica', async () => {
    const m = await material();
    const g = depoisDaLeitura((p) => Number(p[0]) === m.id,
      () => dbRun(db, 'UPDATE materiais_almoxarifado SET controle_serie = 1 WHERE id = ?', [m.id]));
    try {
      const r = await put(SUPER, m.id, { nome: 'Renomeado', controle_lote: 0, controle_serie: 0 });
      assert.strictEqual(g.armado, false, 'gancho nao disparou');
      assert.strictEqual(r.status, 409, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, E4(m.codigo));
      assert.deepStrictEqual(await linha(m.id), { ativo: 1, controle_serie: 1 });
    } finally {
      g.soltar();
    }
  });

  // ── Revisor 2 (achado 1): o estorno de Saida com serie cruzando o desligar do Almoxarife ────────────────────────
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const dbAllP = (sql, p) => new Promise((res, rej) => db.all(sql, p, (err, rows) => (err ? rej(err) : res(rows))));
  await test('[R2-F5] estorno de Saida com serie com o desligar do Almoxarife no meio: nunca serie desligada com series Em estoque', async () => {
    const m = await material({ controle_serie: 1 });
    const mov = (body) => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'f5',
      justificativa: 'f5 e115', documento_vinculado: 'NF-F5', ...body });
    const e = await mov({ tipo: 'ENTRADA', quantidade: 2, series: ['T1', 'T2'] });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
    const ids = (await dbAllP('SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const sai = await mov({ tipo: 'SAIDA', quantidade: 2, serie_ids: ids });
    assert.strictEqual(sai.status, 201, JSON.stringify(sai.body));
    const saidaId = (await dbAllP("SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA'", [m.id]))[0].id;
    // a leitura do material pelo estorno (fora da trava) dispara o desligar do Almoxarife e espera 80 ms
    const estado = {};
    const g = depoisDaLeitura((p) => Number(p[0]) === m.id, async () => {
      setUser(ALMOXARIFE);
      estado.put = request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ controle_serie: 0 });
      estado.put.then(() => {}, () => {});
      await espera(80);
      setUser(SUPER);
    });
    let est;
    try {
      est = await request(app).post(`/api/almoxarifado/movimentacoes/${saidaId}/cancelar`).send({ motivo: 'estorno da saida f5' });
    } finally {
      g.soltar();
    }
    assert.strictEqual(g.armado, false, 'gancho nao disparou');
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));
    const p = await estado.put;
    assert.strictEqual(p.status, 200, JSON.stringify(p.body)); // o desligar caiu antes das series voltarem (0 presentes)
    const pres = (await dbAllP(`SELECT COUNT(*) n FROM series_almoxarifado WHERE material_id = ?
      AND status IN ('EM_ESTOQUE','BLOQUEADA')`, [m.id]))[0].n;
    assert.strictEqual((await linha(m.id)).controle_serie, 0);
    assert.strictEqual(pres, 0, 'o estorno devolveu as series a Em estoque num material de serie desligada (C225 pelo estorno)');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
