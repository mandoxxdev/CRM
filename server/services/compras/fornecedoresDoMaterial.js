/**
 * Etapa 212 (Compras) — varios fornecedores para o mesmo material (RN-212.01 a RN-212.05).
 *
 * O VINCULO e a coluna `itens_fornecedor.material_id`: a linha do catalogo do fornecedor (codigo, descricao comercial, unidade,
 * preco — Compras -> Fornecedores homologados -> fornecedor) que E aquele material da GMP. Um material tem N linhas, uma por
 * fornecedor. Descartado: tabela nova so do vinculo — duplicaria codigo, descricao e preco do catalogo, e as duas listas divergiriam
 * (letra B). O codigo interno da GMP (`materiais_almoxarifado.codigo`) nunca e tocado aqui.
 *
 * As rotas ficam sob a porta do cadastro do Compras (`portaCompras`, `services/compras/cadastroDeMaterial.js`): le quem cadastra,
 * grava quem edita material (admin do modulo Compras ou do sistema). Registradas em `routes/almoxarifado.js`, ao lado das portas do
 * cadastro de material.
 */
const { dbRun, dbGet, dbAll } = require('../almoxarifado/db');

const MSG = {
  MATERIAL_NAO_ENCONTRADO: 'Material não encontrado',
  VINCULO_NAO_ENCONTRADO: 'Vínculo não encontrado',
  ESCOLHA_FORNECEDOR: 'Escolha o fornecedor.',
  FORNECEDOR_NAO_ENCONTRADO: 'Fornecedor não encontrado.',
  JA_VINCULADO: 'Este fornecedor já está vinculado a este material.',
  PRECO_INVALIDO: 'Preço inválido.',
  FORNECEDOR_INATIVO: 'Fornecedor inativo.',
  CATALOGO_DO_MATERIAL: 'Este item está vinculado a um material da GMP; só quem cadastra material o altera ou exclui (Compras → Materiais).',
};

// Fase 2 da 212 (achado 2): a migracao roda UMA vez. Sem a marca, o vinculo que a compradora removesse voltava no proximo boot
// (o texto antigo nunca e apagado).
const MARCA_MIGRACAO = 'migracao_fornecedor_principal_212';

async function safeAlter(db, sql) {
  try {
    await dbRun(db, sql);
  } catch (e) {
    if (/duplicate column name/i.test(e.message)) return;
    throw e;
  }
}

/** Texto para comparar nomes: sem caixa, sem acento, espacos aparados e unidos. */
function normalizarNome(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * RN-212.04: o texto antigo `fornecedor_principal` vira a primeira linha quando bate com UM so fornecedor (razao social ou nome
 * fantasia). Idempotente: so cria se o material ainda nao tem linha daquele fornecedor. Os que nao batem (ou batem com mais de um)
 * ficam como estao — o texto continua gravado e o formulario o mostra. Devolve quantas linhas criou.
 */
async function migrarFornecedorPrincipal(db) {
  const temFornecedores = await dbGet(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fornecedores'");
  if (!temFornecedores) return 0; // banco novo (ou o harness): o index.js ainda nao criou; roda no proximo boot, sem marca
  const fornecedores = await dbAll(db, 'SELECT id, razao_social, nome_fantasia FROM fornecedores');
  const porNome = new Map();
  for (const f of fornecedores) {
    for (const nome of new Set([normalizarNome(f.razao_social), normalizarNome(f.nome_fantasia)])) {
      if (!nome) continue;
      if (!porNome.has(nome)) porNome.set(nome, new Set());
      porNome.get(nome).add(f.id);
    }
  }
  const materiais = await dbAll(db, `SELECT id, nome, fornecedor_principal, codigo_fornecedor FROM materiais_almoxarifado
    WHERE fornecedor_principal IS NOT NULL AND TRIM(fornecedor_principal) <> ''`);
  let criadas = 0;
  for (const m of materiais) {
    const ids = porNome.get(normalizarNome(m.fornecedor_principal));
    if (!ids || ids.size !== 1) continue;
    const [fornecedorId] = [...ids];
    // eslint-disable-next-line no-await-in-loop
    const r = await dbRun(db, `INSERT INTO itens_fornecedor (fornecedor_id, material_id, codigo, descricao, unidade, preco)
      SELECT ?, ?, ?, ?, 'UN', 0
      WHERE NOT EXISTS (SELECT 1 FROM itens_fornecedor WHERE material_id = ? AND fornecedor_id = ?)`,
    [fornecedorId, m.id, (m.codigo_fornecedor || '').trim() || null, m.nome, m.id, fornecedorId]);
    if (r.changes) criadas += 1;
  }
  return criadas;
}

/** Chamado no fim do `initSchema` do almoxarifado (o harness de teste nao roda o `index.js`, que tambem cria a tabela). */
async function garantirSchema(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS itens_fornecedor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fornecedor_id INTEGER NOT NULL,
    codigo TEXT,
    descricao TEXT NOT NULL,
    unidade TEXT DEFAULT 'UN',
    preco REAL DEFAULT 0,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
  )`);
  await safeAlter(db, 'ALTER TABLE itens_fornecedor ADD COLUMN material_id INTEGER');
  // RN-212.02: um fornecedor uma vez por material (o catalogo sem material continua livre)
  await dbRun(db, `CREATE UNIQUE INDEX IF NOT EXISTS uq_itens_fornecedor_material
    ON itens_fornecedor (material_id, fornecedor_id) WHERE material_id IS NOT NULL`);
  try {
    const marca = await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [MARCA_MIGRACAO]);
    if (marca) return;
    const temFornecedores = await dbGet(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fornecedores'");
    if (!temFornecedores) return;
    const n = await migrarFornecedorPrincipal(db);
    await dbRun(db, `INSERT OR IGNORE INTO configuracoes_almoxarifado (chave, valor, descricao) VALUES (?, ?, ?)`,
      [MARCA_MIGRACAO, new Date().toISOString(), `Etapa 212: ${n} vinculo(s) material x fornecedor criados do Fornecedor Principal antigo`]);
    if (n) console.log(`✅ Fornecedores do material: ${n} vínculo(s) criados a partir do "Fornecedor Principal" antigo`);
  } catch (e) {
    console.error('[fornecedores-do-material] migração do fornecedor principal falhou:', e.message);
  }
}

// ── leitura e gravacao ────────────────────────────────────────────────────────────────────────────

const SELECT_LINHA = `SELECT i.id, i.fornecedor_id, COALESCE(NULLIF(TRIM(f.nome_fantasia), ''), f.razao_social) AS fornecedor_nome,
    i.codigo, i.descricao, i.unidade, i.preco, i.observacoes
  FROM itens_fornecedor i LEFT JOIN fornecedores f ON f.id = i.fornecedor_id`;

const listar = (db, materialId) => dbAll(db, `${SELECT_LINHA} WHERE i.material_id = ? ORDER BY fornecedor_nome COLLATE NOCASE, i.id`,
  [materialId]);

function erro(status, mensagem) { const e = new Error(mensagem); e.status = status; return e; }

function lerPreco(valor) {
  if (valor === undefined || valor === null || valor === '') return 0;
  // Fase 5 da 212: "1.234,56" (milhar com ponto) era 400 — com virgula, o ponto e milhar
  const t = String(valor).trim();
  const n = Number(t.includes(',') ? t.split('.').join('').replace(',', '.') : t);
  if (!Number.isFinite(n) || n < 0) throw erro(400, MSG.PRECO_INVALIDO);
  return n;
}
const texto = (v) => (v === undefined || v === null ? '' : String(v).trim());

async function exigirMaterial(db, materialId) {
  const m = await dbGet(db, 'SELECT id, nome FROM materiais_almoxarifado WHERE id = ?', [materialId]);
  if (!m) throw erro(404, MSG.MATERIAL_NAO_ENCONTRADO);
  return m;
}

async function vincular(db, materialId, body = {}) {
  const m = await exigirMaterial(db, materialId);
  const fornecedorId = Number(body.fornecedor_id);
  if (!body.fornecedor_id || !Number.isInteger(fornecedorId) || fornecedorId <= 0) throw erro(400, MSG.ESCOLHA_FORNECEDOR);
  const f = await dbGet(db, 'SELECT id, status FROM fornecedores WHERE id = ?', [fornecedorId]);
  if (!f) throw erro(400, MSG.FORNECEDOR_NAO_ENCONTRADO);
  if (String(f.status || 'ativo').toLowerCase() === 'inativo') throw erro(400, MSG.FORNECEDOR_INATIVO);
  const preco = lerPreco(body.preco);
  try {
    const r = await dbRun(db, `INSERT INTO itens_fornecedor (fornecedor_id, material_id, codigo, descricao, unidade, preco, observacoes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [fornecedorId, m.id, texto(body.codigo) || null, texto(body.descricao) || m.nome, texto(body.unidade) || 'UN', preco,
      texto(body.observacoes) || null]);
    return dbGet(db, `${SELECT_LINHA} WHERE i.id = ?`, [r.lastID]);
  } catch (e) {
    if (/UNIQUE constraint failed/i.test(e.message)) throw erro(409, MSG.JA_VINCULADO);
    throw e;
  }
}

async function exigirLinha(db, materialId, linhaId) {
  const l = await dbGet(db, 'SELECT * FROM itens_fornecedor WHERE id = ? AND material_id = ?', [linhaId, materialId]);
  if (!l) throw erro(404, MSG.VINCULO_NAO_ENCONTRADO);
  return l;
}

/** PUT: so o que veio muda; o fornecedor nao muda (trocar fornecedor = remover e vincular outro). */
async function editar(db, materialId, linhaId, body = {}) {
  const m = await exigirMaterial(db, materialId);
  const l = await exigirLinha(db, materialId, linhaId);
  const novo = {
    codigo: body.codigo !== undefined ? (texto(body.codigo) || null) : l.codigo,
    descricao: body.descricao !== undefined ? (texto(body.descricao) || m.nome) : l.descricao,
    unidade: body.unidade !== undefined ? (texto(body.unidade) || 'UN') : l.unidade,
    preco: body.preco !== undefined ? lerPreco(body.preco) : l.preco,
    observacoes: body.observacoes !== undefined ? (texto(body.observacoes) || null) : l.observacoes,
  };
  await dbRun(db, `UPDATE itens_fornecedor SET codigo = ?, descricao = ?, unidade = ?, preco = ?, observacoes = ?,
    updated_at = CURRENT_TIMESTAMP WHERE id = ? AND material_id = ?`,
  [novo.codigo, novo.descricao, novo.unidade, novo.preco, novo.observacoes, l.id, m.id]);
  return dbGet(db, `${SELECT_LINHA} WHERE i.id = ?`, [l.id]);
}

/** RN-212.05: remover o vinculo apaga a linha do catalogo (e a mesma linha). */
async function remover(db, materialId, linhaId) {
  await exigirMaterial(db, materialId);
  const l = await exigirLinha(db, materialId, linhaId);
  await dbRun(db, 'DELETE FROM itens_fornecedor WHERE id = ? AND material_id = ?', [l.id, materialId]);
  return { ok: true };
}

/** Os handlers express (o `db` e o do registrador). */
/**
 * Etapa 214 (RN-214.01/02) — o historico de precos do material: as linhas de cotacao (preco cotado) e de pedido (preco comprado),
 * da mais recente para a mais antiga, no maximo 100. Leitura pura, sem tabela nova (B87). Fora: cotacao cancelada; pedido cancelado
 * ou rejeitado. Cotacao rejeitada entra (foi preco cotado), com o status.
 */
async function historicoDePrecos(db, materialId) {
  return dbAll(db, `SELECT * FROM (
      SELECT 'cotacao' AS origem, c.id AS documento_id, c.numero, COALESCE(c.data_cotacao, date(c.created_at)) AS data, c.status,
        c.fornecedor_id, COALESCE(NULLIF(f.nome_fantasia, ''), f.razao_social) AS fornecedor_nome,
        i.quantidade, i.unidade, i.valor_unitario, i.id AS linha_id
      FROM itens_cotacao i JOIN cotacoes c ON c.id = i.cotacao_id LEFT JOIN fornecedores f ON f.id = c.fornecedor_id
      WHERE i.material_id = ? AND COALESCE(c.status, '') <> 'cancelado'
      UNION ALL
      SELECT 'pedido', p.id, p.numero, COALESCE(p.data_pedido, date(p.created_at)), p.status,
        p.fornecedor_id, COALESCE(NULLIF(f.nome_fantasia, ''), f.razao_social),
        i.quantidade, i.unidade, i.valor_unitario, i.id
      FROM itens_pedido_compra i JOIN pedidos_compra p ON p.id = i.pedido_id LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
      WHERE i.material_id = ? AND COALESCE(p.status, '') NOT IN ('cancelado', 'rejeitado')
    ) ORDER BY data DESC, origem DESC, documento_id DESC, linha_id DESC LIMIT 100`, [materialId, materialId]);
}

function criarHandlers(db) {
  const responder = (fn) => async (req, res) => {
    try {
      res.status(req.method === 'POST' ? 201 : 200).json(await fn(req));
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      return res.status(500).json({ error: e.message });
    }
  };
  return {
    listar: responder(async (req) => { await exigirMaterial(db, req.params.id); return listar(db, req.params.id); }),
    vincular: responder((req) => vincular(db, req.params.id, req.body)),
    editar: responder((req) => editar(db, req.params.id, req.params.linhaId, req.body)),
    remover: responder((req) => remover(db, req.params.id, req.params.linhaId)),
    historico: responder(async (req) => { await exigirMaterial(db, req.params.id); return historicoDePrecos(db, req.params.id); }),
  };
}

/**
 * Fase 2 da 212 (achado 3): as rotas do CATALOGO do fornecedor (`routes/compras.js`, porta so do modulo Compras) nao mexem na
 * linha que e de um material para quem nao cadastra material — senao a RN-212.01 caia pela outra tela. Middleware do PUT e DELETE.
 */
function guardarLinhaDoMaterial(db, pode) {
  return async (req, res, next) => {
    try {
      const l = await dbGet(db, 'SELECT material_id FROM itens_fornecedor WHERE id = ? AND fornecedor_id = ?',
        [req.params.id, req.params.fornecedorId]);
      if (l && l.material_id && !pode(req.user, 'editar_material')) return res.status(403).json({ error: MSG.CATALOGO_DO_MATERIAL });
      return next();
    } catch (e) { return res.status(500).json({ error: e.message }); }
  };
}

module.exports = { MSG, MARCA_MIGRACAO, guardarLinhaDoMaterial, garantirSchema, migrarFornecedorPrincipal, normalizarNome, criarHandlers, listar, vincular, editar, remover, historicoDePrecos };
