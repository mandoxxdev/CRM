/**
 * Etapa 65 — a troca de origem NA SEPARACAO ficava registrada: uma rodada que apagava a origem planejada
 * (separado pendente de A, nova rodada de B / automatica / de varios pares) gravava uma linha em
 * substituicoes_origem_requisicao com momento SEPARACAO.
 *
 * REVOGADO na separacao pela Etapa 196 (B1314): a origem guardada nao muda numa rodada — ela fica, com a
 * quantidade que saiu dela (`quantidade_origem_separacao`), e a parte nova sai no automatico na entrega. A
 * separacao nao grava mais troca; a troca da ENTREGA (Etapa 63) continua. Os testes abaixo dizem a regra nova
 * nos mesmos cenarios da 65; o da falha do INSERT da troca (best-effort) foi apagado: nao ha mais INSERT.
 *
 * Planos: docs/superpowers/plans/2026-10-01-almoxarifado-etapa65-troca-na-separacao.md e
 * docs/superpowers/plans/2026-11-05-almoxarifado-etapa196-origem-da-separacao-em-duas-vezes.md
 *
 * Executar: cd server && node tests/api/trocaSeparacao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
let seq = 0;

(async () => {
  console.log('\n=== Etapa 65: troca de origem na separacao ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const loc = async (nome) => {
    const c = `E65-${nome}-${++seq}`;
    return { id: (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', [c, nome])).lastID, codigo: c };
  };
  const material = async () => {
    const c = `E65-M${++seq}`;
    return { id: (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
      VALUES (?, ?, 'UN', 0, 1)`, [c, `Mat ${c}`])).lastID, codigo: c };
  };
  const entrar = async (m, destino, q, lote) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e65', localizacao_destino_id: destino, ...(lote ? { lote } : {}),
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m, codigo])).id;
  const req = async (itens) => {
    const r = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E65-${++seq}`])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
        VALUES (?,?,?,0,0,0)`, [r, m, q])).lastID);
    }
    return { id: r, ids };
  };
  const separar = (reqId, itens) => request(app).put(`/api/almoxarifado/requisicoes/${reqId}/separacao`).send({ itens_separados: itens });
  const entregar = (reqId, itens) => request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`).send({ itens_atendidos: itens });
  const subs = async (reqId) => (await request(app).get(`/api/almoxarifado/requisicoes/${reqId}`)).body.substituicoes;
  const planejada = async (itemId) => dbGet(db, 'SELECT origem_separacao_id o, lote_separacao_id l FROM itens_requisicao_almoxarifado WHERE id = ?', [itemId]);
  const ok = async (p) => { const r = await p; assert.strictEqual(r.status, 200, JSON.stringify(r.body)); return r; };
  const parte = async (itemId) => (await dbGet(db, 'SELECT quantidade_origem_separacao q FROM itens_requisicao_almoxarifado WHERE id = ?', [itemId])).q;

  await test('Etapa 196 (era RN-01 da 65): separou 5 de A, nova rodada de B com motivo — nenhuma troca; a origem A fica com 5, o motivo e ignorado', async () => {
    const A = await loc('A'); const B = await loc('B'); const m = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10);
    const { id, ids } = await req([[m.id, 10]]);
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 5, localizacao_origem_id: A.id }]));
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: B.id, motivo_substituicao: '  A acabou na prateleira  ' }]));
    assert.deepStrictEqual(await subs(id), []);
    assert.deepStrictEqual(await planejada(ids[0]), { o: A.id, l: null });
    assert.strictEqual(await parte(ids[0]), 5);
  });

  await test('Etapa 196 (era RN-01 da 65): rodada AUTOMATICA (sem "Sai de") sobre planejada A — nenhuma troca; A fica com 4', async () => {
    const A = await loc('AA'); const m = await material();
    await entrar(m.id, A.id, 10);
    const { id, ids } = await req([[m.id, 8]]);
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 4, localizacao_origem_id: A.id }]));
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 2 }]));
    assert.deepStrictEqual(await subs(id), []);
    assert.deepStrictEqual(await planejada(ids[0]), { o: A.id, l: null });
    assert.strictEqual(await parte(ids[0]), 4);
  });

  await test('Etapa 196 (era RN-01 da 65): varios pares na rodada (A e B) sobre planejada C — nenhuma troca; C fica com 3', async () => {
    const A = await loc('VA'); const B = await loc('VB'); const C = await loc('VC'); const m = await material();
    await entrar(m.id, A.id, 5); await entrar(m.id, B.id, 5); await entrar(m.id, C.id, 5);
    const { id, ids } = await req([[m.id, 9]]);
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: C.id }]));
    await ok(separar(id, [
      { item_id: ids[0], quantidade_separada: 1, localizacao_origem_id: A.id, motivo_substituicao: '   ' },
      { item_id: ids[0], quantidade_separada: 1, localizacao_origem_id: A.id, motivo_substituicao: 'segundo' },
      { item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: B.id, motivo_substituicao: 'terceiro' },
    ]));
    assert.deepStrictEqual(await subs(id), []);
    assert.deepStrictEqual(await planejada(ids[0]), { o: C.id, l: null });
    assert.strictEqual(await parte(ids[0]), 3);
  });

  await test('Metade positiva: mesma origem soma (A 3 + A 2 = 5); A-e-B na MESMA rodada sem planejada vira origem A com 2 (Etapa 196 RN-196.05) — nada registrado', async () => {
    const A = await loc('PA'); const B = await loc('PB'); const m = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10);
    const r1 = await req([[m.id, 8]]);
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]));
    assert.deepStrictEqual(await subs(r1.id), []);
    assert.strictEqual((await planejada(r1.ids[0])).o, A.id); // a mesma origem mantem a planejada
    assert.strictEqual(await parte(r1.ids[0]), 5);
    const r2 = await req([[m.id, 4]]);
    await ok(separar(r2.id, [
      { item_id: r2.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id },
      { item_id: r2.ids[0], quantidade_separada: 2, localizacao_origem_id: B.id },
    ]));
    assert.deepStrictEqual(await subs(r2.id), []);
    assert.deepStrictEqual(await planejada(r2.ids[0]), { o: A.id, l: null });
    assert.strictEqual(await parte(r2.ids[0]), 2);
  });

  await test('Entrada com quantidade 0 e outro "Sai de" nao conta; planejada inteira entregue antes: nada', async () => {
    const A = await loc('ZA'); const B = await loc('ZB'); const m = await material(); const m2 = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10); await entrar(m2.id, A.id, 10);
    const { id, ids } = await req([[m.id, 6], [m2.id, 6]]);
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await ok(separar(id, [
      { item_id: ids[0], quantidade_separada: 0, localizacao_origem_id: B.id },
      { item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: A.id },
    ]));
    assert.deepStrictEqual(await subs(id), []);
    assert.strictEqual((await planejada(ids[0])).o, A.id);
    // Separado todo entregue: a planejada sai (Etapa 59) e a rodada nova de B nao e troca.
    await ok(entregar(id, [{ item_id: ids[0], quantidade_atendida: 3 }]));
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: B.id }]));
    assert.deepStrictEqual(await subs(id), []);
  });

  await test('Etapa 196 (era "quantidade = o pendente antes" da 65): A 6, entrega 2, rodada de B 3 — nenhuma troca, A fica com 4; a entrega de um clique de 7 tira 4 de A e nao registra troca', async () => {
    const A = await loc('QA'); const B = await loc('QB'); const m = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10);
    const { id, ids } = await req([[m.id, 10]]);
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 6, localizacao_origem_id: A.id }]));
    await ok(entregar(id, [{ item_id: ids[0], quantidade_atendida: 2 }]));
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: B.id }]));
    assert.deepStrictEqual(await subs(id), []);
    assert.strictEqual(await parte(ids[0]), 4);
    await ok(entregar(id, [{ item_id: ids[0], quantidade_atendida: 7 }]));
    assert.deepStrictEqual(await subs(id), []);
    const deA = await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) q FROM movimentacoes_almoxarifado
      WHERE material_id = ? AND tipo = 'SAIDA' AND localizacao_origem_id = ?`, [m.id, A.id]);
    assert.strictEqual(Number(deA.q), 6); // 2 da primeira entrega + 4 da parte de A
  });

  await test('Rodada RECUSADA na passada 1 (segundo item sem saldo na origem) nao registra troca nem apaga a planejada', async () => {
    const A = await loc('RA'); const B = await loc('RB'); const C = await loc('RC'); const m = await material(); const m2 = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10); await entrar(m2.id, C.id, 1); await entrar(m2.id, A.id, 10);
    const { id, ids } = await req([[m.id, 8], [m2.id, 5]]);
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    const r = await separar(id, [
      { item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: B.id },
      { item_id: ids[1], quantidade_separada: 3, localizacao_origem_id: C.id },
    ]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.deepStrictEqual(await subs(id), []);
    assert.strictEqual((await planejada(ids[0])).o, A.id);
  });


  await test('Etapa 196 (era a Fase 5 da 65, par exato): planejada SEM lote (A, —) 2 e rodada (A, L1) 4 — nenhuma troca, (A, —) fica com 2; a entrega de um clique de 6 tira 2 de (A, —) e 4 no automatico', async () => {
    const A = await loc('LA'); const m = await material();
    const c1 = `L1-${seq}`; const c2 = `L2-${seq}`;
    await entrar(m.id, A.id, 2); await entrar(m.id, A.id, 10, c1); await entrar(m.id, A.id, 10, c2);
    const l1 = await loteId(m.id, c1); const l2 = await loteId(m.id, c2);
    const r1 = await req([[m.id, 6]]);
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]));
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 4, localizacao_origem_id: A.id, lote_id: l1 }]));
    assert.deepStrictEqual(await subs(r1.id), []);
    assert.deepStrictEqual(await planejada(r1.ids[0]), { o: A.id, l: null });
    assert.strictEqual(await parte(r1.ids[0]), 2);
    // A sonda da Fase 5 da 65: com a planejada (A, —) aplicada a caixa inteira, esta entrega era recusada ("O saldo em A (2) nao
    // cobre (6)") — a 65 apagava a planejada; a 196 a limita a parte.
    await ok(entregar(r1.id, [{ item_id: r1.ids[0], quantidade_atendida: 6 }]));
    const semLote = await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) q FROM estoque_saldo_almoxarifado
      WHERE material_id = ? AND localizacao_id = ? AND lote_id IS NULL`, [m.id, A.id]);
    assert.strictEqual(Number(semLote.q), 0);
    const r2 = await req([[m.id, 6]]);
    await ok(separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id, lote_id: l1 }]));
    await ok(separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id, lote_id: l2 }]));
    assert.deepStrictEqual(await subs(r2.id), []);
    assert.deepStrictEqual(await planejada(r2.ids[0]), { o: A.id, l: l1 });
    assert.strictEqual(await parte(r2.ids[0]), 2);
  });

  await test('Motivo: na separacao e ignorado (nao-texto, longo — 200, sem troca); a troca da ENTREGA continua com momento ENTREGA e o motivo cortado em 500', async () => {
    const A = await loc('MA'); const B = await loc('MB'); const m = await material();
    await entrar(m.id, A.id, 20); await entrar(m.id, B.id, 20);
    const r1 = await req([[m.id, 10]]);
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]));
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 2, localizacao_origem_id: B.id, motivo_substituicao: 42 }]));
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 2, localizacao_origem_id: B.id, motivo_substituicao: 'x'.repeat(600) }]));
    assert.deepStrictEqual(await subs(r1.id), []);
    const r3 = await req([[m.id, 3]]);
    await ok(separar(r3.id, [{ item_id: r3.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await ok(entregar(r3.id, [{ item_id: r3.ids[0], quantidade_atendida: 3, localizacao_origem_id: B.id, motivo_substituicao: 'y'.repeat(600) }]));
    const s = await subs(r3.id);
    assert.strictEqual(s.length, 1); assert.strictEqual(s[0].momento, 'ENTREGA');
    assert.strictEqual(s[0].quantidade, 3); assert.strictEqual(s[0].motivo.length, 500);
  });

  await test('Etapa 196 (era a Fase 5 da 65): rodada SO de lote (sem endereco) sobre planejada A — nenhuma troca, A fica com 2', async () => {
    const A = await loc('OA'); const m = await material();
    const c = `LO-${seq}`;
    await entrar(m.id, A.id, 5); await entrar(m.id, A.id, 5, c);
    const l = await loteId(m.id, c);
    const { id, ids } = await req([[m.id, 6]]);
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]));
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 2, lote_id: l }]));
    assert.deepStrictEqual(await subs(id), []);
    assert.deepStrictEqual(await planejada(ids[0]), { o: A.id, l: null });
    assert.strictEqual(await parte(ids[0]), 2);
  });

  // Etapa 196: o teste "o INSERT da troca falhando nao derruba a rodada (best-effort)" foi APAGADO — a separacao nao grava mais
  // troca (B1314), entao nao ha INSERT para falhar. A rodada continua append-only e coberta pelas suites da separacao.

  await test('Pelo SERVICO (sem a rota) tambem nao registra: A 2 + B 2 -> origem A com 2', async () => {
    const A = await loc('SA'); const B = await loc('SB'); const m = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10);
    const { id, ids } = await req([[m.id, 6]]);
    await requisitionService.separarRequisicao(db, id, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }], ADMIN);
    await requisitionService.separarRequisicao(db, id, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: B.id }], ADMIN);
    assert.deepStrictEqual(await requisitionService.listarSubstituicoes(db, id), []);
    assert.strictEqual(await parte(ids[0]), 2);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})();
