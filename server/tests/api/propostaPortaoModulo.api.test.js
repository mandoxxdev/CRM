/**
 * Etapa 145 (propostas) — as rotas `/api/propostas*` exigem o modulo Comercial pela regua da TELA, pelo `index.js` de verdade (pasta
 * vazia): C317.
 *
 *   RN-145.01  as 49 rotas passam pelo portao logo depois do login (antes do multer): quem a tela barra do Comercial toma 403
 *   RN-145.02  o GET /api/propostas/:id aceita tambem o Operacional (a OS do Operacional le os itens da proposta)
 *   RN-145.03  PROPOSTAS_PORTAO_DE_MODULO=desligado desliga o portao
 *   RN-145.08  as 5 rotas /api/aprovacoes (o pedido de aprovacao do desconto) passam pelo mesmo portao (Fase 5, r2 I-1)
 *   RN-145.04  a regua do portao e a da tela: a tabela compartilhada (tests/fixtures/portaoComoATela.casos.json) e, por usuario, a
 *              decisao do portao = temModuloComoATela sobre as permissoes que o GET /api/usuarios/:id/grupos (a fonte da tela) devolve
 *
 * Molde: propostaProdutoInexistente.api.test.js (pasta vazia, porta livre, morreComOPai, banco lido por fora).
 * Plano: docs/superpowers/plans/2026-10-18-almoxarifado-etapa145-o-modulo-nas-rotas-da-proposta.md
 * Executar: cd server && node tests/api/propostaPortaoModulo.api.test.js
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

// As mensagens literais do contrato (o plano). O teste compara com o texto, nao com a constante: trocar a constante tem de derrubar.
const SEM_ID = 'Produto inválido: cada produto da proposta deve trazer o id de um produto cadastrado.';
const nao = (ids) => `Produto não encontrado (id ${ids}). Atualize a lista de produtos e tente de novo.`;
const ITEM = 'Item inválido: cada item da proposta deve ser um objeto.';
const OBRIG = 'Cliente e produtos são obrigatórios';
const MARGEM = 'Margem de desconto inválida: informe um número de 0 a 100, com ponto como separador decimal.';

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
/** A chamada que tem de RESPONDER: 10 s de limite (o de antes da etapa nunca respondia — C310). */
async function responde(m, u, body) {
  try {
    return await j(m, u, ctx.T, body, false, 10000);
  } catch (e) {
    throw new Error(`${m} ${u} nao respondeu em 10 s (${e.name}) com ${JSON.stringify(body).slice(0, 120)}`);
  }
}
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e145pseed@t.com', senha: 'E145pseed!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir(extraEnv = {}) {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'FALHA_SQL_MSG', 'FALHA_SQL_METODOS', 'FALHA_SQL_PULAR', 'PROPOSTAS_PORTAO_DE_MODULO', 'RATE_LIMIT_WINDOW_MS']) delete env[k];
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
const NEGADO_PAR = { error: 'Acesso negado ao módulo', modulo: ['comercial', 'operacional'] };

// ── as rotas, lidas do fonte ──────────────────────────────────────────────────────────────
const FONTE = fs.readFileSync(path.join(SERVER_DIR, 'index.js'), 'utf8');
const ROTAS = [...FONTE.matchAll(/^app\.(get|post|put|patch|delete)\('(\/api\/propostas[^']*)', ([^\n]*)$/gm)]
  .map((m) => ({ metodo: m[1].toUpperCase(), rota: m[2], resto: m[3] }));
const ehOPar = (r) => r.metodo === 'GET' && r.rota === '/api/propostas/:id';
const APROVACOES = [...FONTE.matchAll(/^app\.(get|post|put|patch|delete)\('(\/api\/aprovacoes[^']*)', ([^\n]*)$/gm)]
  .map((m) => ({ metodo: m[1].toUpperCase(), rota: m[2], resto: m[3] }));
const UPLOADS = { '/api/propostas/:id/fotos': 'foto', '/api/propostas/:id/anexar-cotacao': 'arquivo', '/api/propostas/:id/pdf-anexo': 'arquivo' };

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
const urlDe = (rota) => rota.replace('/api', '').replace(':id', String(ctx.prop)).replace(':clausulaId', '1').replace(':fotoId', '1').replace(':cliente_id', String(ctx.clienteId));
const retratoDaProposta = async () => JSON.stringify([
  await all('SELECT * FROM propostas ORDER BY id'), await all('SELECT * FROM proposta_itens ORDER BY id'),
  await all('SELECT * FROM proposta_clausulas ORDER BY id'), await all('SELECT * FROM proposta_variaveis_manuais ORDER BY id'),
  await all('SELECT * FROM proposta_fotos ORDER BY id'), await all('SELECT * FROM proposta_followups ORDER BY id'),
]);
const contarNegados = async (id) => (await all("SELECT COUNT(*) AS n FROM logs_auditoria WHERE tipo = 'acesso_negado' AND usuario_id = ? AND modulo = 'comercial' AND nome_modulo = 'Comercial'", [id]))[0].n;

async function usuario(nome, { role = 'usuario', grupos = [], diretas = [], diretasZero = [], diretasCrus = [] } = {}) {
  const email = `${nome}@e145.t`;
  const [s, u] = await j('POST', '/usuarios', ctx.T, { nome, email, senha: 'Senha!145p', cargo: 'C', role, setor: '' });
  assert.ok(s === 200 || s === 201, `usuario ${nome}: ${s} ${JSON.stringify(u)}`);
  const id = (await all('SELECT id FROM usuarios WHERE email = ?', [email]))[0].id;
  for (const g of grupos) await run('INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES (?, ?)', [id, g]);
  for (const m of diretas) await run("INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, NULL, ?, 'acesso', 1)", [id, m]);
  for (const m of diretasZero) await run("INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, 0, ?, 'acesso', 1)", [id, m]);
  // [modulo, acao, permissao] crus (Fase 5 r3 R6/R7): a linha de permissao 0 (o rotasDePermissoes grava) e a de outra acao contam como linha
  for (const [m, acao, p] of diretasCrus) await run('INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, NULL, ?, ?, ?)', [id, m, acao, p]);
  return { id, nome, role, email };
}
async function logar(u) {
  const [s, l] = await j('POST', '/auth/login', null, { email: u.email, senha: 'Senha!145p' });
  assert.strictEqual(s, 200, `login ${u.nome}: ${JSON.stringify(l)}`);
  u.T = l.token;
}

// ── RN-145.04: a regua pura contra a tabela compartilhada com o client ───────────────────
test('[RN-145.04] puro: temModuloComoATela da a decisao da tabela compartilhada com o hasModuleAccess do client', () => {
  const { casos } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'portaoComoATela.casos.json'), 'utf8'));
  assert.ok(casos.length >= 10 && casos.some((c) => c.espera) && casos.some((c) => !c.espera), 'a tabela tem de ter os dois lados');
  const errados = casos.filter((c) => temModuloComoATela(c.user, c.linhas, c.modulos) !== c.espera).map((c) => c.nome);
  assert.deepStrictEqual(errados, []);
});

// ── RN-145.01: a regua pelo fonte ─────────────────────────────────────────────────────────
test('[RN-145.01] fonte: as 49 rotas /api/propostas* tem o portao como 2o middleware, logo depois do login (antes do multer)', () => {
  assert.strictEqual(ROTAS.length, 49, `esperava 49 rotas, achei ${ROTAS.length}`);
  // regua independente: toda linha do index.js com '/api/propostas, menos a listagem da raiz /api (texto)
  // Fase 5 r3 R16: qualquer aspa (simples, dupla, crase) — uma rota nova escrita com aspas duplas passaria sem o portao
  const linhas = FONTE.split('\n').filter((l) => /["'`]\/api\/propostas/.test(l) && !/^\s*propostas: '\/api\/propostas',$/.test(l));
  // e nenhum outro arquivo do servidor (routes/, services/ — os modulos montam no `rotasModulos`, um Router) registra rota de proposta
  const fora = [];
  const varrer = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', 'tests', 'data', 'uploads', 'backups'].includes(e.name) || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) varrer(p);
      else if (e.name.endsWith('.js') && p !== path.join(SERVER_DIR, 'index.js') && /\.(get|post|put|patch|delete|all|use|route)\(\s*["'`]\/api\/(propostas|aprovacoes)/.test(fs.readFileSync(p, 'utf8'))) fora.push(path.relative(SERVER_DIR, p));
    }
  };
  varrer(SERVER_DIR);
  assert.deepStrictEqual(fora, [], 'rota de proposta/aprovacao registrada fora do index.js escaparia desta regua');
  assert.ok(fs.existsSync(path.join(SERVER_DIR, 'routes', 'compras.js')), 'a varredura nao enxerga routes/ (controle: o arquivo de Compras existe)');
  assert.strictEqual(linhas.length, ROTAS.length, "ha registro de rota de proposta fora do formato app.<verbo>('/api/propostas...', ...) numa linha so");
  assert.ok(!/app\.(use|all)\(\s*['"`]\/api\/propostas/.test(FONTE), 'app.use/app.all no prefixo das propostas');
  const sem = ROTAS.filter((r) => !r.resto.startsWith(ehOPar(r) ? 'authenticateToken, exigirComercialOuOperacionalNaProposta, ' : 'authenticateToken, exigirComercialNasPropostas, '))
    .map((r) => `${r.metodo} ${r.rota}: ${r.resto.slice(0, 70)}`);
  assert.deepStrictEqual(sem, []);
  assert.strictEqual(ROTAS.filter(ehOPar).length, 1);
  assert.strictEqual(Object.keys(UPLOADS).filter((u) => ROTAS.some((r) => r.rota === u && /\.single\(/.test(r.resto))).length, 3, 'as tres rotas com multer');
});

test('[RN-145.08] fonte: as 5 rotas /api/aprovacoes tem o portao como 2o middleware', () => {
  assert.strictEqual(APROVACOES.length, 5, `esperava 5 rotas de aprovacoes, achei ${APROVACOES.length}`);
  const linhas = FONTE.split('\n').filter((l) => l.includes("'/api/aprovacoes"));
  assert.strictEqual(linhas.length, 5, 'ha registro de rota de aprovacoes fora do formato numa linha so');
  assert.deepStrictEqual(APROVACOES.filter((r) => !r.resto.startsWith('authenticateToken, exigirComercialNasPropostas, ')).map((r) => r.metodo + ' ' + r.rota), []);
});

test('[RN-145.08, Fase 5 r2 I-1] o barrado toma 403 nas 5 rotas de aprovacoes e nenhum pedido nasce; quem tem o Comercial lista', async () => {
  const b = ctx.u.soOperacional;
  const antes = JSON.stringify(await all('SELECT * FROM aprovacoes ORDER BY id'));
  const log0 = await contarNegados(b.id);
  const out = [];
  for (const r of APROVACOES) {
    const u = r.rota.replace('/api', '').replace(':id', '1');
    const corpo = r.metodo === 'GET' || r.metodo === 'DELETE' ? undefined : { proposta_id: ctx.prop, valor_desconto: 30, status: 'aprovado' };
    const [s, x] = await j(r.metodo, u, b.T, corpo);
    out.push([r.metodo + ' ' + r.rota, s, JSON.stringify(x)]);
  }
  assert.deepStrictEqual(out, APROVACOES.map((r) => [r.metodo + ' ' + r.rota, 403, JSON.stringify(NEGADO)]));
  await pausa(200);
  assert.strictEqual(JSON.stringify(await all('SELECT * FROM aprovacoes ORDER BY id')), antes, 'um pedido de aprovacao nasceu');
  assert.strictEqual(await contarNegados(b.id) - log0, 5);
  // a metade positiva: quem a tela deixa abrir o Comercial pede a aprovacao e lista
  const [sp, xp] = await j('POST', '/aprovacoes', ctx.u.diretaComercial.T, { proposta_id: ctx.prop, valor_desconto: 30 });
  assert.strictEqual(sp, 200, JSON.stringify(xp));
  const [sl, xl] = await j('GET', '/aprovacoes', ctx.u.diretaComercial.T);
  assert.strictEqual(sl, 200, JSON.stringify(xl));
  assert.ok(Array.isArray(xl) && xl.some((a) => a.id === xp.id), 'a lista nao trouxe o pedido criado');
});

// ── RN-145.01/02: pela rota, cada uma das 49 ──────────────────────────────────────────────
test('[RN-145.01, C317] o usuario que a tela barra do Comercial (so a direta do Operacional, sem grupo) toma 403 em cada uma das 49 — e nada muda', async () => {
  const b = ctx.u.soOperacional;
  const antes = await retratoDaProposta();
  const arquivos0 = arquivosDaPasta();
  const log0 = await contarNegados(b.id);
  const errados = [];
  let negados = 0;
  for (const r of ROTAS) {
    const u = urlDe(r.rota);
    let s; let x;
    if (UPLOADS[r.rota]) [s, x] = await multipart(u, b.T, UPLOADS[r.rota], 'a.pdf', 'application/pdf', '%PDF-1.4\n%e145\n');
    else {
      const corpo = r.metodo === 'GET' || r.metodo === 'DELETE' ? undefined
        : { titulo: 'X', cliente_id: ctx.clienteId, produtos: [{ id: ctx.produto }], itens: [], variaveis: [], descricoes: [] };
      [s, x] = await j(r.metodo, u, b.T, corpo);
    }
    if (ehOPar(r)) {
      if (s !== 200 || !x || x.id !== ctx.prop) errados.push(`${r.metodo} ${r.rota}: ${s} (o Operacional devia ler)`);
    } else if (s !== 403 || JSON.stringify(x) !== JSON.stringify(NEGADO)) {
      errados.push(`${r.metodo} ${r.rota}: ${s} ${JSON.stringify(x).slice(0, 80)}`);
    } else negados++;
  }
  assert.deepStrictEqual(errados, []);
  assert.strictEqual(negados, 48);
  await pausa(300);
  assert.strictEqual(await retratoDaProposta(), antes, 'uma rota barrada mudou a proposta');
  assert.deepStrictEqual(arquivosDaPasta(), arquivos0, 'um upload barrado gravou arquivo (o portao depois do multer — Fase 2 M-10)');
  assert.strictEqual(await contarNegados(b.id) - log0, 48, 'cada 403 registra o acesso negado no log');
  // a metade positiva do upload: o administrador grava o PDF anexo e o arquivo aparece (a regua das pastas enxerga upload)
  const [sa, xa] = await multipart(`/propostas/${ctx.prop}/pdf-anexo`, ctx.T, 'arquivo', 'a.pdf', 'application/pdf', '%PDF-1.4\n%e145\n');
  assert.strictEqual(sa, 200, JSON.stringify(xa));
  assert.strictEqual(arquivosDaPasta().length, arquivos0.length + 1, 'o upload do administrador nao apareceu na pasta');
});

test('[RN-145.02] o GET /api/propostas/:id sem Comercial nem Operacional: 403 com o par e o log "Comercial ou Operacional"', async () => {
  const u = ctx.u.soAlmox;
  const [s, x] = await j('GET', `/propostas/${ctx.prop}`, u.T);
  assert.deepStrictEqual([s, x], [403, NEGADO_PAR]);
  await pausa(200);
  const log = await all("SELECT modulo, nome_modulo FROM logs_auditoria WHERE tipo = 'acesso_negado' AND usuario_id = ? ORDER BY id DESC LIMIT 1", [u.id]);
  assert.deepStrictEqual(log, [{ modulo: 'comercial|operacional', nome_modulo: 'Comercial ou Operacional' }]);
  // a metade positiva: com o Comercial le
  const [s2, x2] = await j('GET', `/propostas/${ctx.prop}`, ctx.u.diretaComercial.T);
  assert.strictEqual(s2, 200, JSON.stringify(x2));
  assert.strictEqual(x2.id, ctx.prop);
});

// ── RN-145.04: por usuario, o portao decide como a tela ───────────────────────────────────
test('[RN-145.04, Fase 2 I-3] para cada usuario, o portao decide o que a tela decide sobre as permissoes do GET /api/usuarios/:id/grupos', async () => {
  const esperado = {
    semNada: 200, diretaComercial: 200, grupoComercial: 200, grupoVazio: 200, soGrupoInativo: 200, admin: 200, superU: 200,
    soOperacional: 403, soAlmox: 403, grupoInativoComAlmox: 403, diretaZeroComercial: 403, orfaoComercial: 403, grupoSoOperacional: 403,
    comercialPermissao0: 403, almoxOutraAcao: 403, adminDoModuloComercial: 403, roleAdmin: 200,
  };
  const linhas = [];
  for (const k of Object.keys(esperado)) {
    const u = ctx.u[k];
    const [sg, g] = await j('GET', `/usuarios/${u.id}/grupos`, ctx.T);
    assert.strictEqual(sg, 200, JSON.stringify(g));
    const tela = temModuloComoATela({ id: u.id, role: u.role, is_superadmin: u.superadmin ? 1 : 0 }, g.permissoes, ['comercial']);
    const [s1] = await j('GET', '/propostas', u.T);
    const [s2] = await j('PUT', `/propostas/${ctx.prop}/itens/descricoes`, u.T, { descricoes: [] });
    linhas.push([k, s1, s2, tela ? 200 : 403]);
  }
  assert.deepStrictEqual(linhas, Object.entries(esperado).map(([k, st]) => [k, st, st, st]));
});

// ── RN-146.06 (Etapa 146, C321): a lista de OS do Comercial pela mesma regua ──────────────
test('[RN-146.06, C321] GET /api/comercial/ordens-servico: o portao das propostas no registro, e cada usuario decide como a tela (antes: o grupo sem linha tomava 403 e o so-Operacional passava)', async () => {
  const reg = FONTE.split('\n').filter((l) => /app\.\w+\(\s*["'`]\/api\/comercial\/ordens-servico["'`]/.test(l));
  assert.strictEqual(reg.length, 1, 'esperava um registro da rota');
  assert.ok(reg[0].includes("'/api/comercial/ordens-servico', authenticateToken, exigirComercialNasPropostas, "), reg[0]);
  const esperado = { semNada: 200, diretaComercial: 200, grupoComercial: 200, grupoVazio: 200, superU: 200, roleAdmin: 200,
    soOperacional: 403, soAlmox: 403, grupoSoOperacional: 403, comercialPermissao0: 403 };
  const linhas = [];
  for (const k of Object.keys(esperado)) {
    const [s, x] = await j('GET', '/comercial/ordens-servico', ctx.u[k].T);
    linhas.push([k, s, s === 403 ? x : null]);
  }
  assert.deepStrictEqual(linhas, Object.entries(esperado).map(([k, st]) => [k, st, st === 403 ? NEGADO : null]));
  await pausa(200);
  const log = await all("SELECT modulo, nome_modulo FROM logs_auditoria WHERE tipo = 'acesso_negado' AND usuario_id = ? ORDER BY id DESC LIMIT 1", [ctx.u.soOperacional.id]);
  assert.deepStrictEqual(log, [{ modulo: 'comercial', nome_modulo: 'Comercial' }]);
});

test('[RN-145.01] a metade positiva: quem a tela deixa abrir o Comercial gera proposta e grava no preview', async () => {
  for (const k of ['semNada', 'diretaComercial', 'grupoComercial', 'grupoVazio']) {
    const u = ctx.u[k];
    const [s, x] = await j('POST', '/propostas/gerar-automatica', u.T, { cliente_id: ctx.clienteId, produtos: [{ id: ctx.produto }] });
    assert.strictEqual(s, 200, `${k}: ${JSON.stringify(x)}`);
    const [s2, x2] = await j('PUT', `/propostas/${x.id}/itens/descricoes`, u.T, { descricoes: [] });
    assert.deepStrictEqual([s2, x2], [200, { ok: true, ignorados: 0 }], `${k}: o preview`);
  }
});

// ── RN-145.03 e o BUSY: reboots ───────────────────────────────────────────────────────────
test('[RN-145.03] PROPOSTAS_PORTAO_DE_MODULO=desligado (com espaco e maiuscula) deixa o barrado passar; ligado de novo, barra', async () => {
  const b = ctx.u.soOperacional;
  await descer();
  ctx.T = await subir({ PROPOSTAS_PORTAO_DE_MODULO: ' Desligado ' });
  await logar(b);
  assert.ok(/PROPOSTAS_PORTAO_DE_MODULO=desligado/.test(fs.readFileSync(logArq, 'utf8')), 'o boot nao avisou que o portao esta desligado');
  const [s1] = await j('GET', '/propostas', b.T);
  const [s2, x2] = await j('POST', '/propostas/gerar-automatica', b.T, { cliente_id: ctx.clienteId, produtos: [{ id: ctx.produto }] });
  assert.deepStrictEqual([s1, s2], [200, 200], JSON.stringify(x2));
  await descer();
  ctx.T = await subir({ PROPOSTAS_PORTAO_DE_MODULO: 'ligado' });
  await logar(b);
  const [s3, x3] = await j('GET', '/propostas', b.T);
  assert.deepStrictEqual([s3, x3], [403, NEGADO]);
});

test('[RN-145.01, Fase 2 I-2] SQLITE_BUSY ao ler as permissoes: 503 (o client repete); outro erro: 500; o administrador nem le', async () => {
  const b = ctx.u.soOperacional;
  const FALHA = 'p\\.modulo, p\\.permissao FROM grupos_permissoes';
  await descer();
  ctx.T = await subir({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'all', FALHA_SQL_MSG: 'SQLITE_BUSY: database is locked' });
  await logar(b);
  const [s, x] = await j('GET', '/propostas', b.T);
  assert.deepStrictEqual([s, x], [503, { error: 'Banco temporariamente ocupado. Tente novamente em alguns segundos.', code: 'SQLITE_BUSY', retryAfter: 3, context: 'portao:propostas' }]);
  const [sa] = await j('GET', '/propostas', ctx.T);
  assert.strictEqual(sa, 200, 'o administrador passa sem ler as linhas');
  // Fase 5 r3 R9: o super que nao e role admin, e o role admin que nao e super, tambem passam sem ler (o seed e os dois ao mesmo tempo)
  for (const k of ['superU', 'roleAdmin']) {
    await logar(ctx.u[k]);
    const [sk, xk] = await j('GET', '/propostas', ctx.u[k].T);
    assert.strictEqual(sk, 200, `${k} sob o BUSY: ${JSON.stringify(xk).slice(0, 120)}`);
  }
  await descer();
  ctx.T = await subir({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'all' });
  await logar(b);
  const [s2, x2] = await j('GET', '/propostas', b.T);
  assert.deepStrictEqual([s2, x2], [500, { error: 'Erro ao verificar permissões' }]);
  await descer();
  ctx.T = await subir();
});

(async () => {
  console.log('\n=== Etapa 145 (propostas): as rotas da proposta exigem o modulo Comercial pela regua da tela (C317) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e145-portao-'));
    ctx.T = await subir();
    abrirCru();
    const [sc, c] = await j('POST', '/clientes', ctx.T, { razao_social: 'Cli 145', cnpj: '11.222.333/0001-45', email: 'a@a.com' });
    assert.strictEqual(sc, 200, JSON.stringify(c));
    ctx.clienteId = c.id;
    const [sp, p] = await j('POST', '/produtos', ctx.T, { codigo: 'SP145', nome: 'Produto 145', familia: 'FAM145', classificacao_area: 'NAO CLASSIFICADA', preco_base: 10 });
    assert.strictEqual(sp, 200, JSON.stringify(p));
    ctx.produto = p.id;
    const [s0, p0] = await j('POST', '/propostas', ctx.T, { titulo: 'P145', cliente_id: c.id, itens: [{ descricao: 'A', quantidade: 1, valor_unitario: 10, valor_total: 10 }] });
    assert.strictEqual(s0, 200, JSON.stringify(p0));
    ctx.prop = p0.id;
    // grupos gravados por fora: 901 ativo com Comercial, 902 ativo so Operacional, 903 ativo sem linha, 904 inativo com Comercial;
    // 999 nao existe (o vinculo orfao de um grupo apagado), com a linha do Comercial que ficou
    await run("INSERT INTO grupos_permissoes (id, nome, ativo) VALUES (901,'G-com',1),(902,'G-op',1),(903,'G-vazio',1),(904,'G-inat',0)");
    await run("INSERT INTO permissoes (grupo_id, modulo, acao, permissao) VALUES (901,'comercial','acesso',1),(902,'operacional','acesso',1),(904,'comercial','acesso',1),(999,'comercial','acesso',1)");
    ctx.u = {
      semNada: await usuario('semnada'),
      diretaComercial: await usuario('dcom', { diretas: ['comercial'] }),
      grupoComercial: await usuario('gcom', { grupos: [901] }),
      grupoVazio: await usuario('gvazio', { grupos: [903] }),
      soGrupoInativo: await usuario('ginat', { grupos: [904] }),
      admin: await usuario('adm', { role: 'admin', diretas: ['almoxarifado'] }),
      superU: await usuario('super', { diretas: ['almoxarifado'] }),
      soOperacional: await usuario('sop', { diretas: ['operacional'] }),
      soAlmox: await usuario('salm', { diretas: ['almoxarifado'] }),
      grupoInativoComAlmox: await usuario('ginatalm', { grupos: [904], diretas: ['almoxarifado'] }),
      diretaZeroComercial: await usuario('dzero', { diretas: ['almoxarifado'], diretasZero: ['comercial'] }),
      orfaoComercial: await usuario('orfao', { grupos: [999], diretas: ['almoxarifado'] }),
      grupoSoOperacional: await usuario('gop', { grupos: [902] }),
      comercialPermissao0: await usuario('cp0', { diretasCrus: [['comercial', 'acesso', 0]] }),
      almoxOutraAcao: await usuario('aoa', { diretasCrus: [['almoxarifado', 'editar', 1]] }),
      adminDoModuloComercial: await usuario('admmod', { diretas: ['almoxarifado'] }),
      roleAdmin: await usuario('radm', { role: 'admin', diretas: ['almoxarifado'] }),
    };
    await run('UPDATE usuarios SET is_superadmin = 1 WHERE id = ?', [ctx.u.superU.id]);
    // Fase 5 r3 R8: o administrador do modulo Comercial (admin_modulos) nao passa sem a linha — a tela tambem nao o deixa
    await run("UPDATE usuarios SET admin_modulos = '[\"comercial\"]' WHERE id = ?", [ctx.u.adminDoModuloComercial.id]);
    assert.strictEqual((await all('SELECT is_superadmin, role FROM usuarios WHERE id = ?', [ctx.u.roleAdmin.id]))[0].is_superadmin, 0, 'o role admin do cenario nao pode ser super');
    ctx.u.superU.superadmin = true;
    for (const u of Object.values(ctx.u)) await logar(u);
    for (const [name, fn] of testes) {
      if (saiu !== null) { failed++; console.error(`  ✗ ${name}: o servidor caiu antes (codigo ${saiu})`); continue; }
      try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
        failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`);
      }
    }
  } catch (e) { failed++; console.error('  ✗ preparo:', e.message); }
  if (cru) await new Promise((r) => cru.close(() => r()));
  await descer();
  try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
