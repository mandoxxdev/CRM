/**
 * Etapa 8c (tarefa extra) — a leitura do custo unitario numa fonte so.
 *
 * ── O defeito ────────────────────────────────────────────────────────────────────────────────
 *
 * `materiais_almoxarifado.custo_medio` e `REAL DEFAULT 0` — ZERO, nao NULL — e o cadastro de
 * material grava SO `custo_unitario`. Logo `COALESCE(custo_medio, custo_unitario, 0)`, que devolve
 * o primeiro NAO-NULO, devolve 0 e NUNCA chega em `custo_unitario`: TODO material cujo custo foi
 * digitado no cadastro (o acervo inteiro anterior a Task 2 desta etapa, porque ate ela o
 * recebimento por NF nem alimentava custo medio) era valorado a ZERO na posicao de estoque, no
 * `valor_estoque` da consulta e no custo dos itens de requisicao.
 *
 * Sonda executada antes do conserto (custo_unitario = 10, custo_medio = 0, qtd = 5):
 *   COALESCE(cm, cu, 0) = 0  -> valor_total 0
 *   CASE WHEN cm > 0 ...     = 10 -> valor_total 50
 *
 * ── Por que nenhum teste pegava ───────────────────────────────────────────────────────────────
 *
 * As fixtures do repositorio preenchem AS DUAS colunas (ou so `custo_unitario` em leituras que nao
 * conferem valor). O caso que quebra e o material real: `custo_medio = 0`. Por isso a fixture
 * central deste arquivo (`novoMaterial`) grava SO `custo_unitario` — e a do controle positivo
 * grava as duas com valores DIFERENTES, para provar que a media manda quando existe.
 *
 * ── Terceira familia: `custo_unitario` puro ──────────────────────────────────────────────────
 *
 * O dashboard e `GET /relatorio/posicao-estoque` liam SO `custo_unitario`, ignorando a media. Nao
 * tinham o bug do COALESCE (nao zeravam), mas respondiam a mesma pergunta com outro numero: com
 * media ponderada de 12 e ultimo custo de 10, o dashboard dizia 10 e o relatorio de servico dizia
 * 12. Os testes `[divergente]` abaixo fixam a decisao de unificar na media.
 *
 * Executar: cd server && node tests/api/custoUnitarioFonteUnica.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const reportService = require('../../services/almoxarifado/reportService');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const requisitionValueApprovalService = require('../../services/almoxarifado/requisitionValueApprovalService');
const { custoUnitarioSql, valorEstoqueSql } = require('../../services/almoxarifado/custoSql');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
/**
 * O material do DIA A DIA: custo digitado no cadastro, `custo_medio` no DEFAULT 0.
 * `quantidade_minima` fica em 0 para o material nao entrar nas listas de reposicao e nao poluir
 * os testes de outros arquivos que compartilham conceito.
 */
async function novoMaterial(db, { custo_unitario = 10, custo_medio = null, qtd = 5 } = {}) {
  seq += 1;
  const cols = ['codigo', 'nome', 'unidade', 'quantidade_atual', 'custo_unitario', 'ativo'];
  const vals = [`CUSTO-${seq}`, `Chapa ${seq}`, 'UN', qtd, custo_unitario, 1];
  if (custo_medio !== null) { cols.push('custo_medio'); vals.push(custo_medio); }
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado (${cols.join(',')})
    VALUES (${cols.map(() => '?').join(',')})`, vals);
  return r.lastID;
}

async function requisicaoCom(db, materialId, quantidade) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
    (numero, solicitante_id, solicitante_nome, status) VALUES (?, 1, 'Solicitante', 'PENDENTE')`,
  [`REQ-CUSTO-${seq}`]);
  await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
    (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,?)`, [r.lastID, materialId, quantidade]);
  return r.lastID;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  // ── A sonda, como teste: prova o defeito NO BANCO, nao por leitura de codigo ─────────────────
  await test('[sonda] custo_medio e 0 e NAO NULL — e por isso COALESCE(cm, cu, 0) devolve zero', async () => {
    const id = await novoMaterial(db, { custo_unitario: 10 });
    const { dbGet } = require('../../services/almoxarifado/db');
    const row = await dbGet(db, `SELECT custo_medio, custo_medio IS NULL AS eh_nulo,
        COALESCE(custo_medio, custo_unitario, 0) AS leitura_antiga,
        ${custoUnitarioSql()} AS leitura_correta
      FROM materiais_almoxarifado WHERE id = ?`, [id]);
    assert.strictEqual(row.eh_nulo, 0,
      'a premissa do defeito caiu: custo_medio virou NULL — se a coluna deixou de ser DEFAULT 0, '
      + 'reveja custoSql.js, porque o COALESCE simples passaria a funcionar');
    assert.strictEqual(row.custo_medio, 0);
    assert.strictEqual(row.leitura_antiga, 0, 'CONTROLE: a formula antiga tem de zerar mesmo');
    assert.strictEqual(row.leitura_correta, 10);
  });

  // ── Familia COALESCE: as tres leituras que valoravam a ZERO ─────────────────────────────────
  await test('[posicao de estoque] valor_total usa o custo do cadastro quando nao ha media', async () => {
    const id = await novoMaterial(db, { custo_unitario: 10, qtd: 5 });
    const linha = (await reportService.relatorioEstoqueAtual(db)).find((l) => l.id === id);
    assert.strictEqual(linha.valor_total, 50, 'material cadastrado a mao valorado a ZERO no relatorio');
  });

  await test('[consultarEstoque] valor_estoque usa o custo do cadastro quando nao ha media', async () => {
    const id = await novoMaterial(db, { custo_unitario: 10, qtd: 5 });
    const [linha] = await stockService.consultarEstoque(db, { material_id: id });
    assert.strictEqual(linha.valor_estoque, 50, 'material cadastrado a mao valorado a ZERO na consulta');
  });

  await test('[itens da requisicao] custo_unitario do item nao vem zerado', async () => {
    const id = await novoMaterial(db, { custo_unitario: 10 });
    const requisicaoId = await requisicaoCom(db, id, 3);
    const [item] = await requisitionService.carregarItensRequisicao(db, requisicaoId);
    assert.strictEqual(item.custo_unitario, 10,
      'o item da requisicao mostrava custo ZERO — e a tela de aprovacao mostra esse numero');
  });

  // ── Familia `custo_unitario` puro: divergencia do dashboard e do relatorio de rota ───────────
  await test('[divergente][dashboard] valorTotalEstoque valora pela MEDIA quando ela existe', async () => {
    const { db: db2, app: app2, close: close2 } = await createTestApp({ user: ADMIN });
    // Banco proprio: o dashboard soma o estoque INTEIRO, entao qualquer material deixado por
    // outro teste entraria na conta e a assercao viraria um numero magico.
    await dbRun(db2, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, custo_unitario, custo_medio, ativo)
      VALUES ('DASH-1', 'Chapa com media', 'UN', 5, 10, 12, 1)`);
    const res = await request(app2).get('/api/almoxarifado/dashboard');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(Math.round(res.body.valorTotalEstoque), 60,
      'dashboard valorou pelo ULTIMO custo (10) em vez da media ponderada (12) — divergindo do '
      + 'relatorio de posicao, que responde a MESMA pergunta');
    await close2();
  });

  await test('[divergente][rota posicao-estoque] valor_total valora pela MEDIA quando ela existe', async () => {
    const id = await novoMaterial(db, { custo_unitario: 10, custo_medio: 12, qtd: 5 });
    const res = await request(app).get('/api/almoxarifado/relatorio/posicao-estoque');
    assert.strictEqual(res.status, 200);
    const linha = res.body.find((l) => l.id === id);
    assert.ok(linha, 'CONTROLE POSITIVO: a rota nao devolveu o material — a leitura zerou, nao divergiu');
    assert.strictEqual(linha.valor_total, 60, 'a rota valorou pelo ultimo custo em vez da media');
  });

  // ── Controle positivo bilateral: a media MANDA quando existe ─────────────────────────────────
  await test('[CONTROLE POSITIVO] com custo_medio > 0 TODAS as leituras usam a media, nao o cadastro', async () => {
    // A metade que falta: trocar a formula por `COALESCE(custo_unitario,0)` puro passaria em todos
    // os testes acima e destruiria a media ponderada que o recebimento mantem.
    const id = await novoMaterial(db, { custo_unitario: 10, custo_medio: 12, qtd: 5 });
    const rel = (await reportService.relatorioEstoqueAtual(db)).find((l) => l.id === id);
    assert.strictEqual(rel.valor_total, 60, 'relatorio ignorou a media ponderada');
    const [cons] = await stockService.consultarEstoque(db, { material_id: id });
    assert.strictEqual(cons.valor_estoque, 60, 'consultarEstoque ignorou a media ponderada');
    const requisicaoId = await requisicaoCom(db, id, 3);
    const [item] = await requisitionService.carregarItensRequisicao(db, requisicaoId);
    assert.strictEqual(item.custo_unitario, 12, 'item da requisicao ignorou a media ponderada');
    assert.strictEqual(await requisitionValueApprovalService.calcularValorTotal(db, requisicaoId), 36,
      'o valor total da requisicao (3 x 12) ignorou a media ponderada');
  });

  await test('[CONTROLE POSITIVO] material sem custo nenhum vale zero, sem erro', async () => {
    const id = await novoMaterial(db, { custo_unitario: 0, qtd: 5 });
    const rel = (await reportService.relatorioEstoqueAtual(db)).find((l) => l.id === id);
    assert.strictEqual(rel.valor_total, 0);
  });

  // ── Contrato do gerador: alias e forma ───────────────────────────────────────────────────────
  await test('[custoSql] o gerador qualifica com o alias e funciona sem alias', async () => {
    assert.ok(custoUnitarioSql('m').includes('m.custo_medio') && custoUnitarioSql('m').includes('m.custo_unitario'));
    assert.ok(!custoUnitarioSql().includes('.custo_medio'), 'sem alias nao pode qualificar coluna');
    assert.ok(valorEstoqueSql('m').startsWith('(m.quantidade_atual *'), valorEstoqueSql('m'));
    // A expressao tem de ser usavel DIRETO num SELECT (ja parentizada).
    const { dbGet } = require('../../services/almoxarifado/db');
    const r = await dbGet(db, `SELECT ${valorEstoqueSql('m')} AS v FROM materiais_almoxarifado m LIMIT 1`);
    assert.ok(typeof r.v === 'number');
  });

  // ── Varredura: nenhuma outra query pode reimplementar a leitura ──────────────────────────────
  // Verificar "editei os 8" depende de eu ter contado certo; verificar "sobrou zero" nao depende.
  // Mesmo desenho de saldoEmTerceiros.api.test.js, pela mesma razao: a etapa anterior contou SETE
  // sitios do disponivel quando eram QUATORZE.
  const RAIZ = path.join(__dirname, '..', '..');
  const ARQUIVOS_VARRIDOS = [
    ...fs.readdirSync(path.join(RAIZ, 'services', 'almoxarifado'))
      .filter((f) => f.endsWith('.js')).map((f) => path.join('services', 'almoxarifado', f)),
    ...fs.readdirSync(path.join(RAIZ, 'routes', 'almoxarifado'))
      .filter((f) => f.endsWith('.js')).map((f) => path.join('routes', 'almoxarifado', f)),
    path.join('routes', 'almoxarifado.js'),
    path.join('routes', 'requisicoesMaterial.js'),
  ];
  // Casa a formula ERRADA: `COALESCE(<alias?>custo_medio, <alias?>custo_unitario` — a assinatura do
  // defeito. NAO casa `COALESCE(custo_medio,0)`, que e o teste legitimo dentro do CASE WHEN.
  const PADRAO_ERRADO = /COALESCE\(\s*\w*\.?custo_medio\s*,\s*\w*\.?custo_unitario/;
  // Casa a formula CERTA escrita a mao — legitima so dentro de custoSql.js.
  const PADRAO_REPLICADO = /CASE\s+WHEN\s+COALESCE\(\s*\w*\.?custo_medio\s*,\s*0\s*\)\s*>\s*0/;

  /**
   * A varredura olha CODIGO, nao comentario.
   *
   * Sem isto o teste proibiria os comentarios que EXPLICAM o defeito — e a regra do projeto e a
   * oposta: a afirmacao errada tem de ficar registrada como errada (custoSql.js, transformCost.js
   * e thirdPartyService.js citam a formula do COALESCE de proposito, para o proximo nao a
   * reintroduzir achando que e nova). Um teste que forcasse a apagar essas explicacoes trocaria
   * um bug por outro pior.
   */
  const semComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const lerCodigo = (rel) => semComentarios(fs.readFileSync(path.join(RAIZ, rel), 'utf8'));

  await test('[varredura] nenhum arquivo do modulo usa mais COALESCE(custo_medio, custo_unitario)', async () => {
    const culpados = ARQUIVOS_VARRIDOS.filter((rel) => PADRAO_ERRADO.test(lerCodigo(rel)));
    assert.deepStrictEqual(culpados, [],
      `estes arquivos ainda valoram material a ZERO quando custo_medio = 0: ${culpados.join(', ')}`);
  });

  await test('[varredura] so custoSql.js escreve a formula do custo a mao', async () => {
    const culpados = ARQUIVOS_VARRIDOS.filter((rel) => {
      if (rel.endsWith('custoSql.js')) return false;
      return PADRAO_REPLICADO.test(lerCodigo(rel));
    });
    assert.deepStrictEqual(culpados, [],
      `estes arquivos reimplementam a leitura do custo — a proxima correcao nao vale neles: ${culpados.join(', ')}`);
  });

  await test('[varredura][CONTROLE POSITIVO] os dois padroes SABEM achar o que procuram', async () => {
    // Sem isto, um regex quebrado daria "0 culpados" e aprovaria o oposto do que a task promete.
    assert.ok(PADRAO_ERRADO.test('(m.quantidade_atual * COALESCE(m.custo_medio, m.custo_unitario, 0)) as valor_total'),
      'o padrao do defeito nao acha nem a linha literal que foi consertada');
    assert.ok(PADRAO_ERRADO.test('COALESCE(ma.custo_medio, ma.custo_unitario, 0) as custo_unitario'));
    assert.ok(!PADRAO_ERRADO.test('CASE WHEN COALESCE(custo_medio,0) > 0 THEN custo_medio ELSE COALESCE(custo_unitario,0) END'),
      'o padrao do defeito acusa a formula CERTA');
    assert.ok(PADRAO_REPLICADO.test('CASE WHEN COALESCE(ma.custo_medio, 0) > 0 THEN ma.custo_medio ELSE 0 END'),
      'o padrao de replicacao nao acha a formula certa escrita a mao');
    assert.ok(PADRAO_REPLICADO.test(custoUnitarioSql('m')),
      'o padrao de replicacao nao acha nem o que o proprio gerador produz');
    // O stripper de comentarios e a parte que pode silenciar a varredura inteira: se ele comesse
    // codigo, os dois testes acima passariam sempre. As duas metades, nesta ordem.
    assert.ok(!PADRAO_ERRADO.test(semComentarios('// COALESCE(custo_medio, custo_unitario, 0)\n')),
      'o stripper nao removeu um comentario de linha');
    assert.ok(!PADRAO_ERRADO.test(semComentarios('/** doc: COALESCE(custo_medio, custo_unitario, 0) */\n')),
      'o stripper nao removeu um bloco de doc');
    assert.ok(PADRAO_ERRADO.test(semComentarios('const x = `COALESCE(m.custo_medio, m.custo_unitario, 0)`;\n')),
      'o stripper COMEU CODIGO — a varredura inteira viraria uma aprovacao automatica');
    assert.ok(semComentarios('const u = "http://x";\n').includes('http://x'),
      'o stripper truncou uma URL — sinal de que ele corta `//` dentro de string');
    // E tem de varrer os arquivos de verdade: lista vazia (glob errado) daria "0 culpados" para
    // sempre. Ja aconteceu 3x nesta base.
    assert.ok(ARQUIVOS_VARRIDOS.length >= 30, `a varredura leu ${ARQUIVOS_VARRIDOS.length} arquivos — glob errado?`);
    ARQUIVOS_VARRIDOS.forEach((rel) => assert.ok(fs.existsSync(path.join(RAIZ, rel)), `nao existe: ${rel}`));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
