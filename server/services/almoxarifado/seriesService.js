/**
 * Dono unico de series_almoxarifado (Etapa 6b). Molde: lotService — guarda no WHERE,
 * justificativa obrigatoria onde ha decisao humana, auditoria com entidade='serie'.
 * Serie e 1 linha por unidade fisica: nao existe quantidade aqui. "Presente no estoque"
 * significa status EM_ESTOQUE ou BLOQUEADA; so EM_ESTOQUE e elegivel para saida.
 */
const { dbGet, dbAll, dbRun } = require('./db');
const { registrarAuditoria } = require('./audit');

const STATUS_SERIE = ['EM_ESTOQUE', 'BLOQUEADA', 'ENTREGUE', 'SUCATEADA', 'ESTORNADA'];
const STATUS_PRESENTES = ['EM_ESTOQUE', 'BLOQUEADA'];

function erro(msg, status = 400) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

async function getSerie(db, id) {
  return dbGet(db, 'SELECT * FROM series_almoxarifado WHERE id = ?', [id]);
}

async function getSeriePorNumero(db, materialId, numero) {
  return dbGet(db, 'SELECT * FROM series_almoxarifado WHERE material_id = ? AND numero = ?',
    [materialId, String(numero).trim()]);
}

async function listarSeriesDoMaterial(db, materialId, { status } = {}) {
  const where = ['s.material_id = ?'];
  const params = [materialId];
  if (status) { where.push('s.status = ?'); params.push(status); }
  return dbAll(db, `
    SELECT s.*, lt.codigo AS lote_codigo, loc.descricao AS localizacao_descricao
      FROM series_almoxarifado s
      LEFT JOIN lotes_almoxarifado lt ON lt.id = s.lote_id
      LEFT JOIN localizacoes_almoxarifado loc ON loc.id = s.localizacao_id
     WHERE ${where.join(' AND ')}
     ORDER BY s.numero`, params);
}

/**
 * Entrada de N series. Para cada numero: nao existe -> cria EM_ESTOQUE; existe fora do
 * estoque (ENTREGUE/SUCATEADA/ESTORNADA) -> reativa com guarda no WHERE; existe presente ->
 * erro 400 (e desfaz o que esta chamada ja tinha feito — nao ha transacao, a compensacao
 * e explicita como no resto do motor).
 * Devolve afetadas[] = { acao, anterior, linha } para o chamador poder compensar depois.
 */
async function entradaSeries(db, user, { material_id, numeros, lote_id = null, localizacao_id = null, movimentacao_id = null }) {
  const lista = (numeros || []).map((n) => String(n).trim()).filter(Boolean);
  const unicos = new Set(lista);
  if (unicos.size !== lista.length) {
    throw erro('numeros de serie repetidos na lista informada');
  }
  const afetadas = [];
  for (const numero of lista) {
    const existente = await getSeriePorNumero(db, material_id, numero);
    if (!existente) {
      const linha = await dbGet(db, `
        INSERT INTO series_almoxarifado
          (material_id, numero, status, lote_id, localizacao_id, movimentacao_entrada_id, created_por)
        VALUES (?, ?, 'EM_ESTOQUE', ?, ?, ?, ?) RETURNING *`,
        [material_id, numero, lote_id, localizacao_id, movimentacao_id, user?.id || null]);
      afetadas.push({ acao: 'CRIACAO', anterior: null, linha });
      await registrarAuditoria(db, {
        entidade: 'serie', entidade_id: linha.id, acao: 'CRIACAO',
        usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
        dados_novos: { numero, material_id, status: 'EM_ESTOQUE', lote_id },
      });
      continue;
    }
    if (STATUS_PRESENTES.includes(existente.status)) {
      await desfazerEntrada(db, afetadas);
      throw erro(`serie ${numero} ja esta em estoque`);
    }
    const linha = await dbGet(db, `
      UPDATE series_almoxarifado
         SET status = 'EM_ESTOQUE', status_motivo = NULL, lote_id = ?, localizacao_id = ?,
             movimentacao_entrada_id = ?, movimentacao_saida_id = NULL,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = ? RETURNING *`,
      [lote_id, localizacao_id, movimentacao_id, existente.id, existente.status]);
    if (!linha) {
      await desfazerEntrada(db, afetadas);
      throw erro(`serie ${numero} mudou durante a operacao — tente novamente`, 409);
    }
    afetadas.push({ acao: 'REATIVACAO', anterior: existente, linha });
    await registrarAuditoria(db, {
      entidade: 'serie', entidade_id: linha.id, acao: 'REATIVACAO',
      usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
      dados_anteriores: { status: existente.status },
      dados_novos: { status: 'EM_ESTOQUE', lote_id },
    });
  }
  return afetadas;
}

/** Compensacao da entradaSeries: apaga criadas, restaura reativadas. */
async function desfazerEntrada(db, afetadas) {
  for (const a of [...afetadas].reverse()) {
    if (a.acao === 'CRIACAO') {
      await dbRun(db, 'DELETE FROM series_almoxarifado WHERE id = ?', [a.linha.id]);
    } else {
      await dbRun(db, `
        UPDATE series_almoxarifado
           SET status = ?, status_motivo = ?, lote_id = ?, localizacao_id = ?,
               movimentacao_entrada_id = ?, movimentacao_saida_id = ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [a.anterior.status, a.anterior.status_motivo, a.anterior.lote_id,
         a.anterior.localizacao_id, a.anterior.movimentacao_entrada_id,
         a.anterior.movimentacao_saida_id, a.linha.id]);
    }
  }
}

module.exports = {
  STATUS_SERIE,
  STATUS_PRESENTES,
  getSerie,
  getSeriePorNumero,
  listarSeriesDoMaterial,
  entradaSeries,
  desfazerEntrada,
};
