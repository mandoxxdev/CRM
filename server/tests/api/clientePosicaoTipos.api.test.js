/**
 * Etapa 8c (tarefa extra) — a posicao por cliente tem de contar TODO tipo que mexe no saldo.
 *
 * ── O defeito ────────────────────────────────────────────────────────────────────────────────
 *
 * `clienteEstoqueService` mantinha listas PROPRIAS de tipos de entrada e de consumo — o terceiro
 * espelho das listas do motor (que ja se declara duas vezes dentro do stockService). O espelho
 * ficou para tras duas vezes seguidas: a 8b criou PERDA_TERCEIRO/CONSUMO_TERCEIRO sem acrescenta-lo
 * la, e a 8c (Task 4) criou RETORNO_TRANSFORMACAO do mesmo jeito.
 *
 * O sintoma nao e erro, e MENTIRA ARITMETICA na tela do cliente: a peca creditada por transformacao
 * aparecia com SALDO mas `recebido = 0`; a chapa consumida no terceiro sumia do saldo sem aparecer
 * em `consumido`. A conta que o cliente faz de cabeca — recebido - consumido - devolvido = saldo —
 * nao fechava, e nao havia coluna nenhuma onde procurar a diferenca.
 *
 * ── O criterio da decisao ────────────────────────────────────────────────────────────────────
 *
 * "O que o cliente le como recebido/consumido". Por esse criterio, TUDO que baixa o saldo tem de
 * aparecer em ALGUMA coluna. `DEVOLUCAO_CLIENTE` e a unica excecao legitima — e nao porque nao
 * conte, mas porque tem coluna PROPRIA (`devolvido`): o cliente precisa separar "quanto virou peca"
 * de "quanto voltou pra mim". PERDA_TERCEIRO e CONSUMO_TERCEIRO nao tem coluna propria, entao
 * deixa-los de fora nao os separa: os torna INVISIVEIS.
 *
 * ── A guarda de verdade — e o que ela NAO cobre (revisado na Etapa 9 Task 2) ────────────────────
 *
 * O teste que importa nao e "RETORNO_TRANSFORMACAO conta" (isso so cobre o tipo de hoje). E a
 * EQUACAO, exercitada com uma linha de CADA tipo de `movementTypes.TIPOS_ENTRADA`/`TIPOS_SAIDA`:
 * um tipo que ESTA numa dessas duas listas mas nao chega direito na leitura do cliente quebra a
 * equacao aqui, sem ninguem precisar escrever teste proprio para ele. O que isto garante de
 * verdade: os CONSUMIDORES (`clienteEstoqueService`) derivam da fonte unica e nao tem como
 * divergir dela em silencio — o defeito original descrito acima (o terceiro espelho).
 *
 * O que isto NAO garante, desde a 8c: `clienteEstoqueService.TIPOS_ENTRADA` deixou de ser lista
 * propria e virou `= movementTypes.TIPOS_ENTRADA` — a MESMA referencia (clienteEstoqueService.js,
 * linha ~42), nao mais um espelho que possa divergir. O `for` do teste [EQUACAO] abaixo itera essa
 * MESMA lista, importada direto de `movementTypes.js`: um tipo esquecido DENTRO de
 * `TIPOS_ENTRADA`/`TIPOS_SAIDA` — ou seja, declarado em `schema.js` `TIPOS_MOVIMENTO` mas nunca
 * acrescentado la — nao aparece em lugar nenhum deste arquivo, porque o teste nao tem fonte
 * independente para saber que o tipo deveria estar na lista e nao esta: ele so pode iterar o que
 * ja esta la. Esse esquecimento e pego pelo teste de DECLARACAO do proprio tipo novo (ex.:
 * retalhoTipo.api.test.js, transformacaoMotor.api.test.js:50-53) — quem cria um tipo tem de
 * escrever aquele teste; este arquivo nao escreve por ele. Confirmado por execucao na Etapa 9 Task
 * 2: sabotar SO `movementTypes.TIPOS_ENTRADA` (deixando o tipo em TIPOS_MOVIMENTO) nao derruba
 * nenhum teste deste arquivo.
 *
 * Executar: cd server && node tests/api/clientePosicaoTipos.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const clienteEstoqueService = require('../../services/almoxarifado/clienteEstoqueService');
const { TIPOS_ENTRADA, TIPOS_SAIDA } = require('../../services/almoxarifado/movementTypes');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function materialDoCliente(db, clienteId) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, custo_unitario, ativo, proprietario_cliente_id)
    VALUES (?,?,'UN',0,10,1,?)`, [`CLI-TIPO-${seq}`, `Chapa do cliente ${seq}`, clienteId]);
  return r.lastID;
}

/**
 * Escreve a linha DIRETO no livro e move `quantidade_atual` junto — de proposito.
 *
 * O defeito e de LEITURA: as somas de `posicaoPorCliente`. Passar pelo motor exigiria satisfazer as
 * guardas de cada tipo (OS/projeto do dono, remessa viva, retencao em terceiros) e o teste passaria
 * a medir as guardas em vez da leitura. O que NAO pode ser dispensado e a coerencia entre livro e
 * saldo — e ela quem torna a equacao do cliente uma assercao com significado — entao o saldo se
 * move aqui, com o sinal que o motor daria, em vez de ser escrito a mao em cada teste.
 */
async function lancar(db, materialId, tipo, quantidade) {
  const sinal = TIPOS_ENTRADA.includes(tipo) ? 1 : -1;
  assert.ok(sinal === 1 || TIPOS_SAIDA.includes(tipo), `tipo fora das listas do motor: ${tipo}`);
  const antes = (await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?',
    [materialId])).quantidade_atual;
  const depois = antes + sinal * quantidade;
  await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
    (material_id, tipo, quantidade, usuario_id, cancelado, saldo_anterior, saldo_posterior)
    VALUES (?,?,?,1,0,?,?)`, [materialId, tipo, quantidade, antes, depois]);
  await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ? WHERE id = ?', [depois, materialId]);
}

const linhaDo = (pos, materialId) => pos.itens.find((i) => i.material_id === materialId);

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  // `projetos` e `ordens_servico` sao tabelas CORE (criadas por index.js no boot), fora do
  // initSchema do almoxarifado — clienteEstoqueService faz LEFT JOIN nelas. Stub no teste, nunca
  // fallback na query: fallback esconderia em teste um erro que existiria em producao.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS projetos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)`);
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT, cliente_id INTEGER,
    projeto_id INTEGER, status TEXT)`);

  const cli = await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Alfa LTDA']);
  const clienteId = cli.lastID;

  // ── Os tres tipos que faltavam, um teste por um ─────────────────────────────────────────────
  await test('[8c] peca creditada por RETORNO_TRANSFORMACAO aparece em `recebido`', async () => {
    const id = await materialDoCliente(db, clienteId);
    await lancar(db, id, 'RETORNO_TRANSFORMACAO', 40);
    const linha = linhaDo(await clienteEstoqueService.posicaoPorCliente(db, { cliente_id: clienteId }), id);
    assert.strictEqual(linha.saldo, 40, 'CONTROLE: a fixture nao criou saldo — o teste nao provaria nada');
    assert.strictEqual(linha.recebido, 40,
      'a peca do cliente aparece com SALDO mas recebido = 0: o cliente ve material que o sistema '
      + 'nao sabe dizer de onde veio');
  });

  await test('[8b] chapa baixada por CONSUMO_TERCEIRO aparece em `consumido`', async () => {
    const id = await materialDoCliente(db, clienteId);
    await lancar(db, id, 'ENTRADA', 100);
    await lancar(db, id, 'CONSUMO_TERCEIRO', 100);
    const linha = linhaDo(await clienteEstoqueService.posicaoPorCliente(db, { cliente_id: clienteId }), id);
    assert.strictEqual(linha.recebido, 100);
    assert.strictEqual(linha.consumido, 100,
      'a chapa sumiu do saldo sem aparecer em consumido — o cliente nao tem onde procurar');
  });

  await test('[8b] chapa baixada por PERDA_TERCEIRO aparece em `consumido`', async () => {
    const id = await materialDoCliente(db, clienteId);
    await lancar(db, id, 'ENTRADA', 100);
    await lancar(db, id, 'PERDA_TERCEIRO', 100);
    const linha = linhaDo(await clienteEstoqueService.posicaoPorCliente(db, { cliente_id: clienteId }), id);
    assert.strictEqual(linha.consumido, 100, 'perda no terceiro ficou invisivel para o dono do material');
  });

  // ── A excecao deliberada, que o conserto NAO pode atropelar ──────────────────────────────────
  await test('[CONTROLE POSITIVO] DEVOLUCAO_CLIENTE continua FORA de `consumido` — tem coluna propria', async () => {
    // Sem isto, "acrescentar tudo que e saida" passaria em todos os testes acima e destruiria a
    // separacao que o cliente usa para conferir a remessa dele ("quanto virou peca" x "quanto
    // voltou pra mim"). A metade que falta.
    const id = await materialDoCliente(db, clienteId);
    await lancar(db, id, 'ENTRADA', 100);
    await lancar(db, id, 'DEVOLUCAO_CLIENTE', 30);
    const linha = linhaDo(await clienteEstoqueService.posicaoPorCliente(db, { cliente_id: clienteId }), id);
    assert.strictEqual(linha.devolvido, 30, 'a devolucao sumiu da coluna que existe so para ela');
    assert.strictEqual(linha.consumido, 0,
      'DEVOLUCAO_CLIENTE entrou em consumido — o cliente passa a ler "voltou pra mim" como '
      + '"virou peca", e a devolucao vira contada DUAS vezes na tela');
  });

  await test('[CONTROLE POSITIVO] movimentacao CANCELADA nao conta em nenhuma coluna', async () => {
    const id = await materialDoCliente(db, clienteId);
    // Nao passa por `lancar`: a linha cancelada e justamente a que NAO moveu saldo.
    await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, usuario_id, cancelado, saldo_anterior, saldo_posterior)
      VALUES (?,'RETORNO_TRANSFORMACAO',50,1,1,0,0)`, [id]);
    const linha = linhaDo(await clienteEstoqueService.posicaoPorCliente(db, { cliente_id: clienteId }), id);
    assert.strictEqual(linha.recebido, 0, 'linha estornada voltou a contar como recebimento');
  });

  // ── A guarda de verdade: a EQUACAO, com uma linha de CADA tipo do motor ──────────────────────
  await test('[EQUACAO] com UMA linha de cada tipo do motor, recebido - consumido - devolvido = saldo', async () => {
    // Isto e o que faz o proximo tipo novo NAO precisar de teste proprio: se ele nascer no motor e
    // nao chegar na leitura do cliente, a equacao para de fechar aqui.
    const entradas = TIPOS_ENTRADA.length * 10;
    const saidas = TIPOS_SAIDA.length * 3;
    const id = await materialDoCliente(db, clienteId);
    for (const t of TIPOS_ENTRADA) await lancar(db, id, t, 10);
    for (const t of TIPOS_SAIDA) await lancar(db, id, t, 3);

    const linha = linhaDo(await clienteEstoqueService.posicaoPorCliente(db, { cliente_id: clienteId }), id);
    assert.strictEqual(linha.recebido, entradas,
      `recebido soma so ${linha.recebido} de ${entradas}: algum TIPOS_ENTRADA do motor nao chega na leitura do cliente`);
    assert.strictEqual(linha.recebido - linha.consumido - linha.devolvido, linha.saldo,
      `a equacao do cliente nao fecha: ${linha.recebido} - ${linha.consumido} - ${linha.devolvido} `
      + `!= ${linha.saldo}. Ha tipo que mexe no saldo e nao aparece em nenhuma coluna da tela.`);
  });

  // ── O espelho: a leitura do cliente tem de DERIVAR do motor, nao copia-lo ────────────────────
  await test('[espelho] TIPOS_ENTRADA da posicao por cliente e o do motor, sem edicao', async () => {
    assert.deepStrictEqual([...clienteEstoqueService.TIPOS_ENTRADA].sort(), [...TIPOS_ENTRADA].sort(),
      'a lista de entrada da posicao por cliente divergiu do motor');
  });

  await test('[espelho] TIPOS_CONSUMO e o TIPOS_SAIDA do motor MENOS DEVOLUCAO_CLIENTE, e so isso', async () => {
    // Escrito como conta, e nao como lista literal, DE PROPOSITO: uma lista literal aqui seria o
    // QUARTO espelho, e este teste passaria a ser o proximo a ficar para tras.
    const esperado = TIPOS_SAIDA.filter((t) => t !== 'DEVOLUCAO_CLIENTE');
    assert.deepStrictEqual([...clienteEstoqueService.TIPOS_CONSUMO].sort(), [...esperado].sort(),
      'a lista de consumo da posicao por cliente nao e mais "as saidas do motor menos a devolucao"');
    assert.ok(!clienteEstoqueService.TIPOS_CONSUMO.includes('DEVOLUCAO_CLIENTE'));
    assert.ok(TIPOS_SAIDA.includes('DEVOLUCAO_CLIENTE'),
      'CONTROLE POSITIVO: se DEVOLUCAO_CLIENTE sair do motor, o `filter` acima passa a nao remover '
      + 'nada e este teste vira uma tautologia');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
