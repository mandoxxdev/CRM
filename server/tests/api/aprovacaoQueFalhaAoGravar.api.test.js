/**
 * Etapa 122 (C254, B789/B790; RN-01..RN-03) — a aprovacao que falha ao gravar o status nao prende material.
 *
 * Medido (sonda e122fase0, cenarios 1-5): no /aprovar o UPDATE do status que lancava deixava a requisicao PENDENTE com a
 * reserva ATIVA desta chamada — e rejeitar depois dava REJEITADO com o material preso (C256). No /aprovar-valor o
 * APROVADO ja estava gravado pelo servico: qualquer falha depois (pos-aprovacao, UPDATE, releitura) respondia 500 e
 * repetir dava 400. Agora (design D1/D2): o /aprovar desfaz as reservas desta chamada sob a trava e relanca (500 de
 * sempre); o /aprovar-valor mantem o que ficou reservado, avisa no log e responde 200 com o status gravado.
 *
 * "Falhando" = o comando citado forcado a falhar UMA vez (gancho no `db.run`/`db.get`, molde
 * auditoriaDoAtoRequisicao.api.test.js — as rotas usam o binding desestruturado).
 *
 * Executar: cd server && node tests/api/aprovacaoQueFalhaAoGravar.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const API = '/api/almoxarifado';
const MSG = 'falha forcada (teste e122)';
const logValor = (id, msg = MSG) => `[almoxarifado-aprovar-valor] A requisição ${id} foi liberada por valor e fica APROVADO; o status pós-aprovação não foi gravado: ${msg}`;

const UPD_APROVAR = (s) => s.includes('UPDATE requisicoes_almoxarifado SET status=?, aprovador_id');
const UPD_VALOR = (s) => s.includes("UPDATE requisicoes_almoxarifado SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='APROVADO'");
const UPD_AUTO = (s) => s.includes("UPDATE requisicoes_almoxarifado SET status=?, aprovador_nome='Sistema (automático)'");
const LEITURA_SALDO = (s) => s.includes('as reservado_para_item');

(async () => {
  const { app, db, close } = await createTestApp({ user: SUPER });
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (1, ?, ?, 1)', ['Super Teste', 'super@test.com']);
  await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (50, ?, ?, 1)', ['Outro', 'outro@test.com']);
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');

  let seq = 0;
  const material = async (qtd) => {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
      custo_unitario, ativo) VALUES (?, ?, 'PC', ?, 0, 10, 1)`, [`AFG122-${seq}`, `AFG122-${seq}`, qtd])).lastID;
  };
  const requisicao = async (status, matId) => {
    seq += 1;
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, ativo)
      VALUES (?, 50, 'X', ?, 1)`, [`REQ-AFG122-${seq}`, status])).lastID;
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue) VALUES (?, ?, 3, 0, 0)`, [id, matId]);
    return id;
  };
  const statusDe = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const reservasAtivas = async (id) => ({ ...(await dbGet(db, `SELECT COUNT(*) n, COALESCE(SUM(quantidade), 0) q
    FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'`, [id])) });
  const reservadoDo = async (m) => Number((await dbGet(db, 'SELECT quantidade_reservada q FROM materiais_almoxarifado WHERE id = ?', [m])).q || 0);

  /** O comando que casa com `pred` falha UMA vez em `db[metodo]`. Devolve a resposta e os avisos do console. */
  async function falhandoUmaVez(metodo, pred, fn) {
    const original = db[metodo];
    let disparou = false;
    db[metodo] = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && pred(sql, params || [])) {
        disparou = true;
        setImmediate(() => cb.call({}, new Error(MSG)));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    const avisos = []; const warn = console.warn;
    console.warn = (...a) => avisos.push(a.join(' '));
    let r;
    try { r = await fn(); } finally { db[metodo] = original; console.warn = warn; }
    assert.ok(disparou, `o gancho em db.${metodo} nao disparou`);
    return { r, avisos };
  }
  const aprovar = (id) => request(app).put(`${API}/requisicoes/${id}/aprovar`).send({});
  const aprovarValor = (id) => request(app).put(`${API}/requisicoes/${id}/aprovar-valor`).send({});
  const auditoriaValor = async (id) => {
    const a = await dbGet(db, `SELECT dados_novos FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao'
      AND entidade_id = ? AND acao = 'APROVACAO_VALOR' ORDER BY id DESC LIMIT 1`, [id]);
    return a ? JSON.parse(a.dados_novos) : null;
  };

  console.log('\n=== Etapa 122: a aprovacao que falha ao gravar o status (C254) ===\n');

  await test('[RN-01] /aprovar com o UPDATE do status lancando -> 500 de sempre, PENDENTE, 0 reservas ATIVA, reservado 0; repetir aprova', async () => {
    const m = await material(10);
    const id = await requisicao('PENDENTE', m);
    const { r } = await falhandoUmaVez('run', UPD_APROVAR, () => aprovar(id));
    assert.strictEqual(r.status, 500, `${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(r.body, { error: MSG });
    assert.strictEqual(await statusDe(id), 'PENDENTE');
    assert.deepStrictEqual(await reservasAtivas(id), { n: 0, q: 0 }, 'a reserva desta chamada ficou ATIVA');
    assert.strictEqual(await reservadoDo(m), 0, 'quantidade_reservada do material nao voltou a 0');
    const de = await dbGet(db, `SELECT COUNT(*) n FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'LIBERADA'`, [id]);
    assert.strictEqual(de.n, 1, 'a reserva desta chamada nao foi LIBERADA');
    const r2 = await aprovar(id);
    assert.strictEqual(r2.status, 200, `${r2.status} ${JSON.stringify(r2.body)}`);
    assert.strictEqual(r2.body.status, 'TOTALMENTE_RESERVADA');
    assert.strictEqual(await statusDe(id), 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual(await reservasAtivas(id), { n: 1, q: 3 });
    assert.strictEqual(await reservadoDo(m), 3);
  });

  await test('[RN-01b] /aprovar com o UPDATE lancando e depois rejeitar -> REJEITADO com 0 reservas ATIVA', async () => {
    const m = await material(10);
    const id = await requisicao('PENDENTE', m);
    const { r } = await falhandoUmaVez('run', UPD_APROVAR, () => aprovar(id));
    assert.strictEqual(r.status, 500, `${r.status} ${JSON.stringify(r.body)}`);
    const rj = await request(app).put(`${API}/requisicoes/${id}/rejeitar`).send({ motivo: 'rn01b' });
    assert.strictEqual(rj.status, 200, `${rj.status} ${JSON.stringify(rj.body)}`);
    assert.strictEqual(await statusDe(id), 'REJEITADO');
    assert.deepStrictEqual(await reservasAtivas(id), { n: 0, q: 0 }, 'o material ficou preso para uma requisicao REJEITADO');
    assert.strictEqual(await reservadoDo(m), 0);
  });

  await test('[RN-02] /aprovar-valor com o UPDATE do status lancando -> 200 APROVADO, 1 reserva ATIVA de 3, o log, a Auditoria com APROVADO', async () => {
    const m = await material(10);
    const id = await requisicao('AGUARDANDO_APROVACAO_VALOR', m);
    const { r, avisos } = await falhandoUmaVez('run', UPD_VALOR, () => aprovarValor(id));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.success, true, JSON.stringify(r.body));
    assert.strictEqual(r.body.status, 'APROVADO', JSON.stringify(r.body));
    assert.ok(Array.isArray(r.body.reservas) && r.body.reservas.length === 1, JSON.stringify(r.body));
    assert.strictEqual(await statusDe(id), 'APROVADO');
    assert.deepStrictEqual(await reservasAtivas(id), { n: 1, q: 3 });
    assert.strictEqual(await reservadoDo(m), 3);
    assert.ok(avisos.includes(logValor(id)), `o log nao tem a literal: ${JSON.stringify(avisos)}`);
    const aud = await auditoriaValor(id);
    assert.ok(aud, 'a Auditoria APROVACAO_VALOR nao foi gravada');
    assert.strictEqual(aud.status, 'APROVADO', JSON.stringify(aud));
  });

  await test('[RN-02b] /aprovar-valor sem saldo, o UPDATE (AGUARDANDO_ESTOQUE) lancando -> 200 APROVADO, reservas [], 0 reservas, o log', async () => {
    const m = await material(0);
    const id = await requisicao('AGUARDANDO_APROVACAO_VALOR', m);
    const { r, avisos } = await falhandoUmaVez('run', UPD_VALOR, () => aprovarValor(id));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.status, 'APROVADO', JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.reservas, [], JSON.stringify(r.body));
    assert.strictEqual(await statusDe(id), 'APROVADO');
    assert.deepStrictEqual(await reservasAtivas(id), { n: 0, q: 0 });
    assert.ok(avisos.includes(logValor(id)), `o log nao tem a literal: ${JSON.stringify(avisos)}`);
  });

  await test('[RN-02c] /aprovar-valor com o pos-aprovacao lancando (leitura do saldo do item) -> 200 APROVADO, reservas [], 0 ATIVA, o log', async () => {
    const m = await material(10);
    const id = await requisicao('AGUARDANDO_APROVACAO_VALOR', m);
    const { r, avisos } = await falhandoUmaVez('get', LEITURA_SALDO, () => aprovarValor(id));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.status, 'APROVADO', JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.reservas, [], JSON.stringify(r.body));
    assert.strictEqual(await statusDe(id), 'APROVADO');
    assert.deepStrictEqual(await reservasAtivas(id), { n: 0, q: 0 });
    assert.strictEqual(await reservadoDo(m), 0);
    assert.ok(avisos.includes(logValor(id)), `o log nao tem a literal: ${JSON.stringify(avisos)}`);
  });

  await test('[RN-03] guarda: aprovacao automatica com o UPDATE lancando -> 201, PENDENTE, 0 reservas ATIVA', async () => {
    const m = await material(10);
    await cfg('aprovacao_automatica', '1');
    try {
      const { r } = await falhandoUmaVez('run', UPD_AUTO, () => request(app).post(`${API}/requisicoes`)
        .send({ os_referencia: 'OS-AFG122', itens: [{ material_id: m, quantidade: 3 }] }));
      assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.status, 'PENDENTE', JSON.stringify(r.body));
      assert.strictEqual(await statusDe(r.body.id), 'PENDENTE');
      assert.deepStrictEqual(await reservasAtivas(r.body.id), { n: 0, q: 0 });
      assert.strictEqual(await reservadoDo(m), 0);
    } finally { await cfg('aprovacao_automatica', '0'); }
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
