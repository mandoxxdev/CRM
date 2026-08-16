/**
 * Sobras/retalhos (Etapa 9, Task 1 — reforma).
 *
 * Ate aqui esta era uma ilha de 37 linhas: SQL direto sem validacao, sem auditoria, e o `user`
 * de atualizarSobra era parametro morto (a assinatura recebia, ninguem lia). Isso pagava a
 * pendencia nomeada na spec 23 — o unico servico de cauda do modulo sem auditoria.
 *
 * `criarSobra` NAO e mais exportado nem tem rota: o unico caminho de criacao passa a ser
 * gerarRetalho (Task 3), que grava as colunas novas de rastreamento (lote_origem_id,
 * material_retalho_id, movimentacao_baixa_id, movimentacao_entrada_id — ver comentario do
 * safeAlter em schema.js) que este INSERT legado nunca preenchia. Deixar o POST avulso vivo
 * recriaria a mesma ilha, so que com uma casca de validacao por cima.
 */
const { dbRun, dbAll, dbGet } = require('./db');
const { registrarAuditoria } = require('./audit');

async function listarSobras(db, filters = {}) {
  let sql = `SELECT s.*, l.codigo as localizacao_codigo
    FROM sobras_material_almoxarifado s
    LEFT JOIN localizacoes_almoxarifado l ON s.localizacao_id = l.id WHERE 1=1`;
  const params = [];
  if (filters.status) { sql += ' AND s.status = ?'; params.push(filters.status); }
  if (filters.disponivel) { sql += " AND s.status = 'DISPONIVEL' AND s.reutilizavel = 1"; }
  // material_id filtra pela ORIGEM (a sobra que veio de retalhar ESTE material — ver comentario
  // do safeAlter em schema.js), nao pelo material que a sobra representa no catalogo
  // (material_retalho_id, que a Task 3 preenche).
  if (filters.material_id) { sql += ' AND s.material_id = ?'; params.push(filters.material_id); }
  if (filters.q) {
    sql += ` AND (s.norma LIKE ? OR s.dimensoes_originais LIKE ? OR s.dimensoes_restantes LIKE ?
      OR s.material_descricao LIKE ?)`;
    const like = `%${filters.q}%`;
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY s.created_at DESC';
  return dbAll(db, sql, params);
}

async function atualizarSobra(db, user, id, data) {
  const anterior = await dbGet(db, 'SELECT * FROM sobras_material_almoxarifado WHERE id = ?', [id]);
  if (!anterior) {
    const err = new Error('Sobra não encontrada');
    err.status = 404;
    throw err;
  }

  await dbRun(db, `UPDATE sobras_material_almoxarifado SET
    status = COALESCE(?, status), localizacao_id = COALESCE(?, localizacao_id),
    observacoes = COALESCE(?, observacoes), reutilizavel = COALESCE(?, reutilizavel),
    updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [
      data.status || null,
      data.localizacao_id === undefined ? null : data.localizacao_id,
      data.observacoes === undefined ? null : data.observacoes,
      data.reutilizavel === undefined ? null : (data.reutilizavel ? 1 : 0),
      id,
    ]);

  const atual = await dbGet(db, 'SELECT * FROM sobras_material_almoxarifado WHERE id = ?', [id]);

  // O `user` deixa de ser parametro morto: grava quem agiu, com o antes/depois completo — o
  // pedaco da spec 23 que faltava fechar neste servico.
  await registrarAuditoria(db, {
    entidade: 'sobra',
    entidade_id: Number(id),
    acao: 'atualizar',
    usuario_id: user && user.id,
    usuario_nome: user && user.nome,
    dados_anteriores: anterior,
    dados_novos: atual,
  });

  return atual;
}

module.exports = { listarSobras, atualizarSobra };
