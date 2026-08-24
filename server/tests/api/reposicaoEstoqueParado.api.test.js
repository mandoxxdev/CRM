/**
 * Etapa 11, Task 2 — RN-07: GET /api/almoxarifado/reposicao/estoque-parado.
 *
 * excesso / sem_consumo / obsoleto sao flags INDEPENDENTES; `resumo` e calculado sobre a lista
 * COMPLETA, ANTES do filtro por tipo e do teto de 500 (semantica congelada pela Fase 2).
 *
 * Executar: cd server && node tests/api/reposicaoEstoqueParado.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };
const COMPRAS = { id: 5, nome: 'Comprador', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'compras@test.com' };
const PRODUCAO = { id: 9, nome: 'Producao', role: 'usuario', email: 'producao@test.com' };

// Helpers copiados de reposicaoSugestao.api.test.js (Task 1).
let seq = 0;
async function novoMaterial(db, over = {}) {
  seq += 1;
  const m = { codigo: `REP-EP-${seq}`, nome: `Material Parado ${seq}`, unidade: 'UN', qtd: 0,
    minima: 0, maxima: 0, ponto: 0, lote: 0, prazo: 0, fornecedor_id: null, cliente_id: null,
    custo: 0, ...over };
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, quantidade_minima, quantidade_maxima,
       ponto_reposicao, lote_economico, prazo_reposicao_dias, fornecedor_id,
       proprietario_cliente_id, custo_unitario)
     VALUES (?,?,?,?,1,?,?,?,?,?,?,?,?)`,
    [m.codigo, m.nome, m.unidade, m.qtd, m.minima, m.maxima, m.ponto, m.lote, m.prazo,
     m.fornecedor_id, m.cliente_id, m.custo]);
  return { id: r.lastID, codigo: m.codigo };
}
async function saidaNoLivro(db, materialId, quantidade, { diasAtras = 1, tipo = 'SAIDA', cancelado = 0 } = {}) {
  await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, usuario_id, cancelado, created_at)
     VALUES (?,?,?,0,0,1,?, datetime('now', ?))`,
    [materialId, tipo, quantidade, cancelado, `-${diasAtras} days`]);
}
async function entradaNoLivro(db, materialId, quantidade, { diasAtras = 1, tipo = 'ENTRADA_COMPRA', cancelado = 0 } = {}) {
  await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, usuario_id, cancelado, created_at)
     VALUES (?,?,?,0,0,1,?, datetime('now', ?))`,
    [materialId, tipo, quantidade, cancelado, `-${diasAtras} days`]);
}
async function estoqueParado(app, query) { return request(app).get('/api/almoxarifado/reposicao/estoque-parado').query(query || {}); }
function itemDe(res, materialId) { return res.body.itens.find((i) => i.material_id === materialId); }

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  await test('RN-07: excesso = atual > maxima > 0', async () => {
    const matExcesso = await novoMaterial(db, { qtd: 100, maxima: 50 });
    const matSemMaximaDefinida = await novoMaterial(db, { qtd: 100, maxima: 0 });

    const res = await estoqueParado(app);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const itExcesso = itemDe(res, matExcesso.id);
    assert.ok(itExcesso, 'material com atual > maxima deveria aparecer');
    assert.strictEqual(itExcesso.excesso, true, JSON.stringify(itExcesso));

    const itSemMaxima = itemDe(res, matSemMaximaDefinida.id);
    // maxima 0 nunca gera excesso, mas nunca-saiu ainda o deixa parado por sem_consumo.
    assert.ok(itSemMaxima, JSON.stringify(res.body));
    assert.strictEqual(itSemMaxima.excesso, false, JSON.stringify(itSemMaxima));
  });

  await test('RN-07: sem_consumo = nenhuma saida ha N dias (ou nunca)', async () => {
    const matVelha = await novoMaterial(db, { qtd: 10 });
    await saidaNoLivro(db, matVelha.id, 1, { diasAtras: 200 });

    const matRecente = await novoMaterial(db, { qtd: 10, maxima: 0 });
    await saidaNoLivro(db, matRecente.id, 1, { diasAtras: 10 });

    const matNuncaSaiu = await novoMaterial(db, { qtd: 10 });

    const res = await estoqueParado(app);
    assert.strictEqual(itemDe(res, matVelha.id).sem_consumo, true, JSON.stringify(itemDe(res, matVelha.id)));

    const itRecente = itemDe(res, matRecente.id);
    // sem excesso (maxima 0) e saida recente (nao sem_consumo, nao obsoleto): nenhuma flag —
    // material nao entra na lista de parados.
    assert.strictEqual(itRecente, undefined, JSON.stringify(itRecente));

    assert.strictEqual(itemDe(res, matNuncaSaiu.id).sem_consumo, true, JSON.stringify(itemDe(res, matNuncaSaiu.id)));
  });

  await test('RN-07: obsoleto exige tambem nenhuma entrada no periodo', async () => {
    const matComEntrada = await novoMaterial(db, { qtd: 10 });
    await saidaNoLivro(db, matComEntrada.id, 1, { diasAtras: 200 });
    await entradaNoLivro(db, matComEntrada.id, 1, { diasAtras: 30 });

    const matSemNada = await novoMaterial(db, { qtd: 10 });
    await saidaNoLivro(db, matSemNada.id, 1, { diasAtras: 200 });

    const res = await estoqueParado(app);
    const itComEntrada = itemDe(res, matComEntrada.id);
    assert.strictEqual(itComEntrada.sem_consumo, true, JSON.stringify(itComEntrada));
    assert.strictEqual(itComEntrada.obsoleto, false, JSON.stringify(itComEntrada));

    const itSemNada = itemDe(res, matSemNada.id);
    assert.strictEqual(itSemNada.obsoleto, true, JSON.stringify(itSemNada));
  });

  await test('RN-07: filtro por tipo, tipo VAZIO e 400 literal', async () => {
    const matExcesso = await novoMaterial(db, { qtd: 100, maxima: 10 });
    const matObsoleto = await novoMaterial(db, { qtd: 10 });
    await saidaNoLivro(db, matObsoleto.id, 1, { diasAtras: 200 });

    const resExcesso = await estoqueParado(app, { tipo: 'EXCESSO' });
    assert.strictEqual(resExcesso.status, 200, JSON.stringify(resExcesso.body));
    assert.ok(itemDe(resExcesso, matExcesso.id), JSON.stringify(resExcesso.body));
    assert.strictEqual(itemDe(resExcesso, matObsoleto.id), undefined, 'filtro EXCESSO nao deveria trazer o obsoleto');

    const resVazio = await estoqueParado(app, { tipo: '' });
    assert.strictEqual(resVazio.status, 200, JSON.stringify(resVazio.body));
    assert.ok(itemDe(resVazio, matExcesso.id), 'tipo vazio e o Todos do select');
    assert.ok(itemDe(resVazio, matObsoleto.id), 'tipo vazio e o Todos do select');

    const resInvalido = await estoqueParado(app, { tipo: 'QUALQUER' });
    assert.strictEqual(resInvalido.status, 400, JSON.stringify(resInvalido.body));
    assert.strictEqual(resInvalido.body.error, 'Tipo inválido (use EXCESSO, SEM_CONSUMO ou OBSOLETO)');

    // resumo e da lista COMPLETA, mesmo com o filtro aplicado.
    assert.ok(resExcesso.body.resumo.sem_consumo >= 1, JSON.stringify(resExcesso.body.resumo));
  });

  await test('RN-07: valor parado e resumo', async () => {
    const antes = await estoqueParado(app);
    const resumoAntes = antes.body.resumo;

    const mat = await novoMaterial(db, { qtd: 100, custo: 2 }); // sem_consumo (nunca saiu)

    const res = await estoqueParado(app);
    const item = itemDe(res, mat.id);
    assert.ok(item, JSON.stringify(res.body));
    assert.strictEqual(item.valor_parado, 200, JSON.stringify(item));

    assert.strictEqual(
      Number((res.body.resumo.valor_parado_total - resumoAntes.valor_parado_total).toFixed(2)),
      200, JSON.stringify(res.body.resumo));
    assert.strictEqual(res.body.resumo.sem_consumo, resumoAntes.sem_consumo + 1, JSON.stringify(res.body.resumo));
  });

  await test('RN-07: material de cliente e material zerado ficam fora', async () => {
    const cliente = await dbRun(db, `INSERT INTO clientes (razao_social) VALUES ('Cliente Parado')`);
    const matCliente = await novoMaterial(db, { qtd: 100, maxima: 10, cliente_id: cliente.lastID });

    const matZerado = await novoMaterial(db, { qtd: 0 }); // sem consumo, mas ocupa zero prateleira

    const res = await estoqueParado(app);
    assert.strictEqual(itemDe(res, matCliente.id), undefined, 'material de cliente nao deveria aparecer');
    assert.strictEqual(itemDe(res, matZerado.id), undefined, 'material com saldo zero nao ocupa prateleira');
  });

  await test('RN-08: gate positivo e negativo', async () => {
    setUser(PRODUCAO);
    let res = await estoqueParado(app);
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));

    setUser(ALMOXARIFE);
    res = await estoqueParado(app);
    assert.strictEqual(res.status, 403, JSON.stringify(res.body)); // fora de proposito, D9

    setUser(COMPRAS);
    res = await estoqueParado(app);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    setUser(ADMIN);
  });

  await test('resumo e da lista COMPLETA (semantica congelada) e itens saem por valor desc', async () => {
    // Important 3 da revisao: mover o resumo para depois do filtro passava 7/7 — o unico
    // assert era um >= que valia por acidente. Par que separa as semanticas: um EXCESSO puro
    // (com saida recente, nunca sem_consumo) e um OBSOLETO puro (sem excesso).
    const matExcessoPuro = await novoMaterial(db, { qtd: 100, maxima: 50, custo: 1 });
    await saidaNoLivro(db, matExcessoPuro.id, 1, { diasAtras: 2 });
    const matObsoletoPuro = await novoMaterial(db, { qtd: 10, maxima: 0, custo: 50 });
    await saidaNoLivro(db, matObsoletoPuro.id, 1, { diasAtras: 300 });

    const resTudo = await estoqueParado(app);
    const resFiltrado = await estoqueParado(app, { tipo: 'EXCESSO' });
    // O resumo do filtrado e IGUAL ao resumo do tudo — retrato do estoque inteiro.
    assert.deepStrictEqual(resFiltrado.body.resumo, resTudo.body.resumo,
      `filtrado: ${JSON.stringify(resFiltrado.body.resumo)} tudo: ${JSON.stringify(resTudo.body.resumo)}`);
    // E o filtro continua filtrando os itens: o obsoleto puro nao esta na lista de EXCESSO.
    assert.ok(!resFiltrado.body.itens.some((i) => i.material_id === matObsoletoPuro.id), 'filtro EXCESSO vazou obsoleto');
    assert.ok(resFiltrado.body.itens.some((i) => i.material_id === matExcessoPuro.id), 'excesso puro sumiu do filtro');

    // Ordenacao por valor parado desc (Minor 5): obsoleto puro vale 500, excesso puro vale
    // 100 — na lista sem filtro o de maior valor vem primeiro.
    const idxObsoleto = resTudo.body.itens.findIndex((i) => i.material_id === matObsoletoPuro.id);
    const idxExcesso = resTudo.body.itens.findIndex((i) => i.material_id === matExcessoPuro.id);
    assert.ok(idxObsoleto >= 0 && idxExcesso >= 0, JSON.stringify({ idxObsoleto, idxExcesso }));
    assert.ok(idxObsoleto < idxExcesso,
      `maior valor parado primeiro: obsoleto(500) idx ${idxObsoleto} deveria vir antes de excesso(100) idx ${idxExcesso}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
