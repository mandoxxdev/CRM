/**
 * Etapa 66 — motivo de movimentacao como CADASTRO (feature 01, requisito 4.3).
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa66-motivos-de-movimentacao.md
 * (a secao "Fase 2 — revisao do plano" prevalece sobre o texto anterior dele).
 *
 * A regra mora AQUI e a rota so traduz HTTP — mesma divisao do nonConformityService: o servico
 * lanca com `.status` + a mensagem literal do contrato, e a rota nao revalida nada (duplicar a
 * regua e como a mensagem literal se parte em duas).
 *
 * ── DECISOES (letra B do documento de novidades) ─────────────────────────────────────────────
 *  - D3: os tipos a que o motivo serve ficam numa coluna JSON (`tipos TEXT`) na propria linha. Sem
 *    transacao utilizavel nesta base, uma tabela de juncao (DELETE + INSERTs no PUT) poderia ficar
 *    pela metade e deixar um motivo sem tipos; uma linha so e atomica.
 *  - D6 revista na Fase 2: unicidade por `nome_normalizado` (trim + NFC + minusculas pt-BR) com
 *    UNIQUE, e nao `COLLATE NOCASE` — que so dobra ASCII ("Manutenção" x "MANUTENÇÃO" entrariam os
 *    dois) e nao existe no Postgres para onde a base vai migrar.
 *  - D8: o tipo e comparado EXATO — `AJUSTE` nao casa com `AJUSTE_POSITIVO`.
 *  - Filtro por tipo e ordenacao em JS, nao em `json_each`/ORDER BY: a lista e pequena (cadastro
 *    do admin) e a regua fica igual no SQLite e no Postgres.
 */
const { dbAll, dbGet, dbRun } = require('./db');
// Resolvido na hora da chamada (e nao desestruturado): o stub de auditoria dos testes da RN-02
// da Etapa 19 so alcanca chamadas feitas por `audit.registrarAuditoria(...)`.
const audit = require('./audit');
const { TIPOS_MOVIMENTO_ROTA } = require('./schemas');

const TABELA = 'motivos_movimentacao_almoxarifado';

const MSG = Object.freeze({
  NOME_OBRIGATORIO: 'Nome é obrigatório',
  TIPOS_OBRIGATORIOS: 'Informe ao menos um tipo de movimentação',
  tipoInvalido: (t) => `Tipo de movimentação inválido para motivo: ${t}`,
  DUPLICADO: 'Já existe um motivo com este nome',
  DUPLICADO_INATIVO: 'Já existe um motivo desativado com este nome — reative-o',
  NAO_ENCONTRADO: 'Motivo de movimentação não encontrado',
  ATIVO_INVALIDO: 'ativo deve ser 0 ou 1',
  // Mesma frase que o motor usa para tipo forjado (stockService.registrarMovimentacao).
  TIPO_FILTRO_INVALIDO: 'Tipo de movimento inválido',
});

const erro = (status, message) => Object.assign(new Error(message), { status });

/** Chave de unicidade: "Manutenção", "MANUTENÇÃO" e a forma NFD do mesmo nome dao a mesma. */
function normalizarNome(nome) {
  return String(nome).trim().normalize('NFC').toLocaleLowerCase('pt-BR');
}

function validarNome(nome) {
  // So texto: `String(42)` e `String({})` virariam nome "42"/"[object Object]" em silencio.
  if (typeof nome !== 'string' || !nome.trim()) throw erro(400, MSG.NOME_OBRIGATORIO);
  return nome.trim().normalize('NFC');
}

/** Lista nao vazia, cada um da rota generica; repetidos saem em silencio, ordem preservada. */
function validarTipos(tipos) {
  if (!Array.isArray(tipos) || tipos.length === 0) throw erro(400, MSG.TIPOS_OBRIGATORIOS);
  const invalido = tipos.find((t) => !TIPOS_MOVIMENTO_ROTA.includes(t));
  if (invalido !== undefined) throw erro(400, MSG.tipoInvalido(invalido));
  return [...new Set(tipos)];
}

/** `ativo` so 0|1 (numero ou booleano). O molde de categorias aceita "0" como 1 — nao copiado. */
function validarAtivo(ativo) {
  if (ativo === 0 || ativo === 1) return ativo;
  if (ativo === true || ativo === false) return ativo ? 1 : 0;
  throw erro(400, MSG.ATIVO_INVALIDO);
}

function paraContrato(row) {
  let tipos = [];
  try { tipos = JSON.parse(row.tipos); } catch (e) { tipos = []; }
  return { id: row.id, nome: row.nome, tipos: Array.isArray(tipos) ? tipos : [], ativo: row.ativo ? 1 : 0 };
}

const resumo = (m) => ({ nome: m.nome, tipos: m.tipos, ativo: m.ativo });

async function auditar(db, payload, contexto) {
  // Best-effort (Etapa 19, RN-02): quando isto roda o efeito ja esta no banco.
  try {
    await audit.registrarAuditoria(db, payload);
  } catch (e) {
    console.error(`[almoxarifado] Falha ao registrar auditoria de ${contexto}:`, e.message);
  }
}

/**
 * A colisao e detectada pelo BANCO (indice UNIQUE em `nome_normalizado`), nao por SELECT previo —
 * SELECT-depois-INSERT tem janela de corrida. O SELECT aqui so escolhe QUAL das duas mensagens
 * dizer: a do desativado ensina o caminho (reativar), em vez de deixar o admin achar que o nome
 * esta "sumido mas ocupado".
 */
async function traduzirColisao(db, e, nomeNormalizado) {
  if (!/UNIQUE constraint/i.test(e.message)) throw e;
  const existente = await dbGet(db, `SELECT ativo FROM ${TABELA} WHERE nome_normalizado = ?`, [nomeNormalizado]);
  throw erro(400, existente && !existente.ativo ? MSG.DUPLICADO_INATIVO : MSG.DUPLICADO);
}

async function obterMotivo(db, id) {
  const row = await dbGet(db, `SELECT * FROM ${TABELA} WHERE id = ?`, [id]);
  return row ? paraContrato(row) : null;
}

/**
 * `todos` traz os inativos (a aba de Configuracoes precisa deles para reativar). `tipo` traz so os
 * ATIVOS que servem ao tipo e IGNORA `todos` — e a lista da tela de movimentacao, onde motivo
 * desativado nao pode ser oferecido.
 */
async function listarMotivos(db, { todos = false, tipo } = {}) {
  if (tipo !== undefined && !TIPOS_MOVIMENTO_ROTA.includes(tipo)) throw erro(400, MSG.TIPO_FILTRO_INVALIDO);
  const incluiInativos = todos && tipo === undefined;
  const rows = await dbAll(db, `SELECT * FROM ${TABELA}${incluiInativos ? '' : ' WHERE ativo = 1'}`);
  return rows.map(paraContrato)
    .filter((m) => tipo === undefined || m.tipos.includes(tipo))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }) || a.id - b.id);
}

async function criarMotivo(db, body, autor = {}) {
  const nome = validarNome(body?.nome);
  const tipos = validarTipos(body?.tipos);
  const nomeNormalizado = normalizarNome(nome);
  let r;
  try {
    r = await dbRun(db, `INSERT INTO ${TABELA} (nome, nome_normalizado, tipos, ativo) VALUES (?, ?, ?, 1)`,
      [nome, nomeNormalizado, JSON.stringify(tipos)]);
  } catch (e) {
    await traduzirColisao(db, e, nomeNormalizado);
  }
  const criado = { id: r.lastID, nome, tipos, ativo: 1 };
  await auditar(db, {
    entidade: 'motivo_movimentacao', entidade_id: criado.id, acao: 'CRIACAO', ...autor,
    dados_novos: resumo(criado),
  }, 'criacao de motivo de movimentacao');
  return criado;
}

/** Preserve-when-omitted nos tres campos: `undefined` mantem; `null` e valor (e recusado). */
async function atualizarMotivo(db, id, body = {}, autor = {}) {
  const atual = await obterMotivo(db, id);
  if (!atual) throw erro(404, MSG.NAO_ENCONTRADO);
  const nome = body.nome === undefined ? atual.nome : validarNome(body.nome);
  const tipos = body.tipos === undefined ? atual.tipos : validarTipos(body.tipos);
  const ativo = body.ativo === undefined ? atual.ativo : validarAtivo(body.ativo);
  const nomeNormalizado = normalizarNome(nome);
  try {
    await dbRun(db, `UPDATE ${TABELA} SET nome = ?, nome_normalizado = ?, tipos = ?, ativo = ?,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [nome, nomeNormalizado, JSON.stringify(tipos), ativo, atual.id]);
  } catch (e) {
    await traduzirColisao(db, e, nomeNormalizado);
  }
  // Editar os tipos de um motivo ja usado NAO reescreve o livro: a linha antiga guarda o texto e
  // o `motivo_id` do momento (D2).
  const novo = { id: atual.id, nome, tipos, ativo };
  await auditar(db, {
    entidade: 'motivo_movimentacao', entidade_id: atual.id, acao: 'EDICAO', ...autor,
    dados_anteriores: resumo(atual), dados_novos: resumo(novo),
  }, 'edicao de motivo de movimentacao');
  return novo;
}

/** Soft delete. `changes === 0` separa inexistente (404) de ja inativo (200 idempotente, sem auditar). */
async function desativarMotivo(db, id, autor = {}) {
  const anterior = await obterMotivo(db, id);
  const r = await dbRun(db, `UPDATE ${TABELA} SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ativo = 1`, [id]);
  if (r.changes === 0) {
    if (!anterior) throw erro(404, MSG.NAO_ENCONTRADO);
    return { success: true, ja_inativo: true };
  }
  await auditar(db, {
    entidade: 'motivo_movimentacao', entidade_id: anterior.id, acao: 'EXCLUSAO', ...autor,
    dados_anteriores: resumo(anterior), dados_novos: resumo({ ...anterior, ativo: 0 }),
  }, 'desativacao de motivo de movimentacao');
  return { success: true };
}

module.exports = {
  MSG,
  normalizarNome,
  listarMotivos,
  obterMotivo,
  criarMotivo,
  atualizarMotivo,
  desativarMotivo,
};
