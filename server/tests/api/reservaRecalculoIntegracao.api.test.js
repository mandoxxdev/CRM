/**
 * Etapa 76, Task 3 (integracao: T1 x T2 x 74) — a jornada de quem perde e ganha a reserva.
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa76-liberar-expirar-recalcula-status.md (T3; a
 * secao "Fase 2 — revisao do plano" prevalece: a validade e ligada ANTES da nota, porque o `expira_em` e
 * calculado na CRIACAO da reserva).
 *
 * TUDO PELAS ROTAS e com usuarios REAIS POR PERFIL pelo gate real: o solicitante e chao de fabrica (sem
 * perfil -> PRODUCAO), o GESTOR aprova, o ALMOXARIFE libera/separa/entrega, o COMPRAS compra e recebe a
 * nota pelas seis portas, o ADMINISTRADOR roda o job. O usuario padrao do harness e CONSULTA: uma rota
 * chamada sem `as(...)` responde 403 e o teste cai — nada passa por engano como administrador.
 *
 * Jornada: material com 4 -> R1 (URGENTE, 4) aprovada -> TOTALMENTE_RESERVADA; R2 (NORMAL, 4) aprovada ->
 * AGUARDANDO_ESTOQUE -> o ALMOXARIFE libera a reserva de R1 (tela Reservas) -> R1 APROVADO (a C127
 * resolvida), R2 continua AGUARDANDO_ESTOQUE (D2: o liberado nao e redistribuido); fila: as duas SEPARAR;
 * painel lista R1 como APROVADO -> validade ligada -> nota de 4 -> a 74 reserva para R1 (URGENTE, e APROVADO
 * e candidata) -> R1 TOTALMENTE de novo; R2 nada (teto da 74: so os 4 desta nota) -> R3 (4) aprovada leva os
 * 4 livres (a consequencia declarada da D2) -> o job vence as reservas de R1 e R3 -> as duas APROVADO; R2
 * intacta -> o ALMOXARIFE separa e entrega R1 do disponivel -> ENTREGUE.
 *
 * A corrida pela rota fica na T1 (RN-07); aqui nao.
 *
 * Executar: cd server && node tests/api/reservaRecalculoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message.replace(/\s*\n\s*/g, ' ')}`); });
}

const CONSULTA = { id: 7630, nome: 'Consulta E76T3', perfil_almoxarifado: 'CONSULTA', email: 'c76t3@test.com' };
const SOL = { id: 7631, nome: 'Solicitante E76T3', email: 's76t3@test.com' }; // sem perfil -> PRODUCAO
const GES = { id: 7632, nome: 'Gestor E76T3', perfil_almoxarifado: 'GESTOR', email: 'g76t3@test.com' };
const ALM = { id: 7633, nome: 'Almoxarife E76T3', perfil_almoxarifado: 'ALMOXARIFE', email: 'a76t3@test.com' };
const COMP = { id: 7634, nome: 'Compras E76T3', perfil_almoxarifado: 'COMPRAS', email: 'cp76t3@test.com' };
const ADM = { id: 7635, nome: 'Admin E76T3', perfil_almoxarifado: 'ADMINISTRADOR', email: 'ad76t3@test.com' };
const API = '/api/almoxarifado';
// Rede contra teste vazio: se o event loop esvaziar no meio, o Node sairia com 0 sem placar.
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 76 Task 3: a jornada de quem perde e ganha a reserva (integracao) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...CONSULTA } });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...CONSULTA }); } };
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const u of [SOL, GES, ALM, COMP, ADM]) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [u.id, u.nome, u.email]);
  }
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn E76T3','76300000000175','ativo')")).lastID;
  const setConfig = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
  await setConfig('liberacao_valor_ativo', '0');
  await setConfig('aprovacao_automatica', '0');

  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const reservas = (reqId) => dbAll(db, `SELECT id, quantidade, quantidade_utilizada, status, origem, recebimento_id, expira_em
    FROM reservas_material_almoxarifado WHERE requisicao_id = ? ORDER BY id`, [reqId]);
  const holdAtivo = async (reqId) => (await reservas(reqId)).filter((r) => r.status === 'ATIVA')
    .reduce((s, r) => s + Number(r.quantidade) - Number(r.quantidade_utilizada || 0), 0);
  const mat = async (m) => ({ ...(await dbGet(db, `SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r
    FROM materiais_almoxarifado WHERE id = ?`, [m])) });
  const itemDe = async (reqId) => (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [reqId])).id;

  /** Cria (como o solicitante, PRODUCAO) e aprova (GESTOR); confere resposta = banco. */
  const aprovada = async (itens, { urgencia } = {}) => {
    const extra = urgencia ? { urgencia, justificativa_urgencia: 'linha parada e76t3' } : {};
    const cr = await as(SOL, () => request(app).post(`${API}/requisicoes`)
      .send({ os_referencia: 'OS-INT', ...extra, itens: itens.map(([material_id, quantidade]) => ({ material_id, quantidade })) }));
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    assert.strictEqual(cr.body.status, 'PENDENTE', `premissa: criada PENDENTE: ${JSON.stringify(cr.body)}`);
    const r = await as(GES, () => request(app).put(`${API}/requisicoes/${cr.body.id}/aprovar`).send({}));
    assert.strictEqual(r.status, 200, `aprovar: ${JSON.stringify(r.body)}`);
    const gravado = await st(cr.body.id);
    assert.strictEqual(r.body.status, gravado, `/aprovar: resposta ${r.body.status} x banco ${gravado}`);
    return { id: cr.body.id, numero: cr.body.numero, status: gravado };
  };
  const pedidoAvulso = async (m, quantidade) => as(COMP, async () => {
    const p = await request(app).post('/api/compras/pedidos').send({ fornecedor_id: forn, status: 'pendente',
      itens: [{ material_id: m, quantidade, valor_unitario: 1 }] });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    return { id: p.body.id, linha: (await dbGet(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ?', [p.body.id])).id };
  });
  /** A nota pelas seis portas (COMPRAS): criar -> conferir -> encaminhar/finalizar/faturar -> fiscal -> processar. */
  const receber = async (pedido, m, quantidade) => as(COMP, async () => {
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
      nota_fiscal: `NF-E76T3-${id}`, fornecedor_id: forn, fornecedor_nome: 'Forn E76T3',
      data_emissao_nf: d, data_entrada_nf: d, valor_total_nota: quantidade, itens,
    });
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    const p = await request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(p.status, 200, `processar: ${JSON.stringify(p.body)}`);
    return id;
  });
  const fila = async () => {
    const f = await as(ALM, () => request(app).get(`${API}/fila-separacao`));
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    return f.body;
  };
  const painel = async () => {
    const r = await as(ALM, () => request(app).get(`${API}/dashboard/requisicoes`));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.abertas.map((x) => [Number(x.id), x.status]);
  };

  // ══════════════ A jornada ══════════════
  const j = {};
  await test('[jornada 1] material com 4: R1 (URGENTE, 4) aprovada pelo GESTOR -> TOTALMENTE_RESERVADA; R2 (NORMAL, 4) -> AGUARDANDO_ESTOQUE', async () => {
    j.m = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, custo_unitario, ativo, fornecedor_id, material_critico)
      VALUES ('E76T3-M1', 'Mat E76T3', 'PC', 4, 0, 0, 10, 1, ?, 0)`, [forn])).lastID;
    j.R1 = await aprovada([[j.m, 4]], { urgencia: 'URGENTE' });
    j.R2 = await aprovada([[j.m, 4]]);
    assert.deepStrictEqual([j.R1.status, j.R2.status], ['TOTALMENTE_RESERVADA', 'AGUARDANDO_ESTOQUE']);
    const [r] = await reservas(j.R1.id);
    j.reservaAprovacaoR1 = r.id;
    assert.deepStrictEqual(await mat(j.m), { q: 4, r: 4 });
  });

  await test('[jornada 2] o ALMOXARIFE libera a reserva de R1 (tela Reservas): 200 de sempre, R1 APROVADO; R2 continua AGUARDANDO_ESTOQUE sem nada', async () => {
    assert.ok(j.R1, 'premissa: jornada 1');
    const lib = await as(ALM, () => request(app).post(`${API}/reservas/${j.reservaAprovacaoR1}/liberar`).send({ motivo: 'prioridade mudou e76t3' }));
    assert.strictEqual(lib.status, 200, JSON.stringify(lib.body));
    assert.deepStrictEqual(lib.body, { success: true, reserva_id: j.reservaAprovacaoR1, quantidade_liberada: 4, status: 'LIBERADA' });
    assert.strictEqual(await st(j.R1.id), 'APROVADO', 'a C127: R1 nao diz mais Totalmente Reservada sem nada seguro');
    assert.deepStrictEqual([await st(j.R2.id), await holdAtivo(j.R2.id)], ['AGUARDANDO_ESTOQUE', 0], 'D2: o liberado nao e redistribuido');
    assert.deepStrictEqual(await mat(j.m), { q: 4, r: 0 });
  });

  await test('[jornada 3] a fila mostra as duas para SEPARAR (le o saldo) e o painel Requisicoes Abertas lista R1 como APROVADO', async () => {
    assert.ok(j.R1, 'premissa: jornada 1');
    const f = await fila();
    const linha = (id) => f.find((x) => x.id === id);
    for (const r of [j.R1, j.R2]) {
      assert.ok(linha(r.id) && linha(r.id).etapas.includes('SEPARAR'), `${r.numero}: ${JSON.stringify(linha(r.id))}`);
    }
    const p = await painel();
    assert.deepStrictEqual(p.find(([id]) => id === j.R1.id), [j.R1.id, 'APROVADO']);
  });

  await test('[jornada 4] validade ligada, nota de 4 (COMPRAS): a 74 reserva para R1 (URGENTE; APROVADO e candidata) -> TOTALMENTE de novo; R2 nada', async () => {
    assert.ok(j.R1, 'premissa: jornada 1');
    // Fase 2: o expira_em e calculado na CRIACAO da reserva — a validade liga ANTES da nota.
    await setConfig('reserva_dias_validade', '1');
    j.rec = await receber(await pedidoAvulso(j.m, 4), j.m, 4);
    const r1 = (await reservas(j.R1.id)).filter((r) => r.status === 'ATIVA');
    assert.deepStrictEqual(r1.map((r) => [Number(r.quantidade), r.origem, r.recebimento_id, !!r.expira_em]),
      [[4, 'REQUISICAO', j.rec, true]], 'a reserva da chegada de R1, com vencimento');
    assert.strictEqual(await st(j.R1.id), 'TOTALMENTE_RESERVADA', 'o recalculo da 74 leva APROVADO -> TOTALMENTE');
    assert.deepStrictEqual([await st(j.R2.id), await holdAtivo(j.R2.id)], ['AGUARDANDO_ESTOQUE', 0],
      'teto da 74: so os 4 desta nota; os 4 liberados continuam livres (D2, declarado)');
    assert.deepStrictEqual(await mat(j.m), { q: 8, r: 4 });
  });

  await test('[jornada 5] R3 (NORMAL, 4) aprovada depois leva os 4 livres (a consequencia declarada da D2); R2 continua esperando', async () => {
    assert.ok(j.rec, 'premissa: jornada 4');
    j.R3 = await aprovada([[j.m, 4]]);
    assert.strictEqual(j.R3.status, 'TOTALMENTE_RESERVADA');
    assert.ok((await reservas(j.R3.id))[0].expira_em, 'a reserva da aprovacao tambem vence');
    assert.deepStrictEqual([await st(j.R2.id), await holdAtivo(j.R2.id)], ['AGUARDANDO_ESTOQUE', 0]);
    assert.deepStrictEqual(await mat(j.m), { q: 8, r: 8 });
  });

  await test('[jornada 6] o ADMINISTRADOR roda o job com referencia futura: as reservas de R1 e R3 vencem; R1 e R3 -> APROVADO; R2 intacta', async () => {
    assert.ok(j.R3, 'premissa: jornada 5');
    const semPerfil = await as(ALM, () => request(app).post(`${API}/reservas/processar-expiracao`).send({ referencia: '2099-01-01' }));
    assert.strictEqual(semPerfil.status, 403, 'o job e do ADMINISTRADOR');
    const p = await as(ADM, () => request(app).post(`${API}/reservas/processar-expiracao`).send({ referencia: '2099-01-01' }));
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    assert.deepStrictEqual(Object.keys(p.body).sort(), ['erros', 'liberadas', 'processadas', 'success']);
    assert.deepStrictEqual([p.body.processadas, p.body.erros], [2, []]);
    assert.deepStrictEqual([await st(j.R1.id), await st(j.R3.id)], ['APROVADO', 'APROVADO'], 'a C127 pela porta da expiracao');
    assert.deepStrictEqual([await st(j.R2.id), await holdAtivo(j.R2.id)], ['AGUARDANDO_ESTOQUE', 0]);
    assert.deepStrictEqual(await mat(j.m), { q: 8, r: 0 });
  });

  await test('[jornada 7] o ALMOXARIFE separa e entrega R1 do disponivel: APROVADO -> ENTREGUE', async () => {
    assert.ok(j.R1, 'premissa: jornada 1');
    const item = await itemDe(j.R1.id);
    const s = await as(ALM, () => request(app).put(`${API}/requisicoes/${j.R1.id}/separar`)
      .send({ itens_separados: [{ item_id: item, quantidade_separada: 4 }] }));
    assert.strictEqual(s.status, 200, `separar: ${JSON.stringify(s.body)}`);
    const e = await as(ALM, () => request(app).put(`${API}/requisicoes/${j.R1.id}/entregar`)
      .send({ itens_atendidos: [{ item_id: item, quantidade_atendida: 4 }] }));
    assert.strictEqual(e.status, 200, `entregar: ${JSON.stringify(e.body)}`);
    assert.strictEqual(await st(j.R1.id), 'ENTREGUE');
    assert.deepStrictEqual(await mat(j.m), { q: 4, r: 0 });
  });

  terminou = true;
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
