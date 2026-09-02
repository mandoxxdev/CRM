/**
 * Anexos de documento — as quatro rotas (Etapa 32, Task 2).
 *
 * Entra PELA ROTA de proposito, e nao pelo servico: o modo de falha que esta etapa mais teme e o
 * da Etapa 25 — servico inteiro verde em unidade e a rota morrendo em runtime porque o diretorio
 * de upload nunca desceu como parametro. Um teste de servico jamais veria isso.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll } = require('../../services/almoxarifado/db');

let passou = 0, falhou = 0;
const testes = [];
function test(nome, fn) { testes.push([nome, fn]); }

const PDF = Buffer.from('%PDF-1.4 conteudo do certificado');

async function comMaterial(ctx) {
  const r = await dbRun(ctx.db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade) VALUES (?,?,?)`,
    ['MAT-1', 'Chapa 3mm', 'KG']);
  return r.lastID;
}
const arquivosEm = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);

// RN-04 — sem a acao, o arquivo NAO chega ao disco (o 403 sai antes do multer)
test('sem anexar_documento: 403 e NENHUM arquivo gravado', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    ctx.setUser({ id: 2, nome: 'Consulta', perfil_almoxarifado: 'CONSULTA' });
    const antes = arquivosEm(ctx.uploadsAnexosDir).length;
    const res = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(materialId))
      .field('tipo', 'FICHA')
      .attach('arquivo', PDF, 'cert.pdf');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.acao, 'anexar_documento');
    assert.strictEqual(arquivosEm(ctx.uploadsAnexosDir).length, antes,
      'o 403 tem de sair ANTES do multer gravar');
  } finally { await ctx.close(); }
});

// [CONTROLE POSITIVO] quem TEM a acao anexa normalmente — sem isto, o cenario acima passaria
// com a rota inexistente (404 tambem nao grava arquivo... mas o status nao seria 403)
test('[CONTROLE POSITIVO] ALMOXARIFE anexa: 201 e UM arquivo a mais no disco', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    ctx.setUser({ id: 3, nome: 'Almoxarife', perfil_almoxarifado: 'ALMOXARIFE' });
    const antes = arquivosEm(ctx.uploadsAnexosDir).length;
    const res = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(materialId))
      .field('tipo', 'FICHA').field('descricao', 'Ficha tecnica')
      .attach('arquivo', PDF, 'cert.pdf');
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.id > 0);
    assert.strictEqual(res.body.nome_original, 'cert.pdf');
    assert.strictEqual(res.body.arquivo_path, undefined, 'o nome no disco nao sai para o client');
    assert.strictEqual(arquivosEm(ctx.uploadsAnexosDir).length, antes + 1);
  } finally { await ctx.close(); }
});

// RN-06 — as saidas != 201 limpam o upload
test('entidade invalida: 400 e o disco volta ao tamanho de antes', async () => {
  const ctx = await createTestApp();
  try {
    const antes = arquivosEm(ctx.uploadsAnexosDir).length;
    const res = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'qualquer_coisa').field('entidade_id', '1').field('tipo', 'X')
      .attach('arquivo', PDF, 'cert.pdf');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'Entidade inválida para anexo');
    assert.strictEqual(arquivosEm(ctx.uploadsAnexosDir).length, antes, 'orfao nao pode ficar');
  } finally { await ctx.close(); }
});

test('entidade_id inexistente: 404 e o disco volta ao tamanho de antes', async () => {
  const ctx = await createTestApp();
  try {
    const antes = arquivosEm(ctx.uploadsAnexosDir).length;
    const res = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', '99999').field('tipo', 'X')
      .attach('arquivo', PDF, 'cert.pdf');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'Registro não encontrado para anexar');
    assert.strictEqual(arquivosEm(ctx.uploadsAnexosDir).length, antes);
  } finally { await ctx.close(); }
});

test('arquivo ausente: 400 com a literal', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    const res = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(materialId)).field('tipo', 'X');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'Arquivo é obrigatório');
  } finally { await ctx.close(); }
});

// RN-06, o ramo que os outros cenarios NAO alcancam: o Zod reprova DEPOIS de o multer ja ter
// gravado. `tipo` vazio passa pelo multer (o arquivo e valido) e morre no safeParse — e este e
// o unico cenario da suite que exercita o `limparUploadOrfaoEm` do ramo do Zod. Sem ele,
// apagar aquela linha deixa a suite inteira verde e vaza orfao a cada formulario mal preenchido.
test('Zod reprova o body: 400 e o disco volta ao tamanho de antes', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    const antes = arquivosEm(ctx.uploadsAnexosDir).length;
    const res = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(materialId))
      .field('tipo', '')
      .attach('arquivo', PDF, 'cert.pdf');
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /^Dados inválidos —/);
    assert.strictEqual(arquivosEm(ctx.uploadsAnexosDir).length, antes, 'orfao do ramo Zod');
  } finally { await ctx.close(); }
});

test('tipo de arquivo recusado: 400 com a literal, e nada no disco', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    const antes = arquivosEm(ctx.uploadsAnexosDir).length;
    const res = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(materialId)).field('tipo', 'X')
      .attach('arquivo', Buffer.from('MZ'), 'virus.exe');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'Anexo deve ser PDF ou imagem');
    assert.strictEqual(arquivosEm(ctx.uploadsAnexosDir).length, antes);
  } finally { await ctx.close(); }
});

// RN-03 — O CENARIO CENTRAL DA ETAPA: o arquivo do anexo NAO e servido estaticamente
test('RN-03: o anexo NAO sai pelo /api/uploads/almoxarifado, e SAI pela rota autenticada', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    const criado = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(materialId)).field('tipo', 'FICHA')
      .attach('arquivo', PDF, 'cert.pdf');
    assert.strictEqual(criado.status, 201);

    const nomeNoDisco = arquivosEm(ctx.uploadsAnexosDir)[0];
    assert.ok(nomeNoDisco, 'o multer gravou o arquivo');

    // A REGUA E A POSICAO RELATIVA, e nao o GET pelo basename. Sem esta assercao o cenario e
    // CEGO justamente para o erro que o design existe para evitar: com o diretorio em
    // `uploads/almoxarifado/anexos/`, o GET abaixo daria 404 POR CAMINHO ERRADO (o arquivo esta
    // um nivel mais fundo) enquanto a URL real `/api/uploads/almoxarifado/anexos/<nome>`
    // responderia 200 sem autenticacao nenhuma — 13 cenarios verdes e o furo entregue.
    const rel = path.relative(ctx.uploadsAlmoxDir, path.join(ctx.uploadsAnexosDir, nomeNoDisco));
    assert.ok(rel.startsWith('..'),
      `o diretorio de anexos esta DENTRO de uploads/almoxarifado (${rel}) — express.static serve subpasta`);

    // Os DOIS mounts de routes/almoxarifado.js:229-230, pelo caminho REAL do arquivo
    for (const prefixo of ['/api/uploads/almoxarifado', '/uploads/almoxarifado']) {
      const url = `${prefixo}/${rel.split(path.sep).join('/')}`;
      const estatico = await request(ctx.app).get(url);
      assert.strictEqual(estatico.status, 404, `anexo publico em ${url}`);
    }

    const baixado = await request(ctx.app).get(`/api/almoxarifado/anexos/${criado.body.id}/arquivo`);
    assert.strictEqual(baixado.status, 200);
    assert.ok(Buffer.from(baixado.body).equals(PDF), 'o conteudo baixado e o mesmo que subiu');
    assert.match(baixado.headers['content-disposition'] || '', /cert\.pdf/);
  } finally { await ctx.close(); }
});

// [CONTROLE POSITIVO da RN-03] a regua sabe reprovar: com o MESMO nome de arquivo dentro do
// diretorio estatico, o GET responde 200. Sem este cenario, "404 no estatico" passaria com o
// arquivo simplesmente nao existindo em lugar nenhum — o teste vazio classico desta base.
test('[CONTROLE POSITIVO] o mesmo arquivo DENTRO de uploads/almoxarifado sai publico (200)', async () => {
  const ctx = await createTestApp();
  try {
    fs.mkdirSync(ctx.uploadsAlmoxDir, { recursive: true });
    fs.writeFileSync(`${ctx.uploadsAlmoxDir}/prova-do-controle.pdf`, PDF);
    const res = await request(ctx.app).get('/api/uploads/almoxarifado/prova-do-controle.pdf');
    assert.strictEqual(res.status, 200,
      'se isto nao der 200, o 404 do cenario anterior nao prova nada');
  } finally { await ctx.close(); }
});

// O titulo promete DUAS coisas, entao o cenario tem de medir as duas. Com dois anexos no mesmo
// material e mais nada, uma `listarAnexos` que ignore o WHERE INTEIRO passa igual, e uma que
// ignore o `ativo = 1` tambem — por isso ha um anexo de OUTRO material e um REMOVIDO.
test('GET /anexos lista so os ativos DA entidade pedida', async () => {
  const ctx = await createTestApp();
  try {
    const materialA = await comMaterial(ctx);
    const rB = await dbRun(ctx.db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, unidade) VALUES (?,?,?)`,
      ['MAT-2', 'Barra 1/2', 'M']);
    const materialB = rB.lastID;

    const anexar = (mid, nome) => request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(mid)).field('tipo', 'FICHA')
      .attach('arquivo', PDF, nome);

    const fica = await anexar(materialA, 'fica.pdf');
    const sai = await anexar(materialA, 'sai.pdf');
    await anexar(materialB, 'outro-material.pdf');
    await request(ctx.app).delete(`/api/almoxarifado/anexos/${sai.body.id}`);

    const res = await request(ctx.app)
      .get(`/api/almoxarifado/anexos?entidade=material&entidade_id=${materialA}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1, 'so o ativo do material A');
    assert.strictEqual(res.body[0].id, fica.body.id);
    assert.strictEqual(res.body[0].arquivo_path, undefined);
    assert.strictEqual(res.body[0].uploaded_by_nome, 'Admin Teste');
  } finally { await ctx.close(); }
});

test('DELETE sem remover_anexo: 403 com a acao no corpo', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    const criado = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(materialId)).field('tipo', 'FICHA')
      .attach('arquivo', PDF, 'cert.pdf');
    ctx.setUser({ id: 9, nome: 'Qualidade', perfil_almoxarifado: 'QUALIDADE' });
    const res = await request(ctx.app).delete(`/api/almoxarifado/anexos/${criado.body.id}`);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.acao, 'remover_anexo');
  } finally { await ctx.close(); }
});

test('download de id inexistente: 404, nao 500 — inclusive id nao numerico', async () => {
  const ctx = await createTestApp();
  try {
    for (const id of ['99999', 'abc']) {
      const res = await request(ctx.app).get(`/api/almoxarifado/anexos/${id}/arquivo`);
      assert.strictEqual(res.status, 404, `id ${id}`);
      assert.strictEqual(res.body.error, 'Anexo não encontrado');
    }
  } finally { await ctx.close(); }
});

test('linha viva com arquivo fora do disco: 404 proprio, nao 500', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    const criado = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(materialId)).field('tipo', 'FICHA')
      .attach('arquivo', PDF, 'cert.pdf');
    for (const f of arquivosEm(ctx.uploadsAnexosDir)) fs.unlinkSync(`${ctx.uploadsAnexosDir}/${f}`);
    const res = await request(ctx.app).get(`/api/almoxarifado/anexos/${criado.body.id}/arquivo`);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'Arquivo do anexo não encontrado');
  } finally { await ctx.close(); }
});

// ── Etapa 32, Task 5 — INTEGRACAO, cruzando os galhos ───────────────────────────────────────
//
// Um cenario so, percorrendo o ciclo inteiro PELA ROTA e com DOIS perfis diferentes: quem anexa e
// QUALIDADE, quem remove e ALMOXARIFE. Ele cruza a Task 1 (o servico e as duas acoes), a Task 2
// (as quatro rotas e a fiacao do 5o parametro) e as regras de perfil — nenhuma suite de unidade
// prova que as tres partes COMPOEM, e a Etapa 25 desta base morreu exatamente ai: 12 cenarios de
// unidade verdes e a feature morta por fiacao.
//
// E ele carrega a UNICA assercao da suite que mede a metade "e no disco" da RN-05. Sem ela,
// alguem que "limpe" o removerAnexo acrescentando um fs.unlinkSync nao derruba NENHUM dos outros
// 13 cenarios: o teste de servico nao toca disco por construcao, e o 404 do "baixar de novo" sai
// pela linha (ativo = 0) ANTES de o handler olhar o arquivo. A decisao que o design mais defende
// (D5) cairia em silencio, e a letra B viraria promessa vazia.
test('[INTEGRACAO] QUALIDADE anexa -> lista -> baixa o conteudo -> ALMOXARIFE remove -> some da lista, FICA no disco', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    // A tabela de inspecao amarra no ITEM do recebimento, nao no material — lido do CREATE TABLE
    // (schema.js:1121), nao imaginado. `recebimento_item_id` e NOT NULL.
    const rec = await dbRun(ctx.db,
      `INSERT INTO inspecoes_recebimento_almoxarifado (recebimento_item_id, conforme, responsavel_nome)
       VALUES (?,?,?)`, [materialId, 1, 'Ana Qualidade']);
    const inspecaoId = rec.lastID;

    // 1) QUALIDADE anexa o certificado. E o perfil que a Etapa 24 criou e que esta etapa passou a
    //    contemplar em `anexar_documento` — quem inspeciona e quem tem o certificado na mao.
    ctx.setUser({ id: 11, nome: 'Ana Qualidade', perfil_almoxarifado: 'QUALIDADE' });
    const criado = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'inspecao').field('entidade_id', String(inspecaoId))
      .field('tipo', 'CERTIFICADO').field('descricao', 'Certificado do fornecedor')
      .attach('arquivo', PDF, 'certificado-fornecedor.pdf');
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    assert.strictEqual(criado.body.uploaded_by_nome, 'Ana Qualidade',
      'o nome de quem anexou e gravado no ato, denormalizado');

    // 2) A lista devolve o anexo, sem o nome do arquivo no disco
    const lista = await request(ctx.app)
      .get(`/api/almoxarifado/anexos?entidade=inspecao&entidade_id=${inspecaoId}`);
    assert.strictEqual(lista.status, 200);
    assert.strictEqual(lista.body.length, 1);
    assert.strictEqual(lista.body[0].arquivo_path, undefined);

    // 3) O download devolve o MESMO conteudo que subiu — nao so um 200
    const baixado = await request(ctx.app).get(`/api/almoxarifado/anexos/${criado.body.id}/arquivo`);
    assert.strictEqual(baixado.status, 200);
    assert.ok(Buffer.from(baixado.body).equals(PDF), 'o conteudo baixado e o mesmo que subiu');

    // 4) QUALIDADE NAO remove — a assimetria da B68, medida e nao suposta
    const negado = await request(ctx.app).delete(`/api/almoxarifado/anexos/${criado.body.id}`);
    assert.strictEqual(negado.status, 403);
    assert.strictEqual(negado.body.acao, 'remover_anexo');

    // 5) ALMOXARIFE remove
    const noDiscoAntes = arquivosEm(ctx.uploadsAnexosDir);
    assert.strictEqual(noDiscoAntes.length, 1);
    ctx.setUser({ id: 12, nome: 'Beto Almoxarife', perfil_almoxarifado: 'ALMOXARIFE' });
    const removido = await request(ctx.app).delete(`/api/almoxarifado/anexos/${criado.body.id}`);
    assert.strictEqual(removido.status, 200);

    // 6) Some da lista...
    const listaDepois = await request(ctx.app)
      .get(`/api/almoxarifado/anexos?entidade=inspecao&entidade_id=${inspecaoId}`);
    assert.strictEqual(listaDepois.body.length, 0);

    // ...mas o ARQUIVO FICA no disco (RN-05 / D5). Esta e a assercao que impede um fs.unlinkSync
    // "de limpeza" de entrar sem ninguem perceber.
    assert.deepStrictEqual(arquivosEm(ctx.uploadsAnexosDir), noDiscoAntes,
      'D5: soft delete NAO apaga o arquivo do disco');

    // 7) E o 404 do download tem de ser o da LINHA, nao o do arquivo ausente. A literal importa:
    //    sem distinguir, este passo passaria igual com o unlink que o passo 6 existe para proibir.
    const depois = await request(ctx.app).get(`/api/almoxarifado/anexos/${criado.body.id}/arquivo`);
    assert.strictEqual(depois.status, 404);
    assert.strictEqual(depois.body.error, 'Anexo não encontrado');

    // 8) A trilha guardou os DOIS atos, com os dois autores e os verbos em caixa alta
    const trilha = await dbAll(ctx.db,
      `SELECT acao, usuario_nome FROM auditoria_log_almoxarifado
       WHERE entidade = 'anexo' ORDER BY id`);
    assert.deepStrictEqual(trilha, [
      { acao: 'ANEXAR', usuario_nome: 'Ana Qualidade' },
      { acao: 'REMOVER_ANEXO', usuario_nome: 'Beto Almoxarife' },
    ]);
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
