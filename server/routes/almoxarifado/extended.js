/**
 * Extended API routes for almoxarifado v3
 */
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { canConfigureAlmox, isSystemAdmin } = require('../../services/systemPermissions');
const { initSchema, TIPOS_MATERIAL_ENUM, TIPOS_LOCALIZACAO, SETORES_REQUISICAO } = require('../../services/almoxarifado/schema');
const { requirePermission, can, getPerfilFromUser, ACAO_PERFIS, PERFIS } = require('../../services/almoxarifado/permissions');
const { dbAll, dbGet, dbRun } = require('../../services/almoxarifado/db');
const { disponivelSql } = require('../../services/almoxarifado/availabilitySql');
const { validate, formatZodError } = require('../../services/almoxarifado/validation');
const { CentroCustoSchema, AlmoxarifadoSchema, MovimentacaoSchema, RegularizacaoSchema, CancelamentoSchema, DevolucaoClienteSchema, RemessaTerceiroSchema, RetornoRemessaSchema, TransformacaoRemessaSchema, EncerramentoRemessaSchema, CancelamentoRemessaSchema, SobraUpdateSchema, GerarRetalhoSchema, SucateamentoCreateSchema, SucateamentoDestinoFormSchema, FerramentaCreateSchema, FerramentaUpdateSchema, EmprestimoSchema, DevolucaoEmprestimoSchema, CalibracaoSchema, JustificativaSchema, ManutencaoSchema, ManutencaoConcluirSchema, OcorrenciaSchema } = require('../../services/almoxarifado/schemas');
const { registrarAuditoria } = require('../../services/almoxarifado/audit');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');
const seriesService = require('../../services/almoxarifado/seriesService');
const reservationService = require('../../services/almoxarifado/reservationService');
const receiptService = require('../../services/almoxarifado/receiptService');
const inspectionService = require('../../services/almoxarifado/inspectionService');
const returnService = require('../../services/almoxarifado/returnService');
const scrapService = require('../../services/almoxarifado/scrapService');
const scrapDisposalService = require('../../services/almoxarifado/scrapDisposalService');
const toolService = require('../../services/almoxarifado/toolService');
const reportService = require('../../services/almoxarifado/reportService');
const sectorMaterialService = require('../../services/almoxarifado/sectorMaterialService');
const purchaseService = require('../../services/almoxarifado/purchaseService');
// Etapa 8, Task 8: entra no lugar do clientMaterialService removido na Task 7. Nao e o mesmo
// papel: aquele ERA a ilha (tabela propria, fora do motor); este so LE o que o motor ja gravou.
const clienteEstoqueService = require('../../services/almoxarifado/clienteEstoqueService');
const thirdPartyService = require('../../services/almoxarifado/thirdPartyService');

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

module.exports = function registerExtendedRoutes(app, db, authenticateToken, uploadsAlmoxDir) {
  runInitSchemaWithRetry(db).catch((e) => console.error('Falha definitiva schema almoxarifado v3:', e.message));

  const auth = authenticateToken;

  // ── Upload do comprovante de destino do sucateamento (Etapa 9, Task 7) ───────────────────────
  //
  // Molde: `uploadCertificado` (routes/almoxarifado.js:65-72 — mesmo filtro PDF+imagem, mesmo
  // limite de 10MB). Nao e REUSADO porque nao da para: aquela instancia vive dentro do closure de
  // `module.exports` de almoxarifado.js e nunca foi exportada — a extended e registrada por um
  // require() separado (almoxarifado.js:2390) sem acesso a variaveis daquele closure.
  //
  // A alternativa seria esta rota re-derivar PERSISTENT_DATA_DIR direto de `config/paths.js`, mas
  // isso duplicaria a resolucao de CRM_DATA_DIR (a mesma armadilha que custoSql.js e
  // availabilitySql.js existem para evitar em outras contas) E quebraria o harness de teste: o
  // harness passa um `dataDir` TEMPORARIO como PERSISTENT_DATA_DIR so para almoxarifado.js
  // (tests/helpers/testApp.js), e `config/paths.js` nunca veria esse valor — os arquivos gravados
  // aqui iriam parar no diretorio de producao/dev real enquanto os testes rodam.
  //
  // Por isso `uploadsAlmoxDir` chega como PARAMETRO, ja calculado por quem registra esta rota
  // (almoxarifado.js:46, propagado na chamada de :2390) — mesmo diretorio fisico do
  // `uploadAlmox`/`uploadCertificado`, em producao e no harness, sem reescrever a resolucao.
  const uploadComprovanteSucata = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsAlmoxDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `comprovante-sucata-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (/^(application\/pdf|image\/(jpeg|jpg|png|webp))$/i.test(file.mimetype)) return cb(null, true);
      cb(new Error('Comprovante deve ser PDF ou imagem'));
    },
  });

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
      // `exigeLote` no 4o argumento, NAO no body — mesma razao da rota /movimentacoes/v2: esta
      // rota repassa `req.body` inteiro, entao qualquer chave lida dele seria forjavel pelo
      // cliente. A transferencia TEM onde informar o lote (o formulario de Movimentacoes mostra
      // o seletor de lote quando o tipo e TRANSFERENCIA), logo a exigencia vale aqui — e precisa
      // valer TAMBEM nesta rota, senao ela vira um bypass da guarda da rota v2.
      const result = await stockService.registrarMovimentacao(db, req.user,
        { ...req.body, tipo: 'TRANSFERENCIA' }, { exigeLote: true });
      res.status(201).json(result);
    } catch (e) { handleError(res, e); }
  });

  // ── Devolucao AO CLIENTE (Etapa 8, decisao 9) ────────────────────────────────────────────────
  // NAO CONFUNDIR com POST /api/almoxarifado/devolucoes (Etapa 7, returnService), logo abaixo
  // neste mesmo arquivo: la o material VOLTA para o estoque (entrada, tela /almoxarifado/
  // devolucoes); AQUI ele SAI do predio de volta para quem e dele. Sao movimentos de direcoes
  // OPOSTAS com nomes parecidos — e a confusao mais provavel de quem ler este arquivo depois.
  //
  // Rota DEDICADA, nao a v2 generica, e isso e decisao tomada (ver TIPOS_DEDICADOS em schema.js):
  // o documento de devolucao e obrigatorio (MovimentacaoSchema nao tem como exigi-lo sem exigir
  // de TODOS os tipos) e a operacao so faz sentido para material com proprietario. A v2 tem gate
  // `movimentar`, o mais amplo do modulo — aceitar o tipo la deixaria as duas exigencias
  // decorativas. Mesmo precedente dos TIPOS_RETENCAO, tambem barrados na rota generica porque
  // cada um tem servico dono com gate proprio.
  //
  // A guarda de OS/projeto do dono NAO se aplica: DEVOLUCAO_CLIENTE esta em
  // ownerRules.TIPOS_ISENTOS_DONO (o destino E o proprio proprietario). Nao repetir a checagem
  // aqui — o motor ja a roda, e duas fontes da mesma regra divergem na primeira mudanca.
  app.post('/api/almoxarifado/materiais-cliente/devolucoes', auth, requirePermission('movimentar'),
    validate(DevolucaoClienteSchema), async (req, res) => {
      try {
        const { material_id, quantidade, documento_devolucao, lote_id, serie_ids,
          localizacao_origem_id, observacoes } = req.body;
        const material = await dbGet(db,
          `SELECT m.id, m.codigo, m.nome, m.proprietario_cliente_id, cli.razao_social as proprietario_cliente_nome
             FROM materiais_almoxarifado m
             LEFT JOIN clientes cli ON m.proprietario_cliente_id = cli.id
            WHERE m.id = ?`, [material_id]);
        if (!material) return res.status(404).json({ error: 'Material nao encontrado' });
        if (!material.proprietario_cliente_id) {
          return res.status(400).json({
            error: `O material ${material.codigo} nao pertence a nenhum cliente — nao ha para quem `
              + 'devolver. Para tirar material proprio do estoque use Movimentacoes (saida, sucata '
              + 'ou perda).',
          });
        }
        const resultado = await stockService.registrarMovimentacao(db, req.user, {
          material_id,
          tipo: 'DEVOLUCAO_CLIENTE',
          quantidade,
          motivo: `Devolucao ao cliente ${material.proprietario_cliente_nome}`,
          documento_vinculado: documento_devolucao,
          cliente_id: material.proprietario_cliente_id,
          lote_id: lote_id || null,
          serie_ids: serie_ids || [],
          localizacao_origem_id: localizacao_origem_id || null,
          observacoes: observacoes || null,
        // exigeLote/exigeSerie: esta rota tem como informar os dois (a tela da Task 8 oferece
        // seletor de lote e de serie), entao declara a exigencia igual as rotas v1/v2.
        }, { exigeLote: true, exigeSerie: true });
        res.status(201).json(resultado);
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
        ${disponivelSql('m')} as quantidade_disponivel,
        a.codigo as almoxarifado_codigo, a.nome as almoxarifado_nome,
        cli.razao_social as proprietario_cliente_nome
        FROM materiais_almoxarifado m
        LEFT JOIN localizacoes_almoxarifado l ON m.localizacao_padrao_id = l.id
        LEFT JOIN almoxarifados a ON l.almoxarifado_id = a.id
        LEFT JOIN clientes cli ON m.proprietario_cliente_id = cli.id
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
      const series = await seriesService.listarSeriesDoMaterial(db, Number(req.params.id), { status: req.query.status });
      res.json(series);
    } catch (e) { handleError(res, e); }
  });

  app.put('/api/almoxarifado/series/:id/status', auth, requirePermission('inspecionar'), async (req, res) => {
    try {
      const { status, justificativa } = req.body || {};
      const serie = await seriesService.mudarStatusSerie(db, req.user, Number(req.params.id), status, justificativa);
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

  // Leitura, so `auth` — mesmo gate do GET /devolucoes logo acima: consultar de qual entrega o
  // material saiu nao e agir sobre o estoque. Registrada colada nele para que nenhuma rota
  // `/devolucoes/:id` futura capture este caminho antes (o Express casa na ordem de registro).
  app.get('/api/almoxarifado/devolucoes/saidas-elegiveis', auth, async (req, res) => {
    try {
      const materialId = Number(req.query.material_id);
      if (!materialId) return res.status(400).json({ error: 'material_id é obrigatório' });
      res.json(await returnService.listarSaidasElegiveis(db, materialId));
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/devolucoes', auth, requirePermission('movimentar'), async (req, res) => {
    try {
      res.status(201).json(await returnService.registrarDevolucao(db, req.user, req.body));
    } catch (e) { handleError(res, e); }
  });

  // ── Sobras (Etapa 9, Task 1) ──────────────────────────────────────────────────────────────
  // POST /sobras avulso foi APOSENTADO aqui: zero consumidores no front (grep em client/src) e
  // zero testes cobrindo criacao avulsa. O unico caminho de criacao passa a ser gerarRetalho
  // (Task 3) — deixar o POST avulso vivo recriaria a mesma ilha sem auditoria que esta task
  // fechou em atualizarSobra, so que na ponta de criacao.
  app.get('/api/almoxarifado/sobras', auth, async (req, res) => {
    try { res.json(await scrapService.listarSobras(db, req.query)); }
    catch (e) { handleError(res, e); }
  });

  app.put('/api/almoxarifado/sobras/:id', auth, requirePermission('movimentar'), validate(SobraUpdateSchema), async (req, res) => {
    try { res.json(await scrapService.atualizarSobra(db, req.user, req.params.id, req.body)); }
    catch (e) { handleError(res, e); }
  });

  // POST /sobras/gerar-retalho (Etapa 9, Task 4): o evento composto da Task 3 (SAIDA opcional +
  // ENTRADA_RETALHO + linha de sobra). Registrada com um segmento fixo (`gerar-retalho`), nao
  // `:id` — nao colide com PUT /sobras/:id acima porque e outro METODO (Express casa metodo E
  // path juntos), mas o segmento fixo tambem evita que um `id` literal chamado "gerar-retalho"
  // algum dia faca sentido colidir. `handleError` mapeia o `err.status` que o servico ja seta
  // (400 nas recusas de negocio — material inexistente/inativo, dono diferente, controle_serie,
  // lote faltando, saldo insuficiente) direto para o cliente, com a mensagem intacta.
  app.post('/api/almoxarifado/sobras/gerar-retalho', auth, requirePermission('movimentar'), validate(GerarRetalhoSchema), async (req, res) => {
    try {
      res.status(201).json(await scrapService.gerarRetalho(db, req.user, req.body));
    } catch (e) { handleError(res, e); }
  });

  // GET /materiais/:id/retalhos-disponiveis (Etapa 9, Task 4): so `auth`, sem requirePermission —
  // mesmo padrao de leitura do resto do modulo (GET /sobras, /devolucoes/saidas-elegiveis etc.):
  // o gate de MODULO ja aconteceu na camada de cima, e o perfil CONSULTA existe justamente para
  // poder ver sem poder agir. `:id` aqui e o material de ORIGEM (o que foi retalhado), nao o
  // material-retalho — mesma convencao de `sobras?material_id=`.
  app.get('/api/almoxarifado/materiais/:id/retalhos-disponiveis', auth, async (req, res) => {
    try { res.json(await scrapService.listarRetalhosDisponiveis(db, req.params.id)); }
    catch (e) { handleError(res, e); }
  });

  // ── Sucateamento (Etapa 9, Task 7 — a HTTP do processo entregue pela Task 6) ─────────────────
  //
  // `scrapDisposalService` ja tem TODA a regra de negocio (as tres barreiras da segregacao, a
  // maquina de estados, a compensacao) — ver o cabecalho longo daquele arquivo. As rotas abaixo
  // so traduzem HTTP: gate de rota QUANDO uma unica acao de `requirePermission` descreve o gate
  // certo, e SO `auth` (deixando o servico decidir) quando nao descreve. Os tres casos em que ela
  // NAO descreve estao comentados no lugar, e nao sao esquecimento.

  // POST /sucateamentos — SOLICITAR. `requirePermission('movimentar')` e o gate PREVISTO pelo
  // design (decisao 9): solicitar sucateamento e ato de quem tem o material na mao, e o servico
  // (`scrapDisposalService.solicitar`) de proposito NAO checa permissao nenhuma — a rota e a UNICA
  // barreira de perfil aqui. Consequencia que a Task 7 usa adiante: todo solicitante que passa por
  // esta rota TEM `movimentar` (ADMINISTRADOR ou ALMOXARIFE) — ver o comentario de `/cancelar`.
  app.post('/api/almoxarifado/sucateamentos', auth, requirePermission('movimentar'),
    validate(SucateamentoCreateSchema), async (req, res) => {
      try { res.status(201).json(await scrapDisposalService.solicitar(db, req.user, req.body)); }
      catch (e) { handleError(res, e); }
    });

  // GET /sucateamentos?status=&material_id= — so `auth`, mesmo padrao de leitura do resto do
  // modulo (GET /sobras, GET /remessas-terceiros etc.): CONSULTA ve sem poder agir.
  app.get('/api/almoxarifado/sucateamentos', auth, async (req, res) => {
    try { res.json(await scrapDisposalService.listar(db, req.query)); }
    catch (e) { handleError(res, e); }
  });

  // POST /:id/aprovar-almoxarifado e /:id/aprovar-gestao — as DUAS pernas da dupla aprovacao.
  // `requirePermission` descreve bem o gate aqui porque cada rota e UMA acao so: a perna e
  // propriedade da URL tanto quanto do servico, e `scrapDisposalService.aprovar` REPETE a mesma
  // checagem por dentro (barreira 1 do cabecalho daquele arquivo) porque a acao tambem e
  // propriedade da PERNA — uma rota nova ligada ao gate errado nao herdaria a decisao certa de
  // graca. As barreiras 2 (solicitante) e 3 (identidade entre pernas) NAO cabem em
  // `requirePermission` (que so sabe perfil, nunca quem pediu ou quem ja assinou) — moram so no
  // servico, e sao elas que dao o 403 "voce nao pode assinar a propria solicitacao"/"ja assinou a
  // outra perna" mesmo para quem tem o perfil certo.
  app.post('/api/almoxarifado/sucateamentos/:id/aprovar-almoxarifado', auth,
    requirePermission('aprovar_sucateamento'), async (req, res) => {
      try { res.json(await scrapDisposalService.aprovar(db, req.user, req.params.id, 'almoxarifado')); }
      catch (e) { handleError(res, e); }
    });

  app.post('/api/almoxarifado/sucateamentos/:id/aprovar-gestao', auth,
    requirePermission('aprovar_sucateamento_gestao'), async (req, res) => {
      try { res.json(await scrapDisposalService.aprovar(db, req.user, req.params.id, 'gestao')); }
      catch (e) { handleError(res, e); }
    });

  // Middleware inline: passa quem aprova QUALQUER uma das duas pernas — um OU de duas acoes que
  // `requirePermission` (uma acao so) nao sabe exprimir. Reusado por /rejeitar; `scrapDisposalService`
  // usa o MESMO OU por dentro (`assertAprovaAlgumaPerna`) para /rejeitar e /destino — ver o
  // cabecalho de scrapDisposalService.js.
  function requerAprovarAlgumaPerna(req, res, next) {
    if (can(req.user, 'aprovar_sucateamento') || can(req.user, 'aprovar_sucateamento_gestao')) return next();
    return res.status(403).json({
      error: 'Sem permissão para esta operação — exige poder aprovar alguma das duas pernas do sucateamento',
      acao: 'aprovar_sucateamento ou aprovar_sucateamento_gestao',
      perfil: getPerfilFromUser(req.user),
    });
  }

  // POST /:id/rejeitar — motivo obrigatorio, checado pelo servico (que devolve 400 sem ele).
  app.post('/api/almoxarifado/sucateamentos/:id/rejeitar', auth, requerAprovarAlgumaPerna, async (req, res) => {
    try { res.json(await scrapDisposalService.rejeitar(db, req.user, req.params.id, req.body?.motivo)); }
    catch (e) { handleError(res, e); }
  });

  // POST /:id/cancelar — `requirePermission('movimentar')`, do jeito que o plano original previa.
  //
  // AJUSTE AVALIADO NA TASK 7 e MANTIDO como estava (o plano tinha levantado a duvida: "o
  // solicitante tipico e PRODUCAO, que nao tem `movimentar` — ele nunca conseguiria cancelar o
  // proprio pedido"). Essa duvida partia de uma premissa que NAO e verdade nesta base: o UNICO
  // caminho HTTP para SOLICITAR e `POST /sucateamentos` logo acima, e ELA JA exige `movimentar`.
  // Ou seja, todo solicitante que existe de verdade (via API) tem ADMINISTRADOR ou ALMOXARIFE —
  // PRODUCAO so poderia aparecer como `solicitante_id` chamando `scrapDisposalService.solicitar`
  // DIRETO (fora de rota, como os testes fazem), o que nao acontece na aplicacao real. Trocar o
  // gate para so `auth` (como `/destino`) abriria `/cancelar` para QUALQUER usuario autenticado
  // tentar — o servico ainda recusaria quem nao e o solicitante, mas sem motivo nenhum a mais
  // documentado; manter `requirePermission('movimentar')` app uma barreira redundante que nao
  // bloqueia ninguem legitimo e ainda corta de fora, na porta, quem nunca poderia ser solicitante.
  app.post('/api/almoxarifado/sucateamentos/:id/cancelar', auth, requirePermission('movimentar'),
    async (req, res) => {
      try { res.json(await scrapDisposalService.cancelar(db, req.user, req.params.id)); }
      catch (e) { handleError(res, e); }
    });

  // Apaga um upload que acabou de ficar sem dono — `/destino` e a UNICA rota multipart deste bloco
  // sem `requirePermission` na frente (ver o comentario da rota, abaixo): o multer JA GRAVOU o
  // arquivo em disco antes de sabermos se o pedido vai ser aceito, porque quem decide isso e o
  // SERVICO. Toda saida que nao for 200 (400 do Zod, 403/404/409 do servico) tem de limpar o
  // arquivo — senao ele fica orfao em uploads/almoxarifado, sem nada no banco apontando pra ele.
  // Mesmo ESPIRITO do unlink em routes/almoxarifado.js:536-548 (apagar o certificado anterior ao
  // substituir); aqui nao ha "anterior" para apagar — `registrarDestino` e transicao de UMA VIA SO
  // (a maquina de estados nao volta de VENDIDA/DESCARTADA para APROVADO, entao nao existe re-anexar
  // um comprovante ja aceito) — o arquivo que sobra e sempre de uma tentativa que FALHOU.
  function limparUploadOrfao(req) {
    if (!req.file) return;
    try { fs.unlinkSync(path.join(uploadsAlmoxDir, req.file.filename)); }
    catch (unlinkErr) {
      console.warn('[almoxarifado] Falha ao limpar comprovante de sucata orfao:', unlinkErr.message);
    }
  }

  // POST /:id/destino — SO `auth`, DE PROPOSITO (ajuste do review da Task 6, contrato final do
  // plano). `registrarDestino` e gateado no SERVICO por `assertAprovaAlgumaPerna` — a uniao das
  // DUAS acoes de aprovacao (ADMINISTRADOR, ALMOXARIFE, GESTOR) — e nao pela interseccao que
  // `requirePermission('movimentar')` (ADMINISTRADOR, ALMOXARIFE) daria: essa interseccao excluiria
  // SILENCIOSAMENTE o GESTOR, que e exatamente um dos perfis que o servico autoriza a registrar
  // quanto a sucata rendeu. Como "uma das duas acoes" nao e exprimivel em `requirePermission`
  // (mesmo caso de /rejeitar acima), a rota fica so com `auth` e deixa o servico decidir.
  //
  // NAO usa o middleware `validate()` da casa: aquele middleware responde 400 e ENCERRA a
  // requisicao antes do handler — se o arquivo ja tivesse sido gravado pelo multer (que roda ANTES
  // do validate, porque so ele sabe separar multipart em campos+arquivo), o 400 do Zod deixaria um
  // orfao que o catch do handler jamais veria. Por isso a validacao roda aqui dentro, a mao, com
  // `safeParse` — o MESMO `formatZodError` que `validate()` usa, para a mensagem de erro ficar no
  // padrao da casa.
  app.post('/api/almoxarifado/sucateamentos/:id/destino', auth,
    uploadComprovanteSucata.single('comprovante'), async (req, res) => {
      const parsed = SucateamentoDestinoFormSchema.safeParse(req.body);
      if (!parsed.success) {
        limparUploadOrfao(req);
        return res.status(400).json({ error: `Dados inválidos — ${formatZodError(parsed.error)}` });
      }
      try {
        const payload = { ...parsed.data };
        if (req.file) payload.comprovante_arquivo = req.file.filename;
        res.json(await scrapDisposalService.registrarDestino(db, req.user, req.params.id, payload));
      } catch (e) {
        limparUploadOrfao(req);
        handleError(res, e);
      }
    });

  // ── Ferramentas (Etapa 9b) ──
  // Gate `gerenciar_ferramentas`, nao `movimentar`: ferramenta e PATRIMONIO emprestavel, nao
  // estoque (permissions.js, decisao D1) — acoplar ao gate de mover saldo impediria restringir
  // um sem o outro.
  app.get('/api/almoxarifado/ferramentas', auth, async (req, res) => {
    try { res.json(await toolService.listarFerramentas(db, req.query)); }
    catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/ferramentas', auth, requirePermission('gerenciar_ferramentas'), validate(FerramentaCreateSchema), async (req, res) => {
    try {
      res.status(201).json(await toolService.criarFerramenta(db, req.user, req.body));
    } catch (e) {
      // 409 e nao 400: precedente do modulo para UNIQUE e centro de custo (linha ~121 acima).
      if (/UNIQUE constraint/i.test(e.message)) return res.status(409).json({ error: 'Código de patrimônio já cadastrado' });
      handleError(res, e);
    }
  });

  app.put('/api/almoxarifado/ferramentas/:id', auth, requirePermission('gerenciar_ferramentas'), validate(FerramentaUpdateSchema), async (req, res) => {
    try {
      res.json(await toolService.atualizarFerramenta(db, req.user, req.params.id, req.body));
    } catch (e) {
      if (/UNIQUE constraint/i.test(e.message)) return res.status(409).json({ error: 'Código de patrimônio já cadastrado' });
      handleError(res, e);
    }
  });

  app.post('/api/almoxarifado/ferramentas/:id/emprestar', auth, requirePermission('gerenciar_ferramentas'), validate(EmprestimoSchema), async (req, res) => {
    try {
      res.status(201).json(await toolService.emprestarFerramenta(db, req.user, req.params.id, req.body));
    } catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/emprestimos', auth, async (req, res) => {
    try { res.json(await toolService.listarEmprestimos(db, req.query)); }
    catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/emprestimos/:id/devolver', auth, requirePermission('gerenciar_ferramentas'), validate(DevolucaoEmprestimoSchema), async (req, res) => {
    try { res.json(await toolService.devolverFerramenta(db, req.user, req.params.id, req.body)); }
    catch (e) { handleError(res, e); }
  });

  // Upload do certificado de calibracao (Task 3) — CLONE de uploadComprovanteSucata (linha ~74),
  // gravacao FLAT em uploadsAlmoxDir com prefixo `calibracao-` no filename, SEM subpasta: o multer
  // nao cria diretorio e ninguem mkdir'a subpastas aqui — o primeiro upload numa subpasta daria
  // ENOENT -> 500 (design D3, brief da Task 3).
  const uploadCertificadoCalibracao = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsAlmoxDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `calibracao-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (/^(application\/pdf|image\/(jpeg|jpg|png|webp))$/i.test(file.mimetype)) return cb(null, true);
      cb(new Error('Certificado deve ser PDF ou imagem'));
    },
  });

  // POST /ferramentas/:id/calibracoes — multipart, campo de arquivo `certificado` opcional.
  // Ordem de middlewares OBRIGATORIA: auth -> requirePermission -> multer -> safeParse manual do
  // schema (design D3). NAO copiar a ordem da rota de destino do sucateamento (linha ~845): aquela
  // rota nao tem requirePermission DE PROPOSITO (o gate dela mora no servico, "uma das duas
  // pernas", nao exprimivel em requirePermission). Aqui o gate E uma acao so, entao vai na PORTA —
  // precedente provado por permissoesRotas.api.test.js:515-534 (POST /materiais/:id/foto): o 403
  // sai ANTES do multer gravar nada em disco. Do sucateamento aproveita-se so o
  // `limparUploadOrfao` (linha ~823) para o 400 pos-upload (validacao ou regra de negocio).
  app.post('/api/almoxarifado/ferramentas/:id/calibracoes', auth, requirePermission('gerenciar_ferramentas'),
    uploadCertificadoCalibracao.single('certificado'), async (req, res) => {
      const parsed = CalibracaoSchema.safeParse(req.body);
      if (!parsed.success) {
        limparUploadOrfao(req);
        return res.status(400).json({ error: `Dados inválidos — ${formatZodError(parsed.error)}` });
      }
      try {
        const certificadoPath = req.file ? req.file.filename : null;
        res.status(201).json(await toolService.registrarCalibracao(db, req.user, req.params.id, parsed.data, certificadoPath));
      } catch (e) {
        limparUploadOrfao(req);
        handleError(res, e);
      }
    });

  app.get('/api/almoxarifado/ferramentas/:id/calibracoes', auth, async (req, res) => {
    try { res.json(await toolService.listarCalibracoes(db, req.params.id)); }
    catch (e) { handleError(res, e); }
  });

  // GET /calibracoes/painel — ANTES de /ferramentas/:id se algum dia esta rota ganhar irma sob
  // /ferramentas; hoje o caminho e distinto (/calibracoes/painel) e nao colide com nenhum :id.
  app.get('/api/almoxarifado/calibracoes/painel', auth, async (req, res) => {
    try {
      const dias = req.query.dias !== undefined ? Number(req.query.dias) : 30;
      res.json(await toolService.painelCalibracoes(db, Number.isFinite(dias) ? dias : 30));
    } catch (e) { handleError(res, e); }
  });

  // ── Bloqueio, manutencao e reencontro (Etapa 9b, Task 4) — RN-06/RN-07/RN-10 ──
  // Mesmo gate `gerenciar_ferramentas`, mesmo padrao de claim por UPDATE-com-WHERE do servico.
  app.post('/api/almoxarifado/ferramentas/:id/bloquear', auth, requirePermission('gerenciar_ferramentas'), validate(JustificativaSchema), async (req, res) => {
    try { res.json(await toolService.bloquearFerramenta(db, req.user, req.params.id, req.body)); }
    catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/ferramentas/:id/desbloquear', auth, requirePermission('gerenciar_ferramentas'), validate(JustificativaSchema), async (req, res) => {
    try { res.json(await toolService.desbloquearFerramenta(db, req.user, req.params.id, req.body)); }
    catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/ferramentas/:id/manutencoes', auth, requirePermission('gerenciar_ferramentas'), validate(ManutencaoSchema), async (req, res) => {
    try { res.status(201).json(await toolService.iniciarManutencao(db, req.user, req.params.id, req.body)); }
    catch (e) { handleError(res, e); }
  });

  app.put('/api/almoxarifado/manutencoes/:id/concluir', auth, requirePermission('gerenciar_ferramentas'), validate(ManutencaoConcluirSchema), async (req, res) => {
    try { res.json(await toolService.concluirManutencao(db, req.user, req.params.id, req.body)); }
    catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/ferramentas/:id/manutencoes', auth, async (req, res) => {
    try { res.json(await toolService.listarManutencoes(db, req.params.id)); }
    catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/ferramentas/:id/reencontrar', auth, requirePermission('gerenciar_ferramentas'), validate(JustificativaSchema), async (req, res) => {
    try { res.json(await toolService.reencontrarFerramenta(db, req.user, req.params.id, req.body)); }
    catch (e) { handleError(res, e); }
  });

  // Upload da foto de ocorrencia (Etapa 9b, Task 5) — CLONE de uploadCertificadoCalibracao
  // (linha ~910): gravacao FLAT em uploadsAlmoxDir com prefixo `ocorrencia-` no filename, SEM
  // subpasta (mesma razao D3: o multer nao cria diretorio e ninguem mkdir'a subpastas aqui).
  const uploadFotoOcorrencia = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsAlmoxDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `ocorrencia-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (/^(application\/pdf|image\/(jpeg|jpg|png|webp))$/i.test(file.mimetype)) return cb(null, true);
      cb(new Error('Foto deve ser PDF ou imagem'));
    },
  });

  // POST /ferramentas/:id/ocorrencias — multipart, campo de arquivo `foto` opcional. Ordem de
  // middlewares OBRIGATORIA: auth -> requirePermission -> multer -> safeParse manual (D3, mesmo
  // desenho de /calibracoes acima) — o gate e uma acao so, entao vai na PORTA, antes do multer
  // gravar qualquer coisa em disco (precedente permissoesRotas.api.test.js:515-534). A checagem
  // `AVARIA|PERDA` NAO esta no Zod (`OcorrenciaSchema` so valida forma) — o throw 400 com a
  // mensagem literal do contrato vem do SERVICO (`toolService.registrarOcorrencia`) e cai no
  // catch abaixo, que tambem limpa o upload orfao.
  app.post('/api/almoxarifado/ferramentas/:id/ocorrencias', auth, requirePermission('gerenciar_ferramentas'),
    uploadFotoOcorrencia.single('foto'), async (req, res) => {
      const parsed = OcorrenciaSchema.safeParse(req.body);
      if (!parsed.success) {
        limparUploadOrfao(req);
        return res.status(400).json({ error: `Dados inválidos — ${formatZodError(parsed.error)}` });
      }
      try {
        const fotoPath = req.file ? req.file.filename : null;
        res.status(201).json(await toolService.registrarOcorrencia(db, req.user, req.params.id, parsed.data, fotoPath));
      } catch (e) {
        limparUploadOrfao(req);
        handleError(res, e);
      }
    });

  app.get('/api/almoxarifado/ferramentas/:id/ocorrencias', auth, async (req, res) => {
    try { res.json(await toolService.listarOcorrencias(db, req.params.id)); }
    catch (e) { handleError(res, e); }
  });

  // ── Materiais de cliente: a ILHA foi aposentada na Etapa 8 (decisao 4) ───────────────────────
  // Existiam aqui GET/POST /materiais-cliente e POST /materiais-cliente/:id/consumir, sobre
  // materiais_cliente_almoxarifado — tabela separada, com descricao em texto livre, sem FK para
  // materiais_almoxarifado e FORA do motor de estoque: sem lote, serie, endereco, extrato,
  // etiqueta, livro de movimentacoes, requisicao nem reserva. consumirMaterialCliente nao validava
  // cliente nem projeto, entao o primeiro item do checklist da spec 13 nao existia em forma
  // nenhuma. Material de cliente agora e material normal com dono
  // (materiais_almoxarifado.proprietario_cliente_id) e passa pelas mesmas guardas de todo o resto.
  // As rotas sairam porque, vivas, seriam um caminho paralelo que ESCAPA dessas guardas.
  // A TABELA continua no schema.js, marcada como aposentada: a medicao de 0 linhas cobriu so o
  // banco de desenvolvimento. Ver a Task 7 do plano da Etapa 8.
  //
  // O que ficou no lugar: POST /materiais-cliente/devolucoes (Task 6, mais acima neste arquivo),
  // GET /almoxarifado/estoque?proprietario_cliente_id=N (Task 1) e as duas rotas de LEITURA
  // abaixo, que alimentam a tela /almoxarifado/materiais-cliente (Task 8).
  //
  // Sao GETs sem `requirePermission`, como todas as leituras deste arquivo: o gate de leitura do
  // modulo e o `auth` + checkModulePermission da camada de cima, e o perfil CONSULTA existe
  // justamente para poder ver sem poder agir. Quem AGE sobre esta tela passa pelo POST de
  // devolucao, que tem o gate `movimentar`.
  app.get('/api/almoxarifado/materiais-cliente/clientes', auth, async (req, res) => {
    try { res.json(await clienteEstoqueService.listarClientesComMaterial(db)); }
    catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/materiais-cliente/posicao', auth, async (req, res) => {
    try { res.json(await clienteEstoqueService.posicaoPorCliente(db, req.query)); }
    catch (e) { handleError(res, e); }
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

  // ── Reposição (Etapa 11) — RN-01..RN-08 do design. Gate proprio: decidir compra e
  // gestao/compras (ALMOXARIFE fora de proposito, D9).
  app.get('/api/almoxarifado/reposicao/sugestoes', auth, requirePermission('gerenciar_reposicao'), async (req, res) => {
    try { res.json(await purchaseService.calcularSugestoes(db)); }
    catch (e) { handleError(res, e); }
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
    // Etapa 8, Task 7 -> Task 8: a chave apontava para clientMaterialService (a ilha aposentada)
    // e saiu com ele; o dispatcher respondeu 404 enquanto a posicao por cliente nao teve servico
    // proprio. Agora ela volta apontando para o clienteEstoqueService, que le o LIVRO em vez da
    // tabela sem escritor. Passa a EXIGIR cliente_id (400 sem ele): posicao "de todos os clientes
    // de uma vez" nao e relatorio, e lista — e para isso existe /materiais-cliente/clientes.
    'materiais-cliente': (db, q) => clienteEstoqueService.posicaoPorCliente(db, q),
    'sobras-disponiveis': (db) => scrapService.listarSobras(db, { disponivel: true }),
    'ferramentas-emprestadas': reportService.relatorioFerramentasEmprestadas,
    'epi-colaborador': reportService.relatorioEPIPorColaborador,
    'solicitacoes-compra': reportService.relatorioSolicitacoesCompraPendentes,
    // Etapa 9, Task 7: le o LIVRO (movimentacoes tipo SUCATA), nao so `sucateamentos_almoxarifado`
    // — a devolucao-destino-sucata (Etapa 7) tambem emite SUCATA e nao passa pelo processo de
    // dupla aprovacao. Ver o cabecalho de relatorioSucataFinanceiro em reportService.js.
    'sucata-financeiro': (db, q) => reportService.relatorioSucataFinanceiro(db, { de: q.de, ate: q.ate }),
    'materiais-sem-endereco': async (db) => {
      // Etapa 8, Task 1, classe C da auditoria: NAO filtra o dono de proposito. Enderecar
      // material do cliente e tao necessario quanto enderecar o nosso — a chapa dele precisa
      // de prateleira de verdade. Filtrar aqui esconderia trabalho real do almoxarife.
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
      // Revisao final da Etapa 10b (Important): este relatorio expunha quantidade_sistema/
      // divergencia/contado_por de conferencia ABERTA para qualquer usuario do modulo —
      // desfazia o modo cego e a dupla contagem por fora (o GET /conferencias/:id esconde, o
      // relatorio entregava). Mesmo gate do relatorio de acuracidade; o filtro de status
      // CONCLUIDO esta na query do reportService.
      if (req.params.tipo === 'inventario-divergencias' && !can(req.user, 'inventario')) {
        return res.status(403).json({ error: 'Sem permissão para este relatório', acao: 'inventario' });
      }
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

  // ── Remessas para terceiros (Etapa 8b, Task 8) ────────────────────────────────────────────
  //
  // Leitura só exige `auth` (quem consulta precisa ver onde está o material); toda AÇÃO exige
  // `remessar_terceiro`. A ação é mais estreita que `movimentar` de propósito (decisão 6 do
  // design): o material SAI DO SITE, risco diferente de mover prateleira. Hoje os dois gates têm
  // os mesmos perfis — o ganho é poder restringir depois sem reescrever nada. É por isso que o
  // teste do 403 assere o CAMPO `acao` da resposta e não só o status: trocar um gate pelo outro
  // hoje não mudaria status nenhum, e a regressão passaria despercebida.
  //
  // Nenhuma rota abaixo tem `try/catch` próprio com mensagem inventada: todas caem em
  // `handleError`, que respeita `err.status` e devolve `err.message` INTACTA. As mensagens deste
  // serviço dizem os números (quanto há, quanto foi pedido, quanto sobrou) e um catch genérico as
  // apagaria — foi a lição das Etapas 6 e 7.

  // ATENÇÃO À ORDEM: /vencidas ANTES de /:id. Registrada depois, o Express casaria "vencidas"
  // como :id e a rota do cron devolveria 404 sem nenhum erro que denunciasse a causa.
  //
  // Por que ROTA e não scheduler in-process: o único precedente do módulo é
  // `POST /almoxarifado/reservas/processar-expiracao` (reservationService.processarExpiracao), e a
  // decisão registrada lá vale aqui — o projeto não tem scheduler e introduzir um é decisão de
  // infraestrutura. A varredura é chamada por cron externo. `referencia` existe para o cron ser
  // testável sem viajar no tempo, e o filtro sai do MESMO SQL do `vencidas=1` da listagem: duas
  // contas dariam uma tela que discorda do alerta.
  //
  // A 8b NÃO dispara e-mail nem alerta de atraso (decisão 10 do design): isso é das features 19 e
  // 20. O que ela entrega é o prazo gravado, esta leitura e o destaque na tela.
  app.get('/api/almoxarifado/remessas-terceiros/vencidas', auth, async (req, res) => {
    try {
      const remessas = await thirdPartyService.listarRemessas(db, {
        vencidas: '1', referencia: req.query.referencia || null,
      });
      res.json({ total: remessas.length, referencia: req.query.referencia || null, remessas });
    } catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/remessas-terceiros', auth, async (req, res) => {
    try {
      res.json(await thirdPartyService.listarRemessas(db, req.query || {}));
    } catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/remessas-terceiros/:id', auth, async (req, res) => {
    try {
      const r = await thirdPartyService.getRemessa(db, req.params.id);
      // getRemessa devolve null (não lança) quando não acha — o 404 é montado aqui.
      if (!r) return res.status(404).json({ error: 'Remessa nao encontrada' });
      res.json(r);
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/remessas-terceiros', auth, requirePermission('remessar_terceiro'),
    validate(RemessaTerceiroSchema), async (req, res) => {
      try {
        res.status(201).json(await thirdPartyService.criarRemessa(db, req.user, req.body));
      } catch (e) { handleError(res, e); }
    });

  app.post('/api/almoxarifado/remessas-terceiros/:id/enviar', auth, requirePermission('remessar_terceiro'),
    async (req, res) => {
      try {
        res.json(await thirdPartyService.enviarRemessa(db, req.user, req.params.id));
      } catch (e) { handleError(res, e); }
    });

  app.post('/api/almoxarifado/remessas-terceiros/:id/retornos', auth, requirePermission('remessar_terceiro'),
    validate(RetornoRemessaSchema), async (req, res) => {
      try {
        res.json(await thirdPartyService.registrarRetorno(db, req.user, req.params.id, req.body));
      } catch (e) { handleError(res, e); }
    });

  // Etapa 8c: a transformacao (corte, dobra, usinagem) — sai UMA chapa, voltam N pecas e uma sobra.
  //
  // Rota IRMA de /retornos e nao um modo dele: os corpos sao diferentes (aqui ha
  // `quantidade_consumida` + `resultados[]`, la ha `quantidade`), o efeito de estoque e de natureza
  // oposta (aqui a chapa DEIXA DE EXISTIR e materiais novos ENTRAM; la nada entra e nada sai do
  // patrimonio) e a compensacao na falha e diferente. Um modo obrigaria o schema a aceitar os dois
  // formatos e o servico a decidir qual e qual por presenca de campo — a classe de bug que a
  // Etapa 8 gastou uma etapa desfazendo.
  //
  // Fica sob /:id/, como /retornos: nao compete com /vencidas (que tem de continuar registrada
  // ANTES de /:id, ver o comentario la em cima).
  //
  // Sem try/catch com mensagem propria: cai em handleError, que respeita err.status e devolve
  // err.message INTACTA. As mensagens deste servico dizem os numeros e os codigos de proposito.
  app.post('/api/almoxarifado/remessas-terceiros/:id/transformacoes', auth, requirePermission('remessar_terceiro'),
    validate(TransformacaoRemessaSchema), async (req, res) => {
      try {
        res.json(await thirdPartyService.registrarTransformacao(db, req.user, req.params.id, req.body));
      } catch (e) { handleError(res, e); }
    });

  app.put('/api/almoxarifado/remessas-terceiros/:id/encerrar', auth, requirePermission('remessar_terceiro'),
    validate(EncerramentoRemessaSchema), async (req, res) => {
      try {
        res.json(await thirdPartyService.encerrarRemessa(db, req.user, req.params.id, req.body));
      } catch (e) { handleError(res, e); }
    });

  app.put('/api/almoxarifado/remessas-terceiros/:id/cancelar', auth, requirePermission('remessar_terceiro'),
    validate(CancelamentoRemessaSchema), async (req, res) => {
      try {
        res.json(await thirdPartyService.cancelarRemessa(db, req.user, req.params.id, req.body));
      } catch (e) { handleError(res, e); }
    });

  console.log('✅ Rotas estendidas almoxarifado v3 registradas');
};
