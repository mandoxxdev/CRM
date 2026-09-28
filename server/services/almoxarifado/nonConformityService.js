/**
 * NAO CONFORMIDADE NUMERADA do almoxarifado — o documento `NC-…` (Etapa 43, features 08 + 09).
 *
 * Design: docs/superpowers/specs/2026-09-28-almoxarifado-etapa43-nao-conformidade-numerada-design.md
 * Plano:  docs/superpowers/plans/2026-09-28-almoxarifado-etapa43-nao-conformidade-numerada.md (T1)
 * Testes: server/tests/api/naoConformidadeServico.api.test.js
 *
 * ── O QUE ESTE ARQUIVO RESOLVE ───────────────────────────────────────────────────────────────
 * Ate aqui o modulo DETECTAVA a falta (e a reprovacao) e AVISAVA — por alerta e por e-mail — e
 * pronto. Nao havia documento: ninguem conseguia responder "quem decidiu aceitar aquela falta de
 * 3 kg, e quando", porque a decisao morava no e-mail de alguem. O fato saia do alerta assim que
 * caia fora da janela de dias e sumia. Aqui ele vira documento numerado, com autor, decisao,
 * justificativa e trilha.
 *
 * ── DUAS COISAS QUE ESTE ARQUIVO NAO FAZ, E SAO DE PROPOSITO ─────────────────────────────────
 * 1. NAO calcula divergencia por conta propria. A regua e `divergencia.js`
 *    (`EPSILON_DIVERGENCIA`), importada — dono unico desde a Etapa 10b. Um `!== 0` aqui
 *    transformaria 7e-16 (ruido de IEEE-754 em material fracionado) em documento numerado contra
 *    quem contou CERTO.
 * 2. NAO move estoque na decisao (D7). Decidir `DEVOLVER` nao cria devolucao, `SUCATEAR` nao baixa
 *    saldo. O estoque ja se moveu na conferencia e na inspecao; a NC registra o que se DECIDIU
 *    fazer. Ligar a decisao ao motor e etapa propria — fazer errado seria pior que nao fazer.
 *
 * ── POR QUE `receiptService` NAO E IMPORTADO AQUI ────────────────────────────────────────────
 * A T3 vai fazer `receiptService` chamar `sincronizarNaoConformidadeQuantidade` nos seus DOIS
 * escritores de `quantidade_recebida`. Um `require('./receiptService')` no topo daqui fecharia
 * ciclo e devolveria um objeto PELA METADE, dependendo da ordem de carga — o mesmo motivo que
 * levou `alertRegistry` ao require preguicoso na Etapa 42 (F17). Por isso a unica coisa que este
 * arquivo precisa de la, o nome do status de processado, e uma CONSTANTE LOCAL declarada abaixo,
 * e ha cenario de teste que compara as duas para a copia nao poder derivar em silencio.
 */
const { dbRun, dbGet, dbAll } = require('./db');
const { EPSILON_DIVERGENCIA } = require('./divergencia');
const { inserirComNumeroUnico } = require('./numeroDoc');
const { registrarAuditoria } = require('./audit');

const NC_ORIGENS = ['RECEBIMENTO', 'INSPECAO'];
const NC_REFERENCIA_TIPOS = ['RECEBIMENTO_ITEM', 'INSPECAO'];
const NC_TIPOS = ['QUANTIDADE', 'DIMENSIONAL', 'CERTIFICADO_AUSENTE', 'DANO_FISICO', 'MATERIAL_INCORRETO', 'OUTRO'];
/**
 * Os tres do meio sao os `ENCAMINHAMENTOS` que `inspectionService.js:33` ja usa — REUSADOS, nao
 * reinventados. `ACEITAR_SOB_DESVIO` e o item (2) do "falta para verde" da feature 09: ele fecha o
 * DOCUMENTO, nao a LIBERACAO (os quilos reprovados continuam em `quantidade_bloqueada`).
 */
const NC_DECISOES = ['ACEITAR', 'ACEITAR_SOB_DESVIO', 'DEVOLVER', 'SUBSTITUICAO', 'ANALISE_ENGENHARIA', 'SUCATEAR'];
const NC_STATUS = ['ABERTA', 'DECIDIDA', 'CANCELADA'];

/** Entidade da trilha, e os TRES verbos distintos da RN-09 (rotulos sao da T2). */
const ENTIDADE_AUDITORIA = 'nao_conformidade';
const ACAO_ABERTA = 'NC_ABERTA';
const ACAO_DECIDIDA = 'NC_DECIDIDA';
const ACAO_CANCELADA = 'NC_CANCELADA';

/**
 * Espelha `receiptService.STATUS.PROCESSADO` SEM importa-lo (ver cabecalho: ciclo).
 * `naoConformidadeServico.api.test.js` cenario (7) afirma que as duas strings continuam iguais —
 * uma copia sem guarda deriva, e a guarda da RN-11 viraria comparacao com string morta.
 */
const STATUS_RECEBIMENTO_PROCESSADO = 'PROCESSADO';

/** Prioridade declarada do `tipo` da NC de inspecao (D9): da causa mais especifica para a generica. */
const PRIORIDADE_TIPO_INSPECAO = [
  ['material_incorreto', 'MATERIAL_INCORRETO', 'material incorreto'],
  ['dano_fisico', 'DANO_FISICO', 'dano fisico'],
  ['divergencia_dimensional', 'DIMENSIONAL', 'divergencia dimensional'],
  ['certificado_ausente', 'CERTIFICADO_AUSENTE', 'certificado ausente'],
];

const LIMITE_PADRAO = 100;
const LIMITE_TETO = 500;

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

/**
 * Colisao do INDICE PARCIAL de NC aberta — e SO dele.
 *
 * A regua cita `referencia_id` de proposito: e a coluna que so aparece no indice composto, entao
 * a mensagem do UNIQUE de `numero` (`…nao_conformidades_almoxarifado.numero`) NAO casa aqui e
 * continua subindo para o retry de `inserirComNumeroUnico`. E por isso que o `catch` que traduz
 * esta colisao em `null` fica FORA do `fn` passado ao numerador: por dentro, um catch largo
 * engoliria tambem a colisao de `numero` e mataria o retry que a Etapa 31 existe para ter.
 */
const RE_COLISAO_NC_ABERTA = /UNIQUE constraint failed:[^\n]*nao_conformidades_almoxarifado\.referencia_id/i;
const ehColisaoDeNcAberta = (e) => !!e && RE_COLISAO_NC_ABERTA.test(String(e.message || ''));

/** `Number.isInteger`, nunca `isFinite`: `1.5` viraria `1` no SQLite (precedente de anexoService.js:71). */
function idInteiro(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** A regua de `divergencia.js` aplicada em JS — um `!== 0` aqui documentaria quem acertou. */
const temDivergenciaReal = (valor) => Math.abs(valor) > EPSILON_DIVERGENCIA;

/** "E o mesmo fato?" da RN-10, pela MESMA regua. */
const mesmoFato = (a, b) => Math.abs(Number(a) - Number(b)) <= EPSILON_DIVERGENCIA;

const CAMPOS_LISTA = `nc.id, nc.numero, nc.origem, nc.referencia_tipo, nc.referencia_id, nc.tipo,
  nc.status, nc.material_id, m.codigo AS material_codigo, m.nome AS material_nome,
  m.unidade AS material_unidade, nc.recebimento_id, r.numero AS recebimento_numero, r.nota_fiscal,
  nc.quantidade_esperada, nc.quantidade_recebida, nc.divergencia, nc.descricao, nc.decisao,
  nc.justificativa, nc.aberto_por_id, nc.aberto_por_nome, nc.aberto_automaticamente,
  nc.decidido_por_id, nc.decidido_por_nome, nc.decidido_em, nc.motivo_cancelamento,
  nc.cancelado_em, nc.created_at, nc.updated_at`;

/**
 * O SQL NAO e polimorfico: `material_id` e `recebimento_id` foram CONGELADOS na propria NC no ato
 * da abertura, para as DUAS origens. Sao dois LEFT JOIN e acabou — nada de dois caminhos de JOIN
 * por origem, e nada de coluna vindo nula para metade das linhas.
 */
const FROM_LISTA = `FROM nao_conformidades_almoxarifado nc
  LEFT JOIN materiais_almoxarifado m ON m.id = nc.material_id
  LEFT JOIN recebimentos_material_almoxarifado r ON r.id = nc.recebimento_id`;

/** Le o item de recebimento com o que a NC precisa congelar. */
function getItemRecebimento(db, itemId) {
  return dbGet(db, `SELECT ri.id, ri.recebimento_id, ri.material_id, ri.quantidade_esperada,
      ri.quantidade_recebida, r.status AS recebimento_status
    FROM recebimentos_material_itens_almoxarifado ri
    LEFT JOIN recebimentos_material_almoxarifado r ON r.id = ri.recebimento_id
    WHERE ri.id = ?`, [itemId]);
}

function getInspecao(db, inspecaoId) {
  return dbGet(db, `SELECT i.*, ri.recebimento_id, ri.material_id, ri.quantidade_esperada,
      ri.quantidade_recebida
    FROM inspecoes_recebimento_almoxarifado i
    LEFT JOIN recebimentos_material_itens_almoxarifado ri ON ri.id = i.recebimento_item_id
    WHERE i.id = ?`, [inspecaoId]);
}

/**
 * Resolve o FATO que a NC vai congelar, a partir da referencia. As duas origens devolvem a mesma
 * forma — e isso que dispensa a listagem de saber de onde a NC veio.
 */
async function resolverFato(db, referenciaTipo, referenciaId) {
  if (referenciaTipo === 'RECEBIMENTO_ITEM') {
    const item = await getItemRecebimento(db, referenciaId);
    if (!item) throw erro('Item de recebimento não encontrado', 404);
    return {
      material_id: item.material_id,
      recebimento_id: item.recebimento_id,
      quantidade_esperada: item.quantidade_esperada,
      quantidade_recebida: item.quantidade_recebida,
      divergencia: item.quantidade_recebida == null
        ? null
        : Number(item.quantidade_recebida) - Number(item.quantidade_esperada),
    };
  }
  const insp = await getInspecao(db, referenciaId);
  if (!insp) throw erro('Inspeção não encontrada', 404);
  return {
    material_id: insp.material_id,
    recebimento_id: insp.recebimento_id,
    quantidade_esperada: insp.quantidade_esperada,
    quantidade_recebida: insp.quantidade_recebida,
    divergencia: insp.quantidade_recebida == null
      ? null
      : Number(insp.quantidade_recebida) - Number(insp.quantidade_esperada),
    _inspecao: insp,
  };
}

/**
 * Abre a NC. Devolve o documento, ou `null` quando ja existe uma ABERTA identica (RN-08) — a
 * porta manual da T2 traduz esse `null` em 409; os ganchos automaticos o ignoram.
 *
 * `dados.fato` permite ao chamador passar o fato JA lido (os ganchos acabaram de le-lo); sem ele,
 * a funcao resolve pela referencia e e ela quem devolve o 404 da referencia inexistente.
 */
async function abrirNaoConformidade(db, user, dados = {}) {
  const origem = dados.origem;
  const referenciaTipo = dados.referencia_tipo;
  const tipo = dados.tipo;

  if (!NC_ORIGENS.includes(origem)) throw erro('Origem inválida', 400);
  if (!NC_REFERENCIA_TIPOS.includes(referenciaTipo)) throw erro('Tipo de referência inválido', 400);
  if (!NC_TIPOS.includes(tipo)) throw erro('Tipo de não conformidade inválido', 400);
  const referenciaId = idInteiro(dados.referencia_id);
  if (!referenciaId) throw erro('Referência inválida', 400);

  const fato = dados.fato || await resolverFato(db, referenciaTipo, referenciaId);
  const automatica = dados.aberto_automaticamente ? 1 : 0;

  let inserido;
  try {
    // O `catch` da colisao de idempotencia fica AQUI FORA, e nao dentro do `fn`: por dentro ele
    // engoliria tambem `…nao_conformidades_almoxarifado.numero` e mataria o retry do numerador.
    inserido = await inserirComNumeroUnico(db, 'NC', (numero) => dbRun(db,
      `INSERT INTO nao_conformidades_almoxarifado
        (numero, origem, referencia_tipo, referencia_id, tipo, status, material_id, recebimento_id,
         quantidade_esperada, quantidade_recebida, divergencia, descricao,
         aberto_por_id, aberto_por_nome, aberto_automaticamente)
       VALUES (?,?,?,?,?,'ABERTA',?,?,?,?,?,?,?,?,?)`, [
      numero, origem, referenciaTipo, referenciaId, tipo,
      fato.material_id ?? null, fato.recebimento_id ?? null,
      fato.quantidade_esperada ?? null, fato.quantidade_recebida ?? null, fato.divergencia ?? null,
      dados.descricao || null,
      user?.id || null, user?.nome || user?.email || null, automatica,
    ]));
  } catch (e) {
    if (ehColisaoDeNcAberta(e)) return null;
    throw e;
  }

  const id = inserido.resultado.lastID;
  await registrarAuditoria(db, {
    entidade: ENTIDADE_AUDITORIA,
    entidade_id: id,
    acao: ACAO_ABERTA,
    usuario_id: user?.id,
    usuario_nome: user?.nome || user?.email,
    dados_novos: {
      numero: inserido.numero, origem, referencia_tipo: referenciaTipo, referencia_id: referenciaId,
      tipo, divergencia: fato.divergencia, aberto_automaticamente: automatica,
    },
    justificativa: dados.descricao || null,
  });

  return obterNaoConformidade(db, id);
}

/** A NC ABERTA de um par referencia+tipo, se houver. */
function getAbertaDe(db, referenciaTipo, referenciaId, tipo) {
  return dbGet(db, `SELECT * FROM nao_conformidades_almoxarifado
    WHERE referencia_tipo = ? AND referencia_id = ? AND tipo = ? AND status = 'ABERTA'`,
    [referenciaTipo, referenciaId, tipo]);
}

/**
 * A ULTIMA NC ENCERRADA do mesmo par referencia+tipo — insumo da RN-10.
 * `referencia_tipo` entra na chave porque `referencia_id` sozinho nao distingue item de inspecao:
 * o item 5 e a inspecao 5 sao dois registros diferentes e nao podem compartilhar historia.
 */
function getUltimaEncerrada(db, referenciaTipo, referenciaId, tipo) {
  return dbGet(db, `SELECT * FROM nao_conformidades_almoxarifado
    WHERE referencia_tipo = ? AND referencia_id = ? AND tipo = ?
      AND status IN ('DECIDIDA','CANCELADA')
    ORDER BY id DESC LIMIT 1`, [referenciaTipo, referenciaId, tipo]);
}

/**
 * O gancho de QUANTIDADE, chamado pelos DOIS escritores de `quantidade_recebida`
 * (`conferirRecebimento` e `salvarDadosFiscal`) — a UI de producao passa pelo fiscal, entao
 * enganchar so na conferencia faria a feature nascer invisivel.
 *
 * Idempotente por construcao. Devolve `{ efeito, nc }`, com `efeito` em:
 *   `ABERTA` · `ATUALIZADA` · `CANCELADA` · `BLOQUEADA_PROCESSADO` · `NENHUMA`
 * O valor existe para o teste e para o log do chamador; nenhuma porta HTTP depende dele.
 *
 * ⚠️ O campo chama-se `efeito` e NAO `acao`, e isso NAO e estilo: `auditLabels.api.test.js:61`
 * varre `services/` inteiro com `grep -rhoP "acao: '[A-Z_]+"` e trata CADA casamento como verbo
 * de auditoria que precisa de rotulo na tela. Com o campo chamado `acao` aqui, os cinco valores
 * deste retorno entravam no vocabulario da auditoria e aquele teste caia com "verbos gravaveis
 * sem rotulo" — medido, nao suposto. Nenhum codigo novo em `services/almoxarifado/` pode usar o
 * campo `acao` com literal maiusculo para outra coisa que nao seja verbo de trilha — nem em
 * COMENTARIO, porque a varredura e `grep` e nao le sintaxe (esta frase ja custou uma rodada).
 */
async function sincronizarNaoConformidadeQuantidade(db, user, itemId) {
  const id = idInteiro(itemId);
  if (!id) return { efeito: 'NENHUMA', nc: null };
  const item = await getItemRecebimento(db, id);
  if (!item) return { efeito: 'NENHUMA', nc: null };

  // RN-03: item sem quantidade conferida nao abre NC — ninguem conferiu ainda, e "nao conferido"
  // nao e "divergente".
  if (item.quantidade_recebida == null) return { efeito: 'NENHUMA', nc: null };

  const divergencia = Number(item.quantidade_recebida) - Number(item.quantidade_esperada);
  const divergente = temDivergenciaReal(divergencia);
  const processado = item.recebimento_status === STATUS_RECEBIMENTO_PROCESSADO;
  const aberta = await getAbertaDe(db, 'RECEBIMENTO_ITEM', id, 'QUANTIDADE');

  if (aberta) {
    // RN-11 / D10 — a assimetria e de proposito: com o recebimento PROCESSADO o estoque ja foi
    // creditado, a conta a pagar gerada e o pedido fechado COM ESTE FATO. Uma reconferencia
    // posterior nao pode reescrever nem apagar o documento (destruir e irreversivel); abrir um
    // novo, mais abaixo, continua permitido (criar nao e).
    if (processado) return { efeito: 'BLOQUEADA_PROCESSADO', nc: aberta };

    if (divergente) {
      // RN-04 — enquanto ABERTA, o fato ainda esta sendo apurado.
      await dbRun(db, `UPDATE nao_conformidades_almoxarifado SET
        quantidade_esperada = ?, quantidade_recebida = ?, divergencia = ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'ABERTA'`,
        [item.quantidade_esperada, item.quantidade_recebida, divergencia, aberta.id]);
      return { efeito: 'ATUALIZADA', nc: await obterNaoConformidade(db, aberta.id) };
    }

    // RN-05 — a divergencia sumiu (o operador corrigiu o proprio erro de digitacao). Sem este
    // cancelamento a NC fantasma ficaria aberta para sempre, que e o beco "Atrasado para sempre"
    // da Etapa 42 em outra roupa. O fato congelado NAO e reescrito: o documento continua contando
    // o que se observou, e o que mudou fica no motivo.
    const motivo = `Divergência corrigida na reconferência: recebida ${item.quantidade_recebida} de `
      + `${item.quantidade_esperada} esperada`;
    await dbRun(db, `UPDATE nao_conformidades_almoxarifado SET
      status = 'CANCELADA', motivo_cancelamento = ?, cancelado_em = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'ABERTA'`, [motivo, aberta.id]);
    await registrarAuditoria(db, {
      entidade: ENTIDADE_AUDITORIA,
      entidade_id: aberta.id,
      acao: ACAO_CANCELADA,
      usuario_id: user?.id,
      usuario_nome: user?.nome || user?.email,
      dados_anteriores: { status: 'ABERTA', divergencia: aberta.divergencia },
      dados_novos: { status: 'CANCELADA' },
      justificativa: motivo,
    });
    return { efeito: 'CANCELADA', nc: await obterNaoConformidade(db, aberta.id) };
  }

  if (!divergente) return { efeito: 'NENHUMA', nc: null };

  // RN-10 — nao reabrir sem MUDANCA DE FATO. O modal de NF reenvia a quantidade de TODOS os itens
  // (receiptService.js:889-890), entao salvar de novo sem mexer em nada reabriria documento para
  // um fato que ninguem reobservou. A comparacao e pela regua, nao por `===`: o mesmo numero pode
  // voltar do banco com ruido de REAL.
  const encerrada = await getUltimaEncerrada(db, 'RECEBIMENTO_ITEM', id, 'QUANTIDADE');
  if (encerrada && encerrada.divergencia != null && mesmoFato(encerrada.divergencia, divergencia)) {
    return { efeito: 'NENHUMA', nc: null };
  }

  const nova = await abrirNaoConformidade(db, user, {
    origem: 'RECEBIMENTO',
    referencia_tipo: 'RECEBIMENTO_ITEM',
    referencia_id: id,
    tipo: 'QUANTIDADE',
    aberto_automaticamente: 1,
    descricao: `Recebido ${item.quantidade_recebida} de ${item.quantidade_esperada} esperada`,
    fato: {
      material_id: item.material_id,
      recebimento_id: item.recebimento_id,
      quantidade_esperada: item.quantidade_esperada,
      quantidade_recebida: item.quantidade_recebida,
      divergencia,
    },
  });
  // `null` aqui e a corrida perdida para outra escrita simultanea: o documento existe, so nao foi
  // este chamador que o abriu. Nao e erro.
  return nova ? { efeito: 'ABERTA', nc: nova } : { efeito: 'NENHUMA', nc: null };
}

/**
 * O gancho da INSPECAO (D9): UMA NC por inspecao decidida com reprovacao.
 *
 * `referencia_id` e o `inspecao_id`, que e novo a cada decisao — a idempotencia do indice nem
 * chega a ser exercitada aqui. O `tipo` sai da PRIORIDADE declarada (da causa mais especifica
 * para a mais generica) e TODAS as flags ligadas entram na `descricao`: o tipo serve para agrupar
 * e filtrar, nao para contar a historia. Cair em `QUANTIDADE` significa "reprovou e nenhuma flag
 * foi marcada" — a reprovacao e o fato.
 */
async function abrirNaoConformidadeDeInspecao(db, user, inspecaoId) {
  const id = idInteiro(inspecaoId);
  if (!id) throw erro('Inspeção não encontrada', 404);
  const insp = await getInspecao(db, id);
  if (!insp) throw erro('Inspeção não encontrada', 404);

  const reprovada = Number(insp.quantidade_reprovada) || 0;
  if (!(reprovada > 0)) return null;

  let tipo = 'QUANTIDADE';
  const marcadas = [];
  for (const [coluna, tipoNc, rotulo] of PRIORIDADE_TIPO_INSPECAO) {
    if (insp[coluna]) {
      marcadas.push(rotulo);
      if (tipo === 'QUANTIDADE') tipo = tipoNc;
    }
  }

  const descricao = `Inspeção reprovou ${reprovada}`
    + (insp.encaminhamento ? ` — encaminhamento ${insp.encaminhamento}` : '')
    + (marcadas.length ? `. Sinalizado: ${marcadas.join(', ')}` : '');

  return abrirNaoConformidade(db, user, {
    origem: 'INSPECAO',
    referencia_tipo: 'INSPECAO',
    referencia_id: id,
    tipo,
    aberto_automaticamente: 1,
    descricao,
    fato: {
      material_id: insp.material_id,
      recebimento_id: insp.recebimento_id,
      quantidade_esperada: insp.quantidade_esperada,
      quantidade_recebida: insp.quantidade_recebida,
      divergencia: insp.quantidade_recebida == null
        ? null
        : Number(insp.quantidade_recebida) - Number(insp.quantidade_esperada),
    },
  });
}

/**
 * RN-06 — decidir. E o unico ponto em que uma PESSOA fecha o documento; os ganchos so abrem e
 * cancelam. `decisao` do enum e `justificativa` nao vazia sao obrigatorias: uma decisao sem
 * justificativa nao responde "por que", que e metade da razao de o documento existir.
 */
async function decidirNaoConformidade(db, user, ncId, dados = {}) {
  const id = idInteiro(ncId);
  // `:id` nao numerico e 404, nao 400: o SQLite coage texto em silencio e `WHERE id = 'abc'` nao
  // casaria nada de qualquer forma — melhor dizer a verdade ("nao existe") que um erro de forma.
  if (!id) throw erro('Não conformidade não encontrada', 404);
  if (!NC_DECISOES.includes(dados.decisao)) throw erro('Decisão inválida', 400);
  const justificativa = String(dados.justificativa ?? '').trim();
  if (!justificativa) throw erro('Justificativa é obrigatória para decidir a não conformidade', 400);

  const atual = await dbGet(db, 'SELECT * FROM nao_conformidades_almoxarifado WHERE id = ?', [id]);
  if (!atual) throw erro('Não conformidade não encontrada', 404);
  if (atual.status !== 'ABERTA') throw erro('Esta não conformidade já foi encerrada', 409);

  // `AND status = 'ABERTA'` no UPDATE, e nao so no SELECT acima: e o claim que faz duas decisoes
  // simultaneas nao se sobrescreverem (mesmo molde do claim de `decidirInspecao`).
  const upd = await dbRun(db, `UPDATE nao_conformidades_almoxarifado SET
    status = 'DECIDIDA', decisao = ?, justificativa = ?, decidido_por_id = ?, decidido_por_nome = ?,
    decidido_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'ABERTA'`,
    [dados.decisao, justificativa, user?.id || null, user?.nome || user?.email || null, id]);
  if (!upd.changes) throw erro('Esta não conformidade já foi encerrada', 409);

  await registrarAuditoria(db, {
    entidade: ENTIDADE_AUDITORIA,
    entidade_id: id,
    acao: ACAO_DECIDIDA,
    usuario_id: user?.id,
    usuario_nome: user?.nome || user?.email,
    dados_anteriores: { status: 'ABERTA' },
    dados_novos: { status: 'DECIDIDA', decisao: dados.decisao },
    justificativa,
  });

  return obterNaoConformidade(db, id);
}

/**
 * `limite` (nao `limit`) — convencao medida do modulo (`inspectionService.js:455`,
 * `reportRegistry.js`, `auditFiltros.js`). Com `limit`, um `?limite=500` da tela nova seria
 * ignorado em SILENCIO e o usuario receberia 100 achando que recebeu tudo.
 * O piso e `< 1`, nao `<= 0`: com `<= 0`, um `limite=0.5` viraria `LIMIT 0`, ou seja, 200 com
 * lista VAZIA — o servidor afirmando "nao ha NC" para quem tem (achado da Etapa 29).
 */
function limiteLista(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 1) return LIMITE_PADRAO;
  return Math.min(Math.floor(n), LIMITE_TETO);
}

async function listarNaoConformidades(db, filtros = {}) {
  let sql = `SELECT ${CAMPOS_LISTA} ${FROM_LISTA} WHERE 1 = 1`;
  const params = [];
  // Filtro fora do enum NAO e erro, e sim filtro que nao casa nada — mesma regua de
  // `/inspecoes/pendentes`, que passa `req.query` direto e deixa o SQLite nao casar.
  for (const [campo, coluna] of [['status', 'nc.status'], ['origem', 'nc.origem'], ['tipo', 'nc.tipo']]) {
    if (filtros[campo]) { sql += ` AND ${coluna} = ?`; params.push(filtros[campo]); }
  }
  const materialId = Number(filtros.material_id);
  if (filtros.material_id !== undefined && filtros.material_id !== '' && Number.isFinite(materialId)) {
    sql += ' AND nc.material_id = ?';
    params.push(materialId);
  }
  // ABERTAS primeiro (e o que a tela e o alerta precisam ver), mais velhas no topo dentro delas.
  sql += ` ORDER BY CASE WHEN nc.status = 'ABERTA' THEN 0 ELSE 1 END, nc.created_at DESC, nc.id DESC LIMIT ?`;
  params.push(limiteLista(filtros.limite));
  return dbAll(db, sql, params);
}

/** Devolve `null` (e nao erro) para id inexistente ou nao numerico: quem traduz em 404 e a rota. */
async function obterNaoConformidade(db, ncId) {
  const id = idInteiro(ncId);
  if (!id) return null;
  const row = await dbGet(db, `SELECT ${CAMPOS_LISTA} ${FROM_LISTA} WHERE nc.id = ?`, [id]);
  return row || null;
}

module.exports = {
  abrirNaoConformidade,
  sincronizarNaoConformidadeQuantidade,
  abrirNaoConformidadeDeInspecao,
  decidirNaoConformidade,
  listarNaoConformidades,
  obterNaoConformidade,
  NC_ORIGENS,
  NC_REFERENCIA_TIPOS,
  NC_TIPOS,
  NC_DECISOES,
  NC_STATUS,
  LIMITE_PADRAO,
  LIMITE_TETO,
  STATUS_RECEBIMENTO_PROCESSADO,
};
