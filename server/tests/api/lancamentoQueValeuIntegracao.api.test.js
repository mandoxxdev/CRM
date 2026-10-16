/**
 * Etapa 120 (T4) — integracao que cruza Cadastro, Requisicoes, Devolucoes, Movimentacoes, Estorno e Series.
 *
 * (i) pela rota: o cadastro com Saldo Inicial e a auditoria da Entrada falhando — antes o material era APAGADO e a Entrada
 * ficava no livro (C250); (ii) pela rota: a entrega com a auditoria da Saida falhando -> a devolucao dessa entrega -> o estorno
 * da devolucao; (iii) pela rota e pelo servico: a Entrada que traz as series de volta com a auditoria falhando (C250) ainda
 * grava de onde elas sairam (B779) -> com a serie desligada o estorno da saida recusa pela rota e pelo servico (C234), e a
 * exclusao da requisicao cuja entrega elas eram recusa (C251).
 *
 * Executar: cd server && node tests/api/lancamentoQueValeuIntegracao.api.test.js
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

(async () => {
  const { app, db, close } = await createTestApp({ user: SUPER });
  const fam = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('LQI120', 'Familia LQI120', 1)")).lastID;
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `LQI120-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, codigo])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const ultimo = async (m, tipo) => (await dbGet(db,
    'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1', [m.id, tipo])).id;
  const v2 = (m, body) => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'lqi120',
    justificativa: 'lqi120', documento_vinculado: 'NF-LQI120', ...body });
  const mov = async (m, body) => {
    const r = await v2(m, body);
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    return ultimo(m, body.tipo);
  };
  const estornar = (movId) => request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'lqi120' });
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual f FROM materiais_almoxarifado WHERE id = ?', [m.id])).f;
  const livro = async (m, tipo) => (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ?',
    [m.id, tipo])).n;
  const idsSeries = async (m) => (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id]))
    .map((x) => x.id);

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

  console.log('\n=== Etapa 120 (T4): integracao ===\n');

  await test('(i) cadastro com Saldo Inicial 5 e a auditoria da Entrada falhando -> 201, o material existe, fisico 5, uma Entrada', async () => {
    const codigo = 'LQI120-CAD';
    const r = await comAuditoriaFalhando('ENTRADA', () => request(app).post('/api/almoxarifado/materiais')
      .send({ codigo, nome: 'Chapa LQI120', unidade: 'PC', categoria: 'OUTROS', familia_id: fam, custo_unitario: 10, quantidade_atual: 5 }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const m = await dbGet(db, 'SELECT id, quantidade_atual f FROM materiais_almoxarifado WHERE codigo = ?', [codigo]);
    assert.ok(m, 'o material foi apagado com a Entrada no livro');
    assert.strictEqual(m.f, 5);
    assert.strictEqual(await livro(m, 'ENTRADA'), 1);
  });

  await test('(ii) entrega com a auditoria da Saida falhando -> 200; a devolucao dela -> 201; o estorno da devolucao -> 200', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 10 });
    const req = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'EM_SEPARACAO')`, [`REQ-LQI120-${m.id}`])).lastID;
    const it = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?, ?, 4, 4, 0, 0)`, [req, m.id])).lastID;
    const e = await comAuditoriaFalhando('SAIDA', () => request(app).put(`/api/almoxarifado/requisicoes/${req}/entregar`)
      .send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 4 }] }));
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    const saida = await ultimo(m, 'SAIDA');
    assert.strictEqual(await fisico(m), 6);
    const d = await request(app).post('/api/almoxarifado/devolucoes').send({ material_id: m.id, quantidade: 4,
      motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE', movimentacao_saida_id: saida });
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    assert.strictEqual(await fisico(m), 10);
    const ed = await estornar(await ultimo(m, 'ENTRADA_DEVOLUCAO'));
    assert.strictEqual(ed.status, 200, JSON.stringify(ed.body));
    assert.strictEqual(await fisico(m), 6);
    assert.strictEqual(await livro(m, 'SAIDA'), 1, 'a entrega baixou duas vezes');
  });

  await test('(iii) a Entrada que traz as series de volta com a auditoria falhando -> 201; desligada, rota e servico recusam; a exclusao tambem', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] });
    const req = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'ENTREGUE')`, [`REQ-LQI120-S${m.id}`])).lastID;
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada, quantidade_separada,
      quantidade_entregue, quantidade_atendida) VALUES (?, ?, 2, 2, 2, 2)`, [req, m.id]);
    const saidaReq = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: await idsSeries(m) });
    await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET requisicao_id = ? WHERE id = ?', [req, saidaReq]); // como a entrega
    const volta = await comAuditoriaFalhando('ENTRADA', () => v2(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] }));
    assert.strictEqual(volta.status, 201, JSON.stringify(volta.body));
    // uma Saida avulsa das duas de novo e a volta delas, para o estorno pela rota (a da requisicao so sai pela requisicao)
    const s2 = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: await idsSeries(m) });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] });
    const d = await request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ controle_serie: false });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    const r = await estornar(s2);
    assert.strictEqual(r.status, 400, `pela rota: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, REENTRARAM);
    let erro = null;
    await stockService.cancelarMovimentacao(db, SUPER, s2, 'lqi120 servico').catch((e) => { erro = e; });
    assert.ok(erro && erro.status === 400 && erro.message === REENTRARAM, `pelo servico: ${erro && erro.message}`);
    const x = await request(app).delete(`/api/almoxarifado/requisicoes/${req}`).send({ justificativa: 'lqi120' });
    assert.strictEqual(x.status, 400, `a exclusao creditou em dobro: ${JSON.stringify(x.body)}`);
    assert.strictEqual(await fisico(m), 2);
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
