/**
 * Etapa 248 (C525 + C534, B1506) — o estorno da nota no mesmo instante da liberacao do lote: a conta do estorno sob a trava.
 *
 * Ate a 247 a conta que solta a reserva da nota antes do estorno (`reservaChegadaService.liberarParaEstorno`) lia o disponivel, o lote
 * impedido e as reservas FORA da trava do material, antes do claim; a liberacao do lote (que reserva para quem espera sob a trava, Etapas
 * 220/247) e o bloqueio do lote (sob a trava) passavam no meio. Liberar o lote no meio fazia o estorno nao soltar nada e ser recusado
 * (C525); o lote liberado entre a leitura e a soltura fazia o estorno soltar a reserva de quem ja podia sair (C534: a requisicao voltava a
 * esperar com o material livre). Agora a conta, a soltura e a recriacao (se o estorno falhar) rodam DENTRO da secao do estorno.
 *
 * Teste de corrida com gancho: o gesto concorrente parte do contexto do TESTE (nunca de dentro do gancho — herdaria a secao pelo
 * AsyncLocalStorage e passaria direto pela trava); o gancho so sinaliza e segura o comando (molde exclusaoSerieQueVoltou RN-15).
 *
 * Plano: docs/superpowers/plans/2026-11-18-almoxarifado-etapa248-estorno-da-nota-sob-a-trava.md
 * Executar: cd server && node tests/api/estornoNotaSobTrava.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const trava = require('../../services/almoxarifado/travaPorMaterial');
const reservaChegada = require('../../services/almoxarifado/reservaChegadaService');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}

const ADMIN = { id: 1, nome: 'Adm 248', role: 'admin', is_superadmin: 1, email: 'a248@t.com' };
const API = '/api/almoxarifado';
const EM_ESPERA = ['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'];
const RECUSA_RESERVADO = 'Não é possível estornar: o material está reservado para requisições';
const espera = (ms) => new Promise((r) => { setTimeout(r, ms); });
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 248: o estorno da nota sob a trava do material (C525 + C534) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');
  await cfg('notificar_recebimento_entrada', '1');
  await cfg('notificar_recebimento_solicitante', '1');
  await cfg('notificacoes_dest_recebimento', 'almox248@t.com');
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [1, 'Sol 248', 's248@t.com']);

  const material = async ({ certificado = 1 } = {}) => {
    const c = `E248-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, controle_certificado)
        VALUES (?, ?, 'PC', 0, 0, 1, 0, 0.1, 1, 0, ?)`, [c, `Mat ${c}`, certificado])).lastID;
    return { id, codigo: c };
  };
  const loteId = async (m, codigo = 'L1') => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const putStatusReq = async (m, st, codigo = 'L1') => request(app).put(`${API}/lotes/${await loteId(m, codigo)}/status`)
    .send({ status: st, justificativa: 'teste 248' });
  const putStatus = async (m, st, codigo = 'L1') => ok(putStatusReq(m, st, codigo));
  const reqDireta = async (m, q) => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo)
      VALUES (?, 1, 'Sol 248', 'AGUARDANDO_ESTOQUE', 'NORMAL', ?, 1)`,
    [`REQ-E248-${++seq}`, `2026-11-01 10:${String(seq % 60).padStart(2, '0')}:00`])).lastID;
    await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,?)',
      [id, m.id, q]);
    return id;
  };
  const nota = async (m, q, lote = 'L1') => {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F248', '2026-11-01', '2026-11-02', 10)`, [`REC-E248-${++seq}`, `NF-E248-${seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote) VALUES (?,?,?,?,?)`, [r, m.id, q, q, lote]);
    await ok(request(app).post(`${API}/recebimentos/${r}/processar`).send({}));
    return r;
  };
  const movDaNota = async (m, rec) => (await dbGet(db, `SELECT id FROM movimentacoes_almoxarifado
    WHERE tipo = 'ENTRADA_COMPRA' AND recebimento_id = ? AND material_id = ?`, [rec, m.id])).id;
  const estornar = async (m, rec) => request(app).post(`${API}/movimentacoes/${await movDaNota(m, rec)}/cancelar`)
    .send({ motivo: 'e248 estorno' });
  /** Reservas ATIVAS de R: [[quantidade, recebimento_id], ...] na ordem de criacao. */
  const reservas = async (R) => (await dbAll(db, `SELECT quantidade - COALESCE(quantidade_utilizada, 0) AS q, recebimento_id
    FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA' ORDER BY id`, [R]))
    .map((x) => [Number(x.q), x.recebimento_id == null ? null : Number(x.recebimento_id)]);
  const somaReservas = async (R) => (await reservas(R)).reduce((s, x) => s + x[0], 0);
  const st = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
  const fisico = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [m.id]))
    .quantidade_atual);
  const cancelado = async (m, rec) => Number((await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?',
    [await movDaNota(m, rec)])).cancelado);

  /**
   * Gancho nos dois metodos do sqlite (`get` e `run`): `segurar(sql)` decide se o comando e segurado; quando e, o resultado so e
   * entregue depois de `soltar` resolver. `viu(trecho)` e uma promessa que resolve quando um comando com o trecho passa.
   */
  const gancho = () => {
    const orig = { get: db.get, run: db.run };
    const vistos = [];
    const esperas = [];
    let regra = null;
    const conferir = (sql) => {
      if (typeof sql !== 'string') return;
      vistos.push(sql);
      for (const e of esperas) if (!e.feito && sql.includes(e.trecho)) { e.feito = true; e.res(); }
    };
    const embrulhar = (nome) => function embrulhado(sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      conferir(sql);
      if (regra && !regra.usada && typeof sql === 'string' && sql.includes(regra.trecho)) {
        regra.usada = true;
        const r = regra;
        return orig[nome].call(db, sql, params, function depois(err, row) {
          const ctx = this;
          r.sinal();
          Promise.resolve(r.soltar()).then(() => cb.call(ctx, err, row));
        });
      }
      return orig[nome].call(db, sql, params, cb);
    };
    db.get = embrulhar('get');
    db.run = embrulhar('run');
    return {
      segurar(trecho, soltar) {
        let sinal; const pegou = new Promise((res) => { sinal = res; });
        regra = { trecho, soltar, sinal, usada: false };
        return pegou;
      },
      viu(trecho) {
        if (vistos.some((s) => s.includes(trecho))) return Promise.resolve();
        return new Promise((res) => { esperas.push({ trecho, res, feito: false }); });
      },
      usada: () => !!(regra && regra.usada),
      restaurar() { db.get = orig.get; db.run = orig.run; },
    };
  };
  const TRECHO_UPDATE_LOTE = 'UPDATE lotes_almoxarifado\n      SET status = ?, status_motivo = ?';
  const TRECHO_CLAIM = 'SET cancelado = 1, cancelado_por = ?';
  const TRECHO_CONTA = 'AS lote_da_entrada_impedido';

  // ── RN-248.01 (C525): a liberacao do lote no meio do estorno ─────────────────────────────────────────────────────────────────────
  await test('[RN-248.01] L1 bloqueado com A (4), R1 espera 4; o estorno de A no meio da liberacao do L1 -> 200, R1 volta a esperar', async () => {
    const m = await material();
    const R1 = await reqDireta(m, 4);
    const A = await nota(m, 4);
    assert.strictEqual((await dbGet(db, 'SELECT status FROM lotes_almoxarifado WHERE id = ?', [await loteId(m)])).status, 'BLOQUEADO',
      'premissa: o lote nasce bloqueado sem certificado');
    assert.deepStrictEqual(await reservas(R1), [], 'premissa: nada reservado sobre o lote bloqueado');
    const g = gancho();
    let rl; let re;
    try {
      // A liberacao segura o UPDATE do lote (ja Ativo, ainda sem reservar) ate o estorno gravar o claim — sem a trava na conta, o
      // estorno ja leu o disponivel (o lote Ativo, nada reservado: nao solta nada) antes do claim.
      const pegou = g.segurar(TRECHO_UPDATE_LOTE, () => Promise.race([g.viu(TRECHO_CLAIM).then(() => espera(20)), espera(2000)]));
      const lib = putStatusReq(m, 'ATIVO').then((x) => x);
      await pegou;
      re = await estornar(m, A); // do contexto do TESTE
      rl = await lib;
    } finally { g.restaurar(); }
    assert.ok(g.usada(), 'o gancho do UPDATE do lote nao disparou');
    assert.strictEqual(rl.status, 200, JSON.stringify(rl.body));
    assert.strictEqual(re.status, 200, `C525: o estorno no meio da liberacao recusou: ${JSON.stringify(re.body)}`);
    assert.deepStrictEqual(await reservas(R1), [], 'a reserva da liberacao (marca A) ficou de pe depois do estorno de A');
    // RN-248.06 (Fase 2, achado 2): a resposta da liberacao e o aviso nao prometem a reserva que o estorno ja soltou
    assert.deepStrictEqual(rl.body.reservado_para_quem_esperava, { quantidade: 0, unidade: 'PC', requisicoes: 0 },
      'a resposta da liberacao promete a reserva que o estorno soltou');
    const av = await dbAll(db, `SELECT 1 FROM fila_notificacoes_almoxarifado WHERE evento = 'RECEBIMENTO_ENTRADA_REQUISITANTE'
      AND json_extract(payload, '$.requisicao_id') = ? AND json_extract(payload, '$.origem') = 'LOTE_LIBERADO'`, [R1]);
    assert.strictEqual(av.length, 0, 'o aviso da liberacao prometeu a reserva que o estorno soltou');
    assert.ok(EM_ESPERA.includes(await st(R1)), `R1 volta a esperar (${await st(R1)})`);
    assert.strictEqual(await fisico(m), 0);
    assert.strictEqual(await cancelado(m, A), 1);
    // o gesto seguinte: a proxima nota atende R1
    const B = await nota(m, 4, 'L2');
    await ok(request(app).post(`${API}/lotes/${await loteId(m, 'L2')}/certificado`)
      .attach('certificado', Buffer.from('89504E470D0A1A0A0000000D4948445200000001000000010806000000', 'hex'),
        { filename: 'c.png', contentType: 'image/png' }));
    assert.deepStrictEqual(await reservas(R1), [[4, B]], 'a nota seguinte nao atendeu R1');
    const av2 = await dbAll(db, `SELECT 1 FROM fila_notificacoes_almoxarifado WHERE evento = 'RECEBIMENTO_ENTRADA_REQUISITANTE'
      AND json_extract(payload, '$.requisicao_id') = ? AND json_extract(payload, '$.origem') = 'LOTE_LIBERADO'`, [R1]);
    assert.strictEqual(av2.length, 1, 'metade positiva: a liberacao do L2 avisa R1');
  });

  // ── RN-248.02 (C534, "de mais"): o lote liberado entre a leitura e a soltura ────────────────────────────────────────────────────
  await test('[RN-248.02] A (4, L1 ativo) reservou R1; L2 (4) bloqueado; liberar L2 no meio do estorno de A -> R1 fica reservada (4)', async () => {
    const m = await material({ certificado: 0 });
    const R1 = await reqDireta(m, 4);
    const A = await nota(m, 4);
    assert.deepStrictEqual(await reservas(R1), [[4, A]], 'premissa: a chegada de A reservou R1');
    await ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'ENTRADA', quantidade: 4, motivo: 'e248', lote: 'L2' }), 201);
    await putStatus(m, 'BLOQUEADO', 'L2');
    const g = gancho();
    let rl; let re;
    try {
      // O estorno segura a leitura da conta (L2 bloqueado: o que sobra nao pode sair -> solta R1). A liberacao do L2 parte do contexto
      // do teste; sem a trava na conta ela termina no meio (R1 ainda reservada: nada para ela) e o estorno solta R1 com o L2 ja livre.
      let libFeita = null;
      const pegou = g.segurar(TRECHO_CONTA, () => Promise.race([new Promise((res) => { libFeita = res; }), espera(400)]));
      const est = estornar(m, A).then((x) => x);
      await pegou;
      const lib = putStatusReq(m, 'ATIVO', 'L2').then((x) => { if (libFeita) libFeita(); return x; });
      re = await est;
      rl = await lib;
    } finally { g.restaurar(); }
    assert.ok(g.usada(), 'o gancho da conta do estorno nao disparou');
    assert.strictEqual(re.status, 200, JSON.stringify(re.body));
    assert.strictEqual(rl.status, 200, JSON.stringify(rl.body));
    assert.strictEqual(await fisico(m), 4);
    assert.strictEqual(await somaReservas(R1), 4, `C534: R1 perdeu a reserva com o L2 livre (${JSON.stringify(await reservas(R1))})`);
    assert.strictEqual(await st(R1), 'TOTALMENTE_RESERVADA');
  });

  // ── RN-248.03: a conta e a recriacao sob a trava (o estorno que falha depois de soltar) ─────────────────────────────────────────
  await test('[RN-248.03] a conta solta sob a trava; o livro falha -> a recriacao roda sob a trava e R1 volta reservada (4)', async () => {
    const m = await material({ certificado: 0 });
    const R1 = await reqDireta(m, 4);
    const A = await nota(m, 4);
    assert.deepStrictEqual(await reservas(R1), [[4, A]], 'premissa: a chegada de A reservou R1');
    const origLib = reservaChegada.liberarParaEstorno;
    const origRec = reservaChegada.recriarAposEstornoRecusado;
    const visto = { lib: null, rec: null, soltas: 0 };
    reservaChegada.liberarParaEstorno = async (...a) => {
      visto.lib = trava.travado(m.id);
      const r = await origLib(...a);
      visto.soltas = r.length;
      return r;
    };
    reservaChegada.recriarAposEstornoRecusado = async (...a) => { visto.rec = trava.travado(m.id); return origRec(...a); };
    const origRun = db.run;
    let falhou = false;
    db.run = function run(sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!falhou && typeof sql === 'string' && sql.includes('INSERT INTO movimentacoes_almoxarifado') && Array.isArray(params)
        && params[1] === 'ESTORNO') {
        falhou = true;
        return setImmediate(() => cb.call({}, new Error('falha forcada do livro 248')));
      }
      return origRun.call(db, sql, params, cb);
    };
    let re;
    try { re = await estornar(m, A); } finally {
      db.run = origRun; reservaChegada.liberarParaEstorno = origLib; reservaChegada.recriarAposEstornoRecusado = origRec;
    }
    assert.ok(falhou, 'o gancho do livro nao disparou');
    assert.notStrictEqual(re.status, 200, JSON.stringify(re.body));
    assert.strictEqual(visto.soltas, 1, `premissa: a conta soltou a reserva de R1 (${visto.soltas})`);
    assert.strictEqual(visto.lib, true, 'a conta do estorno rodou fora da trava do material');
    assert.strictEqual(visto.rec, true, 'a recriacao do estorno recusado rodou fora da trava do material');
    assert.strictEqual(await somaReservas(R1), 4, 'R1 nao voltou reservada');
    assert.strictEqual(await st(R1), 'TOTALMENTE_RESERVADA');
    assert.strictEqual(await fisico(m), 4);
    assert.strictEqual(await cancelado(m, A), 0);
    assert.strictEqual(trava.travado(m.id), false, 'a trava ficou presa');
  });

  // ── RN-248.04: pelo servico (cancelarMovimentacao direto), a mesma corrida da RN-248.01 ─────────────────────────────────────────
  await test('[RN-248.04] pelo servico: cancelarMovimentacao no meio da liberacao do L1 -> conclui, R1 volta a esperar', async () => {
    const m = await material();
    const R1 = await reqDireta(m, 4);
    const A = await nota(m, 4);
    const g = gancho();
    let rl; let resultado; let erro = null;
    try {
      const pegou = g.segurar(TRECHO_UPDATE_LOTE, () => Promise.race([g.viu(TRECHO_CLAIM).then(() => espera(20)), espera(2000)]));
      const lib = putStatusReq(m, 'ATIVO').then((x) => x);
      await pegou;
      try {
        resultado = await stockService.cancelarMovimentacao(db, ADMIN, await movDaNota(m, A), 'e248 servico');
      } catch (e) { erro = e; }
      rl = await lib;
    } finally { g.restaurar(); }
    assert.ok(g.usada(), 'o gancho do UPDATE do lote nao disparou');
    assert.strictEqual(rl.status, 200, JSON.stringify(rl.body));
    assert.strictEqual(erro, null, `C525 pelo servico: ${erro && erro.message}`);
    assert.ok(resultado && resultado.success, JSON.stringify(resultado));
    assert.ok(!erro || !String(erro.message).startsWith(RECUSA_RESERVADO));
    assert.deepStrictEqual(await reservas(R1), []);
    assert.strictEqual(await fisico(m), 0);
  });

  // ── RN-248.07 (Fase 5, achado 1): a reserva cancelada por outra porta no meio da conta conta como solta ────────────────────────
  await test('[RN-248.07] R1 e R2 com 2 de A cada, 2 livres; cancelar R2 no meio da conta do estorno de A -> R1 fica reservada (2)', async () => {
    // material sem lote: 2 avulsos livres; A (4) reserva 2 para R1 e 2 para R2. O estorno precisa soltar 2 (a de R2, a ultima na ordem).
    const c = `E248-${++seq}`;
    const m = { id: (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, controle_certificado)
        VALUES (?, ?, 'PC', 0, 0, 1, 0, 0.1, 0, 0, 0)`, [c, `Mat ${c}`])).lastID };
    await ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'ENTRADA', quantidade: 2, motivo: 'e248' }), 201);
    const R1 = await reqDireta(m, 2);
    const R2 = await reqDireta(m, 2);
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F248', '2026-11-01', '2026-11-02', 10)`, [`REC-E248-${++seq}`, `NF-E248-${seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida)
      VALUES (?,?,4,4)`, [r, m.id]);
    await ok(request(app).post(`${API}/recebimentos/${r}/processar`).send({}));
    assert.deepStrictEqual([await reservas(R1), await reservas(R2)], [[[2, r]], [[2, r]]], 'premissa: A reservou 2 para cada');
    const origAll = db.all; let segurou = false; let sinal; const pegou = new Promise((res) => { sinal = res; });
    let soltar; const liberado = new Promise((res) => { soltar = res; });
    db.all = function all(sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!segurou && typeof sql === 'string' && sql.includes('AS rs_data_necessidade')) {
        segurou = true;
        return origAll.call(db, sql, params, function depois(err, rows) {
          const ctx = this; sinal();
          Promise.race([liberado, espera(3000)]).then(() => cb.call(ctx, err, rows));
        });
      }
      return origAll.call(db, sql, params, cb);
    };
    let re; let rc;
    try {
      const est = estornar(m, r).then((x) => x);
      await pegou;
      rc = await request(app).put(`${API}/requisicoes/${R2}/cancelar`).send({ motivo: 'e248 cancela R2' }); // do contexto do TESTE
      soltar();
      re = await est;
    } finally { db.all = origAll; }
    assert.ok(segurou, 'o gancho da leitura das reservas do estorno nao disparou');
    assert.strictEqual(rc.status, 200, JSON.stringify(rc.body));
    assert.strictEqual(re.status, 200, JSON.stringify(re.body));
    assert.strictEqual(await fisico(m), 2);
    assert.strictEqual(await somaReservas(R1), 2, 'a conta soltou a reserva de R1 porque a de R2 ja tinha sido cancelada (soltar de mais)');
    assert.strictEqual(await st(R1), 'TOTALMENTE_RESERVADA');
  });

  // ── RN-248.08 (Fase 5, achado 2): a resposta e o aviso seguem a reserva recriada ────────────────────────────────────────────────
  await test('[RN-248.08] RN-248.01 com o livro do estorno falhando: a reserva e recriada; a liberacao responde 4 e avisa R1', async () => {
    const m = await material();
    const R1 = await reqDireta(m, 4);
    const A = await nota(m, 4);
    const g = gancho();
    const origRun = db.run; // o do gancho
    let falhou = false;
    db.run = function run(sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!falhou && typeof sql === 'string' && sql.includes('INSERT INTO movimentacoes_almoxarifado') && Array.isArray(params)
        && params[1] === 'ESTORNO') {
        falhou = true;
        return setImmediate(() => cb.call({}, new Error('falha forcada do livro 248')));
      }
      return origRun.call(db, sql, params, cb);
    };
    let rl; let re;
    try {
      const pegou = g.segurar(TRECHO_UPDATE_LOTE, () => Promise.race([g.viu(TRECHO_CLAIM).then(() => espera(20)), espera(2000)]));
      const lib = putStatusReq(m, 'ATIVO').then((x) => x);
      await pegou;
      re = await estornar(m, A);
      rl = await lib;
    } finally { db.run = origRun; g.restaurar(); }
    assert.ok(g.usada() && falhou, 'os ganchos nao dispararam');
    assert.notStrictEqual(re.status, 200, JSON.stringify(re.body));
    assert.deepStrictEqual(await reservas(R1), [[4, A]], 'premissa: a reserva foi recriada com a marca de A');
    assert.deepStrictEqual(rl.body.reservado_para_quem_esperava, { quantidade: 4, unidade: 'PC', requisicoes: 1 },
      'a resposta da liberacao perdeu a reserva recriada');
    const av = await dbAll(db, `SELECT 1 FROM fila_notificacoes_almoxarifado WHERE evento = 'RECEBIMENTO_ENTRADA_REQUISITANTE'
      AND json_extract(payload, '$.requisicao_id') = ? AND json_extract(payload, '$.origem') = 'LOTE_LIBERADO'`, [R1]);
    assert.strictEqual(av.length, 1, 'R1 nao foi avisada da reserva (recriada) da liberacao');
  });

  terminou = true;
  await close();
  console.log(`\n  ${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
