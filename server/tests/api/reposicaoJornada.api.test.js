/**
 * Etapa 11, Task 4 — teste-jornada de integracao cruzando Task 1 (motor de sugestao,
 * RN-01..RN-06/RN-08), Task 2 (POST /gerar-solicitacoes RN-09, GET /estoque-parado RN-07) e a
 * rota legada de vinculo de pedido (D10; gate atualizado para `gerenciar_reposicao` na Etapa 14,
 * Task 1, D9 — antes era `configurar`/ADMIN-only).
 *
 * Task 1 e Task 2 ja tem cobertura unitaria/isolada propria (reposicaoSugestao/
 * reposicaoGerarSolicitacoes/reposicaoEstoqueParado .api.test.js) — este arquivo NAO repete
 * aquilo. O objetivo aqui e provar que as pecas se COMPOEM como UMA jornada continua pela API
 * HTTP real, com o MOTOR REAL de estoque (stockService.registrarMovimentacao) escrevendo o
 * livro: consumir no livro -> sugestao aparece com a origem/quantidade certas -> zerar dispara
 * risco de parada -> gerar solicitacao -> material some da sugestao (a_caminho cobre o ponto) ->
 * POST de novo nao duplica -> id explicito vira SEM_SUGESTAO -> vinculo pelo caminho legado
 * mantem o material fora (VINCULADO tambem conta) e aparece no relatorio -> estoque parado
 * detecta sem_consumo/obsoleto num material backdateado -> gate fecha para quem nao tem a acao.
 *
 * M1 critico e com custo_unitario=10 DE PROPOSITO (mesma razao de inventarioEscopoJornada.api.
 * test.js): sem custo e sem material_critico, risco_parada e valor_estimado nao provariam nada.
 *
 * Executar: cd server && node tests/api/reposicaoJornada.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };
const COMPRAS = { id: 5, nome: 'Comprador', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'compras@test.com' };
const PRODUCAO = { id: 9, nome: 'Producao', role: 'usuario', email: 'producao@test.com' };

async function sugestoes(app) { return request(app).get('/api/almoxarifado/reposicao/sugestoes'); }
async function gerar(app, body) { return request(app).post('/api/almoxarifado/reposicao/gerar-solicitacoes').send(body || {}); }
async function estoqueParado(app, query) { return request(app).get('/api/almoxarifado/reposicao/estoque-parado').query(query || {}); }
function itemDe(res, materialId) {
  for (const g of res.body.fornecedores) {
    const it = g.itens.find((i) => i.material_id === materialId);
    if (it) return it;
  }
  return undefined;
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // Etapa 14, Task 1 (RN-01b): vincular-pedido passou a validar que o pedido existe em
  // `pedidos_compra` (antes gravava pedido fantasma sem checar). O Passo 8 abaixo vincula a
  // `pedido_compra_id: 1` — precisa da tabela E da linha.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS pedidos_compra (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT UNIQUE, fornecedor_id INTEGER NOT NULL,
    valor_total REAL DEFAULT 0, status TEXT DEFAULT 'pendente', data_pedido DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await dbRun(db, `INSERT INTO fornecedores (razao_social, nome_fantasia, cnpj) VALUES ('Fornecedor Stub', 'Fornecedor Stub', '11111111111111')`);
  await dbRun(db, `INSERT INTO pedidos_compra (id, numero, fornecedor_id, status, data_pedido) VALUES (1, 'PC-JOR-1', 1, 'ABERTO', '2026-08-01')`);

  await test('jornada: motor real -> sugestao -> risco -> gerar -> some -> vincula -> estoque parado -> gate', async () => {
    // ── Passo 1: seed — fornecedor + M1 (minima 5, maxima 20, custo 10, critico) via CADASTRO, ──
    // depois ENTRADA de 20 pelo MOTOR REAL (nao INSERT) — a jornada prova a composicao com o
    // livro, nao so a leitura de colunas do cadastro.
    setUser(ADMIN);
    const forn = await dbRun(db, `INSERT INTO fornecedores (razao_social) VALUES ('Aços Jornada')`);
    const insM1 = await dbRun(db, `INSERT INTO materiais_almoxarifado
        (codigo, nome, unidade, quantidade_atual, ativo, quantidade_minima, quantidade_maxima,
         ponto_reposicao, lote_economico, prazo_reposicao_dias, fornecedor_id,
         proprietario_cliente_id, custo_unitario, material_critico)
       VALUES ('JOR11-M1','Material Jornada M1','UN',0,1,5,20,0,0,0,?,NULL,10,1)`, [forn.lastID]);
    const m1Id = insM1.lastID;

    await stockService.registrarMovimentacao(db, ADMIN,
      { material_id: m1Id, tipo: 'ENTRADA_COMPRA', quantidade: 20, justificativa: 'jornada: entrada inicial' });
    const m1AposEntrada = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [m1Id]);
    assert.strictEqual(Number(m1AposEntrada.quantidade_atual), 20, JSON.stringify(m1AposEntrada));

    // ── Passo 2: consumir pelo motor — SAIDA de 18 (fica 2, disponivel 2 < minima 5). ──
    await stockService.registrarMovimentacao(db, ADMIN,
      { material_id: m1Id, tipo: 'SAIDA', quantidade: 18, justificativa: 'jornada: consumo 1' });

    // ── Passo 3: GET /sugestoes (COMPRAS) — M1 aparece, MINIMO e o chao (sem ponto cadastrado ──
    // nem prazo preenchido), quantidade_sugerida = alvo 20 - posicao 2, risco_parada false
    // (disponivel 2 > 0).
    setUser(COMPRAS);
    let res = await sugestoes(app);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    let item = itemDe(res, m1Id);
    assert.ok(item, 'M1 deveria estar na sugestao (disponivel 2 < minima 5)');
    assert.strictEqual(item.origem_ponto, 'MINIMO', JSON.stringify(item));
    assert.strictEqual(item.ponto_efetivo, 5, JSON.stringify(item));
    assert.strictEqual(item.disponivel, 2, JSON.stringify(item));
    assert.strictEqual(item.a_caminho, 0, JSON.stringify(item));
    assert.strictEqual(item.posicao, 2, JSON.stringify(item));
    assert.strictEqual(item.quantidade_sugerida, 18, JSON.stringify(item));
    assert.strictEqual(item.risco_parada, false, JSON.stringify(item));

    // ── Passo 4: SAIDA de 2 (zera) — sugestao recalcula: risco_parada true, resumo conta 1. ──
    // Banco isolado deste arquivo (:memory: por createTestApp) e so M1 e critico ate aqui —
    // resumo pode ser cravado por igualdade estrita.
    setUser(ADMIN);
    await stockService.registrarMovimentacao(db, ADMIN,
      { material_id: m1Id, tipo: 'SAIDA', quantidade: 2, justificativa: 'jornada: consumo 2 (zera)' });

    setUser(COMPRAS);
    res = await sugestoes(app);
    item = itemDe(res, m1Id);
    assert.ok(item, 'M1 deveria continuar sugerido apos zerar');
    assert.strictEqual(item.disponivel, 0, JSON.stringify(item));
    assert.strictEqual(item.quantidade_sugerida, 20, JSON.stringify(item)); // alvo 20 - posicao 0
    assert.strictEqual(item.risco_parada, true, JSON.stringify(item));
    assert.strictEqual(res.body.resumo.materiais_sugeridos, 1, JSON.stringify(res.body.resumo));
    assert.strictEqual(res.body.resumo.riscos_parada, 1, JSON.stringify(res.body.resumo));

    // ── Passo 5: POST /gerar-solicitacoes {} (COMPRAS) — 1 criada, quantidade 20; auditoria ──
    // gravada como OBJETO (JSON.parse pega escape em dobro se algum dia virar string).
    const resGerar = await gerar(app, {});
    assert.strictEqual(resGerar.status, 200, JSON.stringify(resGerar.body));
    const criada = resGerar.body.criadas.find((c) => c.material_id === m1Id);
    assert.ok(criada, JSON.stringify(resGerar.body));
    assert.strictEqual(criada.quantidade, 20, JSON.stringify(criada));
    const solicitacaoId = criada.solicitacao_id;

    const auditRow = await dbGet(db,
      `SELECT dados_novos FROM auditoria_log_almoxarifado WHERE entidade = 'solicitacao_compra' AND entidade_id = ?`,
      [solicitacaoId]);
    assert.ok(auditRow, 'deveria ter auditado a criacao da solicitacao');
    const dadosNovos = JSON.parse(auditRow.dados_novos);
    assert.strictEqual(dadosNovos.quantidade, 20, JSON.stringify(dadosNovos));
    assert.strictEqual(dadosNovos.material_id, m1Id, JSON.stringify(dadosNovos));

    // ── Passo 6: GET /sugestoes de novo — M1 SUMIU (a_caminho 20 >= ponto 5; posicao = ──
    // disponivel 0 + a_caminho 20 = 20). ESTE e o passo que a sabotagem do controle positivo
    // (trocar `disponivel + a_caminho` por `disponivel`) derruba: sem somar a_caminho, a
    // posicao voltaria a 0 e M1 continuaria aparecendo.
    res = await sugestoes(app);
    assert.strictEqual(itemDe(res, m1Id), undefined, 'M1 deveria ter sumido — a_caminho 20 cobre o ponto 5');

    // ── Passo 7: POST {} de novo — resposta vazia-legivel (M1 coberto pela pendencia nao e ──
    // sugerido, comportamento congelado pela Fase 2); POST com o id explicito vira SEM_SUGESTAO.
    // COUNT de solicitacoes de M1 continua 1 (nenhuma das duas chamadas cria linha nova).
    const resGerarDeNovo = await gerar(app, {});
    assert.strictEqual(resGerarDeNovo.status, 200, JSON.stringify(resGerarDeNovo.body));
    assert.deepStrictEqual(resGerarDeNovo.body, { criadas: [], puladas: [] }, JSON.stringify(resGerarDeNovo.body));

    const resGerarExplicito = await gerar(app, { material_ids: [m1Id] });
    assert.strictEqual(resGerarExplicito.status, 200, JSON.stringify(resGerarExplicito.body));
    assert.deepStrictEqual(resGerarExplicito.body.criadas, [], JSON.stringify(resGerarExplicito.body));
    assert.strictEqual(resGerarExplicito.body.puladas.length, 1, JSON.stringify(resGerarExplicito.body));
    assert.strictEqual(resGerarExplicito.body.puladas[0].material_id, m1Id, JSON.stringify(resGerarExplicito.body));
    assert.strictEqual(resGerarExplicito.body.puladas[0].motivo, 'SEM_SUGESTAO', JSON.stringify(resGerarExplicito.body));

    const contagemSolicitacoes = await dbGet(db,
      'SELECT COUNT(*) as c FROM solicitacoes_compra_almoxarifado WHERE material_id = ?', [m1Id]);
    assert.strictEqual(contagemSolicitacoes.c, 1, 'nenhum dos dois POSTs do passo 7 deveria ter criado linha nova');

    // ── Passo 8: vincular pela rota LEGADA (D10; gate `gerenciar_reposicao` desde a Etapa 14,
    // Task 1/D9 — ADMIN continua permitido) — status ──
    // VINCULADO; a sugestao continua sem M1 (VINCULADO tambem conta em a_caminho, RN-03); o
    // relatorio de solicitacoes-compra mostra a linha VINCULADA (Fase 2: era so PENDENTE).
    setUser(ADMIN);
    const resVincular = await request(app)
      .post(`/api/almoxarifado/compras/solicitacoes/${solicitacaoId}/vincular-pedido`)
      .send({ pedido_compra_id: 1 });
    assert.strictEqual(resVincular.status, 200, JSON.stringify(resVincular.body));
    const solAposVinculo = await dbGet(db,
      'SELECT status, pedido_compra_id FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solicitacaoId]);
    assert.strictEqual(solAposVinculo.status, 'VINCULADO', JSON.stringify(solAposVinculo));
    assert.strictEqual(solAposVinculo.pedido_compra_id, 1, JSON.stringify(solAposVinculo));

    setUser(COMPRAS);
    res = await sugestoes(app);
    assert.strictEqual(itemDe(res, m1Id), undefined, 'M1 continua fora — VINCULADO tambem segura a posicao');

    const resRelatorio = await request(app).get('/api/almoxarifado/relatorios/solicitacoes-compra');
    assert.strictEqual(resRelatorio.status, 200, JSON.stringify(resRelatorio.body).slice(0, 200));
    const linhaRelatorio = resRelatorio.body.find((r) => r.id === solicitacaoId);
    assert.ok(linhaRelatorio, 'a solicitacao VINCULADA deveria aparecer no relatorio');
    assert.strictEqual(linhaRelatorio.status, 'VINCULADO', JSON.stringify(linhaRelatorio));

    // ── Passo 9: M2 parado — cadastro com custo, ENTRADA de 30 pelo motor real, depois ──
    // BACKDATE da movimentacao (so em teste — created_at do motor e sempre NOW) para simular
    // "entrou ha 200 dias e nunca mais saiu". sem_consumo vem do ultima_saida NULO (M2 nunca
    // teve SAIDA); obsoleto exige tambem a ultima_entrada velha — dai o backdate.
    const insM2 = await dbRun(db, `INSERT INTO materiais_almoxarifado
        (codigo, nome, unidade, quantidade_atual, ativo, quantidade_minima, quantidade_maxima,
         ponto_reposicao, lote_economico, prazo_reposicao_dias, fornecedor_id,
         proprietario_cliente_id, custo_unitario, material_critico)
       VALUES ('JOR11-M2','Material Jornada M2 (parado)','UN',0,1,0,0,0,0,0,NULL,NULL,5,0)`);
    const m2Id = insM2.lastID;

    await stockService.registrarMovimentacao(db, ADMIN,
      { material_id: m2Id, tipo: 'ENTRADA_COMPRA', quantidade: 30, justificativa: 'jornada: M2 entrada unica' });
    await dbRun(db,
      `UPDATE movimentacoes_almoxarifado SET created_at = datetime('now', '-200 days') WHERE material_id = ?`,
      [m2Id]);

    res = await estoqueParado(app);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.dias_sem_consumo, 180, JSON.stringify(res.body.dias_sem_consumo));
    const itemM2 = res.body.itens.find((i) => i.material_id === m2Id);
    assert.ok(itemM2, 'M2 deveria aparecer no estoque parado');
    assert.strictEqual(itemM2.sem_consumo, true, JSON.stringify(itemM2));
    assert.strictEqual(itemM2.obsoleto, true, JSON.stringify(itemM2));
    assert.strictEqual(itemM2.excesso, false, JSON.stringify(itemM2)); // maxima 0 nunca gera excesso
    assert.strictEqual(itemM2.valor_parado, 150, JSON.stringify(itemM2)); // 30 x custo 5
    // M1 tem quantidade_atual 0 neste ponto (zerou no passo 4) — o filtro `quantidade_atual > 0`
    // do estoque parado o exclui, entao M2 e o UNICO material na lista: resumo cravado.
    assert.strictEqual(res.body.resumo.excesso, 0, JSON.stringify(res.body.resumo));
    assert.strictEqual(res.body.resumo.sem_consumo, 1, JSON.stringify(res.body.resumo));
    assert.strictEqual(res.body.resumo.obsoleto, 1, JSON.stringify(res.body.resumo));
    assert.strictEqual(res.body.resumo.valor_parado_total, 150, JSON.stringify(res.body.resumo));

    // ── Passo 10: gate — PRODUCAO (sem perfil) e ALMOXARIFE (fora de proposito, D9) tomam 403 ──
    // nas TRES rotas novas; COMPRAS continua 200.
    setUser(PRODUCAO);
    assert.strictEqual((await sugestoes(app)).status, 403);
    assert.strictEqual((await gerar(app, {})).status, 403);
    assert.strictEqual((await estoqueParado(app)).status, 403);

    setUser(ALMOXARIFE);
    assert.strictEqual((await sugestoes(app)).status, 403);
    assert.strictEqual((await gerar(app, {})).status, 403);
    assert.strictEqual((await estoqueParado(app)).status, 403);

    setUser(COMPRAS);
    assert.strictEqual((await sugestoes(app)).status, 200);
    assert.strictEqual((await gerar(app, {})).status, 200);
    assert.strictEqual((await estoqueParado(app)).status, 200);

    setUser(ADMIN);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
