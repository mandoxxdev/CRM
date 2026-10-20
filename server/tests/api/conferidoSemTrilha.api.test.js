/**
 * Etapa 122 (C255b, B788; RN-10..RN-12) — "a conferencia foi finalizada" mora numa coluna do recebimento, nao na Auditoria.
 *
 * Medido na Fase 0 (sonda e122fase0): o gesto "Finalizar Conferencia" com a trilha FINALIZAR_CONFERENCIA falhando responde 200
 * (CONFERIDO_ALMOX), e o relatorio "Qualidade por fornecedor" dava `itens_conferidos: 0` — ele lia a EXISTENCIA da trilha (Etapa
 * 67). Desde a 121 a trilha pode faltar com o ato feito (B784). Agora o gesto grava `conferencia_finalizada_em` no MESMO UPDATE
 * do status, e o relatorio le a coluna.
 *
 * Executar: cd server && node tests/api/conferidoSemTrilha.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const schema = require('../../services/almoxarifado/schema');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const API = '/api/almoxarifado';
const LEDGER = 'backfill_conferencia_finalizada_em';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  // Etapa 162 (RN-162.01, C401): o relatorio filtra pelo dia de Brasilia — o "hoje" do teste tambem (era o `date('now')` do SQLite, o
  // dia UTC: entre 21h e meia-noite o teste passaria a falhar)
  const HOJE = require('../../services/diaLocal').hojeLocalISO();

  async function comAuditoriaFalhando(entidade, acao, fn) {
    const original = db.run;
    let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && sql.includes('INSERT INTO auditoria_log_almoxarifado')
        && Array.isArray(params) && params[0] === entidade && params[2] === acao) {
        disparou = true;
        setImmediate(() => cb.call({}, new Error(`falha forcada da auditoria ${entidade}/${acao} (teste)`)));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    const warn = console.warn; console.warn = () => {};
    let r;
    try { r = await fn(); } finally { db.run = original; console.warn = warn; }
    assert.ok(disparou, `gancho da auditoria ${entidade}/${acao} nao disparou`);
    return r;
  }

  let seq = 0;
  const material = async () => (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
    VALUES (?, ?, 'UN', 0, 1)`, [`CST122-${++seq}`, `CST122-${seq}`])).lastID;
  /** Recebimento de 2 pela porta real, para o fornecedor digitado `nome`. */
  const receber = async (nome) => {
    setUser(SUPER);
    const r = await request(app).post(`${API}/recebimentos`).send({ tipo_recebimento: 'NOTA_FISCAL',
      nota_fiscal: `NF-CST122-${++seq}`, fornecedor_nome: nome, itens: [{ material_id: await material(), quantidade: 2 }] });
    assert.strictEqual(r.status, 201, `POST /recebimentos: ${JSON.stringify(r.body)}`);
    return r.body.id;
  };
  const workflow = async (id, acao) => {
    const r = await request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao });
    assert.strictEqual(r.status, 200, `${acao}: ${r.status} ${JSON.stringify(r.body)}`);
    return r;
  };
  const conferidos = async (nome) => {
    const r = await request(app).get(`${API}/relatorios/qualidade-fornecedores?data_inicio=${HOJE}&data_fim=${HOJE}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const ls = r.body.filter((l) => l.fornecedor === nome);
    assert.strictEqual(ls.length, 1, `esperava 1 linha de ${nome}: ${JSON.stringify(ls)}`);
    return ls[0].itens_conferidos;
  };
  const coluna = async (id) => (await dbGet(db,
    'SELECT conferencia_finalizada_em AS c FROM recebimentos_material_almoxarifado WHERE id = ?', [id])).c;

  console.log('\n=== Etapa 122: a conferencia finalizada numa coluna (C255b) ===\n');

  await test('[RN-10] finalizar com a trilha FINALIZAR_CONFERENCIA falhando: a coluna preenchida e o relatorio conta o item', async () => {
    const id = await receber('FORN-CST122-A');
    await workflow(id, 'iniciar_conferencia');
    const r = await comAuditoriaFalhando('recebimento', 'FINALIZAR_CONFERENCIA', () => workflow(id, 'finalizar_conferencia'));
    assert.strictEqual(r.body.status, 'CONFERIDO_ALMOX');
    assert.ok(await coluna(id), 'a coluna nao foi gravada no gesto');
    assert.strictEqual(await conferidos('FORN-CST122-A'), 1, 'o relatorio ainda depende da trilha');
  });

  await test('[RN-11] guarda: /conferir com status CONFERIDO_ALMOX (sem o gesto) nao conta; o gesto com a trilha gravando conta', async () => {
    const id = await receber('FORN-CST122-B');
    const r = await request(app).put(`${API}/recebimentos/${id}/conferir`).send({ status: 'CONFERIDO_ALMOX' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await coluna(id), null);
    assert.strictEqual(await conferidos('FORN-CST122-B'), 0);
    const id2 = await receber('FORN-CST122-C');
    await workflow(id2, 'iniciar_conferencia');
    await workflow(id2, 'finalizar_conferencia');
    assert.strictEqual(await conferidos('FORN-CST122-C'), 1);
    assert.strictEqual((await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade = 'recebimento'
      AND entidade_id = ? AND acao = 'FINALIZAR_CONFERENCIA'`, [id2])).n, 1, 'a trilha (rastro) continua gravada');
  });

  await test('[RN-11b] a primeira finalizacao fica: voltar a conferir e finalizar de novo nao troca a data', async () => {
    const id = await receber('FORN-CST122-D');
    await workflow(id, 'iniciar_conferencia');
    await workflow(id, 'finalizar_conferencia');
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET conferencia_finalizada_em = '2026-01-01 00:00:00' WHERE id = ?", [id]);
    const r = await request(app).put(`${API}/recebimentos/${id}/conferir`).send({ status: 'EM_CONFERENCIA' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    await workflow(id, 'finalizar_conferencia');
    assert.strictEqual(await coluna(id), '2026-01-01 00:00:00');
  });

  await test('[RN-12] o legado: o backfill preenche pela trilha (a mais antiga), uma vez so (ledger)', async () => {
    const comTrilha = await receber('FORN-CST122-E');
    const semTrilha = await receber('FORN-CST122-F');
    const trilha = (id, quando) => dbRun(db, `INSERT INTO auditoria_log_almoxarifado (entidade, entidade_id, acao, created_at)
      VALUES ('recebimento', ?, 'FINALIZAR_CONFERENCIA', ?)`, [id, quando]);
    await trilha(comTrilha, '2026-03-02 10:00:00');
    await trilha(comTrilha, '2026-03-01 09:00:00');
    // Fase 5 (r3 M10): NAO e so pre-condicao — e a unica guarda contra o relatorio voltar a ler a trilha como fallback.
    assert.strictEqual(await conferidos('FORN-CST122-E'), 0, 'o relatorio contou pela trilha, sem a coluna (a leitura antiga voltou)');
    await dbRun(db, 'DELETE FROM schema_migrations_almoxarifado WHERE id = ?', [LEDGER]);
    await schema.migrateBackfillConferenciaFinalizadaEm(db);
    assert.strictEqual(await coluna(comTrilha), '2026-03-01 09:00:00');
    assert.strictEqual(await coluna(semTrilha), null);
    assert.strictEqual(await conferidos('FORN-CST122-E'), 1);
    assert.ok(await dbGet(db, 'SELECT 1 ok FROM schema_migrations_almoxarifado WHERE id = ?', [LEDGER]), 'o ledger nao foi gravado');
    await dbRun(db, 'UPDATE recebimentos_material_almoxarifado SET conferencia_finalizada_em = NULL WHERE id = ?', [comTrilha]);
    await schema.migrateBackfillConferenciaFinalizadaEm(db);
    assert.strictEqual(await coluna(comTrilha), null, 'com o ledger gravado o backfill rodou de novo');
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
