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

module.exports = {
  STATUS_VALIDOS,
  enfileirar,
  processarFila,
  reenviar,
};
