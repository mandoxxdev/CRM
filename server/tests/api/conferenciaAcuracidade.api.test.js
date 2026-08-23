/**
 * Etapa 10b, Task 3 — RN-05/RN-06/RN-07: impacto financeiro persistido + relatorio de
 * acuracidade.
 *
 * RN-05: `PUT /concluir` calcula o impacto financeiro SEMPRE (com ou sem aplicar_ajustes) sobre
 * os itens contados com divergencia — Sigma |divergencia| x custo unitario (custoUnitarioSql,
 * fonte unica) — e persiste na coluna `impacto_financeiro`. Mudanca declarada em relacao a
 * Etapa 10: concluir SEM aplicar respondia impactoFinanceiro: 0; passa a responder o valor
 * encontrado.
 *
 * RN-06: `GET /conferencias/relatorio-acuracidade` lista so CONCLUIDO, mais recente primeiro,
 * com metricas DERIVADAS dos itens (contados, exatos, divergentes, acuracidade — null quando
 * contados = 0) e o agregado PONDERADO por item contado (Sigma exatos / Sigma contados), nao
 * media simples das porcentagens.
 *
 * RN-07: gate `requirePermission('inventario')`.
 *
 * Executar: cd server && node tests/api/conferenciaAcuracidade.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };
const PRODUCAO = { id: 9, nome: 'Chao de Fabrica', role: 'usuario', email: 'prod@test.com' };

let seq = 0;
async function novoMaterial(db, { qtd = 100, categoria = null, custo_unitario = 0 } = {}) {
  seq += 1;
  const codigo = `ACUR-${seq}`;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, categoria, custo_unitario)
     VALUES (?,?,'UN',?,1,?,?)`,
    [codigo, `Material Acuracidade ${seq}`, qtd, categoria, custo_unitario]);
  return { id: r.lastID, codigo };
}

async function abrirConferencia(app, body = {}) {
  const res = await request(app).post('/api/almoxarifado/conferencias').send(body);
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function itensDaConferencia(db, confId) {
  return dbAll(db, `SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? ORDER BY id`, [confId]);
}

async function contarItem(app, confId, itemId, quantidade) {
  return request(app).put(`/api/almoxarifado/conferencias/${confId}/item/${itemId}`)
    .send({ quantidade_contada: quantidade });
}

async function concluir(app, confId, body = {}) {
  return request(app).put(`/api/almoxarifado/conferencias/${confId}/concluir`).send(body);
}

async function relatorio(app) {
  return request(app).get('/api/almoxarifado/conferencias/relatorio-acuracidade');
}

async function materialAtual(db, materialId) {
  return dbGet(db, `SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?`, [materialId]);
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });
  setUser(ALMOXARIFE);

  await test('RN-05: concluir com aplicar_ajustes persiste impacto_financeiro', async () => {
    const categoria = 'CAT-ACUR-01';
    const mat = await novoMaterial(db, { qtd: 100, categoria, custo_unitario: 10 });
    const conf = await abrirConferencia(app, { categoria, tolerancia_percentual: 100000 });
    const itens = await itensDaConferencia(db, conf.id);
    const item = itens.find((i) => i.material_id === mat.id);
    await contarItem(app, conf.id, item.id, 90);

    // Aplicar ajustes exige `ajustar_estoque` — ALMOXARIFE nao tem (so `inventario`).
    setUser(ADMIN);
    const res = await concluir(app, conf.id, { aplicar_ajustes: true, justificativa_ajuste: 'ajuste 10b' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.impactoFinanceiro, 100, JSON.stringify(res.body));

    const row = await dbGet(db, `SELECT impacto_financeiro FROM conferencias_almoxarifado WHERE id = ?`, [conf.id]);
    assert.strictEqual(row.impacto_financeiro, 100, JSON.stringify(row));
    setUser(ALMOXARIFE);
  });

  await test('RN-05: concluir SEM aplicar tambem calcula e persiste', async () => {
    const categoria = 'CAT-ACUR-02';
    const mat = await novoMaterial(db, { qtd: 100, categoria, custo_unitario: 10 });
    const conf = await abrirConferencia(app, { categoria, tolerancia_percentual: 100000 });
    const itens = await itensDaConferencia(db, conf.id);
    const item = itens.find((i) => i.material_id === mat.id);
    await contarItem(app, conf.id, item.id, 90);

    const res = await concluir(app, conf.id, {});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.impactoFinanceiro, 100, JSON.stringify(res.body));

    const row = await dbGet(db, `SELECT impacto_financeiro FROM conferencias_almoxarifado WHERE id = ?`, [conf.id]);
    assert.strictEqual(row.impacto_financeiro, 100, JSON.stringify(row));

    // Nao aplicou: o saldo do material nao mudou.
    const matAtual = await materialAtual(db, mat.id);
    assert.strictEqual(Number(matAtual.quantidade_atual), 100, JSON.stringify(matAtual));
  });

  await test('RN-06: metricas por conferencia com numeros conhecidos', async () => {
    const categoria = 'CAT-ACUR-03';
    const matExato = await novoMaterial(db, { qtd: 50, categoria });
    const matDivergente = await novoMaterial(db, { qtd: 50, categoria });
    await novoMaterial(db, { qtd: 50, categoria }); // fica sem contar

    const conf = await abrirConferencia(app, { categoria, tolerancia_percentual: 100000 });
    assert.strictEqual(conf.totalItens, 3, JSON.stringify(conf));
    const itens = await itensDaConferencia(db, conf.id);
    const itemExato = itens.find((i) => i.material_id === matExato.id);
    const itemDivergente = itens.find((i) => i.material_id === matDivergente.id);
    await contarItem(app, conf.id, itemExato.id, 50);
    await contarItem(app, conf.id, itemDivergente.id, 40);

    const res = await concluir(app, conf.id, {});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const rel = await relatorio(app);
    assert.strictEqual(rel.status, 200, JSON.stringify(rel.body));
    const linha = rel.body.conferencias.find((c) => c.id === conf.id);
    assert.ok(linha, 'conferencia nao apareceu no relatorio');
    assert.strictEqual(linha.total_itens, 3, JSON.stringify(linha));
    assert.strictEqual(linha.contados, 2, JSON.stringify(linha));
    assert.strictEqual(linha.exatos, 1, JSON.stringify(linha));
    assert.strictEqual(linha.divergentes, 1, JSON.stringify(linha));
    assert.strictEqual(linha.acuracidade, 50, JSON.stringify(linha));
    assert.strictEqual(linha.escopo_descricao, conf.escopo_descricao, JSON.stringify(linha));
  });

  await test('RN-06: conferencia concluida sem contagem tem acuracidade null e contados 0', async () => {
    const categoria = 'CAT-ACUR-04';
    await novoMaterial(db, { qtd: 10, categoria });
    const conf = await abrirConferencia(app, { categoria, tolerancia_percentual: 100000 });

    const res = await concluir(app, conf.id, {});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const rel = await relatorio(app);
    const linha = rel.body.conferencias.find((c) => c.id === conf.id);
    assert.ok(linha, 'conferencia nao apareceu no relatorio');
    assert.strictEqual(linha.contados, 0, JSON.stringify(linha));
    assert.strictEqual(linha.acuracidade, null, JSON.stringify(linha));
  });

  await test('RN-06: impacto nulo de conferencia antiga aparece como null', async () => {
    const categoria = 'CAT-ACUR-05';
    const mat = await novoMaterial(db, { qtd: 100, categoria, custo_unitario: 10 });
    const conf = await abrirConferencia(app, { categoria, tolerancia_percentual: 100000 });
    const itens = await itensDaConferencia(db, conf.id);
    const item = itens.find((i) => i.material_id === mat.id);
    await contarItem(app, conf.id, item.id, 90);

    await concluir(app, conf.id, {});
    // Simula conferencia concluida antes da Etapa 10b (impacto nao medido). COM WHERE: sem ele
    // zera o impacto de TODAS as conferencias do banco compartilhado.
    await dbRun(db, `UPDATE conferencias_almoxarifado SET impacto_financeiro = NULL WHERE id = ?`, [conf.id]);

    const rel = await relatorio(app);
    const linha = rel.body.conferencias.find((c) => c.id === conf.id);
    assert.ok(linha, 'conferencia nao apareceu no relatorio');
    assert.strictEqual(linha.impacto_financeiro, null, JSON.stringify(linha));
  });

  await test('RN-06: so CONCLUIDO entra no relatorio', async () => {
    const categoriaAberta = 'CAT-ACUR-06-ABERTA';
    const categoriaCancelada = 'CAT-ACUR-06-CANCELADA';
    await novoMaterial(db, { qtd: 10, categoria: categoriaAberta });
    await novoMaterial(db, { qtd: 10, categoria: categoriaCancelada });
    const confAberta = await abrirConferencia(app, { categoria: categoriaAberta, tolerancia_percentual: 100000 });
    const confCancelada = await abrirConferencia(app, { categoria: categoriaCancelada, tolerancia_percentual: 100000 });

    const resCancelar = await request(app).put(`/api/almoxarifado/conferencias/${confCancelada.id}/cancelar`);
    assert.strictEqual(resCancelar.status, 200, JSON.stringify(resCancelar.body));

    const rel = await relatorio(app);
    const numeros = rel.body.conferencias.map((c) => c.numero);
    assert.ok(!numeros.includes(confAberta.numero), 'conferencia ABERTA nao deveria aparecer');
    assert.ok(!numeros.includes(confCancelada.numero), 'conferencia CANCELADA nao deveria aparecer');
  });

  await test('RN-06: agregado e ponderado por item contado', async () => {
    const categoriaA = 'CAT-ACUR-07-A';
    const categoriaB = 'CAT-ACUR-07-B';

    // Conferencia A: 4 itens, todos contados e exatos.
    const matsA = [];
    for (let i = 0; i < 4; i++) matsA.push(await novoMaterial(db, { qtd: 10, categoria: categoriaA }));
    const confA = await abrirConferencia(app, { categoria: categoriaA, tolerancia_percentual: 100000 });
    const itensA = await itensDaConferencia(db, confA.id);
    for (const mat of matsA) {
      const item = itensA.find((i) => i.material_id === mat.id);
      await contarItem(app, confA.id, item.id, 10);
    }
    const resA = await concluir(app, confA.id, {});
    assert.strictEqual(resA.status, 200, JSON.stringify(resA.body));

    // Conferencia B: 2 itens, so 1 contado (0 exatos).
    const matsB = [];
    for (let i = 0; i < 2; i++) matsB.push(await novoMaterial(db, { qtd: 10, categoria: categoriaB }));
    const confB = await abrirConferencia(app, { categoria: categoriaB, tolerancia_percentual: 100000 });
    const itensB = await itensDaConferencia(db, confB.id);
    const itemB1 = itensB.find((i) => i.material_id === matsB[0].id);
    await contarItem(app, confB.id, itemB1.id, 8);
    const resB = await concluir(app, confB.id, {});
    assert.strictEqual(resB.status, 200, JSON.stringify(resB.body));

    const rel = await relatorio(app);
    assert.strictEqual(rel.status, 200, JSON.stringify(rel.body));
    const linhaA = rel.body.conferencias.find((c) => c.id === confA.id);
    const linhaB = rel.body.conferencias.find((c) => c.id === confB.id);
    assert.ok(linhaA && linhaB, 'conferencias A/B nao apareceram no relatorio');

    // Absolutos das linhas primeiro — o que impede o teste de ser auto-referencial.
    assert.strictEqual(linhaA.total_itens, 4, JSON.stringify(linhaA));
    assert.strictEqual(linhaA.contados, 4, JSON.stringify(linhaA));
    assert.strictEqual(linhaA.exatos, 4, JSON.stringify(linhaA));
    assert.strictEqual(linhaB.total_itens, 2, JSON.stringify(linhaB));
    assert.strictEqual(linhaB.contados, 1, JSON.stringify(linhaB));
    assert.strictEqual(linhaB.exatos, 0, JSON.stringify(linhaB));

    // So entao o agregado, derivado dos proprios totais respondidos (banco compartilhado).
    const agregado = rel.body.agregado;
    const esperada = Number(((agregado.exatos / agregado.contados) * 100).toFixed(2));
    assert.strictEqual(agregado.acuracidade, esperada, JSON.stringify(agregado));
  });

  await test('RN-07: sem perfil e 403', async () => {
    setUser(PRODUCAO);
    const res = await relatorio(app);
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    setUser(ALMOXARIFE);
  });

  await test('RN-07: ALMOXARIFE (tem inventario, nao tem ajustar_estoque) le o relatorio', async () => {
    setUser(ALMOXARIFE);
    const res = await relatorio(app);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
