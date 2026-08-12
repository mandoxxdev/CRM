const { dbRun, dbGet, dbAll } = require('./db');

async function verificarEstoqueMinimo(db) {
  const criticos = await dbAll(db, `SELECT * FROM materiais_almoxarifado
    WHERE ativo = 1 AND quantidade_atual <= quantidade_minima AND quantidade_minima > 0
      -- Etapa 8, Task 1 (classe A): sem este filtro o sistema abriria solicitacao de COMPRA
      -- para repor material que nao e nosso. E o pior caso da falha silenciosa que a auditoria
      -- da Task 1 caca — ninguem percebe ate chegar o pedido ao fornecedor.
      AND proprietario_cliente_id IS NULL`);

  const criadas = [];
  for (const m of criticos) {
    const existente = await dbGet(db,
      "SELECT id FROM solicitacoes_compra_almoxarifado WHERE material_id = ? AND status = 'PENDENTE'", [m.id]);
    if (!existente) {
      const qtd = Math.max(m.quantidade_maxima - m.quantidade_atual, m.quantidade_minima);
      const r = await dbRun(db, `INSERT INTO solicitacoes_compra_almoxarifado (material_id, quantidade, motivo) VALUES (?,?,?)`,
        [m.id, qtd, 'ESTOQUE_MINIMO']);
      criadas.push({ material_id: m.id, solicitacao_id: r.lastID, quantidade: qtd });
    }
  }
  return criadas;
}

async function vincularPedidoCompra(db, solicitacaoId, pedidoCompraId) {
  await dbRun(db, "UPDATE solicitacoes_compra_almoxarifado SET pedido_compra_id = ?, status = 'VINCULADO' WHERE id = ?",
    [pedidoCompraId, solicitacaoId]);
  return { success: true };
}

module.exports = { verificarEstoqueMinimo, vincularPedidoCompra };
