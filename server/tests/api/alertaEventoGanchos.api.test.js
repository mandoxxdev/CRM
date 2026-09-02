/**
 * Etapa 17, Task 2 — os ganchos nos 3 atos (contrato C4 do plano
 * docs/superpowers/plans/2026-08-28-almoxarifado-etapa17-alertas-evento.md).
 *
 * Cada ato e exercitado pela ROTA REAL (nao pelo service), porque o que se prova aqui e que o
 * usuario clicando na tela gera o aviso — e que o aviso NUNCA derruba o clique (RN-02).
 *
 * O gancho da divergencia de recebimento e cobrado nos DOIS pontos (achado Critico da revisao
 * do plano): `PUT /recebimentos/:id/conferir` E `PUT /recebimentos/:id/fiscal` — a UI real
 * escreve `quantidade_recebida` pela rota fiscal, entao um gancho so no conferir nunca
 * dispararia em producao.
 *
 * Mesma licao da Etapa 16: TODA assercao filtra a fila por evento/hash, NUNCA por total global.
 *
 * Executar: cd server && node tests/api/alertaEventoGanchos.api.test.js
 */
const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const queueService = require('../../services/almoxarifado/notificationQueueService');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

function hashDedupe(evento, dedupeChave) {
  return crypto.createHash('sha256').update(`${evento}|${dedupeChave}`).digest('hex');
}

async function filaPorHash(db, hash) {
  return dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE hash_dedupe = ?`, [hash]);
}

const setConfig = (db, chave, valor) => dbRun(db,
  `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
   ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

let seq = 0;
async function novoMaterial(db, { qtd = 0, critico = false, categoria = null } = {}) {
  seq += 1;
  const codigo = `GAN-${seq}`;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, material_critico, categoria)
     VALUES (?,?,'UN',?,1,?,?)`,
    [codigo, `Material Gancho ${seq}`, qtd, critico ? 1 : 0, categoria]);
  return { id: r.lastID, codigo };
}

/** Recebimento REAL pelo service de producao (deixa em RECEBIDO, com um item). */
async function novoRecebimento(db, materialId, qtd) {
  seq += 1;
  const rec = await receiptService.criarRecebimento(db, ADMIN, {
    nota_fiscal: `NF-GAN-${seq}`,
    itens: [{ material_id: materialId, quantidade: qtd }],
  });
  const item = await dbGet(db,
    'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [rec.id]);
  return { recId: rec.id, itemId: item.id };
}

/**
 * Item com saldo RETIDO em quarentena, pronto para a rota de inspecionar — mesmo molde de
 * tests/api/inspecaoDecisao.api.test.js (material critico + entrada real pelo motor), em vez de
 * fabricar `quantidade_em_inspecao` na mao.
 */
async function itemRetido(db, qtd) {
  await setConfig(db, 'inspecao_material_critico', '1');
  const mat = await novoMaterial(db, { qtd: 0, critico: true });
  const { recId, itemId } = await novoRecebimento(db, mat.id, qtd);
  await receiptService.aprovarRecebimento(db, ADMIN, recId);
  return { mat, recId, itemId };
}

/** Conferencia com escopo de UM material (categoria propria) e a contagem ja registrada. */
async function conferenciaContada(app, db, { qtdSistema, contada }) {
  seq += 1;
  const categoria = `CAT-GAN-${seq}`;
  const mat = await novoMaterial(db, { qtd: qtdSistema, categoria });
  const criada = await request(app).post('/api/almoxarifado/conferencias').send({ categoria });
  assert.strictEqual(criada.status, 201, JSON.stringify(criada.body));
  assert.strictEqual(criada.body.totalItens, 1, `escopo por categoria tinha de pegar 1 material: ${JSON.stringify(criada.body)}`);
  const item = await dbGet(db,
    `SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ?`, [criada.body.id]);
  const put = await request(app)
    .put(`/api/almoxarifado/conferencias/${criada.body.id}/item/${item.id}`)
    .send({ quantidade_contada: contada });
  assert.strictEqual(put.status, 200, JSON.stringify(put.body));
  return { confId: criada.body.id, mat };
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  await setConfig(db, 'alertas_estoque_emails', '["a@b.c"]');
  await setConfig(db, 'alertas_estoque_notificar_email', '1');

  // ── Ato 1: POST /recebimentos/itens/:itemId/inspecionar ─────────────────────────────────────
  await test('1. inspecionar reprovando dispara MATERIAL_REPROVADO no ato; aprovar tudo nao dispara (RN-03)', async () => {
    const reprova = await itemRetido(db, 10);
    const resRep = await request(app)
      .post(`/api/almoxarifado/recebimentos/itens/${reprova.itemId}/inspecionar`)
      .send({ quantidade_aprovada: 7, quantidade_reprovada: 3, encaminhamento: 'DEVOLVER' });
    assert.strictEqual(resRep.status, 201, JSON.stringify(resRep.body));
    const inspecaoId = resRep.body.id;
    assert.ok(inspecaoId, `a rota tem de devolver o id da inspecao: ${JSON.stringify(resRep.body)}`);

    const fila = await filaPorHash(db, hashDedupe('MATERIAL_REPROVADO', `reprovado-${inspecaoId}`));
    assert.strictEqual(fila.length, 1, 'reprovar TINHA de enfileirar MATERIAL_REPROVADO no ato');
    assert.strictEqual(fila[0].evento, 'MATERIAL_REPROVADO');
    assert.strictEqual(JSON.parse(fila[0].payload).inspecao_id, inspecaoId);
    // A linha veio do dual-mode (regua unica), nao montada dos dados locais do service: os
    // campos do C2 que so existem no JOIN tem de aparecer no corpo.
    assert.ok(fila[0].corpo_texto.includes(reprova.mat.codigo),
      `corpo tem de trazer o codigo do material (veio do JOIN do listar): ${fila[0].corpo_texto}`);
    assert.ok(/DEVOLVER/.test(fila[0].corpo_texto), fila[0].corpo_texto);

    // RN-03: aprovacao total nao gera aviso nenhum.
    const aprova = await itemRetido(db, 10);
    const resApr = await request(app)
      .post(`/api/almoxarifado/recebimentos/itens/${aprova.itemId}/inspecionar`)
      .send({ quantidade_aprovada: 10, quantidade_reprovada: 0 });
    assert.strictEqual(resApr.status, 201, JSON.stringify(resApr.body));
    assert.strictEqual(
      (await filaPorHash(db, hashDedupe('MATERIAL_REPROVADO', `reprovado-${resApr.body.id}`))).length, 0,
      'RN-03: aprovacao total NAO pode enfileirar');
  });

  // ── Ato 2a: PUT /recebimentos/:id/conferir ──────────────────────────────────────────────────
  await test('2. conferir recebimento com item divergente dispara DIVERGENCIA_RECEBIMENTO; sem divergencia nao dispara', async () => {
    const mat = await novoMaterial(db);
    const { recId, itemId } = await novoRecebimento(db, mat.id, 10);
    const res = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/conferir`)
      .send({ itens: [{ id: itemId, quantidade_recebida: 8, conferencia_quantidade: 1 }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const fila = await filaPorHash(db, hashDedupe('DIVERGENCIA_RECEBIMENTO', `receb-diverg-${itemId}-8`));
    assert.strictEqual(fila.length, 1, 'conferir 8 de 10 TINHA de enfileirar DIVERGENCIA_RECEBIMENTO');
    const payload = JSON.parse(fila[0].payload);
    assert.strictEqual(payload.item_id, itemId);
    assert.strictEqual(payload.recebimento_id, recId);
    assert.ok(fila[0].corpo_texto.includes(mat.codigo), fila[0].corpo_texto);

    // Conferir a quantidade exata: nada na fila (a regua e a query compartilhada, float-safe).
    const semDiv = await novoRecebimento(db, mat.id, 10);
    const res2 = await request(app).put(`/api/almoxarifado/recebimentos/${semDiv.recId}/conferir`)
      .send({ itens: [{ id: semDiv.itemId, quantidade_recebida: 10, conferencia_quantidade: 1 }] });
    assert.strictEqual(res2.status, 200, JSON.stringify(res2.body));
    assert.strictEqual(
      (await filaPorHash(db, hashDedupe('DIVERGENCIA_RECEBIMENTO', `receb-diverg-${semDiv.itemId}-10`))).length, 0,
      'recebida igual a esperada NAO pode enfileirar');
  });

  // ── Ato 2b: PUT /recebimentos/:id/fiscal (o caminho que a UI REALMENTE usa) ──────────────────
  await test('2b. a rota /fiscal tambem dispara DIVERGENCIA_RECEBIMENTO (achado Critico: a UI nunca chama /conferir)', async () => {
    const mat = await novoMaterial(db);
    const { recId, itemId } = await novoRecebimento(db, mat.id, 10);
    // /fiscal so aceita a partir de EM_CONFERENCIA — avanca pelo workflow real.
    const wf = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`)
      .send({ acao: 'iniciar_conferencia' });
    assert.strictEqual(wf.status, 200, JSON.stringify(wf.body));

    const res = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`)
      .send({ nota_fiscal: 'NF-FISCAL-GAN', itens: [{ id: itemId, quantidade_recebida: 7 }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const fila = await filaPorHash(db, hashDedupe('DIVERGENCIA_RECEBIMENTO', `receb-diverg-${itemId}-7`));
    assert.strictEqual(fila.length, 1, 'registrar 7 de 10 pela rota fiscal TINHA de enfileirar');
    assert.strictEqual(JSON.parse(fila[0].payload).item_id, itemId);

    // Sem divergencia pela mesma rota: nada.
    const semDiv = await novoRecebimento(db, mat.id, 10);
    await request(app).post(`/api/almoxarifado/recebimentos/${semDiv.recId}/workflow`)
      .send({ acao: 'iniciar_conferencia' });
    const res2 = await request(app).put(`/api/almoxarifado/recebimentos/${semDiv.recId}/fiscal`)
      .send({ nota_fiscal: 'NF-FISCAL-GAN-2', itens: [{ id: semDiv.itemId, quantidade_recebida: 10 }] });
    assert.strictEqual(res2.status, 200, JSON.stringify(res2.body));
    assert.strictEqual(
      (await filaPorHash(db, hashDedupe('DIVERGENCIA_RECEBIMENTO', `receb-diverg-${semDiv.itemId}-10`))).length, 0,
      'rota fiscal sem divergencia NAO pode enfileirar');
  });

  // ── Ato 3: PUT /conferencias/:id/concluir ───────────────────────────────────────────────────
  await test('3. concluir conferencia divergente dispara UMA linha DIVERGENCIA_INVENTARIO; sem divergencia nao dispara', async () => {
    // 1% de divergencia: abaixo da tolerancia padrao (2%), entao conclui sem recontagem.
    const { confId } = await conferenciaContada(app, db, { qtdSistema: 100, contada: 99 });
    const res = await request(app).put(`/api/almoxarifado/conferencias/${confId}/concluir`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const fila = await filaPorHash(db, hashDedupe('DIVERGENCIA_INVENTARIO', `inv-diverg-${confId}`));
    assert.strictEqual(fila.length, 1, 'concluir conferencia divergente TINHA de enfileirar UMA linha (RN-05)');
    assert.strictEqual(JSON.parse(fila[0].payload).conferencia_id, confId);
    assert.ok(!/impacto/i.test(fila[0].corpo_texto), `B30: o corpo nao pode citar impacto financeiro: ${fila[0].corpo_texto}`);
    // RN-05: 1 aviso por conferencia, nunca por item.
    const porEvento = await dbAll(db,
      `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = 'DIVERGENCIA_INVENTARIO' AND payload LIKE ?`,
      [`%"conferencia_id":${confId}%`]);
    assert.strictEqual(porEvento.length, 1, 'RN-05: agregado — uma linha por conferencia');

    const semDiv = await conferenciaContada(app, db, { qtdSistema: 50, contada: 50 });
    const res2 = await request(app).put(`/api/almoxarifado/conferencias/${semDiv.confId}/concluir`).send({});
    assert.strictEqual(res2.status, 200, JSON.stringify(res2.body));
    assert.strictEqual(
      (await filaPorHash(db, hashDedupe('DIVERGENCIA_INVENTARIO', `inv-diverg-${semDiv.confId}`))).length, 0,
      'conferencia sem divergencia NAO pode enfileirar');
  });

  // ── RN-02: o gancho NUNCA derruba o ato ─────────────────────────────────────────────────────
  await test('4. RN-02: com o disparo lancando, o ato responde 201 e grava a inspecao; a fila fica sem o evento', async () => {
    const original = queueService.dispararAlertaRegistrado;
    // So funciona porque os ganchos chamam PELO OBJETO do modulo. Se alguem desestruturar o
    // helper no require, este stub deixa de ser visto e o teste denuncia (a fila teria o evento).
    queueService.dispararAlertaRegistrado = () => { throw new Error('boom'); };
    let inspecaoId;
    try {
      const { itemId, mat } = await itemRetido(db, 10);
      const res = await request(app)
        .post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`)
        .send({ quantidade_aprovada: 6, quantidade_reprovada: 4 });
      assert.strictEqual(res.status, 201, `o aviso derrubou o ato: ${JSON.stringify(res.body)}`);
      inspecaoId = res.body.id;

      // O ato gravou TUDO: a inspecao e o efeito no saldo (motor).
      const insp = await dbGet(db,
        'SELECT * FROM inspecoes_recebimento_almoxarifado WHERE id = ?', [inspecaoId]);
      assert.ok(insp, 'a inspecao TEM de estar gravada mesmo com o gancho quebrado');
      assert.strictEqual(insp.quantidade_reprovada, 4);
      const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [mat.id]);
      assert.strictEqual(m.quantidade_bloqueada, 4, 'o motor rodou: reprovado virou bloqueado');
      assert.strictEqual(m.quantidade_em_inspecao, 0);
    } finally {
      queueService.dispararAlertaRegistrado = original;
    }
    assert.strictEqual(
      (await filaPorHash(db, hashDedupe('MATERIAL_REPROVADO', `reprovado-${inspecaoId}`))).length, 0,
      'com o helper quebrado, nada podia entrar na fila');

    // Controle positivo do stub: restaurado, o MESMO ato volta a enfileirar.
    const outro = await itemRetido(db, 10);
    const ok = await request(app)
      .post(`/api/almoxarifado/recebimentos/itens/${outro.itemId}/inspecionar`)
      .send({ quantidade_aprovada: 6, quantidade_reprovada: 4 });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    assert.strictEqual(
      (await filaPorHash(db, hashDedupe('MATERIAL_REPROVADO', `reprovado-${ok.body.id}`))).length, 1,
      'restaurado o helper, o ato TEM de enfileirar (senao o zero acima nao prova nada)');
  });

  // ── RN-07: o toggle mestre governa o gancho ─────────────────────────────────────────────────
  await test('5. RN-07 ponta a ponta: toggle off -> o ato nao enfileira; religado -> o ato seguinte enfileira', async () => {
    await setConfig(db, 'alertas_estoque_notificar_email', '0');
    let desligada;
    try {
      const off = await itemRetido(db, 10);
      const res = await request(app)
        .post(`/api/almoxarifado/recebimentos/itens/${off.itemId}/inspecionar`)
        .send({ quantidade_aprovada: 5, quantidade_reprovada: 5 });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      desligada = res.body.id;
      assert.strictEqual(
        (await filaPorHash(db, hashDedupe('MATERIAL_REPROVADO', `reprovado-${desligada}`))).length, 0,
        'RN-07: com o toggle mestre off o gancho NAO pode enfileirar');
    } finally {
      await setConfig(db, 'alertas_estoque_notificar_email', '1');
    }

    const on = await itemRetido(db, 10);
    const res2 = await request(app)
      .post(`/api/almoxarifado/recebimentos/itens/${on.itemId}/inspecionar`)
      .send({ quantidade_aprovada: 5, quantidade_reprovada: 5 });
    assert.strictEqual(res2.status, 201, JSON.stringify(res2.body));
    assert.strictEqual(
      (await filaPorHash(db, hashDedupe('MATERIAL_REPROVADO', `reprovado-${res2.body.id}`))).length, 1,
      'religado, o ato seguinte TEM de enfileirar');
    // E a varredura de rede pega o que o toggle desligado deixou passar (RN-01/RN-07: a
    // condicao continua viva; so o e-mail ficou para depois).
    await queueService.varrerAlertasRegistrados(db);
    assert.strictEqual(
      (await filaPorHash(db, hashDedupe('MATERIAL_REPROVADO', `reprovado-${desligada}`))).length, 1,
      'a varredura e a rede de seguranca do que o toggle off perdeu');
  });

  // ── Achados da revisao adversarial (A1 e A6) ────────────────────────────────────────────────
  await test('6. A1: errar de novo, PIOR, no mesmo item avisa de novo (a quantidade entra no dedupe)', async () => {
    const mat = await novoMaterial(db);
    const { recId, itemId } = await novoRecebimento(db, mat.id, 10);
    await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao: 'iniciar_conferencia' });

    // 8 de 10 -> avisa
    await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`)
      .send({ nota_fiscal: 'NF-A1-1', itens: [{ id: itemId, quantidade_recebida: 8 }] });
    assert.strictEqual((await filaPorHash(db, hashDedupe('DIVERGENCIA_RECEBIMENTO', `receb-diverg-${itemId}-8`))).length, 1);

    // corrige para 10 -> condicao morre, nada novo
    await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`)
      .send({ nota_fiscal: 'NF-A1-2', itens: [{ id: itemId, quantidade_recebida: 10 }] });
    assert.strictEqual((await filaPorHash(db, hashDedupe('DIVERGENCIA_RECEBIMENTO', `receb-diverg-${itemId}-10`))).length, 0,
      'quantidade correta NAO pode enfileirar');

    // erra de novo, PIOR (2 de 10): com o dedupe antigo (so por item) isto ficava CALADO e o
    // unico e-mail existente dizia "8" — a central e a caixa de entrada contavam historias
    // diferentes. Achado A1 da revisao adversarial.
    await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`)
      .send({ nota_fiscal: 'NF-A1-3', itens: [{ id: itemId, quantidade_recebida: 2 }] });
    const novaFila = await filaPorHash(db, hashDedupe('DIVERGENCIA_RECEBIMENTO', `receb-diverg-${itemId}-2`));
    assert.strictEqual(novaFila.length, 1, 'divergencia NOVA e pior TEM de avisar de novo');
    assert.ok(/2/.test(novaFila[0].corpo_texto), 'o corpo novo fala da quantidade ATUAL');

    // re-salvar o MESMO valor continua sendo duplicata (o dedupe nao virou "avisa sempre").
    await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`)
      .send({ nota_fiscal: 'NF-A1-4', itens: [{ id: itemId, quantidade_recebida: 2 }] });
    assert.strictEqual((await filaPorHash(db, hashDedupe('DIVERGENCIA_RECEBIMENTO', `receb-diverg-${itemId}-2`))).length, 1,
      're-salvar o mesmo valor NAO pode duplicar o aviso');
  });

  await test('7. A6: RN-01 (dedupe identico ato x varredura) e RN-02 (ato sobrevive) para os OUTROS dois ganchos', async () => {
    // RN-01 para DIVERGENCIA_RECEBIMENTO: apaga a linha que o gancho criou e deixa a varredura
    // gerar a dela — hash e corpo tem de bater byte a byte (senao gancho e rede de seguranca
    // contam historias diferentes).
    const mat = await novoMaterial(db);
    const { recId, itemId } = await novoRecebimento(db, mat.id, 10);
    await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao: 'iniciar_conferencia' });
    await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`)
      .send({ nota_fiscal: 'NF-A6', itens: [{ id: itemId, quantidade_recebida: 6 }] });
    const hashReceb = hashDedupe('DIVERGENCIA_RECEBIMENTO', `receb-diverg-${itemId}-6`);
    const doGancho = (await filaPorHash(db, hashReceb))[0];
    assert.ok(doGancho, 'setup: o gancho enfileirou');
    await dbRun(db, 'DELETE FROM fila_notificacoes_almoxarifado WHERE id = ?', [doGancho.id]);
    await queueService.varrerAlertasRegistrados(db);
    const daVarredura = (await filaPorHash(db, hashReceb))[0];
    assert.ok(daVarredura, 'a varredura tem de gerar o MESMO hash do gancho (RN-01)');
    assert.strictEqual(daVarredura.corpo_texto, doGancho.corpo_texto, 'corpo identico nos dois caminhos');
    assert.strictEqual(daVarredura.assunto, doGancho.assunto, 'assunto identico nos dois caminhos');

    // RN-02 para os dois atos: com o disparo lancando, /fiscal e /concluir respondem 200 e
    // gravam o que tinham de gravar.
    const original = queueService.dispararAlertaRegistrado;
    try {
      queueService.dispararAlertaRegistrado = async () => { throw new Error('boom do disparo'); };

      const r2 = await novoRecebimento(db, mat.id, 10);
      await request(app).post(`/api/almoxarifado/recebimentos/${r2.recId}/workflow`).send({ acao: 'iniciar_conferencia' });
      const resFiscal = await request(app).put(`/api/almoxarifado/recebimentos/${r2.recId}/fiscal`)
        .send({ nota_fiscal: 'NF-RN02', itens: [{ id: r2.itemId, quantidade_recebida: 5 }] });
      assert.strictEqual(resFiscal.status, 200, `RN-02: /fiscal tem de responder 200 mesmo com o aviso quebrado: ${JSON.stringify(resFiscal.body)}`);
      const itemGravado = await dbGet(db, 'SELECT quantidade_recebida FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [r2.itemId]);
      assert.strictEqual(itemGravado.quantidade_recebida, 5, 'RN-02: o ato gravou de verdade');
      assert.strictEqual((await filaPorHash(db, hashDedupe('DIVERGENCIA_RECEBIMENTO', `receb-diverg-${r2.itemId}-5`))).length, 0,
        'com o disparo quebrado nao ha aviso — so o ato');

      const conf = await conferenciaContada(app, db, { qtdSistema: 100, contada: 99 });
      const resConcluir = await request(app).put(`/api/almoxarifado/conferencias/${conf.confId}/concluir`).send({});
      assert.strictEqual(resConcluir.status, 200, `RN-02: /concluir tem de responder 200: ${JSON.stringify(resConcluir.body)}`);
      const confGravada = await dbGet(db, 'SELECT status, data_fim FROM conferencias_almoxarifado WHERE id = ?', [conf.confId]);
      assert.strictEqual(confGravada.status, 'CONCLUIDO', 'RN-02: a conferencia concluiu de verdade');
      assert.ok(confGravada.data_fim, 'RN-02: data_fim gravada');
    } finally {
      queueService.dispararAlertaRegistrado = original;
    }

    // Controle positivo: restaurado, o mesmo ato volta a avisar.
    // 1% de divergencia: abaixo da tolerancia padrao (2%), entao conclui sem exigir recontagem
    // — o mesmo molde do cenario 3. Com 3% a rota pede recontagem e o ato nem acontece.
    const conf2 = await conferenciaContada(app, db, { qtdSistema: 100, contada: 99 });
    const resCtrl = await request(app).put(`/api/almoxarifado/conferencias/${conf2.confId}/concluir`).send({});
    assert.strictEqual(resCtrl.status, 200, JSON.stringify(resCtrl.body));
    assert.strictEqual((await filaPorHash(db, hashDedupe('DIVERGENCIA_INVENTARIO', `inv-diverg-${conf2.confId}`))).length, 1,
      'com o disparo restaurado o aviso volta (controle positivo do stub)');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
