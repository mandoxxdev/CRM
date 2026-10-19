/**
 * Etapa 154 (Comercial) — as listas de clientes e de projetos pela regua da TELA dos modulos que as leem (o Comercial, o Almoxarifado ou o
 * Operacional), e as notificacoes do sino filtradas pelo modulo do tipo (o lembrete da proposta -> o Comercial). Pelo `index.js` de
 * verdade (pasta vazia): C353, C363.
 *
 *   RN-154.01  GET /api/clientes e GET /api/projetos passam pelo `exigirLeitorDasListasDeClientesEProjetos` (basta um dos tres) logo
 *              depois do login
 *   RN-154.02  GET /api/notificacoes passa pelo `filtrarNotificacoesPorModulo`: so os tipos cujo modulo a tela aceita; nenhum -> 200 []
 *              sem log de acesso negado
 *   RN-154.04  PROPOSTAS_PORTAO_DE_MODULO=desligado: as listas voltam ao so login e os lembretes a qualquer logado; o aviso do boot as cita
 *   (RN-154.03, o endereco do clique do sino, e do client: client/src/components/Notificacoes.test.js)
 *
 * As camadas das duas listas ficam com o teste da 151 (clientesProjetosPortao — o dono dos prefixos /api/clientes e /api/projetos); aqui as
 * do prefixo /api/notificacoes. Molde: paineisBuscaGlobalPortao.api.test.js (Etapa 153). Plano:
 * docs/superpowers/plans/2026-10-19-almoxarifado-etapa154-listas-de-clientes-e-projetos-e-notificacoes-pelo-modulo.md
 * Executar: cd server && node tests/api/listasNotificacoesPortao.api.test.js
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

const SERVER_DIR = path.join(__dirname, '..', '..');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

// ── as rotas ──────────────────────────────────────────────────────────────────────────────
const LISTAS = [['GET', '/api/clientes'], ['GET', '/api/projetos']];
const NOTIF = '/api/notificacoes';
const TIPOS = ['lembrete_proposta'];
const FILTRO = 'filtro:lembrete_proposta=comercial';
const ROTAS_DAS_CAMADAS = [{ metodo: 'GET', rota: NOTIF, cadeia: ['authenticateToken', FILTRO] }];
const NEUTRO = '/api/zz-neutro-154';
const AMOSTRAS_DAS_CAMADAS = camadas.amostrasDasCamadas(ROTAS_DAS_CAMADAS, { neutro: NEUTRO });
const MODULOS_DAS_LISTAS = ['comercial', 'almoxarifado', 'operacional'];

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
const SEED = { email: 'e154seed@t.com', senha: 'E154seed!senha' };
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
const ctx = { n: 0, lembrete: {} };
const { temModuloComoATela } = require('../../services/portaoDasPropostas');

const NEGADO_LISTAS = { error: 'Acesso negado ao módulo', modulo: MODULOS_DAS_LISTAS };
const LOG_LISTAS = (n) => [{ modulo: 'comercial|almoxarifado|operacional', nome_modulo: 'Comercial ou Almoxarifado ou Operacional', n }];

const FONTE = fs.readFileSync(path.join(SERVER_DIR, 'index.js'), 'utf8');
const REGISTRO = /^app\.(get|post|put|patch|delete)\('([^']+)', ([^\n]*)$/gm;
const TODOS = [...FONTE.matchAll(REGISTRO)].map((m) => ({ metodo: m[1].toUpperCase(), rota: m[2], resto: m[3], pos: m.index }));
const achar = ([m, r]) => (TODOS.find((x) => x.metodo === m && x.rota === r) || { metodo: m, rota: r, resto: '(nao registrada)', pos: -1 });

const negados = async (id) => all("SELECT modulo, nome_modulo, COUNT(*) AS n FROM logs_auditoria WHERE tipo = 'acesso_negado' AND usuario_id = ? GROUP BY modulo, nome_modulo ORDER BY modulo", [id]);
const retrato = async () => JSON.stringify([await all('SELECT * FROM clientes ORDER BY id'), await all('SELECT * FROM projetos ORDER BY id'), await all('SELECT id, lembrete_data FROM propostas ORDER BY id')]);
// as chamadas que as telas fazem (o Almoxarifado e a Fabrica sem filtro; o Comercial com status=ativo; a lista de clientes com a busca; os
// projetos por cliente e por responsavel — Projetos.js)
const CHAMADAS_DAS_LISTAS = () => ['/clientes', '/clientes?status=ativo', `/clientes?search=${encodeURIComponent('CLIENTE 154')}`,
  '/projetos', `/projetos?cliente_id=${ctx.cliente}`, `/projetos?responsavel_id=${ctx.u.diretaComercial.id}`];
const lembretesDe = (x) => (Array.isArray(x) ? x.filter((n) => n.tipo === 'lembrete_proposta').map((n) => n.proposta_id).sort((a, b) => a - b) : x);

async function usuario(nome, { role = 'usuario', grupos = [], diretas = [], diretasCrus = [], diretasGrupo0 = [], adminModulos = null } = {}) {
  const email = `${nome}@e154.t`;
  const [s, u] = await j('POST', '/usuarios', ctx.T, { nome, email, senha: 'Senha!154c', cargo: 'C', role, setor: '' });
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
  const [s, l] = await j('POST', '/auth/login', null, { email: u.email, senha: 'Senha!154c' });
  assert.strictEqual(s, 200, `login ${u.nome}: ${JSON.stringify(l)}`);
  u.T = l.token;
}

// ── RN-154.01/02: a regua pelo fonte ──────────────────────────────────────────────────────
test('[RN-154.01/02, C353, C363] fonte: as 2 listas com o portao dos tres modulos e as notificacoes com o filtro como 2o middleware, a notificacao registrada uma vez e so no index.js; o mapa das notificacoes e os tipos das consultas, e o array final filtrado', () => {
  assert.deepStrictEqual([...LISTAS, ['GET', NOTIF]].map(achar).filter((r) => r.resto === '(nao registrada)').map((r) => r.rota), [], 'uma rota sumiu do fonte');
  assert.ok(/\nconst exigirLeitorDasListasDeClientesEProjetos = portaoDasPropostas\.exigir\(\['comercial', 'almoxarifado', 'operacional'\]\);\n/.test(FONTE),
    'RN-154.01: o portao das listas com os tres modulos');
  const sem = LISTAS.map(achar).filter((r) => r.resto !== 'authenticateToken, exigirLeitorDasListasDeClientesEProjetos, (req, res) => {').map((r) => `${r.rota}: ${r.resto}`);
  assert.deepStrictEqual(sem, [], 'RN-154.01: uma lista sem o portao (ou com outro middleware)');
  // a notificacao: um registro so (regua no texto inteiro, qualquer verbo, sem caixa), nada fora do index.js, nada nao literal
  const reTodos = /\.(get|post|put|patch|delete|all|use|route)\(\s*\[?\s*["'`](\/(?:api\/)?notificacoes(?:\/[^"'`]*)?)["'`]/gi;
  assert.deepStrictEqual([...FONTE.matchAll(reTodos)].map((m) => `${m[1].toUpperCase()} ${m[2]}`), [`GET ${NOTIF}`], 'um registro a mais das notificacoes escaparia do filtro');
  assert.deepStrictEqual(regua.registrosNaoLiterais([NOTIF]), regua.REGISTROS_NAO_LITERAIS_MEDIDOS, 'um registro com o caminho que nao e texto literal escaparia');
  const { fora, vistos } = regua.registrosForaDoIndex(/["'`]\/api\/notificacoes\b/i);
  assert.deepStrictEqual(fora, [], 'rota registrada fora do index.js escaparia desta regua');
  assert.ok(vistos.includes(path.join('routes', 'almoxarifado.js')) && vistos.includes(path.join('services', 'portaoDasPropostas.js')), 'a varredura nao enxerga routes/ ou services/');
  assert.ok(!/app\.use\(\s*\[?\s*["'`]\/(api\/)?notificacoes/i.test(FONTE), 'um app.use no prefixo atenderia antes do filtro');
  assert.ok(achar(['GET', NOTIF]).resto.startsWith('authenticateToken, filtrarNotificacoesPorModulo, '), `as notificacoes: ${achar(['GET', NOTIF]).resto.slice(0, 80)}`);
  assert.ok(/\nconst filtrarNotificacoesPorModulo = portaoDasPropostas\.filtrarPorModulo\(TIPOS_DAS_NOTIFICACOES, \{ contexto: 'portao:notificacoes' \}\);\n/.test(FONTE), 'o filtro com o mapa e o contexto');
  // Fase 2 I-1: os tipos das consultas do corpo = as chaves do mapa (com os valores); o array devolvido passa pelo filtro, objeto a objeto
  const i = FONTE.indexOf(`app.get('${NOTIF}'`);
  const corpo = FONTE.slice(i, FONTE.indexOf('// ========== ROTAS DE CHAT', i));
  assert.deepStrictEqual([...new Set([...corpo.matchAll(/'(\w+)' as tipo/g)].map((m) => m[1]))].sort(), TIPOS, 'os tipos das consultas');
  const mapa = /\nconst TIPOS_DAS_NOTIFICACOES = (\{[^}]*\});\n/.exec(FONTE);
  assert.ok(mapa, 'o mapa TIPOS_DAS_NOTIFICACOES');
  // eslint-disable-next-line no-new-func
  assert.deepStrictEqual(Function(`return ${mapa[1]}`)(), { lembrete_proposta: ['comercial'] }, 'o mapa das notificacoes');
  assert.ok(/res\.json\(todasNotificacoes\.filter\(\(n\) => podeVer\(n\.tipo\)\)\)/.test(corpo), 'o array devolvido sem o filtro por tipo');
  assert.strictEqual([...corpo.matchAll(/res\.json\(/g)].length, 2, 'outra resposta no corpo das notificacoes (so o [] antecipado e o array filtrado)');
});

// ── Fase 5 r3 A1: a premissa da regua (quem chama as listas e o sino, no client), presa ─────────
// O client inteiro lido como TEXTO (o molde do modulosClienteServidor): todo arquivo com o literal de /clientes, /projetos ou /notificacoes
// (aspas, crase, `?` ou `${` logo depois — a medicao da Fase 0) e o modulo da moldura de cada um. Um arquivo novo na lista = a regua dos
// tres modulos (B995) ou o filtro do sino (B996) tem de ser revisto ANTES de a tela nova ir para o ar (senao ela mostra a lista vazia calada).
const CLIENT_SRC = path.join(SERVER_DIR, '..', 'client', 'src');
const QUEM_CHAMA = {
  // o arquivo (relativo a client/src/components) -> [as rotas que ele cita, o modulo da moldura em que a tela e montada (App.js)]
  'Atividades.js': [['clientes'], 'comercial'], 'ClienteForm.js': [['clientes'], 'comercial'], 'Clientes.js': [['clientes'], 'comercial'],
  'CustosViagens.js': [['clientes'], 'comercial'], 'ProjetoForm.js': [['clientes', 'projetos'], 'comercial'], 'Projetos.js': [['projetos'], 'comercial'],
  'OSComercialForm.js': [['projetos'], 'comercial'], 'PropostaForm.js': [['clientes', 'projetos'], 'comercial (nao montado)'],
  'OportunidadeForm.js': [['clientes'], 'comercial (nao montado)'], 'proposta/GerarPropostaModal.js': [['clientes'], 'comercial (nao montado)'],
  'proposta/PropostaForm.js': [['clientes'], 'comercial'],
  'HelpGuide.js': [['clientes'], 'nenhum (o seletor de um passo da ajuda, [href="/clientes"] — nao chama a rota)'],
  'almoxarifado/MaterialAlmoxarifadoForm.js': [['clientes'], 'almoxarifado'], 'almoxarifado/ReservasAlmoxarifado.js': [['clientes', 'projetos'], 'almoxarifado'],
  'almoxarifado/MovimentacoesAlmoxarifado.js': [['projetos'], 'almoxarifado'], 'almoxarifado/SobrasAlmoxarifado.js': [['projetos'], 'almoxarifado'],
  'operacional/OSForm.js': [['clientes', 'projetos'], 'operacional'],
  'Notificacoes.js': [['notificacoes'], 'comercial (o sino, desenhado so no Dashboard)'],
};
test('[RN-154.01/02, B995, B996, Fase 5 r3 A1] o client: quem cita /clientes, /projetos e /notificacoes e a lista medida, cada um na moldura de um dos tres modulos; o sino so e desenhado no painel do Comercial', () => {
  const achados = {};
  const andar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { andar(p); continue; }
      if (!/\.(js|jsx|ts|tsx)$/.test(e.name) || /\.test\./.test(e.name)) continue;
      const src = fs.readFileSync(p, 'utf8');
      const rotas = [...new Set([...src.matchAll(/['"`]\/(?:api\/)?(clientes|projetos|notificacoes)(?:['"`?]|\$\{)/g)].map((m) => m[1]))].sort();
      if (rotas.length) achados[path.relative(path.join(CLIENT_SRC, 'components'), p).split(path.sep).join('/')] = rotas;
    }
  };
  andar(CLIENT_SRC);
  assert.ok(Object.keys(achados).length >= 10, 'a varredura do client nao achou nada (caminho errado?)');
  assert.deepStrictEqual(achados, Object.fromEntries(Object.entries(QUEM_CHAMA).map(([f, [r]]) => [f, r]).sort(([a], [b]) => (a < b ? -1 : 1))),
    'um arquivo novo (ou uma rota nova num arquivo) do client cita as listas ou o sino: confira o modulo da moldura dele e reveja a regua (B995/B996)');
  // as telas montadas que chamam as listas estao todas na moldura de um dos tres modulos
  const fora = Object.entries(QUEM_CHAMA).filter(([, [r, m]]) => !r.includes('notificacoes') && !/^nenhum|nao montado/.test(m) && !MODULOS_DAS_LISTAS.includes(m));
  assert.deepStrictEqual(fora, []);
  // o sino: so o Dashboard (o painel do indice de /comercial) o desenha; o Layout o importa e nao o desenha
  const desenham = [];
  const andar2 = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) andar2(p);
      else if (/\.js$/.test(e.name) && !/\.test\./.test(e.name) && /<Notificacoes[\s/>]/.test(fs.readFileSync(p, 'utf8'))) desenham.push(path.basename(p));
    }
  };
  andar2(CLIENT_SRC);
  assert.deepStrictEqual(desenham, ['Dashboard.js'], 'o sino passou a ser desenhado em outra tela: reveja o filtro das notificacoes (B996)');
});

// ── as camadas do Express de verdade (o prefixo das notificacoes; as listas, no teste da 151) ──
test('[RN-154.02, RN-153.04] as camadas do Express montado: so a das notificacoes atende o prefixo, com o login e o filtro (o mapa inteiro) antes de tudo; nenhum middleware so dela, nenhum app.param', () => {
  const cam = camadas.lerCamadas(pasta);
  assert.deepStrictEqual(camadas.conferirCamadas(cam, ROTAS_DAS_CAMADAS, { neutro: NEUTRO }), []);
  assert.ok(cam.despacho.length === AMOSTRAS_DAS_CAMADAS.length && cam.despacho.filter((d) => d.atendida).length >= 1, 'o despejo nao despachou as amostras');
});

// ── RN-154.01/02: pela rota ───────────────────────────────────────────────────────────────
test('[RN-154.01/02, C353, C363] quem nenhuma tela das listas admite (so Engenharia / Projetos, so Compras, so Financeiro) toma 403 nas 2 listas (com os filtros das telas; o corpo = o fixture do client, RN-156.02), e as notificacoes, com um lembrete de hoje numa proposta dele, voltam [] sem log; o vendedor recebe o lembrete dele', async () => {
  const antes = await retrato();
  const errados = [];
  // Etapa 156 (RN-156.02, C366): o corpo do 403 das duas listas = o fixture com que os testes das quatro telas do Almoxarifado montam a
  // recusa (a frase do aviso sai do `error` dele). Mudou o corpo aqui, o fixture (e a frase que a tela mostra) tem de mudar junto.
  const RECUSA_DO_CLIENT = JSON.parse(fs.readFileSync(path.join(CLIENT_SRC, 'components', 'almoxarifado', '__fixtures__', 'recusaDaListaDoServidor.json'), 'utf8'));
  for (const k of ['soEngProjetos', 'soCompras', 'soFinanceiro']) {
    const b = ctx.u[k];
    assert.deepStrictEqual(await negados(b.id), [], `${k} ja tinha log`);
    for (const c of CHAMADAS_DAS_LISTAS()) {
      const [s, x] = await j('GET', c, b.T);
      if (s !== 403 || JSON.stringify(x) !== JSON.stringify(NEGADO_LISTAS)) errados.push(`${k} ${c}: ${s} ${JSON.stringify(x).slice(0, 100)}`);
      try { assert.deepStrictEqual(x, RECUSA_DO_CLIENT); } catch (e) { errados.push(`${k} ${c}: o corpo do 403 nao e o fixture do client ${JSON.stringify(x).slice(0, 100)}`); }
    }
    const [sn, xn] = await j('GET', '/notificacoes', b.T);
    if (sn !== 200 || JSON.stringify(xn) !== '[]') errados.push(`${k} notificacoes: ${sn} ${JSON.stringify(xn).slice(0, 160)}`);
    await pausa(800);
    const log = await negados(b.id);
    if (JSON.stringify(log) !== JSON.stringify(LOG_LISTAS(CHAMADAS_DAS_LISTAS().length))) errados.push(`${k} log: ${JSON.stringify(log)}`);
    // o lembrete dele existe no banco (a metade que prova que o [] escondeu alguma coisa)
    const tem = await all("SELECT id FROM propostas WHERE id = ? AND responsavel_id = ? AND DATE(lembrete_data) = DATE('now')", [ctx.lembrete[k], b.id]);
    if (tem.length !== 1) errados.push(`${k}: o preparo nao tem o lembrete dele`);
  }
  assert.deepStrictEqual(errados, []);
  assert.strictEqual(await retrato(), antes, 'uma leitura barrada mudou o banco');
  // a metade positiva: o vendedor ve o lembrete dele (e so o dele), com o corpo de antes
  const v = ctx.u.diretaComercial;
  const [sv, xv] = await j('GET', '/notificacoes', v.T);
  assert.deepStrictEqual([sv, lembretesDe(xv)], [200, [ctx.lembrete.diretaComercial]], `o vendedor: ${JSON.stringify(xv).slice(0, 200)}`);
  assert.deepStrictEqual(Object.keys(xv[0]).sort(), ['cliente_nome', 'data', 'id', 'mensagem', 'numero_proposta', 'prioridade', 'proposta_id', 'tipo', 'titulo'], 'o corpo do lembrete mudou');
  assert.deepStrictEqual([xv[0].titulo, xv[0].prioridade, xv[0].cliente_nome], [`Lembrete: E154-${v.nome}`, 'hoje', 'CLIENTE 154'], JSON.stringify(xv[0]));
  await pausa(300);
  assert.deepStrictEqual(await negados(v.id), [], 'o vendedor tomou acesso negado');
  // Fase 5 r3 A3: o recorte do usuario tem duas metades — a proposta que outro criou e atribuiu a ele, e a que ele criou e atribuiu a outro
  const adminId = (await all('SELECT id FROM usuarios WHERE email = ?', [SEED.email]))[0].id;
  const ins = (resp, criador, num) => run("INSERT INTO propostas (cliente_id, numero_proposta, titulo, status, valor_total, responsavel_id, created_by, created_at, lembrete_data, lembrete_mensagem) VALUES (?, ?, 'cruzada 154', 'rascunho', 1, ?, ?, datetime('now'), DATE('now'), 'cruzada')", [ctx.cliente, num, resp, criador]);
  const atribuida = (await ins(v.id, adminId, 'E154-ATRIB')).lastID;
  const criada = (await ins(adminId, v.id, 'E154-CRIADA')).lastID;
  try {
    const [s2, x2] = await j('GET', '/notificacoes', v.T);
    assert.deepStrictEqual([s2, lembretesDe(x2)], [200, [ctx.lembrete.diretaComercial, atribuida, criada].sort((a, b) => a - b)], 'o recorte por responsavel ou criador');
  } finally {
    await run('DELETE FROM propostas WHERE id IN (?, ?)', [atribuida, criada]);
  }
});

// ── as metades positivas, em fluxo, pela rota (o gesto de cada tela, um depois do outro) ─────
test('[RN-154.01, integracao com a 149 e a 151] o Almoxarifado escolhe o cliente na lista e grava o material com ele (e le os projetos das reservas, movimentacoes e sobras); a Fabrica escolhe cliente e projeto nas listas, a OS nasce e e editada com eles', async () => {
  const a = ctx.u.almoxAdmin;
  const [sc, cl] = await j('GET', '/clientes', a.T);
  const escolhido = Array.isArray(cl) && cl.find((c) => c.id === ctx.cliente);
  assert.ok(sc === 200 && escolhido, `o Almoxarifado nao leu os clientes: ${sc} ${JSON.stringify(cl).slice(0, 120)}`);
  const [sm, mat] = await j('POST', '/almoxarifado/materiais', a.T, { codigo: 'E154-MAT', nome: 'material do cliente 154', familia_id: ctx.familia, unidade: 'PC', proprietario_cliente_id: escolhido.id });
  assert.strictEqual(sm, 201, `o material com o dono escolhido: ${JSON.stringify(mat)}`);
  assert.strictEqual((await all('SELECT proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?', [mat.id]))[0].proprietario_cliente_id, ctx.cliente, 'o material nao gravou o dono');
  for (const k of ['almoxAdmin', 'soAlmox', 'grupoAlmox']) {
    const [sp, pj] = await j('GET', '/projetos', ctx.u[k].T);
    assert.ok(sp === 200 && pj.some((p) => p.id === ctx.projeto && p.cliente_nome === 'CLIENTE 154'), `${k} projetos: ${sp}`);
    const [sl] = await j('GET', '/clientes', ctx.u[k].T);
    assert.strictEqual(sl, 200, `${k} clientes`);
  }
  // a Fabrica (o OSForm do OrdensServico): as duas listas, e a OS com o cliente e o projeto escolhidos nelas
  const op = ctx.u.soOperacional;
  const [lc, lp] = [await j('GET', '/clientes', op.T), await j('GET', '/projetos', op.T)];
  assert.deepStrictEqual([lc[0], lp[0]], [200, 200], 'a Fabrica nao leu as listas');
  const cli = lc[1].find((c) => c.id === ctx.cliente);
  const pro = lp[1].find((p) => p.cliente_id === cli.id);
  // a OS nasce pelo administrador: o POST da OS responde 500 a quem nao e administrador num banco novo (C277, de antes — a 151 mediu)
  const [so, os1] = await j('POST', '/operacional/ordens-servico', ctx.T, { numero_os: 'OS-154', tipo_os: 'FABRICACAO', data_abertura: '2026-10-19', status: 'pendente', cliente_id: cli.id, projeto_id: pro.id });
  assert.strictEqual(so, 200, JSON.stringify(os1));
  const [su, xu] = await j('PUT', `/operacional/ordens-servico/${os1.id}`, op.T, { numero_os: 'OS-154', tipo_os: 'FABRICACAO', data_abertura: '2026-10-19', status: 'em_andamento', cliente_id: cli.id, projeto_id: pro.id });
  assert.strictEqual(su, 200, JSON.stringify(xu));
  const [sg, lida] = await j('GET', `/operacional/ordens-servico/${os1.id}`, op.T);
  assert.deepStrictEqual([sg, lida.cliente_id, lida.projeto_id], [200, ctx.cliente, ctx.projeto]);
  await pausa(300);
  for (const k of ['almoxAdmin', 'soAlmox', 'grupoAlmox', 'soOperacional']) assert.deepStrictEqual(await negados(ctx.u[k].id), [], `${k} tomou acesso negado`);
});

// Etapa 155 (RN-155.01, C367, C368): o corpo REAL das duas listas que a tela das Reservas desenha. O teste do client monta os seletores com
// os fixtures client/src/components/almoxarifado/__fixtures__/*.json; aqui, as chaves deles = as de uma linha do servidor montado (a tela lia
// `c.nome` e `o.numero`, que o servidor nao manda). Depois do cenario acima: a OS-154 ja existe (a rota do aux engole erro em [] — I-6).
test('[RN-155.01, C367, C368, integracao com o client] o Almoxarifado le os clientes e as OS do aux com as chaves dos fixtures do teste das Reservas: razao_social e nome_fantasia, sem nome; numero_os e cliente_nome, sem numero', async () => {
  const fixture = (nome) => JSON.parse(fs.readFileSync(path.join(CLIENT_SRC, 'components', 'almoxarifado', '__fixtures__', nome), 'utf8'));
  const a = ctx.u.almoxAdmin;
  const [sc, cl] = await j('GET', '/clientes', a.T);
  const cliente = Array.isArray(cl) && cl.find((c) => c.id === ctx.cliente);
  assert.ok(sc === 200 && cliente && cliente.razao_social === 'CLIENTE 154', `a lista de clientes sem o do preparo: ${sc} ${JSON.stringify(cl).slice(0, 160)}`);
  assert.deepStrictEqual(Object.keys(cliente).sort(), Object.keys(fixture('clienteDoServidor.json')).sort(), 'o fixture do cliente nao e o corpo do servidor');
  assert.ok(!('nome' in cliente), 'o cliente ganhou um campo nome: reveja o rotulo das Reservas');
  const [so, oss] = await j('GET', '/almoxarifado/aux/ordens-servico', a.T);
  const os154 = Array.isArray(oss) && oss.find((o) => o.numero_os === 'OS-154');
  assert.ok(so === 200 && os154 && os154.cliente_nome === 'CLIENTE 154', `o aux sem a OS-154: ${so} ${JSON.stringify(oss).slice(0, 160)}`);
  assert.deepStrictEqual(Object.keys(os154).sort(), Object.keys(fixture('osDoAuxDoServidor.json')).sort(), 'o fixture da OS nao e o corpo do aux');
});

test('[RN-154.02, integracao com a 145 e a 149] o vendedor recebe o lembrete e segue o clique ate as leituras da tela da proposta (a proposta, a lista de clientes ativos, as oportunidades, as familias) — e o barrado nao recebe lembrete cuja tela o barraria', async () => {
  const v = ctx.u.diretaComercial;
  const [sn, xn] = await j('GET', '/notificacoes', v.T);
  assert.strictEqual(sn, 200);
  const id = lembretesDe(xn)[0];
  assert.strictEqual(id, ctx.lembrete.diretaComercial);
  const [s1, p] = await j('GET', `/propostas/${id}`, v.T);
  const [s2, cl] = await j('GET', '/clientes?status=ativo', v.T);
  const [s3] = await j('GET', '/oportunidades', v.T);
  const [s4] = await j('GET', '/familias', v.T);
  assert.deepStrictEqual([s1, p && p.id, s2, cl.some((c) => c.id === ctx.cliente), s3, s4], [200, id, 200, true, 200, 200], 'a tela da proposta que o clique abre');
  // o barrado: a proposta do lembrete dele ele nao abriria (a tela da proposta exige o Comercial ou o Operacional) — e o sino nao a mostra
  const b = ctx.u.soEngProjetos;
  const [sb] = await j('GET', `/propostas/${ctx.lembrete.soEngProjetos}`, b.T);
  const [sbn, xbn] = await j('GET', '/notificacoes', b.T);
  assert.deepStrictEqual([sb, sbn, xbn], [403, 200, []]);
});

// ── por usuario, decide como a tela ───────────────────────────────────────────────────────
test('[RN-154.01/02] por usuario: as 2 listas decidem como a tela de algum dos tres modulos; os lembretes, como a tela do Comercial', async () => {
  const listas = {
    semNada: 200, diretaComercial: 200, grupoComercial: 200, grupoVazio: 200, superU: 200, roleAdmin: 200,
    comercialGrupoInativo: 200, comercialPermissao0: 403, comercialGrupo0: 200, soAlmox: 200, soOperacional: 200, soEngProjetos: 403,
    adminComercialComAdministrativo: 403, grupoAlmox: 200, soCompras: 403, soFinanceiro: 403, soFrota: 403, soEngenharia: 403, almoxAdmin: 200,
  };
  const lembrete = {
    semNada: 1, diretaComercial: 1, grupoComercial: 1, grupoVazio: 1, superU: 1, roleAdmin: 1, comercialGrupoInativo: 0, comercialPermissao0: 0,
    comercialGrupo0: 0, soAlmox: 0, soOperacional: 0, soEngProjetos: 0, adminComercialComAdministrativo: 0, grupoAlmox: 0, soCompras: 0,
    soFinanceiro: 0, soFrota: 0, soEngenharia: 0, almoxAdmin: 0,
  };
  const linhas = [];
  for (const k of Object.keys(listas)) {
    const u = ctx.u[k];
    const [sg, g] = await j('GET', `/usuarios/${u.id}/grupos`, ctx.T);
    assert.strictEqual(sg, 200, JSON.stringify(g));
    const quem = { id: u.id, role: u.role, is_superadmin: u.superadmin ? 1 : 0, admin_modulos: u.adminModulos ? JSON.stringify(u.adminModulos) : '[]' };
    const tela = temModuloComoATela(quem, g.permissoes, MODULOS_DAS_LISTAS) ? 200 : 403;
    const telaCom = temModuloComoATela(quem, g.permissoes, ['comercial']) ? 1 : 0;
    const [s1] = await j('GET', '/clientes', u.T);
    const [s2] = await j('GET', '/projetos', u.T);
    const [sn, xn] = await j('GET', '/notificacoes', u.T);
    const viu = sn === 200 && JSON.stringify(lembretesDe(xn)) === JSON.stringify([ctx.lembrete[k]]) ? 1 : sn === 200 && xn.length === 0 ? 0 : `?${sn}`;
    linhas.push([k, s1, s2, tela, viu, telaCom]);
  }
  assert.deepStrictEqual(linhas, Object.keys(listas).map((k) => [k, listas[k], listas[k], listas[k], lembrete[k], lembrete[k]]));
});

// ── RN-154.04 e o BUSY: reboots ───────────────────────────────────────────────────────────
test('[RN-154.04] PROPOSTAS_PORTAO_DE_MODULO=desligado: as 2 listas abrem ao barrado com o conteudo e os lembretes dele aparecem (o aviso do boot as cita); ligado de novo, barra', async () => {
  const b = ctx.u.soEngProjetos;
  assert.ok(!/PROPOSTAS_PORTAO_DE_MODULO=desligado/.test(fs.readFileSync(logArq, 'utf8')), 'o aviso do desligado saiu com o portao ligado');
  await descer();
  ctx.T = await subir({ PROPOSTAS_PORTAO_DE_MODULO: 'desligado' });
  try {
    await logar(b);
    await logar(ctx.u.soCompras);
    const aviso = (fs.readFileSync(logArq, 'utf8').match(/⚠️ PROPOSTAS_PORTAO_DE_MODULO=desligado[^\n]*/) || [''])[0];
    assert.ok(/as dos custos de viagem NAO exigem o Comercial \(só o login\), e as listas de clientes e de projetos NAO exigem o Comercial, o Almoxarifado ou o Operacional \(só o login\), e as notificações do sino mostram os lembretes das propostas a qualquer logado, e as dos painéis/.test(aviso)
      && /e a busca global mostra todos os tipos de resultado a qualquer logado; a lista de ordens de serviço do Operacional volta à régua antiga do módulo/.test(aviso),
    `o aviso do boot nao cita as listas e as notificacoes: ${aviso.slice(0, 900)}`);
    const errados = [];
    for (const k of ['soEngProjetos', 'soCompras']) {
      const u = ctx.u[k];
      const [s1, c] = await j('GET', '/clientes?status=ativo', u.T);
      const [s2, p] = await j('GET', `/projetos?cliente_id=${ctx.cliente}`, u.T);
      const [s3, n] = await j('GET', '/notificacoes', u.T);
      if (!(s1 === 200 && c.some((x) => x.id === ctx.cliente) && s2 === 200 && p.some((x) => x.id === ctx.projeto) && s3 === 200
        && JSON.stringify(lembretesDe(n)) === JSON.stringify([ctx.lembrete[k]]))) errados.push(`${k}: ${s1} ${s2} ${s3} ${JSON.stringify(n).slice(0, 120)}`);
    }
    assert.deepStrictEqual(errados, []);
  } finally {
    await descer();
    ctx.T = await subir();
  }
  await logar(b);
  const [s1, x1] = await j('GET', '/clientes', b.T);
  const [s2, x2] = await j('GET', '/projetos', b.T);
  const [s3, x3] = await j('GET', '/notificacoes', b.T);
  assert.deepStrictEqual([s1, x1, s2, x2, s3, x3], [403, NEGADO_LISTAS, 403, NEGADO_LISTAS, 200, []], 'ligado de novo');
});

test('[RN-154.01/02] SQLITE_BUSY ao ler as permissoes: 503 nas listas (portao:propostas) e nas notificacoes (portao:notificacoes); outro erro: 500; o administrador e o super nem leem', async () => {
  const b = ctx.u.soOperacional;
  const FALHA = 'p\\.modulo, p\\.permissao FROM grupos_permissoes';
  const antes = await retrato();
  await descer();
  ctx.T = await subir({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'all', FALHA_SQL_MSG: 'SQLITE_BUSY: database is locked' });
  try {
    await logar(b);
    const corpo503 = (context) => ({ error: 'Banco temporariamente ocupado. Tente novamente em alguns segundos.', code: 'SQLITE_BUSY', retryAfter: 3, context });
    const [s1, x1] = await j('GET', '/clientes', b.T);
    const [s2, x2] = await j('GET', '/projetos', b.T);
    const [s3, x3] = await j('GET', '/notificacoes', b.T);
    assert.deepStrictEqual([s1, x1, s2, x2, s3, x3], [503, corpo503('portao:propostas'), 503, corpo503('portao:propostas'), 503, corpo503('portao:notificacoes')]);
    for (const u of [null, ctx.u.superU]) {
      if (u) await logar(u);
      const T = u ? u.T : ctx.T;
      const [a1, y1] = await j('GET', '/clientes', T);
      const [a2] = await j('GET', '/projetos', T);
      const [a3, y3] = await j('GET', '/notificacoes', T);
      const esperado = u ? [ctx.lembrete.superU] : [];
      assert.deepStrictEqual([a1, Array.isArray(y1) && y1.some((c) => c.id === ctx.cliente), a2, a3, lembretesDe(y3)], [200, true, 200, 200, esperado], `${u ? 'o super' : 'o administrador'} passa sem ler as linhas`);
    }
    await descer();
    ctx.T = await subir({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'all' });
    await logar(b);
    const E500 = { error: 'Erro ao verificar permissões' };
    const [s4, x4] = await j('GET', '/clientes', b.T);
    const [s5, x5] = await j('GET', '/notificacoes', b.T);
    assert.deepStrictEqual([s4, x4, s5, x5], [500, E500, 500, E500]);
    assert.ok(/\[falha injetada\]\s+SELECT p\.modulo, p\.permissao FROM grupos_permissoes/.test(fs.readFileSync(logArq, 'utf8')),
      'a falha injetada nao casou com a leitura do portao (o teste nao provou nada)');
  } finally {
    await descer();
    ctx.T = await subir();
  }
  assert.strictEqual(await retrato(), antes, 'com o portao em erro, o banco mudou');
});

(async () => {
  console.log('\n=== Etapa 154: as listas de clientes e de projetos pelos modulos que as leem, e as notificacoes pelo Comercial (C353, C363) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e154-ln-'));
    ctx.T = await subir();
    abrirCru();
    const [sc, c] = await j('POST', '/clientes', ctx.T, { razao_social: 'Cliente 154', cnpj: '11.222.333/0001-54', email: 'c154@c.com', status: 'ativo' });
    assert.strictEqual(sc, 200, JSON.stringify(c));
    ctx.cliente = c.id;
    const [sp, p] = await j('POST', '/projetos', ctx.T, { nome: 'Projeto 154', cliente_id: ctx.cliente, status: 'ativo' });
    assert.strictEqual(sp, 200, JSON.stringify(p));
    ctx.projeto = p.id;
    const [sf, f] = await j('POST', '/almoxarifado/familias', ctx.T, { nome: 'Familia 154', codigo: 'F154' });
    assert.strictEqual(sf, 201, JSON.stringify(f));
    ctx.familia = f.id;
    await run("INSERT INTO grupos_permissoes (id, nome, ativo) VALUES (901,'G-com',1),(903,'G-vazio',1),(905,'G-com-inat',0),(906,'G-almox',1)");
    await run("INSERT INTO permissoes (grupo_id, modulo, acao, permissao) VALUES (901,'comercial','acesso',1),(905,'comercial','acesso',1),(906,'almoxarifado','acesso',1)");
    ctx.u = {
      semNada: await usuario('semnada'),
      diretaComercial: await usuario('dcom', { diretas: ['comercial'] }),
      grupoComercial: await usuario('gcom', { grupos: [901] }),
      grupoVazio: await usuario('gvazio', { grupos: [903] }),
      superU: await usuario('super', { diretas: ['engenharia_projetos'] }),
      roleAdmin: await usuario('radm', { role: 'admin', diretas: ['engenharia_projetos'] }),
      comercialGrupoInativo: await usuario('gcomi', { grupos: [905], diretas: ['almoxarifado'] }),
      comercialPermissao0: await usuario('cp0', { diretasCrus: [['comercial', 'acesso', 0]] }),
      comercialGrupo0: await usuario('cg0', { diretasGrupo0: ['comercial'], diretas: ['almoxarifado'] }),
      soAlmox: await usuario('salm', { diretas: ['almoxarifado'] }),
      soOperacional: await usuario('sop', { diretas: ['operacional'] }),
      soEngProjetos: await usuario('sengp', { diretas: ['engenharia_projetos'] }),
      adminComercialComAdministrativo: await usuario('acadm', { diretas: ['administrativo'], adminModulos: ['comercial'] }),
      grupoAlmox: await usuario('galm', { grupos: [906] }),
      soCompras: await usuario('scomp', { diretas: ['compras'] }),
      soFinanceiro: await usuario('sfin', { diretas: ['financeiro'] }),
      soFrota: await usuario('sfrota', { diretas: ['frota'] }),
      soEngenharia: await usuario('seng', { diretas: ['engenharia'] }),
      almoxAdmin: await usuario('aalm', { diretas: ['almoxarifado'], adminModulos: ['almoxarifado'] }),
    };
    await run('UPDATE usuarios SET is_superadmin = 1 WHERE id = ?', [ctx.u.superU.id]);
    ctx.u.superU.superadmin = true;
    assert.strictEqual((await all('SELECT is_superadmin FROM usuarios WHERE id = ?', [ctx.u.roleAdmin.id]))[0].is_superadmin, 0, 'o role admin do cenario nao pode ser super');
    // cada um com uma proposta dele com lembrete para hoje (por fora: o formulario da proposta nao e o assunto)
    for (const [k, u] of Object.entries(ctx.u)) {
      const r = await run("INSERT INTO propostas (cliente_id, numero_proposta, titulo, status, valor_total, responsavel_id, created_by, created_at, lembrete_data, lembrete_mensagem) VALUES (?, ?, ?, 'rascunho', 1540, ?, ?, datetime('now'), DATE('now'), ?)",
        [ctx.cliente, `E154-${u.nome}`, `Proposta 154 de ${u.nome}`, u.id, u.id, `ligar para o cliente (${u.nome})`]);
      ctx.lembrete[k] = r.lastID;
    }
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
