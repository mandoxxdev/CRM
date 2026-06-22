const { dbRun, dbAll, dbGet } = require('./db');
const { registrarMovimentacao } = require('./stockService');
const { registrarAuditoria } = require('./audit');

const MOTIVOS = ['SOBRA_PROJETO', 'NAO_UTILIZADO', 'ITEM_ERRADO', 'DANIFICADO', 'RECUPERAVEL', 'SUCATA'];
const DESTINOS = ['ESTOQUE', 'QUARENTENA', 'SUCATA', 'RETRABALHO'];

async function registrarDevolucao(db, user, data) {
  const { material_id, quantidade, motivo, condicao, destino, origem_os_id, origem_projeto_id, observacoes, localizacao_id } = data;
  if (!material_id || !quantidade || !motivo) {
    throw Object.assign(new Error('material_id, quantidade e motivo são obrigatórios'), { status: 400 });
  }

  const r = await dbRun(db, `INSERT INTO devolucoes_material_almoxarifado
    (material_id, quantidade, motivo, condicao, destino, origem_os_id, origem_projeto_id, responsavel_id, responsavel_nome, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [
    material_id, quantidade, motivo, condicao || null, destino || 'ESTOQUE',
    origem_os_id || null, origem_projeto_id || null,
    user.id, user.nome || user.email, observacoes || null,
  ]);

  if (destino === 'ESTOQUE' || destino === 'QUARENTENA') {
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'ENTRADA_DEVOLUCAO', quantidade,
      motivo, os_id: origem_os_id, projeto_id: origem_projeto_id,
      localizacao_destino_id: localizacao_id,
      justificativa: observacoes, referencia: `DEV-${r.lastID}`,
    });
    if (destino === 'QUARENTENA') {
      await registrarMovimentacao(db, user, {
        material_id, tipo: 'BLOQUEIO', quantidade, motivo: 'Devolução para quarentena',
      });
    }
  } else if (destino === 'SUCATA') {
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'SUCATA', quantidade, motivo, os_id: origem_os_id,
    });
  } else if (destino === 'RETRABALHO') {
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'RETRABALHO', quantidade, motivo, os_id: origem_os_id,
    });
  }

  await registrarAuditoria(db, { entidade: 'devolucao', entidade_id: r.lastID, acao: 'CRIACAO', usuario_id: user.id, usuario_nome: user.nome || user.email });
  return { id: r.lastID };
}

async function listarDevolucoes(db, filters = {}) {
  let sql = `SELECT d.*, m.nome as material_nome, m.codigo as material_codigo
    FROM devolucoes_material_almoxarifado d
    JOIN materiais_almoxarifado m ON d.material_id = m.id WHERE 1=1`;
  const params = [];
  if (filters.material_id) { sql += ' AND d.material_id = ?'; params.push(filters.material_id); }
  sql += ' ORDER BY d.created_at DESC';
  return dbAll(db, sql, params);
}

module.exports = { MOTIVOS, DESTINOS, registrarDevolucao, listarDevolucoes };
