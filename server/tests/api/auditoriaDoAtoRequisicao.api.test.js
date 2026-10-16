/**
 * Etapa 121 (C252, B784; RN-10) — requisicao e regras de aprovacao: a Auditoria de um ato ja gravado nao derruba o ato.
 *
 * Medido (e121m-A): nas 10 portas de `routes/almoxarifado.js` abaixo, a Auditoria rodava depois do ato gravado e fora de
 * try/catch — com o INSERT dela falhando a rota respondia 500 e a tela lia "nada aconteceu". Repetir duplicava (copia:
 * dois rascunhos; criar regra: duas regras) ou recusava ("ja processada"). Agora usam `audit.registrarAuditoriaDoAto`:
 * a resposta e a de sempre, o ato esta gravado UMA vez, e o log do servidor diz que a Auditoria falhou.
 *
 * Executar: cd server && node tests/api/auditoriaDoAtoRequisicao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const AVISO = '[almoxarifado] auditoria do ato falhou';

(async () => {
  const { app, db, close } = await createTestApp({ user: SUPER });
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (1, ?, ?, 1)', ['Super Teste', 'super@test.com']);
  await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (50, ?, ?, 1)', ['Outro', 'outro@test.com']);

  let seq = 0;
  const material = async (qtd = 10) => {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
      custo_unitario, ativo) VALUES (?, ?, 'PC', ?, 0, 10, 1)`, [`ADR121-${seq}`, `ADR121-${seq}`, qtd])).lastID;
  };
  const requisicao = async (status, solicitante = 50, matId = null) => {
    seq += 1;
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, ativo)
      VALUES (?, ?, 'X', ?, 1)`, [`REQ-ADR121-${seq}`, solicitante, status])).lastID;
    const m = matId || await material();
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue) VALUES (?, ?, 3, 0, ?)`, [id, m, status === 'ENTREGUE' ? 3 : 0]);
    return id;
  };
  const statusDe = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const reservasAtivas = async (id) => (await dbGet(db, `SELECT COUNT(*) n, COALESCE(SUM(quantidade), 0) q
    FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'`, [id]));
  const contar = async (sql, params = []) => (await dbGet(db, sql, params)).n;
  const comPrazo = (p, ms = 4000) => Promise.race([p,
    new Promise((ok) => setTimeout(() => ok({ status: 'TIMEOUT', body: {} }), ms))]);

  /**
   * O INSERT da Auditoria com `entidade`/`acao` falha uma vez (gancho em `db.run`: as rotas usam o binding
   * desestruturado, um stub no modulo nao as alcanca). Devolve a resposta e os avisos do console.
   */
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
    const avisos = []; const warn = console.warn;
    console.warn = (...a) => avisos.push(a.join(' '));
    let r;
    try { r = await fn(); } finally { db.run = original; console.warn = warn; }
    assert.ok(disparou, `gancho da auditoria ${entidade}/${acao} nao disparou`);
    return { r, avisos };
  }
  const avisou = (avisos, entidade, acao) => assert.ok(
    avisos.some((l) => l.includes(AVISO) && l.includes(entidade) && l.includes(acao) && l.includes('falha forcada')),
    `o log nao registrou a falha da auditoria ${entidade}/${acao}: ${JSON.stringify(avisos)}`,
  );

  console.log('\n=== Etapa 121: a Auditoria do ato (C252) — requisicao e regras (RN-10) ===\n');

  await test('[RN-10a] aprovar com a Auditoria APROVACAO falhando -> 200, TOTALMENTE_RESERVADA, uma reserva ATIVA', async () => {
    const id = await requisicao('PENDENTE', 50, await material(10));
    const { r, avisos } = await comAuditoriaFalhando('requisicao', 'APROVACAO',
      () => request(app).put(`/api/almoxarifado/requisicoes/${id}/aprovar`).send({}));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.success, true);
    assert.strictEqual(r.body.status, 'TOTALMENTE_RESERVADA');
    assert.ok(Array.isArray(r.body.reservas) && r.body.reservas.length === 1, JSON.stringify(r.body));
    assert.strictEqual(await statusDe(id), 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual({ ...(await reservasAtivas(id)) }, { n: 1, q: 3 });
    avisou(avisos, 'requisicao', 'APROVACAO');
  });

  await test('[RN-10b] rejeitar com a Auditoria REJEICAO falhando -> 200 { success }, REJEITADO', async () => {
    const id = await requisicao('PENDENTE');
    const { r, avisos } = await comAuditoriaFalhando('requisicao', 'REJEICAO',
      () => request(app).put(`/api/almoxarifado/requisicoes/${id}/rejeitar`).send({ motivo: 'rn10b' }));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(r.body, { success: true });
    assert.strictEqual(await statusDe(id), 'REJEITADO');
    avisou(avisos, 'requisicao', 'REJEICAO');
  });

  await test('[RN-10c] aprovar valor com a Auditoria APROVACAO_VALOR falhando -> 200, reservada, uma reserva ATIVA', async () => {
    const id = await requisicao('AGUARDANDO_APROVACAO_VALOR', 50, await material(10));
    const { r, avisos } = await comAuditoriaFalhando('requisicao', 'APROVACAO_VALOR',
      () => request(app).put(`/api/almoxarifado/requisicoes/${id}/aprovar-valor`).send({}));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.status, 'TOTALMENTE_RESERVADA', JSON.stringify(r.body));
    assert.strictEqual(await statusDe(id), 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual({ ...(await reservasAtivas(id)) }, { n: 1, q: 3 });
    avisou(avisos, 'requisicao', 'APROVACAO_VALOR');
  });

  await test('[RN-10d] rejeitar valor com a Auditoria REJEICAO_VALOR falhando -> 200, REJEITADO', async () => {
    const id = await requisicao('AGUARDANDO_APROVACAO_VALOR');
    const { r, avisos } = await comAuditoriaFalhando('requisicao', 'REJEICAO_VALOR',
      () => request(app).put(`/api/almoxarifado/requisicoes/${id}/rejeitar-valor`).send({ motivo: 'rn10d' }));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.status, 'REJEITADO', JSON.stringify(r.body));
    assert.strictEqual(await statusDe(id), 'REJEITADO');
    avisou(avisos, 'requisicao', 'REJEICAO_VALOR');
  });

  await test('[RN-10e] confirmar recebimento com a Auditoria CONFIRMACAO_RECEBIMENTO falhando -> 200 com a releitura', async () => {
    const id = await requisicao('ENTREGUE', 1);
    const { r, avisos } = await comAuditoriaFalhando('requisicao', 'CONFIRMACAO_RECEBIMENTO',
      () => request(app).put(`/api/almoxarifado/requisicoes/${id}/confirmar-recebimento`).send({}));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.success, true);
    assert.strictEqual(r.body.recebimento_confirmado_por, 1);
    assert.ok(r.body.recebimento_confirmado_em, JSON.stringify(r.body));
    const row = await dbGet(db, 'SELECT recebimento_confirmado_por p, recebimento_confirmado_em e FROM requisicoes_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(row.p, 1);
    assert.strictEqual(row.e, r.body.recebimento_confirmado_em);
    avisou(avisos, 'requisicao', 'CONFIRMACAO_RECEBIMENTO');
  });

  await test('[RN-10f] encerrar com a Auditoria ENCERRAMENTO falhando -> 200, ENCERRADA, reservas soltas, a trava solta', async () => {
    const id = await requisicao('PENDENTE', 50, await material(10));
    const ap = await request(app).put(`/api/almoxarifado/requisicoes/${id}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    assert.strictEqual((await reservasAtivas(id)).n, 1, 'pre-condicao: uma reserva ATIVA');
    // A reservada que chegou a ENTREGUE com o hold sobrando (o encerramento solta o que sobrou).
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'ENTREGUE' WHERE id = ?", [id]);
    const { r, avisos } = await comAuditoriaFalhando('requisicao', 'ENCERRAMENTO',
      () => comPrazo(request(app).put(`/api/almoxarifado/requisicoes/${id}/encerrar`).send({ motivo: 'rn10f' })));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(r.body, { success: true, status: 'ENCERRADA' });
    assert.strictEqual(await statusDe(id), 'ENCERRADA');
    assert.strictEqual((await reservasAtivas(id)).n, 0, 'a reserva nao foi solta');
    // A trava por requisicao foi solta: outra rota que a pega na mesma requisicao responde (a encerrada nao cancela).
    const c = await comPrazo(request(app).put(`/api/almoxarifado/requisicoes/${id}/cancelar`).send({ motivo: 'rn10f' }));
    assert.notStrictEqual(c.status, 'TIMEOUT', 'a trava da requisicao ficou presa');
    assert.strictEqual(c.status, 400, `${c.status} ${JSON.stringify(c.body)}`);
    assert.strictEqual(await statusDe(id), 'ENCERRADA');
    avisou(avisos, 'requisicao', 'ENCERRAMENTO');
  });

  await test('[RN-10g] copiar com a Auditoria COPIA falhando -> 201 com o rascunho, UM rascunho novo', async () => {
    const id = await requisicao('ENTREGUE');
    const n0 = await contar('SELECT COUNT(*) n FROM requisicoes_almoxarifado');
    const { r, avisos } = await comAuditoriaFalhando('requisicao', 'COPIA',
      () => request(app).post(`/api/almoxarifado/requisicoes/${id}/copiar`).send({}));
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.ok(r.body.id && r.body.numero, JSON.stringify(r.body));
    assert.strictEqual(r.body.status, 'RASCUNHO');
    assert.strictEqual(await contar('SELECT COUNT(*) n FROM requisicoes_almoxarifado'), n0 + 1, 'nao gravou um rascunho so');
    assert.strictEqual(await statusDe(r.body.id), 'RASCUNHO');
    avisou(avisos, 'requisicao', 'COPIA');
  });

  let regraId;
  await test('[RN-10h] criar regra com a Auditoria regra_aprovacao/CRIACAO falhando -> 201 com a regra, UMA regra', async () => {
    const n0 = await contar('SELECT COUNT(*) n FROM regras_aprovacao');
    const { r, avisos } = await comAuditoriaFalhando('regra_aprovacao', 'CRIACAO',
      () => request(app).post('/api/almoxarifado/regras-aprovacao').send({ nome: 'Regra RN10h', valor_minimo: 999999, aprovadores: [1] }));
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.ok(r.body.id, JSON.stringify(r.body));
    assert.strictEqual(r.body.nome, 'Regra RN10h');
    assert.strictEqual(await contar('SELECT COUNT(*) n FROM regras_aprovacao'), n0 + 1, 'nao gravou uma regra so');
    regraId = r.body.id;
    avisou(avisos, 'regra_aprovacao', 'CRIACAO');
  });

  await test('[RN-10i] editar regra com a Auditoria regra_aprovacao/EDICAO falhando -> 200, o nome gravado', async () => {
    if (!regraId) {
      regraId = (await request(app).post('/api/almoxarifado/regras-aprovacao')
        .send({ nome: 'Regra RN10i', valor_minimo: 999999, aprovadores: [1] })).body.id;
    }
    assert.ok(regraId, 'pre-condicao: a regra existe');
    const { r, avisos } = await comAuditoriaFalhando('regra_aprovacao', 'EDICAO',
      () => request(app).put(`/api/almoxarifado/regras-aprovacao/${regraId}`).send({ nome: 'Regra RN10i editada' }));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.regra && r.body.regra.nome, 'Regra RN10i editada', JSON.stringify(r.body));
    assert.strictEqual((await dbGet(db, 'SELECT nome FROM regras_aprovacao WHERE id = ?', [regraId])).nome, 'Regra RN10i editada');
    avisou(avisos, 'regra_aprovacao', 'EDICAO');
  });

  await test('[RN-10j] aprovar regra com a Auditoria APROVACAO_REGRA falhando -> 200, a pendencia APROVADA por quem assinou', async () => {
    const id = await requisicao('PENDENTE');
    const rid = regraId || (await dbRun(db, "INSERT INTO regras_aprovacao (nome, ativo) VALUES ('Regra RN10j', 1)")).lastID;
    const pid = (await dbRun(db, `INSERT INTO requisicao_aprovacoes_regra (requisicao_id, regra_id, regra_nome, aprovadores, status)
      VALUES (?, ?, 'Regra RN10j', '[1]', 'ABERTA')`, [id, rid])).lastID;
    const { r, avisos } = await comAuditoriaFalhando('requisicao', 'APROVACAO_REGRA',
      () => request(app).put(`/api/almoxarifado/requisicoes/${id}/aprovacoes-regra/${pid}/aprovar`).send({}));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.pendencias_abertas, 0, JSON.stringify(r.body));
    const p = await dbGet(db, 'SELECT status, aprovador_id FROM requisicao_aprovacoes_regra WHERE id = ?', [pid]);
    assert.deepStrictEqual({ ...p }, { status: 'APROVADA', aprovador_id: 1 });
    avisou(avisos, 'requisicao', 'APROVACAO_REGRA');
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
