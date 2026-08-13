/**
 * Etapa 8c — transformacao no terceiro: chapa que sai e volta como pecas cortadas + sobra.
 *
 * Testa o SERVICO e o SCHEMA, nao as rotas (as rotas ganham bloco proprio na Task 8, neste mesmo
 * arquivo, porque a superficie e pequena e separar em dois arquivos duplicaria as fixtures).
 *
 * A diferenca de natureza que organiza tudo: na 8b a remessa e RETENCAO pura (o material continua
 * sendo nosso, so nao esta no predio) e o retorno e a operacao inversa, igualmente inocua. Na
 * transformacao a chapa DEIXA DE EXISTIR: ela sai do patrimonio E da retencao (CONSUMO_TERCEIRO,
 * que ja existe desde a 8b e faz as duas coisas no mesmo UPDATE) e as pecas ENTRAM como material
 * novo (RETORNO_TRANSFORMACAO, Task 4).
 *
 * Executar: cd server && node tests/api/transformacaoTerceiro.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { TIPOS_RESULTADO } = require('../../services/almoxarifado/schema');
const { ResultadoTransformacaoSchema } = require('../../services/almoxarifado/schemas');
const svc = require('../../services/almoxarifado/thirdPartyService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
// Perfis EXPLICITOS: getPerfilFromUser faz fallback para PRODUCAO, entao "usuario sem perfil" nao e
// "sem acesso" — e chao de fabrica. Usados a partir da Task 5.
const ALMOXARIFE = { id: 2, nome: 'Almoxarife', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const PRODUCAO = { id: 3, nome: 'Chao de fabrica', email: 'prod@test.com', perfil_almoxarifado: 'PRODUCAO' };

let seq = 0;
/**
 * Material de teste. `custo` alimenta AS DUAS colunas de custo de proposito: o sistema tem duas
 * familias de leitura de valor (custo_unitario sozinho em routes/almoxarifado.js:249 e :1048;
 * COALESCE(custo_medio, custo_unitario) em reportService.js:10 e stockService.js:1870), e uma
 * fixture que enchesse so uma delas faria o teste do invariante depender de qual das duas o
 * assertor escolheu. Ver a contradicao C1 no plano.
 */
async function novoMaterial(db, { atual = 0, custo = 0, dono = null, unidade = 'UN', peso = null, cod = null } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado
       (codigo, nome, unidade, quantidade_atual, custo_medio, custo_unitario, peso_unitario, ativo, proprietario_cliente_id)
     VALUES (?,?,?,?,?,?,?,1,?)`,
    [cod || `TRF-${seq}`, `Material transformacao ${seq}`, unidade, atual, custo, custo, peso, dono]);
  return r.lastID;
}
const saldos = async (db, id) => dbGet(db,
  `SELECT quantidade_atual, COALESCE(quantidade_em_terceiros,0) AS em_terceiros,
          COALESCE(custo_medio,0) AS custo_medio, COALESCE(custo_unitario,0) AS custo_unitario
   FROM materiais_almoxarifado WHERE id = ?`, [id]);
/** Valor do material por UMA formula so — ver C1 no plano. */
const valorDe = async (db, id) => {
  const m = await dbGet(db,
    'SELECT quantidade_atual, COALESCE(custo_medio, custo_unitario, 0) AS custo FROM materiais_almoxarifado WHERE id = ?', [id]);
  return Number(m.quantidade_atual) * Number(m.custo);
};

/** Remessa ENVIADA de 1 item. Devolve { remessa, itemId, materialId }. */
async function remessaEnviada(db, { qtd = 100, custo = 0, dono = null, unidade = 'KG', peso = null } = {}) {
  const mat = await novoMaterial(db, { atual: qtd, custo, dono, unidade, peso });
  const rem = await svc.criarRemessa(db, ADMIN, {
    fornecedor_nome: 'Corte a Laser Oeste LTDA',
    tipo_servico: 'Corte',
    prazo_previsto: '2026-09-30',
    itens: [{ material_id: mat, quantidade: qtd }],
  });
  await svc.enviarRemessa(db, ADMIN, rem.id);
  const item = await dbGet(db,
    'SELECT id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?', [rem.id]);
  return { remessa: rem, itemId: item.id, materialId: mat };
}

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });

  // ══ Task 3 — as tres colunas e a peca Zod ═══════════════════════════════════════════════════

  await test('[schema] retornos_remessa_item_almoxarifado tem as tres colunas novas', async () => {
    const cols = await dbAll(db, 'PRAGMA table_info(retornos_remessa_item_almoxarifado)');
    const nomes = cols.map((c) => c.name);
    for (const c of ['tipo_resultado', 'custo_unitario_aplicado', 'movimentacao_consumo_id']) {
      assert.ok(nomes.includes(c), `falta a coluna ${c} — tem: ${nomes.join(', ')}`);
    }
    // O tipo declarado importa: TEXT numa coluna que vai guardar 'PECA'/'SOBRA', REAL no custo,
    // INTEGER no vinculo. SQLite tolera qualquer coisa, mas o PRAGMA e o unico lugar onde a
    // intencao fica escrita para quem ler o banco depois.
    const tipoDe = (n) => cols.find((c) => c.name === n).type;
    assert.strictEqual(tipoDe('tipo_resultado'), 'TEXT');
    assert.strictEqual(tipoDe('custo_unitario_aplicado'), 'REAL');
    assert.strictEqual(tipoDe('movimentacao_consumo_id'), 'INTEGER');
    // O indice do agrupador do evento. NAO estava no bloco de testes do plano — sem esta assercao,
    // apagar o CREATE INDEX nao derruba teste nenhum e a regressao passa despercebida (a consulta
    // "quais linhas sairam desta baixa de chapa" vira varredura da tabela inteira).
    const idx = await dbAll(db,
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='retornos_remessa_item_almoxarifado'");
    assert.ok(idx.some((i) => i.name === 'idx_retornos_remessa_consumo'),
      `falta o indice idx_retornos_remessa_consumo — tem: ${idx.map((i) => i.name).join(', ')}`);
  });

  await test('[schema] as colunas novas nascem NULL, e NULL significa "retorno simples da 8b"', async () => {
    // NAO e buraco: e o valor certo para as linhas que a 8b ja gravou (e continua gravando) — o
    // retorno do MESMO material nao e transformacao. E o que permite separar os dois mundos com
    // `WHERE tipo_resultado IS NOT NULL` sem tabela nova.
    const { remessa, itemId, materialId } = await remessaEnviada(db, { qtd: 50 });
    await svc.registrarRetorno(db, ADMIN, remessa.id, {
      nota_fiscal: 'NF-8B-1', itens: [{ item_remessa_id: itemId, quantidade: 20 }] });
    const linha = await dbGet(db,
      'SELECT * FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ?', [itemId]);
    assert.strictEqual(linha.material_id, materialId);
    assert.strictEqual(linha.tipo_resultado, null, 'o retorno simples da 8b nasceu classificado');
    assert.strictEqual(linha.custo_unitario_aplicado, null);
    assert.strictEqual(linha.movimentacao_consumo_id, null);
  });

  await test('[schema] initSchema roda de novo sem erro — safeAlter e idempotente', async () => {
    // O initSchema roda DUAS vezes no boot (routes/almoxarifado.js:56 fire-and-forget +
    // extended.runInitSchemaWithRetry), e as duas podem interlear num DB fresco. Um ALTER sem
    // safeAlter derruba o boot na segunda.
    const { initSchema } = require('../../services/almoxarifado/schema');
    await initSchema(db);
    const cols = await dbAll(db, 'PRAGMA table_info(retornos_remessa_item_almoxarifado)');
    const n = cols.filter((c) => c.name === 'tipo_resultado').length;
    assert.strictEqual(n, 1, 'a segunda passada duplicou a coluna (ou derrubou)');
  });

  await test('[schema] TIPOS_RESULTADO e a fonte unica: PECA e SOBRA, nessa ordem', async () => {
    assert.deepStrictEqual(TIPOS_RESULTADO, ['PECA', 'SOBRA']);
  });

  await test('[schema] ResultadoTransformacaoSchema recusa tipo_resultado fora da lista', async () => {
    const r = ResultadoTransformacaoSchema.safeParse({
      material_id: 1, quantidade: 5, tipo_resultado: 'CAVACO' });
    assert.strictEqual(r.success, false);
    assert.match(JSON.stringify(r.error.issues), /tipo_resultado/);
  });

  await test('[schema] ResultadoTransformacaoSchema exige tipo_resultado — nao ha default silencioso', async () => {
    // Um default 'PECA' pareceria conveniente e seria a pior escolha possivel: a sobra viraria peca
    // por omissao e entraria carregando rateio, que e exatamente o que a decisao 4 existe para
    // impedir (a sobra e UMA linha e uma FATIA GRANDE — e ela que envenena a media).
    const r = ResultadoTransformacaoSchema.safeParse({ material_id: 1, quantidade: 5 });
    assert.strictEqual(r.success, false);
  });

  await test('[schema] ResultadoTransformacaoSchema PRESERVA os cinco campos declarados', async () => {
    // z.object DESCARTA chave nao declarada EM SILENCIO (schemas.js:311-320). Este teste e o que
    // impede lote_id/observacoes de sumirem no caminho — a mesma armadilha que custou caro com
    // reserva_id (Etapa 4), lote_id (Etapa 6) e justificativa do cancelamento (Etapa 8).
    const entrada = { material_id: 7, quantidade: 40, tipo_resultado: 'PECA', lote_id: 3, observacoes: 'obs' };
    const r = ResultadoTransformacaoSchema.safeParse(entrada);
    assert.strictEqual(r.success, true, JSON.stringify(r.error?.issues));
    assert.deepStrictEqual(r.data, entrada, 'o schema comeu algum campo declarado');
  });

  await test('[CONTROLE POSITIVO] ResultadoTransformacaoSchema aceita SOBRA com o minimo', async () => {
    // Sem isto, um schema que recusasse TUDO passaria nos dois testes de recusa acima.
    const r = ResultadoTransformacaoSchema.safeParse({ material_id: 9, quantidade: 1, tipo_resultado: 'SOBRA' });
    assert.strictEqual(r.success, true, JSON.stringify(r.error?.issues));
  });

  // ══ Task 5 — a guarda do dono na transformacao ══════════════════════════════════════════════

  const ownerRules = require('../../services/almoxarifado/ownerRules');
  const mat = async (id) => dbGet(db,
    'SELECT id, codigo, proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?', [id]);

  const CLI_X = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Metalurgica X LTDA')")).lastID;
  const CLI_Y = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Caldeiraria Y SA')")).lastID;

  await test('transformacao para material de OUTRO dono falha', async () => {
    const chapa = await mat(await novoMaterial(db, { dono: CLI_X, cod: 'DONO-CHAPA-X' }));
    const peca = await mat(await novoMaterial(db, { dono: CLI_Y, cod: 'DONO-PECA-Y' }));
    await assert.rejects(
      () => ownerRules.assertMesmoDonoNaTransformacao(db, chapa, peca),
      (e) => {
        assert.strictEqual(e.status, 400);
        // A mensagem NOMEIA OS DOIS. Sem isso o operador ve "dono diferente" e nao sabe qual dos
        // dois cadastros esta errado — o mesmo criterio de resolverProprietario na 8b.
        assert.match(e.message, /Metalurgica X LTDA/, 'a mensagem nao diz de quem e a chapa');
        assert.match(e.message, /Caldeiraria Y SA/, 'a mensagem nao diz de quem e o material de destino');
        assert.match(e.message, /DONO-CHAPA-X/, 'a mensagem nao diz QUAL chapa');
        assert.match(e.message, /DONO-PECA-Y/, 'a mensagem nao diz QUAL material de destino');
        return true;
      });
  });

  await test('chapa DE CLIENTE virando peca NOSSA falha — o caso que a decisao 3 existe para impedir', async () => {
    // ESTE e o caso perigoso, e nao o de dois clientes diferentes: material de cliente virando
    // patrimonio da GMP em silencio, com numero certo em todo relatorio.
    const chapa = await mat(await novoMaterial(db, { dono: CLI_X, cod: 'CONV-CHAPA' }));
    const peca = await mat(await novoMaterial(db, { dono: null, cod: 'CONV-PECA' }));
    await assert.rejects(
      () => ownerRules.assertMesmoDonoNaTransformacao(db, chapa, peca),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.match(e.message, /Metalurgica X LTDA/);
        // O nosso estoque tem nome proprio na mensagem — "dono: null" nao diz nada a ninguem.
        assert.match(e.message, /estoque proprio|material nosso/i,
          'a mensagem nao nomeia o lado NOSSO da comparacao');
        return true;
      });
  });

  await test('chapa NOSSA virando peca DE CLIENTE tambem falha (a guarda e simetrica)', async () => {
    // O caminho inverso e igualmente errado: presentear o cliente com material nosso, e o
    // inventario dele passando a contar uma peca que a GMP pagou.
    const chapa = await mat(await novoMaterial(db, { dono: null, cod: 'INV-CHAPA' }));
    const peca = await mat(await novoMaterial(db, { dono: CLI_X, cod: 'INV-PECA' }));
    await assert.rejects(
      () => ownerRules.assertMesmoDonoNaTransformacao(db, chapa, peca),
      (e) => { assert.strictEqual(e.status, 400); return true; });
  });

  await test('[CONTROLE POSITIVO] transformacao para material do MESMO dono passa', async () => {
    // OBRIGATORIO: sem ele, uma guarda que recusasse TUDO passaria nos tres testes acima e a
    // transformacao nunca funcionaria. Ja aconteceu cinco vezes nesta base.
    const chapa = await mat(await novoMaterial(db, { dono: CLI_X, cod: 'OK-CHAPA' }));
    const peca = await mat(await novoMaterial(db, { dono: CLI_X, cod: 'OK-PECA' }));
    await ownerRules.assertMesmoDonoNaTransformacao(db, chapa, peca); // nao lanca
  });

  await test('[CONTROLE POSITIVO] os dois materiais NOSSOS passam', async () => {
    // A outra metade do positivo: NULL === NULL e o caso mais comum do dia a dia da GMP, e uma
    // implementacao que comparasse com `===` sobre valores vindos do SQLite (onde ausente e
    // `null`, mas um `0` mal normalizado tambem aparece) poderia recusar justamente este.
    const chapa = await mat(await novoMaterial(db, { dono: null, cod: 'NOSSO-CHAPA' }));
    const peca = await mat(await novoMaterial(db, { dono: null, cod: 'NOSSO-PECA' }));
    await ownerRules.assertMesmoDonoNaTransformacao(db, chapa, peca); // nao lanca
  });

  await test('[CONTROLE POSITIVO] dono gravado como 0 conta como NOSSO — a normalizacao `|| null`', async () => {
    // NAO estava no bloco de testes do plano. Achado da sabotagem desta task: apagar o `|| null`
    // dos dois lados de assertMesmoDonoNaTransformacao nao derrubava NENHUM dos 14 testes, embora
    // o comentario da funcao afirme que a normalizacao e o que impede um `0` mal gravado de
    // recusar a transformacao mais comum do dia a dia (material nosso). Sem esta assercao, quem
    // "simplificasse" a normalizacao fora teria a suite inteira verde — e a afirmacao do
    // comentario seria mentira documentada, que e o que o CLAUDE.md proibe.
    // `0` chega aqui de verdade: a coluna e INTEGER sem NOT NULL e sem FK enforcada (o teste do
    // cliente #99999 acima prova que id inexistente entra), entao um INSERT/importacao que mande
    // 0 em vez de NULL grava 0.
    const chapaZero = await mat(await novoMaterial(db, { dono: 0, cod: 'ZERO-CHAPA' }));
    const pecaNula = await mat(await novoMaterial(db, { dono: null, cod: 'ZERO-PECA' }));
    assert.strictEqual(chapaZero.proprietario_cliente_id, 0, 'a fixture nao gravou 0 — o teste provaria nada');
    await ownerRules.assertMesmoDonoNaTransformacao(db, chapaZero, pecaNula); // nao lanca
    await ownerRules.assertMesmoDonoNaTransformacao(db, pecaNula, chapaZero); // nem no sentido inverso
  });

  await test('a guarda nao depende de o cliente existir na tabela clientes', async () => {
    // Robustez da MENSAGEM, nao da regra: cliente apagado (ou banco de teste sem a linha) nao pode
    // fazer a guarda explodir com "cannot read razao_social of undefined" — nomeDoCliente ja cai
    // para `cliente #N`, e este teste fixa isso.
    const chapa = await mat(await novoMaterial(db, { dono: 99999, cod: 'FANTASMA-CHAPA' }));
    const peca = await mat(await novoMaterial(db, { dono: null, cod: 'FANTASMA-PECA' }));
    await assert.rejects(
      () => ownerRules.assertMesmoDonoNaTransformacao(db, chapa, peca),
      (e) => { assert.match(e.message, /cliente #99999/); return true; });
  });

  // ══ Task 7 — registrarTransformacao ═════════════════════════════════════════════════════════

  const stockService = require('../../services/almoxarifado/stockService');

  /** Chapa de 100 KG a R$ 10, enviada. Devolve { remessa, itemId, materialId }. */
  const chapaEnviada = (extra = {}) => remessaEnviada(db, { qtd: 100, custo: 10, unidade: 'KG', ...extra });

  /**
   * O texto auditavel da ULTIMA baixa de chapa.
   *
   * Le a coluna `justificativa`, e NAO `motivo`/`observacoes` — que e onde o bloco de testes do
   * plano procurava. `registrarMovimentacao` grava o parametro `justificativa` na COLUNA
   * `justificativa` (stockService.js:1217-1225) e nunca o copia para `motivo` nem para
   * `observacoes`; as duas assercoes do plano (custo do servico e residuo) liam colunas que sao
   * SEMPRE nulas neste caminho e teriam falhado para sempre. As tres colunas entram na
   * concatenacao de proposito: o que o teste exige e que o numero esteja ESCRITO em algum lugar
   * auditavel da baixa, nao em qual das tres.
   */
  const textoDaBaixa = async () => {
    const b = await dbGet(db, `SELECT motivo, observacoes, justificativa
      FROM movimentacoes_almoxarifado WHERE tipo = 'CONSUMO_TERCEIRO' ORDER BY id DESC LIMIT 1`);
    return `${b.motivo || ''} ${b.observacoes || ''} ${b.justificativa || ''}`;
  };

  await test('transformacao baixa a chapa e credita as pecas', async () => {
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'PECA-A' });
    const sobraId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'KG', cod: 'SOBRA-A' });

    const r = await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      nota_fiscal: 'NF-TRF-1',
      itens: [{
        item_remessa_id: itemId, quantidade_consumida: 100,
        resultados: [
          { material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' },
          { material_id: sobraId, quantidade: 12, tipo_resultado: 'SOBRA' },
        ],
      }],
    });
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.transformacoes, 1);
    assert.strictEqual(r.resultados, 2);
    assert.strictEqual(r.pendente_total, 0);
    assert.strictEqual(r.status, 'ENCERRADA', 'consumo total nao encerrou a remessa');

    // A chapa saiu do patrimonio E da retencao — as duas, no mesmo UPDATE do motor.
    const chapa = await saldos(db, materialId);
    assert.strictEqual(chapa.quantidade_atual, 0, 'a chapa continua no patrimonio');
    assert.strictEqual(chapa.em_terceiros, 0, 'a retencao da chapa ficou presa');

    // As pecas entraram.
    assert.strictEqual((await saldos(db, pecaId)).quantidade_atual, 40);
    assert.strictEqual((await saldos(db, sobraId)).quantidade_atual, 12);
  });

  await test('a transformacao grava as tres colunas novas e os DOIS vinculos de movimentacao', async () => {
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { unidade: 'UN', cod: 'PECA-B' });
    const sobraId = await novoMaterial(db, { unidade: 'KG', cod: 'SOBRA-B' });
    await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      nota_fiscal: 'NF-TRF-2',
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 100, resultados: [
        { material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' },
        { material_id: sobraId, quantidade: 12, tipo_resultado: 'SOBRA' },
      ] }],
    });
    const linhas = await dbAll(db,
      'SELECT * FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ? ORDER BY id', [itemId]);
    assert.strictEqual(linhas.length, 2);
    assert.strictEqual(linhas[0].tipo_resultado, 'PECA');
    assert.strictEqual(linhas[1].tipo_resultado, 'SOBRA');
    assert.strictEqual(linhas[0].custo_unitario_aplicado, 25);
    assert.strictEqual(linhas[1].custo_unitario_aplicado, 0);
    assert.strictEqual(linhas[0].material_id, pecaId, 'o resultado gravou o material da CHAPA');
    assert.strictEqual(linhas[0].nota_fiscal, 'NF-TRF-2');

    // As DUAS pontas: movimentacao_id aponta para o credito, movimentacao_consumo_id para a baixa.
    for (const l of linhas) {
      const credito = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [l.movimentacao_id]);
      assert.ok(credito, 'a linha nao aponta para a movimentacao que a creditou');
      assert.strictEqual(credito.tipo, 'RETORNO_TRANSFORMACAO');
      assert.strictEqual(credito.material_id, l.material_id);
      const baixa = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [l.movimentacao_consumo_id]);
      assert.ok(baixa, 'a linha nao aponta para a movimentacao que baixou a chapa');
      assert.strictEqual(baixa.tipo, 'CONSUMO_TERCEIRO');
      assert.strictEqual(baixa.material_id, materialId);
      assert.strictEqual(baixa.quantidade, 100);
    }
    // O agrupador: as N linhas do MESMO evento compartilham o consumo. E por isso que nao ha coluna
    // quantidade_consumida na linha — somar por linha contaria o mesmo consumo N vezes.
    assert.strictEqual(linhas[0].movimentacao_consumo_id, linhas[1].movimentacao_consumo_id);
    // A ORDEM (decisao 9), medida no unico lugar que a registra de verdade: os ids do ledger sao
    // monotonicos, entao a baixa da chapa ter id MENOR que o credito da peca prova que ela veio
    // ANTES. Sem esta assercao, inverter a ordem (creditar primeiro, baixar depois) nao derruba
    // teste nenhum — e a ordem inversa e a que cria peca SEM baixa quando o credito falha no meio.
    assert.ok(linhas[0].movimentacao_consumo_id < linhas[0].movimentacao_id,
      'a baixa da chapa nao aconteceu ANTES do credito da peca (decisao 9): os ids do ledger '
      + 'dizem a ordem real, e credito antes de baixa cria peca sem baixa na falha');
  });

  await test('[INVARIANTE] o valor que sai na chapa e o que entra nas pecas', async () => {
    // Medido por UMA formula so (COALESCE(custo_medio, custo_unitario)) e com materiais de destino
    // de saldo/custo ZERO. As duas restricoes sao reais e estao no plano (C1 e C2): o sistema tem
    // DUAS familias de leitura de valor, e a sobra a custo zero entra carregando o custo que o
    // material dela ja tinha (o motor nao escreve custo quando o custo informado nao e > 0).
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'PECA-INV' });
    const sobraId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'KG', cod: 'SOBRA-INV' });

    const antes = await valorDe(db, materialId);
    assert.strictEqual(antes, 1000, 'a fixture da chapa nao vale R$ 1.000');

    await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 100, resultados: [
        { material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' },
        { material_id: sobraId, quantidade: 12, tipo_resultado: 'SOBRA' },
      ] }],
    });
    const depois = (await valorDe(db, materialId)) + (await valorDe(db, pecaId)) + (await valorDe(db, sobraId));
    assert.ok(Math.abs(depois - antes) < 0.01,
      `o patrimonio se moveu: antes ${antes}, depois ${depois}`);
    assert.strictEqual(await valorDe(db, materialId), 0);
    assert.strictEqual(await valorDe(db, sobraId), 0, 'a sobra entrou com valor');
  });

  await test('sobra entra com custo zero e nao dilui as pecas', async () => {
    // O caso que motivou a regra, medido no BANCO: 25 e nao 24,39.
    const { remessa, itemId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'PECA-DIL' });
    const sobraId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'KG', cod: 'SOBRA-DIL' });
    await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 100, resultados: [
        { material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' },
        { material_id: sobraId, quantidade: 33, tipo_resultado: 'SOBRA' },
      ] }],
    });
    assert.strictEqual((await saldos(db, pecaId)).custo_medio, 25,
      'a sobra entrou no denominador do rateio');
    const s = await saldos(db, sobraId);
    assert.strictEqual(s.quantidade_atual, 33);
    assert.strictEqual(s.custo_medio, 0);
  });

  await test('sobra a custo zero NAO apaga o custo que o material da sobra ja tinha', async () => {
    // Consequencia do ramo `else` do motor (stockService.js:1043): credito com custo 0 nao escreve
    // custo nenhum. E o comportamento certo — e e tambem o motivo pelo qual o invariante so fecha
    // com sobra de custo previo zero (contradicao C2 do plano). Fixado aqui para nao virar surpresa.
    const { remessa, itemId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { unidade: 'UN', cod: 'PECA-C2' });
    const sobraId = await novoMaterial(db, { atual: 5, custo: 3, unidade: 'KG', cod: 'SOBRA-C2' });
    await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 100, resultados: [
        { material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' },
        { material_id: sobraId, quantidade: 10, tipo_resultado: 'SOBRA' },
      ] }],
    });
    const s = await saldos(db, sobraId);
    assert.strictEqual(s.quantidade_atual, 15);
    assert.strictEqual(s.custo_medio, 3, 'a sobra a custo zero apagou o custo cadastrado do material');
  });

  await test('custo_servico informado soma ao valor rateado', async () => {
    const { remessa, itemId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'PECA-SRV' });
    const r = await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 100, custo_servico: 400,
        resultados: [{ material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' }] }],
    });
    assert.strictEqual((await saldos(db, pecaId)).custo_medio, 35, '1000 + 400 rateado em 40 = 35');
    assert.strictEqual(r.custo[0].valor_servico, 400);
    assert.strictEqual(r.custo[0].valor_total, 1400);
    // O servico tem de ficar ESCRITO em algum lugar auditavel: nao ha coluna de custo no ledger, e
    // nao ha coluna de servico na linha de resultado (seria repetida por linha). A justificativa do
    // CONSUMO_TERCEIRO e esse lugar.
    assert.match(await textoDaBaixa(), /400/,
      'o custo do servico do terceiro nao ficou registrado em lugar nenhum');
  });

  await test('chapa com custo SO em custo_unitario (custo_medio = 0) rateia pelo custo REAL', async () => {
    // NAO estava no bloco de testes do plano, e e o teste que pega o defeito que o codigo do plano
    // trazia pronto: ele lia o custo da chapa com `COALESCE(custo_medio, custo_unitario, 0)`.
    // `custo_medio` e REAL DEFAULT 0 (schema.js:647) e o cadastro de material grava SO
    // `custo_unitario` (materialService.js:185) — entao COALESCE, que devolve o primeiro NAO-NULO,
    // devolve ZERO para todo material cadastrado a mao. Sonda executada: material com
    // custo_unitario = 10 lia 0 pela formula do plano e 10 pela do motor.
    //
    // As fixtures deste arquivo enchem AS DUAS colunas de proposito (ver C1), e e por isso que
    // NENHUM dos outros 21 testes pegava isto: sem esta fixture assimetrica, a 8c inteira seria um
    // no-op de custo para o caso comum, com a suite verde.
    const { remessa, itemId, materialId } = await chapaEnviada();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET custo_medio = 0 WHERE id = ?', [materialId]);
    const conferencia = await saldos(db, materialId);
    assert.strictEqual(conferencia.custo_medio, 0, 'a fixture nao zerou custo_medio — provaria nada');
    assert.strictEqual(conferencia.custo_unitario, 10, 'a fixture perdeu o custo_unitario');

    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'PECA-LEGADO' });
    await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 100,
        resultados: [{ material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' }] }],
    });
    assert.strictEqual((await saldos(db, pecaId)).custo_medio, 25,
      'a chapa foi transformada a custo ZERO porque custo_medio estava em 0 e a leitura usou '
      + 'COALESCE em vez da convencao do motor (custo_medio > 0 ? custo_medio : custo_unitario)');
  });

  await test('[CONTROLE POSITIVO] chapa com custo zero credita peca com custo zero, sem erro', async () => {
    // Prova que o rateio nao inventa numero. Material sem custo cadastrado e caso comum (todo o
    // acervo anterior a Task 2), e a transformacao dele tem de funcionar — com zero, que e a
    // verdade.
    const { remessa, itemId } = await remessaEnviada(db, { qtd: 50, custo: 0, unidade: 'KG' });
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'PECA-ZERO' });
    await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 50,
        resultados: [{ material_id: pecaId, quantidade: 10, tipo_resultado: 'PECA' }] }],
    });
    const p = await saldos(db, pecaId);
    assert.strictEqual(p.quantidade_atual, 10);
    assert.strictEqual(p.custo_medio, 0);
  });

  await test('so SOBRA: o valor sem destino fica ESCRITO na baixa da chapa', async () => {
    // Caso-limite decidido no plano (C3): permitido, e o valor evapora de proposito. O que nao pode
    // e evaporar em silencio.
    const { remessa, itemId } = await chapaEnviada();
    const sobraId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'KG', cod: 'SOBRA-SO' });
    const r = await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 100,
        resultados: [{ material_id: sobraId, quantidade: 30, tipo_resultado: 'SOBRA' }] }],
    });
    assert.strictEqual(r.custo[0].residuo, 1000);
    assert.match(await textoDaBaixa(), /1000/, 'o valor que evaporou nao ficou escrito na baixa');
  });

  await test('peca de material inexistente falha ensinando o caminho', async () => {
    // Decisao 6: o motor NAO cria material. Precedente do modulo: o recebimento tambem nao
    // (receiptService.js:44-50). Criar material implicitamente a partir de um formulario de retorno
    // produziria cadastro-lixo a cada erro de digitacao, e cadastro-lixo em almoxarifado nao se
    // apaga — ele ganha saldo.
    const { remessa, itemId, materialId } = await chapaEnviada();
    await assert.rejects(
      () => svc.registrarTransformacao(db, ADMIN, remessa.id, {
        itens: [{ item_remessa_id: itemId, quantidade_consumida: 10,
          resultados: [{ material_id: 987654, quantidade: 5, tipo_resultado: 'PECA' }] }] }),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.match(e.message, /987654/, 'a mensagem nao diz QUAL material nao existe');
        assert.match(e.message, /cadastr/i, 'a mensagem nao ensina o caminho (cadastrar antes)');
        return true;
      });
    // Nada se moveu: a recusa e na PRE-CHECAGEM, antes de qualquer efeito.
    const c = await saldos(db, materialId);
    assert.strictEqual(c.quantidade_atual, 100);
    assert.strictEqual(c.em_terceiros, 100);
  });

  await test('material de destino INATIVO tambem falha', async () => {
    const { remessa, itemId } = await chapaEnviada();
    const morto = await novoMaterial(db, { unidade: 'UN', cod: 'PECA-MORTA' });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [morto]);
    await assert.rejects(
      () => svc.registrarTransformacao(db, ADMIN, remessa.id, {
        itens: [{ item_remessa_id: itemId, quantidade_consumida: 10,
          resultados: [{ material_id: morto, quantidade: 5, tipo_resultado: 'PECA' }] }] }),
      /inativ/i);
  });

  await test('resultado com o MESMO material da chapa e recusado, apontando o retorno simples', async () => {
    // Chapa que volta como ela mesma nao e transformacao — e o retorno da 8b, e ele tem rota
    // propria. Aceitar aqui daria dois caminhos para a mesma operacao, com contabilidades de custo
    // diferentes (um rateia, o outro nao).
    const { remessa, itemId, materialId } = await chapaEnviada();
    await assert.rejects(
      () => svc.registrarTransformacao(db, ADMIN, remessa.id, {
        itens: [{ item_remessa_id: itemId, quantidade_consumida: 10,
          resultados: [{ material_id: materialId, quantidade: 10, tipo_resultado: 'PECA' }] }] }),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.match(e.message, /retorno/i, 'a mensagem nao aponta o caminho do retorno simples');
        return true;
      });
  });

  await test('quantidade_consumida acima do pendente falha, com os numeros na mensagem', async () => {
    // O teto da 8b continua valendo, INTACTO: `quantidade_consumida` esta na unidade do ENVIADO, e
    // e por isso que a decisao 1 separou os dois numeros. Comparar peca (UN) com chapa (KG) seria
    // somar laranja com maca.
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { unidade: 'UN', cod: 'PECA-TETO' });
    await assert.rejects(
      () => svc.registrarTransformacao(db, ADMIN, remessa.id, {
        itens: [{ item_remessa_id: itemId, quantidade_consumida: 140,
          resultados: [{ material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' }] }] }),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.match(e.message, /100/, 'a mensagem nao diz quanto foi enviado');
        assert.match(e.message, /140/, 'a mensagem nao diz quanto este documento pede');
        return true;
      });
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 100, 'moveu saldo numa recusa');
  });

  await test('resultado em unidade diferente NAO conta no teto', async () => {
    // O erro que o desenho evita. A chapa saiu em KG; 400 pecas em UN nao estouram teto nenhum,
    // porque o teto e sobre `quantidade_consumida` (KG) e os resultados nao encostam nele.
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'PECA-UN' });
    const r = await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 60,
        resultados: [{ material_id: pecaId, quantidade: 400, tipo_resultado: 'PECA' }] }],
    });
    assert.strictEqual(r.status, 'RETORNO_PARCIAL');
    assert.strictEqual(r.pendente_total, 40, 'o teto contou as 400 pecas em UN');
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 40);
    assert.strictEqual((await saldos(db, pecaId)).quantidade_atual, 400);
  });

  await test('transformacao com um item invalido NAO aplica NENHUM item do lote', async () => {
    // Pre-checagem TOTAL, a forma da 8b: um documento com dois itens, um deles com material de
    // destino inexistente, nao pode transformar metade.
    const matA = await novoMaterial(db, { atual: 100, custo: 10, unidade: 'KG', cod: 'LOTE-A' });
    const matB = await novoMaterial(db, { atual: 100, custo: 10, unidade: 'KG', cod: 'LOTE-B' });
    const rem = await svc.criarRemessa(db, ADMIN, { fornecedor_nome: 'Corte Oeste',
      itens: [{ material_id: matA, quantidade: 100 }, { material_id: matB, quantidade: 100 }] });
    await svc.enviarRemessa(db, ADMIN, rem.id);
    const its = await dbAll(db,
      'SELECT id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ? ORDER BY id', [rem.id]);
    const pecaId = await novoMaterial(db, { unidade: 'UN', cod: 'PECA-LOTE' });

    await assert.rejects(() => svc.registrarTransformacao(db, ADMIN, rem.id, { itens: [
      { item_remessa_id: its[0].id, quantidade_consumida: 50,
        resultados: [{ material_id: pecaId, quantidade: 10, tipo_resultado: 'PECA' }] },
      { item_remessa_id: its[1].id, quantidade_consumida: 50,
        resultados: [{ material_id: 555555, quantidade: 10, tipo_resultado: 'PECA' }] },
    ] }), /555555/);

    assert.strictEqual((await saldos(db, matA)).quantidade_atual, 100, 'o item bom foi consumido numa recusa');
    assert.strictEqual((await saldos(db, matA)).em_terceiros, 100);
    assert.strictEqual((await saldos(db, pecaId)).quantidade_atual, 0);
  });

  await test('transformacao sem a acao remessar_terceiro falha com 403', async () => {
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { unidade: 'UN', cod: 'PECA-403' });
    await assert.rejects(
      () => svc.registrarTransformacao(db, PRODUCAO, remessa.id, {
        itens: [{ item_remessa_id: itemId, quantidade_consumida: 10,
          resultados: [{ material_id: pecaId, quantidade: 5, tipo_resultado: 'PECA' }] }] }),
      (e) => { assert.strictEqual(e.status, 403); return true; });
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 100);
  });

  await test('[CONTROLE POSITIVO] ALMOXARIFE, que tem a acao, transforma normalmente', async () => {
    // Sem isto, `throw 403 sempre` passaria no teste acima e a funcao nunca funcionaria.
    const { remessa, itemId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, unidade: 'UN', cod: 'PECA-ALMOX' });
    const r = await svc.registrarTransformacao(db, ALMOXARIFE, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 100,
        resultados: [{ material_id: pecaId, quantidade: 20, tipo_resultado: 'PECA' }] }] });
    assert.strictEqual(r.status, 'ENCERRADA');
  });

  await test('transformacao em remessa que nunca foi enviada e recusada', async () => {
    const m = await novoMaterial(db, { atual: 10, unidade: 'KG', cod: 'ABERTA-CHAPA' });
    const rem = await svc.criarRemessa(db, ADMIN, { fornecedor_nome: 'Corte Oeste',
      itens: [{ material_id: m, quantidade: 10 }] });
    const it = await dbGet(db,
      'SELECT id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?', [rem.id]);
    const pecaId = await novoMaterial(db, { unidade: 'UN', cod: 'PECA-ABERTA' });
    await assert.rejects(
      () => svc.registrarTransformacao(db, ADMIN, rem.id, {
        itens: [{ item_remessa_id: it.id, quantidade_consumida: 5,
          resultados: [{ material_id: pecaId, quantidade: 2, tipo_resultado: 'PECA' }] }] }),
      /ABERTA/);
    assert.strictEqual((await saldos(db, m)).quantidade_atual, 10);
  });

  await test('falha no credito da SEGUNDA peca devolve a chapa (patrimonio E retencao)', async () => {
    // A compensacao da decisao 9, e o teste mais importante desta task. Stuba o motor para falhar
    // no SEGUNDO RETORNO_TRANSFORMACAO — depois do consumo e depois do primeiro credito.
    const { remessa, itemId, materialId } = await chapaEnviada();
    const p1 = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'COMP-P1' });
    const p2 = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'COMP-P2' });

    const original = stockService.registrarMovimentacao;
    let creditos = 0;
    stockService.registrarMovimentacao = async (dbx, u, params, opts) => {
      if (params.tipo === 'RETORNO_TRANSFORMACAO') {
        creditos += 1;
        if (creditos === 2) throw Object.assign(new Error('falha simulada no segundo credito'), { status: 500 });
      }
      return original(dbx, u, params, opts);
    };
    try {
      await assert.rejects(() => svc.registrarTransformacao(db, ADMIN, remessa.id, {
        itens: [{ item_remessa_id: itemId, quantidade_consumida: 100, resultados: [
          { material_id: p1, quantidade: 20, tipo_resultado: 'PECA' },
          { material_id: p2, quantidade: 20, tipo_resultado: 'PECA' },
        ] }] }), /falha simulada/);
    } finally {
      stockService.registrarMovimentacao = original;
    }

    // A chapa voltou INTEIRA: patrimonio E retencao.
    const chapa = await saldos(db, materialId);
    assert.strictEqual(chapa.quantidade_atual, 100, 'a chapa nao voltou ao patrimonio');
    assert.strictEqual(chapa.em_terceiros, 100,
      'a retencao NAO voltou — o estorno do livro nao a recria (stockService.js:1380-1387) e a '
      + 'compensacao precisa do UPDATE suplementar');
    // O credito que passou foi desfeito, e o custo dele tambem.
    const q1 = await saldos(db, p1);
    assert.strictEqual(q1.quantidade_atual, 0, 'a primeira peca ficou creditada');
    assert.strictEqual(q1.custo_medio, 0,
      'o custo medio da primeira peca ficou movido por uma transformacao que nao aconteceu');
    // O claim do item voltou.
    const it = await dbGet(db,
      'SELECT quantidade_retornada FROM itens_remessa_terceiro_almoxarifado WHERE id = ?', [itemId]);
    assert.strictEqual(Number(it.quantidade_retornada || 0), 0, 'o claim do item nao foi devolvido');
    // Nenhuma linha de resultado orfa.
    const n = await dbGet(db,
      'SELECT COUNT(*) AS n FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ?', [itemId]);
    assert.strictEqual(n.n, 0, 'sobrou linha de resultado de uma transformacao que falhou');
  });

  await test('depois da falha, a MESMA transformacao pode ser refeita e funciona', async () => {
    // O teste decisivo da contradicao C6 do plano. "Os numeros voltaram" nao basta: se a retencao
    // nao voltar, o item fica pendente com zero retencao e a proxima tentativa bate na guarda
    // `COALESCE(quantidade_em_terceiros,0) >= ?` do claim duplo, PARA SEMPRE.
    const { remessa, itemId, materialId } = await chapaEnviada();
    const p1 = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'RETRY-P1' });
    const p2 = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'RETRY-P2' });
    const corpo = { itens: [{ item_remessa_id: itemId, quantidade_consumida: 100, resultados: [
      { material_id: p1, quantidade: 20, tipo_resultado: 'PECA' },
      { material_id: p2, quantidade: 20, tipo_resultado: 'PECA' },
    ] }] };

    const original = stockService.registrarMovimentacao;
    let creditos = 0;
    stockService.registrarMovimentacao = async (dbx, u, params, opts) => {
      if (params.tipo === 'RETORNO_TRANSFORMACAO') {
        creditos += 1;
        if (creditos === 2) throw Object.assign(new Error('falha simulada'), { status: 500 });
      }
      return original(dbx, u, params, opts);
    };
    try {
      await assert.rejects(() => svc.registrarTransformacao(db, ADMIN, remessa.id, corpo), /falha simulada/);
    } finally {
      stockService.registrarMovimentacao = original;
    }

    // Agora de verdade.
    const r = await svc.registrarTransformacao(db, ADMIN, remessa.id, corpo);
    assert.strictEqual(r.status, 'ENCERRADA');
    assert.strictEqual((await saldos(db, materialId)).quantidade_atual, 0);
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 0);
    assert.strictEqual((await saldos(db, p1)).quantidade_atual, 20);
    assert.strictEqual((await saldos(db, p2)).quantidade_atual, 20);
  });

  await test('transformacao parcial deixa o resto pendente e a remessa em RETORNO_PARCIAL', async () => {
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'PARC-P' });
    const r = await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 30,
        resultados: [{ material_id: pecaId, quantidade: 12, tipo_resultado: 'PECA' }] }] });
    assert.strictEqual(r.status, 'RETORNO_PARCIAL');
    assert.strictEqual(r.pendente_total, 70);
    const c = await saldos(db, materialId);
    assert.strictEqual(c.quantidade_atual, 70, 'baixou mais (ou menos) do que o consumido');
    assert.strictEqual(c.em_terceiros, 70);
    // 30 kg a R$ 10 = R$ 300 em 12 pecas = 25 cada.
    assert.strictEqual((await saldos(db, pecaId)).custo_medio, 25);
  });

  await test('transformacao e RETORNO simples convivem no mesmo item', async () => {
    // Metade da chapa volta inteira (RETORNO_TERCEIRO, 8b) e a outra metade e cortada. Os dois
    // caminhos somam no MESMO teto do item, porque os dois estao na unidade do enviado.
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'MISTO-P' });
    await svc.registrarRetorno(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade: 40 }] });
    const r = await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 60,
        resultados: [{ material_id: pecaId, quantidade: 24, tipo_resultado: 'PECA' }] }] });
    assert.strictEqual(r.status, 'ENCERRADA');
    assert.strictEqual(r.pendente_total, 0);
    const c = await saldos(db, materialId);
    // 40 voltaram (retencao desceu, patrimonio nao mudou) e 60 foram consumidos (as duas desceram).
    assert.strictEqual(c.quantidade_atual, 40);
    assert.strictEqual(c.em_terceiros, 0);
    // As linhas de resultado convivem: a da 8b com tipo_resultado NULL, a da 8c com 'PECA'.
    const linhas = await dbAll(db,
      'SELECT tipo_resultado FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ? ORDER BY id', [itemId]);
    assert.deepStrictEqual(linhas.map((l) => l.tipo_resultado), [null, 'PECA']);
  });

  // ══ Task 8 — rota, schema Zod e rendimento ══════════════════════════════════════════════════

  const BASE = '/api/almoxarifado/remessas-terceiros';
  const transformar = (remessaId, body) => request(app).post(`${BASE}/${remessaId}/transformacoes`).send(body);

  await test('[rota] a transformacao acontece pela rota e devolve o custo rateado', async () => {
    setUser(ADMIN);
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'ROTA-P' });
    const r = await transformar(remessa.id, {
      nota_fiscal: 'NF-ROTA-1',
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 100,
        resultados: [{ material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' }] }],
    });
    assert.strictEqual(r.status, 200, `a rota devolveu ${r.status}: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.status, 'ENCERRADA');
    assert.strictEqual(r.body.custo[0].custo_unitario_peca, 25);
    assert.strictEqual((await saldos(db, materialId)).quantidade_atual, 0);
    assert.strictEqual((await saldos(db, pecaId)).quantidade_atual, 40);
  });

  await test('[rota] sem a acao remessar_terceiro: 403, e o campo `acao` na resposta', async () => {
    // Assere o CAMPO e nao so o status: hoje `movimentar` e `remessar_terceiro` tem os mesmos
    // perfis, entao trocar um gate pelo outro nao mudaria status nenhum e a regressao passaria
    // despercebida. Licao registrada na Task 8 da 8b.
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { unidade: 'UN', cod: 'ROTA-403' });
    setUser(PRODUCAO);
    const r = await transformar(remessa.id, { itens: [{ item_remessa_id: itemId,
      quantidade_consumida: 10, resultados: [{ material_id: pecaId, quantidade: 5, tipo_resultado: 'PECA' }] }] });
    setUser(ADMIN);
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.body.acao, 'remessar_terceiro',
      `o 403 veio de outro gate: ${JSON.stringify(r.body)}`);
    assert.strictEqual((await saldos(db, materialId)).quantidade_atual, 100);
  });

  await test('[schema] tipo_resultado ATRAVESSA o Zod — a sobra chega como SOBRA no banco', async () => {
    // A armadilha: z.object DESCARTA chave nao declarada EM SILENCIO. Sem `tipo_resultado`
    // declarado, TODO resultado chegaria como undefined ao servico — o rateio recusaria tudo (ou,
    // pior, com um default, a sobra viraria peca e entraria carregando rateio).
    const { remessa, itemId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'ZOD-P' });
    const sobraId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'KG', cod: 'ZOD-S' });
    const r = await transformar(remessa.id, { itens: [{ item_remessa_id: itemId,
      quantidade_consumida: 100, resultados: [
        { material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' },
        { material_id: sobraId, quantidade: 10, tipo_resultado: 'SOBRA' },
      ] }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const linhas = await dbAll(db,
      'SELECT tipo_resultado, custo_unitario_aplicado FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ? ORDER BY id', [itemId]);
    assert.deepStrictEqual(linhas.map((l) => l.tipo_resultado), ['PECA', 'SOBRA']);
    assert.strictEqual(linhas[1].custo_unitario_aplicado, 0);
  });

  await test('[schema] custo_servico ATRAVESSA o Zod e muda o custo da peca', async () => {
    // Campo de nivel de ITEM (nao de resultado) — o candidato obvio a ser esquecido no schema.
    const { remessa, itemId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'ZOD-SRV' });
    const r = await transformar(remessa.id, { itens: [{ item_remessa_id: itemId,
      quantidade_consumida: 100, custo_servico: 400,
      resultados: [{ material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' }] }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await saldos(db, pecaId)).custo_medio, 35,
      'custo_servico foi descartado pelo schema em silencio (custo ficou 25 e nao 35)');
  });

  await test('[schema] lote_id e observacoes do resultado ATRAVESSAM o Zod', async () => {
    const { remessa, itemId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'ZOD-LOTE' });
    const r = await transformar(remessa.id, { itens: [{ item_remessa_id: itemId,
      quantidade_consumida: 100, resultados: [{ material_id: pecaId, quantidade: 40,
        tipo_resultado: 'PECA', observacoes: 'cortado em 4 chapas' }] }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const linha = await dbGet(db,
      'SELECT observacoes FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ?', [itemId]);
    assert.strictEqual(linha.observacoes, 'cortado em 4 chapas');
  });

  await test('[schema] resultado NAO declarado no Zod nao chega ao servico', async () => {
    // A outra ponta da mesma armadilha: mandar `custo_unitario_aplicado` pela API nao pode deixar o
    // cliente escolher o custo da peca. O rateio manda, e a chave estranha e descartada.
    const { remessa, itemId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'ZOD-EXTRA' });
    const r = await transformar(remessa.id, { itens: [{ item_remessa_id: itemId,
      quantidade_consumida: 100, resultados: [{ material_id: pecaId, quantidade: 40,
        tipo_resultado: 'PECA', custo_unitario_aplicado: 999 }] }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const linha = await dbGet(db,
      'SELECT custo_unitario_aplicado FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ?', [itemId]);
    assert.strictEqual(linha.custo_unitario_aplicado, 25,
      'o cliente conseguiu ditar o custo da peca pela API');
  });

  await test('[schema] documento sem `resultados` e recusado pelo Zod com 400', async () => {
    const { remessa, itemId } = await chapaEnviada();
    const r = await transformar(remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 10 }] });
    assert.strictEqual(r.status, 400);
  });

  await test('[rota] a mensagem do servico chega INTACTA ao cliente', async () => {
    // As mensagens desta etapa dizem os numeros e os codigos de proposito; um catch generico as
    // apagaria. Nenhuma rota de remessa tem try/catch proprio com mensagem inventada — todas caem
    // em handleError, que respeita err.status e devolve err.message.
    const { remessa, itemId } = await chapaEnviada();
    const r = await transformar(remessa.id, { itens: [{ item_remessa_id: itemId,
      quantidade_consumida: 10, resultados: [{ material_id: 424242, quantidade: 5, tipo_resultado: 'PECA' }] }] });
    assert.strictEqual(r.status, 400);
    assert.match(r.body.error, /424242/);
    assert.match(r.body.error, /cadastr/i);
  });

  await test('[rendimento] com todos os pesos, a resposta traz o percentual', async () => {
    const { remessa, itemId } = await remessaEnviada(db, { qtd: 100, custo: 10, unidade: 'KG', peso: 7.85 });
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', peso: 15, cod: 'REND-P' });
    const sobraId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'KG', peso: 120, cod: 'REND-S' });
    const r = await transformar(remessa.id, { itens: [{ item_remessa_id: itemId,
      quantidade_consumida: 100, resultados: [
        { material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' },
        { material_id: sobraId, quantidade: 1, tipo_resultado: 'SOBRA' },
      ] }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.rendimento[0].calculavel, true);
    assert.strictEqual(r.body.rendimento[0].peso_saida, 785);
    assert.strictEqual(r.body.rendimento[0].rendimento_percentual, 91.72);
  });

  await test('[rendimento] NUNCA bloqueia: sem peso, a transformacao acontece do mesmo jeito', async () => {
    // A decisao 7 inteira em um teste. Bloquear por um dado OPCIONAL travaria o operador por um
    // campo de cadastro em branco.
    const { remessa, itemId, materialId } = await chapaEnviada(); // sem peso
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'REND-SEMPESO' });
    const r = await transformar(remessa.id, { itens: [{ item_remessa_id: itemId,
      quantidade_consumida: 100, resultados: [{ material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' }] }] });
    assert.strictEqual(r.status, 200, `a transformacao foi BLOQUEADA por falta de peso: ${JSON.stringify(r.body)}`);
    assert.strictEqual((await saldos(db, materialId)).quantidade_atual, 0);
    assert.strictEqual(r.body.rendimento[0].calculavel, false);
    assert.match(r.body.rendimento[0].motivo, /peso/i);
    assert.ok(r.body.rendimento[0].materiais_sem_peso.length > 0,
      'disse "nao calculavel" sem dizer QUAL material falta');
  });

  await test('[leitura] getRemessa devolve os resultados JA classificados', async () => {
    // A tela (Task 9) le daqui. getRemessa faz `SELECT rr.*`, entao as tres colunas novas viajam de
    // graca — este teste e o que impede alguem "otimizar" o SELECT para uma lista de colunas e
    // quebrar a tela em silencio.
    const { remessa, itemId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'GET-P' });
    const sobraId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'KG', cod: 'GET-S' });
    await transformar(remessa.id, { itens: [{ item_remessa_id: itemId, quantidade_consumida: 100,
      resultados: [
        { material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' },
        { material_id: sobraId, quantidade: 5, tipo_resultado: 'SOBRA' },
      ] }] });
    const cheia = await svc.getRemessa(db, remessa.id);
    assert.strictEqual(cheia.retornos.length, 2);
    assert.deepStrictEqual(cheia.retornos.map((x) => x.tipo_resultado), ['PECA', 'SOBRA']);
    assert.strictEqual(cheia.retornos[0].custo_unitario_aplicado, 25);
    assert.strictEqual(cheia.retornos[0].material_codigo, 'GET-P',
      'a leitura nao traz o codigo do material do RESULTADO');
    void itemId;
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
