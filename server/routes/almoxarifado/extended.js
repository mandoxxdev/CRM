/**
 * Extended API routes for almoxarifado v3
 */
const { canConfigureAlmox, isSystemAdmin } = require('../../services/systemPermissions');
const { initSchema, TIPOS_MATERIAL_ENUM, TIPOS_LOCALIZACAO, SETORES_REQUISICAO } = require('../../services/almoxarifado/schema');
const { requirePermission, can, getPerfilFromUser, ACAO_PERFIS, PERFIS } = require('../../services/almoxarifado/permissions');
const { dbAll, dbGet, dbRun } = require('../../services/almoxarifado/db');
const { validate } = require('../../services/almoxarifado/validation');
const { CentroCustoSchema, AlmoxarifadoSchema, MovimentacaoSchema, RegularizacaoSchema, CancelamentoSchema } = require('../../services/almoxarifado/schemas');
const { registrarAuditoria } = require('../../services/almoxarifado/audit');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');
const seriesService = require('../../services/almoxarifado/seriesService');
const reservationService = require('../../services/almoxarifado/reservationService');
const receiptService = require('../../services/almoxarifado/receiptService');
const inspectionService = require('../../services/almoxarifado/inspectionService');
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

  // ── O que EU posso fazer neste módulo ──
  // Existe para a interface poder barrar a ação ANTES de o usuário preencher um formulário
  // inteiro e só então tomar 403 no save.
  //
  // Devolve a resposta JÁ RESOLVIDA (booleano por ação), não a tabela ACAO_PERFIS. De
  // propósito: se o front recebesse o mapa e reimplementasse a decisão, passariam a existir
  // duas fontes de verdade — o fallback de getPerfilFromUser, a precedência de
  // superadmin/admin de módulo e a lista de cada ação teriam de ser mantidos iguais nos dois
  // lados, e divergiriam na primeira mudança. Aqui quem decide é o mesmo `can()` que os
  // middlewares usam.
  //
  // Sem requirePermission: qualquer usuário do módulo pode perguntar o que ele mesmo pode.
  app.get('/api/almoxarifado/minhas-permissoes', auth, (req, res) => {
    const acoes = {};
    for (const acao of Object.keys(ACAO_PERFIS)) {
      acoes[acao] = can(req.user, acao);
    }
    res.json({ perfil: getPerfilFromUser(req.user), acoes });
  });

  // ── Perfis de acesso ao módulo (atribuição por usuário) ──
  //
  // Até aqui o único jeito de dar perfil era o checkbox "Administrador do módulo" no
  // cadastro de usuário, que concede ADMINISTRADOR e nada mais. Os outros cinco perfis
  // (ALMOXARIFE, GESTOR, COMPRAS, ENGENHARIA, CONSULTA) só entravam por SQL, e quem não
  // era admin caía calado no fallback PRODUCAO de getPerfilFromUser.
  //
  // PRECEDENCIA (a razão de `origem` existir na resposta): getPerfilFromUser resolve nesta
  // ordem — superadmin, admin do módulo, role 'admin', perfil explícito, fallback PRODUCAO.
  // Então para quem é superadmin/admin/admin-de-módulo o perfil explícito é IGNORADO em
  // runtime, e ainda seria sobrescrito por syncModuleAdminProfiles no próximo save do
  // usuário. A UI precisa saber disso para não oferecer um select que não tem efeito.
  const PERFIS_VALIDOS = Object.values(PERFIS);

  function classificarPerfil(u, perfilExplicito) {
    let mods = [];
    try { mods = JSON.parse(u.admin_modulos || '[]'); } catch { mods = []; }
    const forcado = !!u.is_superadmin
      || mods.includes('almoxarifado')
      || String(u.role || '').toLowerCase() === 'admin';
    if (forcado) return { efetivo: PERFIS.ADMINISTRADOR, origem: 'forcado' };
    if (perfilExplicito) return { efetivo: perfilExplicito, origem: 'explicito' };
    return { efetivo: PERFIS.PRODUCAO, origem: 'padrao' };
  }

  app.get('/api/almoxarifado/perfis-usuario', auth, requirePermission('configurar'), async (req, res) => {
    try {
      const rows = await dbAll(db, `
        SELECT u.id, u.nome, u.email, u.role, u.is_superadmin, u.admin_modulos, u.ativo,
               p.perfil as perfil_explicito
        FROM usuarios u
        LEFT JOIN perfil_almoxarifado_usuario p ON p.usuario_id = u.id
        WHERE u.ativo = 1 AND COALESCE(u.is_oculto, 0) = 0
        ORDER BY u.nome`);
      res.json({
        perfis: PERFIS_VALIDOS,
        usuarios: rows.map((u) => {
          const { efetivo, origem } = classificarPerfil(u, u.perfil_explicito);
          return {
            id: u.id,
            nome: u.nome,
            email: u.email,
            perfil_explicito: u.perfil_explicito || null,
            perfil_efetivo: efetivo,
            origem,
          };
        }),
      });
    } catch (e) { handleError(res, e); }
  });

  app.put('/api/almoxarifado/perfis-usuario/:usuarioId', auth, requirePermission('configurar'), async (req, res) => {
    try {
      const { perfil } = req.body;
      const usuario = await dbGet(db,
        'SELECT id, nome, role, is_superadmin, admin_modulos FROM usuarios WHERE id = ? AND ativo = 1',
        [req.params.usuarioId]);
      if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado' });

      const { origem } = classificarPerfil(usuario, null);
      if (origem === 'forcado') {
        // Recusa em vez de gravar: a linha seria ignorada por getPerfilFromUser e apagada
        // no próximo save do usuário. Gravar daria a impressão de ter funcionado.
        return res.status(409).json({
          error: 'Este usuário já é administrador (superadmin, admin de sistema ou admin do módulo) '
            + 'e tem acesso total ao almoxarifado. Remova essa condição no cadastro de usuário antes '
            + 'de definir um perfil específico.',
          origem,
        });
      }

      // perfil vazio/null = voltar ao padrão (sem linha → fallback PRODUCAO)
      if (perfil === null || perfil === undefined || perfil === '') {
        await dbRun(db, 'DELETE FROM perfil_almoxarifado_usuario WHERE usuario_id = ?', [usuario.id]);
        return res.json({ usuario_id: usuario.id, perfil_explicito: null, perfil_efetivo: PERFIS.PRODUCAO, origem: 'padrao' });
      }

      if (!PERFIS_VALIDOS.includes(perfil)) {
        return res.status(400).json({ error: `Perfil inválido. Use um de: ${PERFIS_VALIDOS.join(', ')}` });
      }

      await dbRun(db, `
        INSERT INTO perfil_almoxarifado_usuario (usuario_id, perfil, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(usuario_id) DO UPDATE SET perfil = excluded.perfil, updated_at = CURRENT_TIMESTAMP`,
        [usuario.id, perfil]);

      await registrarAuditoria(db, {
        entidade: 'perfil_almoxarifado_usuario',
        entidade_id: usuario.id,
        acao: 'ATUALIZAR',
        usuario_id: req.user?.id,
        usuario_nome: req.user?.nome,
        dados_novos: { usuario: usuario.nome, perfil },
      }).catch(() => { /* auditoria não bloqueia a operação */ });

      res.json({ usuario_id: usuario.id, perfil_explicito: perfil, perfil_efetivo: perfil, origem: 'explicito' });
    } catch (e) { handleError(res, e); }
  });

  // ── Almoxarifados (entidade raiz — multi-almoxarifado) ──
  app.get('/api/almoxarifado/almoxarifados', auth, async (req, res) => {
    try {
      const where = req.query.todos === '1' ? '1=1' : 'ativo = 1';
      res.json(await dbAll(db, `SELECT * FROM almoxarifados WHERE ${where} ORDER BY codigo`));
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/almoxarifados', auth, requirePermission('configurar'), validate(AlmoxarifadoSchema), async (req, res) => {
    try {
      const { codigo, nome, descricao } = req.body;
      const r = await dbRun(db, 'INSERT INTO almoxarifados (codigo, nome, descricao) VALUES (?,?,?)',
        [codigo.trim(), nome.trim(), descricao || null]);
      res.status(201).json({ id: r.lastID, codigo, nome, descricao: descricao || null, ativo: 1 });
    } catch (e) {
      if (/UNIQUE constraint/i.test(e.message)) return res.status(409).json({ error: 'Código de almoxarifado já existe' });
      handleError(res, e);
    }
  });

  app.put('/api/almoxarifado/almoxarifados/:id', auth, requirePermission('configurar'), validate(AlmoxarifadoSchema.partial()), async (req, res) => {
    try {
      const atual = await dbGet(db, 'SELECT * FROM almoxarifados WHERE id = ?', [req.params.id]);
      if (!atual) return res.status(404).json({ error: 'Almoxarifado não encontrado' });
      const { codigo = atual.codigo, nome = atual.nome, descricao = atual.descricao, ativo = atual.ativo } = req.body;
      if (Number(ativo) === 0 && Number(atual.ativo) === 1) {
        const localizacoesAtivas = await dbGet(db,
          'SELECT COUNT(*) as c FROM localizacoes_almoxarifado WHERE almoxarifado_id = ? AND ativo = 1', [req.params.id]);
        if (localizacoesAtivas.c > 0) {
          return res.status(400).json({ error: 'Não é possível inativar: existem localizações ativas vinculadas a este almoxarifado' });
        }
      }
      await dbRun(db, 'UPDATE almoxarifados SET codigo=?, nome=?, descricao=?, ativo=? WHERE id=?',
        [codigo, nome, descricao, ativo, req.params.id]);
      res.json({ id: Number(req.params.id), codigo, nome, descricao, ativo });
    } catch (e) {
      if (/UNIQUE constraint/i.test(e.message)) return res.status(409).json({ error: 'Código de almoxarifado já existe' });
      handleError(res, e);
    }
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
      // `exigeLote` no 4o argumento, NAO no body: esta rota repassa `req.body` inteiro, entao
      // qualquer chave lida dele seria forjavel — o cliente desligaria a exigencia de lote
      // mandando `exigeLote: false` no JSON. Esta e a movimentacao manual: o formulario TEM campo
      // de lote (texto livre na entrada, seletor FEFO na saida), logo aqui a exigencia de
      // `controle_lote` faz sentido e vale. Ver a nota da guarda em stockService.
      // `exigeSerie` (Etapa 6b): mesmo raciocinio — o body pode trazer `series`/`serie_ids`
      // (declarados em MovimentacaoSchema), entao a exigencia de `controle_serie` tambem vale
      // aqui, e tambem so no 4o argumento (nunca lida de `exigeSerie` no body).
      const result = await stockService.registrarMovimentacao(db, req.user, req.body, { exigeLote: true, exigeSerie: true });
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
      res.json(await reservationService.listarReservas(db, req.query));
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
      const result = await stockService.liberarReserva(db, req.user, req.params.id, req.body.quantidade, {
        motivo: req.body.motivo || req.body.motivo_liberacao || null,
      });
      res.json(result);
    } catch (e) { handleError(res, e); }
  });

  // Transferência entre projetos/OS — troca de dono, sem tocar em saldo. `reservar_outra_os`
  // (ADMINISTRADOR/GESTOR) e não `reservar`: quem reserva para o próprio setor não redireciona
  // material já separado para outro projeto.
  app.put('/api/almoxarifado/reservas/:id/transferir', auth, requirePermission('reservar_outra_os'), async (req, res) => {
    try {
      res.json(await reservationService.transferirReserva(db, req.user, req.params.id, req.body));
    } catch (e) { handleError(res, e); }
  });

  // Job de expiração (cron externo/admin) — mesmo papel de
  // POST /requisicoes/processar-lembretes, que usa denyUnlessAlmoxAdmin. Aquele helper é local
  // de routes/almoxarifado.js; aqui o equivalente é requirePermission('configurar'), que só
  // libera o perfil ADMINISTRADOR e é o gate usado pelos outros jobs deste arquivo
  // (ex.: compras/verificar-minimos).
  app.post('/api/almoxarifado/reservas/processar-expiracao', auth, requirePermission('configurar'), async (req, res) => {
    try {
      const resultado = await reservationService.processarExpiracao(db, req.user, req.body || {});
      res.json({ success: true, ...resultado });
    } catch (e) { handleError(res, e); }
  });

  // ── Extrato do item ──
  app.get('/api/almoxarifado/materiais/:id/extrato', auth, async (req, res) => {
    try {
      const material = await dbGet(db, `SELECT m.*,
        (m.quantidade_atual - COALESCE(m.quantidade_reservada,0) - COALESCE(m.quantidade_bloqueada,0) - COALESCE(m.quantidade_em_inspecao,0)) as quantidade_disponivel,
        a.codigo as almoxarifado_codigo, a.nome as almoxarifado_nome
        FROM materiais_almoxarifado m
        LEFT JOIN localizacoes_almoxarifado l ON m.localizacao_padrao_id = l.id
        LEFT JOIN almoxarifados a ON l.almoxarifado_id = a.id
        WHERE m.id = ?`, [req.params.id]);
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

  // Etapa 5, Task 4: aponta para inspectionService.decidirInspecao (motor), que substitui
  // receiptService.inspecionarItem (removida — UPDATE direto que dobrava o saldo retido).
  app.post('/api/almoxarifado/recebimentos/itens/:itemId/inspecionar', auth, requirePermission('inspecionar'), async (req, res) => {
    try {
      res.status(201).json(await inspectionService.decidirInspecao(db, req.user, req.params.itemId, req.body));
    } catch (e) { handleError(res, e); }
  });

  // Etapa 5, Task 5: fila de inspecao (por item, nao pelo pool do material — ver
  // inspectionService.listarInspecoesPendentes) e bloqueio/desbloqueio avulso de material,
  // fora do fluxo de recebimento (ex.: avaria em prateleira). ajustar_estoque porque bloquear/
  // desbloquear tira/devolve saldo do disponivel sem passar por requisicao nem recebimento.
  app.get('/api/almoxarifado/inspecoes/pendentes', auth, async (req, res) => {
    try { res.json(await inspectionService.listarInspecoesPendentes(db, req.query)); }
    catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/materiais/:id/bloquear', auth, requirePermission('ajustar_estoque'), async (req, res) => {
    try { res.json(await inspectionService.bloquearMaterial(db, req.user, req.params.id, req.body)); }
    catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/materiais/:id/desbloquear', auth, requirePermission('ajustar_estoque'), async (req, res) => {
    try { res.json(await inspectionService.desbloquearMaterial(db, req.user, req.params.id, req.body)); }
    catch (e) { handleError(res, e); }
  });

  // Task 3b (extra, Etapa 6): liberacao de vencimento para uso — reaproveita o fluxo de
  // bloqueio/desbloqueio acima (mesma permissao `inspecionar`, mesma exigencia de justificativa).
  // NAO "desvence" o lote: lotService.isVencido continua true depois; so registra que alguem
  // assumiu a responsabilidade por usar um lote vencido, com justificativa auditada.
  app.put('/api/almoxarifado/lotes/:id/liberar-vencimento', auth, requirePermission('inspecionar'), async (req, res) => {
    try {
      res.json(await lotService.liberarVencimento(db, req.user, req.params.id, req.body?.justificativa));
    } catch (e) { handleError(res, e); }
  });

  // ── Lotes (Etapa 6, Task 6) ──
  app.get('/api/almoxarifado/materiais/:id/lotes', auth, requirePermission('visualizar'), async (req, res) => {
    try {
      const lotes = await lotService.listarLotesDoMaterial(db, Number(req.params.id), {
        apenasComSaldo: req.query.com_saldo === '1',
      });
      res.json(lotes);
    } catch (e) { handleError(res, e); }
  });

  app.put('/api/almoxarifado/lotes/:id/status', auth, requirePermission('inspecionar'), async (req, res) => {
    try {
      const { status, justificativa } = req.body || {};
      const lote = await lotService.mudarStatusLote(db, req.user, Number(req.params.id), status, justificativa);
      res.json(lote);
    } catch (e) { handleError(res, e); }
  });

  // ── Series (Etapa 6b, Task 7) ──
  app.get('/api/almoxarifado/materiais/:id/series', auth, requirePermission('visualizar'), async (req, res) => {
    try {
      const series = await seriesService.listarSeriesDoMaterial(db, req.params.id, { status: req.query.status });
      res.json(series);
    } catch (e) { handleError(res, e); }
  });

  app.put('/api/almoxarifado/series/:id/status', auth, requirePermission('inspecionar'), async (req, res) => {
    try {
      const { status, justificativa } = req.body || {};
      const serie = await seriesService.mudarStatusSerie(db, req.user, req.params.id, status, justificativa);
      res.json(serie);
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

  // ── Localizações vazias (sem estoque) ──
  app.get('/api/almoxarifado/localizacoes/vazias', auth, async (req, res) => {
    try {
      const sql = `
        SELECT l.*, a.codigo as almoxarifado_codigo, p.codigo as parent_codigo
        FROM localizacoes_almoxarifado l
        LEFT JOIN almoxarifados a ON l.almoxarifado_id = a.id
        LEFT JOIN localizacoes_almoxarifado p ON l.parent_id = p.id
        WHERE l.ativo = 1
        AND NOT EXISTS (
          SELECT 1 FROM estoque_saldo_almoxarifado s
          WHERE s.localizacao_id = l.id AND s.quantidade > 0
        )
        ORDER BY l.setor, l.parent_id, l.subgrupo, l.codigo
      `;
      const rows = await dbAll(db, sql);

      // Build endereco_completo for each location
      const enriched = rows.map(row => {
        const parts = [];
        if (row.almoxarifado_codigo) parts.push(row.almoxarifado_codigo);
        if (row.setor) parts.push(row.setor);
        if (row.parent_codigo) parts.push(row.parent_codigo);
        if (row.codigo) parts.push(row.codigo);

        return {
          ...row,
          endereco_completo: parts.join(' / ')
        };
      });

      res.json(enriched);
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
    'materiais-sem-endereco': async (db) => {
      return dbAll(db, `
        SELECT m.* FROM materiais_almoxarifado m
        WHERE m.ativo = 1 AND m.localizacao_padrao_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM estoque_saldo_almoxarifado s
          WHERE s.material_id = m.id AND s.localizacao_id IS NOT NULL AND s.quantidade > 0
        )
        ORDER BY m.codigo
      `);
    },
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
