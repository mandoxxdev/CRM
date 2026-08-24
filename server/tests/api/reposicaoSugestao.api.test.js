/**
 * Etapa 11, Task 1 — RN-01..RN-06, RN-08: motor de sugestao de reposicao e
 * GET /api/almoxarifado/reposicao/sugestoes.
 *
 * Fontes unicas consumidas (nunca reescritas): disponivelSql (availabilitySql.js) ja desconta
 * reservado/bloqueado/inspecao/terceiros; custoUnitarioSql (custoSql.js); TIPOS_SAIDA
 * (movementTypes.js) e a regua de consumo (tudo que debita patrimonio, D6 do design).
 *
 * Executar: cd server && node tests/api/reposicaoSugestao.api.test.js
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
const GESTOR = { id: 2, nome: 'Gestor', role: 'usuario', perfil_almoxarifado: 'GESTOR', email: 'gestor@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };
const COMPRAS = { id: 5, nome: 'Comprador', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'compras@test.com' };
const PRODUCAO = { id: 9, nome: 'Producao', role: 'usuario', email: 'producao@test.com' };

let seq = 0;
async function novoMaterial(db, over = {}) {
  seq += 1;
  const m = { codigo: `REP-${seq}`, nome: `Material Rep ${seq}`, unidade: 'UN', qtd: 0,
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
  // saldo_anterior/saldo_posterior sao NOT NULL sem default (Fase 2, Critical 1); nada da
  // reposicao le essas colunas — 0 como fixture, mesmo padrao de materialClienteSeloProprietario.
  await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, usuario_id, cancelado, created_at)
     VALUES (?,?,?,0,0,1,?, datetime('now', ?))`,
    [materialId, tipo, quantidade, cancelado, `-${diasAtras} days`]);
}
async function sugestoes(app) { return request(app).get('/api/almoxarifado/reposicao/sugestoes'); }
function itemDe(res, materialId) {
  for (const g of res.body.fornecedores) {
    const it = g.itens.find((i) => i.material_id === materialId);
    if (it) return it;
  }
  return undefined;
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  await test('RN-01: consumo medio vem da janela — saida velha e cancelada ficam fora', async () => {
    const mat = await novoMaterial(db, { prazo: 10 });
    await saidaNoLivro(db, mat.id, 30, { diasAtras: 1 });
    await saidaNoLivro(db, mat.id, 30, { diasAtras: 10 });
    await saidaNoLivro(db, mat.id, 30, { diasAtras: 80 });
    await saidaNoLivro(db, mat.id, 900, { diasAtras: 200 }); // fora da janela (default 90)
    await saidaNoLivro(db, mat.id, 900, { diasAtras: 5, cancelado: 1 }); // cancelada

    const res = await sugestoes(app);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const item = itemDe(res, mat.id);
    assert.ok(item, 'material deveria estar na sugestao (ponto calculado 10 > posicao 0)');
    assert.strictEqual(item.consumo_medio_diario, 1, JSON.stringify(item)); // 90/90
  });

  await test('RN-02: origem do ponto — CADASTRADO vence CALCULADO vence MINIMO; sem regua nao sugere', async () => {
    const matCadastrado = await novoMaterial(db, { ponto: 50, prazo: 10 });
    await saidaNoLivro(db, matCadastrado.id, 90, { diasAtras: 1 }); // consumo 1/dia

    const matCalculado = await novoMaterial(db, { prazo: 10 });
    await saidaNoLivro(db, matCalculado.id, 90, { diasAtras: 1 }); // consumo 1/dia -> ponto 10

    const matMinimo = await novoMaterial(db, { minima: 5 });

    const matSemRegua = await novoMaterial(db, {});

    const res = await sugestoes(app);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const itCadastrado = itemDe(res, matCadastrado.id);
    assert.ok(itCadastrado, 'CADASTRADO deveria aparecer');
    assert.strictEqual(itCadastrado.origem_ponto, 'CADASTRADO', JSON.stringify(itCadastrado));
    assert.strictEqual(itCadastrado.ponto_efetivo, 50, JSON.stringify(itCadastrado));

    const itCalculado = itemDe(res, matCalculado.id);
    assert.ok(itCalculado, 'CALCULADO deveria aparecer');
    assert.strictEqual(itCalculado.origem_ponto, 'CALCULADO', JSON.stringify(itCalculado));
    assert.strictEqual(itCalculado.ponto_efetivo, 10, JSON.stringify(itCalculado));

    const itMinimo = itemDe(res, matMinimo.id);
    assert.ok(itMinimo, 'MINIMO deveria aparecer');
    assert.strictEqual(itMinimo.origem_ponto, 'MINIMO', JSON.stringify(itMinimo));
    assert.strictEqual(itMinimo.ponto_efetivo, 5, JSON.stringify(itMinimo));

    const itSemRegua = itemDe(res, matSemRegua.id);
    assert.strictEqual(itSemRegua, undefined, 'material sem regua nunca deveria ser sugerido');
  });

  await test('RN-03: solicitacao aberta entra na posicao e tira o material da sugestao (com horizonte)', async () => {
    const mat = await novoMaterial(db, { minima: 5, qtd: 0 });

    let res = await sugestoes(app);
    let item = itemDe(res, mat.id);
    assert.ok(item, 'deveria aparecer antes da solicitacao');
    assert.strictEqual(item.posicao, 0, JSON.stringify(item));

    const sol = await dbRun(db, `INSERT INTO solicitacoes_compra_almoxarifado
        (material_id, quantidade, status) VALUES (?, 10, 'PENDENTE')`, [mat.id]);
    res = await sugestoes(app);
    item = itemDe(res, mat.id);
    assert.strictEqual(item, undefined, 'solicitacao PENDENTE deveria segurar a posicao (10 >= 5)');

    await dbRun(db, `UPDATE solicitacoes_compra_almoxarifado SET status = 'VINCULADO' WHERE id = ?`, [sol.lastID]);
    res = await sugestoes(app);
    item = itemDe(res, mat.id);
    assert.strictEqual(item, undefined, 'VINCULADO tambem deveria segurar a posicao');

    // Status inexistente de proposito: so PENDENTE/VINCULADO sao escritos no sistema; prova o
    // IN-list e mostra por que o horizonte (abaixo) e necessario — nao ha status terminal.
    await dbRun(db, `UPDATE solicitacoes_compra_almoxarifado SET status = 'FECHADO' WHERE id = ?`, [sol.lastID]);
    res = await sugestoes(app);
    item = itemDe(res, mat.id);
    assert.ok(item, 'status fora do IN-list nao deveria segurar a posicao');

    // Horizonte: solicitacao PENDENTE mas velha (90 dias > horizonte default 60) nao segura mais.
    await dbRun(db, `UPDATE solicitacoes_compra_almoxarifado SET status = 'PENDENTE' WHERE id = ?`, [sol.lastID]);
    await dbRun(db, `UPDATE solicitacoes_compra_almoxarifado SET created_at = datetime('now', '-90 days') WHERE id = ?`, [sol.lastID]);
    res = await sugestoes(app);
    item = itemDe(res, mat.id);
    assert.ok(item, 'solicitacao com 90 dias nao deveria mais segurar a posicao (horizonte 60)');
  });

  await test('RN-03: reserva NAO e descontada duas vezes', async () => {
    const mat = await novoMaterial(db, { qtd: 10, minima: 8 });
    await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_reservada = 4 WHERE id = ?`, [mat.id]);

    const res = await sugestoes(app);
    const item = itemDe(res, mat.id);
    assert.ok(item, 'deveria aparecer (disponivel 6 < minima 8)');
    assert.strictEqual(item.disponivel, 6, JSON.stringify(item));
    assert.strictEqual(item.posicao, 6, JSON.stringify(item));
  });

  await test('RN-04: alvo e o maior entre maxima e ponto; lote economico e piso', async () => {
    const matA = await novoMaterial(db, { minima: 5, maxima: 20, qtd: 0 });
    const matB = await novoMaterial(db, { minima: 5, maxima: 2, qtd: 0 }); // dado ruim
    const matC = await novoMaterial(db, { minima: 5, lote: 50, qtd: 0 });
    const matD = await novoMaterial(db, { minima: 5, qtd: 5 }); // ja cobre o alvo

    const res = await sugestoes(app);
    assert.strictEqual(itemDe(res, matA.id).quantidade_sugerida, 20, JSON.stringify(itemDe(res, matA.id)));
    assert.strictEqual(itemDe(res, matB.id).quantidade_sugerida, 5, JSON.stringify(itemDe(res, matB.id)));
    assert.strictEqual(itemDe(res, matC.id).quantidade_sugerida, 50, JSON.stringify(itemDe(res, matC.id)));
    assert.strictEqual(itemDe(res, matD.id), undefined, 'posicao ja cobre o alvo, nao deveria sugerir');
  });

  await test('RN-04: valor estimado pela fonte unica de custo', async () => {
    const mat = await novoMaterial(db, { minima: 5, maxima: 20, qtd: 0, custo: 10 });
    const res = await sugestoes(app);
    const item = itemDe(res, mat.id);
    assert.strictEqual(item.quantidade_sugerida, 20, JSON.stringify(item));
    assert.strictEqual(item.valor_estimado, 200, JSON.stringify(item));

    const grupo = res.body.fornecedores.find((g) => g.itens.some((i) => i.material_id === mat.id));
    assert.ok(grupo.valor_total >= 200, JSON.stringify(grupo));
  });

  await test('RN-05: agrupamento por fornecedor, alfabetico, sem-fornecedor por ultimo', async () => {
    const fZeta = await dbRun(db, `INSERT INTO fornecedores (razao_social) VALUES ('Zeta Acos')`);
    const fAlfa = await dbRun(db, `INSERT INTO fornecedores (razao_social) VALUES ('Alfa Parafusos')`);

    await novoMaterial(db, { minima: 5, qtd: 0, fornecedor_id: fZeta.lastID });
    await novoMaterial(db, { minima: 5, qtd: 0, fornecedor_id: fAlfa.lastID });
    await novoMaterial(db, { minima: 5, qtd: 0, fornecedor_id: null });

    const res = await sugestoes(app);
    const nomes = res.body.fornecedores.map((g) => g.fornecedor_nome);
    const idxAlfa = nomes.indexOf('Alfa Parafusos');
    const idxZeta = nomes.indexOf('Zeta Acos');
    const idxSem = nomes.indexOf('Sem fornecedor definido');
    assert.ok(idxAlfa !== -1 && idxZeta !== -1 && idxSem !== -1, JSON.stringify(nomes));
    assert.ok(idxAlfa < idxZeta, `Alfa deveria vir antes de Zeta: ${JSON.stringify(nomes)}`);
    assert.strictEqual(idxSem, nomes.length - 1, `Sem fornecedor deveria ser o ultimo: ${JSON.stringify(nomes)}`);
  });

  await test('RN-06: risco de parada = critico com disponivel <= 0', async () => {
    const matCriticoZerado = await novoMaterial(db, { minima: 5, qtd: 0 });
    await dbRun(db, `UPDATE materiais_almoxarifado SET material_critico = 1 WHERE id = ?`, [matCriticoZerado.id]);

    const matCriticoComSaldo = await novoMaterial(db, { minima: 5, qtd: 3 });
    await dbRun(db, `UPDATE materiais_almoxarifado SET material_critico = 1 WHERE id = ?`, [matCriticoComSaldo.id]);

    const matNaoCriticoZerado = await novoMaterial(db, { minima: 5, qtd: 0 });

    const res = await sugestoes(app);
    assert.strictEqual(itemDe(res, matCriticoZerado.id).risco_parada, true, JSON.stringify(itemDe(res, matCriticoZerado.id)));
    assert.strictEqual(itemDe(res, matCriticoComSaldo.id).risco_parada, false, JSON.stringify(itemDe(res, matCriticoComSaldo.id)));
    assert.strictEqual(itemDe(res, matNaoCriticoZerado.id).risco_parada, false, JSON.stringify(itemDe(res, matNaoCriticoZerado.id)));
    assert.ok(res.body.resumo.riscos_parada >= 1, JSON.stringify(res.body.resumo));
  });

  await test('RN-01: material de cliente fica fora', async () => {
    const cliente = await dbRun(db, `INSERT INTO clientes (razao_social) VALUES ('Cliente Reposicao')`);
    const mat = await novoMaterial(db, { minima: 5, qtd: 0, cliente_id: cliente.lastID });

    const res = await sugestoes(app);
    assert.strictEqual(itemDe(res, mat.id), undefined, 'material de cliente nao deveria ser sugerido');
  });

  await test('RN-08: gate positivo e negativo', async () => {
    setUser(PRODUCAO);
    let res = await sugestoes(app);
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));

    setUser(ALMOXARIFE);
    res = await sugestoes(app);
    assert.strictEqual(res.status, 403, JSON.stringify(res.body)); // fora de proposito, D9

    setUser(COMPRAS);
    res = await sugestoes(app);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    setUser(GESTOR);
    res = await sugestoes(app);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    setUser(ADMIN);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
