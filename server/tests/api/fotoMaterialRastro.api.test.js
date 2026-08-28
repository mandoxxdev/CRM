/**
 * Etapa 20, Task 1 (C1 + C2) — `POST /materiais/:id/foto`: para de mentir sucesso, para de
 * deixar orfao, para de correr com o UPDATE e passa a deixar rastro.
 *
 * O que cada cenario prova (e por que existe):
 *
 * - RN-01: material INEXISTENTE respondia **200** com o nome do arquivo — o `db.run` nunca
 *   consultava `this.changes`. A tela mostrava "foto salva" para um id que nao existe. Agora:
 *   404 `Material não encontrado`. A assercao de peso e a de DISCO: o multer ja gravou o
 *   arquivo quando o handler roda, entao o 404 sem limpeza deixaria lixo permanente em
 *   uploads/almoxarifado sem nada no banco apontando pra ele (contagem antes/depois, molde
 *   `permissoesRotas.api.test.js:535-549`, `uploadsAlmoxDir` vindo do harness).
 *
 * - RN-02, ramo "erro de banco": FICA SEM TESTE, DE PROPOSITO. `routes/almoxarifado.js:35`
 *   desestrutura `const { dbRun, dbGet, dbAll }` — o binding e resolvido no require e cacheado,
 *   entao um stub no modulo `db` nao alcanca o call site (mesma armadilha ja documentada em
 *   `auditoriaConfiguracoes.api.test.js:456-461`). O codigo do 500 + limpeza existe e esta
 *   escrito; o que nao existe e uma forma honesta de exercita-lo daqui. Declarado em vez de
 *   coberto por um teste que passaria sem provar nada.
 *
 * - RN-02, ramo 403: nao ha arquivo para limpar — `requirePermission` roda ANTES do multer,
 *   entao nada foi gravado. Ja provado por `permissoesRotas.api.test.js:535-549`, que serve
 *   de controle desta suite: se a ordem dos middlewares regredir, aquele arquivo cai.
 *
 * - RN-03: a foto anterior era apagada dentro do callback de um `db.get` fire-and-forget que
 *   corria EM PARALELO com o UPDATE, e com `fs.unlinkSync` SEM try/catch — uma falha ali
 *   (arquivo virou diretorio, permissao, FS cheio) subia como excecao nao capturada dentro de
 *   um callback do sqlite3, ou seja, derrubava o processo. Agora: unlink DEPOIS do UPDATE, em
 *   try/catch (molde da rota irma de certificado, `almoxarifado.js:691-698`).
 *
 * - RN-04: trocar a foto nao deixava rastro nenhum — a Etapa 19 instrumentou os 12 cadastros e
 *   esta rota ficou fora. Agora `material`/`ATUALIZACAO` com o de/para do ARQUIVO.
 *
 * - Auditoria e best-effort: o UPDATE ja foi commitado quando o log roda; falhar a request por
 *   causa do log devolveria erro para uma escrita que deu certo. Stub que LANCA, com a flag
 *   `chamado` junto — sem ela, uma rota que simplesmente nao auditasse passaria verde.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbAll, dbGet, dbRun } = require('../../services/almoxarifado/db');
const auditModule = require('../../services/almoxarifado/audit');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// PNG 1x1 real — o fileFilter do `uploadAlmox` so aceita image/*.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

const ID_INEXISTENTE = 987654;
let seq = 0;

(async () => {
  // role 'admin' => ADMINISTRADOR em getPerfilFromUser (permissions.js:93), que esta em
  // `editar_material`. Nao e o caso de canConfigureAlmox (que exigiria is_superadmin) — esta
  // rota e gateada por requirePermission, nao por denyUnlessAlmoxAdmin.
  const { app, db, close, uploadsAlmoxDir } = await createTestApp({
    user: { id: 7, nome: 'Admin Foto', role: 'admin', email: 'foto@test.com' },
  });

  const contarArquivosUpload = () => {
    try { return fs.readdirSync(uploadsAlmoxDir).length; } catch (e) { return 0; }
  };
  const listarArquivosUpload = () => {
    try { return fs.readdirSync(uploadsAlmoxDir).sort(); } catch (e) { return []; }
  };

  const criarMaterial = async () => {
    seq += 1;
    const r = await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, unidade, ativo)
       VALUES (?,?,0,'UN',1)`,
      [`FOTO-MAT-${seq}`, `Material Foto ${seq}`]);
    return r.lastID;
  };

  const fotoDe = (id) => dbGet(db, 'SELECT foto FROM materiais_almoxarifado WHERE id = ?', [id])
    .then((r) => (r ? r.foto : undefined));

  const linhasFoto = (materialId) => dbAll(db,
    `SELECT * FROM auditoria_log_almoxarifado
      WHERE entidade = 'material' AND acao = 'ATUALIZACAO' AND entidade_id = ?
      ORDER BY id`, [materialId]);
  const totalAuditoria = async () =>
    (await dbGet(db, 'SELECT COUNT(*) as c FROM auditoria_log_almoxarifado')).c;

  const enviarFoto = (id, nomeArquivo) => request(app)
    .post(`/api/almoxarifado/materiais/${id}/foto`)
    .attach('foto', PNG_1x1, nomeArquivo);

  // ══════════════════ RN-01 — material inexistente falha e nao deixa orfao ══════════════════

  await test('[RN-01] foto em material inexistente -> 404 "Material não encontrado"', async () => {
    const res = await enviarFoto(ID_INEXISTENTE, 'orfa.png');
    assert.strictEqual(res.status, 404, `esperava 404, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, 'Material não encontrado', JSON.stringify(res.body));
    assert.strictEqual(res.body.foto, undefined, 'resposta de erro nao pode devolver nome de arquivo');
  });

  await test('[RN-01/RN-02] o 404 nao deixa arquivo no disco', async () => {
    const antes = contarArquivosUpload();
    const res = await enviarFoto(ID_INEXISTENTE, 'orfa-2.png');
    assert.strictEqual(res.status, 404, `esperava 404, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(contarArquivosUpload(), antes,
      'o multer gravou o arquivo e o 404 nao limpou — orfao em uploads/almoxarifado');
  });

  await test('[RN-01] o 404 nao deixa linha de auditoria (ato que nao aconteceu)', async () => {
    const antes = await totalAuditoria();
    await enviarFoto(ID_INEXISTENTE, 'orfa-3.png');
    assert.strictEqual(await totalAuditoria(), antes,
      'auditou uma troca de foto de um material que nao existe');
  });

  // ══════════════════ Primeira foto — 200, coluna, disco e resposta ══════════════════

  await test('[base] primeira foto -> 200, coluna gravada, arquivo em disco, resposta inalterada', async () => {
    const matId = await criarMaterial();
    const antes = contarArquivosUpload();

    const res = await enviarFoto(matId, 'primeira.png');
    assert.strictEqual(res.status, 200, `esperava 200, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.foto, 'resposta sem `foto`');
    assert.strictEqual(res.body.foto_url, `/api/uploads/almoxarifado/${res.body.foto}`,
      `foto_url fora do contrato: ${JSON.stringify(res.body)}`);
    assert.deepStrictEqual(Object.keys(res.body).sort(), ['foto', 'foto_url'],
      `a forma da resposta mudou: ${JSON.stringify(res.body)}`);

    assert.strictEqual(await fotoDe(matId), res.body.foto, 'coluna nao aponta para o arquivo novo');
    assert.strictEqual(contarArquivosUpload(), antes + 1, 'o arquivo novo nao ficou no disco');
    assert.ok(fs.existsSync(path.join(uploadsAlmoxDir, res.body.foto)), 'arquivo novo ausente');
  });

  await test('[RN-04] primeira foto audita com `dados_anteriores.foto = null`', async () => {
    const matId = await criarMaterial();
    const res = await enviarFoto(matId, 'audita-primeira.png');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const linhas = await linhasFoto(matId);
    assert.strictEqual(linhas.length, 1, `esperava 1 linha material/ATUALIZACAO, veio ${linhas.length}`);
    const anteriores = JSON.parse(linhas[0].dados_anteriores);
    const novos = JSON.parse(linhas[0].dados_novos);
    assert.strictEqual(anteriores.foto, null, `dados_anteriores.foto deveria ser null: ${linhas[0].dados_anteriores}`);
    assert.strictEqual(novos.foto, res.body.foto, `dados_novos.foto errado: ${linhas[0].dados_novos}`);
    assert.strictEqual(novos.codigo, `FOTO-MAT-${seq}`, JSON.stringify(novos));
    assert.strictEqual(novos.nome, `Material Foto ${seq}`, JSON.stringify(novos));
    assert.strictEqual(linhas[0].usuario_id, 7, 'usuario_id do ato nao foi registrado');
  });

  // ══════════════════ RN-03 — trocar a foto ══════════════════

  await test('[RN-03] trocar a foto: a antiga some do disco, a nova fica, a coluna aponta para a nova', async () => {
    const matId = await criarMaterial();

    const primeira = await enviarFoto(matId, 'antiga.png');
    assert.strictEqual(primeira.status, 200, JSON.stringify(primeira.body));
    const arquivoAntigo = primeira.body.foto;
    const depoisDaPrimeira = contarArquivosUpload();

    const segunda = await enviarFoto(matId, 'nova.png');
    assert.strictEqual(segunda.status, 200, JSON.stringify(segunda.body));
    const arquivoNovo = segunda.body.foto;
    assert.notStrictEqual(arquivoNovo, arquivoAntigo, 'o multer reusou o nome — cenario invalido');

    assert.strictEqual(await fotoDe(matId), arquivoNovo, 'coluna nao aponta para a foto nova');
    assert.ok(fs.existsSync(path.join(uploadsAlmoxDir, arquivoNovo)), 'a foto NOVA sumiu do disco');
    assert.ok(!fs.existsSync(path.join(uploadsAlmoxDir, arquivoAntigo)),
      'a foto ANTIGA continua no disco — orfa, sem nada apontando pra ela');
    assert.strictEqual(contarArquivosUpload(), depoisDaPrimeira,
      `trocar a foto nao pode aumentar o numero de arquivos: ${listarArquivosUpload().join(', ')}`);
  });

  await test('[RN-04] trocar a foto audita o de/para do ARQUIVO', async () => {
    const matId = await criarMaterial();
    const codigo = `FOTO-MAT-${seq}`;
    const nome = `Material Foto ${seq}`;

    const primeira = await enviarFoto(matId, 'depara-1.png');
    assert.strictEqual(primeira.status, 200, JSON.stringify(primeira.body));
    const segunda = await enviarFoto(matId, 'depara-2.png');
    assert.strictEqual(segunda.status, 200, JSON.stringify(segunda.body));

    const linhas = await linhasFoto(matId);
    assert.strictEqual(linhas.length, 2, `esperava 2 linhas material/ATUALIZACAO, veio ${linhas.length}`);
    const anteriores = JSON.parse(linhas[1].dados_anteriores);
    const novos = JSON.parse(linhas[1].dados_novos);
    assert.strictEqual(anteriores.foto, primeira.body.foto,
      `de/para errado — dados_anteriores.foto deveria ser a foto antiga: ${linhas[1].dados_anteriores}`);
    assert.strictEqual(novos.foto, segunda.body.foto, `dados_novos.foto errado: ${linhas[1].dados_novos}`);
    assert.strictEqual(novos.codigo, codigo, JSON.stringify(novos));
    assert.strictEqual(novos.nome, nome, JSON.stringify(novos));
  });

  // ══════════════════ Regressao: 400 sem arquivo ══════════════════

  await test('[regressao] sem arquivo -> 400 "Nenhuma foto enviada", nada gravado', async () => {
    const matId = await criarMaterial();
    const antes = contarArquivosUpload();
    const res = await request(app).post(`/api/almoxarifado/materiais/${matId}/foto`);
    assert.strictEqual(res.status, 400, `esperava 400, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, 'Nenhuma foto enviada', JSON.stringify(res.body));
    assert.strictEqual(await fotoDe(matId), null, 'coluna foto mexida apesar do 400');
    assert.strictEqual(contarArquivosUpload(), antes, 'arquivo gravado apesar do 400');
  });

  // ══════════════════ Auditoria e best-effort ══════════════════

  await test('[RN-04] auditoria que LANCA nao derruba a troca de foto', async () => {
    const matId = await criarMaterial();
    const original = auditModule.registrarAuditoria;
    let chamado = false;
    auditModule.registrarAuditoria = async () => { chamado = true; throw new Error('auditoria caiu'); };
    try {
      const res = await enviarFoto(matId, 'auditoria-quebrada.png');
      assert.strictEqual(res.status, 200, `esperava 200 mesmo com auditoria quebrada, veio ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(chamado, 'a rota nao chamou audit.registrarAuditoria — o teste seria vazio');
      assert.strictEqual(await fotoDe(matId), res.body.foto, 'a foto nao foi gravada');
      assert.ok(fs.existsSync(path.join(uploadsAlmoxDir, res.body.foto)), 'o arquivo novo sumiu');
    } finally {
      auditModule.registrarAuditoria = original;
    }
  });

  // ══════════════════ RN-03 (try/catch) — POR ULTIMO, DE PROPOSITO ══════════════════
  // Na versao ANTIGA da rota o `fs.unlinkSync` da foto anterior rodava SEM try/catch dentro do
  // callback de um `db.get` do sqlite3 — uma excecao ali nao tem catch nenhum acima e derruba o
  // PROCESSO (uncaughtException), abortando o restante do arquivo. Por isso este cenario e o
  // ULTIMO: no vermelho ele leva o runner junto, e os cenarios acima ja terao reportado.
  await test('[RN-03] falha ao apagar a foto anterior nao derruba a resposta (try/catch)', async () => {
    const matId = await criarMaterial();
    // Foto "anterior" que EXISTE no disco mas nao pode ser apagada: um diretorio.
    // fs.existsSync -> true, fs.unlinkSync -> EISDIR/EPERM.
    const nomeDir = `material-diretorio-${Date.now()}`;
    const caminhoDir = path.join(uploadsAlmoxDir, nomeDir);
    fs.mkdirSync(caminhoDir);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET foto = ? WHERE id = ?', [nomeDir, matId]);

    try {
      const res = await enviarFoto(matId, 'apos-falha.png');
      assert.strictEqual(res.status, 200, `esperava 200 mesmo com unlink falhando, veio ${res.status}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(await fotoDe(matId), res.body.foto,
        'a coluna tem de apontar para a foto NOVA — o unlink da anterior e best-effort');
      assert.ok(fs.existsSync(path.join(uploadsAlmoxDir, res.body.foto)), 'a foto nova sumiu');
    } finally {
      try { fs.rmSync(caminhoDir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
