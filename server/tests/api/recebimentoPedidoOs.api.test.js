/**
 * Etapa 171 (T2) — o recebimento de pedido de compra com OS: a marca na entrada (RN-171.07), a reserva da OS nas tres
 * portas que distribuem (RN-171.08, I1–I4), a fila da OS primeiro e a conversao na aprovacao (RN-171.12) e o estorno
 * (RN-171.11, I5).
 *
 * Pelas ROTAS (pedido por `/api/compras/pedidos` com `os_id`, a nota pelas seis portas, inspecao e NC pela rota, a
 * requisicao criada/aprovada/separada/entregue pela rota, estorno por `/movimentacoes/:id/cancelar`) e pelo SERVICO (a
 * retomada da nota, I3).
 *
 * A requisicao NAO tem `os_id` (medido): "requisicao da OS" e a `os_referencia` igual ao `numero_os` (reservaDaOs.chaveDaOs).
 * O harness nao tem `ordens_servico` (tabela core): este teste a cria com as colunas que T1/T2 leem.
 *
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa171-pedido-de-compra-vinculado-a-os.md
 * Executar: cd server && node tests/api/recebimentoPedidoOs.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const reservaChegadaService = require('../../services/almoxarifado/reservaChegadaService');
const reservaDaOs = require('../../services/almoxarifado/reservaDaOs');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1721, nome: 'Admin E171T2', role: 'admin', is_superadmin: 1, email: 'e171t2a@test.com' };
const SOL = { id: 1722, nome: 'Solicitante E171T2', role: 'admin', is_superadmin: 1, email: 'e171t2s@test.com' };
const QUALIDADE = { id: 1723, nome: 'Inspetora E171T2', perfil_almoxarifado: 'QUALIDADE', email: 'e171t2q@test.com' };
const API = '/api/almoxarifado';
const EM_ESPERA = ['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'];

(async () => {
  console.log('\n=== Etapa 171 (T2): recebimento de pedido com OS ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('liberacao_valor_ativo', '0');
  await cfg('aprovacao_automatica', '0');
  // I2: com validade configurada, a reserva MANUAL comum ganha expira_em — a da OS nao.
  await cfg('reserva_dias_validade', '7');

  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, cliente_id INTEGER,
    tipo_os TEXT NOT NULL DEFAULT 'producao', status TEXT DEFAULT 'pendente', data_abertura DATE NOT NULL DEFAULT '2026-10-22')`);
  const cli = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente E171T2')")).lastID;
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn E171T2','17120000000171','ativo')")).lastID;

  let seq = 0;
  const novaOs = async (status = 'em_andamento') => {
    seq += 1;
    const numero = `E171T2-${seq}`;
    const id = (await dbRun(db, 'INSERT INTO ordens_servico (numero_os, cliente_id, status) VALUES (?, ?, ?)', [numero, cli, status])).lastID;
    return { id, numero };
  };
  const material = async ({ critico = 0 } = {}) => {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, custo_unitario, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', 0, 0, 0, 10, 1, ?, ?)`, [`E171T2-M${seq}`, `Mat E171T2 ${seq}`, forn, critico])).lastID;
  };
  const entradaManual = async (m, q) => {
    const e = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'setup e171' });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
  };
  const pedido = async (m, q, osId) => {
    const p = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn, status: 'pendente', ...(osId ? { os_id: osId } : {}),
      itens: [{ material_id: m, quantidade: q, valor_unitario: 1 }],
    });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    assert.strictEqual(p.body.os_id || null, osId || null, 'premissa: o pedido gravou a OS (T1)');
    return { id: p.body.id, linha: (await dbGet(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ?', [p.body.id])).id };
  };
  // A nota pelas seis portas, parada antes de processar (a corrida dispara o processar sozinha).
  const notaPronta = async (ped, m, q) => {
    seq += 1;
    const itens = [{ material_id: m, pedido_item_id: ped.linha, quantidade: q, quantidade_recebida: q }];
    const c = await request(app).post(`${API}/recebimentos`).send({ tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: ped.id, itens });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const id = c.body.id;
    assert.strictEqual((await request(app).put(`${API}/recebimentos/${id}/conferir`).send({ itens })).status, 200);
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      // eslint-disable-next-line no-await-in-loop
      const r = await request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao });
      assert.strictEqual(r.status, 200, acao + JSON.stringify(r.body));
    }
    const f = await request(app).put(`${API}/recebimentos/${id}/fiscal`).send({
      nota_fiscal: `NF-E171T2-${seq}`, fornecedor_id: forn, fornecedor_nome: 'Forn E171T2',
      data_emissao_nf: '2026-10-20', data_entrada_nf: '2026-10-21', valor_total_nota: q, itens,
    });
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    return id;
  };
  const processar = (rec) => request(app).post(`${API}/recebimentos/${rec}/workflow`).send({ acao: 'processar' });
  const receber = async (ped, m, q) => {
    const rec = await notaPronta(ped, m, q);
    const p = await processar(rec);
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    return rec;
  };
  const movEntrada = (rec) => dbGet(db, "SELECT * FROM movimentacoes_almoxarifado WHERE recebimento_id = ? AND tipo = 'ENTRADA_COMPRA'", [rec]);
  const reservasOs = (m) => dbAll(db, `SELECT * FROM reservas_material_almoxarifado
    WHERE material_id = ? AND origem = 'MANUAL' AND os_id IS NOT NULL ORDER BY id`, [m]);
  const ativasOs = async (m) => (await reservasOs(m)).filter((r) => r.status === 'ATIVA');
  const saldoOsAtivo = async (m) => (await ativasOs(m)).reduce((s, r) => s + Number(r.quantidade) - Number(r.quantidade_utilizada || 0), 0);
  const holdReq = async (reqId) => (await dbAll(db, `SELECT quantidade, quantidade_utilizada FROM reservas_material_almoxarifado
    WHERE requisicao_id = ? AND status = 'ATIVA'`, [reqId])).reduce((s, r) => s + Number(r.quantidade) - Number(r.quantidade_utilizada || 0), 0);
  const mat = async (m) => ({ ...(await dbGet(db, `SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r
    FROM materiais_almoxarifado WHERE id = ?`, [m])) });
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const itemDe = async (reqId) => (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [reqId])).id;
  const criar = async (m, q, osReferencia, extra = {}) => as(SOL, async () => {
    const r = await request(app).post(`${API}/requisicoes`)
      .send({ os_referencia: osReferencia, ...extra, itens: [{ material_id: m, quantidade: q }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body.id;
  });
  const aprovar = async (id) => {
    const r = await request(app).put(`${API}/requisicoes/${id}/aprovar`).send({});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.status;
  };
  const esperando = async (m, q, osReferencia, extra) => {
    const id = await criar(m, q, osReferencia, extra);
    assert.ok(EM_ESPERA.includes(await aprovar(id)), 'premissa: sem saldo a aprovacao espera');
    return id;
  };
  const numeroRec = async (rec) => (await dbGet(db, 'SELECT numero FROM recebimentos_material_almoxarifado WHERE id = ?', [rec])).numero;

  // ══════════════ RN-171.07 / RN-171.08 / I2 ══════════════
  await test('[RN-171.07, RN-171.08, I2] nota de PC com OS: ENTRADA_COMPRA com os_id; reserva ATIVA MANUAL da OS de 10 com recebimento_id, motivo "Compra para a OS", SEM expira_em (validade 7 dias ligada); disponivel 0', async () => {
    const os = await novaOs();
    const m = await material();
    const rec = await receber(await pedido(m, 10, os.id), m, 10);
    assert.strictEqual((await movEntrada(rec)).os_id, os.id, 'RN-171.07: a entrada guarda a OS');
    const rs = await reservasOs(m);
    assert.strictEqual(rs.length, 1, JSON.stringify(rs));
    const [r] = rs;
    assert.deepStrictEqual([r.status, r.origem, r.os_id, r.recebimento_id, Number(r.quantidade), r.requisicao_id, r.os_referencia],
      ['ATIVA', 'MANUAL', os.id, rec, 10, null, os.numero]);
    assert.strictEqual(r.observacoes, `Compra para a OS ${os.numero}`);
    assert.strictEqual(r.expira_em, null, 'I2: a reserva da OS nao vence');
    const movRes = await dbGet(db, "SELECT motivo, os_id FROM movimentacoes_almoxarifado WHERE tipo = 'RESERVA' AND reserva_id = ?", [r.id]);
    assert.deepStrictEqual({ ...movRes }, { motivo: `Compra para a OS ${os.numero}`, os_id: os.id });
    assert.deepStrictEqual(await mat(m), { q: 10, r: 10 });
    // Controle do I2: a mesma config da validade a uma reserva manual comum.
    await entradaManual(m, 1);
    const manual = await request(app).post(`${API}/reservas`).send({ material_id: m, quantidade: 1, os_referencia: 'X' });
    assert.ok([200, 201].includes(manual.status), JSON.stringify(manual.body));
    const comum = await dbGet(db, "SELECT expira_em FROM reservas_material_almoxarifado WHERE material_id = ? AND os_id IS NULL AND origem = 'MANUAL'", [m]);
    assert.ok(comum && comum.expira_em, 'controle: a reserva manual comum ganha expira_em com a validade ligada');
  });

  await test('[RN-171.08] pedido SEM OS: comportamento de hoje (sem os_id na entrada, sem reserva da OS, quem esperava leva)', async () => {
    const m = await material();
    const R = await esperando(m, 4, 'OS-GERAL');
    const rec = await receber(await pedido(m, 10, null), m, 10);
    assert.strictEqual((await movEntrada(rec)).os_id, null);
    assert.deepStrictEqual(await reservasOs(m), []);
    assert.strictEqual(await holdReq(R), 4);
  });

  // ══════════════ RN-171.12 (a) ══════════════
  await test('[RN-171.12 a] a requisicao DA OS que esperava e servida primeiro (4); o resto (6) vira reserva da OS; a fila geral (mais antiga e URGENTE) nao leva nada', async () => {
    const os = await novaOs();
    const m = await material();
    const geral = await esperando(m, 5, 'OS-QUALQUER', { urgencia: 'URGENTE', justificativa_urgencia: 'linha parada' });
    const daOs = await esperando(m, 4, ` os ${os.numero.toLowerCase()} `); // caixa, espacos e prefixo "OS" ignorados
    await receber(await pedido(m, 10, os.id), m, 10);
    assert.strictEqual(await holdReq(daOs), 4, 'a requisicao da OS levou o que pedia');
    assert.strictEqual(await st(daOs), 'TOTALMENTE_RESERVADA');
    assert.strictEqual(await holdReq(geral), 0, 'a fila geral nao leva nada desta nota');
    assert.ok(EM_ESPERA.includes(await st(geral)), await st(geral));
    assert.strictEqual(await saldoOsAtivo(m), 6);
    assert.deepStrictEqual(await mat(m), { q: 10, r: 10 });
  });

  // ══════════════ I3 ══════════════
  await test('[I3] retomar a distribuicao da nota (servico, duas vezes) nao reserva de novo nem serve a fila de novo', async () => {
    const os = await novaOs();
    const m = await material();
    const daOs = await esperando(m, 3, os.numero);
    const rec = await receber(await pedido(m, 10, os.id), m, 10);
    assert.deepStrictEqual([await holdReq(daOs), await saldoOsAtivo(m)], [3, 7], 'premissa');
    await entradaManual(m, 5); // saldo de outra origem: a retomada nao pode reserva-lo para a OS
    await reservaChegadaService.reservarChegadaParaQuemEspera(db, ADMIN, rec);
    await reservaChegadaService.reservarChegadaParaQuemEspera(db, ADMIN, rec);
    assert.deepStrictEqual([await holdReq(daOs), await saldoOsAtivo(m), (await reservasOs(m)).length], [3, 7, 1]);
    assert.deepStrictEqual(await mat(m), { q: 15, r: 10 });
  });

  // ══════════════ I1 ══════════════
  await test('[I1] a caixa sem reserva de outra requisicao limita a reserva da OS (livre de caixa): nota de 10 com 3 na caixa -> OS 7', async () => {
    const os = await novaOs();
    const m = await material();
    const outra = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, urgencia, ativo, os_referencia)
      VALUES (?, ?, 'Sol', 'EM_SEPARACAO', 'NORMAL', 1, 'OS-ALHEIA')`, [`REQ-E171T2-${++seq}`, SOL.id])).lastID;
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada, quantidade_separada,
      quantidade_entregue, quantidade_atendida) VALUES (?, ?, 3, 3, 0, 0)`, [outra, m]);
    await receber(await pedido(m, 10, os.id), m, 10);
    assert.strictEqual(await saldoOsAtivo(m), 7, 'a caixa (3) nao vira reserva da OS');
    assert.deepStrictEqual(await mat(m), { q: 10, r: 7 });
  });

  // ══════════════ RN-171.08 — OS fechada no meio ══════════════
  await test('[RN-171.08] OS cancelada entre o pedido e a chegada: a entrada guarda os_id, mas nada e reservado para a OS (a fila geral leva, como hoje)', async () => {
    const os = await novaOs();
    const m = await material();
    const ped = await pedido(m, 10, os.id);
    const R = await esperando(m, 4, 'OS-GERAL');
    await dbRun(db, "UPDATE ordens_servico SET status = ' Cancelado ' WHERE id = ?", [os.id]);
    const rec = await receber(ped, m, 10);
    assert.strictEqual((await movEntrada(rec)).os_id, os.id, 'a marca de origem fica (decisao 2)');
    assert.deepStrictEqual(await reservasOs(m), []);
    assert.strictEqual(await holdReq(R), 4);
  });

  // ══════════════ I4 — inspecao e NC ══════════════
  await cfg('inspecao_material_critico', '1');
  try {
    const inspecionar = async (rec, m, a, r) => {
      const it = await dbGet(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? AND material_id = ?', [rec, m]);
      const res = await as(QUALIDADE, () => request(app).post(`${API}/recebimentos/itens/${it.id}/inspecionar`)
        .send({ quantidade_aprovada: a, quantidade_reprovada: r, encaminhamento: r > 0 ? 'DEVOLVER' : undefined }));
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      return res.body.id;
    };
    await test('[RN-171.08, I4] inspecao que aprova: a requisicao da OS (1) primeiro, o resto (3) vira reserva da OS com a marca da nota; a geral nao leva', async () => {
      const os = await novaOs();
      const m = await material({ critico: 1 });
      const geral = await esperando(m, 4, 'OS-GERAL');
      const daOs = await esperando(m, 1, os.numero);
      const rec = await receber(await pedido(m, 4, os.id), m, 4);
      assert.deepStrictEqual(await reservasOs(m), [], 'premissa: retido nao se reserva na chegada');
      await inspecionar(rec, m, 4, 0);
      assert.strictEqual(await holdReq(daOs), 1);
      assert.strictEqual(await holdReq(geral), 0);
      const rs = await ativasOs(m);
      assert.deepStrictEqual(rs.map((r) => [Number(r.quantidade), r.recebimento_id, r.os_id, r.expira_em]), [[3, rec, os.id, null]]);
    });

    await test('[RN-171.08, I4] NC que ACEITA: inspecao 3/1 -> OS 3; aceitar a NC -> mais 1 para a OS (a NC e a terceira porta)', async () => {
      const os = await novaOs();
      const m = await material({ critico: 1 });
      const rec = await receber(await pedido(m, 4, os.id), m, 4);
      const insp = await inspecionar(rec, m, 3, 1);
      assert.strictEqual(await saldoOsAtivo(m), 3, 'premissa: a inspecao reservou os 3 aprovados para a OS');
      const nc = await dbGet(db, "SELECT id FROM nao_conformidades_almoxarifado WHERE referencia_tipo = 'INSPECAO' AND referencia_id = ?", [insp]);
      const d = await as(QUALIDADE, () => request(app).post(`${API}/nao-conformidades/${nc.id}/decidir`)
        .send({ decisao: 'ACEITAR', justificativa: 'teste e171' }));
      assert.strictEqual(d.status, 200, JSON.stringify(d.body));
      assert.strictEqual(await saldoOsAtivo(m), 4);
      assert.deepStrictEqual((await ativasOs(m)).map((r) => [Number(r.quantidade), r.recebimento_id]), [[3, rec], [1, rec]]);
    });
  } finally { await cfg('inspecao_material_critico', '0'); }

  // ══════════════ RN-171.12 (b) — ponta a ponta ══════════════
  await test('[RN-171.12 b] requisicao da OS criada DEPOIS da chegada: aprovar converte 6 da reserva da OS (fica 4), TOTALMENTE_RESERVADA; separa e ENTREGA 6 pela rota', async () => {
    const os = await novaOs();
    const m = await material();
    await receber(await pedido(m, 10, os.id), m, 10);
    const [r0] = await ativasOs(m);
    const R = await criar(m, 6, os.numero.toUpperCase());
    assert.strictEqual(await aprovar(R), 'TOTALMENTE_RESERVADA');
    assert.strictEqual(await holdReq(R), 6);
    const depois = await dbGet(db, 'SELECT status, quantidade, motivo_liberacao FROM reservas_material_almoxarifado WHERE id = ?', [r0.id]);
    assert.deepStrictEqual([depois.status, Number(depois.quantidade)], ['ATIVA', 4], 'a reserva da OS cedeu so o que a requisicao pediu');
    assert.deepStrictEqual(await mat(m), { q: 10, r: 10 });
    const it = await itemDe(R);
    const sep = await request(app).put(`${API}/requisicoes/${R}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: 6 }] });
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
    const ent = await request(app).put(`${API}/requisicoes/${R}/entregar`).send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 6 }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
    assert.deepStrictEqual(await mat(m), { q: 4, r: 4 }, 'entregou 6; os 4 da OS continuam presos para ela');
    assert.strictEqual(await saldoOsAtivo(m), 4);
  });

  await test('[RN-171.12 b] negativa: requisicao de OUTRA OS e requisicao sem a OS nao conseguem a reserva da OS (esperam), a reserva fica intacta', async () => {
    const os = await novaOs();
    const outraOs = await novaOs();
    const m = await material();
    await receber(await pedido(m, 10, os.id), m, 10);
    const Rout = await criar(m, 2, outraOs.numero);
    assert.ok(EM_ESPERA.includes(await aprovar(Rout)), await st(Rout));
    const Rlivre = await criar(m, 2, 'MANUTENCAO');
    assert.ok(EM_ESPERA.includes(await aprovar(Rlivre)), await st(Rlivre));
    assert.deepStrictEqual([await holdReq(Rout), await holdReq(Rlivre), await saldoOsAtivo(m)], [0, 0, 10]);
  });

  await test('[RN-171.12 b] a requisicao da OS usa a reserva da OS ANTES do livre: com 5 livres de outra origem, aprovar 3 tira 3 da OS (OS fica 7, livre continua 5)', async () => {
    const os = await novaOs();
    const m = await material();
    await receber(await pedido(m, 10, os.id), m, 10);
    await entradaManual(m, 5);
    const R = await criar(m, 3, os.numero);
    assert.strictEqual(await aprovar(R), 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual([await holdReq(R), await saldoOsAtivo(m)], [3, 7]);
    assert.deepStrictEqual(await mat(m), { q: 15, r: 10 });
  });

  // ══════════════ RN-171.11 / I5 ══════════════
  await test('[RN-171.11, I5] estorno da entrada com reserva da OS: 200, reserva LIBERADA com o motivo do estorno, fisico e reservado 0', async () => {
    const os = await novaOs();
    const m = await material();
    const rec = await receber(await pedido(m, 10, os.id), m, 10);
    const [r0] = await ativasOs(m);
    const e = await request(app).post(`${API}/movimentacoes/${(await movEntrada(rec)).id}/cancelar`).send({ motivo: 'estorno e171' });
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    const depois = await dbGet(db, 'SELECT status, motivo_liberacao FROM reservas_material_almoxarifado WHERE id = ?', [r0.id]);
    assert.deepStrictEqual({ ...depois }, { status: 'LIBERADA', motivo_liberacao: `Estorno da entrada do recebimento ${await numeroRec(rec)}` });
    assert.deepStrictEqual(await mat(m), { q: 0, r: 0 });
  });

  await test('[I5] estorno da entrada com disponivel sobrando: tira da OS o que a nota deu (min(reserva, estornado)), mesmo com 20 livres', async () => {
    const os = await novaOs();
    const m = await material();
    await entradaManual(m, 20);
    const rec = await receber(await pedido(m, 10, os.id), m, 10);
    assert.strictEqual(await saldoOsAtivo(m), 10, 'premissa');
    const e = await request(app).post(`${API}/movimentacoes/${(await movEntrada(rec)).id}/cancelar`).send({ motivo: 'estorno e171' });
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.strictEqual(await saldoOsAtivo(m), 0);
    assert.deepStrictEqual(await mat(m), { q: 20, r: 0 });
  });

  await test('[I5] estorno RECUSADO depois de liberar a reserva da OS: ela e recriada como reserva da OS (os_id, recebimento_id, motivo, sem expira_em)', async () => {
    const os = await novaOs();
    const m = await material();
    const rec = await receber(await pedido(m, 10, os.id), m, 10);
    const R = await criar(m, 4, os.numero);
    assert.strictEqual(await aprovar(R), 'TOTALMENTE_RESERVADA');
    const it = await itemDe(R);
    assert.strictEqual((await request(app).put(`${API}/requisicoes/${R}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: 4 }] })).status, 200);
    assert.strictEqual((await request(app).put(`${API}/requisicoes/${R}/entregar`).send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 4 }] })).status, 200);
    assert.deepStrictEqual([await saldoOsAtivo(m), (await mat(m)).q], [6, 6], 'premissa: a OS ficou com 6, fisico 6');
    const e = await request(app).post(`${API}/movimentacoes/${(await movEntrada(rec)).id}/cancelar`).send({ motivo: 'estorno e171' });
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    const ativas = await ativasOs(m);
    assert.strictEqual(ativas.length, 1, JSON.stringify(ativas));
    assert.deepStrictEqual([Number(ativas[0].quantidade), ativas[0].os_id, ativas[0].recebimento_id, ativas[0].expira_em, ativas[0].requisicao_id],
      [6, os.id, rec, null, null]);
    assert.ok(String(ativas[0].observacoes).startsWith(`Compra para a OS ${os.numero}`), ativas[0].observacoes);
    assert.deepStrictEqual(await mat(m), { q: 6, r: 6 });
  });

  // ══════════════ Corrida (molde do CLAUDE.md: gancho so sinaliza e segura; o gesto sai do contexto do teste) ══════════════
  await test('[corrida] aprovacao da requisicao da OS durante a nota: espera a trava (nao termina com a nota segurada), depois converte a reserva da OS', async () => {
    const os = await novaOs();
    const m = await material();
    const rec = await notaPronta(await pedido(m, 10, os.id), m, 10);
    const R = await criar(m, 4, os.numero); // PENDENTE: a nota nao a serve (nao e candidata)
    const original = reservaDaOs.reservarParaOsSobTrava;
    let sinalizar; const sinal = new Promise((res) => { sinalizar = res; });
    let soltar; const portao = new Promise((res) => { soltar = res; });
    reservaDaOs.reservarParaOsSobTrava = async (...args) => { sinalizar(); await portao; return original(...args); };
    let aprovou = false;
    let pNota; let pAprov;
    try {
      pNota = processar(rec).then((r) => r);
      await sinal; // a nota esta DENTRO da secao, antes de reservar para a OS
      pAprov = request(app).put(`${API}/requisicoes/${R}/aprovar`).send({}).then((r) => { aprovou = true; return r; });
      await new Promise((res) => { setTimeout(res, 250); });
      assert.strictEqual(aprovou, false, 'a aprovacao nao pode passar pela trava que a nota segura');
    } finally {
      soltar();
      reservaDaOs.reservarParaOsSobTrava = original;
    }
    const [n, a] = await Promise.all([pNota, pAprov]);
    assert.strictEqual(n.status, 200, JSON.stringify(n.body));
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    assert.strictEqual(a.body.status, 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual([await holdReq(R), await saldoOsAtivo(m)], [4, 6], 'a aprovacao veio depois e converteu 4 da OS');
    const r0 = (await reservasOs(m))[0];
    assert.strictEqual(r0.recebimento_id, rec);
    assert.deepStrictEqual(await mat(m), { q: 10, r: 10 });
  });

  await test('[chave da OS] a comparacao ignora caixa, espacos e o prefixo "OS"; vazio nunca casa', async () => {
    assert.ok(reservaDaOs.requisicaoEhDaOs(' os 2024-015 ', '2024-015'));
    assert.ok(reservaDaOs.requisicaoEhDaOs('OS#2024-015', '2024-015'));
    assert.ok(reservaDaOs.requisicaoEhDaOs('2024-015', 'OS-2024-015'));
    assert.ok(!reservaDaOs.requisicaoEhDaOs('2024-0150', '2024-015'));
    assert.ok(!reservaDaOs.requisicaoEhDaOs('', ''));
    assert.ok(!reservaDaOs.requisicaoEhDaOs(null, '2024-015'));
  });

  console.log(`\n${passed} passaram, ${failed} falharam`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
