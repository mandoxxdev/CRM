/**
 * Etapa 43, T1 — o SERVICO da nao conformidade numerada (`nonConformityService.js`).
 *
 * Plano:  docs/superpowers/plans/2026-09-28-almoxarifado-etapa43-nao-conformidade-numerada.md (T1)
 * Design: docs/superpowers/specs/2026-09-28-almoxarifado-etapa43-nao-conformidade-numerada-design.md
 *
 * Este arquivo chama o SERVICO DIRETO, com o `db` do harness. As rotas sao da T2 e ainda nao
 * existem — um teste por HTTP aqui estaria medindo a ausencia das rotas, nao o servico.
 *
 * ── O QUE CADA CENARIO PRENDE ────────────────────────────────────────────────────────────────
 *   (1)  enum: as quatro literais de recusa da porta manual;
 *   (2)  numeracao `NC-` unica e o FATO CONGELADO na abertura (D2), com `material_id` e
 *        `recebimento_id` gravados NA PROPRIA NC — e o que torna a listagem nao-polimorfica;
 *   (3)  RN-08: a segunda abertura identica devolve `null`, e quem barra e o INDICE PARCIAL;
 *   (4)  RN-04: reconferir com NC ABERTA atualiza o fato congelado;
 *   (5)  RN-05: a divergencia sumiu => CANCELADA automatica, com motivo e trilha;
 *   (6)  RN-10: NC encerrada + MESMA divergencia NAO reabre; divergencia MUDADA reabre;
 *   (7)  RN-11: recebimento PROCESSADO nao atualiza e nao cancela — mas ABRE;
 *   (8)  RN-06: decidir grava decisao/autor/justificativa + trilha `NC_DECIDIDA`;
 *   (9)  RN-06: decidir a mesma NC duas vezes => 409; justificativa vazia => 400;
 *   (10) RN-03: divergencia de 7e-16 NAO abre NC — o cenario do CONTROLE POSITIVO;
 *   (11) listagem: filtro de status e `limite` clampado em 500 na fronteira do SQL;
 *   (12) D9: a NC da inspecao, com o `tipo` pela prioridade declarada.
 *
 * ── GUARDA ANTI-TESTE-VAZIO ──────────────────────────────────────────────────────────────────
 * Quase todo cenario de "NAO acontece" aqui tem irmao positivo NO MESMO cenario, porque um
 * "nenhuma NC foi aberta" passa identico com o servico morto, com o fixture errado ou com a
 * tabela vazia por outro motivo:
 *   - (3) afirma que a PRIMEIRA abriu antes de afirmar que a segunda devolveu `null`;
 *   - (6) afirma que a divergencia MUDADA reabre, depois que a IGUAL nao reabre;
 *   - (7) afirma que PROCESSADO ABRE, depois que nao atualiza nem cancela;
 *   - (10) afirma que o MESMO item, com divergencia de verdade, ABRE.
 *
 * O cenario (10) e o alvo do controle positivo obrigatorio da T1: com
 * `EPSILON_DIVERGENCIA = 0` em `divergencia.js`, `abs(7e-16) > 0` passa a ser verdade e a
 * assercao "divergencia de 7e-16 nao pode abrir NC" cai.
 *
 * Executar: cd server && node tests/api/naoConformidadeServico.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { EPSILON_DIVERGENCIA } = require('../../services/almoxarifado/divergencia');
const receiptService = require('../../services/almoxarifado/receiptService');
const nc = require('../../services/almoxarifado/nonConformityService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 43, nome: 'Admin Etapa43', role: 'admin', is_superadmin: 1, email: 'e43@test.com' };
const QUALIDADE = { id: 431, nome: 'Fulano Qualidade', perfil_almoxarifado: 'QUALIDADE' };

let seq = 0;
const uniq = (p) => `${p}-${Date.now() % 1000000}-${++seq}`;

/** Erro capturado como dado: `{ message, status }`, ou `null` quando NAO houve erro. */
async function erroDe(fn) {
  try { await fn(); return null; } catch (e) { return { message: e.message, status: e.status }; }
}

(async () => {
  console.log('\n=== Etapa 43 T1: servico da nao conformidade numerada ===\n');
  const { db, close } = await createTestApp({ user: { ...ADMIN } });

  async function novoMaterial() {
    const r = await dbRun(db, 'INSERT INTO materiais_almoxarifado (codigo, nome, unidade) VALUES (?,?,?)',
      [uniq('MAT-E43'), 'Material da Etapa 43', 'KG']);
    return r.lastID;
  }

  /** Um recebimento com UM item, quantidades sob controle do cenario. */
  async function novoItem({ esperada = 10, recebida = null, status = 'RECEBIDO' } = {}) {
    const materialId = await novoMaterial();
    const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal) VALUES (?,?,?)`, [uniq('REC-E43'), status, uniq('NF')]);
    const item = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`,
      [rec.lastID, materialId, esperada, recebida]);
    return { materialId, recebimentoId: rec.lastID, itemId: item.lastID };
  }

  const setQtd = (itemId, q) => dbRun(db,
    'UPDATE recebimentos_material_itens_almoxarifado SET quantidade_recebida = ? WHERE id = ?', [q, itemId]);

  const setStatusRecebimento = (recebimentoId, status) => dbRun(db,
    'UPDATE recebimentos_material_almoxarifado SET status = ? WHERE id = ?', [status, recebimentoId]);

  const ncsDoItem = (itemId) => dbAll(db, `SELECT * FROM nao_conformidades_almoxarifado
    WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ? ORDER BY id`, [itemId]);

  const trilhaDe = (id) => dbAll(db, `SELECT acao, usuario_nome, justificativa FROM auditoria_log_almoxarifado
    WHERE entidade = 'nao_conformidade' AND entidade_id = ? ORDER BY id`, [id]);

  const abrirManual = (dados) => nc.abrirNaoConformidade(db, ADMIN, dados);

  // ── (1) Enums e `referencia_id` ────────────────────────────────────────────────────────────
  await test('(1) enum invalido e `referencia_id` nao inteiro recusam com a literal do contrato', async () => {
    const { itemId } = await novoItem({ recebida: 8 });
    const base = { origem: 'RECEBIMENTO', referencia_tipo: 'RECEBIMENTO_ITEM', referencia_id: itemId, tipo: 'QUANTIDADE' };

    // A metade POSITIVA primeiro: sem ela os quatro 400 abaixo passariam com o servico incapaz
    // de abrir qualquer coisa.
    const ok = await abrirManual({ ...base, descricao: 'abertura valida' });
    assert.ok(ok && ok.id, `a abertura valida falhou: ${JSON.stringify(ok)}`);

    const casos = [
      [{ ...base, origem: 'INVENTARIO' }, 'Origem inválida'],
      [{ ...base, tipo: 'ATRASO' }, 'Tipo de não conformidade inválido'],
      [{ ...base, referencia_tipo: 'PEDIDO' }, 'Tipo de referência inválido'],
      [{ ...base, referencia_id: 1.5 }, 'Referência inválida'],
      [{ ...base, referencia_id: 'abc' }, 'Referência inválida'],
      [{ ...base, referencia_id: 0 }, 'Referência inválida'],
    ];
    for (const [dados, literal] of casos) {
      const e = await erroDe(() => abrirManual(dados));
      assert.ok(e, `${literal}: a abertura passou em vez de recusar (${JSON.stringify(dados)})`);
      assert.strictEqual(e.message, literal, `mensagem errada para ${JSON.stringify(dados)}: ${e.message}`);
      assert.strictEqual(e.status, 400, `${literal} veio com status ${e.status}`);
    }

    // `1.5` e o caso do precedente escrito em anexoService: `Number.isFinite` o aceitaria e o
    // SQLite o coagiria para `1`, pendurando o documento no item ERRADO, em silencio.
    const naoExiste = await erroDe(() => abrirManual({ ...base, referencia_id: 99999 }));
    assert.strictEqual(naoExiste.message, 'Item de recebimento não encontrado',
      `referencia inexistente deu ${JSON.stringify(naoExiste)}`);
    assert.strictEqual(naoExiste.status, 404, `referencia inexistente veio com status ${naoExiste.status}`);
  });

  // ── (2) Numero e fato congelado ────────────────────────────────────────────────────────────
  await test('(2) numero `NC-` unico e o FATO congelado na propria NC (material_id/recebimento_id)', async () => {
    const a = await novoItem({ esperada: 10, recebida: 7 });
    const b = await novoItem({ esperada: 5, recebida: 9 });

    const na = await abrirManual({ origem: 'RECEBIMENTO', referencia_tipo: 'RECEBIMENTO_ITEM', referencia_id: a.itemId, tipo: 'QUANTIDADE' });
    const nb = await abrirManual({ origem: 'RECEBIMENTO', referencia_tipo: 'RECEBIMENTO_ITEM', referencia_id: b.itemId, tipo: 'QUANTIDADE' });

    assert.ok(/^NC-[0-9A-Z]+$/.test(na.numero), `numero fora do formato do gerador unico: ${na.numero}`);
    assert.notStrictEqual(na.numero, nb.numero, 'duas NCs sairam com o mesmo numero');
    assert.strictEqual(na.status, 'ABERTA', `a NC nasceu ${na.status} em vez de ABERTA (RN-02)`);

    // D2 + achado 16: sem estas quatro colunas gravadas NA NC, a listagem precisaria de dois
    // caminhos de JOIN e metade das linhas viria com coluna nula.
    assert.strictEqual(na.material_id, a.materialId, 'material_id nao foi congelado na NC');
    assert.strictEqual(na.recebimento_id, a.recebimentoId, 'recebimento_id nao foi congelado na NC');
    assert.strictEqual(na.quantidade_esperada, 10, `quantidade_esperada congelada errada: ${na.quantidade_esperada}`);
    assert.strictEqual(na.quantidade_recebida, 7, `quantidade_recebida congelada errada: ${na.quantidade_recebida}`);
    assert.ok(Math.abs(na.divergencia - (-3)) < 1e-9, `divergencia congelada errada: ${na.divergencia}`);
    assert.ok(Math.abs(nb.divergencia - 4) < 1e-9, `divergencia do excedente errada: ${nb.divergencia}`);
    assert.strictEqual(na.aberto_automaticamente, 0, 'abertura MANUAL veio marcada como automatica');
    assert.strictEqual(na.aberto_por_nome, ADMIN.nome, `autor nao gravado: ${na.aberto_por_nome}`);

    const trilha = await trilhaDe(na.id);
    assert.deepStrictEqual(trilha.map((t) => t.acao), ['NC_ABERTA'],
      `a trilha da abertura veio ${JSON.stringify(trilha.map((t) => t.acao))} (RN-09 pede verbo proprio)`);
  });

  // ── (3) RN-08: idempotencia pelo indice parcial ────────────────────────────────────────────
  await test('(3) [RN-08] segunda abertura identica devolve `null` e o barrador e o INDICE', async () => {
    const { itemId } = await novoItem({ esperada: 10, recebida: 7 });
    const dados = { origem: 'RECEBIMENTO', referencia_tipo: 'RECEBIMENTO_ITEM', referencia_id: itemId, tipo: 'QUANTIDADE' };

    const primeira = await abrirManual(dados);
    assert.ok(primeira && primeira.id, 'a PRIMEIRA abertura falhou — o resto do cenario nao mede nada');

    const segunda = await abrirManual(dados);
    assert.strictEqual(segunda, null, `a segunda abertura devolveu ${JSON.stringify(segunda)} em vez de null`);

    // Outro TIPO no MESMO item PASSA: o indice e composto, nao "uma NC por item".
    const outroTipo = await abrirManual({ ...dados, tipo: 'CERTIFICADO_AUSENTE' });
    assert.ok(outroTipo && outroTipo.id, 'o indice barrou outro TIPO no mesmo item — ele deixou de ser composto');

    const linhas = await ncsDoItem(itemId);
    assert.strictEqual(linhas.length, 2, `${linhas.length} linhas no item: ${JSON.stringify(linhas.map((l) => l.tipo))}`);

    // E o indice e PARCIAL: encerrada a primeira, o mesmo tipo pode nascer de novo (D5).
    await nc.decidirNaoConformidade(db, QUALIDADE, primeira.id, { decisao: 'ACEITAR', justificativa: 'aceito' });
    const terceira = await abrirManual(dados);
    assert.ok(terceira && terceira.id,
      'depois de DECIDIDA a primeira, abrir de novo falhou — o indice unico deixou de ser parcial');
    assert.notStrictEqual(terceira.id, primeira.id, 'a reabertura reaproveitou a linha antiga em vez de inserir outra');
  });

  // ── (4) RN-04: reconferir atualiza o fato ──────────────────────────────────────────────────
  await test('(4) [RN-04] reconferir com NC ABERTA ATUALIZA o fato congelado', async () => {
    const { itemId } = await novoItem({ esperada: 10, recebida: 7 });
    const abriu = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, itemId);
    assert.strictEqual(abriu.efeito, 'ABERTA', `a sincronizacao inicial devolveu ${JSON.stringify(abriu)}`);
    assert.strictEqual(abriu.nc.aberto_automaticamente, 1, 'a abertura por gancho nao marcou `aberto_automaticamente`');

    await setQtd(itemId, 4);
    const r = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, itemId);
    assert.strictEqual(r.efeito, 'ATUALIZADA', `reconferir devolveu ${JSON.stringify(r.efeito)}`);

    const linhas = await ncsDoItem(itemId);
    assert.strictEqual(linhas.length, 1, `reconferir abriu NC nova: ${linhas.length} linhas`);
    assert.strictEqual(linhas[0].quantidade_recebida, 4, `o fato nao foi atualizado: ${linhas[0].quantidade_recebida}`);
    assert.ok(Math.abs(linhas[0].divergencia - (-6)) < 1e-9, `divergencia nao atualizada: ${linhas[0].divergencia}`);
    assert.strictEqual(linhas[0].status, 'ABERTA', 'a atualizacao encerrou a NC');
  });

  // ── (5) RN-05: a divergencia sumiu => cancela ──────────────────────────────────────────────
  await test('(5) [RN-05] corrigir a quantidade CANCELA a NC aberta, com motivo e trilha', async () => {
    const { itemId } = await novoItem({ esperada: 10, recebida: 7 });
    const abriu = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, itemId);
    assert.strictEqual(abriu.efeito, 'ABERTA', 'nao abriu — o cancelamento abaixo nao teria o que medir');

    await setQtd(itemId, 10);
    const r = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, itemId);
    assert.strictEqual(r.efeito, 'CANCELADA', `corrigir devolveu ${JSON.stringify(r.efeito)}`);

    const linha = await dbGet(db, 'SELECT * FROM nao_conformidades_almoxarifado WHERE id = ?', [abriu.nc.id]);
    assert.strictEqual(linha.status, 'CANCELADA', `status ficou ${linha.status}`);
    assert.ok(linha.motivo_cancelamento && /diverg/i.test(linha.motivo_cancelamento),
      `motivo_cancelamento vazio ou sem sentido: ${JSON.stringify(linha.motivo_cancelamento)}`);
    assert.ok(linha.cancelado_em, 'cancelado_em ficou nulo — a NC fecha sem data');

    const acoes = (await trilhaDe(abriu.nc.id)).map((t) => t.acao);
    assert.deepStrictEqual(acoes, ['NC_ABERTA', 'NC_CANCELADA'],
      `a trilha veio ${JSON.stringify(acoes)} — RN-09 exige verbo proprio para o cancelamento`);

    // Idempotente: sincronizar de novo, sem divergencia, nao faz nada e NAO abre NC nova.
    const denovo = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, itemId);
    assert.strictEqual(denovo.efeito, 'NENHUMA', `sincronizar sem divergencia devolveu ${JSON.stringify(denovo.efeito)}`);
    assert.strictEqual((await ncsDoItem(itemId)).length, 1, 'sincronizar de novo criou documento');
  });

  // ── (6) RN-10: nao reabre sem mudanca de FATO ──────────────────────────────────────────────
  await test('(6) [RN-10] NC encerrada + MESMA divergencia nao reabre; divergencia MUDADA reabre', async () => {
    const { itemId } = await novoItem({ esperada: 10, recebida: 7 });
    const abriu = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, itemId);
    await nc.decidirNaoConformidade(db, QUALIDADE, abriu.nc.id, {
      decisao: 'ACEITAR_SOB_DESVIO', justificativa: 'faltou 3 kg, aceito com desvio',
    });

    // O modal de NF reenvia a quantidade de TODOS os itens (receiptService.js:889-890): salvar
    // sem mudar nada NAO pode reabrir documento para um fato que ninguem reobservou.
    const reenvio = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, itemId);
    assert.strictEqual(reenvio.efeito, 'NENHUMA',
      `salvar sem mudar nada devolveu ${JSON.stringify(reenvio.efeito)} — a NC decidida foi reaberta`);
    assert.strictEqual((await ncsDoItem(itemId)).length, 1,
      `reenvio identico gerou documento novo: ${JSON.stringify((await ncsDoItem(itemId)).map((l) => l.numero))}`);

    // A METADE POSITIVA: errar de novo, DIFERENTE, tem de abrir documento novo. Sem esta
    // assercao, a guarda da RN-10 passaria com o gancho inteiro desligado.
    await setQtd(itemId, 2);
    const pior = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, itemId);
    assert.strictEqual(pior.efeito, 'ABERTA', `divergencia MUDADA devolveu ${JSON.stringify(pior.efeito)} — nada reabre nunca`);
    const linhas = await ncsDoItem(itemId);
    assert.strictEqual(linhas.length, 2, `${linhas.length} linhas — a segunda NC nao nasceu`);
    assert.strictEqual(linhas[0].status, 'DECIDIDA', 'a primeira NC deixou de estar DECIDIDA');
    assert.ok(Math.abs(linhas[1].divergencia - (-8)) < 1e-9, `a NC nova congelou ${linhas[1].divergencia}`);

    // E a comparacao usa a REGUA, nao `===`: uma diferenca de 1e-12 contra a NC encerrada e o
    // MESMO fato e nao pode virar documento.
    const outro = await novoItem({ esperada: 10, recebida: 7 });
    const n1 = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, outro.itemId);
    await nc.decidirNaoConformidade(db, QUALIDADE, n1.nc.id, { decisao: 'ACEITAR', justificativa: 'ok' });
    await setQtd(outro.itemId, 7 + (EPSILON_DIVERGENCIA / 10));
    const ruido = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, outro.itemId);
    assert.strictEqual(ruido.efeito, 'NENHUMA',
      `ruido de ponto flutuante abaixo do epsilon reabriu a NC (${JSON.stringify(ruido.efeito)}) — a comparacao da RN-10 nao usa a regua`);
  });

  // ── (7) RN-11: recebimento PROCESSADO ──────────────────────────────────────────────────────
  await test('(7) [RN-11] recebimento PROCESSADO: ABRE, mas nao atualiza e nao cancela', async () => {
    // A string vem do dono, nao da memoria: se `receiptService.STATUS.PROCESSADO` mudar, este
    // cenario tem de cair aqui e nao em producao.
    assert.strictEqual(receiptService.STATUS.PROCESSADO, 'PROCESSADO',
      'o status de processado mudou de nome no receiptService — a guarda da RN-11 esta comparando com string morta');

    const { itemId, recebimentoId } = await novoItem({ esperada: 10, recebida: 7 });
    const abriu = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, itemId);
    assert.strictEqual(abriu.efeito, 'ABERTA', 'setup: a NC anterior ao processamento nao nasceu');

    await setStatusRecebimento(recebimentoId, receiptService.STATUS.PROCESSADO);

    // 1) nao ATUALIZA: o estoque ja foi creditado e a conta a pagar gerada com ESTE fato.
    await setQtd(itemId, 4);
    const at = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, itemId);
    assert.strictEqual(at.efeito, 'BLOQUEADA_PROCESSADO',
      `com recebimento processado a atualizacao devolveu ${JSON.stringify(at.efeito)}`);
    const depois = (await ncsDoItem(itemId))[0];
    assert.strictEqual(depois.quantidade_recebida, 7,
      `o fato congelado foi reescrito depois do processamento: ${depois.quantidade_recebida}`);

    // 2) nao CANCELA: e a B161 ganhando um irmao — documento apagado por gesto posterior.
    await setQtd(itemId, 10);
    const canc = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, itemId);
    assert.strictEqual(canc.efeito, 'BLOQUEADA_PROCESSADO',
      `com recebimento processado o cancelamento devolveu ${JSON.stringify(canc.efeito)}`);
    assert.strictEqual((await ncsDoItem(itemId))[0].status, 'ABERTA',
      'a NC de uma falta que ja virou estoque e dinheiro foi CANCELADA por uma reconferencia');

    // 3) mas ABRE: divergencia descoberta DEPOIS do processamento e justamente o que precisa de
    // documento. Criar nao e destruir — a assimetria e de proposito (D10).
    const novo = await novoItem({ esperada: 10, recebida: 6, status: receiptService.STATUS.PROCESSADO });
    const nasceu = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, novo.itemId);
    assert.strictEqual(nasceu.efeito, 'ABERTA',
      `divergencia achada com recebimento processado devolveu ${JSON.stringify(nasceu.efeito)} — a guarda virou mordaca`);
  });

  // ── (8) e (9) decisao ──────────────────────────────────────────────────────────────────────
  await test('(8) [RN-06] decidir grava decisao, autor, justificativa e trilha propria', async () => {
    const { itemId } = await novoItem({ esperada: 10, recebida: 7 });
    const abriu = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, itemId);

    const dec = await nc.decidirNaoConformidade(db, QUALIDADE, abriu.nc.id, {
      decisao: 'SUCATEAR', justificativa: 'material oxidado, sem recuperacao',
    });
    assert.strictEqual(dec.status, 'DECIDIDA', `status apos decidir: ${dec.status}`);
    assert.strictEqual(dec.decisao, 'SUCATEAR', `decisao gravada: ${dec.decisao}`);
    assert.strictEqual(dec.justificativa, 'material oxidado, sem recuperacao', `justificativa: ${dec.justificativa}`);
    assert.strictEqual(dec.decidido_por_nome, QUALIDADE.nome, `autor da decisao: ${dec.decidido_por_nome}`);
    assert.ok(dec.decidido_em, 'decidido_em ficou nulo — decisao sem data nao responde "quando"');

    const acoes = (await trilhaDe(abriu.nc.id)).map((t) => t.acao);
    assert.deepStrictEqual(acoes, ['NC_ABERTA', 'NC_DECIDIDA'],
      `a trilha veio ${JSON.stringify(acoes)} — os tres verbos sao DISTINTOS (RN-09)`);

    // O fato congelado NAO foi tocado pela decisao (D2).
    assert.strictEqual(dec.quantidade_recebida, 7, `a decisao reescreveu o fato: ${dec.quantidade_recebida}`);
  });

  await test('(9) [RN-06] decidir duas vezes => 409; decisao fora do enum e justificativa vazia => 400', async () => {
    const { itemId } = await novoItem({ esperada: 10, recebida: 7 });
    const abriu = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, itemId);
    const id = abriu.nc.id;

    const enumRuim = await erroDe(() => nc.decidirNaoConformidade(db, QUALIDADE, id, { decisao: 'ARQUIVAR', justificativa: 'x' }));
    assert.strictEqual(enumRuim.message, 'Decisão inválida', `decisao fora do enum: ${JSON.stringify(enumRuim)}`);
    assert.strictEqual(enumRuim.status, 400, `decisao fora do enum veio ${enumRuim.status}`);

    for (const vazia of [undefined, '', '   ']) {
      const e = await erroDe(() => nc.decidirNaoConformidade(db, QUALIDADE, id, { decisao: 'ACEITAR', justificativa: vazia }));
      assert.ok(e, `justificativa ${JSON.stringify(vazia)} passou`);
      assert.strictEqual(e.message, 'Justificativa é obrigatória para decidir a não conformidade',
        `justificativa ${JSON.stringify(vazia)}: ${e.message}`);
      assert.strictEqual(e.status, 400, `justificativa ${JSON.stringify(vazia)} veio ${e.status}`);
    }

    const inexistente = await erroDe(() => nc.decidirNaoConformidade(db, QUALIDADE, 999999, { decisao: 'ACEITAR', justificativa: 'ok' }));
    assert.strictEqual(inexistente.message, 'Não conformidade não encontrada', JSON.stringify(inexistente));
    assert.strictEqual(inexistente.status, 404, `inexistente veio ${inexistente.status}`);

    const naoNumerico = await erroDe(() => nc.decidirNaoConformidade(db, QUALIDADE, 'abc', { decisao: 'ACEITAR', justificativa: 'ok' }));
    assert.strictEqual(naoNumerico.status, 404,
      `id nao numerico veio ${naoNumerico && naoNumerico.status} — o SQLite coage texto em silencio`);

    // A primeira decisao PASSA (sem isto, o 409 abaixo passaria com `decidir` sempre recusando).
    const ok = await nc.decidirNaoConformidade(db, QUALIDADE, id, { decisao: 'DEVOLVER', justificativa: 'devolver ao fornecedor' });
    assert.strictEqual(ok.status, 'DECIDIDA', `a decisao valida devolveu ${ok.status}`);

    const doisVezes = await erroDe(() => nc.decidirNaoConformidade(db, QUALIDADE, id, { decisao: 'ACEITAR', justificativa: 'mudei de ideia' }));
    assert.strictEqual(doisVezes.message, 'Esta não conformidade já foi encerrada', JSON.stringify(doisVezes));
    assert.strictEqual(doisVezes.status, 409, `decidir duas vezes veio ${doisVezes.status}`);

    const linha = await dbGet(db, 'SELECT decisao FROM nao_conformidades_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(linha.decisao, 'DEVOLVER', `a segunda decisao sobrescreveu a primeira: ${linha.decisao}`);
  });

  // ── (10) A REGUA — cenario do controle positivo ────────────────────────────────────────────
  await test('(10) [RN-03] divergencia de 7e-16 NAO abre NC; a mesma linha com falta de verdade ABRE', async () => {
    // Os numeros sao os do proprio `divergencia.js`: contar 0.2 contra um esperado
    // 0.1999999999999993 da 7e-16, e quem ACERTOU nao pode ganhar documento.
    const ruido = await novoItem({ esperada: 0.1999999999999993, recebida: 0.2 });
    const bruto = 0.2 - 0.1999999999999993;
    // Esta guarda NAO depende do epsilon de proposito: ela so prova que o fixture ainda carrega
    // o ruido (se `bruto` virasse 0, o cenario passaria sem medir a regua).
    assert.ok(bruto !== 0, `o fixture perdeu o ruido de ponto flutuante (diferenca ${bruto}) — o cenario nao mede nada`);

    // A ASSERCAO QUE SUSTENTA O CENARIO VEM ANTES de qualquer guarda que leia o epsilon — e ela
    // que o controle positivo (sabotar `EPSILON_DIVERGENCIA` para 0) tem de derrubar. Com a
    // guarda do epsilon na frente, a sabotagem cairia no fixture e provaria menos.
    const r = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, ruido.itemId);
    assert.strictEqual(r.efeito, 'NENHUMA',
      `divergencia de ${bruto} abriu NC (efeito ${JSON.stringify(r.efeito)}) — o servico nao usa a regua de divergencia.js`);
    assert.strictEqual((await ncsDoItem(ruido.itemId)).length, 0,
      'quem contou certo ganhou uma nao conformidade numerada');
    assert.ok(Math.abs(bruto) < EPSILON_DIVERGENCIA,
      `a diferenca ${bruto} nao esta abaixo do epsilon ${EPSILON_DIVERGENCIA} — o fixture deixou de exercitar a regua`);

    // Item sem `quantidade_recebida` tambem nao abre: ninguem conferiu ainda (RN-03).
    const semConferencia = await novoItem({ esperada: 10, recebida: null });
    const s = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, semConferencia.itemId);
    assert.strictEqual(s.efeito, 'NENHUMA', `item nao conferido devolveu ${JSON.stringify(s.efeito)}`);
    assert.strictEqual((await ncsDoItem(semConferencia.itemId)).length, 0, 'item nunca conferido ganhou NC');

    // A METADE POSITIVA: com falta de VERDADE no mesmo item, abre.
    await setQtd(ruido.itemId, 0.1);
    const abre = await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, ruido.itemId);
    assert.strictEqual(abre.efeito, 'ABERTA',
      `falta real de 0.1 nao abriu NC (${JSON.stringify(abre.efeito)}) — o cenario acima estava passando por o gancho estar morto`);
  });

  // ── (11) Listagem ──────────────────────────────────────────────────────────────────────────
  await test('(11) listagem: filtro de status/origem/material e `limite` clampado em 500', async () => {
    const a = await novoItem({ esperada: 10, recebida: 7 });
    const b = await novoItem({ esperada: 10, recebida: 3 });
    const na = (await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, a.itemId)).nc;
    const nb = (await nc.sincronizarNaoConformidadeQuantidade(db, ADMIN, b.itemId)).nc;
    await nc.decidirNaoConformidade(db, QUALIDADE, nb.id, { decisao: 'ACEITAR', justificativa: 'aceito' });

    const abertas = await nc.listarNaoConformidades(db, { status: 'ABERTA' });
    assert.ok(abertas.some((l) => l.id === na.id), 'a NC ABERTA sumiu do filtro `status=ABERTA`');
    assert.ok(!abertas.some((l) => l.id === nb.id), 'a NC DECIDIDA apareceu no filtro `status=ABERTA`');

    const decididas = await nc.listarNaoConformidades(db, { status: 'DECIDIDA' });
    assert.ok(decididas.some((l) => l.id === nb.id), 'a NC DECIDIDA sumiu do filtro `status=DECIDIDA`');

    const porMaterial = await nc.listarNaoConformidades(db, { material_id: a.materialId });
    assert.deepStrictEqual(porMaterial.map((l) => l.id), [na.id],
      `filtro por material trouxe ${JSON.stringify(porMaterial.map((l) => l.id))}`);

    // As colunas do LEFT JOIN nao-polimorfico chegam preenchidas para as DUAS origens.
    const linha = porMaterial[0];
    assert.ok(linha.material_codigo, `material_codigo veio ${JSON.stringify(linha.material_codigo)} — o JOIN de material nao casou`);
    assert.ok(linha.recebimento_numero, `recebimento_numero veio ${JSON.stringify(linha.recebimento_numero)}`);
    assert.ok(linha.numero.startsWith('NC-'), `a listagem nao devolve o numero: ${linha.numero}`);

    // O clamp na fronteira do SQL — criar 501 NCs so para ver 500 voltarem provaria o mesmo e
    // custaria segundos (molde de inspecaoHistorico.api.test.js:310).
    const capturas = [];
    const dbFalso = { all(sql, params, cb) { capturas.push({ sql, params }); cb(null, []); } };
    await nc.listarNaoConformidades(dbFalso, { limite: 9999 });
    await nc.listarNaoConformidades(dbFalso, {});
    await nc.listarNaoConformidades(dbFalso, { limite: 'abc' });
    await nc.listarNaoConformidades(dbFalso, { limite: 0 });
    await nc.listarNaoConformidades(dbFalso, { limite: -5 });
    await nc.listarNaoConformidades(dbFalso, { limite: 0.5 });
    await nc.listarNaoConformidades(dbFalso, { limite: 7 });
    const limites = capturas.map((c) => c.params[c.params.length - 1]);
    assert.deepStrictEqual(limites, [500, 100, 100, 100, 100, 100, 7],
      `[9999, ausente, 'abc', 0, -5, 0.5, 7] tinham de virar [500, 100, 100, 100, 100, 100, 7]; vieram ${JSON.stringify(limites)}`);
    assert.ok(capturas.every((c) => /LIMIT \?/.test(c.sql)), 'o limite vai como parametro, nunca interpolado');

    // `obterNaoConformidade`: existe, nao existe, e id nao numerico (o SQLite coage texto).
    const um = await nc.obterNaoConformidade(db, na.id);
    assert.strictEqual(um.id, na.id, 'obterNaoConformidade nao achou a NC que acabou de nascer');
    assert.strictEqual(await nc.obterNaoConformidade(db, 999999), null, 'obter de id inexistente nao devolveu null');
    assert.strictEqual(await nc.obterNaoConformidade(db, 'abc'), null, 'obter de id nao numerico nao devolveu null');
  });

  // ── (12) D9: a NC da inspecao ──────────────────────────────────────────────────────────────
  await test('(12) [D9] NC de inspecao: UMA por inspecao, tipo por prioridade, flags na descricao', async () => {
    const { itemId, materialId, recebimentoId } = await novoItem({ esperada: 10, recebida: 10 });
    const inserirInspecao = async (flags) => {
      const r = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
        (recebimento_item_id, conforme, divergencia_dimensional, certificado_ausente, dano_fisico,
         material_incorreto, quantidade_aprovada, quantidade_reprovada, responsavel_nome)
        VALUES (?,?,?,?,?,?,?,?,?)`, [
        itemId, 0, flags.dimensional || 0, flags.certificado || 0, flags.dano || 0,
        flags.incorreto || 0, 10 - (flags.reprovada ?? 4), flags.reprovada ?? 4, 'Inspetor E43']);
      return r.lastID;
    };

    // Prioridade declarada: MATERIAL_INCORRETO vence DANO_FISICO, que vence DIMENSIONAL...
    const todas = await inserirInspecao({ dimensional: 1, certificado: 1, dano: 1, incorreto: 1 });
    const n1 = await nc.abrirNaoConformidadeDeInspecao(db, ADMIN, todas);
    assert.ok(n1, 'inspecao com reprovacao nao abriu NC');
    assert.strictEqual(n1.tipo, 'MATERIAL_INCORRETO', `prioridade errada com tudo marcado: ${n1.tipo}`);
    assert.strictEqual(n1.origem, 'INSPECAO', `origem veio ${n1.origem}`);
    assert.strictEqual(n1.referencia_tipo, 'INSPECAO', `referencia_tipo veio ${n1.referencia_tipo}`);
    assert.strictEqual(n1.referencia_id, todas, `referencia_id nao e o id da inspecao: ${n1.referencia_id}`);
    // Material e recebimento tambem congelados aqui — e o que dispensa o JOIN polimorfico.
    assert.strictEqual(n1.material_id, materialId, 'material_id nao foi congelado na NC de inspecao');
    assert.strictEqual(n1.recebimento_id, recebimentoId, 'recebimento_id nao foi congelado na NC de inspecao');
    // Nada se perde: o `tipo` agrupa, a descricao conta a historia.
    for (const palavra of ['dimensional', 'certificado', 'dano', 'incorreto']) {
      assert.ok(new RegExp(palavra, 'i').test(n1.descricao || ''),
        `a flag "${palavra}" sumiu da descricao: ${JSON.stringify(n1.descricao)}`);
    }

    const soDim = await inserirInspecao({ dimensional: 1, certificado: 1 });
    assert.strictEqual((await nc.abrirNaoConformidadeDeInspecao(db, ADMIN, soDim)).tipo, 'DIMENSIONAL',
      'DIMENSIONAL tinha de vencer CERTIFICADO_AUSENTE');

    const soCert = await inserirInspecao({ certificado: 1 });
    assert.strictEqual((await nc.abrirNaoConformidadeDeInspecao(db, ADMIN, soCert)).tipo, 'CERTIFICADO_AUSENTE',
      'com so o certificado marcado o tipo tinha de ser CERTIFICADO_AUSENTE');

    const semFlag = await inserirInspecao({});
    assert.strictEqual((await nc.abrirNaoConformidadeDeInspecao(db, ADMIN, semFlag)).tipo, 'QUANTIDADE',
      'reprovou sem flag nenhuma: o fato e a reprovacao, e o tipo cai em QUANTIDADE');

    // Reprovada = 0 NAO abre documento (a inspecao aprovou).
    const aprovada = await inserirInspecao({ reprovada: 0 });
    assert.strictEqual(await nc.abrirNaoConformidadeDeInspecao(db, ADMIN, aprovada), null,
      'inspecao APROVADA abriu nao conformidade');

    const fantasma = await erroDe(() => nc.abrirNaoConformidadeDeInspecao(db, ADMIN, 999999));
    assert.strictEqual(fantasma && fantasma.message, 'Inspeção não encontrada', JSON.stringify(fantasma));
  });

  // ── Enums exportados ───────────────────────────────────────────────────────────────────────
  await test('(13) os cinco enums sao exportados e batem com o design', async () => {
    assert.deepStrictEqual(nc.NC_ORIGENS, ['RECEBIMENTO', 'INSPECAO'], JSON.stringify(nc.NC_ORIGENS));
    assert.deepStrictEqual(nc.NC_REFERENCIA_TIPOS, ['RECEBIMENTO_ITEM', 'INSPECAO'], JSON.stringify(nc.NC_REFERENCIA_TIPOS));
    assert.deepStrictEqual(nc.NC_TIPOS,
      ['QUANTIDADE', 'DIMENSIONAL', 'CERTIFICADO_AUSENTE', 'DANO_FISICO', 'MATERIAL_INCORRETO', 'OUTRO'],
      JSON.stringify(nc.NC_TIPOS));
    assert.deepStrictEqual(nc.NC_DECISOES,
      ['ACEITAR', 'ACEITAR_SOB_DESVIO', 'DEVOLVER', 'SUBSTITUICAO', 'ANALISE_ENGENHARIA', 'SUCATEAR'],
      JSON.stringify(nc.NC_DECISOES));
    assert.deepStrictEqual(nc.NC_STATUS, ['ABERTA', 'DECIDIDA', 'CANCELADA'], JSON.stringify(nc.NC_STATUS));

    // Os tres ENCAMINHAMENTOS da inspecao sao REUSADOS, nao reinventados (design, "Enum de
    // decisao"). `inspectionService.ENCAMINHAMENTOS` NAO e exportado (module.exports:475-484),
    // entao a conferencia e feita sobre o CODIGO-FONTE do dono, e nao sobre uma lista repetida
    // aqui: um `require` devolveria `undefined` e o laco passaria vazio, provando nada.
    const fonteInspecao = require('fs')
      .readFileSync(require('path').join(__dirname, '../../services/almoxarifado/inspectionService.js'), 'utf8');
    const decl = fonteInspecao.match(/const ENCAMINHAMENTOS = \[([^\]]*)\]/);
    assert.ok(decl, 'ENCAMINHAMENTOS sumiu de inspectionService.js — o enum de decisao perdeu a fonte que ele reusa');
    const encaminhamentos = decl[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
    assert.strictEqual(encaminhamentos.length, 3, `ENCAMINHAMENTOS tem ${encaminhamentos.length} valores: ${JSON.stringify(encaminhamentos)}`);
    for (const e of encaminhamentos) {
      assert.ok(nc.NC_DECISOES.includes(e), `o encaminhamento "${e}" da inspecao nao existe em NC_DECISOES`);
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
