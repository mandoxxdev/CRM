/**
 * Etapa 115 (Fase 5, revisor 3) — os cenarios que 10 sabotagens mostraram sem prova (S08, S15, S17, S20, S21, S25-S29, S31):
 * a fronteira da condicao do UPDATE, a ordem da releitura, a conta e o fisico da mensagem, e o PUT sem as chaves de controle.
 *
 * Executar: cd server && node tests/api/controleSobATravaSabotagem.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
// Etapa 193 (RN-193.02): PUT, DELETE e foto de /api/almoxarifado/materiais recusam para todos por padrao (o cadastro e so do
// Compras). Este arquivo prova o handler e as guardas que ficam ATRAS da recusa pela porta do almoxarifado (os perfis do
// almoxarifado, as guardas de estoque de quem pode), com a chave de reversao ligada (`ALMOX_CADASTRO_MATERIAL=liberado`,
// services/compras/cadastroDeMaterial.js) — sem ela nenhum desses gestos tem porta (letra C). A recusa: cadastroSoNoCompras.
process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const trava = require('../../services/almoxarifado/travaPorMaterial');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 300)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM_PERFIL = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const ini = (c, n, p) => `Desligar o controle por número de série no material ${c} exige a permissão "ajustar_estoque" (seu perfil: ${p}): há ${n} série(s) em estoque`;
const E1 = (c, n, p) => `${ini(c, n, p)}. Depois de desligar, a saída não baixa essas séries, e elas continuam "Em estoque" depois que o material sai. Peça ao Administrador do almoxarifado para desligar o controle.`;
const E1c = (c, n, f, k, p) => `${ini(c, n, p)} e o físico é ${f}. Peça ao Administrador do almoxarifado para baixar as ${k} que não estão mais no estoque (Lotes e Séries → Séries → Regularizar séries) e para desligar o controle.`;
const E4 = (c) => `O cadastro do material ${c} mudou enquanto era salvo — nada foi gravado. Recarregue o material e salve de novo.`;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `PRB-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, `Peca ${seq}`])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const lancar = async (m, body) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'prb',
      justificativa: 'preparo prb', documento_vinculado: 'NF-PRB', ...body });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const comSeries = async (nums) => { const m = await material({ controle_serie: 1 }); await lancar(m, { tipo: 'ENTRADA', quantidade: nums.length, series: nums }); return m; };
  const put = (u, id, body) => as(u, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send(body));
  const linha = (id) => dbGet(db, 'SELECT nome, controle_lote, controle_serie, familia_id, ativo, proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?', [id]);
  let injecoes = [];
  const getOriginal = db.get.bind(db);
  db.get = function (sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    const s = String(sql).replace(/\s+/g, ' ').trim();
    const i = injecoes.findIndex((inj) => inj.sql.test(s));
    if (i >= 0) {
      const inj = injecoes[i]; injecoes.splice(i, 1);
      return getOriginal(sql, params, (err, row) => { inj.depois().then(() => cb(err, row), (e) => cb(e)); });
    }
    return getOriginal(sql, params, cb);
  };
  const SQL_PRESENTES = /^SELECT quantidade_atual AS fisico, \(SELECT COUNT\(\*\) FROM series_almoxarifado sr WHERE/;
  const SQL_LEITURA = /^SELECT \* FROM materiais_almoxarifado WHERE id = \?$/;
  const SQL_FAMILIA = /^SELECT id, ativo, parent_id FROM familias_material_almoxarifado WHERE id = \?$/;
  const serie = (m, n) => dbRun(db, "INSERT INTO series_almoxarifado (material_id, numero, status) VALUES (?, ?, 'EM_ESTOQUE')", [m.id, n]);

  await test('P1 (S08) 1 serie cadastrada na janela: 403 E1 "ha 1", serie continua ligada', async () => {
    const m = await material({ controle_serie: 1, quantidade_atual: 1 });
    injecoes = [{ sql: SQL_PRESENTES, depois: () => serie(m, 'P1A') }];
    const r = await put(ALMOXARIFE, m.id, { controle_serie: 0 });
    assert.strictEqual(injecoes.length, 0);
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(m.codigo, 1, 'ALMOXARIFE'));
    assert.strictEqual((await linha(m.id)).controle_serie, 1);
  });

  await test('P2 (S17) fisico 5 com 2 series presentes (mais fisico que series): E1a "ha 2"', async () => {
    const m = await comSeries(['P2A', 'P2B']);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 5 WHERE id = ?', [m.id]);
    const r = await put(ALMOXARIFE, m.id, { controle_serie: 0 });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(m.codigo, 2, 'ALMOXARIFE'));
  });

  await test('P3 (S20) fisico 0.5 com 2 presentes: E1c "o fisico e 0.5", baixar 1', async () => {
    const m = await comSeries(['P3A', 'P3B']);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 0.5 WHERE id = ?', [m.id]);
    const r = await put(ALMOXARIFE, m.id, { controle_serie: 0 });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1c(m.codigo, 2, '0.5', 1, 'ALMOXARIFE'));
  });

  await test('P4 (S21) fisico 1.0000000001 (residuo) com 3 presentes: E1c "o fisico e 1", baixar 2', async () => {
    const m = await comSeries(['P4A', 'P4B', 'P4C']);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 1.0000000001 WHERE id = ?', [m.id]);
    const r = await put(ALMOXARIFE, m.id, { controle_serie: 0 });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1c(m.codigo, 3, '1', 2, 'ALMOXARIFE'));
  });

  await test('P5 (S25) releitura: liga lote + desliga serie, Entrada de 2 com serie sem lote na janela -> 403 da 112 (nao E1)', async () => {
    const m = await material({ controle_serie: 1 });
    injecoes = [{ sql: SQL_PRESENTES, depois: async () => {
      await serie(m, 'P5A'); await serie(m, 'P5B');
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 2 WHERE id = ?', [m.id]);
    } }];
    const r = await put(ALMOXARIFE, m.id, { controle_lote: 1, controle_serie: 0 });
    assert.strictEqual(injecoes.length, 0);
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.ok(/^Ligar o controle por lote no material/.test(r.body.error), r.body.error);
    const l = await linha(m.id);
    assert.strictEqual(l.controle_lote, 0); assert.strictEqual(l.controle_serie, 1);
  });

  await test('P6 (S26) releitura: desliga serie + troca familia; na janela 1 serie e a familia inativada -> 403 E1 (nao 400 da familia)', async () => {
    const f = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('FPRB6', 'Fam prb6', 1)")).lastID;
    const m = await material({ controle_serie: 1 });
    injecoes = [{ sql: SQL_FAMILIA, depois: async () => {
      await serie(m, 'P6A');
      await dbRun(db, 'UPDATE familias_material_almoxarifado SET ativo = 0 WHERE id = ?', [f]);
    } }];
    const r = await put(ALMOXARIFE, m.id, { familia_id: f, controle_serie: 0 });
    assert.strictEqual(injecoes.length, 0);
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.ok(r.body.error.startsWith(ini(m.codigo, 1, "ALMOXARIFE") + " e o físico é 0. Peça ao Administrador do almoxarifado para baixá-las"), r.body.error);
  });

  await test('P7 (S27) releitura: inativar + desligar serie; na janela Entrada de 1 com serie -> 400 de inativar (nao E1)', async () => {
    const m = await material({ controle_serie: 1 });
    injecoes = [{ sql: SQL_PRESENTES, depois: async () => {
      await serie(m, 'P7A');
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 1 WHERE id = ?', [m.id]);
    } }];
    const r = await put(ALMOXARIFE, m.id, { ativo: 0, controle_serie: 0 });
    assert.strictEqual(injecoes.length, 0);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(/^Não é possível inativar o material/.test(r.body.error), r.body.error);
    const l = await linha(m.id);
    assert.strictEqual(l.ativo, 1); assert.strictEqual(l.controle_serie, 1);
  });

  await test('P8 (S28) releitura: desliga serie; na janela 1 serie e o dono muda -> 409 do dono (nao E1)', async () => {
    const cli = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente PRB'])).lastID;
    const m = await material({ controle_serie: 1 });
    injecoes = [{ sql: SQL_PRESENTES, depois: async () => {
      await serie(m, 'P8A');
      await dbRun(db, 'UPDATE materiais_almoxarifado SET proprietario_cliente_id = ? WHERE id = ?', [cli, m.id]);
    } }];
    const r = await put(ALMOXARIFE, m.id, { controle_serie: 0 });
    assert.strictEqual(injecoes.length, 0);
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.ok(/^O dono do material/.test(r.body.error), r.body.error);
  });

  await test('P9 (S29) Administrador desliga com 2 presentes; outra aba inativa na janela -> 409 E4 (nao E1)', async () => {
    const m = await comSeries(['P9A', 'P9B']);
    injecoes = [{ sql: SQL_LEITURA, depois: () => dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [m.id]) }];
    const r = await put(ADM_PERFIL, m.id, { controle_serie: 0 });
    assert.strictEqual(injecoes.length, 0);
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E4(m.codigo));
    assert.strictEqual((await linha(m.id)).controle_serie, 1);
  });

  await test('P10 (S31) liga lote + desliga serie; 1 serie (sem fisico) cadastrada na janela -> 403 E1 "ha 1", serie ligada', async () => {
    const m = await material({ controle_serie: 1 });
    injecoes = [{ sql: SQL_PRESENTES, depois: () => serie(m, 'P10A') }];
    const r = await put(ALMOXARIFE, m.id, { controle_lote: 1, controle_serie: 0 });
    assert.strictEqual(injecoes.length, 0);
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.ok(r.body.error.startsWith(ini(m.codigo, 1, "ALMOXARIFE") + " e o físico é 0. Peça ao Administrador do almoxarifado para baixá-las"), r.body.error);
    const l = await linha(m.id);
    assert.strictEqual(l.controle_serie, 1); assert.strictEqual(l.controle_lote, 0);
  });

  await test('P11 (S15) renomear OMITINDO as chaves de controle (lote ligado) responde com a trava presa', async () => {
    const m = await material({ controle_lote: 1 });
    let soltar; let aberta; const abriu = new Promise((r) => { aberta = r; });
    const secao = trava.comLockDoMaterial(m.id, () => new Promise((r) => { soltar = r; aberta(); }));
    await abriu;
    try {
      setUser(ALMOXARIFE);
      const estado = { feito: false };
      const p = request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ nome: 'So nome' }).then((r) => { estado.feito = true; return r; });
      await espera(40); setUser(SUPER);
      await espera(150);
      assert.strictEqual(estado.feito, true, 'o renomear sem as chaves esperou a trava');
      soltar(); await secao; await p;
    } finally { if (soltar) soltar(); await secao; }
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
