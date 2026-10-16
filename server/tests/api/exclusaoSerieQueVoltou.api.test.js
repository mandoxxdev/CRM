/**
 * Etapa 120 (C251; B780) — a exclusao da requisicao cuja entrega teve as series de volta por uma Entrada.
 *
 * Achado da Fase 2 da 120 (revisor com sonda): a exclusao da requisicao desfaz cada Saida da entrega com uma ENTRADA. Quando as
 * series da Saida tinham voltado TODAS por uma Entrada avulsa (a reativacao apaga o vinculo com a saida), a exclusao nao achava
 * serie vinculada, tratava como dado legado e creditava a quantidade sem serie: fisico 4 com 2 series presentes, com a serie
 * ligada (anterior a 120) e com ela desligada (a C234 nesta porta). Desde a 120 a exclusao le a saida de onde a serie voltou
 * (a coluna da B779) e recusa.
 *
 * Executar: cd server && node tests/api/exclusaoSerieQueVoltou.api.test.js
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
const VOLTARAM = (nome) => `${nome}: as séries desta entrega já voltaram ao estoque por uma Entrada — excluir a requisição `
  + 'devolveria o saldo de novo. Encerre a requisição em vez de excluir.';

(async () => {
  const { app, db, close } = await createTestApp({ user: SUPER });
  let seq = 0;
  const v2 = (m, b) => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'esv120',
    justificativa: 'esv120', documento_vinculado: 'NF-ESV120', ...b });
  const ids = async (m) => (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id]))
    .map((x) => x.id);
  const estado = async (m) => ({
    fisico: (await dbGet(db, 'SELECT quantidade_atual f FROM materiais_almoxarifado WHERE id = ?', [m.id])).f,
    presentes: (await dbGet(db, "SELECT COUNT(*) n FROM series_almoxarifado WHERE material_id = ? AND status = 'EM_ESTOQUE'", [m.id])).n,
  });
  const ativa = async (req) => (await dbGet(db, 'SELECT COALESCE(ativo, 1) a FROM requisicoes_almoxarifado WHERE id = ?', [req])).a;

  /** Material com serie, Entrada V1 V2, requisicao Entregue cuja Saida (V1, V2) e da requisicao. */
  async function entregaDeDuasSeries() {
    seq += 1;
    const nome = `ESV120-${seq}`;
    const m = { id: (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
      custo_unitario, ativo, controle_serie) VALUES (?, ?, 'PC', 0, 0, 10, 1, 1)`, [nome, nome])).lastID, nome };
    assert.strictEqual((await v2(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] })).status, 201);
    const req = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'ENTREGUE')`, [`REQ-ESV120-${seq}`])).lastID;
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada, quantidade_separada,
      quantidade_entregue, quantidade_atendida) VALUES (?, ?, 2, 2, 2, 2)`, [req, m.id]);
    const s = await v2(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: await ids(m) });
    assert.strictEqual(s.status, 201, JSON.stringify(s.body));
    await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET requisicao_id = ? WHERE id = ?', [req, s.body.id]); // como a entrega
    return { m, req, saida: s.body.id };
  }
  const excluir = (req) => request(app).delete(`/api/almoxarifado/requisicoes/${req}`).send({ justificativa: 'esv120' });

  console.log('\n=== Etapa 120: a exclusao da requisicao cuja entrega teve as series de volta (C251) ===\n');

  await test('[RN-12] serie LIGADA, V1 e V2 voltaram por uma Entrada: excluir -> 400, fisico 2, a requisicao continua', async () => {
    const { m, req } = await entregaDeDuasSeries();
    assert.strictEqual((await v2(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] })).status, 201);
    const r = await excluir(req);
    assert.strictEqual(r.status, 400, `excluiu e creditou em dobro: ${JSON.stringify(r.body)} ${JSON.stringify(await estado(m))}`);
    assert.strictEqual(r.body.error, VOLTARAM(m.nome));
    assert.deepStrictEqual(await estado(m), { fisico: 2, presentes: 2 });
    assert.strictEqual(await ativa(req), 1);
  });

  await test('[RN-13] serie DESLIGADA depois, V1 e V2 voltaram: excluir -> 400 com a mesma literal, fisico 2', async () => {
    const { m, req } = await entregaDeDuasSeries();
    assert.strictEqual((await v2(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] })).status, 201);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_serie = 0 WHERE id = ?', [m.id]);
    const r = await excluir(req);
    assert.strictEqual(r.status, 400, `excluiu e creditou em dobro: ${JSON.stringify(r.body)} ${JSON.stringify(await estado(m))}`);
    assert.strictEqual(r.body.error, VOLTARAM(m.nome));
    assert.deepStrictEqual(await estado(m), { fisico: 2, presentes: 2 });
  });

  await test('[RN-14] nao regride: as series ainda fora -> excluir 200, fisico 2, V1 e V2 de volta', async () => {
    const { m, req } = await entregaDeDuasSeries();
    const r = await excluir(req);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await estado(m), { fisico: 2, presentes: 2 });
    assert.strictEqual(await ativa(req), 0);
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
