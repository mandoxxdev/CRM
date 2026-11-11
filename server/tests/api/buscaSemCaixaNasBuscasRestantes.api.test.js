/**
 * Etapa 210 (RN-210.05) — as buscas que ainda usavam `LIKE` cru passam pela regua sem caixa da 159 (`condicaoDeBusca`).
 *
 * Os formularios passam a gravar o texto livre em MAIUSCULAS com acento ("SÃO JOÃO") e o legado fica em minusculas ("são josé"). O
 * `LIKE` do SQLite so ignora a caixa da letra sem acento (`'SÃO' LIKE '%são%'` = 0) e o `LOWER` dele nao baixa a letra acentuada. Cada
 * cenario grava os dois (pelo banco, por fora) e um controle, e pede pela rota do `index.js` de verdade (pasta vazia):
 *   "são" acha o "SÃO JOÃO" novo; "SÃO" acha o "são josé" legado; nenhum dos dois acha o controle; sem termo, a lista inteira.
 *
 * Rotas: /api/financeiro/bancos e /api/compras/solicitacoes-compra (index.js; a segunda era LOWER LIKE), /api/compras/fornecedores e
 * /api/compras/materiais (compras.js e pedidoCompraService), /api/frotas/motoristas (frotasService.buildSearchWhere),
 * /api/usuarios/filtrar (leituraDeUsuarios), /api/todolist/board (todolistService, LOWER LIKE), /api/chat/usuarios (chatService).
 *
 * Plano: docs/superpowers/plans/2026-11-11-almoxarifado-etapa210-formularios-em-maiusculo.md
 * Executar: cd server && node tests/api/buscaSemCaixaNasBuscasRestantes.api.test.js
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
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; corpo = JSON.stringify(body); }
  const r = await fetch(`http://127.0.0.1:${porta}${u}`, { method: m, headers, body: corpo, signal: AbortSignal.timeout(ms) });
  const buf = Buffer.from(await r.arrayBuffer());
  let x = buf.toString('utf8'); try { x = JSON.parse(x); } catch (e) { /* sem JSON */ }
  return [r.status, x];
}
const ctx = {};
const j = (m, u, body) => cru(m, `/api${u}`, ctx.T, body);
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e210seed@t.com', senha: 'E210seed!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir() {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET', 'API_URL', 'NOMINATIM_URL',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'FALHA_SQL_MSG', 'FALHA_SQL_METODOS', 'FALHA_SQL_PULAR', 'FALHA_SQL_MSGS',
    'PROPOSTAS_PORTAO_DE_MODULO', 'RATE_LIMIT_WINDOW_MS']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha,
    RATE_LIMIT_MAX: '100000', NOMINATIM_URL: 'http://127.0.0.1:9/search' });
  const out = fs.openSync(logArq, 'a');
  saiu = null;
  const preload = ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js')];
  filho = spawn(process.execPath, [...preload, 'index.js'], { cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true });
  filho.on('exit', (code) => { saiu = code; });
  const fim = Date.now() + 60000;
  while (Date.now() < fim) {
    if (saiu !== null) throw new Error(`o index.js saiu cedo (codigo ${saiu})`);
    try {
      const [s, x] = await cru('POST', '/api/auth/login', null, SEED);
      if (s === 200 && x && x.token) {
        const ate = Date.now() + 30000;
        while (Date.now() < ate && !/Banco de dados totalmente inicializado/.test(fs.readFileSync(logArq, 'utf8'))) await pausa(200);
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
const get = (sql, p = []) => new Promise((res, rej) => banco.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const qs = (o) => new URLSearchParams(o).toString();

/**
 * O cenario de cada busca: `novo` = "SÃO JOÃO <tag>" (o que o formulario grava agora), `legado` = "são josé <tag>" (o antigo, em
 * minusculas), `controle` = sem "são". `listar(termo)` devolve os ids que a rota respondeu ('' = sem termo).
 */
async function cenario(nome, { novo, legado, controle }, listar) {
  const comMin = await listar('são');
  assert.ok(comMin.includes(novo), `${nome}: "são" nao achou o novo "SÃO JOÃO" (ids ${JSON.stringify(comMin)})`);
  assert.ok(comMin.includes(legado), `${nome}: "são" nao achou o legado "são josé" (ids ${JSON.stringify(comMin)})`);
  assert.ok(!comMin.includes(controle), `${nome}: "são" achou o controle`);
  const comMai = await listar('SÃO');
  assert.ok(comMai.includes(legado), `${nome}: "SÃO" nao achou o legado "são josé" (ids ${JSON.stringify(comMai)})`);
  assert.ok(comMai.includes(novo), `${nome}: "SÃO" nao achou o novo "SÃO JOÃO" (ids ${JSON.stringify(comMai)})`);
  assert.ok(!comMai.includes(controle), `${nome}: "SÃO" achou o controle`);
  // a forma "como veio" continua: a grafia exata do legado ainda acha
  assert.ok((await listar('josé')).includes(legado), `${nome}: "josé" nao achou o legado`);
  const tudo = await listar('');
  for (const id of [novo, legado, controle]) assert.ok(tudo.includes(id), `${nome}: sem termo nao listou o id ${id}`);
}
const idsDe = (lista, onde) => {
  assert.ok(Array.isArray(lista), `${onde}: a resposta nao e lista: ${JSON.stringify(lista).slice(0, 300)}`);
  return lista.map((x) => x.id);
};
async function pedir(url, onde) {
  const [s, x] = await j('GET', url);
  assert.strictEqual(s, 200, `${onde}: ${s} ${JSON.stringify(x).slice(0, 300)}`);
  return x;
}

// ── index.js ──────────────────────────────────────────────────────────────────────────────
test('[RN-210.05] GET /financeiro/bancos?search (index.js): "são" acha "SÃO JOÃO", "SÃO" acha o legado "são josé"', async () => {
  const novo = (await run('INSERT INTO bancos (nome, banco) VALUES (?, ?)', ['SÃO JOÃO CAIXA 210', 'BANCO X'])).lastID;
  const legado = (await run('INSERT INTO bancos (nome, banco) VALUES (?, ?)', ['conta são josé 210', 'banco y'])).lastID;
  const controle = (await run('INSERT INTO bancos (nome, banco) VALUES (?, ?)', ['outra conta 210', 'banco z'])).lastID;
  await cenario('bancos', { novo, legado, controle }, async (t) => idsDe(await pedir(`/financeiro/bancos?${qs(t ? { search: t } : {})}`, 'bancos'), 'bancos'));
});

test('[RN-210.05] GET /compras/solicitacoes-compra?q (index.js, era LOWER LIKE): o titulo novo e a observacao legada nas duas caixas', async () => {
  const uid = (await get('SELECT id FROM usuarios WHERE email = ?', [SEED.email])).id;
  const ins = (titulo, obs) => run('INSERT INTO solicitacoes_compra (solicitante_usuario_id, setor, titulo, observacoes) VALUES (?, ?, ?, ?)',
    [uid, 'TI', titulo, obs]);
  const novo = (await ins('SÃO JOÃO PARAFUSOS 210', null)).lastID;
  const legado = (await ins('pedido antigo 210', 'entregar em são josé')).lastID;
  const controle = (await ins('outro pedido 210', 'nada')).lastID;
  await cenario('solicitacoes-compra', { novo, legado, controle }, async (t) => {
    const x = await pedir(`/compras/solicitacoes-compra?${qs(t ? { q: t } : {})}`, 'solicitacoes-compra');
    return idsDe(x && x.solicitacoes, 'solicitacoes-compra');
  });
});

test('[RN-210.05] GET /variaveis-tecnicas?search (index.js): nome novo e chave legada nas duas caixas', async () => {
  const ins = (nome, chave) => run('INSERT INTO variaveis_tecnicas (nome, chave, categoria, ativo) VALUES (?, ?, ?, 1)', [nome, chave, 'E210']);
  const novo = (await ins('SÃO JOÃO DIÂMETRO 210', 'e210_diametro')).lastID;
  const legado = (await ins('pressão 210', 'e210_são_josé')).lastID;
  const controle = (await ins('vazão 210', 'e210_vazao')).lastID;
  await cenario('variaveis-tecnicas', { novo, legado, controle }, async (t) => idsDe(await pedir(`/variaveis-tecnicas?${qs({ categoria: 'E210', ...(t ? { search: t } : {}) })}`, 'variaveis-tecnicas'), 'variaveis-tecnicas'));
});

// ── compras ───────────────────────────────────────────────────────────────────────────────
// A rota viva da lista e a de `routes/compras/fornecedores.js` (registrada antes; ja usava a regua desde a 192). A copia em
// `routes/compras.js` e sombreada e foi convertida so por consistencia: este cenario e a guarda da rota viva, nao prova da conversao.
test('[RN-210.05] GET /compras/fornecedores?search (a rota viva, routes/compras/fornecedores.js): razao social nova e nome fantasia legado nas duas caixas', async () => {
  const novo = (await run('INSERT INTO fornecedores (razao_social) VALUES (?)', ['SÃO JOÃO AÇOS 210'])).lastID;
  const legado = (await run('INSERT INTO fornecedores (razao_social, nome_fantasia) VALUES (?, ?)', ['ferragens 210', 'loja são josé'])).lastID;
  const controle = (await run('INSERT INTO fornecedores (razao_social) VALUES (?)', ['metais 210'])).lastID;
  await cenario('fornecedores', { novo, legado, controle }, async (t) => idsDe(await pedir(`/compras/fornecedores?${qs(t ? { search: t } : {})}`, 'fornecedores'), 'fornecedores'));
});

test('[RN-210.05] GET /compras/materiais?search (pedidoCompraService.buscarMateriais): nome novo e descricao legada nas duas caixas', async () => {
  await pedir('/almoxarifado/materiais', 'materiais (cria o esquema)').catch(() => {});
  const ins = (codigo, nome, desc) => run('INSERT INTO materiais_almoxarifado (codigo, nome, descricao, ativo) VALUES (?, ?, ?, 1)', [codigo, nome, desc]);
  const novo = (await ins('A210-1', 'SÃO JOÃO CHAPA 210', null)).lastID;
  const legado = (await ins('A210-2', 'chapa antiga 210', 'de são josé')).lastID;
  const controle = (await ins('A210-3', 'chapa comum 210', null)).lastID;
  // sem termo, os 50 primeiros por codigo: a pasta vazia nao tem 50 materiais
  await cenario('compras/materiais', { novo, legado, controle }, async (t) => idsDe(await pedir(`/compras/materiais?${qs(t ? { search: t } : {})}`, 'compras/materiais'), 'compras/materiais'));
});

// ── frotas ────────────────────────────────────────────────────────────────────────────────
test('[RN-210.05] GET /frotas/motoristas?search (frotasService.buildSearchWhere): nome novo e setor legado nas duas caixas', async () => {
  await pedir('/frotas/motoristas', 'frotas (cria o esquema)');
  const ins = (nome, setor) => run('INSERT INTO frotas_motoristas (nome, setor, ativo) VALUES (?, ?, 1)', [nome, setor]);
  const novo = (await ins('SÃO JOÃO MOTORISTA 210', 'LOGÍSTICA')).lastID;
  const legado = (await ins('motorista antigo 210', 'filial são josé')).lastID;
  const controle = (await ins('motorista comum 210', 'obra')).lastID;
  await cenario('frotas/motoristas', { novo, legado, controle }, async (t) => idsDe(await pedir(`/frotas/motoristas?${qs(t ? { search: t } : {})}`, 'frotas/motoristas'), 'frotas/motoristas'));
});

// ── usuarios ──────────────────────────────────────────────────────────────────────────────
let usuarios = null;
async function osUsuarios() {
  if (usuarios) return usuarios;
  const ins = (nome, email, cargo) => run(`INSERT INTO usuarios (nome, email, senha, cargo, role, ativo, is_oculto, flag_ti) VALUES (?, ?, 'x', ?, 'usuario', 1, 0, 1)`,
    [nome, email, cargo]);
  usuarios = {
    novo: (await ins('SÃO JOÃO DA SILVA', 'u210a@t.com', 'TÉCNICO')).lastID,
    legado: (await ins('maria 210', 'u210b@t.com', 'gerente de são josé')).lastID,
    controle: (await ins('pedro 210', 'u210c@t.com', 'operador')).lastID,
  };
  return usuarios;
}

test('[RN-210.05] GET /usuarios/filtrar?q (leituraDeUsuarios): nome novo e cargo legado nas duas caixas', async () => {
  const u = await osUsuarios();
  await cenario('usuarios/filtrar', u, async (t) => {
    const x = await pedir(`/usuarios/filtrar?${qs({ flag: 'ti', limit: 200, ...(t ? { q: t } : {}) })}`, 'usuarios/filtrar');
    return idsDe(x && x.items, 'usuarios/filtrar');
  });
});

test('[RN-210.05] GET /chat/usuarios?search (chatService): o nome novo e achado por "são"; o legado so por nome/email (cargo fora da busca)', async () => {
  const u = await osUsuarios();
  const listar = async (t) => {
    const x = await pedir(`/chat/usuarios?${qs(t ? { search: t } : {})}`, 'chat/usuarios');
    return idsDe(x && x.usuarios, 'chat/usuarios');
  };
  const legadoNoNome = (await run(`INSERT INTO usuarios (nome, email, senha, role, ativo) VALUES ('joão de são josé', 'u210d@t.com', 'x', 'usuario', 1)`)).lastID;
  await cenario('chat/usuarios', { novo: u.novo, legado: legadoNoNome, controle: u.controle }, listar);
});

// ── todolist ──────────────────────────────────────────────────────────────────────────────
test('[RN-210.05] GET /todolist/board?busca (todolistService, era LOWER LIKE): o titulo novo e a descricao legada nas duas caixas', async () => {
  await pedir('/todolist/board', 'todolist (cria o esquema)');
  const ins = (titulo, desc) => run('INSERT INTO todolist_tarefas (titulo, descricao) VALUES (?, ?)', [titulo, desc]);
  const novo = (await ins('SÃO JOÃO: REVISAR 210', null)).lastID;
  const legado = (await ins('tarefa antiga 210', 'ligar para são josé')).lastID;
  const controle = (await ins('tarefa comum 210', 'nada')).lastID;
  await cenario('todolist/board', { novo, legado, controle }, async (t) => {
    const x = await pedir(`/todolist/board?${qs(t ? { busca: t } : {})}`, 'todolist/board');
    return idsDe(x && x.tarefas, 'todolist/board');
  });
});

(async () => {
  console.log('\n=== Etapa 210 (RN-210.05): a busca sem caixa nas buscas que ainda usavam LIKE cru ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e210-bsc-'));
    ctx.T = await subir();
    abrirCru();
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
