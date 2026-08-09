/**
 * Task 3b (extra, Etapa 6): liberacao de vencimento de lote para uso.
 *
 * A guarda de vencimento em stockService recusava SAIDA de lote vencido e mandava "liberar o
 * lote pela tela de lotes" — mas mudarStatusLote(..., 'ATIVO', ...) nao tem efeito nenhum sobre
 * isVencido (que so olha data_validade). Era uma parede com placa de porta (ver o achado do
 * review da Task 3). Esta suite cobre o caminho real: liberarVencimento registra QUEM/QUANDO/POR
 * QUE alguem assumiu usar um lote vencido, sem apagar o fato de que ele esta vencido.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };
// Sem role admin/perfil de almoxarife: getPerfilFromUser cai (via perfil_almoxarifado explicito
// aqui) em PRODUCAO, que nao tem `inspecionar` — mesmo perfil que ja nao pode bloquear/reprovar
// lote (Etapa 5). E assim que o 403 e testado.
const PRODUCAO = { id: 77, nome: 'Producao Teste', role: 'user', email: 'prod@test.com', perfil_almoxarifado: 'PRODUCAO' };
const JUST = { justificativa: 'teste de liberacao de vencimento' };

let seq = 0;
async function novoMaterial(db) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',0,1)`,
    [`VENCLIB-${seq}`, `Material vencimento liberacao ${seq}`]);
  return r.lastID;
}
async function entrar(db, materialId, loteId, qtd) {
  await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: materialId, tipo: 'ENTRADA', quantidade: qtd, lote_id: loteId, motivo: 'setup' });
}
async function loteVencido(db, materialId, codigo) {
  return lotService.criarOuObterLote(db, ADMIN, { material_id: materialId, codigo, data_validade: '2020-01-01' });
}
const saldoDoLote = (db, materialId, loteId) => dbGet(db,
  'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id IS ?', [materialId, loteId]);

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });

  await test('saida de lote vencido com vencimento liberado passa', async () => {
    const mat = await novoMaterial(db);
    const lote = await loteVencido(db, mat, 'VENC-OK');
    await entrar(db, mat, lote.id, 10);

    const lib = await request(app).put(`/api/almoxarifado/lotes/${lote.id}/liberar-vencimento`).send(JUST);
    assert.strictEqual(lib.status, 200, JSON.stringify(lib.body));

    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote_id: lote.id, ...JUST });

    assert.strictEqual((await saldoDoLote(db, mat, lote.id)).quantidade, 9);
  });

  await test('saida de lote vencido sem liberacao continua falhando', async () => {
    const mat = await novoMaterial(db);
    const lote = await loteVencido(db, mat, 'VENC-SEM-LIB');
    await entrar(db, mat, lote.id, 10);

    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote_id: lote.id, ...JUST }), /vencid/i,
      'sem o contraste, o teste anterior nao prova nada');
  });

  await test('liberar vencimento sem justificativa falha', async () => {
    const mat = await novoMaterial(db);
    const lote = await loteVencido(db, mat, 'VENC-SEM-JUST');
    const res = await request(app).put(`/api/almoxarifado/lotes/${lote.id}/liberar-vencimento`).send({});
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    const intacto = await lotService.getLote(db, lote.id);
    assert.strictEqual(intacto.vencimento_liberado_em, null, 'gravou liberacao mesmo sem justificativa');
  });

  await test('liberar vencimento de lote nao vencido falha', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'NAO-VENCIDO' });
    const res = await request(app).put(`/api/almoxarifado/lotes/${lote.id}/liberar-vencimento`).send(JUST);
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    const intacto = await lotService.getLote(db, lote.id);
    assert.strictEqual(intacto.vencimento_liberado_em, null, 'liberou vencimento de lote que nao estava vencido');
  });

  await test('liberacao nao destrava lote bloqueado', async () => {
    const mat = await novoMaterial(db);
    const lote = await loteVencido(db, mat, 'VENC-BLOQ');
    await entrar(db, mat, lote.id, 10);
    await lotService.mudarStatusLote(db, ADMIN, lote.id, 'BLOQUEADO', 'aguardando laudo');

    const lib = await request(app).put(`/api/almoxarifado/lotes/${lote.id}/liberar-vencimento`).send(JUST);
    assert.strictEqual(lib.status, 200, JSON.stringify(lib.body), 'a propria liberacao deveria funcionar mesmo com o lote bloqueado');

    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote_id: lote.id, ...JUST }),
      /bloquead/i, 'lote bloqueado E vencido, com vencimento liberado, tem de barrar por BLOQUEIO');
  });

  await test('liberacao e auditada com justificativa', async () => {
    const mat = await novoMaterial(db);
    const lote = await loteVencido(db, mat, 'VENC-AUDIT');
    await request(app).put(`/api/almoxarifado/lotes/${lote.id}/liberar-vencimento`)
      .send({ justificativa: 'uso emergencial aprovado pelo engenheiro' });

    const log = await dbGet(db,
      `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'lote' AND entidade_id = ? AND acao = 'LIBERACAO_VENCIMENTO' ORDER BY id DESC LIMIT 1`,
      [lote.id]);
    assert.ok(log, 'liberacao de vencimento nao foi auditada');
    assert.strictEqual(log.justificativa, 'uso emergencial aprovado pelo engenheiro');
  });

  await test('perfil sem permissao nao libera vencimento', async () => {
    const mat = await novoMaterial(db);
    const lote = await loteVencido(db, mat, 'VENC-403');
    setUser(PRODUCAO);
    try {
      const res = await request(app).put(`/api/almoxarifado/lotes/${lote.id}/liberar-vencimento`).send(JUST);
      assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    } finally { setUser(ADMIN); }
    const intacto = await lotService.getLote(db, lote.id);
    assert.strictEqual(intacto.vencimento_liberado_em, null, 'liberou apesar do 403');
  });

  await test('lote continua marcado como vencido depois da liberacao', async () => {
    const mat = await novoMaterial(db);
    const lote = await loteVencido(db, mat, 'VENC-PERSISTE');
    await request(app).put(`/api/almoxarifado/lotes/${lote.id}/liberar-vencimento`).send(JUST);

    const atualizado = await lotService.getLote(db, lote.id);
    assert.strictEqual(lotService.isVencido(atualizado), true, 'a liberacao apagou o fato de o lote estar vencido');
    assert.ok(atualizado.vencimento_liberado_em, 'nao gravou a liberacao');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
