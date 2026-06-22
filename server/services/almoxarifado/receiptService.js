const { dbRun, dbGet, dbAll } = require('./db');
const { registrarAuditoria } = require('./audit');
const { registrarMovimentacao } = require('./stockService');

function gerarNumero(prefix) {
  return `${prefix}-${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)}`;
}

async function criarRecebimento(db, user, data) {
  const { pedido_compra_id, nota_fiscal, fornecedor_id, fornecedor_nome, observacoes, itens } = data;
  if (!itens?.length) throw Object.assign(new Error('Inclua ao menos um item'), { status: 400 });

  const numero = gerarNumero('REC');
  const r = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
    (numero, pedido_compra_id, nota_fiscal, fornecedor_id, fornecedor_nome, status, responsavel_id, responsavel_nome, observacoes)
    VALUES (?,?,?,?,?,'RECEBIDO',?,?,?)`, [
    numero, pedido_compra_id || null, nota_fiscal || null,
    fornecedor_id || null, fornecedor_nome || null,
    user.id, user.nome || user.email, observacoes || null,
  ]);

  for (const item of itens) {
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote, observacoes)
      VALUES (?,?,?,?,?,?)`, [
      r.lastID, item.material_id, item.quantidade_esperada || item.quantidade,
      item.quantidade_recebida || item.quantidade, item.lote || null, item.observacoes || null,
    ]);
  }

  await registrarAuditoria(db, { entidade: 'recebimento', entidade_id: r.lastID, acao: 'CRIACAO', usuario_id: user.id, usuario_nome: user.nome || user.email });
  return { id: r.lastID, numero, status: 'RECEBIDO' };
}

async function conferirRecebimento(db, user, recebimentoId, data) {
  const { status, itens } = data;
  const validStatus = ['EM_CONFERENCIA', 'APROVADO', 'REPROVADO', 'PARCIALMENTE_APROVADO', 'BLOQUEADO'];
  if (status && !validStatus.includes(status)) throw Object.assign(new Error('Status inválido'), { status: 400 });

  if (status) {
    await dbRun(db, 'UPDATE recebimentos_material_almoxarifado SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, recebimentoId]);
  }

  if (itens) {
    for (const item of itens) {
      await dbRun(db, `UPDATE recebimentos_material_itens_almoxarifado SET
        quantidade_recebida = ?, conferencia_quantidade = ?, conferencia_descricao = ?, observacoes = ?
        WHERE id = ? AND recebimento_id = ?`, [
        item.quantidade_recebida, item.conferencia_quantidade ? 1 : 0,
        item.conferencia_descricao ? 1 : 0, item.observacoes || null,
        item.id, recebimentoId,
      ]);
    }
  }

  return { success: true };
}

async function inspecionarItem(db, user, itemId, data) {
  const item = await dbGet(db, 'SELECT ri.*, m.material_critico FROM recebimentos_material_itens_almoxarifado ri JOIN materiais_almoxarifado m ON ri.material_id = m.id WHERE ri.id = ?', [itemId]);
  if (!item) throw Object.assign(new Error('Item não encontrado'), { status: 404 });

  const r = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
    (recebimento_item_id, conforme, divergencia_quantidade, divergencia_dimensional, certificado_ausente,
     dano_fisico, material_incorreto, acao, responsavel_id, responsavel_nome, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    itemId, data.conforme ? 1 : 0, data.divergencia_quantidade ? 1 : 0,
    data.divergencia_dimensional ? 1 : 0, data.certificado_ausente ? 1 : 0,
    data.dano_fisico ? 1 : 0, data.material_incorreto ? 1 : 0,
    data.acao || null, user.id, user.nome || user.email, data.observacoes || null,
  ]);

  if (data.acao === 'BLOQUEAR') {
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = COALESCE(quantidade_bloqueada,0) + ?, quantidade_em_inspecao = COALESCE(quantidade_em_inspecao,0) + ? WHERE id = ?',
      [item.quantidade_recebida || 0, item.quantidade_recebida || 0, item.material_id]);
  }

  return { id: r.lastID };
}

async function aprovarRecebimento(db, user, recebimentoId, { localizacao_id } = {}) {
  const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recebimentoId]);
  if (!rec) throw Object.assign(new Error('Recebimento não encontrado'), { status: 404 });

  const itens = await dbAll(db, `SELECT ri.*, m.material_critico, m.controle_certificado
    FROM recebimentos_material_itens_almoxarifado ri
    JOIN materiais_almoxarifado m ON ri.material_id = m.id
    WHERE ri.recebimento_id = ?`, [recebimentoId]);

  for (const item of itens) {
    if (item.material_critico) {
      const insp = await dbGet(db, 'SELECT * FROM inspecoes_recebimento_almoxarifado WHERE recebimento_item_id = ? ORDER BY id DESC LIMIT 1', [item.id]);
      const cfg = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'inspecao_material_critico'");
      if (cfg?.valor === '1' && !insp) {
        throw Object.assign(new Error(`Item crítico #${item.id} requer inspeção`), { status: 400 });
      }
      if (insp && insp.acao === 'DEVOLVER') continue;
    }

    const qtd = item.quantidade_recebida || item.quantidade_esperada;
    if (qtd > 0) {
      await registrarMovimentacao(db, user, {
        material_id: item.material_id,
        tipo: 'ENTRADA_COMPRA',
        quantidade: qtd,
        motivo: `Recebimento ${rec.numero}`,
        referencia: rec.nota_fiscal,
        recebimento_id: recebimentoId,
        localizacao_destino_id: localizacao_id,
        lote: item.lote,
        documento_vinculado: rec.numero,
      });
    }
  }

  await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET status = 'APROVADO', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [recebimentoId]);
  return { success: true };
}

async function listarRecebimentos(db, filters = {}) {
  let sql = 'SELECT * FROM recebimentos_material_almoxarifado WHERE 1=1';
  const params = [];
  if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
  sql += ' ORDER BY created_at DESC';
  return dbAll(db, sql, params);
}

async function getRecebimento(db, id) {
  const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [id]);
  if (!rec) return null;
  const itens = await dbAll(db, `SELECT ri.*, m.nome as material_nome, m.codigo as material_codigo
    FROM recebimentos_material_itens_almoxarifado ri
    JOIN materiais_almoxarifado m ON ri.material_id = m.id
    WHERE ri.recebimento_id = ?`, [id]);
  return { ...rec, itens };
}

module.exports = {
  criarRecebimento, conferirRecebimento, inspecionarItem, aprovarRecebimento,
  listarRecebimentos, getRecebimento,
};
