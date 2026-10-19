/**
 * Etapa 156 (Comercial) — a consulta de endereco ao servico de mapas tem prazo, e a coordenada pela cidade acha a cidade do cadastro.
 *
 *   RN-156.03  (C361, C371) o pedido ao servico de mapas tem prazo (NOMINATIM_PRAZO_MS, padrao 5000), contado do pedido inteiro; esgotado,
 *              a coordenada sai pela cidade. Resposta nao 200, corpo nao JSON e lista vazia tambem. NOMINATIM_URL troca o endereco. O termo
 *              vai com espacos (sem o `+` literal de antes).
 *   RN-156.04  (C370) a cidade sem caixa, sem acento e sem espaco nas pontas, e so a do estado informado (a lista tem a UF de cada cidade —
 *              Fase 5 r1 I-1: o raio de 1.000 km da Fase 2 deixava passar o homonimo de estado vizinho).
 *
 * Etapa 158 (C377) — a coordenada do endereco guardada no cadastro do cliente:
 *   RN-158.01  com endereco, cidade e estado: a memoria (geo_lat, geo_lon, geo_termo) do termo atual responde sem consultar; senao consulta,
 *              a boa e gravada (depois de responder, sem mexer no updated_at, so se o endereco ainda e o lido); a falha nao grava
 *   RN-158.02  a memoria vale so para o termo que a gerou: mudar endereco, cidade ou estado (pelo PUT ou por fora) consulta de novo
 *   RN-158.03  o contrato nao muda; GET /clientes e /clientes/:id nao mostram as colunas; POST/PUT nao as gravam
 *   (a migracao e o erro ao gravar: coordenadaGuardadaMigracao.api.test.js)
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
  if (m === 'lento') { // Etapa 158 (Fase 2 M6): responde depois de 250 ms (dentro do prazo de 400 do index.js montado)
    return setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify([{ lat: fronteira.lat, lon: fronteira.lon }])); }, 250);
  }
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
  // Etapa 158: o 429 antes do responde — depois do responde, a coordenada sai da memoria (RN-158.01) e o 429 nem seria consultado
  fronteira.modo = '429';
  const [s3, x3] = await j('GET', `/custos-viagens/coordenadas-cliente/${ctx.campinas}`);
  assert.ok(s3 === 200 && perto(x3.coordenadas, CAMPINAS), JSON.stringify(x3));
  assert.strictEqual(fronteira.pedidos.length, 2, 'o 429 nao foi consultado');
  fronteira.modo = 'responde'; fronteira.lat = '-22.91'; fronteira.lon = '-47.06';
  const [s2, x2] = await j('GET', `/custos-viagens/coordenadas-cliente/${ctx.campinas}`);
  assert.deepStrictEqual([s2, x2.coordenadas], [200, [-22.91, -47.06]]);
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

test('[RN-157.04, integracao] os proximos de um cliente de SÃO PAULO: o de SAO PAULO com outro endereco a 5 km, o sem endereco e o do mesmo endereco (estado " SP") a 2 km (antes os tres a 0 km)', async () => {
  const [s, prox] = await j('GET', `/custos-viagens/clientes-proximos/${ctx.sp}?raio_km=100`);
  assert.strictEqual(s, 200, JSON.stringify(prox));
  const km = (id) => (prox.find((p) => p.id === id) || {}).distancia_km;
  const cadastro = (id) => prox.find((p) => p.id === id) || {};
  // o cadastro guardou o que o teste diz (senao o cenario nao provaria a comparacao)
  assert.strictEqual(cadastro(ctx.spOutroEndereco).cidade, 'SAO PAULO');
  assert.strictEqual(cadastro(ctx.spSemEndereco).cidade, 'SAO PAULO ');
  assert.strictEqual(cadastro(ctx.spMesmoEndereco).estado, ' SP');
  assert.deepStrictEqual([km(ctx.spOutroEndereco), km(ctx.spSemEndereco), km(ctx.spMesmoEndereco)], [5, 2, 2], JSON.stringify(prox).slice(0, 600));
  // a metade que nao muda: o de Campinas (a ~85 km) continua pela distancia das cidades
  assert.ok(km(ctx.campinas) > 60 && km(ctx.campinas) < 100, `Campinas a ${km(ctx.campinas)} km`);
});

test('[RN-157.04, Fase 5 r3 S02-S04, integracao] do ponto de vista do SAO PAULO sem acento (estado " SP"): o de São Paulo com RUA SÃO JOÃO 1 a 2 km, o de outro endereco (estado "sp" legado) a 5, o sem endereco a 2', async () => {
  const [s, prox] = await j('GET', `/custos-viagens/clientes-proximos/${ctx.spMesmoEndereco}?raio_km=100`);
  assert.strictEqual(s, 200, JSON.stringify(prox));
  const km = (id) => (prox.find((p) => p.id === id) || {}).distancia_km;
  assert.strictEqual((prox.find((p) => p.id === ctx.spOutroEndereco) || {}).estado, 'sp', 'o legado em minusculas (o UPDATE do preparo)');
  assert.deepStrictEqual([km(ctx.sp), km(ctx.spOutroEndereco), km(ctx.spSemEndereco)], [2, 5, 2], JSON.stringify(prox).slice(0, 600));
});

test('[Fase 5 r1 I-1, C376, integracao]a rota com o tipo como o servidor o grava (IDA_E_VOLTA, em maiusculas) = ida_e_volta (antes: calculada como so ida)', async () => {
  const q = (tipo) => `/custos-viagens/calcular-rota?destino_cidade=CURITIBA&destino_estado=PR&tipo_viagem=${tipo}&numero_pessoas=1`;
  const [s1, maiusc] = await j('GET', q('IDA_E_VOLTA'));
  const [s2, minusc] = await j('GET', q('ida_e_volta'));
  const [s3, ida] = await j('GET', q('ida'));
  assert.ok(s1 === 200 && s2 === 200 && s3 === 200, `${s1} ${s2} ${s3}`);
  assert.strictEqual(maiusc.custo_sugerido, minusc.custo_sugerido, `IDA_E_VOLTA ${maiusc.custo_sugerido} x ida_e_volta ${minusc.custo_sugerido}`);
  assert.ok(minusc.custo_sugerido > ida.custo_sugerido, `ida e volta ${minusc.custo_sugerido} <= ida ${ida.custo_sugerido} (o cenario nao separaria)`);
  // e o cadastro grava mesmo em maiusculas (senao o cenario nao seria o da tela)
  const [sp, criado] = await j('POST', '/custos-viagens', { cliente_id: ctx.campinas, data_viagem: '2026-10-20', destino: 'CAMPINAS - SP',
    destino_cidade: 'CAMPINAS', destino_estado: 'SP', tipo_viagem: 'ida_e_volta', numero_pessoas: 1, custo_transporte: 10 });
  assert.ok(sp === 200 || sp === 201, JSON.stringify(criado));
  const [sl, lista] = await j('GET', '/custos-viagens');
  assert.strictEqual(sl, 200);
  const gravado = lista.find((c) => c.id === criado.id) || lista[0];
  assert.strictEqual(gravado.tipo_viagem, 'IDA_E_VOLTA');
});

// ── Etapa 158 (C377): a coordenada do endereco guardada no cadastro do cliente ─────────────────────
function sql(q, p = []) {
  return new Promise((res, rej) => {
    const b = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
    b.configure('busyTimeout', 15000);
    const metodo = /^\s*select/i.test(q) ? 'all' : 'run';
    b[metodo](q, p, function feito(e, rows) { const r = metodo === 'all' ? rows : this; b.close(() => (e ? rej(e) : res(r))); });
  });
}
const memoria = async (id) => (await sql('SELECT geo_lat, geo_lon, geo_termo, updated_at FROM clientes WHERE id = ?', [id]))[0];
async function aguardar(cond, ms = 3000) {
  const fim = Date.now() + ms;
  for (;;) {
    const v = await cond();
    if (v) return v;
    if (Date.now() > fim) return v;
    await pausa(50);
  }
}
const coordDe = (id) => j('GET', `/custos-viagens/coordenadas-cliente/${id}`);
const criar158 = async (razao, cidade, endereco, estado = 'SP') => {
  const [s, c] = await j('POST', '/clientes', { razao_social: razao, cidade, estado, endereco });
  assert.strictEqual(s, 200, JSON.stringify(c));
  return c.id;
};
const JUNDIAI = [-23.1864, -46.8842];

test('[RN-158.01, C377] duas aberturas do mesmo cliente: 1 pedido ao servico de mapas; a memoria gravada com o termo da consulta, sem mexer no updated_at; o contrato igual', async () => {
  fronteira.modo = 'responde'; fronteira.lat = '-10.1'; fronteira.lon = '-20.2'; fronteira.pedidos = [];
  const id = await criar158('Memoria 158 A', 'Campinas', 'Rua   Um 1');
  ctx.memA = id;
  await sql("UPDATE clientes SET updated_at = '2000-01-01 00:00:00' WHERE id = ?", [id]); // Fase 2 I5: o segundo do cadastro nao serve
  const [s1, x1] = await coordDe(id);
  assert.deepStrictEqual([s1, x1], [200, { coordenadas: [-10.1, -20.2], lat: -10.1, lon: -20.2 }]);
  assert.strictEqual(fronteira.pedidos.length, 1, 'a primeira abertura nao consultou (o teste nao provaria a memoria)');
  const m = await aguardar(async () => { const x = await memoria(id); return x.geo_termo ? x : null; });
  assert.ok(m, 'a memoria nao foi gravada');
  // o termo e o mesmo que foi ao servico (uma funcao so — T4) e os espacos repetidos viram um
  assert.strictEqual(m.geo_termo, fronteira.pedidos[0].params.q);
  assert.deepStrictEqual(m, { geo_lat: -10.1, geo_lon: -20.2, geo_termo: 'RUA UM 1, CAMPINAS, SP, Brasil', updated_at: '2000-01-01 00:00:00' });
  assert.strictEqual(coordenadas.termoDaConsulta('RUA   UM 1', 'CAMPINAS', 'SP'), 'RUA UM 1, CAMPINAS, SP, Brasil');
  // a segunda: da memoria (o servico agora daria outra)
  fronteira.lat = '-30'; fronteira.lon = '-40';
  const [s2, x2] = await coordDe(id);
  assert.deepStrictEqual([s2, x2], [200, { coordenadas: [-10.1, -20.2], lat: -10.1, lon: -20.2 }]);
  assert.strictEqual(fronteira.pedidos.length, 1, 'a segunda abertura consultou o servico de mapas de novo');
});

test('[RN-158.02, C377] a memoria vale so para o endereco que a gerou: o telefone mantem; outro endereco, voltar ao anterior, por fora, outra cidade e outro estado consultam; sem endereco, a cidade sem a memoria', async () => {
  fronteira.modo = 'responde'; fronteira.lat = '-11'; fronteira.lon = '-21'; fronteira.pedidos = [];
  const id = await criar158('Memoria 158 B', 'Campinas', 'Rua Um 1');
  const termoGravado = async (t) => aguardar(async () => (await memoria(id)).geo_termo === t);
  await coordDe(id);
  assert.ok(await termoGravado('RUA UM 1, CAMPINAS, SP, Brasil'));
  const pedidos = () => fronteira.pedidos.length;
  assert.strictEqual(pedidos(), 1);
  // outro campo: a memoria fica
  assert.strictEqual((await j('PUT', `/clientes/${id}`, { telefone: '11 99999-1580' }))[0], 200);
  assert.deepStrictEqual((await coordDe(id))[1].coordenadas, [-11, -21]);
  assert.strictEqual(pedidos(), 1, 'mudar o telefone fez consultar de novo');
  // outro endereco pela rota da tela
  fronteira.lat = '-12'; fronteira.lon = '-22';
  assert.strictEqual((await j('PUT', `/clientes/${id}`, { endereco: 'Rua Dois 2' }))[0], 200);
  assert.deepStrictEqual((await coordDe(id))[1].coordenadas, [-12, -22]);
  assert.strictEqual(pedidos(), 2, 'o endereco novo nao consultou');
  assert.strictEqual(fronteira.pedidos[1].params.q, 'RUA DOIS 2, CAMPINAS, SP, Brasil');
  assert.ok(await termoGravado('RUA DOIS 2, CAMPINAS, SP, Brasil'));
  assert.deepStrictEqual((await coordDe(id))[1].coordenadas, [-12, -22]);
  assert.strictEqual(pedidos(), 2, 'o endereco novo, ja gravado, consultou de novo');
  // voltar ao anterior: so a ultima gravada e lembrada
  fronteira.lat = '-13'; fronteira.lon = '-23';
  assert.strictEqual((await j('PUT', `/clientes/${id}`, { endereco: 'Rua Um 1' }))[0], 200);
  assert.deepStrictEqual((await coordDe(id))[1].coordenadas, [-13, -23]);
  assert.strictEqual(pedidos(), 3);
  assert.ok(await termoGravado('RUA UM 1, CAMPINAS, SP, Brasil'));
  // por fora (sem passar pelo PUT)
  fronteira.lat = '-14'; fronteira.lon = '-24';
  await sql("UPDATE clientes SET endereco = 'RUA TRES 3' WHERE id = ?", [id]);
  assert.deepStrictEqual((await coordDe(id))[1].coordenadas, [-14, -24]);
  assert.strictEqual(pedidos(), 4, 'o endereco mudado por fora nao consultou');
  assert.ok(await termoGravado('RUA TRES 3, CAMPINAS, SP, Brasil'));
  // outra cidade; outro estado
  fronteira.lat = '-15'; fronteira.lon = '-25';
  assert.strictEqual((await j('PUT', `/clientes/${id}`, { cidade: 'Jundiai' }))[0], 200);
  assert.deepStrictEqual((await coordDe(id))[1].coordenadas, [-15, -25]);
  assert.strictEqual(pedidos(), 5, 'a cidade nova nao consultou');
  assert.ok(await termoGravado('RUA TRES 3, JUNDIAI, SP, Brasil'));
  fronteira.lat = '-16'; fronteira.lon = '-26';
  assert.strictEqual((await j('PUT', `/clientes/${id}`, { estado: 'MG' }))[0], 200);
  assert.deepStrictEqual((await coordDe(id))[1].coordenadas, [-16, -26]);
  assert.strictEqual(pedidos(), 6, 'o estado novo nao consultou');
  assert.ok(await termoGravado('RUA TRES 3, JUNDIAI, MG, Brasil'));
  // sem endereco (Fase 2 M5): a cidade, sem consultar e sem a memoria antiga
  assert.strictEqual((await j('PUT', `/clientes/${id}`, { endereco: '', estado: 'SP' }))[0], 200);
  const [ss, xs] = await coordDe(id);
  assert.ok(ss === 200 && perto(xs.coordenadas, JUNDIAI), `sem endereco: ${JSON.stringify(xs)} (a memoria seria [-16, -26])`);
  assert.strictEqual(pedidos(), 6, 'o cliente sem endereco consultou');
});

test('[RN-158.01, C377] o servico pendurado, 429 e lista vazia: a coordenada da cidade e NADA gravado — a abertura seguinte consulta de novo; respondendo, grava', async () => {
  const id = await criar158('Memoria 158 C', 'Campinas', 'Rua Quatro 4');
  for (const modo of ['pendura', '429', 'vazio']) {
    fronteira.modo = modo; fronteira.pedidos = [];
    const [s, x] = await coordDe(id);
    assert.ok(s === 200 && perto(x.coordenadas, CAMPINAS), `${modo}: ${JSON.stringify(x)}`);
    assert.strictEqual(fronteira.pedidos.length, 1, `${modo}: nao consultou (a memoria de uma falha anterior valeu?)`);
    await pausa(300);
    const m = await memoria(id);
    assert.deepStrictEqual([m.geo_lat, m.geo_lon, m.geo_termo], [null, null, null], `${modo} gravou`);
  }
  // a metade positiva: respondendo, grava
  fronteira.modo = 'responde'; fronteira.lat = '-17'; fronteira.lon = '-27'; fronteira.pedidos = [];
  assert.deepStrictEqual((await coordDe(id))[1].coordenadas, [-17, -27]);
  assert.ok(await aguardar(async () => (await memoria(id)).geo_lat === -17), 'a resposta boa nao gravou');
});

test('[RN-158.01] o cliente sem endereco: nenhum pedido e nada gravado; a memoria invalida (geo_lat texto, geo_lon nulo) nao vale', async () => {
  fronteira.modo = 'responde'; fronteira.lat = '-18'; fronteira.lon = '-28'; fronteira.pedidos = [];
  const sem = await criar158('Memoria 158 D sem endereco', 'Jundiai');
  const [s, x] = await coordDe(sem);
  assert.ok(s === 200 && perto(x.coordenadas, JUNDIAI), JSON.stringify(x));
  await pausa(300);
  assert.strictEqual(fronteira.pedidos.length, 0);
  assert.strictEqual((await memoria(sem)).geo_termo, null);
  // Fase 2 M5: a memoria com geo_termo NULL num cliente sem endereco (termo NULL) nao vale (null === null)
  await sql('UPDATE clientes SET geo_lat = -5, geo_lon = -6, geo_termo = NULL WHERE id = ?', [sem]);
  const [s5, x5] = await coordDe(sem);
  assert.ok(s5 === 200 && perto(x5.coordenadas, JUNDIAI), `a memoria sem termo valeu: ${JSON.stringify(x5)}`);
  // a memoria gravada por fora com lixo
  const id = await criar158('Memoria 158 D', 'Campinas', 'Rua Cinco 5');
  const termo = 'RUA CINCO 5, CAMPINAS, SP, Brasil';
  await sql("UPDATE clientes SET geo_lat = 'abc', geo_lon = -1, geo_termo = ? WHERE id = ?", [termo, id]);
  assert.deepStrictEqual((await coordDe(id))[1].coordenadas, [-18, -28]);
  assert.strictEqual(fronteira.pedidos.length, 1, 'a memoria com geo_lat texto valeu');
  await pausa(300);
  await sql('UPDATE clientes SET geo_lat = -1, geo_lon = NULL, geo_termo = ? WHERE id = ?', [termo, id]);
  assert.deepStrictEqual((await coordDe(id))[1].coordenadas, [-18, -28]);
  assert.strictEqual(fronteira.pedidos.length, 2, 'a memoria com geo_lon nulo valeu');
  await pausa(300);
  // a metade positiva: a memoria valida, gravada por fora, vale
  await sql('UPDATE clientes SET geo_lat = -1.25, geo_lon = -2.75, geo_termo = ? WHERE id = ?', [termo, id]);
  assert.deepStrictEqual((await coordDe(id))[1].coordenadas, [-1.25, -2.75]);
  assert.strictEqual(fronteira.pedidos.length, 2);
});

test('[RN-158.01, Fase 5 r1 M2] a resposta absurda do servico (lat 999): respondida como antes, mas NAO guardada; a memoria fora da faixa gravada por fora nao vale', async () => {
  const id = await criar158('Memoria 158 G', 'Campinas', 'Rua Nove 9');
  fronteira.modo = 'responde'; fronteira.lat = '999'; fronteira.lon = '-999'; fronteira.pedidos = [];
  assert.deepStrictEqual((await coordDe(id))[1].coordenadas, [999, -999]);
  await pausa(300);
  assert.strictEqual((await memoria(id)).geo_termo, null, 'a coordenada absurda foi guardada');
  fronteira.lat = '90'; fronteira.lon = '-180'; // a borda da faixa vale (a metade positiva)
  assert.deepStrictEqual((await coordDe(id))[1].coordenadas, [90, -180]);
  assert.strictEqual(fronteira.pedidos.length, 2, 'depois da absurda, a abertura seguinte nao consultou');
  assert.ok(await aguardar(async () => (await memoria(id)).geo_lat === 90), 'a borda da faixa nao foi guardada');
  await sql('UPDATE clientes SET geo_lat = 90.5 WHERE id = ?', [id]);
  fronteira.lat = '-1.5'; fronteira.lon = '-2.5';
  assert.deepStrictEqual((await coordDe(id))[1].coordenadas, [-1.5, -2.5]);
  assert.strictEqual(fronteira.pedidos.length, 3, 'a memoria fora da faixa valeu');
});

test('[RN-158.01, Fase 2 M6] a consulta lenta de um endereco que mudou no meio nao grava a coordenada do endereco velho', async () => {
  const id = await criar158('Memoria 158 E', 'Campinas', 'Rua Seis 6');
  fronteira.modo = 'lento'; fronteira.lat = '-19'; fronteira.lon = '-29'; fronteira.pedidos = [];
  const abrindo = coordDe(id);
  await aguardar(async () => fronteira.pedidos.length === 1, 2000);
  assert.strictEqual((await j('PUT', `/clientes/${id}`, { endereco: 'Rua Sete 7' }))[0], 200);
  const [s, x] = await abrindo;
  assert.deepStrictEqual([s, x.coordenadas], [200, [-19, -29]]);
  await pausa(400);
  assert.strictEqual((await memoria(id)).geo_termo, null, 'gravou a coordenada da Rua Seis no cadastro da Rua Sete');
  // a metade positiva: sem mudar no meio, a lenta grava
  fronteira.pedidos = [];
  await coordDe(id);
  assert.ok(await aguardar(async () => (await memoria(id)).geo_termo === 'RUA SETE 7, CAMPINAS, SP, Brasil'), 'a lenta sem mudanca nao gravou');
});

test('[RN-158.01, B1009, Fase 5 r3 R23] com a escrita do banco presa por outra conexao, a abertura responde sem esperar; a memoria grava quando solta', async () => {
  const id = await criar158('Memoria 158 K', 'Campinas', 'Rua Catorze 14');
  fronteira.modo = 'responde'; fronteira.lat = '-20.5'; fronteira.lon = '-40.5'; fronteira.pedidos = [];
  const b = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  b.configure('busyTimeout', 15000);
  await new Promise((r, x) => b.run('BEGIN IMMEDIATE', (e) => (e ? x(e) : r())));
  let solto = false;
  const soltar = () => new Promise((r) => { if (solto) return r(); solto = true; b.run('COMMIT', () => b.close(() => r())); });
  // solta sozinho em 3 s: a abertura que esperasse a gravacao levaria ~3 s (e a assercao do tempo cai), nao o prazo do fetch
  const relogio = setTimeout(() => { soltar(); }, 3000);
  try {
    const t0 = Date.now();
    const [s, x] = await coordDe(id);
    const ms = Date.now() - t0;
    assert.deepStrictEqual([s, x.coordenadas], [200, [-20.5, -40.5]]);
    assert.ok(ms < 1500, `a abertura esperou a escrita da memoria: ${ms} ms`);
    await pausa(300);
    assert.strictEqual((await memoria(id)).geo_termo, null, 'gravou com o banco preso (o cenario nao prenderia nada)');
    await soltar();
    assert.ok(await aguardar(async () => (await memoria(id)).geo_lat === -20.5, 8000), 'nao gravou depois de soltar');
  } finally { clearTimeout(relogio); await soltar(); }
});

test('[RN-158.01, Fase 5 r3 R25] a consulta lenta: mudar a cidade ou o estado no meio tambem nao grava a coordenada velha', async () => {
  for (const [campo, valor] of [['cidade', 'Jundiai'], ['estado', 'MG']]) {
    const id = await criar158(`Memoria 158 L ${campo}`, 'Campinas', 'Rua Quinze 15');
    fronteira.modo = 'lento'; fronteira.lat = '-21'; fronteira.lon = '-41'; fronteira.pedidos = [];
    const abrindo = coordDe(id);
    await aguardar(async () => fronteira.pedidos.length === 1, 2000);
    assert.strictEqual((await j('PUT', `/clientes/${id}`, { [campo]: valor }))[0], 200);
    assert.strictEqual((await abrindo)[0], 200);
    await pausa(400);
    assert.strictEqual((await memoria(id)).geo_termo, null, `gravou o termo velho depois de mudar ${campo}`);
  }
});

test('[RN-158.01, Fase 2 M1, Fase 5 r3 R02-R05/R08] sem cidade ou sem estado nao consulta nem grava; o endereco so de espacos consulta (como antes); o espaco a frente sai do termo; a memoria infinita nao vale', async () => {
  fronteira.modo = 'responde'; fronteira.lat = '-22'; fronteira.lon = '-42'; fronteira.pedidos = [];
  const semUf = await criar158('Memoria 158 M', 'Campinas', 'Rua Dez 10', '');
  const semCid = await criar158('Memoria 158 N', '', 'Rua Onze 11');
  assert.strictEqual((await coordDe(semUf))[0], 200);
  assert.strictEqual((await coordDe(semCid))[0], 200);
  await pausa(300);
  assert.strictEqual(fronteira.pedidos.length, 0, 'sem cidade/estado consultou');
  assert.deepStrictEqual([(await memoria(semUf)).geo_termo, (await memoria(semCid)).geo_termo], [null, null]);
  const esp = await criar158('Memoria 158 O', 'Campinas', 'Rua Doze 12');
  await sql("UPDATE clientes SET endereco = '   ' WHERE id = ?", [esp]);
  await coordDe(esp);
  assert.strictEqual(fronteira.pedidos.length, 1, 'M1: o endereco so de espacos deixou de consultar');
  assert.strictEqual(fronteira.pedidos[0].params.q, ', CAMPINAS, SP, Brasil');
  await sql("UPDATE clientes SET endereco = '  RUA TREZE 13 ' WHERE id = ?", [esp]);
  await coordDe(esp);
  assert.strictEqual(fronteira.pedidos.length, 2);
  assert.strictEqual(fronteira.pedidos[1].params.q, 'RUA TREZE 13 , CAMPINAS, SP, Brasil', 'o espaco a frente ficou no termo');
  assert.ok(await aguardar(async () => (await memoria(esp)).geo_termo === 'RUA TREZE 13 , CAMPINAS, SP, Brasil'), 'o termo gravado nao e o da consulta');
  // a memoria infinita (gravada por fora) nao vale
  await sql('UPDATE clientes SET geo_lat = 9e999 WHERE id = ?', [esp]);
  const [si, xi] = await coordDe(esp);
  assert.ok(si === 200 && xi.lat === -22 && fronteira.pedidos.length === 3, `a memoria infinita valeu: ${JSON.stringify(xi)} (${fronteira.pedidos.length} pedidos)`);
});

test('[RN-158.03, B1008, integracao T4] as listas nao mostram a memoria; o PUT da tela (o objeto do GET + geo_* forjado) e o POST nao a gravam', async () => {
  const id = ctx.memA;
  const antes = await memoria(id);
  assert.strictEqual(antes.geo_termo, 'RUA UM 1, CAMPINAS, SP, Brasil', 'o cenario precisa de um cliente COM memoria');
  const [sl, lista] = await j('GET', '/clientes');
  const daLista = lista.find((c) => c.id === id);
  assert.ok(sl === 200 && daLista && daLista.razao_social === 'MEMORIA 158 A', `${sl} ${JSON.stringify(daLista)}`);
  const [sg, umCliente] = await j('GET', `/clientes/${id}`);
  assert.ok(sg === 200 && umCliente.razao_social === 'MEMORIA 158 A' && umCliente.endereco === 'RUA   UM 1', JSON.stringify(umCliente));
  for (const [onde, obj] of [['lista', daLista], ['um', umCliente]]) {
    for (const k of ['geo_lat', 'geo_lon', 'geo_termo']) assert.ok(!Object.prototype.hasOwnProperty.call(obj, k), `${onde} mostra ${k}`);
  }
  // a tela de Clientes manda de volta o objeto inteiro do GET (ClienteForm): mais um geo_* forjado, o telefone trocado
  const [sp] = await j('PUT', `/clientes/${id}`, { ...umCliente, telefone: '11 1580-0000', geo_lat: 99, geo_lon: 99, geo_termo: 'FORJADO' });
  assert.strictEqual(sp, 200);
  const depois = await memoria(id);
  assert.deepStrictEqual([depois.geo_lat, depois.geo_lon, depois.geo_termo], [antes.geo_lat, antes.geo_lon, antes.geo_termo], 'o PUT gravou o geo_* do corpo');
  assert.strictEqual((await sql('SELECT telefone FROM clientes WHERE id = ?', [id]))[0].telefone, '11 1580-0000', 'o PUT nao gravou (o cenario nao provaria nada)');
  // e a abertura seguinte continua da memoria
  fronteira.modo = 'responde'; fronteira.pedidos = [];
  assert.deepStrictEqual((await coordDe(id))[1].coordenadas, [-10.1, -20.2]);
  assert.strictEqual(fronteira.pedidos.length, 0);
  // o POST com geo_* no corpo nao grava (a resposta ecoa o corpo — de antes, C)
  const [sc, c] = await j('POST', '/clientes', { razao_social: 'Memoria 158 F', cidade: 'Campinas', estado: 'SP', endereco: 'Rua Oito 8', geo_lat: 5, geo_lon: 6, geo_termo: 'RUA OITO 8, CAMPINAS, SP, Brasil' });
  assert.strictEqual(sc, 200);
  const doPost = await memoria(c.id);
  assert.deepStrictEqual([doPost.geo_lat, doPost.geo_lon, doPost.geo_termo], [null, null, null], 'o POST gravou o geo_* do corpo');
});

(async () => {
  console.log('\n=== Etapa 156: o prazo da consulta de endereco e a cidade do cadastro (C361, C370, C371) ===\n');
  try {
    await new Promise((r) => servidorDeMapas.listen(0, '127.0.0.1', r));
    urlDaFronteira = `http://127.0.0.1:${servidorDeMapas.address().port}/search`;
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e156-coord-'));
    T = await subir();
    const cria = async (razao, cidade, endereco, estado = 'SP') => {
      const [s, c] = await j('POST', '/clientes', { razao_social: razao, cidade, estado, endereco });
      assert.strictEqual(s, 200, JSON.stringify(c));
      return c.id;
    };
    ctx.campinas = await cria('Cliente 156 Campinas', 'Campinas', 'Rua das Flores 10');
    ctx.jundiai = await cria('Vizinho 156 Jundiai', 'Jundiai');
    ctx.ribeirao = await cria('Longe 156 Ribeirao', 'Ribeirao Preto');
    // Etapa 157 (RN-157.04): a mesma cidade com e sem acento — o cadastro grava em maiusculas, com o acento e o espaco que vieram
    ctx.sp = await cria('Paulista 157 Principal', 'São Paulo', 'Rua São João 1');
    ctx.spOutroEndereco = await cria('Paulista 157 Outro endereco', 'Sao Paulo', 'Avenida Paulista 900');
    ctx.spSemEndereco = await cria('Paulista 157 Sem endereco', 'SAO PAULO ');
    ctx.spMesmoEndereco = await cria('Paulista 157 Mesmo endereco', 'Sao Paulo', 'RUA SAO JOAO 1', ' sp');
    // o relatorio de visitas so lista cliente com proposta: uma, gravada por fora (o banco do index.js montado)
    const banco = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
    banco.configure('busyTimeout', 15000);
    await new Promise((res, rej) => banco.run("INSERT INTO propostas (cliente_id, numero_proposta, titulo, status, valor_total, created_at) VALUES (?, 'E156-0001', 'Proposta 156', 'aprovada', 1560, datetime('now'))", [ctx.campinas], (e) => (e ? rej(e) : res())));
    // Fase 5 r3 S02: um cadastro legado com o estado em minusculas (o POST /clientes ja grava em maiusculas)
    await new Promise((res, rej) => banco.run("UPDATE clientes SET estado = 'sp' WHERE id = ?", [ctx.spOutroEndereco], (e) => (e ? rej(e) : res())));
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
