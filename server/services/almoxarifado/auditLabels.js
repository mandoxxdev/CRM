/**
 * Vocabulario da trilha de auditoria do almoxarifado — Etapa 22, Task 1 (contrato C3).
 *
 * Traduz `entidade` e `acao` do log para portugues de gente, agrupa SINONIMOS (RN-06) e calcula
 * o de/para de UMA linha de auditoria (RN-07). Funcao pura, sem banco e sem HTTP — mesmo padrao
 * de `configDiff.js` e `movementTypes.js`.
 *
 * ── POR QUE `alteracoesDaLinha` NAO E `configDiff.calcularDiff` ──────────────────────────────
 *
 * Foi a tentacao obvia ("fonte unica") e e o achado A1 da revisao adversarial, o mais grave do
 * plano. `calcularDiff` foi escrita para a GRAVACAO do `PUT /configuracoes`, onde `anteriores` e
 * a tabela INTEIRA (~45 chaves) e `novos` e o payload (18) — por isso o cabecalho dela
 * (configDiff.js:9-13) diz, de proposito, que itera so `Object.keys(novos)` e IGNORA chave que
 * so existe em `anteriores`. Ali isso esta certo: iterar a uniao reportaria ~27 chaves
 * "removidas" em todo save.
 *
 * Numa linha de AUDITORIA a forma e outra, e a mesma regra produz dois defeitos:
 *
 *   1. APAGA A MUDANCA DO SEGREDO. A Etapa 19 ja grava o diff MASCARADO, entao quando a senha
 *      muda os DOIS lados valem '(alterado)'; o `if (String(bruto) === String(novo)) continue`
 *      de `calcularDiff` derruba a chave e a tela mostraria `dias: 30 -> 45` escondendo que a
 *      senha foi trocada — o oposto exato da RN-08.
 *   2. PERDE O UNICO DE/PARA REAL. Numa exclusao de requisicao (`ant={status:PENDENTE}`,
 *      `nov={numero:REQ-1}`) o `status` anterior — a unica alteracao de verdade — e descartado
 *      porque a chave nao esta em `novos`.
 *
 * LEITURA e GRAVACAO sao problemas diferentes: `configDiff` continua sendo fonte unica da
 * gravacao; a regua daqui e UNIAO das chaves, `null` explicito para "ausente", NENHUM
 * remascaramento e `[]` quando os dois lados sao vazios.
 *
 * ── POR QUE NAO HA FILTRO DE IGUALDADE ───────────────────────────────────────────────────────
 *
 * Campo com o mesmo valor dos dois lados APARECE na lista, e e intencional: e exatamente assim
 * que a troca de senha mascarada continua visivel (defeito 1 acima). O custo e que campo de
 * CONTEXTO tambem aparece — a foto de material grava `dados_novos: {foto, codigo, nome}` contra
 * `dados_anteriores: {foto}`, entao `codigo` e `nome` saem como `null -> valor`. Isso e o que
 * esta gravado, dito sem invencao; o teste de integracao da Task 4 fixa o CONJUNTO INTEIRO das
 * alteracoes justamente para que esse contexto fique visivel no contrato em vez de virar
 * surpresa. Enxugar contexto seria trabalho da ESCRITA (gravar menos), nao da leitura.
 */

/**
 * Entidades: os 25 valores literais de `entidade: '<nome>'` em routes/ e services/ (verificado:
 * nenhum call site monta a entidade dinamicamente, ao contrario de `acao`).
 */
const ROTULOS_ENTIDADE = Object.freeze({
  almoxarifado: 'Almoxarifado',
  // Etapa 26: o catalogo de categorias virou cadastro editavel e passou a auditar. Sem esta
  // linha o teste de cobertura de entidades deste vocabulario (auditLabels.api.test.js) fica
  // vermelho — de proposito: ele varre `entidade: '<nome>'` em routes/ e services/ e exige
  // rotulo para todo literal, para que nenhuma entidade nova apareca crua no filtro da tela.
  categoria: 'Categoria',
  centro_custo: 'Centro de custo',
  conferencia: 'Conferência',
  configuracao: 'Configuração',
  devolucao: 'Devolução',
  familia: 'Família',
  ferramenta: 'Ferramenta',
  localizacao: 'Localização',
  lote: 'Lote',
  material: 'Material',
  material_cliente: 'Material de cliente',
  movimentacao: 'Movimentação',
  notificacao: 'Notificação',
  perfil_almoxarifado_usuario: 'Perfil de usuário',
  recebimento: 'Recebimento',
  remessa_terceiro: 'Remessa a terceiro',
  requisicao: 'Requisição',
  reserva: 'Reserva',
  serie: 'Série',
  setor: 'Setor',
  setor_permissao: 'Permissão de setor',
  sobra: 'Sobra',
  solicitacao_compra: 'Solicitação de compra',
  sucateamento: 'Sucateamento',
  tipo_material: 'Tipo de material',
});

/**
 * Grupos de acao: rotulo -> verbos crus. Um rotulo por grupo, e o rotulo e a CHAVE do filtro da
 * tela — por isso nenhum rotulo pode se repetir entre grupos.
 *
 * Os TRES grupos com mais de um verbo sao sinonimos medidos nesta base (RN-06), nao arrumacao
 * estetica: a mesma acao ganhou nome diferente em etapas diferentes, e sem agrupar a tela
 * mostraria duas opcoes para o mesmo ato e cada filtro traria METADE das linhas.
 *
 *   'Criação'  = CRIACAO + CRIAR                     (CRIAR so em purchaseService.js:33,381)
 *   'Edição'   = EDICAO + ATUALIZACAO + ATUALIZAR
 *   'Exclusão' = EXCLUSAO + DESATIVACAO
 *
 * O grupo 'Exclusão' merece nota porque uma versao anterior do plano mandava o CONTRARIO
 * (achado A7), com a justificativa de que "desativar e `ativo = 0` e e reversivel por
 * REATIVACAO". Medido: os DOIS sao `ativo = 0` (EXCLUSAO em tipo_material schema/rota :1765,
 * localizacao :1973, setor :2136, familia :2374; DESATIVACAO em material :635) — e a
 * reversibilidade aponta para o verbo OPOSTO ao que a frase dizia: REATIVACAO existe para
 * `localizacao` e `serie`, que recebem EXCLUSAO, e NAO existe para `material`, o unico que
 * recebe DESATIVACAO. Sao o mesmo ato com nome diferente por entidade. A inconsistencia do dado
 * continua visivel na legenda secundaria da linha, que mostra o verbo cru.
 */
const GRUPOS_ACAO = congelarGrupos([
  { rotulo: 'Criação', verbos: ['CRIACAO', 'CRIAR'] },
  { rotulo: 'Edição', verbos: ['EDICAO', 'ATUALIZACAO', 'ATUALIZAR'] },
  { rotulo: 'Exclusão', verbos: ['EXCLUSAO', 'DESATIVACAO'] },
  { rotulo: 'Reativação', verbos: ['REATIVACAO'] },
  { rotulo: 'Cópia', verbos: ['COPIA'] },
  { rotulo: 'Inclusão em lote', verbos: ['INCLUSAO_EM_LOTE'] },

  // Requisição / aprovação
  { rotulo: 'Aprovação', verbos: ['APROVACAO'] },
  { rotulo: 'Aprovação por valor', verbos: ['APROVACAO_VALOR'] },
  { rotulo: 'Rejeição', verbos: ['REJEICAO'] },
  { rotulo: 'Rejeição por valor', verbos: ['REJEICAO_VALOR'] },
  { rotulo: 'Cancelamento', verbos: ['CANCELAMENTO'] },
  { rotulo: 'Conclusão', verbos: ['CONCLUSAO'] },
  { rotulo: 'Encerramento', verbos: ['ENCERRAMENTO'] },
  { rotulo: 'Mudança de status', verbos: ['MUDANCA_STATUS'] },
  { rotulo: 'Assinatura de entrega', verbos: ['ASSINATURA_ENTREGA'] },
  { rotulo: 'Confirmação de recebimento', verbos: ['CONFIRMACAO_RECEBIMENTO'] },

  // Recebimento de material — os 5 verbos de transicao (receiptService, `acao.toUpperCase()`)
  // e o PROCESSAR_NOTA, que e gravado por outro caminho (processarNota).
  { rotulo: 'Início da conferência', verbos: ['INICIAR_CONFERENCIA'] },
  { rotulo: 'Fim da conferência', verbos: ['FINALIZAR_CONFERENCIA'] },
  { rotulo: 'Encaminhamento para compras', verbos: ['ENCAMINHAR_COMPRAS'] },
  { rotulo: 'Fim da etapa de compras', verbos: ['FINALIZAR_COMPRAS'] },
  { rotulo: 'Início do faturamento', verbos: ['INICIAR_FATURAMENTO'] },
  { rotulo: 'Processamento da nota', verbos: ['PROCESSAR_NOTA'] },
  { rotulo: 'Recebida', verbos: ['RECEBIDA'] },

  // Conferência de inventário (routes/almoxarifado.js, ternário — invisível para a varredura)
  { rotulo: 'Contagem', verbos: ['CONTAGEM'] },
  { rotulo: 'Recontagem', verbos: ['RECONTAGEM'] },
  { rotulo: 'Regularização', verbos: ['REGULARIZACAO'] },
  { rotulo: 'Reencontro', verbos: ['REENCONTRO'] },

  // Estoque / série / ferramenta
  { rotulo: 'Ajuste', verbos: ['AJUSTE'] },
  { rotulo: 'Compensação', verbos: ['COMPENSACAO'] },
  { rotulo: 'Bloqueio', verbos: ['BLOQUEIO'] },
  { rotulo: 'Desbloqueio', verbos: ['DESBLOQUEIO'] },
  { rotulo: 'Empréstimo', verbos: ['EMPRESTIMO'] },
  { rotulo: 'Calibração', verbos: ['CALIBRACAO'] },
  { rotulo: 'Início de manutenção', verbos: ['MANUTENCAO_INICIO'] },
  { rotulo: 'Fim de manutenção', verbos: ['MANUTENCAO_FIM'] },
  { rotulo: 'Ocorrência', verbos: ['OCORRENCIA'] },
  { rotulo: 'Expiração', verbos: ['EXPIRACAO'] },
  { rotulo: 'Liberação por vencimento', verbos: ['LIBERACAO_VENCIMENTO'] },
  { rotulo: 'Reenvio', verbos: ['REENVIAR'] },
  { rotulo: 'Estorno de entrada', verbos: ['ESTORNO_ENTRADA'] },
  { rotulo: 'Estorno de saída', verbos: ['ESTORNO_SAIDA'] },

  // Remessa a terceiro
  { rotulo: 'Envio', verbos: ['ENVIO'] },
  { rotulo: 'Retorno', verbos: ['RETORNO'] },
  { rotulo: 'Retorno parcial', verbos: ['ESTADO_PARCIAL'] },
  { rotulo: 'Transformação', verbos: ['TRANSFORMACAO'] },
  { rotulo: 'Transferência', verbos: ['TRANSFERENCIA'] },

  // Tipos de MOVIMENTACAO — `stockService.js:1367-1372` audita `acao: tipo`, entao cada um dos
  // 18 de `movementTypes.js` vira verbo de auditoria. Sao invisiveis para qualquer varredura de
  // literal, e juntos sao a maior produtora de linhas do modulo.
  { rotulo: 'Entrada', verbos: ['ENTRADA'] },
  { rotulo: 'Entrada por compra', verbos: ['ENTRADA_COMPRA'] },
  { rotulo: 'Entrada manual', verbos: ['ENTRADA_MANUAL'] },
  { rotulo: 'Entrada por devolução', verbos: ['ENTRADA_DEVOLUCAO'] },
  { rotulo: 'Entrada de retalho', verbos: ['ENTRADA_RETALHO'] },
  { rotulo: 'Devolução', verbos: ['DEVOLUCAO'] },
  { rotulo: 'Ajuste positivo', verbos: ['AJUSTE_POSITIVO'] },
  { rotulo: 'Retorno de transformação', verbos: ['RETORNO_TRANSFORMACAO'] },
  { rotulo: 'Saída', verbos: ['SAIDA'] },
  { rotulo: 'Saída para produção', verbos: ['SAIDA_PRODUCAO'] },
  { rotulo: 'Saída para montagem', verbos: ['SAIDA_MONTAGEM'] },
  { rotulo: 'Saída para assistência', verbos: ['SAIDA_ASSISTENCIA'] },
  { rotulo: 'Ajuste negativo', verbos: ['AJUSTE_NEGATIVO'] },
  { rotulo: 'Sucata', verbos: ['SUCATA'] },
  { rotulo: 'Perda', verbos: ['PERDA'] },
  { rotulo: 'Devolução ao cliente', verbos: ['DEVOLUCAO_CLIENTE'] },
  { rotulo: 'Perda em terceiro', verbos: ['PERDA_TERCEIRO'] },
  { rotulo: 'Consumo em terceiro', verbos: ['CONSUMO_TERCEIRO'] },
]);

/**
 * Congelamento em PROFUNDIDADE (achado A8 da revisao). `Object.freeze` e RASO: congelar so o
 * array externo deixaria `GRUPOS_ACAO[0].verbos.push('X')` funcionar, e e justamente esse array
 * que a Task 2 espalha nos placeholders do `IN` — um push envenenaria o filtro em silencio.
 */
function congelarGrupos(grupos) {
  return Object.freeze(grupos.map((g) => Object.freeze({
    rotulo: g.rotulo,
    verbos: Object.freeze([...g.verbos]),
  })));
}

// Mapas de busca em `Map`, nao objeto literal: com objeto, `rotularAcao('constructor')` cairia
// no prototipo e devolveria uma FUNCAO no lugar do rotulo.
const MAPA_ACAO = new Map();
const MAPA_GRUPO = new Map();
for (const g of GRUPOS_ACAO) {
  if (MAPA_GRUPO.has(g.rotulo)) throw new Error(`rotulo de acao duplicado: ${g.rotulo}`);
  MAPA_GRUPO.set(g.rotulo, g.verbos);
  for (const v of g.verbos) {
    if (MAPA_ACAO.has(v)) throw new Error(`verbo em dois grupos: ${v}`);
    MAPA_ACAO.set(v, g.rotulo);
  }
}
const MAPA_ENTIDADE = new Map(Object.entries(ROTULOS_ENTIDADE));

/**
 * Verbo sem rotulo devolve ELE MESMO, nunca '' nem undefined: numa trilha de auditoria, sumir
 * com o verbo esconderia o ato. O teste de cobertura e que garante que isso nao acontece —
 * aqui e so a rede de seguranca de producao.
 */
function rotularAcao(verbo) {
  return MAPA_ACAO.get(verbo) || verbo;
}

function rotularEntidade(entidade) {
  return MAPA_ENTIDADE.get(entidade) || entidade;
}

/** Rotulo inexistente devolve [] — nunca undefined, que viraria crash no spread do filtro. */
function verbosDoGrupo(rotulo) {
  return MAPA_GRUPO.get(rotulo) || [];
}

/**
 * Aceita string JSON (e como a coluna TEXT `dados_*` chega do banco), objeto ja parseado, ou
 * null/undefined. Qualquer coisa que nao vire objeto simples — JSON quebrado, array, escalar —
 * conta como lado VAZIO: uma linha malformada nao pode derrubar a listagem inteira da auditoria.
 */
function ladoComoObjeto(valor) {
  if (valor === null || valor === undefined) return {};
  let obj = valor;
  if (typeof valor === 'string') {
    if (!valor.trim()) return {};
    try { obj = JSON.parse(valor); } catch (e) { return {}; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  return obj;
}

/**
 * O de/para de UMA linha de auditoria (RN-07) — a regua de LEITURA.
 *
 * UNIAO das chaves dos dois lados, na ordem "anteriores primeiro, depois as chaves novas".
 * Chave ausente de um lado vira `null` explicito; nenhum valor e transformado (RN-08: se um dia
 * gravarem segredo cru, o lugar de consertar e a ESCRITA). Os dois lados vazios dao `[]`, e a
 * tela mostra "sem detalhes registrados" — ha call sites que gravam nenhum dos dois
 * (receiptService.js:236-239, os 5 verbos de transicao).
 *
 * Limite conhecido e aceito: chave gravada com valor `null` fica indistinguivel de chave
 * ausente, porque as duas saem como `null`. Distinguir exigiria um sentinela na resposta, e o
 * ganho na tela seria nenhum.
 */
function alteracoesDaLinha(anteriores, novos) {
  const ant = ladoComoObjeto(anteriores);
  const nov = ladoComoObjeto(novos);
  const campos = [...new Set([...Object.keys(ant), ...Object.keys(nov)])];
  return campos.map((campo) => ({
    campo,
    de: Object.prototype.hasOwnProperty.call(ant, campo) ? ant[campo] : null,
    para: Object.prototype.hasOwnProperty.call(nov, campo) ? nov[campo] : null,
  }));
}

module.exports = {
  ROTULOS_ENTIDADE,
  GRUPOS_ACAO,
  rotularEntidade,
  rotularAcao,
  verbosDoGrupo,
  alteracoesDaLinha,
};
