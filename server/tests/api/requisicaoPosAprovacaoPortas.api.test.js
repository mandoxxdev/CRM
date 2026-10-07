/**
 * Etapa 73, Task 2 (RN-05, RN-06; D3/B359, D4/B360, D5/B361) — as tres portas de aprovacao com o
 * mesmo pos-aprovacao.
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa73-requisicao-espera-compra.md (T2 e a
 * secao "Fase 2 — revisao do plano", que prevalece).
 *
 * Os defeitos (Fase 0, sonda73-requisicao C1/C2 e Surpresas 2 e 3):
 *  - a liberacao por valor (`PUT /aprovar-valor`) sem nada reservado ficava APROVADO mesmo sem saldo
 *    nenhum — nunca AGUARDANDO_COMPRA/AGUARDANDO_ESTOQUE;
 *  - a aprovacao automatica (`POST /requisicoes` e `POST /requisicoes/:id/enviar` com a config
 *    `aprovacao_automatica = '1'`) gravava APROVADO direto: sem reservar nada com saldo, e sem
 *    calcular AGUARDANDO_* sem saldo.
 * Agora as tres portas passam por `requisitionService.prepararPosAprovacao` (status calculado ANTES de
 * reservar + reserva) e, perdendo o UPDATE guardado, por `desfazerReservas`.
 *
 * Pelas ROTAS: RN-05 (valor, com compra a caminho / sem nada / com saldo / UPDATE guardado perdido),
 * RN-06 (POST e /enviar, com saldo / compra / nada; negativas CRITICO e regra com pendencia, que nao
 * podem criar reserva nenhuma; dois /enviar simultaneos sem reserva orfa). Pelo SERVICO:
 * prepararPosAprovacao e desfazerReservas direto.
 *
 * Executar: cd server && node tests/api/requisicaoPosAprovacaoPortas.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// O solicitante e chao de fabrica (sem perfil -> PRODUCAO): e quem cria/envia, e a reserva da
// aprovacao automatica fica no nome dele (D5/B361).
const SOL = { id: 7321, nome: 'Solicitante E73T2', email: 'e73t2s@test.com' };
const APR = { id: 7322, nome: 'Aprovador E73T2', role: 'admin', is_superadmin: 1, email: 'e73t2a@test.com' };
const BIA = { id: 7323, nome: 'Bia E73T2', email: 'e73t2b@test.com', perfil_almoxarifado: 'GESTOR' };

(async () => {
  console.log('\n=== Etapa 73 Task 2: as tres portas de aprovacao com o mesmo pos-aprovacao ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...APR } });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...APR }); } };
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const u of [SOL, APR, BIA]) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [u.id, u.nome, u.email]);
  }
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn E73T2','73200000000173','ativo')")).lastID;
  const setConfig = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

  let seq = 0;
  /** Material com `saldo` entrado pelo motor (v2), `custo` unitario e `minimo`. */
  const material = async ({ saldo = 0, custo = 1, minimo = 0, critico = 0 } = {}) => {
    seq += 1;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, custo_unitario, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'UN', 0, ?, 0, ?, 1, ?, ?)`, [`E73T2-M${seq}`, `Mat E73T2 ${seq}`, minimo, custo, forn, critico])).lastID;
    if (saldo > 0) {
      const e = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: id, tipo: 'ENTRADA', quantidade: saldo, motivo: 'setup' });
      assert.strictEqual(e.status, 201, JSON.stringify(e.body));
    }
    return id;
  };
  const disponivel = async (m) => Number((await dbGet(db,
    'SELECT quantidade_atual - COALESCE(quantidade_reservada,0) AS d FROM materiais_almoxarifado WHERE id = ?', [m])).d);
  const statusDe = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const reservasDe = async (id) => dbAll(db,
    'SELECT quantidade, status, solicitante_id, origem FROM reservas_material_almoxarifado WHERE requisicao_id = ? ORDER BY id', [id]);
  const ativas = async (id) => (await reservasDe(id)).filter((r) => r.status === 'ATIVA');

  /** Compra a caminho do material: verificar-minimos abre a solicitacao e o comprador gera o pedido. */
  const compraVinculada = async (m) => {
    const v = await request(app).post('/api/almoxarifado/compras/verificar-minimos').send({});
    assert.strictEqual(v.status, 200, JSON.stringify(v.body));
    const c = v.body.criadas.find((x) => x.material_id === m);
    assert.ok(c, `premissa: solicitacao do material ${m}`);
    const p = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn, status: 'pendente', solicitacao_id: c.solicitacao_id,
      itens: [{ material_id: m, quantidade: 10, valor_unitario: 1 }],
    });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    const s = await dbGet(db, 'SELECT status FROM solicitacoes_compra_almoxarifado WHERE id = ?', [c.solicitacao_id]);
    assert.strictEqual(s.status, 'VINCULADO', 'premissa: solicitacao vinculada ao pedido');
  };
  const criar = async (itens, extra = {}) => as(SOL, async () => {
    const r = await request(app).post('/api/almoxarifado/requisicoes')
      .send({ os_referencia: 'OS-INT', itens: itens.map(([material_id, quantidade]) => ({ material_id, quantidade })), ...extra });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  });
  const enviar = async (id) => as(SOL, () => request(app).post(`/api/almoxarifado/requisicoes/${id}/enviar`).send({}));

  // ══════════════ RN-05 — liberacao por valor ══════════════
  await setConfig('liberacao_valor_ativo', '1');
  await setConfig('liberacao_valor_limite', '100');
  await setConfig('liberacao_valor_aprovadores', JSON.stringify([APR.id]));
  /** Requisicao de valor alto (custo 100 x 2 = 200 > 100) parada na liberacao, pela rota de criacao. */
  const valorAlto = async (m, qtd = 2) => {
    const r = await criar([[m, qtd]]);
    assert.strictEqual(r.status, 'AGUARDANDO_APROVACAO_VALOR', `premissa: valor alto: ${JSON.stringify(r)}`);
    return r.id;
  };
  const aprovarValor = async (id) => as(APR, async () => {
    const r = await request(app).put(`/api/almoxarifado/requisicoes/${id}/aprovar-valor`).send({});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  });

  await test('[RN-05] valor alto sem saldo, compra vinculada a caminho -> /aprovar-valor: resposta e banco AGUARDANDO_COMPRA, reservas []', async () => {
    const m = await material({ custo: 100, minimo: 10 });
    await compraVinculada(m);
    const id = await valorAlto(m);
    const r = await aprovarValor(id);
    assert.strictEqual(r.status, 'AGUARDANDO_COMPRA', `a liberacao por valor sem saldo dizia ${JSON.stringify(r)}`);
    assert.deepStrictEqual(r.reservas, []);
    assert.strictEqual(await statusDe(id), 'AGUARDANDO_COMPRA');
    assert.deepStrictEqual(await reservasDe(id), []);
    const aud = await dbGet(db, `SELECT dados_novos FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ?
      AND acao = 'APROVACAO_VALOR' ORDER BY id DESC LIMIT 1`, [id]);
    assert.ok(aud, 'auditoria APROVACAO_VALOR');
    assert.strictEqual(JSON.parse(aud.dados_novos).status, 'AGUARDANDO_COMPRA', `auditoria grava o status gravado: ${aud.dados_novos}`);
    const row = await dbGet(db, 'SELECT aprovador_valor_id FROM requisicoes_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(row.aprovador_valor_id, APR.id, 'o servico continua gravando quem liberou');
  });

  await test('[RN-05] valor alto sem saldo e sem compra -> AGUARDANDO_ESTOQUE', async () => {
    const m = await material({ custo: 100 });
    const id = await valorAlto(m);
    const r = await aprovarValor(id);
    assert.strictEqual(r.status, 'AGUARDANDO_ESTOQUE', JSON.stringify(r));
    assert.strictEqual(await statusDe(id), 'AGUARDANDO_ESTOQUE');
  });

  await test('[RN-05 positiva] valor alto com saldo -> TOTALMENTE_RESERVADA como antes, reserva de 2', async () => {
    const m = await material({ custo: 100, saldo: 5 });
    const id = await valorAlto(m);
    const r = await aprovarValor(id);
    assert.strictEqual(r.status, 'TOTALMENTE_RESERVADA', JSON.stringify(r));
    assert.strictEqual(await statusDe(id), 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual((await ativas(id)).map((x) => Number(x.quantidade)), [2]);
    assert.strictEqual(await disponivel(m), 3);
  });

  await test('[RN-05 Fase 2] alguem muda a requisicao entre a liberacao e o UPDATE guardado: desfaz as reservas e responde o status RELIDO', async () => {
    const m = await material({ custo: 100, saldo: 5 });
    const id = await valorAlto(m);
    const original = requisitionService.prepararPosAprovacao;
    requisitionService.prepararPosAprovacao = async (...args) => {
      const pos = await original(...args);
      // o "outro" que mexeu no meio: cancela a requisicao (o UPDATE guardado tem de perder)
      await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'CANCELADO' WHERE id = ?", [id]);
      return pos;
    };
    let r;
    try { r = await aprovarValor(id); } finally { requisitionService.prepararPosAprovacao = original; }
    assert.strictEqual(r.status, 'CANCELADO', `responde o status relido, nao o calculado: ${JSON.stringify(r)}`);
    assert.deepStrictEqual(r.reservas, []);
    assert.strictEqual(await statusDe(id), 'CANCELADO', 'o UPDATE guardado nao sobrescreveu quem mexeu no meio');
    assert.deepStrictEqual(await ativas(id), [], 'reserva orfa: o UPDATE perdeu e o hold ficou');
    assert.strictEqual(await disponivel(m), 5);
  });
  await setConfig('liberacao_valor_ativo', '0');

  // ══════════════ RN-06 — aprovacao automatica reserva e calcula ══════════════
  await setConfig('aprovacao_automatica', '1');

  await test('[RN-06 POST] saldo 5, pede 2 -> 201 TOTALMENTE_RESERVADA/automatica, reserva ATIVA de 2 no nome do solicitante, disponivel 3', async () => {
    const m = await material({ saldo: 5 });
    const r = await criar([[m, 2]]);
    assert.strictEqual(r.status, 'TOTALMENTE_RESERVADA', `C122: ${JSON.stringify(r)}`);
    assert.strictEqual(r.aprovacao, 'automatica');
    const row = await dbGet(db, 'SELECT status, aprovador_nome, data_aprovacao FROM requisicoes_almoxarifado WHERE id = ?', [r.id]);
    assert.strictEqual(row.status, 'TOTALMENTE_RESERVADA', 'resposta = banco');
    assert.strictEqual(row.aprovador_nome, 'Sistema (automático)');
    assert.ok(row.data_aprovacao, 'data_aprovacao gravada');
    const rs = await ativas(r.id);
    assert.strictEqual(rs.length, 1, JSON.stringify(rs));
    assert.strictEqual(Number(rs[0].quantidade), 2);
    assert.strictEqual(rs[0].origem, 'REQUISICAO');
    assert.strictEqual(Number(rs[0].solicitante_id), SOL.id, 'D5: a reserva fica no nome de quem criou');
    assert.strictEqual(await disponivel(m), 3);
  });

  await test('[RN-06 POST] sem saldo com compra a caminho -> AGUARDANDO_COMPRA; sem nada -> AGUARDANDO_ESTOQUE; sem reserva', async () => {
    const mC = await material({ minimo: 10 });
    await compraVinculada(mC);
    const rc = await criar([[mC, 2]]);
    assert.strictEqual(rc.status, 'AGUARDANDO_COMPRA', JSON.stringify(rc));
    assert.strictEqual(rc.aprovacao, 'automatica');
    assert.strictEqual(await statusDe(rc.id), 'AGUARDANDO_COMPRA');
    const mE = await material();
    const re = await criar([[mE, 2]]);
    assert.strictEqual(re.status, 'AGUARDANDO_ESTOQUE', JSON.stringify(re));
    assert.strictEqual(await statusDe(re.id), 'AGUARDANDO_ESTOQUE');
    assert.deepStrictEqual([...(await reservasDe(rc.id)), ...(await reservasDe(re.id))], []);
  });

  await test('[RN-06 /enviar] rascunho com saldo -> TOTALMENTE_RESERVADA/automatica com reserva; rascunho sem saldo -> AGUARDANDO_ESTOQUE', async () => {
    const m = await material({ saldo: 5 });
    const rasc = await criar([[m, 2]], { salvar_rascunho: true });
    assert.strictEqual(rasc.status, 'RASCUNHO');
    assert.deepStrictEqual(await reservasDe(rasc.id), [], 'rascunho nao reserva');
    const env = await enviar(rasc.id);
    assert.strictEqual(env.status, 200, JSON.stringify(env.body));
    assert.strictEqual(env.body.status, 'TOTALMENTE_RESERVADA', JSON.stringify(env.body));
    assert.strictEqual(env.body.aprovacao, 'automatica');
    assert.strictEqual(await statusDe(rasc.id), 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual((await ativas(rasc.id)).map((x) => Number(x.quantidade)), [2]);
    assert.strictEqual(await disponivel(m), 3);

    const mSem = await material();
    const r2 = await criar([[mSem, 1]], { salvar_rascunho: true });
    const env2 = await enviar(r2.id);
    assert.strictEqual(env2.body.status, 'AGUARDANDO_ESTOQUE', JSON.stringify(env2.body));
    assert.strictEqual(await statusDe(r2.id), 'AGUARDANDO_ESTOQUE');
  });

  await test('[RN-06 negativa] urgencia CRITICO -> PENDENTE, nenhuma reserva', async () => {
    const m = await material({ saldo: 5 });
    const r = await criar([[m, 2]], { urgencia: 'CRITICO', justificativa_urgencia: 'linha parada' });
    assert.strictEqual(r.status, 'PENDENTE', JSON.stringify(r));
    assert.strictEqual(r.aprovacao, undefined);
    assert.deepStrictEqual(await reservasDe(r.id), []);
    assert.strictEqual(await disponivel(m), 5);
  });

  await test('[RN-06 negativa] regra de aprovacao casada (pendencia aberta) -> PENDENTE e NENHUMA linha de reserva da requisicao', async () => {
    const fam = await request(app).post('/api/almoxarifado/familias').send({ codigo: 'E73T2F', nome: 'Familia E73T2' });
    assert.strictEqual(fam.status, 201, JSON.stringify(fam.body));
    const rc = await request(app).post('/api/almoxarifado/regras-aprovacao')
      .send({ nome: 'Material crítico E73T2', material_critico: true, aprovadores: [BIA.id] });
    assert.strictEqual(rc.status, 201, JSON.stringify(rc.body));
    try {
      const m = await material({ saldo: 100, critico: 1 });
      const r = await criar([[m, 1]]);
      assert.strictEqual(r.status, 'PENDENTE', JSON.stringify(r));
      assert.strictEqual(r.aprovacao, undefined);
      const pend = await dbAll(db, "SELECT status FROM requisicao_aprovacoes_regra WHERE requisicao_id = ? AND status = 'ABERTA'", [r.id]);
      assert.strictEqual(pend.length, 1, `premissa: pendencia aberta: ${JSON.stringify(pend)}`);
      // nem ATIVA nem LIBERADA: a pre-checagem vem ANTES de reservar (sem ela, reservaria e desfaria)
      assert.deepStrictEqual(await reservasDe(r.id), [], 'a aprovacao automatica recusada criou reserva');
      assert.strictEqual(await disponivel(m), 100);
      // metade positiva no mesmo arranjo: material comum aprova sozinho e reserva
      const m2 = await material({ saldo: 3 });
      const r2 = await criar([[m2, 1]]);
      assert.strictEqual(r2.status, 'TOTALMENTE_RESERVADA', JSON.stringify(r2));
    } finally {
      await dbRun(db, 'UPDATE regras_aprovacao SET ativo = 0 WHERE id = ?', [rc.body.id]);
    }
  });

  await test('[RN-06 corrida] dois /enviar simultaneos do mesmo rascunho: um aprova, nenhuma reserva orfa, disponivel desconta uma vez', async () => {
    let corridas = 0;
    for (let k = 0; k < 6; k++) {
      // eslint-disable-next-line no-await-in-loop
      const m = await material({ saldo: 5 });
      // eslint-disable-next-line no-await-in-loop
      const rasc = await criar([[m, 2]], { salvar_rascunho: true });
      setUser({ ...SOL });
      // eslint-disable-next-line no-await-in-loop
      const [a, b] = await Promise.all([
        request(app).post(`/api/almoxarifado/requisicoes/${rasc.id}/enviar`).send({}),
        request(app).post(`/api/almoxarifado/requisicoes/${rasc.id}/enviar`).send({}),
      ]);
      setUser({ ...APR });
      if (a.status === 200 && b.status === 200) corridas += 1;
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual(await statusDe(rasc.id), 'TOTALMENTE_RESERVADA', `${JSON.stringify(a.body)} / ${JSON.stringify(b.body)}`);
      // eslint-disable-next-line no-await-in-loop
      const rs = await ativas(rasc.id);
      assert.deepStrictEqual(rs.map((x) => Number(x.quantidade)), [2], `rodada ${k + 1}: reservas ativas ${JSON.stringify(rs)}`);
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual(await disponivel(m), 3, `rodada ${k + 1}: o saldo ficou preso em dobro`);
    }
    console.log(`    (rodadas em que os dois /enviar passaram do gate do rascunho: ${corridas} de 6)`);
    assert.ok(corridas > 0, 'nenhuma rodada produziu a corrida - o cenario nao prova o desfazer');
  });
  await setConfig('aprovacao_automatica', '0');

  // ══════════════ pelo SERVICO ══════════════
  await test('[servico] prepararPosAprovacao calcula ANTES de reservar e desfazerReservas solta o hold', async () => {
    const m = await material({ saldo: 4 });
    const mSem = await material();
    const num = `REQ-E73T2-S${Date.now() % 100000}`;
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, ?, 'S', 'PENDENTE')`, [num, SOL.id])).lastID;
    await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?, ?, 4)', [id, m]);
    const row = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [id]);
    const pos = await requisitionService.prepararPosAprovacao(db, id, { ...SOL }, row);
    // se calculasse DEPOIS de reservar, o disponivel ja seria 0 e diria AGUARDANDO_ESTOQUE
    assert.strictEqual(pos.status, 'TOTALMENTE_RESERVADA', JSON.stringify(pos));
    assert.strictEqual(pos.reservas.length, 1);
    assert.strictEqual(await disponivel(m), 0);
    await requisitionService.desfazerReservas(db, { ...SOL }, pos.reservas);
    assert.deepStrictEqual((await reservasDe(id)).map((x) => x.status), ['LIBERADA']);
    assert.strictEqual(await disponivel(m), 4);

    const id2 = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, ?, 'S', 'PENDENTE')`, [`${num}b`, SOL.id])).lastID;
    await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?, ?, 1)', [id2, mSem]);
    const pos2 = await requisitionService.prepararPosAprovacao(db, id2, { ...SOL },
      await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [id2]));
    assert.deepStrictEqual(pos2, { status: 'AGUARDANDO_ESTOQUE', reservas: [] });
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
