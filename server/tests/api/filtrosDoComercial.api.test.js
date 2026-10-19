/**
 * Etapa 159 (Comercial) — os filtros que as telas do Comercial mandam e o servidor ignorava, a busca com letra acentuada, e as sobras
 * C381 e C382. Pelo `index.js` de verdade (pasta vazia). Nenhuma consulta ao servico de mapas (nenhuma chamada a coordenadas-cliente).
 *
 *   RN-159.01 (C384)  GET /api/clientes?segmento= filtra sem caixa (o toUpperCase do JavaScript) e sem espaco; nao texto = sem filtro
 *   RN-159.02 (C385)  a busca de texto (clientes, propostas, OS do Comercial, produtos, busca do topo) aparada e com as formas do termo
 *                     (como veio, maiusculas, minusculas) — acha o gravado em maiusculas com acento e o legado em minusculas
 *   RN-159.03 (C386)  GET /api/custos-viagens?busca= — codigo, cliente principal, cliente adicional, destino, cidade do destino
 *   RN-159.05 (C381)  POST /api/clientes responde o cliente gravado (lido do banco, sem geo_*); a releitura que falha -> 200 { id }
 *   RN-159.06 (C382)  POST/PUT /api/custos-viagens sem tipo (ou so de espacos) gravam IDA_E_VOLTA; o tipo aparado
 *
 * Molde: custosViagensPortao.api.test.js. Plano:
 * docs/superpowers/plans/2026-10-19-almoxarifado-etapa159-filtros-do-comercial-que-o-servidor-ignorava.md
 * Executar: cd server && node tests/api/filtrosDoComercial.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const { formasDoTermo, condicaoDeBusca } = require('../../services/buscaSemCaixa');

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
const j = (m, u, body) => cru(m, `/api${u}`, ctx.T, body);
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e159seed@t.com', senha: 'E159seed!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir(extraEnv = {}) {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET', 'API_URL', 'NOMINATIM_URL',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'FALHA_SQL_MSG', 'FALHA_SQL_METODOS', 'FALHA_SQL_PULAR', 'FALHA_SQL_MSGS',
    'PROPOSTAS_PORTAO_DE_MODULO', 'RATE_LIMIT_WINDOW_MS']) delete env[k];
  // NOMINATIM_URL numa porta fechada: se algum caminho consultasse o servico de mapas, falharia aqui, nunca na internet
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha,
    RATE_LIMIT_MAX: '100000', NOMINATIM_URL: 'http://127.0.0.1:9/search' }, extraEnv);
  const out = fs.openSync(logArq, 'a');
  saiu = null;
  const preload = ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js')];
  if (extraEnv.FALHA_SQL_INJETADA) preload.push('-r', path.join(__dirname, '..', 'helpers', 'falhaSqlInjetada.js'));
  const marcas = fs.existsSync(logArq) ? (fs.readFileSync(logArq, 'utf8').match(/Banco de dados totalmente inicializado/g) || []).length : 0;
  filho = spawn(process.execPath, [...preload, 'index.js'], { cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true });
  filho.on('exit', (code) => { saiu = code; });
  const fim = Date.now() + 60000;
  while (Date.now() < fim) {
    if (saiu !== null) throw new Error(`o index.js saiu cedo (codigo ${saiu})`);
    try {
      const [s, x] = await cru('POST', '/api/auth/login', null, SEED);
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
const q = (o) => new URLSearchParams(o).toString();
const ids = (lista) => (Array.isArray(lista) ? lista.map((x) => x.id) : ['nao e lista: ' + JSON.stringify(lista)]);
const mesmos = (a, b, msg) => assert.deepStrictEqual([...a].sort((x, y) => x - y), [...b].sort((x, y) => x - y), msg);

async function cliente(corpo) {
  const [s, c] = await j('POST', '/clientes', corpo);
  assert.strictEqual(s, 200, `POST /clientes: ${s} ${JSON.stringify(c)}`);
  assert.ok(Number.isInteger(c.id), `POST /clientes sem id: ${JSON.stringify(c)}`);
  return c.id;
}
async function legado(razao, extra = {}) {
  const cols = ['razao_social', 'status', ...Object.keys(extra)];
  const r = await run(`INSERT INTO clientes (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, [razao, 'ativo', ...Object.values(extra)]);
  return r.lastID;
}
async function todosOsClientes() { return (await all('SELECT id FROM clientes')).map((r) => r.id); }

// ── RN-159.02: as formas do termo, a funcao direta (T6) ──────────────────────────────────
test('[RN-159.02, T6] formasDoTermo: as formas distintas do termo aparado; nao texto e so espacos = nenhuma; condicaoDeBusca monta um LIKE por forma e coluna', () => {
  assert.deepStrictEqual(formasDoTermo('são'), ['são', 'SÃO']);
  assert.deepStrictEqual(formasDoTermo('São'), ['São', 'SÃO', 'são']);
  assert.deepStrictEqual(formasDoTermo('  Ação '), ['Ação', 'AÇÃO', 'ação']);
  assert.deepStrictEqual(formasDoTermo('ABC'), ['ABC', 'abc']);
  assert.deepStrictEqual(formasDoTermo('123'), ['123']);
  // Fase 5 r1 M1: o termo decomposto (NFD) vira o composto (NFC), a forma do cadastro
  assert.deepStrictEqual(formasDoTermo('sa\u0303o'), ['são', 'SÃO']);
  for (const nada of ['', '   ', null, undefined, ['são'], { a: 1 }, 123]) assert.deepStrictEqual(formasDoTermo(nada), [], `formas de ${JSON.stringify(nada)}`);
  const c = condicaoDeBusca(['a.x', 'b.y'], 'São');
  assert.strictEqual(c.sql, "(COALESCE(a.x, '') LIKE ? OR COALESCE(a.x, '') LIKE ? OR COALESCE(a.x, '') LIKE ? OR COALESCE(b.y, '') LIKE ? OR COALESCE(b.y, '') LIKE ? OR COALESCE(b.y, '') LIKE ?)");
  assert.deepStrictEqual(c.params, ['%São%', '%SÃO%', '%são%', '%São%', '%SÃO%', '%são%']);
  assert.deepStrictEqual(condicaoDeBusca(['a.x'], '  '), { sql: '', params: [] });
});

// ── RN-159.02: a busca de texto pelas rotas ─────────────────────────────────────────────
test('[RN-159.02, C385] GET /clientes?search: "são" acha o gravado "SÃO JOSÉ…" e "ação" o legado em minusculas; aparado; so espacos e nao texto = a lista inteira', async () => {
  const daRota = await cliente({ razao_social: 'são josé usinagem 159' });
  const leg = await legado('ação legada 159');
  const outro = await cliente({ razao_social: 'acme comum 159' });
  // Fase 5 r3 S01/S02: as outras colunas da busca — o nome fantasia (acentuado, gravado em maiusculas) e o CNPJ
  const fantasia = await cliente({ razao_social: 'razao neutra f159', nome_fantasia: 'ótica fantasia 159', cnpj: '12.345.678/0001-59' });
  assert.strictEqual((await all('SELECT razao_social FROM clientes WHERE id = ?', [daRota]))[0].razao_social, 'SÃO JOSÉ USINAGEM 159', 'o cadastro nao gravou em maiusculas (o cenario nao seria o de producao)');
  for (const termo of ['são', 'SÃO', 'São', ' são ', 'josé usinagem']) {
    const [s, l] = await j('GET', `/clientes?${q({ search: termo })}`);
    assert.strictEqual(s, 200);
    assert.ok(ids(l).includes(daRota), `"${termo}" nao achou o gravado SÃO JOSÉ`);
    assert.ok(!ids(l).includes(outro), `"${termo}" achou o ACME`);
  }
  for (const termo of ['ação', 'AÇÃO', 'Ação']) {
    const [, l] = await j('GET', `/clientes?${q({ search: termo })}`);
    assert.ok(ids(l).includes(leg), `"${termo}" nao achou o legado "ação legada"`);
    assert.ok(!ids(l).includes(daRota), `"${termo}" achou o SÃO JOSÉ`);
  }
  for (const [termo, esperado] of [['ótica fantasia', [fantasia]], ['345.678/0001', [fantasia]], ['sa\u0303o jose\u0301 usinagem', [daRota]]]) {
    const [, l] = await j('GET', `/clientes?${q({ search: termo })}`);
    mesmos(ids(l).filter((id) => [daRota, leg, outro, fantasia].includes(id)), esperado, `clientes "${termo}"`);
  }
  const [, sem] = await j('GET', `/clientes?${q({ search: 'inexistente159zz' })}`);
  assert.deepStrictEqual(sem, []);
  const tudo = await todosOsClientes();
  const [, esp] = await j('GET', `/clientes?${q({ search: '   ' })}`);
  mesmos(ids(esp), tudo, 'o termo so de espacos filtrou');
  const [, arr] = await j('GET', '/clientes?search[]=s%C3%A3o');
  mesmos(ids(arr), tudo, 'o termo nao texto filtrou');
  ctx.saoJose = daRota;
});

test('[RN-159.02, C385] GET /propostas?search e /comercial/ordens-servico?search: o titulo e a descricao gravados em maiusculas com acento acham pelo termo em minusculas (e aparado)', async () => {
  const cli = ctx.saoJose;
  const p1 = (await run("INSERT INTO propostas (cliente_id, numero_proposta, titulo, status) VALUES (?, 'P159-1', 'VÁLVULA DE AÇÃO 159', 'rascunho')", [cli])).lastID;
  const p2 = (await run("INSERT INTO propostas (numero_proposta, titulo, status) VALUES ('P159-2', 'tampão legado 159', 'rascunho')")).lastID;
  const p3 = (await run("INSERT INTO propostas (numero_proposta, titulo, status) VALUES ('P159-3', 'OUTRA COISA 159', 'rascunho')")).lastID;
  // Fase 5 r3 S03/S04: o numero da proposta e o nome fantasia do cliente
  const cliFant = await legado('RAZAO NEUTRA P159', { nome_fantasia: 'FANTASIA PROPOSTA ÚNICA' });
  const p4 = (await run("INSERT INTO propostas (cliente_id, numero_proposta, titulo, status) VALUES (?, 'P159-4', 'NEUTRA 159', 'rascunho')", [cliFant])).lastID;
  ctx.p1 = p1;
  const casos = [['válvula', [p1]], ['ação', [p1]], ['TAMPÃO', [p2]], ['tampão', [p2]], ['são josé', [p1]], [' válvula ', [p1]], ['p159-1', [p1]], ['proposta única', [p4]]];
  for (const [termo, esperado] of casos) {
    const [s, l] = await j('GET', `/propostas?${q({ search: termo })}`);
    assert.strictEqual(s, 200, JSON.stringify(l));
    mesmos(ids(l).filter((id) => [p1, p2, p3, p4].includes(id)), esperado, `propostas "${termo}"`);
  }
  const o1 = (await run("INSERT INTO ordens_servico (numero_os, tipo_os, data_abertura, descricao, cliente_id) VALUES ('OS-159-1', 'X', '2026-10-19', 'MANUTENÇÃO 159', ?)", [cli])).lastID;
  const o2 = (await run("INSERT INTO ordens_servico (numero_os, tipo_os, data_abertura, descricao) VALUES ('OS-159-2', 'X', '2026-10-19', 'OUTRA OS 159')")).lastID;
  // Fase 5 r3 S06/S07: o numero da proposta da OS e a descricao legada em minusculas, buscada em maiusculas
  const o3 = (await run("INSERT INTO ordens_servico (numero_os, tipo_os, data_abertura, descricao, proposta_id) VALUES ('OS-159-3', 'X', '2026-10-19', 'NEUTRA', ?)", [p1])).lastID;
  const o4 = (await run("INSERT INTO ordens_servico (numero_os, tipo_os, data_abertura, descricao) VALUES ('OS-159-4', 'X', '2026-10-19', 'revisão legada 159')")).lastID;
  for (const [termo, esperado] of [['manutenção', [o1]], [' manutenção ', [o1]], ['são josé', [o1]], ['os-159-2', [o2]], ['p159-1', [o3]], ['REVISÃO LEGADA', [o4]]]) {
    const [s, l] = await j('GET', `/comercial/ordens-servico?${q({ search: termo })}`);
    assert.strictEqual(s, 200, JSON.stringify(l));
    mesmos(ids(l).filter((id) => [o1, o2, o3, o4].includes(id)), esperado, `OS "${termo}"`);
  }
  const [, todasOs] = await j('GET', `/comercial/ordens-servico?${q({ search: '  ' })}`);
  mesmos(ids(todasOs), (await all('SELECT id FROM ordens_servico')).map((r) => r.id), 'OS: o termo so de espacos filtrou');
});

test('[RN-159.02, C385, Fase 2 I1/I2] GET /produtos?search e a busca do topo: "válvula" acha "VÁLVULA BORBOLETA"; a busca do topo acha o cliente e o produto; menos de 2 letras aparado = []', async () => {
  const pr = (await run("INSERT INTO produtos (codigo, nome, ativo) VALUES ('P159V', 'VÁLVULA BORBOLETA 159', 1)")).lastID;
  const pr2 = (await run("INSERT INTO produtos (codigo, nome, ativo) VALUES ('P159T', 'TANQUE 159', 1)")).lastID;
  // Fase 5 r3 S05: o codigo, a descricao e o modelo
  const pr3 = (await run("INSERT INTO produtos (codigo, nome, descricao, ativo) VALUES ('P159D', 'NEUTRO A 159', 'BOMBA DE ÓLEO 159', 1)")).lastID;
  const pr4 = (await run("INSERT INTO produtos (codigo, nome, modelo, ativo) VALUES ('P159M', 'NEUTRO B 159', 'MODELO ÍMPAR 159', 1)")).lastID;
  for (const [termo, esperado] of [['válvula', [pr]], [' Válvula borboleta ', [pr]], ['p159v', [pr]], ['bomba de óleo', [pr3]], ['modelo ímpar', [pr4]]]) {
    const [s, l] = await j('GET', `/produtos?${q({ search: termo, ativo: 'true' })}`);
    assert.strictEqual(s, 200, JSON.stringify(l));
    mesmos(ids(l).filter((id) => [pr, pr2, pr3, pr4].includes(id)), esperado, `produtos "${termo}"`);
  }
  const [, bg] = await j('GET', `/busca-global?${q({ q: 'são josé usinagem' })}`);
  assert.ok(Array.isArray(bg) && bg.some((r) => r.type === 'cliente' && r.id === ctx.saoJose), `a busca do topo nao achou o cliente: ${JSON.stringify(bg)}`);
  const [, bg2] = await j('GET', `/busca-global?${q({ q: ' válvula borboleta ' })}`);
  assert.ok(bg2.some((r) => r.type === 'produto' && r.id === pr), `a busca do topo nao achou o produto: ${JSON.stringify(bg2)}`);
  assert.ok(!bg2.some((r) => r.type === 'produto' && r.id === pr2), 'a busca do topo achou o TANQUE');
  const [, curto] = await j('GET', `/busca-global?${q({ q: ' s ' })}`);
  assert.deepStrictEqual(curto, []);
  // Fase 5 r3 S13: cada tipo da busca do topo, pelo termo em minusculas contra o gravado em maiusculas com acento (e o CNPJ, o codigo)
  const proj = (await run("INSERT INTO projetos (nome) VALUES ('PROJETO ÁGUA 159')")).lastID;
  const opo = (await run("INSERT INTO oportunidades (titulo) VALUES ('OPORTUNIDADE ÊXITO 159')")).lastID;
  const atv = (await run("INSERT INTO atividades (titulo, tipo) VALUES ('ATIVIDADE ÔNIBUS 159', 'visita')")).lastID;
  for (const [termo, tipo, id] of [['projeto água', 'projeto', proj], ['válvula de ação', 'proposta', ctx.p1], ['oportunidade êxito', 'oportunidade', opo],
    ['atividade ônibus', 'atividade', atv], ['345.678/0001', 'cliente', null], ['p159v', 'produto', pr]]) {
    const [s, r] = await j('GET', `/busca-global?${q({ q: termo })}`);
    assert.strictEqual(s, 200);
    const achou = r.filter((x) => x.type === tipo);
    assert.ok(achou.length >= 1 && (id === null || achou.some((x) => x.id === id)), `a busca do topo "${termo}" nao achou o ${tipo}: ${JSON.stringify(r)}`);
  }
});

// ── RN-159.01: o segmento ───────────────────────────────────────────────────────────────
test('[RN-159.01, C384] GET /clientes?segmento: so o segmento escolhido (o gravado pela tela, o legado em minusculas e com espaco); vazio, espacos e nao texto = todos; com a busca, a intersecao', async () => {
  const cosm = await cliente({ razao_social: 'seg cosm rota 159', segmento: 'Cosméticos' });
  const quim = await cliente({ razao_social: 'seg quim 159', segmento: 'Químico' });
  const nenhum = await cliente({ razao_social: 'seg nenhum 159' });
  const cosmLeg = await legado('SEG COSM LEGADO 159', { segmento: 'Cosméticos' });
  const cosmEsp = await legado('SEG COSM ESPACO 159', { segmento: ' COSMÉTICOS ' });
  const fora = await legado('FORA COSM 159', { segmento: 'COSMÉTICOS' });
  assert.strictEqual((await all('SELECT segmento FROM clientes WHERE id = ?', [cosm]))[0].segmento, 'COSMÉTICOS', 'o cadastro nao gravou em maiusculas');
  const [s, l] = await j('GET', `/clientes?${q({ segmento: 'Cosméticos' })}`);
  assert.strictEqual(s, 200);
  mesmos(ids(l), [cosm, cosmLeg, cosmEsp, fora], 'segmento Cosméticos');
  assert.ok(l.every((c) => !('geo_lat' in c)), 'a lista mostrou geo_lat');
  // Fase 5 r1 M1: o segmento decomposto (NFD — "Cosme\u0301ticos") e o mesmo
  const [, lnfd] = await j('GET', `/clientes?${q({ segmento: 'Cosme\u0301ticos' })}`);
  mesmos(ids(lnfd), [cosm, cosmLeg, cosmEsp, fora], 'segmento Cosméticos decomposto');
  const [, lq] = await j('GET', `/clientes?${q({ segmento: ' QUÍMICO ' })}`);
  mesmos(ids(lq), [quim], 'segmento QUÍMICO');
  const tudo = await todosOsClientes();
  assert.ok(tudo.includes(nenhum));
  for (const u of [`/clientes?${q({ segmento: '' })}`, '/clientes?segmento=%20%20', '/clientes?segmento[]=Cosm%C3%A9ticos']) {
    const [, x] = await j('GET', u);
    mesmos(ids(x), tudo, `${u} filtrou`);
  }
  const [, inter] = await j('GET', `/clientes?${q({ segmento: 'cosméticos', search: 'seg cosm' })}`);
  mesmos(ids(inter), [cosm, cosmLeg, cosmEsp], 'segmento + busca');
});

// ── RN-159.03: a busca dos custos ───────────────────────────────────────────────────────
async function custo(corpo) {
  const [s, c] = await j('POST', '/custos-viagens', { data_viagem: '2026-10-19', destino: `DESTINO NEUTRO ${++ctx.n}`, custo_transporte: 10, ...corpo });
  assert.strictEqual(s, 200, `POST /custos-viagens: ${s} ${JSON.stringify(c)}`);
  return c;
}
test('[RN-159.03, C386] GET /custos-viagens?busca: o codigo, o cliente principal, o cliente adicional, o destino e a cidade — cada busca acha o seu e so o seu; combina com o status; codigo_visita continua', async () => {
  const principal = await cliente({ razao_social: 'busca principal são 159' });
  const adicional = await cliente({ razao_social: 'adicional ônix 159', nome_fantasia: 'fantasia ímpar 159' });
  const neutro = await cliente({ razao_social: 'neutro custos 159' });
  const c1 = await custo({ cliente_id: principal });
  const c2 = await custo({ cliente_id: neutro, clientes_viagem: [{ id: adicional, distancia_km: 5 }] });
  const c3 = await custo({ cliente_id: neutro, destino: 'Curitiba - PR', destino_cidade: 'Curitiba', destino_estado: 'PR' });
  const c4 = await custo({});
  const c5 = await custo({ cliente_id: neutro, destino: 'Rua X', destino_cidade: 'Maringá', destino_estado: 'PR' });
  // Fase 5 r3 S09/S10/S08: o principal so pelo nome fantasia; um termo so do destino; a cidade legada em minusculas, buscada em maiusculas
  const soFantasia = await cliente({ razao_social: 'razao neutra c159', nome_fantasia: 'fantasia exclusiva c6' });
  const c6 = await custo({ cliente_id: soFantasia });
  const c7 = await custo({ cliente_id: neutro, destino: 'Rua Zeta 159', destino_cidade: 'Londrina', destino_estado: 'PR' });
  const c8 = await custo({ cliente_id: neutro, destino: 'Neutro', destino_estado: 'PR' });
  await run("UPDATE custos_viagens SET destino_cidade = 'cascavél legada' WHERE id = ?", [c8.id]);
  assert.strictEqual((await all('SELECT COUNT(*) n FROM viagem_clientes WHERE custo_viagem_id = ? AND cliente_id = ?', [c2.id, adicional]))[0].n, 1, 'o adicional nao foi gravado');
  const nossos = [c1.id, c2.id, c3.id, c4.id, c5.id, c6.id, c7.id, c8.id];
  const casos = [['principal são', [c1.id]], ['PRINCIPAL SÃO', [c1.id]], ['ônix', [c2.id]], ['ímpar', [c2.id]], ['curitiba', [c3.id]],
    [c4.codigo_visita.toLowerCase(), [c4.id]], ['maringá', [c5.id]], [' busca principal ', [c1.id]], ['nada159zz', []],
    ['exclusiva c6', [c6.id]], ['rua zeta', [c7.id]], ['CASCAVÉL LEGADA', [c8.id]]];
  for (const [termo, esperado] of casos) {
    const [s, l] = await j('GET', `/custos-viagens?${q({ busca: termo })}`);
    assert.strictEqual(s, 200, JSON.stringify(l));
    mesmos(ids(l).filter((id) => nossos.includes(id)), esperado, `custos "${termo}"`);
  }
  const [, comStatus] = await j('GET', `/custos-viagens?${q({ busca: 'principal são', status_aprovacao: 'pendente' })}`);
  mesmos(ids(comStatus).filter((id) => nossos.includes(id)), [c1.id], 'busca + pendente');
  const [, aprov] = await j('GET', `/custos-viagens?${q({ busca: 'principal são', status_aprovacao: 'aprovado' })}`);
  mesmos(ids(aprov).filter((id) => nossos.includes(id)), [], 'busca + aprovado');
  const [, cod] = await j('GET', `/custos-viagens?${q({ codigo_visita: c4.codigo_visita })}`);
  mesmos(ids(cod).filter((id) => nossos.includes(id)), [c4.id], 'codigo_visita antigo');
  const [, esp] = await j('GET', `/custos-viagens?${q({ busca: '   ' })}`);
  mesmos(ids(esp).filter((id) => nossos.includes(id)), nossos, 'a busca so de espacos filtrou');
});

// ── RN-159.05 e RN-159.06 ───────────────────────────────────────────────────────────────
test('[RN-159.05, C381] POST /clientes responde o cliente gravado: a razao em maiusculas, o id do banco, o status; sem geo_* nem campo inventado; as chaves = as colunas menos geo_*', async () => {
  const [s, c] = await j('POST', '/clientes', { razao_social: 'resposta gravada 159', segmento: 'Químico', geo_lat: 5, geo_lon: 6, geo_termo: 'X', campo_que_nao_existe: 'eco' });
  assert.strictEqual(s, 200, JSON.stringify(c));
  const linha = (await all('SELECT * FROM clientes WHERE id = ?', [c.id]))[0];
  assert.ok(linha, 'o id da resposta nao existe no banco');
  assert.strictEqual(c.razao_social, 'RESPOSTA GRAVADA 159');
  assert.strictEqual(c.segmento, 'QUÍMICO');
  assert.strictEqual(c.status, 'ativo');
  assert.ok(!('campo_que_nao_existe' in c), 'a resposta ecoou o campo inventado');
  for (const k of ['geo_lat', 'geo_lon', 'geo_termo']) assert.ok(!(k in c), `a resposta mostrou ${k}`);
  const colunas = (await all('PRAGMA table_info(clientes)')).map((x) => x.name).filter((n) => !n.startsWith('geo_'));
  assert.deepStrictEqual(Object.keys(c).sort(), colunas.sort());
  assert.strictEqual(c.created_at, linha.created_at);
  const [s400, e400] = await j('POST', '/clientes', { nome_fantasia: 'sem razao' });
  assert.deepStrictEqual([s400, e400], [400, { error: 'Razão social é obrigatória' }]);
});

test('[RN-159.06, C382] POST/PUT /custos-viagens sem tipo, com nulo e so de espacos gravam IDA_E_VOLTA; o tipo e aparado; o PUT sem tipo sobre o legado registra a troca no historico', async () => {
  const semTipo = await custo({});
  const nulo = await custo({ tipo_viagem: null });
  const espacos = await custo({ tipo_viagem: '   ' });
  const ida = await custo({ tipo_viagem: ' ida ' });
  const tipoDe = async (id) => (await all('SELECT tipo_viagem FROM custos_viagens WHERE id = ?', [id]))[0].tipo_viagem;
  assert.deepStrictEqual([await tipoDe(semTipo.id), await tipoDe(nulo.id), await tipoDe(espacos.id), await tipoDe(ida.id)], ['IDA_E_VOLTA', 'IDA_E_VOLTA', 'IDA_E_VOLTA', 'IDA']);
  // o legado em minusculas, editado sem o tipo no corpo
  await run("UPDATE custos_viagens SET tipo_viagem = 'ida_e_volta' WHERE id = ?", [semTipo.id]);
  const atual = (await all('SELECT * FROM custos_viagens WHERE id = ?', [semTipo.id]))[0];
  const antes = (await all('SELECT COUNT(*) n FROM custos_viagens_historico WHERE custo_viagem_id = ?', [semTipo.id]))[0].n;
  const [sp] = await j('PUT', `/custos-viagens/${semTipo.id}`, { data_viagem: atual.data_viagem, destino: atual.destino, custo_transporte: atual.custo_transporte });
  assert.strictEqual(sp, 200);
  assert.strictEqual(await tipoDe(semTipo.id), 'IDA_E_VOLTA');
  let linhas = [];
  for (let i = 0; i < 50 && linhas.length <= antes; i++) { linhas = await all('SELECT mudancas FROM custos_viagens_historico WHERE custo_viagem_id = ? ORDER BY id', [semTipo.id]); if (linhas.length <= antes) await pausa(100); }
  assert.ok(linhas.length > antes, 'o PUT nao registrou historico');
  const m = JSON.parse(linhas[linhas.length - 1].mudancas);
  const t = m.find((x) => x.campo === 'tipo_viagem');
  assert.deepStrictEqual(t && [t.valor_anterior, t.valor_novo], ['ida_e_volta', 'IDA_E_VOLTA'], JSON.stringify(m));
  const [sp2] = await j('PUT', `/custos-viagens/${ida.id}`, { data_viagem: '2026-10-19', destino: 'X', tipo_viagem: '  ' });
  assert.strictEqual(sp2, 200);
  assert.strictEqual(await tipoDe(ida.id), 'IDA_E_VOLTA', 'o PUT com tipo so de espacos');
  // Fase 5 r3 S22: o PUT tambem apara
  const [sp3] = await j('PUT', `/custos-viagens/${ida.id}`, { data_viagem: '2026-10-19', destino: 'X', tipo_viagem: ' volta ' });
  assert.strictEqual(sp3, 200);
  assert.strictEqual(await tipoDe(ida.id), 'VOLTA', 'o PUT nao aparou o tipo');
});

// ── T6: o fluxo de tela, pelas rotas ────────────────────────────────────────────────────
test('[T6, integracao RN-159.01/02/03/05/06] cadastrar o cliente -> achar pela busca e pelo segmento -> lancar o custo sem tipo -> achar o custo pela busca e conta-lo no resumo', async () => {
  const [s, c] = await j('POST', '/clientes', { razao_social: 'são paulo indústria 159', segmento: 'Cosméticos', cidade: 'Campinas', estado: 'SP' });
  assert.strictEqual(s, 200);
  assert.strictEqual(c.razao_social, 'SÃO PAULO INDÚSTRIA 159', 'a resposta do cadastro nao trouxe o gravado');
  const [, l] = await j('GET', `/clientes?${q({ search: 'são paulo ind', segmento: 'Cosméticos' })}`);
  mesmos(ids(l), [c.id], 'busca + segmento');
  const [, r0] = await j('GET', '/custos-viagens/resumo');
  const cv = await custo({ cliente_id: c.id, custo_transporte: 1590 });
  assert.strictEqual((await all('SELECT tipo_viagem FROM custos_viagens WHERE id = ?', [cv.id]))[0].tipo_viagem, 'IDA_E_VOLTA');
  const [, lc] = await j('GET', `/custos-viagens?${q({ busca: 'são paulo indústria' })}`);
  mesmos(ids(lc), [cv.id], 'a busca dos custos pelo cliente');
  const [, r1] = await j('GET', '/custos-viagens/resumo');
  assert.strictEqual(Math.round((r1.custo_ida_volta - r0.custo_ida_volta) * 100) / 100, 1590, `o resumo: ${JSON.stringify([r0, r1])}`);
});

// ── RN-159.05: a releitura que falha (segundo boot, com a falha injetada) ───────────────
async function releituraQueFalha() {
  const nome = '[RN-159.05, Fase 2 M3/M4] a releitura do cadastro que falha: 200 { id }, o cliente no banco e o erro no log';
  try {
    if (banco) { await new Promise((r) => banco.close(() => r())); banco = null; }
    await descer();
    ctx.T = await subir({ FALHA_SQL_INJETADA: 'releitura do cadastro', FALHA_SQL_METODOS: 'get' });
    abrirCru();
    const [s, c] = await j('POST', '/clientes', { razao_social: 'releitura falha 159' });
    assert.deepStrictEqual([s, Object.keys(c || {})], [200, ['id']], JSON.stringify(c));
    assert.strictEqual(typeof c.id, 'number', 'o id da resposta nao e numero'); // Fase 5 r3 S24
    assert.strictEqual((await all('SELECT razao_social FROM clientes WHERE id = ?', [c.id]))[0].razao_social, 'RELEITURA FALHA 159');
    await pausa(300);
    const log = fs.readFileSync(logArq, 'utf8');
    assert.ok(/\[falha injetada\] SELECT \* FROM clientes WHERE id = \?/.test(log), 'a falha nao foi injetada (o cenario nao provaria nada)');
    assert.ok(new RegExp(`Erro ao reler o cliente cadastrado ${c.id}: falha injetada pelo teste`).test(log), 'o erro da releitura nao foi para o log');
    // Fase 5 r3 S17: respondeu uma vez so — o servidor segue de pe e o registro nao tem a segunda resposta
    assert.ok(!/ERR_HTTP_HEADERS_SENT|Cannot set headers/.test(log), 'a releitura que falha respondeu duas vezes');
    const [sl] = await j('GET', '/clientes');
    assert.strictEqual(sl, 200);
    assert.strictEqual(saiu, null, 'o servidor caiu depois da releitura que falha');
    passed++; console.log(`  ✓ ${nome}`);
  } catch (e) { failed++; console.error(`  ✗ ${nome}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`); }
}

(async () => {
  console.log('\n=== Etapa 159: os filtros do Comercial, a busca com acento, a resposta do cadastro e o tipo padrao (C381, C382, C384-C386) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e159-fc-'));
    ctx.T = await subir();
    abrirCru();
    for (const [name, fn] of testes) {
      if (saiu !== null) { failed++; console.error(`  ✗ ${name}: o servidor caiu antes (codigo ${saiu})`); continue; }
      try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
        failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`);
      }
    }
    await releituraQueFalha();
  } catch (e) { failed++; console.error('  ✗ preparo:', e.message); }
  if (banco) await new Promise((r) => banco.close(() => r()));
  await descer();
  try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
