/**
 * RN-18 (Etapa 36) — receber ACIMA do pedido exige autorizacao EXPLICITA e PERMISSAO, nas DUAS
 * portas que escrevem quantidade (`PUT /:id/conferir` e `PUT /:id/fiscal`).
 *
 * Medido por sonda executada na Fase 0: `quantidade_esperada: 10` com `quantidade_recebida: 999`
 * entrava com 201/200 e era GRAVADO. O motor de DETECCAO ja existia inteiro
 * (`alertRegistry.listarDivergenciasRecebimento` + `avisarDivergenciasDoRecebimento` nos dois
 * escritores); o que nao existia era a BARREIRA — e aceitar mais material do que foi pedido gera
 * CONTA A PAGAR maior que o pedido de compra.
 *
 * ⚠️ MODO DE FALHA 3 DESTA ETAPA — a assercao negativa de permissao NAO nasce vermelha.
 * `can()` devolve `false` para acao que nao conhece, entao "ALMOXARIFE nao pode
 * `autorizar_excedente`" ficaria VERDE antes de a acao existir, pelo motivo errado. A prova e o
 * PAR no MESMO cenario: 403 de quem nao tem a acao E 200 de quem tem. Um sem o outro nao prova
 * nada — e e por isso que as duas metades moram no MESMO `test()`.
 *
 * ⚠️ O DESIGN ESTAVA ERRADO NUM PONTO, medido aqui e corrigido no fix-round 1: ele dizia
 * `autorizar_excedente = [ADMINISTRADOR, GESTOR, COMPRAS]` e "com perfil GESTOR -> 200". Pela ROTA
 * isso e INALCANCAVEL — as duas portas sao gateadas por `requirePermission('receber_material')`,
 * que e `[ADMINISTRADOR, ALMOXARIFE, COMPRAS]` (`permissions.js:86`), e GESTOR nao esta la: ele
 * toma 403 com `acao: 'receber_material'` ANTES de o servico rodar, e nao existe outro chamador das
 * funcoes de servico. O GESTOR na lista seria configuracao MORTA, com `minhas-permissoes` dizendo
 * `true` para uma acao que nunca acontece. A lista passou a ser `[ADMINISTRADOR, COMPRAS]`: o mapa
 * nao pode listar quem nao consegue agir. COMPRAS e o unico perfil NAO-admin com as duas coisas, e
 * e ele que faz a metade positiva; o cenario (2) fecha a regua do GESTOR pelo lado NEGATIVO,
 * chamando `conferirRecebimento` DIRETO no servico (pela rota ele nem chegaria la).
 * DESCARTADO: alargar `receber_material` (daria ao GESTOR o recebimento inteiro por uma autorizacao
 * pontual) e abrir rota de excecao (porta propria e questao de design, ficou na letra B).
 *
 * Executar: cd server && node tests/api/recebimentoExcedente.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { ACAO_PERFIS, PERFIS } = require('../../services/almoxarifado/permissions');
const alertRegistry = require('../../services/almoxarifado/alertRegistry');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// (iii) Nenhum id de fixture `1`: o usuario de teste segue a numeracao de
// `minhasPermissoes.api.test.js`, e os ids de item/recebimento sao SEMPRE lidos do banco.
const ADMIN = { id: 64, nome: 'Admin Excedente', role: 'admin' };
const ALMOXARIFE = { id: 65, nome: 'Almoxarife E36', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE' };
const COMPRAS = { id: 66, nome: 'Compras E36', role: 'usuario', perfil_almoxarifado: 'COMPRAS' };
const GESTOR = { id: 67, nome: 'Gestor E36', role: 'usuario', perfil_almoxarifado: 'GESTOR' };

const semFlag = (recebida, esperada, itemId) => `Quantidade recebida (${recebida}) maior que a `
  + `esperada (${esperada}) no item #${itemId} — marque a autorização de excedente para registrar`;
const semPermissao = (perfil) => 'Autorizar recebimento acima do pedido exige a permissão '
  + `"autorizar_excedente" (seu perfil: ${perfil}).`;

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  let seq = 0;
  async function novoMaterial() {
    seq += 1;
    const m = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',0,1)`,
      [`E36-EXC-${seq}`, `Chapa excedente ${seq}`]);
    return m.lastID;
  }

  /**
   * Cria um recebimento pela ROTA com UM item de `quantidade_esperada: 10`. `criarRecebimento`
   * grava `quantidade_recebida = item.quantidade_recebida || qtd` (`receiptService.js:236`), logo
   * o item nasce com recebida = esperada = 10 — que e exatamente o estado que os cenarios (1) e
   * (5) precisam para provar "a coluna nao mudou" e "a coluna nao foi apagada".
   */
  async function novoRecebimento({ observacoes } = {}) {
    const material = await novoMaterial();
    seq += 1;
    const res = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: `NF-EXC-${seq}`,
      itens: [{ material_id: material, quantidade: 10, observacoes }],
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const item = await dbGet(db, `SELECT id, quantidade_esperada, quantidade_recebida, observacoes
      FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?`, [res.body.id]);
    return { recId: res.body.id, itemId: item.id, item };
  }

  const conferir = (recId, body) => request(app)
    .put(`/api/almoxarifado/recebimentos/${recId}/conferir`).send(body);
  const fiscal = (recId, body) => request(app)
    .put(`/api/almoxarifado/recebimentos/${recId}/fiscal`).send(body);

  /** `/fiscal` recusa status RECEBIDO ANTES de qualquer item (`receiptService.js:253-259`). */
  async function emConferencia(recId) {
    const wf = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`)
      .send({ acao: 'iniciar_conferencia' });
    assert.strictEqual(wf.status, 200, JSON.stringify(wf.body));
  }

  const lerItem = (itemId) => dbGet(db, `SELECT quantidade_recebida, observacoes,
    conferencia_quantidade FROM recebimentos_material_itens_almoxarifado WHERE id = ?`, [itemId]);

  const auditoriaExcedente = (itemId) => dbAll(db, `SELECT * FROM auditoria_log_almoxarifado
    WHERE entidade = 'recebimento_item' AND acao = 'EXCEDENTE_AUTORIZADO' AND entidade_id = ?`,
  [itemId]);

  // ── (0) a regua da LISTA, convencao de toda acao nova deste modulo desde a Etapa 8 ──────────
  await test('(0) autorizar_excedente existe em ACAO_PERFIS, e a lista e so quem tem PORTA', async () => {
    assert.ok(ACAO_PERFIS.autorizar_excedente,
      'acao ausente de ACAO_PERFIS — o gate cairia em `|| []`, que nega tudo, e o 403 do '
      + 'ALMOXARIFE ficaria verde pelo motivo errado');
    assert.deepStrictEqual([...ACAO_PERFIS.autorizar_excedente].sort(),
      ['ADMINISTRADOR', 'COMPRAS']);
    assert.ok(!ACAO_PERFIS.autorizar_excedente.includes(PERFIS.ALMOXARIFE),
      'a exclusao do ALMOXARIFE e a decisao desta etapa, e sem esta linha ela muda sem regua');
    // (fix-round 1) O GESTOR estava no design e saiu na execucao: ele nao tem PORTA — as duas
    // rotas que escrevem quantidade sao gateadas por `receber_material`, que nao o inclui, e nao ha
    // outro chamador do servico. Listar quem nao consegue agir seria configuracao morta, e
    // `minhas-permissoes` diria `true` para uma acao que nunca acontece.
    assert.ok(!ACAO_PERFIS.autorizar_excedente.includes(PERFIS.GESTOR),
      'o GESTOR nao tem porta para esta acao — o mapa nao pode listar quem nao consegue agir');
  });

  await test('(1) /conferir com recebida > esperada e sem flag: 400 com a literal', async () => {
    setUser(ALMOXARIFE);
    const { recId, itemId } = await novoRecebimento();
    const res = await conferir(recId, {
      itens: [{ id: itemId, quantidade_recebida: 999, conferencia_quantidade: true }],
    });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, semFlag(999, 10, itemId));

    // A recusa e ANTES do UPDATE: aceitar e depois reclamar e o defeito que a T2 mediu na guarda
    // de NF. Sem transacao neste modulo, gravar antes do `throw` deixa o dano no banco.
    const item = await lerItem(itemId);
    assert.strictEqual(item.quantidade_recebida, 10, 'a recusa nao pode ter gravado o excedente');
    setUser(ADMIN);
  });

  await test('(2) /conferir com a flag mas perfil ALMOXARIFE: 403 — e COMPRAS, no MESMO cenario: 200', async () => {
    // Metade NEGATIVA — nasce VERDE na rodada RED (can() nega acao desconhecida), e e por isso
    // que ela nao vale sozinha.
    setUser(ALMOXARIFE);
    const negativo = await novoRecebimento();
    const res403 = await conferir(negativo.recId, {
      autorizar_excedente: true,
      itens: [{ id: negativo.itemId, quantidade_recebida: 999, conferencia_quantidade: true }],
    });
    assert.strictEqual(res403.status, 403, JSON.stringify(res403.body));
    assert.strictEqual(res403.body.error, semPermissao('ALMOXARIFE'));
    assert.strictEqual((await lerItem(negativo.itemId)).quantidade_recebida, 10,
      'o 403 nao pode ter gravado o excedente');
    assert.strictEqual((await auditoriaExcedente(negativo.itemId)).length, 0,
      'excedente RECUSADO nao pode virar linha de EXCEDENTE_AUTORIZADO');

    // Metade POSITIVA — a que nasce VERMELHA e que torna a negativa uma prova.
    // COMPRAS, e nao GESTOR: GESTOR nao tem `receber_material` e nao atravessa a rota (ver o
    // cabecalho deste arquivo). COMPRAS tem as duas coisas.
    setUser(COMPRAS);
    const positivo = await novoRecebimento();
    const res200 = await conferir(positivo.recId, {
      autorizar_excedente: true,
      itens: [{ id: positivo.itemId, quantidade_recebida: 999, conferencia_quantidade: true }],
    });
    assert.strictEqual(res200.status, 200, JSON.stringify(res200.body));
    assert.strictEqual((await lerItem(positivo.itemId)).quantidade_recebida, 999,
      'com flag E permissao, o excedente TEM de ser gravado');
    const trilha = await auditoriaExcedente(positivo.itemId);
    assert.strictEqual(trilha.length, 1, 'o excedente autorizado tem de deixar trilha');
    assert.strictEqual(trilha[0].usuario_id, COMPRAS.id);
    assert.deepStrictEqual(JSON.parse(trilha[0].dados_novos), { quantidade_recebida: 999 });
    assert.deepStrictEqual(JSON.parse(trilha[0].dados_anteriores), { quantidade_esperada: 10 });

    // (fix-round 1) A regua do GESTOR, na CAMADA onde a decisao 6 pos a checagem: o servico. Ela
    // era POSITIVA e virou NEGATIVA, porque a lista mudou — o GESTOR estava no design e saiu na
    // execucao por nao ter porta (ver o cenario (0)). Chamar o servico DIRETO e a unica forma de
    // exercitar o `can()` com ele: pela rota ele nem chega aqui (403 de `receber_material`).
    setUser(ADMIN);
    const viaServico = await novoRecebimento();
    await assert.rejects(
      () => receiptService.conferirRecebimento(db, GESTOR, viaServico.recId, {
        autorizar_excedente: true,
        itens: [{ id: viaServico.itemId, quantidade_recebida: 999, conferencia_quantidade: true }],
      }),
      (e) => {
        assert.strictEqual(e.status, 403, `status errado: ${e.status} — ${e.message}`);
        assert.strictEqual(e.message, semPermissao('GESTOR'));
        return true;
      },
      'GESTOR nao tem a acao: o servico TEM de recusar, nomeando a acao');
    assert.strictEqual((await lerItem(viaServico.itemId)).quantidade_recebida, 10,
      'a recusa do GESTOR e ANTES do UPDATE');
    assert.strictEqual((await auditoriaExcedente(viaServico.itemId)).length, 0);
  });

  await test('(3) a SEGUNDA porta: /fiscal repete os tres casos', async () => {
    // 400 sem flag
    setUser(ALMOXARIFE);
    const a = await novoRecebimento();
    await emConferencia(a.recId);
    const res400 = await fiscal(a.recId, { itens: [{ id: a.itemId, quantidade_recebida: 999 }] });
    assert.strictEqual(res400.status, 400, JSON.stringify(res400.body));
    assert.strictEqual(res400.body.error, semFlag(999, 10, a.itemId));
    assert.strictEqual((await lerItem(a.itemId)).quantidade_recebida, 10);

    // 403 com flag e ALMOXARIFE
    const b = await novoRecebimento();
    await emConferencia(b.recId);
    const res403 = await fiscal(b.recId, {
      autorizar_excedente: true, itens: [{ id: b.itemId, quantidade_recebida: 999 }],
    });
    assert.strictEqual(res403.status, 403, JSON.stringify(res403.body));
    assert.strictEqual(res403.body.error, semPermissao('ALMOXARIFE'));
    assert.strictEqual((await lerItem(b.itemId)).quantidade_recebida, 10);

    // 200 com flag e COMPRAS — e a recusa e ANTES do UPDATE do CABECALHO tambem: o `nota_serie`
    // do caso 403 nao pode ter sido gravado.
    const recB = await dbGet(db,
      'SELECT nota_serie FROM recebimentos_material_almoxarifado WHERE id = ?', [b.recId]);
    assert.strictEqual(recB.nota_serie, null, 'a recusa e do PUT INTEIRO, nao so do item');

    setUser(COMPRAS);
    const c = await novoRecebimento();
    await emConferencia(c.recId);
    const res200 = await fiscal(c.recId, {
      autorizar_excedente: true, nota_serie: '5',
      itens: [{ id: c.itemId, quantidade_recebida: 999 }],
    });
    assert.strictEqual(res200.status, 200, JSON.stringify(res200.body));
    assert.strictEqual((await lerItem(c.itemId)).quantidade_recebida, 999);
    assert.strictEqual((await auditoriaExcedente(c.itemId)).length, 1);
    setUser(ADMIN);
  });

  await test('(4) positivos que impedem o excesso de zelo', async () => {
    // recebida === esperada: a regua e "MAIOR QUE", nao "diferente de".
    const igual = await novoRecebimento();
    const resIgual = await conferir(igual.recId, {
      itens: [{ id: igual.itemId, quantidade_recebida: 10, conferencia_quantidade: true }],
    });
    assert.strictEqual(resIgual.status, 200, JSON.stringify(resIgual.body));
    assert.strictEqual((await lerItem(igual.itemId)).quantidade_recebida, 10);
    assert.strictEqual(
      (await alertRegistry.listarDivergenciasRecebimento(db, { recebimentoId: igual.recId })).length,
      0, 'recebida igual a esperada nao e divergencia');

    // recebida < esperada: passa SEM flag, e a divergencia e REGISTRADA (ponta de servidor da
    // RN-16/RN-17 — a barreira e do excedente, nao da falta).
    const menos = await novoRecebimento();
    const resMenos = await conferir(menos.recId, {
      itens: [{ id: menos.itemId, quantidade_recebida: 8, conferencia_quantidade: true }],
    });
    assert.strictEqual(resMenos.status, 200, JSON.stringify(resMenos.body));
    assert.strictEqual((await lerItem(menos.itemId)).quantidade_recebida, 8);
    const divs = await alertRegistry.listarDivergenciasRecebimento(db, { recebimentoId: menos.recId });
    assert.strictEqual(divs.length, 1, 'receber MENOS continua sendo divergencia registrada');
    assert.strictEqual(divs[0].item_id, menos.itemId);
    assert.strictEqual(divs[0].divergencia, -2);
  });

  await test('(5) COALESCE: item enviado sem quantidade_recebida nao apaga a quantidade', async () => {
    // Esta rota esta ganhando o PRIMEIRO chamador da vida (T5), e hoje `quantidade_recebida = ?`
    // e `observacoes = ?` sobrescrevem com NULO quem nao mandar o campo. Medido por sonda: o
    // `/conferir` responde 200 e a coluna vai a `null` — sao DUAS colunas apagadas.
    const { recId, itemId, item } = await novoRecebimento({ observacoes: 'Caixa amassada no canto' });
    assert.strictEqual(item.observacoes, 'Caixa amassada no canto', 'fixture: a observacao nasceu gravada');

    const res = await conferir(recId, { itens: [{ id: itemId, conferencia_quantidade: true }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const depois = await lerItem(itemId);
    assert.strictEqual(depois.quantidade_recebida, 10,
      'item sem `quantidade_recebida` no payload nao pode APAGAR a quantidade ja conferida');
    assert.strictEqual(depois.observacoes, 'Caixa amassada no canto',
      'item sem `observacoes` no payload nao pode APAGAR a observacao');
    assert.strictEqual(depois.conferencia_quantidade, 1, 'o campo que VEIO no payload tem de ser gravado');
  });

  // ── (6)(7)(8) revisao final, F1 — ECOAR nao e AUTORIZAR ──────────────────────────────────────
  /**
   * Achado Critico da revisao da branch: um recebimento com excedente JA autorizado nunca mais
   * conseguia salvar dados fiscais. `salvarFiscal` da tela reenvia `quantidade_recebida` de TODOS
   * os itens (montado de `detalhe.itens`) e NUNCA manda `autorizar_excedente` — nao existe caixa
   * nem campo de quantidade no modal de NF. Caminho medido: COMPRAS autoriza 999 de 10 no
   * `/conferir`, o documento anda ate ENCAMINHADO_FATURAMENTO, "Preencher Dados da NF" → Salvar →
   * 400 com a literal do excedente. `processar` depois morre em `validarDadosProcessamento`, porque
   * os dados fiscais nunca entraram: o documento fica PRESO.
   *
   * A regra: a barreira olha so os itens cuja `quantidade_recebida` ENVIADA e DIFERENTE da
   * GRAVADA. Ecoar uma quantidade que ja esta no banco — e que ja foi autorizada e auditada — nao
   * e um ato novo de autorizacao; MUDAR a quantidade e, e para esses a barreira continua inteira
   * (cenario (7)). DESCARTADO: mandar a tela reenviar `autorizar_excedente: true` no fiscal (seria
   * a flag ligada por quem nao tem a acao, em toda gravacao, esvaziando a RN-18) e tirar
   * `quantidade_recebida` do payload fiscal (o modal grava valor_unitario/lote item a item e o
   * `COALESCE` precisa do item; e o fiscal e o escritor real de quantidade em producao).
   *
   * O cenario (8) e o ACERVO: linha que ja esta no banco com recebida > esperada, gravada ANTES
   * desta etapa existir (sem trilha de autorizacao nenhuma). No deploy, essas linhas tomariam 400
   * em qualquer edicao fiscal — a regra por DIFERENCA as destrava sem anistiar aumento novo.
   */
  await test('(6) F1: /fiscal que ECOA a quantidade ja gravada passa SEM a flag', async () => {
    setUser(COMPRAS);
    const { recId, itemId } = await novoRecebimento();
    await emConferencia(recId);
    const aut = await conferir(recId, {
      autorizar_excedente: true,
      itens: [{ id: itemId, quantidade_recebida: 999, conferencia_quantidade: true }],
    });
    assert.strictEqual(aut.status, 200, JSON.stringify(aut.body));
    assert.strictEqual((await lerItem(itemId)).quantidade_recebida, 999, 'fixture: o excedente entrou autorizado');

    // O caminho REAL da tela: o modal de dados fiscais aparece na etapa de FATURAMENTO.
    for (const acao of ['finalizar_conferencia', 'encaminhar_compras', 'finalizar_compras']) {
      const wf = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao });
      assert.strictEqual(wf.status, 200, `${acao}: ${JSON.stringify(wf.body)}`);
    }

    // Quem preenche a NF e o faturamento — aqui o ALMOXARIFE, que NAO tem `autorizar_excedente`.
    // Se a barreira olhasse o valor absoluto, nem o ADMIN escaparia: sem flag, 400 sempre.
    setUser(ALMOXARIFE);
    const res = await fiscal(recId, {
      nota_serie: '77', itens: [{ id: itemId, quantidade_recebida: 999 }],
    });
    assert.strictEqual(res.status, 200, `ecoar a quantidade ja gravada nao e ato novo: ${JSON.stringify(res.body)}`);
    const rec = await dbGet(db,
      'SELECT nota_serie FROM recebimentos_material_almoxarifado WHERE id = ?', [recId]);
    assert.strictEqual(rec.nota_serie, '77', 'os dados fiscais TEM de ter sido gravados');
    assert.strictEqual((await lerItem(itemId)).quantidade_recebida, 999);
    setUser(ADMIN);
  });

  await test('(7) F1, metade positiva: /fiscal que AUMENTA a quantidade sem flag continua 400', async () => {
    setUser(COMPRAS);
    const { recId, itemId } = await novoRecebimento();
    await emConferencia(recId);
    const aut = await conferir(recId, {
      autorizar_excedente: true,
      itens: [{ id: itemId, quantidade_recebida: 999, conferencia_quantidade: true }],
    });
    assert.strictEqual(aut.status, 200, JSON.stringify(aut.body));

    // 999 -> 1000 e um ATO NOVO, e a autorizacao anterior nao o cobre.
    const res = await fiscal(recId, {
      nota_serie: '78', itens: [{ id: itemId, quantidade_recebida: 1000 }],
    });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, semFlag(1000, 10, itemId));
    assert.strictEqual((await lerItem(itemId)).quantidade_recebida, 999, 'a recusa e ANTES do UPDATE');
    const rec = await dbGet(db,
      'SELECT nota_serie FROM recebimentos_material_almoxarifado WHERE id = ?', [recId]);
    assert.strictEqual(rec.nota_serie, null, 'a recusa e do PUT INTEIRO');
    setUser(ADMIN);
  });

  await test('(8) F1: linha de ACERVO (excedente gravado sem trilha) nao trava a edicao fiscal', async () => {
    const { recId, itemId } = await novoRecebimento();
    // Direto no banco, sem passar por nenhuma das portas: e exatamente o estado de producao no
    // dia do deploy — recebida > esperada e ZERO linhas de EXCEDENTE_AUTORIZADO.
    await dbRun(db, `UPDATE recebimentos_material_itens_almoxarifado
      SET quantidade_recebida = 42 WHERE id = ?`, [itemId]);
    assert.strictEqual((await auditoriaExcedente(itemId)).length, 0, 'fixture: acervo nao tem trilha');
    await emConferencia(recId);

    setUser(ALMOXARIFE);
    const res = await fiscal(recId, {
      nota_serie: '79', itens: [{ id: itemId, quantidade_recebida: 42 }],
    });
    assert.strictEqual(res.status, 200, `acervo ecoado nao pode tomar 400: ${JSON.stringify(res.body)}`);
    assert.strictEqual((await lerItem(itemId)).quantidade_recebida, 42);
    assert.strictEqual((await auditoriaExcedente(itemId)).length, 0,
      'ecoar acervo nao inventa autorizacao que ninguem deu');
    setUser(ADMIN);
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
