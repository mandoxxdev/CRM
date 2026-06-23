/**
 * API cross-módulo para requisições de material (sem exigir permissão do módulo almoxarifado)
 */
const sectorMaterialService = require('../services/almoxarifado/sectorMaterialService');

function gerarNumeroReq() {
  const ts = Date.now().toString().slice(-6);
  const rand = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  return `REQ-${ts}${rand}`;
}

module.exports = function registerRequisicoesMaterialRoutes(app, db, authenticateToken) {
  app.use('/api/requisicoes-material', authenticateToken);

  app.get('/api/requisicoes-material/setores', async (req, res) => {
    try {
      await sectorMaterialService.ensureSetoresRequisicao(db);
      const rows = await sectorMaterialService.listSetores(db);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/requisicoes-material/materiais', async (req, res) => {
    const { setor, search } = req.query;
    if (!setor) return res.status(400).json({ error: 'Parâmetro setor é obrigatório' });

    try {
      await sectorMaterialService.ensureSetoresRequisicao(db);
      const filterClause = await sectorMaterialService.buildMaterialFilterClause(db, setor);

      let sql = `SELECT m.*, f.nome as familia_nome, f.codigo as familia_codigo,
                        tm.icone as tipo_icone
                 FROM materiais_almoxarifado m
                 LEFT JOIN familias_material_almoxarifado f ON m.familia_id = f.id
                 LEFT JOIN tipos_material_almoxarifado tm ON m.tipo_material_id = tm.id
                 WHERE m.ativo = 1`;
      const params = [];

      if (filterClause) sql += ` AND ${filterClause}`;
      if (search) {
        sql += ` AND (m.nome LIKE ? OR m.codigo LIKE ? OR m.descricao LIKE ?)`;
        const s = `%${search}%`;
        params.push(s, s, s);
      }
      sql += ' ORDER BY m.nome ASC';

      db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/requisicoes-material', (req, res) => {
    const { setor, minha, status } = req.query;
    let sql = `SELECT r.*,
                 (SELECT COUNT(*) FROM itens_requisicao_almoxarifado WHERE requisicao_id = r.id) as total_itens
               FROM requisicoes_almoxarifado r
               WHERE COALESCE(r.ativo, 1) = 1`;
    const params = [];

    if (minha === '1') {
      sql += ' AND r.solicitante_id = ?';
      params.push(req.user.id);
    } else if (setor) {
      sql += ' AND (r.departamento = ? OR r.setor = ?)';
      params.push(setor, setor);
    } else {
      sql += ' AND r.solicitante_id = ?';
      params.push(req.user.id);
    }

    if (status) {
      sql += ' AND r.status = ?';
      params.push(status);
    }

    sql += ` ORDER BY r.created_at DESC`;

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  app.get('/api/requisicoes-material/:id', (req, res) => {
    db.get(
      `SELECT * FROM requisicoes_almoxarifado WHERE id = ? AND COALESCE(ativo, 1) = 1`,
      [req.params.id],
      (err, reqRow) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!reqRow) return res.status(404).json({ error: 'Requisição não encontrada' });

        const isOwner = reqRow.solicitante_id === req.user.id;
        const isAdmin = req.user.role === 'admin';
        if (!isOwner && !isAdmin) {
          return res.status(403).json({ error: 'Sem permissão para ver esta requisição' });
        }

        db.all(
          `SELECT ir.*, ma.nome as material_nome, ma.codigo as material_codigo,
                  ma.unidade, ma.quantidade_atual as saldo_atual, ma.foto,
                  tm.icone as tipo_icone
           FROM itens_requisicao_almoxarifado ir
           JOIN materiais_almoxarifado ma ON ir.material_id = ma.id
           LEFT JOIN tipos_material_almoxarifado tm ON ma.tipo_material_id = tm.id
           WHERE ir.requisicao_id = ?`,
          [req.params.id],
          (err2, itens) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ ...reqRow, itens: itens || [] });
          }
        );
      }
    );
  });

  app.post('/api/requisicoes-material', async (req, res) => {
    const {
      departamento, setor, os_referencia, urgencia, observacoes,
      justificativa_urgencia, itens, modulo_origem,
    } = req.body;

    const setorFinal = departamento || setor;
    if (!setorFinal) return res.status(400).json({ error: 'Setor é obrigatório' });
    if (!itens?.length) return res.status(400).json({ error: 'Inclua ao menos um item' });

    try {
      await sectorMaterialService.ensureSetoresRequisicao(db);
      await sectorMaterialService.validateMateriaisParaSetor(
        db, setorFinal, itens.map((i) => i.material_id)
      );
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message });
    }

    const numero = gerarNumeroReq();

    db.run(
      `INSERT INTO requisicoes_almoxarifado
       (numero, solicitante_id, solicitante_nome, departamento, setor, os_referencia,
        urgencia, observacoes, justificativa_urgencia, modulo_origem, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,'PENDENTE')`,
      [
        numero, req.user.id, req.user.nome || req.user.email,
        setorFinal, setorFinal, os_referencia || null,
        urgencia || 'NORMAL', observacoes || null, justificativa_urgencia || null,
        modulo_origem || null,
      ],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const reqId = this.lastID;

        const inserts = itens.map((item) => new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO itens_requisicao_almoxarifado
             (requisicao_id, material_id, quantidade_solicitada, observacoes)
             VALUES (?,?,?,?)`,
            [reqId, item.material_id, item.quantidade, item.observacoes || null],
            (e) => (e ? reject(e) : resolve())
          );
        }));

        Promise.all(inserts)
          .then(() => res.status(201).json({ id: reqId, numero, status: 'PENDENTE' }))
          .catch((e) => res.status(500).json({ error: e.message }));
      }
    );
  });

  app.put('/api/requisicoes-material/:id/cancelar', (req, res) => {
    db.run(
      `UPDATE requisicoes_almoxarifado SET status='CANCELADO', updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND solicitante_id=? AND status IN ('PENDENTE','APROVADO')`,
      [req.params.id, req.user.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) {
          return res.status(400).json({ error: 'Requisição não encontrada ou não pode ser cancelada' });
        }
        res.json({ success: true });
      }
    );
  });
};
