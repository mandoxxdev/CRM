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

  // ── Criação das tabelas ─────────────────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS materiais_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT DEFAULT 'OUTROS',
    unidade TEXT DEFAULT 'UN',
    foto TEXT,
    localizacao TEXT,
    quantidade_atual REAL DEFAULT 0,
    quantidade_minima REAL DEFAULT 0,
    quantidade_maxima REAL DEFAULT 0,
    custo_unitario REAL DEFAULT 0,
    fornecedor_principal TEXT,
    codigo_fornecedor TEXT,
    ncm TEXT,
    especificacoes TEXT,
    observacoes TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Erro ao criar tabela materiais_almoxarifado:', err);
    else console.log('✅ Tabela materiais_almoxarifado verificada');
  });

  db.run(`CREATE TABLE IF NOT EXISTS movimentacoes_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    quantidade REAL NOT NULL,
    saldo_anterior REAL NOT NULL,
    saldo_posterior REAL NOT NULL,
    motivo TEXT,
    referencia TEXT,
    observacoes TEXT,
    usuario_id INTEGER,
    usuario_nome TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`, (err) => {
    if (err) console.error('Erro ao criar tabela movimentacoes_almoxarifado:', err);
    else console.log('✅ Tabela movimentacoes_almoxarifado verificada');
  });

  db.run(`CREATE TABLE IF NOT EXISTS conferencias_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'ABERTO',
    responsavel_id INTEGER,
    responsavel_nome TEXT,
    data_inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_fim DATETIME,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Erro ao criar tabela conferencias_almoxarifado:', err);
    else console.log('✅ Tabela conferencias_almoxarifado verificada');
  });

  db.run(`CREATE TABLE IF NOT EXISTS itens_conferencia_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conferencia_id INTEGER NOT NULL,
    material_id INTEGER NOT NULL,
    quantidade_sistema REAL NOT NULL,
    quantidade_contada REAL,
    divergencia REAL,
    ajustado INTEGER DEFAULT 0,
    observacoes TEXT,
    FOREIGN KEY (conferencia_id) REFERENCES conferencias_almoxarifado(id),
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`, (err) => {
    if (err) console.error('Erro ao criar tabela itens_conferencia_almoxarifado:', err);
    else console.log('✅ Tabela itens_conferencia_almoxarifado verificada');
  });

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

  function resolveLocalizacaoFromFk(localizacaoPadraoId, callback) {
    const id = localizacaoPadraoId ? parseInt(localizacaoPadraoId, 10) : null;
    if (!id) return callback(null, null, null);
    db.get(
      `SELECT l.id, l.codigo, l.descricao, l.setor, l.subgrupo, l.parent_id,
              p.codigo as parent_codigo, p.descricao as parent_descricao, p.subgrupo as parent_subgrupo
       FROM localizacoes_almoxarifado l
       LEFT JOIN localizacoes_almoxarifado p ON l.parent_id = p.id
       WHERE l.id = ?`,
      [id],
      (err, row) => {
        if (err) return callback(err);
        if (!row) return callback(null, id, null);
        const parent = row.parent_id ? {
          codigo: row.parent_codigo,
          descricao: row.parent_descricao,
          subgrupo: row.parent_subgrupo,
        } : null;
        callback(null, id, formatLocalizacaoLabel(row, parent));
      }
    );
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

  function validateFamiliaAtiva(familiaId, callback) {
    if (!familiaId) return callback(null, null);
    db.get('SELECT id, ativo FROM familias_material_almoxarifado WHERE id = ?', [familiaId], (err, row) => {
      if (err) return callback(err);
      if (!row) return callback(new Error('Família não encontrada'));
      if (row.ativo !== 1) return callback(new Error('Família inativa — não é possível vincular novos itens'));
      callback(null, row);
    });
  }

  // POST /api/almoxarifado/materiais — criar
  app.post('/api/almoxarifado/materiais',(req, res) => {
    const {
      codigo, nome, descricao, categoria, unidade,
      quantidade_atual, quantidade_minima, quantidade_maxima,
      custo_unitario, fornecedor_principal, codigo_fornecedor,
      ncm, especificacoes, observacoes,
      descricao_tecnica, categoria_id, subcategoria_id, localizacao_padrao_id,
      fornecedor_id, tipo_material, material_critico, controle_lote, controle_certificado,
      familia_id,
    } = req.body;

    if (!codigo || !nome) return res.status(400).json({ error: 'Código e nome são obrigatórios' });
    if (!familia_id) return res.status(400).json({ error: 'Família é obrigatória para novos materiais' });

    const familiaId = parseInt(familia_id, 10);
    validateFamiliaAtiva(familiaId, (errFam, familia) => {
      if (errFam) return res.status(400).json({ error: errFam.message });

      resolveLocalizacaoFromFk(localizacao_padrao_id, (errLoc, locId, locText) => {
        if (errLoc) return res.status(500).json({ error: errLoc.message });

        db.run(`INSERT INTO materiais_almoxarifado
        (codigo, nome, descricao, categoria, unidade, localizacao, quantidade_atual,
         quantidade_minima, quantidade_maxima, custo_unitario, fornecedor_principal,
         codigo_fornecedor, ncm, especificacoes, observacoes,
         descricao_tecnica, categoria_id, subcategoria_id, localizacao_padrao_id,
         fornecedor_id, tipo_material, material_critico, controle_lote, controle_certificado, familia_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [codigo, nome, descricao || null, categoria || 'OUTROS', unidade || 'UN',
           locText, quantidade_atual || 0, quantidade_minima || 0,
           quantidade_maxima || 0, custo_unitario || 0, fornecedor_principal || null,
           codigo_fornecedor || null, ncm || null, especificacoes || null, observacoes || null,
           descricao_tecnica || null, categoria_id || null, subcategoria_id || null,
           locId, fornecedor_id || null, tipo_material || null,
           material_critico ? 1 : 0, controle_lote ? 1 : 0, controle_certificado ? 1 : 0,
           familiaId],
          function (err) {
            if (err) {
              if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Código já existe' });
              return res.status(500).json({ error: err.message });
            }
            const id = this.lastID;

            // Registrar movimentação inicial se quantidade > 0
            if ((quantidade_atual || 0) > 0) {
              db.run(`INSERT INTO movimentacoes_almoxarifado
              (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, usuario_id, usuario_nome)
              VALUES (?, 'ENTRADA', ?, 0, ?, 'Saldo inicial de cadastro', ?, ?)`,
                [id, quantidade_atual, quantidade_atual, req.user.id, req.user.nome || req.user.email]);
            }

            stockService.syncSaldoLocalizacaoPadrao(db, id).catch((e) => {
              console.warn('[almoxarifado] Falha ao sincronizar saldo por localização:', e.message);
            }).finally(() => {
            db.get(`SELECT m.*, f.nome as familia_nome, f.codigo as familia_codigo
                    FROM materiais_almoxarifado m
                    LEFT JOIN familias_material_almoxarifado f ON m.familia_id = f.id
                    WHERE m.id = ?`, [id], (err2, row) => {
              res.status(201).json(row);
            });
            });
          }
        );
      });
    });
  });

  // PUT /api/almoxarifado/materiais/:id — atualizar
  app.put('/api/almoxarifado/materiais/:id',(req, res) => {
    const {
      codigo, nome, descricao, categoria, unidade,
      quantidade_minima, quantidade_maxima, custo_unitario,
      fornecedor_principal, codigo_fornecedor, ncm, especificacoes, observacoes, ativo,
      descricao_tecnica, categoria_id, subcategoria_id, localizacao_padrao_id,
      fornecedor_id, tipo_material, material_critico, controle_lote, controle_certificado,
      familia_id,
    } = req.body;

    const applyUpdate = (familiaIdVal) => {
      resolveLocalizacaoFromFk(localizacao_padrao_id, (errLoc, locId, locText) => {
        if (errLoc) return res.status(500).json({ error: errLoc.message });

        db.run(`UPDATE materiais_almoxarifado SET
        codigo = ?, nome = ?, descricao = ?, categoria = ?, unidade = ?, localizacao = ?,
        quantidade_minima = ?, quantidade_maxima = ?, custo_unitario = ?,
        fornecedor_principal = ?, codigo_fornecedor = ?, ncm = ?, especificacoes = ?,
        observacoes = ?, ativo = ?,
        descricao_tecnica = ?, categoria_id = ?, subcategoria_id = ?, localizacao_padrao_id = ?,
        fornecedor_id = ?, tipo_material = ?, material_critico = ?, controle_lote = ?, controle_certificado = ?,
        familia_id = ?,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
          [codigo, nome, descricao || null, categoria || 'OUTROS', unidade || 'UN',
           locText, quantidade_minima || 0, quantidade_maxima || 0,
           custo_unitario || 0, fornecedor_principal || null, codigo_fornecedor || null,
           ncm || null, especificacoes || null, observacoes || null,
           ativo !== undefined ? ativo : 1,
           descricao_tecnica || null, categoria_id || null, subcategoria_id || null,
           locId, fornecedor_id || null, tipo_material || null,
           material_critico ? 1 : 0, controle_lote ? 1 : 0, controle_certificado ? 1 : 0,
           familiaIdVal || null,
           req.params.id],
          function (err) {
            if (err) {
              if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Código já existe' });
              return res.status(500).json({ error: err.message });
            }
            db.get(`SELECT m.*, f.nome as familia_nome, f.codigo as familia_codigo
                    FROM materiais_almoxarifado m
                    LEFT JOIN familias_material_almoxarifado f ON m.familia_id = f.id
                    WHERE m.id = ?`, [req.params.id], (err2, row) => {
              if (err2) return res.status(500).json({ error: err2.message });
              const materialId = Number(req.params.id);
              Promise.all([
                stockService.syncSaldoLocalizacaoPadrao(db, materialId).catch(() => null),
                alertService.verificarAlertaPorMaterialId(db, materialId).catch(() => null),
              ]).finally(() => res.json(row));
            });
          }
        );
      });
    };

    if (familia_id) {
      const familiaId = parseInt(familia_id, 10);
      db.get('SELECT familia_id FROM materiais_almoxarifado WHERE id = ?', [req.params.id], (errExist, existing) => {
        if (errExist) return res.status(500).json({ error: errExist.message });
        if (existing && existing.familia_id === familiaId) {
          return applyUpdate(familiaId);
        }
        validateFamiliaAtiva(familiaId, (errFam) => {
          if (errFam) return res.status(400).json({ error: errFam.message });
          applyUpdate(familiaId);
        });
      });
    } else {
      applyUpdate(null);
    }
  });

  // DELETE /api/almoxarifado/materiais/:id — inativar
  app.delete('/api/almoxarifado/materiais/:id',(req, res) => {
    db.run(`UPDATE materiais_almoxarifado SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
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
    const { material_id, tipo, data_inicio, data_fim, limit } = req.query;

    let sql = `SELECT m.*, ma.nome as material_nome, ma.codigo as material_codigo, ma.unidade
               FROM movimentacoes_almoxarifado m
               JOIN materiais_almoxarifado ma ON m.material_id = ma.id
               WHERE 1=1`;
    const params = [];

    if (material_id) { sql += ` AND m.material_id = ?`; params.push(material_id); }
    if (tipo) { sql += ` AND m.tipo = ?`; params.push(tipo); }
    if (data_inicio) { sql += ` AND DATE(m.created_at) >= ?`; params.push(data_inicio); }
    if (data_fim) { sql += ` AND DATE(m.created_at) <= ?`; params.push(data_fim); }

    sql += ` ORDER BY m.created_at DESC`;
    if (limit) { sql += ` LIMIT ?`; params.push(parseInt(limit)); }

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // POST /api/almoxarifado/movimentacoes — registrar movimento
  app.post('/api/almoxarifado/movimentacoes',(req, res) => {
    const { material_id, tipo, quantidade, motivo, referencia, observacoes } = req.body;

    if (!material_id || !tipo || !quantidade) {
      return res.status(400).json({ error: 'material_id, tipo e quantidade são obrigatórios' });
    }
    if (!['ENTRADA', 'SAIDA', 'AJUSTE', 'DEVOLUCAO'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido. Use ENTRADA, SAIDA, AJUSTE ou DEVOLUCAO' });
    }
    if (quantidade <= 0) {
      return res.status(400).json({ error: 'Quantidade deve ser maior que zero' });
    }

    db.get(`SELECT * FROM materiais_almoxarifado WHERE id = ? AND ativo = 1`, [material_id], (err, material) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!material) return res.status(404).json({ error: 'Material não encontrado' });

      const saldoAnterior = material.quantidade_atual;
      let saldoPosterior;

      if (tipo === 'ENTRADA' || tipo === 'DEVOLUCAO') {
        saldoPosterior = saldoAnterior + parseFloat(quantidade);
      } else if (tipo === 'SAIDA') {
        if (saldoAnterior < quantidade) {
          return res.status(400).json({ error: `Saldo insuficiente. Disponível: ${saldoAnterior} ${material.unidade}` });
        }
        saldoPosterior = saldoAnterior - parseFloat(quantidade);
      } else if (tipo === 'AJUSTE') {
        saldoPosterior = parseFloat(quantidade); // ajuste define o saldo diretamente
      }

      db.run(`INSERT INTO movimentacoes_almoxarifado
        (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, referencia, observacoes, usuario_id, usuario_nome)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [material_id, tipo, quantidade, saldoAnterior, saldoPosterior,
         motivo || null, referencia || null, observacoes || null,
         req.user.id, req.user.nome || req.user.email],
        function (err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          const movId = this.lastID;

          // Atualizar saldo do material
          db.run(`UPDATE materiais_almoxarifado SET quantidade_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [saldoPosterior, material_id], (err3) => {
              if (err3) return res.status(500).json({ error: err3.message });
              Promise.all([
                stockService.syncSaldoLocalizacaoPadrao(db, material_id).catch((e) => {
                  console.warn('[almoxarifado] Falha ao sincronizar saldo por localização:', e.message);
                }),
                alertService.verificarAlertaPorMaterialId(db, material_id).catch((alertErr) => {
                  console.warn('[almoxarifado-alertas] Falha no pós-movimentação:', alertErr.message);
                }),
              ]).finally(() => {
                  res.status(201).json({
                    id: movId, material_id, tipo, quantidade,
                    saldo_anterior: saldoAnterior, saldo_posterior: saldoPosterior,
                    motivo, referencia, observacoes
                  });
              });
            });
        }
      );
    });
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

  db.run(`CREATE TABLE IF NOT EXISTS tipos_material_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    descricao TEXT,
    icone TEXT DEFAULT '📦',
    cor TEXT DEFAULT '#4facfe',
    requer_assinatura INTEGER DEFAULT 0,
    requer_termo INTEGER DEFAULT 0,
    is_epi INTEGER DEFAULT 0,
    is_controlado INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, () => {
    // Inserir tipos padrão se a tabela estiver vazia
    db.get('SELECT COUNT(*) as c FROM tipos_material_almoxarifado', [], (err, r) => {
      if (!err && r.c === 0) {
        const tipos = [
          ['EPI', 'Equipamento de Proteção Individual', '🦺', '#f59e0b', 1, 1, 1, 1],
          ['Ferramenta', 'Ferramentas e utensílios controlados', '🔧', '#8b5cf6', 0, 1, 0, 1],
          ['Consumível', 'Materiais de uso contínuo', '📦', '#4facfe', 0, 0, 0, 0],
          ['Insumo', 'Matéria-prima e insumos de produção', '⚗️', '#1aa34a', 0, 0, 0, 0],
          ['Embalagem', 'Materiais de embalagem', '📫', '#06b6d4', 0, 0, 0, 0],
          ['Manutenção', 'Peças e materiais de manutenção', '⚙️', '#ef4444', 0, 0, 0, 0],
          ['Escritório', 'Material de escritório e papelaria', '📝', '#6b7280', 0, 0, 0, 0],
          ['Limpeza', 'Produtos de higiene e limpeza', '🧹', '#22c55e', 0, 0, 0, 0],
        ];
        tipos.forEach(([nome, desc, icone, cor, assin, termo, epi, ctrl]) => {
          db.run(`INSERT INTO tipos_material_almoxarifado (nome, descricao, icone, cor, requer_assinatura, requer_termo, is_epi, is_controlado) VALUES (?,?,?,?,?,?,?,?)`,
            [nome, desc, icone, cor, assin, termo, epi, ctrl]);
        });
      }
    });
  });

  db.run(`CREATE TABLE IF NOT EXISTS localizacoes_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    descricao TEXT,
    setor TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, () => {
    db.get('SELECT COUNT(*) as c FROM localizacoes_almoxarifado', [], (err, r) => {
      if (!err && r.c === 0) {
        const locs = [
          ['A-01', 'Prateleira A, Coluna 1', 'Corredor A'],
          ['A-02', 'Prateleira A, Coluna 2', 'Corredor A'],
          ['B-01', 'Prateleira B, Coluna 1', 'Corredor B'],
          ['B-02', 'Prateleira B, Coluna 2', 'Corredor B'],
          ['GAV-01', 'Gaveta 1', 'Bancada'],
          ['GAV-02', 'Gaveta 2', 'Bancada'],
          ['EPI', 'Armário de EPIs', 'Área de Segurança'],
          ['FERR', 'Painel de Ferramentas', 'Área de Ferramentas'],
        ];
        locs.forEach(([cod, desc, setor]) => {
          db.run(`INSERT INTO localizacoes_almoxarifado (codigo, descricao, setor) VALUES (?,?,?)`, [cod, desc, setor]);
        });
      }
    });
  });

  db.run(`CREATE TABLE IF NOT EXISTS setores_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE NOT NULL,
    codigo_prefixo TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'area',
    ordem INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, () => {
    db.get('SELECT COUNT(*) as c FROM setores_almoxarifado', [], (err, r) => {
      if (!err && r.c === 0) {
        const setores = [
          ['Bancada', 'GAV', 'bancada', 1],
          ['Corredor A', 'A', 'corredor', 2],
          ['Corredor B', 'B', 'corredor', 3],
          ['Corredor C', 'C', 'corredor', 4],
          ['Área de Segurança', 'EPI', 'area', 5],
          ['Área de Ferramentas', 'FERR', 'area', 6],
          ['Área Externa', 'EXT', 'area', 7],
          ['Almoxarifado Principal', 'ALM', 'area', 8],
        ];
        setores.forEach(([nome, prefixo, tipo, ordem]) => {
          db.run('INSERT INTO setores_almoxarifado (nome, codigo_prefixo, tipo, ordem) VALUES (?,?,?,?)',
            [nome, prefixo, tipo, ordem]);
        });
      }
    });
  });

  db.run(`CREATE TABLE IF NOT EXISTS configuracoes_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chave TEXT UNIQUE NOT NULL,
    valor TEXT,
    descricao TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  )`, () => {
    const defaults = [
      ['aprovacao_automatica', '0', 'Aprovar requisições automaticamente sem revisão'],
      ['limite_aprovacao_auto', '5', 'Quantidade máxima para aprovação automática por item'],
      ['notificar_estoque_critico', '1', 'Enviar alerta quando estoque atingir mínimo'],
      ['prazo_atendimento_horas', '24', 'Prazo padrão para atendimento de requisições (horas)'],
      ['prefixo_requisicao', 'REQ', 'Prefixo do número de requisição'],
      ['prefixo_material', 'ALM', 'Prefixo do código de material'],
      ['requer_justificativa_urgente', '1', 'Exigir justificativa para requisições urgentes'],
    ];
    defaults.forEach(([chave, valor, descricao]) => {
      db.run(`INSERT OR IGNORE INTO configuracoes_almoxarifado (chave, valor, descricao) VALUES (?,?,?)`, [chave, valor, descricao]);
    });

    const defaultsAlertas = [
      ['alertas_estoque_notificar_email', '1', 'Habilita alertas de estoque mínimo por e-mail'],
      ['alertas_estoque_notificar_whatsapp', '0', 'Habilita alertas de estoque mínimo por WhatsApp'],
      ['alertas_estoque_emails', '[]', 'Lista de e-mails para notificação de estoque mínimo'],
      ['alertas_estoque_whatsapp_numeros', '[]', 'Lista de números WhatsApp para notificação de estoque mínimo'],
      ['alertas_estoque_intervalo_verificacao_horas', '4', 'Intervalo sugerido de verificação de alertas (horas)'],
      ['alertas_estoque_debounce_segundos', '60', 'Debounce anti-duplicata na mesma operação (segundos; 0=desligado)'],
      ['alertas_app_url', 'https://systemgmp.online', 'URL base do sistema para links nos alertas (e-mail e WhatsApp)'],
      ['alertas_smtp_host', '', 'Servidor SMTP para alertas de estoque'],
      ['alertas_smtp_port', '587', 'Porta SMTP para alertas de estoque'],
      ['alertas_smtp_user', '', 'Usuário SMTP para alertas de estoque'],
      ['alertas_smtp_pass', '', 'Senha SMTP para alertas de estoque'],
      ['alertas_smtp_from', '', 'E-mail remetente dos alertas de estoque'],
      ['alertas_smtp_secure', '0', 'Usar TLS/SSL no SMTP dos alertas (1=sim)'],
      ['alertas_whatsapp_webhook_url', '', 'URL do webhook WhatsApp para alertas de estoque'],
      ['alertas_whatsapp_api_key', '', 'Token/chave API opcional do webhook WhatsApp'],
      ['requisicoes_notificar_email', '1', 'Habilita notificação por e-mail de novas requisições de material'],
      ['requisicoes_notificar_emails', '[]', 'Lista de e-mails para notificação de requisições (vazio = usa alertas_estoque_emails)'],
      ['compras_notificar_emails', '[]', 'E-mails do setor de Compras para solicitações automáticas de compra (itens sem estoque)'],
      ['requisicoes_lembrete_ativo', '1', 'Habilita lembretes diários por e-mail para requisições pendentes'],
      ['requisicoes_lembrete_intervalo_horas', '24', 'Intervalo mínimo entre lembretes da mesma requisição (horas)'],
      ['liberacao_valor_ativo', '0', 'Habilita aprovação de alto valor em requisições de material'],
      ['liberacao_valor_limite', '500', 'Valor máximo (R$) para liberação automática sem aprovação extra'],
      ['liberacao_valor_aprovadores', '[]', 'IDs dos usuários aprovadores de alto valor (JSON)'],
    ];
    defaultsAlertas.forEach(([chave, valor, descricao]) => {
      db.run(`INSERT OR IGNORE INTO configuracoes_almoxarifado (chave, valor, descricao) VALUES (?,?,?)`, [chave, valor, descricao]);
    });
  });

  db.run(`CREATE TABLE IF NOT EXISTS alertas_estoque_material_almoxarifado (
    material_id INTEGER PRIMARY KEY,
    estado_estoque TEXT DEFAULT 'ACIMA',
    ultimo_alerta_enviado DATETIME,
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`, () => {});

  db.run(`CREATE TABLE IF NOT EXISTS alertas_estoque_historico_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER,
    canal TEXT NOT NULL,
    destinatario TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ENVIADO',
    erro TEXT,
    teste INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`, () => {});

  db.run(`CREATE TABLE IF NOT EXISTS requisicoes_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    solicitante_id INTEGER NOT NULL,
    solicitante_nome TEXT NOT NULL,
    departamento TEXT,
    os_referencia TEXT,
    urgencia TEXT DEFAULT 'NORMAL',
    status TEXT DEFAULT 'PENDENTE',
    observacoes TEXT,
    justificativa_urgencia TEXT,
    aprovador_id INTEGER,
    aprovador_nome TEXT,
    data_aprovacao DATETIME,
    data_entrega DATETIME,
    rejeicao_motivo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Erro ao criar tabela requisicoes_almoxarifado:', err);
    else console.log('✅ Tabela requisicoes_almoxarifado verificada');
  });

  db.run(`CREATE TABLE IF NOT EXISTS itens_requisicao_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requisicao_id INTEGER NOT NULL,
    material_id INTEGER NOT NULL,
    quantidade_solicitada REAL NOT NULL,
    quantidade_atendida REAL DEFAULT 0,
    observacoes TEXT,
    FOREIGN KEY (requisicao_id) REFERENCES requisicoes_almoxarifado(id),
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`, (err) => {
    if (err) console.error('Erro ao criar tabela itens_requisicao_almoxarifado:', err);
    else console.log('✅ Tabela itens_requisicao_almoxarifado verificada');
  });

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

  db.run(`CREATE TABLE IF NOT EXISTS familias_material_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    categoria_id INTEGER,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias_material_almoxarifado(id)
  )`, () => {
    db.get('SELECT COUNT(*) as c FROM familias_material_almoxarifado', [], (err, r) => {
      if (!err && r.c === 0) {
        const familias = [
          ['PAR', 'Parafusos e Porcas', 'Elementos de fixação — parafusos, porcas e arruelas'],
          ['ROL', 'Rolamentos', 'Rolamentos e mancais'],
          ['VAL', 'Válvulas', 'Válvulas pneumáticas e hidráulicas'],
        ];
        familias.forEach(([codigo, nome, descricao]) => {
          db.run('INSERT INTO familias_material_almoxarifado (codigo, nome, descricao) VALUES (?,?,?)', [codigo, nome, descricao]);
        });
      }
    });
  });


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
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
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
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
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
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
    db.run(`UPDATE tipos_material_almoxarifado SET ativo = 0 WHERE id = ?`, [req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // LOCALIZAÇÕES
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/almoxarifado/localizacoes',(req, res) => {
    db.all(`SELECT * FROM localizacoes_almoxarifado WHERE ativo = 1
            ORDER BY setor, parent_id, subgrupo, codigo`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  app.post('/api/almoxarifado/localizacoes',(req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
    const { codigo, descricao, setor, subgrupo, tipo, parent_id, pos_x, pos_y, largura, altura } = req.body;
    if (!codigo) return res.status(400).json({ error: 'Código obrigatório' });
    const subgrupoVal = subgrupo ? String(subgrupo).trim() || null : null;
    const parentVal = parent_id ? parseInt(parent_id, 10) : null;
    checkSubgrupoDuplicado(db, { subgrupo: subgrupoVal, setor, parent_id: parentVal }, (dupErr, isDup) => {
      if (dupErr) return res.status(500).json({ error: dupErr.message });
      if (isDup) return res.status(400).json({ error: 'Subgrupo já existe neste setor e localização pai' });
      db.run(`INSERT INTO localizacoes_almoxarifado (codigo, descricao, setor, subgrupo, tipo, parent_id, pos_x, pos_y, largura, altura) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [codigo, descricao || null, setor || null, subgrupoVal, tipo || 'Almoxarifado', parentVal,
         pos_x ?? null, pos_y ?? null, largura ?? 120, altura ?? 80],
        function (err) {
          if (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Código já existe' });
            return res.status(500).json({ error: err.message });
          }
          db.get(`SELECT * FROM localizacoes_almoxarifado WHERE id = ?`, [this.lastID], (e, r) => res.status(201).json(r));
        });
    });
  });

  app.put('/api/almoxarifado/localizacoes/:id',(req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
    const { codigo, descricao, setor, subgrupo, tipo, parent_id, pos_x, pos_y, largura, altura, ativo } = req.body;
    const subgrupoVal = subgrupo ? String(subgrupo).trim() || null : null;
    const parentVal = parent_id ? parseInt(parent_id, 10) : null;
    if (parentVal && parseInt(req.params.id, 10) === parentVal) {
      return res.status(400).json({ error: 'Uma localização não pode ser pai de si mesma' });
    }
    checkSubgrupoDuplicado(db, { subgrupo: subgrupoVal, setor, parent_id: parentVal, excludeId: req.params.id }, (dupErr, isDup) => {
      if (dupErr) return res.status(500).json({ error: dupErr.message });
      if (isDup) return res.status(400).json({ error: 'Subgrupo já existe neste setor e localização pai' });
      db.run(`UPDATE localizacoes_almoxarifado SET codigo=?, descricao=?, setor=?, subgrupo=?, tipo=?, parent_id=?, pos_x=?, pos_y=?, largura=?, altura=?, ativo=? WHERE id=?`,
        [codigo, descricao || null, setor || null, subgrupoVal, tipo || 'Almoxarifado', parentVal,
         pos_x ?? null, pos_y ?? null, largura ?? 120, altura ?? 80,
         ativo !== undefined ? ativo : 1, req.params.id],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          db.get(`SELECT * FROM localizacoes_almoxarifado WHERE id = ?`, [req.params.id], (e, r) => res.json(r));
        });
    });
  });

  app.delete('/api/almoxarifado/localizacoes/:id',(req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
    db.run(`UPDATE localizacoes_almoxarifado SET ativo = 0 WHERE id = ?`, [req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
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
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
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
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
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
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
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

  app.get('/api/almoxarifado/familias',(req, res) => {
    const { ativo } = req.query;
    let sql = `SELECT f.*,
                 (SELECT COUNT(*) FROM materiais_almoxarifado m WHERE m.familia_id = f.id AND m.ativo = 1) as qtd_itens
               FROM familias_material_almoxarifado f WHERE 1=1`;
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
    db.get(`SELECT f.*,
              (SELECT COUNT(*) FROM materiais_almoxarifado m WHERE m.familia_id = f.id AND m.ativo = 1) as qtd_itens
            FROM familias_material_almoxarifado f WHERE f.id = ?`, [req.params.id], (err, row) => {
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
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
    const { nome, descricao, categoria_id, codigo, tipo_uso } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    const tipoUsoVal = ['administrativo', 'industrial', 'ambos'].includes(tipo_uso) ? tipo_uso : 'ambos';

    const insertFamilia = (codigoVal) => {
      db.run(`INSERT INTO familias_material_almoxarifado (codigo, nome, descricao, categoria_id, tipo_uso)
              VALUES (?,?,?,?,?)`,
        [codigoVal, nome.trim(), descricao || null, categoria_id || null, tipoUsoVal],
        function (err) {
          if (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Código já existe' });
            return res.status(500).json({ error: err.message });
          }
          db.get('SELECT * FROM familias_material_almoxarifado WHERE id = ?', [this.lastID], (e, r) => res.status(201).json(r));
        });
    };

    if (codigo?.trim()) {
      insertFamilia(codigo.trim().toUpperCase());
    } else {
      generateFamiliaCodigo(nome, (err, autoCodigo) => {
        if (err) return res.status(500).json({ error: err.message });
        insertFamilia(autoCodigo);
      });
    }
  });

  app.put('/api/almoxarifado/familias/:id',(req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
    const { nome, descricao, categoria_id, ativo, tipo_uso } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    const tipoUsoVal = ['administrativo', 'industrial', 'ambos'].includes(tipo_uso) ? tipo_uso : 'ambos';

    db.run(`UPDATE familias_material_almoxarifado SET nome=?, descricao=?, categoria_id=?, tipo_uso=?, ativo=? WHERE id=?`,
      [nome.trim(), descricao || null, categoria_id || null, tipoUsoVal, ativo !== undefined ? ativo : 1, req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get('SELECT * FROM familias_material_almoxarifado WHERE id = ?', [req.params.id], (e, r) => res.json(r));
      });
  });

  app.delete('/api/almoxarifado/familias/:id',(req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
    db.get('SELECT COUNT(*) as c FROM materiais_almoxarifado WHERE familia_id = ? AND ativo = 1', [req.params.id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row.c > 0) {
        return res.status(400).json({ error: `Não é possível remover: família possui ${row.c} item(ns) ativo(s)` });
      }
      db.run('UPDATE familias_material_almoxarifado SET ativo = 0 WHERE id = ?', [req.params.id], function (err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ success: true });
      });
    });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES (admin only)
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/almoxarifado/configuracoes',(req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso restrito — apenas administradores' });
    db.all(`SELECT * FROM configuracoes_almoxarifado ORDER BY chave`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const obj = {};
      rows.forEach(r => { obj[r.chave] = { valor: r.valor, descricao: r.descricao, id: r.id }; });
      res.json(obj);
    });
  });

  app.put('/api/almoxarifado/configuracoes',(req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
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

  app.get('/api/almoxarifado/configuracoes/alertas-estoque',async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso restrito — apenas administradores' });
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

  app.put('/api/almoxarifado/configuracoes/alertas-estoque',async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
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
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
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
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
    try {
      const forceSend = !!req.body?.forceSend;
      const results = await alertService.verificarAlertasEstoque(db, { forceSend });
      res.json({ success: true, total: results.length, enviados: results.filter(r => r?.enviado).length, results });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET/PUT /api/almoxarifado/configuracoes/liberacao-valor
  app.get('/api/almoxarifado/configuracoes/liberacao-valor', async (req, res) => {
    try {
      const config = await valueApprovalService.getConfigForApi(db, req.user);
      res.json(config);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/almoxarifado/configuracoes/liberacao-valor', async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
    try {
      const saved = await valueApprovalService.saveConfig(db, req.body, req.user.nome || req.user.email);
      res.json(saved);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /api/almoxarifado/configuracoes/estoques-minimos — atualização em lote
  app.put('/api/almoxarifado/configuracoes/estoques-minimos',(req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso restrito — apenas administradores' });
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
  app.put('/api/almoxarifado/configuracoes/tipos-material',(req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
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
      if (r.solicitante_id !== req.user.id && req.user.role !== 'admin') {
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
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem excluir requisições' });
    }
    const justificativa = req.body?.justificativa || req.query?.justificativa;
    requisitionService.excluirRequisicao(db, req.params.id, req.user, justificativa, alertService)
      .then((result) => res.json(result))
      .catch((e) => res.status(e.status || 500).json({ error: e.message }));
  });

  // POST /api/almoxarifado/requisicoes/processar-lembretes — processar lembretes pendentes (cron/admin)
  app.post('/api/almoxarifado/requisicoes/processar-lembretes', async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
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
  // Aguarda fila de CREATE TABLE do módulo antes do initSchema (evita race no SQLite).
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
  setTimeout(runReminderJob, 30 * 1000);
  setInterval(runReminderJob, REMINDER_INTERVAL_MS);
};
