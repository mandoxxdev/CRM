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
// Etapa 91 (T5, C141): o cancelamento por aqui solta as reservas e grava a trilha, como o do almoxarifado.
const reservationService = require('../services/almoxarifado/reservationService');
const { registrarAuditoria } = require('../services/almoxarifado/audit');
const { dbRun, dbGet } = require('../services/almoxarifado/db');
const { CANCELAVEIS_OUTROS_MODULOS } = require('../services/almoxarifado/requisitionStateMachine');
const { disponivelSql } = require('../services/almoxarifado/availabilitySql');
const requisitionCreateService = require('../services/almoxarifado/requisitionCreateService');
const alertService = require('../services/almoxarifado/alertService');
const { canDeleteAlmoxRequisicao } = require('../services/systemPermissions');
const { validate } = require('../services/almoxarifado/validation');
const { RequisicaoSchema } = require('../services/almoxarifado/schemas');

module.exports = function registerRequisicoesMaterialRoutes(app, db, authenticateToken) {

  // Etapa 25, Task 3: este prefixo NAO e `/api/almoxarifado`, entao o middleware de origem
  // registrado la nao o alcanca — e o `DELETE /api/requisicoes-material/:id` chega em
  // `requisitionService.excluirRequisicao`, que ESTORNA as entregas por
  // `stockService.registrarMovimentacao` (requisitionService.js:415). Sem esta linha, a exclusao
  // administrativa de requisicao seria o unico caminho de movimentacao de producao a gravar
  // origem vazia — e em silencio, porque o mesmo servico entra tambem por
  // `routes/almoxarifado.js:3544`, que fica coberto.
  const { anexarOrigemAoUsuario } = require('../services/almoxarifado/origemRequisicao');
  app.use('/api/requisicoes-material', authenticateToken, anexarOrigemAoUsuario);



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

           WHERE ir.requisicao_id = ?

           ORDER BY ir.id`,

          [req.params.id],

          (err2, itens) => {

            if (err2) return res.status(500).json({ error: err2.message });

            // Etapa 33: este endpoint devolvia `foto` CRU — o irmao da linha ~153 enriquece e
            // este nao enriquecia. A tela de Minhas Requisicoes (RequisicoesList.js) remontava a
            // URL no client, e URL remontada nao tem assinatura: sem este enrich a miniatura de
            // TODO item sumiria, em silencio. Achado da revisao do plano.
            const itensSanitizados = (itens || []).map((row) => enrichMaterialRow(sanitizeRequisicaoItemForSector(row)));

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



  // Etapa 91 (T5, C141, B426): a rota so fazia o UPDATE guardado — a reserva ATIVA da requisicao ficava
  // presa (de APROVADO, ou de PENDENTE na janela da aprovacao), e presa para sempre: o recalculo da 76 nao
  // toca requisicao cancelada e a expiracao e opt-in. Agora, como o cancelamento do almoxarifado
  // (routes/almoxarifado.js, PUT /requisicoes/:id/cancelar), solta as reservas e grava a trilha — as duas
  // best-effort: o cancelamento ja esta efetivado e e o que o usuario pediu.
  // `reservationService.liberarReservasDaRequisicao` e chamada PELO OBJETO (costura dos testes) e engole a
  // falha de cada reserva, devolvendo `{ liberadas, erros }`: por isso ha dois warns — L2 (lancou) e L2b
  // (voltou com reserva presa). Este arquivo e varrido pelo `saldoEmTerceiros`: nada de conta de disponivel.
  //
  // Etapa 92 (T1, C149, B434/B435): a rota aceitava so PENDENTE/APROVADO, mas a tela dos outros modulos
  // mostra Cancelar em seis status — em quatro deles quem pediu tomava 400 e as reservadas seguravam o
  // material ate o almoxarife cancelar. Agora aceita CANCELAVEIS_OUTROS_MODULOS (a lista da tela, RN-07),
  // so para quem pediu, com compare-and-set contra o status LIDO: perdeu (o recalculo da 76 trocou
  // TOTALMENTE <-> PARCIALMENTE, ou a separacao reivindicou) -> rele e tenta UMA vez mais; a trilha grava o
  // status que o UPDATE de fato trocou (C148 (2)). Descartados: `status IN (lista)` sem o lido (a trilha
  // podia mentir) e tentar sem teto.
  app.put('/api/requisicoes-material/:id/cancelar', async (req, res) => {
    const id = req.params.id;
    let trocado = null;
    let numero = null;
    try {
      for (let tentativa = 0; tentativa < 2 && !trocado; tentativa++) {
        // eslint-disable-next-line no-await-in-loop
        const row = await dbGet(db, 'SELECT status, numero FROM requisicoes_almoxarifado WHERE id = ? AND solicitante_id = ?', [id, req.user.id]);
        if (!row || !CANCELAVEIS_OUTROS_MODULOS.includes(row.status)) break;
        // eslint-disable-next-line no-await-in-loop
        const r = await dbRun(db,
          `UPDATE requisicoes_almoxarifado SET status='CANCELADO', updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL
         WHERE id=? AND solicitante_id=? AND status=?`,
          [id, req.user.id, row.status]);
        if (r.changes > 0) { trocado = row.status; numero = row.numero; }
      }
      if (!trocado) {
        return res.status(400).json({ error: 'Requisição não encontrada ou não pode ser cancelada' });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
    try {
      const { erros } = await reservationService.liberarReservasDaRequisicao(db, req.user, id, 'Requisição cancelada');
      if (erros.length > 0) {
        console.warn(`[requisicoes-material] liberacao das reservas no cancelamento deixou ${erros.length} reserva(s) presa(s) (requisicao ${id}): ${erros.map((x) => `${x.id}: ${x.erro}`).join('; ')}`);
      }
    } catch (e) {
      console.warn(`[requisicoes-material] liberacao das reservas no cancelamento falhou (requisicao ${id}): ${e.message}`);
    }
    try {
      await registrarAuditoria(db, {
        entidade: 'requisicao', entidade_id: Number(id), acao: 'CANCELAMENTO',
        usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
        dados_anteriores: { status: trocado },
        dados_novos: { status: 'CANCELADO', numero, via: 'requisicoes-material' },
        justificativa: null,
      });
    } catch (e) {
      console.warn(`[requisicoes-material] auditoria do cancelamento falhou (requisicao ${id}): ${e.message}`);
    }
    res.json({ success: true });
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


