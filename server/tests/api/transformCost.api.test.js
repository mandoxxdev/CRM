/**
 * Etapa 8c, Task 6 — o rateio de custo da transformacao, funcao PURA.
 *
 * Vive em tests/api/ porque e la que o runner descobre arquivos (`tests/api/*.api.test.js`), nao
 * porque exercite rota nenhuma: nao ha db, nao ha app, nao ha async. E de proposito — um invariante
 * contabil testado contra uma funcao sem estado e um teste que nao pode passar por acaso.
 *
 * Executar: cd server && node tests/api/transformCost.api.test.js
 */
const assert = require('assert');
const { ratearCusto, TOLERANCIA_RATEIO } = require('../../services/almoxarifado/transformCost');

let passed = 0; let failed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const peca = (quantidade, material_id = 1) => ({ material_id, quantidade, tipo_resultado: 'PECA' });
const sobra = (quantidade, material_id = 2) => ({ material_id, quantidade, tipo_resultado: 'SOBRA' });

(async () => {

  await test('o caso da GMP: chapa de 100 kg a R$ 10 vira 40 pecas e 1 sobra', async () => {
    const r = ratearCusto({
      custoUnitarioChapa: 10, quantidadeConsumida: 100,
      resultados: [peca(40), sobra(1)],
    });
    assert.strictEqual(r.valorTotal, 1000);
    assert.strictEqual(r.quantidadePecas, 40);
    assert.strictEqual(r.custoUnitarioPeca, 25);
    assert.strictEqual(r.linhas[0].custo_unitario_aplicado, 25);
    assert.strictEqual(r.linhas[1].custo_unitario_aplicado, 0, 'a sobra recebeu rateio');
  });

  await test('[INVARIANTE] o valor que sai na chapa e o que entra nas pecas', async () => {
    // O UNICO invariante contabil desta etapa. Ele so vale medido por UMA formula de valor: o
    // sistema tem duas familias de leitura (custo_unitario sozinho em routes/almoxarifado.js:249 e
    // :1048; COALESCE(custo_medio, custo_unitario) nas outras tres), e o design afirmava que "nao
    // ha um segundo lugar onde o patrimonio possa discordar" — HA, e e a propria decisao 11.1 que
    // o diz. Ver contradicao C1 no plano.
    //
    // Aqui, no nivel da funcao pura, o invariante e exato a menos do arredondamento de 4 casas que
    // o motor usa (ROUND(...,4) em stockService.js:1034). TOLERANCIA_RATEIO da o teto.
    const casos = [
      { custoUnitarioChapa: 10, quantidadeConsumida: 100, resultados: [peca(40), sobra(1)] },
      { custoUnitarioChapa: 7.35, quantidadeConsumida: 83, resultados: [peca(17), peca(6, 3), sobra(2)] },
      { custoUnitarioChapa: 1, quantidadeConsumida: 1, resultados: [peca(3)] },
      { custoUnitarioChapa: 12.3456, quantidadeConsumida: 55.5, resultados: [peca(7), sobra(1)] },
      { custoUnitarioChapa: 10, quantidadeConsumida: 100, custoServico: 250, resultados: [peca(40), sobra(1)] },
    ];
    for (const c of casos) {
      const r = ratearCusto(c);
      const tol = TOLERANCIA_RATEIO(r.quantidadePecas);
      assert.ok(Math.abs(r.residuo) <= tol,
        `residuo ${r.residuo} acima da tolerancia ${tol} no caso ${JSON.stringify(c)}`);
      // A conta refeita AQUI, a mao, a partir das linhas: se ratearCusto calculasse `residuo` de
      // um jeito e `custo_unitario_aplicado` de outro, o teste acima passaria e este nao.
      const distribuido = r.linhas.reduce((a, l) => a + l.quantidade * l.custo_unitario_aplicado, 0);
      assert.ok(Math.abs(distribuido - r.valorTotal) <= tol,
        `refazendo a conta pelas linhas: ${distribuido} != ${r.valorTotal} (caso ${JSON.stringify(c)})`);
    }
  });

  await test('[CONTROLE POSITIVO DA TOLERANCIA] TOLERANCIA_RATEIO nao e carimbo: ela REPROVA rateio errado', async () => {
    // Acrescentado pela execucao da Task 6 (o plano nao tinha este teste). O invariante acima so
    // vale se a tolerancia for apertada: um numero magico grande demais aprova rateio errado — e o
    // proprio plano diz isso ao justificar a existencia de TOLERANCIA_RATEIO. Sem esta assercao,
    // trocar a tolerancia por, digamos, `n * 1` deixaria o invariante verde para sempre e NENHUM
    // teste cairia. Aqui a tolerancia e medida contra o menor erro que importa de verdade: um
    // centavo por unidade.
    const centavoPorUnidade = (n) => n * 0.01;
    for (const n of [1, 3, 40, 1000]) {
      const tol = TOLERANCIA_RATEIO(n);
      assert.ok(tol > 0, `tolerancia nao pode ser zero (n=${n}): o arredondamento de 4 casas e real`);
      assert.ok(tol < centavoPorUnidade(n),
        `tolerancia ${tol} para ${n} unidades aceita erro de um centavo por unidade — e carimbo, nao teto`);
    }
    // E a prova direta: um rateio deliberadamente errado (um centavo a menos por peca) NAO passa
    // pelo teto. Se este assert falhar, o [INVARIANTE] acima nao esta provando nada.
    const r = ratearCusto({ custoUnitarioChapa: 10, quantidadeConsumida: 100, resultados: [peca(40), sobra(1)] });
    const errado = r.linhas.map((l) => ({ ...l, custo_unitario_aplicado: l.custo_unitario_aplicado ? l.custo_unitario_aplicado - 0.01 : 0 }));
    const distribuidoErrado = errado.reduce((a, l) => a + l.quantidade * l.custo_unitario_aplicado, 0);
    assert.ok(Math.abs(distribuidoErrado - r.valorTotal) > TOLERANCIA_RATEIO(r.quantidadePecas),
      'um centavo a menos por peca passou pela tolerancia — o invariante e decorativo');
  });

  await test('sobra entra com custo zero e NAO dilui as pecas', async () => {
    // O caso que motivou a regra. Chapa de R$ 1.000, 40 pecas + 1 sobra que e um terco da chapa:
    // rateando por quantidade em 41 linhas, a sobra carregaria 2,4% do valor e as pecas ficariam
    // ~40% caras. Com a sobra a zero, a peca fica em 25 e nao em 24,39.
    //
    // Este teste existe SEPARADO do [INVARIANTE] de proposito: o invariante NAO pega "a sobra
    // entrou no denominador", porque com a sobra dentro a soma continua fechando (nada evapora, so
    // fica mal distribuido). Comprovado pela sabotagem S1 da Task 6.
    const comSobra = ratearCusto({
      custoUnitarioChapa: 10, quantidadeConsumida: 100, resultados: [peca(40), sobra(1)] });
    const semSobra = ratearCusto({
      custoUnitarioChapa: 10, quantidadeConsumida: 100, resultados: [peca(40)] });
    assert.strictEqual(comSobra.custoUnitarioPeca, semSobra.custoUnitarioPeca,
      'a presenca da sobra mudou o custo da peca — ela entrou no denominador');
    assert.strictEqual(comSobra.custoUnitarioPeca, 25);
  });

  await test('custo_servico informado soma ao valor rateado', async () => {
    // A peca nao e peca sem o corte: a nota do terceiro entra no custo dela. Se em branco, nao
    // entra. Sem estimativa, sem default.
    const semServico = ratearCusto({
      custoUnitarioChapa: 10, quantidadeConsumida: 100, resultados: [peca(40), sobra(1)] });
    const comServico = ratearCusto({
      custoUnitarioChapa: 10, quantidadeConsumida: 100, custoServico: 400, resultados: [peca(40), sobra(1)] });
    assert.strictEqual(semServico.valorTotal, 1000);
    assert.strictEqual(comServico.valorTotal, 1400);
    assert.strictEqual(comServico.custoUnitarioPeca, 35);
    assert.strictEqual(comServico.valorServico, 400);
    assert.strictEqual(comServico.linhas[1].custo_unitario_aplicado, 0,
      'o custo do servico vazou para a sobra');
  });

  await test('[CONTROLE POSITIVO] chapa com custo zero credita peca com custo zero, sem erro', async () => {
    // Prova que o rateio NAO inventa numero. Material sem custo cadastrado e caso comum (todo o
    // acervo anterior a Task 2 desta etapa), e a transformacao dele tem de funcionar mesmo assim —
    // com custo zero, que e a verdade, e nao com um custo estimado.
    const r = ratearCusto({
      custoUnitarioChapa: 0, quantidadeConsumida: 100, resultados: [peca(40), sobra(1)] });
    assert.strictEqual(r.valorTotal, 0);
    assert.strictEqual(r.custoUnitarioPeca, 0);
    assert.strictEqual(r.residuo, 0);
    for (const l of r.linhas) assert.strictEqual(l.custo_unitario_aplicado, 0);
  });

  await test('so SOBRA: o valor evapora, e o residuo DIZ quanto evaporou', async () => {
    // Caso que o design nao trata (contradicao C3 do plano). Decidido aqui: e permitido e o valor
    // evapora DE PROPOSITO — chapa que voltou so como retalho e exatamente o caso em que o valor foi
    // consumido pelo processo, e inflar o retalho para "fechar a conta" e o que a decisao 4 recusa
    // em voz alta. O numero nao pode sumir sem rastro: `residuo` o carrega, e o servico (Task 7) o
    // escreve na justificativa do CONSUMO_TERCEIRO.
    const r = ratearCusto({
      custoUnitarioChapa: 10, quantidadeConsumida: 100, resultados: [sobra(3)] });
    assert.strictEqual(r.quantidadePecas, 0);
    assert.strictEqual(r.custoUnitarioPeca, 0);
    assert.strictEqual(r.valorDistribuido, 0);
    assert.strictEqual(r.residuo, 1000, 'o valor que evaporou nao foi reportado');
    assert.strictEqual(r.linhas[0].custo_unitario_aplicado, 0);
  });

  await test('duas linhas de PECA com quantidades diferentes recebem o MESMO custo unitario', async () => {
    // Rateio por QUANTIDADE: cada unidade custa o mesmo, independentemente de estar numa linha de
    // 30 ou numa de 10. Um rateio por LINHA (valorTotal / numeroDeLinhas) daria 500 e 500, e as 10
    // pecas da segunda linha ficariam 3x mais caras que as 30 da primeira.
    const r = ratearCusto({
      custoUnitarioChapa: 25, quantidadeConsumida: 40, resultados: [peca(30, 1), peca(10, 2)] });
    assert.strictEqual(r.valorTotal, 1000);
    assert.strictEqual(r.quantidadePecas, 40);
    assert.strictEqual(r.linhas[0].custo_unitario_aplicado, 25);
    assert.strictEqual(r.linhas[1].custo_unitario_aplicado, 25);
  });

  await test('a funcao PRESERVA os campos das linhas de entrada', async () => {
    // Ela devolve as linhas para quem chama gravar. Perder lote_id/observacoes aqui seria a mesma
    // classe de bug do z.object que come chave nao declarada.
    const r = ratearCusto({
      custoUnitarioChapa: 10, quantidadeConsumida: 10,
      resultados: [{ material_id: 5, quantidade: 2, tipo_resultado: 'PECA', lote_id: 9, observacoes: 'x' }],
    });
    assert.strictEqual(r.linhas[0].material_id, 5);
    assert.strictEqual(r.linhas[0].lote_id, 9);
    assert.strictEqual(r.linhas[0].observacoes, 'x');
    assert.strictEqual(r.linhas[0].custo_unitario_aplicado, 50);
  });

  await test('a funcao NAO muta o array de entrada', async () => {
    // Pura de verdade. Se mutasse, a compensacao do Task 7 (que reusa os objetos para desfazer)
    // desfaria com dados ja alterados.
    const entrada = [peca(4)];
    ratearCusto({ custoUnitarioChapa: 10, quantidadeConsumida: 4, resultados: entrada });
    assert.strictEqual(entrada[0].custo_unitario_aplicado, undefined,
      'ratearCusto escreveu no objeto de entrada');
  });

  await test('entradas invalidas sao recusadas com 400 e mensagem especifica', async () => {
    const casos = [
      [{ custoUnitarioChapa: 10, quantidadeConsumida: 0, resultados: [peca(1)] }, /consumida/i],
      [{ custoUnitarioChapa: -1, quantidadeConsumida: 10, resultados: [peca(1)] }, /custo/i],
      [{ custoUnitarioChapa: 10, quantidadeConsumida: 10, custoServico: -5, resultados: [peca(1)] }, /servico/i],
      [{ custoUnitarioChapa: 10, quantidadeConsumida: 10, resultados: [] }, /resultado/i],
      [{ custoUnitarioChapa: 10, quantidadeConsumida: 10, resultados: [peca(0)] }, /quantidade/i],
      [{ custoUnitarioChapa: 10, quantidadeConsumida: 10, resultados: [{ material_id: 1, quantidade: 1, tipo_resultado: 'CAVACO' }] }, /CAVACO|classifica/i],
    ];
    for (const [entrada, regex] of casos) {
      assert.throws(() => ratearCusto(entrada), (e) => {
        assert.strictEqual(e.status, 400, `caso ${JSON.stringify(entrada)} nao veio com status 400`);
        assert.match(e.message, regex, `mensagem generica demais: ${e.message}`);
        return true;
      }, `nao recusou: ${JSON.stringify(entrada)}`);
    }
  });

  await test('[CONTROLE POSITIVO] a entrada minima valida NAO e recusada', async () => {
    // Sem isto, uma validacao que recusasse tudo passaria no teste acima.
    const r = ratearCusto({ custoUnitarioChapa: 0, quantidadeConsumida: 1, resultados: [sobra(1)] });
    assert.strictEqual(r.valorTotal, 0);
  });

  // ── rendimento (decisao 7): informativo, nunca bloqueia ────────────────────────────────────
  const { calcularRendimento } = require('../../services/almoxarifado/transformCost');
  const comPeso = (codigo, peso_unitario) => ({ codigo, peso_unitario });

  await test('rendimento: com todos os pesos, calcula peso que saiu, peso que voltou e o percentual', async () => {
    const r = calcularRendimento({
      materialOrigem: comPeso('CHP-001', 7.85),
      quantidadeConsumida: 100,
      resultados: [
        { quantidade: 40, material: comPeso('PC-010', 15) },
        { quantidade: 1, material: comPeso('SOB-001', 120) },
      ],
    });
    assert.strictEqual(r.calculavel, true);
    assert.strictEqual(r.peso_saida, 785);
    assert.strictEqual(r.peso_retorno, 720);
    assert.strictEqual(r.rendimento_percentual, 91.72);
  });

  await test('rendimento nao calculavel diz QUAL material nao tem peso', async () => {
    // "nao calculavel" seco manda o operador procurar em 41 cadastros. A mensagem NOMEIA.
    const r = calcularRendimento({
      materialOrigem: comPeso('CHP-001', 7.85),
      quantidadeConsumida: 100,
      resultados: [
        { quantidade: 40, material: comPeso('PC-010', null) },
        { quantidade: 1, material: comPeso('SOB-001', 120) },
      ],
    });
    assert.strictEqual(r.calculavel, false);
    assert.deepStrictEqual(r.materiais_sem_peso, ['PC-010']);
    assert.match(r.motivo, /PC-010/, 'a mensagem nao diz qual material falta');
    assert.match(r.motivo, /peso/i);
    assert.ok(!('rendimento_percentual' in r), 'estimou um rendimento sem ter os pesos');
  });

  await test('rendimento nao calculavel quando quem falta e a CHAPA', async () => {
    const r = calcularRendimento({
      materialOrigem: comPeso('CHP-SEMPESO', null),
      quantidadeConsumida: 100,
      resultados: [{ quantidade: 40, material: comPeso('PC-010', 15) }],
    });
    assert.strictEqual(r.calculavel, false);
    assert.deepStrictEqual(r.materiais_sem_peso, ['CHP-SEMPESO']);
  });

  await test('rendimento lista TODOS os materiais sem peso, nao so o primeiro', async () => {
    // Sem isto o operador conserta um cadastro, tenta de novo e descobre o segundo — e assim por
    // diante. Mesma licao da pre-checagem "tudo ou nada": diga tudo o que falta de uma vez.
    const r = calcularRendimento({
      materialOrigem: comPeso('CHP-X', null),
      quantidadeConsumida: 10,
      resultados: [
        { quantidade: 2, material: comPeso('A', null) },
        { quantidade: 2, material: comPeso('B', 5) },
        { quantidade: 2, material: comPeso('C', 0) },
      ],
    });
    assert.strictEqual(r.calculavel, false);
    // peso 0 conta como NAO cadastrado: peso zero nao existe fisicamente, e trata-lo como valido
    // daria rendimento 0% com cara de resultado.
    assert.deepStrictEqual(r.materiais_sem_peso, ['CHP-X', 'A', 'C']);
  });

  await test('[CONTROLE POSITIVO] rendimento acima de 100% e calculado, nao recusado', async () => {
    // O sistema NAO valida que os pesos fecham (decisao 7). Rendimento > 100% significa cadastro de
    // peso errado, e mostrar 116% e o que faz alguem ir conferir; recusar esconderia o problema.
    const r = calcularRendimento({
      materialOrigem: comPeso('CHP-001', 1),
      quantidadeConsumida: 100,
      resultados: [{ quantidade: 116, material: comPeso('PC', 1) }],
    });
    assert.strictEqual(r.calculavel, true);
    assert.strictEqual(r.rendimento_percentual, 116);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
