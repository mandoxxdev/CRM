/**
 * Series de numero (Etapa 6b, Task 1) — tabela + seriesService (leitura e entrada).
 * Constrói séries EM_ESTOQUE ou BLOQUEADA sobre CRIACAO/REATIVACAO, com guarda de duplicata
 * e desfazimento atomico de efeitos (nao ha transacao SQLite, compensacao explicita). Cada
 * serie e uma unidade fisica (nao existe quantidade em series); saldo agregado continua
 * em materiais_almoxarifado.quantidade_atual. Auditoria com entidade='serie'.
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const seriesService = require('../../services/almoxarifado/seriesService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db, { controle_serie = 1, qtd = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_serie)
     VALUES (?,?,'UN',?,1,?)`, [`MAT-SER-${seq}`, `Material serie ${seq}`, qtd, controle_serie ? 1 : 0]);
  return r.lastID;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('entradaSeries cria N series EM_ESTOQUE e devolve as acoes', async () => {
    const mat = await novoMaterial(db);
    const afetadas = await seriesService.entradaSeries(db, ADMIN, {
      material_id: mat, numeros: ['SN-1', 'SN-2'],
    });
    assert.strictEqual(afetadas.length, 2);
    assert.strictEqual(afetadas[0].acao, 'CRIACAO');
    const linha = await dbGet(db, 'SELECT * FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [mat, 'SN-1']);
    assert.strictEqual(linha.status, 'EM_ESTOQUE');
  });

  await test('entrada de serie ja em estoque falha sem efeito nas demais', async () => {
    const mat = await novoMaterial(db);
    await seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-DUP'] });
    await assert.rejects(
      () => seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-NOVA', 'SN-DUP'] }),
      (e) => /ja esta em estoque/.test(e.message) && e.status === 400
    );
    // compensacao: a SN-NOVA criada antes da falha nao pode sobrar
    const sobra = await dbGet(db, 'SELECT 1 AS x FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [mat, 'SN-NOVA']);
    assert.strictEqual(sobra, undefined);
  });

  await test('numeros repetidos na propria lista falham antes de qualquer efeito', async () => {
    const mat = await novoMaterial(db);
    await assert.rejects(
      () => seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-X', 'SN-X'] }),
      (e) => /repetid/.test(e.message)
    );
  });

  await test('reativacao: serie ENTREGUE volta a EM_ESTOQUE na reentrada', async () => {
    const mat = await novoMaterial(db);
    await seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-R'] });
    await dbRun(db, "UPDATE series_almoxarifado SET status = 'ENTREGUE' WHERE material_id = ? AND numero = ?", [mat, 'SN-R']);
    const afetadas = await seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-R'] });
    assert.strictEqual(afetadas[0].acao, 'REATIVACAO');
    assert.strictEqual(afetadas[0].linha.status, 'EM_ESTOQUE');
  });

  await test('listarSeriesDoMaterial filtra por status e traz lote_codigo', async () => {
    const mat = await novoMaterial(db);
    await seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-L1', 'SN-L2'] });
    await dbRun(db, "UPDATE series_almoxarifado SET status = 'BLOQUEADA' WHERE material_id = ? AND numero = ?", [mat, 'SN-L2']);
    const todas = await seriesService.listarSeriesDoMaterial(db, mat);
    assert.strictEqual(todas.length, 2);
    const soEstoque = await seriesService.listarSeriesDoMaterial(db, mat, { status: 'EM_ESTOQUE' });
    assert.strictEqual(soEstoque.length, 1);
    assert.strictEqual(soEstoque[0].numero, 'SN-L1');
  });

  await test('auditoria: criacao grava entidade=serie', async () => {
    const mat = await novoMaterial(db);
    await seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-A'] });
    const aud = await dbGet(db, "SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'serie' AND acao = 'CRIACAO' ORDER BY id DESC LIMIT 1");
    assert.ok(aud, 'auditoria de criacao de serie ausente');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
