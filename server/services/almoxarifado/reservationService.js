/**
 * Reservas: listagem com filtros, transferência entre projetos/OS e expiração (Etapa 4).
 *
 * O consumo contra reserva e a devolução de saldo vivem em stockService (é lá que está o motor
 * de estoque). Aqui ficam as operações que NÃO movem saldo — troca de dono e o job de vencimento,
 * que só reusa `liberarReserva`.
 */
const { dbAll, dbGet, dbRun } = require('./db');
const { registrarAuditoria } = require('./audit');
const stockService = require('./stockService');
const { can } = require('./permissions');

const CAMPOS_DONO = ['projeto_id', 'os_id', 'os_referencia', 'cliente_id'];

/**
 * Listagem para a tela de reservas. `saldo` = quantidade − quantidade_utilizada: é o que a
 * reserva ainda segura, e vem do banco em vez de ser recalculado no front para não haver duas
 * definições do mesmo número.
 */
//
// Etapa 77 (T0, D7/B413): duas chaves aditivas para a tela saber DE QUEM e a reserva de requisicao —
// `requisicao_numero` (a tela mostrava o id, Surpresa 6 da 76) e `requisicao_solicitante_id` (quem
// PEDIU a requisicao; `null` na reserva manual). ATENCAO: o `solicitante_id` que vem pelo `r.*` NAO
// e o dono — na reserva de origem REQUISICAO ele e QUEM APROVOU (o `user` da aprovacao), e na da
// chegada/inspecao e a Qualidade/o sistema. Quem decide se pode liberar e `requisicao_solicitante_id`.
// O nome do solicitante fica de fora de proposito: a tela nao precisa e a listagem nao tem gate de perfil.
async function listarReservas(db, filters = {}) {
  let sql = `SELECT r.*,
      m.codigo as material_codigo, m.nome as material_nome, m.unidade as material_unidade,
      (r.quantidade - COALESCE(r.quantidade_utilizada, 0)) as saldo,
      rq.numero as requisicao_numero, rq.solicitante_id as requisicao_solicitante_id
    FROM reservas_material_almoxarifado r
    JOIN materiais_almoxarifado m ON r.material_id = m.id
    LEFT JOIN requisicoes_almoxarifado rq ON rq.id = r.requisicao_id
    WHERE 1=1`;
  const params = [];
  if (filters.status) { sql += ' AND r.status = ?'; params.push(filters.status); }
  if (filters.material_id) { sql += ' AND r.material_id = ?'; params.push(filters.material_id); }
  if (filters.projeto_id) { sql += ' AND r.projeto_id = ?'; params.push(filters.projeto_id); }
  if (filters.os_id) { sql += ' AND (r.os_id = ? OR r.os_referencia = ?)'; params.push(filters.os_id, String(filters.os_id)); }
  sql += ' ORDER BY r.created_at DESC, r.id DESC';
  return dbAll(db, sql, params);
}

/**
 * Transferência entre projetos/OS: troca de DONO, não movimentação.
 *
 * Nenhum saldo é tocado de propósito — a quantidade continua fisicamente no estoque e continua
 * reservada, muda só para quem o hold aponta. Liberar e reservar de novo seria pior: abriria uma
 * janela em que outra saída poderia consumir o material no meio do caminho.
 *
 * Só reserva ATIVA pode ser transferida: LIBERADA/EXPIRADA já devolveram o saldo (transferir
 * daria a impressão de que o novo projeto tem material separado) e CONSUMIDA é fato passado —
 * reescrever seu dono falsificaria o consumo já registrado na movimentação.
 */
async function transferirReserva(db, user, reservaId, data = {}) {
  const reserva = await dbGet(db, 'SELECT * FROM reservas_material_almoxarifado WHERE id = ?', [reservaId]);
  if (!reserva) throw Object.assign(new Error('Reserva não encontrada'), { status: 404 });
  if (reserva.status !== 'ATIVA') {
    throw Object.assign(
      new Error(`Somente reserva ATIVA pode ser transferida (status atual: ${reserva.status})`),
      { status: 400 },
    );
  }

  const informados = CAMPOS_DONO.filter((c) => data[c] !== undefined);
  if (informados.length === 0) {
    throw Object.assign(
      new Error('Informe ao menos um destino: projeto_id, os_id, os_referencia ou cliente_id'),
      { status: 400 },
    );
  }

  const destino = {};
  for (const campo of CAMPOS_DONO) {
    destino[campo] = data[campo] !== undefined ? (data[campo] === '' ? null : data[campo]) : reserva[campo];
  }

  const claim = await dbGet(db, `UPDATE reservas_material_almoxarifado
    SET projeto_id = ?, os_id = ?, os_referencia = ?, cliente_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'ATIVA'
    RETURNING id`,
    [destino.projeto_id, destino.os_id, destino.os_referencia, destino.cliente_id, reservaId]);
  if (!claim) throw Object.assign(new Error('Reserva não está mais ATIVA'), { status: 400 });

  const anteriores = {};
  for (const campo of CAMPOS_DONO) anteriores[campo] = reserva[campo];

  await registrarAuditoria(db, {
    entidade: 'reserva',
    entidade_id: Number(reservaId),
    acao: 'TRANSFERENCIA',
    usuario_id: user?.id,
    usuario_nome: user?.nome || user?.email,
    dados_anteriores: anteriores,
    dados_novos: destino,
    justificativa: data.motivo || data.justificativa || null,
  });

  return dbGet(db, `SELECT r.*, m.codigo as material_codigo, m.nome as material_nome
    FROM reservas_material_almoxarifado r JOIN materiais_almoxarifado m ON r.material_id = m.id
    WHERE r.id = ?`, [reservaId]);
}

/**
 * Job de expiração — chamado por cron externo/admin, não por scheduler in-process (decisão de
 * design: o projeto não tem scheduler e introduzir um é decisão de infraestrutura).
 *
 * Reserva sem `expira_em` nunca expira, e o vencimento é no dia SEGUINTE à data (expira_em é o
 * último dia válido do hold). A devolução de saldo é a de `liberarReserva`, só com statusFinal
 * EXPIRADA — "venceu sozinha" e "alguém liberou" são fatos distintos no relatório.
 *
 * Idempotência vem do filtro por status ATIVA + o UPDATE condicional dentro de liberarReserva:
 * a segunda rodada não encontra mais a reserva e nada é descontado duas vezes.
 */
async function processarExpiracao(db, user, options = {}) {
  const referencia = options.referencia || null; // data alternativa (testes/reprocessamento)
  const vencidas = await dbAll(db, `SELECT id, material_id, quantidade, quantidade_utilizada,
      projeto_id, os_id, os_referencia, expira_em
    FROM reservas_material_almoxarifado
    WHERE status = 'ATIVA' AND expira_em IS NOT NULL
      AND date(expira_em) < date(COALESCE(?, 'now'))
    ORDER BY id`, [referencia]);

  const liberadas = [];
  const erros = [];
  for (const r of vencidas) {
    const restante = r.quantidade - (r.quantidade_utilizada || 0);
    try {
      if (restante > 0) {
        await stockService.liberarReserva(db, user, r.id, null, {
          statusFinal: 'EXPIRADA',
          motivo: `Expiração automática — prazo em ${r.expira_em}`,
          motivoMovimentacao: 'Expiração de reserva',
        });
      } else {
        // Reserva ATIVA sem saldo restante não tem o que devolver; só sai do caminho para
        // não ser reprocessada a cada rodada do cron.
        await dbRun(db, `UPDATE reservas_material_almoxarifado
          SET status = 'EXPIRADA', liberado_por = ?, liberado_em = CURRENT_TIMESTAMP,
              motivo_liberacao = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'ATIVA'`,
          [user?.id || null, `Expiração automática — prazo em ${r.expira_em}`, r.id]);
      }
      liberadas.push({
        id: r.id,
        material_id: r.material_id,
        quantidade_liberada: restante > 0 ? restante : 0,
        expira_em: r.expira_em,
        projeto_id: r.projeto_id,
        os_id: r.os_id,
        os_referencia: r.os_referencia,
      });
      await registrarAuditoria(db, {
        entidade: 'reserva',
        entidade_id: r.id,
        acao: 'EXPIRACAO',
        usuario_id: user?.id,
        usuario_nome: user?.nome || user?.email,
        dados_anteriores: { status: 'ATIVA', expira_em: r.expira_em },
        dados_novos: { status: 'EXPIRADA', quantidade_liberada: restante > 0 ? restante : 0 },
      }).catch(() => { /* auditoria não bloqueia o job */ });
    } catch (e) {
      // Uma reserva problemática não pode abortar o lote: o cron roda sem supervisão.
      erros.push({ id: r.id, erro: e.message });
      console.warn('[almoxarifado-reservas] Falha ao expirar reserva', r.id, '—', e.message);
    }
  }

  // Etapa 76 (T2, D1/B396 + D6/B401): a requisição dona de reserva vencida acompanha — sem isto ela
  // continuava "Totalmente Reservada" sem nada seguro (C127; a reserva da APROVAÇÃO também vence). Depois do
  // lote, UMA vez por requisição, só das reservas que DE FATO expiraram (`liberadas`; as de `erros` continuam
  // ATIVAS). Best-effort (D5): o job nunca cai por causa do status, e o recálculo não é erro de reserva.
  // Require LAZY: no topo fecharia o ciclo reservationService -> reservaChegadaService -> requisitionService
  // -> reservationService (plano §7 — o `{}` velho só quebra no sort da distribuição).
  if (liberadas.length) {
    try {
      const reservaChegadaService = require('./reservaChegadaService');
      await reservaChegadaService.recalcularRequisicoesDasReservas(db, liberadas.map((l) => l.id), 'expiracao da reserva');
    } catch (e) {
      console.warn(`[almoxarifado-reservas] recalculo do status apos expiracao da reserva falhou: ${e.message}`);
    }
  }

  return { processadas: liberadas.length, liberadas, erros };
}

/**
 * Libera as reservas ATIVAS criadas por uma requisição (origem REQUISICAO).
 *
 * Existe porque cancelar/excluir requisição deixava o hold preso até a expiração — e como a
 * expiração é opt-in por config, na prática ficaria preso para sempre. É a mesma armadilha que
 * a Etapa 4 fecha no consumo: saldo reservado que ninguém consegue usar nem soltar.
 *
 * Best-effort de propósito: uma reserva problemática não pode impedir o cancelamento da
 * requisição, que é a ação que o usuário pediu. Devolve o resumo para quem quiser logar.
 */
// Etapa 74 (T3, Fase 2): `opcoes.motivoMovimentacao` — o /encerrar e o /rejeitar-valor tambem soltam o hold
// (a reserva na chegada passou a criar hold sozinha, e status terminal com hold preso e saldo inutilizavel);
// o rastro no livro diz qual foi o ato, nao "cancelamento". Sem opcoes, o de sempre.
async function liberarReservasDaRequisicao(db, user, requisicaoId, motivo, opcoes = {}) {
  const ativas = await dbAll(db,
    `SELECT id, quantidade, COALESCE(quantidade_utilizada,0) as quantidade_utilizada
     FROM reservas_material_almoxarifado
     WHERE requisicao_id = ? AND origem = 'REQUISICAO' AND status = 'ATIVA'`,
    [requisicaoId]);

  const liberadas = []; const erros = [];
  for (const r of ativas) {
    try {
      if (r.quantidade - r.quantidade_utilizada > 0) {
        await stockService.liberarReserva(db, user, r.id, null, {
          statusFinal: 'LIBERADA',
          motivo: motivo || 'Requisição cancelada',
          motivoMovimentacao: opcoes.motivoMovimentacao || 'Liberação por cancelamento de requisição',
        });
      } else {
        // Sem saldo restante não há o que devolver; só sai de ATIVA.
        await dbRun(db, `UPDATE reservas_material_almoxarifado
          SET status = 'LIBERADA', liberado_por = ?, liberado_em = CURRENT_TIMESTAMP,
              motivo_liberacao = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'ATIVA'`,
          [user?.id || null, motivo || 'Requisição cancelada', r.id]);
      }
      liberadas.push(r.id);
    } catch (e) {
      erros.push({ id: r.id, erro: e.message });
      console.warn('[almoxarifado-reservas] Falha ao liberar reserva', r.id, 'da requisição', requisicaoId, '—', e.message);
    }
  }
  return { liberadas, erros };
}

/**
 * Etapa 77 (T0, C137, D3/B409 + D5/B411) — quem pode liberar A MAO uma reserva de REQUISICAO.
 *
 * Chamada pela ROTA `POST /reservas/:id/liberar`, depois do `requirePermission('reservar')` e antes
 * de `stockService.liberarReserva`. NAO mora no motor de proposito: `liberarReserva` tem oito
 * chamadores de SISTEMA (cancelar, excluir, encerrar, rejeitar-valor, expiracao, desfazer aprovacao
 * perdedora, desfazer chegada, estorno da entrada), todos legitimos sem dono nem perfil.
 *
 * Regra: reserva de origem REQUISICAO so sai por QUEM PEDIU a requisicao
 * (`requisicoes_almoxarifado.solicitante_id`) ou por quem tem `liberar_reserva_requisicao`
 * (ADMINISTRADOR, ALMOXARIFE). O dono NAO e `reservas.solicitante_id` — nessa reserva a coluna
 * guarda QUEM APROVOU (Surpresa 2 da Fase 0); compara-la daria a liberacao ao aprovador e a negaria
 * a quem pediu.
 *
 * Reserva inexistente, manual, ou sem `requisicao_id`: retorna sem barrar — o 404/400 continua sendo
 * do `liberarReserva`, e a manual segue a regra de hoje (D6/B412). Reserva de requisicao em qualquer
 * status cai aqui ANTES do estado: o nao-dono toma 403, nao "Reserva liberada nao pode ser liberada".
 *
 * O erro carrega `acao` e NAO `perfil` (Fase 2 do plano, molde do /rejeitar): o interceptor do axios
 * reescreve todo 403 com `acao` E `perfil` para "Solicite acesso a um administrador" — e a regra aqui
 * e de identidade, nao de acesso que se pede.
 */
async function assertPodeLiberarReserva(db, user, reservaId) {
  const r = await dbGet(db, 'SELECT id, origem, requisicao_id FROM reservas_material_almoxarifado WHERE id = ?', [reservaId]);
  if (!r) return;
  if (r.origem !== 'REQUISICAO' || r.requisicao_id == null) return;
  const q = await dbGet(db, 'SELECT numero, solicitante_id FROM requisicoes_almoxarifado WHERE id = ?', [r.requisicao_id]);
  if (q && Number(user?.id) === Number(q.solicitante_id)) return;
  if (can(user, 'liberar_reserva_requisicao')) return;
  const numero = (q && q.numero) || `#${r.requisicao_id}`;
  throw Object.assign(
    new Error(`Sem permissão para liberar a reserva da requisição ${numero}: só quem pediu a requisição, o almoxarife ou o administrador liberam`),
    { status: 403, acao: 'liberar_reserva_requisicao' },
  );
}

module.exports = { listarReservas, transferirReserva, processarExpiracao, liberarReservasDaRequisicao, assertPodeLiberarReserva };
