/**
 * Etapa 12, Task 1 — fila de notificacoes (RN-01, RN-02, RN-03, RN-08, RN-09).
 *
 * Unico escritor/leitor de `fila_notificacoes_almoxarifado`. O transporte e o
 * `alertService.enviarEmail` (reuso total — nenhum SMTP novo, D5 do design). Este servico
 * NAO importa `stockService`/`alertService` no topo do arquivo para o envio: ver o comentario
 * em `processarFila` sobre o ciclo de require que a Task 3 fecha (alertService -> este servico
 * -> alertService, quando o alerta de ZERADO passar a enfileirar por aqui).
 */
const crypto = require('crypto');
const { dbRun, dbGet, dbAll } = require('./db');
const { registrarAuditoria } = require('./audit');
// movementTypes NAO importa este servico (nem alertService/stockService) — sem ciclo. Ver a nota
// em `enfileirarMovimentacao` sobre por que `alertService` continua sendo requerido LAZY (dentro
// da funcao), no mesmo padrao de `processarFila`.
const movementTypes = require('./movementTypes');
// toolReminderService so requer `./db` — sem ciclo, top-level seguro (Etapa 12, Task 3).
const toolReminderService = require('./toolReminderService');
// thirdPartyService NAO pode vir para o topo: ele requer `./stockService`, que por sua vez requer
// ESTE arquivo no topo dele (Task 2). Um require de topo aqui fecharia o ciclo
// notificationQueueService -> thirdPartyService -> stockService -> notificationQueueService, e o
// require de stockService dentro de thirdPartyService capturaria o module.exports AINDA VAZIO
// deste arquivo (mid-load) — thirdPartyService.registrarRetorno/enviarRemessa quebrariam em
// producao (stockService seria `{}` para sempre dentro dele). Fica LAZY, dentro de
// `varrerRemessasVencidas`, mesmo padrao/motivo do require lazy de `alertService` abaixo.

const STATUS_VALIDOS = ['PENDENTE', 'ENVIADO', 'FALHA'];

// Revisao da Task 1 (Critical 1): dois drenos concorrentes (duplo clique em /processar,
// reenviar durante um dreno, ou o setInterval da Task 3 sobrepondo um dreno lento) leem a
// mesma linha PENDENTE e enviam o MESMO e-mail duas vezes — o UPDATE para ENVIADO so
// acontece depois do await do SMTP. DECISAO: claim em memoria de processo (Set de ids em
// voo) + re-checagem de elegibilidade no banco apos o claim, em vez de um status
// 'ENVIANDO' persistido. Racional: o app e um processo Node unico (rotas, reenviar e o
// worker da Task 3 vivem todos aqui), entao o Set cobre toda a concorrencia real; o status
// persistido alargaria o dominio do painel/400 congelado e exigiria recuperacao de linhas
// orfas apos crash. Descartado 'ENVIANDO' persistido — se um dia houver 2o processo, esta
// e a linha a revisitar.
const emVoo = new Set();

function hashDedupe(evento, dedupeChave) {
  return crypto.createHash('sha256').update(`${evento}|${dedupeChave}`).digest('hex');
}

// Local, no mesmo padrao de purchaseService.lerConfigNumero (Etapa 11) — este seria o 2o leitor
// declarado da mesma forma (fallback > 0, senao usa o default). O design decidiu NAO unificar
// nesta etapa ("seria o 6o leitor — usar o mesmo padrao local e registrar; unificacao e limpeza
// propria"): duplicacao intencional, registrada aqui.
async function lerConfigNumero(db, chave, fallback) {
  const row = await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [chave]);
  const n = parseFloat(row?.valor);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * RN-01: so grava (status PENDENTE, tentativas 0). Quem envia e o worker (`processarFila`).
 * RN-02: dedupe por `hash_dedupe = sha256(evento|dedupe_chave)`, UNIQUE — reenfileirar o mesmo
 * par e no-op silencioso.
 *
 * Regua de dedupe: `changes === 0` do INSERT OR IGNORE (Fase 2, achado 4 — o insert ignorado
 * MANTEM o lastID anterior; testar por lastID devolveria o id de OUTRA notificacao).
 */
async function enfileirar(db, { evento, dedupe_chave, destinatarios, assunto, corpo_html, corpo_texto, payload }) {
  const destArray = Array.isArray(destinatarios)
    ? destinatarios.map((v) => String(v).trim()).filter(Boolean)
    : (destinatarios ? [String(destinatarios).trim()].filter(Boolean) : []);
  if (!destArray.length) return { enfileirada: false, motivo: 'SEM_DESTINATARIO' };

  const hash = hashDedupe(evento, dedupe_chave);
  const r = await dbRun(db, `INSERT OR IGNORE INTO fila_notificacoes_almoxarifado
    (evento, hash_dedupe, destinatarios, assunto, corpo_html, corpo_texto, payload)
    VALUES (?,?,?,?,?,?,?)`, [
    evento,
    hash,
    JSON.stringify(destArray),
    assunto,
    corpo_html || null,
    corpo_texto || null,
    payload !== undefined ? JSON.stringify(payload) : null,
  ]);

  if (r.changes === 0) return { enfileirada: false, motivo: 'DUPLICADA' };
  return { enfileirada: true, id: r.lastID };
}

/**
 * RN-03: worker. Pega PENDENTE com `proxima_tentativa_em` nula ou <= agora (todos, ou so
 * `opcoes.id` — e o que `reenviar` usa, para nao drenar a fila inteira a cada reenvio manual).
 *
 * Fase 2 (Critical 1): require LAZY do alertService AQUI DENTRO. A Task 3 fecha o ciclo
 * alertService -> este servico -> alertService (o alerta de ZERADO vai enfileirar por aqui); um
 * require de topo neste arquivo cachearia `{}` para um dos dois lados dependendo de quem carrega
 * primeiro — mesmo padrao ja usado em stockService.js:589 para o mesmo tipo de ciclo.
 */
async function processarFila(db, opcoes = {}) {
  const alertService = require('./alertService');

  const params = [];
  let sql = `SELECT * FROM fila_notificacoes_almoxarifado
    WHERE status = 'PENDENTE' AND (proxima_tentativa_em IS NULL OR proxima_tentativa_em <= datetime('now'))`;
  if (opcoes.id) {
    sql += ' AND id = ?';
    params.push(opcoes.id);
  }
  sql += ' ORDER BY id ASC';
  const itens = await dbAll(db, sql, params);

  const maxConfig = await lerConfigNumero(db, 'notificacoes_max_tentativas', 5);
  const intervaloMin = await lerConfigNumero(db, 'notificacoes_worker_intervalo_min', 5);

  let processadas = 0;
  let enviadas = 0;
  let falharam = 0;

  for (const row of itens) {
    // Claim: has+add sao sincronos (sem await no meio — atomico no event loop). Um dreno
    // concorrente que ja esteja com esta linha em voo faz este pular.
    if (emVoo.has(row.id)) continue;
    emVoo.add(row.id);
    try {
      // Re-checagem pos-claim: um dreno concorrente pode ter TERMINADO esta linha entre o
      // SELECT la em cima e este ponto (ai ela ja saiu do Set, mas o status/backoff mudou).
      const atual = await dbGet(db, `SELECT status, tentativas, proxima_tentativa_em FROM fila_notificacoes_almoxarifado
        WHERE id = ? AND status = 'PENDENTE' AND (proxima_tentativa_em IS NULL OR proxima_tentativa_em <= datetime('now'))`, [row.id]);
      if (!atual) continue;
      processadas++;

    // Destinatarios da linha SEMPRE via parseList (Fase 2, achado 3): a coluna e TEXT e as
    // configs semeiam '[]' — split ingenuo por virgula geraria destinatario fantasma "[]".
    const destinatarios = alertService.parseList(row.destinatarios);
    // Revisao da Task 1 (Minor iv): linha sem destinatario util (ex.: '[]' gravado por fora
    // do enfileirar) nem chama o transporte — erro especifico em vez do generico, e a regra
    // de sucesso (`enviados > 0`) garante que ela jamais vira ENVIADO.
    const r = destinatarios.length > 0
      ? await alertService.enviarEmail(db, destinatarios, row.assunto, row.corpo_html, row.corpo_texto)
      : { enviados: 0, erros: ['Sem destinatário válido'] };
    // Sucesso = enviados > 0, NUNCA erros.length === 0 (lista vazia devolve {enviados:0, erros:[]}).
    const ok = r.enviados > 0;

    if (ok) {
      await dbRun(db, `UPDATE fila_notificacoes_almoxarifado
        SET status = 'ENVIADO', enviado_em = CURRENT_TIMESTAMP WHERE id = ?`, [row.id]);
      enviadas++;
      continue;
    }

    const erro = (r.erros && r.erros[0]) || 'Falha no envio';
    const proxTentativas = atual.tentativas + 1;
    // Fase 2 (achado 9): a linha de aviso (FALHA_NOTIFICACAO) nao tem coluna de max proprio —
    // regra literal aqui: max 1 tentativa, nunca recursa gerando aviso de si mesma.
    const maxTentativas = row.evento === 'FALHA_NOTIFICACAO' ? 1 : maxConfig;

    if (proxTentativas >= maxTentativas) {
      await dbRun(db, `UPDATE fila_notificacoes_almoxarifado
        SET status = 'FALHA', tentativas = ?, ultimo_erro = ? WHERE id = ?`,
        [proxTentativas, erro, row.id]);
      falharam++;

      // RN-03 emendada (Fase 2, achado 3b): a transicao para FALHA acontece MESMO que o aviso
      // ao admin nao seja enfileiravel (alertas_estoque_emails vazio -> SEM_DESTINATARIO) ou
      // exploda por outro motivo — nunca derruba o worker nem desfaz o UPDATE acima.
      if (row.evento !== 'FALHA_NOTIFICACAO') {
        try {
          const adminDest = alertService.parseList(await alertService.getConfigValue(db, 'alertas_estoque_emails'));
          await enfileirar(db, {
            evento: 'FALHA_NOTIFICACAO',
            dedupe_chave: `falha-${row.id}`,
            destinatarios: adminDest,
            assunto: `[Almoxarifado] Falha ao enviar notificação #${row.id}`,
            corpo_html: `<p>A notificação #${row.id} (evento ${row.evento}) falhou após ${proxTentativas} tentativa(s).</p><p>Último erro: ${erro}</p>`,
            corpo_texto: `A notificação #${row.id} (evento ${row.evento}) falhou após ${proxTentativas} tentativa(s). Último erro: ${erro}`,
            payload: { notificacao_id: row.id, evento_original: row.evento },
          });
        } catch (avisoErr) {
          console.warn('[almoxarifado-notificacoes] Falha ao enfileirar aviso de FALHA_NOTIFICACAO:', avisoErr.message);
        }
      }
    } else {
      // Backoff CALCULADO EM JS (Fase 2, achado 2): SQLite nao tem `^` (SQLITE_ERROR) e em JS
      // `^` e XOR. Math.pow entra como parametro ligado no datetime() do SQLite.
      const minutos = intervaloMin * Math.pow(2, proxTentativas);
      await dbRun(db, `UPDATE fila_notificacoes_almoxarifado
        SET tentativas = ?, ultimo_erro = ?, proxima_tentativa_em = datetime('now', '+' || ? || ' minutes')
        WHERE id = ?`, [proxTentativas, erro, minutos, row.id]);
      falharam++;
    }
    } finally {
      emVoo.delete(row.id);
    }
  }

  // `processadas` conta so as linhas efetivamente tentadas (claim + re-checagem passaram) —
  // linha pulada por outro dreno em voo nao conta como processada.
  return { processadas, enviadas, falharam };
}

/**
 * RN-08: reenvio manual gateado (rota chama isto). Reseta para PENDENTE com tentativas/erro/
 * proxima_tentativa_em/enviado_em zerados, audita (dados_novos OBJETO — licao da Etapa 11) e
 * processa NA HORA — so este item (`processarFila(db, { id })`), senao o botao da tela
 * drenaria a fila inteira e acoplaria os testes de itens nao relacionados.
 *
 * Revisao da Task 1 (Important ii): reenviar linha ja ENVIADA e PERMITIDO de proposito — e o
 * unico jeito de reemitir um e-mail que se perdeu depois do SMTP aceitar (o dedupe do
 * enfileirar bloqueia re-enfileirar o mesmo evento). O reset limpa `enviado_em` junto, senao a
 * linha reprocessada que falhar ficaria PENDENTE/FALHA com carimbo de enviada — o painel
 * mentiria. Alternativa descartada: 400 para ENVIADO (tiraria do admin o unico caminho de
 * reemissao). Registrado na RN-08 do design.
 */
async function reenviar(db, usuario, id) {
  const row = await dbGet(db, 'SELECT * FROM fila_notificacoes_almoxarifado WHERE id = ?', [id]);
  if (!row) {
    throw Object.assign(new Error('Notificação não encontrada'), { status: 404 });
  }

  await dbRun(db, `UPDATE fila_notificacoes_almoxarifado
    SET status = 'PENDENTE', tentativas = 0, ultimo_erro = NULL, proxima_tentativa_em = NULL, enviado_em = NULL
    WHERE id = ?`, [id]);

  await registrarAuditoria(db, {
    entidade: 'notificacao',
    entidade_id: id,
    acao: 'REENVIAR',
    usuario_id: usuario?.id,
    usuario_nome: usuario?.nome || usuario?.email,
    dados_novos: { notificacao_id: id, evento: row.evento },
  });

  await processarFila(db, { id });

  const atualizado = await dbGet(db, 'SELECT status FROM fila_notificacoes_almoxarifado WHERE id = ?', [id]);
  return { success: true, status: atualizado.status };
}

// Etapa 12, Task 2 (RN-05): mapa LITERAL chave->config. Revisao da Task 2 (M1): a varredura do
// configuracoesGerais.api.test.js hoje so percorre as chaves do array CAMPOS do CLIENTE — estas
// 4 chaves ainda nao estao la (entram na Task 4), entao o literal e ANTECIPATORIO: garante que,
// quando a Task 4 as puser em CAMPOS, a amarracao cliente<->servidor ja enxergue o leitor daqui
// (template string sumiria da varredura). Classes sem entrada aqui (compras, etc.) nao passam
// por enfileirarMovimentacao.
const DEST_POR_CLASSE = {
  entradas: 'notificacoes_dest_entradas',
  saidas: 'notificacoes_dest_saidas',
  ajustes: 'notificacoes_dest_ajustes',
  terceiros: 'notificacoes_dest_terceiros',
};

/**
 * RN-05: resolve a classe do TIPO com precedencia FIXA (Fase 2) — sufixo `_TERCEIRO` > prefixo
 * `AJUSTE` > `TIPOS_ENTRADA`/`TIPOS_SAIDA` de `movementTypes` (fonte unica). Sem a precedencia,
 * `AJUSTE_POSITIVO`/`AJUSTE_NEGATIVO` (que estao em TIPOS_ENTRADA/TIPOS_SAIDA) cairiam em
 * entradas/saidas por acidente da ordem dos ifs; `CONSUMO_TERCEIRO`/`PERDA_TERCEIRO` (tambem em
 * TIPOS_SAIDA) cairiam em saidas em vez de terceiros. Tipo que nao bate em nenhuma das tres
 * regras (RESERVA, LIBERACAO_RESERVA, TRANSFERENCIA, BLOQUEIO, DESBLOQUEIO, QUARENTENA,
 * RETRABALHO e afins — retencao/remanejo, nao entrada/saida) devolve null: esses tipos passam
 * pelo motor em toda requisicao aprovada e virariam spam de e-mail (RN-04).
 */
function resolverClasseMovimentacao(tipo) {
  if (typeof tipo !== 'string') return null;
  // Revisao da Task 2 (I3): REMESSA/RETORNO a terceiro sao RETENCAO — mexem so em
  // quantidade_em_terceiros, o saldo global NAO muda, entao o e-mail diria "30 KG" com saldo
  // identico (ilegivel); e enviarRemessa chama o motor ITEM A ITEM (thirdPartyService:241) —
  // uma remessa de 10 itens viraria 10 e-mails, a mesma familia de spam que a emenda da Fase 2
  // cortou para RESERVA. Ficam fora de proposito; o canal da remessa e o alerta de remessa
  // VENCIDA (Task 3). CONSUMO_TERCEIRO/PERDA_TERCEIRO continuam: sao saida de verdade.
  if (tipo === 'REMESSA_TERCEIRO' || tipo === 'RETORNO_TERCEIRO') return null;
  if (tipo.endsWith('_TERCEIRO')) return 'terceiros';
  if (tipo.startsWith('AJUSTE')) return 'ajustes';
  if (movementTypes.TIPOS_ENTRADA.includes(tipo)) return 'entradas';
  if (movementTypes.TIPOS_SAIDA.includes(tipo)) return 'saidas';
  return null;
}

/**
 * RN-04/RN-05: chamada pelo gancho pos-commit de `stockService.registrarMovimentacao`, depois
 * que TODAS as escritas atomicas do motor ja tiveram sucesso — movimentacao que falha em
 * qualquer guarda nunca chega aqui (o try/catch do gancho e quem impede isto de derrubar o
 * motor, nao esta funcao). `movimentacao` e o objeto montado pelo gancho: { id, tipo, quantidade,
 * saldo_anterior, saldo_posterior, justificativa, motivo, referencia, lote_id, lote_codigo,
 * projeto_id, os_id, cliente_id, requisicao_id, documento_vinculado }. `materialRow` e o material
 * completo (codigo, nome, unidade) ja carregado pelo motor — nenhuma query nova aqui so pra isso.
 *
 * Tipo sem classe: NAO enfileira, sem consultar config nem destinatario (RN-04, `SEM_CLASSE`).
 * Classe resolvida sem config propria (ou config vazia): cai em `alertas_estoque_emails` — o
 * fallback so vale para classe resolvida, nunca para SEM_CLASSE (RN-05). Sem destinatario nenhum
 * (nem classe, nem fallback): `enfileirar` ja devolve SEM_DESTINATARIO sem quebrar nada.
 */
async function enfileirarMovimentacao(db, movimentacao, materialRow, user) {
  // Require LAZY (mesmo padrao/motivo de `processarFila`): alertService nao entra no topo deste
  // arquivo para nao fixar uma ordem de carregamento que a Task 3 (alerta de ZERADO enfileirando
  // por aqui) pode inverter, criando o ciclo alertService -> este servico -> alertService.
  const alertService = require('./alertService');

  const classe = resolverClasseMovimentacao(movimentacao.tipo);
  if (!classe) return { enfileirada: false, motivo: 'SEM_CLASSE' };

  const chaveClasse = DEST_POR_CLASSE[classe];
  const configClasse = await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [chaveClasse]);
  let destinatarios = alertService.parseList(configClasse?.valor);
  if (!destinatarios.length) {
    const fallback = await alertService.getConfigValue(db, 'alertas_estoque_emails');
    destinatarios = alertService.parseList(fallback);
  }

  const appUrlDb = await alertService.getConfigValue(db, alertService.APP_URL_CONFIG_KEY);
  const appBase = alertService.resolveAppBaseUrl(appUrlDb);
  const link = `${appBase}/almoxarifado/movimentacoes?destaque=${movimentacao.id}`;

  const dataHora = alertService.formatDateTimePtBr();
  const materialLabel = `${materialRow.codigo} — ${materialRow.nome}`;
  const usuarioLabel = user?.nome || user?.email || `usuário #${user?.id}`;
  const assunto = `[Almoxarifado] ${movimentacao.tipo} — ${materialRow.codigo}`;

  // Conteudo minimo da spec 14.1 (RN-04): tipo, id, data/hora, usuario, material, quantidade+
  // unidade, saldo anterior/posterior, lote quando houver, projeto/OS/cliente/requisicao quando
  // houver, justificativa/motivo, link direto.
  const linhas = [
    `Tipo: ${movimentacao.tipo}`,
    `Movimentação: #${movimentacao.id}`,
    `Data/hora: ${dataHora}`,
    `Usuário: ${usuarioLabel}`,
    `Material: ${materialLabel}`,
    // Revisao da Task 2 (M4): em AJUSTE/AJUSTE_INVENTARIO a quantidade e o VALOR ABSOLUTO
    // aplicado (novo total), nao o delta — o mesmo rotulo "Quantidade" para as duas contas
    // faria o leitor somar um novo-total como se fosse delta.
    `${['AJUSTE', 'AJUSTE_INVENTARIO'].includes(movimentacao.tipo) ? 'Quantidade (novo total)' : 'Quantidade'}: ${movimentacao.quantidade} ${materialRow.unidade || ''}`.trim(),
    `Saldo anterior: ${movimentacao.saldo_anterior}`,
    `Saldo posterior: ${movimentacao.saldo_posterior}`,
  ];
  // lote_codigo (Fase 2): sempre o loteCodigoFinal que o gancho resolveu, NUNCA o lote cru — ver
  // a nota do brief da Task 2 sobre o lote_id vir null quando a chamada usou o CODIGO do lote.
  if (movimentacao.lote_codigo) linhas.push(`Lote: ${movimentacao.lote_codigo}`);
  // Revisao da Task 2 (I1): a RN-04 pede "lote/serie quando houver" — serie faltava. O gancho
  // passa os numeros ja resolvidos pelo motor (seriesAfetadas/seriesClaim), nao o input cru.
  if (Array.isArray(movimentacao.serie_numeros) && movimentacao.serie_numeros.length) {
    linhas.push(`Séries: ${movimentacao.serie_numeros.join(', ')}`);
  }
  if (movimentacao.projeto_id) linhas.push(`Projeto: #${movimentacao.projeto_id}`);
  if (movimentacao.os_id) linhas.push(`OS: #${movimentacao.os_id}`);
  if (movimentacao.cliente_id) linhas.push(`Cliente: #${movimentacao.cliente_id}`);
  if (movimentacao.requisicao_id) linhas.push(`Requisição: #${movimentacao.requisicao_id}`);
  if (movimentacao.documento_vinculado) linhas.push(`Documento: ${movimentacao.documento_vinculado}`);
  // Revisao da Task 2 (M2/M3): motivo e justificativa sao campos DISTINTOS no livro — rotular
  // um pelo nome do outro e mentira pequena; e `referencia` era passada pelo gancho e nunca
  // renderizada (campo morto).
  if (movimentacao.motivo) linhas.push(`Motivo: ${movimentacao.motivo}`);
  if (movimentacao.justificativa) linhas.push(`Justificativa: ${movimentacao.justificativa}`);
  if (movimentacao.referencia) linhas.push(`Referência: ${movimentacao.referencia}`);
  linhas.push(`Link: ${link}`);

  const corpo_texto = linhas.join('\n');
  const corpo_html = `<div>${linhas.map((l) => `<p>${alertService.escapeHtml(l)}</p>`).join('\n')}</div>`;

  return enfileirar(db, {
    evento: 'MOVIMENTACAO',
    // RN-02: dedupe por movimentacao — a mesma movimentacao nunca gera dois e-mails mesmo se o
    // gancho for chamado duas vezes por engano.
    dedupe_chave: `mov-${movimentacao.id}`,
    destinatarios,
    assunto,
    corpo_html,
    corpo_texto,
    payload: { movimentacao_id: movimentacao.id, tipo: movimentacao.tipo, material_id: materialRow.id },
  });
}

/**
 * Revisao da Task 2 (I2): cancelar movimentacao (estorno) precisa impedir o e-mail da
 * movimentacao original que ainda NAO saiu — sem isto, o destinatario recebia aviso de uma
 * saida que nao existe mais no saldo (o ESTORNO nasce de INSERT direto e nunca passa pelo
 * gancho, entao nao ha "e-mail de correcao"). Linha PENDENTE vira FALHA com erro literal —
 * mantem historico (D4: a fila E o historico), nao envia, e o painel conta a verdade. Linha
 * ja ENVIADA fica como esta: o e-mail saiu de fato; correcao retroativa e corte declarado
 * (letra B). Corrida residual: se o worker ja passou da re-checagem pos-claim desta linha, o
 * envio desta rodada nao e mais alcancavel — janela de milissegundos, aceita e documentada.
 */
async function suprimirNotificacaoMovimentacao(db, movimentacaoId) {
  const hash = hashDedupe('MOVIMENTACAO', `mov-${movimentacaoId}`);
  const r = await dbRun(db, `UPDATE fila_notificacoes_almoxarifado
    SET status = 'FALHA', ultimo_erro = 'Movimentação cancelada antes do envio'
    WHERE hash_dedupe = ? AND status = 'PENDENTE'`, [hash]);
  return { suprimida: r.changes > 0 };
}

// ── Etapa 12, Task 3 (RN-06/RN-07): varreduras dos jobs diarios ────────────────────────────────
// As tres funcoes abaixo sao chamadas por `routes/almoxarifado.js` (job diario, setInterval
// .unref()) e pelos testes DIRETO — nunca esperando o setInterval (mesmo padrao do worker da
// fila). Cada uma so ENFILEIRA (RN-01): quem envia e sempre o worker de `processarFila`.

/**
 * RN-06: lembrete de ferramenta vencida. Fonte unica —
 * `toolReminderService.listarEmprestimosVencidos` (funcao pura da 9b, ja confirmada pela Fase 2:
 * devolve `e.*` + `ferramenta_nome`/`codigo_patrimonio`/`dias_vencido`). Dedupe
 * `ferramenta-lembrete-<emprestimo_id>-<hoje>` — UM POR DIA, nao um por execucao do job; `hoje`
 * em UTC (`toISOString().slice(0,10)`) para casar com o `date('now')` do SQL do proprio
 * `listarEmprestimosVencidos` (data local duplicaria o lembrete na janela 21h-meia-noite, achado
 * verificado pela Fase 2).
 */
async function varrerLembretesFerramenta(db) {
  const alertService = require('./alertService');
  const emprestimos = await toolReminderService.listarEmprestimosVencidos(db);
  const hoje = new Date().toISOString().slice(0, 10);
  const destinatarios = alertService.parseList(await alertService.getConfigValue(db, 'alertas_estoque_emails'));

  let enfileiradas = 0;
  for (const emp of emprestimos) {
    const linhas = [
      `Ferramenta: ${emp.ferramenta_nome}`,
      `Patrimônio: ${emp.codigo_patrimonio || '-'}`,
      `Empréstimo: #${emp.id}`,
      `Responsável: ${emp.colaborador_nome}`,
      `Devolução prevista: ${emp.data_prevista_devolucao}`,
      `Dias vencido: ${emp.dias_vencido}`,
    ];
    const r = await enfileirar(db, {
      evento: 'FERRAMENTA_LEMBRETE',
      dedupe_chave: `ferramenta-lembrete-${emp.id}-${hoje}`,
      destinatarios,
      assunto: `[Almoxarifado] Ferramenta vencida — ${emp.codigo_patrimonio || emp.ferramenta_nome}`,
      corpo_texto: linhas.join('\n'),
      corpo_html: `<div>${linhas.map((l) => `<p>${alertService.escapeHtml(l)}</p>`).join('\n')}</div>`,
      payload: { emprestimo_id: emp.id },
    });
    if (r.enfileirada) enfileiradas++;
  }
  return { total: emprestimos.length, enfileiradas };
}

/**
 * RN-07: lote proximo do vencimento. `STATUS_LOTE = ['ATIVO','BLOQUEADO','REPROVADO']`
 * (lotService:15) — so ATIVO participa. Janela: `data_validade` entre hoje e
 * `+alerta_lote_vencendo_dias` (config, default 30). Saldo: mesmo precedente de
 * `lotService.listarLotesDoMaterial` (lotService:206) — `SUM(quantidade)` das linhas de
 * `estoque_saldo_almoxarifado` do lote, so > 0 participa. Lote com `vencimento_liberado_em`
 * preenchido SAI da varredura (decisao registrada, letra D do design — a liberacao e decisao
 * humana de usar mesmo vencendo; alertar de novo seria ruido). Dedupe
 * `lote-vencendo-<lote_id>-<data_validade>` — um aviso por lote/validade, nao por dia (mudar a
 * validade do lote pode avisar de novo).
 */
async function varrerLotesVencendo(db) {
  const alertService = require('./alertService');
  const dias = await lerConfigNumero(db, 'alerta_lote_vencendo_dias', 30);

  const lotes = await dbAll(db, `
    SELECT l.*, m.codigo AS material_codigo, m.nome AS material_nome, m.unidade AS material_unidade,
      COALESCE((SELECT SUM(s.quantidade) FROM estoque_saldo_almoxarifado s WHERE s.lote_id = l.id), 0) AS saldo
    FROM lotes_almoxarifado l
    JOIN materiais_almoxarifado m ON m.id = l.material_id
    WHERE l.status = 'ATIVO'
      AND l.data_validade IS NOT NULL
      AND date(l.data_validade) BETWEEN date('now') AND date('now', '+' || ? || ' days')
      AND l.vencimento_liberado_em IS NULL`, [dias]);

  const lotesComSaldo = lotes.filter((l) => Number(l.saldo) > 0);
  const destinatarios = alertService.parseList(await alertService.getConfigValue(db, 'alertas_estoque_emails'));

  let enfileiradas = 0;
  for (const lote of lotesComSaldo) {
    const linhas = [
      `Lote: ${lote.codigo}`,
      `Material: ${lote.material_codigo} — ${lote.material_nome}`,
      `Validade: ${lote.data_validade}`,
      `Saldo: ${lote.saldo} ${lote.material_unidade || ''}`.trim(),
    ];
    const r = await enfileirar(db, {
      evento: 'LOTE_VENCENDO',
      dedupe_chave: `lote-vencendo-${lote.id}-${lote.data_validade}`,
      destinatarios,
      assunto: `[Almoxarifado] Lote vencendo — ${lote.codigo}`,
      corpo_texto: linhas.join('\n'),
      corpo_html: `<div>${linhas.map((l) => `<p>${alertService.escapeHtml(l)}</p>`).join('\n')}</div>`,
      payload: { lote_id: lote.id },
    });
    if (r.enfileirada) enfileiradas++;
  }
  return { total: lotesComSaldo.length, enfileiradas };
}

/**
 * RN-07: remessa a terceiro vencida. A rota `/remessas-terceiros/vencidas` so DELEGA — a fonte
 * UNICA e `thirdPartyService.listarRemessas(db, { vencidas: '1' })` (thirdPartyService.js:322),
 * que ja filtra `status IN ('ENVIADA','RETORNO_PARCIAL') AND date(prazo_previsto) < date('now')`.
 * Nada a extrair, nada a refatorar. A coluna e `prazo_previsto` (nao `data_prevista`). Dedupe
 * `remessa-vencida-<remessa_id>-<prazo_previsto>`.
 */
async function varrerRemessasVencidas(db) {
  const alertService = require('./alertService');
  // Lazy — ver a nota no topo do arquivo sobre o ciclo thirdPartyService -> stockService -> este
  // servico.
  const thirdPartyService = require('./thirdPartyService');
  const remessas = await thirdPartyService.listarRemessas(db, { vencidas: '1' });
  const destinatarios = alertService.parseList(await alertService.getConfigValue(db, 'alertas_estoque_emails'));

  let enfileiradas = 0;
  for (const r of remessas) {
    const linhas = [
      `Remessa: ${r.numero || `#${r.id}`}`,
      `Fornecedor: ${r.fornecedor_nome || '-'}`,
      `Prazo previsto: ${r.prazo_previsto}`,
      `Status: ${r.status}`,
      `Itens: ${r.itens_total}`,
    ];
    const res = await enfileirar(db, {
      evento: 'REMESSA_VENCIDA',
      dedupe_chave: `remessa-vencida-${r.id}-${r.prazo_previsto}`,
      destinatarios,
      assunto: `[Almoxarifado] Remessa vencida — ${r.numero || `#${r.id}`}`,
      corpo_texto: linhas.join('\n'),
      corpo_html: `<div>${linhas.map((l) => `<p>${alertService.escapeHtml(l)}</p>`).join('\n')}</div>`,
      payload: { remessa_id: r.id },
    });
    if (res.enfileirada) enfileiradas++;
  }
  return { total: remessas.length, enfileiradas };
}

module.exports = {
  STATUS_VALIDOS,
  enfileirar,
  processarFila,
  reenviar,
  enfileirarMovimentacao,
  resolverClasseMovimentacao,
  suprimirNotificacaoMovimentacao,
  DEST_POR_CLASSE,
  varrerLembretesFerramenta,
  varrerLotesVencendo,
  varrerRemessasVencidas,
};
