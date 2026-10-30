/**
 * Etapa 110 — Fase 5 (revisor fresco, lente "este teste passaria com a feature quebrada?"): 45 sabotagens, 13 verdes,
 * 11 por falta de assercao. Estes nove cenarios fecham as que tinham cenario (P1..P9 do relatorio do revisor); cada um
 * passa no codigo e cai com a sabotagem dele (controle refeito no fechamento).
 *  P1 condicao da familia so na 1a tentativa do codigo_auto   P2 a familia vira subfamilia na janela
 *  P3 a sub muda de pai na janela                             P4 PUT troca familia E sub juntas (caso feliz)
 *  P5 familia com sub INATIVA inativa de fato                 P6 E1 depois do schema
 *  P7/P8 RN-01/RN-02 pelo saldo arredondado                   P9 a compensacao apaga tambem o saldo por localizacao
 * Executar: cd server && node tests/api/saldoInicialFamiliaFase5.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
// Etapa 193 Fase 5 (R3b): o POST /api/almoxarifado/materiais so aceita, por padrao, o formato da sobra e da remessa (codigo,
// nome, unidade, familia/subfamilia, categoria, proprietario) — o resto do cadastro e no Compras. Este arquivo cria material
// com o cadastro completo (controles, saldo inicial, campos tecnicos) pela porta do almoxarifado para provar o handler, com a
// chave de reversao ligada (`ALMOX_CADASTRO_MATERIAL=liberado`, services/compras/cadastroDeMaterial.js). A recusa:
// cadastroSoNoCompras.
process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const materialService = require('../../services/almoxarifado/materialService');

let passed = 0; let failed = 0;
const only = process.argv.slice(2);
function test(id, name, fn) {
  if (only.length && !only.includes(id)) return Promise.resolve();
  return fn().then(() => { passed++; console.log(`  ✓ ${id} ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${id} ${name}: ${e.message}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ENGENHARIA = { id: 6, nome: 'Eng Teste', role: 'user', email: 'eng@test.com', perfil_almoxarifado: 'ENGENHARIA' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const L_FAM_INATIVA = 'Família inativa — não é possível vincular novos itens';
const L_SUB = 'Subfamília inválida para a família selecionada';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  let seq = 0;
  const familia = async (ativo = 1, parentId = null) => {
    seq += 1;
    return (await dbRun(db, 'INSERT INTO familias_material_almoxarifado (codigo, nome, ativo, parent_id) VALUES (?, ?, ?, ?)',
      [`R2-${seq}`, `Familia R2 ${seq}`, ativo, parentId])).lastID;
  };
  const corpo = (familiaId, extra = {}) => {
    seq += 1;
    return { codigo: `R2C-${seq}`, nome: `Cad R2 ${seq}`, unidade: 'PC', categoria: 'OUTROS', familia_id: familiaId, ...extra };
  };
  const ativosNa = async (id) => (await dbGet(db, `SELECT COUNT(*) AS n FROM materiais_almoxarifado
    WHERE (familia_id = ? OR subfamilia_id = ?) AND ativo = 1`, [id, id])).n;
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };

  // injecao na janela, como em familiaMaterialCorrida
  let injecoes = [];
  const getOriginal = db.get.bind(db);
  db.get = function (sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    const s = String(sql).replace(/\s+/g, ' ').trim();
    const i = injecoes.findIndex((inj) => inj.sql.test(s));
    if (i >= 0) {
      const inj = injecoes[i]; injecoes.splice(i, 1);
      const ler = () => getOriginal(sql, params, (err, row) => {
        if (!inj.depois) return cb(err, row);
        inj.depois().then(() => cb(err, row), (e) => cb(e));
      });
      if (inj.antes) return inj.antes().then(ler, (e) => cb(e));
      return ler();
    }
    return getOriginal(sql, params, cb);
  };
  const SQL_CONF_FAMILIA = /^SELECT id, ativo, parent_id FROM familias_material_almoxarifado WHERE id = \?$/;
  const SQL_CONF_SUB = /^SELECT id FROM familias_material_almoxarifado WHERE id = \? AND parent_id = \? AND ativo = 1$/;
  const SQL_PROXIMO = /^SELECT codigo FROM familias_material_almoxarifado WHERE id = \?$/;

  await test('P1', 'codigo_auto: colisao na 1a tentativa e familia inativada antes da 2a -> 400 literal, nada gravado', async () => {
    const f = await familia();
    const primeiro = corpo(f);
    assert.strictEqual((await request(app).post('/api/almoxarifado/materiais').send(primeiro)).status, 201);
    injecoes = [{ sql: SQL_PROXIMO, antes: () => dbRun(db, 'UPDATE familias_material_almoxarifado SET ativo = 0 WHERE id = ?', [f]) }];
    const r = await request(app).post('/api/almoxarifado/materiais').send({ ...corpo(f), codigo: primeiro.codigo, codigo_auto: true });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_FAM_INATIVA);
    assert.strictEqual(await ativosNa(f), 1, 'so o primeiro');
  });

  await test('P2', 'POST: familia vira subfamilia na janela -> 400 FAMILIA_E_SUBFAMILIA, nada gravado', async () => {
    const f = await familia(); const g = await familia();
    const b = corpo(f);
    injecoes = [{ sql: SQL_CONF_FAMILIA, depois: () => dbRun(db, 'UPDATE familias_material_almoxarifado SET parent_id = ? WHERE id = ?', [g, f]) }];
    const r = await request(app).post('/api/almoxarifado/materiais').send(b);
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, materialService.FAMILIA_E_SUBFAMILIA);
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM materiais_almoxarifado WHERE codigo = ?', [b.codigo])).n, 0);
  });

  await test('P3', 'POST: subfamilia muda de pai na janela -> 400 L_SUB, nada gravado', async () => {
    const f = await familia(); const f2 = await familia(); const sub = await familia(1, f);
    const b = corpo(f, { subfamilia_id: sub });
    injecoes = [{ sql: SQL_CONF_SUB, depois: () => dbRun(db, 'UPDATE familias_material_almoxarifado SET parent_id = ? WHERE id = ?', [f2, sub]) }];
    const r = await request(app).post('/api/almoxarifado/materiais').send(b);
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_SUB);
  });

  await test('P4', 'PUT material troca familia E subfamilia juntas (caso feliz) -> 200 e as duas gravadas', async () => {
    const fa = await familia(); const fb = await familia(); const sb = await familia(1, fb);
    const m = (await request(app).post('/api/almoxarifado/materiais').send(corpo(fa))).body.id;
    const r = await request(app).put(`/api/compras/materiais/cadastro/${m}`).send({ familia_id: fb, subfamilia_id: sb });
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    const row = await dbGet(db, 'SELECT familia_id, subfamilia_id FROM materiais_almoxarifado WHERE id = ?', [m]);
    assert.deepStrictEqual([row.familia_id, row.subfamilia_id], [fb, sb]);
  });

  await test('P5', 'familia com subfamilia INATIVA (e sem material): DELETE e PUT {ativo:0} inativam de fato', async () => {
    const f = await familia(); await familia(0, f);
    const r = await request(app).delete(`/api/almoxarifado/familias/${f}`);
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(r.body, { success: true });
    assert.strictEqual(Number((await dbGet(db, 'SELECT ativo a FROM familias_material_almoxarifado WHERE id = ?', [f])).a), 0);
    const g = await familia(); await familia(0, g);
    const r2 = await request(app).put(`/api/almoxarifado/familias/${g}`).send({ nome: 'G R2', ativo: 0 });
    assert.strictEqual(r2.status, 200, `${r2.status} ${JSON.stringify(r2.body)}`);
    assert.strictEqual(Number((await dbGet(db, 'SELECT ativo a FROM familias_material_almoxarifado WHERE id = ?', [g])).a), 0);
  });

  await test('P6', 'E1 depois do schema: Engenharia com saldo e corpo invalido (sem nome) -> 400 do schema, nao 403', async () => {
    const f = await familia();
    const r = await as(ENGENHARIA, () => request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: `R2X-${seq}`, unidade: 'PC', familia_id: f, quantidade_atual: 5 }));
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
  });

  await test('P7', 'RN-02 decide pelo saldo arredondado: 1e-7 com controle_lote -> 201, livro vazio', async () => {
    const f = await familia();
    const r = await as(ALMOXARIFE, () => request(app).post('/api/almoxarifado/materiais').send(corpo(f, { quantidade_atual: 0.0000001, controle_lote: true })));
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ?', [r.body.id])).n, 0);
  });

  await test('P8', 'RN-01 decide pelo saldo arredondado: Engenharia com 1e-7 -> 201', async () => {
    const f = await familia();
    const r = await as(ENGENHARIA, () => request(app).post('/api/almoxarifado/materiais').send(corpo(f, { quantidade_atual: 0.0000001 })));
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
  });

  await test('P9', 'RN-04: o motor falha DEPOIS de mexer no saldo por localizacao -> nada sobra (material, saldo, livro)', async () => {
    const f = await familia();
    const loc = (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?, 'P9', 1)", [`R2L-${seq}`])).lastID;
    const b = corpo(f, { quantidade_atual: 3, localizacao_padrao_id: loc });
    const runOriginal = db.run;
    let falhou = false;
    db.run = function (sql, ...rest) {
      if (!falhou && /INSERT INTO movimentacoes_almoxarifado/.test(String(sql))) {
        falhou = true;
        const cb = rest.find((x) => typeof x === 'function');
        setImmediate(() => cb.call({}, new Error('falha injetada no livro')));
        return this;
      }
      return runOriginal.call(this, sql, ...rest);
    };
    let erro = null;
    try { await materialService.createMaterial(db, ALMOXARIFE, b); } catch (e) { erro = e; } finally { db.run = runOriginal; }
    assert.ok(falhou, 'injecao nao rodou');
    assert.ok(erro, 'nao lancou');
    const mat = await dbGet(db, 'SELECT id FROM materiais_almoxarifado WHERE codigo = ?', [b.codigo]);
    const saldo = await dbGet(db, `SELECT COUNT(*) n FROM estoque_saldo_almoxarifado WHERE material_id NOT IN (SELECT id FROM materiais_almoxarifado)`);
    assert.strictEqual(mat, undefined, `material sobrou (erro ${erro.message})`);
    assert.strictEqual(saldo.n, 0, 'linha de saldo orfa');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
