/**
 * Etapa 160 (Operacional/Fabrica e Almoxarifado) — a regua da 159 chave por chave nas telas da Fabrica e nas listas do Almoxarifado, e as
 * sobras C388. Pelo `index.js` de verdade (pasta vazia). Nenhuma consulta ao servico de mapas.
 *
 *   RN-160.01 (C390)  GET /operacional/ordens-servico e /comercial/ordens-servico ?prioridade= sem caixa e aparado (o gravado e ALTA)
 *   RN-160.02 (C391)  o kanban deixa de fora concluido/cancelado (e concluida/cancelada/encerrada) e ordena pela prioridade em maiusculas
 *   RN-160.03 (C392)  as buscas da Fabrica (OS, colaboradores, equipamentos, OPs, maquinas, roteiros) pela condicaoDeBusca
 *   RN-160.04 (C393)  as buscas do Almoxarifado (materiais, retalhos, ferramentas, emprestimos) e o relatorio do historico (usuario, tipo)
 *   RN-160.07 (C388)  POST /projetos, /oportunidades, /atividades, /propostas respondem o registro gravado; a releitura que falha -> { id }
 *
 * Molde: filtrosDoComercial.api.test.js. Plano:
 * docs/superpowers/plans/2026-10-19-almoxarifado-etapa160-filtros-da-fabrica-e-do-almoxarifado.md
 * Executar: cd server && node tests/api/filtrosDaFabricaEAlmoxarifado.api.test.js
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
const SEED = { email: 'e160seed@t.com', senha: 'E160seed!senha' };
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

// insere por fora (o legado ou a linha que nenhuma rota simples cria), preenchendo as colunas NOT NULL sem padrao que o teste nao deu
async function inserir(tabela, campos) {
  const cols = await all(`PRAGMA table_info(${tabela})`);
  assert.ok(cols.length, `a tabela ${tabela} nao existe`);
  const dados = { ...campos };
  for (const c of cols) {
    if (c.pk || !c.notnull || c.dflt_value !== null || c.name in dados) continue;
    dados[c.name] = /INT|REAL|NUM/i.test(c.type) ? 0 : 'x160';
  }
  const k = Object.keys(dados);
  return (await run(`INSERT INTO ${tabela} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`, Object.values(dados))).lastID;
}
async function idsDe(tabela, where = '1=1') { return (await all(`SELECT id FROM ${tabela} WHERE ${where}`)).map((r) => r.id); }
// cada termo acha exatamente os esperados, entre os ids do cenario (o resto do banco nao conta)
async function confere(url, chave, casos, doCenario, extra = {}) {
  for (const [termo, esperado] of casos) {
    const [s, l] = await j('GET', `${url}?${q({ ...extra, [chave]: termo })}`);
    assert.strictEqual(s, 200, `${url} ${chave}="${termo}": ${s} ${JSON.stringify(l).slice(0, 200)}`);
    mesmos(ids(l).filter((id) => doCenario.includes(id)), esperado, `${url} ${chave}="${termo}"`);
  }
}
// so espacos e nao texto = sem filtro (a lista inteira, contada contra o banco); e a metade positiva: um termo sem par = nada
async function semFiltro(url, chave, todos) {
  const [, esp] = await j('GET', `${url}?${q({ [chave]: '   ' })}`);
  mesmos(ids(esp), todos, `${url}: o termo so de espacos filtrou`);
  const [, arr] = await j('GET', `${url}?${chave}[]=x160`);
  mesmos(ids(arr), todos, `${url}: o termo nao texto filtrou`);
  const [, nada] = await j('GET', `${url}?${q({ [chave]: 'inexistente160zz' })}`);
  assert.deepStrictEqual(ids(nada), [], `${url}: o termo sem par achou algo`);
}

// ── T8: a funcao direta (o escapar) ─────────────────────────────────────────────────────────
test('[RN-160.04, T8] condicaoDeBusca com { escapar: true }: \\, % e _ escapados em cada forma e o ESCAPE; sem a opcao, como na 159', () => {
  const c = condicaoDeBusca(['u.nome'], 'Jo_ão%\\', { escapar: true });
  assert.strictEqual(c.sql, "(COALESCE(u.nome, '') LIKE ? ESCAPE '\\' OR COALESCE(u.nome, '') LIKE ? ESCAPE '\\' OR COALESCE(u.nome, '') LIKE ? ESCAPE '\\')");
  assert.deepStrictEqual(c.params, ['%Jo\\_ão\\%\\\\%', '%JO\\_ÃO\\%\\\\%', '%jo\\_ão\\%\\\\%']);
  assert.deepStrictEqual(condicaoDeBusca(['u.nome'], '  ', { escapar: true }), { sql: '', params: [] });
  const sem = condicaoDeBusca(['u.nome'], 'a%');
  assert.deepStrictEqual(sem, { sql: "(COALESCE(u.nome, '') LIKE ? OR COALESCE(u.nome, '') LIKE ?)", params: ['%a%%', '%A%%'] });
});

// ── RN-160.03 e RN-160.01: as ordens de servico da Fabrica ───────────────────────────────────
test('[RN-160.03, C392] GET /operacional/ordens-servico?search: o numero e a descricao, o gravado em maiusculas e o legado; aparado; so espacos e nao texto = todas', async () => {
  const [s, os1] = await j('POST', '/operacional/ordens-servico', { numero_os: 'OS-160-1', tipo_os: 'manutencao', data_abertura: '2026-10-19',
    descricao: 'manutenção da bomba 160', prioridade: 'alta', status: 'em_andamento' });
  assert.strictEqual(s, 200, JSON.stringify(os1));
  const g = (await all('SELECT descricao, prioridade, tipo_os FROM ordens_servico WHERE id = ?', [os1.id]))[0];
  assert.deepStrictEqual({ ...g }, { descricao: 'MANUTENÇÃO DA BOMBA 160', prioridade: 'ALTA', tipo_os: 'MANUTENCAO' }, 'a rota nao gravou em maiusculas (o cenario nao seria o de producao)');
  const os2 = await inserir('ordens_servico', { numero_os: 'OS-160-2', tipo_os: 'fabricacao', data_abertura: '2026-10-19', descricao: 'calibração legada 160', prioridade: 'alta', status: 'pendente' });
  const os3 = await inserir('ordens_servico', { numero_os: 'OS-ÍMPAR-160', tipo_os: 'FABRICACAO', data_abertura: '2026-10-19', descricao: 'NEUTRA 160', prioridade: 'normal', status: 'pendente' });
  const [s4, os4] = await j('POST', '/operacional/ordens-servico', { numero_os: 'OS-160-4', tipo_os: 'reparo', data_abertura: '2026-10-19', descricao: 'sem prioridade 160' });
  assert.strictEqual(s4, 200, JSON.stringify(os4));
  const cen = [os1.id, os2, os3, os4.id];
  await confere('/operacional/ordens-servico', 'search', [
    ['manutenção', [os1.id]], ['MANUTENÇÃO', [os1.id]], [' Manutenção ', [os1.id]], ['manutenção', [os1.id]],
    ['calibração', [os2]], ['CALIBRAÇÃO', [os2]], ['ímpar', [os3]], ['os-ímpar', [os3]], ['160', cen],
  ], cen);
  await semFiltro('/operacional/ordens-servico', 'search', await idsDe('ordens_servico'));
  Object.assign(ctx, { os1: os1.id, os2, os3, os4: os4.id });
});

test('[RN-160.01, C390] ?prioridade= nas duas rotas das OS: "alta", "ALTA" e " Alta " acham o gravado ALTA e o legado alta, e so eles; vazio e nao texto = todas', async () => {
  // Fase 5 r3 S24: o cadastro nao apara (normalizarMaiusculas) — " alta " pela rota grava " ALTA "; e um legado " ALTA " por fora
  const [s5, os5] = await j('POST', '/operacional/ordens-servico', { numero_os: 'OS-160-5', tipo_os: 'reparo', data_abertura: '2026-10-19', descricao: 'com espaco 160', prioridade: ' alta ' });
  assert.strictEqual(s5, 200, JSON.stringify(os5));
  assert.strictEqual((await all('SELECT prioridade FROM ordens_servico WHERE id = ?', [os5.id]))[0].prioridade, ' ALTA ', 'o cadastro aparou (o cenario nao provaria o TRIM da coluna)');
  const os6 = await inserir('ordens_servico', { numero_os: 'OS-160-6', tipo_os: 'REPARO', data_abertura: '2026-10-19', descricao: 'legado espaco 160', prioridade: ' alta' });
  const altas = [ctx.os1, ctx.os2, os5.id, os6];
  const cen = [ctx.os1, ctx.os2, ctx.os3, ctx.os4, os5.id, os6];
  assert.strictEqual((await all('SELECT prioridade FROM ordens_servico WHERE id = ?', [ctx.os4]))[0].prioridade, 'normal', 'o padrao do banco sem prioridade');
  for (const url of ['/operacional/ordens-servico', '/comercial/ordens-servico']) {
    await confere(url, 'prioridade', [['alta', altas], ['ALTA', altas], [' Alta ', altas],
      ['normal', [ctx.os3, ctx.os4]], ['urgente', []], ['', cen], ['   ', cen]], cen);
    const [, arr] = await j('GET', `${url}?prioridade[]=alta`);
    mesmos(ids(arr).filter((id) => cen.includes(id)), cen, `${url}: a prioridade nao texto filtrou`);
    // combina com a busca (E)
    await confere(url, 'prioridade', [['alta', [ctx.os2]]], cen, { search: 'calibração' });
  }
});

test('[RN-160.02, C391] o kanban: concluido, cancelado, concluida, cancelada e encerrada fora; o status nulo dentro; a ordem URGENTE, ALTA, NORMAL, o resto', async () => {
  const os = {};
  const mk = async (nome, status, prioridade) => {
    os[nome] = await inserir('ordens_servico', { numero_os: `KB-160-${nome}`, tipo_os: 'FABRICACAO', data_abertura: '2026-10-19', status, prioridade });
    await inserir('os_itens', { os_id: os[nome], descricao: `item ${nome}` });
  };
  await mk('baixa', 'pendente', 'BAIXA');
  await mk('normal', 'em_andamento', 'normal');
  await mk('alta', 'em_andamento', 'ALTA');
  await mk('altaMin', 'pendente', 'alta');
  await mk('altaEsp', 'pendente', ' ALTA '); // Fase 5 r3 S23b: o gravado com espaco (o cadastro nao apara) fica entre as altas
  await mk('urgente', null, 'URGENTE');
  for (const st of ['concluido', 'cancelado', 'concluida', 'cancelada', 'encerrada', 'CONCLUIDO', ' cancelado ']) await mk(`fora-${st.trim()}-${st.length}`, st, 'URGENTE');
  assert.strictEqual((await all('SELECT status FROM ordens_servico WHERE id = ?', [os.urgente]))[0].status, null, 'o status nulo nao ficou nulo');
  const [s, k] = await j('GET', '/operacional/producao/kanban');
  assert.strictEqual(s, 200, JSON.stringify(k).slice(0, 200));
  const nossos = Object.values(os);
  const ordem = k.itens.map((i) => i.os_id).filter((id) => nossos.includes(id));
  const esperado = [os.urgente, os.alta, os.altaMin, os.altaEsp, os.normal, os.baixa];
  assert.deepStrictEqual(ordem, esperado, `a ordem/quem entra no kanban: ${JSON.stringify(ordem)} (esperado ${JSON.stringify(esperado)})`);
});

// ── RN-160.03: colaboradores e equipamentos ─────────────────────────────────────────────────
test('[RN-160.03, C392] GET /operacional/colaboradores?search: o nome (gravado em maiusculas pela rota, e o legado), a matricula e o CPF', async () => {
  const [s, c1] = await j('POST', '/operacional/colaboradores', { nome: 'joão da silva 160', matricula: 'M160A' });
  assert.strictEqual(s, 200, JSON.stringify(c1));
  assert.strictEqual((await all('SELECT nome FROM colaboradores WHERE id = ?', [c1.id]))[0].nome, 'JOÃO DA SILVA 160');
  const c2 = await inserir('colaboradores', { nome: 'conceição legada 160', matricula: 'M160B' });
  const c3 = await inserir('colaboradores', { nome: 'NEUTRO 160', matricula: 'MÁQ-160' });
  const c4 = await inserir('colaboradores', { nome: 'OUTRO 160', matricula: 'M160D', cpf: '987.654.321-60' });
  const cen = [c1.id, c2, c3, c4];
  await confere('/operacional/colaboradores', 'search', [
    ['joão', [c1.id]], ['JOÃO', [c1.id]], [' João da Silva ', [c1.id]], ['conceição', [c2]], ['CONCEIÇÃO', [c2]],
    ['máq-160', [c3]], [' 987.654 ', [c4]], ['160', cen],
  ], cen);
  await semFiltro('/operacional/colaboradores', 'search', await idsDe('colaboradores'));
  ctx.colab = c1.id;
});

test('[RN-160.03, C392] GET /operacional/equipamentos?search: o nome e o modelo (maiusculas pela rota), o codigo e o legado', async () => {
  const [s, e1] = await j('POST', '/operacional/equipamentos', { codigo: 'EQ160A', nome: 'prensa hidráulica 160' });
  assert.strictEqual(s, 200, JSON.stringify(e1));
  const [s2, e2] = await j('POST', '/operacional/equipamentos', { codigo: 'EQ160B', nome: 'neutro eq 160', modelo: 'série ômega' });
  assert.strictEqual(s2, 200, JSON.stringify(e2));
  assert.strictEqual((await all('SELECT modelo FROM equipamentos WHERE id = ?', [e2.id]))[0].modelo, 'SÉRIE ÔMEGA');
  const e3 = await inserir('equipamentos', { codigo: 'EQ-ÁGUA-160', nome: 'NEUTRO EQ C 160' });
  const e4 = await inserir('equipamentos', { codigo: 'EQ160D', nome: 'válvula legada 160' });
  const cen = [e1.id, e2.id, e3, e4];
  await confere('/operacional/equipamentos', 'search', [
    ['hidráulica', [e1.id]], ['HIDRÁULICA', [e1.id]], [' Prensa Hidráulica ', [e1.id]], ['ômega', [e2.id]], ['eq-água', [e3]],
    ['válvula', [e4]], ['VÁLVULA', [e4]], ['160', cen],
  ], cen);
  await semFiltro('/operacional/equipamentos', 'search', await idsDe('equipamentos'));
});

// ── RN-160.03: a producao (OPs, maquinas, roteiros) ─────────────────────────────────────────
test('[RN-160.03, C392] GET /producao/ops?search: o numero, a descricao, o codigo do produto, o numero da OS e a razao social do cliente (em maiusculas)', async () => {
  const [s0] = await j('GET', '/producao/maquinas'); // cria as tabelas da producao (ensureSchema)
  assert.strictEqual(s0, 200);
  const [sc, cli] = await j('POST', '/clientes', { razao_social: 'são josé tubos 160' });
  assert.strictEqual(sc, 200);
  let n = 0;
  const op = (campos) => { n += 1; return inserir('producao_ops', { numero_op: `OP-160-${n}`, produto_descricao: 'NEUTRO OP', status: 'planejada', prioridade: 'normal', ativo: 1, ...campos }); };
  const o1 = await op({ cliente_id: cli.id });
  const o2 = await op({ produto_descricao: 'EIXO ÁRVORE 160' });
  const o3 = await op({ produto_codigo: 'CÓD-160' });
  const o4 = await op({ numero_op: 'OP-ÚNICA-160' });
  const o5 = await op({ os_id: ctx.os3 });
  const o6 = await op({ produto_descricao: 'roda dentada legada 160' });
  const cen = [o1, o2, o3, o4, o5, o6];
  await confere('/producao/ops', 'search', [
    ['são josé', [o1]], ['SÃO JOSÉ', [o1]], ['árvore', [o2]], ['cód-160', [o3]], ['op-única', [o4]], [' ímpar ', [o5]],
    ['RODA DENTADA', [o6]], ['inexistente160zz', []],
  ], cen);
  const [, esp] = await j('GET', `/producao/ops?${q({ search: '   ' })}`);
  mesmos(ids(esp).filter((id) => cen.includes(id)), cen, 'OPs: o termo so de espacos filtrou');
  const [, arr] = await j('GET', '/producao/ops?search[]=x160');
  mesmos(ids(arr).filter((id) => cen.includes(id)), cen, 'OPs: o termo nao texto filtrou');
});

test('[RN-160.03, C392] GET /producao/maquinas e /producao/roteiros?search: cada coluna com o seu caso', async () => {
  const [s, m1] = await j('POST', '/producao/maquinas', { codigo: 'mq160a', nome: 'torno revólver 160', setor: 'Manutenção' });
  assert.strictEqual(s, 201, JSON.stringify(m1));
  const m2 = await inserir('producao_maquinas', { codigo: 'MQ160B', nome: 'NEUTRA MQ', centro_trabalho: 'CÉLULA 160', ativo: 1 });
  const m3 = await inserir('producao_maquinas', { codigo: 'MQ-ÍNDIO-160', nome: 'NEUTRA MQ C', ativo: 1 });
  const cen = [m1.id, m2, m3];
  await confere('/producao/maquinas', 'search', [
    ['REVÓLVER', [m1.id]], ['MANUTENÇÃO', [m1.id]], ['célula', [m2]], ['mq-índio', [m3]], [' mq160a ', [m1.id]],
  ], cen);
  await semFiltro('/producao/maquinas', 'search', await idsDe('producao_maquinas', 'ativo = 1'));
  const r1 = await inserir('producao_roteiros', { produto_codigo: 'RT-Ç-160', produto_descricao: 'NEUTRO RT', ativo: 1 });
  const r2 = await inserir('producao_roteiros', { produto_codigo: 'RT160B', produto_descricao: 'CONJUNTO HÉLICE 160', ativo: 1 });
  await confere('/producao/roteiros', 'search', [['rt-ç', [r1]], ['hélice', [r2]], ['  ', [r1, r2]]], [r1, r2]);
});

// ── RN-160.04: o Almoxarifado ───────────────────────────────────────────────────────────────
test('[RN-160.04, C393] GET /almoxarifado/materiais?search: o nome, o codigo, a descricao, o fornecedor e o legado em minusculas; aparado', async () => {
  const mat = (campos) => inserir('materiais_almoxarifado', { ativo: 1, ...campos });
  const a = await mat({ codigo: 'MAT-160-1', nome: 'VÁLVULA ESFERA 160' });
  const b = await mat({ codigo: 'MAT-ÊXITO-160', nome: 'NEUTRO MAT B' });
  const c = await mat({ codigo: 'MAT-160-3', nome: 'NEUTRO MAT C', descricao: 'TUBO DE AÇO INOX' });
  const d = await mat({ codigo: 'MAT-160-4', nome: 'NEUTRO MAT D', fornecedor_principal: 'FORNECEDOR SÃO PEDRO' });
  const e = await mat({ codigo: 'MAT-160-5', nome: 'junta de vedação legada' });
  const cen = [a, b, c, d, e];
  await confere('/almoxarifado/materiais', 'search', [
    ['válvula', [a]], [' Válvula Esfera ', [a]], ['mat-êxito', [b]], ['aço inox', [c]], ['são pedro', [d]], ['VEDAÇÃO', [e]], ['vedação', [e]],
  ], cen);
  await semFiltro('/almoxarifado/materiais', 'search', await idsDe('materiais_almoxarifado'));
  ctx.mat = a;
});

test('[RN-160.04, C393] retalhos (?q), ferramentas (?busca) e emprestimos (?colaborador): cada coluna e o legado', async () => {
  const s = (campos) => inserir('sobras_material_almoxarifado', { material_id: ctx.mat, status: 'DISPONIVEL', ...campos });
  const s1 = await s({ norma: 'NORMA ÁGIL 160' });
  const s2 = await s({ dimensoes_originais: 'CHAPA ÚNICA 160' });
  const s3 = await s({ dimensoes_restantes: 'SOBRA ÊXITO 160' });
  const s4 = await s({ material_descricao: 'retalho de alumínio 160' });
  const cenS = [s1, s2, s3, s4];
  await confere('/almoxarifado/sobras', 'q', [['ágil', [s1]], ['única', [s2]], [' êxito ', [s3]], ['ALUMÍNIO', [s4]]], cenS);
  await semFiltro('/almoxarifado/sobras', 'q', await idsDe('sobras_material_almoxarifado'));
  const f = (campos) => inserir('ferramentas_almoxarifado', { ativo: 1, status: 'DISPONIVEL', ...campos });
  const f1 = await f({ codigo_patrimonio: 'PAT-ÉPICO-160', nome: 'NEUTRA F' });
  const f2 = await f({ codigo_patrimonio: 'PAT-160-2', nome: 'CHAVE ÍNDIGO 160' });
  const f3 = await f({ codigo_patrimonio: 'PAT-160-3', nome: 'martelo de borracha ção 160' });
  await confere('/almoxarifado/ferramentas', 'busca', [['pat-épico', [f1]], ['índigo', [f2]], [' MARTELO DE BORRACHA ÇÃO ', [f3]]], [f1, f2, f3]);
  await semFiltro('/almoxarifado/ferramentas', 'busca', await idsDe('ferramentas_almoxarifado', 'ativo = 1'));
  const e1 = await inserir('emprestimos_ferramenta_almoxarifado', { ferramenta_id: f1, colaborador_nome: 'JOSÉ EMPRESTADOR 160', status: 'DEVOLVIDA' });
  const e2 = await inserir('emprestimos_ferramenta_almoxarifado', { ferramenta_id: f2, colaborador_nome: 'mônica legada 160', status: 'DEVOLVIDA' });
  await confere('/almoxarifado/emprestimos', 'colaborador', [['josé', [e1]], [' MÔNICA ', [e2]]], [e1, e2]);
  await semFiltro('/almoxarifado/emprestimos', 'colaborador', await idsDe('emprestimos_ferramenta_almoxarifado'));
});

test('[RN-160.04, C393] o relatorio Historico de movimentacoes: o usuario com acento (e % e _ como texto), o tipo aparado e em maiusculas; a nota nova', async () => {
  const mv = (campos) => inserir('movimentacoes_almoxarifado', { material_id: ctx.mat, quantidade: 1, cancelado: 0, ...campos });
  const m1 = await mv({ tipo: 'SAIDA', usuario_nome: 'JOÃO OPERADOR 160' });
  const m2 = await mv({ tipo: 'ENTRADA', usuario_nome: 'MARIA_SILVA 160' });
  const m3 = await mv({ tipo: 'ENTRADA', usuario_nome: 'MARIAXSILVA 160' });
  const m4 = await mv({ tipo: 'SAIDA', usuario_nome: 'ana 100% 160' });
  const m5 = await mv({ tipo: 'SAIDA', usuario_nome: 'ana 100x 160' });
  // Fase 5 r3 S26: a barra invertida tambem e texto pela rota (sem escapa-la, "\p" vira "p" no ESCAPE e nao acha "C:\PASTA")
  const m6 = await mv({ tipo: 'AJUSTE_POSITIVO', usuario_nome: 'C:\\PASTA 160' });
  const m7 = await mv({ tipo: 'AJUSTE_POSITIVO', usuario_nome: 'C:PASTA 160' });
  const cen = [m1, m2, m3, m4, m5, m6, m7];
  const url = '/almoxarifado/relatorios/historico-movimentacoes';
  await confere(url, 'usuario', [['joão', [m1]], [' João Operador ', [m1]], ['maria_silva', [m2]], ['100%', [m4]], ['c:\\pasta', [m6]], ['160', cen]], cen);
  await confere(url, 'tipo', [[' saida ', [m1, m4, m5]], ['Entrada', [m2, m3]], ['', cen], ['   ', cen]], cen);
  const [, arr] = await j('GET', `${url}?tipo[]=SAIDA`);
  mesmos(ids(arr).filter((id) => cen.includes(id)), cen, 'o tipo nao texto filtrou');
  await confere(url, 'usuario', [['joão', [m1]]], cen, { tipo: 'saida' });
  const [sr, reg] = await j('GET', '/almoxarifado/relatorios');
  assert.strictEqual(sr, 200);
  const h = reg.relatorios.find((r) => r.tipo === 'historico-movimentacoes');
  assert.ok(/A busca por usuário ignora maiúsculas e minúsculas, mas não o acento \(um nome antigo com letras acentuadas maiúsculas e minúsculas misturadas só é achado com a mesma grafia\)\./.test(h.nota), `a nota: ${h.nota}`);
  assert.ok(!/só em letras sem acento/.test(h.nota), 'a nota velha continua');
});

// ── RN-160.07: os quatro cadastros respondem o gravado ──────────────────────────────────────
async function chavesDe(tabela) { return (await all(`PRAGMA table_info(${tabela})`)).map((c) => c.name).sort(); }
test('[RN-160.07, C388] POST /projetos, /oportunidades, /atividades: o registro gravado (as colunas do banco, os padroes, em maiusculas), sem o campo inventado', async () => {
  for (const [rota, tabela, corpo, campo, gravado] of [
    ['/projetos', 'projetos', { nome: 'projeto ação 160' }, 'nome', 'PROJETO AÇÃO 160'],
    ['/oportunidades', 'oportunidades', { titulo: 'oportunidade ação 160' }, 'titulo', 'OPORTUNIDADE AÇÃO 160'],
    ['/atividades', 'atividades', { titulo: 'atividade ação 160', cliente_id: '' }, 'titulo', 'ATIVIDADE AÇÃO 160'],
  ]) {
    const [s, r] = await j('POST', rota, { ...corpo, campo_inventado_160: 'x', id: 999999 });
    assert.strictEqual(s, 200, `${rota}: ${s} ${JSON.stringify(r)}`);
    assert.deepStrictEqual(Object.keys(r).sort(), await chavesDe(tabela), `${rota}: as chaves da resposta nao sao as colunas`);
    const [linha] = await all(`SELECT * FROM ${tabela} WHERE id = ?`, [r.id]);
    assert.deepStrictEqual(r, { ...linha }, `${rota}: a resposta nao e o gravado`);
    assert.strictEqual(r[campo], gravado);
    assert.ok(r.status, `${rota}: sem o status padrao`);
  }
  const [, a] = await j('POST', '/atividades', { titulo: 'atividade padrao 160' });
  assert.deepStrictEqual([a.tipo, a.prioridade, a.status, a.cliente_id], ['reuniao', 'media', 'pendente', null], `os padroes da atividade: ${JSON.stringify(a)}`);
});

test('[RN-160.07, C388, Fase 2 I2] POST /propostas: a linha gravada (sem itens); o numero enviado que ja existe volta o numero GRAVADO', async () => {
  const [, cli] = await j('POST', '/clientes', { razao_social: 'cliente proposta 160' });
  const corpo = { titulo: 'proposta ação 160', cliente_id: cli.id, campo_inventado_160: 'x' };
  const [s, p] = await j('POST', '/propostas', corpo);
  assert.strictEqual(s, 200, JSON.stringify(p));
  assert.deepStrictEqual(Object.keys(p).sort(), await chavesDe('propostas'), 'as chaves da resposta nao sao as colunas da proposta');
  const [linha] = await all('SELECT * FROM propostas WHERE id = ?', [p.id]);
  assert.deepStrictEqual(p, { ...linha });
  assert.ok(p.numero_proposta, 'sem o numero');
  const [s2, p2] = await j('POST', '/propostas', { ...corpo, numero_proposta: p.numero_proposta });
  assert.strictEqual(s2, 200, JSON.stringify(p2));
  const [l2] = await all('SELECT numero_proposta FROM propostas WHERE id = ?', [p2.id]);
  assert.notStrictEqual(l2.numero_proposta, p.numero_proposta, 'o servidor gravou o numero repetido (o cenario nao provaria nada)');
  assert.strictEqual(p2.numero_proposta, l2.numero_proposta, `a resposta trouxe o numero enviado (${p2.numero_proposta}), nao o gravado (${l2.numero_proposta})`);
});

// ── T8: a integracao pelas rotas ────────────────────────────────────────────────────────────
test('[T8] o fluxo: o colaborador cadastrado acha por "joão"; a OS "alta" acha pelo filtro, entra no kanban antes da normal e sai ao concluir; o projeto responde o que o GET devolve', async () => {
  const [, l] = await j('GET', `/operacional/colaboradores?${q({ search: 'joão da' })}`);
  assert.deepStrictEqual(ids(l), [ctx.colab]);
  const [s, os] = await j('POST', '/operacional/ordens-servico', { numero_os: 'OS-160-T8', tipo_os: 'fabricacao', data_abertura: '2026-10-19', prioridade: 'alta', status: 'em_andamento', descricao: 'fluxo t8' });
  assert.strictEqual(s, 200);
  const [, osn] = await j('POST', '/operacional/ordens-servico', { numero_os: 'OS-160-T8N', tipo_os: 'fabricacao', data_abertura: '2026-10-19', prioridade: 'normal', status: 'em_andamento', descricao: 'fluxo t8' });
  await inserir('os_itens', { os_id: osn.id, descricao: 'item t8 normal' });
  await inserir('os_itens', { os_id: os.id, descricao: 'item t8 alta' });
  const [, lp] = await j('GET', `/operacional/ordens-servico?${q({ prioridade: 'alta', search: 'fluxo t8' })}`);
  assert.deepStrictEqual(ids(lp), [os.id]);
  const ordem = async () => (await j('GET', '/operacional/producao/kanban'))[1].itens.map((i) => i.os_id).filter((id) => [os.id, osn.id].includes(id));
  assert.deepStrictEqual(await ordem(), [os.id, osn.id], 'a alta nao veio antes da normal');
  const [, cheia] = await j('GET', `/operacional/ordens-servico/${os.id}`);
  const [sp, rp] = await j('PUT', `/operacional/ordens-servico/${os.id}`, { ...cheia, status: 'concluido' });
  assert.strictEqual(sp, 200, JSON.stringify(rp));
  assert.deepStrictEqual(await ordem(), [osn.id], 'a OS concluida continuou no kanban');
  const [, pj] = await j('POST', '/projetos', { nome: 'projeto t8' });
  const [, pg] = await j('GET', `/projetos/${pj.id}`);
  assert.deepStrictEqual(pj, pg, 'a resposta do cadastro nao e o que o GET devolve');
});

// ── RN-160.07: a releitura que falha (segundo boot, com a falha injetada) ───────────────────
async function releituraQueFalha() {
  const nome = '[RN-160.07, Fase 2 M4] a releitura que falha nos quatro cadastros: 200 { id } ({ id, numero_proposta }), o registro no banco e o erro no log';
  try {
    if (banco) { await new Promise((r) => banco.close(() => r())); banco = null; }
    await descer();
    ctx.T = await subir({ FALHA_SQL_INJETADA: 'releitura d[oa] (projeto|oportunidade|atividade|proposta) cadastrad', FALHA_SQL_METODOS: 'get' });
    abrirCru();
    const [, cli] = await j('POST', '/clientes', { razao_social: 'cliente releitura 160' });
    for (const [rota, tabela, corpo, frase, chaves] of [
      ['/projetos', 'projetos', { nome: 'releitura 160' }, 'o projeto cadastrado', ['id']],
      ['/oportunidades', 'oportunidades', { titulo: 'releitura 160' }, 'a oportunidade cadastrada', ['id']],
      ['/atividades', 'atividades', { titulo: 'releitura 160' }, 'a atividade cadastrada', ['id']],
      ['/propostas', 'propostas', { titulo: 'releitura 160', cliente_id: cli.id }, 'a proposta cadastrada', ['id', 'numero_proposta']],
    ]) {
      const [s, r] = await j('POST', rota, corpo);
      assert.deepStrictEqual([s, Object.keys(r || {})], [200, chaves], `${rota}: ${JSON.stringify(r)}`);
      assert.strictEqual(typeof r.id, 'number');
      const [linha] = await all(`SELECT * FROM ${tabela} WHERE id = ?`, [r.id]);
      assert.ok(linha, `${rota}: o registro nao ficou no banco`);
      if (tabela === 'propostas') assert.strictEqual(r.numero_proposta, linha.numero_proposta);
      await pausa(300);
      const log = fs.readFileSync(logArq, 'utf8');
      assert.ok(new RegExp(`\\[falha injetada\\] SELECT \\* FROM ${tabela} WHERE id = \\?`).test(log), `${rota}: a falha nao foi injetada (o cenario nao provaria nada)`);
      assert.ok(new RegExp(`Erro ao reler ${frase} ${r.id}: falha injetada pelo teste`).test(log), `${rota}: o erro da releitura nao foi para o log`);
    }
    assert.ok(!/ERR_HTTP_HEADERS_SENT|Cannot set headers/.test(fs.readFileSync(logArq, 'utf8')), 'a releitura que falha respondeu duas vezes');
    assert.strictEqual(saiu, null, 'o servidor caiu depois da releitura que falha');
    passed++; console.log(`  ✓ ${nome}`);
  } catch (e) { failed++; console.error(`  ✗ ${nome}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`); }
}

(async () => {
  console.log('\n=== Etapa 160: os filtros da Fabrica e do Almoxarifado e a resposta dos cadastros (C388, C390-C393) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e160-ff-'));
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
