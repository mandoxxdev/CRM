/**
 * Etapa 147 (propostas) — copiar as clausulas padrao para a proposta e reordenar as clausulas gravam uma por uma, conferem o erro de cada
 * linha e so respondem depois da ultima, pelo `index.js` de verdade (pasta vazia): C327.
 *
 *   RN-147.05  POST /api/propostas/:id/clausulas/inicializar: em sequencia; a que falha apaga as gravadas -> 500 e nenhuma fica (o client
 *              relaciona as copiadas por POSICAO — com uma a menos, a edicao cairia na clausula errada); a limpeza que falha -> a 2a frase
 *   RN-147.06  PUT /api/propostas/:id/clausulas/reordenar: le a ordem atual, grava em sequencia; a que falha devolve a ordem lida -> 500;
 *              a devolucao que falha -> a frase da ordem misturada; a leitura que falha -> "Nada foi alterado"
 *
 *   RN-148.05  (Etapa 148, C342) as duas, de uma proposta que NAO existe -> 404 "Proposta não encontrada" (antes: 500 da chave estrangeira /
 *              200 com log de edicao); a inativa existe e segue; o erro ao ler a proposta -> a frase de cada rota (503 no BUSY)
 *
 * A falha e REAL: gatilhos do SQLite gravados por fora, restritos a uma proposta-alvo (tabela e147_alvo), passam pelo statement preparado
 * de antes desta etapa e pelo `db.run` de agora. A leitura da ordem atual falha pelo FALHA_SQL_INJETADA (um reboot).
 *
 * Molde: propostaSalvarGrava.api.test.js. Plano: docs/superpowers/plans/2026-10-18-almoxarifado-etapa147-o-modulo-no-modelo-e-nas-listas.md
 * Executar: cd server && node tests/api/propostaClausulasGrava.api.test.js
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
const SEED = { email: 'e147clseed@t.com', senha: 'E147clseed!senha' };
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
const ctx = {};

// As mensagens literais do contrato (o plano). O teste compara com o texto, nao com a constante: trocar a constante tem de derrubar.
const INI_NADA = (m) => `Erro ao copiar as cláusulas da proposta (${m}). Nenhuma cláusula foi gravada — salve de novo.`;
const INI_PARTE = (m) => `Erro ao copiar as cláusulas da proposta (${m}). A proposta ficou com parte das cláusulas — use Resetar cláusulas e salve de novo.`;
const ORD_LEITURA = (m) => `Erro ao gravar a nova ordem das cláusulas (${m}). A ordem não foi alterada — salve de novo.`;
const ORD_MANTIDA = (m) => `Erro ao gravar a nova ordem das cláusulas (${m}). A ordem anterior foi mantida — salve de novo.`;
const ORD_MISTURADA = (m) => `Erro ao gravar a nova ordem das cláusulas (${m}). A ordem ficou misturada — confira as cláusulas antes de enviar a proposta e salve de novo.`;
const GATILHO = 'SQLITE_CONSTRAINT: falha do gatilho';

// o modelo de contrato padrao que o boot semeia (o inicializar o escolhe para a proposta sem familia) — lido no preparo
let N_DEFAULT = 0; let MODELO_PADRAO = null; let TITULOS_PADRAO = [];

const clausulas = (pid) => all('SELECT id, ordem, titulo FROM proposta_clausulas WHERE proposta_id = ? ORDER BY id', [pid]);
const logs = (pid, tipo) => all('SELECT tipo, valor_novo FROM proposta_edicoes_log WHERE proposta_id = ? AND tipo = ? ORDER BY id', [pid, tipo]);
async function proposta(titulo) {
  const [s, p] = await responde('POST', '/propostas', { titulo, cliente_id: ctx.clienteId, itens: [{ descricao: 'A', quantidade: 1, valor_unitario: 10, valor_total: 10 }] });
  assert.strictEqual(s, 200, JSON.stringify(p));
  return p.id;
}
async function alvo(pid, fase) { await run('INSERT INTO e147_alvo (proposta_id, fase) VALUES (?, ?)', [pid, fase]); }
async function semAlvo(pid) { await run('DELETE FROM e147_alvo WHERE proposta_id = ?', [pid]); }
/** Uma proposta ja com as N clausulas padrao copiadas (sem falha) — o ponto de partida do reordenar. */
async function propostaInicializada(titulo) {
  const pid = await proposta(titulo);
  const [s, x] = await responde('POST', `/propostas/${pid}/clausulas/inicializar`);
  assert.deepStrictEqual([s, x && x.total], [200, N_DEFAULT], JSON.stringify(x));
  return pid;
}

// ── RN-147.05: inicializar ────────────────────────────────────────────────────────────────
test('[RN-147.05, C327] inicializar com a 4a clausula recusada pelo banco: 500 literal, responde, nenhuma clausula fica e nenhum log de edicao', async () => {
  const pid = await proposta('Ini falha');
  await alvo(pid, 'insert');
  const [s, x] = await responde('POST', `/propostas/${pid}/clausulas/inicializar`);
  assert.deepStrictEqual([s, x], [500, { error: INI_NADA(GATILHO) }]);
  await pausa(200);
  assert.deepStrictEqual(await clausulas(pid), [], 'ficaram clausulas da copia que falhou (o client as relacionaria por posicao)');
  assert.deepStrictEqual(await logs(pid, 'clausulas_inicializadas'), [], 'o log de edicao entrou na falha');
  // o vendedor salva de novo depois de a causa sair: a copia acontece inteira (nao "jaInicializado")
  await semAlvo(pid);
  const [s2, x2] = await responde('POST', `/propostas/${pid}/clausulas/inicializar`);
  assert.deepStrictEqual([s2, x2], [200, { ok: true, modelo_id: MODELO_PADRAO, total: N_DEFAULT }]);
  const depois = await clausulas(pid);
  assert.strictEqual(depois.length, N_DEFAULT);
  assert.deepStrictEqual(depois.map((c) => c.ordem), depois.map((_, i) => i), 'a ordem da copia e a posicao no modelo');
  assert.deepStrictEqual(depois.map((c) => c.titulo), TITULOS_PADRAO);
});

test('[RN-147.05] inicializar com a falha E a limpeza recusada: a frase da proposta com parte das clausulas, e as 3 gravadas continuam la', async () => {
  const pid = await proposta('Ini falha e limpeza');
  await alvo(pid, 'insert');
  await alvo(pid, 'delete');
  const [s, x] = await responde('POST', `/propostas/${pid}/clausulas/inicializar`);
  assert.deepStrictEqual([s, x], [500, { error: INI_PARTE(GATILHO) }]);
  await pausa(200);
  assert.deepStrictEqual((await clausulas(pid)).map((c) => c.ordem), [0, 1, 2], 'as gravadas antes da falha');
  assert.deepStrictEqual(await logs(pid, 'clausulas_inicializadas'), []);
});

test('[RN-147.05] a metade positiva: inicializar 200 com o total, o log de edicao e, de novo, jaInicializado sem gravar mais nada', async () => {
  const pid = await proposta('Ini ok');
  const [s, x] = await responde('POST', `/propostas/${pid}/clausulas/inicializar`);
  assert.deepStrictEqual([s, x], [200, { ok: true, modelo_id: MODELO_PADRAO, total: N_DEFAULT }]);
  await pausa(200);
  assert.strictEqual((await clausulas(pid)).length, N_DEFAULT);
  assert.deepStrictEqual(await logs(pid, 'clausulas_inicializadas'), [{ tipo: 'clausulas_inicializadas', valor_novo: `${N_DEFAULT} cláusulas copiadas (modelo ${MODELO_PADRAO})` }]);
  const [s2, x2] = await responde('POST', `/propostas/${pid}/clausulas/inicializar`);
  assert.deepStrictEqual([s2, x2], [200, { ok: true, jaInicializado: true }]);
  assert.strictEqual((await clausulas(pid)).length, N_DEFAULT);
});

// ── RN-147.06: reordenar ──────────────────────────────────────────────────────────────────
test('[RN-147.06, C327] reordenar (inverter) com a 3a linha recusada: 500 literal, responde, a ordem de antes intacta e nenhum log', async () => {
  const pid = await propostaInicializada('Ord falha');
  const antes = await clausulas(pid);
  await alvo(pid, 'ordem2');
  const nova = antes.map((c) => c.id).reverse();
  const [s, x] = await responde('PUT', `/propostas/${pid}/clausulas/reordenar`, { ordem: nova });
  assert.deepStrictEqual([s, x], [500, { error: ORD_MANTIDA(GATILHO) }]);
  await pausa(200);
  assert.deepStrictEqual(await clausulas(pid), antes, 'a ordem nao voltou a de antes (as duas primeiras ja tinham mudado)');
  assert.deepStrictEqual(await logs(pid, 'clausula_reordenada'), [], 'o log de edicao entrou na falha');
});

test('[RN-147.06] reordenar com a falha E a devolucao recusada: a frase da ordem misturada', async () => {
  const pid = await propostaInicializada('Ord falha e devolucao');
  const antes = await clausulas(pid);
  const ultima = antes.length - 1;
  // a 1a da nova ordem (a ultima de antes) vai para 0 e passa; a 3a (nova ordem 2) falha; a devolucao da 1a (de volta a `ultima`) falha
  await alvo(pid, 'ordem2');
  await alvo(pid, `ordem${ultima}`);
  const [s, x] = await responde('PUT', `/propostas/${pid}/clausulas/reordenar`, { ordem: antes.map((c) => c.id).reverse() });
  assert.deepStrictEqual([s, x], [500, { error: ORD_MISTURADA(GATILHO) }]);
  await pausa(200);
  const depois = await clausulas(pid);
  assert.strictEqual(depois.find((c) => c.id === antes[ultima].id).ordem, 0, 'a que mudou e nao voltou');
  assert.deepStrictEqual(await logs(pid, 'clausula_reordenada'), []);
});

test('[RN-147.06] a metade positiva: reordenar 200, a ordem nova gravada, o log; id de outra proposta ignorado', async () => {
  const pid = await propostaInicializada('Ord ok');
  const outra = await propostaInicializada('Ord outra');
  const antes = await clausulas(pid);
  const daOutra = (await clausulas(outra))[0];
  const nova = [antes[2].id, antes[0].id, daOutra.id, antes[1].id];
  const [s, x] = await responde('PUT', `/propostas/${pid}/clausulas/reordenar`, { ordem: nova });
  assert.deepStrictEqual([s, x], [200, { ok: true }]);
  await pausa(200);
  const depois = await clausulas(pid);
  const ordemDe = (id) => depois.find((c) => c.id === id).ordem;
  assert.deepStrictEqual([ordemDe(antes[2].id), ordemDe(antes[0].id), ordemDe(antes[1].id)], [0, 1, 3]);
  assert.deepStrictEqual(depois.slice(3), antes.slice(3), 'as que nao vieram na lista mudaram');
  assert.deepStrictEqual((await clausulas(outra))[0], daOutra, 'a clausula da outra proposta mudou');
  assert.deepStrictEqual(await logs(pid, 'clausula_reordenada'), [{ tipo: 'clausula_reordenada', valor_novo: JSON.stringify(nova) }]);
  const [s4, x4] = await responde('PUT', `/propostas/${pid}/clausulas/reordenar`, { ordem: 'x' });
  assert.deepStrictEqual([s4, x4], [400, { error: 'ordem deve ser um array de IDs' }]);
});

test('[RN-147.06] a leitura da ordem atual falha: 500 "A ordem não foi alterada" e nada muda (reboot com a falha injetada)', async () => {
  const pid = await propostaInicializada('Ord leitura');
  const antes = await clausulas(pid);
  await descer();
  ctx.T = await subir({ FALHA_SQL_INJETADA: '^SELECT id, ordem FROM proposta_clausulas WHERE proposta_id = \\?', FALHA_SQL_METODOS: 'all', FALHA_SQL_MSG: 'falha da leitura' });
  try {
    const [s, x] = await responde('PUT', `/propostas/${pid}/clausulas/reordenar`, { ordem: antes.map((c) => c.id).reverse() });
    assert.deepStrictEqual([s, x], [500, { error: ORD_LEITURA('falha da leitura') }]);
    await pausa(200);
    assert.deepStrictEqual(await clausulas(pid), antes);
    assert.ok(/\[falha injetada\] SELECT id, ordem FROM proposta_clausulas/.test(fs.readFileSync(logArq, 'utf8')), 'a falha injetada nao casou com a leitura (o teste nao provou nada)');
  } finally {
    await descer();
    ctx.T = await subir();
  }
});

// ── Fase 2 I-3 e I-5: o erro de banco ao escolher o modelo, e o SQLITE_BUSY (reboots com a falha injetada) ─────────────────
const BUSY = 'SQLITE_BUSY: database is locked';
const CORPO_503 = { error: 'Banco temporariamente ocupado. Tente novamente em alguns segundos.', code: 'SQLITE_BUSY', retryAfter: 3, context: 'propostas:clausulas' };
async function comFalha(env, fn) {
  await descer();
  ctx.T = await subir(env);
  try { await fn(); } finally { await descer(); ctx.T = await subir(); }
}

test('[RN-147.05, Fase 2 I-3] o erro de banco ao escolher o modelo de contrato: 500 "Nenhuma clausula foi gravada" e nada fica (antes copiava o padrao calado)', async () => {
  const pid = await proposta('Ini modelo falha');
  await comFalha({ FALHA_SQL_INJETADA: 'FROM clausulas_modelo WHERE is_padrao', FALHA_SQL_METODOS: 'get', FALHA_SQL_MSG: 'falha do modelo' }, async () => {
    const [s, x] = await responde('POST', `/propostas/${pid}/clausulas/inicializar`);
    assert.deepStrictEqual([s, x], [500, { error: INI_NADA('falha do modelo') }]);
    await pausa(200);
    assert.deepStrictEqual(await clausulas(pid), []);
    assert.ok(/\[falha injetada\] SELECT id FROM clausulas_modelo/.test(fs.readFileSync(logArq, 'utf8')), 'a falha injetada nao casou');
  });
  // e a leitura das clausulas do modelo (o segundo passo) falhando: o mesmo
  await comFalha({ FALHA_SQL_INJETADA: 'FROM clausulas_modelo_itens WHERE modelo_id', FALHA_SQL_METODOS: 'all', FALHA_SQL_MSG: 'falha dos itens do modelo' }, async () => {
    const [s, x] = await responde('POST', `/propostas/${pid}/clausulas/inicializar`);
    assert.deepStrictEqual([s, x], [500, { error: INI_NADA('falha dos itens do modelo') }]);
    await pausa(200);
    assert.deepStrictEqual(await clausulas(pid), []);
  });
});

test('[RN-147.05/06, Fase 2 I-5] SQLITE_BUSY: na 3a clausula do inicializar (as 2 gravadas saem) e na leitura do reordenar -> 503 (o client repete)', async () => {
  const pid = await proposta('Ini busy');
  const pOrd = await propostaInicializada('Ord busy');
  const antes = await clausulas(pOrd);
  await comFalha({ FALHA_SQL_INJETADA: '^INSERT INTO proposta_clausulas', FALHA_SQL_METODOS: 'run', FALHA_SQL_PULAR: '2', FALHA_SQL_MSG: BUSY }, async () => {
    const [s, x] = await responde('POST', `/propostas/${pid}/clausulas/inicializar`);
    assert.deepStrictEqual([s, x], [503, CORPO_503]);
    await pausa(200);
    assert.deepStrictEqual(await clausulas(pid), [], 'as duas gravadas antes do BUSY ficaram');
  });
  await comFalha({ FALHA_SQL_INJETADA: '^SELECT id, ordem FROM proposta_clausulas WHERE proposta_id = \\?', FALHA_SQL_METODOS: 'all', FALHA_SQL_MSG: BUSY }, async () => {
    const [s, x] = await responde('PUT', `/propostas/${pOrd}/clausulas/reordenar`, { ordem: antes.map((c) => c.id).reverse() });
    assert.deepStrictEqual([s, x], [503, CORPO_503]);
    assert.deepStrictEqual(await clausulas(pOrd), antes);
  });
});

// ── Fase 5 (r3 R12/R13/R14, r1 M-2) ──────────────────────────────────────────────────────────────────────────────────────
test('[RN-147.05, Fase 5 r3 R14] o erro na 2a consulta do modelo (os itens x familias da proposta): 500 "Nenhuma" e nada fica', async () => {
  const pid = await proposta('Ini itens falha');
  await comFalha({ FALHA_SQL_INJETADA: 'FROM proposta_itens pi', FALHA_SQL_METODOS: 'all', FALHA_SQL_MSG: 'falha dos itens x familias' }, async () => {
    const [s, x] = await responde('POST', `/propostas/${pid}/clausulas/inicializar`);
    assert.deepStrictEqual([s, x], [500, { error: INI_NADA('falha dos itens x familias') }]);
    await pausa(200);
    assert.deepStrictEqual(await clausulas(pid), []);
    assert.ok(/\[falha injetada\] SELECT DISTINCT f\.clausulas_modelo_id/.test(fs.readFileSync(logArq, 'utf8')), 'a falha injetada nao casou');
  });
});

test('[RN-147.05/06, Fase 5 r3 R12/R13] BUSY com o desfazer FALHANDO nao vira 503 (o client repetiria em cima da metade): 500 com a frase', async () => {
  // inicializar: BUSY na 3a + a limpeza recusada pelo gatilho -> 500 "parte"
  const pid = await proposta('Ini busy limpeza');
  await alvo(pid, 'delete');
  await comFalha({ FALHA_SQL_INJETADA: '^INSERT INTO proposta_clausulas', FALHA_SQL_METODOS: 'run', FALHA_SQL_PULAR: '2', FALHA_SQL_MSG: BUSY }, async () => {
    const [s, x] = await responde('POST', `/propostas/${pid}/clausulas/inicializar`);
    assert.deepStrictEqual([s, x], [500, { error: INI_PARTE(BUSY) }]);
    await pausa(200);
    assert.deepStrictEqual((await clausulas(pid)).map((c) => c.ordem), [0, 1], 'as duas gravadas antes do BUSY');
  });
  // reordenar: BUSY no 3o UPDATE em diante (a devolucao tambem cai) -> 500 "misturada"
  const pOrd = await propostaInicializada('Ord busy devolucao');
  const antes = await clausulas(pOrd);
  await comFalha({ FALHA_SQL_INJETADA: '^UPDATE proposta_clausulas SET ordem', FALHA_SQL_METODOS: 'run', FALHA_SQL_PULAR: '2', FALHA_SQL_MSG: BUSY }, async () => {
    const [s, x] = await responde('PUT', `/propostas/${pOrd}/clausulas/reordenar`, { ordem: antes.map((c) => c.id).reverse() });
    assert.deepStrictEqual([s, x], [500, { error: ORD_MISTURADA(BUSY) }]);
  });
});

test('[RN-147.06, Fase 5 r1 M-2] ids escritos como texto ("6.0", " 5") que o banco casa: a devolucao os acha e a ordem de antes fica', async () => {
  const pid = await propostaInicializada('Ord ids texto');
  const antes = await clausulas(pid);
  const [a, b, c] = antes.slice(-3).reverse();
  await alvo(pid, 'ordem2');
  const [s, x] = await responde('PUT', `/propostas/${pid}/clausulas/reordenar`, { ordem: [`${a.id}.0`, ` ${b.id}`, c.id] });
  assert.deepStrictEqual([s, x], [500, { error: ORD_MANTIDA(GATILHO) }]);
  await pausa(200);
  assert.deepStrictEqual(await clausulas(pid), antes, 'as duas que mudaram (pelo texto) nao voltaram');
  // a metade positiva: sem a falha, os mesmos ids em texto gravam a ordem nova
  await semAlvo(pid);
  const [s2] = await responde('PUT', `/propostas/${pid}/clausulas/reordenar`, { ordem: [`${a.id}.0`, ` ${b.id}`, c.id] });
  assert.strictEqual(s2, 200);
  const depois = await clausulas(pid);
  assert.deepStrictEqual([a, b, c].map((k) => depois.find((d) => d.id === k.id).ordem), [0, 1, 2]);
});

// ── Etapa 148 (C342, RN-148.05): a proposta que nao existe ────────────────────────────────────────────────────────────────
const NAO_ENCONTRADA = { error: 'Proposta não encontrada' };
const logsDoId = (pid) => all('SELECT tipo FROM proposta_edicoes_log WHERE proposta_id = ?', [pid]);

test('[RN-148.05, C342] inicializar e reordenar de uma proposta que nao existe: 404 "Proposta não encontrada", nada gravado e nenhum log de edicao', async () => {
  const fantasma = (await all('SELECT COALESCE(MAX(id), 0) + 1000 AS id FROM propostas'))[0].id;
  const [s1, x1] = await responde('POST', `/propostas/${fantasma}/clausulas/inicializar`);
  const [s2, x2] = await responde('PUT', `/propostas/${fantasma}/clausulas/reordenar`, { ordem: [1, 2, 3] });
  assert.deepStrictEqual([s1, x1, s2, x2], [404, NAO_ENCONTRADA, 404, NAO_ENCONTRADA]);
  await pausa(300);
  assert.deepStrictEqual(await clausulas(fantasma), []);
  assert.deepStrictEqual(await logsDoId(fantasma), [], 'o reordenar de antes gravava o log de uma proposta que nao existe');
  // a validacao do corpo continua antes da conferencia (sem leitura do banco)
  const [s3, x3] = await responde('PUT', `/propostas/${fantasma}/clausulas/reordenar`, { ordem: 'x' });
  assert.deepStrictEqual([s3, x3], [400, { error: 'ordem deve ser um array de IDs' }]);
});

test('[RN-148.05, B968] a metade positiva: a proposta INATIVA existe — inicializar copia as clausulas e reordenar grava, como antes', async () => {
  const pid = await proposta('Inativa 148');
  await run('UPDATE propostas SET ativo = 0 WHERE id = ?', [pid]);
  const [s, x] = await responde('POST', `/propostas/${pid}/clausulas/inicializar`);
  assert.deepStrictEqual([s, x && x.total], [200, N_DEFAULT], JSON.stringify(x));
  const antes = await clausulas(pid);
  const nova = antes.map((c) => c.id).reverse();
  const [s2, x2] = await responde('PUT', `/propostas/${pid}/clausulas/reordenar`, { ordem: nova });
  assert.deepStrictEqual([s2, x2], [200, { ok: true }]);
  const depois = await clausulas(pid);
  assert.deepStrictEqual(nova.map((id) => depois.find((d) => d.id === id).ordem), nova.map((_, i) => i));
});

test('[RN-148.05] o erro ao ler a proposta: inicializar 500 "Nenhuma clausula foi gravada", reordenar 500 "A ordem não foi alterada"; no BUSY, 503', async () => {
  const pid = await proposta('Ler proposta falha');
  const pOrd = await propostaInicializada('Ler proposta falha ord');
  const antes = await clausulas(pOrd);
  const FALHA = 'proposta_das_clausulas FROM propostas';
  await comFalha({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'get', FALHA_SQL_MSG: 'falha da proposta' }, async () => {
    const [s1, x1] = await responde('POST', `/propostas/${pid}/clausulas/inicializar`);
    const [s2, x2] = await responde('PUT', `/propostas/${pOrd}/clausulas/reordenar`, { ordem: antes.map((c) => c.id).reverse() });
    assert.deepStrictEqual([s1, x1, s2, x2], [500, { error: INI_NADA('falha da proposta') }, 500, { error: ORD_LEITURA('falha da proposta') }]);
    assert.ok(/\[falha injetada\] SELECT id AS proposta_das_clausulas/.test(fs.readFileSync(logArq, 'utf8')), 'a falha injetada nao casou com a conferencia (o teste nao provou nada)');
    await pausa(200);
    assert.deepStrictEqual([await clausulas(pid), await clausulas(pOrd)], [[], antes]);
  });
  await comFalha({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'get', FALHA_SQL_MSG: BUSY }, async () => {
    const [s1, x1] = await responde('POST', `/propostas/${pid}/clausulas/inicializar`);
    const [s2, x2] = await responde('PUT', `/propostas/${pOrd}/clausulas/reordenar`, { ordem: antes.map((c) => c.id).reverse() });
    assert.deepStrictEqual([s1, x1, s2, x2], [503, CORPO_503, 503, CORPO_503]);
    assert.deepStrictEqual([await clausulas(pid), await clausulas(pOrd)], [[], antes]);
  });
});

(async () => {
  console.log('\n=== Etapa 147 (propostas): as clausulas da proposta gravam uma por uma e conferem o erro (C327) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e147-clausulas-'));
    ctx.T = await subir();
    abrirCru();
    const [sc, c] = await j('POST', '/clientes', ctx.T, { razao_social: 'Cli 147', cnpj: '11.222.333/0001-71', email: 'a@a.com' });
    assert.strictEqual(sc, 200, JSON.stringify(c));
    ctx.clienteId = c.id;
    MODELO_PADRAO = (await all('SELECT id FROM clausulas_modelo WHERE is_padrao = 1 AND ativo = 1 ORDER BY id ASC LIMIT 1'))[0].id;
    const doPadrao = await all('SELECT numero, titulo FROM clausulas_modelo_itens WHERE modelo_id = ? ORDER BY ordem ASC', [MODELO_PADRAO]);
    N_DEFAULT = doPadrao.length; TITULOS_PADRAO = doPadrao.map((c) => `${c.numero} ${c.titulo}`);
    assert.ok(N_DEFAULT >= 6, `o padrao tem ${N_DEFAULT} clausulas`);
    // os gatilhos: so na proposta-alvo e na fase marcada
    await run('CREATE TABLE e147_alvo (proposta_id INTEGER, fase TEXT)');
    await run("CREATE TRIGGER e147_falha_insert BEFORE INSERT ON proposta_clausulas WHEN NEW.ordem = 3 AND EXISTS (SELECT 1 FROM e147_alvo WHERE proposta_id = NEW.proposta_id AND fase = 'insert') BEGIN SELECT RAISE(ABORT, 'falha do gatilho'); END;");
    await run("CREATE TRIGGER e147_falha_delete BEFORE DELETE ON proposta_clausulas WHEN EXISTS (SELECT 1 FROM e147_alvo WHERE proposta_id = OLD.proposta_id AND fase = 'delete') BEGIN SELECT RAISE(ABORT, 'falha do gatilho'); END;");
    await run("CREATE TRIGGER e147_falha_ordem BEFORE UPDATE OF ordem ON proposta_clausulas WHEN EXISTS (SELECT 1 FROM e147_alvo WHERE proposta_id = NEW.proposta_id AND fase = 'ordem' || NEW.ordem) BEGIN SELECT RAISE(ABORT, 'falha do gatilho'); END;");
    // controle dos gatilhos: por fora, com o alvo marcado, o INSERT da ordem 3 e o UPDATE para a ordem 2 falham; sem o alvo, passam
    const pc = await proposta('Controle');
    await alvo(pc, 'insert'); await alvo(pc, 'ordem2');
    const falha = async (sql, p) => { try { await run(sql, p); return false; } catch (e) { return /falha do gatilho/.test(e.message); } };
    assert.ok(await falha("INSERT INTO proposta_clausulas (proposta_id, ordem, titulo, conteudo) VALUES (?, 3, 't', 'c')", [pc]), 'o gatilho do INSERT nao falha');
    const ok = await run("INSERT INTO proposta_clausulas (proposta_id, ordem, titulo, conteudo) VALUES (?, 1, 't', 'c')", [pc]);
    assert.ok(await falha('UPDATE proposta_clausulas SET ordem = 2 WHERE id = ?', [ok.lastID]), 'o gatilho do UPDATE nao falha');
    await semAlvo(pc);
    await run('UPDATE proposta_clausulas SET ordem = 2 WHERE id = ?', [ok.lastID]);
    await run('DELETE FROM proposta_clausulas WHERE proposta_id = ?', [pc]);
    for (const [name, fn] of testes) {
      if (saiu !== null) { failed++; console.error(`  ✗ ${name}: o servidor caiu antes (codigo ${saiu})`); continue; }
      try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
        failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`);
      }
    }
  } catch (e) { failed++; console.error('  ✗ preparo:', e.message); }
  if (cru) await new Promise((r) => cru.close(() => r()));
  await descer();
  try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
