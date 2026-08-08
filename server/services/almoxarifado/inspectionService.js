/**
 * Inspecao de recebimento: decide aprovar/reprovar/parcial e o bloqueio/desbloqueio avulso
 * de material (Etapa 5).
 *
 * `receiptService.js` ja responde por 511 linhas de workflow fiscal de 4 etapas com 11 status.
 * Recebimento e inspecao mudam por razoes diferentes — mesma separacao que `reservationService.js`
 * recebeu na Etapa 4. Tudo aqui passa pelo motor (`stockService.registrarMovimentacao`): nenhuma
 * funcao deste arquivo escreve em `materiais_almoxarifado` por conta propria.
 *
 * Substitui `receiptService.inspecionarItem` (removida), que fazia UPDATE SQL direto somando a
 * MESMA quantidade em `quantidade_bloqueada` E `quantidade_em_inspecao` — bloquear 10 tirava 20
 * do disponivel, sem passar pelo motor, sem movimentacao, sem existir no livro.
 */
const { dbGet, dbRun, dbAll } = require('./db');
const { registrarMovimentacao } = require('./stockService');

const ENCAMINHAMENTOS = ['DEVOLVER', 'ANALISE_ENGENHARIA', 'SUBSTITUICAO'];

async function decidirInspecao(db, user, itemId, data = {}) {
  const item = await dbGet(db, `SELECT ri.*, m.material_critico
    FROM recebimentos_material_itens_almoxarifado ri
    JOIN materiais_almoxarifado m ON ri.material_id = m.id WHERE ri.id = ?`, [itemId]);
  if (!item) throw Object.assign(new Error('Item não encontrado'), { status: 404 });

  const aprovada = Number(data.quantidade_aprovada || 0);
  const reprovada = Number(data.quantidade_reprovada || 0);
  const retido = item.quantidade_recebida || item.quantidade_esperada || 0;

  // Fechar a conta e obrigatorio: se aprovado + reprovado for menor que o retido, sobra saldo
  // preso em quarentena que ninguem mais vai olhar — a reserva zumbi da Etapa 4 em outra roupa.
  // Validado ANTES de qualquer INSERT/movimentacao — o saldo nao pode mudar quando isto recusa.
  if (aprovada + reprovada !== retido) {
    throw Object.assign(
      new Error(`Aprovado + reprovado (${aprovada + reprovada}) tem de fechar com o retido (${retido})`),
      { status: 400 });
  }
  if (data.encaminhamento && !ENCAMINHAMENTOS.includes(data.encaminhamento)) {
    throw Object.assign(new Error(`Encaminhamento inválido: ${data.encaminhamento}`), { status: 400 });
  }

  const ins = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
    (recebimento_item_id, conforme, divergencia_quantidade, divergencia_dimensional,
     certificado_ausente, dano_fisico, material_incorreto, acao, responsavel_id, responsavel_nome,
     observacoes, quantidade_aprovada, quantidade_reprovada, encaminhamento)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    itemId,
    reprovada === 0 ? 1 : 0,
    data.divergencia_quantidade ? 1 : 0, data.divergencia_dimensional ? 1 : 0,
    data.certificado_ausente ? 1 : 0, data.dano_fisico ? 1 : 0, data.material_incorreto ? 1 : 0,
    data.acao || null, user.id, user.nome || user.email, data.observacoes || null,
    aprovada, reprovada, data.encaminhamento || null,
  ]);
  const inspecaoId = ins.lastID;

  if (aprovada > 0) {
    await registrarMovimentacao(db, user, {
      material_id: item.material_id, tipo: 'LIBERACAO_INSPECAO', quantidade: aprovada,
      motivo: 'Inspeção aprovada', justificativa: data.observacoes || 'Inspeção aprovada',
      recebimento_id: item.recebimento_id,
    });
  }
  if (reprovada > 0) {
    // A guarda que impede decidir a mesma inspecao duas vezes vem do proprio motor: na segunda
    // chamada `quantidade_em_inspecao` ja e 0 e o UPDATE condicional de LIBERACAO_INSPECAO/
    // REPROVACAO_INSPECAO (Task 1) nao casa, lancando 400. Nao existe flag `ja_decidido` aqui —
    // seria uma segunda fonte de verdade que poderia divergir do saldo real.
    await registrarMovimentacao(db, user, {
      material_id: item.material_id, tipo: 'REPROVACAO_INSPECAO', quantidade: reprovada,
      motivo: 'Inspeção reprovada',
      justificativa: data.observacoes || `Inspeção reprovada${data.encaminhamento ? ` — ${data.encaminhamento}` : ''}`,
      recebimento_id: item.recebimento_id,
    });
  }
  return { id: inspecaoId, quantidade_aprovada: aprovada, quantidade_reprovada: reprovada };
}

async function bloquearMaterial(db, user, materialId, data = {}) {
  const { quantidade, justificativa } = data;
  if (!quantidade || quantidade <= 0) {
    throw Object.assign(new Error('Quantidade é obrigatória para bloqueio'), { status: 400 });
  }
  if (!justificativa) {
    throw Object.assign(new Error('Justificativa é obrigatória para bloqueio'), { status: 400 });
  }
  await registrarMovimentacao(db, user, {
    material_id: materialId, tipo: 'BLOQUEIO', quantidade, justificativa,
    motivo: 'Bloqueio avulso',
  });
  return { success: true };
}

async function desbloquearMaterial(db, user, materialId, data = {}) {
  const { quantidade, justificativa } = data;
  if (!quantidade || quantidade <= 0) {
    throw Object.assign(new Error('Quantidade é obrigatória para desbloqueio'), { status: 400 });
  }
  if (!justificativa) {
    throw Object.assign(new Error('Justificativa é obrigatória para desbloqueio'), { status: 400 });
  }
  await registrarMovimentacao(db, user, {
    material_id: materialId, tipo: 'DESBLOQUEIO', quantidade, justificativa,
    motivo: 'Desbloqueio avulso',
  });
  return { success: true };
}

/**
 * Fila de inspecao: itens de recebimento cujo material ainda tem saldo em quarentena e que
 * ainda nao receberam decisao (nenhuma linha em inspecoes_recebimento_almoxarifado). Cada item
 * decidido some da fila mesmo que o material continue com OUTRO item ainda retido — a decisao
 * e por item de recebimento, nao por material.
 */
async function listarInspecoesPendentes(db, filtros = {}) {
  let sql = `SELECT ri.id as item_id, ri.recebimento_id, ri.material_id,
      COALESCE(ri.quantidade_recebida, ri.quantidade_esperada) as quantidade_retida,
      m.codigo as material_codigo, m.nome as material_nome, m.unidade as material_unidade,
      r.numero as recebimento_numero, r.nota_fiscal, r.created_at as data_entrada
    FROM recebimentos_material_itens_almoxarifado ri
    JOIN materiais_almoxarifado m ON ri.material_id = m.id
    JOIN recebimentos_material_almoxarifado r ON ri.recebimento_id = r.id
    WHERE COALESCE(m.quantidade_em_inspecao, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM inspecoes_recebimento_almoxarifado insp
        WHERE insp.recebimento_item_id = ri.id
      )`;
  const params = [];
  if (filtros.material_id) { sql += ' AND ri.material_id = ?'; params.push(filtros.material_id); }
  if (filtros.recebimento_id) { sql += ' AND ri.recebimento_id = ?'; params.push(filtros.recebimento_id); }
  sql += ' ORDER BY r.created_at ASC';
  return dbAll(db, sql, params);
}

module.exports = {
  decidirInspecao,
  bloquearMaterial,
  desbloquearMaterial,
  listarInspecoesPendentes,
};
