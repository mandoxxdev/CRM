/**
 * Extended API routes for almoxarifado v3
 */
const { canConfigureAlmox, isSystemAdmin } = require('../../services/systemPermissions');
const { initSchema, TIPOS_MATERIAL_ENUM, TIPOS_LOCALIZACAO, SETORES_REQUISICAO } = require('../../services/almoxarifado/schema');
const { requirePermission } = require('../../services/almoxarifado/permissions');
const { dbAll, dbGet, dbRun } = require('../../services/almoxarifado/db');
const { validate } = require('../../services/almoxarifado/validation');
const { CentroCustoSchema, MovimentacaoSchema, RegularizacaoSchema, CancelamentoSchema } = require('../../services/almoxarifado/schemas');
const { registrarAuditoria } = require('../../services/almoxarifado/audit');
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

  app.get('/api/almoxarifado/centros-custo', auth, async (req, res) => {
    try {
      const where = req.query.todos === '1' ? '1=1' : 'ativo = 1';
      res.json(await dbAll(db, `SELECT * FROM centros_custo_almoxarifado WHERE ${where} ORDER BY codigo`));
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/centros-custo', auth, requirePermission('configurar'), validate(CentroCustoSchema), async (req, res) => {
    try {
      const { codigo, nome } = req.body;
      const r = await dbRun(db, 'INSERT INTO centros_custo_almoxarifado (codigo, nome) VALUES (?,?)', [codigo.trim(), nome.trim()]);
      res.status(201).json({ id: r.lastID, codigo, nome, ativo: 1 });
    } catch (e) {
      if (/UNIQUE constraint/i.test(e.message)) return res.status(409).json({ error: 'Código de centro de custo já existe' });
      handleError(res, e);
    }
  });

  app.put('/api/almoxarifado/centros-custo/:id', auth, requirePermission('configurar'), validate(CentroCustoSchema.partial()), async (req, res) => {
    try {
      const atual = await dbGet(db, 'SELECT * FROM centros_custo_almoxarifado WHERE id = ?', [req.params.id]);
      if (!atual) return res.status(404).json({ error: 'Centro de custo não encontrado' });
      const { codigo = atual.codigo, nome = atual.nome, ativo = atual.ativo } = req.body;
      await dbRun(db, 'UPDATE centros_custo_almoxarifado SET codigo=?, nome=?, ativo=? WHERE id=?', [codigo, nome, ativo, req.params.id]);
      res.json({ id: Number(req.params.id), codigo, nome, ativo });
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

  app.post('/api/almoxarifado/movimentacoes/v2', auth, requirePermission('movimentar'), validate(MovimentacaoSchema), async (req, res) => {
    try {
      const result = await stockService.registrarMovimentacao(db, req.user, req.body);
      res.status(201).json(result);
    } catch (e) { handleError(res, e); }
  });

  app.put('/api/almoxarifado/movimentacoes/:id/regularizar', auth, requirePermission('movimentar'), validate(RegularizacaoSchema), async (req, res) => {
    try {
      const mov = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [req.params.id]);
      if (!mov) return res.status(404).json({ error: 'Movimentação não encontrada' });
      // Defesa em profundidade (achado do review final): cancelarMovimentacao já zera
      // regularizacao_pendente no claim do estorno, então este caminho normalmente nem seria
      // alcançado — mas um cancelamento não pode virar regularizável por nenhuma outra via.
      if (mov.cancelado) return res.status(400).json({ error: 'Movimentação cancelada não pode ser regularizada' });
      if (!mov.regularizacao_pendente) return res.status(400).json({ error: 'Movimentação não está pendente de regularização' });
      const { os_id = mov.os_id, projeto_id = mov.projeto_id, centro_custo_id = mov.centro_custo_id } = req.body;
      await dbRun(db, `UPDATE movimentacoes_almoxarifado SET os_id=?, projeto_id=?, centro_custo_id=?, regularizacao_pendente=0 WHERE id=?`,
        [os_id || null, projeto_id || null, centro_custo_id || null, req.params.id]);
      await registrarAuditoria(db, {
        entidade: 'movimentacao', entidade_id: mov.id, acao: 'REGULARIZACAO',
        usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
        dados_novos: { os_id, projeto_id, centro_custo_id },
      });
      res.json({ success: true });
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/movimentacoes/:id/cancelar', auth, requirePermission('ajustar_estoque'), validate(CancelamentoSchema), async (req, res) => {
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

  // ── Extrato do item ──
  app.get('/api/almoxarifado/materiais/:id/extrato', auth, async (req, res) => {
    try {
      const material = await dbGet(db, `SELECT m.*,
        (m.quantidade_atual - COALESCE(m.quantidade_reservada,0) - COALESCE(m.quantidade_bloqueada,0) - COALESCE(m.quantidade_em_inspecao,0)) as quantidade_disponivel
        FROM materiais_almoxarifado m WHERE m.id = ?`, [req.params.id]);
      if (!material) return res.status(404).json({ error: 'Material não encontrado' });
      const [saldos, movimentacoes, reservas] = await Promise.all([
        stockService.consultarSaldosPorLocalizacao(db, req.params.id),
        dbAll(db, `SELECT m.*, cc.codigo as centro_custo_codigo FROM movimentacoes_almoxarifado m
          LEFT JOIN centros_custo_almoxarifado cc ON m.centro_custo_id = cc.id
          WHERE m.material_id = ? ORDER BY m.id DESC LIMIT 100`, [req.params.id]),
        dbAll(db, `SELECT * FROM reservas_material_almoxarifado WHERE material_id = ? AND status = 'ATIVA' ORDER BY created_at DESC`, [req.params.id]),
      ]);
      res.json({ material, saldos_localizacao: saldos, movimentacoes, reservas });
    } catch (e) { handleError(res, e); }
  });

  // ── Aux: ordens de serviço (padrão recebimentos-aux, sem gate do módulo operacional) ──
  app.get('/api/almoxarifado/aux/ordens-servico', auth, async (req, res) => {
    try {
      const rows = await dbAll(db, `SELECT os.id, os.numero_os, os.status, c.razao_social as cliente_nome
        FROM ordens_servico os LEFT JOIN clientes c ON os.cliente_id = c.id
        ORDER BY os.id DESC LIMIT 300`);
      return res.json(rows);
    } catch (e) {
      // Ambiente parcial: tabela clientes pode não existir mesmo com ordens_servico presente
      // (clientes é tabela core, fora do initSchema do almoxarifado). Tenta sem o JOIN antes de desistir.
      if (/no such table:\s*clientes/i.test(e.message)) {
        try {
          const rows = await dbAll(db, `SELECT os.id, os.numero_os, os.status, NULL as cliente_nome
            FROM ordens_servico os ORDER BY os.id DESC LIMIT 300`);
          return res.json(rows);
        } catch (e2) { return res.json([]); }
      }
      return res.json([]); // tabela ordens_servico pode não existir em ambiente parcial
    }
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
