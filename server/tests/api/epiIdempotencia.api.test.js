/**
 * Etapa 178 (Fase 5, revisao adversarial — menor M2): idempotencia da entrega de EPI.
 *
 * O tablet do almoxarifado esta no Wi-Fi do galpao: a resposta do POST se perde, a pessoa toca "Registrar entrega" de novo e o
 * colaborador "recebe" duas vezes (duas saidas, duas linhas na ficha). Agora o front gera uma `chave_idempotencia` (uuid) por
 * tentativa de envio; a entrega guarda a chave (indice UNIQUE); o reenvio com a mesma chave devolve a entrega ja gravada (200,
 * `reutilizada: true`) sem nova saida, e o PNG do reenvio e apagado. A mesma chave com outro colaborador/EPI/quantidade -> 409.
 * Sem chave (cliente de API antigo) continua como antes.
 *
 * Executar: cd server && node tests/api/epiIdempotencia.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { wrapDatabase } = require('../../services/sqliteConcurrency');
const stockService = require('../../services/almoxarifado/stockService');

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${String(e && e.message).replace(/\s*\n\s*/g, ' ').slice(0, 800)}`);
  }
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
let seq = 0;
const uuid = () => require('crypto').randomUUID();

(async () => {
  const t = await createTestApp({ user: ADMIN });
  const { app, db, uploadsAlmoxDir } = t;
  wrapDatabase(db);
  const arquivosEpi = () => (fs.existsSync(uploadsAlmoxDir)
    ? fs.readdirSync(uploadsAlmoxDir).filter((f) => f.startsWith('assinatura-epi-')) : []);
  const limparDisco = () => { for (const f of arquivosEpi()) fs.unlinkSync(path.join(uploadsAlmoxDir, f)); };
  const saldo = async (id) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [id])).q;
  const saidasVivas = async (id) => (await dbGet(db, `SELECT COUNT(*) n FROM movimentacoes_almoxarifado
    WHERE material_id = ? AND tipo = 'SAIDA' AND COALESCE(cancelado, 0) = 0`, [id])).n;

  async function criarEpi(qtd = 5) {
    seq += 1;
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, categoria, quantidade_atual, ativo, ca_numero, ca_validade)
      VALUES (?, ?, 'EPIs', 0, 1, 'CA-8', '2099-01-01')`, [`EPI-ID-${seq}`, `Protetor ${seq}`]);
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: r.lastID, tipo: 'ENTRADA', quantidade: qtd, justificativa: 'carga' });
    return r.lastID;
  }
  async function criarColaborador() {
    seq += 1;
    const id = (await dbRun(db, "INSERT INTO colaboradores (nome, matricula, status, setor) VALUES (?,?,'ativo','X')",
      [`COL ${seq}`, `MID${seq}`])).lastID;
    return { id, matricula: `MID${seq}` };
  }
  const post = (col, m, quantidade, chave) => {
    let r = request(app).post('/api/almoxarifado/epi/entregas')
      .field('colaborador_id', String(col.id)).field('material_id', String(m)).field('quantidade', String(quantidade))
      .field('confirmacao_matricula', col.matricula);
    if (chave !== undefined) r = r.field('chave_idempotencia', chave);
    return r.attach('assinatura', PNG_1PX, { filename: 'a.png', contentType: 'image/png' });
  };

  await test('[M2] reenvio com a mesma chave -> 200 com a MESMA entrega (reutilizada: true); uma saida so; o PNG do reenvio apagado', async () => {
    limparDisco();
    const m = await criarEpi(5);
    const c = await criarColaborador();
    const chave = uuid();
    const a = await post(c, m, 2, chave);
    assert.strictEqual(a.status, 201, JSON.stringify(a.body));
    const b = await post(c, m, 2, chave);
    assert.strictEqual(b.status, 200, JSON.stringify(b.body));
    assert.strictEqual(b.body.reutilizada, true);
    const { reutilizada, ...semFlag } = b.body;
    void reutilizada;
    assert.deepStrictEqual(semFlag, a.body, 'o reenvio nao devolveu a mesma entrega');
    assert.strictEqual(await saidasVivas(m), 1);
    assert.strictEqual(await saldo(m), 3);
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM entregas_epi_almoxarifado WHERE material_id = ?', [m])).n, 1);
    assert.strictEqual(arquivosEpi().length, 1, 'o PNG do reenvio ficou orfao (ou o da entrega sumiu)');
  });

  await test('[M2] o ultimo item: o reenvio devolve a entrega (200), e nao a recusa de saldo', async () => {
    const m = await criarEpi(1);
    const c = await criarColaborador();
    const chave = uuid();
    assert.strictEqual((await post(c, m, 1, chave)).status, 201);
    const b = await post(c, m, 1, chave);
    assert.strictEqual(b.status, 200, JSON.stringify(b.body));
    assert.strictEqual(await saldo(m), 0);
  });

  await test('[M2] a mesma chave com outra quantidade (ou outro colaborador) -> 409 literal; nada gravado no segundo', async () => {
    limparDisco();
    const m = await criarEpi(5);
    const c = await criarColaborador();
    const c2 = await criarColaborador();
    const chave = uuid();
    assert.strictEqual((await post(c, m, 1, chave)).status, 201);
    for (const [col, q] of [[c, 2], [c2, 1]]) {
      const r = await post(col, m, q, chave);
      assert.strictEqual(r.status, 409, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, 'Chave de idempotência já usada em outra entrega');
    }
    assert.strictEqual(await saidasVivas(m), 1);
    assert.strictEqual(await saldo(m), 4);
    assert.strictEqual(arquivosEpi().length, 1);
  });

  await test('[M2] chave fora do formato -> 400 literal; nada gravado', async () => {
    limparDisco();
    const m = await criarEpi(5);
    const c = await criarColaborador();
    for (const ruim of ['curta', 'com espaco no meio xx', `x${'a'.repeat(100)}`, "aspas'1234567"]) {
      const r = await post(c, m, 1, ruim);
      assert.strictEqual(r.status, 400, `${ruim}: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, 'Chave de idempotência inválida');
    }
    assert.strictEqual(await saldo(m), 5);
    assert.deepStrictEqual(arquivosEpi(), []);
  });

  await test('[M2] sem chave (cliente antigo) -> duas entregas, como antes', async () => {
    const m = await criarEpi(5);
    const c = await criarColaborador();
    assert.strictEqual((await post(c, m, 1)).status, 201);
    assert.strictEqual((await post(c, m, 1)).status, 201);
    assert.strictEqual(await saidasVivas(m), 2);
  });

  await test('[M2] corrida: o mesmo envio duas vezes em paralelo (10 rodadas) -> uma 201 e uma 200 da mesma entrega; uma saida viva; saldo -1', async () => {
    limparDisco();
    for (let rodada = 0; rodada < 10; rodada += 1) {
      const m = await criarEpi(5);
      const c = await criarColaborador();
      const chave = uuid();
      const [a, b] = await Promise.all([post(c, m, 1, chave), post(c, m, 1, chave)]);
      assert.deepStrictEqual([a.status, b.status].sort(), [200, 201], `rodada ${rodada}: ${a.status} ${JSON.stringify(a.body)} / ${b.status} ${JSON.stringify(b.body)}`);
      assert.strictEqual(a.body.id, b.body.id);
      assert.strictEqual(await saidasVivas(m), 1, `rodada ${rodada}`);
      assert.strictEqual(await saldo(m), 4, `rodada ${rodada}`);
    }
    assert.strictEqual(arquivosEpi().length, 10, 'PNG orfao do envio duplicado');
  });

  await test('[M2] schema: chave_idempotencia com indice UNIQUE; a chave entra no HMAC (alterada -> "registro alterado")', async () => {
    const idx = await dbAll(db, "PRAGMA index_list('entregas_epi_almoxarifado')");
    let achou = false;
    for (const i of idx.filter((x) => x.unique)) {
      const cols = await dbAll(db, `PRAGMA index_info('${i.name}')`);
      if (cols.length === 1 && cols[0].name === 'chave_idempotencia') achou = true;
    }
    assert.ok(achou, 'sem indice UNIQUE em chave_idempotencia');
    const m = await criarEpi(5);
    const c = await criarColaborador();
    const r = await post(c, m, 1, uuid());
    await dbRun(db, 'DROP TRIGGER trg_entregas_epi_almoxarifado_sem_update');
    try {
      await dbRun(db, 'UPDATE entregas_epi_almoxarifado SET chave_idempotencia = ? WHERE id = ?', [uuid(), r.body.id]);
    } finally {
      await dbRun(db, `CREATE TRIGGER trg_entregas_epi_almoxarifado_sem_update BEFORE UPDATE ON entregas_epi_almoxarifado
        BEGIN SELECT RAISE(ABORT, 'evidencia de assinatura nao pode ser alterada'); END`);
    }
    assert.deepStrictEqual((await request(app).get(`/api/almoxarifado/epi/entregas/${r.body.id}/verificar`)).body,
      { integro: false, motivo: 'registro alterado' });
  });

  console.log(`\nepiIdempotencia: ${passed} ok, ${failed} falha(s)`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
