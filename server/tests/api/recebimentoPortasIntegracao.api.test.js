/**
 * Etapa 36 — INTEGRAÇÃO das duas portas de escrita do recebimento, pela ROTA e pelo SERVIÇO.
 *
 * Verde por unidade nao prova que as partes COMPOEM. Esta etapa poe TRES guardas em CINCO pontos de
 * chamada: `tipo_recebimento` (RN-11) no `validate` das DUAS rotas; NF duplicada (RN-12/13/14) no
 * SERVICO, chamada por `criarRecebimento` e por `salvarDadosFiscal`; excedente (RN-18) tambem no
 * SERVICO, chamado por `conferirRecebimento` e por `salvarDadosFiscal`. O que CRUZA e a ordem: o
 * `validate` mora na ROTA, as outras duas moram no SERVICO, e a do excedente depende de `req.user`,
 * que so a rota injeta. Nenhum arquivo de unidade desta etapa exercita as tres na mesma sequencia.
 *
 * ⚠️ POR QUE EXISTE O CENARIO PELO SERVICO. Se alguem, amanha, mover a guarda de NF para a ROTA
 * (por parecer mais simples), o cenario da rota continua VERDE e o do servico fica VERMELHO — e o
 * achado e que `criarRecebimento` e `salvarDadosFiscal` tem outros chamadores potenciais
 * (importador, script de migracao, `processarNota`). E o inverso do defeito da Etapa 25, onde 12
 * cenarios de unidade verdes escondiam feature morta. O cenario do servico tambem MEDE a assimetria
 * deliberada: o enum NAO e checado no servico (o `validate` e da rota), e isso esta afirmado aqui
 * para que a proxima sessao nao "conserte" a camada errada.
 *
 * ⚠️ CORRECAO AO BRIEF (divergencia declarada). O brief pedia, no passo 8, `setUser(GESTOR)` -> 200.
 * Isso ficou OBSOLETO no fix 1 da Task 3 (`3e36af4`): `autorizar_excedente` passou a ser
 * `[ADMINISTRADOR, COMPRAS]` porque o GESTOR nao atravessa `receber_material`
 * (`[ADMINISTRADOR, ALMOXARIFE, COMPRAS]`) e portanto nao tinha PORTA. Aqui o passo 8 e COMPRAS
 * (tem a porta E a acao) e o passo 8b e o GESTOR: 403 de `receber_material`, da CAMADA 2, ANTES do
 * servico. Pelo servico (cenario 2) o GESTOR toma 403 de `autorizar_excedente` — a mesma recusa,
 * pela outra camada. As duas asserçoes juntas sao o mapa de qual camada recusou o que.
 *
 * ⚠️ MODO DE FALHA DESTE ARQUIVO: o TESTE VAZIO por acoplamento. O fluxo da rota esta em TRES
 * blocos e nao em um: as sabotagens da T2 (posicao da guarda de NF) e da T3 (ALMOXARIFE na lista)
 * tem de cair em pontos DIFERENTES, e num `test()` unico a primeira assercao a estourar esconderia
 * a outra. O bloco 1 e o territorio da guarda de NF (com a CONTAGEM de documentos, que e o que
 * torna visivel a guarda gravando antes de recusar); os blocos 2 e 3 sao o territorio do excedente
 * e da camada 2, com documento PROPRIO, para que a sabotagem de permissao caia so onde deve.
 *
 * Executar: cd server && node tests/api/recebimentoPortasIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const alertRegistry = require('../../services/almoxarifado/alertRegistry');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// (iii) Nenhum id de fixture `1`; a numeracao segue `minhasPermissoes.api.test.js` e os ids de
// recebimento/item sao SEMPRE lidos do banco ou da resposta.
const ADMIN = { id: 70, nome: 'Admin Integracao E36', role: 'admin' };
const ALMOXARIFE = { id: 71, nome: 'Almoxarife Int E36', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE' };
const COMPRAS = { id: 72, nome: 'Compras Int E36', role: 'usuario', perfil_almoxarifado: 'COMPRAS' };
const GESTOR = { id: 73, nome: 'Gestor Int E36', role: 'usuario', perfil_almoxarifado: 'GESTOR' };
const SEM_PERFIL = { id: 74, nome: 'Chao de Fabrica Int', role: 'usuario' };   // cai em PRODUCAO

// As literais das TRES guardas, congeladas. Escritas como funcao quando carregam dado do estado —
// e justamente esse pedaco que prova QUAL guarda respondeu.
const ENUM_INVALIDO = 'Dados inválidos — tipo_recebimento: '
  + 'forma de recebimento inválida (use NOTA_FISCAL ou PEDIDO_COMPRA)';
const nfDuplicada = (nf, numero) => `Nota fiscal ${nf} já lançada no recebimento ${numero} `
  + 'para este fornecedor';
const semFlag = (recebida, esperada, itemId) => `Quantidade recebida (${recebida}) maior que a `
  + `esperada (${esperada}) no item #${itemId} — a autorização de excedente é de Compras `
  + 'ou do Administrador';
const semPermissao = (perfil) => 'Autorizar recebimento acima do pedido exige a permissão '
  + `"autorizar_excedente" (seu perfil: ${perfil}).`;

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  const fornA = await dbRun(db,
    `INSERT INTO fornecedores (razao_social, cnpj) VALUES ('Forn Int A','77.777.777/0001-77')`);
  const fornB = await dbRun(db,
    `INSERT INTO fornecedores (razao_social, cnpj) VALUES ('Forn Int B','88.888.888/0001-88')`);
  const F1 = fornA.lastID;
  const F2 = fornB.lastID;

  let seq = 0;
  async function novoMaterial() {
    seq += 1;
    const m = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',0,1)`,
      [`E36-INT-${seq}`, `Chapa integracao ${seq}`]);
    return m.lastID;
  }

  const criar = (body) => request(app).post('/api/almoxarifado/recebimentos').send(body);
  const workflow = (id, acao) => request(app)
    .post(`/api/almoxarifado/recebimentos/${id}/workflow`).send({ acao });
  const fiscal = (id, body) => request(app)
    .put(`/api/almoxarifado/recebimentos/${id}/fiscal`).send(body);
  const conferir = (id, body) => request(app)
    .put(`/api/almoxarifado/recebimentos/${id}/conferir`).send(body);

  const contarDocs = async () => (await dbGet(db,
    'SELECT COUNT(*) AS n FROM recebimentos_material_almoxarifado')).n;
  const numeroDe = async (id) => (await dbGet(db,
    'SELECT numero FROM recebimentos_material_almoxarifado WHERE id = ?', [id])).numero;
  const lerItem = (itemId) => dbGet(db, `SELECT quantidade_esperada, quantidade_recebida,
    conferencia_quantidade FROM recebimentos_material_itens_almoxarifado WHERE id = ?`, [itemId]);
  const primeiroItem = (recId) => dbGet(db, `SELECT id FROM recebimentos_material_itens_almoxarifado
    WHERE recebimento_id = ? ORDER BY id ASC`, [recId]);
  const auditoriaExcedente = (itemId) => dbAll(db, `SELECT * FROM auditoria_log_almoxarifado
    WHERE entidade = 'recebimento_item' AND acao = 'EXCEDENTE_AUTORIZADO' AND entidade_id = ?`,
  [itemId]);

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // CENARIO 1 — pela ROTA, bloco 1: o `validate` da rota e a guarda de NF do servico, na ordem,
  // CONTANDO os documentos depois de cada gesto. A contagem e global de proposito: este e o
  // PRIMEIRO `test()` do arquivo e nada mais cria recebimento antes dele (as fixtures criam so
  // fornecedor e material). E ela que torna visivel a guarda que GRAVA antes de recusar — nao ha
  // transacao neste modulo, entao um `throw` depois do INSERT deixa o documento duplicado no banco.
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('(A) pela ROTA: enum na rota, NF duplicada nas DUAS portas, contando os documentos', async () => {
    const mat = await novoMaterial();

    // passo 0 — a guarda que mora na ROTA (`validate`), antes de qualquer servico.
    const p0 = await criar({
      tipo_recebimento: 'BANANA', nota_fiscal: 'NF-INT-1', fornecedor_id: F1,
      itens: [{ material_id: mat, quantidade: 10 }],
    });
    assert.strictEqual(p0.status, 400, JSON.stringify(p0.body));
    assert.strictEqual(p0.body.error, ENUM_INVALIDO);
    assert.strictEqual(await contarDocs(), 0, 'passo 0: o enum recusado nao pode ter criado documento');

    // passo 1 — o documento legitimo. `criarRecebimento` grava
    // `quantidade_recebida = item.quantidade_recebida || qtd`, logo o item nasce 10/10.
    const p1 = await criar({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: 'NF-INT-1', fornecedor_id: F1,
      fornecedor_nome: 'Forn Int A', itens: [{ material_id: mat, quantidade: 10 }],
    });
    assert.strictEqual(p1.status, 201, JSON.stringify(p1.body));
    assert.strictEqual(await contarDocs(), 1, 'passo 1');
    const numeroP1 = await numeroDe(p1.body.id);

    // passo 2 — a PRIMEIRA porta da guarda de NF, no servico. A mensagem cita o NUMERO do
    // documento existente (lido do banco, nunca escrito a mao: ele nasce com entropia), porque sem
    // ele o operador nao tem como achar onde a nota ja esta.
    const p2 = await criar({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: 'NF-INT-1', fornecedor_id: F1,
      fornecedor_nome: 'Forn Int A', itens: [{ material_id: mat, quantidade: 10 }],
    });
    assert.strictEqual(p2.status, 409, JSON.stringify(p2.body));
    assert.strictEqual(p2.body.error, nfDuplicada('NF-INT-1', numeroP1));
    // ⚠️ A ASSERCAO DE POSICAO: a guarda tem de recusar ANTES do `inserirComNumeroUnico`. Com ela
    // depois do INSERT o 409 continua saindo e SO esta contagem acusa o documento fantasma.
    assert.strictEqual(await contarDocs(), 1,
      'passo 2: o POST recusado nao pode ter GRAVADO documento antes de recusar');

    // passo 3 — a metade POSITIVA dentro do fluxo: dois fornecedores emitem nota com o mesmo
    // numero, e barrar isso seria pior que o furo.
    const p3 = await criar({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: 'NF-INT-1', fornecedor_id: F2,
      fornecedor_nome: 'Forn Int B', itens: [{ material_id: mat, quantidade: 10 }],
    });
    assert.strictEqual(p3.status, 201, JSON.stringify(p3.body));
    assert.strictEqual(await contarDocs(), 2, 'passo 3: mesma NF com OUTRO fornecedor entra');

    // passo 4 — a SEGUNDA porta da guarda de NF. OBRIGATORIO avancar o status antes:
    // `salvarDadosFiscal` recusa `RECEBIDO` ANTES de olhar a NF, e sem o `iniciar_conferencia` este
    // passo responderia 400 'Dados fiscais só podem ser editados antes do processamento' — antes E
    // depois do conserto, um vermelho pelo motivo errado.
    const wf = await workflow(p3.body.id, 'iniciar_conferencia');
    assert.strictEqual(wf.status, 200, JSON.stringify(wf.body));
    const p4 = await fiscal(p3.body.id, { nota_fiscal: 'NF-INT-1', fornecedor_id: F1 });
    assert.strictEqual(p4.status, 409, JSON.stringify(p4.body));
    assert.strictEqual(p4.body.error, nfDuplicada('NF-INT-1', numeroP1));
    // A recusa e do PUT INTEIRO e ANTES do UPDATE: o documento do passo 3 continua com F2.
    const doc3 = await dbGet(db,
      'SELECT fornecedor_id FROM recebimentos_material_almoxarifado WHERE id = ?', [p3.body.id]);
    assert.strictEqual(doc3.fornecedor_id, F2, 'passo 4: o 409 nao pode ter mudado o fornecedor');
    assert.strictEqual(await contarDocs(), 2, 'passo 4: nada foi criado pelo PUT');

    // E a metade positiva da segunda porta: o PROPRIO documento salvando a PROPRIA NF nao pode se
    // autoacusar (e o `AND id <> ?` da guarda).
    const proprio = await fiscal(p3.body.id, { nota_fiscal: 'NF-INT-1', nota_serie: '2' });
    assert.strictEqual(proprio.status, 200, JSON.stringify(proprio.body));

    // E o `validate` vale na SEGUNDA porta tambem — a guarda da rota nos dois pontos de chamada.
    const enum2 = await fiscal(p3.body.id, { tipo_recebimento: 'BANANA' });
    assert.strictEqual(enum2.status, 400, JSON.stringify(enum2.body));
    assert.strictEqual(enum2.body.error, ENUM_INVALIDO);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // CENARIO 2 — pela ROTA, bloco 2: conferencia, divergencia e a barreira do excedente. Documento
  // PROPRIO (NF-INT-2), para que a sabotagem de permissao caia SO aqui e a de NF caia SO no bloco 1.
  //
  // ⚠️ A ORDEM 6 -> 7 -> 8b -> 8 E O PONTO DESTE CENARIO: o MESMO gesto, no MESMO item, com
  // QUATRO respostas diferentes, mudando SO a flag e o perfil — 400 (falta intencao), 403 do
  // SERVICO (falta autoridade para a acao), 403 da ROTA (falta a porta do modulo) e 200. Nenhum
  // teste de unidade cobre isso, porque cada um monta o seu proprio usuario.
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('(B) pela ROTA: conferencia, divergencia e o MESMO gesto com quatro respostas', async () => {
    const mat = await novoMaterial();
    const criado = await criar({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: 'NF-INT-2', fornecedor_id: F1,
      fornecedor_nome: 'Forn Int A', itens: [{ material_id: mat, quantidade: 10 }],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const recId = criado.body.id;
    const itemId = (await primeiroItem(recId)).id;
    assert.strictEqual((await lerItem(itemId)).quantidade_esperada, 10, 'fixture: esperada 10');

    // passo 5 — receber MENOS passa sem flag (a barreira e do excedente, nao da falta) e o
    // DETECTOR de divergencia, que ja existia e nao tinha produtor alcancavel pela tela, lista 1.
    setUser(ALMOXARIFE);
    const p5 = await conferir(recId, {
      itens: [{ id: itemId, quantidade_recebida: 7, conferencia_quantidade: true }],
    });
    assert.strictEqual(p5.status, 200, JSON.stringify(p5.body));
    assert.strictEqual((await lerItem(itemId)).quantidade_recebida, 7, 'passo 5: a coluna e 7');
    const divs = await alertRegistry.listarDivergenciasRecebimento(db, { recebimentoId: recId });
    assert.strictEqual(divs.length, 1, 'passo 5: receber menos e divergencia registrada');
    assert.strictEqual(divs[0].item_id, itemId);
    assert.strictEqual(divs[0].divergencia, -3);

    // passo 6 — excedente SEM flag: 400 do SERVICO, e a coluna continua 7 (recusa antes do UPDATE).
    const p6 = await conferir(recId, {
      itens: [{ id: itemId, quantidade_recebida: 99, conferencia_quantidade: true }],
    });
    assert.strictEqual(p6.status, 400, JSON.stringify(p6.body));
    assert.strictEqual(p6.body.error, semFlag(99, 10, itemId));
    assert.strictEqual((await lerItem(itemId)).quantidade_recebida, 7, 'passo 6: a coluna continua 7');

    // passo 7 — MESMO gesto, COM flag, perfil ALMOXARIFE: 403 do SERVICO, nomeando a ACAO.
    // ⚠️ Assercao negativa de permissao: ela so e prova porque o 200 do passo 8 mora no MESMO
    // `test()`. `can()` devolve false para acao que nao conhece, entao esta metade ficaria verde
    // com a acao inexistente, pelo motivo errado.
    const p7 = await conferir(recId, {
      autorizar_excedente: true,
      itens: [{ id: itemId, quantidade_recebida: 99, conferencia_quantidade: true }],
    });
    assert.strictEqual(p7.status, 403, JSON.stringify(p7.body));
    assert.strictEqual(p7.body.error, semPermissao('ALMOXARIFE'));
    assert.strictEqual((await lerItem(itemId)).quantidade_recebida, 7, 'passo 7: o 403 nao gravou');
    assert.strictEqual((await auditoriaExcedente(itemId)).length, 0,
      'passo 7: excedente RECUSADO nao pode virar linha de EXCEDENTE_AUTORIZADO');

    // passo 8b — o MESMO gesto com o GESTOR: 403 da CAMADA 2 (`receber_material`), ANTES do
    // servico. As duas recusas sao 403 e dizem coisas DIFERENTES, e e isso que o cenario registra:
    // o ALMOXARIFE entra no modulo e nao tem a acao; o GESTOR nao entra na porta.
    // (Correcao ao brief: ele pedia GESTOR -> 200, obsoleto desde `3e36af4`.)
    setUser(GESTOR);
    const p8b = await conferir(recId, {
      autorizar_excedente: true,
      itens: [{ id: itemId, quantidade_recebida: 99, conferencia_quantidade: true }],
    });
    assert.strictEqual(p8b.status, 403, JSON.stringify(p8b.body));
    assert.strictEqual(p8b.body.acao, 'receber_material',
      'passo 8b: o GESTOR e barrado pela CAMADA 2, e a mensagem tem de nomear `receber_material`');
    assert.strictEqual(p8b.body.perfil, 'GESTOR');
    assert.strictEqual((await lerItem(itemId)).quantidade_recebida, 7, 'passo 8b: nada gravou');

    // passo 8 — COMPRAS: o unico perfil NAO-admin com a PORTA (`receber_material`) E a ACAO
    // (`autorizar_excedente`). E a metade POSITIVA, a que torna os dois 403 acima uma prova.
    setUser(COMPRAS);
    const p8 = await conferir(recId, {
      autorizar_excedente: true,
      itens: [{ id: itemId, quantidade_recebida: 99, conferencia_quantidade: true }],
    });
    assert.strictEqual(p8.status, 200, JSON.stringify(p8.body));
    assert.strictEqual((await lerItem(itemId)).quantidade_recebida, 99,
      'passo 8: com flag E permissao, o excedente TEM de ser gravado');
    const trilha = await auditoriaExcedente(itemId);
    assert.strictEqual(trilha.length, 1, 'passo 8: o excedente autorizado deixa trilha');
    assert.strictEqual(trilha[0].usuario_id, COMPRAS.id);
    setUser(ADMIN);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // CENARIO 3 — pela ROTA, bloco 3: a camada 2 continua na frente de TUDO. Documento proprio, e os
  // TRES gestos da etapa no mesmo cenario: o 403 nao depende de qual guarda viria depois.
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('(C) pela ROTA: SEM_PERFIL toma 403 de receber_material nas TRES portas', async () => {
    const mat = await novoMaterial();
    const criado = await criar({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: 'NF-INT-3', fornecedor_id: F1,
      itens: [{ material_id: mat, quantidade: 10 }],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const recId = criado.body.id;
    const itemId = (await primeiroItem(recId)).id;
    const antes = await contarDocs();

    setUser(SEM_PERFIL);
    const gestos = [
      // Payload INVALIDO de proposito em cada um: se a camada 2 saisse da frente, a resposta seria
      // 400 (enum / excedente), nao 200 — e o cenario continuaria "vermelho", mas por outro numero.
      // Afirmar 403 E a acao e o que prova que o gate veio ANTES do `validate` e antes do servico.
      ['POST /recebimentos', () => criar({
        tipo_recebimento: 'BANANA', nota_fiscal: 'NF-INT-3', fornecedor_id: F1,
        itens: [{ material_id: mat, quantidade: 10 }],
      })],
      ['PUT /:id/conferir', () => conferir(recId, {
        autorizar_excedente: true,
        itens: [{ id: itemId, quantidade_recebida: 999, conferencia_quantidade: true }],
      })],
      ['PUT /:id/fiscal', () => fiscal(recId, { tipo_recebimento: 'BANANA', nota_serie: '9' })],
    ];
    for (const [nome, gesto] of gestos) {
      const res = await gesto();
      assert.strictEqual(res.status, 403, `${nome}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.acao, 'receber_material', `${nome}: a acao negada`);
      assert.strictEqual(res.body.perfil, 'PRODUCAO',
        `${nome}: getPerfilFromUser faz fallback para PRODUCAO — sem perfil nao e "sem acesso"`);
    }
    setUser(ADMIN);

    // Nada aconteceu: nem documento novo, nem excedente gravado, nem serie fiscal.
    assert.strictEqual(await contarDocs(), antes, 'o 403 nao pode ter criado documento');
    assert.strictEqual((await lerItem(itemId)).quantidade_recebida, 10, 'o 403 nao gravou excedente');
    const doc = await dbGet(db,
      'SELECT nota_serie FROM recebimentos_material_almoxarifado WHERE id = ?', [recId]);
    assert.strictEqual(doc.nota_serie, null, 'o 403 nao gravou dados fiscais');
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // CENARIO 4 — pelo SERVICO, sem `supertest`: as duas guardas que MORAM no servico existem sem a
  // rota, e a que mora na ROTA nao existe sem ela. E o cenario que fica vermelho se alguem mover
  // uma guarda de camada, enquanto os tres de cima continuam verdes.
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('(D) pelo SERVICO: as guardas de NF e de excedente nao dependem da rota para existir', async () => {
    const mat = await novoMaterial();
    const base = {
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: 'NF-SRV-1', fornecedor_id: F1,
      fornecedor_nome: 'Forn Int A', itens: [{ material_id: mat, quantidade: 10 }],
    };

    // NF duplicada, sem passar pela rota: a segunda chamada REJEITA com 409 e a literal.
    const primeiro = await receiptService.criarRecebimento(db, ADMIN, base);
    assert.ok(primeiro.id, 'o primeiro criarRecebimento tem de resolver');
    const docsAntes = await contarDocs();
    await assert.rejects(
      () => receiptService.criarRecebimento(db, ADMIN, base),
      (e) => {
        assert.strictEqual(e.status, 409, `status errado: ${e.status} — ${e.message}`);
        assert.strictEqual(e.message, nfDuplicada('NF-SRV-1', primeiro.numero));
        return true;
      },
      'a guarda de NF mora no SERVICO: sem a rota ela TEM de continuar existindo');
    assert.strictEqual(await contarDocs(), docsAntes,
      'a recusa do servico e ANTES do INSERT do cabecalho');

    const itemId = (await primeiroItem(primeiro.id)).id;

    // Excedente sem flag: 400, pelo servico.
    await assert.rejects(
      () => receiptService.conferirRecebimento(db, ADMIN, primeiro.id, {
        itens: [{ id: itemId, quantidade_recebida: 99, conferencia_quantidade: true }],
      }),
      (e) => {
        assert.strictEqual(e.status, 400, `status errado: ${e.status} — ${e.message}`);
        assert.strictEqual(e.message, semFlag(99, 10, itemId));
        return true;
      },
      'excedente sem flag: a barreira mora no SERVICO');
    assert.strictEqual((await lerItem(itemId)).quantidade_recebida, 10, 'o 400 nao gravou');

    // Excedente COM flag e perfil sem a acao: 403, nomeando a acao. Duas metades negativas, porque
    // as duas camadas recusam por motivos diferentes e pelo servico as DUAS chegam ao mesmo `can()`:
    // o ALMOXARIFE (tem a porta, nao tem a acao) e o GESTOR (nao tem a porta, e tambem nao tem a
    // acao desde `3e36af4`). Pela rota o GESTOR nem chegaria aqui — esta e a unica forma de
    // exercitar `can(GESTOR, 'autorizar_excedente')`.
    for (const u of [ALMOXARIFE, GESTOR]) {
      const perfil = u.perfil_almoxarifado;
      await assert.rejects(
        () => receiptService.conferirRecebimento(db, u, primeiro.id, {
          autorizar_excedente: true,
          itens: [{ id: itemId, quantidade_recebida: 99, conferencia_quantidade: true }],
        }),
        (e) => {
          assert.strictEqual(e.status, 403, `${perfil}: status errado ${e.status} — ${e.message}`);
          assert.strictEqual(e.message, semPermissao(perfil));
          return true;
        },
        `${perfil} nao tem a acao: o servico TEM de recusar, nomeando a acao`);
      assert.strictEqual((await lerItem(itemId)).quantidade_recebida, 10, `${perfil}: nao gravou`);
      assert.strictEqual((await auditoriaExcedente(itemId)).length, 0, `${perfil}: sem trilha`);
    }

    // A METADE POSITIVA do servico: `recebida < esperada` RESOLVE e a coluna muda. Sem ela, um
    // `throw` incondicional em `conferirRecebimento` passaria as tres rejeicoes acima com louvor.
    const ok = await receiptService.conferirRecebimento(db, ADMIN, primeiro.id, {
      itens: [{ id: itemId, quantidade_recebida: 6, conferencia_quantidade: true }],
    });
    assert.ok(ok, 'a chamada legitima tem de resolver');
    const depois = await lerItem(itemId);
    assert.strictEqual(depois.quantidade_recebida, 6, 'a coluna TEM de ter mudado');
    assert.strictEqual(depois.conferencia_quantidade, 1);

    // E COM a acao: o ADMIN autoriza o excedente pelo servico, e a trilha nasce. Fecha a regua do
    // `can()` pelo lado positivo NESTA camada — nao so pela rota.
    const autorizado = await receiptService.conferirRecebimento(db, ADMIN, primeiro.id, {
      autorizar_excedente: true,
      itens: [{ id: itemId, quantidade_recebida: 99, conferencia_quantidade: true }],
    });
    assert.ok(autorizado, 'ADMIN tem a acao: a chamada resolve');
    assert.strictEqual((await lerItem(itemId)).quantidade_recebida, 99);
    assert.strictEqual((await auditoriaExcedente(itemId)).length, 1);

    // ⚠️ A ASSIMETRIA DELIBERADA, afirmada para que ninguem a "conserte" na camada errada: o ENUM
    // NAO e checado no servico. `validate(RecebimentoCreateSchema)` mora na ROTA, e `criarRecebimento`
    // chamado direto aceita `tipo_recebimento` fora da lista e GRAVA cru (o unico ramo que le a
    // coluna trata valor invalido como NOTA_FISCAL, em silencio). Isto e o inverso das duas guardas
    // acima, e e o achado que o cenario pelo servico existe para deixar escrito: um importador ou
    // script de migracao que chame o servico direto PASSA pelo enum e NAO passa pela NF nem pelo
    // excedente. Se um dia o enum descer para o servico, esta assercao fica vermelha e e AQUI que
    // se le por que.
    const bananaMat = await novoMaterial();
    const banana = await receiptService.criarRecebimento(db, ADMIN, {
      tipo_recebimento: 'BANANA', nota_fiscal: 'NF-SRV-2', fornecedor_id: F2,
      itens: [{ material_id: bananaMat, quantidade: 4 }],
    });
    const gravado = await dbGet(db,
      'SELECT tipo_recebimento FROM recebimentos_material_almoxarifado WHERE id = ?', [banana.id]);
    assert.strictEqual(gravado.tipo_recebimento, 'BANANA',
      'o enum e guarda de ROTA: o servico chamado direto NAO o checa — medido, nao suposto');
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
