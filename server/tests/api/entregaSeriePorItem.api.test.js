/**
 * Etapa 61 — a entrega de material com série diz QUAIS séries saem; a exclusão devolve as mesmas
 * séries; e a regularização acerta o legado. O invariante da 6b: `COUNT(série presente) == físico`.
 *
 * Plano: docs/superpowers/plans/2026-09-30-almoxarifado-etapa61-serie-na-entrega.md
 *
 * Executar: cd server && node tests/api/entregaSeriePorItem.api.test.js
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

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const PRODUCAO = { id: 6101, nome: 'Chao de fabrica', role: 'usuario' }; // sem perfil -> PRODUCAO
let seq = 0;

(async () => {
  console.log('\n=== Etapa 61: serie na entrega ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const material = async (serie = 1) => {
    const c = `E61-M${++seq}`;
    return { id: (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_serie)
      VALUES (?, ?, 'UN', 0, 1, ?)`, [c, `Mat ${c}`, serie])).lastID, nome: `Mat ${c}` };
  };
  const entrar = async (m, numeros, lote) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: m, tipo: 'ENTRADA', quantidade: numeros.length, motivo: 'e61', series: numeros, ...(lote ? { lote } : {}),
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const serieId = async (m, numero) => (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [m, numero])).id;
  const req = async (itens) => {
    const r = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E61-${++seq}`])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
        VALUES (?,?,?,0,0,0)`, [r, m, q])).lastID);
    }
    return { id: r, ids };
  };
  const separar = (reqId, itens) => requisitionService.separarRequisicao(db, reqId, itens, ADMIN);
  const entregar = (reqId, itens) => request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`).send({ itens_atendidos: itens });
  const estado = async (m) => ({
    fisico: (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m])).q,
    presentes: (await dbGet(db, "SELECT COUNT(*) n FROM series_almoxarifado WHERE material_id = ? AND status IN ('EM_ESTOQUE','BLOQUEADA')", [m])).n,
  });

  await test('O defeito: entrega SEM series de material serializado -> 400 com a saida na literal; nada sai', async () => {
    const m = await material(); await entrar(m.id, ['A1', 'A2', 'A3']);
    const { id, ids } = await req([[m.id, 2]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 2 }]);
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 2 }]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `${m.nome}: material com controle de serie: informe 2 serie(s) para 2 unidade(s) — recebidas 0 — entregue escolhendo as series`);
    assert.deepStrictEqual(await estado(m.id), { fisico: 3, presentes: 3 });
  });

  await test('Com as series: fisico e series batem (1 = 1), e as entregues ficam ENTREGUE', async () => {
    const m = await material(); await entrar(m.id, ['B1', 'B2', 'B3']);
    const { id, ids } = await req([[m.id, 2]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 2 }]);
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 2, serie_ids: [await serieId(m.id, 'B1'), await serieId(m.id, 'B3')] }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await estado(m.id), { fisico: 1, presentes: 1 });
    assert.strictEqual((await dbGet(db, "SELECT status FROM series_almoxarifado WHERE material_id = ? AND numero = 'B2'", [m.id])).status, 'EM_ESTOQUE');
  });

  await test('Serie de outro material, ja entregue, repetida, ou em quantidade errada: 400, nada sai', async () => {
    const m = await material(); const outro = await material();
    await entrar(m.id, ['C1', 'C2', 'C3']); await entrar(outro.id, ['X1']);
    const { id, ids } = await req([[m.id, 2]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 2 }]);
    const c1 = await serieId(m.id, 'C1'); const x1 = await serieId(outro.id, 'X1');
    let r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 2, serie_ids: [c1, x1] }]);
    assert.strictEqual(r.body.error, `${m.nome}: serie X1 nao esta em estoque deste material`);
    r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 2, serie_ids: [c1, c1] }]);
    assert.strictEqual(r.body.error, `${m.nome}: serie repetida na entrega`);
    r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 2, serie_ids: [c1] }]);
    assert.strictEqual(r.body.error, `${m.nome}: material com controle de serie: informe 2 serie(s) para 2 unidade(s) — recebidas 1`);
    assert.deepStrictEqual(await estado(m.id), { fisico: 3, presentes: 3 });
    // Já entregue: entrega C1, depois tenta de novo com C1.
    assert.strictEqual((await entregar(id, [{ item_id: ids[0], quantidade_atendida: 1, serie_ids: [c1] }])).status, 200);
    r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 1, serie_ids: [c1] }]);
    assert.strictEqual(r.body.error, `${m.nome}: serie C1 nao esta em estoque deste material`);
  });

  await test('Lote pelas series: series de dois lotes -> recusa; de um lote -> a saida e daquele lote', async () => {
    const m = await material(); const la = `LA-${seq}`; const lb = `LB-${seq}`;
    await entrar(m.id, ['D1', 'D2'], la); await entrar(m.id, ['D3'], lb);
    const { id, ids } = await req([[m.id, 2]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 2 }]);
    let r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 2, serie_ids: [await serieId(m.id, 'D1'), await serieId(m.id, 'D3')] }]);
    assert.strictEqual(r.body.error, `${m.nome}: escolha series de um lote so`);
    r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 2, serie_ids: [await serieId(m.id, 'D1'), await serieId(m.id, 'D2')] }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const loteA = (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m.id, la])).id;
    const mov = await dbGet(db, "SELECT lote_id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA'", [m.id]);
    assert.strictEqual(mov.lote_id, loteA);
  });

  await test('Com RESERVA parcial (duas baixas) as series se dividem, e o invariante fecha', async () => {
    const m = await material(); await entrar(m.id, ['E1', 'E2', 'E3', 'E4']);
    const { id, ids } = await req([[m.id, 3]]);
    await requisitionService.reservarItensAprovacao(db, id, ADMIN, {});
    await dbRun(db, 'UPDATE reservas_material_almoxarifado SET quantidade = 1 WHERE item_requisicao_id = ?', [ids[0]]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = 1 WHERE id = ?', [m.id]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 3 }]);
    const sids = [await serieId(m.id, 'E1'), await serieId(m.id, 'E2'), await serieId(m.id, 'E4')];
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 3, serie_ids: sids }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const saidas = await dbAll(db, "SELECT id, quantidade FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA' ORDER BY id", [m.id]);
    assert.strictEqual(saidas.length, 2, 'fixture: tinham de ser duas baixas');
    for (const s of saidas) {
      const n = (await dbGet(db, 'SELECT COUNT(*) n FROM series_almoxarifado WHERE movimentacao_saida_id = ?', [s.id])).n;
      assert.strictEqual(n, s.quantidade);
    }
    assert.deepStrictEqual(await estado(m.id), { fisico: 1, presentes: 1 });
  });

  await test('Material SEM controle de serie: serie_ids ignorado (comportamento de hoje)', async () => {
    const m = await material(0);
    const e = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, tipo: 'ENTRADA', quantidade: 5, motivo: 'e61' });
    assert.strictEqual(e.status, 201);
    const { id, ids } = await req([[m.id, 2]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 2 }]);
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 2, serie_ids: [999999] }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });

  await test('RN-05 excluir a requisicao devolve AS MESMAS series (EM_ESTOQUE de novo) e o invariante fecha', async () => {
    const m = await material(); await entrar(m.id, ['F1', 'F2', 'F3']);
    const { id, ids } = await req([[m.id, 2]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 2 }]);
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 2, serie_ids: [await serieId(m.id, 'F1'), await serieId(m.id, 'F2')] }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await estado(m.id), { fisico: 1, presentes: 1 });
    const del = await request(app).delete(`/api/almoxarifado/requisicoes/${id}`).send({ justificativa: 'e61 teste' });
    assert.strictEqual(del.status, 200, JSON.stringify(del.body));
    assert.deepStrictEqual(await estado(m.id), { fisico: 3, presentes: 3 });
    assert.strictEqual((await dbGet(db, "SELECT status FROM series_almoxarifado WHERE material_id = ? AND numero = 'F1'", [m.id])).status, 'EM_ESTOQUE');
  });

  const regularizar = (m, body) => request(app).post(`/api/almoxarifado/materiais/${m}/series/regularizar`).send(body);

  await test('RN-06 regularizar: series FANTASMA (presentes 3, fisico 1) — baixa ate a diferenca, nunca alem', async () => {
    const m = await material(); await entrar(m.id, ['G1', 'G2', 'G3']);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 1 WHERE id = ?', [m.id]); // o legado
    const g1 = await serieId(m.id, 'G1'); const g2 = await serieId(m.id, 'G2'); const g3 = await serieId(m.id, 'G3');
    let r = await regularizar(m.id, { baixar: [g1, g2, g3], justificativa: 'saiu antes da etapa 61' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'baixar 3 serie(s) deixaria menos series que o fisico (1) — presentes 3, baixe no maximo 2');
    r = await regularizar(m.id, { baixar: [g1, g2], justificativa: 'ok' });
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, 'justificativa obrigatoria (minimo 5 caracteres)');
    r = await regularizar(m.id, { cadastrar: ['G9'], justificativa: 'saiu antes da etapa 61' });
    assert.strictEqual(r.status, 400); assert.ok(/cadastre no maximo 0/.test(r.body.error), r.body.error);
    r = await regularizar(m.id, { baixar: [g1, g2], justificativa: 'saiu antes da etapa 61' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await estado(m.id), { fisico: 1, presentes: 1 });
    assert.strictEqual((await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE id = ?', [g1])).status, 'BAIXADA');
    const aud = await dbGet(db, "SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade = 'serie' AND acao = 'REGULARIZACAO_SERIES' AND entidade_id IN (?,?)", [g1, g2]);
    assert.strictEqual(aud.n, 2);
  });

  await test('RN-06 regularizar: fisico SEM series (5, 0) — cadastra ate a diferenca; e a entrega volta a funcionar', async () => {
    const m = await material();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 5 WHERE id = ?', [m.id]); // estoque legado
    let r = await regularizar(m.id, { cadastrar: ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'], justificativa: 'cadastro do legado' });
    assert.strictEqual(r.status, 400);
    r = await regularizar(m.id, { cadastrar: ['H1', 'H2', 'H3', 'H4', 'H5'], justificativa: 'cadastro do legado' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await estado(m.id), { fisico: 5, presentes: 5 });
    const { id, ids } = await req([[m.id, 1]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 1 }]);
    const e = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 1, serie_ids: [await serieId(m.id, 'H3')] }]);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.deepStrictEqual(await estado(m.id), { fisico: 4, presentes: 4 });
  });

  await test('RN-06 regularizar exige o perfil de ajuste (chao de fabrica: 403)', async () => {
    const m = await material();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 1 WHERE id = ?', [m.id]);
    setUser(PRODUCAO);
    const r = await regularizar(m.id, { cadastrar: ['P1'], justificativa: 'tentativa sem perfil' });
    setUser(ADMIN);
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual((await estado(m.id)).presentes, 0);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
