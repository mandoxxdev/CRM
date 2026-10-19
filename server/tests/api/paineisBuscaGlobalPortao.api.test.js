/**
 * Etapa 153 (Comercial) — os paineis, os relatorios e o mapa do Comercial exigem o Comercial pela regua da TELA, e a busca global filtra
 * cada tipo de resultado pelo modulo da tela que o resultado abre. Pelo `index.js` de verdade (pasta vazia): C355, C352.
 *
 *   RN-153.01  as 7 (/api/dashboard, /historico, /avancado, /vendas, /api/relatorios/executivo, /visitas-tecnicas, /api/mapa/maquinas-vendidas)
 *              passam pelo `exigirComercialNasPropostas` logo depois do login
 *   RN-153.02  GET /api/busca-global passa pelo `filtrarBuscaGlobalPorModulo`: so os tipos cujo modulo a tela aceita (os seis -> o
 *              Comercial); nenhum tipo -> 200 [] sem log de acesso negado
 *   RN-153.03  PROPOSTAS_PORTAO_DE_MODULO=desligado: as 7 voltam ao so login, a busca mostra todos os tipos; o aviso do boot as cita
 *   RN-153.04  as camadas do Express montado (o helper conferirCamadasDoExpress, com controle positivo proprio sobre camadas sinteticas)
 *
 * Molde: custosViagensPortao.api.test.js (Etapa 152). Plano:
 * docs/superpowers/plans/2026-10-19-almoxarifado-etapa153-paineis-relatorios-e-busca-global-pelo-modulo.md
 * Executar: cd server && node tests/api/paineisBuscaGlobalPortao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const regua = require('../helpers/reguaDoFonteDoServidor');
const camadas = require('../helpers/conferirCamadasDoExpress');
const { nomeDaCamada } = require('../helpers/nomeDaCamada');

const SERVER_DIR = path.join(__dirname, '..', '..');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

// ── as rotas ──────────────────────────────────────────────────────────────────────────────
const SETE_DEF = [
  ['GET', '/api/dashboard'], ['GET', '/api/dashboard/historico'], ['GET', '/api/dashboard/avancado'], ['GET', '/api/dashboard/vendas'],
  ['GET', '/api/relatorios/executivo'], ['GET', '/api/relatorios/visitas-tecnicas'], ['GET', '/api/mapa/maquinas-vendidas'],
];
const BUSCA = '/api/busca-global';
const TIPOS = ['atividade', 'cliente', 'oportunidade', 'produto', 'projeto', 'proposta'];
const FILTRO = `filtro:${TIPOS.map((t) => `${t}=comercial`).join(',')}`;
const ROTAS_DAS_CAMADAS = [
  ...SETE_DEF.map(([metodo, rota]) => ({ metodo, rota, cadeia: ['authenticateToken', 'portao:comercial'] })),
  { metodo: 'GET', rota: BUSCA, cadeia: ['authenticateToken', FILTRO] },
];
const NEUTRO = '/api/zz-neutro-153';
const AMOSTRAS_DAS_CAMADAS = camadas.amostrasDasCamadas(ROTAS_DAS_CAMADAS, { neutro: NEUTRO });
// as que a tela manda com os filtros (o botao "Filtros" do painel)
const COM_FILTROS = ['/api/dashboard', '/api/dashboard/avancado'];

// ── o servidor real ───────────────────────────────────────────────────────────────────────
let porta; let filho = null; let pasta; let logArq; let saiu = null;
async function cru(m, u, tok, body, ms = 30000) {
  const headers = { ...(tok ? { Authorization: 'Bearer ' + tok } : {}) };
  let corpo;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; corpo = JSON.stringify(body); }
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
const SEED = { email: 'e153seed@t.com', senha: 'E153seed!senha' };
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
const TERMO = 'zeta153';
const FILTROS = () => `?inicio=2026-01-01&fim=2099-12-31&usuario=${ctx.u.diretaComercial.id}`;

const FONTE = fs.readFileSync(path.join(SERVER_DIR, 'index.js'), 'utf8');
const REGISTRO = /^app\.(get|post|put|patch|delete)\('([^']+)', ([^\n]*)$/gm;
const TODOS = [...FONTE.matchAll(REGISTRO)].map((m) => ({ metodo: m[1].toUpperCase(), rota: m[2], resto: m[3], pos: m.index }));
const achar = ([m, r]) => (TODOS.find((x) => x.metodo === m && x.rota === r) || { metodo: m, rota: r, resto: '(nao registrada)', pos: -1 });

const tiposDe = (lista) => [...new Set((Array.isArray(lista) ? lista : []).map((x) => x.type))].sort();
const negados = async (id) => all("SELECT modulo, nome_modulo, COUNT(*) AS n FROM logs_auditoria WHERE tipo = 'acesso_negado' AND usuario_id = ? GROUP BY modulo, nome_modulo ORDER BY modulo", [id]);
const TABELAS = ['clientes', 'projetos', 'propostas', 'oportunidades', 'atividades', 'produtos'];
const retrato = async () => JSON.stringify(await Promise.all(TABELAS.map((t) => all(`SELECT * FROM ${t} ORDER BY id`))));

async function usuario(nome, { role = 'usuario', grupos = [], diretas = [], diretasCrus = [], diretasGrupo0 = [], adminModulos = null } = {}) {
  const email = `${nome}@e153.t`;
  const [s, u] = await j('POST', '/usuarios', ctx.T, { nome, email, senha: 'Senha!153c', cargo: 'C', role, setor: '' });
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
  const [s, l] = await j('POST', '/auth/login', null, { email: u.email, senha: 'Senha!153c' });
  assert.strictEqual(s, 200, `login ${u.nome}: ${JSON.stringify(l)}`);
  u.T = l.token;
}

// o que a tela de cada resultado le ao abrir (o ultimo gesto do clique)
const LEITURA_DO_CLIQUE = {
  cliente: (id) => `/clientes/${id}`, projeto: (id) => `/projetos/${id}`, proposta: (id) => `/propostas/${id}`,
  atividade: () => '/atividades?todos=1', oportunidade: () => '/oportunidades', produto: (id) => `/produtos/${id}`,
};
const achouNaLeitura = (tipo, id, x) => (Array.isArray(x) ? x.some((y) => y.id === id) : x && x.id === id);

// os numeros do painel e do relatorio, contra o banco
async function numerosDoBanco() {
  const um = async (sql) => (await all(sql))[0];
  return {
    totalClientes: (await um("SELECT COUNT(*) AS n FROM clientes WHERE status = 'ativo'")).n,
    totalOportunidades: (await um('SELECT COUNT(*) AS n FROM oportunidades')).n,
    valorTotalOportunidades: (await um('SELECT SUM(valor_estimado) AS s FROM oportunidades')).s || 0,
    oportunidadesAtivas: (await um("SELECT COUNT(*) AS n FROM oportunidades WHERE status = 'ativa'")).n,
    pipeline: (await um("SELECT SUM(valor_estimado) AS s FROM oportunidades WHERE status = 'ativa'")).s || 0,
    aprovadas: (await um("SELECT COUNT(*) AS n FROM propostas WHERE status = 'aprovada' AND (ativo IS NULL OR ativo = 1)")).n,
  };
}
async function conferirConteudo(T, quem) {
  const b = await numerosDoBanco();
  const errados = [];
  const [s1, d] = await j('GET', '/dashboard', T);
  if (!(s1 === 200 && d.totalClientes === b.totalClientes && d.totalOportunidades === b.totalOportunidades && d.valorTotalOportunidades === b.valorTotalOportunidades
    && (d.propostasPorStatus.find((x) => x.status === 'aprovada') || {}).total === b.aprovadas)) errados.push(`${quem} painel: ${s1} ${JSON.stringify(d).slice(0, 200)}`);
  const [s2, h] = await j('GET', '/dashboard/historico', T);
  if (!(s2 === 200 && Array.isArray(h) && h.some((x) => x.propostas_aprovadas >= 1))) errados.push(`${quem} historico: ${s2} ${JSON.stringify(h).slice(0, 200)}`);
  const [s3, a] = await j('GET', '/dashboard/avancado', T);
  if (!(s3 === 200 && Array.isArray(a.topClientesPorValor) && a.topClientesPorValor.some((x) => JSON.stringify(x).includes('ZETA153')))) errados.push(`${quem} avancado: ${s3} ${JSON.stringify(a).slice(0, 200)}`);
  const [s4, v] = await j('GET', '/dashboard/vendas', T);
  if (!(s4 === 200 && v.analisePipeline && v.analisePipeline.totalPropostas >= 1)) errados.push(`${quem} vendas: ${s4} ${JSON.stringify(v).slice(0, 200)}`);
  const [s5, e] = await j('GET', '/relatorios/executivo', T);
  if (!(s5 === 200 && e.kpis.oportunidadesAtivas === b.oportunidadesAtivas && e.kpis.pipeline === b.pipeline && e.kpis.propostasAprovadas === b.aprovadas)) errados.push(`${quem} executivo: ${s5} ${JSON.stringify(e && e.kpis).slice(0, 200)}`);
  const [s6, vt] = await j('GET', '/relatorios/visitas-tecnicas', T);
  if (!(s6 === 200 && JSON.stringify(vt).includes('ZETA153 CLIENTE'))) errados.push(`${quem} visitas: ${s6} ${JSON.stringify(vt).slice(0, 200)}`);
  const [s7, mp] = await j('GET', '/mapa/maquinas-vendidas', T);
  if (!(s7 === 200 && JSON.stringify(mp).includes('ZETA153 CLIENTE'))) errados.push(`${quem} mapa: ${s7} ${JSON.stringify(mp).slice(0, 200)}`);
  const [s8, bg] = await j('GET', `/busca-global?q=${TERMO}`, T);
  if (!(s8 === 200 && JSON.stringify(tiposDe(bg)) === JSON.stringify(TIPOS))) errados.push(`${quem} busca: ${s8} ${JSON.stringify(tiposDe(bg))}`);
  if (b.oportunidadesAtivas < 1 || b.pipeline <= 0 || b.aprovadas < 1) errados.push('o preparo nao tem oportunidade ativa ou proposta aprovada (o conteudo nao provaria nada)');
  return errados;
}

// ── RN-153.01/02: a regua pelo fonte ──────────────────────────────────────────────────────
test('[RN-153.01/02, C355, C352] fonte: as 7 com o exigirComercialNasPropostas e a busca com o filtrarBuscaGlobalPorModulo como 2o middleware, cada uma registrada uma vez e so no index.js; o mapa da busca cobre todo tipo que ela devolve', () => {
  const todas = [...SETE_DEF, ['GET', BUSCA]];
  assert.deepStrictEqual(todas.map(achar).filter((r) => r.resto === '(nao registrada)').map((r) => r.rota), [], 'uma rota sumiu do fonte');
  const reTodos = /\.(get|post|put|patch|delete|all|use|route)\(\s*\[?\s*["'`](\/(?:api\/)?(?:dashboard|relatorios|mapa|busca-global)(?:\/[^"'`]*)?)["'`]/gi;
  assert.deepStrictEqual([...FONTE.matchAll(reTodos)].map((m) => `${m[1].toUpperCase()} ${m[2]}`).sort(), todas.map(([m, r]) => `${m} ${r}`).sort(),
    'um registro a mais (na mesma linha, em duas linhas, em lista ou com outra caixa) escaparia do portao');
  assert.deepStrictEqual(regua.registrosNaoLiterais(['/api/dashboard', '/api/relatorios', '/api/mapa', BUSCA]), regua.REGISTROS_NAO_LITERAIS_MEDIDOS,
    'um registro com o caminho que nao e texto literal (ou montado) escaparia das reguas do fonte');
  const { fora, vistos } = regua.registrosForaDoIndex(/["'`]\/api\/(dashboard|relatorios|mapa|busca-global)\b/i);
  assert.deepStrictEqual(fora, [], 'rota registrada fora do index.js escaparia desta regua');
  assert.ok(vistos.includes(path.join('routes', 'almoxarifado.js')) && vistos.includes(path.join('services', 'portaoDasPropostas.js')), 'a varredura nao enxerga routes/ ou services/');
  assert.ok(!/app\.use\(\s*\[?\s*["'`]\/(api\/)?(dashboard|relatorios|mapa|busca-global)/i.test(FONTE), 'um app.use no prefixo atenderia antes do portao');
  const sem = SETE_DEF.map(achar).filter((r) => !r.resto.startsWith('authenticateToken, exigirComercialNasPropostas, ')).map((r) => `${r.metodo} ${r.rota}: ${r.resto.slice(0, 80)}`);
  assert.deepStrictEqual(sem, []);
  assert.ok(achar(['GET', BUSCA]).resto.startsWith('authenticateToken, filtrarBuscaGlobalPorModulo, '), `a busca: ${achar(['GET', BUSCA]).resto.slice(0, 80)}`);
  // RN-153.02: todo tipo que o corpo da busca devolve esta no mapa (um tipo novo sem modulo sumiria — ou passaria sem filtro)
  const i = FONTE.indexOf("app.get('/api/busca-global'");
  const corpo = FONTE.slice(i, FONTE.indexOf('// ========== ROTAS DE REPORTS', i));
  const tiposDoCorpo = [...new Set([...corpo.matchAll(/'(\w+)' as type/g)].map((m) => m[1]))].sort();
  assert.deepStrictEqual(tiposDoCorpo, TIPOS, 'os tipos do corpo da busca');
  const mapa = /const TIPOS_DA_BUSCA_GLOBAL = (\{[^}]*\});/.exec(FONTE);
  assert.ok(mapa, 'o mapa TIPOS_DA_BUSCA_GLOBAL');
  // eslint-disable-next-line no-new-func
  const lido = Function(`return ${mapa[1]}`)();
  assert.deepStrictEqual(Object.keys(lido).sort(), TIPOS, 'o mapa nao cobre todo tipo do corpo');
  // Fase 5 r3 (familia 3): e os VALORES — todo tipo leva ao Comercial (todo resultado abre uma tela do Comercial)
  assert.deepStrictEqual(TIPOS.map((t) => [t, lido[t]]), TIPOS.map((t) => [t, ['comercial']]), 'o modulo de um tipo da busca');
  // cada push do corpo passa pelo filtro do tipo dele
  const pushes = [...corpo.matchAll(/results\.push\(/g)].length;
  const filtrados = TIPOS.filter((t) => corpo.includes(`podeVer('${t}')`)).length;
  assert.deepStrictEqual([pushes, filtrados], [6, 6], 'um tipo e empurrado sem o filtro');
});

// Etapa 155 (RN-155.02, C364, B999): a busca do client nao busca para quem a regua da tela nao da nenhum modulo dos tipos da busca. O conjunto
// que o client usa (MODULOS_DA_BUSCA_GLOBAL, client/src/utils/buscaGlobalAcesso.js) = o dos valores de TIPOS_DA_BUSCA_GLOBAL — um tipo novo de
// outro modulo no servidor sem entrar no client faria a busca calar para quem o pode ver.
test('[RN-155.02, C364, B999] o client: os modulos com que a busca decide se busca = os modulos de TIPOS_DA_BUSCA_GLOBAL; a busca le o cache e, frio, as permissoes', () => {
  const mapa = /const TIPOS_DA_BUSCA_GLOBAL = (\{[^}]*\});/.exec(FONTE);
  // eslint-disable-next-line no-new-func
  const doServidor = [...new Set(Object.values(Function(`return ${mapa[1]}`)()).flat())].sort();
  const util = fs.readFileSync(path.join(SERVER_DIR, '..', 'client', 'src', 'utils', 'buscaGlobalAcesso.js'), 'utf8');
  const doClient = /export const MODULOS_DA_BUSCA_GLOBAL = (\[[^\]]*\]);/.exec(util);
  assert.ok(doClient, 'o MODULOS_DA_BUSCA_GLOBAL do client');
  // eslint-disable-next-line no-new-func
  assert.deepStrictEqual([...Function(`return ${doClient[1]}`)()].sort(), doServidor, 'o client decide com outros modulos que o servidor');
  assert.ok(doServidor.length >= 1);
  // a tela decide por essa regua (o cache e, frio, a leitura) — sem os comentarios
  const tela = fs.readFileSync(path.join(SERVER_DIR, '..', 'client', 'src', 'components', 'BuscaGlobal.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.ok(tela.includes('podeUsarBuscaGlobal(user, user?.id ? getCachedUserPermissions(user.id) : null)') && tela.includes('fetchUserPermissions(user.id)'), 'a busca nao decide pela regua da tela');
});

// ── RN-153.04: as camadas do Express de verdade ───────────────────────────────────────────
test('[RN-153.01/02/04] as camadas do Express montado: so as 8 atendem os 4 prefixos, cada uma com o login e o portao (ou o filtro da busca, com o mapa inteiro) antes de tudo; nenhum middleware so delas, nenhum app.param', () => {
  const cam = camadas.lerCamadas(pasta);
  assert.deepStrictEqual(camadas.conferirCamadas(cam, ROTAS_DAS_CAMADAS, { neutro: NEUTRO }), []);
  assert.ok(cam.despacho.length === AMOSTRAS_DAS_CAMADAS.length && cam.despacho.filter((d) => d.atendida).length >= 8, 'o despejo nao despachou as amostras');
});

test('[RN-153.04] o helper das camadas acusa cada defeito que promete ver (sobre camadas sinteticas) e nao acusa as certas', () => {
  const N = '/api/zz-n';
  // a pilha sintetica: a (0) e b (1) antes das rotas, as rotas em 5 e 6, c (9) depois delas (como os tratadores de erro do index.js)
  const mws = [{ tipo: 'mw', nome: 'a', idx: 0 }, { tipo: 'mw', nome: 'b', idx: 1 }, { tipo: 'mw', nome: 'c', idx: 9 }];
  const rotas = [{ metodo: 'GET', rota: '/api/x/:id', cadeia: ['authenticateToken', 'portao:comercial'] }, { metodo: 'POST', rota: '/api/x', cadeia: ['authenticateToken', 'portao:comercial'] }];
  const IDX = { '/api/x/:id': 5, '/api/x': 6 };
  const atendida = (metodo, caminho, rota, handles, antes = mws.slice(0, 2)) => ({ metodo, caminho, atendida: true, out: [...antes, { tipo: 'rota', caminho: rota, handles, idx: IDX[rota] !== undefined ? IDX[rota] : 7 }] });
  const base = () => ({
    params: [],
    despacho: [
      { metodo: 'GET', caminho: N, atendida: false, out: mws },
      atendida('GET', '/api/x/9', '/api/x/:id', ['authenticateToken', 'portao:comercial', 'h']),
      atendida('POST', '/api/x', '/api/x', ['authenticateToken', 'portao:comercial', 'multer', 'h']),
      atendida('GET', '/API/X/9', '/api/x/:id', ['authenticateToken', 'portao:comercial', 'h']),
      { metodo: 'PUT', caminho: '/api/x/zz', atendida: false, out: mws },
    ],
    rotas: ['get /api/x/:id', 'post /api/x'],
    todas: ['get /api/x/:id', 'post /api/x', 'get /api/xis/:id', 'get /api/outra/:id'],
  });
  const conf = (cam, op = {}) => camadas.conferirCamadas(cam, rotas, { neutro: N, ...op });
  assert.deepStrictEqual(conf(base()), [], 'as camadas certas foram acusadas');
  const defeitos = {
    'rota a mais (outro verbo, de qualquer arquivo)': [(c) => { c.rotas.push('put,search /api/x/:id'); }, /registros a mais .*put \/api\/x\/:id; search \/api\/x\/:id/],
    'sem o portao': [(c) => { c.despacho[1].out[2].handles = ['authenticateToken', 'h']; }, /GET \/api\/x\/:id: authenticateToken, h/],
    'portao em 3o': [(c) => { c.despacho[2].out[2].handles = ['authenticateToken', 'multer', 'portao:comercial', 'h']; }, /POST \/api\/x: authenticateToken, multer/],
    'outro portao': [(c) => { c.despacho[1].out[2].handles = ['authenticateToken', 'portao:operacional', 'h']; }, /portao:operacional/],
    'middleware so do prefixo': [(c) => { c.despacho[1].out.splice(1, 0, { tipo: 'mw', nome: 'soDoPrefixo', idx: 1 }); }, /GET \/api\/x\/:id: middlewares antes 0:a > 1:soDoPrefixo/],
    // Fase 5 r3 (familia 2): o do prefixo com o NOME de um global registrado depois das rotas — so a posicao o denuncia
    'middleware so do prefixo com o nome de um global posterior': [(c) => { c.despacho[1].out.splice(2, 0, { tipo: 'mw', nome: 'c', idx: 4 }); }, /GET \/api\/x\/:id: middlewares antes 0:a > 1:b > 4:c/],
    'um router no caminho': [(c) => { c.despacho[1].out.splice(0, 0, { tipo: 'router', nome: 'router', em: '/api', idx: 2 }); }, /router:router@\/api/],
    'um app.param': [(c) => { c.params = ['id']; }, /app\.param: id/],
    'um extra atendido por rota fora da lista': [(c) => { c.despacho[4] = atendida('PUT', '/api/x/zz', '/api/x/:qualquer', ['authenticateToken', 'h']); }, /PUT \/api\/x\/zz: atendido por \/api\/x\/:qualquer, que o teste nao declara/],
    'o extra atendido pela declarada sem o portao (caixa)': [(c) => { c.despacho[3].out[2].handles = ['authenticateToken', 'h']; }, /GET \/API\/X\/9 -> \/api\/x\/:id: authenticateToken, h/],
    'a rota atendida por outra (registrada antes)': [(c) => { c.despacho[1].out[2].caminho = '/api/x/:outro'; }, /GET \/api\/x\/:id: atendida por \/api\/x\/:outro/],
    'a declarada que nao casou amostra nenhuma': [(c) => { c.rotas = ['get /api/x/:id']; }, /declarados que nao casaram nenhuma amostra: post \/api\/x/],
    'o neutro atendido': [(c) => { c.despacho[0].atendida = true; }, /o caminho neutro nao serve de regua/],
    // Fase 5 r3 (familia 1): a rota montada no prefixo que nenhuma amostra casa, e o caminho que nao e texto
    'rota montada no prefixo que nenhuma amostra casa': [(c) => { c.todas.push('get,head /api/x/exportar', 'search /API/X.json'); }, /nao declara: get \/api\/x\/exportar; head \/api\/x\/exportar; search \/API\/X\.json/],
    'rota com caminho em regexp': [(c) => { c.todas.push('get /\\/api\\/y/i'); }, /caminho que nao e texto simples: get \/\\\/api\\\/y\/i/],
    'rota num router de prefixo em regexp': [(c) => { c.todas.push('post ~^\\/a(b)?\\/?(?=\\/|$)/z'); }, /caminho que nao e texto simples: post ~/],
    'o despejo sem a lista de todas as rotas': [(c) => { delete c.todas; }, /nao trouxe todas as rotas/],
  };
  const naoAcusou = [];
  for (const [nome, [estraga, re]] of Object.entries(defeitos)) {
    const c = base(); estraga(c);
    const erros = conf(c);
    if (!erros.some((e) => re.test(e))) naoAcusou.push(`${nome}: ${JSON.stringify(erros)}`);
  }
  assert.deepStrictEqual(naoAcusou, []);
  // o medido de outro prefixo passa so quando declarado
  const comOutro = base(); comOutro.rotas.push('get /api/:qualquer');
  assert.ok(conf(comOutro).length === 1 && conf(comOutro, { alemDasRotas: ['get /api/:qualquer'] }).length === 0, 'o alemDasRotas');
  // Fase 5 r3 (familia 3): a rota de outra etapa no mesmo prefixo ({ metodo, rota, cadeia }) vale no despacho COM A CADEIA DELA
  const outraEtapa = [{ metodo: 'PUT', rota: '/api/x/:id', cadeia: ['authenticateToken', 'portao:comercial'] }];
  const comOutraEtapa = (handles) => { const c = base(); c.rotas.push('put /api/x/:id'); c.todas.push('put /api/x/:id'); c.despacho[4] = atendida('PUT', '/api/x/zz', '/api/x/:id', handles); return c; };
  assert.deepStrictEqual(conf(comOutraEtapa(['authenticateToken', 'portao:comercial', 'h']), { alemDasRotas: outraEtapa }), [], 'a rota de outra etapa com a cadeia certa');
  const errOutra = conf(comOutraEtapa(['authenticateToken', 'h']), { alemDasRotas: outraEtapa });
  assert.ok(errOutra.some((e) => /PUT \/api\/x\/zz -> \/api\/x\/:id: authenticateToken, h/.test(e)), `a rota de outra etapa sem o portao passou: ${JSON.stringify(errOutra)}`);
  assert.ok(conf(comOutraEtapa(['authenticateToken', 'portao:comercial', 'h'])).some((e) => /PUT \/api\/x\/zz: atendido por \/api\/x\/:id, que o teste nao declara/.test(e)), 'sem declarar, a rota de outra etapa passou');
  // as amostras: cada rota instanciada, o neutro, e os extras em seis verbos por prefixo
  const am = camadas.amostrasDasCamadas(rotas, { neutro: N });
  const tem = (m, c) => am.some(([a, b]) => a === m && b === c);
  assert.ok(tem('GET', '/api/x/9') && tem('POST', '/api/x') && tem('GET', N) && tem('SEARCH', '/api/x/zz-exportar') && tem('GET', '/api/x/9/zz-exportar')
    && tem('PATCH', '/API/X') && tem('PATCH', '/API/X/9') && tem('DELETE', '/api/x/a/b/c/d') && tem('PUT', '/api/x.json'), JSON.stringify(am).slice(0, 300));
  assert.strictEqual(am.length, 2 + 1 + 6 * 6, 'as amostras');
  // o nome que o despejo da (Fase 5 r3, familia 3): o filtro com o mapa inteiro, os modulos e o caminho de Configuracoes do portao
  const filtro = () => {}; filtro.tiposDoFiltro = { t: ['a', 'b'], s: ['c'] };
  const portao = () => {}; portao.modulosDoPortao = ['comercial', 'operacional']; portao.caminhoDoPortao = { admin: 'comercial', tela: 'administrativo' };
  assert.deepStrictEqual([nomeDaCamada(filtro), nomeDaCamada(portao), nomeDaCamada(function authenticateToken() {}), nomeDaCamada(() => {})],
    ['filtro:s=c,t=a|b', 'portao:comercial|operacional+configuracoes', 'authenticateToken', '<anonima>']);
});

// ── RN-153.01/02: pela rota ───────────────────────────────────────────────────────────────
test('[RN-153.01/02, C355, C352] o usuario que a tela barra do Comercial (so a direta do Almoxarifado) toma 403 em cada uma das 7 (com e sem os filtros) e a busca nao lhe devolve nada — nada muda; o administrador, com o mesmo termo, ve os seis tipos', async () => {
  const b = ctx.u.soAlmox;
  const antes = await retrato();
  assert.deepStrictEqual(await negados(b.id), [], 'o usuario barrado ja tinha log');
  const errados = [];
  let chamadas = 0;
  for (const [m, r] of SETE_DEF) {
    for (const c of [r, ...(COM_FILTROS.includes(r) ? [r + FILTROS()] : [])]) {
      const [s, x] = await cru(m, c, b.T);
      chamadas++;
      if (s !== 403 || JSON.stringify(x) !== JSON.stringify(NEGADO_COM)) errados.push(`${m} ${c}: ${s} ${JSON.stringify(x).slice(0, 80)}`);
    }
  }
  assert.deepStrictEqual(errados, []);
  assert.strictEqual(chamadas, 9, 'as 7 e as 2 com os filtros');
  for (const q of [TERMO, 'ZETA', 'a1', 'Proposta']) {
    const [s, x] = await j('GET', `/busca-global?q=${encodeURIComponent(q)}`, b.T);
    assert.deepStrictEqual([s, x], [200, []], `RN-153.02 a busca do barrado (${q})`);
  }
  await pausa(800);
  assert.strictEqual(await retrato(), antes, 'uma rota barrada mudou o cadastro');
  assert.deepStrictEqual(await negados(b.id), [{ modulo: 'comercial', nome_modulo: 'Comercial', n: 9 }], 'cada 403 registra o acesso negado (e a busca nao registra)');
  // a metade positiva: o mesmo termo, o administrador ve os seis tipos (o termo casa cada um)
  const [sa, xa] = await j('GET', `/busca-global?q=${TERMO}`, ctx.T);
  assert.deepStrictEqual([sa, tiposDe(xa)], [200, TIPOS], `a busca do administrador: ${JSON.stringify(xa).slice(0, 300)}`);
  // e a lista de clientes (a regua dos tres modulos da 154 admite o Almoxarifado) o barrado le
  const [sc, cl] = await j('GET', '/clientes', b.T);
  assert.ok(sc === 200 && cl.some((c) => c.id === ctx.cliente), `lista de clientes: ${sc}`);
});

test('[RN-153.01/02, integracao] o vendedor (so o Comercial) abre o painel (com e sem os filtros), os relatorios e o mapa com os numeros do banco, busca e abre cada resultado; o barrado nao recebe resultado que a tela dele barraria', async () => {
  const u = ctx.u.diretaComercial;
  assert.deepStrictEqual(await conferirConteudo(u.T, 'vendedor'), []);
  // os filtros do painel: o usuario responsavel pela proposta aprovada (ele) e outro
  const [sf, df] = await j('GET', `/dashboard${FILTROS()}`, u.T);
  assert.ok(sf === 200 && (df.propostasPorStatus.find((x) => x.status === 'aprovada') || {}).total === 1, `o filtro do painel: ${sf} ${JSON.stringify(df.propostasPorStatus)}`);
  const [so, dOutro] = await j('GET', `/dashboard?usuario=${ctx.u.soAlmox.id}`, u.T);
  assert.deepStrictEqual([so, dOutro.propostasPorStatus], [200, []], 'o filtro de outro usuario');
  const [sav] = await j('GET', `/dashboard/avancado${FILTROS()}`, u.T);
  assert.strictEqual(sav, 200);
  // as outras duas leituras que o painel faz ao abrir (Fase 2 M-6): os usuarios do filtro e os logos dos clientes (o portao da 151)
  const [suf, uf] = await j('GET', '/usuarios/por-modulo/comercial', u.T);
  const [slg] = await j('GET', '/clientes/logos', u.T);
  assert.deepStrictEqual([suf, Array.isArray(uf), slg], [200, true, 200], 'o painel abre os usuarios do filtro e os logos');
  // a busca e o clique: cada resultado, a leitura que a tela dele faz ao abrir
  const [sb, res] = await j('GET', `/busca-global?q=${TERMO}`, u.T);
  assert.deepStrictEqual([sb, tiposDe(res)], [200, TIPOS]);
  // Fase 5 r3 (familia 5): a ordem de sempre — clientes, projetos, propostas, oportunidades, atividades, produtos
  assert.deepStrictEqual([...new Set(res.map((r) => r.type))], ['cliente', 'projeto', 'proposta', 'oportunidade', 'atividade', 'produto'], 'a ordem dos resultados');
  const errados = [];
  for (const r of res) {
    const [s, x] = await j('GET', LEITURA_DO_CLIQUE[r.type](r.id), u.T);
    if (s !== 200 || !achouNaLeitura(r.type, r.id, x)) errados.push(`${r.type} ${r.id}: ${s} ${JSON.stringify(x).slice(0, 100)}`);
  }
  assert.deepStrictEqual(errados, []);
  // o corpo de cada resultado como antes (id, title, subtitle, type)
  assert.ok(res.every((r) => Object.keys(r).sort().join() === 'id,subtitle,title,type'), JSON.stringify(res[0]));
  assert.ok(res.find((r) => r.type === 'cliente' && r.id === ctx.cliente && r.title === 'ZETA153 CLIENTE' && r.subtitle === 'CAMPINAS, SP'), JSON.stringify(res.filter((r) => r.type === 'cliente')));
  await pausa(400);
  assert.deepStrictEqual(await negados(u.id), [], 'o portao registrou acesso negado para quem passou');
  // o barrado: a busca nao lhe oferece nada — e cada uma dessas leituras a tela dele barraria (403)
  const b = ctx.u.soAlmox;
  const [sbb, rb] = await j('GET', `/busca-global?q=${TERMO}`, b.T);
  assert.deepStrictEqual([sbb, rb], [200, []]);
  const lidos = [];
  for (const r of res) lidos.push(`${r.type}:${(await j('GET', LEITURA_DO_CLIQUE[r.type](r.id), b.T))[0]}`);
  assert.deepStrictEqual([...new Set(lidos)].sort(), TIPOS.map((t) => `${t}:403`), 'a busca esconderia um resultado que a tela do barrado abre');
});

// ── por usuario, decide como a tela ───────────────────────────────────────────────────────
test('[RN-153.01/02] por usuario: as 7 e a busca decidem como a tela do Comercial (a linha "relatorios" do cadastro de usuario nao abre)', async () => {
  const esperado = {
    semNada: 200, diretaComercial: 200, grupoComercial: 200, grupoVazio: 200, superU: 200, roleAdmin: 200,
    comercialGrupoInativo: 403, comercialPermissao0: 403, comercialGrupo0: 403, soAlmox: 403, soOperacional: 403, soEngProjetos: 403,
    adminComercialComAdministrativo: 403, grupoAlmox: 403, soLinhaRelatorios: 403,
  };
  const linhas = [];
  for (const k of Object.keys(esperado)) {
    const u = ctx.u[k];
    const [sg, g] = await j('GET', `/usuarios/${u.id}/grupos`, ctx.T);
    assert.strictEqual(sg, 200, JSON.stringify(g));
    const quem = { id: u.id, role: u.role, is_superadmin: u.superadmin ? 1 : 0, admin_modulos: u.adminModulos ? JSON.stringify(u.adminModulos) : '[]' };
    const tela = temModuloComoATela(quem, g.permissoes, ['comercial']) ? 200 : 403;
    const [s1] = await j('GET', '/dashboard', u.T);
    const [s2] = await j('GET', '/relatorios/executivo', u.T);
    const [s3] = await j('GET', '/mapa/maquinas-vendidas', u.T);
    const [s4, bg] = await j('GET', `/busca-global?q=${TERMO}`, u.T);
    const busca = s4 === 200 && JSON.stringify(tiposDe(bg)) === JSON.stringify(TIPOS) ? 200 : s4 === 200 && bg.length === 0 ? 403 : `?${s4}`;
    linhas.push([k, s1, s2, s3, busca, tela]);
  }
  assert.deepStrictEqual(linhas, Object.entries(esperado).map(([k, v]) => [k, v, v, v, v, v]));
});

// ── RN-153.03 e o BUSY: reboots ───────────────────────────────────────────────────────────
test('[RN-153.03] PROPOSTAS_PORTAO_DE_MODULO=desligado: as 7 abrem ao barrado e ao grupo sem o Comercial com o conteudo, a busca mostra os seis tipos (o aviso do boot cita as duas); ligado de novo, barra', async () => {
  const b = ctx.u.soAlmox;
  assert.ok(!/PROPOSTAS_PORTAO_DE_MODULO=desligado/.test(fs.readFileSync(logArq, 'utf8')), 'o aviso do desligado saiu com o portao ligado');
  await descer();
  ctx.T = await subir({ PROPOSTAS_PORTAO_DE_MODULO: 'desligado' });
  try {
    await logar(b);
    await logar(ctx.u.grupoAlmox);
    const aviso = (fs.readFileSync(logArq, 'utf8').match(/⚠️ PROPOSTAS_PORTAO_DE_MODULO=desligado[^\n]*/) || [''])[0];
    assert.ok(/e as dos painéis, dos relatórios e do mapa do Comercial NAO exigem o Comercial \(só o login\), e a busca global mostra todos os tipos de resultado a qualquer logado; a lista de ordens de serviço do Operacional volta à régua antiga do módulo/.test(aviso)
      && /as dos custos de viagem NAO exigem o Comercial \(só o login\)/.test(aviso)
      && /clientes, dos projetos, das oportunidades e das atividades NAO exigem o Comercial \(só o login\)/.test(aviso),
    `o aviso do boot nao cita os paineis e a busca: ${aviso.slice(0, 600)}`);
    const errados = [];
    for (const u of [ctx.u.grupoAlmox, b]) errados.push(...await conferirConteudo(u.T, u.nome));
    assert.deepStrictEqual(errados, []);
  } finally {
    await descer();
    ctx.T = await subir();
  }
  await logar(b);
  await logar(ctx.u.grupoAlmox);
  const [sg1, xg1] = await j('GET', '/dashboard', ctx.u.grupoAlmox.T);
  const [sg2, xg2] = await j('GET', `/busca-global?q=${TERMO}`, ctx.u.grupoAlmox.T);
  const [s6, x6] = await j('GET', '/relatorios/executivo', b.T);
  const [s7, x7] = await j('GET', `/busca-global?q=${TERMO}`, b.T);
  assert.deepStrictEqual([sg1, xg1, sg2, xg2, s6, x6, s7, x7], [403, NEGADO_COM, 200, [], 403, NEGADO_COM, 200, []], 'ligado de novo');
  assert.deepStrictEqual(await conferirConteudo(ctx.u.diretaComercial.T, 'vendedor, ligado de novo'), []);
});

test('[RN-153.01/02] SQLITE_BUSY ao ler as permissoes: 503 no painel e na busca (cada um com o contexto dele); outro erro: 500; o administrador nem le; nada grava', async () => {
  const b = ctx.u.soOperacional;
  const FALHA = 'p\\.modulo, p\\.permissao FROM grupos_permissoes';
  const antes = await retrato();
  await descer();
  ctx.T = await subir({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'all', FALHA_SQL_MSG: 'SQLITE_BUSY: database is locked' });
  try {
    await logar(b);
    const corpo503 = (context) => ({ error: 'Banco temporariamente ocupado. Tente novamente em alguns segundos.', code: 'SQLITE_BUSY', retryAfter: 3, context });
    const [s1, x1] = await j('GET', '/dashboard', b.T);
    const [s2, x2] = await j('GET', `/busca-global?q=${TERMO}`, b.T);
    assert.deepStrictEqual([s1, x1, s2, x2], [503, corpo503('portao:propostas'), 503, corpo503('portao:busca-global')]);
    const [sa] = await j('GET', '/mapa/maquinas-vendidas', ctx.T);
    const [sb, xb] = await j('GET', `/busca-global?q=${TERMO}`, ctx.T);
    assert.deepStrictEqual([sa, sb, tiposDe(xb)], [200, 200, TIPOS], 'o administrador passa sem ler as linhas');
    // Fase 5 r3 (familia 4): o super (sem o role admin) tambem passa sem ler — na busca e no painel
    await logar(ctx.u.superU);
    const [ss1] = await j('GET', '/dashboard', ctx.u.superU.T);
    const [ss2, xs2] = await j('GET', `/busca-global?q=${TERMO}`, ctx.u.superU.T);
    assert.deepStrictEqual([ss1, ss2, tiposDe(xs2)], [200, 200, TIPOS], 'o super passa sem ler as linhas');
    await descer();
    ctx.T = await subir({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'all' });
    await logar(b);
    const E500 = { error: 'Erro ao verificar permissões' };
    const [s4, x4] = await j('GET', '/relatorios/executivo', b.T);
    const [s5, x5] = await j('GET', `/busca-global?q=${TERMO}`, b.T);
    assert.deepStrictEqual([s4, x4, s5, x5], [500, E500, 500, E500]);
    assert.ok(/\[falha injetada\]\s+SELECT p\.modulo, p\.permissao FROM grupos_permissoes/.test(fs.readFileSync(logArq, 'utf8')),
      'a falha injetada nao casou com a leitura do portao (o teste nao provou nada)');
  } finally {
    await descer();
    ctx.T = await subir();
  }
  assert.strictEqual(await retrato(), antes, 'com o portao em erro, o cadastro mudou');
});

(async () => {
  console.log('\n=== Etapa 153: os paineis, os relatorios e o mapa exigem o Comercial, e a busca global filtra pelo modulo (C355, C352) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e153-pb-'));
    ctx.T = await subir();
    abrirCru();
    // o cadastro: um de cada tipo, todos com o termo (a busca casa os seis), e uma proposta aprovada (o mapa, o painel, o relatorio)
    const [sc, c] = await j('POST', '/clientes', ctx.T, { razao_social: 'Zeta153 Cliente', cidade: 'Campinas', estado: 'SP' });
    assert.strictEqual(sc, 200, JSON.stringify(c));
    ctx.cliente = c.id;
    const [sp, p] = await j('POST', '/projetos', ctx.T, { nome: 'Zeta153 Projeto', cliente_id: ctx.cliente, status: 'ativo' });
    assert.strictEqual(sp, 200, JSON.stringify(p));
    const [so, o] = await j('POST', '/oportunidades', ctx.T, { titulo: 'Zeta153 Oportunidade', cliente_id: ctx.cliente, status: 'ativa', valor_estimado: 1530 });
    assert.strictEqual(so, 200, JSON.stringify(o));
    const [sa, a] = await j('POST', '/atividades', ctx.T, { titulo: 'Zeta153 Atividade', cliente_id: ctx.cliente, tipo: 'visita', status: 'pendente' });
    assert.strictEqual(sa, 200, JSON.stringify(a));
    const [spr, pr] = await j('POST', '/produtos', ctx.T, { codigo: 'E153-01', nome: 'Zeta153 Produto', familia: 'FAM153', classificacao_area: 'NAO CLASSIFICADA', preco_base: 15 });
    assert.strictEqual(spr, 200, JSON.stringify(pr));
    // grupos gravados por fora: 901 ativo com Comercial, 903 ativo sem linha, 905 inativo com Comercial, 906 ativo so com o Almoxarifado
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
      soLinhaRelatorios: await usuario('slrel', { diretasCrus: [['relatorios', 'visualizar', 1]] }),
    };
    await run('UPDATE usuarios SET is_superadmin = 1 WHERE id = ?', [ctx.u.superU.id]);
    ctx.u.superU.superadmin = true;
    assert.strictEqual((await all('SELECT is_superadmin FROM usuarios WHERE id = ?', [ctx.u.roleAdmin.id]))[0].is_superadmin, 0, 'o role admin do cenario nao pode ser super');
    // a proposta aprovada (por fora: o formulario da proposta nao e o assunto), do vendedor, com o termo no titulo
    await run("INSERT INTO propostas (cliente_id, numero_proposta, titulo, status, valor_total, responsavel_id, created_by, created_at) VALUES (?, 'E153-0001', 'Zeta153 Proposta', 'aprovada', 15300, ?, ?, datetime('now'))",
      [ctx.cliente, ctx.u.diretaComercial.id, ctx.u.diretaComercial.id]);
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
