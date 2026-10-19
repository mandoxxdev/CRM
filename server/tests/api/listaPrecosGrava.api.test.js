/**
 * Etapa 149 (Comercial, resto da C341) — a criacao da lista de preco grava as linhas uma por uma, confere o erro de cada uma e so responde
 * depois da ultima, pelo `index.js` de verdade (pasta vazia).
 *
 *   RN-149.06  POST /api/comercial/listas-precos: as linhas pelo gravarItensEmSequencia; a que falha apaga as gravadas e a lista -> 500
 *              "Erro ao gravar as linhas da lista de preços (<msg>). A lista não foi criada — importe a planilha de novo."; o BUSY com o
 *              desfazer feito -> 503 (context listas-precos); o desfazer que falha -> a frase "ficou incompleta" com o nome (sem 503)
 *
 * A falha da linha e REAL: um gatilho do SQLite gravado por fora recusa a linha de CODIGO 'P3' (passa pelo statement preparado de antes
 * desta etapa e pelo `db.run` de agora); outro recusa o DELETE (o desfazer). O BUSY e a falha da lista vem do FALHA_SQL_INJETADA (reboot).
 *
 * Molde: propostaClausulasGrava.api.test.js. Plano:
 * docs/superpowers/plans/2026-10-18-almoxarifado-etapa149-o-cadastro-de-familia-e-a-lista-de-os-pelo-modulo.md
 * Executar: cd server && node tests/api/listaPrecosGrava.api.test.js
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

let porta; let filho = null; let pasta; let logArq; let saiu = null;
async function j(m, u, tok, body, ms = 30000) {
  const r = await fetch(`http://127.0.0.1:${porta}/api${u}`, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(ms),
  });
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
const SEED = { email: 'e149lpseed@t.com', senha: 'E149lpseed!senha' };
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

let banco = null;
function abrirCru() {
  banco = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  banco.configure('busyTimeout', 15000);
}
const run = (sql, p = []) => new Promise((res, rej) => banco.run(sql, p, function feito(e) { if (e) rej(e); else res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => banco.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const ctx = {};

const COLUNAS = ['CODIGO', 'DESCRICAO', 'PRECO'];
const planilha = (marca, n = 5) => Array.from({ length: n }, (_, k) => ({ CODIGO: `P${k + 1}`, DESCRICAO: `${marca} ITEM ${k + 1}`, PRECO: `${(k + 1) * 10},00` }));
const criar = (tok, nome, itens) => j('POST', '/comercial/listas-precos', tok, { nome, arquivo_nome: `${nome}.xlsx`, colunas: COLUNAS, itens }, 60000);
const msgNaoCriada = (detalhe) => `Erro ao gravar as linhas da lista de preços (${detalhe}). A lista não foi criada — importe a planilha de novo.`;
const msgIncompleta = (detalhe, nome) => `Erro ao gravar as linhas da lista de preços (${detalhe}). A lista "${nome}" ficou incompleta — exclua-a e importe a planilha de novo.`;
const listasCom = (nome) => all('SELECT id, total_itens FROM listas_precos WHERE nome = ?', [nome]);
const linhasDe = async (nome) => (await all('SELECT i.id, i.dados FROM listas_precos_itens i JOIN listas_precos l ON l.id = i.lista_id WHERE l.nome = ? ORDER BY i.id', [nome]));
const todasAsLinhas = async () => (await all('SELECT COUNT(*) AS n FROM listas_precos_itens'))[0].n;

const GATILHO_LINHA = `CREATE TRIGGER e149_recusa_linha BEFORE INSERT ON listas_precos_itens
  WHEN json_extract(NEW.dados, '$.CODIGO') = 'P3' AND (SELECT nome FROM listas_precos WHERE id = NEW.lista_id) LIKE 'ALVO%'
  BEGIN SELECT RAISE(ABORT, 'linha recusada pelo teste'); END`;
const GATILHO_DESFAZER = `CREATE TRIGGER e149_recusa_desfazer BEFORE DELETE ON listas_precos_itens
  WHEN (SELECT nome FROM listas_precos WHERE id = OLD.lista_id) LIKE 'ALVO%'
  BEGIN SELECT RAISE(ABORT, 'desfazer recusado pelo teste'); END`;

// ── a metade positiva: o fluxo da tela, pela rota ─────────────────────────────────────────
test('[RN-149.06] o fluxo da tela pela rota: criar (201, total) -> a lista aparece -> as colunas -> as linhas na ordem, com a busca -> excluir', async () => {
  const [s, x] = await criar(ctx.u.T, 'LISTA BOA 149', planilha('BOA', 7));
  assert.deepStrictEqual([s, Object.keys(x || {}).sort(), x && x.total_itens], [201, ['id', 'total_itens'], 7], JSON.stringify(x));
  const linhas = await linhasDe('LISTA BOA 149');
  assert.deepStrictEqual(linhas.map((l) => JSON.parse(l.dados).CODIGO), ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'], 'as linhas nao foram gravadas todas, na ordem');
  const [sl, listas] = await j('GET', '/comercial/listas-precos', ctx.u.T);
  assert.ok(sl === 200 && listas.some((l) => l.id === x.id && l.total_itens === 7), JSON.stringify(listas));
  const [sd, det] = await j('GET', `/comercial/listas-precos/${x.id}`, ctx.u.T);
  assert.deepStrictEqual([sd, det.colunas], [200, COLUNAS]);
  const [si, it] = await j('GET', `/comercial/listas-precos/${x.id}/itens?q=boa%20item%203`, ctx.u.T);
  assert.deepStrictEqual([si, it.total, it.itens.map((i) => i.CODIGO)], [200, 1, ['P3']]);
  const [se, ex] = await j('DELETE', `/comercial/listas-precos/${x.id}`, ctx.u.T);
  assert.deepStrictEqual([se, ex], [200, { success: true }]);
  assert.deepStrictEqual([await listasCom('LISTA BOA 149'), await todasAsLinhas()], [[], 0]);
});

// ── a linha que o banco recusa ────────────────────────────────────────────────────────────
test('[RN-149.06] a 3a de 5 linhas recusada pelo banco: 500 com a frase, e nem a lista nem as 2 primeiras linhas ficam', async () => {
  await run(GATILHO_LINHA);
  try {
    const [s, x] = await criar(ctx.u.T, 'ALVO 149 A', planilha('ALVO'));
    assert.deepStrictEqual([s, x], [500, { error: msgNaoCriada('SQLITE_CONSTRAINT: linha recusada pelo teste') }]);
    await pausa(1000);
    assert.deepStrictEqual([await listasCom('ALVO 149 A'), await todasAsLinhas()], [[], 0], 'a lista ou as linhas gravadas antes da falha ficaram');
    // a vizinha (o gatilho so pega o ALVO) continua criando — a falha nao deixou o banco preso
    const [s2, x2] = await criar(ctx.u.T, 'VIZINHA 149', planilha('VIZ', 3));
    assert.deepStrictEqual([s2, x2 && x2.total_itens], [201, 3]);
    assert.strictEqual((await linhasDe('VIZINHA 149')).length, 3);
  } finally {
    await run('DROP TRIGGER IF EXISTS e149_recusa_linha');
  }
});

test('[RN-149.06, Fase 2 M-2] uma linha que nao vira texto (so pela integracao): 400 com o numero da linha, antes de gravar qualquer coisa', async () => {
  const itens = [{ CODIGO: 'P1', DESCRICAO: 'OK', PRECO: '1' }, { CODIGO: { toString: 1 }, DESCRICAO: 'RUIM', PRECO: '2' }];
  const [s, x] = await criar(ctx.u.T, 'RUIM 149', itens);
  assert.deepStrictEqual([s, x], [400, { error: 'A linha 2 da planilha não pôde ser lida (Cannot convert object to primitive value). A lista não foi criada.' }]);
  assert.deepStrictEqual(await listasCom('RUIM 149'), []);
});

test('[RN-149.06] a linha recusada e o desfazer tambem recusado: 500 com a frase "ficou incompleta" e o nome — a lista fica com as 2 primeiras', async () => {
  await run(GATILHO_LINHA);
  await run(GATILHO_DESFAZER);
  try {
    // Fase 2 M-5: a frase usa o nome gravado (aparado), nao o que chegou
    const [s, x] = await criar(ctx.u.T, '  ALVO 149 B  ', planilha('ALVO'));
    assert.deepStrictEqual([s, x], [500, { error: msgIncompleta('SQLITE_CONSTRAINT: linha recusada pelo teste', 'ALVO 149 B') }]);
    assert.strictEqual((await linhasDe('ALVO 149 B')).length, 2, 'a frase diz "ficou incompleta" — as 2 primeiras estao la');
  } finally {
    await run('DROP TRIGGER IF EXISTS e149_recusa_linha');
    await run('DROP TRIGGER IF EXISTS e149_recusa_desfazer');
  }
  const [lista] = await listasCom('ALVO 149 B');
  const [se] = await j('DELETE', `/comercial/listas-precos/${lista.id}`, ctx.u.T);
  assert.strictEqual(se, 200, 'excluir a lista incompleta (o que a frase manda fazer) nao funcionou');
  assert.deepStrictEqual(await linhasDe('ALVO 149 B'), []);
});

// ── o BUSY e a lista que nao grava: reboots ───────────────────────────────────────────────
test('[RN-149.06] SQLITE_BUSY na 3a linha: 503 (o client repete), nada fica; a falha ao gravar a lista continua 500 com a mensagem do banco, e o BUSY nela vira 503', async () => {
  await descer();
  ctx.T = await subir({ FALHA_SQL_INJETADA: 'INSERT INTO listas_precos_itens', FALHA_SQL_PULAR: '2', FALHA_SQL_MSG: 'SQLITE_BUSY: database is locked' });
  try {
    await logar(ctx.u);
    const [s, x] = await criar(ctx.u.T, 'BUSY 149', planilha('BUSY'));
    assert.deepStrictEqual([s, x], [503, { error: 'Banco temporariamente ocupado. Tente novamente em alguns segundos.', code: 'SQLITE_BUSY', retryAfter: 3, context: 'listas-precos' }]);
    await pausa(1000);
    assert.deepStrictEqual(await listasCom('BUSY 149'), [], 'a lista do BUSY ficou');
    assert.ok(/\[falha injetada\]\s+INSERT INTO listas_precos_itens/.test(fs.readFileSync(logArq, 'utf8')), 'a falha injetada nao casou (o teste nao provou nada)');
    // o BUSY com o desfazer TAMBEM falhando: a lista ficou pela metade -> 500 com a frase "ficou incompleta" (sem 503: repetir duplicaria)
    await descer();
    ctx.T = await subir({ FALHA_SQL_INJETADA: 'INSERT INTO listas_precos_itens|DELETE FROM listas_precos_itens', FALHA_SQL_PULAR: '2', FALHA_SQL_MSG: 'SQLITE_BUSY: database is locked' });
    await logar(ctx.u);
    const [sb, xb] = await criar(ctx.u.T, 'BUSY INCOMPLETA 149', planilha('BI'));
    assert.deepStrictEqual([sb, xb], [500, { error: msgIncompleta('SQLITE_BUSY: database is locked', 'BUSY INCOMPLETA 149') }]);
    assert.strictEqual((await linhasDe('BUSY INCOMPLETA 149')).length, 2);
    await descer();
    ctx.T = await subir({ FALHA_SQL_INJETADA: 'INSERT INTO listas_precos \\(' });
    await logar(ctx.u);
    const [s2, x2] = await criar(ctx.u.T, 'SEM LISTA 149', planilha('SL'));
    assert.deepStrictEqual([s2, x2], [500, { error: 'falha injetada pelo teste' }]);
    assert.deepStrictEqual(await listasCom('SEM LISTA 149'), []);
    // Fase 2 M-3: o BUSY ao gravar a propria lista -> 503 (nada ficou)
    await descer();
    ctx.T = await subir({ FALHA_SQL_INJETADA: 'INSERT INTO listas_precos \\(', FALHA_SQL_MSG: 'SQLITE_BUSY: database is locked' });
    await logar(ctx.u);
    const [s3, x3] = await criar(ctx.u.T, 'SEM LISTA BUSY 149', planilha('SLB'));
    assert.deepStrictEqual([s3, x3 && x3.context, x3 && x3.code], [503, 'listas-precos', 'SQLITE_BUSY']);
    assert.deepStrictEqual(await listasCom('SEM LISTA BUSY 149'), []);
  } finally {
    await descer();
    ctx.T = await subir();
  }
});

async function logar(u) {
  const [s, l] = await j('POST', '/auth/login', null, { email: u.email, senha: 'Senha!149l' });
  assert.strictEqual(s, 200, `login ${u.email}: ${JSON.stringify(l)}`);
  u.T = l.token;
}

(async () => {
  console.log('\n=== Etapa 149: a criacao da lista de preco so diz "pronto" depois de gravar todas as linhas (resto da C341) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e149-lp-'));
    ctx.T = await subir();
    abrirCru();
    const email = 'vendedor@e149.t';
    const [su, u] = await j('POST', '/usuarios', ctx.T, { nome: 'vendedor149', email, senha: 'Senha!149l', cargo: 'C', role: 'usuario', setor: '' });
    assert.ok(su === 200 || su === 201, JSON.stringify(u));
    const id = (await all('SELECT id FROM usuarios WHERE email = ?', [email]))[0].id;
    await run("INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, NULL, 'comercial', 'acesso', 1)", [id]);
    ctx.u = { id, email };
    await logar(ctx.u);
    // as tabelas da lista nascem no primeiro uso: a listagem as cria antes dos gatilhos
    const [sl] = await j('GET', '/comercial/listas-precos', ctx.u.T);
    assert.strictEqual(sl, 200);
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
