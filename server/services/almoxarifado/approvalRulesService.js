/**
 * Regras de aprovação configuráveis e as pendências que elas geram (Etapa 47, T3/T4).
 *
 * Desenho: docs/superpowers/specs/2026-09-30-almoxarifado-etapa47-aprovacoes-com-regras-design.md,
 * seções 8 e 9. O essencial:
 *
 *  - A PENDÊNCIA É A VERDADE (RN-08). Assinar uma pendência NÃO muda o status da requisição: ela
 *    continua PENDENTE / AGUARDANDO_APROVACAO_VALOR até o gesto que já existia (`/aprovar` ou
 *    `/aprovar-valor`), e esse gesto é barrado pelo gate (`GATE_SQL`) enquanto houver pendência
 *    aberta. A garantia volta a ser UM `UPDATE` numa linha só — a propriedade que o molde de duas
 *    pernas tinha e que N pendências em tabela filha perderiam (8.1).
 *
 *  - `regras_avaliadas_em` é gravada SÓ DEPOIS de todas as pendências inseridas (9.7/C2). Se o
 *    avaliador falhar, a coluna fica NULL e o gate FECHA — a falha não pode abrir a porta.
 *
 *  - A segregação vale em CADA assinatura (RN-07): nem o solicitante, nem quem já assinou outra
 *    pendência da mesma requisição. A segunda condição mora no WHERE do claim, porque pré-checagem
 *    sozinha é TOCTOU (8.3) — a pré-checagem existe pela MENSAGEM, o WHERE pela GARANTIA.
 */
const { dbRun, dbGet, dbAll } = require('./db');
const { TIPOS_REQUISICAO, TIPOS_URGENCIA } = require('./schema');
const valueApprovalService = require('./requisitionValueApprovalService');

/** Status da requisição em que uma pendência ainda cobra, conta e pode ser assinada (9.7/I2). */
const STATUS_REQUISICAO_AGUARDANDO = ['PENDENTE', valueApprovalService.STATUS_AGUARDANDO];
const STATUS_AGUARDANDO_SQL = STATUS_REQUISICAO_AGUARDANDO.map((s) => `'${s}'`).join(',');

/**
 * A guarda do `UPDATE` que aprova (rotas `/aprovar`, `/aprovar-valor` e as duas auto-aprovações).
 * Escrita para ser concatenada num WHERE sobre `requisicoes_almoxarifado` sem alias.
 */
const GATE_SQL = `regras_avaliadas_em IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM requisicao_aprovacoes_regra p
    WHERE p.requisicao_id = requisicoes_almoxarifado.id AND p.status = 'ABERTA')`;

function erro(status, mensagem) {
  return Object.assign(new Error(mensagem), { status });
}

/**
 * Quem assina qualquer regra "como admin": quem pode CONFIGURAR o modulo (superadmin, admin do
 * modulo, perfil ADMINISTRADOR). Revisao da Fase 5 (autorizacao, I-1): era `role === 'admin'`,
 * copiado da liberacao por valor, e o superadmin que CRIA a regra levava 403 ao destravar a
 * pendencia dela - a "saida e um admin" do desenho (9.7/M2) nao incluia quem administra o modulo.
 * `require` aqui dentro pelo mesmo motivo de permissions.js: evitar ciclo no carregamento.
 */
function isAdmin(user) {
  const { canConfigureAlmox } = require('../systemPermissions');
  return !!user && (user.role === 'admin' || canConfigureAlmox(user));
}

function parseIds(value) {
  try {
    const arr = JSON.parse(value || '[]');
    return Array.isArray(arr) ? arr.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  } catch (_) {
    return [];
  }
}

function nomeDoUsuario(user) {
  return user?.nome || user?.email || null;
}

function formatarRegra(row) {
  if (!row) return row;
  return {
    ...row,
    ativo: row.ativo ? 1 : 0,
    material_critico: row.material_critico ? 1 : null,
    material_cliente: row.material_cliente ? 1 : null,
    aprovadores: parseIds(row.aprovadores),
  };
}

// ── Validação (9.5 + 9.7/I3): escrita aqui, não no Zod, para as literais saírem sem prefixo ──

function numeroPositivoOuNulo(payload, campo) {
  const v = payload[campo];
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw erro(400, `${campo} deve ser um número maior que zero`);
  return n;
}

function inteiroPositivoOuNulo(payload, campo) {
  const n = numeroPositivoOuNulo(payload, campo);
  if (n !== null && !Number.isInteger(n)) throw erro(400, `${campo} deve ser um número maior que zero`);
  return n;
}

async function validarRegra(db, payload, { idsJaNaRegra = [] } = {}) {
  const p = payload || {};
  const nome = typeof p.nome === 'string' ? p.nome.trim() : '';
  if (!nome) throw erro(400, 'Regra precisa de um nome');

  let tipoRequisicao = null;
  if (p.tipo_requisicao !== undefined && p.tipo_requisicao !== null && p.tipo_requisicao !== '') {
    if (!TIPOS_REQUISICAO.includes(p.tipo_requisicao)) {
      throw erro(400, `Tipo de requisição inválido: ${p.tipo_requisicao}`);
    }
    tipoRequisicao = p.tipo_requisicao;
  }
  // Só `1`/`true` filtra; 0/false/null significam "não filtra" e NÃO contam como critério (I3).
  const materialCritico = (p.material_critico === true || p.material_critico === 1 || p.material_critico === '1') ? 1 : null;
  // Etapa 48 (RN-03): mesma leitura - so 1/true filtra.
  const materialCliente = (p.material_cliente === true || p.material_cliente === 1 || p.material_cliente === '1') ? 1 : null;
  // Etapa 48 (RN-02): um de TIPOS_URGENCIA, com a MESMA literal da criacao da requisicao.
  let urgencia = null;
  if (p.urgencia !== undefined && p.urgencia !== null && p.urgencia !== '') {
    if (!TIPOS_URGENCIA.includes(p.urgencia)) throw erro(400, `Urgência inválida: ${p.urgencia}`);
    urgencia = p.urgencia;
  }
  const valorMinimo = numeroPositivoOuNulo(p, 'valor_minimo');
  const quantidadeMinima = numeroPositivoOuNulo(p, 'quantidade_minima');
  const centroCustoId = inteiroPositivoOuNulo(p, 'centro_custo_id');
  const projetoId = inteiroPositivoOuNulo(p, 'projeto_id');

  const algumCriterio = [tipoRequisicao, materialCritico, materialCliente, urgencia, valorMinimo, quantidadeMinima, centroCustoId, projetoId]
    .some((v) => v !== null);
  if (!algumCriterio) throw erro(400, 'Regra precisa de pelo menos um critério');

  const brutos = Array.isArray(p.aprovadores) ? p.aprovadores : [];
  const aprovadores = [...new Set(brutos.map(Number))];
  if (!aprovadores.length || aprovadores.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw erro(400, 'Regra precisa de pelo menos um aprovador');
  }
  const placeholders = aprovadores.map(() => '?').join(',');
  const ativos = await dbAll(db,
    `SELECT id FROM usuarios WHERE id IN (${placeholders}) AND COALESCE(ativo, 1) = 1`, aprovadores);
  const encontrados = new Set(ativos.map((r) => Number(r.id)));
  // Fase 5 (regras, M3): quem JA esta na regra nao e revalidado - senao desativar uma regra cujo
  // aprovador saiu da empresa dava 400, e desativar e justamente a saida para esse caso.
  const jaNaRegra = new Set(idsJaNaRegra.map(Number));
  const faltando = aprovadores.filter((id) => !encontrados.has(id) && !jaNaRegra.has(id));
  if (faltando.length) throw erro(400, `Aprovador inexistente ou inativo: ${faltando.join(', ')}`);

  const ordem = Number.isInteger(Number(p.ordem)) ? Number(p.ordem) : 0;
  // `ativo` coagido a 0/1 (I3). Ausente = ativa.
  const ativo = (p.ativo === undefined || p.ativo === null) ? 1
    : ((p.ativo === false || p.ativo === 0 || p.ativo === '0') ? 0 : 1);

  return {
    nome, ativo, ordem,
    tipo_requisicao: tipoRequisicao,
    material_critico: materialCritico,
    material_cliente: materialCliente,
    urgencia,
    valor_minimo: valorMinimo,
    quantidade_minima: quantidadeMinima,
    centro_custo_id: centroCustoId,
    projeto_id: projetoId,
    aprovadores,
  };
}

// ── CRUD das regras ──

async function listarRegras(db) {
  const rows = await dbAll(db, `SELECT r.*,
      (SELECT COUNT(*) FROM requisicao_aprovacoes_regra p
         JOIN requisicoes_almoxarifado q ON q.id = p.requisicao_id
        WHERE p.regra_id = r.id AND p.status = 'ABERTA'
          AND q.status IN (${STATUS_AGUARDANDO_SQL}) AND COALESCE(q.ativo, 1) = 1) AS pendencias_abertas
    FROM regras_aprovacao r ORDER BY r.ordem, r.id`);
  return rows.map(formatarRegra);
}

async function obterRegra(db, id) {
  return formatarRegra(await dbGet(db, 'SELECT * FROM regras_aprovacao WHERE id = ?', [id]));
}

async function criarRegra(db, payload, user) {
  const r = await validarRegra(db, payload);
  const ins = await dbRun(db, `INSERT INTO regras_aprovacao
    (nome, ativo, ordem, tipo_requisicao, material_critico, material_cliente, urgencia, valor_minimo,
     quantidade_minima, centro_custo_id, projeto_id, aprovadores, criado_por_id, criado_por_nome)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [r.nome, r.ativo, r.ordem, r.tipo_requisicao, r.material_critico, r.material_cliente, r.urgencia, r.valor_minimo,
    r.quantidade_minima, r.centro_custo_id, r.projeto_id, JSON.stringify(r.aprovadores), user?.id || null, nomeDoUsuario(user)]);
  return obterRegra(db, ins.lastID);
}

/**
 * Atualiza a regra. Desativar com pendência aberta torna as pendências OBSOLETAS (9.2) — só as de
 * requisição ainda aguardando (9.7/I2): a de requisição rejeitada/cancelada fica como estava, para
 * não reescrever o histórico dela. Reativar NÃO reabre obsoletas.
 * Editar critérios/aprovadores de regra ativa não mexe nas pendências abertas: elas carregam o
 * SNAPSHOT de quem pode assinar, tirado no envio.
 */
async function atualizarRegra(db, id, payload, user) {
  const atual = await dbGet(db, 'SELECT * FROM regras_aprovacao WHERE id = ?', [id]);
  if (!atual) throw erro(404, 'Regra não encontrada');
  const r = await validarRegra(db, payload, { idsJaNaRegra: parseIds(atual.aprovadores) });
  await dbRun(db, `UPDATE regras_aprovacao SET nome=?, ativo=?, ordem=?, tipo_requisicao=?,
      material_critico=?, material_cliente=?, urgencia=?, valor_minimo=?, quantidade_minima=?,
      centro_custo_id=?, projeto_id=?, aprovadores=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
  [r.nome, r.ativo, r.ordem, r.tipo_requisicao, r.material_critico, r.material_cliente, r.urgencia, r.valor_minimo,
    r.quantidade_minima, r.centro_custo_id, r.projeto_id, JSON.stringify(r.aprovadores), id]);

  let pendenciasObsoletadas = 0;
  if (!r.ativo) {
    const res = await dbRun(db, `UPDATE requisicao_aprovacoes_regra
      SET status = 'OBSOLETA', obsoleta_em = CURRENT_TIMESTAMP, obsoleta_por_nome = ?
      WHERE regra_id = ? AND status = 'ABERTA'
        AND requisicao_id IN (SELECT id FROM requisicoes_almoxarifado
                              WHERE status IN (${STATUS_AGUARDANDO_SQL}) AND COALESCE(ativo, 1) = 1)`,
    [nomeDoUsuario(user), id]);
    pendenciasObsoletadas = res.changes || 0;
  }
  return { regra: await obterRegra(db, id), pendencias_obsoletadas: pendenciasObsoletadas };
}

// ── O avaliador (RN-06/RN-09) ──

/** A regra casa quando TODOS os critérios não nulos casam (E, não OU). */
function regraCasa(regra, req, itens, valorTotal) {
  if (regra.tipo_requisicao && regra.tipo_requisicao !== (req.tipo_requisicao || 'CONSUMO')) return false;
  if (regra.material_critico && !itens.some((i) => Number(i.material_critico) === 1)) return false;
  if (regra.material_cliente && !itens.some((i) => Number(i.material_cliente) === 1)) return false;
  if (regra.urgencia && regra.urgencia !== (req.urgencia || 'NORMAL')) return false;
  // `>=` — régua própria das regras; a liberação por valor usa `>` (9.7/M3).
  if (regra.valor_minimo != null && !(valorTotal >= Number(regra.valor_minimo))) return false;
  if (regra.quantidade_minima != null
    && !itens.some((i) => Number(i.quantidade_solicitada) >= Number(regra.quantidade_minima))) return false;
  if (regra.centro_custo_id != null && Number(req.centro_custo_id) !== Number(regra.centro_custo_id)) return false;
  if (regra.projeto_id != null && Number(req.projeto_id) !== Number(regra.projeto_id)) return false;
  return true;
}

/**
 * Avalia as regras ATIVAS contra a requisição e grava as pendências. Idempotente (UNIQUE +
 * INSERT OR IGNORE): chamado de novo, não duplica. Só grava enquanto a requisição aguarda
 * (9.7/I1). O carimbo `regras_avaliadas_em` vem POR ÚLTIMO — se qualquer passo lançar, ele não
 * é gravado e o gate continua fechado.
 */
async function avaliarRequisicao(db, requisicaoId) {
  const req = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  if (!req) throw erro(404, 'Requisição não encontrada');

  const regras = await dbAll(db, 'SELECT * FROM regras_aprovacao WHERE ativo = 1 ORDER BY ordem, id');
  const casadas = [];
  if (regras.length) {
    // Somado POR MATERIAL (Fase 5, regras, I1): o avaliador comparava cada LINHA, e a criação
    // grava linhas repetidas do mesmo material — duas linhas de 6 escapavam da regra "≥ 10" que
    // uma linha de 12 dispararia. O próprio solicitante contornava a regra. A 9.3 dizia "ALGUM
    // item tem quantidade ≥"; estava errada: "item" é o material, não a linha.
    const itens = await dbAll(db, `SELECT ir.material_id, SUM(ir.quantidade_solicitada) AS quantidade_solicitada,
        MAX(COALESCE(m.material_critico, 0)) AS material_critico,
        MAX(CASE WHEN m.proprietario_cliente_id IS NOT NULL THEN 1 ELSE 0 END) AS material_cliente
      FROM itens_requisicao_almoxarifado ir
      JOIN materiais_almoxarifado m ON m.id = ir.material_id
      WHERE ir.requisicao_id = ?
      GROUP BY ir.material_id`, [requisicaoId]);
    // 9.7/C3: calculado aqui — a coluna `valor_total` ainda é 0 neste ponto do envio.
    const valorTotal = await valueApprovalService.calcularValorTotal(db, requisicaoId);
    for (const regra of regras) {
      if (regraCasa(regra, req, itens, valorTotal)) casadas.push(regra);
    }
  }

  for (const regra of casadas) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(db, `INSERT OR IGNORE INTO requisicao_aprovacoes_regra
        (requisicao_id, regra_id, regra_nome, aprovadores)
      SELECT ?, ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM requisicoes_almoxarifado WHERE id = ? AND status IN (${STATUS_AGUARDANDO_SQL}))`,
    [requisicaoId, regra.id, regra.nome, regra.aprovadores || '[]', requisicaoId]);
  }

  await dbRun(db, 'UPDATE requisicoes_almoxarifado SET regras_avaliadas_em = CURRENT_TIMESTAMP WHERE id = ?',
    [requisicaoId]);
  return { regras_casadas: casadas.map((r) => r.id) };
}

// ── O gate (RN-11 + 9.7/C1/C2) ──

async function pendenciasAbertas(db, requisicaoId) {
  return dbAll(db, `SELECT * FROM requisicao_aprovacoes_regra
    WHERE requisicao_id = ? AND status = 'ABERTA' ORDER BY id`, [requisicaoId]);
}

function mensagemGate(abertas) {
  return `Requisição tem aprovação de regra pendente: ${abertas.map((p) => p.regra_nome).join(', ')}`;
}

/**
 * Pré-checagem do gate, ANTES de reservar (C1). Se as regras nunca foram avaliadas (avaliador
 * falhou no envio), reavalia aqui; se falhar de novo, o erro sobe e nada é aprovado (C2).
 * Lança 400 com a literal do gate quando há pendência aberta.
 */
async function exigirSemPendenciaAberta(db, reqRow) {
  if (!reqRow.regras_avaliadas_em) await avaliarRequisicao(db, reqRow.id);
  const abertas = await pendenciasAbertas(db, reqRow.id);
  if (abertas.length) throw erro(400, mensagemGate(abertas));
}

/** A literal do gate para o ramo `changes === 0` do UPDATE guardado. */
async function mensagemGateAtual(db, requisicaoId) {
  const abertas = await pendenciasAbertas(db, requisicaoId);
  return abertas.length ? mensagemGate(abertas) : null;
}

// ── Consulta ──

async function listarPendenciasDaRequisicao(db, requisicaoId) {
  const req = await dbGet(db, 'SELECT id FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  if (!req) throw erro(404, 'Requisição não encontrada');
  const rows = await dbAll(db, 'SELECT * FROM requisicao_aprovacoes_regra WHERE requisicao_id = ? ORDER BY id',
    [requisicaoId]);
  return rows.map((r) => ({ ...r, aprovadores: parseIds(r.aprovadores) }));
}

/** A fila: só pendência ABERTA de requisição ainda aguardando. `pode_assinar` é por identidade. */
async function listarFilaPendentes(db, user) {
  const rows = await dbAll(db, `SELECT p.*, q.numero, q.solicitante_id, q.solicitante_nome, q.valor_total,
      q.status AS requisicao_status, q.created_at AS requisicao_criada_em
    FROM requisicao_aprovacoes_regra p
    JOIN requisicoes_almoxarifado q ON q.id = p.requisicao_id
    WHERE p.status = 'ABERTA' AND q.status IN (${STATUS_AGUARDANDO_SQL}) AND COALESCE(q.ativo, 1) = 1
    ORDER BY q.created_at, p.id`);
  const assinadasPorMim = new Set((await dbAll(db,
    `SELECT requisicao_id FROM requisicao_aprovacoes_regra WHERE aprovador_id = ? AND status = 'APROVADA'`,
    [user?.id || -1])).map((r) => r.requisicao_id));
  // Fase 5 (autorizacao, M-3): filtrado no SERVIDOR - antes a fila inteira (nomes de regra, ids de
  // aprovadores) ia a qualquer usuario do modulo e so a tela filtrava. Quem configura o modulo ve
  // tudo, porque e quem destrava (desativa a regra ou assina como admin).
  const veTudo = isAdmin(user);
  return rows.map((r) => {
    const aprovadores = parseIds(r.aprovadores);
    const pode = !!user?.id
      && Number(user.id) !== Number(r.solicitante_id)
      && (aprovadores.includes(Number(user.id)) || isAdmin(user))
      && !assinadasPorMim.has(r.requisicao_id);
    return { ...r, aprovadores, pode_assinar: pode };
  }).filter((r) => r.pode_assinar || veTudo);
}

/** Contagem por requisição, para `GET /requisicoes` e `/:id` (9.7/I4). */
async function contarAbertasPorRequisicao(db, ids) {
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await dbAll(db, `SELECT requisicao_id, COUNT(*) AS n FROM requisicao_aprovacoes_regra
    WHERE status = 'ABERTA' AND requisicao_id IN (${placeholders}) GROUP BY requisicao_id`, ids);
  return new Map(rows.map((r) => [Number(r.requisicao_id), Number(r.n)]));
}

// ── A assinatura (RN-07) ──

async function assinarPendencia(db, requisicaoId, pendenciaId, user) {
  const pend = await dbGet(db, 'SELECT * FROM requisicao_aprovacoes_regra WHERE id = ? AND requisicao_id = ?',
    [pendenciaId, requisicaoId]);
  if (!pend) throw erro(404, 'Aprovação de regra não encontrada');
  const req = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);

  // Pré-checagem, na ordem da 9.5 — dá a MENSAGEM certa para o caso certo.
  const motivo = await motivoRecusa(db, req, pend, user);
  if (motivo) throw motivo;

  // O claim: a GARANTIA. Todas as condições de novo, no WHERE de um UPDATE só (8.3).
  const res = await dbRun(db, `UPDATE requisicao_aprovacoes_regra
    SET status = 'APROVADA', aprovador_id = ?, aprovador_nome = ?, aprovado_em = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'ABERTA'
      AND EXISTS (SELECT 1 FROM requisicoes_almoxarifado q
                  WHERE q.id = ? AND q.status IN (${STATUS_AGUARDANDO_SQL}) AND q.solicitante_id IS NOT ?)
      AND NOT EXISTS (SELECT 1 FROM requisicao_aprovacoes_regra o
                      WHERE o.requisicao_id = ? AND o.aprovador_id = ? AND o.status = 'APROVADA')`,
  [user.id, nomeDoUsuario(user), pendenciaId, requisicaoId, user.id, requisicaoId, user.id]);

  if (!res.changes) {
    // Perdeu a corrida: relê e devolve a mensagem da condição que falhou.
    const reqAgora = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
    const pendAgora = await dbGet(db, 'SELECT * FROM requisicao_aprovacoes_regra WHERE id = ?', [pendenciaId]);
    throw (await motivoRecusa(db, reqAgora, pendAgora, user))
      || erro(400, 'Esta aprovação de regra não está mais aberta');
  }

  const abertas = await pendenciasAbertas(db, requisicaoId);
  return { success: true, pendencias_abertas: abertas.length };
}

async function motivoRecusa(db, req, pend, user) {
  if (!req || !STATUS_REQUISICAO_AGUARDANDO.includes(req.status) || req.ativo === 0) {
    return erro(400, 'Requisição não está aguardando aprovação');
  }
  if (pend.status !== 'ABERTA') return erro(400, 'Esta aprovação de regra não está mais aberta');
  if (Number(user.id) === Number(req.solicitante_id)) {
    return erro(403, 'Solicitante não pode aprovar a própria requisição');
  }
  if (!parseIds(pend.aprovadores).includes(Number(user.id)) && !isAdmin(user)) {
    return erro(403, 'Você não está entre os aprovadores desta regra');
  }
  // Fase 5 (autorizacao, M-1): o JWT sobrevive 24h a desativacao do usuario, e o snapshot da
  // pendencia o mantem na lista. So recusa quando a linha EXISTE e esta inativa.
  const cadastro = await dbGet(db, 'SELECT ativo FROM usuarios WHERE id = ?', [user.id]).catch(() => null);
  if (cadastro && Number(cadastro.ativo) === 0) {
    return erro(403, 'Usuário inativo não pode assinar aprovação de regra');
  }
  const outra = await dbGet(db, `SELECT id FROM requisicao_aprovacoes_regra
    WHERE requisicao_id = ? AND aprovador_id = ? AND status = 'APROVADA'`, [req.id, user.id]);
  if (outra) return erro(403, 'Você já assinou outra aprovação de regra desta requisição');
  return null;
}

module.exports = {
  GATE_SQL,
  STATUS_REQUISICAO_AGUARDANDO,
  validarRegra,
  listarRegras,
  criarRegra,
  atualizarRegra,
  regraCasa,
  avaliarRequisicao,
  exigirSemPendenciaAberta,
  mensagemGateAtual,
  pendenciasAbertas,
  listarPendenciasDaRequisicao,
  listarFilaPendentes,
  contarAbertasPorRequisicao,
  assinarPendencia,
};
