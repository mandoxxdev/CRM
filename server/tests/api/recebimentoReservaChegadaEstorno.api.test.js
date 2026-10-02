/**
 * Etapa 74 (T3) — o estorno da entrada desfaz a reserva que a própria nota criou (RN-11, D8/B374 + Fase 2),
 * e as duas portas terminais que prendiam reserva (`/encerrar`, `/rejeitar-valor`) passam a liberá-la.
 *
 * Pela ROTA do estorno (`POST /movimentacoes/:id/cancelar`), com a nota pelas seis portas e o pedido vinculado
 * a uma solicitação (o pedido reabre no estorno — Etapa 71 — e o status da requisição é recalculado DEPOIS).
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa74-reserva-na-chegada.md
 *
 * Executar: cd server && node tests/api/recebimentoReservaChegadaEstorno.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// A literal de recusa da 71 lida do CODIGO (nao reescrita aqui): se mudar la, este teste acompanha.
const STOCK_SRC = fs.readFileSync(path.join(__dirname, '../../services/almoxarifado/stockService.js'), 'utf8');
const RECUSA_71 = /'(Não é possível estornar: saldo disponível insuficiente \(material já consumido\))'/.exec(STOCK_SRC)[1];

const SOL = { id: 7451, nome: 'Solicitante E74T3', role: 'admin', is_superadmin: 1, email: 'e74t3s@test.com' };
const APR = { id: 7452, nome: 'Aprovador E74T3', role: 'admin', is_superadmin: 1, email: 'e74t3a@test.com' };
const API = '/api/almoxarifado';

(async () => {
  console.log('\n=== Etapa 74 (T3): o estorno desfaz o que a nota fez ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...APR } });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...APR }); } };
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn E74T3','74300000000174','ativo')")).lastID;
  const setConfig = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
  await setConfig('liberacao_valor_ativo', '0');
  await setConfig('aprovacao_automatica', '0');

  let seq = 0;
  const material = async ({ minimo = 0, custo = 10 } = {}) => {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, custo_unitario, ativo, fornecedor_id)
      VALUES (?, ?, 'PC', 0, ?, 0, ?, 1, ?)`, [`E74T3-M${seq}`, `Mat E74T3 ${seq}`, minimo, custo, forn])).lastID;
  };
  const entradaManual = async (m, q) => {
    const e = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'setup' });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
  };
  const mat = async (m) => dbGet(db, `SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r,
    quantidade_atual - COALESCE(quantidade_reservada,0) d FROM materiais_almoxarifado WHERE id = ?`, [m]);
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const stSol = async (id) => (await dbGet(db, 'SELECT status FROM solicitacoes_compra_almoxarifado WHERE id = ?', [id])).status;
  const reservas = (reqId) => dbAll(db, `SELECT id, quantidade, quantidade_utilizada, status, motivo_liberacao, recebimento_id
    FROM reservas_material_almoxarifado WHERE requisicao_id = ? ORDER BY id`, [reqId]);
  const holdAtivo = async (reqId) => (await reservas(reqId)).filter((r) => r.status === 'ATIVA')
    .reduce((s, r) => s + Number(r.quantidade) - Number(r.quantidade_utilizada || 0), 0);
  const itemDe = async (reqId) => (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [reqId])).id;

  const compraVinculada = async (m, quantidade) => {
    const v = await request(app).post(`${API}/compras/verificar-minimos`).send({});
    assert.strictEqual(v.status, 200, JSON.stringify(v.body));
    const c = v.body.criadas.find((x) => x.material_id === m);
    assert.ok(c, `premissa: solicitacao aberta para ${m}`);
    const p = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn, status: 'pendente', solicitacao_id: c.solicitacao_id,
      itens: [{ material_id: m, quantidade, valor_unitario: 1 }],
    });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    const linha = (await dbGet(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ?', [p.body.id])).id;
    return { solicitacao: c.solicitacao_id, pedido: { id: p.body.id, linha } };
  };
  const pedidoAvulso = async (m, quantidade) => {
    const p = await request(app).post('/api/compras/pedidos').send({ fornecedor_id: forn, status: 'pendente',
      itens: [{ material_id: m, quantidade, valor_unitario: 1 }] });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    return { id: p.body.id, linha: (await dbGet(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ?', [p.body.id])).id };
  };
  let nf = 0;
  const receber = async (pedido, m, quantidade) => {
    nf += 1;
    const itens = [{ material_id: m, pedido_item_id: pedido.linha, quantidade, quantidade_recebida: quantidade }];
    const c = await request(app).post(`${API}/recebimentos`).send({ tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, itens });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const id = c.body.id;
    assert.strictEqual((await request(app).put(`${API}/recebimentos/${id}/conferir`).send({ itens })).status, 200);
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual((await request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao })).status, 200, acao);
    }
    const f = await request(app).put(`${API}/recebimentos/${id}/fiscal`).send({
      nota_fiscal: `NF-E74T3-${nf}`, fornecedor_id: forn, fornecedor_nome: 'Forn E74T3',
      data_emissao_nf: '2026-09-01', data_entrada_nf: '2026-09-02', valor_total_nota: quantidade, itens,
    });
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    const p = await request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    const mov = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE recebimento_id = ? AND tipo = 'ENTRADA_COMPRA'", [id]);
    return { rec: id, mov: mov.id };
  };
  const criar = async (itens, extra = {}) => as(SOL, async () => {
    const r = await request(app).post(`${API}/requisicoes`)
      .send({ ...extra, itens: itens.map(([material_id, quantidade]) => ({ material_id, quantidade })) });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body.id;
  });
  const aprovar = async (id) => {
    const r = await request(app).put(`${API}/requisicoes/${id}/aprovar`).send({});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.status;
  };
  const estornar = (movId) => request(app).post(`${API}/movimentacoes/${movId}/cancelar`).send({ motivo: 'estorno e74' });

  // ══════════════ RN-11 ══════════════
  await test('[RN-11] nota de 4 (o pedido inteiro) reservada a R1: estorno 200, reserva LIBERADA com o motivo, R1 volta a AGUARDANDO_COMPRA (o pedido reabriu), saldo 0', async () => {
    const m = await material({ minimo: 1 });
    const c = await compraVinculada(m, 4);
    const R1 = await criar([[m, 6]]);
    assert.strictEqual(await aprovar(R1), 'AGUARDANDO_COMPRA');
    const { rec, mov } = await receber(c.pedido, m, 4);
    assert.strictEqual(await st(R1), 'PARCIALMENTE_RESERVADA', 'premissa: a chegada reservou os 4');
    assert.strictEqual(await stSol(c.solicitacao), 'RECEBIDA', 'premissa: a nota completou o pedido (nada mais vinha)');
    const e = await estornar(mov);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.deepStrictEqual(Object.keys(e.body).sort(), ['estorno_id', 'pedido_compra', 'success'], 'resposta inalterada (a da 71)');
    const numeroRec = (await dbGet(db, 'SELECT numero FROM recebimentos_material_almoxarifado WHERE id = ?', [rec])).numero;
    const rs = await reservas(R1);
    assert.deepStrictEqual(rs.map((r) => [r.status, r.motivo_liberacao, r.recebimento_id]),
      [['LIBERADA', `Estorno da entrada do recebimento ${numeroRec}`, rec]]);
    const movLib = await dbGet(db, "SELECT motivo FROM movimentacoes_almoxarifado WHERE tipo = 'LIBERACAO_RESERVA' AND reserva_id = ?", [rs[0].id]);
    assert.strictEqual(movLib.motivo, 'Liberação por estorno da entrada');
    assert.strictEqual(await stSol(c.solicitacao), 'VINCULADO', 'premissa: o pedido reabriu (Etapa 71/72)');
    assert.strictEqual(await st(R1), 'AGUARDANDO_COMPRA', 'recalculado DEPOIS de o pedido reabrir: a compra volta a vir');
    assert.deepStrictEqual({ ...(await mat(m)) }, { q: 0, r: 0, d: 0 });
    assert.strictEqual(await holdAtivo(R1), 0);
  });

  await test('[RN-11] so o necessario, da ULTIMA na ordem: nota de 4 (3 a R2 URGENTE, 1 a R1) + 3 livres de entrada manual -> libera 1, de R1; R2 intacta', async () => {
    const m = await material();
    const p = await pedidoAvulso(m, 10);
    const R1 = await criar([[m, 6]]);
    const R2 = await criar([[m, 3]], { urgencia: 'URGENTE', justificativa_urgencia: 'linha parada' });
    await aprovar(R1); await aprovar(R2);
    const { mov } = await receber(p, m, 4);
    assert.deepStrictEqual([await holdAtivo(R2), await holdAtivo(R1)], [3, 1], 'premissa: a chegada deu 3 a R2 e 1 a R1');
    await entradaManual(m, 3);
    const e = await estornar(mov);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.strictEqual(await holdAtivo(R2), 3, 'R2 (a primeira da fila) nao perdeu nada');
    assert.strictEqual(await holdAtivo(R1), 0, 'R1 (a ultima) perdeu o 1');
    assert.strictEqual(await st(R2), 'TOTALMENTE_RESERVADA');
    assert.ok(['AGUARDANDO_ESTOQUE', 'APROVADO'].includes(await st(R1)), `R1 sem hold: ${await st(R1)}`);
    assert.deepStrictEqual({ ...(await mat(m)) }, { q: 3, r: 3, d: 0 }, 'os 3 livres pagaram o resto do estorno');
  });

  await test('[RN-11] negativa: os 4 reservados a R3 pela APROVACAO (nao pela chegada) -> 400 com a literal da 71, nada liberado', async () => {
    const m = await material();
    const p = await pedidoAvulso(m, 4);
    const { mov } = await receber(p, m, 4); // ninguem esperava: entra livre
    const R3 = await criar([[m, 4]]);
    assert.strictEqual(await aprovar(R3), 'TOTALMENTE_RESERVADA');
    const e = await estornar(mov);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, RECUSA_71);
    assert.deepStrictEqual((await reservas(R3)).map((r) => r.status), ['ATIVA']);
    assert.strictEqual(await st(R3), 'TOTALMENTE_RESERVADA');
  });

  await test('[RN-11] negativa: R1 ja entregou 2 dos 4 (reserva parcialmente consumida) e nao ha outro saldo -> 400 com a literal da 71, reservas intactas', async () => {
    const m = await material();
    const p = await pedidoAvulso(m, 4);
    const R1 = await criar([[m, 4]]);
    await aprovar(R1);
    const { mov } = await receber(p, m, 4);
    const it = await itemDe(R1);
    assert.strictEqual((await request(app).put(`${API}/requisicoes/${R1}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: 2 }] })).status, 200);
    const ent = await request(app).put(`${API}/requisicoes/${R1}/entregar`).send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 2 }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
    const antes = await reservas(R1);
    const e = await estornar(mov);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, RECUSA_71);
    assert.deepStrictEqual(await reservas(R1), antes, 'nada liberado');
  });

  await test('[RN-11, Fase 2] quem ja SEPAROU nao perde a reserva no estorno: EM_SEPARACAO com 2 na caixa -> 400 com a literal da 71, reserva intacta', async () => {
    const m = await material();
    const p = await pedidoAvulso(m, 4);
    const R = await criar([[m, 4]]);
    await aprovar(R);
    const { mov } = await receber(p, m, 4);
    const it = await itemDe(R);
    assert.strictEqual((await request(app).put(`${API}/requisicoes/${R}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: 2 }] })).status, 200);
    assert.strictEqual(await st(R), 'EM_SEPARACAO');
    const e = await estornar(mov);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, RECUSA_71);
    assert.strictEqual(await holdAtivo(R), 4);
    assert.strictEqual(await st(R), 'EM_SEPARACAO');
  });

  await test('[RN-11, Fase 2] PARCIALMENTE_ATENDIDA com 2 ainda na caixa (separado > entregue): a reserva dela nao e liberada mesmo cabendo -> 400', async () => {
    const m = await material();
    const p = await pedidoAvulso(m, 4);
    const R = await criar([[m, 4]]);
    await aprovar(R);
    const { mov } = await receber(p, m, 4);
    const it = await itemDe(R);
    assert.strictEqual((await request(app).put(`${API}/requisicoes/${R}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: 4 }] })).status, 200);
    const ent = await request(app).put(`${API}/requisicoes/${R}/entregar`).send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 2 }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
    assert.strictEqual(await st(R), 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual(await holdAtivo(R), 2, 'premissa: 2 reservados e separados na caixa');
    await entradaManual(m, 2); // disponivel 2 + os 2 da reserva cobririam o estorno de 4
    const e = await estornar(mov);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, RECUSA_71);
    assert.strictEqual(await holdAtivo(R), 2, 'o que esta na caixa nao perde a reserva');
  });

  await test('[RN-11] positiva: com saldo livre cobrindo o estorno, nenhuma reserva da chegada e tocada', async () => {
    const m = await material();
    const p = await pedidoAvulso(m, 4);
    const R = await criar([[m, 2]]);
    await aprovar(R);
    const { mov } = await receber(p, m, 4); // R leva 2, sobram 2
    await entradaManual(m, 2);
    const e = await estornar(mov);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.strictEqual(await holdAtivo(R), 2);
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA');
  });

  // ══════════════ Fase 2: as portas terminais soltam a reserva ══════════════
  await test('[Fase 2] /encerrar (PARCIALMENTE_ATENDIDA -> ENCERRADA) libera o hold ATIVO da requisicao', async () => {
    const m = await material();
    await entradaManual(m, 10);
    const R = await criar([[m, 6]]);
    assert.strictEqual(await aprovar(R), 'TOTALMENTE_RESERVADA');
    const it = await itemDe(R);
    assert.strictEqual((await request(app).put(`${API}/requisicoes/${R}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: 2 }] })).status, 200);
    assert.strictEqual((await request(app).put(`${API}/requisicoes/${R}/entregar`).send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 2 }] })).status, 200);
    assert.strictEqual(await st(R), 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual(await holdAtivo(R), 4, 'premissa: sobrou hold de 4');
    const enc = await request(app).put(`${API}/requisicoes/${R}/encerrar`).send({ motivo: 'encerrar e74' });
    assert.strictEqual(enc.status, 200, JSON.stringify(enc.body));
    assert.deepStrictEqual(enc.body, { success: true, status: 'ENCERRADA' }, 'resposta inalterada');
    assert.strictEqual(await holdAtivo(R), 0, 'o hold nao fica preso numa requisicao ENCERRADA');
    assert.deepStrictEqual({ ...(await mat(m)) }, { q: 8, r: 0, d: 8 });
    const lib = (await reservas(R)).find((r) => r.status === 'LIBERADA');
    assert.strictEqual(lib.motivo_liberacao, 'Requisição encerrada');
  });

  await test('[Fase 2] /rejeitar-valor (-> REJEITADO) libera o hold ATIVO da requisicao', async () => {
    const m = await material();
    await entradaManual(m, 10);
    const R = await criar([[m, 8]]); // 80
    assert.strictEqual(await aprovar(R), 'TOTALMENTE_RESERVADA');
    await setConfig('liberacao_valor_ativo', '1'); await setConfig('liberacao_valor_limite', '50');
    await setConfig('liberacao_valor_aprovadores', JSON.stringify([APR.id]));
    try {
      const it = await itemDe(R);
      await request(app).put(`${API}/requisicoes/${R}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: 1 }] });
      assert.strictEqual(await st(R), 'AGUARDANDO_APROVACAO_VALOR', 'premissa: o separar mandou para a aprovacao de valor');
      const rj = await request(app).put(`${API}/requisicoes/${R}/rejeitar-valor`).send({ motivo: 'caro demais e74' });
      assert.strictEqual(rj.status, 200, JSON.stringify(rj.body));
      assert.strictEqual(await st(R), 'REJEITADO');
      assert.strictEqual(await holdAtivo(R), 0, 'o hold nao fica preso numa requisicao REJEITADA');
      assert.deepStrictEqual({ ...(await mat(m)) }, { q: 10, r: 0, d: 10 });
      assert.strictEqual((await reservas(R)).find((r) => r.status === 'LIBERADA').motivo_liberacao, 'Requisição rejeitada por valor');
    } finally { await setConfig('liberacao_valor_ativo', '0'); }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
