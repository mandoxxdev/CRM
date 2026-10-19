/**
 * Etapa 149 (Comercial/Operacional) — o cadastro de familia de produto (21 rotas) e a lista de OS do Operacional exigem o modulo pela
 * regua da TELA, pelo `index.js` de verdade (pasta vazia): C343, C345.
 *
 *   RN-149.01  as 13 rotas do cadastro de familia que so o Comercial usa passam pelo `exigirComercialNasPropostas` logo depois do login
 *              (antes do multer: o arquivo do barrado nao chega ao disco)
 *   RN-149.02  as 8 que Configuracoes -> Comercial tambem usa (Template de proposta, Opcoes por familia) passam pelo
 *              `exigirComercialNaFamiliaPorConfiguracoes` (o Comercial OU o administrador do Comercial com o Administrativo — B958)
 *   RN-149.03  clonar familia continua so do administrador, sem o portao
 *   RN-149.04  GET /api/operacional/ordens-servico passa pelo `exigirOperacionalNaListaDeOS` (a regua da tela da Fabrica)
 *   RN-149.05  PROPOSTAS_PORTAO_DE_MODULO=desligado: as 21 voltam ao so login; a lista de OS volta a regua antiga (nao ao so login)
 *
 * Molde: osModeloContratoPortao.api.test.js (Etapa 148). Plano:
 * docs/superpowers/plans/2026-10-18-almoxarifado-etapa149-o-cadastro-de-familia-e-a-lista-de-os-pelo-modulo.md
 * Executar: cd server && node tests/api/familiasListaOsPortao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const regua = require('../helpers/reguaDoFonteDoServidor');

const SERVER_DIR = path.join(__dirname, '..', '..');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

// ── o servidor real ───────────────────────────────────────────────────────────────────────
let porta; let filho = null; let pasta; let logArq; let saiu = null;
// `u` com o caminho inteiro (com ou sem o /api — os apelidos /familias nao tem o prefixo)
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
const SEED = { email: 'e149famseed@t.com', senha: 'E149famseed!senha' };
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
const NEGADO_OP = { error: 'Acesso negado ao módulo', modulo: 'operacional' };
const CAMINHO_CONFIG = { admin: 'comercial', tela: 'administrativo' };
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_URL = `data:image/png;base64,${PNG}`;

// ── as rotas, lidas do fonte ──────────────────────────────────────────────────────────────
const FONTE = fs.readFileSync(path.join(SERVER_DIR, 'index.js'), 'utf8');
const REGISTRO = /^app\.(get|post|put|patch|delete)\('([^']+)', ([^\n]*)$/gm;
const TODOS = [...FONTE.matchAll(REGISTRO)].map((m) => ({ metodo: m[1].toUpperCase(), rota: m[2], resto: m[3] }));
const CADASTRO = [
  ['GET', '/api/familias'], ['GET', '/familias'], ['POST', '/api/familias'], ['POST', '/familias'],
  ['PUT', '/api/familias/:id'], ['DELETE', '/api/familias/:id'], ['POST', '/api/familias/:id/foto'], ['POST', '/api/familias/:id/foto-base64'],
  ['GET', '/api/familias/:id/esquematico'], ['POST', '/api/familias/:id/esquematico'], ['POST', '/api/familias/:id/esquematico-base64'],
  ['PUT', '/api/familias/:familiaId/variaveis'], ['GET', '/api/familias/:familiaId/opcoes-variaveis-from-produtos'],
];
const CONFIG = [
  ['GET', '/api/familias/todas'], ['GET', '/api/familias/:id'], ['GET', '/api/familias/:familiaId/variaveis'],
  ['GET', '/api/familias/:familiaId/opcoes-variaveis'], ['GET', '/api/familias/:familiaId/variaveis/:variavelChave/opcoes'],
  ['POST', '/api/familias/:familiaId/variaveis/:variavelChave/opcoes'], ['PUT', '/api/familias/:familiaId/variaveis/:variavelChave/opcoes/:id'],
  ['DELETE', '/api/familias/:familiaId/variaveis/:variavelChave/opcoes/:id'],
];
const achar = ([m, r], grupo) => ({ ...(TODOS.find((x) => x.metodo === m && x.rota === r) || { metodo: m, rota: r, resto: '(nao registrada)' }), grupo });
const VINTE_E_UMA = [...CADASTRO.map((r) => achar(r, 'cadastro')), ...CONFIG.map((r) => achar(r, 'config'))];
const LISTA_OS = achar(['GET', '/api/operacional/ordens-servico'], 'lista');

const caminhoDe = (r) => r.rota
  .replace('/opcoes/:id', `/opcoes/${ctx.opcao}`)
  .replace(':variavelChave', 'e149var')
  .replace(':familiaId', String(ctx.familia))
  .replace(':id', String(ctx.familia));
function corpoDe(r) {
  if (r.metodo === 'GET' || r.metodo === 'DELETE') return undefined;
  if (r.rota.endsWith('/foto') || r.rota.endsWith('/esquematico')) {
    const fd = new FormData();
    fd.append(r.rota.endsWith('/foto') ? 'foto' : 'esquematico', new Blob([Buffer.from(PNG, 'base64')], { type: 'image/png' }), 'barrado149.png');
    return fd;
  }
  if (r.rota.endsWith('/foto-base64')) return { foto_base64: PNG_URL };
  if (r.rota.endsWith('/esquematico-base64')) return { esquematico_base64: PNG_URL };
  if (r.rota.endsWith('/variaveis')) return { variaveis: [{ chave: 'barrada149' }] };
  if (r.rota.endsWith('/opcoes') || r.rota.endsWith('/opcoes/:id')) return { valor: 'BARRADA 149' };
  if (r.rota === '/api/familias/:id') return { nome: 'RENOMEADA PELO BARRADO' };
  return { nome: `CRIADA PELO BARRADO ${++ctx.n}` };
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
  await all('SELECT * FROM familias_produto ORDER BY id'), await all('SELECT * FROM familia_variaveis ORDER BY id'),
  await all('SELECT * FROM familia_variavel_opcoes ORDER BY id'),
]);
const negados = async (id) => all("SELECT modulo, nome_modulo, COUNT(*) AS n FROM logs_auditoria WHERE tipo = 'acesso_negado' AND usuario_id = ? GROUP BY modulo, nome_modulo ORDER BY modulo", [id]);

async function usuario(nome, { role = 'usuario', grupos = [], diretas = [], diretasCrus = [], diretasGrupo0 = [], adminModulos = null } = {}) {
  const email = `${nome}@e149.t`;
  const [s, u] = await j('POST', '/usuarios', ctx.T, { nome, email, senha: 'Senha!149f', cargo: 'C', role, setor: '' });
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
  const [s, l] = await j('POST', '/auth/login', null, { email: u.email, senha: 'Senha!149f' });
  assert.strictEqual(s, 200, `login ${u.nome}: ${JSON.stringify(l)}`);
  u.T = l.token;
}

// ── RN-149.01/02/03/04: a regua pelo fonte ────────────────────────────────────────────────
test('[RN-149.01/02/03/04, C343, C345] fonte: as 13 do cadastro com exigirComercialNasPropostas, as 8 de Configuracoes com exigirComercialNaFamiliaPorConfiguracoes, o clonar sem portao e a lista de OS com exigirOperacionalNaListaDeOS — como 2o middleware', () => {
  assert.deepStrictEqual(VINTE_E_UMA.filter((r) => r.resto === '(nao registrada)').map((r) => r.rota), [], 'uma rota de familia sumiu do fonte');
  // regua independente: todo registro (qualquer verbo, use/all/route, qualquer aspa) de /familias ou /api/familias, no index.js
  // Fase 5 r3 R18: tambem o caminho em lista (app.get(['/api/familias/todas'], ...))
  const reFam = /\.(get|post|put|patch|delete|all|use|route)\(\s*\[?\s*["'`]\/(api\/)?familias(["'`/])/;
  const verboCaminho = FONTE.split('\n').filter((l) => reFam.test(l))
    .map((l) => { const m = l.match(/\.(\w+)\(\s*\[?\s*["'`]([^"'`]+)/); return `${m[1].toUpperCase()} ${m[2]}`; }).sort();
  const esperado = [...CADASTRO, ...CONFIG, ['POST', '/api/familias/:id/clonar'], ['PUT', '/api/familias/:id/clausulas-modelo']]
    .map(([m, r]) => `${m} ${r}`).sort();
  assert.deepStrictEqual(verboCaminho, esperado, 'registros de familia fora do formato app.<verbo>(\'...\', ...) numa linha so, ou a mais');
  // Etapa 151 (retro da 150): a regua acima le uma linha por vez e so o 1o registro de cada linha. Esta conta TODOS no texto inteiro (o \s
  // atravessa a quebra de linha): um segundo registro na mesma linha, um registro em duas linhas ou um caminho em lista aparecem aqui.
  const reTodos = /\.(get|post|put|patch|delete|all|use|route)\(\s*\[?\s*["'`](\/(?:api\/)?familias(?:\/[^"'`]*)?)["'`]/gi;
  assert.deepStrictEqual([...FONTE.matchAll(reTodos)].map((m) => `${m[1].toUpperCase()} ${m[2]}`).sort(), esperado,
    'um registro de familia a mais (na mesma linha, em duas linhas ou em lista) escaparia do portao');
  // a lista de OS: o caminho exato registrado so pelo GET (o portao) e pelo POST (a criacao, outra regua — C277)
  const reListaOs = /\.(get|post|put|patch|delete|all|use|route)\(\s*\[?\s*["'`](\/api\/operacional\/ordens-servico)["'`]/gi;
  assert.deepStrictEqual([...FONTE.matchAll(reListaOs)].map((m) => `${m[1].toUpperCase()} ${m[2]}`).sort(),
    ['GET /api/operacional/ordens-servico', 'POST /api/operacional/ordens-servico'], 'um registro a mais da lista de OS escaparia do portao');
  assert.deepStrictEqual(FONTE.split('\n').filter((l) => /\bapp\.(use|all|get|post|put|patch|delete)\(\s*(["'`][^"'`]*["'`]\s*\+|`[^`]*\$\{)/.test(l)), [],
    'um registro com o caminho montado escaparia das reguas do fonte');
  // nenhum outro arquivo do servidor registra o caminho inteiro (os routers do Almoxarifado montam /api/almoxarifado/familias — outra tabela)
  // Etapa 152 (T3, retro da 151): a regua de todo o servidor (tests/helpers/reguaDoFonteDoServidor.js) — nenhum registro de app/router
  // cujo caminho nao seja texto literal (fora os 6 medidos), nenhum caminho montado que possa virar um caminho desta etapa, e a varredura
  // "fora do index.js" com os arquivos que comecam com ponto e .cjs/.mjs, sem diferenciar a caixa (o Express nao diferencia).
  assert.deepStrictEqual(regua.registrosNaoLiterais(['/api/familias', '/api/operacional/ordens-servico']),
    regua.REGISTROS_NAO_LITERAIS_MEDIDOS, 'um registro com o caminho que nao e texto literal (ou montado) escaparia das reguas do fonte');
  const { fora, vistos } = regua.registrosForaDoIndex((src) => /["'`]\/api\/familias/i.test(src) || /\bapp\.\w+\(\s*\[?\s*["'`]\/familias/i.test(src) || /["'`]\/api\/operacional\/ordens-servico["'`]/i.test(src));
  assert.deepStrictEqual(fora, [], 'rota registrada fora do index.js escaparia desta regua');
  assert.ok(vistos.includes(path.join('routes', 'almoxarifado.js')) && vistos.includes(path.join('services', 'portaoDasPropostas.js')), 'a varredura nao enxerga routes/ ou services/');
  assert.ok(fs.existsSync(path.join(SERVER_DIR, 'routes', 'almoxarifado.js')), 'a varredura nao enxerga routes/ (controle: o arquivo do Almoxarifado existe)');
  assert.ok(!/app\.use\(\s*["'`]\/(api\/)?(familias|operacional)["'`/]/.test(FONTE), 'um app.use no prefixo atenderia antes do portao');
  const sem = VINTE_E_UMA.filter((r) => !r.resto.startsWith(r.grupo === 'cadastro'
    ? 'authenticateToken, exigirComercialNasPropostas, ' : 'authenticateToken, exigirComercialNaFamiliaPorConfiguracoes, '))
    .map((r) => `${r.metodo} ${r.rota}: ${r.resto.slice(0, 70)}`);
  assert.deepStrictEqual(sem, []);
  const clonar = TODOS.find((x) => x.metodo === 'POST' && x.rota === '/api/familias/:id/clonar');
  assert.strictEqual(clonar.resto, 'authenticateToken, (req, res) => {', 'RN-149.03: o clonar ganhou middleware');
  assert.ok(LISTA_OS.resto.startsWith('authenticateToken, exigirOperacionalNaListaDeOS, '), `lista de OS: ${LISTA_OS.resto.slice(0, 80)}`);
  assert.ok(FONTE.includes("const exigirComercialNaFamiliaPorConfiguracoes = portaoDasPropostas.exigir('comercial', { tambemAdminDoModuloCom: { admin: 'comercial', tela: 'administrativo' } });"),
    'o portao de Configuracoes nao e o do plano');
  assert.ok(FONTE.includes("const exigirOperacionalNaListaDeOS = PORTAO_DAS_PROPOSTAS_DESLIGADO ? checkModulePermission('operacional') : portaoDasPropostas.exigir('operacional');"),
    'o portao da lista de OS nao e o do plano (desligado -> a regua antiga)');
});

// ── RN-149.01/02/04: pela rota, cada uma das 22 ───────────────────────────────────────────
test('[RN-149.01/02/04, C343, C345] o usuario que a tela barra do Comercial e da Fabrica (so a direta do Almoxarifado) toma 403 em cada uma das 22 — e nada muda, nem no disco', async () => {
  const b = ctx.u.soAlmox;
  const antes = await retrato();
  const arquivos0 = arquivosDaPasta();
  assert.deepStrictEqual(await negados(b.id), [], 'o usuario barrado ja tinha log');
  const errados = [];
  for (const r of [...VINTE_E_UMA, LISTA_OS]) {
    const [s, x] = await chamar(r, b.T);
    const esperado = r.grupo === 'lista' ? NEGADO_OP : NEGADO_COM;
    if (s !== 403 || JSON.stringify(x) !== JSON.stringify(esperado)) errados.push(`${r.metodo} ${r.rota}: ${s} ${JSON.stringify(x).slice(0, 80)}`);
  }
  assert.deepStrictEqual(errados, []);
  await pausa(1500);
  assert.strictEqual(await retrato(), antes, 'uma rota barrada mudou a familia, as variaveis ou as opcoes');
  assert.deepStrictEqual(arquivosDaPasta(), arquivos0, 'a foto ou o esquematico do barrado chegou ao disco');
  assert.deepStrictEqual(await negados(b.id), [
    { modulo: 'comercial', nome_modulo: 'Comercial', n: 21 },
    { modulo: 'operacional', nome_modulo: 'Operacional', n: 1 },
  ], 'cada 403 registra o acesso negado no log, com o modulo do portao');
});

// ── as metades positivas, em fluxo, pela rota ─────────────────────────────────────────────
test('[RN-149.01/02] o Comercial faz o cadastro inteiro da familia (criar -> renomear -> foto -> variaveis -> opcao -> apagar), pelos dois prefixos', async () => {
  const u = ctx.u.diretaComercial;
  const ok = (r, st = 200) => assert.ok(r[0] === st, `${st} esperado: ${r[0]} ${JSON.stringify(r[1]).slice(0, 200)}`);
  const c = await j('POST', '/familias', u.T, { nome: 'FAM COM 149' });
  ok(c);
  const id = c[1].id;
  assert.ok(Number.isInteger(id), JSON.stringify(c[1]));
  ok(await cru('POST', '/familias', u.T, { nome: 'FAM COM 149 APELIDO' }));
  const [sl, lista] = await cru('GET', '/familias', u.T);
  assert.ok(sl === 200 && lista.some((f) => f.nome === 'FAM COM 149 APELIDO'), `${sl} ${JSON.stringify(lista).slice(0, 120)}`);
  const [sa, lista2] = await j('GET', '/familias', u.T);
  assert.ok(sa === 200 && lista2.some((f) => f.id === id), `${sa}`);
  const ren = await j('PUT', `/familias/${id}`, u.T, { nome: 'FAM COM 149 RENOMEADA' });
  ok(ren);
  assert.strictEqual(ren[1].nome, 'FAM COM 149 RENOMEADA');
  const foto = await j('POST', `/familias/${id}/foto-base64`, u.T, { foto_base64: PNG_URL });
  ok(foto);
  assert.ok(fs.existsSync(path.join(pasta, 'uploads', 'familias-produtos', foto[1].foto)), 'a foto do Comercial nao foi gravada no disco');
  const fd = new FormData();
  fd.append('esquematico', new Blob([Buffer.from(PNG, 'base64')], { type: 'image/png' }), 'esq149.png');
  const esq = await j('POST', `/familias/${id}/esquematico`, u.T, fd);
  ok(esq);
  const [se, img] = await j('GET', `/familias/${id}/esquematico`, u.T);
  assert.strictEqual(se, 200, `o esquematico gravado nao abre: ${String(img).slice(0, 80)}`);
  ok(await j('PUT', `/familias/${id}/variaveis`, u.T, { variaveis: [{ chave: 'e149var' }] }));
  const [sv, vars] = await j('GET', `/familias/${id}/variaveis`, u.T);
  assert.ok(sv === 200 && vars.map((v) => v.chave).includes('e149var'), JSON.stringify(vars));
  ok(await j('POST', `/familias/${id}/variaveis/e149var/opcoes`, u.T, { valor: 'OPC COM' }), 201);
  const [so, ops] = await j('GET', `/familias/${id}/opcoes-variaveis`, u.T);
  assert.ok(so === 200 && ops.e149var && ops.e149var[0].valor === 'OPC COM', JSON.stringify(ops));
  const [sp, prod] = await j('GET', `/familias/${id}/opcoes-variaveis-from-produtos`, u.T);
  assert.deepStrictEqual([sp, typeof prod], [200, 'object']);
  ok(await j('DELETE', `/familias/${id}`, u.T));
  assert.strictEqual((await all('SELECT ativo FROM familias_produto WHERE id = ?', [id]))[0].ativo, 0, 'apagar nao desativou a familia');
  await pausa(500);
  assert.deepStrictEqual(await negados(u.id), [], 'o portao registrou acesso negado para quem passou');
});

test('[RN-149.02] o administrador do Comercial com o Administrativo (Configuracoes) faz Opcoes por familia e le o Template de proposta — e toma 403 no cadastro', async () => {
  const u = ctx.u.adminComercialComAdministrativo;
  const [st, todas] = await j('GET', '/familias/todas', u.T);
  assert.ok(st === 200 && todas.some((f) => f.id === ctx.familia), `${st} ${JSON.stringify(todas).slice(0, 120)}`);
  const [sf, fam] = await j('GET', `/familias/${ctx.familia}`, u.T);
  assert.deepStrictEqual([sf, fam.id], [200, ctx.familia]);
  const [sv, vars] = await j('GET', `/familias/${ctx.familia}/variaveis`, u.T);
  assert.ok(sv === 200 && vars.map((v) => v.chave).includes('e149var'), JSON.stringify(vars));
  const [so] = await j('GET', `/familias/${ctx.familia}/opcoes-variaveis`, u.T);
  assert.strictEqual(so, 200);
  const [sc, criada] = await j('POST', `/familias/${ctx.familia}/variaveis/e149var/opcoes`, u.T, { valor: 'OPC CONFIG' });
  assert.strictEqual(sc, 201, JSON.stringify(criada));
  const [sg, daVar] = await j('GET', `/familias/${ctx.familia}/variaveis/e149var/opcoes`, u.T);
  assert.ok(sg === 200 && daVar.some((o) => o.id === criada.id), JSON.stringify(daVar));
  const [su, mudada] = await j('PUT', `/familias/${ctx.familia}/variaveis/e149var/opcoes/${criada.id}`, u.T, { valor: 'OPC CONFIG 2' });
  assert.deepStrictEqual([su, mudada.valor], [200, 'OPC CONFIG 2']);
  const [sd] = await j('DELETE', `/familias/${ctx.familia}/variaveis/e149var/opcoes/${criada.id}`, u.T);
  assert.strictEqual(sd, 200);
  assert.strictEqual((await all('SELECT ativo FROM familia_variavel_opcoes WHERE id = ?', [criada.id]))[0].ativo, 0);
  await pausa(500);
  assert.deepStrictEqual(await negados(u.id), [], 'o portao registrou acesso negado para quem passou pelo caminho de Configuracoes');
  const nomeAntes = (await all('SELECT nome FROM familias_produto WHERE id = ?', [ctx.familia]))[0].nome;
  const [s1, x1] = await j('PUT', `/familias/${ctx.familia}`, u.T, { nome: 'RENOMEADA POR CONFIG' });
  const [s2, x2] = await j('GET', '/familias', u.T);
  // Fase 5 r3 R2: trocar as variaveis da familia e do cadastro (a tela de Opcoes por familia so le as variaveis)
  const [s3, x3] = await j('PUT', `/familias/${ctx.familia}/variaveis`, u.T, { variaveis: [{ chave: 'trocada' }] });
  assert.deepStrictEqual([s1, x1, s2, x2, s3, x3], [403, NEGADO_COM, 403, NEGADO_COM, 403, NEGADO_COM]);
  assert.strictEqual((await all('SELECT nome FROM familias_produto WHERE id = ?', [ctx.familia]))[0].nome, nomeAntes, 'renomear passou');
});

test('[RN-149.04] quem tem so o Operacional le a lista de OS da Fabrica (com o filtro da tela de atividades) — e toma 403 nas familias', async () => {
  const u = ctx.u.soOperacional;
  const [s, lista] = await j('GET', '/operacional/ordens-servico', u.T);
  assert.ok(s === 200 && lista.some((o) => o.numero_os === 'OS-149'), `${s} ${JSON.stringify(lista).slice(0, 120)}`);
  const [s2, lista2] = await j('GET', '/operacional/ordens-servico?status=em_andamento', u.T);
  assert.ok(s2 === 200 && Array.isArray(lista2), `${s2}`);
  await pausa(500);
  assert.deepStrictEqual(await negados(u.id), [], 'o portao registrou acesso negado para quem passou');
  const [s3, x3] = await j('GET', '/familias/todas', u.T);
  assert.deepStrictEqual([s3, x3], [403, NEGADO_COM]);
});

test('[RN-149.03] clonar continua so do administrador: o Comercial e o barrado tomam a frase de sempre, sem log de acesso negado; o administrador clona', async () => {
  const MSG = { error: 'Apenas administradores podem clonar famílias' };
  const [s1, x1] = await j('POST', `/familias/${ctx.familia}/clonar`, ctx.u.diretaComercial.T, { nome: 'CLONE COM' });
  const [s2, x2] = await j('POST', `/familias/${ctx.familia}/clonar`, ctx.u.soOperacional.T, { nome: 'CLONE OP' });
  assert.deepStrictEqual([s1, x1, s2, x2], [403, MSG, 403, MSG]);
  const [s3, x3] = await j('POST', `/familias/${ctx.familia}/clonar`, ctx.T, { nome: 'CLONE ADM 149' });
  assert.strictEqual(s3, 200, JSON.stringify(x3));
  await pausa(500);
  assert.deepStrictEqual(await negados(ctx.u.diretaComercial.id), [], 'o clonar passou a registrar acesso negado');
});

// ── por usuario, decide como a tela ───────────────────────────────────────────────────────
test('[RN-149.01/02/04] por usuario: o cadastro decide como a tela do Comercial; as 8, como o Comercial ou Configuracoes; a lista de OS, como a Fabrica', async () => {
  const esperado = {
    semNada: [200, 200, 403], diretaComercial: [200, 200, 403], grupoComercial: [200, 200, 403], grupoVazio: [200, 200, 403],
    superU: [200, 200, 200], roleAdmin: [200, 200, 200], soOperacional: [403, 403, 200], grupoOperacional: [403, 403, 200],
    operacionalGrupoInativo: [403, 403, 403], operacionalPermissao0: [403, 403, 403], comercialPermissao0: [403, 403, 403],
    soAlmox: [403, 403, 403], soEngProjetos: [403, 403, 403], adminComercialComAdministrativo: [403, 200, 403],
    adminComercialSemAdministrativo: [403, 403, 403], soAdministrativo: [403, 403, 403], operacionalGrupo0: [403, 403, 403],
  };
  const linhas = [];
  for (const k of Object.keys(esperado)) {
    const u = ctx.u[k];
    const [sg, g] = await j('GET', `/usuarios/${u.id}/grupos`, ctx.T);
    assert.strictEqual(sg, 200, JSON.stringify(g));
    const quem = { id: u.id, role: u.role, is_superadmin: u.superadmin ? 1 : 0, admin_modulos: u.adminModulos ? JSON.stringify(u.adminModulos) : '[]' };
    const telaCom = temModuloComoATela(quem, g.permissoes, ['comercial']);
    const telaConfig = telaCom || passaPeloCaminhoDeConfiguracoes(quem, g.permissoes, CAMINHO_CONFIG);
    const telaFab = temModuloComoATela(quem, g.permissoes, ['operacional']);
    const [s1] = await j('GET', '/familias', u.T);
    const [s2] = await cru('GET', '/familias', u.T);
    const [s3] = await j('GET', `/familias/${ctx.familia}/opcoes-variaveis-from-produtos`, u.T);
    const [s4] = await j('GET', '/familias/todas', u.T);
    const [s5] = await j('GET', `/familias/${ctx.familia}/opcoes-variaveis`, u.T);
    const [s6] = await j('GET', '/operacional/ordens-servico', u.T);
    linhas.push([k, s1, s2, s3, s4, s5, s6, telaCom ? 200 : 403, telaConfig ? 200 : 403, telaFab ? 200 : 403]);
  }
  assert.deepStrictEqual(linhas, Object.entries(esperado).map(([k, [c, cf, l]]) => [k, c, c, c, cf, cf, l, c, cf, l]));
});

// ── RN-149.05 e o BUSY: reboots ───────────────────────────────────────────────────────────
test('[RN-149.05] PROPOSTAS_PORTAO_DE_MODULO=desligado: as familias abrem ao barrado e a lista de OS volta a regua antiga (a direta com grupo 0 passa, o so-Almoxarifado nao); ligado de novo, barra', async () => {
  const b = ctx.u.soAlmox;
  const g0 = ctx.u.operacionalGrupo0;
  // Fase 5 r3 R16: ligado, o boot nao avisa (o log ate aqui e so do boot ligado)
  assert.ok(!/PROPOSTAS_PORTAO_DE_MODULO=desligado/.test(fs.readFileSync(logArq, 'utf8')), 'o aviso do desligado saiu com o portao ligado');
  await descer();
  ctx.T = await subir({ PROPOSTAS_PORTAO_DE_MODULO: 'desligado' });
  try {
    await logar(b); await logar(g0);
    const log = fs.readFileSync(logArq, 'utf8');
    assert.ok(/PROPOSTAS_PORTAO_DE_MODULO=desligado/.test(log) && /cadastro de família/.test(log) && /a lista de ordens de serviço do Operacional volta à régua antiga do módulo/.test(log) && /cadastro de família NAO exigem o Comercial \(só o login\)/.test(log)
      && /ordem de serviço pelo número/.test(log) && /modelo de contrato por família/.test(log) && /modelo da proposta/.test(log) && /listas de preço/.test(log),
    'o aviso do boot nao cita o cadastro de familia e a lista de OS');
    const [s1] = await j('GET', '/familias', b.T);
    const [s2] = await cru('GET', '/familias', b.T);
    const [s3] = await j('GET', '/familias/todas', b.T);
    const [s4, x4] = await j('GET', '/operacional/ordens-servico', b.T);
    const [s5] = await j('GET', '/operacional/ordens-servico', g0.T);
    assert.deepStrictEqual([s1, s2, s3, s4, x4, s5], [200, 200, 200, 403, NEGADO_OP, 200]);
  } finally {
    await descer();
    ctx.T = await subir();
  }
  await logar(b); await logar(g0);
  const [s6, x6] = await j('GET', '/familias', b.T);
  const [s7, x7] = await j('GET', '/familias/todas', b.T);
  const [s8, x8] = await j('GET', '/operacional/ordens-servico', g0.T);
  assert.deepStrictEqual([s6, x6, s7, x7, s8, x8], [403, NEGADO_COM, 403, NEGADO_COM, 403, NEGADO_OP]);
});

test('[RN-149.01/02/04] SQLITE_BUSY ao ler as permissoes: 503 no cadastro, em Configuracoes e na lista de OS; outro erro: 500; o administrador nem le', async () => {
  const b = ctx.u.soOperacional;
  const FALHA = 'p\\.modulo, p\\.permissao FROM grupos_permissoes';
  await descer();
  ctx.T = await subir({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'all', FALHA_SQL_MSG: 'SQLITE_BUSY: database is locked' });
  try {
    await logar(b);
    const corpo503 = { error: 'Banco temporariamente ocupado. Tente novamente em alguns segundos.', code: 'SQLITE_BUSY', retryAfter: 3, context: 'portao:propostas' };
    const [s1, x1] = await j('GET', '/familias', b.T);
    const [s2, x2] = await j('GET', '/familias/todas', b.T);
    const [s3, x3] = await j('GET', '/operacional/ordens-servico', b.T);
    assert.deepStrictEqual([s1, x1, s2, x2, s3, x3], [503, corpo503, 503, corpo503, 503, corpo503]);
    const [sa] = await j('GET', '/operacional/ordens-servico', ctx.T);
    assert.strictEqual(sa, 200, 'o administrador passa sem ler as linhas');
    await descer();
    ctx.T = await subir({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'all' });
    await logar(b);
    const E500 = { error: 'Erro ao verificar permissões' };
    const [s4, x4] = await j('PUT', `/familias/${ctx.familia}`, b.T, { nome: 'X' });
    const [s5, x5] = await j('POST', `/familias/${ctx.familia}/variaveis/e149var/opcoes`, b.T, { valor: 'X' });
    const [s6, x6] = await j('GET', '/operacional/ordens-servico', b.T);
    assert.deepStrictEqual([s4, x4, s5, x5, s6, x6], [500, E500, 500, E500, 500, E500]);
    assert.ok(/\[falha injetada\]\s+SELECT p\.modulo, p\.permissao FROM grupos_permissoes/.test(fs.readFileSync(logArq, 'utf8')),
      'a falha injetada nao casou com a leitura do portao (o teste nao provou nada)');
  } finally {
    await descer();
    ctx.T = await subir();
  }
});

(async () => {
  console.log('\n=== Etapa 149: o cadastro de familia e a lista de OS do Operacional exigem o modulo pela regua da tela (C343, C345) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e149-fam-'));
    ctx.T = await subir();
    abrirCru();
    // o que as rotas com :id vao achar — gravado pelo administrador: a familia com uma variavel e uma opcao, e uma OS
    const [sf, f] = await j('POST', '/familias', ctx.T, { nome: 'FAMILIA 149' });
    assert.strictEqual(sf, 200, JSON.stringify(f));
    ctx.familia = f.id;
    const [sv, v] = await j('PUT', `/familias/${ctx.familia}/variaveis`, ctx.T, { variaveis: [{ chave: 'e149var' }] });
    assert.strictEqual(sv, 200, JSON.stringify(v));
    const [sop, op] = await j('POST', `/familias/${ctx.familia}/variaveis/e149var/opcoes`, ctx.T, { valor: 'OPC 149' });
    assert.strictEqual(sop, 201, JSON.stringify(op));
    ctx.opcao = op.id;
    const [so, o] = await j('POST', '/operacional/ordens-servico', ctx.T, { numero_os: 'OS-149', tipo_os: 'FABRICACAO', data_abertura: '2026-10-18', descricao: 'OS da etapa 149', status: 'em_andamento' });
    assert.strictEqual(so, 200, JSON.stringify(o));
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
      // C345: a direta do Operacional com grupo_id = 0 (a regua antiga a le; a tela nao) + a do Almoxarifado, para ter alguma linha
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
