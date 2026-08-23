/**
 * Módulo Almoxarifado — GMP INDUSTRIAIS
 * Rotas: materiais, movimentações, conferências de estoque
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { z } = require('zod');
const alertService = require('../services/almoxarifado/alertService');
const requisitionReminderService = require('../services/almoxarifado/requisitionReminderService');
const requisitionService = require('../services/almoxarifado/requisitionService');
const { disponivelSql } = require('../services/almoxarifado/availabilitySql');
const { valorEstoqueSql, custoUnitarioSql } = require('../services/almoxarifado/custoSql');
const requisitionCreateService = require('../services/almoxarifado/requisitionCreateService');
const requisitionStateMachine = require('../services/almoxarifado/requisitionStateMachine');
const valueApprovalService = require('../services/almoxarifado/requisitionValueApprovalService');
const stockService = require('../services/almoxarifado/stockService');
const materialService = require('../services/almoxarifado/materialService');
const {
  materialPhotoFilename,
  materialPhotoUrl,
  enrichMaterialRow,
  enrichMaterialRows,
} = require('../services/almoxarifado/materialPhoto');
const { canConfigureAlmox, canDeleteAlmoxRequisicao, isSystemAdmin } = require('../services/systemPermissions');
const { can, requirePermission } = require('../services/almoxarifado/permissions');
const reservationService = require('../services/almoxarifado/reservationService');
const lotService = require('../services/almoxarifado/lotService');
const { dbRun, dbGet, dbAll } = require('../services/almoxarifado/db');
const { validate } = require('../services/almoxarifado/validation');
const { MaterialSchema, MaterialUpdateSchema, RequisicaoSchema } = require('../services/almoxarifado/schemas');
const { registrarAuditoria } = require('../services/almoxarifado/audit');

function denyUnlessAlmoxAdmin(req, res) {
  if (!canConfigureAlmox(req.user)) {
    res.status(403).json({ error: 'Acesso restrito — administrador do Almoxarifado ou Super Administrador' });
    return true;
  }
  return false;
}

// Etapa 10 (RN-01): tolerancia de inventario, EFETIVA. `configuracoes_almoxarifado.valor` e
// TEXT — getConfig devolve string ou undefined, nunca numero — e `0` e um valor VALIDO de
// tolerancia, diferente de "ausente". `parseFloat(x) || 2` devolveria 2 para '0' (achado da
// Fase 2: `parseFloat('0') || 2` === 2, silenciosamente) — por isso Number.isFinite, nao ||.
// Uma unica funcao para os tres pontos que precisam da mesma conta (criar, listar e concluir)
// nao divergirem entre si.
function toleranciaEfetiva(valor) {
  const n = parseFloat(valor);
  return Number.isFinite(n) ? n : 2;
}

module.exports = function (app, db, authenticateToken, PERSISTENT_DATA_DIR, checkModulePermission) {

  // ── Diretório de fotos ──────────────────────────────────────────────────────
  const uploadsAlmoxDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'almoxarifado');
  if (!fs.existsSync(uploadsAlmoxDir)) fs.mkdirSync(uploadsAlmoxDir, { recursive: true });

  const storageAlmox = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsAlmoxDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `material-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
  });
  const uploadAlmox = multer({
    storage: storageAlmox,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (/^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.mimetype)) return cb(null, true);
      cb(new Error('Apenas imagens são permitidas'));
    }
  });

  // Etapa 6: certificado do fornecedor é PDF — reaproveitar uploadAlmox (só imagens) rejeitaria
  // todo certificado.
  const uploadCertificado = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsAlmoxDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `certificado-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (/^(application\/pdf|image\/(jpeg|jpg|png|webp))$/i.test(file.mimetype)) return cb(null, true);
      cb(new Error('Certificado deve ser PDF ou imagem'));
    },
  });

  // ── Schema único — todo o DDL do módulo vive em services/almoxarifado/schema.js ──
  const { initSchema } = require('../services/almoxarifado/schema');
  initSchema(db).catch((e) => console.error('❌ Erro no schema do almoxarifado:', e.message));

  // Servir fotos — padrão /api/uploads/almoxarifado (compatível com proxy /api)
  app.use('/api/uploads/almoxarifado', require('express').static(uploadsAlmoxDir));
  app.use('/uploads/almoxarifado', require('express').static(uploadsAlmoxDir));

  const almoxMiddleware = checkModulePermission
    ? [authenticateToken, checkModulePermission('almoxarifado')]
    : [authenticateToken];
  app.use('/api/almoxarifado', ...almoxMiddleware);


  // ════════════════════════════════════════════════════════════════════════════
  // MATERIAIS — CRUD
  // ════════════════════════════════════════════════════════════════════════════

  // Etapa 8c, Task 1: `buildLocalizacaoPath` e `formatLocalizacaoLabel` moraram aqui e foram
  // REMOVIDAS, não duplicadas. O plano da 8c mandava mantê-las dizendo que tinham outros usos
  // neste arquivo (listagem de localizações) — não tinham: o único chamador era o
  // `resolveLocalizacaoFromFk` logo abaixo, que agora delega. Mantê-las deixaria duas cópias da
  // mesma conta, que divergiriam na primeira mudança. Elas vivem em
  // services/almoxarifado/materialService.js.

  // Resolve o par (id, rótulo formatado) de uma localização padrão a partir do FK — usado
  // no cadastro de materiais (POST/PUT). Retorna { locId, locText }; locId é null quando o FK
  // não foi informado, locText é null quando a localização não existe mais (FK órfão).
  //
  // Etapa 8c, Task 1: o corpo mudou de casa (services/almoxarifado/materialService.js) porque a
  // criacao de material precisava sair do handler HTTP. Este wrapper existe para os outros usos
  // deste arquivo (PUT de material, importacao) continuarem chamando com um argumento so.
  async function resolveLocalizacaoFromFk(localizacaoPadraoId) {
    return materialService.resolveLocalizacaoFromFk(db, localizacaoPadraoId);
  }

  // Resolve o almoxarifado_id a persistir numa localização: usa o valor informado,
  // ou (ausente) o id do ALM-GERAL como default — tolera a tabela almoxarifados ainda
  // não existir/estar vazia (fallback null, sem quebrar a criação da localização).
  function resolveAlmoxarifadoId(providedId, callback) {
    const id = providedId ? parseInt(providedId, 10) : null;
    if (id) return callback(null, id);
    db.get(`SELECT id FROM almoxarifados WHERE codigo = 'ALM-GERAL'`, [], (err, row) => {
      if (err) return callback(null, null);
      callback(null, row ? row.id : null);
    });
  }

  function checkSubgrupoDuplicado(dbConn, { subgrupo, setor, parent_id, excludeId }, callback) {
    if (!subgrupo || !String(subgrupo).trim()) return callback(null, false);
    dbConn.get(
      `SELECT id FROM localizacoes_almoxarifado
       WHERE ativo = 1 AND subgrupo = ? AND setor IS ? AND parent_id IS ? AND id != ?`,
      [String(subgrupo).trim(), setor || null, parent_id || null, excludeId || 0],
      (err, row) => callback(err, !!row)
    );
  }

  // GET /api/almoxarifado/materiais — listar
  app.get('/api/almoxarifado/materiais', async (req, res) => {
    const { search, categoria, status, familia_id, setor } = req.query;

    try {
      const sectorMaterialService = require('../services/almoxarifado/sectorMaterialService');
      await sectorMaterialService.ensureSetoresRequisicao(db);
      const filterClause = setor
        ? await sectorMaterialService.buildMaterialFilterClause(db, setor)
        : null;

      // almoxarifado_codigo/nome: `m.localizacao` é um TEXT desnormalizado que não guarda o
      // almoxarifado; resolvemos pelo FK da localização padrão. LEFT JOIN em cadeia — material
      // sem localização (ou com localização sem almoxarifado) continua na lista, com null.
      //
      // Etapa 8, Task 1, classe C da auditoria: esta lista (tela de Materiais) NAO filtra o
      // dono de proposito — e o catalogo operacional, e o almoxarife precisa achar a chapa do
      // cliente para movimentar, endereçar e etiquetar. O que evita a confusao e o SELO de
      // propriedade na listagem (Task 9), nao a exclusao. As leituras de estoque PROPRIO
      // (dashboard, posicao-estoque) filtram — sao outra pergunta.
      // proprietario_cliente_nome (Etapa 8, Task 9): o selo da listagem precisa dizer DE QUAL
      // cliente e a chapa, nao so que ela e de terceiro. Mesmo padrao de
      // stockService.consultarEstoque. `clientes` e tabela CORE (criada por index.js, fora do
      // initSchema do modulo) — o harness de teste replica um subconjunto dela de proposito;
      // fallback sem o JOIN aqui esconderia um ambiente quebrado em vez de resolve-lo.
      let sql = `SELECT m.*, f.nome as familia_nome, f.codigo as familia_codigo,
                        a.codigo as almoxarifado_codigo, a.nome as almoxarifado_nome,
                        cli.razao_social as proprietario_cliente_nome
                 FROM materiais_almoxarifado m
                 LEFT JOIN familias_material_almoxarifado f ON m.familia_id = f.id
                 LEFT JOIN localizacoes_almoxarifado l ON m.localizacao_padrao_id = l.id
                 LEFT JOIN almoxarifados a ON l.almoxarifado_id = a.id
                 LEFT JOIN clientes cli ON m.proprietario_cliente_id = cli.id
                 WHERE 1=1`;
      const params = [];

      if (filterClause) sql += ` AND ${filterClause}`;
      if (search) {
        sql += ` AND (m.nome LIKE ? OR m.codigo LIKE ? OR m.descricao LIKE ? OR m.fornecedor_principal LIKE ?)`;
        const s = `%${search}%`;
        params.push(s, s, s, s);
      }
      if (categoria) {
        sql += ` AND m.categoria = ?`;
        params.push(categoria);
      }
      if (familia_id) {
        sql += ` AND m.familia_id = ?`;
        params.push(parseInt(familia_id, 10));
      }
      if (status === 'critico') {
        sql += ` AND m.quantidade_atual <= m.quantidade_minima AND m.quantidade_minima > 0`;
      } else if (status === 'ok') {
        sql += ` AND m.quantidade_atual > m.quantidade_minima`;
      } else if (status === 'zerado') {
        sql += ` AND m.quantidade_atual = 0`;
      }

      sql += ` AND m.ativo = 1 ORDER BY f.nome ASC, m.nome ASC`;

      db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(enrichMaterialRows(rows));
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/almoxarifado/materiais/dashboard — stats para o dashboard
  app.get('/api/almoxarifado/dashboard',(req, res) => {
    const stats = {};

    // ── Etapa 8, Task 1 ──────────────────────────────────────────────────────────────────
    // Todas as cinco leituras de materiais_almoxarifado deste dashboard sao de estoque PROPRIO
    // (classe A da auditoria). valorTotalEstoque e a mais grave: sem o filtro,
    // SUM(quantidade_atual * custo_unitario) contabiliza o patrimonio do cliente como nosso.
    // Estas cinco NAO estavam na contagem de 19 da spec de design (que varreu
    // routes/almoxarifado/ — o subdiretorio — e nao este arquivo).
    db.get(`SELECT COUNT(*) as total FROM materiais_almoxarifado WHERE ativo = 1 AND proprietario_cliente_id IS NULL`, [], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      stats.totalMateriais = row.total;

      db.get(`SELECT COUNT(*) as total FROM materiais_almoxarifado WHERE ativo = 1 AND proprietario_cliente_id IS NULL AND quantidade_atual <= quantidade_minima AND quantidade_minima > 0`, [], (err2, row2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        stats.materiaisCriticos = row2.total;

        db.get(`SELECT COUNT(*) as total FROM materiais_almoxarifado WHERE ativo = 1 AND proprietario_cliente_id IS NULL AND quantidade_atual = 0`, [], (err3, row3) => {
          if (err3) return res.status(500).json({ error: err3.message });
          stats.materiaisZerados = row3.total;

          // `valorEstoqueSql` (tarefa extra da 8c): antes esta soma era `quantidade_atual *
          // custo_unitario` pura, que valora pelo ULTIMO custo de compra e ignora a media
          // ponderada que o recebimento mantem. Nao tinha o bug do COALESCE (nao zerava), mas
          // divergia do relatorio de posicao de estoque, que responde a MESMA pergunta. O numero
          // do dashboard MUDA para o material que ja recebeu NF com custo diferente do cadastro —
          // e passa a ser o mesmo que a tela de relatorio mostra.
          db.get(`SELECT COALESCE(SUM(${valorEstoqueSql()}), 0) as total FROM materiais_almoxarifado WHERE ativo = 1 AND proprietario_cliente_id IS NULL`, [], (err4, row4) => {
            if (err4) return res.status(500).json({ error: err4.message });
            stats.valorTotalEstoque = row4.total;

            db.get(`SELECT COUNT(*) as total FROM movimentacoes_almoxarifado WHERE DATE(created_at) = DATE('now')`, [], (err5, row5) => {
              if (err5) return res.status(500).json({ error: err5.message });
              stats.movimentacoesHoje = row5.total;

              // Materiais críticos (lista)
              db.all(`SELECT id, codigo, nome, quantidade_atual, quantidade_minima, unidade, categoria
                      FROM materiais_almoxarifado
                      WHERE ativo = 1 AND proprietario_cliente_id IS NULL
                        AND quantidade_atual <= quantidade_minima AND quantidade_minima > 0
                      ORDER BY (quantidade_atual / NULLIF(quantidade_minima, 0)) ASC LIMIT 10`, [], (err6, criticos) => {
                if (err6) return res.status(500).json({ error: err6.message });
                stats.listaMateriaisCriticos = criticos;

                // Últimas movimentações
                db.all(`SELECT m.*, ma.nome as material_nome, ma.codigo as material_codigo, ma.unidade
                        FROM movimentacoes_almoxarifado m
                        JOIN materiais_almoxarifado ma ON m.material_id = ma.id
                        ORDER BY m.created_at DESC LIMIT 10`, [], (err7, ultimas) => {
                  if (err7) return res.status(500).json({ error: err7.message });
                  stats.ultimasMovimentacoes = ultimas;

                  // Movimentações por dia (últimos 7 dias)
                  db.all(`SELECT DATE(created_at) as dia, COUNT(*) as total, tipo
                          FROM movimentacoes_almoxarifado
                          WHERE created_at >= DATE('now', '-7 days')
                          GROUP BY dia, tipo ORDER BY dia`, [], (err8, grafico) => {
                    if (err8) return res.status(500).json({ error: err8.message });
                    stats.graficoMovimentacoes = grafico;
                    res.json(stats);
                  });
                });
              });
            });
          });
        });
      });
    });
  });

  // GET /api/almoxarifado/materiais/:id — detalhe
  app.get('/api/almoxarifado/materiais/:id',(req, res) => {
    db.get(`SELECT m.*, f.nome as familia_nome, f.codigo as familia_codigo,
                   a.codigo as almoxarifado_codigo, a.nome as almoxarifado_nome,
                   cli.razao_social as proprietario_cliente_nome
            FROM materiais_almoxarifado m
            LEFT JOIN familias_material_almoxarifado f ON m.familia_id = f.id
            LEFT JOIN localizacoes_almoxarifado l ON m.localizacao_padrao_id = l.id
            LEFT JOIN almoxarifados a ON l.almoxarifado_id = a.id
            LEFT JOIN clientes cli ON m.proprietario_cliente_id = cli.id
            WHERE m.id = ?`, [req.params.id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Material não encontrado' });
      res.json(enrichMaterialRow(row));
    });
  });

  // Etapa 8c, Task 1: os corpos destas tres mudaram de casa
  // (services/almoxarifado/materialService.js). Os wrappers ficam porque o resto deste arquivo
  // (PUT de material, importacao) chama sem passar `db`.
  async function validateFamiliaAtiva(familiaId) {
    return materialService.validateFamiliaAtiva(db, familiaId);
  }

  // Subfamílias (Etapa 2, Task 3): quando informada, a subfamília do material precisa ser
  // filha (parent_id = familiaId) e ativa. familiaId pode ser null (família omitida no PUT
  // full-replace) — nesse caso nenhuma subfamília bate no WHERE e a validação falha, o que é
  // o comportamento correto (não existe família válida para amarrar a subfamília).
  async function validateSubfamilia(subfamiliaId, familiaId) {
    return materialService.validateSubfamilia(db, subfamiliaId, familiaId);
  }

  const bool01 = materialService.bool01;

  // 'ativo' incluído aqui (fix pós-review — minor): o schema usa FlagSchema (tolera
  // true/false além de 0/1), então o merge precisa normalizar para 0/1 antes de gravar —
  // mesmo tratamento das demais flags de controle.
  const MATERIAL_BOOL_FIELDS = new Set([
    'ativo', 'material_critico', 'controle_lote', 'controle_certificado',
    'controle_serie', 'controle_validade', 'controle_corrida', 'requer_inspecao', 'requer_foto',
  ]);

  // Colunas de materiais_almoxarifado que o PUT sabe atualizar (preserve-when-omitted — ver
  // helper `val()` na rota). 'localizacao' (texto formatado) é derivada de localizacao_padrao_id
  // e não entra no merge genérico — é resolvida à parte via resolveLocalizacaoFromFk.
  const MATERIAL_UPDATE_COLUMNS = [
    'codigo', 'nome', 'descricao', 'categoria', 'unidade', 'localizacao',
    'quantidade_minima', 'quantidade_maxima', 'custo_unitario', 'fornecedor_principal',
    'codigo_fornecedor', 'ncm', 'especificacoes', 'observacoes', 'ativo',
    'descricao_tecnica', 'categoria_id', 'subcategoria_id', 'localizacao_padrao_id',
    // Etapa 8: proprietario_cliente_id entra no merge generico do PUT como qualquer outra
    // coluna — omitir preserva o dono (a tela antiga nao manda a chave), `null` explicito
    // devolve o material ao estoque proprio.
    'fornecedor_id', 'proprietario_cliente_id', 'tipo_material', 'material_critico', 'controle_lote', 'controle_certificado',
    'familia_id', 'subfamilia_id',
    // Cadastro completo (Etapa 2, Task 4)
    'fabricante', 'codigo_fabricante', 'peso_unitario', 'dimensoes', 'material_construtivo',
    'norma', 'marca', 'modelo', 'aplicacao', 'ponto_reposicao', 'lote_economico',
    'controle_serie', 'controle_validade', 'controle_corrida', 'requer_inspecao', 'requer_foto',
    'classe_abc', 'unidade_compra', 'fator_conversao_compra', 'unidade_consumo', 'fator_conversao_consumo',
  ];

  // POST /api/almoxarifado/materiais — criar
  //
  // requirePermission('criar_material'): o gate global do módulo (linha ~71) só checa ACESSO, não
  // perfil — sem isto qualquer usuário do módulo (fallback PRODUCAO em getPerfilFromUser)
  // cadastrava material, contornando criar_material: [ADMINISTRADOR, ALMOXARIFE, ENGENHARIA].
  //
  // Etapa 8c, Task 1: o corpo virou materialService.createMaterial. O gate FICA AQUI de propósito
  // — os caminhos internos que chamam o serviço já passaram pelo gate deles.
  app.post('/api/almoxarifado/materiais', requirePermission('criar_material'), validate(MaterialSchema), async (req, res) => {
    try {
      const row = await materialService.createMaterial(db, req.user, req.body);
      res.status(201).json(row);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // PUT /api/almoxarifado/materiais/:id — atualizar
  //
  // HARD REQUIREMENT (Etapa 2, Task 4 — mesma classe de bug corrigida 3x nas tasks
  // anteriores): preserve-when-omitted para TODA coluna, não só subfamilia_id. `val(k)` decide
  // por chave: `undefined` no body preserva o valor atual; qualquer valor explícito (incluindo
  // `null`) substitui. A tela atual (MaterialAlmoxarifadoForm.js) não manda os campos novos
  // deste task — sem essa preservação, editar nome/marca pelo formulário de hoje apagaria
  // fabricante/classe_abc/unidade_compra/etc. setados via API.
  //
  // requirePermission('editar_material') — mesma razão do POST acima (gate global só
  // checa acesso ao módulo, não perfil).
  app.put('/api/almoxarifado/materiais/:id', requirePermission('editar_material'), validate(MaterialUpdateSchema), async (req, res) => {
    let current;
    try {
      current = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [req.params.id]);
    } catch (errCurrent) {
      return res.status(500).json({ error: errCurrent.message });
    }
    if (!current) return res.status(404).json({ error: 'Material não encontrado' });

    const val = (k) => (req.body[k] === undefined ? current[k] : req.body[k]);

    const merged = {};
    for (const col of MATERIAL_UPDATE_COLUMNS) {
      if (col === 'localizacao') continue; // derivada de localizacao_padrao_id, resolvida abaixo
      merged[col] = MATERIAL_BOOL_FIELDS.has(col) ? bool01(val(col)) : val(col);
    }

    // Mesma semântica do T3 (comentário original preservado): só revalida quando o valor é
    // NOVO — informado explicitamente, OU a família efetiva mudou (um vínculo preservado pode
    // não ser filho da família nova). Um vínculo preservado com a MESMA família já era válido
    // quando foi setado; revalidar quebraria a edição de um material cuja subfamília foi
    // inativada depois.
    const familiaOmitted = req.body.familia_id === undefined;
    const familiaChanged = merged.familia_id !== current.familia_id;
    if (!familiaOmitted && familiaChanged) {
      try {
        await validateFamiliaAtiva(merged.familia_id);
      } catch (errFam) {
        return res.status(400).json({ error: errFam.message });
      }
    }

    const subfamiliaOmitted = req.body.subfamilia_id === undefined;
    if (merged.subfamilia_id && (!subfamiliaOmitted || familiaChanged)) {
      try {
        await validateSubfamilia(merged.subfamilia_id, merged.familia_id);
      } catch (errSub) {
        return res.status(400).json({ error: errSub.message });
      }
    }

    let locId, locText;
    try {
      ({ locId, locText } = await resolveLocalizacaoFromFk(merged.localizacao_padrao_id));
    } catch (errLoc) {
      return res.status(500).json({ error: errLoc.message });
    }
    merged.localizacao_padrao_id = locId;
    merged.localizacao = locText;

    try {
      await dbRun(db, `UPDATE materiais_almoxarifado SET
        ${MATERIAL_UPDATE_COLUMNS.map((c) => `${c} = ?`).join(', ')},
        updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [...MATERIAL_UPDATE_COLUMNS.map((c) => merged[c]), req.params.id]);
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Código já existe' });
      return res.status(500).json({ error: err.message });
    }

    // Auditoria com diff (spec 29 / Task 4): só os campos cujo valor final difere do valor
    // anterior entram no log — para colunas preservadas (omitidas no body) merged === current,
    // então elas nunca aparecem aqui.
    const dadosAnteriores = {};
    const dadosNovos = {};
    for (const f of MATERIAL_UPDATE_COLUMNS) {
      if (f === 'localizacao') continue; // derivada — o que importa para auditoria é o FK
      const oldVal = current[f] ?? null;
      const newVal = merged[f] ?? null;
      if (oldVal !== newVal) {
        dadosAnteriores[f] = current[f] ?? null;
        dadosNovos[f] = merged[f] ?? null;
      }
    }
    // Fix pós-review (Important): este await estava fora de qualquer try/catch — uma rejeição
    // aqui (ex.: erro de I/O no SQLite) não vira uma resposta HTTP no Express 4 (promise
    // rejeitada em handler async não é encaminhada ao error handler automaticamente), então a
    // request PENDURA até o timeout do cliente. Decisão: o UPDATE já foi commitado com sucesso
    // neste ponto — falhar a request inteira por causa só do log de auditoria devolveria um erro
    // ao usuário para uma escrita que na verdade deu certo. Em vez disso, capturamos, logamos
    // como erro (para investigação — auditoria é a regra da spec 29, uma falha aqui não deve
    // passar despercebida) e seguimos para a resposta normal.
    if (Object.keys(dadosNovos).length > 0) {
      try {
        await registrarAuditoria(db, {
          entidade: 'material', entidade_id: Number(req.params.id), acao: 'ATUALIZACAO',
          usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
          dados_anteriores: dadosAnteriores, dados_novos: dadosNovos,
        });
      } catch (errAudit) {
        console.error('[almoxarifado] Falha ao registrar auditoria de edição de material:', errAudit.message);
      }
    }

    try {
      const row = await dbGet(db, `SELECT m.*, f.nome as familia_nome, f.codigo as familia_codigo
              FROM materiais_almoxarifado m
              LEFT JOIN familias_material_almoxarifado f ON m.familia_id = f.id
              WHERE m.id = ?`, [req.params.id]);
      const materialId = Number(req.params.id);
      await Promise.all([
        stockService.syncSaldoLocalizacaoPadrao(db, materialId).catch(() => null),
        alertService.verificarAlertaPorMaterialId(db, materialId).catch(() => null),
      ]);
      res.json(row);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/almoxarifado/materiais/:id — inativar (soft delete: é uma edição do
  // cadastro, daí `editar_material` e não uma ação própria).
  app.delete('/api/almoxarifado/materiais/:id', requirePermission('editar_material'), async (req, res) => {
    try {
      await dbRun(db, `UPDATE materiais_almoxarifado SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/almoxarifado/materiais/:id/foto — upload de foto
  // ORDEM IMPORTA: requirePermission ANTES do multer. Invertido, o multer já teria
  // gravado o arquivo em disco quando o 403 fosse emitido — upload não autorizado + lixo
  // órfão em uploads/almoxarifado (coberto em permissoesRotas.api.test.js).
  app.post('/api/almoxarifado/materiais/:id/foto', requirePermission('editar_material'), uploadAlmox.single('foto'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma foto enviada' });

    const filename = req.file.filename;

    // Remover foto antiga
    db.get(`SELECT foto FROM materiais_almoxarifado WHERE id = ?`, [req.params.id], (err, row) => {
      if (row && row.foto) {
        const oldFilename = materialPhotoFilename(row.foto);
        if (oldFilename) {
          const oldPath = path.join(uploadsAlmoxDir, oldFilename);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
      }
    });

    db.run(`UPDATE materiais_almoxarifado SET foto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [filename, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ foto: filename, foto_url: materialPhotoUrl(filename) });
      });
  });

  // POST /api/almoxarifado/lotes/:id/certificado — anexa o certificado e libera o lote se ele
  // estava bloqueado exatamente por falta dele.
  // ORDEM IMPORTA: requirePermission ANTES do multer (mesmo motivo da rota de foto acima).
  app.post('/api/almoxarifado/lotes/:id/certificado',
    requirePermission('receber_material'), uploadCertificado.single('certificado'), async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum certificado enviado' });

        const lote = await dbGet(db, 'SELECT * FROM lotes_almoxarifado WHERE id = ?', [req.params.id]);
        if (!lote) return res.status(404).json({ error: 'Lote nao encontrado' });

        await dbRun(db, `UPDATE lotes_almoxarifado
          SET certificado_arquivo = ?, certificado_em = CURRENT_TIMESTAMP, certificado_por = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`, [req.file.filename, req.user?.id || null, lote.id]);

        // Apaga o certificado anterior, espelhando a rota de foto do material acima (achado do
        // review final da Etapa 6): reanexar substituia a referencia no banco e deixava o arquivo
        // velho para sempre em uploads/almoxarifado, sem nada apontando para ele. Depois do
        // UPDATE de proposito — perder o arquivo novo por causa de uma falha no unlink seria pior
        // do que deixar um orfao; e o `certificado_arquivo` que acabamos de gravar e a referencia
        // que manda.
        if (lote.certificado_arquivo && lote.certificado_arquivo !== req.file.filename) {
          try {
            const antigo = path.join(uploadsAlmoxDir, path.basename(lote.certificado_arquivo));
            if (fs.existsSync(antigo)) fs.unlinkSync(antigo);
          } catch (unlinkErr) {
            console.warn('[almoxarifado] Falha ao remover certificado anterior:', unlinkErr.message);
          }
        }

        // So libera o que ESTE bloqueio travou. Lote reprovado no ensaio, ou bloqueado por outro
        // motivo, continua bloqueado — anexar PDF nao pode ser atalho para destravar qualquer coisa.
        // A pre-condicao mora INTEIRA dentro de liberarBloqueioPorCertificado (WHERE atomico), nao
        // aqui: decidir aqui com o `lote` lido em :628 e so chamar depois abriria a mesma corrida
        // que liberou um lote REPROVADO por engano (achado do review, Task 5 fix round 1) — entre
        // esta leitura e a chamada ha um `await` (a gravacao do arquivo acima), tempo de sobra para
        // o lote mudar de status por outro caminho.
        await lotService.liberarBloqueioPorCertificado(db, req.user, lote.id, 'Certificado do fornecedor anexado');
        const atualizado = await dbGet(db, 'SELECT * FROM lotes_almoxarifado WHERE id = ?', [lote.id]);
        res.json({ id: atualizado.id, certificado_arquivo: atualizado.certificado_arquivo, status: atualizado.status });
      } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
      }
    });

  // GET /api/almoxarifado/proximo-codigo — próximo código da família (ou geral)
  //
  // Etapa 8c, Task 1: passou a usar MAX do sufixo numérico em vez de ORDER BY id DESC LIMIT 1.
  // O bug: cadastrar CHP-010 e depois CHP-002 fazia o gerador olhar CHP-002 (id maior) e propor
  // CHP-003, que já podia existir. E em LOTE — o caso da 8c, uma chapa que vira N peças — N
  // chamadas concorrentes devolvem o MESMO número, o que MAX não resolve e nem tem como: quem
  // resolve é materialService.createMaterial, com retry sob UNIQUE quando `codigo_auto` está
  // ligado. Duas mudanças, dois lugares, porque a colisão acontece no INSERT e não aqui.
  app.get('/api/almoxarifado/proximo-codigo', async (req, res) => {
    try {
      const codigo = await materialService.proximoCodigo(db, req.query.familia_id || null);
      res.json({ codigo });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });


  // ════════════════════════════════════════════════════════════════════════════
  // MOVIMENTAÇÕES
  // ════════════════════════════════════════════════════════════════════════════

  // GET /api/almoxarifado/movimentacoes — listar
  app.get('/api/almoxarifado/movimentacoes',(req, res) => {
    const { material_id, tipo, data_inicio, data_fim, limit, os_id, projeto_id, centro_custo_id, usuario_id, pendentes_regularizacao } = req.query;

    // Etapa 8, Task 9: este SELECT lista as colunas de `ma` UMA A UMA (nao e `ma.*`), entao
    // ate aqui nem `proprietario_cliente_id` chegava ao client — o selo de propriedade do livro
    // de movimentacoes ficava invisivel para sempre, e nenhum teste com dado mockado pegaria.
    // Por isso vem o id E o nome: o client da precedencia ao dado da propria linha.
    let sql = `SELECT m.*, ma.nome as material_nome, ma.codigo as material_codigo, ma.unidade,
               ma.proprietario_cliente_id, cli.razao_social as proprietario_cliente_nome,
               cc.codigo as centro_custo_codigo, cc.nome as centro_custo_nome
               FROM movimentacoes_almoxarifado m
               JOIN materiais_almoxarifado ma ON m.material_id = ma.id
               LEFT JOIN clientes cli ON ma.proprietario_cliente_id = cli.id
               LEFT JOIN centros_custo_almoxarifado cc ON m.centro_custo_id = cc.id
               WHERE 1=1`;
    const params = [];

    if (material_id) { sql += ` AND m.material_id = ?`; params.push(material_id); }
    if (tipo) { sql += ` AND m.tipo = ?`; params.push(tipo); }
    if (data_inicio) { sql += ` AND DATE(m.created_at) >= ?`; params.push(data_inicio); }
    if (data_fim) { sql += ` AND DATE(m.created_at) <= ?`; params.push(data_fim); }
    if (os_id) { sql += ` AND m.os_id = ?`; params.push(os_id); }
    if (projeto_id) { sql += ` AND m.projeto_id = ?`; params.push(projeto_id); }
    if (centro_custo_id) { sql += ` AND m.centro_custo_id = ?`; params.push(centro_custo_id); }
    if (usuario_id) { sql += ` AND m.usuario_id = ?`; params.push(usuario_id); }
    if (pendentes_regularizacao === '1') { sql += ` AND m.regularizacao_pendente = 1 AND m.cancelado = 0`; }

    sql += ` ORDER BY m.created_at DESC`;
    if (limit) { sql += ` LIMIT ?`; params.push(parseInt(limit)); }

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // POST /api/almoxarifado/movimentacoes — registrar movimento
  // Compat v1: contrato antigo, motor novo (stockService = validações + auditoria + saldo por localização)
  // requirePermission('movimentar') espelha a v2 (routes/almoxarifado/extended.js:173): o gate
  // global do módulo só checa ACESSO, não perfil — sem isto a v1 era um bypass da regra
  // movimentar: [ADMINISTRADOR, ALMOXARIFE] para qualquer usuário com acesso ao módulo.
  app.post('/api/almoxarifado/movimentacoes', requirePermission('movimentar'), async (req, res) => {
    const { material_id, tipo, quantidade, motivo, referencia, observacoes } = req.body;

    if (!['ENTRADA', 'SAIDA', 'AJUSTE', 'DEVOLUCAO'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido. Use ENTRADA, SAIDA, AJUSTE ou DEVOLUCAO' });
    }
    if ((tipo === 'SAIDA' || tipo === 'AJUSTE') && !motivo) {
      return res.status(400).json({ error: 'Motivo é obrigatório para saída e ajuste' });
    }

    try {
      // `exigeLote: true` — esta rota tambem e movimentacao MANUAL (o modal rapido da tela de
      // Materiais), entao um material com `controle_lote` continua sendo recusado aqui, como era
      // antes do review final. O contrato v1 nao carrega lote: a recusa e o comportamento certo,
      // e a saida do operador e a tela de Movimentacoes, que tem o campo. Tirar a exigencia daqui
      // abriria um bypass silencioso da flag por um formulario que o usuario ja tem na mao — o
      // oposto do que a isencao dos fluxos internos resolve (aqueles nao tem NENHUMA porta).
      // `exigeSerie: true` (Etapa 6b): mesma logica — este corpo tambem nao carrega `series`, entao
      // material com `controle_serie` sempre recusa aqui (o operador tem a tela de Movimentacoes
      // para informar as series).
      const result = await stockService.registrarMovimentacao(db, req.user, {
        material_id, tipo, quantidade, motivo, referencia, observacoes,
        justificativa: motivo || null,
      }, { exigeLote: true, exigeSerie: true });
      res.status(201).json({
        id: result.id, material_id, tipo, quantidade,
        saldo_anterior: result.saldo_anterior, saldo_posterior: result.saldo_posterior,
        motivo, referencia, observacoes,
      });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // GET /api/almoxarifado/movimentacoes/:id/historico — histórico de um material
  app.get('/api/almoxarifado/materiais/:id/historico',(req, res) => {
    db.all(`SELECT m.*, ma.nome as material_nome, ma.unidade
            FROM movimentacoes_almoxarifado m
            JOIN materiais_almoxarifado ma ON m.material_id = ma.id
            WHERE m.material_id = ?
            ORDER BY m.created_at DESC LIMIT 50`,
      [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // CONFERÊNCIAS DE ESTOQUE (INVENTÁRIO)
  // ════════════════════════════════════════════════════════════════════════════

  // GET /api/almoxarifado/conferencias — listar
  app.get('/api/almoxarifado/conferencias',(req, res) => {
    db.all(`SELECT * FROM conferencias_almoxarifado ORDER BY created_at DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // GET /api/almoxarifado/conferencias/:id — detalhe com itens
  app.get('/api/almoxarifado/conferencias/:id', async (req, res) => {
    try {
      const conf = await dbGet(db, `SELECT * FROM conferencias_almoxarifado WHERE id = ?`, [req.params.id]);
      if (!conf) return res.status(404).json({ error: 'Conferência não encontrada' });

      const itensRaw = await dbAll(db, `SELECT ic.*, ma.nome as material_nome, ma.codigo as material_codigo,
                     ma.unidade, ma.localizacao, ma.foto,
                     a.codigo as almoxarifado_codigo, a.nome as almoxarifado_nome
              FROM itens_conferencia_almoxarifado ic
              JOIN materiais_almoxarifado ma ON ic.material_id = ma.id
              LEFT JOIN localizacoes_almoxarifado l ON ma.localizacao_padrao_id = l.id
              LEFT JOIN almoxarifados a ON l.almoxarifado_id = a.id
              WHERE ic.conferencia_id = ?
              ORDER BY ma.nome`, [req.params.id]);

      const tolerancia = toleranciaEfetiva(conf.tolerancia_percentual);

      // RN-02/RN-05: `recontagem_necessaria` e SEMPRE calculada aqui (nunca no front, que nao
      // tem acesso a `quantidade_sistema` em modo cego) e SEMPRE entra no item — inclusive
      // quando o campo vai ser removido logo abaixo, porque quem so conta precisa saber que
      // precisa recontar mesmo sem ver o numero da divergencia.
      let itens = enrichMaterialRows(itensRaw).map((item) => {
        const recontagem_necessaria = item.quantidade_contada != null && !item.recontado
          && (Math.abs(item.divergencia) / Math.max(item.quantidade_sistema, 1)) * 100 > tolerancia;
        return { ...item, recontagem_necessaria };
      });

      // RN-02: contagem cega — enquanto ABERTO e para quem NAO homologa ajuste
      // (`ajustar_estoque`), o esperado e a divergencia ficam escondidos. Concluida ou
      // cancelada os dois voltam para todo mundo: e o registro historico.
      if (conf.modo_cego && conf.status === 'ABERTO' && !can(req.user, 'ajustar_estoque')) {
        itens = itens.map(({ quantidade_sistema, divergencia, ...resto }) => resto);

        // RN-03 (10b, achado da revisao da Task 2): com dupla contagem, a contagem do COLEGA
        // tambem e numero escondido — o recontador precisa contar sem ver o valor do primeiro
        // contador, senao os quatro olhos viram dois olhos e uma copia. Some so o valor de
        // quem NAO foi o ultimo autor; o proprio autor continua vendo o que digitou (a tela
        // mostra a contagem salva). O design da 10b afirmava "a blindagem do modo cego nao
        // muda" — estava ERRADO para esta combinacao, corrigido no proprio design.
        if (conf.dupla_contagem) {
          itens = itens.map((item) => {
            const ultimoAutorId = item.recontado_por_id != null ? item.recontado_por_id : item.contado_por_id;
            if (ultimoAutorId != null && Number(ultimoAutorId) !== Number(req.user.id)) {
              const { quantidade_contada, ...resto } = item;
              return resto;
            }
            return item;
          });
        }
      }

      res.json({ ...conf, itens });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // POST /api/almoxarifado/conferencias — criar nova conferência
  // Todo o fluxo de inventário exige `inventario` ([ADMINISTRADOR, ALMOXARIFE, GESTOR]) —
  // o gate global do módulo só checa ACESSO, não perfil.
  app.post('/api/almoxarifado/conferencias', requirePermission('inventario'), async (req, res) => {
    try {
      const { observacoes, categoria, modo_cego, tolerancia_percentual,
              familia_id, classe_abc, apenas_criticos, apenas_de_clientes,
              apenas_em_terceiros, dupla_contagem } = req.body;

      // RN-01 (10b): classe ABC é o único filtro de domínio fechado — valor fora de A/B/C é
      // 400. Os demais filtros que não casam nada só geram conferência vazia, mesmo
      // comportamento que `categoria` inexistente sempre teve.
      let classeAbc = null;
      if (classe_abc !== undefined && classe_abc !== null && classe_abc !== '') {
        classeAbc = String(classe_abc).toUpperCase();
        if (!['A', 'B', 'C'].includes(classeAbc)) {
          return res.status(400).json({ error: 'Classe ABC inválida (use A, B ou C)' });
        }
      }

      // Gerar número único
      const numero = `INV-${Date.now().toString().slice(-8)}`;
      const modoCegoValor = modo_cego ? 1 : 0;
      // RN-01: `tolerancia_percentual` no body manda quando informado (0 incluso — ver
      // toleranciaEfetiva); ausente, cai para a config global, e sem config nenhuma, para 2.
      const toleranciaOrigem = tolerancia_percentual !== undefined && tolerancia_percentual !== null && tolerancia_percentual !== ''
        ? tolerancia_percentual
        : await stockService.getConfig(db, 'tolerancia_inventario_percentual');
      const toleranciaValor = toleranciaEfetiva(toleranciaOrigem);

      // RN-01 (10b): descrição legível do escopo, ordem fixa, juntada por " + ". Sem filtro
      // nenhum → "Geral". Persistida na conferência para aparecer na lista/detalhe sem
      // reconstruir os filtros originais depois.
      const partesEscopo = [];
      if (categoria) partesEscopo.push(`Categoria: ${categoria}`);
      if (familia_id) {
        const fam = await dbGet(db, `SELECT nome FROM familias_material_almoxarifado WHERE id = ?`, [familia_id]);
        // Literal congelado (RN-01): com cadastro "Família: <nome>"; sem, "Família #<id>"
        // (SEM dois-pontos — o teste afere os dois ramos).
        partesEscopo.push(fam?.nome ? `Família: ${fam.nome}` : `Família #${familia_id}`);
      }
      if (classeAbc) partesEscopo.push(`Classe ${classeAbc}`);
      if (apenas_criticos) partesEscopo.push('Somente críticos');
      if (apenas_de_clientes) partesEscopo.push('Materiais de clientes');
      if (apenas_em_terceiros) partesEscopo.push('Com saldo em terceiros');
      const escopoDescricao = partesEscopo.length > 0 ? partesEscopo.join(' + ') : 'Geral';
      const duplaContagemValor = dupla_contagem ? 1 : 0;

      const ins = await dbRun(db, `INSERT INTO conferencias_almoxarifado
              (numero, status, responsavel_id, responsavel_nome, observacoes, modo_cego,
               tolerancia_percentual, dupla_contagem, escopo_descricao)
              VALUES (?, 'ABERTO', ?, ?, ?, ?, ?, ?, ?)`,
        [numero, req.user.id, req.user.nome || req.user.email, observacoes || null,
         modoCegoValor, toleranciaValor, duplaContagemValor, escopoDescricao]);
      const confId = ins.lastID;

      // Inserir todos os materiais ativos.
      //
      // Etapa 8b (decisao 2 do design): o esperado desconta `quantidade_em_terceiros`, e SO ela.
      // A conferencia e por MATERIAL, nao por localizacao — entao material que esta no
      // galvanizador entraria no esperado e toda contagem acusaria uma diferenca fantasma, com o
      // operador "corrigindo" o saldo para menos de material que existe e vai voltar.
      //
      // E SO ELA de proposito. quantidade_reservada, quantidade_bloqueada e quantidade_em_inspecao
      // continuam somando porque aquele material ESTA na prateleira e TEM de ser contado:
      // "bloqueado" e um estado administrativo, nao uma ausencia fisica. `quantidade_em_terceiros`
      // e a unica das quatro que significa "nao esta no predio". Quem "uniformizar as quatro"
      // aqui passa a esconder do inventario material que esta no galpao.
      //
      // NAO usar `disponivelSql` aqui: parece a mesma conta e nao e — o disponivel subtrai as
      // quatro retencoes, a contagem so pode subtrair uma.
      // Coberto nos dois sentidos por tests/api/conferenciaEmTerceiros.api.test.js.
      let sql = `SELECT id, (quantidade_atual - COALESCE(quantidade_em_terceiros, 0)) AS quantidade_sistema
                 FROM materiais_almoxarifado WHERE ativo = 1`;
      const params = [];
      if (categoria) { sql += ` AND categoria = ?`; params.push(categoria); }
      if (familia_id) { sql += ` AND familia_id = ?`; params.push(familia_id); }
      if (classeAbc) { sql += ` AND classe_abc = ?`; params.push(classeAbc); }
      if (apenas_criticos) { sql += ` AND material_critico = 1`; }
      if (apenas_de_clientes) { sql += ` AND proprietario_cliente_id IS NOT NULL`; }
      // RN-02 (10b): escopo "em terceiros" = tem retenção fora do prédio. O esperado continua
      // sendo o que está NO prédio (o SELECT acima já desconta — regra da 8b, inalterada).
      if (apenas_em_terceiros) { sql += ` AND COALESCE(quantidade_em_terceiros, 0) > 0`; }
      sql += ` ORDER BY nome`;

      const materiais = await dbAll(db, sql, params);

      if (materiais.length === 0) {
        // Achado da revisao final de branch: faltava totalItens aqui — o contrato promete o
        // campo em toda resposta 201, e o front (ConferenciaEstoque.js) le
        // `res.data.totalItens` sem checar undefined ("criada com undefined itens").
        return res.status(201).json({
          id: confId, numero, status: 'ABERTO',
          modo_cego: modoCegoValor, tolerancia_percentual: toleranciaValor, itens: [], totalItens: 0,
          dupla_contagem: duplaContagemValor, escopo_descricao: escopoDescricao,
        });
      }

      await Promise.all(materiais.map((m) => dbRun(db,
        `INSERT INTO itens_conferencia_almoxarifado (conferencia_id, material_id, quantidade_sistema)
         VALUES (?, ?, ?)`, [confId, m.id, m.quantidade_sistema])));

      res.status(201).json({
        id: confId, numero, status: 'ABERTO',
        modo_cego: modoCegoValor, tolerancia_percentual: toleranciaValor, totalItens: materiais.length,
        dupla_contagem: duplaContagemValor, escopo_descricao: escopoDescricao,
      });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // PUT /api/almoxarifado/conferencias/:id/item — registrar contagem de um item
  app.put('/api/almoxarifado/conferencias/:id/item/:itemId', requirePermission('inventario'), async (req, res) => {
    try {
      const { quantidade_contada, observacoes } = req.body;

      // RN-08 (10b, achado da revisao da Task 2): a rota nunca validou quantidade_contada, e
      // isso era CONTORNO da dupla contagem — mandar "abc" (que o front converte em null via
      // parseFloat) gravava NULL, devolvia o item a "nunca contado" e destravava o primeiro
      // contador para digitar sozinho o numero final, com a trilha de autoria dizendo que
      // foram dois. Tambem fecha o minor deferido da Etapa 10 (negativo aceito sem validacao,
      // que produzia mensagem de retencao malformada no concluir). Zero CONTINUA valido —
      // contagem fisica legitima (Critical da revisao final da Etapa 10).
      const quantidadeNum = parseFloat(quantidade_contada);
      if (!Number.isFinite(quantidadeNum) || quantidadeNum < 0) {
        return res.status(400).json({ error: 'Quantidade contada deve ser um número maior ou igual a zero' });
      }

      // RN-03/D9: fora de ABERTO a rota nunca checou status nenhum — item de conferencia
      // CONCLUIDO/CANCELADO aceitava edicao, contradizendo o proprio teste que a spec 17 sempre
      // pediu ("conferencia concluida nao pode ser editada"). Nao e mudanca de comportamento
      // pedida por ninguem: e o comportamento que a spec sempre presumiu e o codigo nunca teve.
      const conf = await dbGet(db, `SELECT status, dupla_contagem FROM conferencias_almoxarifado WHERE id = ?`, [req.params.id]);
      if (!conf) return res.status(404).json({ error: 'Conferência não encontrada' });
      if (conf.status !== 'ABERTO') {
        return res.status(400).json({ error: `Conferência não está aberta (status atual: ${conf.status})` });
      }

      const item = await dbGet(db, `SELECT ic.*, ma.quantidade_atual
              FROM itens_conferencia_almoxarifado ic
              JOIN materiais_almoxarifado ma ON ic.material_id = ma.id
              WHERE ic.id = ? AND ic.conferencia_id = ?`, [req.params.itemId, req.params.id]);
      if (!item) return res.status(404).json({ error: 'Item não encontrado' });

      const divergencia = quantidadeNum - item.quantidade_sistema;
      // RN-04: a SEGUNDA vez que este item recebe contagem (isto e: `item.quantidade_contada`,
      // lido ANTES deste UPDATE, ja nao era nulo) conta como recontagem — marca `recontado`
      // sozinha, sem rota nova. A resposta ecoa o mesmo booleano para o front nao ter de
      // deduzir a partir do valor antigo, que ele nem tem em maos.
      const ehRecontagem = item.quantidade_contada !== null;

      // RN-03 (10b): dupla contagem — o autor da PRIMEIRA contagem nunca reconta. A comparação
      // é sempre contra contado_por_id (não o contador anterior): senão o primeiro contador
      // poderia sobrescrever a recontagem do colega e anular os quatro olhos.
      // Sentinela = contado_por_id (nao ehRecontagem): a autoria nunca volta a null, entao o
      // gate nao depende de um campo que outra requisicao poderia limpar (defesa em
      // profundidade do achado RN-08 acima). Number() dos dois lados: se o id vier string de
      // um token futuro, === estrito falharia ABERTO em silencio.
      if (conf.dupla_contagem && item.contado_por_id != null
          && Number(item.contado_por_id) === Number(req.user.id)) {
        return res.status(400).json({
          error: `Dupla contagem: a recontagem deve ser feita por outra pessoa (primeira contagem: ${item.contado_por_nome})`,
        });
      }

      // RN-04 (10b): autoria sempre gravada, flag ou não — primeira contagem em contado_por_*,
      // cada contagem seguinte sobrescreve recontado_por_* (fica o último recontador).
      const autorNome = req.user.nome || req.user.email;
      const camposAutoria = ehRecontagem
        ? ', recontado_por_id = ?, recontado_por_nome = ?'
        : ', contado_por_id = ?, contado_por_nome = ?';

      await dbRun(db, `UPDATE itens_conferencia_almoxarifado
              SET quantidade_contada = ?, divergencia = ?, observacoes = ?${ehRecontagem ? ', recontado = 1' : ''}${camposAutoria}
              WHERE id = ?`,
        [quantidadeNum, divergencia, observacoes || null, req.user.id, autorNome, req.params.itemId]);

      res.json({ success: true, divergencia, recontagem: ehRecontagem });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // PUT /api/almoxarifado/conferencias/:id/concluir — concluir e aplicar ajustes
  //
  // Dupla permissão, por causa de duas ações distintas na MESMA rota:
  //  - concluir a conferência (fechar a contagem) => `inventario`, no middleware;
  //  - `aplicar_ajustes: true` => além disso `ajustar_estoque`, checado no handler porque
  //    requirePermission é middleware e não vê a semântica do body.
  //
  // Etapa 10: até aqui `aplicar_ajustes` fazia `UPDATE materiais_almoxarifado SET
  // quantidade_atual = ?` DIRETO, seguido de um INSERT manual em movimentacoes_almoxarifado que
  // nem usava auditoria — o ÚNICO caminho de escrita de saldo do módulo inteiro fora do motor
  // (design da Etapa 10, itens B1-B3 de novidades-por-etapa.md). Agora cada item divergente vira
  // uma `stockService.registrarMovimentacao(tipo: 'AJUSTE_INVENTARIO')`, com TODAS as guardas do
  // motor: retenção (RN-06), dono do material (RN-07/403) e a auditoria de verdade.
  //
  // RN-07 é tudo-ou-nada em DUAS passadas: pré-validação (sem efeito colateral nenhum — nem
  // `registrarMovimentacao` nem `ownerRules.assertAjustePermitido`, que audita como efeito
  // colateral e duplicaria auditoria se chamada aqui e de novo na aplicação real) e só depois a
  // aplicação, SEQUENCIAL (não Promise.all — precisa poder abortar sem deixar metade aplicada).
  // O motor não tem transação composta: se a aplicação real recusar algo que a pré-validação
  // aprovou, é corrida entre as duas passadas — limitação conhecida, documentada no plano da
  // Etapa 10, não resolvida aqui.
  app.put('/api/almoxarifado/conferencias/:id/concluir', requirePermission('inventario'), async (req, res) => {
    const { aplicar_ajustes, justificativa_ajuste } = req.body;

    if (aplicar_ajustes && !can(req.user, 'ajustar_estoque')) {
      return res.status(403).json({
        error: 'Sem permissão para aplicar ajustes de estoque na conclusão do inventário',
        acao: 'ajustar_estoque',
      });
    }

    // RN-06b: com aplicar_ajustes, justificativa_ajuste e obrigatoria (min 5 caracteres) — 400
    // IMEDIATO, antes de buscar a conferencia ou tocar em qualquer item. Mesmo texto do
    // JustificativaSchema (schemas.js) por consistencia de UX, escrito a mao aqui: o `validate()`
    // generico embrulharia em "Dados inválidos — justificativa: ...", e a mensagem esta
    // congelada no design (Task 3 depende do texto exato).
    if (aplicar_ajustes) {
      const justificativaValida = typeof justificativa_ajuste === 'string' && justificativa_ajuste.trim().length >= 5;
      if (!justificativaValida) {
        return res.status(400).json({ error: 'Justificativa deve ter pelo menos 5 caracteres' });
      }
    }

    try {
      const conf = await dbGet(db, `SELECT * FROM conferencias_almoxarifado WHERE id = ?`, [req.params.id]);
      if (!conf) return res.status(404).json({ error: 'Conferência não encontrada' });
      // Achado da revisao da Task 2: sem este gate, concluir de novo uma conferencia ja
      // CONCLUIDA fabricava um SEGUNDO AJUSTE_INVENTARIO (e uma segunda auditoria de material de
      // cliente) por item, e concluir uma CANCELADA a ressuscitava. Mesma mensagem de RN-03
      // (PUT /item ja usa), agora tambem aqui — a conferencia so aceita ser concluida uma vez.
      if (conf.status !== 'ABERTO') {
        return res.status(400).json({ error: `Conferência não está aberta (status atual: ${conf.status})` });
      }

      const todosItens = await dbAll(db,
        `SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND quantidade_contada IS NOT NULL`,
        [req.params.id]);

      // RN-05: divergencia acima da tolerancia sem recontagem bloqueia a conclusao INTEIRA — COM
      // ou SEM aplicar_ajustes (a tolerancia protege o REGISTRO, nao so o ajuste). Recontar
      // (RN-04) libera a conclusao qualquer que seja o novo valor.
      const tolerancia = toleranciaEfetiva(conf.tolerancia_percentual);
      const divergenciaPercentualDe = (item) => Math.abs(item.divergencia) / Math.max(item.quantidade_sistema, 1) * 100;
      const pendentesRecontagem = todosItens.filter((item) => divergenciaPercentualDe(item) > tolerancia && !item.recontado);
      if (pendentesRecontagem.length > 0) {
        const materialIds = pendentesRecontagem.map((i) => i.material_id);
        const materiaisPend = await dbAll(db,
          `SELECT id, codigo FROM materiais_almoxarifado WHERE id IN (${materialIds.map(() => '?').join(',')})`,
          materialIds);
        const codigoPorId = new Map(materiaisPend.map((m) => [m.id, m.codigo]));
        const lista = pendentesRecontagem
          .map((item) => `${codigoPorId.get(item.material_id)} - ${divergenciaPercentualDe(item).toFixed(2)}% (limite ${tolerancia}%)`)
          .join('; ');
        return res.status(400).json({ error: `Recontagem necessária antes de concluir: ${lista}` });
      }

      const ajustes = todosItens.filter((i) => i.divergencia !== 0);
      let impactoFinanceiro = 0;
      let ajustesAplicados = 0;
      const materiaisAjustados = new Set();

      if (aplicar_ajustes && ajustes.length > 0) {
        // ── Pré-validação: SÓ LEITURA. Nenhum registrarMovimentacao, nenhum
        // assertAjustePermitido — tem de poder abortar tudo sem ter aplicado nada (RN-07/D3).
        const materiaisPorItem = new Map();
        const falhasPermissao = [];
        const falhasRetencao = [];
        for (const item of ajustes) {
          const material = await dbGet(db, `SELECT * FROM materiais_almoxarifado WHERE id = ?`, [item.material_id]);
          materiaisPorItem.set(item.id, material);

          // Achado da revisao final de branch: o motor recusa material.ativo=0
          // ("Material inativo não pode ser movimentado", stockService.js) de forma
          // DETERMINISTICA na aplicacao real — sem espelhar isso aqui, um material
          // desativado entre a contagem e a conclusao (ex.: descontinuado no meio do
          // inventario) passava a pre-validacao e so quebrava o tudo-ou-nada na hora de
          // aplicar de verdade, com outros itens ja gravados. Mesma mensagem literal do motor.
          if (!material.ativo) {
            falhasRetencao.push(`${material.codigo}: Material inativo não pode ser movimentado`);
            continue;
          }

          if (material.proprietario_cliente_id && !can(req.user, 'ajustar_material_cliente')) {
            // Checagem LEVE — de propósito NÃO chama ownerRules.assertAjustePermitido aqui: essa
            // função audita como efeito colateral, e chamá-la na pré-validação gravaria
            // auditoria duplicada quando a aplicação real rodar (achado da Fase 2).
            const dono = await dbGet(db, `SELECT razao_social FROM clientes WHERE id = ?`, [material.proprietario_cliente_id]);
            const donoNome = dono?.razao_social || `cliente #${material.proprietario_cliente_id}`;
            falhasPermissao.push(`${material.codigo} (${donoNome})`);
            continue;
          }

          // RN-06c: o total mandado ao motor é o contado MAIS o que está retido em terceiros —
          // `quantidade_sistema` já descontou essa retenção (Etapa 8b), reconstituir sem somar
          // de volta apagaria o material que está no galvanizador. Fecha B3.
          const novoTotal = item.quantidade_contada + (material.quantidade_em_terceiros || 0);
          const motivoRetencao = stockService.motivoRecusaAjustePorRetencao(material, novoTotal);
          if (motivoRetencao) falhasRetencao.push(`${material.codigo}: ${motivoRetencao}`);
        }

        // RN-07: prioridade — se ALGUM item bloqueia por falta de `ajustar_material_cliente`, a
        // resposta INTEIRA é 403, ignorando as falhas de retenção nesta mesma resposta.
        if (falhasPermissao.length > 0) {
          return res.status(403).json({
            error: 'Ajuste bloqueado — os seguintes materiais são de cliente e exigem a permissão '
              + `"ajustar_material_cliente": ${falhasPermissao.join(', ')}`,
          });
        }
        if (falhasRetencao.length > 0) {
          return res.status(400).json({ error: `Ajuste bloqueado: ${falhasRetencao.join('; ')}` });
        }

        // ── Aplicação real, SEQUENCIAL — a pré-validação já rodou a mesma
        // motivoRecusaAjustePorRetencao; se o motor recusar mesmo assim é corrida entre as duas
        // passadas (limitação conhecida, ver comentário da rota acima).
        for (const item of ajustes) {
          const material = materiaisPorItem.get(item.id);
          const quantidadeAbsoluta = item.quantidade_contada + (material.quantidade_em_terceiros || 0);
          await stockService.registrarMovimentacao(db, req.user, {
            material_id: item.material_id,
            tipo: 'AJUSTE_INVENTARIO',
            quantidade: quantidadeAbsoluta,
            motivo: `Ajuste de conferência ${conf.numero}`,
            referencia: conf.numero,
            justificativa: justificativa_ajuste,
          });
          await dbRun(db, `UPDATE itens_conferencia_almoxarifado SET ajustado = 1 WHERE id = ?`, [item.id]);

          // D8: impacto financeiro de graça, reusando a fonte única de custo (custoSql.js) — a
          // mesma regra que proíbe reescrever a fórmula de retenção vale para custo (achado da
          // Etapa 8c: 3 respostas diferentes para "quanto vale uma unidade" já causou dashboard e
          // relatório divergirem).
          const custoRow = await dbGet(db,
            `SELECT ${custoUnitarioSql()} AS custo FROM materiais_almoxarifado WHERE id = ?`, [item.material_id]);
          impactoFinanceiro += Math.abs(item.divergencia) * (custoRow?.custo || 0);
          ajustesAplicados += 1;
          materiaisAjustados.add(item.material_id);
        }
      }

      await dbRun(db, `UPDATE conferencias_almoxarifado
              SET status = 'CONCLUIDO', data_fim = CURRENT_TIMESTAMP, justificativa_ajuste = ?
              WHERE id = ?`, [aplicar_ajustes ? justificativa_ajuste : conf.justificativa_ajuste, req.params.id]);

      await Promise.all([...materiaisAjustados].map((mid) => alertService.verificarAlertaPorMaterialId(db, mid).catch(() => null)));

      res.json({ success: true, ajustesAplicados, impactoFinanceiro });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // DELETE /api/almoxarifado/conferencias/:id — cancelar conferência
  app.put('/api/almoxarifado/conferencias/:id/cancelar', requirePermission('inventario'), (req, res) => {
    db.run(`UPDATE conferencias_almoxarifado SET status = 'CANCELADO' WHERE id = ? AND status = 'ABERTO'`,
      [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(400).json({ error: 'Só é possível cancelar conferências abertas' });
        res.json({ success: true });
      });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // RELATÓRIOS
  // ════════════════════════════════════════════════════════════════════════════

  // GET /api/almoxarifado/relatorio/posicao-estoque
  app.get('/api/almoxarifado/relatorio/posicao-estoque',(req, res) => {
    // Etapa 8, Task 1 (classe A): esta e a rota que o teste `posicao de estoque proprio exclui
    // material de cliente` (spec 13) nomeia — e tambem NAO estava na contagem de 19 da spec de
    // design. Sem o filtro, o relatorio de posicao somaria valor_total de patrimonio de
    // terceiro. A posicao POR CLIENTE tem rota propria (Task 8).
    // `valorEstoqueSql` (tarefa extra da 8c): mesmo motivo do dashboard acima — esta rota e a
    // gemea de reportService.relatorioEstoqueAtual (servida em relatorios/estoque-atual) e as
    // duas davam numeros diferentes para o mesmo material.
    db.all(`SELECT *, ${valorEstoqueSql()} as valor_total
            FROM materiais_almoxarifado
            WHERE ativo = 1 AND proprietario_cliente_id IS NULL
            ORDER BY categoria, nome`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // GET /api/almoxarifado/relatorio/movimentacoes-periodo
  app.get('/api/almoxarifado/relatorio/movimentacoes-periodo',(req, res) => {
    const { data_inicio, data_fim } = req.query;
    db.all(`SELECT m.*, ma.nome as material_nome, ma.codigo as material_codigo, ma.unidade, ma.categoria
            FROM movimentacoes_almoxarifado m
            JOIN materiais_almoxarifado ma ON m.material_id = ma.id
            WHERE DATE(m.created_at) BETWEEN ? AND ?
            ORDER BY m.created_at DESC`,
      [data_inicio, data_fim], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // NOVAS TABELAS — Requisições, Tipos, Localizações, Configurações
  // ════════════════════════════════════════════════════════════════════════════

  // Adicionar coluna tipo_material_id na tabela materiais (se não existir)
  db.run(`ALTER TABLE materiais_almoxarifado ADD COLUMN tipo_material_id INTEGER REFERENCES tipos_material_almoxarifado(id)`, () => {});
  db.run(`ALTER TABLE materiais_almoxarifado ADD COLUMN ponto_pedido REAL DEFAULT 0`, () => {});
  db.run(`ALTER TABLE materiais_almoxarifado ADD COLUMN prazo_reposicao_dias INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE localizacoes_almoxarifado ADD COLUMN tipo TEXT DEFAULT 'Almoxarifado'`, () => {});
  db.run(`ALTER TABLE localizacoes_almoxarifado ADD COLUMN parent_id INTEGER`, () => {});
  db.run(`ALTER TABLE itens_requisicao_almoxarifado ADD COLUMN quantidade_separada REAL DEFAULT 0`, () => {});
  db.run(`ALTER TABLE itens_requisicao_almoxarifado ADD COLUMN quantidade_entregue REAL DEFAULT 0`, () => {});
  db.run(`ALTER TABLE requisicoes_almoxarifado ADD COLUMN ativo INTEGER DEFAULT 1`, () => {});
  db.run(`ALTER TABLE requisicoes_almoxarifado ADD COLUMN ultimo_lembrete_enviado DATETIME`, () => {});
  db.run(`ALTER TABLE requisicoes_almoxarifado ADD COLUMN valor_total REAL DEFAULT 0`, () => {});
  db.run(`ALTER TABLE requisicoes_almoxarifado ADD COLUMN requer_aprovacao_valor INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE requisicoes_almoxarifado ADD COLUMN aprovador_valor_id INTEGER`, () => {});
  db.run(`ALTER TABLE requisicoes_almoxarifado ADD COLUMN aprovador_valor_nome TEXT`, () => {});
  db.run(`ALTER TABLE requisicoes_almoxarifado ADD COLUMN data_aprovacao_valor DATETIME`, () => {});
  db.run(`ALTER TABLE requisicoes_almoxarifado ADD COLUMN rejeicao_valor_motivo TEXT`, () => {});
  db.run(`ALTER TABLE localizacoes_almoxarifado ADD COLUMN pos_x REAL`, () => {});
  db.run(`ALTER TABLE localizacoes_almoxarifado ADD COLUMN pos_y REAL`, () => {});
  db.run(`ALTER TABLE localizacoes_almoxarifado ADD COLUMN largura REAL DEFAULT 120`, () => {});
  db.run(`ALTER TABLE localizacoes_almoxarifado ADD COLUMN altura REAL DEFAULT 80`, () => {});
  db.run(`ALTER TABLE localizacoes_almoxarifado ADD COLUMN subgrupo TEXT`, () => {});
  db.run(`ALTER TABLE materiais_almoxarifado ADD COLUMN familia_id INTEGER REFERENCES familias_material_almoxarifado(id)`, () => {});

  // ════════════════════════════════════════════════════════════════════════════
  // TIPOS DE MATERIAL
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/almoxarifado/tipos-material',(req, res) => {
    db.all(`SELECT * FROM tipos_material_almoxarifado WHERE ativo = 1 ORDER BY nome`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  app.post('/api/almoxarifado/tipos-material',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { nome, descricao, icone, cor, requer_assinatura, requer_termo, is_epi, is_controlado } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });
    db.run(`INSERT INTO tipos_material_almoxarifado (nome, descricao, icone, cor, requer_assinatura, requer_termo, is_epi, is_controlado)
            VALUES (?,?,?,?,?,?,?,?)`,
      [nome, descricao || null, icone || '📦', cor || '#4facfe',
       requer_assinatura ? 1 : 0, requer_termo ? 1 : 0, is_epi ? 1 : 0, is_controlado ? 1 : 0],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get(`SELECT * FROM tipos_material_almoxarifado WHERE id = ?`, [this.lastID], (e, r) => res.status(201).json(r));
      });
  });

  app.put('/api/almoxarifado/tipos-material/:id',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { nome, descricao, icone, cor, requer_assinatura, requer_termo, is_epi, is_controlado, ativo } = req.body;
    db.run(`UPDATE tipos_material_almoxarifado SET nome=?, descricao=?, icone=?, cor=?, requer_assinatura=?, requer_termo=?, is_epi=?, is_controlado=?, ativo=? WHERE id=?`,
      [nome, descricao || null, icone || '📦', cor || '#4facfe',
       requer_assinatura ? 1 : 0, requer_termo ? 1 : 0, is_epi ? 1 : 0, is_controlado ? 1 : 0,
       ativo !== undefined ? ativo : 1, req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get(`SELECT * FROM tipos_material_almoxarifado WHERE id = ?`, [req.params.id], (e, r) => res.json(r));
      });
  });

  app.delete('/api/almoxarifado/tipos-material/:id',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    db.run(`UPDATE tipos_material_almoxarifado SET ativo = 0 WHERE id = ?`, [req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // LOCALIZAÇÕES
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/almoxarifado/localizacoes',(req, res) => {
    let sql = `SELECT l.*, a.codigo as almoxarifado_codigo, p.codigo as parent_codigo
               FROM localizacoes_almoxarifado l
               LEFT JOIN almoxarifados a ON l.almoxarifado_id = a.id
               LEFT JOIN localizacoes_almoxarifado p ON l.parent_id = p.id
               WHERE l.ativo = 1`;
    const params = [];
    if (req.query.almoxarifado_id) {
      sql += ' AND l.almoxarifado_id = ?';
      params.push(req.query.almoxarifado_id);
    }
    sql += ` ORDER BY l.setor, l.parent_id, l.subgrupo, l.codigo`;
    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      // Build endereco_completo: almoxarifado.codigo + setor + parent.codigo + codigo
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
    });
  });

  // tipos_material_permitidos chega do cliente como array de strings (ou ausente/null = sem
  // restrição); persistido como JSON. Array vazio ([]) tem a MESMA semântica de ausente/null —
  // "sem restrição" (definição de produto: lista vazia não significa "nenhum tipo permitido") —
  // por isso normaliza para NULL em vez de gravar "[]" (achado do review). Qualquer outra forma
  // (string solta, objeto, etc.) também é tratada como "sem restrição" em vez de quebrar a gravação.
  function serializeTiposPermitidos(value) {
    if (!Array.isArray(value) || value.length === 0) return null;
    return JSON.stringify(value);
  }

  app.post('/api/almoxarifado/localizacoes',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { codigo, descricao, setor, subgrupo, tipo, parent_id, pos_x, pos_y, largura, altura, almoxarifado_id, bloqueada, tipos_material_permitidos } = req.body;
    if (!codigo) return res.status(400).json({ error: 'Código obrigatório' });
    const subgrupoVal = subgrupo ? String(subgrupo).trim() || null : null;
    const parentVal = parent_id ? parseInt(parent_id, 10) : null;
    const bloqueadaVal = bloqueada ? 1 : 0;
    const tiposPermitidosVal = serializeTiposPermitidos(tipos_material_permitidos);
    resolveAlmoxarifadoId(almoxarifado_id, (_rErr, almoxarifadoIdVal) => {
      checkSubgrupoDuplicado(db, { subgrupo: subgrupoVal, setor, parent_id: parentVal }, (dupErr, isDup) => {
        if (dupErr) return res.status(500).json({ error: dupErr.message });
        if (isDup) return res.status(400).json({ error: 'Subgrupo já existe neste setor e localização pai' });

        // O código tem constraint UNIQUE, mas a exclusão é "soft" (ativo = 0): a linha
        // permanece e continua ocupando o código. Para não bloquear a recriação de um
        // código que foi excluído, reativamos/reescrevemos a linha inativa existente.
        db.get(`SELECT id, ativo FROM localizacoes_almoxarifado WHERE codigo = ?`, [codigo], (selErr, existente) => {
          if (selErr) return res.status(500).json({ error: selErr.message });

          // Já existe uma localização ATIVA com este código → realmente duplicado.
          if (existente && existente.ativo) {
            return res.status(400).json({ error: 'Código já existe' });
          }

          // Existe uma localização EXCLUÍDA com este código → reativa e atualiza os dados.
          if (existente) {
            db.run(`UPDATE localizacoes_almoxarifado
                    SET descricao=?, setor=?, subgrupo=?, tipo=?, parent_id=?, pos_x=?, pos_y=?, largura=?, altura=?, almoxarifado_id=?, bloqueada=?, tipos_material_permitidos=?, ativo=1
                    WHERE id=?`,
              [descricao || null, setor || null, subgrupoVal, tipo || 'Almoxarifado', parentVal,
               pos_x ?? null, pos_y ?? null, largura ?? 120, altura ?? 80, almoxarifadoIdVal,
               bloqueadaVal, tiposPermitidosVal, existente.id],
              function (updErr) {
                if (updErr) return res.status(500).json({ error: updErr.message });
                db.get(`SELECT * FROM localizacoes_almoxarifado WHERE id = ?`, [existente.id], (e, r) => res.status(201).json(r));
              });
            return;
          }

          // Código livre → insere normalmente.
          db.run(`INSERT INTO localizacoes_almoxarifado (codigo, descricao, setor, subgrupo, tipo, parent_id, pos_x, pos_y, largura, altura, almoxarifado_id, bloqueada, tipos_material_permitidos) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [codigo, descricao || null, setor || null, subgrupoVal, tipo || 'Almoxarifado', parentVal,
             pos_x ?? null, pos_y ?? null, largura ?? 120, altura ?? 80, almoxarifadoIdVal,
             bloqueadaVal, tiposPermitidosVal],
            function (err) {
              if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Código já existe' });
                return res.status(500).json({ error: err.message });
              }
              db.get(`SELECT * FROM localizacoes_almoxarifado WHERE id = ?`, [this.lastID], (e, r) => res.status(201).json(r));
            });
        });
      });
    });
  });

  app.put('/api/almoxarifado/localizacoes/:id',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { codigo, descricao, setor, subgrupo, tipo, parent_id, pos_x, pos_y, largura, altura, ativo, almoxarifado_id, bloqueada, tipos_material_permitidos } = req.body;
    const subgrupoVal = subgrupo ? String(subgrupo).trim() || null : null;
    const parentVal = parent_id ? parseInt(parent_id, 10) : null;
    if (parentVal && parseInt(req.params.id, 10) === parentVal) {
      return res.status(400).json({ error: 'Uma localização não pode ser pai de si mesma' });
    }
    // almoxarifado_id é o ÚNICO campo deste PUT full-replace com semântica "preserva quando
    // omitido" via COALESCE puro: a UI hoje (ConfiguracoesAlmoxarifado.js "Editar"/"Mover") ainda
    // não conhece esse campo e manda o body sem ele — se tratássemos ausência/null como "resetar
    // para ALM-GERAL" (como no POST), qualquer edição feita pela tela atual reverteria
    // silenciosamente o vínculo. Por isso: undefined OU null preservam o valor já gravado; só um
    // valor numérico presente no body troca o vínculo.
    const almoxarifadoIdParam = (almoxarifado_id === undefined || almoxarifado_id === null)
      ? null
      : (parseInt(almoxarifado_id, 10) || null);

    // bloqueada e tipos_material_permitidos: mesma UI (handleSalvarEdit/handleMoverConfirm em
    // ConfiguracoesAlmoxarifado.js) ainda não manda esses campos em edições/movimentações comuns
    // — um full-replace ingênuo colapsaria undefined→0/null e apagaria silenciosamente qualquer
    // bloqueio/restrição já configurado a cada edição (achado do review). Diferente de
    // almoxarifado_id, aqui um `null`/`[]` EXPLÍCITO precisa poder LIMPAR o valor (não só
    // "trocar por outro"), então COALESCE puro não serve — computamos em JS lendo a linha atual:
    // omitido (undefined) preserva; presente (incluindo null/[]) substitui/limpa normalmente.
    db.get(`SELECT bloqueada, tipos_material_permitidos FROM localizacoes_almoxarifado WHERE id = ?`,
      [req.params.id], (curErr, current) => {
        if (curErr) return res.status(500).json({ error: curErr.message });
        if (!current) return res.status(404).json({ error: 'Localização não encontrada' });

        const bloqueadaFinal = bloqueada === undefined ? (current.bloqueada ? 1 : 0) : (bloqueada ? 1 : 0);
        const tiposFinal = tipos_material_permitidos === undefined
          ? current.tipos_material_permitidos
          : serializeTiposPermitidos(tipos_material_permitidos);

        checkSubgrupoDuplicado(db, { subgrupo: subgrupoVal, setor, parent_id: parentVal, excludeId: req.params.id }, (dupErr, isDup) => {
          if (dupErr) return res.status(500).json({ error: dupErr.message });
          if (isDup) return res.status(400).json({ error: 'Subgrupo já existe neste setor e localização pai' });
          db.run(`UPDATE localizacoes_almoxarifado SET codigo=?, descricao=?, setor=?, subgrupo=?, tipo=?, parent_id=?, pos_x=?, pos_y=?, largura=?, altura=?, almoxarifado_id=COALESCE(?, almoxarifado_id), bloqueada=?, tipos_material_permitidos=?, ativo=? WHERE id=?`,
            [codigo, descricao || null, setor || null, subgrupoVal, tipo || 'Almoxarifado', parentVal,
             pos_x ?? null, pos_y ?? null, largura ?? 120, altura ?? 80, almoxarifadoIdParam,
             bloqueadaFinal, tiposFinal,
             ativo !== undefined ? ativo : 1, req.params.id],
            function (err) {
              if (err) return res.status(500).json({ error: err.message });
              db.get(`SELECT * FROM localizacoes_almoxarifado WHERE id = ?`, [req.params.id], (e, r) => res.json(r));
            });
        });
      });
  });

  app.delete('/api/almoxarifado/localizacoes/:id',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    // Checa EXISTÊNCIA de saldo não-zero por linha, não a SOMA agregada: SUM pode dar zero com
    // +10 de um material e -10 de outro na mesma localização, escondendo saldo real e permitindo
    // apagar uma localização que ainda tem estoque físico registrado (achado do review).
    db.get(`SELECT 1 as tem FROM estoque_saldo_almoxarifado WHERE localizacao_id = ? AND quantidade != 0 LIMIT 1`,
      [req.params.id], (saldoErr, row) => {
        if (saldoErr) return res.status(500).json({ error: saldoErr.message });
        if (row) {
          return res.status(400).json({ error: 'Não é possível remover: localização possui saldo' });
        }
        db.run(`UPDATE localizacoes_almoxarifado SET ativo = 0 WHERE id = ?`, [req.params.id], function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true });
        });
      });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // SETORES E ÁREAS
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/almoxarifado/setores',(req, res) => {
    const { all } = req.query;
    let sql = `SELECT s.*,
                 (SELECT COUNT(*) FROM localizacoes_almoxarifado l
                  WHERE l.ativo = 1 AND l.setor = s.nome) as qtd_localizacoes
               FROM setores_almoxarifado s WHERE 1=1`;
    if (all !== '1') sql += ' AND s.ativo = 1';
    sql += ' ORDER BY s.ordem ASC, s.nome ASC';

    db.all(sql, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  app.post('/api/almoxarifado/setores',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { nome, codigo_prefixo, tipo, ordem } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    if (!codigo_prefixo?.trim()) return res.status(400).json({ error: 'Prefixo do código é obrigatório' });
    const tipoVal = ['corredor', 'area', 'bancada'].includes(tipo) ? tipo : 'area';
    const prefixo = String(codigo_prefixo).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!prefixo) return res.status(400).json({ error: 'Prefixo do código inválido' });

    db.run(`INSERT INTO setores_almoxarifado (nome, codigo_prefixo, tipo, ordem) VALUES (?,?,?,?)`,
      [nome.trim(), prefixo, tipoVal, parseInt(ordem, 10) || 0],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Já existe um setor com este nome' });
          return res.status(500).json({ error: err.message });
        }
        db.get(`SELECT s.*,
                  (SELECT COUNT(*) FROM localizacoes_almoxarifado l
                   WHERE l.ativo = 1 AND l.setor = s.nome) as qtd_localizacoes
                FROM setores_almoxarifado s WHERE s.id = ?`,
          [this.lastID], (e, r) => res.status(201).json(r));
      });
  });

  app.put('/api/almoxarifado/setores/:id',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { nome, codigo_prefixo, tipo, ordem, ativo } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    if (!codigo_prefixo?.trim()) return res.status(400).json({ error: 'Prefixo do código é obrigatório' });
    const tipoVal = ['corredor', 'area', 'bancada'].includes(tipo) ? tipo : 'area';
    const prefixo = String(codigo_prefixo).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!prefixo) return res.status(400).json({ error: 'Prefixo do código inválido' });

    db.get('SELECT nome FROM setores_almoxarifado WHERE id = ?', [req.params.id], (err, atual) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!atual) return res.status(404).json({ error: 'Setor não encontrado' });

      const updateSetor = () => {
        db.run(`UPDATE setores_almoxarifado SET nome=?, codigo_prefixo=?, tipo=?, ordem=?, ativo=? WHERE id=?`,
          [nome.trim(), prefixo, tipoVal, parseInt(ordem, 10) || 0, ativo !== undefined ? (ativo ? 1 : 0) : 1, req.params.id],
          function (upErr) {
            if (upErr) {
              if (upErr.message.includes('UNIQUE')) return res.status(400).json({ error: 'Já existe um setor com este nome' });
              return res.status(500).json({ error: upErr.message });
            }
            if (atual.nome !== nome.trim()) {
              db.run('UPDATE localizacoes_almoxarifado SET setor = ? WHERE setor = ? AND ativo = 1',
                [nome.trim(), atual.nome], () => {});
            }
            db.get(`SELECT s.*,
                      (SELECT COUNT(*) FROM localizacoes_almoxarifado l
                       WHERE l.ativo = 1 AND l.setor = s.nome) as qtd_localizacoes
                    FROM setores_almoxarifado s WHERE s.id = ?`,
              [req.params.id], (e, r) => res.json(r));
          });
      };

      if (ativo === 0 || ativo === false) {
        db.get(`SELECT COUNT(*) as c FROM localizacoes_almoxarifado WHERE ativo = 1 AND setor = ?`,
          [atual.nome], (cErr, row) => {
            if (cErr) return res.status(500).json({ error: cErr.message });
            if (row.c > 0) {
              return res.status(400).json({
                error: `Não é possível inativar: ${row.c} localização(ões) ativa(s) usam este setor`,
              });
            }
            updateSetor();
          });
      } else {
        updateSetor();
      }
    });
  });

  app.delete('/api/almoxarifado/setores/:id',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    db.get('SELECT nome FROM setores_almoxarifado WHERE id = ?', [req.params.id], (err, setor) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!setor) return res.status(404).json({ error: 'Setor não encontrado' });

      db.get(`SELECT COUNT(*) as c FROM localizacoes_almoxarifado WHERE ativo = 1 AND setor = ?`,
        [setor.nome], (cErr, row) => {
          if (cErr) return res.status(500).json({ error: cErr.message });
          if (row.c > 0) {
            return res.status(400).json({
              error: `Não é possível excluir: ${row.c} localização(ões) ativa(s) usam este setor`,
            });
          }
          db.run('UPDATE setores_almoxarifado SET ativo = 0 WHERE id = ?', [req.params.id], function (delErr) {
            if (delErr) return res.status(500).json({ error: delErr.message });
            res.json({ success: true });
          });
        });
    });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // FAMÍLIAS DE MATERIAL
  // ════════════════════════════════════════════════════════════════════════════

  function generateFamiliaCodigo(nome, callback) {
    const words = String(nome || '').trim().split(/\s+/).filter(Boolean);
    let base = words.length >= 2
      ? (words[0].slice(0, 2) + words[1].slice(0, 1)).toUpperCase()
      : String(nome || 'FAM').slice(0, 3).toUpperCase();
    base = base.replace(/[^A-Z0-9]/g, '') || 'FAM';

    const tryCodigo = (suffix) => {
      const codigo = suffix ? `${base}${suffix}` : base;
      db.get('SELECT id FROM familias_material_almoxarifado WHERE codigo = ?', [codigo], (err, row) => {
        if (err) return callback(err);
        if (row) return tryCodigo(suffix ? suffix + 1 : 1);
        callback(null, codigo);
      });
    };
    tryCodigo(0);
  }

  // Subfamílias (Etapa 2, Task 3): valida o pai informado em POST/PUT de família.
  // Regras: pai deve existir (senão 400 genérico), estar ativo e ser RAIZ (parent_id IS
  // NULL) — subfamília não pode ter filhos (máximo 2 níveis). Os dois casos de "pai
  // inválido" (inativo / já é subfamília) compartilham a mesma mensagem de erro.
  function validateParentFamilia(parentId, callback) {
    if (!parentId) return callback(null, null);
    db.get('SELECT id, ativo, parent_id FROM familias_material_almoxarifado WHERE id = ?', [parentId], (err, row) => {
      if (err) return callback(err);
      if (!row) return callback(new Error('Família pai não encontrada'));
      if (row.ativo !== 1 || row.parent_id !== null) {
        return callback(new Error('Subfamília não pode ter filhos (máximo 2 níveis)'));
      }
      callback(null, row);
    });
  }

  app.get('/api/almoxarifado/familias',(req, res) => {
    const { ativo } = req.query;
    let sql = `SELECT f.*, p.nome as parent_nome,
                 (SELECT COUNT(*) FROM materiais_almoxarifado m WHERE m.familia_id = f.id AND m.ativo = 1) as qtd_itens
               FROM familias_material_almoxarifado f
               LEFT JOIN familias_material_almoxarifado p ON f.parent_id = p.id
               WHERE 1=1`;
    const params = [];
    if (ativo === '0') { sql += ' AND f.ativo = 0'; }
    else if (ativo !== 'all') { sql += ' AND f.ativo = 1'; }
    sql += ' ORDER BY f.nome ASC';

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  app.get('/api/almoxarifado/familias/:id',(req, res) => {
    db.get(`SELECT f.*, p.nome as parent_nome,
              (SELECT COUNT(*) FROM materiais_almoxarifado m WHERE m.familia_id = f.id AND m.ativo = 1) as qtd_itens
            FROM familias_material_almoxarifado f
            LEFT JOIN familias_material_almoxarifado p ON f.parent_id = p.id
            WHERE f.id = ?`, [req.params.id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Família não encontrada' });
      res.json(row);
    });
  });

  app.get('/api/almoxarifado/familias/:id/itens',(req, res) => {
    db.all(`SELECT m.*, f.nome as familia_nome, f.codigo as familia_codigo,
                   a.codigo as almoxarifado_codigo, a.nome as almoxarifado_nome
            FROM materiais_almoxarifado m
            LEFT JOIN familias_material_almoxarifado f ON m.familia_id = f.id
            LEFT JOIN localizacoes_almoxarifado l ON m.localizacao_padrao_id = l.id
            LEFT JOIN almoxarifados a ON l.almoxarifado_id = a.id
            WHERE m.familia_id = ? AND m.ativo = 1
            ORDER BY m.nome ASC`,
      [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
  });

  app.post('/api/almoxarifado/familias',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { nome, descricao, categoria_id, codigo, tipo_uso, parent_id } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    const tipoUsoVal = ['administrativo', 'industrial', 'ambos'].includes(tipo_uso) ? tipo_uso : 'ambos';
    const parentId = parent_id ? parseInt(parent_id, 10) : null;

    const insertFamilia = (codigoVal) => {
      db.run(`INSERT INTO familias_material_almoxarifado (codigo, nome, descricao, categoria_id, tipo_uso, parent_id)
              VALUES (?,?,?,?,?,?)`,
        [codigoVal, nome.trim(), descricao || null, categoria_id || null, tipoUsoVal, parentId],
        function (err) {
          if (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Código já existe' });
            return res.status(500).json({ error: err.message });
          }
          db.get('SELECT * FROM familias_material_almoxarifado WHERE id = ?', [this.lastID], (e, r) => res.status(201).json(r));
        });
    };

    const proceed = () => {
      if (codigo?.trim()) {
        insertFamilia(codigo.trim().toUpperCase());
      } else {
        generateFamiliaCodigo(nome, (err, autoCodigo) => {
          if (err) return res.status(500).json({ error: err.message });
          insertFamilia(autoCodigo);
        });
      }
    };

    if (parentId) {
      validateParentFamilia(parentId, (errParent) => {
        if (errParent) return res.status(400).json({ error: errParent.message });
        proceed();
      });
    } else {
      proceed();
    }
  });

  app.put('/api/almoxarifado/familias/:id',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { nome, descricao, categoria_id, ativo, tipo_uso, parent_id } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    const tipoUsoVal = ['administrativo', 'industrial', 'ambos'].includes(tipo_uso) ? tipo_uso : 'ambos';
    const familiaId = parseInt(req.params.id, 10);

    // Fix (review pós-Task 3, mesma classe do T2; ampliado no review final da Etapa 2): a aba
    // Famílias de ConfiguracoesAlmoxarifado.js manda PUT só com {nome, descricao, tipo_uso} —
    // sem parent_id, ativo ou categoria_id. Sem esta leitura prévia, os campos omitidos
    // colapsavam para o default do handler: `parent_id` ausente virava NULL (convertendo
    // silenciosamente uma subfamília em raiz), `ativo` ausente virava 1 (reativando uma família
    // inativada) e `categoria_id` ausente virava NULL (apagando o vínculo com a categoria).
    // Qualquer campo AUSENTE (undefined) preserva o valor atual; qualquer valor informado —
    // incluindo `null` explícito, `0` ou `''` — substitui.
    db.get('SELECT parent_id, ativo, categoria_id FROM familias_material_almoxarifado WHERE id = ?', [familiaId], (errCurrent, current) => {
      if (errCurrent) return res.status(500).json({ error: errCurrent.message });
      if (!current) return res.status(404).json({ error: 'Família não encontrada' });

      const parentIdOmitted = parent_id === undefined;
      const parentId = parentIdOmitted ? current.parent_id : (parent_id ? parseInt(parent_id, 10) : null);
      const ativoVal = ativo === undefined ? current.ativo : ativo;
      const categoriaIdVal = categoria_id === undefined ? current.categoria_id : (categoria_id || null);

      if (parentId && parentId === familiaId) {
        return res.status(400).json({ error: 'Família não pode ser pai de si mesma' });
      }

      const applyUpdate = () => {
        db.run(`UPDATE familias_material_almoxarifado SET nome=?, descricao=?, categoria_id=?, tipo_uso=?, ativo=?, parent_id=? WHERE id=?`,
          [nome.trim(), descricao || null, categoriaIdVal, tipoUsoVal, ativoVal, parentId, familiaId],
          function (err) {
            if (err) return res.status(500).json({ error: err.message });
            db.get('SELECT * FROM familias_material_almoxarifado WHERE id = ?', [familiaId], (e, r) => res.json(r));
          });
      };

      // Subfamílias ativas da família sendo editada (só existem se ela for raiz — subfamília
      // não pode ter filhos). Usadas para bloquear (a) virar subfamília de outra família e
      // (b) ser inativada enquanto ainda tem filhas ativas.
      db.get('SELECT COUNT(*) as c FROM familias_material_almoxarifado WHERE parent_id = ? AND ativo = 1', [familiaId], (errChildren, childrenRow) => {
        if (errChildren) return res.status(500).json({ error: errChildren.message });
        const hasActiveChildren = childrenRow.c > 0;

        if (Number(ativoVal) === 0 && hasActiveChildren) {
          return res.status(400).json({ error: 'Não é possível inativar: família possui subfamília(s) ativa(s)' });
        }
        if (parentId && hasActiveChildren) {
          return res.status(400).json({ error: 'Família com subfamília(s) ativa(s) não pode virar subfamília' });
        }

        // Só revalida a hierarquia do pai quando o valor é NOVO (informado explicitamente).
        // Um parent_id preservado (omitido → veio do current) já era válido quando foi
        // setado; revalidar quebraria a edição de uma subfamília cujo pai foi inativado
        // depois (ex.: renomear a subfamília não deveria falhar por causa disso).
        if (parentId && !parentIdOmitted) {
          validateParentFamilia(parentId, (errParent) => {
            if (errParent) return res.status(400).json({ error: errParent.message });
            applyUpdate();
          });
        } else {
          applyUpdate();
        }
      });
    });
  });

  app.delete('/api/almoxarifado/familias/:id',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    db.get('SELECT COUNT(*) as c FROM materiais_almoxarifado WHERE familia_id = ? AND ativo = 1', [req.params.id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row.c > 0) {
        return res.status(400).json({ error: `Não é possível remover: família possui ${row.c} item(ns) ativo(s)` });
      }
      db.get('SELECT COUNT(*) as c FROM familias_material_almoxarifado WHERE parent_id = ? AND ativo = 1', [req.params.id], (errSub, subRow) => {
        if (errSub) return res.status(500).json({ error: errSub.message });
        if (subRow.c > 0) {
          return res.status(400).json({ error: `Não é possível remover: família possui ${subRow.c} subfamília(s) ativa(s)` });
        }
        db.run('UPDATE familias_material_almoxarifado SET ativo = 0 WHERE id = ?', [req.params.id], function (err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ success: true });
        });
      });
    });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES (admin only)
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/almoxarifado/configuracoes', authenticateToken, (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    db.all(`SELECT * FROM configuracoes_almoxarifado ORDER BY chave`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const obj = {};
      rows.forEach(r => { obj[r.chave] = { valor: r.valor, descricao: r.descricao, id: r.id }; });
      res.json(obj);
    });
  });

  // Corpo esperado: { chave: valor, ... } achatado — o mesmo formato que o GET acima devolve.
  //
  // A rota GRAVA APENAS CHAVE QUE JÁ EXISTE (semeada em schema.js). Antes era
  // `INSERT ... ON CONFLICT DO UPDATE`, e o INSERT era o problema: qualquer chave inventada
  // virava linha nova em silêncio, com HTTP 200 e toast de sucesso. Foi exatamente assim que a
  // tela de Configurações Gerais passou a gravar `permitir_saida_saldo_negativo` enquanto o
  // motor de estoque lia `permite_saldo_negativo_global` — o administrador ligava a opção,
  // recebia "Configurações salvas!", e continuava tomando recusa por saldo insuficiente.
  // Com UPDATE puro, divergência de chave vira 400 na cara de quem introduziu.
  // Quem precisa de chave nova cria a linha no seed, que é onde o valor padrão e a descrição
  // moram — não pelo formulário.
  app.put('/api/almoxarifado/configuracoes', authenticateToken, async (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const configs = req.body; // { chave: valor, ... }
    if (!configs || typeof configs !== 'object' || Array.isArray(configs)) {
      return res.status(400).json({ error: 'Corpo inválido — esperado um objeto { chave: valor }' });
    }
    const entradas = Object.entries(configs);
    if (!entradas.length) return res.status(400).json({ error: 'Nenhuma configuração informada' });
    try {
      // Valida TODAS antes de gravar QUALQUER uma: sem transação neste módulo, rejeitar no meio
      // do laço deixaria metade do formulário aplicada e a outra metade não.
      const existentes = await dbAll(db, `SELECT chave FROM configuracoes_almoxarifado`);
      const conhecidas = new Set(existentes.map(r => r.chave));
      const desconhecidas = entradas.map(([chave]) => chave).filter(c => !conhecidas.has(c));
      if (desconhecidas.length) {
        return res.status(400).json({ error: `Configuração desconhecida: ${desconhecidas.join(', ')}` });
      }
      for (const [chave, valor] of entradas) {
        await dbRun(db, `UPDATE configuracoes_almoxarifado
                         SET valor = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
                         WHERE chave = ?`,
          [String(valor), req.user.nome || req.user.email, chave]);
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/almoxarifado/configuracoes/alertas-estoque', authenticateToken, async (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    try {
      const [settings, reminder] = await Promise.all([
        alertService.getAlertSettingsForApi(db),
        requisitionReminderService.getReminderSettingsForApi(db),
      ]);
      res.json({ ...settings, ...reminder });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/almoxarifado/configuracoes/alertas-estoque', authenticateToken, async (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    try {
      const payload = req.body || {};
      const emails = Array.isArray(payload.emails) ? payload.emails.map(v => String(v).trim()).filter(Boolean) : [];
      const whatsappNumeros = Array.isArray(payload.whatsappNumeros) ? payload.whatsappNumeros.map(v => String(v).trim()).filter(Boolean) : [];
      const notificarEmail = payload.notificarEmail ? '1' : '0';
      const notificarWhatsapp = payload.notificarWhatsapp ? '1' : '0';
      const intervaloVerificacaoHoras = Number(payload.intervaloVerificacaoHoras) > 0 ? String(Number(payload.intervaloVerificacaoHoras)) : '4';
      const debounceSegundos = Number(payload.debounceSegundos) >= 0
        ? String(Math.min(3600, Math.floor(Number(payload.debounceSegundos))))
        : '60';
      const smtpHost = String(payload.smtpHost || '').trim();
      const smtpPort = Number(payload.smtpPort) > 0 ? String(Number(payload.smtpPort)) : '587';
      const smtpUser = String(payload.smtpUser || '').trim();
      const smtpFrom = String(payload.smtpFrom || '').trim();
      const smtpSecure = payload.smtpSecure ? '1' : '0';
      const whatsappWebhookUrl = String(payload.whatsappWebhookUrl || '').trim();
      const appUrl = String(payload.appUrl || '').trim();
      const requisicoesEmails = Array.isArray(payload.requisicoesEmails)
        ? payload.requisicoesEmails.map((v) => String(v).trim()).filter(Boolean)
        : [];
      const comprasEmails = Array.isArray(payload.comprasEmails)
        ? payload.comprasEmails.map((v) => String(v).trim()).filter(Boolean)
        : [];
      const requisicoesNotificarEmail = payload.requisicoesNotificarEmail === false ? '0' : '1';
      const requisicoesLembreteAtivo = payload.requisicoesLembreteAtivo === false ? '0' : '1';
      const requisicoesLembreteIntervaloHoras = Number(payload.requisicoesLembreteIntervaloHoras) > 0
        ? String(Math.floor(Number(payload.requisicoesLembreteIntervaloHoras)))
        : '24';
      const updatedBy = req.user.nome || req.user.email;
      const upserts = [
        ['alertas_estoque_emails', JSON.stringify(emails)],
        ['alertas_estoque_whatsapp_numeros', JSON.stringify(whatsappNumeros)],
        ['alertas_estoque_notificar_email', notificarEmail],
        ['alertas_estoque_notificar_whatsapp', notificarWhatsapp],
        ['alertas_estoque_intervalo_verificacao_horas', intervaloVerificacaoHoras],
        ['alertas_estoque_debounce_segundos', debounceSegundos],
        [alertService.APP_URL_CONFIG_KEY, appUrl || alertService.DEFAULT_APP_URL],
        [alertService.SMTP_CONFIG_KEYS.host, smtpHost],
        [alertService.SMTP_CONFIG_KEYS.port, smtpPort],
        [alertService.SMTP_CONFIG_KEYS.user, smtpUser],
        [alertService.SMTP_CONFIG_KEYS.from, smtpFrom],
        [alertService.SMTP_CONFIG_KEYS.secure, smtpSecure],
        [alertService.WHATSAPP_CONFIG_KEYS.webhookUrl, whatsappWebhookUrl],
        ['requisicoes_notificar_emails', JSON.stringify(requisicoesEmails)],
        ['requisicoes_notificar_email', requisicoesNotificarEmail],
        ['compras_notificar_emails', JSON.stringify(comprasEmails)],
        [requisitionReminderService.CONFIG_KEYS.ativo, requisicoesLembreteAtivo],
        [requisitionReminderService.CONFIG_KEYS.intervaloHoras, requisicoesLembreteIntervaloHoras],
      ];
      if (alertService.shouldUpdateSecret(payload.smtpPass)) {
        upserts.push([alertService.SMTP_CONFIG_KEYS.pass, String(payload.smtpPass)]);
      }
      if (alertService.shouldUpdateSecret(payload.whatsappApiKey)) {
        upserts.push([alertService.WHATSAPP_CONFIG_KEYS.apiKey, String(payload.whatsappApiKey)]);
      }
      const promises = upserts.map(([chave, valor]) => new Promise((resolve, reject) => {
        db.run(`INSERT INTO configuracoes_almoxarifado (chave, valor, updated_at, updated_by)
                VALUES (?, ?, CURRENT_TIMESTAMP, ?)
                ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, updated_at=CURRENT_TIMESTAMP, updated_by=excluded.updated_by`,
        [chave, valor, updatedBy], (err) => (err ? reject(err) : resolve()));
      }));
      await Promise.all(promises);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/almoxarifado/alertas-estoque/testar',async (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    try {
      const materialTeste = {
        codigo: 'TESTE-ALM',
        nome: 'Material de teste - Alertas',
        localizacao: 'Almoxarifado / Testes',
        unidade: 'UN',
        quantidade_atual: 1,
        quantidade_minima: 5,
      };
      const result = await alertService.processarAlertaMaterial(db, materialTeste, { forceSend: true, teste: true });
      res.json({ success: true, result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/almoxarifado/alertas-estoque/verificar',async (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    try {
      const forceSend = !!req.body?.forceSend;
      const results = await alertService.verificarAlertasEstoque(db, { forceSend });
      res.json({ success: true, total: results.length, enviados: results.filter(r => r?.enviado).length, results });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET/PUT /api/almoxarifado/configuracoes/liberacao-valor
  app.get('/api/almoxarifado/configuracoes/liberacao-valor', authenticateToken, async (req, res) => {
    try {
      const config = await valueApprovalService.getConfigForApi(db, req.user);
      res.json(config);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/almoxarifado/configuracoes/liberacao-valor', authenticateToken, async (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    try {
      const saved = await valueApprovalService.saveConfig(db, req.body, req.user.nome || req.user.email);
      res.json(saved);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /api/almoxarifado/configuracoes/estoques-minimos — atualização em lote
  app.put('/api/almoxarifado/configuracoes/estoques-minimos', authenticateToken, (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { materiais } = req.body; // [{ id, quantidade_minima, quantidade_maxima, ponto_pedido, prazo_reposicao_dias }]
    if (!Array.isArray(materiais)) return res.status(400).json({ error: 'Envie um array de materiais' });

    const promises = materiais.map(m =>
      new Promise((resolve, reject) => {
        db.run(`UPDATE materiais_almoxarifado SET
                  quantidade_minima=?, quantidade_maxima=?, ponto_pedido=?,
                  prazo_reposicao_dias=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=?`,
          [m.quantidade_minima ?? 0, m.quantidade_maxima ?? 0,
           m.ponto_pedido ?? 0, m.prazo_reposicao_dias ?? 0, m.id],
          (e) => e ? reject(e) : resolve());
      })
    );
    Promise.all(promises)
      .then(() => {
        const ids = materiais.map(m => m.id).filter(Boolean);
        Promise.all(ids.map(id => alertService.verificarAlertaPorMaterialId(db, id).catch(() => null)))
          .catch(() => null);
        res.json({ success: true, updated: materiais.length });
      })
      .catch(e => res.status(500).json({ error: e.message }));
  });

  // PUT /api/almoxarifado/configuracoes/tipos-material — associar tipo a material em lote
  app.put('/api/almoxarifado/configuracoes/tipos-material', authenticateToken, (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { materiais } = req.body; // [{ id, tipo_material_id }]
    if (!Array.isArray(materiais)) return res.status(400).json({ error: 'Envie um array' });

    const promises = materiais.map(m =>
      new Promise((resolve, reject) => {
        db.run(`UPDATE materiais_almoxarifado SET tipo_material_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          [m.tipo_material_id || null, m.id],
          (e) => e ? reject(e) : resolve());
      })
    );
    Promise.all(promises)
      .then(() => res.json({ success: true }))
      .catch(e => res.status(500).json({ error: e.message }));
  });


  // ════════════════════════════════════════════════════════════════════════════
  // REQUISIÇÕES (Solicitações da Fábrica)
  // ════════════════════════════════════════════════════════════════════════════

  // GET /api/almoxarifado/requisicoes — listar (com filtros)
  app.get('/api/almoxarifado/requisicoes',(req, res) => {
    const { status, urgencia, minha, departamento } = req.query;
    let sql = `SELECT r.*,
                 (SELECT COUNT(*) FROM itens_requisicao_almoxarifado WHERE requisicao_id = r.id) as total_itens
               FROM requisicoes_almoxarifado r WHERE COALESCE(r.ativo, 1) = 1`;
    const params = [];

    if (minha === '1') { sql += ` AND r.solicitante_id = ?`; params.push(req.user.id); }
    if (status) { sql += ` AND r.status = ?`; params.push(status); }
    if (req.query.aprovacoes_valor === '1') { sql += ` AND r.status = 'AGUARDANDO_APROVACAO_VALOR'`; }
    if (urgencia) { sql += ` AND r.urgencia = ?`; params.push(urgencia); }
    if (departamento) { sql += ` AND r.departamento LIKE ?`; params.push(`%${departamento}%`); }

    sql += ` ORDER BY CASE r.urgencia WHEN 'CRITICO' THEN 1 WHEN 'URGENTE' THEN 2 ELSE 3 END, r.created_at DESC`;

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // GET /api/almoxarifado/requisicoes/aprovacoes-valor — pendentes de aprovação por valor
  app.get('/api/almoxarifado/requisicoes/aprovacoes-valor', async (req, res) => {
    try {
      const souAprovador = await valueApprovalService.isAprovadorValor(db, req.user);
      if (!souAprovador) return res.status(403).json({ error: 'Sem permissão para ver aprovações de valor' });
      const rows = await valueApprovalService.listarAguardandoAprovacao(db);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/almoxarifado/requisicoes/:id — detalhe com itens
  app.get('/api/almoxarifado/requisicoes/:id',(req, res) => {
    db.get(`SELECT * FROM requisicoes_almoxarifado WHERE id = ? AND COALESCE(ativo, 1) = 1`, [req.params.id], (err, req_row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!req_row) return res.status(404).json({ error: 'Requisição não encontrada' });

      // saldo_atual carrega o DISPONÍVEL (Etapa 3, Task 3) MAIS o hold da própria requisição
      // (Etapa 4): a reserva criada na aprovação é deduzida do disponível geral, então sem
      // somá-la de volta o detalhe anunciaria entregável 0 justamente para a requisição que tem
      // o material garantido. Reserva de terceiro (origem MANUAL ou de outra requisição)
      // continua fora, como saldo de outro dono.
      db.all(`SELECT ir.*, ma.nome as material_nome, ma.codigo as material_codigo,
                     ma.unidade,
                     (${disponivelSql('ma')}
                       + COALESCE((SELECT SUM(r.quantidade - COALESCE(r.quantidade_utilizada,0))
                                   FROM reservas_material_almoxarifado r
                                   WHERE r.item_requisicao_id = ir.id AND r.material_id = ir.material_id
                                     AND r.status = 'ATIVA' AND r.origem = 'REQUISICAO'), 0)) as saldo_atual,
                     COALESCE((SELECT SUM(r2.quantidade - COALESCE(r2.quantidade_utilizada,0))
                               FROM reservas_material_almoxarifado r2
                               WHERE r2.item_requisicao_id = ir.id AND r2.material_id = ir.material_id
                                 AND r2.status = 'ATIVA' AND r2.origem = 'REQUISICAO'), 0) as quantidade_reservada_item,
                     ma.foto,
                     ma.localizacao, ma.localizacao_padrao_id,
                     a.codigo as almoxarifado_codigo, a.nome as almoxarifado_nome,
                     tm.nome as tipo_nome, tm.icone as tipo_icone, tm.is_epi, tm.requer_assinatura
              FROM itens_requisicao_almoxarifado ir
              JOIN materiais_almoxarifado ma ON ir.material_id = ma.id
              LEFT JOIN tipos_material_almoxarifado tm ON ma.tipo_material_id = tm.id
              LEFT JOIN localizacoes_almoxarifado l ON ma.localizacao_padrao_id = l.id
              LEFT JOIN almoxarifados a ON l.almoxarifado_id = a.id
              WHERE ir.requisicao_id = ?`,
        [req.params.id], (err2, itens) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({
            ...req_row,
            itens: enrichMaterialRows(
              (itens || []).map(requisitionService.normalizarItem),
            ),
          });
        });
    });
  });

  // POST /api/almoxarifado/requisicoes — criar requisição
  // requirePermission('requisitar'): [ADMINISTRADOR, PRODUCAO, ENGENHARIA, ALMOXARIFE] —
  // inclui PRODUCAO por design (quem pede material é o chão de fábrica), então o fallback
  // de getPerfilFromUser continua passando aqui. O que este gate barra é CONSULTA (perfil
  // de leitura), COMPRAS e GESTOR.
  app.post('/api/almoxarifado/requisicoes', requirePermission('requisitar'), validate(RequisicaoSchema), async (req, res) => {
    try {
      const result = await requisitionCreateService.createRequisicao(
        db, req.user, req.body, { modulo: 'almoxarifado' },
      );

      if (result.status === 'RASCUNHO') {
        return res.status(201).json({ id: result.id, numero: result.numero, status: result.status });
      }

      if (result.status === valueApprovalService.STATUS_AGUARDANDO) {
        return res.status(201).json({
          id: result.id,
          numero: result.numero,
          status: result.status,
          valor_total: result.valor_total,
          requer_aprovacao_valor: true,
        });
      }

      // Verificar aprovação automática
      db.get(`SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'aprovacao_automatica'`, [], (e, cfg) => {
        if (!e && cfg && cfg.valor === '1' && req.body.urgencia !== 'CRITICO') {
          db.run(`UPDATE requisicoes_almoxarifado SET status='APROVADO', aprovador_nome='Sistema (automático)', data_aprovacao=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL WHERE id=?`,
            [result.id], () => {
              res.status(201).json({
                id: result.id, numero: result.numero, status: 'APROVADO', aprovacao: 'automatica',
                valor_total: result.valor_total,
              });
            });
        } else {
          res.status(201).json({
            id: result.id, numero: result.numero, status: 'PENDENTE',
            valor_total: result.valor_total,
          });
        }
      });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // POST /api/almoxarifado/requisicoes/:id/enviar — enviar rascunho (RASCUNHO -> PENDENTE),
  // dispara as notificações + avaliação de valor que o rascunho pulou na criação (mesmo
  // bloco pós-criação do POST /requisicoes, reaproveitado aqui — ver requisitionCreateService
  // .dispararNotificacoesCriacao, Task 1).
  // Nota (review final da Etapa 3): a rota exige status === 'RASCUNHO' explicitamente, em
  // vez de delegar a validarTransicao — TRANSICOES também lista AGUARDANDO_APROVACAO_VALOR
  // -> PENDENTE (seta reservada ao /aprovar-valor no design); aceitá-la aqui permitiria
  // reenviar e-mails/avaliação de valor em loop para uma requisição já pendente de
  // aprovação por valor.
  app.post('/api/almoxarifado/requisicoes/:id/enviar', async (req, res) => {
    try {
      const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [req.params.id]);
      if (!reqRow) return res.status(404).json({ error: 'Requisição não encontrada' });

      // Mesmo gate de dono/admin do /cancelar (linha ~1968) — sem isso, qualquer usuário
      // com acesso ao módulo poderia enviar o rascunho de outro (disparando e-mails,
      // avaliação de valor e possível auto-aprovação em nome do dono).
      if (reqRow.solicitante_id !== req.user.id && !isSystemAdmin(req.user)) {
        return res.status(403).json({ error: 'Apenas o solicitante pode enviar o rascunho' });
      }

      if (reqRow.status !== 'RASCUNHO') {
        return res.status(400).json({ error: 'Apenas rascunhos podem ser enviados' });
      }

      await dbRun(db,
        `UPDATE requisicoes_almoxarifado SET status='PENDENTE', updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [req.params.id]);

      const avaliacaoValor = await requisitionCreateService.dispararNotificacoesCriacao(
        db, req.params.id, req.user.email,
      );

      if (avaliacaoValor.status === valueApprovalService.STATUS_AGUARDANDO) {
        return res.json({
          id: Number(req.params.id),
          numero: reqRow.numero,
          status: avaliacaoValor.status,
          valor_total: avaliacaoValor.valor_total,
          requer_aprovacao_valor: true,
        });
      }

      // Mesma checagem de aprovação automática que o POST /requisicoes aplica na criação direta.
      db.get(`SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'aprovacao_automatica'`, [], (e, cfg) => {
        if (!e && cfg && cfg.valor === '1' && reqRow.urgencia !== 'CRITICO') {
          db.run(`UPDATE requisicoes_almoxarifado SET status='APROVADO', aprovador_nome='Sistema (automático)', data_aprovacao=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL WHERE id=?`,
            [req.params.id], () => {
              res.json({
                id: Number(req.params.id), numero: reqRow.numero, status: 'APROVADO', aprovacao: 'automatica',
                valor_total: avaliacaoValor.valor_total,
              });
            });
        } else {
          res.json({
            id: Number(req.params.id), numero: reqRow.numero, status: 'PENDENTE',
            valor_total: avaliacaoValor.valor_total,
          });
        }
      });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // PUT /api/almoxarifado/requisicoes/:id/aprovar — aprovar
  // Duas checagens INDEPENDENTES e cumulativas:
  //  1. requirePermission('aprovar_requisicao') — perfil habilitado a aprovar
  //     ([ADMINISTRADOR, ALMOXARIFE, GESTOR]); antes disto qualquer usuário do módulo
  //     aprovava requisição de terceiro (fallback PRODUCAO no gate global);
  //  2. segregação de funções no handler (abaixo) — nem quem TEM o perfil aprova a
  //     própria requisição.
  app.put('/api/almoxarifado/requisicoes/:id/aprovar', requirePermission('aprovar_requisicao'), async (req, res) => {
    try {
      const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [req.params.id]);
      if (!reqRow) return res.status(404).json({ error: 'Requisição não encontrada' });

      // Segregação de funções (design, "Decisões aprovadas" #1): quem solicitou não pode
      // aprovar a própria requisição — vale para as duas lanes (aprovar e aprovar-valor,
      // ver requisitionValueApprovalService.aprovarValor). NÃO se aplica a
      // rejeitar/rejeitar-valor: reprovar a própria requisição é desistência, decisão
      // legítima do solicitante.
      if (Number(req.user.id) === Number(reqRow.solicitante_id)) {
        return res.status(403).json({ error: 'Solicitante não pode aprovar a própria requisição' });
      }

      // Nota: NÃO usamos validarTransicao(reqRow.status, 'APROVADO') aqui — TRANSICOES
      // também lista AGUARDANDO_APROVACAO_VALOR -> APROVADO como válido, mas essa seta é
      // exclusiva da rota /aprovar-valor (design: anotada "(aprovar-valor)"), que exige
      // isAprovadorValor e grava aprovador_valor_id/data_aprovacao_valor. Esta rota
      // genérica só aprova a partir de PENDENTE — manter isso explícito evita que
      // qualquer usuário autenticado aprove uma requisição bloqueada por valor sem passar
      // pela permissão dedicada.
      if (reqRow.status !== 'PENDENTE') {
        return res.status(400).json({ error: `Transição inválida: ${reqRow.status} → APROVADO` });
      }

      // Pós-aprovação: se nenhum item tem saldo disponível, a requisição não fica em
      // APROVADO — vai para AGUARDANDO_COMPRA/AGUARDANDO_ESTOQUE (design, seção "Máquina
      // de estados"). Calculado ANTES do UPDATE (calcularStatusPosAprovacao só depende
      // dos itens/materiais, não do status da requisição) para gravar tudo num único
      // UPDATE — evita uma janela transitória com status=APROVADO visível a leitores
      // concorrentes entre dois writes.
      const statusPosAprovacao = await requisitionStateMachine.calcularStatusPosAprovacao(db, req.params.id);

      // Etapa 4 (design, decisão 2 — ligação 04→07): a aprovação RESERVA o saldo de cada item,
      // e a requisição assume TOTALMENTE_RESERVADA/PARCIALMENTE_RESERVADA em vez de ficar só
      // APROVADO. Sem isso o material aprovado continuava no bolo do disponível e podia ser
      // levado por outra saída entre a aprovação e a entrega.
      //
      // Se nada foi reservado (nenhum item com disponível), `status` vem null e o
      // comportamento anterior é preservado na íntegra — AGUARDANDO_ESTOQUE/AGUARDANDO_COMPRA
      // NÃO regridem para um status de reserva.
      //
      // As reservas nascem ANTES do UPDATE do status porque o status DEPENDE delas, e o UPDATE
      // continua único (sem janela transitória com status=APROVADO visível a leitores
      // concorrentes). A janela invertida — reserva criada com a requisição ainda PENDENTE — é
      // inofensiva: a reserva já segura o saldo e carrega requisicao_id, então a entrega a
      // encontra normalmente depois.
      const reserva = await requisitionService.reservarItensAprovacao(db, req.params.id, req.user, reqRow);
      const statusFinal = reserva.status || statusPosAprovacao;

      await dbRun(db,
        `UPDATE requisicoes_almoxarifado SET status=?, aprovador_id=?, aprovador_nome=?, data_aprovacao=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL
         WHERE id=?`,
        [statusFinal, req.user.id, req.user.nome || req.user.email, req.params.id]);

      await registrarAuditoria(db, {
        entidade: 'requisicao', entidade_id: Number(req.params.id), acao: 'APROVACAO',
        usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
        dados_novos: { status: statusFinal, reservas: reserva.reservas },
      });

      res.json({ success: true, status: statusFinal, reservas: reserva.reservas });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // Motivo obrigatório na rejeição (design, "Decisões aprovadas" #1) — vale para as duas
  // lanes (rejeitar e rejeitar-valor). Zod inline, padrão validation.js.
  const RejeicaoSchema = z.object({
    motivo: z.string().trim().min(1, 'Motivo da rejeição é obrigatório'),
  });

  // PUT /api/almoxarifado/requisicoes/:id/rejeitar — rejeitar (sem segregação: reprovar a
  // própria requisição é desistência, decisão legítima do solicitante — ver comentário na
  // rota /aprovar acima).
  //
  // A permissão NÃO pode ser um requirePermission puro por causa exatamente dessa
  // exceção: rejeitar a requisição de OUTRA pessoa é decisão de aprovação e exige
  // `aprovar_requisicao`; rejeitar a PRÓPRIA é desistência e todo solicitante pode, com
  // qualquer perfil. Daí a checagem no handler, depois de saber quem é o solicitante.
  app.put('/api/almoxarifado/requisicoes/:id/rejeitar', validate(RejeicaoSchema), async (req, res) => {
    try {
      const reqRow = await dbGet(db, 'SELECT solicitante_id FROM requisicoes_almoxarifado WHERE id = ?', [req.params.id]);
      // reqRow ausente (id inexistente) não vira 404 aqui de propósito: o UPDATE abaixo
      // já devolve o 400 "Apenas requisições pendentes podem ser rejeitadas", contrato
      // que esta rota sempre teve — este commit é só sobre autorização.
      const ehSolicitante = !!reqRow && Number(req.user.id) === Number(reqRow.solicitante_id);
      if (!ehSolicitante && !can(req.user, 'aprovar_requisicao')) {
        return res.status(403).json({
          error: 'Sem permissão para rejeitar requisição de outro solicitante',
          acao: 'aprovar_requisicao',
        });
      }

      const { motivo } = req.body;
      const result = await dbRun(db,
        `UPDATE requisicoes_almoxarifado SET status='REJEITADO', rejeicao_motivo=?, aprovador_id=?, aprovador_nome=?, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL
         WHERE id=? AND status='PENDENTE'`,
        [motivo, req.user.id, req.user.nome || req.user.email, req.params.id]);
      if (result.changes === 0) {
        return res.status(400).json({ error: 'Apenas requisições pendentes podem ser rejeitadas' });
      }

      await registrarAuditoria(db, {
        entidade: 'requisicao', entidade_id: Number(req.params.id), acao: 'REJEICAO',
        usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
        justificativa: motivo, dados_novos: { status: 'REJEITADO' },
      });

      res.json({ success: true });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // PUT /api/almoxarifado/requisicoes/:id/aprovar-valor — aprovar liberação por valor.
  // Segregação (solicitante não aprova a própria) é aplicada dentro do serviço, que já
  // busca a requisição para validar o status AGUARDANDO_APROVACAO_VALOR — ver
  // requisitionValueApprovalService.aprovarValor.
  app.put('/api/almoxarifado/requisicoes/:id/aprovar-valor', async (req, res) => {
    try {
      const result = await valueApprovalService.aprovarValor(db, req.params.id, req.user);

      // Task 6 — esta lane não reservava. `aprovarValor` grava APROVADO direto, então a
      // requisição liberada por valor saía sem o hold e o material podia ser levado por outra
      // saída antes da entrega: exatamente a corrida que a Etapa 4 fechou na lane /aprovar.
      // Pior aqui do que lá, porque quem passa pela liberação por valor é justamente a
      // requisição de valor alto.
      //
      // Reserva DEPOIS do serviço (e não dentro dele) porque a segregação e a validação de
      // status vivem lá, e não faz sentido segurar saldo de uma aprovação que vai ser recusada.
      // Se nada for reservado, `status` vem null e o APROVADO gravado pelo serviço permanece —
      // o comportamento anterior sobrevive intacto quando não há o que reservar.
      const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [req.params.id]);
      const reserva = await requisitionService.reservarItensAprovacao(db, req.params.id, req.user, reqRow);
      if (reserva.status) {
        await dbRun(db,
          `UPDATE requisicoes_almoxarifado SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          [reserva.status, req.params.id]);
        result.status = reserva.status;
      }
      result.reservas = reserva.reservas;

      await registrarAuditoria(db, {
        entidade: 'requisicao', entidade_id: Number(req.params.id), acao: 'APROVACAO_VALOR',
        usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
        dados_novos: { status: result.status, reservas: reserva.reservas },
      });

      res.json(result);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // PUT /api/almoxarifado/requisicoes/:id/rejeitar-valor — reprovar liberação por valor
  // (sem segregação — mesma decisão de design do /rejeitar).
  app.put('/api/almoxarifado/requisicoes/:id/rejeitar-valor', validate(RejeicaoSchema), async (req, res) => {
    try {
      const result = await valueApprovalService.rejeitarValor(db, req.params.id, req.user, req.body.motivo);

      await registrarAuditoria(db, {
        entidade: 'requisicao', entidade_id: Number(req.params.id), acao: 'REJEICAO_VALOR',
        usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
        justificativa: req.body.motivo, dados_novos: { status: result.status },
      });

      res.json(result);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  const handleSeparacao = (req, res) => {
    const { itens_separados } = req.body || {};
    requisitionService.separarRequisicao(db, req.params.id, itens_separados || [])
      .then((result) => res.json(result))
      .catch((e) => res.status(e.status || 500).json({ error: e.message }));
  };

  // Todo o fluxo de separação/entrega é trabalho de almoxarifado: `separar_emitir`
  // ([ADMINISTRADOR, ALMOXARIFE]). O gate global do módulo só checa ACESSO — sem isto
  // qualquer usuário com acesso separava/liberava/entregava requisição (e /entregar baixa
  // estoque real via requisitionService -> stockService).
  const requireSepararEmitir = requirePermission('separar_emitir');

  // PUT /api/almoxarifado/requisicoes/:id/separacao — iniciar separação (com quantidades opcionais)
  app.put('/api/almoxarifado/requisicoes/:id/separacao', requireSepararEmitir, handleSeparacao);
  // Alias conforme especificação
  app.put('/api/almoxarifado/requisicoes/:id/separar', requireSepararEmitir, handleSeparacao);

  // PUT /api/almoxarifado/requisicoes/:id/liberar-retirada — libera para retirada
  // (EM_SEPARACAO -> PRONTA_PARA_RETIRADA), exige ao menos 1 item com quantidade separada.
  app.put('/api/almoxarifado/requisicoes/:id/liberar-retirada', requireSepararEmitir, async (req, res) => {
    try {
      const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [req.params.id]);
      if (!reqRow) return res.status(404).json({ error: 'Requisição não encontrada' });

      const check = requisitionStateMachine.validarTransicao(reqRow.status, 'PRONTA_PARA_RETIRADA');
      if (!check.ok) return res.status(400).json({ error: check.erro });

      const separados = await dbGet(db,
        `SELECT COUNT(*) as n FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? AND quantidade_separada > 0`,
        [req.params.id]);
      if (!separados || separados.n === 0) {
        return res.status(400).json({ error: 'Nenhum item separado' });
      }

      await dbRun(db,
        `UPDATE requisicoes_almoxarifado SET status='PRONTA_PARA_RETIRADA', updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [req.params.id]);

      res.json({ success: true, status: 'PRONTA_PARA_RETIRADA' });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // PUT /api/almoxarifado/requisicoes/:id/entregar — entrega parcial ou total e baixa estoque
  app.put('/api/almoxarifado/requisicoes/:id/entregar', requireSepararEmitir, (req, res) => {
    const { itens_atendidos } = req.body;
    requisitionService.entregarRequisicao(db, req.params.id, itens_atendidos, req.user, alertService)
      .then((result) => res.json(result))
      .catch((e) => res.status(e.status || 500).json({ error: e.message }));
  });

  // PUT /api/almoxarifado/requisicoes/:id/confirmar-recebimento — confirmação de
  // recebimento pelo SOLICITANTE (design, "Máquina de estados": "não é status: campos
  // recebimento_confirmado_por/em setáveis pelo SOLICITANTE em
  // ENTREGUE/PARCIALMENTE_ATENDIDA/ENCERRADA").
  //
  // Decisão: diferente de /cancelar e /enviar (que aceitam dono OU admin), aqui NÃO há
  // bypass de admin — a confirmação é o testemunho do próprio solicitante de que recebeu
  // o material fisicamente; um admin confirmando em nome de outra pessoa esvaziaria o
  // propósito do campo (auditoria de recebimento). Se um admin precisar corrigir isso,
  // é caso de suporte/edição direta no banco, não de rota de negócio.
  app.put('/api/almoxarifado/requisicoes/:id/confirmar-recebimento', async (req, res) => {
    try {
      const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [req.params.id]);
      if (!reqRow) return res.status(404).json({ error: 'Requisição não encontrada' });

      if (Number(req.user.id) !== Number(reqRow.solicitante_id)) {
        return res.status(403).json({ error: 'Apenas o solicitante pode confirmar o recebimento' });
      }

      if (!['ENTREGUE', 'PARCIALMENTE_ATENDIDA', 'ENCERRADA'].includes(reqRow.status)) {
        return res.status(400).json({ error: `Confirmação de recebimento não permitida no status ${reqRow.status}` });
      }

      if (reqRow.recebimento_confirmado_em) {
        return res.status(400).json({ error: 'Recebimento já confirmado' });
      }

      await dbRun(db,
        `UPDATE requisicoes_almoxarifado SET recebimento_confirmado_por=?, recebimento_confirmado_em=CURRENT_TIMESTAMP,
         updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [req.user.id, req.params.id]);

      await registrarAuditoria(db, {
        entidade: 'requisicao', entidade_id: Number(req.params.id), acao: 'CONFIRMACAO_RECEBIMENTO',
        usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
        dados_novos: { recebimento_confirmado_por: req.user.id },
      });

      const atualizada = await dbGet(db,
        'SELECT recebimento_confirmado_por, recebimento_confirmado_em FROM requisicoes_almoxarifado WHERE id = ?',
        [req.params.id]);

      res.json({
        success: true,
        recebimento_confirmado_por: atualizada.recebimento_confirmado_por,
        recebimento_confirmado_em: atualizada.recebimento_confirmado_em,
      });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // Motivo é opcional no encerramento (design: "body motivo opcional") — Zod só para
  // manter o padrão da casa (validate() de todo body de rota mutante), sem exigir nada.
  const EncerramentoSchema = z.object({
    motivo: z.string().nullable().optional(),
  });

  // PUT /api/almoxarifado/requisicoes/:id/encerrar — encerramento (design, "Máquina de
  // estados": "cancela saldos pendentes (nenhuma entrega futura); a partir de ENTREGUE ou
  // PARCIALMENTE_ATENDIDA. Registra encerrado_por/em."). Requer perfil aprovar_requisicao
  // (mesma permissão de aprovar/rejeitar requisições) — não é ação do solicitante nem do
  // almoxarife de separação isoladamente.
  app.put('/api/almoxarifado/requisicoes/:id/encerrar', validate(EncerramentoSchema), async (req, res) => {
    try {
      if (!can(req.user, 'aprovar_requisicao')) {
        return res.status(403).json({ error: 'Sem permissão para encerrar requisições' });
      }

      const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [req.params.id]);
      if (!reqRow) return res.status(404).json({ error: 'Requisição não encontrada' });

      const check = requisitionStateMachine.validarTransicao(reqRow.status, 'ENCERRADA');
      if (!check.ok) return res.status(400).json({ error: check.erro });

      const { motivo } = req.body;

      await dbRun(db,
        `UPDATE requisicoes_almoxarifado SET status='ENCERRADA', encerrado_por=?, encerrado_em=CURRENT_TIMESTAMP,
         updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [req.user.id, req.params.id]);

      await registrarAuditoria(db, {
        entidade: 'requisicao', entidade_id: Number(req.params.id), acao: 'ENCERRAMENTO',
        usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
        justificativa: motivo || null, dados_novos: { status: 'ENCERRADA' },
      });

      res.json({ success: true, status: 'ENCERRADA' });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // POST /api/almoxarifado/requisicoes/:id/copiar — copia uma requisição existente para um
  // novo RASCUNHO (design: "cria NOVO RASCUNHO via createRequisicao com os mesmos itens
  // (quantidade_solicitada, sem entregues), tipo/vínculos/setor copiados, solicitante =
  // req.user"). Reaproveita requisitionCreateService.createRequisicao (Task 1) — mesmo
  // caminho de criação normal, com salvar_rascunho:true (não dispara notificações nem
  // avaliação de valor; isso só acontece quando o rascunho copiado for enviado via
  // /enviar). Não é uma decisão de negócio como aprovar/encerrar — é um atalho de
  // preenchimento de formulário — e o solicitante da cópia é sempre quem chamou a rota,
  // nunca o dono do original. Ainda assim exige `requisitar`: a cópia CRIA uma requisição,
  // então tem de pedir a mesma permissão do POST /requisicoes, senão é um caminho
  // alternativo para requisitar sem a permissão de requisitar (perfil CONSULTA/COMPRAS).
  app.post('/api/almoxarifado/requisicoes/:id/copiar', requirePermission('requisitar'), async (req, res) => {
    try {
      const origem = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [req.params.id]);
      if (!origem) return res.status(404).json({ error: 'Requisição não encontrada' });

      const itensOrigem = await dbAll(db,
        'SELECT material_id, quantidade_solicitada, observacoes FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?',
        [req.params.id]);
      if (itensOrigem.length === 0) {
        return res.status(400).json({ error: 'Requisição de origem não possui itens' });
      }

      const payload = {
        tipo_requisicao: origem.tipo_requisicao || 'CONSUMO',
        centro_custo_id: origem.centro_custo_id || null,
        local_entrega: origem.local_entrega || null,
        projeto_id: origem.projeto_id || null,
        cliente_id: origem.cliente_id || null,
        os_referencia: origem.os_referencia || null,
        setor: origem.setor || null,
        departamento: origem.departamento || null,
        // Justificativa só é copiada para EMERGENCIAL (design: "justificativa copiada se
        // tipo EMERGENCIAL") — nos demais tipos o campo é opcional e não faz parte do
        // contrato de cópia.
        justificativa: origem.tipo_requisicao === 'EMERGENCIAL' ? origem.justificativa : null,
        salvar_rascunho: true,
        itens: itensOrigem.map((item) => ({
          material_id: item.material_id,
          quantidade: item.quantidade_solicitada,
          observacoes: item.observacoes || null,
        })),
      };

      const result = await requisitionCreateService.createRequisicao(
        db, req.user, payload, { modulo: 'almoxarifado' },
      );

      await registrarAuditoria(db, {
        entidade: 'requisicao', entidade_id: result.id, acao: 'COPIA',
        usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
        dados_novos: { origem_id: Number(req.params.id), numero: result.numero },
      });

      res.status(201).json({ id: result.id, numero: result.numero, status: result.status });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // PUT /api/almoxarifado/requisicoes/:id/cancelar — cancelar
  app.put('/api/almoxarifado/requisicoes/:id/cancelar',(req, res) => {
    const { motivo } = req.body;
    db.get(`SELECT * FROM requisicoes_almoxarifado WHERE id = ?`, [req.params.id], (err, r) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!r) return res.status(404).json({ error: 'Não encontrada' });
      if (r.solicitante_id !== req.user.id && !isSystemAdmin(req.user)) {
        return res.status(403).json({ error: 'Sem permissão' });
      }
      const check = requisitionStateMachine.validarTransicao(r.status, 'CANCELADO');
      if (!check.ok) return res.status(400).json({ error: 'Não é possível cancelar neste status' });
      db.run(`UPDATE requisicoes_almoxarifado SET status='CANCELADO', rejeicao_motivo=?, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL WHERE id=?`,
        [motivo || null, req.params.id],
        function (err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          // Cancelar sem soltar as reservas deixaria o hold preso: como a expiração é opt-in
          // por config, na prática ficaria preso para sempre — a mesma armadilha de saldo
          // reservado inutilizável que a Etapa 4 fecha no consumo. Best-effort: falha aqui não
          // desfaz o cancelamento, que é a ação que o usuário pediu.
          reservationService.liberarReservasDaRequisicao(db, req.user, req.params.id, motivo || 'Requisição cancelada')
            .catch((e) => console.warn('Liberação de reservas no cancelamento:', e.message))
            .finally(() => res.json({ success: true }));
        });
    });
  });

  // DELETE /api/almoxarifado/requisicoes/:id — exclusão administrativa (soft delete + estorno)
  app.delete('/api/almoxarifado/requisicoes/:id', (req, res) => {
    if (!canDeleteAlmoxRequisicao(req.user)) {
      return res.status(403).json({ error: 'Apenas administradores do Almoxarifado ou Super Administrador podem excluir requisições' });
    }
    const justificativa = req.body?.justificativa || req.query?.justificativa;
    requisitionService.excluirRequisicao(db, req.params.id, req.user, justificativa, alertService)
      .then((result) => res.json(result))
      .catch((e) => res.status(e.status || 500).json({ error: e.message }));
  });

  // POST /api/almoxarifado/requisicoes/processar-lembretes — processar lembretes pendentes (cron/admin)
  app.post('/api/almoxarifado/requisicoes/processar-lembretes', async (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    try {
      const resultado = await requisitionReminderService.processarLembretesPendentes(db);
      res.json({ success: true, ...resultado });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/almoxarifado/dashboard atualizado com requisições
  app.get('/api/almoxarifado/dashboard/requisicoes',(req, res) => {
    db.get(`SELECT COUNT(*) as total FROM requisicoes_almoxarifado WHERE status = 'PENDENTE'`, [], (err, pendente) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get(`SELECT COUNT(*) as total FROM requisicoes_almoxarifado WHERE status = 'URGENTE' OR urgencia IN ('URGENTE','CRITICO') AND status NOT IN ('ENTREGUE','CANCELADO','REJEITADO')`, [], (err2, urgentes) => {
        if (err2) return res.status(500).json({ error: err2.message });
        db.get(`SELECT COUNT(*) as total FROM requisicoes_almoxarifado`, [], (err3, emitidas) => {
          if (err3) return res.status(500).json({ error: err3.message });
          db.get(`SELECT COUNT(*) as total FROM requisicoes_almoxarifado WHERE status IN ('ENTREGUE','ENCERRADA')`, [], (err4, encerradas) => {
            if (err4) return res.status(500).json({ error: err4.message });
            db.all(`SELECT r.*, (SELECT COUNT(*) FROM itens_requisicao_almoxarifado WHERE requisicao_id = r.id) as total_itens
                    FROM requisicoes_almoxarifado r
                    WHERE r.status IN ('PENDENTE','APROVADO','EM_SEPARACAO','PARCIALMENTE_ATENDIDA',
                                        'AGUARDANDO_ESTOQUE','AGUARDANDO_COMPRA','PRONTA_PARA_RETIRADA','AGUARDANDO_APROVACAO_VALOR')
                    ORDER BY CASE r.urgencia WHEN 'CRITICO' THEN 1 WHEN 'URGENTE' THEN 2 ELSE 3 END, r.created_at ASC
                    LIMIT 5`, [], (err5, abertas) => {
              if (err5) return res.status(500).json({ error: err5.message });
              res.json({
                requisicoesPendentes: pendente?.total || 0,
                requisicoesUrgentes: urgentes?.total || 0,
                requisicoesEmitidas: emitidas?.total || 0,
                requisicoesEncerradas: encerradas?.total || 0,
                abertas: abertas || [],
              });
            });
          });
        });
      });
    });
  });

  // ── Rotas estendidas v3 (serviços, reservas, recebimentos, relatórios) ──
  // Registra a extended após um roundtrip no sqlite (garante apenas a ordem de
  // registro; o initSchema disparado acima pode ainda estar em andamento — é
  // idempotente e a extended roda runInitSchemaWithRetry por conta própria).
  db.run('SELECT 1', [], () => {
    // `uploadsAlmoxDir` (declarado acima, :46) e passado adiante para a extended: o multer do
    // comprovante de sucateamento (Task 7) mora la, e precisa do MESMO diretorio fisico que
    // `uploadAlmox`/`uploadCertificado` usam aqui — nunca re-derivar PERSISTENT_DATA_DIR (isso
    // duplicaria a resolucao de CRM_DATA_DIR de config/paths.js E, no harness de teste
    // (tests/helpers/testApp.js), apontaria para o diretorio ERRADO — o harness passa um
    // `dataDir` temporario como PERSISTENT_DATA_DIR so para ESTE arquivo, e `require('./config/paths')`
    // dentro da extended nao veria esse temporario nenhum.
    require('./almoxarifado/extended')(app, db, authenticateToken, uploadsAlmoxDir);
    console.log('✅ Módulo Almoxarifado registrado (v3 — controle completo de estoque)');
  });

  const REMINDER_INTERVAL_MS = 60 * 60 * 1000;
  const runReminderJob = () => {
    requisitionReminderService.processarLembretesPendentes(db).catch((err) => {
      console.warn('[almoxarifado-lembretes] Erro no job periódico:', err.message);
    });
  };
  setTimeout(runReminderJob, 30 * 1000).unref();
  setInterval(runReminderJob, REMINDER_INTERVAL_MS).unref();
};
