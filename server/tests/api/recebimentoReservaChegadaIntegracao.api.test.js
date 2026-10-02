/**
 * Etapa 74, Task 5 (integracao: T1 x T2 x T3 x T4) — a jornada de quem espera o material que chega.
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa74-reserva-na-chegada.md (T5; a secao
 * "Fase 2 — revisao do plano" prevalece).
 *
 * TUDO PELAS ROTAS, como o almoxarife, o comprador e o faturista fazem (o unico desvio e o cenario
 * "cancelada durante", que usa um monkeypatch de `stockService.criarReserva` so como RELOGIO — o
 * cancelamento em si e pela rota `PUT /requisicoes/:id/cancelar`):
 *  - jornada: material com minimo -> `verificar-minimos` -> pedido de 10 com `solicitacao_id` -> R2
 *    (NORMAL, 3, criada ANTES) e R1 (URGENTE, 6) aprovadas -> AGUARDANDO_COMPRA -> nota de 4 pelas seis
 *    portas -> R1 fica com os 4 (a urgencia passa na frente da antiguidade) e PARCIALMENTE_RESERVADA, R2
 *    sem nada; e-mail de R1 com o reservado e a frase L1, R2 sem e-mail (nada livre) -> R3 aprovada
 *    DEPOIS nao leva (AGUARDANDO_COMPRA) -> fila: R1 SEPARAR, R2/R3 AGUARDANDO_SALDO -> o painel lista R1
 *    -> separar/entregar 4 de R1 (a entrega cita a reserva da chegada) -> nota do resto (6) -> R1 completa
 *    (2), R2 TOTALMENTE (3), R3 PARCIALMENTE (1) -> o painel lista as *_RESERVADA -> entregar R1;
 *  - estorno: nota A reservada a R1 (que separa), nota B reservada a R2 (nada separado) -> estorno de B:
 *    200, reserva LIBERADA, R2 volta a AGUARDANDO_COMPRA (o pedido reabriu) -> estorno de A: a recusa da
 *    71 (R1 ja separou) -> nova nota: R2 reservada de novo;
 *  - cancelada durante a reserva na chegada: a reserva e desfeita, nao ressuscita;
 *  - /encerrar de uma PARCIALMENTE_ATENDIDA com a reserva da chegada libera o hold;
 *  - aprovacao automatica ligada: a criada depois da nota leva so o que sobrou; painel com as duas.
 *
 * Executar: cd server && node tests/api/recebimentoReservaChegadaIntegracao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// A literal de recusa da 71 lida do CODIGO (nao reescrita aqui).
const STOCK_SRC = fs.readFileSync(path.join(__dirname, '../../services/almoxarifado/stockService.js'), 'utf8');
const RECUSA_71 = /'(Não é possível estornar: saldo disponível insuficiente \(material já consumido\))'/.exec(STOCK_SRC)[1];
// Etapa 74 Fase 5: o fisico cobre o estorno e o que falta esta RESERVADO -> a recusa diz quem segura.
const RECUSA_RESERVADO = (numeros) => `Não é possível estornar: o material está reservado para requisições (${numeros.join(', ')}) — libere as reservas antes de estornar`;
const L1 = 'O material indicado como reservado fica guardado para a sua requisição — outra requisição não pode levá-lo. A separação é feita pelo almoxarifado.';

// Solicitante chao de fabrica (sem perfil -> PRODUCAO); aprovador/almoxarife/faturista admin.
const SOL = { id: 7461, nome: 'Solicitante E74T5', email: 'e74t5s@test.com' };
const APR = { id: 7462, nome: 'Aprovador E74T5', role: 'admin', is_superadmin: 1, email: 'e74t5a@test.com' };
const API = '/api/almoxarifado';

(async () => {
  console.log('\n=== Etapa 74 Task 5: a jornada de quem espera o material que chega (integracao) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...APR } });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...APR }); } };
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const u of [SOL, APR]) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [u.id, u.nome, u.email]);
  }
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn E74T5','74500000000175','ativo')")).lastID;
  const setConfig = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
  await setConfig('liberacao_valor_ativo', '0');
  await setConfig('aprovacao_automatica', '0');

  let seq = 0;
  const material = async ({ minimo = 0 } = {}) => {
    seq += 1;
    const codigo = `E74T5-M${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, custo_unitario, ativo, fornecedor_id)
      VALUES (?, ?, 'PC', 0, ?, 0, 10, 1, ?)`, [codigo, `Mat E74T5 ${seq}`, minimo, forn])).lastID;
    return { id, codigo, nome: `Mat E74T5 ${seq}` };
  };
  const mat = async (m) => ({ ...(await dbGet(db, `SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r,
    quantidade_atual - COALESCE(quantidade_reservada,0) d FROM materiais_almoxarifado WHERE id = ?`, [m])) });
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const stSol = async (id) => (await dbGet(db, 'SELECT status FROM solicitacoes_compra_almoxarifado WHERE id = ?', [id])).status;
  const reservas = (reqId) => dbAll(db, `SELECT id, quantidade, quantidade_utilizada, status, origem, motivo_liberacao, recebimento_id
    FROM reservas_material_almoxarifado WHERE requisicao_id = ? ORDER BY id`, [reqId]);
  const holdAtivo = async (reqId) => (await reservas(reqId)).filter((r) => r.status === 'ATIVA')
    .reduce((s, r) => s + Number(r.quantidade) - Number(r.quantidade_utilizada || 0), 0);
  const itemDe = async (reqId) => (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [reqId])).id;

  const compraVinculada = async (m, quantidade) => {
    const v = await request(app).post(`${API}/compras/verificar-minimos`).send({});
    assert.strictEqual(v.status, 200, JSON.stringify(v.body));
    const c = v.body.criadas.find((x) => x.material_id === m);
    assert.ok(c, `premissa: o verificar-minimos abriu a solicitacao do material ${m}: ${JSON.stringify(v.body.criadas)}`);
    const p = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn, status: 'pendente', solicitacao_id: c.solicitacao_id,
      itens: [{ material_id: m, quantidade, valor_unitario: 1 }],
    });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    assert.strictEqual(await stSol(c.solicitacao_id), 'VINCULADO', 'premissa: o pedido vinculou a solicitacao');
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
  /** A nota pelas seis portas: criar -> conferir -> encaminhar/finalizar/faturar -> fiscal -> processar. */
  const receber = async (pedido, m, quantidade) => {
    nf += 1;
    const { d } = await dbGet(db, "SELECT date('now', '-1 day') AS d");
    const itens = [{ material_id: m, pedido_item_id: pedido.linha, quantidade, quantidade_recebida: quantidade }];
    const c = await request(app).post(`${API}/recebimentos`).send({ tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, itens });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const id = c.body.id;
    const conf = await request(app).put(`${API}/recebimentos/${id}/conferir`).send({ itens });
    assert.strictEqual(conf.status, 200, JSON.stringify(conf.body));
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      // eslint-disable-next-line no-await-in-loop
      const r = await request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao });
      assert.strictEqual(r.status, 200, `${acao}: ${JSON.stringify(r.body)}`);
    }
    const f = await request(app).put(`${API}/recebimentos/${id}/fiscal`).send({
      nota_fiscal: `NF-E74T5-${nf}`, fornecedor_id: forn, fornecedor_nome: 'Forn E74T5',
      data_emissao_nf: d, data_entrada_nf: d, valor_total_nota: quantidade, itens,
    });
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    const p = await request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(p.status, 200, `processar: ${JSON.stringify(p.body)}`);
    const mov = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE recebimento_id = ? AND tipo = 'ENTRADA_COMPRA'", [id]);
    return { rec: id, mov: mov && mov.id };
  };

  /** Cria (como o solicitante) e devolve o corpo; `urgente` exige justificativa. */
  const criar = async (itens, { urgencia } = {}) => as(SOL, async () => {
    const extra = urgencia ? { urgencia, justificativa_urgencia: 'linha parada e74t5' } : {};
    const r = await request(app).post(`${API}/requisicoes`)
      .send({ ...extra, itens: itens.map(([material_id, quantidade]) => ({ material_id, quantidade })) });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  });
  /** Cria e aprova pelo `PUT /aprovar`; confere resposta = banco. */
  const aprovada = async (itens, opts) => {
    const cr = await criar(itens, opts);
    assert.strictEqual(cr.status, 'PENDENTE', `premissa: criada PENDENTE: ${JSON.stringify(cr)}`);
    const r = await request(app).put(`${API}/requisicoes/${cr.id}/aprovar`).send({});
    assert.strictEqual(r.status, 200, `aprovar: ${JSON.stringify(r.body)}`);
    const gravado = await st(cr.id);
    assert.strictEqual(r.body.status, gravado, `/aprovar: resposta ${r.body.status} x banco ${gravado}`);
    return { id: cr.id, numero: cr.numero, status: gravado };
  };
  const separar = async (reqId, pares) => {
    const r = await request(app).put(`${API}/requisicoes/${reqId}/separar`)
      .send({ itens_separados: pares.map(([item_id, quantidade_separada]) => ({ item_id, quantidade_separada })) });
    assert.strictEqual(r.status, 200, `separar ${reqId}: ${JSON.stringify(r.body)}`);
  };
  const entregar = async (reqId, pares) => {
    const r = await request(app).put(`${API}/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: pares.map(([item_id, quantidade_atendida]) => ({ item_id, quantidade_atendida })) });
    assert.strictEqual(r.status, 200, `entregar ${reqId}: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const fila = async () => {
    const f = await request(app).get(`${API}/fila-separacao`);
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    return f.body;
  };
  const painel = async () => {
    const r = await request(app).get(`${API}/dashboard/requisicoes`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.abertas.map((x) => [Number(x.id), x.status]);
  };
  const emailDe = async (rec, reqId) => dbAll(db, `SELECT corpo_texto, destinatarios FROM fila_notificacoes_almoxarifado
    WHERE evento = 'RECEBIMENTO_ENTRADA_REQUISITANTE' AND json_extract(payload, '$.recebimento_id') = ?
      AND json_extract(payload, '$.requisicao_id') = ?`, [rec, reqId]);
  const estornar = (movId) => request(app).post(`${API}/movimentacoes/${movId}/cancelar`).send({ motivo: 'estorno e74t5' });

  // ══════════════ A jornada ══════════════
  const j = {};
  await test('[jornada 1] compra VINCULADA a caminho: R2 (NORMAL, 3, criada antes) e R1 (URGENTE, 6) aprovadas -> AGUARDANDO_COMPRA, sem reserva', async () => {
    j.m = await material({ minimo: 10 });
    j.compra = await compraVinculada(j.m.id, 10);
    j.R2 = await aprovada([[j.m.id, 3]]);
    j.R1 = await aprovada([[j.m.id, 6]], { urgencia: 'URGENTE' });
    assert.deepStrictEqual([j.R1.status, j.R2.status], ['AGUARDANDO_COMPRA', 'AGUARDANDO_COMPRA']);
    assert.deepStrictEqual([await reservas(j.R1.id), await reservas(j.R2.id)], [[], []], 'sem saldo nao ha o que reservar');
  });

  await test('[jornada 2] nota de 4: R1 (URGENTE) fica com os 4 e PARCIALMENTE_RESERVADA; R2 (mais antiga) sem nada; reserva da chegada marcada com a nota', async () => {
    assert.ok(j.R1, 'premissa: jornada 1');
    j.nota1 = await receber(j.compra.pedido, j.m.id, 4);
    const r1 = await reservas(j.R1.id);
    assert.deepStrictEqual(r1.map((r) => [Number(r.quantidade), r.status, r.origem, r.recebimento_id]),
      [[4, 'ATIVA', 'REQUISICAO', j.nota1.rec]], 'a reserva da chegada de R1 (a urgencia passa na frente da antiguidade)');
    j.reservaChegadaR1 = r1[0].id;
    assert.deepStrictEqual(await reservas(j.R2.id), [], 'R2 (NORMAL, mais antiga) nao leva nada: os 4 nao cobrem R1');
    assert.strictEqual(await st(j.R1.id), 'PARCIALMENTE_RESERVADA', 'o status acompanha a reserva (D5)');
    assert.strictEqual(await st(j.R2.id), 'AGUARDANDO_COMPRA', 'sem reserva, o status nao muda');
    assert.deepStrictEqual(await mat(j.m.id), { q: 4, r: 4, d: 0 });
    assert.strictEqual(await stSol(j.compra.solicitacao), 'VINCULADO', 'premissa: ainda faltam 6 do pedido');
  });

  await test('[jornada 2] o e-mail: R1 le o reservado e a frase L1; R2 NAO recebe (nada livre para ela)', async () => {
    assert.ok(j.nota1, 'premissa: jornada 2');
    const [e1] = await emailDe(j.nota1.rec, j.R1.id);
    assert.ok(e1, 'R1 ganhou reserva: recebe o aviso');
    assert.deepStrictEqual(JSON.parse(e1.destinatarios), [SOL.email]);
    const l = e1.corpo_texto.split('\n');
    assert.ok(l.includes('Situação da requisição: Parcialmente reservada'), e1.corpo_texto);
    assert.ok(l.includes(`- ${j.m.codigo} — ${j.m.nome}: entrou 4 PC (pendente na requisição: 6 PC; reservado para a sua requisição: 4 PC)`), e1.corpo_texto);
    assert.ok(l.includes(L1), `frase L1: ${e1.corpo_texto}`);
    assert.deepStrictEqual(await emailDe(j.nota1.rec, j.R2.id), [], 'R2 esperava, mas os 4 foram de R1: o aviso nao promete o alheio');
  });

  await test('[jornada 3] R3 aprovada DEPOIS da nota nao leva nada (AGUARDANDO_COMPRA); fila: R1 SEPARAR, R2 e R3 AGUARDANDO_SALDO; o painel lista R1', async () => {
    assert.ok(j.nota1, 'premissa: jornada 2');
    j.R3 = await aprovada([[j.m.id, 2]]);
    assert.strictEqual(j.R3.status, 'AGUARDANDO_COMPRA', 'a reservada para R1 nao e livre');
    assert.deepStrictEqual(await reservas(j.R3.id), []);
    const f = await fila();
    const linha = (id) => f.find((x) => x.id === id);
    assert.ok(linha(j.R1.id), 'R1 na fila');
    assert.ok(linha(j.R1.id).etapas.includes('SEPARAR'), `R1: ${JSON.stringify(linha(j.R1.id).etapas)}`);
    const it = linha(j.R1.id).itens.find((i) => Number(i.material_id) === j.m.id);
    assert.strictEqual(Number(it.separavel), 4, `separavel de R1: ${JSON.stringify(it)}`);
    for (const r of [j.R2, j.R3]) {
      assert.deepStrictEqual(linha(r.id) && linha(r.id).etapas, ['AGUARDANDO_SALDO'], `fila de ${r.id}`);
    }
    const p = await painel();
    assert.ok(p.some(([id, s]) => id === j.R1.id && s === 'PARCIALMENTE_RESERVADA'), `painel: ${JSON.stringify(p)}`);
  });

  await test('[jornada 4] separar e entregar 4 de R1: a entrega consome a reserva da CHEGADA (a trilha cita o reserva_id)', async () => {
    assert.ok(j.R3, 'premissa: jornada 3');
    j.itR1 = await itemDe(j.R1.id);
    await separar(j.R1.id, [[j.itR1, 4]]);
    const e = await entregar(j.R1.id, [[j.itR1, 4]]);
    assert.strictEqual(e.status, 'PARCIALMENTE_ATENDIDA', JSON.stringify(e));
    const [rs] = await reservas(j.R1.id);
    assert.strictEqual(Number(rs.quantidade_utilizada), 4, `a reserva da chegada foi consumida: ${JSON.stringify(rs)}`);
    assert.notStrictEqual(rs.status, 'ATIVA', `consumida por inteiro: ${JSON.stringify(rs)}`);
    const saidas = await dbAll(db, `SELECT tipo, quantidade FROM movimentacoes_almoxarifado
      WHERE reserva_id = ? AND tipo NOT IN ('RESERVA','LIBERACAO_RESERVA')`, [j.reservaChegadaR1]);
    assert.strictEqual(saidas.reduce((s, x) => s + Number(x.quantidade), 0), 4, `a saida da entrega cita a reserva da chegada: ${JSON.stringify(saidas)}`);
    assert.deepStrictEqual(await mat(j.m.id), { q: 0, r: 0, d: 0 });
  });

  await test('[jornada 5] nota do resto (6): R1 completa (2), R2 TOTALMENTE (3), R3 PARCIALMENTE (1); solicitacao RECEBIDA; o painel lista as *_RESERVADA', async () => {
    assert.ok(j.itR1, 'premissa: jornada 4');
    j.nota2 = await receber(j.compra.pedido, j.m.id, 6);
    assert.strictEqual(await stSol(j.compra.solicitacao), 'RECEBIDA', 'a nota do resto fecha a solicitacao (Etapa 72)');
    assert.deepStrictEqual([await holdAtivo(j.R1.id), await holdAtivo(j.R2.id), await holdAtivo(j.R3.id)], [2, 3, 1],
      'a ordem da fila: R1 (URGENTE) completa, depois R2, depois R3 (as NORMAL pela criacao)');
    assert.deepStrictEqual([await st(j.R1.id), await st(j.R2.id), await st(j.R3.id)],
      ['PARCIALMENTE_ATENDIDA', 'TOTALMENTE_RESERVADA', 'PARCIALMENTE_RESERVADA'],
      'PARCIALMENTE_ATENDIDA mantem o status; as outras acompanham a reserva');
    for (const r of [j.R1, j.R2, j.R3]) {
      // eslint-disable-next-line no-await-in-loop
      const ativas = (await reservas(r.id)).filter((x) => x.status === 'ATIVA');
      assert.ok(ativas.every((x) => x.recebimento_id === j.nota2.rec), `as reservas vivas de ${r.id} sao da nota 2`);
    }
    assert.deepStrictEqual(await mat(j.m.id), { q: 6, r: 6, d: 0 });
    const [e2] = await emailDe(j.nota2.rec, j.R2.id);
    assert.ok(e2 && e2.corpo_texto.split('\n').includes(L1), `R2 ganhou tudo: L1: ${e2 && e2.corpo_texto}`);
    const p = await painel();
    for (const [r, s] of [[j.R2, 'TOTALMENTE_RESERVADA'], [j.R3, 'PARCIALMENTE_RESERVADA']]) {
      assert.ok(p.some(([id, x]) => id === r.id && x === s), `painel sem ${r.id} ${s}: ${JSON.stringify(p)}`);
    }
  });

  await test('[jornada 6] entregar o resto de R1 -> ENTREGUE; R2 e R3 seguem com o que e delas', async () => {
    assert.ok(j.nota2, 'premissa: jornada 5');
    await separar(j.R1.id, [[j.itR1, 2]]);
    const e = await entregar(j.R1.id, [[j.itR1, 2]]);
    assert.strictEqual(e.status, 'ENTREGUE', JSON.stringify(e));
    assert.strictEqual(await holdAtivo(j.R1.id), 0);
    assert.deepStrictEqual([await holdAtivo(j.R2.id), await holdAtivo(j.R3.id)], [3, 1]);
    assert.deepStrictEqual(await mat(j.m.id), { q: 4, r: 4, d: 0 });
  });

  // ══════════════ Estorno ══════════════
  await test('[estorno] nota B reservada a R2 (nada separado): estorno 200, reserva LIBERADA, R2 volta a AGUARDANDO_COMPRA (o pedido reabriu)', async () => {
    const m = await material({ minimo: 9 });
    const c = await compraVinculada(m.id, 9);
    const E2 = await aprovada([[m.id, 3]]);
    const E1 = await aprovada([[m.id, 6]], { urgencia: 'URGENTE' });
    const notaA = await receber(c.pedido, m.id, 6);
    assert.deepStrictEqual([await holdAtivo(E1.id), await holdAtivo(E2.id)], [6, 0], 'premissa: a nota A foi toda para E1 (URGENTE)');
    const notaB = await receber(c.pedido, m.id, 3);
    assert.deepStrictEqual([await st(E1.id), await st(E2.id)], ['TOTALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA']);
    assert.strictEqual(await stSol(c.solicitacao), 'RECEBIDA', 'premissa: o pedido de 9 chegou inteiro');
    const itE1 = await itemDe(E1.id);
    await separar(E1.id, [[itE1, 2]]);
    assert.strictEqual(await st(E1.id), 'EM_SEPARACAO');

    const e = await estornar(notaB.mov);
    assert.strictEqual(e.status, 200, `estorno da nota B: ${JSON.stringify(e.body)}`);
    assert.ok(e.body.pedido_compra && e.body.pedido_compra.reaberto, `o pedido reabre (71): ${JSON.stringify(e.body)}`);
    const numeroB = (await dbGet(db, 'SELECT numero FROM recebimentos_material_almoxarifado WHERE id = ?', [notaB.rec])).numero;
    assert.deepStrictEqual((await reservas(E2.id)).map((r) => [r.status, r.motivo_liberacao]),
      [['LIBERADA', `Estorno da entrada do recebimento ${numeroB}`]]);
    assert.strictEqual(await stSol(c.solicitacao), 'VINCULADO', 'a solicitacao volta a esperar o pedido');
    assert.strictEqual(await st(E2.id), 'AGUARDANDO_COMPRA', 'recalculado DEPOIS de o pedido reabrir');
    assert.strictEqual(await holdAtivo(E1.id), 6, 'E1 intacta');

    // Com E1 ja separada: recusa, nada tocado. Fase 5: nada saiu (os 6 estao reservados a E1), entao a recusa
    // diz quem segura — nao mais "material ja consumido" (a literal da 71 fica para o consumo real).
    const e2 = await estornar(notaA.mov);
    assert.strictEqual(e2.status, 400, JSON.stringify(e2.body));
    assert.strictEqual(e2.body.error, RECUSA_RESERVADO([E1.numero]));
    assert.notStrictEqual(e2.body.error, RECUSA_71);
    assert.strictEqual(await holdAtivo(E1.id), 6, 'quem ja separou nao perde a reserva');
    assert.strictEqual(await st(E1.id), 'EM_SEPARACAO');

    // Nova nota do que voltou a faltar: E2 reservada de novo.
    const notaC = await receber(c.pedido, m.id, 3);
    assert.strictEqual(await holdAtivo(E2.id), 3);
    assert.strictEqual(await st(E2.id), 'TOTALMENTE_RESERVADA');
    assert.ok((await reservas(E2.id)).some((r) => r.status === 'ATIVA' && r.recebimento_id === notaC.rec));
  });

  // ══════════════ Cancelada durante ══════════════
  await test('[cancelada] cancelada pela rota DURANTE a reserva na chegada: a reserva e desfeita, a requisicao fica CANCELADO e nao ressuscita', async () => {
    const m = await material();
    const p = await pedidoAvulso(m.id, 10);
    const C = await aprovada([[m.id, 3]]);
    assert.strictEqual(C.status, 'AGUARDANDO_ESTOQUE');
    const original = stockService.criarReserva;
    let cancelou = false;
    stockService.criarReserva = async (dbx, user, data, opcoes) => {
      if (opcoes && opcoes.requisicao_id === C.id && !cancelou) {
        cancelou = true;
        const r = await request(app).put(`${API}/requisicoes/${C.id}/cancelar`).send({ motivo: 'cancelada no meio e74t5' });
        assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      }
      return original(dbx, user, data, opcoes);
    };
    let nota;
    try { nota = await receber(p, m.id, 5); } finally { stockService.criarReserva = original; }
    assert.ok(cancelou, 'premissa: o cancelamento rodou no meio da reserva');
    assert.strictEqual(await st(C.id), 'CANCELADO', 'nao ressuscita');
    assert.deepStrictEqual((await reservas(C.id)).map((r) => [r.status, r.motivo_liberacao]),
      [['LIBERADA', 'Requisição saiu da espera durante a reserva na chegada']]);
    assert.deepStrictEqual(await mat(m.id), { q: 5, r: 0, d: 5 }, 'o que chegou ficou livre');
    // E o estorno da nota nao a toca.
    const e = await estornar(nota.mov);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.strictEqual(await st(C.id), 'CANCELADO');
  });

  // ══════════════ /encerrar ══════════════
  await test('[encerrar] PARCIALMENTE_ATENDIDA com a reserva da chegada: /encerrar libera o hold', async () => {
    const m = await material();
    const p = await pedidoAvulso(m.id, 5);
    const R = await aprovada([[m.id, 5]]);
    await receber(p, m.id, 5);
    assert.strictEqual(await st(R.id), 'TOTALMENTE_RESERVADA', 'premissa: a chegada reservou os 5');
    const it = await itemDe(R.id);
    await separar(R.id, [[it, 2]]);
    await entregar(R.id, [[it, 2]]);
    assert.strictEqual(await st(R.id), 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual(await holdAtivo(R.id), 3, 'premissa: sobrou hold de 3 da chegada');
    const enc = await request(app).put(`${API}/requisicoes/${R.id}/encerrar`).send({ motivo: 'encerrar e74t5' });
    assert.strictEqual(enc.status, 200, JSON.stringify(enc.body));
    assert.strictEqual(await holdAtivo(R.id), 0, 'o hold da chegada nao fica preso numa ENCERRADA');
    assert.deepStrictEqual(await mat(m.id), { q: 3, r: 0, d: 3 });
    assert.strictEqual((await reservas(R.id)).find((r) => r.status === 'LIBERADA').motivo_liberacao, 'Requisição encerrada');
  });

  // ══════════════ Aprovacao automatica ══════════════
  await test('[automatica] Q1 (5) esperava; nota de 7 -> Q1 TOTALMENTE; Q2 (4) criada depois leva so os 2 que sobraram; o painel lista as duas', async () => {
    const m = await material();
    const p = await pedidoAvulso(m.id, 7);
    await setConfig('aprovacao_automatica', '1');
    try {
      const q1 = await criar([[m.id, 5]], { urgencia: 'URGENTE' });
      assert.strictEqual(q1.status, 'AGUARDANDO_ESTOQUE', `premissa: aprovada pela automatica sem saldo: ${JSON.stringify(q1)}`);
      assert.strictEqual(await st(q1.id), q1.status, 'resposta = banco');
      await receber(p, m.id, 7);
      assert.strictEqual(await holdAtivo(q1.id), 5);
      assert.strictEqual(await st(q1.id), 'TOTALMENTE_RESERVADA');
      const q2 = await criar([[m.id, 4]], { urgencia: 'URGENTE' });
      assert.strictEqual(await st(q2.id), q2.status, `resposta = banco: ${JSON.stringify(q2)}`);
      assert.strictEqual(q2.status, 'PARCIALMENTE_RESERVADA', 'a automatica so leva o que sobrou');
      assert.strictEqual(await holdAtivo(q2.id), 2);
      assert.strictEqual(await holdAtivo(q1.id), 5, 'Q1 nao perdeu nada');
      assert.deepStrictEqual(await mat(m.id), { q: 7, r: 7, d: 0 });
      const pn = await painel();
      for (const [id, s] of [[q1.id, 'TOTALMENTE_RESERVADA'], [q2.id, 'PARCIALMENTE_RESERVADA']]) {
        assert.ok(pn.some(([x, y]) => x === id && y === s), `painel sem ${id} ${s}: ${JSON.stringify(pn)}`);
      }
    } finally { await setConfig('aprovacao_automatica', '0'); }
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
