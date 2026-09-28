/**
 * Etapa 44, T1 — a DECISAO DA NAO CONFORMIDADE EXECUTA NO SALDO (`nonConformityService.js`).
 *
 * Plano:  docs/superpowers/plans/2026-09-28-almoxarifado-etapa44-qualidade-executa-decisao.md (T1)
 * Design: docs/superpowers/specs/2026-09-28-almoxarifado-etapa44-qualidade-executa-decisao-design.md
 *
 * Fecha o furo C57: ate aqui a QUALIDADE decidia `ACEITAR_SOB_DESVIO`, assinava e justificava, e
 * o material continuava em `quantidade_bloqueada` — quem desbloqueia e uma rota gateada por
 * `ajustar_estoque`, que nao inclui QUALIDADE. O documento dizia uma coisa e o saldo dizia outra.
 *
 * ── O QUE CADA CENARIO PRENDE ────────────────────────────────────────────────────────────────
 *   (1)  RN-01: `ACEITAR` em NC automatica de inspecao libera a reprovada, exatamente
 *   (2)  RN-01: `ACEITAR_SOB_DESVIO` libera igual — e o caso literal do C57
 *   (3)  RN-04: `DEVOLVER` grava a decisao e NAO mexe no bloqueado
 *   (4)  RN-04: `SUCATEAR` idem
 *   (5)  RN-05: NC de origem RECEBIMENTO decidida `ACEITAR` => SEM_BLOQUEIO
 *   (6)  RN-06: inspecao com reprovada 0 => SEM_BLOQUEIO
 *   (7)  RN-03: DUAS NCs da mesma inspecao — a segunda e JA_LIBERADA e NAO libera de novo
 *   (8)  RN-02: a liberacao e FATAL — falhou, a decisao NAO fica gravada
 *   (9)  a movimentacao nasce com `documento_vinculado` e o motivo proprio
 *   (10) RN-06 da Etapa 43: decidir a MESMA NC duas vezes continua 409 (regressao)
 *   (11) RN-09: NC aberta A MAO sobre inspecao NAO libera — a porta lateral CRITICAL da Fase 2
 *   (12) RN-03: o BACKFILL — inspecao anterior a migracao nunca libera
 *   (13) RN-10: material inativo nao tranca o documento
 *
 * ── GUARDA ANTI-TESTE-VAZIO ──────────────────────────────────────────────────────────────────
 * Todo cenario que afirma "o bloqueado NAO caiu" mede o bloqueado ANTES e DEPOIS e afirma o valor
 * exato, nunca "nao mudou" — e nos cenarios (7), (11) e (12) o material tem bloqueio de OUTRA
 * ORIGEM alem da reprovada, de proposito: com `bloqueada` igual a reprovada, quem barra a segunda
 * liberacao e o TETO DO MOTOR (`Quantidade bloqueada insuficiente`), nao a trava desta etapa — o
 * cenario mediria o motor e chamaria isso de idempotencia. Foi achado da Fase 2.
 *
 * Executar: cd server && node tests/api/naoConformidadeLiberacao.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const nc = require('../../services/almoxarifado/nonConformityService');


let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 44, nome: 'Admin Etapa44', role: 'admin', is_superadmin: 1, email: 'e44@test.com' };
const QUALIDADE = { id: 441, nome: 'Fulana Qualidade', perfil_almoxarifado: 'QUALIDADE', email: 'q44@test.com' };

let seq = 0;
const uniq = (p) => `${p}-${Date.now() % 1000000}-${++seq}`;

async function erroDe(fn) {
  try { await fn(); return null; } catch (e) { return { message: e.message, status: e.status }; }
}

(async () => {
  console.log('\n=== Etapa 44 T1: a decisao da NC executa no saldo ===\n');
  const { db, close } = await createTestApp({ user: { ...ADMIN } });

  const bloqueadaDe = async (materialId) => {
    const m = await dbGet(db, 'SELECT quantidade_bloqueada FROM materiais_almoxarifado WHERE id = ?', [materialId]);
    return Number(m.quantidade_bloqueada) || 0;
  };

  /**
   * Uma inspecao ja DECIDIDA com reprovacao, e o bloqueio correspondente no pool do material.
   * `bloqueioDeOutraOrigem` soma ao pool sem lastro em inspecao nenhuma — e o que simula o
   * bloqueio avulso de inventario que faz a diferenca nos cenarios (7), (11) e (12).
   */
  async function novaInspecaoReprovada({ reprovada = 3, esperada = 10, bloqueioDeOutraOrigem = 0, ativo = 1 } = {}) {
    const mat = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_bloqueada, ativo) VALUES (?,?,?,?,?,?)`,
      [uniq('MAT-E44'), 'Material da Etapa 44', 'KG', esperada, reprovada + bloqueioDeOutraOrigem, ativo]);
    const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal) VALUES (?,?,?)`, [uniq('REC-E44'), 'RECEBIDO', uniq('NF')]);
    const item = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`,
      [rec.lastID, mat.lastID, esperada, esperada]);
    const insp = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
      (recebimento_item_id, conforme, quantidade_aprovada, quantidade_reprovada, responsavel_id, responsavel_nome)
      VALUES (?,?,?,?,?,?)`,
      [item.lastID, reprovada > 0 ? 0 : 1, esperada - reprovada, reprovada, QUALIDADE.id, QUALIDADE.nome]);
    return {
      materialId: mat.lastID, recebimentoId: rec.lastID, itemId: item.lastID, inspecaoId: insp.lastID,
    };
  }

  /** A NC que o gancho da Etapa 43 abre sozinho quando a inspecao reprova. */
  const ncAutomatica = (inspecaoId) => nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, inspecaoId);

  const decidir = (id, decisao, user = QUALIDADE) =>
    nc.decidirNaoConformidade(db, user, id, { decisao, justificativa: 'analise da engenharia anexa' });

  const movimentacoesDe = (materialId) => dbAll(db,
    `SELECT tipo, quantidade, motivo, documento_vinculado FROM movimentacoes_almoxarifado
     WHERE material_id = ? ORDER BY id`, [materialId]);

  const liberacaoDaInspecao = async (inspecaoId) => {
    const i = await dbGet(db, 'SELECT liberacao_nc_em FROM inspecoes_recebimento_almoxarifado WHERE id = ?', [inspecaoId]);
    return i.liberacao_nc_em;
  };

  // ── (1) e (2) — as duas decisoes que liberam ───────────────────────────────────────────────
  for (const decisao of ['ACEITAR', 'ACEITAR_SOB_DESVIO']) {
    await test(`(${decisao === 'ACEITAR' ? 1 : 2}) RN-01 ${decisao} libera a reprovada, exatamente`, async () => {
      const f = await novaInspecaoReprovada({ reprovada: 3, bloqueioDeOutraOrigem: 10 });
      const doc = await ncAutomatica(f.inspecaoId);
      assert.ok(doc && doc.id, 'o gancho da Etapa 43 nao abriu a NC — o fixture esta errado');
      assert.strictEqual(await bloqueadaDe(f.materialId), 13, 'o fixture nao bloqueou 3 + 10');

      const res = await decidir(doc.id, decisao);

      assert.strictEqual(res.liberacao.efeito, 'LIBERADA', `efeito ${res.liberacao.efeito}`);
      assert.strictEqual(res.liberacao.quantidade, 3, `quantidade ${res.liberacao.quantidade}`);
      assert.strictEqual(res.liberacao.material_id, f.materialId, 'material_id errado no efeito');
      assert.strictEqual(res.liberacao.mensagem, '3 liberado(s) do bloqueio', `mensagem: ${res.liberacao.mensagem}`);
      assert.strictEqual(res.status, 'DECIDIDA', `a NC ficou ${res.status}`);
      assert.strictEqual(res.decisao, decisao, `a decisao gravada foi ${res.decisao}`);
      // 13 - 3 = 10: caiu EXATAMENTE a reprovada, e o bloqueio de outra origem ficou intacto.
      assert.strictEqual(await bloqueadaDe(f.materialId), 10, 'o bloqueado nao caiu exatamente pela reprovada');
      assert.ok(await liberacaoDaInspecao(f.inspecaoId), 'a inspecao nao foi carimbada como liberada');
    });
  }

  // ── (3) e (4) — as decisoes que so marcam intencao ─────────────────────────────────────────
  for (const [n, decisao] of [[3, 'DEVOLVER'], [4, 'SUCATEAR']]) {
    await test(`(${n}) RN-04 ${decisao} grava a decisao e NAO mexe no bloqueado`, async () => {
      const f = await novaInspecaoReprovada({ reprovada: 3 });
      const doc = await ncAutomatica(f.inspecaoId);
      const res = await decidir(doc.id, decisao);

      assert.strictEqual(res.liberacao.efeito, 'NENHUMA', `efeito ${res.liberacao.efeito}`);
      assert.strictEqual(res.liberacao.mensagem, 'Esta decisão não altera o saldo', `mensagem: ${res.liberacao.mensagem}`);
      assert.strictEqual(res.liberacao.quantidade, null, 'quantidade devia ser null quando nao libera');
      assert.strictEqual(res.liberacao.material_id, null, 'material_id devia ser null quando nao libera');
      // A metade POSITIVA: a decisao FOI gravada. Sem ela, "o bloqueado nao mudou" passaria
      // identico com o servico morto.
      assert.strictEqual(res.status, 'DECIDIDA', `a NC ficou ${res.status}`);
      assert.strictEqual(res.decisao, decisao, `a decisao gravada foi ${res.decisao}`);
      assert.strictEqual(await bloqueadaDe(f.materialId), 3, 'o bloqueado mudou numa decisao que nao libera');
      assert.strictEqual(await liberacaoDaInspecao(f.inspecaoId), null, 'a inspecao foi carimbada sem liberacao');
    });
  }

  // ── (5) — origem RECEBIMENTO nao tem bloqueio nenhum ───────────────────────────────────────
  await test('(5) RN-05 NC de origem RECEBIMENTO decidida ACEITAR devolve SEM_BLOQUEIO', async () => {
    const f = await novaInspecaoReprovada({ reprovada: 3 });
    // Falta de quantidade no recebimento: 7 de 10 esperados.
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET quantidade_recebida = 7 WHERE id = ?', [f.itemId]);
    const doc = await nc.abrirNaoConformidade(db, ADMIN, {
      origem: 'RECEBIMENTO', referencia_tipo: 'RECEBIMENTO_ITEM', referencia_id: f.itemId,
      tipo: 'QUANTIDADE', aberto_automaticamente: 1, descricao: 'faltaram 3',
    });
    const antes = await bloqueadaDe(f.materialId);

    const res = await decidir(doc.id, 'ACEITAR');

    assert.strictEqual(res.liberacao.efeito, 'SEM_BLOQUEIO', `efeito ${res.liberacao.efeito}`);
    assert.strictEqual(res.liberacao.mensagem, 'Esta não conformidade não tem material bloqueado para liberar',
      `mensagem: ${res.liberacao.mensagem}`);
    assert.strictEqual(res.status, 'DECIDIDA', 'a decisao tem de ser gravada mesmo sem efeito de saldo');
    assert.strictEqual(await bloqueadaDe(f.materialId), antes, 'o bloqueado mudou numa NC de recebimento');
  });

  // ── (6) — nao ha o que liberar ─────────────────────────────────────────────────────────────
  await test('(6) RN-06 inspecao com reprovada 0 devolve SEM_BLOQUEIO', async () => {
    const f = await novaInspecaoReprovada({ reprovada: 3 });
    const doc = await ncAutomatica(f.inspecaoId);
    // O documento nasceu com reprovada 3; zerar DEPOIS e o unico jeito de chegar ao estado, ja
    // que o gancho recusa abrir com reprovada 0.
    await dbRun(db, 'UPDATE inspecoes_recebimento_almoxarifado SET quantidade_reprovada = 0 WHERE id = ?', [f.inspecaoId]);

    const res = await decidir(doc.id, 'ACEITAR');

    assert.strictEqual(res.liberacao.efeito, 'SEM_BLOQUEIO', `efeito ${res.liberacao.efeito}`);
    assert.strictEqual(res.status, 'DECIDIDA', 'a decisao tem de ser gravada');
    assert.strictEqual(await bloqueadaDe(f.materialId), 3, 'o bloqueado caiu sem haver reprovada');
  });

  // ── (7) — a trava e POR INSPECAO, nao por NC ───────────────────────────────────────────────
  await test('(7) RN-03 duas NCs da mesma inspecao: a segunda e JA_LIBERADA e NAO libera de novo', async () => {
    // 3 reprovados + 10 bloqueados por outra coisa. Se a trava nao funcionar, a segunda liberacao
    // PASSA pelo motor (o pool tem 10) e o bloqueado cai para 7 — o furo que a Fase 0 mediu.
    const f = await novaInspecaoReprovada({ reprovada: 3, bloqueioDeOutraOrigem: 10 });
    const primeira = await ncAutomatica(f.inspecaoId);
    // A segunda NC da MESMA inspecao, com outro `tipo`: o indice unico e parcial E por tipo,
    // entao isto e aceito. Aberta como AUTOMATICA de proposito — a RN-09 sozinha ja barraria
    // uma manual, e o cenario precisa provar a TRAVA, nao a RN-09.
    const segunda = await nc.abrirNaoConformidade(db, QUALIDADE, {
      origem: 'INSPECAO', referencia_tipo: 'INSPECAO', referencia_id: f.inspecaoId,
      tipo: 'DANO_FISICO', aberto_automaticamente: 1, descricao: 'dano observado depois',
    });
    assert.ok(segunda && segunda.id, 'a segunda NC da mesma inspecao nao abriu — o cenario perdeu o sentido');

    const r1 = await decidir(primeira.id, 'ACEITAR');
    assert.strictEqual(r1.liberacao.efeito, 'LIBERADA', 'a PRIMEIRA tinha de liberar');
    assert.strictEqual(await bloqueadaDe(f.materialId), 10, 'a primeira liberacao nao caiu certo');

    const r2 = await decidir(segunda.id, 'ACEITAR');

    assert.strictEqual(r2.liberacao.efeito, 'JA_LIBERADA', `efeito da segunda: ${r2.liberacao.efeito}`);
    assert.strictEqual(r2.liberacao.mensagem, 'O material desta inspeção já havia sido liberado',
      `mensagem: ${r2.liberacao.mensagem}`);
    assert.strictEqual(r2.status, 'DECIDIDA', 'a segunda decisao tem de ser gravada mesmo sem liberar');
    // A ASSERCAO DISCRIMINANTE: 10, nao 7.
    assert.strictEqual(await bloqueadaDe(f.materialId), 10, 'a segunda NC liberou de novo — a trava por inspecao falhou');
  });

  // ── (8) — a liberacao e FATAL ──────────────────────────────────────────────────────────────
  await test('(8) RN-02 a liberacao falhou: a decisao NAO fica gravada e os dois claims voltam', async () => {
    // Bloqueado MENOR que a reprovada: o motor recusa com a literal da Etapa 5. E o caminho real
    // (alguem desbloqueou na mao antes), nao um mock.
    const f = await novaInspecaoReprovada({ reprovada: 3 });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 1 WHERE id = ?', [f.materialId]);
    const doc = await ncAutomatica(f.inspecaoId);

    const e = await erroDe(() => decidir(doc.id, 'ACEITAR'));

    assert.ok(e, 'a decisao passou em vez de recusar');
    assert.strictEqual(e.message, 'Quantidade bloqueada insuficiente: 1', `mensagem: ${e.message}`);
    assert.strictEqual(e.status, 400, `status ${e.status}`);
    const depois = await dbGet(db, 'SELECT * FROM nao_conformidades_almoxarifado WHERE id = ?', [doc.id]);
    // As DUAS asserções discriminantes do rollback. Na ordem ANTIGA (liberar antes de gravar) o
    // status nao distinguia; na ordem NOVA, `liberacao_nc_em` sozinho nao distinguiria se o
    // rollback da NC sumisse. Exigir as duas e o que impede o buraco de renascer se a ordem
    // mudar outra vez — achado 11 da Fase 2.
    assert.strictEqual(depois.status, 'ABERTA', `a NC ficou ${depois.status} depois de a liberacao falhar`);
    assert.strictEqual(depois.decisao, null, `a decisao ${depois.decisao} ficou gravada`);
    assert.strictEqual(depois.decidido_em, null, 'decidido_em ficou preenchido');
    assert.strictEqual(await liberacaoDaInspecao(f.inspecaoId), null, 'a inspecao ficou travada para sempre');
    assert.strictEqual(await bloqueadaDe(f.materialId), 1, 'o bloqueado mudou');
    const movs = await movimentacoesDe(f.materialId);
    assert.strictEqual(movs.length, 0, `nasceu movimentacao numa liberacao que falhou: ${JSON.stringify(movs)}`);
  });

  // ── (9) — o rastro no livro ────────────────────────────────────────────────────────────────
  await test('(9) a movimentacao de liberacao carrega o numero da NC e o motivo proprio', async () => {
    const f = await novaInspecaoReprovada({ reprovada: 4 });
    const doc = await ncAutomatica(f.inspecaoId);
    await decidir(doc.id, 'ACEITAR_SOB_DESVIO');

    const movs = await movimentacoesDe(f.materialId);
    assert.strictEqual(movs.length, 1, `esperava 1 movimentacao, veio ${movs.length}`);
    assert.strictEqual(movs[0].tipo, 'DESBLOQUEIO', `tipo ${movs[0].tipo}`);
    assert.strictEqual(movs[0].quantidade, 4, `quantidade ${movs[0].quantidade}`);
    assert.strictEqual(movs[0].documento_vinculado, doc.numero,
      `o livro nao aponta para o documento: ${movs[0].documento_vinculado} vs ${doc.numero}`);
    // Distinto de "Desbloqueio avulso" de proposito: e o que torna a liberacao legivel no livro
    // sem cruzar tabela nenhuma.
    assert.strictEqual(movs[0].motivo, 'Liberação por não conformidade', `motivo ${movs[0].motivo}`);
  });

  // ── (10) — regressao da Etapa 43 ───────────────────────────────────────────────────────────
  await test('(10) decidir a MESMA NC duas vezes continua 409, e a segunda nao mexe no saldo', async () => {
    const f = await novaInspecaoReprovada({ reprovada: 3, bloqueioDeOutraOrigem: 5 });
    const doc = await ncAutomatica(f.inspecaoId);
    await decidir(doc.id, 'ACEITAR');
    assert.strictEqual(await bloqueadaDe(f.materialId), 5, 'a primeira decisao nao liberou certo');

    const e = await erroDe(() => decidir(doc.id, 'ACEITAR'));

    assert.ok(e, 'decidir duas vezes passou');
    assert.strictEqual(e.message, 'Esta não conformidade já foi encerrada', `mensagem: ${e.message}`);
    assert.strictEqual(e.status, 409, `status ${e.status}`);
    assert.strictEqual(await bloqueadaDe(f.materialId), 5, 'a segunda decisao mexeu no saldo');
  });

  // ── (11) — a porta lateral CRITICAL da Fase 2 ──────────────────────────────────────────────
  await test('(11) RN-09 NC aberta A MAO sobre inspecao NAO libera saldo', async () => {
    // O cenario exato do achado: o material tem 10 bloqueados por OUTRA coisa (bloqueio avulso de
    // inventario) e a reprovacao de 3 e antiga. Sem a RN-09, decidir a NC manual como aceitacao
    // desbloquearia 3 desse pool — mexer em saldo sem `ajustar_estoque` e sem passar pela rota de
    // desbloqueio, que e exatamente o que esta etapa promete NAO fazer.
    const f = await novaInspecaoReprovada({ reprovada: 3, bloqueioDeOutraOrigem: 10 });
    const manual = await nc.abrirNaoConformidadeManual(db, QUALIDADE, {
      origem: 'INSPECAO', referencia_tipo: 'INSPECAO', referencia_id: f.inspecaoId,
      tipo: 'OUTRO', descricao: 'aberta a mao apontando para inspecao antiga',
    });
    assert.ok(manual && manual.id, 'a porta manual nao abriu — o cenario perdeu o sentido');
    assert.strictEqual(manual.aberto_automaticamente, 0, 'a NC manual nasceu marcada como automatica');

    const res = await decidir(manual.id, 'ACEITAR');

    assert.strictEqual(res.liberacao.efeito, 'SEM_BLOQUEIO', `efeito ${res.liberacao.efeito}`);
    assert.strictEqual(res.liberacao.mensagem, 'Não conformidade aberta manualmente não libera saldo',
      `mensagem: ${res.liberacao.mensagem}`);
    // A metade positiva: a decisao FOI gravada — a RN-09 tira o efeito no saldo, nao o documento.
    assert.strictEqual(res.status, 'DECIDIDA', `a NC ficou ${res.status}`);
    assert.strictEqual(await bloqueadaDe(f.materialId), 13, 'a NC manual liberou saldo — a porta lateral esta aberta');
    assert.strictEqual(await liberacaoDaInspecao(f.inspecaoId), null, 'a inspecao foi carimbada por uma NC manual');
  });

  // ── (12) — o backfill ──────────────────────────────────────────────────────────────────────
  await test('(12) RN-03 inspecao anterior a migracao nasce carimbada e nunca libera', async () => {
    const { migrateBackfillLiberacaoNcInspecoesAntigas } = require('../../services/almoxarifado/schema');
    const f = await novaInspecaoReprovada({ reprovada: 3, bloqueioDeOutraOrigem: 10 });
    assert.strictEqual(await liberacaoDaInspecao(f.inspecaoId), null,
      'a inspecao nova ja nasceu carimbada — o backfill esta alcancando o que nao devia');

    // Simula o deploy: a inspecao ja existia quando a migracao rodou. O ledger e limpo para a
    // migracao poder rodar de novo — em producao ela roda UMA vez, e e o ledger que impede o
    // carimbo de alcancar inspecao criada depois.
    await dbRun(db, 'DELETE FROM schema_migrations_almoxarifado WHERE id = ?',
      ['backfill_liberacao_nc_inspecoes_antigas']);
    await migrateBackfillLiberacaoNcInspecoesAntigas(db);

    assert.ok(await liberacaoDaInspecao(f.inspecaoId), 'o backfill nao carimbou a inspecao antiga');
    const doc = await ncAutomatica(f.inspecaoId);
    const res = await decidir(doc.id, 'ACEITAR');

    assert.strictEqual(res.liberacao.efeito, 'JA_LIBERADA', `efeito ${res.liberacao.efeito}`);
    assert.strictEqual(await bloqueadaDe(f.materialId), 13,
      'uma reprovacao anterior ao deploy virou vale-desbloqueio');
  });

  // ── (13) — material inativo nao tranca o documento ─────────────────────────────────────────
  await test('(13) RN-10 material inativo: a decisao e gravada e o documento nao fica preso', async () => {
    const f = await novaInspecaoReprovada({ reprovada: 3, ativo: 0 });
    const doc = await ncAutomatica(f.inspecaoId);

    const res = await decidir(doc.id, 'ACEITAR');

    // Sem a RN-10 isto seria 400 "Material inativo nao pode ser movimentado" e, pela RN-02, a NC
    // nunca fecharia — ficaria presa para sempre cobrando no cartao de NC parada.
    assert.strictEqual(res.liberacao.efeito, 'SEM_BLOQUEIO', `efeito ${res.liberacao.efeito}`);
    assert.strictEqual(res.liberacao.mensagem, 'Material inativo — a decisão foi registrada sem liberar saldo',
      `mensagem: ${res.liberacao.mensagem}`);
    assert.strictEqual(res.status, 'DECIDIDA', `a NC ficou ${res.status} — o documento ficou preso`);
    assert.strictEqual(await bloqueadaDe(f.materialId), 3, 'o bloqueado mudou num material inativo');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
