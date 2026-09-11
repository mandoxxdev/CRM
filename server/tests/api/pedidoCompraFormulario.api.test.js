/**
 * Etapa 32 / G1 — os auxiliares do formulário de pedido de compra.
 * Executar: cd server && node tests/api/pedidoCompraFormulario.api.test.js
 *
 * Duas rotas, cada uma existindo por um motivo que um teste de unidade não alcança:
 *
 *  1. `pedidos-aux/materiais` — o prefixo `/api/almoxarifado` INTEIRO é guardado por
 *     `checkModulePermission('almoxarifado')` (routes/almoxarifado.js:233-235) e o comprador
 *     não tem esse módulo. Como a RN-09 exige `material_id` em todo item, sem esta rota o
 *     formulário não conseguiria salvar NENHUM pedido. É o espelho exato do que o G4 fez do
 *     outro lado (o almoxarife lendo o pedido sem o módulo `compras`).
 *  2. `pedidos/calcular` — a prévia dos totais na tela. Existe para que o navegador NÃO
 *     reimplemente a conta: `pedidoTotais` é o implementador único e a ordem do arredondamento
 *     é normativa. O invariante abaixo (prévia === gravado) é o que trava isso.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const COMPRAS = { id: 5, nome: 'Comprador', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'compras@test.com' };

let seq = 0;
async function novoMaterial(db, over = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, ncm, custo_unitario, quantidade_atual, ativo,
       quantidade_minima, quantidade_maxima, ponto_reposicao, lote_economico,
       prazo_reposicao_dias, controle_lote)
     VALUES (?,?,?,?,?,0,?,0,0,0,0,0,0)`, [
    over.codigo || `FORM-${seq}`,
    over.nome || `Material formulario ${seq}`,
    over.unidade || 'PC',
    over.ncm || '73181500',
    over.custo_unitario != null ? over.custo_unitario : 9.99,
    over.ativo != null ? over.ativo : 1,
  ]);
  return r.lastID;
}

(async () => {
  console.log('\n═══ Formulário do pedido de compra — auxiliares (API) ═══\n');
  const ctx = await createTestApp({ user: COMPRAS });
  const { app, db } = ctx;

  await dbRun(db, `INSERT INTO fornecedores
    (id, razao_social, nome_fantasia, cnpj, inscricao_estadual, endereco, cidade, estado, cep,
     telefone, celular, email)
    VALUES (1, 'TECNOPAR FIXADORES LTDA', 'TECNOPAR', '54.984.382/0001-64', '799850123110',
            'AV. WINSTON CHURCHILL, 596', 'SAO BERNARDO DO CAMPO', 'SP', '09720-000',
            '(11) 4177-2311', '(11) 99999-0000', 'contato@tecnopar.com.br')`);

  /* ── 1. escolher o material sem o módulo almoxarifado ─────────────── */
  console.log('Busca de materiais (o comprador não tem o módulo almoxarifado)');

  const matA = await novoMaterial(db, { codigo: 'MP-936', nome: 'PARAFUSO SEXTAVADO M10', custo_unitario: 2.191 });
  await novoMaterial(db, { codigo: 'MP-952', nome: 'PARAFUSO ALLEN M20' });
  await novoMaterial(db, { codigo: 'MP-OFF', nome: 'MATERIAL DESATIVADO', ativo: 0 });

  await test('lista materiais ativos com o que a grade precisa', async () => {
    const r = await request(app).get('/api/compras/pedidos-aux/materiais');
    assert.strictEqual(r.status, 200, `status ${r.status}: ${JSON.stringify(r.body)}`);

    const m = r.body.find((x) => x.codigo === 'MP-936');
    assert.ok(m, 'o material não voltou na lista');
    // Cada campo aqui preenche uma coluna da grade: sem eles o comprador redigita tudo.
    assert.strictEqual(m.nome, 'PARAFUSO SEXTAVADO M10');
    assert.strictEqual(m.unidade, 'PC');
    assert.strictEqual(m.ncm, '73181500');
    assert.strictEqual(m.custo_unitario, 2.191);
  });

  await test('material inativo NÃO aparece', async () => {
    const r = await request(app).get('/api/compras/pedidos-aux/materiais');
    assert.ok(!r.body.some((x) => x.codigo === 'MP-OFF'),
      'material desativado apareceu para o comprador');
  });

  await test('search filtra por código e por nome', async () => {
    const porCodigo = await request(app).get('/api/compras/pedidos-aux/materiais?search=MP-952');
    assert.strictEqual(porCodigo.body.length, 1);
    assert.strictEqual(porCodigo.body[0].codigo, 'MP-952');

    const porNome = await request(app).get('/api/compras/pedidos-aux/materiais?search=ALLEN');
    assert.strictEqual(porNome.body.length, 1);
    assert.strictEqual(porNome.body[0].codigo, 'MP-952');

    const nada = await request(app).get('/api/compras/pedidos-aux/materiais?search=zzzz-nao-existe');
    assert.deepStrictEqual(nada.body, []);
  });

  /* ── 2. a prévia dos totais ───────────────────────────────────────── */
  console.log('\nPrévia dos totais');

  await test('calcular devolve os totais e os derivados de cada linha', async () => {
    const r = await request(app).post('/api/compras/pedidos/calcular').send({
      valor_frete: 120,
      itens: [
        { quantidade: 13, valor_unitario: 2.191, ipi_percentual: 6.5 },
        { quantidade: 2, valor_unitario: 85.11, ipi_percentual: 6.5 },
      ],
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.totais.total_produtos, 198.70);
    assert.strictEqual(r.body.totais.valor_frete, 120);
    assert.strictEqual(r.body.itens[0].valor_linha, 28.48);
    assert.strictEqual(r.body.itens[1].valor_linha, 170.22);
  });

  await test('calcular NÃO grava nada', async () => {
    const antes = await dbGet(db, 'SELECT COUNT(*) AS n FROM pedidos_compra');
    await request(app).post('/api/compras/pedidos/calcular').send({
      itens: [{ quantidade: 5, valor_unitario: 10 }],
    });
    const depois = await dbGet(db, 'SELECT COUNT(*) AS n FROM pedidos_compra');
    assert.strictEqual(depois.n, antes.n, 'a calculadora criou pedido');
  });

  await test('calcular com lista vazia devolve zeros, não erro', async () => {
    const r = await request(app).post('/api/compras/pedidos/calcular').send({ itens: [] });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.totais.total_geral, 0);
  });

  /* ── 3. o invariante: o que a tela mostra é o que o banco grava ───── */
  console.log('\nInvariante — prévia na tela === total gravado');

  await test('invariante: 40 pedidos aleatórios, prévia e gravado batem', async () => {
    for (let n = 0; n < 40; n++) {
      const itens = [];
      const qtdLinhas = 1 + Math.floor(Math.random() * 4);
      for (let i = 0; i < qtdLinhas; i++) {
        itens.push({
          material_id: matA,
          codigo: `X${i}`,
          descricao: `Linha ${i}`,
          unidade: 'PC',
          quantidade: 1 + Math.floor(Math.random() * 999),
          // 3 casas: o unitário que o ERP de origem imprime (RN-12)
          valor_unitario: Math.round(Math.random() * 1000000) / 1000,
          ipi_percentual: [0, 3.25, 6.5, 10, 15][Math.floor(Math.random() * 5)],
        });
      }
      const encargos = {
        valor_frete: Math.round(Math.random() * 50000) / 100,
        total_icms_st: Math.round(Math.random() * 30000) / 100,
        total_desconto: Math.round(Math.random() * 10000) / 100,
      };

      const previa = await request(app).post('/api/compras/pedidos/calcular')
        .send({ ...encargos, itens });

      seq += 1;
      const salvo = await request(app).post('/api/compras/pedidos')
        .send({ ...encargos, itens, numero: `FORM-INV-${seq}`, fornecedor_id: 1 });
      assert.strictEqual(salvo.status, 201, JSON.stringify(salvo.body));

      assert.deepStrictEqual(previa.body.totais, salvo.body.totais,
        `a prévia divergiu do gravado no caso ${n}: ${JSON.stringify(itens)}`);

      // E o espelho legado também: é a coluna que a LISTA de pedidos mostra.
      assert.strictEqual(salvo.body.valor_total, previa.body.totais.total_geral,
        'valor_total (lida pela lista) divergiu do total da prévia');
    }
  });

  /* ── 4. guardas de fonte ──────────────────────────────────────────── */
  console.log('\nGuardas de regressão (fonte)');

  const comprasSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'routes', 'compras', 'pedidos.js'), 'utf8');
  const almoxSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'routes', 'almoxarifado.js'), 'utf8');

  await test('as duas rotas novas são guardadas pelo módulo compras', async () => {
    const linhas = comprasSrc.split(/\r?\n/);
    ['pedidos-aux/materiais', "pedidos/calcular"].forEach((rota) => {
      const linha = linhas.find((l) => l.includes(rota) && l.includes('app.'));
      assert.ok(linha, `a rota ${rota} sumiu`);
      assert.ok(linha.includes('...guard'),
        `a rota ${rota} perdeu a guarda de módulo: ${linha}`);
    });
  });

  await test('controle positivo: o prefixo /api/almoxarifado É guardado por módulo', async () => {
    // Se isto deixar de ser verdade, a rota-espelho acima perde o motivo de existir e o
    // formulário pode voltar a consumir /api/almoxarifado/materiais direto.
    assert.ok(/checkModulePermission\('almoxarifado'\)/.test(almoxSrc),
      'o prefixo /api/almoxarifado não é mais guardado por módulo — reveja pedidos-aux/materiais');
    assert.ok(/app\.use\('\/api\/almoxarifado'/.test(almoxSrc),
      'o app.use do prefixo almoxarifado mudou de forma');
  });

  await test('a calculadora usa pedidoTotais, não uma conta própria', async () => {
    assert.ok(comprasSrc.includes("require('../../services/compras/pedidoTotais')"),
      'a rota de compras parou de importar o implementador único da conta');
    const trecho = comprasSrc.slice(comprasSrc.indexOf('pedidos/calcular'));
    assert.ok(trecho.includes('calcularTotaisPedido'),
      'calcular parou de chamar calcularTotaisPedido — a conta foi reimplementada');
  });

  await ctx.close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
