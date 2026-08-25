/**
 * Etapa 14, Task 5 — teste-jornada de integracao cruzando as Tasks 1-3 (ciclo de vida da
 * solicitacao, contexto do comprador, relatorio custo-por-projeto). As tres ja tem cobertura
 * unitaria/isolada propria (solicitacaoCicloVida/compraContextoMaterial/relatorioCustoProjeto
 * .api.test.js, 15+14+10 testes) — este arquivo NAO repete aquilo. O objetivo aqui e provar que
 * as pecas se COMPOEM como UMA jornada continua pela API HTTP real, com o MOTOR REAL de estoque
 * (stockService/receiptService) escrevendo o livro:
 *
 * material com minimo e falta -> calcularSugestoes mostra -> gerar solicitacoes pela ROTA REAL
 * (POST /reposicao/gerar-solicitacoes) -> vincular ao pedido real (POST .../vincular-pedido,
 * agora COMPRAS pode — D9) -> material SOME da sugestao -> receber pelo workflow REAL ate
 * processarNota -> solicitacao RECEBIDA -> material com falta VOLTA a sugestao -> cancelar
 * OUTRA solicitacao (rota real, com justificativa) -> tambem volta -> relatorio
 * custo-por-projeto reflete as saidas com projeto da jornada (saida semeada pelo motor real,
 * custo lido do proprio custo_medio que a entrada da jornada gravou — nao fixture) ->
 * contexto-material mostra o ultimo custo da NF recebida NA jornada (o par mov x item real) e
 * as solicitacoes abertas coerentes com os estados finais (RECEBIDA/CANCELADA somem).
 *
 * MOLDE DO HARNESS (Global Constraints da Etapa 14, Fase 2 C5 — pedidos_compra NAO existe no
 * testApp): stub ENDURECIDO copiado de compraContextoMaterial.api.test.js (fornecedor_id
 * INTEGER NOT NULL, status TEXT DEFAULT 'pendente' — pedido N-2 da revisao da Task 1).
 * itens_pedido_compra JA vem do initSchema. `projetos` e tabela CORE, fora do initSchema do
 * almoxarifado — stub molde clientePosicaoTipos.api.test.js:99 (o JOIN so precisa de id/nome),
 * copiado de relatorioCustoProjeto.api.test.js.
 *
 * Caminho MINIMO real ate PROCESSADO (Global Constraints): criarRecebimento({tipo_recebimento:
 * 'PEDIDO_COMPRA', pedido_compra_id}) -> avancarWorkflow('encaminhar_compras') ->
 * avancarWorkflow('finalizar_compras') -> salvarDadosFiscal({nota_fiscal, data_emissao_nf,
 * data_entrada_nf, valor_total_nota}) -> processarNota.
 *
 * Executar: cd server && node tests/api/integracaoComprasJornada.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const COMPRAS = { id: 5, nome: 'Comprador', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'compras@test.com' };

function itemDe(res, materialId) {
  for (const g of res.body.fornecedores) {
    const it = g.itens.find((i) => i.material_id === materialId);
    if (it) return it;
  }
  return undefined;
}
function sugestoes(app) { return request(app).get('/api/almoxarifado/reposicao/sugestoes'); }
function gerar(app, body) { return request(app).post('/api/almoxarifado/reposicao/gerar-solicitacoes').send(body || {}); }
function vincular(app, solId, pedidoId) {
  return request(app).post(`/api/almoxarifado/compras/solicitacoes/${solId}/vincular-pedido`).send({ pedido_compra_id: pedidoId });
}
function cancelar(app, solId, motivo) {
  return request(app).post(`/api/almoxarifado/compras/solicitacoes/${solId}/cancelar`).send({ motivo });
}
function contexto(app, materialId) {
  return request(app).get(`/api/almoxarifado/compras/contexto-material/${materialId}`);
}
function relatorioCustoProjeto(app, qs = '') {
  return request(app).get(`/api/almoxarifado/relatorios/custo-por-projeto${qs}`);
}

// MOLDE DO HARNESS (Global Constraints): caminho MINIMO real ate PROCESSADO.
async function caminhoAteProcessado(db, user, pedidoId, { valorTotalNota } = {}) {
  const rec = await receiptService.criarRecebimento(db, user,
    { tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedidoId });
  await receiptService.avancarWorkflow(db, user, rec.id, 'encaminhar_compras');
  await receiptService.avancarWorkflow(db, user, rec.id, 'finalizar_compras');
  await receiptService.salvarDadosFiscal(db, user, rec.id, {
    nota_fiscal: `NF-JOR14-${rec.id}`, data_emissao_nf: '2026-08-01', data_entrada_nf: '2026-08-02',
    valor_total_nota: valorTotalNota, fornecedor_nome: 'Fornecedor Jornada Etapa 14',
  });
  const resultado = await receiptService.processarNota(db, user, rec.id);
  return { recId: rec.id, resultado };
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // MOLDE DO HARNESS ENDURECIDO (copiado de compraContextoMaterial.api.test.js — N-2 da revisao
  // da Task 1): fornecedor_id NOT NULL, status com default 'pendente'.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS pedidos_compra (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE,
    fornecedor_id INTEGER NOT NULL,
    valor_total REAL DEFAULT 0,
    status TEXT DEFAULT 'pendente',
    data_pedido DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // MOLDE clientePosicaoTipos.api.test.js:99 (copiado de relatorioCustoProjeto.api.test.js): o
  // JOIN do relatorio so precisa de id/nome.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS projetos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)`);
  const fornRow = await dbRun(db, `INSERT INTO fornecedores (razao_social, nome_fantasia, cnpj)
    VALUES ('Fornecedor Jornada Etapa 14', 'Fornecedor Jornada', '11111111000111')`);
  const fornecedorId = fornRow.lastID;

  await test('jornada: sugestao -> gerar -> vincular -> some -> receber -> RECEBIDA -> volta '
    + '-> cancelar outra -> volta -> relatorio custo-por-projeto -> contexto-material', async () => {
    // ── Passo 1: dois materiais com minimo e falta (quantidade_atual 0), via CADASTRO. ──
    setUser(ADMIN);
    const insM1 = await dbRun(db, `INSERT INTO materiais_almoxarifado
        (codigo, nome, unidade, quantidade_atual, ativo, quantidade_minima, quantidade_maxima,
         ponto_reposicao, lote_economico, prazo_reposicao_dias, controle_lote,
         custo_unitario, custo_medio)
       VALUES ('JOR14-M1','Material Jornada 14 M1','UN',0,1,20,20,0,0,0,0,0,0)`);
    const m1Id = insM1.lastID;
    const insM2 = await dbRun(db, `INSERT INTO materiais_almoxarifado
        (codigo, nome, unidade, quantidade_atual, ativo, quantidade_minima, quantidade_maxima,
         ponto_reposicao, lote_economico, prazo_reposicao_dias, controle_lote,
         custo_unitario, custo_medio)
       VALUES ('JOR14-M2','Material Jornada 14 M2','UN',0,1,8,8,0,0,0,0,0,0)`);
    const m2Id = insM2.lastID;

    setUser(COMPRAS);
    let sug = await sugestoes(app);
    assert.strictEqual(sug.status, 200, JSON.stringify(sug.body));
    let itemM1 = itemDe(sug, m1Id);
    let itemM2 = itemDe(sug, m2Id);
    assert.ok(itemM1, 'M1 deveria aparecer na sugestao (quantidade_atual 0 < minima 20)');
    assert.strictEqual(itemM1.origem_ponto, 'MINIMO', JSON.stringify(itemM1));
    assert.strictEqual(itemM1.quantidade_sugerida, 20, JSON.stringify(itemM1));
    assert.ok(itemM2, 'M2 deveria aparecer na sugestao (quantidade_atual 0 < minima 8)');
    assert.strictEqual(itemM2.quantidade_sugerida, 8, JSON.stringify(itemM2));

    // ── Passo 2: gerar solicitacoes PELA ROTA REAL (RN-09) — os dois de uma vez. ──
    const resGerar = await gerar(app, {});
    assert.strictEqual(resGerar.status, 200, JSON.stringify(resGerar.body));
    const criadaM1 = resGerar.body.criadas.find((c) => c.material_id === m1Id);
    const criadaM2 = resGerar.body.criadas.find((c) => c.material_id === m2Id);
    assert.ok(criadaM1, JSON.stringify(resGerar.body));
    assert.ok(criadaM2, JSON.stringify(resGerar.body));
    assert.strictEqual(criadaM1.quantidade, 20, JSON.stringify(criadaM1));
    assert.strictEqual(criadaM2.quantidade, 8, JSON.stringify(criadaM2));
    const solA = criadaM1.solicitacao_id; // vai ser VINCULADA e depois RECEBIDA
    const solB = criadaM2.solicitacao_id; // vai ser CANCELADA

    // ── Passo 3: material SOME da sugestao (a_caminho PENDENTE cobre o ponto, RN-03). ──
    sug = await sugestoes(app);
    assert.strictEqual(itemDe(sug, m1Id), undefined, 'M1 deveria ter sumido com a solicitacao PENDENTE a caminho');
    assert.strictEqual(itemDe(sug, m2Id), undefined, 'M2 deveria ter sumido com a solicitacao PENDENTE a caminho');

    // ── Passo 4: vincular SOL_A a um pedido REAL pela rota REAL — COMPRAS pode (D9, Etapa 14 ──
    // Task 1). O pedido real entrega SO 5 de 20 (a compra parcial e o cenario que prova a volta
    // a sugestao depois de RECEBIDA).
    const pedidoId = (await dbRun(db, `INSERT INTO pedidos_compra
        (numero, fornecedor_id, valor_total, status, data_pedido) VALUES (?,?,?,?,?)`,
      ['PC-JOR14-1', fornecedorId, 60, 'ABERTO', '2026-08-01'])).lastID;
    await dbRun(db, `INSERT INTO itens_pedido_compra (pedido_id, material_id, quantidade, valor_unitario)
      VALUES (?,?,?,?)`, [pedidoId, m1Id, 5, 12]);

    const resVincular = await vincular(app, solA, pedidoId);
    assert.strictEqual(resVincular.status, 200, JSON.stringify(resVincular.body));
    const rowVinculada = await dbGet(db,
      'SELECT status, pedido_compra_id FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solA]);
    assert.strictEqual(rowVinculada.status, 'VINCULADO', JSON.stringify(rowVinculada));
    assert.strictEqual(rowVinculada.pedido_compra_id, pedidoId, JSON.stringify(rowVinculada));

    // M1 continua fora da sugestao (VINCULADO tambem conta em a_caminho, RN-03); M2 continua
    // fora tambem (ainda PENDENTE, intocado).
    sug = await sugestoes(app);
    assert.strictEqual(itemDe(sug, m1Id), undefined, 'M1 continua fora — VINCULADO tambem segura a posicao');
    assert.strictEqual(itemDe(sug, m2Id), undefined, 'M2 continua fora — ainda PENDENTE');

    // ── Passo 5: receber pelo WORKFLOW REAL ate processarNota. ──
    setUser(ADMIN);
    const { resultado } = await caminhoAteProcessado(db, ADMIN, pedidoId, { valorTotalNota: 60 });
    assert.strictEqual(resultado.status, 'PROCESSADO', JSON.stringify(resultado));

    const m1AposEntrada = await dbGet(db,
      'SELECT quantidade_atual, custo_medio, custo_unitario FROM materiais_almoxarifado WHERE id = ?', [m1Id]);
    assert.strictEqual(Number(m1AposEntrada.quantidade_atual), 5, JSON.stringify(m1AposEntrada));
    assert.strictEqual(Number(m1AposEntrada.custo_medio), 12, JSON.stringify(m1AposEntrada));

    // ── Passo 6 (ELO CRITICO — a sabotagem do gancho neutralizado derruba ESTE assert): a ──
    // solicitacao VINCULADA fecha SOZINHA, automaticamente, RECEBIDA.
    const rowRecebida = await dbGet(db,
      'SELECT status, recebida_em FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solA]);
    assert.strictEqual(rowRecebida.status, 'RECEBIDA', JSON.stringify(rowRecebida));
    assert.ok(rowRecebida.recebida_em, 'recebida_em deveria estar preenchido');

    // ── Passo 7: material com falta VOLTA a sugestao apos RECEBIDA — a compra so entregou 5 ──
    // dos 20 que faltavam; a_caminho zera (SOL_A nao esta mais PENDENTE/VINCULADO), posicao vira
    // disponivel puro (5), continua abaixo do ponto (20).
    setUser(COMPRAS);
    sug = await sugestoes(app);
    itemM1 = itemDe(sug, m1Id);
    assert.ok(itemM1, 'M1 com falta residual deveria voltar a sugestao apos RECEBIDA');
    assert.strictEqual(itemM1.disponivel, 5, JSON.stringify(itemM1));
    assert.strictEqual(itemM1.a_caminho, 0, JSON.stringify(itemM1));
    assert.strictEqual(itemM1.quantidade_sugerida, 15, JSON.stringify(itemM1)); // alvo 20 - posicao 5

    // ── Passo 8: cancelar OUTRA solicitacao (SOL_B, M2) pela rota REAL, com justificativa. ──
    const resCancelar = await cancelar(app, solB, 'Consumo reavaliado, nao precisa mais deste lote');
    assert.strictEqual(resCancelar.status, 200, JSON.stringify(resCancelar.body));
    const rowCancelada = await dbGet(db,
      'SELECT status, cancelada_em, cancelamento_motivo FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solB]);
    assert.strictEqual(rowCancelada.status, 'CANCELADA', JSON.stringify(rowCancelada));
    assert.ok(rowCancelada.cancelada_em, 'cancelada_em deveria estar preenchido');

    // ── Passo 9: M2 TAMBEM volta a sugestao apos CANCELADA (mesma razao, RN-03). ──
    sug = await sugestoes(app);
    itemM2 = itemDe(sug, m2Id);
    assert.ok(itemM2, 'M2 deveria voltar a sugestao apos CANCELADA');
    assert.strictEqual(itemM2.disponivel, 0, JSON.stringify(itemM2));
    assert.strictEqual(itemM2.quantidade_sugerida, 8, JSON.stringify(itemM2));

    // ── Passo 10: relatorio custo-por-projeto reflete uma SAIDA da jornada com projeto, pelo ──
    // MOTOR REAL — custo lido do custo_medio que a PROPRIA entrada da jornada gravou (12), nao
    // de fixture: prova que o relatorio (Task 3) enxerga o livro que as Tasks 1/2 escreveram.
    const projetoId = (await dbRun(db, "INSERT INTO projetos (nome) VALUES ('Projeto Jornada Etapa 14')")).lastID;
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: m1Id, tipo: 'SAIDA', quantidade: 2, projeto_id: projetoId,
      justificativa: 'jornada etapa 14: consumo no projeto',
    });

    const resRelatorio = await relatorioCustoProjeto(app);
    assert.strictEqual(resRelatorio.status, 200, JSON.stringify(resRelatorio.body));
    const linhaProjeto = resRelatorio.body.find((r) => r.projeto_id === projetoId);
    assert.ok(linhaProjeto, `projeto da jornada deveria aparecer: ${JSON.stringify(resRelatorio.body)}`);
    assert.strictEqual(linhaProjeto.projeto_nome, 'Projeto Jornada Etapa 14', JSON.stringify(linhaProjeto));
    assert.strictEqual(linhaProjeto.consumido, 24, JSON.stringify(linhaProjeto)); // 2 * custo_medio(12)
    assert.strictEqual(linhaProjeto.devolvido, 0, JSON.stringify(linhaProjeto));
    assert.strictEqual(linhaProjeto.liquido, 24, JSON.stringify(linhaProjeto));

    // ── Passo 11: contexto-material de M1 mostra o ultimo custo da NF RECEBIDA NA JORNADA (o ──
    // par mov x item real, nao fixture) e nenhuma solicitacao aberta (SOL_A e RECEBIDA, terminal).
    const resContextoM1 = await contexto(app, m1Id);
    assert.strictEqual(resContextoM1.status, 200, JSON.stringify(resContextoM1.body));
    assert.ok(resContextoM1.body.ultimo_custo_entrada, 'ultimo_custo_entrada nao pode ser null');
    assert.strictEqual(resContextoM1.body.ultimo_custo_entrada.valor, 12, JSON.stringify(resContextoM1.body.ultimo_custo_entrada));
    assert.ok(resContextoM1.body.ultimo_custo_entrada.data, 'data deveria vir preenchida');
    assert.deepStrictEqual(resContextoM1.body.solicitacoes_abertas, [],
      `SOL_A esta RECEBIDA (terminal) — nao pode aparecer em solicitacoes_abertas: ${JSON.stringify(resContextoM1.body.solicitacoes_abertas)}`);
    assert.strictEqual(resContextoM1.body.disponivel, 3, JSON.stringify(resContextoM1.body)); // 5 - 2 (saida do projeto)

    // ── Passo 12: contexto-material de M2 tambem sem solicitacoes abertas (SOL_B e CANCELADA). ──
    const resContextoM2 = await contexto(app, m2Id);
    assert.strictEqual(resContextoM2.status, 200, JSON.stringify(resContextoM2.body));
    assert.deepStrictEqual(resContextoM2.body.solicitacoes_abertas, [],
      `SOL_B esta CANCELADA (terminal) — nao pode aparecer em solicitacoes_abertas: ${JSON.stringify(resContextoM2.body.solicitacoes_abertas)}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
