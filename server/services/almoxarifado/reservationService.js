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

const CAMPOS_DONO = ['projeto_id', 'os_id', 'os_referencia', 'cliente_id'];

/**
 * Listagem para a tela de reservas. `saldo` = quantidade − quantidade_utilizada: é o que a
 * reserva ainda segura, e vem do banco em vez de ser recalculado no front para não haver duas
 * definições do mesmo número.
 */
async function listarReservas(db, filters = {}) {
  let sql = `SELECT r.*,
      m.codigo as material_codigo, m.nome as material_nome, m.unidade as material_unidade,
      (r.quantidade - COALESCE(r.quantidade_utilizada, 0)) as saldo
    FROM reservas_material_almoxarifado r
    JOIN materiais_almoxarifado m ON r.material_id = m.id
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
async function liberarReservasDaRequisicao(db, user, requisicaoId, motivo) {
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
          motivoMovimentacao: 'Liberação por cancelamento de requisição',
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

module.exports = { listarReservas, transferirReserva, processarExpiracao, liberarReservasDaRequisicao };
