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
 *    ⚠️ ESTE ITEM 2 DEIXOU DE VALER PELA METADE NA ETAPA 44, e fica corrigido a vista em vez de
 *    apagado. "Ligar a decisao ao motor e etapa propria" — foi a Etapa 44, e ela ligou: as duas
 *    decisoes de ACEITACAO (`ACEITAR`, `ACEITAR_SOB_DESVIO`) agora LIBERAM o material que a
 *    inspecao havia bloqueado, por `DESBLOQUEIO` no motor. A metade que continua valendo e a
 *    outra: `DEVOLVER`, `SUBSTITUICAO`, `ANALISE_ENGENHARIA` e `SUCATEAR` continuam marcando
 *    intencao sem tocar no saldo. Quem ler "a NC nao move estoque" e escrever codigo contando com
 *    isso vai se enganar em metade dos casos — por isso a frase esta corrigida, e nao removida.
 *    Ver a secao 3 do design da Etapa 44 (RN-01 a RN-10) e a ORDEM DAS OPERACOES em
 *    `decidirNaoConformidade`, que e o ponto de maior risco desta feature.
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
/**
 * O par valido origem -> referencia_tipo. Existe porque validar os dois SEPARADAMENTE deixava
 * passar a combinacao cruzada, e o indice unico parcial da RN-08 e sobre os dois juntos: trocar
 * so a `origem` abria uma SEGUNDA NC ABERTA do mesmo item e tipo (achado 4 da revisao).
 */
const REFERENCIA_DA_ORIGEM = { RECEBIMENTO: 'RECEBIMENTO_ITEM', INSPECAO: 'INSPECAO' };
const NC_TIPOS = ['QUANTIDADE', 'DIMENSIONAL', 'CERTIFICADO_AUSENTE', 'DANO_FISICO', 'MATERIAL_INCORRETO', 'OUTRO'];
/**
 * Os tres do meio sao os `ENCAMINHAMENTOS` que `inspectionService.js:33` ja usa — REUSADOS, nao
 * reinventados. `ACEITAR_SOB_DESVIO` e o item (2) do "falta para verde" da feature 09: ele fecha o
 * DOCUMENTO, nao a LIBERACAO (os quilos reprovados continuam em `quantidade_bloqueada`).
 */
const NC_DECISOES = ['ACEITAR', 'ACEITAR_SOB_DESVIO', 'DEVOLVER', 'SUBSTITUICAO', 'ANALISE_ENGENHARIA', 'SUCATEAR'];
const NC_STATUS = ['ABERTA', 'DECIDIDA', 'CANCELADA'];

/**
 * Etapa 44 — as DUAS decisoes de ACEITACAO, as unicas que liberam saldo (RN-01).
 *
 * As outras quatro marcam INTENCAO e nao mexem no estoque (RN-04): `SUCATEAR` passa pelas duas
 * pernas de aprovacao do sucateamento e `DEVOLVER`/`SUBSTITUICAO` sao a feature 12. Corte
 * declarado — nao e esquecimento.
 */
const DECISOES_QUE_LIBERAM = ['ACEITAR', 'ACEITAR_SOB_DESVIO'];

/** Os quatro efeitos que a decisao pode ter no saldo, e a mensagem LITERAL de cada um (RN-07). */
const EFEITO_MSG = {
  JA_LIBERADA: 'O material desta inspeção já havia sido liberado',
  SEM_BLOQUEIO: 'Esta não conformidade não tem material bloqueado para liberar',
  SEM_BLOQUEIO_MANUAL: 'Não conformidade aberta manualmente não libera saldo',
  SEM_BLOQUEIO_INATIVO: 'Material inativo — a decisão foi registrada sem liberar saldo',
  NENHUMA: 'Esta decisão não altera o saldo',
};

/** O motivo da movimentacao de liberacao. DISTINTO de "Desbloqueio avulso" de proposito: e o que
 * torna a liberacao legivel no livro sem cruzar tabela nenhuma. */
const MOTIVO_LIBERACAO = 'Liberação por não conformidade';

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
/**
 * O item, opcionalmente PRESO A UM RECEBIMENTO.
 *
 * ⚠️ O escopo nao e enfeite — achado 5 da revisao adversarial (lente 1), reproduzido: o `UPDATE`
 * de `conferirRecebimento` e protegido por `WHERE id = ? AND recebimento_id = ?`, mas o gancho
 * recebia a lista crua e buscava so por `id`. Entao conferir o recebimento A citando o item do
 * recebimento B **abria** documento para o item de B (com autor, hora e ato errados) e, quando o
 * item de B nao estava divergente, **CANCELAVA** a NC de B — documento destruido por um gesto que
 * o proprio serviço ja tinha decidido ignorar. O gancho passa a herdar o mesmo escopo do `UPDATE`.
 */
function getItemRecebimento(db, itemId, recebimentoId = null) {
  return dbGet(db, `SELECT ri.id, ri.recebimento_id, ri.material_id, ri.quantidade_esperada,
      ri.quantidade_recebida, ri.entrada_estoque_em, r.status AS recebimento_status
    FROM recebimentos_material_itens_almoxarifado ri
    LEFT JOIN recebimentos_material_almoxarifado r ON r.id = ri.recebimento_id
    WHERE ri.id = ? AND (? IS NULL OR ri.recebimento_id = ?)`,
  [itemId, recebimentoId, recebimentoId]);
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
 *
 * ⚠️ `fato` e `aberto_automaticamente` sao de USO INTERNO e NUNCA podem vir de payload HTTP —
 * achado 6 da revisao adversarial (lente 2), reproduzido: a rota repassava `req.body` inteiro,
 * entao um ALMOXARIFE mandava `fato: { material_id: <outro>, divergencia: 0 }` e gravava um
 * documento apontando para o material errado, com numeros que contradiziam o item; e mandar
 * `fato` junto com um `referencia_id` inexistente devolvia 201 em vez do 404, porque o `fato`
 * pronto DESLIGA a unica validacao de existencia que havia. Era a feature inteira ao contrario:
 * o "fato congelado" existe para ser confiavel. Quem chama de fora passa por
 * `abrirNaoConformidadeManual`, que nao le esses dois campos.
 */
async function abrirNaoConformidade(db, user, dados = {}) {
  const origem = dados.origem;
  const referenciaTipo = dados.referencia_tipo;
  const tipo = dados.tipo;

  if (!NC_ORIGENS.includes(origem)) throw erro('Origem inválida', 400);
  if (!NC_REFERENCIA_TIPOS.includes(referenciaTipo)) throw erro('Tipo de referência inválido', 400);
  if (!NC_TIPOS.includes(tipo)) throw erro('Tipo de não conformidade inválido', 400);
  // Achado 4 da lente 1: `origem` e `referencia_tipo` eram validados SEPARADAMENTE, e o indice
  // unico parcial e sobre os dois — entao `origem: 'INSPECAO'` com `referencia_tipo:
  // 'RECEBIMENTO_ITEM'` passava por baixo da RN-08 e abria uma SEGUNDA NC do mesmo item+tipo.
  // Pior: `getAbertaDe` nao filtra por origem, entao o gancho so achava a primeira e a outra
  // ficava ABERTA para sempre, alimentando o alerta todo dia — o beco "Atrasado para sempre"
  // que a RN-05 existe para evitar, reintroduzido pela porta manual.
  if (REFERENCIA_DA_ORIGEM[origem] !== referenciaTipo) {
    throw erro('Tipo de referência inválido', 400);
  }
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

/**
 * A PORTA MANUAL. E o unico caminho que codigo de rota deve chamar: ela monta o payload com uma
 * LISTA BRANCA de quatro campos, entao `fato` e `aberto_automaticamente` — que sao de uso interno
 * dos ganchos — nao atravessam a fronteira HTTP nem que o cliente os mande. Ver o aviso no
 * docblock de `abrirNaoConformidade`.
 */
function abrirNaoConformidadeManual(db, user, corpo = {}) {
  return abrirNaoConformidade(db, user, {
    origem: corpo.origem,
    referencia_tipo: corpo.referencia_tipo,
    referencia_id: corpo.referencia_id,
    tipo: corpo.tipo,
    descricao: corpo.descricao,
  });
}

/** A NC ABERTA de um par referencia+tipo, se houver. */
function getAbertaDe(db, referenciaTipo, referenciaId, tipo) {
  return dbGet(db, `SELECT * FROM nao_conformidades_almoxarifado
    WHERE referencia_tipo = ? AND referencia_id = ? AND tipo = ? AND status = 'ABERTA'`,
    [referenciaTipo, referenciaId, tipo]);
}

/**
 * A ULTIMA NC ENCERRADA do mesmo par referencia+tipo que ainda vale como "ja documentado" —
 * insumo da RN-10.
 * `referencia_tipo` entra na chave porque `referencia_id` sozinho nao distingue item de inspecao:
 * o item 5 e a inspecao 5 sao dois registros diferentes e nao podem compartilhar historia.
 *
 * ⚠️ DUAS EXCLUSOES, as duas vindas da revisao adversarial (lente 1, achados 1 e 3):
 *
 * 1. `CANCELADA` NAO entra. Documento cancelado e a divergencia que o operador CORRIGIU; se ela
 *    voltar, e erro NOVO e precisa de documento novo. Tratar o documento morto como "ja
 *    documentado" esconderia exatamente o que a feature existe para mostrar — e o comentario da
 *    exclusao do D6 em `alertRegistry.js:149-151` ja dizia isso por escrito, enquanto esta funcao
 *    fazia o contrario. As duas metades da etapa aplicavam reguas OPOSTAS ao mesmo estado.
 * 2. Documento com `fato_superado_em` NAO entra: o item passou por um estado sem divergencia
 *    depois de o documento encerrar, entao o numero pode coincidir e o fato e outro.
 */
function getUltimaEncerrada(db, referenciaTipo, referenciaId, tipo) {
  return dbGet(db, `SELECT * FROM nao_conformidades_almoxarifado
    WHERE referencia_tipo = ? AND referencia_id = ? AND tipo = ?
      AND status = 'DECIDIDA' AND fato_superado_em IS NULL
    ORDER BY id DESC LIMIT 1`, [referenciaTipo, referenciaId, tipo]);
}

/**
 * O gancho de QUANTIDADE, chamado pelos DOIS escritores de `quantidade_recebida`
 * (`conferirRecebimento` e `salvarDadosFiscal`).
 *
 * ⚠️ A FRASE QUE ESTAVA AQUI — "a UI de producao passa pelo fiscal, entao enganchar so na
 * conferencia faria a feature nascer invisivel" — ESTAVA ERRADA, e ficou dita em vez de apagada
 * porque ela vinha de um comentario do `receiptService` que a revisao adversarial mediu e
 * derrubou. Quem DIGITA a quantidade e o painel de conferencia, pelo campo "Qtd. conferida", que
 * chama `/conferir` desde a Etapa 36 (a decisao esta escrita em
 * `client/.../RecebimentosAlmoxarifado.js:407-419`); o modal de NF **nao tem campo de
 * quantidade** e so REENVIA o que ja estava gravado.
 * **A conclusao continua a mesma, com o motivo certo:** os dois sao escritores de
 * `quantidade_recebida`, os dois podem mudar o fato, entao os dois engancham.
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
async function sincronizarNaoConformidadeQuantidade(db, user, itemId, opcoes = {}) {
  const id = idInteiro(itemId);
  if (!id) return { efeito: 'NENHUMA', nc: null };
  const item = await getItemRecebimento(db, id, opcoes.recebimentoId ?? null);
  if (!item) return { efeito: 'NENHUMA', nc: null };

  // RN-03: item sem quantidade conferida nao abre NC — ninguem conferiu ainda, e "nao conferido"
  // nao e "divergente".
  if (item.quantidade_recebida == null) return { efeito: 'NENHUMA', nc: null };

  const divergencia = Number(item.quantidade_recebida) - Number(item.quantidade_esperada);
  const divergente = temDivergenciaReal(divergencia);
  // RN-11 — "ja entrou no estoque?", nao "o status e PROCESSADO?".
  //
  // ⚠️ CORRIGIDO pela revisao adversarial (lente 1, achado 2, reproduzido): a guarda olhava SO o
  // status `PROCESSADO`, e ha um SEGUNDO caminho que credita estoque — `aprovarRecebimento`, o
  // ramo sem nota fiscal — que deixa o documento em `APROVADO`. Por ele, a NC de uma falta que JA
  // virou estoque e JA fechou o pedido de compra era CANCELADA, com o motivo automatico afirmando
  // uma correcao que nunca houve. O marcador certo e o do proprio ITEM: `entrada_estoque_em` e
  // escrito pelo claim de `darEntradaEstoque` nos DOIS caminhos, e e por item, nao por documento.
  // O status continua na conta como cinto de seguranca (documento processado cujo item, por
  // qualquer razao, nao tenha o carimbo).
  const processado = item.entrada_estoque_em != null
    || item.recebimento_status === STATUS_RECEBIMENTO_PROCESSADO;
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

    // ⚠️ RN-05 so vale para documento que o GANCHO abriu — achado 6 da revisao (lente 1),
    // reproduzido: um ALMOXARIFE abre a NC a mao ("o peso na balanca nao fecha com a NF, em
    // apuracao") num item cuja quantidade conferida bate, e a primeira conferencia de rotina
    // APAGAVA o documento humano, com um motivo automatico afirmando uma correcao que nunca
    // houve. O gancho nao pode destruir o que nao foi ele que escreveu; o documento manual e
    // encerrado por uma PESSOA, decidindo.
    if (!aberta.aberto_automaticamente) return { efeito: 'NENHUMA', nc: aberta };

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

  if (!divergente) {
    // ⚠️ A METADE QUE FALTAVA DA RN-10, e ela fecha um CRITICAL (achado 1 da lente 1,
    // reproduzido). Sem esta linha, o item voltava ao normal SEM QUE NADA REGISTRASSE ISSO — e
    // quando ele quebrava de novo no MESMO valor, a guarda abaixo comparava com o documento
    // encerrado, achava "mesmo fato" e NAO abria nada. Resultado medido: falta real e viva, zero
    // NC ABERTA no modulo inteiro, item fora do cartao `DIVERGENCIA_RECEBIMENTO` (o D6 exclui
    // quem tem NC nao-cancelada) e e-mail engolido pelo dedupe. Silencio completo, que e o pior
    // modo de falha possivel desta etapa: o D6 e a RN-10 se cancelando, cada um supondo que o
    // outro cobria o caso.
    //
    // O carimbo diz "o fato deste documento foi SUPERADO": o item passou por um estado sem
    // divergencia depois que o documento encerrou, entao um problema futuro e problema NOVO,
    // ainda que o numero coincida.
    await dbRun(db, `UPDATE nao_conformidades_almoxarifado SET fato_superado_em = CURRENT_TIMESTAMP
      WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ? AND tipo = 'QUANTIDADE'
        AND status = 'DECIDIDA' AND fato_superado_em IS NULL`, [id]);
    return { efeito: 'NENHUMA', nc: null };
  }

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
/**
 * Etapa 44, RN-01..RN-10 — decide, SEM ESCREVER, qual sera o efeito desta decisao no saldo.
 *
 * Funcao pura de proposito: e a parte que da para provar sem banco, e e onde moram as duas regras
 * que a Fase 2 acrescentou (RN-09 e RN-10). A ORDEM DOS TESTES E O CONTRATO — a precedencia esta
 * congelada na secao 3 do design, porque sem ela um caso casa duas regras ao mesmo tempo (uma NC
 * de origem RECEBIMENTO decidida DEVOLVER casa a RN-04 e a RN-05, e as mensagens sao diferentes).
 *
 * Devolve `{ efeito, quantidade, material_id, mensagem }`. `LIBERAVEL` e interno: significa
 * "nada impede, tente o claim" — quem o traduz em `LIBERADA` ou `JA_LIBERADA` e o claim.
 */
function efeitoPrevisto(nc, insp, material, decisao) {
  const nada = (efeito, mensagem) => ({ efeito, quantidade: null, material_id: null, mensagem });

  // (1) RN-04 — as quatro decisoes que so marcam intencao.
  if (!DECISOES_QUE_LIBERAM.includes(decisao)) return nada('NENHUMA', EFEITO_MSG.NENHUMA);

  // (2) RN-05 — falta de quantidade no recebimento nao bloqueia material nenhum, entao nao ha o
  // que liberar. Recusa EXPLICITA com mensagem, nunca silencio que parece sucesso.
  if (nc.origem !== 'INSPECAO' || nc.referencia_tipo !== 'INSPECAO') {
    return nada('SEM_BLOQUEIO', EFEITO_MSG.SEM_BLOQUEIO);
  }

  // (3) RN-09 — SO NC ABERTA AUTOMATICAMENTE LIBERA. ⚠️ Esta e a linha que fecha a porta lateral
  // CRITICAL achada na Fase 2, e ela parece uma restricao arbitraria se lida sem a razao:
  // `abrirNaoConformidadeManual` deixa qualquer um com `registrar_nao_conformidade` abrir uma NC
  // apontando para QUALQUER inspecao da historia (`resolverFato` so exige que ela exista). Sem
  // esta guarda, decidir essa NC como aceitacao desbloquearia a quantidade daquela reprovacao
  // antiga contra o pool do material — que pode estar bloqueado por outra coisa inteiramente.
  // Seria um caminho para mexer em saldo sem `ajustar_estoque` e sem passar pela rota de
  // desbloqueio, que e exatamente o que o desenho desta etapa promete NAO fazer.
  if (!nc.aberto_automaticamente) return nada('SEM_BLOQUEIO', EFEITO_MSG.SEM_BLOQUEIO_MANUAL);

  // (4) RN-06 — nao ha o que liberar.
  const reprovada = Number(insp?.quantidade_reprovada) || 0;
  const materialId = insp?.material_id || null;
  if (!insp || !(reprovada > 0) || !materialId) {
    return nada('SEM_BLOQUEIO', EFEITO_MSG.SEM_BLOQUEIO);
  }

  // (5) RN-10 — material inativo NAO pode trancar o documento. O motor recusaria com "Material
  // inativo nao pode ser movimentado" e, como a liberacao e FATAL (RN-02), a NC nunca fecharia:
  // ficaria presa para sempre cobrando no cartao de NC parada. E o beco "atrasado para sempre"
  // que este modulo ja pagou duas vezes. Entao a decisao e gravada, o saldo nao muda, e a tela
  // diz por que. Descartado: recusar a decisao.
  if (material && !material.ativo) return nada('SEM_BLOQUEIO', EFEITO_MSG.SEM_BLOQUEIO_INATIVO);

  return { efeito: 'LIBERAVEL', quantidade: reprovada, material_id: materialId, mensagem: null };
}

/**
 * RN-06 da Etapa 43 + RN-01..RN-10 da Etapa 44 — decidir, e EXECUTAR a decisao no saldo.
 *
 * ── A ORDEM DAS OPERACOES E O PONTO DE MAIOR RISCO DESTA FEATURE ─────────────────────────────
 * Ela tem de garantir DUAS coisas ao mesmo tempo, e este modulo nao tem transacao envolvendo os
 * tres passos:
 *   (a) duas decisoes nao liberam duas vezes;
 *   (b) decisao gravada  =>  material liberado (RN-02, a liberacao e FATAL).
 *
 *   1. resolver e CALCULAR o efeito, sem escrever nada
 *   2. claim da DECISAO   (WHERE status = 'ABERTA')  -> nao casou = 409, ANTES de qualquer efeito
 *   3. claim da INSPECAO  (WHERE liberacao_nc_em IS NULL) -> nao casou = JA_LIBERADA
 *   4. DESBLOQUEIO pelo motor -> falhou = desfaz os DOIS claims e propaga o erro
 *   5. auditoria
 *
 * ⚠️ O DESIGN DESTA ETAPA COMECOU COM A ORDEM INVERSA — liberar primeiro, gravar depois — e a
 * Fase 2 mediu que ela produzia os dois estados que a RN-02 existe para proibir. Fica escrito
 * aqui para ninguem "simplificar" de volta:
 *   - Gravar a decisao DEPOIS do motor obriga a perdedora de uma corrida a ESTORNAR o desbloqueio.
 *     E o ramo `BLOQUEIO` do motor NAO TEM GUARDA (e um `+ ?` puro, ao contrario do `DESBLOQUEIO`):
 *     se algo consumisse o material no meio, o bloqueio de volta criaria DISPONIVEL NEGATIVO —
 *     retencao sem lastro fisico, que trava todo claim posterior ate um ajuste de inventario.
 *   - E um claim orfao (queda entre o claim da inspecao e o motor) trancava `liberacao_nc_em` para
 *     sempre: a decisao seguinte devolveria 200 dizendo "ja havia sido liberado" com o material
 *     preso. Silencioso e irrecuperavel pelo proprio fluxo.
 * Com o claim da decisao em primeiro lugar, a perdedora morre antes de tocar em saldo, NENHUMA
 * compensacao passa pelo motor, e todo rollback e escrita de coluna em linha que esta requisicao
 * possui com exclusividade (a NC ja esta DECIDIDA, ninguem mais entra; e nenhum outro escritor
 * toca NC DECIDIDA de origem INSPECAO — `sincronizarNaoConformidadeQuantidade` so escreve em
 * RECEBIMENTO_ITEM/QUANTIDADE).
 *
 * O residual que sobra — queda do processo entre os passos 2 e 4 — deixa NC DECIDIDA com material
 * ainda bloqueado. E ruim, e e DESTRAVAVEL por desbloqueio administrativo, ao contrario do
 * residual da ordem antiga.
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

  // ── Passo 1: resolver e calcular o efeito, SEM ESCREVER ────────────────────────────────────
  let insp = null;
  let material = null;
  if (DECISOES_QUE_LIBERAM.includes(dados.decisao)
      && atual.origem === 'INSPECAO' && atual.referencia_tipo === 'INSPECAO'
      && atual.aberto_automaticamente) {
    insp = await getInspecao(db, atual.referencia_id);
    if (insp?.material_id) {
      material = await dbGet(db, 'SELECT id, ativo FROM materiais_almoxarifado WHERE id = ?',
        [insp.material_id]);
    }
  }
  const previsto = efeitoPrevisto(atual, insp, material, dados.decisao);

  // ── Passo 2: o claim da DECISAO. E o serializador, e vem ANTES de qualquer efeito de saldo ──
  // `AND status = 'ABERTA'` no UPDATE, e nao so no SELECT acima: e o claim que faz duas decisoes
  // simultaneas nao se sobrescreverem (mesmo molde do claim de `decidirInspecao`).
  const upd = await dbRun(db, `UPDATE nao_conformidades_almoxarifado SET
    status = 'DECIDIDA', decisao = ?, justificativa = ?, decidido_por_id = ?, decidido_por_nome = ?,
    decidido_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'ABERTA'`,
    [dados.decisao, justificativa, user?.id || null, user?.nome || user?.email || null, id]);
  if (!upd.changes) throw erro('Esta não conformidade já foi encerrada', 409);

  let liberacao = previsto;
  if (previsto.efeito === 'LIBERAVEL') {
    liberacao = await executarLiberacao(db, user, atual, insp, previsto, justificativa, id);
  }

  await registrarAuditoria(db, {
    entidade: ENTIDADE_AUDITORIA,
    entidade_id: id,
    acao: ACAO_DECIDIDA,
    usuario_id: user?.id,
    usuario_nome: user?.nome || user?.email,
    dados_anteriores: { status: 'ABERTA' },
    dados_novos: { status: 'DECIDIDA', decisao: dados.decisao, efeito_saldo: liberacao.efeito },
    justificativa,
  });

  const nc = await obterNaoConformidade(db, id);
  return { ...nc, liberacao };
}

/**
 * Passos 3 e 4 da ordem acima. Separada so para a funcao de cima caber na cabeca — NAO e ponto de
 * entrada e nao valida nada: quem chega aqui ja passou pelo `efeitoPrevisto` e pelo claim da NC.
 *
 * O rollback desfaz os DOIS claims, e nessa ordem: primeiro o da inspecao (senao uma decisao
 * concorrente poderia ver a NC reaberta com a inspecao ainda travada) e depois o da NC.
 */
async function executarLiberacao(db, user, nc, insp, previsto, justificativa, id) {
  // Passo 3 — o claim da INSPECAO (RN-03). E por INSPECAO e nao por NC de proposito: ver o
  // comentario da coluna `liberacao_nc_em` em schema.js.
  const claim = await dbRun(db, `UPDATE inspecoes_recebimento_almoxarifado
    SET liberacao_nc_em = CURRENT_TIMESTAMP
    WHERE id = ? AND liberacao_nc_em IS NULL`, [insp.id]);
  if (!claim.changes) {
    return { efeito: 'JA_LIBERADA', quantidade: null, material_id: null, mensagem: EFEITO_MSG.JA_LIBERADA };
  }

  // Passo 4 — o motor. `require` preguicoso e chamada POR PROPRIEDADE (`stockService.registrar…`):
  // a primeira evita qualquer ciclo futuro, a segunda e o que permite ao teste do rollback trocar
  // a funcao por uma que estoura, que e o unico jeito de exercitar este caminho.
  const stockService = require('./stockService');
  try {
    await stockService.registrarMovimentacao(db, user, {
      material_id: previsto.material_id,
      tipo: 'DESBLOQUEIO',
      quantidade: previsto.quantidade,
      justificativa,
      motivo: MOTIVO_LIBERACAO,
      documento_vinculado: nc.numero,
      recebimento_id: nc.recebimento_id || null,
    });
  } catch (e) {
    // RN-02 — FATAL: a decisao NAO pode ficar gravada se o material nao foi liberado. Documento
    // afirmando "aceito" com o material preso e pior que decisao nao registrada, porque e mudo.
    await dbRun(db, `UPDATE inspecoes_recebimento_almoxarifado SET liberacao_nc_em = NULL
      WHERE id = ? AND liberacao_nc_em IS NOT NULL`, [insp.id]);
    await dbRun(db, `UPDATE nao_conformidades_almoxarifado SET
      status = 'ABERTA', decisao = NULL, justificativa = NULL, decidido_por_id = NULL,
      decidido_por_nome = NULL, decidido_em = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'DECIDIDA'`, [id]);
    throw e;
  }

  return {
    efeito: 'LIBERADA',
    quantidade: previsto.quantidade,
    material_id: previsto.material_id,
    mensagem: `${previsto.quantidade} liberado(s) do bloqueio`,
  };
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
  // ABERTAS primeiro — e o que a tela precisa mostrar —, e dentro delas as MAIS NOVAS no topo.
  //
  // ⚠️ Este comentario dizia "mais velhas no topo", o que CONTRADIZIA o proprio `ORDER BY` logo
  // abaixo (`created_at DESC`). Achado da rodada de regressao; parece copia do comentario da irma
  // `alertRegistry.listarNaoConformidadesParadas`, que de fato usa `ASC`. A diferenca entre as
  // duas e intencional e vale escrever: a TELA e uma lista de documentos, e lista de documento
  // abre no mais recente; o ALERTA cobra decisao, e cobrar comeca pelo que esta parado ha mais
  // tempo. Ordem errada aqui nao quebra nada visivel, e e exatamente por isso que o cenario
  // (11b) de `naoConformidadeServico.api.test.js` existe: ele prende os DOIS criterios.
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
  abrirNaoConformidadeManual,
  sincronizarNaoConformidadeQuantidade,
  abrirNaoConformidadeDeInspecao,
  decidirNaoConformidade,
  efeitoPrevisto,
  listarNaoConformidades,
  obterNaoConformidade,
  NC_ORIGENS,
  NC_REFERENCIA_TIPOS,
  NC_TIPOS,
  NC_DECISOES,
  NC_STATUS,
  DECISOES_QUE_LIBERAM,
  EFEITO_MSG,
  MOTIVO_LIBERACAO,
  LIMITE_PADRAO,
  LIMITE_TETO,
  STATUS_RECEBIMENTO_PROCESSADO,
};
