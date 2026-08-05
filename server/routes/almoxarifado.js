/**
 * Módulo Almoxarifado — GMP INDUSTRIAIS
 * Rotas: materiais, movimentações, conferências de estoque
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const alertService = require('../services/almoxarifado/alertService');
const requisitionNotificationService = require('../services/almoxarifado/requisitionNotificationService');
const purchaseNotifyService = require('../services/almoxarifado/requisitionPurchaseNotifyService');
const requisitionReminderService = require('../services/almoxarifado/requisitionReminderService');
const requisitionService = require('../services/almoxarifado/requisitionService');
const valueApprovalService = require('../services/almoxarifado/requisitionValueApprovalService');
const stockService = require('../services/almoxarifado/stockService');
const {
  materialPhotoFilename,
  materialPhotoUrl,
  enrichMaterialRow,
  enrichMaterialRows,
} = require('../services/almoxarifado/materialPhoto');
const { canConfigureAlmox, canDeleteAlmoxRequisicao, isSystemAdmin } = require('../services/systemPermissions');
const { dbRun, dbGet } = require('../services/almoxarifado/db');
const { validate } = require('../services/almoxarifado/validation');
const { MaterialSchema, MaterialUpdateSchema } = require('../services/almoxarifado/schemas');
const { registrarAuditoria } = require('../services/almoxarifado/audit');

function denyUnlessAlmoxAdmin(req, res) {
  if (!canConfigureAlmox(req.user)) {
    res.status(403).json({ error: 'Acesso restrito — administrador do Almoxarifado ou Super Administrador' });
    return true;
  }
  return false;
}

module.exports = function (app, db, authenticateToken, PERSISTENT_DATA_DIR, checkModulePermission) {

  // ── Diretório de fotos ──────────────────────────────────────────────────────
  const uploadsAlmoxDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'almoxarifado');
  if (!fs.existsSync(uploadsAlmoxDir)) fs.mkdirSync(uploadsAlmoxDir, { recursive: true });

  const storageAlmox = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsAlmoxDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `material-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
  });
  const uploadAlmox = multer({
    storage: storageAlmox,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (/^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.mimetype)) return cb(null, true);
      cb(new Error('Apenas imagens são permitidas'));
    }
  });

  // ── Schema único — todo o DDL do módulo vive em services/almoxarifado/schema.js ──
  const { initSchema } = require('../services/almoxarifado/schema');
  initSchema(db).catch((e) => console.error('❌ Erro no schema do almoxarifado:', e.message));

  // Servir fotos — padrão /api/uploads/almoxarifado (compatível com proxy /api)
  app.use('/api/uploads/almoxarifado', require('express').static(uploadsAlmoxDir));
  app.use('/uploads/almoxarifado', require('express').static(uploadsAlmoxDir));

  const almoxMiddleware = checkModulePermission
    ? [authenticateToken, checkModulePermission('almoxarifado')]
    : [authenticateToken];
  app.use('/api/almoxarifado', ...almoxMiddleware);


  // ════════════════════════════════════════════════════════════════════════════
  // MATERIAIS — CRUD
  // ════════════════════════════════════════════════════════════════════════════

  function buildLocalizacaoPath(loc, parent) {
    if (!loc) return '';
    const parts = [];
    if (loc.setor) parts.push(loc.setor);
    if (parent) parts.push(parent.subgrupo || parent.descricao || parent.codigo);
    if (loc.subgrupo) parts.push(loc.subgrupo);
    else if (loc.descricao && !parent) parts.push(loc.descricao);
    return parts.join(' / ');
  }

  function formatLocalizacaoLabel(loc, parent) {
    if (!loc) return null;
    const path = buildLocalizacaoPath(loc, parent);
    return path ? `${loc.codigo} — ${path}` : loc.codigo;
  }

  // Resolve o par (id, rótulo formatado) de uma localização padrão a partir do FK — usado
  // no cadastro de materiais (POST/PUT). Retorna { locId, locText }; locId é null quando o FK
  // não foi informado, locText é null quando a localização não existe mais (FK órfão).
  async function resolveLocalizacaoFromFk(localizacaoPadraoId) {
    const id = localizacaoPadraoId ? parseInt(localizacaoPadraoId, 10) : null;
    if (!id) return { locId: null, locText: null };
    const row = await dbGet(db,
      `SELECT l.id, l.codigo, l.descricao, l.setor, l.subgrupo, l.parent_id,
              p.codigo as parent_codigo, p.descricao as parent_descricao, p.subgrupo as parent_subgrupo
       FROM localizacoes_almoxarifado l
       LEFT JOIN localizacoes_almoxarifado p ON l.parent_id = p.id
       WHERE l.id = ?`,
      [id]);
    if (!row) return { locId: id, locText: null };
    const parent = row.parent_id ? {
      codigo: row.parent_codigo,
      descricao: row.parent_descricao,
      subgrupo: row.parent_subgrupo,
    } : null;
    return { locId: id, locText: formatLocalizacaoLabel(row, parent) };
  }

  // Resolve o almoxarifado_id a persistir numa localização: usa o valor informado,
  // ou (ausente) o id do ALM-GERAL como default — tolera a tabela almoxarifados ainda
  // não existir/estar vazia (fallback null, sem quebrar a criação da localização).
  function resolveAlmoxarifadoId(providedId, callback) {
    const id = providedId ? parseInt(providedId, 10) : null;
    if (id) return callback(null, id);
    db.get(`SELECT id FROM almoxarifados WHERE codigo = 'ALM-GERAL'`, [], (err, row) => {
      if (err) return callback(null, null);
      callback(null, row ? row.id : null);
    });
  }

  function checkSubgrupoDuplicado(dbConn, { subgrupo, setor, parent_id, excludeId }, callback) {
    if (!subgrupo || !String(subgrupo).trim()) return callback(null, false);
    dbConn.get(
      `SELECT id FROM localizacoes_almoxarifado
       WHERE ativo = 1 AND subgrupo = ? AND setor IS ? AND parent_id IS ? AND id != ?`,
      [String(subgrupo).trim(), setor || null, parent_id || null, excludeId || 0],
      (err, row) => callback(err, !!row)
    );
  }

  // GET /api/almoxarifado/materiais — listar
  app.get('/api/almoxarifado/materiais', async (req, res) => {
    const { search, categoria, status, familia_id, setor } = req.query;

    try {
      const sectorMaterialService = require('../services/almoxarifado/sectorMaterialService');
      await sectorMaterialService.ensureSetoresRequisicao(db);
      const filterClause = setor
        ? await sectorMaterialService.buildMaterialFilterClause(db, setor)
        : null;

      let sql = `SELECT m.*, f.nome as familia_nome, f.codigo as familia_codigo
                 FROM materiais_almoxarifado m
                 LEFT JOIN familias_material_almoxarifado f ON m.familia_id = f.id
                 WHERE 1=1`;
      const params = [];

      if (filterClause) sql += ` AND ${filterClause}`;
      if (search) {
        sql += ` AND (m.nome LIKE ? OR m.codigo LIKE ? OR m.descricao LIKE ? OR m.fornecedor_principal LIKE ?)`;
        const s = `%${search}%`;
        params.push(s, s, s, s);
      }
      if (categoria) {
        sql += ` AND m.categoria = ?`;
        params.push(categoria);
      }
      if (familia_id) {
        sql += ` AND m.familia_id = ?`;
        params.push(parseInt(familia_id, 10));
      }
      if (status === 'critico') {
        sql += ` AND m.quantidade_atual <= m.quantidade_minima AND m.quantidade_minima > 0`;
      } else if (status === 'ok') {
        sql += ` AND m.quantidade_atual > m.quantidade_minima`;
      } else if (status === 'zerado') {
        sql += ` AND m.quantidade_atual = 0`;
      }

      sql += ` AND m.ativo = 1 ORDER BY f.nome ASC, m.nome ASC`;

      db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(enrichMaterialRows(rows));
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/almoxarifado/materiais/dashboard — stats para o dashboard
  app.get('/api/almoxarifado/dashboard',(req, res) => {
    const stats = {};

    db.get(`SELECT COUNT(*) as total FROM materiais_almoxarifado WHERE ativo = 1`, [], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      stats.totalMateriais = row.total;

      db.get(`SELECT COUNT(*) as total FROM materiais_almoxarifado WHERE ativo = 1 AND quantidade_atual <= quantidade_minima AND quantidade_minima > 0`, [], (err2, row2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        stats.materiaisCriticos = row2.total;

        db.get(`SELECT COUNT(*) as total FROM materiais_almoxarifado WHERE ativo = 1 AND quantidade_atual = 0`, [], (err3, row3) => {
          if (err3) return res.status(500).json({ error: err3.message });
          stats.materiaisZerados = row3.total;

          db.get(`SELECT COALESCE(SUM(quantidade_atual * custo_unitario), 0) as total FROM materiais_almoxarifado WHERE ativo = 1`, [], (err4, row4) => {
            if (err4) return res.status(500).json({ error: err4.message });
            stats.valorTotalEstoque = row4.total;

            db.get(`SELECT COUNT(*) as total FROM movimentacoes_almoxarifado WHERE DATE(created_at) = DATE('now')`, [], (err5, row5) => {
              if (err5) return res.status(500).json({ error: err5.message });
              stats.movimentacoesHoje = row5.total;

              // Materiais críticos (lista)
              db.all(`SELECT id, codigo, nome, quantidade_atual, quantidade_minima, unidade, categoria
                      FROM materiais_almoxarifado
                      WHERE ativo = 1 AND quantidade_atual <= quantidade_minima AND quantidade_minima > 0
                      ORDER BY (quantidade_atual / NULLIF(quantidade_minima, 0)) ASC LIMIT 10`, [], (err6, criticos) => {
                if (err6) return res.status(500).json({ error: err6.message });
                stats.listaMateriaisCriticos = criticos;

                // Últimas movimentações
                db.all(`SELECT m.*, ma.nome as material_nome, ma.codigo as material_codigo, ma.unidade
                        FROM movimentacoes_almoxarifado m
                        JOIN materiais_almoxarifado ma ON m.material_id = ma.id
                        ORDER BY m.created_at DESC LIMIT 10`, [], (err7, ultimas) => {
                  if (err7) return res.status(500).json({ error: err7.message });
                  stats.ultimasMovimentacoes = ultimas;

                  // Movimentações por dia (últimos 7 dias)
                  db.all(`SELECT DATE(created_at) as dia, COUNT(*) as total, tipo
                          FROM movimentacoes_almoxarifado
                          WHERE created_at >= DATE('now', '-7 days')
                          GROUP BY dia, tipo ORDER BY dia`, [], (err8, grafico) => {
                    if (err8) return res.status(500).json({ error: err8.message });
                    stats.graficoMovimentacoes = grafico;
                    res.json(stats);
                  });
                });
              });
            });
          });
        });
      });
    });
  });

  // GET /api/almoxarifado/materiais/:id — detalhe
  app.get('/api/almoxarifado/materiais/:id',(req, res) => {
    db.get(`SELECT m.*, f.nome as familia_nome, f.codigo as familia_codigo
            FROM materiais_almoxarifado m
            LEFT JOIN familias_material_almoxarifado f ON m.familia_id = f.id
            WHERE m.id = ?`, [req.params.id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Material não encontrado' });
      res.json(enrichMaterialRow(row));
    });
  });

  async function validateFamiliaAtiva(familiaId) {
    if (!familiaId) return null;
    const row = await dbGet(db, 'SELECT id, ativo FROM familias_material_almoxarifado WHERE id = ?', [familiaId]);
    if (!row) throw new Error('Família não encontrada');
    if (row.ativo !== 1) throw new Error('Família inativa — não é possível vincular novos itens');
    return row;
  }

  // Subfamílias (Etapa 2, Task 3): quando informada, a subfamília do material precisa ser
  // filha (parent_id = familiaId) e ativa. familiaId pode ser null (família omitida no PUT
  // full-replace) — nesse caso nenhuma subfamília bate no WHERE e a validação falha, o que é
  // o comportamento correto (não existe família válida para amarrar a subfamília).
  async function validateSubfamilia(subfamiliaId, familiaId) {
    if (!subfamiliaId) return null;
    const row = await dbGet(db,
      'SELECT id FROM familias_material_almoxarifado WHERE id = ? AND parent_id = ? AND ativo = 1',
      [subfamiliaId, familiaId]);
    if (!row) throw new Error('Subfamília inválida para a família selecionada');
    return row;
  }

  function bool01(v) { return v ? 1 : 0; }

  const MATERIAL_BOOL_FIELDS = new Set([
    'material_critico', 'controle_lote', 'controle_certificado',
    'controle_serie', 'controle_validade', 'controle_corrida', 'requer_inspecao', 'requer_foto',
  ]);

  // Colunas de materiais_almoxarifado que o PUT sabe atualizar (preserve-when-omitted — ver
  // helper `val()` na rota). 'localizacao' (texto formatado) é derivada de localizacao_padrao_id
  // e não entra no merge genérico — é resolvida à parte via resolveLocalizacaoFromFk.
  const MATERIAL_UPDATE_COLUMNS = [
    'codigo', 'nome', 'descricao', 'categoria', 'unidade', 'localizacao',
    'quantidade_minima', 'quantidade_maxima', 'custo_unitario', 'fornecedor_principal',
    'codigo_fornecedor', 'ncm', 'especificacoes', 'observacoes', 'ativo',
    'descricao_tecnica', 'categoria_id', 'subcategoria_id', 'localizacao_padrao_id',
    'fornecedor_id', 'tipo_material', 'material_critico', 'controle_lote', 'controle_certificado',
    'familia_id', 'subfamilia_id',
    // Cadastro completo (Etapa 2, Task 4)
    'fabricante', 'codigo_fabricante', 'peso_unitario', 'dimensoes', 'material_construtivo',
    'norma', 'marca', 'modelo', 'aplicacao', 'ponto_reposicao', 'lote_economico',
    'controle_serie', 'controle_validade', 'controle_corrida', 'requer_inspecao', 'requer_foto',
    'classe_abc', 'unidade_compra', 'fator_conversao_compra', 'unidade_consumo', 'fator_conversao_consumo',
  ];

  // POST /api/almoxarifado/materiais — criar
  app.post('/api/almoxarifado/materiais', validate(MaterialSchema), async (req, res) => {
    const {
      codigo, nome, descricao, categoria, unidade,
      quantidade_atual, quantidade_minima, quantidade_maxima,
      custo_unitario, fornecedor_principal, codigo_fornecedor,
      ncm, especificacoes, observacoes,
      descricao_tecnica, categoria_id, subcategoria_id, localizacao_padrao_id,
      fornecedor_id, tipo_material, material_critico, controle_lote, controle_certificado,
      familia_id, subfamilia_id,
      fabricante, codigo_fabricante, peso_unitario, dimensoes, material_construtivo,
      norma, marca, modelo, aplicacao, ponto_reposicao, lote_economico,
      controle_serie, controle_validade, controle_corrida, requer_inspecao, requer_foto,
      classe_abc, unidade_compra, fator_conversao_compra, unidade_consumo, fator_conversao_consumo,
    } = req.body;

    try {
      await validateFamiliaAtiva(familia_id);
    } catch (errFam) {
      return res.status(400).json({ error: errFam.message });
    }

    try {
      await validateSubfamilia(subfamilia_id || null, familia_id);
    } catch (errSub) {
      return res.status(400).json({ error: errSub.message });
    }

    let locId, locText;
    try {
      ({ locId, locText } = await resolveLocalizacaoFromFk(localizacao_padrao_id));
    } catch (errLoc) {
      return res.status(500).json({ error: errLoc.message });
    }

    const insertValues = {
      codigo, nome,
      descricao: descricao || null,
      categoria: categoria || 'OUTROS',
      unidade: unidade || 'UN',
      localizacao: locText,
      quantidade_atual: quantidade_atual || 0,
      quantidade_minima: quantidade_minima || 0,
      quantidade_maxima: quantidade_maxima || 0,
      custo_unitario: custo_unitario || 0,
      fornecedor_principal: fornecedor_principal || null,
      codigo_fornecedor: codigo_fornecedor || null,
      ncm: ncm || null,
      especificacoes: especificacoes || null,
      observacoes: observacoes || null,
      descricao_tecnica: descricao_tecnica || null,
      categoria_id: categoria_id ?? null,
      subcategoria_id: subcategoria_id ?? null,
      localizacao_padrao_id: locId,
      fornecedor_id: fornecedor_id ?? null,
      tipo_material: tipo_material || null,
      material_critico: bool01(material_critico),
      controle_lote: bool01(controle_lote),
      controle_certificado: bool01(controle_certificado),
      familia_id,
      subfamilia_id: subfamilia_id ?? null,
      fabricante: fabricante || null,
      codigo_fabricante: codigo_fabricante || null,
      peso_unitario: peso_unitario ?? null,
      dimensoes: dimensoes || null,
      material_construtivo: material_construtivo || null,
      norma: norma || null,
      marca: marca || null,
      modelo: modelo || null,
      aplicacao: aplicacao || null,
      ponto_reposicao: ponto_reposicao ?? null,
      lote_economico: lote_economico ?? null,
      controle_serie: bool01(controle_serie),
      controle_validade: bool01(controle_validade),
      controle_corrida: bool01(controle_corrida),
      requer_inspecao: bool01(requer_inspecao),
      requer_foto: bool01(requer_foto),
      classe_abc: classe_abc || null,
      unidade_compra: unidade_compra || null,
      fator_conversao_compra: fator_conversao_compra ?? null,
      unidade_consumo: unidade_consumo || null,
      fator_conversao_consumo: fator_conversao_consumo ?? null,
    };
    const insertColumns = Object.keys(insertValues);

    try {
      const result = await dbRun(db, `INSERT INTO materiais_almoxarifado
        (${insertColumns.join(', ')})
        VALUES (${insertColumns.map(() => '?').join(',')})`,
        insertColumns.map((c) => insertValues[c]));
      const id = result.lastID;

      // Registrar movimentação inicial se quantidade > 0
      if ((quantidade_atual || 0) > 0) {
        await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
          (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, usuario_id, usuario_nome)
          VALUES (?, 'ENTRADA', ?, 0, ?, 'Saldo inicial de cadastro', ?, ?)`,
          [id, quantidade_atual, quantidade_atual, req.user.id, req.user.nome || req.user.email]);
      }

      await stockService.syncSaldoLocalizacaoPadrao(db, id).catch((e) => {
        console.warn('[almoxarifado] Falha ao sincronizar saldo por localização:', e.message);
      });

      await registrarAuditoria(db, {
        entidade: 'material', entidade_id: id, acao: 'CRIACAO',
        usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
        dados_novos: { codigo, nome, familia_id },
      });

      const row = await dbGet(db, `SELECT m.*, f.nome as familia_nome, f.codigo as familia_codigo
              FROM materiais_almoxarifado m
              LEFT JOIN familias_material_almoxarifado f ON m.familia_id = f.id
              WHERE m.id = ?`, [id]);
      res.status(201).json(row);
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Código já existe' });
      return res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/almoxarifado/materiais/:id — atualizar
  //
  // HARD REQUIREMENT (Etapa 2, Task 4 — mesma classe de bug corrigida 3x nas tasks
  // anteriores): preserve-when-omitted para TODA coluna, não só subfamilia_id. `val(k)` decide
  // por chave: `undefined` no body preserva o valor atual; qualquer valor explícito (incluindo
  // `null`) substitui. A tela atual (MaterialAlmoxarifadoForm.js) não manda os campos novos
  // deste task — sem essa preservação, editar nome/marca pelo formulário de hoje apagaria
  // fabricante/classe_abc/unidade_compra/etc. setados via API.
  app.put('/api/almoxarifado/materiais/:id', validate(MaterialUpdateSchema), async (req, res) => {
    let current;
    try {
      current = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [req.params.id]);
    } catch (errCurrent) {
      return res.status(500).json({ error: errCurrent.message });
    }
    if (!current) return res.status(404).json({ error: 'Material não encontrado' });

    const val = (k) => (req.body[k] === undefined ? current[k] : req.body[k]);

    const merged = {};
    for (const col of MATERIAL_UPDATE_COLUMNS) {
      if (col === 'localizacao') continue; // derivada de localizacao_padrao_id, resolvida abaixo
      merged[col] = MATERIAL_BOOL_FIELDS.has(col) ? bool01(val(col)) : val(col);
    }

    // Mesma semântica do T3 (comentário original preservado): só revalida quando o valor é
    // NOVO — informado explicitamente, OU a família efetiva mudou (um vínculo preservado pode
    // não ser filho da família nova). Um vínculo preservado com a MESMA família já era válido
    // quando foi setado; revalidar quebraria a edição de um material cuja subfamília foi
    // inativada depois.
    const familiaOmitted = req.body.familia_id === undefined;
    const familiaChanged = merged.familia_id !== current.familia_id;
    if (!familiaOmitted && familiaChanged) {
      try {
        await validateFamiliaAtiva(merged.familia_id);
      } catch (errFam) {
        return res.status(400).json({ error: errFam.message });
      }
    }

    const subfamiliaOmitted = req.body.subfamilia_id === undefined;
    if (merged.subfamilia_id && (!subfamiliaOmitted || familiaChanged)) {
      try {
        await validateSubfamilia(merged.subfamilia_id, merged.familia_id);
      } catch (errSub) {
        return res.status(400).json({ error: errSub.message });
      }
    }

    let locId, locText;
    try {
      ({ locId, locText } = await resolveLocalizacaoFromFk(merged.localizacao_padrao_id));
    } catch (errLoc) {
      return res.status(500).json({ error: errLoc.message });
    }
    merged.localizacao_padrao_id = locId;
    merged.localizacao = locText;

    try {
      await dbRun(db, `UPDATE materiais_almoxarifado SET
        ${MATERIAL_UPDATE_COLUMNS.map((c) => `${c} = ?`).join(', ')},
        updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [...MATERIAL_UPDATE_COLUMNS.map((c) => merged[c]), req.params.id]);
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Código já existe' });
      return res.status(500).json({ error: err.message });
    }

    // Auditoria com diff (spec 29 / Task 4): só os campos cujo valor final difere do valor
    // anterior entram no log — para colunas preservadas (omitidas no body) merged === current,
    // então elas nunca aparecem aqui.
    const dadosAnteriores = {};
    const dadosNovos = {};
    for (const f of MATERIAL_UPDATE_COLUMNS) {
      if (f === 'localizacao') continue; // derivada — o que importa para auditoria é o FK
      const oldVal = current[f] ?? null;
      const newVal = merged[f] ?? null;
      if (oldVal !== newVal) {
        dadosAnteriores[f] = current[f] ?? null;
        dadosNovos[f] = merged[f] ?? null;
      }
    }
    if (Object.keys(dadosNovos).length > 0) {
      await registrarAuditoria(db, {
        entidade: 'material', entidade_id: Number(req.params.id), acao: 'ATUALIZACAO',
        usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
        dados_anteriores: dadosAnteriores, dados_novos: dadosNovos,
      });
    }

    try {
      const row = await dbGet(db, `SELECT m.*, f.nome as familia_nome, f.codigo as familia_codigo
              FROM materiais_almoxarifado m
              LEFT JOIN familias_material_almoxarifado f ON m.familia_id = f.id
              WHERE m.id = ?`, [req.params.id]);
      const materialId = Number(req.params.id);
      await Promise.all([
        stockService.syncSaldoLocalizacaoPadrao(db, materialId).catch(() => null),
        alertService.verificarAlertaPorMaterialId(db, materialId).catch(() => null),
      ]);
      res.json(row);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/almoxarifado/materiais/:id — inativar
  app.delete('/api/almoxarifado/materiais/:id', async (req, res) => {
    try {
      await dbRun(db, `UPDATE materiais_almoxarifado SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/almoxarifado/materiais/:id/foto — upload de foto
  app.post('/api/almoxarifado/materiais/:id/foto',uploadAlmox.single('foto'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma foto enviada' });

    const filename = req.file.filename;

    // Remover foto antiga
    db.get(`SELECT foto FROM materiais_almoxarifado WHERE id = ?`, [req.params.id], (err, row) => {
      if (row && row.foto) {
        const oldFilename = materialPhotoFilename(row.foto);
        if (oldFilename) {
          const oldPath = path.join(uploadsAlmoxDir, oldFilename);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
      }
    });

    db.run(`UPDATE materiais_almoxarifado SET foto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [filename, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ foto: filename, foto_url: materialPhotoUrl(filename) });
      });
  });

  // POST /api/almoxarifado/materiais/gerar-codigo — gera próximo código
  app.get('/api/almoxarifado/proximo-codigo',(req, res) => {
    const { familia_id } = req.query;

    if (familia_id) {
      db.get('SELECT codigo FROM familias_material_almoxarifado WHERE id = ?', [familia_id], (err, fam) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!fam) return res.status(404).json({ error: 'Família não encontrada' });

        const prefix = fam.codigo;
        db.get(`SELECT codigo FROM materiais_almoxarifado
                WHERE familia_id = ? AND codigo LIKE ?
                ORDER BY id DESC LIMIT 1`,
          [familia_id, `${prefix}-%`],
          (err2, row) => {
            if (err2) return res.status(500).json({ error: err2.message });
            let nextCode = `${prefix}-001`;
            if (row && row.codigo) {
              const match = row.codigo.match(/-(\d+)$/);
              if (match) {
                const num = parseInt(match[1], 10) + 1;
                nextCode = `${prefix}-${String(num).padStart(3, '0')}`;
              }
            }
            res.json({ codigo: nextCode });
          });
      });
      return;
    }

    db.get(`SELECT codigo FROM materiais_almoxarifado ORDER BY id DESC LIMIT 1`, [], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });

      let nextCode = 'ALM-001';
      if (row && row.codigo) {
        const match = row.codigo.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1]) + 1;
          nextCode = `ALM-${String(num).padStart(3, '0')}`;
        }
      }
      res.json({ codigo: nextCode });
    });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // MOVIMENTAÇÕES
  // ════════════════════════════════════════════════════════════════════════════

  // GET /api/almoxarifado/movimentacoes — listar
  app.get('/api/almoxarifado/movimentacoes',(req, res) => {
    const { material_id, tipo, data_inicio, data_fim, limit, os_id, projeto_id, centro_custo_id, usuario_id, pendentes_regularizacao } = req.query;

    let sql = `SELECT m.*, ma.nome as material_nome, ma.codigo as material_codigo, ma.unidade,
               cc.codigo as centro_custo_codigo, cc.nome as centro_custo_nome
               FROM movimentacoes_almoxarifado m
               JOIN materiais_almoxarifado ma ON m.material_id = ma.id
               LEFT JOIN centros_custo_almoxarifado cc ON m.centro_custo_id = cc.id
               WHERE 1=1`;
    const params = [];

    if (material_id) { sql += ` AND m.material_id = ?`; params.push(material_id); }
    if (tipo) { sql += ` AND m.tipo = ?`; params.push(tipo); }
    if (data_inicio) { sql += ` AND DATE(m.created_at) >= ?`; params.push(data_inicio); }
    if (data_fim) { sql += ` AND DATE(m.created_at) <= ?`; params.push(data_fim); }
    if (os_id) { sql += ` AND m.os_id = ?`; params.push(os_id); }
    if (projeto_id) { sql += ` AND m.projeto_id = ?`; params.push(projeto_id); }
    if (centro_custo_id) { sql += ` AND m.centro_custo_id = ?`; params.push(centro_custo_id); }
    if (usuario_id) { sql += ` AND m.usuario_id = ?`; params.push(usuario_id); }
    if (pendentes_regularizacao === '1') { sql += ` AND m.regularizacao_pendente = 1 AND m.cancelado = 0`; }

    sql += ` ORDER BY m.created_at DESC`;
    if (limit) { sql += ` LIMIT ?`; params.push(parseInt(limit)); }

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // POST /api/almoxarifado/movimentacoes — registrar movimento
  // Compat v1: contrato antigo, motor novo (stockService = validações + auditoria + saldo por localização)
  app.post('/api/almoxarifado/movimentacoes', async (req, res) => {
    const { material_id, tipo, quantidade, motivo, referencia, observacoes } = req.body;

    if (!['ENTRADA', 'SAIDA', 'AJUSTE', 'DEVOLUCAO'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido. Use ENTRADA, SAIDA, AJUSTE ou DEVOLUCAO' });
    }
    if ((tipo === 'SAIDA' || tipo === 'AJUSTE') && !motivo) {
      return res.status(400).json({ error: 'Motivo é obrigatório para saída e ajuste' });
    }

    try {
      const result = await stockService.registrarMovimentacao(db, req.user, {
        material_id, tipo, quantidade, motivo, referencia, observacoes,
        justificativa: motivo || null,
      });
      res.status(201).json({
        id: result.id, material_id, tipo, quantidade,
        saldo_anterior: result.saldo_anterior, saldo_posterior: result.saldo_posterior,
        motivo, referencia, observacoes,
      });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // GET /api/almoxarifado/movimentacoes/:id/historico — histórico de um material
  app.get('/api/almoxarifado/materiais/:id/historico',(req, res) => {
    db.all(`SELECT m.*, ma.nome as material_nome, ma.unidade
            FROM movimentacoes_almoxarifado m
            JOIN materiais_almoxarifado ma ON m.material_id = ma.id
            WHERE m.material_id = ?
            ORDER BY m.created_at DESC LIMIT 50`,
      [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // CONFERÊNCIAS DE ESTOQUE (INVENTÁRIO)
  // ════════════════════════════════════════════════════════════════════════════

  // GET /api/almoxarifado/conferencias — listar
  app.get('/api/almoxarifado/conferencias',(req, res) => {
    db.all(`SELECT * FROM conferencias_almoxarifado ORDER BY created_at DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // GET /api/almoxarifado/conferencias/:id — detalhe com itens
  app.get('/api/almoxarifado/conferencias/:id',(req, res) => {
    db.get(`SELECT * FROM conferencias_almoxarifado WHERE id = ?`, [req.params.id], (err, conf) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!conf) return res.status(404).json({ error: 'Conferência não encontrada' });

      db.all(`SELECT ic.*, ma.nome as material_nome, ma.codigo as material_codigo,
                     ma.unidade, ma.localizacao, ma.foto
              FROM itens_conferencia_almoxarifado ic
              JOIN materiais_almoxarifado ma ON ic.material_id = ma.id
              WHERE ic.conferencia_id = ?
              ORDER BY ma.nome`,
        [req.params.id], (err2, itens) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ ...conf, itens: enrichMaterialRows(itens) });
        });
    });
  });

  // POST /api/almoxarifado/conferencias — criar nova conferência
  app.post('/api/almoxarifado/conferencias',(req, res) => {
    const { observacoes, categoria } = req.body;

    // Gerar número único
    const numero = `INV-${Date.now().toString().slice(-8)}`;

    db.run(`INSERT INTO conferencias_almoxarifado (numero, status, responsavel_id, responsavel_nome, observacoes)
            VALUES (?, 'ABERTO', ?, ?, ?)`,
      [numero, req.user.id, req.user.nome || req.user.email, observacoes || null],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const confId = this.lastID;

        // Inserir todos os materiais ativos
        let sql = `SELECT id, quantidade_atual FROM materiais_almoxarifado WHERE ativo = 1`;
        const params = [];
        if (categoria) { sql += ` AND categoria = ?`; params.push(categoria); }
        sql += ` ORDER BY nome`;

        db.all(sql, params, (err2, materiais) => {
          if (err2) return res.status(500).json({ error: err2.message });

          if (materiais.length === 0) {
            return res.status(201).json({ id: confId, numero, status: 'ABERTO', itens: [] });
          }

          const inserts = materiais.map(m =>
            new Promise((resolve, reject) => {
              db.run(`INSERT INTO itens_conferencia_almoxarifado (conferencia_id, material_id, quantidade_sistema)
                      VALUES (?, ?, ?)`,
                [confId, m.id, m.quantidade_atual],
                (e) => e ? reject(e) : resolve());
            })
          );

          Promise.all(inserts).then(() => {
            res.status(201).json({ id: confId, numero, status: 'ABERTO', totalItens: materiais.length });
          }).catch(e => res.status(500).json({ error: e.message }));
        });
      }
    );
  });

  // PUT /api/almoxarifado/conferencias/:id/item — registrar contagem de um item
  app.put('/api/almoxarifado/conferencias/:id/item/:itemId',(req, res) => {
    const { quantidade_contada, observacoes } = req.body;

    db.get(`SELECT ic.*, ma.quantidade_atual
            FROM itens_conferencia_almoxarifado ic
            JOIN materiais_almoxarifado ma ON ic.material_id = ma.id
            WHERE ic.id = ? AND ic.conferencia_id = ?`,
      [req.params.itemId, req.params.id], (err, item) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!item) return res.status(404).json({ error: 'Item não encontrado' });

        const divergencia = parseFloat(quantidade_contada) - item.quantidade_sistema;

        db.run(`UPDATE itens_conferencia_almoxarifado
                SET quantidade_contada = ?, divergencia = ?, observacoes = ?
                WHERE id = ?`,
          [quantidade_contada, divergencia, observacoes || null, req.params.itemId],
          (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ success: true, divergencia });
          });
      });
  });

  // PUT /api/almoxarifado/conferencias/:id/concluir — concluir e aplicar ajustes
  app.put('/api/almoxarifado/conferencias/:id/concluir',(req, res) => {
    const { aplicar_ajustes } = req.body;

    db.get(`SELECT * FROM conferencias_almoxarifado WHERE id = ?`, [req.params.id], (err, conf) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!conf) return res.status(404).json({ error: 'Conferência não encontrada' });

      db.all(`SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND quantidade_contada IS NOT NULL`,
        [req.params.id], (err2, itens) => {
          if (err2) return res.status(500).json({ error: err2.message });

          const ajustes = itens.filter(i => i.divergencia !== 0 && i.quantidade_contada !== null);

          const aplicarPromises = aplicar_ajustes && ajustes.length > 0
            ? ajustes.map(item =>
                new Promise((resolve, reject) => {
                  db.run(`UPDATE materiais_almoxarifado SET quantidade_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [item.quantidade_contada, item.material_id], (e) => {
                      if (e) return reject(e);
                      db.run(`INSERT INTO movimentacoes_almoxarifado
                        (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, usuario_id, usuario_nome)
                        VALUES (?, 'AJUSTE', ?, ?, ?, ?, ?, ?)`,
                        [item.material_id, Math.abs(item.divergencia), item.quantidade_sistema,
                         item.quantidade_contada, `Ajuste de conferência ${conf.numero}`,
                         req.user.id, req.user.nome || req.user.email],
                        (e2) => {
                          if (e2) return reject(e2);
                          db.run(`UPDATE itens_conferencia_almoxarifado SET ajustado = 1 WHERE id = ?`,
                            [item.id], resolve);
                        });
                    });
                })
              )
            : [];

          Promise.all(aplicarPromises).then(() => {
            db.run(`UPDATE conferencias_almoxarifado SET status = 'CONCLUIDO', data_fim = CURRENT_TIMESTAMP WHERE id = ?`,
              [req.params.id], (e) => {
                if (e) return res.status(500).json({ error: e.message });
                const materialIds = [...new Set(ajustes.map(a => a.material_id))];
                Promise.all(materialIds.map(mid => alertService.verificarAlertaPorMaterialId(db, mid).catch(() => null)))
                  .finally(() => {
                    res.json({ success: true, ajustesAplicados: ajustes.length });
                  });
              });
          }).catch(e => res.status(500).json({ error: e.message }));
        });
    });
  });

  // DELETE /api/almoxarifado/conferencias/:id — cancelar conferência
  app.put('/api/almoxarifado/conferencias/:id/cancelar',(req, res) => {
    db.run(`UPDATE conferencias_almoxarifado SET status = 'CANCELADO' WHERE id = ? AND status = 'ABERTO'`,
      [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(400).json({ error: 'Só é possível cancelar conferências abertas' });
        res.json({ success: true });
      });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // RELATÓRIOS
  // ════════════════════════════════════════════════════════════════════════════

  // GET /api/almoxarifado/relatorio/posicao-estoque
  app.get('/api/almoxarifado/relatorio/posicao-estoque',(req, res) => {
    db.all(`SELECT *, (quantidade_atual * custo_unitario) as valor_total
            FROM materiais_almoxarifado
            WHERE ativo = 1
            ORDER BY categoria, nome`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // GET /api/almoxarifado/relatorio/movimentacoes-periodo
  app.get('/api/almoxarifado/relatorio/movimentacoes-periodo',(req, res) => {
    const { data_inicio, data_fim } = req.query;
    db.all(`SELECT m.*, ma.nome as material_nome, ma.codigo as material_codigo, ma.unidade, ma.categoria
            FROM movimentacoes_almoxarifado m
            JOIN materiais_almoxarifado ma ON m.material_id = ma.id
            WHERE DATE(m.created_at) BETWEEN ? AND ?
            ORDER BY m.created_at DESC`,
      [data_inicio, data_fim], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // NOVAS TABELAS — Requisições, Tipos, Localizações, Configurações
  // ════════════════════════════════════════════════════════════════════════════

  // Adicionar coluna tipo_material_id na tabela materiais (se não existir)
  db.run(`ALTER TABLE materiais_almoxarifado ADD COLUMN tipo_material_id INTEGER REFERENCES tipos_material_almoxarifado(id)`, () => {});
  db.run(`ALTER TABLE materiais_almoxarifado ADD COLUMN ponto_pedido REAL DEFAULT 0`, () => {});
  db.run(`ALTER TABLE materiais_almoxarifado ADD COLUMN prazo_reposicao_dias INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE localizacoes_almoxarifado ADD COLUMN tipo TEXT DEFAULT 'Almoxarifado'`, () => {});
  db.run(`ALTER TABLE localizacoes_almoxarifado ADD COLUMN parent_id INTEGER`, () => {});
  db.run(`ALTER TABLE itens_requisicao_almoxarifado ADD COLUMN quantidade_separada REAL DEFAULT 0`, () => {});
  db.run(`ALTER TABLE itens_requisicao_almoxarifado ADD COLUMN quantidade_entregue REAL DEFAULT 0`, () => {});
  db.run(`ALTER TABLE requisicoes_almoxarifado ADD COLUMN ativo INTEGER DEFAULT 1`, () => {});
  db.run(`ALTER TABLE requisicoes_almoxarifado ADD COLUMN ultimo_lembrete_enviado DATETIME`, () => {});
  db.run(`ALTER TABLE requisicoes_almoxarifado ADD COLUMN valor_total REAL DEFAULT 0`, () => {});
  db.run(`ALTER TABLE requisicoes_almoxarifado ADD COLUMN requer_aprovacao_valor INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE requisicoes_almoxarifado ADD COLUMN aprovador_valor_id INTEGER`, () => {});
  db.run(`ALTER TABLE requisicoes_almoxarifado ADD COLUMN aprovador_valor_nome TEXT`, () => {});
  db.run(`ALTER TABLE requisicoes_almoxarifado ADD COLUMN data_aprovacao_valor DATETIME`, () => {});
  db.run(`ALTER TABLE requisicoes_almoxarifado ADD COLUMN rejeicao_valor_motivo TEXT`, () => {});
  db.run(`ALTER TABLE localizacoes_almoxarifado ADD COLUMN pos_x REAL`, () => {});
  db.run(`ALTER TABLE localizacoes_almoxarifado ADD COLUMN pos_y REAL`, () => {});
  db.run(`ALTER TABLE localizacoes_almoxarifado ADD COLUMN largura REAL DEFAULT 120`, () => {});
  db.run(`ALTER TABLE localizacoes_almoxarifado ADD COLUMN altura REAL DEFAULT 80`, () => {});
  db.run(`ALTER TABLE localizacoes_almoxarifado ADD COLUMN subgrupo TEXT`, () => {});
  db.run(`ALTER TABLE materiais_almoxarifado ADD COLUMN familia_id INTEGER REFERENCES familias_material_almoxarifado(id)`, () => {});

  // ════════════════════════════════════════════════════════════════════════════
  // TIPOS DE MATERIAL
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/almoxarifado/tipos-material',(req, res) => {
    db.all(`SELECT * FROM tipos_material_almoxarifado WHERE ativo = 1 ORDER BY nome`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  app.post('/api/almoxarifado/tipos-material',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { nome, descricao, icone, cor, requer_assinatura, requer_termo, is_epi, is_controlado } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });
    db.run(`INSERT INTO tipos_material_almoxarifado (nome, descricao, icone, cor, requer_assinatura, requer_termo, is_epi, is_controlado)
            VALUES (?,?,?,?,?,?,?,?)`,
      [nome, descricao || null, icone || '📦', cor || '#4facfe',
       requer_assinatura ? 1 : 0, requer_termo ? 1 : 0, is_epi ? 1 : 0, is_controlado ? 1 : 0],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get(`SELECT * FROM tipos_material_almoxarifado WHERE id = ?`, [this.lastID], (e, r) => res.status(201).json(r));
      });
  });

  app.put('/api/almoxarifado/tipos-material/:id',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { nome, descricao, icone, cor, requer_assinatura, requer_termo, is_epi, is_controlado, ativo } = req.body;
    db.run(`UPDATE tipos_material_almoxarifado SET nome=?, descricao=?, icone=?, cor=?, requer_assinatura=?, requer_termo=?, is_epi=?, is_controlado=?, ativo=? WHERE id=?`,
      [nome, descricao || null, icone || '📦', cor || '#4facfe',
       requer_assinatura ? 1 : 0, requer_termo ? 1 : 0, is_epi ? 1 : 0, is_controlado ? 1 : 0,
       ativo !== undefined ? ativo : 1, req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get(`SELECT * FROM tipos_material_almoxarifado WHERE id = ?`, [req.params.id], (e, r) => res.json(r));
      });
  });

  app.delete('/api/almoxarifado/tipos-material/:id',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    db.run(`UPDATE tipos_material_almoxarifado SET ativo = 0 WHERE id = ?`, [req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // LOCALIZAÇÕES
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/almoxarifado/localizacoes',(req, res) => {
    let sql = `SELECT * FROM localizacoes_almoxarifado WHERE ativo = 1`;
    const params = [];
    if (req.query.almoxarifado_id) {
      sql += ' AND almoxarifado_id = ?';
      params.push(req.query.almoxarifado_id);
    }
    sql += ` ORDER BY setor, parent_id, subgrupo, codigo`;
    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // tipos_material_permitidos chega do cliente como array de strings (ou ausente/null = sem
  // restrição); persistido como JSON. Array vazio ([]) tem a MESMA semântica de ausente/null —
  // "sem restrição" (definição de produto: lista vazia não significa "nenhum tipo permitido") —
  // por isso normaliza para NULL em vez de gravar "[]" (achado do review). Qualquer outra forma
  // (string solta, objeto, etc.) também é tratada como "sem restrição" em vez de quebrar a gravação.
  function serializeTiposPermitidos(value) {
    if (!Array.isArray(value) || value.length === 0) return null;
    return JSON.stringify(value);
  }

  app.post('/api/almoxarifado/localizacoes',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { codigo, descricao, setor, subgrupo, tipo, parent_id, pos_x, pos_y, largura, altura, almoxarifado_id, bloqueada, tipos_material_permitidos } = req.body;
    if (!codigo) return res.status(400).json({ error: 'Código obrigatório' });
    const subgrupoVal = subgrupo ? String(subgrupo).trim() || null : null;
    const parentVal = parent_id ? parseInt(parent_id, 10) : null;
    const bloqueadaVal = bloqueada ? 1 : 0;
    const tiposPermitidosVal = serializeTiposPermitidos(tipos_material_permitidos);
    resolveAlmoxarifadoId(almoxarifado_id, (_rErr, almoxarifadoIdVal) => {
      checkSubgrupoDuplicado(db, { subgrupo: subgrupoVal, setor, parent_id: parentVal }, (dupErr, isDup) => {
        if (dupErr) return res.status(500).json({ error: dupErr.message });
        if (isDup) return res.status(400).json({ error: 'Subgrupo já existe neste setor e localização pai' });

        // O código tem constraint UNIQUE, mas a exclusão é "soft" (ativo = 0): a linha
        // permanece e continua ocupando o código. Para não bloquear a recriação de um
        // código que foi excluído, reativamos/reescrevemos a linha inativa existente.
        db.get(`SELECT id, ativo FROM localizacoes_almoxarifado WHERE codigo = ?`, [codigo], (selErr, existente) => {
          if (selErr) return res.status(500).json({ error: selErr.message });

          // Já existe uma localização ATIVA com este código → realmente duplicado.
          if (existente && existente.ativo) {
            return res.status(400).json({ error: 'Código já existe' });
          }

          // Existe uma localização EXCLUÍDA com este código → reativa e atualiza os dados.
          if (existente) {
            db.run(`UPDATE localizacoes_almoxarifado
                    SET descricao=?, setor=?, subgrupo=?, tipo=?, parent_id=?, pos_x=?, pos_y=?, largura=?, altura=?, almoxarifado_id=?, bloqueada=?, tipos_material_permitidos=?, ativo=1
                    WHERE id=?`,
              [descricao || null, setor || null, subgrupoVal, tipo || 'Almoxarifado', parentVal,
               pos_x ?? null, pos_y ?? null, largura ?? 120, altura ?? 80, almoxarifadoIdVal,
               bloqueadaVal, tiposPermitidosVal, existente.id],
              function (updErr) {
                if (updErr) return res.status(500).json({ error: updErr.message });
                db.get(`SELECT * FROM localizacoes_almoxarifado WHERE id = ?`, [existente.id], (e, r) => res.status(201).json(r));
              });
            return;
          }

          // Código livre → insere normalmente.
          db.run(`INSERT INTO localizacoes_almoxarifado (codigo, descricao, setor, subgrupo, tipo, parent_id, pos_x, pos_y, largura, altura, almoxarifado_id, bloqueada, tipos_material_permitidos) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [codigo, descricao || null, setor || null, subgrupoVal, tipo || 'Almoxarifado', parentVal,
             pos_x ?? null, pos_y ?? null, largura ?? 120, altura ?? 80, almoxarifadoIdVal,
             bloqueadaVal, tiposPermitidosVal],
            function (err) {
              if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Código já existe' });
                return res.status(500).json({ error: err.message });
              }
              db.get(`SELECT * FROM localizacoes_almoxarifado WHERE id = ?`, [this.lastID], (e, r) => res.status(201).json(r));
            });
        });
      });
    });
  });

  app.put('/api/almoxarifado/localizacoes/:id',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { codigo, descricao, setor, subgrupo, tipo, parent_id, pos_x, pos_y, largura, altura, ativo, almoxarifado_id, bloqueada, tipos_material_permitidos } = req.body;
    const subgrupoVal = subgrupo ? String(subgrupo).trim() || null : null;
    const parentVal = parent_id ? parseInt(parent_id, 10) : null;
    if (parentVal && parseInt(req.params.id, 10) === parentVal) {
      return res.status(400).json({ error: 'Uma localização não pode ser pai de si mesma' });
    }
    // almoxarifado_id é o ÚNICO campo deste PUT full-replace com semântica "preserva quando
    // omitido" via COALESCE puro: a UI hoje (ConfiguracoesAlmoxarifado.js "Editar"/"Mover") ainda
    // não conhece esse campo e manda o body sem ele — se tratássemos ausência/null como "resetar
    // para ALM-GERAL" (como no POST), qualquer edição feita pela tela atual reverteria
    // silenciosamente o vínculo. Por isso: undefined OU null preservam o valor já gravado; só um
    // valor numérico presente no body troca o vínculo.
    const almoxarifadoIdParam = (almoxarifado_id === undefined || almoxarifado_id === null)
      ? null
      : (parseInt(almoxarifado_id, 10) || null);

    // bloqueada e tipos_material_permitidos: mesma UI (handleSalvarEdit/handleMoverConfirm em
    // ConfiguracoesAlmoxarifado.js) ainda não manda esses campos em edições/movimentações comuns
    // — um full-replace ingênuo colapsaria undefined→0/null e apagaria silenciosamente qualquer
    // bloqueio/restrição já configurado a cada edição (achado do review). Diferente de
    // almoxarifado_id, aqui um `null`/`[]` EXPLÍCITO precisa poder LIMPAR o valor (não só
    // "trocar por outro"), então COALESCE puro não serve — computamos em JS lendo a linha atual:
    // omitido (undefined) preserva; presente (incluindo null/[]) substitui/limpa normalmente.
    db.get(`SELECT bloqueada, tipos_material_permitidos FROM localizacoes_almoxarifado WHERE id = ?`,
      [req.params.id], (curErr, current) => {
        if (curErr) return res.status(500).json({ error: curErr.message });
        if (!current) return res.status(404).json({ error: 'Localização não encontrada' });

        const bloqueadaFinal = bloqueada === undefined ? (current.bloqueada ? 1 : 0) : (bloqueada ? 1 : 0);
        const tiposFinal = tipos_material_permitidos === undefined
          ? current.tipos_material_permitidos
          : serializeTiposPermitidos(tipos_material_permitidos);

        checkSubgrupoDuplicado(db, { subgrupo: subgrupoVal, setor, parent_id: parentVal, excludeId: req.params.id }, (dupErr, isDup) => {
          if (dupErr) return res.status(500).json({ error: dupErr.message });
          if (isDup) return res.status(400).json({ error: 'Subgrupo já existe neste setor e localização pai' });
          db.run(`UPDATE localizacoes_almoxarifado SET codigo=?, descricao=?, setor=?, subgrupo=?, tipo=?, parent_id=?, pos_x=?, pos_y=?, largura=?, altura=?, almoxarifado_id=COALESCE(?, almoxarifado_id), bloqueada=?, tipos_material_permitidos=?, ativo=? WHERE id=?`,
            [codigo, descricao || null, setor || null, subgrupoVal, tipo || 'Almoxarifado', parentVal,
             pos_x ?? null, pos_y ?? null, largura ?? 120, altura ?? 80, almoxarifadoIdParam,
             bloqueadaFinal, tiposFinal,
             ativo !== undefined ? ativo : 1, req.params.id],
            function (err) {
              if (err) return res.status(500).json({ error: err.message });
              db.get(`SELECT * FROM localizacoes_almoxarifado WHERE id = ?`, [req.params.id], (e, r) => res.json(r));
            });
        });
      });
  });

  app.delete('/api/almoxarifado/localizacoes/:id',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    // Checa EXISTÊNCIA de saldo não-zero por linha, não a SOMA agregada: SUM pode dar zero com
    // +10 de um material e -10 de outro na mesma localização, escondendo saldo real e permitindo
    // apagar uma localização que ainda tem estoque físico registrado (achado do review).
    db.get(`SELECT 1 as tem FROM estoque_saldo_almoxarifado WHERE localizacao_id = ? AND quantidade != 0 LIMIT 1`,
      [req.params.id], (saldoErr, row) => {
        if (saldoErr) return res.status(500).json({ error: saldoErr.message });
        if (row) {
          return res.status(400).json({ error: 'Não é possível remover: localização possui saldo' });
        }
        db.run(`UPDATE localizacoes_almoxarifado SET ativo = 0 WHERE id = ?`, [req.params.id], function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true });
        });
      });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // SETORES E ÁREAS
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/almoxarifado/setores',(req, res) => {
    const { all } = req.query;
    let sql = `SELECT s.*,
                 (SELECT COUNT(*) FROM localizacoes_almoxarifado l
                  WHERE l.ativo = 1 AND l.setor = s.nome) as qtd_localizacoes
               FROM setores_almoxarifado s WHERE 1=1`;
    if (all !== '1') sql += ' AND s.ativo = 1';
    sql += ' ORDER BY s.ordem ASC, s.nome ASC';

    db.all(sql, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  app.post('/api/almoxarifado/setores',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { nome, codigo_prefixo, tipo, ordem } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    if (!codigo_prefixo?.trim()) return res.status(400).json({ error: 'Prefixo do código é obrigatório' });
    const tipoVal = ['corredor', 'area', 'bancada'].includes(tipo) ? tipo : 'area';
    const prefixo = String(codigo_prefixo).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!prefixo) return res.status(400).json({ error: 'Prefixo do código inválido' });

    db.run(`INSERT INTO setores_almoxarifado (nome, codigo_prefixo, tipo, ordem) VALUES (?,?,?,?)`,
      [nome.trim(), prefixo, tipoVal, parseInt(ordem, 10) || 0],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Já existe um setor com este nome' });
          return res.status(500).json({ error: err.message });
        }
        db.get(`SELECT s.*,
                  (SELECT COUNT(*) FROM localizacoes_almoxarifado l
                   WHERE l.ativo = 1 AND l.setor = s.nome) as qtd_localizacoes
                FROM setores_almoxarifado s WHERE s.id = ?`,
          [this.lastID], (e, r) => res.status(201).json(r));
      });
  });

  app.put('/api/almoxarifado/setores/:id',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { nome, codigo_prefixo, tipo, ordem, ativo } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    if (!codigo_prefixo?.trim()) return res.status(400).json({ error: 'Prefixo do código é obrigatório' });
    const tipoVal = ['corredor', 'area', 'bancada'].includes(tipo) ? tipo : 'area';
    const prefixo = String(codigo_prefixo).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!prefixo) return res.status(400).json({ error: 'Prefixo do código inválido' });

    db.get('SELECT nome FROM setores_almoxarifado WHERE id = ?', [req.params.id], (err, atual) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!atual) return res.status(404).json({ error: 'Setor não encontrado' });

      const updateSetor = () => {
        db.run(`UPDATE setores_almoxarifado SET nome=?, codigo_prefixo=?, tipo=?, ordem=?, ativo=? WHERE id=?`,
          [nome.trim(), prefixo, tipoVal, parseInt(ordem, 10) || 0, ativo !== undefined ? (ativo ? 1 : 0) : 1, req.params.id],
          function (upErr) {
            if (upErr) {
              if (upErr.message.includes('UNIQUE')) return res.status(400).json({ error: 'Já existe um setor com este nome' });
              return res.status(500).json({ error: upErr.message });
            }
            if (atual.nome !== nome.trim()) {
              db.run('UPDATE localizacoes_almoxarifado SET setor = ? WHERE setor = ? AND ativo = 1',
                [nome.trim(), atual.nome], () => {});
            }
            db.get(`SELECT s.*,
                      (SELECT COUNT(*) FROM localizacoes_almoxarifado l
                       WHERE l.ativo = 1 AND l.setor = s.nome) as qtd_localizacoes
                    FROM setores_almoxarifado s WHERE s.id = ?`,
              [req.params.id], (e, r) => res.json(r));
          });
      };

      if (ativo === 0 || ativo === false) {
        db.get(`SELECT COUNT(*) as c FROM localizacoes_almoxarifado WHERE ativo = 1 AND setor = ?`,
          [atual.nome], (cErr, row) => {
            if (cErr) return res.status(500).json({ error: cErr.message });
            if (row.c > 0) {
              return res.status(400).json({
                error: `Não é possível inativar: ${row.c} localização(ões) ativa(s) usam este setor`,
              });
            }
            updateSetor();
          });
      } else {
        updateSetor();
      }
    });
  });

  app.delete('/api/almoxarifado/setores/:id',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    db.get('SELECT nome FROM setores_almoxarifado WHERE id = ?', [req.params.id], (err, setor) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!setor) return res.status(404).json({ error: 'Setor não encontrado' });

      db.get(`SELECT COUNT(*) as c FROM localizacoes_almoxarifado WHERE ativo = 1 AND setor = ?`,
        [setor.nome], (cErr, row) => {
          if (cErr) return res.status(500).json({ error: cErr.message });
          if (row.c > 0) {
            return res.status(400).json({
              error: `Não é possível excluir: ${row.c} localização(ões) ativa(s) usam este setor`,
            });
          }
          db.run('UPDATE setores_almoxarifado SET ativo = 0 WHERE id = ?', [req.params.id], function (delErr) {
            if (delErr) return res.status(500).json({ error: delErr.message });
            res.json({ success: true });
          });
        });
    });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // FAMÍLIAS DE MATERIAL
  // ════════════════════════════════════════════════════════════════════════════

  function generateFamiliaCodigo(nome, callback) {
    const words = String(nome || '').trim().split(/\s+/).filter(Boolean);
    let base = words.length >= 2
      ? (words[0].slice(0, 2) + words[1].slice(0, 1)).toUpperCase()
      : String(nome || 'FAM').slice(0, 3).toUpperCase();
    base = base.replace(/[^A-Z0-9]/g, '') || 'FAM';

    const tryCodigo = (suffix) => {
      const codigo = suffix ? `${base}${suffix}` : base;
      db.get('SELECT id FROM familias_material_almoxarifado WHERE codigo = ?', [codigo], (err, row) => {
        if (err) return callback(err);
        if (row) return tryCodigo(suffix ? suffix + 1 : 1);
        callback(null, codigo);
      });
    };
    tryCodigo(0);
  }

  // Subfamílias (Etapa 2, Task 3): valida o pai informado em POST/PUT de família.
  // Regras: pai deve existir (senão 400 genérico), estar ativo e ser RAIZ (parent_id IS
  // NULL) — subfamília não pode ter filhos (máximo 2 níveis). Os dois casos de "pai
  // inválido" (inativo / já é subfamília) compartilham a mesma mensagem de erro.
  function validateParentFamilia(parentId, callback) {
    if (!parentId) return callback(null, null);
    db.get('SELECT id, ativo, parent_id FROM familias_material_almoxarifado WHERE id = ?', [parentId], (err, row) => {
      if (err) return callback(err);
      if (!row) return callback(new Error('Família pai não encontrada'));
      if (row.ativo !== 1 || row.parent_id !== null) {
        return callback(new Error('Subfamília não pode ter filhos (máximo 2 níveis)'));
      }
      callback(null, row);
    });
  }

  app.get('/api/almoxarifado/familias',(req, res) => {
    const { ativo } = req.query;
    let sql = `SELECT f.*, p.nome as parent_nome,
                 (SELECT COUNT(*) FROM materiais_almoxarifado m WHERE m.familia_id = f.id AND m.ativo = 1) as qtd_itens
               FROM familias_material_almoxarifado f
               LEFT JOIN familias_material_almoxarifado p ON f.parent_id = p.id
               WHERE 1=1`;
    const params = [];
    if (ativo === '0') { sql += ' AND f.ativo = 0'; }
    else if (ativo !== 'all') { sql += ' AND f.ativo = 1'; }
    sql += ' ORDER BY f.nome ASC';

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  app.get('/api/almoxarifado/familias/:id',(req, res) => {
    db.get(`SELECT f.*, p.nome as parent_nome,
              (SELECT COUNT(*) FROM materiais_almoxarifado m WHERE m.familia_id = f.id AND m.ativo = 1) as qtd_itens
            FROM familias_material_almoxarifado f
            LEFT JOIN familias_material_almoxarifado p ON f.parent_id = p.id
            WHERE f.id = ?`, [req.params.id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Família não encontrada' });
      res.json(row);
    });
  });

  app.get('/api/almoxarifado/familias/:id/itens',(req, res) => {
    db.all(`SELECT m.*, f.nome as familia_nome, f.codigo as familia_codigo
            FROM materiais_almoxarifado m
            LEFT JOIN familias_material_almoxarifado f ON m.familia_id = f.id
            WHERE m.familia_id = ? AND m.ativo = 1
            ORDER BY m.nome ASC`,
      [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
  });

  app.post('/api/almoxarifado/familias',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { nome, descricao, categoria_id, codigo, tipo_uso, parent_id } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    const tipoUsoVal = ['administrativo', 'industrial', 'ambos'].includes(tipo_uso) ? tipo_uso : 'ambos';
    const parentId = parent_id ? parseInt(parent_id, 10) : null;

    const insertFamilia = (codigoVal) => {
      db.run(`INSERT INTO familias_material_almoxarifado (codigo, nome, descricao, categoria_id, tipo_uso, parent_id)
              VALUES (?,?,?,?,?,?)`,
        [codigoVal, nome.trim(), descricao || null, categoria_id || null, tipoUsoVal, parentId],
        function (err) {
          if (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Código já existe' });
            return res.status(500).json({ error: err.message });
          }
          db.get('SELECT * FROM familias_material_almoxarifado WHERE id = ?', [this.lastID], (e, r) => res.status(201).json(r));
        });
    };

    const proceed = () => {
      if (codigo?.trim()) {
        insertFamilia(codigo.trim().toUpperCase());
      } else {
        generateFamiliaCodigo(nome, (err, autoCodigo) => {
          if (err) return res.status(500).json({ error: err.message });
          insertFamilia(autoCodigo);
        });
      }
    };

    if (parentId) {
      validateParentFamilia(parentId, (errParent) => {
        if (errParent) return res.status(400).json({ error: errParent.message });
        proceed();
      });
    } else {
      proceed();
    }
  });

  app.put('/api/almoxarifado/familias/:id',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { nome, descricao, categoria_id, ativo, tipo_uso, parent_id } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    const tipoUsoVal = ['administrativo', 'industrial', 'ambos'].includes(tipo_uso) ? tipo_uso : 'ambos';
    const familiaId = parseInt(req.params.id, 10);
    const ativoVal = ativo !== undefined ? ativo : 1;

    // Fix (review pós-Task 3, mesma classe do T2): a aba Famílias de ConfiguracoesAlmoxarifado.js
    // manda PUT só com {nome, descricao, tipo_uso} — sem parent_id. Sem esta leitura prévia,
    // `parent_id` omitido colapsava para NULL e renomear uma subfamília a convertia
    // silenciosamente em família raiz. `parent_id` AUSENTE (undefined) preserva o vínculo
    // atual; qualquer valor informado — incluindo `null` explícito, `0` ou `''` — substitui
    // (e limpa, virando raiz).
    db.get('SELECT parent_id FROM familias_material_almoxarifado WHERE id = ?', [familiaId], (errCurrent, current) => {
      if (errCurrent) return res.status(500).json({ error: errCurrent.message });
      if (!current) return res.status(404).json({ error: 'Família não encontrada' });

      const parentIdOmitted = parent_id === undefined;
      const parentId = parentIdOmitted ? current.parent_id : (parent_id ? parseInt(parent_id, 10) : null);

      if (parentId && parentId === familiaId) {
        return res.status(400).json({ error: 'Família não pode ser pai de si mesma' });
      }

      const applyUpdate = () => {
        db.run(`UPDATE familias_material_almoxarifado SET nome=?, descricao=?, categoria_id=?, tipo_uso=?, ativo=?, parent_id=? WHERE id=?`,
          [nome.trim(), descricao || null, categoria_id || null, tipoUsoVal, ativoVal, parentId, familiaId],
          function (err) {
            if (err) return res.status(500).json({ error: err.message });
            db.get('SELECT * FROM familias_material_almoxarifado WHERE id = ?', [familiaId], (e, r) => res.json(r));
          });
      };

      // Subfamílias ativas da família sendo editada (só existem se ela for raiz — subfamília
      // não pode ter filhos). Usadas para bloquear (a) virar subfamília de outra família e
      // (b) ser inativada enquanto ainda tem filhas ativas.
      db.get('SELECT COUNT(*) as c FROM familias_material_almoxarifado WHERE parent_id = ? AND ativo = 1', [familiaId], (errChildren, childrenRow) => {
        if (errChildren) return res.status(500).json({ error: errChildren.message });
        const hasActiveChildren = childrenRow.c > 0;

        if (Number(ativoVal) === 0 && hasActiveChildren) {
          return res.status(400).json({ error: 'Não é possível inativar: família possui subfamília(s) ativa(s)' });
        }
        if (parentId && hasActiveChildren) {
          return res.status(400).json({ error: 'Família com subfamília(s) ativa(s) não pode virar subfamília' });
        }

        // Só revalida a hierarquia do pai quando o valor é NOVO (informado explicitamente).
        // Um parent_id preservado (omitido → veio do current) já era válido quando foi
        // setado; revalidar quebraria a edição de uma subfamília cujo pai foi inativado
        // depois (ex.: renomear a subfamília não deveria falhar por causa disso).
        if (parentId && !parentIdOmitted) {
          validateParentFamilia(parentId, (errParent) => {
            if (errParent) return res.status(400).json({ error: errParent.message });
            applyUpdate();
          });
        } else {
          applyUpdate();
        }
      });
    });
  });

  app.delete('/api/almoxarifado/familias/:id',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    db.get('SELECT COUNT(*) as c FROM materiais_almoxarifado WHERE familia_id = ? AND ativo = 1', [req.params.id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row.c > 0) {
        return res.status(400).json({ error: `Não é possível remover: família possui ${row.c} item(ns) ativo(s)` });
      }
      db.get('SELECT COUNT(*) as c FROM familias_material_almoxarifado WHERE parent_id = ? AND ativo = 1', [req.params.id], (errSub, subRow) => {
        if (errSub) return res.status(500).json({ error: errSub.message });
        if (subRow.c > 0) {
          return res.status(400).json({ error: `Não é possível remover: família possui ${subRow.c} subfamília(s) ativa(s)` });
        }
        db.run('UPDATE familias_material_almoxarifado SET ativo = 0 WHERE id = ?', [req.params.id], function (err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ success: true });
        });
      });
    });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES (admin only)
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/almoxarifado/configuracoes', authenticateToken, (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    db.all(`SELECT * FROM configuracoes_almoxarifado ORDER BY chave`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const obj = {};
      rows.forEach(r => { obj[r.chave] = { valor: r.valor, descricao: r.descricao, id: r.id }; });
      res.json(obj);
    });
  });

  app.put('/api/almoxarifado/configuracoes', authenticateToken, (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const configs = req.body; // { chave: valor, ... }
    const promises = Object.entries(configs).map(([chave, valor]) =>
      new Promise((resolve, reject) => {
        db.run(`INSERT INTO configuracoes_almoxarifado (chave, valor, updated_at, updated_by)
                VALUES (?, ?, CURRENT_TIMESTAMP, ?)
                ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, updated_at=CURRENT_TIMESTAMP, updated_by=excluded.updated_by`,
          [chave, String(valor), req.user.nome || req.user.email],
          (e) => e ? reject(e) : resolve());
      })
    );
    Promise.all(promises)
      .then(() => res.json({ success: true }))
      .catch(e => res.status(500).json({ error: e.message }));
  });

  app.get('/api/almoxarifado/configuracoes/alertas-estoque', authenticateToken, async (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    try {
      const [settings, reminder] = await Promise.all([
        alertService.getAlertSettingsForApi(db),
        requisitionReminderService.getReminderSettingsForApi(db),
      ]);
      res.json({ ...settings, ...reminder });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/almoxarifado/configuracoes/alertas-estoque', authenticateToken, async (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    try {
      const payload = req.body || {};
      const emails = Array.isArray(payload.emails) ? payload.emails.map(v => String(v).trim()).filter(Boolean) : [];
      const whatsappNumeros = Array.isArray(payload.whatsappNumeros) ? payload.whatsappNumeros.map(v => String(v).trim()).filter(Boolean) : [];
      const notificarEmail = payload.notificarEmail ? '1' : '0';
      const notificarWhatsapp = payload.notificarWhatsapp ? '1' : '0';
      const intervaloVerificacaoHoras = Number(payload.intervaloVerificacaoHoras) > 0 ? String(Number(payload.intervaloVerificacaoHoras)) : '4';
      const debounceSegundos = Number(payload.debounceSegundos) >= 0
        ? String(Math.min(3600, Math.floor(Number(payload.debounceSegundos))))
        : '60';
      const smtpHost = String(payload.smtpHost || '').trim();
      const smtpPort = Number(payload.smtpPort) > 0 ? String(Number(payload.smtpPort)) : '587';
      const smtpUser = String(payload.smtpUser || '').trim();
      const smtpFrom = String(payload.smtpFrom || '').trim();
      const smtpSecure = payload.smtpSecure ? '1' : '0';
      const whatsappWebhookUrl = String(payload.whatsappWebhookUrl || '').trim();
      const appUrl = String(payload.appUrl || '').trim();
      const requisicoesEmails = Array.isArray(payload.requisicoesEmails)
        ? payload.requisicoesEmails.map((v) => String(v).trim()).filter(Boolean)
        : [];
      const comprasEmails = Array.isArray(payload.comprasEmails)
        ? payload.comprasEmails.map((v) => String(v).trim()).filter(Boolean)
        : [];
      const requisicoesNotificarEmail = payload.requisicoesNotificarEmail === false ? '0' : '1';
      const requisicoesLembreteAtivo = payload.requisicoesLembreteAtivo === false ? '0' : '1';
      const requisicoesLembreteIntervaloHoras = Number(payload.requisicoesLembreteIntervaloHoras) > 0
        ? String(Math.floor(Number(payload.requisicoesLembreteIntervaloHoras)))
        : '24';
      const updatedBy = req.user.nome || req.user.email;
      const upserts = [
        ['alertas_estoque_emails', JSON.stringify(emails)],
        ['alertas_estoque_whatsapp_numeros', JSON.stringify(whatsappNumeros)],
        ['alertas_estoque_notificar_email', notificarEmail],
        ['alertas_estoque_notificar_whatsapp', notificarWhatsapp],
        ['alertas_estoque_intervalo_verificacao_horas', intervaloVerificacaoHoras],
        ['alertas_estoque_debounce_segundos', debounceSegundos],
        [alertService.APP_URL_CONFIG_KEY, appUrl || alertService.DEFAULT_APP_URL],
        [alertService.SMTP_CONFIG_KEYS.host, smtpHost],
        [alertService.SMTP_CONFIG_KEYS.port, smtpPort],
        [alertService.SMTP_CONFIG_KEYS.user, smtpUser],
        [alertService.SMTP_CONFIG_KEYS.from, smtpFrom],
        [alertService.SMTP_CONFIG_KEYS.secure, smtpSecure],
        [alertService.WHATSAPP_CONFIG_KEYS.webhookUrl, whatsappWebhookUrl],
        ['requisicoes_notificar_emails', JSON.stringify(requisicoesEmails)],
        ['requisicoes_notificar_email', requisicoesNotificarEmail],
        ['compras_notificar_emails', JSON.stringify(comprasEmails)],
        [requisitionReminderService.CONFIG_KEYS.ativo, requisicoesLembreteAtivo],
        [requisitionReminderService.CONFIG_KEYS.intervaloHoras, requisicoesLembreteIntervaloHoras],
      ];
      if (alertService.shouldUpdateSecret(payload.smtpPass)) {
        upserts.push([alertService.SMTP_CONFIG_KEYS.pass, String(payload.smtpPass)]);
      }
      if (alertService.shouldUpdateSecret(payload.whatsappApiKey)) {
        upserts.push([alertService.WHATSAPP_CONFIG_KEYS.apiKey, String(payload.whatsappApiKey)]);
      }
      const promises = upserts.map(([chave, valor]) => new Promise((resolve, reject) => {
        db.run(`INSERT INTO configuracoes_almoxarifado (chave, valor, updated_at, updated_by)
                VALUES (?, ?, CURRENT_TIMESTAMP, ?)
                ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, updated_at=CURRENT_TIMESTAMP, updated_by=excluded.updated_by`,
        [chave, valor, updatedBy], (err) => (err ? reject(err) : resolve()));
      }));
      await Promise.all(promises);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/almoxarifado/alertas-estoque/testar',async (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    try {
      const materialTeste = {
        codigo: 'TESTE-ALM',
        nome: 'Material de teste - Alertas',
        localizacao: 'Almoxarifado / Testes',
        unidade: 'UN',
        quantidade_atual: 1,
        quantidade_minima: 5,
      };
      const result = await alertService.processarAlertaMaterial(db, materialTeste, { forceSend: true, teste: true });
      res.json({ success: true, result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/almoxarifado/alertas-estoque/verificar',async (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    try {
      const forceSend = !!req.body?.forceSend;
      const results = await alertService.verificarAlertasEstoque(db, { forceSend });
      res.json({ success: true, total: results.length, enviados: results.filter(r => r?.enviado).length, results });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET/PUT /api/almoxarifado/configuracoes/liberacao-valor
  app.get('/api/almoxarifado/configuracoes/liberacao-valor', authenticateToken, async (req, res) => {
    try {
      const config = await valueApprovalService.getConfigForApi(db, req.user);
      res.json(config);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/almoxarifado/configuracoes/liberacao-valor', authenticateToken, async (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    try {
      const saved = await valueApprovalService.saveConfig(db, req.body, req.user.nome || req.user.email);
      res.json(saved);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /api/almoxarifado/configuracoes/estoques-minimos — atualização em lote
  app.put('/api/almoxarifado/configuracoes/estoques-minimos', authenticateToken, (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { materiais } = req.body; // [{ id, quantidade_minima, quantidade_maxima, ponto_pedido, prazo_reposicao_dias }]
    if (!Array.isArray(materiais)) return res.status(400).json({ error: 'Envie um array de materiais' });

    const promises = materiais.map(m =>
      new Promise((resolve, reject) => {
        db.run(`UPDATE materiais_almoxarifado SET
                  quantidade_minima=?, quantidade_maxima=?, ponto_pedido=?,
                  prazo_reposicao_dias=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=?`,
          [m.quantidade_minima ?? 0, m.quantidade_maxima ?? 0,
           m.ponto_pedido ?? 0, m.prazo_reposicao_dias ?? 0, m.id],
          (e) => e ? reject(e) : resolve());
      })
    );
    Promise.all(promises)
      .then(() => {
        const ids = materiais.map(m => m.id).filter(Boolean);
        Promise.all(ids.map(id => alertService.verificarAlertaPorMaterialId(db, id).catch(() => null)))
          .catch(() => null);
        res.json({ success: true, updated: materiais.length });
      })
      .catch(e => res.status(500).json({ error: e.message }));
  });

  // PUT /api/almoxarifado/configuracoes/tipos-material — associar tipo a material em lote
  app.put('/api/almoxarifado/configuracoes/tipos-material', authenticateToken, (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { materiais } = req.body; // [{ id, tipo_material_id }]
    if (!Array.isArray(materiais)) return res.status(400).json({ error: 'Envie um array' });

    const promises = materiais.map(m =>
      new Promise((resolve, reject) => {
        db.run(`UPDATE materiais_almoxarifado SET tipo_material_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          [m.tipo_material_id || null, m.id],
          (e) => e ? reject(e) : resolve());
      })
    );
    Promise.all(promises)
      .then(() => res.json({ success: true }))
      .catch(e => res.status(500).json({ error: e.message }));
  });


  // ════════════════════════════════════════════════════════════════════════════
  // REQUISIÇÕES (Solicitações da Fábrica)
  // ════════════════════════════════════════════════════════════════════════════

  const gerarNumeroReq = () => {
    const ts = Date.now().toString().slice(-6);
    const rand = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return `REQ-${ts}${rand}`;
  };

  // GET /api/almoxarifado/requisicoes — listar (com filtros)
  app.get('/api/almoxarifado/requisicoes',(req, res) => {
    const { status, urgencia, minha, departamento } = req.query;
    let sql = `SELECT r.*,
                 (SELECT COUNT(*) FROM itens_requisicao_almoxarifado WHERE requisicao_id = r.id) as total_itens
               FROM requisicoes_almoxarifado r WHERE COALESCE(r.ativo, 1) = 1`;
    const params = [];

    if (minha === '1') { sql += ` AND r.solicitante_id = ?`; params.push(req.user.id); }
    if (status) { sql += ` AND r.status = ?`; params.push(status); }
    if (req.query.aprovacoes_valor === '1') { sql += ` AND r.status = 'AGUARDANDO_APROVACAO_VALOR'`; }
    if (urgencia) { sql += ` AND r.urgencia = ?`; params.push(urgencia); }
    if (departamento) { sql += ` AND r.departamento LIKE ?`; params.push(`%${departamento}%`); }

    sql += ` ORDER BY CASE r.urgencia WHEN 'CRITICO' THEN 1 WHEN 'URGENTE' THEN 2 ELSE 3 END, r.created_at DESC`;

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // GET /api/almoxarifado/requisicoes/aprovacoes-valor — pendentes de aprovação por valor
  app.get('/api/almoxarifado/requisicoes/aprovacoes-valor', async (req, res) => {
    try {
      const souAprovador = await valueApprovalService.isAprovadorValor(db, req.user);
      if (!souAprovador) return res.status(403).json({ error: 'Sem permissão para ver aprovações de valor' });
      const rows = await valueApprovalService.listarAguardandoAprovacao(db);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/almoxarifado/requisicoes/:id — detalhe com itens
  app.get('/api/almoxarifado/requisicoes/:id',(req, res) => {
    db.get(`SELECT * FROM requisicoes_almoxarifado WHERE id = ? AND COALESCE(ativo, 1) = 1`, [req.params.id], (err, req_row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!req_row) return res.status(404).json({ error: 'Requisição não encontrada' });

      db.all(`SELECT ir.*, ma.nome as material_nome, ma.codigo as material_codigo,
                     ma.unidade, ma.quantidade_atual as saldo_atual, ma.foto,
                     ma.localizacao, ma.localizacao_padrao_id,
                     tm.nome as tipo_nome, tm.icone as tipo_icone, tm.is_epi, tm.requer_assinatura
              FROM itens_requisicao_almoxarifado ir
              JOIN materiais_almoxarifado ma ON ir.material_id = ma.id
              LEFT JOIN tipos_material_almoxarifado tm ON ma.tipo_material_id = tm.id
              WHERE ir.requisicao_id = ?`,
        [req.params.id], (err2, itens) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({
            ...req_row,
            itens: enrichMaterialRows(
              (itens || []).map(requisitionService.normalizarItem),
            ),
          });
        });
    });
  });

  // POST /api/almoxarifado/requisicoes — criar requisição
  app.post('/api/almoxarifado/requisicoes', async (req, res) => {
    const {
      departamento, setor, os_referencia, urgencia, observacoes,
      justificativa_urgencia, itens, modulo_origem,
    } = req.body;
    if (!itens || itens.length === 0) return res.status(400).json({ error: 'Inclua ao menos um item' });

    const setorFinal = departamento || setor;
    try {
      const sectorMaterialService = require('../services/almoxarifado/sectorMaterialService');
      if (setorFinal) {
        await sectorMaterialService.validateMateriaisParaSetor(
          db, setorFinal, itens.map((i) => i.material_id)
        );
      }
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message });
    }

    const numero = gerarNumeroReq();

    db.run(`INSERT INTO requisicoes_almoxarifado
            (numero, solicitante_id, solicitante_nome, departamento, setor, os_referencia,
             urgencia, observacoes, justificativa_urgencia, modulo_origem, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,'PENDENTE')`,
      [numero, req.user.id, req.user.nome || req.user.email,
       setorFinal || null, setorFinal || null, os_referencia || null,
       urgencia || 'NORMAL', observacoes || null, justificativa_urgencia || null,
       modulo_origem || null],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const reqId = this.lastID;

        const insertsItens = itens.map(item =>
          new Promise((resolve, reject) => {
            db.run(`INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada, observacoes)
                    VALUES (?,?,?,?)`,
              [reqId, item.material_id, item.quantidade, item.observacoes || null],
              (e) => e ? reject(e) : resolve());
          })
        );

        Promise.all(insertsItens).then(async () => {
          const reqData = {
            id: reqId,
            numero,
            setor: setorFinal,
            departamento: setorFinal,
            os_referencia: os_referencia || null,
            solicitante_nome: req.user.nome || req.user.email,
            observacoes: observacoes || null,
          };
          const itensParaNotificar = itens.map((i) => ({
            material_id: i.material_id,
            quantidade_solicitada: i.quantidade,
          }));
          requisitionNotificationService.notificarNovaRequisicao(db, reqData).catch((err) => {
            console.warn('[almoxarifado/requisicoes] Falha ao notificar por e-mail:', err.message);
          });
          purchaseNotifyService.notifyComprasItensSemEstoque(
            db,
            reqData,
            itensParaNotificar,
            req.user.email,
          ).catch((err) => {
            console.warn('[almoxarifado/requisicoes] Falha ao notificar Compras:', err.message);
          });

          let avaliacaoValor;
          try {
            avaliacaoValor = await valueApprovalService.aplicarAvaliacaoNaCriacao(db, reqId);
          } catch (valErr) {
            console.warn('[almoxarifado/requisicoes] Falha na avaliação de valor:', valErr.message);
            avaliacaoValor = { status: 'PENDENTE' };
          }

          if (avaliacaoValor.status === valueApprovalService.STATUS_AGUARDANDO) {
            return res.status(201).json({
              id: reqId,
              numero,
              status: avaliacaoValor.status,
              valor_total: avaliacaoValor.valor_total,
              requer_aprovacao_valor: true,
            });
          }

          // Verificar aprovação automática
          db.get(`SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'aprovacao_automatica'`, [], (e, cfg) => {
            if (!e && cfg && cfg.valor === '1' && urgencia !== 'CRITICO') {
              db.run(`UPDATE requisicoes_almoxarifado SET status='APROVADO', aprovador_nome='Sistema (automático)', data_aprovacao=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL WHERE id=?`,
                [reqId], () => {
                  res.status(201).json({
                    id: reqId, numero, status: 'APROVADO', aprovacao: 'automatica',
                    valor_total: avaliacaoValor.valor_total,
                  });
                });
            } else {
              res.status(201).json({
                id: reqId, numero, status: 'PENDENTE',
                valor_total: avaliacaoValor.valor_total,
              });
            }
          });
        }).catch(e => res.status(500).json({ error: e.message }));
      }
    );
  });

  // PUT /api/almoxarifado/requisicoes/:id/aprovar — aprovar
  app.put('/api/almoxarifado/requisicoes/:id/aprovar',(req, res) => {
    db.run(`UPDATE requisicoes_almoxarifado SET status='APROVADO', aprovador_id=?, aprovador_nome=?, data_aprovacao=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL
            WHERE id=? AND status='PENDENTE'`,
      [req.user.id, req.user.nome || req.user.email, req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(400).json({ error: 'Apenas requisições pendentes podem ser aprovadas' });
        res.json({ success: true });
      });
  });

  // PUT /api/almoxarifado/requisicoes/:id/rejeitar — rejeitar
  app.put('/api/almoxarifado/requisicoes/:id/rejeitar',(req, res) => {
    const { motivo } = req.body;
    db.run(`UPDATE requisicoes_almoxarifado SET status='REJEITADO', rejeicao_motivo=?, aprovador_id=?, aprovador_nome=?, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL
            WHERE id=? AND status='PENDENTE'`,
      [motivo || null, req.user.id, req.user.nome || req.user.email, req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(400).json({ error: 'Apenas requisições pendentes podem ser rejeitadas' });
        res.json({ success: true });
      });
  });

  // PUT /api/almoxarifado/requisicoes/:id/aprovar-valor — aprovar liberação por valor
  app.put('/api/almoxarifado/requisicoes/:id/aprovar-valor', async (req, res) => {
    try {
      const result = await valueApprovalService.aprovarValor(db, req.params.id, req.user);
      res.json(result);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // PUT /api/almoxarifado/requisicoes/:id/rejeitar-valor — reprovar liberação por valor
  app.put('/api/almoxarifado/requisicoes/:id/rejeitar-valor', async (req, res) => {
    try {
      const result = await valueApprovalService.rejeitarValor(db, req.params.id, req.user, req.body?.motivo);
      res.json(result);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  const handleSeparacao = (req, res) => {
    const { itens_separados } = req.body || {};
    requisitionService.separarRequisicao(db, req.params.id, itens_separados || [])
      .then((result) => res.json(result))
      .catch((e) => res.status(e.status || 500).json({ error: e.message }));
  };

  // PUT /api/almoxarifado/requisicoes/:id/separacao — iniciar separação (com quantidades opcionais)
  app.put('/api/almoxarifado/requisicoes/:id/separacao', handleSeparacao);
  // Alias conforme especificação
  app.put('/api/almoxarifado/requisicoes/:id/separar', handleSeparacao);

  // PUT /api/almoxarifado/requisicoes/:id/entregar — entrega parcial ou total e baixa estoque
  app.put('/api/almoxarifado/requisicoes/:id/entregar', (req, res) => {
    const { itens_atendidos } = req.body;
    requisitionService.entregarRequisicao(db, req.params.id, itens_atendidos, req.user, alertService)
      .then((result) => res.json(result))
      .catch((e) => res.status(e.status || 500).json({ error: e.message }));
  });

  // PUT /api/almoxarifado/requisicoes/:id/cancelar — cancelar
  app.put('/api/almoxarifado/requisicoes/:id/cancelar',(req, res) => {
    const { motivo } = req.body;
    db.get(`SELECT * FROM requisicoes_almoxarifado WHERE id = ?`, [req.params.id], (err, r) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!r) return res.status(404).json({ error: 'Não encontrada' });
      if (r.solicitante_id !== req.user.id && !isSystemAdmin(req.user)) {
        return res.status(403).json({ error: 'Sem permissão' });
      }
      if (!['PENDENTE', 'APROVADO'].includes(r.status)) {
        return res.status(400).json({ error: 'Não é possível cancelar neste status' });
      }
      db.run(`UPDATE requisicoes_almoxarifado SET status='CANCELADO', rejeicao_motivo=?, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL WHERE id=?`,
        [motivo || null, req.params.id],
        function (err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ success: true });
        });
    });
  });

  // DELETE /api/almoxarifado/requisicoes/:id — exclusão administrativa (soft delete + estorno)
  app.delete('/api/almoxarifado/requisicoes/:id', (req, res) => {
    if (!canDeleteAlmoxRequisicao(req.user)) {
      return res.status(403).json({ error: 'Apenas administradores do Almoxarifado ou Super Administrador podem excluir requisições' });
    }
    const justificativa = req.body?.justificativa || req.query?.justificativa;
    requisitionService.excluirRequisicao(db, req.params.id, req.user, justificativa, alertService)
      .then((result) => res.json(result))
      .catch((e) => res.status(e.status || 500).json({ error: e.message }));
  });

  // POST /api/almoxarifado/requisicoes/processar-lembretes — processar lembretes pendentes (cron/admin)
  app.post('/api/almoxarifado/requisicoes/processar-lembretes', async (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    try {
      const resultado = await requisitionReminderService.processarLembretesPendentes(db);
      res.json({ success: true, ...resultado });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/almoxarifado/dashboard atualizado com requisições
  app.get('/api/almoxarifado/dashboard/requisicoes',(req, res) => {
    db.get(`SELECT COUNT(*) as total FROM requisicoes_almoxarifado WHERE status = 'PENDENTE'`, [], (err, pendente) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get(`SELECT COUNT(*) as total FROM requisicoes_almoxarifado WHERE status = 'URGENTE' OR urgencia IN ('URGENTE','CRITICO') AND status NOT IN ('ENTREGUE','CANCELADO','REJEITADO')`, [], (err2, urgentes) => {
        if (err2) return res.status(500).json({ error: err2.message });
        db.get(`SELECT COUNT(*) as total FROM requisicoes_almoxarifado`, [], (err3, emitidas) => {
          if (err3) return res.status(500).json({ error: err3.message });
          db.get(`SELECT COUNT(*) as total FROM requisicoes_almoxarifado WHERE status = 'ENTREGUE'`, [], (err4, encerradas) => {
            if (err4) return res.status(500).json({ error: err4.message });
            db.all(`SELECT r.*, (SELECT COUNT(*) FROM itens_requisicao_almoxarifado WHERE requisicao_id = r.id) as total_itens
                    FROM requisicoes_almoxarifado r
                    WHERE r.status IN ('PENDENTE','APROVADO','EM_SEPARACAO','PARCIALMENTE_ATENDIDA')
                    ORDER BY CASE r.urgencia WHEN 'CRITICO' THEN 1 WHEN 'URGENTE' THEN 2 ELSE 3 END, r.created_at ASC
                    LIMIT 5`, [], (err5, abertas) => {
              if (err5) return res.status(500).json({ error: err5.message });
              res.json({
                requisicoesPendentes: pendente?.total || 0,
                requisicoesUrgentes: urgentes?.total || 0,
                requisicoesEmitidas: emitidas?.total || 0,
                requisicoesEncerradas: encerradas?.total || 0,
                abertas: abertas || [],
              });
            });
          });
        });
      });
    });
  });

  // ── Rotas estendidas v3 (serviços, reservas, recebimentos, relatórios) ──
  // Registra a extended após um roundtrip no sqlite (garante apenas a ordem de
  // registro; o initSchema disparado acima pode ainda estar em andamento — é
  // idempotente e a extended roda runInitSchemaWithRetry por conta própria).
  db.run('SELECT 1', [], () => {
    require('./almoxarifado/extended')(app, db, authenticateToken);
    console.log('✅ Módulo Almoxarifado registrado (v3 — controle completo de estoque)');
  });

  const REMINDER_INTERVAL_MS = 60 * 60 * 1000;
  const runReminderJob = () => {
    requisitionReminderService.processarLembretesPendentes(db).catch((err) => {
      console.warn('[almoxarifado-lembretes] Erro no job periódico:', err.message);
    });
  };
  setTimeout(runReminderJob, 30 * 1000).unref();
  setInterval(runReminderJob, REMINDER_INTERVAL_MS).unref();
};
