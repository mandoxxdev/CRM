/**
 * Filtros de data da trilha de auditoria — Etapa 22, Task 2 (contrato C1, RN-03 e RN-04).
 *
 * Duas funcoes puras, sem banco e sem HTTP, separadas de `auditLabels.js` de proposito: um
 * arquivo traduz vocabulario, este resolve CALENDARIO E FUSO. Sao problemas diferentes.
 *
 * ── POR QUE `Date.parse` NAO SERVE PARA VALIDAR (RN-03) ─────────────────────────────────────
 *
 * `Date.parse('2026-02-30')` e VALIDO em JavaScript — rola para 02/03. E o SQLite faz o mesmo:
 * `date('2026-02-30','+1 day')` da `'2026-03-03'`. Entao aceitar essa data nao produz "lista
 * vazia", produz JANELA ALARGADA EM SILENCIO: uma consulta de fevereiro devolvendo tres dias de
 * marco, sem nada no corpo dizendo que a pergunta foi outra. Numa trilha de auditoria, resposta
 * errada com cara de resposta certa e o pior desfecho possivel.
 *
 * A regua que fecha e o IDA-E-VOLTA: reconstruir a data em UTC e exigir que ela imprima
 * exatamente o que entrou. `2026-02-30` volta como `2026-03-02` e cai; `2024-02-29` volta igual
 * e passa (ano bissexto continua valido, recusar seria falso positivo).
 *
 * ── POR QUE A JANELA NAO USA O FUSO DO PROCESSO (RN-04) ─────────────────────────────────────
 *
 * `created_at DATETIME DEFAULT CURRENT_TIMESTAMP` grava em UTC (medido: `date` = 19:45 -03 e
 * `CURRENT_TIMESTAMP` = '2026-08-28 22:45:51'). Quem filtra pensa em dia de Brasilia. Sem
 * conversao, um ato das 21:30 de 28/08 esta gravado como '2026-08-29 00:30' e SOME do filtro do
 * dia 28 — tres horas de todo fim de expediente invisiveis na trilha.
 *
 * A conversao poderia sair de graca com `new Date(ano, mes-1, dia)`, que usa o fuso do processo.
 * NAO E O QUE ESTA AQUI, e a diferenca importa: o default da maioria dos conteineres e TZ=UTC, e
 * la o atalho vira NO-OP — o defeito volta em producao com o teste verde na maquina do dev, que
 * e exatamente o modo de falha silenciosa que esta etapa existe para matar. O fuso do recorte e
 * o do NEGOCIO (o cliente tem um site so, no Brasil), nao o do host; por isso ele e uma
 * constante deste modulo, com parametro para quem precisar de outro.
 *
 * O calculo do offset vem do `Intl` (base de fuso do proprio Node), entao horario de verao —
 * abolido no Brasil em 2019, mas nao no mundo — e respeitado por data, sem tabela hardcoded.
 */

/**
 * Fuso do negocio. Constante, nao `process.env.TZ` — ver o cabecalho.
 */
const FUSO_PADRAO = 'America/Sao_Paulo';

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `{ ok }` — formato AAAA-MM-DD E data que existe no calendario.
 * Qualquer coisa que nao seja string (array vindo de `?data=a&data=b`, numero, null) e recusada
 * antes do regex: coagir com `String(v)` aqui deixaria `['2026-08-28']` passar.
 */
function validarData(valor) {
  if (typeof valor !== 'string' || !FORMATO_DATA.test(valor)) return { ok: false };
  const d = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { ok: false };
  return { ok: d.toISOString().slice(0, 10) === valor };
}

/**
 * Minutos que o fuso `zona` esta a frente do UTC NAQUELE instante (negativo no Brasil: -180).
 * Formata o instante na zona e compara com o mesmo relogio lido como se fosse UTC.
 */
function offsetMinutos(zona, instante) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instante);
  const p = {};
  for (const parte of partes) if (parte.type !== 'literal') p[parte.type] = parte.value;
  // `hour` pode vir '24' para meia-noite em algumas ICUs; `% 24` normaliza.
  const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return (comoUtc - instante.getTime()) / 60000;
}

/**
 * Instante UTC da meia-noite LOCAL de `dia` na `zona`, em 'AAAA-MM-DD HH:MM:SS' (o formato que a
 * coluna `created_at` guarda, comparavel como string).
 *
 * Duas passadas: a primeira estima o offset no instante errado, a segunda corrige. E o algoritmo
 * padrao para isto — sem ele, uma virada de horario de verao no proprio dia deslocaria o limite
 * em uma hora.
 */
function meiaNoiteLocalEmUtc(ano, mes, dia, zona) {
  const alvo = Date.UTC(ano, mes - 1, dia, 0, 0, 0);
  let instante = alvo - offsetMinutos(zona, new Date(alvo)) * 60000;
  instante = alvo - offsetMinutos(zona, new Date(instante)) * 60000;
  return new Date(instante).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * A janela do periodo, ja em UTC: `created_at >= de AND created_at < ate` (RN-04).
 *
 * `ate` e a meia-noite do dia SEGUINTE ao `data_fim`, o que torna o periodo inclusivo nos dois
 * extremos sem depender da resolucao da coluna. Limite aberto a direita, nunca
 * `<= data_fim + '23:59:59'`: um `created_at` com fracao de segundo cairia fora.
 *
 * Lado ausente devolve `null` — o chamador simplesmente nao acrescenta aquela clausula. As datas
 * DEVEM ter passado por `validarData` antes; aqui elas ja sao AAAA-MM-DD.
 */
function janelaUtc(dataInicio, dataFim, zona = FUSO_PADRAO) {
  let de = null;
  let ate = null;
  if (dataInicio) {
    const [a, m, d] = dataInicio.split('-').map(Number);
    de = meiaNoiteLocalEmUtc(a, m, d, zona);
  }
  if (dataFim) {
    const [a, m, d] = dataFim.split('-').map(Number);
    // `Date.UTC` normaliza o estouro de mes/ano dentro de `meiaNoiteLocalEmUtc`, entao
    // `dia + 1` = 32 vira o dia 1 do mes seguinte sem tratamento especial.
    ate = meiaNoiteLocalEmUtc(a, m, d + 1, zona);
  }
  return { de, ate };
}

module.exports = { validarData, janelaUtc, FUSO_PADRAO };
