/**
 * Etapa 165 (Comercial) — os lembretes, a validade, as datas gravadas e a data de emissao das propostas no dia de Brasilia (C410), pelo
 * `index.js` de verdade (pasta vazia).
 *
 *   RN-165.01  sino: vencido (< hoje) / hoje (= hoje) / futuro, so ate hoje + 7, so os do usuario
 *   RN-165.02  Atividades: o lembrete <= hoje e prioridade alta, senao media
 *   RN-165.03  painel avancado: lembrete_vencido = lembrete <= hoje
 *   RN-165.04  previsao de fechamento: validade >= hoje (por julianday — o texto livre fica fora), dias de calendario, a probabilidade
 *   RN-165.05  datas gravadas: data_fechamento (POST, PUT, /aceitar), a validade/expira_em da geracao automatica, a atividade de aprovacao
 *   RN-165.06  documento: a Data de Emissao da capa (/premium e /pdf) no dia de Brasilia do instante de criacao
 *   T3         o que a geracao automatica e o PUT gravam, lido pela previsao, pelo sino, pelas Atividades e pelo painel
 *
 * DEPENDE DO RELOGIO E DO FUSO — e por isso fixa os dois: o filho sobe com TZ=UTC e o relogio do JavaScript adiantado
 * (tests/helpers/relogioAdiantado.js) para as 22h de Brasilia do ULTIMO dia do mes seguinte ao mes UTC real (pulando dezembro). Assim o
 * hoje de Brasilia (HOJE), o dia UTC do JS (HOJE+1) e o `date('now')`/`julianday('now')` do SQLite (o real, semanas antes) sao tres dias
 * diferentes; a guarda derruba o arquivo se isso nao valer. O PROPRIO processo do teste roda em TZ=America/Sao_Paulo (fixado abaixo, antes
 * do primeiro Date) para o unitario do `dataDoBancoBR`: no filho em UTC, ler o instante do banco "como local" da o mesmo que le-lo como UTC
 * (Fase 2 I6) — so neste fuso a variante errada aparece.
 *
 * Plano: docs/superpowers/plans/2026-10-20-almoxarifado-etapa165-os-lembretes-e-a-validade-das-propostas-no-dia-de-brasilia.md
 * Executar: cd server && node tests/api/lembretesEValidadeDasPropostasNoDiaLocal.api.test.js
 */
process.env.TZ = 'America/Sao_Paulo';
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const diaLocal = require('../../services/diaLocal');

const SERVER_DIR = path.join(__dirname, '..', '..');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

// ── o relogio do filho ───────────────────────────────────────────────────────────────────────
const somaDias = (dia, n) => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
const brt = (dia, hh, mm = 0) => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d, hh + 3, mm)).getTime(); };
const HOJE = (() => {
  const real = new Date().toISOString(); // o mes UTC real
  let a = Number(real.slice(0, 4)); let m = Number(real.slice(5, 7)) + 1; // 1..13
  if (m > 12) { m -= 12; a += 1; }
  if (m === 12) { m = 1; a += 1; } // pula dezembro: HOJE+1 no mesmo ano
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); // ultimo dia do mes m
})();
const AMANHA = somaDias(HOJE, 1);
const ONTEM = somaDias(HOJE, -1);
const D = (n) => somaDias(HOJE, n);
const BR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const ALVO = brt(HOJE, 22, 0);
const DESLOCAMENTO = ALVO - Date.now();

// ── o servidor real ─────────────────────────────────────────────────────────────────────────
let porta; let filho = null; let pasta; let logArq; let saiu = null;
async function cru(m, u, tok, body, ms = 60000) {
  const headers = { ...(tok ? { Authorization: 'Bearer ' + tok } : {}) };
  let corpo;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; corpo = JSON.stringify(body); }
  const r = await fetch(`http://127.0.0.1:${porta}${u}`, { method: m, headers, body: corpo, signal: AbortSignal.timeout(ms) });
  const buf = Buffer.from(await r.arrayBuffer());
  let x = buf.toString('utf8'); try { x = JSON.parse(x); } catch (e) { /* sem JSON */ }
  return [r.status, x];
}
const j = (m, u, body, tok = ctx.T) => cru(m, `/api${u}`, tok, body);
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e165seed@t.com', senha: 'E165seed!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir() {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET', 'API_URL', 'NOMINATIM_URL',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'FALHA_SQL_MSG', 'FALHA_SQL_METODOS', 'FALHA_SQL_PULAR', 'FALHA_SQL_MSGS',
    'PROPOSTAS_PORTAO_DE_MODULO', 'RATE_LIMIT_WINDOW_MS', 'TZ', 'RELOGIO_ADIANTADO_MS']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha,
    RATE_LIMIT_MAX: '100000', NOMINATIM_URL: 'http://127.0.0.1:9/search', TZ: 'UTC', RELOGIO_ADIANTADO_MS: String(DESLOCAMENTO) });
  const out = fs.openSync(logArq, 'a');
  saiu = null;
  const preload = ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js'), '-r', path.join(__dirname, '..', 'helpers', 'relogioAdiantado.js')];
  filho = spawn(process.execPath, [...preload, 'index.js'], { cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true });
  filho.on('exit', (code) => { saiu = code; });
  const fim = Date.now() + 60000;
  while (Date.now() < fim) {
    if (saiu !== null) throw new Error(`o index.js saiu cedo (codigo ${saiu})`);
    try {
      const [s, x] = await cru('POST', '/api/auth/login', null, SEED);
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

// ── o arquivo, por fora ─────────────────────────────────────────────────────────────────────
let banco = null;
function abrirCru() {
  banco = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  banco.configure('busyTimeout', 15000);
}
const run = (sql, p = []) => new Promise((res, rej) => banco.run(sql, p, function feito(e) { if (e) rej(e); else res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => banco.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const linha = async (id) => (await all('SELECT * FROM propostas WHERE id = ?', [id]))[0];
const ctx = { n: 0 };

async function inserir(tabela, campos) {
  const cols = await all(`PRAGMA table_info(${tabela})`);
  assert.ok(cols.length, `a tabela ${tabela} nao existe`);
  const dados = { ...campos };
  for (const c of cols) {
    if (c.pk || !c.notnull || c.dflt_value !== null || c.name in dados) continue;
    dados[c.name] = /INT|REAL|NUM/i.test(c.type) ? 1 : `x165-${++ctx.n}`;
  }
  const k = Object.keys(dados);
  return (await run(`INSERT INTO ${tabela} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`, Object.values(dados))).lastID;
}
const proposta = (extra) => inserir('propostas', {
  cliente_id: ctx.cliente, numero_proposta: `E165-${++ctx.n}`, titulo: `PROPOSTA 165 ${ctx.n}`, status: 'rascunho', valor_total: 1,
  responsavel_id: ctx.admin, created_by: ctx.admin, ...extra,
});
const porId = (lista, campo, chave = 'id') => Object.fromEntries((Array.isArray(lista) ? lista : []).map((x) => [x[chave], x[campo]]));

// ── no proprio processo (TZ=America/Sao_Paulo): o dataDoBancoBR e o somarDiasISO ─────────────────────────────
test('[RN-165.06, B1057] dataDoBancoBR: o instante do banco no dia de Brasilia, a data pura sem fuso, o resto vazio (neste processo em UTC-3)', () => {
  assert.strictEqual(new Date('2026-10-20').getDate(), 19, 'guarda: este processo tem de estar em UTC-3 (a meia-noite UTC e a vespera)');
  const f = diaLocal.dataDoBancoBR;
  // o instante entre 00:00 e 02:59 UTC: a variante "le como local" (Fase 2 I6) da o dia UTC aqui
  assert.strictEqual(f('2026-12-01 01:00:00'), '30/11/2026', 'o CURRENT_TIMESTAMP das 22h de Brasilia = o dia de Brasilia');
  assert.strictEqual(f('2026-12-01 02:59:59'), '30/11/2026');
  assert.strictEqual(f('2026-12-01 03:00:00'), '01/12/2026');
  assert.strictEqual(f('2027-01-01 01:30:00'), '31/12/2026', 'a virada do ano');
  assert.strictEqual(f('2026-10-20'), '20/10/2026', 'a data pura, sem fuso (antes: a vespera em UTC-3)');
  assert.strictEqual(f('2026-12-01T01:00:00.000Z'), '30/11/2026', 'ISO com Z: o instante');
  assert.strictEqual(f('2026-12-01T01:00:00-03:00'), '01/12/2026', 'ISO com deslocamento');
  for (const v of ['', null, undefined, 42, 'lixo', '20/10/2026', '2026-02-30', '2025-02-30 10:00:00', '1899-12-31', '2026-02-30T10:00:00Z']) {
    assert.strictEqual(f(v), '', `${JSON.stringify(v)} -> vazio`);
  }
});

test('[RN-165.05, B1056] somarDiasISO: dias de calendario, viradas, negativo, e o invalido = null', () => {
  const s = diaLocal.somarDiasISO;
  assert.strictEqual(s('2026-10-20', 15), '2026-11-04');
  assert.strictEqual(s('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(s('2028-02-28', 1), '2028-02-29');
  assert.strictEqual(s('2026-10-20', -5), '2026-10-15');
  assert.strictEqual(s('2026-10-20', 0), '2026-10-20');
  for (const [d, n] of [['2026-10-20', 1.5], ['2026-10-20', NaN], ['2026-10-20', Infinity], ['2026-02-30', 1], ['lixo', 1], [null, 1],
    ['2026-10-20', 99999999999]]) assert.strictEqual(s(d, n), null, `${d} + ${n}`);
});

test('[RN-165.06, Fase 2 I6] o /premium e o /pdf calculam a emissao pelo dataDoBancoBR (no fonte, sem comentarios)', () => {
  const fonte = fs.readFileSync(path.join(SERVER_DIR, 'index.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
  const rota = (inicio) => { const a = fonte.indexOf(inicio); assert.ok(a > 0, inicio); const b = fonte.indexOf('\napp.', a + 10); return fonte.slice(a, b); };
  for (const r of ["app.get('/api/propostas/:id/premium'", "app.get('/api/propostas/:id/pdf'"]) {
    const corpo = rota(r);
    assert.strictEqual(corpo.split('const dataEmissao = diaLocal.dataDoBancoBR(proposta.created_at);').length - 1, 1, `${r}: a emissao`);
    assert.ok(!/created_at\)\.toLocale/.test(corpo), `${r}: ainda le o created_at com toLocale*`);
  }
});

// ── o filho ─────────────────────────────────────────────────────────────────────────────────
test("guarda: o filho esta nas 22h de Brasilia de HOJE e o date('now') do SQLite nao e nem HOJE nem HOJE+1", async () => {
  const [s, h] = await cru('GET', '/api/health');
  assert.ok([200, 503].includes(s), `health ${s}`);
  const agoraFilho = new Date(h.timestamp).getTime();
  assert.ok(Math.abs(agoraFilho - ALVO) < 10 * 60000, `o relogio do filho (${h.timestamp}) nao esta perto das 22h de ${HOJE}`);
  const [{ d }] = await all("SELECT date('now') AS d");
  assert.ok(d < D(-8), `o date('now') (${d}) tem de estar antes de HOJE-8 (${D(-8)}) — senao as bordas do sino nao separam`);
});

test('massa: o cliente, os usuarios, os lembretes e as validades (por fora)', async () => {
  ctx.admin = (await all('SELECT id FROM usuarios WHERE email = ?', [SEED.email]))[0].id;
  ctx.cliente = await inserir('clientes', { razao_social: 'CLIENTE 165', nome_fantasia: 'CLIENTE 165', status: 'ativo' });
  ctx.outro = await inserir('usuarios', { nome: 'OUTRO 165', email: 'outro165@t.com', ativo: 1 });
  ctx.aprovador = await inserir('usuarios', { nome: 'APROVADOR 165', email: 'aprov165@t.com', ativo: 1, pode_aprovar_descontos: 1 });
  // lembretes: uma proposta por borda, do admin; e uma de HOJE de outro usuario (o recorte)
  ctx.l = {};
  for (const [k, dia] of [['ontem', ONTEM], ['hoje', HOJE], ['amanha', AMANHA], ['d7', D(7)], ['d8', D(8)]]) ctx.l[k] = await proposta({ lembrete_data: dia, lembrete_mensagem: `LEMBRETE ${k}` });
  ctx.l.alheio = await proposta({ lembrete_data: HOJE, responsavel_id: ctx.outro, created_by: ctx.outro });
  // validades: enviadas, probabilidade nula (os degraus), uma com probabilidade, uma em texto livre, uma com hora; e um rascunho
  ctx.v = {};
  for (const [k, dia] of [['ontem', ONTEM], ['hoje', HOJE], ['amanha', AMANHA], ['d7', D(7)], ['d8', D(8)], ['d15', D(15)], ['d16', D(16)]]) {
    ctx.v[k] = await proposta({ status: 'enviada', validade: dia, probabilidade: null });
  }
  ctx.v.p33 = await proposta({ status: 'enviada', validade: D(3), probabilidade: 33 });
  ctx.v.texto = await proposta({ status: 'enviada', validade: '30/10/2026', probabilidade: null });
  ctx.v.hora = await proposta({ status: 'enviada', validade: `${D(5)} 15:00:00`, probabilidade: null });
  ctx.v.rascunho = await proposta({ status: 'rascunho', validade: HOJE, probabilidade: null });
  const [{ n }] = await all("SELECT COUNT(*) AS n FROM propostas WHERE status = 'enviada' AND validade IS NOT NULL");
  assert.ok(n < 15, `guarda do LIMIT 20: ${n} enviadas com validade (a T3 acrescenta mais uma)`);
});

test('[RN-165.01, B1054] o sino: vencido / hoje / proximos, a janela de 7 dias e so os do usuario', async () => {
  const [s, lista] = await j('GET', '/notificacoes');
  assert.strictEqual(s, 200, JSON.stringify(lista).slice(0, 200));
  const p = porId(lista.filter((x) => x.tipo === 'lembrete_proposta'), 'prioridade', 'proposta_id');
  const l = ctx.l;
  assert.strictEqual(p[l.ontem], 'vencido', `ontem: ${JSON.stringify(p)}`);
  assert.strictEqual(p[l.hoje], 'hoje', 'hoje');
  assert.strictEqual(p[l.amanha], 'futuro', 'amanha');
  assert.strictEqual(p[l.d7], 'futuro', 'hoje + 7 (dentro da janela)');
  assert.ok(!(l.d8 in p), 'hoje + 8 fora da janela');
  assert.ok(!(l.alheio in p), 'o lembrete de outro usuario');
  const hojeNoSino = lista.find((x) => x.proposta_id === l.hoje);
  assert.deepStrictEqual([hojeNoSino.data, hojeNoSino.mensagem], [HOJE, 'LEMBRETE hoje'], 'a data crua do lembrete (a tela formata)');
});

test('[RN-165.02, B1054] as Atividades: o lembrete ate hoje e alta, depois media', async () => {
  const [s, lista] = await j('GET', '/atividades');
  assert.strictEqual(s, 200);
  const p = porId(lista.filter((x) => x.tipo === 'lembrete'), 'prioridade', 'proposta_id');
  const l = ctx.l;
  assert.deepStrictEqual([p[l.ontem], p[l.hoje], p[l.amanha], p[l.d7], p[l.d8]], ['alta', 'alta', 'media', 'media', 'media'], JSON.stringify(p));
  assert.ok(!(l.alheio in p), 'o lembrete de outro usuario');
  const [, todos] = await j('GET', '/atividades?todos=true');
  assert.strictEqual(porId(todos.filter((x) => x.tipo === 'lembrete'), 'prioridade', 'proposta_id')[l.alheio], 'alta', 'com todos=true, o de outro (HOJE) tambem alta');
});

test('[RN-165.03, B1054] o painel avancado: lembrete vencido = ate hoje', async () => {
  const [s, painel] = await j('GET', '/dashboard/avancado');
  assert.strictEqual(s, 200);
  const v = porId(painel.cotacoesComLembrete, 'lembrete_vencido');
  const l = ctx.l;
  assert.deepStrictEqual([v[l.ontem], v[l.hoje], v[l.amanha], v[l.d7], v[l.d8]], [1, 1, 0, 0, 0], JSON.stringify(v));
});

test('[RN-165.04, B1055] a previsao de fechamento: validade >= hoje (por julianday), dias de calendario e a probabilidade padrao', async () => {
  const [s, painel] = await j('GET', '/dashboard/vendas');
  assert.strictEqual(s, 200);
  const prev = painel.pipeline.previsaoFechamento;
  const dias = porId(prev, 'dias_restantes');
  const prob = porId(prev, 'probabilidade');
  const v = ctx.v;
  assert.ok(!(v.ontem in dias), `a validade de ontem fica fora: ${JSON.stringify(dias)}`);
  assert.ok(!(v.texto in dias), 'a validade em texto livre fica fora (Fase 2 I5)');
  assert.ok(!(v.rascunho in dias), 'o rascunho fica fora');
  assert.deepStrictEqual([v.hoje, v.amanha, v.d7, v.d8, v.d15, v.d16, v.p33, v.hora].map((id) => dias[id]), [0, 1, 7, 8, 15, 16, 3, 5],
    `os dias: ${JSON.stringify(dias)}`);
  assert.deepStrictEqual([v.hoje, v.amanha, v.d7, v.d8, v.d15, v.d16, v.p33].map((id) => prob[id]), [80, 80, 80, 60, 60, 40, 33],
    `a probabilidade: ${JSON.stringify(prob)}`);
  assert.deepStrictEqual(prev.map((x) => x.id).slice(0, 3), [v.hoje, v.amanha, v.p33], 'a ordem pela validade');
});

test('[RN-165.05, B1056] a data de fechamento gravada: POST, PUT e /aceitar sem data = o hoje de Brasilia', async () => {
  const [s1, x1] = await j('POST', '/propostas', { cliente_id: ctx.cliente, titulo: 'FECHADA 165', valor_total: 1, status: 'aprovada' });
  assert.strictEqual(s1, 200, JSON.stringify(x1));
  assert.strictEqual((await linha(x1.id)).data_fechamento, HOJE, 'POST aprovada');
  const [s1b, x1b] = await j('POST', '/propostas', { cliente_id: ctx.cliente, titulo: 'PERDIDA 165', valor_total: 1, status: 'rejeitada', motivo_nao_venda: 'PRECO' });
  assert.strictEqual(s1b, 200, JSON.stringify(x1b));
  assert.strictEqual((await linha(x1b.id)).data_fechamento, HOJE, 'POST rejeitada');
  const idPut = await proposta({});
  const [s2, x2] = await j('PUT', `/propostas/${idPut}`, { status: 'aprovada' });
  assert.strictEqual(s2, 200, JSON.stringify(x2));
  assert.strictEqual((await linha(idPut)).data_fechamento, HOJE, 'PUT aprovada');
  const idAc = await proposta({ status: 'enviada' });
  const [s3, x3] = await j('POST', `/propostas/${idAc}/aceitar`, {});
  assert.strictEqual(s3, 200, JSON.stringify(x3));
  assert.deepStrictEqual([(await linha(idAc)).status, (await linha(idAc)).data_fechamento], ['aprovada', HOJE], '/aceitar');
  // a data informada continua valendo (a metade que prova que o padrao so entra sem data)
  const idCom = await proposta({ status: 'enviada', data_fechamento: '2026-01-02' });
  await j('POST', `/propostas/${idCom}/aceitar`, {});
  assert.strictEqual((await linha(idCom)).data_fechamento, '2026-01-02');
});

test('[RN-165.05, B1056, Fase 2 I4] a geracao automatica: validade = expira_em = hoje + validade_dias; o enorme vira 15 e responde', async () => {
  const [sp, pr] = await j('POST', '/produtos', { codigo: 'E165P', nome: 'PRODUTO 165', familia: 'FAM165', classificacao_area: 'NAO CLASSIFICADA', preco_base: 10 });
  assert.strictEqual(sp, 200, JSON.stringify(pr));
  ctx.produto = pr.id;
  const gerar = (extra) => j('POST', '/propostas/gerar-automatica', { cliente_id: ctx.cliente, produtos: [{ id: ctx.produto }], ...extra });
  const casos = [[{ validade_dias: 15 }, D(15)], [{ validade_dias: '7' }, D(7)], [{ validade_dias: 'abc' }, D(15)], [{ validade_dias: -5 }, D(-5)],
    [{ validade_dias: '99999999999' }, D(15)], [{ validade_dias: 36500 }, D(36500)], [{ validade_dias: 36501 }, D(15)],
    [{ validade_dias: 15, validade: '2030-01-01' }, '2030-01-01']];
  for (const [extra, esperado] of casos) {
    const [s, x] = await gerar(extra);
    assert.strictEqual(s, 200, `${JSON.stringify(extra)}: ${s} ${JSON.stringify(x)}`);
    const p = await linha(x.id);
    assert.deepStrictEqual([p.validade, p.expira_em], [esperado, esperado], JSON.stringify(extra));
    if (extra.validade_dias === 15 && !extra.validade) ctx.gerada = x.id;
  }
  const [s0, x0] = await gerar({ validade_dias: 0 });
  assert.strictEqual(s0, 200);
  assert.strictEqual((await linha(x0.id)).validade, null, 'o numero 0 (falso) = sem validade, como antes');
});

test('[RN-165.05, B1056] a atividade do pedido de desconto nasce agendada para o hoje de Brasilia', async () => {
  const id = await proposta({ margem_desconto: 0 });
  const [s, x] = await j('POST', '/aprovacoes', { proposta_id: id, tipo: 'desconto', valor_desconto: 10 });
  assert.strictEqual(s, 200, JSON.stringify(x));
  let ativ = [];
  for (let i = 0; i < 50 && !ativ.length; i++) {
    ativ = await all("SELECT data_agendada, responsavel_id FROM atividades WHERE tipo = 'aprovacao_desconto' AND titulo LIKE ?", [`%${(await linha(id)).numero_proposta}%`]);
    if (!ativ.length) await pausa(100);
  }
  assert.deepStrictEqual(ativ, [{ data_agendada: HOJE, responsavel_id: ctx.aprovador }], 'a atividade do aprovador');
});

test('[RN-165.06, B1057] a capa do documento: a Data de Emissao no dia de Brasilia do instante de criacao (/premium e /pdf)', async () => {
  const emissao = (html) => { const m = /Data de Emissão: <strong>([^<]*)<\/strong>/.exec(String(html)); return m ? m[1] : `sem a linha: ${String(html).slice(0, 120)}`; };
  const casos = [[`${AMANHA} 01:00:00`, BR(HOJE)], [`${HOJE} 02:59:00`, BR(ONTEM)], [`${HOJE} 03:00:00`, BR(HOJE)], [null, '—']];
  for (const [criado, esperado] of casos) {
    const id = await proposta({ margem_desconto: 0 });
    await run('UPDATE propostas SET created_at = ? WHERE id = ?', [criado, id]);
    const [s, html] = await j('GET', `/propostas/${id}/premium`);
    assert.strictEqual(s, 200, String(html).slice(0, 200));
    assert.strictEqual(emissao(html), esperado, `/premium com created_at ${criado}`);
    if (criado === `${AMANHA} 01:00:00`) ctx.docPdf = id;
  }
  const [sp, corpo] = await j('GET', `/propostas/${ctx.docPdf}/pdf`);
  assert.strictEqual(sp, 200, typeof corpo === 'string' ? corpo.slice(0, 200) : JSON.stringify(corpo));
  // o retrato e gravado sem esperar a resposta (index.js, "Snapshot: gravar HTML/CSS") — espera por ele
  let retrato = null;
  for (let i = 0; i < 100 && !retrato; i++) { retrato = (await linha(ctx.docPdf)).html_rendered; if (!retrato) await pausa(100); }
  assert.strictEqual(emissao(retrato), BR(HOJE), '/pdf (o retrato gravado)');
});

test('[T3] o que se grava pelas rotas, lido pelas leituras: a gerada na previsao (15 dias, probabilidade 50) e o lembrete do PUT no sino, nas Atividades e no painel', async () => {
  assert.ok(ctx.gerada, 'a proposta gerada pela geracao automatica');
  await run("UPDATE propostas SET status = 'enviada' WHERE id = ?", [ctx.gerada]);
  const [, vendas] = await j('GET', '/dashboard/vendas');
  const item = vendas.pipeline.previsaoFechamento.find((x) => x.id === ctx.gerada);
  assert.deepStrictEqual(item && [item.dias_restantes, item.probabilidade, item.validade], [15, 50, D(15)], JSON.stringify(item));
  const id = await proposta({});
  const [s, x] = await j('PUT', `/propostas/${id}`, { lembrete_data: HOJE, lembrete_mensagem: 'PELO FORMULARIO' });
  assert.strictEqual(s, 200, JSON.stringify(x));
  assert.strictEqual((await linha(id)).lembrete_data, HOJE);
  const [, sino] = await j('GET', '/notificacoes');
  assert.strictEqual(porId(sino, 'prioridade', 'proposta_id')[id], 'hoje', 'no sino');
  const [, ativ] = await j('GET', '/atividades');
  assert.strictEqual(porId(ativ.filter((a) => a.tipo === 'lembrete'), 'prioridade', 'proposta_id')[id], 'alta', 'nas Atividades');
  const [, painel] = await j('GET', '/dashboard/avancado');
  assert.strictEqual(porId(painel.cotacoesComLembrete, 'lembrete_vencido')[id], 1, 'no painel');
});

(async () => {
  console.log(`\n▶ Etapa 165 — lembretes e validade das propostas no dia de Brasilia (HOJE ${HOJE}, o filho as 22h)\n`);
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e165-'));
  try {
    ctx.T = await subir();
    abrirCru();
    for (const [nome, fn] of testes) {
      try { await fn(); passed++; console.log(`  ✓ ${nome}`); } catch (e) {
        failed++; console.log(`  ✗ ${nome}\n    ${e && e.message}`);
        if (/^guarda|^massa/.test(nome)) { console.log('    (guarda/massa caiu — os cenarios abaixo nao provariam nada)'); break; }
      }
    }
  } catch (e) {
    failed++; console.log(`  ✗ preparo: ${e && e.stack}`);
  } finally {
    if (banco) await new Promise((r) => banco.close(r));
    await descer();
    try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo as vezes */ }
  }
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})();
