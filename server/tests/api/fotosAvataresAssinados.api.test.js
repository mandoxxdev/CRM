/**
 * Etapa 82 / T3 — RN-82.02/04/05: fotos da proposta e avatares so com URL assinada.
 *
 * Tres partes:
 *  1. MODULO `services/uploadsAssinadosCrm.js` montado como no index.js (middleware -> static com
 *     cabecalhosUploadSeguro -> 404 final), com supertest e pasta temporaria: URL devolvida -> 200
 *     image/png; caminho cru, sig adulterado, assinatura de uma pasta usada na outra, nome
 *     inexistente com assinatura valida -> 404; validade 12 h (fotos) e 24 h (avatares);
 *     `foto_src` null sem foto; `comUrlFotoProposta` acrescenta `url` relativo.
 *  2. TEMPLATE V2 de verdade: preview (forPdfServer=false) com o assinador injetado sai com a URL
 *     assinada e sem `?t=`; sem o assinador e no PDF, base64 (nunca URL crua).
 *  3. FIACAO no index.js (nao esta no harness; faz listen no import): as duas montagens com
 *     middleware + static + 404 final, o assinador injetado SO na chamada do preview, `foto_src`
 *     nos 3 lugares, `url` nas 4 rotas de fotos, e nenhuma URL crua montada pelo nome.
 *
 * Executar: cd server && node tests/api/fotosAvataresAssinados.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// O template puxa config/paths, que cria as pastas de upload em CRM_DATA_DIR — fora do projeto.
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'c82b-fotos-'));
process.env.CRM_DATA_DIR = DATA;

const express = require('express');
const request = require('supertest');
const { criarAssinadoresCrm, PASTAS } = require('../../services/uploadsAssinadosCrm');
const { cabecalhosUploadSeguro } = require('../../services/almoxarifado/urlUpload');

let passou = 0; let falhou = 0;
const testes = [];
function test(nome, fn) { testes.push([nome, fn]); }

const SEGREDO = 'segredo-teste-c82b';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const SERVER = path.join(__dirname, '..', '..');
const fonteIndex = fs.readFileSync(path.join(SERVER, 'index.js'), 'utf8');

const dirFotos = path.join(DATA, 'uploads', 'proposta-fotos');
const dirAvatares = path.join(DATA, 'uploads', 'avatares');
fs.mkdirSync(dirFotos, { recursive: true });
fs.mkdirSync(dirAvatares, { recursive: true });
fs.writeFileSync(path.join(dirFotos, 'foto_1_equip.png'), PNG);
fs.writeFileSync(path.join(dirAvatares, 'avatar_7_1.png'), PNG);

const ass = criarAssinadoresCrm(SEGREDO);

/** Mesmo encadeamento do index.js (Etapa 82). */
function appComMontagens() {
  const app = express();
  app.use('/api/uploads/proposta-fotos', ass.fotoProposta.middleware, express.static(dirFotos, {
    index: false, dotfiles: 'deny', setHeaders: cabecalhosUploadSeguro,
  }));
  app.use('/api/uploads/proposta-fotos', (req, res) => res.status(404).end());
  app.use('/api/uploads/avatares', ass.avatares.middleware, express.static(dirAvatares, {
    index: false, dotfiles: 'deny', setHeaders: cabecalhosUploadSeguro,
  }));
  app.use('/api/uploads/avatares', (req, res) => res.status(404).end());
  // Quem estiver depois (o SPA, outra rota) nao pode receber a requisicao.
  app.use((req, res) => res.status(299).send('desceu'));
  return app;
}
const app = appComMontagens();

const exp = (url) => Number(new URL(url, 'http://x').searchParams.get('exp'));
const agora = () => Math.floor(Date.now() / 1000);

// ── 1. modulo + montagem ────────────────────────────────────────────────────────────────

test('foto da proposta: URL relativa assinada -> 200 image/png com nosniff; crua -> 404', async () => {
  const url = ass.assinarFotoProposta('foto_1_equip.png');
  assert.match(url, /^\/api\/uploads\/proposta-fotos\/foto_1_equip\.png\?exp=\d+&sig=[0-9a-f]{32}$/);
  const ok = await request(app).get(url);
  assert.strictEqual(ok.status, 200);
  assert.match(ok.headers['content-type'], /^image\/png/);
  assert.strictEqual(ok.headers['x-content-type-options'], 'nosniff');
  assert.ok(Buffer.from(ok.body).equals(PNG));
  assert.strictEqual((await request(app).get('/api/uploads/proposta-fotos/foto_1_equip.png')).status, 404);
});

test('avatar: foto_src -> 200; cru -> 404; null/vazio -> null', async () => {
  const src = ass.fotoSrcAvatar('avatar_7_1.png');
  assert.match(src, /^\/api\/uploads\/avatares\/avatar_7_1\.png\?exp=\d+&sig=[0-9a-f]{32}$/);
  assert.strictEqual((await request(app).get(src)).status, 200);
  assert.strictEqual((await request(app).get('/api/uploads/avatares/avatar_7_1.png')).status, 404);
  for (const v of [null, undefined, '', '   ']) assert.strictEqual(ass.fotoSrcAvatar(v), null, String(v));
});

test('assinatura de uma pasta NAO vale na outra (dominio na chave), nem com o mesmo nome', async () => {
  fs.writeFileSync(path.join(dirAvatares, 'mesmo.png'), PNG);
  fs.writeFileSync(path.join(dirFotos, 'mesmo.png'), PNG);
  const daFoto = ass.assinarFotoProposta('mesmo.png');
  const noAvatar = daFoto.replace('/api/uploads/proposta-fotos/', '/api/uploads/avatares/');
  assert.strictEqual((await request(app).get(daFoto)).status, 200, 'controle: na propria pasta abre');
  assert.strictEqual((await request(app).get(noAvatar)).status, 404);
  const doAvatar = ass.fotoSrcAvatar('mesmo.png');
  assert.strictEqual((await request(app).get(doAvatar.replace('/avatares/', '/proposta-fotos/'))).status, 404);
});

test('sig adulterado, exp trocado e nome trocado -> 404', async () => {
  const url = ass.assinarFotoProposta('foto_1_equip.png');
  const u = new URL(url, 'http://x');
  const sig = u.searchParams.get('sig');
  const trocaSig = url.replace(sig, (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1));
  const trocaExp = url.replace(/exp=(\d+)/, (m, e) => `exp=${Number(e) - 1}`);
  const trocaNome = url.replace('foto_1_equip.png', 'mesmo.png');
  for (const v of [trocaSig, trocaExp, trocaNome]) assert.strictEqual((await request(app).get(v)).status, 404, v);
});

test('assinatura valida para arquivo inexistente -> 404 do fecho (nao desce para o proximo handler)', async () => {
  const r = await request(app).get(ass.assinarFotoProposta('nao_existe.png'));
  assert.strictEqual(r.status, 404);
  const r2 = await request(app).get(ass.fotoSrcAvatar('nao_existe.png'));
  assert.strictEqual(r2.status, 404);
});

test('validade: fotos 12 h (+ balde de 1 h), avatares 24 h (+ 1 h)', () => {
  const ef = exp(ass.assinarFotoProposta('a.png')) - agora();
  assert.ok(ef >= 12 * 3600 - 2 && ef <= 13 * 3600, `fotos: ${ef}s`);
  const ea = exp(ass.fotoSrcAvatar('a.png')) - agora();
  assert.ok(ea >= 24 * 3600 - 2 && ea <= 25 * 3600, `avatares: ${ea}s`);
  assert.deepStrictEqual(
    [PASTAS.fotoProposta.dominio, PASTAS.avatares.dominio, PASTAS.fotoProposta.minutos, PASTAS.avatares.minutos],
    ['proposta-fotos-v1', 'avatares-v1', 720, 1440]);
});

test('valor gravado com caminho vira so o nome (nao assina outra coisa)', () => {
  assert.match(ass.fotoSrcAvatar('../../segredo/avatar_7_1.png'), /^\/api\/uploads\/avatares\/avatar_7_1\.png\?/);
  assert.match(ass.assinarFotoProposta('pasta\\foto.png'), /^\/api\/uploads\/proposta-fotos\/foto\.png\?/);
});

test('comUrlFotoProposta: mantem os campos e acrescenta url relativa assinada', () => {
  const linha = { id: 3, arquivo: 'foto_1_equip.png', pagina: 2, pos_x: 1, pos_y: 2, largura: 50 };
  const r = ass.comUrlFotoProposta(linha);
  assert.deepStrictEqual({ ...r, url: undefined }, { ...linha, url: undefined });
  assert.strictEqual(r.url, ass.assinarFotoProposta('foto_1_equip.png'));
  assert.ok(r.url.startsWith('/api/uploads/proposta-fotos/'));
  assert.strictEqual(ass.comUrlFotoProposta(null), null);
});

// ── 2. template V2 de verdade ───────────────────────────────────────────────────────────

const { gerarHTMLPropostaPremiumV2 } = require('../../templates/propostaPremiumV2');
const PROPOSTA = { id: 1, numero_proposta: 'P-1', titulo: 'T', cliente_nome: 'C' };
const TOT = { subtotal: 0, icms: 0, ipi: 0, total: 0, dataEmissao: '', dataValidade: '' };
const cfg = () => ({ fotos_proposta: [{ id: 9, arquivo: 'foto_1_equip.png', pagina: 1, pos_x: 10, pos_y: 20, largura: 60 }] });
/** O JSON das fotos que o template embute (`var FOTOS_PROPOSTA = [...]`). */
function fotosDoHtml(html) {
  const m = html.match(/var FOTOS_PROPOSTA = (\[[^\n]*\]);/);
  assert.ok(m, 'FOTOS_PROPOSTA nao encontrado no HTML');
  return JSON.parse(m[1]);
}

test('V2 preview com assinador injetado: src = base + URL assinada, sem ?t=', () => {
  const html = gerarHTMLPropostaPremiumV2(PROPOSTA, [], TOT, cfg(), 'http://h:5', false, true,
    { assinarFotoProposta: ass.assinarFotoProposta });
  const [f] = fotosDoHtml(html);
  assert.match(f.src, /^http:\/\/h:5\/api\/uploads\/proposta-fotos\/foto_1_equip\.png\?exp=\d+&sig=[0-9a-f]{32}$/);
  assert.ok(!/proposta-fotos\/[^"'\s]*\?t=/.test(html), 'ainda ha ?t= em URL de foto');
});

test('V2 preview SEM assinador: base64 (nunca URL crua que daria 404)', () => {
  const html = gerarHTMLPropostaPremiumV2(PROPOSTA, [], TOT, cfg(), 'http://h:5', false, true);
  const [f] = fotosDoHtml(html);
  assert.match(f.src, /^data:image\/png;base64,/);
  assert.ok(!html.includes('/api/uploads/proposta-fotos/'));
});

test('V2 PDF (forPdfServer=true) ignora o assinador: base64', () => {
  const html = gerarHTMLPropostaPremiumV2(PROPOSTA, [], TOT, cfg(), 'http://h:5', true, true,
    { assinarFotoProposta: ass.assinarFotoProposta });
  const [f] = fotosDoHtml(html);
  assert.match(f.src, /^data:image\/png;base64,/);
  assert.ok(!html.includes('/api/uploads/proposta-fotos/'));
});

// ── 3. fiacao no index.js ───────────────────────────────────────────────────────────────

test('fiacao: assinadoresCrm criado com o segredo do JWT', () => {
  assert.match(fonteIndex, /const JWT_SECRET = resolveJwtSecret\(PERSISTENT_DATA_DIR\);[\s\S]{0,400}const assinadoresCrm = criarAssinadoresCrm\(JWT_SECRET\);/);
});

for (const [pasta, dir, ass1] of [['proposta-fotos', 'uploadsPropostaFotosDir', 'fotoProposta'], ['avatares', 'uploadsAvataresDir', 'avatares']]) {
  test(`fiacao: /api/uploads/${pasta} = middleware do assinador -> static seguro -> 404 final`, () => {
    const usos = [...fonteIndex.matchAll(new RegExp(`app\\.use\\('/api/uploads/${pasta}',[^\\n]*`, 'g'))].map((m) => m.index);
    assert.strictEqual(usos.length, 2, `esperava 2 app.use para ${pasta}, achei ${usos.length}`);
    const montagem = fonteIndex.slice(usos[0], fonteIndex.indexOf('}));', usos[0]) + 4);
    assert.ok(montagem.startsWith(`app.use('/api/uploads/${pasta}', assinadoresCrm.${ass1}.middleware, express.static(${dir}, {`), montagem.slice(0, 140));
    assert.match(montagem, /setHeaders: cabecalhosUploadSeguro/);
    const fecho = fonteIndex.slice(usos[1], fonteIndex.indexOf('\n', usos[1]));
    assert.strictEqual(fecho, `app.use('/api/uploads/${pasta}', (req, res) => res.status(404).end());`);
    assert.ok(usos[1] > usos[0], 'o 404 tem de vir DEPOIS do static');
  });
}

/** Chamadas `gerarHTMLPropostaPremiumV2(` no index.js, com o texto dos argumentos. */
function chamadasV2() {
  const out = [];
  const re = /gerarHTMLPropostaPremiumV2\(/g; let m;
  while ((m = re.exec(fonteIndex))) {
    const ini = m.index + m[0].length - 1;
    let prof = 0; let i = ini;
    for (; i < fonteIndex.length; i++) {
      if (fonteIndex[i] === '(') prof++;
      else if (fonteIndex[i] === ')') { prof--; if (prof === 0) break; }
    }
    out.push(fonteIndex.slice(ini + 1, i));
  }
  return out.filter((a) => !/^\s*$/.test(a));
}

test('fiacao: o assinador e injetado SO na chamada do preview (forPdfServer=false); a do PDF segue sem', () => {
  const chamadas = chamadasV2().filter((a) => /proposta/.test(a));
  assert.strictEqual(chamadas.length, 2, `esperava 2 chamadas (preview e PDF), achei ${chamadas.length}`);
  const preview = chamadas.find((a) => /requestBaseURL,\s*false,/.test(a));
  const pdf = chamadas.find((a) => /requestBaseURL, true, true/.test(a));
  assert.ok(preview && pdf, 'nao achei as duas chamadas');
  assert.match(preview, /\{ assinarFotoProposta: assinadoresCrm\.assinarFotoProposta \}\s*$/);
  assert.ok(!/assinarFotoProposta/.test(pdf), 'PDF nao deve receber o assinador');
});

test('fiacao: foto_src em buildAuthUserPayload, GET /api/conta e POST /api/conta/foto', () => {
  const ini = fonteIndex.indexOf('function buildAuthUserPayload(');
  const payload = fonteIndex.slice(ini, fonteIndex.indexOf('\n}\n', ini));
  assert.match(payload, /foto_src: assinadoresCrm\.fotoSrcAvatar\(user\.foto_url\),/);
  const getConta = fonteIndex.slice(fonteIndex.indexOf("app.get('/api/conta',"), fonteIndex.indexOf("app.put('/api/conta',"));
  assert.match(getConta, /res\.json\(\{ \.\.\.row, foto_src: assinadoresCrm\.fotoSrcAvatar\(row\.foto_url\) \}\);/);
  const iPost = fonteIndex.indexOf("app.post('/api/conta/foto',");
  const postFoto = fonteIndex.slice(iPost, fonteIndex.indexOf('\n});', iPost));
  assert.match(postFoto, /const fotoSrc = assinadoresCrm\.fotoSrcAvatar\(filename\);/);
  assert.match(postFoto, /foto_src: fotoSrc/);
});

test('fiacao: GET/POST /fotos, /duplicar e /restaurar devolvem url assinada', () => {
  const rotas = [["app.get('/api/propostas/:id/fotos'", /\(rows \|\| \[\]\)\.map\(assinadoresCrm\.comUrlFotoProposta\)/],
    ["app.post('/api/propostas/:id/fotos'", /res\.status\(201\)\.json\(assinadoresCrm\.comUrlFotoProposta\(\{ id: novoId, arquivo: req\.file\.filename/],
    ["app.post('/api/propostas/:id/fotos/:fotoId/duplicar'", /res\.status\(201\)\.json\(assinadoresCrm\.comUrlFotoProposta\(\{ id: novoId, arquivo: foto\.arquivo/],
    ["app.post('/api/propostas/:id/fotos/:fotoId/restaurar'", /res\.json\(assinadoresCrm\.comUrlFotoProposta\(\{ id: Number\(fotoId\), arquivo: foto\.arquivo/]];
  for (const [alvo, re] of rotas) {
    const i = fonteIndex.indexOf(alvo);
    assert.ok(i >= 0, alvo);
    assert.match(fonteIndex.slice(i, fonteIndex.indexOf('\n});', i)), re, alvo);
  }
});

test('fiacao: nenhuma URL crua de avatar/foto da proposta montada pelo nome no servidor', () => {
  const fontes = [['index.js', fonteIndex],
    ['templates/propostaPremiumV2.js', fs.readFileSync(path.join(SERVER, 'templates', 'propostaPremiumV2.js'), 'utf8')]];
  const cru = /\/api\/uploads\/(avatares|proposta-fotos)\/\$\{|\/api\/uploads\/(avatares|proposta-fotos)\/'\s*\+/;
  const achados = fontes.filter(([, s]) => cru.test(s)).map(([f]) => f);
  assert.deepStrictEqual(achados, []);
  // controle do detector: o texto antigo seria acusado.
  assert.ok(cru.test("url: `/api/uploads/avatares/${filename}`"));
});

(async () => {
  for (const [nome, fn] of testes) {
    try {
      await fn();
      passou++;
      console.log(`  ok  ${nome}`);
    } catch (e) {
      falhou++;
      console.log(`  FALHOU  ${nome}\n    ${e && e.stack ? e.stack : e}`);
    }
  }
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  console.log(`\nfotosAvataresAssinados: ${passou} passou, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
