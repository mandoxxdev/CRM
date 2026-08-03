/**
 * Extended API routes for almoxarifado v3
 */
const { canConfigureAlmox, isSystemAdmin } = require('../../services/systemPermissions');
const { initSchema, TIPOS_MATERIAL_ENUM, TIPOS_LOCALIZACAO, SETORES_REQUISICAO } = require('../../services/almoxarifado/schema');
const { requirePermission } = require('../../services/almoxarifado/permissions');
const { dbAll, dbGet, dbRun } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const receiptService = require('../../services/almoxarifado/receiptService');
const returnService = require('../../services/almoxarifado/returnService');
const scrapService = require('../../services/almoxarifado/scrapService');
const toolService = require('../../services/almoxarifado/toolService');
const clientMaterialService = require('../../services/almoxarifado/clientMaterialService');
const reportService = require('../../services/almoxarifado/reportService');
const sectorMaterialService = require('../../services/almoxarifado/sectorMaterialService');
const purchaseService = require('../../services/almoxarifado/purchaseService');

function handleError(res, err) {
  const status = err.status || 500;
  res.status(status).json({ error: err.message });
}

async function runInitSchemaWithRetry(db, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await initSchema(db);
      return;
    } catch (e) {
      console.error(`Erro schema almoxarifado v3 (tentativa ${attempt}/${retries}):`, e.message);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
  }
}

module.exports = function registerExtendedRoutes(app, db, authenticateToken) {
  runInitSchemaWithRetry(db).catch((e) => console.error('Falha definitiva schema almoxarifado v3:', e.message));

  const auth = authenticateToken;

  // ── Metadata ──
  app.get('/api/almoxarifado/meta/tipos-material', auth, (req, res) => {
    res.json({ tipos: TIPOS_MATERIAL_ENUM, setores: SETORES_REQUISICAO, localizacoes_tipos: TIPOS_LOCALIZACAO });
  });

  app.get('/api/almoxarifado/categorias', auth, async (req, res) => {
    try {
      const rows = await dbAll(db, 'SELECT * FROM categorias_material_almoxarifado WHERE ativo = 1 ORDER BY nome');
      res.json(rows);
    } catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/unidades-medida', auth, async (req, res) => {
    try {
      const rows = await dbAll(db, 'SELECT * FROM unidades_medida_almoxarifado WHERE ativo = 1 ORDER BY sigla');
      res.json(rows);
    } catch (e) { handleError(res, e); }
  });

  // ── Mapa de localizações ──
  app.get('/api/almoxarifado/mapa/localizacoes', auth, async (req, res) => {
    try {
      res.json(await stockService.consultarMapaLocalizacoes(db));
    } catch (e) { handleError(res, e); }
  });

  app.put('/api/almoxarifado/mapa/localizacoes/posicoes', auth, async (req, res) => {
    if (!canConfigureAlmox(req.user)) {
      return res.status(403).json({ error: 'Acesso restrito — administrador do Almoxarifado ou Super Administrador' });
    }
    const { posicoes } = req.body;
    if (!Array.isArray(posicoes) || posicoes.length === 0) {
      return res.status(400).json({ error: 'Lista de posições obrigatória' });
    }
    try {
      for (const p of posicoes) {
        if (!p.id) continue;
        await dbRun(db, `UPDATE localizacoes_almoxarifado SET pos_x=?, pos_y=?, largura=?, altura=? WHERE id=?`,
          [p.pos_x, p.pos_y, p.largura ?? 120, p.altura ?? 80, p.id]);
      }
      res.json({ success: true, atualizados: posicoes.length });
    } catch (e) { handleError(res, e); }
  });

  // ── Estoque ──
  app.get('/api/almoxarifado/estoque', auth, async (req, res) => {
    try {
      const rows = await stockService.consultarEstoque(db, req.query);
      res.json(rows);
    } catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/estoque/:materialId/saldos', auth, async (req, res) => {
    try {
      const rows = await stockService.consultarSaldosPorLocalizacao(db, req.params.materialId);
      res.json(rows);
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/movimentacoes/v2', auth, requirePermission('movimentar'), async (req, res) => {
    try {
      const result = await stockService.registrarMovimentacao(db, req.user, req.body);
      res.status(201).json(result);
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/movimentacoes/:id/cancelar', auth, requirePermission('ajustar_estoque'), async (req, res) => {
    try {
      const result = await stockService.cancelarMovimentacao(db, req.user, req.params.id, req.body.motivo);
      res.json(result);
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/transferencias', auth, requirePermission('movimentar'), async (req, res) => {
    try {
      const result = await stockService.registrarMovimentacao(db, req.user, { ...req.body, tipo: 'TRANSFERENCIA' });
      res.status(201).json(result);
    } catch (e) { handleError(res, e); }
  });

  // ── Reservas ──
  app.get('/api/almoxarifado/reservas', auth, async (req, res) => {
    try {
      let sql = `SELECT r.*, m.nome as material_nome, m.codigo as material_codigo
        FROM reservas_material_almoxarifado r JOIN materiais_almoxarifado m ON r.material_id = m.id WHERE 1=1`;
      const params = [];
      if (req.query.status) { sql += ' AND r.status = ?'; params.push(req.query.status); }
      if (req.query.os_id) { sql += ' AND (r.os_id = ? OR r.os_referencia = ?)'; params.push(req.query.os_id, String(req.query.os_id)); }
      sql += ' ORDER BY r.created_at DESC';
      res.json(await dbAll(db, sql, params));
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/reservas', auth, requirePermission('reservar'), async (req, res) => {
    try {
      const result = await stockService.criarReserva(db, req.user, req.body);
      res.status(201).json(result);
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/reservas/:id/liberar', auth, requirePermission('reservar'), async (req, res) => {
    try {
      const result = await stockService.liberarReserva(db, req.user, req.params.id, req.body.quantidade);
      res.json(result);
    } catch (e) { handleError(res, e); }
  });

  // ── Recebimentos ──
  app.get('/api/almoxarifado/recebimentos', auth, async (req, res) => {
    try { res.json(await receiptService.listarRecebimentos(db, req.query)); }
    catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/recebimentos/:id', auth, async (req, res) => {
    try {
      const rec = await receiptService.getRecebimento(db, req.params.id);
      if (!rec) return res.status(404).json({ error: 'Não encontrado' });
      res.json(rec);
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/recebimentos', auth, requirePermission('receber_material'), async (req, res) => {
    try {
      const result = await receiptService.criarRecebimento(db, req.user, req.body);
      res.status(201).json(result);
    } catch (e) { handleError(res, e); }
  });

  app.put('/api/almoxarifado/recebimentos/:id/conferir', auth, requirePermission('receber_material'), async (req, res) => {
    try {
      res.json(await receiptService.conferirRecebimento(db, req.user, req.params.id, req.body));
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/recebimentos/itens/:itemId/inspecionar', auth, requirePermission('inspecionar'), async (req, res) => {
    try {
      res.status(201).json(await receiptService.inspecionarItem(db, req.user, req.params.itemId, req.body));
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/recebimentos/:id/aprovar', auth, requirePermission('receber_material'), async (req, res) => {
    try {
      res.json(await receiptService.aprovarRecebimento(db, req.user, req.params.id, req.body));
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/recebimentos/:id/workflow', auth, requirePermission('receber_material'), async (req, res) => {
    try {
      res.json(await receiptService.avancarWorkflow(db, req.user, req.params.id, req.body.acao));
    } catch (e) { handleError(res, e); }
  });

  app.put('/api/almoxarifado/recebimentos/:id/fiscal', auth, requirePermission('receber_material'), async (req, res) => {
    try {
      res.json(await receiptService.salvarDadosFiscal(db, req.user, req.params.id, req.body));
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/recebimentos/:id/processar', auth, requirePermission('receber_material'), async (req, res) => {
    try {
      res.json(await receiptService.processarNota(db, req.user, req.params.id, req.body));
    } catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/recebimentos-aux/pedidos-compra', auth, async (req, res) => {
    try {
      res.json(await receiptService.listarPedidosCompraAux(db, req.query));
    } catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/recebimentos-aux/fornecedores', auth, async (req, res) => {
    try {
      res.json(await receiptService.listarFornecedoresAux(db, req.query));
    } catch (e) { handleError(res, e); }
  });

  // ── Devoluções ──
  app.get('/api/almoxarifado/devolucoes', auth, async (req, res) => {
    try { res.json(await returnService.listarDevolucoes(db, req.query)); }
    catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/devolucoes', auth, requirePermission('movimentar'), async (req, res) => {
    try {
      res.status(201).json(await returnService.registrarDevolucao(db, req.user, req.body));
    } catch (e) { handleError(res, e); }
  });

  // ── Sobras ──
  app.get('/api/almoxarifado/sobras', auth, async (req, res) => {
    try { res.json(await scrapService.listarSobras(db, req.query)); }
    catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/sobras', auth, requirePermission('movimentar'), async (req, res) => {
    try {
      res.status(201).json(await scrapService.criarSobra(db, req.user, req.body));
    } catch (e) { handleError(res, e); }
  });

  app.put('/api/almoxarifado/sobras/:id', auth, requirePermission('movimentar'), async (req, res) => {
    try { res.json(await scrapService.atualizarSobra(db, req.params.id, req.body)); }
    catch (e) { handleError(res, e); }
  });

  // ── Ferramentas ──
  app.get('/api/almoxarifado/ferramentas', auth, async (req, res) => {
    try { res.json(await toolService.listarFerramentas(db, req.query)); }
    catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/ferramentas', auth, requirePermission('movimentar'), async (req, res) => {
    try {
      res.status(201).json(await toolService.criarFerramenta(db, req.user, req.body));
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/ferramentas/:id/emprestar', auth, requirePermission('movimentar'), async (req, res) => {
    try {
      res.status(201).json(await toolService.emprestarFerramenta(db, req.user, req.params.id, req.body));
    } catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/emprestimos', auth, async (req, res) => {
    try { res.json(await toolService.listarEmprestimos(db, req.query)); }
    catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/emprestimos/:id/devolver', auth, requirePermission('movimentar'), async (req, res) => {
    try { res.json(await toolService.devolverFerramenta(db, req.user, req.params.id)); }
    catch (e) { handleError(res, e); }
  });

  // ── Materiais do cliente ──
  app.get('/api/almoxarifado/materiais-cliente', auth, async (req, res) => {
    try { res.json(await clientMaterialService.listarMateriaisCliente(db, req.query)); }
    catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/materiais-cliente', auth, requirePermission('movimentar'), async (req, res) => {
    try {
      res.status(201).json(await clientMaterialService.registrarMaterialCliente(db, req.user, req.body));
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/materiais-cliente/:id/consumir', auth, requirePermission('movimentar'), async (req, res) => {
    try {
      res.json(await clientMaterialService.consumirMaterialCliente(db, req.user, req.params.id, req.body.quantidade, req.body.observacoes));
    } catch (e) { handleError(res, e); }
  });

  // ── Compras (integração preparada) ──
  app.post('/api/almoxarifado/compras/verificar-minimos', auth, requirePermission('configurar'), async (req, res) => {
    try { res.json({ criadas: await purchaseService.verificarEstoqueMinimo(db) }); }
    catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/compras/solicitacoes/:id/vincular-pedido', auth, requirePermission('configurar'), async (req, res) => {
    try {
      res.json(await purchaseService.vincularPedidoCompra(db, req.params.id, req.body.pedido_compra_id));
    } catch (e) { handleError(res, e); }
  });

  // ── Auditoria ──
  app.get('/api/almoxarifado/auditoria', auth, async (req, res) => {
    try {
      let sql = 'SELECT * FROM auditoria_log_almoxarifado WHERE 1=1';
      const params = [];
      if (req.query.entidade) { sql += ' AND entidade = ?'; params.push(req.query.entidade); }
      if (req.query.entidade_id) { sql += ' AND entidade_id = ?'; params.push(req.query.entidade_id); }
      sql += ' ORDER BY created_at DESC LIMIT 200';
      res.json(await dbAll(db, sql, params));
    } catch (e) { handleError(res, e); }
  });

  // ── Relatórios v2 ──
  const reports = {
    'estoque-atual': reportService.relatorioEstoqueAtual,
    'abaixo-minimo': reportService.relatorioAbaixoMinimo,
    'reservado-os': (db, q) => reportService.relatorioReservadoPorOS(db, q.os_id),
    'consumo-os': (db, q) => reportService.relatorioConsumoPorOS(db, q.os_id, q.data_inicio, q.data_fim),
    'materiais-mais-consumidos': (db, q) => reportService.relatorioMateriaisMaisConsumidos(db, q.data_inicio, q.data_fim),
    'recebimentos-pendentes': reportService.relatorioRecebimentosPendentes,
    'materiais-bloqueados': reportService.relatorioMateriaisBloqueados,
    'historico-movimentacoes': (db, q) => reportService.relatorioHistoricoMovimentacoes(db, q),
    'inventario-divergencias': reportService.relatorioInventarioDivergencias,
    'consumo-periodo': (db, q) => reportService.relatorioConsumoPeriodo(db, q.data_inicio, q.data_fim, q.projeto_id, q.cliente_id),
    'materiais-cliente': (db, q) => clientMaterialService.listarMateriaisCliente(db, q),
    'sobras-disponiveis': (db) => scrapService.listarSobras(db, { disponivel: true }),
    'ferramentas-emprestadas': reportService.relatorioFerramentasEmprestadas,
    'epi-colaborador': reportService.relatorioEPIPorColaborador,
    'solicitacoes-compra': reportService.relatorioSolicitacoesCompraPendentes,
  };

  app.get('/api/almoxarifado/relatorios/:tipo', auth, async (req, res) => {
    try {
      const fn = reports[req.params.tipo];
      if (!fn) return res.status(404).json({ error: 'Relatório não encontrado' });
      res.json(await fn(db, req.query));
    } catch (e) { handleError(res, e); }
  });

  // ── Setores requisitantes e materiais permitidos ──
  app.get('/api/almoxarifado/setores-requisicao', auth, async (req, res) => {
    try {
      await sectorMaterialService.ensureSetoresRequisicao(db);
      res.json(await sectorMaterialService.listSetores(db));
    } catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/setores-requisicao/:id/permissoes', auth, async (req, res) => {
    try {
      res.json(await sectorMaterialService.getPermissoesSetor(db, req.params.id));
    } catch (e) { handleError(res, e); }
  });

  app.put('/api/almoxarifado/setores-requisicao/:id/permissoes', auth, async (req, res) => {
    if (!isSystemAdmin(req.user) && !canConfigureAlmox(req.user)) {
      return res.status(403).json({ error: 'Acesso restrito — administrador do Almoxarifado ou Super Administrador' });
    }
    const { permissoes } = req.body;
    if (!Array.isArray(permissoes)) return res.status(400).json({ error: 'Envie um array de permissões' });
    try {
      const rows = await sectorMaterialService.salvarPermissoesSetor(db, req.params.id, permissoes);
      res.json(rows);
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/setores-requisicao/:id/permissoes/bulk-tipo', auth, async (req, res) => {
    if (!isSystemAdmin(req.user) && !canConfigureAlmox(req.user)) {
      return res.status(403).json({ error: 'Acesso restrito — administrador do Almoxarifado ou Super Administrador' });
    }
    const { tipo_uso } = req.body;
    if (!['administrativo', 'industrial'].includes(tipo_uso)) {
      return res.status(400).json({ error: 'tipo_uso deve ser administrativo ou industrial' });
    }
    try {
      await sectorMaterialService.ensureSetoresRequisicao(db);
      const rows = await sectorMaterialService.bulkAssignFamiliasPorTipo(db, req.params.id, tipo_uso);
      res.json(rows);
    } catch (e) { handleError(res, e); }
  });

  console.log('✅ Rotas estendidas almoxarifado v3 registradas');
};
