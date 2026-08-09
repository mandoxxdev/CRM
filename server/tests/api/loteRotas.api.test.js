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

let seq = 0;
async function novoMaterial(db) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',0,1)`,
    [`ROT-${seq}`, `Material rota ${seq}`]);
  return r.lastID;
}
async function loteComSaldo(db, materialId, codigo, validade, qtd) {
  const lote = await lotService.criarOuObterLote(db, ADMIN, {
    material_id: materialId, codigo, data_validade: validade });
  await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: materialId, tipo: 'ENTRADA', quantidade: qtd, lote_id: lote.id, motivo: 'setup' });
  return lote;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('lotes vem em ordem FEFO, nulos por ultimo', async () => {
    const mat = await novoMaterial(db);
    await loteComSaldo(db, mat, 'TARDE', '2031-12-31', 10);
    await loteComSaldo(db, mat, 'SEM-VALIDADE', null, 10);
    await loteComSaldo(db, mat, 'CEDO', '2030-01-01', 10);

    const res = await request(app).get(`/api/almoxarifado/materiais/${mat}/lotes`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const codigos = res.body.map((l) => l.codigo);
    assert.deepStrictEqual(codigos, ['CEDO', 'TARDE', 'SEM-VALIDADE'], `ordem errada: ${codigos.join(',')}`);
  });

  await test('cada lote traz saldo e a flag de vencido', async () => {
    const mat = await novoMaterial(db);
    await loteComSaldo(db, mat, 'COM-SALDO', '2030-01-01', 42);
    await loteComSaldo(db, mat, 'JA-VENCEU', '2020-01-01', 7);

    const res = await request(app).get(`/api/almoxarifado/materiais/${mat}/lotes`);
    const porCodigo = Object.fromEntries(res.body.map((l) => [l.codigo, l]));
    assert.strictEqual(porCodigo['COM-SALDO'].saldo, 42);
    assert.strictEqual(porCodigo['COM-SALDO'].vencido, false);
    assert.strictEqual(porCodigo['COM-SALDO'].elegivel, true);
    assert.strictEqual(porCodigo['JA-VENCEU'].vencido, true);
    assert.strictEqual(porCodigo['JA-VENCEU'].elegivel, false);
  });

  await test('lote nao elegivel aparece, mas no fim da lista', async () => {
    const mat = await novoMaterial(db);
    const bloqueado = await loteComSaldo(db, mat, 'BLOQUEADO-1', '2029-01-01', 5);
    await lotService.mudarStatusLote(db, ADMIN, bloqueado.id, 'BLOQUEADO', 'aguardando ensaio');
    await loteComSaldo(db, mat, 'OK-1', '2032-01-01', 5);

    const res = await request(app).get(`/api/almoxarifado/materiais/${mat}/lotes`);
    const codigos = res.body.map((l) => l.codigo);
    assert.ok(codigos.includes('BLOQUEADO-1'), 'lote bloqueado sumiu da lista em vez de aparecer desabilitado');
    assert.strictEqual(codigos[codigos.length - 1], 'BLOQUEADO-1',
      'lote nao elegivel deveria ir para o fim, mesmo vencendo antes');
  });

  await test('mudar status pela rota exige justificativa', async () => {
    const mat = await novoMaterial(db);
    const lote = await loteComSaldo(db, mat, 'ROTA-STATUS', '2030-01-01', 5);
    const semJust = await request(app).put(`/api/almoxarifado/lotes/${lote.id}/status`)
      .send({ status: 'BLOQUEADO' });
    assert.strictEqual(semJust.status, 400, JSON.stringify(semJust.body));

    const ok = await request(app).put(`/api/almoxarifado/lotes/${lote.id}/status`)
      .send({ status: 'BLOQUEADO', justificativa: 'ensaio pendente' });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.strictEqual((await lotService.getLote(db, lote.id)).status, 'BLOQUEADO');
  });

  await test('perfil sem permissao nao muda status de lote', async () => {
    const mat = await novoMaterial(db);
    const lote = await loteComSaldo(db, mat, 'ROTA-PERM', '2030-01-01', 5);
    const ctx = await createTestApp({ user: { id: 9, nome: 'Producao', perfil_almoxarifado: 'PRODUCAO' } });
    const res = await request(ctx.app).put(`/api/almoxarifado/lotes/${lote.id}/status`)
      .send({ status: 'BLOQUEADO', justificativa: 'tentativa' });
    assert.strictEqual(res.status, 403);
    await ctx.close();
  });

  // ── Carry-forward da Task 3b (nao estava no brief original) ──
  // A liberacao de vencimento (lotService.liberarVencimento) foi entregue antes de existir
  // qualquer endpoint de listagem. Ela credencia a saida de consumo de um lote vencido sem
  // "desvencer" o lote (isVencido continua true) — a listagem precisa expor esse fato
  // (vencimento_liberado) e o calculo de elegivel precisa considera-lo, com a mesma ordem que
  // o motor ja usa em stockService: status primeiro (BLOQUEADO/REPROVADO nunca elegivel, mesmo
  // liberado), vencimento depois (vencido SEM liberacao nao elegivel; vencido COM liberacao, sim).
  await test('vencimento liberado aparece na listagem e destrava elegivel', async () => {
    const mat = await novoMaterial(db);
    const lote = await loteComSaldo(db, mat, 'VENC-LIB', '2020-01-01', 5);

    let res = await request(app).get(`/api/almoxarifado/materiais/${mat}/lotes`);
    let linha = res.body.find((l) => l.codigo === 'VENC-LIB');
    assert.strictEqual(linha.vencido, true);
    assert.strictEqual(linha.vencimento_liberado, false, 'nao deveria estar liberado ainda');
    assert.strictEqual(linha.elegivel, false, 'vencido sem liberacao nao e elegivel');

    await lotService.liberarVencimento(db, ADMIN, lote.id, 'uso emergencial aprovado');

    res = await request(app).get(`/api/almoxarifado/materiais/${mat}/lotes`);
    linha = res.body.find((l) => l.codigo === 'VENC-LIB');
    assert.strictEqual(linha.vencido, true, 'liberacao nao deveria desvencer o lote na listagem');
    assert.strictEqual(linha.vencimento_liberado, true, 'liberacao deveria aparecer na listagem');
    assert.strictEqual(linha.elegivel, true, 'vencido com liberacao deveria virar elegivel');
  });

  await test('bloqueado com vencimento liberado continua nao elegivel (status manda por cima)', async () => {
    const mat = await novoMaterial(db);
    const lote = await loteComSaldo(db, mat, 'VENC-BLOQ-LIB', '2020-01-01', 5);
    await lotService.liberarVencimento(db, ADMIN, lote.id, 'uso emergencial aprovado');
    await lotService.mudarStatusLote(db, ADMIN, lote.id, 'BLOQUEADO', 'aguardando laudo');

    const res = await request(app).get(`/api/almoxarifado/materiais/${mat}/lotes`);
    const linha = res.body.find((l) => l.codigo === 'VENC-BLOQ-LIB');
    assert.strictEqual(linha.vencimento_liberado, true, 'a liberacao em si deveria continuar valendo');
    assert.strictEqual(linha.elegivel, false, 'bloqueado nunca e elegivel, mesmo com vencimento liberado');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
