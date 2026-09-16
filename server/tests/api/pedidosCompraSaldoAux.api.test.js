/**
 * RN-24 (Etapa 37) — a SITUACAO do pedido de compra, DERIVADA NA LEITURA.
 *
 * Medido por sonda executada na Fase 0: um pedido de 10 unidades recebeu 25 em tres recebimentos e
 * continuou `ABERTO` com `quantidade = 10`. As Tasks 1..3 desta etapa deram ao pedido onde guardar
 * o que chegou (`itens_pedido_compra.quantidade_recebida`, escrita na entrada FISICA, dentro do
 * claim de `darEntradaEstoque`). Esta task e a LEITURA: `GET /recebimentos-aux/pedidos-compra`
 * passa a dizer `quantidade_pedida`, `quantidade_recebida`, `saldo_pendente` e
 * `situacao_recebimento`, e nasce a rota de ITENS do pedido que a tela (T5) consome.
 *
 * ⚠️ NADA AQUI ESCREVE EM `pedidos_compra`. Ela e tabela CORE (`server/index.js:19230`), com
 * vocabulario de status MINUSCULO e badge por mapa de cores em `client/src/components/Compras.js`:
 * gravar `'RECEBIDO'` ali pintaria a tela de Compras de cinza com a palavra crua e nao casaria com
 * nenhum `?status=`. A situacao e derivada de SOMAS a cada leitura — e o cenario (5) e a regua
 * disso, com a sabotagem 3 provando que ele sabe falhar.
 *
 * ⚠️ MODO DE FALHA 3 DESTA ETAPA — `COUNT` de 0 contra 0 passa. Todo cenario daqui INSERE a linha
 * do pedido, le o id que o `INSERT` devolveu e afirma o VALOR (10/6/4/'PARCIAL'), nunca "nao deu
 * erro" nem "o campo existe".
 *
 * ⚠️ De onde vem o saldo consumido NESTE arquivo: nos cenarios de leitura pura,
 * `quantidade_recebida` da linha do pedido e escrita por `dbRun` DIRETO (mesma tecnica de
 * `recebimentoExcedentePedido.api.test.js`) — o que se mede aqui e a DERIVACAO, nao o acumulador,
 * que tem arquivo proprio (`pedidoSaldoRecebido.api.test.js`). Nos cenarios (5) e (7), ao
 * contrario, o numero chega pelo caminho REAL: `POST /recebimentos` + `POST /recebimentos/:id/
 * aprovar`, que entra no estoque por `darEntradaEstoque` e passa pelo acumulador da Task 3.
 *
 * Executar: cd server && node tests/api/pedidosCompraSaldoAux.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// (iii) Nenhum id de fixture `1`: os usuarios seguem a numeracao de `recebimentoExcedente`
// (Etapa 36) e de `recebimentoExcedentePedido` (T2), e todo id de pedido/linha e LIDO do `INSERT`.
const ADMIN = { id: 64, nome: 'Admin E37', role: 'admin' };
const COMPRAS = { id: 66, nome: 'Compras E37', role: 'usuario', perfil_almoxarifado: 'COMPRAS' };

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  const forn = await dbRun(db, `INSERT INTO fornecedores (razao_social, cnpj)
    VALUES ('Forn E37 T4','78.778.778/0001-78')`);

  let seq = 0;
  async function novoMaterial() {
    seq += 1;
    const m = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',0,1)`,
    [`E37-T4-${seq}`, `Chapa leitura ${seq}`]);
    return { id: m.lastID, codigo: `E37-T4-${seq}` };
  }

  /**
   * Pedido de compra com as linhas ja no estado que o cenario precisa.
   * `tag` entra no NUMERO para que cada cenario possa consultar a rota com `?search=<tag>` e
   * afirmar sobre o SEU conjunto: sem isso, o `LIMIT 50` da rota faria os cenarios interferirem
   * uns nos outros conforme o arquivo crescesse (e o cenario (6) cria 50 pedidos de proposito).
   * `created_at` e explicito onde a ORDEM importa: o DEFAULT `CURRENT_TIMESTAMP` tem resolucao de
   * SEGUNDO, entao pedidos criados no mesmo segundo empatam e o `ORDER BY ... DESC` fica indefinido.
   */
  async function novoPedido(linhas, opcoes = {}) {
    seq += 1;
    const numero = `PC-E37T4-${opcoes.tag || 'X'}-${seq}`;
    const cols = ['numero', 'fornecedor_id', 'status'];
    const vals = [numero, forn.lastID, opcoes.status || 'pendente'];
    if (opcoes.created_at) { cols.push('created_at'); vals.push(opcoes.created_at); }
    const p = await dbRun(db, `INSERT INTO pedidos_compra (${cols.join(',')})
      VALUES (${cols.map(() => '?').join(',')})`, vals);
    const ids = [];
    for (const l of linhas) {
      const r = await dbRun(db, `INSERT INTO itens_pedido_compra
        (pedido_id, material_id, codigo, descricao, quantidade, valor_unitario, unidade,
         quantidade_recebida)
        VALUES (?,?,?,?,?,?,?,?)`,
      [p.lastID, l.material_id || null, l.codigo || null, l.descricao || 'Linha do pedido',
        l.quantidade, l.valor_unitario != null ? l.valor_unitario : 10, l.unidade || 'UN',
        l.recebida != null ? l.recebida : 0]);
      ids.push(r.lastID);
    }
    return { id: p.lastID, numero, linhas: ids };
  }

  const listar = (qs) => request(app)
    .get(`/api/almoxarifado/recebimentos-aux/pedidos-compra${qs || ''}`);
  const itensDoPedido = (id) => request(app)
    .get(`/api/almoxarifado/recebimentos-aux/pedidos-compra/${id}/itens`);
  const linhaDoPedido = (id) => dbGet(db,
    'SELECT quantidade, quantidade_recebida FROM itens_pedido_compra WHERE id = ?', [id]);
  const statusCore = (id) => dbGet(db, 'SELECT status FROM pedidos_compra WHERE id = ?', [id]);

  /**
   * O caminho REAL de entrada fisica em DOIS gestos: `POST /recebimentos` (a terceira porta, T2) e
   * `POST /recebimentos/:id/aprovar` (que chama `darEntradaEstoque` DIRETO — ramo APROVADO). E por
   * ele que a `quantidade_recebida` da linha se move em producao, pelo acumulador da T3.
   * Escolhido em vez do workflow inteiro ate `processar` porque o que ESTE arquivo mede e a
   * leitura derivada: o roteiro longo (conferir/fiscal/processar) ja e afirmado em
   * `recebimentoExcedentePedido` (12) e em `pedidoSaldoRecebido` (4), e os DOIS caminhos passam
   * pelo MESMO acumulador (a T3 mediu os dois).
   */
  async function receberEAprovar(pedidoId, itens, { autorizar } = {}) {
    const corpo = { pedido_compra_id: pedidoId, itens };
    if (autorizar) corpo.autorizar_excedente = true;
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send(corpo);
    assert.strictEqual(criado.status, 201, `POST /recebimentos: ${JSON.stringify(criado.body)}`);
    const aprovado = await request(app)
      .post(`/api/almoxarifado/recebimentos/${criado.body.id}/aprovar`).send({});
    assert.strictEqual(aprovado.status, 200, `aprovar: ${JSON.stringify(aprovado.body)}`);
    return criado.body.id;
  }

  // ── (1) RN-24: o pedido PARCIAL, campo por campo ────────────────────────────────────────────
  await test('(1) pedido de 10 com 6 recebidos: pedida 10, recebida 6, saldo 4, PARCIAL', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10, recebida: 6 }],
      { tag: 'C1' });

    const res = await listar('?search=E37T4-C1');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const linha = res.body.find((p) => p.id === pedido.id);
    assert.ok(linha, `o pedido ${pedido.numero} tem de estar na resposta`);
    assert.strictEqual(linha.quantidade_pedida, 10);
    assert.strictEqual(linha.quantidade_recebida, 6);
    assert.strictEqual(linha.saldo_pendente, 4);
    assert.strictEqual(linha.situacao_recebimento, 'PARCIAL',
      'sem esta palavra a tela nao tem como distinguir "falta receber" de "nada chegou"');
  });

  // ── (2) RN-24: os dois extremos, e a IGUALDADE exata ────────────────────────────────────────
  await test('(2) recebida === pedida -> RECEBIDO e saldo 0; recebida 0 -> ABERTO', async () => {
    const mat = await novoMaterial();
    const quitado = await novoPedido([{ material_id: mat.id, quantidade: 10, recebida: 10 }],
      { tag: 'C2' });
    const virgem = await novoPedido([{ material_id: mat.id, quantidade: 10 }], { tag: 'C2' });

    const res = await listar('?search=E37T4-C2');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const q = res.body.find((p) => p.id === quitado.id);
    assert.ok(q, 'o pedido quitado continua APARECENDO na rota (quem some e so com ?pendentes=1)');
    assert.strictEqual(q.situacao_recebimento, 'RECEBIDO',
      'a igualdade EXATA e RECEBIDO: com `>` no lugar de `>=` um pedido completo ficaria PARCIAL '
      + 'para sempre e a tela pediria para receber o que ja chegou');
    assert.strictEqual(q.saldo_pendente, 0);
    assert.strictEqual(q.quantidade_recebida, 10);

    const v = res.body.find((p) => p.id === virgem.id);
    assert.ok(v, `o pedido ${virgem.numero} tem de estar na resposta`);
    assert.strictEqual(v.situacao_recebimento, 'ABERTO');
    assert.strictEqual(v.saldo_pendente, 10);
    assert.strictEqual(v.quantidade_recebida, 0,
      'a coluna nasce DEFAULT 0 (T1); `null` aqui faria a aritmetica do saldo virar NaN');
  });

  // ── (3) RN-24: ?pendentes=1, com a metade POSITIVA no mesmo test() ──────────────────────────
  await test('(3) ?pendentes=1 tira o quitado, mantem o parcial E o pedido SEM ITENS (ABERTO)', async () => {
    const mat = await novoMaterial();
    const quitado = await novoPedido([{ material_id: mat.id, quantidade: 8, recebida: 8 }],
      { tag: 'C3' });
    const parcial = await novoPedido([{ material_id: mat.id, quantidade: 8, recebida: 3 }],
      { tag: 'C3' });
    // O pedido cujas linhas o Compras AINDA NAO LANCOU: `COUNT(itens_pedido_compra) = 0`. Ele tem
    // `saldo_pendente` 0 e teria DESAPARECIDO se o filtro fosse `saldo_pendente > 0` — e e
    // justamente o pedido que a RN-24 manda mostrar, porque o operador precisa ve-lo para cobrar o
    // Compras. A literal do `POST` para ele ja e propria (RN-25, T2).
    const semItens = await novoPedido([], { tag: 'C3' });
    const contagem = await dbGet(db,
      'SELECT COUNT(*) AS n FROM itens_pedido_compra WHERE pedido_id = ?', [semItens.id]);
    assert.strictEqual(contagem.n, 0, 'o cenario exige COUNT = 0, senao mede outra coisa');

    const filtrado = await listar('?pendentes=1&search=E37T4-C3');
    assert.strictEqual(filtrado.status, 200, JSON.stringify(filtrado.body));
    const numeros = filtrado.body.map((p) => p.numero);
    assert.ok(!numeros.includes(quitado.numero),
      `o pedido quitado ${quitado.numero} NAO pode aparecer em ?pendentes=1`);
    assert.ok(numeros.includes(parcial.numero),
      `o pedido PARCIAL ${parcial.numero} tem de aparecer: ainda falta receber`);
    assert.ok(numeros.includes(semItens.numero),
      `o pedido SEM ITENS ${semItens.numero} tem de aparecer: filtrar por saldo_pendente > 0 o `
      + 'faria desaparecer da tela, e ele e o pedido que o operador precisa cobrar do Compras');
    const aberto = filtrado.body.find((p) => p.id === semItens.id);
    assert.strictEqual(aberto.situacao_recebimento, 'ABERTO');
    assert.strictEqual(aberto.quantidade_pedida, 0);
    assert.strictEqual(aberto.saldo_pendente, 0);

    // Metade POSITIVA: SEM o filtro os TRES aparecem — senao "nao traz o quitado" passaria com a
    // rota devolvendo lista vazia.
    const todos = await listar('?search=E37T4-C3');
    assert.strictEqual(todos.status, 200, JSON.stringify(todos.body));
    const todosNumeros = todos.body.map((p) => p.numero);
    for (const p of [quitado, parcial, semItens]) {
      assert.ok(todosNumeros.includes(p.numero), `sem o filtro, ${p.numero} tem de aparecer`);
    }

    // ⚠️ ACHADO da sabotagem 2, e esta asserção existe por causa dele: a clausula de `?pendentes=1`
    // e uma SEGUNDA expressao da mesma regra, escrita em SQL (a negacao da derivacao), e as duas
    // podem DIVERGIR sem nada cair. Medido: trocando `>=` por `>` na derivacao em JS, o pedido
    // 8/8 virava `PARCIAL` e continuava FORA de `?pendentes=1` — a tela diria "falta receber" num
    // pedido que o filtro de pendencias esconde. Amarrar as duas na IGUALDADE EXATA (o caso de
    // fronteira entre elas) e o que prende a equivalencia.
    assert.strictEqual(todos.body.find((p) => p.id === quitado.id).situacao_recebimento,
      'RECEBIDO',
      'o pedido que ?pendentes=1 esconde tem de ser o MESMO que a derivacao chama de RECEBIDO: '
      + 'divergir aqui faria a tela dizer PARCIAL num pedido invisivel no filtro');
    assert.strictEqual(todos.body.find((p) => p.id === parcial.id).situacao_recebimento,
      'PARCIAL',
      'e o que ela mantem tem de ser o que a derivacao chama de PARCIAL');
  });

  // ── (4) a rota NOVA de itens do pedido ──────────────────────────────────────────────────────
  await test('(4) GET .../:id/itens: id da LINHA + saldo; sem material nao sai; quitado 200 []; 404', async () => {
    const mat = await novoMaterial();
    const outro = await novoMaterial();
    const pedido = await novoPedido([
      { material_id: mat.id, quantidade: 10, recebida: 6, codigo: 'LINHA-A', unidade: 'PC',
        valor_unitario: 25 },
      { material_id: outro.id, quantidade: 5, recebida: 5, codigo: 'LINHA-B' },
      // Linha SEM material_id: o Compras lancou texto livre. Sem material nao ha o que dar entrada
      // no estoque — o mesmo filtro de `carregarItensPedidoCompra`, que o resto do modulo usa.
      { material_id: null, quantidade: 7, codigo: 'LINHA-C' },
    ], { tag: 'C4' });

    const res = await itensDoPedido(pedido.id);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.length, 1,
      'so a linha COM material e COM saldo sai: a quitada (5/5) e a sem material_id ficam fora — '
      + `veio ${JSON.stringify(res.body.map((i) => i.codigo))}`);
    const [item] = res.body;
    assert.strictEqual(item.id, pedido.linhas[0],
      '`id` e o id da LINHA do pedido — e o `pedido_item_id` que o client devolve no POST');
    assert.strictEqual(item.material_id, mat.id);
    assert.strictEqual(item.quantidade, 10);
    assert.strictEqual(item.quantidade_recebida, 6);
    assert.strictEqual(item.saldo_pendente, 4);
    assert.strictEqual(item.codigo, 'LINHA-A');
    assert.strictEqual(item.unidade, 'PC');
    assert.strictEqual(item.valor_unitario, 25);
    assert.strictEqual(item.material_codigo, mat.codigo, 'a tela mostra o codigo do MATERIAL');
    assert.ok(item.material_nome, 'a tela mostra o nome do material');

    // Pedido quitado: 200 com [] — nao e erro, e a informacao de que nao ha o que receber.
    const quitado = await novoPedido([{ material_id: mat.id, quantidade: 4, recebida: 4 }],
      { tag: 'C4' });
    const vazio = await itensDoPedido(quitado.id);
    assert.strictEqual(vazio.status, 200,
      `pedido quitado nao e 404: ${JSON.stringify(vazio.body)}`);
    assert.deepStrictEqual(vazio.body, []);

    // Pedido inexistente: a MESMA literal do POST.
    const naoExiste = await itensDoPedido(987654);
    assert.strictEqual(naoExiste.status, 404, JSON.stringify(naoExiste.body));
    assert.strictEqual(naoExiste.body.error, 'Pedido de compra não encontrado');
  });

  // ── (5) O CONTRATO CORE: nada desta etapa escreve em `pedidos_compra` ───────────────────────
  await test('(5) recebimento inteiro processado: pedidos_compra.status continua EXATAMENTE o inserido', async () => {
    const mat = await novoMaterial();
    // `aprovado` e palavra do vocabulario MINUSCULO da tela de Compras. Se alguem gravar
    // `'RECEBIDO'` aqui, o badge de `Compras.js` cai no default cinza com a palavra crua.
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10 }],
      { tag: 'C5', status: 'aprovado' });

    await receberEAprovar(pedido.id,
      [{ material_id: mat.id, quantidade: 10, quantidade_recebida: 10 }]);

    // Metade POSITIVA: a entrada fisica ACONTECEU (senao "o status nao mudou" seria verdade por
    // vacuidade — nada teria rodado).
    const linha = await linhaDoPedido(pedido.linhas[0]);
    assert.strictEqual(linha.quantidade_recebida, 10,
      'o acumulador da T3 tem de ter somado: sem isso este cenario nao mede nada');

    const core = await statusCore(pedido.id);
    assert.strictEqual(core.status, 'aprovado',
      'a situacao do pedido e DERIVADA na leitura; escrever na tabela core pintaria a tela de '
      + 'Compras de cinza com a palavra crua e nao casaria com nenhum ?status=');

    const res = await listar('?search=E37T4-C5');
    const doPedido = res.body.find((p) => p.id === pedido.id);
    assert.strictEqual(doPedido.status, 'aprovado', 'a rota ecoa o status CORE, sem reescreve-lo');
    assert.strictEqual(doPedido.situacao_recebimento, 'RECEBIDO',
      'a situacao do RECEBIMENTO e um campo NOVO, ao lado do status core — nao no lugar dele');
  });

  // ── (7) (Fase 2) SALDO NUNCA NEGATIVO — o caso que esta etapa CRIA ──────────────────────────
  /**
   * A T2 permite excedente autorizado e a T3 soma o que ENTROU: uma linha pode terminar com
   * `quantidade_recebida > quantidade` (12 de 10). Sem `Math.max(0, ...)` a rota devolveria
   * `saldo_pendente: -2`, a tela escreveria `Saldo pendente: -2` e a asserção da RN-24
   * (`saldo_pendente: 0` no pedido completado) ficaria FALSA exatamente no caso novo.
   */
  await test('(7) pedido de 10 que recebeu 12 (excedente autorizado): saldo 0, RECEBIDO, e sem linha na rota de itens', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10 }], { tag: 'C7' });

    setUser(COMPRAS);
    await receberEAprovar(pedido.id,
      [{ material_id: mat.id, quantidade: 12, quantidade_recebida: 12 }], { autorizar: true });
    setUser(ADMIN);

    const linha = await linhaDoPedido(pedido.linhas[0]);
    assert.strictEqual(linha.quantidade_recebida, 12,
      'o cenario exige a linha em 12 de 10 — sem ela o clamp nao e exercitado');

    const res = await listar('?search=E37T4-C7');
    const doPedido = res.body.find((p) => p.id === pedido.id);
    assert.ok(doPedido, `o pedido ${pedido.numero} tem de estar na resposta`);
    assert.strictEqual(doPedido.saldo_pendente, 0,
      'sem o clamp a rota devolveria -2 e a tela escreveria "Saldo pendente: -2"');
    assert.strictEqual(doPedido.situacao_recebimento, 'RECEBIDO');

    const itens = await itensDoPedido(pedido.id);
    assert.strictEqual(itens.status, 200, JSON.stringify(itens.body));
    assert.deepStrictEqual(itens.body, [],
      'a linha excedida nao tem o que receber: o filtro da rota e saldo_pendente > 0, e com o '
      + 'saldo em -2 ela voltaria a ser oferecida ao operador');

    // Metade POSITIVA do filtro de pendentes para o caso excedido: ele tambem sai de ?pendentes=1.
    const pendentes = await listar('?pendentes=1&search=E37T4-C7');
    assert.ok(!pendentes.body.some((p) => p.id === pedido.id),
      'recebida > pedida e RECEBIDO: o pedido excedido nao e pendencia');
  });

  // ── (8) (fix 1) A LEITURA TEM DE MOSTRAR O NUMERO QUE A ESCRITA COMPARA ─────────────────────
  /**
   * Achado da revisao da T4 (Important): o `saldo_pendente` por LINHA pode PROMETER mais do que a
   * porta aceita, porque a regua do `POST` (`assertSaldoDoPedidoPermitido`) e AGREGADA POR
   * MATERIAL e soma o saldo das linhas SEM CLAMP:
   *   linha A (material M, pedida 10, recebida 15 por excedente autorizado) -> saldo -5
   *   linha B (material M, pedida 10, recebida  0)                          -> saldo  10
   *   saldoMaterial = -5 + 10 = 5
   * A rota mostrava B com `saldo_pendente: 10`, o operador digitava 10 e tomava 400 sem nenhum
   * aviso antes. A decisao e expor TAMBEM `saldo_pendente_material` — o MESMO agregado da regua —,
   * repetido em toda linha daquele material. A barreira NAO muda: quem decide continua sendo o
   * backend, e o client passa a poder avisar antes (a T5 tem de limitar por este campo).
   *
   * A linha A NAO aparece na resposta, e isso e de proposito: o filtro da rota continua sendo
   * `saldo_pendente > 0` e ela nao tem nada pendente DE SI (recebeu 5 a mais). Reabri-la
   * contradiria o clamp (cenario (7)) e o contrato "pedido quitado -> 200 com []" — o que o
   * operador precisa saber sobre ela e o efeito dela no agregado, e esse efeito chega pelo
   * `saldo_pendente_material` da linha B.
   */
  await test('(8) duas linhas do MESMO material (A 10/15, B 10/0): B traz saldo 10 e saldo_material 5, e a porta recusa 10', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([
      { material_id: mat.id, quantidade: 10, recebida: 15, codigo: 'LINHA-EXC' },
      { material_id: mat.id, quantidade: 10, recebida: 0, codigo: 'LINHA-LIVRE' },
    ], { tag: 'C8' });

    const res = await itensDoPedido(pedido.id);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.length, 1,
      'a linha excedida (10/15) nao tem saldo PROPRIO e continua fora; o efeito dela no agregado '
      + `chega pelo saldo_pendente_material da outra — veio ${
        JSON.stringify(res.body.map((i) => i.codigo))}`);
    const [b] = res.body;
    assert.strictEqual(b.id, pedido.linhas[1]);
    assert.strictEqual(b.saldo_pendente, 10, 'o saldo DA LINHA continua sendo 10, e e verdade');
    assert.strictEqual(b.saldo_pendente_material, 5,
      'o agregado POR MATERIAL e (10-15) + (10-0) = 5, sem clamp por linha: e EXATAMENTE o numero '
      + 'que `assertSaldoDoPedidoPermitido` compara, e a leitura tem de mostrar o mesmo');

    // A prova de que o numero e o MESMO da escrita, e nao um segundo calculo parecido: 10 (o
    // saldo da linha) e recusado, 5 (o agregado) passa.
    const acima = await request(app).post('/api/almoxarifado/recebimentos').send({
      pedido_compra_id: pedido.id,
      itens: [{ material_id: mat.id, pedido_item_id: b.id, quantidade: 10, quantidade_recebida: 10 }],
    });
    assert.strictEqual(acima.status, 400, JSON.stringify(acima.body));
    assert.strictEqual(acima.body.error, `Quantidade recebida (10) maior que o saldo do pedido (5) `
      + `para o material ${mat.codigo} — a autorização de excedente é de Compras ou do Administrador`,
    'a porta fala em 5: prometer 10 na tela e mandar o operador digitar para tomar 400');

    const noAgregado = await request(app).post('/api/almoxarifado/recebimentos').send({
      pedido_compra_id: pedido.id,
      itens: [{ material_id: mat.id, pedido_item_id: b.id, quantidade: 5, quantidade_recebida: 5 }],
    });
    assert.strictEqual(noAgregado.status, 201,
      `o agregado exato tem de PASSAR: ${JSON.stringify(noAgregado.body)}`);

    // Metade POSITIVA: no caso comum (uma linha por material) os dois campos sao iguais — o campo
    // novo nao e um segundo numero para a tela escolher, e so DIVERGE quando o pedido tem duas
    // linhas do mesmo material.
    const simples = await novoPedido([{ material_id: mat.id, quantidade: 8, recebida: 3 }],
      { tag: 'C8' });
    const umaLinha = await itensDoPedido(simples.id);
    assert.strictEqual(umaLinha.status, 200, JSON.stringify(umaLinha.body));
    assert.strictEqual(umaLinha.body.length, 1);
    assert.strictEqual(umaLinha.body[0].saldo_pendente, 5);
    assert.strictEqual(umaLinha.body[0].saldo_pendente_material, 5,
      'com uma linha por material os dois campos coincidem — divergir aqui seria o agregado '
      + 'contando linha de outro pedido');
  });

  // ── (6) (Fase 2) O FILTRO ANTES DO LIMIT ────────────────────────────────────────────────────
  /**
   * Ultimo de proposito: cria 50 pedidos e mexe na ordem global da rota, entao qualquer cenario
   * depois dele dependeria de `?search`. O que ele prende e a POSICAO do filtro em relacao ao
   * `LIMIT 50` — nenhuma asserção de CONTEUDO pega isso.
   */
  await test('(6) 50 quitados NOVOS + 1 aberto ANTIGO: ?pendentes=1 traz o aberto (filtro no SQL, nao em .filter())', async () => {
    const mat = await novoMaterial();
    // O ABERTO e o mais ANTIGO de todos: em `ORDER BY created_at DESC LIMIT 50` ele e o primeiro a
    // ser cortado.
    const aberto = await novoPedido([{ material_id: mat.id, quantidade: 3 }],
      { tag: 'C6', created_at: '2020-01-01 00:00:00' });
    // 50 quitados com `created_at` no FUTURO: sao, com certeza, os 50 mais novos do banco.
    for (let i = 0; i < 50; i += 1) {
      await novoPedido([{ material_id: mat.id, quantidade: 5, recebida: 5 }],
        { tag: 'C6Q', created_at: `2099-01-01 00:${String(i).padStart(2, '0')}:00` });
    }

    const filtrado = await listar('?pendentes=1');
    assert.strictEqual(filtrado.status, 200, JSON.stringify(filtrado.body));
    assert.ok(filtrado.body.length < 50,
      'a fixture exige menos de 50 pendentes no banco, senao o proprio LIMIT poderia cortar o '
      + `aberto e o cenario mediria outra coisa (veio ${filtrado.body.length})`);
    assert.ok(filtrado.body.some((p) => p.id === aberto.id),
      'com o filtro em .filter() DEPOIS da query, o LIMIT 50 come os 50 quitados e a resposta vem '
      + `vazia de pendencias — a tela ficaria sem o unico pedido recebivel (veio ${
        JSON.stringify(filtrado.body.map((p) => p.numero))})`);

    // Metade POSITIVA: SEM o filtro o `LIMIT 50` CONTINUA valendo (a rota nao passou a devolver o
    // banco inteiro) e o aberto NAO esta nas 50 linhas — que e a razao de o filtro ter de estar no
    // `WHERE`.
    const todos = await listar();
    assert.strictEqual(todos.body.length, 50, 'o LIMIT 50 continua valendo');
    assert.ok(!todos.body.some((p) => p.id === aberto.id),
      'sem o filtro, o pedido aberto mais antigo fica FORA das 50 linhas — e por isso que filtrar '
      + 'depois da query nao pode funcionar');
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
