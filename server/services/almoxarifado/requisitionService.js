/**
 * Requisições de material — atendimento parcial com validação de estoque
 */
const { dbRun, dbGet, dbAll } = require('./db');
const valueApprovalService = require('./requisitionValueApprovalService');
const stockService = require('./stockService');
const {
  PODE_SEPARAR, PODE_ENTREGAR, STATUS_PARCIALMENTE_RESERVADA, STATUS_TOTALMENTE_RESERVADA,
} = require('./requisitionStateMachine');

function num(v) {
  return Number(v) || 0;
}

function getEntregue(item) {
  return num(item.quantidade_entregue ?? item.quantidade_atendida);
}

function getSeparado(item) {
  return num(item.quantidade_separada);
}

function pendenteEntrega(item) {
  return Math.max(0, num(item.quantidade_solicitada) - getEntregue(item));
}

function pendenteSeparacao(item) {
  return Math.max(0, num(item.quantidade_solicitada) - getSeparado(item));
}

/**
 * `estoque` aqui é o saldo DISPONÍVEL (quantidade_atual − reservada − bloqueada −
 * em_inspecao), não mais o físico (Etapa 3, Task 3 — fecha o bypass de
 * entregarRequisicao/excluirRequisicao que baixava/estornava direto no físico sem passar
 * pelo motor). Os chamadores (separarRequisicao/entregarRequisicao/normalizarItem) já
 * calculam e passam o disponível.
 */
function maxSeparar(item, estoque) {
  return Math.min(pendenteSeparacao(item), num(estoque));
}

function maxEntregar(item, estoque) {
  const pendente = pendenteEntrega(item);
  if (pendente <= 0) return 0;
  const separadoDisponivel = Math.max(0, getSeparado(item) - getEntregue(item));
  // Segunda rodada após entrega parcial: separado já foi consumido, mas pendente permanece
  if (getEntregue(item) > 0 && separadoDisponivel < pendente) {
    return Math.min(pendente, num(estoque));
  }
  return Math.min(pendente, separadoDisponivel, num(estoque));
}

function normalizarItem(item) {
  const entregue = getEntregue(item);
  const separado = getSeparado(item);
  const solicitado = num(item.quantidade_solicitada);
  // saldo_atual mantém o NOME por compat com o front, mas passa a carregar o DISPONÍVEL
  // quando a query de origem já traz saldo_disponivel (carregarItensRequisicao) — mudança
  // semântica documentada na Task 3. Se só o físico estiver disponível (chamador antigo),
  // cai no físico como antes.
  const estoque = num(item.saldo_atual ?? item.saldo_disponivel ?? item.quantidade_atual);
  const pendente = Math.max(0, solicitado - entregue);
  const entregavel = maxEntregar(item, estoque);
  return {
    ...item,
    quantidade_entregue: entregue,
    quantidade_separada: separado,
    quantidade_atendida: entregue,
    quantidade_pendente: pendente,
    quantidade_entregavel: entregavel,
    saldo_atual: item.saldo_atual ?? estoque,
  };
}

function todosItensCompletos(itens) {
  return itens.every((i) => getEntregue(i) >= num(i.quantidade_solicitada));
}

/**
 * Saldo que a reserva da PRÓPRIA requisição ainda segura para um item (Etapa 4).
 *
 * `quantidade_reservada` do material entra como dedução no disponível, então sem somar de volta
 * o hold do próprio item a reserva criada na aprovação viraria uma trava contra a requisição que
 * a originou — exatamente a armadilha que a Etapa 4 fecha. Só reservas ATIVAS de origem
 * REQUISICAO contam: reserva manual de terceiro continua sendo saldo de outro dono.
 */
const RESERVADO_PARA_ITEM_SQL = `COALESCE((
      SELECT SUM(r.quantidade - COALESCE(r.quantidade_utilizada,0))
      FROM reservas_material_almoxarifado r
      WHERE r.item_requisicao_id = ir.id AND r.material_id = ir.material_id
        AND r.status = 'ATIVA' AND r.origem = 'REQUISICAO'
    ), 0)`;

async function carregarItensRequisicao(db, requisicaoId) {
  return dbAll(db, `SELECT ir.*, ma.quantidade_atual, ma.unidade, ma.nome as material_nome, ma.codigo as material_codigo,
      COALESCE(ma.custo_medio, ma.custo_unitario, 0) as custo_unitario,
      ${RESERVADO_PARA_ITEM_SQL} as reservado_para_item,
      (ma.quantidade_atual - COALESCE(ma.quantidade_reservada,0) - COALESCE(ma.quantidade_bloqueada,0)
        - COALESCE(ma.quantidade_em_inspecao,0) + ${RESERVADO_PARA_ITEM_SQL}) as saldo_disponivel
    FROM itens_requisicao_almoxarifado ir
    JOIN materiais_almoxarifado ma ON ir.material_id = ma.id
    WHERE ir.requisicao_id = ?`, [requisicaoId]);
}

/**
 * Disponível para UM item, já somando o hold da própria requisição (mesma conta do
 * RESERVADO_PARA_ITEM_SQL). Usado nas leituras frescas de separar/entregar, que checam o saldo
 * item a item imediatamente antes de agir.
 */
async function saldoDisponivelParaItem(db, item) {
  const row = await dbGet(db, `SELECT
      (ma.quantidade_atual - COALESCE(ma.quantidade_reservada,0) - COALESCE(ma.quantidade_bloqueada,0)
        - COALESCE(ma.quantidade_em_inspecao,0)) as saldo_disponivel,
      COALESCE((
        SELECT SUM(r.quantidade - COALESCE(r.quantidade_utilizada,0))
        FROM reservas_material_almoxarifado r
        WHERE r.item_requisicao_id = ? AND r.material_id = ma.id
          AND r.status = 'ATIVA' AND r.origem = 'REQUISICAO'
      ), 0) as reservado_para_item
    FROM materiais_almoxarifado ma WHERE ma.id = ?`, [item.id, item.material_id]);
  return {
    disponivel: num(row?.saldo_disponivel) + num(row?.reservado_para_item),
    reservado_para_item: num(row?.reservado_para_item),
  };
}

/**
 * Reserva de material na APROVAÇÃO (Etapa 4, ligação 04→07 — design, decisão 2).
 *
 * Para cada item reserva `min(pendente de atendimento, disponível do material)` e devolve o
 * status que a requisição deve assumir:
 *  - `TOTALMENTE_RESERVADA` — todo item pendente saiu com o pedido inteiro reservado;
 *  - `PARCIALMENTE_RESERVADA` — algo foi reservado, mas não tudo;
 *  - `null` — nada foi reservado; quem chama mantém o status pós-aprovação de sempre
 *    (APROVADO/AGUARDANDO_ESTOQUE/AGUARDANDO_COMPRA), que NÃO pode regredir por causa disto.
 *
 * As reservas são criadas uma a uma (`criarReserva` relê o disponível a cada chamada), então
 * dois itens do MESMO material não reservam o mesmo saldo duas vezes.
 *
 * Falha de reserva de um item não derruba a aprovação: a decisão de aprovar já foi tomada e é
 * independente de haver saldo (é justamente o caso AGUARDANDO_ESTOQUE). Um item que não
 * conseguiu reservar conta como não reservado — no pior caso a requisição fica
 * PARCIALMENTE_RESERVADA/sem reserva e a separação segue disputando o disponível como antes.
 */
async function reservarItensAprovacao(db, requisicaoId, user, reqRow = {}) {
  const itens = await carregarItensRequisicao(db, requisicaoId);
  const reservas = [];
  let algumFaltou = false;

  for (const item of itens) {
    const pendente = pendenteEntrega(item);
    if (pendente <= 0) continue; // item já atendido não precisa de hold

    // eslint-disable-next-line no-await-in-loop
    const { disponivel } = await saldoDisponivelParaItem(db, item);
    const aReservar = Math.min(pendente, Math.max(0, disponivel));
    if (aReservar <= 0) { algumFaltou = true; continue; }

    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await stockService.criarReserva(db, user, {
        material_id: item.material_id,
        quantidade: aReservar,
        projeto_id: reqRow.projeto_id || null,
        os_id: reqRow.os_id || null,
        os_referencia: reqRow.os_referencia || null,
        cliente_id: reqRow.cliente_id || null,
        observacoes: `Reserva automática da requisição ${reqRow.numero || requisicaoId}`,
      }, {
        sistema: true,
        requisicao_id: Number(requisicaoId),
        item_requisicao_id: item.id,
        motivo: `Reserva automática requisição ${reqRow.numero || requisicaoId}`,
      });
      reservas.push({ item_id: item.id, reserva_id: r.id, quantidade: aReservar });
      if (aReservar < pendente) algumFaltou = true;
    } catch (e) {
      console.warn(`[almoxarifado-reservas] Falha ao reservar item ${item.id} da requisição ${requisicaoId}: ${e.message}`);
      algumFaltou = true;
    }
  }

  if (reservas.length === 0) return { status: null, reservas };
  return { status: algumFaltou ? STATUS_PARCIALMENTE_RESERVADA : STATUS_TOTALMENTE_RESERVADA, reservas };
}

async function separarRequisicao(db, requisicaoId, itensSeparados = []) {
  const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  if (!reqRow) {
    const err = new Error('Requisição não encontrada');
    err.status = 404;
    throw err;
  }
  if (!PODE_SEPARAR.includes(reqRow.status)) {
    const err = new Error(
      'Requisição deve estar aprovada, aguardando estoque/compra, em separação ou parcialmente atendida para separar'
    );
    err.status = 400;
    throw err;
  }

  await valueApprovalService.verificarBloqueioLiberacao(db, requisicaoId);

  const itens = await carregarItensRequisicao(db, requisicaoId);

  for (const entrada of itensSeparados) {
    const item = itens.find((i) => Number(i.id) === Number(entrada.item_id));
    if (!item) continue;

    const qty = num(entrada.quantidade_separada);
    if (qty <= 0) continue;

    // Disponível + o hold da PRÓPRIA requisição (Etapa 4): a reserva criada na aprovação sai do
    // disponível geral, então sem somá-la de volta a requisição não conseguiria separar o
    // material que já está separado para ela.
    // eslint-disable-next-line no-await-in-loop
    const { disponivel: estoque } = await saldoDisponivelParaItem(db, item);
    const max = maxSeparar(item, estoque);

    if (qty > max) {
      const err = new Error(
        `${item.material_nome}: não é possível separar ${qty} ${item.unidade || ''}. `
        + `Máximo: ${max} (pendente: ${pendenteSeparacao(item)}, disponível: ${estoque})`
      );
      err.status = 400;
      throw err;
    }

    const novaSeparada = getSeparado(item) + qty;
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada = ? WHERE id = ?',
      [novaSeparada, item.id]);
    item.quantidade_separada = novaSeparada;
  }

  await dbRun(db,
    `UPDATE requisicoes_almoxarifado SET status='EM_SEPARACAO', updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL WHERE id=?`,
    [requisicaoId]);

  return { success: true, status: 'EM_SEPARACAO' };
}

/**
 * `alertService` é aceito e ignorado (Etapa 3, Task 3): a baixa agora passa por
 * stockService.registrarMovimentacao, que já dispara a checagem de alerta internamente
 * (stockService.js, pós-INSERT da movimentação). Chamar de novo aqui duplicaria o disparo.
 * Mantido no parâmetro só para não quebrar as duas rotas que ainda o passam
 * (routes/almoxarifado.js, routes/requisicoesMaterial.js).
 */
async function entregarRequisicao(db, requisicaoId, itensAtendidos, user, alertService) { // eslint-disable-line no-unused-vars
  const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  if (!reqRow) {
    const err = new Error('Requisição não encontrada');
    err.status = 404;
    throw err;
  }
  if (!PODE_ENTREGAR.includes(reqRow.status)) {
    const err = new Error('Requisição deve estar em separação, pronta para retirada ou parcialmente atendida');
    err.status = 400;
    throw err;
  }

  await valueApprovalService.verificarBloqueioLiberacao(db, requisicaoId);

  const itens = await carregarItensRequisicao(db, requisicaoId);
  const entregas = [];

  for (const item of itens) {
    const entrada = itensAtendidos?.find((ia) => Number(ia.item_id) === Number(item.id));
    const qtyEntregar = entrada ? num(entrada.quantidade_atendida) : 0;
    if (qtyEntregar <= 0) continue;

    // Ceiling é o DISPONÍVEL (Etapa 3, Task 3), não mais o físico — leitura fresca aqui é só
    // uma checagem antecipada para uma mensagem de erro com nome do material/pendente; a
    // validação que realmente vale é a atômica dentro de stockService.registrarMovimentacao
    // logo abaixo (fecha a janela de corrida entre esta leitura e a baixa real).
    // Etapa 4: o disponível soma o hold da própria requisição — o que a aprovação reservou é
    // desta requisição e não pode barrá-la.
    // eslint-disable-next-line no-await-in-loop
    const { disponivel, reservado_para_item: reservadoItem } = await saldoDisponivelParaItem(db, item);
    const max = maxEntregar(item, disponivel);

    if (qtyEntregar > max) {
      const err = new Error(
        `${item.material_nome}: não é possível entregar ${qtyEntregar} ${item.unidade || ''}. `
        + `Máximo: ${max} (pendente: ${pendenteEntrega(item)}, disponível: ${disponivel})`
      );
      err.status = 400;
      throw err;
    }

    // Etapa 4 — a entrega consome a RESERVA da própria requisição (design, decisão 2): é isso
    // que fecha a corrida aprovar→entregar, porque o saldo prometido na aprovação sai do hold
    // desta requisição e não do disponível geral (que qualquer outra saída pode ter levado).
    //
    // Quando a entrega passa do que a reserva tem, a saída é DIVIDIDA: o excedente sai pelo
    // caminho normal (sem reserva_id, validado contra o disponível) e a parte reservada é
    // consumida citando a reserva. Recusar o excedente seria mais simples, mas quebraria um caso
    // legítimo e comum: reserva parcial na aprovação (só havia parte do saldo), o resto do
    // material chega depois e a entrega completa passa a caber. Recusar obrigaria a entregar em
    // duas rodadas sem nenhum ganho de segurança — o excedente já é validado pelo motor.
    //
    // ORDEM: excedente PRIMEIRO. Ele é o único que disputa o disponível com o resto do mundo,
    // logo é o que pode falhar; deixando-o na frente, a falha provável acontece ANTES de mexer na
    // reserva — nada saiu do estoque. Com a reserva na frente, a mesma falha deixaria metade da
    // baixa feita. Cada baixa bem-sucedida é registrada no item logo em seguida, então uma falha
    // no meio ainda deixa item e estoque coerentes (o que saiu está contado como entregue).
    const reservasItem = reservadoItem > 0
      // eslint-disable-next-line no-await-in-loop
      ? await dbAll(db, `SELECT id, (quantidade - COALESCE(quantidade_utilizada,0)) as saldo
          FROM reservas_material_almoxarifado
          WHERE item_requisicao_id = ? AND material_id = ? AND status = 'ATIVA' AND origem = 'REQUISICAO'
            AND (quantidade - COALESCE(quantidade_utilizada,0)) > 0
          ORDER BY id`, [item.id, item.material_id])
      : [];

    const baixasReserva = [];
    let restante = qtyEntregar;
    for (const r of reservasItem) {
      if (restante <= 0) break;
      const usar = Math.min(restante, num(r.saldo));
      if (usar <= 0) continue;
      baixasReserva.push({ quantidade: usar, reserva_id: r.id });
      restante -= usar;
    }
    const baixas = restante > 0
      ? [{ quantidade: restante, reserva_id: undefined }, ...baixasReserva]
      : baixasReserva;

    let entregueAcumulado = getEntregue(item);
    for (const baixa of baixas) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await stockService.registrarMovimentacao(db, user, {
          material_id: item.material_id,
          tipo: 'SAIDA',
          quantidade: baixa.quantidade,
          reserva_id: baixa.reserva_id,
          motivo: `Requisição ${reqRow.numero}`,
          referencia: reqRow.os_referencia || reqRow.numero,
          justificativa: `Entrega requisição ${reqRow.numero}`,
          requisicao_id: requisicaoId,
          projeto_id: reqRow.projeto_id || undefined,
          cliente_id: reqRow.cliente_id || undefined,
          centro_custo_id: reqRow.centro_custo_id || undefined,
        });
      } catch (e) {
        const err = new Error(`${item.material_nome}: ${e.message}`);
        err.status = e.status;
        throw err;
      }

      entregueAcumulado += baixa.quantidade;
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db,
        'UPDATE itens_requisicao_almoxarifado SET quantidade_entregue=?, quantidade_atendida=?, quantidade_separada=? WHERE id=?',
        [entregueAcumulado, entregueAcumulado, Math.max(getSeparado(item), entregueAcumulado), item.id]);
    }

    entregas.push({ item_id: item.id, quantidade: qtyEntregar });
  }

  if (entregas.length === 0) {
    const err = new Error('Informe ao menos uma quantidade maior que zero para entregar');
    err.status = 400;
    throw err;
  }

  const itensAtualizados = await carregarItensRequisicao(db, requisicaoId);
  const completo = todosItensCompletos(itensAtualizados);
  const novoStatus = completo ? 'ENTREGUE' : 'PARCIALMENTE_ATENDIDA';

  if (completo) {
    await dbRun(db,
      `UPDATE requisicoes_almoxarifado SET status=?, data_entrega=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL WHERE id=?`,
      [novoStatus, requisicaoId]);
  } else {
    await dbRun(db,
      `UPDATE requisicoes_almoxarifado SET status=?, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL WHERE id=?`,
      [novoStatus, requisicaoId]);
  }

  return { success: true, status: novoStatus, parcial: !completo, entregas };
}

/**
 * `alertService` é aceito e ignorado (Etapa 3, Task 3) — mesmo motivo de entregarRequisicao:
 * stockService.registrarMovimentacao já dispara a checagem de alerta internamente.
 */
async function excluirRequisicao(db, requisicaoId, user, justificativa, alertService) { // eslint-disable-line no-unused-vars
  const reqRow = await dbGet(db,
    'SELECT * FROM requisicoes_almoxarifado WHERE id = ? AND COALESCE(ativo, 1) = 1',
    [requisicaoId]);
  if (!reqRow) {
    const err = new Error('Requisição não encontrada');
    err.status = 404;
    throw err;
  }

  const itens = await carregarItensRequisicao(db, requisicaoId);
  const estornos = [];
  // Calculado antes do loop (achado do fix round): o motor grava `justificativa` no livro/
  // auditoria do estorno — sem isto o ENTRADA de estorno saía sem justificativa (ENTRADA não
  // exige vínculo em movementRules.js, então passava despercebido, mas a rastreabilidade da
  // exclusão ficava incompleta).
  const motivo = justificativa?.trim() || 'Excluída pelo administrador';

  for (const item of itens) {
    const qtyEstorno = getEntregue(item);
    if (qtyEstorno <= 0) continue;

    try {
      // eslint-disable-next-line no-await-in-loop
      await stockService.registrarMovimentacao(db, user, {
        material_id: item.material_id,
        tipo: 'ENTRADA',
        quantidade: qtyEstorno,
        motivo: `Estorno exclusão requisição ${reqRow.numero}`,
        referencia: reqRow.os_referencia || reqRow.numero,
        justificativa: justificativa || motivo,
        requisicao_id: requisicaoId,
        projeto_id: reqRow.projeto_id || undefined,
        cliente_id: reqRow.cliente_id || undefined,
        centro_custo_id: reqRow.centro_custo_id || undefined,
      });
    } catch (e) {
      const err = new Error(`${item.material_nome}: ${e.message}`);
      err.status = e.status;
      throw err;
    }

    estornos.push({ material_id: item.material_id, quantidade: qtyEstorno });
  }

  await dbRun(db,
    `UPDATE requisicoes_almoxarifado
     SET ativo=0, status='CANCELADO', rejeicao_motivo=?, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL
     WHERE id=?`,
    [motivo, requisicaoId]);

  return { success: true, estornos };
}

module.exports = {
  num,
  getEntregue,
  getSeparado,
  pendenteEntrega,
  pendenteSeparacao,
  maxSeparar,
  maxEntregar,
  normalizarItem,
  todosItensCompletos,
  carregarItensRequisicao,
  saldoDisponivelParaItem,
  reservarItensAprovacao,
  separarRequisicao,
  entregarRequisicao,
  excluirRequisicao,
};
