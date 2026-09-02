/**
 * Etapa 32, Task 1 — o servico de anexos, sem passar pela rota.
 *
 * O que este arquivo prova: RN-01 (anexo so existe preso a registro que existe), RN-02 (entidade
 * vem de mapa fechado) e RN-05 (remover e soft delete). O que ele NAO prova, e por isso existe o
 * `anexoDocumento.api.test.js`: a RN-03 (o arquivo nao e servido estaticamente), a RN-04 (o 403
 * sai antes do multer) e a RN-06 (toda saida != 201 limpa o upload) — todas dependem de disco e
 * de fiacao, e so a rota as alcanca.
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const anexoService = require('../../services/almoxarifado/anexoService');

let passou = 0, falhou = 0;
const testes = [];
function test(nome, fn) { testes.push([nome, fn]); }

const ARQUIVO = { filename: 'anexo-1-2.pdf', originalname: 'certificado.pdf', size: 1234, mimetype: 'application/pdf' };
const USER = { id: 7, nome: 'Qualidade Teste' };

async function comMaterial(ctx) {
  const r = await dbRun(ctx.db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade) VALUES (?,?,?)`,
    ['MAT-1', 'Chapa 3mm', 'KG']);
  return r.lastID;
}

// RN-02 — entidade fora do mapa e recusada, e a mensagem e literal
test('entidade fora do mapa: 400 com a literal, e nada e gravado', async () => {
  const ctx = await createTestApp();
  try {
    await assert.rejects(
      () => anexoService.registrarAnexo(ctx.db, USER,
        { entidade: 'qualquer_coisa', entidade_id: 1, tipo: 'CERTIFICADO' }, ARQUIVO),
      (e) => e.status === 400 && e.message === 'Entidade inválida para anexo');
    const linhas = await dbAll(ctx.db, 'SELECT * FROM anexos_documento_almoxarifado');
    assert.strictEqual(linhas.length, 0, 'nao pode gravar linha para entidade invalida');
  } finally { await ctx.close(); }
});

// RN-01 — o registro-pai tem de existir
test('entidade_id inexistente: 404 com a literal, e nada e gravado', async () => {
  const ctx = await createTestApp();
  try {
    await assert.rejects(
      () => anexoService.registrarAnexo(ctx.db, USER,
        { entidade: 'material', entidade_id: 99999, tipo: 'FICHA' }, ARQUIVO),
      (e) => e.status === 404 && e.message === 'Registro não encontrado para anexar');
    const linhas = await dbAll(ctx.db, 'SELECT * FROM anexos_documento_almoxarifado');
    assert.strictEqual(linhas.length, 0);
  } finally { await ctx.close(); }
});

// RN-01, lado positivo — com o pai existindo, grava e devolve a linha
test('material existente: grava, audita e devolve a linha SEM arquivo_path', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    const anexo = await anexoService.registrarAnexo(ctx.db, USER,
      { entidade: 'material', entidade_id: materialId, tipo: 'FICHA', descricao: 'Ficha técnica' },
      ARQUIVO);
    assert.ok(anexo.id > 0);
    assert.strictEqual(anexo.nome_original, 'certificado.pdf');
    assert.strictEqual(anexo.tamanho_bytes, 1234);
    assert.strictEqual(anexo.mime_type, 'application/pdf');
    assert.strictEqual(anexo.uploaded_by, 7);
    assert.strictEqual(anexo.uploaded_by_nome, 'Qualidade Teste');
    assert.strictEqual(anexo.arquivo_path, undefined, 'arquivo_path NAO sai do servico');

    const aud = await dbGet(ctx.db,
      `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'anexo' ORDER BY id DESC`);
    assert.ok(aud, 'anexar tem de auditar');
    assert.strictEqual(aud.acao, 'ANEXAR');
  } finally { await ctx.close(); }
});

// RN-05 — soft delete: some da lista, sobrevive no banco
test('remover e soft delete: some da lista, a linha continua com ativo = 0', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    const anexo = await anexoService.registrarAnexo(ctx.db, USER,
      { entidade: 'material', entidade_id: materialId, tipo: 'FICHA' }, ARQUIVO);

    await anexoService.removerAnexo(ctx.db, USER, anexo.id);

    const lista = await anexoService.listarAnexos(ctx.db, { entidade: 'material', entidade_id: materialId });
    assert.strictEqual(lista.length, 0, 'removido nao aparece na lista');

    const linha = await dbGet(ctx.db, 'SELECT * FROM anexos_documento_almoxarifado WHERE id = ?', [anexo.id]);
    assert.ok(linha, 'a linha continua existindo');
    assert.strictEqual(linha.ativo, 0);
    assert.strictEqual(linha.deleted_by, 7);
    assert.ok(linha.deleted_at, 'deleted_at preenchido');
  } finally { await ctx.close(); }
});

// RN-05 — remover duas vezes nao e sucesso silencioso
test('remover ja removido: 404, nao 200', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    const anexo = await anexoService.registrarAnexo(ctx.db, USER,
      { entidade: 'material', entidade_id: materialId, tipo: 'FICHA' }, ARQUIVO);
    await anexoService.removerAnexo(ctx.db, USER, anexo.id);
    await assert.rejects(() => anexoService.removerAnexo(ctx.db, USER, anexo.id),
      (e) => e.status === 404 && e.message === 'Anexo não encontrado');
  } finally { await ctx.close(); }
});

// As seis entidades do mapa apontam para tabela que EXISTE — a regua que pega nome imaginado.
// A assercao de DISTINCAO (`new Set(...).size === 6`) e o que impede o teste de passar com um
// mapa que aponte as seis chaves para `materiais_almoxarifado`: so "a tabela existe" seria
// satisfeito por esse mapa errado, e anexar em `inspecao` validaria contra material.
test('as seis entidades do mapa apontam para tabelas distintas que existem no schema', async () => {
  const ctx = await createTestApp();
  try {
    const M = anexoService.ENTIDADES_ANEXO;
    const chaves = Object.keys(M);
    assert.strictEqual(chaves.length, 6, 'o mapa tem seis entidades — uma por pendencia de spec');
    assert.strictEqual(new Set(Object.values(M)).size, 6, 'duas entidades apontam para a MESMA tabela');
    // O mapa e CONTRATO: mudar chave ou tabela tem de passar por aqui, conscientemente.
    assert.deepStrictEqual(M, {
      material: 'materiais_almoxarifado',
      requisicao: 'requisicoes_almoxarifado',
      recebimento: 'recebimentos_material_almoxarifado',
      inspecao: 'inspecoes_recebimento_almoxarifado',
      devolucao: 'devolucoes_material_almoxarifado',
      item_remessa: 'itens_remessa_terceiro_almoxarifado',
    });
    // E o laco em sqlite_master e a guarda contra erro de digitacao no proprio literal acima.
    for (const chave of chaves) {
      const tabela = M[chave];
      const existe = await dbGet(ctx.db,
        `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [tabela]);
      assert.ok(existe, `entidade ${chave} aponta para tabela inexistente: ${tabela}`);
    }
  } finally { await ctx.close(); }
});

(async () => {
  for (const [nome, fn] of testes) {
    try { await fn(); console.log(`  ✓ ${nome}`); passou++; }
    catch (e) { console.log(`  ✗ ${nome}\n    ${e.message}`); falhou++; }
  }
  console.log(`\n${passou} passed, ${falhou} failed`);
  process.exit(falhou ? 1 : 0);
})();
