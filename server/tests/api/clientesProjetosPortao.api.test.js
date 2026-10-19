/**
 * Etapa 151 (Comercial) — clientes (7 rotas), projetos (5), oportunidades (4) e atividades (4): a escrita e a leitura que so o Comercial
 * faz exigem o Comercial pela regua da TELA; as duas listas que outros modulos leem continuam so com o login. Pelo `index.js` de verdade
 * (pasta vazia): C349.
 *
 *   RN-151.01  as 13 escritas passam pelo `exigirComercialNasPropostas` logo depois do login (antes do multer no logo: o arquivo do
 *              barrado nao chega ao disco)
 *   RN-151.02  as 5 leituras que so o Comercial faz (logos, cliente por id, projeto por id, oportunidades, atividades) — o mesmo portao
 *   RN-151.03  GET /api/clientes e GET /api/projetos continuam so com o login (o Almoxarifado e a OS da Fabrica as leem)
 *   RN-151.04  PROPOSTAS_PORTAO_DE_MODULO=desligado: as 18 voltam ao so login
 *
 * Molde: produtosGruposVariaveisPortao.api.test.js (Etapa 150). Plano:
 * docs/superpowers/plans/2026-10-19-almoxarifado-etapa151-clientes-projetos-oportunidades-atividades-pelo-modulo.md
 * Executar: cd server && node tests/api/clientesProjetosPortao.api.test.js
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
const SEED = { email: 'e151seed@t.com', senha: 'E151seed!senha' };
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
const { temModuloComoATela } = require('../../services/portaoDasPropostas');

const NEGADO_COM = { error: 'Acesso negado ao módulo', modulo: 'comercial' };
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// ── as rotas, lidas do fonte ──────────────────────────────────────────────────────────────
const FONTE = fs.readFileSync(path.join(SERVER_DIR, 'index.js'), 'utf8');
const REGISTRO = /^app\.(get|post|put|patch|delete)\('([^']+)', ([^\n]*)$/gm;
const TODOS = [...FONTE.matchAll(REGISTRO)].map((m) => ({ metodo: m[1].toUpperCase(), rota: m[2], resto: m[3] }));
// as 18 do portao: [metodo, rota, tabela do :id]
const ESCRITAS = [
  ['POST', '/api/clientes'], ['PUT', '/api/clientes/:id'], ['POST', '/api/clientes/:id/logo'], ['DELETE', '/api/clientes/:id'],
  ['POST', '/api/projetos'], ['PUT', '/api/projetos/:id'], ['DELETE', '/api/projetos/:id'],
  ['POST', '/api/oportunidades'], ['PUT', '/api/oportunidades/:id'], ['DELETE', '/api/oportunidades/:id'],
  ['POST', '/api/atividades'], ['PUT', '/api/atividades/:id'], ['DELETE', '/api/atividades/:id'],
];
const LEITURAS = [
  ['GET', '/api/clientes/logos'], ['GET', '/api/clientes/:id'], ['GET', '/api/projetos/:id'], ['GET', '/api/oportunidades'], ['GET', '/api/atividades'],
];
const LISTAS = [['GET', '/api/clientes'], ['GET', '/api/projetos']];
const achar = ([m, r]) => (TODOS.find((x) => x.metodo === m && x.rota === r) || { metodo: m, rota: r, resto: '(nao registrada)' });
const DEZOITO = [...ESCRITAS, ...LEITURAS].map(achar);

function caminhoDe(r) {
  const id = r.rota.startsWith('/api/clientes') ? ctx.cliente : r.rota.startsWith('/api/projetos') ? ctx.projeto
    : r.rota.startsWith('/api/oportunidades') ? ctx.oportunidade : ctx.atividade;
  const q = r.rota === '/api/atividades' && r.metodo === 'GET' ? '?todos=1' : '';
  return r.rota.replace(':id', String(id)) + q;
}
function corpoDe(r) {
  if (r.metodo === 'GET' || r.metodo === 'DELETE') return undefined;
  if (r.rota.endsWith('/logo')) {
    const fd = new FormData();
    fd.append('logo', new Blob([Buffer.from(PNG, 'base64')], { type: 'image/png' }), 'barrado151.png');
    return fd;
  }
  if (r.rota.startsWith('/api/clientes')) return { razao_social: `CRIADO PELO BARRADO ${++ctx.n}`, telefone: 'barrado' };
  if (r.rota.startsWith('/api/projetos')) return { nome: `PROJETO DO BARRADO ${++ctx.n}`, cliente_id: ctx.cliente, status: 'ativo' };
  return { titulo: `DO BARRADO ${++ctx.n}`, cliente_id: ctx.cliente, status: 'ativa' };
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
  await all('SELECT * FROM clientes ORDER BY id'), await all('SELECT * FROM projetos ORDER BY id'),
  await all('SELECT * FROM oportunidades ORDER BY id'), await all('SELECT * FROM atividades ORDER BY id'),
]);
const negados = async (id) => all("SELECT modulo, nome_modulo, COUNT(*) AS n FROM logs_auditoria WHERE tipo = 'acesso_negado' AND usuario_id = ? GROUP BY modulo, nome_modulo ORDER BY modulo", [id]);

async function usuario(nome, { role = 'usuario', grupos = [], diretas = [], diretasCrus = [], diretasGrupo0 = [], adminModulos = null } = {}) {
  const email = `${nome}@e151.t`;
  const [s, u] = await j('POST', '/usuarios', ctx.T, { nome, email, senha: 'Senha!151c', cargo: 'C', role, setor: '' });
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
  const [s, l] = await j('POST', '/auth/login', null, { email: u.email, senha: 'Senha!151c' });
  assert.strictEqual(s, 200, `login ${u.nome}: ${JSON.stringify(l)}`);
  u.T = l.token;
}

// ── RN-151.01/02/03: a regua pelo fonte ───────────────────────────────────────────────────
test('[RN-151.01/02/03, C349] fonte: as 18 com o exigirComercialNasPropostas como 2o middleware (antes do multer no logo), as 2 listas so com o login, cada uma registrada uma vez e so no index.js', () => {
  assert.deepStrictEqual([...DEZOITO, ...LISTAS.map(achar)].filter((r) => r.resto === '(nao registrada)').map((r) => r.rota), [], 'uma rota sumiu do fonte');
  const esperado = [...ESCRITAS, ...LEITURAS, ...LISTAS].map(([m, r]) => `${m} ${r}`).sort();
  // regua no TEXTO INTEIRO (o \s atravessa a quebra de linha): todo registro (qualquer verbo, use/all/route, qualquer aspa, caminho em
  // lista) dos quatro prefixos — um segundo registro na mesma linha, um registro em duas linhas ou um caminho em lista aparecem aqui
  const reTodos = /\.(get|post|put|patch|delete|all|use|route)\(\s*\[?\s*["'`](\/(?:api\/)?(?:clientes|projetos|oportunidades|atividades)(?:\/[^"'`]*)?)["'`]/gi; // Fase 5 r3 S08: o Express nao diferencia a caixa do caminho
  const todosNoTexto = [...FONTE.matchAll(reTodos)].map((m) => `${m[1].toUpperCase()} ${m[2]}`).sort();
  assert.deepStrictEqual(todosNoTexto, esperado, 'um registro a mais (na mesma linha, em duas linhas ou em lista) escaparia do portao');
  // e nenhum registro com o caminho montado (concatenado ou em template): nenhuma das reguas o leria
  assert.deepStrictEqual(FONTE.split('\n').filter((l) => /\bapp\.(use|all|get|post|put|patch|delete)\(\s*(["'`][^"'`]*["'`]\s*\+|`[^`]*\$\{)/.test(l)), [],
    'um registro com o caminho montado escaparia das reguas do fonte');
  // nenhum outro arquivo do servidor registra estes caminhos (o Almoxarifado monta /api/almoxarifado/materiais-cliente/clientes — outro)
  const fora = []; const vistos = []; const naoLiterais = [];
  // Fase 5 r3 S04b/S05/S06/S09/S24: um registro cujo caminho nao e texto literal (app['post'], o caminho num identificador, uma regex,
  // um router montado por variavel, um caminho concatenado num router) nao e lido por nenhuma regua acima. Todo registro de app/router do
  // servidor comeca por um texto literal — fora estes, medidos (middlewares sem caminho e o router dos modulos, sem prefixo).
  const registrosNaoLiterais = (rel, src) => {
    const linhas = src.split('\n');
    const linhaDe = (i) => linhas[src.slice(0, i).split('\n').length - 1].trim();
    const res = [
      /\b\w+\s*\[\s*["'`](get|post|put|patch|delete|all|use|route)["'`]\s*\]/g,
      /\b(app|router|r|\w*[Rr]outer)\.(get|post|put|patch|delete|all|use|route)\(\s*[^\s'"`[)]/g,
    ];
    const achados = res.flatMap((re) => [...src.matchAll(re)].map((m) => `${rel}: ${linhaDe(m.index)}`));
    // o caminho montado (concatenado ou em template) so passa quando o texto literal do comeco ja fixa um 1o segmento que nao e um dos
    // quatro (os routers de frotas e producao montam `/api/frotas/${base}`, `/api/producao/${base}`)
    // (qualquer receptor — um router com outro nome, S24 — quando o texto do comeco tem cara de caminho)
    const reMontado = /\b(\w+)\.(get|post|put|patch|delete|all|use|route)\(\s*(?:["'`](\/[^"'`]*)["'`]\s*\+|`(\/[^`$]*)\$\{)/g;
    for (const m of src.matchAll(reMontado)) {
      const seg = /^\/(?:api\/)?([\w-]+)\//i.exec(m[3] !== undefined ? m[3] : m[4]);
      if (!seg || /^(clientes|projetos|oportunidades|atividades|api)$/i.test(seg[1])) achados.push(`${rel}: ${linhaDe(m.index)}`);
    }
    return achados;
  };
  const varrer = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      // Fase 5 r3 S25: sem pular o arquivo que comeca com ponto, e com .cjs/.mjs
      if (['node_modules', 'tests', 'data', 'uploads', 'backups', '.git'].includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) varrer(p);
      else if (/\.(c|m)?js$/.test(e.name)) {
        const src = fs.readFileSync(p, 'utf8');
        const rel = path.relative(SERVER_DIR, p);
        naoLiterais.push(...registrosNaoLiterais(rel, src));
        if (rel === 'index.js') continue;
        vistos.push(rel);
        if (/["'`]\/api\/(clientes|projetos|oportunidades|atividades)["'`/]/.test(src)
          || /\.(get|post|put|patch|delete|all|use|route)\(\s*\[?\s*["'`]\/(clientes|projetos|oportunidades|atividades)["'`/]/.test(src)) fora.push(path.relative(SERVER_DIR, p));
      }
    }
  };
  varrer(SERVER_DIR);
  assert.deepStrictEqual(fora, [], 'rota registrada fora do index.js escaparia desta regua');
  assert.deepStrictEqual(naoLiterais.sort(), [
    'index.js: app.use((req, res, next) => {', "index.js: app.use(cors({ exposedHeaders: ['Content-Disposition'] }));",
    "index.js: app.use(express.json({ limit: '15mb' }));", 'index.js: app.use(express.static(clientBuildPath, { etag: true, lastModified: true, maxAge: 0 }));',
    'index.js: app.use(rotasModulos);',
    `${path.join('services', 'almoxarifado', 'origemRequisicao.js')}: * \`authenticateToken\` faz \`req.user = user\`, SUBSTITUINDO o objeto. Um \`app.use(prefixo, ...,`,
  ].sort(), 'um registro com o caminho que nao e texto literal escaparia das reguas do fonte');
  assert.ok(vistos.includes(path.join('routes', 'almoxarifado.js')) && vistos.includes(path.join('services', 'portaoDasPropostas.js')), 'a varredura nao enxerga routes/ ou services/');
  assert.ok(!/app\.use\(\s*\[?\s*["'`]\/(api\/)?(clientes|projetos|oportunidades|atividades)["'`/]/.test(FONTE), 'um app.use no prefixo atenderia antes do portao');
  const sem = DEZOITO.filter((r) => !r.resto.startsWith('authenticateToken, exigirComercialNasPropostas, '))
    .map((r) => `${r.metodo} ${r.rota}: ${r.resto.slice(0, 80)}`);
  assert.deepStrictEqual(sem, []);
  assert.ok(achar(['POST', '/api/clientes/:id/logo']).resto.startsWith("authenticateToken, exigirComercialNasPropostas, uploadClienteLogo.single('logo'), "), 'o logo: o multer antes do portao');
  // RN-151.03: as duas listas exatamente como antes
  assert.deepStrictEqual(LISTAS.map(achar).map((r) => r.resto), ['authenticateToken, (req, res) => {', 'authenticateToken, (req, res) => {'], 'RN-151.03: uma lista ganhou middleware');
  // o logos antes do /:id (senao o /:id atenderia "logos")
  assert.ok(FONTE.indexOf("app.get('/api/clientes/logos'") < FONTE.indexOf("app.get('/api/clientes/:id'"), 'o /logos depois do /:id');
});

// ── RN-151.01/02/03: pela rota, cada uma das 18 ───────────────────────────────────────────
test('[RN-151.01/02/03, C349] o usuario que a tela barra do Comercial (so a direta do Almoxarifado) toma 403 em cada uma das 18 — e nada muda, nem no disco; as duas listas ele le', async () => {
  const b = ctx.u.soAlmox;
  const antes = await retrato();
  const arquivos0 = arquivosDaPasta();
  assert.ok(antes.includes('CLIENTE 151') && antes.includes('PROJETO 151') && antes.includes('OPORTUNIDADE 151') && antes.includes('ATIVIDADE 151'), 'o retrato nao ve o que o preparo gravou');
  assert.ok(arquivos0.some((a) => a.startsWith(path.join('uploads', 'logos'))), 'a pasta dos logos nao tem o logo do preparo (o retrato do disco nao veria nada)');
  assert.deepStrictEqual(await negados(b.id), [], 'o usuario barrado ja tinha log');
  const errados = [];
  for (const r of DEZOITO) {
    const [s, x] = await chamar(r, b.T);
    if (s !== 403 || JSON.stringify(x) !== JSON.stringify(NEGADO_COM)) errados.push(`${r.metodo} ${r.rota}: ${s} ${JSON.stringify(x).slice(0, 80)}`);
  }
  assert.deepStrictEqual(errados, []);
  await pausa(1500);
  assert.strictEqual(await retrato(), antes, 'uma rota barrada mudou um cliente, um projeto, uma oportunidade ou uma atividade');
  assert.deepStrictEqual(arquivosDaPasta(), arquivos0, 'o logo do barrado chegou ao disco');
  assert.deepStrictEqual(await negados(b.id), [{ modulo: 'comercial', nome_modulo: 'Comercial', n: 18 }], 'cada 403 registra o acesso negado no log, com o modulo do portao');
  // a metade positiva: as duas listas (as telas do Almoxarifado as leem) — sem log novo
  const [sc, cl] = await j('GET', '/clientes', b.T);
  const [sp, pj] = await j('GET', '/projetos', b.T);
  assert.ok(sc === 200 && cl.some((c) => c.id === ctx.cliente), `lista de clientes: ${sc} ${JSON.stringify(cl).slice(0, 120)}`);
  assert.ok(sp === 200 && pj.some((p) => p.id === ctx.projeto), `lista de projetos: ${sp} ${JSON.stringify(pj).slice(0, 120)}`);
  const [sc2, cl2] = await j('GET', `/clientes?status=ativo&search=${encodeURIComponent('CLIENTE 151')}`, b.T);
  const [sp2, pj2] = await j('GET', `/projetos?cliente_id=${ctx.cliente}`, b.T);
  assert.ok(sc2 === 200 && cl2.some((c) => c.id === ctx.cliente) && sp2 === 200 && pj2.some((p) => p.id === ctx.projeto),
    `as listas com filtro: ${sc2} ${sp2}`);
  await pausa(300);
  assert.deepStrictEqual(await negados(b.id), [{ modulo: 'comercial', nome_modulo: 'Comercial', n: 18 }], 'as listas registraram acesso negado');
});

// ── as metades positivas, em fluxo, pela rota ─────────────────────────────────────────────
test('[RN-151.01/02] o Comercial faz o cliente (criar -> logo -> editar -> ler -> logos -> lista), o projeto, a oportunidade e a atividade inteiros, e apaga o cliente', async () => {
  const u = ctx.u.diretaComercial;
  const ok = (r, st = 200) => assert.ok(r[0] === st, `${st} esperado: ${r[0]} ${JSON.stringify(r[1]).slice(0, 200)}`);
  const c = await j('POST', '/clientes', u.T, { razao_social: 'cliente do comercial 151', cnpj: '11.222.333/0001-51', email: 'c@c.com' });
  ok(c);
  const cid = c[1].id;
  assert.ok(Number.isInteger(cid), JSON.stringify(c[1]));
  const fd = new FormData();
  fd.append('logo', new Blob([Buffer.from(PNG, 'base64')], { type: 'image/png' }), 'logo151.png');
  const lg = await j('POST', `/clientes/${cid}/logo`, u.T, fd);
  ok(lg);
  assert.ok(fs.existsSync(path.join(pasta, 'uploads', 'logos', lg[1].logo_url)), 'o logo do Comercial nao foi gravado no disco');
  const ed = await j('PUT', `/clientes/${cid}`, u.T, { telefone: '(11) 5151-5151' });
  ok(ed);
  const [sl, lido] = await j('GET', `/clientes/${cid}`, u.T);
  assert.deepStrictEqual([sl, lido.razao_social, lido.telefone, lido.logo_url], [200, 'CLIENTE DO COMERCIAL 151', '(11) 5151-5151', lg[1].logo_url]);
  const [slg, logos] = await j('GET', '/clientes/logos?limit=300', u.T);
  assert.ok(slg === 200 && logos.logos.some((x) => x.id === cid), `logos: ${slg} ${JSON.stringify(logos).slice(0, 160)}`);
  const [slc, lista] = await j('GET', '/clientes?status=ativo', u.T);
  assert.ok(slc === 200 && lista.some((x) => x.id === cid), `${slc}`);

  const p = await j('POST', '/projetos', u.T, { cliente_id: cid, nome: 'projeto do comercial 151', status: 'ativo' });
  ok(p);
  const pid = p[1].id;
  const [sp, lidoP] = await j('GET', `/projetos/${pid}`, u.T);
  assert.deepStrictEqual([sp, lidoP.nome], [200, 'PROJETO DO COMERCIAL 151']);
  ok(await j('PUT', `/projetos/${pid}`, u.T, { cliente_id: cid, nome: 'projeto 151 editado', status: 'ativo' }));
  const [slp, projetos] = await j('GET', `/projetos?cliente_id=${cid}`, u.T);
  assert.ok(slp === 200 && projetos.some((x) => x.id === pid && x.nome === 'PROJETO 151 EDITADO' && x.cliente_nome === 'CLIENTE DO COMERCIAL 151'), JSON.stringify(projetos).slice(0, 200));
  ok(await j('DELETE', `/projetos/${pid}`, u.T));
  assert.strictEqual((await all('SELECT status FROM projetos WHERE id = ?', [pid]))[0].status, 'inativo', 'apagar nao desativou o projeto');

  const o = await j('POST', '/oportunidades', u.T, { cliente_id: cid, titulo: 'oportunidade do comercial 151', valor_estimado: 1000, status: 'ativa' });
  ok(o);
  const oid = o[1].id;
  const [so, ops] = await j('GET', '/oportunidades?status=ativa', u.T);
  assert.ok(so === 200 && ops.some((x) => x.id === oid), `${so}`);
  ok(await j('PUT', `/oportunidades/${oid}`, u.T, { etapa: 'negociacao' }));
  assert.strictEqual((await all('SELECT etapa FROM oportunidades WHERE id = ?', [oid]))[0].etapa, 'NEGOCIACAO');
  ok(await j('DELETE', `/oportunidades/${oid}`, u.T));
  assert.deepStrictEqual(await all('SELECT id FROM oportunidades WHERE id = ?', [oid]), [], 'apagar nao apagou a oportunidade');

  const a = await j('POST', '/atividades', u.T, { cliente_id: cid, titulo: 'atividade do comercial 151', tipo: 'reuniao', responsavel_id: u.id });
  ok(a);
  const aid = a[1].id;
  const [sa, ativs] = await j('GET', '/atividades', u.T);
  assert.ok(sa === 200 && ativs.some((x) => x.id === aid), `${sa} ${JSON.stringify(ativs).slice(0, 160)}`);
  ok(await j('PUT', `/atividades/${aid}`, u.T, { cliente_id: cid, titulo: 'atividade 151 editada', tipo: 'reuniao', prioridade: 'alta', status: 'concluida', responsavel_id: u.id }));
  assert.strictEqual((await all('SELECT titulo FROM atividades WHERE id = ?', [aid]))[0].titulo, 'ATIVIDADE 151 EDITADA');
  ok(await j('DELETE', `/atividades/${aid}`, u.T));
  assert.deepStrictEqual(await all('SELECT id FROM atividades WHERE id = ?', [aid]), [], 'apagar nao apagou a atividade');

  ok(await j('DELETE', `/clientes/${cid}`, u.T));
  assert.strictEqual((await all('SELECT status FROM clientes WHERE id = ?', [cid]))[0].status, 'inativo', 'apagar nao desativou o cliente');
  await pausa(500);
  assert.deepStrictEqual(await negados(u.id), [], 'o portao registrou acesso negado para quem passou');
});

test('[RN-151.03, integracao] o cliente e o projeto criados pelo Comercial aparecem nas listas para o Almoxarifado e para o Operacional, e o Operacional edita a OS da Fabrica com eles — e o mesmo toma 403 no cliente por id, nos logos e nas escritas', async () => {
  const c = ctx.u.diretaComercial;
  const [sc, cli] = await j('POST', '/clientes', c.T, { razao_social: 'cliente da os 151' });
  assert.strictEqual(sc, 200, JSON.stringify(cli));
  const [sp, pj] = await j('POST', '/projetos', c.T, { cliente_id: cli.id, nome: 'projeto da os 151', status: 'ativo' });
  assert.strictEqual(sp, 200, JSON.stringify(pj));
  for (const k of ['soAlmox', 'soOperacional', 'soEngProjetos']) {
    const u = ctx.u[k];
    const [s1, l1] = await j('GET', '/clientes', u.T);
    const [s2, l2] = await j('GET', '/projetos', u.T);
    assert.ok(s1 === 200 && l1.some((x) => x.id === cli.id && x.razao_social === 'CLIENTE DA OS 151'), `${k} clientes: ${s1}`);
    assert.ok(s2 === 200 && l2.some((x) => x.id === pj.id && x.cliente_nome === 'CLIENTE DA OS 151'), `${k} projetos: ${s2}`);
    // Fase 5 r3 S02/S03: as listas com os filtros que as telas mandam (status, busca, cliente) tambem — nao so a lista pura
    const [s3, l3] = await j('GET', '/clientes?status=ativo', u.T);
    const [s4, l4] = await j('GET', `/clientes?search=${encodeURIComponent('DA OS 151')}`, u.T);
    const [s5, l5] = await j('GET', `/projetos?cliente_id=${cli.id}&status=ativo`, u.T);
    const [s6, l6] = await j('GET', `/projetos?responsavel_id=&cliente_id=${cli.id}`, u.T);
    assert.deepStrictEqual([k, s3, s4, s5, s6], [k, 200, 200, 200, 200], `${k}: uma lista com filtro barrou`);
    assert.ok(l3.some((x) => x.id === cli.id) && l4.length === 1 && l4[0].id === cli.id && l5.length === 1 && l5[0].id === pj.id
      && l6.some((x) => x.id === pj.id), `${k}: a lista com filtro nao trouxe o registro`);
  }
  const op = ctx.u.soOperacional;
  // a OS nasce pelo administrador (o POST da OS responde 500 a quem nao e administrador num banco novo — C277, de antes); o Operacional a
  // edita pela tela da Fabrica (o OSForm: carrega as duas listas e salva com o cliente e o projeto escolhidos nelas)
  const [so, osCriada] = await j('POST', '/operacional/ordens-servico', ctx.T, { numero_os: 'OS-151', tipo_os: 'FABRICACAO', data_abertura: '2026-10-19', status: 'pendente' });
  assert.strictEqual(so, 200, JSON.stringify(osCriada));
  const [lc, lp] = [(await j('GET', '/clientes', op.T))[1], (await j('GET', '/projetos', op.T))[1]];
  const escolhido = lc.find((x) => x.razao_social === 'CLIENTE DA OS 151');
  const projetoEscolhido = lp.find((x) => x.cliente_id === escolhido.id);
  const [su, xu] = await j('PUT', `/operacional/ordens-servico/${osCriada.id}`, op.T, { numero_os: 'OS-151', tipo_os: 'FABRICACAO', data_abertura: '2026-10-19', status: 'pendente', cliente_id: escolhido.id, projeto_id: projetoEscolhido.id });
  assert.strictEqual(su, 200, JSON.stringify(xu));
  const [sg, lida] = await j('GET', `/operacional/ordens-servico/${osCriada.id}`, op.T);
  assert.deepStrictEqual([sg, lida.cliente_id, lida.projeto_id], [200, cli.id, pj.id]);
  await pausa(300);
  assert.deepStrictEqual(await negados(op.id), [], 'o Operacional que abre a OS tomou acesso negado');
  const [s1, x1] = await j('GET', `/clientes/${cli.id}`, op.T);
  const [s2, x2] = await j('GET', '/clientes/logos', op.T);
  const [s3, x3] = await j('PUT', `/clientes/${cli.id}`, op.T, { razao_social: 'EDITADO PELA FABRICA' });
  const [s4, x4] = await j('POST', '/projetos', op.T, { nome: 'DA FABRICA' });
  const [s5, x5] = await j('GET', `/projetos/${pj.id}`, op.T);
  assert.deepStrictEqual([s1, x1, s2, x2, s3, x3, s4, x4, s5, x5], [403, NEGADO_COM, 403, NEGADO_COM, 403, NEGADO_COM, 403, NEGADO_COM, 403, NEGADO_COM]);
  assert.strictEqual((await all('SELECT razao_social FROM clientes WHERE id = ?', [cli.id]))[0].razao_social, 'CLIENTE DA OS 151', 'editar passou');
});

// ── por usuario, decide como a tela ───────────────────────────────────────────────────────
test('[RN-151.01/02/03] por usuario: as 18 decidem como a tela do Comercial; as duas listas respondem a todo logado', async () => {
  const esperado = {
    semNada: 200, diretaComercial: 200, grupoComercial: 200, grupoVazio: 200, superU: 200, roleAdmin: 200,
    comercialGrupoInativo: 403, comercialPermissao0: 403, comercialGrupo0: 403, soAlmox: 403, soOperacional: 403, soEngProjetos: 403,
    adminComercialComAdministrativo: 403, grupoAlmox: 403,
  };
  const linhas = [];
  for (const k of Object.keys(esperado)) {
    const u = ctx.u[k];
    const [sg, g] = await j('GET', `/usuarios/${u.id}/grupos`, ctx.T);
    assert.strictEqual(sg, 200, JSON.stringify(g));
    const quem = { id: u.id, role: u.role, is_superadmin: u.superadmin ? 1 : 0, admin_modulos: u.adminModulos ? JSON.stringify(u.adminModulos) : '[]' };
    const tela = temModuloComoATela(quem, g.permissoes, ['comercial']) ? 200 : 403;
    const [s1] = await j('GET', `/clientes/${ctx.cliente}`, u.T);
    const [s2] = await j('GET', '/clientes/logos', u.T);
    const [s3] = await j('GET', `/projetos/${ctx.projeto}`, u.T);
    const [s4] = await j('GET', '/oportunidades', u.T);
    const [s5] = await j('GET', '/atividades', u.T);
    const [s6] = await j('PUT', `/atividades/${ctx.atividade}`, u.T, { titulo: 'ATIVIDADE 151', tipo: 'reuniao', prioridade: 'media', status: 'pendente', cliente_id: ctx.cliente });
    const [l1] = await j('GET', '/clientes', u.T);
    const [l2] = await j('GET', '/projetos', u.T);
    linhas.push([k, s1, s2, s3, s4, s5, s6, l1, l2, tela]);
  }
  assert.deepStrictEqual(linhas, Object.entries(esperado).map(([k, v]) => [k, v, v, v, v, v, v, 200, 200, v]));
});

// ── RN-151.04 e o BUSY: reboots ───────────────────────────────────────────────────────────
test('[RN-151.04] PROPOSTAS_PORTAO_DE_MODULO=desligado: as 18 abrem ao barrado (o aviso do boot as cita, inclusive o DELETE que apaga); ligado de novo, barra', async () => {
  const b = ctx.u.soAlmox;
  assert.ok(!/PROPOSTAS_PORTAO_DE_MODULO=desligado/.test(fs.readFileSync(logArq, 'utf8')), 'o aviso do desligado saiu com o portao ligado');
  await descer();
  ctx.T = await subir({ PROPOSTAS_PORTAO_DE_MODULO: 'desligado' });
  try {
    await logar(b);
    await logar(ctx.u.grupoAlmox);
    const log = fs.readFileSync(logArq, 'utf8');
    const aviso = (log.match(/⚠️ PROPOSTAS_PORTAO_DE_MODULO=desligado[^\n]*/) || [''])[0];
    assert.ok(/clientes, dos projetos, das oportunidades e das atividades NAO exigem o Comercial \(só o login\)/.test(aviso)
      && /grupos de produto, dos produtos e das variáveis técnicas NAO exigem o Comercial/.test(aviso) && /produto pelo código NAO exige o Comercial ou o Operacional \(só o login\)/.test(aviso)
      && /cadastro de família NAO exigem o Comercial \(só o login\)/.test(aviso) && /a lista de ordens de serviço do Operacional volta à régua antiga do módulo/.test(aviso)
      && /ordem de serviço pelo número/.test(aviso) && /modelo de contrato por família/.test(aviso) && /modelo da proposta/.test(aviso) && /listas de preço/.test(aviso),
    `o aviso do boot nao cita os clientes, os projetos, as oportunidades e as atividades: ${aviso.slice(0, 300)}`);
    // Fase 2 (Minor): as 18 inteiras, pelo mesmo laco do barrado — sobre registros proprios (o resto do teste conta com os do preparo)
    const [sc, cli] = await j('POST', '/clientes', ctx.T, { razao_social: 'DESLIGADO 151' });
    const [sp, pj] = await j('POST', '/projetos', ctx.T, { cliente_id: cli.id, nome: 'PROJETO DESLIGADO 151' });
    const [so, op] = await j('POST', '/oportunidades', ctx.T, { cliente_id: cli.id, titulo: 'OPORTUNIDADE DESLIGADO 151' });
    const [sa, at] = await j('POST', '/atividades', ctx.T, { cliente_id: cli.id, titulo: 'ATIVIDADE DESLIGADO 151' });
    assert.deepStrictEqual([sc, sp, so, sa], [200, 200, 200, 200]);
    const guardados = { cliente: ctx.cliente, projeto: ctx.projeto, oportunidade: ctx.oportunidade, atividade: ctx.atividade };
    Object.assign(ctx, { cliente: cli.id, projeto: pj.id, oportunidade: op.id, atividade: at.id });
    const errados = [];
    try {
      // Fase 5 r3 S23: tambem quem a regua ANTIGA barra (um grupo ativo sem o Comercial) — o desligado volta ao so login, nao a ela
      for (const u of [ctx.u.grupoAlmox, b]) {
        for (const r of DEZOITO) {
          const [s, x] = await chamar(r, u.T);
          if (s !== 200) errados.push(`${u.nome} ${r.metodo} ${r.rota}: ${s} ${JSON.stringify(x).slice(0, 80)}`);
        }
      }
    } finally { Object.assign(ctx, guardados); }
    assert.deepStrictEqual(errados, []);
    assert.deepStrictEqual([
      (await all('SELECT status FROM clientes WHERE id = ?', [cli.id]))[0].status,
      (await all('SELECT status FROM projetos WHERE id = ?', [pj.id]))[0].status,
      await all('SELECT id FROM oportunidades WHERE id = ?', [op.id]),
      await all('SELECT id FROM atividades WHERE id = ?', [at.id]),
    ], ['inativo', 'inativo', [], []], 'um DELETE do desligado respondeu 200 sem apagar');
    // Fase 5 r3 S16: as edicoes do desligado gravaram (nao so responderam 200)
    assert.deepStrictEqual([
      /^CRIADO PELO BARRADO [0-9]+$/.test((await all('SELECT razao_social FROM clientes WHERE id = ?', [cli.id]))[0].razao_social),
      /^PROJETO DO BARRADO [0-9]+$/.test((await all('SELECT nome FROM projetos WHERE id = ?', [pj.id]))[0].nome),
    ], [true, true], 'um PUT do desligado respondeu 200 sem gravar');
    const logo = (await all('SELECT logo_url FROM clientes WHERE id = ?', [cli.id]))[0].logo_url;
    assert.ok(logo && fs.existsSync(path.join(pasta, 'uploads', 'logos', logo)), 'o logo do desligado nao chegou ao disco');
  } finally {
    await descer();
    ctx.T = await subir();
  }
  await logar(b);
  await logar(ctx.u.grupoAlmox);
  const [sg1, xg1] = await j('GET', '/atividades', ctx.u.grupoAlmox.T);
  assert.deepStrictEqual([sg1, xg1], [403, NEGADO_COM], 'ligado de novo, o grupo sem o Comercial passou');
  const [s6, x6] = await j('GET', '/clientes/logos', b.T);
  const [s7, x7] = await j('DELETE', `/atividades/${ctx.atividade}`, b.T);
  const [s8] = await j('GET', '/clientes', b.T);
  assert.deepStrictEqual([s6, x6, s7, x7, s8], [403, NEGADO_COM, 403, NEGADO_COM, 200]);
});

test('[RN-151.01/02] SQLITE_BUSY ao ler as permissoes: 503 na leitura e na escrita; outro erro: 500; o administrador nem le; as listas nem leem', async () => {
  const b = ctx.u.soOperacional;
  const FALHA = 'p\\.modulo, p\\.permissao FROM grupos_permissoes';
  await descer();
  ctx.T = await subir({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'all', FALHA_SQL_MSG: 'SQLITE_BUSY: database is locked' });
  try {
    await logar(b);
    const corpo503 = { error: 'Banco temporariamente ocupado. Tente novamente em alguns segundos.', code: 'SQLITE_BUSY', retryAfter: 3, context: 'portao:propostas' };
    const [s1, x1] = await j('GET', '/atividades', b.T);
    const [s2, x2] = await j('POST', '/clientes', b.T, { razao_social: 'BUSY 151' });
    assert.deepStrictEqual([s1, x1, s2, x2], [503, corpo503, 503, corpo503]);
    const [sa] = await j('GET', `/clientes/${ctx.cliente}`, ctx.T);
    const [sl] = await j('GET', '/clientes', b.T);
    assert.deepStrictEqual([sa, sl], [200, 200], 'o administrador passa sem ler as linhas; a lista nao passa pelo portao');
    await descer();
    ctx.T = await subir({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'all' });
    await logar(b);
    const E500 = { error: 'Erro ao verificar permissões' };
    const [s4, x4] = await j('PUT', `/clientes/${ctx.cliente}`, b.T, { razao_social: 'X' });
    const [s5, x5] = await j('GET', `/projetos/${ctx.projeto}`, b.T);
    const [s6, x6] = await j('DELETE', `/atividades/${ctx.atividade}`, b.T);
    assert.deepStrictEqual([s4, x4, s5, x5, s6, x6], [500, E500, 500, E500, 500, E500]);
    assert.ok(/\[falha injetada\]\s+SELECT p\.modulo, p\.permissao FROM grupos_permissoes/.test(fs.readFileSync(logArq, 'utf8')),
      'a falha injetada nao casou com a leitura do portao (o teste nao provou nada)');
  } finally {
    await descer();
    ctx.T = await subir();
  }
  assert.strictEqual((await all('SELECT razao_social FROM clientes WHERE id = ?', [ctx.cliente]))[0].razao_social, 'CLIENTE 151', 'o PUT com o portao em erro gravou');
  assert.strictEqual((await all('SELECT COUNT(*) AS n FROM atividades WHERE id = ?', [ctx.atividade]))[0].n, 1, 'o DELETE com o portao em erro apagou a atividade');
});

(async () => {
  console.log('\n=== Etapa 151: clientes, projetos, oportunidades e atividades exigem o Comercial na escrita e na leitura que so ele faz (C349) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e151-cli-'));
    ctx.T = await subir();
    abrirCru();
    // o que as rotas com :id vao achar — gravado pelo administrador: um cliente (com logo), um projeto, uma oportunidade e uma atividade
    const [sc, c] = await j('POST', '/clientes', ctx.T, { razao_social: 'Cliente 151', cnpj: '11.222.333/0001-15', email: 'a@a.com' });
    assert.strictEqual(sc, 200, JSON.stringify(c));
    ctx.cliente = c.id;
    const fd = new FormData();
    fd.append('logo', new Blob([Buffer.from(PNG, 'base64')], { type: 'image/png' }), 'cli151.png');
    const [sl, l] = await j('POST', `/clientes/${ctx.cliente}/logo`, ctx.T, fd);
    assert.strictEqual(sl, 200, JSON.stringify(l));
    const [sp, p] = await j('POST', '/projetos', ctx.T, { cliente_id: ctx.cliente, nome: 'Projeto 151', status: 'ativo' });
    assert.strictEqual(sp, 200, JSON.stringify(p));
    ctx.projeto = p.id;
    const [so, o] = await j('POST', '/oportunidades', ctx.T, { cliente_id: ctx.cliente, titulo: 'Oportunidade 151', status: 'ativa' });
    assert.strictEqual(so, 200, JSON.stringify(o));
    ctx.oportunidade = o.id;
    const [sa, a] = await j('POST', '/atividades', ctx.T, { cliente_id: ctx.cliente, titulo: 'Atividade 151', tipo: 'reuniao', prioridade: 'media', status: 'pendente' });
    assert.strictEqual(sa, 200, JSON.stringify(a));
    ctx.atividade = a.id;
    // grupos gravados por fora: 901 ativo com Comercial, 903 ativo sem linha, 905 inativo com Comercial
    await run("INSERT INTO grupos_permissoes (id, nome, ativo) VALUES (901,'G-com',1),(903,'G-vazio',1),(905,'G-com-inat',0),(906,'G-almox',1)");
    await run("INSERT INTO permissoes (grupo_id, modulo, acao, permissao) VALUES (901,'comercial','acesso',1),(905,'comercial','acesso',1),(906,'almoxarifado','acesso',1)");
    ctx.u = {
      semNada: await usuario('semnada'),
      diretaComercial: await usuario('dcom', { diretas: ['comercial'] }),
      grupoComercial: await usuario('gcom', { grupos: [901] }),
      grupoVazio: await usuario('gvazio', { grupos: [903] }),
      superU: await usuario('super', { diretas: ['almoxarifado'] }),
      roleAdmin: await usuario('radm', { role: 'admin', diretas: ['almoxarifado'] }),
      comercialGrupoInativo: await usuario('gcomi', { grupos: [905], diretas: ['almoxarifado'] }),
      comercialPermissao0: await usuario('cp0', { diretasCrus: [['comercial', 'acesso', 0]] }),
      comercialGrupo0: await usuario('cg0', { diretasGrupo0: ['comercial'], diretas: ['almoxarifado'] }),
      soAlmox: await usuario('salm', { diretas: ['almoxarifado'] }),
      soOperacional: await usuario('sop', { diretas: ['operacional'] }),
      soEngProjetos: await usuario('sengp', { diretas: ['engenharia_projetos'] }),
      adminComercialComAdministrativo: await usuario('acadm', { diretas: ['administrativo'], adminModulos: ['comercial'] }),
      grupoAlmox: await usuario('galm', { grupos: [906] }),
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
