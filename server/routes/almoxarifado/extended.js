/**
 * Extended API routes for almoxarifado v3
 */
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
const { canConfigureAlmox, isSystemAdmin } = require('../../services/systemPermissions');
const { initSchema, TIPOS_MATERIAL_ENUM, TIPOS_LOCALIZACAO, SETORES_REQUISICAO } = require('../../services/almoxarifado/schema');
const { requirePermission, can, getPerfilFromUser, ACAO_PERFIS, PERFIS } = require('../../services/almoxarifado/permissions');
const { dbAll, dbGet, dbRun } = require('../../services/almoxarifado/db');
// Etapa 33: a URL de arquivo e minada no ponto unico do modulo, nunca montada aqui.
const { enrichMaterialRows } = require('../../services/almoxarifado/materialPhoto');
const { disponivelSql } = require('../../services/almoxarifado/availabilitySql');
// Etapa 27, Task 2: a MESMA conversao numerica que a regua da tolerancia aplica a medida, reusada
// no CRUD do plano de proposito. Ela existe porque `Number(null)`, `Number('')` e `Number([])` sao
// 0 — todos passariam por `Number.isFinite` como "nominal zero" — e porque `Number('12,4')` (a
// virgula decimal de um input pt-BR) e NaN: um NaN gravado como `valor_nominal` faria TODA peca
// reprovar depois, por comparacao com NaN.
const { paraNumeroFinito } = require('../../services/almoxarifado/toleranciaInspecao');
const { validate, formatZodError } = require('../../services/almoxarifado/validation');
const { CentroCustoSchema, AlmoxarifadoSchema, MovimentacaoSchema, RegularizacaoSchema, CancelamentoSchema, DevolucaoClienteSchema, RemessaTerceiroSchema, RetornoRemessaSchema, TransformacaoRemessaSchema, EncerramentoRemessaSchema, CancelamentoRemessaSchema, SobraUpdateSchema, GerarRetalhoSchema, SucateamentoCreateSchema, SucateamentoDestinoFormSchema, FerramentaCreateSchema, FerramentaUpdateSchema, EmprestimoSchema, DevolucaoEmprestimoSchema, CalibracaoSchema, JustificativaSchema, ManutencaoSchema, ManutencaoConcluirSchema, OcorrenciaSchema, AssinaturaEntregaFormSchema, AnexoCreateSchema } = require('../../services/almoxarifado/schemas');
// Etapa 20 (C1): a limpeza do upload orfao SAIU deste arquivo para um modulo compartilhado —
// era uma `function` local do closure de `registerExtendedRoutes` e `routes/almoxarifado.js`
// (rota de foto de material) nao a alcancava. Importada com ALIAS de proposito: o nome
// `limparUploadOrfao` era o da funcao local, e a versao compartilhada tem assinatura
// DIFERENTE — recebe o diretorio como 2o argumento, porque ele nao e constante de modulo (vem
// do 4o parametro de registerExtendedRoutes, abaixo). O alias `...Em` obriga a ler a chamada e
// ver o `uploadsAlmoxDir`, em vez de deixar uma chamada de 1 argumento silenciosamente errada.
const { limparUploadOrfao: limparUploadOrfaoEm } = require('../../services/almoxarifado/uploadCleanup');
const { registrarAuditoria } = require('../../services/almoxarifado/audit');
// Etapa 19 (C0): o binding desestruturado acima e resolvido no require e cacheado — um teste
// nao consegue substitui-lo por um stub que lanca, e a RN-02 ("auditoria nunca derruba o ato")
// viraria um teste VAZIO neste arquivo: passaria verde sem jamais ter derrubado auditoria
// nenhuma. As chamadas NOVAS usam `audit.registrarAuditoria(...)`, resolvido na hora da
// chamada e por isso alcancavel pelo stub. A chamada antiga (perfis-usuario) fica como esta de
// proposito — esta etapa acrescenta, nao reescreve o que ja funciona. Mesmo movimento que
// `routes/almoxarifado.js:45` fez na Etapa 18.
const audit = require('../../services/almoxarifado/audit');
// Etapa 22 (C1/C2/C3): vocabulario e calendario da trilha de auditoria. Modulos PUROS — a rota
// nao traduz nem calcula fuso por conta propria, e a tela tambem nao: quem le a trilha ve o
// mesmo rotulo e o mesmo de/para que o teste de servidor congela.
const auditLabels = require('../../services/almoxarifado/auditLabels');
const auditFiltros = require('../../services/almoxarifado/auditFiltros');
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
const deliverySignatureService = require('../../services/almoxarifado/deliverySignatureService');
// Etapa 32: anexos de documento. O servico NAO toca em disco — quem grava e o multer daqui, quem
// apaga o orfao e o `limparUploadOrfaoEm`.
const anexoService = require('../../services/almoxarifado/anexoService');
const reportService = require('../../services/almoxarifado/reportService');
const sectorMaterialService = require('../../services/almoxarifado/sectorMaterialService');
const purchaseService = require('../../services/almoxarifado/purchaseService');
// Etapa 8, Task 8: entra no lugar do clientMaterialService removido na Task 7. Nao e o mesmo
// papel: aquele ERA a ilha (tabela propria, fora do motor); este so LE o que o motor ja gravou.
const clienteEstoqueService = require('../../services/almoxarifado/clienteEstoqueService');
const thirdPartyService = require('../../services/almoxarifado/thirdPartyService');
const notificationQueueService = require('../../services/almoxarifado/notificationQueueService');
// Etapa 16, Task 1: fonte unica da regua do relatorio `materiais-sem-endereco` (extraida para
// o registro de alertas — ver o comentario na entrada do mapa `reports`).
const alertRegistry = require('../../services/almoxarifado/alertRegistry');
// Etapa 13, Task 1 (RN-01): registro puro de metadados dos relatorios — sem `fn` (ver cabecalho
// do arquivo). `fn` e ligada logo antes do dispatcher, apos o mapa `reports` estar montado.
const { RELATORIOS } = require('../../services/almoxarifado/reportRegistry');

function handleError(res, err) {
  const status = err.status || 500;
  res.status(status).json({ error: err.message });
}

// Etapa 19 (RN-02): auditoria POS-ESCRITA e best-effort. Quando esta funcao roda o efeito ja
// aconteceu no banco — derrubar a resposta por causa do log desfaria nada e devolveria erro
// para um ato que deu certo. O `console.error` e a unica saida do erro, de proposito.
async function auditar(db, payload, contexto) {
  try {
    await audit.registrarAuditoria(db, payload);
  } catch (err) {
    console.error(`[almoxarifado] Falha ao registrar auditoria de ${contexto}:`, err.message);
  }
}

// Quem assinou o ato. `nome || email` e a convencao ja usada nas chamadas da Etapa 18.
const autorDe = (req) => ({ usuario_id: req.user?.id, usuario_nome: req.user?.nome || req.user?.email });

// Etapa 19 (C5): o de/para de permissao de setor precisa ser LEGIVEL sem consultar outras
// tabelas (o log e lido meses depois, quando a familia pode ter sido renomeada ou excluida) e
// COMPACTO — `getPermissoesSetor` devolve `p.*` mais seis colunas de JOIN por linha.
const resumirPermissoes = (rows) => (rows || []).map((p) => ({
  familia_id: p.familia_id ?? null,
  categoria_id: p.categoria_id ?? null,
  material_id: p.material_id ?? null,
  nome: p.familia_nome || p.categoria_nome || p.material_nome || null,
}));

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

module.exports = function registerExtendedRoutes(app, db, authenticateToken, uploadsAlmoxDir, uploadsAnexosDir) {
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

  // ── Categorias de material (Etapa 26) ──────────────────────────────────────────────────────
  //
  // O `GET` ja existia e ja era consumido; a Etapa 26 acrescenta o CRUD. O molde e HIBRIDO, POR
  // ASSUNTO, e a escolha esta escrita aqui porque o molde OBVIO e o errado:
  //
  //   - Gate e auditoria: CENTROS DE CUSTO, logo abaixo neste arquivo — `requirePermission
  //     ('configurar')` e o helper `auditar(...)`/`autorDe(req)` do topo. O `auditarCadastro` de
  //     familias e closure NAO exportada de routes/almoxarifado.js:261: nao ha como chama-lo daqui.
  //   - Regua de nome e unicidade: SETORES (routes/almoxarifado.js:2041+) — `nome.trim()`,
  //     UNIQUE no banco, 400 nomeando o cadastro. Familias NAO tem unicidade de nome.
  //   - Soft delete: TIPOS DE MATERIAL na versao ja corrigida pela Etapa 23 — `AND ativo = 1`
  //     (sem ele o `changes` conta a linha que o WHERE CASOU, nao a que MUDOU, e a 2a exclusao
  //     vira uma linha de auditoria indistinguivel da real), 404 para inexistente, 200
  //     `ja_inativo` idempotente SEM auditar.
  //
  // FAMILIAS NAO E MOLDE DE NADA AQUI, e vale dizer por que: ela tem `parent_id`, validacao de
  // pai, bloqueio de inativacao com filhas e codigo automatico. E `categorias_material_almoxarifado`
  // TEM uma coluna `parent_id` — herdada da modelagem original e sem nenhum uso —, o que torna
  // "copiar familias" um erro facil de cometer sem perceber. Estas rotas nao a tocam.
  app.get('/api/almoxarifado/categorias', auth, async (req, res) => {
    try {
      // `?todos=1` (Etapa 26, C1): traz as INATIVAS junto. Sem ele a aba de Configuracoes nao
      // tem como REATIVAR o que desativou — a categoria desativada some da tela que a editaria e
      // "desativar nao apaga" vira promessa vazia.
      //
      // Escolhido o `?todos=1` dos CENTROS DE CUSTO (a linha logo abaixo) e nao o `?all=1` dos
      // setores nem o `?ativo=0|all` das familias: dois GETs vizinhos no mesmo arquivo com nomes
      // diferentes para o mesmo parametro e a divergencia que o proximo leitor paga.
      const where = req.query.todos === '1' ? '1=1' : 'ativo = 1';
      const rows = await dbAll(db, `SELECT * FROM categorias_material_almoxarifado WHERE ${where} ORDER BY nome`);
      res.json(rows);
    } catch (e) { handleError(res, e); }
  });

  // Mensagem UNICA da colisao de nome: a mesma frase no POST e no PUT. A tela mostra o
  // `error` do servidor cru, entao duas redacoes diferentes para o mesmo erro apareceriam
  // para o usuario como dois problemas diferentes.
  const CATEGORIA_DUPLICADA = 'Já existe uma categoria com este nome';

  app.post('/api/almoxarifado/categorias', auth, requirePermission('configurar'), async (req, res) => {
    try {
      const nome = String(req.body?.nome ?? '').trim();
      if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
      const r = await dbRun(db, 'INSERT INTO categorias_material_almoxarifado (nome) VALUES (?)', [nome]);
      // Log do que foi de FATO gravado (com `trim()`), nao do que chegou no body — mesma regra
      // do centro de custo abaixo.
      await auditar(db, {
        entidade: 'categoria', entidade_id: r.lastID, acao: 'CRIACAO', ...autorDe(req),
        dados_novos: { nome, ativo: 1 },
      }, 'criacao de categoria');
      res.status(201).json({ id: r.lastID, nome, ativo: 1 });
    } catch (e) {
      // A colisao e detectada pelo BANCO (idx_categorias_almox_nome), nao por um SELECT previo:
      // e a regua dos setores, e um SELECT-depois-INSERT tem janela de corrida entre os dois.
      if (/UNIQUE constraint/i.test(e.message)) return res.status(400).json({ error: CATEGORIA_DUPLICADA });
      handleError(res, e);
    }
  });

  app.put('/api/almoxarifado/categorias/:id', auth, requirePermission('configurar'), async (req, res) => {
    try {
      const atual = await dbGet(db, 'SELECT * FROM categorias_material_almoxarifado WHERE id = ?', [req.params.id]);
      if (!atual) return res.status(404).json({ error: 'Categoria não encontrada' });
      // Preserve-when-omitted: `ativo` omitido MANTEM o valor atual. Se caisse para 1, um
      // rename pela tela reativaria em silencio uma categoria desativada.
      const nome = req.body?.nome === undefined ? atual.nome : String(req.body.nome).trim();
      if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
      const ativo = req.body?.ativo === undefined ? atual.ativo : (req.body.ativo ? 1 : 0);

      await dbRun(db, 'UPDATE categorias_material_almoxarifado SET nome = ?, ativo = ? WHERE id = ?',
        [nome, ativo, req.params.id]);
      // de/para SIMETRICO nos campos que a rota escreve — `atual` e um SELECT * e carregaria
      // `id`, `parent_id` e `created_at`, ruido que nunca muda, dos dois lados.
      //
      // RN-05: renomear a categoria NAO reescreve `materiais.categoria` (a coluna e texto
      // livre). Isso e intencional e esta declarado no design; o aviso ao usuario e da tela.
      await auditar(db, {
        entidade: 'categoria', entidade_id: Number(req.params.id), acao: 'EDICAO', ...autorDe(req),
        dados_anteriores: { nome: atual.nome, ativo: atual.ativo },
        dados_novos: { nome, ativo },
      }, 'edicao de categoria');
      res.json({ id: Number(req.params.id), nome, ativo });
    } catch (e) {
      if (/UNIQUE constraint/i.test(e.message)) return res.status(400).json({ error: CATEGORIA_DUPLICADA });
      handleError(res, e);
    }
  });

  app.delete('/api/almoxarifado/categorias/:id', auth, requirePermission('configurar'), async (req, res) => {
    try {
      const anterior = await dbGet(db, 'SELECT * FROM categorias_material_almoxarifado WHERE id = ?', [req.params.id]);
      // SOFT delete: a linha fica. Material ja classificado continua com o nome dela em
      // `materiais.categoria` — apagar a linha nao apagaria a classificacao (a coluna e texto),
      // mas tiraria a categoria de qualquer tela que a listasse para reativacao ou historico.
      const r = await dbRun(db, 'UPDATE categorias_material_almoxarifado SET ativo = 0 WHERE id = ? AND ativo = 1',
        [req.params.id]);
      // `changes === 0` tem DOIS significados, e quem os separa e o SELECT acima: linha
      // inexistente => 404; linha ja inativa => 200 idempotente SEM auditar (Etapa 23).
      if (r.changes === 0) {
        if (!anterior) return res.status(404).json({ error: 'Categoria não encontrada' });
        return res.json({ success: true, ja_inativo: true });
      }
      await auditar(db, {
        entidade: 'categoria', entidade_id: Number(req.params.id), acao: 'EXCLUSAO', ...autorDe(req),
        dados_anteriores: { nome: anterior.nome, ativo: anterior.ativo },
        dados_novos: { ativo: 0 },
      }, 'exclusao de categoria');
      res.json({ success: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Plano de inspeção do material (Etapa 27, contrato C4) ──────────────────────────────────
  //
  // O MOLDE É O CRUD DE CATEGORIAS, logo acima neste arquivo: `auditar(...)`/`autorDe(req)`, soft
  // delete `WHERE id = ? AND ativo = 1` (404 para inexistente, 200 `ja_inativo` idempotente SEM
  // auditar — lição da Etapa 23), colisão detectada PELO BANCO via índice único (o comentário de
  // :200 explica que SELECT-antes-do-INSERT tem janela de corrida) e preserve-when-omitted no
  // `ativo` do PUT. Famílias continua não sendo molde de nada aqui.
  //
  // TRÊS COISAS QUE O MOLDE NÃO COBRE, porque plano é FILHO DE UM MATERIAL e não catálogo global:
  //
  //   1. o GET EXIGE `?material_id=N`. Sem filtro obrigatório, a tela de um material mostraria o
  //      plano de todos os outros — e uma listagem global não tem leitor nenhum no produto.
  //   2. o `material_id` é VALIDADO em código (404). O molde não tem pai para validar, e A FK NÃO
  //      SEGURA NO HARNESS: os testes rodam com `PRAGMA foreign_keys = 0` e produção com `1`, ou
  //      seja, um material fantasma passaria no teste e falharia em produção. A validação em
  //      código é a única régua portável — a mesma conclusão do achado B8 sobre `plano_id`.
  //   3. o índice único é COMPOSTO e PARCIAL (`(material_id, caracteristica) WHERE ativo = 1`),
  //      o que muda o significado do 400 de duplicada: a mesma característica em OUTRO material é
  //      legítima, e depois de desativada ela pode voltar.
  //
  // O gate NÃO é `configurar` (que é [ADMINISTRADOR] sozinho) e sim a ação própria
  // `gerenciar_plano_inspecao` — ver a justificativa em permissions.js. O GET fica só com `auth`,
  // como o de categorias: quem inspeciona precisa ler o plano para saber o que medir.
  const PLANO_DUPLICADO = 'Já existe esta característica no plano deste material';
  const PLANO_FAIXA_INVERTIDA = 'O desvio inferior não pode ser maior que o superior';
  const PLANO_NAO_ENCONTRADO = 'Característica não encontrada';

  app.get('/api/almoxarifado/planos-inspecao', auth, async (req, res) => {
    try {
      const materialId = paraNumeroFinito(req.query.material_id);
      if (materialId === null) return res.status(400).json({ error: 'Material é obrigatório' });
      // `?todos=1` traz as INATIVAS junto — mesmo nome do parâmetro de categorias e centros de
      // custo (não `?all=1` dos setores): sem ele a tela não tem como REATIVAR o que desativou.
      const where = req.query.todos === '1' ? '' : ' AND ativo = 1';
      const rows = await dbAll(db,
        `SELECT * FROM planos_inspecao_almoxarifado WHERE material_id = ?${where} ORDER BY caracteristica`,
        [materialId]);
      res.json(rows);
    } catch (e) { handleError(res, e); }
  });

  // Leitura + validação dos campos numéricos, compartilhada entre POST e PUT: a régua da faixa
  // (`inf <= sup`) TEM de valer nos dois, senão a faixa inválida entra pela porta dos fundos de um
  // PUT parcial — e faixa invertida faz `avaliarMedida` devolver FAIXA_INVALIDA, ou seja, TODA
  // peça reprova e a divergência dimensional liga sozinha em todas.
  const validarFaixa = (inf, sup) => (inf > sup ? PLANO_FAIXA_INVERTIDA : null);

  app.post('/api/almoxarifado/planos-inspecao', auth, requirePermission('gerenciar_plano_inspecao'), async (req, res) => {
    try {
      const materialId = paraNumeroFinito(req.body?.material_id);
      if (materialId === null) return res.status(400).json({ error: 'Material é obrigatório' });
      const material = await dbGet(db, 'SELECT id FROM materiais_almoxarifado WHERE id = ?', [materialId]);
      if (!material) return res.status(404).json({ error: 'Material não encontrado' });

      const caracteristica = String(req.body?.caracteristica ?? '').trim();
      if (!caracteristica) return res.status(400).json({ error: 'Característica é obrigatória' });

      // Zero é nominal LEGÍTIMO (batimento, planeza, folga), então a checagem é `=== null` e não
      // falsy — `if (!valor_nominal)` recusaria o caso mais comum de desvio de forma.
      const valorNominal = paraNumeroFinito(req.body?.valor_nominal);
      if (valorNominal === null) return res.status(400).json({ error: 'Valor nominal é obrigatório' });

      // Desvio omitido é 0: o default do schema. Plano com os dois zerados é faixa de largura
      // zero — a medida tem de bater o nominal exatamente —, que é válido, não vazio.
      const desvioInf = paraNumeroFinito(req.body?.desvio_inferior) ?? 0;
      const desvioSup = paraNumeroFinito(req.body?.desvio_superior) ?? 0;
      const erroFaixa = validarFaixa(desvioInf, desvioSup);
      if (erroFaixa) return res.status(400).json({ error: erroFaixa });

      const unidade = req.body?.unidade === undefined || req.body.unidade === null
        ? null : String(req.body.unidade).trim() || null;

      const r = await dbRun(db,
        `INSERT INTO planos_inspecao_almoxarifado
           (material_id, caracteristica, unidade, valor_nominal, desvio_inferior, desvio_superior)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [materialId, caracteristica, unidade, valorNominal, desvioInf, desvioSup]);

      const criado = {
        id: r.lastID, material_id: materialId, caracteristica, unidade,
        valor_nominal: valorNominal, desvio_inferior: desvioInf, desvio_superior: desvioSup, ativo: 1,
      };
      // Log do que foi de FATO gravado (com `trim()` e com os números já convertidos), não do que
      // chegou no body — mesma regra de categoria e centro de custo.
      await auditar(db, {
        entidade: 'plano_inspecao', entidade_id: r.lastID, acao: 'CRIACAO', ...autorDe(req),
        dados_novos: criado,
      }, 'criacao de plano de inspecao');
      res.status(201).json(criado);
    } catch (e) {
      if (/UNIQUE constraint/i.test(e.message)) return res.status(400).json({ error: PLANO_DUPLICADO });
      handleError(res, e);
    }
  });

  app.put('/api/almoxarifado/planos-inspecao/:id', auth, requirePermission('gerenciar_plano_inspecao'), async (req, res) => {
    try {
      const atual = await dbGet(db, 'SELECT * FROM planos_inspecao_almoxarifado WHERE id = ?', [req.params.id]);
      if (!atual) return res.status(404).json({ error: PLANO_NAO_ENCONTRADO });

      // `material_id` NÃO é editável de propósito: mudar o pai seria mover uma característica de
      // material, e as medidas já gravadas (congeladas, RN-05) continuariam contando a história do
      // material antigo. Quem errou o material apaga e cria — é o caminho reversível.
      const caracteristica = req.body?.caracteristica === undefined
        ? atual.caracteristica : String(req.body.caracteristica).trim();
      if (!caracteristica) return res.status(400).json({ error: 'Característica é obrigatória' });

      const valorNominal = req.body?.valor_nominal === undefined
        ? atual.valor_nominal : paraNumeroFinito(req.body.valor_nominal);
      if (valorNominal === null) return res.status(400).json({ error: 'Valor nominal é obrigatório' });

      const desvioInf = req.body?.desvio_inferior === undefined
        ? atual.desvio_inferior : paraNumeroFinito(req.body.desvio_inferior);
      const desvioSup = req.body?.desvio_superior === undefined
        ? atual.desvio_superior : paraNumeroFinito(req.body.desvio_superior);
      if (desvioInf === null || desvioSup === null) {
        return res.status(400).json({ error: 'Desvio inválido' });
      }
      // A faixa é validada sobre o resultado da MISTURA (campo enviado + campo preservado), não só
      // sobre o que veio no body: mandar `desvio_inferior: 2` sozinho, contra um superior de 1 já
      // gravado, produz exatamente a faixa invertida que o POST recusa.
      const erroFaixa = validarFaixa(desvioInf, desvioSup);
      if (erroFaixa) return res.status(400).json({ error: erroFaixa });

      const unidade = req.body?.unidade === undefined ? atual.unidade
        : (req.body.unidade === null ? null : String(req.body.unidade).trim() || null);
      // Preserve-when-omitted: `ativo` omitido MANTÉM o valor atual. Se caísse para 1, corrigir o
      // nominal de uma característica desativada a RESSUSCITARIA em silêncio, e a inspeção voltaria
      // a exigir uma medida que ninguém pediu de volta.
      const ativo = req.body?.ativo === undefined ? atual.ativo : (req.body.ativo ? 1 : 0);

      await dbRun(db,
        `UPDATE planos_inspecao_almoxarifado
            SET caracteristica = ?, unidade = ?, valor_nominal = ?, desvio_inferior = ?,
                desvio_superior = ?, ativo = ?
          WHERE id = ?`,
        [caracteristica, unidade, valorNominal, desvioInf, desvioSup, ativo, req.params.id]);

      // de/para SIMÉTRICO nos campos que a rota escreve — `atual` é um SELECT * e carregaria `id`,
      // `material_id` e `created_at`, ruído que nunca muda, dos dois lados.
      //
      // RN-05: editar o plano NÃO reescreve inspeção antiga. As medidas guardam CÓPIAS do nominal
      // e dos desvios usados no ato, e é por isso que esta rota pode mudar o plano à vontade.
      await auditar(db, {
        entidade: 'plano_inspecao', entidade_id: Number(req.params.id), acao: 'EDICAO', ...autorDe(req),
        dados_anteriores: {
          caracteristica: atual.caracteristica, unidade: atual.unidade, valor_nominal: atual.valor_nominal,
          desvio_inferior: atual.desvio_inferior, desvio_superior: atual.desvio_superior, ativo: atual.ativo,
        },
        dados_novos: {
          caracteristica, unidade, valor_nominal: valorNominal,
          desvio_inferior: desvioInf, desvio_superior: desvioSup, ativo,
        },
      }, 'edicao de plano de inspecao');
      res.json({
        id: Number(req.params.id), material_id: atual.material_id, caracteristica, unidade,
        valor_nominal: valorNominal, desvio_inferior: desvioInf, desvio_superior: desvioSup, ativo,
      });
    } catch (e) {
      if (/UNIQUE constraint/i.test(e.message)) return res.status(400).json({ error: PLANO_DUPLICADO });
      handleError(res, e);
    }
  });

  app.delete('/api/almoxarifado/planos-inspecao/:id', auth, requirePermission('gerenciar_plano_inspecao'), async (req, res) => {
    try {
      const anterior = await dbGet(db, 'SELECT * FROM planos_inspecao_almoxarifado WHERE id = ?', [req.params.id]);
      // SOFT delete, e aqui ele não é só convenção: `medidas_inspecao_almoxarifado.plano_id` é
      // NOT NULL e aponta para esta linha. Apagar deixaria medida órfã apontando para o nada — a
      // prova da reprovação sem a característica que a produziu.
      const r = await dbRun(db, 'UPDATE planos_inspecao_almoxarifado SET ativo = 0 WHERE id = ? AND ativo = 1',
        [req.params.id]);
      // `changes === 0` tem DOIS significados, e quem os separa é o SELECT acima: linha
      // inexistente => 404; linha já inativa => 200 idempotente SEM auditar (Etapa 23).
      if (r.changes === 0) {
        if (!anterior) return res.status(404).json({ error: PLANO_NAO_ENCONTRADO });
        return res.json({ success: true, ja_inativo: true });
      }
      await auditar(db, {
        entidade: 'plano_inspecao', entidade_id: Number(req.params.id), acao: 'EXCLUSAO', ...autorDe(req),
        dados_anteriores: {
          caracteristica: anterior.caracteristica, valor_nominal: anterior.valor_nominal,
          desvio_inferior: anterior.desvio_inferior, desvio_superior: anterior.desvio_superior,
          ativo: anterior.ativo,
        },
        dados_novos: { ativo: 0 },
      }, 'exclusao de plano de inspecao');
      res.json({ success: true });
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
      // Log do que foi de FATO gravado (`trim()`), nao do que chegou no body.
      await auditar(db, {
        entidade: 'centro_custo', entidade_id: r.lastID, acao: 'CRIACAO', ...autorDe(req),
        dados_novos: { codigo: codigo.trim(), nome: nome.trim(), ativo: 1 },
      }, 'criacao de centro de custo');
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
      // de/para SIMETRICO nos campos que a rota escreve: `atual` e um SELECT * e carregaria
      // `id`/`created_at` — ruido que nunca muda, dos dois lados.
      await auditar(db, {
        entidade: 'centro_custo', entidade_id: Number(req.params.id), acao: 'EDICAO', ...autorDe(req),
        dados_anteriores: { codigo: atual.codigo, nome: atual.nome, ativo: atual.ativo },
        dados_novos: { codigo, nome, ativo },
      }, 'edicao de centro de custo');
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
      // O `perfil_explicito` vem junto (mesmo LEFT JOIN do GET acima) porque a auditoria precisa
      // do "de": sem ler ANTES de escrever, o upsert já apagou o valor anterior e a trilha só
      // consegue dizer o "para".
      const usuario = await dbGet(db, `
        SELECT u.id, u.nome, u.role, u.is_superadmin, u.admin_modulos,
               p.perfil as perfil_explicito
        FROM usuarios u
        LEFT JOIN perfil_almoxarifado_usuario p ON p.usuario_id = u.id
        WHERE u.id = ? AND u.ativo = 1`,
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

      const perfilAnterior = usuario.perfil_explicito || null;
      // Os dois lados da trilha têm a MESMA forma de propósito: a régua de leitura
      // (`auditLabels.alteracoesDaLinha`) é união de chaves, então chave que só existe de um
      // lado sairia na tela como `null -> valor` fingindo alteração. Espelha o corpo do C2.
      const fotoPerfil = (p) => ({
        usuario: usuario.nome,
        perfil: p || null,
        perfil_efetivo: p || PERFIS.PRODUCAO,
        origem: p ? 'explicito' : 'padrao',
      });

      // perfil vazio/null = voltar ao padrão (sem linha → fallback PRODUCAO)
      if (perfil === null || perfil === undefined || perfil === '') {
        await dbRun(db, 'DELETE FROM perfil_almoxarifado_usuario WHERE usuario_id = ?', [usuario.id]);
        // Etapa 24: este caminho retornava ANTES do registrarAuditoria lá de baixo — tirar o
        // acesso de alguém, o ato mais sensível do módulo, era invisível na trilha. Auditar aqui
        // e não só no fim, porque a resposta sai daqui.
        // Audita mesmo quando não havia perfil explícito: o que se registra é o ATO ("mandaram
        // voltar ao padrão"), não o diff — omitir por "não mudou nada" é a família de defeito
        // que esta etapa fecha.
        await registrarAuditoria(db, {
          entidade: 'perfil_almoxarifado_usuario',
          entidade_id: usuario.id,
          acao: 'EXCLUSAO',
          usuario_id: req.user?.id,
          usuario_nome: req.user?.nome,
          dados_anteriores: fotoPerfil(perfilAnterior),
          dados_novos: fotoPerfil(null),
        }).catch(() => { /* auditoria não bloqueia: o DELETE já foi commitado (Etapa 19) */ });
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
        dados_anteriores: fotoPerfil(perfilAnterior),
        dados_novos: fotoPerfil(perfil),
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
      await auditar(db, {
        entidade: 'almoxarifado', entidade_id: r.lastID, acao: 'CRIACAO', ...autorDe(req),
        dados_novos: {
          codigo: codigo.trim(), nome: nome.trim(), descricao: descricao || null, ativo: 1,
        },
      }, 'criacao de almoxarifado');
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
      await auditar(db, {
        entidade: 'almoxarifado', entidade_id: Number(req.params.id), acao: 'EDICAO', ...autorDe(req),
        dados_anteriores: {
          codigo: atual.codigo, nome: atual.nome, descricao: atual.descricao, ativo: atual.ativo,
        },
        dados_novos: { codigo, nome, descricao, ativo },
      }, 'edicao de almoxarifado');
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
      // Etapa 33 (fix-round): devolvia `foto` CRU. Nenhuma tela atual renderiza a foto do estoque,
      // entao nao ha defeito visivel hoje — mas a primeira que renderizar receberia '' do helper, e
      // o defeito apareceria longe daqui. Assinar na fonte fecha a mina. Achado da revisao.
      res.json(enrichMaterialRows(rows));
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

  // Etapa 29 (C35, contratos C1/C2): leitura da inspecao DECIDIDA. Ate aqui a Etapa 27 gravava as
  // medidas congeladas e nenhuma rota as lia. Sem gate novo de perfil (D6): mesma regua de
  // `/pendentes` e do GET `/planos-inspecao` — `auth` + acesso ao modulo; quem abre a tela le.
  // A ESCRITA (`/recebimentos/itens/:itemId/inspecionar`) continua gateada por `inspecionar`.
  //
  // Ordem de registro, para quem criar `GET /inspecoes/:id` no futuro: registre-a DEPOIS de
  // `/historico` e `/pendentes`, senao `historico` vira um `:id` que nao e numero. Hoje nao ha
  // colisao possivel — nenhuma `/inspecoes/:id` existe e `/:id/medidas` tem tres segmentos, que
  // nunca casam com dois (medido com Express real na revisao do plano, achado 3).
  app.get('/api/almoxarifado/inspecoes/historico', auth, async (req, res) => {
    try { res.json(await inspectionService.listarHistorico(db, req.query)); }
    catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/inspecoes/:id/medidas', auth, async (req, res) => {
    try {
      // `paraNumeroFinito` recusa 'abc', 'NaN', 'Infinity', '' — todos viram o MESMO 404 de
      // inspecao inexistente, porque para quem chama nao existe diferenca entre "esse id nao e
      // numero" e "esse numero nao e inspecao". Sem isto o SQLite coagiria o texto e devolveria
      // `[]` como se fosse decidida sem medida.
      const inspecaoId = paraNumeroFinito(req.params.id);
      const medidas = inspecaoId === null
        ? null
        : await inspectionService.listarMedidasDaInspecao(db, inspecaoId);
      if (medidas === null) return res.status(404).json({ error: 'Inspeção não encontrada' });
      res.json(medidas);
    } catch (e) { handleError(res, e); }
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
  // Mesmo ESPIRITO do unlink em routes/almoxarifado.js (apagar o certificado/foto anterior ao
  // substituir); aqui nao ha "anterior" para apagar — `registrarDestino` e transicao de UMA VIA SO
  // (a maquina de estados nao volta de VENDIDA/DESCARTADA para APROVADO, entao nao existe re-anexar
  // um comprovante ja aceito) — o arquivo que sobra e sempre de uma tentativa que FALHOU.
  //
  // Etapa 20 (C1): a implementacao mora em services/almoxarifado/uploadCleanup.js —
  // `limparUploadOrfaoEm(req, dir)`, importada no topo. O corpo foi extraido daqui SEM mudanca
  // de comportamento (mesmo `req.file?`, mesmo unlinkSync, mesmo console.warn); so a mensagem
  // do warn ficou generica, porque ela dizia "comprovante de sucata orfao" para as QUATRO rotas
  // deste arquivo que usam a funcao (destino, calibracao, ocorrencia e assinatura de entrega) —
  // ja mentia em tres delas.

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
        limparUploadOrfaoEm(req, uploadsAlmoxDir);
        return res.status(400).json({ error: `Dados inválidos — ${formatZodError(parsed.error)}` });
      }
      try {
        const payload = { ...parsed.data };
        if (req.file) payload.comprovante_arquivo = req.file.filename;
        res.json(await scrapDisposalService.registrarDestino(db, req.user, req.params.id, payload));
      } catch (e) {
        limparUploadOrfaoEm(req, uploadsAlmoxDir);
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
  // `limparUploadOrfaoEm` (uploadCleanup.js) para o 400 pos-upload (validacao ou regra de negocio).
  app.post('/api/almoxarifado/ferramentas/:id/calibracoes', auth, requirePermission('gerenciar_ferramentas'),
    uploadCertificadoCalibracao.single('certificado'), async (req, res) => {
      const parsed = CalibracaoSchema.safeParse(req.body);
      if (!parsed.success) {
        limparUploadOrfaoEm(req, uploadsAlmoxDir);
        return res.status(400).json({ error: `Dados inválidos — ${formatZodError(parsed.error)}` });
      }
      try {
        const certificadoPath = req.file ? req.file.filename : null;
        res.status(201).json(await toolService.registrarCalibracao(db, req.user, req.params.id, parsed.data, certificadoPath));
      } catch (e) {
        limparUploadOrfaoEm(req, uploadsAlmoxDir);
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
        limparUploadOrfaoEm(req, uploadsAlmoxDir);
        return res.status(400).json({ error: `Dados inválidos — ${formatZodError(parsed.error)}` });
      }
      try {
        const fotoPath = req.file ? req.file.filename : null;
        res.status(201).json(await toolService.registrarOcorrencia(db, req.user, req.params.id, parsed.data, fotoPath));
      } catch (e) {
        limparUploadOrfaoEm(req, uploadsAlmoxDir);
        handleError(res, e);
      }
    });

  app.get('/api/almoxarifado/ferramentas/:id/ocorrencias', auth, async (req, res) => {
    try { res.json(await toolService.listarOcorrencias(db, req.params.id)); }
    catch (e) { handleError(res, e); }
  });

  // ── Anexos de documento (Etapa 32) ────────────────────────────────────────────
  // Gravacao FLAT em uploadsAnexosDir — o diretorio IRMAO de uploads/almoxarifado (D1 do
  // design). NAO trocar por subpasta de uploadsAlmoxDir: `express.static(root)` serve as
  // subpastas de root tambem, e o anexo viraria publico pelos dois mounts de
  // routes/almoxarifado.js:~236-237, que nao passam por auth nenhuma. O diretorio chega como 5o
  // PARAMETRO desta funcao, pelo mesmo motivo do 4o: re-derivar de config/paths.js apontaria
  // para o diretorio de producao enquanto os testes rodam.
  const uploadAnexo = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        // `mkdirSync` aqui, alem do boot — achado da revisao adversarial. O diretorio e criado no
        // registro das rotas; se sumir DEPOIS (rotacao de disco, container efemero, limpeza), o
        // multer dava ENOENT e a rota devolvia **400 com o caminho absoluto do servidor no corpo**
        // — erro de infra vestido de erro do cliente, com path disclosure de brinde. Recriar custa
        // um syscall por upload e nao pode falhar de forma interessante.
        try { fs.mkdirSync(uploadsAnexosDir, { recursive: true }); } catch (e) { /* ja existe */ }
        cb(null, uploadsAnexosDir);
      },
      filename: (req, file, cb) => {
        // A extensao vem do MIME ACEITO, e nao de `path.extname(file.originalname)` — achado da
        // revisao adversarial, e a diferenca e concreta: o `fileFilter` confia no `Content-Type`
        // que o cliente manda, entao `fatura-nov.exe` declarado como `application/pdf` passava e
        // ia para o disco COMO `.exe`. Duas consequencias medidas: executavel no volume
        // persistente, que o backup do modulo leva inteiro; e o `<a download>` do componente
        // salvando `fatura-nov.exe` na maquina de quem clica em "Baixar" numa linha rotulada
        // "Nota fiscal". Derivar do mime nao valida conteudo (magic bytes seria o passo
        // seguinte), mas garante que nada executavel encoste no disco.
        const porMime = {
          'application/pdf': '.pdf',
          'image/jpeg': '.jpg', 'image/jpg': '.jpg',
          'image/png': '.png', 'image/webp': '.webp',
        };
        const ext = porMime[String(file.mimetype || '').toLowerCase()] || '.bin';
        cb(null, `anexo-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (/^(application\/pdf|image\/(jpeg|jpg|png|webp))$/i.test(file.mimetype)) return cb(null, true);
      cb(new Error('Anexo deve ser PDF ou imagem'));
    },
  });

  // Ordem canonica (D3 da Etapa 9b): auth -> requirePermission -> multer -> safeParse manual.
  // O gate e UMA acao so, entao vai na PORTA: o 403 sai antes de o multer gravar qualquer coisa
  // — precedente medido em permissoesRotas.api.test.js:515-534 e coberto aqui pela RN-04.
  app.post('/api/almoxarifado/anexos', auth, requirePermission('anexar_documento'),
    (req, res, next) => uploadAnexo.single('arquivo')(req, res, (err) => {
      // O erro do fileFilter e do limite chegam como excecao do multer, nao como 400 do Zod.
      // Sem este wrapper o `next(err)` cai no handler de erro do Express e vira 500 com stack.
      // O `limparUploadOrfaoEm` daqui e defesa em profundidade e NO-OP no caminho normal: o
      // multer ja apaga o parcial sozinho e nunca seta `req.file` nos caminhos de erro.
      if (!err) return next();
      limparUploadOrfaoEm(req, uploadsAnexosDir);
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo excede o limite de 10 MB' : err.message;
      return res.status(400).json({ error: msg });
    }),
    async (req, res) => {
      if (!req.file) return res.status(400).json({ error: 'Arquivo é obrigatório' });
      const parsed = AnexoCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        limparUploadOrfaoEm(req, uploadsAnexosDir);
        return res.status(400).json({ error: `Dados inválidos — ${formatZodError(parsed.error)}` });
      }
      try {
        res.status(201).json(await anexoService.registrarAnexo(db, req.user, parsed.data, req.file));
      } catch (e) {
        limparUploadOrfaoEm(req, uploadsAnexosDir);
        handleError(res, e);
      }
    });

  app.get('/api/almoxarifado/anexos', auth, requirePermission('visualizar'), async (req, res) => {
    try { res.json(await anexoService.listarAnexos(db, req.query)); }
    catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/anexos/:id/arquivo', auth, requirePermission('visualizar'), async (req, res) => {
    try {
      const anexo = await anexoService.getAnexoParaDownload(db, req.params.id);
      // `basename` e a guarda de travessia: mesmo que a coluna seja adulterada por outra via,
      // o caminho nunca sai de uploadsAnexosDir.
      const arquivo = path.join(uploadsAnexosDir, path.basename(anexo.arquivo_path));
      // Linha viva com arquivo ausente e estado ESPERADO (restore de banco sem restore de
      // uploads), nao erro de programa — 404 proprio, e nao o 500 do sendFile.
      if (!fs.existsSync(arquivo)) {
        return res.status(404).json({ error: 'Arquivo do anexo não encontrado' });
      }
      // `|| 'application/octet-stream'` e nao `if (mime)` — sem o default, `mime_type` nulo (linha
      // legada ou importada) deixava o `sendFile` adivinhar pela EXTENSAO do disco, e um `.html`
      // saia como `text/html`. O `attachment` ja impede render, mas o nosniff fecha a porta que
      // sobra: o app nao manda esse header em lugar nenhum (nao ha helmet no index.js).
      // BAIXAR deixa rastro — e isto e o controle compensatorio da B68, nao zelo. A decisao da
      // etapa e que QUALQUER pessoa com acesso ao modulo baixa QUALQUER anexo; a revisao
      // adversarial mediu a consequencia que faltava dizer: os ids sao sequenciais, entao um laco
      // `GET /anexos/1..N/arquivo` leva o acervo inteiro sem conhecer documento nenhum. Numa
      // decisao desenhada assim, a trilha e a unica coisa que separa "aberto" de "aberto e
      // invisivel" — sem ela nao ha prevencao NEM deteccao. Custo: uma linha de auditoria por
      // download, numa tabela que nada expurga (retencao e corte declarado da feature 23).
      // Reversivel apagando este bloco; registrado na letra B.
      auditar(db, {
        entidade: 'anexo', entidade_id: anexo.id, acao: 'BAIXAR_ANEXO', ...autorDe(req),
        dados_novos: { nome_original: anexo.nome_original },
      }, 'download de anexo');
      res.type(anexo.mime_type || 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // RFC 5987, e nao so `filename="..."` — achado da revisao adversarial, ACOPLADO ao mojibake
      // do `nome_original`. `res.setHeader` recusa qualquer caractere fora de \x20-\x7e\x80-\xff,
      // entao "Relatório – dimensional.pdf" (travessao U+2013), nome em chines ou com emoji dava
      // **500 "Invalid character in header content"**. Nao era alcancavel antes porque o latin1 do
      // busboy segurava por acidente; corrigir a gravacao sozinha teria trocado "nome errado na
      // tela" por "download quebrado". `filename` ASCII para o cliente burro, `filename*` UTF-8
      // para o resto — e o encodeURIComponent tambem mata a injecao de header por CR/LF.
      const nomeAnexo = String(anexo.nome_original || 'anexo');
      const asciiSeguro = nomeAnexo.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '') || 'anexo';
      res.setHeader('Content-Disposition',
        `attachment; filename="${asciiSeguro}"; filename*=UTF-8''${encodeURIComponent(nomeAnexo)}`);
      res.sendFile(arquivo);
    } catch (e) { handleError(res, e); }
  });

  app.delete('/api/almoxarifado/anexos/:id', auth, requirePermission('remover_anexo'), async (req, res) => {
    try { res.json(await anexoService.removerAnexo(db, req.user, req.params.id)); }
    catch (e) { handleError(res, e); }
  });

  // ── Assinatura digital da entrega de requisicao (Etapa 15, Task 1 — contrato C1) ─────────────
  // Upload CLONE de uploadFotoOcorrencia (acima): gravacao FLAT em uploadsAlmoxDir com prefixo
  // `assinatura-`, SEM subpasta (D3: o multer nao cria diretorio — ENOENT no primeiro upload).
  // Filtro SO imagem (sem PDF, diferente dos comprovantes): o que chega aqui e o PNG do canvas
  // de assinatura; 2MB porque um traco exportado de canvas nao passa disso.
  const uploadAssinatura = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsAlmoxDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `assinatura-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
      },
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (/^image\/(jpeg|jpg|png|webp)$/i.test(file.mimetype)) return cb(null, true);
      cb(new Error('Assinatura deve ser imagem (PNG, JPEG ou WebP)'));
    },
  });

  // POST /requisicoes/:id/assinatura-entrega — multipart, arquivo `assinatura` OBRIGATORIO.
  // Ordem canonica: auth -> requirePermission -> multer -> safeParse manual (mesmo desenho de
  // /calibracoes e /ocorrencias acima — o gate e uma acao so, vai na PORTA, antes do multer
  // gravar em disco; RN-05). NAO usa o middleware validate(): ele responderia o 400 do Zod
  // ANTES do handler e o arquivo ja gravado ficaria orfao — `limparUploadOrfaoEm` em TODA saida
  // que nao for 201. RN-03 (status da requisicao) mora no SERVICO, com a mensagem literal do
  // contrato, e cai no catch. Gate `separar_emitir`: quem entrega e quem colhe a assinatura —
  // o recebedor e um nome digitado + traco na tela, nao um usuario do sistema.
  app.post('/api/almoxarifado/requisicoes/:id/assinatura-entrega', auth, requirePermission('separar_emitir'),
    uploadAssinatura.single('assinatura'), async (req, res) => {
      const parsed = AssinaturaEntregaFormSchema.safeParse(req.body);
      if (!parsed.success) {
        limparUploadOrfaoEm(req, uploadsAlmoxDir);
        return res.status(400).json({ error: `Dados inválidos — ${formatZodError(parsed.error)}` });
      }
      if (!req.file) {
        return res.status(400).json({ error: "Assinatura é obrigatória — envie a imagem no campo 'assinatura'." });
      }
      try {
        const assinatura = await deliverySignatureService.registrarAssinatura(
          db, req.user, req.params.id,
          { recebedor_nome: parsed.data.recebedor_nome, arquivo: req.file.filename },
        );
        res.status(201).json({ success: true, assinatura });
      } catch (e) {
        limparUploadOrfaoEm(req, uploadsAlmoxDir);
        handleError(res, e);
      }
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
  // Etapa 14, Task 1 (D9, EMENDA da Fase 2 C2 — medido com a rota real): as duas rotas abaixo
  // estavam em `requirePermission('configurar')` (SO ADMINISTRADOR) — COMPRAS gera a
  // solicitacao (gerenciar_reposicao, Etapa 11) e nao conseguia vincula-la ao pedido, o passo
  // seguinte do proprio comprador. ABERTURA de gate deliberada: GESTOR e COMPRAS passam a
  // poder (letra B do doc de novidades da Etapa 14).
  app.post('/api/almoxarifado/compras/verificar-minimos', auth, requirePermission('gerenciar_reposicao'), async (req, res) => {
    try { res.json({ criadas: await purchaseService.verificarEstoqueMinimo(db, req.user) }); }
    catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/compras/solicitacoes/:id/vincular-pedido', auth, requirePermission('gerenciar_reposicao'), async (req, res) => {
    try {
      res.json(await purchaseService.vincularPedidoCompra(db, req.params.id, req.body.pedido_compra_id));
    } catch (e) { handleError(res, e); }
  });

  // Etapa 14, Task 1 (RN-02, D3): cancelamento manual — mesmo gate de quem gera a solicitacao
  // (gerenciar_reposicao): quem pode criar pode desfazer. Justificativa obrigatoria, validada
  // no servico (o literal exato e o contrato congelado do design).
  app.post('/api/almoxarifado/compras/solicitacoes/:id/cancelar', auth, requirePermission('gerenciar_reposicao'), async (req, res) => {
    try {
      res.json(await purchaseService.cancelarSolicitacao(db, req.user, req.params.id, req.body?.motivo));
    } catch (e) { handleError(res, e); }
  });

  // Etapa 14, Task 2 (RN-04, D5): contexto do comprador para UM material — disponivel/reservado/
  // em terceiros/consumo/ultimo custo de entrada/solicitacoes abertas. Mesmo gate do pipeline de
  // compra (D9). Shape e o CONTRATO CONGELADO do design — a tela (Task 4) ja consome este shape.
  app.get('/api/almoxarifado/compras/contexto-material/:id', auth, requirePermission('gerenciar_reposicao'), async (req, res) => {
    try {
      res.json(await purchaseService.contextoMaterial(db, req.params.id));
    } catch (e) { handleError(res, e); }
  });

  // ── Reposição (Etapa 11) — RN-01..RN-08 do design. Gate proprio: decidir compra e
  // gestao/compras (ALMOXARIFE fora de proposito, D9).
  app.get('/api/almoxarifado/reposicao/sugestoes', auth, requirePermission('gerenciar_reposicao'), async (req, res) => {
    try { res.json(await purchaseService.calcularSugestoes(db)); }
    catch (e) { handleError(res, e); }
  });

  // POST /gerar-solicitacoes (RN-09) — material_ids AUSENTE = todas as sugestoes do momento;
  // `[]` = NENHUMA (Fase 2: desmarcar tudo e clicar nao pode disparar o catalogo inteiro).
  app.post('/api/almoxarifado/reposicao/gerar-solicitacoes', auth, requirePermission('gerenciar_reposicao'), async (req, res) => {
    try {
      const { material_ids } = req.body || {};
      if (material_ids !== undefined
          && (!Array.isArray(material_ids) || material_ids.some((x) => typeof x !== 'number'))) {
        return res.status(400).json({ error: 'Lista de materiais inválida' });
      }
      res.json(await purchaseService.gerarSolicitacoesDaSugestao(db, req.user, material_ids));
    } catch (e) { handleError(res, e); }
  });

  // GET /estoque-parado (RN-07) — excesso, sem consumo, obsoleto.
  app.get('/api/almoxarifado/reposicao/estoque-parado', auth, requirePermission('gerenciar_reposicao'), async (req, res) => {
    try {
      const { tipo } = req.query;
      // `tipo` VAZIO e o "Todos" do select da tela — trata como ausente, nao como erro
      // (Fase 2: `?tipo=` tomava 400 e a propria tela nova quebrava).
      if (tipo && !['EXCESSO', 'SEM_CONSUMO', 'OBSOLETO'].includes(tipo)) {
        return res.status(400).json({ error: 'Tipo inválido (use EXCESSO, SEM_CONSUMO ou OBSOLETO)' });
      }
      res.json(await purchaseService.estoqueParado(db, tipo || undefined));
    } catch (e) { handleError(res, e); }
  });

  // ── Notificacoes (Etapa 12, Task 1) — RN-01/02/03/08/09 do design. Gate proprio
  // (`gerenciar_notificacoes`, D7): reenviar e drenar a fila e operacao administrativa, COMPRAS
  // fica fora de proposito (mesmo criterio de gerenciar_reposicao/D9 na Etapa 11).
  app.get('/api/almoxarifado/notificacoes', auth, requirePermission('gerenciar_notificacoes'), async (req, res) => {
    try {
      const { status, evento } = req.query;
      if (status && !notificationQueueService.STATUS_VALIDOS.includes(status)) {
        return res.status(400).json({ error: 'Status inválido (use PENDENTE, ENVIADO ou FALHA)' });
      }

      // Resumo do CONJUNTO INTEIRO (semantica da Etapa 11: cards de resumo nao seguem o filtro
      // de `itens` — a tela mostra o total pendente/enviado/falha independente do que a tabela
      // esta filtrando no momento).
      const resumo = await dbGet(db, `SELECT
          SUM(CASE WHEN status = 'PENDENTE' THEN 1 ELSE 0 END) AS pendentes,
          SUM(CASE WHEN status = 'ENVIADO' THEN 1 ELSE 0 END) AS enviadas,
          SUM(CASE WHEN status = 'FALHA' THEN 1 ELSE 0 END) AS falhas
        FROM fila_notificacoes_almoxarifado`);

      // Colunas NOMEADAS pelo contrato congelado do design (revisao da Task 1, Important v):
      // SELECT * vazava hash_dedupe/corpo_html/corpo_texto/proxima_tentativa_em para o front —
      // detalhe de implementacao e corpo inteiro em cada linha da listagem.
      let sql = `SELECT id, evento, destinatarios, assunto, status, tentativas, ultimo_erro,
        enviado_em, created_at, payload FROM fila_notificacoes_almoxarifado WHERE 1=1`;
      const params = [];
      if (status) { sql += ' AND status = ?'; params.push(status); }
      if (evento) { sql += ' AND evento = ?'; params.push(evento); }
      sql += ' ORDER BY id DESC LIMIT 200';
      const itens = await dbAll(db, sql, params);

      res.json({
        itens,
        resumo: {
          pendentes: resumo?.pendentes || 0,
          enviadas: resumo?.enviadas || 0,
          falhas: resumo?.falhas || 0,
        },
      });
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/notificacoes/:id/reenviar', auth, requirePermission('gerenciar_notificacoes'), async (req, res) => {
    try {
      const resultado = await notificationQueueService.reenviar(db, req.user, Number(req.params.id));
      res.json(resultado);
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/notificacoes/processar', auth, requirePermission('gerenciar_notificacoes'), async (req, res) => {
    try {
      const resultado = await notificationQueueService.processarFila(db);
      res.json(resultado);
    } catch (e) { handleError(res, e); }
  });

  // ── Central de alertas (Etapa 16, Task 2) — C1/RN-01/RN-04/RN-05 do design. Avaliacao AO
  // VIVO pelo MESMO registro da varredura diaria (fonte unica — a logica mora em
  // alertRegistry.montarCentral, ver o porque la). Gate proprio `ver_alertas` (C5): a central
  // expoe numeros de estoque e valor parado, PRODUCAO/ENGENHARIA/CONSULTA fora (licao G1).
  app.get('/api/almoxarifado/alertas/central', auth, requirePermission('ver_alertas'), async (req, res) => {
    try {
      res.json(await alertRegistry.montarCentral(db));
    } catch (e) { handleError(res, e); }
  });

  // ── Auditoria ──
  //
  // Etapa 18 (RN-06, C5): a rota tinha SO `auth` — qualquer usuario com acesso ao modulo lia o
  // log inteiro, inclusive `dados_anteriores/novos` de material, custo e requisicao. Isso e
  // exposicao ATUAL, nao feature nova, e por isso o gate entrou nesta etapa mesmo com a tela de
  // auditoria fora de escopo. `configurar` = so ADMINISTRADOR, o mesmo gate das telas de
  // administracao; se um dia o Gestor precisar ler auditoria, abre-se o gate para ele — nao se
  // deixa aberto para todos. Verificado antes de fechar: nenhuma tela do client e nenhuma rota
  // interna consomem esta rota.
  app.get('/api/almoxarifado/auditoria', auth, requirePermission('configurar'), async (req, res) => {
    try {
      let sql = 'SELECT * FROM auditoria_log_almoxarifado WHERE 1=1';
      const params = [];
      if (req.query.entidade) { sql += ' AND entidade = ?'; params.push(req.query.entidade); }
      if (req.query.entidade_id) { sql += ' AND entidade_id = ?'; params.push(req.query.entidade_id); }
      // ── Etapa 22, Task 2 (C1): os quatro filtros novos ──
      if (req.query.usuario_id) { sql += ' AND usuario_id = ?'; params.push(req.query.usuario_id); }
      // `acao` e UM parametro so, string com virgulas (`acao=CRIACAO,CRIAR`), porque o axios do
      // client (`services/api.js`) e um `axios.create()` SEM `paramsSerializer`: mandar array
      // viraria `acao[]=A&acao[]=B`, o parser `extended` do Express entregaria ARRAY aqui, e um
      // `.split(',')` cru estouraria TypeError -> 500. A normalizacao aceita os dois formatos.
      //
      // UM PLACEHOLDER POR VALOR, nunca `IN (?)` com a string inteira: `WHERE acao IN (?)` com o
      // parametro 'CRIACAO,CRIAR' devolve ZERO LINHAS SEM ERRO (reproduzido). Numa trilha de
      // auditoria, zero em silencio parece prova de que nada aconteceu — e o mesmo perigo que
      // motiva a RN-03. Precedente da base: stockService.js:1363.
      const verbos = (Array.isArray(req.query.acao) ? req.query.acao : String(req.query.acao || '').split(','))
        .map((v) => String(v).trim()).filter(Boolean);
      if (verbos.length) {
        sql += ` AND acao IN (${verbos.map(() => '?').join(',')})`;
        params.push(...verbos);
      }
      // Datas (RN-03 + RN-04). A validacao roda ANTES do COUNT: com data podre nao existe
      // resposta parcial correta, e um 200 com `itens: []` seria lido como "nada aconteceu".
      // `Date.parse` sozinho nao serve — '2026-02-30' e valido em JS e rola no SQLite,
      // ALARGANDO a janela em silencio; `validarData` fecha isso com o ida-e-volta.
      for (const campo of ['data_inicio', 'data_fim']) {
        const valor = req.query[campo];
        if (valor === undefined || valor === '') continue;
        if (!auditFiltros.validarData(valor).ok) {
          throw Object.assign(new Error('Data inválida: use uma data real no formato AAAA-MM-DD'), { status: 400 });
        }
      }
      // Intervalo INVERTIDO (achado A3 da revisao adversarial): as duas datas podem ser
      // individualmente validas e o intervalo ser impossivel — `data_inicio=2026-08-20` com
      // `data_fim=2026-08-01` devolvia 200 com `itens: []`. E o MESMO modo de falha que a
      // RN-03 existe para matar, entrando pela outra porta: numa trilha de auditoria, lista
      // vazia parece prova de que nada aconteceu. Comparacao de string basta — as duas ja
      // passaram por `validarData`, entao sao AAAA-MM-DD, que ordena lexicograficamente.
      if (req.query.data_inicio && req.query.data_fim && req.query.data_inicio > req.query.data_fim) {
        throw Object.assign(
          new Error('Período inválido: a data inicial é posterior à data final'), { status: 400 });
      }
      // A janela vai para UTC ANTES do SQL: `created_at` e gravado por `CURRENT_TIMESTAMP`, que
      // e UTC, e quem filtra pensa em dia de Brasilia. Sem isto, um ato das 21:30 esta gravado
      // como 00:30 do dia seguinte e SOME do filtro do proprio dia. Nada de `date(?, '+1 day')`
      // cru no SQL: o SQLite so somaria um dia no dia UTC, que e o dia errado.
      const janela = auditFiltros.janelaUtc(req.query.data_inicio || null, req.query.data_fim || null);
      if (janela.de) { sql += ' AND created_at >= ?'; params.push(janela.de); }
      if (janela.ate) { sql += ' AND created_at < ?'; params.push(janela.ate); }
      // Desempate por `id DESC` (Etapa 18, C5): `created_at` e DATETIME com resolucao de SEGUNDO,
      // entao as auditorias de um mesmo ato (criar + contar, contar + concluir) empatam e a ordem
      // dentro do empate fica indefinida. Sem o desempate, ler a historia de uma conferencia pelo
      // log devolve os atos fora de ordem de vez em quando.
      // Paginacao explicita com total (achado A3 da revisao adversarial da Etapa 18,
      // reproduzido): o `LIMIT 200` cru truncava EM SILENCIO e engolia os atos mais VELHOS —
      // numa conferencia de 210 itens contados, a propria CRIACAO sumia da resposta e nada
      // no corpo dizia que faltava algo. Numa trilha de auditoria, truncar sem avisar e pior
      // que nao truncar. A resposta deixa de ser array puro e passa a declarar o corte;
      // nenhuma tela consome esta rota hoje (verificado), entao a mudanca de forma nao
      // quebra consumidor nenhum.
      const totalRow = await dbGet(db, sql.replace('SELECT *', 'SELECT COUNT(*) AS total'), params);
      const total = totalRow?.total || 0;
      const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 200, 1), 1000);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      sql += ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?';
      const linhas = await dbAll(db, sql, [...params, limite, offset]);
      // Etapa 22 (C1): a FORMA da resposta continua a da Etapa 18 e as 10 colunas saem como
      // estao no banco (`dados_*` seguem string JSON ou null). O que muda e que cada item ganha
      // TRES campos derivados. Eles ficam aqui, e nao na tela, porque a regua de leitura tem de
      // ter UM dono: com o mapa no client, a tela precisaria de `/opcoes` carregado antes de
      // renderizar a primeira linha, e a traducao viraria copia divergente do servidor.
      const itens = linhas.map((r) => ({
        ...r,
        acao_rotulo: auditLabels.rotularAcao(r.acao),
        entidade_rotulo: auditLabels.rotularEntidade(r.entidade),
        // NAO e `configDiff.calcularDiff` (achado A1): aquela itera so `Object.keys(novos)` e
        // por isso apaga a troca de segredo mascarada e fabrica alteracao a partir de campo de
        // contexto. A regua de LEITURA e a uniao das chaves — ver o cabecalho de auditLabels.js.
        alteracoes: auditLabels.alteracoesDaLinha(r.dados_anteriores, r.dados_novos),
      }));
      res.json({ total, limite, offset, truncado: total > offset + itens.length, itens });
    } catch (e) { handleError(res, e); }
  });

  // Opcoes dos filtros da trilha (Etapa 22, C2 / RN-05). Mesmo gate da listagem: a lista de quem
  // mexeu no modulo e de que entidades foram tocadas ja e informacao de auditoria.
  //
  // Tudo sai de `SELECT DISTINCT` do que esta REALMENTE gravado, nunca de lista hardcoded — as
  // etapas 18-20 criaram seis entidades novas, e um select que envelhece oferece filtro que nao
  // acha nada. Nao ha colisao com a rota acima: `app.get('/api/almoxarifado/auditoria')` casa
  // caminho EXATO, em qualquer ordem de registro (verificado na revisao da Fase 2).
  app.get('/api/almoxarifado/auditoria/opcoes', auth, requirePermission('configurar'), async (req, res) => {
    try {
      const [entidades, acoes, usuarios] = await Promise.all([
        dbAll(db, `SELECT DISTINCT entidade FROM auditoria_log_almoxarifado
                   WHERE entidade IS NOT NULL AND entidade <> '' ORDER BY entidade`),
        dbAll(db, `SELECT DISTINCT acao FROM auditoria_log_almoxarifado
                   WHERE acao IS NOT NULL AND acao <> '' ORDER BY acao`),
        // `usuario_id` e NULL-avel (ha atos sem `req.user`): sem o filtro, o select da tela
        // ganharia uma opcao `{ id: null }` que nao filtra nada.
        dbAll(db, `SELECT DISTINCT usuario_id, usuario_nome FROM auditoria_log_almoxarifado
                   WHERE usuario_id IS NOT NULL ORDER BY usuario_nome, usuario_id`),
      ]);

      // RN-06: sinonimo nao divide a lista — `CRIACAO` e `CRIAR` viram UMA opcao "Criação" com
      // os dois verbos, e e a lista inteira que volta no filtro, entao o usuario nao perde linha
      // por causa da inconsistencia do vocabulario. Verbo sem rotulo entra com o PROPRIO nome
      // (`rotularAcao` devolve o verbo quando nao ha grupo): sumir com ele esconderia atos.
      // So os verbos PRESENTES entram em `verbos` — mandar os ausentes nao mudaria resultado
      // nenhum e faria a rota afirmar que existe no banco o que nao existe.
      const porRotulo = new Map();
      for (const { acao } of acoes) {
        const rotulo = auditLabels.rotularAcao(acao);
        if (!porRotulo.has(rotulo)) porRotulo.set(rotulo, []);
        porRotulo.get(rotulo).push(acao);
      }

      res.json({
        entidades: entidades
          .map((e) => ({ valor: e.entidade, rotulo: auditLabels.rotularEntidade(e.entidade) }))
          .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
        acoes: [...porRotulo.entries()]
          .map(([rotulo, verbos]) => ({ rotulo, verbos }))
          .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
        usuarios: usuarios.map((u) => ({ id: u.usuario_id, nome: u.usuario_nome })),
      });
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
    // Etapa 13, Task 2 (RN-04): indicadores gerenciais — giro, cobertura, rupturas, valor por
    // grupo, atendimento de requisicoes. Devolve OBJETO (exportavel:false no registro).
    'indicadores': (db, q) => reportService.relatorioIndicadores(db, q),
    // Etapa 14, Task 3 (RN-05): custo por projeto, lido do livro. Mesma assinatura posicional de
    // consumo-periodo/consumo-os (data_inicio/data_fim extraidos da querystring aqui, nao dentro
    // do service — convencao do arquivo).
    'custo-por-projeto': (db, q) => reportService.relatorioCustoProjeto(db, q.data_inicio, q.data_fim),
    // Etapa 16, Task 1: a query (regua + comentario da classe C, que NAO filtra o dono de
    // proposito) foi EXTRAIDA para alertRegistry.listarMateriaisSemEndereco — fonte unica com
    // o alerta MATERIAL_SEM_ENDERECO, senao relatorio e alerta de mesmo nome divergiriam
    // (achado Critico 2 da revisao do plano da etapa). Comportamento identico ao anterior.
    'materiais-sem-endereco': (db) => alertRegistry.listarMateriaisSemEndereco(db),
  };

  // Exposto SO para o teste de paridade (relatoriosRegistro.api.test.js) inspecionar o PAR
  // INVERSO diretamente — "toda chave do mapa `reports` existe no registro" — sem precisar
  // reimplementar o mapa. Nao e consumido por nenhuma rota; producao ignora esta propriedade.
  registerExtendedRoutes.__reportKeys = Object.keys(reports);

  // Liga `fn` no registro puro (reportRegistry.js nao importa services do modulo de proposito —
  // ver cabecalho do arquivo) e valida o PAR NOS DOIS SENTIDOS na subida: toda chave de `reports`
  // (as funcoes reais, acima) tem de existir no registro, e toda chave do registro tem de ter
  // ganho uma funcao aqui. Sem este par inverso um relatorio poderia ficar SERVIVEL e FORA da
  // lista/gate — exatamente a classe de defeito ("relatorio novo esquece o gate", ja entrou 2x
  // por achado de revisao: 10b e 11) que este registro existe para matar. Falha alto e cedo
  // (throw na subida do processo), nunca em silencio.
  for (const tipo of Object.keys(reports)) {
    if (!RELATORIOS[tipo]) {
      throw new Error(`reportRegistry.js: chave '${tipo}' existe no dispatcher (extended.js) mas nao foi declarada no registro`);
    }
    RELATORIOS[tipo].fn = reports[tipo];
  }
  for (const tipo of Object.keys(RELATORIOS)) {
    if (!reports[tipo]) {
      throw new Error(`extended.js: chave '${tipo}' esta declarada em reportRegistry.js mas nao tem funcao ligada no dispatcher`);
    }
  }

  // RN-02: lista fail-closed. Nasce do registro filtrado por `can()` — a tela monta o menu a
  // partir dela e nunca oferece link que daria 403. NUNCA inclui `acao` (detalhe de autorizacao
  // nao vaza para a UI decidir).
  // Revisao da Task 1 (I2): a lista serve tambem exportavel/limite/nota — a RN-05 exige que a
  // tela esconda o Exportar do nao-tabular, avise "mostrando os primeiros N" e mostre a regua
  // no rodape; sem esses campos a tela teria de HARDCODAR os tres (a duplicacao que o registro
  // existe para matar). Alargamento ADITIVO do contrato da RN-02 (design corrigido dizendo que
  // o shape original estava estreito). `acao` continua NUNCA saindo (autorizacao nao vaza).
  app.get('/api/almoxarifado/relatorios', auth, (req, res) => {
    const relatorios = Object.entries(RELATORIOS)
      .filter(([, entrada]) => entrada.acao === null || can(req.user, entrada.acao))
      .map(([tipo, entrada]) => ({
        tipo, titulo: entrada.titulo, categoria: entrada.categoria, params: entrada.params,
        exportavel: entrada.exportavel, limite: entrada.limite, nota: entrada.nota,
        // Revisao da Task 3 (C1): a TELA tambem projeta a tabela pelas colunas declaradas —
        // sem servi-las, ela caia em Object.keys(linha) e renderizava as 64 colunas cruas do
        // SELECT * (custo_medio/proprietario_cliente_id como cabecalho, para qualquer usuario
        // do modulo), desfazendo na UI a decisao C2 do export. Mesmo alargamento aditivo.
        colunas: entrada.colunas,
      }));
    res.json({ relatorios });
  });

  // Revisao da Task 1 (M6): chave de prototipo ('constructor', '__proto__', 'toString') NAO e
  // relatorio — sem o hasOwnProperty, RELATORIOS['constructor'] devolve a funcao herdada e a
  // resposta sai fora dos literais congelados (o dispatcher antigo devolvia ate 200/500).
  const entradaDoRegistro = (tipo) => (
    Object.prototype.hasOwnProperty.call(RELATORIOS, tipo) ? RELATORIOS[tipo] : undefined
  );

  // RN-01/RN-03: gate e funcao resolvidos PELO REGISTRO — os literais 403/404 sao os mesmos de
  // antes do refactor (comportamento preservado; nenhum shape de rota existente muda).
  app.get('/api/almoxarifado/relatorios/:tipo', auth, async (req, res) => {
    try {
      const entrada = entradaDoRegistro(req.params.tipo);
      if (!entrada) return res.status(404).json({ error: 'Relatório não encontrado' });
      if (entrada.acao !== null && !can(req.user, entrada.acao)) {
        return res.status(403).json({ error: 'Sem permissão para este relatório', acao: entrada.acao });
      }
      res.json(await entrada.fn(db, req.query));
    } catch (e) { handleError(res, e); }
  });

  // RN-03: export XLSX generico, MESMA funcao e MESMO gate do dispatcher acima — nenhum
  // relatorio ganha query propria de export (nao ha como divergirem).
  app.get('/api/almoxarifado/relatorios/:tipo/export', auth, async (req, res) => {
    try {
      const entrada = entradaDoRegistro(req.params.tipo);
      if (!entrada) return res.status(404).json({ error: 'Relatório não encontrado' });
      if (entrada.acao !== null && !can(req.user, entrada.acao)) {
        return res.status(403).json({ error: 'Sem permissão para este relatório', acao: entrada.acao });
      }
      // Revisao da Task 1 (M5): a checagem de `exportavel` vem ANTES do await — nao roda a
      // query de um relatorio que nunca vai exportar, e uma entrada futura exportavel:false
      // que devolva ARRAY continua barrada (sem esta ordem, so o Array.isArray decidia e o
      // flag era peso morto — sabotagem sobreviveu verde na revisao).
      if (!entrada.exportavel) {
        return res.status(400).json({ error: 'Relatório sem exportação tabular' });
      }
      const dados = await entrada.fn(db, req.query);
      // Fase 2 (C1/I9/I10 — todos medidos): QUALQUER setHeader so acontece depois desta
      // checagem — um setHeader antes do await, ou antes deste 400, estoura
      // ERR_HTTP_HEADERS_SENT quando o payload nao e tabular ou quando o gate/tipo falha.
      // O Array.isArray fica como BACKSTOP para funcao que mude de shape sem o registro saber.
      if (!Array.isArray(dados)) {
        return res.status(400).json({ error: 'Relatório sem exportação tabular' });
      }
      // Projeta SEMPRE pelas `colunas` declaradas (obrigatorias quando exportavel:true) ANTES do
      // json_to_sheet — nunca passa as linhas cruas: `header` no json_to_sheet NAO descarta chave
      // nao declarada (6 colunas declaradas viravam 64 no estoque-atual, com custo_medio e
      // proprietario_cliente_id vazando; inventario-divergencias re-exporia ic.* e desfaria o
      // gate da 10b em planilha — Fase 2, C2). E NUNCA passa `entrada.colunas` direto como
      // `header`: a lib faz PUSH nesse array quando uma linha tem chave fora dele — o registro
      // singleton ficaria corrompido (e a rota de lista passaria a servir as colunas vazadas) ate
      // o processo reiniciar (Fase 2, C3, medido). Por isso sempre um `.map()` NOVO aqui.
      const colunas = entrada.colunas;
      const linhas = dados.map((r) => Object.fromEntries(colunas.map((c) => [c.rotulo, r[c.chave]])));
      const planilha = XLSX.utils.json_to_sheet(linhas, { header: colunas.map((c) => c.rotulo) });
      const livro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(livro, planilha, 'Relatório');
      const buffer = XLSX.write(livro, { type: 'buffer', bookType: 'xlsx' });

      const data = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.tipo}-${data}.xlsx"`);
      res.send(buffer);
    } catch (e) { handleError(res, e); }
  });

  // ── Setores requisitantes e materiais permitidos ──
  app.get('/api/almoxarifado/setores-requisicao', auth, async (req, res) => {
    try {
      await sectorMaterialService.ensureSetoresRequisicao(db);
      res.json(await sectorMaterialService.listSetores(db));
    } catch (e) { handleError(res, e); }
  });

  // C5 (RN-07): LER o mapa exige o mesmo que ESCREVE-lo. Ate a Etapa 20 este GET tinha so
  // `auth`: qualquer usuario com acesso ao modulo — inclusive o fallback PRODUCAO, que e "sem
  // perfil" — lia o mapa de controle de acesso de QUALQUER setor, enquanto o PUT e o
  // POST /bulk-tipo logo abaixo ja exigiam admin. Ler quem pode requisitar o que e
  // reconhecimento: mostra qual setor tem brecha para pedir material fora da sua alcada.
  // Gate e mensagem COPIADOS do PUT irmao de proposito — duas mensagens diferentes para a
  // mesma negativa confundem a tela. Coberto por tests/api/permissoesSetorLeitura.api.test.js.
  app.get('/api/almoxarifado/setores-requisicao/:id/permissoes', auth, async (req, res) => {
    if (!isSystemAdmin(req.user) && !canConfigureAlmox(req.user)) {
      return res.status(403).json({ error: 'Acesso restrito — administrador do Almoxarifado ou Super Administrador' });
    }
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
      // C5 #22 (RN-07): permissao de setor e CONTROLE DE ACESSO — o log guarda o de/para
      // COMPLETO (lista anterior x lista nova), nao o delta, porque `salvarPermissoesSetor`
      // faz DELETE-all + N INSERTs: nao existe "campo alterado" a reportar. Os dois lados
      // vem de `getPermissoesSetor` (estado REAL da tabela), nao do payload — entradas sem
      // nenhum id sao descartadas pelo servico e o log nao pode prometer o que nao gravou.
      // Auditado AQUI e nao no servico: ele nao recebe `user`, e mudar a assinatura das duas
      // funcoes seria refatoracao fora do escopo (mesmo motivo da rota de perfis-usuario).
      const antes = await sectorMaterialService.getPermissoesSetor(db, req.params.id);
      const rows = await sectorMaterialService.salvarPermissoesSetor(db, req.params.id, permissoes);
      await auditar(db, {
        entidade: 'setor_permissao', entidade_id: Number(req.params.id), acao: 'EDICAO', ...autorDe(req),
        dados_anteriores: { total: antes.length, permissoes: resumirPermissoes(antes) },
        dados_novos: { total: rows.length, permissoes: resumirPermissoes(rows) },
      }, 'permissoes de setor');
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
      // C5 #23: a leitura do "antes" vem DEPOIS do ensure (que cria as tabelas) e antes do
      // bulk. `incluidas` NAO existe no retorno do servico — ele devolve a lista inteira; e
      // derivado de `depois - antes`, valido porque a operacao e puramente ADITIVA (o bulk so
      // insere familia que ainda nao estava la, nunca remove).
      const antes = await sectorMaterialService.getPermissoesSetor(db, req.params.id);
      const rows = await sectorMaterialService.bulkAssignFamiliasPorTipo(db, req.params.id, tipo_uso);
      // Audita mesmo com `incluidas: 0`: diferente do PUT /configuracoes (que a tela dispara
      // com as 18 chaves a cada Salvar, mudadas ou nao), o bulk e um clique DELIBERADO em
      // controle de acesso — "o gestor mandou incluir tudo de industrial e nao entrou nada"
      // e informacao, nao ruido.
      await auditar(db, {
        entidade: 'setor_permissao', entidade_id: Number(req.params.id), acao: 'INCLUSAO_EM_LOTE', ...autorDe(req),
        dados_anteriores: { total: antes.length, permissoes: resumirPermissoes(antes) },
        dados_novos: {
          tipo_uso,
          incluidas: rows.length - antes.length,
          total: rows.length,
          permissoes: resumirPermissoes(rows),
        },
      }, 'inclusao em lote de permissoes de setor');
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
