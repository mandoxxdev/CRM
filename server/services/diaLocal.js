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

/**
 * Etapa 164 (RN-164.08, B1049): o inicio do *Periodo* das listas do Financeiro no calendario de Brasilia — 'mes' = dia 1 do mes,
 * 'trimestre' = dia 1 do trimestre, 'ano' = 1o de janeiro; qualquer outro valor = `null` (sem corte). Antes saia do `TZ` do processo.
 */
function inicioDoPeriodoLocalISO(periodo, agora = new Date()) {
  const hoje = hojeLocalISO(agora);
  const ano = hoje.slice(0, 4);
  const mes = Number(hoje.slice(5, 7));
  if (periodo === 'mes') return `${hoje.slice(0, 7)}-01`;
  if (periodo === 'trimestre') return `${ano}-${String(Math.floor((mes - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
  if (periodo === 'ano') return `${ano}-01-01`;
  return null;
}

/** O modificador do SQLite que leva um instante UTC ao relogio de Brasilia: `'-180 minutes'`. */
function modificadorDoFuso(agora = new Date()) {
  const { offsetMinutos, FUSO_PADRAO } = fuso();
  return `${Math.round(offsetMinutos(FUSO_PADRAO, agora))} minutes`;
}

/**
 * Etapa 162 (RN-162.09, B1039): o valor no formato do banco (`'AAAA-MM-DD HH:MM:SS'`, o `CURRENT_TIMESTAMP` em UTC) na hora de Brasilia,
 * no MESMO formato — a regua da tela dos Relatorios (`formatCelula` le esse formato como UTC). Qualquer outro valor (so data, ISO com
 * `Z`, numero, texto, nulo) volta como esta — e tambem a data impossivel (`2025-02-30 10:00:00`, que o V8 rolaria para marco) e o ano
 * antes de 1900 (o fuso historico do Intl da segundos tortos): Fase 5 r1/r2. Limite declarado: o texto livre (motivo, justificativa)
 * digitado exatamente nesse formato tambem e convertido — como na tela.
 */
const RE_INSTANTE_DO_BANCO = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
function instanteDoBancoNoFuso(valor) {
  if (typeof valor !== 'string' || !RE_INSTANTE_DO_BANCO.test(valor)) return valor;
  const d = new Date(`${valor.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1900 || d.toISOString().slice(0, 19).replace('T', ' ') !== valor) return valor;
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: fuso().FUSO_PADRAO, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(d);
}

module.exports = { hojeLocalISO, inicioDoMesLocalISO, inicioDoPeriodoLocalISO, modificadorDoFuso, instanteDoBancoNoFuso };
