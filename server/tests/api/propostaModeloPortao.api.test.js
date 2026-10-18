/**
 * Etapa 147 (propostas/Comercial) — o modelo da proposta (20 rotas) e as listas de preco (5) exigem o Comercial pela regua da TELA, pelo
 * `index.js` de verdade (pasta vazia): C319, C329.
 *
 *   RN-147.01  as 20 rotas do modelo (/api/proposta-template*, /api/proposta-blocos*, /api/proposta-texto-biblioteca*) passam pelo
 *              `exigirComercialNoModeloDaProposta` logo depois do login (antes do multer): o Comercial pela regua da tela OU o caminho
 *              de Configuracoes (o Administrativo pela regua da tela + administrador do modulo Comercial)
 *   RN-147.02  as 5 /api/comercial/listas-precos* passam pelo `exigirComercialNasPropostas` (sem o caminho de Configuracoes)
 *   RN-147.03  PROPOSTAS_PORTAO_DE_MODULO=desligado desliga tambem as 25
 *   RN-147.04  o documento da proposta continua saindo: o PDF e o preview pela rota, com o portao ligado, para quem tem o Comercial, e
 *              nenhuma URL do servidor que o documento referencia cai no portao
 *
 * Molde: propostaPortaoModulo.api.test.js (Etapa 145). Plano: docs/superpowers/plans/2026-10-18-almoxarifado-etapa147-o-modulo-no-modelo-e-nas-listas.md
 * Executar: cd server && node tests/api/propostaModeloPortao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');

const SERVER_DIR = path.join(__dirname, '..', '..');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

// ── o servidor real ───────────────────────────────────────────────────────────────────────
let porta; let filho = null; let pasta; let logArq; let saiu = null;
async function j(m, u, tok, body, texto, ms = 30000) {
  const r = await fetch(`http://127.0.0.1:${porta}/api${u}`, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(ms),
  });
  if (texto) return [r.status, await r.text()];
  let x = null; try { x = await r.json(); } catch (e) { /* sem corpo */ }
  return [r.status, x];
}
/** A chamada que tem de RESPONDER: 15 s de limite (a rota de antes podia nao responder). */
async function responde(m, u, body, tok = ctx.T) {
  try {
    return await j(m, u, tok, body, false, 15000);
  } catch (e) {
    throw new Error(`${m} ${u} nao respondeu em 15 s (${e.name}) com ${JSON.stringify(body).slice(0, 120)}`);
  }
}
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e147mpseed@t.com', senha: 'E147mpseed!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir(extraEnv = {}) {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'FALHA_SQL_MSG', 'FALHA_SQL_METODOS', 'FALHA_SQL_PULAR', 'FALHA_SQL_MSGS', 'PROPOSTAS_PORTAO_DE_MODULO', 'RATE_LIMIT_WINDOW_MS']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha, RATE_LIMIT_MAX: '100000' }, extraEnv);
  const out = fs.openSync(logArq, 'a');
  saiu = null;
  const preload = ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js')];
  if (extraEnv.FALHA_SQL_INJETADA) preload.push('-r', path.join(__dirname, '..', 'helpers', 'falhaSqlInjetada.js'));
  const marcas = fs.existsSync(logArq) ? (fs.readFileSync(logArq, 'utf8').match(/Banco de dados totalmente inicializado/g) || []).length : 0;
  filho = spawn(process.execPath, [...preload, 'index.js'], {
    cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true,
  });
  filho.on('exit', (code) => { saiu = code; });
  const fim = Date.now() + 60000;
  while (Date.now() < fim) {
    if (saiu !== null) throw new Error(`o index.js saiu cedo (codigo ${saiu})`);
    try {
      const [s, x] = await j('POST', '/auth/login', null, SEED);
      if (s === 200 && x && x.token) {
        const ate = Date.now() + 30000;
        while (Date.now() < ate && (fs.readFileSync(logArq, 'utf8').match(/Banco de dados totalmente inicializado/g) || []).length <= marcas) await pausa(200);
        await pausa(1500);
        return x.token;
      }
    } catch (e) { /* ainda subindo */ }
    await pausa(200);
  }
  throw new Error('o index.js nao ficou pronto em 60 s');
}
async function descer() {
  if (filho && saiu === null) {
    const morreu = new Promise((r) => filho.once('exit', r));
    filho.kill();
    await Promise.race([morreu, pausa(10000)]);
  }
  filho = null;
}

// ── o arquivo, por fora ───────────────────────────────────────────────────────────────────
let cru = null;
function abrirCru() {
  cru = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  cru.configure('busyTimeout', 15000);
}
const run = (sql, p = []) => new Promise((res, rej) => cru.run(sql, p, function feito(e) { if (e) rej(e); else res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => cru.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const ctx = { n: 0 };
const { temModuloComoATela } = require('../../services/portaoDasPropostas');

const NEGADO = { error: 'Acesso negado ao módulo', modulo: 'comercial' };
// 1x1 PNG de verdade (o filtro de imagem do multer confere o tipo)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// ── as rotas, lidas do fonte ──────────────────────────────────────────────────────────────
const FONTE = fs.readFileSync(path.join(SERVER_DIR, 'index.js'), 'utf8');
const PREFIXOS_MODELO = /^\/api\/(proposta-template|proposta-blocos|proposta-texto-biblioteca)(\/|$)/;
const TODAS = [...FONTE.matchAll(/^app\.(get|post|put|patch|delete)\('(\/api\/(?:proposta-template|proposta-blocos|proposta-texto-biblioteca|comercial\/listas-precos)[^']*)', ([^\n]*)$/gm)]
  .map((m) => ({ metodo: m[1].toUpperCase(), rota: m[2], resto: m[3] }));
const MODELO = TODAS.filter((r) => PREFIXOS_MODELO.test(r.rota));
const LISTAS = TODAS.filter((r) => r.rota.startsWith('/api/comercial/listas-precos'));
const UPLOADS = {
  '/api/proposta-template/logo': ['logo', 'l.png', 'image/png'],
  '/api/proposta-template/header-image': ['headerImage', 'h.png', 'image/png'],
  '/api/proposta-template/footer-image': ['footerImage', 'f.png', 'image/png'],
  '/api/proposta-template/cover-image': ['coverImage', 'c.png', 'image/png'],
  '/api/proposta-template/contrato-anexo': ['contratoAnexo', 'contrato.pdf', 'application/pdf'],
};
const conteudoDe = (tipo) => (tipo === 'image/png' ? PNG : Buffer.from('%PDF-1.4\n%e147\n'));

function arquivosDaPasta() {
  const out = [];
  const andar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'backups') andar(p); } // o backup automatico do boot nao e upload
      else if (!/database\.sqlite|index\.log|\.runtime-secrets/.test(e.name)) out.push(path.relative(pasta, p));
    }
  };
  andar(pasta);
  return out.sort();
}
async function multipart(u, tok, campo, nome, tipo, conteudo) {
  const fd = new FormData();
  fd.append(campo, new Blob([conteudo], { type: tipo }), nome);
  const r = await fetch(`http://127.0.0.1:${porta}/api${u}`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: fd, signal: AbortSignal.timeout(30000) });
  let x = null; try { x = await r.json(); } catch (e) { /* sem corpo */ }
  return [r.status, x];
}
const urlDe = (r) => {
  let id = '1';
  if (r.rota.startsWith('/api/proposta-template/')) id = String(ctx.tplId);
  if (r.rota.startsWith('/api/proposta-blocos/')) id = String(ctx.bloco);
  if (r.rota.startsWith('/api/proposta-texto-biblioteca/')) id = String(ctx.texto);
  if (r.rota.startsWith('/api/comercial/listas-precos/')) id = String(ctx.lista);
  return r.rota.replace('/api', '').replace(':id', id).replace(':arquivo', encodeURIComponent(ctx.contrato));
};
const corpoDe = () => ({ familia: 'Geral', nome_template: 'X', nome: 'X', chave: 'x', texto_bruto: 'x', conteudo_html: '<p>x</p>', colunas: ['a'], itens: [{ a: 1 }] });
const retrato = async () => JSON.stringify([
  await all('SELECT * FROM proposta_template_config ORDER BY id'), await all('SELECT * FROM proposta_blocos ORDER BY id'),
  await all('SELECT * FROM proposta_texto_biblioteca ORDER BY id'), await all('SELECT * FROM listas_precos ORDER BY id'),
  await all('SELECT * FROM listas_precos_itens ORDER BY id'),
]);
const contarNegados = async (id) => (await all("SELECT COUNT(*) AS n FROM logs_auditoria WHERE tipo = 'acesso_negado' AND usuario_id = ? AND modulo = 'comercial' AND nome_modulo = 'Comercial'", [id]))[0].n;

/** Chama uma rota (upload ou JSON) como `tok`. */
async function chamar(r, tok) {
  const u = urlDe(r);
  if (UPLOADS[r.rota]) { const [campo, nome, tipo] = UPLOADS[r.rota]; return multipart(u, tok, campo, nome, tipo, conteudoDe(tipo)); }
  const corpo = r.metodo === 'GET' || r.metodo === 'DELETE' ? undefined : corpoDe();
  if (r.rota.endsWith('/contrato-anexo/:arquivo')) {
    const resp = await fetch(`http://127.0.0.1:${porta}/api${u}`, { headers: { Authorization: 'Bearer ' + tok }, signal: AbortSignal.timeout(30000) });
    const txt = await resp.text();
    let x = txt; try { x = JSON.parse(txt); } catch (e) { /* o arquivo */ }
    return [resp.status, x];
  }
  return j(r.metodo, u, tok, corpo);
}

async function usuario(nome, { role = 'usuario', grupos = [], diretas = [], diretasCrus = [], adminModulos = null } = {}) {
  const email = `${nome}@e147.t`;
  const [s, u] = await j('POST', '/usuarios', ctx.T, { nome, email, senha: 'Senha!147p', cargo: 'C', role, setor: '' });
  assert.ok(s === 200 || s === 201, `usuario ${nome}: ${s} ${JSON.stringify(u)}`);
  const id = (await all('SELECT id FROM usuarios WHERE email = ?', [email]))[0].id;
  for (const g of grupos) await run('INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES (?, ?)', [id, g]);
  for (const m of diretas) await run("INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, NULL, ?, 'acesso', 1)", [id, m]);
  for (const [m, acao, p] of diretasCrus) await run('INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, NULL, ?, ?, ?)', [id, m, acao, p]);
  if (adminModulos) await run('UPDATE usuarios SET admin_modulos = ? WHERE id = ?', [JSON.stringify(adminModulos), id]);
  return { id, nome, role, email, adminModulos: adminModulos || [] };
}
async function logar(u) {
  const [s, l] = await j('POST', '/auth/login', null, { email: u.email, senha: 'Senha!147p' });
  assert.strictEqual(s, 200, `login ${u.nome}: ${JSON.stringify(l)}`);
  u.T = l.token;
}

// ── RN-147.01/02: a regua pelo fonte ──────────────────────────────────────────────────────
test('[RN-147.01/02, C319, C329] fonte: as 20 do modelo com exigirComercialNoModeloDaProposta e as 5 das listas com exigirComercialNasPropostas, como 2o middleware', () => {
  assert.strictEqual(MODELO.length, 20, `esperava 20 rotas do modelo, achei ${MODELO.length}`);
  assert.strictEqual(LISTAS.length, 5, `esperava 5 rotas das listas, achei ${LISTAS.length}`);
  // regua independente: todo registro (qualquer verbo, use/all/route, qualquer aspa) desses prefixos no index.js
  const reReg = /\.(get|post|put|patch|delete|all|use|route)\(\s*["'`]\/api\/(proposta-template|proposta-blocos|proposta-texto-biblioteca|comercial\/listas-precos)/;
  const linhas = FONTE.split('\n').filter((l) => reReg.test(l));
  assert.strictEqual(linhas.length, 25, "ha registro dessas rotas fora do formato app.<verbo>('/api/...', ...) numa linha so");
  const fora = [];
  const varrer = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', 'tests', 'data', 'uploads', 'backups'].includes(e.name) || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) varrer(p);
      else if (e.name.endsWith('.js') && p !== path.join(SERVER_DIR, 'index.js') && reReg.test(fs.readFileSync(p, 'utf8'))) fora.push(path.relative(SERVER_DIR, p));
    }
  };
  varrer(SERVER_DIR);
  assert.deepStrictEqual(fora, [], 'rota do modelo/listas registrada fora do index.js escaparia desta regua');
  assert.ok(fs.existsSync(path.join(SERVER_DIR, 'routes', 'compras.js')), 'a varredura nao enxerga routes/ (controle: o arquivo de Compras existe)');
  const sem = [
    ...MODELO.filter((r) => !r.resto.startsWith('authenticateToken, exigirComercialNoModeloDaProposta, ')),
    ...LISTAS.filter((r) => !r.resto.startsWith('authenticateToken, exigirComercialNasPropostas, ')),
  ].map((r) => `${r.metodo} ${r.rota}: ${r.resto.slice(0, 70)}`);
  assert.deepStrictEqual(sem, []);
  assert.strictEqual(Object.keys(UPLOADS).filter((u) => MODELO.some((r) => r.rota === u && r.metodo === 'POST' && /\.single\(/.test(r.resto))).length, 5, 'as cinco rotas com multer');
  assert.ok(FONTE.includes("const exigirComercialNoModeloDaProposta = portaoDasPropostas.exigir('comercial', { tambemAdminDoModuloCom: { admin: 'comercial', tela: 'administrativo' } });"),
    'o portao do modelo nao e o do plano');
});

// ── RN-147.01/02: pela rota, cada uma das 25 ──────────────────────────────────────────────
test('[RN-147.01/02, C319, C329] o usuario que a tela barra do Comercial (so a direta do Operacional) toma 403 em cada uma das 25 — e nada muda', async () => {
  const b = ctx.u.soOperacional;
  const antes = await retrato();
  const arquivos0 = arquivosDaPasta();
  const log0 = await contarNegados(b.id);
  const errados = [];
  for (const r of TODAS) {
    const [s, x] = await chamar(r, b.T);
    if (s !== 403 || JSON.stringify(x) !== JSON.stringify(NEGADO)) errados.push(`${r.metodo} ${r.rota}: ${s} ${JSON.stringify(x).slice(0, 80)}`);
  }
  assert.deepStrictEqual(errados, []);
  await pausa(300);
  assert.strictEqual(await retrato(), antes, 'uma rota barrada mudou o modelo, os blocos, os textos ou as listas');
  assert.deepStrictEqual(arquivosDaPasta(), arquivos0, 'um upload barrado gravou arquivo (o portao depois do multer)');
  assert.strictEqual(await contarNegados(b.id) - log0, 25, 'cada 403 registra o acesso negado no log');
});

// ── a metade positiva: o fluxo inteiro de quem tem o Comercial (direta, nao administrador) ─
test('[RN-147.01/02] a metade positiva: quem tem o Comercial le e grava o modelo, sobe e baixa o contrato, mexe em blocos, textos e listas', async () => {
  const u = ctx.u.diretaComercial;
  const ok = (r, st = 200) => assert.ok(r[0] === st, `${st} esperado: ${r[0]} ${JSON.stringify(r[1]).slice(0, 160)}`);
  const arquivos0 = arquivosDaPasta().length;
  ok(await j('GET', '/proposta-template', u.T));
  ok(await j('POST', '/proposta-template', u.T, { familia: 'Geral', margin_impressao_lateral: 21 }));
  assert.strictEqual((await all("SELECT margin_impressao_lateral FROM proposta_template_config WHERE familia = 'Geral'"))[0].margin_impressao_lateral, 21);
  ok(await j('GET', '/proposta-template/list', u.T));
  ok(await j('GET', `/proposta-template/${ctx.tplId}`, u.T));
  const [ss, xs] = await j('POST', '/proposta-template/save-as', u.T, { nome_template: 'Copia 147', familia: 'F147' });
  ok([ss, xs]);
  ok(await j('POST', '/proposta-template/restore-default', u.T, { familia: 'F147' }));
  for (const rota of Object.keys(UPLOADS)) {
    const [campo, nome, tipo] = UPLOADS[rota];
    ok(await multipart(rota.replace('/api', ''), u.T, campo, nome, tipo, conteudoDe(tipo)));
  }
  // cinco arquivos novos; o contrato novo apaga o anterior (o do preparo) — o comportamento de sempre da rota
  const depoisDosUploads = arquivosDaPasta();
  assert.strictEqual(depoisDosUploads.length, arquivos0 + 4, 'os cinco uploads nao apareceram na pasta (menos o contrato anterior, que sai)');
  assert.ok(!depoisDosUploads.some((x) => x.endsWith(ctx.contrato)), 'o contrato anterior continuou na pasta');
  // Fase 2 I-4: o upload grava na linha do modelo (sem linha, o UPDATE responderia 200 sem gravar) — a linha foi criada no preparo
  const linha = (await all('SELECT logo_url, header_image_url, footer_image_url, cover_image_url, contrato_anexo_url FROM proposta_template_config ORDER BY id DESC LIMIT 1'))[0];
  assert.ok(['logo_url', 'header_image_url', 'footer_image_url', 'cover_image_url', 'contrato_anexo_url'].every((c) => linha[c] && linha[c] !== ctx.contrato), JSON.stringify(linha));
  const contrato = (await all("SELECT contrato_anexo_url FROM proposta_template_config ORDER BY id DESC LIMIT 1"))[0].contrato_anexo_url;
  const rd = await fetch(`http://127.0.0.1:${porta}/api/proposta-template/contrato-anexo/${encodeURIComponent(contrato)}`, { headers: { Authorization: 'Bearer ' + u.T } });
  assert.strictEqual(rd.status, 200);
  assert.strictEqual((await rd.text()).slice(0, 5), '%PDF-');
  const [sb, b] = await j('POST', '/proposta-blocos', u.T, { nome: 'B147', conteudo_html: '<p>b</p>' });
  ok([sb, b], 201);
  ok(await j('PUT', `/proposta-blocos/${b.id}`, u.T, { nome: 'B147b' }));
  ok(await j('GET', '/proposta-blocos', u.T));
  ok(await j('DELETE', `/proposta-blocos/${b.id}`, u.T));
  const [st, t] = await j('POST', '/proposta-texto-biblioteca', u.T, { chave: 'k147', texto_bruto: 'a' });
  ok([st, t], 201);
  ok(await j('PUT', `/proposta-texto-biblioteca/${t.id}`, u.T, { chave: 'k147b' }));
  ok(await j('GET', '/proposta-texto-biblioteca', u.T));
  ok(await j('DELETE', `/proposta-texto-biblioteca/${t.id}`, u.T));
  const [sl, l] = await j('POST', '/comercial/listas-precos', u.T, { nome: 'L147', colunas: ['cod', 'preco'], itens: [{ cod: 'A1', preco: 3 }, { cod: 'B2', preco: 4 }] });
  ok([sl, l], 201);
  ok(await j('GET', '/comercial/listas-precos', u.T));
  ok(await j('GET', `/comercial/listas-precos/${l.id}`, u.T));
  const [si, xi] = await j('GET', `/comercial/listas-precos/${l.id}/itens?q=b2`, u.T);
  assert.deepStrictEqual([si, xi && xi.total, xi && xi.itens.map((i) => i.cod)], [200, 1, ['B2']]);
  ok(await j('DELETE', `/comercial/listas-precos/${l.id}`, u.T));
});

// ── RN-147.01: por usuario, o modelo e as listas decidem como a tela ─────────────────────
test('[RN-147.01/02] por usuario: o modelo decide o que a tela decide (Comercial, ou Administrativo + administrador do Comercial); as listas, so o Comercial', async () => {
  const esperado = {
    semNada: [200, 200], diretaComercial: [200, 200], grupoComercial: [200, 200], grupoVazio: [200, 200], superU: [200, 200], roleAdmin: [200, 200],
    soOperacional: [403, 403], soAlmox: [403, 403], comercialPermissao0: [403, 403], adminComercialSoAlmox: [403, 403],
    adminComercialComAdministrativo: [200, 403], adminComercialAdministrativoGrupo: [200, 403], administrativoSemAdmin: [403, 403],
    adminComercialAdministrativoInativo: [403, 403], adminComercialAdministrativoPermissao0: [403, 403],
    adminAdministrativoComAdministrativo: [403, 403], adminComercialSemLinha: [200, 200],
  };
  const linhas = [];
  for (const k of Object.keys(esperado)) {
    const u = ctx.u[k];
    const [sg, g] = await j('GET', `/usuarios/${u.id}/grupos`, ctx.T);
    assert.strictEqual(sg, 200, JSON.stringify(g));
    const quem = { id: u.id, role: u.role, is_superadmin: u.superadmin ? 1 : 0 };
    // a tela: /comercial (Comercial) ou /configuracoes -> Comercial -> Template (Administrativo + canConfigureModule('comercial'))
    const telaModelo = temModuloComoATela(quem, g.permissoes, ['comercial'])
      || (temModuloComoATela(quem, g.permissoes, ['administrativo']) && (u.adminModulos.includes('comercial') || u.superadmin || u.role === 'admin'));
    const telaListas = temModuloComoATela(quem, g.permissoes, ['comercial']);
    const [s1] = await j('GET', '/proposta-template/list', u.T);
    const [s2] = await j('GET', '/proposta-blocos', u.T);
    const [s3] = await j('GET', '/comercial/listas-precos', u.T);
    linhas.push([k, s1, s2, s3, telaModelo ? 200 : 403, telaListas ? 200 : 403]);
  }
  assert.deepStrictEqual(linhas, Object.entries(esperado).map(([k, [m, l]]) => [k, m, m, l, m, l]));
});

// ── RN-147.04: o documento pela rota ──────────────────────────────────────────────────────
test('[RN-147.04] com o portao ligado, quem tem o Comercial gera o preview e o PDF; nenhuma URL do servidor no documento cai no portao, e as de upload/asset abrem sem token', async () => {
  const u = ctx.u.diretaComercial;
  const rp = await fetch(`http://127.0.0.1:${porta}/api/propostas/${ctx.prop}/premium`, { headers: { Authorization: 'Bearer ' + u.T }, signal: AbortSignal.timeout(60000) });
  assert.strictEqual(rp.status, 200);
  const html = await rp.text();
  assert.ok(html.includes('P147'), 'o preview nao e o da proposta');
  const base = `http://127.0.0.1:${porta}`;
  const urls = [...new Set([...html.matchAll(/(?:src|href)=["'](https?:\/\/[^"']+)["']/g)].map((m) => m[1]).filter((x) => x.startsWith(base)))];
  assert.ok(urls.length > 0, 'o preview nao referencia nenhuma URL do servidor (o teste nao provaria nada)');
  const noPortao = urls.filter((x) => /\/api\/(proposta-template|proposta-blocos|proposta-texto-biblioteca|comercial\/listas-precos)/.test(x));
  assert.deepStrictEqual(noPortao, []);
  const semToken = [];
  for (const x of urls.filter((y) => /\/api\/(uploads|assets)\//.test(y))) {
    const r = await fetch(x, { signal: AbortSignal.timeout(30000) });
    if (r.status !== 200) semToken.push(`${r.status} ${x}`);
  }
  assert.deepStrictEqual(semToken, [], 'uma imagem do documento nao abre sem token (o Chromium do PDF a busca assim)');
  const rpdf = await fetch(`http://127.0.0.1:${porta}/api/propostas/${ctx.prop}/pdf`, { headers: { Authorization: 'Bearer ' + u.T }, signal: AbortSignal.timeout(120000) });
  const buf = Buffer.from(await rpdf.arrayBuffer());
  assert.strictEqual(rpdf.status, 200, buf.toString('utf8').slice(0, 300));
  assert.ok(String(rpdf.headers.get('content-type')).includes('application/pdf') && buf.slice(0, 5).toString('latin1') === '%PDF-', 'o PDF nao e PDF');
});

// ── RN-147.03 e o BUSY: reboots ───────────────────────────────────────────────────────────
test('[RN-147.03] PROPOSTAS_PORTAO_DE_MODULO=desligado deixa o barrado passar no modelo e nas listas (e o boot avisa); ligado de novo, barra', async () => {
  const b = ctx.u.soOperacional;
  await descer();
  ctx.T = await subir({ PROPOSTAS_PORTAO_DE_MODULO: 'desligado' });
  await logar(b);
  const log = fs.readFileSync(logArq, 'utf8');
  assert.ok(/PROPOSTAS_PORTAO_DE_MODULO=desligado/.test(log) && /modelo da proposta/.test(log) && /listas de preço/.test(log), 'o aviso do boot nao cita o modelo e as listas');
  const [s1] = await j('GET', '/proposta-template', b.T);
  const [s2, x2] = await j('POST', '/proposta-blocos', b.T, { nome: 'desligado' });
  const [s3] = await j('GET', '/comercial/listas-precos', b.T);
  assert.deepStrictEqual([s1, s2, s3], [200, 201, 200], JSON.stringify(x2));
  await descer();
  ctx.T = await subir();
  await logar(b);
  const [s4, x4] = await j('GET', '/proposta-template', b.T);
  const [s5, x5] = await j('GET', '/comercial/listas-precos', b.T);
  assert.deepStrictEqual([s4, x4, s5, x5], [403, NEGADO, 403, NEGADO]);
});

test('[RN-147.01/02] SQLITE_BUSY ao ler as permissoes: 503 no modelo e nas listas; outro erro: 500; o administrador nem le', async () => {
  const b = ctx.u.soOperacional;
  const FALHA = 'p\\.modulo, p\\.permissao FROM grupos_permissoes';
  await descer();
  ctx.T = await subir({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'all', FALHA_SQL_MSG: 'SQLITE_BUSY: database is locked' });
  try {
    await logar(b);
    const corpo503 = { error: 'Banco temporariamente ocupado. Tente novamente em alguns segundos.', code: 'SQLITE_BUSY', retryAfter: 3, context: 'portao:propostas' };
    const [s, x] = await j('GET', '/proposta-template', b.T);
    const [s2, x2] = await j('GET', '/comercial/listas-precos', b.T);
    assert.deepStrictEqual([s, x, s2, x2], [503, corpo503, 503, corpo503]);
    const [sa] = await j('GET', '/proposta-template', ctx.T);
    assert.strictEqual(sa, 200, 'o administrador passa sem ler as linhas');
    await descer();
    ctx.T = await subir({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'all' });
    await logar(b);
    const [s3, x3] = await j('GET', '/proposta-blocos', b.T);
    assert.deepStrictEqual([s3, x3], [500, { error: 'Erro ao verificar permissões' }]);
  } finally {
    await descer();
    ctx.T = await subir();
  }
});

(async () => {
  console.log('\n=== Etapa 147: o modelo da proposta e as listas de preco exigem o Comercial pela regua da tela (C319, C329) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e147-modelo-'));
    ctx.T = await subir();
    abrirCru();
    const [sc, c] = await j('POST', '/clientes', ctx.T, { razao_social: 'Cli 147', cnpj: '11.222.333/0001-72', email: 'a@a.com' });
    assert.strictEqual(sc, 200, JSON.stringify(c));
    ctx.clienteId = c.id;
    const [s0, p0] = await j('POST', '/propostas', ctx.T, { titulo: 'P147', cliente_id: c.id, itens: [{ descricao: 'A', quantidade: 1, valor_unitario: 10, valor_total: 10 }] });
    assert.strictEqual(s0, 200, JSON.stringify(p0));
    ctx.prop = p0.id;
    // o que as rotas com :id vao achar: o modelo, um bloco, um texto, uma lista e o contrato — gravados pelo administrador
    const [st, t] = await j('POST', '/proposta-template', ctx.T, { familia: 'Geral' });
    assert.strictEqual(st, 200, JSON.stringify(t));
    ctx.tplId = (await all("SELECT id FROM proposta_template_config WHERE familia = 'Geral' ORDER BY id DESC LIMIT 1"))[0].id;
    const [sb, b] = await j('POST', '/proposta-blocos', ctx.T, { nome: 'B0' });
    assert.strictEqual(sb, 201, JSON.stringify(b)); ctx.bloco = b.id;
    const [sx, x] = await j('POST', '/proposta-texto-biblioteca', ctx.T, { chave: 'k0' });
    assert.strictEqual(sx, 201, JSON.stringify(x)); ctx.texto = x.id;
    const [sl, l] = await j('POST', '/comercial/listas-precos', ctx.T, { nome: 'L0', colunas: ['a'], itens: [{ a: 1 }] });
    assert.strictEqual(sl, 201, JSON.stringify(l)); ctx.lista = l.id;
    const [sk, k] = await multipart('/proposta-template/contrato-anexo', ctx.T, 'contratoAnexo', 'contrato.pdf', 'application/pdf', conteudoDe('application/pdf'));
    assert.strictEqual(sk, 200, JSON.stringify(k)); ctx.contrato = k.filename;
    // grupos gravados por fora: 901 ativo com Comercial, 903 ativo sem linha, 905 inativo com Administrativo, 906 ativo com Administrativo
    await run("INSERT INTO grupos_permissoes (id, nome, ativo) VALUES (901,'G-com',1),(903,'G-vazio',1),(905,'G-adm-inat',0),(906,'G-adm',1)");
    await run("INSERT INTO permissoes (grupo_id, modulo, acao, permissao) VALUES (901,'comercial','acesso',1),(905,'administrativo','acesso',1),(906,'administrativo','acesso',1)");
    ctx.u = {
      semNada: await usuario('semnada'),
      diretaComercial: await usuario('dcom', { diretas: ['comercial'] }),
      grupoComercial: await usuario('gcom', { grupos: [901] }),
      grupoVazio: await usuario('gvazio', { grupos: [903] }),
      superU: await usuario('super', { diretas: ['almoxarifado'] }),
      roleAdmin: await usuario('radm', { role: 'admin', diretas: ['almoxarifado'] }),
      soOperacional: await usuario('sop', { diretas: ['operacional'] }),
      soAlmox: await usuario('salm', { diretas: ['almoxarifado'] }),
      comercialPermissao0: await usuario('cp0', { diretasCrus: [['comercial', 'acesso', 0]] }),
      adminComercialSoAlmox: await usuario('acsa', { diretas: ['almoxarifado'], adminModulos: ['comercial'] }),
      adminComercialComAdministrativo: await usuario('acadm', { diretas: ['administrativo'], adminModulos: ['comercial'] }),
      adminComercialAdministrativoGrupo: await usuario('acadmg', { grupos: [906], adminModulos: ['comercial'] }),
      administrativoSemAdmin: await usuario('adms', { diretas: ['administrativo'] }),
      adminComercialAdministrativoInativo: await usuario('acadmi', { grupos: [905], diretas: ['almoxarifado'], adminModulos: ['comercial'] }),
      adminComercialAdministrativoPermissao0: await usuario('acadm0', { diretasCrus: [['administrativo', 'acesso', 0]], adminModulos: ['comercial'] }),
      // Fase 2 M-2: o administrador do Administrativo (canAccessAdministrativoConfig aceita os dois) nao e o do Comercial
      adminAdministrativoComAdministrativo: await usuario('aadm', { diretas: ['administrativo'], adminModulos: ['administrativo'] }),
      adminComercialSemLinha: await usuario('acsl', { adminModulos: ['comercial'] }),
    };
    await run('UPDATE usuarios SET is_superadmin = 1 WHERE id = ?', [ctx.u.superU.id]);
    ctx.u.superU.superadmin = true;
    assert.strictEqual((await all('SELECT is_superadmin FROM usuarios WHERE id = ?', [ctx.u.roleAdmin.id]))[0].is_superadmin, 0, 'o role admin do cenario nao pode ser super');
    for (const u of Object.values(ctx.u)) await logar(u);
    for (const [name, fn] of testes) {
      if (saiu !== null) { failed++; console.error(`  ✗ ${name}: o servidor caiu antes (codigo ${saiu})`); continue; }
      try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
        failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`);
      }
    }
  } catch (e) { failed++; console.error('  ✗ preparo:', e.message); }
  if (cru) await new Promise((r) => cru.close(() => r()));
  await descer();
  try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
