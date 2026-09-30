/**
 * Etapa 46, T2 (+ fix-round da Fase 5) — CANCELAR o documento, e a régua do "encerrado por PESSOA".
 *
 * Plano:  docs/superpowers/plans/2026-09-30-almoxarifado-etapa46-nc-destravada.md (T2)
 * Design: docs/superpowers/specs/2026-09-30-almoxarifado-etapa46-nc-destravada-design.md (secoes 5, 9 e 10)
 *
 * ── POR QUE ESTA ETAPA EXISTE ────────────────────────────────────────────────────────────────
 * A Etapa 45 recusa a execucao de material com serie, e de lote nao identificavel, com 400
 * FATAL. A recusa esta certa; o que sobrava era um documento DECIDIDA + PENDENTE que NADA em tela
 * nenhuma tirava de la (furo C64, dois revisores independentes).
 *
 * ── O CORTE DE ESCOPO DO FIX-ROUND, E ELE MUDOU METADE DESTE ARQUIVO ─────────────────────────
 * A RN-01 (cancelar NC `ABERTA`) MORREU. Duas lentes da Fase 5 mediram, por sonda, que ela
 * silenciava divergencia VIVA: o documento morria sem decisao, o item saia do cartao D6, o gancho
 * nao reabria (a RN-05 o tratava como encerramento) e nao existe tela de abertura manual. O beco
 * que a etapa existe para resolver e SO `DECIDIDA` + `PENDENTE`. Cancelar `ABERTA` agora RECUSA,
 * com a literal que ensina o caminho certo (decidir, ou corrigir a quantidade).
 *
 * E a recusa `JA_LIBEROU` morreu com ela: a regua era de CLASSE de decisao ("aceitacao") e a
 * frase afirmava efeito de ESTOQUE ("ja liberou o material") — falso, medido, em NC de origem
 * RECEBIMENTO e em NC manual de inspecao. A regua agora e de ESTADO, e as duas frases novas
 * (`NAO_DECIDIDA`, `SEM_PENDENCIA`) sao verdadeiras em todos os casos que cobrem.
 *
 * ── O QUE CADA CENARIO PRENDE ────────────────────────────────────────────────────────────────
 *   (1) motivo com menos de 5 caracteres RECUSA, com a literal congelada
 *   (2) 404 em id inexistente
 *   (3) cancelar `ABERTA` RECUSA, e a literal ENSINA a saida  [corte de escopo]
 *   (4) cancelar DECIDIDA+PENDENTE: a DECISAO sobrevive campo a campo, e o autor e gravado
 *   (5) `execucao_estado` PRESERVADO em PENDENTE (RN-06) — nao zerado
 *   (6) execucao JA REGISTRADA recusa, com a literal dela
 *   (7) decisao de ACEITACAO recusa por NAO TER PENDENCIA — e a frase nao fala de saldo
 *   (8) ja CANCELADA recusa
 *   (9) a mensagem de sucesso, unica
 *  (10) a fila `?execucao=PENDENTE` NAO traz a cancelada
 *  (11) a trilha carrega os dois campos anteriores E o discriminador
 *  (12) RN-05a: cancelada por PESSOA + reenvio sem mudanca de fato => NENHUMA NC nova
 *  (13) RN-05b: cancelada AUTOMATICA + fato divergente de novo => NASCE NC nova  [CONTROLE]
 *  (14) RN-05c: cancelada por pessoa -> item CORRIGIDO -> quebra igual => NASCE NC nova
 *  (15) RN-05d: cancelada por pessoa NAO volta ao cartao DIVERGENCIA_RECEBIMENTO
 *  (16) CRITICAL da Fase 5: o carimbo alcanca a linha encerrada MESMO com outra NC aberta
 *  (17) a corrida `cancelar x cancelar` — UM sucesso, UMA trilha
 *  (18) `/executar` sobre documento CANCELADO nao mente sobre execucao registrada
 *
 * ── GUARDA ANTI-TESTE-VAZIO ──────────────────────────────────────────────────────────────────
 * O (13) e o CONTROLE do (12): sem ele, trocar a condicao de `getUltimaEncerrada` por um `OR`
 * largo (que casasse QUALQUER cancelada) passaria verde, e o cancelamento automatico deixaria de
 * reabrir — que e o comportamento que o docblock daquela funcao existe para garantir.
 * O (16) nasceu do CRITICAL: o carimbo `fato_superado_em` vivia num ramo que so era alcancado
 * quando NAO havia NC aberta, e o (14) — que existia — passava verde porque usa UM documento so.
 * O (17) nasceu de uma lente que mediu o claim inteiro sendo apagavel com 39 cenarios verdes.
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
const QUALIDADE_2 = { id: 463, nome: 'Beltrana Qualidade', perfil_almoxarifado: 'QUALIDADE', email: 'q46b@test.com' };

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

  /** O atalho do caminho que a etapa serve: NC de inspecao DECIDIDA e com execucao PENDENTE. */
  async function ncDecididaPendente({ reprovada = 3, decisao = 'DEVOLVER' } = {}) {
    const { inspecaoId, materialId } = await novaInspecaoReprovada({ reprovada });
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, inspecaoId);
    const d = await decidir(doc.id, decisao);
    assert.strictEqual(d.execucao_estado, 'PENDENTE', `${decisao} nao deixou execucao PENDENTE`);
    return { id: doc.id, inspecaoId, materialId };
  }

  /** O de QUANTIDADE, que e o unico que o gancho reavalia — os cenarios da RN-05 vivem nele. */
  async function ncQuantidadeDecidida({ esperada = 10, recebida = 8, decisao = 'DEVOLVER' } = {}) {
    const { itemId } = await novoItem({ esperada, recebida });
    const { nc: doc } = await sync(itemId);
    assert.strictEqual(doc.status, 'ABERTA');
    const d = await decidir(doc.id, decisao);
    assert.strictEqual(d.execucao_estado, 'PENDENTE');
    return { id: doc.id, itemId };
  }

  // ── (1) a (3) as recusas de entrada, e a (3) e o CORTE DE ESCOPO ───────────────────────────
  await test('(1) motivo com menos de 5 caracteres recusa, com a literal congelada', async () => {
    const { id } = await ncDecididaPendente();
    for (const motivo of [undefined, null, '', '   ', 'abc', ' 1234 ']) {
      const e = await erroDe(() => nc.cancelarNaoConformidade(db, QUALIDADE, id, { motivo }));
      assert.ok(e, `motivo ${JSON.stringify(motivo)} passou`);
      assert.strictEqual(e.status, 400, `motivo ${JSON.stringify(motivo)} deu ${e.status}`);
      assert.strictEqual(e.message, 'O motivo do cancelamento deve ter pelo menos 5 caracteres');
    }
    // Metade positiva: com 5 caracteres passa. Sem ela o cenario passaria com um servico que
    // recusasse TUDO — e a regua de 5 e justamente a que mais parece arbitraria.
    const ok = await cancelar(id, 'abcde');
    assert.strictEqual(ok.status, 'CANCELADA');
  });

  await test('(2) id inexistente devolve 404', async () => {
    const e = await erroDe(() => cancelar(99999123));
    assert.strictEqual(e.status, 404);
    assert.strictEqual(e.message, 'Não conformidade não encontrada');
  });

  await test('(3) [corte de escopo] cancelar ABERTA RECUSA, e a literal ENSINA a saida', async () => {
    const { itemId } = await novoItem({ esperada: 10, recebida: 6 });
    const { nc: doc } = await sync(itemId);
    assert.strictEqual(doc.status, 'ABERTA');

    const e = await erroDe(() => cancelar(doc.id, 'balanca descalibrada, divergencia improcedente'));
    assert.strictEqual(e.status, 409, `cancelar ABERTA deu ${e && e.status}`);
    assert.strictEqual(e.message,
      'Só é possível cancelar uma não conformidade já decidida — decida o documento, ou corrija a quantidade conferida');

    // O que a recusa PROTEGE, e e a razao do corte: o item continua cobrado nas duas superficies.
    const linha = await linhaDe(doc.id);
    assert.strictEqual(linha.status, 'ABERTA', 'a recusa nao impediu a gravacao do CANCELADA');
    assert.strictEqual(linha.cancelado_por_id, null);
    const paradas = await nc.listarNaoConformidades(db, { status: 'ABERTA' });
    assert.ok(paradas.some((l) => l.id === doc.id), 'a NC saiu da lista de abertas');

    // E a SAIDA que a literal ensina funciona: decidir, e ai o cancelamento passa a ser possivel.
    await decidir(doc.id, 'DEVOLVER');
    const ok = await cancelar(doc.id, 'decidida e depois anulada, com motivo');
    assert.strictEqual(ok.status, 'CANCELADA', 'o caminho que a propria literal indica nao funciona');
  });

  // ── (4) e (5) o caminho que a etapa serve ──────────────────────────────────────────────────
  await test('(4) cancelar DECIDIDA+PENDENTE: a DECISAO sobrevive campo a campo, e o autor e gravado', async () => {
    const { id } = await ncDecididaPendente({ reprovada: 3, decisao: 'DEVOLVER' });
    const r = await cancelar(id, 'devolucao dada baixa em Movimentacoes, serie 4471');
    assert.strictEqual(r.status, 'CANCELADA');
    assert.strictEqual(r.cancelamento.estado_anterior, 'DECIDIDA');

    const linha = await linhaDe(id);
    assert.strictEqual(linha.decisao, 'DEVOLVER', 'a decisao foi APAGADA pelo cancelamento');
    assert.strictEqual(linha.justificativa, 'laudo do inspetor anexo');
    assert.strictEqual(linha.decidido_por_id, QUALIDADE.id);
    assert.strictEqual(linha.decidido_por_nome, QUALIDADE.nome);
    assert.ok(linha.decidido_em, 'decidido_em foi limpo — isto e o rollback, nao o cancelamento');
    // O autor do cancelamento, que e o DISCRIMINADOR da etapa e nao adorno de auditoria.
    assert.strictEqual(linha.cancelado_por_id, QUALIDADE.id, 'o autor do cancelamento nao foi gravado');
    assert.strictEqual(linha.cancelado_por_nome, QUALIDADE.nome);
    assert.ok(linha.cancelado_em, 'cancelado_em vazio');
    assert.strictEqual(linha.motivo_cancelamento, 'devolucao dada baixa em Movimentacoes, serie 4471');
  });

  await test('(5) [RN-06] `execucao_estado` fica PENDENTE — cancelar nao zera a coluna', async () => {
    const { id } = await ncDecididaPendente({ reprovada: 2, decisao: 'SUCATEAR' });
    const r = await cancelar(id, 'sucateamento cancelado pela engenharia');
    assert.strictEqual(r.cancelamento.execucao_estado_anterior, 'PENDENTE');
    const linha = await linhaDe(id);
    assert.strictEqual(linha.execucao_estado, 'PENDENTE',
      'o cancelamento ZEROU execucao_estado — a RN-06 proibe: quem exclui da fila e o status');
  });

  // ── (6) a (8) as recusas de estado, e as tres literais sao DIFERENTES ──────────────────────
  await test('(6) execucao JA REGISTRADA recusa, com a literal dela', async () => {
    const { id } = await ncDecididaPendente({ reprovada: 3 });
    await nc.registrarExecucao(db, COMPRAS, id, { observacoes: 'coleta 99' });

    const e = await erroDe(() => cancelar(id, 'tentativa de anular depois do fato'));
    assert.strictEqual(e.status, 409);
    assert.strictEqual(e.message,
      'A execução desta não conformidade já foi registrada — o documento não pode ser cancelado');
    assert.strictEqual((await linhaDe(id)).status, 'DECIDIDA', 'a recusa nao impediu a gravacao');
  });

  await test('(7) decisao de ACEITACAO recusa por NAO TER PENDENCIA — e a frase nao fala de saldo', async () => {
    // ⚠️ ESTE CENARIO MUDOU DE LITERAL NO FIX-ROUND, e o motivo e o achado: a frase antiga
    // ("a decisao ja liberou o material") era FALSA nos dois casos de baixo — zero movimentacao,
    // `liberacao_nc_em` nulo, bloqueado intacto. A regua virou de ESTADO, e a frase nova e
    // verdadeira nos TRES casos.
    const casos = [];

    // (a) NC automatica de inspecao: AQUI a aceitacao realmente libera.
    for (const decisao of ['ACEITAR', 'ACEITAR_SOB_DESVIO']) {
      const { inspecaoId } = await novaInspecaoReprovada({ reprovada: 3 });
      const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, inspecaoId);
      const d = await decidir(doc.id, decisao);
      assert.strictEqual(d.execucao_estado, 'NAO_SE_APLICA', `${decisao} nao deu NAO_SE_APLICA`);
      assert.strictEqual(d.liberacao.efeito, 'LIBERADA', `${decisao} de inspecao nao liberou — premissa mudou`);
      casos.push([`inspecao ${decisao}`, doc.id]);
    }

    // (b) NC de QUANTIDADE (origem RECEBIMENTO): a aceitacao NAO move saldo nenhum. Era aqui que
    // a literal antiga mentia — e este e o caso MAIS COMUM de aceitacao.
    const { itemId } = await novoItem({ esperada: 10, recebida: 6 });
    const { nc: quant } = await sync(itemId);
    const dq = await decidir(quant.id, 'ACEITAR');
    assert.strictEqual(dq.execucao_estado, 'NAO_SE_APLICA');
    assert.strictEqual(dq.liberacao.efeito, 'SEM_BLOQUEIO',
      'a NC de quantidade passou a liberar saldo — a premissa deste cenario mudou');
    casos.push(['quantidade ACEITAR', quant.id]);

    for (const [nome, id] of casos) {
      assert.strictEqual((await linhaDe(id)).execucao_em, null, `${nome}: gravou execucao_em`);
      const e = await erroDe(() => cancelar(id, 'anular a aceitacao ja executada'));
      assert.strictEqual(e.status, 409, `${nome} nao recusou`);
      assert.strictEqual(e.message, 'Esta decisão não deixou execução pendente — não há o que encerrar',
        `${nome} caiu na literal errada`);
      // A guarda que nasceu do achado: a frase NAO pode afirmar efeito de estoque, porque em (b)
      // nada se moveu.
      assert.ok(!/liberou o material/.test(e.message),
        `${nome}: a literal voltou a afirmar movimento de saldo que pode nao ter havido`);
    }
  });

  await test('(8) ja CANCELADA recusa', async () => {
    const { id } = await ncDecididaPendente({ reprovada: 1 });
    await cancelar(id, 'primeiro cancelamento');
    const e = await erroDe(() => cancelar(id, 'segundo cancelamento'));
    assert.strictEqual(e.status, 409);
    assert.strictEqual(e.message, 'Esta não conformidade já está cancelada');
    assert.strictEqual((await linhaDe(id)).motivo_cancelamento, 'primeiro cancelamento',
      'o segundo cancelamento sobrescreveu o motivo do primeiro');
  });

  // ── (9) a (11) resposta, fila e trilha ─────────────────────────────────────────────────────
  await test('(9) a mensagem de sucesso, unica — e ela fala da decisao E da cobranca', async () => {
    const { id } = await ncDecididaPendente({ reprovada: 1, decisao: 'ANALISE_ENGENHARIA' });
    const r = await cancelar(id, 'engenharia dispensou a analise');
    assert.strictEqual(r.cancelamento.mensagem,
      'Documento cancelado — a decisão fica registrada, e a execução deixa de ser cobrada');
    assert.strictEqual(r.cancelamento.estado_anterior, 'DECIDIDA');
    assert.strictEqual(r.cancelamento.execucao_estado_anterior, 'PENDENTE');
  });

  await test('(10) a fila `?execucao=PENDENTE` NAO traz a cancelada', async () => {
    const { id } = await ncDecididaPendente({ reprovada: 2, decisao: 'SUBSTITUICAO' });
    const antes = await nc.listarNaoConformidades(db, { execucao: 'PENDENTE' });
    assert.ok(antes.some((l) => l.id === id), 'a decidida nao entrou na fila — premissa quebrada');

    await cancelar(id, 'substituicao negociada fora do sistema');
    const depois = await nc.listarNaoConformidades(db, { execucao: 'PENDENTE' });
    assert.ok(!depois.some((l) => l.id === id),
      'a cancelada continua na fila do Compras — o `AND status = DECIDIDA` do filtro deixou de valer');
    assert.strictEqual((await linhaDe(id)).execucao_estado, 'PENDENTE');
  });

  await test('(11) a trilha carrega os dois campos anteriores E o discriminador', async () => {
    const { id } = await ncDecididaPendente({ reprovada: 2 });
    await cancelar(id, 'peca serializada, baixa manual em Movimentacoes');

    const trilha = await trilhaDe(id);
    const cancelou = trilha.filter((l) => l.acao === 'NC_CANCELADA');
    assert.strictEqual(cancelou.length, 1, `verbos NC_CANCELADA: ${cancelou.length}`);
    assert.strictEqual(cancelou[0].usuario_nome, QUALIDADE.nome);
    assert.strictEqual(cancelou[0].justificativa, 'peca serializada, baixa manual em Movimentacoes');
    const antes = JSON.parse(cancelou[0].dados_anteriores);
    assert.strictEqual(antes.status, 'DECIDIDA');
    assert.strictEqual(antes.execucao_estado, 'PENDENTE',
      'a trilha e o UNICO lugar que diz que havia execucao pendente quando se cancelou');
    // ⚠️ O DISCRIMINADOR na trilha — achado da Fase 5: os DOIS escritores de CANCELADA usam o
    // mesmo verbo, e sem esta marca quem audita credita a anulacao a quem apenas reconferiu.
    const novos = JSON.parse(cancelou[0].dados_novos);
    assert.strictEqual(novos.automatico, false, 'a trilha nao diz que foi o cancelamento HUMANO');
    assert.strictEqual(novos.cancelado_por_id, QUALIDADE.id);
    assert.deepStrictEqual(trilha.map((l) => l.acao), ['NC_ABERTA', 'NC_DECIDIDA', 'NC_CANCELADA']);
  });

  // ── (12) a (16): a RN-05, e o (16) nasceu do CRITICAL da Fase 5 ────────────────────────────
  await test('(12) [RN-05a] cancelada por PESSOA + reenvio sem mudanca de fato => NENHUMA NC nova', async () => {
    const { id, itemId } = await ncQuantidadeDecidida({ esperada: 10, recebida: 8 });
    await cancelar(id, 'falta absorvida no acerto com o fornecedor, sem reposicao');

    // O reenvio da NF: mesma quantidade, mesmo fato. O gancho NAO deve abrir nada.
    const r = await sync(itemId);
    assert.strictEqual(r.efeito, 'NENHUMA', `o gancho devolveu ${r.efeito} — reabriu o que uma pessoa anulou`);
    const linhas = await ncsDoItem(itemId);
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
    assert.strictEqual((await ncsDoItem(itemId)).length, 2, 'a segunda NC nao nasceu');
  });

  await test('(14) [RN-05c] cancelada por pessoa -> item CORRIGIDO -> quebra igual => NASCE NC nova', async () => {
    const { id, itemId } = await ncQuantidadeDecidida({ esperada: 10, recebida: 8 });
    await cancelar(id, 'primeira leitura era da balanca velha');

    // O item e CORRIGIDO. Este passo tem de CARIMBAR `fato_superado_em` na linha CANCELADA.
    await setQtd(itemId, 10);
    await sync(itemId);
    assert.ok((await linhaDe(id)).fato_superado_em,
      'o carimbo de fato superado NAO alcancou a linha cancelada por pessoa — e o "silencio completo" do passo seguinte');

    // Quebra de novo, no MESMO valor. Como o fato foi superado, e problema NOVO.
    await setQtd(itemId, 8);
    const r = await sync(itemId);
    assert.strictEqual(r.efeito, 'ABERTA', `o gancho devolveu ${r.efeito}: falta real e viva, e ZERO NC no modulo`);
    assert.strictEqual((await ncsDoItem(itemId)).length, 2, 'a NC do erro novo nao nasceu');
  });

  await test('(15) [RN-05d] cancelada por pessoa NAO volta ao cartao de divergencia', async () => {
    const { id, itemId } = await ncQuantidadeDecidida({ esperada: 10, recebida: 7 });

    const noCartao = async (item) => {
      const linhas = await listarDivergenciasRecebimento(db, { dias: 30, excluirComNC: true });
      return linhas.some((l) => l.item_id === item);
    };
    assert.strictEqual(await noCartao(itemId), false, 'com NC DECIDIDA o item ja deveria estar fora do cartao');

    await cancelar(id, 'divergencia resolvida com o fornecedor por telefone');
    assert.strictEqual(await noCartao(itemId), false,
      'o item voltou ao cartao como divergencia NAO DOCUMENTADA — e nao existe porta para documenta-la');

    // A metade POSITIVA, obrigatoria: um item divergente SEM NC nenhuma TEM de aparecer. Sem ela o
    // cenario passaria com um cartao que nao lista nada.
    const { itemId: semNc } = await novoItem({ esperada: 10, recebida: 3 });
    assert.strictEqual(await noCartao(semNc), true,
      'o cartao nao lista nem o item divergente sem NC — ele esta vazio, e o cenario acima nao prova nada');

    // E a outra metade, que e o corte de escopo: NC ABERTA tambem exclui do cartao (ela E o
    // documento), mas cancelar ABERTA nao e possivel — entao nao ha caminho para o item sair do
    // cartao sem documento vivo. Era isso que a RN-01 quebrava.
    const { nc: aberta } = await sync(semNc);
    assert.strictEqual(aberta.status, 'ABERTA');
    assert.strictEqual(await noCartao(semNc), false, 'a NC ABERTA deixou de excluir o item do cartao');
  });

  await test('(16) [CRITICAL da Fase 5] o carimbo alcanca a encerrada MESMO com outra NC aberta', async () => {
    // O ramo que a suite nao cobria: `if (aberta)` retorna em TODOS os caminhos, entao o carimbo,
    // que vivia depois dele, nunca rodava quando havia outro documento aberto no instante da
    // correcao. Reproduzido por sonda de uma lente da Fase 5.
    const { id, itemId } = await ncQuantidadeDecidida({ esperada: 10, recebida: 8 });
    await cancelar(id, 'primeira leitura descartada, ver laudo');

    // O fato MUDA: nasce a segunda NC, e ela fica ABERTA.
    await setQtd(itemId, 7);
    const nova = await sync(itemId);
    assert.strictEqual(nova.efeito, 'ABERTA', `o fato mudou e nao abriu NC nova: ${nova.efeito}`);
    const abertaId = nova.nc.id;

    // O operador CORRIGE. Com a NC#2 ABERTA, o `if (aberta)` a cancela e RETORNA — e o carimbo da
    // NC#1 (encerrada) tem de ter rodado ANTES disso.
    await setQtd(itemId, 10);
    const corrige = await sync(itemId);
    assert.strictEqual(corrige.efeito, 'CANCELADA', `a correcao devolveu ${corrige.efeito}`);
    assert.ok((await linhaDe(id)).fato_superado_em,
      'a NC#1 encerrada NAO foi carimbada porque havia outra NC aberta — e o "silencio completo" vem no passo seguinte');
    assert.strictEqual((await linhaDe(abertaId)).status, 'CANCELADA', 'a NC#2 aberta nao foi cancelada pelo gancho');

    // O passo seguinte: quebra no MESMO valor da NC#1. Sem o carimbo, nada nasceria.
    await setQtd(itemId, 8);
    const r = await sync(itemId);
    assert.strictEqual(r.efeito, 'ABERTA',
      `o gancho devolveu ${r.efeito}: falta real e viva, ZERO NC no modulo e ZERO cartao`);
    assert.strictEqual((await ncsDoItem(itemId)).length, 3, 'a terceira NC nao nasceu');
  });

  // ── (17) e (18): concorrencia, e a literal que mentia do outro lado ────────────────────────
  await test('(17) a corrida `cancelar x cancelar`: UM sucesso, UMA trilha', async () => {
    // ⚠️ O fechamento da T2 declarou "a corrida nao e reproduzivel no harness". Verdade para
    // `cancelar x executar`; FALSO para esta — uma lente da Fase 5 mediu que, sem o claim, o
    // `Promise.all` dava DOIS sucessos e DUAS linhas de trilha, com o segundo chamador recebendo
    // 200 sobre documento ja cancelado. O claim inteiro era apagavel com 39 cenarios verdes.
    const { id } = await ncDecididaPendente({ reprovada: 2 });
    const [a, b] = await Promise.allSettled([
      nc.cancelarNaoConformidade(db, QUALIDADE, id, { motivo: 'anulado pela Fulana' }),
      nc.cancelarNaoConformidade(db, QUALIDADE_2, id, { motivo: 'anulado pela Beltrana' }),
    ]);
    const ok = [a, b].filter((r) => r.status === 'fulfilled');
    const nao = [a, b].filter((r) => r.status === 'rejected');
    assert.strictEqual(ok.length, 1, `${ok.length} cancelamentos passaram — o claim nao serializou`);
    assert.strictEqual(nao.length, 1, `${nao.length} recusas`);
    assert.strictEqual(nao[0].reason.status, 409, `a recusa veio com ${nao[0].reason.status}`);

    // UMA linha de trilha: e a metade que prova que nao foi so a resposta que mudou.
    const cancelou = (await trilhaDe(id)).filter((l) => l.acao === 'NC_CANCELADA');
    assert.strictEqual(cancelou.length, 1, `${cancelou.length} linhas NC_CANCELADA na trilha`);
    // E o motivo gravado e o do vencedor, nao uma mistura.
    const linha = await linhaDe(id);
    assert.ok(['anulado pela Fulana', 'anulado pela Beltrana'].includes(linha.motivo_cancelamento),
      `motivo gravado inesperado: ${linha.motivo_cancelamento}`);
    assert.strictEqual(linha.cancelado_por_nome,
      linha.motivo_cancelamento === 'anulado pela Fulana' ? QUALIDADE.nome : QUALIDADE_2.nome,
      'o autor gravado nao corresponde ao motivo gravado — duas escritas se misturaram');
  });

  await test('(18) `/executar` sobre documento CANCELADO nao mente sobre execucao registrada', async () => {
    // ⚠️ Era a MESMA classe de mentira que o achado 9 da Fase 2 corrigiu no lado do cancelamento,
    // intacta deste lado: o `changes === 0` do claim da execucao devolvia a literal fixa
    // "A execucao desta nao conformidade JA FOI REGISTRADA" — com `execucao_em` NULL e status
    // CANCELADA. E este e o estado que a Etapa 46 criou: o furo C64 depois da saida nova.
    const { id } = await ncDecididaPendente({ reprovada: 2 });
    await cancelar(id, 'baixa manual, documento anulado');
    const linha = await linhaDe(id);
    assert.strictEqual(linha.status, 'CANCELADA');
    assert.strictEqual(linha.execucao_em, null, 'a premissa do cenario mudou: ha execucao registrada');
    assert.strictEqual(linha.decisao, 'DEVOLVER', 'a premissa mudou: o documento nao esta decidido');

    const e = await erroDe(() => nc.registrarExecucao(db, COMPRAS, id, { observacoes: 'coleta 71' }));
    assert.ok(e, 'executar um documento cancelado passou');
    // A literal EXATA, e ela e o achado: antes do fix-round este caso caia em `NAO_DECIDIDA`
    // ("So e possivel registrar a execucao de uma nao conformidade decidida") sobre um documento
    // que FOI decidido — a frase mandava decidir o que ja estava decidido.
    assert.strictEqual(e.message, 'Esta não conformidade foi cancelada — não há execução a registrar');
    assert.ok(!/já foi registrada/.test(e.message),
      `a literal voltou a afirmar execucao registrada: ${e.message}`);
    assert.strictEqual((await linhaDe(id)).execucao_em, null, 'a recusa gravou execucao_em');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
