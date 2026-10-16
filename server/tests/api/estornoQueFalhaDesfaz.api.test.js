/**
 * Etapa 118 (C238, C243, C245, C240; B769-B772) — o estorno que falha no meio desfaz tudo, em todos os ramos.
 *
 * Ate a 118 so os ramos de ENTRADA e SAIDA de `cancelarMovimentacao` tinham desfazer: com o INSERT do livro falhando, o estorno
 * de BLOQUEIO, DESBLOQUEIO, AJUSTE e TRANSFERENCIA respondia 500 com `cancelado = 0` e o efeito aplicado (bloqueado 2 -> 0;
 * AJUSTE com localizacao: 7 -> 5 e, no estorno seguinte, 3). No ramo de entrada as series e o livro rodavam fora da trava
 * (C243: a devolucao do meio passava, fisico 4 com 2 series); e a serie que ja tinha mudado se perdia quando a seguinte falhava
 * (C245). A C240: a devolucao no meio de um estorno de saida ouvia que o estorno tinha acontecido.
 *
 * Moldes: `estornoLivroNaTrava.api.test.js` (gancho no db.run; o "do meio" disparado FORA do contexto da secao por
 * AsyncResource — de dentro ele herdaria a secao e passaria pela trava como se ja a tivesse).
 *
 * Executar: cd server && node tests/api/estornoQueFalhaDesfaz.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { AsyncResource } = require('async_hooks');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const seriesService = require('../../services/almoxarifado/seriesService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };

(async () => {
  const { app, db, close } = await createTestApp({ user: SUPER });
  const foraDaSecao = AsyncResource.bind((fn) => fn());
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `EF118-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, codigo])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const loc = async () => (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?, 'ef118', 1)",
    [`EF118-L${++seq}`])).lastID;
  const ultimo = async (m, tipo) => (await dbGet(db,
    'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1', [m.id, tipo])).id;
  const mov = async (m, body) => {
    if (['BLOQUEIO', 'DESBLOQUEIO'].includes(body.tipo)) {
      // a rota v2 nao aceita bloqueio (so as telas de Reservas e Inspecoes): direto no motor, como em estorno.api.test.js
      await stockService.registrarMovimentacao(db, SUPER, { material_id: m.id, motivo: 'ef118', justificativa: 'ef118', ...body });
      return ultimo(m, body.tipo);
    }
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'ef118',
      justificativa: 'preparo ef118', documento_vinculado: 'NF-EF118', ...body });
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    return ultimo(m, body.tipo);
  };
  const estornar = (movId) => request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'ef118' });
  const devolver = (m, saidaId, quantidade, extra = {}) => request(app).post('/api/almoxarifado/devolucoes')
    .send({ material_id: m.id, quantidade, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId, ...extra });
  const mat = async (m) => dbGet(db, 'SELECT quantidade_atual f, COALESCE(quantidade_bloqueada, 0) b FROM materiais_almoxarifado WHERE id = ?', [m.id]);
  const fisico = async (m) => (await mat(m)).f;
  const bloqueado = async (m) => (await mat(m)).b;
  const somaLinhas = async (m) => (await dbGet(db,
    'SELECT COALESCE(SUM(quantidade), 0) t FROM estoque_saldo_almoxarifado WHERE material_id = ?', [m.id])).t;
  const linha = async (m, l) => (await dbGet(db,
    'SELECT COALESCE(SUM(quantidade), 0) q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?', [m.id, l])).q;
  const cancelado = async (id) => (await dbGet(db, 'SELECT COALESCE(cancelado, 0) c FROM movimentacoes_almoxarifado WHERE id = ?', [id])).c;
  const estornos = async (m) => (await dbGet(db,
    "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ESTORNO'", [m.id])).n;
  const series = async (m) => (await dbAll(db, 'SELECT status FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id]))
    .map((x) => x.status);
  const saidaDe = (m, quantidade) => () => stockService.registrarMovimentacao(db, SUPER, { material_id: m.id, tipo: 'SAIDA',
    quantidade, motivo: 'meio', justificativa: 'meio', documento_vinculado: 'NF-MEIO' });

  /**
   * Roda `fn` com o INSERT da linha ESTORNO falhando uma vez. Se `meio` vier, ele e disparado (fora da secao) no instante do
   * INSERT, e o INSERT so falha depois de ele terminar ou de 150 ms (o que vier antes) — com a trava, ele espera ate o fim.
   */
  async function comLivroFalhando(fn, meio) {
    const original = db.run;
    const estado = { armado: true };
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (estado.armado && typeof sql === 'string' && sql.includes('INSERT INTO movimentacoes_almoxarifado')
        && Array.isArray(params) && params.includes('ESTORNO')) {
        estado.armado = false;
        estado.meio = meio ? foraDaSecao(() => meio().then((ok) => ({ ok }), (err) => ({ err: err.message }))) : null;
        estado.terminouAntes = false;
        estado.falhou = false;
        const espera = estado.meio
          ? Promise.race([estado.meio.then(() => { if (!estado.falhou) estado.terminouAntes = true; }),
            new Promise((r) => setTimeout(r, 150))])
          : Promise.resolve();
        espera.then(() => { estado.falhou = true; cb.call({}, new Error('falha forcada do livro do estorno (teste)')); });
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res;
    try { res = await fn(); } finally { db.run = original; }
    assert.strictEqual(estado.armado, false, 'gancho nao disparou');
    return { res, meio: estado.meio ? await estado.meio : null, terminouAntes: estado.terminouAntes };
  }

  /** Roda `fn` com a auditoria `acao` falhando na N-esima vez (a serie N ja mudou de status: o UPDATE vem antes). */
  async function comAuditoriaFalhando(acao, n, fn) {
    const original = db.run;
    let vistas = 0; let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && sql.includes('INSERT INTO auditoria_log_almoxarifado')
        && Array.isArray(params) && params.includes(acao) && ++vistas === n) {
        disparou = true;
        setImmediate(() => cb.call({}, new Error(`falha forcada da auditoria ${acao} (teste)`)));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res;
    try { res = await fn(); } finally { db.run = original; }
    assert.ok(disparou, 'gancho da auditoria nao disparou');
    return res;
  }

  console.log('\n=== Etapa 118: o estorno que falha no meio desfaz tudo ===\n');

  // ── C238: os ramos que nao tinham desfazer ──────────────────────────────────────────────────────────────────────────
  await test('[RN-01] BLOQUEIO: livro falhando -> 500, bloqueado volta a 2, sem linha ESTORNO; de novo -> 200, bloqueado 0', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const id = await mov(m, { tipo: 'BLOQUEIO', quantidade: 2 });
    const { res } = await comLivroFalhando(() => estornar(id));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.strictEqual(await bloqueado(m), 2, 'o bloqueio ficou desfeito com o BLOQUEIO de pe no livro');
    assert.strictEqual(await cancelado(id), 0);
    assert.strictEqual(await estornos(m), 0);
    const r = await estornar(id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await bloqueado(m), 0);
    assert.strictEqual(await fisico(m), 5);
  });

  await test('[RN-02] DESBLOQUEIO: livro falhando -> 500, bloqueado volta a 0; de novo -> 200, bloqueado 2 (era 4)', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    await mov(m, { tipo: 'BLOQUEIO', quantidade: 2 });
    const id = await mov(m, { tipo: 'DESBLOQUEIO', quantidade: 2 });
    const { res } = await comLivroFalhando(() => estornar(id));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.strictEqual(await bloqueado(m), 0);
    assert.strictEqual(await cancelado(id), 0);
    assert.strictEqual((await estornar(id)).status, 200);
    assert.strictEqual(await bloqueado(m), 2);
  });

  await test('[RN-03] AJUSTE sem localizacao: livro falhando -> 500, fisico e linhas 7; de novo -> 200, fisico 5', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const id = await mov(m, { tipo: 'AJUSTE', quantidade: 7 });
    const { res } = await comLivroFalhando(() => estornar(id));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.strictEqual(await fisico(m), 7);
    assert.strictEqual(await somaLinhas(m), 7);
    assert.strictEqual(await cancelado(id), 0);
    assert.strictEqual((await estornar(id)).status, 200);
    assert.strictEqual(await fisico(m), 5);
    assert.strictEqual(await somaLinhas(m), 5);
  });

  await test('[RN-04] AJUSTE com localizacao: livro falhando -> 500, fisico e linha 7; de novo -> 200, fisico 5 (era 3)', async () => {
    const m = await material();
    const L = await loc();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: L });
    const id = await mov(m, { tipo: 'AJUSTE', quantidade: 7, localizacao_destino_id: L });
    const { res } = await comLivroFalhando(() => estornar(id));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.strictEqual(await fisico(m), 7);
    assert.strictEqual(await linha(m, L), 7);
    assert.strictEqual(await cancelado(id), 0);
    assert.strictEqual((await estornar(id)).status, 200);
    assert.strictEqual(await fisico(m), 5);
    assert.strictEqual(await linha(m, L), 5);
  });

  await test('[RN-05] TRANSFERENCIA: livro falhando -> 500, A 2 e B 3; de novo -> 200, A 5 e B 0', async () => {
    const m = await material();
    const A = await loc(); const B = await loc();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: A });
    const id = await mov(m, { tipo: 'TRANSFERENCIA', quantidade: 3, localizacao_origem_id: A, localizacao_destino_id: B });
    const { res } = await comLivroFalhando(() => estornar(id));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.deepStrictEqual([await linha(m, A), await linha(m, B)], [2, 3]);
    assert.strictEqual(await fisico(m), 5);
    assert.strictEqual(await cancelado(id), 0);
    const r = await estornar(id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual([await linha(m, A), await linha(m, B)], [5, 0]);
  });

  await test('[RN-06a] BLOQUEIO: livro falhando com uma Saida de 5 no meio -> a Saida espera e recusa; fisico 5, bloqueado 2', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const id = await mov(m, { tipo: 'BLOQUEIO', quantidade: 2 });
    const { res, meio, terminouAntes } = await comLivroFalhando(() => estornar(id), saidaDe(m, 5));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.strictEqual(terminouAntes, false, `a Saida do meio nao esperou a trava (${JSON.stringify(meio)})`);
    assert.ok(meio.err, `a Saida do meio levou o que o estorno tinha soltado: ${JSON.stringify(meio)}`);
    assert.deepStrictEqual([await fisico(m), await bloqueado(m)], [5, 2]);
    assert.strictEqual(await cancelado(id), 0);
  });

  await test('[RN-06b] AJUSTE que baixou (7 -> 5): estorno com o livro falhando e uma Saida de 7 no meio -> recusada, fisico 5', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 7 });
    const id = await mov(m, { tipo: 'AJUSTE', quantidade: 5 });
    const { res, meio, terminouAntes } = await comLivroFalhando(() => estornar(id), saidaDe(m, 7));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.strictEqual(terminouAntes, false, `a Saida do meio nao esperou a trava (${JSON.stringify(meio)})`);
    assert.ok(meio.err, `a Saida do meio passou: ${JSON.stringify(meio)}`);
    assert.strictEqual(await fisico(m), 5);
    assert.strictEqual(await somaLinhas(m), 5);
  });

  // ── C243: o ramo de entrada sob a trava ─────────────────────────────────────────────────────────────────────────────
  await test('[RN-07] estorno da entrada da devolucao com o livro falhando e uma devolucao avulsa das mesmas series no meio -> a do meio espera e recusa; fisico 2, 2 series', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['R7A', 'R7B'] });
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: ids });
    const d = await devolver(m, saidaId, 2, { series: ['R7A', 'R7B'] });
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    const entDev = await ultimo(m, 'ENTRADA_DEVOLUCAO');
    const { res, meio, terminouAntes } = await comLivroFalhando(() => estornar(entDev),
      () => devolver(m, null, 2, { series: ['R7A', 'R7B'] }).then((r) => {
        if (r.status !== 201) throw new Error(`${r.status} ${r.body && r.body.error}`);
        return r.body;
      }));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.strictEqual(terminouAntes, false, `a devolucao do meio nao esperou a trava (${JSON.stringify(meio)})`);
    assert.ok(meio.err, `a devolucao do meio passou: ${JSON.stringify(meio)}`);
    assert.strictEqual(await fisico(m), 2);
    assert.deepStrictEqual(await series(m), ['EM_ESTOQUE', 'EM_ESTOQUE']);
    assert.strictEqual(await cancelado(entDev), 0);
  });

  await test('[RN-07] sem serie: estorno de entrada com o livro falhando e uma Saida de 5 no meio -> a Saida espera (passa depois, fisico 0)', async () => {
    const m = await material();
    const id = await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const { res, meio, terminouAntes } = await comLivroFalhando(() => estornar(id), saidaDe(m, 5));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.strictEqual(terminouAntes, false, `a Saida do meio nao esperou a trava (${JSON.stringify(meio)})`);
    assert.ok(meio.ok, JSON.stringify(meio));
    assert.strictEqual(await fisico(m), 0);
    assert.strictEqual(await somaLinhas(m), 0);
    assert.strictEqual(await cancelado(id), 0);
  });

  // ── C245: a serie que ja mudou entra no desfazer ────────────────────────────────────────────────────────────────────
  await test('[RN-08a] estorno de Saida de 2 series com a auditoria da 2a falhando -> as duas voltam a Entregue, fisico 0; de novo -> 200', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['R8A', 'R8B'] });
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: ids });
    const res = await comAuditoriaFalhando('ESTORNO_SAIDA', 2, () => estornar(saidaId));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.deepStrictEqual(await series(m), ['ENTREGUE', 'ENTREGUE']);
    const vinc = await dbAll(db, 'SELECT movimentacao_saida_id s FROM series_almoxarifado WHERE material_id = ?', [m.id]);
    assert.ok(vinc.every((x) => x.s === saidaId), JSON.stringify(vinc));
    assert.strictEqual(await fisico(m), 0);
    assert.strictEqual(await cancelado(saidaId), 0);
    const r = await estornar(saidaId);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await series(m), ['EM_ESTOQUE', 'EM_ESTOQUE']);
    assert.strictEqual(await fisico(m), 2);
  });

  await test('[RN-08b] estorno de Entrada de 2 series com a auditoria da 2a falhando -> as duas Em estoque, fisico 2; de novo -> 200', async () => {
    const m = await material({ controle_serie: 1 });
    const id = await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['R8C', 'R8D'] });
    const res = await comAuditoriaFalhando('ESTORNO_ENTRADA', 2, () => estornar(id));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.deepStrictEqual(await series(m), ['EM_ESTOQUE', 'EM_ESTOQUE']);
    assert.strictEqual(await fisico(m), 2);
    assert.strictEqual(await cancelado(id), 0);
    const r = await estornar(id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await series(m), ['ESTORNADA', 'ESTORNADA']);
    assert.strictEqual(await fisico(m), 0);
  });

  await test('[RN-08c] o desfazer das series consome a lista: a 2a vez nao desfaz nem audita de novo', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['R8E', 'R8F'] });
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: ids });
    const afetadas = [];
    const devolvidas = await seriesService.reverterSaida(db, SUPER, saidaId, { afetadas });
    assert.strictEqual(devolvidas, afetadas, 'o acumulador do chamador nao e o devolvido');
    assert.strictEqual(afetadas.length, 2);
    await seriesService.desfazerReverterSaida(db, afetadas);
    assert.strictEqual(afetadas.length, 0, 'a lista nao foi consumida');
    await seriesService.desfazerReverterSaida(db, afetadas);
    const n = (await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade = 'serie' AND acao = 'COMPENSACAO'
      AND entidade_id IN (${ids.join(',')})`)).n;
    assert.strictEqual(n, 2);
    assert.deepStrictEqual(await series(m), ['ENTREGUE', 'ENTREGUE']);
  });

  // ── Fase 2 (achado 1): bloquear uma serie no meio de um estorno de entrada ──────────────────────────────────────────
  await test('[RN-10] estorno de Entrada de 2 series com o bloqueio da 2a pela tela no meio -> o bloqueio espera e recusa; 200, as duas Estornada, fisico 0', async () => {
    const m = await material({ controle_serie: 1 });
    const id = await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['RAA', 'RAB'] });
    const rb = (await dbGet(db, "SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = 'RAB'", [m.id])).id;
    const original = db.run;
    const estado = { armado: true, terminouAntes: false, seguiu: false };
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (estado.armado && typeof sql === 'string' && sql.includes('INSERT INTO auditoria_log_almoxarifado')
        && Array.isArray(params) && params.includes('ESTORNO_ENTRADA')) {
        // a 1a serie ja mudou; a 2a ainda nao — o bloqueio dela entra agora, fora da secao
        estado.armado = false;
        estado.meio = foraDaSecao(() => request(app).put(`/api/almoxarifado/series/${rb}/status`)
          .send({ status: 'BLOQUEADA', justificativa: 'meio' }).then((r) => ({ status: r.status, error: r.body && r.body.error })));
        Promise.race([estado.meio.then(() => { if (!estado.seguiu) estado.terminouAntes = true; }),
          new Promise((r) => setTimeout(r, 150))])
          .then(() => { estado.seguiu = true; original.call(db, sql, params, cb); });
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res;
    try { res = await estornar(id); } finally { db.run = original; }
    assert.strictEqual(estado.armado, false, 'gancho nao disparou');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const meio = await estado.meio;
    assert.strictEqual(estado.terminouAntes, false, `o bloqueio do meio nao esperou a trava (${JSON.stringify(meio)})`);
    assert.deepStrictEqual(meio, { status: 400, error: 'transicao invalida: ESTORNADA -> BLOQUEADA' });
    assert.deepStrictEqual(await series(m), ['ESTORNADA', 'ESTORNADA']);
    assert.strictEqual(await fisico(m), 0);
  });

  await test('[RN-10] controle: fora de estorno, bloquear e desbloquear a serie continua como antes', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 1, series: ['RAC'] });
    const sid = (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ?', [m.id])).id;
    const b = await request(app).put(`/api/almoxarifado/series/${sid}/status`).send({ status: 'BLOQUEADA', justificativa: 'c' });
    assert.strictEqual(b.status, 200, JSON.stringify(b.body));
    const d = await request(app).put(`/api/almoxarifado/series/${sid}/status`).send({ status: 'EM_ESTOQUE', justificativa: 'c' });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    const x = await request(app).put('/api/almoxarifado/series/999999/status').send({ status: 'BLOQUEADA', justificativa: 'c' });
    assert.strictEqual(x.status, 404, JSON.stringify(x.body));
  });

  // ── Fase 5 (revisor 1): as guardas das series sob a trava, e a linha ja debitada no claim sem lote ──────────────────
  /** Dispara `meio` fora da secao no instante do claim do estorno e so deixa o claim seguir quando ele termina. */
  async function noClaim(meio, fn) {
    const original = db.run;
    const st = { armado: true };
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (st.armado && typeof sql === 'string' && sql.includes('SET cancelado = 1')) {
        st.armado = false;
        st.meio = foraDaSecao(() => meio());
        st.meio.then(() => original.call(db, sql, params, cb), () => original.call(db, sql, params, cb));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res;
    try { res = await fn(); } finally { db.run = original; }
    assert.strictEqual(st.armado, false, 'gancho do claim nao disparou');
    return { res, meio: await st.meio };
  }
  const presentes = async (m) => (await dbGet(db,
    "SELECT COUNT(*) n FROM series_almoxarifado WHERE material_id = ? AND status IN ('EM_ESTOQUE', 'BLOQUEADA')", [m.id])).n;

  await test('[RN-11] estorno de Entrada de 2 series com o bloqueio da 2a entre a guarda e a secao -> 400, nada tocado: fisico 2, 2 presentes', async () => {
    const m = await material({ controle_serie: 1 });
    const id = await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['RBA', 'RBB'] });
    const sb = (await dbGet(db, "SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = 'RBB'", [m.id])).id;
    const { res, meio } = await noClaim(
      () => request(app).put(`/api/almoxarifado/series/${sb}/status`).send({ status: 'BLOQUEADA', justificativa: 'meio' })
        .then((r) => r.status),
      () => estornar(id));
    assert.strictEqual(meio, 200);
    assert.strictEqual(res.status, 400, `o estorno passou pulando a serie bloqueada: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, 'estorno de entrada recusado: ha series desta entrada ja movimentadas — estorne as saidas primeiro');
    assert.deepStrictEqual([await fisico(m), await presentes(m), await cancelado(id), await estornos(m)], [2, 2, 0, 0]);
  });

  await test('[RN-12] estorno de Saida de 2 series com a Entrada de uma delas entre a guarda e a secao -> 400, nada creditado: fisico 1, 1 presente', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['RCA', 'RCB'] });
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: ids });
    const { res, meio } = await noClaim(
      () => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, tipo: 'ENTRADA', quantidade: 1,
        series: ['RCB'], motivo: 'meio', justificativa: 'meio', documento_vinculado: 'NF-MEIO' }).then((r) => r.status),
      () => estornar(saidaId));
    assert.strictEqual(meio, 201);
    assert.strictEqual(res.status, 400, `o estorno creditou sem a serie voltar: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error,
      'estorno de saida recusado: series desta saida ja reentraram no estoque — a devolucao ja repos o material');
    assert.deepStrictEqual([await fisico(m), await presentes(m), await cancelado(saidaId)], [1, 1, 0]);
  });

  await test('[RN-13] estorno de Entrada que debita duas linhas sem lote, com o debito da 2a falhando -> 500, as duas linhas de volta; de novo -> 200', async () => {
    const m = await material();
    const A = await loc(); const B = await loc();
    const entradaA = await mov(m, { tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: A });
    await mov(m, { tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: B });
    await mov(m, { tipo: 'SAIDA', quantidade: 3, localizacao_origem_id: A });
    assert.deepStrictEqual([await linha(m, A), await linha(m, B), await fisico(m)], [2, 5, 7]);
    // o estorno da entrada de A debita A (2) e depois B (3): a 2a escrita na linha de B falha
    const original = db.get;
    let vistas = 0; let disparou = false;
    db.get = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && /UPDATE estoque_saldo_almoxarifado/.test(String(sql)) && /RETURNING id/.test(String(sql)) && ++vistas === 2) {
        disparou = true;
        setImmediate(() => cb.call({}, new Error('falha forcada do debito da 2a linha (teste)')));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res;
    try { res = await estornar(entradaA); } finally { db.get = original; }
    assert.ok(disparou, 'gancho nao disparou');
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.deepStrictEqual([await linha(m, A), await linha(m, B), await fisico(m), await somaLinhas(m)], [2, 5, 7, 7],
      'a linha ja debitada nao voltou');
    assert.strictEqual(await cancelado(entradaA), 0);
    const r = await estornar(entradaA);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual([await linha(m, A), await linha(m, B), await fisico(m)], [0, 2, 2]);
  });

  await test('[RN-14] o claim e desfeito UMA vez: um 2o estorno que ganha o claim entre o desfazer de dentro e o catch de fora conclui de verdade (cancelado 1, fisico 10)', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 10 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const est = (id) => stockService.cancelarMovimentacao(db, SUPER, id, 'ef118').then((r) => ({ ok: r.estorno_id }), (e) => ({ err: e.message }));
    const original = db.run;
    const st = { livro: true, dentro: true, claimE2: null };
    let e2 = null;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      const s = String(sql);
      if (st.livro && s.includes('INSERT INTO movimentacoes_almoxarifado') && Array.isArray(params) && params.includes('ESTORNO')) {
        st.livro = false;
        setImmediate(() => cb.call({}, new Error('falha forcada do livro do estorno (teste)')));
        return this;
      }
      if (!st.livro && st.dentro && s.includes('SET cancelado = 0')) {
        // o desfazer de dentro gravou cancelado = 0: um 2o estorno chega agora, e o 1o so segue quando o claim dele gravou
        st.dentro = false;
        return original.call(db, sql, params, function (err) {
          const ctx = this;
          e2 = foraDaSecao(() => est(saidaId));
          const t0 = Date.now();
          const espera = () => (st.claimE2 || Date.now() - t0 > 150 ? cb.call(ctx, err) : setTimeout(espera, 2));
          espera();
        });
      }
      if (!st.dentro && s.includes('SET cancelado = 1')) {
        return original.call(db, sql, params, function (err) { st.claimE2 = this.changes; cb.call(this, err); });
      }
      return original.call(db, sql, params, cb);
    };
    let r1;
    try { r1 = await est(saidaId); } finally { db.run = original; }
    assert.ok(r1.err, JSON.stringify(r1));
    assert.ok(e2, 'o 2o estorno nao foi disparado');
    const r2 = await e2;
    assert.ok(r2.ok, `o 2o estorno nao concluiu: ${JSON.stringify(r2)}`);
    assert.strictEqual(st.claimE2, 1, 'o claim do 2o estorno nao caiu entre os dois desfazeres');
    const o = await dbGet(db, 'SELECT COALESCE(cancelado, 0) c, movimento_estorno_id e FROM movimentacoes_almoxarifado WHERE id = ?', [saidaId]);
    assert.deepStrictEqual([o.c, o.e, await estornos(m), await fisico(m)], [1, r2.ok, 1, 10],
      'o desfazer de fora apagou o claim do 2o estorno');
    const r3 = await estornar(saidaId);
    assert.strictEqual(r3.status, 400, `o 3o estorno creditou de novo: ${JSON.stringify(r3.body)}`);
    assert.strictEqual(await fisico(m), 10);
  });

  // ── Fase 5 (revisor 3): as sabotagens que ficaram sem prova ────────────────────────────────────────────────────────
  const linhaRow = async (m, l) => dbGet(db, 'SELECT id, quantidade q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?', [m.id, l]);
  // gancho generico: a 1a chamada de db.run que satisfaz `pred` falha (opcionalmente com `meio` disparado fora da secao antes)
  async function comFalha(pred, fn, meio) {
    const original = db.run; const st = { armado: true };
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (st.armado && typeof sql === 'string' && pred(sql, params || [])) {
        st.armado = false;
        st.meio = meio ? foraDaSecao(() => meio()) : null;
        const espera = st.meio ? Promise.race([st.meio, new Promise((r) => setTimeout(r, 150))]) : Promise.resolve();
        espera.then(() => cb.call({}, new Error('falha forcada (teste)')));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res; try { res = await fn(); } finally { db.run = original; }
    assert.strictEqual(st.armado, false, 'gancho nao disparou');
    return { res, meio: st.meio ? await st.meio : null };
  }
  const ehLivro = (sql, p) => sql.includes('INSERT INTO movimentacoes_almoxarifado') && p.includes('ESTORNO');


  await test('[Fase 5 P2] (S22/S23) AJUSTE com localizacao num material com total divergente das linhas: livro falhando -> o total volta exato (8)', async () => {
    const m = await material(); const L = await loc();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: L });
    const id = await mov(m, { tipo: 'AJUSTE', quantidade: 7, localizacao_destino_id: L });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 8 WHERE id = ?', [m.id]); // divergencia legada: linha 7, total 8
    const { res } = await comFalha(ehLivro, () => estornar(id));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.deepStrictEqual([await fisico(m), await linha(m, L), await cancelado(id)], [8, 7, 0]);
  });

  await test('[Fase 5 P3] (S16) TRANSFERENCIA: o UPDATE da origem falha -> A 2, B 3 (a origem nao e "desfeita" sem ter mudado)', async () => {
    const m = await material(); const A = await loc(); const B = await loc();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: A });
    const id = await mov(m, { tipo: 'TRANSFERENCIA', quantidade: 3, localizacao_origem_id: A, localizacao_destino_id: B });
    const la = await linhaRow(m, A);
    const { res } = await comFalha((sql, p) => sql.includes('UPDATE estoque_saldo_almoxarifado') && sql.includes('+ ?') && p[0] === 3 && p[1] === la.id,
      () => estornar(id));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.deepStrictEqual([await linha(m, A), await linha(m, B), await cancelado(id)], [2, 3, 0]);
  });

  await test('[Fase 5 P4] (S17) TRANSFERENCIA: o UPDATE do destino falha -> A 2, B 3', async () => {
    const m = await material(); const A = await loc(); const B = await loc();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: A });
    const id = await mov(m, { tipo: 'TRANSFERENCIA', quantidade: 3, localizacao_origem_id: A, localizacao_destino_id: B });
    const lb = await linhaRow(m, B);
    const { res } = await comFalha((sql, p) => sql.includes('UPDATE estoque_saldo_almoxarifado') && sql.includes('- ?') && p[0] === 3 && p[1] === lb.id,
      () => estornar(id));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.deepStrictEqual([await linha(m, A), await linha(m, B), await cancelado(id)], [2, 3, 0]);
  });

  await test('[Fase 5 P5] (S31) AJUSTE sem localizacao: o sync da linha padrao falha -> fisico 7, linhas 7', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const id = await mov(m, { tipo: 'AJUSTE', quantidade: 7 });
    const { res } = await comFalha((sql) => sql.startsWith('UPDATE estoque_saldo_almoxarifado SET quantidade = ?, updated_at'), () => estornar(id));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.deepStrictEqual([await fisico(m), await somaLinhas(m), await cancelado(id)], [7, 7, 0]);
  });

  await test('[Fase 5 P6] (S38) desfazerReverterEntrada consome a lista: a 2a vez nao desfaz nem audita de novo', async () => {
    const m = await material({ controle_serie: 1 });
    const entId = await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['P6A', 'P6B'] });
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const afetadas = [];
    await seriesService.reverterEntrada(db, SUPER, entId, { afetadas });
    assert.strictEqual(afetadas.length, 2);
    await seriesService.desfazerReverterEntrada(db, afetadas);
    assert.strictEqual(afetadas.length, 0, 'a lista nao foi consumida');
    await seriesService.desfazerReverterEntrada(db, afetadas);
    const n = (await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade = 'serie' AND acao = 'COMPENSACAO' AND entidade_id IN (${ids.join(',')})`)).n;
    assert.strictEqual(n, 2);
    assert.deepStrictEqual(await series(m), ['EM_ESTOQUE', 'EM_ESTOQUE']);
  });

  await test('[Fase 5 P8] (S18) TRANSFERENCIA: livro falhando e o desfazer da ORIGEM falhando -> o catch de fora refaz so a origem: A 2, B 3', async () => {
    const m = await material(); const A = await loc(); const B = await loc();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: A });
    const id = await mov(m, { tipo: 'TRANSFERENCIA', quantidade: 3, localizacao_origem_id: A, localizacao_destino_id: B });
    const la = await linhaRow(m, A);
    const original = db.run; let livro = false; let des = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      const p = params || [];
      if (!livro && typeof sql === 'string' && ehLivro(sql, p)) { livro = true; setImmediate(() => cb.call({}, new Error('livro (sonda)'))); return this; }
      if (livro && !des && typeof sql === 'string' && sql.includes('UPDATE estoque_saldo_almoxarifado') && p[0] === -3 && p[1] === la.id) {
        des = true; setImmediate(() => cb.call({}, new Error('desfazer origem (sonda)'))); return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res; try { res = await estornar(id); } finally { db.run = original; }
    assert.ok(livro && des, 'ganchos nao dispararam');
    assert.strictEqual(res.status, 500);
    assert.deepStrictEqual([await linha(m, A), await linha(m, B), await cancelado(id)], [2, 3, 0]);
  });

  await test('[Fase 5 P9] (S26) AJUSTE com localizacao recusado por "a localizacao nao comporta": a linha e o fisico ficam como estavam', async () => {
    const m = await material(); const L = await loc();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: L });
    const id = await mov(m, { tipo: 'AJUSTE', quantidade: 7, localizacao_destino_id: L });
    await mov(m, { tipo: 'SAIDA', quantidade: 7, localizacao_origem_id: L });
    const r = await estornar(id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Não é possível estornar: a localização não comporta a reversão (saldo já consumido)');
    assert.deepStrictEqual([await fisico(m), await linha(m, L), await cancelado(id)], [0, 0, 0]);
  });

  // ── C240: a devolucao no meio do estorno da saida ───────────────────────────────────────────────────────────────────
  await test('[RN-09] devolucao no meio de um estorno de Saida que falha -> 400 "esta sendo estornada", nada gravado; depois 201', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const { res, meio } = await comLivroFalhando(() => estornar(saidaId),
      () => devolver(m, saidaId, 2).then((r) => ({ status: r.status, error: r.body && r.body.error })));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.deepStrictEqual(meio.ok, { status: 400, error: `A saída ${saidaId} tem um estorno em andamento que ainda não concluiu — nada foi gravado. Tente de novo em instantes; se a recusa continuar, o estorno foi interrompido: avise o administrador do almoxarifado.` });
    const n = (await dbGet(db, 'SELECT COUNT(*) n FROM devolucoes_material_almoxarifado WHERE movimentacao_saida_id = ?', [saidaId])).n;
    assert.strictEqual(n, 0);
    assert.strictEqual(await fisico(m), 3);
    const d = await devolver(m, saidaId, 2);
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    assert.strictEqual(await fisico(m), 5);
  });

  await test('[RN-09] a saida estornada de verdade continua com a literal de sempre', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    assert.strictEqual((await estornar(saidaId)).status, 200);
    const d = await devolver(m, saidaId, 2);
    assert.strictEqual(d.status, 400);
    assert.strictEqual(d.body.error, `A saída ${saidaId} foi cancelada (estornada) — o estorno já devolveu o material`);
  });

  // ── controles: o caminho feliz de cada ramo continua o de sempre ─────────────────────────────────────────────────────
  await test('[controle] sem falha: bloqueio, desbloqueio, ajuste com e sem localizacao e transferencia estornam com uma linha ESTORNO cada', async () => {
    const m = await material();
    const A = await loc(); const B = await loc();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: A });
    const blq = await mov(m, { tipo: 'BLOQUEIO', quantidade: 2 });
    assert.strictEqual((await estornar(blq)).status, 200);
    await mov(m, { tipo: 'BLOQUEIO', quantidade: 1 });
    const des = await mov(m, { tipo: 'DESBLOQUEIO', quantidade: 1 });
    assert.strictEqual((await estornar(des)).status, 200);
    assert.strictEqual(await bloqueado(m), 1);
    const tr = await mov(m, { tipo: 'TRANSFERENCIA', quantidade: 3, localizacao_origem_id: A, localizacao_destino_id: B });
    assert.strictEqual((await estornar(tr)).status, 200);
    const aj = await mov(m, { tipo: 'AJUSTE', quantidade: 8, localizacao_destino_id: A });
    assert.strictEqual((await estornar(aj)).status, 200);
    assert.deepStrictEqual([await fisico(m), await linha(m, A), await linha(m, B)], [5, 5, 0]);
    assert.strictEqual(await estornos(m), 4);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
