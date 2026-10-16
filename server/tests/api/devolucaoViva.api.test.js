/**
 * Etapa 117 (C236, C237) — a devolucao cuja ENTRADA_DEVOLUCAO foi estornada pelo livro deixa de contar no "restante" da
 * saida: na validacao, na gravacao, na lista da tela e na exclusao da requisicao (RN-01..RN-04). E a entrada de uma
 * devolucao para SUCATA nao se estorna com a perna SUCATA de pe (RN-05) — tirava do estoque duas vezes.
 *
 * Executar: cd server && node tests/api/devolucaoViva.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { AsyncResource } = require('async_hooks');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const stockService = require('../../services/almoxarifado/stockService');

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
    const codigo = `DV117-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, codigo])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const ultima = async (m, tipo) => (await dbGet(db,
    'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1', [m.id, tipo])).id;
  const mov = async (m, body) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'dv117',
      justificativa: 'preparo dv117', documento_vinculado: 'NF-DV117', ...body });
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    return ultima(m, body.tipo);
  };
  const devolver = (m, saidaId, quantidade, destino = 'ESTOQUE') => request(app).post('/api/almoxarifado/devolucoes')
    .send({ material_id: m.id, quantidade, motivo: 'NAO_UTILIZADO', destino, movimentacao_saida_id: saidaId });
  const estornar = (movId) => request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'dv117' });
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q;
  const elegivel = async (m, saidaId) => {
    const r = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${m.id}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.find((s) => s.id === saidaId);
  };
  const cancelado = async (id) => (await dbGet(db, 'SELECT COALESCE(cancelado, 0) c FROM movimentacoes_almoxarifado WHERE id = ?', [id])).c;

  /** Entrada 5 -> Saida 2 -> devolucao 2 (ESTOQUE) -> estorno da ENTRADA_DEVOLUCAO: fisico 3, a devolucao "morta". */
  async function devolucaoEstornada() {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const d = await devolver(m, saidaId, 2);
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    const e = await estornar(await ultima(m, 'ENTRADA_DEVOLUCAO'));
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.strictEqual(await fisico(m), 3);
    return { m, saidaId };
  }

  // ── RN-01 / RN-02 — a validacao e a gravacao contam so a devolucao viva ─────────────────────────────────────────────
  await test('[RN-01] devolvida e estornada a entrada, devolver de novo os 2 passa (201) e o fisico volta a 5', async () => {
    const { m, saidaId } = await devolucaoEstornada();
    const d = await devolver(m, saidaId, 2);
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    assert.strictEqual(await fisico(m), 5);
  });

  await test('[RN-01] a recusa diz os numeros vivos: devolver 3 -> "ja foram devolvidos 0 e restam 2"', async () => {
    const { m, saidaId } = await devolucaoEstornada();
    const d = await devolver(m, saidaId, 3);
    assert.strictEqual(d.status, 400, JSON.stringify(d.body));
    assert.strictEqual(d.body.error, `Devolução acima do entregue: a saída ${saidaId} entregou 2, já foram devolvidos 0 e restam 2`);
    assert.strictEqual(await fisico(m), 3);
  });

  await test('[RN-01] duas devolucoes de 1 numa Saida de 3, uma estornada: restam 2 (devolver 3 recusa com "devolvidos 1 e restam 2")', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 3 });
    assert.strictEqual((await devolver(m, saidaId, 1)).status, 201);
    const primeira = await ultima(m, 'ENTRADA_DEVOLUCAO');
    assert.strictEqual((await devolver(m, saidaId, 1)).status, 201);
    assert.strictEqual((await estornar(primeira)).status, 200);
    const d = await devolver(m, saidaId, 3);
    assert.strictEqual(d.status, 400, JSON.stringify(d.body));
    assert.strictEqual(d.body.error, `Devolução acima do entregue: a saída ${saidaId} entregou 3, já foram devolvidos 1 e restam 2`);
    assert.strictEqual((await devolver(m, saidaId, 2)).status, 201);
    assert.strictEqual(await fisico(m), 5);
  });

  await test('[RN-01] controle: com a devolucao viva, devolver de novo continua recusado ("devolvidos 2 e restam 0")', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    assert.strictEqual((await devolver(m, saidaId, 2)).status, 201);
    const d = await devolver(m, saidaId, 1);
    assert.strictEqual(d.status, 400, JSON.stringify(d.body));
    assert.strictEqual(d.body.error, `Devolução acima do entregue: a saída ${saidaId} entregou 2, já foram devolvidos 2 e restam 0`);
    assert.strictEqual(await fisico(m), 5);
  });

  await test('[RN-02] a gravacao confere a mesma conta: pelo servico, sem a validacao da rota, a devolucao de novo grava', async () => {
    // Prova o INSERT ... WHERE EXISTS sozinho: a validacao previa e a mesma funcao, mas o INSERT e outra conta — se so a
    // validacao contasse a viva, este caminho cairia em "A saida mudou enquanto a devolucao era gravada".
    const { m, saidaId } = await devolucaoEstornada();
    const r = await require('../../services/almoxarifado/returnService').registrarDevolucao(db, SUPER, {
      material_id: m.id, quantidade: 2, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.ok(r && r.id, JSON.stringify(r));
    assert.strictEqual(await fisico(m), 5);
  });

  await test('[RN-02] duas devolucoes de 2 ao mesmo tempo depois do estorno da entrada: uma passa, fisico 5', async () => {
    const { m, saidaId } = await devolucaoEstornada();
    const [a, b] = await Promise.all([devolver(m, saidaId, 2), devolver(m, saidaId, 2)]);
    assert.deepStrictEqual([a.status, b.status].sort(), [201, 400], JSON.stringify([a.body, b.body]));
    assert.strictEqual(await fisico(m), 5);
  });

  // ── RN-03 — a lista da tela ─────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-03] a lista oferece 2 de novo, e devolver o numero da lista passa', async () => {
    const { m, saidaId } = await devolucaoEstornada();
    const s = await elegivel(m, saidaId);
    assert.ok(s, 'saida fora da lista');
    assert.deepStrictEqual([s.quantidade_devolvida, s.saldo_devolvivel], [0, 2]);
    const d = await devolver(m, saidaId, s.saldo_devolvivel);
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    const depois = await elegivel(m, saidaId);
    assert.deepStrictEqual([depois.quantidade_devolvida, depois.saldo_devolvivel], [2, 0]);
  });

  // ── RN-04 — excluir a requisicao ────────────────────────────────────────────────────────────────────────────────────
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

  await test('[RN-04] entrega 2 -> devolucao 2 -> estorno da entrada (3) -> excluir a requisicao: fisico 5 (era 3)', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const { rq, saidaId } = await requisicaoEntregue(m, 2);
    assert.strictEqual((await devolver(m, saidaId, 2)).status, 201);
    assert.strictEqual((await estornar(await ultima(m, 'ENTRADA_DEVOLUCAO'))).status, 200);
    assert.strictEqual(await fisico(m), 3);
    const ex = await request(app).delete(`/api/almoxarifado/requisicoes/${rq}`).send({ justificativa: 'dv117' });
    assert.strictEqual(ex.status, 200, JSON.stringify(ex.body));
    assert.strictEqual(await fisico(m), 5);
  });

  await test('[RN-04] controle: com a devolucao viva, excluir nao credita nada (fisico 5)', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const { rq, saidaId } = await requisicaoEntregue(m, 2);
    assert.strictEqual((await devolver(m, saidaId, 2)).status, 201);
    const ex = await request(app).delete(`/api/almoxarifado/requisicoes/${rq}`).send({ justificativa: 'dv117' });
    assert.strictEqual(ex.status, 200, JSON.stringify(ex.body));
    assert.strictEqual(await fisico(m), 5);
  });

  await test('[RN-04] ramo legado (o livro nao soma o entregue): a devolucao estornada tambem nao desconta', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const { rq, saidaId } = await requisicaoEntregue(m, 2);
    assert.strictEqual((await devolver(m, saidaId, 2)).status, 201);
    assert.strictEqual((await estornar(await ultima(m, 'ENTRADA_DEVOLUCAO'))).status, 200);
    // o item diz 3 entregues e o livro 2: cai no ramo legado (liquido = entregue - devolvido vivo)
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_entregue = 3, quantidade_atendida = 3 WHERE requisicao_id = ?', [rq]);
    const ex = await request(app).delete(`/api/almoxarifado/requisicoes/${rq}`).send({ justificativa: 'dv117' });
    assert.strictEqual(ex.status, 200, JSON.stringify(ex.body));
    assert.strictEqual(await fisico(m), 6, 'legado: credita 3 - 0 vivo');
  });

  // ── RN-05 — a entrada da devolucao para SUCATA ──────────────────────────────────────────────────────────────────────
  async function devolucaoParaSucata() {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 10 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const d = await devolver(m, saidaId, 2, 'SUCATA');
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    assert.strictEqual(await fisico(m), 8);
    return { m, saidaId, devId: d.body.id, entradaId: await ultima(m, 'ENTRADA_DEVOLUCAO'), sucataId: await ultima(m, 'SUCATA') };
  }
  const E1 = (devId) => `Não é possível estornar: esta entrada é da devolução DEV-${devId}, que foi para a sucata — estornar só a `
    + 'entrada tiraria do estoque de novo o que já saiu pela sucata. Estorne primeiro a sucata desta devolução e depois esta entrada.';

  await test('[RN-05] estornar a entrada com a sucata de pe: 400 E1, nada tocado (fisico 8, a entrada nao cancelada, sem linha ESTORNO)', async () => {
    const { m, devId, entradaId } = await devolucaoParaSucata();
    const antes = (await dbGet(db, "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ESTORNO'", [m.id])).n;
    const e = await estornar(entradaId);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, E1(devId));
    assert.strictEqual(await fisico(m), 8);
    assert.strictEqual(await cancelado(entradaId), 0);
    const depois = (await dbGet(db, "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ESTORNO'", [m.id])).n;
    assert.strictEqual(depois, antes);
  });

  await test('[RN-05] estornada a sucata (10), a entrada estorna (8) e a devolucao morre: devolver 2 de novo passa (10)', async () => {
    const { m, saidaId, entradaId, sucataId } = await devolucaoParaSucata();
    assert.strictEqual((await estornar(sucataId)).status, 200);
    assert.strictEqual(await fisico(m), 10);
    const e = await estornar(entradaId);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.strictEqual(await fisico(m), 8);
    assert.strictEqual((await elegivel(m, saidaId)).saldo_devolvivel, 2);
    assert.strictEqual((await devolver(m, saidaId, 2)).status, 201);
    assert.strictEqual(await fisico(m), 10);
  });

  await test('[RN-05] a entrada de devolucao para ESTOQUE (sem sucata) continua estornavel', async () => {
    const { m } = await devolucaoEstornada();
    assert.strictEqual(await fisico(m), 3);
  });

  await test('[RN-05] a compensacao interna nao passa pela recusa (o estorno de compensacao da entrada roda)', async () => {
    const { m, entradaId } = await devolucaoParaSucata();
    await stockService.cancelarMovimentacao(db, SUPER, entradaId, 'compensacao dv117', { compensacao: true });
    assert.strictEqual(await cancelado(entradaId), 1);
    assert.strictEqual(await fisico(m), 6);
  });

  await test('[RN-05] a condicao tambem no claim: a sucata viva entre a guarda e o claim recusa (gancho na leitura da sucata)', async () => {
    // A guarda previa le a sucata; o gancho a faz parecer estornada SO para essa leitura (a sucata continua de pe no banco).
    // Sem a condicao no claim, o estorno passaria e o fisico iria a 6.
    const { m, devId, entradaId } = await devolucaoParaSucata();
    const getOriginal = db.get;
    const estado = { armado: true };
    db.get = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (estado.armado && /tipo = 'SUCATA'/.test(String(sql)) && /DEV-/.test(JSON.stringify(params) + String(sql))
        && !/^\s*UPDATE/i.test(String(sql))) {
        estado.armado = false;
        return cb(null, undefined);
      }
      return getOriginal.call(db, sql, params, cb);
    };
    let e;
    try { e = await estornar(entradaId); } finally { db.get = getOriginal; }
    assert.strictEqual(estado.armado, false, 'gancho nao disparou');
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, E1(devId));
    assert.strictEqual(await fisico(m), 8);
    assert.strictEqual(await cancelado(entradaId), 0);
  });

  // ── Fase 2 (revisao do plano): R1 series, R2 identidade, R3 claim provisorio, R6 quarentena, R7 sucata parcial/serie ───
  const series = async (m) => (await dbAll(db, 'SELECT numero, status, movimentacao_saida_id s FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id]))
    .map((x) => `${x.numero}:${x.status}:${x.s === null ? '-' : x.s}`);
  const presentes = async (m) => (await dbGet(db,
    "SELECT COUNT(*) n FROM series_almoxarifado WHERE material_id = ? AND status IN ('EM_ESTOQUE','BLOQUEADA')", [m.id])).n;

  await test('[R1] com serie: estornada a entrada da devolucao, as series voltam a Entregue NA saida; a lista as oferece e devolver de novo passa', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] });
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: ids });
    const d = await request(app).post('/api/almoxarifado/devolucoes').send({ material_id: m.id, quantidade: 2, motivo: 'NAO_UTILIZADO',
      destino: 'ESTOQUE', movimentacao_saida_id: saidaId, series: ['V1', 'V2'] });
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    const e = await estornar(await ultima(m, 'ENTRADA_DEVOLUCAO'));
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.deepStrictEqual(await series(m), [`V1:ENTREGUE:${saidaId}`, `V2:ENTREGUE:${saidaId}`]);
    assert.deepStrictEqual([await fisico(m), await presentes(m)], [0, 0]);
    const s = await elegivel(m, saidaId);
    assert.deepStrictEqual([s.saldo_devolvivel, s.series.map((x) => x.numero)], [2, ['V1', 'V2']]);
    const d2 = await request(app).post('/api/almoxarifado/devolucoes').send({ material_id: m.id, quantidade: 2, motivo: 'NAO_UTILIZADO',
      destino: 'ESTOQUE', movimentacao_saida_id: saidaId, series: ['V1', 'V2'] });
    assert.strictEqual(d2.status, 201, JSON.stringify(d2.body));
    assert.deepStrictEqual([await fisico(m), await presentes(m)], [2, 2]);
  });

  await test('[R1] com serie: estornada a entrada da devolucao, o estorno da saida avulsa passa e as series voltam (fisico 2)', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['W1', 'W2'] });
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: ids });
    assert.strictEqual((await request(app).post('/api/almoxarifado/devolucoes').send({ material_id: m.id, quantidade: 2,
      motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId, series: ['W1', 'W2'] })).status, 201);
    assert.strictEqual((await estornar(await ultima(m, 'ENTRADA_DEVOLUCAO'))).status, 200);
    const e = await estornar(saidaId);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.deepStrictEqual([await fisico(m), await presentes(m)], [2, 2]);
  });

  await test('[R1] com serie, pela requisicao: devolucao -> estorno da entrada -> excluir a requisicao devolve as series (invariante fecha)', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['K1', 'K2'] });
    const rq = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-${m.codigo}`])).lastID;
    const it = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,2,0,0,0)`, [rq, m.id])).lastID;
    await requisitionService.separarRequisicao(db, rq, [{ item_id: it, quantidade_separada: 2 }], SUPER);
    const sids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const ent = await request(app).put(`/api/almoxarifado/requisicoes/${rq}/entregar`)
      .send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 2, serie_ids: sids }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
    const saidaId = await ultima(m, 'SAIDA');
    assert.strictEqual((await request(app).post('/api/almoxarifado/devolucoes').send({ material_id: m.id, quantidade: 2,
      motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId, series: ['K1', 'K2'] })).status, 201);
    assert.strictEqual((await estornar(await ultima(m, 'ENTRADA_DEVOLUCAO'))).status, 200);
    const ex = await request(app).delete(`/api/almoxarifado/requisicoes/${rq}`).send({ justificativa: 'dv117' });
    assert.strictEqual(ex.status, 200, JSON.stringify(ex.body));
    assert.deepStrictEqual([await fisico(m), await presentes(m)], [2, 2]);
    assert.deepStrictEqual((await series(m)).map((x) => x.split(':')[1]), ['EM_ESTOQUE', 'EM_ESTOQUE']);
  });

  await test('[R1] com serie, devolucao avulsa (sem saida): o estorno da entrada continua marcando Estornada', async () => {
    const m = await material({ controle_serie: 1 });
    const d = await request(app).post('/api/almoxarifado/devolucoes').send({ material_id: m.id, quantidade: 1, motivo: 'NAO_UTILIZADO',
      destino: 'ESTOQUE', series: ['AV1'] });
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    assert.strictEqual((await estornar(await ultima(m, 'ENTRADA_DEVOLUCAO'))).status, 200);
    assert.deepStrictEqual(await series(m), ['AV1:ESTORNADA:-']);
    assert.strictEqual(await fisico(m), 0);
  });

  await test('[R2] uma ENTRADA_DEVOLUCAO digitada (legado) com a referencia DEV-<id> e estornada nao mata a devolucao (E3, fisico 10)', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 10 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const d = await devolver(m, saidaId, 2);
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    // desde a Fase 5 a Entrada v2 recusa a referencia DEV-<n> nesse tipo; a linha digitada vem do legado (direto no banco)
    const forjada = (await dbRun(db, `INSERT INTO movimentacoes_almoxarifado (material_id, tipo, quantidade, saldo_anterior, saldo_posterior,
      motivo, referencia, usuario_id, usuario_nome) VALUES (?, 'ENTRADA_DEVOLUCAO', 1, 10, 11, 'legado', ?, 1, 'x')`, [m.id, `DEV-${d.body.id}`])).lastID;
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 11 WHERE id = ?', [m.id]);
    assert.strictEqual(await fisico(m), 11);
    assert.strictEqual((await estornar(forjada)).status, 200);
    assert.strictEqual(await fisico(m), 10);
    assert.strictEqual((await elegivel(m, saidaId)).saldo_devolvivel, 0);
    assert.strictEqual((await devolver(m, saidaId, 2)).status, 400);
    const e = await estornar(saidaId);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.ok(e.body.error.startsWith('Não é possível estornar: esta saída já foi devolvida inteira'), e.body.error);
    assert.strictEqual(await fisico(m), 10);
  });

  /** Roda `fn` com o INSERT da linha ESTORNO falhando uma vez; no instante dele, `meio` (fora da secao), 150 ms antes de falhar. */
  async function comLivroFalhando(fn, meio) {
    const original = db.run;
    const estado = { armado: true };
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (estado.armado && typeof sql === 'string' && sql.includes('INSERT INTO movimentacoes_almoxarifado')
        && Array.isArray(params) && params.includes('ESTORNO')) {
        estado.armado = false;
        estado.meio = foraDaSecao(() => { const p = meio(); p.then(() => {}, () => {}); return p; });
        new Promise((r) => setTimeout(r, 150)).then(() => cb.call({}, new Error('falha forcada do livro (teste)')));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res;
    try { res = await fn(); } finally { db.run = original; }
    assert.strictEqual(estado.armado, false, 'gancho nao disparou');
    return { res, meio: await estado.meio };
  }

  await test('[R3] o estorno da entrada da devolucao que falha (livro) com o estorno da saida no meio: a saida recusa (E3), fisico 5', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    assert.strictEqual((await devolver(m, saidaId, 2)).status, 201);
    const entradaId = await ultima(m, 'ENTRADA_DEVOLUCAO');
    const { res, meio } = await comLivroFalhando(() => estornar(entradaId), () => estornar(saidaId));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.strictEqual(meio.status, 400, JSON.stringify(meio.body));
    assert.ok(meio.body.error.startsWith('Não é possível estornar: esta saída já foi devolvida inteira'), meio.body.error);
    assert.strictEqual(await fisico(m), 5);
    assert.deepStrictEqual([await cancelado(saidaId), await cancelado(entradaId)], [0, 0]);
  });

  await test('[R3] o mesmo com uma devolucao de novo no meio: a devolucao recusa ("restam 0"), fisico 5', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    assert.strictEqual((await devolver(m, saidaId, 2)).status, 201);
    const entradaId = await ultima(m, 'ENTRADA_DEVOLUCAO');
    const { res, meio } = await comLivroFalhando(() => estornar(entradaId), () => devolver(m, saidaId, 2));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.strictEqual(meio.status, 400, JSON.stringify(meio.body));
    assert.strictEqual(meio.body.error, `Devolução acima do entregue: a saída ${saidaId} entregou 2, já foram devolvidos 2 e restam 0`);
    assert.strictEqual(await fisico(m), 5);
  });

  await test('[R6/C239 declarado] QUARENTENA: cada volta devolver -> estornar a entrada deixa o bloqueio; estornar os bloqueios os tira', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 10 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const bloqueios = [];
    for (let i = 0; i < 2; i += 1) {
      assert.strictEqual((await devolver(m, saidaId, 2, 'QUARENTENA')).status, 201);
      bloqueios.push(await ultima(m, 'BLOQUEIO'));
      assert.strictEqual((await estornar(await ultima(m, 'ENTRADA_DEVOLUCAO'))).status, 200);
    }
    const est = async () => { const r = await dbGet(db, 'SELECT quantidade_atual q, quantidade_bloqueada b FROM materiais_almoxarifado WHERE id = ?', [m.id]); return [r.q, r.b]; };
    assert.deepStrictEqual(await est(), [8, 4], 'o comportamento declarado na C239 mudou — atualize a C239');
    for (const b of bloqueios) assert.strictEqual((await estornar(b)).status, 200);
    assert.deepStrictEqual(await est(), [8, 0]);
  });

  await test('[R7] devolucao para SUCATA que ficou parcial (a perna SUCATA nao gravou): a entrada estorna (200), sem a E1', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 10 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const original = db.run;
    let armado = true;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (armado && typeof sql === 'string' && sql.includes('INSERT INTO movimentacoes_almoxarifado') && Array.isArray(params)
        && params.includes('SUCATA')) {
        armado = false;
        cb.call({}, new Error('falha forcada da perna SUCATA (teste)'));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let d;
    try { d = await devolver(m, saidaId, 2, 'SUCATA'); } finally { db.run = original; }
    assert.strictEqual(armado, false, 'gancho nao disparou');
    assert.notStrictEqual(d.status, 201, JSON.stringify(d.body));
    const n = (await dbGet(db, "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SUCATA'", [m.id])).n;
    assert.strictEqual(n, 0);
    assert.strictEqual(await fisico(m), 10, 'a entrada da devolucao parcial ficou');
    const e = await estornar(await ultima(m, 'ENTRADA_DEVOLUCAO'));
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.strictEqual(await fisico(m), 8);
  });

  await test('[R7] com serie, a devolucao para SUCATA sem series: a entrada recusa pela guarda de serie de sempre, nao pela E1', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 3, series: ['Z1', 'Z2', 'Z3'] });
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: ids.slice(0, 2) });
    const d = await devolver(m, saidaId, 2, 'SUCATA');
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    const e = await estornar(await ultima(m, 'ENTRADA_DEVOLUCAO'));
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, 'estorno de entrada recusado: ha series desta entrada ja movimentadas — estorne as saidas primeiro');
  });

  await test('[R3] o estorno da perna SUCATA que falha (livro) com o estorno da entrada no meio: a entrada recusa (E1), fisico 8', async () => {
    const { m, devId, entradaId, sucataId } = await devolucaoParaSucata();
    const { res, meio } = await comLivroFalhando(() => estornar(sucataId), () => estornar(entradaId));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.strictEqual(meio.status, 400, JSON.stringify(meio.body));
    assert.strictEqual(meio.body.error, E1(devId));
    assert.strictEqual(await fisico(m), 8);
    assert.deepStrictEqual([await cancelado(sucataId), await cancelado(entradaId)], [0, 0]);
  });

  await test('[R1] com serie: o estorno da entrada da devolucao que falha (livro) devolve as series a Em estoque sem o vinculo', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['Y1', 'Y2'] });
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: ids });
    assert.strictEqual((await request(app).post('/api/almoxarifado/devolucoes').send({ material_id: m.id, quantidade: 2,
      motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId, series: ['Y1', 'Y2'] })).status, 201);
    const entradaId = await ultima(m, 'ENTRADA_DEVOLUCAO');
    const { res } = await comLivroFalhando(() => estornar(entradaId), () => Promise.resolve(null));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.deepStrictEqual(await series(m), ['Y1:EM_ESTOQUE:-', 'Y2:EM_ESTOQUE:-']);
    assert.deepStrictEqual([await fisico(m), await presentes(m)], [2, 2]);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
