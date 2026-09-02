/**
 * Etapa 17, Task 4 — jornada de INTEGRACAO do alerta de evento, ponta a ponta e por ROTA REAL
 * (plano docs/superpowers/plans/2026-08-28-almoxarifado-etapa17-alertas-evento.md, Task 4).
 *
 * O que este arquivo prova e a COMPOSICAO — as pecas ja tem teste proprio
 * (`alertaEvento.api.test.js` = registro/helper, `alertaEventoGanchos.api.test.js` = os 3
 * ganchos). Aqui o material atravessa o workflow fiscal INTEIRO pelas rotas do modulo:
 *
 *   criar recebimento de material critico -> workflow (conferencia -> fiscal -> compras ->
 *   faturamento) -> POST /recebimentos/:id/processar (entra RETIDO em quarentena) ->
 *   POST /recebimentos/itens/:itemId/inspecionar reprovando 3 de 10 ->
 *   a fila tem MATERIAL_REPROVADO (por hash) E GET /alertas/central mostra o cartao ->
 *   varrerAlertasRegistrados no MESMO estado -> duplicadas>=1, enfileiradas=0 (RN-01) ->
 *   recuar `data_inspecao` para fora da janela -> central mostra total 0 (ao vivo) e a fila
 *   CONTINUA com a linha (RN-05 da Etapa 16: a fila e historico, nao espelho da condicao).
 *
 * De quebra, o motor real e cobrado no meio do caminho: o material sai com
 * `quantidade_bloqueada = 3` e `quantidade_em_inspecao = 0` — se alguem trocar a jornada por
 * INSERT na mao, este numero para de bater.
 *
 * Mesma licao das Etapas 16/17: TODA assercao de fila filtra por evento/hash de dedupe, NUNCA
 * por total global (materiais semeados caem sozinhos em ESTOQUE_SEM_CONSUMO e afins).
 *
 * Executar: cd server && node tests/api/alertaEventoJornada.api.test.js
 */
const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const queueService = require('../../services/almoxarifado/notificationQueueService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Jornada Evento', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

function hashDedupe(evento, dedupeChave) {
  return crypto.createHash('sha256').update(`${evento}|${dedupeChave}`).digest('hex');
}
async function filaPorHash(db, hash) {
  return dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE hash_dedupe = ?`, [hash]);
}
const setConfig = (db, chave, valor) => dbRun(db,
  `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
   ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

function resultadoDe(resultados, chave) {
  const r = resultados.find((x) => x.chave === chave);
  assert.ok(r, `varredura nao devolveu entrada para ${chave}: ${JSON.stringify(resultados)}`);
  return r;
}
function entradaCentral(body, chave) {
  const e = body.alertas.find((a) => a.chave === chave);
  assert.ok(e, `central sem entrada ${chave}: ${JSON.stringify(body.alertas.map((a) => a.chave))}`);
  assert.ok(!e.erro, `a entrada ${chave} veio com erro:true — o listar quebrou`);
  return e;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  await setConfig(db, 'alertas_estoque_emails', '["qualidade@gmp.com"]');
  await setConfig(db, 'alertas_estoque_notificar_email', '1');
  // Material critico so e retido em quarentena com este toggle ligado — e a quarentena e a
  // porta de entrada da inspecao, que e o ato que dispara o alerta desta jornada.
  await setConfig(db, 'inspecao_material_critico', '1');

  // ── Estado compartilhado da jornada ─────────────────────────────────────────────────────────
  let materialId; let recId; let itemId; let inspecaoId; let hashReprovado;
  let filaReprovadoAposAto; // linhas de MATERIAL_REPROVADO na fila logo apos o ato

  // ── Passo 1: recebimento REAL de material critico, workflow inteiro ate a nota processada ───
  await test('1. recebimento de material critico atravessa o workflow ate PROCESSADO e entra RETIDO em quarentena (motor real)', async () => {
    const mat = await dbRun(db, `INSERT INTO materiais_almoxarifado
        (codigo, nome, unidade, quantidade_atual, ativo, material_critico)
       VALUES ('JOR17-M1', 'Chapa Inox Critica', 'UN', 0, 1, 1)`);
    materialId = mat.lastID;

    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      nota_fiscal: 'NF-JOR17-1',
      fornecedor_nome: 'Fornecedor Jornada 17',
      itens: [{ material_id: materialId, quantidade: 10, valor_unitario: 25 }],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    recId = criado.body.id;
    const item = await dbGet(db,
      'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [recId]);
    itemId = item.id;

    // Workflow real, etapa por etapa (a UI faz exatamente esta sequencia).
    const wf = async (acao) => {
      const r = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao });
      assert.strictEqual(r.status, 200, `workflow ${acao}: ${JSON.stringify(r.body)}`);
      return r.body;
    };
    await wf('iniciar_conferencia');
    // Dados fiscais pela rota que a UI usa de verdade — quantidade recebida BATE com a
    // esperada, entao o gancho da divergencia (Task 2) tem de ficar calado (assercao abaixo).
    const fiscal = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`).send({
      nota_fiscal: 'NF-JOR17-1',
      fornecedor_nome: 'Fornecedor Jornada 17',
      data_emissao_nf: '2026-08-20',
      data_entrada_nf: '2026-08-21',
      valor_total_nota: 250,
      itens: [{ id: itemId, quantidade_recebida: 10, valor_unitario: 25 }],
    });
    assert.strictEqual(fiscal.status, 200, JSON.stringify(fiscal.body));
    await wf('finalizar_conferencia');
    await wf('encaminhar_compras');
    await wf('finalizar_compras');
    await wf('iniciar_faturamento');

    const proc = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/processar`).send({});
    assert.strictEqual(proc.status, 200, JSON.stringify(proc.body));
    assert.strictEqual(proc.body.status, 'PROCESSADO', JSON.stringify(proc.body));

    // O motor deu entrada e RETEVE: 10 no estoque, 10 em inspecao (nada disponivel ainda).
    const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [materialId]);
    assert.strictEqual(m.quantidade_atual, 10, `entrada real tinha de creditar 10: ${JSON.stringify(m)}`);
    assert.strictEqual(m.quantidade_em_inspecao, 10, `material critico tinha de entrar RETIDO: ${JSON.stringify(m)}`);
    const it = await dbGet(db,
      'SELECT quantidade_em_inspecao FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [itemId]);
    assert.strictEqual(it.quantidade_em_inspecao, 10, 'o retido POR ITEM e o que a inspecao reivindica');

    // Composicao negativa: recebimento sem divergencia atravessou os DOIS pontos de gancho
    // (conferir/fiscal) sem enfileirar nada — a jornada nao pode gerar aviso falso no caminho.
    assert.strictEqual(
      (await filaPorHash(db, hashDedupe('DIVERGENCIA_RECEBIMENTO', `receb-diverg-${itemId}`))).length, 0,
      'recebida igual a esperada NAO pode enfileirar divergencia no meio da jornada');
  });

  // ── Passo 2: o ato — inspecionar reprovando 3 de 10 pela rota real ──────────────────────────
  await test('2. inspecionar reprovando 3 de 10: o ato responde 201, o motor bloqueia 3 e o gancho enfileira MATERIAL_REPROVADO', async () => {
    const res = await request(app)
      .post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`)
      .send({ quantidade_aprovada: 7, quantidade_reprovada: 3, encaminhamento: 'DEVOLVER' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    inspecaoId = res.body.id;
    assert.ok(inspecaoId, `a rota tem de devolver o id da inspecao: ${JSON.stringify(res.body)}`);
    hashReprovado = hashDedupe('MATERIAL_REPROVADO', `reprovado-${inspecaoId}`);

    // O MOTOR rodou de verdade (prova de que a jornada nao e INSERT na mao): o reprovado virou
    // saldo bloqueado, a quarentena zerou e o total do material nao mudou.
    const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [materialId]);
    assert.strictEqual(m.quantidade_bloqueada, 3, `3 reprovados tinham de virar bloqueados: ${JSON.stringify(m)}`);
    assert.strictEqual(m.quantidade_em_inspecao, 0, `a quarentena tinha de zerar: ${JSON.stringify(m)}`);
    assert.strictEqual(m.quantidade_atual, 10, 'reprovar nao tira do estoque, so bloqueia');

    const fila = await filaPorHash(db, hashReprovado);
    assert.strictEqual(fila.length, 1, 'o ato de reprovar TINHA de enfileirar MATERIAL_REPROVADO');
    assert.strictEqual(fila[0].evento, 'MATERIAL_REPROVADO');
    assert.strictEqual(JSON.parse(fila[0].payload).inspecao_id, inspecaoId);
    // Os campos do corpo so existem no JOIN do `listar` dual-mode — se alguem trocar a regua
    // por dados locais do service, o codigo do material some daqui.
    assert.ok(fila[0].corpo_texto.includes('JOR17-M1'), fila[0].corpo_texto);
    assert.ok(/DEVOLVER/.test(fila[0].corpo_texto), fila[0].corpo_texto);
    filaReprovadoAposAto = fila.length;
  });

  // ── Passo 3: a central AO VIVO mostra o cartao (mesma fonte da varredura) ───────────────────
  await test('3. GET /alertas/central: o cartao MATERIAL_REPROVADO tem total >= 1 e a linha e a inspecao do ato', async () => {
    const res = await request(app).get('/api/almoxarifado/alertas/central');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const cartao = entradaCentral(res.body, 'MATERIAL_REPROVADO');
    assert.ok(cartao.total >= 1, `total do cartao: ${cartao.total}`);
    assert.strictEqual(cartao.dias, 7, `a janela default do C3 e 7 dias: ${JSON.stringify(cartao)}`);
    const linha = cartao.linhas.find((l) => l.inspecao_id === inspecaoId);
    assert.ok(linha, `a inspecao do ato tinha de estar na central: ${JSON.stringify(cartao.linhas)}`);
    assert.strictEqual(linha.quantidade_reprovada, 3);
    assert.strictEqual(linha.material_codigo, 'JOR17-M1');
    assert.strictEqual(linha.encaminhamento, 'DEVOLVER');
  });

  // ── Passo 4: RN-01 ponta a ponta — a varredura no MESMO estado nao re-notifica ──────────────
  await test('4. RN-01: varredura no mesmo estado -> MATERIAL_REPROVADO reporta duplicadas >= 1 e enfileiradas 0; a fila nao cresce', async () => {
    const resultados = await queueService.varrerAlertasRegistrados(db);
    const rep = resultadoDe(resultados, 'MATERIAL_REPROVADO');
    assert.strictEqual(rep.enfileiradas, 0,
      `o que ja foi avisado no ato nao pode ser avisado de novo: ${JSON.stringify(rep)}`);
    assert.ok(rep.duplicadas >= 1, `a rede de seguranca tinha de bater no dedupe: ${JSON.stringify(rep)}`);
    assert.strictEqual((await filaPorHash(db, hashReprovado)).length, filaReprovadoAposAto,
      'ato + varredura = UMA linha na fila (dedupe identico nos dois caminhos)');
  });

  // ── Passo 5: RN-05 — a condicao sai da janela; a central acompanha, a fila nao ──────────────
  await test('5. RN-05: com a inspecao fora da janela, a central zera o cartao (ao vivo) e a fila CONTINUA com a linha (historico)', async () => {
    // Envelhecer a inspecao e a unica forma de tirar esta condicao da janela: decisao de
    // inspecao e imutavel (nao ha rota que "desreprove"). UPDATE direto so no relogio.
    await dbRun(db, `UPDATE inspecoes_recebimento_almoxarifado
      SET data_inspecao = datetime('now', '-30 days') WHERE id = ?`, [inspecaoId]);

    const res = await request(app).get('/api/almoxarifado/alertas/central');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const cartao = entradaCentral(res.body, 'MATERIAL_REPROVADO');
    assert.strictEqual(cartao.total, 0,
      `fora da janela de ${cartao.dias} dias o cartao tinha de zerar (avaliacao AO VIVO): ${JSON.stringify(cartao.linhas)}`);
    assert.ok(!cartao.linhas.some((l) => l.inspecao_id === inspecaoId),
      'a inspecao envelhecida tinha de sumir da central');

    // A fila e historico de notificacao, nao espelho da condicao: o que ja foi avisado FICA.
    const fila = await filaPorHash(db, hashReprovado);
    assert.strictEqual(fila.length, filaReprovadoAposAto,
      'a fila NAO pode encolher quando a condicao sai da janela (RN-05 da Etapa 16)');
    assert.strictEqual(JSON.parse(fila[0].payload).inspecao_id, inspecaoId);

    // E o saldo bloqueado continua la: sair do alerta nao desfaz o efeito no estoque.
    const m = await dbGet(db, 'SELECT quantidade_bloqueada FROM materiais_almoxarifado WHERE id = ?', [materialId]);
    assert.strictEqual(m.quantidade_bloqueada, 3, 'sair da janela do alerta nao pode mexer no estoque');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
