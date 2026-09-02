/**
 * Etapa 8b, Task 1 — a quarta coluna de retencao e a conta do disponivel numa fonte so.
 *
 * O design nomeou a armadilha (a subtracao esta replicada em SQL) mas a primeira versao contou
 * SETE sitios; a varredura completa achou QUATORZE, em 8 arquivos. Acrescentar a coluna so em
 * `getSaldoDisponivel` faria o sistema RECUSAR pela funcao e ACEITAR pelo SQL: a listagem
 * mostraria disponivel a mais, a reserva nasceria sobre material que esta no galvanizador e a
 * guarda atomica da saida deixaria passar. Nada quebra — o numero fica errado, que e a falha mais
 * cara de achar.
 *
 * Por isso este arquivo testa CADA CAMINHO separadamente, e nao so a funcao. Sao 13 caminhos
 * exercitados por chamada real (funcao, listagem, reserva, saida normal, saida CONSUMINDO
 * reserva, estorno de entrada, pos-aprovacao, extrato, relatorio, itens da requisicao x2, rota
 * de detalhe do almoxarifado, rota do solicitante) mais a posicao por cliente, e cada um tem
 * CONTROLE POSITIVO BILATERAL: com em_terceiros > 0 o disponivel cai, com em_terceiros = 0 ele
 * continua inteiro. So a metade de recusa aprovaria uma conta que barra tudo.
 *
 * E por isso o ultimo par de testes e uma VARREDURA do proprio codigo-fonte: verificar "editei
 * os 14" depende de eu ter contado certo; verificar "sobrou zero" nao depende.
 *
 * Executar: cd server && node tests/api/saldoEmTerceiros.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const requisitionStateMachine = require('../../services/almoxarifado/requisitionStateMachine');
const reportService = require('../../services/almoxarifado/reportService');
const clienteEstoqueService = require('../../services/almoxarifado/clienteEstoqueService');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const JUST = { justificativa: 'teste de saldo em terceiros' };

let seq = 0;
/** Material com 100 no fisico e `emTerceiros` retido — disponivel esperado = 100 - emTerceiros. */
async function novoMaterial(db, emTerceiros = 0, proprietarioClienteId = null) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_em_terceiros, ativo, proprietario_cliente_id)
     VALUES (?,?,'UN',100,?,1,?)`,
    [`TERC-${seq}`, `Material terceiro ${seq}`, emTerceiros, proprietarioClienteId]);
  return r.lastID;
}

/** Retencao aplicada DEPOIS de outro efeito (reserva/entrada) — o motor da remessa so chega na Task 4. */
async function retemEmTerceiros(db, materialId, quantidade) {
  await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_terceiros = ? WHERE id = ?',
    [quantidade, materialId]);
}

/** @returns {{requisicaoId:number, itemId:number}} */
async function requisicaoCom(db, materialId, quantidade) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
    (numero, solicitante_id, solicitante_nome, status) VALUES (?, 1, 'Solicitante', 'PENDENTE')`,
  [`REQ-TERC-${seq}`]);
  const it = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
    (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,?)`, [r.lastID, materialId, quantidade]);
  return { requisicaoId: r.lastID, itemId: it.lastID };
}

const lerMaterial = (db, id) => dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  // `projetos` e `ordens_servico` sao tabelas CORE (criadas por server/index.js no boot), fora do
  // initSchema do almoxarifado — o harness nao as monta e clienteEstoqueService faz LEFT JOIN
  // nelas. Stub no teste, nunca fallback na query: fallback esconderia em teste um erro que
  // existiria em producao. Mesmo precedente de materialClientePosicao.api.test.js.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS projetos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)`);
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT, cliente_id INTEGER,
    projeto_id INTEGER, status TEXT)`);

  // ── Caminho 1: a funcao (stockService.getSaldoDisponivel) ────────────────────────────────────
  await test('[funcao] getSaldoDisponivel desconta quantidade_em_terceiros', async () => {
    const id = await novoMaterial(db, 30);
    assert.strictEqual(await stockService.getSaldoDisponivel(await lerMaterial(db, id)), 70);
  });

  await test('[funcao][CONTROLE POSITIVO] sem nada em terceiros o disponivel fica inteiro', async () => {
    const id = await novoMaterial(db, 0);
    assert.strictEqual(await stockService.getSaldoDisponivel(await lerMaterial(db, id)), 100);
  });

  // ── Caminho 2: a listagem de estoque (stockService.consultarEstoque) ─────────────────────────
  await test('[listagem] consultarEstoque devolve quantidade_disponivel descontado', async () => {
    const id = await novoMaterial(db, 30);
    const [row] = await stockService.consultarEstoque(db, { material_id: id });
    assert.strictEqual(row.quantidade_disponivel, 70,
      'a listagem de estoque nao desconta em_terceiros — a tela mostraria disponivel a mais');
    assert.strictEqual(row.quantidade_atual, 100, 'o patrimonio nao pode encolher: o material continua sendo nosso');
  });

  await test('[listagem][CONTROLE POSITIVO] sem nada em terceiros a listagem mostra o disponivel inteiro', async () => {
    const id = await novoMaterial(db, 0);
    const [row] = await stockService.consultarEstoque(db, { material_id: id });
    assert.strictEqual(row.quantidade_disponivel, 100);
  });

  // ── Caminho 3: a guarda do hold da reserva (stockService.criarReserva) ───────────────────────
  await test('[reserva] criar reserva acima do disponivel restante e recusada', async () => {
    const id = await novoMaterial(db, 30);
    await assert.rejects(
      () => stockService.criarReserva(db, ADMIN, { material_id: id, quantidade: 80 }),
      /dispon/i,
      'a reserva nasceu sobre material que esta no galvanizador');
    const m = await lerMaterial(db, id);
    assert.strictEqual(m.quantidade_reservada || 0, 0, 'o hold ficou aplicado mesmo com a reserva recusada');
  });

  await test('[reserva][CONTROLE POSITIVO] reserva DENTRO do disponivel restante e aceita', async () => {
    const id = await novoMaterial(db, 30);
    const r = await stockService.criarReserva(db, ADMIN, { material_id: id, quantidade: 70 });
    assert.ok(r, 'a guarda barrou tudo — implementacao que recusa sempre passaria no teste de recusa acima');
    const m = await lerMaterial(db, id);
    assert.strictEqual(m.quantidade_reservada, 70);
  });

  // ── Caminho 4: a guarda atomica da saida normal (stockService ~925) ──────────────────────────
  // ATENCAO, e o plano da Task 1 errou aqui: este teste NAO prova o claim atomico. A pre-checagem
  // em JS (getSaldoDisponivel, ~linha 694) recusa a saida ANTES de o UPDATE condicional rodar,
  // entao devolver o SQL literal antigo so neste claim mantem o teste VERDE (medido: 30 passou,
  // 1 falhou — so a varredura acusou). O claim so age sob concorrencia, que um teste sequencial
  // nao alcanca. Para ESTE sitio a varredura do codigo-fonte e a unica guarda real — motivo a
  // mais para ela existir. Os outros dois claims TEM prova comportamental: o de consumo de
  // reserva (pula a pre-checagem) e o do estorno (nao tem pre-checagem).
  await test('[saida] saida acima do disponivel restante e recusada, e nada sai do fisico', async () => {
    const id = await novoMaterial(db, 30);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: id, tipo: 'SAIDA', quantidade: 80, ...JUST });
    assert.strictEqual(res.status, 400, `esperava 400, veio ${res.status}: ${JSON.stringify(res.body)}`);
    const m = await lerMaterial(db, id);
    assert.strictEqual(m.quantidade_atual, 100, 'saiu estoque de material que esta no terceiro');
  });

  await test('[saida][CONTROLE POSITIVO] saida DENTRO do disponivel restante passa', async () => {
    const id = await novoMaterial(db, 30);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: id, tipo: 'SAIDA', quantidade: 70, ...JUST });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const m = await lerMaterial(db, id);
    assert.strictEqual(m.quantidade_atual, 30);
  });

  // ── Caminho 5: o claim atomico da saida CONSUMINDO RESERVA (stockService ~892) ───────────────
  // Ramo SEPARADO do de cima: `consumindoReserva` PULA a pre-checagem de disponivel (linha 680) e
  // soma de volta a parte reservada que esta sendo consumida (`+ ?`). E o unico sitio onde a
  // conta aparece somada — se o `+ ?` tivesse ficado DENTRO da expressao centralizada, a ordem
  // dos placeholders mudaria em silencio e a guarda passaria a comparar numeros trocados.
  await test('[saida-reserva] consumo de reserva acima do que sobrou no predio e recusado, e a reserva e compensada', async () => {
    const id = await novoMaterial(db, 0);
    const reserva = await stockService.criarReserva(db, ADMIN, { material_id: id, quantidade: 100 });
    await retemEmTerceiros(db, id, 30); // 30 foram para o galvanizador DEPOIS da reserva
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: id, tipo: 'SAIDA', quantidade: 100, reserva_id: reserva.id, ...JUST });
    assert.strictEqual(res.status, 400, `esperava 400, veio ${res.status}: ${JSON.stringify(res.body)}`);
    const m = await lerMaterial(db, id);
    assert.strictEqual(m.quantidade_atual, 100, 'saiu do fisico material que esta a 40 km');
    const r = await dbGet(db, 'SELECT quantidade_utilizada, status FROM reservas_material_almoxarifado WHERE id = ?', [reserva.id]);
    assert.strictEqual(r.quantidade_utilizada || 0, 0,
      'a reserva ficou marcada como consumida sem a baixa correspondente (compensacao nao rodou)');
  });

  await test('[saida-reserva][CONTROLE POSITIVO] consumo integral da reserva com nada em terceiros passa', async () => {
    const id = await novoMaterial(db, 0);
    const reserva = await stockService.criarReserva(db, ADMIN, { material_id: id, quantidade: 100 });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: id, tipo: 'SAIDA', quantidade: 100, reserva_id: reserva.id, ...JUST });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const m = await lerMaterial(db, id);
    assert.strictEqual(m.quantidade_atual, 0);
  });

  // ── Caminho 6: o estorno de entrada (stockService.cancelarMovimentacao ~1351) ────────────────
  await test('[estorno] cancelar entrada e recusado quando o saldo que voltaria esta no terceiro', async () => {
    const id = await novoMaterial(db, 0);
    const ent = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: id, tipo: 'ENTRADA', quantidade: 50, ...JUST });
    assert.strictEqual(ent.status, 201, JSON.stringify(ent.body));
    await retemEmTerceiros(db, id, 130); // 130 dos 150 foram beneficiar fora
    const res = await request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`)
      .send({ motivo: 'estorno de teste' });
    assert.strictEqual(res.status, 400, `esperava 400, veio ${res.status}: ${JSON.stringify(res.body)}`);
    const m = await lerMaterial(db, id);
    assert.strictEqual(m.quantidade_atual, 150, 'o estorno tirou do fisico material que esta no terceiro');
  });

  await test('[estorno][CONTROLE POSITIVO] cancelar entrada com nada em terceiros reverte normalmente', async () => {
    const id = await novoMaterial(db, 0);
    const ent = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: id, tipo: 'ENTRADA', quantidade: 50, ...JUST });
    assert.strictEqual(ent.status, 201, JSON.stringify(ent.body));
    const res = await request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`)
      .send({ motivo: 'estorno de teste' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const m = await lerMaterial(db, id);
    assert.strictEqual(m.quantidade_atual, 100);
  });

  // ── Caminho 7: o status pos-aprovacao da requisicao (requisitionStateMachine ~97) ────────────
  await test('[pos-aprovacao] item cujo saldo esta TODO no terceiro nao deixa a requisicao em APROVADO', async () => {
    const id = await novoMaterial(db, 100);
    const { requisicaoId } = await requisicaoCom(db, id, 5);
    const status = await requisitionStateMachine.calcularStatusPosAprovacao(db, requisicaoId);
    assert.notStrictEqual(status, 'APROVADO', 'a requisicao foi aprovada contra saldo que esta a 40 km');
    assert.ok(['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'].includes(status), `status inesperado: ${status}`);
  });

  await test('[pos-aprovacao][CONTROLE POSITIVO] com sobra no predio continua APROVADO', async () => {
    const id = await novoMaterial(db, 99);
    const { requisicaoId } = await requisicaoCom(db, id, 5);
    assert.strictEqual(await requisitionStateMachine.calcularStatusPosAprovacao(db, requisicaoId), 'APROVADO',
      'a conta passou a recusar tudo — 1 unidade no predio ainda e saldo disponivel');
  });

  // ── Caminho 8: o extrato do material (routes/almoxarifado/extended.js ~455) ──────────────────
  await test('[extrato] GET /materiais/:id/extrato desconta em_terceiros', async () => {
    const id = await novoMaterial(db, 30);
    const res = await request(app).get(`/api/almoxarifado/materiais/${id}/extrato`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.material.quantidade_disponivel, 70);
    assert.strictEqual(res.body.material.quantidade_atual, 100);
  });

  await test('[extrato][CONTROLE POSITIVO] sem nada em terceiros o extrato mostra o disponivel inteiro', async () => {
    const id = await novoMaterial(db, 0);
    const res = await request(app).get(`/api/almoxarifado/materiais/${id}/extrato`);
    assert.strictEqual(res.body.material.quantidade_disponivel, 100);
  });

  // ── Caminho 9: o relatorio de posicao de estoque (reportService ~8) ──────────────────────────
  await test('[relatorio] relatorioEstoqueAtual desconta em_terceiros', async () => {
    const id = await novoMaterial(db, 30);
    const linha = (await reportService.relatorioEstoqueAtual(db)).find((l) => l.id === id);
    assert.ok(linha, 'material sumiu do relatorio');
    assert.strictEqual(linha.disponivel, 70);
  });

  await test('[relatorio][CONTROLE POSITIVO] sem nada em terceiros o relatorio traz o disponivel inteiro', async () => {
    const id = await novoMaterial(db, 0);
    const linha = (await reportService.relatorioEstoqueAtual(db)).find((l) => l.id === id);
    assert.strictEqual(linha.disponivel, 100);
  });

  // ── Caminho 10: carregarItensRequisicao (requisitionService ~101) ────────────────────────────
  await test('[requisicao] carregarItensRequisicao traz saldo_disponivel descontado', async () => {
    const id = await novoMaterial(db, 30);
    const { requisicaoId } = await requisicaoCom(db, id, 5);
    const [item] = await requisitionService.carregarItensRequisicao(db, requisicaoId);
    assert.strictEqual(item.saldo_disponivel, 70);
  });

  await test('[requisicao][CONTROLE POSITIVO] sem nada em terceiros o saldo_disponivel fica inteiro', async () => {
    const id = await novoMaterial(db, 0);
    const { requisicaoId } = await requisicaoCom(db, id, 5);
    const [item] = await requisitionService.carregarItensRequisicao(db, requisicaoId);
    assert.strictEqual(item.saldo_disponivel, 100);
  });

  // ── Caminho 11: saldoDisponivelParaItem (requisitionService ~115) ────────────────────────────
  // Leitura FRESCA de separar/entregar, imediatamente antes de agir — sitio distinto do de cima e
  // com query propria. Esquece-lo deixaria a entrega passar contra material que esta no terceiro.
  await test('[separar/entregar] saldoDisponivelParaItem desconta em_terceiros', async () => {
    const id = await novoMaterial(db, 30);
    const { itemId } = await requisicaoCom(db, id, 5);
    const r = await requisitionService.saldoDisponivelParaItem(db, { id: itemId, material_id: id });
    assert.strictEqual(r.disponivel, 70);
  });

  await test('[separar/entregar][CONTROLE POSITIVO] sem nada em terceiros o disponivel do item fica inteiro', async () => {
    const id = await novoMaterial(db, 0);
    const { itemId } = await requisicaoCom(db, id, 5);
    const r = await requisitionService.saldoDisponivelParaItem(db, { id: itemId, material_id: id });
    assert.strictEqual(r.disponivel, 100);
  });

  // ── Caminho 12: a rota de detalhe da requisicao (routes/almoxarifado.js ~1891) ───────────────
  await test('[rota requisicao] o detalhe do almoxarifado traz saldo_atual descontado', async () => {
    const id = await novoMaterial(db, 30);
    const { requisicaoId } = await requisicaoCom(db, id, 5);
    const res = await request(app).get(`/api/almoxarifado/requisicoes/${requisicaoId}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.itens[0].saldo_atual, 70);
  });

  await test('[rota requisicao][CONTROLE POSITIVO] sem nada em terceiros o saldo_atual fica inteiro', async () => {
    const id = await novoMaterial(db, 0);
    const { requisicaoId } = await requisicaoCom(db, id, 5);
    const res = await request(app).get(`/api/almoxarifado/requisicoes/${requisicaoId}`);
    assert.strictEqual(res.body.itens[0].saldo_atual, 100);
  });

  // ── Caminho 13: a rota do SOLICITANTE (routes/requisicoesMaterial.js ~260) ───────────────────
  // NAO pertence ao modulo almoxarifado — escapou das duas varreduras anteriores desta sequencia
  // de etapas. Aqui o saldo_atual e APAGADO da resposta por sanitizeRequisicaoItemForSector (o
  // solicitante nao ve quantidade exata), entao o que se observa e a `disponibilidade` derivada
  // dele. Testar pelo campo numerico daria falso negativo: ele nunca chega ao corpo.
  await test('[rota solicitante] material todo no terceiro aparece como SEM ESTOQUE para o solicitante', async () => {
    const id = await novoMaterial(db, 100);
    const { requisicaoId } = await requisicaoCom(db, id, 5);
    const res = await request(app).get(`/api/requisicoes-material/${requisicaoId}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.itens[0].disponibilidade, 'sem_estoque',
      'o solicitante ve como disponivel material que esta no galvanizador');
    assert.strictEqual(res.body.itens[0].saldo_suficiente, false);
  });

  await test('[rota solicitante][CONTROLE POSITIVO] sem nada em terceiros continua EM ESTOQUE', async () => {
    const id = await novoMaterial(db, 0);
    const { requisicaoId } = await requisicaoCom(db, id, 5);
    const res = await request(app).get(`/api/requisicoes-material/${requisicaoId}`);
    assert.strictEqual(res.body.itens[0].disponibilidade, 'em_estoque',
      'a conta passou a zerar tudo — 100 unidades no predio sao estoque');
    assert.strictEqual(res.body.itens[0].saldo_suficiente, true);
  });

  // ── Caminho 14: a posicao por cliente (clienteEstoqueService ~49) ────────────────────────────
  // Criada na PROPRIA Etapa 8 — a mais facil de esquecer, e a que faria a posicao por cliente
  // mostrar disponivel a mais logo depois de a Etapa 8 inteira ter sido sobre esse numero.
  await test('[posicao por cliente] saldo_disponivel do cliente desconta, e o patrimonio dele NAO encolhe', async () => {
    const cli = await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente Terceiro LTDA')");
    const id = await novoMaterial(db, 30, cli.lastID);
    const pos = await clienteEstoqueService.posicaoPorCliente(db, { cliente_id: cli.lastID });
    const item = pos.itens.find((i) => i.material_id === id);
    assert.ok(item, 'material do cliente sumiu da posicao');
    assert.strictEqual(item.saldo_disponivel, 70);
    assert.strictEqual(item.saldo, 100,
      'o PATRIMONIO do cliente nao pode encolher: ele continua dono dos 100, so 30 estao fora do predio');
  });

  await test('[posicao por cliente][CONTROLE POSITIVO] sem nada em terceiros o disponivel do cliente fica inteiro', async () => {
    const cli = await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente Sem Remessa LTDA')");
    const id = await novoMaterial(db, 0, cli.lastID);
    const pos = await clienteEstoqueService.posicaoPorCliente(db, { cliente_id: cli.lastID });
    const item = pos.itens.find((i) => i.material_id === id);
    assert.strictEqual(item.saldo_disponivel, 100);
  });

  // ── Achado fora do plano: a coluna nova vazava para o requisitante ───────────────────────────
  // GET /api/requisicoes-material/materiais faz `SELECT m.*` e entrega o resultado por
  // sanitizeMaterialForSector, que APAGA as tres retencoes existentes — o solicitante ve
  // disponibilidade, nunca quantidade exata. Toda coluna nova de materiais_almoxarifado vaza ate
  // ser nomeada em SENSITIVE_MATERIAL_FIELDS, e o plano da Task 1 nao previu isso.
  await test('[sanitize] quantidade_em_terceiros nao vaza para o requisitante', async () => {
    const { sanitizeMaterialForSector } = require('../../services/almoxarifado/stockAvailabilityService');
    const limpo = sanitizeMaterialForSector({
      id: 1, codigo: 'X-1', nome: 'Chapa', unidade: 'UN',
      quantidade_atual: 100, quantidade_em_terceiros: 30, quantidade_bloqueada: 5,
    }, 1);
    assert.strictEqual(limpo.quantidade_em_terceiros, undefined,
      'a coluna nova vaza quantidade exata para quem so pode ver disponibilidade');
    assert.strictEqual(limpo.quantidade_bloqueada, undefined, 'regressao nas retencoes antigas');
  });

  await test('[sanitize][CONTROLE POSITIVO] o sanitizador nao apaga o material inteiro', async () => {
    // Sem esta metade, um `return {}` passaria no teste acima e mataria a tela do solicitante.
    const { sanitizeMaterialForSector } = require('../../services/almoxarifado/stockAvailabilityService');
    const limpo = sanitizeMaterialForSector({
      id: 1, codigo: 'X-1', nome: 'Chapa', unidade: 'UN', quantidade_atual: 100, quantidade_em_terceiros: 0,
    }, 1);
    assert.strictEqual(limpo.codigo, 'X-1');
    assert.strictEqual(limpo.nome, 'Chapa');
    assert.strictEqual(limpo.disponibilidade, 'em_estoque');
  });

  // ── Controle positivo bilateral do conjunto ──────────────────────────────────────────────────
  await test('[CONTROLE POSITIVO BILATERAL] com em_terceiros = 0 TODOS os caminhos devolvem o disponivel cheio', async () => {
    // Metade que falta: um `- 0` que virasse `- quantidade_atual` (ou um filtro que zerasse a
    // leitura) passaria em TODOS os testes de recusa acima. Este prova que a conta nao ficou
    // pessimista — a metade de exclusao sozinha aprova leitura zerada (ja aconteceu 5x nesta base).
    const id = await novoMaterial(db, 0);
    assert.strictEqual(await stockService.getSaldoDisponivel(await lerMaterial(db, id)), 100);
    const [lista] = await stockService.consultarEstoque(db, { material_id: id });
    assert.strictEqual(lista.quantidade_disponivel, 100);
    const rel = (await reportService.relatorioEstoqueAtual(db)).find((l) => l.id === id);
    assert.strictEqual(rel.disponivel, 100);
    const extrato = await request(app).get(`/api/almoxarifado/materiais/${id}/extrato`);
    assert.strictEqual(extrato.body.material.quantidade_disponivel, 100);
    const { requisicaoId, itemId } = await requisicaoCom(db, id, 5);
    assert.strictEqual(await requisitionStateMachine.calcularStatusPosAprovacao(db, requisicaoId), 'APROVADO');
    const [item] = await requisitionService.carregarItensRequisicao(db, requisicaoId);
    assert.strictEqual(item.saldo_disponivel, 100);
    const porItem = await requisitionService.saldoDisponivelParaItem(db, { id: itemId, material_id: id });
    assert.strictEqual(porItem.disponivel, 100);
    const detalhe = await request(app).get(`/api/almoxarifado/requisicoes/${requisicaoId}`);
    assert.strictEqual(detalhe.body.itens[0].saldo_atual, 100);
    const solicitante = await request(app).get(`/api/requisicoes-material/${requisicaoId}`);
    assert.strictEqual(solicitante.body.itens[0].disponibilidade, 'em_estoque');
  });

  // ── Varredura: nenhuma outra query pode reimplementar a conta ────────────────────────────────
  // Verificar "editei os 14" depende de eu ter contado certo. Verificar "sobrou zero" nao depende —
  // e e o unico jeito de a Etapa 8c (que reabre a mesma pergunta) nao ter de recontar. Varre
  // server/ INTEIRO nos diretorios que tocam materiais_almoxarifado, incluindo
  // routes/requisicoesMaterial.js, que NAO pertence ao modulo almoxarifado e por isso escapou das
  // duas varreduras anteriores desta sequencia de etapas.
  const RAIZ = path.join(__dirname, '..', '..');
  const ARQUIVOS_VARRIDOS = [
    ...fs.readdirSync(path.join(RAIZ, 'services', 'almoxarifado'))
      .filter((f) => f.endsWith('.js')).map((f) => path.join('services', 'almoxarifado', f)),
    ...fs.readdirSync(path.join(RAIZ, 'routes', 'almoxarifado'))
      .filter((f) => f.endsWith('.js')).map((f) => path.join('routes', 'almoxarifado', f)),
    path.join('routes', 'almoxarifado.js'),
    path.join('routes', 'requisicoesMaterial.js'),
  ];
  // Casa `- COALESCE(<alias?>quantidade_em_inspecao,0)` — a assinatura da conta REPLICADA.
  // NAO casa os UPDATEs legitimos de retencao (`SET quantidade_em_inspecao = COALESCE(...) - ?`,
  // `AND COALESCE(quantidade_em_inspecao,0) >= ?`), que tem `=`/`AND` antes do COALESCE.
  const PADRAO_REPLICADO = /-\s*COALESCE\(\s*\w*\.?quantidade_em_inspecao\s*,\s*0\s*\)/;

  await test('[varredura] nenhum arquivo fora de availabilitySql.js reimplementa a conta do disponivel', async () => {
    const culpados = ARQUIVOS_VARRIDOS.filter((rel) => {
      if (rel.endsWith('availabilitySql.js')) return false;
      return PADRAO_REPLICADO.test(fs.readFileSync(path.join(RAIZ, rel), 'utf8'));
    });
    assert.deepStrictEqual(culpados, [],
      `estes arquivos ainda calculam o disponivel a mao — a coluna nova nao vale neles: ${culpados.join(', ')}`);
  });

  await test('[varredura][CONTROLE POSITIVO] o padrao SABE achar a conta replicada', async () => {
    // Sem isto, um regex quebrado daria "0 culpados" e aprovaria o oposto do que a task promete.
    const fixture = '(m.quantidade_atual - COALESCE(m.quantidade_reservada,0)'
      + ' - COALESCE(m.quantidade_bloqueada,0) - COALESCE(m.quantidade_em_inspecao,0)) as disponivel';
    assert.ok(PADRAO_REPLICADO.test(fixture), 'o padrao da varredura nao acha nem a conta literal');
    const legitimo = 'SET quantidade_em_inspecao = COALESCE(quantidade_em_inspecao,0) - ? WHERE id = ?';
    assert.ok(!PADRAO_REPLICADO.test(legitimo), 'o padrao acusa um UPDATE de retencao legitimo');
    // E tem de varrer os arquivos de verdade: lista vazia (glob errado) daria "0 culpados" para
    // sempre. Ja aconteceu 3x nesta base — varredura com caminho errado que provava nada.
    assert.ok(ARQUIVOS_VARRIDOS.length >= 30, `a varredura leu ${ARQUIVOS_VARRIDOS.length} arquivos — glob errado?`);
    ARQUIVOS_VARRIDOS.forEach((rel) => assert.ok(fs.existsSync(path.join(RAIZ, rel)), `nao existe: ${rel}`));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
