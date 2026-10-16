/**
 * Etapa 120 (C234; B779) — a serie que ja voltou. (A C250 da mesma etapa mora em `lancamentoQueValeu.api.test.js`.)
 *
 * C250: a auditoria que o motor grava DEPOIS do livro falhava e derrubava a resposta com o lancamento feito (Entrada de 5 ->
 * 500, a linha no livro, fisico 5). Os chamadores do motor leem a excecao como "nada aconteceu": a entrega nao gravava o
 * entregue (a segunda baixava de novo), a devolucao virava ESTADO_PARCIAL, o retalho estornava a baixa e deixava a entrada do
 * retalho orfa. C234: a saida cujas series voltaram TODAS por uma Entrada, estornada depois de desligar a serie, devolvia a
 * quantidade em dobro (a reativacao apaga o vinculo com a saida e a recusa da 116 nao via serie nenhuma).
 *
 * Molde: `oQueJaValeuNaoSePerde.api.test.js` (ganchos no db.run) e `estornoSemSerie.api.test.js` (o desligar).
 *
 * Executar: cd server && node tests/api/serieQueVoltou.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const REENTRARAM = 'estorno de saida recusado: series desta saida ja reentraram no estoque — a devolucao ja repos o material';
const E2 = (codigo, n) => `Não é possível estornar: esta saída baixou ${n} série(s) do material ${codigo} e o controle por `
  + 'número de série foi desligado depois — o estorno devolveria o saldo sem devolver as séries. Religue o controle por '
  + 'número de série no cadastro do material e estorne de novo.';

(async () => {
  const { app, db, close } = await createTestApp({ user: SUPER });
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `LQV120-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, codigo])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const ultimo = async (m, tipo) => (await dbGet(db,
    'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1', [m.id, tipo])).id;
  const v2 = (m, body) => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'lqv120',
    justificativa: 'lqv120', documento_vinculado: 'NF-LQV120', ...body });
  const mov = async (m, body) => {
    const r = await v2(m, body);
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    return ultimo(m, body.tipo);
  };
  const estornar = (movId) => request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'lqv120' });
  const desligar = async (m, ligado = false) => {
    const r = await request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ controle_serie: ligado });
    assert.strictEqual(r.status, 200, `controle_serie ${ligado}: ${JSON.stringify(r.body)}`);
  };
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual f FROM materiais_almoxarifado WHERE id = ?', [m.id])).f;
  const livro = async (m, tipo) => (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ?',
    [m.id, tipo])).n;
  const cancelado = async (id) => (await dbGet(db, 'SELECT COALESCE(cancelado, 0) c FROM movimentacoes_almoxarifado WHERE id = ?', [id])).c;
  const series = async (m) => (await dbAll(db, 'SELECT status FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id]))
    .map((s) => s.status);
  const idsSeries = async (m) => (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id]))
    .map((x) => x.id);
  const auditoriasDe = async (movId) => (await dbGet(db,
    "SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade = 'movimentacao' AND entidade_id = ?", [movId])).n;

  /** A auditoria do lancamento (`entidade = 'movimentacao'`, acao = `acao`) falha uma vez. */
  async function comAuditoriaFalhando(acao, fn) {
    const original = db.run;
    let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && sql.includes('INSERT INTO auditoria_log_almoxarifado')
        && Array.isArray(params) && params[0] === 'movimentacao' && params[2] === acao) {
        disparou = true;
        setImmediate(() => cb.call({}, new Error(`falha forcada da auditoria ${acao} (teste)`)));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res;
    try { res = await fn(); } finally { db.run = original; }
    assert.ok(disparou, `gancho da auditoria ${acao} nao disparou`);
    return res;
  }

  console.log('\n=== Etapa 120: a serie que ja voltou (C234) ===\n');

  // ── C234 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Entrada 2 (V1, V2) -> Saida 2 com as duas. */
  async function saidaDeDuasSeries() {
    const m = await material({ controle_serie: 1 });
    const e1 = await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] });
    const s1 = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: await idsSeries(m) });
    return { m, e1, s1 };
  }

  await test('[RN-07] as duas series voltaram por uma Entrada, a serie desligada: estorno da Saida 400, fisico 2', async () => {
    const { m, s1 } = await saidaDeDuasSeries();
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] });
    await desligar(m);
    const r = await estornar(s1);
    assert.strictEqual(r.status, 400, `estorno devolveu em dobro: ${JSON.stringify(r.body)} fisico=${await fisico(m)}`);
    assert.strictEqual(r.body.error, REENTRARAM);
    assert.strictEqual(await fisico(m), 2);
    assert.strictEqual(await cancelado(s1), 0);
    assert.deepStrictEqual(await series(m), ['EM_ESTOQUE', 'EM_ESTOQUE']);
  });

  await test('[RN-08] nao regride: so V1 voltou -> a mesma literal; Saida sem serie depois de desligar -> 200; series fora -> E2', async () => {
    const a = await saidaDeDuasSeries();
    await mov(a.m, { tipo: 'ENTRADA', quantidade: 1, series: ['V1'] });
    await desligar(a.m);
    let r = await estornar(a.s1);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, REENTRARAM);
    // (b) a Saida sem serie, depois de desligar, do mesmo material
    await mov(a.m, { tipo: 'ENTRADA', quantidade: 3 });
    const sSem = await mov(a.m, { tipo: 'SAIDA', quantidade: 2 });
    r = await estornar(sSem);
    assert.strictEqual(r.status, 200, `a Saida sem serie deixou de estornar: ${JSON.stringify(r.body)}`);
    // (c) as series ainda fora
    const c = await saidaDeDuasSeries();
    await desligar(c.m);
    r = await estornar(c.s1);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E2(c.m.codigo, 2));
  });

  await test('[RN-08b] declarado (Fase 2): a Entrada que trouxe as series estornada com a serie desligada -> a saida recusa', async () => {
    // A C225 (o estorno de Entrada com a serie desligada nao toca as series) deixa V1 e V2 "Em estoque" com o fisico 0; antes da
    // 120 o estorno da saida passava e o estado voltava a bater por acaso. Com a regra da B779 recusa: a serie voltou por uma
    // Entrada, e a regua nao distingue "voltou e foi desfeita" sem reabrir a C225. Caminho: Ajuste. Recusar nunca conta em dobro.
    const { m, s1 } = await saidaDeDuasSeries();
    const e2 = await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] });
    await desligar(m);
    let r = await estornar(e2);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    r = await estornar(s1);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, REENTRARAM);
    assert.strictEqual(await fisico(m), 0);
  });

  await test('[RN-09] a devolucao desfeita nao conta como "voltou": E2 (religar); religada, o estorno passa -> fisico 2', async () => {
    const { m, s1 } = await saidaDeDuasSeries();
    const d = await request(app).post('/api/almoxarifado/devolucoes').send({ material_id: m.id, quantidade: 2,
      motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE', movimentacao_saida_id: s1, series: ['V1', 'V2'] });
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    let r = await estornar(await ultimo(m, 'ENTRADA_DEVOLUCAO'));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await series(m), ['ENTREGUE', 'ENTREGUE'], 'premissa: as series voltaram a saida');
    const linhas = await dbGet(db, `SELECT COUNT(*) n FROM series_entrada_anterior_almoxarifado WHERE saida_anterior_id = ?`, [s1]);
    assert.strictEqual(linhas.n, 2, 'premissa: a reativacao da devolucao gravou a saida de onde as series vieram');
    await desligar(m);
    r = await estornar(s1);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E2(m.codigo, 2));
    await desligar(m, true);
    r = await estornar(s1);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await fisico(m), 2);
    assert.deepStrictEqual(await series(m), ['EM_ESTOQUE', 'EM_ESTOQUE']);
  });

  await test('[RN-10] a volta das series e o desligar caem entre a guarda previa e o ramo de saida: 400 sob a trava, fisico 2', async () => {
    const { m, e1, s1 } = await saidaDeDuasSeries();
    const ids = await idsSeries(m);
    // Simula, no instante do claim (depois das guardas previas, antes da secao do ramo de saida), uma Entrada que reativou V1 e
    // V2 (o efeito dela no banco, com a linha da reativacao) e o desligar da serie.
    const original = db.run; let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && /^\s*UPDATE movimentacoes_almoxarifado\s+SET cancelado = 1/.test(String(sql))) {
        disparou = true;
        const prossegue = () => original.call(db, sql, params, cb);
        (async () => {
          const entrada = (await dbRun(db, `INSERT INTO movimentacoes_almoxarifado (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo)
            VALUES (?, 'ENTRADA', 2, 0, 2, 'simulada')`, [m.id])).lastID;
          for (const sid of ids) {
            await dbRun(db, `UPDATE series_almoxarifado SET status = 'EM_ESTOQUE', movimentacao_entrada_id = ?, movimentacao_saida_id = NULL
              WHERE id = ?`, [entrada, sid]);
            await dbRun(db, `INSERT INTO series_entrada_anterior_almoxarifado (serie_id, movimentacao_entrada_id, entrada_anterior_id,
              saida_anterior_id) VALUES (?, ?, ?, ?)`, [sid, entrada, e1, s1]);
          }
          await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = quantidade_atual + 2, controle_serie = 0 WHERE id = ?', [m.id]);
        })().then(prossegue, cb);
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let r;
    try { r = await estornar(s1); } finally { db.run = original; }
    assert.ok(disparou, 'gancho do claim nao disparou');
    assert.strictEqual(r.status, 400, `estorno devolveu em dobro sob a trava: ${JSON.stringify(r.body)} fisico=${await fisico(m)}`);
    assert.strictEqual(r.body.error, REENTRARAM);
    assert.strictEqual(await fisico(m), 2);
    assert.strictEqual(await cancelado(s1), 0, 'o claim nao foi desfeito');
  });

  await test('[RN-11] legado: a reativacao sem a saida registrada (NULL) -> o estorno passa como antes (200, fisico 4) — a A68 acha', async () => {
    const { m, s1 } = await saidaDeDuasSeries();
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] });
    const limpas = await dbRun(db, `UPDATE series_entrada_anterior_almoxarifado SET saida_anterior_id = NULL
      WHERE serie_id IN (SELECT id FROM series_almoxarifado WHERE material_id = ?)`, [m.id]);
    assert.strictEqual(limpas.changes, 2, 'premissa: a Entrada gravou uma linha por serie');
    await desligar(m);
    const r = await estornar(s1);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await fisico(m), 4);
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
