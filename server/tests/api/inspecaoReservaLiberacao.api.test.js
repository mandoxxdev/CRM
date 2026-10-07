/**
 * Etapa 75 (T1) — o material que a inspeção aprova fica com quem esperava (C126).
 *
 * Até a 75 o material crítico entrava retido, a 74 o pulava (retido não se reserva) e a decisão da
 * inspeção o soltava LIVRE: quem era aprovado depois levava o que a requisição que esperava há semanas
 * estava esperando (sonda A: R3 aprovada depois da inspeção ficou TOTALMENTE_RESERVADA; R1 tomou
 * "Máximo: 0" ao separar). Agora, no fim de `decidirInspecao`, a parte APROVADA é reservada para quem
 * esperava, na ordem da fila (`compararPrioridade`), pelo mesmo miolo da 74 (T0) com o teto desta
 * decisão — best-effort, resposta inalterada.
 *
 * Pelas ROTAS (a nota pelas seis portas do recebimento; `POST /recebimentos/itens/:id/inspecionar` com
 * o perfil QUALIDADE pelo gate real) e pelo SERVIÇO (quantidade 0, o resultado parcial).
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa75-inspecao-libera-reserva.md
 *
 * Executar: cd server && node tests/api/inspecaoReservaLiberacao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const valueApprovalService = require('../../services/almoxarifado/requisitionValueApprovalService');
const reservaChegadaService = require('../../services/almoxarifado/reservaChegadaService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Faturista 75', role: 'admin', is_superadmin: 1, email: 'fat75@t.com' };
const SOL = { id: 7501, nome: 'Solicitante 75', role: 'admin', is_superadmin: 1, email: 's75@t.com' };
const APR = { id: 7502, nome: 'Aprovador 75', role: 'admin', is_superadmin: 1, email: 'a75@t.com' };
const QUALIDADE = { id: 7503, nome: 'Inspetora 75', perfil_almoxarifado: 'QUALIDADE', email: 'q75@t.com' };
const PRODUCAO = { id: 7504, nome: 'Chao 75', email: 'p75@t.com' }; // sem perfil: fallback PRODUCAO, sem `inspecionar`
const API = '/api/almoxarifado';
const EM_ESPERA = ['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'];
const CHAVES_RESPOSTA = ['divergencia_dimensional', 'divergencia_quantidade', 'id', 'medidas_registradas',
  'quantidade_aprovada', 'quantidade_reprovada'];
let seq = 0;

(async () => {
  console.log('\n=== Etapa 75 (T1): a inspeção reserva para quem esperava ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('F75','75000000000175','ativo')")).lastID;
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };
  const capturarWarn = async (fn) => {
    const orig = console.warn; const msgs = [];
    console.warn = (...a) => { msgs.push(a.join(' ')); };
    try { return { r: await fn(), msgs }; } finally { console.warn = orig; }
  };

  const material = async ({ critico = 1 } = {}) => {
    const c = `E75-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', 0, 0, 1, ?, ?)`, [c, `Mat ${c}`, forn, critico])).lastID;
  };
  const entradaManual = async (m, q) => {
    const e = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'setup 75' });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
  };
  const criarReq = async (itens, extra = {}) => {
    const r = await as(SOL, () => request(app).post(`${API}/requisicoes`)
      .send({ os_referencia: 'OS-INT', ...extra, itens: itens.map(([material_id, quantidade]) => ({ material_id, quantidade })) }));
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
    assert.ok(EM_ESPERA.includes(a.status), `premissa: sem saldo livre a aprovacao espera (${a.status})`);
    return r.id;
  };
  const reqDireta = async (status, itens, extra = {}) => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo, data_aprovacao_valor, os_referencia)
      VALUES (?, ?, 'Sol direto', ?, 'NORMAL', ?, ?, ?, 'OS-INT')`,
    [`REQ-E75D-${++seq}`, SOL.id, status, extra.criado || `2026-09-01 10:${String(seq % 60).padStart(2, '0')}:00`,
      extra.ativo ?? 1, extra.aprovadoValor ? '2026-09-01 10:00:00' : null])).lastID;
    for (const [m, q, sep = 0, ent = 0] of itens) {
      // eslint-disable-next-line no-await-in-loop
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
  const ativasDoMaterial = (m) => dbAll(db, `SELECT * FROM reservas_material_almoxarifado WHERE material_id = ? AND status = 'ATIVA' ORDER BY id`, [m]);
  const saldo = async (m) => ({ ...(await dbGet(db, `SELECT quantidade_atual q, quantidade_reservada r, quantidade_em_inspecao i,
    quantidade_bloqueada b FROM materiais_almoxarifado WHERE id = ?`, [m])) });
  const itemDe = async (reqId, m) => (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? AND material_id = ?', [reqId, m])).id;

  // A nota pelas SEIS portas do recebimento.
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
      nota_fiscal: `NF-E75-${++seq}`, fornecedor_id: forn, fornecedor_nome: 'F75',
      data_emissao_nf: '2026-09-01', data_entrada_nf: '2026-09-02', valor_total_nota: 10, itens,
    });
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    const pr = await request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(pr.status, 200, JSON.stringify(pr.body));
    return id;
  }
  // Nota gravada pronta para /processar (estados que a rota de nota nao precisa repetir em cada teste).
  async function notaDireta(linhas) {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F75', '2026-09-01', '2026-09-02', 10)`, [`REC-E75-${++seq}`, `NF-E75D-${seq}`])).lastID;
    for (const [m, q] of linhas) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`, [r, m, q, q]);
    }
    const p = await request(app).post(`${API}/recebimentos/${r}/processar`).send({});
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    return r;
  }
  const numeroRec = async (rec) => (await dbGet(db, 'SELECT numero FROM recebimentos_material_almoxarifado WHERE id = ?', [rec])).numero;
  const numeroReq = async (id) => (await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id = ?', [id])).numero;
  const itemRec = (rec, m) => dbGet(db, 'SELECT id, quantidade_em_inspecao FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? AND material_id = ?', [rec, m]);
  const inspecionar = (itemId, a, r, quem = QUALIDADE) => as(quem, () => request(app).post(`${API}/recebimentos/itens/${itemId}/inspecionar`)
    .send({ quantidade_aprovada: a, quantidade_reprovada: r, encaminhamento: r > 0 ? 'DEVOLVER' : undefined }));
  const separar = async (rid, m, q) => as(SOL, async () => request(app).put(`${API}/requisicoes/${rid}/separar`)
    .send({ itens_separados: [{ item_id: await itemDe(rid, m), quantidade_separada: q }] }));
  const inspecaoDe = (itemId) => dbGet(db, 'SELECT * FROM inspecoes_recebimento_almoxarifado WHERE recebimento_item_id = ?', [itemId]);

  await cfg('inspecao_material_critico', '1');
  try {
    // ══════════════ RN-01 ══════════════
    await test('[RN-01] quem esperava fica com o que a inspecao aprovou: 201 com as chaves de hoje; UMA reserva de 4 para R1 (nota, REQUISICAO, literais); R1 TOTALMENTE; R2 (aprovada com o retido) sem nada', async () => {
      const m = await material();
      const p = await pedido([[m, 4]]);
      const R1 = await esperando([[m, 4]]);
      const rec = await receber(p, [[m, 4]]);
      assert.deepStrictEqual(await ativasDoMaterial(m), [], 'premissa: retido nao se reserva na chegada (74)');
      assert.strictEqual((await saldo(m)).i, 4);
      const R2 = await esperando([[m, 4]]);
      const it = await itemRec(rec, m);

      const r = await inspecionar(it.id, 4, 0);

      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      assert.deepStrictEqual(Object.keys(r.body).sort(), CHAVES_RESPOSTA, 'D5: resposta inalterada');
      const rs = await ativas(R1);
      assert.strictEqual(rs.length, 1, JSON.stringify(rs));
      assert.strictEqual(Number(rs[0].quantidade), 4);
      assert.strictEqual(rs[0].recebimento_id, rec, 'D4: a reserva da liberacao e marcada com a nota');
      assert.strictEqual(rs[0].origem, 'REQUISICAO');
      assert.strictEqual(rs[0].item_requisicao_id, await itemDe(R1, m));
      assert.strictEqual(rs[0].observacoes,
        `Reserva na liberação da inspeção — recebimento ${await numeroRec(rec)} — requisição ${await numeroReq(R1)}`);
      const mov = await dbGet(db, "SELECT motivo, requisicao_id FROM movimentacoes_almoxarifado WHERE tipo = 'RESERVA' AND reserva_id = ?", [rs[0].id]);
      assert.strictEqual(mov.motivo, `Reserva na liberação da inspeção — recebimento ${await numeroRec(rec)}`);
      assert.strictEqual(await st(R1), 'TOTALMENTE_RESERVADA');
      assert.deepStrictEqual(await ativas(R2), []);
      assert.ok(EM_ESPERA.includes(await st(R2)), await st(R2));

      // Metade positiva: quem e aprovado DEPOIS nao leva; R1 separa, R3 nao.
      const R3 = (await criarReq([[m, 4]])).id;
      const a3 = await aprovar(R3);
      assert.ok(EM_ESPERA.includes(a3.status), `R3 aprovada depois: ${a3.status}`);
      assert.deepStrictEqual(a3.reservas || [], []);
      const s1 = await separar(R1, m, 4);
      assert.strictEqual(s1.status, 200, JSON.stringify(s1.body));
      const s3 = await separar(R3, m, 4);
      assert.strictEqual(s3.status, 400);
      assert.ok(/Máximo: 0/.test(s3.body.error), s3.body.error);
    });

    // ══════════════ RN-02 ══════════════
    await test('[RN-02] R1 NORMAL (6, antes) e R2 URGENTE (3, depois): inspecao aprova 4 -> R2 3 (TOTALMENTE), R1 1 (PARCIALMENTE); a ordem e a da fila', async () => {
      const m = await material();
      const p = await pedido([[m, 4]]);
      const R1 = await esperando([[m, 6]], { urgencia: 'NORMAL' });
      const R2 = await esperando([[m, 3]], { urgencia: 'URGENTE', justificativa_urgencia: 'linha parada' });
      const rec = await receber(p, [[m, 4]]);
      const f = await request(app).get(`${API}/fila-separacao`);
      const ordemFila = f.body.map((x) => x.id).filter((id) => [R1, R2].includes(id));
      assert.strictEqual((await inspecionar((await itemRec(rec, m)).id, 4, 0)).status, 201);
      assert.deepStrictEqual(await qtdAtivas(R2), [3]);
      assert.deepStrictEqual(await qtdAtivas(R1), [1]);
      assert.strictEqual(await st(R2), 'TOTALMENTE_RESERVADA');
      assert.strictEqual(await st(R1), 'PARCIALMENTE_RESERVADA');
      const ordemReserva = (await dbAll(db, 'SELECT requisicao_id FROM reservas_material_almoxarifado WHERE material_id = ? ORDER BY id', [m]))
        .map((x) => x.requisicao_id);
      assert.deepStrictEqual(ordemReserva, ordemFila, 'a ordem da fila antes da decisao e a ordem das reservas');
    });

    // ══════════════ RN-03 ══════════════
    await test('[RN-03] 3 aprovados / 1 reprovado, R espera 4 -> reserva 3, bloqueada 1, nada acima de 3', async () => {
      const m = await material();
      const p = await pedido([[m, 4]]);
      const R = await esperando([[m, 4]]);
      const rec = await receber(p, [[m, 4]]);
      assert.strictEqual((await inspecionar((await itemRec(rec, m)).id, 3, 1)).status, 201);
      assert.deepStrictEqual(await qtdAtivas(R), [3]);
      assert.strictEqual(await st(R), 'PARCIALMENTE_RESERVADA');
      const s = await saldo(m);
      assert.deepStrictEqual([s.b, s.r, s.i], [1, 3, 0]);
    });

    await test('[RN-03] saldo livre de ajuste (entrada manual de 5) e inspecao 1/3 -> reserva 1 (nao 4, nao 6): so o que ESTA decisao liberou', async () => {
      const m = await material();
      const rec = await notaDireta([[m, 4]]);
      await entradaManual(m, 5);
      // A requisicao e gravada direto: pela rota, a aprovacao levaria os 5 livres de ajuste.
      const R = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 10]]);
      assert.strictEqual((await inspecionar((await itemRec(rec, m)).id, 1, 3)).status, 201);
      assert.deepStrictEqual(await qtdAtivas(R), [1]);
      assert.deepStrictEqual((await saldo(m)), { q: 9, r: 1, i: 0, b: 3 });
    });

    await test('[RN-03] reprovacao total (0/4) com R esperando e saldo livre de ajuste -> nenhuma reserva; a NC abre como hoje', async () => {
      const m = await material();
      const rec = await notaDireta([[m, 4]]);
      await entradaManual(m, 2);
      const R = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 4]]);
      const it = await itemRec(rec, m);
      const r = await inspecionar(it.id, 0, 4);
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      assert.deepStrictEqual(await ativasDoMaterial(m), []);
      assert.strictEqual(await st(R), 'AGUARDANDO_ESTOQUE');
      const nc = await dbGet(db, "SELECT status FROM nao_conformidades_almoxarifado WHERE referencia_tipo = 'INSPECAO' AND referencia_id = ?", [r.body.id]);
      assert.strictEqual(nc && nc.status, 'ABERTA');
    });

    // ══════════════ RN-05 ══════════════
    await test('[RN-05] o status acompanha: AGUARDANDO_COMPRA coberta -> TOTALMENTE; PARCIALMENTE_ATENDIDA e EM_SEPARACAO ganham e MANTEM; CANCELADO e inativa nao ganham', async () => {
      const m = await material();
      const rec = await notaDireta([[m, 9]]);
      const cancelada = await reqDireta('CANCELADO', [[m, 2]], { criado: '2026-08-01 08:00:00' });
      const inativa = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 2]], { criado: '2026-08-01 08:01:00', ativo: 0 });
      const compra = await reqDireta('AGUARDANDO_COMPRA', [[m, 2]], { criado: '2026-08-01 08:02:00' });
      const parcAt = await reqDireta('PARCIALMENTE_ATENDIDA', [[m, 4, 2, 2]], { criado: '2026-08-01 08:03:00' });
      const emSep = await reqDireta('EM_SEPARACAO', [[m, 3]], { criado: '2026-08-01 08:04:00' });
      assert.strictEqual((await inspecionar((await itemRec(rec, m)).id, 9, 0)).status, 201);
      assert.deepStrictEqual([await qtdAtivas(cancelada), await qtdAtivas(inativa)], [[], []]);
      assert.deepStrictEqual([await qtdAtivas(compra), await qtdAtivas(parcAt), await qtdAtivas(emSep)], [[2], [2], [3]]);
      assert.deepStrictEqual([await st(compra), await st(parcAt), await st(emSep)],
        ['TOTALMENTE_RESERVADA', 'PARCIALMENTE_ATENDIDA', 'EM_SEPARACAO']);
    });

    // ══════════════ RN-06 ══════════════
    await test('[RN-06] criarReserva lancando: 201, a decisao gravada, o saldo movido, nenhuma reserva orfa, warn por item com a literal da liberacao', async () => {
      const m = await material();
      const rec = await notaDireta([[m, 3]]);
      const R = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 3]]);
      const it = await itemRec(rec, m);
      const original = stockService.criarReserva;
      stockService.criarReserva = async () => { throw new Error('falha simulada 75'); };
      let res;
      try { res = await capturarWarn(() => inspecionar(it.id, 3, 0)); } finally { stockService.criarReserva = original; }
      assert.strictEqual(res.r.status, 201, JSON.stringify(res.r.body));
      assert.deepStrictEqual(Object.keys(res.r.body).sort(), CHAVES_RESPOSTA);
      assert.ok(await inspecaoDe(it.id), 'a decisao esta gravada');
      assert.deepStrictEqual(await saldo(m), { q: 3, r: 0, i: 0, b: 0 });
      assert.deepStrictEqual(await ativasDoMaterial(m), []);
      const itR = await itemDe(R, m);
      const esperado = `[almoxarifado-reservas] Falha ao reservar na liberação da inspeção ${res.r.body.id} o item ${itR} da requisição ${R}: falha simulada 75`;
      assert.ok(res.msgs.includes(esperado), JSON.stringify(res.msgs));
      assert.ok(!res.msgs.some((x) => x.includes('na chegada')), 'Fase 2: o log nao diz "na chegada" numa liberacao');
      assert.strictEqual(await st(R), 'AGUARDANDO_ESTOQUE');
    });

    await test('[RN-06] falha que ESCAPA do laco (compararPrioridade lancando): 201, a decisao gravada, warn do contrato com a origem e o documento', async () => {
      const m = await material();
      const rec = await notaDireta([[m, 2]]);
      await reqDireta('AGUARDANDO_ESTOQUE', [[m, 1]]);
      await reqDireta('AGUARDANDO_ESTOQUE', [[m, 1]]);
      const it = await itemRec(rec, m);
      const original = requisitionService.compararPrioridade;
      requisitionService.compararPrioridade = () => { throw new Error('ordem quebrou 75'); };
      let res;
      try { res = await capturarWarn(() => inspecionar(it.id, 2, 0)); } finally { requisitionService.compararPrioridade = original; }
      assert.strictEqual(res.r.status, 201, JSON.stringify(res.r.body));
      assert.ok(await inspecaoDe(it.id));
      assert.deepStrictEqual(await saldo(m), { q: 2, r: 0, i: 0, b: 0 });
      assert.ok(res.msgs.includes(`[almoxarifado-reservas] reserva na liberacao falhou (INSPECAO ${res.r.body.id}): ordem quebrou 75`),
        JSON.stringify(res.msgs));
    });

    // ══════════════ RN-07 ══════════════
    await test('[RN-07] decidir o mesmo item de novo: 400 "Item nao possui quantidade em inspecao retida" e nenhuma reserva nova', async () => {
      const m = await material();
      const rec = await notaDireta([[m, 2]]);
      const R = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 5]]);
      const it = await itemRec(rec, m);
      assert.strictEqual((await inspecionar(it.id, 2, 0)).status, 201);
      await entradaManual(m, 3); // ha o que reservar, se o gancho rodasse de novo
      const de2 = await inspecionar(it.id, 2, 0);
      assert.strictEqual(de2.status, 400);
      assert.strictEqual(de2.body.error, 'Item não possui quantidade em inspeção retida');
      assert.deepStrictEqual(await qtdAtivas(R), [2]);
    });

    // ══════════════ RN-08 ══════════════
    await test('[RN-08] a QUALIDADE (sem `reservar`) decide pelo gate real e a reserva existe, dono = a inspetora', async () => {
      const m = await material();
      const rec = await notaDireta([[m, 2]]);
      const R = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 2]]);
      const r = await inspecionar((await itemRec(rec, m)).id, 2, 0, QUALIDADE);
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      const rs = await ativas(R);
      assert.strictEqual(rs.length, 1, 'a reserva existe (sistema: true dispensa o perfil)');
      assert.strictEqual(rs[0].solicitante_id, QUALIDADE.id, 'D6: o dono e quem decidiu');
    });

    await test('[RN-08] usuario sem `inspecionar` (PRODUCAO): 403 de hoje, item ainda retido, nada reservado', async () => {
      const m = await material();
      const rec = await notaDireta([[m, 2]]);
      const R = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 2]]);
      const it = await itemRec(rec, m);
      const r = await inspecionar(it.id, 2, 0, PRODUCAO);
      assert.strictEqual(r.status, 403, JSON.stringify(r.body));
      assert.strictEqual(Number((await itemRec(rec, m)).quantidade_em_inspecao), 2);
      assert.deepStrictEqual(await ativas(R), []);
    });

    // ══════════════ RN-11 ══════════════
    await test('[RN-11] desbloqueio avulso do reprovado NAO reserva (declarado, D1): 200, nenhuma reserva, R continua esperando', async () => {
      const m = await material();
      const rec = await notaDireta([[m, 2]]);
      const R = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 2]]);
      assert.strictEqual((await inspecionar((await itemRec(rec, m)).id, 0, 2)).status, 201);
      const d = await request(app).post(`${API}/materiais/${m}/desbloquear`).send({ quantidade: 2, justificativa: 'avulso 75' });
      assert.strictEqual(d.status, 200, JSON.stringify(d.body));
      assert.strictEqual((await saldo(m)).b, 0);
      assert.deepStrictEqual(await ativasDoMaterial(m), []);
      assert.strictEqual(await st(R), 'AGUARDANDO_ESTOQUE');
    });

    // ══════════════ RN-12 ══════════════
    await test('[RN-12] corrida decisao x /aprovar de R3 (6 rodadas): soma das ATIVAS <= 4; nenhuma *_RESERVADA sem hold; o status do /aprovar e o gravado', async () => {
      for (let i = 0; i < 6; i++) {
        // eslint-disable-next-line no-await-in-loop
        const m = await material();
        // eslint-disable-next-line no-await-in-loop
        const rec = await notaDireta([[m, 4]]);
        // eslint-disable-next-line no-await-in-loop
        const R1 = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 4]]);
        // eslint-disable-next-line no-await-in-loop
        const R3 = (await criarReq([[m, 4]])).id;
        // eslint-disable-next-line no-await-in-loop
        const it = await itemRec(rec, m);
        // Um usuario so para as duas portas: o harness tem UM usuario corrente (admin decide e aprova).
        // eslint-disable-next-line no-await-in-loop
        const [ri, ra] = await Promise.all([
          request(app).post(`${API}/recebimentos/itens/${it.id}/inspecionar`).send({ quantidade_aprovada: 4, quantidade_reprovada: 0 }),
          request(app).put(`${API}/requisicoes/${R3}/aprovar`).send({}),
        ]);
        assert.strictEqual(ri.status, 201, JSON.stringify(ri.body));
        assert.strictEqual(ra.status, 200, JSON.stringify(ra.body));
        // eslint-disable-next-line no-await-in-loop
        const soma = (await ativasDoMaterial(m)).reduce((s, x) => s + Number(x.quantidade), 0);
        assert.ok(soma <= 4 + 1e-9, `rodada ${i}: soma ${soma}`);
        for (const id of [R1, R3]) {
          // eslint-disable-next-line no-await-in-loop
          const s = await st(id);
          // eslint-disable-next-line no-await-in-loop
          if (/_RESERVADA$/.test(s)) assert.ok((await qtdAtivas(id)).length > 0, `rodada ${i}: ${id} ${s} sem hold`);
        }
        // eslint-disable-next-line no-await-in-loop
        assert.strictEqual(ra.body.status, await st(R3), `rodada ${i}: /aprovar respondeu ${ra.body.status}`);
      }
    });

    // ══════════════ servico ══════════════
    await test('[servico] reservarLiberacaoParaQuemEspera com quantidade 0 (e material inexistente): devolve vazio, nao lanca', async () => {
      const m = await material();
      await reqDireta('AGUARDANDO_ESTOQUE', [[m, 1]]);
      await entradaManual(m, 3);
      const vazio = { reservas: [], status: [] };
      const ctx = { origem: 'INSPECAO', documento_id: 999, documento_numero: null, material_id: m, quantidade: 0, recebimento_id: null };
      assert.deepStrictEqual(await reservaChegadaService.reservarLiberacaoParaQuemEspera(db, ADMIN, ctx), vazio);
      assert.deepStrictEqual(await reservaChegadaService.reservarLiberacaoParaQuemEspera(db, ADMIN, { ...ctx, quantidade: 2, material_id: 987654 }), vazio);
      assert.deepStrictEqual(await ativasDoMaterial(m), []);
    });

    await test('[servico] aposLiberacaoSemFalhar devolve o resultado PARCIAL quando a falha escapa no meio (o aviso dira o que de fato ficou)', async () => {
      const m = await material();
      await entradaManual(m, 4);
      const A = await reqDireta('AGUARDANDO_ESTOQUE', [[m, 2]], { criado: '2026-07-01 08:00:00', aprovadoValor: true });
      await reqDireta('AGUARDANDO_ESTOQUE', [[m, 2]], { criado: '2026-07-02 08:00:00' }); // sem aprovacao de valor: avalia ao vivo
      const original = valueApprovalService.avaliarRequisicaoValor;
      valueApprovalService.avaliarRequisicaoValor = async () => { throw new Error('valor caiu 75'); };
      let res;
      try {
        res = await capturarWarn(() => reservaChegadaService.aposLiberacaoSemFalhar(db, ADMIN,
          { origem: 'INSPECAO', documento_id: 4242, documento_numero: null, material_id: m, quantidade: 4, recebimento_id: null }));
      } finally { valueApprovalService.avaliarRequisicaoValor = original; }
      assert.ok(res.msgs.includes('[almoxarifado-reservas] reserva na liberacao falhou (INSPECAO 4242): valor caiu 75'), JSON.stringify(res.msgs));
      assert.strictEqual(res.r.reservas.length, 1, JSON.stringify(res.r));
      assert.strictEqual(res.r.reservas[0].requisicao_id, A);
      assert.strictEqual(res.r.reservas[0].quantidade, 2);
      assert.deepStrictEqual(res.r.status.map((x) => [x.requisicao_id, x.para]), [[A, 'TOTALMENTE_RESERVADA']],
        'o status de quem ganhou e recalculado mesmo com a falha');
    });
  } finally { await cfg('inspecao_material_critico', '0'); }

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
