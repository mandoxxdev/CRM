/**
 * Proposta em dolar ou euro (25/11/2026: "essa proposta eu coloquei em dolar e aqui esta em real, e no dash subiu em real, tem que ter um
 * fator de conversao de moeda"). O Banco Central trocado por um servidor HTTP falso (CAMBIO_PTAX_URL): USD 6,0; EUR 7,0.
 *
 *   MO-01 GET /api/cambio: a cotacao do dia para o cadastro; moeda invalida = 400
 *   MO-02 salvar em USD com a cotacao digitada grava ela; sem cotacao, grava a do dia; em BRL, nenhuma
 *   MO-03 trocar a moeda para BRL (PUT) limpa a cotacao
 *   MO-04 o painel soma em REAIS pela cotacao de cada proposta (antes somava o numero cru)
 *
 * Executar: cd server && node tests/api/propostaEmDolar.api.test.js
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

let porta; let filho = null; let saiu = null;
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'moeda-'));
const SEED = { email: 'mdseed@t.com', senha: 'MdSeed!senha123' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function req(m, u, tok, body) {
  const r = await fetch(`http://127.0.0.1:${porta}/api${u}`, {
    method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000),
  });
  let json = null; try { json = await r.json(); } catch (e) { /* sem corpo */ }
  return { status: r.status, json };
}
function portaLivre() {
  return new Promise((res, rej) => { const s = net.createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}
async function subir() {
  const logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET', 'API_URL', 'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'RATE_LIMIT_WINDOW_MS', 'TZ', 'RELOGIO_ADIANTADO_MS']) delete env[k];
  Object.assign(env, { CAMBIO_PTAX_URL: `http://127.0.0.1:${portaFalso}/ptax`, CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha, RATE_LIMIT_MAX: '100000' });
  const out = fs.openSync(logArq, 'a');
  filho = spawn(process.execPath, ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js'), 'index.js'], { cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true });
  filho.on('exit', (code) => { saiu = code; });
  const fim = Date.now() + 180000;
  while (Date.now() < fim) {
    if (saiu !== null) throw new Error(`o index.js saiu cedo (codigo ${saiu})`);
    try {
      const r = await req('POST', '/auth/login', null, SEED);
      if (r.status === 200 && r.json && r.json.token) {
        const ate = Date.now() + 30000;
        while (Date.now() < ate && !/Banco de dados totalmente inicializado/.test(fs.readFileSync(logArq, 'utf8'))) await pausa(200);
        await pausa(1500);
        return r.json.token;
      }
    } catch (e) { /* ainda subindo */ }
    await pausa(300);
  }
  throw new Error('o index.js nao ficou pronto em 180 s');
}
let arquivo;
const run = (sql, p = []) => new Promise((res, rej) => arquivo.run(sql, p, function feito(e) { if (e) rej(e); else res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => arquivo.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
let n = 0;
async function inserir(tabela, campos) {
  const cols = await all(`PRAGMA table_info(${tabela})`);
  const dados = { ...campos };
  for (const c of cols) {
    if (c.pk || !c.notnull || c.dflt_value !== null || c.name in dados) continue;
    dados[c.name] = /INT|REAL|NUM/i.test(c.type) ? 1 : `da-${++n}`;
  }
  const k = Object.keys(dados);
  return (await run(`INSERT INTO ${tabela} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`, Object.values(dados))).lastID;
}

const http = require('http');
let portaFalso;
const ptax = http.createServer((rq, rs) => {
  const moeda = /moeda=%27(\w+)%27/.exec(rq.url);
  const valor = moeda && moeda[1] === 'EUR' ? 7 : 6;
  rs.writeHead(200, { 'Content-Type': 'application/json' });
  rs.end(JSON.stringify({ value: [{ cotacaoVenda: valor, dataHoraCotacao: '2026-11-24 13:07:40.4', tipoBoletim: 'Fechamento' }] }));
});

let token; let cli;
const nova = async (extra) => {
  const r = await req('POST', '/propostas', token, { cliente_id: cli, titulo: 'PROPOSTA MOEDA', valor_total: 1000, status: 'rascunho', itens: [], ...extra });
  assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.json));
  return r.json.id;
};
const taxa = async (id) => (await all('SELECT taxa_cambio FROM propostas WHERE id = ?', [id]))[0].taxa_cambio;

test('MO-01 GET /api/cambio', async () => {
  portaFalso = await new Promise((r) => ptax.listen(0, '127.0.0.1', () => r(ptax.address().port)));
  token = await subir();
  arquivo = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  arquivo.configure('busyTimeout', 15000);
  cli = await inserir('clientes', { razao_social: 'ETEX PERU', nome_fantasia: 'ETEX', status: 'ativo' });
  const r = await req('GET', '/cambio?moeda=EUR', token);
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(r.json.valor, 7);
  assert.strictEqual((await req('GET', '/cambio?moeda=XYZ', token)).status, 400);
});

let pDigitada; let pDoDia; let pReal;
test('MO-02 a cotacao digitada; sem ela, a do dia; em BRL, nenhuma', async () => {
  pDigitada = await nova({ moeda: 'USD', taxa_cambio: '5,5' });
  pDoDia = await nova({ moeda: 'USD', taxa_cambio: '' });
  pReal = await nova({ moeda: 'BRL', taxa_cambio: '9' });
  assert.strictEqual(await taxa(pDigitada), 5.5);
  assert.strictEqual(await taxa(pDoDia), 6);
  assert.strictEqual(await taxa(pReal), null);
});

test('MO-03 trocar para BRL limpa a cotacao', async () => {
  const id = await nova({ moeda: 'EUR' });
  assert.strictEqual(await taxa(id), 7);
  const r = await req('PUT', `/propostas/${id}`, token, { cliente_id: cli, titulo: 'PROPOSTA MOEDA', valor_total: 1000, status: 'rascunho', moeda: 'BRL' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(await taxa(id), null);
});

test('MO-04 o painel soma em reais pela cotacao de cada proposta', async () => {
  await run("UPDATE propostas SET status = 'aprovada'");
  const r = await req('GET', '/dashboard', token);
  // 1000 x 5,5 + 1000 x 6 + 1000 (BRL) + 1000 (a do MO-03, agora BRL) = 13500 (antes: 4000)
  assert.strictEqual(r.json.valorTotalPropostasAprovadas, 13500, JSON.stringify(r.json.valorTotalPropostasAprovadas));
  const v = await req('GET', '/dashboard/vendas', token);
  assert.strictEqual(v.json.pipeline.valorPorEtapa.Aprovadas, 13500);
});

// 25/11/2026 ("la no painel ... fica aparecendo em real"): o painel diz quanto do periodo veio em dolar/euro e por quanto entrou,
// e conta a proposta sem cotacao (que entra 1 para 1).
test('MO-05 o painel informa as propostas em outra moeda (valor, em reais, sem cotacao)', async () => {
  const semCotacao = await nova({ moeda: 'USD', taxa_cambio: '5' });
  await run("UPDATE propostas SET taxa_cambio = NULL, status = 'enviada' WHERE id = ?", [semCotacao]);
  const r = await req('GET', '/dashboard', token);
  const usd = (r.json.propostasEmOutraMoeda || []).find((o) => o.moeda === 'USD');
  assert.ok(usd, JSON.stringify(r.json.propostasEmOutraMoeda));
  // pDigitada (1000 x 5,5) + pDoDia (1000 x 6) aprovadas + a sem cotacao (1000 x 1)
  assert.deepStrictEqual({ propostas: usd.propostas, valor: usd.valor, em_reais: usd.em_reais, sem_cotacao: usd.sem_cotacao, aprovadas_valor: usd.aprovadas_valor },
    { propostas: 3, valor: 3000, em_reais: 12500, sem_cotacao: 1, aprovadas_valor: 2000 });
  assert.ok(!(r.json.propostasEmOutraMoeda || []).some((o) => o.moeda === 'BRL'), 'o real nao e "outra moeda"');
  // o total aprovado nao mudou: a sem cotacao esta enviada
  assert.strictEqual(r.json.valorTotalPropostasAprovadas, 13500);
});

(async () => {
  for (const [nome, fn] of testes) {
    try { await fn(); passed++; console.log('  ✓ ' + nome); } catch (e) { failed++; console.log('  ✗ ' + nome + '\n      ' + (e && e.message)); }
  }
  if (filho && saiu === null) { const morreu = new Promise((r) => filho.once('exit', r)); filho.kill(); await Promise.race([morreu, pausa(10000)]); }
  ptax.close();
  try { if (arquivo) arquivo.close(); fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
