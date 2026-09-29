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
  await test('(1) o SQL da flag usa os MESMOS literais de DECISAO_QUE_DEVOLVE/EXECUCAO_EXECUTADA', async () => {
    // O SQL desta regua nao importa `nonConformityService` (nenhum require de servico mora nesse
    // trecho, como em `listarNaoConformidadesParadas`), entao os dois literais sao COPIA. Copia
    // sem guarda deriva: renomear a decisao ou o estado no servico deixaria a flag casando um
    // valor que nao existe mais — e o cartao voltaria a cobrar TUDO em silencio, verde na suite.
    const fonte = fs.readFileSync(
      path.join(__dirname, '../../services/almoxarifado/alertRegistry.js'), 'utf8');
    assert.ok(fonte.includes(`nc.decisao = '${nc.DECISAO_QUE_DEVOLVE}'`),
      `a regua nao casa DECISAO_QUE_DEVOLVE ('${nc.DECISAO_QUE_DEVOLVE}')`);
    assert.ok(fonte.includes(`nc.execucao_estado = '${nc.EXECUCAO_EXECUTADA}'`),
      `a regua nao casa EXECUCAO_EXECUTADA ('${nc.EXECUCAO_EXECUTADA}')`);
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

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
