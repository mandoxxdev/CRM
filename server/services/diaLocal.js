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

/**
 * Etapa 165 (RN-165.05, B1056): `'AAAA-MM-DD'` + `n` dias de calendario (`Date.UTC`, sem o `TZ` do processo). `n` que nao e inteiro
 * finito, dia que nao e `AAAA-MM-DD` valido ou resultado fora do calendario (ano < 1 ou > 9999) -> `null`.
 */
const RE_SO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
function somarDiasISO(dia, n) {
  const m = typeof dia === 'string' ? RE_SO_DATA.exec(dia) : null;
  if (!m || !Number.isInteger(n)) return null;
  const base = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(base.getTime()) || base.toISOString().slice(0, 10) !== dia) return null;
  const d = new Date(base.getTime() + n * 86400000);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1 || d.getUTCFullYear() > 9999) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Etapa 165 (RN-165.06, B1057): a data do banco como `'DD/MM/AAAA'` no dia de Brasilia — a capa do documento da proposta. Antes era
 * `new Date(v).toLocaleDateString('pt-BR')`: o `'AAAA-MM-DD HH:MM:SS'` UTC lido como hora LOCAL (a proposta criada das 21h a meia-noite
 * imprimia o dia seguinte) e o `'AAAA-MM-DD'` como meia-noite UTC (a vespera em UTC-3).
 *   - `'AAAA-MM-DD'` valido -> so reformatado (sem fuso);
 *   - `'AAAA-MM-DD HH:MM:SS'` valido (o `CURRENT_TIMESTAMP`, UTC) -> o dia de Brasilia;
 *   - ISO com `T` (com `Z`/deslocamento: o instante; sem: a hora do processo, o `new Date` de sempre) -> o dia de Brasilia;
 *   - data impossivel, ano < 1900, vazio, nulo, nao texto, lixo -> `''` (Fase 2 M11).
 */
const RE_INSTANTE_DO_BANCO_LIVRE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
function dataDoBancoBR(valor) {
  if (typeof valor !== 'string') return '';
  const v = valor.trim();
  const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  if (RE_SO_DATA.test(v)) {
    const ok = somarDiasISO(v, 0);
    return ok && Number(v.slice(0, 4)) >= 1900 ? br(v) : '';
  }
  let d = null;
  if (RE_INSTANTE_DO_BANCO_LIVRE.test(v)) {
    // Fase 5 r1 M2: tambem sem os segundos e com a fracao ('AAAA-MM-DD HH:MM', '…:SS.mmm' — como a tela le); a data impossivel nao rola
    d = new Date(`${v.replace(' ', 'T')}Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 16) !== v.slice(0, 16).replace(' ', 'T')) return '';
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
    d = new Date(v);
    // a data impossivel com T: o V8 rola ('2026-02-30T10:00Z' -> marco); o prefixo tem de ser um dia de verdade
    if (Number.isNaN(d.getTime()) || !somarDiasISO(v.slice(0, 10), 0)) return '';
  } else {
    return '';
  }
  const dia = hojeLocalISO(d);
  return Number(dia.slice(0, 4)) >= 1900 ? br(dia) : ''; // Fase 5 r1 M3: o ano de Brasilia, nao o UTC
}

module.exports = {
  hojeLocalISO, inicioDoMesLocalISO, inicioDoPeriodoLocalISO, modificadorDoFuso, instanteDoBancoNoFuso, somarDiasISO, dataDoBancoBR,
};
