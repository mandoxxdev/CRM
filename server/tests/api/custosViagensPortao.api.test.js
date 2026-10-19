/**
 * Etapa 152 (Comercial) — as 19 rotas dos custos de viagem exigem o Comercial pela regua da TELA, e o resumo da tela volta a responder.
 * Pelo `index.js` de verdade (pasta vazia): C350, C356.
 *
 *   RN-152.01  as 19 passam pelo `exigirComercialNasPropostas` logo depois do login (no comprovante, antes do multer: o arquivo do barrado
 *              nao chega ao disco)
 *   RN-152.02  GET /api/custos-viagens/resumo registrado antes do GET /:id — responde o resumo (antes: 404 "Custo de viagem nao
 *              encontrado", o /:id atendia com id = 'resumo')
 *   RN-152.03  PROPOSTAS_PORTAO_DE_MODULO=desligado: as 19 voltam ao so login; o aviso do boot as cita
 *
 * Molde: clientesProjetosPortao.api.test.js (Etapa 151). Plano:
 * docs/superpowers/plans/2026-10-19-almoxarifado-etapa152-custos-de-viagem-pelo-modulo.md
 * Executar: cd server && node tests/api/custosViagensPortao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const regua = require('../helpers/reguaDoFonteDoServidor');

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
  if (body instanceof FormData) corpo = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; corpo = JSON.stringify(body); }
  const r = await fetch(`http://127.0.0.1:${porta}${u}`, { method: m, headers, body: corpo, signal: AbortSignal.timeout(ms) });
  const buf = Buffer.from(await r.arrayBuffer());
  let x = buf.toString('utf8'); try { x = JSON.parse(x); } catch (e) { /* sem JSON */ }
  return [r.status, x, buf];
}
const j = (m, u, tok, body, ms) => cru(m, `/api${u}`, tok, body, ms);
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e152seed@t.com', senha: 'E152seed!senha' };
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

// ── o arquivo, por fora ───────────────────────────────────────────────────────────────────
let banco = null;
function abrirCru() {
  banco = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  banco.configure('busyTimeout', 15000);
}
const run = (sql, p = []) => new Promise((res, rej) => banco.run(sql, p, function feito(e) { if (e) rej(e); else res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => banco.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const ctx = { n: 0 };
const { temModuloComoATela } = require('../../services/portaoDasPropostas');

const NEGADO_COM = { error: 'Acesso negado ao módulo', modulo: 'comercial' };
const COMPROVANTE = Buffer.from('comprovante da etapa 152 — recibo do hotel', 'utf8');
const CAMPOS_RESUMO = ['total_viagens', 'total_custo_geral', 'custo_medio_viagem', 'clientes_visitados', 'propostas_relacionadas', 'custo_ida', 'custo_volta', 'custo_ida_volta'];

// ── as rotas, lidas do fonte ──────────────────────────────────────────────────────────────
const FONTE = fs.readFileSync(path.join(SERVER_DIR, 'index.js'), 'utf8');
const REGISTRO = /^app\.(get|post|put|patch|delete)\('([^']+)', ([^\n]*)$/gm;
const TODOS = [...FONTE.matchAll(REGISTRO)].map((m) => ({ metodo: m[1].toUpperCase(), rota: m[2], resto: m[3], pos: m.index }));
const B = '/api/custos-viagens';
// as 19, na ordem em que o laco as chama (o DELETE do comprovante depois do download; o DELETE do custo quase no fim)
const DEZENOVE_DEF = [
  ['GET', `${B}/coordenadas-cliente/:cliente_id`], ['GET', `${B}/clientes-proximos/:cliente_id`], ['GET', `${B}/calcular-rota`],
  ['GET', B], ['GET', `${B}/resumo`], ['GET', `${B}/:id`], ['GET', `${B}/verificar-elegibilidade/:cliente_id`],
  ['POST', B], ['PUT', `${B}/:id`], ['POST', `${B}/:id/aprovar`], ['GET', `${B}/:id/logs-autorizacao`], ['POST', `${B}/:id/duplicar`],
  ['POST', `${B}/:id/comprovante`], ['GET', `${B}/:id/comprovantes`], ['GET', `${B}/:id/comprovante/:anexo_id`],
  ['DELETE', `${B}/:id/comprovante/:anexo_id`], ['GET', `${B}/:id/historico`], ['DELETE', `${B}/:id`], ['GET', `${B}/analise/cliente`],
];
const achar = ([m, r]) => (TODOS.find((x) => x.metodo === m && x.rota === r) || { metodo: m, rota: r, resto: '(nao registrada)', pos: -1 });
const DEZENOVE = DEZENOVE_DEF.map(achar);

function caminhoDe(r) {
  // o DELETE do custo vai num custo virgem: o editado ou o autorizado sem regras nao apaga (500 de chave estrangeira — C359, de antes)
  const idDoCusto = r.metodo === 'DELETE' && r.rota === `${B}/:id` ? ctx.apagar : ctx.custo;
  let u = r.rota.replace(':cliente_id', String(ctx.cliente)).replace(':anexo_id', String(ctx.anexo)).replace(':id', String(idDoCusto));
  if (r.rota.endsWith('/calcular-rota')) u += '?destino_cidade=Campinas&destino_estado=SP&tipo_viagem=ida_e_volta&numero_pessoas=1';
  if (r.rota === B && r.metodo === 'GET') u += `?cliente_id=${ctx.cliente}&status_aprovacao=pendente`;
  return u;
}
function corpoDe(r) {
  if (r.metodo === 'GET' || r.metodo === 'DELETE') return undefined;
  if (r.rota.endsWith('/comprovante')) {
    const fd = new FormData();
    fd.append('tipo_comprovante', 'hotel');
    fd.append('arquivo', new Blob([Buffer.from('arquivo do barrado 152')], { type: 'text/plain' }), 'barrado152.txt');
    return fd;
  }
  if (r.rota.endsWith('/aprovar')) return { aprovado: true, motivo: `APROVADO PELO BARRADO ${++ctx.n}` };
  if (r.rota.endsWith('/duplicar')) return {};
  return {
    data_viagem: '2026-10-20', destino: `DESTINO DO BARRADO ${++ctx.n}`, destino_cidade: 'Campinas', destino_estado: 'SP', cliente_id: ctx.cliente,
    custo_transporte: 777, clientes_viagem: [{ id: ctx.cliente2, distancia_km: 10 }], autorizado_sem_regras: true, motivo_autorizacao: 'pelo barrado',
  };
}
const chamar = (r, tok) => cru(r.metodo, caminhoDe(r), tok, corpoDe(r));

function arquivosDaPasta() {
  const out = [];
  const andar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'backups') andar(p); }
      else if (!/database\.sqlite|index\.log|\.runtime-secrets/.test(e.name)) out.push(path.relative(pasta, p));
    }
  };
  andar(pasta);
  return out.sort();
}
const TABELAS = ['custos_viagens', 'custos_viagens_anexos', 'custos_viagens_historico', 'viagem_clientes', 'logs_autorizacao_viagens'];
const retrato = async () => JSON.stringify(await Promise.all(TABELAS.map((t) => all(`SELECT * FROM ${t} ORDER BY id`))));
const negados = async (id) => all("SELECT modulo, nome_modulo, COUNT(*) AS n FROM logs_auditoria WHERE tipo = 'acesso_negado' AND usuario_id = ? GROUP BY modulo, nome_modulo ORDER BY modulo", [id]);

async function usuario(nome, { role = 'usuario', grupos = [], diretas = [], diretasCrus = [], diretasGrupo0 = [], adminModulos = null } = {}) {
  const email = `${nome}@e152.t`;
  const [s, u] = await j('POST', '/usuarios', ctx.T, { nome, email, senha: 'Senha!152c', cargo: 'C', role, setor: '' });
  assert.ok(s === 200 || s === 201, `usuario ${nome}: ${s} ${JSON.stringify(u)}`);
  const id = (await all('SELECT id FROM usuarios WHERE email = ?', [email]))[0].id;
  for (const g of grupos) await run('INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES (?, ?)', [id, g]);
  for (const m of diretas) await run("INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, NULL, ?, 'acesso', 1)", [id, m]);
  for (const [m, acao, p] of diretasCrus) await run('INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, NULL, ?, ?, ?)', [id, m, acao, p]);
  for (const m of diretasGrupo0) await run("INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, 0, ?, 'acesso', 1)", [id, m]);
  if (adminModulos) await run('UPDATE usuarios SET admin_modulos = ? WHERE id = ?', [JSON.stringify(adminModulos), id]);
  return { id, nome, role, email, adminModulos };
}
async function logar(u) {
  const [s, l] = await j('POST', '/auth/login', null, { email: u.email, senha: 'Senha!152c' });
  assert.strictEqual(s, 200, `login ${u.nome}: ${JSON.stringify(l)}`);
  u.T = l.token;
}
// um custo com um comprovante, lancado pelo administrador (o que as rotas com :id e :anexo_id vao achar)
async function custoComComprovante(destino) {
  const [sc, c] = await j('POST', '/custos-viagens', ctx.T, { data_viagem: '2026-10-19', destino, destino_cidade: 'Campinas', destino_estado: 'SP', cliente_id: ctx.cliente, custo_transporte: 100, custo_hospedagem: 50 });
  assert.strictEqual(sc, 200, JSON.stringify(c));
  const fd = new FormData();
  fd.append('tipo_comprovante', 'hotel');
  fd.append('arquivo', new Blob([COMPROVANTE], { type: 'text/plain' }), 'recibo152.txt');
  const [sa, a] = await j('POST', `/custos-viagens/${c.id}/comprovante`, ctx.T, fd);
  assert.strictEqual(sa, 200, JSON.stringify(a));
  const [sv, v] = await j('POST', '/custos-viagens', ctx.T, { data_viagem: '2026-10-18', destino: `${destino} VIRGEM`, custo_transporte: 10 });
  assert.strictEqual(sv, 200, JSON.stringify(v));
  return { custo: c.id, anexo: a.id, apagar: v.id };
}

// ── RN-152.01/02: a regua pelo fonte ──────────────────────────────────────────────────────
test('[RN-152.01/02, C350] fonte: as 19 com o exigirComercialNasPropostas como 2o middleware (antes do multer no comprovante), cada uma registrada uma vez e so no index.js; o resumo antes do /:id', () => {
  assert.deepStrictEqual(DEZENOVE.filter((r) => r.resto === '(nao registrada)').map((r) => `${r.metodo} ${r.rota}`), [], 'uma rota sumiu do fonte');
  const esperado = DEZENOVE_DEF.map(([m, r]) => `${m} ${r}`).sort();
  // regua no TEXTO INTEIRO (o \s atravessa a quebra de linha), sem diferenciar a caixa (o Express nao diferencia): todo registro (qualquer
  // verbo, use/all/route, qualquer aspa, caminho em lista) do prefixo — um segundo registro na mesma linha, em duas linhas ou em lista
  const reTodos = /\.(get|post|put|patch|delete|all|use|route)\(\s*\[?\s*["'`](\/(?:api\/)?custos-viagens(?:\/[^"'`]*)?)["'`]/gi;
  assert.deepStrictEqual([...FONTE.matchAll(reTodos)].map((m) => `${m[1].toUpperCase()} ${m[2]}`).sort(), esperado,
    'um registro a mais (na mesma linha, em duas linhas, em lista ou com outra caixa) escaparia do portao');
  // a regua de todo o servidor (helper da Etapa 152): nenhum registro com o caminho que nao e texto literal, nenhum caminho montado que
  // possa virar /api/custos-viagens*, nenhum registro fora do index.js
  assert.deepStrictEqual(regua.registrosNaoLiterais([B]), regua.REGISTROS_NAO_LITERAIS_MEDIDOS, 'um registro com o caminho que nao e texto literal (ou montado) escaparia das reguas do fonte');
  const { fora, vistos } = regua.registrosForaDoIndex(/["'`]\/(api\/)?custos-viagens/i);
  assert.deepStrictEqual(fora, [], 'rota registrada fora do index.js escaparia desta regua');
  assert.ok(vistos.includes(path.join('routes', 'almoxarifado.js')) && vistos.includes(path.join('services', 'portaoDasPropostas.js')), 'a varredura nao enxerga routes/ ou services/');
  assert.ok(!/app\.use\(\s*\[?\s*["'`]\/(api\/)?custos-viagens/i.test(FONTE), 'um app.use no prefixo atenderia antes do portao');
  const sem = DEZENOVE.filter((r) => !r.resto.startsWith('authenticateToken, exigirComercialNasPropostas, '))
    .map((r) => `${r.metodo} ${r.rota}: ${r.resto.slice(0, 80)}`);
  assert.deepStrictEqual(sem, []);
  assert.ok(achar(['POST', `${B}/:id/comprovante`]).resto.startsWith("authenticateToken, exigirComercialNasPropostas, uploadComprovante.single('arquivo'), "), 'o comprovante: o multer antes do portao');
  // RN-152.02: todo GET de um segmento literal (resumo, calcular-rota...) registrado antes do GET /:id — senao o /:id o atende
  const porId = achar(['GET', `${B}/:id`]).pos;
  const depois = TODOS.filter((x) => x.metodo === 'GET' && /^\/api\/custos-viagens\/[^/:]+$/.test(x.rota) && x.pos > porId).map((x) => x.rota);
  assert.deepStrictEqual(depois, [], 'RN-152.02: um GET de um segmento registrado depois do /:id nunca e atendido');
  assert.ok(porId > 0 && achar(['GET', `${B}/resumo`]).pos < porId, 'o resumo depois do /:id');
});

// ── RN-152.01: pela rota, cada uma das 19 ─────────────────────────────────────────────────
test('[RN-152.01, C350] o usuario que a tela barra do Comercial (so a direta do Almoxarifado) toma 403 em cada uma das 19 — e nada muda, nem no disco; a lista de clientes ele le', async () => {
  const b = ctx.u.soAlmox;
  const antes = await retrato();
  const arquivos0 = arquivosDaPasta();
  assert.ok(antes.includes('CUSTO 152') && antes.includes('recibo152.txt'), 'o retrato nao ve o que o preparo gravou');
  assert.ok(arquivos0.some((a) => /comprovante_/.test(a)), 'a pasta nao tem o comprovante do preparo (o retrato do disco nao veria nada)');
  assert.deepStrictEqual(await negados(b.id), [], 'o usuario barrado ja tinha log');
  const errados = [];
  for (const r of DEZENOVE) {
    const [s, x] = await chamar(r, b.T);
    if (s !== 403 || JSON.stringify(x) !== JSON.stringify(NEGADO_COM)) errados.push(`${r.metodo} ${r.rota}: ${s} ${JSON.stringify(x).slice(0, 80)}`);
  }
  assert.deepStrictEqual(errados, []);
  await pausa(1500);
  assert.strictEqual(await retrato(), antes, 'uma rota barrada mudou um custo, um anexo, o historico, os clientes da viagem ou o log de autorizacao');
  assert.deepStrictEqual(arquivosDaPasta(), arquivos0, 'o comprovante do barrado chegou ao disco');
  assert.deepStrictEqual(await negados(b.id), [{ modulo: 'comercial', nome_modulo: 'Comercial', n: 19 }], 'cada 403 registra o acesso negado no log, com o modulo do portao');
  // a metade positiva: a lista de clientes (aberta desde a 151 — o Almoxarifado a le) — sem log novo
  const [sc, cl] = await j('GET', '/clientes', b.T);
  assert.ok(sc === 200 && cl.some((c) => c.id === ctx.cliente), `lista de clientes: ${sc} ${JSON.stringify(cl).slice(0, 120)}`);
  await pausa(300);
  assert.deepStrictEqual(await negados(b.id), [{ modulo: 'comercial', nome_modulo: 'Comercial', n: 19 }], 'a lista de clientes registrou acesso negado');
});

// ── as metades positivas, em fluxo, pela rota (o gesto da tela, um depois do outro) ─────────
test('[RN-152.01/02, integracao] o vendedor (so o Comercial) faz a viagem inteira: escolhe o cliente na lista, confere, lanca, edita, anexa, baixa, duplica, aprova, ve a analise e o resumo, e apaga', async () => {
  const u = ctx.u.diretaComercial;
  const ok = (r, st = 200) => assert.ok(r[0] === st, `${st} esperado: ${r[0]} ${JSON.stringify(r[1]).slice(0, 200)}`);
  // o resumo antes (o banco ja tem os custos do preparo)
  const [sr0, r0] = await j('GET', '/custos-viagens/resumo', u.T);
  assert.ok(sr0 === 200 && CAMPOS_RESUMO.every((k) => k in r0), `RN-152.02 o resumo: ${sr0} ${JSON.stringify(r0).slice(0, 160)}`);
  // o formulario: a lista de clientes, a elegibilidade, os proximos, as coordenadas, a rota
  const [slc, lista] = await j('GET', '/clientes', u.T);
  const cli = lista.find((c) => c.id === ctx.cliente);
  assert.ok(slc === 200 && cli, `${slc}`);
  const [se, el] = await j('GET', `/custos-viagens/verificar-elegibilidade/${cli.id}`, u.T);
  assert.deepStrictEqual([se, el.cliente_id, typeof el.pode_registrar], [200, cli.id, 'boolean'], JSON.stringify(el).slice(0, 200));
  const [sp, prox] = await j('GET', `/custos-viagens/clientes-proximos/${cli.id}?raio_km=100`, u.T);
  assert.ok(sp === 200 && prox.some((x) => x.id === ctx.cliente2), `proximos: ${sp} ${JSON.stringify(prox).slice(0, 200)}`);
  const [sco, co] = await j('GET', `/custos-viagens/coordenadas-cliente/${cli.id}`, u.T);
  assert.ok(sco === 200 && Number.isFinite(co.lat) && Number.isFinite(co.lon), `coordenadas: ${sco} ${JSON.stringify(co)}`);
  const [srt, rota] = await j('GET', '/custos-viagens/calcular-rota?destino_cidade=Campinas&destino_estado=SP&tipo_viagem=ida_e_volta&numero_pessoas=2', u.T);
  assert.ok(srt === 200 && Number.isFinite(rota.distancia_km) && rota.distancia_km > 0, `rota: ${srt} ${JSON.stringify(rota).slice(0, 200)}`);
  // lanca
  const lanc = await j('POST', '/custos-viagens', u.T, {
    data_viagem: '2026-10-21', destino: 'campinas - sp', destino_cidade: 'Campinas', destino_estado: 'SP', cliente_id: cli.id, tipo_viagem: 'ida_e_volta',
    distancia_km: rota.distancia_km, custo_transporte: 300, custo_alimentacao: 80, custo_sugerido: rota.custo_sugerido,
    clientes_viagem: [{ id: cli.id, ordem: 1, distancia_km: rota.distancia_km }, { id: ctx.cliente2, ordem: 2, distancia_km: 20 }],
    autorizado_sem_regras: true, motivo_autorizacao: 'cliente estrategico 152', regras_nao_atendidas: ['possuir_propostas'],
  });
  ok(lanc);
  const id = lanc[1].id;
  await pausa(400); // o POST responde antes de gravar os clientes da viagem e o log de autorizacao (Fase 2 M-2)
  assert.ok(Number.isInteger(id) && /^VIS-\d{4}$/.test(lanc[1].codigo_visita), JSON.stringify(lanc[1]));
  // a lista (os filtros da tela), o custo pelo numero
  const [sl, l1] = await j('GET', `/custos-viagens?cliente_id=${cli.id}&status_aprovacao=pendente&codigo_visita=${lanc[1].codigo_visita}&ordenar_por=data_viagem&ordem=DESC`, u.T);
  assert.ok(sl === 200 && l1.length === 1 && l1[0].id === id && l1[0].total_custo === 380 && l1[0].clientes_viagem.length === 2, `lista: ${sl} ${JSON.stringify(l1).slice(0, 300)}`);
  const [sg, g] = await j('GET', `/custos-viagens/${id}`, u.T);
  assert.deepStrictEqual([sg, g.id, g.destino, g.cliente_nome], [200, id, 'CAMPINAS - SP', cli.razao_social]);
  // edita: o historico grava
  ok(await j('PUT', `/custos-viagens/${id}`, u.T, { ...g, custo_transporte: 350, custo_alimentacao: 80, descricao: 'editado 152' }));
  await pausa(400); // o PUT responde antes de gravar o historico
  const [sh, hist] = await j('GET', `/custos-viagens/${id}/historico`, u.T);
  assert.ok(sh === 200 && hist.length === 1 && hist[0].mudancas.some((m) => m.campo === 'custo_transporte' && Number(m.valor_novo) === 350), `historico: ${sh} ${JSON.stringify(hist).slice(0, 300)}`);
  const [sla, logs] = await j('GET', `/custos-viagens/${id}/logs-autorizacao`, u.T);
  assert.ok(sla === 200 && logs.length === 1 && logs[0].motivo_autorizacao === 'CLIENTE ESTRATEGICO 152' && logs[0].autorizado_por === u.id, `logs: ${sla} ${JSON.stringify(logs).slice(0, 200)}`);
  // o comprovante: anexa (chega ao disco), lista, baixa (o mesmo conteudo), apaga (sai do disco)
  const fd = new FormData();
  fd.append('tipo_comprovante', 'pedagio');
  fd.append('descricao', 'pedagio da ida');
  fd.append('arquivo', new Blob([COMPROVANTE], { type: 'text/plain' }), 'pedagio152.txt');
  const an = await j('POST', `/custos-viagens/${id}/comprovante`, u.T, fd);
  ok(an);
  const noDisco = (await all('SELECT nome_arquivo FROM custos_viagens_anexos WHERE id = ?', [an[1].id]))[0].nome_arquivo;
  const arquivosAgora = arquivosDaPasta();
  const caminho = arquivosAgora.find((a) => a.endsWith(noDisco));
  assert.ok(caminho, `o comprovante do vendedor nao foi gravado no disco: ${noDisco}`);
  const [scs, comps] = await j('GET', `/custos-viagens/${id}/comprovantes`, u.T);
  assert.ok(scs === 200 && comps.length === 1 && comps[0].id === an[1].id && comps[0].tipo_comprovante === 'pedagio', `${scs}`);
  const [sd, , bytes] = await j('GET', `/custos-viagens/${id}/comprovante/${an[1].id}`, u.T);
  assert.ok(sd === 200 && bytes.equals(COMPROVANTE), `download: ${sd} ${bytes.length}`);
  ok(await j('DELETE', `/custos-viagens/${id}/comprovante/${an[1].id}`, u.T));
  assert.ok(!fs.existsSync(path.join(pasta, caminho)), 'apagar o comprovante nao tirou o arquivo do disco');
  // duplica, aprova, a analise e o resumo depois
  const dup = await j('POST', `/custos-viagens/${id}/duplicar`, u.T);
  ok(dup);
  assert.ok(Number.isInteger(dup[1].id) && dup[1].id !== id, JSON.stringify(dup[1]));
  ok(await j('POST', `/custos-viagens/${id}/aprovar`, u.T, { aprovado: true, motivo: 'ok 152' }));
  const ap = (await all('SELECT status_aprovacao, aprovado_por, motivo_aprovacao FROM custos_viagens WHERE id = ?', [id]))[0];
  assert.deepStrictEqual(ap, { status_aprovacao: 'aprovado', aprovado_por: u.id, motivo_aprovacao: 'ok 152' });
  const [san, an2] = await j('GET', '/custos-viagens/analise/cliente', u.T);
  assert.ok(san === 200 && an2.some((x) => x.cliente_id === cli.id && x.total_viagens >= 2 && typeof x.recomendacao === 'string'), `analise: ${san} ${JSON.stringify(an2).slice(0, 200)}`);
  const [sr1, r1] = await j('GET', '/custos-viagens/resumo', u.T);
  const conferido = (await all('SELECT COUNT(*) AS n, SUM(total_custo) AS s FROM custos_viagens'))[0];
  assert.deepStrictEqual([sr1, r1.total_viagens, r1.total_custo_geral], [200, conferido.n, conferido.s], `RN-152.02 o resumo depois: ${JSON.stringify(r1)}`);
  assert.strictEqual(r1.total_viagens, r0.total_viagens + 2, 'o resumo nao contou o lancado e o duplicado');
  // apaga o duplicado (sem historico nem log); o lancado, editado e autorizado sem regras, NAO apaga — C359, de antes (a chave estrangeira
  // do historico e do log de autorizacao); o teste prende o que e hoje, para a mudanca ser vista
  ok(await j('DELETE', `/custos-viagens/${dup[1].id}`, u.T));
  assert.deepStrictEqual(await all('SELECT id FROM custos_viagens WHERE id = ?', [dup[1].id]), [], 'apagar nao apagou o custo');
  const [s500, x500] = await j('DELETE', `/custos-viagens/${id}`, u.T);
  assert.deepStrictEqual([s500, /FOREIGN KEY/.test(x500.error)], [500, true], `C359: o custo editado apagou? ${s500} ${JSON.stringify(x500)}`);
  assert.strictEqual((await all('SELECT COUNT(*) AS n FROM custos_viagens WHERE id = ?', [id]))[0].n, 1);
  // o /:id continua o de antes: um numero que nao existe e 404
  const [s404, x404] = await j('GET', '/custos-viagens/987654', u.T);
  assert.deepStrictEqual([s404, x404], [404, { error: 'Custo de viagem não encontrado' }]);
  await pausa(500);
  assert.deepStrictEqual(await negados(u.id), [], 'o portao registrou acesso negado para quem passou');
  // e o mesmo cliente, pelo Almoxarifado: a lista (aberta) sim; os proximos (com endereco) e a analise nao
  const b = ctx.u.soAlmox;
  const [s1] = await j('GET', '/clientes', b.T);
  const [s2, x2] = await j('GET', `/custos-viagens/clientes-proximos/${cli.id}`, b.T);
  const [s3, x3] = await j('GET', '/custos-viagens/analise/cliente', b.T);
  assert.deepStrictEqual([s1, s2, x2, s3, x3], [200, 403, NEGADO_COM, 403, NEGADO_COM]);
});

// ── por usuario, decide como a tela ───────────────────────────────────────────────────────
test('[RN-152.01] por usuario: as 19 decidem como a tela do Comercial (a linha "custos_viagens" da aba antiga de Permissoes nao abre)', async () => {
  const esperado = {
    semNada: 200, diretaComercial: 200, grupoComercial: 200, grupoVazio: 200, superU: 200, roleAdmin: 200,
    comercialGrupoInativo: 403, comercialPermissao0: 403, comercialGrupo0: 403, soAlmox: 403, soOperacional: 403, soEngProjetos: 403,
    adminComercialComAdministrativo: 403, grupoAlmox: 403, soLinhaCustos: 403,
  };
  const linhas = [];
  for (const k of Object.keys(esperado)) {
    const u = ctx.u[k];
    const [sg, g] = await j('GET', `/usuarios/${u.id}/grupos`, ctx.T);
    assert.strictEqual(sg, 200, JSON.stringify(g));
    const quem = { id: u.id, role: u.role, is_superadmin: u.superadmin ? 1 : 0, admin_modulos: u.adminModulos ? JSON.stringify(u.adminModulos) : '[]' };
    const tela = temModuloComoATela(quem, g.permissoes, ['comercial']) ? 200 : 403;
    const [s1] = await j('GET', '/custos-viagens', u.T);
    const [s2] = await j('GET', '/custos-viagens/resumo', u.T);
    const [s3] = await j('GET', `/custos-viagens/${ctx.custo}`, u.T);
    const [s4] = await j('PUT', `/custos-viagens/${ctx.custo}`, u.T, { data_viagem: '2026-10-19', destino: 'CUSTO 152', cliente_id: ctx.cliente, custo_transporte: 100, custo_hospedagem: 50 });
    const [s5] = await j('POST', `/custos-viagens/${ctx.custo}/aprovar`, u.T, { aprovado: false, motivo: k });
    linhas.push([k, s1, s2, s3, s4, s5, tela]);
  }
  assert.deepStrictEqual(linhas, Object.entries(esperado).map(([k, v]) => [k, v, v, v, v, v, v]));
});

// ── RN-152.03 e o BUSY: reboots ───────────────────────────────────────────────────────────
test('[RN-152.03] PROPOSTAS_PORTAO_DE_MODULO=desligado: as 19 abrem ao barrado e ao grupo sem o Comercial (o aviso do boot as cita; o DELETE apaga, o PUT grava, o comprovante chega ao disco); ligado de novo, barra', async () => {
  const b = ctx.u.soAlmox;
  assert.ok(!/PROPOSTAS_PORTAO_DE_MODULO=desligado/.test(fs.readFileSync(logArq, 'utf8')), 'o aviso do desligado saiu com o portao ligado');
  await descer();
  ctx.T = await subir({ PROPOSTAS_PORTAO_DE_MODULO: 'desligado' });
  const guardados = { custo: ctx.custo, anexo: ctx.anexo, apagar: ctx.apagar };
  try {
    await logar(b);
    await logar(ctx.u.grupoAlmox);
    const log = fs.readFileSync(logArq, 'utf8');
    const aviso = (log.match(/⚠️ PROPOSTAS_PORTAO_DE_MODULO=desligado[^\n]*/) || [''])[0];
    assert.ok(/as dos custos de viagem NAO exigem o Comercial \(só o login\)/.test(aviso)
      && /clientes, dos projetos, das oportunidades e das atividades NAO exigem o Comercial \(só o login\)/.test(aviso)
      && /a lista de ordens de serviço do Operacional volta à régua antiga do módulo/.test(aviso),
    `o aviso do boot nao cita os custos de viagem: ${aviso.slice(0, 400)}`);
    const errados = []; const feitos = [];
    // Fase 5 da 151 (S23): tambem quem a regua ANTIGA barra (um grupo ativo sem o Comercial) — o desligado volta ao so login, nao a ela
    for (const u of [ctx.u.grupoAlmox, b]) {
      Object.assign(ctx, await custoComComprovante(`DESLIGADO 152 ${u.nome}`));
      const arquivoDoAnexo = (await all('SELECT nome_arquivo FROM custos_viagens_anexos WHERE id = ?', [ctx.anexo]))[0].nome_arquivo;
      for (const r of DEZENOVE) {
        const [s, x] = await chamar(r, u.T);
        if (s !== 200) errados.push(`${u.nome} ${r.metodo} ${r.rota}: ${s} ${JSON.stringify(x).slice(0, 80)}`);
      }
      feitos.push({ u, custo: ctx.custo, anexo: ctx.anexo, apagar: ctx.apagar, arquivoDoAnexo });
    }
    assert.deepStrictEqual(errados, []);
    await pausa(800); // o PUT, o POST e o duplicar gravam depois de responder (Fase 2 M-2)
    for (const { u, custo, anexo, apagar, arquivoDoAnexo } of feitos) {
      // o laco editou (PUT) e aprovou antes de apagar; o DELETE do custo e o do comprovante apagaram; o comprovante dele chegou ao disco
      assert.deepStrictEqual(await all('SELECT id FROM custos_viagens WHERE id = ?', [apagar]), [], `${u.nome}: o DELETE do desligado respondeu 200 sem apagar`);
      assert.deepStrictEqual(await all('SELECT id FROM custos_viagens_anexos WHERE id = ?', [anexo]), [], `${u.nome}: o DELETE do comprovante nao apagou`);
      assert.ok(!arquivosDaPasta().some((a) => a.endsWith(arquivoDoAnexo)), `${u.nome}: o arquivo do comprovante apagado ficou no disco`);
      const hist = await all('SELECT dados_novos FROM custos_viagens_historico WHERE custo_viagem_id = ?', [custo]);
      assert.ok(hist.length === 1 && /DESTINO DO BARRADO \d+/.test(hist[0].dados_novos), `${u.nome}: o PUT do desligado respondeu 200 sem gravar`);
      const anexos = await all("SELECT nome_arquivo FROM custos_viagens_anexos WHERE custo_viagem_id = ? AND nome_original = 'barrado152.txt'", [custo]);
      assert.ok(anexos.length === 1 && arquivosDaPasta().some((a) => a.endsWith(anexos[0].nome_arquivo)), `${u.nome}: o comprovante do desligado nao chegou ao disco`);
      const lancados = await all("SELECT id, created_by FROM custos_viagens WHERE destino LIKE 'DESTINO DO BARRADO %' AND created_by = ?", [u.id]);
      assert.strictEqual(lancados.length, 2, `${u.nome}: o POST e o duplicar do desligado nao lancaram (o duplicado copia o destino ja editado pelo PUT)`);
    }
  } finally {
    Object.assign(ctx, guardados);
    await descer();
    ctx.T = await subir();
  }
  await logar(b);
  await logar(ctx.u.grupoAlmox);
  const [sg1, xg1] = await j('GET', '/custos-viagens', ctx.u.grupoAlmox.T);
  assert.deepStrictEqual([sg1, xg1], [403, NEGADO_COM], 'ligado de novo, o grupo sem o Comercial passou');
  const [s6, x6] = await j('GET', '/custos-viagens/resumo', b.T);
  const [s7, x7] = await j('DELETE', `/custos-viagens/${ctx.custo}`, b.T);
  const [s8, x8] = await j('GET', '/custos-viagens/resumo', ctx.u.diretaComercial.T);
  assert.deepStrictEqual([s6, x6, s7, x7, s8], [403, NEGADO_COM, 403, NEGADO_COM, 200]);
  assert.ok(CAMPOS_RESUMO.every((k) => k in x8), 'o resumo do vendedor, ligado de novo');
});

test('[RN-152.01] SQLITE_BUSY ao ler as permissoes: 503 na leitura e na escrita; outro erro: 500; o administrador nem le; nada grava', async () => {
  const b = ctx.u.soOperacional;
  const FALHA = 'p\\.modulo, p\\.permissao FROM grupos_permissoes';
  const antes = await retrato();
  await descer();
  ctx.T = await subir({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'all', FALHA_SQL_MSG: 'SQLITE_BUSY: database is locked' });
  try {
    await logar(b);
    const corpo503 = { error: 'Banco temporariamente ocupado. Tente novamente em alguns segundos.', code: 'SQLITE_BUSY', retryAfter: 3, context: 'portao:propostas' };
    const [s1, x1] = await j('GET', '/custos-viagens/resumo', b.T);
    const [s2, x2] = await j('POST', '/custos-viagens', b.T, { data_viagem: '2026-10-19', destino: 'BUSY 152' });
    assert.deepStrictEqual([s1, x1, s2, x2], [503, corpo503, 503, corpo503]);
    const [sa] = await j('GET', `/custos-viagens/${ctx.custo}`, ctx.T);
    assert.strictEqual(sa, 200, 'o administrador passa sem ler as linhas');
    await descer();
    ctx.T = await subir({ FALHA_SQL_INJETADA: FALHA, FALHA_SQL_METODOS: 'all' });
    await logar(b);
    const E500 = { error: 'Erro ao verificar permissões' };
    const [s4, x4] = await j('PUT', `/custos-viagens/${ctx.custo}`, b.T, { data_viagem: '2026-10-19', destino: 'X' });
    const [s5, x5] = await j('POST', `/custos-viagens/${ctx.custo}/aprovar`, b.T, { aprovado: true });
    const [s6, x6] = await j('DELETE', `/custos-viagens/${ctx.custo}`, b.T);
    assert.deepStrictEqual([s4, x4, s5, x5, s6, x6], [500, E500, 500, E500, 500, E500]);
    assert.ok(/\[falha injetada\]\s+SELECT p\.modulo, p\.permissao FROM grupos_permissoes/.test(fs.readFileSync(logArq, 'utf8')),
      'a falha injetada nao casou com a leitura do portao (o teste nao provou nada)');
  } finally {
    await descer();
    ctx.T = await subir();
  }
  assert.strictEqual(await retrato(), antes, 'com o portao em erro, um custo, um anexo ou o historico mudou');
});

(async () => {
  console.log('\n=== Etapa 152: os custos de viagem exigem o Comercial, e o resumo da tela responde (C350, C356) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e152-cv-'));
    ctx.T = await subir();
    abrirCru();
    // dois clientes sem endereco (as coordenadas saem da cidade, sem rede), na mesma regiao
    const [sc, c] = await j('POST', '/clientes', ctx.T, { razao_social: 'Cliente 152', cidade: 'Campinas', estado: 'SP' });
    assert.strictEqual(sc, 200, JSON.stringify(c));
    ctx.cliente = c.id;
    const [sc2, c2] = await j('POST', '/clientes', ctx.T, { razao_social: 'Vizinho 152', cidade: 'Jundiai', estado: 'SP' });
    assert.strictEqual(sc2, 200, JSON.stringify(c2));
    ctx.cliente2 = c2.id;
    Object.assign(ctx, await custoComComprovante('CUSTO 152'));
    // grupos gravados por fora: 901 ativo com Comercial, 903 ativo sem linha, 905 inativo com Comercial, 906 ativo so com o Almoxarifado
    await run("INSERT INTO grupos_permissoes (id, nome, ativo) VALUES (901,'G-com',1),(903,'G-vazio',1),(905,'G-com-inat',0),(906,'G-almox',1)");
    await run("INSERT INTO permissoes (grupo_id, modulo, acao, permissao) VALUES (901,'comercial','acesso',1),(905,'comercial','acesso',1),(906,'almoxarifado','acesso',1)");
    ctx.u = {
      semNada: await usuario('semnada'),
      diretaComercial: await usuario('dcom', { diretas: ['comercial'] }),
      grupoComercial: await usuario('gcom', { grupos: [901] }),
      grupoVazio: await usuario('gvazio', { grupos: [903] }),
      superU: await usuario('super', { diretas: ['almoxarifado'] }),
      roleAdmin: await usuario('radm', { role: 'admin', diretas: ['almoxarifado'] }),
      comercialGrupoInativo: await usuario('gcomi', { grupos: [905], diretas: ['almoxarifado'] }),
      comercialPermissao0: await usuario('cp0', { diretasCrus: [['comercial', 'acesso', 0]] }),
      comercialGrupo0: await usuario('cg0', { diretasGrupo0: ['comercial'], diretas: ['almoxarifado'] }),
      soAlmox: await usuario('salm', { diretas: ['almoxarifado'] }),
      soOperacional: await usuario('sop', { diretas: ['operacional'] }),
      soEngProjetos: await usuario('sengp', { diretas: ['engenharia_projetos'] }),
      adminComercialComAdministrativo: await usuario('acadm', { diretas: ['administrativo'], adminModulos: ['comercial'] }),
      grupoAlmox: await usuario('galm', { grupos: [906] }),
      soLinhaCustos: await usuario('slcv', { diretasCrus: [['custos_viagens', 'visualizar', 1]] }),
    };
    await run('UPDATE usuarios SET is_superadmin = 1 WHERE id = ?', [ctx.u.superU.id]);
    ctx.u.superU.superadmin = true;
    assert.strictEqual((await all('SELECT is_superadmin FROM usuarios WHERE id = ?', [ctx.u.roleAdmin.id]))[0].is_superadmin, 0, 'o role admin do cenario nao pode ser super');
    for (const u of Object.values(ctx.u)) await logar(u);
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
