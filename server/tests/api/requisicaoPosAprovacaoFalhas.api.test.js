/**
 * Etapa 73, Fase 5 (fix-round da revisao) — o pos-aprovacao sob corrida e sob falha no meio.
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa73-requisicao-espera-compra.md (Fase 5).
 * Sonda da revisao: sonda73f-portas.js ([A] e [D]).
 *
 * Os defeitos:
 *  - IMPORTANTE: `prepararPosAprovacao` calculava o status ANTES de reservar e usava esse status quando
 *    nada era reservado. Duas criacoes simultaneas com aprovacao automatica disputando as ultimas
 *    unidades: as duas calculavam APROVADO (havia saldo), uma reservava tudo e a outra ficava APROVADO
 *    sem reserva e sem saldo (8 de 8 rodadas na sonda). O /aprovar tinha a mesma janela.
 *  - MENOR: uma falha no meio da reserva automatica (leitura do 2o item) respondia 500 para uma
 *    requisicao que ja existia e segurava saldo (reserva orfa com a requisicao PENDENTE); e o /aprovar
 *    manual depois reservava o mesmo item em dobro (reservarItensAprovacao nao descontava a reserva
 *    ATIVA que o item ja tinha).
 *
 * Executar: cd server && node tests/api/requisicaoPosAprovacaoFalhas.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const SOL = { id: 7351, nome: 'Solicitante E73F5', email: 'e73f5s@test.com' };
const APR = { id: 7352, nome: 'Aprovador E73F5', role: 'admin', is_superadmin: 1, email: 'e73f5a@test.com' };

(async () => {
  console.log('\n=== Etapa 73 Fase 5: pos-aprovacao sob corrida e sob falha no meio ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...APR } });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...APR }); } };
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const u of [SOL, APR]) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [u.id, u.nome, u.email]);
  }
  const setConfig = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

  let seq = 0;
  const material = async ({ saldo = 0 } = {}) => {
    seq += 1;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'UN', 0, 0, 1, 1)`, [`E73F5-M${seq}`, `Mat E73F5 ${seq}`])).lastID;
    if (saldo > 0) {
      const e = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: id, tipo: 'ENTRADA', quantidade: saldo, motivo: 'setup' });
      assert.strictEqual(e.status, 201, JSON.stringify(e.body));
    }
    return id;
  };
  const disponivel = async (m) => Number((await dbGet(db,
    'SELECT quantidade_atual - COALESCE(quantidade_reservada,0) AS d FROM materiais_almoxarifado WHERE id = ?', [m])).d);
  const statusDe = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const ativas = async (id) => dbAll(db,
    "SELECT id, item_requisicao_id, material_id, quantidade FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA' ORDER BY id", [id]);
  const postReq = (itens) => as(SOL, () => request(app).post('/api/almoxarifado/requisicoes')
    .send({ itens: itens.map(([material_id, quantidade]) => ({ material_id, quantidade })) }));
  /** Requisicao PENDENTE gravada direto (sem passar pela aprovacao automatica). */
  const pendente = async (itens) => {
    seq += 1;
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, ?, 'S', 'PENDENTE')`, [`REQ-E73F5-${seq}-${Date.now() % 100000}`, SOL.id])).lastID;
    for (const [m, q] of itens) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?, ?, ?)', [id, m, q]);
    }
    return id;
  };
  const itensDe = async (id) => dbAll(db, 'SELECT id, material_id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [id]);

  // ══════════════ IMPORTANTE — status recalculado quando a corrida levou o saldo ══════════════
  await setConfig('aprovacao_automatica', '1');
  await test('[corrida automatica] duas criacoes simultaneas, saldo 5, cada uma pede 5: o perdedor fica AGUARDANDO_ESTOQUE (6 rodadas)', async () => {
    for (let k = 0; k < 6; k++) {
      // eslint-disable-next-line no-await-in-loop
      const m = await material({ saldo: 5 });
      // eslint-disable-next-line no-await-in-loop
      const [a, b] = await Promise.all([postReq([[m, 5]]), postReq([[m, 5]])]);
      assert.strictEqual(a.status, 201, JSON.stringify(a.body));
      assert.strictEqual(b.status, 201, JSON.stringify(b.body));
      const linhas = [];
      for (const r of [a, b]) {
        // eslint-disable-next-line no-await-in-loop
        linhas.push({ resp: r.body.status, banco: await statusDe(r.body.id), reservas: (await ativas(r.body.id)).map((x) => x.quantidade) });
      }
      const ctx = `rodada ${k + 1}: ${JSON.stringify(linhas)}`;
      for (const l of linhas) assert.strictEqual(l.resp, l.banco, `resposta = banco: ${ctx}`);
      const vencedor = linhas.filter((l) => l.banco === 'TOTALMENTE_RESERVADA');
      const perdedor = linhas.filter((l) => l.banco !== 'TOTALMENTE_RESERVADA');
      assert.strictEqual(vencedor.length, 1, `um vencedor: ${ctx}`);
      assert.deepStrictEqual(vencedor[0].reservas, [5], ctx);
      assert.strictEqual(perdedor.length, 1, ctx);
      assert.deepStrictEqual(perdedor[0].reservas, [], ctx);
      assert.strictEqual(perdedor[0].banco, 'AGUARDANDO_ESTOQUE', `o perdedor ficou sem reserva e sem saldo: ${ctx}`);
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual(await disponivel(m), 0, ctx);
    }
  });
  await setConfig('aprovacao_automatica', '0');

  await test('[corrida /aprovar] dois /aprovar simultaneos de requisicoes diferentes pelo ultimo saldo: o perdedor fica AGUARDANDO_ESTOQUE (6 rodadas)', async () => {
    for (let k = 0; k < 6; k++) {
      // eslint-disable-next-line no-await-in-loop
      const m = await material({ saldo: 5 });
      // eslint-disable-next-line no-await-in-loop
      const ids = [await pendente([[m, 5]]), await pendente([[m, 5]])];
      // eslint-disable-next-line no-await-in-loop
      const rs = await Promise.all(ids.map((id) => request(app).put(`/api/almoxarifado/requisicoes/${id}/aprovar`).send({})));
      const linhas = [];
      for (let i = 0; i < 2; i++) {
        assert.strictEqual(rs[i].status, 200, JSON.stringify(rs[i].body));
        // eslint-disable-next-line no-await-in-loop
        linhas.push({ resp: rs[i].body.status, banco: await statusDe(ids[i]), reservas: (await ativas(ids[i])).map((x) => x.quantidade) });
      }
      const ctx = `rodada ${k + 1}: ${JSON.stringify(linhas)}`;
      for (const l of linhas) assert.strictEqual(l.resp, l.banco, `resposta = banco: ${ctx}`);
      assert.deepStrictEqual(linhas.map((l) => l.banco).sort(), ['AGUARDANDO_ESTOQUE', 'TOTALMENTE_RESERVADA'], ctx);
    }
  });

  await test('[servico] o saldo some entre o calculo e a reserva: prepararPosAprovacao relê e devolve AGUARDANDO_ESTOQUE, nao APROVADO', async () => {
    const m = await material({ saldo: 3 });
    const id = await pendente([[m, 3]]);
    const original = stockService.criarReserva;
    // Deterministico: na hora de reservar, um terceiro leva o saldo inteiro primeiro.
    stockService.criarReserva = async (dbx, user, dados, opts) => {
      stockService.criarReserva = original;
      await original(dbx, { ...APR }, { material_id: m, quantidade: 3, observacoes: 'terceiro' }, {});
      return original(dbx, user, dados, opts);
    };
    let pos;
    try {
      pos = await requisitionService.prepararPosAprovacao(db, id, { ...SOL },
        await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [id]));
    } finally { stockService.criarReserva = original; }
    assert.deepStrictEqual(pos, { status: 'AGUARDANDO_ESTOQUE', reservas: [] });
    assert.strictEqual(await disponivel(m), 0, 'premissa: o terceiro levou o saldo');
  });

  // ══════════════ MENOR — falha no meio da reserva automatica ══════════════
  await test('[falha no meio] SQLITE_BUSY na leitura do 2o item: 201 PENDENTE, nenhuma reserva ATIVA, saldo devolvido; /aprovar depois reserva uma vez', async () => {
    await setConfig('aprovacao_automatica', '1');
    const m1 = await material({ saldo: 10 });
    const m2 = await material({ saldo: 10 });
    const origCriar = stockService.criarReserva;
    const origGet = db.get;
    let armado = false;
    let disparou = false;
    stockService.criarReserva = async (...args) => { const r = await origCriar(...args); armado = true; return r; };
    db.get = function (sql, ...rest) {
      if (armado && typeof sql === 'string' && sql.includes('as reservado_para_item')) {
        armado = false; disparou = true;
        const cb = rest[rest.length - 1];
        return setImmediate(() => cb(new Error('SQLITE_BUSY: database is locked (simulado)')));
      }
      return origGet.call(this, sql, ...rest);
    };
    const avisos = [];
    const origWarn = console.warn;
    console.warn = (...a) => { avisos.push(a.join(' ')); origWarn(...a); };
    let r;
    try {
      r = await postReq([[m1, 4], [m2, 4]]);
    } finally {
      stockService.criarReserva = origCriar; db.get = origGet; console.warn = origWarn;
      await setConfig('aprovacao_automatica', '0');
    }
    assert.ok(disparou, 'premissa: a falha simulada disparou');
    assert.strictEqual(r.status, 201, `a requisicao existe: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.status, 'PENDENTE', JSON.stringify(r.body));
    assert.ok(!r.body.aprovacao, 'nao diz que aprovou');
    const id = r.body.id;
    assert.strictEqual(await statusDe(id), 'PENDENTE');
    assert.deepStrictEqual(await ativas(id), [], 'nenhuma reserva orfa segurando saldo');
    assert.strictEqual(await disponivel(m1), 10, 'o saldo do 1o item voltou');
    assert.ok(avisos.some((w) => w.includes('SQLITE_BUSY') && w.includes(String(id))), `registra o aviso: ${JSON.stringify(avisos)}`);

    const ap = await request(app).put(`/api/almoxarifado/requisicoes/${id}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    assert.strictEqual(ap.body.status, 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual((await ativas(id)).map((x) => [x.material_id, x.quantidade]), [[m1, 4], [m2, 4]]);
    assert.strictEqual(await disponivel(m1), 6);
    assert.strictEqual(await disponivel(m2), 6);
  });

  await test('[idempotente] item que ja tem reserva ATIVA da requisicao: o /aprovar reserva so o que falta', async () => {
    const m1 = await material({ saldo: 10 });
    const m2 = await material({ saldo: 10 });
    const id = await pendente([[m1, 4], [m2, 4]]);
    const [i1, i2] = await itensDe(id);
    // reserva orfa: o item 1 inteiro e metade do item 2, como sobra de uma aprovacao que falhou
    for (const [it, q] of [[i1, 4], [i2, 2]]) {
      // eslint-disable-next-line no-await-in-loop
      await stockService.criarReserva(db, { ...SOL }, { material_id: it.material_id, quantidade: q, observacoes: 'orfa' },
        { sistema: true, requisicao_id: id, item_requisicao_id: it.id, motivo: 'orfa' });
    }
    const ap = await request(app).put(`/api/almoxarifado/requisicoes/${id}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    assert.strictEqual(ap.body.status, 'TOTALMENTE_RESERVADA', JSON.stringify(ap.body));
    const porItem = {};
    for (const x of await ativas(id)) porItem[x.material_id] = (porItem[x.material_id] || 0) + Number(x.quantidade);
    assert.deepStrictEqual(porItem, { [m1]: 4, [m2]: 4 }, `sem reserva em dobro: ${JSON.stringify(porItem)}`);
    assert.strictEqual(await disponivel(m1), 6);
    assert.strictEqual(await disponivel(m2), 6);
    assert.deepStrictEqual(ap.body.reservas.map((x) => x.quantidade), [2], 'esta chamada reservou so os 2 que faltavam');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
