/**
 * Sucateamento (Etapa 9, Task 6 — decisao 9 do design).
 *
 * ── O QUE MUDOU, E POR QUE ISTO E UM PROCESSO E NAO UMA ROTA ─────────────────────────────────
 *
 * Ate esta etapa, sucatear era escolher `SUCATA` no formulario generico de movimentacao: um clique
 * de quem tem `movimentar` — o gate mais amplo do modulo — apagava material do patrimonio, sem
 * segunda opiniao e sem registro de por que. A Task 5 fechou aquela porta (SUCATA em
 * TIPOS_DEDICADOS: a rota v2 recusa o tipo) porque, enquanto ela estivesse aberta, o teste que a
 * spec 15 exige — "sucatear sem aprovacao falha" — seria decorativo: bastava mandar
 * `{tipo:'SUCATA'}` na v2 e passar por fora daqui.
 *
 * Este servico e o que existe no lugar: solicitacao -> DUAS assinaturas segregadas -> baixa
 * emitida pelo motor na segunda -> destino final (venda ou descarte).
 *
 * ── AS TRES BARREIRAS DA SEGREGACAO, E POR QUE SAO TRES ──────────────────────────────────────
 *
 *  1. PERFIL (`permissions.can`): `aprovar_sucateamento` (ADMINISTRADOR, ALMOXARIFE) e
 *     `aprovar_sucateamento_gestao` (ADMINISTRADOR, GESTOR). Separa os BALCOES.
 *  2. SOLICITANTE (`user.id` vs `solicitante_id`): quem pediu nao assina nenhuma perna. Sem ela,
 *     um ALMOXARIFE pediria e assinaria a propria perna — metade da dupla aprovacao evaporaria.
 *  3. IDENTIDADE ENTRE AS PERNAS (`user.id` vs o aprovador da OUTRA perna): o mesmo usuario nao
 *     assina as duas. O caso perigoso e o ADMINISTRADOR, que tem as duas acoes por perfil: sem
 *     esta barreira, "dupla aprovacao" seria uma assinatura com dois carimbos.
 *
 * As barreiras 2 e 3 NAO podem morar em `requirePermission` na rota (Task 7): permissao por perfil
 * nao sabe quem pediu nem quem ja assinou. E a barreira 1 mora AQUI, e nao so na rota, porque a
 * acao exigida e propriedade da PERNA e nao da URL — uma rota nova (ou uma rota da Task 7 ligada
 * ao gate errado) herdaria a decisao certa de graca. Mesmo criterio de
 * `ownerRules.assertAjustePermitido`, que checa `can` dentro do motor.
 *
 * `rejeitar` e `registrarDestino` dependem ainda mais disso: "quem aprova QUALQUER uma das duas
 * pernas" e um OU de duas acoes, e `requirePermission` so sabe exigir uma.
 *
 * ── PRE-CHECAGEM, CLAIM, COMPENSACAO (a forma da 8b/8c/Task 3) ───────────────────────────────
 *
 * O modulo NAO TEM TRANSACAO. Entao: tudo o que da para saber antes e checado na SOLICITACAO (e a
 * recusa acontece la, antes de alguem gastar assinatura); a mudanca de estado e um UPDATE UNICO
 * guardado no WHERE; e o que acontece depois do claim tem desfazer explicito escrito a mao.
 *
 * ── SOBRE `sobra_id` E O RETALHO ─────────────────────────────────────────────────────────────
 *
 * Sucatear um retalho registrado GRAVA o vinculo (`sobra_id`) mas NAO muda o status da linha de
 * sobra. Deliberado: a sobra e o anexo DIMENSIONAL do retalho e o saldo mora no material-retalho,
 * que e o que a baixa consome. Mexer nos dois criaria duas fontes para "esta sobra ainda existe?".
 * Quem quiser marcar a sobra como SUCATEADA usa o PUT /sobras/:id da Task 1, que audita.
 */
const { dbRun, dbAll, dbGet } = require('./db');
const { registrarAuditoria } = require('./audit');
const { can, getPerfilFromUser } = require('./permissions');
const { disponivelSql } = require('./availabilitySql');
const stockService = require('./stockService');
const ownerRules = require('./ownerRules');
const lotService = require('./lotService');
const sm = require('./scrapDisposalStateMachine');

function erro(msg, status = 400) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

/**
 * As duas pernas, DECLARADAS. Os nomes de coluna vem daqui e nunca do parametro `perna` do
 * chamador — e por isso que interpolar `colId`/`colNome`/`colEm` no SQL abaixo e seguro: o valor
 * recebido de fora e usado apenas como CHAVE deste objeto, e uma chave desconhecida e recusada
 * antes de qualquer SQL.
 *
 * `outra` fecha o par: a barreira de identidade (barreira 3) e o `CASE` do claim precisam olhar
 * exatamente a coluna da OUTRA perna, e derivar isso do proprio mapa evita o erro de espelho —
 * copiar o bloco da perna do almoxarifado e esquecer de trocar uma das colunas faria a perna de
 * gestao conferir a si mesma e nunca fechar o processo.
 */
/**
 * Etapa 68 (D6 revisto na Fase 2) — a origem da SUCATA quando o material ja foi transferido para a
 * area de sucata (spec 19: "Transferir para area de sucata → Registrar venda ou descarte").
 * Devolve o id de UMA localizacao cuja area EFETIVA e SUCATA (tipo proprio ou do ancestral mais
 * proximo), ativa, nao bloqueada, com saldo SEM LOTE que cobre a quantidade INTEIRA — a de maior
 * saldo, empate pelo menor id —, ou null (o comportamento de hoje: sem origem).
 *
 * So quando cobre tudo, e o chamador manda `origemEstrita`: com dreno parcial a origem nao-estrita
 * gravava "saiu de S" com parte vinda de P, e o estorno devolvia tudo para S (sonda68-d6). Saldo
 * espalhado em duas posicoes da area: nenhuma cobre sozinha → hoje (declarado). Bloqueada fica fora
 * porque o motor recusa origem bloqueada e a aprovacao travaria; inativa fica fora por decisao.
 * Material com lote: nao chega aqui (a saida com lote nao drena por endereco — B204/C72).
 * Descartados: drenar so a area (recusaria o descarte de material nao transferido) e dividir em dois
 * movimentos (mais regra no motor por um caso raro).
 */
async function origemAreaDeSucata(db, materialId, quantidade, { loteId = null } = {}) {
  // Etapa 69 (Fase 2): `loteId` so e passado pelo caminho do REPROVADO (`doBloqueado`): com lote e o
  // reprovado transferido para a area, a baixa sai da area — o saldo daquele LOTE na posicao tem de
  // cobrir. O sucateamento comum continua chamando sem lote (`lote_id IS NULL`, a B289 de antes).
  const linhas = await dbAll(db, `SELECT s.localizacao_id id, SUM(s.quantidade) q
      FROM estoque_saldo_almoxarifado s
      JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id
     WHERE s.material_id = ? AND s.lote_id IS ? AND s.localizacao_id IS NOT NULL
       AND l.ativo = 1 AND COALESCE(l.bloqueada, 0) = 0
     GROUP BY s.localizacao_id
    HAVING SUM(s.quantidade) > 0
     ORDER BY q DESC, s.localizacao_id`, [materialId, loteId || null]);
  if (!linhas.length) return null;
  const arvore = await stockService.carregarArvoreLocalizacoes(db);
  const EPS = 1e-9; // mesma tolerancia do motor (quantidade e REAL no SQLite)
  for (const l of linhas) {
    if (Number(l.q) + EPS < Number(quantidade)) continue;
    const area = stockService.resolverAreaEfetiva(arvore, l.id);
    if (area && area.chave === 'SUCATA') return Number(l.id);
  }
  return null;
}

const PERNAS = {
  almoxarifado: {
    acao: 'aprovar_sucateamento',
    rotulo: 'almoxarifado',
    colId: 'aprovador_almox_id',
    colNome: 'aprovador_almox_nome',
    colEm: 'aprovado_almox_em',
    outra: 'gestao',
  },
  gestao: {
    acao: 'aprovar_sucateamento_gestao',
    rotulo: 'gestao',
    colId: 'aprovador_gestao_id',
    colNome: 'aprovador_gestao_nome',
    colEm: 'aprovado_gestao_em',
    outra: 'almoxarifado',
  },
};

/** As duas acoes que autorizam ALGUMA perna — a base do "quem aprova qualquer uma". */
const ACOES_APROVACAO = Object.values(PERNAS).map((p) => p.acao);

const nomeDoUsuario = (user) => user?.nome || user?.email || null;

const ouNulo = (v) => (v === undefined || v === '' ? null : v);

async function obter(db, id) {
  const row = await dbGet(db, 'SELECT * FROM sucateamentos_almoxarifado WHERE id = ?', [id]);
  if (!row) throw erro(`Sucateamento ${id} nao encontrado`, 404);
  return row;
}

/** Recusa quem nao aprova NENHUMA das duas pernas (rejeitar e registrar destino). */
function assertAprovaAlgumaPerna(user, oQue) {
  if (ACOES_APROVACAO.some((acao) => can(user, acao))) return;
  throw erro(`${oQue} exige permissao para aprovar sucateamento (${ACOES_APROVACAO.join(' ou ')}) `
    + `— seu perfil e ${getPerfilFromUser(user)}.`, 403);
}

/**
 * Solicitar. TODA recusa que der para antecipar acontece AQUI, e essa e a decisao central da
 * funcao: o que ela deixar passar so sera recusado na SEGUNDA assinatura, quando duas pessoas ja
 * gastaram o tempo delas e a primeira perna ja esta assinada (e desfaze-la custa compensacao).
 *
 * O que e checado, e de onde vem a regra — nenhuma delas e reimplementada aqui:
 *  - dono do material: `ownerRules.assertSaidaPermitida` com o tipo REAL da baixa ('SUCATA', que
 *    esta em TIPOS_SAIDA_COM_DONO). Chamar a guarda de verdade, e nao escrever "if tem dono exige
 *    projeto", e o que garante que a mensagem seja a mesma que o operador veria no motor e que o
 *    caso do projeto interno (cliente_id NULL nao e coringa) continue sendo recusado.
 *  - disponivel: `disponivelSql` (availabilitySql.js). REGRA do modulo desde a 8b — nenhuma query
 *    nova escreve a subtracao a mao, e ha teste que varre o codigo-fonte atras de quem escrever.
 *  - lote pertence ao material: `lotService.getLote`, como em scrapService.gerarRetalho.
 *
 * `controle_serie` e RECUSADO, e a recusa ENSINA o caminho. O processo nao tem campo de serie:
 * a baixa sairia sem reivindicar nenhuma e quebraria na hora o invariante da Etapa 6b
 * (COUNT(series presentes) == quantidade_atual), que compensacao nenhuma reconstroi — e aqui isso
 * aconteceria na segunda assinatura. Precedente duplo no proprio modulo: scrapService.gerarRetalho
 * e returnService (devolucao com serie em destino nao suportado) recusam pelo mesmo motivo e
 * apontam a mesma saida — a tela que TEM seletor de serie.
 *
 * NAO ha checagem de permissao aqui (ao contrario de `aprovar`): solicitar sucateamento e ato de
 * quem esta com o material na mao, e o processo inteiro existe justamente para que solicitar NAO
 * seja poder nenhum — nada sai do estoque sem as duas assinaturas. O gate da rota fica com a
 * Task 7.
 */
async function solicitar(db, user, payload = {}) {
  if (!user || !user.id) throw erro('Usuario responsavel obrigatorio');

  const {
    material_id: materialId, lote_id: loteId = null, sobra_id: sobraId = null,
    classificacao = null, peso_estimado: pesoEstimado = null,
    projeto_origem_id: projetoOrigemId = null, os_origem_id: osOrigemId = null,
    observacoes = null,
  } = payload;
  const quantidade = Number(payload.quantidade);
  const justificativa = (payload.justificativa || '').toString().trim();

  if (!(quantidade > 0)) throw erro('quantidade a sucatear deve ser maior que zero');
  // O motor exige justificativa em SUCATA (movementRules.REGRAS_VINCULO). Ela nasce obrigatoria
  // aqui para a recusa nao esperar a segunda assinatura.
  if (!justificativa) {
    throw erro('Justificativa e obrigatoria para sucatear: a baixa SUCATA exige o motivo escrito, '
      + 'e ele fica no livro de movimentacoes como a unica explicacao de por que o material sumiu '
      + 'do patrimonio.');
  }

  const material = materialId
    ? await dbGet(db, `SELECT *, ${disponivelSql()} AS disponivel FROM materiais_almoxarifado WHERE id = ?`,
      [materialId])
    : null;
  if (!material) throw erro(`O material ${materialId} nao existe`);
  if (!material.ativo) {
    throw erro(`O material ${material.codigo} esta inativo e nao pode ser movimentado — reative o `
      + 'cadastro antes de sucatear');
  }

  if (material.controle_serie) {
    throw erro(`O material ${material.codigo} tem controle de serie e o processo de sucateamento nao `
      + 'tem campo para dizer QUAL numero de serie esta sendo sucateado — baixar sem reivindicar a '
      + 'serie deixaria o saldo menor que a contagem de series e a peca sucateada continuaria "em '
      + 'estoque" na lista de series. Baixe a peca pela tela de Movimentacoes, que tem seletor de '
      + 'serie.');
  }

  if (material.controle_lote && !loteId) {
    throw erro(`O material ${material.codigo} controla lote: informe o lote a sucatear (lote_id) — a `
      + 'baixa exige o lote de qualquer forma, e descobrir isso so na aprovacao final custaria duas '
      + 'assinaturas.');
  }
  if (loteId) {
    const lote = await lotService.getLote(db, loteId);
    if (!lote) throw erro('Lote informado nao encontrado');
    if (Number(lote.material_id) !== Number(material.id)) {
      throw erro(`O lote ${lote.codigo} pertence a outro material, nao a ${material.codigo}`);
    }
  }

  if (sobraId) {
    const sobra = await dbGet(db, 'SELECT id FROM sobras_material_almoxarifado WHERE id = ?', [sobraId]);
    // Vinculo que aponta para o nada e pior do que vinculo nenhum: parece rastreabilidade e nao e
    // (mesmo criterio do lote "opcional-mas-validado" em scrapService.gerarRetalho).
    if (!sobra) throw erro(`A sobra ${sobraId} nao existe`);
  }

  // A guarda do dono, com o tipo REAL da baixa. `emergencial` nunca e repassado: ele nao bypassa
  // esta guarda (ver o comentario longo em ownerRules.assertSaidaPermitida) e o processo de
  // sucateamento nao tem urgencia — ele tem duas assinaturas.
  await ownerRules.assertSaidaPermitida(db, material, 'SUCATA', {
    os_id: osOrigemId || undefined, projeto_id: projetoOrigemId || undefined });

  const disponivel = Number(material.disponivel);
  if (quantidade > disponivel) {
    throw erro(`Saldo disponivel insuficiente para sucatear ${material.codigo}: disponivel `
      + `${disponivel} ${material.unidade || ''}, solicitado ${quantidade}. O disponivel ja desconta `
      + 'reservado, bloqueado, em inspecao e em poder de terceiros — sucatear alem dele apagaria '
      + 'material que esta comprometido com outra OS.');
  }

  return inserirSolicitacao(db, user, {
    material, loteId, sobraId, quantidade, classificacao, pesoEstimado, projetoOrigemId, osOrigemId,
    justificativa, observacoes, ncId: null,
  }, { disponivel_na_solicitacao: disponivel });
}

/**
 * Etapa 69 — a ESCRITA da solicitacao, extraida de `solicitar` sem mudar o que ela grava, para a
 * solicitacao do REPROVADO (`solicitarDoReprovado`) usar o mesmo INSERT e a mesma auditoria. As
 * RECUSAS nao vem para ca: cada porta tem as suas (o comum olha o disponivel; o reprovado, a NC).
 * `extraAuditoria` entra em `dados_novos` (o comum grava `disponivel_na_solicitacao`; o reprovado,
 * a NC, a inspecao e `bloqueado_na_solicitacao`).
 */
async function inserirSolicitacao(db, user, linha, extraAuditoria = {}) {
  const {
    material, loteId, sobraId, quantidade, classificacao, pesoEstimado, projetoOrigemId, osOrigemId,
    justificativa, observacoes, ncId,
  } = linha;
  const ins = await dbRun(db, `INSERT INTO sucateamentos_almoxarifado
    (material_id, lote_id, sobra_id, quantidade, classificacao, peso_estimado,
     projeto_origem_id, os_origem_id, justificativa, status, solicitante_id, solicitante_nome,
     observacoes, nao_conformidade_id)
    VALUES (?,?,?,?,?,?,?,?,?,'SOLICITADO',?,?,?,?)`, [
    material.id, ouNulo(loteId), ouNulo(sobraId), quantidade, ouNulo(classificacao),
    ouNulo(pesoEstimado), ouNulo(projetoOrigemId), ouNulo(osOrigemId), justificativa,
    user.id, nomeDoUsuario(user), ouNulo(observacoes), ncId || null,
  ]);

  await registrarAuditoria(db, {
    entidade: 'sucateamento',
    entidade_id: ins.lastID,
    acao: 'solicitar',
    usuario_id: user.id,
    usuario_nome: nomeDoUsuario(user),
    dados_novos: {
      material_id: material.id,
      material_codigo: material.codigo,
      quantidade,
      lote_id: ouNulo(loteId),
      sobra_id: ouNulo(sobraId),
      classificacao: ouNulo(classificacao),
      peso_estimado: ouNulo(pesoEstimado),
      projeto_origem_id: ouNulo(projetoOrigemId),
      os_origem_id: ouNulo(osOrigemId),
      ...extraAuditoria,
    },
    justificativa,
  });

  return obter(db, ins.lastID);
}

/** Etapa 69 — a colisao do indice unico parcial `ux_sucateamento_nc_solicitado`, e SO dela. */
const ehColisaoSolicitadoDaNc = (e) => /UNIQUE constraint failed:[^\n]*sucateamentos_almoxarifado\.nao_conformidade_id/i
  .test(String((e && e.message) || ''));

/**
 * Etapa 69 (RN-04, D1) — SOLICITAR o sucateamento do material REPROVADO de uma NC de inspecao
 * decidida SUCATEAR. A porta e a NC, e nao `POST /sucateamentos`: material, quantidade (a reprovada
 * INTEIRA — D4) e lote sao DERIVADOS da inspecao, nunca do payload. Nao move estoque: a baixa e a
 * segunda assinatura, do BLOQUEADO (`aprovar`, `doBloqueado`).
 *
 * As recusas sao as do contrato, NA ORDEM: os niveis 1-17 sao `sucateamentoDoReprovadoPrevisto`
 * (a MESMA funcao que o `/executar` de SUCATEAR consulta — as duas portas nao divergem), o 18 e a
 * guarda do dono com o tipo REAL da baixa, e o 19 a justificativa (a rota ja recusa no Zod; aqui
 * para o chamador direto). Pre-checagem do SOLICITADO aberto para a MENSAGEM; o indice unico
 * parcial e a GARANTIA contra duas solicitacoes concorrentes.
 */
async function solicitarDoReprovado(db, user, ncId, payload = {}) {
  if (!user || !user.id) throw erro('Usuario responsavel obrigatorio');
  const ncs = require('./nonConformityService');
  const id = Number(ncId);
  const doc = Number.isInteger(id) && id > 0
    ? await dbGet(db, 'SELECT * FROM nao_conformidades_almoxarifado WHERE id = ?', [id]) : null;

  // As leituras so no caminho automatico de inspecao — a NC manual nao chega a ler a inspecao alheia
  // para a qual aponta (mesmo criterio de `registrarExecucao`); a precedencia a recusa no nivel 6.
  let insp = null; let material = null; let lote = null; let aberto = null;
  if (doc && doc.aberto_automaticamente && doc.origem === 'INSPECAO' && doc.referencia_tipo === 'INSPECAO') {
    insp = await ncs.getInspecao(db, doc.referencia_id);
    if (insp && insp.material_id) {
      material = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [insp.material_id]);
      lote = await ncs.carregarLoteDoReprovado(db, insp, material);
    }
    aberto = await ncs.sucateamentoAbertoDaNc(db, doc.id);
  }
  const previsto = ncs.sucateamentoDoReprovadoPrevisto(doc, insp, material, lote, aberto);
  if (previsto.efeito === 'RECUSA') throw erro(previsto.mensagem, previsto.status);

  const {
    classificacao = null, peso_estimado: pesoEstimado = null,
    projeto_origem_id: projetoOrigemId = null, os_origem_id: osOrigemId = null, observacoes = null,
  } = payload;
  // (18) a guarda do dono, com o tipo REAL da baixa — material de cliente exige OS/projeto do dono.
  await ownerRules.assertSaidaPermitida(db, material, 'SUCATA', {
    os_id: osOrigemId || undefined, projeto_id: projetoOrigemId || undefined });
  // (19) a literal de hoje do `solicitar`.
  const justificativa = (payload.justificativa || '').toString().trim();
  if (!justificativa) {
    throw erro('Justificativa e obrigatoria para sucatear: a baixa SUCATA exige o motivo escrito, '
      + 'e ele fica no livro de movimentacoes como a unica explicacao de por que o material sumiu '
      + 'do patrimonio.');
  }

  try {
    return await inserirSolicitacao(db, user, {
      material, loteId: previsto.lote_id, sobraId: null, quantidade: previsto.quantidade, classificacao,
      pesoEstimado, projetoOrigemId, osOrigemId, justificativa, observacoes, ncId: doc.id,
    }, {
      nao_conformidade_id: doc.id,
      nao_conformidade_numero: doc.numero,
      inspecao_id: insp.id,
      // O bloqueado e um POOL por material: entre esta solicitacao e a segunda assinatura a baixa
      // pode consumir o bloqueio de OUTRA inspecao (declarado na letra C). Este numero e o rastro.
      bloqueado_na_solicitacao: Number(material.quantidade_bloqueada) || 0,
    });
  } catch (e) {
    if (!ehColisaoSolicitadoDaNc(e)) throw e;
    const outro = await ncs.sucateamentoAbertoDaNc(db, doc.id);
    throw erro(`Já existe um sucateamento solicitado para esta não conformidade (SUC-${outro ? outro.id : '?'}) — aprove ou rejeite esse antes`, 409);
  }
}

/**
 * Desfaz o claim da assinatura quando o motor recusa a baixa (Etapa 9, decisao 15 —
 * "pre-checagem, claim, compensacao", a forma da 8b/8c/Task 3).
 *
 * O ESTADO QUE ISTO IMPEDE: as duas pernas assinadas, status APROVADO e NENHUMA baixa no livro. E
 * o pior estado alcancavel deste processo, porque ele nao PARECE quebrado — `registrarDestino`
 * aceitaria declarar a venda de um material que continua na prateleira, e o relatorio financeiro
 * de sucata (decisao 10) contaria uma sucata que nunca saiu.
 *
 * `movimentacao_sucata_id IS NULL` no WHERE nao e enfeite: e o que impede esta funcao de desfazer
 * uma aprovacao cuja baixa DEU CERTO (uma corrida em que outra execucao emitiu a baixa no meio).
 * Compensar ali destruiria o processo certo por causa do erro de outro.
 *
 * A perna que ja estava assinada ANTES nao e tocada — so a recem-assinada volta a NULL. Limpar as
 * duas apagaria a assinatura de alguem que nao errou nada, e obrigaria o processo a recomecar do
 * zero por um saldo que mudou.
 */
async function compensarAssinatura(db, user, id, perna, motivo, causa = null) {
  await dbRun(db, `UPDATE sucateamentos_almoxarifado
       SET ${perna.colId} = NULL, ${perna.colNome} = NULL, ${perna.colEm} = NULL,
           status = 'SOLICITADO', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND movimentacao_sucata_id IS NULL`, [id]);

  // Sem esta linha, "por que esta solicitacao voltou para SOLICITADO depois de eu ter aprovado?"
  // nao tem resposta em lugar nenhum — a assinatura simplesmente sumiu.
  await registrarAuditoria(db, {
    entidade: 'sucateamento',
    entidade_id: Number(id),
    acao: 'compensacao',
    usuario_id: user?.id,
    usuario_nome: nomeDoUsuario(user),
    dados_novos: { perna: perna.rotulo, status: 'SOLICITADO' },
    // Etapa 69 (Fase 2): no sucateamento do reprovado a recusa pode vir de ANTES do motor (NC
    // cancelada, claim da inspecao perdido) — `causa` diz a causa real em vez de culpar o motor.
    justificativa: `compensacao automatica: ${causa || 'a baixa SUCATA foi recusada pelo motor'} (${motivo}), `
      + `entao a assinatura da perna ${perna.rotulo} foi desfeita e o processo voltou a SOLICITADO`,
  }).catch(() => {});
}

/** Etapa 69 — o motivo da `SUCATA` do reprovado: o que a torna legivel no livro sem cruzar tabela. */
const MOTIVO_SUCATA_REPROVADO = 'Sucateamento de material reprovado';

/** Etapa 69 — a causa do claim da inspecao perdido, relida dos carimbos (Fase 2). */
const CLAIM_INSPECAO_PERDIDO = {
  SUCATEADA: 'O material desta inspeção já foi sucateado — a assinatura foi desfeita',
  DEVOLVIDA: 'O material desta inspeção já havia sido devolvido ao fornecedor — a assinatura foi desfeita',
  LIBERADA: 'O material desta inspeção já havia sido liberado por outra não conformidade — a assinatura foi desfeita',
};

/**
 * Etapa 69 (RN-05, RN-06, RN-09) — a segunda assinatura de um sucateamento LIGADO a NC: baixa a
 * `SUCATA` do BLOQUEADO. A ordem e o contrato, e cada falha desfaz o que ja fez:
 *
 *   1. rele a NC: CANCELADA -> 400 (o cancelamento entre as pernas; a 1a perna ja recusa antes)
 *   2. claim da INSPECAO nos TRES carimbos -> 0 linhas = 409 com a causa relida
 *   3. origem (D9): area de sucata que cobre tudo NAQUELE lote (estrita) > endereco de entrada do
 *      item (nao estrita, o helper da 57) > sem origem; e o motor com `doBloqueado`
 *   4. qualquer falha de 1-3: `sucateamento_em` volta a NULL (so se ESTA chamada carimbou — o
 *      carimbo de outro caminho nao e nosso) e `compensarAssinatura`; o erro original sobe
 *
 * O que vem DEPOIS do motor (movimentacao no sucateamento e a execucao na NC) NAO compensa: a baixa
 * valeu, e desfazer a assinatura a deixaria orfa — a mesma inversao deliberada da 45.
 */
async function baixarReprovado(db, user, atual, perna) {
  const ncs = require('./nonConformityService');
  let inspId = null;
  let carimbou = false;
  try {
    const doc = await dbGet(db, 'SELECT * FROM nao_conformidades_almoxarifado WHERE id = ?', [atual.nao_conformidade_id]);
    if (!doc) throw erro('Não conformidade não encontrada', 404);
    if (doc.status === 'CANCELADA') {
      throw Object.assign(erro(`A não conformidade ${doc.numero} foi cancelada — o sucateamento não baixa material de documento cancelado`),
        { causa: 'a nao conformidade foi cancelada' });
    }
    inspId = doc.referencia_id;
    const claimInsp = await dbRun(db, `UPDATE inspecoes_recebimento_almoxarifado
       SET sucateamento_em = CURRENT_TIMESTAMP
     WHERE id = ? AND sucateamento_em IS NULL AND devolucao_fornecedor_em IS NULL AND liberacao_nc_em IS NULL`, [inspId]);
    if (!claimInsp.changes) {
      const agora = await dbGet(db, `SELECT liberacao_nc_em, devolucao_fornecedor_em, sucateamento_em
        FROM inspecoes_recebimento_almoxarifado WHERE id = ?`, [inspId]);
      const saiu = ncs.retencaoDaInspecaoJaSaiu(agora);
      throw Object.assign(erro(CLAIM_INSPECAO_PERDIDO[saiu]
        || 'O material desta inspeção já saiu do estoque por outro caminho — a assinatura foi desfeita', 409),
      { causa: 'o material desta inspecao ja saiu do estoque por outro caminho' });
    }
    carimbou = true;

    const insp = await ncs.getInspecao(db, inspId);
    const origemArea = await origemAreaDeSucata(db, atual.material_id, atual.quantidade, { loteId: atual.lote_id });
    const origem = origemArea ? { id: origemArea }
      : await ncs.origemDaEntradaDaInspecao(db, insp, doc, atual.material_id, atual.lote_id);
    const mov = await stockService.registrarMovimentacao(db, user, {
      material_id: atual.material_id,
      tipo: 'SUCATA',
      quantidade: atual.quantidade,
      lote_id: atual.lote_id || undefined,
      localizacao_origem_id: origem ? origem.id : undefined,
      os_id: atual.os_origem_id || undefined,
      projeto_id: atual.projeto_origem_id || undefined,
      justificativa: atual.justificativa,
      motivo: MOTIVO_SUCATA_REPROVADO,
      documento_vinculado: doc.numero,
      // `SUC-<id>` + `nao_conformidade_id` e o discriminador da recusa do ESTORNO no motor (D3).
      referencia: `SUC-${atual.id}`,
    }, { exigeLote: true, exigeSerie: true, doBloqueado: true, origemEstrita: !!origemArea });
    return { mov, doc };
  } catch (e) {
    if (carimbou) {
      await dbRun(db, `UPDATE inspecoes_recebimento_almoxarifado SET sucateamento_em = NULL
        WHERE id = ? AND sucateamento_em IS NOT NULL`, [inspId]);
    }
    await compensarAssinatura(db, user, atual.id, perna, e.message, e.causa || null);
    throw e;
  }
}

/**
 * Etapa 69 (RN-05, D7) — registra na NC que a execucao aconteceu, DEPOIS da baixa. `COALESCE` nos
 * tres campos de execucao: a NC legada ja `EXECUTADA` sem movimentacao (o `/executar` de antes
 * registrava SUCATEAR sem mover) preserva quem e quando registrou; a movimentacao e o que faltava.
 * `status <> 'CANCELADA'` no WHERE (Fase 2). A trilha `NC_EXECUTADA` NAO e fatal: a baixa valeu.
 */
async function registrarExecucaoDaNc(db, user, atual, doc, mov) {
  await dbRun(db, `UPDATE nao_conformidades_almoxarifado SET
      execucao_estado = 'EXECUTADA', execucao_em = COALESCE(execucao_em, CURRENT_TIMESTAMP),
      execucao_por_id = COALESCE(execucao_por_id, ?), execucao_por_nome = COALESCE(execucao_por_nome, ?),
      execucao_movimentacao_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND execucao_movimentacao_id IS NULL AND status <> 'CANCELADA'`,
  [user.id, nomeDoUsuario(user), mov.id, doc.id]);
  try {
    await registrarAuditoria(db, {
      entidade: 'nao_conformidade',
      entidade_id: doc.id,
      acao: 'NC_EXECUTADA',
      usuario_id: user.id,
      usuario_nome: nomeDoUsuario(user),
      dados_anteriores: { execucao_estado: doc.execucao_estado },
      dados_novos: {
        execucao_estado: 'EXECUTADA',
        decisao: doc.decisao,
        efeito_saldo: 'SUCATEADA',
        quantidade: atual.quantidade,
        movimentacao_id: mov.id,
        sucateamento_id: atual.id,
      },
      justificativa: `Sucateamento SUC-${atual.id} aprovado nas duas pernas`,
    });
  } catch (e) {
    console.warn(`[sucateamento] baixa do SUC-${atual.id} feita, mas a trilha da NC falhou: ${e.message}`);
  }
}

/**
 * Assinar UMA perna. Se esta assinatura completar as duas, emite a baixa `SUCATA` pelo motor.
 *
 * ── A ORDEM DAS COISAS, E POR QUE ELA E ESTA ─────────────────────────────────────────────────
 *
 *   1. perna valida  2. leitura da linha  3. permissao por perfil  4. maquina de estados
 *   5. segregacao (solicitante e outra perna)  6. CLAIM  7. baixa  8. compensacao se a baixa falhar
 *
 * Tudo o que da para recusar SEM tocar na linha vem antes do claim (passos 1-5): assinar e depois
 * descobrir que a assinatura nao valia obrigaria a desfaze-la, e desfazer assinatura e exatamente
 * o que o passo 8 existe para fazer o MINIMO possivel de vezes.
 *
 * ── O CLAIM ──────────────────────────────────────────────────────────────────────────────────
 *
 * UPDATE UNICO guardado no WHERE (`status='SOLICITADO' AND <coluna da perna> IS NULL`) — o padrao
 * anti-corrida da base (thirdPartyService, stockService.cancelarMovimentacao). Duas execucoes
 * concorrentes da MESMA perna: so uma acha a coluna NULL, a outra pega 0 linhas e leva 409. Sem
 * isso, a segunda sobrescreveria o assinante da primeira — e a auditoria mostraria uma pessoa que
 * nao assinou.
 *
 * O `CASE WHEN <outra perna> IS NOT NULL THEN 'APROVADO'` decide, DENTRO do mesmo UPDATE, se esta
 * assinatura e a que fecha: ele le o valor da outra coluna sob o lock de linha do SQLite. Ler
 * antes e decidir depois abriria a janela em que as duas ultimas assinaturas concorrentes se veem
 * como "a primeira" e nenhuma emite a baixa.
 *
 * ── POR QUE NAO HA PRE-CHECAGEM DE DISPONIVEL AQUI (leia antes de "corrigir") ────────────────
 *
 * O design (decisao 9) fala em "pre-checagem de saldo na solicitacao E na aprovacao final". Na
 * aprovacao, quem faz essa checagem e o MOTOR: `registrarMovimentacao` valida o disponivel no
 * proprio UPDATE de saldo, ANTES de qualquer efeito, e recusa com o numero na mensagem. Repetir a
 * conta aqui, antes do claim, seria (a) uma segunda fonte da mesma regra — o defeito que
 * availabilitySql.js existe para nao deixar acontecer de novo — e (b) inutil como protecao, porque
 * a janela entre a pre-checagem e o motor e justamente a corrida. O que protege e a compensacao,
 * nao uma checagem a mais. Efeito colateral bom: a compensacao fica EXERCITAVEL por um teste com
 * injecao natural (consumir o saldo entre a solicitacao e a segunda assinatura); com a checagem
 * extra, aquele teste passaria sem nunca chegar ao claim, provando nada.
 */
async function aprovar(db, user, id, pernaNome) {
  if (!user || !user.id) throw erro('Usuario responsavel obrigatorio');
  const perna = PERNAS[pernaNome];
  if (!perna) {
    throw erro(`Perna de aprovacao desconhecida: ${pernaNome}. As pernas sao `
      + `${Object.keys(PERNAS).join(' e ')}.`);
  }
  const outra = PERNAS[perna.outra];

  const atual = await obter(db, id);

  // Barreira 1 — perfil. A acao e propriedade da PERNA, nao da rota.
  if (!can(user, perna.acao)) {
    throw erro(`Assinar a perna ${perna.rotulo} do sucateamento exige a permissao `
      + `"${perna.acao}" (seu perfil: ${getPerfilFromUser(user)}). As duas pernas sao de balcoes `
      + 'diferentes de proposito: uma so aprovacao nao baixa material do patrimonio.', 403);
  }

  const t = sm.validarTransicao(atual.status, 'APROVADO');
  if (!t.ok) throw erro(t.erro);

  // Barreira 2 — o solicitante nao assina nenhuma perna.
  if (Number(atual.solicitante_id) === Number(user.id)) {
    throw erro('Quem solicitou o sucateamento nao aprova a propria solicitacao — em nenhuma das duas '
      + 'pernas. Peca a assinatura de outra pessoa do almoxarifado e da gestao.', 403);
  }

  // Barreira 3 — o mesmo usuario nao assina as duas pernas. Esta checagem existe pela MENSAGEM: ela
  // explica ao operador o que aconteceu. Quem GARANTE a regra e a condicao gemea dentro do WHERE do
  // claim, logo abaixo — ver o comentario "a barreira 3 se repete no WHERE" ali.
  if (atual[outra.colId] !== null && Number(atual[outra.colId]) === Number(user.id)) {
    throw erro(`Voce ja assinou a perna ${outra.rotulo} deste sucateamento e nao pode assinar tambem `
      + `a perna ${perna.rotulo}: dupla aprovacao com a mesma pessoa nas duas pernas e uma `
      + 'assinatura com dois carimbos. A segunda assinatura tem de ser de outra pessoa.', 403);
  }

  // Etapa 69 (Fase 2, D8) — sucateamento LIGADO a NC cancelada: a assinatura que NAO fecha (a outra
  // perna ainda vazia) recusa ANTES do claim, sem nada a desfazer. A que fecha tem a mesma checagem
  // DEPOIS do claim, dentro do `try` que compensa (passo 1 do contrato) — e o caso da corrida e do
  // cancelamento entre as duas pernas.
  if (atual.nao_conformidade_id && atual[outra.colId] === null) {
    const docNc = await dbGet(db, 'SELECT status FROM nao_conformidades_almoxarifado WHERE id = ?',
      [atual.nao_conformidade_id]);
    if (!docNc || docNc.status === 'CANCELADA') {
      throw erro('A não conformidade foi cancelada — recuse este sucateamento.');
    }
  }

  // ── A BARREIRA 3 SE REPETE NO WHERE, e a repeticao e o que a torna real (fix round 1) ────────
  //
  // Achado do review, e e um TOCTOU classico: a checagem acima le a linha e decide; o claim escreve
  // depois. Entre as duas coisas nao ha lock nenhum. Duas requisicoes SIMULTANEAS do MESMO
  // ADMINISTRADOR — uma em cada perna — leem as duas pernas vazias, as duas passam na checagem, e
  // ai a primeira assina uma perna e a segunda assina a outra: o `CASE` vira APROVADO e a baixa sai
  // com UMA pessoa tendo carimbado os dois lados. Exatamente o que a dupla aprovacao existe para
  // impedir, e alcancavel justamente pelo unico perfil que tem as duas acoes (ADMINISTRADOR) —
  // quem tem as duas acoes e quem tem motivo para clicar nos dois botoes.
  //
  // `IS NULL OR <> ?` e nao so `<> ?` porque em SQL `NULL <> 5` e NULL, nao verdadeiro: sem o
  // `IS NULL` explicito a primeira assinatura (com a outra perna ainda vazia) seria recusada
  // sempre, e o processo nunca sairia do lugar.
  //
  // Simetrico ao claim de `cancelar` abaixo, que tambem repete no WHERE (`solicitante_id = ?`) a
  // identidade que ja checou antes, e pelo mesmo motivo. O padrao do modulo e este: pre-checagem
  // para a MENSAGEM, claim no WHERE para a GARANTIA (stockService.cancelarMovimentacao,
  // thirdPartyService).
  const claim = await dbGet(db, `UPDATE sucateamentos_almoxarifado
       SET ${perna.colId} = ?, ${perna.colNome} = ?, ${perna.colEm} = CURRENT_TIMESTAMP,
           status = CASE WHEN ${outra.colId} IS NOT NULL THEN 'APROVADO' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'SOLICITADO' AND ${perna.colId} IS NULL
       AND (${outra.colId} IS NULL OR ${outra.colId} <> ?)
     RETURNING id, status`, [user.id, nomeDoUsuario(user), id, user.id]);

  if (!claim) {
    throw erro(`A perna ${perna.rotulo} deste sucateamento nao pode ser assinada agora: ela ja foi `
      + 'aprovada, ou o processo nao esta mais em SOLICITADO, ou a outra perna foi assinada por '
      + 'voce mesmo — outra pessoa (ou outra aba sua) agiu enquanto esta tela estava aberta. '
      + 'Recarregue a fila de sucateamentos e confira o estado atual.', 409);
  }

  const fechou = claim.status === 'APROVADO';
  let movimentacao = null;

  let docNc = null;
  if (fechou && atual.nao_conformidade_id) {
    // Etapa 69 — o sucateamento LIGADO a NC baixa do BLOQUEADO. Os passos 1-4 do contrato (NC,
    // claim da inspecao, origem, motor) e as compensacoes moram em `baixarReprovado`.
    ({ mov: movimentacao, doc: docNc } = await baixarReprovado(db, user, atual, perna));
    await dbRun(db, `UPDATE sucateamentos_almoxarifado
       SET movimentacao_sucata_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [movimentacao.id, id]);
    await registrarExecucaoDaNc(db, user, atual, docNc, movimentacao);
  } else if (fechou) {
    try {
      // Etapa 68 (D6 revisto): DENTRO do try — erro de banco aqui ainda compensa a assinatura.
      const origemSucata = atual.lote_id ? null : await origemAreaDeSucata(db, atual.material_id, atual.quantidade);
      movimentacao = await stockService.registrarMovimentacao(db, user, {
        material_id: atual.material_id,
        tipo: 'SUCATA',
        quantidade: atual.quantidade,
        lote_id: atual.lote_id || undefined,
        localizacao_origem_id: origemSucata || undefined,
        // O vinculo da SOLICITACAO vai junto: para material de cliente ele e o que a guarda do dono
        // exige (e ja foi validado la), e para material nosso ele e o que amarra a sucata ao
        // trabalho de onde ela saiu no extrato.
        os_id: atual.os_origem_id || undefined,
        projeto_id: atual.projeto_origem_id || undefined,
        // A justificativa e a DO SOLICITANTE, nao uma frase montada aqui: e o unico texto que
        // explica por que aquele material sumiu do patrimonio, e reescreve-la apagaria o que a
        // pessoa que viu o material escreveu.
        justificativa: atual.justificativa,
        // Fio entre o livro e o processo, no molde do `DEV-<id>` de returnService: o relatorio
        // financeiro de sucata (decisao 10) cruza os dois lados por aqui.
        referencia: `SUC-${atual.id}`,
        // `exigeSerie: true` junto com `exigeLote` (fix round 1, achado do review). Parece morto —
        // `solicitar` RECUSA material com controle_serie —, e nao e: `controle_serie` pode ser
        // LIGADO no cadastro do material entre a solicitacao e a segunda assinatura
        // (MaterialUpdateSchema permite). Sem declarar aqui, a baixa sairia sem reivindicar serie e
        // quebraria na hora o invariante da Etapa 6b (COUNT(series presentes) == quantidade_atual)
        // — e ESSE e o unico estrago que a compensacao NAO reconstroi: ela desfaz o claim, nao a
        // contagem de series. Declarando, o mesmo caso vira uma recusa limpa do motor seguida de
        // compensacao. Custo no caminho legitimo: zero, porque material serializado nao chega aqui.
        // Como sempre neste modulo, no 4o argumento e nunca no body (stockService.js:569-607).
        // Etapa 68: `origemEstrita` so com a origem da area — o motor confere que o saldo nela cobre
        // e nao drena outros enderecos. Sem origem, nada muda (o motor baixa como sempre baixou).
      }, { exigeLote: true, exigeSerie: true, origemEstrita: !!origemSucata });
    } catch (e) {
      await compensarAssinatura(db, user, id, perna, e.message);
      // Re-lanca o erro ORIGINAL do motor, sem mascarar: "Saldo insuficiente. Disponivel: 20 UN" e
      // o que diz ao operador o que corrigir. Um "falha ao aprovar" generico trocaria um erro
      // acionavel por adivinhacao (mesma decisao de returnService).
      throw e;
    }
    await dbRun(db, `UPDATE sucateamentos_almoxarifado
       SET movimentacao_sucata_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [movimentacao.id, id]);
  }

  // Auditoria DEPOIS da baixa, de proposito: gravada antes, ela afirmaria uma aprovacao que a
  // compensacao acabou de desfazer. O caminho compensado deixa a sua propria linha
  // (`acao: 'compensacao'`), que e a versao verdadeira do que aconteceu.
  await registrarAuditoria(db, {
    entidade: 'sucateamento',
    entidade_id: Number(id),
    acao: 'aprovar',
    usuario_id: user.id,
    usuario_nome: nomeDoUsuario(user),
    dados_anteriores: { status: atual.status },
    dados_novos: {
      perna: perna.rotulo,
      status: fechou ? 'APROVADO' : 'SOLICITADO',
      baixa_emitida: fechou,
      movimentacao_sucata_id: movimentacao ? movimentacao.id : null,
    },
    justificativa: atual.justificativa,
  });

  return {
    sucateamento: await obter(db, id),
    baixa_emitida: fechou,
    movimentacao_sucata_id: movimentacao ? movimentacao.id : null,
  };
}

/**
 * Rejeitar, com motivo obrigatorio. Permitido a quem aprova QUALQUER uma das duas pernas — um OU
 * de duas acoes, que `requirePermission` na rota nao saberia exprimir; por isso a checagem mora
 * aqui.
 *
 * O motivo e obrigatorio pela mesma razao que a justificativa da solicitacao: o solicitante viu o
 * material e escreveu por que ele deveria ir para a cacamba, e "nao" sem resposta transforma a fila
 * num lugar onde pedidos somem. Nao ha efeito de saldo nenhum — nada tinha saido.
 */
async function rejeitar(db, user, id, motivo) {
  if (!user || !user.id) throw erro('Usuario responsavel obrigatorio');
  const texto = (motivo || '').toString().trim();
  if (!texto) throw erro('Motivo e obrigatorio para rejeitar um sucateamento');

  assertAprovaAlgumaPerna(user, 'Rejeitar sucateamento');

  const atual = await obter(db, id);
  const t = sm.validarTransicao(atual.status, 'REJEITADO');
  if (!t.ok) throw erro(t.erro);

  const claim = await dbGet(db, `UPDATE sucateamentos_almoxarifado
       SET status = 'REJEITADO', rejeitado_por_id = ?, rejeitado_por_nome = ?,
           motivo_rejeicao = ?, rejeitado_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'SOLICITADO'
     RETURNING id`, [user.id, nomeDoUsuario(user), texto, id]);
  if (!claim) {
    throw erro('O sucateamento nao esta mais em SOLICITADO — outra pessoa agiu enquanto esta tela '
      + 'estava aberta. Recarregue a fila e confira o estado atual.', 409);
  }

  await registrarAuditoria(db, {
    entidade: 'sucateamento',
    entidade_id: Number(id),
    acao: 'rejeitar',
    usuario_id: user.id,
    usuario_nome: nomeDoUsuario(user),
    dados_anteriores: { status: atual.status },
    dados_novos: { status: 'REJEITADO' },
    justificativa: texto,
  });

  return obter(db, id);
}

/**
 * Cancelar — SO o proprio solicitante, e so enquanto SOLICITADO.
 *
 * Cancelar nao e rejeitar, e a diferenca nao e cosmetica: rejeitar e ato de quem aprova, exige
 * motivo e deixa o processo REJEITADO no historico. Se qualquer um pudesse cancelar, a solicitacao
 * alheia sairia da fila sem motivo registrado e sem quem respondesse por isso — ADMINISTRADOR
 * incluido, que tem o caminho legitimo (rejeitar com motivo) disponivel.
 */
async function cancelar(db, user, id) {
  if (!user || !user.id) throw erro('Usuario responsavel obrigatorio');
  const atual = await obter(db, id);
  const t = sm.validarTransicao(atual.status, 'CANCELADO');
  if (!t.ok) throw erro(t.erro);

  if (Number(atual.solicitante_id) !== Number(user.id)) {
    throw erro(`So o solicitante (${atual.solicitante_nome || `usuario ${atual.solicitante_id}`}) `
      + 'cancela o proprio sucateamento. Para recusar a solicitacao de outra pessoa use Rejeitar, '
      + 'que exige motivo e fica no historico.', 403);
  }

  const claim = await dbGet(db, `UPDATE sucateamentos_almoxarifado
       SET status = 'CANCELADO', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'SOLICITADO' AND solicitante_id = ?
     RETURNING id`, [id, user.id]);
  if (!claim) {
    throw erro('O sucateamento nao esta mais em SOLICITADO — outra pessoa agiu enquanto esta tela '
      + 'estava aberta. Recarregue a fila e confira o estado atual.', 409);
  }

  await registrarAuditoria(db, {
    entidade: 'sucateamento',
    entidade_id: Number(id),
    acao: 'cancelar',
    usuario_id: user.id,
    usuario_nome: nomeDoUsuario(user),
    dados_anteriores: { status: atual.status },
    dados_novos: { status: 'CANCELADO' },
  });

  return obter(db, id);
}

/**
 * Destino final: VENDIDA (com valor) ou DESCARTADA. So depois de APROVADO — e APROVADO significa
 * que a baixa JA ACONTECEU (ver a maquina de estados). Registrar destino nao move saldo nenhum: o
 * material saiu do patrimonio na segunda assinatura; aqui se declara o que foi feito com ele.
 *
 * O gate e o mesmo de `rejeitar` ("quem aprova qualquer perna"), e a razao e o `valor_venda`: ele
 * alimenta o relatorio financeiro de sucata (decisao 10) e o indicador "Valor de sucata". Quem
 * autorizou a sucata e a populacao que responde por quanto ela rendeu — deixar isto aberto a
 * qualquer perfil poria numero financeiro na mao de quem nem podia aprovar a baixa.
 * PONTO DE REVISAO DECLARADO: o design nao nomeia acao para esta operacao; se o cliente quiser um
 * gate proprio (financeiro, por exemplo), e aqui que ele entra, e a rota da Task 7 acompanha.
 */
async function registrarDestino(db, user, id, data = {}) {
  if (!user || !user.id) throw erro('Usuario responsavel obrigatorio');
  const { destino, valor_venda: valorVenda = null, comprovante_arquivo: comprovante = null } = data;

  if (!sm.DESTINOS_FINAIS.includes(destino)) {
    throw erro(`Destino invalido: ${destino}. Os destinos finais sao ${sm.DESTINOS_FINAIS.join(' e ')}.`);
  }
  // Repetida aqui (o Zod ja recusa na rota) porque este servico tambem e chamado direto, onde o
  // schema nao passa — mesma disciplina de `quantidade_baixa` em scrapService.gerarRetalho.
  if (destino === 'VENDIDA' && !(Number(valorVenda) > 0)) {
    throw erro('Informe o valor da venda da sucata (valor_venda maior que zero) — o destino VENDIDA '
      + 'alimenta o relatorio financeiro de sucata, e venda sem valor nao e venda.');
  }

  assertAprovaAlgumaPerna(user, 'Registrar destino de sucateamento');

  const atual = await obter(db, id);
  const t = sm.validarTransicao(atual.status, destino);
  if (!t.ok) throw erro(t.erro);

  const claim = await dbGet(db, `UPDATE sucateamentos_almoxarifado
       SET status = ?, valor_venda = ?, comprovante_arquivo = ?,
           destino_registrado_por_id = ?, destino_registrado_por_nome = ?,
           destino_registrado_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'APROVADO'
     RETURNING id`, [
    // Fix wave final da Etapa 9: fora de VENDIDA o valor e FORCADO a NULL — gravar valor_venda
    // em DESCARTADA poe na tabela um dado que mente ("descarte que rendeu dinheiro"); o relatorio
    // financeiro so nao o somava por coincidencia de filtro (status = 'VENDIDA'). A auditoria
    // logo abaixo ja gravava null nesse caso — o banco agora conta a mesma historia.
    destino, destino === 'VENDIDA' ? Number(valorVenda) : null,
    ouNulo(comprovante), user.id, nomeDoUsuario(user), id,
  ]);
  if (!claim) {
    throw erro('O sucateamento nao esta mais em APROVADO — o destino ja foi registrado por outra '
      + 'pessoa enquanto esta tela estava aberta. Recarregue e confira.', 409);
  }

  await registrarAuditoria(db, {
    entidade: 'sucateamento',
    entidade_id: Number(id),
    acao: 'registrar_destino',
    usuario_id: user.id,
    usuario_nome: nomeDoUsuario(user),
    dados_anteriores: { status: atual.status },
    dados_novos: {
      status: destino,
      valor_venda: destino === 'VENDIDA' ? Number(valorVenda) : null,
      comprovante_arquivo: ouNulo(comprovante),
    },
  });

  return obter(db, id);
}

/**
 * A fila. Traz o material resolvido e os dados do `SeloProprietario` (Etapa 8): sem
 * `proprietario_cliente_id` a tela mistura material de cliente com material nosso e nao diz de
 * quem e — a contrapartida obrigatoria de nao filtrar.
 */
async function listar(db, filters = {}) {
  let sql = `SELECT s.*,
      m.codigo AS material_codigo, m.nome AS material_nome, m.unidade AS material_unidade,
      m.proprietario_cliente_id, cli.razao_social AS proprietario_cliente_nome,
      l.codigo AS lote_codigo,
      nc.numero AS nao_conformidade_numero
    FROM sucateamentos_almoxarifado s
    JOIN materiais_almoxarifado m ON s.material_id = m.id
    LEFT JOIN clientes cli ON cli.id = m.proprietario_cliente_id
    LEFT JOIN lotes_almoxarifado l ON l.id = s.lote_id
    LEFT JOIN nao_conformidades_almoxarifado nc ON nc.id = s.nao_conformidade_id
    WHERE 1=1`;
  const params = [];
  if (filters.status) { sql += ' AND s.status = ?'; params.push(filters.status); }
  if (filters.material_id) { sql += ' AND s.material_id = ?'; params.push(filters.material_id); }
  sql += ' ORDER BY s.created_at DESC, s.id DESC';
  return dbAll(db, sql, params);
}

module.exports = {
  PERNAS, ACOES_APROVACAO,
  solicitar, aprovar, rejeitar, cancelar, registrarDestino, listar, obter,
  // Etapa 69
  solicitarDoReprovado, MOTIVO_SUCATA_REPROVADO,
};
