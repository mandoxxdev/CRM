/**
 * Etapa 150 (Comercial/Operacional) — grupos de produto (8 rotas), produtos (11) e variaveis tecnicas (7) exigem o modulo pela regua
 * da TELA, pelo `index.js` de verdade (pasta vazia): C346, C347.
 *
 *   RN-150.01  as 8 de grupos e 9 de produtos que so o Comercial usa passam pelo `exigirComercialNasPropostas` logo depois do login
 *              (antes do multer nas duas fotos multipart: o arquivo do barrado nao chega ao disco)
 *   RN-150.02  GET /api/produtos/codigo/:codigo passa pelo `exigirComercialOuOperacionalNaOS` (a OS abre no Comercial e na Fabrica)
 *   RN-150.03  clonar produto continua so do administrador, sem o portao
 *   RN-150.04  as 7 de variaveis tecnicas passam pelo `exigirComercialNasVariaveisTecnicas` (o Comercial OU o administrador do
 *              Comercial com o Administrativo — a aba Variaveis tecnicas de Configuracoes, B958)
 *   RN-150.05  PROPOSTAS_PORTAO_DE_MODULO=desligado: as 25 voltam ao so login
 *
 * Molde: familiasListaOsPortao.api.test.js (Etapa 149). Plano:
 * docs/superpowers/plans/2026-10-18-almoxarifado-etapa150-grupos-produtos-e-variaveis-pelo-modulo.md
 * Executar: cd server && node tests/api/produtosGruposVariaveisPortao.api.test.js
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
// `u` com o caminho inteiro (com ou sem o /api — o apelido GET /grupos nao tem o prefixo)
async function cru(m, u, tok, body, ms = 30000) {
  const headers = { ...(tok ? { Authorization: 'Bearer ' + tok } : {}) };
  let corpo;
  if (body instanceof FormData) corpo = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; corpo = JSON.stringify(body); }
  const r = await fetch(`http://127.0.0.1:${porta}${u}`, { method: m, headers, body: corpo, signal: AbortSignal.timeout(ms) });
  const buf = Buffer.from(await r.arrayBuffer());
  let x = buf.toString('utf8'); try { x = JSON.parse(x); } catch (e) { /* sem JSON */ }
  return [r.status, x];
}
const j = (m, u, tok, body, ms) => cru(m, `/api${u}`, tok, body, ms);
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e150seed@t.com', senha: 'E150seed!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir(extraEnv = {}) {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET', 'API_URL',
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
let banco = null;
function abrirCru() {
  banco = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  banco.configure('busyTimeout', 15000);
}
const run = (sql, p = []) => new Promise((res, rej) => banco.run(sql, p, function feito(e) { if (e) rej(e); else res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => banco.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const ctx = { n: 0 };
const { temModuloComoATela, passaPeloCaminhoDeConfiguracoes } = require('../../services/portaoDasPropostas');

const NEGADO_COM = { error: 'Acesso negado ao módulo', modulo: 'comercial' };
const NEGADO_OS = { error: 'Acesso negado ao módulo', modulo: ['comercial', 'operacional'] };
const CAMINHO_CONFIG = { admin: 'comercial', tela: 'administrativo' };
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_URL = `data:image/png;base64,${PNG}`;
const MSG_CLONAR = { error: 'Apenas administradores podem clonar produtos' };

// ── as rotas, lidas do fonte ──────────────────────────────────────────────────────────────
const FONTE = fs.readFileSync(path.join(SERVER_DIR, 'index.js'), 'utf8');
const REGISTRO = /^app\.(get|post|put|patch|delete)\('([^']+)', ([^\n]*)$/gm;
const TODOS = [...FONTE.matchAll(REGISTRO)].map((m) => ({ metodo: m[1].toUpperCase(), rota: m[2], resto: m[3] }));
const GRUPOS = [
  ['GET', '/api/grupos'], ['GET', '/grupos'], ['GET', '/api/grupos/:id'], ['POST', '/api/grupos'], ['PUT', '/api/grupos/:id'],
  ['DELETE', '/api/grupos/:id'], ['POST', '/api/grupos/:id/foto'], ['POST', '/api/grupos/:id/foto-base64'],
];
const PRODUTOS = [
  ['POST', '/api/produtos/verificar-existente'], ['GET', '/api/produtos'], ['GET', '/api/produtos/proximo-codigo'], ['GET', '/api/produtos/:id'],
  ['POST', '/api/produtos'], ['PUT', '/api/produtos/:id'], ['DELETE', '/api/produtos/:id'], ['POST', '/api/produtos/zerar-modelo-antigo'],
  ['POST', '/api/produtos/:id/imagem'],
];
const CODIGO = [['GET', '/api/produtos/codigo/:codigo']];
const VARIAVEIS = [
  ['GET', '/api/variaveis-tecnicas'], ['GET', '/api/variaveis-tecnicas/categorias'], ['GET', '/api/variaveis-tecnicas/opcoes/:chave'],
  ['GET', '/api/variaveis-tecnicas/:id'], ['POST', '/api/variaveis-tecnicas'], ['PUT', '/api/variaveis-tecnicas/:id'],
  ['DELETE', '/api/variaveis-tecnicas/:id'],
];
const CLONAR = ['POST', '/api/produtos/:id/clonar'];
const PORTAO = {
  grupos: 'exigirComercialNasPropostas', produtos: 'exigirComercialNasPropostas', codigo: 'exigirComercialOuOperacionalNaOS',
  variaveis: 'exigirComercialNasVariaveisTecnicas',
};
const achar = ([m, r], grupo) => ({ ...(TODOS.find((x) => x.metodo === m && x.rota === r) || { metodo: m, rota: r, resto: '(nao registrada)' }), grupo });
const VINTE_E_CINCO = [
  ...GRUPOS.map((r) => achar(r, 'grupos')), ...PRODUTOS.map((r) => achar(r, 'produtos')),
  ...CODIGO.map((r) => achar(r, 'codigo')), ...VARIAVEIS.map((r) => achar(r, 'variaveis')),
];

function caminhoDe(r) {
  const id = r.grupo === 'grupos' ? ctx.grupo : r.grupo === 'variaveis' ? ctx.variavel : ctx.produto;
  return r.rota.replace(':codigo', encodeURIComponent(ctx.codigo)).replace(':chave', 'e150var').replace(':id', String(id));
}
function corpoDe(r) {
  if (r.metodo === 'GET' || r.metodo === 'DELETE') return undefined;
  if (r.rota.endsWith('/foto') || r.rota.endsWith('/imagem')) {
    const fd = new FormData();
    fd.append(r.rota.endsWith('/foto') ? 'foto' : 'imagem', new Blob([Buffer.from(PNG, 'base64')], { type: 'image/png' }), 'barrado150.png');
    return fd;
  }
  if (r.rota.endsWith('/foto-base64')) return { foto_base64: PNG_URL };
  if (r.rota.endsWith('/verificar-existente')) return { familia: 'FAM150', especificacoes: {} };
  if (r.rota.endsWith('/zerar-modelo-antigo')) return { ids: [ctx.produto] };
  if (r.rota === '/api/produtos') return { codigo: `BARR150-${++ctx.n}`, nome: 'CRIADO PELO BARRADO', familia: 'FAM150' };
  if (r.rota === '/api/produtos/:id') return { codigo: ctx.codigo, nome: 'EDITADO PELO BARRADO', familia: 'FAM150' };
  if (r.rota === '/api/variaveis-tecnicas') return { nome: `BARRADA ${++ctx.n}`, chave: `barrada150_${ctx.n}` };
  if (r.rota === '/api/variaveis-tecnicas/:id') return { nome: 'EDITADA PELO BARRADO', chave: 'e150var' };
  if (r.rota === '/api/grupos') return { nome: `CRIADO PELO BARRADO ${++ctx.n}`, numero: 70 };
  return { nome: 'RENOMEADO PELO BARRADO', numero: 70 };
}
const chamar = (r, tok) => cru(r.metodo, caminhoDe(r), tok, corpoDe(r));

function arquivosDaPasta() {
  const out = [];
  const andar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'backups') andar(p); }
      else if (!/database\.sqlite|index\.log|\.runtime-secrets/.test(e.name)) out.push(path.relative(pasta, p));
    }
  };
  andar(pasta);
  return out.sort();
}
const retrato = async () => JSON.stringify([
  await all('SELECT * FROM grupos_produto ORDER BY id'), await all('SELECT * FROM produtos ORDER BY id'),
  await all('SELECT * FROM variaveis_tecnicas ORDER BY id'),
]);
const negados = async (id) => all("SELECT modulo, nome_modulo, COUNT(*) AS n FROM logs_auditoria WHERE tipo = 'acesso_negado' AND usuario_id = ? GROUP BY modulo, nome_modulo ORDER BY modulo", [id]);

async function usuario(nome, { role = 'usuario', grupos = [], diretas = [], diretasCrus = [], diretasGrupo0 = [], adminModulos = null } = {}) {
  const email = `${nome}@e150.t`;
  const [s, u] = await j('POST', '/usuarios', ctx.T, { nome, email, senha: 'Senha!150p', cargo: 'C', role, setor: '' });
  assert.ok(s === 200 || s === 201, `usuario ${nome}: ${s} ${JSON.stringify(u)}`);
  const id = (await all('SELECT id FROM usuarios WHERE email = ?', [email]))[0].id;
  for (const g of grupos) await run('INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES (?, ?)', [id, g]);
  for (const m of diretas) await run("INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, NULL, ?, 'acesso', 1)", [id, m]);
  for (const [m, acao, p] of diretasCrus) await run('INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, NULL, ?, ?, ?)', [id, m, acao, p]);
  for (const m of diretasGrupo0) await run("INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, 0, ?, 'acesso', 1)", [id, m]);
  if (adminModulos) await run('UPDATE usuarios SET admin_modulos = ? WHERE id = ?', [JSON.stringify(adminModulos), id]);
  return { id, nome, role, email, adminModulos };
}
async function logar(u) {
  const [s, l] = await j('POST', '/auth/login', null, { email: u.email, senha: 'Senha!150p' });
  assert.strictEqual(s, 200, `login ${u.nome}: ${JSON.stringify(l)}`);
  u.T = l.token;
}

// ── RN-150.01/02/03/04: a regua pelo fonte ────────────────────────────────────────────────
test('[RN-150.01/02/03/04, C346, C347] fonte: as 25 com o portao certo como 2o middleware (antes do multer), o clonar sem portao, cada uma registrada uma vez e so no index.js', () => {
  assert.deepStrictEqual(VINTE_E_CINCO.filter((r) => r.resto === '(nao registrada)').map((r) => r.rota), [], 'uma rota sumiu do fonte');
  // regua independente: todo registro (qualquer verbo, use/all/route, qualquer aspa, caminho em lista) de grupos/produtos/variaveis
  const reCat = /\.(get|post|put|patch|delete|all|use|route)\(\s*\[?\s*["'`]\/(api\/)?(grupos|produtos|variaveis-tecnicas)(["'`/])/;
  const verboCaminho = FONTE.split('\n').filter((l) => reCat.test(l))
    .map((l) => { const m = l.match(/\.(\w+)\(\s*\[?\s*["'`]([^"'`]+)/); return `${m[1].toUpperCase()} ${m[2]}`; }).sort();
  const esperado = [...GRUPOS, ...PRODUTOS, ...CODIGO, ...VARIAVEIS, CLONAR].map(([m, r]) => `${m} ${r}`).sort();
  assert.deepStrictEqual(verboCaminho, esperado, 'registros fora do formato app.<verbo>(\'...\', ...) numa linha so, ou a mais');
  // nenhum outro arquivo do servidor registra estes caminhos (Compras monta /api/compras/grupos — outra tabela)
  const fora = []; const vistos = [];
  const varrer = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', 'tests', 'data', 'uploads', 'backups'].includes(e.name) || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) varrer(p);
      else if (e.name.endsWith('.js') && p !== path.join(SERVER_DIR, 'index.js')) {
        const src = fs.readFileSync(p, 'utf8');
        vistos.push(path.relative(SERVER_DIR, p));
        if (/["'`]\/api\/(grupos|produtos|variaveis-tecnicas)["'`/]/.test(src) || /\.(get|post|put|patch|delete|all|use|route)\(\s*\[?\s*["'`]\/(grupos|produtos|variaveis-tecnicas)["'`/]/.test(src)) fora.push(path.relative(SERVER_DIR, p));
      }
    }
  };
  varrer(SERVER_DIR);
  assert.deepStrictEqual(fora, [], 'rota registrada fora do index.js escaparia desta regua');
  // controle: a varredura enxerga routes/ e services/ (o router de Compras registra /api/compras/grupos — outro caminho, nao acusa)
  assert.ok(vistos.includes(path.join('routes', 'compras.js')) && vistos.includes(path.join('services', 'portaoDasPropostas.js')), 'a varredura nao enxerga routes/ ou services/');
  assert.ok(!/app\.use\(\s*["'`]\/(api\/)?(grupos|produtos|variaveis-tecnicas)["'`/]/.test(FONTE), 'um app.use no prefixo atenderia antes do portao');
  const sem = VINTE_E_CINCO.filter((r) => !r.resto.startsWith(`authenticateToken, ${PORTAO[r.grupo]}, `))
    .map((r) => `${r.metodo} ${r.rota}: ${r.resto.slice(0, 80)}`);
  assert.deepStrictEqual(sem, []);
  // o multer depois do portao: o arquivo do barrado nao chega ao disco
  assert.ok(achar(['POST', '/api/grupos/:id/foto']).resto.startsWith("authenticateToken, exigirComercialNasPropostas, uploadGrupo.single('foto'), "), 'a foto do grupo: o multer antes do portao');
  assert.ok(achar(['POST', '/api/produtos/:id/imagem']).resto.startsWith("authenticateToken, exigirComercialNasPropostas, uploadProduto.single('imagem'), "), 'a imagem do produto: o multer antes do portao');
  assert.strictEqual(achar(CLONAR).resto, 'authenticateToken, (req, res) => {', 'RN-150.03: o clonar ganhou middleware');
  assert.ok(FONTE.includes("const exigirComercialNasVariaveisTecnicas = portaoDasPropostas.exigir('comercial', { tambemAdminDoModuloCom: { admin: 'comercial', tela: 'administrativo' } });"),
    'o portao das variaveis tecnicas nao e o do plano');
});

// ── RN-150.01/02/04: pela rota, cada uma das 25 ───────────────────────────────────────────
test('[RN-150.01/02/04, C346, C347] o usuario que a tela barra do Comercial, da Fabrica e de Configuracoes (so a direta do Almoxarifado) toma 403 em cada uma das 25 — e nada muda, nem no disco', async () => {
  const b = ctx.u.soAlmox;
  const antes = await retrato();
  const arquivos0 = arquivosDaPasta();
  assert.ok(antes.includes('E150-PROD-01') && antes.includes('e150var') && antes.includes('GRUPO 150'), 'o retrato nao ve o que o preparo gravou');
  assert.deepStrictEqual(await negados(b.id), [], 'o usuario barrado ja tinha log');
  const errados = [];
  for (const r of VINTE_E_CINCO) {
    const [s, x] = await chamar(r, b.T);
    const esperado = r.grupo === 'codigo' ? NEGADO_OS : NEGADO_COM;
    if (s !== 403 || JSON.stringify(x) !== JSON.stringify(esperado)) errados.push(`${r.metodo} ${r.rota}: ${s} ${JSON.stringify(x).slice(0, 80)}`);
  }
  assert.deepStrictEqual(errados, []);
  await pausa(1500);
  assert.strictEqual(await retrato(), antes, 'uma rota barrada mudou um grupo, um produto ou uma variavel');
  assert.deepStrictEqual(arquivosDaPasta(), arquivos0, 'a foto do grupo ou a imagem do produto do barrado chegou ao disco');
  assert.deepStrictEqual(await negados(b.id), [
    { modulo: 'comercial', nome_modulo: 'Comercial', n: 24 },
    { modulo: 'comercial|operacional', nome_modulo: 'Comercial ou Operacional', n: 1 },
  ], 'cada 403 registra o acesso negado no log, com o modulo do portao');
});

// ── as metades positivas, em fluxo, pela rota ─────────────────────────────────────────────
test('[RN-150.01/02] o Comercial faz o catalogo inteiro: o grupo (criar -> fotos -> renomear -> ler) e o produto (proximo codigo -> criar -> ler -> pelo codigo -> editar -> imagem -> verificar -> lista -> zerar -> apagar)', async () => {
  const u = ctx.u.diretaComercial;
  const ok = (r, st = 200) => assert.ok(r[0] === st, `${st} esperado: ${r[0]} ${JSON.stringify(r[1]).slice(0, 200)}`);
  const g = await j('POST', '/grupos', u.T, { nome: 'GRUPO COM 150', numero: 71 });
  ok(g, 201);
  const gid = g[1].id;
  const foto = await j('POST', `/grupos/${gid}/foto-base64`, u.T, { foto_base64: PNG_URL });
  ok(foto);
  assert.ok(fs.existsSync(path.join(pasta, 'uploads', 'grupos-produtos', foto[1].foto)), 'a foto do Comercial nao foi gravada no disco');
  const fd = new FormData();
  fd.append('foto', new Blob([Buffer.from(PNG, 'base64')], { type: 'image/png' }), 'grupo150.png');
  const foto2 = await j('POST', `/grupos/${gid}/foto`, u.T, fd);
  ok(foto2);
  assert.ok(fs.existsSync(path.join(pasta, 'uploads', 'grupos-produtos', foto2[1].foto)), 'a foto multipart do Comercial nao foi gravada');
  ok(await j('PUT', `/grupos/${gid}`, u.T, { nome: 'GRUPO COM 150 RENOMEADO', numero: 71 }));
  const [sg, lido] = await j('GET', `/grupos/${gid}`, u.T);
  assert.deepStrictEqual([sg, lido.nome, lido.foto], [200, 'GRUPO COM 150 RENOMEADO', foto2[1].foto]);
  const [sl, lista] = await cru('GET', '/grupos', u.T);
  assert.ok(sl === 200 && lista.some((x) => x.id === gid), `apelido: ${sl}`);
  const [sl2, lista2] = await j('GET', '/grupos', u.T);
  assert.ok(sl2 === 200 && lista2.some((x) => x.id === gid), `${sl2}`);

  const [sc, prox] = await j('GET', '/produtos/proximo-codigo?familia=FAM150&nome=Produto', u.T);
  assert.strictEqual(sc, 200, JSON.stringify(prox));
  const p = await j('POST', '/produtos', u.T, { codigo: 'E150-COM-01', nome: 'Produto do Comercial', familia: 'FAM150', classificacao_area: 'NAO CLASSIFICADA', preco_base: 15, especificacoes_tecnicas: JSON.stringify({ e150var: 'A' }) });
  ok(p);
  const pid = p[1].id;
  const [sp, lidoP] = await j('GET', `/produtos/${pid}`, u.T);
  assert.deepStrictEqual([sp, lidoP.codigo], [200, 'E150-COM-01']);
  const [spc, peloCodigo] = await j('GET', '/produtos/codigo/E150-COM-01', u.T);
  assert.deepStrictEqual([spc, peloCodigo.id], [200, pid]);
  ok(await j('PUT', `/produtos/${pid}`, u.T, { codigo: 'E150-COM-01', nome: 'Produto do Comercial editado', familia: 'FAM150', preco_base: 16 }));
  assert.strictEqual((await all('SELECT nome FROM produtos WHERE id = ?', [pid]))[0].nome, 'PRODUTO DO COMERCIAL EDITADO');
  const fdi = new FormData();
  fdi.append('imagem', new Blob([Buffer.from(PNG, 'base64')], { type: 'image/png' }), 'prod150.png');
  ok(await j('POST', `/produtos/${pid}/imagem`, u.T, fdi));
  const img = (await all('SELECT imagem FROM produtos WHERE id = ?', [pid]))[0].imagem;
  assert.ok(img && fs.existsSync(path.join(pasta, 'uploads', 'produtos', img)), `a imagem do Comercial nao foi gravada: ${img}`);
  const [sv, ver] = await j('POST', '/produtos/verificar-existente', u.T, { familia: 'FAM150', especificacoes: {} });
  assert.ok(sv === 200 && ver.existente === true && ver.produtos.some((x) => x.id === pid), JSON.stringify(ver).slice(0, 200));
  const [sf, daFamilia] = await j('GET', '/produtos?ativo=true&familia=FAM150', u.T);
  assert.ok(sf === 200 && daFamilia.some((x) => x.id === pid), `${sf}`);
  ok(await j('POST', '/produtos/zerar-modelo-antigo', u.T, { ids: [pid] }));
  assert.strictEqual((await all('SELECT especificacoes_tecnicas FROM produtos WHERE id = ?', [pid]))[0].especificacoes_tecnicas, '{}');
  ok(await j('DELETE', `/produtos/${pid}`, u.T));
  assert.strictEqual((await all('SELECT ativo FROM produtos WHERE id = ?', [pid]))[0].ativo, 0, 'apagar nao desativou o produto');
  ok(await j('DELETE', `/grupos/${gid}`, u.T));
  assert.strictEqual((await all('SELECT ativo FROM grupos_produto WHERE id = ?', [gid]))[0].ativo, 0, 'apagar nao desativou o grupo');
  await pausa(500);
  assert.deepStrictEqual(await negados(u.id), [], 'o portao registrou acesso negado para quem passou');
});

test('[RN-150.04] o Comercial faz as variaveis tecnicas (criar -> lista -> categorias -> :id -> opcoes -> editar -> apagar)', async () => {
  const u = ctx.u.diretaComercial;
  await fluxoDasVariaveis(u, 'com');
});

async function fluxoDasVariaveis(u, sufixo) {
  const [sc, criada] = await j('POST', '/variaveis-tecnicas', u.T, { nome: `Var ${sufixo} 150`, chave: `var_${sufixo}_150`, categoria: `CAT ${sufixo}`, tipo: 'lista', opcoes: ['X', 'Y'] });
  assert.strictEqual(sc, 201, JSON.stringify(criada));
  const [sl, lista] = await j('GET', '/variaveis-tecnicas?ativo=true', u.T);
  assert.ok(sl === 200 && lista.some((v) => v.id === criada.id), `${sl}`);
  const [sk, cats] = await j('GET', '/variaveis-tecnicas/categorias', u.T);
  assert.ok(sk === 200 && cats.includes(`CAT ${sufixo}`), JSON.stringify(cats));
  const [si, lida] = await j('GET', `/variaveis-tecnicas/${criada.id}`, u.T);
  assert.deepStrictEqual([si, lida.chave], [200, `var_${sufixo}_150`]);
  const [so, ops] = await j('GET', `/variaveis-tecnicas/opcoes/var_${sufixo}_150`, u.T);
  assert.deepStrictEqual([so, ops.opcoes.map((o) => o.valor)], [200, ['X', 'Y']]);
  const [su, mudada] = await j('PUT', `/variaveis-tecnicas/${criada.id}`, u.T, { nome: `Var ${sufixo} 150 editada`, chave: `var_${sufixo}_150`, categoria: `CAT ${sufixo}`, tipo: 'lista', opcoes: ['X', 'Y', 'Z'] });
  assert.deepStrictEqual([su, mudada.nome], [200, `VAR ${sufixo.toUpperCase()} 150 EDITADA`]);
  const [sd] = await j('DELETE', `/variaveis-tecnicas/${criada.id}`, u.T);
  assert.strictEqual(sd, 200);
  assert.strictEqual((await all('SELECT ativo FROM variaveis_tecnicas WHERE id = ?', [criada.id]))[0].ativo, 0, 'apagar nao desativou a variavel');
  await pausa(500);
  assert.deepStrictEqual(await negados(u.id), [], 'o portao registrou acesso negado para quem passou');
}

test('[RN-150.04] o administrador do Comercial com o Administrativo faz a aba Variaveis tecnicas de Configuracoes inteira — e toma 403 no catalogo', async () => {
  const u = ctx.u.adminComercialComAdministrativo;
  await fluxoDasVariaveis(u, 'cfg');
  const [s1, x1] = await j('GET', '/grupos', u.T);
  const [s2, x2] = await j('GET', '/produtos', u.T);
  const [s3, x3] = await j('PUT', `/grupos/${ctx.grupo}`, u.T, { nome: 'RENOMEADO POR CONFIG', numero: 70 });
  const [s4, x4] = await j('GET', `/produtos/codigo/${ctx.codigo}`, u.T);
  assert.deepStrictEqual([s1, x1, s2, x2, s3, x3, s4, x4], [403, NEGADO_COM, 403, NEGADO_COM, 403, NEGADO_COM, 403, NEGADO_OS]);
  assert.strictEqual((await all('SELECT nome FROM grupos_produto WHERE id = ?', [ctx.grupo]))[0].nome, 'GRUPO 150', 'renomear passou');
});

test('[RN-150.02, integracao] o produto criado pelo Comercial e lido pelo codigo por quem so tem o Operacional, abrindo a OS da Fabrica (OS -> itens -> produto pelo codigo) — e o mesmo toma 403 no catalogo e nas variaveis', async () => {
  const c = ctx.u.diretaComercial;
  const [sp, p] = await j('POST', '/produtos', c.T, { codigo: 'E150-OS-01', nome: 'Produto da OS', familia: 'FAM150', classificacao_area: 'NAO CLASSIFICADA', preco_base: 20 });
  assert.strictEqual(sp, 200, JSON.stringify(p));
  const [si, item] = await j('POST', '/operacional/os-itens', ctx.T, { os_id: ctx.os, item_numero: 1, descricao: 'Item 150', codigo_produto: 'E150-OS-01' });
  assert.strictEqual(si, 200, JSON.stringify(item));
  for (const k of ['soOperacional', 'grupoOperacional']) {
    const u = ctx.u[k];
    const [so, o] = await j('GET', `/operacional/ordens-servico/${ctx.os}`, u.T);
    assert.deepStrictEqual([k, so, o.numero_os], [k, 200, 'OS-150']);
    const [sit, itens] = await j('GET', `/operacional/ordens-servico/${ctx.os}/itens`, u.T);
    assert.ok(sit === 200 && itens.some((x) => x.codigo_produto === 'E150-OS-01'), `${k} itens: ${sit} ${JSON.stringify(itens).slice(0, 160)}`);
    const [sc, prod] = await j('GET', '/produtos/codigo/E150-OS-01', u.T);
    assert.deepStrictEqual([k, sc, prod.id], [k, 200, p.id]);
    await pausa(300);
    assert.deepStrictEqual(await negados(u.id), [], `${k}: o portao registrou acesso negado para quem passou`);
  }
  const op = ctx.u.soOperacional;
  const [s1, x1] = await j('GET', '/produtos', op.T);
  const [s2, x2] = await j('GET', `/produtos/${p.id}`, op.T);
  const [s3, x3] = await j('GET', '/variaveis-tecnicas', op.T);
  const [s4, x4] = await j('GET', '/grupos', op.T);
  assert.deepStrictEqual([s1, x1, s2, x2, s3, x3, s4, x4], [403, NEGADO_COM, 403, NEGADO_COM, 403, NEGADO_COM, 403, NEGADO_COM]);
});

test('[RN-150.03] clonar produto continua so do administrador: o Comercial e o Operacional tomam a frase de sempre, sem log de acesso negado; o administrador clona', async () => {
  const [s1, x1] = await j('POST', `/produtos/${ctx.produto}/clonar`, ctx.u.diretaComercial.T, {});
  const [s2, x2] = await j('POST', `/produtos/${ctx.produto}/clonar`, ctx.u.soOperacional.T, {});
  assert.deepStrictEqual([s1, x1, s2, x2], [403, MSG_CLONAR, 403, MSG_CLONAR]);
  const [s3, x3] = await j('POST', `/produtos/${ctx.produto}/clonar`, ctx.T, {});
  assert.strictEqual(s3, 200, JSON.stringify(x3));
  await pausa(500);
  const dc = await negados(ctx.u.diretaComercial.id);
  assert.deepStrictEqual(dc, [], 'o clonar passou a registrar acesso negado');
});

// ── por usuario, decide como a tela ───────────────────────────────────────────────────────
test('[RN-150.01/02/04] por usuario: o catalogo decide como a tela do Comercial; o produto pelo codigo, como a OS (Comercial ou Fabrica); as variaveis, como o Comercial ou Configuracoes', async () => {
  const esperado = {
    semNada: [200, 200, 200], diretaComercial: [200, 200, 200], grupoComercial: [200, 200, 200], grupoVazio: [200, 200, 200],
    superU: [200, 200, 200], roleAdmin: [200, 200, 200], soOperacional: [403, 200, 403], grupoOperacional: [403, 200, 403],
    operacionalGrupoInativo: [403, 403, 403], operacionalPermissao0: [403, 403, 403], comercialPermissao0: [403, 403, 403],
    soAlmox: [403, 403, 403], soEngProjetos: [403, 403, 403], adminComercialComAdministrativo: [403, 403, 200],
    adminComercialSemAdministrativo: [403, 403, 403], soAdministrativo: [403, 403, 403], operacionalGrupo0: [403, 403, 403],
  };
  const linhas = [];
  for (const k of Object.keys(esperado)) {
    const u = ctx.u[k];
    const [sg, g] = await j('GET', `/usuarios/${u.id}/grupos`, ctx.T);
    assert.strictEqual(sg, 200, JSON.stringify(g));
    const quem = { id: u.id, role: u.role, is_superadmin: u.superadmin ? 1 : 0, admin_modulos: u.adminModulos ? JSON.stringify(u.adminModulos) : '[]' };
    const telaCom = temModuloComoATela(quem, g.permissoes, ['comercial']);
    const telaOS = temModuloComoATela(quem, g.permissoes, ['comercial', 'operacional']);
    const telaVar = telaCom || passaPeloCaminhoDeConfiguracoes(quem, g.permissoes, CAMINHO_CONFIG);
    const [s1] = await j('GET', '/grupos', u.T);
    const [s2] = await cru('GET', '/grupos', u.T);
    const [s3] = await j('GET', `/produtos/${ctx.produto}`, u.T);
    const [s4] = await j('GET', '/produtos?ativo=true', u.T);
    const [s5] = await j('GET', `/produtos/codigo/${ctx.codigo}`, u.T);
    const [s6] = await j('GET', '/variaveis-tecnicas', u.T);
    const [s7] = await j('GET', '/variaveis-tecnicas/opcoes/e150var', u.T);
    linhas.push([k, s1, s2, s3, s4, s5, s6, s7, telaCom ? 200 : 403, telaOS ? 200 : 403, telaVar ? 200 : 403]);
  }
  assert.deepStrictEqual(linhas, Object.entries(esperado).map(([k, [c, o, v]]) => [k, c, c, c, c, o, v, v, c, o, v]));
});

// ── RN-150.05 e o BUSY: reboots ───────────────────────────────────────────────────────────
test('[RN-150.05] PROPOSTAS_PORTAO_DE_MODULO=desligado: as 25 abrem ao barrado (o aviso do boot as cita); ligado de novo, barra', async () => {
  const b = ctx.u.soAlmox;
  assert.ok(!/PROPOSTAS_PORTAO_DE_MODULO=desligado/.test(fs.readFileSync(logArq, 'utf8')), 'o aviso do desligado saiu com o portao ligado');
  await descer();
  ctx.T = await subir({ PROPOSTAS_PORTAO_DE_MODULO: 'desligado' });
  try {
    await logar(b);
    const log = fs.readFileSync(logArq, 'utf8');
    const aviso = (log.match(/⚠️ PROPOSTAS_PORTAO_DE_MODULO=desligado[^\n]*/) || [''])[0];
    assert.ok(/grupos de produto, dos produtos e das variáveis técnicas NAO exigem o Comercial/.test(aviso) && /produto pelo código NAO exige o Comercial ou o Operacional \(só o login\)/.test(aviso)
      && /cadastro de família NAO exigem o Comercial \(só o login\)/.test(aviso) && /a lista de ordens de serviço do Operacional volta à régua antiga do módulo/.test(aviso)
      && /ordem de serviço pelo número/.test(aviso) && /modelo de contrato por família/.test(aviso) && /modelo da proposta/.test(aviso) && /listas de preço/.test(aviso),
    `o aviso do boot nao cita os grupos, os produtos, as variaveis e o produto pelo codigo: ${aviso.slice(0, 200)}`);
    const errados = [];
    for (const r of VINTE_E_CINCO.filter((x) => x.metodo === 'GET')) {
      const [s] = await chamar(r, b.T);
      if (s !== 200) errados.push(`${r.metodo} ${r.rota}: ${s}`);
    }
    const [sc, criada] = await j('POST', '/variaveis-tecnicas', b.T, { nome: 'DESLIGADO 150', chave: 'desligado_150' });
    if (sc !== 201) errados.push(`POST variaveis: ${sc} ${JSON.stringify(criada)}`);
    const [sg] = await j('PUT', `/grupos/${ctx.grupo}`, b.T, { nome: 'GRUPO 150', numero: 70 });
    if (sg !== 200) errados.push(`PUT grupo: ${sg}`);
    assert.deepStrictEqual(errados, []);
  } finally {
    await descer();
    ctx.T = await subir();
  }
  await logar(b);
  const [s6, x6] = await j('GET', '/grupos', b.T);
  const [s7, x7] = await j('GET', `/produtos/codigo/${ctx.codigo}`, b.T);
  const [s8, x8] = await j('GET', '/variaveis-tecnicas', b.T);
  assert.deepStrictEqual([s6, x6, s7, x7, s8, x8], [403, NEGADO_COM, 403, NEGADO_OS, 403, NEGADO_COM]);
});

test('[RN-150.01/02/04] SQLITE_BUSY ao ler as permissoes: 503 no catalogo, no produto pelo codigo e nas variaveis; outro erro: 500; o administrador nem le', async () => {
  const b = ctx.u.soOperacional;
  const FALHA = 'p\\.modulo, p\\.permissao FROM grupos_permissoes';
  await descer();
  ctx.T = await subir({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'all', FALHA_SQL_MSG: 'SQLITE_BUSY: database is locked' });
  try {
    await logar(b);
    const corpo503 = { error: 'Banco temporariamente ocupado. Tente novamente em alguns segundos.', code: 'SQLITE_BUSY', retryAfter: 3, context: 'portao:propostas' };
    const [s1, x1] = await j('GET', '/grupos', b.T);
    const [s2, x2] = await j('GET', `/produtos/codigo/${ctx.codigo}`, b.T);
    const [s3, x3] = await j('GET', '/variaveis-tecnicas', b.T);
    assert.deepStrictEqual([s1, x1, s2, x2, s3, x3], [503, corpo503, 503, corpo503, 503, corpo503]);
    const [sa] = await j('GET', `/produtos/codigo/${ctx.codigo}`, ctx.T);
    assert.strictEqual(sa, 200, 'o administrador passa sem ler as linhas');
    await descer();
    ctx.T = await subir({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'all' });
    await logar(b);
    const E500 = { error: 'Erro ao verificar permissões' };
    const [s4, x4] = await j('PUT', `/produtos/${ctx.produto}`, b.T, { codigo: ctx.codigo, nome: 'X' });
    const [s5, x5] = await j('GET', `/produtos/codigo/${ctx.codigo}`, b.T);
    const [s6, x6] = await j('DELETE', `/variaveis-tecnicas/${ctx.variavel}`, b.T);
    assert.deepStrictEqual([s4, x4, s5, x5, s6, x6], [500, E500, 500, E500, 500, E500]);
    assert.ok(/\[falha injetada\]\s+SELECT p\.modulo, p\.permissao FROM grupos_permissoes/.test(fs.readFileSync(logArq, 'utf8')),
      'a falha injetada nao casou com a leitura do portao (o teste nao provou nada)');
  } finally {
    await descer();
    ctx.T = await subir();
  }
  assert.strictEqual((await all('SELECT ativo FROM variaveis_tecnicas WHERE id = ?', [ctx.variavel]))[0].ativo, 1, 'o DELETE com o portao em erro apagou a variavel');
});

(async () => {
  console.log('\n=== Etapa 150: grupos de produto, produtos e variaveis tecnicas exigem o modulo pela regua da tela (C346, C347) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e150-cat-'));
    ctx.T = await subir();
    abrirCru();
    // o que as rotas com :id vao achar — gravado pelo administrador: um grupo, um produto, uma variavel (lista) e uma OS
    const [sg, g] = await j('POST', '/grupos', ctx.T, { nome: 'GRUPO 150', numero: 70 });
    assert.strictEqual(sg, 201, JSON.stringify(g));
    ctx.grupo = g.id;
    ctx.codigo = 'E150-PROD-01';
    const [sp, p] = await j('POST', '/produtos', ctx.T, { codigo: ctx.codigo, nome: 'Produto 150', familia: 'FAM150', classificacao_area: 'NAO CLASSIFICADA', preco_base: 10, especificacoes_tecnicas: JSON.stringify({ e150var: 'A' }) });
    assert.strictEqual(sp, 200, JSON.stringify(p));
    ctx.produto = p.id;
    const [sv, v] = await j('POST', '/variaveis-tecnicas', ctx.T, { nome: 'Variavel 150', chave: 'e150var', categoria: 'CAT 150', tipo: 'lista', opcoes: ['A', 'B'] });
    assert.strictEqual(sv, 201, JSON.stringify(v));
    ctx.variavel = v.id;
    const [so, o] = await j('POST', '/operacional/ordens-servico', ctx.T, { numero_os: 'OS-150', tipo_os: 'FABRICACAO', data_abertura: '2026-10-18', descricao: 'OS da etapa 150', status: 'em_andamento' });
    assert.strictEqual(so, 200, JSON.stringify(o));
    ctx.os = o.id;
    assert.ok(Number.isInteger(ctx.os), `a OS nao devolveu o id: ${JSON.stringify(o)}`);
    // grupos gravados por fora: 901 ativo com Comercial, 903 ativo sem linha, 904 ativo com Operacional, 905 inativo com Operacional
    await run("INSERT INTO grupos_permissoes (id, nome, ativo) VALUES (901,'G-com',1),(903,'G-vazio',1),(904,'G-op',1),(905,'G-op-inat',0)");
    await run("INSERT INTO permissoes (grupo_id, modulo, acao, permissao) VALUES (901,'comercial','acesso',1),(904,'operacional','acesso',1),(905,'operacional','acesso',1)");
    ctx.u = {
      semNada: await usuario('semnada'),
      diretaComercial: await usuario('dcom', { diretas: ['comercial'] }),
      grupoComercial: await usuario('gcom', { grupos: [901] }),
      grupoVazio: await usuario('gvazio', { grupos: [903] }),
      superU: await usuario('super', { diretas: ['almoxarifado'] }),
      roleAdmin: await usuario('radm', { role: 'admin', diretas: ['almoxarifado'] }),
      soOperacional: await usuario('sop', { diretas: ['operacional'] }),
      grupoOperacional: await usuario('gop', { grupos: [904] }),
      operacionalGrupoInativo: await usuario('gopi', { grupos: [905], diretas: ['almoxarifado'] }),
      operacionalPermissao0: await usuario('op0', { diretasCrus: [['operacional', 'acesso', 0]] }),
      comercialPermissao0: await usuario('cp0', { diretasCrus: [['comercial', 'acesso', 0]] }),
      soAlmox: await usuario('salm', { diretas: ['almoxarifado'] }),
      soEngProjetos: await usuario('sengp', { diretas: ['engenharia_projetos'] }),
      adminComercialComAdministrativo: await usuario('acadm', { diretas: ['administrativo'], adminModulos: ['comercial'] }),
      adminComercialSemAdministrativo: await usuario('acsem', { diretas: ['almoxarifado'], adminModulos: ['comercial'] }),
      soAdministrativo: await usuario('sadm', { diretas: ['administrativo'] }),
      operacionalGrupo0: await usuario('opg0', { diretasGrupo0: ['operacional'], diretas: ['almoxarifado'] }),
    };
    await run('UPDATE usuarios SET is_superadmin = 1 WHERE id = ?', [ctx.u.superU.id]);
    ctx.u.superU.superadmin = true;
    assert.strictEqual((await all('SELECT is_superadmin FROM usuarios WHERE id = ?', [ctx.u.roleAdmin.id]))[0].is_superadmin, 0, 'o role admin do cenario nao pode ser super');
    for (const u of Object.values(ctx.u)) await logar(u);
    for (const [name, fn] of testes) {
      if (saiu !== null) { failed++; console.error(`  ✗ ${name}: o servidor caiu antes (codigo ${saiu})`); continue; }
      try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
        failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`);
      }
    }
  } catch (e) { failed++; console.error('  ✗ preparo:', e.message); }
  if (banco) await new Promise((r) => banco.close(() => r()));
  await descer();
  try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
