/**
 * Módulo Produção — GMP Industriais
 * API: /api/producao/*
 */

const { initSchema } = require('../services/producao/schema');
const producaoService = require('../services/producao/producaoService');
const { requirePermission } = require('../services/producao/permissions');
const { respondDbError } = require('../services/sqliteConcurrency');

const DASHBOARD_CACHE_MS = parseInt(process.env.PRODUCAO_DASHBOARD_CACHE_MS || '30000', 10);
let dashboardCache = { at: 0, data: null };
let dashboardInflight = null;

function handleError(res, err) {
  if (err?.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  return respondDbError(res, err, 'producao');
}

async function runInitSchemaWithRetry(db, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await initSchema(db);
      return;
    } catch (e) {
      lastErr = e;
      console.error(`Erro schema producao (tentativa ${attempt}/${retries}):`, e.message);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
  }
  throw lastErr || new Error('Falha ao inicializar schema producao');
}

module.exports = function registerProducaoRoutes(app, db, authenticateToken, checkModulePermission) {
  if (!db) return;

  let schemaReady = null;
  const startSchemaInit = () => {
    if (!schemaReady) {
      schemaReady = runInitSchemaWithRetry(db).catch((e) => {
        console.error('Falha definitiva schema producao:', e.message);
        throw e;
      });
    }
    return schemaReady;
  };

  db.run('SELECT 1', [], () => { startSchemaInit(); });

  const ensureSchema = async (req, res, next) => {
    try {
      await startSchemaInit();
      next();
    } catch (e) {
      handleError(res, e);
    }
  };

  const auth = authenticateToken;
  const mod = checkModulePermission('operacional');
  const prodAuth = [auth, mod, ensureSchema];

  const crudRoutes = (base, listFn, createFn, updateFn, deleteFn, opts = {}) => {
    app.get(`/api/producao/${base}`, ...prodAuth, async (req, res) => {
      try { res.json(await listFn(db, req.query)); } catch (e) { handleError(res, e); }
    });
    if (opts.getOne) {
      app.get(`/api/producao/${base}/:id`, ...prodAuth, async (req, res) => {
        try {
          const row = await opts.getOne(db, req.params.id);
          if (!row) return res.status(404).json({ error: 'Não encontrado' });
          res.json(row);
        } catch (e) { handleError(res, e); }
      });
    }
    if (createFn) {
      const perm = opts.createPerm || 'gerenciar_ops';
      app.post(`/api/producao/${base}`, ...prodAuth, requirePermission(perm), async (req, res) => {
        try {
          const row = await createFn(db, req.user, req.body);
          res.status(201).json(row);
        } catch (e) { handleError(res, e); }
      });
    }
    if (updateFn) {
      const perm = opts.updatePerm || 'gerenciar_ops';
      app.put(`/api/producao/${base}/:id`, ...prodAuth, requirePermission(perm), async (req, res) => {
        try { res.json(await updateFn(db, req.params.id, req.body, req.user)); } catch (e) { handleError(res, e); }
      });
    }
    if (deleteFn) {
      const perm = opts.deletePerm || 'gerenciar_ops';
      app.delete(`/api/producao/${base}/:id`, ...prodAuth, requirePermission(perm), async (req, res) => {
        try { res.json(await deleteFn(db, req.params.id)); } catch (e) { handleError(res, e); }
      });
    }
  };

  // Meta / Dashboard
  app.get('/api/producao/meta', ...prodAuth, async (req, res) => {
    try { res.json(await producaoService.getMeta(db)); } catch (e) { handleError(res, e); }
  });

  app.get('/api/producao/dashboard', ...prodAuth, async (req, res) => {
    try {
      const force = req.query.refresh === '1' || req.query.refresh === 'true';
      if (!force && dashboardCache.data && Date.now() - dashboardCache.at < DASHBOARD_CACHE_MS) {
        return res.json(dashboardCache.data);
      }
      if (!force && dashboardInflight) {
        return res.json(await dashboardInflight);
      }
      dashboardInflight = producaoService.getDashboard(db)
        .then((data) => {
          dashboardCache = { at: Date.now(), data };
          dashboardInflight = null;
          return data;
        })
        .catch((e) => { dashboardInflight = null; throw e; });
      res.json(await dashboardInflight);
    } catch (e) { handleError(res, e); }
  });

  app.get('/api/producao/ops/proximo-numero', ...prodAuth, async (req, res) => {
    try { res.json({ numero_op: await producaoService.gerarNumeroOp(db) }); } catch (e) { handleError(res, e); }
  });

  app.post('/api/producao/ops/:id/status', ...prodAuth, requirePermission('gerenciar_ops'), async (req, res) => {
    try {
      const { status } = req.body;
      res.json(await producaoService.changeOpStatus(db, req.params.id, status, req.user));
    } catch (e) { handleError(res, e); }
  });

  // Apontamentos
  app.get('/api/producao/apontamentos', ...prodAuth, async (req, res) => {
    try { res.json(await producaoService.listApontamentos(db, req.query)); } catch (e) { handleError(res, e); }
  });

  app.post('/api/producao/apontamentos/iniciar', ...prodAuth, requirePermission('apontar'), async (req, res) => {
    try {
      res.status(201).json(await producaoService.iniciarApontamento(db, req.user, req.body));
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/producao/apontamentos/:id/finalizar', ...prodAuth, requirePermission('apontar'), async (req, res) => {
    try {
      res.json(await producaoService.finalizarApontamento(db, req.params.id, req.user, req.body));
    } catch (e) { handleError(res, e); }
  });

  // Paradas
  app.get('/api/producao/paradas', ...prodAuth, async (req, res) => {
    try { res.json(await producaoService.listParadas(db, req.query)); } catch (e) { handleError(res, e); }
  });

  app.post('/api/producao/paradas/iniciar', ...prodAuth, requirePermission('registrar_paradas'), async (req, res) => {
    try {
      res.status(201).json(await producaoService.iniciarParada(db, req.user, req.body));
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/producao/paradas/:id/finalizar', ...prodAuth, requirePermission('registrar_paradas'), async (req, res) => {
    try {
      res.json(await producaoService.finalizarParada(db, req.params.id, req.user, req.body));
    } catch (e) { handleError(res, e); }
  });

  // Relatórios
  app.get('/api/producao/relatorios/producao', ...prodAuth, requirePermission('relatorios'), async (req, res) => {
    try { res.json(await producaoService.relatorioProducaoPeriodo(db, req.query)); } catch (e) { handleError(res, e); }
  });

  app.get('/api/producao/relatorios/eficiencia', ...prodAuth, requirePermission('relatorios'), async (req, res) => {
    try { res.json(await producaoService.relatorioEficiencia(db, req.query)); } catch (e) { handleError(res, e); }
  });

  app.get('/api/producao/relatorios/paradas', ...prodAuth, requirePermission('relatorios'), async (req, res) => {
    try { res.json(await producaoService.relatorioParadas(db, req.query)); } catch (e) { handleError(res, e); }
  });

  // CRUD
  crudRoutes('maquinas',
    producaoService.listMaquinas,
    producaoService.createMaquina,
    producaoService.updateMaquina,
    producaoService.deleteMaquina,
    { getOne: producaoService.getMaquina, createPerm: 'gerenciar_maquinas', updatePerm: 'gerenciar_maquinas', deletePerm: 'gerenciar_maquinas' }
  );

  crudRoutes('ops',
    producaoService.listOps,
    producaoService.createOp,
    producaoService.updateOp,
    producaoService.deleteOp,
    { getOne: producaoService.getOp, createPerm: 'gerenciar_ops', updatePerm: 'gerenciar_ops', deletePerm: 'gerenciar_ops' }
  );

  crudRoutes('roteiros',
    producaoService.listRoteiros,
    producaoService.createRoteiro,
    producaoService.updateRoteiro,
    producaoService.deleteRoteiro,
    { getOne: producaoService.getRoteiro, createPerm: 'gerenciar_roteiros', updatePerm: 'gerenciar_roteiros', deletePerm: 'gerenciar_roteiros' }
  );

  crudRoutes('motivos-parada',
    producaoService.listMotivosParada,
    producaoService.createMotivoParada,
    producaoService.updateMotivoParada,
    producaoService.deleteMotivoParada,
    { createPerm: 'configurar', updatePerm: 'configurar', deletePerm: 'configurar' }
  );

  console.log('✅ Rotas Produção registradas em /api/producao/*');
};
