/**
 * Etapa 116 (C232) — estornar uma Saida que baixou series de um material com a serie DESLIGADA e recusado (RN-07..RN-09
 * do plano da Etapa 116).
 *
 * Antes: o estorno so mexia em serie com o controle ligado; com a serie desligada depois da Saida, o fisico voltava e as
 * series continuavam "Entregue" — religar a serie deixava fisico e series sem bater, e cadastrar de novo o numero de uma
 * serie Entregue e recusado. Agora: 400 E2, nada tocado; religar e estornar de novo devolve as series.
 *
 * Executar: cd server && node tests/api/estornoSemSerie.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM_PERFIL = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };

// E2 (400) — o contrato congelado do plano da Etapa 116.
const E2 = (codigo, n) => `Não é possível estornar: esta saída baixou ${n} série(s) do material ${codigo} e o controle por `
  + 'número de série foi desligado depois — o estorno devolveria o saldo sem devolver as séries. Religue o controle por '
  + 'número de série no cadastro do material e estorne de novo.';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  const dbAll = (sql, p) => new Promise((res, rej) => db.all(sql, p, (err, rows) => (err ? rej(err) : res(rows))));
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `S116-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, `Peca ${seq}`])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const mov = async (m, body) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'e116',
      justificativa: 'preparo e116', documento_vinculado: 'NF-116', ...body });
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    const ult = await dbGet(db, 'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1',
      [m.id, body.tipo]);
    return ult.id;
  };
  const put = (u, id, body) => as(u, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send(body));
  const estornar = (u, movId) => as(u, () => request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`)
    .send({ motivo: 'estorno e116' }));
  const estado = async (m, movId) => ({
    fisico: (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q,
    cancelado: (await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [movId])).cancelado,
    estornos: (await dbGet(db, "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ESTORNO'", [m.id])).n,
    series: (await dbAll('SELECT status FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((s) => s.status),
  });
  // Entrada de 2 series, Saida das 2 com serie, desliga a serie (0 presentes: livre para todos, 115 RN-05)
  const saidaComSeriesDepoisDesligada = async (numeros = ['N1', 'N2']) => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: numeros.length, series: numeros });
    const ids = (await dbAll('SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: numeros.length, serie_ids: ids });
    const d = await put(SUPER, m.id, { controle_serie: false });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    return { m, saidaId };
  };

  // ── RN-07 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-07] Saida de 2 series, a serie desligada depois: estorno 400 E2 "baixou 2", nada tocado', async () => {
    for (const u of [SUPER, ADM_PERFIL]) {
      const { m, saidaId } = await saidaComSeriesDepoisDesligada();
      // "nada tocado" quer dizer ANTES do claim: nem o claim nem o credito chegam a rodar (a recusa sob a trava, RN-08,
      // terminaria no mesmo estado, mas depois de creditar e compensar — esta asserção distingue as duas).
      const escritas = [];
      const runOriginal = db.run;
      db.run = function (sql, ...rest) {
        const t = String(sql).replace(/\s+/g, ' ');
        if (/^ ?UPDATE movimentacoes_almoxarifado SET cancelado = 1/.test(t) || /UPDATE materiais_almoxarifado SET quantidade_atual/.test(t)) escritas.push(t.slice(0, 60));
        return runOriginal.call(this, sql, ...rest);
      };
      let r;
      try { r = await estornar(u, saidaId); } finally { db.run = runOriginal; }
      assert.deepStrictEqual(escritas, [], 'o estorno recusado chegou ao claim ou ao credito');
      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, E2(m.codigo, 2));
      assert.deepStrictEqual(await estado(m, saidaId), { fisico: 0, cancelado: 0, estornos: 0, series: ['ENTREGUE', 'ENTREGUE'] });
    }
  });

  await test('[RN-07] serie Sucateada da saida tambem conta (1 Entregue + 1 Sucateada -> "baixou 2")', async () => {
    const { m, saidaId } = await saidaComSeriesDepoisDesligada(['P1', 'P2']);
    await dbRun(db, "UPDATE series_almoxarifado SET status = 'SUCATEADA' WHERE material_id = ? AND numero = 'P2'", [m.id]);
    const r = await estornar(SUPER, saidaId);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E2(m.codigo, 2));
  });

  await test('[RN-07] material que nunca teve serie: estorno da Saida 200 (como antes)', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 3 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 1 });
    const r = await estornar(SUPER, saidaId);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await estado(m, saidaId)).fisico, 3);
  });

  await test('[RN-07] serie desligada, Saida SEM serie vinculada (depois do desligar): estorno 200', async () => {
    const { m } = await saidaComSeriesDepoisDesligada(['Q1', 'Q2']);
    await mov(m, { tipo: 'ENTRADA', quantidade: 2 });
    const saida2 = await mov(m, { tipo: 'SAIDA', quantidade: 1 });
    const r = await estornar(SUPER, saida2);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const e = await estado(m, saida2);
    assert.deepStrictEqual([e.fisico, e.cancelado, e.series], [2, 1, ['ENTREGUE', 'ENTREGUE']]);
  });

  await test('[RN-07] [nao-regressao] com a serie ligada o estorno devolve as series (200)', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['L1', 'L2'] });
    const ids = (await dbAll('SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: ids });
    const r = await estornar(SUPER, saidaId);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await estado(m, saidaId), { fisico: 2, cancelado: 1, estornos: 1, series: ['EM_ESTOQUE', 'EM_ESTOQUE'] });
  });

  await test('[RN-07] a compensacao interna nao passa pela recusa (o estorno segue, como antes)', async () => {
    const { m, saidaId } = await saidaComSeriesDepoisDesligada(['K1', 'K2']);
    await stockService.cancelarMovimentacao(db, SUPER, saidaId, 'compensacao e116', { compensacao: true });
    const e = await estado(m, saidaId);
    assert.deepStrictEqual([e.fisico, e.cancelado], [2, 1]);
    // (Fase 5, revisor 3, K12) e, com a serie desligada, nao devolve as series (o ramo so as reverte com ela ligada)
    assert.deepStrictEqual(e.series, ['ENTREGUE', 'ENTREGUE']);
  });

  // ── RN-09 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-09] religar destrava: o Administrador religa, estorna (200) e as 2 series voltam a Em estoque', async () => {
    const { m, saidaId } = await saidaComSeriesDepoisDesligada(['R1', 'R2']);
    const recusa = await estornar(ADM_PERFIL, saidaId);
    assert.strictEqual(recusa.status, 400, JSON.stringify(recusa.body));
    const religa = await put(ADM_PERFIL, m.id, { controle_serie: true });
    assert.strictEqual(religa.status, 200, JSON.stringify(religa.body));
    const r = await estornar(ADM_PERFIL, saidaId);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await estado(m, saidaId), { fisico: 2, cancelado: 1, estornos: 1, series: ['EM_ESTOQUE', 'EM_ESTOQUE'] });
  });

  // ── RN-08 (Fase 2, R4): o desligar no meio do estorno — recusa ANTES do credito ───────────────────────────────────────
  const SQL_LEITURA = /^SELECT \* FROM materiais_almoxarifado WHERE id = \?$/;
  await test('[RN-08] o desligar cai entre a guarda previa e o ramo de saida: E2, e o credito nunca roda (so o claim, desfeito)', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['W1', 'W2'] });
    const ids = (await dbAll('SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: ids });
    // a leitura do material pelo estorno (fora da trava) devolve a linha velha (serie ligada); o desligar grava logo depois
    const getOriginal = db.get;
    let armado = true;
    db.get = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (armado && SQL_LEITURA.test(String(sql).replace(/\s+/g, ' ').trim()) && Number(params[0]) === m.id) {
        armado = false;
        return getOriginal.call(db, sql, params, (err, row) => {
          dbRun(db, 'UPDATE materiais_almoxarifado SET controle_serie = 0 WHERE id = ?', [m.id]).then(() => cb(err, row), cb);
        });
      }
      return getOriginal.call(db, sql, params, cb);
    };
    const escritas = [];
    const runOriginal = db.run;
    db.run = function (sql, ...rest) {
      const t = String(sql).replace(/\s+/g, ' ');
      if (/UPDATE materiais_almoxarifado SET quantidade_atual/.test(t)) escritas.push('credito');
      if (/^ ?UPDATE movimentacoes_almoxarifado SET cancelado = 1/.test(t)) escritas.push('claim');
      return runOriginal.call(this, sql, ...rest);
    };
    let r;
    try { r = await estornar(SUPER, saidaId); } finally { db.get = getOriginal; db.run = runOriginal; }
    assert.strictEqual(armado, false, 'gancho nao disparou');
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E2(m.codigo, 2));
    assert.deepStrictEqual(escritas, ['claim'], 'o credito rodou antes da recusa (a janela da R4)');
    assert.deepStrictEqual(await estado(m, saidaId), { fisico: 0, cancelado: 0, estornos: 0, series: ['ENTREGUE', 'ENTREGUE'] });
  });

  // ── RN-07 (Fase 2, R3): parte das series ja reentrou — a literal da 6b, nao a E2 ────────────────────────────────────────
  await test('[R3] Saida de 2 series, 1 reentra pela Entrada, a serie desligada: a recusa da 6b (religar nao adiantaria)', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['X1', 'X2'] });
    const ids = (await dbAll('SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: ids });
    await mov(m, { tipo: 'ENTRADA', quantidade: 1, series: ['X1'] });
    const d = await put(SUPER, m.id, { controle_serie: false });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    const r = await estornar(SUPER, saidaId);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'estorno de saida recusado: series desta saida ja reentraram no estoque — a devolucao ja repos o material');
    assert.strictEqual((await estado(m, saidaId)).fisico, 1);
  });

  // ── RN-10 (Fase 2, R2): a Saida que ja teve devolucao nao e estornavel ──────────────────────────────────────────────────
  const devolver = async (m, saidaId, quantidade) => {
    const r = await request(app).post('/api/almoxarifado/devolucoes').send({ material_id: m.id, quantidade, motivo: 'NAO_UTILIZADO',
      destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  await test('[RN-10] material sem serie: Entrada 5, Saida 2, devolucao 2 -> estorno 400 "devolvida inteira", fisico 5 (era 7)', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    await devolver(m, saidaId, 2);
    const r = await estornar(SUPER, saidaId);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Não é possível estornar: esta saída já foi devolvida inteira (2 PC) — o estorno devolveria de novo o que já voltou.');
    const e = await estado(m, saidaId);
    assert.deepStrictEqual([e.fisico, e.cancelado, e.estornos], [5, 0, 0]);
  });

  await test('[RN-10] devolucao parcial (1 de 3): estorno 400 com o resto a devolver', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 3 });
    await devolver(m, saidaId, 1);
    const r = await estornar(SUPER, saidaId);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Não é possível estornar: 1 PC desta saída já voltou pela devolução — o estorno devolveria '
      + 'de novo o que já voltou. Para desfazer o resto, registre a devolução dos 2 PC que faltam.');
    assert.strictEqual((await estado(m, saidaId)).fisico, 3);
    // o caminho que a mensagem ensina: devolver o resto
    await devolver(m, saidaId, 2);
    assert.strictEqual((await estado(m, saidaId)).fisico, 5);
  });

  await test('[RN-10] serie desligada + devolucao das 2: a recusa da devolucao, nao a E2 (religar levaria a contar em dobro)', async () => {
    const { m, saidaId } = await saidaComSeriesDepoisDesligada(['Y1', 'Y2']);
    await devolver(m, saidaId, 2);
    const r = await estornar(SUPER, saidaId);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(/^Não é possível estornar: esta saída já foi devolvida inteira \(2 PC\)/.test(r.body.error), r.body.error);
    // e religar nao destrava: a mesma recusa (o cenario da R2 terminava em fisico 4 com 2 series Em estoque)
    const religa = await put(SUPER, m.id, { controle_serie: true });
    assert.strictEqual(religa.status, 200, JSON.stringify(religa.body));
    const r2 = await estornar(SUPER, saidaId);
    assert.strictEqual(r2.status, 400, JSON.stringify(r2.body));
    assert.strictEqual((await estado(m, saidaId)).fisico, 2);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
