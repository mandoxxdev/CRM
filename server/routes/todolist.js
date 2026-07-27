/**
 * Módulo TODOLIST — GMP Industriais
 * API: /api/todolist/*
 */

const { initSchema } = require('../services/todolist/schema');
const todolistService = require('../services/todolist/todolistService');
const { respondDbError } = require('../services/sqliteConcurrency');

function handleError(res, err) {
  if (err?.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  return respondDbError(res, err, 'todolist');
}

async function runInitSchemaWithRetry(db, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await initSchema(db);
      return;
    } catch (e) {
      lastErr = e;
      console.error(`Erro schema todolist (tentativa ${attempt}/${retries}):`, e.message);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
  }
  throw lastErr || new Error('Falha ao inicializar schema todolist');
}

module.exports = function registerTodolistRoutes(app, db, authenticateToken, checkModulePermission) {
  if (!db) return;

  let schemaReady = null;
  const startSchemaInit = () => {
    if (!schemaReady) {
      schemaReady = runInitSchemaWithRetry(db).catch((e) => {
        console.error('Falha definitiva schema todolist:', e.message);
        throw e;
      });
    }
    return schemaReady;
  };

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
  const mod = checkModulePermission('todolist');
  const guard = [auth, mod, ensureSchema];

  app.get('/api/todolist/board', ...guard, async (req, res) => {
    try {
      res.json(await todolistService.getBoard(db, { busca: req.query.busca || req.query.q }));
    } catch (e) {
      handleError(res, e);
    }
  });

  app.get('/api/todolist/usuarios', ...guard, async (req, res) => {
    try {
      res.json(await todolistService.listUsuariosAtivos(db));
    } catch (e) {
      handleError(res, e);
    }
  });

  app.get('/api/todolist/tarefas/:id', ...guard, async (req, res) => {
    try {
      const row = await todolistService.getTarefaById(db, req.params.id);
      if (!row) return res.status(404).json({ error: 'Tarefa não encontrada' });
      res.json(row);
    } catch (e) {
      handleError(res, e);
    }
  });

  app.post('/api/todolist/tarefas', ...guard, async (req, res) => {
    try {
      const row = await todolistService.createTarefa(db, req.user, req.body);
      res.status(201).json(row);
    } catch (e) {
      handleError(res, e);
    }
  });

  app.put('/api/todolist/tarefas/:id', ...guard, async (req, res) => {
    try {
      res.json(await todolistService.updateTarefa(db, req.params.id, req.body));
    } catch (e) {
      handleError(res, e);
    }
  });

  app.put('/api/todolist/tarefas/:id/mover', ...guard, async (req, res) => {
    try {
      res.json(await todolistService.moveTarefa(db, req.params.id, req.body));
    } catch (e) {
      handleError(res, e);
    }
  });

  app.delete('/api/todolist/tarefas/:id', ...guard, async (req, res) => {
    try {
      res.json(await todolistService.deleteTarefa(db, req.params.id));
    } catch (e) {
      handleError(res, e);
    }
  });
};
