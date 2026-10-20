/**
 * Etapa 161 (RN-161.04/06, C397) — o dia de Brasilia nas consultas.
 *
 * O banco guarda instantes em UTC (`CURRENT_TIMESTAMP`, `toISOString()`), e `date(col)` / `date('now')` do SQLite dao o dia UTC: das
 * 21h a meia-noite no Brasil, o dia de amanha. Duas ferramentas, uma para cada forma de coluna (Fase 2 da 161 — a forma decide):
 *
 *   - coluna de INSTANTE (`'AAAA-MM-DD HH:MM:SS'` UTC ou ISO com `Z`): `date(col, ?)` com `modificadorDoFuso()` (ex. '-180 minutes');
 *   - coluna so de DATA (`'AAAA-MM-DD'`, ja no dia local): compare com `hojeLocalISO()` — NUNCA aplique o modificador a ela
 *     (`date('2026-10-19', '-180 minutes')` = '2026-10-18').
 *
 * O fuso e a constante `FUSO_PADRAO` da Auditoria (`auditFiltros.js`), nao o `TZ` do processo nem o `'localtime'` do SQLite (que
 * segue o `TZ`: o Dockerfile o fixa, a maquina de teste nao). LIMITE declarado: o modificador e o deslocamento de AGORA, aplicado a
 * todas as linhas — o Brasil nao tem horario de verao desde 2019 (a mesma premissa da `auditFiltros.js`).
 *
 * `require` lazy da `auditFiltros` (constante do almoxarifado usada pelo nucleo) — a mesma convencao do `hojeLocalISO` de Compras,
 * que agora delega para este.
 */
function fuso() { return require('./almoxarifado/auditFiltros'); }

/** `AAAA-MM-DD` do dia de Brasilia em `agora`. */
function hojeLocalISO(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso().FUSO_PADRAO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
}

/** `AAAA-MM-01` do mes de Brasilia em `agora`. */
function inicioDoMesLocalISO(agora = new Date()) {
  return `${hojeLocalISO(agora).slice(0, 7)}-01`;
}

/** O modificador do SQLite que leva um instante UTC ao relogio de Brasilia: `'-180 minutes'`. */
function modificadorDoFuso(agora = new Date()) {
  const { offsetMinutos, FUSO_PADRAO } = fuso();
  return `${Math.round(offsetMinutos(FUSO_PADRAO, agora))} minutes`;
}

module.exports = { hojeLocalISO, inicioDoMesLocalISO, modificadorDoFuso };
