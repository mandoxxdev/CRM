/**
 * Etapa 74 (C121, feature 07 com a 08 e a 19) — a requisição que esperava fica com o material que chegou.
 *
 * Até a 74 a nota que dava entrada deixava o material LIVRE: quem era aprovado depois (inclusive pela
 * aprovação automática) reservava o que a requisição que esperava há semanas estava esperando, e o
 * e-mail da 70 prometia os mesmos 4 a todos os que esperavam. Agora, no fim do processamento da nota
 * (os dois `concluir*` do receiptService, ANTES do aviso — D1/B367), o que entrou LIVRE desta nota é
 * reservado para quem esperava, na ordem da fila de separação (`requisitionService.compararPrioridade`).
 *
 * Regras (plano, D2–D6 e a revisão da Fase 2, que vale sobre o texto original):
 *  - candidata: requisição ativa em `PODE_SEPARAR` (EM_SEPARACAO entra — o hold do item soma de volta no
 *    separável dela), item do material com `falta = pendente de ENTREGA − hold ATIVO do item` > 1e-9;
 *    pulada quando a avaliação de valor AO VIVO bloqueia (a mesma da fila da 64) ou quando a saída não
 *    passaria na regra do dono (material de cliente sem o projeto do dono — a entrega recusaria);
 *  - teto: `min(o que entrou livre desta nota do material, disponível do material agora)` — o retido
 *    para inspeção não entra, e a nota não distribui saldo que veio de ajuste/devolução (D4);
 *  - a falta é RELIDA imediatamente antes de cada `criarReserva`; depois, a requisição é relida (saiu da
 *    espera → a reserva é desfeita, RN-09) e a soma dos holds do item também (passou do pendente → o
 *    excesso desta chamada é desfeito: duas notas do mesmo material, ou nota × `/aprovar`);
 *  - o status acompanha (D5): só a requisição TOCADA (ficou com ≥ 1 reserva viva desta chamada) é
 *    recalculada, e só a partir de {APROVADO, AGUARDANDO_*, *_RESERVADA}, pela máquina.
 *
 * Requires de topo pelo OBJETO do módulo (os testes fazem monkeypatch de `stockService.criarReserva`).
 * Ninguém do lado deles requer este arquivo no topo, exceto o receiptService (sem ciclo — medido por
 * carga fria nas duas ordens); o stockService o requer LAZY, dentro do estorno (T3).
 */
const { dbGet, dbAll, dbRun } = require('./db');
const { disponivelSql } = require('./availabilitySql');
const stockService = require('./stockService');
const requisitionStateMachine = require('./requisitionStateMachine');
const requisitionService = require('./requisitionService');
const valueApprovalService = require('./requisitionValueApprovalService');
const ownerRules = require('./ownerRules');
const { QTD_DO_ITEM_SQL } = require('./receiptNotificationService');

const EPS = 1e-9;

// Quem pode ganhar reserva na chegada: tudo o que ainda pode separar (Fase 2: EM_SEPARACAO entra).
const STATUS_CANDIDATOS = requisitionStateMachine.PODE_SEPARAR;
// De onde o status é recalculado (Fase 2, crítico): EM_SEPARACAO e PARCIALMENTE_ATENDIDA já passaram da
// separação e mantêm o status; CANCELADO/REJEITADO/ENCERRADA nunca são ressuscitados.
// Etapa 74 (T3): quem "espera" para o estorno — a lista da 70 (PODE_SEPARAR sem EM_SEPARACAO).
const STATUS_QUE_ESPERAM = requisitionStateMachine.PODE_SEPARAR.filter((s) => s !== 'EM_SEPARACAO');
const STATUS_RECALCULAVEIS = ['APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA',
  requisitionStateMachine.STATUS_PARCIALMENTE_RESERVADA, requisitionStateMachine.STATUS_TOTALMENTE_RESERVADA];

const HOLD_DO_ITEM_SQL = `COALESCE((SELECT SUM(rs.quantidade - COALESCE(rs.quantidade_utilizada, 0))
    FROM reservas_material_almoxarifado rs
    WHERE rs.item_requisicao_id = ir.id AND rs.material_id = ir.material_id
      AND rs.status = 'ATIVA' AND rs.origem = 'REQUISICAO'), 0)`;

function num(v) { return Number(v) || 0; }
function pendenteDeEntrega(item) {
  const entregue = num(item.quantidade_entregue ?? item.quantidade_atendida);
  return Math.max(0, num(item.quantidade_solicitada) - entregue);
}

/** O item relido: pendente de entrega e o hold ATIVO dele (a régua da falta). */
async function lerItem(db, itemId) {
  return dbGet(db, `SELECT ir.id, ir.material_id, ir.quantidade_solicitada, ir.quantidade_entregue,
      ir.quantidade_atendida, ${HOLD_DO_ITEM_SQL} AS hold
    FROM itens_requisicao_almoxarifado ir WHERE ir.id = ?`, [itemId]);
}

async function liberarSemFalhar(db, user, reservaId, quantidade, motivo) {
  try {
    await stockService.liberarReserva(db, user, reservaId, quantidade, {
      statusFinal: 'LIBERADA',
      motivo,
      motivoMovimentacao: 'Liberação de reserva na chegada desfeita',
    });
    return true;
  } catch (e) {
    console.warn(`[almoxarifado-reservas] Falha ao desfazer a reserva ${reservaId} da chegada: ${e.message}`);
    return false;
  }
}

/** A saída da entrega passaria na regra do dono? (a entrega leva só o projeto — requisitionService). */
async function passaNaRegraDoDono(db, material, candidato) {
  if (!material.proprietario_cliente_id) return true;
  try {
    await ownerRules.assertSaidaPermitida(db, material, 'SAIDA', { projeto_id: candidato.projeto_id || undefined });
    return true;
  } catch (e) {
    return false;
  }
}

async function bloqueadaPorValor(db, candidato) {
  if (candidato.data_aprovacao_valor) return false;
  const avaliacao = await valueApprovalService.avaliarRequisicaoValor(db, candidato.requisicao_id);
  return !!(avaliacao && avaliacao.requer_aprovacao_valor);
}

/**
 * O status acompanha a reserva (D5 + Fase 2). Só parte de {APROVADO, AGUARDANDO_*, *_RESERVADA}; grava
 * só se a máquina aceitar a seta e a linha ainda estiver no status lido. Exportada: o estorno (T3) usa.
 * @returns {Promise<{requisicao_id, de, para}|null>} null quando nada mudou.
 */
async function recalcularStatusDeReserva(db, requisicaoId) {
  const req = await dbGet(db, 'SELECT id, status, ativo FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  if (!req || Number(req.ativo ?? 1) === 0 || !STATUS_RECALCULAVEIS.includes(req.status)) return null;
  const itens = await dbAll(db, `SELECT ir.id, ir.quantidade_solicitada, ir.quantidade_entregue, ir.quantidade_atendida,
      ${HOLD_DO_ITEM_SQL} AS hold
    FROM itens_requisicao_almoxarifado ir WHERE ir.requisicao_id = ?`, [requisicaoId]);
  const pendentes = itens.filter((i) => pendenteDeEntrega(i) > EPS);
  if (!pendentes.length) return null;
  let novo;
  if (pendentes.some((i) => num(i.hold) > EPS)) {
    novo = pendentes.every((i) => num(i.hold) >= pendenteDeEntrega(i) - EPS)
      ? requisitionStateMachine.STATUS_TOTALMENTE_RESERVADA
      : requisitionStateMachine.STATUS_PARCIALMENTE_RESERVADA;
  } else {
    novo = await requisitionStateMachine.calcularStatusPosAprovacao(db, requisicaoId);
  }
  if (novo === req.status) return null;
  if (!requisitionStateMachine.validarTransicao(req.status, novo).ok) return null;
  const r = await dbRun(db, `UPDATE requisicoes_almoxarifado SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = ?`, [novo, requisicaoId, req.status]);
  return r.changes ? { requisicao_id: Number(requisicaoId), de: req.status, para: novo } : null;
}

/**
 * @returns {Promise<{reservas: Array<{requisicao_id, item_id, material_id, reserva_id, quantidade}>,
 *   status: Array<{requisicao_id, de, para}>}>}
 * Lança só em erro de banco fora do try por item (quem chama engole) — e, mesmo então, o status das
 * requisições já tocadas é recalculado antes de relançar.
 */
async function reservarChegadaParaQuemEspera(db, user, recebimentoId) {
  const resultado = { reservas: [], status: [] };
  const rec = await dbGet(db, 'SELECT id, numero FROM recebimentos_material_almoxarifado WHERE id = ?', [recebimentoId]);
  if (!rec) return resultado;

  const itensNota = await dbAll(db, `SELECT ri.material_id, ${QTD_DO_ITEM_SQL} AS quantidade,
      COALESCE(ri.quantidade_em_inspecao, 0) AS em_inspecao
    FROM recebimentos_material_itens_almoxarifado ri
    WHERE ri.recebimento_id = ? AND ri.entrada_estoque_em IS NOT NULL AND ${QTD_DO_ITEM_SQL} > 0
    ORDER BY ri.id`, [recebimentoId]);
  const livrePorMaterial = new Map();
  for (const it of itensNota) {
    if (num(it.em_inspecao) > EPS) continue; // retido para inspeção não se reserva (RN-03)
    livrePorMaterial.set(it.material_id, (livrePorMaterial.get(it.material_id) || 0) + num(it.quantidade));
  }

  const tocadas = new Set();
  const marcasSt = STATUS_CANDIDATOS.map(() => '?').join(',');
  try {
    for (const [materialId, livre] of livrePorMaterial) {
      if (livre <= EPS) continue;
      // eslint-disable-next-line no-await-in-loop
      const material = await dbGet(db, `SELECT *, ${disponivelSql()} AS disponivel FROM materiais_almoxarifado WHERE id = ?`, [materialId]);
      if (!material) continue;
      let distribuivel = Math.min(livre, Math.max(0, num(material.disponivel)));
      if (distribuivel <= EPS) continue;

      // eslint-disable-next-line no-await-in-loop
      const candidatos = await dbAll(db, `SELECT ir.id AS item_id, ir.requisicao_id, ir.quantidade_solicitada,
          ir.quantidade_entregue, ir.quantidade_atendida, ${HOLD_DO_ITEM_SQL} AS hold,
          r.id, r.numero, r.status, r.urgencia, r.data_necessidade, r.created_at, r.projeto_id,
          r.os_referencia, r.cliente_id, r.data_aprovacao_valor
        FROM itens_requisicao_almoxarifado ir
        JOIN requisicoes_almoxarifado r ON r.id = ir.requisicao_id
        WHERE COALESCE(r.ativo, 1) = 1 AND r.status IN (${marcasSt}) AND ir.material_id = ?`,
      [...STATUS_CANDIDATOS, materialId]);
      const naFila = candidatos
        .filter((c) => pendenteDeEntrega(c) - num(c.hold) > EPS)
        .sort((a, b) => requisitionService.compararPrioridade(a, b) || (a.item_id - b.item_id));

      for (const c of naFila) {
        if (distribuivel <= EPS) break;
        // eslint-disable-next-line no-await-in-loop
        if (!(await passaNaRegraDoDono(db, material, c))) continue;
        // eslint-disable-next-line no-await-in-loop
        if (await bloqueadaPorValor(db, c)) continue;
        // A falta RELIDA agora (Fase 2): outra nota ou uma aprovação pode ter reservado no meio.
        // eslint-disable-next-line no-await-in-loop
        const item = await lerItem(db, c.item_id);
        const falta = item ? pendenteDeEntrega(item) - num(item.hold) : 0;
        if (falta <= EPS) continue;
        const q = Math.min(falta, distribuivel);

        let reserva;
        try {
          // eslint-disable-next-line no-await-in-loop
          reserva = await stockService.criarReserva(db, user, {
            material_id: materialId,
            quantidade: q,
            projeto_id: c.projeto_id || null,
            os_referencia: c.os_referencia || null,
            cliente_id: c.cliente_id || null,
            data_necessidade: c.data_necessidade || null,
            observacoes: `Reserva na chegada do recebimento ${rec.numero} — requisição ${c.numero}`,
          }, {
            sistema: true,
            requisicao_id: Number(c.requisicao_id),
            item_requisicao_id: c.item_id,
            recebimento_id: Number(recebimentoId),
            motivo: `Reserva na chegada — recebimento ${rec.numero}`,
          });
        } catch (e) {
          console.warn(`[almoxarifado-reservas] Falha ao reservar na chegada o item ${c.item_id} da requisição ${c.requisicao_id}: ${e.message}`);
          continue;
        }

        // RN-09: a requisição saiu da espera entre a leitura e a reserva (cancelada, excluída) → desfaz.
        // eslint-disable-next-line no-await-in-loop
        const atual = await dbGet(db, 'SELECT status, ativo FROM requisicoes_almoxarifado WHERE id = ?', [c.requisicao_id]);
        if (!atual || Number(atual.ativo ?? 1) === 0 || !STATUS_CANDIDATOS.includes(atual.status)) {
          // eslint-disable-next-line no-await-in-loop
          await liberarSemFalhar(db, user, reserva.id, null, 'Requisição saiu da espera durante a reserva na chegada');
          continue;
        }

        // Fase 2: o hold do item passou do pendente (corrida com outra nota / com a aprovação) → desfaz o excesso.
        let ficou = q;
        // eslint-disable-next-line no-await-in-loop
        const depois = await lerItem(db, c.item_id);
        const excesso = depois ? num(depois.hold) - pendenteDeEntrega(depois) : 0;
        if (excesso > EPS) {
          const devolver = Math.min(excesso, q);
          // eslint-disable-next-line no-await-in-loop
          if (await liberarSemFalhar(db, user, reserva.id, devolver >= q - EPS ? null : devolver,
            'Reserva na chegada acima do pendente — excesso desfeito')) {
            ficou = q - devolver;
          }
        }
        if (ficou <= EPS) continue;
        distribuivel -= ficou;
        tocadas.add(Number(c.requisicao_id));
        resultado.reservas.push({
          requisicao_id: Number(c.requisicao_id), item_id: c.item_id, material_id: materialId,
          reserva_id: reserva.id, quantidade: ficou,
        });
      }
    }
  } finally {
    for (const id of tocadas) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const mudou = await recalcularStatusDeReserva(db, id);
        if (mudou) resultado.status.push(mudou);
      } catch (e) {
        console.warn(`[almoxarifado-reservas] recalculo do status apos a reserva na chegada falhou (requisicao ${id}): ${e.message}`);
      }
    }
  }
  return resultado;
}

/**
 * Etapa 74 (T3, D8/B374 + Fase 2) — o estorno da ENTRADA_COMPRA desfaz a reserva que a PRÓPRIA nota criou,
 * só o necessário. Chamada LAZY pelo motor (`stockService.cancelarMovimentacao`) depois das guardas de
 * inspeção/reprovado/série e ANTES do claim. Sem isto, toda nota que atendeu alguém ficaria inestornável
 * ("material já consumido") até alguém liberar à mão — e liberar à mão deixa o status mentindo (C127).
 *
 * Regras: só reservas ATIVAS com `recebimento_id` desta movimentação e do material dela, de requisições
 * que ainda ESPERAM (`STATUS_QUE_ESPERAM` da 70) e não têm NADA separado na caixa (Fase 2: quem já separou
 * não perde a reserva no estorno); da última na ordem de prioridade para a primeira; só o que falta para
 * o estorno caber no disponível. Se nem liberando tudo o que pode o estorno caberia, não toca em nada (a
 * recusa da 71 acontece no ramo de entrada, intacta). Reservas da aprovação ou manuais nunca são tocadas.
 * @returns {Promise<number[]>} os ids das requisições que perderam reserva (o motor recalcula o status).
 */
async function liberarParaEstorno(db, user, mov) {
  const qtd = num(mov.quantidade);
  const mat = await dbGet(db, `SELECT ${disponivelSql()} AS disponivel FROM materiais_almoxarifado WHERE id = ?`, [mov.material_id]);
  const disp = num(mat && mat.disponivel);
  if (disp >= qtd - EPS) return [];

  const marcasSt = STATUS_QUE_ESPERAM.map(() => '?').join(',');
  const reservas = await dbAll(db, `SELECT rs.id AS reserva_id, rs.item_requisicao_id AS item_id,
      rs.quantidade - COALESCE(rs.quantidade_utilizada, 0) AS saldo,
      r.id, r.numero, r.urgencia, r.data_necessidade, r.created_at
    FROM reservas_material_almoxarifado rs
    JOIN requisicoes_almoxarifado r ON r.id = rs.requisicao_id
    WHERE rs.status = 'ATIVA' AND rs.origem = 'REQUISICAO' AND rs.recebimento_id = ? AND rs.material_id = ?
      AND COALESCE(r.ativo, 1) = 1 AND r.status IN (${marcasSt})
      AND NOT EXISTS (SELECT 1 FROM itens_requisicao_almoxarifado ix
        WHERE ix.requisicao_id = r.id
          AND COALESCE(ix.quantidade_separada, 0) - COALESCE(ix.quantidade_entregue, ix.quantidade_atendida, 0) > ${EPS})`,
  [mov.recebimento_id, mov.material_id, ...STATUS_QUE_ESPERAM]);
  const liberaveis = reservas.filter((x) => num(x.saldo) > EPS)
    .sort((a, b) => requisitionService.compararPrioridade(b, a) || (b.item_id - a.item_id));
  const total = liberaveis.reduce((s, x) => s + num(x.saldo), 0);
  if (disp + total < qtd - EPS) return [];

  const rec = await dbGet(db, 'SELECT numero FROM recebimentos_material_almoxarifado WHERE id = ?', [mov.recebimento_id]);
  let falta = qtd - disp;
  const tocadas = [];
  for (const r of liberaveis) {
    if (falta <= EPS) break;
    const q = Math.min(num(r.saldo), falta);
    try {
      // eslint-disable-next-line no-await-in-loop
      await stockService.liberarReserva(db, user, r.reserva_id, q >= num(r.saldo) - EPS ? null : q, {
        statusFinal: 'LIBERADA',
        motivo: `Estorno da entrada do recebimento ${rec ? rec.numero : mov.recebimento_id}`,
        motivoMovimentacao: 'Liberação por estorno da entrada',
      });
      falta -= q;
      if (!tocadas.includes(Number(r.id))) tocadas.push(Number(r.id));
    } catch (e) {
      console.warn(`[almoxarifado-reservas] Falha ao liberar a reserva ${r.reserva_id} no estorno da entrada: ${e.message}`);
    }
  }
  return tocadas;
}

module.exports = {
  reservarChegadaParaQuemEspera,
  recalcularStatusDeReserva,
  liberarParaEstorno,
  STATUS_RECALCULAVEIS,
};
