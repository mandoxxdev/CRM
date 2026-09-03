/**
 * URL assinada dos uploads legados — Etapa 33, Task 1 (furo C42).
 *
 * Entra pelos DOIS mounts de propósito. Até a Etapa 32 este diretório era servido publicamente por
 * `/api/uploads/almoxarifado` E `/uploads/almoxarifado`, e proteger só um deixaria o outro aberto —
 * a sabotagem 4 do plano existe exatamente para isso.
 *
 * Os cenários 8, 9 e 10 nasceram da revisão do plano: os dois primeiros são caminhos que faziam a
 * rota responder **500** onde o contrato promete 404, e o terceiro é o `next()` do `express.static`
 * caindo no catch-all do SPA em produção.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');

let passou = 0, falhou = 0;
const testes = [];
function test(nome, fn) { testes.push([nome, fn]); }

const CONTEUDO_A = Buffer.from('PNG-FALSO-CONTEUDO-A');
const CONTEUDO_B = Buffer.from('PNG-FALSO-CONTEUDO-B');
const MOUNTS = ['/api/uploads/almoxarifado', '/uploads/almoxarifado'];

function gravar(ctx, nome, conteudo) {
  fs.mkdirSync(ctx.uploadsAlmoxDir, { recursive: true });
  fs.writeFileSync(path.join(ctx.uploadsAlmoxDir, nome), conteudo);
  return nome;
}
/** A URL que o SERVIDOR minaria — o teste não reimplementa o HMAC. */
const assinada = (ctx, nome) => ctx.assinadorUpload.assinar(nome);
/** Troca o prefixo `/api/uploads/almoxarifado` por `/uploads/almoxarifado`, preservando a query. */
const noMount = (url, mount) => url.replace('/api/uploads/almoxarifado', mount);

// RN-01 — sem assinatura não sai, nos DOIS mounts; com assinatura sai, e é o conteúdo certo.
test('RN-01: sem assinatura 404 nos dois mounts; com assinatura 200 e o conteudo certo', async () => {
  const ctx = await createTestApp();
  try {
    const nome = gravar(ctx, 'material-1.png', CONTEUDO_A);
    const url = assinada(ctx, nome);

    for (const mount of MOUNTS) {
      const cru = await request(ctx.app).get(`${mount}/${nome}`);
      assert.strictEqual(cru.status, 404, `${mount} sem assinatura devolveu ${cru.status}`);

      // Metade positiva: sem ela o 404 acima passaria com o arquivo nao existindo em lugar nenhum.
      const ok = await request(ctx.app).get(noMount(url, mount));
      assert.strictEqual(ok.status, 200, `${mount} com assinatura devolveu ${ok.status}`);
      // `res.body` e Buffer: o superagent NAO parseia image/*, entao `res.text` viria undefined e
      // uma assercao sobre ele reprovaria com a feature funcionando.
      assert.ok(Buffer.from(ok.body).equals(CONTEUDO_A), `${mount} devolveu conteudo diferente`);
    }
  } finally { await ctx.close(); }
});

// RN-02 — a assinatura vale para UM arquivo. Sem o nome no HMAC, a de `a` serviria em `b`.
test('RN-02: assinatura de um arquivo NAO serve para outro', async () => {
  const ctx = await createTestApp();
  try {
    gravar(ctx, 'material-a.png', CONTEUDO_A);
    gravar(ctx, 'assinatura-b.png', CONTEUDO_B);

    const urlA = assinada(ctx, 'material-a.png');
    const query = urlA.slice(urlA.indexOf('?'));

    const roubada = await request(ctx.app).get(`/api/uploads/almoxarifado/assinatura-b.png${query}`);
    assert.strictEqual(roubada.status, 404, 'assinatura de outro arquivo nao pode servir');

    // Controle: a assinatura PROPRIA de b funciona em b — senao o 404 acima nao prova nada.
    const propria = await request(ctx.app).get(assinada(ctx, 'assinatura-b.png'));
    assert.strictEqual(propria.status, 200);
    assert.ok(Buffer.from(propria.body).equals(CONTEUDO_B));
  } finally { await ctx.close(); }
});

// RN-03 — expira.
//
// ⚠️ Este é o ÚNICO ponto em que o teste calcula o HMAC por conta própria, e a duplicação é
// deliberada: `assinar()` só emite `exp` no futuro, então não há como pedir ao assinador uma URL
// **corretamente assinada e vencida** — que é exatamente o caso que a RN-03 precisa provar.
// A primeira versão deste cenário usava um `sig` inválido e ficava VERDE com a checagem de `exp`
// removida (medido pela sabotagem 2): o 404 vinha da assinatura errada, não do tempo. Teste vazio
// clássico desta base.
test('RN-03: assinatura CORRETA mas vencida da 404; a mesma no futuro da 200', async () => {
  const ctx = await createTestApp();
  try {
    const crypto = require('crypto');
    const nome = gravar(ctx, 'material-exp.png', CONTEUDO_A);
    const sigDe = (arquivo, exp) => crypto
      .createHmac('sha256', process.env.JWT_SECRET)
      .update(`${arquivo}:${String(exp)}`).digest('hex').slice(0, 32);

    const passado = Math.floor(Date.now() / 1000) - 60;
    const futuro = Math.floor(Date.now() / 1000) + 600;

    // Controle da própria fixture: a assinatura vencida É válida como HMAC — o que reprova é o
    // tempo. Sem esta asserção, um erro no cálculo faria o cenário passar pelo motivo errado.
    assert.strictEqual(ctx.assinadorUpload.verificar(nome, futuro, sigDe(nome, futuro)), true,
      'o calculo do teste tem de bater com o do servidor');

    const vencida = await request(ctx.app)
      .get(`/api/uploads/almoxarifado/${nome}?exp=${passado}&sig=${sigDe(nome, passado)}`);
    assert.strictEqual(vencida.status, 404, 'assinatura correta mas vencida tem de ser recusada');

    const viva = await request(ctx.app)
      .get(`/api/uploads/almoxarifado/${nome}?exp=${futuro}&sig=${sigDe(nome, futuro)}`);
    assert.strictEqual(viva.status, 200, 'a MESMA assinatura, com exp no futuro, tem de sair');
  } finally { await ctx.close(); }
});

// RN-04 — assinatura adulterada.
test('RN-04: um caractere trocado no sig derruba', async () => {
  const ctx = await createTestApp();
  try {
    const nome = gravar(ctx, 'material-sig.png', CONTEUDO_A);
    const url = assinada(ctx, nome);
    // Troca ASCII de propósito: o caractere multibyte e o cenario 8, e ele testa outra coisa.
    const adulterada = url.replace(/sig=([0-9a-f])/, (m, c) => `sig=${c === 'a' ? 'b' : 'a'}`);
    assert.notStrictEqual(adulterada, url, 'a troca precisa ter acontecido');

    const res = await request(ctx.app).get(adulterada);
    assert.strictEqual(res.status, 404);
  } finally { await ctx.close(); }
});

// RN-07 — toda falha e 404, e o corpo nao conta nada.
test('RN-07: nenhuma falha responde 401/403, e o corpo nao revela nada', async () => {
  const ctx = await createTestApp();
  try {
    const nome = gravar(ctx, 'assinatura-sigilosa.png', CONTEUDO_A);
    const casos = [
      `/api/uploads/almoxarifado/${nome}`,
      `/api/uploads/almoxarifado/${nome}?exp=1&sig=${'a'.repeat(32)}`,
      `/api/uploads/almoxarifado/${nome}?sig=${'a'.repeat(32)}`,
      `/api/uploads/almoxarifado/${nome}?exp=99999999999`,
    ];
    for (const url of casos) {
      const res = await request(ctx.app).get(url);
      assert.strictEqual(res.status, 404, `${url} devolveu ${res.status}`);
      const corpo = String(res.text || '');
      assert.ok(!corpo.includes(nome), `o corpo nao pode citar o arquivo: ${corpo}`);
      assert.ok(!/assinatura|sig|hmac/i.test(corpo), `o corpo nao pode explicar a regua: ${corpo}`);
    }
  } finally { await ctx.close(); }
});

// Travessia — o middleware confere o NOME pedido, e nome com separador nao passa.
test('travessia: nome com barra ou subpasta nao passa, mesmo com query valida', async () => {
  const ctx = await createTestApp();
  try {
    gravar(ctx, 'material-1.png', CONTEUDO_A);
    const query = assinada(ctx, 'material-1.png').slice(assinada(ctx, 'material-1.png').indexOf('?'));
    for (const caminho of [
      '../almoxarifado-anexos/x.pdf',
      '..%2falmoxarifado-anexos%2fx.pdf',
      'sub/material-1.png',
    ]) {
      const res = await request(ctx.app).get(`/api/uploads/almoxarifado/${caminho}${query}`);
      assert.strictEqual(res.status, 404, `${caminho} devolveu ${res.status}`);
    }
  } finally { await ctx.close(); }
});

// Os anexos da Etapa 32 continuam intactos — a regressao que esta etapa mais pode causar sem ver.
test('os anexos da Etapa 32 continuam funcionando (rota autenticada propria)', async () => {
  const ctx = await createTestApp();
  try {
    const mat = await dbRun(ctx.db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, unidade) VALUES (?,?,?)`,
      ['MAT-1', 'Chapa', 'KG']);
    const criado = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(mat.lastID)).field('tipo', 'FICHA')
      .attach('arquivo', Buffer.from('%PDF-1.4 x'), 'cert.pdf');
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));

    const baixado = await request(ctx.app).get(`/api/almoxarifado/anexos/${criado.body.id}/arquivo`);
    assert.strictEqual(baixado.status, 200, 'o anexo NAO pode ter sido afetado por esta etapa');
  } finally { await ctx.close(); }
});

// Achado 1 da revisao do plano: sig com 32 CARACTERES multibyte tem 64 BYTES e fazia o
// timingSafeEqual lancar RangeError -> 500.
test('sig com 32 caracteres MULTIBYTE: 404, nunca 500', async () => {
  const ctx = await createTestApp();
  try {
    const nome = gravar(ctx, 'material-mb.png', CONTEUDO_A);
    const sig = 'á'.repeat(32);
    assert.strictEqual(sig.length, 32);
    assert.strictEqual(Buffer.from(sig, 'utf8').length, 64, 'o cenario precisa de 64 bytes');

    const res = await request(ctx.app)
      .get(`/api/uploads/almoxarifado/${nome}?exp=99999999999&sig=${encodeURIComponent(sig)}`);
    assert.strictEqual(res.status, 404, `devolveu ${res.status} — RangeError virando 500?`);
  } finally { await ctx.close(); }
});

// Achado 2: `%` solto faz decodeURIComponent lancar URIError -> 500.
test('nome com % solto: 404, nunca 500', async () => {
  const ctx = await createTestApp();
  try {
    const res = await request(ctx.app)
      .get(`/api/uploads/almoxarifado/foo%.png?exp=99999999999&sig=${'a'.repeat(32)}`);
    assert.strictEqual(res.status, 404, `devolveu ${res.status} — URIError virando 500?`);
  } finally { await ctx.close(); }
});

// Achado 6: `express.static` chama next() para arquivo inexistente; em producao isso desce ate o
// catch-all do SPA e o <img> recebe 200 com HTML.
test('assinatura VALIDA para nome inexistente: 404, e nunca HTML', async () => {
  const ctx = await createTestApp();
  try {
    const res = await request(ctx.app).get(assinada(ctx, 'material-que-nao-existe.png'));
    assert.strictEqual(res.status, 404, `devolveu ${res.status}`);
    assert.ok(!/text\/html/.test(res.headers['content-type'] || ''),
      `content-type nao pode ser HTML: ${res.headers['content-type']}`);
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
