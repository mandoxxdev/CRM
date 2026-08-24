/**
 * Etapa 12, Task 2 — RN-04, RN-05: gancho pos-commit de movimentacao, conteudo minimo e
 * destinatarios por classe.
 *
 * O harness nao tem SMTP configurado — isto NAO importa aqui: `enfileirarMovimentacao` so grava
 * na fila (RN-01), nunca envia. `notificacaoFila.api.test.js` ja prova o envio/worker; este
 * arquivo prova SO o gancho (quando enfileira, com que conteudo, para quem).
 *
 * Executar: cd server && node tests/api/notificacaoMovimentacao.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', email: 'admin@test.com' };

async function setConfig(db, chave, valor) {
  await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = ? WHERE chave = ?`, [valor, chave]);
}

let seq = 0;
async function novoMaterial(db, over = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, quantidade_em_terceiros, ativo)
    VALUES (?,?,?,?,?,1)`, [
    over.codigo || `NOTIF-${seq}`,
    over.nome || `Material notificacao ${seq}`,
    over.unidade || 'UN',
    over.quantidade_atual !== undefined ? over.quantidade_atual : 100,
    over.quantidade_em_terceiros || 0,
  ]);
  return r.lastID;
}

async function contarFila(db) {
  const row = await dbGet(db, `SELECT COUNT(*) AS n FROM fila_notificacoes_almoxarifado`);
  return row.n;
}

/** Acha a linha da fila pela movimentacao (payload.movimentacao_id) — nao pela hash exata, que e
 * detalhe de implementacao (mesmo padrao do teste RN-03 em notificacaoFila.api.test.js). */
async function filaPorMovimentacao(db, movimentacaoId) {
  const todos = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = 'MOVIMENTACAO'`);
  return todos.find((row) => {
    try { return JSON.parse(row.payload).movimentacao_id === movimentacaoId; } catch (e) { return false; }
  });
}

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('RN-04: movimentacao confirmada enfileira com conteudo minimo', async () => {
    await setConfig(db, 'notificar_movimentacoes', '1');
    await setConfig(db, 'notificacoes_dest_entradas', 'dest-entradas@teste.com');

    const mat = await novoMaterial(db, { codigo: 'NOTIF-RN04-1', quantidade_atual: 0 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA_MANUAL', quantidade: 10, motivo: 'compra',
    });

    const linha = await filaPorMovimentacao(db, mov.id);
    assert.ok(linha, 'deveria ter enfileirado a movimentacao');
    assert.strictEqual(linha.status, 'PENDENTE', JSON.stringify(linha));
    assert.strictEqual(linha.evento, 'MOVIMENTACAO', JSON.stringify(linha));
    assert.ok(linha.assunto.startsWith('[Almoxarifado] '), linha.assunto);
    assert.ok(linha.assunto.includes('ENTRADA_MANUAL'), linha.assunto);
    assert.ok(linha.assunto.includes('NOTIF-RN04-1'), linha.assunto);

    assert.ok(linha.corpo_texto.includes('NOTIF-RN04-1'), linha.corpo_texto);
    assert.ok(linha.corpo_texto.includes('10'), linha.corpo_texto);
    assert.ok(linha.corpo_texto.includes(`Saldo anterior: ${mov.saldo_anterior}`), linha.corpo_texto);
    assert.ok(linha.corpo_texto.includes(`Saldo posterior: ${mov.saldo_posterior}`), linha.corpo_texto);
    assert.strictEqual(mov.saldo_anterior, 0, JSON.stringify(mov));
    assert.strictEqual(mov.saldo_posterior, 10, JSON.stringify(mov));

    const destinatarios = JSON.parse(linha.destinatarios);
    assert.deepStrictEqual(destinatarios, ['dest-entradas@teste.com'], JSON.stringify(destinatarios));

    // dedupe_chave = 'mov-<id>' — reenfileirar a MESMA movimentacao (chamada duplicada do
    // gancho, por hipotese) e no-op silencioso, nao gera segunda linha.
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(`MOVIMENTACAO|mov-${mov.id}`).digest('hex');
    assert.strictEqual(linha.hash_dedupe, hash, 'dedupe_chave deveria ser mov-<id>');
  });

  await test('RN-04: movimentacao RECUSADA nao enfileira', async () => {
    await setConfig(db, 'notificar_movimentacoes', '1');
    await setConfig(db, 'notificacoes_dest_saidas', 'dest-saidas@teste.com');

    const mat = await novoMaterial(db, { codigo: 'NOTIF-RN04-2', quantidade_atual: 5 });
    const antes = await contarFila(db);

    await assert.rejects(
      stockService.registrarMovimentacao(db, ADMIN, {
        material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 999, os_id: 1,
      }),
      (err) => { assert.ok(err.status >= 400, JSON.stringify(err)); return true; },
    );

    const depois = await contarFila(db);
    assert.strictEqual(depois, antes, 'movimentacao recusada nao pode ter enfileirado nada');
  });

  await test('RN-04: config desligada (default) nao enfileira; retorno do motor e identico', async () => {
    await setConfig(db, 'notificar_movimentacoes', '0');
    const matOff = await novoMaterial(db, { codigo: 'NOTIF-RN04-3A', quantidade_atual: 0 });
    const antes = await contarFila(db);
    const movOff = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: matOff, tipo: 'ENTRADA_MANUAL', quantidade: 7, motivo: 'compra',
    });
    const depois = await contarFila(db);
    assert.strictEqual(depois, antes, 'config desligada nao pode ter enfileirado nada');
    assert.deepStrictEqual(Object.keys(movOff).sort(), ['id', 'saldo_anterior', 'saldo_posterior']);

    // Mesmo params, config LIGADA — o retorno do motor tem de ter a MESMA forma e os mesmos
    // valores de saldo (o gancho e efeito colateral, nao pode vazar campo novo no retorno nem
    // mudar saldo).
    await setConfig(db, 'notificar_movimentacoes', '1');
    await setConfig(db, 'notificacoes_dest_entradas', 'dest-entradas@teste.com');
    const matOn = await novoMaterial(db, { codigo: 'NOTIF-RN04-3B', quantidade_atual: 0 });
    const movOn = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: matOn, tipo: 'ENTRADA_MANUAL', quantidade: 7, motivo: 'compra',
    });
    assert.deepStrictEqual(Object.keys(movOn).sort(), ['id', 'saldo_anterior', 'saldo_posterior']);
    assert.strictEqual(movOn.saldo_anterior, movOff.saldo_anterior, JSON.stringify({ movOn, movOff }));
    assert.strictEqual(movOn.saldo_posterior, movOff.saldo_posterior, JSON.stringify({ movOn, movOff }));

    const linhaOn = await filaPorMovimentacao(db, movOn.id);
    assert.ok(linhaOn, 'com a config ligada, deveria ter enfileirado');
    const linhaOff = await filaPorMovimentacao(db, movOff.id);
    assert.ok(!linhaOff, 'com a config desligada, nao deveria ter enfileirado');

    await setConfig(db, 'notificar_movimentacoes', '0');
  });

  await test('RN-05: classe certa por tipo, com precedencia', async () => {
    await setConfig(db, 'notificar_movimentacoes', '1');
    await setConfig(db, 'notificacoes_dest_entradas', 'classe-entradas@teste.com');
    await setConfig(db, 'notificacoes_dest_saidas', 'classe-saidas@teste.com');
    await setConfig(db, 'notificacoes_dest_ajustes', 'classe-ajustes@teste.com');
    await setConfig(db, 'notificacoes_dest_terceiros', 'classe-terceiros@teste.com');

    // ENTRADA -> dest_entradas
    const matEnt = await novoMaterial(db, { codigo: 'NOTIF-RN05-ENT', quantidade_atual: 0 });
    const movEnt = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: matEnt, tipo: 'ENTRADA_MANUAL', quantidade: 5, motivo: 'compra',
    });
    const linhaEnt = await filaPorMovimentacao(db, movEnt.id);
    assert.deepStrictEqual(JSON.parse(linhaEnt.destinatarios), ['classe-entradas@teste.com']);

    // SAIDA -> dest_saidas
    const matSai = await novoMaterial(db, { codigo: 'NOTIF-RN05-SAI', quantidade_atual: 50 });
    const movSai = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: matSai, tipo: 'SAIDA_PRODUCAO', quantidade: 5, os_id: 1,
    });
    const linhaSai = await filaPorMovimentacao(db, movSai.id);
    assert.deepStrictEqual(JSON.parse(linhaSai.destinatarios), ['classe-saidas@teste.com']);

    // AJUSTE_POSITIVO e AJUSTE_NEGATIVO -> dest_ajustes, MESMO estando em TIPOS_ENTRADA/SAIDA —
    // e a precedencia do prefixo AJUSTE que nenhuma ordem de ifs acidental pode inverter.
    const matAjP = await novoMaterial(db, { codigo: 'NOTIF-RN05-AJP', quantidade_atual: 10 });
    const movAjP = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: matAjP, tipo: 'AJUSTE_POSITIVO', quantidade: 3, justificativa: 'contagem',
    });
    const linhaAjP = await filaPorMovimentacao(db, movAjP.id);
    assert.deepStrictEqual(JSON.parse(linhaAjP.destinatarios), ['classe-ajustes@teste.com']);

    const matAjN = await novoMaterial(db, { codigo: 'NOTIF-RN05-AJN', quantidade_atual: 10 });
    const movAjN = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: matAjN, tipo: 'AJUSTE_NEGATIVO', quantidade: 3, justificativa: 'contagem',
    });
    const linhaAjN = await filaPorMovimentacao(db, movAjN.id);
    assert.deepStrictEqual(JSON.parse(linhaAjN.destinatarios), ['classe-ajustes@teste.com']);

    // CONSUMO_TERCEIRO -> dest_terceiros, MESMO estando em TIPOS_SAIDA — precedencia sobre saida.
    const matTer = await novoMaterial(db, {
      codigo: 'NOTIF-RN05-TER', quantidade_atual: 10, quantidade_em_terceiros: 10,
    });
    const movTer = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: matTer, tipo: 'CONSUMO_TERCEIRO', quantidade: 4, justificativa: 'consumido no terceiro',
    });
    const linhaTer = await filaPorMovimentacao(db, movTer.id);
    assert.deepStrictEqual(JSON.parse(linhaTer.destinatarios), ['classe-terceiros@teste.com']);
  });

  await test('RN-05: tipo SEM classe nao enfileira', async () => {
    await setConfig(db, 'notificar_movimentacoes', '1');
    // Config ligada E destinatarios configurados para TODAS as classes (teste anterior ja
    // deixou); mesmo assim RESERVA nao pode gerar linha nenhuma — sem isso, toda requisicao
    // aprovada mandaria e-mail de reserva (achado da Fase 2).
    const mat = await novoMaterial(db, { codigo: 'NOTIF-RN05B-RES', quantidade_atual: 20 });
    const antes = await contarFila(db);
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'RESERVA', quantidade: 5,
    });
    const depois = await contarFila(db);
    assert.strictEqual(depois, antes, 'RESERVA nao pode ter enfileirado nada');
    const linha = await filaPorMovimentacao(db, mov.id);
    assert.ok(!linha, 'RESERVA nao pode ter linha na fila');
  });

  await test('RN-05: fallback e sem-destinatario', async () => {
    await setConfig(db, 'notificar_movimentacoes', '1');
    // Classe "entradas" SEM config propria -> cai no fallback alertas_estoque_emails (JSON).
    await setConfig(db, 'notificacoes_dest_entradas', '');
    await setConfig(db, 'alertas_estoque_emails', '["fallback@teste.com"]');

    const matFallback = await novoMaterial(db, { codigo: 'NOTIF-RN05C-FB', quantidade_atual: 0 });
    const movFallback = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: matFallback, tipo: 'ENTRADA_MANUAL', quantidade: 2, motivo: 'compra',
    });
    const linhaFallback = await filaPorMovimentacao(db, movFallback.id);
    assert.ok(linhaFallback, 'deveria ter enfileirado pelo fallback');
    assert.deepStrictEqual(JSON.parse(linhaFallback.destinatarios), ['fallback@teste.com']);

    // Nem classe nem fallback configurados -> nao enfileira (SEM_DESTINATARIO nao quebra o motor).
    await setConfig(db, 'alertas_estoque_emails', '[]');
    const matSemDest = await novoMaterial(db, { codigo: 'NOTIF-RN05C-SD', quantidade_atual: 0 });
    const antes = await contarFila(db);
    const movSemDest = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: matSemDest, tipo: 'ENTRADA_MANUAL', quantidade: 2, motivo: 'compra',
    });
    const depois = await contarFila(db);
    assert.strictEqual(depois, antes, 'sem destinatario nenhum nao pode ter enfileirado');
    const linhaSemDest = await filaPorMovimentacao(db, movSemDest.id);
    assert.ok(!linhaSemDest, 'sem destinatario nenhum nao pode ter linha na fila');
    assert.ok(movSemDest.id, 'a movimentacao em si tem de ter sido registrada normalmente');

    await setConfig(db, 'notificar_movimentacoes', '0');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
