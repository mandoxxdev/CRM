/**
 * Etapa 122 (T5, integracao) — a historia inteira de um pedido com as trilhas da Auditoria falhando, e a aprovacao que falha
 * ao gravar o status, cruzando Compras, Recebimento, Relatorios, Movimentacoes e Requisicoes.
 *
 * (i) PELA ROTA: pedido `enviado` de 3 -> recebimento contra o pedido (2; a esperada e o saldo, 3) -> iniciar conferencia -> `/conferir` 4 com a
 * autorizacao e a trilha do excedente falhando (200, B791) -> finalizar com a trilha falhando (200, a coluna, C255b) ->
 * encaminhar, finalizar compras, fiscal, processar com a trilha do fechamento falhando (pedido `recebido`, a coluna, C255a) ->
 * o relatorio conta o item conferido -> uma requisicao de 4 do mesmo material, `/aprovar` com o UPDATE do status falhando
 * (500, nenhuma reserva presa, C254) -> o estorno da entrada passa (nada segura o material) e o pedido reabre `enviado` ->
 * reaprovar a requisicao: AGUARDANDO_ESTOQUE, sem reserva.
 * (ii) PELO SERVICO: `stockService.cancelarMovimentacao` reabre o pedido fechado sem a trilha, e
 * `reportService.relatorioQualidadeFornecedores` conta a conferencia finalizada sem a trilha.
 *
 * Executar: cd server && node tests/api/estadoForaDaAuditoriaIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const reportService = require('../../services/almoxarifado/reportService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
const ADMIN = { id: 1, nome: 'Admin Int', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const OUTRO = { id: 2, nome: 'Outro Int', role: 'admin', is_superadmin: 1, email: 'outro@test.com' };
const API = '/api/almoxarifado';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });
  await dbRun(db, `CREATE TABLE IF NOT EXISTS contas_pagar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL, fornecedor TEXT, valor REAL NOT NULL, data_vencimento DATE,
    data_pagamento DATE, status TEXT DEFAULT 'pendente', categoria TEXT, observacoes TEXT
  )`);
  await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES ('liberacao_valor_ativo','0')
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`);
  const HOJE = (await dbGet(db, "SELECT date('now') AS d")).d;

  /** O comando que casa `pred` falha uma vez (gancho em `db.run`). */
  async function comFalha(pred, fn, rotulo) {
    const original = db.run;
    let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && pred(sql, Array.isArray(params) ? params : [])) {
        disparou = true;
        setImmediate(() => cb.call({}, new Error(`falha forcada ${rotulo} (teste)`)));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    const warn = console.warn; console.warn = () => {};
    let r;
    try { r = await fn(); } finally { db.run = original; console.warn = warn; }
    assert.ok(disparou, `o gancho ${rotulo} nao disparou`);
    return r;
  }
  const trilha = (entidade, acao) => (s, p) => s.includes('INSERT INTO auditoria_log_almoxarifado')
    && p[0] === entidade && p[2] === acao;

  let seq = 0;
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj) VALUES ('Forn Int E122','12.212.212/0001-22')")).lastID;
  const material = async () => (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual,
    custo_unitario, ativo) VALUES (?, ?, 'UN', 0, 10, 1)`, [`E122INT-${++seq}`, `E122INT-${seq}`])).lastID;
  const pedido = async (m, q) => {
    setUser(ADMIN);
    const r = await request(app).post('/api/compras/pedidos').send({ fornecedor_id: forn, status: 'enviado',
      itens: [{ material_id: m, quantidade: q, valor_unitario: 10 }] });
    assert.strictEqual(r.status, 201, `pedido: ${JSON.stringify(r.body)}`);
    return { id: r.body.id, linha: (await dbGet(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ?', [r.body.id])).id };
  };
  const workflow = async (id, acao, falha) => {
    const go = () => request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao });
    const r = falha ? await comFalha(falha, go, acao) : await go();
    assert.strictEqual(r.status, 200, `${acao}: ${r.status} ${JSON.stringify(r.body)}`);
    return r;
  };
  const statusPedido = async (id) => (await dbGet(db, 'SELECT status, fechado_automaticamente_de AS col FROM pedidos_compra WHERE id = ?', [id]));
  const conferidosDe = (linhas, nome) => (linhas.find((l) => l.fornecedor === nome) || {}).itens_conferidos;

  console.log('\n=== Etapa 122 (T5): o estado fora da Auditoria, ponta a ponta ===\n');

  await test('(i) pela rota: conferencia, fechamento e aprovacao com as escritas falhando; o estorno reabre e nada fica preso', async () => {
    const m = await material();
    const p = await pedido(m, 3);
    setUser(ADMIN);
    const cr = await request(app).post(`${API}/recebimentos`).send({ tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: p.id,
      nota_fiscal: `NF-E122INT-${++seq}`, itens: [{ material_id: m, pedido_item_id: p.linha, quantidade: 2, quantidade_recebida: 2 }] });
    assert.strictEqual(cr.status, 201, `criar: ${JSON.stringify(cr.body)}`);
    const rec = cr.body.id;
    const item = (await dbGet(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [rec])).id;
    await workflow(rec, 'iniciar_conferencia');
    const conf = await comFalha(trilha('recebimento_item', 'EXCEDENTE_AUTORIZADO'), () => request(app)
      .put(`${API}/recebimentos/${rec}/conferir`).send({ autorizar_excedente: true, itens: [{ id: item, quantidade_recebida: 4 }] }),
    'excedente');
    assert.strictEqual(conf.status, 200, `conferir (B791): ${conf.status} ${JSON.stringify(conf.body)}`);
    await workflow(rec, 'finalizar_conferencia', trilha('recebimento', 'FINALIZAR_CONFERENCIA'));
    await workflow(rec, 'encaminhar_compras');
    await workflow(rec, 'finalizar_compras');
    const fi = await request(app).put(`${API}/recebimentos/${rec}/fiscal`).send({ nota_fiscal: `NF-E122INT-${seq}`,
      data_emissao_nf: HOJE, data_entrada_nf: HOJE, valor_total_nota: 40, itens: [{ id: item, quantidade_recebida: 4 }] });
    assert.strictEqual(fi.status, 200, `fiscal: ${JSON.stringify(fi.body)}`);
    await workflow(rec, 'processar', trilha('pedido_compra', 'STATUS_AUTOMATICO_RECEBIDO'));
    assert.deepStrictEqual({ ...(await statusPedido(p.id)) }, { status: 'recebido', col: 'enviado' }, 'C255a: o fechamento');
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m])).q, 4);
    const rel = await request(app).get(`${API}/relatorios/qualidade-fornecedores?data_inicio=${HOJE}&data_fim=${HOJE}`);
    assert.strictEqual(rel.status, 200, JSON.stringify(rel.body));
    assert.strictEqual(conferidosDe(rel.body, 'Forn Int E122'), 1, `C255b: ${JSON.stringify(rel.body)}`);

    setUser(OUTRO);
    const rq = await request(app).post(`${API}/requisicoes`).send({ os_referencia: 'OS-E122INT', itens: [{ material_id: m, quantidade: 4 }] });
    setUser(ADMIN);
    assert.ok([200, 201].includes(rq.status), `requisicao: ${rq.status} ${JSON.stringify(rq.body)}`);
    const reqId = rq.body.id || (rq.body.requisicao && rq.body.requisicao.id);
    const ap = await comFalha((s) => s.includes('UPDATE requisicoes_almoxarifado SET status=?, aprovador_id'),
      () => request(app).put(`${API}/requisicoes/${reqId}/aprovar`).send({}), 'aprovar');
    assert.strictEqual(ap.status, 500, `aprovar: ${ap.status} ${JSON.stringify(ap.body)}`);
    const ativas = async () => (await dbGet(db, "SELECT COUNT(*) n FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'", [reqId])).n;
    assert.strictEqual(await ativas(), 0, 'C254: a reserva ficou presa');

    const mov = (await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE recebimento_id = ? AND tipo = 'ENTRADA_COMPRA'", [rec])).id;
    const es = await request(app).post(`${API}/movimentacoes/${mov}/cancelar`).send({ motivo: 'lancado errado' });
    assert.strictEqual(es.status, 200, `estorno: ${es.status} ${JSON.stringify(es.body)}`);
    assert.deepStrictEqual({ ...(await statusPedido(p.id)) }, { status: 'enviado', col: null }, 'C255a: a reabertura');

    const ap2 = await request(app).put(`${API}/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(ap2.status, 200, `reaprovar: ${JSON.stringify(ap2.body)}`);
    assert.ok(['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'].includes(ap2.body.status), JSON.stringify(ap2.body));
    assert.strictEqual(await ativas(), 0);
  });

  await test('(ii) pelo servico: cancelarMovimentacao reabre sem a trilha; o relatorio do servico conta sem a trilha', async () => {
    const m = await material();
    const p = await pedido(m, 2);
    seq += 1;
    const rec = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal, fornecedor_nome,
      data_emissao_nf, data_entrada_nf, valor_total_nota, pedido_compra_id, data_recebimento)
      VALUES (?, 'EM_CONFERENCIA', ?, 'FORN-E122-SVC', ?, ?, 20, ?, CURRENT_TIMESTAMP)`,
    [`REC-E122INT-${seq}`, `NF-E122INT-${seq}`, HOJE, HOJE, p.id])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, pedido_item_id,
      quantidade_esperada, quantidade_recebida) VALUES (?,?,?,2,2)`, [rec, m, p.linha]);
    await workflow(rec, 'finalizar_conferencia', trilha('recebimento', 'FINALIZAR_CONFERENCIA'));
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET status = 'EM_ENTRADA_NF' WHERE id = ?", [rec]);
    await workflow(rec, 'processar', trilha('pedido_compra', 'STATUS_AUTOMATICO_RECEBIDO'));
    const linhas = await reportService.relatorioQualidadeFornecedores(db, { data_inicio: HOJE, data_fim: HOJE });
    assert.strictEqual(conferidosDe(linhas, 'FORN-E122-SVC'), 1, JSON.stringify(linhas));
    const mov = (await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE recebimento_id = ? AND tipo = 'ENTRADA_COMPRA'", [rec])).id;
    await stockService.cancelarMovimentacao(db, ADMIN, mov, 'lancado errado');
    assert.deepStrictEqual({ ...(await statusPedido(p.id)) }, { status: 'enviado', col: null });
    assert.strictEqual((await dbAll(db, `SELECT 1 FROM auditoria_log_almoxarifado WHERE entidade = 'pedido_compra'
      AND entidade_id = ? AND acao = 'STATUS_AUTOMATICO_RECEBIDO'`, [p.id])).length, 0, 'fixture: a trilha tinha de faltar');
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
