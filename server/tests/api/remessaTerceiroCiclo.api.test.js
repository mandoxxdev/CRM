/**
 * Etapa 8b, Tasks 5-7 — o ciclo da remessa a terceiros: criar, enviar, retornar, encerrar, cancelar.
 *
 * Testa o SERVICO (thirdPartyService), nao as rotas — as rotas tem arquivo proprio
 * (remessaTerceiroRotas.api.test.js, Task 8). O efeito de saldo ja foi provado no motor
 * (remessaTerceiroMotor.api.test.js, Task 4); aqui o alvo e a ORQUESTRACAO: a pre-checagem que
 * recusa a remessa inteira, a idempotencia do envio, o teto do retorno, o destino obrigatorio no
 * encerramento e o estorno do cancelamento.
 *
 * Executar: cd server && node tests/api/remessaTerceiroCiclo.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const svc = require('../../services/almoxarifado/thirdPartyService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 2, nome: 'Almoxarife', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const PRODUCAO = { id: 3, nome: 'Chao de fabrica', email: 'prod@test.com', perfil_almoxarifado: 'PRODUCAO' };

let seq = 0;
async function novoMaterial(db, { atual = 100, dono = null } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, proprietario_cliente_id)
     VALUES (?,?,'UN',?,1,?)`, [`REM-${seq}`, `Material remessa ${seq}`, atual, dono]);
  return r.lastID;
}
const saldos = async (db, id) => dbGet(db,
  'SELECT quantidade_atual, COALESCE(quantidade_em_terceiros,0) AS em_terceiros FROM materiais_almoxarifado WHERE id = ?', [id]);
const statusDa = async (db, id) => (await dbGet(db,
  'SELECT status FROM remessas_terceiro_almoxarifado WHERE id = ?', [id])).status;

async function remessaCom(db, itens, extra = {}) {
  return svc.criarRemessa(db, ADMIN, {
    fornecedor_nome: 'Galvanizadora Sul LTDA',
    tipo_servico: 'Galvanizacao',
    prazo_previsto: '2026-09-30',
    itens,
    ...extra,
  });
}

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  // ══ Task 5 — criar e enviar ═════════════════════════════════════════════════════════════════

  await test('criar remessa nasce ABERTA e NAO mexe em saldo nenhum', async () => {
    const mat = await novoMaterial(db);
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 30 }]);
    assert.strictEqual(rem.status, 'ABERTA');
    assert.ok(rem.numero, 'a remessa nasceu sem numero de documento');
    const s = await saldos(db, mat);
    assert.strictEqual(s.quantidade_atual, 100);
    assert.strictEqual(s.em_terceiros, 0, 'a remessa ABERTA ja reteve saldo — nada saiu do galpao ainda');
  });

  await test('remessa sem a acao remessar_terceiro falha com 403', async () => {
    const mat = await novoMaterial(db);
    await assert.rejects(
      () => svc.criarRemessa(db, PRODUCAO, { fornecedor_nome: 'X', itens: [{ material_id: mat, quantidade: 1 }] }),
      (e) => { assert.strictEqual(e.status, 403); return true; });
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) AS n FROM remessas_terceiro_almoxarifado WHERE fornecedor_nome = ?', ['X'])).n, 0);
  });

  await test('[CONTROLE POSITIVO] ALMOXARIFE, que tem a acao, cria normalmente', async () => {
    // Sem isto, `return 403 sempre` passaria no teste acima.
    const mat = await novoMaterial(db);
    const rem = await svc.criarRemessa(db, ALMOXARIFE, {
      fornecedor_nome: 'Galvanizadora Sul LTDA', itens: [{ material_id: mat, quantidade: 5 }] });
    assert.strictEqual(rem.status, 'ABERTA');
  });

  await test('remessa sem itens e recusada', async () => {
    await assert.rejects(() => svc.criarRemessa(db, ADMIN, { fornecedor_nome: 'Y', itens: [] }), /item/i);
  });

  await test('remessa registra o dono quando o material e de cliente, e nomeia o cliente', async () => {
    // Decisao 5: a isencao da guarda do dono so e aceitavel COM esta contrapartida.
    const cli = await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente Chapa LTDA')");
    const mat = await novoMaterial(db, { dono: cli.lastID });
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 10 }]);
    assert.strictEqual(rem.proprietario_cliente_id, cli.lastID);
    assert.strictEqual(rem.proprietario_cliente_nome, 'Cliente Chapa LTDA',
      'o documento de remessa nao nomeia o cliente proprietario');
  });

  await test('[CONTROLE POSITIVO] remessa de material de cliente e ACEITA sem OS nem projeto', async () => {
    // A outra metade da decisao 5: a isencao da regra de OS/projeto tem de valer de verdade.
    // Sem este teste, "recusar toda remessa de material de cliente" passaria no teste acima
    // (o de cima so olha o dono gravado de uma remessa que ele mesmo assume ter sido criada).
    const cli = await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente Isento LTDA')");
    const mat = await novoMaterial(db, { dono: cli.lastID });
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 10 }]);
    await svc.enviarRemessa(db, ADMIN, rem.id); // sem os_id nem projeto_id: e o ponto da isencao
    assert.strictEqual(await statusDa(db, rem.id), 'ENVIADA');
    assert.strictEqual((await saldos(db, mat)).em_terceiros, 10,
      'a remessa de material de cliente foi barrada por falta de OS/projeto — a isencao da decisao 5 nao vale');
  });

  await test('remessa que mistura donos diferentes e recusada, nomeando os dois', async () => {
    const a = await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente A LTDA')");
    const b = await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente B LTDA')");
    const matA = await novoMaterial(db, { dono: a.lastID });
    const matB = await novoMaterial(db, { dono: b.lastID });
    await assert.rejects(
      () => remessaCom(db, [{ material_id: matA, quantidade: 5 }, { material_id: matB, quantidade: 5 }]),
      (e) => {
        assert.match(e.message, /Cliente A LTDA/);
        assert.match(e.message, /Cliente B LTDA/);
        return true;
      });
  });

  await test('[CONTROLE POSITIVO] remessa so com material NOSSO e aceita, e fica sem dono', async () => {
    // A metade que falta: recusar toda remessa com mais de um item passaria no teste acima.
    const m1 = await novoMaterial(db);
    const m2 = await novoMaterial(db);
    const rem = await remessaCom(db, [{ material_id: m1, quantidade: 5 }, { material_id: m2, quantidade: 5 }]);
    assert.strictEqual(rem.proprietario_cliente_id, null);
    assert.strictEqual(rem.itens.length, 2);
  });

  await test('enviar retem o saldo de TODOS os itens e muda o status', async () => {
    const m1 = await novoMaterial(db);
    const m2 = await novoMaterial(db);
    const rem = await remessaCom(db, [{ material_id: m1, quantidade: 30 }, { material_id: m2, quantidade: 40 }]);
    const r = await svc.enviarRemessa(db, ADMIN, rem.id);
    assert.strictEqual(r.itens_enviados, 2);
    assert.strictEqual(await statusDa(db, rem.id), 'ENVIADA');
    assert.strictEqual((await saldos(db, m1)).em_terceiros, 30);
    assert.strictEqual((await saldos(db, m2)).em_terceiros, 40);
    assert.strictEqual((await saldos(db, m1)).quantidade_atual, 100, 'o envio baixou o patrimonio');
  });

  await test('remessa com item sem saldo nao move NENHUM item', async () => {
    // Decisao 9: pre-checagem que recusa a remessa INTEIRA antes de mover qualquer coisa. Molde de
    // receiptService.darEntradaEstoque. A Etapa 7 mostrou o custo de nao ter isso.
    const bom = await novoMaterial(db, { atual: 100 });
    const ruim = await novoMaterial(db, { atual: 5 });
    const rem = await remessaCom(db, [{ material_id: bom, quantidade: 50 }, { material_id: ruim, quantidade: 50 }]);
    await assert.rejects(() => svc.enviarRemessa(db, ADMIN, rem.id), (e) => {
      assert.strictEqual(e.status, 400);
      assert.match(e.message, /5/, 'a mensagem nao diz quanto ha disponivel do item que travou');
      return true;
    });
    assert.strictEqual((await saldos(db, bom)).em_terceiros, 0,
      'o item BOM foi enviado mesmo com a remessa recusada — a remessa parou no meio');
    assert.strictEqual((await saldos(db, ruim)).em_terceiros, 0);
    assert.strictEqual(await statusDa(db, rem.id), 'ABERTA', 'o status avancou com a remessa recusada');
  });

  await test('atomicidade real: item do MEIO sem saldo nao deixa rastro nem no item 1 nem na tabela', async () => {
    // O caso que o teste acima nao cobre: com o item ruim em SEGUNDO lugar, um laco sem
    // pre-checagem ja teria movido o primeiro item quando descobrisse o problema. Aqui o ruim esta
    // no MEIO de tres, e a verificacao nao para no status HTTP: olha saldo, olha `enviado_em` de
    // cada item e olha o LIVRO de movimentacoes. Sem isso, uma implementacao que estornasse o saldo
    // mas deixasse o item marcado como enviado (nunca mais reenviavel) passaria.
    const p1 = await novoMaterial(db, { atual: 100 });
    const meio = await novoMaterial(db, { atual: 5 });
    const p3 = await novoMaterial(db, { atual: 100 });
    const rem = await remessaCom(db, [
      { material_id: p1, quantidade: 40 },
      { material_id: meio, quantidade: 40 },
      { material_id: p3, quantidade: 40 }]);

    await assert.rejects(() => svc.enviarRemessa(db, ADMIN, rem.id), (e) => {
      assert.strictEqual(e.status, 400);
      return true;
    });

    for (const id of [p1, meio, p3]) {
      assert.strictEqual((await saldos(db, id)).em_terceiros, 0,
        `material ${id} ficou retido apesar de a remessa inteira ter sido recusada`);
      assert.strictEqual((await saldos(db, id)).quantidade_atual, id === meio ? 5 : 100);
    }
    const marcados = await dbAll(db,
      'SELECT id, enviado_em, movimentacao_envio_id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?',
      [rem.id]);
    assert.strictEqual(marcados.length, 3);
    for (const it of marcados) {
      assert.strictEqual(it.enviado_em, null, 'item ficou marcado como enviado numa remessa recusada');
      assert.strictEqual(it.movimentacao_envio_id, null);
    }
    const movs = await dbAll(db,
      `SELECT id FROM movimentacoes_almoxarifado WHERE material_id IN (?,?,?)`, [p1, meio, p3]);
    assert.strictEqual(movs.length, 0, 'a remessa recusada gravou linha no livro de movimentacoes');
    assert.strictEqual(await statusDa(db, rem.id), 'ABERTA');
  });

  await test('duas linhas do MESMO material que juntas passam do disponivel sao recusadas antes de mover', async () => {
    // ACHADO DA EXECUCAO — o codigo do plano falhava aqui, e a falha era exatamente a que a
    // pre-checagem existe para impedir. A pre-checagem do plano comparava CADA linha, sozinha,
    // contra o disponivel do material; duas linhas de 60 de um material com 100 passavam as duas
    // (60 <= 100 duas vezes), a primeira era enviada, e a SEGUNDA batia no claim do motor. Resultado
    // medido antes do conserto: em_terceiros = 60, item 1 com enviado_em preenchido, item 2 nao,
    // remessa parada em ABERTA — a remessa pela metade, o defeito da Etapa 7 de novo.
    // Duas linhas do mesmo material nao sao caso de laboratorio: o item tem lote_id, peso e
    // observacoes proprios justamente para permitir separar duas chapas do mesmo codigo.
    const mat = await novoMaterial(db, { atual: 100 });
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 60 }, { material_id: mat, quantidade: 60 }]);
    // O erro e capturado a mao (em vez de assert.rejects) de proposito: o validador de
    // assert.rejects roda ANTES de qualquer olhada no banco, e a falha reportada seria sobre o texto
    // da mensagem. O que importa aqui e o ESTADO — que a remessa nao saiu pela metade — entao ele e
    // conferido primeiro, e a mensagem por ultimo.
    let capturado = null;
    try { await svc.enviarRemessa(db, ADMIN, rem.id); } catch (e) { capturado = e; }
    assert.ok(capturado, 'o envio das duas linhas nao foi recusado');
    assert.strictEqual((await saldos(db, mat)).em_terceiros, 0,
      'a primeira linha foi enviada e a segunda nao — a remessa saiu pela metade');
    const itens = await dbAll(db,
      'SELECT enviado_em FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?', [rem.id]);
    assert.deepStrictEqual(itens.map((i) => i.enviado_em), [null, null]);
    assert.strictEqual(await statusDa(db, rem.id), 'ABERTA');
    assert.strictEqual(capturado.status, 400);
    assert.match(capturado.message, /120/, 'a mensagem nao diz o total pedido somando as linhas do material');
  });

  await test('[CONTROLE POSITIVO] duas linhas do mesmo material que CABEM no disponivel sao enviadas', async () => {
    // A metade que falta: somar as linhas e comparar errado (ou recusar todo material repetido)
    // passaria no teste acima. 60 + 40 = 100 = disponivel: tem de passar, e reter os 100.
    const mat = await novoMaterial(db, { atual: 100 });
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 60 }, { material_id: mat, quantidade: 40 }]);
    const r = await svc.enviarRemessa(db, ADMIN, rem.id);
    assert.strictEqual(r.itens_enviados, 2);
    assert.strictEqual((await saldos(db, mat)).em_terceiros, 100);
  });

  await test('falha DENTRO do motor devolve o claim do item (o item continua reenviavel)', async () => {
    // A pre-checagem cobre o que da para prever; o que ela nao cobre (uma saida concorrente entre a
    // checagem e o efeito) cai no catch, e sem a compensacao do claim o item ficaria marcado como
    // enviado SEM retencao — invisivel e nunca mais reenviavel. Aqui o motor e stubado para falhar
    // porque nao ha como provocar a corrida de forma deterministica.
    const mat = await novoMaterial(db, { atual: 100 });
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 10 }]);
    const original = stockService.registrarMovimentacao;
    stockService.registrarMovimentacao = async () => {
      throw Object.assign(new Error('falha simulada do motor'), { status: 400 });
    };
    try {
      await assert.rejects(() => svc.enviarRemessa(db, ADMIN, rem.id), /falha simulada do motor/);
    } finally {
      stockService.registrarMovimentacao = original;
    }
    const item = await dbGet(db,
      'SELECT enviado_em FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?', [rem.id]);
    assert.strictEqual(item.enviado_em, null, 'o item ficou reclamado sem retencao — nunca mais seria reenviado');
    assert.strictEqual(await statusDa(db, rem.id), 'ABERTA');
    // E a prova de que "reenviavel" nao e so uma coluna nula: reenviar de verdade funciona.
    const r = await svc.enviarRemessa(db, ADMIN, rem.id);
    assert.strictEqual(r.itens_enviados, 1);
    assert.strictEqual((await saldos(db, mat)).em_terceiros, 10);
  });

  await test('[CONTROLE POSITIVO] com todos os itens com saldo, os dois sao enviados', async () => {
    // A metade que falta: uma pre-checagem que recusasse sempre passaria no teste acima.
    const a = await novoMaterial(db, { atual: 100 });
    const b = await novoMaterial(db, { atual: 100 });
    const rem = await remessaCom(db, [{ material_id: a, quantidade: 50 }, { material_id: b, quantidade: 50 }]);
    await svc.enviarRemessa(db, ADMIN, rem.id);
    assert.strictEqual((await saldos(db, a)).em_terceiros, 50);
    assert.strictEqual((await saldos(db, b)).em_terceiros, 50);
  });

  await test('[CONTROLE POSITIVO] enviar EXATAMENTE o disponivel passa (a pre-checagem nao erra o limite)', async () => {
    // A pre-checagem compara `disponivel < quantidade`. Um `<=` no lugar barraria a remessa que
    // manda a peca inteira para galvanizar — o caso mais comum do galpao — e nenhum outro teste
    // desta suite pegaria isso.
    const mat = await novoMaterial(db, { atual: 40 });
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 40 }]);
    await svc.enviarRemessa(db, ADMIN, rem.id);
    assert.strictEqual((await saldos(db, mat)).em_terceiros, 40);
  });

  await test('enviar duas vezes nao retem o dobro (claim de idempotencia no item)', async () => {
    const mat = await novoMaterial(db);
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 30 }]);
    await svc.enviarRemessa(db, ADMIN, rem.id);
    // A segunda chamada e recusada pela maquina de estados (ENVIADA -> ENVIADA nao existe)...
    await assert.rejects(() => svc.enviarRemessa(db, ADMIN, rem.id), /ENVIADA/);
    // ...e mesmo forcando o status para tras, o claim `enviado_em IS NULL` do ITEM segura.
    await dbRun(db, "UPDATE remessas_terceiro_almoxarifado SET status = 'ABERTA' WHERE id = ?", [rem.id]);
    const r2 = await svc.enviarRemessa(db, ADMIN, rem.id);
    assert.strictEqual(r2.itens_enviados, 0, 'o item ja enviado foi reprocessado');
    assert.strictEqual((await saldos(db, mat)).em_terceiros, 30, 'a retencao dobrou num reenvio');
  });

  await test('enviar remessa ja encerrada e recusado pela maquina de estados', async () => {
    const mat = await novoMaterial(db);
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 10 }]);
    await dbRun(db, "UPDATE remessas_terceiro_almoxarifado SET status = 'ENCERRADA' WHERE id = ?", [rem.id]);
    await assert.rejects(() => svc.enviarRemessa(db, ADMIN, rem.id), /ENCERRADA/);
    assert.strictEqual((await saldos(db, mat)).em_terceiros, 0);
  });

  await test('getRemessa traz itens com o pendente calculado e o codigo do material', async () => {
    const mat = await novoMaterial(db);
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 30 }]);
    await svc.enviarRemessa(db, ADMIN, rem.id);
    const cheia = await svc.getRemessa(db, rem.id);
    assert.strictEqual(cheia.itens.length, 1);
    assert.strictEqual(cheia.itens[0].pendente, 30);
    assert.ok(cheia.itens[0].material_codigo, 'a tela nao tem como mostrar o codigo do material');
    assert.deepStrictEqual(cheia.retornos, []);
  });

  await test('listarRemessas marca vencida por prazo, e nao marca quem esta no prazo', async () => {
    const m1 = await novoMaterial(db);
    const m2 = await novoMaterial(db);
    const atrasada = await remessaCom(db, [{ material_id: m1, quantidade: 10 }], { prazo_previsto: '2020-01-01' });
    const no_prazo = await remessaCom(db, [{ material_id: m2, quantidade: 10 }], { prazo_previsto: '2099-01-01' });
    await svc.enviarRemessa(db, ADMIN, atrasada.id);
    await svc.enviarRemessa(db, ADMIN, no_prazo.id);
    const lista = await svc.listarRemessas(db, {});
    assert.strictEqual(lista.find((r) => r.id === atrasada.id).vencida, 1);
    assert.strictEqual(lista.find((r) => r.id === no_prazo.id).vencida, 0,
      'toda remessa foi marcada como vencida — o destaque da tela viraria ruido');
  });

  // ══ Task 6 — retorno parcial ════════════════════════════════════════════════════════════════

  /** Remessa de 1 item, ja ENVIADA, com `qtd` retido. Devolve { remessa, itemId, materialId }. */
  async function remessaEnviada(db, qtd = 100, opts = {}) {
    const mat = await novoMaterial(db, { atual: qtd, ...opts });
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: qtd }]);
    await svc.enviarRemessa(db, ADMIN, rem.id);
    const item = await dbGet(db,
      'SELECT id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?', [rem.id]);
    return { remessa: rem, itemId: item.id, materialId: mat };
  }

  /** Remessa ENVIADA com DUAS linhas do MESMO material (60 + 40 de um material com 100). */
  async function remessaDuasLinhasMesmoMaterial(db) {
    const mat = await novoMaterial(db, { atual: 100 });
    const rem = await remessaCom(db, [
      { material_id: mat, quantidade: 60 }, { material_id: mat, quantidade: 40 }]);
    await svc.enviarRemessa(db, ADMIN, rem.id);
    const itens = await dbAll(db,
      'SELECT id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ? ORDER BY id', [rem.id]);
    return { remessa: rem, materialId: mat, itemGrande: itens[0].id, itemPequeno: itens[1].id };
  }

  await test('retorno parcial devolve ao disponivel e deixa o resto retido', async () => {
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    const r = await svc.registrarRetorno(db, ADMIN, remessa.id, {
      nota_fiscal: 'NF-RET-1', itens: [{ item_remessa_id: itemId, quantidade: 40 }] });
    assert.strictEqual(r.status, 'RETORNO_PARCIAL');
    assert.strictEqual(r.pendente_total, 60);
    // A metade negativa do encerramento automatico: sobrou pendencia, entao a remessa NAO fecha.
    assert.strictEqual(await statusDa(db, remessa.id), 'RETORNO_PARCIAL',
      'a remessa encerrou sozinha com material ainda no terceiro');
    const s = await saldos(db, materialId);
    assert.strictEqual(s.em_terceiros, 60);
    assert.strictEqual(s.quantidade_atual, 100, 'o retorno CREDITOU estoque — o material nunca saiu do patrimonio');
  });

  await test('dois retornos parciais somam, e o segundo nao e recusado pela maquina de estados', async () => {
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 30 }] });
    const r = await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 20 }] });
    assert.strictEqual(r.pendente_total, 50);
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 50);
    const cheia = await svc.getRemessa(db, remessa.id);
    assert.strictEqual(cheia.itens[0].quantidade_retornada, 50);
    assert.strictEqual(cheia.retornos.length, 2, 'os resultados nao viraram duas linhas rastreaveis');
  });

  await test('retorno maior que a remessa falha, e a mensagem diz quanto ainda esta la', async () => {
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 70 }] });
    await assert.rejects(
      () => svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 40 }] }),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.match(e.message, /100/, 'a mensagem nao diz quanto foi enviado');
        assert.match(e.message, /70/, 'a mensagem nao diz quanto ja voltou');
        assert.match(e.message, /30/, 'a mensagem nao diz quanto ainda esta no terceiro');
        return true;
      });
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 30, 'o retorno excedente moveu saldo');
    const linhas = await dbAll(db,
      'SELECT id FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ?', [itemId]);
    assert.strictEqual(linhas.length, 1, 'o retorno recusado gravou linha de resultado');
  });

  await test('[CONTROLE POSITIVO] retorno EXATAMENTE do pendente e aceito', async () => {
    // A metade que falta: uma validacao que recusasse todo retorno passaria no teste acima.
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 70 }] });
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 30 }] });
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 0);
  });

  await test('dois resultados do MESMO item no MESMO recebimento que juntos estouram sao recusados', async () => {
    // ACHADO DA TASK 5, guardado aqui: a pre-checagem "tudo ou nada" tem de agregar pelo RECURSO
    // ESCASSO (o pendente do item), nunca pela linha do documento. Sem o acumulador, dois
    // resultados de 60 de um item de 100 passam os DOIS (60 <= 100, duas vezes), o primeiro e
    // creditado e o segundo bate no claim — o recebimento pela metade. Foi exatamente o defeito
    // que a Task 5 achou no envio, no codigo que o plano trazia pronto.
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    let capturado = null;
    try {
      await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [
        { item_remessa_id: itemId, quantidade: 60 },
        { item_remessa_id: itemId, quantidade: 60 },
      ] });
    } catch (e) { capturado = e; }
    assert.ok(capturado, 'dois resultados de 60 de um item de 100 foram aceitos');
    // O ESTADO primeiro, a mensagem depois: o que importa e que nada foi creditado pela metade.
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 100,
      'o primeiro resultado foi creditado e o segundo nao — o recebimento entrou pela metade');
    const item = await dbGet(db,
      'SELECT quantidade_retornada FROM itens_remessa_terceiro_almoxarifado WHERE id = ?', [itemId]);
    assert.strictEqual(item.quantidade_retornada, 0);
    const linhas = await dbAll(db,
      'SELECT id FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ?', [itemId]);
    assert.strictEqual(linhas.length, 0, 'o recebimento recusado gravou resultado');
    assert.strictEqual(capturado.status, 400);
    assert.match(capturado.message, /120/,
      'a mensagem nao diz o total que o recebimento pede somando as linhas do item');
  });

  await test('[CONTROLE POSITIVO] dois resultados do MESMO item no MESMO recebimento que CABEM sao aceitos', async () => {
    // A metade que falta: somar errado (ou recusar todo item repetido no recebimento) passaria no
    // teste acima. 60 + 40 = 100 = pendente: tem de passar, virar DUAS linhas de resultado e
    // encerrar a remessa. Dois resultados do mesmo item nao sao caso de laboratorio — o retorno e
    // uma LISTA de resultados (decisao 7), com lote e observacoes proprios por linha.
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    const r = await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [
      { item_remessa_id: itemId, quantidade: 60 },
      { item_remessa_id: itemId, quantidade: 40 },
    ] });
    assert.strictEqual(r.resultados, 2);
    assert.strictEqual(r.pendente_total, 0);
    assert.strictEqual(r.status, 'ENCERRADA');
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 0);
    const linhas = await dbAll(db,
      'SELECT quantidade FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ? ORDER BY id', [itemId]);
    assert.deepStrictEqual(linhas.map((l) => l.quantidade), [60, 40]);
  });

  await test('dois itens do MESMO material: o teto e por ITEM, nao pelo total retido do material', async () => {
    // O material tem 100 retidos, mas o item pequeno so mandou 40. Aceitar 50 nele porque "o
    // material tem 100 la fora" faria o item grande parecer com pendencia que nao existe e
    // desalinharia o documento do saldo — e a Etapa 8c, que rastreia resultado POR ITEM enviado,
    // herdaria o desalinhamento.
    const { remessa, materialId, itemPequeno } = await remessaDuasLinhasMesmoMaterial(db);
    await assert.rejects(
      () => svc.registrarRetorno(db, ADMIN, remessa.id, {
        itens: [{ item_remessa_id: itemPequeno, quantidade: 50 }] }),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.match(e.message, /40/, 'a mensagem nao diz quanto aquele ITEM mandou');
        return true;
      });
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 100, 'o retorno recusado moveu saldo');
    assert.strictEqual(await statusDa(db, remessa.id), 'ENVIADA');
  });

  await test('[CONTROLE POSITIVO] dois itens do mesmo material retornam cada um o seu e a remessa encerra', async () => {
    // A metade que falta: um teto por item que confundisse os dois itens (ou recusasse material
    // repetido) passaria no teste acima.
    const { remessa, materialId, itemGrande, itemPequeno } = await remessaDuasLinhasMesmoMaterial(db);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemGrande, quantidade: 60 }] });
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 40);
    assert.strictEqual(await statusDa(db, remessa.id), 'RETORNO_PARCIAL');
    const r = await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemPequeno, quantidade: 40 }] });
    assert.strictEqual(r.status, 'ENCERRADA');
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 0);
  });

  await test('retorno total encerra a remessa sozinho, sem exigir destino', async () => {
    // Nao sobrou pendencia: nao ha o que justificar. Exigir destino aqui obrigaria o operador a
    // inventar uma perda que nao houve.
    const { remessa, itemId } = await remessaEnviada(db, 100);
    const r = await svc.registrarRetorno(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade: 100 }] });
    assert.strictEqual(r.status, 'ENCERRADA');
    assert.strictEqual(r.pendente_total, 0);
    assert.strictEqual(await statusDa(db, remessa.id), 'ENCERRADA');
  });

  await test('retorno de item de OUTRA remessa e recusado', async () => {
    const a = await remessaEnviada(db, 100);
    const b = await remessaEnviada(db, 100);
    await assert.rejects(
      () => svc.registrarRetorno(db, ADMIN, a.remessa.id, { itens: [{ item_remessa_id: b.itemId, quantidade: 10 }] }),
      /outra remessa|nao pertence/i);
    assert.strictEqual((await saldos(db, b.materialId)).em_terceiros, 100);
  });

  await test('retorno em remessa que nunca foi enviada e recusado', async () => {
    const mat = await novoMaterial(db);
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 10 }]);
    const item = await dbGet(db, 'SELECT id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?', [rem.id]);
    await assert.rejects(
      () => svc.registrarRetorno(db, ADMIN, rem.id, { itens: [{ item_remessa_id: item.id, quantidade: 5 }] }),
      /ABERTA/);
    assert.strictEqual((await saldos(db, mat)).em_terceiros, 0);
  });

  await test('retorno sem a acao remessar_terceiro falha com 403', async () => {
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await assert.rejects(
      () => svc.registrarRetorno(db, PRODUCAO, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 10 }] }),
      (e) => { assert.strictEqual(e.status, 403); return true; });
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 100);
  });

  await test('retorno com material DIFERENTE do enviado e recusado, apontando a Etapa 8c', async () => {
    // Decisao 7: a 8b nao faz transformacao. A tabela ja suporta (material_id proprio no
    // resultado), mas aceitar material diferente AGORA seria entregar meia transformacao — sem
    // baixa da chapa original, sem sobra, sem rastreabilidade fechada.
    const { remessa, itemId } = await remessaEnviada(db, 100);
    const outro = await novoMaterial(db);
    await assert.rejects(
      () => svc.registrarRetorno(db, ADMIN, remessa.id, {
        itens: [{ item_remessa_id: itemId, quantidade: 10, material_id: outro }] }),
      /8c|transforma/i);
  });

  await test('[CONTROLE POSITIVO] retorno que REPETE o material_id do item enviado e aceito', async () => {
    // A metade que falta: recusar todo retorno que informa material_id passaria no teste acima, e
    // a tela — que manda o material da linha — nunca conseguiria registrar retorno nenhum.
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade: 10, material_id: materialId }] });
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 90);
  });

  await test('o retorno grava o vinculo item enviado -> resultado, com o movimento do livro', async () => {
    // E o que a Etapa 8c vai consumir.
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, {
      nota_fiscal: 'NF-RET-9', itens: [{ item_remessa_id: itemId, quantidade: 25 }] });
    const linha = await dbGet(db,
      'SELECT * FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ?', [itemId]);
    assert.strictEqual(linha.remessa_id, remessa.id);
    assert.strictEqual(linha.material_id, materialId);
    assert.strictEqual(linha.quantidade, 25);
    assert.strictEqual(linha.nota_fiscal, 'NF-RET-9');
    assert.ok(linha.movimentacao_id, 'o resultado nao aponta para a movimentacao que o creditou');
    // O vinculo tem de apontar para a movimentacao CERTA, e nao para um id qualquer: sem isto,
    // gravar `1` fixo passaria.
    const mov = await dbGet(db, 'SELECT tipo, material_id, quantidade FROM movimentacoes_almoxarifado WHERE id = ?',
      [linha.movimentacao_id]);
    assert.strictEqual(mov.tipo, 'RETORNO_TERCEIRO');
    assert.strictEqual(mov.material_id, materialId);
    assert.strictEqual(mov.quantidade, 25);
  });

  await test('retorno com um item invalido nao aplica NENHUM item do lote', async () => {
    // Mesma pre-checagem do envio: um recebimento de retorno com dois itens, um deles acima do
    // pendente, nao pode devolver metade.
    const mat1 = await novoMaterial(db, { atual: 100 });
    const mat2 = await novoMaterial(db, { atual: 100 });
    const rem = await remessaCom(db, [{ material_id: mat1, quantidade: 100 }, { material_id: mat2, quantidade: 100 }]);
    await svc.enviarRemessa(db, ADMIN, rem.id);
    const itens = await dbAll(db,
      'SELECT id, material_id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ? ORDER BY id', [rem.id]);
    await assert.rejects(() => svc.registrarRetorno(db, ADMIN, rem.id, { itens: [
      { item_remessa_id: itens[0].id, quantidade: 10 },
      { item_remessa_id: itens[1].id, quantidade: 999 },
    ] }), /999|acima/i);
    assert.strictEqual((await saldos(db, mat1)).em_terceiros, 100, 'o item bom foi creditado numa recusa');
    assert.strictEqual((await saldos(db, mat2)).em_terceiros, 100);
    assert.strictEqual(await statusDa(db, rem.id), 'ENVIADA', 'o status avancou com o recebimento recusado');
  });

  await test('falha DENTRO do motor no retorno devolve o claim do item', async () => {
    // Sem transacao: se o motor falhar depois do claim, `quantidade_retornada` ficaria maior que o
    // que voltou de verdade — o pendente encolheria sem o saldo ter sido liberado, e o operador
    // nunca mais conseguiria registrar aquele retorno.
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    const original = stockService.registrarMovimentacao;
    stockService.registrarMovimentacao = async () => {
      throw Object.assign(new Error('falha simulada do motor'), { status: 400 });
    };
    try {
      await assert.rejects(
        () => svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 40 }] }),
        /falha simulada do motor/);
    } finally {
      stockService.registrarMovimentacao = original;
    }
    const item = await dbGet(db,
      'SELECT quantidade_retornada FROM itens_remessa_terceiro_almoxarifado WHERE id = ?', [itemId]);
    assert.strictEqual(item.quantidade_retornada, 0, 'o item ficou com retorno reclamado sem saldo liberado');
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 100);
    // E a prova de que "reclamavel de novo" nao e so uma coluna zerada: registrar de verdade funciona.
    const r = await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 40 }] });
    assert.strictEqual(r.pendente_total, 60);
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 60);
  });

  // ══ Task 7 — encerrar com destino obrigatorio, e cancelar com estorno ═══════════════════════

  await test('encerrar remessa com pendencia sem destino falha, nomeando a quantidade pendente', async () => {
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 70 }] });
    await assert.rejects(
      () => svc.encerrarRemessa(db, ADMIN, remessa.id, {}),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.match(e.message, /30/, 'a mensagem nao nomeia a quantidade pendente');
        assert.match(e.message, /PERDA_NO_TERCEIRO/);
        assert.match(e.message, /CONSUMIDO_NO_PROCESSO/);
        return true;
      });
    assert.strictEqual(await statusDa(db, remessa.id), 'RETORNO_PARCIAL');
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 30, 'a retencao foi zerada sem destino');
  });

  await test('encerrar com destino mas SEM justificativa falha', async () => {
    const { remessa, itemId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 70 }] });
    await assert.rejects(
      () => svc.encerrarRemessa(db, ADMIN, remessa.id, { destino: 'PERDA_NO_TERCEIRO' }),
      /justificativa/i);
    assert.strictEqual(await statusDa(db, remessa.id), 'RETORNO_PARCIAL');
  });

  await test('encerrar com destino invalido falha listando os validos', async () => {
    const { remessa, itemId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 70 }] });
    await assert.rejects(
      () => svc.encerrarRemessa(db, ADMIN, remessa.id, { destino: 'SUMIU', justificativa: 'x' }),
      /PERDA_NO_TERCEIRO/);
  });

  await test('encerrar com perda no terceiro zera o em_terceiros e baixa o fisico', async () => {
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 70 }] });
    const r = await svc.encerrarRemessa(db, ADMIN, remessa.id, {
      destino: 'PERDA_NO_TERCEIRO', justificativa: 'chapa danificada no banho de zinco' });
    assert.strictEqual(r.status, 'ENCERRADA');
    assert.strictEqual(r.baixado, 30);
    const s = await saldos(db, materialId);
    assert.strictEqual(s.em_terceiros, 0, 'sobrou retencao presa numa remessa encerrada — o saldo orfao');
    assert.strictEqual(s.quantidade_atual, 70, 'o fisico nao baixou: o sistema ainda acha que a chapa existe');
    // O tipo do livro tambem e verificado AQUI, e nao so no teste do consumo: sem esta assercao,
    // trocar PERDA_NO_TERCEIRO por 'CONSUMO_TERCEIRO' no mapa passava em toda a suite (o teste do
    // consumo olha o movimento DE OUTRO material). Par bilateral do S3 do plano, que so tinha metade.
    const mov = await dbGet(db,
      "SELECT tipo, quantidade FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo IN ('PERDA_TERCEIRO','CONSUMO_TERCEIRO')",
      [materialId]);
    assert.strictEqual(mov.tipo, 'PERDA_TERCEIRO');
    assert.strictEqual(mov.quantidade, 30);
    // O cabecalho tem de guardar o destino e o motivo: sem isso a auditoria do encerramento vira
    // "alguem fechou e o saldo sumiu", que e metade do problema que a decisao 4 existe para evitar.
    const cab = await dbGet(db,
      'SELECT encerramento_destino, encerramento_justificativa FROM remessas_terceiro_almoxarifado WHERE id = ?',
      [remessa.id]);
    assert.strictEqual(cab.encerramento_destino, 'PERDA_NO_TERCEIRO');
    assert.match(cab.encerramento_justificativa, /banho de zinco/);
  });

  await test('encerrar com consumo no processo usa o tipo CONSUMO_TERCEIRO no livro', async () => {
    // Perda e consumo baixam igual, mas sao fatos DIFERENTES: um e o terceiro estragando material
    // nosso, o outro e o processo comendo material de proposito. O livro tem de distinguir.
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 90 }] });
    await svc.encerrarRemessa(db, ADMIN, remessa.id, {
      destino: 'CONSUMIDO_NO_PROCESSO', justificativa: 'sobra de corte virou cavaco' });
    const mov = await dbGet(db,
      "SELECT tipo, quantidade FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo LIKE '%TERCEIRO' AND tipo NOT IN ('REMESSA_TERCEIRO','RETORNO_TERCEIRO')",
      [materialId]);
    assert.strictEqual(mov.tipo, 'CONSUMO_TERCEIRO');
    assert.strictEqual(mov.quantidade, 10);
  });

  await test('encerrar com VARIOS itens pendentes baixa TODOS, e a mensagem soma o pendente real', async () => {
    // O teste que o plano nao tinha: todas as suas remessas de encerramento tem UM item so, entao
    // um laco que baixasse apenas o primeiro (ou um `pendentes[0]` no lugar do total) passava na
    // suite inteira — e deixaria retencao presa no segundo material, o saldo orfao pela metade.
    // A mensagem tambem e conferida com dois itens: regra herdada da Task 6 — quando a checagem
    // agrega por recurso escasso, a mensagem tem de dizer o valor AGREGADO (75), nao so as partes.
    const m1 = await novoMaterial(db, { atual: 100 });
    const m2 = await novoMaterial(db, { atual: 100 });
    const rem = await remessaCom(db, [{ material_id: m1, quantidade: 50 }, { material_id: m2, quantidade: 45 }]);
    await svc.enviarRemessa(db, ADMIN, rem.id);
    const itens = await dbAll(db,
      'SELECT id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ? ORDER BY id', [rem.id]);
    await svc.registrarRetorno(db, ADMIN, rem.id, { itens: [{ item_remessa_id: itens[0].id, quantidade: 20 }] });
    const cods = await dbAll(db, 'SELECT codigo FROM materiais_almoxarifado WHERE id IN (?,?) ORDER BY id', [m1, m2]);

    await assert.rejects(() => svc.encerrarRemessa(db, ADMIN, rem.id, {}), (e) => {
      assert.match(e.message, /75 UN/, 'a mensagem nao diz o pendente TOTAL da remessa');
      assert.ok(e.message.includes(`${cods[0].codigo}: 30`), 'a mensagem nao abre o pendente do item 1');
      assert.ok(e.message.includes(`${cods[1].codigo}: 45`), 'a mensagem nao abre o pendente do item 2');
      return true;
    });

    const r = await svc.encerrarRemessa(db, ADMIN, rem.id, {
      destino: 'CONSUMIDO_NO_PROCESSO', justificativa: 'os dois viraram cavaco no corte' });
    assert.strictEqual(r.baixado, 75, 'o encerramento nao baixou a soma dos itens pendentes');
    for (const [id, atual] of [[m1, 70], [m2, 55]]) {
      const s = await saldos(db, id);
      assert.strictEqual(s.em_terceiros, 0, `sobrou retencao presa no material ${id} — a baixa parou no primeiro item`);
      assert.strictEqual(s.quantidade_atual, atual, `o fisico do material ${id} nao baixou`);
    }
    const movs = await dbAll(db,
      "SELECT id FROM movimentacoes_almoxarifado WHERE tipo = 'CONSUMO_TERCEIRO' AND material_id IN (?,?)", [m1, m2]);
    assert.strictEqual(movs.length, 2, 'o livro registrou a baixa de um item so');
  });

  await test('[CONTROLE POSITIVO] encerrar SEM pendencia nao exige destino nem justificativa', async () => {
    // A metade que falta: exigir destino sempre passaria em todos os testes de recusa acima e
    // obrigaria o operador a inventar uma perda em toda remessa que voltou inteira.
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 100 }] });
    // ja encerrou sozinha no retorno total; a chamada explicita e recusada pela maquina, nao pela
    // exigencia de destino
    await assert.rejects(() => svc.encerrarRemessa(db, ADMIN, remessa.id, {}), /ENCERRADA/);
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 0);
    // ARMADILHA HERDADA DA TASK 6, e NAO e um buraco: remessa que fecha SOZINHA no retorno total
    // chega em ENCERRADA com encerramento_destino NULL, porque nao havia pendencia a destinar.
    // Um teste que exigisse destino em TODA remessa encerrada estaria errado — nao "conserte" isto.
    const cab = await dbGet(db,
      'SELECT status, encerramento_destino FROM remessas_terceiro_almoxarifado WHERE id = ?', [remessa.id]);
    assert.strictEqual(cab.status, 'ENCERRADA');
    assert.strictEqual(cab.encerramento_destino, null);
  });

  await test('[CONTROLE POSITIVO] encerrar com pendencia ZERO passa sem destino e nao baixa nada', async () => {
    // A prova DIRETA de que a exigencia e CONDICIONAL — o par bilateral que o proprio plano admitia
    // nao ter (a linha S2 da tabela de sabotagens diz que "exigir destino sempre" nao falha em
    // nenhum teste sozinha). Como o retorno total ja encerra a remessa por conta propria, o unico
    // jeito de chamar encerrarRemessa com pendencia zero e forcar o status de volta — mesma tecnica
    // que o teste de idempotencia do envio, neste arquivo, ja usa.
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 100 }] });
    await dbRun(db, `UPDATE remessas_terceiro_almoxarifado
      SET status = 'RETORNO_PARCIAL', encerrado_em = NULL WHERE id = ?`, [remessa.id]);
    const r = await svc.encerrarRemessa(db, ADMIN, remessa.id, {});
    assert.strictEqual(r.status, 'ENCERRADA');
    assert.strictEqual(r.baixado, 0);
    assert.strictEqual(r.destino, null);
    const s = await saldos(db, materialId);
    assert.strictEqual(s.quantidade_atual, 100, 'encerrar sem pendencia baixou material que voltou inteiro');
    assert.strictEqual(s.em_terceiros, 0);
    const baixas = await dbAll(db,
      "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo IN ('PERDA_TERCEIRO','CONSUMO_TERCEIRO')",
      [materialId]);
    assert.strictEqual(baixas.length, 0, 'encerrar sem pendencia emitiu baixa de material que nao se perdeu');
    const cab = await dbGet(db,
      'SELECT encerramento_destino, encerramento_justificativa FROM remessas_terceiro_almoxarifado WHERE id = ?',
      [remessa.id]);
    assert.strictEqual(cab.encerramento_destino, null, 'gravou destino num encerramento sem pendencia');
    assert.strictEqual(cab.encerramento_justificativa, null);
  });

  await test('[CONTROLE POSITIVO] encerrar direto de ENVIADA, com tudo pendente, funciona', async () => {
    const { remessa, materialId } = await remessaEnviada(db, 100);
    const r = await svc.encerrarRemessa(db, ADMIN, remessa.id, {
      destino: 'PERDA_NO_TERCEIRO', justificativa: 'o galvanizador perdeu a carga inteira' });
    assert.strictEqual(r.baixado, 100);
    const s = await saldos(db, materialId);
    assert.strictEqual(s.quantidade_atual, 0);
    assert.strictEqual(s.em_terceiros, 0);
  });

  await test('encerrar remessa ABERTA e recusado pela maquina de estados', async () => {
    // Sem a maquina de estados isto fecharia EM SILENCIO: nenhum item tem `enviado_em`, entao o
    // pendente e zero e o encerramento nao encontraria nada para exigir destino.
    const mat = await novoMaterial(db);
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 30 }]);
    await assert.rejects(() => svc.encerrarRemessa(db, ADMIN, rem.id, {}), /ABERTA/);
    assert.strictEqual(await statusDa(db, rem.id), 'ABERTA');
  });

  await test('encerrar sem a acao remessar_terceiro falha com 403', async () => {
    const { remessa, materialId } = await remessaEnviada(db, 100);
    await assert.rejects(
      () => svc.encerrarRemessa(db, PRODUCAO, remessa.id, { destino: 'PERDA_NO_TERCEIRO', justificativa: 'x' }),
      (e) => { assert.strictEqual(e.status, 403); return true; });
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 100);
  });

  // ── Cancelamento ─────────────────────────────────────────────────────────────────────────────
  await test('cancelar remessa ABERTA nao mexe em saldo nenhum', async () => {
    const mat = await novoMaterial(db);
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 30 }]);
    const r = await svc.cancelarRemessa(db, ADMIN, rem.id, { motivo: 'pedido cancelado pelo cliente' });
    assert.strictEqual(r.status, 'CANCELADA');
    assert.strictEqual(r.estornado, 0);
    const s = await saldos(db, mat);
    assert.strictEqual(s.quantidade_atual, 100);
    assert.strictEqual(s.em_terceiros, 0);
  });

  await test('cancelar remessa enviada restaura o disponivel', async () => {
    const { remessa, materialId } = await remessaEnviada(db, 100);
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 100);
    const r = await svc.cancelarRemessa(db, ADMIN, remessa.id, { motivo: 'o terceiro devolveu sem fazer nada' });
    assert.strictEqual(r.estornado, 100);
    const s = await saldos(db, materialId);
    assert.strictEqual(s.em_terceiros, 0, 'a retencao ficou presa numa remessa cancelada');
    assert.strictEqual(s.quantidade_atual, 100, 'o cancelamento creditou estoque que nunca saiu');
    const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [materialId]);
    assert.strictEqual(await stockService.getSaldoDisponivel(m), 100);
    // O estorno e um RETORNO_TERCEIRO no livro (o material VOLTA), nunca uma baixa — e o motivo
    // fica no cabecalho, senao o cancelamento vira saldo mudando sem explicacao.
    const mov = await dbGet(db,
      'SELECT tipo, quantidade FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id DESC', [materialId]);
    assert.strictEqual(mov.tipo, 'RETORNO_TERCEIRO');
    assert.strictEqual(mov.quantidade, 100);
    const cab = await dbGet(db,
      'SELECT cancelamento_motivo FROM remessas_terceiro_almoxarifado WHERE id = ?', [remessa.id]);
    assert.match(cab.cancelamento_motivo, /sem fazer nada/);
  });

  await test('cancelar remessa com retorno parcial estorna SO o que ainda esta la fora', async () => {
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 60 }] });
    const r = await svc.cancelarRemessa(db, ADMIN, remessa.id, { motivo: 'contrato rescindido' });
    assert.strictEqual(r.estornado, 40, 'o cancelamento estornou o que ja tinha voltado — retencao negativa');
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 0);
    assert.strictEqual((await saldos(db, materialId)).quantidade_atual, 100,
      'o cancelamento mexeu no patrimonio: o material nunca deixou de ser nosso');
  });

  await test('cancelar sem a acao remessar_terceiro falha com 403', async () => {
    const { remessa, materialId } = await remessaEnviada(db, 100);
    await assert.rejects(
      () => svc.cancelarRemessa(db, PRODUCAO, remessa.id, { motivo: 'nao pode' }),
      (e) => { assert.strictEqual(e.status, 403); return true; });
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 100);
    assert.strictEqual(await statusDa(db, remessa.id), 'ENVIADA');
  });

  await test('cancelar sem motivo falha, e cancelar remessa ja finalizada falha', async () => {
    const { remessa } = await remessaEnviada(db, 100);
    await assert.rejects(() => svc.cancelarRemessa(db, ADMIN, remessa.id, {}), /motivo/i);
    await svc.cancelarRemessa(db, ADMIN, remessa.id, { motivo: 'ok' });
    await assert.rejects(() => svc.cancelarRemessa(db, ADMIN, remessa.id, { motivo: 'de novo' }), /CANCELADA/);
    // A outra ponta final: remessa ENCERRADA tambem nao cancela — cancelar depois do encerramento
    // com destino ressuscitaria a retencao ja baixada, saldo do nada.
    const outra = await remessaEnviada(db, 50);
    await svc.encerrarRemessa(db, ADMIN, outra.remessa.id, {
      destino: 'PERDA_NO_TERCEIRO', justificativa: 'sumiu no terceiro' });
    await assert.rejects(
      () => svc.cancelarRemessa(db, ADMIN, outra.remessa.id, { motivo: 'tarde demais' }), /ENCERRADA/);
    assert.strictEqual((await saldos(db, outra.materialId)).quantidade_atual, 0);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
