/**
 * A regua da tolerancia da inspecao de recebimento (Etapa 27, contrato C1) — FUNCAO PURA.
 *
 * Sem db, sem async, sem estado. Isolada de proposito, pelo padrao de
 * availabilitySql/custoSql/divergencia: ela decide aprovacao POR NUMERO, e e o tipo de coisa que
 * precisa de teste de borda (limite exato, tolerancia zero, medida negativa) sem subir banco.
 *
 * ─── A regra ─────────────────────────────────────────────────────────────────────────────────
 *
 *   inf = nominal + desvioInf        sup = nominal + desvioSup       [desvios COM SINAL]
 *   conforme = medido >= inf - EPS && medido <= sup + EPS            [INCLUSIVO nos extremos]
 *   desvio   = medido - nominal
 *
 * INCLUSIVA nos dois extremos porque peca no limite exato da tolerancia e conforme — e isso que a
 * tolerancia significa.
 *
 * ─── Por que os desvios tem SINAL e nao sao magnitudes ───────────────────────────────────────
 *
 * O simetrico continua sendo o caso comum (-0,05 / +0,05), mas magnitude nao-negativa nao
 * representa TOLERANCIA UNILATERAL DESLOCADA, que e normal em ajuste ISO 286 e comum em usinagem:
 * um eixo +0,005 / +0,021 tem os DOIS limites ACIMA do nominal — a faixa e [n+0,005, n+0,021] e o
 * nominal puro REPROVA. Com magnitudes esse plano seria inexprimivel, e trocar depois seria
 * migracao de dado congelado (RN-05: a inspecao guarda os valores usados no ato). Era agora ou
 * nunca. Validacao correspondente: desvioInf <= desvioSup.
 *
 * ─── Por que o EPSILON existe, e por que e 1e-6 ──────────────────────────────────────────────
 *
 * SEM ELE, 12,3% DAS PECAS EXATAMENTE NO LIMITE DA TOLERANCIA REPROVAM. Medido pela revisao da
 * Fase 2 sobre 50.000 pares (nominal 0,1-50,0, tolerancia 0,01-0,50, medida no limite exato):
 * 6.132 falsos reprovados. A soma `nominal + desvio` e IEEE-754 e quase nunca cai no decimal que
 * o operador digitou:
 *
 *     nominal 0.7   +- 0.1     -> limite superior calcula 0.7999999999999999  (medido 0.8  REPROVA)
 *     nominal 2.675 +- 0.005   -> limite superior calcula 2.6799999999999997  (medido 2.68 REPROVA)
 *     nominal 12.3  +- 0.1     -> limite inferior calcula 12.200000000000001  (medido 12.2 REPROVA)
 *
 * Isso importa aqui mais do que importaria em outro lugar: pela RN-03 a `divergencia_dimensional`
 * deixa de ser marcada a mao e passa a ser DERIVADA da medida. Cada falso reprovado desses ligaria
 * a flag sozinho — a etapa fabricando a divergencia que ela existe para medir.
 *
 * 1e-6 e o epsilon DO MODULO, nao um numero escolhido aqui: `inspectionService.js:78` ja usa
 * `Math.abs(...) > 1e-6` — dentro da propria funcao que a Task 3 vai alterar — com um comentario
 * explicando este mesmo fenomeno, e `InspecoesAlmoxarifado.js:126` espelha na fronteira HTTP. Um
 * segundo epsilon divergente dentro da mesma decisao seriam duas reguas para o mesmo problema.
 * (`divergencia.js` usa 1e-9, mas la o ruido vem de UMA subtracao entre grandezas ja gravadas;
 * aqui vem de uma SOMA de decimais digitados, que erra mais.)
 *
 * E FOLGA, NAO PORTA. 1e-6 mm e um nanometro: menor que a resolucao de qualquer instrumento que
 * este modulo registra (paquimetro 0,01-0,02 mm, micrometro 0,001 mm) por tres ordens de
 * grandeza, e cerca de 1e10 vezes MAIOR que o erro de arredondamento de um double na faixa de
 * dimensoes reais (o ULP perto de 50 e ~7e-15). Ou seja: ele cobre o ruido com folga enorme e
 * ainda assim nao chega a aprovar nada que um instrumento consiga distinguir como fora. O limite
 * teorico de validade e uma tolerancia da ordem do proprio epsilon — abaixo de ~1e-5 de faixa
 * total o epsilon deixaria de ser desprezivel; nao existe medicao assim neste dominio, mas fica
 * dito para quem um dia mexer nas casas decimais.
 *
 * ─── Por que medida nao numerica tem motivo PROPRIO ──────────────────────────────────────────
 *
 * `Number('12,4')` — a virgula decimal de um input pt-BR — e NaN, e TODA comparacao com NaN e
 * false. Sem guarda explicita a caracteristica sairia "nao conforme": ligaria
 * `divergencia_dimensional` e gravaria `valor_medido` NULL. Uma reprovacao sem numero por tras.
 * NAO_NUMERICO existe para quem chama devolver 400 e NAO gravar nada (RN-07).
 *
 * Cuidado que o teste guarda: `Number(null)`, `Number('')` e `Number([])` sao 0 — todos passariam
 * por `Number.isFinite` e virariam "medida zero". A conversao aqui e explicita por tipo.
 *
 * Nada nesta funcao lanca. Ela roda dentro de `decidirInspecao` ANTES do claim de saldo (C3), e um
 * TypeError ali seria 500 numa validacao que existe para recusar com 400 antes de mover saldo.
 */

const EPS_TOLERANCIA = 1e-6;

// Numero de verdade, ou null. Explicita por tipo porque `Number(null)`, `Number('')`,
// `Number('  ')`, `Number([])` e `Number(true)` devolvem numeros finitos a partir de coisas que
// nao sao medida nenhuma.
function paraNumeroFinito(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * @param {{nominal:number, desvioInf:number, desvioSup:number, medido:number|string}} p
 * @returns {{conforme:boolean, desvio:number|null, motivo:string|null}}
 *   motivo: null (conforme) | 'ABAIXO_MINIMO' | 'ACIMA_MAXIMO' | 'NAO_NUMERICO' | 'FAIXA_INVALIDA'
 */
function avaliarMedida(p = {}) {
  const nominal = paraNumeroFinito(p.nominal);
  const desvioInf = paraNumeroFinito(p.desvioInf);
  const desvioSup = paraNumeroFinito(p.desvioSup);
  const medido = paraNumeroFinito(p.medido);

  const desvio = (nominal === null || medido === null) ? null : medido - nominal;

  // O PLANO primeiro: sem faixa nao ha regra, e faixa invertida nao pode produzir "conforme" so
  // porque as duas comparacoes deram false por acaso. O CRUD barra isto com 400, mas plano gravado
  // antes da validacao — ou escrita direta no banco — chega aqui do mesmo jeito.
  if (nominal === null || desvioInf === null || desvioSup === null || desvioInf > desvioSup) {
    return { conforme: false, desvio, motivo: 'FAIXA_INVALIDA' };
  }
  // Depois a MEDIDA. Motivo distinto de proposito: faixa invalida e erro do cadastro do plano,
  // medida nao numerica e erro do payload da inspecao — quem chama devolve 400 por razoes
  // diferentes, e a mensagem para o usuario nao e a mesma.
  if (medido === null) {
    return { conforme: false, desvio: null, motivo: 'NAO_NUMERICO' };
  }

  const inf = nominal + desvioInf;
  const sup = nominal + desvioSup;

  if (medido < inf - EPS_TOLERANCIA) return { conforme: false, desvio, motivo: 'ABAIXO_MINIMO' };
  if (medido > sup + EPS_TOLERANCIA) return { conforme: false, desvio, motivo: 'ACIMA_MAXIMO' };
  return { conforme: true, desvio, motivo: null };
}

module.exports = { avaliarMedida, paraNumeroFinito, EPS_TOLERANCIA };
