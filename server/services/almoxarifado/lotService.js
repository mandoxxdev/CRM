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

/**
 * Libera o BLOQUEIO especificamente causado por falta de certificado — usado pela rota de upload
 * do certificado (Etapa 6, Task 5). NAO reaproveita mudarStatusLote aqui: aquela funcao guarda
 * contra o status que ELA MESMA acabou de ler (correto para detectar concorrencia durante a
 * PROPRIA execucao), mas nao protege contra um chamador que decidiu ANTES, com uma leitura
 * separada, se deveria liberar. Achado do review (Task 5, fix round 1): a rota lia o lote, media
 * outro `await` (gravar o arquivo), e SO DEPOIS chamava mudarStatusLote com base na leitura velha
 * — se o lote fosse reprovado nesse intervalo, mudarStatusLote via o status ATUAL (REPROVADO),
 * casava o proprio WHERE contra ele e aplicava a troca pra ATIVO mesmo assim, porque a pre-condicao
 * de negocio ("estava bloqueado por falta de certificado") nunca fazia parte do WHERE. Aqui a
 * pre-condicao INTEIRA mora no WHERE de um UNICO UPDATE — nao ha leitura-decide-escreve para
 * uma mudanca de estado externo atravessar. Devolve null quando a condicao nao bate (lote
 * reprovado, ou bloqueado por outro motivo, ou ja ativo) em vez de lancar: a rota so quer saber
 * se liberou ou nao, e "nao liberou" nao e erro.
 */
async function liberarBloqueioPorCertificado(db, user, loteId, justificativa) {
  const motivo = justificativa == null ? '' : String(justificativa).trim();
  if (!motivo) throw erro('justificativa obrigatoria para liberar o lote');

  const anterior = await getLote(db, loteId);
  if (!anterior) throw erro('Lote nao encontrado', 404);

  const claim = await dbGet(db, `UPDATE lotes_almoxarifado
    SET status = 'ATIVO', status_motivo = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'BLOQUEADO' AND status_motivo LIKE '%certificado%'
    RETURNING id`, [motivo, loteId]);
  if (!claim) return null;

  await registrarAuditoria(db, {
    entidade: 'lote', entidade_id: loteId, acao: 'MUDANCA_STATUS',
    usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
    dados_anteriores: { status: anterior.status, status_motivo: anterior.status_motivo },
    dados_novos: { status: 'ATIVO', status_motivo: motivo },
    justificativa: motivo,
  });
  return getLote(db, loteId);
}

/** Vencimento liberado e um fato datado e assinado — NAO desvence o lote (isVencido nao olha isto). */
function vencimentoLiberado(lote) {
  return !!(lote && lote.vencimento_liberado_em);
}

/**
 * Reaproveita o fluxo de bloqueio/desbloqueio da Etapa 5 (guarda no WHERE, justificativa
 * obrigatoria, auditoria), mas NAO e mudanca de status: sao eixos independentes de proposito
 * (regra 3 da task) — um lote BLOQUEADO ou REPROVADO continua barrado na saida mesmo com o
 * vencimento liberado. Quem faz esse encadeamento e a guarda em stockService, checando status
 * antes de vencimento.
 */
async function liberarVencimento(db, user, loteId, justificativa) {
  const motivo = justificativa == null ? '' : String(justificativa).trim();
  if (!motivo) throw erro('justificativa obrigatoria para liberar o vencimento do lote');

  const anterior = await getLote(db, loteId);
  if (!anterior) throw erro('Lote nao encontrado', 404);
  if (!isVencido(anterior)) throw erro('Lote nao esta vencido; nao ha vencimento para liberar');

  // Guarda no WHERE contra data_validade (a mesma fonte que isVencido leu acima), nao read-then-
  // write: se o lote mudou entre a leitura e a escrita, o UPDATE nao casa e falha em vez de
  // reportar sucesso sobre um estado que ja nao e o que foi checado.
  const claim = await dbGet(db, `UPDATE lotes_almoxarifado
    SET vencimento_liberado_em = CURRENT_TIMESTAMP, vencimento_liberado_por = ?,
        vencimento_liberado_motivo = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND data_validade = ?
    RETURNING id`, [user?.id || null, motivo, loteId, anterior.data_validade]);
  if (!claim) throw erro('O lote mudou durante a operacao. Recarregue e tente de novo.', 409);

  const atualizado = await getLote(db, loteId);
  await registrarAuditoria(db, {
    entidade: 'lote', entidade_id: loteId, acao: 'LIBERACAO_VENCIMENTO',
    usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
    dados_anteriores: { vencimento_liberado_em: anterior.vencimento_liberado_em },
    dados_novos: { vencimento_liberado_em: atualizado.vencimento_liberado_em, vencimento_liberado_motivo: motivo },
    justificativa: motivo,
  });
  return atualizado;
}

/**
 * Ordem FEFO: elegiveis primeiro, depois validade crescente com nulos por ultimo, depois codigo.
 * Lote nao elegivel (bloqueado, reprovado, vencido) NAO some da lista — vai para o fim. Esconder
 * faz o operador procurar material que o sistema decidiu nao mostrar.
 *
 * `elegivel` segue a MESMA ordem de checagem que o motor usa em stockService antes de aceitar uma
 * SAIDA: status primeiro (BLOQUEADO/REPROVADO nunca elegivel, mesmo com vencimento liberado —
 * sao eixos independentes, ver o comentario de liberarVencimento acima), vencimento depois (vencido
 * SEM liberacao nao e elegivel; vencido COM liberacao passa a ser). A liberacao NAO desvence o
 * lote — por isso `vencido` continua true na linha mesmo depois de liberado; `vencimento_liberado`
 * e o campo que diz que a saida de consumo esta credenciada apesar do vencimento.
 */
async function listarLotesDoMaterial(db, materialId, { apenasComSaldo = false } = {}) {
  const linhas = await dbAll(db, `
    SELECT l.*, COALESCE((
      SELECT SUM(s.quantidade) FROM estoque_saldo_almoxarifado s WHERE s.lote_id = l.id
    ), 0) as saldo
    FROM lotes_almoxarifado l
    WHERE l.material_id = ?`, [materialId]);

  const hoje = new Date().toISOString().slice(0, 10);
  const comFlags = linhas
    .map((l) => {
      const vencido = isVencido(l, hoje);
      const liberado = vencimentoLiberado(l);
      return {
        ...l,
        vencido,
        vencimento_liberado: liberado,
        elegivel: l.status === 'ATIVO' && (!vencido || liberado),
      };
    })
    .filter((l) => !apenasComSaldo || l.saldo > 0);

  comFlags.sort((a, b) => {
    if (a.elegivel !== b.elegivel) return a.elegivel ? -1 : 1;
    const va = a.data_validade || '9999-12-31';
    const vb = b.data_validade || '9999-12-31';
    if (va !== vb) return va < vb ? -1 : 1;
    return String(a.codigo).localeCompare(String(b.codigo));
  });
  return comFlags;
}

module.exports = {
  STATUS_LOTE, isVencido, getLote, getLotePorCodigo, criarOuObterLote, mudarStatusLote,
  vencimentoLiberado, liberarVencimento, liberarBloqueioPorCertificado, listarLotesDoMaterial,
};
