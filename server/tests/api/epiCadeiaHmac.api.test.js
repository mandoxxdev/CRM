/**
 * Etapa 178 (Fase 5, revisao adversarial — critico 1): a evidencia de assinatura com HMAC e encadeada.
 *
 * O achado (sonda P1/P2 do revisor, reproduzido): quem tinha o banco e o disco derrubava o trigger, trocava o PNG e recalculava
 * os dois hashes pela formula publica (SHA-256 do JSON canonico) -> `/verificar` dizia "integro"; e apagar entrega + evidencia nao
 * deixava rastro nenhum. Agora:
 *  - `registro_sha256` e HMAC-SHA256 com um segredo FORA do banco (`runtimeSecrets.resolveEvidenciaAssinaturaSecret`: variavel
 *    de ambiente ou `.runtime-secrets.json`) — a formula publica nao fecha mais;
 *  - cada evidencia tem `sequencia` (UNIQUE, crescente) e `hash_anterior` (o registro da anterior), os dois DENTRO do HMAC;
 *    `/verificar` confere o elo com a anterior e com a posterior; `GET /epi/cadeia/verificar` percorre tudo e acusa lacuna
 *    ("registro apagado"), elo quebrado e o apagado no fim (sqlite_sequence).
 * Declarado (letra D): quem tem o banco, o disco E o segredo ainda forja — reescrevendo a evidencia e todas as posteriores.
 *
 * Executar: cd server && node tests/api/epiCadeiaHmac.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { wrapDatabase } = require('../../services/sqliteConcurrency');
const stockService = require('../../services/almoxarifado/stockService');
const epiService = require('../../services/almoxarifado/epiService');
const evidencia = require('../../services/almoxarifado/evidenciaAssinaturaService');
const runtimeSecrets = require('../../services/runtimeSecrets');

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
const TABELAS = ['entregas_epi_almoxarifado', 'evidencias_assinatura_almoxarifado'];
let seq = 0;

/** Um banco novo por cenario destrutivo (a cadeia e global por banco). */
async function ambiente() {
  const t = await createTestApp({ user: ADMIN });
  wrapDatabase(t.db);
  const { app, db, uploadsAlmoxDir } = t;
  async function criarEpi(qtd = 50) {
    seq += 1;
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, categoria, quantidade_atual, ativo, ca_numero, ca_validade)
      VALUES (?, ?, 'EPIs', 0, 1, 'CA-9', '2099-12-31')`, [`EPI-C-${seq}`, `Capacete ${seq}`]);
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: r.lastID, tipo: 'ENTRADA', quantidade: qtd, justificativa: 'carga' });
    return r.lastID;
  }
  async function criarColaborador() {
    seq += 1;
    const r = await dbRun(db, 'INSERT INTO colaboradores (nome, matricula, cpf, status, setor) VALUES (?,?,?,?,?)',
      [`COLAB ${seq}`, `MC${seq}`, '123.456.789-01', 'ativo', 'Solda']);
    return { id: r.lastID, matricula: `MC${seq}` };
  }
  async function entregar(col, materialId, quantidade = 1) {
    const res = await request(app).post('/api/almoxarifado/epi/entregas')
      .field('colaborador_id', String(col.id)).field('material_id', String(materialId)).field('quantidade', String(quantidade))
      .field('confirmacao_matricula', col.matricula)
      .attach('assinatura', PNG_1PX, { filename: 'a.png', contentType: 'image/png' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    return res.body;
  }
  const verificar = async (id) => (await request(app).get(`/api/almoxarifado/epi/entregas/${id}/verificar`)).body;
  const cadeia = async () => {
    const r = await request(app).get('/api/almoxarifado/epi/cadeia/verificar');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const evDe = (entregaId) => dbGet(db,
    "SELECT * FROM evidencias_assinatura_almoxarifado WHERE contexto = 'ENTREGA_EPI' AND contexto_id = ?", [entregaId]);
  /** O atacante com o banco: derruba os quatro triggers (como na sonda do revisor). */
  async function derrubarTriggers() {
    for (const tabela of TABELAS) {
      for (const nome of ['sem_update', 'sem_delete']) await dbRun(db, `DROP TRIGGER IF EXISTS trg_${tabela}_${nome}`);
    }
  }
  return { ...t, criarEpi, criarColaborador, entregar, verificar, cadeia, evDe, derrubarTriggers, uploadsAlmoxDir };
}

const hmac = (segredo, campos) => crypto.createHmac('sha256', segredo).update(evidencia.jsonCanonico(campos)).digest('hex');
const sha = (campos) => crypto.createHash('sha256').update(evidencia.jsonCanonico(campos)).digest('hex');

(async () => {
  // ── (a) o segredo, fora do banco ────────────────────────────────────────────────────────────
  await test('[F5-1a] o segredo: a variavel de ambiente manda; sem ela, gerado e persistido em .runtime-secrets.json (sem apagar o jwtSecret) e estavel', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evid-segredo-'));
    const antes = process.env.EVIDENCIA_ASSINATURA_SECRET;
    const logOrig = console.log;
    try {
      fs.writeFileSync(path.join(dir, '.runtime-secrets.json'), JSON.stringify({ jwtSecret: 'jwt-que-ja-existia' }));
      delete process.env.EVIDENCIA_ASSINATURA_SECRET;
      console.log = () => {};
      const s1 = runtimeSecrets.resolveEvidenciaAssinaturaSecret(dir);
      const s2 = runtimeSecrets.resolveEvidenciaAssinaturaSecret(dir);
      console.log = logOrig;
      assert.match(s1, /^[0-9a-f]{64}$/);
      assert.strictEqual(s2, s1, 'o segundo boot gerou outro segredo — a verificacao acusaria tudo');
      const arq = JSON.parse(fs.readFileSync(path.join(dir, '.runtime-secrets.json'), 'utf8'));
      assert.strictEqual(arq.evidenciaAssinaturaSecret, s1);
      assert.strictEqual(arq.jwtSecret, 'jwt-que-ja-existia', 'o jwtSecret sumiu do arquivo');
      process.env.EVIDENCIA_ASSINATURA_SECRET = 'do-ambiente';
      assert.strictEqual(runtimeSecrets.resolveEvidenciaAssinaturaSecret(dir), 'do-ambiente');
    } finally {
      console.log = logOrig;
      if (antes === undefined) delete process.env.EVIDENCIA_ASSINATURA_SECRET; else process.env.EVIDENCIA_ASSINATURA_SECRET = antes;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  const A = await ambiente();
  const matA = await A.criarEpi();
  const colA = await A.criarColaborador();
  const e1 = await A.entregar(colA, matA, 2);
  const e2 = await A.entregar(colA, matA, 1);
  const e3 = await A.entregar(colA, matA, 3);

  await test('[F5-1a] registro_sha256 e o HMAC-SHA256 do JSON canonico com o segredo do servidor — nao o SHA-256 publico', async () => {
    const entrega = await dbGet(A.db, 'SELECT * FROM entregas_epi_almoxarifado WHERE id = ?', [e1.id]);
    const ev = await A.evDe(e1.id);
    const campos = epiService.camposDoRegistro(entrega, ev);
    assert.strictEqual(ev.registro_sha256, hmac(process.env.EVIDENCIA_ASSINATURA_SECRET, campos));
    assert.notStrictEqual(ev.registro_sha256, sha(campos), 'ainda e o SHA-256 da formula publica');
    assert.strictEqual(e1.evidencia.registro_sha256, ev.registro_sha256);
  });

  await test('[F5-1a] o segredo nao esta em nenhuma tabela do banco', async () => {
    const segredo = process.env.EVIDENCIA_ASSINATURA_SECRET;
    const tabelas = await dbAll(A.db, "SELECT name FROM sqlite_master WHERE type = 'table'");
    for (const { name } of tabelas) {
      const linhas = await dbAll(A.db, `SELECT * FROM "${name}"`);
      assert.ok(!JSON.stringify(linhas).includes(segredo), `o segredo aparece na tabela ${name}`);
    }
  });

  await test('[F5-1b] sequencia 1, 2, 3 e hash_anterior = o registro da anterior (a primeira, null); os dois entram no HMAC', async () => {
    const evs = [await A.evDe(e1.id), await A.evDe(e2.id), await A.evDe(e3.id)];
    assert.deepStrictEqual(evs.map((v) => v.sequencia), [1, 2, 3]);
    assert.strictEqual(evs[0].hash_anterior, null);
    assert.strictEqual(evs[1].hash_anterior, evs[0].registro_sha256);
    assert.strictEqual(evs[2].hash_anterior, evs[1].registro_sha256);
    const entrega = await dbGet(A.db, 'SELECT * FROM entregas_epi_almoxarifado WHERE id = ?', [e2.id]);
    const campos = epiService.camposDoRegistro(entrega, evs[1]);
    assert.strictEqual(campos.evidencia.sequencia, 2);
    assert.strictEqual(campos.evidencia.hash_anterior, evs[0].registro_sha256);
  });

  await test('[F5-1b] /verificar integro nas tres; /epi/cadeia/verificar -> integra, total 3, cabeca = a terceira, sem problemas', async () => {
    for (const e of [e1, e2, e3]) assert.deepStrictEqual(await A.verificar(e.id), { integro: true });
    const c = await A.cadeia();
    assert.deepStrictEqual(c, { integra: true, total: 3, cabeca: { sequencia: 3, registro_sha256: e3.evidencia.registro_sha256 },
      problemas: [] });
  });

  await test('[F5-1b] concorrencia: 8 entregas em paralelo (materiais diferentes) -> sequencias 4..11 sem buraco nem repeticao; cadeia integra', async () => {
    const mats = [];
    for (let i = 0; i < 8; i += 1) mats.push(await A.criarEpi(5));
    const outs = await Promise.all(mats.map((m) => A.entregar(colA, m, 1)));
    const seqs = [];
    for (const o of outs) seqs.push((await A.evDe(o.id)).sequencia);
    assert.deepStrictEqual(seqs.sort((x, y) => x - y), [4, 5, 6, 7, 8, 9, 10, 11]);
    const c = await A.cadeia();
    assert.strictEqual(c.integra, true, JSON.stringify(c.problemas));
    assert.strictEqual(c.total, 11);
  });

  // ── P1: a forja da sonda do revisor ─────────────────────────────────────────────────────────
  await test('[P1] a forja da sonda (trigger derrubado, PNG trocado, quantidade 1->5 e nome trocado, os dois hashes pela formula publica) -> "registro alterado"', async () => {
    const B = await ambiente();
    const m = await B.criarEpi();
    const c = await B.criarColaborador();
    const r = await B.entregar(c, m, 1);
    const ev = await B.evDe(r.id);
    const falso = Buffer.concat([PNG_1PX, Buffer.from('FORJADO')]);
    fs.writeFileSync(path.join(B.uploadsAlmoxDir, ev.arquivo), falso);
    await B.derrubarTriggers();
    await dbRun(B.db, "UPDATE entregas_epi_almoxarifado SET quantidade = 5, colaborador_nome = 'OUTRO' WHERE id = ?", [r.id]);
    const e2f = await dbGet(B.db, 'SELECT * FROM entregas_epi_almoxarifado WHERE id = ?', [r.id]);
    const v2 = { ...ev, arquivo_sha256: crypto.createHash('sha256').update(falso).digest('hex') };
    // o atacante sem o segredo: a formula publica, e tambem um HMAC com um segredo chutado
    for (const forjado of [sha(epiService.camposDoRegistro(e2f, v2)), hmac('chute', epiService.camposDoRegistro(e2f, v2))]) {
      await dbRun(B.db, 'UPDATE evidencias_assinatura_almoxarifado SET arquivo_sha256 = ?, registro_sha256 = ? WHERE id = ?',
        [v2.arquivo_sha256, forjado, ev.id]);
      assert.deepStrictEqual(await B.verificar(r.id), { integro: false, motivo: 'registro alterado' });
    }
    const cad = await B.cadeia();
    assert.strictEqual(cad.integra, false);
    assert.deepStrictEqual(cad.problemas, [{ sequencia: 1, evidencia_id: ev.id, numero: r.numero, motivo: 'registro alterado' }]);
  });

  // ── P2: apagar ──────────────────────────────────────────────────────────────────────────────
  await test('[P2] apagar a entrega + evidencia do meio -> a cadeia acusa "registro apagado" na sequencia; a vizinha de cada lado acusa o elo', async () => {
    const B = await ambiente();
    const m = await B.criarEpi();
    const c = await B.criarColaborador();
    const [x1, x2, x3] = [await B.entregar(c, m), await B.entregar(c, m), await B.entregar(c, m)];
    await B.derrubarTriggers();
    await dbRun(B.db, "DELETE FROM evidencias_assinatura_almoxarifado WHERE contexto_id = ?", [x2.id]);
    await dbRun(B.db, 'DELETE FROM entregas_epi_almoxarifado WHERE id = ?', [x2.id]);
    const cad = await B.cadeia();
    assert.strictEqual(cad.integra, false);
    assert.deepStrictEqual(cad.problemas, [{ sequencia: 2, evidencia_id: null, numero: null, motivo: 'registro apagado' }]);
    assert.deepStrictEqual(await B.verificar(x1.id), { integro: false, motivo: 'registro posterior apagado' });
    assert.deepStrictEqual(await B.verificar(x3.id), { integro: false, motivo: 'registro anterior apagado' });
  });

  await test('[P2] apagar a UNICA entrega (a sonda do revisor) e a ultima de varias -> "registro apagado no fim da cadeia" (sqlite_sequence)', async () => {
    const B = await ambiente();
    const m = await B.criarEpi();
    const c = await B.criarColaborador();
    const r = await B.entregar(c, m);
    await B.derrubarTriggers();
    await dbRun(B.db, 'DELETE FROM evidencias_assinatura_almoxarifado');
    await dbRun(B.db, 'DELETE FROM entregas_epi_almoxarifado WHERE id = ?', [r.id]);
    const cad = await B.cadeia();
    assert.strictEqual(cad.integra, false);
    assert.strictEqual(cad.total, 0);
    assert.ok(cad.problemas.some((p) => p.motivo === 'registro apagado no fim da cadeia'), JSON.stringify(cad.problemas));

    const C = await ambiente();
    const m2 = await C.criarEpi();
    const c2 = await C.criarColaborador();
    const y1 = await C.entregar(c2, m2);
    const y2 = await C.entregar(c2, m2);
    await C.derrubarTriggers();
    await dbRun(C.db, 'DELETE FROM evidencias_assinatura_almoxarifado WHERE contexto_id = ?', [y2.id]);
    await dbRun(C.db, 'DELETE FROM entregas_epi_almoxarifado WHERE id = ?', [y2.id]);
    const cad2 = await C.cadeia();
    assert.strictEqual(cad2.integra, false);
    assert.ok(cad2.problemas.some((p) => p.motivo === 'registro apagado no fim da cadeia'), JSON.stringify(cad2.problemas));
    assert.deepStrictEqual(await C.verificar(y1.id), { integro: true }, 'a cauda apagada so a cadeia ve (declarado)');
  });

  await test('[P2] apagar so a evidencia (a entrega fica) -> a cadeia acusa a lacuna e a entrega sem evidencia', async () => {
    const B = await ambiente();
    const m = await B.criarEpi();
    const c = await B.criarColaborador();
    const [x1, x2, x3] = [await B.entregar(c, m), await B.entregar(c, m), await B.entregar(c, m)];
    void x1; void x3;
    await B.derrubarTriggers();
    await dbRun(B.db, "DELETE FROM evidencias_assinatura_almoxarifado WHERE contexto_id = ?", [x2.id]);
    const cad = await B.cadeia();
    assert.deepStrictEqual(cad.problemas, [
      { sequencia: 2, evidencia_id: null, numero: null, motivo: 'registro apagado' },
      { sequencia: null, evidencia_id: null, numero: x2.numero, motivo: 'entrega sem evidência' },
    ]);
    assert.deepStrictEqual(await B.verificar(x2.id), { integro: false, motivo: 'registro alterado' });
  });

  await test('[F5-1b] quem TEM o segredo e reescreve uma evidencia do meio (HMAC certo) -> a posterior acusa o elo (declarado: reescrever todas as posteriores escapa)', async () => {
    const B = await ambiente();
    const m = await B.criarEpi();
    const c = await B.criarColaborador();
    const [x1, x2, x3] = [await B.entregar(c, m), await B.entregar(c, m), await B.entregar(c, m)];
    void x1;
    await B.derrubarTriggers();
    await dbRun(B.db, "UPDATE entregas_epi_almoxarifado SET quantidade = 7 WHERE id = ?", [x2.id]);
    const ent = await dbGet(B.db, 'SELECT * FROM entregas_epi_almoxarifado WHERE id = ?', [x2.id]);
    const ev = await B.evDe(x2.id);
    const novo = hmac(process.env.EVIDENCIA_ASSINATURA_SECRET, epiService.camposDoRegistro(ent, ev));
    await dbRun(B.db, 'UPDATE evidencias_assinatura_almoxarifado SET registro_sha256 = ? WHERE id = ?', [novo, ev.id]);
    assert.deepStrictEqual(await B.verificar(x2.id), { integro: false, motivo: 'elo com o posterior quebrado' });
    const ev3 = await B.evDe(x3.id);
    const cad = await B.cadeia();
    assert.deepStrictEqual(cad.problemas, [{ sequencia: 3, evidencia_id: ev3.id, numero: x3.numero, motivo: 'elo quebrado' }]);
  });

  await test('[F5-1b] o arquivo trocado tambem aparece na cadeia ("arquivo alterado")', async () => {
    const B = await ambiente();
    const m = await B.criarEpi();
    const c = await B.criarColaborador();
    const r = await B.entregar(c, m);
    const ev = await B.evDe(r.id);
    const caminho = path.join(B.uploadsAlmoxDir, ev.arquivo);
    const buf = fs.readFileSync(caminho); buf[buf.length - 5] ^= 1; fs.writeFileSync(caminho, buf);
    const cad = await B.cadeia();
    assert.deepStrictEqual(cad.problemas, [{ sequencia: 1, evidencia_id: ev.id, numero: r.numero, motivo: 'arquivo alterado' }]);
  });

  await test('[F5-1b] schema: sequencia UNIQUE (uma segunda linha com a mesma sequencia e recusada pelo banco)', async () => {
    const idx = await dbAll(A.db, "PRAGMA index_list('evidencias_assinatura_almoxarifado')");
    let achou = false;
    for (const i of idx.filter((x) => x.unique)) {
      const cols = await dbAll(A.db, `PRAGMA index_info('${i.name}')`);
      if (cols.length === 1 && cols[0].name === 'sequencia') achou = true;
    }
    assert.ok(achou, 'sem indice UNIQUE em sequencia');
  });

  console.log(`\nepiCadeiaHmac: ${passed} ok, ${failed} falha(s)`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
