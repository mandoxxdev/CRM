/**
 * Etapa 166 (Comercial) — os relatorios por mes, o filtro de periodo do painel e a data no texto da proposta no dia de Brasilia
 * (C413, C415), pelo `index.js` de verdade (pasta vazia).
 *
 *   RN-166.01  Relatorio Executivo, Evolucao de Propostas: janela de 6 meses e o mes pelo calendario de Brasilia
 *   RN-166.02  Relatorio Executivo, Clientes que Precisam de Visita: a ultima proposta antes de hoje - 90 dias (Brasilia)
 *   RN-166.03  Visitas Tecnicas: propostas_ultimos_90_dias e a regra de atividade recente (Brasilia)
 *   RN-166.04  Tendencias Mensais do painel (/dashboard/historico): 12 meses, o mes de Brasilia
 *   RN-166.05  o filtro De/Ate do painel (/dashboard e /dashboard/avancado) no dia de Brasilia
 *   RN-166.07  o marcador {{proposal.date}} = a Data de Emissao da capa, como esta (C415)
 *   T3         o mesmo instante (HOJE 22h30) no mesmo mes em todas as rotas, e a mesma data na capa e no texto
 *
 * DEPENDE DO RELOGIO E DO FUSO — e por isso fixa os dois (o molde da 165): o filho sobe com TZ=UTC e o relogio do JavaScript adiantado
 * (tests/helpers/relogioAdiantado.js) para as 22h de Brasilia do ULTIMO dia do mes seguinte ao mes UTC real (pulando dezembro). Assim o
 * hoje de Brasilia (HOJE), o dia UTC do JS (HOJE+1, o 1o do mes seguinte) e o `date('now')` do SQLite (o real, semanas antes) sao tres
 * dias diferentes; a guarda derruba o arquivo se isso nao valer. O PROPRIO processo do teste roda em TZ=America/Sao_Paulo (fixado abaixo,
 * antes do primeiro Date) para o unitario do marcador: no filho em UTC, ler o instante do banco "como local" da o mesmo que le-lo como UTC.
 *
 * As bordas das janelas (I6, I12, I90) sao calculadas pelo PROPRIO SQLite (`date(HOJE, '-6 months')`): no fim de mes ele normaliza
 * (HOJE 2027-03-31 -> 2026-10-01). Por isso as asercoes da janela sao tambem somas sobre todas as linhas e "nenhuma linha antes do mes da
 * borda" (Fase 2 I3) — sabem falhar em qualquer mes.
 *
 * Plano: docs/superpowers/plans/2026-10-20-almoxarifado-etapa166-os-relatorios-por-mes-e-a-data-no-texto-da-proposta-no-dia-de-brasilia.md
 * Executar: cd server && node tests/api/relatoriosPorMesDoComercialNoDiaLocal.api.test.js
 */
process.env.TZ = 'America/Sao_Paulo';
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const { prepareCompositionData } = require('../../propostaCompositionEngine');

const SERVER_DIR = path.join(__dirname, '..', '..');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

// ── o relogio do filho ───────────────────────────────────────────────────────────────────────
const somaDias = (dia, n) => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
const brt = (dia, hh, mm = 0) => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d, hh + 3, mm)).getTime(); };
/** o `created_at` do banco (UTC, sem fuso) das hh:mm de Brasilia do dia */
const banco = (dia, hh, mm = 0) => new Date(brt(dia, hh, mm)).toISOString().slice(0, 19).replace('T', ' ');
const HOJE = (() => {
  const real = new Date().toISOString(); // o mes UTC real
  let a = Number(real.slice(0, 4)); let m = Number(real.slice(5, 7)) + 1; // 1..13
  if (m > 12) { m -= 12; a += 1; }
  if (m === 12) { m = 1; a += 1; } // pula dezembro: HOJE+1 no mesmo ano
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); // ultimo dia do mes m
})();
const AMANHA = somaDias(HOJE, 1);
const ONTEM = somaDias(HOJE, -1);
const DIA05 = `${HOJE.slice(0, 8)}05`;
const BR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const mes = (dia) => dia.slice(0, 7);
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
const SEED = { email: 'e166seed@t.com', senha: 'E166seed!senha' };
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
let arquivo = null;
function abrirCru() {
  arquivo = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  arquivo.configure('busyTimeout', 15000);
}
const run = (sql, p = []) => new Promise((res, rej) => arquivo.run(sql, p, function feito(e) { if (e) rej(e); else res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => arquivo.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const ctx = { n: 0 };

async function inserir(tabela, campos) {
  const cols = await all(`PRAGMA table_info(${tabela})`);
  assert.ok(cols.length, `a tabela ${tabela} nao existe`);
  const dados = { ...campos };
  for (const c of cols) {
    if (c.pk || !c.notnull || c.dflt_value !== null || c.name in dados) continue;
    dados[c.name] = /INT|REAL|NUM/i.test(c.type) ? 1 : `x166-${++ctx.n}`;
  }
  const k = Object.keys(dados);
  return (await run(`INSERT INTO ${tabela} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`, Object.values(dados))).lastID;
}
const proposta = (cliente, criado, extra) => inserir('propostas', {
  cliente_id: cliente, numero_proposta: `E166-${++ctx.n}`, titulo: `PROPOSTA 166 ${ctx.n}`, status: 'rascunho', valor_total: 1,
  responsavel_id: ctx.admin, created_by: ctx.admin, created_at: criado, ...extra,
});
const porMes = (linhas) => Object.fromEntries((Array.isArray(linhas) ? linhas : []).map((x) => [x.mes, x]));
const soma = (linhas, campo) => (Array.isArray(linhas) ? linhas : []).reduce((s, x) => s + (Number(x[campo]) || 0), 0);

// ── no proprio processo (TZ=America/Sao_Paulo): o marcador ─────────────────────────────────────────────
test('[RN-166.07, B1063] {{proposal.date}}: a emissao DD/MM/AAAA como esta; senao o dia de Brasilia; nada legivel = vazio (neste processo em UTC-3)', () => {
  assert.strictEqual(new Date('2026-10-20').getDate(), 19, 'guarda: este processo tem de estar em UTC-3 (a meia-noite UTC e a vespera)');
  const data = (proposta, totais) => prepareCompositionData(proposta, [], totais).displayFields.proposal.date;
  assert.strictEqual(data({}, { dataEmissao: '20/10/2026' }), '20/10/2026', 'dia > 12: antes "Invalid Date"');
  assert.strictEqual(data({}, { dataEmissao: '05/11/2026' }), '05/11/2026', 'dia <= 12: antes 11/05/2026 (dia e mes trocados)');
  assert.strictEqual(data({ created_at: '2026-12-01 01:00:00' }, { dataEmissao: '' }), '30/11/2026',
    'emissao vazia: o dia de Brasilia do created_at (a leitura local daria 01/12)');
  assert.strictEqual(data({ created_at: '2026-12-01 01:00:00' }, undefined), '30/11/2026', 'sem totais: o created_at');
  assert.strictEqual(data({}, { dataEmissao: '2026-11-05' }), '05/11/2026', 'a emissao em outro formato: pelo dataDoBancoBR');
  assert.strictEqual(data({ created_at: '2026-12-01 01:00:00' }, { dataEmissao: '2026-12-01 01:00:00' }), '30/11/2026', 'a emissao como instante do banco');
  // Fase 5 r3 N15-N18: o contrato da funcao, nao so o caminho da rota (que so manda DD/MM/AAAA ou '')
  assert.strictEqual(data({}, { dataEmissao: 'x20/10/2026' }), '', 'o DD/MM/AAAA inteiro, ancorado (nao um pedaco do texto)');
  assert.strictEqual(data({}, { dataEmissao: ' 20/10/2026 ' }), '20/10/2026', 'aparado');
  assert.strictEqual(data({ created_at: '2026-10-01 12:00:00' }, { dataEmissao: '2026-11-05' }), '05/11/2026', 'a emissao vence o created_at');
  assert.strictEqual(data({ created_at: '2026-12-01 01:00:00' }, { dataEmissao: 'lixo' }), '30/11/2026', 'a emissao ilegivel cai no created_at');
  for (const [p, t] of [[{}, {}], [{ created_at: 'lixo' }, { dataEmissao: '' }], [{ created_at: null }, { dataEmissao: 'lixo' }], [{}, { dataEmissao: '31/02' }]]) {
    assert.strictEqual(data(p, t), '', `${JSON.stringify([p, t])} -> vazio (antes "Invalid Date")`);
  }
});

// ── o filho ─────────────────────────────────────────────────────────────────────────────────
test("guarda: o filho esta nas 22h de Brasilia de HOJE e o date('now') do SQLite nao e nem HOJE nem HOJE+1", async () => {
  const [s, h] = await cru('GET', '/api/health');
  assert.ok([200, 503].includes(s), `health ${s}`);
  const agoraFilho = new Date(h.timestamp).getTime();
  assert.ok(Math.abs(agoraFilho - ALVO) < 10 * 60000, `o relogio do filho (${h.timestamp}) nao esta perto das 22h de ${HOJE}`);
  const [{ d }] = await all("SELECT date('now') AS d");
  assert.ok(d < somaDias(HOJE, -8), `o date('now') (${d}) tem de estar semanas antes de HOJE (${HOJE}) — senao as bordas nao separam`);
  assert.notStrictEqual(mes(AMANHA), mes(HOJE), 'HOJE tem de ser o ultimo dia do mes');
});

test('massa: os clientes e uma proposta por borda (created_at escolhido, por fora)', async () => {
  ctx.admin = (await all('SELECT id FROM usuarios WHERE email = ?', [SEED.email]))[0].id;
  const [{ i6, i12, i90 }] = await all("SELECT date(?, '-6 months') AS i6, date(?, '-12 months') AS i12, date(?, '-90 days') AS i90", [HOJE, HOJE, HOJE]);
  Object.assign(ctx, { I6: i6, I12: i12, I90: i90 });
  const cli = (nome, estado) => inserir('clientes', { razao_social: nome, nome_fantasia: nome, status: 'ativo', estado, cidade: 'CIDADE' });
  ctx.A = await cli('CLIENTE A 166', 'SP');
  ctx.V0 = await cli('CLIENTE V0 166', 'MG');
  ctx.V1 = await cli('CLIENTE V1 166', 'MG');
  ctx.V2 = await cli('CLIENTE V2 166', 'MG');
  ctx.V3 = await cli('CLIENTE V3 166', 'MG');
  const p = ctx.p = {};
  p.E1 = await proposta(ctx.A, banco(HOJE, 22, 30), { status: 'aprovada', valor_total: 1000 });
  p.E2 = await proposta(ctx.A, banco(HOJE, 12, 0), { status: 'enviada', valor_total: 7 });
  p.F1 = await proposta(ctx.A, banco(ONTEM, 22, 30), { status: 'rejeitada', valor_total: 3 });
  p.G1 = await proposta(ctx.A, banco(DIA05, 22, 30), { status: 'rascunho', valor_total: 1 });
  p.E3 = await proposta(ctx.A, banco(i6, 0, 30), { status: 'aprovada', valor_total: 300 });
  p.E4 = await proposta(ctx.A, banco(somaDias(i6, -1), 22, 30), { status: 'aprovada', valor_total: 50 });
  p.E5 = await proposta(ctx.A, banco(somaDias(i6, -10), 12, 0), { status: 'aprovada', valor_total: 20 });
  p.H3 = await proposta(ctx.A, banco(i12, 0, 30), { status: 'aprovada', valor_total: 1 });
  p.H4 = await proposta(ctx.A, banco(somaDias(i12, -1), 22, 30), { status: 'aprovada', valor_total: 1 });
  p.H5 = await proposta(ctx.A, banco(somaDias(i12, -10), 12, 0), { status: 'aprovada', valor_total: 1 });
  p.V1 = await proposta(ctx.V1, banco(somaDias(i90, -1), 22, 30), { status: 'enviada' });
  p.V2 = await proposta(ctx.V2, banco(i90, 12, 0), { status: 'enviada' });
  p.V3 = await proposta(ctx.V3, banco(somaDias(i90, -1), 12, 0), { status: 'enviada' });
  const [{ n }] = await all("SELECT COUNT(*) AS n FROM clientes WHERE status = 'ativo'");
  assert.ok(n < 20, `guarda do LIMIT 20 dos clientes para visitar: ${n} clientes ativos`);
  const [{ outras }] = await all(`SELECT COUNT(*) AS outras FROM propostas WHERE id NOT IN (${Object.values(p).join(',')})`);
  assert.strictEqual(outras, 0, 'so as propostas da massa');
});

test('[RN-166.01, B1060] Relatorio Executivo, Evolucao de Propostas: a janela de 6 meses e o mes de Brasilia', async () => {
  const [s, r] = await j('GET', '/relatorios/executivo');
  assert.strictEqual(s, 200, JSON.stringify(r).slice(0, 200));
  const ev = r.graficos.evolucaoPropostas;
  assert.ok(Array.isArray(ev) && ev.length > 0, `a evolucao veio vazia: ${JSON.stringify(ev)} (um ? a menos liga NULL — Fase 2 I1)`);
  const m = porMes(ev);
  assert.deepStrictEqual(m[mes(HOJE)] && [m[mes(HOJE)].total, m[mes(HOJE)].valor_aprovado], [4, 1000], `o mes de HOJE (E1 das 22h30 conta nele): ${JSON.stringify(ev)}`);
  assert.ok(!m[mes(AMANHA)], `nenhuma linha no mes de HOJE+1 (o mes UTC de E1): ${JSON.stringify(ev)}`);
  assert.deepStrictEqual(m[mes(ctx.I6)] && [m[mes(ctx.I6)].total, m[mes(ctx.I6)].valor_aprovado], [1, 300], `o mes da borda (${ctx.I6}): so E3`);
  assert.deepStrictEqual(ev.filter((x) => !x.mes || x.mes < mes(ctx.I6)), [], `nenhuma linha antes do mes de ${ctx.I6} (E4, E5 fora)`);
  assert.strictEqual(new Set(ev.map((x) => x.mes)).size, ev.length, `um mes por linha (o GROUP BY pelo mes de Brasilia — Fase 5 r3 N08): ${JSON.stringify(ev)}`);
  assert.deepStrictEqual([soma(ev, 'total'), soma(ev, 'valor_aprovado')], [8, 1300], `as somas (E1, E2, F1, G1, E3, V1, V2, V3; aprovadas E1+E3): ${JSON.stringify(ev)}`);
});

test('[RN-166.02, B1060] Relatorio Executivo, Clientes que Precisam de Visita: a ultima proposta antes de hoje - 90 dias (Brasilia)', async () => {
  const [s, r] = await j('GET', '/relatorios/executivo');
  assert.strictEqual(s, 200);
  const ids = (r.insights.clientesParaVisitar || []).map((c) => c.id).sort((a, b) => a - b);
  assert.deepStrictEqual(ids, [ctx.V0, ctx.V1, ctx.V3].sort((a, b) => a - b),
    `V0 (sem proposta), V1 (22h30 de I90-1 = I90 em UTC) e V3 (meio-dia de I90-1); nao V2 (I90) nem A: ${JSON.stringify(r.insights.clientesParaVisitar)}`);
  const v1 = r.insights.clientesParaVisitar.find((c) => c.id === ctx.V1);
  assert.strictEqual(v1.ultima_proposta, banco(somaDias(ctx.I90, -1), 22, 30), 'a ultima proposta crua (a tela formata)');
});

test('[RN-166.03, B1060] Visitas Tecnicas: as propostas dos ultimos 90 dias e a regra de atividade recente (Brasilia)', async () => {
  const [s, r] = await j('GET', '/relatorios/visitas-tecnicas');
  assert.strictEqual(s, 200, JSON.stringify(r).slice(0, 200));
  const todos = [...(r.elegiveis || []), ...(r.naoElegiveis || [])];
  const por = Object.fromEntries(todos.map((c) => [c.id, c]));
  const got = [ctx.V1, ctx.V2, ctx.V3, ctx.A].map((id) => por[id] && [por[id].propostas_ultimos_90_dias, por[id].regras.atividadeRecente.passou]);
  assert.deepStrictEqual(got, [[0, false], [1, true], [0, false], [4, true]],
    `V1 (I90-1 22h30) 0, V2 (I90) 1, V3 (I90-1) 0, A (E1, E2, F1, G1) 4: ${JSON.stringify(todos.map((c) => [c.id, c.propostas_ultimos_90_dias]))}`);
  assert.strictEqual(por[ctx.V1].regras.atividadeRecente.mensagem, 'Cliente não teve propostas nos últimos 90 dias');
});

test('[RN-166.04, B1060] Tendencias Mensais do painel: 12 meses e o mes de Brasilia', async () => {
  const [s, h] = await j('GET', '/dashboard/historico');
  assert.strictEqual(s, 200, JSON.stringify(h).slice(0, 200));
  assert.ok(Array.isArray(h) && h.length > 0, `o historico veio vazio: ${JSON.stringify(h)}`);
  const m = porMes(h);
  assert.strictEqual(m[mes(HOJE)] && m[mes(HOJE)].propostas_aprovadas, 1, `o mes de HOJE (E1 das 22h30): ${JSON.stringify(h)}`);
  assert.ok(!m[mes(AMANHA)], `nenhuma linha no mes de HOJE+1: ${JSON.stringify(h)}`);
  assert.strictEqual(m[mes(ctx.I12)] && m[mes(ctx.I12)].propostas_aprovadas, 1, `o mes da borda (${ctx.I12}): so H3`);
  assert.deepStrictEqual(h.filter((x) => !x.mes || x.mes < mes(ctx.I12)), [], `nenhuma linha antes do mes de ${ctx.I12} (H4, H5 fora)`);
  assert.strictEqual(new Set(h.map((x) => x.mes)).size, h.length, `um mes por linha (o GROUP BY pelo mes de Brasilia — Fase 5 r3 N09): ${JSON.stringify(h)}`);
  assert.strictEqual(soma(h, 'propostas_aprovadas'), 5, `a soma das aprovadas (E1, E3, E4, E5, H3): ${JSON.stringify(h)}`);
});

test('[RN-166.05, B1061] o filtro De/Ate do painel no dia de Brasilia (/dashboard e /dashboard/avancado, com e sem alias)', async () => {
  const q = `?inicio=${HOJE}&fim=${HOJE}`;
  const [s, d] = await j('GET', `/dashboard${q}`);
  assert.strictEqual(s, 200, JSON.stringify(d).slice(0, 200));
  const st = Object.fromEntries((d.propostasPorStatus || []).map((x) => [x.status, x.total]));
  assert.deepStrictEqual(st, { aprovada: 1, enviada: 1 }, `E1 (22h30 de HOJE) entra, F1 (22h30 de ONTEM) sai: ${JSON.stringify(d.propostasPorStatus)}`);
  assert.strictEqual(d.valorTotalPropostasAprovadas, 1000);
  const [s2, a] = await j('GET', `/dashboard/avancado${q}`);
  assert.strictEqual(s2, 200);
  const topA = (a.topClientesPorValor || []).find((x) => x.id === ctx.A);
  assert.deepStrictEqual(topA && [topA.total_propostas, topA.valor_total], [2, 1007], `o ramo com alias (p.created_at): E1 + E2 (sem o modificador: E2 + F1 = 10): ${JSON.stringify(a.topClientesPorValor)}`);
  // sem filtro: nada muda (controle)
  const [, livre] = await j('GET', '/dashboard');
  assert.strictEqual((livre.propostasPorStatus || []).reduce((x, y) => x + y.total, 0), Object.keys(ctx.p).length, 'sem filtro, todas');
});

test('[RN-166.07, B1063 / T3] o /premium: {{proposal.date}} na clausula escrita pela rota = a Data de Emissao da capa', async () => {
  const emissao = (html) => { const m = /Data de Emissão: <strong>([^<]*)<\/strong>/.exec(String(html)); return m ? m[1] : 'sem a linha'; };
  const marcador = (html) => { const m = /DATA-MARCADOR\[([^\]]*)\]/.exec(String(html)); return m ? m[1] : 'sem o marcador'; };
  for (const [k, esperado] of [['E1', BR(HOJE)], ['G1', BR(DIA05)]]) {
    const id = ctx.p[k];
    const [sc, c] = await j('POST', `/propostas/${id}/clausulas`, { titulo: '5.30 DATA', conteudo: 'DATA-MARCADOR[{{proposal.date}}]' });
    assert.ok(sc === 200 || sc === 201, `a clausula de ${k}: ${sc} ${JSON.stringify(c)}`);
    const [s, html] = await j('GET', `/propostas/${id}/premium`);
    assert.strictEqual(s, 200, String(html).slice(0, 200));
    assert.strictEqual(emissao(html), esperado, `${k}: a capa`);
    assert.strictEqual(marcador(html), esperado, `${k}: o marcador no texto (antes: Invalid Date / o dia e o mes trocados)`);
  }
});

(async () => {
  console.log(`\n▶ Etapa 166 — relatorios por mes e a data no texto da proposta no dia de Brasilia (HOJE ${HOJE}, o filho as 22h)\n`);
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e166-'));
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
    if (arquivo) await new Promise((r) => arquivo.close(r));
    await descer();
    try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo as vezes */ }
  }
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})();
