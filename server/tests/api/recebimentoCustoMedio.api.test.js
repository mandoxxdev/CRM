/**
 * Etapa 8c, Task 2 (decisao 5 do design) — o recebimento por NF passa a alimentar o custo medio.
 *
 * Achado durante o desenho da 8c, e ele decide se o rateio da decisao 4 vale alguma coisa:
 * receiptService.darEntradaEstoque chamava registrarMovimentacao com ENTRADA_COMPRA e NAO passava
 * custo_unitario, apesar de gravar valor_unitario/valor_total na linha da nota. O unico caminho que
 * movia custo_medio no sistema inteiro era a movimentacao manual com custo digitado a mao — entao o
 * rateio da transformacao distribuiria R$ 0,00 na maioria dos casos, a conta fecharia (zero = zero)
 * e o resultado seria inutil.
 *
 * O par de testes aqui e BILATERAL de proposito, e o segundo e o que importa mais: passar
 * custo_unitario CEGAMENTE zeraria o custo de todo material recebido sem valor na nota.
 *
 * Executar: cd server && node tests/api/recebimentoCustoMedio.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db, { atual = 0, custoMedio = 0, custoUnit = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, custo_medio, custo_unitario, ativo)
     VALUES (?,?,'UN',?,?,?,1)`, [`NF-${seq}`, `Material NF ${seq}`, atual, custoMedio, custoUnit]);
  return r.lastID;
}
const custos = async (db, id) => dbGet(db,
  'SELECT quantidade_atual, COALESCE(custo_medio,0) AS custo_medio, COALESCE(custo_unitario,0) AS custo_unitario FROM materiais_almoxarifado WHERE id = ?', [id]);

/**
 * Cria recebimento com 1 item e da entrada. Devolve o id do recebimento.
 *
 * A assinatura real e `darEntradaEstoque(db, user, rec, recebimentoId, opcoes)` — a linha do
 * recebimento vem ANTES do id (receiptService.js:363), porque a pre-checagem do material de
 * cliente le `rec.nota_fiscal`. O plano da Task 2 escreveu `(db, user, rec.id, {})`; corrigido
 * aqui, no TESTE, como o proprio plano manda — esta task nao muda o contrato do recebimento.
 */
async function receberEDarEntrada(db, materialId, { quantidade, valor_unitario }) {
  const rec = await receiptService.criarRecebimento(db, ADMIN, {
    tipo_recebimento: 'NOTA_FISCAL',
    nota_fiscal: `NF-${Date.now()}${Math.floor(Math.random() * 1000)}`,
    fornecedor_nome: 'Fornecedor Teste',
    itens: [{ material_id: materialId, quantidade, quantidade_recebida: quantidade, valor_unitario }],
  });
  const row = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [rec.id]);
  await receiptService.darEntradaEstoque(db, ADMIN, row, rec.id, {});
  return rec.id;
}

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('recebimento por NF passa a alimentar custo medio', async () => {
    const mat = await novoMaterial(db, { atual: 0, custoMedio: 0, custoUnit: 0 });
    await receberEDarEntrada(db, mat, { quantidade: 100, valor_unitario: 10 });
    const c = await custos(db, mat);
    assert.strictEqual(c.quantidade_atual, 100);
    assert.strictEqual(c.custo_medio, 10,
      'o recebimento nao alimentou custo_medio — o rateio da transformacao distribuiria R$ 0,00');
    assert.strictEqual(c.custo_unitario, 10);
  });

  await test('segunda NF com preco diferente faz MEDIA PONDERADA, nao substituicao', async () => {
    // A conta e a do motor (stockService.js:1031-1041): (100*10 + 100*20) / 200 = 15.
    // Sem esta assercao, "custo_medio = ultimo preco" passaria no teste acima.
    const mat = await novoMaterial(db);
    await receberEDarEntrada(db, mat, { quantidade: 100, valor_unitario: 10 });
    await receberEDarEntrada(db, mat, { quantidade: 100, valor_unitario: 20 });
    const c = await custos(db, mat);
    assert.strictEqual(c.quantidade_atual, 200);
    assert.strictEqual(c.custo_medio, 15, `media ponderada errada: ${c.custo_medio}`);
    assert.strictEqual(c.custo_unitario, 20, 'custo_unitario deve ser o ULTIMO custo, nao a media');
  });

  await test('[CONTROLE POSITIVO] recebimento SEM valor_unitario nao zera o custo existente', async () => {
    // O modo de falhar desta decisao. Passar custo_unitario cegamente (ou passar 0) zeraria o
    // custo de todo material recebido sem valor na nota — e nota sem valor e caso normal
    // (remessa de conserto, amostra, brinde, material de cliente). O motor ja protege disso pelo
    // ramo `custoInformado > 0` (stockService.js:1031 e o else de :1043), e este teste e o que
    // garante que a Task 2 nao passou por cima dessa protecao.
    //
    // ACHADO DA SABOTAGEM (Task 2, S2/S3 — o plano previa outra coisa e ESTAVA ERRADO): a
    // protecao aqui e de DUAS camadas que se cobrem uma a outra, e por isso quebrar UMA SO nao
    // derruba este teste:
    //   - quebrar so o recebimento (passar `parseFloat(valor_unitario) || 0` cegamente): o motor
    //     recusa o 0 no `custoInformado > 0` — 5/5 continuam passando;
    //   - quebrar so o motor (`custoInformado !== undefined`): o recebimento nunca manda 0, manda
    //     `undefined` — 5/5 continuam passando. O plano afirmava que esta sabotagem derrubaria
    //     este controle positivo; NAO derruba, porque a normalizacao para `undefined` do Step 3
    //     e justamente o que a sombreia.
    // Quebrando as DUAS ao mesmo tempo, este teste e o irmao abaixo FALHAM (custo zerado). Ou
    // seja: o teste falha exatamente quando o sistema esta quebrado de verdade, e nao ha
    // assercao possivel que distinga as duas camadas por comportamento — o motor nao grava custo
    // nenhum na movimentacao (movimentacoes_almoxarifado nao tem coluna de custo), entao mandar
    // 0 e mandar `undefined` sao indistinguiveis de fora. A condicional do recebimento e
    // legibilidade + redundancia, nao a guarda unica.
    const mat = await novoMaterial(db, { atual: 50, custoMedio: 7.5, custoUnit: 7.5 });
    await receberEDarEntrada(db, mat, { quantidade: 50, valor_unitario: 0 });
    const c = await custos(db, mat);
    assert.strictEqual(c.quantidade_atual, 100, 'a quantidade tem de entrar mesmo sem valor na nota');
    assert.strictEqual(c.custo_medio, 7.5, 'a NF sem valor ZEROU o custo medio existente');
    assert.strictEqual(c.custo_unitario, 7.5, 'a NF sem valor ZEROU o custo unitario existente');
  });

  await test('[CONTROLE POSITIVO] valor_unitario ausente (undefined) tambem nao zera o custo', async () => {
    // Irmao do anterior, pelo outro caminho: `valor_unitario` ausente no payload vira
    // `parseFloat(undefined) || 0` = 0 na linha da nota (receiptService.js:110). Se a Task 2
    // passasse `item.valor_unitario` cru em vez do numero normalizado, o motor receberia
    // `undefined` — que NAO e > 0 e portanto tambem nao move custo. Este teste fixa isso: os dois
    // caminhos tem de dar o mesmo resultado.
    const mat = await novoMaterial(db, { atual: 20, custoMedio: 3, custoUnit: 3 });
    const rec = await receiptService.criarRecebimento(db, ADMIN, {
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: `NF-SEMVAL-${Date.now()}`, fornecedor_nome: 'Fornecedor Teste',
      itens: [{ material_id: mat, quantidade: 10, quantidade_recebida: 10 }],
    });
    const row = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [rec.id]);
    await receiptService.darEntradaEstoque(db, ADMIN, row, rec.id, {});
    const c = await custos(db, mat);
    assert.strictEqual(c.quantidade_atual, 30);
    assert.strictEqual(c.custo_medio, 3);
  });

  await test('o valor_unitario que alimenta o custo e o MESMO gravado na linha da nota', async () => {
    // Sem esta assercao, alimentar o custo com um numero calculado em outro lugar (valor_total /
    // quantidade, por exemplo) passaria nos testes acima e produziria uma nota que diz um preco e
    // um custo que diz outro — a divergencia mais dificil de achar depois.
    const mat = await novoMaterial(db);
    const recId = await receberEDarEntrada(db, mat, { quantidade: 40, valor_unitario: 12.75 });
    const item = await dbGet(db,
      'SELECT valor_unitario FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [recId]);
    const c = await custos(db, mat);
    assert.strictEqual(item.valor_unitario, 12.75);
    assert.strictEqual(c.custo_unitario, item.valor_unitario,
      'o custo aplicado nao e o valor_unitario da linha da nota');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
