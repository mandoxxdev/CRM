/**
 * Etapa 171 (T3) — a OS encerrada solta o material que a compra dela prendeu, e a OS com pedido de compra nao se apaga.
 *
 *   RN-171.09 (com C2 e I7 da revisao da Fase 2): quando o `PUT` da OS muda o status de fora para dentro do conjunto fechado
 *             (`pedidoCompraService.STATUS_OS_FECHADA`: cancelado, cancelada, concluido, concluida, encerrada), as reservas da OS
 *             que a chegada criou (o predicado congelado abaixo) sao liberadas — `LIBERADA`, motivo
 *             `OS <numero_os> <status> — material volta ao estoque`. A reserva liberada e a movimentacao continuam com o `os_id`
 *             (decisao 2 do Andre: o material vira estoque, mas fica marcado). Depois, FORA de qualquer trava, o liberado e
 *             distribuido para a fila que espera (I7) pela porta que ja existe e pega a trava sozinha.
 *   RN-171.10: `pedidosDaOs` lista os pedidos de compra com aquele `os_id` (a rota de exclusao recusa com 409 se houver).
 *
 * Liberar sem distribuir NAO pega a trava por material (CLAUDE.md, B441): so aumenta o livre; quem reserva sob a trava, no pior
 * caso, ve menos do que ha. A redistribuicao e outra historia — ela LE o disponivel para reservar, entao pega a trava: por isso
 * vai pela `reservarLiberacaoParaQuemEspera` SEM `sobTrava` (ela trava o material, le o teto `min(liberado, disponivel)` dentro
 * da secao, distribui e recalcula o status das requisicoes tocadas depois de soltar). Quem chama este servico nao pode estar
 * dentro de uma secao da trava (ela nao e reentrante).
 *
 * Requires pelo OBJETO do modulo (os testes fazem monkeypatch).
 */
const { dbGet, dbAll } = require('./db');
const stockService = require('./stockService');
const reservaChegadaService = require('./reservaChegadaService');

const EPS = 1e-9;

// Predicado congelado da "reserva da OS" (revisao da Fase 2 do plano da 171): a T2 cria, a T3 e a aprovacao consomem.
// Etapa 176 (RN-176.06, M5): UMA definicao so — a de `reservaDaOs.js` (`PREDICADO_RESERVA_DA_OS_SQL`), reexportada aqui com o
// nome de sempre para nao quebrar quem importa. Ate a 176 havia uma copia literal aqui, que divergiria na primeira edicao.
const { PREDICADO_RESERVA_DA_OS_SQL: PREDICADO_RESERVA_DA_OS } = require('./reservaDaOs');

function osFechada(status) {
  // eslint-disable-next-line global-require
  return require('../compras/pedidoCompraService').osFechada(status);
}

/** RN-171.09: so a TRANSICAO de fora para dentro do conjunto fechado solta (ja-cancelada -> cancelado nao solta de novo). */
function entrouNoFechado(statusAnterior, statusNovo) {
  return osFechada(statusNovo) && !osFechada(statusAnterior);
}

function motivoDaLiberacao(numeroOs, statusNovo) {
  return `OS ${numeroOs} ${String(statusNovo || '').trim()} — material volta ao estoque`;
}

/**
 * @returns {Promise<number>} quantas reservas foram liberadas. Se alguma liberacao falhar, as outras seguem, a redistribuicao
 *   do que foi liberado acontece mesmo assim e, no fim, lanca um erro com `liberadas` (quantas de fato foram) e `falhas` —
 *   quem chama decide como avisar (a rota da OS responde 200 com o aviso: o UPDATE da OS ja foi gravado).
 */
async function liberarReservasDaOs(db, user, osId, statusNovo) {
  if (!osFechada(statusNovo)) return 0;
  const os = await dbGet(db, 'SELECT id, numero_os FROM ordens_servico WHERE id = ?', [osId]);
  const numeroOs = os && os.numero_os ? os.numero_os : `#${osId}`;
  const motivo = motivoDaLiberacao(numeroOs, statusNovo);

  const reservas = await dbAll(db, `SELECT id, material_id, recebimento_id FROM reservas_material_almoxarifado
    WHERE ${PREDICADO_RESERVA_DA_OS} ORDER BY id`, [osId]);

  let liberadas = 0;
  const falhas = [];
  const soltoPorOrigem = new Map(); // `${material}|${recebimento}` -> { material_id, recebimento_id, quantidade }
  for (const r of reservas) {
    let out;
    try {
      // eslint-disable-next-line no-await-in-loop
      out = await stockService.liberarReserva(db, user, r.id, null, {
        statusFinal: 'LIBERADA', motivo, motivoMovimentacao: motivo,
      });
    } catch (e) {
      // Outro gesto a soltou no meio (dois PUTs cancelando juntos, a liberacao manual, a aprovacao da requisicao da OS — C1):
      // nao e falha desta OS, so nao e contada nem redistribuida aqui (quem soltou cuida do que soltou).
      // eslint-disable-next-line no-await-in-loop
      const agora = await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [r.id]).catch(() => null);
      if (agora && agora.status !== 'ATIVA') continue;
      console.warn(`[almoxarifado-os] falha ao liberar a reserva ${r.id} da OS ${numeroOs}: ${e.message}`);
      falhas.push({ reserva_id: r.id, erro: e.message });
      continue;
    }
    liberadas += 1;
    const chave = `${r.material_id}|${r.recebimento_id}`;
    const acc = soltoPorOrigem.get(chave) || { material_id: r.material_id, recebimento_id: r.recebimento_id, quantidade: 0 };
    acc.quantidade += Number(out && out.quantidade_liberada) || 0;
    soltoPorOrigem.set(chave, acc);
  }

  // I7: o que soltou vai para quem espera. Por material e nota de origem (a reserva da fila fica marcada com a nota — o estorno
  // da entrada a solta pela B374, como a da inspecao). Best-effort: a OS ja mudou e o saldo ja voltou ao livre.
  for (const solto of soltoPorOrigem.values()) {
    if (!(solto.quantidade > EPS)) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await reservaChegadaService.reservarLiberacaoParaQuemEspera(db, user, {
        origem: 'OS_ENCERRADA',
        documento_id: Number(osId),
        documento_numero: numeroOs,
        material_id: solto.material_id,
        quantidade: solto.quantidade,
        recebimento_id: solto.recebimento_id,
      });
    } catch (e) {
      console.warn(`[almoxarifado-os] redistribuicao apos a OS ${numeroOs} falhou (material ${solto.material_id}): ${e.message}`);
    }
  }

  if (falhas.length) {
    throw Object.assign(new Error(`${falhas.length} reserva(s) da OS ${numeroOs} não foram liberadas: ${falhas.map((f) => f.erro).join('; ')}`),
      { liberadas, falhas });
  }
  return liberadas;
}

/** Os numeros dos pedidos de compra vinculados a OS (RN-171.10), na ordem de criacao. */
async function pedidosDaOs(db, osId) {
  const linhas = await dbAll(db, 'SELECT id, numero FROM pedidos_compra WHERE os_id = ? ORDER BY id', [osId]);
  return linhas.map((l) => l.numero || `#${l.id}`);
}

function recusaExclusaoComPedido(numeroOs, numerosPedidos) {
  return `A OS ${numeroOs} tem pedido de compra vinculado (${numerosPedidos.join(', ')}) — cancele a OS em vez de excluir`;
}

module.exports = {
  liberarReservasDaOs,
  pedidosDaOs,
  recusaExclusaoComPedido,
  entrouNoFechado,
  motivoDaLiberacao,
  PREDICADO_RESERVA_DA_OS,
};
