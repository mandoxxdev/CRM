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
 * "Este documento ENCERROU o fato" — em SQL, e em UM lugar so.
 *
 * Etapa 46, fix-round da Fase 5. Dois consumidores dependem desta condicao e TEM de andar juntos
 * (`getUltimaEncerrada` e `carimbarFatoSuperado`); um terceiro, a exclusao do cartao D6, repete a
 * mesma regra em `alertRegistry.js` com os prefixos `nc.` — e o cenario (0) de
 * `ncCancelamento.api.test.js` guarda a copia contra deriva.
 *
 * Se uma das pontas considerar encerrado o que a outra nao considera, volta o "silencio completo":
 * documento tido por encerrado que nunca recebe o carimbo de fato superado, e que por isso bloqueia
 * a abertura do documento novo PARA SEMPRE.
 *
 * `decidido_em IS NOT NULL` junto de `cancelado_por_id` NAO e redundancia: hoje
 * `cancelarNaoConformidade` so aceita `DECIDIDA`, entao todo cancelamento humano tem decisao — mas
 * a regra que importa e "uma PESSOA encerrou um documento DECIDIDO", e escrever as duas metades
 * deixa a invariante explicita em vez de dependente de outra funcao. Se algum dia o cancelamento
 * voltar a alcancar `ABERTA`, esta linha e o que impede o silencio de voltar com ele.
 */
const SQL_ENCERRADA = "(status = 'DECIDIDA' OR (cancelado_por_id IS NOT NULL AND decidido_em IS NOT NULL))";

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
  SEM_BLOQUEIO_DRENADO: 'O material já havia sido desbloqueado fora do documento — a decisão foi registrada sem liberar saldo',
  // Etapa 69 (RN-07): a retencao desta inspecao ja saiu pela DEVOLUCAO (45) ou pelo SUCATEAMENTO
  // (69). Sem esta literal, a aceitacao liberaria do pool AGREGADO a retencao de outra origem.
  SEM_BLOQUEIO_JA_SAIU: 'O material desta inspeção já saiu do estoque — a decisão foi registrada sem liberar saldo',
  NENHUMA: 'Esta decisão não altera o saldo',
};

/** O motivo da movimentacao de liberacao. DISTINTO de "Desbloqueio avulso" de proposito: e o que
 * torna a liberacao legivel no livro sem cruzar tabela nenhuma. */
const MOTIVO_LIBERACAO = 'Liberação por não conformidade';

/**
 * ── Etapa 45 (RN-01) — O ESTADO DE EXECUCAO DA DECISAO ──────────────────────────────────────
 *
 * As QUATRO decisoes que exigem ato externo. Derivada por complemento de `DECISOES_QUE_LIBERAM`,
 * e nao escrita a mao, porque uma decisao nova em `NC_DECISOES` tem de cair num dos dois lados
 * OBRIGATORIAMENTE — uma lista literal aqui a deixaria fora dos dois em silencio, e ela nasceria
 * sem estado de execucao nenhum (invisivel na fila, sem botao na tela).
 */
const DECISOES_COM_EXECUCAO = NC_DECISOES.filter((d) => !DECISOES_QUE_LIBERAM.includes(d));

/** A UNICA decisao cuja execucao move saldo (RN-03). As outras tres marcam data e autor (RN-04). */
const DECISAO_QUE_DEVOLVE = 'DEVOLVER';

const EXECUCAO_PENDENTE = 'PENDENTE';
const EXECUCAO_EXECUTADA = 'EXECUTADA';
const EXECUCAO_NAO_SE_APLICA = 'NAO_SE_APLICA';

/** Mensagens LITERAIS de cada efeito da execucao (secao 5 do design). Congeladas: o manual as cita. */
const EFEITO_EXEC_MSG = {
  JA_DEVOLVIDA: 'O material desta inspeção já havia sido devolvido',
  SEM_SALDO_BLOQUEIO: 'O material já havia saído do bloqueio — a execução foi registrada sem mover saldo',
  SEM_SALDO_FISICO: 'Não há saldo físico deste material — a execução foi registrada sem mover saldo',
  SEM_SALDO_INATIVO: 'Material inativo — a execução foi registrada sem mover saldo',
  // ⚠️ ACRESCENTADA NA T2, e nao estava na tabela do design. O estado existe: a NC automatica
  // nasce so com reprovada > 0, mas a INSPECAO pode ter sido corrigida depois (a decisao da
  // inspecao e reescrevivel), e `getInspecao` pode nao achar nada se a linha sumir. Sem literal
  // propria isso cairia no `NENHUMA` generico — "esta execucao nao altera o saldo" — que e
  // verdade e nao diz NADA sobre o porque, no unico caso em que o usuario esperava a baixa.
  SEM_SALDO_SEM_REPROVADA: 'Esta não conformidade não tem material reprovado para devolver',
  // Fix-round da Fase 5: a retenção desta inspeção já foi solta por uma decisão de ACEITAÇÃO em
  // outra NC da mesma inspeção (B175/C63 da Etapa 44). Sem esta literal, o pool AGREGADO deixava
  // a devolução baixar 3 kg contra a retenção de outra inspeção, com mensagem de sucesso.
  SEM_SALDO_JA_LIBERADA: 'O material desta inspeção já havia sido liberado por outra não conformidade — a execução foi registrada sem mover saldo',
  NENHUMA: 'Esta execução não altera o saldo',
  NENHUMA_MANUAL: 'Só a não conformidade aberta pela reprovação da inspeção devolve material',
  // Etapa 69 (RN-07): a terceira porta. A retencao desta inspecao ja foi para a cacamba pela
  // segunda assinatura de um sucateamento ligado a OUTRA NC da mesma inspecao.
  SEM_SALDO_JA_SUCATEADA: 'O material desta inspeção já havia sido sucateado — a execução foi registrada sem mover saldo',
  // Etapa 69 (RN-08): as literais do `/executar` de SUCATEAR quando o sucateamento NAO e viavel e
  // a execucao registra sem mover. As de saldo (bloqueio, fisico, inativo, liberada) sao as de hoje;
  // estas duas existem porque as de hoje dizem "devolver"/"devolvido" sem dizer o efeito.
  SEM_SALDO_SEM_REPROVADA_SUCATEAR: 'Esta não conformidade não tem material reprovado para sucatear — a execução foi registrada sem mover saldo',
  SEM_SALDO_JA_DEVOLVIDA: 'O material desta inspeção já havia sido devolvido ao fornecedor — a execução foi registrada sem mover saldo',
  // Etapa 69 (Fase 2): o lote fora de ATIVO recusa o `/executar` de SUCATEAR; com `motivo_sem_baixa`
  // explicito no body a execucao e registrada SEM baixa — o `/executar` nao fecha calado.
  SEM_BAIXA: 'A execução foi registrada sem baixa, pelo motivo informado — o material continua bloqueado',
};

/** As recusas da execucao, com o codigo HTTP de cada uma (secao 5 do design). */
const EXEC_RECUSA = {
  SEM_EXECUCAO: { status: 400, mensagem: 'Esta decisão não tem execução a registrar' },
  NAO_DECIDIDA: { status: 400, mensagem: 'Só é possível registrar a execução de uma não conformidade decidida' },
  JA_REGISTRADA: { status: 409, mensagem: 'A execução desta não conformidade já foi registrada' },
  SERIE: { status: 400, mensagem: 'Material com controle de série não pode ser devolvido por aqui — dê baixa pela tela de Movimentações' },
  SEM_LOTE: { status: 400, mensagem: 'Não foi possível identificar o lote do material devolvido' },
  // Etapa 46 — o documento pode ser CANCELADO entre a leitura e o claim, ou antes dele. Sem esta
  // literal o caso caia em JA_REGISTRADA, que afirma uma execucao que nao houve.
  CANCELADA: { status: 400, mensagem: 'Esta não conformidade foi cancelada — não há execução a registrar' },
  // Etapa 69 (RN-08, mapeamento da Fase 2) — o `/executar` de SUCATEAR VIAVEL recusa e ENSINA o
  // caminho. Antes ele registrava "sem mover" e a NC saia da fila com o condenado no bloqueado
  // (Surpresa 2 da Fase 0). Reabre a RN-04 da 45 SO para `SUCATEAR`.
  PEDE_SUCATEAMENTO: {
    status: 409,
    mensagem: 'Esta não conformidade pede sucateamento: o almoxarifado registra em "Solicitar sucateamento" (duas aprovações) — a execução fica registrada na segunda aprovação.',
  },
};

/** Etapa 69 (Fase 2) — as duas recusas do `/executar` de SUCATEAR que carregam dado na literal. */
const execRecusaSucateamentoAberto = (sucId) => ({
  status: 409,
  mensagem: `Já existe o sucateamento SUC-${sucId} desta não conformidade aguardando aprovação no almoxarifado.`,
});
const execRecusaLoteForaDeAtivo = (lote) => ({
  status: 409,
  mensagem: `O lote ${lote.codigo} está ${String(lote.status || '').toLowerCase()} (${lote.status_motivo || 'sem motivo registrado'}): libere o lote para sucatear o reprovado, ou registre a execução sem baixa informando o motivo.`,
});
// Etapa 69 (fix-round da Fase 5, achado 2): material de CLIENTE reprovado. O `/executar` mandava
// "Solicitar sucateamento", mas a tela nao tem OS/projeto e a solicitacao recusava pela guarda do
// dono (a SUCATA de material de cliente exige OS/projeto DESSE cliente): o operador ficava sem
// caminho. Recusa ensinando os dois caminhos; `motivo_sem_baixa` registra sem baixa.
const EXEC_RECUSA_CLIENTE_SEM_OS = {
  status: 409,
  mensagem: 'Material de cliente: o sucateamento precisa da OS ou do projeto do cliente — solicite pela API informando os_origem_id/projeto_origem_id, ou registre a execução sem baixa informando o motivo',
};

/** Etapa 69 (fix-round da Fase 5, achado 1) — o lote do reprovado ja nao cobre a reprovada. */
const msgLoteSemSaldo = (lote, un, reprovada) => `O lote ${lote.codigo} tem ${Math.round((Number(lote.saldo_em_estoque) || 0) * 1e6) / 1e6} ${un} em estoque, menos que o reprovado (${reprovada}) — o reprovado já saiu do lote; registre a execução sem baixa informando o motivo`;

/**
 * Etapa 69 (RN-03/RN-04) — as recusas da SOLICITACAO do sucateamento do reprovado, NA ORDEM do
 * contrato (a ordem e contrato: `sucateamentoDoReprovadoPrevisto` as testa nesta sequencia). O
 * `codigo` e o que o `/executar` de SUCATEAR usa para mapear cada nivel no seu proprio efeito —
 * casar por mensagem faria uma correcao de texto mudar comportamento.
 */
const SUC_RECUSA = {
  NAO_ENCONTRADA: { codigo: 'NAO_ENCONTRADA', status: 404, mensagem: 'Não conformidade não encontrada' },
  CANCELADA: { codigo: 'CANCELADA', status: 400, mensagem: 'Esta não conformidade foi cancelada — não há sucateamento a solicitar' },
  NAO_DECIDIDA: { codigo: 'NAO_DECIDIDA', status: 400, mensagem: 'Só é possível sucatear o material de uma não conformidade decidida' },
  DECISAO: { codigo: 'DECISAO', status: 400, mensagem: 'A decisão desta não conformidade não é Sucatear — o material reprovado só vai para o sucateamento por essa decisão' },
  JA_SAIU_NC: { codigo: 'JA_SAIU_NC', status: 409, mensagem: 'O material desta não conformidade já saiu do estoque' },
  MANUAL: { codigo: 'MANUAL', status: 400, mensagem: 'Só a não conformidade aberta pela reprovação da inspeção sucateia material reprovado' },
  SEM_REPROVADA: { codigo: 'SEM_REPROVADA', status: 400, mensagem: 'Esta não conformidade não tem material reprovado para sucatear' },
  JA_SUCATEADA: { codigo: 'JA_SUCATEADA', status: 409, mensagem: 'O material desta inspeção já foi sucateado' },
  JA_DEVOLVIDA: { codigo: 'JA_DEVOLVIDA', status: 400, mensagem: 'O material desta inspeção já havia sido devolvido ao fornecedor' },
  JA_LIBERADA: { codigo: 'JA_LIBERADA', status: 400, mensagem: 'O material desta inspeção já havia sido liberado por outra não conformidade' },
  SERIE: { codigo: 'SERIE', status: 400, mensagem: 'Material com controle de série não pode ser sucateado por aqui — dê baixa pela tela de Movimentações' },
  SEM_LOTE: { codigo: 'SEM_LOTE', status: 400, mensagem: 'Não foi possível identificar o lote do material reprovado' },
};

/** O motivo da movimentacao da devolucao — o que a torna legivel no livro sem cruzar tabela. */
const MOTIVO_DEVOLUCAO_FORNECEDOR = 'Devolução ao fornecedor';

/** Entidade da trilha, e os TRES verbos distintos da RN-09 (rotulos sao da T2). */
const ENTIDADE_AUDITORIA = 'nao_conformidade';
const ACAO_ABERTA = 'NC_ABERTA';
const ACAO_DECIDIDA = 'NC_DECIDIDA';
const ACAO_CANCELADA = 'NC_CANCELADA';
/** Etapa 45 — verbo PROPRIO, e nao um `NC_DECIDIDA` com dados diferentes: a execucao tem outro
 * autor, outro dia e outro gate (`executar_encaminhamento`). Sem rotulo em `auditLabels.js` a
 * suite inteira cai, de proposito — ver o cabecalho de `auditLabels.api.test.js`. */
const ACAO_EXECUTADA = 'NC_EXECUTADA';

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

/**
 * "`a` e MENOR que `b` de verdade?" — a mesma regua de `divergencia.js`, aplicada as comparacoes
 * de SALDO das Etapas 44 e 45.
 *
 * Existe por um CRITICAL reproduzido na revisao da Etapa 45: `quantidade_bloqueada` e REAL e
 * nasce de somas sucessivas, entao duas reprovacoes de 2.3 e 3.4 deixam 5.699999999999999 no
 * pool. Depois de devolver 2.3 sobram 3.3999999999999995, e `3.3999999999999995 < 3.4` e
 * VERDADE — a devolucao legitima da segunda vira "o material ja havia saido do bloqueio". Ver o
 * comentario longo em `efeitoExecucaoPrevisto`, que conta o estado absorvente que isso produz.
 *
 * Mesma classe do `!= 0` que `divergencia.js` existe para proibir, e mesma regua: ruido de
 * IEEE-754 abaixo do epsilon NAO e diferenca.
 */
const menosQue = (a, b) => (Number(a) || 0) < Number(b) - EPSILON_DIVERGENCIA;

const CAMPOS_LISTA = `nc.id, nc.numero, nc.origem, nc.referencia_tipo, nc.referencia_id, nc.tipo,
  nc.status, nc.material_id, m.codigo AS material_codigo, m.nome AS material_nome,
  m.unidade AS material_unidade, nc.recebimento_id, r.numero AS recebimento_numero, r.nota_fiscal,
  nc.quantidade_esperada, nc.quantidade_recebida, nc.divergencia, nc.descricao, nc.decisao,
  nc.justificativa, nc.aberto_por_id, nc.aberto_por_nome, nc.aberto_automaticamente,
  nc.decidido_por_id, nc.decidido_por_nome, nc.decidido_em, nc.motivo_cancelamento,
  nc.cancelado_em, nc.cancelado_por_id, nc.cancelado_por_nome, nc.created_at, nc.updated_at,
  nc.execucao_estado, nc.execucao_em, nc.execucao_por_id, nc.execucao_por_nome,
  nc.execucao_observacoes, nc.execucao_movimentacao_id`;

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

/**
 * ⚠️ `ri.lote_id` e `ri.lote` entraram na Etapa 45 (RN-12) e NAO sao enfeite: a execucao da
 * devolucao precisa dizer ao motor DE QUAL LOTE o material saiu. Sem eles o debito cai na linha
 * de saldo de lote `NULL` — que fica NEGATIVA — enquanto a linha do lote devolvido continua
 * mostrando saldo, e as duas pontas passam a discordar em silencio.
 */
function getInspecao(db, inspecaoId) {
  return dbGet(db, `SELECT i.*, ri.recebimento_id, ri.material_id, ri.quantidade_esperada,
      ri.quantidade_recebida, ri.lote_id, ri.lote
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
 *
 * ── ⚠️ ETAPA 46: A PRIMEIRA EXCLUSAO PASSOU A VALER SO PARA METADE DO `CANCELADA` ───────────
 * A frase acima continua CERTA para o cancelamento AUTOMATICO — aquele que
 * `sincronizarNaoConformidadeQuantidade` dispara quando a divergencia DESAPARECE. Ali o documento
 * morre porque o operador corrigiu, e se o problema voltar e problema novo.
 *
 * A Etapa 46 criou um SEGUNDO cancelamento: o HUMANO, por
 * `cancelarNaoConformidade`, em que o problema NAO desapareceu — ele continua de pe, e uma pessoa
 * decidiu encerrar o documento (tipicamente porque a execucao era impossivel: material com serie,
 * lote nao identificavel). Para esse, tratar como "ja documentado" e o CERTO: reabrir sozinho
 * significaria o gancho desfazer o julgamento de uma pessoa a cada salvamento de NF.
 *
 * O discriminador e `cancelado_por_id`, e ele e estrutural, nao adorno de auditoria. E `decidido_em`
 * NAO serve — foi a primeira tentativa do desenho da 46 e a revisao da Fase 2 a derrubou: uma NC
 * ABERTA cancelada por pessoa tem `decidido_em IS NULL`, a MESMA assinatura do automatico.
 *
 * ⚠️ E SAO TRES CONSUMIDORES, nao um. Mexer aqui sem mexer nos outros dois reabre furo:
 *   · o carimbo de `fato_superado_em` (algumas linhas abaixo) — sem a mesma condicao, a linha
 *     cancelada por pessoa nunca recebe o carimbo, e o item corrigido e quebrado DE NOVO no mesmo
 *     valor fica sem NC E sem cartao: o "silencio completo" que o item 1 acima existe para matar;
 *   · a exclusao do D6 em `listarDivergenciasRecebimento` (`alertRegistry.js`) — sem ela, o item
 *     volta ao cartao como divergencia NAO DOCUMENTADA, e nao existe porta para documenta-la (nao
 *     ha tela de abertura manual). Seriam as duas metades aplicando reguas OPOSTAS ao mesmo
 *     estado, que e literalmente o defeito que este docblock foi escrito para nao repetir.
 */
function getUltimaEncerrada(db, referenciaTipo, referenciaId, tipo) {
  return dbGet(db, `SELECT * FROM nao_conformidades_almoxarifado
    WHERE referencia_tipo = ? AND referencia_id = ? AND tipo = ?
      AND ${SQL_ENCERRADA} AND fato_superado_em IS NULL
    ORDER BY id DESC LIMIT 1`, [referenciaTipo, referenciaId, tipo]);
}

/**
 * Carimba "o fato foi SUPERADO" nos documentos JA ENCERRADOS deste item.
 *
 * Extraida no fix-round da Fase 5 da Etapa 46 porque o `UPDATE` vivia DENTRO de um ramo que so
 * era alcancado quando nao havia NC `ABERTA` — ver o comentario do CRITICAL em
 * `sincronizarNaoConformidadeQuantidade`. Idempotente por `AND fato_superado_em IS NULL`.
 *
 * A condicao de "encerrado" e a MESMA de `getUltimaEncerrada`, e as duas tem de andar juntas: se
 * uma considera um estado encerrado e a outra nao, volta o "silencio completo" (documento tido por
 * encerrado que nunca recebe o carimbo, e portanto bloqueia a abertura do documento novo para
 * sempre).
 */
function carimbarFatoSuperado(db, itemId) {
  return dbRun(db, `UPDATE nao_conformidades_almoxarifado SET fato_superado_em = CURRENT_TIMESTAMP
    WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ? AND tipo = 'QUANTIDADE'
      AND ${SQL_ENCERRADA} AND fato_superado_em IS NULL`, [itemId]);
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

  // ⚠️ ETAPA 46, FIX-ROUND DA FASE 5 (CRITICAL da lente 1, reproduzido por sonda). Este carimbo
  // ESTAVA dentro do ramo `!divergente` mais abaixo — que so e alcancado quando NAO existe NC
  // `ABERTA`, porque TODOS os ramos de `if (aberta)` retornam. Consequencia medida: com qualquer
  // NC aberta no instante em que o operador corrige a quantidade, o documento ENCERRADO do mesmo
  // fato nunca era carimbado; quando o fato voltava igual, `getUltimaEncerrada` o achava,
  // `mesmoFato` batia e NADA nascia. Falta real e viva, ZERO NC no modulo e ZERO cartao — o
  // "silencio completo" que o comentario do ramo de baixo existe para matar, por um ramo que a
  // suite nao cobria. O furo e ANTERIOR a esta etapa (reproduzido tambem com a NC encerrada por
  // DECISAO, sem cancelamento nenhum); o que a 46 fez foi declarar fechada uma classe que fechava
  // pela metade.
  //
  // Rodar aqui e seguro: o carimbo e idempotente (`AND fato_superado_em IS NULL`) e so alcanca
  // documentos JA ENCERRADOS do mesmo fato — nunca a `aberta` que o ramo abaixo vai tratar.
  if (!divergente) await carimbarFatoSuperado(db, id);

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
      // `automatico: true` e o par do `false` do cancelamento humano — os dois atos usam o MESMO
      // verbo `NC_CANCELADA`, e sem esta marca a trilha credita a anulacao a quem apenas reconferiu
      // a quantidade (medido na Fase 5: o COMPRAS, que toma 403 em `/cancelar`, aparecia como
      // autor). `cancelado_por_id` fica NULL aqui de proposito: e o discriminador da etapa.
      dados_novos: { status: 'CANCELADA', cancelado_por_id: null, automatico: true },
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
    // ⚠️ O `UPDATE` que estava AQUI subiu para antes do `if (aberta)` — ver o comentario do
    // CRITICAL no topo desta funcao. Ele so era alcancado quando nao havia NC aberta, e era isso
    // que reabria o "silencio completo" descrito acima. A chamada agora e `carimbarFatoSuperado`,
    // e ela ja rodou quando a execucao chega aqui.
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

  // (5b) Etapa 69 (RN-07, Surpresa 4) — A RETENCAO DESTA INSPECAO JA SAIU por uma das outras duas
  // portas (devolucao — 45, sucateamento — 69). Antes desta linha a liberacao NAO olhava a
  // devolucao (a 45 olhava a liberacao, a 44 nao olhava a 45): com bloqueio de outra origem no
  // pool agregado, aceitar depois de devolver soltava a retencao alheia, com mensagem de sucesso.
  // `liberacao_nc_em` fica de fora daqui de proposito: quem a nomeia e o claim (`JA_LIBERADA`).
  const saiu = retencaoDaInspecaoJaSaiu(insp);
  if (saiu === 'DEVOLVIDA' || saiu === 'SUCATEADA') return nada('SEM_BLOQUEIO', EFEITO_MSG.SEM_BLOQUEIO_JA_SAIU);

  // (6) RN-11 — O POOL JÁ FOI DRENADO POR FORA. Achado da revisão adversarial, e é o caso mais
  // provável de todos: o workaround que existia ANTES desta etapa era justamente alguém da gestão
  // desbloquear na mão pela tela de Movimentações. Depois dela, esse mesmo gesto INUTILIZAVA o
  // documento — o motor recusava com "Quantidade bloqueada insuficiente: N", e como a liberação é
  // fatal (RN-02) a decisão nunca era gravada. A NC ficava ABERTA **para sempre**, cobrando todo
  // dia no cartao de NC parada, e a única saída era registrar uma decisão FALSA (`DEVOLVER`) só
  // para o documento fechar.
  //
  // É o mesmo beco que a RN-10 existe para evitar, e o raciocínio dela se aplica palavra por
  // palavra. Então: a decisão é gravada, o saldo não muda, e a tela diz **por quê** — o material
  // já não estava mais lá para ser liberado.
  //
  // ⚠️ Isto NÃO enfraquece a RN-02, e a diferença importa: a fatalidade continua valendo para
  // falha INESPERADA do motor (aí a decisão é desfeita). Aqui não há falha nenhuma — há um estado
  // conhecido, medido antes de escrever qualquer coisa, e dito em voz alta.
  // ⚠️ `menosQue`, e nao `<` cru — MESMA correcao do CRITICAL da Etapa 45, e este e o ponto de
  // ORIGEM da forma: a 45 copiou daqui. Com `<` cru, liberar 3.4 de um pool que a aritmetica de
  // ponto flutuante deixou em 3.3999999999999995 responde "o material ja havia sido desbloqueado
  // fora do documento" e FECHA a NC sem liberar nada — a QUALIDADE aceita sob desvio, o
  // documento diz aceito, e o material segue preso. E exatamente o furo C57 renascendo por
  // arredondamento, na etapa escrita para fecha-lo.
  if (menosQue(material?.quantidade_bloqueada, reprovada)) {
    return nada('SEM_BLOQUEIO', EFEITO_MSG.SEM_BLOQUEIO_DRENADO);
  }

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
      material = await dbGet(db, 'SELECT id, ativo, quantidade_bloqueada FROM materiais_almoxarifado WHERE id = ?',
        [insp.material_id]);
    }
  }
  const previsto = efeitoPrevisto(atual, insp, material, dados.decisao);

  // ── Passo 2: o claim da DECISAO. E o serializador, e vem ANTES de qualquer efeito de saldo ──
  // `AND status = 'ABERTA'` no UPDATE, e nao so no SELECT acima: e o claim que faz duas decisoes
  // simultaneas nao se sobrescreverem (mesmo molde do claim de `decidirInspecao`).
  // Etapa 45 (RN-01): o estado de execucao nasce JUNTO com a decisao, no MESMO claim. Fazer disso
  // um `UPDATE` separado abriria uma janela em que a NC esta DECIDIDA e `execucao_estado` e NULL —
  // e NULL some do filtro `?execucao=PENDENTE`, que e a fila do que falta executar. Documento
  // decidido invisivel na fila e exatamente o que esta etapa veio consertar.
  const execucaoEstado = DECISOES_QUE_LIBERAM.includes(dados.decisao)
    ? EXECUCAO_NAO_SE_APLICA : EXECUCAO_PENDENTE;
  const upd = await dbRun(db, `UPDATE nao_conformidades_almoxarifado SET
    status = 'DECIDIDA', decisao = ?, justificativa = ?, decidido_por_id = ?, decidido_por_nome = ?,
    decidido_em = CURRENT_TIMESTAMP, execucao_estado = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'ABERTA'`,
    [dados.decisao, justificativa, user?.id || null, user?.nome || user?.email || null,
      execucaoEstado, id]);
  if (!upd.changes) throw erro('Esta não conformidade já foi encerrada', 409);

  let liberacao = previsto;
  if (previsto.efeito === 'LIBERAVEL') {
    liberacao = await executarLiberacao(db, user, atual, insp, previsto, justificativa, id);
  }

  // ⚠️ NAO FATAL, e a inversao em relacao ao resto desta funcao e deliberada (achado da revisao
  // adversarial). Aqui ja aconteceu TUDO: a decisao esta gravada e o material esta liberado. Se a
  // trilha falhar e o erro subir, o chamador ve um 500 depois de uma operacao que VALEU, tenta de
  // novo e leva 409 "ja foi encerrada" — ou seja, acredita que nao valeu, quando valeu. Perder a
  // linha de trilha e ruim; fazer a QUALIDADE acreditar que o material continua bloqueado quando
  // ele nao esta e pior, porque ela age sobre essa crenca.
  // O rastro do SALDO nao se perde de qualquer forma: a linha do livro carrega
  // `documento_vinculado = NC-…`. Mesmo desenho dos ganchos da Etapa 43 e do e-mail da inspecao.
  try {
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
  } catch (e) {
    console.warn(`[NC] decisão ${id} gravada, mas a trilha falhou: ${e.message}`);
  }

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
  // Etapa 69 (RN-07): o claim olha os TRES carimbos — a precedencia leu a inspecao antes, e entre a
  // leitura e este UPDATE a devolucao ou o sucateamento podem ter levado a retencao. A perda do
  // claim RELE os carimbos para nomear a causa certa ("ja liberado" mentiria sobre um devolvido).
  const claim = await dbRun(db, `UPDATE inspecoes_recebimento_almoxarifado
    SET liberacao_nc_em = CURRENT_TIMESTAMP
    WHERE id = ? AND liberacao_nc_em IS NULL AND devolucao_fornecedor_em IS NULL
      AND sucateamento_em IS NULL`, [insp.id]);
  if (!claim.changes) {
    const agora = await dbGet(db, `SELECT liberacao_nc_em, devolucao_fornecedor_em, sucateamento_em
      FROM inspecoes_recebimento_almoxarifado WHERE id = ?`, [insp.id]);
    if (agora && !agora.liberacao_nc_em && (agora.devolucao_fornecedor_em || agora.sucateamento_em)) {
      return { efeito: 'SEM_BLOQUEIO', quantidade: null, material_id: null, mensagem: EFEITO_MSG.SEM_BLOQUEIO_JA_SAIU };
    }
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
    // `execucao_estado = NULL` entra no rollback da Etapa 45: a NC volta a ABERTA e um estado de
    // execucao sobrevivente a deixaria na fila de "pendente de execucao" sem decisao nenhuma.
    await dbRun(db, `UPDATE nao_conformidades_almoxarifado SET
      status = 'ABERTA', decisao = NULL, justificativa = NULL, decidido_por_id = NULL,
      decidido_por_nome = NULL, decidido_em = NULL, execucao_estado = NULL,
      updated_at = CURRENT_TIMESTAMP
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
 * Etapa 45 (RN-12) — DE QUAL LOTE o material devolvido sai.
 *
 * O lote vive no ITEM DO RECEBIMENTO (`lote_id` numerico desde a Etapa 6; `lote` e o codigo
 * digitado na conferencia, que pode existir sem o id em recebimento antigo). Resolver aqui, e nao
 * deixar o motor adivinhar, e o que impede o debito de cair na linha de saldo de lote `NULL` —
 * ver o comentario de `getInspecao`.
 *
 * `null` quando nao ha lote resolvivel; quem decide se isso e recusa ou seguir em frente e a
 * precedencia (nivel 7), porque material SEM `controle_lote` devolve normalmente sem lote nenhum.
 */
async function resolverLoteDaInspecao(db, insp, materialId) {
  if (!insp || !materialId) return null;
  const lotService = require('./lotService');
  if (insp.lote_id) {
    const porId = await lotService.getLote(db, insp.lote_id);
    // O `material_id` e conferido de proposito: o item aponta para um lote, e lote de OUTRO
    // material aqui seria dado sujo que o motor recusaria la na frente com mensagem de motor.
    if (porId && Number(porId.material_id) === Number(materialId)) return porId;
  }
  if (insp.lote && String(insp.lote).trim()) {
    const porCodigo = await lotService.getLotePorCodigo(db, materialId, String(insp.lote).trim());
    if (porCodigo) return porCodigo;
  }
  return null;
}

/**
 * Etapa 69 (fix-round da Fase 5, achado 1) — o lote do reprovado COM o saldo que o motor vai conferir
 * na segunda assinatura: a soma das linhas > 0 do lote (`claimSaldoDoLote`). `saldo_em_estoque = null`
 * quando o motor nao confere (material ou config global com saldo negativo permitido). Consumido pelas
 * DUAS portas (solicitacao e `/executar` de SUCATEAR), para nao divergirem.
 */
async function carregarLoteDoReprovado(db, insp, material) {
  if (!insp || !material) return null;
  const lote = await resolverLoteDaInspecao(db, insp, material.id);
  if (!lote) return null;
  const stockService = require('./stockService');
  const negativo = material.permite_saldo_negativo
    || (await stockService.getConfig(db, 'permite_saldo_negativo_global')) === '1';
  if (negativo) return { ...lote, saldo_em_estoque: null };
  const r = await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) AS q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND lote_id = ? AND quantidade > 0`, [material.id, lote.id]);
  return { ...lote, saldo_em_estoque: Number(r.q) || 0 };
}

/** Etapa 69 — o sucateamento `SOLICITADO` aberto desta NC (o UNIQUE parcial garante no maximo um). */
function sucateamentoAbertoDaNc(db, ncId) {
  return dbGet(db, `SELECT id FROM sucateamentos_almoxarifado
    WHERE nao_conformidade_id = ? AND status = 'SOLICITADO' ORDER BY id LIMIT 1`, [ncId]).then((r) => r || null);
}

/**
 * Etapa 69 (RN-07) — "a retencao DESTA inspecao ja saiu do bloqueado? por qual porta?".
 *
 * Tres portas tiram a mesma retencao de um pool AGREGADO por material: a liberacao (44,
 * `liberacao_nc_em`), a devolucao ao fornecedor (45, `devolucao_fornecedor_em`) e o sucateamento
 * do reprovado (69, `sucateamento_em`). Cada porta tem de olhar as OUTRAS duas — o motor nao salva,
 * porque com bloqueio de outra origem no pool a segunda baixa passa em silencio. Esta funcao e a
 * regua unica da leitura; os claims repetem os tres carimbos no WHERE (a leitura da a mensagem, o
 * WHERE da a garantia — o padrao do modulo).
 *
 * A ordem do retorno (sucateada, devolvida, liberada) e a da precedencia da solicitacao (niveis
 * 8-10 do contrato). Pura: so le a linha.
 */
function retencaoDaInspecaoJaSaiu(insp) {
  if (!insp) return null;
  if (insp.sucateamento_em) return 'SUCATEADA';
  if (insp.devolucao_fornecedor_em) return 'DEVOLVIDA';
  if (insp.liberacao_nc_em) return 'LIBERADA';
  return null;
}

/**
 * Etapa 69 (RN-03) — o sucateamento do material REPROVADO desta NC e viavel? Decide SEM ESCREVER.
 *
 * Uma funcao so, consumida pelas DUAS rotas (a solicitacao, `scrapDisposalService.solicitarDoReprovado`,
 * e o `/executar` de SUCATEAR) — e o que impede as duas de divergirem sobre "da para sucatear?".
 * A ORDEM DOS TESTES E O CONTRATO (19 niveis no plano; os dois ultimos — dono do material e
 * justificativa — sao do servico, que tem banco e payload).
 *
 * Devolve `{ efeito: 'SUCATEAVEL', quantidade, material_id, lote_id }` ou
 * `{ efeito: 'RECUSA', codigo, status, mensagem }`.
 *
 * `quantidade` e a reprovada INTEIRA (D4): a idempotencia e por inspecao, e uma inspecao "meio
 * sucateada" nao tem coluna para o resto.
 */
function sucateamentoDoReprovadoPrevisto(nc, insp, material, lote, solicitadoAberto) {
  const recusa = (r) => ({ efeito: 'RECUSA', codigo: r.codigo, status: r.status, mensagem: r.mensagem });

  if (!nc) return recusa(SUC_RECUSA.NAO_ENCONTRADA); // (1)
  if (nc.status === 'CANCELADA') return recusa(SUC_RECUSA.CANCELADA); // (2) D8
  if (nc.status !== 'DECIDIDA') return recusa(SUC_RECUSA.NAO_DECIDIDA); // (3)
  if (nc.decisao !== 'SUCATEAR') return recusa(SUC_RECUSA.DECISAO); // (4)
  // (5) D7 — o criterio e a MOVIMENTACAO, nao `execucao_em`: a NC legada `EXECUTADA` sem baixa (o
  // `/executar` de antes registrava SUCATEAR sem mover) continua aceita.
  if (nc.execucao_movimentacao_id != null) return recusa(SUC_RECUSA.JA_SAIU_NC);
  // (6) a mesma porta lateral da RN-06 da 45 / RN-09 da 44: NC aberta a mao aponta para QUALQUER
  // inspecao da historia, e o pool e agregado.
  if (!nc.aberto_automaticamente || nc.origem !== 'INSPECAO' || nc.referencia_tipo !== 'INSPECAO') {
    return recusa(SUC_RECUSA.MANUAL);
  }
  const reprovada = Number(insp?.quantidade_reprovada) || 0;
  if (!insp || !(reprovada > 0) || !insp.material_id || !material) return recusa(SUC_RECUSA.SEM_REPROVADA); // (7)
  const saiu = retencaoDaInspecaoJaSaiu(insp); // (8) (9) (10)
  if (saiu === 'SUCATEADA') return recusa(SUC_RECUSA.JA_SUCATEADA);
  if (saiu === 'DEVOLVIDA') return recusa(SUC_RECUSA.JA_DEVOLVIDA);
  if (saiu === 'LIBERADA') return recusa(SUC_RECUSA.JA_LIBERADA);
  if (!material.ativo) { // (11) a literal de hoje do `solicitar`
    return recusa({
      codigo: 'INATIVO', status: 400,
      mensagem: `O material ${material.codigo} esta inativo e nao pode ser movimentado — reative o cadastro antes de sucatear`,
    });
  }
  if (material.controle_serie) return recusa(SUC_RECUSA.SERIE); // (12)
  if (material.controle_lote && !lote) return recusa(SUC_RECUSA.SEM_LOTE); // (13)
  // (14) D10 — o motor recusa SAIDA de lote fora de ATIVO, inclusive descarte (guarda deliberada da
  // 45). Descobrir isso so na segunda assinatura custaria duas pessoas. O tipico: material critico
  // com `controle_certificado` nasce com o lote BLOQUEADO ("Certificado do fornecedor nao anexado").
  if (lote && lote.status !== 'ATIVO') {
    return recusa({
      codigo: 'LOTE_STATUS', status: 400,
      mensagem: `O lote ${lote.codigo} está ${String(lote.status || '').toLowerCase()} — o estoque não baixa lote fora de ATIVO, nem para sucata. Mude o status do lote antes de sucatear`,
    });
  }
  // (15) (16) `menosQue`, nunca `<` cru — a mesma regua do CRITICAL do epsilon da 45.
  const un = material.unidade || '';
  if (menosQue(material.quantidade_bloqueada, reprovada)) {
    return recusa({
      codigo: 'SEM_BLOQUEIO', status: 400,
      mensagem: `O material já havia saído do bloqueio — há ${Number(material.quantidade_bloqueada) || 0} ${un} bloqueado(s), a reprovação foi de ${reprovada}`,
    });
  }
  if (menosQue(material.quantidade_atual, reprovada)) {
    return recusa({
      codigo: 'SEM_FISICO', status: 400,
      mensagem: `Não há saldo físico deste material para sucatear — físico ${Number(material.quantidade_atual) || 0} ${un}, reprovado ${reprovada}`,
    });
  }
  // (16b) Etapa 69, fix-round da Fase 5 (achado 1): o agregado (15/16) nao ve o LOTE. Com o lote do
  // reprovado ja sem saldo (saiu por SAIDA — o bloqueio e por material, nao por lote), a viabilidade
  // dizia "viavel" para sempre, a solicitacao gastava duas assinaturas e o motor recusava na segunda
  // ("Saldo insuficiente no lote"). `saldo_em_estoque` e carregado por `carregarLoteDoReprovado` com
  // a MESMA regua do claim do motor (linhas > 0 do lote); `null` = o motor nao confere (saldo negativo
  // permitido) ou chamador puro sem a leitura — nao recusa.
  if (lote && lote.saldo_em_estoque != null && menosQue(lote.saldo_em_estoque, reprovada)) {
    return recusa({ codigo: 'SEM_SALDO_LOTE', status: 400, mensagem: msgLoteSemSaldo(lote, un, reprovada) });
  }
  if (solicitadoAberto) { // (17) a pre-checagem; o UNIQUE parcial e a garantia
    return recusa({
      codigo: 'JA_SOLICITADO', status: 409,
      mensagem: `Já existe um sucateamento solicitado para esta não conformidade (SUC-${solicitadoAberto.id}) — aprove ou rejeite esse antes`,
    });
  }
  return { efeito: 'SUCATEAVEL', quantidade: reprovada, material_id: insp.material_id, lote_id: lote ? lote.id : null };
}

/**
 * Etapa 69 (RN-08, mapeamento da Fase 2) — o efeito do `/executar` de uma NC decidida SUCATEAR.
 * Chamado por `efeitoExecucaoPrevisto` DEPOIS dos niveis de documento (1-3). Puro.
 *
 *  - ha sucateamento SOLICITADO aberto  -> RECUSA 409 (a cobranca termina quando o material sai)
 *  - viavel                             -> RECUSA 409 que ensina "Solicitar sucateamento"
 *  - lote fora de ATIVO                 -> RECUSA 409, ou SEM_BAIXA com `motivo_sem_baixa` explicito
 *  - inviavel por estado conhecido      -> registra sem mover (a licao RN-11 da 44: sem beco)
 *  - NC manual, serie, lote nao identificavel -> NENHUMA, como hoje
 */
function efeitoExecucaoSucatear(nc, insp, material, lote, extra) {
  const nada = (efeito, mensagem) => ({ efeito, quantidade: null, material_id: null, lote_id: null, mensagem });
  const recusa = (r) => ({ efeito: 'RECUSA', recusa: r, mensagem: r.mensagem });

  if (extra.solicitadoAberto) return recusa(execRecusaSucateamentoAberto(extra.solicitadoAberto.id));
  const p = sucateamentoDoReprovadoPrevisto(nc, insp, material, lote, null);
  if (p.efeito === 'SUCATEAVEL') {
    // Fase 5 (achado 2): material de cliente — a solicitacao pela tela (sem OS/projeto) seria
    // recusada pela guarda do dono; ensinar "Solicitar sucateamento" era mandar para um beco.
    if (material && material.proprietario_cliente_id) {
      return extra.motivoSemBaixa ? nada('SEM_BAIXA', EFEITO_EXEC_MSG.SEM_BAIXA) : recusa(EXEC_RECUSA_CLIENTE_SEM_OS);
    }
    return recusa(EXEC_RECUSA.PEDE_SUCATEAMENTO);
  }
  switch (p.codigo) {
    case 'LOTE_STATUS':
      return extra.motivoSemBaixa ? nada('SEM_BAIXA', EFEITO_EXEC_MSG.SEM_BAIXA) : recusa(execRecusaLoteForaDeAtivo(lote));
    // Fase 5 (achado 1): o lote do reprovado ja sem saldo — mesmo tratamento do lote fora de ATIVO.
    case 'SEM_SALDO_LOTE':
      return extra.motivoSemBaixa ? nada('SEM_BAIXA', EFEITO_EXEC_MSG.SEM_BAIXA) : recusa({ status: 409, mensagem: p.mensagem });
    case 'SEM_REPROVADA': return nada('SEM_SALDO', EFEITO_EXEC_MSG.SEM_SALDO_SEM_REPROVADA_SUCATEAR);
    case 'JA_SUCATEADA': return nada('SEM_SALDO', EFEITO_EXEC_MSG.SEM_SALDO_JA_SUCATEADA);
    case 'JA_DEVOLVIDA': return nada('SEM_SALDO', EFEITO_EXEC_MSG.SEM_SALDO_JA_DEVOLVIDA);
    case 'JA_LIBERADA': return nada('SEM_SALDO', EFEITO_EXEC_MSG.SEM_SALDO_JA_LIBERADA);
    case 'INATIVO': return nada('SEM_SALDO', EFEITO_EXEC_MSG.SEM_SALDO_INATIVO);
    case 'SEM_BLOQUEIO': return nada('SEM_SALDO', EFEITO_EXEC_MSG.SEM_SALDO_BLOQUEIO);
    case 'SEM_FISICO': return nada('SEM_SALDO', EFEITO_EXEC_MSG.SEM_SALDO_FISICO);
    // A movimentacao ja existe mas `execucao_em` nao: so por escrita fora do codigo. Documento.
    case 'JA_SAIU_NC': return recusa(EXEC_RECUSA.JA_REGISTRADA);
    // MANUAL (como hoje: a NC manual de SUCATEAR registrava NENHUMA), SERIE e SEM_LOTE (contrato).
    default: return nada('NENHUMA', EFEITO_EXEC_MSG.NENHUMA);
  }
}

/**
 * Etapa 69 — extraida de `executarDevolucao` SEM mudar comportamento (os testes da 57 provam), para
 * a segunda assinatura do sucateamento do reprovado usar a MESMA origem (D9, caso 2).
 *
 * Etapa 57 (RN-06): com destino POR ITEM no recebimento, a peca reprovada pode estar num endereco
 * que nao e a padrao — e a saida sem origem drena a padrao primeiro (claimSaldoSemLote). Origem
 * preferida = onde a ENTRADA_COMPRA deste recebimento/material/lote entrou, se ativo e nao
 * bloqueado (bloqueado recusaria a baixa). Senao, `null` (o comportamento de antes).
 * Fase 5 da 57: primeiro o endereco gravado NO ITEM da inspecao (o livro nao guarda o item: o mesmo
 * material duas vezes na nota escolhia o endereco do outro item). Item com endereco gravado mas
 * inativo/bloqueado = sem origem. Item sem endereco gravado (legado) = a busca pelo livro.
 * NAO e estrita: o motor so PREFERE a origem (molde da devolucao — o risco fica declarado em C).
 */
async function origemDaEntradaDaInspecao(db, insp, nc, materialId, loteId) {
  const doItem = insp && insp.recebimento_item_id ? await dbGet(db, `SELECT ri.localizacao_entrada_id as gravado,
      CASE WHEN l.ativo = 1 AND COALESCE(l.bloqueada, 0) = 0 THEN l.id END as id
      FROM recebimentos_material_itens_almoxarifado ri
      LEFT JOIN localizacoes_almoxarifado l ON l.id = ri.localizacao_entrada_id
      WHERE ri.id = ?`, [insp.recebimento_item_id]) : null;
  if (doItem && doItem.gravado) return doItem.id ? { id: doItem.id } : null;
  if (!nc || !nc.recebimento_id) return null;
  const doLivro = await dbGet(db, `SELECT m.localizacao_destino_id as id
      FROM movimentacoes_almoxarifado m
      JOIN localizacoes_almoxarifado l ON l.id = m.localizacao_destino_id
      WHERE m.recebimento_id = ? AND m.material_id = ? AND m.tipo = 'ENTRADA_COMPRA' AND m.lote_id IS ?
        AND COALESCE(m.cancelado, 0) = 0 AND l.ativo = 1 AND COALESCE(l.bloqueada, 0) = 0
      ORDER BY m.id DESC LIMIT 1`, [nc.recebimento_id, materialId, loteId || null]);
  return doLivro || null;
}

/**
 * Etapa 45, RN-01..RN-13 — decide, SEM ESCREVER, qual sera o efeito desta execucao no saldo.
 *
 * Irma de `efeitoPrevisto` (Etapa 44) e pura pela mesma razao: e a parte que da para provar sem
 * banco. **A ORDEM DOS TESTES E O CONTRATO** — a precedencia de 10 niveis esta congelada na
 * secao 3 do design, e sem ela mais de um caso casa duas regras com mensagens diferentes (uma NC
 * manual decidida `SUBSTITUICAO` casa a RN-04 e a RN-06 ao mesmo tempo).
 *
 * Devolve `{ efeito, quantidade, material_id, lote_id, mensagem }`. Dois efeitos sao INTERNOS:
 *   - `RECUSA` carrega `{ status, mensagem }` e quem o traduz em `throw` e o chamador — assim a
 *     precedencia inteira, inclusive as recusas, e testavel sem subir banco nem rota;
 *   - `DEVOLVIVEL` significa "nada impede, tente o claim"; quem o traduz em `BAIXADA` ou
 *     `JA_DEVOLVIDA` e o claim da INSPECAO, que e o unico que sabe a resposta.
 */
function efeitoExecucaoPrevisto(nc, insp, material, lote, extra = {}) {
  const nada = (efeito, mensagem) => ({
    efeito, quantidade: null, material_id: null, lote_id: null, mensagem,
  });
  const recusa = (r) => ({ efeito: 'RECUSA', recusa: r, mensagem: r.mensagem });

  // (1) RN-01 — as duas decisoes de ACEITACAO ja se executaram na Etapa 44, no mesmo clique da
  // decisao. Nao ha ato externo a confirmar, e oferecer um botao de "registrar execucao" nelas
  // conviteria a registrar uma execucao que nao existe.
  if (DECISOES_QUE_LIBERAM.includes(nc.decisao)) return recusa(EXEC_RECUSA.SEM_EXECUCAO);

  // (2) RN-07 — so NC DECIDIDA tem execucao. `ABERTA` (ninguem decidiu o que fazer) e `CANCELADA`
  // recusam.
  //
  // ⚠️ ESTE COMENTARIO DIZIA que `CANCELADA` significa "a divergencia sumiu na reconferencia".
  // Isso valia ate a Etapa 45 e DEIXOU DE VALER na 46: agora `CANCELADA` tem DOIS significados, e o
  // mais comum e o humano — uma pessoa encerrou um documento DECIDIDO cuja execucao era impossivel
  // (serie, lote nao identificavel), com o problema ainda de pe. O comportamento desta linha esta
  // certo nos dois casos; era a EXPLICACAO que enganava o proximo leitor. Terceira ocorrencia
  // corrigida desta mesma classe (as outras duas estao em `alertRegistry.js`).
  // ⚠️ E a partir do fix-round da Fase 5 o nivel 2 DISTINGUE os dois. Uma lente mediu que
  // `/executar` num documento CANCELADO respondia *"So e possivel registrar a execucao de uma nao
  // conformidade decidida"* — sobre um documento que FOI decidido, e cuja decisao esta gravada e
  // legivel. A frase estava tecnicamente defensavel e praticamente enganosa: ela manda decidir o
  // que ja esta decidido. `CANCELADA` tem literal propria, e ela diz o que aconteceu.
  if (nc.status === 'CANCELADA') return recusa(EXEC_RECUSA.CANCELADA);
  if (nc.status !== 'DECIDIDA') return recusa(EXEC_RECUSA.NAO_DECIDIDA);

  // (3) RN-05, nivel DOCUMENTO — 409. E a protecao do documento; a do SALDO e o claim da inspecao,
  // la embaixo, e as duas sao necessarias por razoes diferentes (ver schema.js).
  if (nc.execucao_em) return recusa(EXEC_RECUSA.JA_REGISTRADA);

  // (4) RN-04 — `SUBSTITUICAO`, `ANALISE_ENGENHARIA` e `SUCATEAR` registram data, autor e
  // observacao, e NAO movem estoque. Corte declarado: criar a reposicao da substituicao e baixar
  // o sucateamento tem cada um o proprio fluxo de aprovacao.
  //
  // ⚠️ Etapa 69 (RN-08, Fase 2): o nivel 4 se DIVIDE para `SUCATEAR`. Ele devolvia NENHUMA para
  // tudo que nao era DEVOLVER, e a NC de SUCATEAR saia da fila com o condenado no bloqueado (Surpresa
  // 2 da Fase 0). Agora ela tem a sua precedencia propria (`efeitoExecucaoSucatear`), que recusa o
  // viavel e registra sem mover o inviavel. `SUBSTITUICAO` e `ANALISE_ENGENHARIA`: como antes.
  if (nc.decisao === 'SUCATEAR') return efeitoExecucaoSucatear(nc, insp, material, lote, extra);
  if (nc.decisao !== DECISAO_QUE_DEVOLVE) return nada('NENHUMA', EFEITO_EXEC_MSG.NENHUMA);

  // (5) RN-06 — ⚠️ A LINHA QUE SUSTENTA A CONCESSAO A COMPRAS. Irma da RN-09 da Etapa 44, e aqui
  // ela pesa mais: la a porta lateral LIBERAVA retencao; aqui APAGA PATRIMONIO.
  // `abrirNaoConformidadeManual` deixa qualquer um com `registrar_nao_conformidade` — o que inclui
  // COMPRAS e ALMOXARIFE — abrir uma NC apontando para QUALQUER inspecao da historia
  // (`resolverFato` so exige que ela exista). Sem esta guarda, decidir `DEVOLVER` nessa NC e
  // executa-la baixaria material contra o pool, que e AGREGADO, sem `ajustar_estoque` e sem
  // `movimentar` — um caminho para apagar estoque por fora do motor. Ver o comentario de
  // `executar_encaminhamento` em permissions.js: afrouxar isto muda a razao daquela concessao.
  if (!nc.aberto_automaticamente || nc.origem !== 'INSPECAO' || nc.referencia_tipo !== 'INSPECAO') {
    return nada('NENHUMA', EFEITO_EXEC_MSG.NENHUMA_MANUAL);
  }

  // (6) RN-13 — material com controle de SERIE recusa, e isso e corte declarado, nao esquecimento.
  // Baixar `quantidade_atual` sem baixar as linhas de `series_almoxarifado` quebra o invariante
  // `COUNT(serie presente) == quantidade_atual` da Etapa 6b — e a peca devolvida ao fornecedor
  // continuaria ENTREGAVEL pela tela de Movimentacoes, porque a serie segue "presente". Escolher
  // QUAIS series voltam e gesto de tela, e e etapa propria.
  if (material && material.controle_serie) return recusa(EXEC_RECUSA.SERIE);

  // (7) RN-12 — `controle_lote` ligado e nenhum lote resolvivel: RECUSA, em vez de deixar o motor
  // debitar a linha de lote `NULL`. Essa linha ficaria NEGATIVA enquanto a do lote devolvido
  // continuaria mostrando saldo — as duas pontas discordando em silencio, que e o defeito que a
  // Etapa 9 ja pagou uma vez.
  if (material && material.controle_lote && !lote) return recusa(EXEC_RECUSA.SEM_LOTE);

  // (8) RN-11 — OS TRES ESTADOS CONHECIDOS QUE REGISTRAM SEM MOVER. E a licao literal da RN-11 da
  // Etapa 44, e a razao e a mesma: recusa FATAL cria documento que nunca fecha. Se o material ja
  // saiu do bloqueio por fora (o workaround que existia antes destas duas etapas), ou o fisico nao
  // cobre, ou o material foi inativado, a execucao fica REGISTRADA — alguem de fato embalou e
  // mandou embora — e a tela diz POR QUE o saldo nao mudou.
  const reprovada = Number(insp?.quantidade_reprovada) || 0;
  const materialId = insp?.material_id || null;
  if (!insp || !(reprovada > 0) || !materialId || !material) {
    return nada('SEM_SALDO', EFEITO_EXEC_MSG.SEM_SALDO_SEM_REPROVADA);
  }
  if (!material.ativo) return nada('SEM_SALDO', EFEITO_EXEC_MSG.SEM_SALDO_INATIVO);

  // ⚠️ A RETENCAO DESTA INSPECAO JA FOI SOLTA POR OUTRA NC — e o teste abaixo NAO sabe disso.
  //
  // Achado de DOIS revisores independentes, e vale ler junto com o que `schema.js` ja escrevia
  // para justificar onde a trava mora: *"o pool e AGREGADO — com bloqueio de outra origem na
  // mesma peca, a segunda baixa passa em silencio e apaga material que ninguem devolveu"*. O
  // nivel seguinte compara `quantidade_bloqueada` do POOL com a reprovada, e o pool nao sabe de
  // quem e cada quilo. Se os 3 kg desta inspecao ja sairam do bloqueio e ha 5 kg retidos de
  // OUTRA inspecao, o nivel seguinte passa e a devolucao baixa 3 kg contra a retencao alheia,
  // com mensagem de sucesso.
  //
  // O caso ALCANCAVEL e nomeado — e o B175/C63 da Etapa 44: duas NCs da MESMA inspecao com
  // decisoes opostas, a de aceitacao solta tudo. `liberacao_nc_em` e a prova documental de que
  // isso aconteceu, e e barata: ja esta na linha que `getInspecao` le.
  //
  // ⚠️ ISTO NAO FECHA O CASO GERAL, e a diferenca importa: quem drenou o bloqueio PELA MAO
  // (`POST /materiais/:id/desbloquear`, o workaround anterior a estas duas etapas) nao deixa
  // marca nenhuma na inspecao, e esse caminho continua aberto. Fechar de verdade exige
  // contabilizar retencao POR ORIGEM, que e tabela nova e etapa propria. Declarado nas letras
  // A (consulta pre-deploy) e C do documento de novidades.
  // Etapa 69 (RN-07): a TERCEIRA porta. Depois do sucateamento do reprovado (outra NC da mesma
  // inspecao), a devolucao baixaria de novo o que ja foi para a cacamba, contra a retencao alheia.
  if (insp.sucateamento_em) {
    return nada('SEM_SALDO', EFEITO_EXEC_MSG.SEM_SALDO_JA_SUCATEADA);
  }
  if (insp.liberacao_nc_em) {
    return nada('SEM_SALDO', EFEITO_EXEC_MSG.SEM_SALDO_JA_LIBERADA);
  }

  // ⚠️ AS DUAS COMPARACOES ABAIXO USAM `menosQue`, E NAO `<` CRU. CRITICAL achado na revisao
  // adversarial, REPRODUZIDO pelas rotas reais com operacao inteiramente normal:
  //
  //   dois recebimentos de 10 kg do mesmo material critico, inspecoes reprovando 2.3 e 3.4.
  //   `quantidade_bloqueada` vira 5.699999999999999 (IEEE-754, nao erro de ninguem).
  //   Devolver a primeira (2.3) deixa 3.3999999999999995. Devolver a segunda (3.4) cai aqui,
  //   porque `3.3999999999999995 < 3.4` e VERDADE — e responde 200 com
  //   "O material já havia saído do bloqueio", tendo o COMPRAS acabado de embalar e despachar.
  //
  // O estado resultante e ABSORVENTE, e e o que torna isto CRITICAL e nao cosmetico: a NC fica
  // `EXECUTADA` (some da fila `?execucao=PENDENTE`), o cartao de reprovados cala junto, a
  // re-execucao e 409, e ate o desbloqueio manual recusa ("Quantidade bloqueada insuficiente:
  // 3.3999999999999995"). O material sai do galpao e continua contado no fisico e no bloqueado,
  // sem nenhuma superficie cobrando.
  //
  // ESTE ARQUIVO JA SABIA DISSO. Ele importa `EPSILON_DIVERGENCIA` desde a Etapa 43 (`:43`), usa
  // em `temDivergenciaReal`/`mesmoFato`, e o docblock do topo avisa que um `!== 0` cru ali
  // "transformaria 7e-16 em documento numerado contra quem contou CERTO". Eu escrevi duas
  // comparacoes novas de REAL sem aplicar a regua que o proprio arquivo declara ter dono unico.
  if (menosQue(material.quantidade_bloqueada, reprovada)) {
    return nada('SEM_SALDO', EFEITO_EXEC_MSG.SEM_SALDO_BLOQUEIO);
  }
  // ⚠️ `bloqueada > atual` E ALCANCAVEL — `stockService.js` documenta o estado. Sem este teste a
  // baixa iria ao motor e tomaria recusa fatal, trancando o documento pelo caminho que os dois
  // testes acima existem para evitar.
  if (menosQue(material.quantidade_atual, reprovada)) {
    return nada('SEM_SALDO', EFEITO_EXEC_MSG.SEM_SALDO_FISICO);
  }

  // (9) e (10) sao do claim: DEVOLVIVEL so diz "nada impede".
  return {
    efeito: 'DEVOLVIVEL',
    quantidade: reprovada,
    material_id: materialId,
    lote_id: lote ? lote.id : null,
    mensagem: null,
  };
}

/**
 * RN-01..RN-13 — REGISTRAR QUE O ENCAMINHAMENTO FOI EXECUTADO.
 *
 * ── A ORDEM DAS OPERACOES E A MESMA DA ETAPA 44, E PELA MESMA RAZAO MEDIDA ───────────────────
 *   1. resolver e CALCULAR o efeito, sem escrever nada
 *   2. claim da EXECUCAO na NC  (WHERE status='DECIDIDA' AND execucao_em IS NULL) -> 409
 *   3. claim da INSPECAO        (WHERE devolucao_fornecedor_em IS NULL) -> JA_DEVOLVIDA
 *   4. `DEVOLUCAO_FORNECEDOR` pelo motor -> falhou = desfaz os DOIS claims e propaga
 *   5. trilha (NAO fatal)
 *
 * O claim do DOCUMENTO vem antes de qualquer efeito de saldo porque e ele que serializa: a
 * perdedora de uma corrida morre ANTES de tocar em estoque, e nenhuma compensacao precisa passar
 * pelo motor. A Etapa 44 comecou com a ordem inversa e a Fase 2 mediu que ela produzia os dois
 * estados que a regra existe para proibir — o raciocinio inteiro esta em `decidirNaoConformidade`
 * e vale palavra por palavra aqui.
 *
 * ⚠️ E AQUI HA UMA DIFERENCA REAL EM RELACAO A 44, que e o que esta etapa existe para dizer: a
 * baixa NAO e fatal para a DECISAO, e sim para a EXECUCAO. Se o motor falhar, a NC volta a
 * `PENDENTE` de execucao — decidida, documentada, esperando alguem tentar de novo. Desfazer a
 * decisao aqui seria errado: ela foi tomada outro dia, por outra pessoa, e continua valendo.
 */
async function registrarExecucao(db, user, ncId, dados = {}) {
  const id = idInteiro(ncId);
  if (!id) throw erro('Não conformidade não encontrada', 404);
  const atual = await dbGet(db, 'SELECT * FROM nao_conformidades_almoxarifado WHERE id = ?', [id]);
  if (!atual) throw erro('Não conformidade não encontrada', 404);

  // Etapa 69 (Fase 2): `motivo_sem_baixa` — o registro SEM baixa de um SUCATEAR cujo lote esta fora
  // de ATIVO exige o motivo EXPLICITO (o `/executar` nao fecha calado). Vai para as observacoes da
  // execucao, que e o campo que a tela e a trilha ja mostram. Nas outras decisoes e ignorado.
  const motivoSemBaixa = String(dados.motivo_sem_baixa ?? '').trim() || null;
  let observacoes = String(dados.observacoes ?? '').trim() || null;

  // ── Passo 1: resolver e calcular, SEM ESCREVER ─────────────────────────────────────────────
  // As leituras so acontecem no caminho que pode mover saldo; nos outros a precedencia decide
  // sozinha, com `insp`/`material`/`lote` nulos, e e de proposito: uma NC manual NAO deve nem
  // chegar a ler a inspecao alheia para a qual aponta.
  // ⚠️ Etapa 69 (Fase 2): `SUCATEAR` passa a carregar tambem. Sem isto a precedencia nova veria
  // inspecao vazia, diria "nao viavel" e registraria calada — o defeito que a etapa veio fechar.
  let insp = null;
  let material = null;
  let lote = null;
  let solicitadoAberto = null;
  if ((atual.decisao === DECISAO_QUE_DEVOLVE || atual.decisao === 'SUCATEAR')
      && atual.status === 'DECIDIDA' && !atual.execucao_em
      && atual.aberto_automaticamente
      && atual.origem === 'INSPECAO' && atual.referencia_tipo === 'INSPECAO') {
    insp = await getInspecao(db, atual.referencia_id);
    if (insp?.material_id) {
      material = await dbGet(db, `SELECT id, codigo, unidade, ativo, quantidade_atual,
        quantidade_bloqueada, controle_lote, controle_serie, proprietario_cliente_id, permite_saldo_negativo
        FROM materiais_almoxarifado WHERE id = ?`, [insp.material_id]);
      // Fase 5: no SUCATEAR o lote vem com o saldo (nivel 16b); a devolucao (45) segue como era.
      lote = atual.decisao === 'SUCATEAR'
        ? await carregarLoteDoReprovado(db, insp, material)
        : await resolverLoteDaInspecao(db, insp, insp.material_id);
    }
    if (atual.decisao === 'SUCATEAR') solicitadoAberto = await sucateamentoAbertoDaNc(db, id);
  }
  const previsto = efeitoExecucaoPrevisto(atual, insp, material, lote, { solicitadoAberto, motivoSemBaixa });
  if (previsto.efeito === 'RECUSA') throw erro(previsto.recusa.mensagem, previsto.recusa.status);
  if (previsto.efeito === 'SEM_BAIXA') {
    observacoes = [observacoes, `Registrada sem baixa: ${motivoSemBaixa}`].filter(Boolean).join(' — ');
  }

  // ── Passo 2: o claim da EXECUCAO. E o serializador, e vem ANTES de qualquer efeito de saldo ──
  // `AND execucao_em IS NULL` no proprio UPDATE, e nao so no SELECT: e o que faz duas execucoes
  // simultaneas nao se sobrescreverem. `status = 'DECIDIDA'` entra junto porque um cancelamento
  // concorrente entre o SELECT e este UPDATE deixaria execucao registrada em documento morto.
  const upd = await dbRun(db, `UPDATE nao_conformidades_almoxarifado SET
    execucao_estado = ?, execucao_em = CURRENT_TIMESTAMP, execucao_por_id = ?,
    execucao_por_nome = ?, execucao_observacoes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'DECIDIDA' AND execucao_em IS NULL`,
    [EXECUCAO_EXECUTADA, user?.id || null, user?.nome || user?.email || null, observacoes, id]);
  // ⚠️ `changes === 0` DEIXOU DE RECAIR NUMA LITERAL FIXA — fix-round da Fase 5, achado de uma
  // lente que reproduziu a corrida com `Promise.all`. O comentario acima ja previa "um cancelamento
  // concorrente entre o SELECT e este UPDATE", e a mensagem seguia dizendo *"A execucao desta nao
  // conformidade ja foi registrada"* — com `execucao_em` NULL e `status = CANCELADA`. Era a MESMA
  // classe de mentira que o achado 9 da Fase 2 corrigiu no lado do cancelamento, intacta deste lado.
  //
  // E o caso SEM corrida e mais comum ainda: `POST /executar` num documento que alguem acabou de
  // cancelar — que e literalmente o estado do furo C64 depois da saida nova.
  if (!upd.changes) {
    const agora = await obterNaoConformidade(db, id);
    const recusa = agora && agora.status === 'CANCELADA'
      ? EXEC_RECUSA.CANCELADA
      : EXEC_RECUSA.JA_REGISTRADA;
    throw erro(recusa.mensagem, recusa.status);
  }

  let execucao = {
    efeito: previsto.efeito, quantidade: null, material_id: null, lote_id: null,
    movimentacao_id: null, mensagem: previsto.mensagem,
  };
  if (previsto.efeito === 'DEVOLVIVEL') {
    execucao = await executarDevolucao(db, user, atual, insp, previsto, observacoes, id);
  }

  // NAO FATAL, pela mesma inversao deliberada de `decidirNaoConformidade`: aqui ja aconteceu tudo,
  // e um 500 depois de uma operacao que VALEU faria o usuario tentar de novo e levar 409 — ou
  // seja, acreditar que nao valeu. O rastro do saldo nao se perde: a linha do livro carrega
  // `documento_vinculado = NC-…`.
  try {
    await registrarAuditoria(db, {
      entidade: ENTIDADE_AUDITORIA,
      entidade_id: id,
      acao: ACAO_EXECUTADA,
      usuario_id: user?.id,
      usuario_nome: user?.nome || user?.email,
      dados_anteriores: { execucao_estado: EXECUCAO_PENDENTE },
      dados_novos: {
        execucao_estado: EXECUCAO_EXECUTADA,
        decisao: atual.decisao,
        efeito_saldo: execucao.efeito,
        quantidade: execucao.quantidade,
        movimentacao_id: execucao.movimentacao_id || null,
      },
      justificativa: observacoes,
    });
  } catch (e) {
    console.warn(`[NC] execução ${id} gravada, mas a trilha falhou: ${e.message}`);
  }

  const nc = await obterNaoConformidade(db, id);
  return { ...nc, execucao };
}

/**
 * Passos 3 e 4 da ordem acima. NAO e ponto de entrada e nao valida nada: quem chega aqui ja passou
 * pelo `efeitoExecucaoPrevisto` e pelo claim da NC.
 *
 * O rollback desfaz os DOIS claims, e nessa ordem: primeiro o da inspecao (senao uma execucao
 * concorrente veria a NC reaberta com a inspecao ainda travada) e depois o da NC.
 */
async function executarDevolucao(db, user, nc, insp, previsto, observacoes, id) {
  // Passo 3 — o claim da INSPECAO (RN-05). E por INSPECAO e nao por NC de proposito: duas NCs de
  // TIPOS diferentes da mesma inspecao baixariam a reprovada duas vezes, e o motor nao salva
  // porque o pool e agregado. Ver o comentario da coluna em schema.js.
  // Etapa 69 (RN-07): o claim olha os TRES carimbos (liberacao — 44, sucateamento — 69), e a perda
  // do claim RELE para nomear a causa. Sem `sucateamento_em` aqui, a devolucao de outra NC da mesma
  // inspecao baixaria de novo o que ja foi para a cacamba, contra a retencao alheia.
  const claim = await dbRun(db, `UPDATE inspecoes_recebimento_almoxarifado
    SET devolucao_fornecedor_em = CURRENT_TIMESTAMP
    WHERE id = ? AND devolucao_fornecedor_em IS NULL AND sucateamento_em IS NULL
      AND liberacao_nc_em IS NULL`, [insp.id]);
  if (!claim.changes) {
    const agora = await dbGet(db, `SELECT liberacao_nc_em, devolucao_fornecedor_em, sucateamento_em
      FROM inspecoes_recebimento_almoxarifado WHERE id = ?`, [insp.id]);
    const semMover = (efeito, mensagem) => ({
      efeito, quantidade: null, material_id: null, lote_id: null, movimentacao_id: null, mensagem,
    });
    if (agora && !agora.devolucao_fornecedor_em && agora.sucateamento_em) {
      return semMover('SEM_SALDO', EFEITO_EXEC_MSG.SEM_SALDO_JA_SUCATEADA);
    }
    if (agora && !agora.devolucao_fornecedor_em && agora.liberacao_nc_em) {
      return semMover('SEM_SALDO', EFEITO_EXEC_MSG.SEM_SALDO_JA_LIBERADA);
    }
    return semMover('JA_DEVOLVIDA', EFEITO_EXEC_MSG.JA_DEVOLVIDA);
  }

  // Passo 4 — o motor. `require` preguicoso e chamada POR PROPRIEDADE, pelas duas razoes escritas
  // em `executarLiberacao`: a primeira evita ciclo futuro, a segunda e o unico jeito de o teste do
  // rollback trocar a funcao por uma que estoura.
  const justificativa = observacoes
    || `Execução da devolução ao fornecedor decidida na não conformidade ${nc.numero}`;
  // Etapa 57 (RN-06) — a origem e onde a peca reprovada ENTROU. Etapa 69: extraida para
  // `origemDaEntradaDaInspecao` (o sucateamento do reprovado usa a mesma), sem mudar comportamento.
  const entrada = await origemDaEntradaDaInspecao(db, insp, nc, previsto.material_id, previsto.lote_id);
  const stockService = require('./stockService');
  let mov;
  try {
    mov = await stockService.registrarMovimentacao(db, user, {
      material_id: previsto.material_id,
      tipo: 'DEVOLUCAO_FORNECEDOR',
      quantidade: previsto.quantidade,
      lote_id: previsto.lote_id || null,
      ...(entrada ? { localizacao_origem_id: entrada.id } : {}),
      justificativa,
      motivo: MOTIVO_DEVOLUCAO_FORNECEDOR,
      documento_vinculado: nc.numero,
      recebimento_id: nc.recebimento_id || null,
      // `exigeLote` e a SEGUNDA tranca da RN-12; a primeira e o nivel 7 da precedencia, que ja
      // recusou com literal propria. Redundante de proposito: o dia em que alguem chamar esta
      // funcao por um caminho que pule a precedencia, o motor ainda recusa.
      //
      // ⚠️ `exigeSerie` FALTAVA, e o achado e da revisao adversarial — eu escrevi o principio no
      // paragrafo acima e o apliquei a UMA das duas regras. A RN-13 e a mais grave das duas: sem
      // ela o motor baixa `quantidade_atual` sem tocar em `series_almoxarifado` (MEDIDO: 10 -> 7
      // no fisico, 3 -> 0 no bloqueado, zero linhas de serie alteradas), quebrando o invariante
      // `COUNT(serie presente) == quantidade_atual` da Etapa 6b — e a peca devolvida ao
      // fornecedor continua ENTREGAVEL pela tela de Movimentacoes, porque a serie segue presente.
      // Aditivo: o nivel 6 da precedencia recusa antes, e com mensagem melhor.
    }, { exigeLote: true, exigeSerie: true });
  } catch (e) {
    await dbRun(db, `UPDATE inspecoes_recebimento_almoxarifado SET devolucao_fornecedor_em = NULL
      WHERE id = ? AND devolucao_fornecedor_em IS NOT NULL`, [insp.id]);
    // A NC volta a PENDENTE, NAO a decisao a ABERTA — ver o aviso no docblock de
    // `registrarExecucao`: a decisao foi de outra pessoa, outro dia, e continua valendo.
    await dbRun(db, `UPDATE nao_conformidades_almoxarifado SET
      execucao_estado = ?, execucao_em = NULL, execucao_por_id = NULL, execucao_por_nome = NULL,
      execucao_observacoes = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND execucao_em IS NOT NULL`, [EXECUCAO_PENDENTE, id]);
    throw e;
  }

  await dbRun(db, `UPDATE nao_conformidades_almoxarifado
    SET execucao_movimentacao_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [mov.id, id]);

  return {
    efeito: 'BAIXADA',
    quantidade: previsto.quantidade,
    material_id: previsto.material_id,
    lote_id: previsto.lote_id || null,
    movimentacao_id: mov.id,
    mensagem: `${previsto.quantidade} devolvido(s) ao fornecedor`,
  };
}
/** Etapa 46 — as recusas do CANCELAMENTO, com o codigo HTTP de cada uma (secoes 5 e 9.5 do
 * desenho). Congeladas: `ncCancelamento.api.test.js` compara por igualdade exata. */
const CANC_RECUSA = {
  MOTIVO: { status: 400, mensagem: 'O motivo do cancelamento deve ter pelo menos 5 caracteres' },
  NAO_ENCONTRADA: { status: 404, mensagem: 'Não conformidade não encontrada' },
  JA_EXECUTADA: {
    status: 409,
    mensagem: 'A execução desta não conformidade já foi registrada — o documento não pode ser cancelado',
  },
  // ⚠️ AS DUAS RECUSAS ABAIXO SUBSTITUIRAM A `JA_LIBEROU`, no fix-round da Fase 5.
  //
  // ~~`JA_LIBEROU`: 'A decisao desta nao conformidade ja liberou o material — o documento nao pode
  // ser cancelado'~~ — ela nasceu do achado 9.3 da Fase 2 afirmando que, na aceitacao, "O SALDO JA
  // SE MOVEU". Uma lente da Fase 5 mediu por sonda que isso e FALSO em dois casos reais: NC de
  // origem `RECEBIMENTO` decidida `ACEITAR` (falta de quantidade — nao ha retencao a liberar,
  // efeito `SEM_BLOQUEIO`) e NC MANUAL de inspecao decidida `ACEITAR_SOB_DESVIO` (a RN-09 da Etapa
  // 44 proibe liberar). Nos dois: zero movimentacao, `liberacao_nc_em` nulo, bloqueado intacto — e
  // a frase afirmava um fato de estoque inexistente, deixando o documento incancelavel com uma
  // mentira. Era a classe de defeito mais caro desta base: mensagem que afirma efeito que nao
  // houve.
  //
  // A regua agora e de ESTADO, nao de efeito de estoque — e por isso as frases sao verdadeiras em
  // TODOS os casos que cobrem. `NAO_DECIDIDA` tambem carrega o caminho de saida, porque a pessoa
  // que tenta cancelar um documento aberto precisa saber qual e o gesto certo.
  NAO_DECIDIDA: {
    status: 409,
    mensagem: 'Só é possível cancelar uma não conformidade já decidida — decida o documento, ou corrija a quantidade conferida',
  },
  SEM_PENDENCIA: {
    status: 409,
    mensagem: 'Esta decisão não deixou execução pendente — não há o que encerrar',
  },
  JA_CANCELADA: { status: 409, mensagem: 'Esta não conformidade já está cancelada' },
  // ⚠️ Fallback do `changes === 0` quando a releitura NAO acha recusa: a linha mudou duas vezes no
  // meio (o caso medido e `/executar` gravando `execucao_em` e o rollback dele limpando). Nao e
  // "ja esta cancelada" — essa frase mentiria — e nao e erro do chamador: repetir resolve.
  CONCORRENCIA: {
    status: 409,
    mensagem: 'O documento mudou de estado durante o cancelamento — tente de novo',
  },
};

/** A mensagem de sucesso. ⚠️ ERA UM MAPA DE DUAS, uma por estado anterior — e a de `ABERTA`
 * ("ele nao estava decidido, e nada foi executado") morreu com o corte de escopo do fix-round da
 * Fase 5: hoje so documento DECIDIDO com execucao PENDENTE cancela, entao o unico estado anterior
 * possivel e `DECIDIDA`. Fica UMA constante, e nao um mapa de um item, para nao sugerir uma
 * variacao que nao existe mais. */
const CANC_MSG_DECIDIDA = 'Documento cancelado — a decisão fica registrada, e a execução deixa de ser cobrada';

/** O minimo do motivo. Mesma regua e mesmo molde de `PUT /conferencias/:id/cancelar`
 * (`routes/almoxarifado.js`), cuja justificativa vale igual aqui: encerrar um documento de
 * qualidade a mao e tao consequente quanto o ato que ele encerra. */
const MOTIVO_CANCELAMENTO_MINIMO = 5;


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
  // Etapa 45 (RN-08) — A FILA DO QUE FALTA EXECUTAR. `?execucao=PENDENTE` e a resposta real ao
  // requisito "acompanhar se ja foi executada": o cartao de reprovados tem janela de 7 dias e e
  // AVISO DE EVENTO, nao fila de pendencia — passada a janela a inspecao sai sozinha, executada ou
  // nao (F0-4, que corrigiu uma medicao minha que estava falsa).
  //
  // ⚠️ `AND nc.status = 'DECIDIDA'` entra JUNTO, e nao e redundancia. `execucao_estado` fica NULL
  // em NC ABERTA e em NC CANCELADA, entao o `=` sozinho ja as excluiria HOJE — mas "hoje" e o
  // acidente de o backfill so ter carimbado as decididas. Uma NC cancelada DEPOIS de decidida
  // conserva o `PENDENTE` que a decisao gravou (cancelar nao limpa a coluna), e apareceria na
  // fila cobrando execucao de um documento morto. A clausula e a regra; o NULL e a coincidencia.
  if (filtros.execucao) {
    sql += ' AND nc.execucao_estado = ? AND nc.status = \'DECIDIDA\'';
    params.push(filtros.execucao);
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

/**
 * Etapa 46 — CANCELAR o documento. Existe porque a Etapa 45 criou um beco: a execucao recusa
 * material com `controle_serie`, e lote nao identificavel, com 400 FATAL (niveis 6 e 7 da
 * precedencia de `efeitoExecucaoPrevisto`), e o documento ficava `DECIDIDA` + `PENDENTE` para
 * sempre — `decidir` da 409 em NC decidida, e o unico cancelamento que existia era automatico, so
 * para NC de quantidade `aberto_automaticamente`, com `WHERE status = 'ABERTA'`. Furo C64, achado
 * por dois revisores independentes na Fase 5 da 45.
 *
 * ── O QUE ELA NAO FAZ, E CADA "NAO" E UMA REGRA ─────────────────────────────────────────────
 *
 * NAO desfaz a decisao. A Etapa 43 congelou `decisao`/`justificativa`/`decidido_por_*`/
 * `decidido_em` como imutaveis e auditados; apagar isso de uma decisao que ACONTECEU e apagar
 * evidencia. O mecanismo de reverter EXISTE (`executarLiberacao` faz `status = 'ABERTA'` com tudo
 * a NULL) e NAO e reusado aqui de proposito: la a decisao FALHOU INTEIRA, nada foi ao livro nem a
 * trilha, e o rollback e o que torna a falha invisivel. Usa-lo como "editar" seria outra coisa.
 *
 * NAO zera `execucao_estado` (RN-06). Quem exclui a cancelada da fila `?execucao=PENDENTE` e o
 * `AND nc.status = 'DECIDIDA'` que `listarNaoConformidades` cola no filtro — e o comentario de la
 * ANTECIPOU esta etapa por escrito. Zerar apagaria a informacao de que havia execucao pendente no
 * instante do cancelamento, que e justamente o que o motivo explica.
 *
 * NAO cancela documento cujo encaminhamento JA PRODUZIU EFEITO. Duas portas, duas literais: a
 * execucao registrada (`execucao_em`) e a decisao de ACEITACAO, que liberou material no proprio
 * clique e deixa `execucao_estado = 'NAO_SE_APLICA'` com `execucao_em` NULL — ver `CANC_RECUSA`.
 *
 * ── O QUE ELA GRAVA, E POR QUE `cancelado_por_id` E ESTRUTURAL ──────────────────────────────
 * `cancelado_por_id` NAO e adorno de auditoria: e o DISCRIMINADOR entre os dois significados de
 * `CANCELADA` (o automatico, em que o fato sumiu, e o humano, em que o fato continua de pe). Tres
 * consumidores dependem dele: `getUltimaEncerrada`, o carimbo de `fato_superado_em` e a exclusao
 * do cartao D6 em `alertRegistry.js`.
 *
 * ⚠️ ESTE COMENTARIO DIZIA que "a suite DE CANCELAMENTO nao protege isso: quem limpar a coluna num
 * refactor quebra a RN-05 sem nenhum cenario deste arquivo ficar vermelho". ESTAVA ERRADO, e foi a
 * PROPRIA SABOTAGEM que o derrubou: trocar a escrita da coluna por `NULL` derruba QUATRO cenarios
 * de `ncCancelamento.api.test.js` — o (3), pelo autor, e os tres da RN-05, cada um pelo seu
 * consumidor. A coluna esta bem protegida. Fica dito em vez de reescrito em silencio porque a
 * frase errada convidaria o proximo a "reforcar" uma guarda que ja existe — ou, pior, a confiar
 * menos na suite do que ela merece.
 */
async function cancelarNaoConformidade(db, user, ncId, dados = {}) {
  const id = Number(ncId);
  const motivo = dados.motivo == null ? '' : String(dados.motivo).trim();
  if (motivo.length < MOTIVO_CANCELAMENTO_MINIMO) {
    throw erro(CANC_RECUSA.MOTIVO.mensagem, CANC_RECUSA.MOTIVO.status);
  }

  const atual = await obterNaoConformidade(db, id);
  if (!atual) throw erro(CANC_RECUSA.NAO_ENCONTRADA.mensagem, CANC_RECUSA.NAO_ENCONTRADA.status);

  const recusa = recusaDoCancelamento(atual);
  if (recusa) throw erro(recusa.mensagem, recusa.status);

  const estadoAnterior = atual.status;
  const execucaoAnterior = atual.execucao_estado || null;

  // O claim e a serializacao, e a Fase 5 provou que ela IMPORTA: com `Promise.all` de dois
  // cancelamentos na mesma NC, o claim limpo da `1 sucesso / 1 recusa` e UMA linha de trilha; sem
  // ele, DOIS sucessos e DUAS linhas, com o segundo chamador recebendo 200 sobre documento ja
  // cancelado. O fechamento da T2 declarou "a corrida nao e reproduzivel no harness" — verdade
  // para `cancelar x executar`, FALSO para `cancelar x cancelar`, e o cenario que a prende esta em
  // `ncCancelamento.api.test.js`.
  //
  // As condicoes do WHERE repetem as checagens acima DE PROPOSITO: a leitura de cima da a MENSAGEM
  // certa, o WHERE da a GARANTIA.
  //
  // ⚠️ `AND ? IS NOT NULL` sobre o autor NAO e paranoia: `cancelado_por_id` e o DISCRIMINADOR
  // estrutural da etapa (tres consumidores dependem dele), e ele era gravado por um
  // `user?.id || null` de campo de auditoria. Com um usuario sem `id` — ou com `id: 0` — a linha
  // gravava `NULL` e passava a SIGNIFICAR O OPOSTO (cancelamento automatico, "o fato sumiu"),
  // reabrindo os tres consumidores. A rota nao alcanca isso hoje (o JWT sempre carrega `id`), mas
  // um discriminador estrutural nao pode depender de um `|| null`. Achado da lente 1 da Fase 5.
  const cancelPor = user?.id || null;
  const upd = await dbRun(db, `UPDATE nao_conformidades_almoxarifado SET
    status = 'CANCELADA', motivo_cancelamento = ?, cancelado_em = CURRENT_TIMESTAMP,
    cancelado_por_id = ?, cancelado_por_nome = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND execucao_em IS NULL AND status = 'DECIDIDA' AND execucao_estado = ?
      AND ? IS NOT NULL`,
    [motivo, cancelPor, user?.nome || user?.email || null, id, EXECUCAO_PENDENTE, cancelPor]);

  // ⚠️ `changes === 0` NAO recai numa literal fixa. Cada condicao do WHERE tem uma frase propria, e
  // devolver sempre "ja esta cancelada" mentiria na corrida com `/executar`.
  //
  // E o FALLBACK tambem deixou de ser `JA_CANCELADA`, no fix-round: `recusaDoCancelamento` devolve
  // `null` exatamente para as linhas que o WHERE aceita, entao "claim falhou E a releitura nao acha
  // recusa" significa que a linha mudou DUAS vezes no meio (ex.: `/executar` gravou `execucao_em` e
  // o rollback dele a limpou). Dizer "ja esta cancelada" ali seria a mesma classe de mentira que
  // este bloco existe para evitar — e o `cancelPor` nulo cai aqui tambem.
  if (!upd.changes) {
    const agora = await obterNaoConformidade(db, id);
    const porQue = agora ? recusaDoCancelamento(agora) : CANC_RECUSA.NAO_ENCONTRADA;
    throw erro((porQue || CANC_RECUSA.CONCORRENCIA).mensagem, (porQue || CANC_RECUSA.CONCORRENCIA).status);
  }

  try {
    await registrarAuditoria(db, {
      entidade: ENTIDADE_AUDITORIA,
      entidade_id: id,
      acao: ACAO_CANCELADA,
      usuario_id: user?.id,
      usuario_nome: user?.nome || user?.email,
      // Os DOIS campos anteriores, e o segundo nao e enfeite: a RN-06 conserva `execucao_estado`,
      // entao a trilha e o unico lugar que diz que havia execucao PENDENTE quando se cancelou.
      dados_anteriores: { status: estadoAnterior, execucao_estado: execucaoAnterior },
      // ⚠️ `cancelado_por_id` na trilha, e `automatico: false` explicito — achado da lente 2 da
      // Fase 5. Os DOIS escritores de `CANCELADA` usam o MESMO verbo `NC_CANCELADA`, e nenhum
      // gravava o discriminador: quem audita lia "Nao conformidade cancelada — <nome>" e concluia
      // que aquela pessoa anulou o documento. Medido: o COMPRAS, que toma 403 em `/cancelar`,
      // aparecia como autor ao disparar o cancelamento AUTOMATICO por `/conferir`. A trilha agora
      // diz qual dos dois atos foi.
      dados_novos: {
        status: 'CANCELADA',
        cancelado_por_id: cancelPor,
        cancelado_por_nome: user?.nome || user?.email || null,
        automatico: false,
      },
      justificativa: motivo,
    });
  } catch (e) {
    console.warn(`[NC] cancelamento ${id} gravado, mas a trilha falhou: ${e.message}`);
  }

  const doc = await obterNaoConformidade(db, id);
  return {
    ...doc,
    cancelamento: {
      estado_anterior: estadoAnterior,
      execucao_estado_anterior: execucaoAnterior,
      mensagem: CANC_MSG_DECIDIDA,
    },
  };

}
/**
 * A regua das recusas, em funcao PURA da linha — usada na leitura (para a mensagem) e de novo
 * depois do claim (para escolher a mensagem quando a linha mudou no meio).
 *
 * ⚠️ REESCRITA NO FIX-ROUND DA FASE 5, e a mudanca e de ESCOPO, nao de estilo. Duas lentes
 * independentes mostraram, por sonda executada, que cancelar NC `ABERTA` silencia divergencia
 * VIVA: o documento morre sem decisao, o item sai do cartao D6, o gancho nao reabre (a RN-05 o
 * trata como encerramento) e NAO EXISTE tela de abertura manual. A RN-01 era escopo ACRESCENTADO
 * — o beco que a etapa existe para resolver e so `DECIDIDA` + `PENDENTE` —, e era ela que abria
 * essa porta. Ver a letra B: o que foi escolhido, e o que foi descartado.
 *
 * E a antiga `JA_LIBEROU` MENTIA em dois casos medidos: NC de origem `RECEBIMENTO` decidida
 * `ACEITAR` e NC manual de inspecao decidida `ACEITAR_SOB_DESVIO` ficam
 * `DECIDIDA + NAO_SE_APLICA` com **nada movido** — sem movimentacao, sem `liberacao_nc_em` —, e a
 * frase afirmava "ja liberou o material". A regua agora e de ESTADO, nao de efeito de estoque, e
 * por isso a frase pode ser verdadeira em todos os casos que ela cobre.
 */
function recusaDoCancelamento(nc) {
  // Ordem importa: a execucao registrada e a causa mais forte, e uma NC executada tem tambem
  // `execucao_estado` preenchido — se `SEM_PENDENCIA` viesse antes, a mensagem trocaria de causa.
  if (nc.execucao_em) return CANC_RECUSA.JA_EXECUTADA;
  if (nc.status === 'CANCELADA') return CANC_RECUSA.JA_CANCELADA;
  if (nc.status !== 'DECIDIDA') return CANC_RECUSA.NAO_DECIDIDA;
  if (nc.execucao_estado !== EXECUCAO_PENDENTE) return CANC_RECUSA.SEM_PENDENCIA;
  return null;
}
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
  registrarExecucao,
  efeitoExecucaoPrevisto,
  // Etapa 69 — consumidos por `scrapDisposalService` (solicitar do reprovado e a segunda assinatura).
  sucateamentoDoReprovadoPrevisto,
  retencaoDaInspecaoJaSaiu,
  origemDaEntradaDaInspecao,
  resolverLoteDaInspecao,
  carregarLoteDoReprovado,
  getInspecao,
  sucateamentoAbertoDaNc,
  SUC_RECUSA,
  cancelarNaoConformidade,
  listarNaoConformidades,
  obterNaoConformidade,
  NC_ORIGENS,
  NC_REFERENCIA_TIPOS,
  NC_TIPOS,
  NC_DECISOES,
  NC_STATUS,
  DECISOES_QUE_LIBERAM,
  DECISOES_COM_EXECUCAO,
  DECISAO_QUE_DEVOLVE,
  EXECUCAO_PENDENTE,
  EXECUCAO_EXECUTADA,
  EXECUCAO_NAO_SE_APLICA,
  CANC_RECUSA,
  CANC_MSG_DECIDIDA,
  EFEITO_MSG,
  EFEITO_EXEC_MSG,
  EXEC_RECUSA,
  MOTIVO_LIBERACAO,
  MOTIVO_DEVOLUCAO_FORNECEDOR,
  LIMITE_PADRAO,
  LIMITE_TETO,
  STATUS_RECEBIMENTO_PROCESSADO,
};
