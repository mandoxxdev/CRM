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

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
