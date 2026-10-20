/**
 * Etapa 162 (Almoxarifado) — o dia de Brasilia nos relatorios e no painel (C401), nos indicadores de prazo e nos alertas (B1037), na
 * expiracao das reservas (C404) e na planilha exportada (B1039), pelo `index.js` de verdade (pasta vazia).
 *
 *   RN-162.01 (C401)  os nove relatorios e o movimentacoes-periodo: o periodo pelo dia de Brasilia do instante
 *   RN-162.02 (C401)  o painel: movimentacoesHoje e o grafico de 7 dias pelo dia de Brasilia
 *   RN-162.03 (C401)  o nome do arquivo exportado: <tipo>-<hoje de Brasilia>.xlsx
 *   RN-162.04 (B1037) indicadores, requisicoes no prazo: o prazo contra o hoje de Brasilia, a entrega pelo dia de Brasilia
 *   RN-162.05 (C404)  POST /reservas/processar-expiracao: expira so o vencimento ANTERIOR ao hoje de Brasilia
 *   RN-162.06 (C404)  o vencimento padrao: hoje de Brasilia + reserva_dias_validade
 *   RN-162.07         os alertas Reserva parada (vencimento) e Requisicao atrasada (prazo) contra o hoje de Brasilia
 *   RN-162.09 (B1039) a planilha: o instante do banco na hora de Brasilia
 *   T4 (integracao)   a movimentacao das 22h30 entra no mesmo dia pela lista das Movimentacoes (161), pelo Historico e pela planilha
 *
 * DEPENDE DO RELOGIO E DO FUSO — e por isso fixa os dois (o molde da 161): o filho sobe com TZ=UTC e com o relogio do JavaScript
 * adiantado (tests/helpers/relogioAdiantado.js) para as 22h de Brasilia de daqui a dois dias. No filho, o hoje de Brasilia (HOJE), o dia
 * UTC do JavaScript (HOJE+1) e o `date('now')` do SQLite (HOJE-2 ou HOJE-1) sao tres dias diferentes a qualquer hora em que a suite rode.
 * A guarda abre os cenarios. A massa tem numeros DIFERENTES de cada lado de cada regua (a licao do r3 da 161).
 *
 * Plano: docs/superpowers/plans/2026-10-19-almoxarifado-etapa162-o-dia-de-brasilia-nos-relatorios-e-nas-reservas.md
 * Executar: cd server && node tests/api/diaLocalDosRelatoriosEReservas.api.test.js
 */
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

// ── o relogio do filho: as 22h de Brasilia (UTC-3) de daqui a dois dias ─────────────────────────────────────────────────
const MIN = 60000;
const hojeBrtReal = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const somaDias = (dia, n) => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
/** o instante UTC (ISO com Z) da hora `hh:mm` de Brasilia no `dia` */
const brt = (dia, hh, mm = 0) => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d, hh + 3, mm)).toISOString(); };
const HOJE = somaDias(hojeBrtReal, 2); // o "hoje" de Brasilia do filho
const ALVO = new Date(brt(HOJE, 22, 0)).getTime();
const DESLOCAMENTO = ALVO - Date.now();

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
const j = (m, u, body, tok = ctx.T) => cru(m, `/api${u}`, tok, body);
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e162seed@t.com', senha: 'E162seed!senha' };
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

// ── o arquivo, por fora ───────────────────────────────────────────────────────────────────
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

// insere por fora, preenchendo as colunas NOT NULL sem padrao que o teste nao deu
async function inserir(tabela, campos) {
  const cols = await all(`PRAGMA table_info(${tabela})`);
  assert.ok(cols.length, `a tabela ${tabela} nao existe`);
  const dados = { ...campos };
  for (const c of cols) {
    if (c.pk || !c.notnull || c.dflt_value !== null || c.name in dados) continue;
    dados[c.name] = /INT|REAL|NUM/i.test(c.type) ? 1 : 'x162';
  }
  const k = Object.keys(dados);
  return (await run(`INSERT INTO ${tabela} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`, Object.values(dados))).lastID;
}

const XLSX = require('xlsx');

/** o instante UTC no formato do banco (`CURRENT_TIMESTAMP`) da hora `hh:mm` de Brasilia no `dia` */
const gravado = (dia, hh, mm = 0) => brt(dia, hh, mm).slice(0, 19).replace('T', ' ');
// os dias fixos dos relatorios (longe do hoje real — a licao da 161: data fixa que coincide com o hoje real contamina a regua)
const D = '2025-03-19';
const D1 = '2025-03-20';
const AS2230 = gravado(D, 22, 30); //  '2025-03-20 01:30:00' — 19/03 22:30 em Brasilia
const AS0130 = gravado(D1, 1, 30); //  '2025-03-20 04:30:00' — 20/03 01:30, o MESMO dia UTC do das 22h30
const soma = (linhas, campo, filtro = () => true) => (Array.isArray(linhas)
  ? linhas.filter(filtro).reduce((s, l) => s + Number(l[campo] || 0), 0) : `nao e lista: ${JSON.stringify(linhas)}`);
async function rel(tipo, o) {
  const [s, r] = await j('GET', `/almoxarifado/relatorios/${tipo}?${q(o)}`);
  assert.strictEqual(s, 200, `${tipo}: ${s} ${JSON.stringify(r)}`);
  return r;
}

// ── o utilitario novo, direto ─────────────────────────────────────────────────────────────────────────────────────────────
test('[RN-162.09] diaLocal.instanteDoBancoNoFuso: o formato do banco na hora de Brasilia; o resto como esta', () => {
  assert.strictEqual(diaLocal.instanteDoBancoNoFuso('2025-03-20 01:30:00'), '2025-03-19 22:30:00');
  assert.strictEqual(diaLocal.instanteDoBancoNoFuso('2025-03-20 03:00:00'), '2025-03-20 00:00:00');
  assert.strictEqual(diaLocal.instanteDoBancoNoFuso('2025-03-19'), '2025-03-19', 'so data fica');
  assert.strictEqual(diaLocal.instanteDoBancoNoFuso('2025-03-20T01:30:00.000Z'), '2025-03-20T01:30:00.000Z', 'ISO fica');
  assert.strictEqual(diaLocal.instanteDoBancoNoFuso(7), 7);
  assert.strictEqual(diaLocal.instanteDoBancoNoFuso(null), null);
  assert.strictEqual(diaLocal.instanteDoBancoNoFuso('texto 2025-03-20 01:30:00'), 'texto 2025-03-20 01:30:00');
  // Fase 5 r1/r2: a data impossivel e o ano antigo voltam como estao (antes, 2025-02-30 virava 2025-03-02 07:00:00)
  assert.strictEqual(diaLocal.instanteDoBancoNoFuso('2025-02-30 10:00:00'), '2025-02-30 10:00:00');
  assert.strictEqual(diaLocal.instanteDoBancoNoFuso('2025-03-20 24:00:00'), '2025-03-20 24:00:00');
  assert.strictEqual(diaLocal.instanteDoBancoNoFuso('0000-01-01 00:00:00'), '0000-01-01 00:00:00');
  // Fase 5 r3 (D1): a leitura como UTC (o `Z`) so e provada num processo FORA de UTC — o filho sobe em TZ=UTC, onde ler o texto como hora
  // local da o mesmo. Este processo e o da maquina (UTC-3); em UTC o teste derruba em vez de passar vazio.
  assert.ok(new Date(2025, 2, 20).getTimezoneOffset() > 0, 'este processo esta em UTC (ou a leste): o cenario do Z nao prova nada aqui');
  assert.strictEqual(new Date('2025-03-20T01:30:00').getHours(), 1, 'a metade positiva: sem o Z, o texto e lido como hora local');
});

// ── a guarda do relogio ─────────────────────────────────────────────────────────────────────────────────────────────────
test('[guarda] o filho esta nas 22h de Brasilia de daqui a dois dias, e o SQLite nao (senao os cenarios do hoje nao provam nada)', async () => {
  const [{ agora }] = await all("SELECT date('now') AS agora");
  assert.notStrictEqual(agora, HOJE, 'o date(now) do SQLite e o hoje do filho coincidem');
  assert.notStrictEqual(agora, somaDias(HOJE, 1), 'o dia UTC do filho coincide com o do SQLite');
  // a metade positiva: o filho le o relogio adiantado (o padrao do relatorio da producao e o hoje dele — a regua da 161)
  const [s, r] = await j('GET', '/producao/relatorios/producao');
  assert.strictEqual(s, 200, JSON.stringify(r));
  assert.strictEqual(r.periodo.data_fim, HOJE, `o filho nao esta no hoje adiantado: ${JSON.stringify(r.periodo)}`);
});

// ── RN-162.01: os relatorios ─────────────────────────────────────────────────────────────────────────────────────────────
test('[RN-162.01, C401] consumo-os, consumo-periodo e materiais-mais-consumidos: o das 22h30 (3) entra no dia 19, o das 01h30 do 20 (5) nao', async () => {
  const mat = await inserir('materiais_almoxarifado', { codigo: 'MAT-162-CONS', nome: 'consumo 162', custo_unitario: 2 });
  await inserir('movimentacoes_almoxarifado', { material_id: mat, tipo: 'SAIDA', quantidade: 3, os_id: 916201, projeto_id: 916202, cancelado: 0, created_at: AS2230 });
  await inserir('movimentacoes_almoxarifado', { material_id: mat, tipo: 'SAIDA', quantidade: 5, os_id: 916201, projeto_id: 916202, cancelado: 0, created_at: AS0130 });
  for (const [dia, esperado] of [[D, 3], [D1, 5]]) {
    const p = { data_inicio: dia, data_fim: dia };
    assert.strictEqual(soma(await rel('consumo-os', { os_id: 916201, ...p }), 'total_consumido'), esperado, `consumo-os ${dia}`);
    assert.strictEqual(soma(await rel('consumo-periodo', { projeto_id: 916202, ...p }), 'total'), esperado, `consumo-periodo ${dia}`);
    assert.strictEqual(soma(await rel('materiais-mais-consumidos', p), 'total_consumido', (l) => l.material_id === mat), esperado,
      `materiais-mais-consumidos ${dia}`);
  }
});

test('[RN-162.01, C401, T4] historico-movimentacoes e movimentacoes-periodo: o das 22h30 no dia 19 — o mesmo dia da lista das Movimentacoes', async () => {
  const mat = await inserir('materiais_almoxarifado', { codigo: 'MAT-162-HIST', nome: 'historico 162' });
  const a = await inserir('movimentacoes_almoxarifado', { material_id: mat, tipo: 'ENTRADA', quantidade: 3, cancelado: 0, created_at: AS2230 });
  const b = await inserir('movimentacoes_almoxarifado', { material_id: mat, tipo: 'ENTRADA', quantidade: 5, cancelado: 0, created_at: AS0130 });
  for (const [dia, esperado] of [[D, [a]], [D1, [b]]]) {
    const hist = await rel('historico-movimentacoes', { material_id: mat, data_inicio: dia, data_fim: dia });
    mesmos(ids(hist), esperado, `historico ${dia}`);
    const [sp, per] = await j('GET', `/almoxarifado/relatorio/movimentacoes-periodo?${q({ data_inicio: dia, data_fim: dia })}`);
    assert.strictEqual(sp, 200, JSON.stringify(per));
    mesmos(ids(per).filter((id) => id === a || id === b), esperado, `movimentacoes-periodo ${dia}`);
    // T4: a lista das Movimentacoes (161) poe o mesmo ato no mesmo dia
    const [sl, lista] = await j('GET', `/almoxarifado/movimentacoes?${q({ material_id: mat, data_inicio: dia, data_fim: dia })}`);
    assert.strictEqual(sl, 200, JSON.stringify(lista));
    mesmos(ids(lista), esperado, `lista das Movimentacoes ${dia}`);
  }
});

test('[RN-162.01, C401] ajustes-por-motivo, perdas-por-motivo e custo-por-projeto: 1 lancamento no dia 19, 2 no dia 20 (ajustes, lancamentos, movimentacoes)', async () => {
  const mat = await inserir('materiais_almoxarifado', { codigo: 'MAT-162-AJ', nome: 'ajustes 162', custo_unitario: 10 });
  for (const [tipo, extra] of [['AJUSTE_ENTRADA', {}], ['PERDA', {}], ['SAIDA', { projeto_id: 916203 }]]) {
    await inserir('movimentacoes_almoxarifado', { material_id: mat, tipo, quantidade: 1, cancelado: 0, created_at: AS2230, ...extra });
    await inserir('movimentacoes_almoxarifado', { material_id: mat, tipo, quantidade: 1, cancelado: 0, created_at: AS0130, ...extra });
    await inserir('movimentacoes_almoxarifado', { material_id: mat, tipo, quantidade: 1, cancelado: 0, created_at: gravado(D1, 23, 0), ...extra });
  }
  for (const [dia, esperado] of [[D, 1], [D1, 2]]) {
    const p = { data_inicio: dia, data_fim: dia };
    assert.strictEqual(soma(await rel('ajustes-por-motivo', { material_id: mat, ...p }), 'ajustes'), esperado, `ajustes ${dia}`);
    assert.strictEqual(soma(await rel('perdas-por-motivo', { material_id: mat, ...p }), 'lancamentos'), esperado, `perdas ${dia}`);
    assert.strictEqual(soma(await rel('custo-por-projeto', p), 'movimentacoes', (l) => l.projeto_id === 916203), esperado, `custo-por-projeto ${dia}`);
  }
});

test('[RN-162.01, C401, Fase 2 M8] sucata-financeiro ?de&ate: as DUAS colunas — a movimentacao SUCATA e a venda — pelo dia de Brasilia', async () => {
  const mat = await inserir('materiais_almoxarifado', { codigo: 'MAT-162-SUC', nome: 'sucata 162', custo_unitario: 1 });
  const mA = await inserir('movimentacoes_almoxarifado', { material_id: mat, tipo: 'SUCATA', quantidade: 3, cancelado: 0, created_at: AS2230 });
  const mB = await inserir('movimentacoes_almoxarifado', { material_id: mat, tipo: 'SUCATA', quantidade: 5, cancelado: 0, created_at: AS0130 });
  const vA = await inserir('sucateamentos_almoxarifado', { material_id: mat, quantidade: 3, status: 'VENDIDA', valor_venda: 30, destino_registrado_em: AS2230 });
  const vB = await inserir('sucateamentos_almoxarifado', { material_id: mat, quantidade: 5, status: 'VENDIDA', valor_venda: 50, destino_registrado_em: AS0130 });
  for (const [dia, movs, vendas] of [[D, [mA], [vA]], [D1, [mB], [vB]]]) {
    const r = await rel('sucata-financeiro', { de: dia, ate: dia });
    mesmos(ids(r.movimentacoes).filter((id) => id === mA || id === mB), movs, `movimentacoes da sucata ${dia}`);
    mesmos(ids(r.vendas).filter((id) => id === vA || id === vB), vendas, `vendas da sucata ${dia}`);
  }
});

test('[RN-162.01, C401] qualidade-fornecedores: o recebimento das 22h30 entra no dia 19 (1), os das 01h30 e 23h do 20 no dia 20 (2)', async () => {
  const mat = await inserir('materiais_almoxarifado', { codigo: 'MAT-162-QF', nome: 'qualidade 162' });
  let nrec = 0;
  const receb = async (data_recebimento) => {
    nrec += 1;
    const r = await inserir('recebimentos_material_almoxarifado', { numero: `REC-162-${nrec}`, fornecedor_nome: 'FORNECEDOR 162', data_recebimento });
    await inserir('recebimentos_material_itens_almoxarifado', { recebimento_id: r, material_id: mat, quantidade_esperada: 1, quantidade_recebida: 1 });
    return r;
  };
  await receb(AS2230); await receb(AS0130); await receb(gravado(D1, 23, 0));
  for (const [dia, esperado] of [[D, 1], [D1, 2]]) {
    const l = await rel('qualidade-fornecedores', { data_inicio: dia, data_fim: dia });
    assert.strictEqual(soma(l, 'recebimentos', (x) => x.fornecedor === 'FORNECEDOR 162'), esperado, `qualidade ${dia}: ${JSON.stringify(l)}`);
  }
});

// ── RN-162.03 e RN-162.09: a planilha ────────────────────────────────────────────────────────────────────────────────────
test('[RN-162.03, RN-162.09, B1039, T4] export do historico: o nome com o hoje de Brasilia e a coluna Data na hora de Brasilia', async () => {
  const mat = await inserir('materiais_almoxarifado', { codigo: 'MAT-162-XLS', nome: 'planilha 162' });
  await inserir('movimentacoes_almoxarifado', { material_id: mat, tipo: 'ENTRADA', quantidade: 3, cancelado: 0, created_at: AS2230 });
  const r = await fetch(`http://127.0.0.1:${porta}/api/almoxarifado/relatorios/historico-movimentacoes/export?${q({ material_id: mat, data_inicio: D, data_fim: D })}`,
    { headers: { Authorization: 'Bearer ' + ctx.T }, signal: AbortSignal.timeout(30000) });
  const buf = Buffer.from(await r.arrayBuffer());
  assert.strictEqual(r.status, 200, buf.toString('utf8').slice(0, 300));
  assert.strictEqual(r.headers.get('content-disposition'), `attachment; filename="historico-movimentacoes-${HOJE}.xlsx"`);
  const livro = XLSX.read(buf, { type: 'buffer' });
  const linhas = XLSX.utils.sheet_to_json(livro.Sheets[livro.SheetNames[0]]);
  assert.strictEqual(linhas.length, 1, JSON.stringify(linhas));
  assert.strictEqual(linhas[0].Data, '2025-03-19 22:30:00', `a coluna Data: ${JSON.stringify(linhas[0])}`);
  assert.strictEqual(Number(linhas[0].Quantidade ?? linhas[0]['Quantidade']), 3, `a linha certa: ${JSON.stringify(linhas[0])}`);
});

// ── RN-162.02: o painel ───────────────────────────────────────────────────────────────────────────────────────────────────
test('[RN-162.02, C401] painel: movimentacoesHoje = as do hoje de Brasilia (3, o dia UTC teria 2); o grafico pelo dia de Brasilia, com a borda dos 7 dias', async () => {
  const mat = await inserir('materiais_almoxarifado', { codigo: 'MAT-162-PAINEL', nome: 'painel 162' });
  const mov = (created_at) => inserir('movimentacoes_almoxarifado', { material_id: mat, tipo: 'ENTRADA', quantidade: 1, cancelado: 0, created_at });
  await mov(gravado(HOJE, 21, 30)); //            hoje 21h30 — o dia UTC ja e amanha
  await mov(gravado(HOJE, 22, 0)); //             hoje 22h — idem (Fase 5 r3 S1: Brasilia 3 x dia UTC 2, os numeros nao colidem)
  await mov(gravado(HOJE, 0, 30)); //             hoje 00h30 — o dia UTC ainda e hoje
  await mov(gravado(somaDias(HOJE, -1), 23, 0)); //  ontem 23h — o dia UTC e hoje
  await mov(gravado(somaDias(HOJE, -7), 0, 30)); //  ha 7 dias, 00h30 — dentro
  await mov(gravado(somaDias(HOJE, -8), 23, 0)); //  ha 8 dias, 23h — fora (o dia UTC e o de ha 7)
  const [s, p] = await j('GET', '/almoxarifado/dashboard');
  assert.strictEqual(s, 200, JSON.stringify(p));
  assert.strictEqual(p.movimentacoesHoje, 3, `movimentacoesHoje: ${p.movimentacoesHoje}`);
  const g = p.graficoMovimentacoes;
  assert.ok(Array.isArray(g), JSON.stringify(g));
  const doDia = (dia) => soma(g, 'total', (x) => x.dia === dia);
  assert.strictEqual(doDia(HOJE), 3, `hoje: ${JSON.stringify(g)}`);
  assert.strictEqual(doDia(somaDias(HOJE, -1)), 1, `ontem: ${JSON.stringify(g)}`);
  assert.strictEqual(doDia(somaDias(HOJE, -7)), 1, `ha 7 dias: ${JSON.stringify(g)}`);
  assert.strictEqual(doDia(somaDias(HOJE, -8)), 0, `ha 8 dias fica fora: ${JSON.stringify(g)}`);
  assert.strictEqual(doDia(somaDias(HOJE, 1)), 0, `nenhum dia de amanha: ${JSON.stringify(g)}`);
});

// ── RN-162.04: os indicadores ─────────────────────────────────────────────────────────────────────────────────────────────
test('[RN-162.04, B1037] indicadores: a entrega as 22h do dia do prazo e no prazo; o prazo de hoje sem entrega fica em aberto no dia', async () => {
  const ler = async (qs = '') => {
    const [s, r] = await j('GET', `/almoxarifado/relatorios/indicadores${qs}`);
    assert.strictEqual(s, 200, JSON.stringify(r));
    return r.requisicoes_no_prazo;
  };
  const antes = await ler();
  const antes5 = await ler('?janela_dias=5');
  const req = (numero, status, data_necessidade, data_entrega) => inserir('requisicoes_almoxarifado',
    { numero, status, ativo: 1, data_necessidade, ...(data_entrega ? { data_entrega } : {}) });
  const prazo = somaDias(HOJE, -3);
  await req('REQ-162-NP', 'ENTREGUE', prazo, gravado(prazo, 22, 0)); // gravada no dia UTC seguinte ao prazo: no prazo
  await req('REQ-162-AB', 'APROVADO', HOJE); //                       prazo hoje sem entrega: em aberto no dia
  // Fase 5 r3 S2 (o teto da janela): o prazo HOJE entregue hoje as 21h30 (dia UTC = amanha) entra; o prazo AMANHA nao entra, entregue ou nao
  await req('REQ-162-HH', 'ENTREGUE', HOJE, gravado(HOJE, 21, 30));
  await req('REQ-162-AM', 'APROVADO', somaDias(HOJE, 1));
  await req('REQ-162-AE', 'ENTREGUE', somaDias(HOJE, 1), gravado(HOJE, 10, 0));
  // Fase 5 r3 S3 (o piso da janela, com janela_dias=5): o prazo HOJE-5 entra, o HOJE-6 nao
  await req('REQ-162-P5', 'ENTREGUE', somaDias(HOJE, -5), gravado(somaDias(HOJE, -5), 10, 0));
  await req('REQ-162-P6', 'ENTREGUE', somaDias(HOJE, -6), gravado(somaDias(HOJE, -6), 10, 0));
  const depois = await ler();
  const depois5 = await ler('?janela_dias=5');
  const d = (campo, a = antes, b = depois) => b[campo] - a[campo];
  const ctxt = JSON.stringify({ antes, depois, antes5, depois5 });
  // janela padrao: NP, HH, P5 e P6 no prazo; AB em aberto no dia; AM e AE fora (prazo amanha)
  assert.strictEqual(d('no_prazo'), 4, `no_prazo: ${ctxt}`);
  assert.strictEqual(d('consideradas'), 4, `consideradas (o de hoje sem entrega e os de amanha nao entram): ${ctxt}`);
  assert.strictEqual(d('em_aberto_no_dia'), 1, `em_aberto_no_dia (o de amanha nao): ${ctxt}`);
  // janela de 5 dias: NP, HH e P5; o P6 fica fora do piso
  assert.strictEqual(d('no_prazo', antes5, depois5), 3, `no_prazo, janela 5: ${ctxt}`);
  assert.strictEqual(d('consideradas', antes5, depois5), 3, `consideradas, janela 5: ${ctxt}`);
});

// ── RN-162.07: os alertas ─────────────────────────────────────────────────────────────────────────────────────────────────
test('[RN-162.07, C404, B1037] alertas: a reserva que vence hoje e a requisicao de prazo hoje ficam fora; as de ontem entram', async () => {
  const mat = await inserir('materiais_almoxarifado', { codigo: 'MAT-162-AL', nome: 'alerta 162' });
  const resHoje = await inserir('reservas_material_almoxarifado', { material_id: mat, quantidade: 1, status: 'ATIVA', expira_em: HOJE });
  const resOntem = await inserir('reservas_material_almoxarifado', { material_id: mat, quantidade: 1, status: 'ATIVA', expira_em: somaDias(HOJE, -1) });
  const reqHoje = await inserir('requisicoes_almoxarifado', { numero: 'REQ-162-AH', status: 'APROVADO', ativo: 1, data_necessidade: HOJE });
  const reqOntem = await inserir('requisicoes_almoxarifado', { numero: 'REQ-162-AO', status: 'APROVADO', ativo: 1, data_necessidade: somaDias(HOJE, -1) });
  const [s, c] = await j('GET', '/almoxarifado/alertas/central');
  assert.strictEqual(s, 200, JSON.stringify(c));
  const ent = (chave) => {
    const e = c.alertas.find((a) => a.chave === chave);
    assert.ok(e && !e.erro, `${chave}: ${JSON.stringify(e)}`);
    return ids(e.linhas);
  };
  const reservas = ent('RESERVA_PARADA');
  assert.ok(reservas.includes(resOntem), `a reserva vencida ontem tem de aparecer: ${JSON.stringify(reservas)}`);
  assert.ok(!reservas.includes(resHoje), `a reserva que vence hoje nao: ${JSON.stringify(reservas)}`);
  const reqs = ent('REQUISICAO_ATRASADA');
  assert.ok(reqs.includes(reqOntem), `a requisicao de prazo ontem tem de aparecer: ${JSON.stringify(reqs)}`);
  assert.ok(!reqs.includes(reqHoje), `a de prazo hoje nao: ${JSON.stringify(reqs)}`);
  ctx.alertas = { resHoje, resOntem };
});

// ── RN-162.05: a expiracao ────────────────────────────────────────────────────────────────────────────────────────────────
test('[RN-162.05, C404, B1035, T4] processar-expiracao: a que vence hoje fica ATIVA, a de ontem expira e devolve o reservado; a referencia continua valendo', async () => {
  const mat = await inserir('materiais_almoxarifado', { codigo: 'MAT-162-EXP', nome: 'expiracao 162', quantidade_atual: 10, quantidade_reservada: 4 });
  const rHoje = await inserir('reservas_material_almoxarifado', { material_id: mat, quantidade: 2, quantidade_utilizada: 0, status: 'ATIVA', expira_em: HOJE });
  const rOntem = await inserir('reservas_material_almoxarifado', { material_id: mat, quantidade: 2, quantidade_utilizada: 0, status: 'ATIVA', expira_em: somaDias(HOJE, -1) });
  const status = async (id) => (await all('SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [id]))[0].status;
  const reservado = async () => Number((await all('SELECT quantidade_reservada AS q FROM materiais_almoxarifado WHERE id = ?', [mat]))[0].q);
  // Fase 5 r3 S4: `referencia: ''` continua sendo "hoje" (o `||` de proposito — com `??` nada expiraria)
  const [s, r] = await j('POST', '/almoxarifado/reservas/processar-expiracao', { referencia: '' });
  assert.strictEqual(s, 200, JSON.stringify(r));
  assert.strictEqual(await status(rOntem), 'EXPIRADA', 'a vencida ontem expira (referencia vazia = hoje)');
  assert.strictEqual(await status(rHoje), 'ATIVA', 'a que vence hoje continua ativa ate a meia-noite de Brasilia');
  assert.strictEqual(await reservado(), 2, 'o reservado da expirada voltou ao livre');
  // a do alerta tambem (a mesma regua nas duas portas)
  assert.strictEqual(await status(ctx.alertas.resOntem), 'EXPIRADA');
  assert.strictEqual(await status(ctx.alertas.resHoje), 'ATIVA');
  // o corpo vazio (o botao da tela) tambem e "hoje"
  const rOntem2 = await inserir('reservas_material_almoxarifado', { material_id: mat, quantidade: 1, quantidade_utilizada: 0, status: 'ATIVA', expira_em: somaDias(HOJE, -1) });
  await run('UPDATE materiais_almoxarifado SET quantidade_reservada = quantidade_reservada + 1 WHERE id = ?', [mat]);
  const [s1, r1] = await j('POST', '/almoxarifado/reservas/processar-expiracao', {});
  assert.strictEqual(s1, 200, JSON.stringify(r1));
  assert.strictEqual(await status(rOntem2), 'EXPIRADA', 'corpo vazio: a vencida ontem expira');
  assert.strictEqual(await status(rHoje), 'ATIVA', 'corpo vazio: a de hoje fica');
  assert.strictEqual(await reservado(), 2);
  // o `referencia` (reprocessamento) manda: com amanha, a de hoje expira
  const [s2, r2] = await j('POST', '/almoxarifado/reservas/processar-expiracao', { referencia: somaDias(HOJE, 1) });
  assert.strictEqual(s2, 200, JSON.stringify(r2));
  assert.strictEqual(await status(rHoje), 'EXPIRADA', 'com a referencia de amanha, a de hoje expira');
  assert.strictEqual(await reservado(), 0);
});

// ── RN-162.06: o vencimento padrao ────────────────────────────────────────────────────────────────────────────────────────
test('[RN-162.06, C404, B1035] a reserva sem vencimento, com reserva_dias_validade = 1, vence amanha de Brasilia (nao depois de amanha)', async () => {
  const mat = await inserir('materiais_almoxarifado', { codigo: 'MAT-162-PAD', nome: 'padrao 162', quantidade_atual: 50, quantidade_reservada: 0 });
  await run("INSERT OR REPLACE INTO configuracoes_almoxarifado (chave, valor) VALUES ('reserva_dias_validade', '1')");
  try {
    const [s, r] = await j('POST', '/almoxarifado/reservas', { material_id: mat, quantidade: 1, os_referencia: 'OS-162' });
    assert.strictEqual(s, 201, JSON.stringify(r));
    const [linha] = await all('SELECT expira_em FROM reservas_material_almoxarifado WHERE material_id = ?', [mat]);
    assert.ok(linha, 'a reserva nasceu');
    assert.strictEqual(linha.expira_em, somaDias(HOJE, 1), `expira_em: ${linha.expira_em}`);
  } finally {
    await run("DELETE FROM configuracoes_almoxarifado WHERE chave = 'reserva_dias_validade'");
  }
});

(async () => {
  console.log('\n=== Etapa 162: o dia de Brasilia nos relatorios, no painel, nos indicadores, nos alertas e nas reservas ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e162-dl-'));
    ctx.T = await subir();
    abrirCru();
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
