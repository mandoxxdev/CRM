const { dbAll, dbGet } = require('./db');
const { disponivelSql } = require('./availabilitySql');

async function relatorioEstoqueAtual(db) {
  // Etapa 8, Task 1 (classe A): relatorio de posicao do estoque PROPRIO. valor_total somando
  // material de cliente contabilizaria patrimonio de terceiro como nosso. A posicao POR CLIENTE
  // tem tela e rota proprias (clienteEstoqueService, Task 8).
  return dbAll(db, `SELECT m.*,
    ${disponivelSql('m')} as disponivel,
    (m.quantidade_atual * COALESCE(m.custo_medio, m.custo_unitario, 0)) as valor_total
    FROM materiais_almoxarifado m
    WHERE m.ativo = 1 AND m.proprietario_cliente_id IS NULL
    ORDER BY m.categoria, m.nome`);
}

async function relatorioAbaixoMinimo(db) {
  // Etapa 8, Task 1 (classe A): mesma semantica de reposicao do alertService — material de
  // cliente nao se repoe.
  return dbAll(db, `SELECT * FROM materiais_almoxarifado
    WHERE ativo = 1 AND quantidade_atual <= quantidade_minima AND quantidade_minima > 0
      AND proprietario_cliente_id IS NULL
    ORDER BY (quantidade_atual / NULLIF(quantidade_minima, 0))`);
}

async function relatorioReservadoPorOS(db, osId) {
  let sql = `SELECT r.*, m.nome as material_nome, m.codigo as material_codigo, m.unidade
    FROM reservas_material_almoxarifado r
    JOIN materiais_almoxarifado m ON r.material_id = m.id
    WHERE r.status = 'ATIVA'`;
  const params = [];
  if (osId) { sql += ' AND (r.os_id = ? OR r.os_referencia = ?)'; params.push(osId, String(osId)); }
  sql += ' ORDER BY r.created_at DESC';
  return dbAll(db, sql, params);
}

async function relatorioConsumoPorOS(db, osId, dataInicio, dataFim) {
  let sql = `SELECT m.material_id, ma.nome, ma.codigo, SUM(m.quantidade) as total_consumido, m.os_id
    FROM movimentacoes_almoxarifado m
    JOIN materiais_almoxarifado ma ON m.material_id = ma.id
    WHERE m.tipo IN ('SAIDA','SAIDA_PRODUCAO','SAIDA_MONTAGEM','SAIDA_ASSISTENCIA') AND m.cancelado = 0`;
  const params = [];
  if (osId) { sql += ' AND m.os_id = ?'; params.push(osId); }
  if (dataInicio) { sql += ' AND DATE(m.created_at) >= ?'; params.push(dataInicio); }
  if (dataFim) { sql += ' AND DATE(m.created_at) <= ?'; params.push(dataFim); }
  sql += ' GROUP BY m.material_id, m.os_id ORDER BY total_consumido DESC';
  return dbAll(db, sql, params);
}

async function relatorioRecebimentosPendentes(db) {
  return dbAll(db, `SELECT * FROM recebimentos_material_almoxarifado
    WHERE status IN ('RECEBIDO','EM_CONFERENCIA','PARCIALMENTE_APROVADO') ORDER BY created_at`);
}

async function relatorioMateriaisBloqueados(db) {
  // Etapa 8, Task 1, classe C da auditoria: NAO filtra o dono de proposito. E relatorio de
  // QUALIDADE — material de cliente bloqueado e exatamente o que o almoxarife precisa ver, e
  // esconde-lo aqui apagaria fato fisico real. O selo de propriedade (Task 9) e o que evita a
  // confusao, nao o filtro. Nao "uniformizar" com relatorioEstoqueAtual logo acima.
  return dbAll(db, `SELECT * FROM materiais_almoxarifado
    WHERE ativo = 1 AND COALESCE(quantidade_bloqueada,0) > 0 ORDER BY nome`);
}

async function relatorioHistoricoMovimentacoes(db, filters = {}) {
  let sql = `SELECT m.*, ma.nome as material_nome, ma.codigo as material_codigo
    FROM movimentacoes_almoxarifado m
    JOIN materiais_almoxarifado ma ON m.material_id = ma.id WHERE m.cancelado = 0`;
  const params = [];
  if (filters.material_id) { sql += ' AND m.material_id = ?'; params.push(filters.material_id); }
  if (filters.tipo) { sql += ' AND m.tipo = ?'; params.push(filters.tipo); }
  if (filters.data_inicio) { sql += ' AND DATE(m.created_at) >= ?'; params.push(filters.data_inicio); }
  if (filters.data_fim) { sql += ' AND DATE(m.created_at) <= ?'; params.push(filters.data_fim); }
  sql += ' ORDER BY m.created_at DESC LIMIT 500';
  return dbAll(db, sql, params);
}

async function relatorioInventarioDivergencias(db) {
  return dbAll(db, `SELECT ic.*, c.numero as conferencia_numero, ma.nome as material_nome, ma.codigo
    FROM itens_conferencia_almoxarifado ic
    JOIN conferencias_almoxarifado c ON ic.conferencia_id = c.id
    JOIN materiais_almoxarifado ma ON ic.material_id = ma.id
    WHERE ic.divergencia IS NOT NULL AND ic.divergencia != 0
    ORDER BY c.created_at DESC`);
}

async function relatorioMateriaisMaisConsumidos(db, dataInicio, dataFim) {
  let sql = `SELECT ma.id as material_id, ma.nome, ma.codigo, ma.unidade, SUM(m.quantidade) as total_consumido
    FROM movimentacoes_almoxarifado m
    JOIN materiais_almoxarifado ma ON m.material_id = ma.id
    WHERE m.tipo IN ('SAIDA','SAIDA_PRODUCAO','SAIDA_MONTAGEM','SAIDA_ASSISTENCIA') AND m.cancelado = 0`;
  const params = [];
  if (dataInicio) { sql += ' AND DATE(m.created_at) >= ?'; params.push(dataInicio); }
  if (dataFim) { sql += ' AND DATE(m.created_at) <= ?'; params.push(dataFim); }
  sql += ' GROUP BY ma.id ORDER BY total_consumido DESC LIMIT 10';
  return dbAll(db, sql, params);
}

async function relatorioConsumoPeriodo(db, dataInicio, dataFim, projetoId, clienteId) {
  let sql = `SELECT ma.categoria, ma.nome, SUM(m.quantidade) as total, m.projeto_id, m.cliente_id
    FROM movimentacoes_almoxarifado m
    JOIN materiais_almoxarifado ma ON m.material_id = ma.id
    WHERE m.tipo LIKE 'SAIDA%' AND m.cancelado = 0`;
  const params = [];
  if (dataInicio) { sql += ' AND DATE(m.created_at) >= ?'; params.push(dataInicio); }
  if (dataFim) { sql += ' AND DATE(m.created_at) <= ?'; params.push(dataFim); }
  if (projetoId) { sql += ' AND m.projeto_id = ?'; params.push(projetoId); }
  if (clienteId) { sql += ' AND m.cliente_id = ?'; params.push(clienteId); }
  sql += ' GROUP BY ma.id, m.projeto_id, m.cliente_id ORDER BY total DESC';
  return dbAll(db, sql, params);
}

async function relatorioFerramentasEmprestadas(db) {
  return dbAll(db, `SELECT e.*, f.nome, f.codigo_patrimonio FROM emprestimos_ferramenta_almoxarifado e
    JOIN ferramentas_almoxarifado f ON e.ferramenta_id = f.id
    WHERE e.status = 'EMPRESTADA' ORDER BY e.data_retirada`);
}

async function relatorioEPIPorColaborador(db) {
  return dbAll(db, `SELECT e.colaborador_nome, e.setor, f.nome as ferramenta, e.data_retirada
    FROM emprestimos_ferramenta_almoxarifado e
    JOIN ferramentas_almoxarifado f ON e.ferramenta_id = f.id
    WHERE f.tipo = 'EPI' AND e.status = 'EMPRESTADA'`);
}

async function relatorioSolicitacoesCompraPendentes(db) {
  return dbAll(db, `SELECT s.*, m.nome as material_nome, m.codigo as material_codigo
    FROM solicitacoes_compra_almoxarifado s
    JOIN materiais_almoxarifado m ON s.material_id = m.id
    WHERE s.status = 'PENDENTE' ORDER BY s.created_at`);
}

module.exports = {
  relatorioEstoqueAtual, relatorioAbaixoMinimo, relatorioReservadoPorOS,
  relatorioConsumoPorOS, relatorioMateriaisMaisConsumidos, relatorioRecebimentosPendentes,
  relatorioMateriaisBloqueados, relatorioHistoricoMovimentacoes, relatorioInventarioDivergencias,
  relatorioConsumoPeriodo, relatorioFerramentasEmprestadas, relatorioEPIPorColaborador,
  relatorioSolicitacoesCompraPendentes,
};
