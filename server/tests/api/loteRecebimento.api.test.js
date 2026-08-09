const assert = require('assert');
const fs = require('fs');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');
const lotService = require('../../services/almoxarifado/lotService');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };

let seq = 0;
async function novoMaterial(db, { certificado = false } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_certificado)
     VALUES (?,?,'UN',0,1,?)`, [`REC-${seq}`, `Material recebimento ${seq}`, certificado ? 1 : 0]);
  return r.lastID;
}

/** Cria um recebimento pronto para processar, com um item e o lote informado. */
async function recebimentoComItem(db, materialId, item = {}) {
  seq += 1;
  const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
    (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
    VALUES (?, 'EM_ENTRADA_NF', ?, 'Acme Acos', '2026-08-01', '2026-08-02', 1000)`,
    [`REC-N-${seq}`, `NF-${seq}`]);
  await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
    (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote, data_validade_lote, corrida_lote)
    VALUES (?,?,?,?,?,?,?)`, [
    rec.lastID, materialId, item.qtd ?? 10, item.qtd ?? 10,
    item.lote ?? null, item.data_validade ?? null, item.corrida ?? null]);
  return rec.lastID;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('processar recebimento cria o lote com dados da NF', async () => {
    const mat = await novoMaterial(db);
    const recId = await recebimentoComItem(db, mat, { lote: 'NF-LOTE-1', data_validade: '2030-06-30', corrida: 'H-77' });
    await receiptService.processarNota(db, ADMIN, recId, {});

    const lote = await lotService.getLotePorCodigo(db, mat, 'NF-LOTE-1');
    assert.ok(lote, 'o recebimento nao criou o lote');
    assert.strictEqual(lote.data_validade, '2030-06-30');
    assert.strictEqual(lote.corrida, 'H-77');
    assert.strictEqual(lote.fornecedor_nome, 'Acme Acos');
    assert.strictEqual(lote.recebimento_id, recId);
    assert.strictEqual(lote.status, 'ATIVO');
  });

  await test('a entrada de estoque fica vinculada ao lote criado', async () => {
    const mat = await novoMaterial(db);
    const recId = await recebimentoComItem(db, mat, { lote: 'NF-LOTE-2', qtd: 25 });
    await receiptService.processarNota(db, ADMIN, recId, {});

    const lote = await lotService.getLotePorCodigo(db, mat, 'NF-LOTE-2');
    const saldo = await dbGet(db,
      'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id = ?', [mat, lote.id]);
    assert.strictEqual(saldo.quantidade, 25, 'o saldo nao foi creditado no lote');
    const mov = await dbGet(db,
      'SELECT lote_id FROM movimentacoes_almoxarifado WHERE recebimento_id = ? AND tipo = ?', [recId, 'ENTRADA_COMPRA']);
    assert.strictEqual(mov.lote_id, lote.id);
  });

  await test('sem certificado, o lote nasce BLOQUEADO: entra fisicamente mas a saida e recusada', async () => {
    const mat = await novoMaterial(db, { certificado: true });
    const recId = await recebimentoComItem(db, mat, { lote: 'SEM-CERT', qtd: 12 });
    await receiptService.processarNota(db, ADMIN, recId, {});

    const lote = await lotService.getLotePorCodigo(db, mat, 'SEM-CERT');
    assert.strictEqual(lote.status, 'BLOQUEADO', 'lote sem certificado deveria nascer bloqueado');
    assert.match(lote.status_motivo || '', /certificado/i);

    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 12,
      'o material entrou fisicamente — bloquear a ENTRADA foi o erro corrigido na Etapa 5');

    // O nome do teste promete "e a saida e recusada" — sem tentar a saida de verdade, a promessa
    // nao e verificada (achado do review, Task 5 fix round 1). A guarda que recusa e a da Task 4
    // (stockService), aqui so confirmamos que o lote nascido BLOQUEADO por esta task e enxergado
    // por ela.
    await assert.rejects(
      () => stockService.registrarMovimentacao(db, ADMIN, {
        material_id: mat, tipo: 'SAIDA', quantidade: 1, lote_id: lote.id, justificativa: 'teste',
      }),
      /bloquead/i,
      'saida de lote bloqueado por falta de certificado deveria ser recusada',
    );
  });

  await test('anexar o certificado libera o lote', async () => {
    const mat = await novoMaterial(db, { certificado: true });
    const recId = await recebimentoComItem(db, mat, { lote: 'CERT-DEPOIS', qtd: 5 });
    await receiptService.processarNota(db, ADMIN, recId, {});
    const lote = await lotService.getLotePorCodigo(db, mat, 'CERT-DEPOIS');
    assert.strictEqual(lote.status, 'BLOQUEADO');

    const res = await request(app)
      .post(`/api/almoxarifado/lotes/${lote.id}/certificado`)
      .attach('certificado', Buffer.from('%PDF-1.4 certificado de qualidade'), 'cert.pdf');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const liberado = await lotService.getLote(db, lote.id);
    assert.strictEqual(liberado.status, 'ATIVO', 'anexar certificado deveria liberar o lote');
    assert.ok(liberado.certificado_arquivo, 'nome do arquivo nao foi gravado');
  });

  await test('lote REPROVADO continua bloqueado depois de anexar o certificado', async () => {
    // Achado do review (Task 5, fix round 1): so o caminho positivo (BLOQUEADO por certificado ->
    // libera) tinha teste. A regra de negocio que a rota promete no comentario — "lote reprovado no
    // ensaio, ou bloqueado por outro motivo, continua bloqueado" — nao tinha nenhuma cobertura.
    const mat = await novoMaterial(db, { certificado: true });
    const recId = await recebimentoComItem(db, mat, { lote: 'REPROVADO-1', qtd: 3 });
    await receiptService.processarNota(db, ADMIN, recId, {});
    const lote = await lotService.getLotePorCodigo(db, mat, 'REPROVADO-1');
    assert.strictEqual(lote.status, 'BLOQUEADO');

    await lotService.mudarStatusLote(db, ADMIN, lote.id, 'REPROVADO', 'falhou no ensaio de qualidade');

    const res = await request(app)
      .post(`/api/almoxarifado/lotes/${lote.id}/certificado`)
      .attach('certificado', Buffer.from('%PDF-1.4 certificado de qualidade'), 'cert.pdf');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'REPROVADO',
      'anexar certificado nao pode liberar um lote reprovado no ensaio');

    const depois = await lotService.getLote(db, lote.id);
    assert.strictEqual(depois.status, 'REPROVADO', 'o status no banco mudou apesar da reprovacao');
    assert.ok(depois.certificado_arquivo, 'o arquivo em si deveria ser gravado normalmente');
  });

  await test('material sem controle_certificado nasce ATIVO mesmo sem anexo', async () => {
    const mat = await novoMaterial(db, { certificado: false });
    const recId = await recebimentoComItem(db, mat, { lote: 'SEM-CTRL' });
    await receiptService.processarNota(db, ADMIN, recId, {});
    const lote = await lotService.getLotePorCodigo(db, mat, 'SEM-CTRL');
    assert.strictEqual(lote.status, 'ATIVO');
  });

  await test('item sem lote continua processando (material nao controlado)', async () => {
    const mat = await novoMaterial(db);
    const recId = await recebimentoComItem(db, mat, { lote: null, qtd: 7 });
    await receiptService.processarNota(db, ADMIN, recId, {});
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 7);
  });

  await test('upload de certificado sem permissao nao grava arquivo', async () => {
    const mat = await novoMaterial(db, { certificado: true });
    const recId = await recebimentoComItem(db, mat, { lote: 'PERM-1' });
    await receiptService.processarNota(db, ADMIN, recId, {});
    const lote = await lotService.getLotePorCodigo(db, mat, 'PERM-1');

    const ctx = await createTestApp({ user: { id: 9, nome: 'Producao', perfil_almoxarifado: 'PRODUCAO' } });
    // Achado do review (Task 5, fix round 1): o nome do teste promete "nao grava arquivo", mas so
    // conferia o status HTTP. Com requirePermission DEPOIS do multer, o arquivo teria sido gravado
    // em disco e o handler ainda devolveria 403 (o multer.single() so chama next(), quem responde e
    // o proximo middleware) — o teste continuava verde com a ordem errada. Mesmo padrao ja usado em
    // permissoesRotas.api.test.js:contarArquivosUpload.
    const contarArquivos = () => {
      try { return fs.readdirSync(ctx.uploadsAlmoxDir).length; } catch (e) { return 0; }
    };
    const arquivosAntes = contarArquivos();

    const res = await request(ctx.app)
      .post(`/api/almoxarifado/lotes/${lote.id}/certificado`)
      .attach('certificado', Buffer.from('%PDF-1.4'), 'cert.pdf');
    assert.strictEqual(res.status, 403, 'perfil PRODUCAO nao pode anexar certificado');
    assert.strictEqual(contarArquivos(), arquivosAntes,
      'multer gravou o certificado antes do 403 — requirePermission deve vir ANTES do upload');

    const inalterado = await lotService.getLote(db, lote.id);
    assert.strictEqual(inalterado.certificado_arquivo, null, 'certificado_arquivo gravado apesar do 403');
    await ctx.close();
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
