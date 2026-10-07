/**
 * Etapa 75, Task 4 (integracao: T1 x T2 x T3 x 74) — a jornada de quem espera o material CRITICO.
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa75-inspecao-libera-reserva.md (T4; a secao
 * "Fase 2 — revisao do plano" prevalece: R2 termina PARCIALMENTE_RESERVADA depois da NC, 1 + 1 de 4).
 *
 * TUDO PELAS ROTAS e com usuarios REAIS POR PERFIL pelo gate real (`requirePermission`): o solicitante
 * e chao de fabrica (sem perfil -> PRODUCAO), o GESTOR aprova e estorna, o COMPRAS compra e recebe a nota
 * pelas seis portas, a QUALIDADE decide a inspecao e a NC, dois ALMOXARIFES separam/conferem/entregam
 * (material critico exige a segunda conferencia, Etapa 28). O usuario padrao do harness e CONSULTA: uma
 * rota chamada sem `as(...)` responde 403 e o teste cai — nada passa por engano como administrador.
 *
 *  - jornada: material critico com minimo -> verificar-minimos -> pedido -> R2 (NORMAL, 4, criada ANTES) e
 *    R1 (URGENTE, 4) aprovadas -> AGUARDANDO_COMPRA -> nota de 6 pelas seis portas, retida -> NADA reservado
 *    e nenhum e-mail ao solicitante -> R3 aprovada com o material retido -> inspecao 5/1 (QUALIDADE) -> R1 4
 *    TOTALMENTE, R2 1 PARCIALMENTE, R3 nada; e-mails literais de R1 e R2 (L1, dedupe por inspecao), R3 sem
 *    e-mail; fila R1/R2 SEPARAR, R3 AGUARDANDO_SALDO -> R4 aprovada DEPOIS nao leva -> separar (ALM1),
 *    conferir (ALM2), entregar R1 (a saida consome a reserva da INSPECAO) -> NC ACEITAR (QUALIDADE) -> o 1
 *    vai para R2 (2 de 4, PARCIALMENTE_RESERVADA), e-mail com a 1a linha da NC -> R3/R4 sem nada -> separar/
 *    conferir/entregar R2 parcial (2) -> PARCIALMENTE_ATENDIDA;
 *  - retomada da nota (B390): a 1a execucao de `processar` falha no lote do item comum, DEPOIS da entrada
 *    retida do critico e ANTES do gancho; a QUALIDADE inspeciona o critico (W1 ganha o aprovado); a 2a
 *    execucao reserva o comum para W2 e NAO reconta o critico ja inspecionado;
 *  - estorno no cenario so-aprovado: inspecao 3/0 reserva para R5; o estorno da ENTRADA_COMPRA (GESTOR)
 *    solta a reserva da inspecao pela B374 e R5 volta ao status de espera.
 *
 * L0 (FRASE_SEM_RESERVA) NAO aparece nesta jornada, e e declarado: pelas portas reais, quem esta na fila
 * sempre leva o que a decisao liberou (o miolo e guloso); L0 so sai quando a candidata e pulada (regra do
 * dono, valor ao vivo) ou a reserva falha — coberto em inspecaoReservaLiberacaoAviso (T3). Aqui cada
 * e-mail confere L1 literal E a ausencia de L0.
 *
 * Executar: cd server && node tests/api/inspecaoReservaLiberacaoIntegracao.api.test.js
 */
const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const lotService = require('../../services/almoxarifado/lotService');
const receiptNotificationService = require('../../services/almoxarifado/receiptNotificationService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const { FRASE_TUDO_RESERVADO: L1, FRASE_SEM_RESERVA: L0 } = receiptNotificationService;
const EVENTO = 'RECEBIMENTO_ENTRADA_REQUISITANTE';
const hash = (chave) => crypto.createHash('sha256').update(`${EVENTO}|${chave}`).digest('hex');
const EM_ESPERA = ['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'];

// Usuarios por perfil (o gate real decide).
const CONSULTA = { id: 7540, nome: 'Consulta E75T4', perfil_almoxarifado: 'CONSULTA', email: 'c75t4@test.com' };
const SOL_A = { id: 7541, nome: 'Solicitante A E75T4', email: 'sa75t4@test.com' }; // sem perfil -> PRODUCAO
const SOL_B = { id: 7542, nome: 'Solicitante B E75T4', email: 'sb75t4@test.com' };
const GES = { id: 7543, nome: 'Gestor E75T4', perfil_almoxarifado: 'GESTOR', email: 'g75t4@test.com' };
const COMP = { id: 7544, nome: 'Compras E75T4', perfil_almoxarifado: 'COMPRAS', email: 'cp75t4@test.com' };
const QUA = { id: 7545, nome: 'Inspetora E75T4', perfil_almoxarifado: 'QUALIDADE', email: 'q75t4@test.com' };
const ALM1 = { id: 7546, nome: 'Almoxarife 1 E75T4', perfil_almoxarifado: 'ALMOXARIFE', email: 'a1-75t4@test.com' };
const ALM2 = { id: 7547, nome: 'Almoxarife 2 E75T4', perfil_almoxarifado: 'ALMOXARIFE', email: 'a2-75t4@test.com' };
const API = '/api/almoxarifado';

(async () => {
  console.log('\n=== Etapa 75 Task 4: a jornada de quem espera o material critico (integracao) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...CONSULTA } });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...CONSULTA }); } };
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const u of [SOL_A, SOL_B, GES, COMP, QUA, ALM1, ALM2]) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [u.id, u.nome, u.email]);
  }
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn E75T4','75400000000175','ativo')")).lastID;
  const setConfig = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
  await setConfig('liberacao_valor_ativo', '0');
  await setConfig('aprovacao_automatica', '0');
  await setConfig('inspecao_material_critico', '1');
  await setConfig('notificar_recebimento_solicitante', '1');

  let seq = 0;
  const material = async ({ minimo = 0, critico = 1 } = {}) => {
    seq += 1;
    const codigo = `E75T4-M${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, custo_unitario, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', 0, ?, 0, 10, 1, ?, ?)`, [codigo, `Mat E75T4 ${seq}`, minimo, forn, critico])).lastID;
    return { id, codigo, nome: `Mat E75T4 ${seq}` };
  };
  const mat = async (m) => ({ ...(await dbGet(db, `SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r,
    COALESCE(quantidade_em_inspecao,0) i, COALESCE(quantidade_bloqueada,0) b FROM materiais_almoxarifado WHERE id = ?`, [m])) });
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const reservas = (reqId) => dbAll(db, `SELECT id, quantidade, quantidade_utilizada, status, origem, motivo_liberacao, recebimento_id,
      observacoes, solicitante_id FROM reservas_material_almoxarifado WHERE requisicao_id = ? ORDER BY id`, [reqId]);
  const holdAtivo = async (reqId) => (await reservas(reqId)).filter((r) => r.status === 'ATIVA')
    .reduce((s, r) => s + Number(r.quantidade) - Number(r.quantidade_utilizada || 0), 0);
  const itemDe = async (reqId) => (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [reqId])).id;
  const numero = async (tab, id) => (await dbGet(db, `SELECT numero FROM ${tab} WHERE id = ?`, [id])).numero;
  const avisosDe = (reqId) => dbAll(db, `SELECT assunto, corpo_texto, destinatarios, hash_dedupe, payload FROM fila_notificacoes_almoxarifado
    WHERE evento = ? AND json_extract(payload, '$.requisicao_id') = ? ORDER BY id`, [EVENTO, reqId]);

  const compraVinculada = async (m, quantidade) => as(COMP, async () => {
    const v = await request(app).post(`${API}/compras/verificar-minimos`).send({});
    assert.strictEqual(v.status, 200, JSON.stringify(v.body));
    const c = v.body.criadas.find((x) => x.material_id === m);
    assert.ok(c, `premissa: o verificar-minimos abriu a solicitacao do material ${m}: ${JSON.stringify(v.body.criadas)}`);
    const p = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn, status: 'pendente', solicitacao_id: c.solicitacao_id,
      itens: [{ material_id: m, quantidade, valor_unitario: 1 }],
    });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    const linhas = await dbAll(db, 'SELECT id, material_id FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id', [p.body.id]);
    return { solicitacao: c.solicitacao_id, pedido: { id: p.body.id, linhas } };
  });
  const pedidoAvulso = async (pares) => as(COMP, async () => {
    const p = await request(app).post('/api/compras/pedidos').send({ fornecedor_id: forn, status: 'pendente',
      itens: pares.map(([material_id, quantidade]) => ({ material_id, quantidade, valor_unitario: 1 })) });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    return { id: p.body.id, linhas: await dbAll(db, 'SELECT id, material_id FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id', [p.body.id]) };
  });

  let nf = 0;
  /** A nota pelas seis portas (COMPRAS): criar -> conferir -> encaminhar/finalizar/faturar -> fiscal. */
  const notaAteFiscal = async (pedido, linhas) => as(COMP, async () => {
    nf += 1;
    const { d } = await dbGet(db, "SELECT date('now', '-1 day') AS d");
    const itens = linhas.map(([m, quantidade, lote]) => ({
      material_id: m, pedido_item_id: pedido.linhas.find((l) => l.material_id === m).id,
      quantidade, quantidade_recebida: quantidade, ...(lote ? { lote } : {}),
    }));
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
    const total = linhas.reduce((s, [, q]) => s + q, 0);
    const f = await request(app).put(`${API}/recebimentos/${id}/fiscal`).send({
      nota_fiscal: `NF-E75T4-${nf}`, fornecedor_id: forn, fornecedor_nome: 'Forn E75T4',
      data_emissao_nf: d, data_entrada_nf: d, valor_total_nota: total, itens,
    });
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    return id;
  });
  const processar = (rec) => as(COMP, () => request(app).post(`${API}/recebimentos/${rec}/workflow`).send({ acao: 'processar' }));
  const receber = async (pedido, linhas) => {
    const rec = await notaAteFiscal(pedido, linhas);
    const p = await processar(rec);
    assert.strictEqual(p.status, 200, `processar: ${JSON.stringify(p.body)}`);
    return rec;
  };
  const movEntrada = async (rec, m) => (await dbGet(db, `SELECT id FROM movimentacoes_almoxarifado
    WHERE recebimento_id = ? AND material_id = ? AND tipo = 'ENTRADA_COMPRA'`, [rec, m])).id;
  const itemRec = (rec, m) => dbGet(db, `SELECT id, quantidade_em_inspecao FROM recebimentos_material_itens_almoxarifado
    WHERE recebimento_id = ? AND material_id = ?`, [rec, m]);
  const inspecionar = async (rec, m, a, r) => {
    const it = await itemRec(rec, m);
    return as(QUA, () => request(app).post(`${API}/recebimentos/itens/${it.id}/inspecionar`)
      .send({ quantidade_aprovada: a, quantidade_reprovada: r, encaminhamento: r > 0 ? 'DEVOLVER' : undefined }));
  };

  /** Cria (como o solicitante, PRODUCAO) e aprova (GESTOR); confere resposta = banco. */
  const aprovada = async (sol, itens, { urgencia } = {}) => {
    const extra = urgencia ? { urgencia, justificativa_urgencia: 'linha parada e75t4' } : {};
    const cr = await as(sol, () => request(app).post(`${API}/requisicoes`)
      .send({ os_referencia: 'OS-INT', ...extra, itens: itens.map(([material_id, quantidade]) => ({ material_id, quantidade })) }));
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    assert.strictEqual(cr.body.status, 'PENDENTE', `premissa: criada PENDENTE: ${JSON.stringify(cr.body)}`);
    const r = await as(GES, () => request(app).put(`${API}/requisicoes/${cr.body.id}/aprovar`).send({}));
    assert.strictEqual(r.status, 200, `aprovar: ${JSON.stringify(r.body)}`);
    const gravado = await st(cr.body.id);
    assert.strictEqual(r.body.status, gravado, `/aprovar: resposta ${r.body.status} x banco ${gravado}`);
    return { id: cr.body.id, numero: cr.body.numero, status: gravado };
  };
  /** Material critico: ALM1 separa, ALM2 confere (quem separou nao confere), ALM1 entrega. */
  const separarConferirEntregar = async (reqId, itemId, q) => {
    const s = await as(ALM1, () => request(app).put(`${API}/requisicoes/${reqId}/separar`)
      .send({ itens_separados: [{ item_id: itemId, quantidade_separada: q }] }));
    assert.strictEqual(s.status, 200, `separar ${reqId}: ${JSON.stringify(s.body)}`);
    const semConf = await as(ALM1, () => request(app).put(`${API}/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemId, quantidade_atendida: q }] }));
    assert.strictEqual(semConf.status, 400, `premissa: critico sem a segunda conferencia nao sai: ${JSON.stringify(semConf.body)}`);
    const c = await as(ALM2, () => request(app).put(`${API}/requisicoes/${reqId}/conferir-separacao`).send({}));
    assert.strictEqual(c.status, 200, `conferir ${reqId}: ${JSON.stringify(c.body)}`);
    const e = await as(ALM1, () => request(app).put(`${API}/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemId, quantidade_atendida: q }] }));
    assert.strictEqual(e.status, 200, `entregar ${reqId}: ${JSON.stringify(e.body)}`);
    return e.body;
  };
  const fila = async () => {
    const f = await as(ALM1, () => request(app).get(`${API}/fila-separacao`));
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    return f.body;
  };

  // ══════════════ A jornada ══════════════
  const j = {};
  await test('[jornada 1] material critico, compra vinculada: R2 (NORMAL, 4, criada antes) e R1 (URGENTE, 4) aprovadas pelo GESTOR -> AGUARDANDO_COMPRA, sem reserva', async () => {
    j.m = await material({ minimo: 10 });
    j.compra = await compraVinculada(j.m.id, 6);
    j.R2 = await aprovada(SOL_B, [[j.m.id, 4]]);
    j.R1 = await aprovada(SOL_A, [[j.m.id, 4]], { urgencia: 'URGENTE' });
    assert.deepStrictEqual([j.R1.status, j.R2.status], ['AGUARDANDO_COMPRA', 'AGUARDANDO_COMPRA']);
    assert.deepStrictEqual([await reservas(j.R1.id), await reservas(j.R2.id)], [[], []]);
  });

  await test('[jornada 2] nota de 6 pelas seis portas (COMPRAS): o critico entra RETIDO -> NADA reservado, nenhum e-mail ao solicitante, status intactos', async () => {
    assert.ok(j.R1, 'premissa: jornada 1');
    j.rec = await receber(j.compra.pedido, [[j.m.id, 6]]);
    assert.deepStrictEqual(await mat(j.m.id), { q: 6, r: 0, i: 6, b: 0 }, 'retido para inspecao');
    assert.deepStrictEqual([await reservas(j.R1.id), await reservas(j.R2.id)], [[], []], 'a chegada (74) nao reserva o retido');
    assert.deepStrictEqual([await avisosDe(j.R1.id), await avisosDe(j.R2.id)], [[], []], 'o aviso da 70 pula o retido');
    for (const r of [j.R1, j.R2]) {
      // eslint-disable-next-line no-await-in-loop
      assert.ok(EM_ESPERA.includes(await st(r.id)), `${r.numero} continua esperando: ${await st(r.id)}`);
    }
  });

  await test('[jornada 3] R3 aprovada com o material retido -> esperando, sem reserva', async () => {
    assert.ok(j.rec, 'premissa: jornada 2');
    j.R3 = await aprovada(SOL_A, [[j.m.id, 3]]);
    assert.ok(EM_ESPERA.includes(j.R3.status), `o retido nao e disponivel: ${j.R3.status}`);
    assert.deepStrictEqual(await reservas(j.R3.id), []);
  });

  await test('[jornada 4] inspecao 5/1 pela QUALIDADE -> 201; R1 (URGENTE) 4 TOTALMENTE, R2 1 PARCIALMENTE, R3 nada; reservas marcadas com a nota, literal da inspecao, dono = a inspetora', async () => {
    assert.ok(j.R3, 'premissa: jornada 3');
    const ins = await inspecionar(j.rec, j.m.id, 5, 1);
    assert.strictEqual(ins.status, 201, JSON.stringify(ins.body));
    j.insp = ins.body.id;
    j.numRec = await numero('recebimentos_material_almoxarifado', j.rec);
    const r1 = await reservas(j.R1.id);
    const r2 = await reservas(j.R2.id);
    assert.deepStrictEqual(r1.map((r) => [Number(r.quantidade), r.status, r.origem, r.recebimento_id, r.observacoes, r.solicitante_id]),
      [[4, 'ATIVA', 'REQUISICAO', j.rec, `Reserva na liberação da inspeção — recebimento ${j.numRec} — requisição ${j.R1.numero}`, QUA.id]],
      'R1 (URGENTE) passa na frente da antiguidade');
    assert.deepStrictEqual(r2.map((r) => [Number(r.quantidade), r.status, r.recebimento_id, r.observacoes]),
      [[1, 'ATIVA', j.rec, `Reserva na liberação da inspeção — recebimento ${j.numRec} — requisição ${j.R2.numero}`]],
      'R2 fica com o resto do aprovado (nunca o reprovado)');
    j.reservaInspR1 = r1[0].id;
    assert.deepStrictEqual(await reservas(j.R3.id), [], 'R3 (depois na fila) nao leva nada');
    assert.deepStrictEqual([await st(j.R1.id), await st(j.R2.id)], ['TOTALMENTE_RESERVADA', 'PARCIALMENTE_RESERVADA']);
    assert.ok(EM_ESPERA.includes(await st(j.R3.id)));
    assert.deepStrictEqual(await mat(j.m.id), { q: 6, r: 5, i: 0, b: 1 }, 'o reprovado fica bloqueado, fora de qualquer reserva');
  });

  await test('[jornada 4] e-mails: R1 e R2 com o texto literal da inspecao, L1 (nunca L0), dedupe por inspecao; R3 sem e-mail', async () => {
    assert.ok(j.insp, 'premissa: jornada 4');
    const casos = [
      [j.R1, SOL_A, 'Totalmente reservada', 4],
      [j.R2, SOL_B, 'Parcialmente reservada', 1],
    ];
    for (const [r, sol, situacao, reservado] of casos) {
      // eslint-disable-next-line no-await-in-loop
      const av = await avisosDe(r.id);
      assert.strictEqual(av.length, 1, `${r.numero}: ${JSON.stringify(av)}`);
      assert.strictEqual(av[0].assunto, `[Almoxarifado] Material liberado para a sua requisição ${r.numero}`);
      assert.strictEqual(av[0].hash_dedupe, hash(`inspecao-liberada-${j.insp}-req-${r.id}`), 'dedupe por inspecao');
      assert.deepStrictEqual(JSON.parse(av[0].destinatarios), [sol.email]);
      assert.deepStrictEqual(JSON.parse(av[0].payload), { recebimento_id: j.rec, requisicao_id: r.id, numero_requisicao: r.numero,
        origem: 'INSPECAO', documento_id: j.insp });
      const l = av[0].corpo_texto.split('\n');
      assert.strictEqual(l[0], 'O material que a sua requisição aguardava foi aprovado na inspeção e está no estoque.');
      assert.strictEqual(l[1], `Requisição: ${r.numero}`);
      assert.strictEqual(l[2], `Situação da requisição: ${situacao}`, 'relida depois da reserva');
      assert.strictEqual(l[3], `Recebimento: ${j.numRec}`);
      assert.strictEqual(l[5], `- ${j.m.codigo} — ${j.m.nome}: liberado 5 PC (pendente na requisição: 4 PC; reservado para a sua requisição: ${reservado} PC)`);
      assert.strictEqual(l[6], L1);
      assert.ok(!l.includes(L0), `nunca L0 para quem ganhou: ${av[0].corpo_texto}`);
    }
    assert.deepStrictEqual(await avisosDe(j.R3.id), [], 'R3 nao ganhou e nao ha disponivel: o aviso nao promete o alheio');
  });

  await test('[jornada 4] decidir a mesma inspecao de novo -> 400, nenhuma reserva nem e-mail novos (uma vez por decisao)', async () => {
    assert.ok(j.insp, 'premissa: jornada 4');
    const de2 = await inspecionar(j.rec, j.m.id, 1, 0);
    assert.strictEqual(de2.status, 400, JSON.stringify(de2.body));
    assert.deepStrictEqual([await holdAtivo(j.R1.id), await holdAtivo(j.R2.id), await holdAtivo(j.R3.id)], [4, 1, 0]);
    assert.deepStrictEqual([(await avisosDe(j.R1.id)).length, (await avisosDe(j.R2.id)).length], [1, 1]);
  });

  await test('[jornada 5] fila: R1 e R2 SEPARAR, R3 AGUARDANDO_SALDO; R4 aprovada DEPOIS nao leva (esperando, sem reserva)', async () => {
    assert.ok(j.insp, 'premissa: jornada 4');
    const f = await fila();
    const linha = (id) => f.find((x) => x.id === id);
    for (const r of [j.R1, j.R2]) {
      assert.ok(linha(r.id) && linha(r.id).etapas.includes('SEPARAR'), `${r.numero}: ${JSON.stringify(linha(r.id))}`);
    }
    assert.deepStrictEqual(linha(j.R3.id) && linha(j.R3.id).etapas, ['AGUARDANDO_SALDO'], `R3: ${JSON.stringify(linha(j.R3.id))}`);
    j.R4 = await aprovada(SOL_B, [[j.m.id, 2]]);
    assert.ok(EM_ESPERA.includes(j.R4.status), `o reservado para R1/R2 nao e livre: ${j.R4.status}`);
    assert.deepStrictEqual(await reservas(j.R4.id), []);
  });

  await test('[jornada 6] R1: separar (ALM1), entregar sem conferencia 400, conferir (ALM2), entregar 4 -> ENTREGUE; a saida consome a reserva da INSPECAO', async () => {
    assert.ok(j.R4, 'premissa: jornada 5');
    j.itR1 = await itemDe(j.R1.id);
    const e = await separarConferirEntregar(j.R1.id, j.itR1, 4);
    assert.strictEqual(e.status, 'ENTREGUE', JSON.stringify(e));
    const [rs] = await reservas(j.R1.id);
    assert.strictEqual(Number(rs.quantidade_utilizada), 4, JSON.stringify(rs));
    assert.notStrictEqual(rs.status, 'ATIVA');
    const saidas = await dbAll(db, `SELECT quantidade FROM movimentacoes_almoxarifado
      WHERE reserva_id = ? AND tipo NOT IN ('RESERVA','LIBERACAO_RESERVA')`, [j.reservaInspR1]);
    assert.strictEqual(saidas.reduce((s, x) => s + Number(x.quantidade), 0), 4, `a saida cita a reserva da inspecao: ${JSON.stringify(saidas)}`);
    assert.deepStrictEqual(await mat(j.m.id), { q: 2, r: 1, i: 0, b: 1 });
  });

  await test('[jornada 7] NC ACEITAR (QUALIDADE) -> 200 LIBERADA; o 1 vai para R2 (2 de 4, PARCIALMENTE_RESERVADA), literal da NC, marca da nota; R3 e R4 sem nada', async () => {
    assert.ok(j.itR1, 'premissa: jornada 6');
    j.nc = await dbGet(db, "SELECT id, numero, status FROM nao_conformidades_almoxarifado WHERE referencia_tipo = 'INSPECAO' AND referencia_id = ?", [j.insp]);
    assert.strictEqual(j.nc && j.nc.status, 'ABERTA', 'premissa: a inspecao abriu a NC do reprovado');
    const d = await as(QUA, () => request(app).post(`${API}/nao-conformidades/${j.nc.id}/decidir`).send({ decisao: 'ACEITAR', justificativa: 'aceito e75t4' }));
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.deepStrictEqual(d.body.liberacao, { efeito: 'LIBERADA', quantidade: 1, material_id: j.m.id, mensagem: '1 liberado(s) do bloqueio' });
    const ativas = (await reservas(j.R2.id)).filter((r) => r.status === 'ATIVA');
    assert.deepStrictEqual(ativas.map((r) => [Number(r.quantidade), r.recebimento_id, r.observacoes]), [
      [1, j.rec, `Reserva na liberação da inspeção — recebimento ${j.numRec} — requisição ${j.R2.numero}`],
      [1, j.rec, `Reserva na liberação da não conformidade ${j.nc.numero} — requisição ${j.R2.numero}`],
    ]);
    assert.strictEqual(await st(j.R2.id), 'PARCIALMENTE_RESERVADA', 'Fase 2: 1 + 1 de 4');
    assert.deepStrictEqual([await reservas(j.R3.id), await reservas(j.R4.id)], [[], []], 'quem esperava atras de R2 nao leva');
    assert.deepStrictEqual(await mat(j.m.id), { q: 2, r: 2, i: 0, b: 0 });
  });

  await test('[jornada 7] e-mail da NC para R2: 1a linha da NC, pendente 3 / reservado 1, L1, dedupe da NC; R1 (entregue), R3, R4 sem e-mail novo', async () => {
    assert.ok(j.nc, 'premissa: jornada 7');
    const av = await avisosDe(j.R2.id);
    assert.deepStrictEqual(av.map((x) => x.hash_dedupe),
      [hash(`inspecao-liberada-${j.insp}-req-${j.R2.id}`), hash(`nc-liberada-${j.nc.id}-req-${j.R2.id}`)]);
    const l = av[1].corpo_texto.split('\n');
    assert.strictEqual(l[0], `O material que a sua requisição aguardava foi liberado pela não conformidade ${j.nc.numero} e está no estoque.`);
    assert.strictEqual(l[2], 'Situação da requisição: Parcialmente reservada');
    assert.strictEqual(l[3], `Recebimento: ${j.numRec}`);
    assert.strictEqual(l[5], `- ${j.m.codigo} — ${j.m.nome}: liberado 1 PC (pendente na requisição: 3 PC; reservado para a sua requisição: 1 PC)`);
    assert.strictEqual(l[6], L1);
    assert.deepStrictEqual(JSON.parse(av[1].payload), { recebimento_id: j.rec, requisicao_id: j.R2.id, numero_requisicao: j.R2.numero,
      origem: 'NAO_CONFORMIDADE', documento_id: j.nc.id });
    assert.strictEqual((await avisosDe(j.R1.id)).length, 1, 'R1 ja entregue');
    assert.deepStrictEqual([await avisosDe(j.R3.id), await avisosDe(j.R4.id)], [[], []]);
  });

  await test('[jornada 8] R2: separar/conferir/entregar 2 -> PARCIALMENTE_ATENDIDA; as duas reservas consumidas; R3 e R4 seguem esperando', async () => {
    assert.ok(j.nc, 'premissa: jornada 7');
    const it = await itemDe(j.R2.id);
    const e = await separarConferirEntregar(j.R2.id, it, 2);
    assert.strictEqual(e.status, 'PARCIALMENTE_ATENDIDA', JSON.stringify(e));
    assert.strictEqual(await holdAtivo(j.R2.id), 0);
    assert.deepStrictEqual(await mat(j.m.id), { q: 0, r: 0, i: 0, b: 0 });
    for (const r of [j.R3, j.R4]) {
      // eslint-disable-next-line no-await-in-loop
      assert.ok(EM_ESPERA.includes(await st(r.id)), `${r.numero}: ${await st(r.id)}`);
    }
  });

  // ══════════════ Retomada da nota (B390) ══════════════
  await test('[retomada] 1a execucao falha no lote do comum (depois da entrada retida do critico, antes do gancho); inspecao 1/3 reserva 1 a W1; 2a execucao reserva o comum a W2 e NAO reconta o critico', async () => {
    const crit = await material(); const comum = await material({ critico: 0 });
    const ped = await pedidoAvulso([[crit.id, 4], [comum.id, 3]]);
    const W1 = await aprovada(SOL_A, [[crit.id, 4]]);
    const W2 = await aprovada(SOL_B, [[comum.id, 3]]);
    const rec = await notaAteFiscal(ped, [[crit.id, 4], [comum.id, 3, 'L-E75T4']]);
    const original = lotService.criarOuObterLote;
    lotService.criarOuObterLote = async () => { throw Object.assign(new Error('falha simulada no lote e75t4'), { status: 400 }); };
    let p1;
    try { p1 = await processar(rec); } finally { lotService.criarOuObterLote = original; }
    assert.notStrictEqual(p1.status, 200, `premissa: a 1a execucao falhou: ${JSON.stringify(p1.body)}`);
    const it = await itemRec(rec, crit.id);
    assert.strictEqual(Number(it.quantidade_em_inspecao), 4, 'premissa: o critico entrou retido na 1a execucao');
    assert.deepStrictEqual([await reservas(W1.id), await reservas(W2.id)], [[], []], 'premissa: o gancho da chegada nao rodou');
    // Saldo alheio do critico (entrada avulsa do almoxarife): e o que a retomada sem a B390 completaria para W1.
    const ent = await as(ALM1, () => request(app).post(`${API}/movimentacoes/v2`).send({ material_id: crit.id, tipo: 'ENTRADA', quantidade: 5, motivo: 'saldo alheio e75t4' }));
    assert.strictEqual(ent.status, 201, JSON.stringify(ent.body));

    const ins = await inspecionar(rec, crit.id, 1, 3);
    assert.strictEqual(ins.status, 201, JSON.stringify(ins.body));
    assert.strictEqual(await holdAtivo(W1.id), 1, 'a inspecao reservou o aprovado para W1');

    const p2 = await processar(rec);
    assert.strictEqual(p2.status, 200, `retomada: ${JSON.stringify(p2.body)}`);
    const r1 = (await reservas(W1.id)).filter((r) => r.status === 'ATIVA');
    assert.deepStrictEqual(r1.map((r) => Number(r.quantidade)), [1], `B390: o critico inspecionado nao e recontado como livre: ${JSON.stringify(r1)}`);
    assert.ok(r1[0].observacoes.startsWith('Reserva na liberação da inspeção'), r1[0].observacoes);
    const r2 = (await reservas(W2.id)).filter((r) => r.status === 'ATIVA');
    assert.deepStrictEqual(r2.map((r) => [Number(r.quantidade), r.recebimento_id]), [[3, rec]], 'o comum e reservado na retomada');
    assert.ok(r2[0].observacoes.startsWith('Reserva na chegada do recebimento'), r2[0].observacoes);
    assert.deepStrictEqual([await st(W1.id), await st(W2.id)], ['PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA']);
    assert.deepStrictEqual(await mat(crit.id), { q: 9, r: 1, i: 0, b: 3 });
  });

  // ══════════════ Estorno (so aprovado) ══════════════
  await test('[estorno] inspecao 3/0 reserva para R5; o estorno da ENTRADA_COMPRA (GESTOR) -> 200, a reserva da inspecao LIBERADA pela B374, R5 volta a esperar', async () => {
    const m = await material();
    const ped = await pedidoAvulso([[m.id, 3]]);
    const R5 = await aprovada(SOL_A, [[m.id, 3]]);
    const antes = R5.status;
    assert.ok(EM_ESPERA.includes(antes), antes);
    const rec = await receber(ped, [[m.id, 3]]);
    assert.deepStrictEqual(await reservas(R5.id), [], 'premissa: retido');
    const ins = await inspecionar(rec, m.id, 3, 0);
    assert.strictEqual(ins.status, 201, JSON.stringify(ins.body));
    assert.strictEqual(await st(R5.id), 'TOTALMENTE_RESERVADA');
    assert.strictEqual(await holdAtivo(R5.id), 3);

    const sem = await as(QUA, () => request(app).post(`${API}/movimentacoes/${'0'}/cancelar`).send({ motivo: 'x' }));
    assert.strictEqual(sem.status, 403, 'premissa: a QUALIDADE nao estorna (gate real)');
    const e = await as(GES, async () => request(app).post(`${API}/movimentacoes/${await movEntrada(rec, m.id)}/cancelar`).send({ motivo: 'estorno e75t4' }));
    assert.strictEqual(e.status, 200, `estorno: ${JSON.stringify(e.body)}`);
    const numRec = await numero('recebimentos_material_almoxarifado', rec);
    assert.deepStrictEqual((await reservas(R5.id)).map((r) => [r.status, r.motivo_liberacao, r.recebimento_id]),
      [['LIBERADA', `Estorno da entrada do recebimento ${numRec}`, rec]]);
    assert.ok(EM_ESPERA.includes(await st(R5.id)), `R5 volta a esperar: ${await st(R5.id)}`);
    assert.deepStrictEqual(await mat(m.id), { q: 0, r: 0, i: 0, b: 0 });
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
