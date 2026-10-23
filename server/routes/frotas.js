/**
 * Módulo Frotas — GMP Industriais
 * API: /api/frotas/*
 */

const { initSchema } = require('../services/frotas/schema');
const frotasService = require('../services/frotas/frotasService');
const portalService = require('../services/frotas/portalService');
const exportacaoService = require('../services/frotas/exportacaoService');
const perfisService = require('../services/frotas/perfisService');
const { requirePermission } = require('../services/frotas/permissions');
const { respondDbError } = require('../services/sqliteConcurrency');

const DASHBOARD_CACHE_MS = parseInt(process.env.FROTAS_DASHBOARD_CACHE_MS || '30000', 10);
let dashboardCache = { at: 0, data: null };
let dashboardInflight = null;

function handleError(res, err) {
  if (err?.status && err.status >= 400 && err.status < 500) {
    // Frotas Etapa 1: `code` quando o contrato manda (ex.: MOTORISTA_NAO_VINCULADO)
    return res.status(err.status).json(err.code ? { error: err.message, code: err.code } : { error: err.message });
  }
  return respondDbError(res, err, 'frotas');
}

async function runInitSchemaWithRetry(db, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await initSchema(db);
      return;
    } catch (e) {
      lastErr = e;
      console.error(`Erro schema frotas (tentativa ${attempt}/${retries}):`, e.message);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
  }
  throw lastErr || new Error('Falha ao inicializar schema frotas');
}

module.exports = function registerFrotasRoutes(app, db, authenticateToken, checkModulePermission) {
  if (!db) return;

  let schemaReady = null;
  const startSchemaInit = () => {
    if (!schemaReady) {
      schemaReady = runInitSchemaWithRetry(db).catch((e) => {
        console.error('Falha definitiva schema frotas:', e.message);
        throw e;
      });
    }
    return schemaReady;
  };

  // Aguarda fila de CREATE TABLE principal antes do DDL do módulo (evita race no SQLite).
  db.run('SELECT 1', [], () => {
    startSchemaInit();
  });

  const ensureSchema = async (req, res, next) => {
    try {
      await startSchemaInit();
      next();
    } catch (e) {
      handleError(res, e);
    }
  };

  const auth = authenticateToken;
  const mod = checkModulePermission('frota');
  const frotaAuth = [auth, mod, ensureSchema];

  const crudRoutes = (base, listFn, createFn, updateFn, deleteFn, opts = {}) => {
    app.get(`/api/frotas/${base}`, ...frotaAuth, async (req, res) => {
      try { res.json(await listFn(db, req.query, req.user)); } catch (e) { handleError(res, e); }
    });
    if (opts.getOne) {
      app.get(`/api/frotas/${base}/:id`, ...frotaAuth, async (req, res) => {
        try {
          const row = await opts.getOne(db, req.params.id, req.user);
          if (!row) return res.status(404).json({ error: 'Não encontrado' });
          res.json(row);
        } catch (e) { handleError(res, e); }
      });
    }
    if (createFn) {
      const perm = opts.createPerm || 'registrar_operacoes';
      app.post(`/api/frotas/${base}`, ...frotaAuth, requirePermission(perm), async (req, res) => {
        try {
          const row = await createFn(db, req.user, req.body);
          res.status(201).json(row);
        } catch (e) { handleError(res, e); }
      });
    }
    if (updateFn) {
      const perm = opts.updatePerm || 'registrar_operacoes';
      app.put(`/api/frotas/${base}/:id`, ...frotaAuth, requirePermission(perm), async (req, res) => {
        try { res.json(await updateFn(db, req.params.id, req.body, req.user)); } catch (e) { handleError(res, e); }
      });
    }
    if (deleteFn) {
      const perm = opts.deletePerm || 'gerenciar_veiculos';
      app.delete(`/api/frotas/${base}/:id`, ...frotaAuth, requirePermission(perm), async (req, res) => {
        try { res.json(await deleteFn(db, req.params.id)); } catch (e) { handleError(res, e); }
      });
    }
  };

  // ── Meta / Dashboard ───────────────────────────────────────────────────────
  app.get('/api/frotas/meta', ...frotaAuth, async (req, res) => {
    try { res.json(await frotasService.getMeta(db)); } catch (e) { handleError(res, e); }
  });

  // Frotas Etapa 1 (RN-F1.16, F2-13): ver_painel ANTES do cache — o cache e um so para todos os perfis
  app.get('/api/frotas/dashboard', ...frotaAuth, requirePermission('ver_painel'), async (req, res) => {
    try {
      const force = req.query.refresh === '1' || req.query.refresh === 'true';
      if (!force && dashboardCache.data && Date.now() - dashboardCache.at < DASHBOARD_CACHE_MS) {
        return res.json(dashboardCache.data);
      }
      if (!force && dashboardInflight) {
        const data = await dashboardInflight;
        return res.json(data);
      }
      dashboardInflight = frotasService.getDashboard(db)
        .then((data) => {
          dashboardCache = { at: Date.now(), data };
          dashboardInflight = null;
          return data;
        })
        .catch((e) => {
          dashboardInflight = null;
          throw e;
        });
      res.json(await dashboardInflight);
    } catch (e) { handleError(res, e); }
  });

  app.get('/api/frotas/alertas', ...frotaAuth, requirePermission('ver_painel'), async (req, res) => {
    try { res.json(await frotasService.getAlertas(db)); } catch (e) { handleError(res, e); }
  });

  app.get('/api/frotas/relatorios/custos-por-veiculo', ...frotaAuth, requirePermission('relatorios'), async (req, res) => {
    try { res.json(await frotasService.relatorioCustosPorVeiculo(db, req.query)); } catch (e) { handleError(res, e); }
  });

  app.get('/api/frotas/relatorios/consumo', ...frotaAuth, requirePermission('relatorios'), async (req, res) => {
    try { res.json(await frotasService.relatorioConsumo(db, req.query)); } catch (e) { handleError(res, e); }
  });

  // ── Portal do motorista (Frotas Etapa 1) ───────────────────────────────────
  // Contratos congelados: docs/superpowers/plans/2026-10-23-frotas-etapa1-portal-do-motorista.md
  app.get('/api/frotas/portal/inicio', ...frotaAuth, async (req, res) => {
    try { res.json(await portalService.inicio(db, req.user)); } catch (e) { handleError(res, e); }
  });

  app.post('/api/frotas/portal/registros', ...frotaAuth, requirePermission('registrar_operacoes'), async (req, res) => {
    try { res.status(201).json(await portalService.registrar(db, req.user, req.body)); } catch (e) { handleError(res, e); }
  });

  app.post('/api/frotas/portal/abastecimentos', ...frotaAuth, requirePermission('registrar_operacoes'), async (req, res) => {
    try { res.status(201).json(await portalService.registrarAbastecimento(db, req.user, req.body)); } catch (e) { handleError(res, e); }
  });

  app.get('/api/frotas/portal/meus-registros', ...frotaAuth, async (req, res) => {
    try { res.json(await portalService.meusRegistros(db, req.user, req.query)); } catch (e) { handleError(res, e); }
  });

  // Frotas Etapa 1 (F2-5): seletor do vinculo usuario <-> motorista (todos os usuarios ativos, sem filtro de setor)
  app.get('/api/frotas/usuarios-vinculaveis', ...frotaAuth, requirePermission('gerenciar_motoristas'), async (req, res) => {
    try { res.json(await frotasService.listUsuariosVinculaveis(db)); } catch (e) { handleError(res, e); }
  });

  // Frotas Etapa 2 (RN-F2.01..05): o perfil Consulta/Motorista pela tela — so o ADMIN_FROTA (configurar)
  app.get('/api/frotas/perfis-usuario', ...frotaAuth, requirePermission('configurar'), async (req, res) => {
    try { res.json(await perfisService.listarPerfis(db)); } catch (e) { handleError(res, e); }
  });
  app.put('/api/frotas/perfis-usuario/:usuarioId', ...frotaAuth, requirePermission('configurar'), async (req, res) => {
    try { res.json(await perfisService.definirPerfil(db, req.params.usuarioId, req.body, req.user)); } catch (e) { handleError(res, e); }
  });

  // Frotas Etapa 1 (RN-F1.18): tudo no formato da planilha Controle de Frota GMP
  app.get('/api/frotas/exportar.xlsx', ...frotaAuth, requirePermission('relatorios'), async (req, res) => {
    try {
      const { buffer, nomeArquivo } = await exportacaoService.exportarPlanilha(db, {
        data_inicio: req.query.data_inicio || null, data_fim: req.query.data_fim || null,
      });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
      res.send(buffer);
    } catch (e) { handleError(res, e); }
  });

  // ── CRUD entidades ─────────────────────────────────────────────────────────
  crudRoutes('veiculos',
    frotasService.listVeiculos,
    frotasService.createVeiculo,
    frotasService.updateVeiculo,
    frotasService.deleteVeiculo,
    { getOne: frotasService.getVeiculo, createPerm: 'gerenciar_veiculos', updatePerm: 'gerenciar_veiculos', deletePerm: 'gerenciar_veiculos' }
  );

  crudRoutes('motoristas',
    frotasService.listMotoristas,
    frotasService.createMotorista,
    frotasService.updateMotorista,
    frotasService.deleteMotorista,
    { getOne: frotasService.getMotorista, createPerm: 'gerenciar_motoristas', updatePerm: 'gerenciar_motoristas', deletePerm: 'gerenciar_motoristas' }
  );

  crudRoutes('manutencoes',
    frotasService.listManutencoes,
    frotasService.createManutencao,
    frotasService.updateManutencao,
    frotasService.deleteManutencao,
    { deletePerm: 'gerenciar_veiculos' }
  );

  crudRoutes('abastecimentos',
    frotasService.listAbastecimentos,
    frotasService.createAbastecimento,
    frotasService.updateAbastecimento,
    frotasService.deleteAbastecimento,
    { deletePerm: 'gerenciar_veiculos' }
  );

  // Frotas Etapa 1 (RN-F1.16, B6): multa e documento sao do gestor — o motorista nao lanca
  crudRoutes('multas',
    frotasService.listMultas,
    frotasService.createMulta,
    frotasService.updateMulta,
    frotasService.deleteMulta,
    { createPerm: 'gerenciar_veiculos', updatePerm: 'gerenciar_veiculos', deletePerm: 'gerenciar_veiculos' }
  );

  crudRoutes('documentos',
    frotasService.listDocumentos,
    frotasService.createDocumento,
    frotasService.updateDocumento,
    frotasService.deleteDocumento,
    { createPerm: 'gerenciar_veiculos', updatePerm: 'gerenciar_veiculos', deletePerm: 'gerenciar_veiculos' }
  );

  crudRoutes('viagens',
    frotasService.listViagens,
    frotasService.createViagem,
    frotasService.updateViagem,
    frotasService.deleteViagem,
    { deletePerm: 'gerenciar_veiculos' }
  );

  app.post('/api/frotas/viagens/:id/aprovar', ...frotaAuth, requirePermission('aprovar_viagens'), async (req, res) => {
    try { res.json(await frotasService.aprovarViagem(db, req.params.id, req.user)); } catch (e) { handleError(res, e); }
  });

  crudRoutes('checklists',
    frotasService.listChecklists,
    frotasService.createChecklist,
    null,
    frotasService.deleteChecklist,
    { deletePerm: 'gerenciar_veiculos' }
  );

  console.log('✅ Rotas Frotas registradas em /api/frotas/*');
};

/** Frotas Etapa 1 (F2-13): zera o cache do painel — o harness de teste chama ao criar cada app (o cache e do modulo, nao do app). */
function limparCacheDashboard() {
  dashboardCache = { at: 0, data: null };
  dashboardInflight = null;
}
module.exports.limparCacheDashboard = limparCacheDashboard;
