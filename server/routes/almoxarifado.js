/**
 * Módulo Almoxarifado — GMP INDUSTRIAIS
 * Rotas: materiais, movimentações, conferências de estoque
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');

module.exports = function (app, db, authenticateToken, PERSISTENT_DATA_DIR) {

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

  // Servir fotos — acessível via /uploads/almoxarifado/<arquivo>
  app.use('/uploads/almoxarifado', require('express').static(uploadsAlmoxDir));


  // ════════════════════════════════════════════════════════════════════════════
  // MATERIAIS — CRUD
  // ════════════════════════════════════════════════════════════════════════════

  // GET /api/almoxarifado/materiais — listar
  app.get('/api/almoxarifado/materiais', authenticateToken, (req, res) => {
    const { search, categoria, status } = req.query;

    let sql = `SELECT * FROM materiais_almoxarifado WHERE 1=1`;
    const params = [];

    if (search) {
      sql += ` AND (nome LIKE ? OR codigo LIKE ? OR descricao LIKE ? OR fornecedor_principal LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (categoria) {
      sql += ` AND categoria = ?`;
      params.push(categoria);
    }
    if (status === 'critico') {
      sql += ` AND quantidade_atual <= quantidade_minima AND quantidade_minima > 0`;
    } else if (status === 'ok') {
      sql += ` AND quantidade_atual > quantidade_minima`;
    } else if (status === 'zerado') {
      sql += ` AND quantidade_atual = 0`;
    }

    sql += ` AND ativo = 1 ORDER BY nome ASC`;

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // GET /api/almoxarifado/materiais/dashboard — stats para o dashboard
  app.get('/api/almoxarifado/dashboard', authenticateToken, (req, res) => {
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
  app.get('/api/almoxarifado/materiais/:id', authenticateToken, (req, res) => {
    db.get(`SELECT * FROM materiais_almoxarifado WHERE id = ?`, [req.params.id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Material não encontrado' });
      res.json(row);
    });
  });

  // POST /api/almoxarifado/materiais — criar
  app.post('/api/almoxarifado/materiais', authenticateToken, (req, res) => {
    const {
      codigo, nome, descricao, categoria, unidade, localizacao,
      quantidade_atual, quantidade_minima, quantidade_maxima,
      custo_unitario, fornecedor_principal, codigo_fornecedor,
      ncm, especificacoes, observacoes
    } = req.body;

    if (!codigo || !nome) return res.status(400).json({ error: 'Código e nome são obrigatórios' });

    db.run(`INSERT INTO materiais_almoxarifado
      (codigo, nome, descricao, categoria, unidade, localizacao, quantidade_atual,
       quantidade_minima, quantidade_maxima, custo_unitario, fornecedor_principal,
       codigo_fornecedor, ncm, especificacoes, observacoes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [codigo, nome, descricao || null, categoria || 'OUTROS', unidade || 'UN',
       localizacao || null, quantidade_atual || 0, quantidade_minima || 0,
       quantidade_maxima || 0, custo_unitario || 0, fornecedor_principal || null,
       codigo_fornecedor || null, ncm || null, especificacoes || null, observacoes || null],
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

        db.get(`SELECT * FROM materiais_almoxarifado WHERE id = ?`, [id], (err2, row) => {
          res.status(201).json(row);
        });
      }
    );
  });

  // PUT /api/almoxarifado/materiais/:id — atualizar
  app.put('/api/almoxarifado/materiais/:id', authenticateToken, (req, res) => {
    const {
      codigo, nome, descricao, categoria, unidade, localizacao,
      quantidade_minima, quantidade_maxima, custo_unitario,
      fornecedor_principal, codigo_fornecedor, ncm, especificacoes, observacoes, ativo
    } = req.body;

    db.run(`UPDATE materiais_almoxarifado SET
      codigo = ?, nome = ?, descricao = ?, categoria = ?, unidade = ?, localizacao = ?,
      quantidade_minima = ?, quantidade_maxima = ?, custo_unitario = ?,
      fornecedor_principal = ?, codigo_fornecedor = ?, ncm = ?, especificacoes = ?,
      observacoes = ?, ativo = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [codigo, nome, descricao || null, categoria || 'OUTROS', unidade || 'UN',
       localizacao || null, quantidade_minima || 0, quantidade_maxima || 0,
       custo_unitario || 0, fornecedor_principal || null, codigo_fornecedor || null,
       ncm || null, especificacoes || null, observacoes || null,
       ativo !== undefined ? ativo : 1, req.params.id],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Código já existe' });
          return res.status(500).json({ error: err.message });
        }
        db.get(`SELECT * FROM materiais_almoxarifado WHERE id = ?`, [req.params.id], (err2, row) => {
          res.json(row);
        });
      }
    );
  });

  // DELETE /api/almoxarifado/materiais/:id — inativar
  app.delete('/api/almoxarifado/materiais/:id', authenticateToken, (req, res) => {
    db.run(`UPDATE materiais_almoxarifado SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
  });

  // POST /api/almoxarifado/materiais/:id/foto — upload de foto
  app.post('/api/almoxarifado/materiais/:id/foto', authenticateToken, uploadAlmox.single('foto'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma foto enviada' });

    const fotoPath = `/uploads/almoxarifado/${req.file.filename}`;

    // Remover foto antiga
    db.get(`SELECT foto FROM materiais_almoxarifado WHERE id = ?`, [req.params.id], (err, row) => {
      if (row && row.foto) {
        const oldPath = path.join(uploadsAlmoxDir, path.basename(row.foto));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    });

    db.run(`UPDATE materiais_almoxarifado SET foto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [fotoPath, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ foto_url: fotoPath });
      });
  });

  // POST /api/almoxarifado/materiais/gerar-codigo — gera próximo código
  app.get('/api/almoxarifado/proximo-codigo', authenticateToken, (req, res) => {
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
  app.get('/api/almoxarifado/movimentacoes', authenticateToken, (req, res) => {
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
  app.post('/api/almoxarifado/movimentacoes', authenticateToken, (req, res) => {
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

          // Atualizar saldo do material
          db.run(`UPDATE materiais_almoxarifado SET quantidade_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [saldoPosterior, material_id], (err3) => {
              if (err3) return res.status(500).json({ error: err3.message });
              res.status(201).json({
                id: this.lastID, material_id, tipo, quantidade,
                saldo_anterior: saldoAnterior, saldo_posterior: saldoPosterior,
                motivo, referencia, observacoes
              });
            });
        }
      );
    });
  });

  // GET /api/almoxarifado/movimentacoes/:id/historico — histórico de um material
  app.get('/api/almoxarifado/materiais/:id/historico', authenticateToken, (req, res) => {
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
  app.get('/api/almoxarifado/conferencias', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM conferencias_almoxarifado ORDER BY created_at DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // GET /api/almoxarifado/conferencias/:id — detalhe com itens
  app.get('/api/almoxarifado/conferencias/:id', authenticateToken, (req, res) => {
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
          res.json({ ...conf, itens });
        });
    });
  });

  // POST /api/almoxarifado/conferencias — criar nova conferência
  app.post('/api/almoxarifado/conferencias', authenticateToken, (req, res) => {
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
  app.put('/api/almoxarifado/conferencias/:id/item/:itemId', authenticateToken, (req, res) => {
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
  app.put('/api/almoxarifado/conferencias/:id/concluir', authenticateToken, (req, res) => {
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
                res.json({ success: true, ajustesAplicados: ajustes.length });
              });
          }).catch(e => res.status(500).json({ error: e.message }));
        });
    });
  });

  // DELETE /api/almoxarifado/conferencias/:id — cancelar conferência
  app.put('/api/almoxarifado/conferencias/:id/cancelar', authenticateToken, (req, res) => {
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
  app.get('/api/almoxarifado/relatorio/posicao-estoque', authenticateToken, (req, res) => {
    db.all(`SELECT *, (quantidade_atual * custo_unitario) as valor_total
            FROM materiais_almoxarifado
            WHERE ativo = 1
            ORDER BY categoria, nome`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // GET /api/almoxarifado/relatorio/movimentacoes-periodo
  app.get('/api/almoxarifado/relatorio/movimentacoes-periodo', authenticateToken, (req, res) => {
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

  console.log('✅ Módulo Almoxarifado registrado');
};
