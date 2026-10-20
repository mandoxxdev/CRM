/**
 * Etapa 161 (Fase 2 I2) — preload do `index.js` que um teste sobe como filho (`node -r relogioAdiantado.js index.js`), com
 * `RELOGIO_ADIANTADO_MS=<n>`: o relogio do JavaScript do processo anda `n` ms a frente; o do SQLite (`date('now')`) nao.
 *
 * Para que serve: o "hoje" de uma coluna so de data (a presenca, o prazo da OP) passou a vir do JavaScript (o dia de Brasilia), e
 * antes vinha do `date('now')` do SQLite (o dia UTC). Sem o adiantamento os dois coincidem fora das 21h-24h e a sabotagem (voltar ao
 * `date('now')`) passaria verde conforme a hora em que a suite roda. Com ele, divergem sempre.
 *
 * So `new Date()` sem argumento e `Date.now()` mudam; `new Date(x)`, `Date.UTC`, `Date.parse` e o `instanceof` continuam os de verdade.
 */
const DESLOCAMENTO = Number(process.env.RELOGIO_ADIANTADO_MS || 0);
if (DESLOCAMENTO) {
  const Real = Date;
  class Adiantado extends Real {
    constructor(...args) {
      if (args.length === 0) super(Real.now() + DESLOCAMENTO);
      else super(...args);
    }
    static now() { return Real.now() + DESLOCAMENTO; }
  }
  global.Date = Adiantado;
}
