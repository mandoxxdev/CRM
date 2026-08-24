/**
 * Etapa 12, Task 5 — teste-jornada (galho): cruza as Tasks 1-3 (fila, gancho de movimentacao,
 * alertas novos) num UNICO fluxo continuo, provando que as partes COMPOEM — nao repete o que os
 * arquivos unitarios ja provam (notificacaoFila/notificacaoMovimentacao/alertasNovos.api.test.js).
 *
 * O harness nao tem SMTP configurado (schema.js semeia alertas_smtp_host/from vazios) — todo
 * "processar" aqui prova o CAMINHO DA FALHA (`SMTP não configurado`), que e o comportamento real
 * de producao sem SMTP configurado (mesma nota dos outros 3 arquivos).
 *
 * Executar: cd server && node tests/api/notificacaoJornada.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

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

async function setConfig(db, chave, valor) {
  await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = ? WHERE chave = ?`, [valor, chave]);
}
async function setMaxTentativas(db, valor) {
  await setConfig(db, 'notificacoes_max_tentativas', String(valor));
}
async function contarFila(db) {
  const row = await dbGet(db, `SELECT COUNT(*) AS n FROM fila_notificacoes_almoxarifado`);
  return row.n;
}

let seq = 0;
async function novoMaterial(db, over = {}) {
  seq += 1;
  const m = { codigo: `JORN-${seq}`, nome: `Material jornada ${seq}`, unidade: 'UN', qtd: 100,
    minima: 0, reservada: 0, cliente_id: null, ativo: 1, ...over };
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_reservada, ativo, proprietario_cliente_id)
    VALUES (?,?,?,?,?,?,?,?)`,
    [m.codigo, m.nome, m.unidade, m.qtd, m.minima, m.reservada, m.ativo, m.cliente_id]);
  return { id: r.lastID, codigo: m.codigo };
}

/** Acha a linha da fila por chave do payload — mesmo padrao dos 3 arquivos irmaos (a hash e
 * detalhe de implementacao, o que a jornada prova e o CONTEUDO). */
async function filaPorPayload(db, evento, chave, valor) {
  const todas = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = ? ORDER BY id ASC`, [evento]);
  return todas.filter((row) => {
    try { return JSON.parse(row.payload)[chave] === valor; } catch (e) { return false; }
  });
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // Estado partilhado entre os passos do fluxo (a jornada e UM movimento continuo).
  let matEntrada;
  let movEntradaId;
  let linhaOriginalId;
  let avisoFalhaId;

  await test('Passo 1: liga notificar_movimentacoes + notificacoes_dest_entradas (rota real)', async () => {
    setUser(ADMIN);
    let res = await request(app).put('/api/almoxarifado/configuracoes').send({ notificar_movimentacoes: '1' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    res = await request(app).put('/api/almoxarifado/configuracoes').send({ notificacoes_dest_entradas: 'jornada-entradas@teste.com' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const rowConfig = await dbGet(db, `SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'notificar_movimentacoes'`);
    assert.strictEqual(rowConfig.valor, '1', JSON.stringify(rowConfig));
  });

  await test('Passo 2: ENTRADA pelo motor real enfileira com conteudo minimo', async () => {
    matEntrada = await novoMaterial(db, { codigo: 'JORN-ENTRADA', qtd: 0 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: matEntrada.id, tipo: 'ENTRADA_MANUAL', quantidade: 10, motivo: 'compra jornada',
    });
    movEntradaId = mov.id;
    assert.strictEqual(mov.saldo_anterior, 0, JSON.stringify(mov));
    assert.strictEqual(mov.saldo_posterior, 10, JSON.stringify(mov));

    const linhas = await filaPorPayload(db, 'MOVIMENTACAO', 'movimentacao_id', movEntradaId);
    assert.strictEqual(linhas.length, 1, JSON.stringify(linhas));
    const linha = linhas[0];
    linhaOriginalId = linha.id;
    assert.strictEqual(linha.status, 'PENDENTE', JSON.stringify(linha));
    assert.ok(linha.assunto.startsWith('[Almoxarifado] '), linha.assunto);
    assert.ok(linha.assunto.includes('ENTRADA_MANUAL') && linha.assunto.includes('JORN-ENTRADA'), linha.assunto);
    assert.ok(linha.corpo_texto.includes('Saldo anterior: 0'), linha.corpo_texto);
    assert.ok(linha.corpo_texto.includes('Saldo posterior: 10'), linha.corpo_texto);
    assert.ok(linha.corpo_texto.includes(`/almoxarifado/movimentacoes?destaque=${movEntradaId}`), linha.corpo_texto);
    assert.deepStrictEqual(JSON.parse(linha.destinatarios), ['jornada-entradas@teste.com']);
  });

  await test('Passo 3: POST /processar (ADMIN) registra a falha SMTP com tentativa 1 e backoff futuro', async () => {
    setUser(ADMIN);
    const res = await request(app).post('/api/almoxarifado/notificacoes/processar').send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.processadas >= 1, JSON.stringify(res.body));
    assert.ok(res.body.falharam >= 1, JSON.stringify(res.body));

    const linha = await dbGet(db, 'SELECT * FROM fila_notificacoes_almoxarifado WHERE id = ?', [linhaOriginalId]);
    // Max ainda no default (5): fica PENDENTE com retry agendado, nao FALHA.
    assert.strictEqual(linha.status, 'PENDENTE', JSON.stringify(linha));
    assert.strictEqual(linha.tentativas, 1, JSON.stringify(linha));
    assert.strictEqual(linha.ultimo_erro, 'SMTP não configurado', JSON.stringify(linha));
    assert.ok(linha.proxima_tentativa_em, 'deveria ter agendado retry');
    const diffRow = await dbGet(db,
      `SELECT (julianday(proxima_tentativa_em) - julianday('now')) * 24 * 60 AS diff_min
       FROM fila_notificacoes_almoxarifado WHERE id = ?`, [linhaOriginalId]);
    assert.ok(diffRow.diff_min > 0, `backoff deveria estar no futuro, veio ${diffRow.diff_min}`);
  });

  await test('Passo 4: forcar max=1 + elegibilidade imediata -> processar -> FALHA + aviso FALHA_NOTIFICACAO', async () => {
    await setConfig(db, 'alertas_estoque_emails', '["admin-jornada@teste.com"]');
    await setMaxTentativas(db, 1);
    await dbRun(db, `UPDATE fila_notificacoes_almoxarifado SET proxima_tentativa_em = NULL WHERE id = ?`, [linhaOriginalId]);

    setUser(ADMIN);
    const res = await request(app).post('/api/almoxarifado/notificacoes/processar').send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.falharam >= 1, JSON.stringify(res.body));

    const linha = await dbGet(db, 'SELECT * FROM fila_notificacoes_almoxarifado WHERE id = ?', [linhaOriginalId]);
    assert.strictEqual(linha.status, 'FALHA', JSON.stringify(linha));

    const avisos = await filaPorPayload(db, 'FALHA_NOTIFICACAO', 'notificacao_id', linhaOriginalId);
    assert.strictEqual(avisos.length, 1, JSON.stringify(avisos));
    avisoFalhaId = avisos[0].id;
    assert.strictEqual(avisos[0].status, 'PENDENTE', JSON.stringify(avisos[0]));
  });

  await test('Passo 5: GET ?status=FALHA mostra a notificacao original E o aviso', async () => {
    setUser(GESTOR);
    const res = await request(app).get('/api/almoxarifado/notificacoes?status=FALHA');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const ids = res.body.itens.map((i) => i.id);
    assert.ok(ids.includes(linhaOriginalId), JSON.stringify(ids));
    // O aviso ainda esta PENDENTE (so foi enfileirado, nao processado ainda) — nao aparece em
    // ?status=FALHA todavia; confere isso explicitamente para nao confundir a leitura do passo.
    assert.ok(!ids.includes(avisoFalhaId), 'aviso ainda nao processado nao pode estar em FALHA');
  });

  await test('Passo 6: POST reenviar registra tentativa nova e audita', async () => {
    setUser(ADMIN);
    const res = await request(app).post(`/api/almoxarifado/notificacoes/${linhaOriginalId}/reenviar`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.success, true, JSON.stringify(res.body));

    // Reenviar zera tentativas e processa NA HORA; SMTP ainda ausente e max=1 -> falha de novo.
    const linha = await dbGet(db, 'SELECT status, tentativas, enviado_em FROM fila_notificacoes_almoxarifado WHERE id = ?', [linhaOriginalId]);
    assert.strictEqual(linha.tentativas, 1, JSON.stringify(linha));
    assert.strictEqual(res.body.status, linha.status, JSON.stringify(res.body));
    assert.strictEqual(linha.enviado_em, null, JSON.stringify(linha));

    const auditRow = await dbGet(db,
      `SELECT dados_novos FROM auditoria_log_almoxarifado WHERE entidade = 'notificacao' AND entidade_id = ? AND acao = 'REENVIAR'`,
      [linhaOriginalId]);
    assert.ok(auditRow, 'reenvio deveria ter sido auditado');
    assert.strictEqual(JSON.parse(auditRow.dados_novos).notificacao_id, linhaOriginalId);
  });

  await test('Passo 7: gates do painel (PRODUCAO/ALMOXARIFE/COMPRAS 403; GESTOR/ADMIN 200)', async () => {
    for (const user of [PRODUCAO, ALMOXARIFE, COMPRAS]) {
      setUser(user);
      const res = await request(app).get('/api/almoxarifado/notificacoes');
      assert.strictEqual(res.status, 403, `${user.perfil_almoxarifado || 'PRODUCAO'}: ${JSON.stringify(res.body)}`);
    }
    for (const user of [GESTOR, ADMIN]) {
      setUser(user);
      const res = await request(app).get('/api/almoxarifado/notificacoes');
      assert.strictEqual(res.status, 200, `${user.nome}: ${JSON.stringify(res.body)}`);
    }
  });

  await test('Passo 8: movimentacao RECUSADA (saida maior que o saldo) nao enfileira', async () => {
    // Config ainda ligada e dest_saidas cai no fallback alertas_estoque_emails (configurado no
    // Passo 4) — se o gancho disparasse aqui, teria destinatario e uma linha nasceria.
    const matRecusa = await novoMaterial(db, { codigo: 'JORN-RECUSA', qtd: 5 });
    const antes = await contarFila(db);

    await assert.rejects(
      stockService.registrarMovimentacao(db, ADMIN, {
        material_id: matRecusa.id, tipo: 'SAIDA_PRODUCAO', quantidade: 999, os_id: 1,
      }),
      (err) => { assert.ok(err.status >= 400, JSON.stringify(err)); return true; },
    );

    const depois = await contarFila(db);
    assert.strictEqual(depois, antes, 'movimentacao recusada nao pode ter enfileirado nada');
  });

  await test('Passo 9: movimentacao -> cancelamento suprime a notificacao PENDENTE (FALHA visivel no painel)', async () => {
    const matCancel = await novoMaterial(db, { codigo: 'JORN-CANCEL', qtd: 50 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: matCancel.id, tipo: 'SAIDA_PRODUCAO', quantidade: 20, os_id: 1,
    });
    const linhasAntes = await filaPorPayload(db, 'MOVIMENTACAO', 'movimentacao_id', mov.id);
    assert.strictEqual(linhasAntes.length, 1, JSON.stringify(linhasAntes));
    assert.strictEqual(linhasAntes[0].status, 'PENDENTE', JSON.stringify(linhasAntes[0]));

    await stockService.cancelarMovimentacao(db, ADMIN, mov.id, 'jornada: engano');

    const linhaDepois = await dbGet(db, 'SELECT * FROM fila_notificacoes_almoxarifado WHERE id = ?', [linhasAntes[0].id]);
    assert.strictEqual(linhaDepois.status, 'FALHA', JSON.stringify(linhaDepois));
    assert.strictEqual(linhaDepois.ultimo_erro, 'Movimentação cancelada antes do envio', JSON.stringify(linhaDepois));

    setUser(GESTOR);
    const res = await request(app).get('/api/almoxarifado/notificacoes?status=FALHA');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const item = res.body.itens.find((i) => i.id === linhaDepois.id);
    assert.ok(item, 'painel deveria mostrar a linha suprimida');
    assert.strictEqual(item.ultimo_erro, 'Movimentação cancelada antes do envio', JSON.stringify(item));
  });

  await test('Passo 10: material sem minimo zerado pelo motor real dispara ESTOQUE_ZERADO -> processar -> falha SMTP -> painel mostra', async () => {
    const matZerado = await novoMaterial(db, { codigo: 'JORN-ZERADO', qtd: 5, minima: 0 });

    // Primeira movimentacao (ainda com saldo > 0): SEMEIA a maquina de estado como COM_SALDO —
    // sem este passo, a proxima chamada seria o "primeiro contato JA zerado", que semeia
    // silenciosamente sem alertar (RN-07, revisao I2).
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: matZerado.id, tipo: 'SAIDA_PRODUCAO', quantidade: 1, os_id: 1,
    });
    const antesZerado = (await filaPorPayload(db, 'ESTOQUE_ZERADO', 'material_id', matZerado.id)).length;
    assert.strictEqual(antesZerado, 0, 'ainda com saldo positivo nao pode ter alertado zerado');

    // Segunda movimentacao: zera de fato (4 -> 0) — transicao OBSERVADA, dispara o alerta.
    const movZera = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: matZerado.id, tipo: 'SAIDA_PRODUCAO', quantidade: 4, os_id: 1,
    });
    assert.strictEqual(movZera.saldo_posterior, 0, JSON.stringify(movZera));

    const linhasZerado = await filaPorPayload(db, 'ESTOQUE_ZERADO', 'material_id', matZerado.id);
    assert.strictEqual(linhasZerado.length, 1, JSON.stringify(linhasZerado));
    const linhaZerado = linhasZerado[0];
    assert.strictEqual(linhaZerado.status, 'PENDENTE', JSON.stringify(linhaZerado));

    // Processa: max ja esta em 1 (Passo 4) -> falha SMTP direto para FALHA.
    setUser(ADMIN);
    const res = await request(app).post('/api/almoxarifado/notificacoes/processar').send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const linhaZeradoDepois = await dbGet(db, 'SELECT status, ultimo_erro FROM fila_notificacoes_almoxarifado WHERE id = ?', [linhaZerado.id]);
    assert.strictEqual(linhaZeradoDepois.status, 'FALHA', JSON.stringify(linhaZeradoDepois));
    assert.strictEqual(linhaZeradoDepois.ultimo_erro, 'SMTP não configurado', JSON.stringify(linhaZeradoDepois));

    setUser(GESTOR);
    const painel = await request(app).get('/api/almoxarifado/notificacoes?evento=ESTOQUE_ZERADO');
    assert.strictEqual(painel.status, 200, JSON.stringify(painel.body));
    assert.ok(painel.body.itens.some((i) => i.id === linhaZerado.id), 'painel deveria mostrar o alerta de zerado');
  });

  await test('Passo 11: desliga notificar_movimentacoes -> movimentar de novo -> fila NAO cresce', async () => {
    setUser(ADMIN);
    const res = await request(app).put('/api/almoxarifado/configuracoes').send({ notificar_movimentacoes: '0' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const matOff = await novoMaterial(db, { codigo: 'JORN-OFF', qtd: 0 });
    const antes = await contarFila(db);
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: matOff.id, tipo: 'ENTRADA_MANUAL', quantidade: 5, motivo: 'compra',
    });
    const depois = await contarFila(db);
    assert.strictEqual(depois, antes, 'config desligada nao pode ter enfileirado nada');
    const linha = await filaPorPayload(db, 'MOVIMENTACAO', 'movimentacao_id', mov.id);
    assert.strictEqual(linha.length, 0, 'nao pode ter linha de MOVIMENTACAO com config desligada');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
