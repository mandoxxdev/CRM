/**
 * Etapa 263 — a foto do fornecedor na ficha (RN-263.03, RN-263.05).
 * Executar: cd server && node tests/api/comprasFornecedorFoto.api.test.js
 *
 * A foto ja era gravada pela tela do grupo homologado (`POST /api/compras/fornecedores/:id/foto`) e lida pelo
 * `GET /:id`; a ficha do fornecedor passa a mostra-la, troca-la e tira-la. Sem rota nova: tirar e a chave `foto`
 * no `PUT` da ficha — ausente nao mexe (o modal do grupo e a propria ficha, quando ninguem tocou na foto),
 * `null`/'' limpa, outro valor e recusado (a coluna nunca aponta para um nome de arquivo digitado).
 *
 * As rotas de foto nao tinham NENHUM cenario (cabecalho de routes/compras.js). O multer do harness e o stub
 * `dest` (sem filtro de tipo/tamanho): o cenario prova a gravacao e a leitura, nao o filtro — o filtro de
 * producao (`filtroImagemMulter`, index.js:1034) tem prova propria em imagemUploadFiltros.api.test.js.
 *
 * Sem cenario de 403: o `checkModulePermission` do harness e no-op (ver comprasFornecedor.api.test.js).
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/compras/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const COMPRAS = { id: 5, nome: 'Comprador', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'compras@test.com' };
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64',
);

(async () => {
  console.log('\n═══ Fornecedor — foto na ficha (API) ═══\n');
  const ctx = await createTestApp({ user: COMPRAS });
  const { app, db } = ctx;

  await dbRun(db, `CREATE TABLE IF NOT EXISTS grupos_compras (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, numero INTEGER DEFAULT 10, ordem INTEGER DEFAULT 0,
    foto TEXT, ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await dbRun(db, 'INSERT INTO grupos_compras (id, nome, ativo) VALUES (4, ?, 1)', ['Grupo 4']);

  const fotoGravada = async (id) => (await dbGet(db, 'SELECT foto FROM fornecedores WHERE id = ?', [id])).foto;
  const criar = async (razao) => {
    const r = await request(app).post('/api/compras/fornecedores').send({ razao_social: razao, grupo_id: 4 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body.id;
  };
  const enviarFoto = async (id) => {
    const r = await request(app).post(`/api/compras/fornecedores/${id}/foto`).attach('foto', PNG_1PX, 'logo.png');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  // O corpo que a ficha manda quando ninguem tocou na foto: os textos e o grupo, SEM a chave `foto`.
  const corpoDaFicha = (over = {}) => ({ razao_social: 'ACO FORTE LTDA', contato: 'ANA', grupo_id: 4, status: 'ativo', ...over });

  /* ── RN-263.03 ─────────────────────────────────────────────────────── */
  console.log('RN-263.03 — a chave foto no PUT da ficha');
  await test('RN-263.03 (a) PUT sem a chave foto nao mexe na foto gravada', async () => {
    const id = await criar('ACO FORTE LTDA');
    const { foto } = await enviarFoto(id);
    assert.ok(foto, 'a rota devolve o nome gravado');
    const r = await request(app).put(`/api/compras/fornecedores/${id}`).send(corpoDaFicha({ contato: 'BRUNO' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const row = await dbGet(db, 'SELECT contato, foto FROM fornecedores WHERE id = ?', [id]);
    assert.strictEqual(row.contato, 'BRUNO', 'metade positiva: o PUT gravou');
    assert.strictEqual(row.foto, foto, 'a foto continua a mesma');
  });

  await test('RN-263.03 (b) PUT com foto: null tira a foto; com foto: "" tambem', async () => {
    const id = await criar('TIRA FOTO SA');
    await enviarFoto(id);
    const r = await request(app).put(`/api/compras/fornecedores/${id}`).send(corpoDaFicha({ razao_social: 'TIRA FOTO SA', foto: null }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await fotoGravada(id), null, 'null limpa');
    await enviarFoto(id);
    const r2 = await request(app).put(`/api/compras/fornecedores/${id}`).send(corpoDaFicha({ razao_social: 'TIRA FOTO SA', foto: '' }));
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.body));
    assert.strictEqual(await fotoGravada(id), null, "'' limpa");
  });

  await test('RN-263.03 (c) PUT com um nome de arquivo em foto -> 400 "Para trocar a foto, envie a imagem" e nada muda', async () => {
    const id = await criar('NOME DIGITADO ME');
    const { foto } = await enviarFoto(id);
    const r = await request(app).put(`/api/compras/fornecedores/${id}`)
      .send(corpoDaFicha({ razao_social: 'NOME DIGITADO ME', contato: 'CARLA', foto: '../outro_fornecedor.png' }));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Para trocar a foto, envie a imagem');
    const row = await dbGet(db, 'SELECT contato, foto FROM fornecedores WHERE id = ?', [id]);
    assert.strictEqual(row.foto, foto, 'a foto nao mudou');
    assert.strictEqual(row.contato, null, 'nem o resto do corpo foi gravado (CARLA nao entrou)');
  });

  /* ── RN-263.05 (integracao: grupo homologado <-> ficha) ────────────── */
  console.log('RN-263.05 — a mesma foto no grupo homologado e na ficha');
  await test('RN-263.05 a foto enviada pelo grupo aparece no GET da ficha; tirada na ficha, some da lista do grupo', async () => {
    const id = await criar('INTEGRA METAIS LTDA');
    const { foto, url } = await enviarFoto(id);
    assert.strictEqual(url, `/api/uploads/fornecedores/${foto}`);
    const ficha = await request(app).get(`/api/compras/fornecedores/${id}`);
    assert.strictEqual(ficha.status, 200);
    assert.strictEqual(ficha.body.foto, foto, 'a ficha le a foto do grupo');
    // Salvar a ficha sem tocar na foto (sem a chave) e a lista do grupo continua com ela.
    await request(app).put(`/api/compras/fornecedores/${id}`).send(corpoDaFicha({ razao_social: 'INTEGRA METAIS LTDA' }));
    let lista = await request(app).get('/api/compras/grupos/4/fornecedores');
    assert.strictEqual(lista.body.find((f) => f.id === id).foto, foto, 'o grupo continua com a foto');
    // Tirar na ficha tira do grupo.
    await request(app).put(`/api/compras/fornecedores/${id}`).send(corpoDaFicha({ razao_social: 'INTEGRA METAIS LTDA', foto: null }));
    lista = await request(app).get('/api/compras/grupos/4/fornecedores');
    assert.strictEqual(lista.body.find((f) => f.id === id).foto, null, 'o grupo perde a foto');
    const fichaDepois = await request(app).get(`/api/compras/fornecedores/${id}`);
    assert.strictEqual(fichaDepois.body.foto, null);
  });

  await ctx.close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
