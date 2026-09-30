/**
 * Etapa 16, Task 1 — registro declarativo de alertas (RN-01: fonte unica).
 *
 * Cada entrada declara a condicao (`listar`, AO VIVO — a MESMA funcao para a varredura diaria
 * e para a central da Task 2), o dedupe estavel (tabela C3 do plano), a config de dias e os
 * textos do e-mail. Entrada nova aqui = alerta novo completo (varredura + central + config),
 * sem tocar em mais nada.
 *
 * Requires LAZY de proposito: `purchaseService` requer `notificationQueueService` no topo e
 * `inspectionService` requer `stockService` (que tambem requer a fila no topo) — um require de
 * topo aqui fecharia o ciclo notificationQueueService -> alertRegistry -> purchaseService ->
 * notificationQueueService e um dos lados capturaria `{}` mid-load (mesmo motivo documentado
 * no cabecalho de notificationQueueService.js). `toolService` fica lazy por uniformidade.
 *
 * A maquina do minimo/zerado (`alertService`) NAO passa por aqui — restricao global do plano.
 */
const { dbAll, dbGet } = require('./db');
const { TRANSICOES } = require('./requisitionStateMachine');
// divergencia.js so exporta constantes/formula (sem require de servicos) — top-level seguro.
const { divergenciaRealSql } = require('./divergencia');

/**
 * Status em que uma requisicao pode estar ATRASADA — DERIVADO da maquina de estados, nunca
 * hardcodado (achado Critico da revisao do plano: a lista escrita a mao trazia 'APROVADA',
 * literal que nao existe no banco — o real e 'APROVADO' — e teste e SQL errariam JUNTOS,
 * falso-verde de producao). Ficam fora: RASCUNHO (ainda nao pedida de verdade) e os terminais
 * ENTREGUE/ENCERRADA/CANCELADO/REJEITADO (nao ha mais o que atrasar). ENCERRADA/CANCELADO/
 * REJEITADO nem sao chaves de TRANSICOES (terminais sem saida), mas ficam na lista de exclusao
 * por robustez se um dia ganharem seta.
 */
const STATUS_FORA_DO_ATRASO = ['RASCUNHO', 'ENTREGUE', 'ENCERRADA', 'CANCELADO', 'REJEITADO'];
const STATUS_REQUISICAO_ATRASAVEL = Object.keys(TRANSICOES)
  .filter((s) => !STATUS_FORA_DO_ATRASO.includes(s));

// Mesmo padrao local de purchaseService.lerConfigNumero / notificationQueueService (duplicacao
// intencional registrada la: unificar os leitores e limpeza propria, fora desta etapa).
async function lerConfigNumero(db, chave, fallback) {
  const row = await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [chave]);
  const n = parseFloat(row?.valor);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Resolve a janela de dias de uma entrada (null quando o alerta nao usa janela) — C2. */
async function resolverDias(db, entrada) {
  if (!entrada.configDias) return null;
  return lerConfigNumero(db, entrada.configDias.chave, entrada.configDias.default);
}

/**
 * A regua REAL do relatorio `materiais-sem-endereco`, EXTRAIDA de routes/almoxarifado/
 * extended.js para fonte unica (achado Critico 2 da revisao do plano: a primeira versao do
 * design descrevia OUTRA regua e alerta e relatorio de mesmo nome mostrariam conjuntos
 * diferentes). Comportamento identico ao do relatorio — SELECT m.*, ORDER BY m.codigo.
 *
 * Etapa 8, Task 1, classe C da auditoria: NAO filtra o dono de proposito. Enderecar material
 * do cliente e tao necessario quanto enderecar o nosso — a chapa dele precisa de prateleira
 * de verdade. Filtrar aqui esconderia trabalho real do almoxarife. (RN-07: cliente DENTRO do
 * sem-endereco, FORA de sem-consumo/excessivo.)
 */
async function listarMateriaisSemEndereco(db) {
  return dbAll(db, `
    SELECT m.* FROM materiais_almoxarifado m
    WHERE m.ativo = 1 AND m.localizacao_padrao_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM estoque_saldo_almoxarifado s
      WHERE s.material_id = m.id AND s.localizacao_id IS NOT NULL AND s.quantidade > 0
    )
    ORDER BY m.codigo
  `);
}

/** AAAA-MM em UTC — casa com o toISOString dos testes e com o date('now') UTC do SQLite. */
function mesAtual() {
  return new Date().toISOString().slice(0, 7);
}

/** Semana ISO-8601 em UTC (o ano e o ISO do meio da semana, nao o civil — virada de ano). */
function semanaIso(agora = new Date()) {
  const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
  const diaSemana = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana);
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil((((d - inicioAno) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}

/**
 * created_at do SQLite vem "YYYY-MM-DD HH:MM:SS" em UTC, sem o "T" — mesma armadilha (e mesma
 * solucao) de purchaseService.antigaOuNunca: so concatena "Z" quando a string nao tem "T",
 * senao um ISO ja valido viraria "...ZZ" (Date invalido) e cairia no ramo "recente" em
 * silencio.
 */
function maisVelhoQueDias(dataStr, dias) {
  if (dataStr == null) return false;
  const s = String(dataStr);
  const iso = s.includes('T') ? s : `${s.replace(' ', 'T')}Z`;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t < Date.now() - dias * 24 * 60 * 60 * 1000;
}

// ── Etapa 17 — os tres `listar` de evento, DUAL-MODE (correcao Importante da revisao do
// plano): com `{ dias }` filtram a janela (central + varredura de rede); com o id do fato
// (`{ inspecaoId }` / `{ recebimentoId }` / `{ conferenciaId }`) devolvem a(s) linha(s)
// daquele fato para o gancho do ato — a MESMA query nos dois modos, senao nasceriam duas
// definicoes da condicao (a classe de bug que divergencia.js mata). Exportados porque os
// ganchos da Task 2 chamam o modo por id direto.

/**
 * MATERIAL_REPROVADO (RN-03): inspecoes com `quantidade_reprovada > 0`. Janela por
 * `data_inspecao` (DATETIME UTC do SQLite — comparacao de string com datetime('now') e
 * consistente).
 *
 * ── Etapa 45 (T5): `excluirComExecucao` e OPT-IN, pelo MESMO motivo medido da irma abaixo ────
 * Esta funcao e DUAL-MODE, e o modo `{ inspecaoId }` NAO e a populacao do cartao: e o GANCHO DO
 * ATO — `inspectionService.js:341` o chama logo depois de gravar a decisao da inspecao para
 * montar a linha do e-mail que sai na hora. Excluir "inspecao ja devolvida" por DENTRO desta
 * funcao calaria aquele gancho, e essa forma errada ja foi MEDIDA na Etapa 43 em
 * `listarDivergenciasRecebimento` (o cabecalho dela conta o cenario A1 que morre). Por isso o
 * terceiro modo e opt-in e QUEM O LIGA e so o `listar` da entrada do alerta.
 *
 * ⚠️ A REGUA ABAIXO E A DA PRIMEIRA VERSAO, E FOI SUBSTITUIDA NO FIX-ROUND DA FASE 5. Fica
 * escrita porque o raciocinio dela esta certo e ainda ensina POR QUE nenhuma das duas condicoes
 * sozinha servia — o que ele nao viu e que as duas juntas continuam medindo INTENCAO REGISTRADA,
 * e nao MATERIAL MOVIDO. A regua atual e `i.devolucao_fornecedor_em IS NULL`; ver o comentario
 * dentro da funcao.
 *
 * A regua antiga exigia as duas condicoes, e nenhuma das duas sobrava:
 *   · `decisao = 'DEVOLVER'` — executar uma `SUBSTITUICAO`, um `SUCATEAR` ou uma
 *     `ANALISE_ENGENHARIA` e registrar um ato que NAO devolveu nada ao fornecedor. So
 *     `execucao_estado` na regua faria qualquer execucao calar o aviso do material reprovado.
 *   · `execucao_estado = 'EXECUTADA'` — decidir DEVOLVER e INTENCAO (a NC nasce `PENDENTE`, T2).
 *     So a `decisao` na regua esconderia a caixa que AINDA ESTA no galpao, que e exatamente o
 *     que o cartao existe para mostrar.
 *
 * ⚠️ O que esta flag NAO e: ela nao e "tirar da fila de pendencia". O cartao tem janela de 7 dias
 * (`alerta_eventos_janela_dias`) e a inspecao sai dele sozinha passados os 7 dias, executada ou
 * nao — a fila do que falta executar e `GET /nao-conformidades?execucao=PENDENTE` (T3). O e-mail
 * tambem nao esta em jogo: `dedupeChave: reprovado-<inspecao_id>` ja saiu no instante da
 * reprovacao, 1x para sempre. O que a flag faz e so nao cobrar na central o que ja foi feito.
 *
 * Literais em vez de `nonConformityService.DECISAO_QUE_DEVOLVE`/`EXECUCAO_EXECUTADA`: mesma
 * escolha (e mesmo motivo — nenhum require de servico neste SQL) de
 * `listarNaoConformidadesParadas` com o seu `'ABERTA'`. A copia e guardada contra deriva pelo
 * cenario (1) de `alertaReprovadoExecutado.api.test.js`, que le as duas constantes do servico.
 * `status` fica FORA da regua, e a razao MUDOU na Etapa 46 — a conclusao continua a mesma.
 * ~~hoje o unico escritor de `CANCELADA` cancela NC `ABERTA` (`nonConformityService.js:477`),
 * entao uma NC EXECUTADA nunca e cancelada~~ — isso valeu ate a Etapa 45 e **deixou de valer**:
 * a Etapa 46 criou `cancelarNaoConformidade`, que cancela NC `ABERTA` **e** `DECIDIDA`. (E o
 * `:477` daquela frase ja estava deslocado: o `UPDATE` do cancelamento automatico mora no corpo de
 * `sincronizarNaoConformidadeQuantidade`.)
 * **O que continua verdade, e e o que sustenta a regua:** NC com execucao REGISTRADA nao e
 * cancelavel — `cancelarNaoConformidade` recusa com `execucao_em IS NOT NULL` —, e se um dia for,
 * o material ja saiu do galpao do mesmo jeito. A regua aqui e `devolucao_fornecedor_em`, que mede
 * MATERIAL MOVIDO, e nenhum cancelamento a apaga.
 */
async function listarReprovados(db, { dias, inspecaoId, excluirComExecucao } = {}) {
  const filtro = inspecaoId
    ? 'AND i.id = ?'
    : `AND i.data_inspecao >= datetime('now', '-' || ? || ' days')`;
  // ⚠️ A REGUA MUDOU NO FIX-ROUND DA FASE 5, E A VERSAO ANTERIOR FICA DESCRITA PORQUE ELA
  // PARECIA CERTA — o docblock acima defende, com razao, que `decisao` e `execucao_estado`
  // JUNTAS bastam. DOIS revisores independentes mostraram, por execucao, que nao bastam: as duas
  // medem INTENCAO REGISTRADA, e o cartao cobra MATERIAL QUE AINDA ESTA NO GALPAO.
  //
  //   · execucao com efeito `NENHUMA` (NC aberta a mao sobre a mesma inspecao — RN-06): 200,
  //     nada sai, `execucao_estado` vira EXECUTADA, e o cartao calava com `bloqueada = 3`;
  //   · execucao com efeito `SEM_SALDO` (bloqueio drenado, fisico insuficiente, inativo): idem;
  //   · e o CRITICAL do epsilon: a devolucao legitima que virava `SEM_SALDO` calava o cartao,
  //     que era a ULTIMA superficie que ainda cobraria o material esquecido.
  //
  // `i.devolucao_fornecedor_em` resolve os tres de uma vez, e e mais forte que as duas condicoes
  // que substitui: ela so e carimbada dentro de `executarDevolucao`, DEPOIS do claim e so quando
  // o motor de fato baixou (o rollback a apaga se o motor falhar) — e esse caminho ja exige
  // `decisao = 'DEVOLVER'` e a RN-06 inteira. Ou seja: a coluna ja E a conjuncao, medida no
  // resultado em vez de declarada na intencao. Deixa de ser preciso ler a NC.
  const semExecucao = excluirComExecucao ? 'AND i.devolucao_fornecedor_em IS NULL' : '';
  return dbAll(db, `
    SELECT i.id AS inspecao_id, m.codigo AS material_codigo, m.nome AS material_nome,
      i.quantidade_reprovada, i.encaminhamento, r.numero AS recebimento_numero, r.nota_fiscal,
      i.data_inspecao, i.responsavel_nome
    FROM inspecoes_recebimento_almoxarifado i
    JOIN recebimentos_material_itens_almoxarifado ri ON ri.id = i.recebimento_item_id
    JOIN recebimentos_material_almoxarifado r ON r.id = ri.recebimento_id
    JOIN materiais_almoxarifado m ON m.id = ri.material_id
    WHERE i.quantidade_reprovada > 0
      ${filtro}
      ${semExecucao}
    ORDER BY i.data_inspecao DESC, i.id DESC`, [inspecaoId ?? dias]);
}

/**
 * DIVERGENCIA_RECEBIMENTO (RN-04): itens com quantidade recebida REGISTRADA e diferente da
 * esperada pela regua float-safe `divergenciaRealSql` (segundo consumidor SQL da formula,
 * declarado no header de divergencia.js). Janela por `COALESCE(r.updated_at, r.created_at)`
 * (achado CRITICO da revisao: `created_at` puro deixaria recebimento antigo conferido HOJE
 * fora da central E da rede de seguranca; o item nao tem timestamp proprio — limitacao
 * declarada: qualquer toque posterior no recebimento renova a presenca na central; o dedupe
 * por item segura o e-mail).
 *
 * ── Etapa 43 (T4, D6): `excluirComNC` e OPT-IN, e isso NAO e estilo ──────────────────────────
 * Esta funcao e o DETECTOR do modulo, nao a populacao de um cartao: os dois modos que ja
 * existiam sao consumidos por `avisarDivergenciasDoRecebimento` (receiptService `:843` e
 * `:1012`), que dispara o aviso NO ATO nos dois escritores de `quantidade_recebida`. Excluir
 * "item que ja tem NC" por DENTRO dela — que foi o que a primeira versao do design mandava —
 * cala o gancho do ato a partir da segunda escrita e MATA o cenario A1 de
 * `alertaEventoGanchos.api.test.js:289-318` ("errar de novo, PIOR, avisa de novo"), que e o bug
 * que a Etapa 17 pagou. MEDIDO, nao suposto: a T4 rodou a forma errada e contou os arquivos que
 * caem. Por isso o terceiro modo e opt-in e QUEM O LIGA e so o `listar` da entrada do alerta.
 *
 * A regua da exclusao e `status <> 'CANCELADA'`, e a escolha e do mesmo tamanho: a NC CANCELADA
 * e a divergencia que o operador CORRIGIU e depois quebrou de novo (RN-05 + RN-10) — tratar o
 * documento morto como "ja documentado" esconderia justamente o erro NOVO.
 *
 * ⚠️ ETAPA 46 — A REGUA GANHOU UMA SEGUNDA METADE, e o paragrafo acima ficou VERDADEIRO SO PARA
 * O CANCELAMENTO AUTOMATICO. A regua atual e
 * `status <> 'CANCELADA' OR (cancelado_por_id IS NOT NULL AND decidido_em IS NOT NULL)` — e a
 * segunda metade ganhou o `decidido_em` no FIX-ROUND da Fase 5: duas lentes mediram que, sem ele,
 * cancelar uma NC ABERTA tirava do cartao uma divergencia VIVA sobre a qual ninguem decidiu nada.
 * Hoje o cancelamento humano so alcanca documento DECIDIDO, mas a condicao fica escrita nas duas
 * metades porque e ela que impede o silencio de voltar se o escopo do cancelamento se alargar.
 *
 * O porque: a Etapa 46 criou o cancelamento HUMANO (`cancelarNaoConformidade`), em que a
 * divergencia NAO foi corrigida — ela continua de pe, e uma pessoa encerrou o documento. Com a
 * regua antiga o item voltaria ao cartao como divergencia NAO DOCUMENTADA, e nao existe porta para
 * documenta-la: nao ha tela de abertura manual de NC, e o gancho automatico tambem para de reabrir
 * (`getUltimaEncerrada` passou a tratar a cancelada-por-pessoa como encerramento). Seria o cartao
 * cobrando o que ninguem pode atender.
 *
 * "Cancelado por PESSOA" e um ENCERRAMENTO, como decidir — e os TRES consumidores do estado
 * passam a trata-lo assim. Os outros dois estao em `nonConformityService.js`
 * (`getUltimaEncerrada` e o carimbo de `fato_superado_em`), e o docblock de la conta a historia
 * inteira com o cenario de cada furo que aparece se um deles ficar de fora.
 */
async function listarDivergenciasRecebimento(db, { dias, recebimentoId, excluirComNC } = {}) {
  const filtro = recebimentoId
    ? 'AND ri.recebimento_id = ?'
    : `AND COALESCE(r.updated_at, r.created_at) >= datetime('now', '-' || ? || ' days')`;
  const semNc = excluirComNC ? `AND NOT EXISTS (
      SELECT 1 FROM nao_conformidades_almoxarifado nc
      WHERE nc.referencia_tipo = 'RECEBIMENTO_ITEM' AND nc.referencia_id = ri.id
        AND nc.tipo = 'QUANTIDADE'
        AND (nc.status <> 'CANCELADA'
             OR (nc.cancelado_por_id IS NOT NULL AND nc.decidido_em IS NOT NULL)))` : '';
  return dbAll(db, `
    SELECT ri.id AS item_id, ri.recebimento_id, m.codigo AS material_codigo,
      m.nome AS material_nome, ri.quantidade_esperada, ri.quantidade_recebida,
      (ri.quantidade_recebida - ri.quantidade_esperada) AS divergencia,
      r.numero AS recebimento_numero, r.nota_fiscal
    FROM recebimentos_material_itens_almoxarifado ri
    JOIN recebimentos_material_almoxarifado r ON r.id = ri.recebimento_id
    JOIN materiais_almoxarifado m ON m.id = ri.material_id
    WHERE ri.quantidade_recebida IS NOT NULL
      AND ${divergenciaRealSql('ri.quantidade_recebida - ri.quantidade_esperada')}
      ${filtro}
      ${semNc}
    ORDER BY ri.id ASC`, [recebimentoId ?? dias]);
}

/**
 * NAO_CONFORMIDADE_ABERTA (Etapa 43, T4, D6): NCs ainda sem decisao ha mais dias que o
 * configurado. Ate aqui o modulo abria o documento sozinho (T3) e ninguem cobrava a decisao —
 * NC ABERTA ficava ABERTA para sempre, em silencio, que e o beco "Atrasado para sempre" da
 * Etapa 42 em outra roupa.
 *
 * ⚠️ SQL PROPRIO em vez de `nonConformityService.listarNaoConformidades`, e e medicao, nao gosto:
 * aquela funcao clampa em `LIMITE_PADRAO = 100` e nao filtra por idade. Construir a varredura
 * DIARIA sobre ela ignoraria a 101a NC parada EM SILENCIO — exatamente o bloqueio que a Etapa 42
 * descreveu para o `LIMIT 50` do aux de pedidos, e pior que a ausencia do alerta, porque o
 * usuario passaria a confiar numa varredura incompleta. A regua de "parada" e de e-mail, nao de
 * tela, e mora aqui.
 *
 * ⚠️ COLUNAS NOMEADAS, nunca `nc.*` (licao F3 da Etapa 39): `montarCentral` devolve as linhas
 * CRUAS em `GET /almoxarifado/alertas/central`, e toda coluna acrescentada a tabela amanha
 * viajaria para a central sem revisao. A lista abaixo e exatamente o que o corpo do e-mail, o
 * dedupe, o payload e o cartao leem — `descricao`, `justificativa` e os `*_por_nome` ficam de
 * fora de proposito (texto livre em caixa de entrada, mesma classe de decisao do B30).
 *
 * `julianday` (e nao `datetime('now','-N days')`) porque a janela desta entrada e fracionaria no
 * teste e porque e o molde da irma mais proxima, `RESERVA_PARADA`. O `CAST ... AS INTEGER`
 * trunca: `dias_parada` e o numero de dias JA COMPLETOS.
 */
async function listarNaoConformidadesParadas(db, { dias }) {
  return dbAll(db, `
    SELECT nc.id, nc.numero, nc.origem, nc.tipo, nc.status, nc.created_at,
      nc.material_id, m.codigo AS material_codigo, m.nome AS material_nome,
      m.unidade AS material_unidade, nc.recebimento_id, r.numero AS recebimento_numero,
      r.nota_fiscal, nc.quantidade_esperada, nc.quantidade_recebida, nc.divergencia,
      CAST(julianday('now') - julianday(nc.created_at) AS INTEGER) AS dias_parada
    FROM nao_conformidades_almoxarifado nc
    LEFT JOIN materiais_almoxarifado m ON m.id = nc.material_id
    LEFT JOIN recebimentos_material_almoxarifado r ON r.id = nc.recebimento_id
    WHERE nc.status = 'ABERTA'
      AND julianday('now') - julianday(nc.created_at) > ?
    ORDER BY nc.created_at ASC, nc.id ASC`, [dias]);
}

/**
 * NAO_CONFORMIDADE_EXECUCAO_PENDENTE (Etapa 46, T3 — RN-08): NCs DECIDIDAS cuja execucao ainda
 * esta `PENDENTE` ha mais dias que o configurado.
 *
 * ── O BECO QUE ELA FECHA ──────────────────────────────────────────────────────────────────────
 * A Etapa 45 separou DECIDIR de EXECUTAR: a NC nasce `DECIDIDA` + `execucao_estado = 'PENDENTE'` e
 * espera um ato externo (devolver ao fornecedor, substituir, sucatear, mandar para engenharia).
 * Quando aquele ato e impossivel — material com controle de serie, lote nao identificavel —, a
 * recusa da execucao e fatal e se repete para sempre, e o documento fica parado sem NINGUEM ser
 * cobrado: `listarNaoConformidadesParadas` filtra `status = 'ABERTA'`, entao a NC decidida sai
 * daquele cartao e nao entra em nenhum outro. Mora so num filtro de tela que alguem precisa
 * escolher. E o beco "atrasado para sempre" da Etapa 42 em terceira roupa.
 *
 * ⚠️ A JANELA E POR `decidido_em`, **NAO** POR `created_at`, e a diferenca nao e cosmetica: o que
 * se cobra aqui e o tempo decorrido desde a DECISAO, nao a idade do documento. Um documento aberto
 * ha 60 dias e decidido ONTEM nao esta atrasado na execucao — com `created_at` ele apareceria no
 * cartao no dia seguinte a decisao, cobrando de Compras um prazo que ainda nem comecou a correr, e
 * o cartao viraria ruido no primeiro mes. (A irma `NAO_CONFORMIDADE_ABERTA` mede por `created_at`
 * porque **ali** o relogio comeca a andar quando o documento nasce.)
 *
 * ⚠️ `status = 'DECIDIDA'` ENTRA NA REGUA, e nao e redundancia com `execucao_estado = 'PENDENTE'`
 * (mesma decisao, e pelo mesmo motivo, do filtro `?execucao=PENDENTE` de
 * `nonConformityService.listarNaoConformidades`): a RN-06 da Etapa 46 **conserva**
 * `execucao_estado` no cancelamento — cancelar NAO zera a coluna, de proposito, para a decisao
 * continuar legivel no documento morto. So `execucao_estado = 'PENDENTE'` na regua faria a NC
 * CANCELADA continuar cobrando execucao de um documento que ninguem pode mais executar.
 *
 * ⚠️ COLUNAS NOMEADAS, nunca `nc.*` (licao F3 da Etapa 39, mesma da funcao acima): `montarCentral`
 * devolve as linhas CRUAS em `GET /almoxarifado/alertas/central`. `justificativa` e os `*_por_nome`
 * ficam de fora de proposito (texto livre em caixa de entrada, classe de decisao do B30).
 *
 * `julianday` com `CAST ... AS INTEGER` (e nao `datetime('now','-N days')`) e o molde da irma
 * acima: janela fracionaria no teste e `dias_pendente` como numero de dias JA COMPLETOS.
 */
async function listarNaoConformidadesExecucaoPendente(db, { dias }) {
  return dbAll(db, `
    SELECT nc.id, nc.numero, nc.origem, nc.tipo, nc.status, nc.decisao, nc.decidido_em,
      nc.execucao_estado, nc.material_id, m.codigo AS material_codigo, m.nome AS material_nome,
      m.unidade AS material_unidade, nc.recebimento_id, r.numero AS recebimento_numero,
      r.nota_fiscal, nc.quantidade_esperada, nc.quantidade_recebida, nc.divergencia,
      CAST(julianday('now') - julianday(nc.decidido_em) AS INTEGER) AS dias_pendente
    FROM nao_conformidades_almoxarifado nc
    LEFT JOIN materiais_almoxarifado m ON m.id = nc.material_id
    LEFT JOIN recebimentos_material_almoxarifado r ON r.id = nc.recebimento_id
    WHERE nc.status = 'DECIDIDA'
      AND nc.execucao_estado = 'PENDENTE'
      AND julianday('now') - julianday(nc.decidido_em) > ?
    ORDER BY nc.decidido_em ASC, nc.id ASC`, [dias]);
}

/**
 * DIVERGENCIA_INVENTARIO (RN-05): conferencias CONCLUIDO com item divergente pela MESMA regua
 * do inventario (`divergenciaRealSql('ic.divergencia')` — ABS(NULL) e NULL, entao item nao
 * contado nao conta), AGREGADO por conferencia (1 aviso, nunca por item — a exclusao de
 * AJUSTE_INVENTARIO em resolverClasseMovimentacao existe pelo mesmo motivo). SEM
 * `impacto_financeiro` no SELECT de proposito (B30: e-mail vaza para caixa de entrada; o
 * valor e gateado por `inventario` no relatorio).
 */
async function listarDivergenciaConferencia(db, { dias, conferenciaId } = {}) {
  const filtro = conferenciaId
    ? 'AND c.id = ?'
    : `AND c.data_fim >= datetime('now', '-' || ? || ' days')`;
  return dbAll(db, `
    SELECT c.id AS conferencia_id, c.numero, c.data_fim, COUNT(ic.id) AS itens_divergentes
    FROM conferencias_almoxarifado c
    JOIN itens_conferencia_almoxarifado ic ON ic.conferencia_id = c.id
    WHERE c.status = 'CONCLUIDO'
      AND ${divergenciaRealSql('ic.divergencia')}
      ${filtro}
    GROUP BY c.id
    ORDER BY c.data_fim DESC, c.id DESC`, [conferenciaId ?? dias]);
}

/**
 * Etapa 42, T3 — os status de `pedidos_compra` em que o PARCIAL deixa de ser pendencia (RN-E09).
 *
 * `cancelado`/`rejeitado`: o pedido foi abandonado no meio e o saldo que falta nao e pendencia de
 * ninguem. `recebido`: o comprador JA declarou o pedido encerrado a mao — a saida manual que o
 * `PATCH /api/compras/pedidos/:id/status` da Etapa 39 abriu — e insistir por e-mail seria discutir
 * com a decisao humana. Sem este filtro, cada um dos tres viraria e-mail ate o fim dos tempos
 * (a varredura e diaria e nao ha expurgo da fila).
 *
 * ⚠️ MESMO CONTEUDO de `STATUS_PEDIDO_FORA_DO_ATRASO` (`services/compras/pedidoCompraService.js`),
 * e a duplicacao e DELIBERADA: la a lista responde "nao ha mais prazo a furar", aqui responde
 * "nao ha mais saldo a cobrar". Importar aquela constante amarraria os dois alertas, e um status
 * acrescentado la (digamos `em_analise`, que atrasa mas TEM saldo a cobrar) calaria este alerta em
 * silencio. Minusculo porque e o vocabulario da coluna (`services/compras/schemas.js:60`); o
 * `toLowerCase` no filtro e o que aceita acervo importado com caixa diferente.
 */
const STATUS_PEDIDO_PARCIAL_DECIDIDO = ['cancelado', 'rejeitado', 'recebido'];

/**
 * Etapa 42, T3 — a linha "Previsão de entrega" do e-mail do parcial.
 *
 * `''` e `null` sao o MESMO caso: a base tem a string VAZIA gravada na coluna `DATE` porque ate a
 * onda F3 da Etapa 38 o formulario mandava `''` sempre (cabecalho de `pedidoCompraService.js`,
 * `:744-746`). Ao contrario do alerta de ATRASO, que filtra a previsao pela regex
 * `/^\d{4}-\d{2}-\d{2}$/` e por isso nunca ve um vazio, a populacao do PARCIAL NAO filtra previsao
 * nenhuma — de proposito: o pedido importado sem previsao com saldo pendente e exatamente o que
 * ninguem esta acompanhando. Sem esta funcao o comprador receberia `Previsão de entrega: null`.
 */
function previsaoOuNaoInformada(valor) {
  return String(valor ?? '').trim() || 'não informada';
}

/**
 * C2/C3 — as 7 entradas da Etapa 16 + as 4 da Etapa 17 (as tres de evento no fim tem tambem
 * gancho no ato — `dispararAlertaRegistrado` — com o MESMO dedupe, RN-01).
 * `listar(db, { dias })` devolve as linhas cruas da condicao;
 * `dedupeChave(linha)` e estavel no mesmo estado (RN-02); `payload(linha)` e o rastro minimo
 * gravado na fila (campo aditivo ao C2 — as assercoes de teste filtram por ele, nunca por
 * total global).
 */
const ALERT_REGISTRY = Object.freeze([
  {
    chave: 'CALIBRACAO_VENCENDO',
    titulo: 'Calibração vencendo',
    descricao: 'Ferramentas com calibração vencida ou vencendo na janela configurada.',
    configDias: { chave: 'alerta_calibracao_dias', default: 30 },
    // painelCalibracoes ja inclui a ferramenta que NUNCA calibrou (data_validade null) em
    // `vencidas` — o dedupe usa 'sem-calibracao' nesse caso (nota do C3).
    listar: async (db, { dias }) => {
      const toolService = require('./toolService');
      const painel = await toolService.painelCalibracoes(db, dias);
      return [...painel.vencidas, ...painel.a_vencer];
    },
    dedupeChave: (linha) => `calibracao-${linha.id}-${linha.data_validade ?? 'sem-calibracao'}`,
    payload: (linha) => ({ ferramenta_id: linha.id }),
    assunto: (linha) => `[Almoxarifado] Calibração vencendo — ${linha.codigo_patrimonio || linha.nome}`,
    corpo: (linha) => [
      `Ferramenta: ${linha.nome}`,
      `Patrimônio: ${linha.codigo_patrimonio || '-'}`,
      `Validade da calibração: ${linha.data_validade || 'nunca calibrada'}`,
      `Dias restantes: ${linha.dias_restantes ?? '-'}`,
    ].join('\n'),
  },
  {
    chave: 'ESTOQUE_SEM_CONSUMO',
    titulo: 'Estoque sem consumo',
    descricao: 'Materiais com saldo e sem saída há mais dias que a régua configurada.',
    // Chave EXISTENTE da Etapa 11 — o seed dela ja esta no schema (NAO semear de novo).
    // estoqueParado le a mesma chave por dentro; resolverDias existe para a central exibir a
    // janela — mesmo leitor (>0, senao default), mesmo resultado.
    configDias: { chave: 'reposicao_dias_sem_consumo', default: 180 },
    // estoqueParado ja filtra ativo=1 e proprietario_cliente_id IS NULL (purchaseService:444)
    // — RN-07 (cliente fora de consumo/excesso) vem de graca aqui e no EXCESSIVO.
    listar: async (db) => {
      const purchaseService = require('./purchaseService');
      return (await purchaseService.estoqueParado(db, 'SEM_CONSUMO')).itens;
    },
    // material+mes: re-lembra 1x/mes enquanto persistir.
    dedupeChave: (linha) => `sem-consumo-${linha.material_id}-${mesAtual()}`,
    payload: (linha) => ({ material_id: linha.material_id }),
    assunto: (linha) => `[Almoxarifado] Estoque sem consumo — ${linha.codigo}`,
    corpo: (linha) => [
      `Material: ${linha.codigo} — ${linha.nome}`,
      `Quantidade: ${linha.quantidade_atual} ${linha.unidade || ''}`.trim(),
      `Última saída: ${linha.ultima_saida || 'nunca'}`,
      `Valor parado: R$ ${linha.valor_parado}`,
    ].join('\n'),
  },
  {
    chave: 'ESTOQUE_EXCESSIVO',
    titulo: 'Estoque excessivo',
    descricao: 'Materiais com saldo acima da quantidade máxima cadastrada.',
    configDias: null,
    listar: async (db) => {
      const purchaseService = require('./purchaseService');
      return (await purchaseService.estoqueParado(db, 'EXCESSO')).itens;
    },
    dedupeChave: (linha) => `excessivo-${linha.material_id}-${mesAtual()}`,
    payload: (linha) => ({ material_id: linha.material_id }),
    assunto: (linha) => `[Almoxarifado] Estoque excessivo — ${linha.codigo}`,
    corpo: (linha) => [
      `Material: ${linha.codigo} — ${linha.nome}`,
      `Quantidade atual: ${linha.quantidade_atual} ${linha.unidade || ''}`.trim(),
      `Quantidade máxima: ${linha.quantidade_maxima}`,
      `Valor parado: R$ ${linha.valor_parado}`,
    ].join('\n'),
  },
  {
    chave: 'QUARENTENA_PARADA',
    titulo: 'Quarentena parada',
    descricao: 'Itens de recebimento aguardando inspeção há mais dias que o configurado.',
    configDias: { chave: 'alerta_quarentena_dias', default: 7 },
    // data_entrada = r.created_at do recebimento (listarInspecoesPendentes) — filtro de idade
    // em JS porque a fonte e a funcao existente, nao SQL novo.
    listar: async (db, { dias }) => {
      const inspectionService = require('./inspectionService');
      const pendentes = await inspectionService.listarInspecoesPendentes(db);
      return pendentes.filter((i) => maisVelhoQueDias(i.data_entrada, dias));
    },
    // 1x por item, para sempre — o item decidido sai da fila de inspecao e da condicao.
    dedupeChave: (linha) => `quarentena-${linha.item_id}`,
    payload: (linha) => ({ item_id: linha.item_id, recebimento_id: linha.recebimento_id }),
    assunto: (linha) => `[Almoxarifado] Quarentena parada — ${linha.material_codigo}`,
    corpo: (linha) => [
      `Material: ${linha.material_codigo} — ${linha.material_nome}`,
      `Recebimento: ${linha.recebimento_numero}${linha.nota_fiscal ? ` (NF ${linha.nota_fiscal})` : ''}`,
      `Quantidade retida: ${linha.quantidade_retida} ${linha.material_unidade || ''}`.trim(),
      `Entrada: ${linha.data_entrada}`,
    ].join('\n'),
  },
  {
    chave: 'MATERIAL_SEM_ENDERECO',
    titulo: 'Materiais sem endereço',
    descricao: 'Materiais ativos sem localização padrão e sem nenhum saldo endereçado.',
    configDias: null,
    // UMA linha AGREGADA (alerta por material seria ruido em massa) — { total, materiais: ate
    // 20 }. Condicao vazia = nenhuma linha (a central mostra total 0; a varredura nao enfileira).
    listar: async (db) => {
      const materiais = await listarMateriaisSemEndereco(db);
      if (!materiais.length) return [];
      return [{ total: materiais.length, materiais: materiais.slice(0, 20) }];
    },
    // 1 resumo por semana ISO enquanto persistir.
    dedupeChave: () => `sem-endereco-${semanaIso()}`,
    payload: (linha) => ({ total: linha.total, materiais: linha.materiais.map((m) => m.id) }),
    assunto: (linha) => `[Almoxarifado] Materiais sem endereço — ${linha.total} material(is)`,
    corpo: (linha) => [
      `Total sem endereço: ${linha.total}`,
      `Primeiros ${linha.materiais.length}:`,
      ...linha.materiais.map((m) => `- ${m.codigo} — ${m.nome}`),
    ].join('\n'),
  },
  {
    chave: 'REQUISICAO_ATRASADA',
    titulo: 'Requisição atrasada',
    descricao: 'Requisições com data de necessidade vencida e ainda não entregues.',
    configDias: null,
    // So alerta quem PREENCHEU data_necessidade (coluna opcional — limitacao declarada no
    // design). Status pelo conjunto derivado da maquina (comentario no topo do arquivo).
    listar: async (db) => {
      const placeholders = STATUS_REQUISICAO_ATRASAVEL.map(() => '?').join(',');
      return dbAll(db, `
        SELECT r.* FROM requisicoes_almoxarifado r
        WHERE r.data_necessidade IS NOT NULL
          AND date(r.data_necessidade) < date('now')
          AND COALESCE(r.ativo, 1) = 1
          AND r.status IN (${placeholders})
        ORDER BY r.data_necessidade ASC`, STATUS_REQUISICAO_ATRASAVEL);
    },
    dedupeChave: (linha) => `req-atrasada-${linha.id}`,
    payload: (linha) => ({ requisicao_id: linha.id }),
    assunto: (linha) => `[Almoxarifado] Requisição atrasada — ${linha.numero}`,
    corpo: (linha) => [
      `Requisição: ${linha.numero}`,
      `Solicitante: ${linha.solicitante_nome}`,
      `Status: ${linha.status}`,
      `Data de necessidade: ${linha.data_necessidade}`,
    ].join('\n'),
  },
  {
    chave: 'RESERVA_PARADA',
    titulo: 'Reserva parada',
    descricao: 'Reservas ativas paradas há mais dias que o configurado ou já expiradas.',
    configDias: { chave: 'alerta_reserva_parada_dias', default: 30 },
    listar: async (db, { dias }) => dbAll(db, `
      SELECT res.*, m.codigo AS material_codigo, m.nome AS material_nome, m.unidade AS material_unidade
      FROM reservas_material_almoxarifado res
      JOIN materiais_almoxarifado m ON m.id = res.material_id
      WHERE res.status = 'ATIVA'
        AND (julianday('now') - julianday(res.created_at) > ?
             OR date(res.expira_em) < date('now'))
      ORDER BY res.created_at ASC`, [dias]),
    dedupeChave: (linha) => `reserva-parada-${linha.id}`,
    payload: (linha) => ({ reserva_id: linha.id }),
    assunto: (linha) => `[Almoxarifado] Reserva parada — #${linha.id} (${linha.material_codigo})`,
    corpo: (linha) => [
      `Reserva: #${linha.id}`,
      `Material: ${linha.material_codigo} — ${linha.material_nome}`,
      `Quantidade: ${linha.quantidade} ${linha.material_unidade || ''}`.trim(),
      `Criada em: ${linha.created_at}`,
      `Expira em: ${linha.expira_em || '-'}`,
    ].join('\n'),
  },
  // ── Etapa 17 — 4 entradas novas (C2), na ordem do plano. As tres primeiras sao de EVENTO
  // (`evento: true`, documentacional): o ato dispara na hora pelo helper e o `listar` daqui
  // segue alimentando a central E a varredura diaria como rede de seguranca (RN-01).
  {
    chave: 'MATERIAL_REPROVADO',
    titulo: 'Material reprovado',
    descricao: 'Inspeções de recebimento com quantidade reprovada na janela configurada.',
    evento: true,
    configDias: { chave: 'alerta_eventos_janela_dias', default: 7 },
    // Etapa 45 (T5): `excluirComExecucao` LIGADO — e so aqui. O cartao mostra "material reprovado
    // nos ultimos 7 dias"; a inspecao cujo material JA SAIU DE FATO para o fornecedor nao tem mais
    // nada a cobrar de ninguem, e continuar listando o que ja foi feito e o jeito mais rapido de
    // ensinar o usuario a ignorar o cartao.
    //
    // ⚠️ ESTE COMENTARIO DIZIA que a regua era "NC decidida `DEVOLVER` e com
    // `execucao_estado = 'EXECUTADA'`". ESTAVA CERTO NA T5 e ficou ERRADO no fix-round da Fase 5:
    // a regua atual e `i.devolucao_fornecedor_em IS NULL` — MATERIAL MOVIDO, nao intencao
    // registrada. O porque esta no corpo de `listarReprovados`.
    //
    // ⚠️ A exclusao mora NESTA LINHA e nao dentro de `listarReprovados` — o motivo medido (o
    // gancho do ato da inspecao) esta no cabecalho daquela funcao, junto com a historia das
    // duas reguas e o motivo de a primeira nao bastar.
    //
    // CONSEQUENCIA DECLARADA (RN-01: o `listar` e UM so para a central e para a varredura
    // diaria): a rede de seguranca da varredura tambem deixa de enfileirar a inspecao devolvida.
    // O caso perdido e estreito e conhecido — o gancho do ato explodiu e virou `console.warn`, E
    // a devolucao foi executada dentro dos mesmos 7 dias. DESCARTADO: dois `listar` (um para a
    // central, outro para a varredura) — seriam duas definicoes da mesma condicao, a classe de
    // bug que este arquivo inteiro existe para nao ter.
    listar: (db, { dias }) => listarReprovados(db, { dias, excluirComExecucao: true }),
    // Decisao de inspecao e imutavel — 1 aviso por inspecao, para sempre.
    dedupeChave: (linha) => `reprovado-${linha.inspecao_id}`,
    payload: (linha) => ({ inspecao_id: linha.inspecao_id }),
    assunto: (linha) => `[Almoxarifado] Material reprovado — ${linha.material_codigo}`,
    corpo: (linha) => [
      `Material: ${linha.material_codigo} — ${linha.material_nome}`,
      `Quantidade reprovada: ${linha.quantidade_reprovada}`,
      `Encaminhamento: ${linha.encaminhamento || '-'}`,
      `Recebimento: ${linha.recebimento_numero}${linha.nota_fiscal ? ` (NF ${linha.nota_fiscal})` : ''}`,
      `Inspeção em: ${linha.data_inspecao}`,
      `Responsável: ${linha.responsavel_nome || '-'}`,
    ].join('\n'),
  },
  {
    chave: 'DIVERGENCIA_RECEBIMENTO',
    titulo: 'Divergência de recebimento',
    descricao: 'Itens recebidos com quantidade diferente da esperada na janela configurada.',
    evento: true,
    configDias: { chave: 'alerta_eventos_janela_dias', default: 7 },
    // Etapa 43 (T4, D6): `excluirComNC` LIGADO — e so aqui. A partir do momento em que a
    // divergencia vira `NC-…`, quem cobra e o cartao `NAO_CONFORMIDADE_ABERTA`; o mesmo item nos
    // dois avisos ensina o usuario a ignorar os dois. O papel que sobra para este cartao e
    // DECLARADO e e a rede de seguranca do gancho nao fatal da T3: enquanto a NC NAO existir
    // (porque o gancho explodiu e virou `console.warn`), o item continua aqui, na central e na
    // varredura diaria.
    //
    // ⚠️ A exclusao mora NESTA LINHA e nao dentro de `listarDivergenciasRecebimento` — o motivo
    // medido esta no cabecalho daquela funcao (o cenario A1 da Etapa 17 morre).
    listar: (db, { dias }) => listarDivergenciasRecebimento(db, { dias, excluirComNC: true }),
    // 1x por item; correcao posterior da quantidade nao re-alerta (declarado no design).
    // A quantidade ENTRA no dedupe (achado A1 da revisao adversarial, reproduzido): com
    // `receb-diverg-<item_id>` puro, salvar 8 de 10, corrigir para 10 e depois errar 2 de 10
    // deixava a central dizendo "faltam 8" (o unico e-mail que existia) enquanto o estado real
    // era outro — errar de novo, PIOR, ficava calado. Com a quantidade na chave, cada valor
    // divergente novo avisa uma vez; re-salvar o MESMO valor continua sendo DUPLICADA.
    dedupeChave: (linha) => `receb-diverg-${linha.item_id}-${linha.quantidade_recebida}`,
    payload: (linha) => ({ item_id: linha.item_id, recebimento_id: linha.recebimento_id }),
    assunto: (linha) => `[Almoxarifado] Divergência de recebimento — ${linha.material_codigo}`,
    corpo: (linha) => [
      `Material: ${linha.material_codigo} — ${linha.material_nome}`,
      `Quantidade esperada: ${linha.quantidade_esperada}`,
      `Quantidade recebida: ${linha.quantidade_recebida}`,
      `Divergência: ${linha.divergencia}`,
      `Recebimento: ${linha.recebimento_numero}${linha.nota_fiscal ? ` (NF ${linha.nota_fiscal})` : ''}`,
    ].join('\n'),
  },
  {
    chave: 'DIVERGENCIA_INVENTARIO',
    titulo: 'Divergência de inventário',
    descricao: 'Conferências concluídas com itens divergentes na janela configurada.',
    evento: true,
    configDias: { chave: 'alerta_eventos_janela_dias', default: 7 },
    listar: (db, { dias }) => listarDivergenciaConferencia(db, { dias }),
    // Conferencia conclui 1x — 1 aviso agregado por conferencia (RN-05).
    dedupeChave: (linha) => `inv-diverg-${linha.conferencia_id}`,
    payload: (linha) => ({ conferencia_id: linha.conferencia_id }),
    assunto: (linha) => `[Almoxarifado] Divergência de inventário — ${linha.numero}`,
    // B30: o corpo diz o NUMERO de itens divergentes, nunca o impacto financeiro.
    corpo: (linha) => [
      `Conferência: ${linha.numero}`,
      `Concluída em: ${linha.data_fim}`,
      `Itens divergentes: ${linha.itens_divergentes}`,
    ].join('\n'),
  },
  {
    chave: 'LOTE_SEM_CERTIFICADO',
    titulo: 'Lote sem certificado',
    descricao: 'Lotes com saldo de material que exige certificado e sem arquivo anexado.',
    configDias: null,
    // Molde da subquery de saldo: varrerLotesVencendo (notificationQueueService.js:492-502;
    // filtro de saldo em JS como la). SEM o filtro `l.status='ATIVO'` do molde, DE PROPOSITO
    // (achado da revisao): o lote sem certificado NASCE `BLOQUEADO` (receiptService:471 +
    // lotService:113-136) — copiar o filtro cegaria o alerta para o caso principal. A regua e
    // `certificado_arquivo IS NULL` (lote destravado na mao sem anexo continua sem
    // certificado). Material de CLIENTE ENTRA (decisao do plano: certificado e
    // rastreabilidade do lote, nao propriedade — coerente com B29/sem-endereco).
    listar: async (db) => {
      const lotes = await dbAll(db, `
        SELECT l.id, l.id AS lote_id, l.codigo, l.status, l.material_id,
          m.codigo AS material_codigo, m.nome AS material_nome, m.unidade AS material_unidade,
          COALESCE((SELECT SUM(s.quantidade) FROM estoque_saldo_almoxarifado s WHERE s.lote_id = l.id), 0) AS saldo
        FROM lotes_almoxarifado l
        JOIN materiais_almoxarifado m ON m.id = l.material_id
        WHERE m.ativo = 1
          AND m.controle_certificado = 1
          -- TRIM/COALESCE em vez de IS NULL puro (achado A4 da revisao): hoje o unico
          -- escritor e o upload, mas string vazia/espacos escapariam do IS NULL e o lote
          -- sumiria do alerta em silencio no dia em que existir um "remover anexo".
          AND COALESCE(TRIM(l.certificado_arquivo), '') = ''
        ORDER BY m.codigo, l.codigo`);
      const comSaldo = lotes.filter((l) => Number(l.saldo) > 0);
      if (!comSaldo.length) return [];
      // UMA linha AGREGADA, no mesmo padrao de MATERIAL_SEM_ENDERECO (achado A2 da revisao
      // adversarial, MEDIDO: 1000 lotes aguardando certificado geravam 1000 e-mails, e o
      // dedupe mensal os repetia todo mes). A populacao deste alerta e "todo lote com saldo
      // esperando certificado" — exatamente o caso de ruido em massa que a Etapa 16 ja tinha
      // resolvido por agregacao no sem-endereco. A central mostra o total e os 20 primeiros.
      return [{ total: comSaldo.length, lotes: comSaldo.slice(0, 20) }];
    },
    // RN-06: 1 resumo por mes enquanto houver lote sem certificado com saldo.
    dedupeChave: () => `sem-certificado-${mesAtual()}`,
    payload: (linha) => ({ total: linha.total, lotes: linha.lotes.map((l) => l.id) }),
    assunto: (linha) => `[Almoxarifado] Lotes sem certificado — ${linha.total} lote(s)`,
    corpo: (linha) => [
      `Total de lotes sem certificado (com saldo): ${linha.total}`,
      `Primeiros ${linha.lotes.length}:`,
      ...linha.lotes.map((l) => `- ${l.codigo} · ${l.material_codigo} — ${l.material_nome} · saldo ${l.saldo} ${l.material_unidade || ''} · ${l.status}`.trim()),
    ].join('\n'),
  },
  {
    chave: 'PEDIDO_COMPRA_ATRASADO',
    titulo: 'Pedido de compra atrasado',
    descricao: 'Pedidos de compra com previsão de entrega vencida e ainda não recebidos.',
    configDias: null,
    // Etapa 39, Task 4 (RN-D09, RN-D10, RN-D11).
    //
    // Regua UNICA, importada do modulo Compras (services/compras/pedidoCompraService): a tela e o
    // alerta nao podem ter duas definicoes de "atrasado" (RN-D11). O SQL so PRE-FILTRA pelo unico
    // termo que ja e da propria regua (`previsao_entrega IS NOT NULL`) — e um SUPERCONJUNTO, nao
    // uma segunda formula: quem decide linha a linha e o `derivarAtraso`. Escrever
    // `AND previsao_entrega < date('now') AND status NOT IN (...)` aqui seria a segunda regua (e
    // `date('now')` ainda por cima e UTC, ~3h adiantado no fuso do Brasil).
    //
    // ⚠️ CONSULTA CROSS-MODULO: `pedidos_compra`/`fornecedores` sao tabelas CORE
    // (`server/index.js:19230`), e as 11 entradas anteriores so leem tabelas `*_almoxarifado`.
    // Mesmo handle, mesmo arquivo SQLite; decisao de arquitetura declarada na letra B.
    //
    // ⚠️ REQUIRE **LAZY**, e nao e estilo — e a convencao escrita no cabecalho deste arquivo
    // (`:9-13`) para purchaseService/inspectionService/toolService. MEDIDO na Etapa 39: hoje o
    // ciclo NAO fecha (notificationQueueService requer ESTE arquivo lazy, em `:581` e `:647`),
    // entao um require de topo funcionaria — e e exatamente por isso que ele e perigoso: o
    // ciclo esta a UM require de distancia (`receiptService.js:26` requer purchaseService e
    // `:31` requer este arquivo, os dois no topo), e quando fechar, um dos lados captura `{}`
    // mid-load, `derivarAtraso` vem `undefined` e o cartao aparece com `erro: true` em vez de
    // quebrar a suite. Falha silenciosa; o require lazy custa nada.
    //
    // LEFT JOIN, nao JOIN: pedido orfao de fornecedor tambem atrasa (R9).
    listar: async (db) => {
      const { hojeLocalISO, derivarAtraso } = require('../compras/pedidoCompraService');
      const hoje = hojeLocalISO();
      // ⚠️ COLUNAS NOMEADAS, nunca `SELECT p.*` — e a onda de correcao (F3) trocou justamente
      // isso. `montarCentral` devolve as linhas CRUAS (ate 50) na resposta de
      // `GET /api/almoxarifado/alertas/central`, cujo gate e `requirePermission('ver_alertas')` —
      // que NAO inclui `checkModulePermission('compras')`. Com `p.*`, quem tem `ver_alertas` sem ter
      // o modulo Compras recebia `valor_total`, `observacoes` e `fornecedor_id` de pedidos CORE na
      // aba Network, ainda que a tela desenhe so 4 colunas.
      //
      // ⚠️ **A FRASE ENTRE PARENTESES AQUI ESTAVA ERRADA e fica corrigida a vista** (revisao
      // adversarial da Etapa 42): ela dizia *"um ALMOXARIFE (que recebe 403 em
      // `GET /api/compras/pedidos`)"*. O almoxarife **nao** ficava sem aquele dado — ele o obtinha
      // pela porta do proprio almoxarifado (`GET /recebimentos-aux/pedidos-compra`, com `auth` e
      // NENHUM `requirePermission`), medido por sonda; e quem **de fato** toma 403 na central
      // (PRODUCAO, CONSULTA) tambem obtinha por lá. A projecao de colunas continua certa — o que
      // estava errado era o exemplo, e exemplo errado ensina a confiar num 403 inexistente.
      //
      // O time JA decidiu este trade-off por escrito no arquivo ao lado (`permissions.js:92-95`):
      // PRODUCAO/ENGENHARIA/CONSULTA saíram de `ver_alertas` na Etapa 16 porque
      // `ESTOQUE_SEM_CONSUMO`/`ESTOQUE_EXCESSIVO` carregam `valor_parado` (CUSTO). Valor de pedido
      // e observacao de negociacao com fornecedor sao a mesma classe de dado.
      //
      // O risco maior nem e o de hoje: com `p.*`, QUALQUER coluna acrescentada a `pedidos_compra`
      // amanha passa a viajar para a central sem revisao nenhuma. A lista abaixo e exatamente o
      // que a entrada le — `derivarAtraso` (previsao_entrega, status), `dedupeChave`
      // (id, previsao_entrega), `payload` (id), assunto/corpo (numero, fornecedor_nome,
      // previsao_entrega, dias_atraso, status) e o cartao da central (id, numero, fornecedor_nome,
      // previsao_entrega, dias_atraso). `data_pedido` NAO entra: nada o le (divergencia declarada
      // do brief, que o listava; vale o medido).
      const linhas = await dbAll(db, `
        SELECT p.id, p.numero, p.status, p.previsao_entrega, f.razao_social AS fornecedor_nome
        FROM pedidos_compra p
        LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
        WHERE p.previsao_entrega IS NOT NULL
        ORDER BY p.previsao_entrega ASC`);
      return linhas
        .map((l) => ({ ...l, ...derivarAtraso(l, hoje) }))
        .filter((l) => l.atrasado === 1);
    },
    // RN-D10: UM aviso por PERIODO DE ATRASO — nao um por dia de atraso. O dedupe sem o id faria
    // o primeiro pedido atrasado calar todos os outros.
    //
    // ⚠️ A `previsao_entrega` ENTRA NA CHAVE, e a onda de correcao (F2) a acrescentou porque a
    // chave so com o id calava o pedido para SEMPRE. Cenario reproduzido por sonda na revisao
    // final: pedido atrasado -> e-mail sai e grava `hash_dedupe` num indice UNIQUE; o comprador
    // liga para o fornecedor e RENEGOCIA (PUT com previsao nova — permitido, e e o gesto canonico
    // DEPOIS de receber o primeiro alerta); o prazo NOVO vence -> o `listar` acha a linha, mas o
    // `enfileirar` recalcula o MESMO hash, bate no UNIQUE e devolve DUPLICADA. Nenhum e-mail,
    // nunca mais, por mais prazos que aquele pedido quebre — e nao ha expurgo da fila, entao o
    // silencio e permanente.
    //
    // Com a data prometida na chave, o objetivo declarado fica inteiro: a previsao NAO muda dia a
    // dia (muda quando e renegociada), entao o pedido que segue atrasado no MESMO prazo continua
    // avisando UMA vez. E o formato ja e o das irmas que dependem de uma data prometida:
    // `calibracao-${id}-${data_validade}` (:201), `lote-vencendo-${id}-${data_validade}` e
    // `remessa-vencida-${id}-${prazo_previsto}` (notificationQueueService :515/:554).
    //
    // DESCARTADO: expurgo/retencao da fila de notificacoes — e contrato da feature 19 e mudaria o
    // dedupe das 11 entradas anteriores junto.
    dedupeChave: (linha) => `pedido-atrasado-${linha.id}-${linha.previsao_entrega}`,
    payload: (linha) => ({ pedido_compra_id: linha.id, dias_atraso: linha.dias_atraso }),
    // Prefixo `[Compras]`, NAO `[Almoxarifado]`: o documento e de Compras e a lista de
    // destinatarios e compartilhada — o prefixo e o que permite ao leitor filtrar (D5).
    assunto: (linha) => `[Compras] Pedido de compra atrasado — ${linha.numero}`,
    corpo: (linha) => [
      `Pedido: ${linha.numero}`,
      `Fornecedor: ${linha.fornecedor_nome || '-'}`,
      `Previsão de entrega: ${linha.previsao_entrega}`,
      `Atraso: ${linha.dias_atraso} dia(s)`,
      `Status: ${linha.status}`,
    ].join('\n'),
  },
  {
    chave: 'PEDIDO_COMPRA_PARCIAL',
    titulo: 'Pedido de compra recebido parcialmente',
    descricao: 'Pedidos de compra com entrega parcial e saldo ainda pendente.',
    configDias: null,
    // Etapa 42, T3 (RN-E09) — a 13a entrada do registro.
    //
    // ── O BLOQUEIO QUE ELA DESFAZ ─────────────────────────────────────────────────────────────
    // A `specs/modulo-almoxarifado/20-alertas/README.md` manteve este alerta como `[ ]` por
    // DECISAO: a regua de situacao/saldo da Etapa 37 (`derivarRecebimentoDoPedido`) nao era
    // exportada, e a unica fonte exportada era `listarPedidosCompraAux`, com `LIMIT 50` (contrato
    // de TELA: a aba lista os 50 pedidos mais novos) e sem `previsao_entrega`. Construir o alerta
    // sobre o aux ignoraria o 51o pedido parcial EM SILENCIO — pior que a ausencia do alerta,
    // porque o comprador passaria a confiar numa varredura incompleta. A T1 desta etapa criou
    // `situacaoDosPedidosCompra` (SEM `LIMIT`, com `previsao_entrega`/`status`, colunas PROJETADAS
    // e guarda `sqlite_master`), e esta entrada apenas a CONSOME: nenhum SQL novo mora aqui, e a
    // regua continua tendo um dono so.
    //
    // ⚠️ REQUIRE **LAZY**, e aqui NAO e so convencao — e o ciclo FECHANDO. `receiptService.js:31`
    // requer ESTE arquivo no TOPO; um require de topo de `receiptService` aqui completaria
    // alertRegistry -> receiptService -> alertRegistry, e um dos lados capturaria `{}` mid-load.
    // `{}` nao lanca: `situacaoDosPedidosCompra` viria `undefined`, o `listar` lancaria
    // "is not a function" e `montarCentral` traduziria isso em `erro: true` — o cartao aparece
    // vazio, a varredura nao manda e-mail, e a SUITE FICA VERDE. Falha silenciosa; o lazy custa
    // nada. `alertaPedidoParcial.api.test.js (10)` afirma `cartao.erro === undefined` e carrega o
    // registro num processo FRIO, que e o unico jeito de pegar o `{}` mid-load.
    //
    // ⚠️ COLUNAS PROJETADAS: a projecao vive na fonte (T1), com o mesmo motivo do F3 da Etapa 39 —
    // `montarCentral` devolve as linhas CRUAS em `GET /almoxarifado/alertas/central`, cujo gate
    // (`requirePermission('ver_alertas')`) NAO inclui `checkModulePermission('compras')`.
    //
    // O filtro de status roda AQUI e nao na fonte: a fonte responde "qual e a situacao de cada
    // pedido", e "qual pedido merece e-mail" e politica DESTE alerta (a tela de recebimento, que le
    // a mesma fonte pelo aux, mostra o cancelado de proposito).
    listar: async (db) => {
      const { situacaoDosPedidosCompra } = require('./receiptService');
      const parciais = await situacaoDosPedidosCompra(db, { situacao: 'PARCIAL' });
      return parciais.filter((l) => !STATUS_PEDIDO_PARCIAL_DECIDIDO
        .includes(String(l.status || '').toLowerCase()));
    },
    // RN-E09: UM aviso por SALDO PENDENTE — e o saldo e o dado que MUDA a cada chegada parcial
    // nova, que e justamente o evento que o comprador precisa acompanhar. A chave so com o id
    // calaria o pedido para sempre (o defeito que a Etapa 39 pagou em `33031ac` no
    // `pedido-atrasado-<id>`): o hash do primeiro aviso fica num indice UNIQUE, o `INSERT OR
    // IGNORE` do `enfileirar` devolve DUPLICADA e nao ha expurgo da fila — silencio permanente.
    //
    // ⚠️ O `Math.round(saldo * 1000)` NAO e cosmetico. `saldo_pendente` e
    // `Math.max(0, pedida - recebida)` sobre `SUM(REAL)`, sem arredondamento: MEDIDO no cenario (6)
    // do teste, o mesmo estado fisico (10 pedidos, 3,3 recebidos) da `6.7` numa linha so e
    // `6.699999999999999` em duas linhas — a chave crua mandaria DOIS e-mails pelo mesmo saldo, e o
    // segundo chegaria sem nada ter acontecido no pedido. 3 casas decimais e a precisao que as
    // unidades do modulo usam (`quantidade` REAL de PC/KG/M), e o teste afirma que 0,001 de
    // diferenca REAL ainda muda a chave.
    //
    // DESCARTADO: dedupe por mes (perderia a chegada nova); dedupe so pelo id (silencio
    // permanente); expurgo da fila quando o pedido fecha — e contrato da feature 19 e a chave
    // carrega o saldo DO MOMENTO do enfileiramento, que o gancho de fechamento nao conhece (D10).
    dedupeChave: (linha) => `pedido-parcial-${linha.id}-${Math.round(linha.saldo_pendente * 1000)}`,
    payload: (linha) => ({ pedido_compra_id: linha.id, saldo_pendente: linha.saldo_pendente }),
    // Prefixo `[Compras]`, NAO `[Almoxarifado]`: o documento e de Compras e a lista de
    // destinatarios e compartilhada — o prefixo e o que permite ao leitor filtrar (mesma decisao
    // da entrada irma, Etapa 39).
    assunto: (linha) => `[Compras] Pedido de compra recebido parcialmente — ${linha.numero}`,
    // As 7 linhas sao CONTRATO CONGELADO (secao 2.4 do plano da Etapa 42), e o cartao da central
    // tem rotulos PROPRIOS, curtos, que nao sao estas strings.
    corpo: (linha) => [
      `Pedido: ${linha.numero}`,
      `Fornecedor: ${linha.fornecedor_nome || '-'}`,
      `Quantidade pedida: ${linha.quantidade_pedida}`,
      `Quantidade recebida: ${linha.quantidade_recebida}`,
      `Saldo pendente: ${linha.saldo_pendente}`,
      `Previsão de entrega: ${previsaoOuNaoInformada(linha.previsao_entrega)}`,
      `Status: ${linha.status}`,
    ].join('\n'),
  },
  {
    chave: 'NAO_CONFORMIDADE_ABERTA',
    titulo: 'Não conformidade aberta',
    descricao: 'Não conformidades ainda sem decisão há mais dias que o configurado.',
    configDias: { chave: 'alerta_nc_parada_dias', default: 7 },
    // Etapa 43, T4 (D6) — a 14a entrada do registro.
    //
    // ── O QUE ELA COBRA ───────────────────────────────────────────────────────────────────────
    // A T3 fez a NC NASCER sozinha nas duas portas do recebimento e na inspecao. Nascer sozinha
    // sem ninguem cobrar a decisao seria trocar um silencio por outro: o documento existe, fica
    // `ABERTA` para sempre e ninguem responde "o que se decidiu fazer com a falta de 4 kg", que e
    // metade da razao de a feature existir. Este alerta cobra a DECISAO.
    //
    // ⚠️ A FRASE QUE ESTAVA AQUI VALIA E DEIXOU DE VALER, e fica corrigida A VISTA em vez de
    // apagada em silencio (Etapa 46, T3 — achado 11 da Fase 2). Ela dizia:
    // ~~"NC decidida ou cancelada sai da condicao sozinha, SEM GANCHO NENHUM"~~. Era VERDADE
    // quando foi escrita, na Etapa 43: decidir era o ULTIMO gesto, e sair deste cartao era sair do
    // assunto. A Etapa 45 separou DECIDIR de EXECUTAR e a frase virou meia verdade perigosa — a NC
    // decidida sai daqui de fato, mas pode ficar `execucao_estado = 'PENDENTE'` para sempre
    // (execucao recusada por controle de serie / lote nao identificavel), e "sair da condicao"
    // passou a significar "sair de TODA cobranca".
    //
    // O que continua verdade, e e o que sustenta o filtro `status = 'ABERTA'`: quem sai DESTE
    // cartao sai porque a decisao ACONTECEU (ou porque o documento morreu), e isso e exatamente o
    // que este cartao cobra. Quem cobra o que vem DEPOIS e a 15a entrada,
    // `NAO_CONFORMIDADE_EXECUCAO_PENDENTE`, logo abaixo.
    //
    // ⚠️ Prefixo `[Almoxarifado]` (e nao `[Compras]`, como as duas entradas irmas acima): o
    // documento e do almoxarifado e quem decide e QUALIDADE (D8). O prefixo e o que permite ao
    // leitor filtrar a caixa compartilhada.
    //
    // ⚠️ SEM require de servico: o SQL mora no arquivo (ver `listarNaoConformidadesParadas`), entao
    // nao ha ciclo a evitar aqui — `nonConformityService` nem e importado.
    listar: (db, { dias }) => listarNaoConformidadesParadas(db, { dias }),
    // RN do D6: UM aviso por NC, para sempre — o molde e `quarentena-<item_id>` e
    // `req-atrasada-<id>`, as duas irmas que tambem cobram um ato humano pendente. Nem mes nem
    // semana na chave DE PROPOSITO: re-lembrar mensalmente de uma NC parada geraria e-mail para
    // sempre (nao ha expurgo da fila) sem nenhum fato novo, e o dado que o destinatario precisa —
    // "esta NC esta parada" — nao muda enquanto ninguem decide. A NC decidida sai da condicao;
    // a que voltar a ser aberta e outro documento, com outro id.
    //
    // DESCARTADO: por a `dias_parada` na chave (como a `previsao_entrega` do pedido atrasado) —
    // ali a data PROMETIDA so muda quando ha renegociacao, aqui `dias_parada` muda TODO DIA, e a
    // chave viraria um e-mail diario pela mesma NC.
    dedupeChave: (linha) => `nc-${linha.id}`,
    payload: (linha) => ({ nao_conformidade_id: linha.id, material_id: linha.material_id }),
    assunto: (linha) => `[Almoxarifado] Não conformidade aberta — ${linha.numero}`,
    corpo: (linha) => [
      `Não conformidade: ${linha.numero}`,
      `Material: ${linha.material_codigo ? `${linha.material_codigo} — ${linha.material_nome}` : '-'}`,
      `Tipo: ${linha.tipo || '-'}`,
      `Origem: ${linha.origem || '-'}`,
      `Aberta há: ${linha.dias_parada} dia(s)`,
      // A NC de origem INSPECAO tambem congela o `recebimento_id` (o SQL da listagem nao e
      // polimorfico, T1), mas a NC aberta a mao pode nao ter nenhum — dai o travessao.
      `Recebimento: ${linha.recebimento_numero || '-'}${linha.nota_fiscal ? ` (NF ${linha.nota_fiscal})` : ''}`,
    ].join('\n'),
  },
  {
    chave: 'NAO_CONFORMIDADE_EXECUCAO_PENDENTE',
    titulo: 'Execução pendente',
    descricao: 'Não conformidades decididas cuja execução segue pendente há mais dias que o configurado. Se a execução for impossível (material com número de série, lote não identificável), a Qualidade pode cancelar o documento.',
    configDias: { chave: 'alerta_nc_execucao_pendente_dias', default: 7 },
    // Etapa 46, T3 (RN-08) — a 15a entrada do registro.
    //
    // ── POR QUE ELA E SEPARADA DA `NAO_CONFORMIDADE_ABERTA`, E NAO UM AFROUXAMENTO DAQUELA ────
    // A alternativa obvia era largar a regua da irma acima de `status = 'ABERTA'` para
    // `status IN ('ABERTA','DECIDIDA')` e ganhar os dois casos num cartao so. FOI DESCARTADO, e o
    // motivo e de DESTINATARIO e de PRAZO, nao de estilo:
    //
    //   · a irma cobra a **DECISAO**, e o dono dela e a **QUALIDADE** (D8 da Etapa 43 — e por isso
    //     o prefixo `[Almoxarifado]` e nao `[Compras]`);
    //   · esta cobra a **EXECUCAO**, e o dono dela e **COMPRAS** (B176 da Etapa 45 deu a COMPRAS o
    //     `executar_encaminhamento`; a Etapa 46 deliberadamente NAO lhe deu o cancelar).
    //
    // Uma entrada so misturaria dois destinatarios e dois prazos no MESMO cartao e no MESMO
    // e-mail: Qualidade receberia cobranca de devolucao que nao e dela, Compras receberia cobranca
    // de decisao que nao e dele, e a janela — que hoje pode ser 7 dias para decidir e 30 para
    // executar uma devolucao que depende do fornecedor — teria de ser uma unica. A regra de ouro
    // deste modulo e a que os cartoes `MATERIAL_REPROVADO`/`DIVERGENCIA_RECEBIMENTO` ja pagaram:
    // o mesmo fato em dois avisos (ou dois fatos no mesmo aviso) ensina o usuario a ignorar o
    // aviso. Duas entradas, dois textos, duas janelas, dois dedupes.
    //
    // ⚠️ SEM require de servico: o SQL mora no arquivo (`listarNaoConformidadesExecucaoPendente`),
    // entao nao ha ciclo a evitar — `nonConformityService` nem e importado. Os literais
    // `'DECIDIDA'`/`'PENDENTE'` do SQL sao a mesma copia deliberada da irma acima com o seu
    // `'ABERTA'` (nenhum require de servico neste SQL), e o cenario (1) do teste le as constantes
    // do servico para guardar contra deriva.
    listar: (db, { dias }) => listarNaoConformidadesExecucaoPendente(db, { dias }),
    // UM aviso por NC, para sempre — o molde e o `nc-<id>` da irma.
    //
    // ⚠️ O prefixo `nc-exec-` NAO e o que evita colisao com a irma, e vale dizer porque e a
    // conclusao errada mais facil de tirar aqui: a MESMA NC passa pelos dois cartoes (parada 9
    // dias -> decidida -> pendente de execucao), mas o `hash_dedupe` e
    // `sha256(EVENTO|chave)` (`notificationQueueService.js:42`), e os dois EVENTOS sao
    // diferentes — `nc-<id>` cru nos dois nao bateria no indice UNIQUE. MEDIDO no cenario (6) do
    // teste, que exige as DUAS linhas na fila para a mesma NC. O prefixo existe para a chave ser
    // LEGIVEL na fila e no log (`nc-exec-` diz qual cobranca e sem cruzar a coluna `evento`).
    //
    // DESCARTADO: por `dias_pendente` na chave — muda TODO DIA e viraria e-mail diario pela mesma
    // NC (a mesma razao que a irma registra para nao usar `dias_parada`). E tambem por a `decisao`
    // na chave: ela e IMUTAVEL depois do claim de `decidir` (Etapa 43), entao nao acrescentaria
    // nada.
    dedupeChave: (linha) => `nc-exec-${linha.id}`,
    payload: (linha) => ({ nao_conformidade_id: linha.id, material_id: linha.material_id }),
    assunto: (linha) => `[Almoxarifado] Execução pendente — ${linha.numero}`,
    corpo: (linha) => [
      `Não conformidade: ${linha.numero}`,
      `Material: ${linha.material_codigo ? `${linha.material_codigo} — ${linha.material_nome}` : '-'}`,
      `Tipo: ${linha.tipo || '-'}`,
      `Origem: ${linha.origem || '-'}`,
      // A DECISAO e o dado que distingue este e-mail do da irma: quem le precisa saber O QUE
      // ficou combinado (devolver? substituir? sucatear?) para saber o que executar.
      `Decisão: ${linha.decisao || '-'}`,
      `Decidida há: ${linha.dias_pendente} dia(s)`,
      `Recebimento: ${linha.recebimento_numero || '-'}${linha.nota_fiscal ? ` (NF ${linha.nota_fiscal})` : ''}`,
      // ⚠️ A SAIDA NOMEADA NO CORPO, e ela e o conserto de um achado da Fase 5 (lente 2, por sonda
      // HTTP): quem recebe este aviso e o COMPRAS (ele tem `ver_alertas`), e o COMPRAS NAO TEM
      // porta de saida para o documento — `/executar` e 400 fatal e `/cancelar` e 403. A QUALIDADE,
      // unico perfil nao-admin que cancela, esta FORA de `ver_alertas`. Sem esta linha o cartao
      // ficava aceso indefinidamente para quem so pode tomar 400: o beco reencenado uma camada
      // acima. DESCARTADO por ora: por a QUALIDADE em `ver_alertas` — alargar permissao e menos
      // reversivel que escrever a saida, e a central carrega o VALOR EM DINHEIRO do estoque parado
      // (a razao registrada de a QUALIDADE estar fora). Registrado na letra B.
      'Execução impossível (número de série, lote não identificável)? A Qualidade pode cancelar o documento em Almoxarifado → Não Conformidades.',
    ].join('\n'),
  },
]);

/** Corte de linhas por alerta na central (C1) — o `total` continua sendo o numero cheio. */
const LIMITE_LINHAS_CENTRAL = 50;

/**
 * Etapa 16, Task 2 — a central de alertas (C1): avalia o registro AO VIVO, na ordem do
 * registro, e devolve `{ alertas: [...] }` para o GET /alertas/central.
 *
 * Mora AQUI (e nao na rota) porque a rota da extended vive dentro do closure de
 * `registerExtendedRoutes` e nunca e exportada — logica ali seria intestavel por unidade, o
 * mesmo motivo pelo qual toda rota do modulo delega a um service. O `registro` e INJETAVEL
 * de proposito (achado da revisao do plano): o teste do `erro:true` passa um registro com um
 * `listar` que lanca, sem sabotagem manual nao versionada.
 *
 * Erro num `listar` individual NAO derruba a central: a entrada vem
 * `{ chave, titulo, erro: true, total: 0, linhas: [] }` e as demais respondem — central
 * parcial honesta em vez de 500 total (decisao registrada no C1).
 */
async function montarCentral(db, registro = ALERT_REGISTRY) {
  const alertas = [];
  for (const entrada of registro) {
    try {
      const dias = await resolverDias(db, entrada);
      const linhas = await entrada.listar(db, { dias });
      alertas.push({
        chave: entrada.chave,
        titulo: entrada.titulo,
        descricao: entrada.descricao,
        dias,
        total: linhas.length,
        linhas: linhas.slice(0, LIMITE_LINHAS_CENTRAL),
      });
    } catch (e) {
      console.error(`Central de alertas: falha no listar de ${entrada.chave}:`, e.message);
      alertas.push({ chave: entrada.chave, titulo: entrada.titulo, erro: true, total: 0, linhas: [] });
    }
  }
  return { alertas };
}

module.exports = {
  ALERT_REGISTRY,
  resolverDias,
  listarMateriaisSemEndereco,
  STATUS_REQUISICAO_ATRASAVEL,
  montarCentral,
  // Etapa 17 — dual-mode exportado: os ganchos dos atos (Task 2) chamam o modo por id.
  listarReprovados,
  listarDivergenciasRecebimento,
  listarDivergenciaConferencia,
  // Etapa 43 (T4): exportada para o teste da 14a entrada medir a regua de "parada" sem passar
  // pela central inteira.
  listarNaoConformidadesParadas,
  // Etapa 46 (T3): idem, para a 15a entrada — a regua de "execucao pendente" medida direto.
  listarNaoConformidadesExecucaoPendente,
};
