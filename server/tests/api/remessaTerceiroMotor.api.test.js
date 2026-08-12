/**
 * Etapa 8b, Task 4 — os quatro tipos de movimento da remessa, dentro do motor.
 *
 * Testa o MOTOR direto (registrarMovimentacao), nao o servico da remessa: e aqui que o saldo muda,
 * e o servico da Task 5-7 so orquestra. Os dois pares:
 *
 *   REMESSA_TERCEIRO / RETORNO_TERCEIRO   retencao pura — a coluna sobe/desce, quantidade_atual
 *                                         NAO muda (o material continua sendo nosso).
 *   PERDA_TERCEIRO / CONSUMO_TERCEIRO     baixa definitiva — quantidade_atual E
 *                                         quantidade_em_terceiros descem NO MESMO UPDATE.
 *
 * O "mesmo UPDATE" e o ponto: como duas chamadas independentes, uma decisao concorrente poderia
 * consumir o em_terceiros pela metade — exatamente a razao pela qual DECISAO_INSPECAO existe (ver
 * o comentario dela em stockService.js).
 *
 * Executar: cd server && node tests/api/remessaTerceiroMotor.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const JUST = { justificativa: 'teste do motor de remessa a terceiro' };

let seq = 0;
async function novoMaterial(db, { atual = 100, emTerceiros = 0, dono = null } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_em_terceiros, ativo, proprietario_cliente_id)
     VALUES (?,?,'UN',?,?,1,?)`,
    [`MOT-${seq}`, `Material motor ${seq}`, atual, emTerceiros, dono]);
  return r.lastID;
}
const saldos = async (db, id) => dbGet(db,
  'SELECT quantidade_atual, COALESCE(quantidade_em_terceiros,0) AS em_terceiros FROM materiais_almoxarifado WHERE id = ?', [id]);

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  // ── Par 1: retencao ──────────────────────────────────────────────────────────────────────────
  await test('envio a terceiro remove do disponivel e mantem quantidade_atual', async () => {
    const id = await novoMaterial(db, { atual: 100 });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'REMESSA_TERCEIRO', quantidade: 30, ...JUST });
    const s = await saldos(db, id);
    assert.strictEqual(s.quantidade_atual, 100, 'o material deixou de ser nosso — quantidade_atual caiu');
    assert.strictEqual(s.em_terceiros, 30);
    const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(await stockService.getSaldoDisponivel(m), 70);
    // A retencao NAO escreve linha de saldo por localizacao: o material nao saiu do endereco, so
    // deixou de estar disponivel. Se escrevesse, syncMaterialTotals (contagem por localizacao)
    // baixaria quantidade_atual de verdade — a "baixa e esquece" que a etapa existe para acabar.
    const linhas = await stockService.consultarSaldosPorLocalizacao(db, id);
    assert.strictEqual(linhas.length, 0,
      'a remessa caiu no bloco fisico e escreveu linha de saldo — a skip-list nao pegou o tipo novo');
  });

  await test('envio acima do disponivel e recusado, e a coluna nao sobe', async () => {
    const id = await novoMaterial(db, { atual: 100, emTerceiros: 80 });
    await assert.rejects(
      () => stockService.registrarMovimentacao(db, ADMIN, {
        material_id: id, tipo: 'REMESSA_TERCEIRO', quantidade: 30, ...JUST }),
      /dispon/i);
    assert.strictEqual((await saldos(db, id)).em_terceiros, 80, 'a retencao subiu mesmo com o envio recusado');
  });

  await test('[CONTROLE POSITIVO] envio EXATAMENTE do disponivel restante passa', async () => {
    const id = await novoMaterial(db, { atual: 100, emTerceiros: 80 });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'REMESSA_TERCEIRO', quantidade: 20, ...JUST });
    assert.strictEqual((await saldos(db, id)).em_terceiros, 100);
  });

  await test('retorno desce a retencao e nao mexe em quantidade_atual', async () => {
    const id = await novoMaterial(db, { atual: 100, emTerceiros: 30 });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'RETORNO_TERCEIRO', quantidade: 12, ...JUST });
    const s = await saldos(db, id);
    assert.strictEqual(s.quantidade_atual, 100, 'o retorno CREDITOU estoque — o material nunca saiu do patrimonio');
    assert.strictEqual(s.em_terceiros, 18);
    const linhas = await stockService.consultarSaldosPorLocalizacao(db, id);
    assert.strictEqual(linhas.length, 0, 'o retorno escreveu linha de saldo por localizacao');
  });

  await test('retorno maior que a remessa falha, e a mensagem diz quanto ainda esta la', async () => {
    const id = await novoMaterial(db, { atual: 100, emTerceiros: 18 });
    await assert.rejects(
      () => stockService.registrarMovimentacao(db, ADMIN, {
        material_id: id, tipo: 'RETORNO_TERCEIRO', quantidade: 25, ...JUST }),
      (e) => {
        assert.match(e.message, /18/, 'a mensagem nao diz o numero — o operador tem de adivinhar');
        return true;
      });
    assert.strictEqual((await saldos(db, id)).em_terceiros, 18);
  });

  await test('REMESSA_TERCEIRO e RETORNO_TERCEIRO exigem justificativa', async () => {
    for (const tipo of ['REMESSA_TERCEIRO', 'RETORNO_TERCEIRO']) {
      const id = await novoMaterial(db, { atual: 100, emTerceiros: 30 });
      await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
        material_id: id, tipo, quantidade: 5 }), /justificativa/i, `${tipo} passou sem justificativa`);
      assert.strictEqual((await saldos(db, id)).em_terceiros, 30);
    }
  });

  // ── Par 2: baixa definitiva ──────────────────────────────────────────────────────────────────
  for (const tipo of ['PERDA_TERCEIRO', 'CONSUMO_TERCEIRO']) {
    await test(`${tipo} baixa fisico e retencao no MESMO movimento`, async () => {
      const id = await novoMaterial(db, { atual: 100, emTerceiros: 30 });
      await stockService.registrarMovimentacao(db, ADMIN, {
        material_id: id, tipo, quantidade: 30, ...JUST });
      const s = await saldos(db, id);
      assert.strictEqual(s.quantidade_atual, 70, 'o fisico nao baixou');
      assert.strictEqual(s.em_terceiros, 0,
        'a retencao ficou presa: saldo orfao que o encerramento existe para evitar');
      const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
      assert.strictEqual(await stockService.getSaldoDisponivel(m), 70);
    });

    await test(`${tipo} acima do que esta retido e recusado, e nada muda`, async () => {
      const id = await novoMaterial(db, { atual: 100, emTerceiros: 30 });
      await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
        material_id: id, tipo, quantidade: 31, ...JUST }), /terceiro/i);
      const s = await saldos(db, id);
      assert.strictEqual(s.quantidade_atual, 100);
      assert.strictEqual(s.em_terceiros, 30);
    });

    await test(`${tipo} exige justificativa`, async () => {
      const id = await novoMaterial(db, { atual: 100, emTerceiros: 30 });
      await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
        material_id: id, tipo, quantidade: 5 }), /justificativa/i);
      assert.strictEqual((await saldos(db, id)).em_terceiros, 30);
    });
  }

  await test('a baixa no terceiro nao e barrada pela pre-checagem do disponivel', async () => {
    // Controle positivo do `!baixandoTerceiro` na pre-checagem: o material inteiro esta retido, o
    // disponivel e ZERO, e mesmo assim a baixa tem de passar — a quantidade que ela consome esta
    // em quantidade_em_terceiros, que o disponivel justamente exclui. Sem a excecao, encerrar uma
    // remessa que levou TODO o saldo seria impossivel.
    const id = await novoMaterial(db, { atual: 40, emTerceiros: 40 });
    const m0 = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(await stockService.getSaldoDisponivel(m0), 0, 'setup errado: o disponivel nao e zero');
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'PERDA_TERCEIRO', quantidade: 40, ...JUST });
    const s = await saldos(db, id);
    assert.strictEqual(s.quantidade_atual, 0);
    assert.strictEqual(s.em_terceiros, 0);
  });

  await test('o livro registra saldo_anterior e saldo_posterior corretos da baixa no terceiro', async () => {
    // Sem isto o extrato mostraria uma baixa com saldo inalterado — que foi o motivo de NAO
    // classificar PERDA_TERCEIRO como tipo de retencao.
    const id = await novoMaterial(db, { atual: 100, emTerceiros: 30 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'PERDA_TERCEIRO', quantidade: 30, ...JUST });
    const linha = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?',
      [mov.id || mov.movimentacao_id]);
    assert.ok(linha, 'a movimentacao nao foi gravada no livro');
    assert.strictEqual(linha.saldo_anterior, 100);
    assert.strictEqual(linha.saldo_posterior, 70);
  });

  await test('o livro registra a retencao com saldo_anterior == saldo_posterior', async () => {
    // O par de retencao nao mexe no fisico, entao o livro tem de dizer isso: um saldo_posterior
    // menor faria o extrato afirmar uma baixa que nao aconteceu.
    const id = await novoMaterial(db, { atual: 100 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'REMESSA_TERCEIRO', quantidade: 30, ...JUST });
    const linha = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [mov.id]);
    assert.ok(linha, 'a movimentacao nao foi gravada no livro');
    assert.strictEqual(linha.saldo_anterior, 100);
    assert.strictEqual(linha.saldo_posterior, 100);
  });

  await test('a baixa no terceiro escreve a linha de saldo por localizacao, como toda saida', async () => {
    // Se nao escrevesse, uma contagem por localizacao (que roda syncMaterialTotals) ressuscitaria
    // a quantidade baixada — o material perdido no galvanizador voltaria do nada.
    const id = await novoMaterial(db, { atual: 100, emTerceiros: 30 });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'PERDA_TERCEIRO', quantidade: 30, ...JUST });
    const linhas = await stockService.consultarSaldosPorLocalizacao(db, id);
    const total = linhas.reduce((a, l) => a + Number(l.quantidade || 0), 0);
    assert.ok(linhas.length > 0, 'a saida nao escreveu nenhuma linha de saldo por localizacao');
    assert.strictEqual(total, -30,
      'a linha de saldo nao acompanhou a baixa: uma contagem por localizacao ressuscitaria o material perdido');
  });

  // ── A rota generica nao pode criar nenhum dos quatro ─────────────────────────────────────────
  for (const tipo of ['REMESSA_TERCEIRO', 'RETORNO_TERCEIRO', 'PERDA_TERCEIRO', 'CONSUMO_TERCEIRO']) {
    await test(`[rota v2] ${tipo} e recusado pela rota generica de movimentacao`, async () => {
      const id = await novoMaterial(db, { atual: 100, emTerceiros: 50 });
      const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
        .send({ material_id: id, tipo, quantidade: 10, ...JUST });
      assert.strictEqual(res.status, 400, `a v2 aceitou ${tipo}: ${JSON.stringify(res.body)}`);
      const s = await saldos(db, id);
      assert.strictEqual(s.quantidade_atual, 100);
      assert.strictEqual(s.em_terceiros, 50);
    });
  }

  await test('[rota v2][CONTROLE POSITIVO] SAIDA continua aceita pela rota generica', async () => {
    // Sem isto, filtrar demais em TIPOS_MOVIMENTO_ROTA (e matar a tela de Movimentacoes inteira)
    // passaria nos quatro testes acima.
    const id = await novoMaterial(db, { atual: 100 });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: id, tipo: 'SAIDA', quantidade: 10, ...JUST });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  // ── Guarda do dono: isenta ───────────────────────────────────────────────────────────────────
  await test('remessa de material de cliente nao exige vinculo do dono', async () => {
    const cli = await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente Chapa SA')");
    const id = await novoMaterial(db, { atual: 100, dono: cli.lastID });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'REMESSA_TERCEIRO', quantidade: 40, ...JUST });
    assert.strictEqual((await saldos(db, id)).em_terceiros, 40,
      'a guarda do dono barrou a remessa — mandar galvanizar nao e APLICAR a chapa em ninguem');
  });

  await test('os quatro tipos passam com material DE CLIENTE sem OS nem projeto', async () => {
    // A isencao vale para o ciclo inteiro, nao so para o envio: se PERDA_TERCEIRO exigisse OS do
    // dono, encerrar a remessa da chapa perdida no galvanizador ficaria impossivel — exatamente o
    // motivo de nao reusar PERDA/SUCATA, que estao em TIPOS_SAIDA_COM_DONO.
    const cli = await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente Ciclo SA')");
    for (const [tipoBaixa, rotulo] of [['PERDA_TERCEIRO', 'perda'], ['CONSUMO_TERCEIRO', 'consumo']]) {
      const id = await novoMaterial(db, { atual: 100, dono: cli.lastID });
      await stockService.registrarMovimentacao(db, ADMIN, {
        material_id: id, tipo: 'REMESSA_TERCEIRO', quantidade: 50, ...JUST });
      await stockService.registrarMovimentacao(db, ADMIN, {
        material_id: id, tipo: 'RETORNO_TERCEIRO', quantidade: 20, ...JUST });
      await stockService.registrarMovimentacao(db, ADMIN, {
        material_id: id, tipo: tipoBaixa, quantidade: 30, ...JUST });
      const s = await saldos(db, id);
      assert.strictEqual(s.em_terceiros, 0, `ciclo de ${rotulo} deixou retencao presa`);
      assert.strictEqual(s.quantidade_atual, 70, `ciclo de ${rotulo} nao baixou o fisico`);
    }
  });

  await test('[CONTROLE POSITIVO] os quatro tipos tambem passam com material NOSSO', async () => {
    // A outra metade: isentar da guarda do dono nao pode ter virado "so funciona com dono".
    for (const tipoBaixa of ['PERDA_TERCEIRO', 'CONSUMO_TERCEIRO']) {
      const id = await novoMaterial(db, { atual: 100, dono: null });
      await stockService.registrarMovimentacao(db, ADMIN, {
        material_id: id, tipo: 'REMESSA_TERCEIRO', quantidade: 50, ...JUST });
      await stockService.registrarMovimentacao(db, ADMIN, {
        material_id: id, tipo: 'RETORNO_TERCEIRO', quantidade: 20, ...JUST });
      await stockService.registrarMovimentacao(db, ADMIN, {
        material_id: id, tipo: tipoBaixa, quantidade: 30, ...JUST });
      const s = await saldos(db, id);
      assert.strictEqual(s.em_terceiros, 0);
      assert.strictEqual(s.quantidade_atual, 70);
    }
  });

  await test('a isencao vem de TIPOS_ISENTOS_DONO, e nao de "o tipo nao esta em TIPOS_SAIDA_COM_DONO"', async () => {
    // Hoje a isencao dos quatro esta DUPLAMENTE coberta: eles estao em TIPOS_ISENTOS_DONO E fora
    // de TIPOS_SAIDA_COM_DONO, e assertSaidaPermitida sai cedo pelos DOIS caminhos. Sem este
    // bloco, apagar a entrada de TIPOS_ISENTOS_DONO nao quebraria teste nenhum — MEDIDO: a
    // sabotagem S6 da Task 4 passou 29/0 sem ele. E a proxima pessoa que classificasse
    // PERDA_TERCEIRO como "saida com dono" (o que ele literalmente e) reintroduziria a exigencia
    // de OS do cliente no encerramento da remessa, que a decisao 5 isenta.
    // Mesmo padrao ja usado para DEVOLUCAO_CLIENTE em materialClienteDevolucao.api.test.js.
    const ownerRules = require('../../services/almoxarifado/ownerRules');
    const cli = await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente Isencao SA')");
    const alvo = ['REMESSA_TERCEIRO', 'RETORNO_TERCEIRO', 'PERDA_TERCEIRO', 'CONSUMO_TERCEIRO'];
    ownerRules.TIPOS_SAIDA_COM_DONO.push(...alvo);
    try {
      for (const tipoBaixa of ['PERDA_TERCEIRO', 'CONSUMO_TERCEIRO']) {
        const id = await novoMaterial(db, { atual: 100, dono: cli.lastID });
        await stockService.registrarMovimentacao(db, ADMIN, {
          material_id: id, tipo: 'REMESSA_TERCEIRO', quantidade: 50, ...JUST });
        await stockService.registrarMovimentacao(db, ADMIN, {
          material_id: id, tipo: 'RETORNO_TERCEIRO', quantidade: 20, ...JUST });
        await stockService.registrarMovimentacao(db, ADMIN, {
          material_id: id, tipo: tipoBaixa, quantidade: 30, ...JUST });
        const s = await saldos(db, id);
        assert.strictEqual(s.em_terceiros, 0);
        assert.strictEqual(s.quantidade_atual, 70);
      }
    } finally {
      for (let i = 0; i < alvo.length; i += 1) ownerRules.TIPOS_SAIDA_COM_DONO.pop();
    }
    assert.ok(!ownerRules.TIPOS_SAIDA_COM_DONO.includes('PERDA_TERCEIRO'), 'restauracao da lista falhou');
  });

  await test('[CONTROLE POSITIVO] SAIDA de material de cliente sem OS continua recusada', async () => {
    // A metade que falta: esvaziar TIPOS_SAIDA_COM_DONO faria o teste acima passar e desfaria a
    // Etapa 8 inteira.
    const cli = await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente Chapa 2 SA')");
    const id = await novoMaterial(db, { atual: 100, dono: cli.lastID });
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'SAIDA', quantidade: 10, ...JUST }), /OS ou projeto/i);
  });

  // ── Estorno pelo livro ───────────────────────────────────────────────────────────────────────
  await test('estorno de PERDA_TERCEIRO devolve ao DISPONIVEL, nao a retencao', async () => {
    // Decisao declarada: quando alguem estorna, a remessa ja esta ENCERRADA — recriar a retencao
    // seria um hold sem remessa viva por tras, o saldo orfao que a decisao 4 rejeita.
    const id = await novoMaterial(db, { atual: 100, emTerceiros: 30 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'PERDA_TERCEIRO', quantidade: 30, ...JUST });
    await stockService.cancelarMovimentacao(db, ADMIN, mov.id, 'estorno de teste');
    const s = await saldos(db, id);
    assert.strictEqual(s.quantidade_atual, 100, 'o estorno nao devolveu o fisico — tipo fora do tiposSaida do cancelamento');
    assert.strictEqual(s.em_terceiros, 0, 'o estorno recriou a retencao: hold sem remessa viva por tras');
  });

  await test('estorno de REMESSA_TERCEIRO pelo livro e RECUSADO', async () => {
    // Sem esta recusa, cancelarMovimentacao marcaria cancelado=1 e gravaria ESTORNO com
    // saldo_anterior == saldo_posterior SEM tocar em quantidade_em_terceiros: o livro afirmaria
    // uma reversao que nao aconteceu, e a retencao ficaria presa. Mesma decisao ja tomada para os
    // tipos da quarentena. A porta certa e cancelar a REMESSA (Task 7).
    const id = await novoMaterial(db, { atual: 100 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'REMESSA_TERCEIRO', quantidade: 30, ...JUST });
    await assert.rejects(() => stockService.cancelarMovimentacao(db, ADMIN, mov.id, 'estorno de teste'),
      /remessa/i);
    const s = await saldos(db, id);
    assert.strictEqual(s.em_terceiros, 30, 'a retencao mudou apesar da recusa');
    const linha = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [mov.id]);
    assert.ok(!linha.cancelado, 'a movimentacao ficou marcada como cancelada sem reversao nenhuma');
  });

  // ── A skip-list do bloco fisico e DERIVADA, nao duplicada ────────────────────────────────────
  await test('a skip-list do bloco fisico deriva de TIPOS_RETENCAO em vez de duplica-la', async () => {
    // Varredura de codigo-fonte, no mesmo padrao de saldoEmTerceiros.api.test.js, e por uma razao
    // que precisa ficar escrita: a duplicacao NAO tem efeito observavel hoje. MEDIDO na Task 4 —
    // a sabotagem S8 (voltar a lista literal antiga, sem os dois tipos novos) passou 29/0, porque
    // um tipo de retencao que cai no bloco fisico bate no `else` final ("tipo neutro ao saldo") e
    // nao faz nada: a linha de saldo por localizacao so e escrita sob `tiposSaida.includes(tipo)`.
    // O plano previa que S8 escreveria linha de saldo — nao escreve; a previsao estava errada.
    // O risco real e de MANUTENCAO: duas listas em paralelo que precisam ser lembradas juntas, e
    // um `else` final que hoje e inofensivo e amanha pode ganhar efeito. Por isso o invariante
    // testado aqui e "existe UMA lista", nao um comportamento.
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../../services/almoxarifado/stockService'), 'utf8');
    const LITERAL = /if \(!\['TRANSFERENCIA',[\s\S]{0,220}?\]\.includes\(tipo\)\)/;
    const DERIVADA = /if \(!TIPOS_RETENCAO\.includes\(tipo\) && tipo !== 'TRANSFERENCIA'\)/;
    assert.ok(DERIVADA.test(src), 'a skip-list do bloco fisico nao deriva mais de TIPOS_RETENCAO');
    assert.ok(!LITERAL.test(src),
      'a skip-list literal voltou: agora todo tipo de retencao novo precisa ser lembrado em DOIS lugares');
    // Controle positivo do proprio padrao de busca: sem isto, um regex que nunca casa faria o
    // assert de ausencia acima passar para sempre, provando nada (a armadilha do teste vazio).
    const AMOSTRA = "  if (!['TRANSFERENCIA', 'BLOQUEIO', 'DESBLOQUEIO', 'RESERVA', 'LIBERACAO_RESERVA',\n"
      + "        'QUARENTENA', 'LIBERACAO_INSPECAO', 'REPROVACAO_INSPECAO', 'DECISAO_INSPECAO'].includes(tipo)) {";
    assert.ok(LITERAL.test(AMOSTRA), 'o padrao de busca da lista literal nao acha nem a lista literal');
  });

  // ── Lote vencido: a baixa no terceiro e um descarte ──────────────────────────────────────────
  await test('lote vencido pode ser baixado por PERDA_TERCEIRO', async () => {
    const id = await novoMaterial(db, { atual: 0 });
    const lote = await lotService.criarOuObterLote(db, ADMIN, {
      material_id: id, codigo: 'LOTE-VENC-T', data_validade: '2020-01-01' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'ENTRADA', quantidade: 10, lote_id: lote.id, motivo: 'setup' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'REMESSA_TERCEIRO', quantidade: 10, lote_id: lote.id, ...JUST });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'PERDA_TERCEIRO', quantidade: 10, lote_id: lote.id, ...JUST });
    const s = await saldos(db, id);
    assert.strictEqual(s.quantidade_atual, 0);
    assert.strictEqual(s.em_terceiros, 0);
  });

  await test('[CONTROLE POSITIVO] lote vencido continua barrado para SAIDA de consumo', async () => {
    // A metade que falta: encher tiposDescarte com todos os tipos faria o teste acima passar e
    // destravaria o consumo de lote vencido, que a Etapa 6 fechou de proposito.
    const id = await novoMaterial(db, { atual: 0 });
    const lote = await lotService.criarOuObterLote(db, ADMIN, {
      material_id: id, codigo: 'LOTE-VENC-T2', data_validade: '2020-01-01' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'ENTRADA', quantidade: 10, lote_id: lote.id, motivo: 'setup' });
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'SAIDA', quantidade: 10, lote_id: lote.id, ...JUST }), /vencido/i);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
