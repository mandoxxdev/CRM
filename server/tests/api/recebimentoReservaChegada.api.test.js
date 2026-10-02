/**
 * Etapa 74 (T1) — a requisição que esperava fica com o material que chegou (C121).
 *
 * O gancho mora nos dois `concluir*` do receiptService (D1/B367): a nota entra, o que entrou LIVRE é
 * reservado para quem esperava, na ordem da fila (`compararPrioridade`), e o status acompanha. Pelas
 * ROTAS (a nota pelas seis portas do recebimento, `/processar` e o ramo direto `/aprovar`) e pelo
 * SERVIÇO (RN-09 determinística, a chamada sem entrada, a idempotência e o excesso).
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa74-reserva-na-chegada.md
 *
 * Executar: cd server && node tests/api/recebimentoReservaChegada.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');
const reservaChegadaService = require('../../services/almoxarifado/reservaChegadaService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Faturista 74', role: 'admin', is_superadmin: 1, email: 'fat74@t.com' };
const SOL = { id: 7401, nome: 'Solicitante 74', role: 'admin', is_superadmin: 1, email: 's74@t.com' };
const APR = { id: 7402, nome: 'Aprovador 74', role: 'admin', is_superadmin: 1, email: 'a74@t.com' };
const API = '/api/almoxarifado';
const EM_ESPERA = ['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'];
let seq = 0;

(async () => {
  console.log('\n=== Etapa 74 (T1): reserva na chegada ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('F74','74000000000174','ativo')")).lastID;
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await dbRun(db, `CREATE TABLE IF NOT EXISTS projetos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)`);
  // `usuarios` e tabela core: sem ela o aviso da 70 ao solicitante nao tem destinatario e nao enfileira.
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, "INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (7401, 'Solicitante 74', 's74@t.com', 1)");
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };

  const material = async ({ saldo = 0, critico = 0, custo = 0, dono = null } = {}) => {
    const c = `E74-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, fornecedor_id, material_critico, custo_unitario, proprietario_cliente_id)
      VALUES (?, ?, 'PC', 0, 0, 1, ?, ?, ?, ?)`, [c, `Mat ${c}`, forn, critico, custo, dono])).lastID;
    if (saldo > 0) await entradaManual(id, saldo);
    return id;
  };
  async function entradaManual(m, q) {
    const e = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'setup 74' });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
  }
  const criarReq = async (itens, extra = {}) => {
    const r = await as(SOL, () => request(app).post(`${API}/requisicoes`)
      .send({ ...extra, itens: itens.map(([material_id, quantidade]) => ({ material_id, quantidade })) }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const aprovar = async (id) => {
    const r = await as(APR, () => request(app).put(`${API}/requisicoes/${id}/aprovar`).send({}));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const esperando = async (itens, extra = {}) => {
    const r = await criarReq(itens, extra);
    const a = await aprovar(r.id);
    assert.ok(EM_ESPERA.includes(a.status), `premissa: sem saldo a aprovacao espera (${a.status})`);
    return r.id;
  };
  // Requisicao gravada direto (estados que as portas nao produzem num passo: legado, separacao, terminais).
  const reqDireta = async (status, itens, extra = {}) => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo, projeto_id, data_aprovacao_valor)
      VALUES (?, ?, 'Sol direto', ?, 'NORMAL', ?, ?, ?, ?)`,
    [`REQ-E74D-${++seq}`, SOL.id, status, extra.criado || `2026-09-01 10:${String(seq % 60).padStart(2, '0')}:00`,
      extra.ativo ?? 1, extra.projeto_id || null, extra.aprovadoValor ? '2026-09-01 10:00:00' : null])).lastID;
    for (const [m, q, sep = 0, ent = 0] of itens) {
      await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
        VALUES (?,?,?,?,?,?)`, [id, m, q, sep, ent, ent]);
    }
    return id;
  };
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const ativas = (reqId) => dbAll(db, `SELECT * FROM reservas_material_almoxarifado
    WHERE requisicao_id = ? AND status = 'ATIVA' ORDER BY id`, [reqId]);
  const qtdAtivas = async (reqId) => (await ativas(reqId)).map((x) => Number(x.quantidade) - Number(x.quantidade_utilizada || 0));
  const disponivel = async (m) => Number((await dbGet(db, `SELECT quantidade_atual - COALESCE(quantidade_reservada,0)
    - COALESCE(quantidade_bloqueada,0) - COALESCE(quantidade_em_inspecao,0) - COALESCE(quantidade_em_terceiros,0) AS d
    FROM materiais_almoxarifado WHERE id = ?`, [m])).d);
  const itemDe = async (reqId, m) => (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? AND material_id = ?', [reqId, m])).id;

  // A nota pelas SEIS portas do recebimento (criar -> conferir -> encaminhar -> finalizar -> faturamento -> fiscal -> processar).
  const pedido = async (linhas) => {
    const pr = await request(app).post('/api/compras/pedidos').send({ fornecedor_id: forn, status: 'pendente',
      itens: linhas.map(([m, q]) => ({ material_id: m, quantidade: q, valor_unitario: 1 })) });
    assert.strictEqual(pr.status, 201, JSON.stringify(pr.body));
    const its = await dbAll(db, 'SELECT id, material_id FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id', [pr.body.id]);
    return { id: pr.body.id, linha: new Map(its.map((x) => [x.material_id, x.id])) };
  };
  async function receber(p, linhas) {
    const itens = linhas.map(([m, q]) => ({ material_id: m, pedido_item_id: p.linha.get(m), quantidade: q, quantidade_recebida: q }));
    const c = await request(app).post(`${API}/recebimentos`).send({ tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: p.id, itens });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const id = c.body.id;
    assert.strictEqual((await request(app).put(`${API}/recebimentos/${id}/conferir`).send({ itens })).status, 200);
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      // eslint-disable-next-line no-await-in-loop
      const r = await request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao });
      assert.strictEqual(r.status, 200, acao + JSON.stringify(r.body));
    }
    const f = await request(app).put(`${API}/recebimentos/${id}/fiscal`).send({
      nota_fiscal: `NF-E74-${++seq}`, fornecedor_id: forn, fornecedor_nome: 'F74',
      data_emissao_nf: '2026-09-01', data_entrada_nf: '2026-09-02', valor_total_nota: 10, itens,
    });
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    const pr = await request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(pr.status, 200, JSON.stringify(pr.body));
    return id;
  }
  // Nota gravada pronta para /processar (EM_ENTRADA_NF) ou para o ramo direto de /aprovar (RECEBIDO).
  async function notaDireta(linhas, status = 'EM_ENTRADA_NF') {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, ?, ?, 'F74', '2026-09-01', '2026-09-02', 10)`, [`REC-E74-${++seq}`, status, `NF-E74D-${seq}`])).lastID;
    for (const [m, q, lote] of linhas) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote) VALUES (?,?,?,?,?)`, [r, m, q, q, lote || null]);
    }
    return r;
  }
  const processar = (recId) => request(app).post(`${API}/recebimentos/${recId}/processar`).send({});
  const aprovarReceb = (recId) => request(app).post(`${API}/recebimentos/${recId}/aprovar`).send({});
  const capturarWarn = async (fn) => {
    const orig = console.warn; const msgs = [];
    console.warn = (...a) => { msgs.push(a.join(' ')); };
    try { return { r: await fn(), msgs }; } finally { console.warn = orig; }
  };

  // ══════════════ RN-01 ══════════════
  await test('[RN-01] nota de 4 pelas seis portas: UMA reserva ATIVA de 4 para o item de R1 (recebimento_id, REQUISICAO, dono = quem processou); R1 PARCIALMENTE_RESERVADA; disponivel 0', async () => {
    const m = await material();
    const p = await pedido([[m, 10]]);
    const R1 = await esperando([[m, 6]]);
    const rec = await receber(p, [[m, 4]]);
    const rs = await ativas(R1);
    assert.strictEqual(rs.length, 1, JSON.stringify(rs));
    assert.strictEqual(Number(rs[0].quantidade), 4);
    assert.strictEqual(rs[0].recebimento_id, rec);
    assert.strictEqual(rs[0].origem, 'REQUISICAO');
    assert.strictEqual(rs[0].item_requisicao_id, await itemDe(R1, m));
    assert.strictEqual(rs[0].solicitante_id, ADMIN.id, 'D6: o dono da reserva e quem processou a nota');
    assert.ok(/^Reserva na chegada do recebimento REC-.+ — requisição REQ-/.test(rs[0].observacoes), rs[0].observacoes);
    assert.strictEqual(await st(R1), 'PARCIALMENTE_RESERVADA');
    assert.strictEqual(await disponivel(m), 0);
    const mov = await dbGet(db, "SELECT motivo, requisicao_id FROM movimentacoes_almoxarifado WHERE tipo = 'RESERVA' AND reserva_id = ?", [rs[0].id]);
    assert.ok(/^Reserva na chegada — recebimento REC-/.test(mov.motivo), mov.motivo);
    assert.strictEqual(mov.requisicao_id, R1);

    // Metade positiva: quem e aprovado DEPOIS nao leva; R1 separa, R3 nao.
    const R3 = (await criarReq([[m, 4]])).id;
    const a3 = await aprovar(R3);
    assert.ok(EM_ESPERA.includes(a3.status), `R3 aprovada depois: ${a3.status}`);
    assert.deepStrictEqual(await ativas(R3), []);
    const s1 = await request(app).put(`${API}/requisicoes/${R1}/separar`).send({ itens_separados: [{ item_id: await itemDe(R1, m), quantidade_separada: 4 }] });
    assert.strictEqual(s1.status, 200, JSON.stringify(s1.body));
    const s3 = await request(app).put(`${API}/requisicoes/${R3}/separar`).send({ itens_separados: [{ item_id: await itemDe(R3, m), quantidade_separada: 4 }] });
    assert.strictEqual(s3.status, 400);
    assert.ok(/Máximo: 0/.test(s3.body.error), s3.body.error);
  });

  // ══════════════ RN-02 ══════════════
  await test('[RN-02] R1 NORMAL (6, antes) e R2 URGENTE (3, depois): nota de 4 -> R2 leva 3 (TOTALMENTE), R1 leva 1 (PARCIALMENTE); a ordem e a da fila', async () => {
    const m = await material();
    const p = await pedido([[m, 10]]);
    const R1 = await esperando([[m, 6]], { urgencia: 'NORMAL' });
    const R2 = await esperando([[m, 3]], { urgencia: 'URGENTE', justificativa_urgencia: 'linha parada' });
    const f = await request(app).get(`${API}/fila-separacao`);
    const ordemFila = f.body.map((x) => x.id).filter((id) => [R1, R2].includes(id));
    await receber(p, [[m, 4]]);
    assert.deepStrictEqual(await qtdAtivas(R2), [3]);
    assert.deepStrictEqual(await qtdAtivas(R1), [1]);
    assert.strictEqual(await st(R2), 'TOTALMENTE_RESERVADA');
    assert.strictEqual(await st(R1), 'PARCIALMENTE_RESERVADA');
    const ordemReserva = (await dbAll(db, `SELECT requisicao_id FROM reservas_material_almoxarifado
      WHERE material_id = ? ORDER BY id`, [m])).map((x) => x.requisicao_id);
    assert.deepStrictEqual(ordemReserva, ordemFila, 'a ordem da fila antes da nota e a ordem em que as reservas foram dadas');
  });

  await test('[RN-02] mesma urgencia: a de data de necessidade mais cedo primeiro; sem data, a criada antes', async () => {
    const m = await material();
    const semDataAntiga = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 2]], { criado: '2026-08-01 08:00:00' });
    const semDataNova = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 2]], { criado: '2026-08-02 08:00:00' });
    const comData = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 2]], { criado: '2026-09-20 08:00:00' });
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET data_necessidade = '2026-10-05' WHERE id = ?", [comData]);
    const rec = await notaDireta([[m, 4]]);
    assert.strictEqual((await processar(rec)).status, 200);
    assert.deepStrictEqual([await qtdAtivas(comData), await qtdAtivas(semDataAntiga), await qtdAtivas(semDataNova)], [[2], [2], []]);
  });

  // ══════════════ RN-03 ══════════════
  await test('[RN-03] material critico retido para inspecao nao se reserva; o comum da MESMA nota sim', async () => {
    await cfg('inspecao_material_critico', '1');
    try {
      const crit = await material({ critico: 1 }); const comum = await material();
      const p = await pedido([[crit, 4], [comum, 4]]);
      const Rc = await esperando([[crit, 4]]);
      const Rm = await esperando([[comum, 2]]);
      await receber(p, [[crit, 4], [comum, 4]]);
      assert.deepStrictEqual(await ativas(Rc), []);
      assert.ok(EM_ESPERA.includes(await st(Rc)), await st(Rc));
      assert.strictEqual(Number((await dbGet(db, 'SELECT quantidade_em_inspecao q FROM materiais_almoxarifado WHERE id = ?', [crit])).q), 4);
      assert.deepStrictEqual(await qtdAtivas(Rm), [2]);
      assert.strictEqual(await st(Rm), 'TOTALMENTE_RESERVADA');
    } finally { await cfg('inspecao_material_critico', '0'); }
  });

  // ══════════════ RN-04 ══════════════
  await test('[RN-04] so o que ESTA nota trouxe: espera 10 + nota 4 -> 4; espera 3 + nota 10 -> 3 e a aprovada depois leva dos 7', async () => {
    const m = await material();
    const R = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 10]]);
    const r1 = await notaDireta([[m, 4]]);
    assert.strictEqual((await processar(r1)).status, 200);
    assert.deepStrictEqual(await qtdAtivas(R), [4]);

    const m2 = await material();
    const R2 = await reqDireta('AGUARDANDO_ESTOQUE', [[m2, 3]]);
    const r2 = await notaDireta([[m2, 10]]);
    assert.strictEqual((await processar(r2)).status, 200);
    assert.deepStrictEqual(await qtdAtivas(R2), [3]);
    assert.strictEqual(await disponivel(m2), 7);
    const depois = (await criarReq([[m2, 5]])).id;
    const a = await aprovar(depois);
    assert.strictEqual(a.status, 'TOTALMENTE_RESERVADA');
    assert.strictEqual(await disponivel(m2), 2);
  });

  await test('[RN-04] saldo livre previo (entrada manual de 2 depois da aprovacao) e nota de 4 -> reserva 4, nao 6', async () => {
    const m = await material();
    const R = await esperando([[m, 10]]);
    await entradaManual(m, 2);
    assert.ok(EM_ESPERA.includes(await st(R)), 'premissa: a entrada manual nao reserva (fora da etapa)');
    const rec = await notaDireta([[m, 4]]);
    assert.strictEqual((await processar(rec)).status, 200);
    assert.deepStrictEqual(await qtdAtivas(R), [4]);
    assert.strictEqual(await disponivel(m), 2);
  });

  // ══════════════ RN-05 ══════════════
  await test('[RN-05] aprovacao automatica ligada: Q1 esperando fica com a nota de 5; Q2 criada depois responde e grava AGUARDANDO_*, sem reserva', async () => {
    const m = await material();
    const p = await pedido([[m, 10]]);
    const Q1 = await esperando([[m, 5]]);
    await receber(p, [[m, 5]]);
    assert.strictEqual(await st(Q1), 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual(await qtdAtivas(Q1), [5]);
    await cfg('aprovacao_automatica', '1');
    try {
      const Q2 = await criarReq([[m, 5]]);
      assert.ok(EM_ESPERA.includes(Q2.status), `resposta de Q2: ${Q2.status}`);
      assert.strictEqual(await st(Q2.id), Q2.status, 'respondido = gravado');
      assert.deepStrictEqual(await ativas(Q2.id), []);
    } finally { await cfg('aprovacao_automatica', '0'); }
  });

  // ══════════════ RN-06 ══════════════
  await test('[RN-06] o status acompanha: AGUARDANDO_COMPRA coberta -> TOTALMENTE; APROVADO sem reserva (legado) -> TOTALMENTE; PARCIALMENTE_ATENDIDA ganha e MANTEM', async () => {
    const m = await material();
    const compra = await reqDireta('AGUARDANDO_COMPRA', [[m, 2]], { criado: '2026-08-01 08:00:00' });
    const legado = await reqDireta('APROVADO', [[m, 2]], { criado: '2026-08-02 08:00:00' });
    const parcial = await reqDireta('PARCIALMENTE_ATENDIDA', [[m, 5, 2, 2]], { criado: '2026-08-03 08:00:00' });
    const rec = await notaDireta([[m, 7]]);
    assert.strictEqual((await processar(rec)).status, 200);
    assert.deepStrictEqual([await st(compra), await st(legado), await st(parcial)],
      ['TOTALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA', 'PARCIALMENTE_ATENDIDA']);
    assert.deepStrictEqual([await qtdAtivas(compra), await qtdAtivas(legado), await qtdAtivas(parcial)], [[2], [2], [3]]);
  });

  await test('[RN-06] dois materiais: A reservado na aprovacao, B esperando (PARCIALMENTE) -> chega B -> TOTALMENTE', async () => {
    const a = await material({ saldo: 5 }); const b = await material();
    const R = (await criarReq([[a, 2], [b, 3]])).id;
    assert.strictEqual((await aprovar(R)).status, 'PARCIALMENTE_RESERVADA');
    const rec = await notaDireta([[b, 3]]);
    assert.strictEqual((await processar(rec)).status, 200);
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual((await qtdAtivas(R)).sort(), [2, 3]);
  });

  await test('[RN-06] EM_SEPARACAO e candidata (ganha o hold) e o status NAO muda; CANCELADO, REJEITADO, PENDENTE e inativa nao ganham', async () => {
    const m = await material();
    const cancelada = await reqDireta('CANCELADO', [[m, 1]], { criado: '2026-07-01 08:00:00' });
    const rejeitada = await reqDireta('REJEITADO', [[m, 1]], { criado: '2026-07-01 08:00:01' });
    const pendente = await reqDireta('PENDENTE', [[m, 1]], { criado: '2026-07-01 08:00:02' });
    const inativa = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 1]], { criado: '2026-07-01 08:00:03', ativo: 0 });
    const separando = await reqDireta('EM_SEPARACAO', [[m, 4, 4, 0]], { criado: '2026-07-02 08:00:00' });
    const rec = await notaDireta([[m, 4]]);
    assert.strictEqual((await processar(rec)).status, 200);
    for (const id of [cancelada, rejeitada, pendente, inativa]) {
      // eslint-disable-next-line no-await-in-loop
      assert.deepStrictEqual(await ativas(id), [], `requisicao ${id} nao espera e nao ganha`);
    }
    assert.deepStrictEqual(await qtdAtivas(separando), [4]);
    assert.strictEqual(await st(separando), 'EM_SEPARACAO');
    assert.deepStrictEqual([await st(cancelada), await st(rejeitada), await st(pendente)], ['CANCELADO', 'REJEITADO', 'PENDENTE']);
  });

  // ══════════════ Fase 2: valor e dono ══════════════
  await test('[Fase 2] candidata com avaliacao de valor AO VIVO bloqueante e pulada; a seguinte leva', async () => {
    await cfg('liberacao_valor_ativo', '1'); await cfg('liberacao_valor_limite', '50');
    try {
      const m = await material({ custo: 10 });
      const cara = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 8]], { criado: '2026-07-01 08:00:00' }); // 80 > 50, sem aprovacao de valor
      const aprovadaValor = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 8]], { criado: '2026-07-01 08:00:01', aprovadoValor: true });
      const barata = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 2]], { criado: '2026-07-01 08:00:02' });
      const rec = await notaDireta([[m, 10]]);
      assert.strictEqual((await processar(rec)).status, 200);
      assert.deepStrictEqual([await qtdAtivas(cara), await qtdAtivas(aprovadaValor), await qtdAtivas(barata)], [[], [8], [2]]);
      assert.strictEqual(await st(cara), 'AGUARDANDO_ESTOQUE');
    } finally { await cfg('liberacao_valor_ativo', '0'); }
  });

  await test('[RN-14 revista] material de cliente: candidata sem o projeto do dono e pulada (a entrega recusaria); a com projeto do dono leva', async () => {
    const cli = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente 74')")).lastID;
    const outro = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Outro 74')")).lastID;
    const projDono = (await dbRun(db, 'INSERT INTO projetos (cliente_id, nome) VALUES (?, ?)', [cli, 'Proj dono'])).lastID;
    const projOutro = (await dbRun(db, 'INSERT INTO projetos (cliente_id, nome) VALUES (?, ?)', [outro, 'Proj outro'])).lastID;
    const m = await material({ dono: cli });
    const semProjeto = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 2]], { criado: '2026-07-01 08:00:00' });
    const deOutro = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 2]], { criado: '2026-07-01 08:00:01', projeto_id: projOutro });
    const doDono = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 2]], { criado: '2026-07-01 08:00:02', projeto_id: projDono });
    const rec = await notaDireta([[m, 4]]);
    assert.strictEqual((await processar(rec)).status, 200);
    assert.deepStrictEqual([await qtdAtivas(semProjeto), await qtdAtivas(deOutro), await qtdAtivas(doDono)], [[], [], [2]]);
    assert.strictEqual(await disponivel(m), 2);
  });

  // ══════════════ RN-07 ══════════════
  for (const porta of ['processar', 'aprovar direto']) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[RN-07] criarReserva lancando (${porta}): 200, nota terminal, estoque creditado, nenhuma reserva, warn com a literal; o aviso sai`, async () => {
      const m = await material();
      const R = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 3]]);
      const rec = await notaDireta([[m, 3]], porta === 'processar' ? 'EM_ENTRADA_NF' : 'RECEBIDO');
      const original = stockService.criarReserva;
      stockService.criarReserva = async () => { throw new Error('falha simulada 74'); };
      let res;
      try {
        res = await capturarWarn(() => (porta === 'processar' ? processar(rec) : aprovarReceb(rec)));
      } finally { stockService.criarReserva = original; }
      assert.strictEqual(res.r.status, 200, JSON.stringify(res.r.body));
      assert.deepStrictEqual(res.r.body, porta === 'processar'
        ? { success: true, status: 'PROCESSADO', contas_pagar_id: null } : { success: true }, 'resposta inalterada');
      assert.strictEqual((await dbGet(db, 'SELECT status FROM recebimentos_material_almoxarifado WHERE id = ?', [rec])).status,
        porta === 'processar' ? 'PROCESSADO' : 'APROVADO');
      assert.strictEqual(await disponivel(m), 3, 'o estoque entrou livre');
      assert.deepStrictEqual(await ativas(R), []);
      const itR = await itemDe(R, m);
      assert.ok(res.msgs.some((x) => x.includes(`[almoxarifado-reservas] Falha ao reservar na chegada o item ${itR} da requisição ${R}: falha simulada 74`)),
        JSON.stringify(res.msgs));
      assert.strictEqual(await st(R), 'AGUARDANDO_ESTOQUE', 'sem hold o status nao muda');
      const aviso = await dbAll(db, `SELECT id FROM fila_notificacoes_almoxarifado WHERE evento = 'RECEBIMENTO_ENTRADA_REQUISITANTE'
        AND json_extract(payload, '$.recebimento_id') = ? AND json_extract(payload, '$.requisicao_id') = ?`, [rec, R]);
      assert.strictEqual(aviso.length, 1, 'o aviso da 70 sai mesmo com a reserva falhando');
    });

    // eslint-disable-next-line no-await-in-loop
    await test(`[RN-07] o servico inteiro lancando (${porta}): 200 e o warn do gancho com a literal do contrato`, async () => {
      const m = await material();
      await reqDireta('AGUARDANDO_ESTOQUE', [[m, 1]]);
      const rec = await notaDireta([[m, 1]], porta === 'processar' ? 'EM_ENTRADA_NF' : 'RECEBIDO');
      const original = reservaChegadaService.reservarChegadaParaQuemEspera;
      reservaChegadaService.reservarChegadaParaQuemEspera = async () => { throw new Error('banco caiu 74'); };
      let res;
      try {
        res = await capturarWarn(() => (porta === 'processar' ? processar(rec) : aprovarReceb(rec)));
      } finally { reservaChegadaService.reservarChegadaParaQuemEspera = original; }
      assert.strictEqual(res.r.status, 200, JSON.stringify(res.r.body));
      assert.ok(res.msgs.includes(`[recebimento] reserva na chegada falhou (recebimento ${rec}): banco caiu 74`), JSON.stringify(res.msgs));
    });
  }

  // ══════════════ RN-08 ══════════════
  await test('[RN-08] idempotente pelo servico: a segunda passada na mesma nota nao cria reserva nenhuma (sobrando livre)', async () => {
    const m = await material();
    const R = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 3]]);
    const rec = await notaDireta([[m, 5]]); // sobram 2 livres: a segunda passada TEM o que distribuir
    assert.strictEqual((await processar(rec)).status, 200);
    assert.deepStrictEqual(await qtdAtivas(R), [3]);
    const r2 = await reservaChegadaService.reservarChegadaParaQuemEspera(db, ADMIN, rec);
    assert.deepStrictEqual(r2, { reservas: [], status: [] });
    const todas = await dbAll(db, 'SELECT status FROM reservas_material_almoxarifado WHERE requisicao_id = ?', [R]);
    assert.deepStrictEqual(todas.map((x) => x.status), ['ATIVA'], 'nenhuma reserva criada (nem desfeita) na segunda passada');
  });

  await test('[RN-08] retomada apos falha PARCIAL pela rota: a segunda passada reserva uma vez so (soma <= falta)', async () => {
    const a = await material(); const b = await material();
    const Ra = await reqDireta('AGUARDANDO_ESTOQUE', [[a, 10]]);
    const rec = await notaDireta([[a, 6], [b, 5, 'L-E74']]);
    const original = lotService.criarOuObterLote;
    lotService.criarOuObterLote = async () => { throw Object.assign(new Error('falha simulada no lote'), { status: 400 }); };
    try {
      assert.strictEqual((await processar(rec)).status, 400);
    } finally { lotService.criarOuObterLote = original; }
    assert.deepStrictEqual(await ativas(Ra), [], 'a nota nao terminou: o gancho nao rodou');
    assert.strictEqual((await processar(rec)).status, 200);
    assert.deepStrictEqual(await qtdAtivas(Ra), [6]);
  });

  await test('[RN-08] dois /processar simultaneos: [200, 409] e um so conjunto de reservas', async () => {
    const m = await material();
    const R = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 4]]);
    const rec = await notaDireta([[m, 4]]);
    const res = await Promise.all([processar(rec), processar(rec)]);
    assert.deepStrictEqual(res.map((x) => x.status).sort(), [200, 409], JSON.stringify(res.map((x) => x.body)));
    const todas = await dbAll(db, 'SELECT quantidade, status FROM reservas_material_almoxarifado WHERE requisicao_id = ?', [R]);
    assert.deepStrictEqual(todas.map((x) => [Number(x.quantidade), x.status]), [[4, 'ATIVA']]);
  });

  await test('[Fase 2] corrida no meio (outra reserva do MESMO item entre a leitura e a reserva): o excesso desta chamada e desfeito', async () => {
    const m = await material();
    const R = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 4]]);
    const item = await itemDe(R, m);
    const rec = await notaDireta([[m, 10]]);
    const original = stockService.criarReserva;
    let uma = false;
    stockService.criarReserva = async (...args) => {
      if (!uma) {
        uma = true; // a "outra nota"/aprovacao: reserva 3 do mesmo item antes desta
        await original(db, ADMIN, { material_id: m, quantidade: 3 }, { sistema: true, requisicao_id: R, item_requisicao_id: item });
      }
      return original(...args);
    };
    let out;
    try {
      out = await capturarWarn(() => processar(rec));
    } finally { stockService.criarReserva = original; }
    assert.strictEqual(out.r.status, 200);
    const soma = (await qtdAtivas(R)).reduce((x, y) => x + y, 0);
    assert.strictEqual(soma, 4, `holds ATIVOS do item = o pendente, nunca acima: ${JSON.stringify(await qtdAtivas(R))}`);
    assert.strictEqual(await disponivel(m), 6);
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA');
  });

  // ══════════════ RN-09 (servico, deterministico) ══════════════
  await test('[RN-09] cancelada entre a leitura e a reserva: a reserva e desfeita (LIBERADA), nenhum hold em CANCELADO, a seguinte leva', async () => {
    const m = await material();
    const Rx = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 3]], { criado: '2026-07-01 08:00:00' });
    const Ry = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 3]], { criado: '2026-07-01 08:00:01' });
    const rec = await notaDireta([[m, 3]]);
    const original = stockService.criarReserva;
    stockService.criarReserva = async (dbx, user, data, opcoes) => {
      if (opcoes.requisicao_id === Rx) {
        await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'CANCELADO' WHERE id = ?", [Rx]);
      }
      return original(dbx, user, data, opcoes);
    };
    try {
      assert.strictEqual((await processar(rec)).status, 200);
    } finally { stockService.criarReserva = original; }
    assert.deepStrictEqual(await ativas(Rx), [], 'nenhum hold ATIVO de requisicao CANCELADO');
    const desfeita = await dbGet(db, 'SELECT status, motivo_liberacao FROM reservas_material_almoxarifado WHERE requisicao_id = ?', [Rx]);
    assert.deepStrictEqual({ ...desfeita }, { status: 'LIBERADA', motivo_liberacao: 'Requisição saiu da espera durante a reserva na chegada' });
    assert.strictEqual(await st(Rx), 'CANCELADO', 'o recalculo nao ressuscita a cancelada');
    assert.deepStrictEqual(await qtdAtivas(Ry), [3], 'o que voltou ao distribuivel foi para a seguinte');
    assert.strictEqual(await disponivel(m), 0);
  });

  await test('[servico] nota sem nenhum item com entrada (e recebimento inexistente): devolve vazio, nao lanca', async () => {
    const m = await material();
    await reqDireta('AGUARDANDO_ESTOQUE', [[m, 1]]);
    const rec = await notaDireta([[m, 1]]);
    assert.deepStrictEqual(await reservaChegadaService.reservarChegadaParaQuemEspera(db, ADMIN, rec), { reservas: [], status: [] });
    assert.deepStrictEqual(await reservaChegadaService.reservarChegadaParaQuemEspera(db, ADMIN, 999999), { reservas: [], status: [] });
  });

  await test('[servico] o retorno descreve o que fez: reservas e status { de, para }', async () => {
    const m = await material();
    const R = await reqDireta('AGUARDANDO_COMPRA', [[m, 2]]);
    const rec = await notaDireta([[m, 2]]);
    // o gancho da rota ja reservaria; aqui a entrada e feita sem o gancho para chamar o servico direto
    const original = reservaChegadaService.reservarChegadaParaQuemEspera;
    reservaChegadaService.reservarChegadaParaQuemEspera = async () => ({ reservas: [], status: [] });
    try { assert.strictEqual((await processar(rec)).status, 200); } finally { reservaChegadaService.reservarChegadaParaQuemEspera = original; }
    const out = await reservaChegadaService.reservarChegadaParaQuemEspera(db, ADMIN, rec);
    assert.strictEqual(out.reservas.length, 1);
    assert.deepStrictEqual({ ...out.reservas[0], reserva_id: 0 },
      { requisicao_id: R, item_id: await itemDe(R, m), material_id: m, reserva_id: 0, quantidade: 2 });
    assert.deepStrictEqual(out.status, [{ requisicao_id: R, de: 'AGUARDANDO_COMPRA', para: 'TOTALMENTE_RESERVADA' }]);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
