/**
 * Etapa 45, T5 — O CARTAO DE REPROVADOS PARA DE COBRAR O QUE JA FOI DEVOLVIDO
 * (`alertRegistry.listarReprovados`, flag `excluirComExecucao`).
 *
 * Plano:  docs/superpowers/plans/2026-09-28-almoxarifado-etapa45-devolucao-ao-fornecedor.md (T5)
 *
 * A T2 deu a NC um ESTADO DE EXECUCAO: decidir `DEVOLVER` e intencao, registrar que a devolucao
 * saiu e um segundo gesto. O cartao `MATERIAL_REPROVADO` da central nao sabia disso e continuava
 * mostrando, por 7 dias, a inspecao cuja caixa ja tinha ido embora — o jeito mais rapido de
 * ensinar o usuario a ignorar o cartao inteiro.
 *
 * ⚠️ UMA PREMISSA DO BRIEF DESTA TASK ERA FALSA e o codigo desmente: o cartao NAO "cobra a
 * intencao para sempre". Ele tem janela (`alerta_eventos_janela_dias`, default 7) sobre
 * `data_inspecao` — passados os 7 dias a inspecao sai sozinha, executada ou nao. E o e-mail ja
 * saiu no ato da reprovacao (`dedupeChave: reprovado-<inspecao_id>`, 1x para sempre). Logo esta
 * task NAO e "tirar da fila de pendencia" (isso e `?execucao=PENDENTE`, T3): e so nao cobrar na
 * central, durante a janela, o que ja foi feito.
 *
 * ── O QUE CADA CENARIO PRENDE ────────────────────────────────────────────────────────────────
 *   (1) anti-deriva: os literais do SQL sao os MESMOS `DECISAO_QUE_DEVOLVE`/`EXECUCAO_EXECUTADA`
 *       do servico (o SQL nao importa o servico — a copia precisa de guarda)
 *   (2) a flag e OPT-IN: sem liga-la, a executada continua listada — nada mudou para quem nao pediu
 *   (3) ligada: a devolvida SAI e a que so foi DECIDIDA continua (a metade positiva; sem ela o
 *       cenario passaria com o cartao vazio)
 *   (4) O GANCHO DO ATO continua avisando no modo `{ inspecaoId }` mesmo com a NC EXECUTADA —
 *       e o erro que a Etapa 43 mediu em `listarDivergenciasRecebimento` e que nao pode voltar
 *   (5) executar `SUBSTITUICAO` NAO silencia o cartao: substituir nao devolve nada ao fornecedor
 *   (6) a execucao de UMA inspecao nao tira a VIZINHA do cartao (a correlacao `referencia_id`)
 *   (7) a ponta a ponta: a entrada do registro e `montarCentral` mostram o mesmo recorte
 *
 * ── GUARDA ANTI-TESTE-VAZIO ──────────────────────────────────────────────────────────────────
 * Todo cenario que afirma "saiu" afirma NO MESMO ASSERT que outra inspecao CONTINUOU: um `NOT
 * EXISTS` correlacionado errado (ou uma janela mal configurada) esvazia a lista inteira e um
 * teste so com a metade negativa ficaria verde provando nada.
 *
 * Executar: cd server && node tests/api/alertaReprovadoExecutado.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const alertRegistry = require('../../services/almoxarifado/alertRegistry');
const nc = require('../../services/almoxarifado/nonConformityService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 470, nome: 'Admin E45T5', role: 'admin', is_superadmin: 1, email: 'admin45t5@test.com' };
const QUALIDADE = { id: 471, nome: 'Fulana Qualidade', perfil_almoxarifado: 'QUALIDADE', email: 'q45t5@test.com' };
const COMPRAS = { id: 472, nome: 'Beltrano Compras', perfil_almoxarifado: 'COMPRAS', email: 'c45t5@test.com' };

let seq = 0;
const uniq = (p) => `${p}-${Date.now() % 1000000}-${++seq}`;

(async () => {
  console.log('\n=== Etapa 45 T5: o cartao de reprovados nao cobra o que ja foi devolvido ===\n');
  const { db, close } = await createTestApp({ user: { ...ADMIN } });

  /** Inspecao reprovada com o bloqueio correspondente no pool — molde da T2. */
  async function novaInspecaoReprovada({ reprovada = 3, esperada = 10 } = {}) {
    const mat = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_bloqueada, ativo)
      VALUES (?,?,?,?,?,1)`,
      [uniq('MAT-E45T5'), 'Chapa da Etapa 45 T5', 'KG', esperada, reprovada]);
    const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal) VALUES (?,?,?)`, [uniq('REC-E45T5'), 'RECEBIDO', uniq('NF')]);
    const item = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida)
      VALUES (?,?,?,?)`, [rec.lastID, mat.lastID, esperada, esperada]);
    const insp = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
      (recebimento_item_id, conforme, quantidade_aprovada, quantidade_reprovada,
       responsavel_id, responsavel_nome)
      VALUES (?,?,?,?,?,?)`,
      [item.lastID, 0, esperada - reprovada, reprovada, QUALIDADE.id, QUALIDADE.nome]);
    return { materialId: mat.lastID, recebimentoId: rec.lastID, inspecaoId: insp.lastID };
  }

  const decidir = (id, decisao) => nc.decidirNaoConformidade(db, QUALIDADE, id,
    { decisao, justificativa: 'laudo do inspetor anexo' });
  const executar = (id) => nc.registrarExecucao(db, COMPRAS, id,
    { observacoes: 'coleta 442 da transportadora' });

  /** inspecao reprovada -> NC automatica -> decidida (-> executada). */
  async function inspecaoComNc(decisao, { executada = false, ...opcoes } = {}) {
    const ctx = await novaInspecaoReprovada(opcoes);
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, ctx.inspecaoId);
    assert.ok(doc, 'a NC automatica da inspecao reprovada TINHA de nascer');
    await decidir(doc.id, decisao);
    if (executada) await executar(doc.id);
    return { ...ctx, ncId: doc.id, numero: doc.numero };
  }

  const cartao = (dias = 7) => alertRegistry.listarReprovados(db, { dias, excluirComExecucao: true });
  const semFlag = (dias = 7) => alertRegistry.listarReprovados(db, { dias });
  const temInspecao = (linhas, id) => linhas.some((l) => l.inspecao_id === id);

  // ── (1) a copia dos literais, antes de tudo ────────────────────────────────────────────────
  await test('(1) a regua cala pelo MOVIMENTO (devolucao_fornecedor_em), nao pelo documento', async () => {
    // ⚠️ ESTE CENARIO FOI REESCRITO NO FIX-ROUND DA FASE 5, e a versao anterior fica descrita
    // porque ela media a coisa errada com toda a aparencia de rigor.
    //
    // Ele guardava os literais `nc.decisao = 'DEVOLVER'` e `nc.execucao_estado = 'EXECUTADA'`
    // contra deriva — guarda legitima, e a regua inteira estava errada por baixo dela: as duas
    // condicoes medem INTENCAO REGISTRADA, e o cartao cobra MATERIAL QUE AINDA ESTA NO GALPAO.
    // Execucao com efeito `NENHUMA` ou `SEM_SALDO` vira `EXECUTADA` sem mover nada, e o cartao
    // calava com o material inteiro retido (reproduzido por DOIS revisores).
    //
    // A regua agora e `i.devolucao_fornecedor_em IS NULL`, que e mais forte: a coluna so e
    // carimbada dentro de `executarDevolucao`, e o rollback a apaga se o motor falhar. Quem
    // guarda a deriva agora e o cenario (8), que prova que ela NAO e escrita em nenhum outro
    // caminho — que e a propriedade de que esta regua depende.
    const fonte = fs.readFileSync(
      path.join(__dirname, '../../services/almoxarifado/alertRegistry.js'), 'utf8');

    // ⚠️ A VARREDURA ERA NO ARQUIVO INTEIRO, E ISSO ESTAVA ERRADO — corrigido A VISTA na Etapa 46,
    // T3, porque o defeito so apareceu quando custou. A assercao negativa abaixo diz "a regua
    // voltou a medir o ESTADO do documento", mas `fonte` e o registro COMPLETO, com 15 entradas: a
    // 15a (`NAO_CONFORMIDADE_EXECUCAO_PENDENTE`) tem `nc.execucao_estado = 'PENDENTE'` no proprio
    // SQL, DE PROPOSITO e como contrato dela, e o guarda ficou vermelho acusando uma regressao que
    // nao existe. Falso positivo em guarda de texto e pior que guarda ausente: ele treina o
    // proximo a "consertar" o codigo certo, ou a apagar o guarda.
    //
    // A janela agora e o CORPO de `listarReprovados` — que e o que as duas assercoes sempre
    // quiseram dizer. O docblock fica DE FORA de proposito (ele narra a regua ANTIGA, com
    // `execucao_estado = 'EXECUTADA'` escrito por extenso, justamente para ensinar por que ela nao
    // bastava), e por isso o corte comeca na assinatura da funcao.
    const inicio = fonte.indexOf('async function listarReprovados(');
    assert.ok(inicio >= 0, '`listarReprovados` nao existe mais em alertRegistry.js');
    const fim = fonte.indexOf('\n}\n', inicio);
    assert.ok(fim > inicio, 'nao foi possivel delimitar o corpo de `listarReprovados`');
    const regua = fonte.slice(inicio, fim);

    assert.ok(regua.includes('i.devolucao_fornecedor_em IS NULL'),
      'a regua do cartao nao usa o carimbo do movimento');
    assert.ok(!/nc\.execucao_estado\s*=/.test(regua),
      'a regua voltou a medir o ESTADO do documento em vez do movimento');
    // GUARDA DO PROPRIO CORTE (senao um `slice` que devolvesse string vazia faria a assercao
    // negativa passar por vacuidade — o falso-verde que este arquivo existe para nao ter):
    // o corte tem de conter o SQL da funcao.
    assert.ok(regua.includes('FROM inspecoes_recebimento_almoxarifado i'),
      `o corte nao pegou o SQL de listarReprovados (${regua.length} chars)`);
  });

  // ── (2) OPT-IN ─────────────────────────────────────────────────────────────────────────────
  await test('(2) sem ligar a flag, a inspecao devolvida CONTINUA na listagem (opt-in de verdade)', async () => {
    const devolvida = await inspecaoComNc('DEVOLVER', { executada: true });
    const linhas = await semFlag();
    assert.ok(temInspecao(linhas, devolvida.inspecaoId),
      'a flag nao e opt-in: excluir sem pedir muda o dual-mode e os outros chamadores');
  });

  // ── (3) o recorte: o devolvido sai, o decidido-e-nao-executado fica ────────────────────────
  await test('(3) ligada: a devolvida SAI e a so DECIDIDA continua', async () => {
    const devolvida = await inspecaoComNc('DEVOLVER', { executada: true });
    const pendente = await inspecaoComNc('DEVOLVER', { executada: false });

    const linhas = await cartao();
    // A metade POSITIVA primeiro, de proposito: se a lista viesse vazia (NOT EXISTS
    // descorrelacionado, janela errada), a assercao de baixo passaria provando nada.
    assert.ok(temInspecao(linhas, pendente.inspecaoId),
      'decidir DEVOLVER e INTENCAO — a caixa ainda esta no galpao e TEM de aparecer no cartao');
    assert.ok(!temInspecao(linhas, devolvida.inspecaoId),
      'a devolucao ja executada continua sendo cobrada no cartao');

    // E o estado que sustenta o recorte e mesmo o da T2, nao um efeito colateral.
    const doc = await dbGet(db, `SELECT decisao, execucao_estado
      FROM nao_conformidades_almoxarifado WHERE id = ?`, [devolvida.ncId]);
    assert.strictEqual(doc.decisao, nc.DECISAO_QUE_DEVOLVE);
    assert.strictEqual(doc.execucao_estado, nc.EXECUCAO_EXECUTADA);
  });

  // ── (4) O GANCHO DO ATO — o erro da Etapa 43 que nao pode voltar ───────────────────────────
  await test('(4) o gancho do ato ({inspecaoId}) avisa mesmo com a NC EXECUTADA', async () => {
    const devolvida = await inspecaoComNc('DEVOLVER', { executada: true });
    // `inspectionService` chama ESTE modo logo depois de gravar a decisao da inspecao para montar
    // a linha do e-mail. Se a exclusao morasse DENTRO da funcao, uma reprovacao nova numa inspecao
    // cuja NC ja estivesse executada nasceria sem aviso nenhum — o cenario A1 da Etapa 17.
    const [linha] = await alertRegistry.listarReprovados(db, { inspecaoId: devolvida.inspecaoId });
    assert.ok(linha, 'o gancho do ato ficou MUDO — a exclusao vazou para o modo por id');
    assert.strictEqual(linha.inspecao_id, devolvida.inspecaoId);
    assert.strictEqual(Number(linha.quantidade_reprovada), 3);
    // E continua mudo-proof mesmo se alguem passar a flag junto por engano: o modo por id ignora
    // a janela e e o gancho; a exclusao so vale para a populacao do cartao.
    const [comFlag] = await alertRegistry.listarReprovados(db,
      { inspecaoId: devolvida.inspecaoId, excluirComExecucao: false });
    assert.ok(comFlag, 'o modo por id com a flag desligada explicita tambem tem de responder');
  });

  // ── (5) SUBSTITUICAO executada NAO silencia ────────────────────────────────────────────────
  await test('(5) executar SUBSTITUICAO nao silencia o cartao (substituir nao devolve)', async () => {
    const substituicao = await inspecaoComNc('SUBSTITUICAO', { executada: true });
    const linhas = await cartao();
    assert.ok(temInspecao(linhas, substituicao.inspecaoId),
      'uma SUBSTITUICAO executada calou o cartao — a regua esta olhando so execucao_estado');
    // A metade que prova que a NC ESTA mesmo executada (senao o cenario passaria por um motivo
    // errado: NC que nunca foi executada obviamente continua no cartao).
    const doc = await dbGet(db, `SELECT decisao, execucao_estado
      FROM nao_conformidades_almoxarifado WHERE id = ?`, [substituicao.ncId]);
    assert.strictEqual(doc.decisao, 'SUBSTITUICAO');
    assert.strictEqual(doc.execucao_estado, nc.EXECUCAO_EXECUTADA,
      'o cenario mediria nada: a NC de SUBSTITUICAO nao chegou a ser executada');
  });

  // ── (6) a correlacao por referencia_id ─────────────────────────────────────────────────────
  await test('(6) a devolucao de UMA inspecao nao tira a VIZINHA do cartao', async () => {
    const devolvida = await inspecaoComNc('DEVOLVER', { executada: true });
    const vizinha = await novaInspecaoReprovada({ reprovada: 2, esperada: 8 });
    const linhas = await cartao();
    assert.ok(temInspecao(linhas, vizinha.inspecaoId),
      'a exclusao nao esta correlacionada com i.id — uma devolucao calou inspecao alheia');
    assert.ok(!temInspecao(linhas, devolvida.inspecaoId), 'a devolvida devia ter saido');
  });

  // ── (7) ponta a ponta: a entrada do registro e a central ───────────────────────────────────
  await test('(7) a entrada MATERIAL_REPROVADO e a central mostram o mesmo recorte', async () => {
    const devolvida = await inspecaoComNc('DEVOLVER', { executada: true });
    const pendente = await inspecaoComNc('DEVOLVER', { executada: false });

    const entrada = alertRegistry.ALERT_REGISTRY.find((e) => e.chave === 'MATERIAL_REPROVADO');
    const linhas = await entrada.listar(db, { dias: 7 });
    assert.ok(temInspecao(linhas, pendente.inspecaoId), 'a entrada perdeu a inspecao pendente');
    assert.ok(!temInspecao(linhas, devolvida.inspecaoId),
      'a entrada do registro nao ligou a flag — o cartao continua cobrando o que ja saiu');

    const { alertas } = await alertRegistry.montarCentral(db);
    const card = alertas.find((a) => a.chave === 'MATERIAL_REPROVADO');
    assert.ok(card && !card.erro, `o cartao veio com erro: ${JSON.stringify(card)}`);
    assert.ok(temInspecao(card.linhas, pendente.inspecaoId), 'a central perdeu a inspecao pendente');
    assert.ok(!temInspecao(card.linhas, devolvida.inspecaoId),
      'a central ainda cobra a devolucao ja executada');
  });

  // ── (8) a (10) — O FIX-ROUND DA FASE 5 ─────────────────────────────────────────────────────

  await test('(8) execucao com efeito NENHUMA (RN-06) NAO cala o cartao — o material continua aqui', async () => {
    // ⚠️ REPRODUZIDO POR EXECUCAO NA REVISAO, e e o furo que a regua antiga tinha: a NC
    // AUTOMATICA decidida DEVOLVER segue pendente, alguem abre uma NC MANUAL sobre a mesma
    // inspecao (COMPRAS tem `registrar_nao_conformidade`), a QUALIDADE decide DEVOLVER nela e o
    // COMPRAS a executa. A resposta e 200 com `NENHUMA` e a literal da RN-06 — NADA SAI —, mas
    // `execucao_estado` daquela NC manual virava EXECUTADA e o cartao calava com o material
    // inteiro ainda bloqueado no galpao.
    const ctx = await novaInspecaoReprovada({ reprovada: 3, esperada: 10 });
    const automatica = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, ctx.inspecaoId);
    await decidir(automatica.id, 'DEVOLVER');

    const manual = await nc.abrirNaoConformidadeManual(db, COMPRAS, {
      origem: 'INSPECAO', referencia_tipo: 'INSPECAO', referencia_id: ctx.inspecaoId,
      tipo: 'OUTRO', descricao: 'aberta a mao',
    });
    await decidir(manual.id, 'DEVOLVER');
    const res = await executar(manual.id);

    // A metade positiva: o cenario so mede o que diz se a execucao de fato NAO moveu nada.
    assert.strictEqual(res.execucao.efeito, 'NENHUMA', JSON.stringify(res.execucao));
    const m = await dbGet(db, 'SELECT quantidade_bloqueada FROM materiais_almoxarifado WHERE id = ?',
      [ctx.materialId]);
    assert.strictEqual(Number(m.quantidade_bloqueada), 3, 'o fixture deixou de medir o que queria');

    assert.ok(temInspecao(await cartao(), ctx.inspecaoId),
      'o cartao calou por uma execucao que o proprio sistema diz nao ter devolvido nada');
  });

  await test('(9) execucao com efeito SEM_SALDO NAO cala o cartao', async () => {
    // Mesma familia do (8), e era a metade que fechava o CRITICAL do epsilon: quando a devolucao
    // legitima virava `SEM_SALDO` por ruido de ponto flutuante, o cartao — ULTIMA superficie que
    // ainda cobraria aquele material — calava junto, e nao sobrava nada apontando o esquecimento.
    const ctx = await novaInspecaoReprovada({ reprovada: 3, esperada: 10 });
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, ctx.inspecaoId);
    await decidir(doc.id, 'DEVOLVER');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [ctx.materialId]);
    const res = await executar(doc.id);
    assert.strictEqual(res.execucao.efeito, 'SEM_SALDO', JSON.stringify(res.execucao));
    assert.ok(temInspecao(await cartao(), ctx.inspecaoId),
      'o cartao calou por uma execucao que nao moveu saldo nenhum');
  });

  await test('(10) `devolucao_fornecedor_em` so e escrita pela execucao que MOVEU — a regua depende disso', async () => {
    // A regua nova confia numa propriedade do resto do modulo: a coluna e carimbada em UM lugar
    // so, e apagada de volta se o motor falhar. Se um dia alguem a escrever noutro caminho, a
    // regua passa a calar por intencao de novo — sem nada cair. Esta e a guarda de deriva que
    // substitui a antiga (ver o cenario (1)).
    const fonte = fs.readFileSync(
      path.join(__dirname, '../../services/almoxarifado/nonConformityService.js'), 'utf8');
    const escritas = (fonte.match(/SET devolucao_fornecedor_em = CURRENT_TIMESTAMP/g) || []).length;
    assert.strictEqual(escritas, 1,
      `esperava 1 escritor de devolucao_fornecedor_em, achei ${escritas} — a regua do cartao depende de haver so um`);
    assert.ok(/SET devolucao_fornecedor_em = NULL/.test(fonte),
      'o rollback do carimbo sumiu — uma execucao que falhou calaria o cartao para sempre');

    // E a metade medida, nao lida: a execucao que falha no motor NAO cala o cartao.
    const ctx = await novaInspecaoReprovada({ reprovada: 3, esperada: 10 });
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, ctx.inspecaoId);
    await decidir(doc.id, 'DEVOLVER');
    const stockService = require('../../services/almoxarifado/stockService');
    const original = stockService.registrarMovimentacao;
    stockService.registrarMovimentacao = async () => { throw new Error('motor caiu'); };
    try {
      await executar(doc.id).then(() => { throw new Error('a falha do motor nao subiu'); },
        (e) => assert.strictEqual(e.message, 'motor caiu'));
    } finally {
      stockService.registrarMovimentacao = original;
    }
    assert.ok(temInspecao(await cartao(), ctx.inspecaoId),
      'o motor falhou, nada saiu, e o cartao parou de cobrar');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
