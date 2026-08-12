/**
 * Etapa 8, Task 2 — a INVARIANTE da etapa (decisao 3 do design).
 *
 * Um material de cliente e um material proprio EQUIVALENTES (mesma quantidade, mesmo minimo,
 * mesmo custo, mesma categoria) sao criados lado a lado. Toda leitura de estoque proprio
 * auditada na Task 1 (classe A) tem de mostrar o proprio e esconder o do cliente; as leituras
 * de classe C tem de mostrar os DOIS.
 *
 * As duas metades da asserção de classe A sao obrigatorias, e o helper as impoe: sem o controle
 * positivo, um filtro escrito errado que nao devolve NADA (`= NULL` em vez de `IS NULL`, que
 * nunca casa em SQL) passaria como se estivesse segregando. Isso nao e hipotese — foi medido ao
 * executar a Task 1: sabotar o filtro do valorTotalEstoque para `= NULL` zerou o total, e quem
 * pegou foi a metade do controle positivo, nao a de exclusao.
 *
 * Executar: cd server && node tests/api/materialClienteSegregacao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { assertSegregado, assertDono } = require('../helpers/clienteInvariante');
const stockService = require('../../services/almoxarifado/stockService');
const reportService = require('../../services/almoxarifado/reportService');
const purchaseService = require('../../services/almoxarifado/purchaseService');
const alertService = require('../../services/almoxarifado/alertService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db, { qtd = 100, minima = 200, proprietario_cliente_id = null } = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, categoria, quantidade_atual, quantidade_minima, quantidade_maxima,
     custo_unitario, ativo, proprietario_cliente_id)
    VALUES (?, ?, 'PC', 'Chapas', ?, ?, 500, 25, 1, ?)`,
  [`T8-SEG-${seq}`, `Chapa 3mm ${seq}`, qtd, minima, proprietario_cliente_id]);
  return r.lastID;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  const cli = await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Alfa LTDA']);
  const clienteId = cli.lastID;

  // Os dois lados da invariante: equivalentes em TUDO menos o dono. Ambos abaixo do minimo
  // (100 < 200) de proposito — e o que faz os dois entrarem nas leituras de reposicao, logo o
  // que faz o controle positivo ter o que provar.
  const matProprio = await novoMaterial(db);
  const matCliente = await novoMaterial(db, { proprietario_cliente_id: clienteId });

  await test('a fixture e valida: NULL = nosso, id de cliente = dele (guarda contra "0 = nosso")', async () => {
    await assertDono(db, matProprio, null);
    await assertDono(db, matCliente, clienteId);
  });

  // ── Classe A: leituras de estoque PROPRIO ───────────────────────────────────────────────
  await test('posicao de estoque proprio exclui material de cliente [GET /relatorio/posicao-estoque]', async () => {
    const res = await request(app).get('/api/almoxarifado/relatorio/posicao-estoque');
    assert.strictEqual(res.status, 200);
    assertSegregado(res.body, { materialClienteId: matCliente, materialProprioId: matProprio, contexto: 'relatorio/posicao-estoque' });
  });

  await test('dashboard nao conta material de cliente em nenhum dos cinco numeros', async () => {
    const res = await request(app).get('/api/almoxarifado/dashboard');
    assert.strictEqual(res.status, 200);
    // Controle positivo dos escalares: o proprio esta na lista de criticos, o do cliente nao.
    assertSegregado(res.body.listaMateriaisCriticos,
      { materialClienteId: matCliente, materialProprioId: matProprio, contexto: 'dashboard/listaMateriaisCriticos' });
    // Os tres contadores: sem o filtro, cada um contaria 2 em vez de 1.
    const soNosso = await dbGet(db, `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN quantidade_atual <= quantidade_minima AND quantidade_minima > 0 THEN 1 ELSE 0 END) as criticos,
        COALESCE(SUM(quantidade_atual * custo_unitario), 0) as valor
      FROM materiais_almoxarifado WHERE ativo = 1 AND proprietario_cliente_id IS NULL`);
    // ORDEM IMPORTA, e custou uma sabotagem para descobrir: o controle positivo vem PRIMEIRO.
    // Com o filtro sabotado para `= NULL` (que nunca casa), o total vira 0 e as DUAS asserces
    // falham — mas so esta aqui diz a verdade sobre o que aconteceu. Se a comparacao de
    // igualdade rodasse antes, o teste ficaria vermelho acusando "contabilizou patrimonio de
    // cliente" numa leitura que na verdade nao devolveu nada, mandando quem for consertar
    // procurar exatamente o bug errado.
    assert.ok(res.body.totalMateriais > 0 && res.body.materiaisCriticos > 0 && res.body.valorTotalEstoque > 0,
      'CONTROLE POSITIVO: os numeros do dashboard zeraram — o filtro nao segregou, apagou a leitura '
      + '(tipico de `= NULL` no lugar de `IS NULL`, que nunca casa em SQL)');
    assert.strictEqual(res.body.totalMateriais, soNosso.total,
      'totalMateriais contou material de cliente como nosso');
    assert.strictEqual(res.body.materiaisCriticos, soNosso.criticos,
      'materiaisCriticos contou material de cliente como nosso');
    // valorTotalEstoque: o material do cliente vale 100 * 25 = 2500. Provar que esse valor NAO
    // esta no total — comparando com o total recalculado so do que e nosso.
    assert.strictEqual(Math.round(res.body.valorTotalEstoque), Math.round(soNosso.valor),
      'valorTotalEstoque contabilizou patrimonio de cliente como nosso');
  });

  await test('GET /almoxarifado/estoque exclui material de cliente por default', async () => {
    const res = await request(app).get('/api/almoxarifado/estoque');
    assert.strictEqual(res.status, 200);
    assertSegregado(res.body, { materialClienteId: matCliente, materialProprioId: matProprio, contexto: 'GET /estoque' });
  });

  await test('relatorioEstoqueAtual e relatorioAbaixoMinimo excluem material de cliente', async () => {
    const atual = await reportService.relatorioEstoqueAtual(db);
    assertSegregado(atual, { materialClienteId: matCliente, materialProprioId: matProprio, contexto: 'relatorioEstoqueAtual' });
    const abaixo = await reportService.relatorioAbaixoMinimo(db);
    assertSegregado(abaixo, { materialClienteId: matCliente, materialProprioId: matProprio, contexto: 'relatorioAbaixoMinimo' });
  });

  await test('reposicao automatica nao abre solicitacao de compra para material de cliente', async () => {
    const criadas = await purchaseService.verificarEstoqueMinimo(db);
    const ids = criadas.map((c) => c.material_id);
    assert.ok(!ids.includes(matCliente), 'o sistema abriu pedido de compra para repor material de terceiro');
    assert.ok(ids.includes(matProprio), 'CONTROLE POSITIVO FALHOU: nem o material proprio gerou solicitacao');
    const doCliente = await dbGet(db,
      'SELECT id FROM solicitacoes_compra_almoxarifado WHERE material_id = ?', [matCliente]);
    assert.strictEqual(doCliente, undefined, 'sobrou solicitacao de compra de material de cliente na tabela');
  });

  await test('alerta de estoque minimo nao dispara para material de cliente', async () => {
    const resultados = await alertService.verificarAlertasEstoque(db, { teste: true });
    assertSegregado(resultados, {
      materialClienteId: matCliente, materialProprioId: matProprio,
      contexto: 'verificarAlertasEstoque', idOf: (r) => r.material_id,
    });
    // A excecao declarada da auditoria (leitura por id com semantica de reposicao):
    assert.strictEqual(await alertService.verificarAlertaPorMaterialId(db, matCliente, { teste: true }), null,
      'alerta de reposicao por id disparou para material de terceiro');
    assert.ok(await alertService.verificarAlertaPorMaterialId(db, matProprio, { teste: true }),
      'CONTROLE POSITIVO FALHOU: o material proprio tambem devolveu null');
  });

  // ── Classe B e opt-ins: quem pede AQUELE material quer aquele material ───────────────────
  await test('GET /almoxarifado/estoque?proprietario_cliente_id=N traz SO os do cliente', async () => {
    const res = await request(app).get(`/api/almoxarifado/estoque?proprietario_cliente_id=${clienteId}`);
    assert.strictEqual(res.status, 200);
    const ids = res.body.map((r) => r.id);
    assert.ok(ids.includes(matCliente), 'o opt-in por cliente nao trouxe o material do cliente');
    assert.ok(!ids.includes(matProprio), 'o opt-in por cliente trouxe material proprio junto');
    assert.strictEqual(res.body.find((r) => r.id === matCliente).proprietario_cliente_nome, 'Cliente Alfa LTDA');
  });

  await test('GET /almoxarifado/estoque?incluir_clientes=1 traz os dois, com o nome do dono', async () => {
    const res = await request(app).get('/api/almoxarifado/estoque?incluir_clientes=1');
    assert.strictEqual(res.status, 200);
    const ids = res.body.map((r) => r.id);
    assert.ok(ids.includes(matCliente) && ids.includes(matProprio),
      'o opt-in incluir_clientes=1 nao trouxe os dois lados');
    // O selo da Task 9 depende deste campo vir preenchido so para quem tem dono.
    assert.strictEqual(res.body.find((r) => r.id === matCliente).proprietario_cliente_nome, 'Cliente Alfa LTDA');
    assert.strictEqual(res.body.find((r) => r.id === matProprio).proprietario_cliente_nome, null);
  });

  await test('GET /almoxarifado/estoque?material_id=N (leitura por id) enxerga material de cliente', async () => {
    // Classe B da auditoria: quem pede AQUELE material quer aquele material. Se esta leitura
    // filtrasse, o extrato de material de cliente devolveria vazio.
    const res = await request(app).get(`/api/almoxarifado/estoque?material_id=${matCliente}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].id, matCliente);
  });

  // ── Classe C: misturar E o comportamento correto. Se alguem "consertar" filtrando, estes
  //    testes ficam vermelhos — e a mensagem diz por que a mistura e proposital. ────────────
  await test('classe C: relatorio de materiais bloqueados MOSTRA material de cliente (de proposito)', async () => {
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 10 WHERE id IN (?, ?)', [matProprio, matCliente]);
    const rows = await reportService.relatorioMateriaisBloqueados(db);
    const ids = rows.map((r) => r.id);
    assert.ok(ids.includes(matCliente),
      'material de cliente bloqueado sumiu do relatorio de qualidade: alguem filtrou o dono numa leitura classe C. '
      + 'Bloqueio e fato FISICO — a chapa do cliente esta bloqueada de verdade e o almoxarife precisa ve-la. '
      + 'O selo de propriedade (Task 9) e o que evita a confusao, nao o filtro.');
    assert.ok(ids.includes(matProprio), 'CONTROLE POSITIVO FALHOU: nem o material proprio bloqueado apareceu');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 0 WHERE id IN (?, ?)', [matProprio, matCliente]);
  });

  await test('classe C: relatorio materiais-sem-endereco MOSTRA material de cliente (de proposito)', async () => {
    const res = await request(app).get('/api/almoxarifado/relatorios/materiais-sem-endereco');
    assert.strictEqual(res.status, 200);
    const ids = res.body.map((r) => r.id);
    assert.ok(ids.includes(matCliente),
      'material de cliente sumiu do relatorio de sem-endereco: enderecar a chapa do cliente e tao '
      + 'necessario quanto enderecar a nossa, e filtrar aqui esconderia trabalho real do almoxarife');
    assert.ok(ids.includes(matProprio), 'CONTROLE POSITIVO FALHOU: nem o material proprio apareceu');
  });

  await test('classe C x classe A no MESMO SQL: o mapa soma a ocupacao do cliente mas nao a conta como reposicao', async () => {
    // O par discordante do MAPA_LOCALIZACOES_SQL, que e o ponto mais facil de "uniformizar" por
    // engano: o 1o subselect (ocupacao fisica) NAO filtra o dono, o 2o (contadores de
    // baixo_minimo/critico) filtra. Este teste prende os dois comportamentos de uma vez.
    const loc = await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao, setor, ativo)
      VALUES ('T8-SEG-LOC', 'Prateleira da invariante', 'TESTE', 1)`);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET localizacao_padrao_id = ? WHERE id IN (?, ?)',
      [loc.lastID, matProprio, matCliente]);
    try {
      const mapa = await stockService.consultarMapaLocalizacoes(db);
      const linha = mapa.find((l) => l.id === loc.lastID);
      assert.ok(linha, 'a localizacao de teste nao apareceu no mapa');
      assert.strictEqual(linha.qtd_itens, 2,
        'ocupacao fisica: a chapa do cliente ocupa a prateleira de verdade e tem de ser contada aqui');
      assert.strictEqual(linha.quantidade_total, 200,
        'ocupacao fisica: esconder a quantidade do cliente faria o mapa mentir sobre espaco livre');
      assert.strictEqual(linha.itens_baixo_minimo, 1,
        'contador de REPOSICAO: os dois estao abaixo do minimo, mas so o nosso se repoe — '
        + '2 significa que o filtro do 2o subselect caiu; 0 significa que ele zerou a leitura');
    } finally {
      await dbRun(db, 'UPDATE materiais_almoxarifado SET localizacao_padrao_id = NULL WHERE id IN (?, ?)',
        [matProprio, matCliente]);
    }
  });

  // ── O ganho medido da unificacao ────────────────────────────────────────────────────────
  await test('material de cliente aceita lote e serie como qualquer outro (o ganho da unificacao)', async () => {
    const lotService = require('../../services/almoxarifado/lotService');
    const seriesService = require('../../services/almoxarifado/seriesService');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1, controle_serie = 1 WHERE id = ?', [matCliente]);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: matCliente, codigo: 'L-CLI-1', corrida: 'COR-CLI' });
    assert.ok(lote.id, 'material de cliente nao aceitou lote');
    const afetadas = await seriesService.entradaSeries(db, ADMIN, {
      material_id: matCliente, numeros: ['SN-CLI-1'], lote_id: lote.id,
    });
    assert.strictEqual(afetadas.length, 1);
    const s = await dbGet(db, 'SELECT * FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [matCliente, 'SN-CLI-1']);
    assert.strictEqual(s.status, 'EM_ESTOQUE');
    assert.strictEqual(s.lote_id, lote.id);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 0, controle_serie = 0 WHERE id = ?', [matCliente]);
    await dbRun(db, 'DELETE FROM series_almoxarifado WHERE material_id = ?', [matCliente]);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
