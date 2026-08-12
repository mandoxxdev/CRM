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

  // `referencia` em TODAS as movimentacoes de TODOS os destinos (Etapa 7, Task 1). Ate aqui so
  // ESTOQUE/QUARENTENA gravavam: a devolucao que virava sucata ficava sem nenhum fio ligando o
  // lancamento do livro ao registro da devolucao.
  const referencia = `DEV-${r.lastID}`;

  if (destino === 'ESTOQUE' || destino === 'QUARENTENA') {
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'ENTRADA_DEVOLUCAO', quantidade,
      motivo, os_id: origem_os_id, projeto_id: origem_projeto_id,
      localizacao_destino_id: localizacao_id,
      justificativa: observacoes, referencia,
    });
    if (destino === 'QUARENTENA') {
      await registrarMovimentacao(db, user, {
        material_id, tipo: 'BLOQUEIO', quantidade, motivo: 'Devolução para quarentena',
        justificativa: 'Devolução recebida em quarentena para inspeção', referencia,
      });
    }
  } else if (destino === 'SUCATA') {
    // BUG CORRIGIDO NA ETAPA 7 (medido com sonda executada, 2026-08-12): o material devolvido
    // para sucata JA tinha saido do estoque na entrega. Emitir so o SUCATA (que e um tipo de
    // SAIDA para o motor) descontava de novo um saldo que nunca voltou — 100 -> saida 10 -> 90
    // -> devolucao 3 para sucata dava 87, quando o certo e 90. Agora entra e sai: o saldo fecha,
    // e o livro conta as duas coisas (voltou, e foi sucateada). Descartado: nao movimentar nada
    // no destino SUCATA — o saldo tambem ficaria certo, mas a sucata sumiria do livro, e a
    // feature 15 (retalhos e sucatas) vai precisar dela la.
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'ENTRADA_DEVOLUCAO', quantidade,
      motivo, os_id: origem_os_id, projeto_id: origem_projeto_id,
      localizacao_destino_id: localizacao_id,
      justificativa: observacoes, referencia,
    });
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'SUCATA', quantidade, motivo, os_id: origem_os_id,
      localizacao_origem_id: localizacao_id,
      justificativa: observacoes || motivo, referencia,
    });
  } else if (destino === 'RETRABALHO') {
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'RETRABALHO', quantidade, motivo, os_id: origem_os_id, referencia,
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
