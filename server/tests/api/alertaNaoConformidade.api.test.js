/**
 * Etapa 43, T4 — a 14a entrada do registro (`NAO_CONFORMIDADE_ABERTA`) e a REDE DE SEGURANCA do
 * D6 no cartao `DIVERGENCIA_RECEBIMENTO`.
 *
 * ── O QUE ESTE ARQUIVO MEDE, E POR QUE ELE EXISTE ────────────────────────────────────────────
 * A T3 fez a NC nascer sozinha nos dois escritores de `quantidade_recebida` e na inspecao. Faltava
 * o outro lado: NC que ninguem decide fica ABERTA para sempre em silencio — o documento existe e
 * nao cobra ninguem. A 14a entrada e a cobranca (RN do D6: `ABERTA` ha mais de
 * `alerta_nc_parada_dias`, uma linha por NC, dedupe `nc-<id>`).
 *
 * E o cartao da divergencia passa a EXCLUIR o item que ja virou documento, senao o mesmo item
 * aparece em dois avisos e o usuario aprende a ignorar os dois.
 *
 * ⚠️ A EXCLUSAO DO D6 NAO PODE MORAR EM `listarDivergenciasRecebimento` — e o cenario (7) e a
 * guarda disso. Aquela funcao e o DETECTOR do modulo, dual-mode, chamada direto por
 * `avisarDivergenciasDoRecebimento` nos DOIS escritores. Com a exclusao por dentro dela, o gancho
 * do ato para de avisar assim que existe NC, e o cenario A1 de `alertaEventoGanchos.api.test.js`
 * ("errar de novo, PIOR, avisa de novo" — o bug que a Etapa 17 pagou) morre em silencio. Por isso
 * a exclusao e OPT-IN (`{ excluirComNC: true }`) e so a entrada do alerta a liga.
 *
 * ⚠️ TODA assercao filtra a fila por `evento`+hash (nota de `alertaRegistro.api.test.js:6-8`):
 * os recebimentos e materiais semeados aqui caem AUTOMATICAMENTE em outros alertas do registro, e
 * um contador global mediria o alerta errado.
 *
 * Executar: cd server && node tests/api/alertaNaoConformidade.api.test.js
 */
const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const queueService = require('../../services/almoxarifado/notificationQueueService');
const alertRegistry = require('../../services/almoxarifado/alertRegistry');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const EVENTO = 'NAO_CONFORMIDADE_ABERTA';
const DIVERGENCIA = 'DIVERGENCIA_RECEBIMENTO';
const ADMIN = { id: 190, nome: 'Admin E43 T4', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

function hashDedupe(evento, dedupeChave) {
  return crypto.createHash('sha256').update(`${evento}|${dedupeChave}`).digest('hex');
}

/** A chave ESPERADA, escrita a mao: se a implementacao mudar de formula, este arquivo acusa. */
const chaveEsperada = (ncId) => `nc-${ncId}`;

const filaPorHash = (db, hash) => dbAll(db,
  'SELECT * FROM fila_notificacoes_almoxarifado WHERE hash_dedupe = ?', [hash]);

const setConfig = (db, chave, valor) => dbRun(db,
  `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
   ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

function resultadoDe(resultados, chave) {
  const r = resultados.find((x) => x.chave === chave);
  assert.ok(r, `a varredura nao devolveu entrada para ${chave}: ${JSON.stringify(resultados)}`);
  return r;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  await setConfig(db, 'alertas_estoque_emails', 'qualidade@gmp.ind.br');
  await setConfig(db, 'alertas_estoque_notificar_email', '1');

  let seq = 0;
  async function novoMaterial() {
    seq += 1;
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'KG',0,1)`,
    [`MAT-E43T4-${String(seq).padStart(3, '0')}`, `Chapa E43 T4 ${seq}`]);
    return { id: r.lastID, codigo: `MAT-E43T4-${String(seq).padStart(3, '0')}` };
  }

  /** Recebimento REAL pelo service de producao (molde de alertaEventoGanchos), com um item. */
  async function novoRecebimento(materialId, quantidade) {
    seq += 1;
    const rec = await receiptService.criarRecebimento(db, ADMIN, {
      nota_fiscal: `NF-E43T4-${seq}`,
      itens: [{ material_id: materialId, quantidade }],
    });
    const item = await dbGet(db,
      'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [rec.id]);
    return { recId: rec.id, itemId: item.id };
  }

  /**
   * O caminho REAL da producao: o modal de NF (`PUT /fiscal`) escreve a quantidade, o aviso da
   * Etapa 17 dispara e o gancho da T3 abre a NC. Nada de `INSERT` de NC na mao — o que este
   * arquivo mede e o estado que o usuario produz clicando.
   */
  async function itemComNc(esperada, recebida) {
    const mat = await novoMaterial();
    const { recId, itemId } = await novoRecebimento(mat.id, esperada);
    const wf = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`)
      .send({ acao: 'iniciar_conferencia' });
    assert.strictEqual(wf.status, 200, JSON.stringify(wf.body));
    const res = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`)
      .send({ nota_fiscal: `NF-E43T4-${seq}`, itens: [{ id: itemId, quantidade_recebida: recebida }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const nc = await dbGet(db, `SELECT * FROM nao_conformidades_almoxarifado
      WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ? AND tipo = 'QUANTIDADE'
      ORDER BY id DESC LIMIT 1`, [itemId]);
    assert.ok(nc, `fixture: a T3 tinha de ter aberto a NC do item ${itemId}`);
    return { mat, recId, itemId, nc };
  }

  /**
   * Item divergente SEM NC — o estado que o gancho NAO FATAL deixa quando explode (ele loga um
   * `console.warn` e a quantidade fica gravada sem documento). Escrito pela coluna de proposito:
   * pela rota, a T3 abriria a NC e nao haveria como produzir este estado.
   */
  async function itemDivergenteSemNc(esperada, recebida) {
    const mat = await novoMaterial();
    const { recId, itemId } = await novoRecebimento(mat.id, esperada);
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET quantidade_recebida = ? WHERE id = ?',
      [recebida, itemId]);
    const nc = await dbGet(db, `SELECT id FROM nao_conformidades_almoxarifado
      WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ?`, [itemId]);
    assert.ok(!nc, 'fixture: este item tinha de estar SEM NC (e o estado do gancho que falhou)');
    return { mat, recId, itemId };
  }

  const envelhecerNc = (ncId, dias) => dbRun(db,
    `UPDATE nao_conformidades_almoxarifado SET created_at = datetime('now', '-' || ? || ' days')
     WHERE id = ?`, [dias, ncId]);

  const entradaDaNc = () => {
    const e = alertRegistry.ALERT_REGISTRY.find((x) => x.chave === EVENTO);
    assert.ok(e, `ALERT_REGISTRY nao tem ${EVENTO} — a 14a entrada nao existe`);
    return e;
  };

  async function cartao(chave) {
    const { alertas } = await alertRegistry.montarCentral(db);
    const c = alertas.find((a) => a.chave === chave);
    assert.ok(c, `a central nao trouxe o cartao ${chave}`);
    return { alertas, cartao: c };
  }

  const linhaDaNc = (c, numero) => c.linhas.find((l) => l.numero === numero);
  const linhaDoItem = (c, itemId) => c.linhas.find((l) => l.item_id === itemId);

  // ── (1) A ENTRADA EXISTE, E O REGISTRO TEM 14 ────────────────────────────────────────────────
  await test('(1) a 14a entrada esta no registro, com titulo, janela configuravel e listar function', async () => {
    const e = entradaDaNc();
    assert.strictEqual(e.titulo, 'Não conformidade aberta', e.titulo);
    assert.deepStrictEqual(e.configDias, { chave: 'alerta_nc_parada_dias', default: 7 },
      `a janela tinha de sair da config: ${JSON.stringify(e.configDias)}`);
    assert.strictEqual(typeof e.listar, 'function');
    assert.strictEqual(alertRegistry.ALERT_REGISTRY.length, 14,
      `o registro tinha de ter 14 entradas, tem ${alertRegistry.ALERT_REGISTRY.length}`);
    assert.strictEqual(alertRegistry.ALERT_REGISTRY[13].chave, EVENTO,
      'a entrada nova entra NO FIM — a ordem do registro e a ordem dos cartoes da tela');

    // A janela chega do banco (a chave e SEMEADA — chave nao semeada e ineditavel pelo PUT
    // /configuracoes, licao da Etapa 10 registrada em schema.js).
    const semeada = await dbGet(db,
      "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'alerta_nc_parada_dias'");
    assert.ok(semeada, 'alerta_nc_parada_dias tinha de estar SEMEADA no schema');
    assert.strictEqual(semeada.valor, '7', semeada.valor);

    const { alertas, cartao: c } = await cartao(EVENTO);
    assert.strictEqual(alertas.length, 14, `a central tem ${alertas.length} cartoes`);
    assert.strictEqual(c.erro, undefined, `o listar da entrada nova lancou: ${JSON.stringify(c)}`);
    assert.strictEqual(c.dias, 7, `a janela do cartao tinha de ser 7, veio ${c.dias}`);
    const comErro = alertas.filter((a) => a.erro).map((a) => a.chave);
    assert.deepStrictEqual(comErro, [], `entradas com erro na central: ${JSON.stringify(comErro)}`);
  });

  // ── (2) NC PARADA APARECE; NC NOVA NAO ───────────────────────────────────────────────────────
  //
  // Os DOIS no mesmo cenario de proposito: "a NC nova nao aparece" sozinho passaria tambem com um
  // `listar` que nao devolve nada. O controle positivo (1) do plano sabota exatamente o filtro de
  // dias, e e esta metade que tem de ficar vermelha.
  let PARADA; let NOVA;
  await test('(2) NC ABERTA ha mais de 7 dias aparece com numero/material/tipo/origem/dias; a de hoje nao', async () => {
    PARADA = await itemComNc(10, 6);
    await envelhecerNc(PARADA.nc.id, 9);
    NOVA = await itemComNc(20, 18);

    const { cartao: c } = await cartao(EVENTO);
    const l = linhaDaNc(c, PARADA.nc.numero);
    assert.ok(l, `a NC ${PARADA.nc.numero}, parada ha 9 dias, TINHA de aparecer: `
      + JSON.stringify(c.linhas.map((x) => x.numero)));
    assert.strictEqual(l.id, PARADA.nc.id);
    assert.strictEqual(l.material_codigo, PARADA.mat.codigo, JSON.stringify(l));
    assert.ok(l.material_nome, 'o nome do material faz parte do contrato da linha');
    assert.strictEqual(l.tipo, 'QUANTIDADE', JSON.stringify(l));
    assert.strictEqual(l.origem, 'RECEBIMENTO', JSON.stringify(l));
    assert.strictEqual(l.dias_parada, 9, `dias_parada tinha de ser 9, veio ${l.dias_parada}`);
    assert.ok(l.recebimento_numero, 'o recebimento entra na linha quando a NC tem um');

    assert.ok(!linhaDaNc(c, NOVA.nc.numero),
      `a NC ${NOVA.nc.numero}, aberta AGORA, nao podia aparecer na janela de 7 dias`);
  });

  // ── (3) A JANELA E A DA CONFIG, NAO UMA CONSTANTE ────────────────────────────────────────────
  await test('(3) a janela e a da config: 30 tira a NC de 9 dias, 8 traz de volta', async () => {
    await setConfig(db, 'alerta_nc_parada_dias', '30');
    let c = (await cartao(EVENTO)).cartao;
    assert.strictEqual(c.dias, 30, `a janela tinha de vir 30, veio ${c.dias}`);
    assert.ok(!linhaDaNc(c, PARADA.nc.numero),
      'com a janela em 30 dias a NC de 9 dias ainda nao e "parada"');

    // Uma janela FRACIONARIA (0,0001 dia = 8,6 s) seria o jeito obvio de provar o outro extremo —
    // e foi medido que ela e FLAKY: `created_at` do SQLite tem resolucao de 1 SEGUNDO, entao a NC
    // criada no mesmo segundo da leitura tem idade 0 e o cenario cairia sozinho de vez em quando.
    // Dois valores inteiros em torno dos 9 dias provam a mesma coisa sem relogio.
    await setConfig(db, 'alerta_nc_parada_dias', '8');
    c = (await cartao(EVENTO)).cartao;
    assert.strictEqual(c.dias, 8, `a janela tinha de vir 8, veio ${c.dias}`);
    assert.ok(linhaDaNc(c, PARADA.nc.numero),
      'com a janela em 8 dias a NC de 9 dias TEM de voltar (senao o filtro nao le a config)');
    assert.ok(!linhaDaNc(c, NOVA.nc.numero), 'a NC de hoje continua fora em qualquer das duas janelas');

    await setConfig(db, 'alerta_nc_parada_dias', '7');
  });

  // ── (4) DECIDIR TIRA A NC DO ALERTA ──────────────────────────────────────────────────────────
  await test('(4) NC DECIDIDA sai do alerta (o alerta cobra decisao, nao existencia de documento)', async () => {
    const antes = (await cartao(EVENTO)).cartao;
    assert.ok(linhaDaNc(antes, PARADA.nc.numero), 'setup: a NC parada estava no cartao');

    const res = await request(app).post(`/api/almoxarifado/nao-conformidades/${PARADA.nc.id}/decidir`)
      .send({ decisao: 'ACEITAR_SOB_DESVIO', justificativa: 'Falta de 4 kg aceita pela engenharia' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'DECIDIDA', JSON.stringify(res.body));

    const depois = (await cartao(EVENTO)).cartao;
    assert.ok(!linhaDaNc(depois, PARADA.nc.numero),
      `a NC ${PARADA.nc.numero} foi decidida e NAO podia continuar cobrando decisao`);
  });

  // ── (4b) CANCELAR TAMBEM TIRA A NC DO ALERTA — E E O CAMINHO MAIS COMUM ──────────────────────
  //
  // O cenario (4) acima so media o estado `DECIDIDA`, e com isso o filtro `nc.status = 'ABERTA'`
  // de `listarNaoConformidadesParadas` ficava meio medido: trocado por
  // `nc.status IN ('ABERTA','CANCELADA')` a suite INTEIRA continuava verde. E `CANCELADA` nao e o
  // caso raro — e o desfecho da RN-05, o operador corrigindo o proprio erro de digitacao, que
  // acontece muito mais que uma decisao formal de qualidade. Cobrar decisao de um documento que ja
  // morreu e o "Atrasado para sempre" da Etapa 42 de volta: ninguem consegue tirar do cartao uma
  // NC que nao da mais para decidir (`decidir` recusa NC nao-ABERTA com 409).
  await test('(4b) NC CANCELADA pela correcao da quantidade (RN-05) tambem sai do alerta', async () => {
    const alvo = await itemComNc(80, 71);
    await envelhecerNc(alvo.nc.id, 15);

    const antes = (await cartao(EVENTO)).cartao;
    assert.ok(linhaDaNc(antes, alvo.nc.numero),
      `setup: a NC ${alvo.nc.numero}, parada ha 15 dias, tinha de estar no cartao antes da correcao`);

    // O caminho REAL da RN-05: reconferir com a quantidade certa. Nada de UPDATE de status na mao —
    // o que o cartao tem de deixar de mostrar e o documento que o GANCHO cancelou.
    const res = await request(app).put(`/api/almoxarifado/recebimentos/${alvo.recId}/conferir`)
      .send({ itens: [{ id: alvo.itemId, quantidade_recebida: 80 }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const gravada = await dbGet(db,
      'SELECT status FROM nao_conformidades_almoxarifado WHERE id = ?', [alvo.nc.id]);
    assert.strictEqual(gravada.status, 'CANCELADA',
      `setup: a correcao tinha de cancelar a NC (RN-05), ela ficou ${gravada.status}`);

    const depois = (await cartao(EVENTO)).cartao;
    assert.ok(!linhaDaNc(depois, alvo.nc.numero),
      `a NC ${alvo.nc.numero} foi CANCELADA e continua cobrando decisao — e um documento que `
      + 'ninguem consegue mais decidir, entao ele cobraria para sempre');

    // E a varredura diaria conta a mesma historia: documento morto nao vira e-mail.
    const hash = hashDedupe(EVENTO, chaveEsperada(alvo.nc.id));
    await queueService.varrerAlertasRegistrados(db);
    assert.strictEqual((await filaPorHash(db, hash)).length, 0,
      `a NC CANCELADA ${alvo.nc.numero} virou e-mail de cobranca`);

    // GUARDA ANTI-TESTE-VAZIO: uma NC parada NAO cancelada, no mesmo cenario, continua no cartao —
    // sem ela as tres assercoes de ausencia acima passariam com o cartao inteiro vazio.
    const viva = await itemComNc(90, 79);
    await envelhecerNc(viva.nc.id, 15);
    const comViva = (await cartao(EVENTO)).cartao;
    assert.ok(linhaDaNc(comViva, viva.nc.numero),
      `o cartao deixou de mostrar NC parada nenhuma: ${JSON.stringify(comViva.linhas.map((l) => l.numero))}`);
  });

  // ── (5) DEDUPE `nc-<id>`: UM E-MAIL POR NC ───────────────────────────────────────────────────
  await test('(5) a varredura enfileira UMA vez por NC parada; a segunda passada e DUPLICADA', async () => {
    const alvo = await itemComNc(30, 25);
    await envelhecerNc(alvo.nc.id, 12);
    const hash = hashDedupe(EVENTO, chaveEsperada(alvo.nc.id));

    const v1 = resultadoDe(await queueService.varrerAlertasRegistrados(db), EVENTO);
    assert.ok(v1.enfileiradas >= 1, `a NC parada tinha de ser enfileirada: ${JSON.stringify(v1)}`);
    const fila = await filaPorHash(db, hash);
    assert.strictEqual(fila.length, 1, `esperava 1 linha na fila para ${alvo.nc.numero}, veio ${fila.length}`);
    assert.ok(fila[0].assunto.includes(alvo.nc.numero), fila[0].assunto);
    assert.ok(new RegExp(`^Material: ${alvo.mat.codigo} — `, 'm').test(fila[0].corpo_texto), fila[0].corpo_texto);
    assert.ok(/^Tipo: QUANTIDADE$/m.test(fila[0].corpo_texto), fila[0].corpo_texto);
    assert.ok(/^Origem: RECEBIMENTO$/m.test(fila[0].corpo_texto), fila[0].corpo_texto);
    assert.ok(/^Aberta há: 12 dia\(s\)$/m.test(fila[0].corpo_texto), fila[0].corpo_texto);
    assert.strictEqual(JSON.parse(fila[0].payload).nao_conformidade_id, alvo.nc.id, fila[0].payload);

    const v2 = resultadoDe(await queueService.varrerAlertasRegistrados(db), EVENTO);
    assert.ok(v2.duplicadas >= 1, `a segunda passada tinha de ser DUPLICADA: ${JSON.stringify(v2)}`);
    assert.strictEqual((await filaPorHash(db, hash)).length, 1,
      'a mesma NC parada NAO pode virar dois e-mails');
  });

  // ── (6) D6: A EXCLUSAO **E** A REDE DE SEGURANCA, NO MESMO CENARIO ───────────────────────────
  //
  // Os dois juntos de proposito: um cenario que afirma AUSENCIA passa com a tela vazia. O item
  // SEM NC e a prova de que o cartao continua vivo — e ele e o estado que o gancho NAO FATAL
  // deixa quando explode, que e exatamente o papel que o D6 da a este cartao.
  await test('(6) D6: item COM NC some do cartao DIVERGENCIA_RECEBIMENTO; item SEM NC continua nele', async () => {
    const comNc = await itemComNc(40, 33);
    const semNc = await itemDivergenteSemNc(50, 44);

    const c = (await cartao(DIVERGENCIA)).cartao;
    assert.ok(!linhaDoItem(c, comNc.itemId),
      `o item ${comNc.itemId} ja virou ${comNc.nc.numero} — dois avisos pelo mesmo fato e o que o D6 mata`);
    const viva = linhaDoItem(c, semNc.itemId);
    assert.ok(viva, `o item ${semNc.itemId} NAO tem NC (gancho falhou) — a rede de seguranca TEM de mostra-lo`);
    assert.strictEqual(viva.divergencia, -6, JSON.stringify(viva));

    // E a varredura diaria (o outro consumidor do mesmo `listar`) conta a MESMA historia: so o
    // item sem documento vira e-mail.
    await queueService.varrerAlertasRegistrados(db);
    assert.strictEqual(
      (await filaPorHash(db, hashDedupe(DIVERGENCIA, `receb-diverg-${semNc.itemId}-44`))).length, 1,
      'a varredura tinha de cobrar o item sem NC');
  });

  // ── (7) A GUARDA DA FORMA CERTA: O DETECTOR NAO MUDOU ────────────────────────────────────────
  //
  // Este cenario e o que fica VERMELHO se alguem mover a exclusao do D6 para dentro de
  // `listarDivergenciasRecebimento`. Medido: com a exclusao la dentro, o gancho do ato para de
  // avisar assim que a NC existe e o cenario A1 de `alertaEventoGanchos.api.test.js` ("errar de
  // novo, PIOR, avisa de novo") morre — o bug que a Etapa 17 pagou, de volta.
  await test('(7) `listarDivergenciasRecebimento` NAO muda nos dois modos que ja existiam (opt-in)', async () => {
    const comNc = await itemComNc(60, 51);

    const porId = await alertRegistry.listarDivergenciasRecebimento(db, { recebimentoId: comNc.recId });
    assert.strictEqual(porId.length, 1,
      'modo POR ID (o dos dois ganchos de recebimento): o item com NC TEM de continuar sendo detectado');
    assert.strictEqual(porId[0].item_id, comNc.itemId);

    const porDias = await alertRegistry.listarDivergenciasRecebimento(db, { dias: 7 });
    assert.ok(porDias.some((l) => l.item_id === comNc.itemId),
      'modo POR DIAS sem opt-in: o detector continua vendo o item com NC');

    // E o opt-in — o unico modo NOVO — e o que exclui.
    const excluindo = await alertRegistry.listarDivergenciasRecebimento(db, { dias: 7, excluirComNC: true });
    assert.ok(!excluindo.some((l) => l.item_id === comNc.itemId),
      'com `excluirComNC` o item documentado sai — e so este modo pode faze-lo');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
