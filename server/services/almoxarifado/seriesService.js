/**
 * Dono unico de series_almoxarifado (Etapa 6b). Molde: lotService — guarda no WHERE,
 * justificativa obrigatoria onde ha decisao humana, auditoria com entidade='serie'.
 * Serie e 1 linha por unidade fisica: nao existe quantidade aqui. "Presente no estoque"
 * significa status EM_ESTOQUE ou BLOQUEADA; so EM_ESTOQUE e elegivel para saida.
 */
const { dbGet, dbAll, dbRun } = require('./db');
const { registrarAuditoria } = require('./audit');

// Etapa 61: BAIXADA = serie dada como ausente na regularizacao (nao presente; ver regularizarSeries).
const STATUS_SERIE = ['EM_ESTOQUE', 'BLOQUEADA', 'ENTREGUE', 'SUCATEADA', 'ESTORNADA', 'BAIXADA'];
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
  // Etapa 62: a descida de um AJUSTE baixa a serie (BAIXADA, nao presente) — nao foi entregue a ninguem.
  const statusDestino = ['AJUSTE', 'AJUSTE_INVENTARIO'].includes(tipo) ? 'BAIXADA'
    : ['SUCATA', 'PERDA'].includes(tipo) ? 'SUCATEADA' : 'ENTREGUE';
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

/**
 * Estorno de saida: series daquela movimentacao voltam a EM_ESTOQUE.
 * Devolve afetadas[] = { anterior, linha } (fix round 1, Task 5) — não só a contagem — para o
 * chamador (`cancelarMovimentacao`) poder compensar com `desfazerReverterSaida` se o INSERT do
 * ledger de ESTORNO falhar DEPOIS que isto já rodou com sucesso. Sem o snapshot de `anterior`
 * (status ENTREGUE/SUCATEADA + `movimentacao_saida_id` original), não haveria como saber para
 * onde voltar.
 */
async function reverterSaida(db, user, movimentacaoId) {
  const linhas = await dbAll(db, `
    SELECT * FROM series_almoxarifado
     WHERE movimentacao_saida_id = ? AND status IN ('ENTREGUE','SUCATEADA')`, [movimentacaoId]);
  const afetadas = [];
  for (const s of linhas) {
    const linha = await dbGet(db, `
      UPDATE series_almoxarifado
         SET status = 'EM_ESTOQUE', movimentacao_saida_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = ? RETURNING *`, [s.id, s.status]);
    if (linha) {
      afetadas.push({ anterior: s, linha });
      await registrarAuditoria(db, {
        entidade: 'serie', entidade_id: linha.id, acao: 'ESTORNO_SAIDA',
        usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
        dados_anteriores: { status: s.status }, dados_novos: { status: 'EM_ESTOQUE' },
      });
    }
  }
  return afetadas;
}

/** Compensacao de reverterSaida: series voltam ao status (ENTREGUE/SUCATEADA) e ao vinculo
 * `movimentacao_saida_id` anteriores — usada quando o cancelamento que chamou reverterSaida
 * falha DEPOIS (ex.: INSERT do ledger de ESTORNO), então o estorno de saida nunca aconteceu de
 * verdade e a serie não pode ficar "presente" no estoque como se tivesse voltado. */
async function desfazerReverterSaida(db, afetadas) {
  for (const a of [...afetadas].reverse()) {
    const linha = await dbGet(db, `
      UPDATE series_almoxarifado
         SET status = ?, movimentacao_saida_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? RETURNING *`,
      [a.anterior.status, a.anterior.movimentacao_saida_id, a.linha.id]);
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

/**
 * Estorno de entrada: series ainda EM_ESTOQUE daquela movimentacao viram ESTORNADA.
 * Devolve afetadas[] = { anterior, linha } pelo mesmo motivo de `reverterSaida` acima.
 */
async function reverterEntrada(db, user, movimentacaoId) {
  const linhas = await dbAll(db, `
    SELECT * FROM series_almoxarifado
     WHERE movimentacao_entrada_id = ? AND status = 'EM_ESTOQUE'`, [movimentacaoId]);
  const afetadas = [];
  for (const s of linhas) {
    const linha = await dbGet(db, `
      UPDATE series_almoxarifado
         SET status = 'ESTORNADA', status_motivo = 'Entrada estornada', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'EM_ESTOQUE' RETURNING *`, [s.id]);
    if (linha) {
      afetadas.push({ anterior: s, linha });
      await registrarAuditoria(db, {
        entidade: 'serie', entidade_id: linha.id, acao: 'ESTORNO_ENTRADA',
        usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
        dados_anteriores: { status: 'EM_ESTOQUE' }, dados_novos: { status: 'ESTORNADA' },
      });
    }
  }
  return afetadas;
}

/** Compensacao de reverterEntrada: series voltam a EM_ESTOQUE com o `status_motivo` anterior
 * (tipicamente NULL) — mesma justificativa de `desfazerReverterSaida`, espelhada para o lado da
 * entrada. */
async function desfazerReverterEntrada(db, afetadas) {
  for (const a of [...afetadas].reverse()) {
    const linha = await dbGet(db, `
      UPDATE series_almoxarifado
         SET status = ?, status_motivo = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? RETURNING *`,
      [a.anterior.status, a.anterior.status_motivo, a.linha.id]);
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

/**
 * Etapa 61 (RN-06) — regulariza o invariante `COUNT(serie presente) == quantidade_atual` que as
 * entregas anteriores a esta etapa quebraram (o fisico baixava e a serie ficava EM_ESTOQUE) e o
 * estoque legado criado sem linhas de serie. Dois sentidos, e NUNCA cria divergencia nova:
 *  - `cadastrar` numeros de serie para fisico que nao tem serie — no maximo `fisico − presentes`;
 *  - `baixar` series "fantasma" (presentes mas ausentes) — no maximo `presentes − fisico`, status BAIXADA.
 * Sem movimentacao de estoque (o fisico ja esta certo); justificativa obrigatoria; auditado por serie.
 */
async function regularizarSeries(db, user, materialId, { cadastrar = [], baixar = [], justificativa, lote_id: loteBruto } = {}) {
  const just = String(justificativa || '').trim();
  if (just.length < 5) throw erro('justificativa obrigatoria (minimo 5 caracteres)');
  const material = await dbGet(db, 'SELECT id, codigo, quantidade_atual, controle_serie FROM materiais_almoxarifado WHERE id = ?', [materialId]);
  if (!material) throw erro('material nao encontrado', 404);
  if (!Number(material.controle_serie)) throw erro('material sem controle de serie');
  const numeros = Array.isArray(cadastrar) ? [...new Set(cadastrar.map((s) => String(s).trim()).filter(Boolean))] : [];
  const ids = Array.isArray(baixar) ? [...new Set(baixar.map(Number).filter((x) => Number.isInteger(x) && x > 0))] : [];
  if (!numeros.length && !ids.length) throw erro('informe series para cadastrar ou para baixar');
  // Fase 5: lote opcional para o que se cadastra — material com lote e serie ficava num beco (a
  // entrega filtra pelo lote e a serie cadastrada sem lote nunca aparecia).
  const loteId = loteBruto ? Number(loteBruto) : null;
  if (loteId) {
    const lote = await dbGet(db, 'SELECT id, material_id FROM lotes_almoxarifado WHERE id = ?', [loteId]);
    if (!lote || Number(lote.material_id) !== Number(materialId)) throw erro('lote nao pertence a este material');
  }
  const fisico = Number(material.quantidade_atual) || 0;
  const presentes = await contarPresentes(db, materialId);
  // Fase 5: floor nos DOIS sentidos — com fisico fracionario (2,5 e 3 presentes), ceil deixava baixar
  // 1 e criava a divergencia inversa (2 presentes contra 2,5). Serie e unidade inteira.
  if (numeros.length) {
    const max = Math.max(0, Math.floor(fisico - presentes + 1e-9));
    if (numeros.length > max) {
      throw erro(`cadastrar ${numeros.length} serie(s) passaria o fisico (${fisico}) — presentes ${presentes}, cadastre no maximo ${max}`);
    }
    for (const numero of numeros) {
      const existente = await getSeriePorNumero(db, materialId, numero);
      if (existente && existente.status !== 'BAIXADA') throw erro(`serie ${numero} ja existe neste material`);
    }
  }
  if (ids.length) {
    const max = Math.max(0, Math.floor(presentes - fisico + 1e-9));
    if (ids.length > max) {
      throw erro(`baixar ${ids.length} serie(s) deixaria menos series que o fisico (${fisico}) — presentes ${presentes}, baixe no maximo ${max}`);
    }
    const rows = await dbAll(db, `SELECT id, numero, material_id, status FROM series_almoxarifado WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    for (const x of ids) {
      const s = rows.find((r) => r.id === x);
      if (!s || Number(s.material_id) !== Number(materialId) || !STATUS_PRESENTES.includes(s.status)) {
        throw erro(`serie ${s ? s.numero : x} nao esta presente neste material`);
      }
    }
  }
  // Fase 5: cada escrita e UMA instrucao com o limite no proprio WHERE (duas abas nao passam juntas
  // do limite), e uma falha no meio desfaz o que esta chamada ja escreveu — a auditoria so e gravada
  // depois, quando tudo entrou. Nao ha transacao neste modulo; e o padrao dele (desfazerEntrada/Saida).
  const PRESENTES_SQL = `(SELECT COUNT(*) FROM series_almoxarifado WHERE material_id = ? AND status IN ('EM_ESTOQUE','BLOQUEADA'))`;
  const feitas = [];
  const desfazer = async () => {
    for (const f of feitas.reverse()) {
      if (f.tipo === 'insert') await dbRun(db, 'DELETE FROM series_almoxarifado WHERE id = ?', [f.id]);
      else await dbRun(db, 'UPDATE series_almoxarifado SET status = ?, status_motivo = ?, lote_id = ? WHERE id = ?', [f.status, f.motivo, f.lote_id, f.id]);
    }
  };
  try {
    for (const numero of numeros) {
      const existente = await getSeriePorNumero(db, materialId, numero);
      if (existente) {
        // Fase 5: a BAIXADA por engano volta por aqui (antes: "ja existe", sem saida).
        const r = await dbRun(db, `UPDATE series_almoxarifado SET status = 'EM_ESTOQUE', status_motivo = ?, lote_id = COALESCE(?, lote_id),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'BAIXADA' AND ${PRESENTES_SQL} < ?`, [just, loteId, existente.id, materialId, fisico]);
        if (!r.changes) throw erro(`serie ${numero}: o limite mudou ou ela ja foi reativada — recarregue`, 409);
        feitas.push({ tipo: 'update', id: existente.id, numero, status: 'BAIXADA', motivo: existente.status_motivo, lote_id: existente.lote_id, para: 'EM_ESTOQUE', de: 'BAIXADA' });
        continue;
      }
      let r;
      try {
        r = await dbRun(db, `INSERT INTO series_almoxarifado (material_id, numero, status, status_motivo, lote_id, created_por)
          SELECT ?, ?, 'EM_ESTOQUE', ?, ?, ? WHERE ${PRESENTES_SQL} < ?`,
        [materialId, numero, just, loteId, user?.id || null, materialId, fisico]);
      } catch (e) {
        if (String(e.message).includes('UNIQUE')) throw erro(`serie ${numero} ja existe neste material`, 409);
        throw e;
      }
      if (!r.changes) throw erro('o limite de series mudou durante a regularizacao — recarregue', 409);
      feitas.push({ tipo: 'insert', id: r.lastID, numero, para: 'EM_ESTOQUE', de: null });
    }
    for (const x of ids) {
      const antes = await getSerie(db, x);
      const r = await dbRun(db, `UPDATE series_almoxarifado SET status = 'BAIXADA', status_motivo = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status IN ('EM_ESTOQUE','BLOQUEADA') AND ${PRESENTES_SQL} > ?`, [just, x, materialId, fisico]);
      if (!r.changes) throw erro('status da serie ou o limite mudou durante a regularizacao — recarregue', 409);
      feitas.push({ tipo: 'update', id: x, numero: antes.numero, status: antes.status, motivo: antes.status_motivo, lote_id: antes.lote_id, para: 'BAIXADA', de: antes.status });
    }
  } catch (e) {
    await desfazer();
    throw e;
  }
  for (const a of feitas) {
    await registrarAuditoria(db, {
      entidade: 'serie', entidade_id: a.id, acao: 'REGULARIZACAO_SERIES',
      usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
      dados_anteriores: a.de ? { status: a.de } : null,
      dados_novos: { numero: a.numero, status: a.para, material_id: Number(materialId), ...(loteId && a.para === 'EM_ESTOQUE' ? { lote_id: loteId } : {}) },
      justificativa: just,
    });
  }
  return { cadastradas: numeros.length, baixadas: ids.length, presentes: await contarPresentes(db, materialId), fisico };
}

async function contarPresentes(db, materialId) {
  const r = await dbGet(db, `
    SELECT COUNT(*) AS n FROM series_almoxarifado
     WHERE material_id = ? AND status IN ('EM_ESTOQUE','BLOQUEADA')`, [materialId]);
  return r.n;
}

module.exports = {
  STATUS_SERIE,
  regularizarSeries,
  STATUS_PRESENTES,
  getSerie,
  getSeriePorNumero,
  listarSeriesDoMaterial,
  entradaSeries,
  desfazerEntrada,
  claimSaidaSeries,
  desfazerSaida,
  reverterSaida,
  desfazerReverterSaida,
  reverterEntrada,
  desfazerReverterEntrada,
  mudarStatusSerie,
  contarPresentes,
};
