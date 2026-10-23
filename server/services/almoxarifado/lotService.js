/**
 * Ciclo de vida do lote (Etapa 6).
 *
 * Este servico e o UNICO dono da tabela lotes_almoxarifado. Motivo: a Etapa 5 mostrou o custo de
 * ter duas escritas na mesma coluna de retencao (receiptService escrevia direto e o motor tambem),
 * e a correcao foi centralizar. Aqui a regra nasce centralizada.
 *
 * Mudar status de lote NAO e movimentacao de estoque: nenhuma quantidade muda de lugar, e emitir
 * um BLOQUEIO somaria em materiais_almoxarifado.quantidade_bloqueada, contando a mesma retencao
 * duas vezes. O rastro vai para auditoria_log_almoxarifado com entidade = 'lote'.
 */
const { dbRun, dbGet, dbAll } = require('./db');
const diaLocal = require('../diaLocal');
// Etapa 33: a URL do certificado passa a ser MINADA pelo servidor, no ponto unico do modulo.
const { materialPhotoUrl } = require('./materialPhoto');
const { registrarAuditoria, registrarAuditoriaDoAto } = require('./audit');
const { validarData } = require('./auditFiltros');

const STATUS_LOTE = ['ATIVO', 'BLOQUEADO', 'REPROVADO'];

function erro(msg, status = 400) {
  return Object.assign(new Error(msg), { status });
}

// ── Etapa 190 (C450) — a validade do lote informada na Entrada manual ─────────────────────────────────────────────────────
/**
 * `AAAA-MM-DD` -> `DD/MM/AAAA` so trocando os campos (sem `new Date`: a licao da Etapa 170 — o fuso do processo nao entra numa data
 * que e so data). Fase 2 (M-2): o recebimento nao normaliza `data_validade_lote` (pode vir `2027-03-31 00:00:00`) — o que nao casa
 * `^\d{4}-\d{2}-\d{2}` sai como foi gravado, em vez de virar uma data inventada.
 */
function dataValidadeBR(valor) {
  const s = valor == null ? '' : String(valor);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/** As literais do contrato (plano da Etapa 190, "Contrato" + "Emendas da Fase 2") — o manual cita estas frases. */
const MSG_VALIDADE = {
  FORMATO: 'A validade do lote deve ser uma data no formato AAAA-MM-DD (ex.: 2027-03-31).',
  SO_ENTRADA: 'A validade do lote só pode ser informada numa entrada — numa saída, transferência ou ajuste o lote já existe e a '
    + 'validade é a dele.',
  SEM_LOTE: 'Informe o lote para gravar a validade — a validade é do lote.',
  CONFLITO: (codigo, dataISO) => `O lote ${codigo} já tem validade ${dataValidadeBR(dataISO)}. A validade é do lote, não da entrada: `
    + 'deixe o campo em branco ou informe a mesma data. Se a validade gravada está errada, peça a correção do lote.',
  AVISO_PREENCHIDA: (codigo, dataISO) => `O lote ${codigo} não tinha validade; ela foi gravada agora (${dataValidadeBR(dataISO)}) e `
    + 'vale também para o saldo que já estava nele.',
  AVISO_VENCIDO: (codigo, dataISO) => `O lote ${codigo} entrou já vencido (validade ${dataValidadeBR(dataISO)}). A saída para consumo `
    + 'fica bloqueada até liberar o vencimento na tela de Lotes e Séries.',
  AVISO_CORRIDA: (codigo, dataISO) => `A validade do lote ${codigo} foi gravada por outra operação (${dataValidadeBR(dataISO)}) enquanto `
    + 'esta entrada era registrada; a entrada valeu e a validade do lote não foi alterada.',
  AVISO_FALHA: (codigo, dataISO) => `A entrada foi registrada, mas a validade do lote ${codigo} não pôde ser gravada `
    + `(${dataValidadeBR(dataISO)}). Não repita a entrada; peça a correção da validade do lote.`,
  AVISO_REDEFINIDA: (codigo, antigaISO, novaISO) => `O lote ${codigo} estava vazio com a validade ${dataValidadeBR(antigaISO)}; ela foi `
    + `trocada por ${dataValidadeBR(novaISO)}.`,
};

/**
 * RN-190.02: `""`, `null` e ausente = "nao informado". Qualquer outra coisa tem de ser string `AAAA-MM-DD` de data que existe — a regua
 * de `auditFiltros.validarData` (numero, array e `2027-02-30` recusam) — senao 400 `FORMATO`.
 */
function validarDataValidade(valor) {
  if (valor === undefined || valor === null || valor === '') return { informada: false };
  if (!validarData(valor).ok) throw erro(MSG_VALIDADE.FORMATO);
  return { informada: true, data: valor };
}

/**
 * Vencimento e SEMPRE derivado — ver a nota no CREATE TABLE. Etapa 163 (RN-163.06, C406, B1042): o padrao do `hoje` e o dia de Brasilia
 * (era o `toISOString`, o dia UTC — das 21h a meia-noite o lote que vence hoje ja nao saia). E porta de saldo (a saida do motor e a
 * separacao recusam lote vencido): so a data mudou — as guardas, a ordem delas e a trava ficam como estavam.
 */
function isVencido(lote, hojeISO) {
  if (!lote || !lote.data_validade) return false;
  const hoje = hojeISO || diaLocal.hojeLocalISO();
  return String(lote.data_validade).slice(0, 10) < hoje;
}

async function getLote(db, loteId) {
  if (!loteId) return undefined;
  return dbGet(db, 'SELECT * FROM lotes_almoxarifado WHERE id = ?', [loteId]);
}

async function getLotePorCodigo(db, materialId, codigo) {
  if (!materialId || !codigo) return undefined;
  return dbGet(db, 'SELECT * FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [materialId, String(codigo).trim()]);
}

/**
 * Idempotente por (material_id, codigo). Se o lote ja existe, devolve o existente SEM sobrescrever:
 * o segundo recebimento do mesmo lote nao pode reescrever a validade que veio no primeiro.
 */
async function criarOuObterLote(db, user, dados) {
  const materialId = dados?.material_id;
  const codigo = dados?.codigo == null ? '' : String(dados.codigo).trim();
  if (!materialId) throw erro('material_id obrigatorio para criar lote');
  if (!codigo) throw erro('codigo do lote obrigatorio');

  const existente = await getLotePorCodigo(db, materialId, codigo);
  if (existente) return existente;

  let status = 'ATIVO';
  if (dados.status != null) {
    if (!STATUS_LOTE.includes(dados.status)) {
      throw erro(`status de lote invalido: ${dados.status}. Use ${STATUS_LOTE.join(', ')}`);
    }
    status = dados.status;
  }
  const r = await dbRun(db, `INSERT INTO lotes_almoxarifado
    (material_id, codigo, fornecedor_id, fornecedor_nome, corrida, data_fabricacao, data_validade,
     status, status_motivo, recebimento_id, recebimento_item_id, nota_fiscal, observacoes, created_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    materialId, codigo,
    dados.fornecedor_id || null, dados.fornecedor_nome || null,
    dados.corrida || null, dados.data_fabricacao || null, dados.data_validade || null,
    status, dados.status_motivo || null,
    dados.recebimento_id || null, dados.recebimento_item_id || null,
    dados.nota_fiscal || null, dados.observacoes || null,
    user?.id || null,
  ]);

  const criado = await getLote(db, r.lastID);
  await registrarAuditoria(db, {
    entidade: 'lote', entidade_id: criado.id, acao: 'CRIACAO',
    usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
    dados_novos: {
      codigo: criado.codigo, material_id: criado.material_id, status: criado.status,
      // Etapa 190 (RN-190.04): a validade com que o lote nasceu (null quando nao veio)
      data_validade: criado.data_validade == null ? null : criado.data_validade,
    },
    justificativa: dados.status_motivo || null,
  });
  return criado;
}

/**
 * Etapa 190 (RN-190.05/08, B1273/B1274): a Entrada manual preenche a validade de um lote que nao tinha. Guarda `IS NULL` no WHERE:
 * quem gravou a validade entre a leitura do motor e esta escrita vence, e a funcao devolve a que esta gravada (`atual`) em vez de
 * sobrescrever. O motor chama POR ESTE OBJETO DO MODULO (o teste de corrida substitui a funcao). A auditoria nao derruba (o livro ja
 * gravou a entrada). Erro do UPDATE propaga — quem chama (o motor, depois do livro) e que nao deixa a falha virar 500 (Fase 2, I-1).
 */
async function preencherValidadeSeVazia(db, user, loteId, dataISO, { movimentoId = null } = {}) {
  const claim = await dbGet(db, `UPDATE lotes_almoxarifado SET data_validade = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND data_validade IS NULL RETURNING id`, [dataISO, loteId]);
  if (!claim) {
    const atual = await getLote(db, loteId);
    return { preenchida: false, atual: atual ? atual.data_validade : null };
  }
  await registrarAuditoriaDoAto(db, {
    entidade: 'lote', entidade_id: loteId, acao: 'VALIDADE_PREENCHIDA',
    usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
    dados_anteriores: { data_validade: null },
    dados_novos: { data_validade: dataISO, movimento_id: movimentoId },
  });
  return { preenchida: true };
}

/**
 * Etapa 190 (RN-190.06b, Fase 2 I-2): o lote VAZIO — nenhum movimento vivo com ele (o ESTORNO nao conta: e o desfazer de um que ja
 * morreu), nenhuma linha de saldo diferente de zero e nenhuma serie presente. E o lote que so existe por uma entrada recusada depois
 * de cria-lo (B1275) ou estornada: a validade dele nao esta na historia de nada, e a entrada seguinte pode corrigi-la.
 */
async function loteEstaVazio(db, loteId) {
  const r = await dbGet(db, `SELECT
      (SELECT COUNT(*) FROM movimentacoes_almoxarifado WHERE lote_id = ? AND cancelado = 0 AND tipo <> 'ESTORNO') AS movs,
      (SELECT COUNT(*) FROM estoque_saldo_almoxarifado WHERE lote_id = ? AND ABS(quantidade) > ?) AS saldos,
      (SELECT COUNT(*) FROM series_almoxarifado WHERE lote_id = ? AND status IN ('EM_ESTOQUE', 'BLOQUEADA')) AS series`,
  [loteId, loteId, EPS_SALDO, loteId]);
  return Number(r.movs) === 0 && Number(r.saldos) === 0 && Number(r.series) === 0;
}

/**
 * Etapa 190 (RN-190.06b): troca a validade de um lote vazio, guardada contra a que o motor leu (`WHERE data_validade = antiga`). A
 * liberacao de vencimento era DAQUELA validade (ela guarda contra a data — `liberarVencimento`), entao e zerada junto. Perdeu o
 * UPDATE -> devolve a gravada (`atual`), como o preenchimento.
 */
async function redefinirValidadeDoLoteVazio(db, user, loteId, antigaISO, novaISO, { movimentoId = null } = {}) {
  const claim = await dbGet(db, `UPDATE lotes_almoxarifado SET data_validade = ?, vencimento_liberado_em = NULL,
      vencimento_liberado_por = NULL, vencimento_liberado_motivo = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND data_validade = ? RETURNING id`, [novaISO, loteId, antigaISO]);
  if (!claim) {
    const atual = await getLote(db, loteId);
    return { redefinida: false, atual: atual ? atual.data_validade : null };
  }
  await registrarAuditoriaDoAto(db, {
    entidade: 'lote', entidade_id: loteId, acao: 'VALIDADE_REDEFINIDA',
    usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
    dados_anteriores: { data_validade: antigaISO },
    dados_novos: { data_validade: novaISO, movimento_id: movimentoId },
  });
  return { redefinida: true };
}

/**
 * Guarda no WHERE, como o resto do modulo: se o lote sumiu entre a leitura e a escrita, o UPDATE
 * nao casa e a funcao falha em vez de reportar sucesso sobre nada.
 */
async function mudarStatusLote(db, user, loteId, novoStatus, justificativa) {
  const motivo = justificativa == null ? '' : String(justificativa).trim();
  if (!STATUS_LOTE.includes(novoStatus)) {
    throw erro(`status de lote invalido: ${novoStatus}. Use ${STATUS_LOTE.join(', ')}`);
  }
  if (!motivo) throw erro('justificativa obrigatoria para mudar o status do lote');

  const anterior = await getLote(db, loteId);
  if (!anterior) throw erro('Lote nao encontrado', 404);

  const claim = await dbGet(db, `UPDATE lotes_almoxarifado
    SET status = ?, status_motivo = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = ?
    RETURNING id`, [novoStatus, motivo, loteId, anterior.status]);
  if (!claim) throw erro('O status do lote mudou durante a operacao. Recarregue e tente de novo.', 409);

  // Etapa 121 (C252, B784): o status ja mudou — a falha da Auditoria vai ao log e nao derruba o ato
  await registrarAuditoriaDoAto(db, {
    entidade: 'lote', entidade_id: loteId, acao: 'MUDANCA_STATUS',
    usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
    dados_anteriores: { status: anterior.status, status_motivo: anterior.status_motivo },
    dados_novos: { status: novoStatus, status_motivo: motivo },
    justificativa: motivo,
  });
  return getLote(db, loteId);
}

/**
 * Libera o BLOQUEIO especificamente causado por falta de certificado — usado pela rota de upload
 * do certificado (Etapa 6, Task 5). NAO reaproveita mudarStatusLote aqui: aquela funcao guarda
 * contra o status que ELA MESMA acabou de ler (correto para detectar concorrencia durante a
 * PROPRIA execucao), mas nao protege contra um chamador que decidiu ANTES, com uma leitura
 * separada, se deveria liberar. Achado do review (Task 5, fix round 1): a rota lia o lote, media
 * outro `await` (gravar o arquivo), e SO DEPOIS chamava mudarStatusLote com base na leitura velha
 * — se o lote fosse reprovado nesse intervalo, mudarStatusLote via o status ATUAL (REPROVADO),
 * casava o proprio WHERE contra ele e aplicava a troca pra ATIVO mesmo assim, porque a pre-condicao
 * de negocio ("estava bloqueado por falta de certificado") nunca fazia parte do WHERE. Aqui a
 * pre-condicao INTEIRA mora no WHERE de um UNICO UPDATE — nao ha leitura-decide-escreve para
 * uma mudanca de estado externo atravessar. Devolve null quando a condicao nao bate (lote
 * reprovado, ou bloqueado por outro motivo, ou ja ativo) em vez de lancar: a rota so quer saber
 * se liberou ou nao, e "nao liberou" nao e erro.
 */
async function liberarBloqueioPorCertificado(db, user, loteId, justificativa) {
  const motivo = justificativa == null ? '' : String(justificativa).trim();
  if (!motivo) throw erro('justificativa obrigatoria para liberar o lote');

  const anterior = await getLote(db, loteId);
  if (!anterior) throw erro('Lote nao encontrado', 404);

  const claim = await dbGet(db, `UPDATE lotes_almoxarifado
    SET status = 'ATIVO', status_motivo = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'BLOQUEADO' AND status_motivo LIKE '%certificado%'
    RETURNING id`, [motivo, loteId]);
  if (!claim) return null;

  // Etapa 121 (C252, B784): o certificado e a liberacao ja estao gravados — a falha da Auditoria nao derruba a rota
  await registrarAuditoriaDoAto(db, {
    entidade: 'lote', entidade_id: loteId, acao: 'MUDANCA_STATUS',
    usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
    dados_anteriores: { status: anterior.status, status_motivo: anterior.status_motivo },
    dados_novos: { status: 'ATIVO', status_motivo: motivo },
    justificativa: motivo,
  });
  return getLote(db, loteId);
}

/** Vencimento liberado e um fato datado e assinado — NAO desvence o lote (isVencido nao olha isto). */
function vencimentoLiberado(lote) {
  return !!(lote && lote.vencimento_liberado_em);
}

/**
 * Reaproveita o fluxo de bloqueio/desbloqueio da Etapa 5 (guarda no WHERE, justificativa
 * obrigatoria, auditoria), mas NAO e mudanca de status: sao eixos independentes de proposito
 * (regra 3 da task) — um lote BLOQUEADO ou REPROVADO continua barrado na saida mesmo com o
 * vencimento liberado. Quem faz esse encadeamento e a guarda em stockService, checando status
 * antes de vencimento.
 */
async function liberarVencimento(db, user, loteId, justificativa) {
  const motivo = justificativa == null ? '' : String(justificativa).trim();
  if (!motivo) throw erro('justificativa obrigatoria para liberar o vencimento do lote');

  const anterior = await getLote(db, loteId);
  if (!anterior) throw erro('Lote nao encontrado', 404);
  if (!isVencido(anterior)) throw erro('Lote nao esta vencido; nao ha vencimento para liberar');

  // Guarda no WHERE contra data_validade (a mesma fonte que isVencido leu acima), nao read-then-
  // write: se o lote mudou entre a leitura e a escrita, o UPDATE nao casa e falha em vez de
  // reportar sucesso sobre um estado que ja nao e o que foi checado.
  const claim = await dbGet(db, `UPDATE lotes_almoxarifado
    SET vencimento_liberado_em = CURRENT_TIMESTAMP, vencimento_liberado_por = ?,
        vencimento_liberado_motivo = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND data_validade = ?
    RETURNING id`, [user?.id || null, motivo, loteId, anterior.data_validade]);
  if (!claim) throw erro('O lote mudou durante a operacao. Recarregue e tente de novo.', 409);

  const atualizado = await getLote(db, loteId);
  // Etapa 121 (C252, B784): a liberacao ja esta gravada — a falha da Auditoria vai ao log e nao derruba o ato
  await registrarAuditoriaDoAto(db, {
    entidade: 'lote', entidade_id: loteId, acao: 'LIBERACAO_VENCIMENTO',
    usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
    dados_anteriores: { vencimento_liberado_em: anterior.vencimento_liberado_em },
    dados_novos: { vencimento_liberado_em: atualizado.vencimento_liberado_em, vencimento_liberado_motivo: motivo },
    justificativa: motivo,
  });
  return atualizado;
}

/**
 * Ordem FEFO: elegiveis primeiro, depois validade crescente com nulos por ultimo, depois codigo.
 * Lote nao elegivel (bloqueado, reprovado, vencido) NAO some da lista — vai para o fim. Esconder
 * faz o operador procurar material que o sistema decidiu nao mostrar.
 *
 * `elegivel` segue a MESMA ordem de checagem que o motor usa em stockService antes de aceitar uma
 * SAIDA: status primeiro (BLOQUEADO/REPROVADO nunca elegivel, mesmo com vencimento liberado —
 * sao eixos independentes, ver o comentario de liberarVencimento acima), vencimento depois (vencido
 * SEM liberacao nao e elegivel; vencido COM liberacao passa a ser). A liberacao NAO desvence o
 * lote — por isso `vencido` continua true na linha mesmo depois de liberado; `vencimento_liberado`
 * e o campo que diz que a saida de consumo esta credenciada apesar do vencimento.
 */
async function listarLotesDoMaterial(db, materialId, { apenasComSaldo = false } = {}) {
  const linhas = await dbAll(db, `
    SELECT l.*, COALESCE((
      SELECT SUM(s.quantidade) FROM estoque_saldo_almoxarifado s WHERE s.lote_id = l.id
    ), 0) as saldo
    FROM lotes_almoxarifado l
    WHERE l.material_id = ?`, [materialId]);

  const hoje = diaLocal.hojeLocalISO(); // Etapa 163 (RN-163.06): a mesma regua do isVencido, lida uma vez para a lista toda
  const comFlags = linhas
    .map((l) => {
      const vencido = isVencido(l, hoje);
      const liberado = vencimentoLiberado(l);
      return {
        ...l,
        vencido,
        vencimento_liberado: liberado,
        elegivel: l.status === 'ATIVO' && (!vencido || liberado),
        // Etapa 33 (C42): a tela montava esta URL a partir de `certificado_arquivo` CRU, e URL
        // montada no client nao tem assinatura — o link do certificado daria 404. Quem mina a URL
        // e o servidor, sempre. `null` quando nao ha certificado: a tela ja testa a existencia
        // antes de desenhar o link.
        certificado_url: l.certificado_arquivo ? materialPhotoUrl(l.certificado_arquivo) : null,
      };
    })
    .filter((l) => !apenasComSaldo || l.saldo > 0);

  comFlags.sort((a, b) => {
    if (a.elegivel !== b.elegivel) return a.elegivel ? -1 : 1;
    const va = a.data_validade || '9999-12-31';
    const vb = b.data_validade || '9999-12-31';
    if (va !== vb) return va < vb ? -1 : 1;
    return String(a.codigo).localeCompare(String(b.codigo));
  });
  return comFlags;
}

// ── Etapa 50 (C71): o físico e o "sem lote atribuído" ────────────────────────────────────────
// O saldo de um lote é o ATRIBUÍDO a ele: os fluxos isentos de lote (entrega de requisição, ajuste
// absoluto, internos) gravam na linha `lote_id NULL`, e o lote pode mostrar 100 com o material em 70.
// Esta é a FONTE ÚNICA da conta do resíduo — o relatório "Saldo por lote" (Etapa 49) e a tela de
// Lotes usam as duas funções abaixo, e por isso não podem divergir.
const EPS_SALDO = 1e-9;

/** Arredonda a 6 casas ANTES de comparar — um resíduo de 1e-8 não vira linha "0". */
function residualSemLote(fisico, somaLotes) {
  const r = Math.round(((Number(fisico) || 0) - (Number(somaLotes) || 0)) * 1e6) / 1e6;
  return Math.abs(r) > EPS_SALDO ? r : 0;
}

/**
 * Resumo de um material para a tela de Lotes: `{ fisico, soma_lotes, sem_lote_atribuido }`.
 * O resíduo só é informado nos MESMOS materiais que o relatório mostra (Fase 2 da Etapa 50):
 * ativo E (tem saldo em algum lote OU tem controle de lote com físico ≠ 0). Fora disso, 0 — senão
 * material sem controle e sem lote mostraria o físico inteiro como "sem lote", e o relatório não.
 * A soma é a do relatório: saldo com lote que EXISTE (JOIN lotes), pelo material do saldo.
 */
async function resumoLotesDoMaterial(db, materialId) {
  const m = await dbGet(db, 'SELECT id, ativo, controle_lote, quantidade_atual FROM materiais_almoxarifado WHERE id = ?',
    [materialId]);
  if (!m) throw Object.assign(new Error('Material não encontrado'), { status: 404 });
  const s = await dbGet(db, `SELECT COUNT(*) as n, COALESCE(SUM(s.quantidade), 0) as soma
    FROM estoque_saldo_almoxarifado s
    JOIN lotes_almoxarifado l ON l.id = s.lote_id
    WHERE s.material_id = ?`, [materialId]);
  const fisico = Number(m.quantidade_atual) || 0;
  // Fase 5 (M2): a soma CRUA vai para o residuo, como no relatorio - arredondar antes divergia na 7a casa.
  const somaLotes = Number(s.soma) || 0;
  const exibe = Number(m.ativo) === 1
    && (Number(s.n) > 0 || (Number(m.controle_lote) === 1 && Math.abs(fisico) > EPS_SALDO));
  return {
    fisico,
    soma_lotes: Math.round(somaLotes * 1e6) / 1e6,
    sem_lote_atribuido: exibe ? residualSemLote(fisico, somaLotes) : 0,
  };
}

module.exports = {
  STATUS_LOTE, isVencido, getLote, getLotePorCodigo, criarOuObterLote, mudarStatusLote,
  vencimentoLiberado, liberarVencimento, liberarBloqueioPorCertificado, listarLotesDoMaterial,
  EPS_SALDO, residualSemLote, resumoLotesDoMaterial,
  MSG_VALIDADE, dataValidadeBR, validarDataValidade, preencherValidadeSeVazia, loteEstaVazio, redefinirValidadeDoLoteVazio,
};
