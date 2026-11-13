/**
 * Etapa 220 (C480 + C523) — liberar o lote reserva para quem esperava, e quem muda o status do lote pega a trava do material.
 *
 * Desde a 219 o que entra em lote impedido nao fica reservado para quem espera. A liberacao do lote (anexar o certificado, voltar o
 * status para ATIVO, liberar o vencimento) agora reserva o livre do lote para a fila, pela porta da 75 (origem LOTE_LIBERADO), dentro
 * da mesma secao da trava do material que muda o status (B1461, B1462). Os tres escritores do status (o bloqueio tambem) pegam a trava.
 *
 * Pelas ROTAS (`/lotes/:id/status`, `/lotes/:id/liberar-vencimento`, `/lotes/:id/certificado`, a nota por `/recebimentos/:id/processar`,
 * `/requisicoes/:id/aprovar|separar|entregar`).
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa220-liberar-lote-reserva-para-quem-espera.md
 * Executar: cd server && node tests/api/liberarLoteReserva.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const trava = require('../../services/almoxarifado/travaPorMaterial');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}

const ADMIN = { id: 1, nome: 'Adm 220', role: 'admin', is_superadmin: 1, email: 'a220@t.com' };
const SOL = { id: 22001, nome: 'Solic 220', role: 'admin', is_superadmin: 1, email: 's220@t.com' };
const API = '/api/almoxarifado';
const EM_ESPERA = ['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'];
const PNG = Buffer.from('89504E470D0A1A0A0000000D4948445200000001000000010806000000', 'hex');
const esperar = (ms) => new Promise((r) => { setTimeout(r, ms); });
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 220: liberar o lote reserva para quem esperava (C480) e o status do lote sob a trava (C523) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');
  await cfg('inspecao_material_critico', '1');
  await cfg('notificar_recebimento_entrada', '1');
  await cfg('notificar_recebimento_solicitante', '1');
  await cfg('notificacoes_dest_recebimento', 'almox220@t.com');
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [SOL.id, SOL.nome, SOL.email]);

  const material = async ({ certificado = 1, controleLote = 1 } = {}) => {
    const c = `E220-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, controle_certificado)
        VALUES (?, ?, 'PC', 0, 0, 1, 0, 0.1, ?, 0, ?)`, [c, `Mat ${c}`, controleLote, certificado])).lastID;
    return { id, codigo: c, nome: `Mat ${c}` };
  };
  const entrar = (m, q, lote) => ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'ENTRADA',
    quantidade: q, motivo: 'e220', lote }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const putStatus = async (m, codigo, st) => request(app).put(`${API}/lotes/${await loteId(m, codigo)}/status`)
    .send({ status: st, justificativa: 'teste 220' });
  const statusLote = async (m, codigo, st) => ok(putStatus(m, codigo, st));
  const liberarVenc = async (m, codigo) => request(app).put(`${API}/lotes/${await loteId(m, codigo)}/liberar-vencimento`)
    .send({ justificativa: 'teste 220' });
  const anexar = async (m, codigo) => request(app).post(`${API}/lotes/${await loteId(m, codigo)}/certificado`)
    .attach('certificado', PNG, { filename: 'c.png', contentType: 'image/png' });
  const criar = async (m, q) => as(SOL, async () => {
    const r = await request(app).post(`${API}/requisicoes`).send({ os_referencia: 'OS-220', itens: [{ material_id: m.id, quantidade: q }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body.id;
  });
  const aprovar = (R) => ok(request(app).put(`${API}/requisicoes/${R}/aprovar`).send({}));
  const esperando = async (m, q) => {
    const R = await criar(m, q);
    const a = await aprovar(R);
    assert.ok(EM_ESPERA.includes(a.body.status), `premissa: a aprovacao espera (${a.body.status})`);
    return R;
  };
  const reqDireta = async (m, q, { urgencia = 'NORMAL' } = {}) => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo)
      VALUES (?, ?, ?, 'AGUARDANDO_ESTOQUE', ?, ?, 1)`,
    [`REQ-E220D-${++seq}`, SOL.id, SOL.nome, urgencia, `2026-11-01 10:${String(seq % 60).padStart(2, '0')}:00`])).lastID;
    await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,?)',
      [id, m.id, q]);
    return id;
  };
  const st = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
  const reservas = async (R) => (await dbAll(db, `SELECT quantidade FROM reservas_material_almoxarifado
    WHERE requisicao_id = ? AND status = 'ATIVA' ORDER BY id`, [R])).map((x) => Number(x.quantidade));
  const nota = async (linhas) => {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F220', '2026-11-01', '2026-11-02', 10)`, [`REC-E220-${++seq}`, `NF-E220-${seq}`])).lastID;
    for (const [m, q, lote] of linhas) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote) VALUES (?,?,?,?,?)`, [r, m.id, q, q, lote]);
    }
    return r;
  };
  const processar = (rec) => request(app).post(`${API}/recebimentos/${rec}/processar`).send({});
  const receber = async (linhas) => { const rec = await nota(linhas); await ok(processar(rec)); return rec; };
  const statusLoteDe = async (m, codigo) => (await dbGet(db, 'SELECT status FROM lotes_almoxarifado WHERE id = ?',
    [await loteId(m, codigo)])).status;
  const avisosReq = async (R) => dbAll(db, `SELECT corpo_texto, payload FROM fila_notificacoes_almoxarifado
    WHERE evento = 'RECEBIMENTO_ENTRADA_REQUISITANTE' AND json_extract(payload, '$.requisicao_id') = ? ORDER BY id`, [R]);
  const ontem = diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), -1);
  const vencer = async (m, codigo) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ?, vencimento_liberado_em = NULL WHERE id = ?',
    [ontem, await loteId(m, codigo)]);
  const RES = (quantidade, requisicoes) => ({ quantidade, unidade: 'PC', requisicoes });
  /** Material com nota de 4 toda em L1 BLOQUEADO (sem certificado) e R1 esperando 4 (a 219: nada reservado). */
  const bloqueadoComEspera = async (q = 4) => {
    const m = await material();
    const R1 = await esperando(m, q);
    const rec = await receber([[m, 4, 'L1']]);
    assert.strictEqual(await statusLoteDe(m, 'L1'), 'BLOQUEADO', 'premissa: o lote nasce bloqueado sem certificado');
    assert.deepStrictEqual(await reservas(R1), [], 'premissa: a 219 nao reserva o que entrou bloqueado');
    return { m, R1, rec };
  };

  // ── RN-220.01 + .07 + .08 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  let c01 = null;
  await test('[RN-220.01] anexar o certificado libera L1 e reserva os 4 para R1 (TOTALMENTE_RESERVADA); resposta diz o reservado', async () => {
    const { m, R1, rec } = await bloqueadoComEspera();
    const r = await ok(anexar(m, 'L1'));
    assert.strictEqual(r.body.status, 'ATIVO');
    assert.deepStrictEqual(r.body.reservado_para_quem_esperava, RES(4, 1));
    assert.deepStrictEqual(await reservas(R1), [4], 'C480: liberar o lote nao reservou para quem esperava');
    assert.strictEqual(await st(R1), 'TOTALMENTE_RESERVADA', 'o status nao foi recalculado depois de soltar');
    c01 = { m, R1, rec };
  });
  await test('[RN-220.07] a reserva da liberacao: o recebimento do lote (uma nota so, B1467), observacao e motivo literais', async () => {
    assert.ok(c01, 'premissa: RN-220.01 montou o cenario');
    const rs = await dbGet(db, `SELECT rs.id, rs.recebimento_id, rs.observacoes, r.numero FROM reservas_material_almoxarifado rs
      JOIN requisicoes_almoxarifado r ON r.id = rs.requisicao_id WHERE rs.requisicao_id = ? AND rs.status = 'ATIVA'`, [c01.R1]);
    assert.strictEqual(rs.recebimento_id, c01.rec, 'B1467: o lote veio de UMA nota — a reserva leva o recebimento (o estorno dela a solta)');
    assert.strictEqual(rs.observacoes, `Reserva na liberação do lote L1 — requisição ${rs.numero}`);
    const mov = await dbGet(db, "SELECT motivo FROM movimentacoes_almoxarifado WHERE tipo = 'RESERVA' AND reserva_id = ?", [rs.id]);
    assert.strictEqual(mov.motivo, 'Reserva na liberação do lote L1');
  });
  await test('[RN-220.08] o solicitante de R1 recebe o aviso da liberacao do lote com o reservado', async () => {
    assert.ok(c01, 'premissa: RN-220.01 montou o cenario');
    const avs = await avisosReq(c01.R1);
    const e = avs.find((a) => a.corpo_texto.startsWith('O lote L1'));
    assert.ok(e, `sem aviso da liberacao: ${JSON.stringify(avs.map((a) => a.corpo_texto.split('\n')[0]))}`);
    assert.strictEqual(e.corpo_texto.split('\n')[0], 'O lote L1 do material que a sua requisição aguardava foi liberado e está no estoque.');
    assert.ok(e.corpo_texto.includes('reservado para a sua requisição: 4 PC'), e.corpo_texto);
    assert.strictEqual(JSON.parse(e.payload).origem, 'LOTE_LIBERADO');
    // Fase 5 (testes, gap 3): o lote veio de uma nota so (B1467) -> o aviso cita o recebimento
    const numero = (await dbGet(db, 'SELECT numero FROM recebimentos_material_almoxarifado WHERE id = ?', [c01.rec])).numero;
    assert.ok(e.corpo_texto.split('\n').includes(`Recebimento: ${numero}`), e.corpo_texto);
    assert.strictEqual(JSON.parse(e.payload).recebimento_id, c01.rec);
  });
  await test('[RN-220.08 c] (Fase 5) certificado num lote que nao estava bloqueado por certificado: 200, nada reservado, resposta com zeros', async () => {
    const m = await material({ certificado: 0 });
    await entrar(m, 4, 'L1');
    const R1 = await reqDireta(m, 4);
    const r = await ok(anexar(m, 'L1'));
    assert.strictEqual(r.body.status, 'ATIVO');
    assert.deepStrictEqual(r.body.reservado_para_quem_esperava, RES(0, 0));
    assert.deepStrictEqual(await reservas(R1), []);
  });
  await test('[RN-220.01 b] (Fase 5) duas requisicoes dividem o lote: a resposta soma (4) e conta as requisicoes (2)', async () => {
    const m = await material({ certificado: 0 });
    await entrar(m, 4, 'L1');
    await statusLote(m, 'L1', 'BLOQUEADO');
    const R1 = await reqDireta(m, 1);
    // R1 com DOIS itens do mesmo material: tres reservas, duas requisicoes (a conta e de requisicoes, nao de reservas)
    await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,?)', [R1, m.id, 1]);
    const R2 = await reqDireta(m, 2);
    const r = await ok(putStatus(m, 'L1', 'ATIVO'));
    assert.deepStrictEqual(r.body.reservado_para_quem_esperava, RES(4, 2));
    assert.deepStrictEqual([...(await reservas(R1)), ...(await reservas(R2))], [1, 1, 2]);
  });
  await test('[RN-220.08 b] o mesmo lote bloqueado e liberado de novo com R1 ainda esperando gera um 2o aviso (a chave nao engole)', async () => {
    const { m, R1 } = await bloqueadoComEspera(8);
    await statusLote(m, 'L1', 'ATIVO');
    assert.deepStrictEqual(await reservas(R1), [4]);
    await statusLote(m, 'L1', 'BLOQUEADO');
    await receber([[m, 4, 'L1']]);
    assert.deepStrictEqual(await reservas(R1), [4], 'premissa: a 2a nota em L1 bloqueado nao reserva');
    await statusLote(m, 'L1', 'ATIVO');
    assert.deepStrictEqual(await reservas(R1), [4, 4]);
    const n = (await avisosReq(R1)).filter((a) => a.corpo_texto.startsWith('O lote L1')).length;
    assert.strictEqual(n, 2, 'a segunda liberacao foi engolida pela chave de dedupe');
  });

  // ── RN-220.02 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-220.02] PUT status BLOQUEADO -> ATIVO reserva o livre do lote para R1; a resposta e o lote + o reservado', async () => {
    const { m, R1 } = await bloqueadoComEspera();
    const r = await ok(putStatus(m, 'L1', 'ATIVO'));
    assert.strictEqual(r.body.status, 'ATIVO');
    assert.strictEqual(r.body.codigo, 'L1', 'o resto da resposta (o lote) mudou');
    assert.deepStrictEqual(r.body.reservado_para_quem_esperava, RES(4, 1));
    assert.deepStrictEqual(await reservas(R1), [4]);
  });
  await test('[RN-220.02 b] REPROVADO -> ATIVO tambem reserva', async () => {
    const { m, R1 } = await bloqueadoComEspera();
    await statusLote(m, 'L1', 'REPROVADO');
    assert.deepStrictEqual(await reservas(R1), []);
    const r = await ok(putStatus(m, 'L1', 'ATIVO'));
    assert.deepStrictEqual(r.body.reservado_para_quem_esperava, RES(4, 1));
    assert.deepStrictEqual(await reservas(R1), [4]);
  });

  // ── RN-220.03 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-220.03] liberar o vencimento de L1 (ATIVO, vencido) reserva os 4 para R1', async () => {
    const m = await material({ certificado: 0 });
    await entrar(m, 4, 'L1');
    await vencer(m, 'L1');
    const R1 = await esperando(m, 4);
    assert.deepStrictEqual(await reservas(R1), [], 'premissa: a aprovacao nao reserva lote vencido (205)');
    const r = await ok(liberarVenc(m, 'L1'));
    assert.ok(r.body.vencimento_liberado_em, 'o resto da resposta (o lote) mudou');
    assert.deepStrictEqual(r.body.reservado_para_quem_esperava, RES(4, 1));
    assert.deepStrictEqual(await reservas(R1), [4]);
  });

  // ── RN-220.04 (B1463): o gesto que deixa o lote impedido nao distribui — com 4 de ajuste livres em L0 para a sabotagem aparecer ──
  const comAjusteEEspera = async ({ vencido, bloquear = true }) => {
    const m = await material({ certificado: 0 });
    await entrar(m, 4, 'L0');
    await entrar(m, 4, 'L1');
    if (bloquear) await statusLote(m, 'L1', 'BLOQUEADO');
    if (vencido) await vencer(m, 'L1');
    const R1 = await reqDireta(m, 4);
    return { m, R1 };
  };
  await test('[RN-220.04 a] L1 vencido e BLOQUEADO -> ATIVO sem liberar o vencimento: nada reservado (o lote continua impedido)', async () => {
    const { m, R1 } = await comAjusteEEspera({ vencido: true });
    const r = await ok(putStatus(m, 'L1', 'ATIVO'));
    assert.deepStrictEqual(r.body.reservado_para_quem_esperava, RES(0, 0));
    assert.deepStrictEqual(await reservas(R1), [], 'distribuiu o ajuste de L0 no lugar de um lote que continua vencido');
  });
  await test('[RN-220.04 b] liberar o vencimento de L1 vencido e BLOQUEADO: nada reservado', async () => {
    const { m, R1 } = await comAjusteEEspera({ vencido: true });
    const r = await ok(liberarVenc(m, 'L1'));
    assert.deepStrictEqual(r.body.reservado_para_quem_esperava, RES(0, 0));
    assert.deepStrictEqual(await reservas(R1), []);
  });
  await test('[RN-220.04 c] BLOQUEADO -> REPROVADO: nada reservado', async () => {
    const { m, R1 } = await comAjusteEEspera({ vencido: false });
    const r = await ok(putStatus(m, 'L1', 'REPROVADO'));
    assert.deepStrictEqual(r.body.reservado_para_quem_esperava, RES(0, 0));
    assert.deepStrictEqual(await reservas(R1), []);
  });
  await test('[RN-220.04 d] ATIVO -> ATIVO (o lote ja estava liberado): nada reservado', async () => {
    const { m, R1 } = await comAjusteEEspera({ vencido: false, bloquear: false });
    const r = await ok(putStatus(m, 'L1', 'ATIVO'));
    assert.deepStrictEqual(r.body.reservado_para_quem_esperava, RES(0, 0));
    assert.deepStrictEqual(await reservas(R1), [], 'a liberacao de um lote que nada prendia distribuiu o livre do material');
  });

  // ── RN-220.05 (B1462): o teto ─────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-220.05 a] 4 de ajuste em L0 + 4 em L1 bloqueado, R1 pede 8 -> liberar L1 reserva 4 (o livre do lote, nao o do material)', async () => {
    const m = await material({ certificado: 0 });
    await entrar(m, 4, 'L0');
    await entrar(m, 4, 'L1');
    await statusLote(m, 'L1', 'BLOQUEADO');
    const R1 = await reqDireta(m, 8);
    const r = await ok(putStatus(m, 'L1', 'ATIVO'));
    assert.deepStrictEqual(r.body.reservado_para_quem_esperava, RES(4, 1));
    assert.deepStrictEqual(await reservas(R1), [4]);
  });
  await test('[RN-220.05 b] L1 com 4 reservados para R0 antes do bloqueio (B1372), R1 espera 4 -> liberar L1 nao reserva para R1', async () => {
    const m = await material({ certificado: 0 });
    await entrar(m, 4, 'L1');
    const R0 = await criar(m, 4);
    await aprovar(R0);
    assert.deepStrictEqual(await reservas(R0), [4], 'premissa: R0 reservou');
    await statusLote(m, 'L1', 'BLOQUEADO');
    const R1 = await reqDireta(m, 4);
    const r = await ok(putStatus(m, 'L1', 'ATIVO'));
    assert.deepStrictEqual(r.body.reservado_para_quem_esperava, RES(0, 0));
    assert.deepStrictEqual(await reservas(R1), []);
    assert.deepStrictEqual(await reservas(R0), [4]);
  });

  // ── RN-220.06 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-220.06] material sem controle de lote: liberar o lote nao distribui (o lote nunca prendeu nada)', async () => {
    const m = await material({ certificado: 0, controleLote: 0 });
    await entrar(m, 4, 'L1');
    const lt = await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m.id, 'L1']);
    assert.ok(lt, 'premissa: a entrada gravou o lote L1 mesmo sem controle de lote');
    await statusLote(m, 'L1', 'BLOQUEADO');
    const R1 = await reqDireta(m, 4);
    const r = await ok(putStatus(m, 'L1', 'ATIVO'));
    assert.deepStrictEqual(r.body.reservado_para_quem_esperava, RES(0, 0));
    assert.deepStrictEqual(await reservas(R1), []);
  });

  // ── RN-220.09 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-220.09] R1 NORMAL e R2 URGENTE esperam 4; liberar L1 (4) -> R2 leva os 4', async () => {
    const m = await material({ certificado: 0 });
    await entrar(m, 4, 'L1');
    await statusLote(m, 'L1', 'BLOQUEADO');
    const R1 = await reqDireta(m, 4);
    const R2 = await reqDireta(m, 4, { urgencia: 'URGENTE' });
    const r = await ok(putStatus(m, 'L1', 'ATIVO'));
    assert.deepStrictEqual(r.body.reservado_para_quem_esperava, RES(4, 1));
    assert.deepStrictEqual(await reservas(R2), [4]);
    assert.deepStrictEqual(await reservas(R1), []);
  });

  // ── RN-220.10 (B1461): os tres escritores pegam a trava — o espiao ve a mudanca do lote ACONTECER dentro da secao do material ────
  await test('[RN-220.10] status (bloquear e liberar), certificado e vencimento mudam o lote dentro de comLockDoMaterial(material do lote)', async () => {
    const m = await material({ certificado: 1 });
    await receber([[m, 4, 'L1']]);
    const L1 = await loteId(m, 'L1');
    const foto = async () => JSON.stringify(await dbGet(db, 'SELECT status, vencimento_liberado_em FROM lotes_almoxarifado WHERE id = ?', [L1]));
    const orig = trava.comLockDoMaterial;
    const vistos = [];
    trava.comLockDoMaterial = async (mid, fn) => orig(mid, async () => {
      const antes = Number(mid) === m.id ? await foto() : null;
      const r = await fn();
      if (Number(mid) === m.id && antes !== await foto()) vistos.push(mid);
      return r;
    });
    try {
      const gesto = async (nome, p) => {
        vistos.length = 0;
        await ok(p);
        assert.ok(vistos.includes(m.id), `${nome}: o lote mudou fora da trava do material`);
      };
      await gesto('certificado', anexar(m, 'L1'));
      await gesto('bloquear', putStatus(m, 'L1', 'BLOQUEADO'));
      await gesto('liberar', putStatus(m, 'L1', 'ATIVO'));
      await vencer(m, 'L1');
      await gesto('vencimento', liberarVenc(m, 'L1'));
    } finally {
      trava.comLockDoMaterial = orig;
    }
  });

  // ── RN-220.11 (C523): bloquear o lote no meio de uma reserva espera a reserva ───────────────────────────────────────────────────
  /** Gancho em criarReserva que so sinaliza e segura; o gesto concorrente sai do contexto do TESTE (molde do CLAUDE.md). */
  const comGancho = async (materialId, disparar, concorrente) => {
    const orig = stockService.criarReserva;
    let sinal; const chegou = new Promise((r) => { sinal = r; });
    let soltar; const solto = new Promise((r) => { soltar = r; });
    let usado = false;
    stockService.criarReserva = async (...args) => {
      if (!usado && Number(args[2] && args[2].material_id) === materialId) {
        usado = true; sinal(); await solto;
      }
      return orig(...args);
    };
    try {
      const principal = Promise.resolve(disparar()); // supertest so envia no then
      await Promise.race([chegou, esperar(5000).then(() => { throw new Error('premissa: o gancho nao foi atingido'); })]);
      const outro = Promise.resolve(concorrente());
      await esperar(200);
      return { principal, outro, soltar };
    } finally {
      // restaura so depois de soltar: quem chama solta e espera
      setTimeout(() => { stockService.criarReserva = orig; }, 0);
    }
  };
  await test('[RN-220.11 a] nota reservando em L1 ATIVO: o PUT BLOQUEADO disparado no meio espera a reserva (o lote ainda ATIVO no meio)', async () => {
    const m = await material({ certificado: 0 });
    const R1 = await esperando(m, 4);
    const rec = await nota([[m, 4, 'L1']]);
    let doMeio = null;
    const { principal, outro, soltar } = await comGancho(m.id, () => processar(rec), () => putStatus(m, 'L1', 'BLOQUEADO'));
    doMeio = await statusLoteDe(m, 'L1');
    soltar();
    const [a, b] = await Promise.all([principal, outro]);
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    assert.strictEqual(b.status, 200, JSON.stringify(b.body));
    assert.strictEqual(doMeio, 'ATIVO', 'C523: o bloqueio passou no meio da reserva');
    assert.strictEqual(await statusLoteDe(m, 'L1'), 'BLOQUEADO');
    assert.deepStrictEqual(await reservas(R1), [4], 'B1372: a reserva de antes do bloqueio fica');
  });
  await test('[RN-220.11 b] o mesmo pela aprovacao (/aprovar)', async () => {
    const m = await material({ certificado: 0 });
    await entrar(m, 4, 'L1');
    const R1 = await criar(m, 4);
    let doMeio = null;
    const { principal, outro, soltar } = await comGancho(m.id, () => request(app).put(`${API}/requisicoes/${R1}/aprovar`).send({}),
      () => putStatus(m, 'L1', 'BLOQUEADO'));
    doMeio = await statusLoteDe(m, 'L1');
    soltar();
    const [a, b] = await Promise.all([principal, outro]);
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    assert.strictEqual(b.status, 200, JSON.stringify(b.body));
    assert.strictEqual(doMeio, 'ATIVO', 'C523: o bloqueio passou no meio da aprovacao');
    assert.deepStrictEqual(await reservas(R1), [4]);
  });

  // ── RN-220.05 c (Fase 2, achado 3 — fixa a decisao): a reserva antiga conta onde a regra da aprovacao a poe ─────────────────────
  await test('[RN-220.05 c] L0 com 4 de ajuste + L1 com 4 reservados para R0 antes do bloqueio, R1 espera 4 -> liberar L1 reserva 4 para R1 (8 fisicos, 8 reservados)', async () => {
    const m = await material({ certificado: 0 });
    await entrar(m, 4, 'L1');
    const R0 = await criar(m, 4);
    await aprovar(R0);
    assert.deepStrictEqual(await reservas(R0), [4], 'premissa: R0 reservou');
    await statusLote(m, 'L1', 'BLOQUEADO');
    await entrar(m, 4, 'L0');
    const R1 = await reqDireta(m, 4);
    const r = await ok(putStatus(m, 'L1', 'ATIVO'));
    assert.deepStrictEqual(r.body.reservado_para_quem_esperava, RES(4, 1));
    assert.deepStrictEqual(await reservas(R1), [4]);
  });

  // ── RN-220.14 (Fase 2, achado 1; B1467): o estorno da nota solta a reserva da liberacao ───────────────────────────────────────────
  await test('[RN-220.14] nota de 4 em L1 bloqueado -> certificado reserva 4 para R1 -> estornar a nota passa e solta a reserva', async () => {
    const { m, R1, rec } = await bloqueadoComEspera();
    await ok(anexar(m, 'L1'));
    assert.deepStrictEqual(await reservas(R1), [4]);
    const mov = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE tipo = 'ENTRADA_COMPRA' AND recebimento_id = ? AND material_id = ?",
      [rec, m.id]);
    assert.ok(mov, 'premissa: a nota gerou a ENTRADA_COMPRA');
    const c = await request(app).post(`${API}/movimentacoes/${mov.id}/cancelar`).send({ motivo: 'e220 estorno' });
    assert.strictEqual(c.status, 200, `o estorno da nota recusou pela reserva da liberacao: ${JSON.stringify(c.body)}`);
    assert.deepStrictEqual(await reservas(R1), []);
    assert.ok(EM_ESPERA.includes(await st(R1)), `R1 volta a esperar (${await st(R1)})`);
  });
  await test('[RN-220.14 b] lote com duas notas: a reserva da liberacao vai sem recebimento (C524)', async () => {
    const { m, R1 } = await bloqueadoComEspera(8);
    await receber([[m, 4, 'L1']]);
    await statusLote(m, 'L1', 'ATIVO');
    const rs = await dbAll(db, "SELECT recebimento_id FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'", [R1]);
    assert.deepStrictEqual(rs.map((x) => x.recebimento_id), [null]);
  });

  // ── RN-220.15 (Fase 5, B1468): corrigir a validade de um lote vencido para o futuro tambem o libera ─────────────────────────────
  await test('[RN-220.15] L1 ATIVO vencido com 4, R1 espera 4 -> corrigir a validade para o ano que vem reserva 4; corrigir para outro dia vencido nao', async () => {
    const m = await material({ certificado: 0 });
    await entrar(m, 4, 'L1');
    await vencer(m, 'L1');
    const R1 = await esperando(m, 4);
    const L1 = await loteId(m, 'L1');
    const anteontem = diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), -2);
    const ainda = await ok(request(app).put(`${API}/lotes/${L1}/validade`).send({ data_validade: anteontem, validade_vista: ontem, justificativa: 'e220' }));
    assert.deepStrictEqual(ainda.body.reservado_para_quem_esperava, RES(0, 0), 'continua vencido: nada a reservar');
    assert.deepStrictEqual(await reservas(R1), []);
    const futuro = diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), 365);
    const r = await ok(request(app).put(`${API}/lotes/${L1}/validade`).send({ data_validade: futuro, validade_vista: anteontem, justificativa: 'e220' }));
    assert.ok(r.body.lote && Array.isArray(r.body.avisos), 'o resto da resposta ({ lote, avisos }) mudou');
    assert.deepStrictEqual(r.body.reservado_para_quem_esperava, RES(4, 1));
    assert.deepStrictEqual(await reservas(R1), [4], 'o lote desvencido nao reservou para quem esperava');
    assert.strictEqual(await st(R1), 'TOTALMENTE_RESERVADA');
  });

  // ── RN-220.13 (integracao): nota bloqueada -> espera -> certificado -> separar -> entregar ───────────────────────────────────────
  await test('[RN-220.13] o gesto seguinte aceita o que a liberacao reservou: separar 4 e entregar 4 de R1, do lote L1', async () => {
    const { m, R1 } = await bloqueadoComEspera();
    await ok(anexar(m, 'L1'));
    assert.strictEqual(await st(R1), 'TOTALMENTE_RESERVADA');
    const it = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R1])).id;
    await ok(request(app).put(`${API}/requisicoes/${R1}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: 4 }] }));
    await ok(request(app).put(`${API}/requisicoes/${R1}/entregar`).send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 4 }] }));
    const item = await dbGet(db, 'SELECT quantidade_entregue FROM itens_requisicao_almoxarifado WHERE id = ?', [it]);
    assert.strictEqual(Number(item.quantidade_entregue), 4);
    const saldo = await dbGet(db, 'SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado WHERE lote_id = ?', [await loteId(m, 'L1')]);
    assert.strictEqual(Number(saldo.q), 0, 'a entrega nao saiu do lote liberado');
    assert.deepStrictEqual(await reservas(R1), [], 'a reserva da liberacao nao foi consumida pela entrega');
  });

  terminou = true;
  await close();
  console.log(`\n  ${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
