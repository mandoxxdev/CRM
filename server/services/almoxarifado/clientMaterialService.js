const { dbRun, dbAll, dbGet } = require('./db');
const { registrarAuditoria } = require('./audit');

async function registrarMaterialCliente(db, user, data) {
  const saldo = (data.quantidade_recebida || 0) - (data.quantidade_consumida || 0);
  const r = await dbRun(db, `INSERT INTO materiais_cliente_almoxarifado
    (cliente_id, projeto_id, os_id, descricao, nota_remessa, quantidade_recebida, quantidade_consumida,
     quantidade_saldo, unidade, localizacao_id, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    data.cliente_id, data.projeto_id || null, data.os_id || null,
    data.descricao, data.nota_remessa || null,
    data.quantidade_recebida || 0, data.quantidade_consumida || 0, saldo,
    data.unidade || 'UN', data.localizacao_id || null, data.observacoes || null,
  ]);
  await registrarAuditoria(db, { entidade: 'material_cliente', entidade_id: r.lastID, acao: 'CRIACAO', usuario_id: user.id, usuario_nome: user.nome || user.email });
  return { id: r.lastID };
}

async function consumirMaterialCliente(db, user, id, quantidade, observacoes) {
  const mat = await dbGet(db, 'SELECT * FROM materiais_cliente_almoxarifado WHERE id = ? AND ativo = 1', [id]);
  if (!mat) throw Object.assign(new Error('Material do cliente não encontrado'), { status: 404 });
  if (mat.quantidade_saldo < quantidade) throw Object.assign(new Error('Saldo insuficiente'), { status: 400 });

  const novoConsumido = mat.quantidade_consumida + quantidade;
  const novoSaldo = mat.quantidade_recebida - novoConsumido;
  await dbRun(db, `UPDATE materiais_cliente_almoxarifado SET quantidade_consumida = ?, quantidade_saldo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [novoConsumido, novoSaldo, id]);

  await registrarAuditoria(db, {
    entidade: 'material_cliente', entidade_id: id, acao: 'CONSUMO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_novos: { quantidade, saldo: novoSaldo }, justificativa: observacoes,
  });
  return { quantidade_saldo: novoSaldo };
}

async function listarMateriaisCliente(db, filters = {}) {
  let sql = `SELECT mc.*, c.razao_social as cliente_nome
    FROM materiais_cliente_almoxarifado mc
    LEFT JOIN clientes c ON mc.cliente_id = c.id
    WHERE mc.ativo = 1`;
  const params = [];
  if (filters.cliente_id) { sql += ' AND mc.cliente_id = ?'; params.push(filters.cliente_id); }
  if (filters.projeto_id) { sql += ' AND mc.projeto_id = ?'; params.push(filters.projeto_id); }
  if (filters.os_id) { sql += ' AND mc.os_id = ?'; params.push(filters.os_id); }
  sql += ' ORDER BY mc.created_at DESC';
  return dbAll(db, sql, params);
}

module.exports = { registrarMaterialCliente, consumirMaterialCliente, listarMateriaisCliente };
