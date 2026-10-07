/**
 * Etapa 73, Task 4 (integracao: T1 x T2 x T3 pelo contrato) — a jornada de quem espera compra.
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa73-requisicao-espera-compra.md (T4; a
 * secao "Fase 2 — revisao do plano" prevalece).
 *
 * TUDO PELAS ROTAS, como o almoxarife e o comprador fazem:
 *  - material sem saldo com minimo -> `verificar-minimos` abre a solicitacao -> o comprador gera o
 *    pedido (`POST /api/compras/pedidos` com `solicitacao_id`; a solicitacao fica VINCULADO);
 *  - tres requisicoes do mesmo material, cada uma por uma PORTA de aprovacao: R1 pelo `PUT /aprovar`,
 *    R2 (valor alto) pelo `PUT /aprovar-valor`, R3 pelo `POST /enviar` do rascunho com a aprovacao
 *    automatica ligada -> as tres AGUARDANDO_COMPRA (T1: VINCULADO a caminho conta; T2: as tres portas
 *    calculam igual), resposta = banco;
 *  - nota parcial (4 de 10) pelas seis portas do recebimento -> ETAPA 74: a chegada reserva para quem
 *    esperava, na ordem da fila, e o status acompanha (a RN-08/B358 da 73, "o status NAO muda", foi
 *    REVOGADA pela 74 — ver a jornada 2); a fila
 *    de separacao mostra SEPARAR com `separavel` > 0 para quem ganhou reserva, e o detalhe traz por item o que o banner da T3 le
 *    (`saldo_atual` > 0, `quantidade_solicitada`, `quantidade_separada`, `material_id`,
 *    `material_nome`, `unidade`), com os itens na ordem do pedido (T0);
 *  - separar -> entregar; a nota do resto fecha a solicitacao (RECEBIDA); a requisicao seguinte sem
 *    saldo vai a AGUARDANDO_ESTOQUE (nada mais vem);
 *  - com saldo, a aprovacao automatica reserva (TOTALMENTE_RESERVADA), responde o status gravado e o
 *    disponivel cai (C122).
 * Metade positiva: pedido CANCELADO com a solicitacao ainda VINCULADO -> as tres portas dao
 * AGUARDANDO_ESTOQUE.
 *
 * Datas: nada de "hoje" do JS — o SQLite responde.
 *
 * Executar: cd server && node tests/api/requisicaoEsperaCompraIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// Solicitante chao de fabrica (sem perfil -> PRODUCAO); aprovador/almoxarife admin (segregacao do /aprovar).
const SOL = { id: 7341, nome: 'Solicitante E73T4', email: 'e73t4s@test.com' };
const APR = { id: 7342, nome: 'Aprovador E73T4', role: 'admin', is_superadmin: 1, email: 'e73t4a@test.com' };

(async () => {
  console.log('\n=== Etapa 73 Task 4: a jornada de quem espera compra (integracao) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...APR } });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...APR }); } };
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const u of [SOL, APR]) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [u.id, u.nome, u.email]);
  }
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn E73T4','73400000000173','ativo')")).lastID;
  const setConfig = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

  let seq = 0;
  /** Material com `saldo` entrado pelo motor (v2), custo 10 e `minimo`. */
  const material = async ({ saldo = 0, minimo = 0 } = {}) => {
    seq += 1;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, custo_unitario, ativo, fornecedor_id)
      VALUES (?, ?, 'PC', 0, ?, 0, 10, 1, ?)`, [`E73T4-M${seq}`, `Mat E73T4 ${seq}`, minimo, forn])).lastID;
    if (saldo > 0) {
      const e = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: id, tipo: 'ENTRADA', quantidade: saldo, motivo: 'setup' });
      assert.strictEqual(e.status, 201, JSON.stringify(e.body));
    }
    return id;
  };
  const disponivel = async (m) => Number((await dbGet(db,
    'SELECT quantidade_atual - COALESCE(quantidade_reservada,0) AS d FROM materiais_almoxarifado WHERE id = ?', [m])).d);
  const statusDe = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const statusSolicitacao = async (id) => (await dbGet(db, 'SELECT status FROM solicitacoes_compra_almoxarifado WHERE id = ?', [id])).status;
  const ativas = async (id) => dbAll(db,
    "SELECT quantidade, solicitante_id FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA' ORDER BY id", [id]);

  /** verificar-minimos abre a solicitacao e o comprador gera o pedido de `quantidade` (VINCULADO). */
  const compraVinculada = async (m, quantidade = 10) => {
    const v = await request(app).post('/api/almoxarifado/compras/verificar-minimos').send({});
    assert.strictEqual(v.status, 200, JSON.stringify(v.body));
    const c = v.body.criadas.find((x) => x.material_id === m);
    assert.ok(c, `premissa: o verificar-minimos abriu a solicitacao do material ${m}: ${JSON.stringify(v.body.criadas)}`);
    const p = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn, status: 'pendente', solicitacao_id: c.solicitacao_id,
      itens: [{ material_id: m, quantidade, valor_unitario: 1 }],
    });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    assert.strictEqual(await statusSolicitacao(c.solicitacao_id), 'VINCULADO', 'premissa: o pedido vinculou a solicitacao');
    const linha = (await dbGet(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ?', [p.body.id])).id;
    return { solicitacao: c.solicitacao_id, pedido: { id: p.body.id, linha } };
  };

  let nf = 0;
  /** A nota pelas seis portas: criar -> conferir -> encaminhar/finalizar/faturar -> fiscal -> processar. */
  const receber = async (pedido, materialId, quantidade) => {
    nf += 1;
    const { d } = await dbGet(db, "SELECT date('now', '-1 day') AS d");
    const itens = [{ material_id: materialId, pedido_item_id: pedido.linha, quantidade, quantidade_recebida: quantidade }];
    const c = await request(app).post('/api/almoxarifado/recebimentos').send({ tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, itens });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const id = c.body.id;
    const conf = await request(app).put(`/api/almoxarifado/recebimentos/${id}/conferir`).send({ itens });
    assert.strictEqual(conf.status, 200, JSON.stringify(conf.body));
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      // eslint-disable-next-line no-await-in-loop
      const r = await request(app).post(`/api/almoxarifado/recebimentos/${id}/workflow`).send({ acao });
      assert.strictEqual(r.status, 200, `${acao}: ${JSON.stringify(r.body)}`);
    }
    const f = await request(app).put(`/api/almoxarifado/recebimentos/${id}/fiscal`).send({
      nota_fiscal: `NF-E73T4-${nf}`, fornecedor_id: forn, fornecedor_nome: 'Forn E73T4',
      data_emissao_nf: d, data_entrada_nf: d, valor_total_nota: quantidade, itens,
    });
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    const p = await request(app).post(`/api/almoxarifado/recebimentos/${id}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(p.status, 200, `processar: ${JSON.stringify(p.body)}`);
  };

  const criar = async (itens, extra = {}) => as(SOL, async () => {
    const r = await request(app).post('/api/almoxarifado/requisicoes')
      .send({ os_referencia: 'OS-INT', itens: itens.map(([material_id, quantidade]) => ({ material_id, quantidade })), ...extra });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  });

  // ── as tres portas; cada uma devolve { id, status } e confere resposta = banco ──
  /** Porta 1: PUT /aprovar. */
  const porAprovar = async (itens) => {
    const cr = await criar(itens);
    assert.strictEqual(cr.status, 'PENDENTE', `premissa: criada PENDENTE: ${JSON.stringify(cr)}`);
    const r = await request(app).put(`/api/almoxarifado/requisicoes/${cr.id}/aprovar`).send({});
    assert.strictEqual(r.status, 200, `aprovar: ${JSON.stringify(r.body)}`);
    const gravado = await statusDe(cr.id);
    assert.strictEqual(r.body.status, gravado, `/aprovar: resposta ${r.body.status} x banco ${gravado}`);
    return { id: cr.id, status: gravado };
  };
  /** Porta 2: PUT /aprovar-valor (liberacao por valor ligada so durante a chamada). */
  const porValor = async (itens) => {
    await setConfig('liberacao_valor_ativo', '1');
    try {
      const cr = await criar(itens);
      assert.strictEqual(cr.status, 'AGUARDANDO_APROVACAO_VALOR', `premissa: valor alto: ${JSON.stringify(cr)}`);
      const r = await request(app).put(`/api/almoxarifado/requisicoes/${cr.id}/aprovar-valor`).send({});
      assert.strictEqual(r.status, 200, `aprovar-valor: ${JSON.stringify(r.body)}`);
      const gravado = await statusDe(cr.id);
      assert.strictEqual(r.body.status, gravado, `/aprovar-valor: resposta ${r.body.status} x banco ${gravado}`);
      return { id: cr.id, status: gravado };
    } finally { await setConfig('liberacao_valor_ativo', '0'); }
  };
  /** Porta 3: POST /enviar do rascunho com a aprovacao automatica ligada so durante a chamada. */
  const porEnvioAutomatico = async (itens) => {
    const rasc = await criar(itens, { salvar_rascunho: true });
    assert.deepStrictEqual(await ativas(rasc.id), [], 'premissa: rascunho nao reserva');
    await setConfig('aprovacao_automatica', '1');
    try {
      const r = await as(SOL, () => request(app).post(`/api/almoxarifado/requisicoes/${rasc.id}/enviar`).send({}));
      assert.strictEqual(r.status, 200, `enviar: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.aprovacao, 'automatica', `premissa: aprovacao automatica: ${JSON.stringify(r.body)}`);
      const gravado = await statusDe(rasc.id);
      assert.strictEqual(r.body.status, gravado, `/enviar automatico: resposta ${r.body.status} x banco ${gravado}`);
      return { id: rasc.id, status: gravado };
    } finally { await setConfig('aprovacao_automatica', '0'); }
  };

  // Liberacao por valor: limite 50 (custo 10 -> acima de 5 unidades e valor alto), APR libera.
  await setConfig('liberacao_valor_ativo', '0');
  await setConfig('liberacao_valor_limite', '50');
  await setConfig('liberacao_valor_aprovadores', JSON.stringify([APR.id]));
  await setConfig('aprovacao_automatica', '0');

  const detalhe = async (id) => {
    const r = await request(app).get(`/api/almoxarifado/requisicoes/${id}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const doMaterial = (det, m) => det.itens.find((i) => Number(i.material_id) === Number(m));
  const separar = async (reqId, pares) => {
    const r = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/separar`)
      .send({ itens_separados: pares.map(([item_id, quantidade_separada]) => ({ item_id, quantidade_separada })) });
    assert.strictEqual(r.status, 200, `separar ${reqId}: ${JSON.stringify(r.body)}`);
  };
  const entregar = async (reqId, pares) => {
    const r = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: pares.map(([item_id, quantidade_atendida]) => ({ item_id, quantidade_atendida })) });
    assert.strictEqual(r.status, 200, `entregar ${reqId}: ${JSON.stringify(r.body)}`);
    return r.body;
  };

  // ══════════════ A jornada ══════════════
  const j = {};
  await test('[jornada 1] compra VINCULADA a caminho: /aprovar, /aprovar-valor e /enviar automatico -> as tres AGUARDANDO_COMPRA, sem reserva', async () => {
    // mB criado ANTES de mA: id(mB) < id(mA). R1 pede [mA, mB] — a ordem do pedido nao e a ordem dos ids
    // de material, entao "itens na ordem pedida" nao pode passar por acaso de ORDER BY material.
    j.mB = await material(); // sem saldo e sem compra: so empurra a ordem
    j.mA = await material({ minimo: 10 });
    j.compra = await compraVinculada(j.mA, 10);
    j.R1 = await porAprovar([[j.mA, 3], [j.mB, 1]]);
    j.R2 = await porValor([[j.mA, 6]]); // 60 > 50
    j.R3 = await porEnvioAutomatico([[j.mA, 1]]);
    assert.deepStrictEqual([j.R1.status, j.R2.status, j.R3.status],
      ['AGUARDANDO_COMPRA', 'AGUARDANDO_COMPRA', 'AGUARDANDO_COMPRA'],
      'o mesmo fato (compra vinculada a caminho) pelas tres portas da o mesmo status');
    for (const r of [j.R1, j.R2, j.R3]) {
      // eslint-disable-next-line no-await-in-loop
      assert.deepStrictEqual(await ativas(r.id), [], `sem saldo nao ha o que reservar (${r.id})`);
    }
  });

  // Etapa 74 (C121) — a RN-08 da 73 ("a chegada nao muda o status") e REVOGADA: a nota agora reserva o que
  // entrou livre para quem esperava, na ordem da fila (as tres sao NORMAL: R1, R2, R3 pela criacao), e o
  // status acompanha (D5/B371). Antes da 74 este teste afirmava: disponivel 4 depois da nota, as tres
  // AGUARDANDO_COMPRA, as tres SEPARAR na fila e saldo_atual 4 no detalhe de cada uma — o mesmo material
  // prometido a tres requisicoes (a C121 medida na Fase 0 da 74).
  await test('[jornada 2] nota parcial (4 de 10): a chegada reserva na ordem (R1 3, R2 1, R3 nada), o status acompanha, a fila e o detalhe dizem o mesmo (Etapa 74; era "o status NAO muda")', async () => {
    assert.ok(j.R3, 'premissa: jornada 1');
    await receber(j.compra.pedido, j.mA, 4);
    assert.strictEqual(await disponivel(j.mA), 0, 'Etapa 74: os 4 que entraram ficaram reservados para quem esperava');
    assert.strictEqual(await statusSolicitacao(j.compra.solicitacao), 'VINCULADO', 'premissa: ainda faltam 6');
    const esperado = new Map([[j.R1.id, ['PARCIALMENTE_RESERVADA', 3]], [j.R2.id, ['PARCIALMENTE_RESERVADA', 1]],
      [j.R3.id, ['AGUARDANDO_COMPRA', 0]]]);
    for (const r of [j.R1, j.R2, j.R3]) {
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual(await statusDe(r.id), esperado.get(r.id)[0], `Etapa 74: o status acompanha a reserva (${r.id})`);
      // eslint-disable-next-line no-await-in-loop
      const soma = (await ativas(r.id)).reduce((s, x) => s + Number(x.quantidade), 0); // so mA tem reserva (mB sem saldo)
      assert.strictEqual(soma, esperado.get(r.id)[1], `reserva da chegada de ${r.id}`);
    }
    // A fila de separacao do almoxarife (Etapa 64): quem ganhou reserva SEPARAR; R3 espera saldo.
    const f = await request(app).get('/api/almoxarifado/fila-separacao');
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    for (const r of [j.R1, j.R2]) {
      const linha = f.body.find((x) => x.id === r.id);
      assert.ok(linha, `requisicao ${r.id} fora da fila`);
      assert.ok(linha.etapas.includes('SEPARAR'), `fila de ${r.id}: ${JSON.stringify(linha.etapas)}`);
      const it = linha.itens.find((i) => Number(i.material_id) === j.mA && i.separavel > 1e-9);
      assert.ok(it, `fila de ${r.id} sem separavel > 0: ${JSON.stringify(linha.itens)}`);
    }
    const l3 = f.body.find((x) => x.id === j.R3.id);
    assert.deepStrictEqual(l3.etapas, ['AGUARDANDO_SALDO'], 'R3 nao ganhou nada: a fila nao promete o que foi reservado');
    // O detalhe: o que o banner da T3 le, item a item — saldo_atual = livre + o hold da propria requisicao.
    for (const r of [j.R1, j.R2, j.R3]) {
      // eslint-disable-next-line no-await-in-loop
      const det = await detalhe(r.id);
      assert.strictEqual(det.status, esperado.get(r.id)[0]);
      const it = doMaterial(det, j.mA);
      assert.ok(it, `item do material ${j.mA} no detalhe de ${r.id}`);
      assert.strictEqual(Number(it.saldo_atual), esperado.get(r.id)[1], `saldo_atual do item de ${r.id}: ${JSON.stringify(it)}`);
      assert.ok(Number(it.quantidade_solicitada) > 0);
      assert.strictEqual(Number(it.quantidade_separada || 0), 0);
      assert.ok(it.material_nome && it.unidade === 'PC', `campos do banner: ${JSON.stringify(it)}`);
    }
    const d1 = await detalhe(j.R1.id);
    assert.deepStrictEqual(d1.itens.map((i) => Number(i.material_id)), [j.mA, j.mB], 'os itens voltam na ordem do pedido (T0)');
    assert.strictEqual(Number(doMaterial(d1, j.mB).saldo_atual), 0, 'o material que nao chegou segue sem saldo');
  });

  await test('[jornada 3] separar -> entregar R1 com o que chegou; a nota do resto fecha a solicitacao; R2 e R3 entregues', async () => {
    assert.ok(j.R1, 'premissa: jornada 1');
    const d1 = await detalhe(j.R1.id);
    const itA = doMaterial(d1, j.mA).id;
    await separar(j.R1.id, [[itA, 3]]);
    assert.strictEqual(await statusDe(j.R1.id), 'EM_SEPARACAO');
    const e1 = await entregar(j.R1.id, [[itA, 3]]);
    assert.ok(['PARCIALMENTE_ATENDIDA', 'ENTREGUE'].includes(e1.status), JSON.stringify(e1));
    // Etapa 74: a entrega consumiu a reserva da chegada de R1; o 1 que sobrou no fisico e o hold de R2 (era: disponivel 1).
    assert.strictEqual(await disponivel(j.mA), 0, 'a entrega baixou os 3 e o 1 restante e de R2');
    // O resto do pedido chega: 1 + 6 = 7 = o que R2 (6) e R3 (1) pedem.
    await receber(j.compra.pedido, j.mA, 6);
    assert.strictEqual(await statusSolicitacao(j.compra.solicitacao), 'RECEBIDA', 'a nota do resto fecha a solicitacao (Etapa 72)');
    // Etapa 74: a nota do resto reserva os 5 que faltam a R2 e o 1 de R3 (era: disponivel 7, livre).
    assert.strictEqual(await disponivel(j.mA), 0);
    assert.deepStrictEqual([await statusDe(j.R2.id), await statusDe(j.R3.id)], ['TOTALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA']);
    for (const [r, q] of [[j.R2, 6], [j.R3, 1]]) {
      // eslint-disable-next-line no-await-in-loop
      const it = doMaterial(await detalhe(r.id), j.mA).id;
      // eslint-disable-next-line no-await-in-loop
      await separar(r.id, [[it, q]]);
      // eslint-disable-next-line no-await-in-loop
      const e = await entregar(r.id, [[it, q]]);
      assert.strictEqual(e.status, 'ENTREGUE', JSON.stringify(e));
    }
    assert.strictEqual(await disponivel(j.mA), 0, 'premissa: o estoque que chegou foi todo consumido');
  });

  await test('[jornada 4] solicitacao RECEBIDA e saldo zero: a requisicao seguinte vai a AGUARDANDO_ESTOQUE (nada mais vem)', async () => {
    assert.strictEqual(await statusSolicitacao(j.compra.solicitacao), 'RECEBIDA', 'premissa: jornada 3');
    const vivas = await dbAll(db, "SELECT id, status FROM solicitacoes_compra_almoxarifado WHERE material_id = ? AND status IN ('PENDENTE','VINCULADO')", [j.mA]);
    assert.deepStrictEqual(vivas, [], `premissa: nenhuma outra solicitacao viva do material: ${JSON.stringify(vivas)}`);
    const r4 = await porAprovar([[j.mA, 2]]);
    assert.strictEqual(r4.status, 'AGUARDANDO_ESTOQUE');
  });

  await test('[jornada 5] com saldo, a aprovacao automatica reserva: TOTALMENTE_RESERVADA respondido = gravado, reserva no nome do solicitante, disponivel cai', async () => {
    const m = await material({ saldo: 5 });
    const r5 = await porEnvioAutomatico([[m, 2]]);
    assert.strictEqual(r5.status, 'TOTALMENTE_RESERVADA', `C122: ${JSON.stringify(r5)}`);
    const rs = await ativas(r5.id);
    assert.deepStrictEqual(rs.map((x) => Number(x.quantidade)), [2]);
    assert.strictEqual(Number(rs[0].solicitante_id), SOL.id, 'B361: a reserva fica no nome de quem enviou');
    assert.strictEqual(await disponivel(m), 3);
    const it = (await detalhe(r5.id)).itens[0];
    assert.strictEqual(Number(it.quantidade_reservada_item), 2, JSON.stringify(it));
  });

  // ══════════════ Metade positiva — pedido cancelado ══════════════
  await test('[cancelado] pedido CANCELADO com a solicitacao ainda VINCULADO: as tres portas dao AGUARDANDO_ESTOQUE', async () => {
    const m = await material({ minimo: 10 });
    const c = await compraVinculada(m, 10);
    const p = await request(app).patch(`/api/compras/pedidos/${c.pedido.id}/status`).send({ status: 'cancelado' });
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    assert.strictEqual(await statusSolicitacao(c.solicitacao), 'VINCULADO', 'premissa: cancelar o pedido nao fecha a solicitacao');
    const r = [await porAprovar([[m, 3]]), await porValor([[m, 6]]), await porEnvioAutomatico([[m, 1]])];
    assert.deepStrictEqual(r.map((x) => x.status), ['AGUARDANDO_ESTOQUE', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_ESTOQUE'],
      'pedido cancelado: nada vem, por qualquer porta');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
