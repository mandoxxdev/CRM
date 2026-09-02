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
const request = require('supertest');
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
    (codigo, nome, unidade, quantidade_atual, quantidade_em_terceiros, controle_serie, ativo)
    VALUES (?,?,?,?,?,?,1)`, [
    over.codigo || `NOTIF-${seq}`,
    over.nome || `Material notificacao ${seq}`,
    over.unidade || 'UN',
    over.quantidade_atual !== undefined ? over.quantidade_atual : 100,
    over.quantidade_em_terceiros || 0,
    over.controle_serie || 0,
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
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  await test('RN-04: movimentacao confirmada enfileira com conteudo minimo', async () => {
    await setConfig(db, 'notificar_movimentacoes', '1');
    await setConfig(db, 'notificacoes_dest_entradas', 'dest-entradas@teste.com');

    const mat = await novoMaterial(db, { codigo: 'NOTIF-RN04-1', quantidade_atual: 0 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA_MANUAL', quantidade: 10, motivo: 'compra',
      justificativa: 'urgente <b>hoje</b> & "fim"', referencia: 'REF-999',
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

    // Revisao da Task 2 (M2/M3, sabotagem S3): motivo e justificativa com rotulos PROPRIOS
    // (sao campos distintos no livro), referencia renderizada, e o link direto — dois itens
    // NOMEADOS na RN-04 que nenhum teste olhava.
    assert.ok(linha.corpo_texto.includes('Motivo: compra'), linha.corpo_texto);
    assert.ok(linha.corpo_texto.includes('Justificativa: urgente <b>hoje</b> & "fim"'), linha.corpo_texto);
    assert.ok(linha.corpo_texto.includes('Referência: REF-999'), linha.corpo_texto);
    assert.ok(linha.corpo_texto.includes(`/almoxarifado/movimentacoes?destaque=${mov.id}`), linha.corpo_texto);

    // Revisao da Task 2 (sabotagem S1): o escape de HTML e a UNICA defesa contra injecao no
    // corpo — a justificativa com <b>/& tem de sair ESCAPADA no corpo_html, nunca crua.
    assert.ok(linha.corpo_html.includes('urgente &lt;b&gt;hoje&lt;/b&gt; &amp;'), linha.corpo_html);
    assert.ok(!linha.corpo_html.includes('<b>hoje</b>'), 'HTML da justificativa nao pode sair cru');

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

    // ENTRADA -> dest_entradas. Revisao da Task 2 (sabotagem S2): a config de classe em JSON
    // com DOIS e-mails — o formato que a aba de Alertas grava — tem de passar pelo parseList
    // (sem ele, a lista inteira virava UM destinatario '["a@...","b@..."]').
    await setConfig(db, 'notificacoes_dest_entradas', '["classe-entradas@teste.com","classe-entradas-2@teste.com"]');
    const matEnt = await novoMaterial(db, { codigo: 'NOTIF-RN05-ENT', quantidade_atual: 0 });
    const movEnt = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: matEnt, tipo: 'ENTRADA_MANUAL', quantidade: 5, motivo: 'compra',
    });
    const linhaEnt = await filaPorMovimentacao(db, movEnt.id);
    assert.deepStrictEqual(JSON.parse(linhaEnt.destinatarios),
      ['classe-entradas@teste.com', 'classe-entradas-2@teste.com']);

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

  await test('RN-04: lote e series aparecem no corpo (revisao I1)', async () => {
    await setConfig(db, 'notificar_movimentacoes', '1');
    await setConfig(db, 'notificacoes_dest_entradas', 'dest-entradas@teste.com');

    const mat = await novoMaterial(db, { codigo: 'NOTIF-SERIE-1', quantidade_atual: 0, controle_serie: 1 });
    // Entrada que CRIA o lote pelo codigo (lote_id cru = null — o cenario da Fase 2) e as
    // series pelo motor de verdade (seriesService via registrarMovimentacao, exigeSerie).
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA_MANUAL', quantidade: 2, motivo: 'compra',
      lote: 'LOTE-NOTIF-1', series: ['SN-A1', 'SN-A2'],
    }, { exigeSerie: true });

    const linha = await filaPorMovimentacao(db, mov.id);
    assert.ok(linha, 'deveria ter enfileirado');
    assert.ok(linha.corpo_texto.includes('Lote: LOTE-NOTIF-1'), linha.corpo_texto);
    assert.ok(linha.corpo_texto.includes('Séries: SN-A1, SN-A2'), linha.corpo_texto);
  });

  await test('RN-05: remessa/retorno a terceiro NAO enfileiram (revisao I3)', async () => {
    await setConfig(db, 'notificar_movimentacoes', '1');
    await setConfig(db, 'notificacoes_dest_terceiros', 'classe-terceiros@teste.com');

    // REMESSA/RETORNO sao RETENCAO (saldo global nao muda) e a remessa chama o motor item a
    // item — 10 itens virariam 10 e-mails de "saldo identico". Ficam fora da classe terceiros;
    // CONSUMO_TERCEIRO (saida de verdade) continua notificando — provado no teste de classes.
    const mat = await novoMaterial(db, {
      codigo: 'NOTIF-REM-1', quantidade_atual: 50, quantidade_em_terceiros: 10,
    });
    const antes = await contarFila(db);

    const movRem = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'REMESSA_TERCEIRO', quantidade: 5, justificativa: 'remessa para tratamento',
    });
    const movRet = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'RETORNO_TERCEIRO', quantidade: 3, justificativa: 'retorno do tratamento',
    });

    const depois = await contarFila(db);
    assert.strictEqual(depois, antes, 'remessa/retorno nao podem ter enfileirado nada');
    assert.ok(!(await filaPorMovimentacao(db, movRem.id)), 'REMESSA_TERCEIRO sem linha na fila');
    assert.ok(!(await filaPorMovimentacao(db, movRet.id)), 'RETORNO_TERCEIRO sem linha na fila');
  });

  await test('RN-04: cancelamento suprime a notificacao PENDENTE, preserva a ENVIADA (revisao I2)', async () => {
    await setConfig(db, 'notificar_movimentacoes', '1');
    await setConfig(db, 'notificacoes_dest_saidas', 'dest-saidas@teste.com');

    // Sem a supressao, o worker mandava e-mail de uma saida que o estorno acabou de desfazer —
    // e nao existe e-mail de correcao (ESTORNO nasce de INSERT direto, nunca passa pelo gancho).
    const mat = await novoMaterial(db, { codigo: 'NOTIF-CANC-1', quantidade_atual: 100 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 40, os_id: 1,
    });
    const pendente = await filaPorMovimentacao(db, mov.id);
    assert.strictEqual(pendente.status, 'PENDENTE', JSON.stringify(pendente));

    await stockService.cancelarMovimentacao(db, ADMIN, mov.id, 'saida lancada por engano');
    const suprimida = await filaPorMovimentacao(db, mov.id);
    assert.strictEqual(suprimida.status, 'FALHA', JSON.stringify(suprimida));
    assert.strictEqual(suprimida.ultimo_erro, 'Movimentação cancelada antes do envio', JSON.stringify(suprimida));

    // Linha ja ENVIADA fica como esta (o e-mail saiu de fato; correcao retroativa e corte
    // declarado) — a supressao so alcanca PENDENTE.
    const mov2 = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 10, os_id: 1,
    });
    const linha2 = await filaPorMovimentacao(db, mov2.id);
    await dbRun(db, `UPDATE fila_notificacoes_almoxarifado SET status = 'ENVIADO', enviado_em = CURRENT_TIMESTAMP WHERE id = ?`, [linha2.id]);
    await stockService.cancelarMovimentacao(db, ADMIN, mov2.id, 'tambem engano');
    const linha2Depois = await dbGet(db, 'SELECT status FROM fila_notificacoes_almoxarifado WHERE id = ?', [linha2.id]);
    assert.strictEqual(linha2Depois.status, 'ENVIADO', JSON.stringify(linha2Depois));

    await setConfig(db, 'notificar_movimentacoes', '0');
  });

  await test('RN-04: AJUSTE rotula quantidade como novo total; AJUSTE_INVENTARIO NAO enfileira (revisao final C2)', async () => {
    await setConfig(db, 'notificar_movimentacoes', '1');
    await setConfig(db, 'notificacoes_dest_ajustes', 'classe-ajustes@teste.com');

    // Em AJUSTE/AJUSTE_INVENTARIO a quantidade e o VALOR ABSOLUTO (100 -> 30), nao o delta —
    // o rotulo tem de dizer isso. O AJUSTE manual (um a um) continua notificando.
    const mat = await novoMaterial(db, { codigo: 'NOTIF-AJI-1', quantidade_atual: 100 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 30, justificativa: 'acerto manual',
    });
    const linha = await filaPorMovimentacao(db, mov.id);
    assert.ok(linha, 'deveria ter enfileirado');
    assert.ok(linha.corpo_texto.includes('Quantidade (novo total): 30'), linha.corpo_texto);
    assert.ok(linha.corpo_texto.includes('Saldo anterior: 100'), linha.corpo_texto);
    assert.ok(linha.corpo_texto.includes('Saldo posterior: 30'), linha.corpo_texto);

    // Revisao final (lente A, Critical 2): AJUSTE_INVENTARIO so existe em LOTE — a conclusao
    // da conferencia emite um por item divergente (50 divergencias = 50 e-mails num clique,
    // medido; o comentario da rota fala em 300). Mesma familia de rajada que o resolver ja
    // corta para RESERVA e remessa. Fica fora; a conferencia tem tela/relatorio proprios.
    const mat2 = await novoMaterial(db, { codigo: 'NOTIF-AJI-2', quantidade_atual: 100 });
    const antes = await contarFila(db);
    const movInv = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat2, tipo: 'AJUSTE_INVENTARIO', quantidade: 30, justificativa: 'contagem fisica',
    });
    assert.strictEqual(await contarFila(db), antes, 'AJUSTE_INVENTARIO nao pode enfileirar');
    assert.ok(!(await filaPorMovimentacao(db, movInv.id)), 'AJUSTE_INVENTARIO sem linha na fila');

    await setConfig(db, 'notificar_movimentacoes', '0');
  });

  await test('RN-05: fallback respeita o toggle "Notificar por e-mail" (revisao final I2)', async () => {
    // O fallback e o estado DEFAULT (dest_* nascem vazias): sem esta guarda, quem silenciou
    // alertas_estoque_emails voltava a receber e-mail nela ao ligar notificar_movimentacoes.
    await setConfig(db, 'notificar_movimentacoes', '1');
    await setConfig(db, 'notificacoes_dest_entradas', '');
    await setConfig(db, 'alertas_estoque_emails', '["silenciado@teste.com"]');
    await setConfig(db, 'alertas_estoque_notificar_email', '0');
    try {
      const mat = await novoMaterial(db, { codigo: 'NOTIF-TGL-1', quantidade_atual: 0 });
      const antes = await contarFila(db);
      const mov = await stockService.registrarMovimentacao(db, ADMIN, {
        material_id: mat, tipo: 'ENTRADA_MANUAL', quantidade: 2, motivo: 'compra',
      });
      assert.strictEqual(await contarFila(db), antes, 'toggle OFF + fallback nao pode enfileirar');
      assert.ok(!(await filaPorMovimentacao(db, mov.id)));

      // Classe COM config propria fica FORA do toggle (o admin escolheu aquele destino).
      await setConfig(db, 'notificacoes_dest_entradas', 'explicito@teste.com');
      const mat2 = await novoMaterial(db, { codigo: 'NOTIF-TGL-2', quantidade_atual: 0 });
      const mov2 = await stockService.registrarMovimentacao(db, ADMIN, {
        material_id: mat2, tipo: 'ENTRADA_MANUAL', quantidade: 2, motivo: 'compra',
      });
      const linha2 = await filaPorMovimentacao(db, mov2.id);
      assert.ok(linha2, 'classe com config propria enfileira mesmo com toggle OFF');
      assert.deepStrictEqual(JSON.parse(linha2.destinatarios), ['explicito@teste.com']);
    } finally {
      await setConfig(db, 'alertas_estoque_notificar_email', '1');
      await setConfig(db, 'alertas_estoque_emails', '[]');
      await setConfig(db, 'notificar_movimentacoes', '0');
    }
  });

  await test('RN-08: reenviar de notificacao de movimentacao CANCELADA recusa 400 (revisao final I1)', async () => {
    // O reenvio manual atravessava a supressao: "olhar as falhas e reenviar" reemitia o aviso
    // de uma saida que nao existe mais no saldo. A guarda e por FATO (coluna cancelado).
    await setConfig(db, 'notificar_movimentacoes', '1');
    await setConfig(db, 'notificacoes_dest_saidas', 'dest-saidas@teste.com');
    const mat = await novoMaterial(db, { codigo: 'NOTIF-CANC-REENV', quantidade_atual: 100 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 10, os_id: 1,
    });
    await stockService.cancelarMovimentacao(db, ADMIN, mov.id, 'engano');
    const linha = await filaPorMovimentacao(db, mov.id);
    assert.strictEqual(linha.status, 'FALHA', JSON.stringify(linha));

    setUser(ADMIN);
    const res = await request(app).post(`/api/almoxarifado/notificacoes/${linha.id}/reenviar`).send({});
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Movimentação cancelada — notificação não pode ser reenviada');

    // O motivo da supressao continua legivel no painel (o reenviar recusado nao reseta nada).
    const depois = await dbGet(db, 'SELECT status, ultimo_erro FROM fila_notificacoes_almoxarifado WHERE id = ?', [linha.id]);
    assert.strictEqual(depois.status, 'FALHA', JSON.stringify(depois));
    assert.strictEqual(depois.ultimo_erro, 'Movimentação cancelada antes do envio', JSON.stringify(depois));

    await setConfig(db, 'notificar_movimentacoes', '0');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
