const { dbRun, dbAll, dbGet } = require('./db');
const { registrarAuditoria } = require('./audit');

async function criarFerramenta(db, user, data) {
  const r = await dbRun(db, `INSERT INTO ferramentas_almoxarifado
    (codigo_patrimonio, nome, tipo, setor_responsavel, status, material_id, observacoes)
    VALUES (?,?,?,?,?,?,?)`, [
    data.codigo_patrimonio, data.nome, data.tipo || null, data.setor_responsavel || null,
    data.status || 'DISPONIVEL', data.material_id || null, data.observacoes || null,
  ]);
  await registrarAuditoria(db, { entidade: 'ferramenta', entidade_id: r.lastID, acao: 'CRIACAO', usuario_id: user.id, usuario_nome: user.nome || user.email });
  return { id: r.lastID };
}

async function emprestarFerramenta(db, user, ferramentaId, data) {
  const ferr = await dbGet(db, "SELECT * FROM ferramentas_almoxarifado WHERE id = ? AND status = 'DISPONIVEL'", [ferramentaId]);
  if (!ferr) throw Object.assign(new Error('Ferramenta indisponível'), { status: 400 });

  const r = await dbRun(db, `INSERT INTO emprestimos_ferramenta_almoxarifado
    (ferramenta_id, colaborador_id, colaborador_nome, setor, data_prevista_devolucao, observacoes)
    VALUES (?,?,?,?,?,?)`, [
    ferramentaId, data.colaborador_id || null, data.colaborador_nome,
    data.setor || null, data.data_prevista_devolucao || null, data.observacoes || null,
  ]);

  await dbRun(db, "UPDATE ferramentas_almoxarifado SET status = 'EMPRESTADA', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [ferramentaId]);
  return { id: r.lastID };
}

async function devolverFerramenta(db, user, emprestimoId) {
  const emp = await dbGet(db, "SELECT * FROM emprestimos_ferramenta_almoxarifado WHERE id = ? AND status = 'EMPRESTADA'", [emprestimoId]);
  if (!emp) throw Object.assign(new Error('Empréstimo não encontrado'), { status: 404 });

  await dbRun(db, "UPDATE emprestimos_ferramenta_almoxarifado SET status = 'DEVOLVIDA', data_devolucao_real = CURRENT_TIMESTAMP WHERE id = ?", [emprestimoId]);
  await dbRun(db, "UPDATE ferramentas_almoxarifado SET status = 'DISPONIVEL', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [emp.ferramenta_id]);
  return { success: true };
}

async function listarFerramentas(db, filters = {}) {
  let sql = 'SELECT * FROM ferramentas_almoxarifado WHERE ativo = 1';
  const params = [];
  if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
  sql += ' ORDER BY nome';
  return dbAll(db, sql, params);
}

async function listarEmprestimos(db, filters = {}) {
  let sql = `SELECT e.*, f.nome as ferramenta_nome, f.codigo_patrimonio
    FROM emprestimos_ferramenta_almoxarifado e
    JOIN ferramentas_almoxarifado f ON e.ferramenta_id = f.id WHERE 1=1`;
  const params = [];
  if (filters.status) { sql += ' AND e.status = ?'; params.push(filters.status); }
  sql += ' ORDER BY e.data_retirada DESC';
  return dbAll(db, sql, params);
}

module.exports = { criarFerramenta, emprestarFerramenta, devolverFerramenta, listarFerramentas, listarEmprestimos };
