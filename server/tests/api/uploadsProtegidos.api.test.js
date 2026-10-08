/**
 * Etapa 81 / T1 — arquivos enviados que abriam sem login (B36).
 *
 * O buraco: `app.use('/uploads/ordens-servico', express.static(uploadsOSDir))` e as montagens de
 * `/api/uploads/contrato`, `/api/uploads/cotacoes` e `/api/uploads/comprovantes-viagens` serviam o
 * PDF da OS (cliente, itens, valores), o modelo de contrato, cotacoes de fornecedor e comprovantes
 * de despesa para QUALQUER UM que soubesse o nome — e `OS_<numero>_<ms>.pdf` e muito adivinhavel.
 * Alem disso, nenhuma montagem publica de /api/uploads mandava `nosniff` nem CSP: um `.html`/`.svg`
 * enviado executava script na origem do CRM (XSS armazenado).
 *
 * Duas partes:
 *  1. COMPORTAMENTO dos handlers novos (`services/arquivosProtegidos.js`) com sqlite em memoria,
 *     pasta temporaria e supertest — o mecanismo em si (lição da Etapa 80), nao a vizinhanca:
 *     basename, Content-Disposition pelo encoder (numero_os com aspas/travessao nao da 500),
 *     contrato so sai se for o `contrato_anexo_url` de alguma linha, 404 literal.
 *  2. TEXTO do `server/index.js` e `routes/*.js` (index.js tem 23 mil linhas e faz `listen` no
 *     import; mesmo precedente de propostaPdfExigeLogin.api.test.js): as 4 montagens nao existem
 *     (nem com outro caminho), toda montagem estatica restante sob /api/uploads usa
 *     `cabecalhosUploadSeguro`, as 2 rotas novas tem `authenticateToken`.
 *
 * Executar: cd server && node tests/api/uploadsProtegidos.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const sqlite3 = require('sqlite3');

let passed = 0; let failed = 0;
const fila = [];
function test(name, fn) { fila.push([name, fn]); }

const SERVER = path.join(__dirname, '..', '..');
const fonteIndex = fs.readFileSync(path.join(SERVER, 'index.js'), 'utf8');
const fontesRotas = fs.readdirSync(path.join(SERVER, 'routes'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ arq: `routes/${f}`, src: fs.readFileSync(path.join(SERVER, 'routes', f), 'utf8') }));
const FONTES = [{ arq: 'index.js', src: fonteIndex }, ...fontesRotas];

// ── scanner ─────────────────────────────────────────────────────────────────────────────

/** Indice do fechamento que casa com o abridor em `ini` (`(` ou `{`), pulando strings/comentarios. */
function fechamento(src, ini) {
  const abre = src[ini]; const fecha = abre === '(' ? ')' : '}';
  let prof = 0;
  for (let i = ini; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (c === abre) prof++;
    else if (c === fecha) { prof--; if (prof === 0) return i; }
  }
  throw new Error(`bloco aberto em ${ini} nao fecha`);
}

const linhaDe = (src, idx) => src.slice(0, idx).split('\n').length;

function emComentario(src, idx) {
  const antes = src.slice(src.lastIndexOf('\n', idx) + 1, idx);
  const semStrings = antes.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '');
  return /^\s*(\/\/|\*|\/\*)/.test(antes) || semStrings.includes('//');
}

/**
 * Toda chamada `app.use(` (inclusive multilinha, com middleware antes do static) que contem um
 * `.static(`. Devolve { caminho, dirArg, opcoes, bloco, linha, multilinha }.
 */
function montagensEstaticas(src) {
  const out = [];
  const re = /\bapp\.use\(/g; let m;
  while ((m = re.exec(src))) {
    if (emComentario(src, m.index)) continue;
    const ini = m.index + 'app.use'.length;
    const fim = fechamento(src, ini);
    const bloco = src.slice(ini, fim + 1);
    const iStatic = bloco.search(/\.static\(/);
    if (iStatic < 0) continue;
    const mc = bloco.match(/^\(\s*(['"`])([^'"`]*)\1/);
    const abreStatic = bloco.indexOf('(', iStatic);
    const corpoStatic = bloco.slice(abreStatic + 1, fechamento(bloco, abreStatic));
    const virgula = corpoStatic.indexOf(',');
    out.push({
      caminho: mc ? mc[2] : null,
      dirArg: (virgula < 0 ? corpoStatic : corpoStatic.slice(0, virgula)).trim(),
      opcoes: virgula < 0 ? '' : corpoStatic.slice(virgula + 1),
      bloco,
      linha: linhaDe(src, m.index),
      multilinha: bloco.includes('\n'),
    });
  }
  return out;
}

const MONTAGENS = FONTES.flatMap(({ arq, src }) => montagensEstaticas(src).map((x) => ({ ...x, arq })));

/** Bloco da rota `app.<verbo>('<caminho>'` (do `(` ao `)` que fecha). */
function blocoDaRota(src, verbo, caminho) {
  const alvo = `app.${verbo}('${caminho}'`;
  const i = src.indexOf(alvo);
  if (i < 0) return null;
  const ini = i + `app.${verbo}`.length;
  return src.slice(i, fechamento(src, ini) + 1);
}

// ── 1. comportamento dos handlers ─────────────────────────────────────────────────────

let criarServirPdfOs; let criarServirContratoAnexo;
try {
  ({ criarServirPdfOs, criarServirContratoAnexo } = require('../../services/arquivosProtegidos'));
} catch (e) { console.error('services/arquivosProtegidos nao carregou:', e.message); }
const { cabecalhosUploadSeguro, cabecalhosUploadLogo } = require('../../services/almoxarifado/urlUpload');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c81-uploads-'));
const dirOS = path.join(tmp, 'ordens-servico'); fs.mkdirSync(dirOS);
const dirContrato = path.join(tmp, 'contrato'); fs.mkdirSync(dirContrato);
const dirLogos = path.join(tmp, 'logos'); fs.mkdirSync(dirLogos);
const fora = path.join(tmp, 'segredo.pdf'); fs.writeFileSync(fora, '%PDF-segredo-fora-da-pasta');

const db = new sqlite3.Database(':memory:');
const run = (sql, p = []) => new Promise((ok, ko) => db.run(sql, p, (e) => (e ? ko(e) : ok())));

// travessao (U+2013, colado do Word) e aspas. O Windows nao aceita `"` em nome de arquivo (o gerar-pdf
// ja falharia ao gravar), entao ali a aspa dupla vira apostrofo + ponto-e-virgula.
const NOME_ESTRANHO = process.platform === "win32"
  ? "OS_OS-2026–'7';x_1700000000000.pdf"
  : "OS_OS-2026–\"7\"_1700000000000.pdf";
let app;

async function preparar() {
  await run('CREATE TABLE ordens_servico (id INTEGER PRIMARY KEY, numero_os TEXT, pdf_url TEXT)');
  await run('CREATE TABLE proposta_template_config (id INTEGER PRIMARY KEY, contrato_anexo_url TEXT)');
  fs.writeFileSync(path.join(dirOS, 'OS_1_1700000000000.pdf'), '%PDF-1.4 os1');
  fs.writeFileSync(path.join(dirOS, NOME_ESTRANHO), '%PDF-1.4 estranho');
  await run('INSERT INTO ordens_servico VALUES (1, ?, ?)', ['1', '/uploads/ordens-servico/OS_1_1700000000000.pdf']);
  await run('INSERT INTO ordens_servico VALUES (2, ?, ?)', ['x', null]);
  await run('INSERT INTO ordens_servico VALUES (3, ?, ?)', ['y', '/uploads/ordens-servico/OS_y_sumiu.pdf']);
  await run('INSERT INTO ordens_servico VALUES (4, ?, ?)', ['z', '/uploads/ordens-servico/../segredo.pdf']);
  await run('INSERT INTO ordens_servico VALUES (5, ?, ?)', ['e', `/uploads/ordens-servico/${NOME_ESTRANHO}`]);

  fs.writeFileSync(path.join(dirContrato, 'contrato_1700_Modelo_GMP.docx'), 'PK-docx-atual');
  fs.writeFileSync(path.join(dirContrato, 'contrato_1600_Antigo.pdf'), '%PDF-removido');
  await run('INSERT INTO proposta_template_config VALUES (1, ?)', ['contrato_1700_Modelo_GMP.docx']);
  await run('INSERT INTO proposta_template_config VALUES (2, ?)', [null]); // "Remover contrato" zera

  // logo SVG com <style> (o caso real: exportado do Illustrator/Inkscape) e <script> (o ataque)
  fs.writeFileSync(path.join(dirLogos, 'logo.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:red}</style><script>alert(1)</script>'
    + '<rect class="a" width="10" height="10"/></svg>');

  app = express();
  app.use('/logos', express.static(dirLogos, { setHeaders: cabecalhosUploadLogo || (() => {}) }));
  app.use('/outros', express.static(dirLogos, { setHeaders: cabecalhosUploadSeguro }));
  if (!criarServirPdfOs) return;
  app.get('/pdf/:id', criarServirPdfOs({ db, uploadsOSDir: dirOS }));
  app.get('/contrato/:arquivo', criarServirContratoAnexo({ db, uploadsContratoDir: dirContrato }));
}

const corpo = (res) => (Buffer.isBuffer(res.body) ? res.body.toString('utf8') : res.text);
const binario = (r) => r.buffer(true).parse((res, cb) => {
  const parts = []; res.on('data', (c) => parts.push(c)); res.on('end', () => cb(null, Buffer.concat(parts)));
});

test('RN-81.01: PDF da OS sai pelo pdf_url gravado, inline, application/pdf', async () => {
  const r = await binario(request(app).get('/pdf/1'));
  assert.strictEqual(r.status, 200);
  assert.ok(corpo(r).startsWith('%PDF'), corpo(r));
  assert.match(r.headers['content-type'], /^application\/pdf/);
  assert.match(r.headers['content-disposition'], /^inline; filename="OS_1_1700000000000\.pdf"/);
});

test('RN-81.01: numero_os com travessao e aspas no nome -> 200, cabecalho codificado (nao 500)', async () => {
  const r = await binario(request(app).get('/pdf/5'));
  assert.strictEqual(r.status, 200, corpo(r));
  assert.ok(corpo(r).startsWith('%PDF'));
  const cd = r.headers['content-disposition'];
  assert.match(cd, /^inline;/);
  assert.ok(cd.includes("filename*=UTF-8''"), `sem filename* codificado: ${cd}`);
  assert.ok(/^[\x20-\x7e]*$/.test(cd), `cabecalho com caractere fora de ASCII: ${cd}`);
});

for (const [id, caso] of [[2, 'sem pdf_url'], [3, 'arquivo ausente'], [999, 'OS inexistente']]) {
  test(`RN-81.01: ${caso} -> 404 { error: 'PDF da OS não encontrado' }`, async () => {
    const r = await request(app).get(`/pdf/${id}`);
    assert.strictEqual(r.status, 404);
    assert.deepStrictEqual(r.body, { error: 'PDF da OS não encontrado' });
  });
}

test('RN-81.01: pdf_url com ../ nao sai da pasta (so o basename vale) -> 404', async () => {
  const r = await request(app).get('/pdf/4');
  assert.strictEqual(r.status, 404);
  assert.deepStrictEqual(r.body, { error: 'PDF da OS não encontrado' });
  assert.ok(!String(r.text).includes('segredo'), r.text);
});

test('RN-81.02: contrato atual -> 200 attachment com o arquivo', async () => {
  const r = await binario(request(app).get('/contrato/contrato_1700_Modelo_GMP.docx'));
  assert.strictEqual(r.status, 200);
  assert.strictEqual(corpo(r), 'PK-docx-atual');
  assert.match(r.headers['content-disposition'], /^attachment; filename="contrato_1700_Modelo_GMP\.docx"/);
  assert.match(r.headers['content-type'], /officedocument\.wordprocessingml/);
});

// Achado da revisao adversarial: o sendFile do Express poe `Cache-Control: public, max-age=0` —
// `public` autoriza proxy/cache compartilhado a guardar o PDF (cliente, valores) que so sai com
// login. E sem nosniff o navegador podia farejar o contrato como outro tipo.
for (const [url, oque] of [['/pdf/1', 'PDF da OS'], ['/contrato/contrato_1700_Modelo_GMP.docx', 'contrato']]) {
  test(`revisao: ${oque} sai com Cache-Control private, no-store e nosniff`, async () => {
    const r = await binario(request(app).get(url));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.headers['cache-control'], 'private, no-store');
    assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
  });
}

const CSP_ESTRITA = "default-src 'none'; sandbox";
const CSP_LOGO = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";

test('revisao: logo SVG sai com CSP que permite <style> inline e data: — script continua bloqueado', async () => {
  const r = await request(app).get('/logos/logo.svg');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers['content-security-policy'], CSP_LOGO);
  assert.ok(!/script-src/.test(r.headers['content-security-policy']), 'CSP do logo libera script');
  assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
  assert.match(r.headers['cache-control'], /^private/);
});

test('revisao: as outras montagens continuam com a CSP estrita', async () => {
  const r = await request(app).get('/outros/logo.svg');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers['content-security-policy'], CSP_ESTRITA);
  assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
});

test('RN-81.02: contrato removido (arquivo no disco, coluna zerada) -> 404', async () => {
  const r = await request(app).get('/contrato/contrato_1600_Antigo.pdf');
  assert.strictEqual(r.status, 404);
  assert.deepStrictEqual(r.body, { error: 'Contrato não encontrado' });
});

test('RN-81.02: registrado mas sumiu do disco -> 404', async () => {
  await run('INSERT INTO proposta_template_config VALUES (3, ?)', ['contrato_1800_Sumiu.pdf']);
  const r = await request(app).get('/contrato/contrato_1800_Sumiu.pdf');
  assert.strictEqual(r.status, 404);
  assert.deepStrictEqual(r.body, { error: 'Contrato não encontrado' });
});

test('RN-81.02: nome fora do padrao contrato_ ou com traversal -> 404 (mesmo se registrado)', async () => {
  await run('INSERT INTO proposta_template_config VALUES (4, ?)', ['../segredo.pdf']);
  for (const nome of ['segredo.pdf', '..%2Fsegredo.pdf', 'contrato_1700_Modelo_GMP.docx%00']) {
    const r = await request(app).get(`/contrato/${nome}`);
    assert.strictEqual(r.status, 404, `${nome} -> ${r.status}`);
    assert.deepStrictEqual(r.body, { error: 'Contrato não encontrado' }, nome);
  }
});

// ── 2. fiacao no index.js / routes ─────────────────────────────────────────────────────

const REMOVIDAS = ['/uploads/ordens-servico', '/api/uploads/contrato', '/api/uploads/cotacoes',
  '/api/uploads/comprovantes-viagens'];
const DIRS_PROTEGIDOS = ['uploadsOSDir', 'uploadsContratoDir', 'uploadsDir', 'uploadsComprovantesDir'];

test('controle: o scanner acha as montagens estaticas, inclusive a multilinha (footers) e a do chat', () => {
  assert.ok(MONTAGENS.length >= 14, `so ${MONTAGENS.length} montagens — o scanner quebrou`);
  const footers = MONTAGENS.find((x) => x.caminho === '/api/uploads/footers');
  assert.ok(footers && footers.multilinha && footers.dirArg === 'uploadsFooterDir',
    'nao reconheceu app.use(path, mw, express.static(dir)) multilinha');
  assert.ok(MONTAGENS.some((x) => x.arq === 'routes/chat.js' && x.caminho === '/api/uploads/chat'));
});

test('controle: o scanner acusa montagem sem setHeaders e montagem de pasta protegida (fonte sintetica)', () => {
  const sint = [
    "app.use('/api/uploads/x', express.static(dirX));",
    "app.use('/api/uploads/y', (req, res, next) => { next(); },",
    '  express.static(dirY, { setHeaders: cabecalhosUploadSeguro }));',
    "// app.use('/api/uploads/z', express.static(dirZ));",
    "app.use('/outro', express.static(uploadsOSDir));",
  ].join('\n');
  const r = montagensEstaticas(sint);
  assert.deepStrictEqual(r.map((x) => [x.caminho, x.dirArg, /cabecalhosUploadSeguro/.test(x.opcoes)]),
    [['/api/uploads/x', 'dirX', false], ['/api/uploads/y', 'dirY', true], ['/outro', 'uploadsOSDir', false]]);
});

test('RN-81.03: as 4 montagens estaticas sumiram', () => {
  const achadas = MONTAGENS.filter((x) => REMOVIDAS.includes(x.caminho));
  assert.deepStrictEqual(achadas.map((x) => `${x.arq}:${x.linha} ${x.caminho}`), []);
});

test('RN-81.03: nenhuma montagem estatica serve as pastas protegidas (nem com outro caminho)', () => {
  const achadas = MONTAGENS.filter((x) => DIRS_PROTEGIDOS.includes(x.dirArg));
  assert.deepStrictEqual(achadas.map((x) => `${x.arq}:${x.linha} ${x.caminho} -> ${x.dirArg}`), []);
});

test('RN-81.04: toda montagem estatica sob /api/uploads usa setHeaders: cabecalhosUploadSeguro', () => {
  const sob = MONTAGENS.filter((x) => x.caminho && x.caminho.startsWith('/api/uploads/'));
  const sem = sob.filter((x) => !/setHeaders\s*:/.test(x.opcoes)
    || !/cabecalhosUpload(Seguro|Logo)\b/.test(x.opcoes));
  assert.deepStrictEqual(sem.map((x) => `${x.arq}:${x.linha} ${x.caminho}`), []);
});

test('revisao: so /api/uploads/logos usa a CSP do logo; as demais ficam na estrita', () => {
  const sob = MONTAGENS.filter((x) => x.caminho && x.caminho.startsWith('/api/uploads/'));
  const comLogo = sob.filter((x) => /cabecalhosUploadLogo\b/.test(x.opcoes)).map((x) => x.caminho);
  assert.deepStrictEqual(comLogo, ['/api/uploads/logos']);
  const logos = sob.find((x) => x.caminho === '/api/uploads/logos');
  assert.match(logos.opcoes, /setHeaders:\s*cabecalhosUploadLogo\s*\}/);
});

test('RN-81.04: a lista medida de montagens publicas sob /api/uploads (13 + almoxarifado assinada)', () => {
  const sob = MONTAGENS.filter((x) => x.caminho && x.caminho.startsWith('/api/uploads/')).map((x) => x.caminho).sort();
  assert.deepStrictEqual(sob, [
    '/api/uploads/almoxarifado', '/api/uploads/avatares', '/api/uploads/chat', '/api/uploads/covers',
    '/api/uploads/familias-produtos', '/api/uploads/footers', '/api/uploads/fornecedores',
    '/api/uploads/grupos-compras', '/api/uploads/grupos-produtos', '/api/uploads/headers',
    '/api/uploads/logos', '/api/uploads/materiais-escritorio', '/api/uploads/produtos',
    '/api/uploads/proposta-fotos',
  ]);
});

test('RN-81.04: footers compoe — cabecalhos seguros e DEPOIS o no-store (senao o setHeaders o apaga)', () => {
  const f = MONTAGENS.find((x) => x.caminho === '/api/uploads/footers');
  const iSeg = f.opcoes.indexOf('cabecalhosUploadSeguro(res)');
  const iNoStore = f.opcoes.indexOf("'Cache-Control', 'no-cache, no-store, must-revalidate'");
  assert.ok(iSeg > 0 && iNoStore > iSeg, `setHeaders do footers nao compoe: ${f.opcoes.trim()}`);
});

test('RN-81.04: index.js e chat.js importam cabecalhosUploadSeguro de urlUpload', () => {
  const re = /cabecalhosUploadSeguro[^\n]*require\(['"]\.{1,2}\/services\/almoxarifado\/urlUpload['"]\)/;
  assert.ok(re.test(fonteIndex), 'index.js nao importa cabecalhosUploadSeguro');
  assert.ok(re.test(fontesRotas.find((x) => x.arq === 'routes/chat.js').src), 'chat.js nao importa');
});

const ROTAS = [
  ['/api/operacional/ordens-servico/:id/pdf', 'servirPdfOs', 'criarServirPdfOs({ db, uploadsOSDir })'],
  ['/api/proposta-template/contrato-anexo/:arquivo', 'servirContratoAnexo',
    'criarServirContratoAnexo({ db, uploadsContratoDir })'],
];
/**
 * Toda chamada `app.<x>(` / `router.<x>(` cujo PRIMEIRO argumento e a string `caminho`, em todas
 * as fontes (index.js + routes). Achado da revisao: o teste antigo so olhava linhas que comecam
 * com `app.get('<caminho>'` — um `app.use('<caminho>', servirPdfOs)` registrado ANTES (sem login)
 * passava despercebido e o Express o atenderia primeiro.
 */
function registrosDoCaminho(caminho) {
  const esc = caminho.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const re = new RegExp(String.raw`\b(app|router)\.(get|use|all|post|put|patch|delete|head|options)\(\s*(['"` + '`' + String.raw`])` + esc + String.raw`\3`, 'g');
  const out = [];
  for (const { arq, src } of FONTES) {
    let m;
    while ((m = re.exec(src))) {
      if (emComentario(src, m.index)) continue;
      const ini = m.index + m[1].length + 1 + m[2].length;
      out.push({ arq, linha: linhaDe(src, m.index), bloco: src.slice(m.index, fechamento(src, ini) + 1) });
    }
  }
  return out;
}

test('controle: registrosDoCaminho acha app.use/router.get e ignora comentario e prefixo (fonte sintetica)', () => {
  const salvo = FONTES.splice(0, FONTES.length, { arq: 'sint.js', src: [
    "app.use('/api/x/:id/pdf', servir);",
    'router.get("/api/x/:id/pdf", authenticateToken, servir);',
    "// app.get('/api/x/:id/pdf', servir);",
    "app.get('/api/x/:id/pdfs', servir);",
    'app.all(`/api/x/:id/pdf`, servir);',
  ].join('\n') });
  try {
    assert.deepStrictEqual(registrosDoCaminho('/api/x/:id/pdf').map((x) => x.linha), [1, 2, 5]);
  } finally { FONTES.splice(0, FONTES.length, ...salvo); }
});

for (const [caminho, handler] of ROTAS) {
  test(`revisao: ${caminho} em UM registro so (app/router, qualquer verbo, index.js + routes), com authenticateToken`, () => {
    const regs = registrosDoCaminho(caminho);
    assert.strictEqual(regs.length, 1,
      `registros: ${regs.map((x) => `${x.arq}:${x.linha} ${x.bloco}`).join(' | ')}`);
    assert.strictEqual(regs[0].arq, 'index.js');
    assert.strictEqual(regs[0].bloco, `app.get('${caminho}', authenticateToken, ${handler})`);
  });
}

for (const [caminho, handler, fabrica] of ROTAS) {
  test(`RN-81.01/02: GET ${caminho} registrada uma vez, com authenticateToken, servida pelo handler testado`, () => {
    const alvo = `app.get('${caminho}'`;
    const regs = fonteIndex.split('\n').filter((l) => l.trim().startsWith(alvo));
    assert.strictEqual(regs.length, 1, `esperava 1 registro de ${alvo}, achei ${regs.length}`);
    assert.strictEqual(regs[0].trim(), `${alvo}, authenticateToken, ${handler});`);
    assert.ok(fonteIndex.includes(`const ${handler} = ${fabrica};`), `${handler} nao vem de ${fabrica}`);
  });
}

test('RN-81.02: a resposta do POST do contrato aponta para a rota autenticada', () => {
  const b = blocoDaRota(fonteIndex, 'post', '/api/proposta-template/contrato-anexo');
  assert.ok(b, 'POST do contrato sumiu');
  assert.ok(b.includes('url: `/api/proposta-template/contrato-anexo/${req.file.filename}`'), b);
  assert.ok(!b.includes('/api/uploads/contrato'), 'POST ainda devolve a URL estatica morta');
});

// ── runner ─────────────────────────────────────────────────────────────────────────────

(async () => {
  try { await preparar(); } catch (e) { console.error('preparo falhou:', e); process.exit(1); }
  for (const [name, fn] of fila) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  db.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* windows */ }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
