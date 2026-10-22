/**
 * Etapa 182 (T1) — a data da liberacao para retirada: `requisicoes_almoxarifado.pronta_para_retirada_em` (feature 20, com a 05).
 *
 * Antes nao havia data da transicao para PRONTA_PARA_RETIRADA (`updated_at` muda em qualquer gravacao), entao o alerta
 * "separado aguardando retirada ha N dias" (T2) nao tinha regua. Aqui:
 *  - RN-182.01: a coluna, gravada NO MESMO UPDATE da liberacao (a perda do compare-and-set nao grava);
 *  - RN-182.02 (emenda M1 da revisao da Fase 2): o escritor unico e um TRIGGER `AFTER UPDATE OF status` — pega qualquer
 *    caminho que ponha PRONTA, inclusive o parametrico (`SET status=?`) que a guarda por texto-fonte nao via; a coluna e "a
 *    ultima liberacao", nunca zerada (B504, entrega e exclusao nao a tocam);
 *  - RN-182.03: o backfill de uma vez pela trilha LIBERACAO_RETIRADA (MAX), senao `updated_at`, so para PRONTA;
 *  - o primeiro boot em pasta vazia sobe com a coluna, o trigger e o ledger.
 * Casos `[182 RN-xx]`. Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa182-alerta-de-retirada-parada.md
 *
 * Executar: cd server && node tests/api/retiradaParadaColuna.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const { migrateBackfillProntaParaRetiradaEm } = require('../../services/almoxarifado/schema');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 182', role: 'admin', is_superadmin: 1, email: 'a182@t.com' },
  S: { id: 18201, nome: 'Solic 182', role: 'user', email: 's182@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 18202, nome: 'Almox 182', role: 'user', email: 'x182@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const L409 = 'A requisição mudou enquanto era liberada para retirada; recarregue e confira antes de liberar.';
const ANTIGO = '2026-01-01 00:00:00';
const SERVER_DIR = path.join(__dirname, '..', '..');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
let terminou = false;
let filho = null;
process.on('exit', (code) => {
  try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ }
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 182 (T1): a data da liberacao para retirada ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });

  const material = async (fisico = 0) => {
    const c = `E182C-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, custo_unitario, material_critico) VALUES (?, ?, 'PC', ?, 0, 1, 0.1, 0)`, [c, c, fisico])).lastID;
  };
  const montagem = async (q = 4) => {
    const m = await material(0);
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-182', itens: [{ material_id: m, quantidade: q }],
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const R = cr.body.id;
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=?', [R])).id;
    const ap = await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    const en = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e182' });
    assert.strictEqual(en.status, 201, `entrada: ${JSON.stringify(en.body)}`);
    const s = await como('ALMOX').put(`${API}/requisicoes/${R}/separar`, { itens_separados: [{ item_id: item, quantidade_separada: q }] });
    assert.strictEqual(s.status, 200, `separar: ${JSON.stringify(s.body)}`);
    return { m, R, item };
  };
  const liberar = (R) => como('ALMOX').put(`${API}/requisicoes/${R}/liberar-retirada`, {});
  const linha = (R) => dbGet(db, 'SELECT status, pronta_para_retirada_em AS em FROM requisicoes_almoxarifado WHERE id=?', [R]);
  const recente = async (em) => {
    assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(em)), `formato: ${em}`);
    const seg = Number((await dbGet(db, "SELECT (julianday('now') - julianday(?)) * 86400 AS s", [em])).s);
    assert.ok(seg >= -1 && seg < 60, `a coluna devia estar a menos de 60 s de agora: ${em} (${seg} s)`);
  };

  // ── RN-182.01 ──────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[182 RN-01] a coluna existe, DATETIME, anulavel e sem default', async () => {
    const col = (await dbAll(db, 'PRAGMA table_info(requisicoes_almoxarifado)')).find((c) => c.name === 'pronta_para_retirada_em');
    assert.ok(col, 'coluna pronta_para_retirada_em ausente');
    assert.deepStrictEqual([col.type, col.notnull, col.dflt_value], ['DATETIME', 0, null]);
  });

  await test('[182 RN-01] liberar grava o instante; resposta inalterada; antes da liberacao a coluna e NULL', async () => {
    const { R } = await montagem();
    assert.deepStrictEqual(await linha(R), { status: 'EM_SEPARACAO', em: null });
    const r = await liberar(R);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, { success: true, status: 'PRONTA_PARA_RETIRADA' });
    const l = await linha(R);
    assert.strictEqual(l.status, 'PRONTA_PARA_RETIRADA');
    await recente(l.em);
  });

  await test('[182 RN-01] perder o compare-and-set duas vezes -> 409 literal e a coluna NAO e gravada (M3)', async () => {
    const { R } = await montagem();
    const orig = requisitionService.carregarItensRequisicao;
    let chamadas = 0;
    requisitionService.carregarItensRequisicao = async (d, id) => {
      chamadas++;
      // uma rodada nova a cada tentativa: o NOT EXISTS da gravacao perde
      await dbRun(db, 'INSERT INTO separacoes_requisicao_almoxarifado (requisicao_id, usuario_id) VALUES (?, 1)', [R]);
      return orig(d, id);
    };
    let r;
    try { r = await liberar(R); } finally { requisitionService.carregarItensRequisicao = orig; }
    assert.strictEqual(chamadas, 2, 'premissa: duas tentativas');
    assert.deepStrictEqual([r.status, r.body.error], [409, L409]);
    assert.deepStrictEqual(await linha(R), { status: 'EM_SEPARACAO', em: null });
  });

  // ── RN-182.02 ──────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[182 RN-02] liberar (T0) -> B504 nao zera -> reliberar (T1): a coluna MUDOU para agora (I1)', async () => {
    const { R, item } = await montagem(4);
    assert.strictEqual((await liberar(R)).status, 200);
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET pronta_para_retirada_em = ? WHERE id = ?', [ANTIGO, R]);
    const d = await como('ALMOX').put(`${API}/requisicoes/${R}/devolver-separado`, {
      motivo: 'quebrou na caixa', itens: [{ item_id: item, quantidade: 1 }],
    });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.deepStrictEqual(await linha(R), { status: 'EM_SEPARACAO', em: ANTIGO }, 'o B504 nao zera a coluna');
    assert.strictEqual((await liberar(R)).status, 200);
    const l = await linha(R);
    assert.notStrictEqual(l.em, ANTIGO, 'a reliberacao nao regravou a coluna');
    await recente(l.em);
  });

  await test('[182 RN-02] a entrega total nao toca a coluna', async () => {
    const { R, item } = await montagem(2);
    assert.strictEqual((await liberar(R)).status, 200);
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET pronta_para_retirada_em = ? WHERE id = ?', [ANTIGO, R]);
    const e = await como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: 2 }] });
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.deepStrictEqual(await linha(R), { status: 'ENTREGUE', em: ANTIGO });
  });

  await test('[182 RN-02] trigger (M1): o UPDATE parametrico que poe PRONTA grava a coluna; PRONTA->PRONTA e outros status nao', async () => {
    const trg = await dbGet(db, "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='trg_requisicoes_pronta_para_retirada_em'");
    assert.ok(trg, 'trigger trg_requisicoes_pronta_para_retirada_em ausente');
    const { R } = await montagem();
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET status = ? WHERE id = ?', ['PRONTA_PARA_RETIRADA', R]);
    const l1 = await linha(R);
    assert.strictEqual(l1.status, 'PRONTA_PARA_RETIRADA');
    await recente(l1.em);
    // ja PRONTA: regravar o status (ou outra coluna) nao move a liberacao
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET pronta_para_retirada_em = ? WHERE id = ?', [ANTIGO, R]);
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['PRONTA_PARA_RETIRADA', R]);
    assert.strictEqual((await linha(R)).em, ANTIGO, 'PRONTA -> PRONTA nao e liberacao nova');
    // saida para outro status nao zera
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET status = ? WHERE id = ?', ['EM_SEPARACAO', R]);
    assert.deepStrictEqual(await linha(R), { status: 'EM_SEPARACAO', em: ANTIGO });
    // status NULL -> PRONTA tambem e liberacao (o OLD NULL nao escapa do WHEN)
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET status = NULL, pronta_para_retirada_em = NULL WHERE id = ?', [R]);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'PRONTA_PARA_RETIRADA' WHERE id = ?", [R]);
    await recente((await linha(R)).em);
  });

  // ── RN-182.03 ──────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[182 RN-03] backfill: (a) duas trilhas -> MAX; (b) sem trilha -> updated_at; (c) EM_SEPARACAO fica NULL; (d) idempotente', async () => {
    const nova = async (status, updatedAt) => {
      const n = `E182-BF-${++seq}`;
      const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, updated_at)
        VALUES (?, 1, 'x', ?, ?)`, [n, status, updatedAt])).lastID;
      // o legado: a coluna nasce vazia (o INSERT nao dispara o trigger, que e de UPDATE — mas garante)
      await dbRun(db, 'UPDATE requisicoes_almoxarifado SET pronta_para_retirada_em = NULL WHERE id = ?', [id]);
      return id;
    };
    const trilha = (id, quando) => dbRun(db, `INSERT INTO auditoria_log_almoxarifado (entidade, entidade_id, acao, created_at)
      VALUES ('requisicao', ?, 'LIBERACAO_RETIRADA', ?)`, [id, quando]);
    const a = await nova('PRONTA_PARA_RETIRADA', '2026-03-10 12:00:00');
    await trilha(a, '2026-03-01 08:00:00'); await trilha(a, '2026-03-05 09:30:00');
    await dbRun(db, `INSERT INTO auditoria_log_almoxarifado (entidade, entidade_id, acao, created_at)
      VALUES ('requisicao', ?, 'ENTREGA', '2026-03-09 00:00:00')`, [a]); // outra acao nao conta
    await dbRun(db, `INSERT INTO auditoria_log_almoxarifado (entidade, entidade_id, acao, created_at)
      VALUES ('material', ?, 'LIBERACAO_RETIRADA', '2026-03-08 00:00:00')`, [a]); // outra entidade nao conta
    const b = await nova('PRONTA_PARA_RETIRADA', '2026-04-02 10:00:00');
    const c = await nova('EM_SEPARACAO', '2026-05-01 10:00:00');
    await trilha(c, '2026-04-20 10:00:00');
    const jaTem = await nova('PRONTA_PARA_RETIRADA', '2026-06-01 10:00:00');
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET pronta_para_retirada_em = ? WHERE id = ?', ['2026-06-01 09:00:00', jaTem]);
    await trilha(jaTem, '2026-06-02 00:00:00');

    await dbRun(db, "DELETE FROM schema_migrations_almoxarifado WHERE id = 'backfill_pronta_para_retirada_em'");
    const logs = [];
    const origLog = console.log;
    console.log = (...x) => { logs.push(x.join(' ')); };
    try { await migrateBackfillProntaParaRetiradaEm(db); } finally { console.log = origLog; }
    const em = async (id) => (await dbGet(db, 'SELECT pronta_para_retirada_em AS em FROM requisicoes_almoxarifado WHERE id=?', [id])).em;
    assert.strictEqual(await em(a), '2026-03-05 09:30:00', '(a) a trilha MAIS RECENTE');
    assert.strictEqual(await em(b), '2026-04-02 10:00:00', '(b) sem trilha -> updated_at');
    assert.strictEqual(await em(c), null, '(c) quem nao esta PRONTA nao ganha data');
    assert.strictEqual(await em(jaTem), '2026-06-01 09:00:00', 'quem ja tem a coluna nao e sobrescrito');
    const l = logs.find((x) => x.includes('backfill_pronta_para_retirada_em'));
    assert.ok(l && /^✅ Migração backfill_pronta_para_retirada_em aplicada \(\d+ requisição\(ões\) pronta\(s\) para retirada\)$/.test(l),
      `log: ${JSON.stringify(logs)}`);
    assert.ok(await dbGet(db, "SELECT 1 FROM schema_migrations_almoxarifado WHERE id = 'backfill_pronta_para_retirada_em'"), 'ledger');

    // (d) segunda execucao (ledger presente): nada muda, nem para uma PRONTA nova sem data
    const d = await nova('PRONTA_PARA_RETIRADA', '2026-07-01 10:00:00');
    const logs2 = [];
    console.log = (...x) => { logs2.push(x.join(' ')); };
    try { await migrateBackfillProntaParaRetiradaEm(db); } finally { console.log = origLog; }
    assert.strictEqual(await em(d), null, '(d) com o ledger, a migracao nao roda de novo');
    assert.strictEqual(await em(a), '2026-03-05 09:30:00');
    assert.ok(!logs2.some((x) => x.includes('backfill_pronta_para_retirada_em')), `sem log na 2a: ${JSON.stringify(logs2)}`);
  });

  await test('[182 RN-03] sem ledger e sem nada a preencher: nao loga e grava o ledger', async () => {
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET pronta_para_retirada_em = COALESCE(pronta_para_retirada_em, updated_at) WHERE status = 'PRONTA_PARA_RETIRADA'");
    await dbRun(db, "DELETE FROM schema_migrations_almoxarifado WHERE id = 'backfill_pronta_para_retirada_em'");
    const logs = [];
    const origLog = console.log;
    console.log = (...x) => { logs.push(x.join(' ')); };
    try { await migrateBackfillProntaParaRetiradaEm(db); } finally { console.log = origLog; }
    assert.ok(!logs.some((x) => x.includes('backfill_pronta_para_retirada_em')), JSON.stringify(logs));
    assert.ok(await dbGet(db, "SELECT 1 FROM schema_migrations_almoxarifado WHERE id = 'backfill_pronta_para_retirada_em'"));
  });

  // ── primeiro boot ──────────────────────────────────────────────────────────────────────────────────────────────
  await test('[182 RN-01] primeiro boot em pasta vazia (CRM_DATA_DIR): sobe com a coluna, o trigger e o ledger', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e182-boot-'));
    const logArq = path.join(pasta, 'index.log');
    const env = { ...process.env };
    for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR']) delete env[k];
    Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(38000 + Math.floor(Math.random() * 2000)) });
    const out = fs.openSync(logArq, 'a');
    let saiu = null;
    filho = spawn(process.execPath, ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js'), 'index.js'], {
      cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true,
    });
    filho.on('exit', (code) => { saiu = code; });
    const consultar = (sql) => new Promise((res) => {
      const arq = path.join(pasta, 'database.sqlite');
      if (!fs.existsSync(arq)) { res(null); return; }
      const b = new sqlite3.Database(arq, sqlite3.OPEN_READONLY, (e) => {
        if (e) { res(null); return; }
        b.get(sql, [], (e2, row) => b.close(() => res(e2 ? null : row || null)));
      });
    });
    let col = null; let trg = null; let led = null;
    const fim = Date.now() + 90000;
    try {
      while (Date.now() < fim && !(col && trg && led)) {
        if (saiu !== null) throw new Error(`o index.js saiu cedo (codigo ${saiu}): ${fs.readFileSync(logArq, 'utf8').slice(-2000)}`);
        // eslint-disable-next-line no-await-in-loop
        col = col || await consultar("SELECT name FROM pragma_table_info('requisicoes_almoxarifado') WHERE name = 'pronta_para_retirada_em'");
        // eslint-disable-next-line no-await-in-loop
        trg = trg || await consultar("SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_requisicoes_pronta_para_retirada_em'");
        // eslint-disable-next-line no-await-in-loop
        led = led || await consultar("SELECT id FROM schema_migrations_almoxarifado WHERE id = 'backfill_pronta_para_retirada_em'");
        // eslint-disable-next-line no-await-in-loop
        if (!(col && trg && led)) await pausa(500);
      }
      const log = fs.readFileSync(logArq, 'utf8');
      assert.ok(col, 'a coluna nao nasceu no primeiro boot');
      assert.ok(trg, 'o trigger nao nasceu no primeiro boot');
      assert.ok(led, 'o ledger do backfill nao foi gravado no primeiro boot');
      assert.ok(!/Erro no schema do almoxarifado/.test(log), `erro no schema: ${log.slice(-2000)}`);
    } finally {
      const morreu = new Promise((r) => { if (saiu !== null) r(); else filho.once('exit', r); });
      try { filho.kill(); } catch (e) { /* ja saiu */ }
      await Promise.race([morreu, pausa(10000)]);
      filho = null;
      try { fs.closeSync(out); } catch (e) { /* ja fechado */ }
      try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo as vezes */ }
    }
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
