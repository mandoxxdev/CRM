/**
 * Módulo Frotas — GMP Industriais
 * API: /api/frotas/*
 */

const { initSchema } = require('../services/frotas/schema');
const frotasService = require('../services/frotas/frotasService');
const portalService = require('../services/frotas/portalService');
const exportacaoService = require('../services/frotas/exportacaoService');
const perfisService = require('../services/frotas/perfisService');
const pendenciaService = require('../services/frotas/pendenciaService'); // Frota Etapa 6 (RN-F6.02/03)
const { requirePermission } = require('../services/frotas/permissions');
const { respondDbError } = require('../services/sqliteConcurrency');
// Frota Etapa 5 (RN-F5.01..08): fotos do registro e do abastecimento — o mesmo upload seguro do resto do sistema
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const anexosService = require('../services/frotas/anexosService');
const { criarAssinadorUpload, extensaoSegura, cabecalhosUploadSeguro } = require('../services/almoxarifado/urlUpload');
const { PASTAS } = require('../services/uploadsAssinadosCrm');
const {
  multerComLimiteNoErro, erroFormatoImagem, tratarErroFormatoImagem, tratarArquivoGrandeDemais,
} = require('../services/imagemUpload');
const multer = multerComLimiteNoErro(require('multer'));

const DASHBOARD_CACHE_MS = parseInt(process.env.FROTAS_DASHBOARD_CACHE_MS || '30000', 10);
let dashboardCache = { at: 0, data: null };
let dashboardInflight = null;
// Frota Etapa 6 (Fase 2, T-1): a geracao do cache. Limpar a incrementa; a contagem do painel que ja estava em andamento quando alguem
// tratou a pendencia so grava no cache se a geracao ainda for a dela — sem isso, ela gravava o painel velho DEPOIS da limpeza.
let dashboardGeracao = 0;

function handleError(res, err) {
  if (err?.status && err.status >= 400 && err.status < 500) {
    // Frotas Etapa 1: `code` quando o contrato manda (ex.: MOTORISTA_NAO_VINCULADO).
    // Frota Etapa 8 (ajuste T-1): `err.extra` (objeto) e espalhado no corpo — o 409 DESTINO_DUPLICADO leva a linha existente
    // (`destino`) para a tela selecionar o que ja havia; antes so `error` e `code` passavam e o resto caia no chao.
    const extra = err.extra && typeof err.extra === 'object' ? err.extra : {};
    return res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}), ...extra });
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

module.exports = function registerFrotasRoutes(app, db, authenticateToken, checkModulePermission, opcoes = {}) {
  // Frota Etapa 5: a pasta das fotos e o segredo das URLs vem de quem monta (index.js: PERSISTENT_DATA_DIR e o JWT_SECRET; o harness:
  // pasta temporaria). Sem eles o modulo NAO sobe — subir sem foto em silencio esconderia a fiacao esquecida.
  const { dataDir, segredoUpload } = opcoes || {};
  if (!dataDir) throw new Error('registerFrotasRoutes: opcoes.dataDir obrigatorio (pasta das fotos)');
  if (!segredoUpload) throw new Error('registerFrotasRoutes: opcoes.segredoUpload obrigatorio (URL assinada das fotos)');
  if (!db) return;
  const pastaAnexos = path.join(dataDir, 'uploads', 'frotas-anexos');
  fs.mkdirSync(pastaAnexos, { recursive: true }); // o multer nao cria a pasta (ENOENT -> 500 no primeiro envio)
  const assinador = criarAssinadorUpload(segredoUpload, PASTAS.frotasAnexos);
  const assinar = (arquivo) => assinador.assinar(path.basename(String(arquivo || '')));

  // RN-F5.02: nome aleatorio, extensao do MIME aceito (nunca do nome que o cliente mandou), 10 MB, um arquivo so no campo `foto`.
  const uploadFoto = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, pastaAnexos),
      filename: (req, file, cb) => cb(null, `frota-${crypto.randomBytes(12).toString('hex')}${extensaoSegura(file.mimetype)}`),
    }),
    limits: { fileSize: anexosService.LIMITE_BYTES, files: 1, fields: 10, fieldSize: 1024 },
    fileFilter: (req, file, cb) => {
      if (anexosService.MIMES_ACEITOS.includes(String(file.mimetype || '').toLowerCase())) return cb(null, true);
      return cb(erroFormatoImagem());
    },
  });
  /**
   * O multer com as recusas do contrato. Formato e tamanho pelos handlers de sempre (`tratarErroFormatoImagem` -> 400,
   * `tratarArquivoGrandeDemais` -> 413 "Arquivo grande demais (máximo 10 MB)"), chamados AQUI e nao pelo `/api` do index.js: o
   * harness do Frota nao monta aqueles handlers, e a resposta tem de ser a mesma nos dois. O multer ja apaga o que gravou quando erra.
   */
  const receberFoto = (req, res, next) => uploadFoto.single('foto')(req, res, (err) => {
    if (!err) return next();
    return tratarErroFormatoImagem(err, req, res, (e1) => tratarArquivoGrandeDemais(e1, req, res, (e2) => {
      if (e2 && (e2.code === 'LIMIT_UNEXPECTED_FILE' || e2.code === 'LIMIT_FILE_COUNT')) {
        return res.status(400).json({ error: anexosService.MSG.UMA_POR_VEZ });
      }
      console.warn('[frotas] envio de foto recusado:', e2 && (e2.code || e2.message));
      return res.status(400).json({ error: anexosService.MSG.ENVIO_TORTO });
    }));
  });

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
      const geracao = dashboardGeracao;
      const contagem = frotasService.getDashboard(db)
        .then((data) => {
          if (geracao === dashboardGeracao) dashboardCache = { at: Date.now(), data };
          if (dashboardInflight === contagem) dashboardInflight = null;
          return data;
        })
        .catch((e) => {
          if (dashboardInflight === contagem) dashboardInflight = null;
          throw e;
        });
      dashboardInflight = contagem;
      res.json(await contagem);
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
    try {
      const meus = await portalService.meusRegistros(db, req.user, req.query);
      // Frota Etapa 5 (RN-F5.05): as fotos de cada lancamento (o "meus" ja e so o do vinculo)
      res.json({
        ...meus,
        registros: await anexosService.comAnexos(db, 'registro', meus.registros, assinar),
        abastecimentos: await anexosService.comAnexos(db, 'abastecimento', meus.abastecimentos, assinar),
      });
    } catch (e) { handleError(res, e); }
  });

  // ── Fotos do registro e do abastecimento (Frota Etapa 5) ───────────────────
  // ORDEM IMPORTA: requirePermission ANTES do multer — o 403 do perfil sai sem arquivo gravado (RN-F5.04). Depois do multer, toda
  // recusa apaga o arquivo recebido.
  app.post('/api/frotas/anexos', ...frotaAuth, requirePermission('registrar_operacoes'), receberFoto, async (req, res) => {
    const f = req.file;
    try {
      const anexo = await anexosService.gravar(db, req.user, {
        entidade: req.body?.entidade,
        entidade_id: req.body?.entidade_id,
        arquivo: f ? { nome: f.filename, caminho: f.path, tipo_mime: f.mimetype, tamanho: f.size } : null,
      });
      res.status(201).json({ ...anexosService.paraItem(anexo, assinar), entidade: anexo.entidade, entidade_id: anexo.entidade_id });
    } catch (e) {
      if (f) anexosService.apagarArquivo(pastaAnexos, f.filename);
      handleError(res, e);
    }
  });

  app.delete('/api/frotas/anexos/:id', ...frotaAuth, requirePermission('registrar_operacoes'), async (req, res) => {
    try { res.json(await anexosService.apagar(db, req.user, req.params.id, pastaAnexos)); } catch (e) { handleError(res, e); }
  });

  // O prefixo vai LITERAL nos dois app.use: as reguas de fonte das Etapas 148-154 leem os registros de rota como texto literal.
  if (PASTAS.frotasAnexos.prefixo !== '/api/uploads/frotas-anexos') throw new Error('frotas: prefixo das fotos divergiu de PASTAS');
  // RN-F5.06: o arquivo so sai com a assinatura do dominio proprio (`frotas-anexos-v1`) — sem sessao e sem banco, como o almoxarifado.
  // Prefixo `/api` (o rotasModulos casa antes do catch-all do SPA); nada montado fora dele.
  app.use('/api/uploads/frotas-anexos', assinador.middleware, express.static(pastaAnexos, {
    index: false, dotfiles: 'deny', setHeaders: cabecalhosUploadSeguro,
  }));
  // FECHO obrigatorio: o static chama next() quando o arquivo nao existe — assinatura valida de nome inexistente desceria adiante.
  app.use('/api/uploads/frotas-anexos', (req, res) => res.status(404).end());

  /** RN-F5.05: a lista do gestor/Consulta/motorista (ja no escopo dela) com as fotos de cada linha. */
  const comFotos = (entidade, listFn) => async (dbx, query, user) => anexosService.comAnexos(dbx, entidade, await listFn(dbx, query, user), assinar);
  /** RN-F5.08 (Fase 2, T-1): apaga o lancamento PRIMEIRO — depois disso nenhum envio passa no WHERE EXISTS — e so entao as fotos. */
  const excluindoFotos = (entidade, deleteFn) => async (dbx, id) => {
    const r = await deleteFn(dbx, id);
    await anexosService.apagarDoLancamento(dbx, entidade, id, pastaAnexos);
    return r;
  };

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
    comFotos('abastecimento', frotasService.listAbastecimentos), // Frota Etapa 5 (RN-F5.05)
    frotasService.createAbastecimento,
    frotasService.updateAbastecimento,
    excluindoFotos('abastecimento', frotasService.deleteAbastecimento), // RN-F5.08
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

  // Frota Etapa 8 (RN-F8.27..30): destinos cadastrados. O motorista cria pelo "+ Novo destino" da saida (registrar_operacoes); editar e
  // desativar sao do gestor. Sem GET /destinos/:id (sem getOne) — declarado no plano (ajuste T-7).
  crudRoutes('destinos',
    frotasService.listDestinos,
    frotasService.createDestino,
    frotasService.updateDestino,
    frotasService.deleteDestino,
    { createPerm: 'registrar_operacoes', updatePerm: 'gerenciar_veiculos', deletePerm: 'gerenciar_veiculos' }
  );

  crudRoutes('checklists',
    comFotos('registro', frotasService.listChecklists), // Frota Etapa 5 (RN-F5.05)
    frotasService.createChecklist,
    null,
    excluindoFotos('registro', frotasService.deleteChecklist), // RN-F5.08
    { deletePerm: 'gerenciar_veiculos' }
  );

  // ── Tratar a pendencia do registro (Frota Etapa 6) ─────────────────────────
  // RN-F6.02/03: so o gestor (gerenciar_veiculos). RN-F6.09: tratar e desfazer mudam o alerta — o cache do painel (um so para todos,
  // 30 s) e zerado, senao o alerta tratado continuaria no painel. Caminho LITERAL (reguas de fonte das Etapas 148-154).
  app.post('/api/frotas/checklists/:id/tratar-pendencia', ...frotaAuth, requirePermission('gerenciar_veiculos'), async (req, res) => {
    try {
      const r = await pendenciaService.tratar(db, req.user, req.params.id, req.body);
      limparCacheDashboard();
      res.json(r);
    } catch (e) { handleError(res, e); }
  });
  app.delete('/api/frotas/checklists/:id/tratar-pendencia', ...frotaAuth, requirePermission('gerenciar_veiculos'), async (req, res) => {
    try {
      const r = await pendenciaService.desfazer(db, req.user, req.params.id);
      limparCacheDashboard();
      res.json(r);
    } catch (e) { handleError(res, e); }
  });

  console.log('✅ Rotas Frotas registradas em /api/frotas/*');
};

/** Frotas Etapa 1 (F2-13): zera o cache do painel — o harness de teste chama ao criar cada app (o cache e do modulo, nao do app). */
function limparCacheDashboard() {
  dashboardCache = { at: 0, data: null };
  dashboardInflight = null;
  dashboardGeracao += 1;
}
module.exports.limparCacheDashboard = limparCacheDashboard;
