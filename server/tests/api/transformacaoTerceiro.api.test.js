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
void ALMOXARIFE; void PRODUCAO;

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
void saldos; void valorDe;

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
  const { db, close } = await createTestApp({ user: ADMIN });

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

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
