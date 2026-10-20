/**
 * Etapa 164 (Frotas e Financeiro) — os vencimentos, os alertas, os paineis e os filtros de periodo no dia de Brasilia (C409), pelo
 * `index.js` de verdade (pasta vazia): as rotas de Frotas e do Financeiro nao estao no `createTestApp`.
 *
 *   RN-164.01  documento *vencendo*: venc <= hoje + alerta_dias_antes (padrao 30) — o alerta e a lista ?vencendo=1 (com filtros combinados)
 *   RN-164.02  CNH <= hoje + 30; revisao <= hoje + 15; multa pendente <= hoje + 15
 *   RN-164.03  consumo baixo: abastecimentos desde hoje - 60
 *   RN-164.04  painel: combustivel do mes de Brasilia, checklists de hoje, manutencao vencida (< hoje)
 *   RN-164.05  dias_restantes = data - hoje de Brasilia (o dia inteiro, independente do TZ) e a severidade
 *   RN-164.06  manutencao sem data grava o hoje de Brasilia
 *   RN-164.07  painel do Financeiro: vencidas (< hoje), receita do grafico (pendente <= hoje), mes/ano padrao de Brasilia
 *   RN-164.08  ?periodo=mes|trimestre|ano das tres listas pelo calendario de Brasilia (combinado com busca e status)
 *   T4         o mesmo documento/revisao na lista, no alerta e no painel
 *
 * DEPENDE DO RELOGIO E DO FUSO — e por isso fixa os dois: o filho sobe com TZ=UTC e o relogio do JavaScript adiantado
 * (tests/helpers/relogioAdiantado.js) para as 22h de Brasilia do ULTIMO dia do mes seguinte ao mes UTC real (pulando dezembro, para que
 * HOJE+1 caia no mesmo ano). Assim o hoje de Brasilia (HOJE), o dia UTC do JS (HOJE+1, primeiro dia do outro mes) e o `date('now')` do
 * SQLite (o real, semanas antes) sao tres dias e tres meses diferentes (Fase 2 I1 da 164: com o mes de Brasilia real, o mes do
 * `date('now')` coincidia com o de HOJE 3 h por mes). A guarda derruba o arquivo se isso nao valer. O PROPRIO processo do teste roda em
 * TZ=America/Sao_Paulo (fixado abaixo, antes do primeiro Date) so para a prova do `diasAte`: a regua antiga dava -1 para hoje nesse fuso.
 *
 * Plano: docs/superpowers/plans/2026-10-20-almoxarifado-etapa164-os-vencimentos-de-frotas-e-do-financeiro-no-dia-de-brasilia.md
 * Executar: cd server && node tests/api/vencimentosFrotasFinanceiroNoDiaLocal.api.test.js
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
const frotasService = require('../../services/frotas/frotasService');

const SERVER_DIR = path.join(__dirname, '..', '..');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

// ── o relogio do filho ───────────────────────────────────────────────────────────────────────
const somaDias = (dia, n) => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
const brt = (dia, hh, mm = 0) => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d, hh + 3, mm)).getTime(); };
const HOJE = (() => {
  const real = new Date().toISOString(); // o mes UTC real (Fase 2 I1)
  let a = Number(real.slice(0, 4)); let m = Number(real.slice(5, 7)) + 1; // 1..13
  if (m > 12) { m -= 12; a += 1; }
  if (m === 12) { m = 1; a += 1; } // pula dezembro: HOJE+1 no mesmo ano
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); // ultimo dia do mes m
})();
const AMANHA = somaDias(HOJE, 1);
const ONTEM = somaDias(HOJE, -1);
const MES = HOJE.slice(0, 7);
const ANO = Number(HOJE.slice(0, 4));
const NUM_MES = Number(HOJE.slice(5, 7));
const ALVO = brt(HOJE, 22, 0);
const DESLOCAMENTO = ALVO - Date.now();
const D = (n) => somaDias(HOJE, n);

// ── o servidor real ─────────────────────────────────────────────────────────────────────────
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
const j = (m, u, body, tok = ctx.T) => cru(m, `/api${u}`, tok, body);
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e164seed@t.com', senha: 'E164seed!senha' };
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
const ctx = {};
const q = (o) => new URLSearchParams(o).toString();
const ids = (lista) => (Array.isArray(lista) ? lista.map((x) => x.id) : ['nao e lista: ' + JSON.stringify(lista)]);
const mesmos = (a, b, msg) => assert.deepStrictEqual([...a].sort((x, y) => x - y), [...b].sort((x, y) => x - y), msg);

async function inserir(tabela, campos) {
  const cols = await all(`PRAGMA table_info(${tabela})`);
  assert.ok(cols.length, `a tabela ${tabela} nao existe`);
  const dados = { ...campos };
  for (const c of cols) {
    if (c.pk || !c.notnull || c.dflt_value !== null || c.name in dados) continue;
    dados[c.name] = /INT|REAL|NUM/i.test(c.type) ? 1 : 'x164';
  }
  const k = Object.keys(dados);
  return (await run(`INSERT INTO ${tabela} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`, Object.values(dados))).lastID;
}
let nPlaca = 0;
const veiculo = (extra = {}) => inserir('frotas_veiculos', { placa: `E164V${String(++nPlaca).padStart(3, '0')}`, ...extra });
const alerta = (lista, tipo, id) => (lista || []).find((a) => a.tipo === tipo && a.referencia_id === id);

// ── no proprio processo (TZ=America/Sao_Paulo): o diasAte e o inicio do periodo ─────────────────────────────────
test('[RN-164.05, B1047] diasAte: a data menos o hoje de Brasilia em dias, sem depender do TZ (a regua antiga dava -1 para hoje em UTC-3)', () => {
  assert.strictEqual(new Date('2026-10-20').getDate(), 19, 'guarda: este processo tem de estar em UTC-3 (a meia-noite UTC e a vespera)');
  assert.strictEqual(frotasService.diasAte(diaLocal.hojeLocalISO()), 0, 'o vencimento de hoje = 0 dia (o padrao do hoje e o de Brasilia)');
  assert.strictEqual(frotasService.diasAte('2026-11-30', '2026-11-30'), 0);
  assert.strictEqual(frotasService.diasAte('2026-12-01', '2026-11-30'), 1);
  assert.strictEqual(frotasService.diasAte('2026-11-29', '2026-11-30'), -1);
  assert.strictEqual(frotasService.diasAte('2027-03-01', '2027-02-28'), 1, 'a virada de fevereiro');
  assert.strictEqual(frotasService.diasAte('2026-12-31', '2026-10-01'), 91);
  assert.strictEqual(frotasService.diasAte(null, '2026-11-30'), null);
  assert.strictEqual(frotasService.diasAte('', '2026-11-30'), null);
  assert.strictEqual(frotasService.diasAte('lixo', '2026-11-30'), null);
  assert.strictEqual(frotasService.diasAte('2026-02-30', '2026-11-30'), null, 'data impossivel = nula (como antes)');
});

test('[RN-164.08, B1049] inicioDoPeriodoLocalISO: o mes, o trimestre e o ano de Brasilia nas viradas (as 22h do ultimo dia)', () => {
  const p = diaLocal.inicioDoPeriodoLocalISO;
  const as22 = (dia) => new Date(brt(dia, 22));
  assert.strictEqual(p('mes', as22('2026-10-31')), '2026-10-01');
  assert.strictEqual(p('mes', new Date(brt('2026-11-01', 0, 10))), '2026-11-01');
  assert.strictEqual(p('trimestre', as22('2026-03-31')), '2026-01-01');
  assert.strictEqual(p('trimestre', as22('2026-06-30')), '2026-04-01');
  assert.strictEqual(p('trimestre', as22('2026-09-30')), '2026-07-01');
  assert.strictEqual(p('trimestre', as22('2026-12-31')), '2026-10-01');
  assert.strictEqual(p('trimestre', new Date(brt('2026-10-01', 0, 30))), '2026-10-01');
  assert.strictEqual(p('ano', as22('2026-12-31')), '2026-01-01');
  assert.strictEqual(p('ano', new Date(brt('2027-01-01', 0, 30))), '2027-01-01');
  for (const v of ['todos', '', undefined, null, 'semana']) assert.strictEqual(p(v, as22('2026-10-31')), null, String(v));
});

// ── o filho ─────────────────────────────────────────────────────────────────────────────────
test('guarda: o filho esta nas 22h de Brasilia de HOJE e o date(\'now\') do SQLite esta num TERCEIRO mes (nem o de HOJE nem o de HOJE+1)', async () => {
  const [s, h] = await cru('GET', '/api/health');
  assert.ok([200, 503].includes(s), `health ${s}`);
  const agoraFilho = new Date(h.timestamp).getTime();
  assert.ok(Math.abs(agoraFilho - ALVO) < 10 * 60000, `o relogio do filho (${h.timestamp}) nao esta perto das 22h de ${HOJE}`);
  const [{ m, d }] = await all("SELECT strftime('%Y-%m', 'now') AS m, date('now') AS d");
  assert.notStrictEqual(m, MES, `o mes do date('now') (${d}) e o de HOJE (${HOJE}) — a sabotagem de mes passaria vazia`);
  assert.notStrictEqual(m, AMANHA.slice(0, 7), `o mes do date('now') (${d}) e o de HOJE+1 (${AMANHA})`);
  assert.strictEqual(AMANHA.slice(0, 4), HOJE.slice(0, 4), 'HOJE+1 no mesmo ano de HOJE (o grafico do Financeiro)');
  assert.strictEqual(AMANHA.slice(8), '01', 'HOJE e o ultimo dia do mes');
});

test('massa de Frotas (por fora, depois do schema do modulo)', async () => {
  const [sm] = await j('GET', '/frotas/meta');
  assert.strictEqual(sm, 200, 'o /frotas/meta (espera o schema)');
  const vDoc = await veiculo();
  const doc = (venc, extra = {}) => inserir('frotas_documentos', { veiculo_id: vDoc, tipo: 'ipva', data_vencimento: venc, alerta_dias_antes: null, status: 'ativo', ...extra });
  ctx.doc = {
    d0: await doc(HOJE), d1: await doc(ONTEM), d7: await doc(D(7)), d8: await doc(D(8)),
    d30: await doc(D(30)), d31: await doc(D(31)),
    d10: await doc(D(10), { alerta_dias_antes: 10 }), d11: await doc(D(11), { alerta_dias_antes: 10 }),
    dRenovado: await doc(HOJE, { status: 'renovado' }),
  };
  // os filtros combinados: outro veiculo, tipo seguro, busca na descricao
  const vSeg = await veiculo();
  ctx.vSeg = vSeg;
  const seg = (venc, extra = {}) => inserir('frotas_documentos', { veiculo_id: vSeg, tipo: 'seguro', descricao: 'APOLICE E164', data_vencimento: venc, alerta_dias_antes: null, status: 'ativo', ...extra });
  ctx.seg = { s30: await seg(D(30)), s31: await seg(D(31)), sIpva: await seg(HOJE, { tipo: 'ipva' }), sOutra: await seg(HOJE, { descricao: 'OUTRA' }) };
  const mot = (validade) => inserir('frotas_motoristas', { nome: `MOT ${validade}`, cnh_validade: validade, status: 'ativo', ativo: 1 });
  ctx.mot = { m30: await mot(D(30)), m31: await mot(D(31)), m0: await mot(HOJE) };
  // revisoes: um veiculo por borda, sem a regua de km (Fase 2 I2)
  const rev = async (data) => inserir('frotas_manutencoes', { veiculo_id: await veiculo(), descricao: `REV ${data}`, proxima_revisao_data: data, proxima_revisao_km: null, data_manutencao: '2020-01-01', custo: 0 });
  ctx.rev = { r0: await rev(HOJE), r1: await rev(ONTEM), r15: await rev(D(15)), r16: await rev(D(16)) };
  const multa = (venc, st = 'pendente') => inserir('frotas_multas', { veiculo_id: vDoc, data_vencimento: venc, status_pagamento: st, valor: 1, descricao: `MULTA ${venc}` });
  ctx.multa = { mu15: await multa(D(15)), mu16: await multa(D(16)), muPago: await multa(HOJE, 'pago') };
  // consumo baixo: um veiculo so com HOJE-60 (alerta) e outro so com HOJE-61 (nao)
  ctx.c60 = await veiculo({ consumo_medio_esperado: 10 });
  ctx.c61 = await veiculo({ consumo_medio_esperado: 10 });
  const abast = (v, data, valor, consumo = null) => inserir('frotas_abastecimentos', { veiculo_id: v, data_abastecimento: data, litros: 1, valor_total: valor, consumo_medio: consumo });
  await abast(ctx.c60, D(-60), 0, 5);
  await abast(ctx.c61, D(-61), 0, 5);
  // combustivel do mes: somas diferentes no mes de HOJE (111+222), no de HOJE+1 (4000) e no mes real (50000)
  const vComb = await veiculo();
  await abast(vComb, HOJE, 111);
  await abast(vComb, `${MES}-01`, 222);
  await abast(vComb, AMANHA, 4000);
  const [{ d: real }] = await all("SELECT date('now') AS d");
  await abast(vComb, real, 50000);
  // checklists: 2 em HOJE, 1 em HOJE+1, 1 em HOJE-1
  for (const dia of [HOJE, HOJE, AMANHA, ONTEM]) await inserir('frotas_checklists', { veiculo_id: vComb, data_checklist: dia });
});

test('[RN-164.01, RN-164.05, B1046, B1047] os alertas de documento: o teto e hoje + N (o N do documento, ou 30), e os dias restantes e a cor', async () => {
  const [s, lista] = await j('GET', '/frotas/alertas');
  assert.strictEqual(s, 200);
  const dc = ctx.doc;
  for (const k of ['d0', 'd1', 'd7', 'd8', 'd30', 'd10']) assert.ok(alerta(lista, 'documento', dc[k]), `${k} esta nos alertas`);
  for (const k of ['d31', 'd11', 'dRenovado']) assert.ok(!alerta(lista, 'documento', dc[k]), `${k} NAO esta nos alertas`);
  const dias = (k) => alerta(lista, 'documento', dc[k]).dias_restantes;
  const cor = (k) => alerta(lista, 'documento', dc[k]).severidade;
  assert.deepStrictEqual([dias('d0'), dias('d1'), dias('d7'), dias('d8'), dias('d30'), dias('d10')], [0, -1, 7, 8, 30, 10], 'os dias restantes');
  assert.deepStrictEqual([cor('d0'), cor('d1'), cor('d7'), cor('d8')], ['alto', 'critico', 'alto', 'medio'], 'a severidade (o de hoje nao e critico)');
});

test('[RN-164.02, RN-164.03, RN-164.05, B1046] CNH (+30), revisao (+15), multa pendente (+15) e o consumo baixo (desde hoje - 60)', async () => {
  const [, lista] = await j('GET', '/frotas/alertas');
  assert.ok(alerta(lista, 'cnh', ctx.mot.m30), 'CNH de HOJE+30 entra');
  assert.ok(!alerta(lista, 'cnh', ctx.mot.m31), 'CNH de HOJE+31 nao entra');
  assert.strictEqual(alerta(lista, 'cnh', ctx.mot.m30).dias_restantes, 30);
  assert.strictEqual(alerta(lista, 'cnh', ctx.mot.m0).dias_restantes, 0);
  assert.strictEqual(alerta(lista, 'cnh', ctx.mot.m0).severidade, 'alto', 'a CNH de hoje nao e critica');
  const r = ctx.rev;
  for (const k of ['r0', 'r1', 'r15']) assert.ok(alerta(lista, 'manutencao', r[k]), `revisao ${k} entra`);
  assert.ok(!alerta(lista, 'manutencao', r.r16), 'revisao de HOJE+16 nao entra');
  assert.deepStrictEqual([r.r0, r.r1, r.r15].map((id) => alerta(lista, 'manutencao', id).dias_restantes), [0, -1, 15]);
  assert.deepStrictEqual([r.r0, r.r1].map((id) => alerta(lista, 'manutencao', id).severidade), ['medio', 'critico']);
  assert.ok(alerta(lista, 'multa', ctx.multa.mu15), 'multa de HOJE+15 entra');
  assert.strictEqual(alerta(lista, 'multa', ctx.multa.mu15).dias_restantes, 15);
  assert.ok(!alerta(lista, 'multa', ctx.multa.mu16), 'multa de HOJE+16 nao entra');
  assert.ok(!alerta(lista, 'multa', ctx.multa.muPago), 'a paga nao entra');
  assert.ok(alerta(lista, 'consumo', ctx.c60), 'o consumo baixo de HOJE-60 entra');
  assert.ok(!alerta(lista, 'consumo', ctx.c61), 'o de HOJE-61 nao entra');
});

test('[RN-164.01, B1046] a lista ?vencendo=1 com filtros combinados (veiculo, tipo, busca): o hoje no lugar certo', async () => {
  const [s, lista] = await j('GET', '/frotas/documentos?' + q({ vencendo: '1', veiculo_id: String(ctx.vSeg), tipo: 'seguro', search: 'APOLICE' }));
  assert.strictEqual(s, 200);
  mesmos(ids(lista), [ctx.seg.s30], 'so o seguro de HOJE+30 do veiculo, com a busca');
  const [, sem] = await j('GET', '/frotas/documentos?' + q({ vencendo: '1', veiculo_id: String(ctx.vSeg) }));
  mesmos(ids(sem), [ctx.seg.s30, ctx.seg.sIpva, ctx.seg.sOutra], 'so o veiculo: os tres dentro do teto, o de HOJE+31 fora');
  const [, todos] = await j('GET', '/frotas/documentos?' + q({ vencendo: '1' }));
  assert.ok(ids(todos).includes(ctx.doc.dRenovado), 'a lista nao filtra status (como antes)');
  assert.ok(ids(todos).includes(ctx.doc.d10) && !ids(todos).includes(ctx.doc.d11), 'o N do documento (10)');
});

test('[RN-164.04, T4, B1046] o painel: combustivel do mes, checklists de hoje, manutencao vencida e os alertas iguais aos da rota', async () => {
  const [s, p] = await j('GET', '/frotas/dashboard?refresh=1');
  assert.strictEqual(s, 200);
  assert.strictEqual(p.custoCombustivelMes, 333, 'o mes de HOJE (111 + 222), nem o de HOJE+1 (4000) nem o real (50000)');
  assert.strictEqual(p.checklistsHoje, 2, 'os dois de HOJE (nem o de HOJE+1 nem o de ontem)');
  assert.strictEqual(p.manutencoesVencidas, 1, 'so o veiculo da revisao de ontem (a de hoje nao venceu)');
  const [, lista] = await j('GET', '/frotas/alertas');
  assert.strictEqual(p.alertasCount, lista.length, 'o painel conta os mesmos alertas da rota');
  const d0 = (p.alertas || []).find((a) => a.tipo === 'documento' && a.referencia_id === ctx.doc.d0) || alerta(lista, 'documento', ctx.doc.d0);
  assert.strictEqual(d0.dias_restantes, 0);
  const [, venc] = await j('GET', '/frotas/documentos?vencendo=1');
  assert.ok(ids(venc).includes(ctx.doc.d0), 'T4: o documento de HOJE na lista vencendo, no alerta (0, alto) e no painel');
});

test('[RN-164.06, B1048] a manutencao sem data grava o hoje de Brasilia', async () => {
  const v = await veiculo();
  const [s, m] = await j('POST', '/frotas/manutencoes', { veiculo_id: v, descricao: 'SEM DATA E164' });
  assert.ok([200, 201].includes(s), `POST ${s} ${JSON.stringify(m)}`);
  assert.strictEqual(m.data_manutencao, HOJE);
  const [s2, m2] = await j('POST', '/frotas/manutencoes', { veiculo_id: v, descricao: 'COM DATA E164', data_manutencao: '2026-01-02' });
  assert.ok([200, 201].includes(s2));
  assert.strictEqual(m2.data_manutencao, '2026-01-02', 'a data mandada continua a que vale');
});

// ── Financeiro ──────────────────────────────────────────────────────────────────────────────
const PRIMEIRO = `${MES}-01`;
const VESPERA_DO_MES = somaDias(PRIMEIRO, -1);
const TRI = `${HOJE.slice(0, 4)}-${String(Math.floor((NUM_MES - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
const JAN = `${ANO}-01-01`;

test('massa do Financeiro (por fora)', async () => {
  const cr = (venc, valor, status = 'pendente', descricao = 'E164 CR') => inserir('contas_receber', { descricao, valor, data_vencimento: venc, status });
  const cp = (venc, valor, status = 'pendente', descricao = 'E164 CP') => inserir('contas_pagar', { descricao, valor, data_vencimento: venc, status });
  ctx.cr = {
    hoje: await cr(HOJE, 100), ontem: await cr(ONTEM, 10), anteontem: await cr(D(-2), 20, 'parcial'), amanha: await cr(AMANHA, 7000),
    recebidoAmanha: await cr(AMANHA, 3, 'recebido'),
    pPrimeiro: await cr(PRIMEIRO, 1, 'pendente', 'E164 PER'), pVespera: await cr(VESPERA_DO_MES, 2, 'pendente', 'E164 PER'),
    tPrimeiro: await cr(TRI, 4, 'recebido', 'E164 TRI'), tVespera: await cr(somaDias(TRI, -1), 5, 'recebido', 'E164 TRI'),
    aPrimeiro: await cr(JAN, 6, 'recebido', 'E164 ANO'), aVespera: await cr(somaDias(JAN, -1), 8, 'recebido', 'E164 ANO'),
  };
  ctx.cp = {
    hoje: await cp(HOJE, 1), ontem: await cp(ONTEM, 1), amanha: await cp(AMANHA, 1),
    pPrimeiro: await cp(PRIMEIRO, 1, 'pendente', 'E164 PERP'), pVespera: await cp(VESPERA_DO_MES, 1, 'pendente', 'E164 PERP'),
    pPrimeiroPago: await cp(PRIMEIRO, 1, 'pago', 'E164 PERP'),
  };
  ctx.fc = {
    primeiro: await inserir('fluxo_caixa', { data: PRIMEIRO, descricao: 'E164 FC', tipo: 'entrada', valor: 1 }),
    vespera: await inserir('fluxo_caixa', { data: VESPERA_DO_MES, descricao: 'E164 FC', tipo: 'entrada', valor: 1 }),
  };
});

test('[RN-164.07, B1049] o painel: vencidas = pendente/parcial antes de hoje (receber e pagar), receita do grafico = ate hoje', async () => {
  const [s, p] = await j('GET', '/financeiro/dashboard?' + q({ mes: String(NUM_MES), ano: String(ANO) }));
  assert.strictEqual(s, 200);
  const [{ n: vr }] = await all("SELECT COUNT(*) n FROM contas_receber WHERE status IN ('pendente','parcial') AND data_vencimento < ?", [HOJE]);
  const [{ n: vp }] = await all("SELECT COUNT(*) n FROM contas_pagar WHERE status IN ('pendente','parcial') AND data_vencimento < ?", [HOJE]);
  assert.strictEqual(vr, 4, 'a massa: ontem, anteontem, o primeiro do mes e a vespera do mes'); // HOJE e o ultimo dia: o primeiro e anterior
  assert.strictEqual(vp, 3, 'a massa: ontem, o primeiro do mes e a vespera do mes');
  assert.strictEqual(p.contasReceber.vencidas, vr, 'receber: a de hoje nao conta vencida');
  assert.strictEqual(p.contasPagar.vencidas, vp, 'pagar: a de hoje nao conta vencida');
  const receita = (mesNum) => p.chartReceitasDespesas[mesNum - 1].receita;
  // mes de HOJE: pendentes/parciais ate HOJE (100 + 10 + 20 + 1) + recebidas do mes (o primeiro do trimestre se cair neste mes)
  const [{ t: esperadoMes }] = await all(`SELECT COALESCE(SUM(valor),0) t FROM contas_receber WHERE strftime('%Y-%m', data_vencimento) = ?
    AND (status = 'recebido' OR (status IN ('pendente','parcial') AND data_vencimento <= ?))`, [MES, HOJE]);
  assert.ok(esperadoMes >= 131, `a soma esperada do mes (${esperadoMes})`);
  assert.strictEqual(receita(NUM_MES), esperadoMes, 'a pendente de hoje soma');
  assert.strictEqual(receita(NUM_MES + 1), 3, 'no mes de HOJE+1 so a recebida (a pendente de amanha nao soma)');
});

test('[RN-164.07, B1049] o painel sem mes/ano: os de Brasilia (antes mes: null), e mes nao numerico = o padrao', async () => {
  const [s, p] = await j('GET', '/financeiro/dashboard');
  assert.strictEqual(s, 200);
  assert.strictEqual(p.mes, NUM_MES);
  assert.strictEqual(p.ano, ANO);
  const [, p2] = await j('GET', '/financeiro/dashboard?mes=abc&ano=' + ANO);
  assert.strictEqual(p2.mes, NUM_MES);
  const [, p3] = await j('GET', '/financeiro/dashboard?mes=3&ano=2020');
  assert.deepStrictEqual([p3.mes, p3.ano], [3, 2020], 'o mes e o ano mandados continuam os que valem');
});

test('[RN-164.08, B1049] ?periodo=mes nas tres listas: desde o dia 1 do mes de Brasilia, combinado com status e busca', async () => {
  const [s1, r] = await j('GET', '/financeiro/contas-receber?' + q({ periodo: 'mes', search: 'E164 PER' }));
  assert.strictEqual(s1, 200);
  mesmos(ids(r), [ctx.cr.pPrimeiro], 'receber: o dia 1 entra, a vespera nao');
  const [, pg] = await j('GET', '/financeiro/contas-pagar?' + q({ periodo: 'mes', status: 'pendente', search: 'E164 PERP' }));
  mesmos(ids(pg), [ctx.cp.pPrimeiro], 'pagar com status e busca: so o pendente do dia 1');
  const [, pgTodos] = await j('GET', '/financeiro/contas-pagar?' + q({ periodo: 'mes', search: 'E164 PERP' }));
  mesmos(ids(pgTodos), [ctx.cp.pPrimeiro, ctx.cp.pPrimeiroPago], 'pagar sem status: os dois do dia 1');
  const [, fc] = await j('GET', '/financeiro/fluxo-caixa?periodo=mes');
  assert.ok(ids(fc).includes(ctx.fc.primeiro) && !ids(fc).includes(ctx.fc.vespera), 'fluxo: o dia 1 entra, a vespera nao');
  const [, todos] = await j('GET', '/financeiro/contas-receber?' + q({ periodo: 'todos', search: 'E164 PER' }));
  mesmos(ids(todos), [ctx.cr.pPrimeiro, ctx.cr.pVespera], 'periodo todos: sem corte (metade positiva)');
});

test('[RN-164.08, B1049, Fase 2 M5] ?periodo=trimestre e ?periodo=ano pela rota: o dia 1 entra, a vespera nao', async () => {
  const [, t] = await j('GET', '/financeiro/contas-receber?' + q({ periodo: 'trimestre', search: 'E164 TRI' }));
  mesmos(ids(t), [ctx.cr.tPrimeiro], `trimestre desde ${TRI}`);
  const [, a] = await j('GET', '/financeiro/contas-receber?' + q({ periodo: 'ano', search: 'E164 ANO' }));
  mesmos(ids(a), [ctx.cr.aPrimeiro], `ano desde ${JAN}`);
});

(async () => {
  console.log(`\n▶ Etapa 164 — vencimentos de Frotas e do Financeiro no dia de Brasilia (HOJE ${HOJE}, o filho as 22h)\n`);
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e164-'));
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
