/**
 * Etapa 75 (T2) — a não conformidade que ACEITA também reserva para quem esperava (C126, a segunda porta).
 *
 * Fase 0 (Surpresa 1, sonda B4/B5): decidir a NC da inspeção como `ACEITAR`/`ACEITAR_SOB_DESVIO` devolvia
 * o reprovado ao disponível (Etapa 44) LIVRE — a requisição que esperava continuava sem nada e quem era
 * aprovado depois levava o liberado. Agora, depois da auditoria e antes do `obterNaoConformidade`, só se
 * `liberacao.efeito === 'LIBERADA'`, o liberado vai para quem esperava pelo mesmo miolo (T0/T1).
 * Best-effort; resposta inalterada.
 *
 * Pelas ROTAS: a nota processada, a inspeção pela rota (QUALIDADE), `POST /nao-conformidades/:id/decidir`
 * pela QUALIDADE com o gate real.
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa75-inspecao-libera-reserva.md
 *
 * Executar: cd server && node tests/api/ncReservaLiberacao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Faturista 75', role: 'admin', is_superadmin: 1, email: 'fat75@t.com' };
const SOL = { id: 7501, nome: 'Solicitante 75', role: 'admin', is_superadmin: 1, email: 's75@t.com' };
const APR = { id: 7502, nome: 'Aprovador 75', role: 'admin', is_superadmin: 1, email: 'a75@t.com' };
const QUALIDADE = { id: 7503, nome: 'Inspetora 75', perfil_almoxarifado: 'QUALIDADE', email: 'q75@t.com' };
const API = '/api/almoxarifado';
const EM_ESPERA = ['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'];
let seq = 0;

(async () => {
  console.log('\n=== Etapa 75 (T2): a NC que aceita também reserva ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('F75N','75000000000375','ativo')")).lastID;
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };
  const capturarWarn = async (fn) => {
    const orig = console.warn; const msgs = [];
    console.warn = (...a) => { msgs.push(a.join(' ')); };
    try { return { r: await fn(), msgs }; } finally { console.warn = orig; }
  };

  const material = async () => {
    const c = `E75N-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', 0, 0, 1, ?, 1)`, [c, `Mat ${c}`, forn])).lastID;
  };
  const entradaManual = async (m, q) => {
    const e = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'setup 75' });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
  };
  const criarReq = async (itens) => {
    const r = await as(SOL, () => request(app).post(`${API}/requisicoes`)
      .send({ itens: itens.map(([material_id, quantidade]) => ({ material_id, quantidade })) }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const aprovar = async (id) => {
    const r = await as(APR, () => request(app).put(`${API}/requisicoes/${id}/aprovar`).send({}));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const reqDireta = async (q, m) => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo)
      VALUES (?, ?, 'Sol direto', 'AGUARDANDO_ESTOQUE', 'NORMAL', ?, 1)`,
    [`REQ-E75N-${++seq}`, SOL.id, `2026-09-01 10:${String(seq % 60).padStart(2, '0')}:00`])).lastID;
    await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,?)', [id, m, q]);
    return id;
  };
  async function notaDireta(m, q) {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F75N', '2026-09-01', '2026-09-02', 10)`, [`REC-E75N-${++seq}`, `NF-E75N-${seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`, [r, m, q, q]);
    const p = await request(app).post(`${API}/recebimentos/${r}/processar`).send({});
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    return r;
  }
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const ativas = (reqId) => dbAll(db, "SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA' ORDER BY id", [reqId]);
  const qtdAtivas = async (reqId) => (await ativas(reqId)).map((x) => Number(x.quantidade));
  const ativasDoMaterial = (m) => dbAll(db, "SELECT * FROM reservas_material_almoxarifado WHERE material_id = ? AND status = 'ATIVA' ORDER BY id", [m]);
  const saldo = async (m) => ({ ...(await dbGet(db, `SELECT quantidade_atual q, quantidade_reservada r, quantidade_em_inspecao i,
    quantidade_bloqueada b FROM materiais_almoxarifado WHERE id = ?`, [m])) });
  const itemDe = async (reqId, m) => (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? AND material_id = ?', [reqId, m])).id;
  const numeroReq = async (id) => (await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id = ?', [id])).numero;
  const inspecionar = async (rec, m, a, r) => {
    const it = await dbGet(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? AND material_id = ?', [rec, m]);
    const res = await as(QUALIDADE, () => request(app).post(`${API}/recebimentos/itens/${it.id}/inspecionar`)
      .send({ quantidade_aprovada: a, quantidade_reprovada: r, encaminhamento: r > 0 ? 'DEVOLVER' : undefined }));
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    return res.body.id;
  };
  const ncDa = (inspecaoId) => dbGet(db, "SELECT * FROM nao_conformidades_almoxarifado WHERE referencia_tipo = 'INSPECAO' AND referencia_id = ?", [inspecaoId]);
  const decidir = (ncId, decisao) => as(QUALIDADE, () => request(app).post(`${API}/nao-conformidades/${ncId}/decidir`)
    .send({ decisao, justificativa: `teste 75 ${decisao}` }));

  // Cenario-base: R (4) espera; nota de 4 retida; inspecao 3/1 -> R ganha 3 (T1); NC aberta com 1 bloqueado.
  const cenario = async () => {
    const m = await material();
    const R = await reqDireta(4, m);
    const rec = await notaDireta(m, 4);
    const insp = await inspecionar(rec, m, 3, 1);
    assert.deepStrictEqual(await qtdAtivas(R), [3], 'premissa: a inspecao reservou os 3 aprovados (T1)');
    const nc = await ncDa(insp);
    assert.strictEqual(nc && nc.status, 'ABERTA', 'premissa: NC aberta automaticamente');
    return { m, R, rec, insp, nc };
  };

  await cfg('inspecao_material_critico', '1');
  try {
    // ══════════════ RN-04 ══════════════
    for (const decisao of ['ACEITAR_SOB_DESVIO', 'ACEITAR']) {
      // eslint-disable-next-line no-await-in-loop
      await test(`[RN-04] ${decisao}: 200, liberacao LIBERADA (resposta inalterada); o 1 liberado vai para R (TOTALMENTE), literais da NC, marca da nota; T3 aprovada depois continua sem nada`, async () => {
        const { m, R, rec, nc } = await cenario();
        const T3 = (await criarReq([[m, 3]])).id;
        const a3 = await aprovar(T3);
        assert.ok(EM_ESPERA.includes(a3.status), `T3 aprovada depois da inspecao nao leva o bloqueado: ${a3.status}`);
        assert.deepStrictEqual(await ativas(T3), []);

        const d = await decidir(nc.id, decisao);

        assert.strictEqual(d.status, 200, JSON.stringify(d.body));
        assert.deepStrictEqual(d.body.liberacao, { efeito: 'LIBERADA', quantidade: 1, material_id: m, mensagem: '1 liberado(s) do bloqueio' });
        const det = await request(app).get(`${API}/nao-conformidades/${nc.id}`);
        assert.strictEqual(det.status, 200, JSON.stringify(det.body));
        assert.deepStrictEqual(Object.keys(d.body).filter((k) => k !== 'liberacao').sort(), Object.keys(det.body).sort(),
          'D5: a resposta e a NC + liberacao, sem chave nova');
        const rs = await ativas(R);
        assert.deepStrictEqual(rs.map((x) => Number(x.quantidade)), [3, 1]);
        const nova = rs[1];
        assert.strictEqual(nova.observacoes, `Reserva na liberação da não conformidade ${nc.numero} — requisição ${await numeroReq(R)}`);
        assert.strictEqual(nova.recebimento_id, rec, 'D4: marcada com a nota');
        assert.strictEqual(nova.origem, 'REQUISICAO');
        assert.strictEqual(nova.item_requisicao_id, await itemDe(R, m));
        assert.strictEqual(nova.solicitante_id, QUALIDADE.id, 'D6: o dono e quem decidiu a NC');
        const mov = await dbGet(db, "SELECT motivo FROM movimentacoes_almoxarifado WHERE tipo = 'RESERVA' AND reserva_id = ?", [nova.id]);
        assert.strictEqual(mov.motivo, `Reserva na liberação da não conformidade ${nc.numero}`);
        assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA');
        assert.deepStrictEqual(await ativas(T3), [], 'quem foi aprovado depois continua sem nada');
        assert.deepStrictEqual(await saldo(m), { q: 4, r: 4, i: 0, b: 0 });
      });
    }

    // Negativas: as quatro decisoes que nao liberam. Saldo livre de ajuste presente: se algo reservasse, havia o que.
    for (const decisao of ['DEVOLVER', 'SUCATEAR', 'SUBSTITUICAO', 'ANALISE_ENGENHARIA']) {
      // eslint-disable-next-line no-await-in-loop
      await test(`[RN-04] ${decisao}: 200, nada liberado, nenhuma reserva nova (com saldo livre de ajuste presente)`, async () => {
        const { m, R, nc } = await cenario();
        await entradaManual(m, 2);
        const d = await decidir(nc.id, decisao);
        assert.strictEqual(d.status, 200, JSON.stringify(d.body));
        assert.notStrictEqual(d.body.liberacao.efeito, 'LIBERADA');
        assert.deepStrictEqual(await qtdAtivas(R), [3]);
        assert.strictEqual((await saldo(m)).b, 1);
      });
    }

    await test('[RN-04] NC aceita DEPOIS de desbloqueio avulso: efeito SEM_BLOQUEIO, nenhuma reserva (o avulso ja soltou o material, e a NC nao distribui saldo livre)', async () => {
      const m = await material();
      const R = await reqDireta(2, m);
      const rec = await notaDireta(m, 2);
      const insp = await inspecionar(rec, m, 0, 2);
      const nc = await ncDa(insp);
      const av = await request(app).post(`${API}/materiais/${m}/desbloquear`).send({ quantidade: 2, justificativa: 'avulso 75' });
      assert.strictEqual(av.status, 200, JSON.stringify(av.body));
      assert.deepStrictEqual(await ativasDoMaterial(m), [], 'premissa: o avulso nao reserva (RN-11)');
      const d = await decidir(nc.id, 'ACEITAR');
      assert.strictEqual(d.status, 200, JSON.stringify(d.body));
      assert.strictEqual(d.body.liberacao.efeito, 'SEM_BLOQUEIO');
      assert.deepStrictEqual(await ativasDoMaterial(m), []);
      assert.strictEqual(await st(R), 'AGUARDANDO_ESTOQUE');
    });

    // ══════════════ RN-06 (NC) ══════════════
    await test('[RN-06] criarReserva lancando: 200 DECIDIDA, LIBERADA, saldo desbloqueado, nenhuma reserva nova, warn por item com o numero da NC', async () => {
      const { m, R, nc } = await cenario();
      const original = stockService.criarReserva;
      stockService.criarReserva = async () => { throw new Error('falha simulada 75 nc'); };
      let res;
      try { res = await capturarWarn(() => decidir(nc.id, 'ACEITAR')); } finally { stockService.criarReserva = original; }
      assert.strictEqual(res.r.status, 200, JSON.stringify(res.r.body));
      assert.strictEqual(res.r.body.status, 'DECIDIDA');
      assert.strictEqual(res.r.body.liberacao.efeito, 'LIBERADA');
      assert.deepStrictEqual(await saldo(m), { q: 4, r: 3, i: 0, b: 0 });
      assert.deepStrictEqual(await qtdAtivas(R), [3]);
      const esperado = `[almoxarifado-reservas] Falha ao reservar na liberação da não conformidade ${nc.numero} o item ${await itemDe(R, m)} da requisição ${R}: falha simulada 75 nc`;
      assert.ok(res.msgs.includes(esperado), JSON.stringify(res.msgs));
    });

    await test('[RN-06] falha que ESCAPA do laco (compararPrioridade lancando): 200 DECIDIDA, LIBERADA, warn do contrato com a origem e o id da NC', async () => {
      const { m, nc } = await cenario();
      await reqDireta(2, m); // duas candidatas: com uma so, o sort nao chama o comparador
      const original = requisitionService.compararPrioridade;
      requisitionService.compararPrioridade = () => { throw new Error('ordem quebrou 75 nc'); };
      let res;
      try { res = await capturarWarn(() => decidir(nc.id, 'ACEITAR_SOB_DESVIO')); } finally { requisitionService.compararPrioridade = original; }
      assert.strictEqual(res.r.status, 200, JSON.stringify(res.r.body));
      assert.strictEqual(res.r.body.status, 'DECIDIDA');
      assert.strictEqual(res.r.body.liberacao.efeito, 'LIBERADA');
      assert.strictEqual((await saldo(m)).b, 0);
      assert.ok(res.msgs.includes(`[almoxarifado-reservas] reserva na liberacao falhou (NAO_CONFORMIDADE ${nc.id}): ordem quebrou 75 nc`),
        JSON.stringify(res.msgs));
    });

    // ══════════════ RN-07 (NC) ══════════════
    await test('[RN-07] decidir a NC de novo: 409 "Esta nao conformidade ja foi encerrada" e nenhuma reserva nova', async () => {
      const { m, R, nc } = await cenario();
      assert.strictEqual((await decidir(nc.id, 'ACEITAR')).status, 200);
      assert.deepStrictEqual(await qtdAtivas(R), [3, 1]);
      await reqDireta(5, m);
      await entradaManual(m, 3); // ha quem espere e o que reservar, se o gancho rodasse de novo
      const d2 = await decidir(nc.id, 'ACEITAR');
      assert.strictEqual(d2.status, 409);
      assert.strictEqual(d2.body.error, 'Esta não conformidade já foi encerrada');
      assert.strictEqual((await ativasDoMaterial(m)).length, 2);
    });
  } finally { await cfg('inspecao_material_critico', '0'); }

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
