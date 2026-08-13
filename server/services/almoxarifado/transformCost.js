/**
 * O rateio de custo da transformacao (Etapa 8c, decisao 4 do design) — FUNCAO PURA.
 *
 * Sem db, sem async, sem estado. Isolada de proposito por dois motivos: (1) trocar a base do rateio
 * (por peso, por area, por linha) e uma mudanca de UM arquivo se a GMP passar a cortar pecas
 * mistas; (2) o unico invariante contabil desta etapa vale a pena testar contra uma funcao que nao
 * tem como passar por acaso.
 *
 * ─── A regra, decidida com o cliente em 2026-08-13 ───────────────────────────────────────────
 *
 * RATEIO POR QUANTIDADE ENTRE AS PECAS, SOBRA A ZERO.
 *
 * Por que quantidade e nao peso: na GMP uma chapa vira N pecas IGUAIS, e ai os dois criterios dao o
 * mesmo numero. Peso so ganharia se a mesma remessa voltasse com pecas de tamanhos bem diferentes.
 * E peso exige `peso_unitario` preenchido em TODO material — sem ele o calculo simplesmente nao
 * roda, e travar o operador por um campo de cadastro em branco e o que a decisao 7 recusa.
 *
 * Por que a sobra entra a zero: o rateio por quantidade nao quebra entre as pecas; quebra NA SOBRA.
 * Chapa de R$ 1.000 -> 40 pecas + 1 sobra que e um terco da chapa: rateando por quantidade em 41
 * linhas, a sobra carrega 2,4% do valor e as pecas ficam ~40% caras. A sobra e UMA linha e uma
 * FATIA GRANDE — e ela que envenena a media. Sobra a custo zero e o tratamento conservador que ERP
 * da a retalho: o patrimonio nunca infla, e se um dia a sobra for vendida como sucata aparece como
 * GANHO, nunca como perda inventada.
 *
 * CUSTO DO SERVICO: opcional, e o valor TOTAL da nota do terceiro daquela transformacao. Se
 * preenchido, soma ao valor rateado — a peca nao e peca sem o corte. Se em branco, nao entra. Sem
 * estimativa, sem default.
 *
 * ─── Dois casos-limite decididos aqui, e nao no design ───────────────────────────────────────
 *
 * 1. ZERO PECAS (so sobra). Permitido, e o valor EVAPORA de proposito: chapa que voltou so como
 *    retalho e exatamente o caso em que o valor foi consumido pelo processo, e inflar o retalho
 *    para "fechar a conta" e o que a decisao 4 recusa em voz alta. O numero nao some sem rastro:
 *    `residuo` o carrega, e quem chama escreve o residuo na justificativa do CONSUMO_TERCEIRO.
 * 2. CUSTO ZERO na chapa. Permitido e silencioso: material sem custo cadastrado e caso comum (todo
 *    o acervo anterior a Task 2 desta etapa), e a transformacao dele tem de funcionar com custo
 *    zero, que e a VERDADE, e nao com um custo estimado.
 *
 * ─── O invariante, e o que ele NAO promete ───────────────────────────────────────────────────
 *
 * PROMETE: `sum(linha.quantidade * linha.custo_unitario_aplicado) == valorTotal`, a menos do
 * arredondamento de 4 casas que o motor usa (ROUND(...,4), stockService.js:1034). `residuo` e a
 * diferenca e TOLERANCIA_RATEIO(n) e o teto dela.
 *
 * NAO PROMETE que o patrimonio lido nas telas nao se move. Duas razoes, as duas registradas no
 * plano (C1 e C2): o sistema tem DUAS familias de leitura de valor (`custo_unitario` sozinho contra
 * `COALESCE(custo_medio, custo_unitario)`), e a sobra creditada a custo zero cai no ramo SEM custo
 * do motor (stockService.js:1043) — ou seja, ela entra carregando o custo que o material dela ja
 * tinha. O invariante fecha na FUNCAO; nas telas ele fecha quando os materiais de destino nao tem
 * custo previo e a leitura e uma so.
 *
 * E NAO PROMETE que o rateio foi JUSTO: se a sobra entrasse no denominador, a soma continuaria
 * fechando (nada evapora, so fica mal distribuido) e o invariante continuaria verde. Quem pega isso
 * e o teste `sobra entra com custo zero e NAO dilui as pecas`, separado dele de proposito.
 */
const { TIPOS_RESULTADO } = require('./schema');

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

/** As 4 casas do motor (ROUND(...,4) em stockService.js:1034). Mesma precisao, de proposito. */
const CASAS = 4;
const arredondar = (v) => Math.round(v * 10 ** CASAS) / 10 ** CASAS;

/**
 * Teto do |residuo| aceitavel para `n` unidades de peca.
 *
 * Cada custo unitario e arredondado a 4 casas, entao erra no maximo 0,00005 por unidade; `n`
 * unidades acumulam `n * 0,00005`. O `1e-9` cobre o erro de ponto flutuante da propria soma. Sem
 * esta funcao, o teste do invariante teria de escolher um numero magico, e um numero magico grande
 * demais aprova rateio errado.
 */
const TOLERANCIA_RATEIO = (n) => n * 0.00005 + 1e-9;

function ratearCusto({ custoUnitarioChapa, quantidadeConsumida, custoServico = 0, resultados }) {
  const custoChapa = Number(custoUnitarioChapa);
  const consumida = Number(quantidadeConsumida);
  const servico = Number(custoServico || 0);

  if (!Number.isFinite(custoChapa) || custoChapa < 0) {
    throw erro(`Custo unitario da chapa invalido: ${custoUnitarioChapa}`);
  }
  if (!Number.isFinite(consumida) || !(consumida > 0)) {
    throw erro(`Quantidade consumida da chapa deve ser maior que zero (recebido: ${quantidadeConsumida})`);
  }
  if (!Number.isFinite(servico) || servico < 0) {
    throw erro(`Custo do servico do terceiro nao pode ser negativo (recebido: ${custoServico})`);
  }
  if (!Array.isArray(resultados) || resultados.length === 0) {
    throw erro('Informe ao menos um resultado da transformacao (peca ou sobra)');
  }
  for (const r of resultados) {
    if (!Number.isFinite(Number(r.quantidade)) || !(Number(r.quantidade) > 0)) {
      throw erro(`Quantidade do resultado deve ser maior que zero (material ${r.material_id}: ${r.quantidade})`);
    }
    if (!TIPOS_RESULTADO.includes(r.tipo_resultado)) {
      throw erro(`Classificacao invalida no resultado do material ${r.material_id}: `
        + `${r.tipo_resultado}. Validas: ${TIPOS_RESULTADO.join(', ')}`);
    }
  }

  const valorBase = custoChapa * consumida;
  const valorServico = servico;
  const valorTotal = arredondar(valorBase + valorServico);

  const quantidadePecas = resultados
    .filter((r) => r.tipo_resultado === 'PECA')
    .reduce((a, r) => a + Number(r.quantidade), 0);

  // Zero pecas: o denominador nao existe. Custo zero em todas as linhas, e o valor inteiro vira
  // residuo — reportado, nunca escondido. Ver o caso-limite 1 no cabecalho.
  const custoUnitarioPeca = quantidadePecas > 0 ? arredondar(valorTotal / quantidadePecas) : 0;

  // Objetos NOVOS: a funcao nao muta a entrada. Quem chama (thirdPartyService) reusa os objetos de
  // entrada na compensacao, e mutar aqui faria a compensacao desfazer com dados ja alterados.
  const linhas = resultados.map((r) => ({
    ...r,
    custo_unitario_aplicado: r.tipo_resultado === 'PECA' ? custoUnitarioPeca : 0,
  }));

  const valorDistribuido = arredondar(
    linhas.reduce((a, l) => a + Number(l.quantidade) * l.custo_unitario_aplicado, 0));
  const residuo = arredondar(valorTotal - valorDistribuido);

  return {
    valorBase: arredondar(valorBase),
    valorServico: arredondar(valorServico),
    valorTotal,
    quantidadePecas,
    custoUnitarioPeca,
    linhas,
    valorDistribuido,
    residuo,
  };
}

module.exports = { ratearCusto, TOLERANCIA_RATEIO, CASAS };
