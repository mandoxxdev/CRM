/**
 * Etapa 46, T3 — a 15a entrada do registro (`NAO_CONFORMIDADE_EXECUCAO_PENDENTE`), RN-08.
 *
 * ── O QUE ESTE ARQUIVO MEDE, E POR QUE ELE EXISTE ────────────────────────────────────────────
 * A Etapa 45 separou DECIDIR de EXECUTAR. Quando o ato externo e impossivel (material com
 * controle de serie, lote nao identificavel), a recusa da execucao e fatal e se repete para
 * sempre: a NC fica `DECIDIDA` + `execucao_estado = 'PENDENTE'` e NINGUEM e cobrado.
 * `listarNaoConformidadesParadas` (a 14a entrada) filtra `status = 'ABERTA'`, entao a NC decidida
 * sai daquele cartao e nao entra em nenhum outro — mora so num filtro de tela que alguem precisa
 * escolher. E o beco "atrasado para sempre" da Etapa 42 em terceira roupa.
 *
 * ⚠️ A REGUA EXIGE `status = 'DECIDIDA'`, E NAO SO `execucao_estado = 'PENDENTE'` — e o cenario
 * (4) e a guarda disso. A RN-06 da T2 **conserva** `execucao_estado` no cancelamento (cancelar
 * NAO zera a coluna, de proposito, para a decisao continuar legivel no documento morto). Com a
 * regua so em `execucao_estado`, a NC cancelada por uma pessoa continuaria cobrando execucao de um
 * documento que ninguem pode mais executar — exatamente o "cobrar para sempre" que esta entrada
 * veio matar. E a suite da T2 (`ncCancelamento.api.test.js`) fica VERDE com esse furo aberto,
 * porque ela nao le o cartao.
 *
 * ⚠️ A JANELA E POR `decidido_em`, NAO POR `created_at` — e o cenario (2) tem a metade que prova
 * isso por construcao: uma NC ABERTA ha 60 dias e decidida AGORA nao esta atrasada na execucao.
 * Com `created_at` na regua ela apareceria no cartao no dia seguinte a decisao, cobrando de
 * Compras um prazo que ainda nem comecou a correr.
 *
 * ⚠️ TODA assercao filtra a fila por `evento`+hash (nota de `alertaRegistro.api.test.js:6-8`): os
 * recebimentos e materiais semeados aqui caem AUTOMATICAMENTE em outros alertas do registro, e um
 * contador global mediria o alerta errado.
 *
 * Executar: cd server && node tests/api/alertaExecucaoPendente.api.test.js
 */
const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const queueService = require('../../services/almoxarifado/notificationQueueService');
const alertRegistry = require('../../services/almoxarifado/alertRegistry');
const nonConformityService = require('../../services/almoxarifado/nonConformityService');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const EVENTO = 'NAO_CONFORMIDADE_EXECUCAO_PENDENTE';
const EVENTO_IRMA = 'NAO_CONFORMIDADE_ABERTA';
const CONFIG_DIAS = 'alerta_nc_execucao_pendente_dias';
const ADMIN = { id: 196, nome: 'Admin E46 T3', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

function hashDedupe(evento, dedupeChave) {
  return crypto.createHash('sha256').update(`${evento}|${dedupeChave}`).digest('hex');
}

/** As chaves ESPERADAS, escritas a mao: se a implementacao mudar de formula, este arquivo acusa. */
const chaveEsperada = (ncId) => `nc-exec-${ncId}`;
const chaveDaIrma = (ncId) => `nc-${ncId}`;

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
  await setConfig(db, 'alertas_estoque_emails', 'compras@gmp.ind.br');
  await setConfig(db, 'alertas_estoque_notificar_email', '1');

  let seq = 0;
  async function novoMaterial() {
    seq += 1;
    const codigo = `MAT-E46T3-${String(seq).padStart(3, '0')}`;
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'KG',0,1)`,
    [codigo, `Chapa E46 T3 ${seq}`]);
    return { id: r.lastID, codigo };
  }

  /** Recebimento REAL pelo service de producao (molde de alertaNaoConformidade), com um item. */
  async function novoRecebimento(materialId, quantidade) {
    seq += 1;
    const rec = await receiptService.criarRecebimento(db, ADMIN, {
      nota_fiscal: `NF-E46T3-${seq}`,
      itens: [{ material_id: materialId, quantidade }],
    });
    const item = await dbGet(db,
      'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [rec.id]);
    return { recId: rec.id, itemId: item.id };
  }

  /**
   * O caminho REAL da producao: o painel de conferencia/o modal de NF escreve a quantidade, o
   * aviso da Etapa 17 dispara e o gancho da Etapa 43 abre a NC. Nada de `INSERT` de NC na mao — o
   * que este arquivo mede e o estado que o usuario produz clicando.
   */
  async function itemComNc(esperada, recebida) {
    const mat = await novoMaterial();
    const { recId, itemId } = await novoRecebimento(mat.id, esperada);
    const wf = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`)
      .send({ acao: 'iniciar_conferencia' });
    assert.strictEqual(wf.status, 200, JSON.stringify(wf.body));
    const res = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`)
      .send({ nota_fiscal: `NF-E46T3-${seq}`, itens: [{ id: itemId, quantidade_recebida: recebida }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const nc = await dbGet(db, `SELECT * FROM nao_conformidades_almoxarifado
      WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ? AND tipo = 'QUANTIDADE'
      ORDER BY id DESC LIMIT 1`, [itemId]);
    assert.ok(nc, `fixture: o gancho tinha de ter aberto a NC do item ${itemId}`);
    return { mat, recId, itemId, nc };
  }

  /**
   * NC decidida com uma decisao que EXIGE ato externo — `SUBSTITUICAO` nasce
   * `execucao_estado = 'PENDENTE'` (as duas de ACEITACAO nasceriam `NAO_SE_APLICA`, que e
   * justamente o estado que este cartao NAO cobra). Pela ROTA, com o gate real.
   */
  async function decidirComExecucaoPendente(ncId, decisao = 'SUBSTITUICAO') {
    const res = await request(app).post(`/api/almoxarifado/nao-conformidades/${ncId}/decidir`)
      .send({ decisao, justificativa: 'Fornecedor vai repor a falta na proxima remessa' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'DECIDIDA', JSON.stringify(res.body));
    assert.strictEqual(res.body.execucao_estado, nonConformityService.EXECUCAO_PENDENTE,
      `fixture: a decisao ${decisao} tinha de nascer PENDENTE de execucao: ${JSON.stringify(res.body)}`);
    return res.body;
  }

  /** Envelhece a DECISAO (nao o documento) — e por `decidido_em` que a regua mede. */
  const envelhecerDecisao = (ncId, dias) => dbRun(db,
    `UPDATE nao_conformidades_almoxarifado SET decidido_em = datetime('now', '-' || ? || ' days')
     WHERE id = ?`, [dias, ncId]);

  /** Envelhece a ABERTURA — usado para provar que ela NAO e a janela desta entrada. */
  const envelhecerAbertura = (ncId, dias) => dbRun(db,
    `UPDATE nao_conformidades_almoxarifado SET created_at = datetime('now', '-' || ? || ' days')
     WHERE id = ?`, [dias, ncId]);

  const entradaDaExecucao = () => {
    const e = alertRegistry.ALERT_REGISTRY.find((x) => x.chave === EVENTO);
    assert.ok(e, `ALERT_REGISTRY nao tem ${EVENTO} — a 15a entrada nao existe`);
    return e;
  };

  async function cartao(chave = EVENTO) {
    const { alertas } = await alertRegistry.montarCentral(db);
    const c = alertas.find((a) => a.chave === chave);
    assert.ok(c, `a central nao trouxe o cartao ${chave}`);
    return { alertas, cartao: c };
  }

  const linhaDaNc = (c, numero) => c.linhas.find((l) => l.numero === numero);

  // ── (1) A ENTRADA EXISTE, O REGISTRO TEM 15, E A CENTRAL TRAZ O CARTAO ───────────────────────
  await test('(1) a 15a entrada esta no registro e na central, com titulo, janela semeada e listar function', async () => {
    const e = entradaDaExecucao();
    assert.strictEqual(e.titulo, 'Execução pendente', e.titulo);
    assert.deepStrictEqual(e.configDias, { chave: CONFIG_DIAS, default: 7 },
      `a janela tinha de sair da config: ${JSON.stringify(e.configDias)}`);
    assert.strictEqual(typeof e.listar, 'function');
    assert.strictEqual(alertRegistry.ALERT_REGISTRY.length, 15,
      `o registro tinha de ter 15 entradas, tem ${alertRegistry.ALERT_REGISTRY.length}`);
    assert.strictEqual(alertRegistry.ALERT_REGISTRY[14].chave, EVENTO,
      'a entrada nova entra NO FIM — a ordem do registro e a ordem dos cartoes da tela');

    // GUARDA ANTI-DERIVA dos literais do SQL: a regua da entrada escreve `'DECIDIDA'` e
    // `'PENDENTE'` a mao (nenhum require de servico neste arquivo, como a irma faz com `'ABERTA'`).
    // Se o vocabulario do servico mudar, esta linha cai antes do SQL virar letra morta.
    assert.strictEqual(nonConformityService.EXECUCAO_PENDENTE, 'PENDENTE');
    assert.ok(nonConformityService.NC_STATUS.includes('DECIDIDA'),
      `NC_STATUS perdeu 'DECIDIDA': ${JSON.stringify(nonConformityService.NC_STATUS)}`);

    // A janela chega do BANCO — chave nao semeada e ineditavel pelo PUT /configuracoes (a licao da
    // Etapa 10 registrada em schema.js): o administrador salvaria 200 "Configuracoes salvas!" e o
    // motor continuaria no default.
    const semeada = await dbGet(db,
      'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [CONFIG_DIAS]);
    assert.ok(semeada, `${CONFIG_DIAS} tinha de estar SEMEADA no schema`);
    assert.strictEqual(semeada.valor, '7', semeada.valor);

    const { alertas, cartao: c } = await cartao();
    assert.strictEqual(alertas.length, 15, `a central tem ${alertas.length} cartoes`);
    assert.strictEqual(c.erro, undefined, `o listar da entrada nova lancou: ${JSON.stringify(c)}`);
    assert.strictEqual(c.dias, 7, `a janela do cartao tinha de ser 7, veio ${c.dias}`);
    assert.strictEqual(c.titulo, 'Execução pendente', c.titulo);
    const comErro = alertas.filter((a) => a.erro).map((a) => a.chave);
    assert.deepStrictEqual(comErro, [], `entradas com erro na central: ${JSON.stringify(comErro)}`);
  });

  // ── (2) A METADE POSITIVA, E A PROVA DE QUE A JANELA E POR `decidido_em` ─────────────────────
  //
  // Os dois no MESMO cenario de proposito: "a decidida ontem nao aparece" sozinho passaria tambem
  // com um `listar` que nunca devolve nada. E a segunda linha e mais que uma metade negativa
  // qualquer — ela e NC ABERTA ha 60 DIAS e decidida AGORA: com `created_at` na regua (a primeira
  // forma obvia) ela apareceria, cobrando de Compras um prazo que ainda nem comecou a correr.
  let PENDENTE_VELHA; let DECIDIDA_AGORA;
  await test('(2) NC decidida ha 10 dias e PENDENTE aparece; a aberta ha 60 dias e decidida AGORA nao', async () => {
    PENDENTE_VELHA = await itemComNc(10, 6);
    await decidirComExecucaoPendente(PENDENTE_VELHA.nc.id);
    await envelhecerDecisao(PENDENTE_VELHA.nc.id, 10);
    // A ABERTURA da positiva tambem envelhece, e isso NAO e enfeite de fixture: sem ela, trocar a
    // regua para `created_at` derrubaria a METADE POSITIVA deste cenario (a NC decidida ha 10 dias
    // nasceu hoje) e a assercao que guarda a escolha de `decidido_em` nunca seria alcancada. Com
    // as duas velhas na abertura, a positiva passa nas DUAS reguas e o unico jeito de este cenario
    // ficar vermelho e pela linha de baixo. MEDIDO na sabotagem 1 da T3.
    await envelhecerAbertura(PENDENTE_VELHA.nc.id, 40);

    DECIDIDA_AGORA = await itemComNc(20, 14);
    await envelhecerAbertura(DECIDIDA_AGORA.nc.id, 60);
    await decidirComExecucaoPendente(DECIDIDA_AGORA.nc.id);

    const { cartao: c } = await cartao();
    const l = linhaDaNc(c, PENDENTE_VELHA.nc.numero);
    assert.ok(l, `a NC ${PENDENTE_VELHA.nc.numero}, decidida ha 10 dias e PENDENTE, TINHA de aparecer: `
      + JSON.stringify(c.linhas.map((x) => x.numero)));
    assert.strictEqual(l.id, PENDENTE_VELHA.nc.id);
    assert.strictEqual(l.status, 'DECIDIDA', JSON.stringify(l));
    assert.strictEqual(l.execucao_estado, 'PENDENTE', JSON.stringify(l));
    assert.strictEqual(l.decisao, 'SUBSTITUICAO', JSON.stringify(l));
    assert.strictEqual(l.dias_pendente, 10, `dias_pendente tinha de ser 10, veio ${l.dias_pendente}`);
    assert.strictEqual(l.material_codigo, PENDENTE_VELHA.mat.codigo, JSON.stringify(l));
    assert.ok(l.material_nome, 'o nome do material faz parte do contrato da linha');
    assert.ok(l.recebimento_numero, 'o recebimento entra na linha quando a NC tem um');
    // B30: texto livre NAO viaja para a central nem para a caixa de entrada.
    assert.strictEqual(l.justificativa, undefined, `justificativa vazou para a linha: ${JSON.stringify(l)}`);
    assert.strictEqual(l.decidido_por_nome, undefined, `decidido_por_nome vazou: ${JSON.stringify(l)}`);

    assert.ok(!linhaDaNc(c, DECIDIDA_AGORA.nc.numero),
      `a NC ${DECIDIDA_AGORA.nc.numero} foi ABERTA ha 60 dias mas decidida AGORA — a janela e por `
      + '`decidido_em`, e o prazo da execucao nem comecou a correr');
  });

  // ── (3) EXECUTAR TIRA A NC DO CARTAO ────────────────────────────────────────────────────────
  //
  // Com a metade positiva DENTRO do cenario: a irma pendente tem de continuar no cartao, senao
  // "a executada saiu" passaria com o cartao inteiro vazio.
  await test('(3) NC decidida e EXECUTADA sai do cartao; a pendente do mesmo cenario fica', async () => {
    const alvo = await itemComNc(30, 22);
    await decidirComExecucaoPendente(alvo.nc.id);
    await envelhecerDecisao(alvo.nc.id, 12);

    const antes = (await cartao()).cartao;
    assert.ok(linhaDaNc(antes, alvo.nc.numero),
      `setup: a NC ${alvo.nc.numero}, decidida ha 12 dias e pendente, tinha de estar no cartao`);

    // Pela ROTA, com o gate real. `SUBSTITUICAO` nao move saldo (efeito NENHUMA) — o que muda e
    // exatamente o que este cartao le: `execucao_estado` vira EXECUTADA.
    const res = await request(app).post(`/api/almoxarifado/nao-conformidades/${alvo.nc.id}/executar`)
      .send({ observacoes: 'Reposicao combinada com o fornecedor' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const gravada = await dbGet(db,
      'SELECT execucao_estado FROM nao_conformidades_almoxarifado WHERE id = ?', [alvo.nc.id]);
    assert.strictEqual(gravada.execucao_estado, nonConformityService.EXECUCAO_EXECUTADA,
      `setup: a execucao tinha de ter sido registrada, ficou ${gravada.execucao_estado}`);

    const depois = (await cartao()).cartao;
    assert.ok(!linhaDaNc(depois, alvo.nc.numero),
      `a NC ${alvo.nc.numero} foi EXECUTADA e nao podia continuar cobrando execucao`);
    assert.ok(linhaDaNc(depois, PENDENTE_VELHA.nc.numero),
      'o cartao deixou de mostrar pendencia nenhuma — a assercao de ausencia acima nao vale nada '
      + `com o cartao vazio: ${JSON.stringify(depois.linhas.map((x) => x.numero))}`);

    // E a varredura diaria conta a mesma historia: execucao registrada nao vira e-mail.
    await queueService.varrerAlertasRegistrados(db);
    assert.strictEqual((await filaPorHash(db, hashDedupe(EVENTO, chaveEsperada(alvo.nc.id)))).length, 0,
      `a NC ${alvo.nc.numero}, ja executada, virou e-mail de cobranca`);
  });

  // ── (4) A AMARRACAO COM A T2: CANCELAR CALA O CARTAO ────────────────────────────────────────
  //
  // ESTE E O CENARIO QUE JUSTIFICA `status = 'DECIDIDA'` NA REGUA. A RN-06 da T2 conserva
  // `execucao_estado` no cancelamento de proposito, para a decisao continuar legivel no documento
  // morto — e o cenario afirma essa conservacao antes de afirmar a ausencia, senao ele passaria
  // por um motivo errado (uma implementacao que ZERASSE a coluna calaria o cartao por acidente e
  // quebraria a RN-06 sem este arquivo acusar).
  await test('(4) NC CANCELADA com execucao_estado conservado em PENDENTE sai do cartao (RN-06 + T2)', async () => {
    const alvo = await itemComNc(40, 31);
    await decidirComExecucaoPendente(alvo.nc.id, 'DEVOLVER');
    await envelhecerDecisao(alvo.nc.id, 20);

    const antes = (await cartao()).cartao;
    assert.ok(linhaDaNc(antes, alvo.nc.numero),
      `setup: a NC ${alvo.nc.numero}, decidida ha 20 dias e pendente, tinha de estar no cartao`);

    // O gesto da T2, pelo SERVICE de producao (a rota tem o mesmo corpo; o que importa aqui e o
    // estado que ele deixa).
    const cancelada = await nonConformityService.cancelarNaoConformidade(db, ADMIN, alvo.nc.id, {
      motivo: 'Material com controle de serie — devolucao impossivel por aqui',
    });
    assert.strictEqual(cancelada.status, 'CANCELADA', JSON.stringify(cancelada));

    // A CONSERVACAO, afirmada ANTES da ausencia: e ela que faz a regua `execucao_estado` sozinha
    // ser insuficiente.
    const gravada = await dbGet(db, `SELECT status, execucao_estado, decisao, decidido_em
      FROM nao_conformidades_almoxarifado WHERE id = ?`, [alvo.nc.id]);
    assert.strictEqual(gravada.status, 'CANCELADA', JSON.stringify(gravada));
    assert.strictEqual(gravada.execucao_estado, nonConformityService.EXECUCAO_PENDENTE,
      'a RN-06 CONSERVA execucao_estado no cancelamento — se ela zerou, o cartao calou por '
      + `acidente e a regua deste alerta deixou de ser medida: ${JSON.stringify(gravada)}`);
    assert.strictEqual(gravada.decisao, 'DEVOLVER',
      `a decisao tinha de continuar legivel no documento cancelado: ${JSON.stringify(gravada)}`);
    assert.ok(gravada.decidido_em, 'decidido_em tinha de continuar gravado (RN-06)');

    const depois = (await cartao()).cartao;
    assert.ok(!linhaDaNc(depois, alvo.nc.numero),
      `a NC ${alvo.nc.numero} foi CANCELADA e continua cobrando execucao — e um documento que `
      + 'ninguem consegue mais executar, entao ele cobraria para sempre');

    // Metade positiva: o cartao continua vivo no MESMO estado de banco.
    assert.ok(linhaDaNc(depois, PENDENTE_VELHA.nc.numero),
      `o cartao ficou vazio: ${JSON.stringify(depois.linhas.map((x) => x.numero))}`);

    // E a varredura diaria: documento morto nao vira e-mail.
    await queueService.varrerAlertasRegistrados(db);
    assert.strictEqual((await filaPorHash(db, hashDedupe(EVENTO, chaveEsperada(alvo.nc.id)))).length, 0,
      `a NC CANCELADA ${alvo.nc.numero} virou e-mail de cobranca de execucao`);
  });

  // ── (5) A JANELA E A DA CONFIG, NAO UMA CONSTANTE ───────────────────────────────────────────
  await test('(5) a janela e a da config: 30 tira a NC decidida ha 10 dias, 9 traz de volta', async () => {
    await setConfig(db, CONFIG_DIAS, '30');
    let c = (await cartao()).cartao;
    assert.strictEqual(c.dias, 30, `a janela tinha de vir 30, veio ${c.dias}`);
    assert.ok(!linhaDaNc(c, PENDENTE_VELHA.nc.numero),
      'com a janela em 30 dias a decisao de 10 dias ainda nao esta atrasada');

    // Dois valores INTEIROS em torno dos 10 dias, e nao uma janela fracionaria: `decidido_em` do
    // SQLite tem resolucao de 1 SEGUNDO, e a janela de 0,0001 dia (8,6 s) seria FLAKY (a mesma
    // medicao registrada no cenario (3) de `alertaNaoConformidade.api.test.js`).
    await setConfig(db, CONFIG_DIAS, '9');
    c = (await cartao()).cartao;
    assert.strictEqual(c.dias, 9, `a janela tinha de vir 9, veio ${c.dias}`);
    assert.ok(linhaDaNc(c, PENDENTE_VELHA.nc.numero),
      'com a janela em 9 dias a decisao de 10 dias TEM de voltar (senao o filtro nao le a config)');
    assert.ok(!linhaDaNc(c, DECIDIDA_AGORA.nc.numero),
      'a decisao de hoje continua fora em qualquer das duas janelas');

    await setConfig(db, CONFIG_DIAS, '7');
  });

  // ── (6) O DEDUPE, O CORPO, E A COEXISTENCIA COM O E-MAIL DA IRMA ────────────────────────────
  //
  // A MESMA NC passa pelos dois cartoes na vida real (parada sem decisao -> decidida -> pendente
  // de execucao), e este cenario exige as DUAS linhas na fila. Ele tambem refuta, por medicao, a
  // conclusao errada mais facil sobre o prefixo `nc-exec-`: a colisao NAO existiria sem ele, porque
  // o `hash_dedupe` e `sha256(EVENTO|chave)` e os dois EVENTOS sao diferentes.
  await test('(6) dedupe `nc-exec-<id>`: um e-mail por NC, corpo com decisao e dias, e conviver com o da irma', async () => {
    const alvo = await itemComNc(50, 39);
    // Primeiro a cobranca de DECISAO (a irma), com o documento parado ha 20 dias.
    await envelhecerAbertura(alvo.nc.id, 20);
    const vIrma = resultadoDe(await queueService.varrerAlertasRegistrados(db), EVENTO_IRMA);
    assert.ok(vIrma.enfileiradas >= 1, `a NC parada tinha de ser cobrada pela irma: ${JSON.stringify(vIrma)}`);
    const hashIrma = hashDedupe(EVENTO_IRMA, chaveDaIrma(alvo.nc.id));
    assert.strictEqual((await filaPorHash(db, hashIrma)).length, 1,
      'setup: a irma tinha de ter enfileirado a cobranca de DECISAO');

    // Agora decidir: a NC sai da irma e entra nesta.
    await decidirComExecucaoPendente(alvo.nc.id);
    await envelhecerDecisao(alvo.nc.id, 15);

    const hash = hashDedupe(EVENTO, chaveEsperada(alvo.nc.id));
    const v1 = resultadoDe(await queueService.varrerAlertasRegistrados(db), EVENTO);
    assert.ok(v1.enfileiradas >= 1, `a execucao pendente tinha de ser enfileirada: ${JSON.stringify(v1)}`);
    const fila = await filaPorHash(db, hash);
    assert.strictEqual(fila.length, 1, `esperava 1 linha na fila para ${alvo.nc.numero}, veio ${fila.length}`);
    assert.ok(fila[0].assunto.includes(alvo.nc.numero), fila[0].assunto);
    assert.ok(/^\[Almoxarifado\] Execução pendente — /.test(fila[0].assunto), fila[0].assunto);
    assert.ok(new RegExp(`^Material: ${alvo.mat.codigo} — `, 'm').test(fila[0].corpo_texto), fila[0].corpo_texto);
    assert.ok(/^Decisão: SUBSTITUICAO$/m.test(fila[0].corpo_texto),
      `o corpo tem de dizer O QUE ficou combinado: ${fila[0].corpo_texto}`);
    assert.ok(/^Decidida há: 15 dia\(s\)$/m.test(fila[0].corpo_texto),
      `o corpo tem de dizer ha quantos dias a decisao foi tomada: ${fila[0].corpo_texto}`);
    assert.strictEqual(JSON.parse(fila[0].payload).nao_conformidade_id, alvo.nc.id, fila[0].payload);

    // A linha da irma continua la: os dois e-mails coexistem pela MESMA NC (eventos diferentes).
    assert.strictEqual((await filaPorHash(db, hashIrma)).length, 1,
      'a cobranca de DECISAO desapareceu da fila — os dois avisos sao de assuntos e donos distintos');

    const v2 = resultadoDe(await queueService.varrerAlertasRegistrados(db), EVENTO);
    assert.ok(v2.duplicadas >= 1, `a segunda passada tinha de ser DUPLICADA: ${JSON.stringify(v2)}`);
    assert.strictEqual((await filaPorHash(db, hash)).length, 1,
      'a mesma execucao pendente NAO pode virar dois e-mails');
  });

  // ── (7) A REGUA MEDIDA DIRETO, SEM A CENTRAL ────────────────────────────────────────────────
  //
  // A funcao e exportada para isto (molde de `listarNaoConformidadesParadas`): o cartao passa por
  // `montarCentral`, que engole erro em `erro: true`, e uma regua medida so por ele pode ficar
  // meio medida. Aqui a janela e um argumento.
  await test('(7) `listarNaoConformidadesExecucaoPendente` traz a pendente velha e nenhuma das excluidas', async () => {
    const linhas = await alertRegistry.listarNaoConformidadesExecucaoPendente(db, { dias: 7 });
    assert.ok(linhas.some((l) => l.id === PENDENTE_VELHA.nc.id),
      `a NC ${PENDENTE_VELHA.nc.numero} tinha de estar na regua crua: `
      + JSON.stringify(linhas.map((l) => l.numero)));
    assert.ok(!linhas.some((l) => l.id === DECIDIDA_AGORA.nc.id),
      'a decidida agora nao pode estar na regua crua');
    const forade = linhas.filter((l) => l.status !== 'DECIDIDA' || l.execucao_estado !== 'PENDENTE');
    assert.deepStrictEqual(forade, [],
      `a regua devolveu linha que nao e DECIDIDA+PENDENTE: ${JSON.stringify(forade)}`);
    // ORDER BY `decidido_em` ASC: a decisao mais velha primeiro (a mais atrasada no topo).
    const datas = linhas.map((l) => l.decidido_em);
    assert.deepStrictEqual(datas, [...datas].sort(),
      `a ordem tinha de ser por decidido_em ASC: ${JSON.stringify(datas)}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
