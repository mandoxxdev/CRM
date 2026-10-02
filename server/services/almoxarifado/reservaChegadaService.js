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
 *    (`receiptNotificationService.faltaDoItem` — Etapa 75, Fase 5: a mesma regua dos dois avisos);
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
const receiptNotificationService = require('./receiptNotificationService');

const { QTD_DO_ITEM_SQL, faltaDoItem } = receiptNotificationService;

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

async function liberarSemFalhar(db, user, reservaId, quantidade, motivo, rotulos) {
  try {
    await stockService.liberarReserva(db, user, reservaId, quantidade, {
      statusFinal: 'LIBERADA',
      motivo,
      motivoMovimentacao: rotulos.motivoDesfazer,
    });
    return true;
  } catch (e) {
    console.warn(rotulos.falhaDesfazer(reservaId, e));
    return false;
  }
}

/**
 * Etapa 75 (T0, D2/B384 + Fase 2) — os textos que o miolo grava ou escreve no log. Os da chegada (74) são
 * os valores de sempre (os testes da 74 não mudam); a liberação da inspeção/NC (75) passa os seus. Fase 2:
 * não só a observação e o motivo — o aviso por item, o desfazer e o recálculo também, senão uma falha na
 * liberação da inspeção apareceria no log como "falha ao reservar NA CHEGADA".
 */
function rotulosDaChegada(rec) {
  return {
    recebimento_id: Number(rec.id),
    observacao: (c) => `Reserva na chegada do recebimento ${rec.numero} — requisição ${c.numero}`,
    motivo: `Reserva na chegada — recebimento ${rec.numero}`,
    falhaReserva: (c, e) => `[almoxarifado-reservas] Falha ao reservar na chegada o item ${c.item_id} da requisição ${c.requisicao_id}: ${e.message}`,
    motivoDesfazer: 'Liberação de reserva na chegada desfeita',
    falhaDesfazer: (reservaId, e) => `[almoxarifado-reservas] Falha ao desfazer a reserva ${reservaId} da chegada: ${e.message}`,
    saiuDaEspera: 'Requisição saiu da espera durante a reserva na chegada',
    excessoDesfeito: 'Reserva na chegada acima do pendente — excesso desfeito',
    falhaRecalculo: (id, e) => `[almoxarifado-reservas] recalculo do status apos a reserva na chegada falhou (requisicao ${id}): ${e.message}`,
  };
}

/** A saída da entrega passaria na regra do dono? (a entrega leva só o projeto — requisitionService). */
async function passaNaRegraDoDono(db, material, candidato) {
  // Etapa 75 (Fase 5): a mesma pergunta que os dois avisos fazem (ownerRules.saidaPassaNaRegraDoDono).
  return ownerRules.saidaPassaNaRegraDoDono(db, material, candidato.projeto_id);
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

  // Etapa 75 (D8/B390): o item que JÁ TEM inspeção registrada também fica de fora — depois da decisão o
  // `quantidade_em_inspecao` dele é 0 e, sem este filtro, a retomada da nota contava o item inteiro como
  // livre (inclusive o reprovado) e completava com saldo alheio (Fase 0, Surpresa 2: aprovou 1, reservou
  // 4). O que a inspeção liberou é distribuído pela porta da inspeção (`reservarLiberacaoParaQuemEspera`).
  const itensNota = await dbAll(db, `SELECT ri.material_id, ${QTD_DO_ITEM_SQL} AS quantidade,
      COALESCE(ri.quantidade_em_inspecao, 0) AS em_inspecao
    FROM recebimentos_material_itens_almoxarifado ri
    WHERE ri.recebimento_id = ? AND ri.entrada_estoque_em IS NOT NULL AND ${QTD_DO_ITEM_SQL} > 0
      AND NOT EXISTS (SELECT 1 FROM inspecoes_recebimento_almoxarifado i WHERE i.recebimento_item_id = ri.id)
    ORDER BY ri.id`, [recebimentoId]);
  const livrePorMaterial = new Map();
  for (const it of itensNota) {
    if (num(it.em_inspecao) > EPS) continue; // retido para inspeção não se reserva (RN-03)
    livrePorMaterial.set(it.material_id, (livrePorMaterial.get(it.material_id) || 0) + num(it.quantidade));
  }

  const rotulos = rotulosDaChegada(rec);
  const acc = { tocadas: new Set(), resultado };
  try {
    for (const [materialId, livre] of livrePorMaterial) {
      // eslint-disable-next-line no-await-in-loop
      await distribuirParaQuemEspera(db, user, materialId, livre, rotulos, acc);
    }
  } finally {
    await recalcularTocadas(db, acc, rotulos);
  }
  return resultado;
}

/** O status das requisições tocadas acompanha (D5 da 74); cada uma no seu try. */
async function recalcularTocadas(db, acc, rotulos) {
  for (const id of acc.tocadas) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const mudou = await recalcularStatusDeReserva(db, id);
      if (mudou) acc.resultado.status.push(mudou);
    } catch (e) {
      console.warn(rotulos.falhaRecalculo(id, e));
    }
  }
}

/**
 * Etapa 75 (T0, D2/B384) — o laço por material da 74, extraído com o TETO injetado: a chegada passa o que
 * entrou livre desta nota; a liberação da inspeção/NC passa o que a decisão liberou. A régua de "quem
 * esperava" (candidatas, ordem, regra do dono, valor ao vivo, falta relida, desfazer) é uma só.
 * O teto é sempre limitado pelo disponível do material AGORA (D4 da 74 / D3 da 75): nunca distribui
 * saldo que não existe. Não recalcula status (quem chama, no `finally`); acumula em `acc`.
 *
 * Etapa 75 (Fase 5) — SERIALIZADO POR MATERIAL. Medido na revisão: duas inspeções simultâneas do mesmo
 * material (ou duas notas da 74) reservavam cada uma para R1, cada uma relia o hold de R1 acima do pendente
 * (a reserva da outra já estava lá) e as DUAS desfaziam o seu — a fila inteira ficava sem nada (8/8
 * rodadas, C126 reaberta). Com a fila por material, a segunda distribuição só começa depois que a primeira
 * terminou: relê a falta de R1 já coberta e passa para R2. O "desfazer o excesso" fica como DEFESA (a
 * corrida com o `/aprovar`, que não passa por aqui, ainda pode criar excesso).
 * PREMISSA: o app é UM processo Node e o SQLite UMA conexão — um lock em memória basta. Com mais de um
 * processo (ou na migração para Postgres) isto vira `SELECT ... FOR UPDATE` na linha do material ou um
 * advisory lock por `material_id` dentro da transação.
 */
const filaPorMaterial = new Map();
async function comLockDoMaterial(materialId, fn) {
  const chave = Number(materialId);
  const anterior = filaPorMaterial.get(chave) || Promise.resolve();
  let soltar;
  const minha = new Promise((resolve) => { soltar = resolve; });
  const cauda = anterior.then(() => minha);
  filaPorMaterial.set(chave, cauda);
  await anterior;
  try {
    return await fn();
  } finally {
    soltar();
    if (filaPorMaterial.get(chave) === cauda) filaPorMaterial.delete(chave);
  }
}

async function distribuirParaQuemEspera(db, user, materialId, teto, rotulos, acc) {
  return comLockDoMaterial(materialId, () => distribuirSemLock(db, user, materialId, teto, rotulos, acc));
}

async function distribuirSemLock(db, user, materialId, teto, rotulos, acc) {
  if (!(teto > EPS)) return;
  const material = await dbGet(db, `SELECT *, ${disponivelSql()} AS disponivel FROM materiais_almoxarifado WHERE id = ?`, [materialId]);
  if (!material) return;
  let distribuivel = Math.min(teto, Math.max(0, num(material.disponivel)));
  if (distribuivel <= EPS) return;

  const marcasSt = STATUS_CANDIDATOS.map(() => '?').join(',');
  const candidatos = await dbAll(db, `SELECT ir.id AS item_id, ir.requisicao_id, ir.quantidade_solicitada,
      ir.quantidade_entregue, ir.quantidade_atendida, ${HOLD_DO_ITEM_SQL} AS hold,
      r.id, r.numero, r.status, r.urgencia, r.data_necessidade, r.created_at, r.projeto_id,
      r.os_referencia, r.cliente_id, r.data_aprovacao_valor
    FROM itens_requisicao_almoxarifado ir
    JOIN requisicoes_almoxarifado r ON r.id = ir.requisicao_id
    WHERE COALESCE(r.ativo, 1) = 1 AND r.status IN (${marcasSt}) AND ir.material_id = ?`,
  [...STATUS_CANDIDATOS, materialId]);
  const naFila = candidatos
    .filter((c) => faltaDoItem(c, c.hold) > EPS)
    .sort((a, b) => requisitionService.compararPrioridade(a, b) || (a.item_id - b.item_id));

  for (const c of naFila) {
    if (distribuivel <= EPS) break;
    // eslint-disable-next-line no-await-in-loop
    if (!(await passaNaRegraDoDono(db, material, c))) continue;
    // eslint-disable-next-line no-await-in-loop
    if (await bloqueadaPorValor(db, c)) continue;
    // A falta RELIDA agora (Fase 2 da 74): outra nota ou uma aprovação pode ter reservado no meio.
    // eslint-disable-next-line no-await-in-loop
    const item = await lerItem(db, c.item_id);
    const falta = item ? faltaDoItem(item, item.hold) : 0;
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
        observacoes: rotulos.observacao(c),
      }, {
        sistema: true,
        requisicao_id: Number(c.requisicao_id),
        item_requisicao_id: c.item_id,
        recebimento_id: rotulos.recebimento_id,
        motivo: rotulos.motivo,
      });
    } catch (e) {
      console.warn(rotulos.falhaReserva(c, e));
      continue;
    }

    // RN-09 da 74: a requisição saiu da espera entre a leitura e a reserva (cancelada, excluída) → desfaz.
    // eslint-disable-next-line no-await-in-loop
    const atual = await dbGet(db, 'SELECT status, ativo FROM requisicoes_almoxarifado WHERE id = ?', [c.requisicao_id]);
    if (!atual || Number(atual.ativo ?? 1) === 0 || !STATUS_CANDIDATOS.includes(atual.status)) {
      // eslint-disable-next-line no-await-in-loop
      await liberarSemFalhar(db, user, reserva.id, null, rotulos.saiuDaEspera, rotulos);
      continue;
    }

    // Fase 2 da 74: o hold do item passou do pendente (corrida com outra nota / com a aprovação) → desfaz o excesso.
    let ficou = q;
    // eslint-disable-next-line no-await-in-loop
    const depois = await lerItem(db, c.item_id);
    const excesso = depois ? num(depois.hold) - pendenteDeEntrega(depois) : 0;
    if (excesso > EPS) {
      const devolver = Math.min(excesso, q);
      // eslint-disable-next-line no-await-in-loop
      if (await liberarSemFalhar(db, user, reserva.id, devolver >= q - EPS ? null : devolver,
        rotulos.excessoDesfeito, rotulos)) {
        ficou = q - devolver;
      }
    }
    if (ficou <= EPS) continue;
    distribuivel -= ficou;
    acc.tocadas.add(Number(c.requisicao_id));
    acc.resultado.reservas.push({
      requisicao_id: Number(c.requisicao_id), item_id: c.item_id, material_id: materialId,
      reserva_id: reserva.id, quantidade: ficou,
    });
  }
}

/**
 * Etapa 75 (T1) — os textos da liberação pela inspeção ou pela não conformidade (contrato do plano). O
 * documento entra no texto de log (a inspeção não tem número: vai o id; a NC vai pelo número).
 */
function rotulosDaLiberacao(ctx, recNumero) {
  const ehNc = ctx.origem === 'NAO_CONFORMIDADE';
  const nc = ctx.documento_numero || ctx.documento_id;
  const onde = ehNc ? `na liberação da não conformidade ${nc}` : `na liberação da inspeção ${ctx.documento_id}`;
  const ondeCurto = ehNc ? `na liberação da não conformidade ${nc}` : 'na liberação da inspeção';
  return {
    recebimento_id: ctx.recebimento_id ? Number(ctx.recebimento_id) : null,
    observacao: ehNc
      ? (c) => `Reserva na liberação da não conformidade ${nc} — requisição ${c.numero}`
      : (c) => `Reserva na liberação da inspeção — recebimento ${recNumero} — requisição ${c.numero}`,
    motivo: ehNc ? `Reserva na liberação da não conformidade ${nc}` : `Reserva na liberação da inspeção — recebimento ${recNumero}`,
    falhaReserva: (c, e) => `[almoxarifado-reservas] Falha ao reservar ${onde} o item ${c.item_id} da requisição ${c.requisicao_id}: ${e.message}`,
    motivoDesfazer: `Liberação de reserva ${ondeCurto} desfeita`,
    falhaDesfazer: (reservaId, e) => `[almoxarifado-reservas] Falha ao desfazer a reserva ${reservaId} ${onde}: ${e.message}`,
    saiuDaEspera: `Requisição saiu da espera durante a reserva ${ondeCurto}`,
    excessoDesfeito: `Reserva ${ondeCurto} acima do pendente — excesso desfeito`,
    falhaRecalculo: (id, e) => `[almoxarifado-reservas] recalculo do status apos a reserva na liberacao falhou (${ctx.origem} ${ctx.documento_id}, requisicao ${id}): ${e.message}`,
  };
}

/**
 * Etapa 75 (T1, C126) — o que a inspeção aprovou (ou a NC aceitou) é reservado para quem esperava, pelo
 * mesmo miolo da chegada (D2/B384), com o teto desta decisão: `min(quantidade liberada, disponível agora)`
 * (D3/B385 — nunca saldo de ajuste). A reserva é marcada com a nota (D4/B386): o estorno da entrada depois
 * da inspeção a solta pela B374. O dono é quem decidiu, com `sistema: true` (D6/B388 — a QUALIDADE não
 * tem `reservar`).
 * @param {object} ctx { origem: 'INSPECAO'|'NAO_CONFORMIDADE', documento_id, documento_numero, material_id,
 *   quantidade, recebimento_id }
 * @param {object} [resultado] acumulador preenchido no lugar (Fase 2: quem chama vê o parcial se lançar).
 * @returns {Promise<{reservas: Array, status: Array}>} Lança só em erro fora do try por item — e, mesmo então,
 *   o status das requisições já tocadas é recalculado antes de relançar.
 */
async function reservarLiberacaoParaQuemEspera(db, user, ctx, resultado = { reservas: [], status: [] }) {
  const quantidade = num(ctx && ctx.quantidade);
  if (!(quantidade > EPS) || !ctx.material_id) return resultado;
  const material = await dbGet(db, `SELECT id, ${disponivelSql()} AS disponivel FROM materiais_almoxarifado WHERE id = ?`, [ctx.material_id]);
  if (!material) return resultado;
  const rec = ctx.recebimento_id
    ? await dbGet(db, 'SELECT numero FROM recebimentos_material_almoxarifado WHERE id = ?', [ctx.recebimento_id])
    : null;
  const teto = Math.min(quantidade, Math.max(0, num(material.disponivel)));
  const rotulos = rotulosDaLiberacao(ctx, rec ? rec.numero : ctx.recebimento_id);
  const acc = { tocadas: new Set(), resultado };
  try {
    await distribuirParaQuemEspera(db, user, material.id, teto, rotulos, acc);
  } finally {
    await recalcularTocadas(db, acc, rotulos);
  }
  return resultado;
}

/**
 * Etapa 75 (T1, D5/B387) — o gancho das duas portas (decisão da inspeção, liberação pela NC). NUNCA lança:
 * a decisão da Qualidade já está gravada e o saldo já mudou; a reserva é efeito. Chamada pelo OBJETO do
 * módulo (monkeypatch dos testes). Fase 2: na falha devolve o resultado PARCIAL (o que de fato ficou
 * reservado antes de a falha escapar) — o aviso (T3) diz a verdade a partir dele.
 */
async function aposLiberacaoSemFalhar(db, user, ctx) {
  const resultado = { reservas: [], status: [] };
  let r = resultado;
  try {
    r = (await module.exports.reservarLiberacaoParaQuemEspera(db, user, ctx, resultado)) || resultado;
  } catch (e) {
    console.warn(`[almoxarifado-reservas] reserva na liberacao falhou (${ctx && ctx.origem} ${ctx && ctx.documento_id}): ${e.message}`);
    r = resultado;
  }
  // T3 (D7/B389): o solicitante é avisado com o que DE FATO ficou reservado. Pelo objeto do módulo
  // (monkeypatch dos testes); a falha do aviso nunca derruba a decisão nem a reserva.
  try {
    await receiptNotificationService.avisarLiberacao(db, user, ctx, r);
  } catch (e) {
    console.warn(`[almoxarifado-reservas] aviso da liberacao falhou (${ctx && ctx.origem} ${ctx && ctx.documento_id}): ${e.message}`);
  }
  return r;
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
 * @returns {Promise<Array<{reserva_id, requisicao_id, item_id, material_id, quantidade, recebimento_id, ...}>>} o que
 *   foi liberado, uma entrada por liberação. Fase 5: o motor recalcula o status das requisições a partir disto e,
 *   se o estorno NÃO acontecer depois (qualquer recusa ou falha), recria exatamente isto (`recriarAposEstornoRecusado`).
 */
async function liberarParaEstorno(db, user, mov) {
  const qtd = num(mov.quantidade);
  const mat = await dbGet(db, `SELECT ${disponivelSql()} AS disponivel FROM materiais_almoxarifado WHERE id = ?`, [mov.material_id]);
  const disp = num(mat && mat.disponivel);
  if (disp >= qtd - EPS) return [];

  const marcasSt = STATUS_QUE_ESPERAM.map(() => '?').join(',');
  const reservas = await dbAll(db, `SELECT rs.id AS reserva_id, rs.item_requisicao_id AS item_id,
      rs.projeto_id, rs.os_id, rs.os_referencia, rs.cliente_id, rs.data_necessidade AS rs_data_necessidade,
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
  const liberadas = [];
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
      liberadas.push({
        reserva_id: r.reserva_id, requisicao_id: Number(r.id), numero: r.numero, item_id: r.item_id,
        material_id: mov.material_id, quantidade: q, recebimento_id: Number(mov.recebimento_id),
        recebimento_numero: rec ? rec.numero : String(mov.recebimento_id),
        projeto_id: r.projeto_id, os_id: r.os_id, os_referencia: r.os_referencia, cliente_id: r.cliente_id,
        data_necessidade: r.rs_data_necessidade,
      });
    } catch (e) {
      console.warn(`[almoxarifado-reservas] Falha ao liberar a reserva ${r.reserva_id} no estorno da entrada: ${e.message}`);
    }
  }
  return liberadas;
}

/**
 * Etapa 74 (Fase 5) — o estorno liberou reservas da chegada e depois NÃO aconteceu (recusa do lote, claim
 * perdido para outro estorno, ledger que falhou): sem isto a requisição perdia a reserva e o estorno não
 * acontecia — o material voltava a ficar livre para quem fosse aprovado depois (C121 de novo). Recria
 * exatamente o que `liberarParaEstorno` liberou: mesma requisição/item/material/quantidade/recebimento_id,
 * origem REQUISICAO. A original fica LIBERADA (histórico: o livro tem a LIBERACAO_RESERVA dela); a nova
 * diz na observação que foi recriada. Cada uma no seu try: falhou, `console.warn` literal e segue — quem
 * chama devolve a falha ORIGINAL do estorno, nunca esta. O status é recalculado por quem chama.
 * Descartado: "reativar" a linha original (UPDATE status = 'ATIVA'): o livro já tem a LIBERACAO_RESERVA
 * dela e o hold do material já foi devolvido; reativar sem passar por `criarReserva` pularia o hold
 * atômico contra o disponível.
 */
async function recriarAposEstornoRecusado(db, user, liberadas) {
  const recriadas = [];
  for (const l of liberadas || []) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await stockService.criarReserva(db, user, {
        material_id: l.material_id,
        quantidade: l.quantidade,
        projeto_id: l.projeto_id || null,
        os_id: l.os_id || null,
        os_referencia: l.os_referencia || null,
        cliente_id: l.cliente_id || null,
        data_necessidade: l.data_necessidade || null,
        observacoes: `Reserva recriada após estorno recusado — recebimento ${l.recebimento_numero}, requisição ${l.numero}`,
      }, {
        sistema: true,
        requisicao_id: l.requisicao_id,
        item_requisicao_id: l.item_id,
        recebimento_id: l.recebimento_id,
        motivo: `Reserva recriada após estorno recusado — recebimento ${l.recebimento_numero}`,
      });
      recriadas.push(r.id);
    } catch (e) {
      console.warn(`[almoxarifado-reservas] Falha ao recriar a reserva ${l.reserva_id} apos estorno recusado: ${e.message}`);
    }
  }
  return recriadas;
}

module.exports = {
  reservarChegadaParaQuemEspera,
  reservarLiberacaoParaQuemEspera,
  aposLiberacaoSemFalhar,
  recalcularStatusDeReserva,
  liberarParaEstorno,
  recriarAposEstornoRecusado,
  STATUS_RECALCULAVEIS,
};
