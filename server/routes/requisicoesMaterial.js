/**

 * API cross-módulo para requisições de material (sem exigir permissão do módulo almoxarifado)

 */

const sectorMaterialService = require('../services/almoxarifado/sectorMaterialService');

const {

  sanitizeMaterialForSector,

  sanitizeRequisicaoItemForSector,

  checkDisponibilidadeBatch,

} = require('../services/almoxarifado/stockAvailabilityService');

const { enrichMaterialRow } = require('../services/almoxarifado/materialPhoto');
const requisitionService = require('../services/almoxarifado/requisitionService');
const { disponivelSql } = require('../services/almoxarifado/availabilitySql');
const requisitionCreateService = require('../services/almoxarifado/requisitionCreateService');
const alertService = require('../services/almoxarifado/alertService');
const { canDeleteAlmoxRequisicao } = require('../services/systemPermissions');
const { validate } = require('../services/almoxarifado/validation');
const { RequisicaoSchema } = require('../services/almoxarifado/schemas');

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



  app.post('/api/requisicoes-material/disponibilidade', async (req, res) => {

    const { itens } = req.body || {};

    if (!itens?.length) return res.status(400).json({ error: 'Informe ao menos um item' });

    try {

      const resultado = await checkDisponibilidadeBatch(db, itens);

      res.json(resultado);

    } catch (e) {

      res.status(500).json({ error: e.message });

    }

  });



  app.get('/api/requisicoes-material/materiais', async (req, res) => {

    const { setor, search, modulo, quantidade } = req.query;

    const qtyPadrao = Math.max(1, Number(quantidade) || 1);



    try {

      await sectorMaterialService.ensureSetoresRequisicao(db);



      let setorNome = setor;

      if (!setorNome && modulo) {

        const setorRow = await sectorMaterialService.getSetorByModulo(db, modulo);

        setorNome = setorRow?.nome;

      }

      if (!setorNome) return res.status(400).json({ error: 'Parâmetro setor é obrigatório' });



      const filterClause = await sectorMaterialService.buildMaterialFilterClause(db, setorNome);



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

        const sanitized = (rows || []).map((row) =>
          enrichMaterialRow(sanitizeMaterialForSector(row, qtyPadrao)),
        );

        res.json(sanitized);

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

                  ma.unidade,

                  ${disponivelSql('ma')} as saldo_atual,

                  ma.foto,

                  tm.icone as tipo_icone

           FROM itens_requisicao_almoxarifado ir

           JOIN materiais_almoxarifado ma ON ir.material_id = ma.id

           LEFT JOIN tipos_material_almoxarifado tm ON ma.tipo_material_id = tm.id

           WHERE ir.requisicao_id = ?`,

          [req.params.id],

          (err2, itens) => {

            if (err2) return res.status(500).json({ error: err2.message });

            const itensSanitizados = (itens || []).map(sanitizeRequisicaoItemForSector);

            res.json({ ...reqRow, itens: itensSanitizados });

          }

        );

      }

    );

  });



  app.post('/api/requisicoes-material', validate(RequisicaoSchema), async (req, res) => {

    const setorFinal = req.body.departamento || req.body.setor;

    if (!setorFinal) return res.status(400).json({ error: 'Setor é obrigatório' });



    try {

      const result = await requisitionCreateService.createRequisicao(

        db, req.user, req.body, { modulo: 'requisicoes-material' },

      );

      res.status(201).json(result);

    } catch (e) {

      res.status(e.status || 500).json({ error: e.message });

    }

  });



  app.put('/api/requisicoes-material/:id/cancelar', (req, res) => {

    db.run(

      `UPDATE requisicoes_almoxarifado SET status='CANCELADO', updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL

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



  // DELETE /api/requisicoes-material/:id — exclusão administrativa (soft delete + estorno)
  app.delete('/api/requisicoes-material/:id', (req, res) => {
    if (!canDeleteAlmoxRequisicao(req.user)) {
      return res.status(403).json({ error: 'Apenas administradores do Almoxarifado ou Super Administrador podem excluir requisições' });
    }
    const justificativa = req.body?.justificativa || req.query?.justificativa;
    requisitionService.excluirRequisicao(db, req.params.id, req.user, justificativa, alertService)
      .then((result) => res.json(result))
      .catch((e) => res.status(e.status || 500).json({ error: e.message }));
  });

};


