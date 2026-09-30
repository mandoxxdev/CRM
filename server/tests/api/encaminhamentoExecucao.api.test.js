/**
 * Etapa 45, T2 — REGISTRAR QUE O ENCAMINHAMENTO FOI EXECUTADO (`nonConformityService.js`).
 *
 * Plano:  docs/superpowers/plans/2026-09-28-almoxarifado-etapa45-devolucao-ao-fornecedor.md (T2)
 * Design: docs/superpowers/specs/2026-09-28-almoxarifado-etapa45-devolucao-ao-fornecedor-design.md
 *
 * Ate aqui a NC respondia "o que se DECIDIU" e ninguem sabia se a caixa tinha saido do galpao. A
 * decisao `DEVOLVER` e INTENCAO; a devolucao e outro ato, outro dia, outra pessoa — e e por isso
 * que esta etapa NAO copia a 44, onde aceitar executava no mesmo clique (la o material fica no
 * predio, aqui ele sai).
 *
 * ── O QUE CADA CENARIO PRENDE ────────────────────────────────────────────────────────────────
 *   (0)  a copia da lista de aceitacao no backfill de schema.js nao derivou de DECISOES_QUE_LIBERAM
 *   (1)  RN-01: decidir grava `execucao_estado` — PENDENTE nas quatro, NAO_SE_APLICA nas duas
 *   (2)  RN-03 + RN-09: executar `DEVOLVER` baixa dos DOIS lugares e a movimentacao nasce com
 *        numero da NC, motivo proprio e recebimento
 *   (3)  RN-05 (documento): a segunda execucao da MESMA NC e 409
 *   (4)  RN-07: NC ABERTA e NC CANCELADA recusam com 400
 *   (5)  RN-01: decisao de ACEITACAO nao tem execucao a registrar — 400
 *   (6)  RN-06: NC aberta A MAO sobre inspecao NAO baixa saldo — a porta que sustenta COMPRAS
 *   (7)  RN-06: NC AUTOMATICA de origem RECEBIMENTO tambem nao — o caso mais comum
 *   (8)  RN-05 (saldo): duas NCs de TIPOS diferentes da MESMA inspecao — a segunda e JA_DEVOLVIDA
 *   (9)  RN-04: as outras tres decisoes registram autor e data sem mover saldo
 *   (10) RN-11: os TRES estados conhecidos registram sem mover (bloqueio drenado, fisico, inativo)
 *   (11) RN-12: o lote e resolvido e DEBITADO — a linha do lote cai e a de lote NULL nao negativa
 *   (12) RN-12: `controle_lote` sem lote resolvivel RECUSA com literal propria
 *   (13) RN-13: `controle_serie` recusa
 *   (14) rollback: o motor falhou => estado ANTERIOR com igualdade EXATA, e a NC volta a PENDENTE
 *   (15) RN-09: a trilha carrega o verbo NOVO, e nao um NC_DECIDIDA disfarcado
 *   (16) o backfill da a NC ja decidida o estado certo, e NAO rebaixa uma EXECUTADA
 *
 * ── GUARDA ANTI-TESTE-VAZIO ──────────────────────────────────────────────────────────────────
 * Todo cenario que afirma "o saldo NAO se moveu" mede antes e depois e afirma o valor EXATO,
 * nunca "nao mudou" — e no (8) e no (14) a igualdade e `===`, nunca `>=`: a compensacao em dobro
 * (o CRITICAL 2 da Fase 2) passaria verde com `>=`.
 * E no (8) o material tem bloqueio de OUTRA ORIGEM alem da reprovada, de proposito: com
 * `bloqueada` igual a reprovada, quem barra a segunda baixa e o TETO DO MOTOR, nao a trava desta
 * etapa — o cenario mediria o motor e chamaria isso de idempotencia. Licao literal da Etapa 44.
 *
 * Executar: cd server && node tests/api/encaminhamentoExecucao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const nc = require('../../services/almoxarifado/nonConformityService');
const lotService = require('../../services/almoxarifado/lotService');
const stockService = require('../../services/almoxarifado/stockService');
const { migrateBackfillExecucaoEstadoNc } = require('../../services/almoxarifado/schema');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 450, nome: 'Admin E45', role: 'admin', is_superadmin: 1, email: 'admin45@test.com' };
const QUALIDADE = { id: 451, nome: 'Fulana Qualidade', perfil_almoxarifado: 'QUALIDADE', email: 'q45@test.com' };
const COMPRAS = { id: 452, nome: 'Beltrano Compras', perfil_almoxarifado: 'COMPRAS', email: 'c45@test.com' };

let seq = 0;
const uniq = (p) => `${p}-${Date.now() % 1000000}-${++seq}`;

async function erroDe(fn) {
  try { await fn(); return null; } catch (e) { return { message: e.message, status: e.status }; }
}

(async () => {
  console.log('\n=== Etapa 45 T2: o encaminhamento ganha estado de execucao ===\n');
  const { db, close } = await createTestApp({ user: { ...ADMIN } });

  const saldos = (id) => dbGet(db, `SELECT quantidade_atual, quantidade_bloqueada
    FROM materiais_almoxarifado WHERE id = ?`, [id]);

  const inspecaoDe = (id) => dbGet(db,
    'SELECT devolucao_fornecedor_em, liberacao_nc_em FROM inspecoes_recebimento_almoxarifado WHERE id = ?', [id]);

  const movimentacoesDe = (materialId) => dbAll(db,
    `SELECT id, tipo, quantidade, motivo, documento_vinculado, recebimento_id, lote_id
     FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id`, [materialId]);

  /**
   * Uma inspecao ja decidida com reprovacao, e o bloqueio correspondente no pool do material.
   * `bloqueioDeOutraOrigem` soma ao pool sem lastro em inspecao nenhuma — e o que simula o
   * bloqueio avulso que faz a diferenca no cenario (8).
   */
  async function novaInspecaoReprovada({
    reprovada = 3, esperada = 10, atual = null, bloqueioDeOutraOrigem = 0, ativo = 1,
    controleLote = 0, controleSerie = 0, loteId = null, loteCodigo = null,
  } = {}) {
    const mat = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_bloqueada, ativo, controle_lote, controle_serie)
      VALUES (?,?,?,?,?,?,?,?)`,
      [uniq('MAT-E45T2'), 'Chapa da Etapa 45', 'KG', atual == null ? esperada : atual,
        reprovada + bloqueioDeOutraOrigem, ativo, controleLote, controleSerie]);
    const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal) VALUES (?,?,?)`, [uniq('REC-E45'), 'RECEBIDO', uniq('NF')]);
    const item = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote_id, lote)
      VALUES (?,?,?,?,?,?)`,
      [rec.lastID, mat.lastID, esperada, esperada, loteId, loteCodigo]);
    const insp = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
      (recebimento_item_id, conforme, quantidade_aprovada, quantidade_reprovada, responsavel_id, responsavel_nome)
      VALUES (?,?,?,?,?,?)`,
      [item.lastID, reprovada > 0 ? 0 : 1, esperada - reprovada, reprovada, QUALIDADE.id, QUALIDADE.nome]);
    return {
      materialId: mat.lastID, recebimentoId: rec.lastID, itemId: item.lastID, inspecaoId: insp.lastID,
    };
  }

  const ncAutomatica = (inspecaoId) => nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, inspecaoId);

  const decidir = (id, decisao, user = QUALIDADE) =>
    nc.decidirNaoConformidade(db, user, id, { decisao, justificativa: 'laudo do inspetor anexo' });

  const executar = (id, user = COMPRAS, observacoes = 'coleta 442 da transportadora') =>
    nc.registrarExecucao(db, user, id, { observacoes });

  /** O caminho completo: inspecao reprovada -> NC automatica -> decidida. */
  async function ncDecidida(decisao, opcoes = {}) {
    const ctx = await novaInspecaoReprovada(opcoes);
    const doc = await ncAutomatica(ctx.inspecaoId);
    await decidir(doc.id, decisao);
    return { ...ctx, ncId: doc.id, numero: doc.numero };
  }

  // ── (0) — a copia literal do backfill, antes de tudo ───────────────────────────────────────
  await test('(0) a lista de aceitacao copiada no backfill de schema.js nao derivou', async () => {
    // `schema.js` nao pode importar o servico (ciclo certo), entao a lista das duas decisoes de
    // aceitacao esta COPIADA no SQL do backfill. Copia sem guarda deriva: acrescentar uma terceira
    // decisao de aceitacao faria o backfill marca-la PENDENTE, e ela apareceria na fila de
    // "falta executar" sem ter execucao nenhuma a registrar.
    const fonte = fs.readFileSync(
      path.join(__dirname, '../../services/almoxarifado/schema.js'), 'utf8');
    const esperado = nc.DECISOES_QUE_LIBERAM.map((d) => `'${d}'`).join(',');
    assert.ok(fonte.includes(`decisao IN (${esperado})`),
      `o backfill de schema.js nao casa DECISOES_QUE_LIBERAM (esperava "decisao IN (${esperado})")`);
    // E a metade positiva: as quatro com execucao sao MESMO o complemento, nao uma lista a mao.
    assert.deepStrictEqual(nc.DECISOES_COM_EXECUCAO.slice().sort(),
      ['ANALISE_ENGENHARIA', 'DEVOLVER', 'SUBSTITUICAO', 'SUCATEAR']);
  });

  // ── (1) RN-01 — decidir ja grava o estado de execucao ──────────────────────────────────────
  await test('(1) RN-01 decidir grava execucao_estado: PENDENTE nas quatro, NAO_SE_APLICA nas duas', async () => {
    for (const decisao of nc.DECISOES_COM_EXECUCAO) {
      const ctx = await ncDecidida(decisao);
      const doc = await nc.obterNaoConformidade(db, ctx.ncId);
      assert.strictEqual(doc.execucao_estado, nc.EXECUCAO_PENDENTE,
        `${decisao} deveria nascer PENDENTE, veio ${doc.execucao_estado}`);
      assert.strictEqual(doc.execucao_em, null, `${decisao} nasceu com execucao_em preenchido`);
    }
    for (const decisao of nc.DECISOES_QUE_LIBERAM) {
      const ctx = await ncDecidida(decisao);
      const doc = await nc.obterNaoConformidade(db, ctx.ncId);
      assert.strictEqual(doc.execucao_estado, nc.EXECUCAO_NAO_SE_APLICA,
        `${decisao} deveria nascer NAO_SE_APLICA, veio ${doc.execucao_estado}`);
    }
  });

  // ── (2) RN-03 + RN-09 — a baixa, e o rastro dela ───────────────────────────────────────────
  await test('(2) RN-03 executar DEVOLVER baixa dos DOIS lugares, com numero e motivo no livro', async () => {
    const ctx = await ncDecidida('DEVOLVER', { reprovada: 3, esperada: 10 });
    const antes = await saldos(ctx.materialId);
    assert.strictEqual(Number(antes.quantidade_atual), 10);
    assert.strictEqual(Number(antes.quantidade_bloqueada), 3);

    const res = await executar(ctx.ncId);

    assert.strictEqual(res.execucao.efeito, 'BAIXADA', JSON.stringify(res.execucao));
    assert.strictEqual(res.execucao.mensagem, '3 devolvido(s) ao fornecedor');
    assert.strictEqual(res.execucao.quantidade, 3);
    assert.strictEqual(res.execucao_estado, nc.EXECUCAO_EXECUTADA);
    assert.ok(res.execucao_em, 'execucao_em ficou vazio');
    assert.strictEqual(res.execucao_por_id, COMPRAS.id);
    assert.strictEqual(res.execucao_observacoes, 'coleta 442 da transportadora');

    const depois = await saldos(ctx.materialId);
    assert.strictEqual(Number(depois.quantidade_atual), 7, 'o fisico nao caiu exatamente 3');
    assert.strictEqual(Number(depois.quantidade_bloqueada), 0, 'o bloqueado nao caiu exatamente 3');

    const movs = await movimentacoesDe(ctx.materialId);
    const dev = movs.filter((m) => m.tipo === 'DEVOLUCAO_FORNECEDOR');
    assert.strictEqual(dev.length, 1, `esperava 1 devolucao, veio ${JSON.stringify(movs)}`);
    assert.strictEqual(Number(dev[0].quantidade), 3);
    assert.strictEqual(dev[0].motivo, 'Devolução ao fornecedor');
    assert.strictEqual(dev[0].documento_vinculado, ctx.numero, 'a movimentacao nao cita a NC');
    assert.strictEqual(Number(dev[0].recebimento_id), ctx.recebimentoId);
    assert.strictEqual(Number(res.execucao_movimentacao_id), Number(dev[0].id),
      'a NC nao guardou o elo com a linha do livro');

    const insp = await inspecaoDe(ctx.inspecaoId);
    assert.ok(insp.devolucao_fornecedor_em, 'a inspecao nao foi carimbada');
  });

  // ── (3) RN-05 nivel DOCUMENTO ──────────────────────────────────────────────────────────────
  await test('(3) RN-05 a segunda execucao da MESMA NC e 409 e nao move saldo', async () => {
    const ctx = await ncDecidida('DEVOLVER', { reprovada: 2, esperada: 8 });
    await executar(ctx.ncId);
    const antes = await saldos(ctx.materialId);

    const e = await erroDe(() => executar(ctx.ncId));
    assert.ok(e, 'a segunda execucao passou');
    assert.strictEqual(e.status, 409);
    assert.strictEqual(e.message, 'A execução desta não conformidade já foi registrada');

    const depois = await saldos(ctx.materialId);
    assert.strictEqual(Number(depois.quantidade_atual), Number(antes.quantidade_atual));
    assert.strictEqual(Number(depois.quantidade_bloqueada), Number(antes.quantidade_bloqueada));
  });

  // ── (4) RN-07 — so NC decidida ─────────────────────────────────────────────────────────────
  await test('(4) RN-07 NC ABERTA e NC CANCELADA recusam com 400, cada uma com a SUA literal', async () => {
    const ctx = await novaInspecaoReprovada({ reprovada: 3 });
    const aberta = await ncAutomatica(ctx.inspecaoId);
    const e1 = await erroDe(() => executar(aberta.id));
    assert.ok(e1, 'executou uma NC ABERTA');
    assert.strictEqual(e1.status, 400);
    assert.strictEqual(e1.message, 'Só é possível registrar a execução de uma não conformidade decidida');

    await dbRun(db, `UPDATE nao_conformidades_almoxarifado
      SET status = 'CANCELADA', cancelado_em = CURRENT_TIMESTAMP WHERE id = ?`, [aberta.id]);
    const e2 = await erroDe(() => executar(aberta.id));
    assert.ok(e2, 'executou uma NC CANCELADA');
    assert.strictEqual(e2.status, 400, 'o CODIGO do contrato da Etapa 45 mudou');
    // ⚠️ A LITERAL DESTE SEGUNDO CASO MUDOU NA ETAPA 46, e o codigo NAO. Ela dizia
    // ~~'So e possivel registrar a execucao de uma nao conformidade decidida'~~ — a mesma do
    // primeiro caso —, e uma lente da Fase 5 da 46 mediu que isso engana: depois que o
    // cancelamento humano existe, o documento CANCELADO tipicamente FOI decidido (a decisao fica
    // gravada e legivel), e a frase mandava decidir o que ja estava decidido. O nivel 2 da
    // precedencia passou a distinguir os dois estados.
    //
    // Este cenario forja o estado por `UPDATE` cru sobre uma NC NUNCA decidida, entao aqui a
    // frase antiga era tecnicamente verdadeira — e e justamente por isso que ele nao pegava o
    // problema. O caso real (cancelada DEPOIS de decidida) esta em `ncCancelamento.api.test.js`.
    assert.strictEqual(e2.message, 'Esta não conformidade foi cancelada — não há execução a registrar');
  });

  // ── (5) RN-01 — a decisao de aceitacao nao tem execucao ────────────────────────────────────
  await test('(5) RN-01 decisao de ACEITACAO recusa com 400: nao ha execucao a registrar', async () => {
    for (const decisao of nc.DECISOES_QUE_LIBERAM) {
      const ctx = await ncDecidida(decisao, { reprovada: 3, esperada: 10 });
      const e = await erroDe(() => executar(ctx.ncId));
      assert.ok(e, `${decisao} aceitou registrar execucao`);
      assert.strictEqual(e.status, 400);
      assert.strictEqual(e.message, 'Esta decisão não tem execução a registrar');
    }
  });

  // ── (6) RN-06 — a porta lateral, e a razao da concessao a COMPRAS ──────────────────────────
  await test('(6) RN-06 NC aberta A MAO sobre inspecao NAO baixa saldo — e COMPRAS e quem tenta', async () => {
    const ctx = await novaInspecaoReprovada({ reprovada: 3, esperada: 10 });
    // Exatamente o ataque que a RN-06 fecha: COMPRAS tem `registrar_nao_conformidade` e abre uma
    // NC a mao apontando para uma inspecao que ele nao decidiu.
    const manual = await nc.abrirNaoConformidadeManual(db, COMPRAS, {
      origem: 'INSPECAO', referencia_tipo: 'INSPECAO', referencia_id: ctx.inspecaoId, tipo: 'OUTRO',
      descricao: 'aberta a mao',
    });
    await decidir(manual.id, 'DEVOLVER');
    const antes = await saldos(ctx.materialId);

    const res = await executar(manual.id, COMPRAS);

    assert.strictEqual(res.execucao.efeito, 'NENHUMA', JSON.stringify(res.execucao));
    assert.strictEqual(res.execucao.mensagem,
      'Só a não conformidade aberta pela reprovação da inspeção devolve material');
    // A execucao FICA registrada (o documento fecha); o que nao acontece e a baixa.
    assert.strictEqual(res.execucao_estado, nc.EXECUCAO_EXECUTADA);

    const depois = await saldos(ctx.materialId);
    assert.strictEqual(Number(depois.quantidade_atual), Number(antes.quantidade_atual),
      'a NC manual mexeu no fisico');
    assert.strictEqual(Number(depois.quantidade_bloqueada), Number(antes.quantidade_bloqueada),
      'a NC manual mexeu no bloqueado');
    const insp = await inspecaoDe(ctx.inspecaoId);
    assert.strictEqual(insp.devolucao_fornecedor_em, null,
      'a NC manual carimbou a inspecao — e trancaria a devolucao legitima');
    assert.strictEqual((await movimentacoesDe(ctx.materialId)).length, 0);
  });

  // ── (7) RN-06 — o caso MAIS COMUM: NC automatica de origem RECEBIMENTO ─────────────────────
  await test('(7) RN-06 NC AUTOMATICA de origem RECEBIMENTO tambem nao baixa saldo', async () => {
    const ctx = await novaInspecaoReprovada({ reprovada: 3, esperada: 10 });
    // Automatica de verdade (`aberto_automaticamente: 1`), so que de origem RECEBIMENTO — e a que
    // o gancho da conferencia abre quando a quantidade diverge. Sem a clausula de ORIGEM na RN-06
    // este cenario baixaria saldo, porque a clausula de "aberta a mao" nao o pega.
    const doc = await nc.abrirNaoConformidade(db, ADMIN, {
      origem: 'RECEBIMENTO', referencia_tipo: 'RECEBIMENTO_ITEM', referencia_id: ctx.itemId,
      tipo: 'QUANTIDADE', aberto_automaticamente: 1, descricao: 'faltou na conferencia',
    });
    await decidir(doc.id, 'DEVOLVER');
    const antes = await saldos(ctx.materialId);

    const res = await executar(doc.id);

    assert.strictEqual(res.execucao.efeito, 'NENHUMA');
    assert.strictEqual(res.execucao.mensagem,
      'Só a não conformidade aberta pela reprovação da inspeção devolve material');
    const depois = await saldos(ctx.materialId);
    assert.strictEqual(Number(depois.quantidade_atual), Number(antes.quantidade_atual));
    assert.strictEqual(Number(depois.quantidade_bloqueada), Number(antes.quantidade_bloqueada));
  });

  // ── (8) RN-05 nivel SALDO — a trava que mora na INSPECAO ───────────────────────────────────
  await test('(8) RN-05 duas NCs de TIPOS diferentes da MESMA inspecao: a segunda e JA_DEVOLVIDA', async () => {
    // `bloqueioDeOutraOrigem: 5` e o coracao do cenario: sem ele, quem barraria a segunda baixa
    // seria o teto do motor ("Devolucao acima do que esta bloqueado"), e o teste estaria medindo o
    // motor enquanto afirma medir a idempotencia desta etapa.
    const ctx = await novaInspecaoReprovada({ reprovada: 3, esperada: 20, bloqueioDeOutraOrigem: 5 });
    const primeira = await ncAutomatica(ctx.inspecaoId);
    const segunda = await nc.abrirNaoConformidade(db, QUALIDADE, {
      origem: 'INSPECAO', referencia_tipo: 'INSPECAO', referencia_id: ctx.inspecaoId,
      tipo: 'DANO_FISICO', aberto_automaticamente: 1, descricao: 'segunda causa, mesma inspecao',
    });
    assert.ok(segunda && segunda.id !== primeira.id, 'a segunda NC da mesma inspecao nao abriu');
    await decidir(primeira.id, 'DEVOLVER');
    await decidir(segunda.id, 'DEVOLVER');

    await executar(primeira.id);
    const meio = await saldos(ctx.materialId);
    assert.strictEqual(Number(meio.quantidade_atual), 17);
    assert.strictEqual(Number(meio.quantidade_bloqueada), 5, 'a primeira baixa nao tirou exatamente 3');

    const res = await executar(segunda.id);
    assert.strictEqual(res.execucao.efeito, 'JA_DEVOLVIDA', JSON.stringify(res.execucao));
    assert.strictEqual(res.execucao.mensagem, 'O material desta inspeção já havia sido devolvido');
    assert.strictEqual(res.execucao_estado, nc.EXECUCAO_EXECUTADA,
      'a segunda NC ficou sem fechar — o documento tem de encerrar mesmo sem mover saldo');

    const fim = await saldos(ctx.materialId);
    // IGUALDADE EXATA, nunca `<=`: a baixa em dobro deixaria 14/2 e um `<=` passaria verde.
    assert.strictEqual(Number(fim.quantidade_atual), 17, 'a segunda NC baixou o fisico de novo');
    assert.strictEqual(Number(fim.quantidade_bloqueada), 5, 'a segunda NC baixou o bloqueado de novo');
    assert.strictEqual((await movimentacoesDe(ctx.materialId))
      .filter((m) => m.tipo === 'DEVOLUCAO_FORNECEDOR').length, 1,
    'nasceu uma segunda linha de devolucao no livro');
  });

  // ── (9) RN-04 — as outras tres registram sem mover ─────────────────────────────────────────
  await test('(9) RN-04 SUBSTITUICAO, ANALISE_ENGENHARIA e SUCATEAR registram autor e data sem mover saldo', async () => {
    for (const decisao of ['SUBSTITUICAO', 'ANALISE_ENGENHARIA', 'SUCATEAR']) {
      const ctx = await ncDecidida(decisao, { reprovada: 3, esperada: 10 });
      const antes = await saldos(ctx.materialId);
      const res = await executar(ctx.ncId);
      assert.strictEqual(res.execucao.efeito, 'NENHUMA', `${decisao}: ${JSON.stringify(res.execucao)}`);
      assert.strictEqual(res.execucao.mensagem, 'Esta execução não altera o saldo');
      assert.strictEqual(res.execucao_estado, nc.EXECUCAO_EXECUTADA);
      assert.strictEqual(res.execucao_por_id, COMPRAS.id, `${decisao} nao gravou o autor`);
      const depois = await saldos(ctx.materialId);
      assert.strictEqual(Number(depois.quantidade_atual), Number(antes.quantidade_atual), decisao);
      assert.strictEqual(Number(depois.quantidade_bloqueada), Number(antes.quantidade_bloqueada), decisao);
      const insp = await inspecaoDe(ctx.inspecaoId);
      assert.strictEqual(insp.devolucao_fornecedor_em, null,
        `${decisao} carimbou a inspecao e trancaria uma devolucao futura`);
    }
  });

  // ── (10) RN-11 — os tres estados conhecidos ────────────────────────────────────────────────
  await test('(10) RN-11 bloqueio drenado por fora registra sem mover, com literal propria', async () => {
    const ctx = await ncDecidida('DEVOLVER', { reprovada: 3, esperada: 10 });
    // O workaround que existia antes destas duas etapas: alguem desbloqueou na mao.
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 0 WHERE id = ?', [ctx.materialId]);
    const res = await executar(ctx.ncId);
    assert.strictEqual(res.execucao.efeito, 'SEM_SALDO');
    assert.strictEqual(res.execucao.mensagem,
      'O material já havia saído do bloqueio — a execução foi registrada sem mover saldo');
    assert.strictEqual(res.execucao_estado, nc.EXECUCAO_EXECUTADA,
      'o documento ficou preso — e o beco "atrasado para sempre" que a RN-11 existe para evitar');
    assert.strictEqual(Number((await saldos(ctx.materialId)).quantidade_atual), 10);
  });

  await test('(10b) RN-11 fisico insuficiente (bloqueada > atual) registra sem mover', async () => {
    const ctx = await ncDecidida('DEVOLVER', { reprovada: 3, esperada: 10, atual: 1 });
    const res = await executar(ctx.ncId);
    assert.strictEqual(res.execucao.efeito, 'SEM_SALDO');
    assert.strictEqual(res.execucao.mensagem,
      'Não há saldo físico deste material — a execução foi registrada sem mover saldo');
    const depois = await saldos(ctx.materialId);
    assert.strictEqual(Number(depois.quantidade_atual), 1, 'o fisico foi mexido');
    assert.strictEqual(Number(depois.quantidade_bloqueada), 3, 'o bloqueado foi mexido');
  });

  await test('(10c) RN-11 material inativo registra sem mover', async () => {
    const ctx = await ncDecidida('DEVOLVER', { reprovada: 3, esperada: 10 });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [ctx.materialId]);
    const res = await executar(ctx.ncId);
    assert.strictEqual(res.execucao.efeito, 'SEM_SALDO');
    assert.strictEqual(res.execucao.mensagem,
      'Material inativo — a execução foi registrada sem mover saldo');
    assert.strictEqual(Number((await saldos(ctx.materialId)).quantidade_bloqueada), 3);
  });

  // ── (11) RN-12 — o lote e resolvido e DEBITADO ─────────────────────────────────────────────
  await test('(11) RN-12 a devolucao debita a LINHA DO LOTE, e a linha de lote NULL nao negativa', async () => {
    const mat = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_bloqueada, ativo, controle_lote)
      VALUES (?,?,'KG',0,0,1,1)`, [uniq('MAT-E45LOTE'), 'Chapa com lote']);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat.lastID, codigo: uniq('L45') });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat.lastID, tipo: 'ENTRADA_COMPRA', quantidade: 10, lote_id: lote.id,
      motivo: 'entrada do lote para o cenario', justificativa: 'setup',
    });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 3 WHERE id = ?', [mat.lastID]);

    const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal) VALUES (?,?,?)`, [uniq('REC-E45L'), 'RECEBIDO', uniq('NF')]);
    const item = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote_id, lote)
      VALUES (?,?,?,?,?,?)`, [rec.lastID, mat.lastID, 10, 10, lote.id, lote.codigo]);
    const insp = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
      (recebimento_item_id, conforme, quantidade_aprovada, quantidade_reprovada, responsavel_id, responsavel_nome)
      VALUES (?,0,7,3,?,?)`, [item.lastID, QUALIDADE.id, QUALIDADE.nome]);

    const doc = await ncAutomatica(insp.lastID);
    await decidir(doc.id, 'DEVOLVER');
    const res = await executar(doc.id);

    assert.strictEqual(res.execucao.efeito, 'BAIXADA', JSON.stringify(res.execucao));
    assert.strictEqual(Number(res.execucao.lote_id), Number(lote.id), 'o lote nao chegou ao motor');

    const linhas = await dbAll(db, `SELECT lote_id, quantidade FROM estoque_saldo_almoxarifado
      WHERE material_id = ?`, [mat.lastID]);
    const doLote = linhas.filter((l) => Number(l.lote_id) === Number(lote.id));
    assert.strictEqual(doLote.length, 1, `esperava 1 linha do lote, veio ${JSON.stringify(linhas)}`);
    assert.strictEqual(Number(doLote[0].quantidade), 7, 'a linha do lote nao caiu de 10 para 7');
    for (const l of linhas.filter((x) => x.lote_id == null)) {
      assert.ok(Number(l.quantidade) >= 0,
        `a linha de lote NULL ficou NEGATIVA (${l.quantidade}) — o debito caiu no lugar errado`);
    }
    const mov = (await movimentacoesDe(mat.lastID)).find((m) => m.tipo === 'DEVOLUCAO_FORNECEDOR');
    assert.strictEqual(Number(mov.lote_id), Number(lote.id), 'o livro nao registrou o lote');
  });

  await test('(12) RN-12 controle_lote sem lote resolvivel RECUSA com literal propria', async () => {
    const ctx = await ncDecidida('DEVOLVER', { reprovada: 3, esperada: 10, controleLote: 1 });
    const e = await erroDe(() => executar(ctx.ncId));
    assert.ok(e, 'devolveu material com controle de lote sem saber de qual lote');
    assert.strictEqual(e.status, 400);
    assert.strictEqual(e.message, 'Não foi possível identificar o lote do material devolvido');
    // A recusa e RECUSA de verdade: nada foi gravado.
    const doc = await nc.obterNaoConformidade(db, ctx.ncId);
    assert.strictEqual(doc.execucao_estado, nc.EXECUCAO_PENDENTE);
    assert.strictEqual(doc.execucao_em, null);
    assert.strictEqual(Number((await saldos(ctx.materialId)).quantidade_bloqueada), 3);
  });

  // ── (13) RN-13 — serie ─────────────────────────────────────────────────────────────────────
  await test('(13) RN-13 material com controle de serie recusa, e o documento fica PENDENTE', async () => {
    const ctx = await ncDecidida('DEVOLVER', { reprovada: 3, esperada: 10, controleSerie: 1 });
    const e = await erroDe(() => executar(ctx.ncId));
    assert.ok(e, 'devolveu material com controle de serie');
    assert.strictEqual(e.status, 400);
    assert.strictEqual(e.message,
      'Material com controle de série não pode ser devolvido por aqui — dê baixa pela tela de Movimentações');
    const doc = await nc.obterNaoConformidade(db, ctx.ncId);
    assert.strictEqual(doc.execucao_estado, nc.EXECUCAO_PENDENTE,
      'a recusa por serie fechou o documento — ele tem de continuar na fila');
  });

  // ── (14) o rollback ────────────────────────────────────────────────────────────────────────
  await test('(14) o motor falhou: estado ANTERIOR com igualdade EXATA, e a NC volta a PENDENTE', async () => {
    const ctx = await ncDecidida('DEVOLVER', { reprovada: 3, esperada: 10 });
    const antes = await saldos(ctx.materialId);

    const original = stockService.registrarMovimentacao;
    stockService.registrarMovimentacao = async () => {
      throw Object.assign(new Error('motor caiu no meio'), { status: 500 });
    };
    let e;
    try {
      e = await erroDe(() => executar(ctx.ncId));
    } finally {
      stockService.registrarMovimentacao = original;
    }

    assert.ok(e, 'a falha do motor nao subiu');
    assert.strictEqual(e.message, 'motor caiu no meio');

    const depois = await saldos(ctx.materialId);
    // `===`, nunca `>=`: a compensacao em DOBRO (CRITICAL 2 da Fase 2) deixaria bloqueada em 6 e
    // um `>=` chamaria isso de sucesso.
    assert.strictEqual(Number(depois.quantidade_atual), Number(antes.quantidade_atual));
    assert.strictEqual(Number(depois.quantidade_bloqueada), Number(antes.quantidade_bloqueada));

    const insp = await inspecaoDe(ctx.inspecaoId);
    assert.strictEqual(insp.devolucao_fornecedor_em, null,
      'o claim da inspecao ficou orfao — a devolucao seguinte diria "ja devolvido" com o material aqui');

    const doc = await nc.obterNaoConformidade(db, ctx.ncId);
    assert.strictEqual(doc.execucao_estado, nc.EXECUCAO_PENDENTE, 'a NC nao voltou para a fila');
    assert.strictEqual(doc.execucao_em, null);
    assert.strictEqual(doc.execucao_por_id, null);
    // E a DECISAO continua de pe — a diferenca deliberada em relacao a Etapa 44.
    assert.strictEqual(doc.status, 'DECIDIDA', 'o rollback desfez a decisao, que era de outra pessoa');
    assert.strictEqual(doc.decisao, 'DEVOLVER');

    // E a prova de que o estado voltou USAVEL: executar de novo agora funciona.
    const ok = await executar(ctx.ncId);
    assert.strictEqual(ok.execucao.efeito, 'BAIXADA', JSON.stringify(ok.execucao));
    assert.strictEqual(Number((await saldos(ctx.materialId)).quantidade_bloqueada), 0);
  });

  // ── (15) a trilha ──────────────────────────────────────────────────────────────────────────
  await test('(15) RN-09 a trilha grava NC_EXECUTADA — verbo proprio, nao NC_DECIDIDA disfarcado', async () => {
    const ctx = await ncDecidida('DEVOLVER', { reprovada: 2, esperada: 8 });
    await executar(ctx.ncId, QUALIDADE, 'devolvido pela coleta de sexta');
    const linhas = await dbAll(db, `SELECT acao, usuario_id, dados_novos, justificativa
      FROM auditoria_log_almoxarifado WHERE entidade = 'nao_conformidade' AND entidade_id = ?
      ORDER BY id`, [ctx.ncId]);
    const exec = linhas.filter((l) => l.acao === 'NC_EXECUTADA');
    assert.strictEqual(exec.length, 1, `esperava 1 NC_EXECUTADA, veio ${JSON.stringify(linhas.map((l) => l.acao))}`);
    assert.strictEqual(Number(exec[0].usuario_id), QUALIDADE.id);
    assert.strictEqual(exec[0].justificativa, 'devolvido pela coleta de sexta');
    const dados = JSON.parse(exec[0].dados_novos);
    assert.strictEqual(dados.efeito_saldo, 'BAIXADA');
    assert.strictEqual(dados.quantidade, 2);
    assert.ok(dados.movimentacao_id, 'a trilha nao aponta a linha do livro');
  });

  // ── (17) a (20) — O FIX-ROUND DA FASE 5 ────────────────────────────────────────────────────

  await test('(17) CRITICAL do epsilon: duas reprovacoes fracionarias, e a SEGUNDA devolucao acontece', async () => {
    // ⚠️ O CENARIO QUE A ETAPA INTEIRA NAO TINHA. Os arquivos desta etapa nasceram com ZERO
    // literais fracionarios de quantidade, num modulo cuja unidade e KG — entao `3` e `10`
    // escondiam a classe de defeito que o proprio modulo tem dono unico para tratar
    // (`divergencia.js`). Reproduzido pela revisao adversarial com operacao normal.
    //
    // 2.3 + 3.4 = 5.699999999999999 em IEEE-754. Depois de devolver 2.3 sobram
    // 3.3999999999999995, e `3.3999999999999995 < 3.4` e VERDADE: a segunda devolucao respondia
    // 200 com "o material ja havia saido do bloqueio" tendo o COMPRAS acabado de despachar.
    const mat = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_bloqueada, ativo) VALUES (?,?,'KG',20,0,1)`,
      [uniq('MAT-E45EPS'), 'Chapa fracionada']);
    const materialId = mat.lastID;

    const ncsFracionarias = [];
    for (const reprovada of [2.3, 3.4]) {
      const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
        (numero, status, nota_fiscal) VALUES (?,'RECEBIDO',?)`, [uniq('REC-EPS'), uniq('NF')]);
      const item = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,10,10)`,
        [rec.lastID, materialId]);
      const insp = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
        (recebimento_item_id, conforme, quantidade_aprovada, quantidade_reprovada) VALUES (?,0,?,?)`,
        [item.lastID, 10 - reprovada, reprovada]);
      // O bloqueio somado do jeito que o motor soma — e o que produz o residuo.
      await dbRun(db, `UPDATE materiais_almoxarifado
        SET quantidade_bloqueada = COALESCE(quantidade_bloqueada,0) + ? WHERE id = ?`,
        [reprovada, materialId]);
      const doc = await ncAutomatica(insp.lastID);
      await decidir(doc.id, 'DEVOLVER');
      ncsFracionarias.push({ ncId: doc.id, reprovada });
    }

    // A guarda que prova que o cenario esta medindo o que diz: sem o residuo, ele passaria com
    // `<` cru e nao provaria nada.
    const antes = await saldos(materialId);
    assert.notStrictEqual(Number(antes.quantidade_bloqueada), 5.7,
      `o fixture nao produziu residuo de ponto flutuante (veio ${antes.quantidade_bloqueada}) — `
      + 'sem residuo este cenario passa com `<` cru e nao mede nada');

    const r1 = await executar(ncsFracionarias[0].ncId);
    assert.strictEqual(r1.execucao.efeito, 'BAIXADA', JSON.stringify(r1.execucao));

    const r2 = await executar(ncsFracionarias[1].ncId);
    assert.strictEqual(r2.execucao.efeito, 'BAIXADA',
      `a segunda devolucao virou ${r2.execucao.efeito}: ${r2.execucao.mensagem}`);

    const depois = await saldos(materialId);
    assert.ok(Math.abs(Number(depois.quantidade_atual) - 14.3) < 1e-9,
      `o fisico deveria ser 14.3, veio ${depois.quantidade_atual}`);
    assert.ok(Math.abs(Number(depois.quantidade_bloqueada)) < 1e-9,
      `o bloqueado deveria zerar, veio ${depois.quantidade_bloqueada}`);
  });

  await test('(18) a POSICAO do teto fisico: recebi 3, reprovei 3, devolvo os 3', async () => {
    // Achado de revisao: nenhum fixture devolvia o fisico INTEIRO, entao trocar `quantidade_atual
    // >= ?` por `> ?` no claim do motor deixava as 45 assercoes da etapa verdes — e o caso
    // natural "chegou 3, reprovei os 3" passava a ser recusado, com o documento travando em
    // PENDENTE. E a licao da Etapa 27: o que o teste ancora e ONDE a regua esta, nao o sinal.
    const ctx = await ncDecidida('DEVOLVER', { reprovada: 3, esperada: 3, atual: 3 });
    const res = await executar(ctx.ncId);
    assert.strictEqual(res.execucao.efeito, 'BAIXADA', JSON.stringify(res.execucao));
    const depois = await saldos(ctx.materialId);
    assert.strictEqual(Number(depois.quantidade_atual), 0, 'o fisico nao zerou');
    assert.strictEqual(Number(depois.quantidade_bloqueada), 0, 'o bloqueado nao zerou');
  });

  await test('(19) o pool AGREGADO: a inspecao ja liberada nao baixa contra a retencao alheia', async () => {
    // ⚠️ O caso B175/C63 da Etapa 44: duas NCs da MESMA inspecao com decisoes OPOSTAS. A de
    // aceitacao solta os 3 kg; a de devolucao, executada depois, encontrava o pool com 5 kg de
    // OUTRA inspecao e baixava 3 contra eles — material que ninguem devolveu sumindo do fisico,
    // com mensagem de sucesso.
    const ctx = await novaInspecaoReprovada({ reprovada: 3, esperada: 20, bloqueioDeOutraOrigem: 5 });
    const aceita = await ncAutomatica(ctx.inspecaoId);
    const devolve = await nc.abrirNaoConformidade(db, QUALIDADE, {
      origem: 'INSPECAO', referencia_tipo: 'INSPECAO', referencia_id: ctx.inspecaoId,
      tipo: 'DANO_FISICO', aberto_automaticamente: 1, descricao: 'segunda causa',
    });
    await decidir(aceita.id, 'ACEITAR');
    await decidir(devolve.id, 'DEVOLVER');

    const antes = await saldos(ctx.materialId);
    // A metade positiva: a aceitacao REALMENTE soltou os 3 — sem isto o cenario passaria com a
    // liberacao quebrada, medindo o nada.
    assert.strictEqual(Number(antes.quantidade_bloqueada), 5,
      'a aceitacao nao liberou os 3 — o cenario nao chegou ao estado que quer medir');

    const res = await executar(devolve.id);

    // ⚠️ AS ASSERCOES DE SALDO VEM PRIMEIRO, E A ORDEM E DELIBERADA. Com o `efeito` na frente, a
    // sabotagem que desliga a guarda derrubava o cenario por ele e as de saldo NUNCA rodavam —
    // o mesmo tropeco que esta etapa ja cometeu tres vezes. Aqui o DANO e o saldo: material que
    // ninguem devolveu sumindo do fisico e retencao alheia sendo comida.
    const depois = await saldos(ctx.materialId);
    assert.strictEqual(Number(depois.quantidade_atual), Number(antes.quantidade_atual),
      'baixou o fisico contra a retencao de OUTRA inspecao — material que ninguem devolveu sumiu');
    assert.strictEqual(Number(depois.quantidade_bloqueada), 5,
      'comeu a retencao da outra inspecao');

    assert.strictEqual(res.execucao.efeito, 'SEM_SALDO', JSON.stringify(res.execucao));
    assert.strictEqual(res.execucao.mensagem,
      'O material desta inspeção já havia sido liberado por outra não conformidade — a execução foi registrada sem mover saldo');
  });

  await test('(19b) o chamador passa AS DUAS trancas ao motor (exigeLote E exigeSerie)', async () => {
    // ⚠️ O cenario (9) de `devolucaoFornecedorMotor` prova que o MOTOR honra `exigeSerie`. Ele
    // NAO prova que este chamador a passa — e era exatamente essa a falta que a revisao achou:
    // `exigeLote` estava la e `exigeSerie` nao, apesar de o comentario ao lado declarar o
    // principio para as duas.
    //
    // A tranca e defesa em profundidade: o nivel 6 da precedencia recusa ANTES, entao nenhum
    // caminho normal a alcanca e nenhuma sabotagem no codigo de producao a derruba. E o caso
    // "defeito inalcancavel" da skill: em vez de remover a protecao porque nada cai, mede-se o
    // que ela E — o argumento que sai daqui — em vez do que ela impede.
    let opcoesVistas = null;
    const original = stockService.registrarMovimentacao;
    stockService.registrarMovimentacao = async (...args) => {
      opcoesVistas = args[3];
      return original.apply(null, args);
    };
    try {
      const ctx = await ncDecidida('DEVOLVER', { reprovada: 3, esperada: 10 });
      const res = await executar(ctx.ncId);
      assert.strictEqual(res.execucao.efeito, 'BAIXADA', JSON.stringify(res.execucao));
    } finally {
      stockService.registrarMovimentacao = original;
    }
    assert.ok(opcoesVistas, 'o motor nao chegou a ser chamado — o cenario nao mediu nada');
    assert.strictEqual(opcoesVistas.exigeLote, true, 'a tranca do lote (RN-12) nao chega ao motor');
    assert.strictEqual(opcoesVistas.exigeSerie, true, 'a tranca da serie (RN-13) nao chega ao motor');
  });

  await test('(20) a literal de "sem reprovada" tem cenario — era a unica das 14 sem nenhum', async () => {
    // Achado MENOR da revisao: esta literal nasceu no fix da T2 porque a tabela congelada do
    // design estava incompleta, e ficou sendo a unica sem teste. A decisao da inspecao e
    // REESCRIVEL, entao a reprovada pode virar zero depois de o documento existir.
    const ctx = await ncDecidida('DEVOLVER', { reprovada: 3, esperada: 10 });
    await dbRun(db, `UPDATE inspecoes_recebimento_almoxarifado
      SET quantidade_reprovada = 0, quantidade_aprovada = 10 WHERE id = ?`, [ctx.inspecaoId]);
    const res = await executar(ctx.ncId);
    assert.strictEqual(res.execucao.efeito, 'SEM_SALDO', JSON.stringify(res.execucao));
    assert.strictEqual(res.execucao.mensagem,
      'Esta não conformidade não tem material reprovado para devolver');
    assert.strictEqual(Number((await saldos(ctx.materialId)).quantidade_bloqueada), 3);
  });

  // ── (16) o backfill — POR ULTIMO, porque mexe no ledger ────────────────────────────────────
  await test('(16) o backfill da estado a NC ja decidida, e NAO rebaixa uma EXECUTADA', async () => {
    const pendente = await ncDecidida('DEVOLVER', { reprovada: 3, esperada: 10 });
    const aceita = await ncDecidida('ACEITAR', { reprovada: 3, esperada: 10 });
    const executada = await ncDecidida('SUCATEAR', { reprovada: 1, esperada: 5 });
    await executar(executada.ncId);

    // Simula "estas NCs ja estavam decididas no dia do deploy": o estado ainda nao existia.
    await dbRun(db, 'UPDATE nao_conformidades_almoxarifado SET execucao_estado = NULL WHERE id IN (?,?)',
      [pendente.ncId, aceita.ncId]);
    await dbRun(db, 'DELETE FROM schema_migrations_almoxarifado WHERE id = ?', ['backfill_execucao_estado_nc']);

    await migrateBackfillExecucaoEstadoNc(db);

    assert.strictEqual((await nc.obterNaoConformidade(db, pendente.ncId)).execucao_estado,
      nc.EXECUCAO_PENDENTE, 'a NC de DEVOLVER nao entrou na fila');
    assert.strictEqual((await nc.obterNaoConformidade(db, aceita.ncId)).execucao_estado,
      nc.EXECUCAO_NAO_SE_APLICA, 'a decisao de aceitacao foi parar na fila de execucao');
    // A metade que prova que re-executar e inofensivo — o oposto do backfill da Etapa 44.
    const jaFeita = await nc.obterNaoConformidade(db, executada.ncId);
    assert.strictEqual(jaFeita.execucao_estado, nc.EXECUCAO_EXECUTADA,
      'o backfill rebaixou uma execucao ja registrada de volta para PENDENTE');
    assert.ok(jaFeita.execucao_em, 'o backfill apagou a data da execucao');

    const led = await dbGet(db, 'SELECT 1 as ok FROM schema_migrations_almoxarifado WHERE id = ?',
      ['backfill_execucao_estado_nc']);
    assert.ok(led, 'o backfill nao registrou no ledger');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
