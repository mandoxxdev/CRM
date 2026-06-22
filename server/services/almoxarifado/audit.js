const { dbRun } = require('./db');

async function registrarAuditoria(db, {
  entidade, entidade_id, acao, usuario_id, usuario_nome, dados_anteriores, dados_novos, justificativa,
}) {
  await dbRun(db, `INSERT INTO auditoria_log_almoxarifado
    (entidade, entidade_id, acao, usuario_id, usuario_nome, dados_anteriores, dados_novos, justificativa)
    VALUES (?,?,?,?,?,?,?,?)`, [
    entidade,
    entidade_id || null,
    acao,
    usuario_id || null,
    usuario_nome || null,
    dados_anteriores ? JSON.stringify(dados_anteriores) : null,
    dados_novos ? JSON.stringify(dados_novos) : null,
    justificativa || null,
  ]);
}

module.exports = { registrarAuditoria };
