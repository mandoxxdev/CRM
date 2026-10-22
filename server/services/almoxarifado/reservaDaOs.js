/**
 * Etapa 171 (T2, RN-171.07/08/11/12) — a "reserva da OS": o que entrou livre de um pedido de compra com OS fica preso
 * para a OS, e so a requisicao DESSA OS o converte em reserva dela.
 *
 * PREDICADO CONGELADO (Revisao da Fase 2; a T3 e a aprovacao consomem): `status = 'ATIVA' AND origem = 'MANUAL'
 * AND os_id = ? AND recebimento_id IS NOT NULL`. A reserva nasce MANUAL (sem requisicao), com `os_id`, `os_referencia`
 * = numero da OS, `recebimento_id` da nota e sem `expira_em` (I2).
 *
 * A REQUISICAO NAO TEM `os_id` (medido na T2 — a Revisao da Fase 2 supunha `r.os_id`): `requisicoes_almoxarifado` so tem
 * `os_referencia`, texto livre que o solicitante digita ("Informe o numero da OS", `requisitionCreateService.exigirOS`).
 * "Requisicao da OS" e, portanto, `os_referencia` igual ao `numero_os` pela `chaveDaOs` (sem caixa, sem espaco nas
 * pontas, espacos internos colapsados, um prefixo "OS" opcional ignorado). Letra B da Etapa 171.
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
 * RN-171.08 — a OS ABERTA do pedido do recebimento: `{ id, numero_os }`, ou `null` (sem pedido, pedido de estoque, OS
 * fechada — `osFechada` da RN-171.03 —, OS que sumiu). `null` = comportamento de hoje (fila geral).
 */
async function osAbertaDoRecebimento(db, recebimentoId) {
  if (!recebimentoId) return null;
  let osId;
  try {
    const r = await dbGet(db, 'SELECT pedido_compra_id FROM recebimentos_material_almoxarifado WHERE id = ?', [recebimentoId]);
    osId = await osIdDoPedido(db, r && r.pedido_compra_id);
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
 * Cria a reserva da OS SOB A TRAVA que quem chama ja segura (nota, inspecao, NC — `criarReservaSemTrava`, nunca aninha).
 * I1: teto = min(quantidade, livre de caixa do material agora). Nunca lanca: falhou, `console.warn` e devolve null.
 * @returns {Promise<{reserva_id, material_id, os_id, quantidade}|null>}
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
    return { reserva_id: r.id, material_id: Number(materialId), os_id: os.id, quantidade: q };
  } catch (e) {
    console.warn(`[almoxarifado-reserva-os] Falha ao reservar o material ${materialId} para a OS ${os.numero_os} `
      + `(recebimento ${recebimentoId}): ${e.message}`);
    return null;
  }
}

/**
 * RN-171.12(b) — as reservas da OS do material que a requisicao (pela `os_referencia`) pode converter, mais antigas
 * primeiro. Le o numero AO VIVO (`ordens_servico`); sem a tabela/linha, o `os_referencia` gravado na reserva.
 */
async function reservasDaOsParaRequisicao(db, materialId, osReferencia) {
  if (!chaveDaOs(osReferencia)) return [];
  const linhas = await dbAll(db, `SELECT id, os_id, os_referencia, recebimento_id, material_id,
      quantidade - COALESCE(quantidade_utilizada, 0) AS saldo
    FROM reservas_material_almoxarifado
    WHERE status = 'ATIVA' AND origem = 'MANUAL' AND os_id IS NOT NULL AND recebimento_id IS NOT NULL AND material_id = ?
    ORDER BY id`, [materialId]);
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
    if (requisicaoEhDaOs(osReferencia, numero)) out.push({ ...l, numero_os: numero, saldo: num(l.saldo) });
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
  osIdDoPedido,
  osAbertaDoRecebimento,
  jaReservadoDaNotaParaOs,
  reservarParaOsSobTrava,
  reservasDaOsParaRequisicao,
  recriarReservaDaOs,
};
