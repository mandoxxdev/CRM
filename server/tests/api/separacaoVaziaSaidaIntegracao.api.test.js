/**
 * Etapa 101 (T4, RN-01..RN-10) — integracao: o documento da Em Separacao vazia ate o fim, pela rota E pelo servico.
 *
 * Cada jornada monta a Em Separacao vazia por um caminho (servico `separarRequisicao(db, R, [], user)`, servico
 * `devolverSeparado`, ou as rotas), sai dela pela rota (cancelar dos outros modulos, cancelar do almoxarifado, encerrar)
 * e segue o documento: a fila (servico `listarFilaSeparacao` E rota `GET /api/almoxarifado/fila-separacao`) mostra a
 * requisicao antes e nao mostra depois, a reserva sai do material, e o gesto seguinte recusa. A J4 cruza a C202 com a
 * C195: a criacao recusa 1,5 de serie (T2); o legado com 1,5 entrega o inteiro e encerra pela Em Separacao vazia.
 *
 * Plano: docs/superpowers/plans/2026-10-15-almoxarifado-etapa101-em-separacao-vazia-tem-saida.md (T4)
 * Executar: cd server && node tests/api/separacaoVaziaSaidaIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Adm 101I', role: 'admin', is_superadmin: 1, email: 'a101i@t.com' };
const S = { id: 10111, nome: 'Solic 101I', role: 'user', email: 's101i@t.com' };
const ALMOX = { id: 10113, nome: 'Almox 101I', role: 'user', email: 'x101i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE };
const M2 = 'Esta requisição já teve material entregue e não pode ser cancelada; o almoxarifado pode encerrá-la.';
const S1_SEPARAR = 'Requisição deve estar aprovada, aguardando estoque/compra, em separação ou parcialmente atendida para separar';
const S1_SERIE = (nome, q) => `${nome}: material com controle de série exige quantidade inteira na requisição (informado: ${q})`;
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 101 (T4): a Em Separacao vazia ate o fim — rota e servico ===\n');
  const { app, db, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };
  const API = '/api/almoxarifado';

  const material = async (q, { serie = 0 } = {}) => {
    const c = `E101I-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, material_critico, controle_serie)
      VALUES (?, ?, 'PC', ?, 0, 1, 0, ?)`, [c, `Mat ${c}`, q, serie])).lastID;
    return { id, nome: `Mat ${c}` };
  };
  const criar = (m, q) => as(S, () => request(app).post('/api/requisicoes-material').send({
    setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-101I', itens: [{ material_id: m, quantidade: q }],
  }).then((x) => x));
  const montar = async (pede, fisico, opts) => {
    const mat = await material(fisico, opts);
    const cr = await criar(mat.id, pede);
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    const R = cr.body.id;
    const ap = await request(app).put(`${API}/requisicoes/${R}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R])).id;
    return { m: mat.id, nome: mat.nome, R, item };
  };
  const ok = (r, rot) => assert.strictEqual(r.status, 200, `${rot}: ${r.status} ${JSON.stringify(r.body)}`);
  const st = async (x) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [x.R])).status;
  const reservas = async (x) => (await dbAll(db, 'SELECT status FROM reservas_material_almoxarifado WHERE requisicao_id = ? ORDER BY id', [x.R])).map((r) => r.status);
  const reservado = async (x) => Number((await dbGet(db, 'SELECT COALESCE(quantidade_reservada,0) r FROM materiais_almoxarifado WHERE id = ?', [x.m])).r);
  const naFilaServico = async (x) => (await requisitionService.listarFilaSeparacao(db, { ...ALMOX })).find((f) => f.id === x.R) || null;
  const naFilaRota = async (x) => {
    const r = await as(ALMOX, () => request(app).get(`${API}/fila-separacao`).then((y) => y));
    ok(r, 'GET fila');
    return r.body.find((f) => f.id === x.R) || null;
  };
  const separarRota = (x, q) => as(ALMOX, () => request(app).put(`${API}/requisicoes/${x.R}/separar`)
    .send({ itens_separados: q == null ? [] : [{ item_id: x.item, quantidade_separada: q }] }).then((r) => r));
  const entregarRota = (x, q, extra = {}) => as(ALMOX, () => request(app).put(`${API}/requisicoes/${x.R}/entregar`)
    .send({ itens_atendidos: [{ item_id: x.item, quantidade_atendida: q, ...extra }] }).then((r) => r));

  // ══════════════ J1 — pelo servico (Iniciar Separacao sem quantidade), cancela quem pediu pelos outros modulos ══════════════
  await test('[101 T4 J1] servico separarRequisicao(R, []) -> EM_SEPARACAO vazia na fila (servico e rota: SEPARAR); S cancela pelos outros modulos -> 200; some das duas filas, reserva LIBERADA, reservado 0; o servico seguinte recusa S1', async () => {
    const x = await montar(2, 4);
    const r = await requisitionService.separarRequisicao(db, x.R, [], { ...ALMOX });
    assert.strictEqual(r.status, 'EM_SEPARACAO');
    const fs = await naFilaServico(x);
    assert.ok(fs, 'a Em Separacao vazia nao esta na fila (servico)');
    assert.ok(fs.etapas.includes('SEPARAR'), JSON.stringify(fs.etapas));
    assert.ok(await naFilaRota(x), 'a Em Separacao vazia nao esta na fila (rota)');
    assert.strictEqual(await reservado(x), 2);
    ok(await as(S, () => request(app).put(`/api/requisicoes-material/${x.R}/cancelar`).send({}).then((y) => y)), 'cancelar');
    assert.strictEqual(await st(x), 'CANCELADO');
    assert.strictEqual(await naFilaServico(x), null, 'a cancelada continua na fila (servico)');
    assert.strictEqual(await naFilaRota(x), null, 'a cancelada continua na fila (rota)');
    assert.deepStrictEqual(await reservas(x), ['LIBERADA']);
    assert.strictEqual(await reservado(x), 0);
    await assert.rejects(requisitionService.separarRequisicao(db, x.R, [{ item_id: x.item, quantidade_separada: 1 }], { ...ALMOX }),
      (e) => e.status === 400 && e.message === S1_SEPARAR);
  });

  // ══════════════ J2 — pelo servico (separa e devolve tudo), cancela o administrador pelo almoxarifado ══════════════
  await test('[101 T4 J2] servico separa 2 e devolverSeparado devolve 2 -> EM_SEPARACAO vazia; ADMIN (sistema) cancela pelo almoxarifado -> 200; some da fila; reserva LIBERADA; separar pela rota recusa S1', async () => {
    const x = await montar(2, 4);
    await requisitionService.separarRequisicao(db, x.R, [{ item_id: x.item, quantidade_separada: 2 }], { ...ALMOX });
    await requisitionService.devolverSeparado(db, x.R, { motivo: 'caiu', itens: [{ item_id: x.item, quantidade: 2 }] }, { ...ALMOX });
    assert.strictEqual(await st(x), 'EM_SEPARACAO');
    assert.ok(await naFilaRota(x), 'a Em Separacao vazia nao esta na fila (rota)');
    ok(await request(app).put(`${API}/requisicoes/${x.R}/cancelar`).send({ motivo: 'desistiu' }), 'cancelar');
    assert.strictEqual(await st(x), 'CANCELADO');
    assert.strictEqual(await naFilaServico(x), null);
    assert.strictEqual(await naFilaRota(x), null);
    assert.deepStrictEqual(await reservas(x), ['LIBERADA']);
    assert.strictEqual(await reservado(x), 0);
    const s2 = await separarRota(x, 1);
    assert.strictEqual(s2.status, 400); assert.strictEqual(s2.body.error, S1_SEPARAR);
  });

  // ══════════════ J3 — pela rota (entrega parcial + separar []): cancelar recusa M2; encerrar fecha ══════════════
  await test('[101 T4 J3] rota: pede 4, separa 2, entrega 2, separar [] -> EM_SEPARACAO vazia com entrega; S cancela -> 400 M2; ALMOX encerra -> 200 ENCERRADA; some das filas; reserva LIBERADA; reservado 0; entregar depois recusa', async () => {
    const x = await montar(4, 4);
    ok(await separarRota(x, 2), 'separar'); ok(await entregarRota(x, 2), 'entregar');
    assert.strictEqual(await st(x), 'PARCIALMENTE_ATENDIDA');
    ok(await separarRota(x, null), 'separar []');
    assert.strictEqual(await st(x), 'EM_SEPARACAO');
    assert.ok(await naFilaServico(x), 'nao esta na fila (servico)');
    const c = await as(S, () => request(app).put(`/api/requisicoes-material/${x.R}/cancelar`).send({}).then((y) => y));
    assert.strictEqual(c.status, 400); assert.strictEqual(c.body.error, M2);
    const e = await as(ALMOX, () => request(app).put(`${API}/requisicoes/${x.R}/encerrar`).send({ motivo: 'fim' }).then((y) => y));
    ok(e, 'encerrar');
    assert.strictEqual(await st(x), 'ENCERRADA');
    assert.strictEqual(await naFilaServico(x), null);
    assert.strictEqual(await naFilaRota(x), null);
    assert.deepStrictEqual(await reservas(x), ['LIBERADA']);
    assert.strictEqual(await reservado(x), 0);
    const depois = await entregarRota(x, 1);
    assert.strictEqual(depois.status, 400, JSON.stringify(depois.body));
    const enc = await dbAll(db, `SELECT * FROM auditoria_log_almoxarifado WHERE entidade='requisicao' AND entidade_id=? AND acao='ENCERRAMENTO'`, [x.R]);
    assert.strictEqual(enc.length, 1);
    assert.strictEqual(enc[0].justificativa, 'fim');
  });

  // ══════════════ J4 — C202 x C195: a criacao recusa a fracao de serie; o legado sai pela Em Separacao vazia ══════════════
  await test('[101 T4 J4] serie: criar 1,5 -> 400 S1 e nada gravado; o LEGADO com 1,5 entrega 1 (com a serie), separar [] -> EM_SEPARACAO vazia com entrega; cancelar -> M2; encerrar -> 200; serie SAIU, reserva LIBERADA', async () => {
    const mat = await material(2, { serie: 1 });
    const antes = Number((await dbGet(db, 'SELECT COUNT(*) n FROM requisicoes_almoxarifado')).n);
    const cr = await criar(mat.id, 1.5);
    assert.strictEqual(cr.status, 400, JSON.stringify(cr.body));
    assert.strictEqual(cr.body.error, S1_SERIE(mat.nome, 1.5));
    assert.strictEqual(Number((await dbGet(db, 'SELECT COUNT(*) n FROM requisicoes_almoxarifado')).n), antes, 'gravou requisicao');
    // O legado: criada com 2 (aceito), a quantidade vira 1,5 como as gravadas antes desta versao.
    const cr2 = await criar(mat.id, 2);
    assert.strictEqual(cr2.status, 201, JSON.stringify(cr2.body));
    const x = { m: mat.id, R: cr2.body.id };
    x.item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [x.R])).id;
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_solicitada = 1.5 WHERE id = ?', [x.item]);
    ok(await request(app).put(`${API}/requisicoes/${x.R}/aprovar`).send({}), 'aprovar');
    const s1 = (await dbRun(db, "INSERT INTO series_almoxarifado (material_id, numero, status) VALUES (?, ?, 'EM_ESTOQUE')", [mat.id, `SN-${x.R}-1`])).lastID;
    await dbRun(db, "INSERT INTO series_almoxarifado (material_id, numero, status) VALUES (?, ?, 'EM_ESTOQUE')", [mat.id, `SN-${x.R}-2`]);
    ok(await separarRota(x, 1), 'separar 1');
    ok(await entregarRota(x, 1, { serie_ids: [s1] }), 'entregar 1');
    assert.strictEqual(await st(x), 'PARCIALMENTE_ATENDIDA');
    const meia = await separarRota(x, 0.5);
    assert.strictEqual(meia.status, 400, 'a separacao do 0,5 de serie recusa (99)');
    ok(await separarRota(x, null), 'separar []');
    assert.strictEqual(await st(x), 'EM_SEPARACAO');
    const c = await as(S, () => request(app).put(`/api/requisicoes-material/${x.R}/cancelar`).send({}).then((y) => y));
    assert.strictEqual(c.status, 400); assert.strictEqual(c.body.error, M2);
    ok(await as(ALMOX, () => request(app).put(`${API}/requisicoes/${x.R}/encerrar`).send({}).then((y) => y)), 'encerrar');
    assert.strictEqual(await st(x), 'ENCERRADA');
    assert.notStrictEqual((await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE id = ?', [s1])).status, 'EM_ESTOQUE');
    assert.ok((await reservas(x)).every((s) => s !== 'ATIVA'), JSON.stringify(await reservas(x)));
    assert.strictEqual(await reservado(x), 0);
  });

  terminou = true;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
