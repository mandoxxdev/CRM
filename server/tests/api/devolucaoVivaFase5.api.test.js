/**
 * Etapa 117 (Fase 5) — o que a revisao adversarial achou: as series de outra saida (ou digitadas errado) numa devolucao que
 * cita a entrega (o estorno da entrada as ligaria a saida errada); a ENTRADA_DEVOLUCAO digitada com DEV-<n> antes da
 * devolucao (contornava a identidade); a entrega de requisicao excluida devolvivel de novo (anterior a 117); o desfazer que
 * falha no meio refeito em dobro; e cinco cenarios sem prova do revisor 3 (P1, P2, P6, P7, P8 — a numeracao dele).
 *
 * Executar: cd server && node tests/api/devolucaoVivaFase5.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const { AsyncResource } = require('async_hooks');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };

(async () => {
  const { app, db, close } = await createTestApp({ user: SUPER });
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `F5117-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, codigo])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const ultima = async (m, tipo) => (await dbGet(db,
    'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1', [m.id, tipo])).id;
  const mov = async (m, body) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'r3',
      justificativa: 'preparo r3', documento_vinculado: 'NF-R3', ...body });
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    return ultima(m, body.tipo);
  };
  const devolver = (m, saidaId, quantidade, destino = 'ESTOQUE', extra = {}) => request(app).post('/api/almoxarifado/devolucoes')
    .send({ material_id: m.id, quantidade, motivo: 'NAO_UTILIZADO', destino, movimentacao_saida_id: saidaId, ...extra });
  const estornar = (movId) => request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'r3' });
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q;
  const linhas = async (m) => (await dbGet(db, 'SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado WHERE material_id = ?', [m.id])).q;
  // P1 — B2/B3: o motivo e a auditoria da serie que volta a Entregue no estorno da entrada da devolucao
  await test('P1 serie: status_motivo "Devolução estornada" e auditoria ESTORNO_ENTRADA com ENTREGUE + saida', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 1, series: ['P1A'] });
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ?', [m.id])).map((x) => x.id);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 1, serie_ids: ids });
    assert.strictEqual((await devolver(m, saidaId, 1, 'ESTOQUE', { series: ['P1A'] })).status, 201);
    assert.strictEqual((await estornar(await ultima(m, 'ENTRADA_DEVOLUCAO'))).status, 200);
    const s = await dbGet(db, 'SELECT id, status, status_motivo FROM series_almoxarifado WHERE material_id = ?', [m.id]);
    assert.deepStrictEqual([s.status, s.status_motivo], ['ENTREGUE', 'Devolução estornada']);
    const a = await dbGet(db, `SELECT dados_novos FROM auditoria_log_almoxarifado WHERE entidade = 'serie' AND entidade_id = ?
      AND acao = 'ESTORNO_ENTRADA' ORDER BY id DESC LIMIT 1`, [s.id]);
    assert.deepStrictEqual(JSON.parse(a.dados_novos), { status: 'ENTREGUE', movimentacao_saida_id: saidaId });
  });

  // P2 — C10: o claim perdido para OUTRO estorno da mesma entrada (a sucata ja estornada) responde "ja cancelada", nao a E1
  await test('P2 sucata estornada + dois estornos da entrada: o que perde o claim ouve "Movimentação já cancelada"', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 10 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    assert.strictEqual((await devolver(m, saidaId, 2, 'SUCATA')).status, 201);
    const entradaId = await ultima(m, 'ENTRADA_DEVOLUCAO');
    assert.strictEqual((await estornar(await ultima(m, 'SUCATA'))).status, 200);
    const original = db.run;
    let armado = true; let outro;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (armado && typeof sql === 'string' && /SET cancelado = 1, cancelado_por/.test(sql) && Array.isArray(params) && Number(params[2]) === entradaId) {
        armado = false;
        db.run = original; // o outro estorno roda inteiro antes deste claim
        estornar(entradaId).then((r) => { outro = r; original.call(db, sql, params, cb); }, (e) => cb(e));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let e;
    try { e = await estornar(entradaId); } finally { db.run = original; }
    assert.strictEqual(armado, false, 'gancho nao disparou');
    assert.strictEqual(outro.status, 200, JSON.stringify(outro.body));
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, 'Movimentação já cancelada');
    assert.strictEqual(await fisico(m), 8);
  });

  // P6 — C12: a re-checagem da E1 so para a entrada da sucata: o perdedor de dois estornos da PERNA SUCATA ouve "ja cancelada"
  await test('P6 dois estornos da perna SUCATA, o vencedor ainda em curso: o perdedor ouve "Movimentação já cancelada", nao a E1', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 10 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    assert.strictEqual((await devolver(m, saidaId, 2, 'SUCATA')).status, 201);
    const sucataId = await ultima(m, 'SUCATA');
    const original = db.run;
    const isClaim = (sql, params) => typeof sql === 'string' && /SET cancelado = 1, cancelado_por/.test(sql) && Array.isArray(params) && Number(params[2]) === sucataId;
    let claimA = null; let claimB = null; let livroA = null; let pB = null; let respB = null; let fase = 0;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (fase === 0 && isClaim(sql, params)) { // claim do A: segura e lanca o B
        fase = 1; claimA = () => original.call(db, sql, params, cb);
        pB = estornar(sucataId).then((r) => { respB = r; if (livroA) livroA(); });
        return this;
      }
      if (fase === 1 && isClaim(sql, params)) { // claim do B: segura; roda o claim do A
        fase = 2; claimB = () => original.call(db, sql, params, cb);
        claimA();
        return this;
      }
      if (fase === 2 && typeof sql === 'string' && sql.includes('INSERT INTO movimentacoes_almoxarifado') && Array.isArray(params) && params.includes('ESTORNO')) {
        fase = 3; livroA = () => original.call(db, sql, params, cb); // A em curso: claim feito, livro nao
        claimB();
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let a;
    try { a = await estornar(sucataId); await pB; } finally { db.run = original; }
    assert.strictEqual(fase, 3, `gancho fase ${fase}`);
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    assert.strictEqual(respB.status, 400, JSON.stringify(respB.body));
    assert.strictEqual(respB.body.error, 'Movimentação já cancelada');
  });

  // P7 — D7: a ordem dentro do try da secao (o livro e a ULTIMA escrita): a serie que falha nao deixa linha ESTORNO
  await test('P7 com serie: a reversao da serie falhando no estorno da Saida: sem linha ESTORNO, sem movimento_estorno_id, fisico 0', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 1, series: ['P7A'] });
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ?', [m.id])).map((x) => x.id);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 1, serie_ids: ids });
    const original = db.get; let armado = true;
    db.get = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (armado && /SET status = 'EM_ESTOQUE', movimentacao_saida_id = NULL/.test(String(sql)) && /AND status = \?/.test(String(sql))) {
        armado = false; return cb(new Error('falha forcada da serie (f5)'));
      }
      return original.call(db, sql, params, cb);
    };
    let e; try { e = await estornar(saidaId); } finally { db.get = original; }
    assert.strictEqual(armado, false, 'gancho nao disparou');
    assert.strictEqual(e.status, 500, JSON.stringify(e.body));
    const n = (await dbGet(db, "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ESTORNO'", [m.id])).n;
    const s = await dbGet(db, 'SELECT COALESCE(cancelado,0) c, movimento_estorno_id e FROM movimentacoes_almoxarifado WHERE id = ?', [saidaId]);
    assert.deepStrictEqual([n, s.c, s.e, await fisico(m)], [0, 0, null, 0]);
  });

  // P8 — D1: o desfazer das series da saida roda UMA vez (o catch de fora nao repete: uma COMPENSACAO por serie)
  await test('P8 com serie: livro falhando no estorno da Saida: uma auditoria COMPENSACAO por serie (nao duas)', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 1, series: ['P8A'] });
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ?', [m.id])).map((x) => x.id);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 1, serie_ids: ids });
    const original = db.run; let armado = true;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (armado && typeof sql === 'string' && sql.includes('INSERT INTO movimentacoes_almoxarifado') && Array.isArray(params) && params.includes('ESTORNO')) {
        armado = false; cb.call({}, new Error('falha forcada do livro (f5)')); return this;
      }
      return original.call(db, sql, params, cb);
    };
    let e; try { e = await estornar(saidaId); } finally { db.run = original; }
    assert.strictEqual(e.status, 500);
    const n = (await dbGet(db, "SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade = 'serie' AND entidade_id = ? AND acao = 'COMPENSACAO'", [ids[0]])).n;
    assert.strictEqual(n, 1);
  });


  // ── Correcoes da Fase 5 ─────────────────────────────────────────────────────────────────────────────────────────────
  const foraDaSecao = AsyncResource.bind((fn) => fn());
  const MSG_DEV = (ref) => `A referência ${ref} é reservada às devoluções — a entrada de devolução com essa referência só é registrada pela tela de Devoluções.`;

  await test('[F5-R1/R3] a Entrada v2 recusa ENTRADA_DEVOLUCAO com a referencia DEV-<n> (antes da devolucao, com o proximo numero)', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 10 });
    const prox = ((await dbGet(db, "SELECT seq FROM sqlite_sequence WHERE name = 'devolucoes_material_almoxarifado'")) || { seq: 0 }).seq + 1;
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, tipo: 'ENTRADA_DEVOLUCAO',
      quantidade: 1, referencia: `DEV-${prox}`, motivo: 'r3', justificativa: 'x', documento_vinculado: 'NF' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, MSG_DEV(`DEV-${prox}`));
    assert.strictEqual(await fisico(m), 10);
    // controle: outra referencia passa, e a devolucao de verdade continua gravando a sua entrada
    const ok = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, tipo: 'ENTRADA_DEVOLUCAO',
      quantidade: 1, referencia: 'DEVOLVIDO-A-MAO', motivo: 'r3', justificativa: 'x', documento_vinculado: 'NF' });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const d = await devolver(m, saidaId, 2, 'SUCATA');
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    const e = await estornar(await ultima(m, 'ENTRADA_DEVOLUCAO'));
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.ok(e.body.error.startsWith(`Não é possível estornar: esta entrada é da devolução DEV-${d.body.id}`), e.body.error);
  });

  await test('[F5-R1] devolucao citando a saida com uma serie que nao saiu nela (digitada errada / de outra saida): 400, nada gravado', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['F1', 'F2'] });
    const [a, b] = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const s1 = await mov(m, { tipo: 'SAIDA', quantidade: 1, serie_ids: [a] });
    await mov(m, { tipo: 'SAIDA', quantidade: 1, serie_ids: [b] });
    const msg = (n) => `A série ${n} não saiu na saída ${s1} — informe as séries desta entrega (a lista mostra as que estão fora) `
      + 'ou registre a devolução sem citar a entrega.';
    for (const errada of ['F1X', 'F2']) {
      const d = await devolver(m, s1, 1, 'ESTOQUE', { series: [errada] });
      assert.strictEqual(d.status, 400, JSON.stringify(d.body));
      assert.strictEqual(d.body.error, msg(errada));
    }
    const n = (await dbGet(db, 'SELECT COUNT(*) n FROM devolucoes_material_almoxarifado WHERE material_id = ?', [m.id])).n;
    assert.deepStrictEqual([n, await fisico(m)], [0, 0]);
    // controle: a serie certa passa
    const ok = await devolver(m, s1, 1, 'ESTOQUE', { series: ['F1'] });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  });

  await test('[F5-R1] serie Entregue sem o vinculo (legado anterior ao vinculo) continua devolvivel citando a saida', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 1, series: ['LG1'] });
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ?', [m.id])).map((x) => x.id);
    const s1 = await mov(m, { tipo: 'SAIDA', quantidade: 1, serie_ids: ids });
    await dbRun(db, 'UPDATE series_almoxarifado SET movimentacao_saida_id = NULL WHERE material_id = ?', [m.id]);
    const d = await devolver(m, s1, 1, 'ESTOQUE', { series: ['LG1'] });
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
  });

  async function requisicaoEntregue(m, qtd) {
    const rq = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-${m.codigo}`])).lastID;
    const it = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [rq, m.id, qtd])).lastID;
    await requisitionService.separarRequisicao(db, rq, [{ item_id: it, quantidade_separada: qtd }], SUPER);
    const ent = await request(app).put(`/api/almoxarifado/requisicoes/${rq}/entregar`)
      .send({ itens_atendidos: [{ item_id: it, quantidade_atendida: qtd }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
    return { rq, saidaId: await ultima(m, 'SAIDA') };
  }

  await test('[F5-R1/C244] a entrega de uma requisicao excluida nao se devolve (era 7 com 5) e sai da lista', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const { rq, saidaId } = await requisicaoEntregue(m, 2);
    const lista = async () => (await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${m.id}`)).body
      .map((x) => x.id);
    assert.deepStrictEqual(await lista(), [saidaId], 'controle: antes de excluir a entrega esta na lista');
    const ex = await request(app).delete(`/api/almoxarifado/requisicoes/${rq}`).send({ justificativa: 'f5' });
    assert.strictEqual(ex.status, 200, JSON.stringify(ex.body));
    assert.strictEqual(await fisico(m), 5);
    const d = await devolver(m, saidaId, 2);
    assert.strictEqual(d.status, 400, JSON.stringify(d.body));
    assert.strictEqual(d.body.error, `A saída ${saidaId} é de uma requisição excluída — a exclusão já devolveu o material ao estoque`);
    assert.strictEqual(await fisico(m), 5);
    assert.deepStrictEqual(await lista(), []);
  });

  await test('[F5-R2/A1] o desfazer que falha no meio (o fisico): o catch de fora refaz SO o que faltou — fisico 3 e linhas 3', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const original = db.run;
    const estado = { livro: true, fisico: true };
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      const t = String(sql);
      if (estado.livro && t.includes('INSERT INTO movimentacoes_almoxarifado') && Array.isArray(params) && params.includes('ESTORNO')) {
        estado.livro = false; cb.call({}, new Error('falha forcada do livro (f5)')); return this;
      }
      if (!estado.livro && estado.fisico && /SET quantidade_atual = /.test(t) && Array.isArray(params) && Number(params[0]) === -2) {
        estado.fisico = false; cb.call({}, new Error('falha forcada do desfazer do fisico (f5)')); return this;
      }
      return original.call(db, sql, params, cb);
    };
    let e; try { e = await estornar(saidaId); } finally { db.run = original; }
    assert.deepStrictEqual([estado.livro, estado.fisico], [false, false], 'gancho nao disparou');
    assert.strictEqual(e.status, 500, JSON.stringify(e.body));
    assert.deepStrictEqual([await fisico(m), await linhas(m)], [3, 3]);
    assert.strictEqual((await estornar(saidaId)).status, 200);
    assert.deepStrictEqual([await fisico(m), await linhas(m)], [5, 5]);
  });

  await close();
  console.log(`
${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
