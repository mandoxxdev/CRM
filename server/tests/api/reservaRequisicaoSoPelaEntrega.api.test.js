/**
 * Etapa 77 (T1, C136) — a reserva de uma REQUISICAO so sai pela entrega da propria requisicao.
 *
 * Ate a 76, `stockService.registrarMovimentacao` consumia QUALQUER reserva citada por `reserva_id`
 * numa saida, sem olhar a origem: pela `POST /movimentacoes/v2` um ALMOXARIFE dava SAIDA, PERDA,
 * AJUSTE_NEGATIVO ou SAIDA_PRODUCAO com o `reserva_id` da reserva que a aprovacao criou para a
 * requisicao — a reserva virava CONSUMIDA, o material saia, e a requisicao continuava
 * TOTALMENTE_RESERVADA com entregue 0 (sonda da Fase 0: 201 nos quatro tipos). Era uma segunda porta
 * de entrega que pulava separacao, conferencia, assinatura e retirada.
 *
 * Agora o MOTOR recusa (400, literal M1) toda saida que consome reserva de origem REQUISICAO, salvo
 * quando o chamador marca `requisicaoDaEntrega` no 4o argumento (nunca do body) com o id da
 * requisicao DONA da reserva — e o unico que marca e `requisitionService.entregarRequisicao`.
 * A reserva MANUAL continua consumivel pela v2 (contrato da Etapa 4).
 *
 * RN-01 pela rota v2; RN-02 pela rota de entrega; RN-03 pelo servico (a marca); RN-04 precedencia.
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa77-reserva-requisicao-so-pela-requisicao.md (T1)
 *
 * Executar: cd server && node tests/api/reservaRequisicaoSoPelaEntrega.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const { TIPOS_SAIDA } = require('../../services/almoxarifado/movementTypes');
const { TIPOS_MOVIMENTO_ROTA } = require('../../services/almoxarifado/schemas');
const { REGRAS_VINCULO } = require('../../services/almoxarifado/movementRules');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message.replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Adm 77E', role: 'admin', is_superadmin: 1, email: 'a77e@t.com' };
const SOL = { id: 7721, nome: 'Sol 77E', role: 'user', email: 's77e@t.com' };
const ALMOXARIFE = { id: 7724, nome: 'Almox 77E', role: 'user', perfil_almoxarifado: 'ALMOXARIFE', email: 'x77e@t.com' };
const API = '/api/almoxarifado';
const M1 = (reservaId, numero) => `A reserva ${reservaId} é da requisição ${numero} — o material reservado para ela só sai pela entrega da requisição (tela Requisições), não por movimentação avulsa`;
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 77 (T1): a reserva de requisicao so sai pela entrega da requisicao ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };

  const material = async (q) => {
    const c = `E77E-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, material_critico)
      VALUES (?, ?, 'PC', ?, 0, 1, 0)`, [c, `Mat ${c}`, q])).lastID;
  };
  // Requisicao de `qPedida` pedida por SOL e aprovada pelo ADMIN pela rota: a reserva nasce origem
  // REQUISICAO com min(qPedida, estoque).
  const reqAprovada = async ({ estoque = 4, qPedida = 4 } = {}) => {
    const m = await material(estoque);
    const numero = `REQ-E77E-${++seq}`;
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo)
      VALUES (?, ?, ?, 'PENDENTE', 'NORMAL', '2026-09-01 10:00:00', 1)`, [numero, SOL.id, SOL.nome])).lastID;
    const itemId = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
      VALUES (?,?,?,0,0,0)`, [R, m, qPedida])).lastID;
    setUser({ ...ADMIN });
    const ap = await request(app).put(`${API}/requisicoes/${R}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    const r = await dbGet(db, `SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'`, [R]);
    assert.ok(r, 'a aprovacao tinha de criar a reserva');
    assert.strictEqual(r.origem, 'REQUISICAO');
    return { m, R, numero, r, itemId };
  };
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const reserva = (id) => dbGet(db, 'SELECT * FROM reservas_material_almoxarifado WHERE id = ?', [id]);
  const mat = (id) => dbGet(db, 'SELECT quantidade_atual, COALESCE(quantidade_reservada,0) AS reservada FROM materiais_almoxarifado WHERE id = ?', [id]);
  const entregue = async (itemId) => (await dbGet(db, 'SELECT quantidade_entregue FROM itens_requisicao_almoxarifado WHERE id = ?', [itemId])).quantidade_entregue;
  const livro = async (m) => (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ?', [m])).n;
  const v2 = (body) => as(ALMOXARIFE, () => request(app).post(`${API}/movimentacoes/v2`)
    .send({ justificativa: 'teste 77', motivo: 'teste 77', ...body }).then((x) => x));

  // "nada mudou": reserva ATIVA util 0, material atual/reservada como antes, R igual, item 0, livro igual.
  const assertNadaMudou = async (alvo, antes) => {
    const { m, R, r, itemId } = alvo;
    const rv = await reserva(r.id);
    assert.deepStrictEqual([rv.status, Number(rv.quantidade_utilizada || 0)], ['ATIVA', 0],
      `a reserva mudou: ${rv.status} util=${rv.quantidade_utilizada}`);
    assert.deepStrictEqual(await mat(m), antes.mat, 'o material mudou');
    assert.strictEqual(await st(R), antes.st, 'a requisicao mudou de status');
    assert.strictEqual(Number(await entregue(itemId)), 0, 'o item ganhou entregue');
    assert.strictEqual(await livro(m), antes.livro, 'linha nova no livro do material');
  };
  const foto = async ({ m, R }) => ({ mat: await mat(m), st: await st(R), livro: await livro(m) });

  // ══════════════ RN-01 — a saida generica (v2) nao consome reserva de requisicao ══════════════

  // Fase 5 (sobrevivente 1): a lista era escrita a mao com QUATRO tipos — restringir a recusa do motor a
  // eles (`['SAIDA','PERDA','AJUSTE_NEGATIVO','SAIDA_PRODUCAO'].includes(tipo)`) ficava verde, e
  // SAIDA_MONTAGEM/SAIDA_ASSISTENCIA consumiam a reserva da requisicao pela v2. Agora a lista e DERIVADA:
  // todo tipo de saida do motor (TIPOS_SAIDA) que a v2 aceita (TIPOS_MOVIMENTO_ROTA, que ja tira os
  // dedicados e as retencoes); o vinculo obrigatorio de cada um vem de REGRAS_VINCULO.
  const tiposSaidaV2 = TIPOS_SAIDA.filter((t) => TIPOS_MOVIMENTO_ROTA.includes(t));
  // Guarda da guarda: se o import quebrar e vier vazio, o loop passaria provando nada.
  for (const t of ['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'AJUSTE_NEGATIVO', 'PERDA']) {
    assert.ok(tiposSaidaV2.includes(t), `${t} sumiu da lista derivada: ${JSON.stringify(tiposSaidaV2)}`);
  }
  const casos = tiposSaidaV2.map((tipo) => [tipo,
    REGRAS_VINCULO[tipo] && REGRAS_VINCULO[tipo].vinculo === 'os_ou_projeto' ? { projeto_id: 7 } : {}]);
  for (const [tipo, extra] of casos) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[RN-01] v2 ${tipo}${extra.projeto_id ? ' + projeto' : ''} com o reserva_id da requisicao: 400 M1, nada mudou`, async () => {
      const alvo = await reqAprovada();
      const antes = await foto(alvo);
      assert.deepStrictEqual(antes.mat, { quantidade_atual: 4, reservada: 4 });
      assert.strictEqual(antes.st, 'TOTALMENTE_RESERVADA');
      const s = await v2({ material_id: alvo.m, tipo, quantidade: 4, reserva_id: alvo.r.id, ...extra });
      assert.strictEqual(s.status, 400, `${tipo} consumiu a reserva da requisicao: ${s.status} ${JSON.stringify(s.body)}`);
      assert.strictEqual(s.body.error, M1(alvo.r.id, alvo.numero));
      await assertNadaMudou(alvo, antes);
    });
  }

  await test('[RN-01] v2 SAIDA parcial (1 de 4) com o reserva_id da requisicao: o mesmo 400 M1', async () => {
    const alvo = await reqAprovada();
    const antes = await foto(alvo);
    const s = await v2({ material_id: alvo.m, tipo: 'SAIDA', quantidade: 1, reserva_id: alvo.r.id });
    assert.strictEqual(s.status, 400, `parcial consumiu: ${s.status} ${JSON.stringify(s.body)}`);
    assert.strictEqual(s.body.error, M1(alvo.r.id, alvo.numero));
    await assertNadaMudou(alvo, antes);
  });

  await test('[RN-01] metade positiva: reserva MANUAL pela v2 -> 201 CONSUMIDA (lado a lado com a recusada)', async () => {
    const alvo = await reqAprovada({ estoque: 10 });
    const rr = await as(ALMOXARIFE, () => request(app).post(`${API}/reservas`)
      .send({ material_id: alvo.m, quantidade: 4, projeto_id: 7 }).then((x) => x));
    assert.strictEqual(rr.status, 201, JSON.stringify(rr.body));
    const recusada = await v2({ material_id: alvo.m, tipo: 'SAIDA', quantidade: 4, reserva_id: alvo.r.id });
    assert.strictEqual(recusada.status, 400, JSON.stringify(recusada.body));
    const s = await v2({ material_id: alvo.m, tipo: 'SAIDA', quantidade: 4, reserva_id: rr.body.id });
    assert.strictEqual(s.status, 201, `a manual foi recusada: ${JSON.stringify(s.body)}`);
    const man = await reserva(rr.body.id);
    assert.deepStrictEqual([man.status, man.origem, man.requisicao_id], ['CONSUMIDA', 'MANUAL', null]);
    assert.strictEqual((await reserva(alvo.r.id)).status, 'ATIVA', 'a da requisicao nao podia ter sido tocada');
  });

  // ══════════════ RN-02 — a entrega da propria requisicao continua consumindo ══════════════

  const separarEEntregar = (alvo, q) => as(ALMOXARIFE, async () => {
    const sep = await request(app).put(`${API}/requisicoes/${alvo.R}/separacao`)
      .send({ itens_separados: [{ item_id: alvo.itemId, quantidade_separada: q }] });
    assert.strictEqual(sep.status, 200, `separacao: ${JSON.stringify(sep.body)}`);
    return request(app).put(`${API}/requisicoes/${alvo.R}/entregar`)
      .send({ itens_atendidos: [{ item_id: alvo.itemId, quantidade_atendida: q }] });
  });

  await test('[RN-02] entrega pela rota (ALMOXARIFE): 200, reserva CONSUMIDA, SAIDA cita reserva_id E requisicao_id, entregue 4', async () => {
    const alvo = await reqAprovada();
    const ent = await separarEEntregar(alvo, 4);
    assert.strictEqual(ent.status, 200, `a entrega foi recusada: ${JSON.stringify(ent.body)}`);
    const rv = await reserva(alvo.r.id);
    assert.deepStrictEqual([rv.status, Number(rv.quantidade_utilizada)], ['CONSUMIDA', 4]);
    const mov = await dbGet(db, `SELECT reserva_id, requisicao_id, quantidade FROM movimentacoes_almoxarifado
      WHERE material_id = ? AND tipo = 'SAIDA' ORDER BY id DESC LIMIT 1`, [alvo.m]);
    assert.deepStrictEqual([Number(mov.reserva_id), Number(mov.requisicao_id), Number(mov.quantidade)], [alvo.r.id, alvo.R, 4]);
    assert.strictEqual(Number(await entregue(alvo.itemId)), 4);
    assert.deepStrictEqual(await mat(alvo.m), { quantidade_atual: 0, reservada: 0 });
  });

  await test('[RN-02] entrega maior que a reserva (reserva 2, entrega 4): a reserva consome, o excedente sai do disponivel', async () => {
    const alvo = await reqAprovada({ estoque: 2, qPedida: 4 });
    assert.strictEqual(Number(alvo.r.quantidade), 2);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 4 WHERE id = ?', [alvo.m]);
    const ent = await separarEEntregar(alvo, 4);
    assert.strictEqual(ent.status, 200, `a entrega foi recusada: ${JSON.stringify(ent.body)}`);
    const rv = await reserva(alvo.r.id);
    assert.deepStrictEqual([rv.status, Number(rv.quantidade_utilizada)], ['CONSUMIDA', 2]);
    assert.strictEqual(Number(await entregue(alvo.itemId)), 4);
    assert.deepStrictEqual(await mat(alvo.m), { quantidade_atual: 0, reservada: 0 });
  });

  // ══════════════ RN-03 — a marca e do 4o argumento e e da requisicao certa (pelo servico) ══════════════

  const pelaServico = (alvo, extraParams = {}, opcoes) => stockService.registrarMovimentacao(db, ADMIN, {
    material_id: alvo.m, tipo: 'SAIDA', quantidade: 4, reserva_id: alvo.r.id,
    motivo: 'teste 77', justificativa: 'teste 77', ...extraParams,
  }, opcoes);
  const assertRecusaM1 = async (alvo, fn, rotulo) => {
    const antes = await foto(alvo);
    let erro = null;
    try { await fn(); } catch (e) { erro = e; }
    assert.ok(erro, `${rotulo}: consumiu a reserva da requisicao`);
    assert.strictEqual(erro.status, 400, `${rotulo}: ${erro.status} ${erro.message}`);
    assert.strictEqual(erro.message, M1(alvo.r.id, alvo.numero));
    await assertNadaMudou(alvo, antes);
  };

  await test('[RN-03] (a) servico sem 4o argumento: 400 M1', async () => {
    const alvo = await reqAprovada();
    await assertRecusaM1(alvo, () => pelaServico(alvo), 'sem 4o argumento');
  });

  await test('[RN-03] (b) params.requisicao_id = R1 sem a marca: 400 M1 (o campo do params nao abre)', async () => {
    const alvo = await reqAprovada();
    await assertRecusaM1(alvo, () => pelaServico(alvo, { requisicao_id: alvo.R, requisicaoDaEntrega: alvo.R }),
      'params.requisicao_id/requisicaoDaEntrega no params');
  });

  await test('[RN-03] (c) a marca de OUTRA requisicao (R2): 400 M1', async () => {
    const alvo = await reqAprovada();
    const outra = await reqAprovada();
    await assertRecusaM1(alvo, () => pelaServico(alvo, {}, { requisicaoDaEntrega: outra.R }), 'marca de R2');
  });

  await test('[RN-03] (d) a marca da propria requisicao (R1): consome', async () => {
    const alvo = await reqAprovada();
    await pelaServico(alvo, { requisicao_id: alvo.R }, { requisicaoDaEntrega: alvo.R });
    const rv = await reserva(alvo.r.id);
    assert.deepStrictEqual([rv.status, Number(rv.quantidade_utilizada)], ['CONSUMIDA', 4]);
    assert.deepStrictEqual(await mat(alvo.m), { quantidade_atual: 0, reservada: 0 });
  });

  // ══════════════ RN-04 — precedencia ══════════════

  await test('[RN-04] reserva inexistente: a mensagem de hoje', async () => {
    const m = await material(4);
    const s = await v2({ material_id: m, tipo: 'SAIDA', quantidade: 1, reserva_id: 99999999 });
    assert.strictEqual(s.status, 400, JSON.stringify(s.body));
    assert.strictEqual(s.body.error, 'Reserva não encontrada para este material');
  });

  await test('[RN-04] reserva de requisicao citada com OUTRO material: a mensagem de hoje, nao M1', async () => {
    const alvo = await reqAprovada();
    const outroMat = await material(4);
    const s = await v2({ material_id: outroMat, tipo: 'SAIDA', quantidade: 1, reserva_id: alvo.r.id });
    assert.strictEqual(s.status, 400, JSON.stringify(s.body));
    assert.strictEqual(s.body.error, 'Reserva não encontrada para este material');
    assert.strictEqual((await reserva(alvo.r.id)).status, 'ATIVA');
  });

  await test('[RN-04] reserva de requisicao ja LIBERADA (pelo ALMOXARIFE): M1, nao "Reserva liberada nao pode ser consumida"', async () => {
    const alvo = await reqAprovada();
    const lib = await as(ALMOXARIFE, () => request(app).post(`${API}/reservas/${alvo.r.id}/liberar`)
      .send({ motivo: 'teste 77' }).then((x) => x));
    assert.strictEqual(lib.status, 200, JSON.stringify(lib.body));
    assert.strictEqual((await reserva(alvo.r.id)).status, 'LIBERADA');
    const s = await v2({ material_id: alvo.m, tipo: 'SAIDA', quantidade: 1, reserva_id: alvo.r.id });
    assert.strictEqual(s.status, 400, JSON.stringify(s.body));
    assert.strictEqual(s.body.error, M1(alvo.r.id, alvo.numero));
  });

  terminou = true;
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERRO FATAL', e); process.exit(1); });
