/**
 * Etapa 171 (T2, RN-171.07/08/11/12) — a "reserva da OS": o que entrou livre de um pedido de compra com OS fica preso
 * para a OS, e so a requisicao DESSA OS o converte em reserva dela.
 *
 * PREDICADO CONGELADO (Revisao da Fase 2; a T3 e a aprovacao consomem): `status = 'ATIVA' AND origem = 'MANUAL'
 * AND os_id = ? AND recebimento_id IS NOT NULL`. A reserva nasce MANUAL (sem requisicao), com `os_id`, `os_referencia`
 * = numero da OS, `recebimento_id` da nota e sem `expira_em` (I2).
 *
 * "Requisicao da OS" (Etapa 172, RN-172.04 — `requisicaoCasaComOs`): a requisicao COM `os_id` (a OS cadastrada, opcional,
 * desde a Etapa 172) casa SO pelo id; SEM `os_id` (as antigas e quem so digitou) casa como na 171: `os_referencia` igual
 * ao `numero_os` pela `chaveDaOs` (sem caixa, sem espaco nas pontas, espacos internos colapsados, um prefixo "OS"
 * opcional ignorado). ESTAVA DESATUALIZADO aqui ate a 172: "A REQUISICAO NAO TEM `os_id`" era verdade so ate a coluna
 * nascer (`requisicoes_almoxarifado.os_id`, Etapa 172 T1); o casamento pelo texto e agora so o fallback.
 *
 * Modulo sem ciclo: requer `db`, `stockService`, `caixaSql`, `quantidade`; o `pedidoCompraService` (Compras) e lido
 * LAZY (`osFechada`), so quando o pedido tem OS.
 */
const { dbGet, dbAll } = require('./db');
const stockService = require('./stockService');
const caixaSql = require('./caixaSql');
const Q = require('./quantidade');

const EPS = 1e-9;
const PREDICADO_RESERVA_DA_OS_SQL = "status = 'ATIVA' AND origem = 'MANUAL' AND os_id = ? AND recebimento_id IS NOT NULL";

function num(v) { return Number(v) || 0; }

const motivoReservaDaOs = (numeroOs) => `Compra para a OS ${numeroOs}`;

/** A chave de comparacao de um numero de OS (texto livre da requisicao x `ordens_servico.numero_os`). */
function chaveDaOs(texto) {
  let t = String(texto == null ? '' : texto).trim().toLowerCase().replace(/\s+/g, ' ');
  const semPrefixo = t.replace(/^os(?:\s*[#:-]\s*|\s+)/, '');
  if (semPrefixo && semPrefixo !== t) t = semPrefixo;
  return t;
}

/** A requisicao (pela `os_referencia`) e da OS de numero `numeroOs`? Vazio nunca e. */
function requisicaoEhDaOs(osReferencia, numeroOs) {
  const a = chaveDaOs(osReferencia);
  return !!a && a === chaveDaOs(numeroOs);
}

const temOsId = (osId) => osId !== null && osId !== undefined && osId !== '';

/**
 * Etapa 172 (RN-172.04, I3) — a requisicao `{ osId, osReferencia }` e da OS `{ id, numero_os }`? Com `osId`: so pelo id
 * (o texto nao conta — nem para casar com outra OS de numero parecido, nem para deixar de casar). Sem `osId`: pelo texto
 * (`requisicaoEhDaOs`, a regua da 171).
 */
function requisicaoCasaComOs({ osId, osReferencia } = {}, os) {
  if (!os) return false;
  if (temOsId(osId)) return Number(osId) === Number(os.id);
  return requisicaoEhDaOs(osReferencia, os.numero_os);
}

function avisoSeNaoForTabelaAusente(onde, e) {
  if (!/no such (table|column)/i.test(String(e && e.message))) {
    console.warn(`[almoxarifado-reserva-os] ${onde} falhou: ${e.message}`);
  }
}

/**
 * RN-171.07 — o `os_id` do pedido de compra (gravado na ENTRADA_COMPRA mesmo com a OS fechada: e a marca de origem).
 * `null` sem pedido, pedido sem OS, ou base sem a coluna (harness com DDL propria de `pedidos_compra`).
 */
async function osIdDoPedido(db, pedidoId) {
  if (!pedidoId) return null;
  try {
    const p = await dbGet(db, 'SELECT os_id FROM pedidos_compra WHERE id = ?', [pedidoId]);
    return p && p.os_id ? Number(p.os_id) : null;
  } catch (e) {
    avisoSeNaoForTabelaAusente('leitura da OS do pedido', e);
    return null;
  }
}

/**
 * Etapa 176 (C1 + I1 da Revisao da Fase 2) — a OS EFETIVA do recebimento, UMA regua so para quem a le (criacao, `/fiscal`,
 * a entrada da nota, a reserva da chegada/inspecao/NC, as leituras): com `pedido_compra_id` GRAVADO (nao o `tipo`) -> a OS
 * VIVA do pedido (trocar a OS do pedido antes do processamento continua valendo, como na 171); sem pedido -> o `os_id`
 * proprio do recebimento (a NF de material de cliente para industrializacao). Recebimento de pedido nao grava `os_id`
 * proprio (a criacao e o `/fiscal` garantem). `rec` = a linha (`SELECT *`); devolve o id ou `null`. Nao confere se a OS
 * existe nem se esta aberta (isso e de `osAbertaDoRecebimento`).
 */
async function osDoRecebimento(db, rec) {
  if (!rec) return null;
  if (rec.pedido_compra_id) return osIdDoPedido(db, rec.pedido_compra_id);
  return temOsId(rec.os_id) ? Number(rec.os_id) : null;
}

/**
 * RN-171.08 — a OS ABERTA do recebimento: `{ id, numero_os }`, ou `null` (sem OS, pedido de estoque, OS fechada —
 * `osFechada` da RN-171.03 —, OS que sumiu). `null` = comportamento de hoje (fila geral). Etapa 176 (RN-176.05, I2): a OS
 * vem de `osDoRecebimento` (o pedido primeiro, senao a OS propria da nota sem pedido) — ate a 176 era so a do pedido.
 */
async function osAbertaDoRecebimento(db, recebimentoId) {
  if (!recebimentoId) return null;
  let osId;
  try {
    const r = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recebimentoId]);
    osId = await osDoRecebimento(db, r);
  } catch (e) {
    avisoSeNaoForTabelaAusente('leitura do pedido do recebimento', e);
    return null;
  }
  if (!osId) return null;
  try {
    const os = await dbGet(db, 'SELECT id, numero_os, status FROM ordens_servico WHERE id = ?', [osId]);
    if (!os) return null;
    // eslint-disable-next-line global-require
    const { osFechada } = require('../compras/pedidoCompraService');
    if (osFechada(os.status)) return null;
    return { id: Number(os.id), numero_os: os.numero_os || `#${os.id}` };
  } catch (e) {
    avisoSeNaoForTabelaAusente('leitura da OS do recebimento', e);
    return null;
  }
}

/**
 * I3 — o que esta nota JA reservou deste material na rodada da OS: reservas (qualquer status) com o `recebimento_id` e o
 * material, de origem REQUISICAO (no modo OS a fila geral nao leva nada, entao toda reserva de requisicao da nota e de
 * requisicao da OS) ou MANUAL da OS. Pela quantidade ORIGINAL (a movimentacao RESERVA): a liberacao parcial (conversao
 * na aprovacao, excesso desfeito) reduz `quantidade` da linha e faria a retomada reservar de novo.
 */
async function jaReservadoDaNotaParaOs(db, recebimentoId, materialId, osId) {
  const row = await dbGet(db, `SELECT COALESCE(SUM(COALESCE((SELECT SUM(mv.quantidade) FROM movimentacoes_almoxarifado mv
        WHERE mv.reserva_id = rs.id AND mv.tipo = 'RESERVA'), rs.quantidade)), 0) AS total
    FROM reservas_material_almoxarifado rs
    WHERE rs.recebimento_id = ? AND rs.material_id = ?
      AND (rs.origem = 'REQUISICAO' OR (rs.origem = 'MANUAL' AND rs.os_id = ?))`, [recebimentoId, materialId, osId]);
  return num(row && row.total);
}

/**
 * Etapa 171 (Fase 5) — a OS pode fechar (o `PUT` da OS: `UPDATE` do status + `liberarReservasDaOs`) entre a leitura da OS
 * aberta e a criacao da reserva da OS: o cancelamento nao pega a trava (liberar nao pega, B441), entao roda no meio, nao ve
 * a reserva que ainda nao existe, e a reserva nascia ATIVA, sem expiracao, para uma OS fechada — presa para sempre (sonda
 * sonda-toctou; 1 reserva ATIVA de 10, OS cancelado). Por isso quem CRIA a reserva da OS relê a OS DEPOIS de criar: fechada
 * ou sumida, solta na hora com o motivo da OS encerrada (`OS <numero> <status> — material volta ao estoque`, o mesmo do
 * osEncerradaService). Fecha a janela: o cancelamento grava o status ANTES de procurar as reservas; se ele procurou antes
 * desta criacao, o status ja estava gravado e esta releitura o ve; se procurou depois, ele mesmo a solta (e o
 * `liberarReserva` daqui perde o claim — tolerado, sem desconto em dobro).
 * Sem trava nova: liberar nao pega (quem chama pode estar sob a trava do material ou nao). Nunca lanca.
 * @returns {Promise<boolean>} true se ESTA chamada soltou a reserva (quem chama pode redistribuir o que soltou).
 */
async function soltarSeOsFechou(db, user, reservaId, osId, numeroOs) {
  let os;
  try {
    os = await dbGet(db, 'SELECT status FROM ordens_servico WHERE id = ?', [osId]);
  } catch (e) {
    avisoSeNaoForTabelaAusente('releitura da OS depois de reservar', e);
    return false;
  }
  // eslint-disable-next-line global-require
  const { osFechada } = require('../compras/pedidoCompraService');
  if (os && !osFechada(os.status)) return false;
  // eslint-disable-next-line global-require
  const { motivoDaLiberacao } = require('./osEncerradaService');
  const motivo = motivoDaLiberacao(numeroOs, os ? os.status : 'excluída');
  try {
    await module.exports.liberarDaOsFechada(db, user, reservaId, motivo);
    return true;
  } catch (e) {
    const agora = await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [reservaId]).catch(() => null);
    if (!(agora && agora.status !== 'ATIVA')) {
      console.warn(`[almoxarifado-reserva-os] a OS ${numeroOs} fechou e a reserva ${reservaId} nao foi solta: ${e.message}`);
    }
    return false;
  }
}

/** Pelo objeto do modulo (o controle positivo da Fase 5 o desliga). */
function liberarDaOsFechada(db, user, reservaId, motivo) {
  return stockService.liberarReserva(db, user, reservaId, null, { statusFinal: 'LIBERADA', motivo, motivoMovimentacao: motivo });
}

/**
 * Cria a reserva da OS SOB A TRAVA que quem chama ja segura (nota, inspecao, NC — `criarReservaSemTrava`, nunca aninha).
 * I1: teto = min(quantidade, livre de caixa do material agora). Nunca lanca: falhou, `console.warn` e devolve null.
 * Fase 5: se a OS fechou no meio, a reserva sai ja LIBERADA e o retorno traz `solta_os_fechada: true`.
 * @returns {Promise<{reserva_id, material_id, os_id, quantidade, solta_os_fechada?}|null>}
 */
async function reservarParaOsSobTrava(db, user, { materialId, quantidade, os, recebimentoId }) {
  if (!(num(quantidade) > EPS) || !os) return null;
  try {
    const m = await dbGet(db, `SELECT ${caixaSql.livreDeCaixaSql()} AS livre FROM materiais_almoxarifado WHERE id = ?`, [materialId]);
    const q = Q.qtd(Math.min(num(quantidade), Math.max(0, num(m && m.livre))));
    if (!(q > EPS)) return null;
    const motivo = motivoReservaDaOs(os.numero_os);
    const r = await stockService.criarReservaSemTrava(db, user, {
      material_id: materialId, quantidade: q, os_id: os.id, os_referencia: os.numero_os, observacoes: motivo,
    }, { sistema: true, recebimento_id: recebimentoId, motivo, semExpiracao: true });
    // Fase 5: a OS fechou no meio -> solta agora; quem chama devolve o soltado a fila geral (a OS fechada e a de hoje).
    if (await soltarSeOsFechou(db, user, r.id, os.id, os.numero_os)) {
      return { reserva_id: r.id, material_id: Number(materialId), os_id: os.id, quantidade: q, solta_os_fechada: true };
    }
    return { reserva_id: r.id, material_id: Number(materialId), os_id: os.id, quantidade: q };
  } catch (e) {
    console.warn(`[almoxarifado-reserva-os] Falha ao reservar o material ${materialId} para a OS ${os.numero_os} `
      + `(recebimento ${recebimentoId}): ${e.message}`);
    return null;
  }
}

/**
 * RN-171.12(b) — as reservas da OS do material que a requisicao pode converter, mais antigas primeiro. Le o numero AO VIVO
 * (`ordens_servico`); sem a tabela/linha, o `os_referencia` gravado na reserva.
 * Etapa 172 (RN-172.04, I3): recebe `{ osId, osReferencia }` da requisicao (era so o texto). Com `osId`, so as reservas
 * DESSA OS (`os_id = ?`; o texto nao conta); sem `osId`, o casamento pelo texto da 171.
 */
async function reservasDaOsParaRequisicao(db, materialId, { osId = null, osReferencia = null } = {}) {
  const porId = temOsId(osId);
  if (!porId && !chaveDaOs(osReferencia)) return [];
  const linhas = await dbAll(db, `SELECT id, os_id, os_referencia, recebimento_id, material_id,
      quantidade - COALESCE(quantidade_utilizada, 0) AS saldo
    FROM reservas_material_almoxarifado
    WHERE status = 'ATIVA' AND origem = 'MANUAL' AND os_id IS NOT NULL AND recebimento_id IS NOT NULL AND material_id = ?
      ${porId ? 'AND os_id = ?' : ''}
    ORDER BY id`, porId ? [materialId, Number(osId)] : [materialId]);
  const numeroDa = new Map();
  const out = [];
  for (const l of linhas) {
    if (!(num(l.saldo) > EPS)) continue;
    if (!numeroDa.has(l.os_id)) {
      let numero = l.os_referencia;
      try {
        // eslint-disable-next-line no-await-in-loop
        const os = await dbGet(db, 'SELECT numero_os FROM ordens_servico WHERE id = ?', [l.os_id]);
        if (os && os.numero_os) numero = os.numero_os;
      } catch (e) {
        avisoSeNaoForTabelaAusente('leitura do numero da OS', e);
      }
      numeroDa.set(l.os_id, numero);
    }
    const numero = numeroDa.get(l.os_id);
    if (requisicaoCasaComOs({ osId, osReferencia }, { id: l.os_id, numero_os: numero })) out.push({ ...l, numero_os: numero, saldo: num(l.saldo) });
  }
  return out;
}

/**
 * Recria uma reserva da OS que foi convertida/liberada e o gesto nao aconteceu (aprovacao que perdeu, reserva da
 * requisicao que falhou, estorno recusado). Pelo `criarReserva` (com `naTravaDoMaterial`: dentro da secao que segura o
 * material roda direto; fora dela pega a trava). Nunca lanca.
 */
async function recriarReservaDaOs(db, user, { material_id: materialId, quantidade, os_id: osId, numero_os: numeroOs,
  recebimento_id: recebimentoId }, motivoRecriacao) {
  try {
    const r = await stockService.criarReserva(db, user, {
      material_id: materialId, quantidade, os_id: osId, os_referencia: numeroOs,
      observacoes: `${motivoReservaDaOs(numeroOs)} — ${motivoRecriacao}`,
    }, { sistema: true, recebimento_id: recebimentoId, motivo: motivoReservaDaOs(numeroOs), semExpiracao: true });
    // Fase 5: a OS fechou entre soltar a original e recriar (estorno recusado, aprovacao que perdeu, excesso) -> solta agora.
    if (await soltarSeOsFechou(db, user, r.id, osId, numeroOs)) return null;
    return r.id;
  } catch (e) {
    console.warn(`[almoxarifado-reserva-os] Falha ao recriar a reserva da OS ${numeroOs} (material ${materialId}, `
      + `${quantidade}): ${e.message}`);
    return null;
  }
}

module.exports = {
  PREDICADO_RESERVA_DA_OS_SQL,
  motivoReservaDaOs,
  chaveDaOs,
  requisicaoEhDaOs,
  requisicaoCasaComOs,
  osIdDoPedido,
  osDoRecebimento,
  osAbertaDoRecebimento,
  jaReservadoDaNotaParaOs,
  reservarParaOsSobTrava,
  reservasDaOsParaRequisicao,
  recriarReservaDaOs,
  soltarSeOsFechou,
  liberarDaOsFechada,
};
