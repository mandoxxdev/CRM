/**
 * Etapa 116 (Fase 5) — cenarios que a revisao adversarial achou sem prova ou errados.
 *
 * Revisor 1: (a) a guarda da devolucao (RN-10) contava a devolucao cuja ENTRADA_DEVOLUCAO ja tinha sido estornada — a Saida
 * ficava inestornavel com a mensagem dizendo que o material voltou; (b) excluir a requisicao cuja entrega baixou series, com
 * a serie desligada depois, devolvia o fisico e deixava as series Entregue (a C232 por outra porta).
 * Revisor 2: (c) devolucao e estorno da mesma Saida ao mesmo tempo contavam o fisico em dobro (30/30) — a guarda lia fora de
 * qualquer trava; (d) duas devolucoes simultaneas da mesma Saida passavam as duas (30/30, anterior a 116).
 *
 * Executar: cd server && node tests/api/estornoSemSerieFase5.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const { AsyncResource } = require('async_hooks');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const RODADAS = 12;

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: SUPER });
  const setUserLocal = (u) => setUser(u);
  const foraDaSecao = AsyncResource.bind((fn) => fn());
  const dbAll = (sql, p) => new Promise((res, rej) => db.all(sql, p, (err, rows) => (err ? rej(err) : res(rows))));
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `F116-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, codigo])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const mov = async (m, body) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'f116',
      justificativa: 'preparo f116', documento_vinculado: 'NF-F116', ...body });
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    return (await dbGet(db, 'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1',
      [m.id, body.tipo])).id;
  };
  const devolver = (m, saidaId, quantidade) => request(app).post('/api/almoxarifado/devolucoes').send({ material_id: m.id,
    quantidade, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
  const estornar = (movId) => request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'f116' });
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q;

  await test('[R1-a] a devolucao cuja entrada foi estornada nao conta: a Saida volta a ser estornavel (fisico 5)', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const d = await devolver(m, saidaId, 2);
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    // controle: com a devolucao viva, a E3
    const antes = await estornar(saidaId);
    assert.strictEqual(antes.status, 400, JSON.stringify(antes.body));
    const entradaDev = (await dbGet(db, `SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ENTRADA_DEVOLUCAO'`,
      [m.id])).id;
    const e1 = await estornar(entradaDev);
    assert.strictEqual(e1.status, 200, JSON.stringify(e1.body));
    assert.strictEqual(await fisico(m), 3);
    const e2 = await estornar(saidaId);
    assert.strictEqual(e2.status, 200, JSON.stringify(e2.body));
    assert.strictEqual(await fisico(m), 5);
  });

  await test('[R1-b] excluir a requisicao cuja entrega baixou series, com a serie desligada: 400, nada muda; religada -> exclui e as series voltam', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['G1', 'G2'] });
    const rq = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-${m.codigo}`])).lastID;
    const it = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,2,0,0,0)`, [rq, m.id])).lastID;
    await requisitionService.separarRequisicao(db, rq, [{ item_id: it, quantidade_separada: 2 }], SUPER);
    const sids = (await dbAll('SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const ent = await request(app).put(`/api/almoxarifado/requisicoes/${rq}/entregar`)
      .send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 2, serie_ids: sids }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
    // Etapa 193 Fase 5 (R1): pelo Compras, desligar a serie de material com series registradas e recusado (a armadilha que
    // este cenario monta nao se forma ali); a guarda da exclusao continua alcancavel pela porta do almoxarifado com a chave.
    process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
    const des = await request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ controle_serie: false });
    delete process.env.ALMOX_CADASTRO_MATERIAL;
    assert.strictEqual(des.status, 200, JSON.stringify(des.body));
    const ex = await request(app).delete(`/api/almoxarifado/requisicoes/${rq}`).send({ justificativa: 'f116' });
    assert.strictEqual(ex.status, 400, JSON.stringify(ex.body));
    assert.strictEqual(ex.body.error, `${m.codigo}: esta entrega baixou 2 série(s) e o controle por número de série do material `
      + 'foi desligado depois — excluir a requisição devolveria o saldo sem devolver as séries. Religue o controle por número '
      + 'de série no cadastro do material e exclua de novo.');
    assert.strictEqual(await fisico(m), 0);
    assert.strictEqual((await dbGet(db, 'SELECT COALESCE(ativo, 1) a FROM requisicoes_almoxarifado WHERE id = ?', [rq])).a, 1);
    process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
    const rel = await request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ controle_serie: true });
    delete process.env.ALMOX_CADASTRO_MATERIAL;
    assert.strictEqual(rel.status, 200, JSON.stringify(rel.body));
    const ex2 = await request(app).delete(`/api/almoxarifado/requisicoes/${rq}`).send({ justificativa: 'f116' });
    assert.strictEqual(ex2.status, 200, JSON.stringify(ex2.body));
    assert.strictEqual(await fisico(m), 2);
    const st = (await dbAll('SELECT status FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.status);
    assert.deepStrictEqual(st, ['EM_ESTOQUE', 'EM_ESTOQUE']);
  });

  await test(`[R2-c] devolucao x estorno da mesma Saida ao mesmo tempo (${RODADAS} rodadas, as duas ordens): nunca os dois, fisico 5`, async () => {
    const ruins = [];
    for (let i = 0; i < RODADAS; i += 1) {
      const m = await material();
      await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
      const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
      const [d, e] = i % 2
        ? await Promise.all([devolver(m, saidaId, 2), estornar(saidaId)])
        : (await Promise.all([estornar(saidaId), devolver(m, saidaId, 2)])).reverse();
      const f = await fisico(m);
      if (f !== 5 || (d.status === 201 && e.status === 200)) ruins.push(`dev${d.status}/est${e.status}/f${f}`);
    }
    assert.deepStrictEqual(ruins, []);
  });

  await test(`[R2-d] duas devolucoes de 2 da mesma Saida de 2 ao mesmo tempo (${RODADAS} rodadas): uma passa, fisico 5`, async () => {
    const ruins = [];
    for (let i = 0; i < RODADAS; i += 1) {
      const m = await material();
      await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
      const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
      const [a, b] = await Promise.all([devolver(m, saidaId, 2), devolver(m, saidaId, 2)]);
      const f = await fisico(m);
      const ok = [a.status, b.status].sort().join('/');
      if (f !== 5 || ok !== '201/400') ruins.push(`${ok}/f${f}`);
    }
    assert.deepStrictEqual(ruins, []);
  });

  await test('[R2-d] a recusa da devolucao que perde a corrida diz por que (a literal da validacao)', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const [a, b] = await Promise.all([devolver(m, saidaId, 2), devolver(m, saidaId, 2)]);
    const perdeu = a.status === 400 ? a : b;
    assert.strictEqual(perdeu.status, 400, JSON.stringify([a.body, b.body]));
    assert.ok(/^Devolução acima do entregue: a saída \d+ entregou 2, já foram devolvidos 2 e restam 0$/.test(perdeu.body.error),
      perdeu.body.error);
  });

  // ── Revisor 3 (sabotagem): cenarios sem prova ─────────────────────────────────────────────────────────────────────────
  await test('[S-K16] o desligar do Almoxarife cai na releitura do controle do ramo de saida: espera a trava e ve as 2 presentes (403)', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['K1', 'K2'] });
    const ids = (await dbAll('SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: ids });
    const ALMOX = { id: 3, nome: 'Almox', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
    const getOriginal = db.get;
    const estado = { armado: true };
    db.get = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (estado.armado && /^SELECT controle_serie FROM materiais_almoxarifado WHERE id = \?$/.test(String(sql).trim())
        && Number(params[0]) === m.id) {
        estado.armado = false;
        // o PUT do Almoxarife sai aqui, dentro da secao do estorno; com a trava ele so grava depois de as series voltarem
        // disparado FORA do contexto da secao (AsyncResource ligado no topo do arquivo): de dentro, o PUT herdaria a secao
        // (AsyncLocalStorage) e passaria pela trava como se ja a tivesse — o teste provaria nada.
        estado.put = foraDaSecao(() => {
          setUserLocal(ALMOX);
          // Etapa 193 Fase 5: pela porta do almoxarifado com a chave (o Almoxarife nao entra no Compras: la o 403 seria o do
          // gate, e o teste provaria nada); o 403 esperado e o da guarda de desligar com series presentes.
          process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
          const p = request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ controle_serie: false });
          p.then(() => {}, () => {});
          return p;
        });
        return new Promise((r) => setTimeout(r, 60)).then(() => getOriginal.call(db, sql, params, cb));
      }
      return getOriginal.call(db, sql, params, cb);
    };
    let e;
    try { e = await estornar(saidaId); } finally { db.get = getOriginal; setUserLocal(SUPER); delete process.env.ALMOX_CADASTRO_MATERIAL; }
    assert.strictEqual(estado.armado, false, 'gancho nao disparou');
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    const p = await estado.put;
    assert.strictEqual(p.status, 403, JSON.stringify(p.body));
    assert.ok(String(p.body.error).startsWith('Desligar o controle por número de série no material '), JSON.stringify(p.body));
    const l = await dbGet(db, 'SELECT controle_serie FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    const pres = (await dbGet(db, "SELECT COUNT(*) n FROM series_almoxarifado WHERE material_id = ? AND status IN ('EM_ESTOQUE','BLOQUEADA')", [m.id])).n;
    assert.deepStrictEqual([l.controle_serie, pres], [1, 2], 'serie desligada com series Em estoque (C225 pelo estorno)');
  });

  await test('[S-D2/E3] duas devolucoes de 1 numa Saida de 3: a E3 soma as duas ("2 PC ... ja voltaram ... dos 1 PC")', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 3 });
    assert.strictEqual((await devolver(m, saidaId, 1)).status, 201);
    assert.strictEqual((await devolver(m, saidaId, 1)).status, 201);
    const r = await estornar(saidaId);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Não é possível estornar: 2 PC desta saída já voltaram pela devolução — o estorno devolveria '
      + 'de novo o que já voltou. Para desfazer o resto, registre a devolução dos 1 PC que faltam.');
    assert.strictEqual(await fisico(m), 4);
  });

  await test('[S-D6] a guarda da devolucao vale para SAIDA_PRODUCAO tambem (fisico 5, nao 7)', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaId = await mov(m, { tipo: 'SAIDA_PRODUCAO', quantidade: 2, emergencial: true });
    assert.strictEqual((await devolver(m, saidaId, 2)).status, 201);
    const r = await estornar(saidaId);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(await fisico(m), 5);
  });

  await test('[S-D8] a devolucao de OUTRA saida do mesmo material nao trava o estorno desta (200, fisico 5)', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const saidaA = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const saidaB = await mov(m, { tipo: 'SAIDA', quantidade: 1 });
    assert.strictEqual((await devolver(m, saidaA, 2)).status, 201);
    const r = await estornar(saidaB);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await fisico(m), 5);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
