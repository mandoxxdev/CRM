/**
 * Etapa 171 (T5) — integracao cruzando as tasks: pedido com OS (T1) -> chegada que reserva para a OS e a aprovacao que
 * converte (T2) -> OS encerrada que solta e redistribui (T3), ate a ENTREGA e o estorno.
 *
 *   Roteiro 1 (pela ROTA): OS aberta -> POST /api/compras/pedidos com os_id -> GET detalhe com os_numero -> nota processada
 *             pela rota -> ENTRADA_COMPRA com os_id e reserva da OS -> a requisicao sem OS que esperava nao leva -> a
 *             requisicao da OS (os_referencia = numero_os) aprovada pela rota converte -> separa e ENTREGA pela rota.
 *   Roteiro 2 (pelo SERVICO): criarPedido direto ate a reserva da OS -> OS cancelada -> reserva LIBERADA com os_id e motivo,
 *             mov.os_id preservado, a requisicao sem OS que esperava recebe o redistribuido com o rotulo da OS encerrada,
 *             e o PUT de um pedido trocando para a OS cancelada -> 400 literal.
 *   Roteiro 3: pedido com OS recebido parcial em duas notas -> duas reservas da OS somam certo; estorno da segunda entrada
 *             -> 200, so a reserva dela solta.
 *
 * O cancelamento da OS e o `PUT /api/operacional/ordens-servico/:id` do index.js, que NAO esta no harness: aqui ele e feito
 * como a rota faz — `UPDATE ordens_servico SET status` e `osEncerradaService.liberarReservasDaOs` com o status novo. A fiacao
 * da rota (leitura do status anterior, `entrouNoFechado`, `reservas_liberadas`) e provada por spawn em
 * osEncerradaRotas.api.test.js. `ordens_servico` (tabela core) e criada aqui com as colunas que T1–T3 leem.
 * A requisicao NAO tem os_id (medido na T2): "requisicao da OS" e a os_referencia igual ao numero_os.
 *
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa171-pedido-de-compra-vinculado-a-os.md
 * Executar: cd server && node tests/api/pedidoOsPontaAPonta.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const pedidoCompraService = require('../../services/compras/pedidoCompraService');
const osEncerradaService = require('../../services/almoxarifado/osEncerradaService');

let passed = 0; let failed = 0;
let terminou = false;
process.on('exit', () => {
  if (!terminou) { console.error('  ✗ o teste saiu sem terminar (promessa pendurada?)'); process.exitCode = 1; }
});
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1751, nome: 'Admin E171T5', role: 'admin', is_superadmin: 1, email: 'e171t5a@test.com' };
const SOL = { id: 1752, nome: 'Solicitante E171T5', role: 'admin', is_superadmin: 1, email: 'e171t5s@test.com' };
const API = '/api/almoxarifado';
const EM_ESPERA = ['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'];

(async () => {
  console.log('\n=== Etapa 171 (T5): pedido com OS, ponta a ponta ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('liberacao_valor_ativo', '0');
  await cfg('aprovacao_automatica', '0');

  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, cliente_id INTEGER,
    tipo_os TEXT NOT NULL DEFAULT 'producao', status TEXT DEFAULT 'pendente', data_abertura DATE NOT NULL DEFAULT '2026-10-22')`);
  const cli = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente E171T5')")).lastID;
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn E171T5','17150000000171','ativo')")).lastID;

  let seq = 0;
  const novaOs = async (status = 'em_andamento') => {
    seq += 1;
    const numero = `E171T5-${seq}`;
    const id = (await dbRun(db, 'INSERT INTO ordens_servico (numero_os, cliente_id, status) VALUES (?, ?, ?)', [numero, cli, status])).lastID;
    return { id, numero };
  };
  // O PUT da OS do index.js, como ele faz: grava o status e, se entrou no conjunto fechado, solta pela T3.
  const encerrarOs = async (os, status) => {
    const antes = await dbGet(db, 'SELECT status FROM ordens_servico WHERE id = ?', [os.id]);
    await dbRun(db, 'UPDATE ordens_servico SET status = ? WHERE id = ?', [status, os.id]);
    assert.ok(osEncerradaService.entrouNoFechado(antes.status, status), 'premissa: transicao para o fechado');
    return osEncerradaService.liberarReservasDaOs(db, ADMIN, os.id, status);
  };
  const material = async () => {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, custo_unitario, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', 0, 0, 0, 10, 1, ?, 0)`, [`E171T5-M${seq}`, `Mat E171T5 ${seq}`, forn])).lastID;
  };
  const linhaDo = async (pedidoId) => (await dbGet(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ?', [pedidoId])).id;
  const pedidoPelaRota = async (m, q, osId) => {
    const p = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn, status: 'pendente', ...(osId ? { os_id: osId } : {}),
      itens: [{ material_id: m, quantidade: q, valor_unitario: 1 }],
    });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    return { id: p.body.id, linha: await linhaDo(p.body.id), body: p.body };
  };
  const pedidoPeloServico = async (m, q, osId) => {
    const p = await pedidoCompraService.criarPedido(db, {
      fornecedor_id: forn, status: 'pendente', ...(osId ? { os_id: osId } : {}),
      itens: [{ material_id: m, quantidade: q, valor_unitario: 1 }],
    }, { ...ADMIN });
    return { id: p.id, linha: await linhaDo(p.id), body: p };
  };
  // O PUT do pedido exige o corpo completo (Zod do PedidoCompraCreateSchema), como o formulario manda.
  const corpoPut = (m, q, extra) => ({ fornecedor_id: forn, status: 'pendente', itens: [{ material_id: m, quantidade: q, valor_unitario: 1 }], ...extra });
  const receber = async (ped, m, q) => {
    seq += 1;
    const itens = [{ material_id: m, pedido_item_id: ped.linha, quantidade: q, quantidade_recebida: q }];
    const c = await request(app).post(`${API}/recebimentos`).send({ tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: ped.id, itens });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const id = c.body.id;
    const conf = await request(app).put(`${API}/recebimentos/${id}/conferir`).send({ itens });
    assert.strictEqual(conf.status, 200, JSON.stringify(conf.body));
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      // eslint-disable-next-line no-await-in-loop
      const r = await request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao });
      assert.strictEqual(r.status, 200, acao + JSON.stringify(r.body));
    }
    const f = await request(app).put(`${API}/recebimentos/${id}/fiscal`).send({
      nota_fiscal: `NF-E171T5-${seq}`, fornecedor_id: forn, fornecedor_nome: 'Forn E171T5',
      data_emissao_nf: '2026-10-20', data_entrada_nf: '2026-10-21', valor_total_nota: q, itens,
    });
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    const p = await request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    return id;
  };
  const movEntrada = (rec) => dbGet(db, "SELECT * FROM movimentacoes_almoxarifado WHERE recebimento_id = ? AND tipo = 'ENTRADA_COMPRA'", [rec]);
  const numeroRec = async (rec) => (await dbGet(db, 'SELECT numero FROM recebimentos_material_almoxarifado WHERE id = ?', [rec])).numero;
  const reservasOs = (m) => dbAll(db, `SELECT * FROM reservas_material_almoxarifado
    WHERE material_id = ? AND origem = 'MANUAL' AND os_id IS NOT NULL ORDER BY id`, [m]);
  const ativasOs = async (m) => (await reservasOs(m)).filter((r) => r.status === 'ATIVA');
  const saldo = (r) => Number(r.quantidade) - Number(r.quantidade_utilizada || 0);
  const saldoOsAtivo = async (m) => (await ativasOs(m)).reduce((s, r) => s + saldo(r), 0);
  const ativasReq = (reqId) => dbAll(db, "SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'", [reqId]);
  const holdReq = async (reqId) => (await ativasReq(reqId)).reduce((s, r) => s + saldo(r), 0);
  const mat = async (m) => ({ ...(await dbGet(db, `SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r
    FROM materiais_almoxarifado WHERE id = ?`, [m])) });
  const itemDe = async (reqId) => dbGet(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [reqId]);
  const numeroReq = async (reqId) => (await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id = ?', [reqId])).numero;
  const criar = async (m, q, osReferencia) => as(SOL, async () => {
    const r = await request(app).post(`${API}/requisicoes`).send({ os_referencia: osReferencia, itens: [{ material_id: m, quantidade: q }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body.id;
  });
  const aprovar = async (id) => {
    const r = await request(app).put(`${API}/requisicoes/${id}/aprovar`).send({});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.status;
  };
  const esperando = async (m, q, osReferencia) => {
    const id = await criar(m, q, osReferencia);
    assert.ok(EM_ESPERA.includes(await aprovar(id)), 'premissa: sem saldo a aprovacao espera');
    return id;
  };

  // ══════════════ Roteiro 1 — pela rota, ate a entrega ══════════════
  await test('[Roteiro 1: T1+T2] pela rota: pedido com OS -> detalhe com os_numero -> nota -> ENTRADA_COMPRA com os_id e reserva da OS de 10; a requisicao sem OS que esperava nao leva', async () => {
    const os = await novaOs();
    const m = await material();
    const semOs = await esperando(m, 3, 'MANUTENCAO');
    const ped = await pedidoPelaRota(m, 10, os.id);
    assert.strictEqual(ped.body.os_id, os.id, 'T1: a resposta do POST traz a OS');
    const det = await request(app).get(`/api/compras/pedidos/${ped.id}`);
    assert.strictEqual(det.status, 200, JSON.stringify(det.body));
    assert.deepStrictEqual([det.body.os_id, det.body.os_numero], [os.id, os.numero], 'T1 (RN-171.05): o detalhe mostra a OS');
    const rec = await receber(ped, m, 10);
    assert.strictEqual((await movEntrada(rec)).os_id, os.id, 'T2 (RN-171.07): a entrada guarda a OS');
    const rs = await ativasOs(m);
    assert.deepStrictEqual(rs.map((r) => [saldo(r), r.os_id, r.recebimento_id]), [[10, os.id, rec]], 'T2 (RN-171.08): reserva da OS');
    assert.strictEqual(await holdReq(semOs), 0, 'a requisicao sem OS nao leva o comprado para a OS');
    assert.ok(EM_ESPERA.includes((await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [semOs])).status));
    assert.deepStrictEqual(await mat(m), { q: 10, r: 10 });

    // A requisicao da OS (os_referencia = numero_os) converte a reserva da OS na aprovacao e vai ate a entrega.
    const R = await criar(m, 6, os.numero);
    assert.strictEqual(await aprovar(R), 'TOTALMENTE_RESERVADA', 'T2 (RN-171.12 b): converte');
    assert.deepStrictEqual([await holdReq(R), await saldoOsAtivo(m), await holdReq(semOs)], [6, 4, 0]);
    const it = (await itemDe(R)).id;
    const sep = await request(app).put(`${API}/requisicoes/${R}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: 6 }] });
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
    const ent = await request(app).put(`${API}/requisicoes/${R}/entregar`).send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 6 }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
    assert.strictEqual(Number((await itemDe(R)).quantidade_entregue), 6, 'entregue');
    assert.deepStrictEqual(await mat(m), { q: 4, r: 4 }, 'saiu 6; os 4 que sobram continuam presos para a OS');
    assert.deepStrictEqual([await holdReq(R), await saldoOsAtivo(m), await holdReq(semOs)], [0, 4, 0]);
    const saida = await dbGet(db, `SELECT SUM(quantidade) q FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo LIKE 'SAIDA%'`, [m]);
    assert.strictEqual(Number(saida.q), 6, 'a saida da entrega foi de 6');
  });

  // ══════════════ Roteiro 2 — pelo servico, OS cancelada ══════════════
  await test('[Roteiro 2: T1+T2+T3] criarPedido direto -> reserva da OS -> OS cancelada: reserva LIBERADA com os_id e motivo, mov.os_id preservado, a requisicao sem OS recebe o redistribuido com o rotulo da OS encerrada; PUT trocando para a OS cancelada -> 400', async () => {
    const os = await novaOs();
    const m = await material();
    const semOs = await esperando(m, 6, 'MANUTENCAO');
    const ped = await pedidoPeloServico(m, 10, os.id);
    assert.strictEqual(ped.body.os_id, os.id, 'T1: o servico gravou a OS');
    const rec = await receber(ped, m, 10);
    const [r0] = await ativasOs(m);
    assert.ok(r0, 'T2: reserva da OS criada');
    assert.deepStrictEqual([saldo(r0), r0.os_id, r0.recebimento_id, await holdReq(semOs)], [10, os.id, rec, 0]);

    const liberadas = await encerrarOs(os, 'cancelado');
    assert.strictEqual(liberadas, 1, 'T3: uma reserva solta');
    const depois = await dbGet(db, 'SELECT status, os_id, motivo_liberacao FROM reservas_material_almoxarifado WHERE id = ?', [r0.id]);
    assert.deepStrictEqual({ ...depois },
      { status: 'LIBERADA', os_id: os.id, motivo_liberacao: `OS ${os.numero} cancelado — material volta ao estoque` });
    assert.strictEqual((await movEntrada(rec)).os_id, os.id, 'decisao 2: a entrada continua marcada com a OS');

    const daReq = await ativasReq(semOs);
    assert.strictEqual(daReq.length, 1, 'I7: a requisicao que esperava ganhou reserva');
    const onde = `Reserva na liberação da OS ${os.numero} encerrada — recebimento ${await numeroRec(rec)}`;
    assert.deepStrictEqual([saldo(daReq[0]), daReq[0].recebimento_id, daReq[0].observacoes],
      [6, rec, `${onde} — requisição ${await numeroReq(semOs)}`]);
    const movRes = await dbGet(db, "SELECT motivo FROM movimentacoes_almoxarifado WHERE reserva_id = ? AND tipo = 'RESERVA'", [daReq[0].id]);
    assert.strictEqual(movRes.motivo, onde);
    assert.strictEqual((await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [semOs])).status, 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual(await mat(m), { q: 10, r: 6 }, 'os 4 restantes ficam livres');
    assert.strictEqual(await saldoOsAtivo(m), 0);

    // Pedido de estoque ainda sem recebimento: trocar para a OS cancelada e recusado com o literal da RN-171.03.
    const outro = await pedidoPeloServico(m, 2, null);
    const put = await request(app).put(`/api/compras/pedidos/${outro.id}`).send(corpoPut(m, 2, { os_id: os.id }));
    assert.strictEqual(put.status, 400, JSON.stringify(put.body));
    assert.strictEqual(put.body.error, `A OS ${os.numero} está cancelado — não aceita compra nova`);
    assert.strictEqual((await dbGet(db, 'SELECT os_id FROM pedidos_compra WHERE id = ?', [outro.id])).os_id, null);
    // E o pedido ja recebido: a guarda de recebimento vem antes (RN-171.04), nao a da OS.
    const putRecebido = await request(app).put(`/api/compras/pedidos/${ped.id}`).send(corpoPut(m, 10, { os_id: null }));
    assert.strictEqual(putRecebido.status, 400, JSON.stringify(putRecebido.body));
    assert.strictEqual((await dbGet(db, 'SELECT os_id FROM pedidos_compra WHERE id = ?', [ped.id])).os_id, os.id);
  });

  // ══════════════ Roteiro 3 — duas notas parciais, estorno da segunda ══════════════
  await test('[Roteiro 3: T2] pedido de 10 com OS recebido em 4 + 6: duas reservas da OS somam 10; estorno da segunda entrada -> 200, so a reserva dela solta', async () => {
    const os = await novaOs();
    const m = await material();
    const ped = await pedidoPelaRota(m, 10, os.id);
    const rec1 = await receber(ped, m, 4);
    const rec2 = await receber(ped, m, 6);
    assert.deepStrictEqual([(await movEntrada(rec1)).os_id, (await movEntrada(rec2)).os_id], [os.id, os.id]);
    const rs = await ativasOs(m);
    assert.deepStrictEqual(rs.map((r) => [saldo(r), r.recebimento_id]), [[4, rec1], [6, rec2]]);
    assert.deepStrictEqual(await mat(m), { q: 10, r: 10 });
    const e = await request(app).post(`${API}/movimentacoes/${(await movEntrada(rec2)).id}/cancelar`).send({ motivo: 'estorno e171t5' });
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    const todas = await reservasOs(m);
    assert.deepStrictEqual(todas.map((r) => [r.recebimento_id, r.status]), [[rec1, 'ATIVA'], [rec2, 'LIBERADA']]);
    assert.strictEqual(todas[1].motivo_liberacao, `Estorno da entrada do recebimento ${await numeroRec(rec2)}`);
    assert.deepStrictEqual(await mat(m), { q: 4, r: 4 });
    assert.strictEqual(await saldoOsAtivo(m), 4);
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
