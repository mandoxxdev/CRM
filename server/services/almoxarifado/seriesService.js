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
  try {
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
        throw erro(`serie ${numero} mudou durante a operacao — tente novamente`, 409);
      }
      afetadas.push({ acao: 'REATIVACAO', anterior: existente, linha });
      await registrarAuditoria(db, {
        entidade: 'serie', entidade_id: linha.id, acao: 'REATIVACAO',
        usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
        dados_anteriores: { status: existente.status, status_motivo: existente.status_motivo, lote_id: existente.lote_id, localizacao_id: existente.localizacao_id },
        dados_novos: { status: 'EM_ESTOQUE', status_motivo: null, lote_id, localizacao_id },
      });
    }
  } catch (e) {
    await desfazerEntrada(db, afetadas);
    throw e;
  }
  return afetadas;
}

/** Compensacao da entradaSeries: apaga criadas, restaura reativadas. */
async function desfazerEntrada(db, afetadas) {
  for (const a of [...afetadas].reverse()) {
    if (a.acao === 'CRIACAO') {
      await dbRun(db, 'DELETE FROM series_almoxarifado WHERE id = ?', [a.linha.id]);
      await registrarAuditoria(db, {
        entidade: 'serie', entidade_id: a.linha.id, acao: 'COMPENSACAO',
        usuario_id: null, usuario_nome: 'sistema',
        dados_anteriores: { status: 'EM_ESTOQUE' }, dados_novos: null,
        justificativa: 'compensacao automatica de operacao que falhou',
      });
    } else {
      const linha = await dbGet(db, `
        UPDATE series_almoxarifado
           SET status = ?, status_motivo = ?, lote_id = ?, localizacao_id = ?,
               movimentacao_entrada_id = ?, movimentacao_saida_id = ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ? RETURNING *`,
        [a.anterior.status, a.anterior.status_motivo, a.anterior.lote_id,
         a.anterior.localizacao_id, a.anterior.movimentacao_entrada_id,
         a.anterior.movimentacao_saida_id, a.linha.id]);
      if (linha) {
        await registrarAuditoria(db, {
          entidade: 'serie', entidade_id: linha.id, acao: 'COMPENSACAO',
          usuario_id: null, usuario_nome: 'sistema',
          dados_anteriores: { status: a.linha.status }, dados_novos: { status: a.anterior.status },
          justificativa: 'compensacao automatica de operacao que falhou',
        });
      }
    }
  }
}

/**
 * Claim atomico de saida, uma serie por vez, com a pre-condicao inteira no WHERE
 * (padrao liberarBloqueioPorCertificado do lotService). Falha em qualquer serie desfaz
 * os claims ja feitos desta chamada e nomeia a serie e o motivo.
 */
async function claimSaidaSeries(db, user, { material_id, serie_ids, lote_id = null, tipo, movimentacao_id = null }) {
  const lista = (serie_ids || []).filter(Boolean);
  const unicos = new Set(lista);
  if (unicos.size !== lista.length) {
    throw erro('serie_ids repetidos na lista informada');
  }
  const statusDestino = ['SUCATA', 'PERDA'].includes(tipo) ? 'SUCATEADA' : 'ENTREGUE';
  const claimed = [];
  try {
    for (const id of lista) {
      const linha = await dbGet(db, `
        UPDATE series_almoxarifado
           SET status = ?, movimentacao_saida_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND material_id = ? AND status = 'EM_ESTOQUE'
           AND (? IS NULL OR lote_id = ?)
         RETURNING *`,
        [statusDestino, movimentacao_id, id, material_id, lote_id, lote_id]);
      if (!linha) {
        const atual = await getSerie(db, id);
        if (!atual) throw erro(`serie id ${id} nao existe`);
        if (Number(atual.material_id) !== Number(material_id)) throw erro(`serie ${atual.numero} nao pertence a este material`);
        if (lote_id != null && Number(atual.lote_id) !== Number(lote_id)) throw erro(`serie ${atual.numero} nao pertence ao lote informado`);
        throw erro(`serie ${atual.numero} nao esta disponivel (status ${atual.status})`);
      }
      claimed.push({ linha });
      await registrarAuditoria(db, {
        entidade: 'serie', entidade_id: linha.id, acao: 'SAIDA',
        usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
        dados_anteriores: { status: 'EM_ESTOQUE' },
        dados_novos: { status: statusDestino, movimentacao_id },
      });
    }
  } catch (e) {
    await desfazerSaida(db, claimed);
    throw e;
  }
  return claimed;
}

/** Compensacao do claim: enquanto EM_ESTOQUE, movimentacao_saida_id e sempre NULL. */
async function desfazerSaida(db, claimed) {
  for (const c of [...claimed].reverse()) {
    const linha = await dbGet(db, `
      UPDATE series_almoxarifado
         SET status = 'EM_ESTOQUE', movimentacao_saida_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? RETURNING *`, [c.linha.id]);
    if (linha) {
      await registrarAuditoria(db, {
        entidade: 'serie', entidade_id: linha.id, acao: 'COMPENSACAO',
        usuario_id: null, usuario_nome: 'sistema',
        dados_anteriores: { status: c.linha.status }, dados_novos: { status: 'EM_ESTOQUE' },
        justificativa: 'compensacao automatica de operacao que falhou',
      });
    }
  }
}

/** Estorno de saida: series daquela movimentacao voltam a EM_ESTOQUE. */
async function reverterSaida(db, user, movimentacaoId) {
  const linhas = await dbAll(db, `
    SELECT * FROM series_almoxarifado
     WHERE movimentacao_saida_id = ? AND status IN ('ENTREGUE','SUCATEADA')`, [movimentacaoId]);
  let contagem = 0;
  for (const s of linhas) {
    const linha = await dbGet(db, `
      UPDATE series_almoxarifado
         SET status = 'EM_ESTOQUE', movimentacao_saida_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = ? RETURNING *`, [s.id, s.status]);
    if (linha) {
      contagem += 1;
      await registrarAuditoria(db, {
        entidade: 'serie', entidade_id: linha.id, acao: 'ESTORNO_SAIDA',
        usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
        dados_anteriores: { status: s.status }, dados_novos: { status: 'EM_ESTOQUE' },
      });
    }
  }
  return contagem;
}

/** Estorno de entrada: series ainda EM_ESTOQUE daquela movimentacao viram ESTORNADA. */
async function reverterEntrada(db, user, movimentacaoId) {
  const linhas = await dbAll(db, `
    SELECT * FROM series_almoxarifado
     WHERE movimentacao_entrada_id = ? AND status = 'EM_ESTOQUE'`, [movimentacaoId]);
  let contagem = 0;
  for (const s of linhas) {
    const linha = await dbGet(db, `
      UPDATE series_almoxarifado
         SET status = 'ESTORNADA', status_motivo = 'Entrada estornada', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'EM_ESTOQUE' RETURNING *`, [s.id]);
    if (linha) {
      contagem += 1;
      await registrarAuditoria(db, {
        entidade: 'serie', entidade_id: linha.id, acao: 'ESTORNO_ENTRADA',
        usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
        dados_anteriores: { status: 'EM_ESTOQUE' }, dados_novos: { status: 'ESTORNADA' },
      });
    }
  }
  return contagem;
}

/** Bloqueio/desbloqueio avulso — decisao humana: justificativa obrigatoria. */
async function mudarStatusSerie(db, user, serieId, novoStatus, justificativa) {
  if (!justificativa || !String(justificativa).trim()) {
    throw erro('justificativa e obrigatoria para mudar o status da serie');
  }
  if (!['BLOQUEADA', 'EM_ESTOQUE'].includes(novoStatus)) {
    throw erro(`status invalido para esta operacao: ${novoStatus}`);
  }
  const atual = await getSerie(db, serieId);
  if (!atual) throw erro('serie nao encontrada', 404);
  const transicaoOk = (atual.status === 'EM_ESTOQUE' && novoStatus === 'BLOQUEADA')
    || (atual.status === 'BLOQUEADA' && novoStatus === 'EM_ESTOQUE');
  if (!transicaoOk) {
    throw erro(`transicao invalida: ${atual.status} -> ${novoStatus}`);
  }
  const linha = await dbGet(db, `
    UPDATE series_almoxarifado
       SET status = ?, status_motivo = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = ? RETURNING *`,
    [novoStatus, String(justificativa).trim(), serieId, atual.status]);
  if (!linha) throw erro('status da serie mudou durante a operacao — recarregue', 409);
  await registrarAuditoria(db, {
    entidade: 'serie', entidade_id: linha.id, acao: 'MUDANCA_STATUS',
    usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
    dados_anteriores: { status: atual.status, status_motivo: atual.status_motivo },
    dados_novos: { status: novoStatus, status_motivo: linha.status_motivo },
    justificativa: String(justificativa).trim(),
  });
  return linha;
}

async function contarPresentes(db, materialId) {
  const r = await dbGet(db, `
    SELECT COUNT(*) AS n FROM series_almoxarifado
     WHERE material_id = ? AND status IN ('EM_ESTOQUE','BLOQUEADA')`, [materialId]);
  return r.n;
}

module.exports = {
  STATUS_SERIE,
  STATUS_PRESENTES,
  getSerie,
  getSeriePorNumero,
  listarSeriesDoMaterial,
  entradaSeries,
  desfazerEntrada,
  claimSaidaSeries,
  desfazerSaida,
  reverterSaida,
  reverterEntrada,
  mudarStatusSerie,
  contarPresentes,
};
