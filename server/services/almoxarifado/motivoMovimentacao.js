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
const { TIPOS_MOVIMENTO } = require('./schema');

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

// Fase 5 (M1): caracteres invisiveis (zero-width, BOM, word joiner) saem, e todo espaco interno
// (inclusive o nao-quebravel) vira um so — "Avaria  manuseio", "Avaria manuseio" e
// "Avaria manuseio​" eram tres motivos que a lista mostrava iguais, e "​" passava como nome.
const limparNome = (nome) => String(nome).replace(/[​-‍⁠﻿]/g, '')
  .replace(/\s+/g, ' ').trim().normalize('NFC');

/** Chave de unicidade: "Manutenção", "MANUTENÇÃO" e a forma NFD do mesmo nome dao a mesma. */
function normalizarNome(nome) {
  return limparNome(nome).toLocaleLowerCase('pt-BR');
}

function validarNome(nome) {
  // So texto: `String(42)` e `String({})` virariam nome "42"/"[object Object]" em silencio.
  if (typeof nome !== 'string' || !limparNome(nome)) throw erro(400, MSG.NOME_OBRIGATORIO);
  return limparNome(nome);
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

// ── Uso na movimentacao (Etapa 66, T2) ─────────────────────────────────────────────────────────

const MSG_USO = Object.freeze({
  FORMATO: 'motivo_id deve ser um número inteiro positivo',
  OS_DOIS: 'Informe o motivo do cadastro (motivo_id) ou o motivo digitado (motivo), não os dois',
  NAO_ENCONTRADO: MSG.NAO_ENCONTRADO,
  desativado: (nome) => `O motivo "${nome}" está desativado`,
  naoServe: (nome, tipo) => `O motivo "${nome}" não serve para movimentação do tipo ${tipo}`,
  // Fase 5 (M4): a `/transferencias` nao passa pelo Zod — `{a:1}` virava "Nome — [object Object]".
  COMPLEMENTO: 'justificativa deve ser texto',
});

const textoPreenchido = (v) => v !== undefined && v !== null && String(v).trim() !== '';

/**
 * Chamado no TOPO de `stockService.registrarMovimentacao`, ANTES da desestruturacao dos params
 * (revisao da Fase 2): o motor le `motivo` e `justificativa` dos params para a regra "exige
 * justificativa", para o livro, a auditoria e a fila de notificacao — reatribuir depois da
 * desestruturacao deixaria metade desses leitores com o valor antigo.
 *
 * Por estar no MOTOR, vale em toda porta que chega com `motivo_id`: v2 (o schema o declara como
 * `z.unknown()` de proposito, sem validar), `/transferencias` (body cru) e chamada direta. A
 * checagem de formato mora aqui para as duas rotas darem a MESMA mensagem (precedente da Etapa 56,
 * `codigo_lido_*`).
 *
 * Devolve params NOVOS (nunca muta os do chamador). Sem `motivo_id` (ausente ou `null`), devolve os
 * params com `motivo_id: null` e o resto intocado — o texto livre de hoje passa identico (RN-07).
 *
 * Tipo invalido NAO e julgado aqui: os params voltam como vieram e o motor recusa logo em seguida
 * com a mensagem de hoje ('Tipo de movimento inválido'). Ordem fixa do contrato: tipo primeiro.
 */
async function resolverMotivoDoCadastro(db, params) {
  if (!params || typeof params !== 'object') return params;
  const { motivo_id: bruto, tipo } = params;
  if (bruto === undefined || bruto === null) return { ...params, motivo_id: null };
  if (!TIPOS_MOVIMENTO.includes(tipo) || tipo === 'ESTORNO') return params;

  if (typeof bruto !== 'number' || !Number.isInteger(bruto) || bruto <= 0) throw erro(400, MSG_USO.FORMATO);
  // D4: os dois juntos sao recusados em vez de o cadastro "ganhar" calado. So espacos = vazio.
  if (textoPreenchido(params.motivo)) throw erro(400, MSG_USO.OS_DOIS);
  if (params.justificativa !== undefined && params.justificativa !== null && typeof params.justificativa !== 'string') {
    throw erro(400, MSG_USO.COMPLEMENTO);
  }
  const motivo = await obterMotivo(db, bruto);
  if (!motivo) throw erro(400, MSG_USO.NAO_ENCONTRADO);
  if (!motivo.ativo) throw erro(400, MSG_USO.desativado(motivo.nome));
  if (!motivo.tipos.includes(tipo)) throw erro(400, MSG_USO.naoServe(motivo.nome, tipo));

  // RN-05: o livro grava o NOME DO MOMENTO (D2) e a justificativa leva o nome — e por isso satisfaz
  // "exige justificativa", a regra 'qualquer' da SAIDA e a do emergencial, como o texto copiado
  // pela tela ja satisfazia. O complemento livre vem em `justificativa`; vazio nao grava "Nome — ".
  const complemento = textoPreenchido(params.justificativa) ? String(params.justificativa).trim() : '';
  return {
    ...params,
    motivo_id: motivo.id,
    motivo: motivo.nome,
    justificativa: complemento ? `${motivo.nome} — ${complemento}` : motivo.nome,
  };
}

module.exports = {
  MSG,
  MSG_USO,
  resolverMotivoDoCadastro,
  normalizarNome,
  listarMotivos,
  obterMotivo,
  criarMotivo,
  atualizarMotivo,
  desativarMotivo,
};
