/**
 * Disponibilidade de estoque para requisitantes (sem expor quantidade exata).
 */
const { dbAll } = require('./db');

const DISPONIBILIDADE = {
  EM_ESTOQUE: 'em_estoque',
  PARCIAL: 'parcial',
  SEM_ESTOQUE: 'sem_estoque',
};

const DISPONIBILIDADE_LABELS = {
  [DISPONIBILIDADE.EM_ESTOQUE]: 'Em estoque',
  [DISPONIBILIDADE.PARCIAL]: 'Parcial',
  [DISPONIBILIDADE.SEM_ESTOQUE]: 'Sem estoque',
};

function computeDisponibilidade(quantidadeAtual, quantidadeSolicitada = 1) {
  const estoque = Number(quantidadeAtual) || 0;
  const solicitado = Math.max(1, Number(quantidadeSolicitada) || 1);

  let disponibilidade;
  if (estoque <= 0) {
    disponibilidade = DISPONIBILIDADE.SEM_ESTOQUE;
  } else if (estoque >= solicitado) {
    disponibilidade = DISPONIBILIDADE.EM_ESTOQUE;
  } else {
    disponibilidade = DISPONIBILIDADE.PARCIAL;
  }

  return {
    disponibilidade,
    saldo_suficiente: disponibilidade === DISPONIBILIDADE.EM_ESTOQUE,
    disponibilidade_label: DISPONIBILIDADE_LABELS[disponibilidade],
  };
}

const SENSITIVE_MATERIAL_FIELDS = [
  'quantidade_atual',
  'quantidade_minima',
  'quantidade_maxima',
  'quantidade_reservada',
  'quantidade_bloqueada',
  'quantidade_em_inspecao',
  'custo_unitario',
  'custo_medio',
  'valor_estoque',
  'quantidade_disponivel',
];

function sanitizeMaterialForSector(material, quantidadeSolicitada = 1) {
  if (!material) return null;
  const sanitized = { ...material };
  SENSITIVE_MATERIAL_FIELDS.forEach((field) => {
    delete sanitized[field];
  });
  delete sanitized.saldo_atual;

  const status = computeDisponibilidade(material.quantidade_atual, quantidadeSolicitada);
  return {
    ...sanitized,
    ...status,
  };
}

function sanitizeRequisicaoItemForSector(item) {
  if (!item) return null;
  const sanitized = { ...item };
  delete sanitized.saldo_atual;
  delete sanitized.quantidade_atual;

  const status = computeDisponibilidade(
    item.saldo_atual ?? item.quantidade_atual,
    item.quantidade_solicitada ?? item.quantidade,
  );
  return {
    ...sanitized,
    ...status,
  };
}

async function checkDisponibilidadeBatch(db, itens) {
  if (!itens?.length) return [];

  const ids = [...new Set(itens.map((i) => Number(i.material_id)).filter(Boolean))];
  if (!ids.length) return [];

  const placeholders = ids.map(() => '?').join(',');
  const rows = await dbAll(
    db,
    `SELECT id, codigo, nome, unidade, quantidade_atual FROM materiais_almoxarifado WHERE id IN (${placeholders}) AND ativo = 1`,
    ids,
  );
  const byId = new Map(rows.map((r) => [r.id, r]));

  return itens.map((item) => {
    const mat = byId.get(Number(item.material_id));
    const qty = Number(item.quantidade) || 1;
    if (!mat) {
      return {
        material_id: item.material_id,
        quantidade: qty,
        disponibilidade: DISPONIBILIDADE.SEM_ESTOQUE,
        saldo_suficiente: false,
        disponibilidade_label: DISPONIBILIDADE_LABELS[DISPONIBILIDADE.SEM_ESTOQUE],
      };
    }
    return {
      material_id: mat.id,
      material_codigo: mat.codigo,
      material_nome: mat.nome,
      unidade: mat.unidade,
      quantidade: qty,
      ...computeDisponibilidade(mat.quantidade_atual, qty),
    };
  });
}

async function loadItensComDisponibilidade(db, itensRequisicao) {
  const checked = await checkDisponibilidadeBatch(
    db,
    itensRequisicao.map((i) => ({
      material_id: i.material_id,
      quantidade: i.quantidade_solicitada ?? i.quantidade,
    })),
  );
  return checked;
}

function filterItensSemEstoqueCompleto(itensComStatus) {
  return (itensComStatus || []).filter((i) => i.disponibilidade !== DISPONIBILIDADE.EM_ESTOQUE);
}

module.exports = {
  DISPONIBILIDADE,
  DISPONIBILIDADE_LABELS,
  computeDisponibilidade,
  sanitizeMaterialForSector,
  sanitizeRequisicaoItemForSector,
  checkDisponibilidadeBatch,
  loadItensComDisponibilidade,
  filterItensSemEstoqueCompleto,
};
