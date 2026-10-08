/**
 * Etapa 77, Task 3 (integracao: T0 x T1 x a 76 x a 74) — a reserva da requisicao so sai pela requisicao.
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa77-reserva-requisicao-so-pela-requisicao.md (T3;
 * a secao "Fase 2 — revisao do plano" prevalece: o 403 da liberacao sai SEM `perfil`).
 *
 * Esta e a unica prova de duas coisas (secao "Teste de integracao" do plano):
 *  1. a FIACAO da entrega — a marca `requisicaoDaEntrega` no 4o argumento — so e provada entrando pela
 *     rota `PUT /requisicoes/:id/entregar` COM a recusa do motor ligada (o RN-03 (d) da T1, pelo servico,
 *     passaria com a entrega sem a marca);
 *  2. a checagem nova da liberacao (T0) ANTES do gancho de recalculo da 76: o dono libera parte -> passa
 *     pela `assertPodeLiberarReserva` E recalcula, duas pecas de etapas diferentes na mesma rota.
 *
 * TUDO PELAS ROTAS e com usuarios REAIS POR PERFIL pelo gate real: o solicitante e chao de fabrica (sem
 * perfil -> PRODUCAO), o GESTOR aprova, o ALMOXARIFE movimenta/separa/entrega, a ENGENHARIA reserva para
 * si, o COMPRAS compra e recebe a nota pelas seis portas. O usuario padrao do harness e CONSULTA: uma rota
 * chamada sem `as(...)` responde 403 e o teste cai — nada passa por engano como administrador.
 *
 * Jornada: material com 10 -> S cria R(6), GESTOR aprova -> TOTALMENTE_RESERVADA -> a v2 do ALMOXARIFE
 * com o reserva_id -> 400 M1, nada mudou -> outro PRODUCAO e a ENGENHARIA tentam liberar -> 403 M2 ->
 * metade manual (ENGENHARIA reserva 2, a v2 consome -> 201; outra manual liberada por PRODUCAO alheio ->
 * 200, declarado) -> S libera 2 -> 200, PARCIALMENTE_RESERVADA -> GET /reservas mostra numero e dono ->
 * ALMOXARIFE separa e entrega 6: 4 consomem a reserva, 2 saem do disponivel -> R ENTREGUE.
 * Chegada (74): material com 0 -> R2(3) aprovada AGUARDANDO_ESTOQUE -> nota de 3 -> reserva da chegada
 * para R2 (origem REQUISICAO, recebimento_id) -> a v2 com ela -> 400 M1 -> a entrega de R2 a consome.
 *
 * Executar: cd server && node tests/api/reservaRequisicaoPortaIntegracao.api.test.js
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

const CONSULTA = { id: 7770, nome: 'Consulta E77T3', perfil_almoxarifado: 'CONSULTA', email: 'c77t3@test.com' };
const SOL = { id: 7771, nome: 'Solicitante E77T3', email: 's77t3@test.com' }; // sem perfil -> PRODUCAO
const GES = { id: 7772, nome: 'Gestor E77T3', perfil_almoxarifado: 'GESTOR', email: 'g77t3@test.com' };
const ALM = { id: 7773, nome: 'Almoxarife E77T3', perfil_almoxarifado: 'ALMOXARIFE', email: 'a77t3@test.com' };
const PROD = { id: 7774, nome: 'Producao alheia E77T3', perfil_almoxarifado: 'PRODUCAO', email: 'p77t3@test.com' };
const ENG = { id: 7775, nome: 'Engenharia E77T3', perfil_almoxarifado: 'ENGENHARIA', email: 'e77t3@test.com' };
const COMP = { id: 7776, nome: 'Compras E77T3', perfil_almoxarifado: 'COMPRAS', email: 'cp77t3@test.com' };
const API = '/api/almoxarifado';
const ACAO = 'liberar_reserva_requisicao';
const M1 = (reservaId, numero) => `A reserva ${reservaId} é da requisição ${numero} — o material reservado para ela só sai pela entrega da requisição (tela Requisições), não por movimentação avulsa`;
const M2 = (numero) => `Sem permissão para liberar a reserva da requisição ${numero}: só quem pediu a requisição, o almoxarife ou o administrador liberam`;
// Rede contra teste vazio: se o event loop esvaziar no meio, o Node sairia com 0 sem placar.
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 77 Task 3: a reserva da requisicao so sai pela requisicao (integracao) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...CONSULTA } });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...CONSULTA }); } };
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const u of [SOL, GES, ALM, PROD, ENG, COMP]) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [u.id, u.nome, u.email]);
  }
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn E77T3','77300000000175','ativo')")).lastID;
  const setConfig = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
  await setConfig('liberacao_valor_ativo', '0');
  await setConfig('aprovacao_automatica', '0');

  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const reserva = (id) => dbGet(db, 'SELECT * FROM reservas_material_almoxarifado WHERE id = ?', [id]);
  const reservasDe = (reqId) => dbAll(db, `SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ? ORDER BY id`, [reqId]);
  const mat = async (m) => ({ ...(await dbGet(db, `SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r
    FROM materiais_almoxarifado WHERE id = ?`, [m])) });
  const livro = async (m) => (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ?', [m])).n;
  const itemDe = async (reqId) => dbGet(db, 'SELECT id, quantidade_entregue FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [reqId]);
  const liberacoes = async (rid) => (await dbGet(db, `SELECT COUNT(*) n FROM movimentacoes_almoxarifado
    WHERE reserva_id = ? AND tipo = 'LIBERACAO_RESERVA'`, [rid])).n;
  const v2 = (body) => as(ALM, () => request(app).post(`${API}/movimentacoes/v2`)
    .send({ justificativa: 'teste e77t3', motivo: 'teste e77t3', ...body }));
  const liberarComo = (u, id, body = {}) => as(u, () => request(app).post(`${API}/reservas/${id}/liberar`)
    .send({ motivo: 'teste e77t3', ...body }));
  const material = async (codigo, q) => (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, custo_unitario, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', ?, 0, 0, 10, 1, ?, 0)`, [codigo, `Mat ${codigo}`, q, forn])).lastID;

  /** Cria (como o solicitante S, sem perfil -> PRODUCAO) e aprova (GESTOR); confere resposta = banco. */
  const aprovada = async (m, quantidade) => {
    const cr = await as(SOL, () => request(app).post(`${API}/requisicoes`)
      .send({ os_referencia: 'OS-E77T3', itens: [{ material_id: m, quantidade }] }));
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    assert.strictEqual(cr.body.status, 'PENDENTE', `premissa: criada PENDENTE: ${JSON.stringify(cr.body)}`);
    const r = await as(GES, () => request(app).put(`${API}/requisicoes/${cr.body.id}/aprovar`).send({}));
    assert.strictEqual(r.status, 200, `aprovar: ${JSON.stringify(r.body)}`);
    const gravado = await st(cr.body.id);
    assert.strictEqual(r.body.status, gravado, `/aprovar: resposta ${r.body.status} x banco ${gravado}`);
    return { id: cr.body.id, numero: cr.body.numero, status: gravado };
  };
  const separarEEntregar = (reqId, itemId, q) => as(ALM, async () => {
    const s = await request(app).put(`${API}/requisicoes/${reqId}/separar`)
      .send({ itens_separados: [{ item_id: itemId, quantidade_separada: q }] });
    assert.strictEqual(s.status, 200, `separar: ${JSON.stringify(s.body)}`);
    return request(app).put(`${API}/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemId, quantidade_atendida: q }] });
  });
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
      nota_fiscal: `NF-E77T3-${id}`, fornecedor_id: forn, fornecedor_nome: 'Forn E77T3',
      data_emissao_nf: d, data_entrada_nf: d, valor_total_nota: quantidade, itens,
    });
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    const p = await request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(p.status, 200, `processar: ${JSON.stringify(p.body)}`);
    return id;
  });

  // ══════════════ A jornada pela rota ══════════════
  const j = {};

  await test('[jornada 1] material com 10: S (sem perfil -> PRODUCAO) cria R(6), o GESTOR aprova -> TOTALMENTE_RESERVADA, reserva origem REQUISICAO', async () => {
    j.m = await material('E77T3-M1', 10);
    // Fase 5 (sobrevivente 4): uma requisicao RASCUNHO avulsa com dois itens, de outro material, descola o
    // id da requisicao do id do item — sem isto os dois andavam juntos e a jornada 8 passava com o JOIN
    // da listagem feito por `r.item_requisicao_id`.
    const mAv = await material('E77T3-AV', 1);
    const av = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo)
      VALUES ('REQ-E77T3-AV', ?, ?, 'RASCUNHO', 'NORMAL', '2026-09-01 10:00:00', 1)`, [SOL.id, SOL.nome])).lastID;
    for (let i = 0; i < 2; i++) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
        VALUES (?,?,1,0,0,0)`, [av, mAv]);
    }
    j.R = await aprovada(j.m, 6);
    assert.strictEqual(j.R.status, 'TOTALMENTE_RESERVADA');
    const rs = await reservasDe(j.R.id);
    assert.strictEqual(rs.length, 1, JSON.stringify(rs));
    j.res = rs[0];
    assert.deepStrictEqual([j.res.status, j.res.origem, Number(j.res.quantidade)], ['ATIVA', 'REQUISICAO', 6]);
    // A coluna da reserva e o APROVADOR (Surpresa 2) — quem pediu e S, na requisicao.
    assert.strictEqual(Number(j.res.solicitante_id), GES.id);
    assert.notStrictEqual(Number(j.res.item_requisicao_id), Number(j.R.id), 'pre-condicao: id do item e da requisicao tinham de divergir');
    assert.deepStrictEqual(await mat(j.m), { q: 10, r: 6 });
  });

  await test('[jornada 2] (C136) o ALMOXARIFE tenta a v2 SAIDA com o reserva_id da requisicao: 400 M1 e nada mudou', async () => {
    assert.ok(j.res, 'premissa: jornada 1');
    const antes = { mat: await mat(j.m), livro: await livro(j.m) };
    const s = await v2({ material_id: j.m, tipo: 'SAIDA', quantidade: 6, reserva_id: j.res.id });
    assert.strictEqual(s.status, 400, `a v2 consumiu a reserva da requisicao: ${s.status} ${JSON.stringify(s.body)}`);
    assert.strictEqual(s.body.error, M1(j.res.id, j.R.numero));
    const rv = await reserva(j.res.id);
    assert.deepStrictEqual([rv.status, Number(rv.quantidade), Number(rv.quantidade_utilizada || 0)], ['ATIVA', 6, 0], 'a reserva mudou');
    assert.deepStrictEqual(await mat(j.m), antes.mat, 'o material mudou');
    assert.strictEqual(await livro(j.m), antes.livro, 'linha nova no livro do material');
    assert.strictEqual(await st(j.R.id), 'TOTALMENTE_RESERVADA');
    assert.strictEqual(Number((await itemDe(j.R.id)).quantidade_entregue || 0), 0, 'o item ganhou entregue');
  });

  await test('[jornada 3] (C137) OUTRO PRODUCAO tenta liberar a reserva de R: 403 M2 sem perfil, reserva intacta', async () => {
    assert.ok(j.res, 'premissa: jornada 1');
    const lib = await liberarComo(PROD, j.res.id);
    assert.strictEqual(lib.status, 403, `PRODUCAO liberou sem ${ACAO}: ${lib.status} ${JSON.stringify(lib.body)}`);
    assert.deepStrictEqual(lib.body, { error: M2(j.R.numero), acao: ACAO });
    assert.deepStrictEqual([(await reserva(j.res.id)).status, await liberacoes(j.res.id)], ['ATIVA', 0]);
    assert.strictEqual(await st(j.R.id), 'TOTALMENTE_RESERVADA');
  });

  await test('[jornada 4] (C137) a ENGENHARIA tenta liberar: 403 M2, reserva intacta', async () => {
    assert.ok(j.res, 'premissa: jornada 1');
    const lib = await liberarComo(ENG, j.res.id);
    assert.strictEqual(lib.status, 403, `ENGENHARIA liberou sem ${ACAO}: ${lib.status} ${JSON.stringify(lib.body)}`);
    assert.deepStrictEqual(lib.body, { error: M2(j.R.numero), acao: ACAO });
    assert.deepStrictEqual([(await reserva(j.res.id)).status, await liberacoes(j.res.id)], ['ATIVA', 0]);
    assert.deepStrictEqual(await mat(j.m), { q: 10, r: 6 });
  });

  await test('[jornada 5] metade manual no mesmo material: ENGENHARIA reserva 2, a v2 do ALMOXARIFE a consome -> 201; a de R segue intacta', async () => {
    assert.ok(j.res, 'premissa: jornada 1');
    const cria = await as(ENG, () => request(app).post(`${API}/reservas`).send({ material_id: j.m, quantidade: 2, projeto_id: 7 }));
    assert.strictEqual(cria.status, 201, JSON.stringify(cria.body));
    const s = await v2({ material_id: j.m, tipo: 'SAIDA', quantidade: 2, reserva_id: cria.body.id });
    assert.strictEqual(s.status, 201, `a manual foi recusada: ${JSON.stringify(s.body)}`);
    const man = await reserva(cria.body.id);
    assert.deepStrictEqual([man.status, man.origem, man.requisicao_id], ['CONSUMIDA', 'MANUAL', null]);
    assert.strictEqual((await reserva(j.res.id)).status, 'ATIVA');
    assert.deepStrictEqual(await mat(j.m), { q: 8, r: 6 });
  });

  await test('[jornada 6] outra manual (ENGENHARIA, 1) liberada por PRODUCAO alheio -> 200 (D6/Surpresa 5: declarado, C novo)', async () => {
    assert.ok(j.res, 'premissa: jornada 1');
    const cria = await as(ENG, () => request(app).post(`${API}/reservas`).send({ material_id: j.m, quantidade: 1, projeto_id: 7 }));
    assert.strictEqual(cria.status, 201, JSON.stringify(cria.body));
    const lib = await liberarComo(PROD, cria.body.id);
    assert.strictEqual(lib.status, 200, JSON.stringify(lib.body));
    assert.strictEqual((await reserva(cria.body.id)).status, 'LIBERADA');
    assert.deepStrictEqual(await mat(j.m), { q: 8, r: 6 });
  });

  await test('[jornada 7] S (quem pediu, sem perfil) libera 2: 200 com o corpo de sempre, R PARCIALMENTE_RESERVADA (T0 x recalculo da 76)', async () => {
    assert.ok(j.res, 'premissa: jornada 1');
    const lib = await liberarComo(SOL, j.res.id, { quantidade: 2 });
    assert.strictEqual(lib.status, 200, `o solicitante foi barrado: ${JSON.stringify(lib.body)}`);
    assert.deepStrictEqual(Object.keys(lib.body).sort(), ['quantidade_liberada', 'reserva_id', 'status', 'success']);
    assert.strictEqual(Number(lib.body.quantidade_liberada), 2);
    const rv = await reserva(j.res.id);
    assert.deepStrictEqual([rv.status, Number(rv.quantidade) - Number(rv.quantidade_utilizada || 0)], ['ATIVA', 4]);
    assert.strictEqual(await st(j.R.id), 'PARCIALMENTE_RESERVADA', 'o gancho da 76 tinha de recalcular depois da checagem nova');
    assert.deepStrictEqual(await mat(j.m), { q: 8, r: 4 });
  });

  await test('[jornada 8] GET /reservas (PRODUCAO alheio le): a de R traz o NUMERO e requisicao_solicitante_id = S', async () => {
    assert.ok(j.res, 'premissa: jornada 1');
    const lista = await as(PROD, () => request(app).get(`${API}/reservas`));
    assert.strictEqual(lista.status, 200, JSON.stringify(lista.body));
    const linha = lista.body.find((x) => x.id === j.res.id);
    assert.ok(linha, 'a reserva de R tinha de vir na lista');
    assert.strictEqual(linha.requisicao_numero, j.R.numero);
    assert.strictEqual(Number(linha.requisicao_solicitante_id), SOL.id);
    assert.strictEqual(Number(linha.solicitante_id), GES.id, 'a coluna da reserva continua o aprovador');
  });

  await test('[jornada 9] (fiacao da entrega) o ALMOXARIFE separa e entrega 6: 4 consomem a reserva (reserva_id + requisicao_id), 2 do disponivel; R ENTREGUE', async () => {
    assert.ok(j.res, 'premissa: jornada 1');
    const item = await itemDe(j.R.id);
    const e = await separarEEntregar(j.R.id, item.id, 6);
    assert.strictEqual(e.status, 200, `a entrega foi recusada: ${JSON.stringify(e.body)}`);
    const rv = await reserva(j.res.id);
    assert.deepStrictEqual([rv.status, Number(rv.quantidade_utilizada)], ['CONSUMIDA', 4]);
    const saidas = await dbAll(db, `SELECT quantidade, reserva_id, requisicao_id FROM movimentacoes_almoxarifado
      WHERE material_id = ? AND tipo = 'SAIDA' AND requisicao_id = ? ORDER BY id`, [j.m, j.R.id]);
    const norm = saidas.map((x) => [Number(x.quantidade), x.reserva_id == null ? null : Number(x.reserva_id), Number(x.requisicao_id)])
      .sort((a, b) => a[0] - b[0]);
    assert.deepStrictEqual(norm, [[2, null, j.R.id], [4, j.res.id, j.R.id]], `as baixas da entrega: ${JSON.stringify(saidas)}`);
    assert.strictEqual(Number((await itemDe(j.R.id)).quantidade_entregue), 6);
    assert.deepStrictEqual(await mat(j.m), { q: 2, r: 0 });
    assert.strictEqual(await st(j.R.id), 'ENTREGUE');
  });

  // ══════════════ A reserva da chegada (74) e reserva de requisicao ══════════════
  const c = {};

  await test('[chegada 1] material com 0: R2(3) aprovada AGUARDANDO_ESTOQUE; a nota de 3 (COMPRAS) cria a reserva da chegada para R2', async () => {
    c.m = await material('E77T3-M2', 0);
    c.R2 = await aprovada(c.m, 3);
    assert.strictEqual(c.R2.status, 'AGUARDANDO_ESTOQUE');
    c.rec = await receber(await pedidoAvulso(c.m, 3), c.m, 3);
    const ativas = (await reservasDe(c.R2.id)).filter((r) => r.status === 'ATIVA');
    assert.deepStrictEqual(ativas.map((r) => [Number(r.quantidade), r.origem, Number(r.recebimento_id)]),
      [[3, 'REQUISICAO', c.rec]], 'a reserva da chegada de R2');
    c.res = ativas[0];
    assert.strictEqual(await st(c.R2.id), 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual(await mat(c.m), { q: 3, r: 3 });
  });

  await test('[chegada 2] (C136) a v2 do ALMOXARIFE com o reserva_id da chegada: 400 M1 (e reserva de requisicao), nada mudou', async () => {
    assert.ok(c.res, 'premissa: chegada 1');
    const antes = { mat: await mat(c.m), livro: await livro(c.m) };
    const s = await v2({ material_id: c.m, tipo: 'SAIDA', quantidade: 3, reserva_id: c.res.id });
    assert.strictEqual(s.status, 400, `a v2 consumiu a reserva da chegada: ${s.status} ${JSON.stringify(s.body)}`);
    assert.strictEqual(s.body.error, M1(c.res.id, c.R2.numero));
    const rv = await reserva(c.res.id);
    assert.deepStrictEqual([rv.status, Number(rv.quantidade_utilizada || 0)], ['ATIVA', 0]);
    assert.deepStrictEqual(await mat(c.m), antes.mat);
    assert.strictEqual(await livro(c.m), antes.livro);
    assert.strictEqual(await st(c.R2.id), 'TOTALMENTE_RESERVADA');
  });

  await test('[chegada 3] a entrega de R2 pela rota consome a reserva da chegada: CONSUMIDA, SAIDA com reserva_id + requisicao_id, ENTREGUE', async () => {
    assert.ok(c.res, 'premissa: chegada 1');
    const item = await itemDe(c.R2.id);
    const e = await separarEEntregar(c.R2.id, item.id, 3);
    assert.strictEqual(e.status, 200, `a entrega foi recusada: ${JSON.stringify(e.body)}`);
    const rv = await reserva(c.res.id);
    assert.deepStrictEqual([rv.status, Number(rv.quantidade_utilizada)], ['CONSUMIDA', 3]);
    const mov = await dbAll(db, `SELECT quantidade, reserva_id, requisicao_id FROM movimentacoes_almoxarifado
      WHERE material_id = ? AND tipo = 'SAIDA'`, [c.m]);
    assert.deepStrictEqual(mov.map((x) => [Number(x.quantidade), Number(x.reserva_id), Number(x.requisicao_id)]),
      [[3, c.res.id, c.R2.id]]);
    assert.deepStrictEqual(await mat(c.m), { q: 0, r: 0 });
    assert.strictEqual(await st(c.R2.id), 'ENTREGUE');
  });

  terminou = true;
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
