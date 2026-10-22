/**
 * Etapa 178 (Fase 5, revisao adversarial — importantes 2 e 3, menores M1 e M3): o que acontece entre a saida do estoque e a
 * gravacao da entrega de EPI, e o que a resposta diz quando nao da para desfazer.
 *
 *  - P3 (reproduzido): uma devolucao que cite a saida, gravada na janela entre a saida e a transacao da entrega, deixava a entrega
 *    ser gravada (201) com o material de volta no estoque. Agora o INSERT da entrega tem `NOT EXISTS` de devolucao viva (a regua
 *    de devolucaoViva.js) e a entrega cai na compensacao — que tambem respeita a devolucao (`semDevolucaoViva`: estornar a saida
 *    com a devolucao viva contaria o material duas vezes, 11 com 10 de verdade) e, nao podendo desfazer, diz que a saida ficou.
 *  - P4 (reproduzido): a compensacao que falhava respondia "a saida do estoque foi desfeita" — mentira. Agora: desfeita -> "nada
 *    foi gravado ... Pode tentar de novo"; nao desfeita -> 500 dizendo que a saida FICOU registrada sem evidencia, com o numero da
 *    movimentacao, e o PNG da assinatura PRESERVADO no disco.
 *  - M1: o caminho do 409 so vale se a saida terminou de fato estornada (claim + `movimento_estorno_id`); senao, compensacao.
 *  - M3: depois do COMMIT o PNG nunca e apagado (a evidencia gravada aponta para ele).
 *
 * Executar: cd server && node tests/api/epiCompensacao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { wrapDatabase } = require('../../services/sqliteConcurrency');
const stockService = require('../../services/almoxarifado/stockService');
const returnService = require('../../services/almoxarifado/returnService');
const epiService = require('../../services/almoxarifado/epiService');

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

let passed = 0; let failed = 0;
let antesDeCada = async () => {};
async function test(name, fn) {
  try { await antesDeCada(); await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${String(e && e.message).replace(/\s*\n\s*/g, ' ').slice(0, 800)}`);
  }
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
let seq = 0;

(async () => {
  const t = await createTestApp({ user: ADMIN });
  const { app, db, uploadsAlmoxDir } = t;
  wrapDatabase(db);

  const arquivosEpi = () => (fs.existsSync(uploadsAlmoxDir)
    ? fs.readdirSync(uploadsAlmoxDir).filter((f) => f.startsWith('assinatura-epi-')) : []);
  const limparDisco = () => { for (const f of arquivosEpi()) fs.unlinkSync(path.join(uploadsAlmoxDir, f)); };
  const saldo = async (id) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [id])).q;
  const contar = async (sql, p = []) => (await dbGet(db, sql, p)).n;
  const origCancelar = stockService.cancelarMovimentacao;
  antesDeCada = async () => {
    limparDisco();
    epiService.ganchos.antesDaGravacao = null;
    epiService.ganchos.depoisDaGravacao = null;
    stockService.cancelarMovimentacao = origCancelar;
  };

  async function criarEpi(qtd = 10) {
    seq += 1;
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, categoria, quantidade_atual, ativo, ca_numero, ca_validade)
      VALUES (?, ?, 'EPIs', 0, 1, 'CA-1', '2099-01-01')`, [`EPI-K-${seq}`, `Luva ${seq}`]);
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: r.lastID, tipo: 'ENTRADA', quantidade: qtd, justificativa: 'carga' });
    return r.lastID;
  }
  async function criarColaborador() {
    seq += 1;
    const r = await dbRun(db, "INSERT INTO colaboradores (nome, matricula, cpf, status, setor) VALUES (?,?,?,'ativo','X')",
      [`COL ${seq}`, `MK${seq}`, String(10000000000 + seq)]);
    return { id: r.lastID, matricula: `MK${seq}` };
  }
  const post = (col, materialId, quantidade = 1) => request(app).post('/api/almoxarifado/epi/entregas')
    .field('colaborador_id', String(col.id)).field('material_id', String(materialId)).field('quantidade', String(quantidade))
    .field('confirmacao_matricula', col.matricula)
    .attach('assinatura', PNG_1PX, { filename: 'a.png', contentType: 'image/png' });

  // ── Item 2 (P3) ─────────────────────────────────────────────────────────────────────────────
  await test('[P3] devolucao que cita a saida, gravada na janela -> a entrega NAO e gravada; a saida fica (estorna-la contaria em dobro); 500 diz que ficou sem evidencia; PNG preservado; saldo 10', async () => {
    const m = await criarEpi(10);
    const c = await criarColaborador();
    let dev = null; let movId = null;
    epiService.ganchos.antesDaGravacao = async ({ movimentacaoId }) => {
      movId = movimentacaoId;
      dev = await returnService.registrarDevolucao(db, ADMIN, { material_id: m, quantidade: 1, motivo: 'SOBRA', condicao: 'BOA',
        destino: 'ESTOQUE', movimentacao_saida_id: movimentacaoId });
    };
    const r = await post(c, m);
    assert.ok(dev, 'a devolucao no meio nao foi gravada (o cenario nao aconteceu)');
    assert.strictEqual(r.status, 500, JSON.stringify(r.body));
    assert.match(r.body.error, new RegExp(`a movimentação #${movId} \\(EPI-[0-9A-Z]+\\) ficou registrada sem evidência de entrega`));
    assert.match(r.body.error, /NÃO pôde ser desfeita/);
    assert.strictEqual(await contar('SELECT COUNT(*) n FROM entregas_epi_almoxarifado WHERE material_id = ?', [m]), 0, 'a entrega foi gravada com a devolucao');
    const mov = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [movId]);
    assert.strictEqual(Number(mov.cancelado || 0), 0, 'a compensacao estornou a saida com a devolucao viva');
    assert.strictEqual(await saldo(m), 10, 'o fisico nao bate (10 - 1 saida + 1 devolucao)');
    assert.strictEqual(arquivosEpi().length, 1, 'o PNG da assinatura foi apagado');
  });

  // ── Item 3 (P4) ─────────────────────────────────────────────────────────────────────────────
  await test('[P4] a transacao falha e a compensacao TAMBEM -> 500 dizendo que a saida ficou registrada sem evidencia (com o numero da movimentacao), PNG preservado, saldo 9', async () => {
    const m = await criarEpi(10);
    const c = await criarColaborador();
    let movId = null;
    epiService.ganchos.antesDaGravacao = async ({ movimentacaoId }) => {
      movId = movimentacaoId;
      stockService.cancelarMovimentacao = async () => { throw new Error('SQLITE_BUSY simulado'); };
      throw new Error('falha da gravacao simulada');
    };
    const r = await post(c, m);
    assert.strictEqual(r.status, 500, JSON.stringify(r.body));
    assert.ok(!/foi desfeita/.test(r.body.error), `a mensagem ainda diz que desfez: ${r.body.error}`);
    assert.match(r.body.error, new RegExp(`^Não foi possível gravar a entrega de EPI e a saída do estoque NÃO pôde ser desfeita: a movimentação #${movId} `));
    assert.match(r.body.error, /A assinatura foi preservada no servidor/);
    assert.match(r.body.error, /falha da gravacao simulada/);
    assert.match(r.body.error, /SQLITE_BUSY simulado/);
    assert.strictEqual(await saldo(m), 9);
    assert.strictEqual(arquivosEpi().length, 1, 'o PNG da assinatura foi apagado');
  });

  await test('[item 3] a transacao falha e a compensacao desfaz -> 500 "nada foi gravado ... Pode tentar de novo", saldo de volta, PNG apagado', async () => {
    const m = await criarEpi(10);
    const c = await criarColaborador();
    epiService.ganchos.antesDaGravacao = async () => { throw new Error('falha da gravacao simulada'); };
    const r = await post(c, m);
    assert.strictEqual(r.status, 500, JSON.stringify(r.body));
    assert.strictEqual(r.body.error,
      'Não foi possível gravar a entrega de EPI — nada foi gravado: a saída do estoque foi desfeita. Pode tentar de novo. (falha da gravacao simulada)');
    assert.strictEqual(await saldo(m), 10);
    assert.deepStrictEqual(arquivosEpi(), []);
  });

  // ── M1 ──────────────────────────────────────────────────────────────────────────────────────
  await test('[M1] a saida com o claim provisorio (cancelado = 1 sem movimento_estorno_id) -> NAO e o 409 "nada foi gravado": compensacao, que falha -> 500 com a saida sem evidencia', async () => {
    const m = await criarEpi(10);
    const c = await criarColaborador();
    let movId = null;
    epiService.ganchos.antesDaGravacao = async ({ movimentacaoId }) => {
      movId = movimentacaoId;
      await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET cancelado = 1 WHERE id = ?', [movimentacaoId]);
    };
    let r;
    try { r = await post(c, m); } finally {
      if (movId) await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET cancelado = 0 WHERE id = ?', [movId]);
    }
    assert.strictEqual(r.status, 500, JSON.stringify(r.body));
    assert.match(r.body.error, new RegExp(`a movimentação #${movId} \\(EPI-[0-9A-Z]+\\) ficou registrada sem evidência de entrega`));
    assert.strictEqual(arquivosEpi().length, 1, 'o PNG da assinatura foi apagado');
  });

  await test('[M1] estorno CONCLUIDO no meio -> continua o 409 literal "nada foi gravado" e o PNG apagado', async () => {
    const m = await criarEpi(10);
    const c = await criarColaborador();
    let numero = null;
    epiService.ganchos.antesDaGravacao = async (info) => {
      numero = info.numero;
      await stockService.cancelarMovimentacao(db, ADMIN, info.movimentacaoId, 'estorno no meio');
    };
    const r = await post(c, m);
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error,
      `A saída da entrega ${numero} foi estornada enquanto a entrega era gravada — nada foi gravado. Faça a entrega de novo.`);
    assert.strictEqual(await saldo(m), 10);
    assert.deepStrictEqual(arquivosEpi(), []);
  });

  // ── M3 ──────────────────────────────────────────────────────────────────────────────────────
  await test('[M3] erro DEPOIS do COMMIT -> 500 que manda conferir a ficha; a entrega esta gravada e integra; o PNG NAO e apagado', async () => {
    const m = await criarEpi(10);
    const c = await criarColaborador();
    let numero = null;
    epiService.ganchos.depoisDaGravacao = async (info) => { numero = info.numero; throw new Error('queda depois do commit'); };
    const r = await post(c, m);
    assert.strictEqual(r.status, 500, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `A entrega ${numero} foi gravada, mas a resposta falhou (queda depois do commit) — `
      + 'confira a ficha do colaborador antes de entregar de novo.');
    const e = await dbGet(db, 'SELECT id FROM entregas_epi_almoxarifado WHERE numero = ?', [numero]);
    assert.ok(e, 'a entrega nao foi gravada');
    assert.strictEqual(arquivosEpi().length, 1, 'o PNG de uma evidencia GRAVADA foi apagado');
    const v = await request(app).get(`/api/almoxarifado/epi/entregas/${e.id}/verificar`);
    assert.deepStrictEqual(v.body, { integro: true });
  });

  console.log(`\nepiCompensacao: ${passed} ok, ${failed} falha(s)`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
