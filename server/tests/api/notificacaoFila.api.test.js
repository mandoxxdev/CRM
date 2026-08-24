/**
 * Etapa 12, Task 1 — RN-01, RN-02, RN-03, RN-08, RN-09: fila de notificacoes, worker de envio
 * (retry/backoff/FALHA), reenvio manual e painel gateado.
 *
 * O harness nao tem SMTP configurado (schema.js semeia alertas_smtp_host/from vazios) — todo
 * teste de envio aqui prova o CAMINHO DA FALHA (`alertService.enviarEmail` devolve
 * `{ enviados: 0, erros: ['SMTP não configurado'] }`), que e exatamente o comportamento de
 * producao sem SMTP configurado. NAO mockar nodemailer.
 *
 * Executar: cd server && node tests/api/notificacaoFila.api.test.js
 */
const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

// RN-01 (Fase 2, achado 1) / teste "ciclo de require": requer alertService ANTES do queue
// service, na mesma ordem de producao (routes/almoxarifado.js carrega o alertService primeiro).
// Prova que processarFila nunca ve um alertService com enviarEmail undefined.
const alertService = require('../../services/almoxarifado/alertService');
const queueService = require('../../services/almoxarifado/notificationQueueService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const GESTOR = { id: 2, nome: 'Gestor', role: 'usuario', perfil_almoxarifado: 'GESTOR', email: 'gestor@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };
const COMPRAS = { id: 5, nome: 'Comprador', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'compras@test.com' };
const PRODUCAO = { id: 9, nome: 'Producao', role: 'usuario', email: 'producao@test.com' };

function hashDedupe(evento, dedupeChave) {
  return crypto.createHash('sha256').update(`${evento}|${dedupeChave}`).digest('hex');
}

let seq = 0;
async function enfileirarDireto(db, over = {}) {
  seq += 1;
  return queueService.enfileirar(db, {
    evento: over.evento || 'MOVIMENTACAO',
    dedupe_chave: over.dedupe_chave || `teste-${seq}`,
    destinatarios: over.destinatarios !== undefined ? over.destinatarios : ['dest@teste.com'],
    assunto: over.assunto || `[Almoxarifado] Teste ${seq}`,
    corpo_html: over.corpo_html || `<p>corpo ${seq}</p>`,
    corpo_texto: over.corpo_texto || `corpo ${seq}`,
    payload: over.payload,
  });
}

async function setMaxTentativas(db, valor) {
  await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = ? WHERE chave = 'notificacoes_max_tentativas'`, [String(valor)]);
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  await test('RN-01: enfileirar so grava PENDENTE, nada e enviado', async () => {
    const r = await enfileirarDireto(db, { dedupe_chave: 'rn01-1' });
    assert.strictEqual(r.enfileirada, true, JSON.stringify(r));
    assert.ok(r.id, JSON.stringify(r));

    const row = await dbGet(db, 'SELECT * FROM fila_notificacoes_almoxarifado WHERE id = ?', [r.id]);
    assert.ok(row, 'linha deveria existir');
    assert.strictEqual(row.status, 'PENDENTE', JSON.stringify(row));
    assert.strictEqual(row.tentativas, 0, JSON.stringify(row));
    assert.strictEqual(row.enviado_em, null, JSON.stringify(row));
    assert.ok(row.corpo_html && row.corpo_html.includes('corpo'), 'corpo deveria estar gravado');
  });

  await test('RN-02: dedupe — mesmo evento+chave e no-op', async () => {
    const r1 = await enfileirarDireto(db, { evento: 'TESTE_RN02', dedupe_chave: 'rn02-mesma' });
    assert.strictEqual(r1.enfileirada, true, JSON.stringify(r1));

    const r2 = await enfileirarDireto(db, { evento: 'TESTE_RN02', dedupe_chave: 'rn02-mesma' });
    assert.deepStrictEqual(r2, { enfileirada: false, motivo: 'DUPLICADA' });

    const linhas = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = 'TESTE_RN02'`);
    assert.strictEqual(linhas.length, 1, JSON.stringify(linhas));

    const r3 = await enfileirarDireto(db, { evento: 'TESTE_RN02', dedupe_chave: 'rn02-outra' });
    assert.strictEqual(r3.enfileirada, true, JSON.stringify(r3));
    const linhas2 = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = 'TESTE_RN02'`);
    assert.strictEqual(linhas2.length, 2, JSON.stringify(linhas2));
  });

  await test('RN-01: sem destinatario nao enfileira', async () => {
    const r = await enfileirarDireto(db, { evento: 'TESTE_RN01B', destinatarios: [] });
    assert.deepStrictEqual(r, { enfileirada: false, motivo: 'SEM_DESTINATARIO' });

    const r2 = await enfileirarDireto(db, { evento: 'TESTE_RN01B', destinatarios: null });
    assert.deepStrictEqual(r2, { enfileirada: false, motivo: 'SEM_DESTINATARIO' });
  });

  await test('RN-03: falha de envio registra tentativa, backoff e mantem PENDENTE', async () => {
    const r = await enfileirarDireto(db, { evento: 'TESTE_RN03', dedupe_chave: 'rn03-1' });
    assert.strictEqual(r.enfileirada, true, JSON.stringify(r));

    const resultado = await queueService.processarFila(db, { id: r.id });
    assert.strictEqual(resultado.processadas, 1, JSON.stringify(resultado));
    assert.strictEqual(resultado.enviadas, 0, JSON.stringify(resultado));
    // Revisao final (M1): retentativa agendada NAO e falha definitiva — `falharam` conta so
    // transicao para FALHA; backoff conta em `reagendadas` (o toast dizia "7 falha(s)" com o
    // card "0 falhas" do lado).
    assert.strictEqual(resultado.falharam, 0, JSON.stringify(resultado));
    assert.strictEqual(resultado.reagendadas, 1, JSON.stringify(resultado));

    const row = await dbGet(db, 'SELECT * FROM fila_notificacoes_almoxarifado WHERE id = ?', [r.id]);
    assert.strictEqual(row.status, 'PENDENTE', JSON.stringify(row));
    assert.strictEqual(row.tentativas, 1, JSON.stringify(row));
    // LITERAL: um TypeError de .join ou lista vazia dariam outro texto — este e o assert que
    // prova o parseList e o caminho real do enviarEmail sem SMTP configurado.
    assert.strictEqual(row.ultimo_erro, 'SMTP não configurado', JSON.stringify(row));
    assert.ok(row.proxima_tentativa_em, 'deveria ter marcado proxima_tentativa_em');

    // Assert numerico: backoff = notificacoes_worker_intervalo_min(5) * 2^1 = 10 min. So o
    // expoente CERTO passa (5*2^0=5 nao passaria no >= 10).
    const diffRow = await dbGet(db,
      `SELECT (julianday(proxima_tentativa_em) - julianday('now')) * 24 * 60 AS diff_min
       FROM fila_notificacoes_almoxarifado WHERE id = ?`, [r.id]);
    assert.ok(diffRow.diff_min >= 9.5, `backoff deveria ser >= 10 min, veio ${diffRow.diff_min}`);

    // Processar de novo IMEDIATAMENTE: proxima_tentativa_em no futuro -> inelegivel.
    const resultado2 = await queueService.processarFila(db, { id: r.id });
    assert.strictEqual(resultado2.processadas, 0, JSON.stringify(resultado2));
    const row2 = await dbGet(db, 'SELECT tentativas FROM fila_notificacoes_almoxarifado WHERE id = ?', [r.id]);
    assert.strictEqual(row2.tentativas, 1, JSON.stringify(row2));
  });

  await test('RN-03: FALHA apos max e aviso ao admin UMA vez', async () => {
    // Fase 2 (Critical 3): o seed e '[]' — sem configurar aqui o aviso morre em
    // SEM_DESTINATARIO e o teste nao pode passar.
    await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = '["admin@gmp.com"]' WHERE chave = 'alertas_estoque_emails'`);
    await setMaxTentativas(db, 1);

    const r = await enfileirarDireto(db, { evento: 'TESTE_RN05', dedupe_chave: 'rn05-1' });
    assert.strictEqual(r.enfileirada, true, JSON.stringify(r));

    const resultado = await queueService.processarFila(db, { id: r.id });
    assert.strictEqual(resultado.falharam, 1, JSON.stringify(resultado));

    const row = await dbGet(db, 'SELECT status FROM fila_notificacoes_almoxarifado WHERE id = ?', [r.id]);
    assert.strictEqual(row.status, 'FALHA', JSON.stringify(row));

    // Busca por CONTEUDO (payload.notificacao_id), nao pela hash exata — a hash e detalhe de
    // implementacao (`dedupe_chave`); o que a RN-03 promete e "uma notificacao de falha por
    // notificacao original", nao uma chave especifica.
    async function avisosDe(notificacaoId) {
      const todos = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = 'FALHA_NOTIFICACAO'`);
      return todos.filter((a) => {
        try { return JSON.parse(a.payload).notificacao_id === notificacaoId; } catch (e) { return false; }
      });
    }

    const avisos = await avisosDe(r.id);
    assert.strictEqual(avisos.length, 1, JSON.stringify(avisos));
    assert.strictEqual(avisos[0].evento, 'FALHA_NOTIFICACAO', JSON.stringify(avisos));

    // (a) A linha de aviso tem max proprio 1 e, ao ser processada, vai direto pra FALHA sem
    // gerar aviso de si mesma (guarda por `row.evento !== 'FALHA_NOTIFICACAO'`).
    await queueService.processarFila(db, { id: avisos[0].id });
    await queueService.processarFila(db, { id: avisos[0].id });

    // (b) A MESMA notificacao original falhando de novo (ex.: reenvio que falha outra vez) NAO
    // pode duplicar o aviso — o dedupe e por notificacao (`falha-<id>`), nao por tentativa.
    // Simula um novo ciclo de falha reabrindo o item (sem passar por `reenviar`, que zera
    // tentativas — aqui queremos MANTER tentativas != 0 para provar que a chave nao depende
    // dele) e reprocessando, escopado ao proprio id (nao drena a fila inteira nem mexe em
    // linhas de outros testes).
    await dbRun(db, `UPDATE fila_notificacoes_almoxarifado SET status = 'PENDENTE', proxima_tentativa_em = NULL WHERE id = ?`, [r.id]);
    await queueService.processarFila(db, { id: r.id });
    await dbRun(db, `UPDATE fila_notificacoes_almoxarifado SET status = 'PENDENTE', proxima_tentativa_em = NULL WHERE id = ?`, [r.id]);
    await queueService.processarFila(db, { id: r.id });

    // Se o dedupe quebrar (ex.: chave passa a incluir `tentativas`), cada ciclo de falha gera
    // uma hash NOVA e uma segunda linha nasce.
    const avisosDepois = await avisosDe(r.id);
    assert.strictEqual(avisosDepois.length, 1, JSON.stringify(avisosDepois));

    await setMaxTentativas(db, 5);
  });

  await test('RN-03: FALHA acontece mesmo SEM admin configurado', async () => {
    await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = '[]' WHERE chave = 'alertas_estoque_emails'`);
    await setMaxTentativas(db, 1);

    const r = await enfileirarDireto(db, { evento: 'TESTE_RN05B', dedupe_chave: 'rn05b-1' });
    assert.strictEqual(r.enfileirada, true, JSON.stringify(r));

    const resultado = await queueService.processarFila(db, { id: r.id });
    assert.strictEqual(resultado.falharam, 1, JSON.stringify(resultado));

    const row = await dbGet(db, 'SELECT status FROM fila_notificacoes_almoxarifado WHERE id = ?', [r.id]);
    assert.strictEqual(row.status, 'FALHA', JSON.stringify(row));

    const hashAviso = hashDedupe('FALHA_NOTIFICACAO', `falha-${r.id}`);
    const avisos = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE hash_dedupe = ?`, [hashAviso]);
    assert.strictEqual(avisos.length, 0, JSON.stringify(avisos));

    await setMaxTentativas(db, 5);
  });

  await test('RN-01: ciclo de require nao quebra o envio (alertService requerido antes do queue service)', async () => {
    assert.strictEqual(typeof alertService.enviarEmail, 'function',
      'alertService.enviarEmail deveria estar definido (require de topo, ordem de producao)');

    const r = await enfileirarDireto(db, { evento: 'TESTE_RN01C', dedupe_chave: 'rn01c-1' });
    assert.strictEqual(r.enfileirada, true, JSON.stringify(r));

    const resultado = await queueService.processarFila(db, { id: r.id });
    assert.strictEqual(resultado.reagendadas, 1, JSON.stringify(resultado)); // tentativa 1 de 5 = backoff

    const row = await dbGet(db, 'SELECT ultimo_erro FROM fila_notificacoes_almoxarifado WHERE id = ?', [r.id]);
    assert.strictEqual(row.ultimo_erro, 'SMTP não configurado', JSON.stringify(row));
    assert.ok(!/is not a function/i.test(row.ultimo_erro || ''), 'nao pode ser TypeError de enviarEmail undefined');
  });

  await test('RN-08: reenviar reseta, processa e audita', async () => {
    await setMaxTentativas(db, 1);
    const r = await enfileirarDireto(db, { evento: 'TESTE_RN08', dedupe_chave: 'rn08-1' });
    await queueService.processarFila(db, { id: r.id });
    const antes = await dbGet(db, 'SELECT status, tentativas FROM fila_notificacoes_almoxarifado WHERE id = ?', [r.id]);
    assert.strictEqual(antes.status, 'FALHA', JSON.stringify(antes));
    assert.strictEqual(antes.tentativas, 1, JSON.stringify(antes));

    setUser(ADMIN);
    const res = await request(app).post(`/api/almoxarifado/notificacoes/${r.id}/reenviar`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.success, true, JSON.stringify(res.body));

    // Reenviar zerou tentativas e processou NA HORA: SMTP ainda ausente -> falha de novo ->
    // tentativas volta a 0+1=1 (max=1 -> ja marca FALHA de novo).
    const depois = await dbGet(db, 'SELECT status, tentativas FROM fila_notificacoes_almoxarifado WHERE id = ?', [r.id]);
    assert.strictEqual(depois.tentativas, 1, JSON.stringify(depois));
    assert.strictEqual(res.body.status, depois.status, JSON.stringify(res.body));

    const auditRow = await dbGet(db,
      `SELECT dados_novos FROM auditoria_log_almoxarifado WHERE entidade = 'notificacao' AND entidade_id = ? AND acao = 'REENVIAR'`,
      [r.id]);
    assert.ok(auditRow, 'deveria ter auditado o reenvio');
    const dadosNovos = JSON.parse(auditRow.dados_novos);
    assert.strictEqual(dadosNovos.notificacao_id, r.id, JSON.stringify(dadosNovos));

    const res404 = await request(app).post('/api/almoxarifado/notificacoes/999999/reenviar').send({});
    assert.strictEqual(res404.status, 404, JSON.stringify(res404.body));
    assert.strictEqual(res404.body.error, 'Notificação não encontrada');

    await setMaxTentativas(db, 5);
  });

  await test('RN-08: gates par positivo+negativo', async () => {
    setUser(PRODUCAO);
    let res = await request(app).get('/api/almoxarifado/notificacoes');
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));

    setUser(ALMOXARIFE);
    res = await request(app).get('/api/almoxarifado/notificacoes');
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));

    setUser(COMPRAS);
    res = await request(app).get('/api/almoxarifado/notificacoes');
    assert.strictEqual(res.status, 403, JSON.stringify(res.body)); // D7: recebe e-mail, nao opera a fila

    setUser(GESTOR);
    res = await request(app).get('/api/almoxarifado/notificacoes');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    setUser(ADMIN);
    res = await request(app).get('/api/almoxarifado/notificacoes');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    // POST /processar — mesmo gate.
    setUser(PRODUCAO);
    res = await request(app).post('/api/almoxarifado/notificacoes/processar').send({});
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));

    setUser(ALMOXARIFE);
    res = await request(app).post('/api/almoxarifado/notificacoes/processar').send({});
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));

    setUser(COMPRAS);
    res = await request(app).post('/api/almoxarifado/notificacoes/processar').send({});
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));

    setUser(GESTOR);
    res = await request(app).post('/api/almoxarifado/notificacoes/processar').send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    setUser(ADMIN);
    res = await request(app).post('/api/almoxarifado/notificacoes/processar').send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await test('RN-08: painel filtra e valida status', async () => {
    const antesResumo = (await request(app).get('/api/almoxarifado/notificacoes')).body.resumo;

    const rFalha = await enfileirarDireto(db, { evento: 'TESTE_RN08B_FALHA', dedupe_chave: 'painel-falha' });
    await setMaxTentativas(db, 1);
    await queueService.processarFila(db, { id: rFalha.id });
    await setMaxTentativas(db, 5);

    const rPendente = await enfileirarDireto(db, { evento: 'TESTE_RN08B_PEND', dedupe_chave: 'painel-pend' });

    const resFalha = await request(app).get('/api/almoxarifado/notificacoes?status=FALHA');
    assert.strictEqual(resFalha.status, 200, JSON.stringify(resFalha.body));
    assert.ok(resFalha.body.itens.every((i) => i.status === 'FALHA'), 'deveria trazer so FALHA');
    assert.ok(resFalha.body.itens.some((i) => i.id === rFalha.id), 'deveria incluir a linha falha criada');
    assert.ok(!resFalha.body.itens.some((i) => i.id === rPendente.id), 'nao deveria incluir a linha pendente');

    const resVazio = await request(app).get('/api/almoxarifado/notificacoes?status=');
    assert.strictEqual(resVazio.status, 200, JSON.stringify(resVazio.body));
    assert.ok(resVazio.body.itens.some((i) => i.id === rPendente.id), 'status vazio deveria trazer tudo');
    assert.ok(resVazio.body.itens.some((i) => i.id === rFalha.id), 'status vazio deveria trazer tudo');

    const resInvalido = await request(app).get('/api/almoxarifado/notificacoes?status=XYZ');
    assert.strictEqual(resInvalido.status, 400, JSON.stringify(resInvalido.body));
    assert.strictEqual(resInvalido.body.error, 'Status inválido (use PENDENTE, ENVIADO ou FALHA)');

    // resumo do CONJUNTO INTEIRO (delta — banco compartilhado entre os testes deste arquivo).
    const depoisResumo = (await request(app).get('/api/almoxarifado/notificacoes')).body.resumo;
    assert.strictEqual(depoisResumo.falhas, antesResumo.falhas + 1, JSON.stringify({ antesResumo, depoisResumo }));
    assert.strictEqual(depoisResumo.pendentes, antesResumo.pendentes + 1, JSON.stringify({ antesResumo, depoisResumo }));
  });

  await test('RN-09: config numerica invalida recusa 400 literal; dest_* aceita texto', async () => {
    setUser(ADMIN); // PUT /configuracoes usa denyUnlessAlmoxAdmin (camada de modulo), nao ACAO_PERFIS

    let res = await request(app).put('/api/almoxarifado/configuracoes').send({ notificacoes_max_tentativas: '0' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Configuração "notificacoes_max_tentativas" deve ser um número inteiro maior que zero');

    res = await request(app).put('/api/almoxarifado/configuracoes').send({ notificacoes_worker_intervalo_min: '-1' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Configuração "notificacoes_worker_intervalo_min" deve ser um número inteiro maior que zero');

    // As chaves de DIAS continuam com a mensagem da Etapa 11 (nao a nova "numero inteiro").
    res = await request(app).put('/api/almoxarifado/configuracoes').send({ alerta_lote_vencendo_dias: '0' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Configuração "alerta_lote_vencendo_dias" deve ser um número de dias maior que zero');

    res = await request(app).put('/api/almoxarifado/configuracoes').send({ notificacoes_dest_entradas: 'a@b.com' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const rowDest = await dbGet(db, `SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'notificacoes_dest_entradas'`);
    assert.strictEqual(rowDest.valor, 'a@b.com', JSON.stringify(rowDest));

    res = await request(app).put('/api/almoxarifado/configuracoes').send({ notificar_movimentacoes: '1' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const rowMov = await dbGet(db, `SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'notificar_movimentacoes'`);
    assert.strictEqual(rowMov.valor, '1', JSON.stringify(rowMov));
    // Restaura o default (desligado) para nao vazar para outros testes que rodem depois deste
    // arquivo na mesma suite/processo — cada arquivo tem seu proprio app/db, mas o habito evita
    // depender disso.
    await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = '0' WHERE chave = 'notificar_movimentacoes'`);
  });

  await test('RN-02: dois drenos concorrentes enviam UMA vez (claim em voo)', async () => {
    // Revisao da Task 1 (Critical 1): sem claim, dois processarFila simultaneos (duplo clique
    // em /processar, ou o worker da Task 3 sobrepondo um dreno lento) leem a mesma linha
    // PENDENTE e mandam o MESMO e-mail duas vezes. Instrumenta a COSTURA que o proprio
    // servico define (alertService.enviarEmail — mesmo objeto de modulo que o require lazy
    // devolve), contando chamadas e simulando SMTP ok com latencia, para abrir a janela de
    // corrida de verdade. Nao mocka nodemailer.
    const r = await enfileirarDireto(db, { evento: 'TESTE_CLAIM', dedupe_chave: 'claim-1' });
    assert.strictEqual(r.enfileirada, true, JSON.stringify(r));

    const original = alertService.enviarEmail;
    let chamadas = 0;
    alertService.enviarEmail = async () => {
      chamadas++;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { enviados: 1, erros: [] };
    };
    let resultados;
    try {
      resultados = await Promise.all([
        queueService.processarFila(db, { id: r.id }),
        queueService.processarFila(db, { id: r.id }),
      ]);
    } finally {
      alertService.enviarEmail = original;
    }

    assert.strictEqual(chamadas, 1, `enviarEmail deveria ter sido chamado 1x, foi ${chamadas}x`);
    assert.strictEqual(resultados[0].enviadas + resultados[1].enviadas, 1, JSON.stringify(resultados));

    // De quebra, o caminho de SUCESSO (inexistente ate esta revisao): ENVIADO + enviado_em.
    const row = await dbGet(db, 'SELECT status, enviado_em FROM fila_notificacoes_almoxarifado WHERE id = ?', [r.id]);
    assert.strictEqual(row.status, 'ENVIADO', JSON.stringify(row));
    assert.ok(row.enviado_em, 'enviado_em deveria estar preenchido');
  });

  await test('RN-03: linha com destinatarios vazios NUNCA vira ENVIADO', async () => {
    // Revisao da Task 1 (Important iii-A): a regra de sucesso e `enviados > 0`, nunca `erros`
    // vazio. Uma linha com '[]' gravado por fora do enfileirar (que barra isso) e o cenario
    // que separa as duas regras — com `erros.length === 0` ela viraria ENVIADO sem mandar nada.
    const hash = hashDedupe('TESTE_DEST_VAZIO', 'vazio-1');
    const ins = await dbRun(db, `INSERT INTO fila_notificacoes_almoxarifado
      (evento, hash_dedupe, destinatarios, assunto) VALUES ('TESTE_DEST_VAZIO', ?, '[]', '[Almoxarifado] vazio')`, [hash]);

    await queueService.processarFila(db, { id: ins.lastID });
    const row = await dbGet(db, 'SELECT status, ultimo_erro, enviado_em FROM fila_notificacoes_almoxarifado WHERE id = ?', [ins.lastID]);
    assert.notStrictEqual(row.status, 'ENVIADO', JSON.stringify(row));
    assert.strictEqual(row.enviado_em, null, JSON.stringify(row));
    assert.strictEqual(row.ultimo_erro, 'Sem destinatário válido', JSON.stringify(row));

    // E a regra de sucesso em si (`enviados > 0`, nunca `erros` vazio): transporte devolvendo
    // {enviados: 0, erros: []} — o caso que separa as duas regras — NAO pode virar ENVIADO.
    const r2 = await enfileirarDireto(db, { evento: 'TESTE_DEST_VAZIO', dedupe_chave: 'zero-sem-erro' });
    const original = alertService.enviarEmail;
    alertService.enviarEmail = async () => ({ enviados: 0, erros: [] });
    try {
      await queueService.processarFila(db, { id: r2.id });
    } finally {
      alertService.enviarEmail = original;
    }
    const row2 = await dbGet(db, 'SELECT status, tentativas, ultimo_erro FROM fila_notificacoes_almoxarifado WHERE id = ?', [r2.id]);
    assert.notStrictEqual(row2.status, 'ENVIADO', JSON.stringify(row2));
    assert.strictEqual(row2.tentativas, 1, JSON.stringify(row2));
    assert.strictEqual(row2.ultimo_erro, 'Falha no envio', JSON.stringify(row2));
  });

  await test('RN-03: FALHA_NOTIFICACAO tem max proprio 1 mesmo com config 5', async () => {
    // Revisao da Task 1 (Important iii-B): o teste 5 provava o max-1 com config JA em 1 —
    // sabotar `evento === 'FALHA_NOTIFICACAO' ? 1 : maxConfig` para `maxConfig` passava verde.
    // Aqui a config fica no default 5: so a regra do max proprio explica o FALHA na 1a tentativa.
    const cfg = await dbGet(db, `SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'notificacoes_max_tentativas'`);
    assert.strictEqual(cfg.valor, '5', 'pre-condicao: config no default 5');
    await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = '["admin@gmp.com"]' WHERE chave = 'alertas_estoque_emails'`);

    const antes = await dbGet(db, `SELECT COUNT(*) AS n FROM fila_notificacoes_almoxarifado WHERE evento = 'FALHA_NOTIFICACAO'`);
    const hash = hashDedupe('FALHA_NOTIFICACAO', 'aviso-max-proprio');
    const ins = await dbRun(db, `INSERT INTO fila_notificacoes_almoxarifado
      (evento, hash_dedupe, destinatarios, assunto) VALUES ('FALHA_NOTIFICACAO', ?, '["a@b.com"]', '[Almoxarifado] aviso teste')`, [hash]);

    await queueService.processarFila(db, { id: ins.lastID });
    const row = await dbGet(db, 'SELECT status, tentativas FROM fila_notificacoes_almoxarifado WHERE id = ?', [ins.lastID]);
    assert.strictEqual(row.status, 'FALHA', JSON.stringify(row));
    assert.strictEqual(row.tentativas, 1, JSON.stringify(row));

    // E nao gerou aviso de si mesma: o COUNT do evento inteiro subiu SO pela linha inserida.
    const depois = await dbGet(db, `SELECT COUNT(*) AS n FROM fila_notificacoes_almoxarifado WHERE evento = 'FALHA_NOTIFICACAO'`);
    assert.strictEqual(depois.n, antes.n + 1, JSON.stringify({ antes, depois }));
    await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = '[]' WHERE chave = 'alertas_estoque_emails'`);
  });

  await test('RN-08: resumo ignora filtro; ?evento= filtra; itens seguem o contrato congelado', async () => {
    setUser(ADMIN);
    const cheio = (await request(app).get('/api/almoxarifado/notificacoes')).body;
    const filtrado = (await request(app).get('/api/almoxarifado/notificacoes?status=FALHA')).body;
    // Revisao da Task 1 (Important iv): resumo e do CONJUNTO INTEIRO — igual com e sem filtro.
    assert.deepStrictEqual(filtrado.resumo, cheio.resumo, JSON.stringify({ cheio: cheio.resumo, filtrado: filtrado.resumo }));

    const porEvento = (await request(app).get('/api/almoxarifado/notificacoes?evento=TESTE_CLAIM')).body;
    assert.ok(porEvento.itens.length >= 1, JSON.stringify(porEvento.itens));
    assert.ok(porEvento.itens.every((i) => i.evento === 'TESTE_CLAIM'), JSON.stringify(porEvento.itens));

    // Contrato congelado (Important v): exatamente os 10 campos — SELECT * vazava hash_dedupe
    // e os corpos inteiros para a listagem.
    assert.deepStrictEqual(Object.keys(cheio.itens[0]).sort(), [
      'assunto', 'created_at', 'destinatarios', 'enviado_em', 'evento',
      'id', 'payload', 'status', 'tentativas', 'ultimo_erro',
    ], JSON.stringify(cheio.itens[0]));
  });

  await test('RN-08: reenviar linha ENVIADA limpa enviado_em (reemissao deliberada)', async () => {
    // Revisao da Task 1 (Important ii): decidido PERMITIR reenvio de ENVIADO (unico caminho de
    // reemissao — o dedupe barra re-enfileirar). O reset tem de limpar enviado_em, senao a
    // linha que falhar no reprocesso fica com carimbo de enviada e o painel mente.
    const r = await enfileirarDireto(db, { evento: 'TESTE_REENVIO_OK', dedupe_chave: 'reenvio-ok-1' });
    const original = alertService.enviarEmail;
    alertService.enviarEmail = async () => ({ enviados: 1, erros: [] });
    try {
      await queueService.processarFila(db, { id: r.id });
    } finally {
      alertService.enviarEmail = original;
    }
    const antes = await dbGet(db, 'SELECT status, enviado_em FROM fila_notificacoes_almoxarifado WHERE id = ?', [r.id]);
    assert.strictEqual(antes.status, 'ENVIADO', JSON.stringify(antes));
    assert.ok(antes.enviado_em, 'pre-condicao: enviado_em preenchido');

    setUser(ADMIN);
    const res = await request(app).post(`/api/almoxarifado/notificacoes/${r.id}/reenviar`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    // SMTP ausente de novo -> o reprocesso falha; a linha NAO pode continuar carimbada.
    const depois = await dbGet(db, 'SELECT status, enviado_em FROM fila_notificacoes_almoxarifado WHERE id = ?', [r.id]);
    assert.notStrictEqual(depois.status, 'ENVIADO', JSON.stringify(depois));
    assert.strictEqual(depois.enviado_em, null, JSON.stringify(depois));
  });

  await test('RN-02: re-checagem pos-claim pula linha terminada por outro dreno (revisao final, lente B)', async () => {
    // O claim tem DUAS metades: o Set em voo (drenos simultaneos) e a re-checagem no banco
    // (dreno B alcanca uma linha que o dreno A TERMINOU depois do SELECT de B — ela ja saiu
    // do Set, so o banco sabe). O teste concorrente cobre a primeira; este forca a segunda:
    // durante o envio da linha 1, a linha 2 e finalizada "por fora" — o dreno tem de pular.
    // Estaciona as PENDENTES elegiveis deixadas pelos testes anteriores (o dreno aqui e SEM
    // {id} de proposito — o cenario exige varrer mais de uma linha), senao o mock as marca.
    await dbRun(db, `UPDATE fila_notificacoes_almoxarifado
      SET proxima_tentativa_em = datetime('now', '+1 hour')
      WHERE status = 'PENDENTE' AND (proxima_tentativa_em IS NULL OR proxima_tentativa_em <= datetime('now'))`);

    const r1 = await enfileirarDireto(db, { evento: 'TESTE_RECHECK', dedupe_chave: 'recheck-1' });
    const r2 = await enfileirarDireto(db, { evento: 'TESTE_RECHECK', dedupe_chave: 'recheck-2' });

    const original = alertService.enviarEmail;
    let chamadas = 0;
    alertService.enviarEmail = async () => {
      chamadas++;
      if (chamadas === 1) {
        await dbRun(db, `UPDATE fila_notificacoes_almoxarifado SET status = 'ENVIADO', enviado_em = CURRENT_TIMESTAMP WHERE id = ?`, [r2.id]);
      }
      return { enviados: 1, erros: [] };
    };
    let resultado;
    try {
      resultado = await queueService.processarFila(db);
    } finally {
      alertService.enviarEmail = original;
    }

    assert.strictEqual(chamadas, 1, `linha ja ENVIADA por outro dreno nao pode ser reenviada (chamadas=${chamadas})`);
    assert.ok(resultado.processadas >= 1, JSON.stringify(resultado));
    const row1 = await dbGet(db, 'SELECT status FROM fila_notificacoes_almoxarifado WHERE id = ?', [r1.id]);
    assert.strictEqual(row1.status, 'ENVIADO', JSON.stringify(row1));
  });

  await test('RN-04: corpo_html do aviso FALHA_NOTIFICACAO escapa o erro do transporte (revisao final, lente B)', async () => {
    // Unico builder que interpolava cru — `erro` vem do err.message do nodemailer (texto do
    // servidor SMTP, fonte EXTERNA). Simula transporte hostil e confere o escape.
    await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = '["admin@gmp.com"]' WHERE chave = 'alertas_estoque_emails'`);
    await setMaxTentativas(db, 1);
    const r = await enfileirarDireto(db, { evento: 'TESTE_ESCAPE_FALHA', dedupe_chave: 'escape-falha-1' });

    const original = alertService.enviarEmail;
    alertService.enviarEmail = async () => ({ enviados: 0, erros: ['SMTP disse: <script>alert(1)</script>'] });
    try {
      await queueService.processarFila(db, { id: r.id });
    } finally {
      alertService.enviarEmail = original;
    }

    const aviso = await dbGet(db, `SELECT corpo_html FROM fila_notificacoes_almoxarifado
      WHERE evento = 'FALHA_NOTIFICACAO' AND payload LIKE ?`, [`%"notificacao_id":${r.id}%`]);
    assert.ok(aviso, 'aviso deveria ter sido enfileirado');
    assert.ok(aviso.corpo_html.includes('&lt;script&gt;'), aviso.corpo_html);
    assert.ok(!aviso.corpo_html.includes('<script>'), 'HTML do erro nao pode sair cru');

    await setMaxTentativas(db, 5);
    await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = '[]' WHERE chave = 'alertas_estoque_emails'`);
  });

  await test('RN-09: notificar_movimentacoes so aceita 0 ou 1', async () => {
    setUser(ADMIN);
    let res = await request(app).put('/api/almoxarifado/configuracoes').send({ notificar_movimentacoes: 'banana' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Configuração "notificar_movimentacoes" deve ser 0 ou 1');
    const row = await dbGet(db, `SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'notificar_movimentacoes'`);
    assert.strictEqual(row.valor, '0', JSON.stringify(row)); // nada gravado

    res = await request(app).put('/api/almoxarifado/configuracoes').send({ notificar_movimentacoes: '0' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
