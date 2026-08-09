/**
 * Ciclo de vida do lote (Etapa 6).
 *
 * Este servico e o UNICO dono da tabela lotes_almoxarifado. Motivo: a Etapa 5 mostrou o custo de
 * ter duas escritas na mesma coluna de retencao (receiptService escrevia direto e o motor tambem),
 * e a correcao foi centralizar. Aqui a regra nasce centralizada.
 *
 * Mudar status de lote NAO e movimentacao de estoque: nenhuma quantidade muda de lugar, e emitir
 * um BLOQUEIO somaria em materiais_almoxarifado.quantidade_bloqueada, contando a mesma retencao
 * duas vezes. O rastro vai para auditoria_log_almoxarifado com entidade = 'lote'.
 */
const { dbRun, dbGet, dbAll } = require('./db');
const { registrarAuditoria } = require('./audit');

const STATUS_LOTE = ['ATIVO', 'BLOQUEADO', 'REPROVADO'];

function erro(msg, status = 400) {
  return Object.assign(new Error(msg), { status });
}

/** Vencimento e SEMPRE derivado — ver a nota no CREATE TABLE. */
function isVencido(lote, hojeISO) {
  if (!lote || !lote.data_validade) return false;
  const hoje = hojeISO || new Date().toISOString().slice(0, 10);
  return String(lote.data_validade).slice(0, 10) < hoje;
}

async function getLote(db, loteId) {
  if (!loteId) return undefined;
  return dbGet(db, 'SELECT * FROM lotes_almoxarifado WHERE id = ?', [loteId]);
}

async function getLotePorCodigo(db, materialId, codigo) {
  if (!materialId || !codigo) return undefined;
  return dbGet(db, 'SELECT * FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [materialId, String(codigo).trim()]);
}

/**
 * Idempotente por (material_id, codigo). Se o lote ja existe, devolve o existente SEM sobrescrever:
 * o segundo recebimento do mesmo lote nao pode reescrever a validade que veio no primeiro.
 */
async function criarOuObterLote(db, user, dados) {
  const materialId = dados?.material_id;
  const codigo = dados?.codigo == null ? '' : String(dados.codigo).trim();
  if (!materialId) throw erro('material_id obrigatorio para criar lote');
  if (!codigo) throw erro('codigo do lote obrigatorio');

  const existente = await getLotePorCodigo(db, materialId, codigo);
  if (existente) return existente;

  let status = 'ATIVO';
  if (dados.status != null) {
    if (!STATUS_LOTE.includes(dados.status)) {
      throw erro(`status de lote invalido: ${dados.status}. Use ${STATUS_LOTE.join(', ')}`);
    }
    status = dados.status;
  }
  const r = await dbRun(db, `INSERT INTO lotes_almoxarifado
    (material_id, codigo, fornecedor_id, fornecedor_nome, corrida, data_fabricacao, data_validade,
     status, status_motivo, recebimento_id, recebimento_item_id, nota_fiscal, observacoes, created_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    materialId, codigo,
    dados.fornecedor_id || null, dados.fornecedor_nome || null,
    dados.corrida || null, dados.data_fabricacao || null, dados.data_validade || null,
    status, dados.status_motivo || null,
    dados.recebimento_id || null, dados.recebimento_item_id || null,
    dados.nota_fiscal || null, dados.observacoes || null,
    user?.id || null,
  ]);

  const criado = await getLote(db, r.lastID);
  await registrarAuditoria(db, {
    entidade: 'lote', entidade_id: criado.id, acao: 'CRIACAO',
    usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
    dados_novos: { codigo: criado.codigo, material_id: criado.material_id, status: criado.status },
    justificativa: dados.status_motivo || null,
  });
  return criado;
}

/**
 * Guarda no WHERE, como o resto do modulo: se o lote sumiu entre a leitura e a escrita, o UPDATE
 * nao casa e a funcao falha em vez de reportar sucesso sobre nada.
 */
async function mudarStatusLote(db, user, loteId, novoStatus, justificativa) {
  const motivo = justificativa == null ? '' : String(justificativa).trim();
  if (!STATUS_LOTE.includes(novoStatus)) {
    throw erro(`status de lote invalido: ${novoStatus}. Use ${STATUS_LOTE.join(', ')}`);
  }
  if (!motivo) throw erro('justificativa obrigatoria para mudar o status do lote');

  const anterior = await getLote(db, loteId);
  if (!anterior) throw erro('Lote nao encontrado', 404);

  const claim = await dbGet(db, `UPDATE lotes_almoxarifado
    SET status = ?, status_motivo = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = ?
    RETURNING id`, [novoStatus, motivo, loteId, anterior.status]);
  if (!claim) throw erro('O status do lote mudou durante a operacao. Recarregue e tente de novo.', 409);

  await registrarAuditoria(db, {
    entidade: 'lote', entidade_id: loteId, acao: 'MUDANCA_STATUS',
    usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
    dados_anteriores: { status: anterior.status, status_motivo: anterior.status_motivo },
    dados_novos: { status: novoStatus, status_motivo: motivo },
    justificativa: motivo,
  });
  return getLote(db, loteId);
}

module.exports = {
  STATUS_LOTE, isVencido, getLote, getLotePorCodigo, criarOuObterLote, mudarStatusLote,
};
