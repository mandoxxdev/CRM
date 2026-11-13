/**
 * Etapa 228 (C521) — estornar a entrada boa nao deixa a reserva coberta so por lote impedido.
 *
 * `reservaChegadaService.liberarParaEstorno` comparava o estornado com o disponivel do material, que conta o saldo de lote bloqueado,
 * reprovado ou vencido. Com 3 num lote bom reservadas para R1 e 4 num lote bloqueado, o estorno dos 3 nao soltava nada e R1 ficava
 * reservada sem nada que saia. Agora (B1504) o livre e `disponivel - loteImpedido` quando o lote da entrada nao esta impedido (e o
 * disponivel de hoje quando esta: as pecas ja estao no impedido); a falta nao tem teto no estornado (B1505); o motivo da liberacao diz
 * quando o lote impedido pesou (B1507).
 *
 * Pela ROTA do estorno (`POST /movimentacoes/:id/cancelar`), com a nota por `/recebimentos/:id/processar` (molde da 219).
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa228-estorno-lote-impedido.md
 * Executar: cd server && node tests/api/estornoLoteImpedido.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}

const ADMIN = { id: 1, nome: 'Adm 228', role: 'admin', is_superadmin: 1, email: 'a228@t.com' };
const SOL = { id: 22801, nome: 'Solic 228', role: 'admin', is_superadmin: 1, email: 's228@t.com' };
const API = '/api/almoxarifado';
const EM_ESPERA = ['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'];
const MOTIVO_HOJE = (n) => `Estorno da entrada do recebimento ${n}`;
const MOTIVO_IMPEDIDO = (n) => `Estorno da entrada do recebimento ${n} — o que sobra do material está em lote bloqueado, reprovado ou vencido`;
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 228: o estorno da entrada boa nao deixa a reserva coberta so por lote impedido (C521) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [SOL.id, SOL.nome, SOL.email]);

  const material = async ({ controleLote = 1, certificado = 0 } = {}) => {
    const c = `E228-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, controle_certificado)
        VALUES (?, ?, 'PC', 0, 0, 1, 0, 0.1, ?, 0, ?)`, [c, `Mat ${c}`, controleLote, certificado])).lastID;
    return { id, codigo: c };
  };
  const entrar = (m, q, lote) => ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'ENTRADA',
    quantidade: q, motivo: 'e228', lote }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const statusLote = async (m, codigo, st) => ok(request(app).put(`${API}/lotes/${await loteId(m, codigo)}/status`)
    .send({ status: st, justificativa: 'teste 228' }));
  const statusLoteDe = async (m, codigo) => (await dbGet(db, 'SELECT status FROM lotes_almoxarifado WHERE id = ?',
    [await loteId(m, codigo)])).status;
  const criar = async (m, q) => as(SOL, async () => {
    const r = await request(app).post(`${API}/requisicoes`).send({ os_referencia: 'OS-228', itens: [{ material_id: m.id, quantidade: q }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body.id;
  });
  const esperando = async (m, q) => {
    const R = await criar(m, q);
    const a = await ok(request(app).put(`${API}/requisicoes/${R}/aprovar`).send({}));
    assert.ok(EM_ESPERA.includes(a.body.status), `premissa: a aprovacao espera (${a.body.status})`);
    return R;
  };
  const st = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
  const reservasAtivas = async (R) => (await dbAll(db, `SELECT quantidade - COALESCE(quantidade_utilizada,0) AS q
    FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA' ORDER BY id`, [R])).map((x) => Number(x.q));
  const somaAtiva = async (R) => (await reservasAtivas(R)).reduce((s, x) => s + x, 0);
  // O que foi solto, pelo livro (a liberacao parcial deixa a linha ATIVA com a quantidade menor e o motivo gravado).
  const liberadas = (R) => dbAll(db, `SELECT mv.quantidade, rs.motivo_liberacao FROM movimentacoes_almoxarifado mv
    JOIN reservas_material_almoxarifado rs ON rs.id = mv.reserva_id
    WHERE rs.requisicao_id = ? AND mv.tipo = 'LIBERACAO_RESERVA' ORDER BY mv.id`, [R]);
  const mat = async (m) => {
    const x = await dbGet(db, `SELECT quantidade_atual f, COALESCE(quantidade_reservada,0) r FROM materiais_almoxarifado WHERE id = ?`, [m.id]);
    return { fisico: Number(x.f), reservado: Number(x.r) };
  };
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, cliente_id INTEGER,
    tipo_os TEXT NOT NULL DEFAULT 'producao', status TEXT DEFAULT 'pendente', data_abertura DATE NOT NULL DEFAULT '2026-11-13')`);
  const reqDireta = async (m, q, extra = {}) => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo, os_id, os_referencia)
      VALUES (?, ?, ?, 'AGUARDANDO_ESTOQUE', 'NORMAL', ?, 1, ?, ?)`,
    [`REQ-E228D-${++seq}`, SOL.id, SOL.nome, `2026-11-01 10:${String(seq % 60).padStart(2, '0')}:00`,
      extra.os_id || null, extra.os_referencia || null])).lastID;
    await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,?)',
      [id, m.id, q]);
    return id;
  };
  const nota = async (linhas, extra = {}) => {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota, os_id)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F228', '2026-11-01', '2026-11-02', 10, ?)`, [`REC-E228-${++seq}`, `NF-E228-${seq}`,
      extra.os_id || null])).lastID;
    for (const [m, q, lote] of linhas) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote) VALUES (?,?,?,?,?)`, [r, m.id, q, q, lote]);
    }
    return r;
  };
  const receber = async (linhas, extra) => {
    const rec = await nota(linhas, extra);
    await ok(request(app).post(`${API}/recebimentos/${rec}/processar`).send({}));
    const numero = (await dbGet(db, 'SELECT numero FROM recebimentos_material_almoxarifado WHERE id = ?', [rec])).numero;
    return { rec, numero };
  };
  /** A ENTRADA_COMPRA do item da nota no lote `codigo`. */
  const movDoLote = async (rec, m, codigo) => {
    const x = await dbGet(db, `SELECT id, quantidade FROM movimentacoes_almoxarifado
      WHERE tipo = 'ENTRADA_COMPRA' AND recebimento_id = ? AND material_id = ? AND lote_id = ?`, [rec, m.id, await loteId(m, codigo)]);
    assert.ok(x, `premissa: a nota gravou uma ENTRADA_COMPRA no lote ${codigo}`);
    return x.id;
  };
  const estornar = (movId) => request(app).post(`${API}/movimentacoes/${movId}/cancelar`).send({ motivo: 'estorno e228' });
  const cancelada = async (movId) => Number((await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [movId])).cancelado);

  /**
   * Montagem padrao (molde da RN-219.02): 1 PC manual em L1, L1 bloqueado (ou vencido) ANTES de R1 ser aprovada; R1 espera `espera`;
   * a nota traz 3 em L2 (ATIVO) e 4 em L1. `modo`: 'BLOQUEADO' | 'VENCIDO' | 'VENCIDO_LIBERADO' | 'ATIVO'.
   */
  const montar = async ({ modo = 'BLOQUEADO', espera = 6, controleLote = 1 } = {}) => {
    const m = await material({ controleLote });
    // R1 aprovada ANTES do 1 PC (sem saldo: espera); a entrada manual nao distribui (D4 da 74).
    const R1 = await esperando(m, espera);
    await entrar(m, 1, 'L1');
    if (modo === 'BLOQUEADO') await statusLote(m, 'L1', 'BLOQUEADO');
    if (modo === 'VENCIDO' || modo === 'VENCIDO_LIBERADO') {
      const ontem = diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), -1);
      await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ?, vencimento_liberado_em = ? WHERE id = ?',
        [ontem, modo === 'VENCIDO_LIBERADO' ? '2026-11-13 08:00:00' : null, await loteId(m, 'L1')]);
    }
    const { rec, numero } = await receber([[m, 3, 'L2'], [m, 4, 'L1']]);
    assert.strictEqual(await statusLoteDe(m, 'L2'), 'ATIVO', 'premissa: L2 nasce ativo (sem certificado exigido)');
    return { m, R1, rec, numero };
  };

  // ── RN-228.01 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  let cenario01 = null;
  await test('[RN-228.01] 3 em L2 (reservadas a R1) + 4 em L1 BLOQUEADO: estornar L2 -> 200, a reserva de 3 LIBERADA com o motivo do lote impedido, R1 espera', async () => {
    const c = await montar();
    const { m, R1, rec, numero } = c;
    assert.deepStrictEqual(await reservasAtivas(R1), [3], 'premissa: a chegada reservou so as 3 do lote bom (219)');
    assert.strictEqual(await st(R1), 'PARCIALMENTE_RESERVADA', 'premissa');
    const mov = await movDoLote(rec, m, 'L2');
    await ok(estornar(mov));
    assert.deepStrictEqual(await reservasAtivas(R1), [], 'R1 continuou reservada sobre o lote bloqueado (C521)');
    assert.deepStrictEqual((await liberadas(R1)).map((x) => [Number(x.quantidade), x.motivo_liberacao]), [[3, MOTIVO_IMPEDIDO(numero)]]);
    const movLib = await dbGet(db, `SELECT motivo FROM movimentacoes_almoxarifado WHERE tipo = 'LIBERACAO_RESERVA' AND material_id = ?
      ORDER BY id DESC LIMIT 1`, [m.id]);
    assert.strictEqual(movLib.motivo, 'Liberação por estorno da entrada', 'a linha do livro nao muda');
    assert.ok(EM_ESPERA.includes(await st(R1)), `R1 deveria esperar: ${await st(R1)}`);
    assert.deepStrictEqual(await mat(m), { fisico: 5, reservado: 0 });
    assert.strictEqual(await cancelada(mov), 1);
    cenario01 = c;
  });

  // ── RN-228.09 (integracao) ────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-228.09] depois da RN-228.01, liberar L1 (ATIVO) reserva para R1 o que o lote tem (Etapa 220)', async () => {
    assert.ok(cenario01, 'premissa: RN-228.01 montou o cenario');
    const { m, R1 } = cenario01;
    await statusLote(m, 'L1', 'ATIVO');
    assert.strictEqual(await somaAtiva(R1), 5, 'a liberacao do lote atende quem voltou a esperar');
    assert.strictEqual(await st(R1), 'PARCIALMENTE_RESERVADA');
  });

  // ── RN-228.02 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-228.02] como a .01 + 1 PC livre em L0 depois da chegada: estornar L2 solta so 2 (fica 1, coberta pelo L0)', async () => {
    const { m, R1, rec, numero } = await montar();
    await entrar(m, 1, 'L0');
    assert.deepStrictEqual(await reservasAtivas(R1), [3], 'premissa: a entrada manual nao distribui');
    await ok(estornar(await movDoLote(rec, m, 'L2')));
    assert.strictEqual(await somaAtiva(R1), 1);
    assert.deepStrictEqual((await liberadas(R1)).map((x) => [Number(x.quantidade), x.motivo_liberacao]), [[2, MOTIVO_IMPEDIDO(numero)]]);
    assert.strictEqual(await st(R1), 'PARCIALMENTE_RESERVADA');
    assert.deepStrictEqual(await mat(m), { fisico: 6, reservado: 1 });
  });

  // ── RN-228.03 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-228.03] o resto em lote BOM (L1 ATIVO), R1 espera 3: estornar L2 nao solta (como hoje)', async () => {
    const { m, R1, rec } = await montar({ modo: 'ATIVO', espera: 3 });
    assert.deepStrictEqual(await reservasAtivas(R1), [3], 'premissa');
    await ok(estornar(await movDoLote(rec, m, 'L2')));
    assert.deepStrictEqual(await reservasAtivas(R1), [3]);
    assert.deepStrictEqual(await liberadas(R1), []);
    assert.strictEqual(await st(R1), 'TOTALMENTE_RESERVADA');
  });

  // ── RN-228.04 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-228.04] estornar a entrada do proprio lote BLOQUEADO (L1, 4): a regua de hoje — a reserva de 3 (coberta por L2) fica', async () => {
    const { m, R1, rec } = await montar();
    await ok(estornar(await movDoLote(rec, m, 'L1')));
    assert.deepStrictEqual(await reservasAtivas(R1), [3], 'soltou reserva coberta pelo lote bom (descontou o impedido duas vezes)');
    assert.deepStrictEqual(await liberadas(R1), []);
    assert.strictEqual(await st(R1), 'PARCIALMENTE_RESERVADA');
    assert.deepStrictEqual(await mat(m), { fisico: 4, reservado: 3 });
  });

  // ── RN-228.05 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-228.05 a] L1 ATIVO vencido ontem (Brasilia), sem liberacao: estornar L2 solta os 3 (como a .01)', async () => {
    const { m, R1, rec, numero } = await montar({ modo: 'VENCIDO' });
    assert.deepStrictEqual(await reservasAtivas(R1), [3], 'premissa: a chegada nao reservou o vencido');
    await ok(estornar(await movDoLote(rec, m, 'L2')));
    assert.deepStrictEqual(await reservasAtivas(R1), []);
    assert.deepStrictEqual((await liberadas(R1)).map((x) => x.motivo_liberacao), [MOTIVO_IMPEDIDO(numero)]);
  });
  await test('[RN-228.05 b] L1 vencido COM o vencimento liberado, R1 espera 3: estornar L2 nao solta', async () => {
    const { m, R1, rec } = await montar({ modo: 'VENCIDO_LIBERADO', espera: 3 });
    assert.deepStrictEqual(await reservasAtivas(R1), [3], 'premissa');
    await ok(estornar(await movDoLote(rec, m, 'L2')));
    assert.deepStrictEqual(await reservasAtivas(R1), [3]);
  });

  // ── RN-228.06 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-228.06] material SEM controle de lote (L1 BLOQUEADO, B1371), R1 espera 3: estornar L2 nao solta', async () => {
    const { m, R1, rec } = await montar({ controleLote: 0, espera: 3 });
    assert.deepStrictEqual(await reservasAtivas(R1), [3], 'premissa: sem controle de lote a chegada reserva');
    await ok(estornar(await movDoLote(rec, m, 'L2')));
    assert.deepStrictEqual(await reservasAtivas(R1), [3]);
    assert.deepStrictEqual(await liberadas(R1), []);
  });

  // ── RN-228.07 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-228.07] nota com 3 em L2 + 3 em L3 reservadas a R1 (6); L3 bloqueado depois: estornar L2 solta as 6 (B1505)', async () => {
    const m = await material();
    const R1 = await esperando(m, 6);
    const { rec, numero } = await receber([[m, 3, 'L2'], [m, 3, 'L3']]);
    assert.strictEqual(await somaAtiva(R1), 6, 'premissa: a chegada reservou as 6');
    await statusLote(m, 'L3', 'BLOQUEADO');
    await ok(estornar(await movDoLote(rec, m, 'L2')));
    assert.strictEqual(await somaAtiva(R1), 0, 'R1 ficou reservada sobre o L3 bloqueado');
    const lib = await liberadas(R1);
    assert.strictEqual(lib.reduce((s, x) => s + Number(x.quantidade), 0), 6);
    assert.ok(lib.every((x) => x.motivo_liberacao === MOTIVO_IMPEDIDO(numero)), JSON.stringify(lib));
    assert.ok(EM_ESPERA.includes(await st(R1)), await st(R1));
    assert.deepStrictEqual(await mat(m), { fisico: 3, reservado: 0 });
  });
  await test('[RN-228.07 controle] o mesmo com L3 ATIVO: solta 3 pela regua de hoje (motivo de hoje) e R1 fica com 3', async () => {
    const m = await material();
    const R1 = await esperando(m, 6);
    const { rec, numero } = await receber([[m, 3, 'L2'], [m, 3, 'L3']]);
    assert.strictEqual(await somaAtiva(R1), 6, 'premissa');
    await ok(estornar(await movDoLote(rec, m, 'L2')));
    assert.strictEqual(await somaAtiva(R1), 3);
    const lib = await liberadas(R1);
    assert.strictEqual(lib.reduce((s, x) => s + Number(x.quantidade), 0), 3);
    assert.ok(lib.every((x) => x.motivo_liberacao === MOTIVO_HOJE(numero)), JSON.stringify(lib));
  });

  // ── RN-228.08 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-228.08] estorno que FALHA depois de soltar (livro do ESTORNO forcado): a falha original, a reserva de 3 recriada, fisico 8', async () => {
    const { m, R1, rec } = await montar();
    const mov = await movDoLote(rec, m, 'L2');
    await dbRun(db, `CREATE TRIGGER e228_falha_estorno BEFORE INSERT ON movimentacoes_almoxarifado
      WHEN NEW.tipo = 'ESTORNO' BEGIN SELECT RAISE(ABORT, 'e228 livro forcado'); END`);
    let e;
    try { e = await estornar(mov); } finally { await dbRun(db, 'DROP TRIGGER IF EXISTS e228_falha_estorno'); }
    assert.ok(e.status >= 400, `${e.status} ${JSON.stringify(e.body)}`);
    assert.match(String(e.body.error), /e228 livro forcado/);
    assert.strictEqual((await liberadas(R1)).length, 1, 'premissa: o estorno soltou antes de falhar (sem o conserto nao solta nada)');
    const rec2 = await dbAll(db, `SELECT quantidade, recebimento_id, observacoes FROM reservas_material_almoxarifado
      WHERE requisicao_id = ? AND status = 'ATIVA'`, [R1]);
    assert.deepStrictEqual(rec2.map((x) => [Number(x.quantidade), x.recebimento_id]), [[3, rec]]);
    assert.match(String(rec2[0].observacoes), /recriada após estorno recusado/);
    assert.strictEqual(await st(R1), 'PARCIALMENTE_RESERVADA');
    assert.deepStrictEqual(await mat(m), { fisico: 8, reservado: 3 });
    assert.strictEqual(await cancelada(mov), 0);
  });

  // ── RN-228.11 (Fase 2, B1508) ─────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-228.11] nota com OS ABERTA (3 em L2 + 4 em L1 BLOQUEADO), requisicao da OS com 2: estornar L2 nao tira os 2 dela (B1455)', async () => {
    const os = (await dbRun(db, "INSERT INTO ordens_servico (numero_os, status) VALUES ('OS-E228-A', 'em_andamento')")).lastID;
    const m = await material();
    const R1 = await reqDireta(m, 2, { os_id: os, os_referencia: 'OS-E228-A' });
    await entrar(m, 1, 'L1');
    await statusLote(m, 'L1', 'BLOQUEADO');
    const { rec } = await receber([[m, 3, 'L2'], [m, 4, 'L1']], { os_id: os });
    assert.deepStrictEqual(await reservasAtivas(R1), [2], 'premissa: a fila da OS reservou sem o desconto (B1455)');
    const daOs = async () => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade - COALESCE(quantidade_utilizada,0)),0) q
      FROM reservas_material_almoxarifado WHERE status = 'ATIVA' AND origem = 'MANUAL' AND os_id = ? AND material_id = ?`, [os, m.id])).q);
    assert.strictEqual(await daOs(), 5, 'premissa: o resto virou a reserva da OS');
    await ok(estornar(await movDoLote(rec, m, 'L2')));
    assert.deepStrictEqual(await reservasAtivas(R1), [2], 'tirou da requisicao da OS e deixou a reserva generica da OS no bloqueado');
    assert.strictEqual(await daOs(), 2, 'a reserva da OS solta min(reserva, estornado), como na 171');
  });

  // ── RN-228.12 (Fase 2) ───────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-228.12] entrada SEM lote (de antes de o material controlar lote) + 4 em L1 BLOQUEADO: estornar a sem lote solta os 3', async () => {
    // A nota exige o lote em material com controle; a entrada sem lote e a legada: o controle foi ligado depois da nota.
    const m = await material({ controleLote: 0 });
    const R1 = await esperando(m, 3);
    const { rec, numero } = await receber([[m, 3, null]]);
    assert.deepStrictEqual(await reservasAtivas(R1), [3], 'premissa: a chegada reservou as 3 sem lote');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1 WHERE id = ?', [m.id]);
    await entrar(m, 4, 'L1');
    await statusLote(m, 'L1', 'BLOQUEADO');
    const mov = await dbGet(db, `SELECT id FROM movimentacoes_almoxarifado
      WHERE tipo = 'ENTRADA_COMPRA' AND recebimento_id = ? AND material_id = ? AND lote_id IS NULL`, [rec, m.id]);
    assert.ok(mov, 'premissa: a nota gravou a entrada sem lote');
    await ok(estornar(mov.id));
    assert.deepStrictEqual(await reservasAtivas(R1), [], 'a entrada sem lote foi tratada como lote impedido');
    assert.deepStrictEqual((await liberadas(R1)).map((x) => [Number(x.quantidade), x.motivo_liberacao]), [[3, MOTIVO_IMPEDIDO(numero)]]);
  });

  terminou = true;
  await close();
  console.log(`\n  ${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
