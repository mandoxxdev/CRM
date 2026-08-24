/**
 * Etapa 11, Task 2 — RN-09: POST /api/almoxarifado/reposicao/gerar-solicitacoes.
 *
 * NAO ha dedupe neste caminho — a matematica da posicao E o dedupe (ver o comentario em
 * purchaseService.gerarSolicitacoesDaSugestao). `material_ids` ausente = todas as sugestoes do
 * momento; `[]` = NENHUMA. As quantidades vem SEMPRE do calculo do servidor.
 *
 * Executar: cd server && node tests/api/reposicaoGerarSolicitacoes.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

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
  const m = { codigo: `RGS-${seq}`, nome: `Material Gerar ${seq}`, unidade: 'UN', qtd: 0,
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
async function sugestoes(app) { return request(app).get('/api/almoxarifado/reposicao/sugestoes'); }
function itemDe(res, materialId) {
  for (const g of res.body.fornecedores) {
    const it = g.itens.find((i) => i.material_id === materialId);
    if (it) return it;
  }
  return undefined;
}
async function gerar(app, body) { return request(app).post('/api/almoxarifado/reposicao/gerar-solicitacoes').send(body || {}); }
async function contarSolicitacoes(db, materialId) {
  const row = await dbGet(db, 'SELECT COUNT(*) as c FROM solicitacoes_compra_almoxarifado WHERE material_id = ?', [materialId]);
  return row.c;
}
async function somarSolicitacoes(db, materialId) {
  const row = await dbGet(db, 'SELECT COALESCE(SUM(quantidade),0) as s FROM solicitacoes_compra_almoxarifado WHERE material_id = ?', [materialId]);
  return row.s;
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  await test('RN-09: gera com a quantidade DO SERVIDOR e audita como OBJETO', async () => {
    const mat = await novoMaterial(db, { minima: 5, maxima: 20, qtd: 0, custo: 10 });

    const res = await gerar(app, {});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const criada = res.body.criadas.find((c) => c.material_id === mat.id);
    assert.ok(criada, JSON.stringify(res.body));
    assert.strictEqual(criada.quantidade, 20, JSON.stringify(criada));

    const linha = await dbGet(db, 'SELECT * FROM solicitacoes_compra_almoxarifado WHERE material_id = ?', [mat.id]);
    assert.ok(linha, 'deveria ter gravado a linha');
    assert.strictEqual(linha.quantidade, 20, JSON.stringify(linha));
    assert.strictEqual(linha.motivo, 'PONTO_REPOSICAO', JSON.stringify(linha));
    assert.strictEqual(linha.status, 'PENDENTE', JSON.stringify(linha));

    const auditRow = await dbGet(db,
      `SELECT dados_novos FROM auditoria_log_almoxarifado WHERE entidade = 'solicitacao_compra' AND entidade_id = ?`,
      [criada.solicitacao_id]);
    assert.ok(auditRow, 'deveria ter auditado a criacao');
    const dadosNovos = JSON.parse(auditRow.dados_novos);
    assert.strictEqual(dadosNovos.quantidade, 20, JSON.stringify(dadosNovos));
  });

  await test('RN-09: segundo POST sem ids responde vazio-legivel, sem duplicar', async () => {
    const mat = await novoMaterial(db, { minima: 5, maxima: 20, qtd: 0 });

    const res1 = await gerar(app, {});
    const criada1 = res1.body.criadas.find((c) => c.material_id === mat.id);
    assert.ok(criada1, JSON.stringify(res1.body));

    // A pendencia entra em a_caminho e a posicao passa a cobrir o ponto — some da sugestao.
    const sug = await sugestoes(app);
    assert.strictEqual(itemDe(sug, mat.id), undefined, 'material deveria ter sumido da sugestao apos o 1o POST');

    const res2 = await gerar(app, {});
    assert.strictEqual(res2.status, 200, JSON.stringify(res2.body));
    assert.deepStrictEqual(res2.body.criadas.filter((c) => c.material_id === mat.id), []);
    assert.deepStrictEqual(res2.body.puladas.filter((p) => p.material_id === mat.id), []);

    assert.strictEqual(await contarSolicitacoes(db, mat.id), 1, 'nao deveria ter duplicado a solicitacao');
  });

  await test('RN-09: pendencia INSUFICIENTE gera o COMPLEMENTO', async () => {
    const mat = await novoMaterial(db, { minima: 100, qtd: 0 });
    await dbRun(db, `INSERT INTO solicitacoes_compra_almoxarifado (material_id, quantidade, status) VALUES (?, 10, 'PENDENTE')`, [mat.id]);

    const sug = await sugestoes(app);
    const item = itemDe(sug, mat.id);
    assert.ok(item, 'ainda deveria estar sugerido: posicao 10 < minima 100');
    assert.strictEqual(item.quantidade_sugerida, 90, JSON.stringify(item));

    const res = await gerar(app, {});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const criada = res.body.criadas.find((c) => c.material_id === mat.id);
    assert.ok(criada, JSON.stringify(res.body));
    assert.strictEqual(criada.quantidade, 90, JSON.stringify(criada));

    assert.strictEqual(await contarSolicitacoes(db, mat.id), 2, JSON.stringify(res.body));
    assert.strictEqual(await somarSolicitacoes(db, mat.id), 100, JSON.stringify(res.body));
  });

  await test('RN-09: id fora das sugestoes vira SEM_SUGESTAO', async () => {
    const res = await gerar(app, { material_ids: [999999] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body.criadas, []);
    assert.strictEqual(res.body.puladas.length, 1, JSON.stringify(res.body));
    assert.strictEqual(res.body.puladas[0].material_id, 999999);
    assert.strictEqual(res.body.puladas[0].motivo, 'SEM_SUGESTAO');

    // material cuja posicao ja cobre o ponto — mesmo motivo
    const matCoberto = await novoMaterial(db, { minima: 5, qtd: 10 }); // posicao 10 >= minima 5
    const res2 = await gerar(app, { material_ids: [matCoberto.id] });
    assert.strictEqual(res2.status, 200, JSON.stringify(res2.body));
    assert.deepStrictEqual(res2.body.criadas, []);
    assert.strictEqual(res2.body.puladas.length, 1, JSON.stringify(res2.body));
    assert.strictEqual(res2.body.puladas[0].material_id, matCoberto.id);
    assert.strictEqual(res2.body.puladas[0].motivo, 'SEM_SUGESTAO');
  });

  await test('RN-09: selecao parcial cria SO os pedidos; lista VAZIA nao cria NADA', async () => {
    const matA = await novoMaterial(db, { minima: 5, maxima: 20, qtd: 0 });
    const matB = await novoMaterial(db, { minima: 5, maxima: 20, qtd: 0 });

    const res = await gerar(app, { material_ids: [matA.id] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.criadas.length, 1, JSON.stringify(res.body));
    assert.strictEqual(res.body.criadas[0].material_id, matA.id);

    const sug = await sugestoes(app);
    assert.ok(itemDe(sug, matB.id), 'matB nao selecionado deveria continuar em /sugestoes');
    assert.strictEqual(await contarSolicitacoes(db, matB.id), 0);

    const res2 = await gerar(app, { material_ids: [] });
    assert.strictEqual(res2.status, 200, JSON.stringify(res2.body));
    assert.deepStrictEqual(res2.body.criadas, []);
    assert.deepStrictEqual(res2.body.puladas, []);
    assert.strictEqual(await contarSolicitacoes(db, matB.id), 0, '[] nao deveria disparar o catalogo inteiro');
  });

  await test('RN-09: body invalido recusa 400 literal', async () => {
    const mat = await novoMaterial(db, { minima: 5, qtd: 0 });

    let res = await gerar(app, { material_ids: 'abc' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Lista de materiais inválida');

    res = await gerar(app, { material_ids: [1, 'x'] });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Lista de materiais inválida');

    assert.strictEqual(await contarSolicitacoes(db, mat.id), 0, 'body invalido nao pode ter criado nada');
  });

  await test('RN-08: gate — PRODUCAO e ALMOXARIFE 403, COMPRAS 200', async () => {
    setUser(PRODUCAO);
    let res = await gerar(app, { material_ids: [] });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));

    setUser(ALMOXARIFE);
    res = await gerar(app, { material_ids: [] });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body)); // fora de proposito, D9

    setUser(COMPRAS);
    res = await gerar(app, { material_ids: [] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    setUser(ADMIN);
  });

  await test('[CONTROLE] a quantidade do body e IGNORADA', async () => {
    const mat = await novoMaterial(db, { minima: 5, maxima: 20, qtd: 0, custo: 10 });
    const res = await gerar(app, { material_ids: [mat.id], quantidades: { [mat.id]: 99999 } });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const criada = res.body.criadas.find((c) => c.material_id === mat.id);
    assert.ok(criada, JSON.stringify(res.body));
    assert.strictEqual(criada.quantidade, 20, 'a quantidade do body forjado nao pode vencer o calculo do servidor');
  });

  await test('relatorio solicitacoes-compra traz PENDENTE e VINCULADO', async () => {
    const matPendente = await novoMaterial(db, { minima: 5, maxima: 20, qtd: 0 });
    const resGerar = await gerar(app, { material_ids: [matPendente.id] });
    const solPendenteId = resGerar.body.criadas.find((c) => c.material_id === matPendente.id).solicitacao_id;

    const matVinculado = await novoMaterial(db, { minima: 5, maxima: 20, qtd: 0 });
    const resGerar2 = await gerar(app, { material_ids: [matVinculado.id] });
    const solVinculadaId = resGerar2.body.criadas.find((c) => c.material_id === matVinculado.id).solicitacao_id;
    const resVincular = await request(app)
      .post(`/api/almoxarifado/compras/solicitacoes/${solVinculadaId}/vincular-pedido`)
      .send({ pedido_compra_id: 1 });
    assert.strictEqual(resVincular.status, 200, JSON.stringify(resVincular.body));

    const resRel = await request(app).get('/api/almoxarifado/relatorios/solicitacoes-compra');
    assert.strictEqual(resRel.status, 200, JSON.stringify(resRel.body));
    const ids = resRel.body.map((r) => r.id);
    assert.ok(ids.includes(solPendenteId), 'PENDENTE deveria aparecer no relatorio');
    assert.ok(ids.includes(solVinculadaId), 'VINCULADO deveria aparecer no relatorio');
  });

  await test('residuo de float NAO vira solicitacao de quantidade zero infinita', async () => {
    // Important 1 da revisao (medido): minima 2.14 contra pendencias 1.0 + 1.14 =
    // 2.1399999999999997 — a posicao ficava um fio abaixo do ponto, a sugestao arredondava
    // para 0 e CADA POST gravava mais uma linha de quantidade zero que nunca somava em
    // a_caminho: lixo infinito no relatorio. O fantasma tem de sumir da sugestao.
    const mat = await novoMaterial(db, { minima: 2.14, qtd: 0 });
    await dbRun(db, `INSERT INTO solicitacoes_compra_almoxarifado (material_id, quantidade, status) VALUES (?, 1.0, 'PENDENTE')`, [mat.id]);
    await dbRun(db, `INSERT INTO solicitacoes_compra_almoxarifado (material_id, quantidade, status) VALUES (?, 1.14, 'PENDENTE')`, [mat.id]);

    const resSug = await request(app).get('/api/almoxarifado/reposicao/sugestoes');
    const temFantasma = resSug.body.fornecedores.some((g) => g.itens.some((i) => i.material_id === mat.id));
    assert.strictEqual(temFantasma, false, 'sugestao de quantidade 0 nao pode existir');

    const resGerar = await gerar(app, {});
    assert.ok(!resGerar.body.criadas.some((c) => c.material_id === mat.id), JSON.stringify(resGerar.body));
    const linhas = await dbAll(db, `SELECT quantidade FROM solicitacoes_compra_almoxarifado WHERE material_id = ?`, [mat.id]);
    assert.strictEqual(linhas.length, 2, 'nenhuma linha nova pode ter sido criada');
    assert.ok(!linhas.some((l) => Number(l.quantidade) === 0), JSON.stringify(linhas));
  });

  await test('[relatorio solicitacoes-compra] gate: sem a acao 403, COMPRAS/ALMOXARIFE conforme D9 (revisao final E11, achado 1)', async () => {
    // A Task 2 alargou este relatorio para PENDENTE+VINCULADO — o pipeline de compra inteiro
    // ficava visivel numa rota sem gate. Mesmo remedio da 10b (inventario-divergencias).
    setUser(PRODUCAO);
    let res = await request(app).get('/api/almoxarifado/relatorios/solicitacoes-compra');
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.strictEqual(res.body.acao, 'gerenciar_reposicao', JSON.stringify(res.body));

    setUser(ALMOXARIFE);
    res = await request(app).get('/api/almoxarifado/relatorios/solicitacoes-compra');
    assert.strictEqual(res.status, 403, JSON.stringify(res.body)); // fora de proposito, D9

    setUser(COMPRAS);
    res = await request(app).get('/api/almoxarifado/relatorios/solicitacoes-compra');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    setUser(ADMIN);
  });

  await test('RN-06 (revisao final E11, achado 2): riscos_parada conta TODOS os criticos zerados, sugeridos ou nao', async () => {
    const mat = await novoMaterial(db, { minima: 5, qtd: 0 });
    await dbRun(db, `UPDATE materiais_almoxarifado SET material_critico = 1 WHERE id = ?`, [mat.id]);

    const antes = await sugestoes(app);
    const resumoAntes = antes.body.resumo.riscos_parada;
    const itemAntes = itemDe(antes, mat.id);
    assert.ok(itemAntes, 'deveria estar sugerido antes de gerar');
    assert.strictEqual(itemAntes.risco_parada, true, JSON.stringify(itemAntes));

    // Gerar a solicitacao: a_caminho passa a cobrir o ponto e o item SOME da lista de
    // sugestoes — mas o material continua FISICAMENTE parado (disponivel ainda 0, solicitacao
    // a caminho nao segura producao, mesma razao do RN-06 do flag por item). Clicar em "Gerar"
    // nao pode zerar o risco.
    const resGerar = await gerar(app, { material_ids: [mat.id] });
    assert.strictEqual(resGerar.status, 200, JSON.stringify(resGerar.body));

    const depois = await sugestoes(app);
    assert.strictEqual(itemDe(depois, mat.id), undefined, 'material deveria ter sumido da LISTA de sugestoes');
    assert.strictEqual(depois.body.resumo.riscos_parada, resumoAntes,
      'clicar em Gerar zerou o risco de parada enquanto a fabrica continua parada: ' + JSON.stringify(depois.body.resumo));
  });

  await test('piso absoluto (revisao final E11, achado 6): residuo simbolico 0.0001 tambem e fantasma', async () => {
    // O guard antigo "<=0" so pegava residuo que arredondava para 0 EXATO. Uma pendencia um
    // fio abaixo da minima (2.14 vs 2.1399, sem o 999... do teste anterior) arredonda para
    // 0.0001 — POSITIVO, passava pelo "<=0" e ainda gravava a solicitacao fantasma. Piso
    // ABSOLUTO (0.001), nao relativo: um piso relativo (% do ponto) esconderia falta real em
    // material de ponto gigante.
    const mat = await novoMaterial(db, { minima: 2.14, qtd: 0 });
    await dbRun(db, `INSERT INTO solicitacoes_compra_almoxarifado (material_id, quantidade, status) VALUES (?, 2.1399, 'PENDENTE')`, [mat.id]);

    const resSug = await request(app).get('/api/almoxarifado/reposicao/sugestoes');
    const temFantasma = resSug.body.fornecedores.some((g) => g.itens.some((i) => i.material_id === mat.id));
    assert.strictEqual(temFantasma, false, 'sugestao de quantidade 0.0001 nao pode existir');

    const resGerar = await gerar(app, {});
    assert.ok(!resGerar.body.criadas.some((c) => c.material_id === mat.id), JSON.stringify(resGerar.body));
    const linhas = await dbAll(db, `SELECT quantidade FROM solicitacoes_compra_almoxarifado WHERE material_id = ?`, [mat.id]);
    assert.strictEqual(linhas.length, 1, 'nenhuma linha nova pode ter sido criada');
  });

  await test('ids repetidos no body NAO multiplicam a quantidade', async () => {
    // Important 2 da revisao (medido): POST [id,id,id] criava 3 solicitacoes de 20 = 60
    // unidades pedidas onde o material precisava de 20.
    const mat = await novoMaterial(db, { minima: 5, maxima: 20, qtd: 0 });
    const res = await gerar(app, { material_ids: [mat.id, mat.id, mat.id] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const criadasDoMat = res.body.criadas.filter((c) => c.material_id === mat.id);
    assert.strictEqual(criadasDoMat.length, 1, JSON.stringify(res.body));
    const linhas = await dbAll(db, `SELECT quantidade FROM solicitacoes_compra_almoxarifado WHERE material_id = ?`, [mat.id]);
    assert.strictEqual(linhas.length, 1, JSON.stringify(linhas));
    assert.strictEqual(Number(linhas[0].quantidade), 20, JSON.stringify(linhas));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
