/**
 * Etapa 27, Task 1 — a regua da tolerancia da inspecao, funcao PURA (contrato C1, RN-02/RN-07).
 *
 * Vive em tests/api/ porque e la que o runner descobre arquivos (`tests/api/*.api.test.js`), nao
 * porque exercite rota nenhuma: nao ha db, nao ha app, nao ha async. Mesmo padrao de
 * transformCost.api.test.js — um invariante testado contra funcao sem estado.
 *
 * O QUE ESTE ARQUIVO PROVA, e por que os numeros dele sao estes:
 *
 * 1. O EPSILON. Sem ele, 12,3% das pecas EXATAMENTE no limite da tolerancia reprovam (medido pela
 *    Fase 2 sobre 50.000 pares: 6.132 falsos reprovados). Com a RN-03, cada uma delas ligaria
 *    `divergencia_dimensional` sozinha — a etapa fabricando a divergencia que existe para medir.
 *    Os pares usados aqui sao os que HOJE falham, reproduzidos:
 *      nominal 0.7,   desvios +-0.1,   medido 0.8   -> sup calcula 0.7999999999999999
 *      nominal 2.675, desvios +-0.005, medido 2.68  -> sup calcula 2.6799999999999997
 *      nominal 12.3,  desvios +-0.1,   medido 12.2  -> inf calcula 12.200000000000001
 *    NAO use `12.3 / +-0.1 / 12.4`: esse par passa por acidente aritmetico (12.3 + 0.1 da
 *    12.400000000000000355, que e MAIOR que 12.4), entao ficaria verde antes da implementacao
 *    certa e o controle positivo do epsilon nao distinguiria nada.
 *
 * 2. OS DESVIOS TEM SINAL, nao sao magnitudes. O cenario que prova isso e o unilateral deslocado
 *    (ISO 286, eixo +0,005 / +0,021): os DOIS limites acima do nominal, entao o nominal puro
 *    REPROVA. Com magnitudes nao-negativas esse caso seria inexprimivel.
 *
 * 3. MEDIDA NAO NUMERICA NUNCA E CONFORME e nunca e reprovacao silenciosa. `Number('12,4')` — a
 *    virgula decimal de um input pt-BR — e NaN, e toda comparacao com NaN e false: sem guarda
 *    explicita a caracteristica "reprovaria", ligaria a divergencia e gravaria valor_medido NULL.
 *    Uma reprovacao sem numero por tras. Aqui ela sai como motivo NAO_NUMERICO, para quem chama
 *    devolver 400 (RN-07).
 *
 * Executar: cd server && node tests/api/toleranciaInspecao.api.test.js
 */
const assert = require('assert');
const {
  avaliarMedida, EPS_TOLERANCIA,
} = require('../../services/almoxarifado/toleranciaInspecao');

let passed = 0; let failed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// Atalho: simetrico (o caso comum, "+- tol") em desvios COM SINAL.
const sim = (nominal, tol, medido) => avaliarMedida({
  nominal, desvioInf: -tol, desvioSup: tol, medido,
});

(async () => {

  // ─── 1. O EPSILON: os pares que hoje falham ───────────────────────────────────────────────

  await test('[EPSILON] 0.7 +-0.1 medindo 0.8 e CONFORME (o limite superior calcula 0.7999999999999999)', async () => {
    const sup = 0.7 + 0.1;
    assert.notStrictEqual(sup, 0.8,
      'o pressuposto deste teste caiu: 0.7+0.1 passou a dar 0.8 exato, o cenario perdeu o sentido');
    const r = sim(0.7, 0.1, 0.8);
    assert.strictEqual(r.conforme, true,
      `peca no limite superior EXATO reprovada: limite calculado ${sup} < medido 0.8 (motivo ${r.motivo}) — falta o epsilon`);
    assert.strictEqual(r.motivo, null);
  });

  await test('[EPSILON] 2.675 +-0.005 medindo 2.68 e CONFORME (o limite superior calcula 2.6799999999999997)', async () => {
    const sup = 2.675 + 0.005;
    assert.notStrictEqual(sup, 2.68,
      'o pressuposto deste teste caiu: 2.675+0.005 passou a dar 2.68 exato');
    const r = sim(2.675, 0.005, 2.68);
    assert.strictEqual(r.conforme, true,
      `peca no limite superior EXATO reprovada: limite calculado ${sup} < medido 2.68 (motivo ${r.motivo}) — falta o epsilon`);
  });

  await test('[EPSILON] 12.3 +-0.1 medindo 12.2 e CONFORME (o limite INFERIOR calcula 12.200000000000001)', async () => {
    // O irmao dos dois de cima, do outro lado da faixa: prova que o epsilon vale nos DOIS
    // extremos, e nao so no superior.
    const inf = 12.3 - 0.1;
    assert.notStrictEqual(inf, 12.2,
      'o pressuposto deste teste caiu: 12.3-0.1 passou a dar 12.2 exato');
    const r = sim(12.3, 0.1, 12.2);
    assert.strictEqual(r.conforme, true,
      `peca no limite inferior EXATO reprovada: limite calculado ${inf} > medido 12.2 (motivo ${r.motivo}) — falta o epsilon`);
  });

  await test('[EPSILON] a constante e 1e-6 — a MESMA do modulo (inspectionService.js:78)', async () => {
    // Nao e enfeite: o mesmo fenomeno ja tinha sido resolvido dentro da funcao que a Task 3 vai
    // alterar, e um segundo epsilon divergente ali dentro seria duas reguas para o mesmo problema.
    assert.strictEqual(EPS_TOLERANCIA, 1e-6);
  });

  // ─── 2. As bordas exatas, e um passo alem ─────────────────────────────────────────────────

  await test('limite inferior e superior EXATOS sao conformes (a tolerancia e inclusiva)', async () => {
    // Numeros redondos de proposito: aqui a aritmetica nao atrapalha, entao o que se testa e a
    // regra (`<=`, nao `<`), nao o epsilon.
    assert.strictEqual(sim(10, 0.5, 9.5).conforme, true, 'limite inferior exato reprovado');
    assert.strictEqual(sim(10, 0.5, 10.5).conforme, true, 'limite superior exato reprovado');
    assert.strictEqual(sim(10, 0.5, 10).conforme, true, 'o proprio nominal reprovado');
  });

  await test('um passo ALEM de cada limite reprova, nomeando QUAL limite', async () => {
    const abaixo = sim(10, 0.5, 9.4);
    assert.strictEqual(abaixo.conforme, false, '9.4 aceito com minimo 9.5 — a regua esta larga');
    assert.strictEqual(abaixo.motivo, 'ABAIXO_MINIMO');

    const acima = sim(10, 0.5, 10.6);
    assert.strictEqual(acima.conforme, false, '10.6 aceito com maximo 10.5 — a regua esta larga');
    assert.strictEqual(acima.motivo, 'ACIMA_MAXIMO');
  });

  await test('o epsilon e FOLGA, nao porta: 1e-3 fora da faixa continua reprovando', async () => {
    // Guarda contra o conserto preguicoso do epsilon (aumentar ate o teste passar). Com EPS=1e-6,
    // um desvio de 0.001 alem do limite tem de continuar reprovando; se alguem inflar o epsilon
    // para 1e-2 "para nao ter mais problema", este cai.
    assert.strictEqual(sim(10, 0.5, 10.501).conforme, false,
      'o epsilon virou porta: 0.001 acima do maximo foi aprovado');
    assert.strictEqual(sim(10, 0.5, 9.499).conforme, false,
      'o epsilon virou porta: 0.001 abaixo do minimo foi aprovado');
  });

  await test('desvio ZERO (tolerancia nenhuma): so o nominal exato passa', async () => {
    const r = avaliarMedida({ nominal: 8, desvioInf: 0, desvioSup: 0, medido: 8 });
    assert.strictEqual(r.conforme, true, 'medida igual ao nominal reprovada com tolerancia zero');
    assert.strictEqual(r.desvio, 0);
    assert.strictEqual(avaliarMedida({ nominal: 8, desvioInf: 0, desvioSup: 0, medido: 8.01 }).conforme, false);
    assert.strictEqual(avaliarMedida({ nominal: 8, desvioInf: 0, desvioSup: 0, medido: 7.99 }).conforme, false);
  });

  // ─── 3. Desvios COM SINAL: o unilateral deslocado ─────────────────────────────────────────

  await test('[SINAL] unilateral deslocado (+0.005/+0.021): o NOMINAL PURO reprova', async () => {
    // O cenario que so existe porque os desvios tem sinal. Eixo ISO 286: os DOIS limites acima do
    // nominal, faixa [20.005, 20.021]. Se o codigo tratasse os desvios como magnitudes (Math.abs,
    // ou `nominal - tolInf`), a faixa viraria [19.995, 20.021] e o nominal puro seria aprovado.
    const eixo = (medido) => avaliarMedida({ nominal: 20, desvioInf: 0.005, desvioSup: 0.021, medido });

    const noNominal = eixo(20);
    assert.strictEqual(noNominal.conforme, false,
      'o nominal puro (20) foi aprovado numa faixa que comeca em 20.005 — os desvios estao sendo tratados como magnitude, nao com sinal');
    assert.strictEqual(noNominal.motivo, 'ABAIXO_MINIMO');

    assert.strictEqual(eixo(20.005).conforme, true, 'limite inferior deslocado exato reprovado');
    assert.strictEqual(eixo(20.021).conforme, true, 'limite superior deslocado exato reprovado');
    assert.strictEqual(eixo(20.013).conforme, true, 'o meio da faixa deslocada reprovado');
    assert.strictEqual(eixo(20.022).conforme, false, 'acima do maximo deslocado foi aprovado');
  });

  await test('[SINAL] unilateral para BAIXO (-0.030/-0.010) tambem e representavel', async () => {
    const furo = (medido) => avaliarMedida({ nominal: 50, desvioInf: -0.03, desvioSup: -0.01, medido });
    assert.strictEqual(furo(50).conforme, false, 'o nominal puro foi aprovado numa faixa que termina em 49.99');
    assert.strictEqual(furo(50).motivo, 'ACIMA_MAXIMO');
    assert.strictEqual(furo(49.99).conforme, true);
    assert.strictEqual(furo(49.97).conforme, true);
    assert.strictEqual(furo(49.96).conforme, false);
  });

  await test('faixa invertida (desvioInf > desvioSup) NUNCA e conforme', async () => {
    // O CRUD (Task 2) barra isto com 400, mas a regua nao pode confiar nisso: plano gravado antes
    // da validacao, ou escrita direta no banco, nao podem produzir "conforme" a partir de uma
    // faixa que nao existe. Nao lanca — quem chama recebe motivo e decide o status.
    const r = avaliarMedida({ nominal: 10, desvioInf: 0.5, desvioSup: -0.5, medido: 10 });
    assert.strictEqual(r.conforme, false, 'faixa invertida aprovou uma medida');
    assert.strictEqual(r.motivo, 'FAIXA_INVALIDA');
  });

  // ─── 4. Negativos e o sinal do desvio ─────────────────────────────────────────────────────

  await test('nominal e medida NEGATIVOS (cota de referencia abaixo do zero)', async () => {
    const r = avaliarMedida({ nominal: -5.5, desvioInf: -0.2, desvioSup: 0.2, medido: -5.7 });
    assert.strictEqual(r.conforme, true, 'limite inferior negativo exato reprovado');
    assert.ok(Math.abs(r.desvio - (-0.2)) < 1e-9, `desvio deu ${r.desvio}, esperado -0.2`);
    assert.strictEqual(avaliarMedida({ nominal: -5.5, desvioInf: -0.2, desvioSup: 0.2, medido: -5.8 }).conforme, false);
    assert.strictEqual(avaliarMedida({ nominal: -5.5, desvioInf: -0.2, desvioSup: 0.2, medido: -5.2 }).conforme, false);
  });

  await test('o `desvio` sai com o SINAL certo: medido - nominal, sempre', async () => {
    // Sinal invertido aqui daria relatorio dimensional espelhado — a peca grande apareceria como
    // pequena. Vale inclusive quando reprova, e vale para a peca conforme.
    assert.ok(Math.abs(sim(10, 0.5, 10.3).desvio - 0.3) < 1e-9, 'medida ACIMA do nominal deu desvio negativo');
    assert.ok(Math.abs(sim(10, 0.5, 9.7).desvio - (-0.3)) < 1e-9, 'medida ABAIXO do nominal deu desvio positivo');
    assert.ok(Math.abs(sim(10, 0.5, 12).desvio - 2) < 1e-9, 'desvio sumiu quando a peca reprovou');
    assert.strictEqual(sim(10, 0.5, 10).desvio, 0);
  });

  // ─── 5. RN-07: medida nao numerica ────────────────────────────────────────────────────────

  await test('[RN-07] "12,4" (virgula pt-BR) e NAO_NUMERICO, nunca reprovacao silenciosa', async () => {
    // O caso real: input pt-BR manda "12,4", `Number('12,4')` e NaN, e toda comparacao com NaN e
    // false. Sem guarda, a caracteristica reprova, liga divergencia_dimensional e grava
    // valor_medido NULL — uma reprovacao sem numero por tras.
    const r = avaliarMedida({ nominal: 12.3, desvioInf: -0.1, desvioSup: 0.1, medido: '12,4' });
    assert.strictEqual(r.conforme, false, '"12,4" foi aceito como medida conforme');
    assert.strictEqual(r.motivo, 'NAO_NUMERICO',
      `"12,4" saiu como motivo ${r.motivo} — quem chama devolveria reprovacao (400 e o correto), gravando valor_medido NULL`);
    assert.strictEqual(r.desvio, null, 'desvio de medida nao numerica tem de ser null, nunca NaN');
  });

  await test('[RN-07] NaN, Infinity, -Infinity, null, undefined e "" sao todos NAO_NUMERICO', async () => {
    for (const medido of [NaN, Infinity, -Infinity, null, undefined, '', '  ', 'abc', {}, []]) {
      const r = avaliarMedida({ nominal: 10, desvioInf: -0.5, desvioSup: 0.5, medido });
      assert.strictEqual(r.conforme, false, `${JSON.stringify(medido)} (${typeof medido}) foi aceito como conforme`);
      assert.strictEqual(r.motivo, 'NAO_NUMERICO', `${JSON.stringify(medido)} saiu com motivo ${r.motivo}`);
    }
  });

  await test('[RN-07] string numerica com PONTO decimal e aceita — a virgula e que nao', async () => {
    // A fronteira HTTP entrega numero como string com frequencia; recusar "12.35" seria recusar
    // dado bom. O que a RN-07 barra e o que nao vira numero.
    const r = avaliarMedida({ nominal: 12.3, desvioInf: -0.1, desvioSup: 0.1, medido: '12.35' });
    assert.strictEqual(r.conforme, true, '"12.35" (ponto decimal, dentro da faixa) foi recusado');
    assert.ok(Math.abs(r.desvio - 0.05) < 1e-9, `desvio deu ${r.desvio}`);
  });

  await test('nominal ou desvio nao numerico e FAIXA_INVALIDA, nunca conforme', async () => {
    // Plano corrompido nao pode produzir aprovacao. Distinto de NAO_NUMERICO de proposito: um e
    // erro do PLANO (400 do cadastro), o outro e erro da MEDIDA (400 da inspecao).
    for (const p of [
      { nominal: NaN, desvioInf: -0.1, desvioSup: 0.1, medido: 10 },
      { nominal: 10, desvioInf: 'x', desvioSup: 0.1, medido: 10 },
      { nominal: 10, desvioInf: -0.1, desvioSup: Infinity, medido: 10 },
    ]) {
      const r = avaliarMedida(p);
      assert.strictEqual(r.conforme, false, `plano invalido ${JSON.stringify(p)} aprovou a medida`);
      assert.strictEqual(r.motivo, 'FAIXA_INVALIDA', `saiu com motivo ${r.motivo}`);
    }
  });

  await test('chamada sem argumento nenhum nao explode — devolve nao conforme', async () => {
    // A regua roda dentro de decidirInspecao ANTES do claim de saldo (C3/A2). Um TypeError ali
    // seria 500 numa validacao que existe justamente para recusar com 400 antes de mover saldo.
    assert.strictEqual(avaliarMedida().conforme, false);
    assert.strictEqual(avaliarMedida({}).conforme, false);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
