/**
 * Etapa 119 (C249, C248, C242; B775, B776) — o que ja valeu nao se perde nem responde erro.
 *
 * C249: a saida com lote que debita mais de um endereco e falha no meio perdia o endereco ja debitado (`claimSaldoDoLote`
 * acumulava num array local: lote em A 3 e B 3, saida de 5 com o 2o debito falhando -> 500, fisico 6, A 0 e B 3).
 * C248: a auditoria CANCELAMENTO que falhava depois do estorno concluido respondia 500 e pulava o resto (pedido, recalculo,
 * alerta, aviso). C242: desfeita a devolucao e estornada a saida, a entrada original das series nao estornava mais (a
 * reativacao da devolucao trocava a entrada da serie e ninguem guardava a anterior).
 *
 * Moldes: `estornoQueFalhaDesfaz.api.test.js` (ganchos no db.get / db.run).
 *
 * Executar: cd server && node tests/api/oQueJaValeuNaoSePerde.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

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
    const codigo = `OJV119-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, codigo])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const loc = async () => (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?, 'ojv119', 1)",
    [`OJV119-L${++seq}`])).lastID;
  const ultimo = async (m, tipo) => (await dbGet(db,
    'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1', [m.id, tipo])).id;
  const v2 = (m, body) => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'ojv119',
    justificativa: 'ojv119', documento_vinculado: 'NF-OJV119', ...body });
  const mov = async (m, body) => {
    const r = await v2(m, body);
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    return ultimo(m, body.tipo);
  };
  const estornar = (movId) => request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'ojv119' });
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual f FROM materiais_almoxarifado WHERE id = ?', [m.id])).f;
  const linha = async (m, l) => (await dbGet(db,
    'SELECT COALESCE(SUM(quantidade), 0) q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?', [m.id, l])).q;
  const somaLinhas = async (m) => (await dbGet(db,
    'SELECT COALESCE(SUM(quantidade), 0) t FROM estoque_saldo_almoxarifado WHERE material_id = ?', [m.id])).t;
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const cancelado = async (id) => (await dbGet(db, 'SELECT COALESCE(cancelado, 0) c FROM movimentacoes_almoxarifado WHERE id = ?', [id])).c;
  const series = async (m) => dbAll(db,
    'SELECT numero, status, movimentacao_entrada_id e, movimentacao_saida_id s FROM series_almoxarifado WHERE material_id = ? ORDER BY numero',
    [m.id]);

  /** O N-esimo `UPDATE estoque_saldo_almoxarifado ... RETURNING id` (o debito de uma linha do lote) falha. */
  async function comDebitoFalhando(n, fn) {
    const original = db.get;
    let vistos = 0; let disparou = false;
    db.get = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && sql.includes('UPDATE estoque_saldo_almoxarifado') && sql.includes('RETURNING id')
        && ++vistos === n) {
        disparou = true;
        setImmediate(() => cb.call({}, new Error('falha forcada do debito do endereco (teste)')));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res;
    try { res = await fn(); } finally { db.get = original; }
    assert.ok(disparou, 'gancho do debito nao disparou');
    return res;
  }

  /** O N-esimo credito de volta de linha (`UPDATE estoque_saldo_almoxarifado SET quantidade = ... quantidade + ?`) falha. */
  async function comCreditoFalhando(n, fn) {
    const original = db.run;
    let vistos = 0; let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && sql.includes('UPDATE estoque_saldo_almoxarifado') && sql.includes('quantidade + ?')
        && ++vistos === n) {
        disparou = true;
        setImmediate(() => cb.call({}, new Error('falha forcada do credito de volta (teste)')));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res;
    try { res = await fn(); } finally { db.run = original; }
    assert.ok(disparou, 'gancho do credito nao disparou');
    return res;
  }

  /** A auditoria `acao` falha uma vez. */
  async function comAuditoriaFalhando(acao, fn) {
    const original = db.run;
    let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && sql.includes('INSERT INTO auditoria_log_almoxarifado')
        && Array.isArray(params) && params.includes(acao)) {
        disparou = true;
        setImmediate(() => cb.call({}, new Error(`falha forcada da auditoria ${acao} (teste)`)));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res;
    try { res = await fn(); } finally { db.run = original; }
    assert.ok(disparou, `gancho da auditoria ${acao} nao disparou`);
    return res;
  }

  /** O INSERT da linha ESTORNO falha uma vez. */
  async function comLivroFalhando(fn) {
    const original = db.run;
    let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && sql.includes('INSERT INTO movimentacoes_almoxarifado')
        && Array.isArray(params) && params.includes('ESTORNO')) {
        disparou = true;
        setImmediate(() => cb.call({}, new Error('falha forcada do livro do estorno (teste)')));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res;
    try { res = await fn(); } finally { db.run = original; }
    assert.ok(disparou, 'gancho do livro nao disparou');
    return res;
  }

  /** Lote L1 em A (3) e B (3). */
  async function loteEmDoisEnderecos() {
    const m = await material({ controle_lote: 1 });
    const A = await loc(); const B = await loc();
    await mov(m, { tipo: 'ENTRADA', quantidade: 3, lote: 'L1', localizacao_destino_id: A });
    await mov(m, { tipo: 'ENTRADA', quantidade: 3, lote: 'L1', localizacao_destino_id: B });
    return { m, A, B, lt: await loteId(m, 'L1') };
  }

  /** L1 em A (1) e B (2), L2 em C (5): fisico 8, o L1 so tem 3. */
  async function loteQueNaoCabe() {
    const m = await material({ controle_lote: 1 });
    const A = await loc(); const B = await loc(); const C = await loc();
    await mov(m, { tipo: 'ENTRADA', quantidade: 1, lote: 'L1', localizacao_destino_id: A });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, lote: 'L1', localizacao_destino_id: B });
    await mov(m, { tipo: 'ENTRADA', quantidade: 5, lote: 'L2', localizacao_destino_id: C });
    return { m, A, B, C, lt: await loteId(m, 'L1') };
  }

  /** Entrada 2 (V1, V2) -> Saida 2 -> Devolucao citando a saida com V1, V2. */
  async function devolucaoComSeries() {
    const m = await material({ controle_serie: 1 });
    const e1 = await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] });
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const s1 = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: ids });
    const d = await request(app).post('/api/almoxarifado/devolucoes').send({ material_id: m.id, quantidade: 2,
      motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE', movimentacao_saida_id: s1, series: ['V1', 'V2'] });
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    return { m, e1, s1, ed: await ultimo(m, 'ENTRADA_DEVOLUCAO') };
  }

  console.log('\n=== Etapa 119: o que ja valeu nao se perde nem responde erro ===\n');

  // ── C249 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-01] saida com lote pela rota, 2o endereco falhando -> 500, fisico 6, A 3 e B 3; de novo -> 201, fisico 1', async () => {
    const { m, A, B, lt } = await loteEmDoisEnderecos();
    const r = await comDebitoFalhando(2, () => v2(m, { tipo: 'SAIDA', quantidade: 5, lote_id: lt }));
    assert.strictEqual(r.status, 500, JSON.stringify(r.body));
    assert.strictEqual(await fisico(m), 6);
    assert.deepStrictEqual([await linha(m, A), await linha(m, B)], [3, 3], 'o endereco ja debitado ficou fora do desfazer');
    const r2 = await v2(m, { tipo: 'SAIDA', quantidade: 5, lote_id: lt });
    assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));
    assert.strictEqual(await fisico(m), 1);
    assert.strictEqual(await somaLinhas(m), 1);
  });

  await test('[RN-01] o mesmo pelo motor (registrarMovimentacao): lanca, fisico 6, A 3 e B 3', async () => {
    const { m, A, B, lt } = await loteEmDoisEnderecos();
    let erro = null;
    await comDebitoFalhando(2, () => stockService.registrarMovimentacao(db, SUPER, { material_id: m.id, tipo: 'SAIDA',
      quantidade: 5, lote_id: lt, motivo: 'motor', justificativa: 'motor', documento_vinculado: 'NF-M' }).catch((e) => { erro = e; }));
    assert.ok(erro && /falha forcada do debito/.test(erro.message), `esperava a falha forcada: ${erro && erro.message}`);
    assert.strictEqual(await fisico(m), 6);
    assert.deepStrictEqual([await linha(m, A), await linha(m, B)], [3, 3]);
  });

  await test('[RN-02] a recusa por saldo do lote nao devolve em dobro: 400 com a literal, A 1, B 2, C 5, fisico 8', async () => {
    const { m, A, B, C, lt } = await loteQueNaoCabe();
    const r = await v2(m, { tipo: 'SAIDA', quantidade: 4, lote_id: lt });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Saldo insuficiente no lote L1. Disponível: 3 PC');
    assert.deepStrictEqual([await linha(m, A), await linha(m, B), await linha(m, C)], [1, 2, 5], 'linhas creditadas em dobro');
    assert.strictEqual(await fisico(m), 8);
  });

  await test('[RN-03] a recusa cujo desfazer falha no 2o credito termina inteira: 500, A 1, B 2, C 5, fisico 8', async () => {
    const { m, A, B, C, lt } = await loteQueNaoCabe();
    const r = await comCreditoFalhando(2, () => v2(m, { tipo: 'SAIDA', quantidade: 4, lote_id: lt }));
    assert.strictEqual(r.status, 500, JSON.stringify(r.body));
    assert.deepStrictEqual([await linha(m, A), await linha(m, B), await linha(m, C)], [1, 2, 5]);
    assert.strictEqual(await fisico(m), 8);
  });

  // ── C248 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-04] estorno com a auditoria CANCELAMENTO falhando -> 200, cancelado, fisico 0, o aviso suprimido; de novo -> 400', async () => {
    for (const [chave, valor] of [['notificar_movimentacoes', '1'], ['notificacoes_dest_entradas', 'ojv119@test.com']]) {
      await dbRun(db, 'DELETE FROM configuracoes_almoxarifado WHERE chave = ?', [chave]);
      await dbRun(db, 'INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)', [chave, valor]);
    }
    const m = await material();
    const id = await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    await dbRun(db, "DELETE FROM configuracoes_almoxarifado WHERE chave IN ('notificar_movimentacoes', 'notificacoes_dest_entradas')");
    const aviso = async () => (await dbGet(db, "SELECT status FROM fila_notificacoes_almoxarifado WHERE payload LIKE ? AND evento = 'MOVIMENTACAO'",
      [`%"movimentacao_id":${id},%`]));
    assert.strictEqual((await aviso()).status, 'PENDENTE', 'premissa: a entrada enfileirou o aviso');
    const r = await comAuditoriaFalhando('CANCELAMENTO', () => estornar(id));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.success, true);
    assert.ok(r.body.estorno_id, 'o corpo traz o estorno_id');
    assert.strictEqual(await cancelado(id), 1);
    assert.strictEqual(await fisico(m), 0);
    assert.strictEqual((await aviso()).status, 'FALHA', 'o que vem depois da auditoria nao rodou');
    const r2 = await estornar(id);
    assert.strictEqual(r2.status, 400);
    assert.strictEqual(r2.body.error, 'Movimentação já cancelada');
  });

  // ── C242 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-05] desfeita a devolucao e estornada a saida, a entrada original estorna: 200, fisico 0, V1 e V2 Estornada', async () => {
    const { m, e1, s1, ed } = await devolucaoComSeries();
    let r = await estornar(ed);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual((await series(m)).map((s) => [s.status, s.e, s.s]), [['ENTREGUE', e1, s1], ['ENTREGUE', e1, s1]],
      'a serie nao voltou a entrada original');
    r = await estornar(s1);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    r = await estornar(e1);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await fisico(m), 0);
    assert.deepStrictEqual((await series(m)).map((s) => s.status), ['ESTORNADA', 'ESTORNADA']);
  });

  await test('[RN-05b] duas devolucoes encadeadas (S1 -> D1 -> S2 -> D2): ED2, S2, ED1, S1, E1 -> todos 200, fisico 0, Estornada', async () => {
    const { m, e1, s1, ed: ed1 } = await devolucaoComSeries();
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const s2 = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: ids });
    const d2 = await request(app).post('/api/almoxarifado/devolucoes').send({ material_id: m.id, quantidade: 2,
      motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE', movimentacao_saida_id: s2, series: ['V1', 'V2'] });
    assert.strictEqual(d2.status, 201, JSON.stringify(d2.body));
    const ed2 = await ultimo(m, 'ENTRADA_DEVOLUCAO');
    assert.notStrictEqual(ed2, ed1);
    for (const [nome, id] of [['ED2', ed2], ['S2', s2], ['ED1', ed1], ['S1', s1], ['E1', e1]]) {
      const r = await estornar(id);
      assert.strictEqual(r.status, 200, `estorno ${nome}: ${JSON.stringify(r.body)} series=${JSON.stringify(await series(m))}`);
    }
    assert.strictEqual(await fisico(m), 0);
    assert.deepStrictEqual((await series(m)).map((s) => s.status), ['ESTORNADA', 'ESTORNADA']);
  });

  await test('[RN-06] o estorno da devolucao que falha no livro deixa a serie na entrada da devolucao; de novo, a cadeia segue', async () => {
    const { m, e1, s1, ed } = await devolucaoComSeries();
    let r = await comLivroFalhando(() => estornar(ed));
    assert.strictEqual(r.status, 500, JSON.stringify(r.body));
    assert.deepStrictEqual((await series(m)).map((s) => [s.status, s.e, s.s]), [['EM_ESTOQUE', ed, null], ['EM_ESTOQUE', ed, null]],
      'o desfazer nao devolveu a serie a entrada da devolucao');
    assert.strictEqual(await fisico(m), 2);
    for (const id of [ed, s1, e1]) {
      r = await estornar(id);
      assert.strictEqual(r.status, 200, `estorno ${id}: ${JSON.stringify(r.body)}`);
    }
    assert.strictEqual(await fisico(m), 0);
    assert.deepStrictEqual((await series(m)).map((s) => s.status), ['ESTORNADA', 'ESTORNADA']);
  });

  await test('[RN-07] serie reativada antes da etapa (sem a linha da tabela): ED -> S1 -> Em estoque na entrada da devolucao -> E1 recusa', async () => {
    const { m, e1, s1, ed } = await devolucaoComSeries();
    const apagadas = await dbRun(db, `DELETE FROM series_entrada_anterior_almoxarifado
      WHERE serie_id IN (SELECT id FROM series_almoxarifado WHERE material_id = ?)`, [m.id]);
    assert.strictEqual(apagadas.changes, 2, 'premissa: a devolucao gravou uma linha por serie');
    let r = await estornar(ed);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual((await series(m)).map((s) => [s.status, s.e, s.s]), [['ENTREGUE', ed, s1], ['ENTREGUE', ed, s1]]);
    r = await estornar(s1);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual((await series(m)).map((s) => [s.status, s.e]), [['EM_ESTOQUE', ed], ['EM_ESTOQUE', ed]]);
    r = await estornar(e1);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'estorno de entrada recusado: ha series desta entrada ja movimentadas — estorne as saidas primeiro');
    assert.strictEqual(await fisico(m), 2);
  });

  await test('[RN-08] entrega de requisicao com lote, 2o endereco falhando -> 500, fisico 6, A 3 e B 3; de novo -> entrega, fisico 1', async () => {
    const { m, A, B, lt } = await loteEmDoisEnderecos();
    const req = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'EM_SEPARACAO')`, [`REQ-OJV119-${m.id}`])).lastID;
    const it = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?, ?, 5, 5, 0, 0)`, [req, m.id])).lastID;
    const entregar = () => request(app).put(`/api/almoxarifado/requisicoes/${req}/entregar`)
      .send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 5, lote_id: lt }] });
    const r = await comDebitoFalhando(2, entregar);
    assert.strictEqual(r.status, 500, JSON.stringify(r.body));
    assert.strictEqual(await fisico(m), 6);
    assert.deepStrictEqual([await linha(m, A), await linha(m, B)], [3, 3], 'a entrega perdeu o endereco ja debitado');
    const ok = await entregar();
    assert.ok(ok.status < 300, JSON.stringify(ok.body));
    assert.strictEqual(await fisico(m), 1);
    assert.strictEqual(await somaLinhas(m), 1);
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
