/**
 * Etapa 156 (Comercial) — a consulta de endereco ao servico de mapas tem prazo, e a coordenada pela cidade acha a cidade do cadastro.
 *
 *   RN-156.03  (C361, C371) o pedido ao servico de mapas tem prazo (NOMINATIM_PRAZO_MS, padrao 5000), contado do pedido inteiro; esgotado,
 *              a coordenada sai pela cidade. Resposta nao 200, corpo nao JSON e lista vazia tambem. NOMINATIM_URL troca o endereco. O termo
 *              vai com espacos (sem o `+` literal de antes).
 *   RN-156.04  (C370) a cidade sem caixa, sem acento e sem espaco nas pontas, e so a do estado informado (a lista tem a UF de cada cidade —
 *              Fase 5 r1 I-1: o raio de 1.000 km da Fase 2 deixava passar o homonimo de estado vizinho).
 *
 * O Nominatim de verdade NUNCA e chamado: a fronteira HTTP e um servidor local deste processo (o unitario chama o servico direto; a
 * integracao sobe o `index.js` com NOMINATIM_URL apontando para ele).
 *
 * Plano: docs/superpowers/plans/2026-10-19-almoxarifado-etapa156-repeticao-listas-recusadas-e-prazo-do-mapa.md
 * Executar: cd server && node tests/api/coordenadasPrazo.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
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

// ── a fronteira HTTP: um servidor local que faz o papel do servico de mapas ─────────────────────
const fronteira = { modo: 'responde', pedidos: [], sockets: new Set(), lat: '-1.5', lon: '-2.5' };
const servidorDeMapas = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  fronteira.pedidos.push({ caminho: u.pathname, params: Object.fromEntries(u.searchParams), ua: req.headers['user-agent'] });
  const m = fronteira.modo;
  if (m === 'pendura') return; // aceita e nunca responde
  if (m === 'pinga') { // manda o cabecalho e um byte a cada 50 ms, para sempre
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('[');
    const t = setInterval(() => { try { res.write(' '); } catch (e) { clearInterval(t); } }, 50);
    res.on('close', () => clearInterval(t));
    return;
  }
  // o 429 com um corpo de coordenada: a resposta que nao e 200 nao vale, mesmo parecendo valida
  if (m === '429') { res.writeHead(429, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify([{ lat: '-9', lon: '-9' }])); }
  if (m === 'html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html>nao e json</html>'); }
  if (m === 'vazio') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('[]'); }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify([{ lat: fronteira.lat, lon: fronteira.lon, display_name: 'X' }]));
});
servidorDeMapas.on('connection', (s) => { fronteira.sockets.add(s); s.on('close', () => fronteira.sockets.delete(s)); });
let urlDaFronteira;

const CAMPINAS = [-22.9056, -47.0608];
const CENTRO_SP = [-23.55, -46.63];
const SBC = [-23.715, -46.555];

function comEnv(vars, fn) {
  const antes = {};
  for (const k of Object.keys(vars)) { antes[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; }
  const volta = () => { for (const k of Object.keys(antes)) { if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k]; } };
  try {
    const r = fn();
    if (r && typeof r.then === 'function') return r.finally(volta);
    volta();
    return r;
  } catch (e) { volta(); throw e; }
}
const coordenadas = require('../../services/coordenadas');
const geocodificar = (vars) => comEnv({ NOMINATIM_URL: urlDaFronteira, NOMINATIM_PRAZO_MS: '300', ...vars },
  () => coordenadas.geocodificarEndereco('Rua das   Flores 10', 'CAMPINAS', 'SP'));
// o servico sem prazo pendura para sempre: a corrida de 4 s faz a falha sair legivel, nao como teste que nunca termina
async function cronometrado(p) {
  const t0 = Date.now();
  const v = await Promise.race([p, pausa(4000).then(() => 'TRAVOU (sem prazo)')]);
  return [v, Date.now() - t0];
}

// ── unitario: o servico, contra a fronteira local ───────────────────────────────────────────────
test('[RN-156.03] o servico pendurado: null no prazo (300 ms), nao nos 30 s do client', async () => {
  fronteira.modo = 'pendura'; fronteira.pedidos = [];
  const [v, ms] = await cronometrado(geocodificar());
  assert.strictEqual(v, null);
  assert.ok(ms >= 280 && ms < 1300, `levou ${ms} ms`);
  assert.strictEqual(fronteira.pedidos.length, 1, 'o pedido nao chegou a fronteira (o teste nao provaria nada)');
  // (Fase 5 r3 S5) o prazo aborta o pedido: a conexao com o servico de mapas nao fica aberta
  await pausa(150);
  assert.strictEqual(fronteira.sockets.size, 0, `ficaram ${fronteira.sockets.size} conexoes abertas com o servico de mapas`);
});

test('[RN-156.03, Fase 5 r3 S6] a consulta que respondeu nao dispara o prazo depois (nenhum aviso de "nao respondeu")', async () => {
  fronteira.modo = 'responde'; fronteira.lat = '-1.5'; fronteira.lon = '-2.5';
  const avisos = [];
  const warn = console.warn;
  console.warn = (...a) => { avisos.push(a.join(' ')); };
  try {
    assert.deepStrictEqual(await geocodificar(), [-1.5, -2.5]);
    await pausa(450); // passa do prazo de 300 ms
  } finally { console.warn = warn; }
  assert.deepStrictEqual(avisos.filter((x) => /nao respondeu/.test(x)), []);
  // a metade positiva: o pendurado avisa
  fronteira.modo = 'pendura';
  console.warn = (...a) => { avisos.push(a.join(' ')); };
  try { await geocodificar(); } finally { console.warn = warn; }
  assert.strictEqual(avisos.filter((x) => /nao respondeu em 300 ms/.test(x)).length, 1, JSON.stringify(avisos));
});

test('[RN-156.03] o prazo e do pedido inteiro: o servidor que pinga um byte a cada 50 ms tambem para no prazo', async () => {
  fronteira.modo = 'pinga'; fronteira.pedidos = [];
  const [v, ms] = await cronometrado(geocodificar());
  assert.strictEqual(v, null);
  assert.ok(ms >= 280 && ms < 1300, `levou ${ms} ms`);
  assert.strictEqual(fronteira.pedidos.length, 1);
});

test('[RN-156.03] 429, corpo nao JSON e lista vazia: null (a coordenada cai na cidade); a resposta: [lat, lon]', async () => {
  for (const modo of ['429', 'html', 'vazio']) {
    fronteira.modo = modo;
    assert.strictEqual(await geocodificar(), null, modo);
  }
  fronteira.modo = 'responde';
  assert.deepStrictEqual(await geocodificar(), [-1.5, -2.5]);
});

test('[RN-156.03, C371] o pedido: o termo com espacos (sem + literal, os repetidos viram um), format, limit, countrycodes e o User-Agent', async () => {
  fronteira.modo = 'responde'; fronteira.pedidos = [];
  await geocodificar();
  assert.strictEqual(fronteira.pedidos.length, 1);
  const p = fronteira.pedidos[0];
  assert.deepStrictEqual(p.params, { format: 'json', q: 'Rua das Flores 10, CAMPINAS, SP, Brasil', limit: '1', countrycodes: 'br' });
  assert.strictEqual(p.caminho, '/search');
  assert.strictEqual(p.ua, 'GMP-CRM/1.0');
});

test('[RN-156.03] as variaveis: o padrao e o Nominatim (lido, nao chamado); prazo invalido -> 5000; URL malformada ou ftp -> o padrao', () => {
  assert.strictEqual(coordenadas.NOMINATIM_PADRAO, 'https://nominatim.openstreetmap.org/search');
  comEnv({ NOMINATIM_URL: null }, () => assert.strictEqual(coordenadas.urlDoNominatim(), 'https://nominatim.openstreetmap.org/search'));
  comEnv({ NOMINATIM_URL: 'nao e url' }, () => assert.strictEqual(coordenadas.urlDoNominatim(), coordenadas.NOMINATIM_PADRAO));
  comEnv({ NOMINATIM_URL: 'ftp://x/search' }, () => assert.strictEqual(coordenadas.urlDoNominatim(), coordenadas.NOMINATIM_PADRAO));
  comEnv({ NOMINATIM_URL: 'http://127.0.0.1:9/search' }, () => assert.strictEqual(coordenadas.urlDoNominatim(), 'http://127.0.0.1:9/search'));
  for (const v of [null, '', 'abc', '-5', '0', '1.5']) comEnv({ NOMINATIM_PRAZO_MS: v }, () => assert.strictEqual(coordenadas.prazoDoNominatimMs(), 5000, String(v)));
  comEnv({ NOMINATIM_PRAZO_MS: ' 250 ' }, () => assert.strictEqual(coordenadas.prazoDoNominatimMs(), 250));
  // (Fase 5 r1 M-1) acima do maior atraso do setTimeout (2^31 - 1) ele dispararia em 1 ms: invalido
  comEnv({ NOMINATIM_PRAZO_MS: '9999999999' }, () => assert.strictEqual(coordenadas.prazoDoNominatimMs(), 5000));
  comEnv({ NOMINATIM_PRAZO_MS: '2147483648' }, () => assert.strictEqual(coordenadas.prazoDoNominatimMs(), 5000));
  comEnv({ NOMINATIM_PRAZO_MS: '2147483647' }, () => assert.strictEqual(coordenadas.prazoDoNominatimMs(), 2147483647));
});

test('[RN-156.04, C370] a cidade sem caixa, sem acento e sem espaco nas pontas; so a do estado informado (o homonimo de outro estado fica no centro do estado); sem estado, pelo nome', () => {
  const c = coordenadas.obterCoordenadasCidade;
  assert.deepStrictEqual(c('CAMPINAS', 'SP'), CAMPINAS);
  assert.deepStrictEqual(c('SAO BERNARDO DO CAMPO', 'SP'), SBC);
  assert.deepStrictEqual(c('RIBEIRÃO PRETO ', 'sp'), [-21.1775, -47.8103]);
  assert.deepStrictEqual(c('São Paulo', 'SP'), [-23.5505, -46.6333]);
  // a lista tem a UF de cada cidade: 'Rio Branco' esta duas vezes (a capital do AC e a do MT — o objeto de antes guardava so a do MT)
  assert.deepStrictEqual(c('RIO BRANCO', 'AC'), [-9.9747, -67.81], 'o cliente do Acre nao foi para a capital do Acre');
  assert.deepStrictEqual(c('rio branco', 'ac'), [-9.9747, -67.81], 'o estado em minusculas');
  assert.deepStrictEqual(c('RIO BRANCO', 'MT'), [-15.25, -58.1167]);
  // o homonimo de outro estado — longe ou vizinho (Fase 5 r1 I-1) — fica no centro do estado informado
  assert.deepStrictEqual(c('SANTA MARIA', 'RN'), [-5.22, -36.52], 'o cliente do RN foi para o RS');
  assert.deepStrictEqual(c('SANTA MARIA', 'MS'), [-20.51, -54.54], 'o cliente do MS foi para o RS');
  assert.deepStrictEqual(c('RIO CLARO', 'RJ'), [-22.90, -43.17], 'o cliente do RJ foi para Rio Claro/SP');
  assert.deepStrictEqual(c('PAULISTA', 'PB'), [-7.24, -36.78], 'o cliente da PB foi para Paulista/PE');
  assert.deepStrictEqual(c('ÁGUA BOA', 'MG'), [-18.10, -44.38], 'o cliente de MG foi para Agua Boa/MT');
  // a cidade legitima mais longe do centro do proprio estado no mapa (Colniza/MT, 700 km) e as capitais longe do centro
  assert.deepStrictEqual(c('COLNIZA', 'MT'), [-9.4, -60.9167]);
  assert.deepStrictEqual(c('MANAUS', 'AM'), [-3.1190, -60.0217]);
  assert.deepStrictEqual(c('BELEM', 'PA'), [-1.4558, -48.5044]);
  assert.deepStrictEqual(c('CURITIBA', 'PR'), [-25.4284, -49.2733]);
  assert.deepStrictEqual(c('CIDADE QUE NAO HA', 'SP'), CENTRO_SP);
  assert.deepStrictEqual(c('CIDADE QUE NAO HA', ' sp '), CENTRO_SP, 'o estado com espaco e em minusculas');
  assert.deepStrictEqual(c('Campinas', ''), CAMPINAS);
  assert.deepStrictEqual(c('Rio Branco', ''), [-15.25, -58.1167], 'sem estado, a ultima com o nome (como o objeto de antes)');
  assert.deepStrictEqual(c('', ''), [-14.235, -51.9253]);
  assert.deepStrictEqual(c(null, undefined), [-14.235, -51.9253]);
});

// ── integracao: o index.js montado, com NOMINATIM_URL na fronteira local ────────────────────────
let porta; let filho = null; let pasta; let logArq; let saiu = null; let T = null;
async function j(m, u, body) {
  const headers = { ...(T ? { Authorization: 'Bearer ' + T } : {}) };
  let corpo;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; corpo = JSON.stringify(body); }
  const r = await fetch(`http://127.0.0.1:${porta}/api${u}`, { method: m, headers, body: corpo, signal: AbortSignal.timeout(30000) });
  const txt = await r.text();
  let x = txt; try { x = JSON.parse(txt); } catch (e) { /* sem JSON */ }
  return [r.status, x];
}
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e156seed@t.com', senha: 'E156seed!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });
async function subir() {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET', 'API_URL', 'SEED_ADMIN_EMAIL',
    'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'PROPOSTAS_PORTAO_DE_MODULO', 'RATE_LIMIT_WINDOW_MS', 'NOMINATIM_URL', 'NOMINATIM_PRAZO_MS']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha, RATE_LIMIT_MAX: '100000',
    NOMINATIM_URL: urlDaFronteira, NOMINATIM_PRAZO_MS: '400' });
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
      const [s, x] = await j('POST', '/auth/login', SEED);
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
const ctx = {};
const perto = (a, b, tol = 1e-6) => Array.isArray(a) && a.length === 2 && Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol;

test('[RN-156.04, Fase 5 r1 I-1] a lista das cidades: 345 linhas, UF valida, nome+UF sem repeticao, nenhuma a mais de 700 km do centro do proprio estado', () => {
  const { CIDADES } = coordenadas;
  assert.strictEqual(CIDADES.length, 345);
  const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  const vistos = new Set();
  const R = 6371; const rad = (g) => (g * Math.PI) / 180;
  const km = (a, b) => 2 * R * Math.asin(Math.sqrt(Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2));
  for (const [nome, uf, lat, lon] of CIDADES) {
    assert.ok(ESTADOS.includes(uf), `${nome}: UF ${uf}`);
    const chave = `${coordenadas.normalizarNome(nome)}/${uf}`;
    assert.ok(!vistos.has(chave), `repetida: ${chave}`);
    vistos.add(chave);
    const centro = coordenadas.obterCoordenadasCidade('', uf);
    assert.ok(km([lat, lon], centro) <= 700, `${nome}/${uf} a ${Math.round(km([lat, lon], centro))} km do centro do estado (UF errada?)`);
    assert.deepStrictEqual(coordenadas.obterCoordenadasCidade(nome.toUpperCase(), uf), [lat, lon], `${nome}/${uf} nao se acha`);
  }
});

test('[RN-156.03/04, integracao] coordenadas-cliente com o servico pendurado: 200 com a coordenada de Campinas (nao o centro de SP) em menos de 3 s; respondendo, a dele', async () => {
  fronteira.modo = 'pendura'; fronteira.pedidos = [];
  const t0 = Date.now();
  const [s, x] = await j('GET', `/custos-viagens/coordenadas-cliente/${ctx.campinas}`);
  const ms = Date.now() - t0;
  assert.strictEqual(s, 200, JSON.stringify(x));
  assert.ok(perto(x.coordenadas, CAMPINAS) && x.lat === CAMPINAS[0] && x.lon === CAMPINAS[1], `coordenada: ${JSON.stringify(x)} (o centro de SP seria ${CENTRO_SP})`);
  assert.ok(ms >= 380 && ms < 3000, `levou ${ms} ms`);
  assert.strictEqual(fronteira.pedidos.length, 1, 'a rota nao chegou ao servico de mapas (o teste nao provaria o prazo)');
  assert.strictEqual(fronteira.pedidos[0].params.q, 'RUA DAS FLORES 10, CAMPINAS, SP, Brasil');
  fronteira.modo = 'responde'; fronteira.lat = '-22.91'; fronteira.lon = '-47.06';
  const [s2, x2] = await j('GET', `/custos-viagens/coordenadas-cliente/${ctx.campinas}`);
  assert.deepStrictEqual([s2, x2.coordenadas], [200, [-22.91, -47.06]]);
  fronteira.modo = '429';
  const [s3, x3] = await j('GET', `/custos-viagens/coordenadas-cliente/${ctx.campinas}`);
  assert.ok(s3 === 200 && perto(x3.coordenadas, CAMPINAS), JSON.stringify(x3));
});

test('[RN-156.04, integracao] os clientes proximos de Campinas (raio 100): o de JUNDIAI sim, o de RIBEIRAO PRETO nao (antes os dois, a 0 km)', async () => {
  const [s, prox] = await j('GET', `/custos-viagens/clientes-proximos/${ctx.campinas}?raio_km=100`);
  assert.strictEqual(s, 200, JSON.stringify(prox));
  const ids = prox.map((p) => p.id);
  assert.ok(ids.includes(ctx.jundiai), `o de Jundiai sumiu: ${JSON.stringify(prox).slice(0, 300)}`);
  assert.ok(!ids.includes(ctx.ribeirao), `o de Ribeirao Preto (a ~200 km) entrou: ${JSON.stringify(prox).slice(0, 300)}`);
});

test('[RN-156.04, integracao] a rota para CAMPINAS (a grafia do cadastro) = a rota para Campinas; o valor da visita do cliente de Campinas parte de Campinas', async () => {
  const q = (cidade) => `/custos-viagens/calcular-rota?destino_cidade=${encodeURIComponent(cidade)}&destino_estado=SP&tipo_viagem=ida_e_volta&numero_pessoas=1`;
  const [s1, r1] = await j('GET', q('CAMPINAS'));
  const [s2, r2] = await j('GET', q('Campinas'));
  assert.ok(s1 === 200 && s2 === 200, `${s1} ${s2}`);
  assert.strictEqual(r1.distancia_km, r2.distancia_km, `CAMPINAS ${r1.distancia_km} x Campinas ${r2.distancia_km}`);
  assert.ok(r1.distancia_km > 60, `a rota de SBC a Campinas saiu ${r1.distancia_km} km (o centro de SP dava ~20)`);
  const [sv, v] = await j('GET', '/relatorios/visitas-tecnicas');
  assert.strictEqual(sv, 200, JSON.stringify(v).slice(0, 200));
  const cli = [...v.elegiveis, ...v.naoElegiveis].find((c) => c.id === ctx.campinas);
  assert.ok(cli && cli.valor_visita, JSON.stringify(cli).slice(0, 200));
  assert.ok(cli.valor_visita.distancia >= 95 && cli.valor_visita.distancia <= 115, `distancia da visita: ${cli.valor_visita.distancia} km (o centro de SP dava ~20)`);
});

(async () => {
  console.log('\n=== Etapa 156: o prazo da consulta de endereco e a cidade do cadastro (C361, C370, C371) ===\n');
  try {
    await new Promise((r) => servidorDeMapas.listen(0, '127.0.0.1', r));
    urlDaFronteira = `http://127.0.0.1:${servidorDeMapas.address().port}/search`;
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e156-coord-'));
    T = await subir();
    const cria = async (razao, cidade, endereco) => {
      const [s, c] = await j('POST', '/clientes', { razao_social: razao, cidade, estado: 'SP', endereco });
      assert.strictEqual(s, 200, JSON.stringify(c));
      return c.id;
    };
    ctx.campinas = await cria('Cliente 156 Campinas', 'Campinas', 'Rua das Flores 10');
    ctx.jundiai = await cria('Vizinho 156 Jundiai', 'Jundiai');
    ctx.ribeirao = await cria('Longe 156 Ribeirao', 'Ribeirao Preto');
    // o relatorio de visitas so lista cliente com proposta: uma, gravada por fora (o banco do index.js montado)
    const banco = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
    banco.configure('busyTimeout', 15000);
    await new Promise((res, rej) => banco.run("INSERT INTO propostas (cliente_id, numero_proposta, titulo, status, valor_total, created_at) VALUES (?, 'E156-0001', 'Proposta 156', 'aprovada', 1560, datetime('now'))", [ctx.campinas], (e) => (e ? rej(e) : res())));
    await new Promise((res) => banco.close(() => res()));
    for (const [name, fn] of testes) {
      if (saiu !== null) { failed++; console.error(`  ✗ ${name}: o servidor caiu antes (codigo ${saiu})`); continue; }
      try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
        failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`);
      }
    }
  } catch (e) { failed++; console.error('  ✗ preparo:', e.message); }
  await descer();
  for (const s of fronteira.sockets) s.destroy();
  await new Promise((r) => servidorDeMapas.close(() => r()));
  try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
