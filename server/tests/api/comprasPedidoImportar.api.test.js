/**
 * RN-C09, RN-C10 e RN-C11 (Etapa 38, Task 4) — a BUSCA DE MATERIAL do modulo core Compras e a
 * IMPORTACAO DE PEDIDOS POR PLANILHA.
 *
 * ── OS DOIS FUROS QUE ESTE ARQUIVO EXISTE PARA PAGAR ──────────────────────────────────────────
 *
 * 1. **O comprador nao alcanca a busca de material do almoxarifado.**
 *    `app.use('/api/almoxarifado', authenticateToken, checkModulePermission('almoxarifado'))`
 *    (`routes/almoxarifado.js:282-285`) barra TODO o prefixo **antes** de qualquer handler: um
 *    usuario com o modulo `compras` e sem o modulo `almoxarifado` toma 403 em
 *    `GET /api/almoxarifado/materiais` sem nunca chegar na rota (`:353`). Sem uma porta de busca no
 *    proprio core, o formulario de pedido (Task 5) nao tem como escolher material — e alargar a
 *    permissao do modulo almoxarifado para o comprador daria a ele o modulo INTEIRO (estoque,
 *    movimentacao, requisicao). Dai `GET /api/compras/materiais`: **somente leitura**, quatro
 *    colunas, gate do modulo `compras`.
 *
 * 2. **O acervo de pedidos e 0/0 e ninguem vai digitar o historico.** Producao tem
 *    `COUNT(pedidos_compra) = 0`, 10 fornecedores e 3 materiais cadastrados. A Task 2 deu a porta
 *    de criacao **de um** pedido por vez; carregar o que ja existe em planilha exige uma porta que
 *    receba a planilha inteira. `POST /api/compras/pedidos/importar` faz isso passando **cada
 *    grupo pelo MESMO `criarPedido` da Task 2** — nunca por `INSERT` direto. Duas regras de
 *    criacao de pedido divergiriam na primeira edicao, e a importada seria a que ninguem olha.
 *
 * ── ⚠️ A IMPORTACAO E JSON, NAO `.xlsx`: e o precedente MEDIDO desta base ─────────────────────
 * Quem le o arquivo e o **navegador** (`XLSX.read` em `client/src/components/ItensFornecedor.js`,
 * que monta `{ linhas }` e faz o POST) e o servidor recebe **JSON de objetos**, com o cabecalho da
 * planilha em qualquer grafia. E o que a rota de itens do fornecedor
 * (`POST /api/compras/fornecedores/:fornecedorId/itens/importar`, o antigo `index.js:20447`) ja
 * faz desde antes desta etapa — inclusive a literal do 400, que esta copiada VERBATIM dela. Nao
 * ha multer nem parse de planilha no servidor, e isso e decisao de forma, nao omissao.
 *
 * ── ⚠️ A QUANTIDADE NAO PODE SER LIDA PELOS HELPERS DE PRECO (cenario 6) ──────────────────────
 * `extrairDoRow` devolve **sempre String** e `parsePrecoBackend` **apaga todos os pontos** antes do
 * `parseFloat` (regra pt-BR: `'1.234,50'` → `1234.50`). Reusar os dois para quantidade faria
 * `1.5` virar **15** em `itens_pedido_compra.quantidade` — que e o total que a Etapa 37 le como
 * `quantidade_pedida`: o recebimento passaria a oferecer dez vezes o que foi comprado, e o saldo
 * do pedido nunca fecharia. Por isso o leitor de numero desta porta e **cru primeiro**
 * (`numeroDaPlanilha`): numero passa direto, string **com virgula** cai no parse pt-BR, string com
 * ponto e `parseFloat` normal. O cenario (6) mede as tres formas, e a terceira (`'1.5'` → 1.5,
 * **nunca 15**) e exatamente o que o helper de preco faria de errado.
 *
 * ── ⚠️ O QUE ESTE ARQUIVO **NAO** PROVA, e esta declarado em vez de forjado ───────────────────
 * O cenario (5) bate em `GET /api/almoxarifado/materiais` e recebe **200** — porque o harness
 * **stuba** a camada 2 (`fakeCheckModulePermission = () => (req,res,next) => next()`). **Este
 * arquivo NAO prova o 403 de producao**, e nenhum arquivo desta suite prova: a prova do gate e a
 * LEITURA de `server/routes/almoxarifado.js:282-285`, onde `app.use` monta
 * `checkModulePermission('almoxarifado')` sobre o prefixo inteiro. A suite NAO protege esse gate —
 * quem o remover de lá nao derruba asserção nenhuma aqui.
 *
 * ⚠️ GATE: o modulo core Compras tem **UMA** camada de autorizacao (`authenticateToken` +
 * `checkModulePermission('compras')`, medido nas 26 rotas). O unico gate exercitavel no harness e o
 * **401 sem usuario**. E o ponto do cenario (5): um usuario **sem nenhum perfil de almoxarifado**
 * (o `COMPRADOR` abaixo) tem 200 em `GET /api/compras/materiais` — a porta e do modulo dele.
 *
 * ⚠️ SEM IDEMPOTENCIA, por decisao (contrato 5 do plano, decisao 8 do design): `numero` e GERADO e
 * o agrupador e da planilha, entao **reimportar a mesma planilha cria pedidos novos**. O cenario
 * (7) AFIRMA a duplicacao — para que a documentacao que diz isso seja verdadeira, e para que quem
 * "consertar" com um `WHERE numero = ?` derrube um teste em vez de descobrir em producao.
 *
 * Executar: cd server && node tests/api/comprasPedidoImportar.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// (iii) das regras herdadas: nenhum id de fixture escrito a mao — todos lidos do `INSERT` ou da
// resposta da rota. Usuarios na numeracao de `comprasPedidoCriar`/`comprasPedidoEditarExcluir`
// (64/65/66); o `COMPRADOR` aqui e o 65, e ele NAO tem perfil de almoxarifado nenhum de proposito.
const ADMIN = { id: 64, nome: 'Admin Compras E38 T4', role: 'admin' };
const COMPRADOR = { id: 65, nome: 'Comprador E38 T4', role: 'user' };

// As literais do contrato 5 do plano, VERBATIM e em constante — um `grep` por qualquer uma acha o
// dono no codigo e a regua no mesmo resultado.
const CORPO_INVALIDO = 'Envie "linhas" ou "rows" com array de objetos (qualquer formato de planilha)';
const MOTIVO_QTD = 'quantidade inválida';
const MOTIVO_SEM_CODIGO = 'linha sem código de material';
const MOTIVO_FORNECEDOR = 'fornecedor não encontrado';
const motivoMaterial = (codigo) => `material não encontrado pelo código ${codigo}`;
// Onda de correcao, F3: `avisos` e o terceiro array da resposta — a linha ENTROU, o campo nao foi
// entendido. Literal verbatim de `AVISO_PREVISAO_NAO_RECONHECIDA` do servico.
const AVISO_PREVISAO = 'previsão de entrega não reconhecida (use AAAA-MM-DD ou DD/MM/AAAA)';
// Onda de correcao, F7: o aviso da coluna de data do pedido.
const AVISO_DATA_PEDIDO = 'data do pedido não reconhecida (use AAAA-MM-DD ou DD/MM/AAAA)';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // ---- Fixtures -------------------------------------------------------------------------------
  // O fornecedor e de verdade porque a importacao o RESOLVE pela planilha (por `fornecedor_id` ou
  // pelo CNPJ/razao social), e `criarPedido` tem guarda de banco para ele (`assertFornecedor`).
  const forn = await dbRun(db, `INSERT INTO fornecedores (razao_social, nome_fantasia, cnpj, status)
    VALUES ('Fornecedor Importacao E38','Importadora E38','55666777000188','ativo')`);
  const fornecedorId = forn.lastID;
  // A planilha traz o CNPJ COM mascara — a resolucao compara somente digitos dos dois lados.
  const cnpjPlanilha = '55.666.777/0001-88';

  // ONDA DE CORRECAO, F1 (achado C1 da revisao final): o SEGUNDO fornecedor existe para que a
  // MISTURA de fornecedores na mesma ordem possa ser medida. Sem ele o arquivo nao tinha como
  // escrever o cenario (8) — e era exatamente por isso que o defeito estava sem regua: o helper
  // `linha()` injeta SEMPRE o mesmo `cnpj`, entao nenhuma fixture tinha dois fornecedores.
  const forn2 = await dbRun(db, `INSERT INTO fornecedores (razao_social, nome_fantasia, cnpj, status)
    VALUES ('Fornecedor Divergente E38','Divergente E38','99111222000133','ativo')`);
  const fornecedorId2 = forn2.lastID;
  const cnpjPlanilha2 = '99.111.222/0001-33';

  // `descricao` fica NULL de proposito em A: `materiais_almoxarifado` tem `nome` NOT NULL e
  // `descricao` quase sempre vazia, e por isso as duas portas desta task leem
  // `COALESCE(nome, descricao)`. Selecionar `descricao` crua devolveria opcao em branco no
  // `<select>` do formulario (contrato 6) e linha de pedido sem descricao no recebimento.
  const matA = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('MAT-IMP-A','Chapa de aco importada','PC',0,1)`);
  const materialIdA = matA.lastID;
  const matB = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('MAT-IMP-B','Rebite importado','CX',0,1)`);
  const materialIdB = matB.lastID;
  // Inativo: a busca NAO o oferece e a importacao NAO o resolve (cenarios 1 e 3).
  await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('MAT-IMP-OFF','Material desativado E38','UN',0,0)`);
  // 52 materiais so para medir o `LIMIT 50` da busca (contrato 6). Sem eles o LIMIT nao tem regua
  // e "devolve tudo" passaria — e a tela de pedido carregaria o cadastro inteiro num `<select>`.
  for (let i = 1; i <= 52; i++) {
    await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
      VALUES (?,?,'UN',0,1)`, [`LIM-${String(i).padStart(3, '0')}`, `Material de limite ${i}`]);
  }

  const importar = (corpo) => request(app).post('/api/compras/pedidos/importar').send(corpo);
  const buscar = (qs) => request(app).get(`/api/compras/materiais${qs}`);
  const linhasDoPedido = (pedidoId) => dbAll(db, `SELECT material_id, codigo, descricao, quantidade,
      valor_unitario, unidade, quantidade_recebida FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id`,
  [pedidoId]);
  const cabecalho = (pedidoId) => dbGet(db, 'SELECT * FROM pedidos_compra WHERE id = ?', [pedidoId]);
  /**
   * ⚠️ ESCOPADA POR `pedido_id`, e a correcao e do F4 (achado I3 da revisao final): sem o escopo
   * esta contagem era GLOBAL — `COUNT(*) … WHERE material_id IS NULL` passa numa tabela VAZIA e
   * nao distingue "o importador pulou a linha certa" de "o importador nao inseriu nada em lugar
   * nenhum". Por pedido, ela so pode passar se AQUELE pedido existir com as linhas dele.
   */
  const contarLinhasOrfas = async (pedidoId) => (await dbGet(db,
    'SELECT COUNT(*) as n FROM itens_pedido_compra WHERE material_id IS NULL AND pedido_id = ?',
    [pedidoId])).n;
  const contarPedidos = async () => (await dbGet(db, 'SELECT COUNT(*) as n FROM pedidos_compra')).n;

  const linha = (pedido, codigo, extra = {}) => ({
    pedido, cnpj: cnpjPlanilha, 'código': codigo, ...extra,
  });

  // (1) ------------------------------------------------------------------------------------
  await test('(1) GET /api/compras/materiais: casa por codigo e por nome, esconde inativo e respeita o LIMIT 50', async () => {
    const r = await buscar('?search=MAT-IMP-A');
    assert.strictEqual(r.status, 200, `esperava 200, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.length, 1, `esperava 1 material, veio ${r.body.length}`);
    assert.strictEqual(r.body[0].id, materialIdA, 'id divergente');
    assert.strictEqual(r.body[0].codigo, 'MAT-IMP-A', 'codigo nao voltou');
    // A ASSERCAO QUE MEDE O DANO do contrato 6: `descricao` do material esta NULL, entao um
    // `SELECT descricao` cru devolveria `null` aqui e o `<select>` do formulario sairia em branco.
    assert.strictEqual(r.body[0].descricao, 'Chapa de aco importada',
      'descricao tem de ser COALESCE(nome, descricao) — nome e a coluna NOT NULL');
    assert.strictEqual(r.body[0].unidade, 'PC', 'unidade nao voltou');

    // casa por NOME tambem (o comprador digita "rebite", nao o codigo)
    const porNome = await buscar('?search=Rebite');
    assert.strictEqual(porNome.status, 200, 'busca por nome');
    assert.strictEqual(porNome.body.length, 1, `esperava 1 por nome, veio ${porNome.body.length}`);
    assert.strictEqual(porNome.body[0].id, materialIdB, 'a busca por nome achou outro material');

    // METADE NEGATIVA: sem correspondencia devolve vazio (nao devolve tudo, nao devolve 404)
    const vazio = await buscar('?search=zzz');
    assert.strictEqual(vazio.status, 200, `?search=zzz tem de ser 200, veio ${vazio.status}`);
    assert.deepStrictEqual(vazio.body, [], `esperava [], veio ${JSON.stringify(vazio.body)}`);

    // material com `ativo = 0` NAO aparece — nem pelo codigo exato dele
    const inativo = await buscar('?search=MAT-IMP-OFF');
    assert.deepStrictEqual(inativo.body, [], `material inativo apareceu: ${JSON.stringify(inativo.body)}`);

    // LIMIT 50: 52 materiais casam o prefixo e a porta devolve 50
    const limitado = await buscar('?search=LIM-');
    assert.strictEqual(limitado.body.length, 50, `LIMIT 50: esperava 50, veio ${limitado.body.length}`);
    // e sem `search` tambem (54 ativos cadastrados)
    const semBusca = await buscar('');
    assert.strictEqual(semBusca.body.length, 50, `sem search: esperava 50, veio ${semBusca.body.length}`);
  });

  // (2) ------------------------------------------------------------------------------------
  await test('(2) POST importar: 5 linhas / 2 ordens viram 2 pedidos pelo SERVICO (numero gerado, valor_total derivado)', async () => {
    const corpo = {
      linhas: [
        linha('OC-A', 'MAT-IMP-A', { qtd: 3, 'preço unitario': 10, entrega: '2026-10-01' }),
        linha('OC-A', 'MAT-IMP-B', { qtd: 2, 'preço unitario': 5.5 }),
        linha('OC-A', 'MAT-IMP-A', { qtd: 1, 'preço unitario': 10 }),
        linha('OC-B', 'MAT-IMP-B', { qtd: 4, 'preço unitario': 5.5 }),
        linha('OC-B', 'MAT-IMP-A', { qtd: 6, 'preço unitario': 10 }),
      ],
    };
    const r = await importar(corpo);
    assert.strictEqual(r.status, 201, `esperava 201, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual((r.body.pedidos || []).length, 2,
      `esperava 2 pedidos (agrupados pela COLUNA da planilha), veio ${JSON.stringify(r.body.pedidos)}`);
    assert.strictEqual(r.body.pedidos[0].itens, 3, `OC-A tem 3 linhas, veio ${r.body.pedidos[0].itens}`);
    assert.strictEqual(r.body.pedidos[1].itens, 2, `OC-B tem 2 linhas, veio ${r.body.pedidos[1].itens}`);
    assert.strictEqual(r.body.itens, 5, `total de itens importados: esperava 5, veio ${r.body.itens}`);
    assert.deepStrictEqual(r.body.ignorados, [], `nada devia ser ignorado: ${JSON.stringify(r.body.ignorados)}`);

    // O NUMERO VEM DO SERVICO (`inserirComNumeroUnico(db, 'PC', …)`), nao da planilha — e os dois
    // sao DIFERENTES: e a prova de que houve duas insercoes de cabecalho, nao uma reaproveitada.
    const [a, b] = r.body.pedidos;
    assert.ok(/^PC-/.test(a.numero), `numero fora do padrao PC-: ${a.numero}`);
    assert.ok(/^PC-/.test(b.numero), `numero fora do padrao PC-: ${b.numero}`);
    assert.notStrictEqual(a.numero, b.numero, 'os dois pedidos sairam com o MESMO numero');

    const cabA = await cabecalho(a.id);
    // O agrupador da planilha fica registrado no pedido: e a unica pista de qual ordem da planilha
    // virou qual `PC-…`, e o roteiro manual confere por ela.
    assert.ok(String(cabA.observacoes || '').includes('Planilha: OC-A'),
      `observacoes tem de citar o agrupador da planilha, veio ${JSON.stringify(cabA.observacoes)}`);
    assert.strictEqual(cabA.fornecedor_id, fornecedorId,
      'o fornecedor foi resolvido pelo CNPJ COM mascara da planilha');
    assert.strictEqual(cabA.previsao_entrega, '2026-10-01', 'previsao_entrega da planilha nao entrou');
    assert.strictEqual(cabA.status, 'pendente', 'o pedido importado nasce pendente (DEFAULT do DDL)');

    // ⚠️ A ASSERCAO QUE PROVA QUE PASSOU PELO SERVICO: `valor_total` e DERIVADO da soma das linhas.
    // Um `INSERT` direto na rota nao faria essa conta (e nao geraria o `PC-`).
    assert.strictEqual(cabA.valor_total, 51, `3x10 + 2x5,5 + 1x10 = 51, veio ${cabA.valor_total}`);
    const cabB = await cabecalho(b.id);
    assert.strictEqual(cabB.valor_total, 82, `4x5,5 + 6x10 = 82, veio ${cabB.valor_total}`);
    assert.strictEqual(cabB.previsao_entrega, null, 'OC-B nao trouxe entrega na planilha');

    // As LINHAS existem de verdade (o modo de falha desta etapa e o 201 com o pedido vazio) e
    // foram resolvidas pelo `resolverItens` do servico: material_id, codigo, descricao e unidade
    // copiados do cadastro, `quantidade_recebida` nascida 0 pelo DEFAULT da Etapa 37.
    const itensA = await linhasDoPedido(a.id);
    assert.strictEqual(itensA.length, 3, `esperava 3 linhas gravadas em OC-A, veio ${itensA.length}`);
    assert.strictEqual(itensA[0].material_id, materialIdA, 'material_id da primeira linha');
    assert.strictEqual(itensA[0].codigo, 'MAT-IMP-A', 'codigo copiado do material');
    assert.strictEqual(itensA[0].descricao, 'Chapa de aco importada',
      'descricao copiada de materiais_almoxarifado.nome');
    assert.strictEqual(itensA[0].unidade, 'PC', 'unidade copiada do material');
    assert.strictEqual(itensA[0].quantidade, 3, 'quantidade da planilha');
    assert.strictEqual(itensA[0].valor_unitario, 10, 'valor unitario da planilha');
    assert.strictEqual(itensA[0].quantidade_recebida, 0, 'quantidade_recebida nasce 0 pelo DEFAULT');
    assert.strictEqual(itensA[1].material_id, materialIdB, 'segunda linha e o outro material');
    const itensB = await linhasDoPedido(b.id);
    assert.strictEqual(itensB.length, 2, `esperava 2 linhas em OC-B, veio ${itensB.length}`);
    // E nenhuma linha sem material — `listarPedidosCompraAux` filtra `material_id IS NOT NULL` e
    // uma linha nula deixaria o pedido ABERTO com saldo 0 no `<select>` do recebimento. POR PEDIDO
    // (F4): a contagem global passava numa tabela vazia.
    assert.strictEqual(await contarLinhasOrfas(a.id), 0, 'OC-A: nenhuma linha pode ficar sem material_id');
    assert.strictEqual(await contarLinhasOrfas(b.id), 0, 'OC-B: nenhuma linha pode ficar sem material_id');
  });

  // (3) ------------------------------------------------------------------------------------
  await test('(3) codigo inexistente vai para `ignorados` — as outras 4 linhas entram e NENHUMA fica sem material_id', async () => {
    const corpo = {
      linhas: [
        linha('OC-C', 'MAT-IMP-A', { qtd: 2, preco: 10 }),
        linha('OC-C', 'MAT-IMP-B', { qtd: 1, preco: 5 }),
        linha('OC-C', 'XPTO-404', { qtd: 9, preco: 1 }),
        linha('OC-D', 'MAT-IMP-A', { qtd: 3, preco: 10 }),
        linha('OC-D', 'MAT-IMP-B', { qtd: 7, preco: 5 }),
      ],
    };
    const r = await importar(corpo);
    assert.strictEqual(r.status, 201, `esperava 201, veio ${r.status} ${JSON.stringify(r.body)}`);

    // ⚠️ AS DUAS ASSERCOES QUE MEDEM O DANO VEM PRIMEIRO, E A ORDEM FOI CORRIGIDA POR MEDICAO: com
    // o `deepStrictEqual` de `ignorados` na frente, a sabotagem 1 (gravar a linha sem material)
    // derrubava ELE e as duas abaixo nunca rodavam — a asserçao que guarda o achado ficava
    // escondida atras de outra. Agora a linha orfa e a contagem falam primeiro.
    //
    // A alternativa errada e gravar a linha com `material_id NULL`: ela ficaria invisivel ao
    // recebimento (`material_id IS NOT NULL` nas duas leituras da E37) e o pedido apareceria
    // ABERTO com saldo 0 sem ninguem entender por que.
    // Os dois pedidos e os ids vem ANTES agora porque a contagem de orfas passou a ser POR PEDIDO
    // (F4) — e um `pedidos.length` errado e outro defeito, nao este, entao a assercao da linha orfa
    // continua sendo a que fala primeiro sobre o achado.
    assert.strictEqual(r.body.pedidos.length, 2, `esperava 2 pedidos, veio ${r.body.pedidos.length}`);
    const [c, d] = r.body.pedidos;
    assert.strictEqual(await contarLinhasOrfas(c.id), 0,
      'OC-C: linha sem material resolvido NAO pode ser gravada — tem de ir para `ignorados`');
    assert.strictEqual(await contarLinhasOrfas(d.id), 0,
      'OC-D: linha sem material resolvido NAO pode ser gravada — tem de ir para `ignorados`');
    // A soma do que ENTROU: 4 linhas, nao 5 e nao 0 (esta sozinha seria satisfeita por "ignorou
    // tudo"; e por isso que a metade positiva la embaixo conta as linhas de cada pedido).
    assert.strictEqual(r.body.itens, 4, `esperava 4 itens importados, veio ${r.body.itens}`);

    assert.deepStrictEqual(r.body.ignorados, [{ linha: 3, motivo: motivoMaterial('XPTO-404') }],
      `ignorados divergente: ${JSON.stringify(r.body.ignorados)}`);

    // METADE POSITIVA: o pedido incompleto ainda nasce (com as 2 linhas boas) e o outro esta INTEIRO.
    assert.strictEqual(c.itens, 2, `OC-C perdeu 1 das 3 linhas: esperava 2, veio ${c.itens}`);
    assert.strictEqual(d.itens, 2, `OC-D esta completo: esperava 2, veio ${d.itens}`);
    assert.strictEqual((await linhasDoPedido(c.id)).length, 2, 'linhas gravadas de OC-C');
    assert.strictEqual((await cabecalho(c.id)).valor_total, 25, '2x10 + 1x5 = 25 (a linha ignorada nao soma)');
    assert.strictEqual((await cabecalho(d.id)).valor_total, 65, '3x10 + 7x5 = 65');

    // O material INATIVO da o MESMO motivo: a busca nao o oferece, a importacao nao o resolve.
    const inativo = await importar({ linhas: [linha('OC-C2', 'MAT-IMP-OFF', { qtd: 1, preco: 1 })] });
    assert.strictEqual(inativo.status, 201, `esperava 201, veio ${inativo.status}`);
    assert.deepStrictEqual(inativo.body.ignorados, [{ linha: 1, motivo: motivoMaterial('MAT-IMP-OFF') }],
      `material inativo devia ser ignorado: ${JSON.stringify(inativo.body)}`);
    assert.deepStrictEqual(inativo.body.pedidos, [], 'grupo sem nenhuma linha valida nao cria pedido');
    assert.strictEqual(inativo.body.itens, 0, 'nada importado');
  });

  // (4) ------------------------------------------------------------------------------------
  await test('(4) quantidade invalida, linha sem codigo e fornecedor inexistente: cada um com a sua literal; corpo sem linhas -> 400', async () => {
    const corpo = {
      linhas: [
        linha('OC-E', 'MAT-IMP-A', { qtd: 2, preco: 10 }),
        linha('OC-E', 'MAT-IMP-B', { qtd: 0, preco: 10 }),
        linha('OC-E', 'MAT-IMP-B', { qtd: 'abc', preco: 10 }),
        { pedido: 'OC-E', cnpj: cnpjPlanilha, qtd: 5, preco: 10 },
        { pedido: 'OC-F', cnpj: '99.999.999/9999-99', 'código': 'MAT-IMP-A', qtd: 1, preco: 10 },
      ],
    };
    const r = await importar(corpo);
    assert.strictEqual(r.status, 201, `esperava 201, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(r.body.ignorados, [
      { linha: 2, motivo: MOTIVO_QTD },
      { linha: 3, motivo: MOTIVO_QTD },
      { linha: 4, motivo: MOTIVO_SEM_CODIGO },
      { linha: 5, motivo: MOTIVO_FORNECEDOR },
    ], `ignorados divergente: ${JSON.stringify(r.body.ignorados)}`);

    // METADE POSITIVA no mesmo cenario: a unica linha boa criou o pedido dela. Sem isto, "ignorou
    // tudo" satisfaria as quatro asserçoes acima.
    assert.strictEqual(r.body.pedidos.length, 1, `esperava 1 pedido, veio ${r.body.pedidos.length}`);
    assert.strictEqual(r.body.itens, 1, `esperava 1 item importado, veio ${r.body.itens}`);
    // ⚠️ A REGUA QUE FALTAVA (F4, achado I3): as tres asserçoes anteriores leem a RESPOSTA HTTP e a
    // linha de CABECALHO — nenhuma lia `itens_pedido_compra`. E `valor_total` e calculado EM
    // MEMORIA antes de qualquer leitura das linhas (`pedidoCompraService`), entao um importador que
    // gravasse a cabeca e engolisse o INSERT das linhas passaria por elas; o `r.body.itens` so nao
    // passaria por ACIDENTE, porque `relerPedido` reconsulta. Este e o modo de falha numero 1 desta
    // etapa ("o 201 que nao gravou item nenhum"), e ele estava sem regua justamente no unico
    // cenario POSITIVO deste arquivo que sobrava sem ela.
    const linhasDoUnico = await linhasDoPedido(r.body.pedidos[0].id);
    assert.strictEqual(linhasDoUnico.length, 1,
      `o pedido criado tem de ter 1 LINHA gravada, veio ${linhasDoUnico.length}`);
    assert.strictEqual(linhasDoUnico[0].material_id, materialIdA, 'e a linha gravada e a da unica linha boa');
    assert.strictEqual(linhasDoUnico[0].quantidade, 2, 'com a quantidade da planilha');
    assert.strictEqual(await contarLinhasOrfas(r.body.pedidos[0].id), 0, 'e sem linha sem material_id');
    assert.strictEqual((await cabecalho(r.body.pedidos[0].id)).valor_total, 20, '2x10 = 20');

    // O 400 do corpo invalido, com a literal COPIADA VERBATIM do precedente (`index.js:20451`).
    const antes = await contarPedidos();
    for (const [rotulo, body] of [['{}', {}], ['linhas nao-array', { linhas: 'x' }], ['linhas vazio', { linhas: [] }]]) {
      const ruim = await importar(body);
      assert.strictEqual(ruim.status, 400, `${rotulo}: esperava 400, veio ${ruim.status}`);
      assert.strictEqual(ruim.body.error, CORPO_INVALIDO, `${rotulo}: literal do 400 divergente`);
    }
    assert.strictEqual(await contarPedidos(), antes, 'o 400 nao pode ter criado pedido nenhum');
  });

  // (6) ------------------------------------------------------------------------------------
  await test('(6) quantidade fracionaria NAO e multiplicada por 10 — nem 1.5 numero, nem "1,5", nem "1.5"', async () => {
    const corpo = {
      linhas: [
        linha('OC-G', 'MAT-IMP-A', { quantidade: 1.5, valor: 2 }),
        linha('OC-G', 'MAT-IMP-B', { quantidade: '1,5', valor: '10,50' }),
        linha('OC-G', 'MAT-IMP-A', { qtde: '1.5', valor: '10.50' }),
      ],
    };
    const r = await importar(corpo);
    assert.strictEqual(r.status, 201, `esperava 201, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(r.body.ignorados, [], `nada devia ser ignorado: ${JSON.stringify(r.body.ignorados)}`);
    const itens = await linhasDoPedido(r.body.pedidos[0].id);
    assert.strictEqual(itens.length, 3, `esperava 3 linhas, veio ${itens.length}`);
    // ⚠️ AS TRES ASSERCOES QUE MEDEM O DANO. `parsePrecoBackend('1.5')` devolve **15** (apaga o
    // ponto antes do parseFloat) — se o leitor de quantidade fosse o de preco, a terceira linha
    // gravaria 15 e a Etapa 37 ofereceria dez vezes o comprado no recebimento.
    assert.strictEqual(itens[0].quantidade, 1.5, `numero 1.5 -> ${itens[0].quantidade}`);
    assert.strictEqual(itens[1].quantidade, 1.5, `string pt-BR '1,5' -> ${itens[1].quantidade}`);
    assert.strictEqual(itens[2].quantidade, 1.5, `string '1.5' -> ${itens[2].quantidade} (NUNCA 15)`);
    // O preco segue a MESMA regra (cru primeiro), e por isso '10.50' e 10,5 e nao 1050.
    assert.strictEqual(itens[1].valor_unitario, 10.5, `'10,50' -> ${itens[1].valor_unitario}`);
    assert.strictEqual(itens[2].valor_unitario, 10.5, `'10.50' -> ${itens[2].valor_unitario} (NUNCA 1050)`);
    assert.strictEqual((await cabecalho(r.body.pedidos[0].id)).valor_total, 34.5,
      '1,5x2 + 1,5x10,5 + 1,5x10,5 = 34,5');
  });

  // (5) ------------------------------------------------------------------------------------
  await test('(5) o motivo desta porta existir: o comprador SEM almoxarifado tem 200 aqui; e o 401 nas duas portas novas', async () => {
    // O usuario nao tem perfil de almoxarifado nenhum — o core Compras tem UMA camada e a porta e
    // do modulo dele.
    setUser(COMPRADOR);
    assert.strictEqual((await buscar('?search=MAT-IMP-A')).status, 200,
      'GET /api/compras/materiais tem de responder ao usuario de Compras');
    // ⚠️ ESTE 200 NAO PROVA O 403 DE PRODUCAO: o harness stuba `checkModulePermission` (aberto).
    // A prova do gate e a LEITURA de `server/routes/almoxarifado.js:282-285` — `app.use` monta
    // `checkModulePermission('almoxarifado')` sobre o prefixo inteiro, antes de todo handler. A
    // suite NAO protege esse gate: quem o apagar de la nao derruba asserçao nenhuma.
    assert.strictEqual((await request(app).get('/api/almoxarifado/materiais')).status, 200,
      'no harness a camada 2 e liberada — este cenario mede o harness, e isso esta declarado');

    // 401 — o unico gate exercitavel aqui.
    setUser(null);
    const antes = await contarPedidos();
    assert.strictEqual((await buscar('?search=MAT-IMP-A')).status, 401, 'busca sem usuario');
    assert.strictEqual((await importar({ linhas: [linha('OC-401', 'MAT-IMP-A', { qtd: 1, preco: 1 })] })).status, 401,
      'importacao sem usuario');
    assert.strictEqual(await contarPedidos(), antes, 'o 401 importou pedido');

    // METADE POSITIVA: com usuario as duas passam (senao "401 sempre" passaria neste cenario).
    setUser(COMPRADOR);
    assert.strictEqual((await buscar('?search=MAT-IMP-A')).status, 200, 'busca com usuario');
    assert.strictEqual((await importar({ linhas: [linha('OC-OK', 'MAT-IMP-A', { qtd: 1, preco: 1 })] })).status, 201,
      'importacao com usuario');
    setUser(ADMIN);
  });

  // (7) ------------------------------------------------------------------------------------
  await test('(7) SEM IDEMPOTENCIA (declarado): reimportar a mesma planilha cria pedidos NOVOS', async () => {
    const corpo = {
      linhas: [
        linha('OC-H', 'MAT-IMP-A', { qtd: 3, preco: 10 }),
        linha('OC-H', 'MAT-IMP-B', { qtd: 2, preco: 5 }),
      ],
    };
    const primeira = await importar(corpo);
    assert.strictEqual(primeira.status, 201, `1a importacao: ${primeira.status}`);
    const segunda = await importar(corpo);
    assert.strictEqual(segunda.status, 201, `2a importacao: ${segunda.status}`);

    // A duplicacao e o comportamento CONTRATADO (contrato 5: "Idempotencia: nao ha"), porque
    // `numero` e gerado e o agrupador e da planilha — nao ha chave para reconhecer o reenvio.
    assert.notStrictEqual(primeira.body.pedidos[0].id, segunda.body.pedidos[0].id,
      'reimportar tem de criar pedido NOVO (nao ha idempotencia por numero)');
    assert.notStrictEqual(primeira.body.pedidos[0].numero, segunda.body.pedidos[0].numero,
      'o numero do reenvio e outro');
    const duplicados = await dbAll(db,
      "SELECT id FROM pedidos_compra WHERE observacoes LIKE '%Planilha: OC-H%'");
    assert.strictEqual(duplicados.length, 2,
      `a mesma ordem da planilha aparece DUAS vezes (declarado), veio ${duplicados.length}`);
    // E as linhas duplicaram junto — quem "consertar" com idempotencia derruba esta asserçao em
    // vez de descobrir a mudanca de contrato em producao.
    assert.strictEqual((await linhasDoPedido(segunda.body.pedidos[0].id)).length, 2, 'linhas do reenvio');
  });

  // (8) ------------------------------------------------------------------------------------
  //
  // ONDA DE CORRECAO, F1 — o achado C1 da revisao final, reproduzido por sonda executada DUAS
  // vezes antes de existir este cenario:
  //   {pedido:'OC-1', codigo:'P-A', fornecedor:'ACME'}, {pedido:'OC-1', codigo:'P-B',
  //    fornecedor:'BETA'}  ->  201 {"pedidos":[{"id":2,"itens":2}],"ignorados":[]}
  //   pedidos_compra id 2: razao_social 'ACME SA', com a linha da BETA dentro.
  // O operador recebia SUCESSO TOTAL (um pedido, dois itens, zero ignorados) e o erro propagava
  // para o financeiro: `receiptService.js:376` grava o `fornecedor_id` do pedido no cabecalho do
  // recebimento e a conta a pagar nasce dele — material da BETA lancado a pagar PARA A ACME.
  // A regua NAO EXISTIA (nao e que falhou): o helper `linha()` injeta sempre o MESMO `cnpj`.
  await test('(8) MESMA ordem com fornecedores DIFERENTES vira DOIS pedidos, cada um com o SEU fornecedor', async () => {
    const r = await importar({
      linhas: [
        { pedido: 'OC-MIX', cnpj: cnpjPlanilha, 'código': 'MAT-IMP-A', qtd: 10, preco: 5 },
        { pedido: 'OC-MIX', cnpj: cnpjPlanilha2, 'código': 'MAT-IMP-B', qtd: 20, preco: 7 },
      ],
    });
    assert.strictEqual(r.status, 201, `esperava 201, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(r.body.ignorados, [], `nada devia ser ignorado: ${JSON.stringify(r.body.ignorados)}`);
    // ⚠️ AS ASSERCOES QUE MEDEM O DANO. Com a chave de grupo antiga (so a ordem da planilha) isto
    // vinha 1, e o `fornecedor_id` do unico pedido era o da primeira linha.
    assert.strictEqual(r.body.pedidos.length, 2,
      `mesma OC com dois fornecedores tem de virar 2 pedidos, veio ${JSON.stringify(r.body.pedidos)}`);
    const [pA, pB] = r.body.pedidos;
    const cabA = await cabecalho(pA.id);
    const cabB = await cabecalho(pB.id);
    assert.strictEqual(cabA.fornecedor_id, fornecedorId, 'o 1o pedido tem de ser do fornecedor da 1a linha');
    assert.strictEqual(cabB.fornecedor_id, fornecedorId2, 'o 2o pedido tem de ser do fornecedor da 2a linha');
    // Regua POR PEDIDO (e nao COUNT global): cada um com a SUA linha, e a linha certa.
    const linhasA = await linhasDoPedido(pA.id);
    const linhasB = await linhasDoPedido(pB.id);
    assert.strictEqual(linhasA.length, 1, `esperava 1 linha no pedido da ACME, veio ${linhasA.length}`);
    assert.strictEqual(linhasB.length, 1, `esperava 1 linha no pedido do divergente, veio ${linhasB.length}`);
    assert.strictEqual(linhasA[0].material_id, materialIdA, 'a linha do 1o pedido e a do material A');
    assert.strictEqual(linhasB[0].material_id, materialIdB, 'a linha do 2o pedido e a do material B');
    assert.strictEqual(cabA.valor_total, 50, `10x5 = 50, veio ${cabA.valor_total}`);
    assert.strictEqual(cabB.valor_total, 140, `20x7 = 140, veio ${cabB.valor_total}`);
    // A ORDEM DE ORIGEM fica registrada nos DOIS: e o que permite achar a OC-MIX depois.
    assert.ok(String(cabA.observacoes || '').includes('Planilha: OC-MIX'), `observacoes do 1o: ${cabA.observacoes}`);
    assert.ok(String(cabB.observacoes || '').includes('Planilha: OC-MIX'), `observacoes do 2o: ${cabB.observacoes}`);

    // O MESMO defeito pela planilha SEM coluna de ordem (o caso (a) da sonda: tudo caia no
    // `SEM_AGRUPADOR` e virava um pedido so, do primeiro fornecedor que resolvesse).
    const semOrdem = await importar({
      linhas: [
        { cnpj: cnpjPlanilha, 'código': 'MAT-IMP-A', qtd: 1, preco: 5 },
        { cnpj: cnpjPlanilha2, 'código': 'MAT-IMP-B', qtd: 2, preco: 7 },
      ],
    });
    assert.strictEqual(semOrdem.status, 201, `esperava 201, veio ${semOrdem.status}`);
    assert.strictEqual(semOrdem.body.pedidos.length, 2,
      `planilha sem ordem e com dois fornecedores tem de virar 2 pedidos, veio ${semOrdem.body.pedidos.length}`);
    assert.strictEqual((await cabecalho(semOrdem.body.pedidos[0].id)).fornecedor_id, fornecedorId);
    assert.strictEqual((await cabecalho(semOrdem.body.pedidos[1].id)).fornecedor_id, fornecedorId2);
    assert.strictEqual((await linhasDoPedido(semOrdem.body.pedidos[0].id)).length, 1, 'uma linha por pedido');
    assert.strictEqual((await linhasDoPedido(semOrdem.body.pedidos[1].id)).length, 1, 'uma linha por pedido');

    // ⚠️ METADE POSITIVA, e ela e obrigatoria: agrupar por (ordem, fornecedor) NAO pode ter virado
    // "um pedido por linha". Mesma OC, MESMO fornecedor, duas linhas -> UM pedido com DUAS linhas.
    const mesmoForn = await importar({
      linhas: [
        { pedido: 'OC-JUNTA', cnpj: cnpjPlanilha, 'código': 'MAT-IMP-A', qtd: 3, preco: 2 },
        { pedido: 'OC-JUNTA', cnpj: cnpjPlanilha, 'código': 'MAT-IMP-B', qtd: 4, preco: 1 },
      ],
    });
    assert.strictEqual(mesmoForn.body.pedidos.length, 1,
      `mesmo fornecedor continua UM pedido, veio ${mesmoForn.body.pedidos.length}`);
    assert.strictEqual((await linhasDoPedido(mesmoForn.body.pedidos[0].id)).length, 2,
      'as duas linhas tem de estar no MESMO pedido');

    // E a linha cujo fornecedor NAO resolve nunca herda o do grupo: vai para `ignorados`, e o
    // pedido nasce so com a linha boa. (Custo declarado: a planilha que traz o CNPJ so na primeira
    // linha da ordem perde as outras — ver o comentario da chave de grupo no servico.)
    const semCnpj = await importar({
      linhas: [
        { pedido: 'OC-HERDA', cnpj: cnpjPlanilha, 'código': 'MAT-IMP-A', qtd: 5, preco: 2 },
        { pedido: 'OC-HERDA', 'código': 'MAT-IMP-B', qtd: 6, preco: 2 },
      ],
    });
    assert.strictEqual(semCnpj.status, 201, `esperava 201, veio ${semCnpj.status}`);
    assert.deepStrictEqual(semCnpj.body.ignorados, [{ linha: 2, motivo: MOTIVO_FORNECEDOR }],
      `a linha sem fornecedor tem de ser recusada, nunca herdar: ${JSON.stringify(semCnpj.body.ignorados)}`);
    assert.strictEqual(semCnpj.body.pedidos.length, 1, 'a linha boa ainda cria o pedido dela');
    assert.strictEqual((await linhasDoPedido(semCnpj.body.pedidos[0].id)).length, 1,
      'o pedido nasce com UMA linha — a linha sem fornecedor nao entrou por heranca');
  });

  // (9) ------------------------------------------------------------------------------------
  //
  // ONDA DE CORRECAO, F3 — achado I2: o client le a planilha com `XLSX.utils.sheet_to_json(sheet,
  // { defval: '' })`, SEM `cellDates` e com `raw` no default `true`, entao a celula formatada como
  // data chega como SERIAL NUMERICO. A importacao lia a previsao por `extrairDoRow` (que devolve
  // sempre String) e gravava `previsao_entrega = '45000'` numa coluna `DATE` — sem 400, sem
  // `ignorados`, e INVISIVEL na tela (o `<input type="date">` renderiza vazio para esse valor, e o
  // comprador que reabrisse o pedido nao veria o valor torto).
  //
  // A conversao e do SERVIDOR (e nao `raw: false` no navegador): `raw: false` devolveria quantidade
  // e preco como texto FORMATADO pela planilha e mataria a regra "cru primeiro" do cenario (6) —
  // alem de que a rota recebe linhas de qualquer origem.
  await test('(9) celula de data: serial do Excel e DD/MM/AAAA convertidos; texto solto vira AVISO, nao recusa', async () => {
    const r = await importar({
      linhas: [
        // 45000 = 2023-03-15 (epoch 1899-12-30, o "bug de 1900" da Lotus embutido).
        linha('OC-DATA1', 'MAT-IMP-A', { qtd: 1, preco: 2, previsao: 45000 }),
        linha('OC-DATA2', 'MAT-IMP-A', { qtd: 1, preco: 2, previsao: '05/09/2026' }),
        linha('OC-DATA3', 'MAT-IMP-A', { qtd: 1, preco: 2, previsao: '2026-10-07' }),
        linha('OC-DATA4', 'MAT-IMP-A', { qtd: 1, preco: 2, previsao: 'a combinar' }),
      ],
    });
    assert.strictEqual(r.status, 201, `esperava 201, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.pedidos.length, 4, `esperava 4 pedidos, veio ${r.body.pedidos.length}`);
    // ⚠️ AS ASSERCOES QUE MEDEM O DANO: antes do conserto a primeira gravava a string '45000'.
    const [d1, d2, d3, d4] = r.body.pedidos;
    assert.strictEqual((await cabecalho(d1.id)).previsao_entrega, '2023-03-15',
      'serial 45000 do Excel tinha de virar 2023-03-15');
    assert.strictEqual((await cabecalho(d2.id)).previsao_entrega, '2026-09-05',
      "'05/09/2026' tinha de virar 2026-09-05 (dia/mes na ordem brasileira)");
    assert.strictEqual((await cabecalho(d3.id)).previsao_entrega, '2026-10-07',
      'a data ja em AAAA-MM-DD tinha de passar inteira');

    // A LINHA NAO RECONHECIDA ENTRA (a data e informativa — recusar a linha jogaria fora o item
    // comprado), com a previsao NULA e um AVISO que diz qual celula arrumar.
    assert.strictEqual((await cabecalho(d4.id)).previsao_entrega, null,
      "'a combinar' tinha de virar NULL — nunca texto na coluna DATE");
    assert.strictEqual((await linhasDoPedido(d4.id)).length, 1, 'a linha do aviso TEM de ter entrado');
    assert.deepStrictEqual(r.body.avisos, [{ linha: 4, campo: 'previsao_entrega', motivo: AVISO_PREVISAO }],
      `avisos divergente: ${JSON.stringify(r.body.avisos)}`);
    // E `ignorados` continua vazio: aviso NAO e recusa, e a resposta nao mistura as duas coisas.
    assert.deepStrictEqual(r.body.ignorados, [], `ignorados tinha de ficar vazio: ${JSON.stringify(r.body.ignorados)}`);

    // METADE NEGATIVA do aviso: sem celula de previsao nenhuma, `avisos` fica VAZIO (um aviso
    // permanente nao avisa nada).
    const semData = await importar({ linhas: [linha('OC-DATA5', 'MAT-IMP-A', { qtd: 1, preco: 2 })] });
    assert.deepStrictEqual(semData.body.avisos, [], `sem coluna de previsao nao ha aviso: ${JSON.stringify(semData.body.avisos)}`);
    assert.strictEqual((await cabecalho(semData.body.pedidos[0].id)).previsao_entrega, null,
      'sem coluna de previsao a coluna fica NULL');
  });

  // (10) -----------------------------------------------------------------------------------
  //
  // ONDA DE CORRECAO, F7 — achado I4 da revisao de UX: `data_pedido` nao era passada no
  // `criarPedido` da importacao e nao havia lista de grafias para ela. O DDL nao tem DEFAULT
  // (`index.js:19235`), entao a coluna ficava NULL e `Compras.js:273` renderizava `'-'`: uma
  // importacao de 60 pedidos produzia 60 linhas com "Data Pedido: -" na aba e no Excel — e a unica
  // ordenacao da lista e `created_at DESC`, que o operador nao ve. Justamente no caso que a Task 4
  // existe para atender (carga do acervo), onde a data ANTIGA de cada ordem e o que importa saber.
  await test('(10) data_pedido: da planilha quando ha coluna (serial ou DD/MM/AAAA), HOJE quando nao ha', async () => {
    const hoje = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();

    // ⚠️ SEM COLUNA DE DATA: nasce com HOJE, nunca NULL. A assercao que mede o dano.
    const semColuna = await importar({ linhas: [linha('OC-DT-A', 'MAT-IMP-A', { qtd: 1, preco: 2 })] });
    assert.strictEqual(semColuna.status, 201, `esperava 201, veio ${semColuna.status}`);
    const cabSem = await cabecalho(semColuna.body.pedidos[0].id);
    assert.strictEqual(cabSem.data_pedido, hoje,
      `sem coluna de data o pedido tinha de nascer com hoje (${hoje}), veio ${JSON.stringify(cabSem.data_pedido)}`);
    // ⚠️ A DATA LOCAL, e nao a UTC: `toISOString()`/`date('now')` dariam o dia de AMANHA depois das
    // 21h no fuso do Brasil. Esta assercao so difere da de cima nesse intervalo — e e nele que o
    // defeito apareceria.
    assert.notStrictEqual(cabSem.data_pedido, null, 'data_pedido NULL e o defeito que o F7 conserta');

    // COM COLUNA `data` em DD/MM/AAAA (a grafia do export da propria aba Pedidos).
    const comData = await importar({
      linhas: [linha('OC-DT-B', 'MAT-IMP-A', { qtd: 1, preco: 2, data: '05/09/2026' })],
    });
    assert.strictEqual((await cabecalho(comData.body.pedidos[0].id)).data_pedido, '2026-09-05',
      "'05/09/2026' na coluna `data` tinha de virar 2026-09-05");

    // E as outras grafias, cada uma com o seu formato de celula (serial do Excel incluso).
    const outras = await importar({
      linhas: [
        linha('OC-DT-C', 'MAT-IMP-A', { qtd: 1, preco: 2, 'data do pedido': '2026-01-31' }),
        linha('OC-DT-D', 'MAT-IMP-A', { qtd: 1, preco: 2, 'emissão': 45000 }),
        linha('OC-DT-E', 'MAT-IMP-A', { qtd: 1, preco: 2, data_pedido: '2025-12-01' }),
      ],
    });
    const [c, d, e] = outras.body.pedidos;
    assert.strictEqual((await cabecalho(c.id)).data_pedido, '2026-01-31', '`data do pedido` nao foi lida');
    assert.strictEqual((await cabecalho(d.id)).data_pedido, '2023-03-15', '`emissão` com serial do Excel nao foi lida');
    assert.strictEqual((await cabecalho(e.id)).data_pedido, '2025-12-01', '`data_pedido` nao foi lida');

    // Celula irreconhecivel: AVISO com o campo `data_pedido`, a linha ENTRA, e a data cai para hoje
    // (a alternativa — NULL — e o proprio defeito).
    const ruim = await importar({
      linhas: [linha('OC-DT-F', 'MAT-IMP-A', { qtd: 1, preco: 2, data: 'setembro' })],
    });
    assert.deepStrictEqual(ruim.body.avisos, [{ linha: 1, campo: 'data_pedido', motivo: AVISO_DATA_PEDIDO }],
      `avisos divergente: ${JSON.stringify(ruim.body.avisos)}`);
    assert.deepStrictEqual(ruim.body.ignorados, [], 'aviso NAO e recusa');
    assert.strictEqual((await linhasDoPedido(ruim.body.pedidos[0].id)).length, 1, 'a linha do aviso TEM de ter entrado');
    assert.strictEqual((await cabecalho(ruim.body.pedidos[0].id)).data_pedido, hoje,
      'data irreconhecivel cai para hoje, nunca NULL nem texto');
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
