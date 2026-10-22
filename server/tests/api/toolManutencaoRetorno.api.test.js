/**
 * Etapa 177 — o retorno da manutencao com a condicao do item e o destino (volta ao uso ou baixa).
 * Cada cenario cita a RN do plano
 * docs/superpowers/plans/2026-10-22-almoxarifado-etapa177-retorno-da-manutencao-com-condicao-e-destino.md.
 *
 * Executar: cd server && node tests/api/toolManutencaoRetorno.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll, dbGet } = require('../../services/almoxarifado/db');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

let seq = 0;
async function novaFerramenta(db, extra = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO ferramentas_almoxarifado
    (codigo_patrimonio, nome, status, exige_calibracao) VALUES (?,?,?,?)`,
    [`RET-${seq}`, `Ferramenta ${seq}`, extra.status || 'DISPONIVEL', extra.exige_calibracao || 0]);
  return r.lastID;
}

/** Ferramenta em manutencao pela ROTA (o claim de verdade), devolve { fid, mid }. */
async function emManutencao(app, db, extra = {}) {
  const fid = await novaFerramenta(db, extra);
  const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/manutencoes`)
    .send({ descricao: 'Revisao' }).expect(201);
  return { fid, mid: r.body.id };
}

const statusDe = async (db, fid) => (await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid])).status;
const manutencao = (db, mid) => dbGet(db, 'SELECT * FROM manutencoes_ferramenta_almoxarifado WHERE id = ?', [mid]);
const concluir = (app, mid, corpo) => request(app).put(`/api/almoxarifado/manutencoes/${mid}/concluir`).send(corpo);

(async () => {
  // ── RN-177.01 — listas fechadas, recusadas ANTES de fechar a manutencao ───────────────────
  await test('RN-177.01: condicao fora da lista -> 400 literal e a manutencao continua aberta', async () => {
    const { app, db, close } = await createTestApp();
    const { fid, mid } = await emManutencao(app, db);
    const r = await concluir(app, mid, { condicao: 'RUIM', destino: 'USO' }).expect(400);
    assert.strictEqual(r.body.error, 'Condição inválida (use OK, COM_RESTRICAO ou INSERVIVEL)');
    assert.strictEqual((await manutencao(db, mid)).data_fim, null);
    assert.strictEqual(await statusDe(db, fid), 'EM_MANUTENCAO');
    await close();
  });

  await test('RN-177.01: destino fora da lista -> 400 literal e nada muda', async () => {
    const { app, db, close } = await createTestApp();
    const { fid, mid } = await emManutencao(app, db);
    const r = await concluir(app, mid, { condicao: 'OK', destino: 'LIXO' }).expect(400);
    assert.strictEqual(r.body.error, 'Destino inválido (use USO ou BAIXA)');
    assert.strictEqual((await manutencao(db, mid)).data_fim, null);
    assert.strictEqual(await statusDe(db, fid), 'EM_MANUTENCAO');
    await close();
  });

  // ── RN-177.02 — volta ao uso ───────────────────────────────────────────────────────────────
  await test('RN-177.02/06: condicao OK + destino USO -> DISPONIVEL, grava condicao e destino, responde o status', async () => {
    const { app, db, close } = await createTestApp();
    const { fid, mid } = await emManutencao(app, db);
    const r = await concluir(app, mid, { condicao: 'OK', destino: 'USO' }).expect(200);
    assert.deepStrictEqual(r.body, { success: true, status: 'DISPONIVEL' });
    assert.strictEqual(await statusDe(db, fid), 'DISPONIVEL');
    const m = await manutencao(db, mid);
    assert.ok(m.data_fim, 'data_fim nao gravada');
    assert.strictEqual(m.condicao_retorno, 'OK');
    assert.strictEqual(m.destino, 'USO');
    await close();
  });

  await test('RN-177.02 (B1140): corpo vazio continua valendo — volta ao uso, condicao NULL, destino USO', async () => {
    const { app, db, close } = await createTestApp();
    const { fid, mid } = await emManutencao(app, db);
    await concluir(app, mid, {}).expect(200);
    assert.strictEqual(await statusDe(db, fid), 'DISPONIVEL');
    const m = await manutencao(db, mid);
    assert.strictEqual(m.condicao_retorno, null);
    assert.strictEqual(m.destino, 'USO');
    await close();
  });

  // ── RN-177.03/04/05 — combinacoes que exigem algo ──────────────────────────────────────────
  await test('RN-177.03: inservivel nao volta ao uso -> 400 literal e nada muda', async () => {
    const { app, db, close } = await createTestApp();
    const { fid, mid } = await emManutencao(app, db);
    const r = await concluir(app, mid, { condicao: 'INSERVIVEL', destino: 'USO', observacoes: 'quebrou' }).expect(400);
    assert.strictEqual(r.body.error, 'Ferramenta inservível não volta ao uso — escolha a baixa');
    assert.strictEqual((await manutencao(db, mid)).data_fim, null);
    assert.strictEqual(await statusDe(db, fid), 'EM_MANUTENCAO');
    // destino AUSENTE tambem e uso: o inservivel sem destino recusa igual
    const r2 = await concluir(app, mid, { condicao: 'INSERVIVEL', observacoes: 'quebrou' }).expect(400);
    assert.strictEqual(r2.body.error, 'Ferramenta inservível não volta ao uso — escolha a baixa');
    await close();
  });

  await test('RN-177.04: com restricao sem observacoes -> 400 literal; com elas -> DISPONIVEL e a restricao gravada', async () => {
    const { app, db, close } = await createTestApp();
    const { fid, mid } = await emManutencao(app, db);
    const r = await concluir(app, mid, { condicao: 'COM_RESTRICAO', destino: 'USO', observacoes: '   ' }).expect(400);
    assert.strictEqual(r.body.error, 'Descreva a restrição nas observações');
    assert.strictEqual((await manutencao(db, mid)).data_fim, null);
    await concluir(app, mid, { condicao: 'COM_RESTRICAO', destino: 'USO', observacoes: 'So para servico leve' }).expect(200);
    assert.strictEqual(await statusDe(db, fid), 'DISPONIVEL');
    const m = await manutencao(db, mid);
    assert.strictEqual(m.condicao_retorno, 'COM_RESTRICAO');
    assert.strictEqual(m.observacoes, 'So para servico leve');
    await close();
  });

  await test('RN-177.05: baixa sem observacoes -> 400 literal e nada muda', async () => {
    const { app, db, close } = await createTestApp();
    const { fid, mid } = await emManutencao(app, db);
    const r = await concluir(app, mid, { condicao: 'INSERVIVEL', destino: 'BAIXA' }).expect(400);
    assert.strictEqual(r.body.error, 'Informe o motivo da baixa nas observações');
    assert.strictEqual((await manutencao(db, mid)).data_fim, null);
    assert.strictEqual(await statusDe(db, fid), 'EM_MANUTENCAO');
    await close();
  });

  await test('RN-177.05/06: baixa com motivo -> BAIXADA, manutencao fechada com destino BAIXA, trilha MANUTENCAO_FIM e BAIXA', async () => {
    const { app, db, close } = await createTestApp();
    const { fid, mid } = await emManutencao(app, db);
    const r = await concluir(app, mid, { condicao: 'INSERVIVEL', destino: 'BAIXA', observacoes: 'Motor queimado' }).expect(200);
    assert.deepStrictEqual(r.body, { success: true, status: 'BAIXADA' });
    assert.strictEqual(await statusDe(db, fid), 'BAIXADA');
    const m = await manutencao(db, mid);
    assert.ok(m.data_fim);
    assert.strictEqual(m.condicao_retorno, 'INSERVIVEL');
    assert.strictEqual(m.destino, 'BAIXA');
    const fim = await dbAll(db, `SELECT dados_novos FROM auditoria_log_almoxarifado
      WHERE entidade = 'ferramenta' AND entidade_id = ? AND acao = 'MANUTENCAO_FIM'`, [fid]);
    assert.strictEqual(fim.length, 1);
    assert.ok(/"condicao":"INSERVIVEL"/.test(fim[0].dados_novos) && /"destino":"BAIXA"/.test(fim[0].dados_novos), fim[0].dados_novos);
    const baixa = await dbAll(db, `SELECT dados_novos FROM auditoria_log_almoxarifado
      WHERE entidade = 'ferramenta' AND entidade_id = ? AND acao = 'BAIXA'`, [fid]);
    assert.strictEqual(baixa.length, 1, 'sem a linha BAIXA na trilha');
    assert.ok(/Motor queimado/.test(baixa[0].dados_novos), baixa[0].dados_novos);
    // o GET das manutencoes devolve os dois (RN-177.06)
    const lista = await request(app).get(`/api/almoxarifado/ferramentas/${fid}/manutencoes`).expect(200);
    assert.strictEqual(lista.body[0].condicao_retorno, 'INSERVIVEL');
    assert.strictEqual(lista.body[0].destino, 'BAIXA');
    await close();
  });

  // ── RN-177.07 — BAIXADA nao circula ────────────────────────────────────────────────────────
  await test('RN-177.07: baixada nao empresta, nao entra em manutencao, nao registra ocorrencia, nao bloqueia', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db, { status: 'BAIXADA' });
    const e = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`).send({ colaborador_nome: 'Ana' }).expect(400);
    assert.strictEqual(e.body.error, 'Ferramenta não está disponível (status atual: BAIXADA)');
    const m = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/manutencoes`).send({ descricao: 'x' }).expect(400);
    assert.strictEqual(m.body.error, 'Ferramenta não pode entrar em manutenção (status atual: BAIXADA)');
    const o = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/ocorrencias`)
      .field('tipo', 'AVARIA').field('descricao', 'x').expect(400);
    assert.strictEqual(o.body.error, 'Ferramenta não pode registrar ocorrência (status atual: BAIXADA)');
    const b = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/bloquear`).send({ justificativa: 'motivo qualquer' }).expect(400);
    assert.strictEqual(b.body.error, 'Ferramenta não pode ser bloqueada (status atual: BAIXADA)');
    assert.strictEqual(await statusDe(db, fid), 'BAIXADA');
    await close();
  });

  // ── RN-177.08 — reverter a baixa ───────────────────────────────────────────────────────────
  await test('RN-177.08: reverter baixa -> DISPONIVEL e trilha REVERSAO_BAIXA com a justificativa', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db, { status: 'BAIXADA' });
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/reverter-baixa`).send({ justificativa: 'baixa errada' }).expect(200);
    assert.strictEqual(await statusDe(db, fid), 'DISPONIVEL');
    const a = await dbAll(db, `SELECT dados_novos FROM auditoria_log_almoxarifado
      WHERE entidade = 'ferramenta' AND entidade_id = ? AND acao = 'REVERSAO_BAIXA'`, [fid]);
    assert.strictEqual(a.length, 1);
    assert.ok(/baixa errada/.test(a[0].dados_novos), a[0].dados_novos);
    await close();
  });

  await test('RN-177.08: reverter fora de BAIXADA -> 400 com o status; inexistente -> 404; sem justificativa -> 400', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/reverter-baixa`).send({ justificativa: 'motivo qualquer' }).expect(400);
    assert.strictEqual(r.body.error, 'Ferramenta não está baixada (status atual: DISPONIVEL)');
    const r2 = await request(app).post('/api/almoxarifado/ferramentas/999999/reverter-baixa').send({ justificativa: 'motivo qualquer' }).expect(404);
    assert.strictEqual(r2.body.error, 'Ferramenta não encontrada');
    const fb = await novaFerramenta(db, { status: 'BAIXADA' });
    const r3 = await request(app).post(`/api/almoxarifado/ferramentas/${fb}/reverter-baixa`).send({}).expect(400);
    assert.ok(/Dados inválidos/.test(r3.body.error), r3.body.error);
    assert.strictEqual(await statusDe(db, fb), 'BAIXADA');
    await close();
  });

  // ── RN-177.09 — painel de calibracoes ──────────────────────────────────────────────────────
  await test('RN-177.09: o painel de calibracoes ignora a ferramenta baixada (metade positiva: a disponivel aparece)', async () => {
    const { app, db, close } = await createTestApp();
    const viva = await novaFerramenta(db, { exige_calibracao: 1 });
    const baixada = await novaFerramenta(db, { exige_calibracao: 1, status: 'BAIXADA' });
    const r = await request(app).get('/api/almoxarifado/calibracoes/painel').expect(200);
    const ids = [...r.body.vencidas, ...r.body.a_vencer].map((x) => x.id);
    assert.ok(ids.includes(viva), 'a ferramenta viva sem calibracao tinha de aparecer como vencida');
    assert.ok(!ids.includes(baixada), 'a baixada apareceu no painel');
    await close();
  });

  // ── Fase 5 (revisao adversarial independente) ─────────────────────────────────────────────
  await test('Fase 5 / RN-177.09: baixada com calibracao VALIDA a vencer sai do painel (metade positiva: a viva com a mesma calibracao aparece)', async () => {
    const { app, db, close } = await createTestApp();
    const viva = await novaFerramenta(db, { exige_calibracao: 1 });
    const baixada = await novaFerramenta(db, { exige_calibracao: 1, status: 'BAIXADA' });
    const hoje = diaLocal.hojeLocalISO();
    for (const fid of [viva, baixada]) {
      await dbRun(db, `INSERT INTO calibracoes_ferramenta_almoxarifado (ferramenta_id, data_calibracao, data_validade)
        VALUES (?, date(?, '-30 days'), date(?, '+10 days'))`, [fid, hoje, hoje]);
    }
    const r = await request(app).get('/api/almoxarifado/calibracoes/painel').expect(200);
    assert.ok(r.body.a_vencer.map((x) => x.id).includes(viva), 'a viva com calibracao a vencer em 10 dias tinha de aparecer');
    const ids = [...r.body.vencidas, ...r.body.a_vencer].map((x) => x.id);
    assert.ok(!ids.includes(baixada), 'a baixada com calibracao valida apareceu no painel');
    await close();
  });

  await test('Fase 5 / B1140: baixa sem condicao e aceita — BAIXADA, condicao_retorno NULL, destino BAIXA', async () => {
    const { app, db, close } = await createTestApp();
    const { fid, mid } = await emManutencao(app, db);
    const r = await concluir(app, mid, { destino: 'BAIXA', observacoes: 'Descartada sem laudo' }).expect(200);
    assert.deepStrictEqual(r.body, { success: true, status: 'BAIXADA' });
    assert.strictEqual(await statusDe(db, fid), 'BAIXADA');
    const m = await manutencao(db, mid);
    assert.strictEqual(m.condicao_retorno, null);
    assert.strictEqual(m.destino, 'BAIXA');
    await close();
  });

  await test('Fase 5: anomalia — ferramenta fora de EM_MANUTENCAO ao concluir com baixa nao grava destino BAIXA nem a trilha BAIXA', async () => {
    const { app, db, close } = await createTestApp();
    const { fid, mid } = await emManutencao(app, db);
    // fixture direta: alguem tirou a ferramenta de EM_MANUTENCAO por fora (o caminho anomalo de sempre)
    await dbRun(db, "UPDATE ferramentas_almoxarifado SET status = 'BLOQUEADA' WHERE id = ?", [fid]);
    const r = await concluir(app, mid, { condicao: 'INSERVIVEL', destino: 'BAIXA', observacoes: 'Motor queimado' }).expect(400);
    assert.strictEqual(r.body.error, 'Estado da ferramenta mudou durante a conclusão da manutenção (status atual: BLOQUEADA)');
    assert.strictEqual(await statusDe(db, fid), 'BLOQUEADA');
    const m = await manutencao(db, mid);
    assert.ok(m.data_fim, 'a manutencao continua fechada (como antes)');
    assert.strictEqual(m.destino, null, 'gravou destino BAIXA sem a ferramenta ter sido baixada');
    const baixa = await dbAll(db, `SELECT id FROM auditoria_log_almoxarifado
      WHERE entidade = 'ferramenta' AND entidade_id = ? AND acao = 'BAIXA'`, [fid]);
    assert.strictEqual(baixa.length, 0);
    const fim = await dbAll(db, `SELECT dados_novos FROM auditoria_log_almoxarifado
      WHERE entidade = 'ferramenta' AND entidade_id = ? AND acao = 'MANUTENCAO_FIM'`, [fid]);
    assert.strictEqual(fim.length, 1);
    assert.ok(/"destino_pedido":"BAIXA"/.test(fim[0].dados_novos), fim[0].dados_novos);
    await close();
  });

  await test('Fase 5 / B1143: usuario sem perfil (PRODUCAO) leva 403 em concluir e em reverter-baixa; nada muda', async () => {
    const { app, db, close, setUser } = await createTestApp();
    const { fid, mid } = await emManutencao(app, db);
    const fb = await novaFerramenta(db, { status: 'BAIXADA' });
    setUser({ id: 7, nome: 'Chao de Fabrica', email: 'p@t.com' }); // sem perfil -> PRODUCAO
    await concluir(app, mid, { condicao: 'INSERVIVEL', destino: 'BAIXA', observacoes: 'Motor queimado' }).expect(403);
    assert.strictEqual((await manutencao(db, mid)).data_fim, null);
    assert.strictEqual(await statusDe(db, fid), 'EM_MANUTENCAO');
    await request(app).post(`/api/almoxarifado/ferramentas/${fb}/reverter-baixa`).send({ justificativa: 'baixa errada' }).expect(403);
    assert.strictEqual(await statusDe(db, fb), 'BAIXADA');
    await close();
  });

  // ── T3 — integracao pela rota ──────────────────────────────────────────────────────────────
  await test('integracao: manutencao -> baixa -> emprestar recusa -> reverter -> emprestar -> devolver -> manutencao -> volta ao uso', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    const m1 = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/manutencoes`).send({ descricao: 'Ruido no motor' }).expect(201);
    await concluir(app, m1.body.id, { condicao: 'INSERVIVEL', destino: 'BAIXA', observacoes: 'Sem conserto' }).expect(200);
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`).send({ colaborador_nome: 'Ana' }).expect(400);
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/reverter-baixa`).send({ justificativa: 'conserto achado' }).expect(200);
    const e = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`).send({ colaborador_nome: 'Ana' }).expect(201);
    await request(app).post(`/api/almoxarifado/emprestimos/${e.body.id}/devolver`).send({}).expect(200);
    const m2 = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/manutencoes`).send({ descricao: 'Revisao' }).expect(201);
    await concluir(app, m2.body.id, { condicao: 'OK', destino: 'USO' }).expect(200);
    assert.strictEqual(await statusDe(db, fid), 'DISPONIVEL');
    const hist = await request(app).get(`/api/almoxarifado/ferramentas/${fid}/manutencoes`).expect(200);
    assert.deepStrictEqual(hist.body.map((x) => [x.condicao_retorno, x.destino]), [['OK', 'USO'], ['INSERVIVEL', 'BAIXA']]);
    await close();
  });

  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})();
