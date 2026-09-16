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
 * ⚠️ DIVERGENCIA DECLARADA do plano/design, medida aqui: o design diz "com perfil GESTOR -> 200".
 * Pela ROTA isso e INALCANCAVEL — as duas portas sao gateadas por
 * `requirePermission('receber_material')`, que e `[ADMINISTRADOR, ALMOXARIFE, COMPRAS]`
 * (`permissions.js:86`), e GESTOR nao esta lá: ele toma 403 com `acao: 'receber_material'` ANTES
 * de o servico rodar. O unico perfil NAO-admin que tem as DUAS coisas e **COMPRAS**, e e ele que
 * faz a metade positiva pela rota. Para a lista de `autorizar_excedente` nao ficar sem regua do
 * lado do GESTOR, o cenario (2) tambem chama `conferirRecebimento` DIRETO no servico com um
 * usuario GESTOR — a camada que a decisao 6 do design escolheu para a checagem.
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
  await test('(0) autorizar_excedente existe em ACAO_PERFIS com a lista da decisao 6', async () => {
    assert.ok(ACAO_PERFIS.autorizar_excedente,
      'acao ausente de ACAO_PERFIS — o gate cairia em `|| []`, que nega tudo, e o 403 do '
      + 'ALMOXARIFE ficaria verde pelo motivo errado');
    assert.deepStrictEqual([...ACAO_PERFIS.autorizar_excedente].sort(),
      ['ADMINISTRADOR', 'COMPRAS', 'GESTOR']);
    assert.ok(!ACAO_PERFIS.autorizar_excedente.includes(PERFIS.ALMOXARIFE),
      'a exclusao do ALMOXARIFE e a decisao desta etapa, e sem esta linha ela muda sem regua');
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

    // A regua do GESTOR, na CAMADA onde a decisao 6 pos a checagem: o servico. Sem isto, o
    // GESTOR estaria na lista de ACAO_PERFIS sem nenhum teste exercitando o `can()` com ele.
    setUser(ADMIN);
    const viaServico = await novoRecebimento();
    const r = await receiptService.conferirRecebimento(db, GESTOR, viaServico.recId, {
      autorizar_excedente: true,
      itens: [{ id: viaServico.itemId, quantidade_recebida: 999, conferencia_quantidade: true }],
    });
    assert.deepStrictEqual(r, { success: true }, 'GESTOR tem a acao: o servico nao pode recusar');
    assert.strictEqual((await lerItem(viaServico.itemId)).quantidade_recebida, 999);
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

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
