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
      ncm, especificacoes, observacoes,
      descricao_tecnica, categoria_id, subcategoria_id, localizacao_padrao_id,
      fornecedor_id, tipo_material, material_critico, controle_lote, controle_certificado,
    } = req.body;

    if (!codigo || !nome) return res.status(400).json({ error: 'Código e nome são obrigatórios' });

    db.run(`INSERT INTO materiais_almoxarifado
      (codigo, nome, descricao, categoria, unidade, localizacao, quantidade_atual,
       quantidade_minima, quantidade_maxima, custo_unitario, fornecedor_principal,
       codigo_fornecedor, ncm, especificacoes, observacoes,
       descricao_tecnica, categoria_id, subcategoria_id, localizacao_padrao_id,
       fornecedor_id, tipo_material, material_critico, controle_lote, controle_certificado)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [codigo, nome, descricao || null, categoria || 'OUTROS', unidade || 'UN',
       localizacao || null, quantidade_atual || 0, quantidade_minima || 0,
       quantidade_maxima || 0, custo_unitario || 0, fornecedor_principal || null,
       codigo_fornecedor || null, ncm || null, especificacoes || null, observacoes || null,
       descricao_tecnica || null, categoria_id || null, subcategoria_id || null,
       localizacao_padrao_id || null, fornecedor_id || null, tipo_material || null,
       material_critico ? 1 : 0, controle_lote ? 1 : 0, controle_certificado ? 1 : 0],
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
      fornecedor_principal, codigo_fornecedor, ncm, especificacoes, observacoes, ativo,
      descricao_tecnica, categoria_id, subcategoria_id, localizacao_padrao_id,
      fornecedor_id, tipo_material, material_critico, controle_lote, controle_certificado,
    } = req.body;

    db.run(`UPDATE materiais_almoxarifado SET
      codigo = ?, nome = ?, descricao = ?, categoria = ?, unidade = ?, localizacao = ?,
      quantidade_minima = ?, quantidade_maxima = ?, custo_unitario = ?,
      fornecedor_principal = ?, codigo_fornecedor = ?, ncm = ?, especificacoes = ?,
      observacoes = ?, ativo = ?,
      descricao_tecnica = ?, categoria_id = ?, subcategoria_id = ?, localizacao_padrao_id = ?,
      fornecedor_id = ?, tipo_material = ?, material_critico = ?, controle_lote = ?, controle_certificado = ?,
      updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [codigo, nome, descricao || null, categoria || 'OUTROS', unidade || 'UN',
       localizacao || null, quantidade_minima || 0, quantidade_maxima || 0,
       custo_unitario || 0, fornecedor_principal || null, codigo_fornecedor || null,
       ncm || null, especificacoes || null, observacoes || null,
       ativo !== undefined ? ativo : 1,
       descricao_tecnica || null, categoria_id || null, subcategoria_id || null,
       localizacao_padrao_id || null, fornecedor_id || null, tipo_material || null,
       material_critico ? 1 : 0, controle_lote ? 1 : 0, controle_certificado ? 1 : 0,
       req.params.id],
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
  });

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
  db.run(`ALTER TABLE localizacoes_almoxarifado ADD COLUMN pos_x REAL`, () => {});
  db.run(`ALTER TABLE localizacoes_almoxarifado ADD COLUMN pos_y REAL`, () => {});
  db.run(`ALTER TABLE localizacoes_almoxarifado ADD COLUMN largura REAL DEFAULT 120`, () => {});
  db.run(`ALTER TABLE localizacoes_almoxarifado ADD COLUMN altura REAL DEFAULT 80`, () => {});


  // ════════════════════════════════════════════════════════════════════════════
  // TIPOS DE MATERIAL
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/almoxarifado/tipos-material', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM tipos_material_almoxarifado WHERE ativo = 1 ORDER BY nome`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  app.post('/api/almoxarifado/tipos-material', authenticateToken, (req, res) => {
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

  app.put('/api/almoxarifado/tipos-material/:id', authenticateToken, (req, res) => {
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

  app.delete('/api/almoxarifado/tipos-material/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
    db.run(`UPDATE tipos_material_almoxarifado SET ativo = 0 WHERE id = ?`, [req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // LOCALIZAÇÕES
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/almoxarifado/localizacoes', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM localizacoes_almoxarifado WHERE ativo = 1 ORDER BY setor, codigo`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  app.post('/api/almoxarifado/localizacoes', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
    const { codigo, descricao, setor, tipo, parent_id, pos_x, pos_y, largura, altura } = req.body;
    if (!codigo) return res.status(400).json({ error: 'Código obrigatório' });
    db.run(`INSERT INTO localizacoes_almoxarifado (codigo, descricao, setor, tipo, parent_id, pos_x, pos_y, largura, altura) VALUES (?,?,?,?,?,?,?,?,?)`,
      [codigo, descricao || null, setor || null, tipo || 'Almoxarifado', parent_id || null,
       pos_x ?? null, pos_y ?? null, largura ?? 120, altura ?? 80],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Código já existe' });
          return res.status(500).json({ error: err.message });
        }
        db.get(`SELECT * FROM localizacoes_almoxarifado WHERE id = ?`, [this.lastID], (e, r) => res.status(201).json(r));
      });
  });

  app.put('/api/almoxarifado/localizacoes/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
    const { codigo, descricao, setor, tipo, parent_id, pos_x, pos_y, largura, altura, ativo } = req.body;
    db.run(`UPDATE localizacoes_almoxarifado SET codigo=?, descricao=?, setor=?, tipo=?, parent_id=?, pos_x=?, pos_y=?, largura=?, altura=?, ativo=? WHERE id=?`,
      [codigo, descricao || null, setor || null, tipo || 'Almoxarifado', parent_id || null,
       pos_x ?? null, pos_y ?? null, largura ?? 120, altura ?? 80,
       ativo !== undefined ? ativo : 1, req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get(`SELECT * FROM localizacoes_almoxarifado WHERE id = ?`, [req.params.id], (e, r) => res.json(r));
      });
  });

  app.delete('/api/almoxarifado/localizacoes/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
    db.run(`UPDATE localizacoes_almoxarifado SET ativo = 0 WHERE id = ?`, [req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES (admin only)
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/almoxarifado/configuracoes', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM configuracoes_almoxarifado ORDER BY chave`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const obj = {};
      rows.forEach(r => { obj[r.chave] = { valor: r.valor, descricao: r.descricao, id: r.id }; });
      res.json(obj);
    });
  });

  app.put('/api/almoxarifado/configuracoes', authenticateToken, (req, res) => {
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

  // PUT /api/almoxarifado/configuracoes/estoques-minimos — atualização em lote
  app.put('/api/almoxarifado/configuracoes/estoques-minimos', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
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
      .then(() => res.json({ success: true, updated: materiais.length }))
      .catch(e => res.status(500).json({ error: e.message }));
  });

  // PUT /api/almoxarifado/configuracoes/tipos-material — associar tipo a material em lote
  app.put('/api/almoxarifado/configuracoes/tipos-material', authenticateToken, (req, res) => {
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
  app.get('/api/almoxarifado/requisicoes', authenticateToken, (req, res) => {
    const { status, urgencia, minha, departamento } = req.query;
    let sql = `SELECT r.*,
                 (SELECT COUNT(*) FROM itens_requisicao_almoxarifado WHERE requisicao_id = r.id) as total_itens
               FROM requisicoes_almoxarifado r WHERE 1=1`;
    const params = [];

    if (minha === '1') { sql += ` AND r.solicitante_id = ?`; params.push(req.user.id); }
    if (status) { sql += ` AND r.status = ?`; params.push(status); }
    if (urgencia) { sql += ` AND r.urgencia = ?`; params.push(urgencia); }
    if (departamento) { sql += ` AND r.departamento LIKE ?`; params.push(`%${departamento}%`); }

    sql += ` ORDER BY CASE r.urgencia WHEN 'CRITICO' THEN 1 WHEN 'URGENTE' THEN 2 ELSE 3 END, r.created_at DESC`;

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // GET /api/almoxarifado/requisicoes/:id — detalhe com itens
  app.get('/api/almoxarifado/requisicoes/:id', authenticateToken, (req, res) => {
    db.get(`SELECT * FROM requisicoes_almoxarifado WHERE id = ?`, [req.params.id], (err, req_row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!req_row) return res.status(404).json({ error: 'Requisição não encontrada' });

      db.all(`SELECT ir.*, ma.nome as material_nome, ma.codigo as material_codigo,
                     ma.unidade, ma.quantidade_atual as saldo_atual, ma.foto,
                     tm.nome as tipo_nome, tm.icone as tipo_icone, tm.is_epi, tm.requer_assinatura
              FROM itens_requisicao_almoxarifado ir
              JOIN materiais_almoxarifado ma ON ir.material_id = ma.id
              LEFT JOIN tipos_material_almoxarifado tm ON ma.tipo_material_id = tm.id
              WHERE ir.requisicao_id = ?`,
        [req.params.id], (err2, itens) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ ...req_row, itens });
        });
    });
  });

  // POST /api/almoxarifado/requisicoes — criar requisição
  app.post('/api/almoxarifado/requisicoes', authenticateToken, (req, res) => {
    const { departamento, os_referencia, urgencia, observacoes, justificativa_urgencia, itens } = req.body;
    if (!itens || itens.length === 0) return res.status(400).json({ error: 'Inclua ao menos um item' });

    const numero = gerarNumeroReq();

    db.run(`INSERT INTO requisicoes_almoxarifado
            (numero, solicitante_id, solicitante_nome, departamento, os_referencia, urgencia, observacoes, justificativa_urgencia, status)
            VALUES (?,?,?,?,?,?,?,?,'PENDENTE')`,
      [numero, req.user.id, req.user.nome || req.user.email,
       departamento || null, os_referencia || null,
       urgencia || 'NORMAL', observacoes || null, justificativa_urgencia || null],
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

        Promise.all(insertsItens).then(() => {
          // Verificar aprovação automática
          db.get(`SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'aprovacao_automatica'`, [], (e, cfg) => {
            if (!e && cfg && cfg.valor === '1' && urgencia !== 'CRITICO') {
              db.run(`UPDATE requisicoes_almoxarifado SET status='APROVADO', aprovador_nome='Sistema (automático)', data_aprovacao=CURRENT_TIMESTAMP WHERE id=?`,
                [reqId], () => {
                  res.status(201).json({ id: reqId, numero, status: 'APROVADO', aprovacao: 'automatica' });
                });
            } else {
              res.status(201).json({ id: reqId, numero, status: 'PENDENTE' });
            }
          });
        }).catch(e => res.status(500).json({ error: e.message }));
      }
    );
  });

  // PUT /api/almoxarifado/requisicoes/:id/aprovar — aprovar
  app.put('/api/almoxarifado/requisicoes/:id/aprovar', authenticateToken, (req, res) => {
    db.run(`UPDATE requisicoes_almoxarifado SET status='APROVADO', aprovador_id=?, aprovador_nome=?, data_aprovacao=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
            WHERE id=? AND status='PENDENTE'`,
      [req.user.id, req.user.nome || req.user.email, req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(400).json({ error: 'Apenas requisições pendentes podem ser aprovadas' });
        res.json({ success: true });
      });
  });

  // PUT /api/almoxarifado/requisicoes/:id/rejeitar — rejeitar
  app.put('/api/almoxarifado/requisicoes/:id/rejeitar', authenticateToken, (req, res) => {
    const { motivo } = req.body;
    db.run(`UPDATE requisicoes_almoxarifado SET status='REJEITADO', rejeicao_motivo=?, aprovador_id=?, aprovador_nome=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=? AND status='PENDENTE'`,
      [motivo || null, req.user.id, req.user.nome || req.user.email, req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(400).json({ error: 'Apenas requisições pendentes podem ser rejeitadas' });
        res.json({ success: true });
      });
  });

  // PUT /api/almoxarifado/requisicoes/:id/separacao — em separação
  app.put('/api/almoxarifado/requisicoes/:id/separacao', authenticateToken, (req, res) => {
    db.run(`UPDATE requisicoes_almoxarifado SET status='EM_SEPARACAO', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='APROVADO'`,
      [req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(400).json({ error: 'Requisição deve estar aprovada' });
        res.json({ success: true });
      });
  });

  // PUT /api/almoxarifado/requisicoes/:id/entregar — entregar e baixar estoque
  app.put('/api/almoxarifado/requisicoes/:id/entregar', authenticateToken, (req, res) => {
    const { itens_atendidos } = req.body; // [{ item_id, quantidade_atendida }]

    db.get(`SELECT * FROM requisicoes_almoxarifado WHERE id = ?`, [req.params.id], (err, req_row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!req_row) return res.status(404).json({ error: 'Requisição não encontrada' });
      if (!['APROVADO', 'EM_SEPARACAO'].includes(req_row.status)) {
        return res.status(400).json({ error: 'Requisição deve estar aprovada ou em separação' });
      }

      db.all(`SELECT ir.*, ma.quantidade_atual, ma.unidade, ma.nome as material_nome
              FROM itens_requisicao_almoxarifado ir
              JOIN materiais_almoxarifado ma ON ir.material_id = ma.id
              WHERE ir.requisicao_id = ?`, [req.params.id], (err2, itens) => {
        if (err2) return res.status(500).json({ error: err2.message });

        const ops = itens.map(item => {
          const atendido = itens_atendidos
            ? (itens_atendidos.find(ia => ia.item_id === item.id)?.quantidade_atendida ?? item.quantidade_solicitada)
            : item.quantidade_solicitada;
          const qtdReal = Math.min(atendido, item.quantidade_atual); // não pode exceder saldo

          return new Promise((resolve, reject) => {
            if (qtdReal <= 0) return resolve();
            const saldoAnterior = item.quantidade_atual;
            const saldoPosterior = saldoAnterior - qtdReal;

            db.run(`UPDATE materiais_almoxarifado SET quantidade_atual=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
              [saldoPosterior, item.material_id], (e) => {
                if (e) return reject(e);
                db.run(`INSERT INTO movimentacoes_almoxarifado
                  (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, referencia, usuario_id, usuario_nome)
                  VALUES (?, 'SAIDA', ?, ?, ?, ?, ?, ?, ?)`,
                  [item.material_id, qtdReal, saldoAnterior, saldoPosterior,
                   `Requisição ${req_row.numero}`, req_row.os_referencia || req_row.numero,
                   req.user.id, req.user.nome || req.user.email],
                  (e2) => {
                    if (e2) return reject(e2);
                    db.run(`UPDATE itens_requisicao_almoxarifado SET quantidade_atendida=? WHERE id=?`,
                      [qtdReal, item.id], resolve);
                  });
              });
          });
        });

        Promise.all(ops).then(() => {
          db.run(`UPDATE requisicoes_almoxarifado SET status='ENTREGUE', data_entrega=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            [req.params.id], (e) => {
              if (e) return res.status(500).json({ error: e.message });
              res.json({ success: true });
            });
        }).catch(e => res.status(500).json({ error: e.message }));
      });
    });
  });

  // PUT /api/almoxarifado/requisicoes/:id/cancelar — cancelar
  app.put('/api/almoxarifado/requisicoes/:id/cancelar', authenticateToken, (req, res) => {
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
      db.run(`UPDATE requisicoes_almoxarifado SET status='CANCELADO', rejeicao_motivo=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [motivo || null, req.params.id],
        function (err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ success: true });
        });
    });
  });

  // GET /api/almoxarifado/dashboard atualizado com requisições
  app.get('/api/almoxarifado/dashboard/requisicoes', authenticateToken, (req, res) => {
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
                    WHERE r.status IN ('PENDENTE','APROVADO','EM_SEPARACAO')
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
  require('./almoxarifado/extended')(app, db, authenticateToken);

  console.log('✅ Módulo Almoxarifado registrado (v3 — controle completo de estoque)');
};
