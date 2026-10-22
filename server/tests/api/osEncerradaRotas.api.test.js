/**
 * Etapa 171 (T3, M1) — a fiacao da RN-171.09 e da RN-171.10 no `index.js` de verdade (pasta vazia), por spawn.
 *
 *   RN-171.09  PUT /api/operacional/ordens-servico/:id que leva a OS para o conjunto fechado responde `reservas_liberadas` e solta a
 *              reserva da OS; a OS que ja estava fechada nao solta de novo; status aberto responde 0.
 *   RN-171.10  DELETE da OS com pedido de compra vinculado -> 409 literal (varios pedidos separados por virgula), a OS fica;
 *              sem pedido -> 200 como hoje.
 *   cadeia     PUT e DELETE continuam `authenticateToken, checkModulePermission('operacional')` (a 171 nao mexe no portao; o
 *              familiasListaOsPortao.api.test.js os lista como rotas de outras etapas no prefixo).
 *
 * A regra fina (predicado, motivo, redistribuicao) e do osEncerradaLiberaCompra.api.test.js, no harness.
 * Molde: familiasListaOsPortao.api.test.js. Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa171-pedido-de-compra-vinculado-a-os.md
 * Executar: cd server && node tests/api/osEncerradaRotas.api.test.js
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
async function j(m, u, tok, body) {
  const headers = { ...(tok ? { Authorization: 'Bearer ' + tok } : {}) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(`http://127.0.0.1:${porta}/api${u}`, { method: m, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  let x = await r.text(); try { x = JSON.parse(x); } catch (e) { /* sem JSON */ }
  return [r.status, x];
}
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e171osseed@t.com', senha: 'E171osseed!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir() {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET', 'API_URL',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'FALHA_SQL_MSG', 'FALHA_SQL_METODOS', 'FALHA_SQL_PULAR', 'FALHA_SQL_MSGS', 'PROPOSTAS_PORTAO_DE_MODULO', 'RATE_LIMIT_WINDOW_MS']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha, RATE_LIMIT_MAX: '100000' });
  const out = fs.openSync(logArq, 'a');
  saiu = null;
  filho = spawn(process.execPath, ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js'), 'index.js'], {
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

let banco = null;
const run = (sql, p = []) => new Promise((res, rej) => banco.run(sql, p, function feito(e) { if (e) rej(e); else res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => banco.get(sql, p, (e, r) => (e ? rej(e) : res(r))));

const ctx = { seq: 0 };
async function novaOs(status) {
  const numero = `OS-171R-${++ctx.seq}`;
  const id = (await run(`INSERT INTO ordens_servico (numero_os, tipo_os, status, data_abertura) VALUES (?, 'producao', ?, '2026-10-22')`,
    [numero, status])).lastID;
  return { id, numero };
}
// A reserva da OS como a T2 a cria (o predicado congelado), gravada por fora com o material prendendo o mesmo tanto.
async function materialComReservaDaOs(osId, q) {
  const mat = (await run(`INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_reservada, ativo)
    VALUES (?, ?, 'PC', ?, ?, 1)`, [`E171R-${++ctx.seq}`, `Mat 171R ${ctx.seq}`, q, q])).lastID;
  const rec = (await run("INSERT INTO recebimentos_material_almoxarifado (numero, status) VALUES (?, 'CONCLUIDO')", [`REC-171R-${ctx.seq}`])).lastID;
  const res = (await run(`INSERT INTO reservas_material_almoxarifado (material_id, quantidade, os_id, origem, status, recebimento_id, solicitante_id)
    VALUES (?, ?, ?, 'MANUAL', 'ATIVA', ?, 1)`, [mat, q, osId, rec])).lastID;
  return { mat, rec, res };
}
const corpoDaOs = (o, status) => ({ numero_os: o.numero, tipo_os: 'producao', status, data_abertura: '2026-10-22' });

const FONTE = fs.readFileSync(path.join(SERVER_DIR, 'index.js'), 'utf8');

test('[cadeia] PUT e DELETE da OS continuam authenticateToken + checkModulePermission(operacional) como 2o e 3o (unica linha de registro cada)', () => {
  for (const m of ['put', 'delete']) {
    const linhas = FONTE.split('\n').filter((l) => l.startsWith(`app.${m}('/api/operacional/ordens-servico/:id',`));
    assert.deepStrictEqual(linhas, [`app.${m}('/api/operacional/ordens-servico/:id', authenticateToken, checkModulePermission('operacional'), (req, res) => {`]);
  }
});

test('[RN-171.09] PUT que cancela a OS responde reservas_liberadas: 1 e solta a reserva da OS (LIBERADA, os_id e motivo; o material volta ao livre)', async () => {
  const o = await novaOs('em_andamento');
  const { mat, res } = await materialComReservaDaOs(o.id, 10);
  const [s, x] = await j('PUT', `/operacional/ordens-servico/${o.id}`, ctx.T, corpoDaOs(o, 'cancelado'));
  assert.strictEqual(s, 200, JSON.stringify(x));
  assert.deepStrictEqual(x, { message: 'Ordem de Serviço atualizada com sucesso', reservas_liberadas: 1 });
  const r = await get('SELECT status, os_id, motivo_liberacao FROM reservas_material_almoxarifado WHERE id = ?', [res]);
  assert.deepStrictEqual({ ...r }, { status: 'LIBERADA', os_id: o.id, motivo_liberacao: `OS ${o.numero} cancelado — material volta ao estoque` });
  assert.strictEqual(Number((await get('SELECT quantidade_reservada r FROM materiais_almoxarifado WHERE id = ?', [mat])).r), 0);
  assert.strictEqual((await get('SELECT status FROM ordens_servico WHERE id = ?', [o.id])).status, 'cancelado');
});

test('[RN-171.09, C2] PUT que conclui (concluida) tambem solta', async () => {
  const o = await novaOs('pendente');
  const { res } = await materialComReservaDaOs(o.id, 3);
  const [s, x] = await j('PUT', `/operacional/ordens-servico/${o.id}`, ctx.T, corpoDaOs(o, 'concluida'));
  assert.deepStrictEqual([s, x.reservas_liberadas], [200, 1], JSON.stringify(x));
  assert.strictEqual((await get('SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [res])).status, 'LIBERADA');
});

test('[RN-171.09] OS ja cancelada -> cancelado: reservas_liberadas 0, a reserva fica ATIVA (so a transicao solta)', async () => {
  const o = await novaOs('cancelada');
  const { res } = await materialComReservaDaOs(o.id, 2);
  const [s, x] = await j('PUT', `/operacional/ordens-servico/${o.id}`, ctx.T, corpoDaOs(o, 'cancelado'));
  assert.deepStrictEqual([s, x], [200, { message: 'Ordem de Serviço atualizada com sucesso', reservas_liberadas: 0 }]);
  assert.strictEqual((await get('SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [res])).status, 'ATIVA');
});

test('[RN-171.09] pendente -> em_andamento: reservas_liberadas 0, nada solta', async () => {
  const o = await novaOs('pendente');
  const { res } = await materialComReservaDaOs(o.id, 2);
  const [s, x] = await j('PUT', `/operacional/ordens-servico/${o.id}`, ctx.T, corpoDaOs(o, 'em_andamento'));
  assert.deepStrictEqual([s, x.reservas_liberadas], [200, 0]);
  assert.strictEqual((await get('SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [res])).status, 'ATIVA');
});

test('[RN-171.09] PUT de OS inexistente continua 404 (a leitura do status anterior nao muda isso)', async () => {
  const [s, x] = await j('PUT', '/operacional/ordens-servico/987654', ctx.T, { numero_os: 'NAO-EXISTE-171', tipo_os: 'producao', status: 'cancelado', data_abertura: '2026-10-22' });
  assert.deepStrictEqual([s, x], [404, { error: 'Ordem de Serviço não encontrada' }]);
});

test('[RN-171.10] DELETE da OS com dois pedidos de compra -> 409 literal com os numeros, e a OS fica', async () => {
  const o = await novaOs('pendente');
  const forn = (await run("INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('F171R', '17100000000271', 'ativo')")).lastID;
  await run('INSERT INTO pedidos_compra (numero, fornecedor_id, os_id) VALUES (?, ?, ?)', ['PC-171R-1', forn, o.id]);
  await run('INSERT INTO pedidos_compra (numero, fornecedor_id, os_id) VALUES (?, ?, ?)', ['PC-171R-2', forn, o.id]);
  const [s, x] = await j('DELETE', `/operacional/ordens-servico/${o.id}`, ctx.T);
  assert.deepStrictEqual([s, x], [409, { error: `A OS ${o.numero} tem pedido de compra vinculado (PC-171R-1, PC-171R-2) — cancele a OS em vez de excluir` }]);
  assert.ok(await get('SELECT id FROM ordens_servico WHERE id = ?', [o.id]), 'a OS continua');
});

test('[RN-171.10] DELETE da OS sem pedido -> 200 como hoje; de novo -> 404', async () => {
  const o = await novaOs('pendente');
  assert.deepStrictEqual(await j('DELETE', `/operacional/ordens-servico/${o.id}`, ctx.T), [200, { message: 'Ordem de Serviço excluída com sucesso' }]);
  assert.strictEqual(await get('SELECT id FROM ordens_servico WHERE id = ?', [o.id]), undefined);
  assert.deepStrictEqual(await j('DELETE', `/operacional/ordens-servico/${o.id}`, ctx.T), [404, { error: 'Ordem de Serviço não encontrada' }]);
});

(async () => {
  console.log('\n=== Etapa 171 (T3): a fiacao da OS encerrada e da exclusao no index.js ===\n');
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e171-os-'));
  try {
    ctx.T = await subir();
    banco = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
    banco.configure('busyTimeout', 15000);
    for (const [name, fn] of testes) {
      try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
    }
  } catch (e) {
    failed++; console.error(`  ✗ subida: ${e.message}`);
    try { console.error(fs.readFileSync(logArq, 'utf8').split('\n').slice(-30).join('\n')); } catch (x) { /* sem log */ }
  } finally {
    if (banco) await new Promise((r) => banco.close(r));
    await descer();
    try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura */ }
  }
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})();
