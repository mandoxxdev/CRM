/**
 * RN-20, RN-21 e RN-25 (Etapa 37) — a TERCEIRA porta de escrita de quantidade.
 *
 * Medido por sonda executada na Fase 0: `POST /almoxarifado/recebimentos` com `pedido_compra_id`
 * aceitava **999 de um pedido de 10** com 201, e um pedido de 10 recebeu 25 em tres recebimentos e
 * continuou `ABERTO`. A barreira da Etapa 36 (`assertExcedentePermitido`) NAO alcanca esta porta
 * por construcao: ela compara o payload com a linha JA GRAVADA
 * (`SELECT ... WHERE id = ? AND recebimento_id = ?`) e da `continue` quando nao acha — no `POST` os
 * itens ainda nao existem, e a funcao e um no-op ali.
 *
 * Esta etapa acrescenta uma comparacao DIFERENTE, e as DUAS convivem dentro de
 * `criarRecebimento`:
 * - (Etapa 36, F5) `assertExcedenteNaCriacaoPermitido`: recebida > a esperada DO PROPRIO PAYLOAD,
 *   com `#` = POSICAO no payload. Continua valendo, e e ela que governa o caminho NF puro — o
 *   cenario (8) deste arquivo e a regua disso;
 * - (Etapa 37, RN-20) o SALDO DO PEDIDO DE COMPRA, agregado por material:
 *   `saldo = quantidade - COALESCE(quantidade_recebida, 0)` somado por material.
 *
 * ⚠️ MODO DE FALHA 4 DESTA ETAPA — a assercao negativa de permissao NAO nasce vermelha.
 * `can()` devolve `false` para acao que nao conhece, entao "ALMOXARIFE nao pode
 * `autorizar_excedente`" ficaria verde mesmo sem barreira nenhuma. A prova e o PAR no MESMO
 * `test()`: 403 de quem nao tem a acao E 201 de quem tem (cenario 2).
 *
 * ⚠️ MODO DE FALHA 3 DESTA ETAPA — `COUNT` de 0 contra 0 passa. Todo cenario daqui INSERE a linha
 * do pedido, le o id que o `INSERT` devolveu e afirma o VALOR — nunca "nao deu erro".
 *
 * ⚠️ De onde vem o saldo consumido NESTE arquivo: `quantidade_recebida` da linha do pedido e
 * escrita por `dbRun` DIRETO, no helper `novoPedido`. Em PRODUCAO quem a move e a Task 3 desta
 * etapa (o acumulador dentro do claim de `darEntradaEstoque`, na entrada FISICA) — e e
 * `pedidoSaldoRecebido.api.test.js` que mede isso. Escrever aqui pela porta do banco e o que
 * impede a T2 de ficar bloqueada pela T3 e o sort topologico de inverter.
 *
 * Executar: cd server && node tests/api/recebimentoExcedentePedido.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { ACAO_PERFIS } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// (iii) Nenhum id de fixture `1`: os usuarios seguem a numeracao de `recebimentoExcedente`
// (Etapa 36), e todo id de pedido/linha/item/recebimento e LIDO do `INSERT`.
const ADMIN = { id: 64, nome: 'Admin E37', role: 'admin' };
const ALMOXARIFE = { id: 65, nome: 'Almoxarife E37', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE' };
const COMPRAS = { id: 66, nome: 'Compras E37', role: 'usuario', perfil_almoxarifado: 'COMPRAS' };

// O SUFIXO e copiado LITERALMENTE do 400 da Etapa 36 pos-onda de correcao (achado F3): ele deixou
// de mandar "marque a autorização de excedente" — gesto impossivel para o ALMOXARIFE, que nunca ve
// a caixa — e passou a NOMEAR quem autoriza. As tres portas dizem a MESMA instrucao ao operador.
const SUFIXO = ' — a autorização de excedente é de Compras ou do Administrador';
const acimaDoSaldo = (recebida, saldo, codigo) => `Quantidade recebida (${recebida}) maior que o `
  + `saldo do pedido (${saldo}) para o material ${codigo}${SUFIXO}`;
// A literal do 400 da Etapa 36, para o cenario (8): o caminho NF puro continua governado por ELA.
const acimaDaEsperada = (recebida, esperada, ref) => `Quantidade recebida (${recebida}) maior que a `
  + `esperada (${esperada}) no item #${ref}${SUFIXO}`;
// O 403 e o MESMO texto das outras duas portas — mora em UM lugar de proposito (sabotagem 3).
const semPermissao = (perfil) => 'Autorizar recebimento acima do pedido exige a permissão '
  + `"autorizar_excedente" (seu perfil: ${perfil}).`;

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // `gerarContaPagar` insere aqui no `processar` do cenario (12). Subconjunto minimo das colunas
  // que o INSERT dele usa (molde: recebimentoNfDuplicada.api.test.js:41).
  await dbRun(db, `CREATE TABLE IF NOT EXISTS contas_pagar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL, fornecedor TEXT, valor REAL NOT NULL, data_vencimento DATE,
    data_pagamento DATE, status TEXT DEFAULT 'pendente', categoria TEXT, observacoes TEXT
  )`);

  const forn = await dbRun(db, `INSERT INTO fornecedores (razao_social, cnpj)
    VALUES ('Forn E37','77.777.777/0001-77')`);

  let seq = 0;
  async function novoMaterial() {
    seq += 1;
    const m = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',0,1)`,
    [`E37-SALDO-${seq}`, `Chapa saldo ${seq}`]);
    return { id: m.lastID, codigo: `E37-SALDO-${seq}` };
  }

  /**
   * Pedido de compra com as linhas ja no estado que o cenario precisa. `recebida` e escrita
   * DIRETO na coluna (ver o cabecalho): em producao e a T3 quem a move, na entrada fisica.
   */
  async function novoPedido(linhas) {
    seq += 1;
    const numero = `PC-E37-${seq}`;
    const p = await dbRun(db, `INSERT INTO pedidos_compra (numero, fornecedor_id, status)
      VALUES (?,?,'pendente')`, [numero, forn.lastID]);
    const ids = [];
    for (const l of linhas) {
      const r = await dbRun(db, `INSERT INTO itens_pedido_compra
        (pedido_id, material_id, codigo, descricao, quantidade, valor_unitario, unidade,
         quantidade_recebida)
        VALUES (?,?,?,?,?,?,'UN',?)`,
      [p.lastID, l.material_id, l.codigo || null, l.descricao || 'Linha do pedido',
        l.quantidade, l.valor_unitario != null ? l.valor_unitario : 10, l.recebida || 0]);
      ids.push(r.lastID);
    }
    return { id: p.lastID, numero, linhas: ids };
  }

  const post = (body) => request(app).post('/api/almoxarifado/recebimentos').send(body);
  const contarRecebimentos = async () => (await dbGet(db,
    'SELECT COUNT(*) AS n FROM recebimentos_material_almoxarifado')).n;
  const itensDo = (recId) => dbAll(db, `SELECT id, material_id, quantidade_esperada,
    quantidade_recebida, pedido_item_id FROM recebimentos_material_itens_almoxarifado
    WHERE recebimento_id = ? ORDER BY id`, [recId]);
  const auditoriaExcedente = (itemId) => dbAll(db, `SELECT * FROM auditoria_log_almoxarifado
    WHERE entidade = 'recebimento_item' AND acao = 'EXCEDENTE_AUTORIZADO' AND entidade_id = ?`,
  [itemId]);

  // ── (1) RN-20: acima do saldo recusa, e NAO deixa documento no banco ────────────────────────
  await test('(1) saldo 4 e POST de 6: 400 com a literal do saldo, e COUNT(recebimentos) INALTERADO', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10, recebida: 6 }]);
    const antes = await contarRecebimentos();

    const res = await post({
      pedido_compra_id: pedido.id,
      itens: [{ material_id: mat.id, quantidade: 6, quantidade_recebida: 6 }],
    });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, acimaDoSaldo(6, 4, mat.codigo));

    // A assercao que mede o DANO, e nao o status: nao ha transacao neste modulo, entao recusar
    // depois de `inserirComNumeroUnico` deixaria o documento gravado com um 400 por cima.
    assert.strictEqual(await contarRecebimentos(), antes,
      'a recusa tem de acontecer ANTES do INSERT do cabecalho');
  });

  // ── (2) RN-21: o PAR que prova a permissao, no MESMO test() ─────────────────────────────────
  await test('(2) autorizar_excedente: ALMOXARIFE toma 403 e COMPRAS grava 6 com UMA linha de trilha', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10, recebida: 6 }]);
    const corpo = {
      pedido_compra_id: pedido.id, autorizar_excedente: true,
      itens: [{ material_id: mat.id, quantidade: 6, quantidade_recebida: 6 }],
    };

    setUser(ALMOXARIFE);
    const negado = await post(corpo);
    assert.strictEqual(negado.status, 403, JSON.stringify(negado.body));
    assert.strictEqual(negado.body.error, semPermissao('ALMOXARIFE'));

    setUser(COMPRAS);
    const ok = await post(corpo);
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    const itens = await itensDo(ok.body.id);
    assert.strictEqual(itens.length, 1);
    assert.strictEqual(itens[0].quantidade_recebida, 6, 'o excedente autorizado e GRAVADO');
    assert.strictEqual(itens[0].quantidade_esperada, 4, 'a esperada nasce do SALDO (4), nao do payload');
    assert.strictEqual(itens[0].pedido_item_id, pedido.linhas[0]);

    const trilha = await auditoriaExcedente(itens[0].id);
    assert.strictEqual(trilha.length, 1,
      'UMA linha EXCEDENTE_AUTORIZADO por item excedente — duas seria a trilha inflada que a '
      + 'Etapa 36 pagou, e zero seria excedente sem rastro');
    setUser(ADMIN);
  });

  // ── (3) as metades POSITIVAS, que distinguem esta RN de uma copia da RN-18 ──────────────────
  await test('(3) recebida === saldo, recebida < saldo e saldo CHEIO: os tres 201', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10, recebida: 6 }]);

    const igual = await post({
      pedido_compra_id: pedido.id,
      itens: [{ material_id: mat.id, quantidade: 4, quantidade_recebida: 4 }],
    });
    assert.strictEqual(igual.status, 201, `recebida === saldo: ${JSON.stringify(igual.body)}`);

    // RN-23: o documento acima NAO foi processado, entao o saldo do pedido continua 4 (quem o
    // consome e a entrada FISICA). Se este POST tomar 400, a etapa passou a contar documento
    // aberto como saldo consumido — que e etapa propria, declarada em "NAO cobre".
    const menor = await post({
      pedido_compra_id: pedido.id,
      itens: [{ material_id: mat.id, quantidade: 3, quantidade_recebida: 3 }],
    });
    assert.strictEqual(menor.status, 201, `recebida < saldo: ${JSON.stringify(menor.body)}`);

    const mat2 = await novoMaterial();
    const cheio = await novoPedido([{ material_id: mat2.id, quantidade: 10 }]);
    const res = await post({
      pedido_compra_id: cheio.id,
      itens: [{ material_id: mat2.id, quantidade: 10, quantidade_recebida: 10 }],
    });
    assert.strictEqual(res.status, 201, `saldo cheio: ${JSON.stringify(res.body)}`);
    const itens = await itensDo(res.body.id);
    assert.strictEqual(itens[0].quantidade_esperada, 10, 'a regua e o SALDO, nao a quantidade original');
  });

  // ── (4) RN-25: POST SEM `itens` — a esperada nasce do SALDO ─────────────────────────────────
  await test('(4) RN-25: POST sem itens contra pedido de 10 com 6 recebidos nasce 4/4 (hoje nasceria 10/10)', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10, recebida: 6 }]);

    const res = await post({ pedido_compra_id: pedido.id });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const itens = await itensDo(res.body.id);
    assert.strictEqual(itens.length, 1);
    assert.strictEqual(itens[0].quantidade_esperada, 4,
      'a esperada do item nasce do SALDO: com 10/10 o /conferir da Etapa 36 mediria contra o '
      + 'pedido INTEIRO e o recebimento parcial ficaria impossivel de registrar certo');
    assert.strictEqual(itens[0].quantidade_recebida, 4);
    assert.strictEqual(itens[0].pedido_item_id, pedido.linhas[0],
      'o item guarda a LINHA do pedido — e o que a T3 vai usar para somar');
  });

  // ── (5) RN-25: pedido quitado tem literal PROPRIA ───────────────────────────────────────────
  await test('(5) RN-25: pedido inteiramente recebido, POST sem itens: 400 "ja foi recebido por completo"', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10, recebida: 10 }]);
    const antes = await contarRecebimentos();

    const res = await post({ pedido_compra_id: pedido.id });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, `Pedido de compra ${pedido.numero} já foi recebido por completo`);
    assert.notStrictEqual(res.body.error, 'Inclua ao menos um item',
      'a literal do caminho NF nao explica NADA ao operador do pedido');
    assert.strictEqual(await contarRecebimentos(), antes);
  });

  // ── (6) R5: `pedido_item_id` forjado nao contorna, e o servidor grava o RESOLVIDO ────────────
  await test('(6) pedido_item_id de OUTRO pedido: 400 igual, e o 201 legitimo grava a linha RESOLVIDA', async () => {
    const mat = await novoMaterial();
    const alvo = await novoPedido([{ material_id: mat.id, quantidade: 10, recebida: 6 }]);
    // O pedido de onde vem o id FORJADO: mesmo material, saldo cheio. Se o servidor confiasse no
    // payload, ele mediria 6 contra um saldo de 10 e responderia 201.
    const outro = await novoPedido([{ material_id: mat.id, quantidade: 10 }]);

    const forjado = await post({
      pedido_compra_id: alvo.id,
      itens: [{ material_id: mat.id, pedido_item_id: outro.linhas[0], quantidade: 6, quantidade_recebida: 6 }],
    });
    assert.strictEqual(forjado.status, 400, JSON.stringify(forjado.body));
    assert.strictEqual(forjado.body.error, acimaDoSaldo(6, 4, mat.codigo),
      'a regua e o saldo AGREGADO do pedido resolvido — o id do payload nunca decide se o POST passa');

    const ok = await post({
      pedido_compra_id: alvo.id,
      itens: [{ material_id: mat.id, pedido_item_id: outro.linhas[0], quantidade: 4, quantidade_recebida: 4 }],
    });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    const itens = await itensDo(ok.body.id);
    assert.strictEqual(itens[0].pedido_item_id, alvo.linhas[0],
      'o servidor RE-RESOLVE a linha por material; gravar o id forjado faria a T3 somar no pedido errado');
  });

  // ── (7) decisao 3: a regua e por MATERIAL, agregada ─────────────────────────────────────────
  await test('(7) duas linhas do MESMO material (6 e 4): POST de 10 passa e POST de 11 diz saldo 10', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([
      { material_id: mat.id, quantidade: 6 },
      { material_id: mat.id, quantidade: 4 },
    ]);

    const ok = await post({
      pedido_compra_id: pedido.id,
      itens: [{ material_id: mat.id, quantidade: 10, quantidade_recebida: 10 }],
    });
    assert.strictEqual(ok.status, 201,
      `regua por LINHA faria um recebimento LEGITIMO tomar 400: ${JSON.stringify(ok.body)}`);

    const res = await post({
      pedido_compra_id: pedido.id,
      itens: [{ material_id: mat.id, quantidade: 11, quantidade_recebida: 11 }],
    });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, acimaDoSaldo(11, 10, mat.codigo));
  });

  // ── (8) a REGRESSAO DECLARADA: o caminho NF puro nao e alcancado por esta regua ─────────────
  /**
   * ⚠️ O plano escreveu este cenario como "POST 999 com quantidade_esperada 10 -> 201", com a nota
   * "a RN-18 nao alcanca o POST sem pedido". Isso ficou VELHO: o fix-round 2 (F5) da onda de
   * correcao da Etapa 36 (`17c4130`, ja no HEAD desta task) levou a RN-18 para a TERCEIRA porta.
   * O que o cenario tem de provar continua sendo o mesmo FATO — a regua NOVA e contra o PEDIDO e
   * nao alcanca o caminho sem pedido —, mas a prova mudou de forma: sem pedido, o 400 e o da
   * Etapa 36 (contra a esperada do proprio payload, `#` = posicao) e NUNCA o do saldo; e com a
   * flag + COMPRAS o documento entra, porque ali nao existe "esperado" que nao seja o que o
   * proprio operador digitou.
   */
  await test('(8) caminho NF puro: o 400 e o da Etapa 36 (esperada/posicao), nunca o do saldo do pedido', async () => {
    const mat = await novoMaterial();
    const corpo = {
      tipo_recebimento: 'NOTA_FISCAL',
      itens: [{ material_id: mat.id, quantidade: 10, quantidade_esperada: 10, quantidade_recebida: 999 }],
    };

    const negado = await post(corpo);
    assert.strictEqual(negado.status, 400, JSON.stringify(negado.body));
    assert.strictEqual(negado.body.error, acimaDaEsperada(999, 10, 1),
      'sem pedido nao ha saldo a medir: quem governa e a barreira da Etapa 36, com a POSICAO no payload');

    setUser(COMPRAS);
    const ok = await post({ ...corpo, autorizar_excedente: true });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    const itens = await itensDo(ok.body.id);
    assert.strictEqual(itens[0].quantidade_recebida, 999);
    assert.strictEqual(itens[0].pedido_item_id, null, 'sem pedido nao ha linha a ligar');
    setUser(ADMIN);
  });

  // ── (9) o congelamento da lista, convencao de toda acao deste modulo desde a Etapa 8 ────────
  await test('(9) ACAO_PERFIS.autorizar_excedente continua [ADMINISTRADOR, COMPRAS]', async () => {
    assert.deepStrictEqual([...ACAO_PERFIS.autorizar_excedente].sort(),
      ['ADMINISTRADOR', 'COMPRAS'],
      'esta etapa REUSA a acao da Etapa 36 e NAO alarga a lista — sem esta linha ela cresce sem regua');
  });

  // ── (10) (Fase 2) a esperada do caminho que a TELA usa (POST COM `itens`) ───────────────────
  await test('(10) POST com itens mandando quantidade_esperada 99 contra saldo 4: grava 4, o SALDO', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10, recebida: 6 }]);

    const res = await post({
      pedido_compra_id: pedido.id,
      itens: [{ material_id: mat.id, quantidade: 4, quantidade_esperada: 99, quantidade_recebida: 4 }],
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const itens = await itensDo(res.body.id);
    assert.strictEqual(itens[0].quantidade_esperada, 4,
      'esperada vinda do PAYLOAD desligaria a barreira da Etapa 36 no /conferir em silencio: ela '
      + 'compara a recebida com a ESPERADA GRAVADA, e 99 aceitaria qualquer contagem depois');
    assert.strictEqual(itens[0].quantidade_recebida, 4);
    assert.strictEqual(itens[0].pedido_item_id, pedido.linhas[0]);
  });

  // ── (11) (Fase 2) o schema Zod deixa passar o payload LITERAL que a T5 monta ────────────────
  await test('(11) o payload da tela (sem quantidade_esperada e sem valor_unitario) passa na validacao', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10 }]);

    const res = await post({
      pedido_compra_id: pedido.id,
      itens: [{
        material_id: mat.id, pedido_item_id: pedido.linhas[0],
        quantidade: 4, quantidade_recebida: 4,
      }],
    });
    assert.strictEqual(res.status, 201,
      'a onda da 36 (R6) deu schema aos itens do POST; um `.positive()` OBRIGATORIO em '
      + `quantidade_esperada faria a tela nova tomar 400 na validacao: ${JSON.stringify(res.body)}`);

    // Metade NEGATIVA, que prova que o schema nao morreu para deixar o payload passar.
    const invalido = await post({
      pedido_compra_id: pedido.id,
      itens: [{ material_id: mat.id, quantidade: 'abc' }],
    });
    assert.strictEqual(invalido.status, 400, JSON.stringify(invalido.body));
  });

  // ── (12) (Fase 2) O FLUXO ATE O FIM — a licao da Etapa 36 ───────────────────────────────────
  /**
   * O `POST` desta etapa CRIA documentos que nascem com `recebida > esperada` — populacao que
   * antes so existia por autorizacao no `/conferir`. Se a porta nova criar documentos que ela
   * mesma nao consegue levar ate o fim, a etapa entrega o Critical da 36 de novo.
   * A regra pos-onda ("barra so o AUMENTO sobre a quantidade JA GRAVADA") vale nas DUAS portas
   * sem flag nenhum a passar, entao ECOAR 6 nao e ato novo de autorizacao.
   */
  await test('(12) o documento que nasce excedente atravessa /conferir, /fiscal e chega a PROCESSADO', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10, recebida: 6 }]);

    setUser(COMPRAS);
    const criado = await post({
      pedido_compra_id: pedido.id, autorizar_excedente: true,
      itens: [{ material_id: mat.id, quantidade: 6, quantidade_recebida: 6 }],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const recId = criado.body.id;
    const [item] = await itensDo(recId);
    assert.strictEqual(item.quantidade_esperada, 4);
    assert.strictEqual(item.quantidade_recebida, 6);

    const wf = (acao) => request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`)
      .send({ acao });
    const iniciada = await wf('iniciar_conferencia');
    assert.strictEqual(iniciada.status, 200, JSON.stringify(iniciada.body));

    // (a) o payload REAL do painel de conferencia: ECOA a quantidade gravada e NAO manda a flag.
    setUser(ALMOXARIFE);
    const conferir = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/conferir`)
      .send({ itens: [{ id: item.id, quantidade_recebida: 6 }] });
    assert.strictEqual(conferir.status, 200,
      `ecoar a quantidade JA GRAVADA nao e ato novo de autorizacao: ${JSON.stringify(conferir.body)}`);
    setUser(ADMIN);

    for (const acao of ['finalizar_conferencia', 'encaminhar_compras', 'finalizar_compras',
      'iniciar_faturamento']) {
      const r = await wf(acao);
      assert.strictEqual(r.status, 200, `workflow ${acao}: ${JSON.stringify(r.body)}`);
    }

    // (b) o payload REAL do modal de NF: sem caixa de autorizacao, com os itens ecoando 6.
    // `fornecedor_nome` vai junto porque `validarDadosProcessamento` exige CNPJ OU nome, e o
    // `POST` por pedido preenche os dois pelo pedido — o eco mantem o que ja esta gravado.
    const fiscal = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`).send({
      nota_fiscal: `NF-E37-${recId}`, fornecedor_id: forn.lastID, fornecedor_nome: 'Forn E37',
      data_emissao_nf: '2026-09-10', data_entrada_nf: '2026-09-11', valor_total_nota: 600,
      itens: [{ id: item.id, quantidade_recebida: 6 }],
    });
    assert.strictEqual(fiscal.status, 200, JSON.stringify(fiscal.body));

    // (c) o documento chega a PROCESSADO pelo workflow REAL.
    const proc = await wf('processar');
    assert.strictEqual(proc.status, 200, JSON.stringify(proc.body));
    const rec = await dbGet(db,
      'SELECT status FROM recebimentos_material_almoxarifado WHERE id = ?', [recId]);
    assert.strictEqual(rec.status, 'PROCESSADO');
    // ⚠️ "e o pedido soma" e a metade da RN-22, que e a Task 3 desta etapa (o acumulador dentro
    // do claim de `darEntradaEstoque`). Ela e afirmada em `pedidoSaldoRecebido.api.test.js`;
    // afirmar aqui deixaria a T2 vermelha por trabalho que ainda nao existe.
  });

  // ── (13) (Fase 2) pedido SEM nenhuma linha lancada tem literal PROPRIA ──────────────────────
  await test('(13) pedido sem itens lancados no Compras: 400 proprio, e ele continua visivel na rota aux', async () => {
    const pedido = await novoPedido([]);
    const linhas = await dbGet(db,
      'SELECT COUNT(*) AS n FROM itens_pedido_compra WHERE pedido_id = ?', [pedido.id]);
    assert.strictEqual(linhas.n, 0, 'o cenario exige COUNT = 0, senao mede outra coisa');

    const res = await post({ pedido_compra_id: pedido.id });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error,
      `Pedido de compra ${pedido.numero} não tem itens lançados no módulo Compras`);
    assert.notStrictEqual(res.body.error,
      `Pedido de compra ${pedido.numero} já foi recebido por completo`,
      'dizer "recebido por completo" a um pedido que o Compras nao preencheu e MENTIRA');
    assert.notStrictEqual(res.body.error, 'Inclua ao menos um item');

    // Metade POSITIVA: e ESTE pedido que a rota aux oferece ao operador. Sem ela, a tela poderia
    // estar oferecendo um pedido que a porta recusa — e recusa mentindo.
    // ⚠️ `?pendentes=1` e `situacao_recebimento: 'ABERTO'` (RN-24) sao contrato da TASK 4 e a
    // assercao deles mora em `pedidosCompraSaldoAux.api.test.js`, cenario (3): afirmar aqui
    // deixaria a T2 vermelha por trabalho que ainda nao existe. O que da para afirmar HOJE, e que
    // e a metade que importa para a distincao das duas literais, e que o pedido APARECE.
    const aux = await request(app).get('/api/almoxarifado/recebimentos-aux/pedidos-compra');
    assert.strictEqual(aux.status, 200, JSON.stringify(aux.body));
    assert.ok(aux.body.some((p) => p.numero === pedido.numero),
      'o pedido sem linhas e oferecido pela rota aux — por isso a porta nao pode recusa-lo mentindo');
  });

  // ── (14) (revisao final, F2) o POST SEM `itens` tem de montar um payload que ELE MESMO aceita ─
  /**
   * Achado F2 da revisao da branch. O caminho sem `itens` (RN-25) montava cada item com o saldo da
   * LINHA (`recebida: l.saldo`), e logo abaixo `assertSaldoDoPedidoPermitido` media a soma contra o
   * saldo AGREGADO POR MATERIAL — que e MENOR quando outra linha do mesmo material ja recebeu a
   * mais (ela entra NEGATIVA no agregado, e e o estado que o excedente autorizado desta etapa
   * CRIA). O servidor se oferecia 10 e se recusava com 400 "saldo do pedido (5)": o operador que
   * apertasse "Registrar" num pedido assim tomava uma recusa que ninguem no sistema tinha como
   * evitar, porque o payload nao era dele.
   *
   * A correcao clampa o que o proprio servidor gera: por material, a soma distribuida nunca passa
   * do agregado (e o agregado nunca e lido como negativo). Nao e a mesma conta de
   * `quantidadeInicialDaLinhaDoPedido` no client - la o default e de UMA linha; aqui e o RATEIO
   * das linhas na ordem de id.
   */
  await test('(14) linha estourada derruba o agregado: o POST sem itens oferece 5 (o que cabe), nao 10', async () => {
    const mat = await novoMaterial();
    // A: 10 pedidos com 15 recebidos (saldo -5, e ela NAO volta em `comSaldo`).
    // B: 10 pedidos com 0 recebidos (saldo 10). Agregado do material: 5.
    const pedido = await novoPedido([
      { material_id: mat.id, quantidade: 10, recebida: 15 },
      { material_id: mat.id, quantidade: 10, recebida: 0 },
    ]);

    const res = await post({ pedido_compra_id: pedido.id });
    assert.strictEqual(res.status, 201,
      `o servidor nao pode montar um payload que ele mesmo recusa: ${JSON.stringify(res.body)}`);

    const itens = await itensDo(res.body.id);
    assert.strictEqual(itens.length, 1, 'so a linha B tem saldo — a A entra negativa e nao volta');
    assert.strictEqual(itens[0].pedido_item_id, pedido.linhas[1]);
    // O NUMERO e a prova: 10 (o saldo da linha) passaria a ser recusado pela regua logo abaixo, e
    // 5 e o teto agregado do material. Os dois campos, porque a esperada gravada e a regua que a
    // barreira da Etapa 36 usa depois no /conferir.
    assert.strictEqual(itens[0].quantidade_esperada, 5);
    assert.strictEqual(itens[0].quantidade_recebida, 5);
  });

  // ── (15) (F2) e quando o agregado inteiro esta estourado, a literal e a do QUITADO ───────────
  /**
   * Metade que impede a correcao de virar "mande zero": clampar sem descartar a linha faria nascer
   * um item de 0 (ou, pior, `Inclua ao menos um item` — a recusa do caminho NF, que nao explica
   * nada a quem escolheu um pedido). Com o agregado <= 0 nao ha o que receber, e isso e exatamente
   * o que a literal do quitado diz.
   */
  await test('(15) agregado do material <= 0 com linha de saldo positivo: 400 do QUITADO, nunca "Inclua ao menos um item"', async () => {
    const mat = await novoMaterial();
    // A: 10 pedidos com 25 recebidos (saldo -15). B: 10 com 0 (saldo 10). Agregado: -5.
    const pedido = await novoPedido([
      { material_id: mat.id, quantidade: 10, recebida: 25 },
      { material_id: mat.id, quantidade: 10, recebida: 0 },
    ]);
    const antes = await contarRecebimentos();

    const res = await post({ pedido_compra_id: pedido.id });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error,
      `Pedido de compra ${pedido.numero} já foi recebido por completo`);
    assert.notStrictEqual(res.body.error, 'Inclua ao menos um item');
    assert.strictEqual(await contarRecebimentos(), antes,
      'a recusa continua ANTES do INSERT do cabecalho');
  });


  // ── (16) (revisao final, F3) `pedido_item_id` DO PEDIDO mas de OUTRO MATERIAL ───────────────
  /**
   * Achado F3 da revisao da branch, medido por sonda. `resolverLinhaDoPedido` aceitava o
   * `pedido_item_id` explicito so por ele PERTENCER ao pedido, sem olhar o material. O INSERT
   * gravava o `material_id` DO PAYLOAD ao lado da linha de OUTRO material, e o resultado era um
   * documento que mentia dos dois lados: o pedido passava a dizer que chegaram 5 do material Y
   * (a T3 soma na linha gravada) enquanto o estoque creditava 5 do material X, e Y ficava em 0.
   * Nao havia nenhuma porta no caminho: a regua do saldo agrupa o payload pelo material DA LINHA
   * resolvida, entao ela media 5 contra o saldo de Y e aprovava.
   *
   * A recusa e 400 com literal PROPRIA (`Item do pedido #<id> nao e do material <COD>`), e nao a
   * re-resolucao silenciosa por material: o payload afirmou DUAS coisas incompativeis, e escolher
   * uma delas em silencio grava um documento que ninguem pediu. O cenario (6) continua valendo e
   * mede o OUTRO caso — id de outro PEDIDO, que a rota nunca prometeu que existisse aqui e cai no
   * fallback por material documentado na decisao 9.
   */
  await test('(16) pedido_item_id do pedido mas de outro material: 400 com literal propria, sem documento', async () => {
    const matX = await novoMaterial();
    const matY = await novoMaterial();
    const pedido = await novoPedido([
      { material_id: matX.id, codigo: matX.codigo, quantidade: 10 },
      { material_id: matY.id, codigo: matY.codigo, quantidade: 10 },
    ]);
    const [linhaX, linhaY] = pedido.linhas;
    const antes = await contarRecebimentos();

    const forjado = await post({
      pedido_compra_id: pedido.id,
      itens: [{ material_id: matX.id, pedido_item_id: linhaY, quantidade: 5, quantidade_recebida: 5 }],
    });
    assert.strictEqual(forjado.status, 400, JSON.stringify(forjado.body));
    assert.strictEqual(forjado.body.error,
      `Item do pedido #${linhaY} não é do material ${matX.codigo}`);
    // A assercao que mede o DANO: nao ha transacao, e recusar depois do INSERT deixaria o
    // documento gravado. Antes do fix esta chamada devolvia 201 e creditava X somando em Y.
    assert.strictEqual(await contarRecebimentos(), antes,
      'a recusa tem de acontecer ANTES do INSERT do cabecalho');

    // ── metade POSITIVA: o mesmo payload com o id CERTO entra, e grava a linha que ele declarou ─
    const ok = await post({
      pedido_compra_id: pedido.id,
      itens: [{ material_id: matX.id, pedido_item_id: linhaX, quantidade: 5, quantidade_recebida: 5 }],
    });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    const itens = await itensDo(ok.body.id);
    assert.strictEqual(itens[0].pedido_item_id, linhaX);
    assert.strictEqual(itens[0].material_id, matX.id);
  });


  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
