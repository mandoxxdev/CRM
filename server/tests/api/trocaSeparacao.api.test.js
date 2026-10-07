/**
 * Etapa 65 — a troca de origem NA SEPARACAO fica registrada: uma rodada que apaga a origem planejada
 * (separado pendente de A, nova rodada de B / automatica / de varios pares) grava uma linha em
 * substituicoes_origem_requisicao com momento SEPARACAO. So registro: a regra da rodada nao muda,
 * exceto a planejada SEM lote, que agora vale qualquer lote do mesmo endereco (como na entrega).
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa65-troca-na-separacao.md
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

  await test('RN-01 separou 5 de A, nova rodada de B: troca SEPARACAO (5 ja separados de A -> B), com a rodada e o motivo; o detalhe mostra', async () => {
    const A = await loc('A'); const B = await loc('B'); const m = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10);
    const { id, ids } = await req([[m.id, 10]]);
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 5, localizacao_origem_id: A.id }]));
    const r2 = await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: B.id, motivo_substituicao: '  A acabou na prateleira  ' }]));
    const s = await subs(id);
    assert.strictEqual(s.length, 1, JSON.stringify(s));
    assert.strictEqual(s[0].momento, 'SEPARACAO');
    assert.strictEqual(s[0].quantidade, 5);
    assert.strictEqual(s[0].planejada_codigo, A.codigo); assert.strictEqual(s[0].saiu_codigo, B.codigo);
    assert.strictEqual(s[0].automatica, 0);
    assert.strictEqual(s[0].motivo, 'A acabou na prateleira');
    const linha = await dbGet(db, 'SELECT separacao_id, movimentacao_ids FROM substituicoes_origem_requisicao WHERE id = ?', [s[0].id]);
    assert.strictEqual(linha.separacao_id, r2.body.rodada_id);
    assert.strictEqual(linha.movimentacao_ids, null);
    assert.deepStrictEqual(await planejada(ids[0]), { o: null, l: null }); // B237 inalterada
  });

  await test('RN-01 rodada AUTOMATICA (sem "Sai de") sobre planejada A: troca automatica', async () => {
    const A = await loc('AA'); const m = await material();
    await entrar(m.id, A.id, 10);
    const { id, ids } = await req([[m.id, 8]]);
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 4, localizacao_origem_id: A.id }]));
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 2 }]));
    const s = await subs(id);
    assert.strictEqual(s.length, 1, JSON.stringify(s));
    assert.strictEqual(s[0].automatica, 1); assert.strictEqual(s[0].saiu_codigo, null); assert.strictEqual(s[0].quantidade, 4);
  });

  await test('RN-01 varios pares na rodada (A e B) sobre planejada C: saida nula, nao automatica', async () => {
    const A = await loc('VA'); const B = await loc('VB'); const C = await loc('VC'); const m = await material();
    await entrar(m.id, A.id, 5); await entrar(m.id, B.id, 5); await entrar(m.id, C.id, 5);
    const { id, ids } = await req([[m.id, 9]]);
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: C.id }]));
    await ok(separar(id, [
      { item_id: ids[0], quantidade_separada: 1, localizacao_origem_id: A.id, motivo_substituicao: '   ' },
      { item_id: ids[0], quantidade_separada: 1, localizacao_origem_id: A.id, motivo_substituicao: 'segundo' },
      { item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: B.id, motivo_substituicao: 'terceiro' },
    ]));
    const s = await subs(id);
    assert.strictEqual(s.length, 1, JSON.stringify(s));
    assert.strictEqual(s[0].saiu_codigo, null); assert.strictEqual(s[0].automatica, 0); assert.strictEqual(s[0].quantidade, 3);
    assert.strictEqual(s[0].motivo, 'segundo'); // o primeiro NAO vazio
  });

  await test('Metade positiva: mesma origem, sem planejada antes, e A-e-B na MESMA rodada sem planejada — nada registrado', async () => {
    const A = await loc('PA'); const B = await loc('PB'); const m = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10);
    const r1 = await req([[m.id, 8]]);
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]));
    assert.deepStrictEqual(await subs(r1.id), []);
    assert.strictEqual((await planejada(r1.ids[0])).o, A.id); // a mesma origem mantem a planejada
    const r2 = await req([[m.id, 4]]);
    await ok(separar(r2.id, [
      { item_id: r2.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id },
      { item_id: r2.ids[0], quantidade_separada: 2, localizacao_origem_id: B.id },
    ]));
    assert.deepStrictEqual(await subs(r2.id), []);
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

  await test('Quantidade = o pendente ANTES da rodada (com entrega parcial no meio); a entrega de depois nao registra outra troca', async () => {
    const A = await loc('QA'); const B = await loc('QB'); const m = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10);
    const { id, ids } = await req([[m.id, 10]]);
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 6, localizacao_origem_id: A.id }]));
    await ok(entregar(id, [{ item_id: ids[0], quantidade_atendida: 2 }]));
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: B.id }]));
    let s = await subs(id);
    assert.strictEqual(s.length, 1); assert.strictEqual(s[0].quantidade, 4);
    await ok(entregar(id, [{ item_id: ids[0], quantidade_atendida: 7 }]));
    s = await subs(id);
    assert.strictEqual(s.length, 1, JSON.stringify(s));
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

  await test('Fase 5: planejada SEM lote (A, —) e rodada (A, L1) e troca (par exato) — e a entrega de um clique depois funciona; lote diferente tambem e troca', async () => {
    const A = await loc('LA'); const m = await material();
    const c1 = `L1-${seq}`; const c2 = `L2-${seq}`;
    await entrar(m.id, A.id, 2); await entrar(m.id, A.id, 10, c1); await entrar(m.id, A.id, 10, c2);
    const l1 = await loteId(m.id, c1); const l2 = await loteId(m.id, c2);
    const r1 = await req([[m.id, 6]]);
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]));
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 4, localizacao_origem_id: A.id, lote_id: l1 }]));
    const s1 = await subs(r1.id);
    assert.strictEqual(s1.length, 1, JSON.stringify(s1));
    assert.strictEqual(s1[0].planejada_lote, null); assert.strictEqual(s1[0].saiu_lote, c1); assert.strictEqual(s1[0].quantidade, 2);
    assert.deepStrictEqual(await planejada(r1.ids[0]), { o: null, l: null });
    // A sonda da Fase 5: com a planejada (A, —) mantida, esta entrega era recusada ("O saldo em A (2) nao cobre (6)").
    await ok(entregar(r1.id, [{ item_id: r1.ids[0], quantidade_atendida: 6 }]));
    const r2 = await req([[m.id, 6]]);
    await ok(separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id, lote_id: l1 }]));
    await ok(separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id, lote_id: l2 }]));
    const s = await subs(r2.id);
    assert.strictEqual(s.length, 1, JSON.stringify(s));
    assert.strictEqual(s[0].planejada_lote, c1); assert.strictEqual(s[0].saiu_lote, c2); assert.strictEqual(s[0].saiu_codigo, A.codigo);
  });

  await test('Motivo: nao-texto ignorado, longo cortado em 500; a troca da ENTREGA continua com momento ENTREGA', async () => {
    const A = await loc('MA'); const B = await loc('MB'); const m = await material();
    await entrar(m.id, A.id, 20); await entrar(m.id, B.id, 20);
    const r1 = await req([[m.id, 10]]);
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]));
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 2, localizacao_origem_id: B.id, motivo_substituicao: 42 }]));
    assert.strictEqual((await subs(r1.id))[0].motivo, null);
    const r2 = await req([[m.id, 10]]);
    await ok(separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]));
    await ok(separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 2, localizacao_origem_id: B.id, motivo_substituicao: 'x'.repeat(600) }]));
    assert.strictEqual((await subs(r2.id))[0].motivo.length, 500);
    const r3 = await req([[m.id, 3]]);
    await ok(separar(r3.id, [{ item_id: r3.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await ok(entregar(r3.id, [{ item_id: r3.ids[0], quantidade_atendida: 3, localizacao_origem_id: B.id }]));
    const s = await subs(r3.id);
    assert.strictEqual(s.length, 1); assert.strictEqual(s[0].momento, 'ENTREGA');
  });

  await test('Fase 5: rodada SO de lote (sem endereco) sobre planejada A: saida "do lote", NAO automatica', async () => {
    const A = await loc('OA'); const m = await material();
    const c = `LO-${seq}`;
    await entrar(m.id, A.id, 5); await entrar(m.id, A.id, 5, c);
    const l = await loteId(m.id, c);
    const { id, ids } = await req([[m.id, 6]]);
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]));
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 2, lote_id: l }]));
    const s = await subs(id);
    assert.strictEqual(s.length, 1, JSON.stringify(s));
    assert.strictEqual(s[0].automatica, 0); assert.strictEqual(s[0].saiu_codigo, null); assert.strictEqual(s[0].saiu_lote, c);
  });

  await test('Fase 5: o INSERT da troca falhando nao derruba a rodada (best-effort): 200, planejada apagada, sem linha', async () => {
    const A = await loc('FA'); const B = await loc('FB'); const m = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10);
    const { id, ids } = await req([[m.id, 6]]);
    await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]));
    await dbRun(db, `CREATE TRIGGER e65_falha BEFORE INSERT ON substituicoes_origem_requisicao
      WHEN NEW.requisicao_id = ${Number(id)} BEGIN SELECT RAISE(ABORT, 'falha forcada'); END`);
    const warn = console.warn; let avisou = ''; console.warn = (msg) => { avisou += msg; };
    try {
      await ok(separar(id, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: B.id }]));
    } finally {
      console.warn = warn;
      await dbRun(db, 'DROP TRIGGER e65_falha');
    }
    assert.ok(/troca de origem/.test(avisou), avisou);
    assert.deepStrictEqual(await subs(id), []);
    assert.deepStrictEqual(await planejada(ids[0]), { o: null, l: null });
  });

  await test('Pelo SERVICO (sem a rota) tambem registra', async () => {
    const A = await loc('SA'); const B = await loc('SB'); const m = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10);
    const { id, ids } = await req([[m.id, 6]]);
    await requisitionService.separarRequisicao(db, id, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }], ADMIN);
    await requisitionService.separarRequisicao(db, id, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: B.id }], ADMIN);
    const s = await requisitionService.listarSubstituicoes(db, id);
    assert.strictEqual(s.length, 1); assert.strictEqual(s[0].momento, 'SEPARACAO');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})();
