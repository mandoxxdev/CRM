/**
 * Etapa 120 (C250, C234; B778, B779) — o lancamento que ja valeu e a serie que ja voltou.
 *
 * C250: a auditoria que o motor grava DEPOIS do livro falhava e derrubava a resposta com o lancamento feito (Entrada de 5 ->
 * 500, a linha no livro, fisico 5). Os chamadores do motor leem a excecao como "nada aconteceu": a entrega nao gravava o
 * entregue (a segunda baixava de novo), a devolucao virava ESTADO_PARCIAL, o retalho estornava a baixa e deixava a entrada do
 * retalho orfa. C234: a saida cujas series voltaram TODAS por uma Entrada, estornada depois de desligar a serie, devolvia a
 * quantidade em dobro (a reativacao apaga o vinculo com a saida e a recusa da 116 nao via serie nenhuma).
 *
 * Molde: `oQueJaValeuNaoSePerde.api.test.js` (ganchos no db.run) e `estornoSemSerie.api.test.js` (o desligar).
 *
 * Executar: cd server && node tests/api/lancamentoQueValeu.api.test.js
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
const REENTRARAM = 'estorno de saida recusado: series desta saida ja reentraram no estoque — a devolucao ja repos o material';
const E2 = (codigo, n) => `Não é possível estornar: esta saída baixou ${n} série(s) do material ${codigo} e o controle por `
  + 'número de série foi desligado depois — o estorno devolveria o saldo sem devolver as séries. Religue o controle por '
  + 'número de série no cadastro do material e estorne de novo.';

(async () => {
  const { app, db, close } = await createTestApp({ user: SUPER });
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `LQV120-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, codigo])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const ultimo = async (m, tipo) => (await dbGet(db,
    'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1', [m.id, tipo])).id;
  const v2 = (m, body) => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'lqv120',
    justificativa: 'lqv120', documento_vinculado: 'NF-LQV120', ...body });
  const mov = async (m, body) => {
    const r = await v2(m, body);
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    return ultimo(m, body.tipo);
  };
  const estornar = (movId) => request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'lqv120' });
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual f FROM materiais_almoxarifado WHERE id = ?', [m.id])).f;
  const livro = async (m, tipo) => (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ?',
    [m.id, tipo])).n;
  const cancelado = async (id) => (await dbGet(db, 'SELECT COALESCE(cancelado, 0) c FROM movimentacoes_almoxarifado WHERE id = ?', [id])).c;
  const series = async (m) => (await dbAll(db, 'SELECT status FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id]))
    .map((s) => s.status);
  const idsSeries = async (m) => (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id]))
    .map((x) => x.id);
  const auditoriasDe = async (movId) => (await dbGet(db,
    "SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade = 'movimentacao' AND entidade_id = ?", [movId])).n;

  /** A auditoria do lancamento (`entidade = 'movimentacao'`, acao = `acao`) falha uma vez. */
  async function comAuditoriaFalhando(acao, fn) {
    const original = db.run;
    let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && sql.includes('INSERT INTO auditoria_log_almoxarifado')
        && Array.isArray(params) && params[0] === 'movimentacao' && params[2] === acao) {
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

  console.log('\n=== Etapa 120: o lancamento que ja valeu e a serie que ja voltou ===\n');

  // ── C250 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-01] Entrada de 5 pela rota com a auditoria falhando -> 201 com o corpo de sempre, uma linha, o aviso roda', async () => {
    for (const [chave, valor] of [['notificar_movimentacoes', '1'], ['notificacoes_dest_entradas', 'lqv120@test.com']]) {
      await dbRun(db, 'DELETE FROM configuracoes_almoxarifado WHERE chave = ?', [chave]);
      await dbRun(db, 'INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)', [chave, valor]);
    }
    const m = await material();
    let r;
    try {
      r = await comAuditoriaFalhando('ENTRADA', () => v2(m, { tipo: 'ENTRADA', quantidade: 5 }));
    } finally {
      await dbRun(db, "DELETE FROM configuracoes_almoxarifado WHERE chave IN ('notificar_movimentacoes', 'notificacoes_dest_entradas')");
    }
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const id = await ultimo(m, 'ENTRADA');
    assert.deepStrictEqual(r.body, { id, saldo_anterior: 0, saldo_posterior: 5 });
    assert.strictEqual(await fisico(m), 5);
    assert.strictEqual(await livro(m, 'ENTRADA'), 1);
    assert.strictEqual(await auditoriasDe(id), 0, 'premissa: a auditoria falhou de verdade');
    const aviso = await dbGet(db, "SELECT status FROM fila_notificacoes_almoxarifado WHERE payload LIKE ? AND evento = 'MOVIMENTACAO'",
      [`%"movimentacao_id":${id},%`]);
    assert.ok(aviso && aviso.status === 'PENDENTE', `o que vem depois da auditoria nao rodou: ${JSON.stringify(aviso)}`);
  });

  await test('[RN-02] pelo motor (registrarMovimentacao), a auditoria SAIDA falhando -> resolve com o id, nao lanca', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const res = await comAuditoriaFalhando('SAIDA', () => stockService.registrarMovimentacao(db, SUPER, { material_id: m.id,
      tipo: 'SAIDA', quantidade: 2, motivo: 'motor', justificativa: 'motor', documento_vinculado: 'NF-M' }));
    assert.strictEqual(res.id, await ultimo(m, 'SAIDA'));
    assert.strictEqual(res.saldo_posterior, 3);
    assert.strictEqual(await fisico(m), 3);
  });

  await test('[RN-03] a falha ANTES do livro continua erro sem nada gravado; a recusa de negocio continua 400', async () => {
    const m = await material();
    const original = db.run; let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && sql.includes('INSERT INTO movimentacoes_almoxarifado')
        && Array.isArray(params) && params.includes(m.id)) {
        disparou = true;
        setImmediate(() => cb.call({}, new Error('falha forcada do livro (teste)')));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let r;
    try { r = await v2(m, { tipo: 'ENTRADA', quantidade: 5 }); } finally { db.run = original; }
    assert.ok(disparou, 'gancho do livro nao disparou');
    assert.strictEqual(r.status, 500, JSON.stringify(r.body));
    assert.strictEqual(await fisico(m), 0, 'a Entrada que nao chegou ao livro deixou o credito');
    assert.strictEqual(await livro(m, 'ENTRADA'), 0);
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const s = await v2(m, { tipo: 'SAIDA', quantidade: 9 });
    assert.strictEqual(s.status, 400, JSON.stringify(s.body));
    assert.strictEqual(s.body.error, 'Saldo insuficiente. Disponível: 5 PC');
  });

  await test('[RN-04] entrega de requisicao com a auditoria SAIDA falhando -> 200 Entregue, uma Saida, entregue 4, fisico 6', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 10 });
    const req = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'EM_SEPARACAO')`, [`REQ-LQV120-${m.id}`])).lastID;
    const it = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?, ?, 4, 4, 0, 0)`, [req, m.id])).lastID;
    const r = await comAuditoriaFalhando('SAIDA', () => request(app).put(`/api/almoxarifado/requisicoes/${req}/entregar`)
      .send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 4 }] }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.status, 'ENTREGUE');
    assert.strictEqual(await fisico(m), 6);
    assert.strictEqual(await livro(m, 'SAIDA'), 1);
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_entregue e FROM itens_requisicao_almoxarifado WHERE id = ?', [it])).e, 4);
  });

  await test('[RN-05] devolucao ESTOQUE com a auditoria ENTRADA_DEVOLUCAO falhando -> 201, de pe, sem ESTADO_PARCIAL', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    await mov(m, { tipo: 'SAIDA', quantidade: 3 });
    const r = await comAuditoriaFalhando('ENTRADA_DEVOLUCAO', () => request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: m.id, quantidade: 2, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE' }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await fisico(m), 4);
    const devs = await dbAll(db, 'SELECT id FROM devolucoes_material_almoxarifado WHERE material_id = ?', [m.id]);
    assert.strictEqual(devs.length, 1);
    const parcial = await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado
      WHERE entidade = 'devolucao' AND entidade_id = ? AND acao = 'ESTADO_PARCIAL'`, [devs[0].id]);
    assert.strictEqual(parcial.n, 0, 'a devolucao completa foi marcada parcial');
  });

  await test('[RN-05b] devolucao QUARENTENA com a auditoria do BLOQUEIO (2a perna) falhando -> 201, bloqueado 2, sem ESTADO_PARCIAL', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    await mov(m, { tipo: 'SAIDA', quantidade: 3 });
    const r = await comAuditoriaFalhando('BLOQUEIO', () => request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: m.id, quantidade: 2, motivo: 'NAO_UTILIZADO', destino: 'QUARENTENA' }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const est = await dbGet(db, 'SELECT quantidade_atual f, quantidade_bloqueada b FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    assert.deepStrictEqual([est.f, est.b], [4, 2]);
    const parcial = await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade = 'devolucao' AND acao = 'ESTADO_PARCIAL'
      AND entidade_id IN (SELECT id FROM devolucoes_material_almoxarifado WHERE material_id = ?)`, [m.id]);
    assert.strictEqual(parcial.n, 0, 'a devolucao completa foi marcada parcial');
  });

  await test('[RN-06] retalho com a auditoria ENTRADA_RETALHO falhando -> 201, origem 70 (baixa de pe), retalho 1, uma sobra', async () => {
    const origem = await material(); const retalho = await material();
    await mov(origem, { tipo: 'ENTRADA', quantidade: 100 });
    const r = await comAuditoriaFalhando('ENTRADA_RETALHO', () => request(app).post('/api/almoxarifado/sobras/gerar-retalho')
      .send({ material_origem_id: origem.id, material_retalho_id: retalho.id, baixar_original: true, quantidade_baixa: 30,
        quantidade_retalho: 1, justificativa: 'lqv120' }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await fisico(origem), 70, 'a baixa do original foi estornada');
    assert.strictEqual(await livro(origem, 'ESTORNO'), 0);
    assert.strictEqual(await fisico(retalho), 1);
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM sobras_material_almoxarifado WHERE material_retalho_id = ?',
      [retalho.id])).n, 1, 'a entrada do retalho ficou sem a sobra');
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
