/**
 * Etapa 46, T2 — CANCELAR o documento, e a régua do "encerrado por PESSOA".
 *
 * Plano:  docs/superpowers/plans/2026-09-30-almoxarifado-etapa46-nc-destravada.md (T2)
 * Design: docs/superpowers/specs/2026-09-30-almoxarifado-etapa46-nc-destravada-design.md (secoes 5 e 9)
 *
 * ── POR QUE ESTA ETAPA EXISTE ────────────────────────────────────────────────────────────────
 * A Etapa 45 recusa a execucao de material com serie, e de lote nao identificavel, com 400
 * FATAL. A recusa esta certa; o que sobrava era um documento DECIDIDA + PENDENTE que NADA em tela
 * nenhuma tirava de la (furo C64, dois revisores independentes).
 *
 * ── O QUE A FASE 2 MUDOU, E E O QUE ESTE ARQUIVO PRENDE ──────────────────────────────────────
 * O discriminador do cancelamento HUMANO nao e `decidido_em` — uma NC ABERTA cancelada por pessoa
 * tem `decidido_em IS NULL`, a MESMA assinatura do cancelamento automatico. E `cancelado_por_id`.
 * E "cancelado por pessoa" e um ENCERRAMENTO, como decidir: os TRES consumidores do estado
 * passam a trata-lo assim, e tocar so um deles reabre o furo do "silencio completo".
 *
 * ── O QUE CADA CENARIO PRENDE ────────────────────────────────────────────────────────────────
 *   (1) motivo com menos de 5 caracteres RECUSA, com a literal congelada
 *   (2) 404 em id inexistente
 *   (3) cancelar ABERTA: estado, autor, motivo, e o indice parcial LIBERADO
 *   (4) cancelar DECIDIDA+PENDENTE: a DECISAO sobrevive campo a campo
 *   (5) `execucao_estado` PRESERVADO em PENDENTE (RN-06) — nao zerado
 *   (6) execucao JA REGISTRADA recusa, com a literal dela
 *   (7) decisao de ACEITACAO (NAO_SE_APLICA) recusa com literal PROPRIA — o saldo ja se moveu
 *   (8) ja CANCELADA recusa
 *   (9) as DUAS mensagens de sucesso, uma por estado anterior
 *  (10) a fila `?execucao=PENDENTE` NAO traz a cancelada
 *  (11) a trilha carrega os DOIS campos anteriores
 *  (12) RN-05a: cancelada por PESSOA + reenvio sem mudanca de fato => NENHUMA NC nova
 *  (13) RN-05b: cancelada AUTOMATICA + fato divergente de novo => NASCE NC nova  [CONTROLE]
 *  (14) RN-05c: cancelada por pessoa -> item CORRIGIDO -> quebra igual => NASCE NC nova
 *  (15) RN-05d: cancelada por pessoa NAO volta ao cartao DIVERGENCIA_RECEBIMENTO
 *
 * ── GUARDA ANTI-TESTE-VAZIO ──────────────────────────────────────────────────────────────────
 * O (13) e o CONTROLE do (12): sem ele, trocar a condicao de `getUltimaEncerrada` por um `OR`
 * largo (que casasse QUALQUER cancelada) passaria verde, e o cancelamento automatico deixaria de
 * reabrir — que e o comportamento que o docblock daquela funcao existe para garantir.
 * O (14) e o CRITICAL 9.2: o carimbo `fato_superado_em` tem de ALCANCAR a linha cancelada por
 * pessoa. O guarda que ja existia (`naoConformidadeRegressao.api.test.js:124-160`) usa NC
 * DECIDIDA e continua VERDE com esse furo aberto — por isso o cenario nasce aqui.
 *
 * Executar: cd server && node tests/api/ncCancelamento.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const nc = require('../../services/almoxarifado/nonConformityService');
const { listarDivergenciasRecebimento } = require('../../services/almoxarifado/alertRegistry');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 460, nome: 'Admin E46', role: 'admin', is_superadmin: 1, email: 'admin46@test.com' };
const QUALIDADE = { id: 461, nome: 'Fulana Qualidade', perfil_almoxarifado: 'QUALIDADE', email: 'q46@test.com' };
const COMPRAS = { id: 462, nome: 'Beltrano Compras', perfil_almoxarifado: 'COMPRAS', email: 'c46@test.com' };

let seq = 0;
const uniq = (p) => `${p}-${Date.now() % 1000000}-${++seq}`;

async function erroDe(fn) {
  try { await fn(); return null; } catch (e) { return { message: e.message, status: e.status }; }
}

(async () => {
  console.log('\n=== Etapa 46 T2: cancelar o documento, e o "encerrado por PESSOA" ===\n');
  const { db, close } = await createTestApp({ user: { ...ADMIN } });

  const novoMaterial = async () => (await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,?,?,1)`,
    [uniq('MAT-E46'), 'Chapa da Etapa 46', 'KG', 100])).lastID;

  async function novoItem({ esperada = 10, recebida = null } = {}) {
    const materialId = await novoMaterial();
    const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal) VALUES (?,?,?)`, [uniq('REC-E46'), 'RECEBIDO', uniq('NF')]);
    const item = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`,
      [rec.lastID, materialId, esperada, recebida]);
    return { materialId, recebimentoId: rec.lastID, itemId: item.lastID };
  }

  const setQtd = (itemId, q) => dbRun(db,
    'UPDATE recebimentos_material_itens_almoxarifado SET quantidade_recebida = ? WHERE id = ?', [q, itemId]);

  const ncsDoItem = (itemId) => dbAll(db, `SELECT * FROM nao_conformidades_almoxarifado
    WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ? ORDER BY id`, [itemId]);

  const linhaDe = (id) => dbGet(db, 'SELECT * FROM nao_conformidades_almoxarifado WHERE id = ?', [id]);

  const trilhaDe = (id) => dbAll(db, `SELECT acao, usuario_nome, justificativa, dados_anteriores, dados_novos
    FROM auditoria_log_almoxarifado WHERE entidade = 'nao_conformidade' AND entidade_id = ? ORDER BY id`, [id]);

  const sync = (itemId, user = ADMIN) => nc.sincronizarNaoConformidadeQuantidade(db, user, itemId);

  /** Uma inspecao reprovada, para as NCs de origem INSPECAO (as que travam por serie). */
  async function novaInspecaoReprovada({ reprovada = 3, esperada = 10, controleSerie = 0 } = {}) {
    const mat = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_bloqueada, ativo, controle_serie)
      VALUES (?,?,?,?,?,1,?)`,
      [uniq('MAT-E46I'), 'Peca da Etapa 46', 'PC', esperada, reprovada, controleSerie]);
    const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal) VALUES (?,?,?)`, [uniq('REC-E46I'), 'RECEBIDO', uniq('NF')]);
    const item = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`,
      [rec.lastID, mat.lastID, esperada, esperada]);
    const insp = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
      (recebimento_item_id, conforme, quantidade_aprovada, quantidade_reprovada, responsavel_id, responsavel_nome)
      VALUES (?,?,?,?,?,?)`,
      [item.lastID, 0, esperada - reprovada, reprovada, QUALIDADE.id, QUALIDADE.nome]);
    return { materialId: mat.lastID, itemId: item.lastID, inspecaoId: insp.lastID };
  }

  const decidir = (id, decisao, user = QUALIDADE) =>
    nc.decidirNaoConformidade(db, user, id, { decisao, justificativa: 'laudo do inspetor anexo' });

  const cancelar = (id, motivo = 'baixa dada em Movimentacoes, serie 4471', user = QUALIDADE) =>
    nc.cancelarNaoConformidade(db, user, id, { motivo });

  // ── (1) e (2) as duas recusas de entrada ────────────────────────────────────────────────────
  await test('(1) motivo com menos de 5 caracteres recusa, com a literal congelada', async () => {
    const { itemId } = await novoItem({ esperada: 10, recebida: 8 });
    const { nc: doc } = await sync(itemId);
    for (const motivo of [undefined, null, '', '   ', 'abc', ' 1234 ']) {
      const e = await erroDe(() => nc.cancelarNaoConformidade(db, QUALIDADE, doc.id, { motivo }));
      assert.ok(e, `motivo ${JSON.stringify(motivo)} passou`);
      assert.strictEqual(e.status, 400, `motivo ${JSON.stringify(motivo)} deu ${e.status}`);
      assert.strictEqual(e.message, 'O motivo do cancelamento deve ter pelo menos 5 caracteres');
    }
    // Metade positiva: com 5 caracteres passa. Sem ela o cenario passaria com um servico que
    // recusasse TUDO.
    const ok = await cancelar(doc.id, 'abcde');
    assert.strictEqual(ok.status, 'CANCELADA');
  });

  await test('(2) id inexistente devolve 404', async () => {
    const e = await erroDe(() => cancelar(99999123));
    assert.strictEqual(e.status, 404);
    assert.strictEqual(e.message, 'Não conformidade não encontrada');
  });

  // ── (3) cancelar ABERTA: autor gravado, e o indice parcial liberado ─────────────────────────
  await test('(3) cancelar ABERTA grava autor e motivo, e LIBERA o indice parcial', async () => {
    const { itemId } = await novoItem({ esperada: 10, recebida: 6 });
    const { nc: doc } = await sync(itemId);
    assert.strictEqual(doc.status, 'ABERTA');

    const r = await cancelar(doc.id, 'balanca descalibrada, divergencia improcedente');
    assert.strictEqual(r.status, 'CANCELADA');
    assert.strictEqual(r.cancelamento.estado_anterior, 'ABERTA');
    assert.strictEqual(r.motivo_cancelamento, 'balanca descalibrada, divergencia improcedente');

    const linha = await linhaDe(doc.id);
    assert.strictEqual(linha.cancelado_por_id, QUALIDADE.id, 'o autor do cancelamento nao foi gravado');
    assert.strictEqual(linha.cancelado_por_nome, QUALIDADE.nome);
    assert.ok(linha.cancelado_em, 'cancelado_em vazio');
    // E o discriminador: esta linha e "encerrada por PESSOA".
    assert.notStrictEqual(linha.cancelado_por_id, null);

    // O indice parcial e `WHERE status = 'ABERTA'`: com a primeira cancelada, abrir de novo o
    // MESMO tipo no MESMO fato passa a ser possivel. E o que a RN-01 promete.
    const manual = await nc.abrirNaoConformidadeManual(db, ADMIN, {
      origem: 'RECEBIMENTO', referencia_tipo: 'RECEBIMENTO_ITEM', referencia_id: itemId,
      tipo: 'QUANTIDADE', descricao: 'reaberta a mao depois do cancelamento',
    });
    assert.ok(manual && manual.id, 'o indice parcial nao foi liberado pelo cancelamento');
    assert.notStrictEqual(manual.id, doc.id, 'reaproveitou a linha antiga em vez de inserir outra');
  });

  // ── (4) e (5) cancelar DECIDIDA: a decisao SOBREVIVE, e `execucao_estado` fica ──────────────
  await test('(4) cancelar DECIDIDA+PENDENTE: a DECISAO sobrevive campo a campo', async () => {
    const { inspecaoId } = await novaInspecaoReprovada({ reprovada: 3 });
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, inspecaoId);
    const decidida = await decidir(doc.id, 'DEVOLVER');
    assert.strictEqual(decidida.execucao_estado, 'PENDENTE');

    const r = await cancelar(doc.id, 'devolucao dada baixa em Movimentacoes, serie 4471');
    assert.strictEqual(r.status, 'CANCELADA');
    assert.strictEqual(r.cancelamento.estado_anterior, 'DECIDIDA');

    const linha = await linhaDe(doc.id);
    assert.strictEqual(linha.decisao, 'DEVOLVER', 'a decisao foi APAGADA pelo cancelamento');
    assert.strictEqual(linha.justificativa, 'laudo do inspetor anexo');
    assert.strictEqual(linha.decidido_por_id, QUALIDADE.id);
    assert.strictEqual(linha.decidido_por_nome, QUALIDADE.nome);
    assert.ok(linha.decidido_em, 'decidido_em foi limpo — isto e o rollback, nao o cancelamento');
  });

  await test('(5) [RN-06] `execucao_estado` fica PENDENTE — cancelar nao zera a coluna', async () => {
    const { inspecaoId } = await novaInspecaoReprovada({ reprovada: 2 });
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, inspecaoId);
    await decidir(doc.id, 'SUCATEAR');
    const r = await cancelar(doc.id, 'sucateamento cancelado pela engenharia');
    assert.strictEqual(r.cancelamento.execucao_estado_anterior, 'PENDENTE');
    const linha = await linhaDe(doc.id);
    assert.strictEqual(linha.execucao_estado, 'PENDENTE',
      'o cancelamento ZEROU execucao_estado — a RN-06 proibe: quem exclui da fila e o status');
  });

  // ── (6) (7) (8) as tres recusas de estado, e as tres literais sao DIFERENTES ────────────────
  await test('(6) execucao JA REGISTRADA recusa, com a literal dela', async () => {
    const { inspecaoId } = await novaInspecaoReprovada({ reprovada: 3 });
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, inspecaoId);
    await decidir(doc.id, 'DEVOLVER');
    await nc.registrarExecucao(db, COMPRAS, doc.id, { observacoes: 'coleta 99' });

    const e = await erroDe(() => cancelar(doc.id, 'tentativa de anular depois do fato'));
    assert.strictEqual(e.status, 409);
    assert.strictEqual(e.message,
      'A execução desta não conformidade já foi registrada — o documento não pode ser cancelado');
    const linha = await linhaDe(doc.id);
    assert.strictEqual(linha.status, 'DECIDIDA', 'a recusa nao impediu a gravacao do CANCELADA');
  });

  await test('(7) decisao de ACEITACAO recusa com literal PROPRIA — o saldo ja se moveu', async () => {
    for (const decisao of ['ACEITAR', 'ACEITAR_SOB_DESVIO']) {
      const { inspecaoId } = await novaInspecaoReprovada({ reprovada: 3 });
      const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, inspecaoId);
      const d = await decidir(doc.id, decisao);
      // A premissa do cenario, medida e nao suposta: ela fica DECIDIDA, NAO_SE_APLICA e
      // `execucao_em` NULL — e e por isso que um claim so com `execucao_em IS NULL` a aceitaria.
      assert.strictEqual(d.execucao_estado, 'NAO_SE_APLICA', `${decisao} nao deu NAO_SE_APLICA`);
      assert.strictEqual(await (async () => (await linhaDe(doc.id)).execucao_em)(), null,
        `${decisao} gravou execucao_em — a premissa deste cenario mudou`);

      const e = await erroDe(() => cancelar(doc.id, 'anular a aceitacao ja executada'));
      assert.strictEqual(e.status, 409, `${decisao} nao recusou`);
      assert.strictEqual(e.message,
        'A decisão desta não conformidade já liberou o material — o documento não pode ser cancelado',
        `${decisao} caiu na literal errada — e a errada MENTE sobre a causa`);
    }
  });

  await test('(8) ja CANCELADA recusa', async () => {
    const { itemId } = await novoItem({ esperada: 10, recebida: 5 });
    const { nc: doc } = await sync(itemId);
    await cancelar(doc.id, 'primeiro cancelamento');
    const e = await erroDe(() => cancelar(doc.id, 'segundo cancelamento'));
    assert.strictEqual(e.status, 409);
    assert.strictEqual(e.message, 'Esta não conformidade já está cancelada');
    const linha = await linhaDe(doc.id);
    assert.strictEqual(linha.motivo_cancelamento, 'primeiro cancelamento',
      'o segundo cancelamento sobrescreveu o motivo do primeiro');
  });

  // ── (9) (10) (11) resposta, fila e trilha ──────────────────────────────────────────────────
  await test('(9) as DUAS mensagens de sucesso, uma por estado anterior', async () => {
    const { itemId } = await novoItem({ esperada: 10, recebida: 4 });
    const { nc: aberta } = await sync(itemId);
    const rA = await cancelar(aberta.id, 'divergencia improcedente');
    assert.strictEqual(rA.cancelamento.mensagem,
      'Documento cancelado — ele não estava decidido, e nada foi executado');
    assert.strictEqual(rA.cancelamento.execucao_estado_anterior, null,
      'NC ABERTA nao tem estado de execucao — NULL, nunca string vazia');

    const { inspecaoId } = await novaInspecaoReprovada({ reprovada: 1 });
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, inspecaoId);
    await decidir(doc.id, 'ANALISE_ENGENHARIA');
    const rD = await cancelar(doc.id, 'engenharia dispensou a analise');
    assert.strictEqual(rD.cancelamento.mensagem,
      'Documento cancelado — a decisão fica registrada, e a execução deixa de ser cobrada');
    assert.notStrictEqual(rA.cancelamento.mensagem, rD.cancelamento.mensagem,
      'as duas mensagens ficaram iguais — o estado anterior deixou de importar');
  });

  await test('(10) a fila `?execucao=PENDENTE` NAO traz a cancelada', async () => {
    const { inspecaoId } = await novaInspecaoReprovada({ reprovada: 2 });
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, inspecaoId);
    await decidir(doc.id, 'SUBSTITUICAO');
    const antes = await nc.listarNaoConformidades(db, { execucao: 'PENDENTE' });
    assert.ok(antes.some((l) => l.id === doc.id), 'a decidida nao entrou na fila — premissa quebrada');

    await cancelar(doc.id, 'substituicao negociada fora do sistema');
    const depois = await nc.listarNaoConformidades(db, { execucao: 'PENDENTE' });
    assert.ok(!depois.some((l) => l.id === doc.id),
      'a cancelada continua na fila do Compras — o `AND status = DECIDIDA` do filtro deixou de valer');
    // E a metade positiva: a coluna NAO foi zerada (RN-06). Quem a exclui e o status.
    assert.strictEqual((await linhaDe(doc.id)).execucao_estado, 'PENDENTE');
  });

  await test('(11) a trilha carrega os DOIS campos anteriores', async () => {
    const { inspecaoId } = await novaInspecaoReprovada({ reprovada: 2 });
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, inspecaoId);
    await decidir(doc.id, 'DEVOLVER');
    await cancelar(doc.id, 'peca serializada, baixa manual em Movimentacoes');

    const trilha = await trilhaDe(doc.id);
    const cancelou = trilha.filter((l) => l.acao === 'NC_CANCELADA');
    assert.strictEqual(cancelou.length, 1, `verbos NC_CANCELADA: ${cancelou.length}`);
    assert.strictEqual(cancelou[0].usuario_nome, QUALIDADE.nome);
    assert.strictEqual(cancelou[0].justificativa, 'peca serializada, baixa manual em Movimentacoes');
    const antes = JSON.parse(cancelou[0].dados_anteriores);
    assert.strictEqual(antes.status, 'DECIDIDA');
    assert.strictEqual(antes.execucao_estado, 'PENDENTE',
      'a trilha e o UNICO lugar que diz que havia execucao pendente quando se cancelou');
    // E os tres verbos convivem, na ordem: aberta, decidida, cancelada.
    assert.deepStrictEqual(trilha.map((l) => l.acao), ['NC_ABERTA', 'NC_DECIDIDA', 'NC_CANCELADA']);
  });

  // ── (12) a (15): a RN-05, e os quatro cenarios sao o CORACAO desta task ────────────────────
  //
  // "Cancelado por PESSOA" e um ENCERRAMENTO, como decidir, e TRES consumidores do estado
  // precisam concordar. Cada cenario abaixo prende um deles, e o (13) e o controle do (12).
  await test('(12) [RN-05a] cancelada por PESSOA + reenvio sem mudanca de fato => NENHUMA NC nova', async () => {
    const { itemId } = await novoItem({ esperada: 10, recebida: 8 });
    const { nc: doc } = await sync(itemId);
    await decidir(doc.id, 'ACEITAR_SOB_DESVIO');
    // Decisao de aceitacao nao cancela (cenario 7). Para este fluxo a NC tem de estar cancelavel:
    // usa-se o caminho ABERTA, que e o que a RN-01 cobre e o que o gancho realmente alcanca.
    const { itemId: item2 } = await novoItem({ esperada: 10, recebida: 8 });
    const { nc: doc2 } = await sync(item2);
    await cancelar(doc2.id, 'balanca descalibrada, divergencia improcedente');

    // O reenvio da NF: mesma quantidade, mesmo fato. O gancho NAO deve abrir nada.
    const r = await sync(item2);
    assert.strictEqual(r.efeito, 'NENHUMA', `o gancho devolveu ${r.efeito} — reabriu o que uma pessoa anulou`);
    const linhas = await ncsDoItem(item2);
    assert.strictEqual(linhas.length, 1,
      `nasceu NC nova sobre um fato anulado por pessoa: ${linhas.length} linhas. Isto repetiria a CADA salvamento de NF`);
  });

  await test('(13) [RN-05b CONTROLE] cancelada AUTOMATICA + fato divergente de novo => NASCE NC nova', async () => {
    const { itemId } = await novoItem({ esperada: 10, recebida: 8 });
    const { nc: doc } = await sync(itemId);
    assert.strictEqual(doc.status, 'ABERTA');

    // O operador corrige: a divergencia SOME, e o gancho cancela SOZINHO (sem `cancelado_por_id`).
    await setQtd(itemId, 10);
    const cancelouSozinho = await sync(itemId);
    assert.strictEqual(cancelouSozinho.efeito, 'CANCELADA', `a correcao devolveu ${cancelouSozinho.efeito}`);
    const auto = await linhaDe(doc.id);
    assert.strictEqual(auto.cancelado_por_id, null,
      'o cancelamento AUTOMATICO gravou autor — o discriminador da etapa deixou de discriminar');

    // E agora quebra de novo. Cancelamento automatico NAO e encerramento: tem de nascer NC nova.
    await setQtd(itemId, 8);
    const r = await sync(itemId);
    assert.strictEqual(r.efeito, 'ABERTA',
      `o gancho devolveu ${r.efeito} — a cancelada AUTOMATICA passou a valer como encerramento, e o erro novo ficou sem documento`);
    const linhas = await ncsDoItem(itemId);
    assert.strictEqual(linhas.length, 2, `${linhas.length} linhas — a segunda NC nao nasceu`);
  });

  await test('(14) [RN-05c] cancelada por pessoa -> item CORRIGIDO -> quebra igual => NASCE NC nova', async () => {
    const { itemId } = await novoItem({ esperada: 10, recebida: 8 });
    const { nc: doc } = await sync(itemId);
    await cancelar(doc.id, 'divergencia improcedente na primeira leitura');

    // O item e CORRIGIDO. Este passo tem de CARIMBAR `fato_superado_em` na linha CANCELADA —
    // e o UPDATE do carimbo so alcancava `status = 'DECIDIDA'` antes desta etapa.
    await setQtd(itemId, 10);
    await sync(itemId);
    const carimbada = await linhaDe(doc.id);
    assert.ok(carimbada.fato_superado_em,
      'o carimbo de fato superado NAO alcancou a linha cancelada por pessoa — e o "silencio completo" do passo seguinte');

    // Quebra de novo, no MESMO valor. Como o fato foi superado, e problema NOVO.
    await setQtd(itemId, 8);
    const r = await sync(itemId);
    assert.strictEqual(r.efeito, 'ABERTA',
      `o gancho devolveu ${r.efeito}: falta real e viva, e ZERO NC no modulo`);
    const linhas = await ncsDoItem(itemId);
    assert.strictEqual(linhas.length, 2, `${linhas.length} linhas — a NC do erro novo nao nasceu`);
  });

  await test('(15) [RN-05d] cancelada por pessoa NAO volta ao cartao de divergencia', async () => {
    const { itemId } = await novoItem({ esperada: 10, recebida: 7 });
    const { nc: doc } = await sync(itemId);

    const noCartao = async () => {
      const linhas = await listarDivergenciasRecebimento(db, { dias: 30, excluirComNC: true });
      return linhas.some((l) => l.item_id === itemId);
    };
    assert.strictEqual(await noCartao(), false, 'com NC ABERTA o item ja deveria estar fora do cartao');

    await cancelar(doc.id, 'divergencia improcedente, conferido com o fornecedor');
    assert.strictEqual(await noCartao(), false,
      'o item voltou ao cartao como divergencia NAO DOCUMENTADA — e nao existe porta para documenta-la');

    // A metade POSITIVA, e ela e obrigatoria: um item divergente SEM NC nenhuma TEM de aparecer.
    // Sem esta linha o cenario passaria com um cartao que nao lista nada.
    const { itemId: semNc } = await novoItem({ esperada: 10, recebida: 3 });
    const linhas = await listarDivergenciasRecebimento(db, { dias: 30, excluirComNC: true });
    assert.ok(linhas.some((l) => l.item_id === semNc),
      'o cartao nao lista nem o item divergente sem NC — ele esta vazio, e o cenario acima nao prova nada');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
