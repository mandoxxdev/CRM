/**
 * Etapa 148 (Comercial/Operacional) — a ordem de servico pelo numero (5 rotas) e o modelo de contrato por familia (3) exigem o modulo pela
 * regua da TELA, pelo `index.js` de verdade (pasta vazia): C335, C341.
 *
 *   RN-148.01  GET /api/clausulas-modelos, GET /api/clausulas-modelos/:id/clausulas e PUT /api/familias/:id/clausulas-modelo passam pelo
 *              `exigirComercialNasPropostas` logo depois do login (a tela da familia so existe no Comercial)
 *   RN-148.02  GET /api/operacional/ordens-servico/:id, /:id/itens, /:id/pdf, POST /:id/gerar-pdf e GET /api/operacional/os-itens/:os_id
 *              passam pelo `exigirComercialOuOperacionalNaOS` (a OS abre em /comercial e em /fabrica)
 *   RN-148.03  PROPOSTAS_PORTAO_DE_MODULO=desligado desliga tambem as 8
 *   RN-148.04  o PDF da OS continua saindo para quem tem so o Operacional e para quem tem so o Comercial
 *
 * Molde: propostaModeloPortao.api.test.js (Etapa 147). Plano: docs/superpowers/plans/2026-10-18-almoxarifado-etapa148-o-modulo-na-os-e-no-modelo-de-contrato.md
 * Executar: cd server && node tests/api/osModeloContratoPortao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const camadas = require('../helpers/conferirCamadasDoExpress');
const regua = require('../helpers/reguaDoFonteDoServidor');

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
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e148osseed@t.com', senha: 'E148osseed!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir(extraEnv = {}) {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET', 'API_URL',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'FALHA_SQL_MSG', 'FALHA_SQL_METODOS', 'FALHA_SQL_PULAR', 'FALHA_SQL_MSGS', 'PROPOSTAS_PORTAO_DE_MODULO', 'RATE_LIMIT_WINDOW_MS']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha, RATE_LIMIT_MAX: '100000',
    ...camadas.envDasCamadas(pasta, AMOSTRAS_DAS_CAMADAS) }, extraEnv);
  const out = fs.openSync(logArq, 'a');
  saiu = null;
  const preload = ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js'), '-r', camadas.preloadDasCamadas()];
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

const NEGADO_COM = { error: 'Acesso negado ao módulo', modulo: 'comercial' };
const NEGADO_OS = { error: 'Acesso negado ao módulo', modulo: ['comercial', 'operacional'] };

// ── as rotas, lidas do fonte ──────────────────────────────────────────────────────────────
const FONTE = fs.readFileSync(path.join(SERVER_DIR, 'index.js'), 'utf8');
const REGISTRO = /^app\.(get|post|put|patch|delete)\('([^']+)', ([^\n]*)$/gm;
const TODOS = [...FONTE.matchAll(REGISTRO)].map((m) => ({ metodo: m[1].toUpperCase(), rota: m[2], resto: m[3] }));
const CONTRATO = TODOS.filter((r) => /^\/api\/clausulas-modelos(\/|$)/.test(r.rota) || r.rota === '/api/familias/:id/clausulas-modelo');
const OS_ROTAS = [
  ['GET', '/api/operacional/ordens-servico/:id'],
  ['GET', '/api/operacional/ordens-servico/:id/itens'],
  ['GET', '/api/operacional/ordens-servico/:id/pdf'],
  ['POST', '/api/operacional/ordens-servico/:id/gerar-pdf'],
  ['GET', '/api/operacional/os-itens/:os_id'],
];
const OS = OS_ROTAS.map(([m, r]) => TODOS.find((x) => x.metodo === m && x.rota === r) || { metodo: m, rota: r, resto: '(nao registrada)' });
const OITO = [...CONTRATO.map((r) => ({ ...r, grupo: 'contrato' })), ...OS.map((r) => ({ ...r, grupo: 'os' }))];
// Etapa 153 (RN-153.04): as mesmas 8, conferidas nas camadas do Express montado, com o portao que o cenario do fonte espera de cada uma.
const ROTAS_DAS_CAMADAS = OITO.map((r) => ({ metodo: r.metodo, rota: r.rota, cadeia: camadas.cadeiaDoPortao(r.grupo === 'contrato' ? 'exigirComercialNasPropostas' : 'exigirComercialOuOperacionalNaOS') }));
const NEUTRO = '/api/zz-neutro-148';
const AMOSTRAS_DAS_CAMADAS = camadas.amostrasDasCamadas(ROTAS_DAS_CAMADAS, { neutro: NEUTRO });
// Medidos, de OUTRA etapa no mesmo prefixo (Fase 2 I-1 — a forma objeto vale no despacho com a cadeia dela, sem amostra propria):
// - o prefixo /api/familias e da Etapa 149: os caminhos extras dele (/api/familias/zz-exportar, /API/FAMILIAS, /API/FAMILIAS/9) caem
//   nestas 5, com o portao que o familiasListaOsPortao confere (o cadastro e o GET /:id de Configuracoes);
// - os mesmos caminhos da OS tem PUT/DELETE pela regua antiga do Operacional (authenticateToken, checkModulePermission('operacional') —
//   a funcao anonima que ele devolve; fora do escopo, B969; o cenario do fonte os prende na lista verboCaminho): casam as amostras da OS
//   em outro verbo, sem despacho (nenhuma amostra nesses verbos), entao a cadeia so documenta.
const ALEM_DAS_ROTAS = [
  ...[['GET', '/api/familias'], ['POST', '/api/familias'], ['PUT', '/api/familias/:id'], ['DELETE', '/api/familias/:id']]
    .map(([metodo, rota]) => ({ metodo, rota, cadeia: camadas.cadeiaDoPortao('exigirComercialNasPropostas') })),
  { metodo: 'GET', rota: '/api/familias/:id', cadeia: camadas.cadeiaDoPortao('exigirComercialNaFamiliaPorConfiguracoes') },
  ...[['PUT', '/api/operacional/ordens-servico/:id'], ['DELETE', '/api/operacional/ordens-servico/:id'], ['PUT', '/api/operacional/os-itens/:id'], ['DELETE', '/api/operacional/os-itens/:id']]
    .map(([metodo, rota]) => ({ metodo, rota, cadeia: ['authenticateToken', '<anonima>'] })),
];

const urlDe = (r) => r.rota.replace('/api', '')
  .replace('/clausulas-modelos/:id', `/clausulas-modelos/${ctx.modelo}`)
  .replace('/familias/:id', `/familias/${ctx.familia}`)
  .replace(':os_id', String(ctx.os)).replace(':id', String(ctx.os));
const corpoDe = (r) => (r.rota === '/api/familias/:id/clausulas-modelo' ? { clausulas_modelo_id: ctx.outroModelo } : (r.metodo === 'GET' ? undefined : {}));
async function chamar(r, tok) {
  if (r.rota.endsWith('/:id/pdf')) {
    const resp = await fetch(`http://127.0.0.1:${porta}/api${urlDe(r)}`, { headers: { Authorization: 'Bearer ' + tok }, signal: AbortSignal.timeout(60000) });
    const buf = Buffer.from(await resp.arrayBuffer());
    let x = buf; try { x = JSON.parse(buf.toString('utf8')); } catch (e) { /* o PDF */ }
    return [resp.status, x];
  }
  return j(r.metodo, urlDe(r), tok, corpoDe(r), false, 120000);
}

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
  await all('SELECT id, clausulas_modelo_id, updated_at FROM familias_produto ORDER BY id'), await all('SELECT * FROM ordens_servico ORDER BY id'),
  await all('SELECT * FROM os_itens ORDER BY id'), await all('SELECT * FROM clausulas_modelo ORDER BY id'),
  await all('SELECT * FROM clausulas_modelo_itens ORDER BY id'),
]);
const negados = async (id) => all("SELECT modulo, nome_modulo, COUNT(*) AS n FROM logs_auditoria WHERE tipo = 'acesso_negado' AND usuario_id = ? GROUP BY modulo, nome_modulo ORDER BY modulo", [id]);

async function usuario(nome, { role = 'usuario', grupos = [], diretas = [], diretasCrus = [], diretasGrupo0 = [], adminModulos = null } = {}) {
  const email = `${nome}@e148.t`;
  const [s, u] = await j('POST', '/usuarios', ctx.T, { nome, email, senha: 'Senha!148o', cargo: 'C', role, setor: '' });
  assert.ok(s === 200 || s === 201, `usuario ${nome}: ${s} ${JSON.stringify(u)}`);
  const id = (await all('SELECT id FROM usuarios WHERE email = ?', [email]))[0].id;
  for (const g of grupos) await run('INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES (?, ?)', [id, g]);
  for (const m of diretas) await run("INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, NULL, ?, 'acesso', 1)", [id, m]);
  for (const [m, acao, p] of diretasCrus) await run('INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, NULL, ?, ?, ?)', [id, m, acao, p]);
  for (const m of diretasGrupo0) await run("INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, 0, ?, 'acesso', 1)", [id, m]);
  if (adminModulos) await run('UPDATE usuarios SET admin_modulos = ? WHERE id = ?', [JSON.stringify(adminModulos), id]);
  return { id, nome, role, email };
}
async function logar(u) {
  const [s, l] = await j('POST', '/auth/login', null, { email: u.email, senha: 'Senha!148o' });
  assert.strictEqual(s, 200, `login ${u.nome}: ${JSON.stringify(l)}`);
  u.T = l.token;
}

// ── RN-148.01/02: a regua pelo fonte ──────────────────────────────────────────────────────
test('[RN-148.01/02, C341, C335] fonte: as 3 do modelo de contrato com exigirComercialNasPropostas e as 5 da OS com exigirComercialOuOperacionalNaOS, como 2o middleware', () => {
  assert.strictEqual(CONTRATO.length, 3, `esperava 3 rotas do modelo de contrato, achei ${CONTRATO.map((r) => r.rota)}`);
  assert.deepStrictEqual(OS.filter((r) => r.resto === '(nao registrada)').map((r) => r.rota), [], 'uma rota da OS sumiu do fonte');
  // regua independente: todo registro (qualquer verbo, use/all/route, qualquer aspa) desses caminhos, em qualquer .js do servidor
  const reContrato = /\.(get|post|put|patch|delete|all|use|route)\(\s*["'`]\/api\/(clausulas-modelo|familias\/:\w+\/clausulas-modelo)/;
  const reOs = /\.(get|post|put|patch|delete|all|use|route)\(\s*["'`]\/api\/operacional\/(os-itens\/:\w+["'`]|ordens-servico\/:\w+(["'`]|\/(itens|pdf|gerar-pdf)["'`]))/;
  const linhasC = FONTE.split('\n').filter((l) => reContrato.test(l));
  const linhasO = FONTE.split('\n').filter((l) => reOs.test(l));
  assert.strictEqual(linhasC.length, 3, `registros do modelo de contrato fora do formato app.<verbo>('/api/...', ...) numa linha so: ${linhasC.join(' | ')}`);
  // os mesmos caminhos tem PUT/DELETE (a regua antiga do Operacional, fora do escopo — B969): a lista inteira, verbo e caminho, presa
  const verboCaminho = linhasO.map((l) => { const m = l.match(/\.(\w+)\(\s*["'`]([^"'`]+)/); return `${m[1]} ${m[2]}`; }).sort();
  assert.deepStrictEqual(verboCaminho, [
    'delete /api/operacional/ordens-servico/:id', 'delete /api/operacional/os-itens/:id', 'get /api/operacional/ordens-servico/:id',
    'get /api/operacional/ordens-servico/:id/itens', 'get /api/operacional/ordens-servico/:id/pdf', 'get /api/operacional/os-itens/:os_id',
    'post /api/operacional/ordens-servico/:id/gerar-pdf', 'put /api/operacional/ordens-servico/:id', 'put /api/operacional/os-itens/:id',
  ], `registros da OS fora do formato ou a mais: ${linhasO.join(' | ')}`);
  // Etapa 151 (retro da 150): as duas reguas acima leem uma linha por vez e so o 1o registro de cada linha. Estas contam TODOS no texto
  // inteiro (o \s atravessa a quebra de linha): um segundo registro na mesma linha, um registro em duas linhas ou um caminho em lista
  // aparecem aqui.
  const reTodosC = /\.(get|post|put|patch|delete|all|use|route)\(\s*\[?\s*["'`](\/api\/(?:clausulas-modelos?|familias\/:\w+\/clausulas-modelo)(?:\/[^"'`]*)?)["'`]/gi;
  assert.deepStrictEqual([...FONTE.matchAll(reTodosC)].map((m) => `${m[1]} ${m[2]}`).sort(),
    ['get /api/clausulas-modelos', 'get /api/clausulas-modelos/:id/clausulas', 'put /api/familias/:id/clausulas-modelo'],
    'um registro do modelo de contrato a mais (na mesma linha, em duas linhas ou em lista) escaparia do portao');
  const reTodosO = /\.(get|post|put|patch|delete|all|use|route)\(\s*\[?\s*["'`](\/api\/operacional\/(?:os-itens\/:\w+|ordens-servico\/:\w+(?:\/(?:itens|pdf|gerar-pdf))?))["'`]/gi;
  assert.deepStrictEqual([...FONTE.matchAll(reTodosO)].map((m) => `${m[1]} ${m[2]}`).sort(), verboCaminho,
    'um registro da OS a mais (na mesma linha, em duas linhas ou em lista) escaparia do portao');
  assert.deepStrictEqual(FONTE.split('\n').filter((l) => /\bapp\.(use|all|get|post|put|patch|delete)\(\s*(["'`][^"'`]*["'`]\s*\+|`[^`]*\$\{)/.test(l)), [],
    'um registro com o caminho montado escaparia das reguas do fonte');
  // Etapa 152 (T3, retro da 151): a regua de todo o servidor (tests/helpers/reguaDoFonteDoServidor.js) — nenhum registro de app/router
  // cujo caminho nao seja texto literal (fora os 6 medidos), nenhum caminho montado que possa virar um caminho desta etapa, e a varredura
  // "fora do index.js" com os arquivos que comecam com ponto e .cjs/.mjs, sem diferenciar a caixa (o Express nao diferencia).
  assert.deepStrictEqual(regua.registrosNaoLiterais(['/api/clausulas-modelos', '/api/clausulas-modelo', '/api/familias', '/api/operacional/ordens-servico', '/api/operacional/os-itens']),
    regua.REGISTROS_NAO_LITERAIS_MEDIDOS, 'um registro com o caminho que nao e texto literal (ou montado) escaparia das reguas do fonte');
  const reContratoI = new RegExp(reContrato.source, 'i'); const reOsI = new RegExp(reOs.source, 'i');
  const { fora, vistos } = regua.registrosForaDoIndex((src) => reContratoI.test(src) || reOsI.test(src));
  assert.deepStrictEqual(fora, [], 'rota registrada fora do index.js escaparia desta regua');
  assert.ok(vistos.includes(path.join('routes', 'compras.js')) && vistos.includes(path.join('services', 'portaoDasPropostas.js')), 'a varredura nao enxerga routes/ ou services/');
  assert.ok(fs.existsSync(path.join(SERVER_DIR, 'routes', 'compras.js')), 'a varredura nao enxerga routes/ (controle: o arquivo de Compras existe)');
  // nenhum app.use no prefixo que atenda antes (o Express atende o primeiro registro que casa)
  assert.ok(!/app\.use\(\s*["'`]\/api\/(operacional|clausulas-modelos|familias)["'`/]/.test(FONTE), 'um app.use no prefixo atenderia antes do portao');
  const sem = [
    ...CONTRATO.filter((r) => !r.resto.startsWith('authenticateToken, exigirComercialNasPropostas, ')),
    ...OS.filter((r) => !r.resto.startsWith('authenticateToken, exigirComercialOuOperacionalNaOS, ')),
  ].map((r) => `${r.metodo} ${r.rota}: ${r.resto.slice(0, 70)}`);
  assert.deepStrictEqual(sem, []);
  assert.ok(FONTE.includes("const exigirComercialOuOperacionalNaOS = portaoDasPropostas.exigir(['comercial', 'operacional']);"),
    'o portao da OS nao e o do plano');
});

// ── Etapa 153 (RN-153.04): o que a regua do texto nao le (receptor apelidado, app[verbo], .call, search, arquivo fora do index.js) ──
test('[RN-148.01/02, Etapa 153 RN-153.04] as camadas do Express montado: so as 3 do modelo de contrato e as 5 da OS (e, no prefixo das familias, as da 149) atendem os caminhos, cada uma com o login e o portao antes de tudo; nenhum middleware so delas, nenhum app.param', () => {
  const cam = camadas.lerCamadas(pasta);
  assert.deepStrictEqual(camadas.conferirCamadas(cam, ROTAS_DAS_CAMADAS, { neutro: NEUTRO, alemDasRotas: ALEM_DAS_ROTAS }), []);
  assert.ok(cam.despacho.length === AMOSTRAS_DAS_CAMADAS.length && cam.despacho.filter((d) => d.atendida).length >= ROTAS_DAS_CAMADAS.length, 'o despejo nao despachou as amostras');
});

// ── RN-148.01/02: pela rota, cada uma das 8 ───────────────────────────────────────────────
test('[RN-148.01/02, C341, C335] o usuario que a tela barra do Comercial e da Fabrica (so a direta do Almoxarifado) toma 403 em cada uma das 8 — e nada muda', async () => {
  const b = ctx.u.soAlmox;
  const antes = await retrato();
  const arquivos0 = arquivosDaPasta();
  const log0 = await negados(b.id);
  assert.deepStrictEqual(log0, [], 'o usuario barrado ja tinha log');
  const errados = [];
  for (const r of OITO) {
    const [s, x] = await chamar(r, b.T);
    const esperado = r.grupo === 'contrato' ? NEGADO_COM : NEGADO_OS;
    if (s !== 403 || JSON.stringify(x) !== JSON.stringify(esperado)) errados.push(`${r.metodo} ${r.rota}: ${s} ${JSON.stringify(x).slice(0, 80)}`);
  }
  assert.deepStrictEqual(errados, []);
  // Fase 5 r3 R14: o gerar-pdf leva segundos no Chromium — um handler que rodasse depois do 403 gravaria o pdf_url depois de uma pausa curta
  await pausa(5000);
  assert.strictEqual(await retrato(), antes, 'uma rota barrada mudou a familia, a OS, os itens ou os modelos de contrato');
  assert.deepStrictEqual(arquivosDaPasta(), arquivos0, 'o gerar-pdf barrado gravou arquivo');
  assert.deepStrictEqual(await negados(b.id), [
    { modulo: 'comercial', nome_modulo: 'Comercial', n: 3 },
    { modulo: 'comercial|operacional', nome_modulo: 'Comercial ou Operacional', n: 5 },
  ], 'cada 403 registra o acesso negado no log, com o modulo do portao');
});

// ── a metade positiva + RN-148.04: o PDF da OS ────────────────────────────────────────────
async function fluxoDaOs(u, rotulo) {
  const ok = (r, st = 200) => assert.ok(r[0] === st, `${rotulo}: ${st} esperado: ${r[0]} ${JSON.stringify(r[1]).slice(0, 200)}`);
  const [so, o] = await j('GET', `/operacional/ordens-servico/${ctx.os}`, u.T);
  ok([so, o]);
  assert.strictEqual(o.numero_os, 'OS-148', `${rotulo}: a OS lida nao e a do preparo`);
  const [si, itens] = await j('GET', `/operacional/ordens-servico/${ctx.os}/itens`, u.T);
  const [si2, itens2] = await j('GET', `/operacional/os-itens/${ctx.os}`, u.T);
  assert.deepStrictEqual([si, itens.map((i) => i.descricao), si2, itens2.map((i) => i.descricao)], [200, ['ITEM 148'], 200, ['ITEM 148']], rotulo);
  await run('UPDATE ordens_servico SET pdf_url = NULL WHERE id = ?', [ctx.os]);
  const [sg, g] = await j('POST', `/operacional/ordens-servico/${ctx.os}/gerar-pdf`, u.T, {}, false, 180000);
  ok([sg, g]);
  assert.ok(g.success === true && /^\/uploads\/ordens-servico\/.+\.pdf$/.test(g.pdf_url), `${rotulo}: ${JSON.stringify(g)}`);
  assert.strictEqual((await all('SELECT pdf_url FROM ordens_servico WHERE id = ?', [ctx.os]))[0].pdf_url, g.pdf_url, `${rotulo}: o pdf_url nao foi gravado`);
  const rp = await fetch(`http://127.0.0.1:${porta}/api/operacional/ordens-servico/${ctx.os}/pdf`, { headers: { Authorization: 'Bearer ' + u.T }, signal: AbortSignal.timeout(60000) });
  const buf = Buffer.from(await rp.arrayBuffer());
  assert.strictEqual(rp.status, 200, `${rotulo}: ${buf.toString('utf8').slice(0, 200)}`);
  assert.strictEqual(buf.slice(0, 5).toString('latin1'), '%PDF-', `${rotulo}: o PDF da OS nao e PDF`);
}

test('[RN-148.01/04] a metade positiva: quem tem so o Comercial le os modelos de contrato, troca o da familia (e grava) e faz o fluxo inteiro da OS, com o PDF', async () => {
  const u = ctx.u.diretaComercial;
  const [sm, m] = await j('GET', '/clausulas-modelos', u.T);
  assert.strictEqual(sm, 200, JSON.stringify(m));
  assert.ok(m.modelos.some((x) => x.id === ctx.modelo) && m.modelos.some((x) => x.id === ctx.outroModelo), JSON.stringify(m));
  const [sc, c] = await j('GET', `/clausulas-modelos/${ctx.modelo}/clausulas`, u.T);
  assert.ok(sc === 200 && c.clausulas.length > 0, `${sc} ${JSON.stringify(c).slice(0, 120)}`);
  const [sp, p] = await j('PUT', `/familias/${ctx.familia}/clausulas-modelo`, u.T, { clausulas_modelo_id: ctx.outroModelo });
  assert.deepStrictEqual([sp, p], [200, { ok: true, clausulas_modelo_id: ctx.outroModelo }]);
  assert.strictEqual((await all('SELECT clausulas_modelo_id FROM familias_produto WHERE id = ?', [ctx.familia]))[0].clausulas_modelo_id, ctx.outroModelo);
  const [sv, v] = await j('PUT', `/familias/${ctx.familia}/clausulas-modelo`, u.T, { clausulas_modelo_id: null });
  assert.deepStrictEqual([sv, v], [200, { ok: true, clausulas_modelo_id: null }]);
  await fluxoDaOs(u, 'Comercial');
  // Fase 5 r3 R13: quem passa nao vira "acesso negado" no log
  await pausa(500);
  assert.deepStrictEqual(await negados(u.id), [], 'o portao registrou acesso negado para quem passou');
});

test('[RN-148.02/04] quem tem so o Operacional (direta, nao administrador) le a OS, os itens, gera e baixa o PDF — e toma 403 no modelo de contrato', async () => {
  const u = ctx.u.soOperacional;
  await fluxoDaOs(u, 'Operacional');
  await pausa(500);
  assert.deepStrictEqual(await negados(u.id), [], 'o portao registrou acesso negado para quem passou (Fase 5 r3 R13)');
  const [s1, x1] = await j('GET', '/clausulas-modelos', u.T);
  const [s2, x2] = await j('PUT', `/familias/${ctx.familia}/clausulas-modelo`, u.T, { clausulas_modelo_id: ctx.outroModelo });
  assert.deepStrictEqual([s1, x1, s2, x2], [403, NEGADO_COM, 403, NEGADO_COM]);
  assert.strictEqual((await all('SELECT clausulas_modelo_id FROM familias_produto WHERE id = ?', [ctx.familia]))[0].clausulas_modelo_id, null);
});

test('[RN-148.04] a imagem do produto que o gerar-pdf busca por HTTP interno fica fora do portao: /api/uploads/produtos abre sem token', async () => {
  const fonteGerar = FONTE.slice(FONTE.indexOf("app.post('/api/operacional/ordens-servico/:id/gerar-pdf'"), FONTE.indexOf('const servirPdfOs = criarServirPdfOs'));
  assert.ok(fonteGerar.length > 1000, 'o corpo do gerar-pdf nao foi achado');
  const internas = [...fonteGerar.matchAll(/\$\{baseURL\}(\/api\/[\w/-]+)/g)].map((m) => m[1]);
  assert.deepStrictEqual(internas, ['/api/uploads/produtos/'], 'o gerar-pdf passou a buscar outra rota por HTTP interno');
  assert.ok(FONTE.includes("app.use('/api/uploads/produtos', express.static(uploadsProdutosDir"), 'a imagem do produto nao e mais estatica');
  const dir = path.join(pasta, 'uploads', 'produtos');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'e148.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const r = await fetch(`http://127.0.0.1:${porta}/api/uploads/produtos/e148.png`, { signal: AbortSignal.timeout(30000) });
  assert.strictEqual(r.status, 200, 'a imagem do produto nao abre sem token (o gerar-pdf a busca assim)');
  fs.rmSync(path.join(dir, 'e148.png'));
});

// ── RN-148.01/02: por usuario, decide como a tela ─────────────────────────────────────────
test('[RN-148.01/02] por usuario: o modelo de contrato decide como a tela do Comercial; a OS, como a do Comercial ou a da Fabrica', async () => {
  const esperado = {
    semNada: [200, 200], diretaComercial: [200, 200], grupoComercial: [200, 200], grupoVazio: [200, 200], superU: [200, 200], roleAdmin: [200, 200],
    soOperacional: [403, 200], grupoOperacional: [403, 200], operacionalGrupoInativo: [403, 403], operacionalPermissao0: [403, 403],
    comercialPermissao0: [403, 403], soAlmox: [403, 403], operacionalGrupo0: [403, 403], soEngProjetos: [403, 403], adminComercialComAdministrativo: [403, 403],
  };
  const linhas = [];
  for (const k of Object.keys(esperado)) {
    const u = ctx.u[k];
    const [sg, g] = await j('GET', `/usuarios/${u.id}/grupos`, ctx.T);
    assert.strictEqual(sg, 200, JSON.stringify(g));
    const quem = { id: u.id, role: u.role, is_superadmin: u.superadmin ? 1 : 0 };
    // a tela: /comercial/produtos/grupo/:id (Comercial) para a familia; /comercial/... ou /fabrica/... (Comercial ou Operacional) para a OS
    const telaContrato = temModuloComoATela(quem, g.permissoes, ['comercial']);
    const telaOs = temModuloComoATela(quem, g.permissoes, ['comercial']) || temModuloComoATela(quem, g.permissoes, ['operacional']);
    const [s1] = await j('GET', '/clausulas-modelos', u.T);
    const [s2] = await j('GET', `/clausulas-modelos/${ctx.modelo}/clausulas`, u.T);
    const [s3] = await j('GET', `/operacional/ordens-servico/${ctx.os}`, u.T);
    const [s4] = await j('GET', `/operacional/os-itens/${ctx.os}`, u.T);
    linhas.push([k, s1, s2, s3, s4, telaContrato ? 200 : 403, telaOs ? 200 : 403]);
  }
  assert.deepStrictEqual(linhas, Object.entries(esperado).map(([k, [c, o]]) => [k, c, c, o, o, c, o]));
});

// ── RN-148.03 e o BUSY: reboots ───────────────────────────────────────────────────────────
test('[RN-148.03] PROPOSTAS_PORTAO_DE_MODULO=desligado deixa o barrado passar na OS e no modelo de contrato (e o boot avisa); ligado de novo, barra', async () => {
  const b = ctx.u.soAlmox;
  await descer();
  ctx.T = await subir({ PROPOSTAS_PORTAO_DE_MODULO: 'desligado' });
  try {
    await logar(b);
    const log = fs.readFileSync(logArq, 'utf8');
    assert.ok(/PROPOSTAS_PORTAO_DE_MODULO=desligado/.test(log) && /ordem de serviço pelo número/.test(log) && /modelo de contrato por família/.test(log)
      && /modelo da proposta/.test(log) && /listas de preço/.test(log), 'o aviso do boot nao cita a OS e o modelo de contrato');
    const [s1] = await j('GET', '/clausulas-modelos', b.T);
    const [s2] = await j('GET', `/operacional/ordens-servico/${ctx.os}`, b.T);
    const [s3] = await j('GET', `/operacional/os-itens/${ctx.os}`, b.T);
    assert.deepStrictEqual([s1, s2, s3], [200, 200, 200]);
  } finally {
    await descer();
    ctx.T = await subir();
  }
  await logar(b);
  const [s4, x4] = await j('GET', '/clausulas-modelos', b.T);
  const [s5, x5] = await j('GET', `/operacional/ordens-servico/${ctx.os}`, b.T);
  assert.deepStrictEqual([s4, x4, s5, x5], [403, NEGADO_COM, 403, NEGADO_OS]);
});

test('[RN-148.01/02] SQLITE_BUSY ao ler as permissoes: 503 no modelo de contrato e na OS; outro erro: 500; o administrador nem le', async () => {
  const b = ctx.u.soOperacional;
  const FALHA = 'p\\.modulo, p\\.permissao FROM grupos_permissoes';
  await descer();
  ctx.T = await subir({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'all', FALHA_SQL_MSG: 'SQLITE_BUSY: database is locked' });
  try {
    await logar(b);
    const corpo503 = { error: 'Banco temporariamente ocupado. Tente novamente em alguns segundos.', code: 'SQLITE_BUSY', retryAfter: 3, context: 'portao:propostas' };
    const [s, x] = await j('GET', '/clausulas-modelos', b.T);
    const [s2, x2] = await j('GET', `/operacional/ordens-servico/${ctx.os}/itens`, b.T);
    assert.deepStrictEqual([s, x, s2, x2], [503, corpo503, 503, corpo503]);
    const [sa] = await j('GET', `/operacional/ordens-servico/${ctx.os}`, ctx.T);
    assert.strictEqual(sa, 200, 'o administrador passa sem ler as linhas');
    await descer();
    ctx.T = await subir({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'all' });
    await logar(b);
    const [s3, x3] = await j('PUT', `/familias/${ctx.familia}/clausulas-modelo`, b.T, { clausulas_modelo_id: ctx.outroModelo });
    const [s4, x4] = await j('GET', `/operacional/os-itens/${ctx.os}`, b.T);
    assert.deepStrictEqual([s3, x3, s4, x4], [500, { error: 'Erro ao verificar permissões' }, 500, { error: 'Erro ao verificar permissões' }]);
    assert.ok(/\[falha injetada\]\s+SELECT p\.modulo, p\.permissao FROM grupos_permissoes/.test(fs.readFileSync(logArq, 'utf8')),
      'a falha injetada nao casou com a leitura do portao (o teste nao provou nada)');
  } finally {
    await descer();
    ctx.T = await subir();
  }
});

(async () => {
  console.log('\n=== Etapa 148: a OS pelo numero e o modelo de contrato por familia exigem o modulo pela regua da tela (C335, C341) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e148-os-'));
    ctx.T = await subir();
    abrirCru();
    // o que as rotas com :id vao achar — gravado pelo administrador: a OS com um item, a familia, os dois modelos de contrato
    const [so, o] = await j('POST', '/operacional/ordens-servico', ctx.T, { numero_os: 'OS-148', tipo_os: 'FABRICACAO', data_abertura: '2026-10-18', descricao: 'OS da etapa 148', valor_total: 1480 });
    assert.strictEqual(so, 200, JSON.stringify(o));
    ctx.os = o.id;
    const [si, it] = await j('POST', '/operacional/os-itens', ctx.T, { os_id: ctx.os, item_numero: 1, descricao: 'ITEM 148', quantidade: 2 });
    assert.strictEqual(si, 200, JSON.stringify(it));
    const [sf, f] = await j('POST', '/familias', ctx.T, { nome: 'FAMILIA 148' });
    assert.ok(sf === 200 || sf === 201, `${sf} ${JSON.stringify(f)}`);
    ctx.familia = f.id || (await all("SELECT id FROM familias_produto WHERE nome LIKE 'FAMILIA 148'"))[0].id;
    const modelos = await all('SELECT id, is_padrao FROM clausulas_modelo WHERE ativo = 1 ORDER BY id');
    assert.ok(modelos.length >= 1, 'o boot nao semeou o modelo de contrato padrao');
    ctx.modelo = modelos.find((x) => x.is_padrao === 1).id;
    const outro = await run("INSERT INTO clausulas_modelo (nome, descricao, is_padrao) VALUES ('Modelo 148', 'x', 0)");
    ctx.outroModelo = outro.lastID;
    await run("INSERT INTO clausulas_modelo_itens (modelo_id, ordem, numero, titulo, conteudo) VALUES (?, 0, '1', 'T148', 'C148')", [ctx.outroModelo]);
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
      // Fase 2: a direta com grupo_id = 0 (a tela nao a le — leituraDeUsuarios) + a do Almoxarifado, para ter alguma linha
      operacionalGrupo0: await usuario('opg0', { diretasGrupo0: ['operacional'], diretas: ['almoxarifado'] }),
      soEngProjetos: await usuario('sengp', { diretas: ['engenharia_projetos'] }),
      adminComercialComAdministrativo: await usuario('acadm', { diretas: ['administrativo'], adminModulos: ['comercial'] }),
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
