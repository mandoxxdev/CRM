/**
 * Módulo Frotas — GMP Industriais
 * API: /api/frotas/*
 */

const { initSchema } = require('../services/frotas/schema');
const frotasService = require('../services/frotas/frotasService');
const { requirePermission } = require('../services/frotas/permissions');
const { respondDbError } = require('../services/sqliteConcurrency');

const DASHBOARD_CACHE_MS = parseInt(process.env.FROTAS_DASHBOARD_CACHE_MS || '30000', 10);
let dashboardCache = { at: 0, data: null };
let dashboardInflight = null;

function handleError(res, err) {
  if (err?.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
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
      try { res.json(await listFn(db, req.query)); } catch (e) { handleError(res, e); }
    });
    if (opts.getOne) {
      app.get(`/api/frotas/${base}/:id`, ...frotaAuth, async (req, res) => {
        try {
          const row = await opts.getOne(db, req.params.id);
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
        try { res.json(await updateFn(db, req.params.id, req.body)); } catch (e) { handleError(res, e); }
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

  app.get('/api/frotas/dashboard', ...frotaAuth, async (req, res) => {
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

  app.get('/api/frotas/alertas', ...frotaAuth, async (req, res) => {
    try { res.json(await frotasService.getAlertas(db)); } catch (e) { handleError(res, e); }
  });

  app.get('/api/frotas/relatorios/custos-por-veiculo', ...frotaAuth, requirePermission('relatorios'), async (req, res) => {
    try { res.json(await frotasService.relatorioCustosPorVeiculo(db, req.query)); } catch (e) { handleError(res, e); }
  });

  app.get('/api/frotas/relatorios/consumo', ...frotaAuth, requirePermission('relatorios'), async (req, res) => {
    try { res.json(await frotasService.relatorioConsumo(db, req.query)); } catch (e) { handleError(res, e); }
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

  crudRoutes('multas',
    frotasService.listMultas,
    frotasService.createMulta,
    frotasService.updateMulta,
    frotasService.deleteMulta,
    { deletePerm: 'gerenciar_veiculos' }
  );

  crudRoutes('documentos',
    frotasService.listDocumentos,
    frotasService.createDocumento,
    frotasService.updateDocumento,
    frotasService.deleteDocumento,
    { deletePerm: 'gerenciar_veiculos' }
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
