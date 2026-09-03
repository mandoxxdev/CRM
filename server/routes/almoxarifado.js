/**
 * Módulo Almoxarifado — GMP INDUSTRIAIS
 * Rotas: materiais, movimentações, conferências de estoque
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { z } = require('zod');
const alertService = require('../services/almoxarifado/alertService');
const notificationQueueService = require('../services/almoxarifado/notificationQueueService');
// Etapa 17, Task 2 (gancho C4.3): o `listar` dual-mode do registro e a regua unica da
// "conferencia divergente" — a rota de concluir consome o modo por id.
const alertRegistry = require('../services/almoxarifado/alertRegistry');
const requisitionReminderService = require('../services/almoxarifado/requisitionReminderService');
const requisitionService = require('../services/almoxarifado/requisitionService');
const deliverySignatureService = require('../services/almoxarifado/deliverySignatureService');
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
// Etapa 20 (C1): a limpeza do upload orfao que a extended usava desde a Etapa 9 estava presa no
// closure daquele arquivo (`function` local, nunca exportada) — este arquivo nao a alcancava e a
// rota de foto de material vinha deixando orfao em toda saida != 200. Aqui o nome pode ser o
// direto: nao ha funcao local homonima (diferente da extended, que importa com alias).
const { limparUploadOrfao } = require('../services/almoxarifado/uploadCleanup');
const { validate } = require('../services/almoxarifado/validation');
const { MaterialSchema, MaterialUpdateSchema, RequisicaoSchema } = require('../services/almoxarifado/schemas');
const { registrarAuditoria } = require('../services/almoxarifado/audit');
// Etapa 31: o numero de documento do modulo vem de UM gerador so (INV/REQ/REC/REM). Antes desta
// etapa a rota de conferencia montava o `INV-` inline, com o milissegundo fatiado em DECIMAL (os
// oito ultimos digitos) e SEM aleatorio nenhum: duas conferencias abertas no mesmo milissegundo
// colidiam com CERTEZA.
const { inserirComNumeroUnico } = require('../services/almoxarifado/numeroDoc');
// Etapa 33 (C42): a assinatura dos uploads legados. O segredo vem de `resolveJwtSecret`, o mesmo
// resolvedor do JWT — mas o que sai daqui NAO e o token de sessao (ver o cabecalho de urlUpload.js).
const { criarAssinadorUpload, extensaoSegura, cabecalhosUploadSeguro } = require('../services/almoxarifado/urlUpload');
const { resolveJwtSecret } = require('../services/runtimeSecrets');
// Etapa 18 (C0): o binding desestruturado acima e resolvido no require e cacheado — um teste
// nao consegue substituir `registrarAuditoria` por um stub que lanca, e a RN-02 ("auditoria
// nunca derruba o ato") viraria um teste VAZIO: passaria verde sem jamais ter derrubado
// auditoria nenhuma. As chamadas NOVAS usam `audit.registrarAuditoria(...)`, resolvido na hora
// da chamada, e por isso sao alcancaveis pelo stub. As antigas ficam como estao de proposito —
// esta etapa acrescenta, nao reescreve o que ja funciona.
const audit = require('../services/almoxarifado/audit');
// Etapa 19 (C1): diff das rotas de configuracao — funcao pura, com a mascara de segredo
// SEMPRE ligada. As tres rotas de configuracao usam a mesma para nao divergirem entre si.
// Etapa 20 (C3, pre-requisito): importado como NAMESPACE, nao desestruturado. O GET e o PUT
// genericos de configuracao passaram a precisar tambem de `CHAVES_SECRETAS` — a lista das duas
// chaves que sao segredo mora aqui e e a MESMA que o diff usa para mascarar o log, de proposito:
// duas listas separadas divergiriam na primeira chave nova e a mascara ficaria meio ligada.
const configDiff = require('../services/almoxarifado/configDiff');

// Etapa 19 (C4 #15): `valueApprovalService.getConfig` devolve valores TIPADOS
// ({ ativo: boolean, limite: number, aprovadorIds: number[] }) e a coluna e TEXT. Esta funcao
// devolve exatamente o que `saveConfig` grava, para que o diff compare coluna com coluna.
// Sem ela, `String(false)` ('false' contra '0') e `String([])` ('' contra '[]') fariam TODO
// save parecer mudanca.
function normalizarLiberacaoValor(cfg) {
  const chaves = valueApprovalService.CONFIG_KEYS;
  return {
    [chaves.ativo]: cfg.ativo ? '1' : '0',
    [chaves.limite]: String(cfg.limite),
    [chaves.aprovadores]: JSON.stringify(cfg.aprovadorIds),
  };
}

// Etapa 19 (C4 #16/#17): os dois PUTs de "configuracao" que na verdade editam
// `materiais_almoxarifado` em lote. Campos declarados aqui para as duas rotas nao divergirem.
//
// COMPARACAO POR `Number()`, nao `String()`: o front manda `parseFloat`/`parseInt` contra
// colunas numericas, entao `5` contra `'5'` da coluna nao pode contar como mudanca. Coluna
// NULL contra payload `0` E mudanca real nos campos de estoque — o UPDATE grava 0, e
// `Number(null) === 0` esconderia isso; por isso o `null` e tratado antes da comparacao.
// Ja `tipo_material_id` grava `|| null`, entao ali null contra null NAO e mudanca.
const CAMPOS_ESTOQUE_MINIMO = [
  { campo: 'quantidade_minima', valor: (m) => m.quantidade_minima ?? 0 },
  { campo: 'quantidade_maxima', valor: (m) => m.quantidade_maxima ?? 0 },
  { campo: 'ponto_pedido', valor: (m) => m.ponto_pedido ?? 0 },
  { campo: 'prazo_reposicao_dias', valor: (m) => m.prazo_reposicao_dias ?? 0 },
];
const CAMPOS_TIPO_MATERIAL = [
  { campo: 'tipo_material_id', valor: (m) => m.tipo_material_id || null, nulavel: true },
];

function mudouNumero(anterior, novo, nulavel) {
  const ausente = anterior === undefined || anterior === null;
  if (nulavel) {
    const novoAusente = novo === undefined || novo === null;
    if (ausente || novoAusente) return ausente !== novoAusente;
    return Number(anterior) !== Number(novo);
  }
  if (ausente) return true;
  return Number(anterior) !== Number(novo);
}

/**
 * RN-06: uma linha de auditoria por material EFETIVAMENTE alterado, com o de/para so dos
 * campos que mudaram. Material cujo id nao veio no SELECT do "antes" (id inexistente) nao
 * audita — auditar ali registraria um ato que nao aconteceu.
 */
async function auditarLoteMaterial(db, req, materiais, antesPorId, campos) {
  for (const m of materiais) {
    const antes = antesPorId.get(Number(m.id));
    if (!antes) continue;
    const dadosAnteriores = {};
    const dadosNovos = {};
    for (const { campo, valor, nulavel } of campos) {
      const novo = valor(m);
      if (!mudouNumero(antes[campo], novo, nulavel)) continue;
      dadosAnteriores[campo] = antes[campo] ?? null;
      dadosNovos[campo] = novo;
    }
    if (!Object.keys(dadosNovos).length) continue;
    await audit.registrarAuditoria(db, {
      entidade: 'material', entidade_id: Number(m.id), acao: 'ATUALIZACAO',
      usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
      dados_anteriores: dadosAnteriores, dados_novos: dadosNovos,
    });
  }
}

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

// RN-06: "exato" tolera deriva de float — a definicao mora em services/almoxarifado/
// divergencia.js (fonte unica; a revisao final achou uma SEGUNDA copia da comparacao exata no
// reportService e a moveu para la tambem).
const { EPSILON_DIVERGENCIA } = require('../services/almoxarifado/divergencia');

module.exports = function (app, db, authenticateToken, PERSISTENT_DATA_DIR, checkModulePermission) {

  // ── Etapa 25, Task 3 (RN-04): de onde a requisição veio ─────────────────────
  // `anexarOrigemAoUsuario` pendura `{ ip, ip_proxy, user_agent }` em `req.user`, que é o objeto
  // que TODAS as rotas deste módulo repassam aos serviços (`Service.x(db, req.user, …)`) — é por
  // ele que a origem alcança os 28 call sites de `registrarMovimentacao`, dos quais 23 nascem
  // dentro de serviços que nunca receberam o `req`.
  //
  // POR QUE ENVOLVER O `authenticateToken` E NÃO ACRESCENTAR UM `app.use` NO PREFIXO (medido,
  // e a primeira forma tentada FALHOU): um `app.use('/api/almoxarifado', …, anexarOrigem)` roda
  // ANTES dos middlewares de rota, e as rotas da `extended` declaram `auth` de novo em cada uma
  // — `authenticateToken` faz `req.user = user` e SUBSTITUI o objeto, levando o `origem` junto.
  // O resultado era a trilha continuar sem `ip` com todos os cenários de unidade verdes. A
  // origem tem de ser pendurada DEPOIS que o auth terminou, e o único ponto que garante isso
  // para as 12 rotas com `auth` próprio deste arquivo, para as ~90 da `extended` e para toda
  // rota futura é o próprio `authenticateToken`.
  //
  // A reatribuição do parâmetro é deliberada (não é descuido): qualquer nome novo deixaria o
  // `authenticateToken` original ainda em escopo, e a próxima rota escrita com ele voltaria a
  // gravar movimentação sem origem, em silêncio. `next` só é chamado quando o auth autorizou;
  // em 401 nada disto roda.
  const { anexarOrigemAoUsuario } = require('../services/almoxarifado/origemRequisicao');
  const authOriginal = authenticateToken;
  authenticateToken = function authComOrigem(req, res, next) {
    authOriginal(req, res, (err) => {
      if (err) return next(err);
      anexarOrigemAoUsuario(req, res, next);
    });
  };

  // ── Diretório de fotos ──────────────────────────────────────────────────────
  const uploadsAlmoxDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'almoxarifado');
  if (!fs.existsSync(uploadsAlmoxDir)) fs.mkdirSync(uploadsAlmoxDir, { recursive: true });

  // Etapa 32 (D1): os anexos vao para um diretorio IRMAO, nao para uma subpasta de
  // uploadsAlmoxDir. `express.static(root)` serve as subpastas de root tambem — guardar em
  // uploads/almoxarifado/anexos deixaria todo anexo publico pelos mounts das linhas ~229-230,
  // que nao passam por auth nenhuma. Criado explicitamente porque o multer NAO cria diretorio
  // (D3 da Etapa 9b: o primeiro upload numa subpasta inexistente da ENOENT -> 500).
  const uploadsAnexosDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'almoxarifado-anexos');
  if (!fs.existsSync(uploadsAnexosDir)) fs.mkdirSync(uploadsAnexosDir, { recursive: true });

  const storageAlmox = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsAlmoxDir),
    filename: (req, file, cb) => {
      const ext = extensaoSegura(file.mimetype); // NUNCA do originalname — ver urlUpload.js
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
        const ext = extensaoSegura(file.mimetype); // NUNCA do originalname — ver urlUpload.js
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

  // ── Servir uploads legados — Etapa 33 (furo C42) ────────────────────────────────────────────
  // Ate aqui estes dois mounts eram PUBLICOS: ficam em prefixo diferente do `/api/almoxarifado`
  // autenticado logo abaixo, entao nao passavam por `authenticateToken` nem por
  // `checkModulePermission`. Deslogado, com a URL na mao, qualquer um baixava certificado de
  // fornecedor, comprovante de sucateamento e a imagem da assinatura de entrega.
  //
  // O verificador vem ANTES do static e so olha `exp` + `sig` — sem banco e sem sessao, porque
  // roda em toda imagem de toda lista.
  const assinadorUpload = criarAssinadorUpload(resolveJwtSecret(PERSISTENT_DATA_DIR));
  // Ponto unico de mintagem do modulo. Sem esta linha, materialPhotoUrl LANCA — de proposito:
  // devolver URL sem assinatura seria o furo C42 de volta, e de volta em silencio.
  require('../services/almoxarifado/materialPhoto').configurarAssinador(assinadorUpload);
  app.use('/api/uploads/almoxarifado', assinadorUpload.middleware, require('express').static(uploadsAlmoxDir, {
    index: false,
    dotfiles: 'deny',
    // nosniff + CSP sandbox: neutralizam script mesmo em arquivo .html/.svg que JA esteja no disco
    // de antes desta correcao — fechar o upload nao limpa o que ja foi gravado.
    setHeaders: cabecalhosUploadSeguro,
  }));
  // FECHO obrigatorio. `express.static` chama `next()` quando o arquivo NAO existe, e a requisicao
  // continuaria descendo — uma assinatura VALIDA para um nome inexistente cairia no proximo
  // handler em vez de responder 404. Medido na revisao do plano.
  app.use('/api/uploads/almoxarifado', (req, res) => res.status(404).end());

  // ⚠️ O MOUNT LEGADO `/uploads/almoxarifado` (sem `/api`) FOI REMOVIDO — nao esqueca dele aqui.
  //
  // Ele existia desde a Etapa 2 e, em PRODUCAO, ja estava morto: `server/index.js` registra o
  // catch-all do SPA (`app.get('*')`) ANTES deste modulo, e a lista de prefixos que ele deixa
  // passar (`:23222-23228`) tem `/api`, `/health`, `/logo`, `/cabecalho` e `/Logo_` — **nao tem
  // `/uploads`**. Ou seja: `/uploads/almoxarifado/x.png` nunca chegava aqui; devolvia o index.html
  // do React com 200.
  //
  // Isso foi medido na revisao adversarial da Etapa 33, e derrubou uma afirmacao que ESTE
  // COMENTARIO fazia: dizia que "este modulo e registrado ANTES" do build do client. E o
  // CONTRARIO. A consequencia pratica era que a regra "os dois mounts exigem assinatura" so valia
  // no `/api` — o outro nao exigia nada porque nunca era alcancado.
  //
  // Removido em vez de consertado (bastaria acrescentar `/uploads` a lista do catch-all) porque
  // ninguem o usa: o client so aceita URL comecando em `/api/uploads/almoxarifado/`
  // (`resolveMaterialPhotoUrl`), e o servidor so mina URLs com esse prefixo. Manter um mount morto
  // que promete protecao e pior que nao ter mount.

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

  // Etapa 19 (RN-01/RN-02): auditoria dos 12 cadastros deste arquivo. Os handlers são callback
  // aninhado (nada de refatorar para async só para pendurar um log), então o helper devolve uma
  // promessa que NUNCA rejeita — o chamador encadeia `.finally(() => res.json(...))` e a
  // resposta sai com log ou sem ele. A chamada é `audit.registrarAuditoria` (por objeto, não
  // pelo binding desestruturado da linha 38): é isso que torna o stub do teste de RN-02
  // alcançável — sem ele o teste passaria verde provando nada (lição da Etapa 18, C0).
  function auditarCadastro({ req, entidade, entidade_id, acao, dados_anteriores, dados_novos }) {
    return audit.registrarAuditoria(db, {
      entidade,
      entidade_id: entidade_id || null,
      acao,
      usuario_id: req.user && req.user.id,
      usuario_nome: req.user && (req.user.nome || req.user.email),
      dados_anteriores: dados_anteriores || null,
      dados_novos: dados_novos || null,
    }).catch((errAudit) => {
      console.error(`[almoxarifado] Falha ao registrar auditoria de ${entidade}/${acao}:`, errAudit.message);
    });
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
      // Etapa 33 (fix-round): este PUT devolvia `foto` CRU enquanto o GET irmao devolve assinada —
      // dois contratos divergentes para a MESMA entidade. Inocuo hoje so porque o formulario navega
      // embora depois de salvar; a primeira tela que consumir a resposta do PUT receberia '' do
      // helper e perderia a foto. Achado da revisao adversarial.
      res.json(enrichMaterialRow(row));
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/almoxarifado/materiais/:id — inativar (soft delete: é uma edição do
  // cadastro, daí `editar_material` e não uma ação própria).
  //
  // Etapa 18 (RN-07): assimetria gritante ate aqui — `PUT /materiais/:id` audita e o DELETE, que
  // tira o material do cadastro inteiro, nao deixava rastro nenhum.
  //
  // O SELECT vem ANTES do UPDATE, e continua necessario:
  //  1) o UPDATE nao distingue "id inexistente" de "desativei" (a rota responde `success: true`
  //     nos dois casos, e este comportamento fica inalterado) — auditar cegamente criaria uma
  //     linha de auditoria para um material que nunca existiu;
  //  2) o SELECT tambem le `ativo`, que e o que decide SE ha o que auditar (ver abaixo).
  //
  // A SEGUNDA RAZAO ORIGINAL ESTAVA ERRADA, e a Etapa 23 a substituiu. Ela dizia que
  // `dados_anteriores.ativo` tinha de ser o valor real porque "e justamente o caso em que o log
  // importa (quem tentou desativar de novo, e quando)". Nao importa: desde a Etapa 22 existe uma
  // tela de auditoria, e nela uma linha DESATIVACAO de um material que JA ESTAVA inativo nao se
  // distingue de uma desativacao real — mesmo verbo, mesmo autor, mesmo horario. Registrar
  // tentativa sem efeito com o verbo do ato com efeito e o log mentindo por EXCESSO (RN-03).
  // Se um dia houver valor em registrar tentativas, isso pede um verbo PROPRIO, nao este.
  // O `ativo` lido segue servindo de `dados_anteriores` no caso que realmente desativa.
  app.delete('/api/almoxarifado/materiais/:id', requirePermission('editar_material'), async (req, res) => {
    try {
      const antes = await dbGet(db, `SELECT id, codigo, nome, ativo FROM materiais_almoxarifado WHERE id = ?`,
        [req.params.id]);
      await dbRun(db, `UPDATE materiais_almoxarifado SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [req.params.id]);

      // Pos-escrita e best-effort: o material JA esta inativo neste ponto: derrubar a resposta por
      // causa do log desfaria nada e devolveria erro para um ato que aconteceu.
      //
      // Etapa 23 (RN-03): `antes.ativo === 1` — so audita quando havia o que desativar. Aqui o
      // conserto e DIFERENTE das outras quatro rotas de exclusao: elas ganharam `AND ativo = 1`
      // no WHERE para o `changes` decidir 404/`ja_inativo`; esta responde `success: true` tambem
      // para id inexistente (contrato declarado na Etapa 19) e isso fica INALTERADO — o que muda
      // e so a condicao da auditoria, sem tocar no corpo da resposta.
      if (antes && antes.ativo === 1) {
        try {
          await audit.registrarAuditoria(db, {
            entidade: 'material', entidade_id: antes.id, acao: 'DESATIVACAO',
            usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
            dados_anteriores: { ativo: antes.ativo },
            dados_novos: { ativo: 0, codigo: antes.codigo, nome: antes.nome },
          });
        } catch (errAudit) {
          console.error('[almoxarifado] Falha ao registrar auditoria de desativação de material:', errAudit.message);
        }
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/almoxarifado/materiais/:id/foto — upload de foto
  // ORDEM IMPORTA: requirePermission ANTES do multer. Invertido, o multer já teria
  // gravado o arquivo em disco quando o 403 fosse emitido — upload não autorizado + lixo
  // órfão em uploads/almoxarifado (coberto em permissoesRotas.api.test.js:535-549). Como o gate
  // roda antes do multer, o 403 é a ÚNICA saída ≠ 200 que não precisa limpar nada: não há
  // arquivo ainda.
  //
  // Etapa 20 (C2) — esta rota era a única das 6 multipart do módulo com os três defeitos juntos:
  //
  //  1) RESPONDIA 200 PARA MATERIAL INEXISTENTE. O `db.run` era `function` (tem `this`), mas
  //     ninguém lia `this.changes` — um UPDATE que casou zero linhas devolvia o nome do arquivo
  //     e a tela dizia "foto salva". Não era bug de arrow function; era omissão. O conserto
  //     principal é o SELECT ANTES (404), que também é o que dá o `dados_anteriores` da
  //     auditoria e o nome da foto a apagar — três necessidades, uma leitura.
  //     A versão anterior deste comentário ia além e dizia "o conserto NÃO é ler `changes`":
  //     ESTAVA ERRADO, e a revisão adversarial reproduziu por quê. O SELECT resolve o caso
  //     comum, mas deixa a janela SELECT→UPDATE aberta: com a linha sumindo no meio, a rota
  //     ainda respondia 200 e gravava arquivo no disco para material que não existe. Por isso
  //     o `changes === 0` abaixo — `dbRun` já devolve `{ changes }` (services/almoxarifado/db.js:5-12),
  //     então o cinto custa uma linha. Alcance real é baixo (o DELETE de material é soft,
  //     `ativo = 0`, e não há `DELETE FROM materiais_almoxarifado` no código), mas "baixo" não
  //     é motivo para responder 200 a uma escrita que não aconteceu.
  //  2) NÃO LIMPAVA O ÓRFÃO em nenhuma saída ≠ 200 (o multer já gravou quando o handler roda).
  //  3) APAGAVA A FOTO ANTERIOR num `db.get` FIRE-AND-FORGET, sem await, correndo em paralelo
  //     com o UPDATE — e com `fs.unlinkSync` SEM try/catch. Uma falha ali (arquivo virou
  //     diretório, permissão, FS cheio) subia de dentro de um callback do sqlite3, onde não há
  //     catch nenhum acima: derrubava o PROCESSO. Agora o unlink é DEPOIS do UPDATE e em
  //     try/catch — molde da rota irmã de certificado, abaixo (:691-698): perder a foto NOVA por
  //     causa de uma falha ao apagar a VELHA seria pior do que deixar um órfão, e a coluna que
  //     acabamos de gravar é a referência que manda.
  //
  // Ordem final: SELECT → 404 (+ limpa órfão) → UPDATE → unlink da anterior → auditoria →
  // resposta. A resposta é a MESMA de antes (`{ foto, foto_url }`) — a tela não muda.
  app.post('/api/almoxarifado/materiais/:id/foto', requirePermission('editar_material'), uploadAlmox.single('foto'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma foto enviada' });

    const filename = req.file.filename;

    let material;
    try {
      material = await dbGet(db, `SELECT id, codigo, nome, foto FROM materiais_almoxarifado WHERE id = ?`,
        [req.params.id]);
    } catch (err) {
      limparUploadOrfao(req, uploadsAlmoxDir);
      return res.status(500).json({ error: err.message });
    }
    if (!material) {
      limparUploadOrfao(req, uploadsAlmoxDir);
      return res.status(404).json({ error: 'Material não encontrado' });
    }

    let escrita;
    try {
      escrita = await dbRun(db, `UPDATE materiais_almoxarifado SET foto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [filename, material.id]);
    } catch (err) {
      limparUploadOrfao(req, uploadsAlmoxDir);
      return res.status(500).json({ error: err.message });
    }
    // Fecha a janela SELECT→UPDATE (ver o item 1 acima): se a linha sumiu no meio, o UPDATE casa
    // zero linhas e não há foto gravada em lugar nenhum — 404 e o arquivo do multer vai embora.
    if (escrita.changes === 0) {
      limparUploadOrfao(req, uploadsAlmoxDir);
      return res.status(404).json({ error: 'Material não encontrado' });
    }

    // DEPOIS do UPDATE e em try/catch (ver o item 3 acima). `materialPhotoFilename` porque a
    // coluna pode guardar caminho ou URL de dados antigos — ele reduz a basename.
    const anterior = materialPhotoFilename(material.foto);
    if (anterior && anterior !== filename) {
      try {
        const oldPath = path.join(uploadsAlmoxDir, anterior);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch (unlinkErr) {
        console.warn('[almoxarifado] Falha ao remover foto anterior do material:', unlinkErr.message);
      }
    }

    // Etapa 20 (RN-04): a Etapa 19 instrumentou os 12 cadastros e esta rota ficou de fora —
    // trocar a foto de um material não deixava rastro nenhum. Pós-escrita e best-effort, com o
    // molde de try/catch + console.error das outras rotas deste arquivo (:574-582, :624-633): o
    // UPDATE já foi commitado, derrubar a request por causa do log devolveria erro para uma
    // escrita que deu certo. `audit.registrarAuditoria` (namespace, não o binding
    // desestruturado) para que o teste consiga substituí-lo por um stub que lança.
    try {
      await audit.registrarAuditoria(db, {
        entidade: 'material', entidade_id: material.id, acao: 'ATUALIZACAO',
        usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
        dados_anteriores: { foto: material.foto ?? null },
        dados_novos: { foto: filename, codigo: material.codigo, nome: material.nome },
      });
    } catch (errAudit) {
      console.error('[almoxarifado] Falha ao registrar auditoria de foto de material:', errAudit.message);
    }

    res.json({ foto: filename, foto_url: materialPhotoUrl(filename) });
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
  //
  // Sem gate de perfil DE PROPOSITO (so o gate de modulo): CONSULTA/COMPRAS/PRODUCAO leem
  // conferencias desde sempre, e a Fase 2 da 10b vetou gatear leitura. Por isso mesmo,
  // `impacto_financeiro` (dinheiro) NAO sai por aqui nem pelo :id — o unico leitor e o
  // relatorio de acuracidade, que tem requirePermission('inventario') (RN-07; achado da
  // revisao da Task 3: a coluna nova vazava pelo SELECT * para quem o relatorio recusa).
  app.get('/api/almoxarifado/conferencias',(req, res) => {
    db.all(`SELECT * FROM conferencias_almoxarifado ORDER BY created_at DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows.map(({ impacto_financeiro, ...c }) => c));
    });
  });

  // GET /api/almoxarifado/conferencias/relatorio-acuracidade — RN-06/RN-07 (Etapa 10b).
  // Registrada ANTES de GET /conferencias/:id — senão o Express casa "relatorio-acuracidade"
  // como :id. Métricas DERIVADAS dos itens (imutáveis pós-conclusão — D10: acuracidade nunca
  // é persistida; impacto_financeiro é, porque depende do custo do momento).
  app.get('/api/almoxarifado/conferencias/relatorio-acuracidade', requirePermission('inventario'), async (req, res) => {
    try {
      const rows = await dbAll(db, `
        SELECT c.id, c.numero, c.data_fim, c.escopo_descricao, c.modo_cego, c.dupla_contagem,
               c.impacto_financeiro,
               COUNT(ic.id) AS total_itens,
               COALESCE(SUM(CASE WHEN ic.quantidade_contada IS NOT NULL THEN 1 ELSE 0 END), 0) AS contados,
               COALESCE(SUM(CASE WHEN ic.quantidade_contada IS NOT NULL AND ABS(ic.divergencia) < ${EPSILON_DIVERGENCIA} THEN 1 ELSE 0 END), 0) AS exatos,
               COALESCE(SUM(CASE WHEN ic.recontado = 1 THEN 1 ELSE 0 END), 0) AS recontados
        FROM conferencias_almoxarifado c
        LEFT JOIN itens_conferencia_almoxarifado ic ON ic.conferencia_id = c.id
        WHERE c.status = 'CONCLUIDO'
        GROUP BY c.id
        ORDER BY c.data_fim DESC, c.id DESC
        LIMIT 500`, []);

      const conferencias = rows.map((r) => ({
        id: r.id, numero: r.numero, data_fim: r.data_fim, escopo_descricao: r.escopo_descricao,
        modo_cego: r.modo_cego, dupla_contagem: r.dupla_contagem,
        total_itens: r.total_itens, contados: r.contados, exatos: r.exatos,
        // recontados (revisao final): a flag dupla_contagem sozinha nao prova que alguem
        // recontou (dentro da tolerancia ninguem reconta) — o numero e o que sustenta o selo.
        recontados: r.recontados,
        divergentes: r.contados - r.exatos,
        // RN-06: sem contagem não há acuracidade — 0% mentiria.
        acuracidade: r.contados > 0 ? Number(((r.exatos / r.contados) * 100).toFixed(2)) : null,
        impacto_financeiro: r.impacto_financeiro,
      }));

      const totalContados = conferencias.reduce((s, c) => s + c.contados, 0);
      const totalExatos = conferencias.reduce((s, c) => s + c.exatos, 0);
      const agregado = {
        conferencias: conferencias.length,
        total_itens: conferencias.reduce((s, c) => s + c.total_itens, 0),
        contados: totalContados,
        exatos: totalExatos,
        // RN-06: ponderada por item contado (Σ exatos / Σ contados) — uma conferência de 2
        // itens não pode pesar o mesmo que uma de 200.
        acuracidade: totalContados > 0 ? Number(((totalExatos / totalContados) * 100).toFixed(2)) : null,
      };

      res.json({ conferencias, agregado });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
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
        // Epsilon (revisao final): deriva de float nao e divergencia — sem isso, tolerancia 0
        // + esperado nascido de subtracao REAL travava a conclusao com "0.00% (limite 0%)".
        const recontagem_necessaria = item.quantidade_contada != null && !item.recontado
          && Math.abs(item.divergencia) > EPSILON_DIVERGENCIA
          && (Math.abs(item.divergencia) / Math.max(item.quantidade_sistema, 1)) * 100 > tolerancia;
        return { ...item, recontagem_necessaria };
      });

      if (conf.status === 'ABERTO' && !can(req.user, 'ajustar_estoque')) {
        // RN-02: contagem cega — o esperado e a divergencia ficam escondidos de quem nao
        // homologa. Concluida ou cancelada os dois voltam para todo mundo: e o registro
        // historico.
        if (conf.modo_cego) {
          itens = itens.map(({ quantidade_sistema, divergencia, ...resto }) => resto);
        }

        // RN-03 (10b): com dupla contagem, a contagem do COLEGA tambem e numero escondido —
        // o recontador precisa contar sem ver o valor do primeiro contador, senao os quatro
        // olhos viram dois olhos e uma copia. Some so o valor de quem NAO foi o ultimo autor;
        // o proprio autor continua vendo o que digitou.
        //
        // ACHADO DA REVISAO FINAL DE BRANCH (Critical): este strip vivia DENTRO do bloco do
        // modo cego — em dupla contagem SEM modo cego (a combinacao mais provavel), o input
        // do recontador chegava preenchido com o numero do colega e um Tab certificava a
        // "recontagem" sem digitar nada: saldo reescrito pelo motor com trilha dizendo que
        // duas pessoas contaram. O strip depende SO de dupla_contagem. O design dizia que a
        // ocultacao era um sub-caso do modo cego — estava ERRADO, corrigido la.
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

      // impacto_financeiro so sai pelo relatorio gateado (ver comentario da rota de listagem).
      const { impacto_financeiro, ...confPublica } = conf;
      res.json({ ...confPublica, itens });
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

      // Etapa 31: o numero nasce DENTRO do gerador, na tentativa que vencer o UNIQUE — e e ele
      // que segue para a auditoria e para a resposta (RN-07). O `fn` contem SO o INSERT do
      // documento: ele e re-executado inteiro a cada tentativa, e o laco dos itens (abaixo) nao
      // pode entrar aqui sob pena de duplicar item quando o retry disparar.
      const { numero, resultado: ins } = await inserirComNumeroUnico(db, 'INV', (num) => dbRun(db,
        `INSERT INTO conferencias_almoxarifado
              (numero, status, responsavel_id, responsavel_nome, observacoes, modo_cego,
               tolerancia_percentual, dupla_contagem, escopo_descricao)
              VALUES (?, 'ABERTO', ?, ?, ?, ?, ?, ?, ?)`,
        [num, req.user.id, req.user.nome || req.user.email, observacoes || null,
          modoCegoValor, toleranciaValor, duplaContagemValor, escopoDescricao]));
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

      if (materiais.length > 0) {
        await Promise.all(materiais.map((m) => dbRun(db,
          `INSERT INTO itens_conferencia_almoxarifado (conferencia_id, material_id, quantidade_sistema)
           VALUES (?, ?, ?)`, [confId, m.id, m.quantidade_sistema])));
      }

      // Etapa 18 (RN-01): auditoria da CRIACAO num ponto unico que os DOIS ramos alcancam. O
      // ramo "zero materiais" responde 201 antes do laco de itens — pendurar a auditoria depois
      // do laco (como o design original propunha) deixaria a conferencia sem item nenhum FORA do
      // rastro, furando a propria RN-01. Pos-escrita e best-effort: a conferencia ja existe,
      // derrubar a resposta por causa do log seria devolver erro para uma escrita que deu certo.
      // `tipo` NAO entra: e a 3a coluna morta da tabela (DEFAULT 'GERAL', nunca escrita).
      try {
        await audit.registrarAuditoria(db, {
          entidade: 'conferencia', entidade_id: confId, acao: 'CRIACAO',
          usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
          dados_novos: {
            numero,
            escopo_descricao: escopoDescricao,
            modo_cego: modoCegoValor,
            dupla_contagem: duplaContagemValor,
            tolerancia_percentual: toleranciaValor,
            total_itens: materiais.length,
          },
        });
      } catch (errAudit) {
        console.error('[almoxarifado] Falha ao registrar auditoria de criação de conferência:', errAudit.message);
      }

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
      // Etapa 18: `numero` entrou no SELECT (nao estava em escopo) — o log da contagem carrega
      // `conferencia_numero` para o rastro ser legivel sem um segundo JOIN na leitura.
      const conf = await dbGet(db, `SELECT status, dupla_contagem, numero FROM conferencias_almoxarifado WHERE id = ?`, [req.params.id]);
      if (!conf) return res.status(404).json({ error: 'Conferência não encontrada' });
      if (conf.status !== 'ABERTO') {
        return res.status(400).json({ error: `Conferência não está aberta (status atual: ${conf.status})` });
      }

      // Etapa 18: `ma.codigo` entrou no SELECT (nao estava em escopo) — o log da contagem grava
      // o CODIGO do material, nao so o id: quem le a auditoria meses depois nao tem como
      // resolver um material_id que pode ter sido desativado.
      const item = await dbGet(db, `SELECT ic.*, ma.quantidade_atual, ma.codigo AS material_codigo
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

      // RN-03 (10b): dupla contagem — a RECONTAGEM tem de ser de outra pessoa, sempre
      // comparando com contado_por_id (o PRIMEIRO contador, nao o anterior): senao o primeiro
      // poderia sobrescrever a recontagem do colega e anular os quatro olhos.
      // Sentinela = contado_por_id (nao ehRecontagem): a autoria nunca volta a null, entao o
      // gate nao depende de um campo que outra requisicao poderia limpar (defesa em
      // profundidade do achado RN-08 acima). Number() dos dois lados: se o id vier string de
      // um token futuro, === estrito falharia ABERTO em silencio.
      //
      // ACHADO DA REVISAO FINAL: enquanto NINGUEM recontou (recontado = 0), o primeiro
      // contador pode CORRIGIR a propria contagem — correcao NAO e recontagem (nao marca
      // recontado, nao preenche recontado_por; so a contagem de OUTRA pessoa faz isso).
      // Sem esse caminho, um erro de digitacao dele congelava o item (RN-08 fechou o contorno
      // por valor invalido) e, acima da tolerancia, travava a conferencia inteira ate outra
      // pessoa logar. Depois da recontagem do colega, ele continua barrado como antes.
      const ehPrimeiroContador = item.contado_por_id != null
        && Number(item.contado_por_id) === Number(req.user.id);
      if (conf.dupla_contagem && ehPrimeiroContador && item.recontado) {
        return res.status(400).json({
          error: `Dupla contagem: a recontagem deve ser feita por outra pessoa (primeira contagem: ${item.contado_por_nome})`,
        });
      }
      const ehCorrecaoDoPrimeiro = conf.dupla_contagem && ehPrimeiroContador && !item.recontado;
      const marcaRecontagem = ehRecontagem && !ehCorrecaoDoPrimeiro;

      // RN-04 (10b): autoria sempre gravada, flag ou não — primeira contagem (e correção do
      // primeiro contador) em contado_por_*, recontagem de verdade sobrescreve recontado_por_*
      // (fica o último recontador).
      const autorNome = req.user.nome || req.user.email;
      const camposAutoria = marcaRecontagem
        ? ', recontado_por_id = ?, recontado_por_nome = ?'
        : ', contado_por_id = ?, contado_por_nome = ?';

      await dbRun(db, `UPDATE itens_conferencia_almoxarifado
              SET quantidade_contada = ?, divergencia = ?, observacoes = COALESCE(?, observacoes)${marcaRecontagem ? ', recontado = 1' : ''}${camposAutoria}
              WHERE id = ?`,
        [quantidadeNum, divergencia, observacoes || null, req.user.id, autorNome, req.params.itemId]);

      // Etapa 18 (RN-01/RN-04): pos-escrita, best-effort. `dados_anteriores` so existe quando
      // JA havia contagem — e a unica memoria do valor que este UPDATE acabou de sobrescrever
      // (nao ha historico de contagem em lugar nenhum). `item` foi lido ANTES do UPDATE, entao
      // carrega o valor antigo; o codigo ja dependia disso na linha do `ehRecontagem`.
      //
      // CONTAGEM vs RECONTAGEM segue EXATAMENTE o `marcaRecontagem` que governou o UPDATE, para
      // o log nunca contar uma historia diferente da que o banco guardou. Atencao: sem
      // `dupla_contagem`, a segunda contagem do MESMO usuario cai em RECONTAGEM — o log nao
      // afirma "outra pessoa", so registra quem recontou.
      try {
        const dadosNovosLog = {
          conferencia_numero: conf.numero,
          item_id: Number(req.params.itemId),
          material_codigo: item.material_codigo,
          quantidade_sistema: item.quantidade_sistema,
          quantidade_contada: quantidadeNum,
          divergencia,
        };
        if (marcaRecontagem) dadosNovosLog.recontado_por_nome = autorNome;
        await audit.registrarAuditoria(db, {
          entidade: 'conferencia', entidade_id: Number(req.params.id),
          acao: marcaRecontagem ? 'RECONTAGEM' : 'CONTAGEM',
          usuario_id: req.user.id, usuario_nome: autorNome,
          dados_anteriores: item.quantidade_contada !== null
            // O autor do valor que esta sendo SOBRESCRITO e o ultimo recontador quando ja
            // houve recontagem — `contado_por_nome` guarda para sempre o PRIMEIRO contador
            // (achado A2 da revisao adversarial, reproduzido: da 3a contagem em diante o log
            // atribuia a Ana um valor que era do Bruno). Este de/para e a unica memoria do
            // numero que evapora; nomear a pessoa errada e o pior jeito de falhar.
            ? { quantidade_contada: item.quantidade_contada,
                contado_por_nome: item.recontado_por_nome || item.contado_por_nome }
            : null,
          dados_novos: dadosNovosLog,
        });
      } catch (errAudit) {
        console.error('[almoxarifado] Falha ao registrar auditoria de contagem de conferência:', errAudit.message);
      }

      res.json({ success: true, divergencia, recontagem: marcaRecontagem });
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
      // Epsilon (revisao final): deriva de float nao exige recontagem — sem isso, tolerancia 0
      // travava a conclusao com "PB-3 - 0.00% (limite 0%)" para um operador que acertou.
      const pendentesRecontagem = todosItens.filter((item) => Math.abs(item.divergencia) > EPSILON_DIVERGENCIA
        && divergenciaPercentualDe(item) > tolerancia && !item.recontado);
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

      const ajustes = todosItens.filter((i) => Math.abs(i.divergencia) > EPSILON_DIVERGENCIA);

      // RN-05 (10b): impacto financeiro SEMPRE calculado — com ou sem aplicar_ajustes — sobre
      // os itens contados divergentes. "O inventário achou R$ X de erro" interessa mesmo
      // quando ninguém aplica, e é o que o relatório de acuracidade consome. Fórmula D8 da
      // Etapa 10 (valores ABSOLUTOS), custo pela fonte única (custoSql.js).
      // Um SELECT so (revisao final): antes era um dbGet por item divergente — inventario
      // anual com 300 divergencias pagava 300 round-trips sequenciais antes de qualquer
      // escrita, e agora o calculo roda SEMPRE (nao so com aplicar_ajustes).
      let impactoFinanceiro = 0;
      if (ajustes.length > 0) {
        const idsAjuste = ajustes.map((i) => i.material_id);
        const custos = await dbAll(db,
          `SELECT id, ${custoUnitarioSql()} AS custo FROM materiais_almoxarifado WHERE id IN (${idsAjuste.map(() => '?').join(',')})`,
          idsAjuste);
        const custoPorId = new Map(custos.map((c) => [c.id, c.custo]));
        for (const item of ajustes) {
          impactoFinanceiro += Math.abs(item.divergencia) * (custoPorId.get(item.material_id) || 0);
        }
      }

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
          ajustesAplicados += 1;
          materiaisAjustados.add(item.material_id);
        }
      }

      // Etapa 18 (RN-05, C4): `aprovador_id`/`aprovador_nome` existem no schema desde a Etapa 10 e
      // NUNCA foram escritas por ninguem — duas colunas mortas. Quem conclui APLICANDO ajuste e
      // quem homologa a diferenca (e o mesmo que exerceu `ajustar_estoque`), entao e ele que a
      // coluna sempre quis guardar. Sem ajustes as colunas nao sao TOCADAS: gravar sempre
      // confundiria "fechou a contagem" com "homologou ajuste", e gravar NULL apagaria uma
      // homologacao anterior. Fragmento condicional no mesmo truque do `camposAutoria` da rota de
      // contagem — a template string ja e montada assim neste arquivo.
      // RN-05 pelo FATO, nao pela flag (achado A4 da revisao adversarial): concluir com
      // `aplicar_ajustes: true` numa conferencia SEM divergencia nenhuma carimbava um
      // "homologador" de um ajuste que nao existiu. A coluna foi ressuscitada nesta etapa
      // com a semantica "quem homologou o ajuste" — sem ajuste aplicado, nao ha o que
      // homologar.
      const homologou = aplicar_ajustes && ajustes.length > 0;
      const camposAprovador = homologou ? ', aprovador_id = ?, aprovador_nome = ?' : '';
      const paramsAprovador = homologou ? [req.user.id, req.user.nome || req.user.email] : [];
      await dbRun(db, `UPDATE conferencias_almoxarifado
              SET status = 'CONCLUIDO', data_fim = CURRENT_TIMESTAMP, justificativa_ajuste = ?, impacto_financeiro = ?${camposAprovador}
              WHERE id = ?`, [aplicar_ajustes ? justificativa_ajuste : conf.justificativa_ajuste, impactoFinanceiro, ...paramsAprovador, req.params.id]);

      // Etapa 18 (RN-01): a conclusao SEM ajustes nao deixava vestigio NENHUM — nenhuma
      // movimentacao e criada e `data_fim` nao tem autor, entao "quem fechou este inventario?"
      // simplesmente nao tinha resposta. Vem ANTES dos ganchos de alerta/notificacao: aqueles
      // podem demorar (e-mail) e o rastro do ato nao pode ficar atras deles na fila.
      // `tolerancia_percentual` e a variavel `tolerancia` (a EFETIVA, que governou a decisao de
      // RN-05), nao a coluna crua — o log tem de dizer o limite que de fato valeu.
      try {
        await audit.registrarAuditoria(db, {
          entidade: 'conferencia', entidade_id: Number(req.params.id), acao: 'CONCLUSAO',
          usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
          dados_novos: {
            numero: conf.numero,
            aplicar_ajustes: !!aplicar_ajustes,
            ajustesAplicados,
            impactoFinanceiro,
            itens_contados: todosItens.length,
            itens_divergentes: ajustes.length,
            tolerancia_percentual: tolerancia,
            modo_cego: conf.modo_cego,
            dupla_contagem: conf.dupla_contagem,
          },
          justificativa: justificativa_ajuste || null,
        });
      } catch (errAudit) {
        console.error('[almoxarifado] Falha ao registrar auditoria de conclusão de conferência:', errAudit.message);
      }

      await Promise.all([...materiaisAjustados].map((mid) => alertService.verificarAlertaPorMaterialId(db, mid).catch(() => null)));

      // Etapa 17 (RN-05, gancho C4.3): aviso pos-commit, ao lado do gancho de alerta acima — a
      // conferencia ja esta CONCLUIDO e os ajustes ja foram aplicados, entao o try/catch so pode
      // custar o e-mail. A linha vem da MESMA funcao que alimenta a central/varredura
      // (`listarDivergenciaConferencia`, dual-mode por id): a conclusao e logica inline nesta
      // rota, e montar a condicao aqui criaria uma segunda definicao de "conferencia divergente".
      // Vazio = conferencia sem divergencia real -> nenhum aviso. Agregado: UM aviso por
      // conferencia, nunca por item (mesmo motivo pelo qual AJUSTE_INVENTARIO fica fora da
      // notificacao de movimentacao).
      try {
        const [linhaInv] = await alertRegistry.listarDivergenciaConferencia(db, { conferenciaId: req.params.id });
        if (linhaInv) await notificationQueueService.dispararAlertaRegistrado(db, 'DIVERGENCIA_INVENTARIO', linhaInv);
      } catch (e) {
        console.warn('[almoxarifado-alertas] Falha ao avisar divergencia de inventario pos-conclusao:', e.message);
      }

      res.json({ success: true, ajustesAplicados, impactoFinanceiro });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // PUT /api/almoxarifado/conferencias/:id/cancelar — cancelar conferência
  //
  // Etapa 18 (RN-03). Era um `db.run` de uma linha, em callback, com `status='ABERTO'` embutido
  // no WHERE: uma conferencia com 300 contagens sumia do fluxo sem autor, sem data e sem motivo,
  // e o unico 400 cobria "nao existe" e "nao esta aberta" indistintamente. Virou `async` porque
  // o gate de status e os campos do log EXIGEM ler a conferencia antes — nao e refatoracao
  // gratuita do bloco inline (que esta etapa nao reorganiza), e a exigencia do proprio contrato.
  //
  // Ordem das guardas: 404 antes da regua do motivo, para que id inexistente responda "nao
  // encontrada" mesmo quando o chamador tambem esqueceu o motivo.
  //
  // O 400 de status usa o MESMO literal das duas rotas irmas (PUT /item e PUT /concluir).
  // Descartado o 409 que o design propunha primeiro: no modulo, 409 e reservado a
  // unicidade/corrida, e um texto novo seria a terceira redacao para a mesma semantica.
  //
  // A resposta de sucesso fica inalterada (`{ success: true }`) — o front da Etapa 17 depende.
  app.put('/api/almoxarifado/conferencias/:id/cancelar', requirePermission('inventario'), async (req, res) => {
    try {
      const { motivo } = req.body || {};

      const conf = await dbGet(db, `SELECT id, numero, status FROM conferencias_almoxarifado WHERE id = ?`,
        [req.params.id]);
      if (!conf) return res.status(404).json({ error: 'Conferência não encontrada' });

      // Mesma regua (>= 5) e mesmo molde de mensagem da justificativa de ajuste da conclusao:
      // cancelar um inventario e tao destrutivo quanto aplicar o ajuste dele.
      const motivoValido = motivo !== undefined && motivo !== null && String(motivo).trim().length >= 5;
      if (!motivoValido) {
        return res.status(400).json({ error: 'Motivo do cancelamento deve ter pelo menos 5 caracteres' });
      }

      if (conf.status !== 'ABERTO') {
        return res.status(400).json({ error: `Conferência não está aberta (status atual: ${conf.status})` });
      }

      const motivoLimpo = String(motivo).trim();
      // CLAIM ATOMICO no WHERE (achado A1 da revisao adversarial, ALTO — reproduzido): a
      // primeira versao desta reescrita fazia dbGet-e-depois-UPDATE sem `status` no WHERE,
      // trocando pelo caminho de leitura o claim que a rota ANTIGA tinha. Medido com
      // Promise.all: dois cancelamentos simultaneos respondiam 200 os DOIS e gravavam DUAS
      // linhas de CANCELAMENTO; e cancelar concorrente com concluir deixava a conferencia
      // CONCLUIDO com as 4 colunas de cancelamento preenchidas e o log dizendo "cancelada e
      // depois concluida". A trilha desta etapa existe para nao mentir — entao so audita
      // quem REIVINDICOU o cancelamento (changes === 1).
      const claim = await dbRun(db, `UPDATE conferencias_almoxarifado
              SET status = 'CANCELADO', cancelado_por_id = ?, cancelado_por_nome = ?,
                  cancelado_em = CURRENT_TIMESTAMP, motivo_cancelamento = ?
              WHERE id = ? AND status = 'ABERTO'`,
        [req.user.id, req.user.nome || req.user.email, motivoLimpo, req.params.id]);
      if (claim.changes === 0) {
        // Perdeu a corrida entre o dbGet e este UPDATE. Mesma resposta do caminho sequencial
        // (o status ja mudou), sem auditar um cancelamento que nao vigorou.
        const atual = await dbGet(db, `SELECT status FROM conferencias_almoxarifado WHERE id = ?`, [req.params.id]);
        return res.status(400).json({ error: `Conferência não está aberta (status atual: ${atual?.status || 'DESCONHECIDO'})` });
      }

      // Quantas contagens foram jogadas fora — o numero que faz o cancelamento doer no log.
      const contados = await dbGet(db, `SELECT COUNT(*) AS total FROM itens_conferencia_almoxarifado
              WHERE conferencia_id = ? AND quantidade_contada IS NOT NULL`, [req.params.id]);

      try {
        await audit.registrarAuditoria(db, {
          entidade: 'conferencia', entidade_id: conf.id, acao: 'CANCELAMENTO',
          usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
          dados_anteriores: { status: 'ABERTO' },
          dados_novos: { numero: conf.numero, itens_contados: contados?.total || 0 },
          justificativa: motivoLimpo,
        });
      } catch (errAudit) {
        console.error('[almoxarifado] Falha ao registrar auditoria de cancelamento de conferência:', errAudit.message);
      }

      res.json({ success: true });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
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
        // Etapa 19 (RN-01): `this.lastID` existe AQUI, mas nao dentro do callback do SELECT
        // abaixo, que e arrow. Como a rota ja le a linha recem-criada para responder, o `r`
        // dela da `entidade_id` e `dados_novos` de graca — e sem depender de `this`.
        db.get(`SELECT * FROM tipos_material_almoxarifado WHERE id = ?`, [this.lastID], (e, r) => {
          if (e || !r) return res.status(201).json(r);
          auditarCadastro({
            req, entidade: 'tipo_material', entidade_id: r.id, acao: 'CRIACAO',
            dados_anteriores: null, dados_novos: r,
          }).finally(() => res.status(201).json(r));
        });
      });
  });

  app.put('/api/almoxarifado/tipos-material/:id',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    const { nome, descricao, icone, cor, requer_assinatura, requer_termo, is_epi, is_controlado, ativo } = req.body;
    // Etapa 19 (RN-01): leitura previa so para o "de" do log — a rota nao a tinha porque nao
    // precisava dela para gravar.
    db.get(`SELECT * FROM tipos_material_almoxarifado WHERE id = ?`, [req.params.id], (selErr, anterior) => {
      if (selErr) return res.status(500).json({ error: selErr.message });
      db.run(`UPDATE tipos_material_almoxarifado SET nome=?, descricao=?, icone=?, cor=?, requer_assinatura=?, requer_termo=?, is_epi=?, is_controlado=?, ativo=? WHERE id=?`,
        [nome, descricao || null, icone || '📦', cor || '#4facfe',
         requer_assinatura ? 1 : 0, requer_termo ? 1 : 0, is_epi ? 1 : 0, is_controlado ? 1 : 0,
         ativo !== undefined ? ativo : 1, req.params.id],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          // Etapa 19 (RN-03): id inexistente respondia 200 com corpo `undefined` e passaria a
          // auditar um ato que nao aconteceu. Nao ha literal de 404 para tipo de material no
          // modulo — este e novo, no molde acentuado dos irmaos ('Localização não encontrada',
          // 'Família não encontrada').
          if (this.changes === 0) return res.status(404).json({ error: 'Tipo de material não encontrado' });
          db.get(`SELECT * FROM tipos_material_almoxarifado WHERE id = ?`, [req.params.id], (e, r) => {
            auditarCadastro({
              req, entidade: 'tipo_material', entidade_id: Number(req.params.id), acao: 'EDICAO',
              dados_anteriores: anterior || null, dados_novos: r || null,
            }).finally(() => res.json(r));
          });
        });
    });
  });

  app.delete('/api/almoxarifado/tipos-material/:id',(req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    db.get(`SELECT * FROM tipos_material_almoxarifado WHERE id = ?`, [req.params.id], (selErr, anterior) => {
      if (selErr) return res.status(500).json({ error: selErr.message });
      // Etapa 23 (RN-04): o `AND ativo = 1` nao e otimizacao, e o que da SENTIDO ao `changes`.
      // Sem ele o SQLite conta a linha que o WHERE CASOU, nao a que MUDOU: excluir de novo dava
      // `changes = 1` e gravava um segundo EXCLUSAO, indistinguivel do real na tela de auditoria.
      db.run(`UPDATE tipos_material_almoxarifado SET ativo = 0 WHERE id = ? AND ativo = 1`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        // `changes === 0` agora tem DOIS significados, e quem os separa e o SELECT acima:
        // linha inexistente => 404 (como antes); linha ja inativa => 200 idempotente SEM auditar.
        if (this.changes === 0) {
          if (!anterior) return res.status(404).json({ error: 'Tipo de material não encontrado' });
          return res.json({ success: true, ja_inativo: true });
        }
        auditarCadastro({
          req, entidade: 'tipo_material', entidade_id: Number(req.params.id), acao: 'EXCLUSAO',
          dados_anteriores: anterior || null, dados_novos: { ativo: 0 },
        }).finally(() => res.json({ success: true }));
      });
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
        // Etapa 19: o SELECT era `id, ativo` — virou `*` porque a linha inativa e o
        // `dados_anteriores` da REATIVACAO. Nenhum handler desestrutura esta row.
        db.get(`SELECT * FROM localizacoes_almoxarifado WHERE codigo = ?`, [codigo], (selErr, existente) => {
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
                db.get(`SELECT * FROM localizacoes_almoxarifado WHERE id = ?`, [existente.id], (e, r) => {
                  // Etapa 19: REATIVACAO, nao CRIACAO. Auditar os dois caminhos com o mesmo
                  // verbo mentiria — este tem "de" (a linha inativa) e a criacao nao tem.
                  auditarCadastro({
                    req, entidade: 'localizacao', entidade_id: existente.id, acao: 'REATIVACAO',
                    dados_anteriores: existente, dados_novos: r || null,
                  }).finally(() => res.status(201).json(r));
                });
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
              // `this.lastID` existe aqui, mas nao no callback do SELECT (arrow): o `r` que a
              // rota ja le para responder da o id e o `dados_novos`.
              db.get(`SELECT * FROM localizacoes_almoxarifado WHERE id = ?`, [this.lastID], (e, r) => {
                if (e || !r) return res.status(201).json(r);
                auditarCadastro({
                  req, entidade: 'localizacao', entidade_id: r.id, acao: 'CRIACAO',
                  dados_anteriores: null, dados_novos: r,
                }).finally(() => res.status(201).json(r));
              });
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
    //
    // Etapa 19: o SELECT era `bloqueada, tipos_material_permitidos` — virou `*` porque a mesma
    // leitura serve de `dados_anteriores` do log (RN-01). Os dois campos acima continuam sendo
    // lidos de `current` normalmente.
    db.get(`SELECT * FROM localizacoes_almoxarifado WHERE id = ?`,
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
              db.get(`SELECT * FROM localizacoes_almoxarifado WHERE id = ?`, [req.params.id], (e, r) => {
                auditarCadastro({
                  req, entidade: 'localizacao', entidade_id: Number(req.params.id), acao: 'EDICAO',
                  dados_anteriores: current, dados_novos: r || null,
                }).finally(() => res.json(r));
              });
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
        // Etapa 19 (RN-01): leitura previa so para o "de" do log — as leituras que a rota ja
        // fazia sao de SALDO, nao da linha.
        db.get(`SELECT * FROM localizacoes_almoxarifado WHERE id = ?`, [req.params.id], (selErr, anterior) => {
          if (selErr) return res.status(500).json({ error: selErr.message });
          // Etapa 23 (RN-04): `AND ativo = 1` para o `changes` responder a pergunta certa —
          // sem ele, uma 2a exclusao contava 1 e gravava rastro de um ato sem efeito.
          db.run(`UPDATE localizacoes_almoxarifado SET ativo = 0 WHERE id = ? AND ativo = 1`, [req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            // RN-03: id inexistente respondia 200 ("success: true" sobre nada).
            // Etapa 23: e `changes === 0` com a linha EXISTINDO e "ja inativa" — 200 sem auditar.
            if (this.changes === 0) {
              if (!anterior) return res.status(404).json({ error: 'Localização não encontrada' });
              return res.json({ success: true, ja_inativo: true });
            }
            auditarCadastro({
              req, entidade: 'localizacao', entidade_id: Number(req.params.id), acao: 'EXCLUSAO',
              dados_anteriores: anterior || null, dados_novos: { ativo: 0 },
            }).finally(() => res.json({ success: true }));
          });
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
          [this.lastID], (e, r) => {
            if (e || !r) return res.status(201).json(r);
            // Etapa 19: `qtd_localizacoes` é CONTAGEM derivada que este SELECT calcula para a
            // tela — não é campo do cadastro e não entra no log (senão o "de/para" de um setor
            // pareceria mudar sozinho quando alguém cria uma localização).
            const { qtd_localizacoes, ...cadastro } = r;
            auditarCadastro({
              req, entidade: 'setor', entidade_id: r.id, acao: 'CRIACAO',
              dados_anteriores: null, dados_novos: cadastro,
            }).finally(() => res.status(201).json(r));
          });
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

    // Etapa 19: o SELECT era `nome` — virou `*` para servir de `dados_anteriores` (RN-01).
    db.get('SELECT * FROM setores_almoxarifado WHERE id = ?', [req.params.id], (err, atual) => {
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

            // Etapa 19 (RN-08): o efeito colateral mais amplo do escopo — renomear o setor
            // renomeia N localizações — era fire-and-forget (callback vazio, erro engolido,
            // `changes` nunca lido). Agora é CONTADO e vai para o log.
            //
            // Duas armadilhas resolvidas aqui:
            // 1. o callback do cascata era ARROW, e `this.changes` num arrow é `undefined`: o
            //    log gravaria `localizacoes_renomeadas: undefined`. Virou `function`.
            // 2. quando o nome NÃO muda, o cascata nem roda — mas a EDICAO (prefixo, tipo,
            //    ordem, ativo) aconteceu do mesmo jeito. Auditar só dentro do cascata faria
            //    essa edição sumir do log. Por isso os dois caminhos chamam `concluir`.
            const concluir = (renomeadas) => {
              db.get(`SELECT s.*,
                        (SELECT COUNT(*) FROM localizacoes_almoxarifado l
                         WHERE l.ativo = 1 AND l.setor = s.nome) as qtd_localizacoes
                      FROM setores_almoxarifado s WHERE s.id = ?`,
                [req.params.id], (e, r) => {
                  const { qtd_localizacoes, ...cadastro } = r || {};
                  auditarCadastro({
                    req, entidade: 'setor', entidade_id: Number(req.params.id), acao: 'EDICAO',
                    dados_anteriores: atual,
                    dados_novos: { ...cadastro, localizacoes_renomeadas: renomeadas },
                  }).finally(() => res.json(r));
                });
            };

            if (atual.nome !== nome.trim()) {
              db.run('UPDATE localizacoes_almoxarifado SET setor = ? WHERE setor = ? AND ativo = 1',
                [nome.trim(), atual.nome], function (cascErr) {
                  if (cascErr) {
                    // Continua não derrubando o rename do setor (o comportamento antigo era
                    // engolir em silêncio); mas agora o erro aparece, e o log diz `null` em vez
                    // de fingir um número que não foi medido.
                    console.error('[almoxarifado] Cascata de rename de setor falhou:', cascErr.message);
                    return concluir(null);
                  }
                  concluir(this.changes);
                });
              return;
            }
            concluir(0);
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
    // Etapa 19: o SELECT era `nome` — virou `*` para servir de `dados_anteriores` (RN-01).
    db.get('SELECT * FROM setores_almoxarifado WHERE id = ?', [req.params.id], (err, setor) => {
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
          // Etapa 23 (RN-04): esta rota nem LIA `changes` — passa a ler, com o estado no WHERE.
          db.run('UPDATE setores_almoxarifado SET ativo = 0 WHERE id = ? AND ativo = 1', [req.params.id], function (delErr) {
            if (delErr) return res.status(500).json({ error: delErr.message });
            // Aqui NAO existe o ramo de 404 que as outras tres rotas tem: o `if (!setor)` acima ja
            // devolveu 404 antes do UPDATE, entao chegar com `changes === 0` so pode significar
            // "ja inativa". Implementar o 404 por SELECT vazio do contrato C2 seria codigo morto.
            if (this.changes === 0) return res.json({ success: true, ja_inativo: true });
            auditarCadastro({
              req, entidade: 'setor', entidade_id: Number(req.params.id), acao: 'EXCLUSAO',
              dados_anteriores: setor, dados_novos: { ativo: 0 },
            }).finally(() => res.json({ success: true }));
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
          // `this.lastID` existe aqui, mas nao no callback do SELECT (arrow): o `r` que a rota
          // ja le para responder da o id e o `dados_novos`.
          db.get('SELECT * FROM familias_material_almoxarifado WHERE id = ?', [this.lastID], (e, r) => {
            if (e || !r) return res.status(201).json(r);
            auditarCadastro({
              req, entidade: 'familia', entidade_id: r.id, acao: 'CRIACAO',
              dados_anteriores: null, dados_novos: r,
            }).finally(() => res.status(201).json(r));
          });
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
    //
    // Etapa 19: o SELECT era `parent_id, ativo, categoria_id` — virou `*` porque a mesma
    // leitura serve de `dados_anteriores` do log (RN-01). Os três campos acima continuam sendo
    // lidos de `current` normalmente.
    db.get('SELECT * FROM familias_material_almoxarifado WHERE id = ?', [familiaId], (errCurrent, current) => {
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
            db.get('SELECT * FROM familias_material_almoxarifado WHERE id = ?', [familiaId], (e, r) => {
              auditarCadastro({
                req, entidade: 'familia', entidade_id: familiaId, acao: 'EDICAO',
                dados_anteriores: current, dados_novos: r || null,
              }).finally(() => res.json(r));
            });
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
        // Etapa 19 (RN-01): leitura previa so para o "de" do log — as leituras que a rota ja
        // fazia sao CONTAGENS (itens e subfamilias), nao a linha.
        db.get('SELECT * FROM familias_material_almoxarifado WHERE id = ?', [req.params.id], (selErr, anterior) => {
          if (selErr) return res.status(500).json({ error: selErr.message });
          // Etapa 23 (RN-04): `AND ativo = 1` para o `changes` distinguir linha ALTERADA de
          // linha apenas CASADA — sem ele a 2a exclusao auditava um ato que nao aconteceu.
          db.run('UPDATE familias_material_almoxarifado SET ativo = 0 WHERE id = ? AND ativo = 1', [req.params.id], function (err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            // RN-03: id inexistente respondia 200 ("success: true" sobre nada).
            // Etapa 23: `changes === 0` com a linha EXISTINDO e "ja inativa" — 200 sem auditar.
            if (this.changes === 0) {
              if (!anterior) return res.status(404).json({ error: 'Família não encontrada' });
              return res.json({ success: true, ja_inativo: true });
            }
            auditarCadastro({
              req, entidade: 'familia', entidade_id: Number(req.params.id), acao: 'EXCLUSAO',
              dados_anteriores: anterior || null, dados_novos: { ativo: 0 },
            }).finally(() => res.json({ success: true }));
          });
        });
      });
    });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES (admin only)
  // ════════════════════════════════════════════════════════════════════════════

  // Etapa 20 (C3, RN-05): esta rota devolvia a tabela INTEIRA em claro — inclusive
  // `alertas_smtp_pass` e `alertas_whatsapp_api_key` — enquanto a rota IRMA de alertas
  // (`GET /configuracoes/alertas-estoque`) ja mascarava as duas com o mesmo gate. Duas portas
  // para o mesmo dado, uma trancada e outra nao.
  //
  // FORMA DA MASCARA: `alertService.PASSWORD_MASK` ('********') quando ha valor, `''` quando nao
  // ha — IDENTICO ao que `getAlertSettingsForApi` devolve, para que a tela veja o mesmo formato
  // nas duas rotas. Descartado omitir a chave (mudaria a forma da resposta e a tela itera as
  // chaves) e descartado um booleano `configurado` (formato novo so para este caso). O `''` do
  // caso vazio importa: dizer '********' para senha inexistente MENTIRIA "ja configurado".
  //
  // `alertas_whatsapp_webhook_url` FICA DE FORA de proposito (decisao A5, congelada em
  // `tests/api/configuracoesSegredo.api.test.js`): a rota irma devolve o webhook EM CLARO sob o
  // mesmo gate, entao mascarar so aqui nao reduziria exposicao nenhuma; e mascarar sem guardar o
  // PUT criaria o pior caso — quem reenviasse a mascara gravaria '(credenciais omitidas)' como
  // URL e mataria as notificacoes em silencio. A preocupacao de fundo (registro PERMANENTE) ja
  // esta resolvida: o log de auditoria mascara a query string desde a Etapa 19
  // (`configDiff.mascararUrl`), e e o log que e imutavel — a coluna guarda so o valor atual.
  app.get('/api/almoxarifado/configuracoes', authenticateToken, (req, res) => {
    if (denyUnlessAlmoxAdmin(req, res)) return;
    db.all(`SELECT * FROM configuracoes_almoxarifado ORDER BY chave`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const obj = {};
      rows.forEach(r => {
        const valor = configDiff.CHAVES_SECRETAS.includes(r.chave)
          ? (r.valor ? alertService.PASSWORD_MASK : '')
          : r.valor;
        obj[r.chave] = { valor, descricao: r.descricao, id: r.id };
      });
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
      // Etapa 19 (C4 #13): `SELECT chave` virou `SELECT chave, valor` — a validacao abaixo so
      // alimenta o Set de chaves conhecidas, entao a coluna a mais nao muda nada nela, e e ela
      // que da o `dados_anteriores` do diff sem um segundo SELECT.
      const existentes = await dbAll(db, `SELECT chave, valor FROM configuracoes_almoxarifado`);
      const conhecidas = new Set(existentes.map(r => r.chave));
      const desconhecidas = entradas.map(([chave]) => chave).filter(c => !conhecidas.has(c));
      if (desconhecidas.length) {
        return res.status(400).json({ error: `Configuração desconhecida: ${desconhecidas.join(', ')}` });
      }
      // Revisao final da Etapa 11 (achado 4, medido): as chaves `reposicao_*` sao dias — o
      // motor (purchaseService.lerConfigNumero) so aceita numero finito > 0 e cai no default
      // em silencio para qualquer outra coisa. Sem validacao aqui, '0'/''/'-7' gravavam com
      // HTTP 200 e "Configuracoes salvas!" enquanto o motor ignorava o valor e usava o
      // default — o administrador achava que tinha mudado a janela e nada mudou.
      //
      // Etapa 12 (Fase 2, achado 8): a Etapa 11 so tinha chaves de DIAS, entao uma mensagem so
      // bastava. A fila de notificacoes trouxe chaves de TENTATIVAS e MINUTOS
      // (`notificacoes_worker_*`, `notificacoes_max_*`) — reusar a mensagem "dias" para elas
      // MENTIRIA ("Configuração deve ser um número de dias" para intervalo em minutos). Por
      // isso DOIS conjuntos de prefixos com DUAS mensagens; `notificar_movimentacoes` e as
      // `notificacoes_dest_*` (texto livre) NAO caem em nenhum dos dois de proposito — as
      // demais configs do modulo tem semanticas proprias (booleana '0'/'1', texto livre, etc.)
      // que esta regra nao serve.
      // Etapa 16 (C4): 'alerta_lote_' virou o prefixo unico 'alerta_' — cobre
      // alerta_lote_vencendo_dias E as 3 chaves novas do registro de alertas
      // (alerta_calibracao_dias, alerta_quarentena_dias, alerta_reserva_parada_dias).
      // Seguro de proposito: 'alertas_' (emails/toggles/smtp) NAO comeca com 'alerta_'
      // (o 's' na 7a posicao nao casa com o '_'), entao nenhuma chave de texto/booleano
      // cai na validacao de dias. A primeira versao do plano da etapa afirmava o
      // contrario e estava errada (corrigido pela revisao).
      const PREFIXOS_DIAS = ['reposicao_', 'alerta_'];
      const PREFIXOS_INTEIRO = ['notificacoes_worker_', 'notificacoes_max_'];
      // Revisao da Task 1 (Minor i): a RN-09 promete "0 ou 1" para o liga/desliga — sem esta
      // guarda, 'banana' gravava com 200 e o gancho da Task 2 trataria como desligado em
      // silencio (getConfig compara com '1').
      const CHAVES_BOOL = ['notificar_movimentacoes'];
      for (const [chave, valor] of entradas) {
        // Etapa 20 (C4, RN-06): as duas chaves de SEGREDO sao semeadas, entao passavam na guarda
        // de chaves conhecidas acima e esta rota as gravava — SEM o `shouldUpdateSecret` que a
        // rota de alertas usa. Com a mascara do C3 no GET, isso viraria o pior caso: a tela leria
        // '********', reenviaria no proximo Salvar e a MASCARA viraria a senha, quebrando o envio
        // de e-mail em silencio. Recusar apontando a rota certa e o conserto honesto — e a recusa
        // fica AQUI, no laco de validacao que roda inteiro antes do laco de UPDATE, porque sem
        // transacao rejeitar no meio da gravacao deixaria metade do formulario aplicada.
        if (configDiff.CHAVES_SECRETAS.includes(chave)) {
          return res.status(400).json({
            error: `Configuração "${chave}" só pode ser alterada em Configurações → Alertas de Estoque`,
          });
        }
        if (CHAVES_BOOL.includes(chave) && !['0', '1'].includes(String(valor))) {
          return res.status(400).json({ error: `Configuração "${chave}" deve ser 0 ou 1` });
        }
        const ehDias = PREFIXOS_DIAS.some((p) => chave.startsWith(p));
        const ehInteiro = PREFIXOS_INTEIRO.some((p) => chave.startsWith(p));
        if (!ehDias && !ehInteiro) continue;
        const n = Number(valor);
        if (!Number.isInteger(n) || n < 1) {
          const msg = ehDias
            ? `Configuração "${chave}" deve ser um número de dias maior que zero`
            : `Configuração "${chave}" deve ser um número inteiro maior que zero`;
          return res.status(400).json({ error: msg });
        }
      }
      // Etapa 23 (RN-01): era UM UPDATE POR CHAVE, em sequencia. A tela manda as 18 chaves a cada
      // Salvar; falhando o 3o UPDATE, as duas primeiras JA estavam gravadas, o catch respondia 500
      // e a auditoria (que vem depois) NUNCA rodava — configuracao alterada, usuario vendo erro, e
      // a trilha sem uma linha sequer. Com a tela de auditoria da Etapa 22, isso virou ausencia
      // visivel para quem audita.
      //
      // O conserto NAO e transacao, e isso e contraintuitivo o bastante para ficar escrito aqui:
      // `server/index.js` abre UMA UNICA conexao SQLite para o CRM inteiro, e transacao em SQLite
      // e por CONEXAO, nao por requisicao. Entre um BEGIN e um COMMIT desta rota, a escrita de
      // qualquer outra requisicao em voo entraria nesta transacao — e um ROLLBACK por falha ao
      // salvar configuracao desfaria a movimentacao de estoque de outra pessoa. `db.serialize()`
      // NAO resolve (ordena a fila, nao da exclusividade); a Fase 2 da Etapa 23 reproduziu os dois.
      //
      // A atomicidade vem de UM UPDATE SO com CASE: o SQLite e atomico POR STATEMENT. Grava as N
      // chaves ou nao grava nenhuma, sem prender a conexao. ORDEM DOS PARAMETROS (facil de errar):
      // os pares do CASE primeiro, depois o updated_by, depois as chaves do IN. `String(valor)`
      // continua sendo o que vai para a coluna — a Etapa 19 decidiu logar o que foi de fato
      // escrito, nao o valor cru do body. O `WHERE chave IN (...)` nao e decorativo: sem ele, o
      // CASE sem ELSE devolveria NULL para toda chave nao enviada e zeraria a tabela.
      const partes = entradas.map(() => 'WHEN ? THEN ?').join(' ');
      const marcadores = entradas.map(() => '?').join(',');
      await dbRun(db, `UPDATE configuracoes_almoxarifado
                          SET valor = CASE chave ${partes} END,
                              updated_at = CURRENT_TIMESTAMP, updated_by = ?
                        WHERE chave IN (${marcadores})`,
        [...entradas.flatMap(([c, v]) => [c, String(v)]), req.user.nome || req.user.email,
          ...entradas.map(([c]) => c)]);

      // Etapa 19 (RN-04): UMA linha por PUT, com o DIFF apenas. `entidade_id` fica null porque
      // a coluna e INTEGER e o identificador de uma configuracao e a CHAVE, que e TEXT.
      // `dados_novos` guarda `String(valor)` — o que foi de FATO escrito na coluna. Logar o
      // valor cru do body faria um `null` do payload virar `null` no log enquanto a coluna
      // guarda a string 'null': numa etapa cujo tema e o log nao mentir, seria o proprio
      // defeito. Pos-escrita e best-effort (RN-02): os UPDATEs ja foram commitados, derrubar a
      // resposta por causa do log nao desfaria nada.
      const anterioresMapa = {};
      existentes.forEach((r) => { anterioresMapa[r.chave] = r.valor; });
      const novosMapa = {};
      entradas.forEach(([chave, valor]) => { novosMapa[chave] = String(valor); });
      const diff = configDiff.calcularDiff(anterioresMapa, novosMapa);
      if (Object.keys(diff.novos).length) {
        try {
          await audit.registrarAuditoria(db, {
            entidade: 'configuracao', entidade_id: null, acao: 'EDICAO',
            usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
            dados_anteriores: diff.anteriores, dados_novos: diff.novos,
          });
        } catch (errAudit) {
          console.error('[almoxarifado] Falha ao registrar auditoria de configuração:', errAudit.message);
        }
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
      // Etapa 19 (C4 #14): o SELECT do "antes" e montado a partir do PROPRIO array `upserts`,
      // depois de montado e antes do Promise.all — os dois segredos entram nele
      // CONDICIONALMENTE (shouldUpdateSecret), entao o conjunto de chaves varia por request e
      // uma lista chumbada aqui divergiria da que a rota grava.
      const chavesTocadas = upserts.map(([chave]) => chave);
      const linhasAntes = await dbAll(db,
        `SELECT chave, valor FROM configuracoes_almoxarifado WHERE chave IN (${chavesTocadas.map(() => '?').join(',')})`,
        chavesTocadas).catch(() => null);
      // `null` (nao `[]`) quando a leitura do "antes" falha — achado A2 da revisao adversarial,
      // reproduzido: com `[]`, `calcularDiff` trata TODA chave como inexistente antes e o log
      // afirmava `de null -> para X` para as 18 chaves num save em que NADA mudou. O log
      // FABRICAVA mudanca. Degradar para silencio e o que o irmao `estoques-minimos` ja fazia;
      // duas quedas best-effort da mesma etapa degradavam em direcoes opostas, e a que
      // inventava registro era justamente a nao declarada.
      const anterioresMapa = linhasAntes ? {} : null;
      if (linhasAntes) linhasAntes.forEach((r) => { anterioresMapa[r.chave] = r.valor; });
      const novosMapa = {};
      upserts.forEach(([chave, valor]) => { novosMapa[chave] = valor; });

      const promises = upserts.map(([chave, valor]) => new Promise((resolve, reject) => {
        db.run(`INSERT INTO configuracoes_almoxarifado (chave, valor, updated_at, updated_by)
                VALUES (?, ?, CURRENT_TIMESTAMP, ?)
                ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, updated_at=CURRENT_TIMESTAMP, updated_by=excluded.updated_by`,
        [chave, valor, updatedBy], (err) => (err ? reject(err) : resolve()));
      }));
      await Promise.all(promises);

      // RN-05: `alertas_smtp_pass` e `alertas_whatsapp_api_key` entram no diff como
      // '(alterado)' — a mascara e do configDiff e esta SEMPRE ligada, nao depende desta rota
      // lembrar de pedir. Log de auditoria com senha em claro seria pior que a ausencia de log.
      // Sem o "antes" nao ha de/para honesto: nao audita e avisa no log do servidor (A2).
      if (!anterioresMapa) {
        console.error('[almoxarifado] Alertas de estoque gravados SEM auditoria: a leitura do estado anterior falhou');
      } else {
        const diff = configDiff.calcularDiff(anterioresMapa, novosMapa);
        if (Object.keys(diff.novos).length) {
          try {
            await audit.registrarAuditoria(db, {
              entidade: 'configuracao', entidade_id: null, acao: 'EDICAO',
              usuario_id: req.user.id, usuario_nome: updatedBy,
              dados_anteriores: diff.anteriores, dados_novos: diff.novos,
            });
          } catch (errAudit) {
            console.error('[almoxarifado] Falha ao registrar auditoria de alertas de estoque:', errAudit.message);
          }
        }
      }
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
      // Etapa 19 (C4 #15): `getConfig` NOS DOIS LADOS, normalizado para a forma PERSISTIDA.
      // O retorno de `saveConfig` e `getConfigForApi`, de shape DIFERENTE (traz `aprovadores`
      // e `souAprovador` a mais) — diffar um contra o outro logaria chaves novas em TODO save.
      // E `String()` cru sobre o shape tipado tambem seria errado: `String([])` === '' contra
      // '[]' na coluna, `String(false)` === 'false' contra '0'. Auditado NA ROTA porque o
      // servico so recebe `userName`, nao o usuario.
      const antes = normalizarLiberacaoValor(await valueApprovalService.getConfig(db));
      // Auditoria em `finally` (achado A1 da revisao adversarial, reproduzido): esta e a UNICA
      // das 5 rotas de configuracao com uma chamada FALIVEL entre a escrita e o log —
      // `saveConfig` grava as 3 chaves e SO ENTAO monta a resposta com `getConfigForApi`, que
      // consulta a tabela `usuarios`. Se aquela consulta lanca, a regra JA FOI PERSISTIDA, o
      // cliente recebe 500 e, no desenho anterior, a auditoria nunca rodava: mudanca da regra
      // de liberacao por valor sem rastro nenhum. Comparar o estado REAL antes x depois aqui
      // audita o que de fato ficou gravado, com 500 ou sem.
      let saved;
      try {
        saved = await valueApprovalService.saveConfig(db, req.body, req.user.nome || req.user.email);
      } finally {
        try {
          const depois = normalizarLiberacaoValor(await valueApprovalService.getConfig(db));
          const diff = configDiff.calcularDiff(antes, depois);
          if (Object.keys(diff.novos).length) {
            await audit.registrarAuditoria(db, {
              entidade: 'configuracao', entidade_id: null, acao: 'EDICAO',
              usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
              dados_anteriores: diff.anteriores, dados_novos: diff.novos,
            });
          }
        } catch (errAudit) {
          console.error('[almoxarifado] Falha ao registrar auditoria de liberação por valor:', errAudit.message);
        }
      }
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

    const ids = materiais.map(m => m.id).filter(Boolean);
    // Etapa 19 (C4 #16 / RN-06): esta rota nao e configuracao — e edicao em LOTE de material.
    // Audita como `material`, UMA linha por material EFETIVAMENTE alterado (nao uma por
    // request), com o verbo `ATUALIZACAO` que a entidade `material` ja usa desde o CRUD v1:
    // usar `EDICAO` aqui partiria o historico do material em dois verbos e quem consultasse
    // por acao receberia metade.
    //
    // O SELECT e EM LOTE e vem ANTES do Promise.all: os callbacks dele sao arrow (sem `this`),
    // entao nao ha `this.changes` para consultar depois, e ler depois do UPDATE devolveria o
    // valor NOVO nos dois lados do de/para. Best-effort de proposito (`.catch(() => [])`):
    // falha na leitura do "antes" custa o log, nunca a escrita.
    const lerAntes = ids.length
      ? dbAll(db, `SELECT id, quantidade_minima, quantidade_maxima, ponto_pedido, prazo_reposicao_dias
                   FROM materiais_almoxarifado WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
        .catch(() => [])
      : Promise.resolve([]);

    lerAntes
      .then((linhas) => {
        const antesPorId = new Map(linhas.map(r => [Number(r.id), r]));
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
        return Promise.all(promises).then(() => antesPorId);
      })
      .then((antesPorId) => auditarLoteMaterial(db, req, materiais, antesPorId, CAMPOS_ESTOQUE_MINIMO)
        .catch(errAudit => console.error('[almoxarifado] Falha ao registrar auditoria de estoques mínimos:', errAudit.message)))
      .then(() => {
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

    // Etapa 19 (C4 #17): mesma classe da rota acima — lote de `material`, verbo `ATUALIZACAO`,
    // SELECT em lote antes do Promise.all. ROTA ORFA: zero chamadores no client (medido na
    // Fase 0). Auditada mesmo assim — apagar rota sem confirmar quem a chama e irreversivel de
    // graca —, e nomeada na spec como candidata a remocao.
    const ids = materiais.map(m => m.id).filter(Boolean);
    const lerAntes = ids.length
      ? dbAll(db, `SELECT id, tipo_material_id FROM materiais_almoxarifado
                   WHERE id IN (${ids.map(() => '?').join(',')})`, ids).catch(() => [])
      : Promise.resolve([]);

    lerAntes
      .then((linhas) => {
        const antesPorId = new Map(linhas.map(r => [Number(r.id), r]));
        const promises = materiais.map(m =>
          new Promise((resolve, reject) => {
            db.run(`UPDATE materiais_almoxarifado SET tipo_material_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
              [m.tipo_material_id || null, m.id],
              (e) => e ? reject(e) : resolve());
          })
        );
        return Promise.all(promises).then(() => antesPorId);
      })
      .then((antesPorId) => auditarLoteMaterial(db, req, materiais, antesPorId, CAMPOS_TIPO_MATERIAL)
        .catch(errAudit => console.error('[almoxarifado] Falha ao registrar auditoria de tipos de material em lote:', errAudit.message)))
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
                     ma.foto, ma.material_critico,
                     ma.localizacao, ma.localizacao_padrao_id,
                     a.codigo as almoxarifado_codigo, a.nome as almoxarifado_nome,
                     tm.nome as tipo_nome, tm.icone as tipo_icone, tm.is_epi, tm.requer_assinatura
              FROM itens_requisicao_almoxarifado ir
              JOIN materiais_almoxarifado ma ON ir.material_id = ma.id
              LEFT JOIN tipos_material_almoxarifado tm ON ma.tipo_material_id = tm.id
              LEFT JOIN localizacoes_almoxarifado l ON ma.localizacao_padrao_id = l.id
              LEFT JOIN almoxarifados a ON l.almoxarifado_id = a.id
              WHERE ir.requisicao_id = ?`,
        [req.params.id], async (err2, itens) => {
          if (err2) return res.status(500).json({ error: err2.message });
          // Etapa 15 (C2, mudança aditiva): quem vê a requisição vê as assinaturas de entrega
          // dela — sem gate novo de leitura. Callback virou async DE PROPÓSITO (achado da
          // revisão do plano: `await` num callback não-async seria SyntaxError); erro da busca
          // não é engolido — vira 500 como qualquer outro deste handler.
          // Etapa 28 (RN-09), mesma régua: as rodadas de separação, a segunda conferência e se
          // ela é obrigatória (material crítico SEPARADO) saem junto — leitura sem gate novo.
          let assinaturas;
          let separacoes;
          try {
            assinaturas = await deliverySignatureService.listarAssinaturas(db, req.params.id);
            separacoes = await requisitionService.listarSeparacoes(db, req.params.id);
          } catch (e) {
            return res.status(500).json({ error: e.message });
          }
          const conferencia = req_row.conferido_por_id != null
            ? { usuario_id: req_row.conferido_por_id, usuario_nome: req_row.conferido_por_nome, em: req_row.conferido_em }
            : null;
          res.json({
            ...req_row,
            itens: enrichMaterialRows(
              (itens || []).map(requisitionService.normalizarItem),
            ),
            assinaturas_entrega: assinaturas,
            separacoes,
            conferencia,
            conferencia_obrigatoria: requisitionService.conferenciaObrigatoria(itens || []),
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
    // Etapa 28: a separação tem dono — `req.user` chega ao serviço (RN-01). Sem isto o serviço
    // recusa com 400, e é essa a fiação que a Etapa 25 ensinou a provar pela rota.
    requisitionService.separarRequisicao(db, req.params.id, itens_separados || [], req.user)
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

      // Etapa 28 (RN-06): material crítico SEPARADO exige a segunda conferência antes de sair. A
      // mesma função guarda a outra saída (entregarRequisicao) — a entrega sai direto de
      // EM_SEPARACAO, então a barreira só aqui seria opcional.
      const itens = await requisitionService.carregarItensRequisicao(db, req.params.id);
      requisitionService.assertConferidaSeObrigatorio(reqRow, itens);

      await dbRun(db,
        `UPDATE requisicoes_almoxarifado SET status='PRONTA_PARA_RETIRADA', updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [req.params.id]);

      // Etapa 28 (RN-08, D4): a liberação passa a auditar — pós-escrita, best-effort, como o resto
      // do módulo (Etapa 19: falha de log não derruba o ato). `audit.registrarAuditoria` (namespace)
      // para ser alcançável por stub, como as chamadas novas desde a Etapa 18.
      try {
        await audit.registrarAuditoria(db, {
          entidade: 'requisicao', entidade_id: Number(req.params.id), acao: 'LIBERACAO_RETIRADA',
          usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
          dados_anteriores: { status: reqRow.status },
          dados_novos: { status: 'PRONTA_PARA_RETIRADA', conferido_por_id: reqRow.conferido_por_id ?? null },
        });
      } catch (e) {
        console.warn(`[almoxarifado-liberacao] Falha ao auditar a liberação da requisição ${req.params.id}: ${e.message}`);
      }

      res.json({ success: true, status: 'PRONTA_PARA_RETIRADA' });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // PUT /api/almoxarifado/requisicoes/:id/conferir-separacao — SEGUNDA CONFERÊNCIA da separação
  // (Etapa 28, C3). Rota própria, não campo no liberar-retirada (D1): a tela chama a liberação de
  // um confirm sem corpo, e o almoxarife que separa é hoje o mesmo que libera — fundir os dois
  // travaria um almoxarifado de uma pessoa só. Gate `conferir_separacao` (perfil); a barreira por
  // identidade ("quem separou não confere", RN-03) mora no serviço, na checagem e no WHERE do claim.
  app.put('/api/almoxarifado/requisicoes/:id/conferir-separacao', requirePermission('conferir_separacao'), (req, res) => {
    requisitionService.conferirSeparacao(db, req.params.id, req.user)
      .then((result) => res.json(result))
      .catch((e) => res.status(e.status || 500).json({ error: e.message }));
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
          // Etapa 18 (RN-07): a requisicao cancelada nao deixava rastro — `rejeicao_motivo` guarda
          // o motivo, mas nao QUEM cancelou nem de QUAL status. `r` foi lido antes do UPDATE, entao
          // `r.status` ainda e o status anterior (o gravado ja e 'CANCELADO' — o literal do modulo
          // e CANCELADO, nao CANCELADA).
          //
          // A auditoria e encadeada na MESMA promessa, antes do `.finally` que responde: a rota e
          // callback aninhado e converte-la para `async` seria reescrever um handler que funciona
          // so para pendurar um log. Como o primeiro `.catch` ja absorveu a falha da liberacao de
          // reservas, o `.catch` de baixo so ve erro de auditoria — e nenhum dos dois impede o
          // `res.json`, porque o cancelamento ja esta efetivado.
          reservationService.liberarReservasDaRequisicao(db, req.user, req.params.id, motivo || 'Requisição cancelada')
            .catch((e) => console.warn('Liberação de reservas no cancelamento:', e.message))
            .then(() => audit.registrarAuditoria(db, {
              entidade: 'requisicao', entidade_id: Number(req.params.id), acao: 'CANCELAMENTO',
              usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
              dados_anteriores: { status: r.status },
              dados_novos: { status: 'CANCELADO', numero: r.numero },
              justificativa: motivo || null,
            }))
            .catch((errAudit) => console.error('[almoxarifado] Falha ao registrar auditoria de cancelamento de requisição:', errAudit.message))
            .finally(() => res.json({ success: true }));
        });
    });
  });

  // DELETE /api/almoxarifado/requisicoes/:id — exclusão administrativa (soft delete + estorno)
  //
  // Etapa 18 (RN-07): a spec 23 AFIRMAVA que excluir requisicao auditava — era falso
  // (`requisitionService` tem zero chamadas de `registrarAuditoria`; so os estornos apareciam, e
  // como `movimentacao`). O ato que mais apaga coisa do fluxo era o unico sem linha propria.
  //
  // O `dbGet` tem de vir ANTES do servico: `excluirRequisicao` nao devolve `status` nem `numero`,
  // e depois dele o status JA e 'CANCELADO' — ler no fim registraria "de CANCELADO para
  // CANCELADO", que nao conta historia nenhuma. Mesmo filtro do servico (`COALESCE(ativo,1)=1`)
  // para as duas leituras concordarem sobre o que e "requisicao viva".
  app.delete('/api/almoxarifado/requisicoes/:id', async (req, res) => {
    if (!canDeleteAlmoxRequisicao(req.user)) {
      return res.status(403).json({ error: 'Apenas administradores do Almoxarifado ou Super Administrador podem excluir requisições' });
    }
    const justificativa = req.body?.justificativa || req.query?.justificativa;
    try {
      const antes = await dbGet(db,
        'SELECT id, numero, status FROM requisicoes_almoxarifado WHERE id = ? AND COALESCE(ativo, 1) = 1',
        [req.params.id]);
      const result = await requisitionService.excluirRequisicao(db, req.params.id, req.user, justificativa, alertService);

      // Pos-escrita e best-effort: a exclusao (e os estornos de estoque) ja aconteceram.
      if (antes) {
        try {
          await audit.registrarAuditoria(db, {
            entidade: 'requisicao', entidade_id: antes.id, acao: 'EXCLUSAO',
            usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
            dados_anteriores: { status: antes.status },
            // `estornos` e um ARRAY de { material_id, quantidade } — o log guarda quantos
            // materiais voltaram para o estoque, nao o array inteiro.
            dados_novos: { numero: antes.numero, estornos: (result.estornos || []).length },
            justificativa: justificativa || null,
          });
        } catch (errAudit) {
          console.error('[almoxarifado] Falha ao registrar auditoria de exclusão de requisição:', errAudit.message);
        }
      }

      res.json(result);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
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
    // Etapa 32: `uploadsAnexosDir` desce como 5o parametro pelo MESMO motivo do 4o — e ele que a
    // extended usa no `destination` do multer de anexo. Sem este argumento a rota registra
    // normalmente e so morre no primeiro upload real, com a suite de unidade inteira verde: o
    // modo de falha exato da Etapa 25.
    require('./almoxarifado/extended')(app, db, authenticateToken, uploadsAlmoxDir, uploadsAnexosDir);
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

  // ── Etapa 12, Task 3 — jobs de notificacao (RN-01/03, RN-06, RN-07) ────────────────────────
  // Nunca testados por setInterval: os testes chamam `processarFila`/as varreduras DIRETO
  // (mesmo padrao do job de lembretes acima).

  // Job A — worker da fila de notificacoes. O intervalo (`notificacoes_worker_intervalo_min`,
  // config, default 5) e lido UMA vez, DENTRO do primeiro timer (30s pos-boot) — revisao da
  // Task 3 (M5): a versao anterior lia a config na mesma volta do event loop em que
  // `initSchema(db)` (nao-awaited, ~:101) ainda estava criando a tabela; em banco novo o
  // `.catch` engolia o erro e o worker ficava no default 5 sem aviso ate o 2o boot. Aos 30s o
  // schema ja assentou. Alternativa descartada: reler a cada disparo (SELECT por tick so para
  // decidir o proprio proximo tick). Assimetria documentada (M6): o BACKOFF do processarFila
  // rele a config a cada execucao — mudar em Configuracoes muda o backoff na hora e o
  // intervalo do tick so apos reiniciar o processo.
  setTimeout(() => {
    dbGet(db, `SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'notificacoes_worker_intervalo_min'`, [])
      .catch(() => null)
      .then((row) => {
        const n = parseFloat(row?.valor);
        const workerIntervalMin = Number.isFinite(n) && n > 0 ? n : 5;
        const WORKER_INTERVAL_MS = workerIntervalMin * 60 * 1000;
        const runNotificationWorker = () => {
          notificationQueueService.processarFila(db).catch((err) => {
            console.warn('[almoxarifado-notificacoes] Erro no worker da fila:', err.message);
          });
        };
        runNotificationWorker();
        setInterval(runNotificationWorker, WORKER_INTERVAL_MS).unref();
      });
  }, 30 * 1000).unref();

  // Job B — varreduras diarias (lembrete de ferramenta vencida, lote proximo do vencimento,
  // remessa a terceiro vencida e, desde a Etapa 16, os 7 alertas do registro via
  // varrerAlertasRegistrados). Uma vez por dia basta: o dedupe de cada varredura ja e por
  // dia/validade/prazo/estado (RN-06/RN-07 da E12; C3 da E16), entao rodar mais vezes so
  // custaria SELECTs extras sem gerar e-mail a mais.
  const DAILY_SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const runDailyNotificationScans = () => {
    Promise.all([
      notificationQueueService.varrerLembretesFerramenta(db),
      notificationQueueService.varrerLotesVencendo(db),
      notificationQueueService.varrerRemessasVencidas(db),
      notificationQueueService.varrerAlertasRegistrados(db),
    ]).catch((err) => {
      console.warn('[almoxarifado-notificacoes] Erro nas varreduras diarias:', err.message);
    });
  };
  setTimeout(runDailyNotificationScans, 30 * 1000).unref();
  setInterval(runDailyNotificationScans, DAILY_SCAN_INTERVAL_MS).unref();
};
