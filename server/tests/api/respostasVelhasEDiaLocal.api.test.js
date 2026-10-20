/**
 * Etapa 161 (Fabrica e Almoxarifado) — o dia de Brasilia nas consultas (C397) e as sobras tecnicas da C399/C400, pelo `index.js` de
 * verdade (pasta vazia).
 *
 *   RN-161.04 (C397)  producao: apontamentos/paradas ?data_inicio/?data_fim, os tres relatorios (porDia, padroes), o painel (hoje,
 *                     atrasadas, concluidas no mes); colaboradores: presente_hoje e status_trabalho — o dia de Brasilia
 *   RN-161.06 (C397)  GET /almoxarifado/movimentacoes ?data_inicio/?data_fim pelo dia de Brasilia do created_at
 *   RN-161.08 (C399)  GET /almoxarifado/notificacoes/eventos (novo): as chaves do registro, com o portao da lista
 *   RN-161.09 (C399)  GET /almoxarifado/recebimentos-aux/fornecedores?search= procura (aparado, sem caixa, % e _ como texto)
 *   RN-161.10 (C400)  GET /almoxarifado/auditoria/opcoes: um usuario por id, o nome da linha mais recente
 *   T6 (integracao)   o ato das 22h30 de 19/10: entra no dia 19 pela rota das movimentacoes, pela lista de apontamentos e pelo porDia
 *
 * DEPENDE DO RELOGIO E DO FUSO — e por isso fixa os dois: o filho sobe com TZ=UTC (a regua nao pode depender do TZ do processo) e
 * com o relogio do JavaScript adiantado (tests/helpers/relogioAdiantado.js) para as 22h de Brasilia de daqui a dois dias: o hoje
 * local (JS), o dia UTC do JS e o `date('now')` do SQLite sao tres dias diferentes a qualquer hora em que a suite rode (Fase 2 I2).
 * O cenario abre com a guarda que derruba se o adiantamento nao pegou.
 *
 * Molde: filtrosDaFabricaEAlmoxarifado.api.test.js. Plano:
 * docs/superpowers/plans/2025-03-19-almoxarifado-etapa161-respostas-velhas-e-o-dia-local.md
 * Executar: cd server && node tests/api/respostasVelhasEDiaLocal.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const { ALERT_REGISTRY } = require('../../services/almoxarifado/alertRegistry');
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
const SEED = { email: 'e161seed@t.com', senha: 'E161seed!senha' };
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
    dados[c.name] = /INT|REAL|NUM/i.test(c.type) ? 1 : 'x161';
  }
  const k = Object.keys(dados);
  return (await run(`INSERT INTO ${tabela} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`, Object.values(dados))).lastID;
}

// ── o utilitario, direto (Fase 5 r3 S13: a virada do mes so aparece as 22h do ultimo dia — aqui com o instante fixo) ───────────
test('[RN-161.04, Fase 5 r3 S13] diaLocal: o hoje, o inicio do mes e o modificador de Brasilia nas viradas (o ultimo dia do mes as 22h)', () => {
  const as22do31 = new Date('2026-11-01T01:00:00Z'); // 31/10 22:00 em Brasilia
  assert.strictEqual(diaLocal.hojeLocalISO(as22do31), '2026-10-31');
  assert.strictEqual(diaLocal.inicioDoMesLocalISO(as22do31), '2026-10-01');
  assert.strictEqual(diaLocal.inicioDoMesLocalISO(new Date('2026-11-01T03:00:00Z')), '2026-11-01'); // 01/11 00:00
  assert.strictEqual(diaLocal.hojeLocalISO(new Date('2026-10-20T02:59:59Z')), '2026-10-19');
  assert.strictEqual(diaLocal.hojeLocalISO(new Date('2026-10-20T03:00:00Z')), '2026-10-20');
  assert.strictEqual(diaLocal.modificadorDoFuso(as22do31), '-180 minutes');
  // o de Compras delega (a mesma resposta)
  assert.strictEqual(require('../../services/compras/pedidoCompraService').hojeLocalISO(as22do31), '2026-10-31');
});

// ── a guarda do relogio ─────────────────────────────────────────────────────────────────────────────────────────────────
test('[guarda] o filho esta adiantado para as 22h de Brasilia de daqui a dois dias, e o SQLite nao (senao os cenarios do hoje nao provam nada)', async () => {
  const [[{ agora }]] = [await all("SELECT date('now') AS agora")];
  assert.notStrictEqual(agora, HOJE, 'o date(now) do SQLite e o hoje do filho coincidem');
  assert.notStrictEqual(somaDias(HOJE, 1), agora, 'o dia UTC do filho coincide com o do SQLite');
  // a metade positiva: o filho le o relogio adiantado (o padrao do relatorio e o hoje dele)
  const [s, r] = await j('GET', '/producao/relatorios/producao');
  assert.strictEqual(s, 200, JSON.stringify(r));
  assert.strictEqual(r.periodo.data_fim, HOJE, `o filho nao esta no hoje adiantado: ${JSON.stringify(r.periodo)}`);
});

// ── RN-161.06 e T6: as movimentacoes ────────────────────────────────────────────────────────────────────────────────────
test('[RN-161.06, C397, T6] GET /almoxarifado/movimentacoes?data_inicio&data_fim: o dia de Brasilia do created_at (o das 22h30 entra no 19, o das 23h do 18 nao)', async () => {
  const mat = await inserir('materiais_almoxarifado', { codigo: 'MAT-161-DIA', nome: 'material do dia 161' });
  const mov = (created_at) => inserir('movimentacoes_almoxarifado', { material_id: mat, tipo: 'ENTRADA', quantidade: 1, created_at });
  const as2230 = await mov('2025-03-20 01:30:00'); // 19/03 22:30 em Brasilia
  const as0900 = await mov('2025-03-19 12:00:00'); // 19/03 09:00
  const do18 = await mov('2025-03-19 02:00:00'); //    18/03 23:00 — o dia UTC 19, o de Brasilia 18
  const do20 = await mov('2025-03-20 03:30:00'); //    20/03 00:30 — mesmo dia UTC do das 22h30
  const cen = [as2230, as0900, do18, do20];
  const pede = async (o) => {
    const [s, l] = await j('GET', `/almoxarifado/movimentacoes?${q({ material_id: mat, ...o })}`);
    assert.strictEqual(s, 200, JSON.stringify(l));
    return ids(l).filter((id) => cen.includes(id));
  };
  mesmos(await pede({ data_inicio: '2025-03-19', data_fim: '2025-03-19' }), [as2230, as0900], 'o dia 19');
  mesmos(await pede({ data_inicio: '2025-03-18', data_fim: '2025-03-18' }), [do18], 'o dia 18');
  mesmos(await pede({ data_inicio: '2025-03-20' }), [do20], 'do dia 20 em diante');
  mesmos(await pede({ data_fim: '2025-03-18' }), [do18], 'ate o dia 18');
  mesmos(await pede({}), cen, 'sem filtro de data');
  // T6: o mesmo created_at, lido pela regra da tela (lerInstanteDoBanco: sem T/Z -> UTC), e 19/03 22:30 em Brasilia
  const [linha] = await all('SELECT created_at FROM movimentacoes_almoxarifado WHERE id = ?', [as2230]);
  const naTela = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
    .format(new Date(`${linha.created_at.replace(' ', 'T')}Z`));
  assert.strictEqual(naTela, '19/03/2025, 22:30');
});

// ── RN-161.04 e T6: apontamentos, paradas e os relatorios da producao ───────────────────────────────────────────────────
test('[RN-161.04, C397, T6] apontamentos e paradas ?data_inicio/?data_fim e os relatorios (porDia, paradas, eficiencia) pelo dia de Brasilia', async () => {
  const maq = await inserir('producao_maquinas', { codigo: 'MQ-161', nome: 'maquina 161' });
  const op = await inserir('producao_ops', { numero_op: 'OP-161-DIA', produto_descricao: 'produto 161', quantidade_planejada: 10,
    quantidade_produzida: 5, status: 'em_producao', ativo: 1, data_inicio: '2025-03-20T01:30:00.000Z', created_at: '2025-03-20 01:30:00' });
  const opDo18 = await inserir('producao_ops', { numero_op: 'OP-161-18', produto_descricao: 'produto 161 b', quantidade_planejada: 10,
    quantidade_produzida: 5, status: 'em_producao', ativo: 1, data_inicio: '2025-03-19T02:00:00.000Z', created_at: '2025-03-19 02:00:00' });
  const ap = (data_inicio, qtd) => inserir('producao_apontamentos', { op_id: op, maquina_id: maq, data_inicio, quantidade_produzida: qtd, quantidade_refugo: 0 });
  const a2230 = await ap('2025-03-20T01:30:00.000Z', 7); // 19/03 22:30
  const a0900 = await ap('2025-03-19T12:00:00.000Z', 3); // 19/03 09:00
  const a18 = await ap('2025-03-19T02:00:00.000Z', 100); //   18/03 23:00
  const pa = (data_inicio, motivo_texto, duracao_minutos) => inserir('producao_paradas', { maquina_id: maq, data_inicio, motivo_texto, duracao_minutos });
  const p2230 = await pa('2025-03-20T01:30:00.000Z', 'motivo 161 noite', 10);
  const p18 = await pa('2025-03-19T02:00:00.000Z', 'motivo 161 do 18', 20);
  const dia19 = q({ data_inicio: '2025-03-19', data_fim: '2025-03-19' });

  const [sa, la] = await j('GET', `/producao/apontamentos?${dia19}`);
  assert.strictEqual(sa, 200, JSON.stringify(la));
  mesmos(ids(la).filter((id) => [a2230, a0900, a18].includes(id)), [a2230, a0900], 'apontamentos do dia 19');
  const [, la18] = await j('GET', `/producao/apontamentos?${q({ data_inicio: '2025-03-18', data_fim: '2025-03-18' })}`);
  mesmos(ids(la18).filter((id) => [a2230, a0900, a18].includes(id)), [a18], 'apontamentos do dia 18');
  const [sp, lp] = await j('GET', `/producao/paradas?${dia19}`);
  assert.strictEqual(sp, 200, JSON.stringify(lp));
  mesmos(ids(lp).filter((id) => [p2230, p18].includes(id)), [p2230], 'paradas do dia 19');

  const [sr, rp] = await j('GET', `/producao/relatorios/producao?${q({ data_inicio: '2025-03-18', data_fim: '2025-03-19' })}`);
  assert.strictEqual(sr, 200, JSON.stringify(rp));
  assert.deepStrictEqual(rp.porDia.map((d) => [d.dia, d.produzido, d.apontamentos]), [['2025-03-18', 100, 1], ['2025-03-19', 10, 2]], 'porDia');
  const [, rp19] = await j('GET', `/producao/relatorios/producao?${dia19}`);
  assert.deepStrictEqual(rp19.porOp.map((o) => o.numero_op).filter((n) => /OP-161/.test(n)), ['OP-161-DIA'], 'as OPs do dia 19');
  const [, rpa] = await j('GET', `/producao/relatorios/paradas?${dia19}`);
  assert.deepStrictEqual(rpa.porMotivo.filter((m) => /161/.test(m.motivo)).map((m) => [m.motivo, m.minutos]), [['motivo 161 noite', 10]], 'paradas por motivo');
  assert.deepStrictEqual(rpa.porMaquina.filter((m) => m.codigo === 'MQ-161').map((m) => [m.codigo, m.ocorrencias, m.minutos]), [['MQ-161', 1, 10]], 'paradas por maquina (Fase 5 r3 S10)');
  const [, ref] = await j('GET', `/producao/relatorios/eficiencia?${dia19}`);
  assert.deepStrictEqual(ref.ops.map((o) => o.numero_op).filter((n) => /OP-161/.test(n)), ['OP-161-DIA'], 'eficiencia do dia 19');
  const [, ref18] = await j('GET', `/producao/relatorios/eficiencia?${q({ data_inicio: '2025-03-18', data_fim: '2025-03-18' })}`);
  assert.deepStrictEqual(ref18.ops.map((o) => o.numero_op).filter((n) => /OP-161/.test(n)), ['OP-161-18'], 'eficiencia do dia 18');
});

test('[RN-161.04, C397] os padroes dos tres relatorios da producao: o dia 1 do mes e o hoje de Brasilia', async () => {
  for (const r of ['producao', 'eficiencia', 'paradas']) {
    const [s, x] = await j('GET', `/producao/relatorios/${r}`);
    assert.strictEqual(s, 200, JSON.stringify(x));
    assert.deepStrictEqual(x.periodo, { data_inicio: `${HOJE.slice(0, 7)}-01`, data_fim: HOJE }, r);
  }
});

test('[RN-161.04, C397] o painel da producao: paradas/producao de hoje, atrasadas e concluidas no mes pelo dia de Brasilia', async () => {
  const maq = await inserir('producao_maquinas', { codigo: 'MQ-161-PAINEL', nome: 'maquina do painel 161' }); // propria: nao depende do cenario anterior
  const opHoje = await inserir('producao_ops', { numero_op: 'OP-161-HOJE', produto_descricao: 'p', quantidade_planejada: 1, status: 'em_producao', ativo: 1 });
  const ap = (data_inicio, qtd, data_fim = null) => inserir('producao_apontamentos', { op_id: opHoje, maquina_id: maq, data_inicio, data_fim, quantidade_produzida: qtd, quantidade_refugo: 0 });
  await ap(brt(HOJE, 22, 30), 7, brt(HOJE, 23, 30)); // hoje 22:30 — o dia UTC de amanha (60 min de producao)
  await ap(brt(somaDias(HOJE, 1), 1, 0), 0, brt(somaDias(HOJE, 1), 2, 0)); // amanha 01:00, 60 min — nao entra no tempo de hoje
  await ap(brt(HOJE, 9, 0), 5); //                    hoje 09:00
  await ap(brt(somaDias(HOJE, 1), 1, 30), 1000); //   amanha 01:30 — o MESMO dia UTC do das 22:30
  await ap(brt(somaDias(HOJE, -1), 23, 0), 2000); //  ontem 23:00 — o dia UTC de hoje
  // Fase 5 r3 S05/S08: a massa distingue as duas reguas — no dia UTC de hoje caem as duas de ontem a noite (2 paradas, 6 min); no de
  // Brasilia, so a de hoje 22:30 (1 parada, 1 min). Com as tres de 1 min, as contagens coincidiam e a sabotagem passava.
  const pa = (data_inicio, duracao_minutos = 1) => inserir('producao_paradas', { maquina_id: maq, data_inicio, data_fim: data_inicio, motivo_texto: 'painel 161', duracao_minutos });
  await pa(brt(HOJE, 22, 30));
  await pa(brt(somaDias(HOJE, 1), 1, 30));
  await pa(brt(somaDias(HOJE, -1), 23, 0), 5);
  await pa(brt(somaDias(HOJE, -1), 22, 0));
  // atrasada: o prazo (so a data) de ontem; a do prazo de hoje nao
  await inserir('producao_ops', { numero_op: 'OP-161-ATR', produto_descricao: 'p', quantidade_planejada: 1, status: 'liberada', ativo: 1, data_prevista_fim: somaDias(HOJE, -1) });
  await inserir('producao_ops', { numero_op: 'OP-161-PRAZO-HOJE', produto_descricao: 'p', quantidade_planejada: 1, status: 'liberada', ativo: 1, data_prevista_fim: HOJE });
  // concluida no mes: o fim hoje as 22:30 (no ultimo dia do mes o dia UTC ja seria o mes seguinte)
  await inserir('producao_ops', { numero_op: 'OP-161-CONC', produto_descricao: 'p', quantidade_planejada: 1, status: 'concluida', ativo: 1, data_fim: brt(HOJE, 22, 30) });
  // e a do ultimo dia do mes ANTERIOR as 22:30: o mes UTC dela ja e o deste mes, o de Brasilia nao — nao conta
  const ultimoDoMesPassado = somaDias(`${HOJE.slice(0, 7)}-01`, -1);
  await inserir('producao_ops', { numero_op: 'OP-161-CONC-ANT', produto_descricao: 'p', quantidade_planejada: 1, status: 'concluida', ativo: 1, data_fim: brt(ultimoDoMesPassado, 22, 30) });
  const [s, d] = await j('GET', '/producao/dashboard?refresh=1');
  assert.strictEqual(s, 200, JSON.stringify(d));
  assert.strictEqual(d.kpis.producaoHoje, 12, 'producao de hoje (7 + 5; nem o 1000 de amanha nem o 2000 de ontem)');
  assert.strictEqual(d.kpis.paradasHoje, 1, 'paradas de hoje');
  assert.strictEqual(d.kpis.opsAtrasadas, 1, 'atrasadas: so a do prazo de ontem');
  assert.strictEqual(d.kpis.opsConcluidasMes, 1, 'concluidas no mes');
  // a disponibilidade de hoje: 60 min de producao e 1 min de parada (as duas consultas do tempo pelo dia de Brasilia)
  assert.strictEqual(d.kpis.disponibilidade, Math.round((60 / 61) * 1000) / 10, 'disponibilidade');
  // as paradas recentes: as abertas ou as de hoje — das tres do painel, so a das 22:30 de hoje
  assert.deepStrictEqual(d.paradasRecentes.filter((p) => p.motivo_texto === 'painel 161').map((p) => p.data_inicio), [brt(HOJE, 22, 30)], 'paradas recentes');
  // S02: a OP criada sem data planejada grava o hoje de Brasilia (o dia UTC do filho ja e amanha)
  const [so, op] = await j('POST', '/producao/ops', { produto_descricao: 'op sem data 161', quantidade_planejada: 1 });
  assert.ok(so === 200 || so === 201, `POST /producao/ops: ${so} ${JSON.stringify(op)}`);
  const [gravada] = await all("SELECT data_planejada FROM producao_ops WHERE produto_descricao = 'op sem data 161'");
  assert.strictEqual(gravada && gravada.data_planejada, HOJE, 'a data planejada padrao (Fase 5 r3 S02)');
});

test('[RN-161.04, C397] colaboradores: presente_hoje e status_trabalho pela presenca do hoje de Brasilia (a de ontem nao conta)', async () => {
  const hoje = await inserir('colaboradores', { nome: 'PRESENTE HOJE 161', status: 'ativo', disponivel: 1 });
  const ontem = await inserir('colaboradores', { nome: 'PRESENTE ONTEM 161', status: 'ativo', disponivel: 1 });
  await inserir('controle_presenca', { colaborador_id: hoje, data: HOJE, status: 'presente' });
  const [{ agora }] = await all("SELECT date('now') AS agora");
  await inserir('controle_presenca', { colaborador_id: ontem, data: agora, status: 'presente' }); // o dia do date('now') do SQLite (o antigo)
  const [s, l] = await j('GET', '/operacional/colaboradores?search=161');
  assert.strictEqual(s, 200, JSON.stringify(l));
  const por = Object.fromEntries(l.filter((c) => [hoje, ontem].includes(c.id)).map((c) => [c.id, [c.presente_hoje, c.status_trabalho]]));
  assert.deepStrictEqual(por, { [hoje]: [1, 'disponivel'], [ontem]: [0, 'ausente'] });
});

// ── RN-161.09: fornecedores ─────────────────────────────────────────────────────────────────────────────────────────────
test('[RN-161.09, C399] GET /recebimentos-aux/fornecedores?search=: procura alem dos 50 primeiros, aparado, sem caixa, % e _ como texto', async () => {
  for (let i = 0; i < 55; i++) await inserir('fornecedores', { razao_social: `AAA FORNECEDOR 161 ${String(i).padStart(2, '0')}`, status: 'ativo' });
  const zelia = await inserir('fornecedores', { razao_social: 'ZÉLIA FERRAGENS 161', nome_fantasia: 'Zélia', cnpj: '11.161.000/0001-61', status: 'ativo' });
  const porc = await inserir('fornecedores', { razao_social: 'ZZ 50% OFF 161', status: 'ativo' });
  const cinq = await inserir('fornecedores', { razao_social: 'ZZ 500 OFF 161', status: 'ativo' });
  const inativo = await inserir('fornecedores', { razao_social: 'ZÉLIA INATIVA 161', status: 'inativo' });
  const fantasia = await inserir('fornecedores', { razao_social: 'XPTO COMERCIAL 161', nome_fantasia: 'Ferrovia Única', status: 'ativo' });
  const busca = async (search) => {
    const [s, l] = await j('GET', `/almoxarifado/recebimentos-aux/fornecedores?${q(search === undefined ? {} : { search })}`);
    assert.strictEqual(s, 200, JSON.stringify(l));
    return l;
  };
  const sem = await busca();
  assert.strictEqual(sem.length, 50, 'sem busca: os 50 primeiros');
  assert.ok(!ids(sem).includes(zelia), 'a Zelia nao esta nos 50 primeiros (o cenario nao provaria a busca)');
  for (const t of ['zélia', 'ZÉLIA', '  Zélia  ', '11.161', 'ferragens']) mesmos(ids(await busca(t)), [zelia], `busca "${t}"`);
  mesmos(ids(await busca('ferrovia única')), [fantasia], 'so pelo nome fantasia (Fase 5 r3 S25)');
  mesmos(ids(await busca('50%')), [porc], 'o % e texto');
  mesmos(ids(await busca('5_0')), [], 'o _ e texto');
  assert.strictEqual((await busca('   ')).length, 50, 'so espacos = sem filtro');
  assert.ok(!ids(await busca('inativa')).includes(inativo), 'o inativo nao entra');
  assert.ok(ids(await busca('500')).includes(cinq), 'a metade positiva do %');
});

// ── RN-161.10: auditoria ────────────────────────────────────────────────────────────────────────────────────────────────
test('[RN-161.10, C400] GET /almoxarifado/auditoria/opcoes: o usuario renomeado e UMA opcao, com o nome da linha mais recente', async () => {
  const linha = (usuario_id, usuario_nome) => inserir('auditoria_log_almoxarifado', { entidade: 'material', entidade_id: 1, acao: 'EDITAR', usuario_id, usuario_nome });
  await linha(91611, 'NOME ANTIGO 161');
  await linha(91612, 'OUTRO 161');
  await linha(91611, 'NOME NOVO 161');
  const [s, o] = await j('GET', '/almoxarifado/auditoria/opcoes');
  assert.strictEqual(s, 200, JSON.stringify(o));
  const meus = o.usuarios.filter((u) => [91611, 91612].includes(u.id));
  assert.deepStrictEqual(meus, [{ id: 91611, nome: 'NOME NOVO 161' }, { id: 91612, nome: 'OUTRO 161' }]);
  const vistos = o.usuarios.map((u) => u.id);
  assert.strictEqual(new Set(vistos).size, vistos.length, 'id repetido nas opcoes');
});

// ── RN-161.08: eventos das notificacoes ─────────────────────────────────────────────────────────────────────────────────
test('[RN-161.08, C399] GET /almoxarifado/notificacoes/eventos: as chaves do registro na ordem dele; quem nao gerencia notificacoes toma 403', async () => {
  const [s, l] = await j('GET', '/almoxarifado/notificacoes/eventos');
  assert.strictEqual(s, 200, JSON.stringify(l));
  assert.deepStrictEqual(l, ALERT_REGISTRY.map((e) => ({ evento: e.chave, rotulo: e.titulo })));
  assert.ok(l.length >= 15 && l.some((e) => e.evento === 'NAO_CONFORMIDADE_ABERTA'), 'o registro inteiro');
  // a lista continua respondendo (a rota nova nao engoliu a da fila)
  const [sl, fila] = await j('GET', '/almoxarifado/notificacoes');
  assert.strictEqual(sl, 200, JSON.stringify(fila));
  assert.ok(Array.isArray(fila.itens), 'a lista da fila');
  // o portao: um usuario com o modulo e sem perfil (fallback PRODUCAO) nao gerencia notificacoes
  const email = 'e161prod@t.com';
  const [su, u] = await j('POST', '/usuarios', { nome: 'PRODUCAO 161', email, senha: 'Senha!161f', cargo: 'C', role: 'usuario', setor: '' });
  assert.ok(su === 200 || su === 201, `usuario: ${su} ${JSON.stringify(u)}`);
  const id = (await all('SELECT id FROM usuarios WHERE email = ?', [email]))[0].id;
  await run("INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, NULL, 'almoxarifado', 'acesso', 1)", [id]);
  const [sl2, login] = await cru('POST', '/api/auth/login', null, { email, senha: 'Senha!161f' });
  assert.strictEqual(sl2, 200, JSON.stringify(login));
  const [s403, r403] = await j('GET', '/almoxarifado/notificacoes/eventos', undefined, login.token);
  assert.strictEqual(s403, 403, JSON.stringify(r403));
  const [sFila] = await j('GET', '/almoxarifado/notificacoes', undefined, login.token);
  assert.strictEqual(sFila, 403, 'a lista tambem recusa (mesmo portao)');
  const [sMat] = await j('GET', '/almoxarifado/materiais', undefined, login.token);
  assert.strictEqual(sMat, 200, 'a metade positiva: o usuario entra no modulo');
});

(async () => {
  console.log('\n=== Etapa 161: o dia de Brasilia (C397) e as sobras da C399/C400 ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e161-dl-'));
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
