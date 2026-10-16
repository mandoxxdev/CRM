/**
 * Etapa 117 (T4) — integracao que cruza Devolucoes, Movimentacoes (o livro) e Requisicoes, pelas rotas, como a tela faria:
 * (i) a lista oferece a saida, a devolucao e estornada pelo livro, a lista volta a oferecer, a devolucao de novo passa e o
 *     estorno da saida volta a ser recusado (a devolucao nova esta viva — E3 da 116);
 * (ii) a devolucao para SUCATA de uma entrega de requisicao: a entrada nao estorna com a sucata de pe (E1), estorna depois da
 *      sucata, e a exclusao da requisicao credita o que a devolucao morta deixou de fora (o fisico da entrada inicial);
 * (iii) o estorno da saida com o livro falhando e a devolucao da mesma saida pedida nesse instante: a devolucao espera a
 *      trava (a perna do motor) e grava sobre a saida nao estornada — nunca as duas coisas, fisico certo.
 *
 * Executar: cd server && node tests/api/devolucaoVivaIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { AsyncResource } = require('async_hooks');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };

(async () => {
  const { app, db, close } = await createTestApp({ user: SUPER });
  const foraDaSecao = AsyncResource.bind((fn) => fn());
  let seq = 0;
  async function material() {
    seq += 1;
    const codigo = `DI117-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, codigo])).lastID;
    return { id, codigo };
  }
  const ultima = async (m, tipo) => (await dbGet(db,
    'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1', [m.id, tipo])).id;
  const mov = async (m, body) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'di117',
      justificativa: 'preparo di117', documento_vinculado: 'NF-DI117', ...body });
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    return ultima(m, body.tipo);
  };
  const devolver = (m, saidaId, quantidade, destino = 'ESTOQUE') => request(app).post('/api/almoxarifado/devolucoes')
    .send({ material_id: m.id, quantidade, motivo: 'NAO_UTILIZADO', destino, movimentacao_saida_id: saidaId });
  const estornar = (movId) => request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'di117' });
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q;
  const lista = async (m, saidaId) => {
    const r = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${m.id}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.find((s) => s.id === saidaId);
  };

  await test('(i) lista -> devolve -> estorna a entrada pelo livro -> a lista oferece 2 -> devolve pela lista -> o estorno da saida recusa (E3)', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    assert.strictEqual((await lista(m, saidaId)).saldo_devolvivel, 2);
    assert.strictEqual((await devolver(m, saidaId, 2)).status, 201);
    assert.strictEqual((await lista(m, saidaId)).saldo_devolvivel, 0);
    assert.strictEqual((await estornar(await ultima(m, 'ENTRADA_DEVOLUCAO'))).status, 200);
    assert.strictEqual(await fisico(m), 3);
    // a saida, sem devolucao viva, seria estornavel — mas a pessoa devolve de novo pela lista
    const oferecido = (await lista(m, saidaId)).saldo_devolvivel;
    assert.strictEqual(oferecido, 2);
    const d = await devolver(m, saidaId, oferecido);
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    assert.strictEqual(await fisico(m), 5);
    const e = await estornar(saidaId);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, 'Não é possível estornar: esta saída já foi devolvida inteira (2 PC) — o estorno devolveria de '
      + 'novo o que já voltou.');
    assert.strictEqual(await fisico(m), 5);
  });

  await test('(ii) requisicao: entrega 2 -> devolucao para SUCATA -> E1 -> estorna a sucata -> estorna a entrada -> excluir: fisico 10', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 10 });
    const rq = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-${m.codigo}`])).lastID;
    const it = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,2,0,0,0)`, [rq, m.id])).lastID;
    await requisitionService.separarRequisicao(db, rq, [{ item_id: it, quantidade_separada: 2 }], SUPER);
    const ent = await request(app).put(`/api/almoxarifado/requisicoes/${rq}/entregar`)
      .send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 2 }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
    const saidaId = await ultima(m, 'SAIDA');
    const d = await devolver(m, saidaId, 2, 'SUCATA');
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    assert.strictEqual(await fisico(m), 8);
    const entradaId = await ultima(m, 'ENTRADA_DEVOLUCAO');
    const e1 = await estornar(entradaId);
    assert.strictEqual(e1.status, 400, JSON.stringify(e1.body));
    assert.ok(e1.body.error.startsWith(`Não é possível estornar: esta entrada é da devolução DEV-${d.body.id}, que foi para a sucata`),
      e1.body.error);
    assert.strictEqual(await fisico(m), 8);
    assert.strictEqual((await estornar(await ultima(m, 'SUCATA'))).status, 200);
    assert.strictEqual(await fisico(m), 10);
    assert.strictEqual((await estornar(entradaId)).status, 200);
    assert.strictEqual(await fisico(m), 8);
    const ex = await request(app).delete(`/api/almoxarifado/requisicoes/${rq}`).send({ justificativa: 'di117' });
    assert.strictEqual(ex.status, 200, JSON.stringify(ex.body));
    assert.strictEqual(await fisico(m), 10, 'a exclusao credita os 2 que a devolucao morta deixou de fora');
  });

  await test('(iii) estorno da saida com o livro falhando e a devolucao da mesma saida no meio: a devolucao recusa (a saida estava em estorno), desfeito o estorno ela passa', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const original = db.run;
    const estado = { armado: true };
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (estado.armado && typeof sql === 'string' && sql.includes('INSERT INTO movimentacoes_almoxarifado')
        && Array.isArray(params) && params.includes('ESTORNO')) {
        estado.armado = false;
        estado.dev = foraDaSecao(() => {
          const p = devolver(m, saidaId, 2);
          p.then(() => {}, () => {});
          return p;
        });
        new Promise((r) => setTimeout(r, 150)).then(() => cb.call({}, new Error('falha forcada do livro (teste)')));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let e;
    try { e = await estornar(saidaId); } finally { db.run = original; }
    assert.strictEqual(estado.armado, false, 'gancho nao disparou');
    assert.strictEqual(e.status, 500, JSON.stringify(e.body));
    const d = await estado.dev;
    // a linha da devolucao nasce fora da trava, mas so sobre a saida NAO estornada: no instante do INSERT do livro o claim do
    // estorno ja esta gravado, e o INSERT condicional da devolucao recusa (a validacao diz por que). Desfeito o estorno, a
    // saida continua viva e devolvivel. Nunca os dois: fisico 3, e a devolucao de novo passa (5).
    const c = (await dbGet(db, 'SELECT COALESCE(cancelado, 0) c FROM movimentacoes_almoxarifado WHERE id = ?', [saidaId])).c;
    assert.strictEqual(c, 0);
    assert.strictEqual(d.status, 400, JSON.stringify(d.body));
    // Etapa 118 (C240): era a literal falsa ("foi cancelada (estornada) — o estorno ja devolveu o material"), declarada na C240.
    assert.strictEqual(d.body.error, `A saída ${saidaId} está sendo estornada neste instante — nada foi gravado. Tente de novo em `
      + 'instantes: se o estorno concluir, a saída deixa de aceitar devolução.');
    assert.strictEqual(await fisico(m), 3);
    const linhas = (await dbGet(db, 'SELECT COUNT(*) n FROM devolucoes_material_almoxarifado WHERE material_id = ?', [m.id])).n;
    const entradas = (await dbGet(db, "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ENTRADA_DEVOLUCAO'",
      [m.id])).n;
    assert.deepStrictEqual([linhas, entradas], [0, 0], 'a devolucao recusada deixou rastro');
    assert.strictEqual((await devolver(m, saidaId, 2)).status, 201);
    assert.strictEqual(await fisico(m), 5);
    const e2 = await estornar(saidaId);
    assert.strictEqual(e2.status, 400, JSON.stringify(e2.body));
    assert.ok(e2.body.error.startsWith('Não é possível estornar: esta saída já foi devolvida inteira'), e2.body.error);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
