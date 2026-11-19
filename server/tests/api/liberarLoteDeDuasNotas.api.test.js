/**
 * Etapa 247 (C524, B1467) — liberar o lote que veio de mais de uma nota: a reserva da liberacao repartida por nota.
 *
 * Ate a 246 a reserva que a liberacao do lote criava ia SEM a marca da nota quando o lote tinha pecas de duas notas (B1467), e o estorno
 * de qualquer uma delas era recusado ("libere as reservas antes de estornar") — o estorno so solta a reserva com a marca da propria nota
 * (Etapa 74). Agora o livre do lote e repartido pelas notas vivas do lote (a mais nova primeiro, cada uma ate o que entrou por ela; a mais
 * antiga leva a sobra) e cada parte leva a marca da sua nota.
 *
 * Pelas ROTAS (`/lotes/:id/status`, `/lotes/:id/certificado`, `/recebimentos/:id/processar`, `/movimentacoes/:id/cancelar`,
 * `/requisicoes/:id/separar|entregar`, `/reservas`) e pelo SERVICO (`reservarLoteLiberadoSobTrava` sob a trava).
 *
 * Plano: docs/superpowers/plans/2026-11-18-almoxarifado-etapa247-liberar-lote-de-mais-de-uma-nota.md
 * Executar: cd server && node tests/api/liberarLoteDeDuasNotas.api.test.js
 * Regravar a fixture da tela: cd server && CRM_GRAVAR_FIXTURE=1 node tests/api/liberarLoteDeDuasNotas.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const trava = require('../../services/almoxarifado/travaPorMaterial');
const reservaChegada = require('../../services/almoxarifado/reservaChegadaService');

const FIXTURE = path.join(__dirname, '..', '..', '..', 'client', 'src', 'components', 'almoxarifado', '__fixtures__',
  'reservaDaNotaDoServidor.json');
const GRAVAR = process.env.CRM_GRAVAR_FIXTURE === '1';

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}

const ADMIN = { id: 1, nome: 'Adm 247', role: 'admin', is_superadmin: 1, email: 'a247@t.com' };
const API = '/api/almoxarifado';
const EM_ESPERA = ['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'];
const PNG = Buffer.from('89504E470D0A1A0A0000000D4948445200000001000000010806000000', 'hex');
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 247: liberar o lote de mais de uma nota reparte a reserva por nota (C524) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');
  await cfg('notificar_recebimento_entrada', '1');
  await cfg('notificar_recebimento_solicitante', '1');
  await cfg('notificacoes_dest_recebimento', 'almox247@t.com');
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [1, 'Sol 247', 's247@t.com']);
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, cliente_id INTEGER,
    tipo_os TEXT NOT NULL DEFAULT 'producao', status TEXT DEFAULT 'pendente', data_abertura DATE NOT NULL DEFAULT '2026-11-13')`);

  const material = async ({ certificado = 1, critico = 0 } = {}) => {
    const c = `E247-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, controle_certificado)
        VALUES (?, ?, 'PC', 0, 0, 1, ?, 0.1, 1, 0, ?)`, [c, `Mat ${c}`, critico, certificado])).lastID;
    return { id, codigo: c };
  };
  const loteId = async (m, codigo = 'L1') => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const putStatus = async (m, st, codigo = 'L1') => ok(request(app).put(`${API}/lotes/${await loteId(m, codigo)}/status`)
    .send({ status: st, justificativa: 'teste 247' }));
  const anexar = async (m, codigo = 'L1') => ok(request(app).post(`${API}/lotes/${await loteId(m, codigo)}/certificado`)
    .attach('certificado', PNG, { filename: 'c.png', contentType: 'image/png' }));
  const reqDireta = async (m, q) => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo)
      VALUES (?, 1, 'Sol 247', 'AGUARDANDO_ESTOQUE', 'NORMAL', ?, 1)`,
    [`REQ-E247-${++seq}`, `2026-11-01 10:${String(seq % 60).padStart(2, '0')}:00`])).lastID;
    await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,?)',
      [id, m.id, q]);
    return id;
  };
  const nota = async (m, q, lote = 'L1', osId = null) => {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota, os_id)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F247', '2026-11-01', '2026-11-02', 10, ?)`, [`REC-E247-${++seq}`, `NF-E247-${seq}`, osId])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote) VALUES (?,?,?,?,?)`, [r, m.id, q, q, lote]);
    await ok(request(app).post(`${API}/recebimentos/${r}/processar`).send({}));
    return r;
  };
  const movDaNota = async (m, rec) => (await dbGet(db, `SELECT id FROM movimentacoes_almoxarifado
    WHERE tipo = 'ENTRADA_COMPRA' AND recebimento_id = ? AND material_id = ?`, [rec, m.id])).id;
  const estornar = async (m, rec) => request(app).post(`${API}/movimentacoes/${await movDaNota(m, rec)}/cancelar`)
    .send({ motivo: 'e247 estorno' });
  /** Reservas ATIVAS de R: [[quantidade, recebimento_id], ...] na ordem de criacao. */
  const reservas = async (R) => (await dbAll(db, `SELECT quantidade - COALESCE(quantidade_utilizada, 0) AS q, recebimento_id
    FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA' ORDER BY id`, [R]))
    .map((x) => [Number(x.q), x.recebimento_id == null ? null : Number(x.recebimento_id)]);
  const st = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
  /** L1 bloqueado (certificado) com a nota A (4) e a nota B (4); R1 espera `q`. */
  const duasNotas = async (q = 8) => {
    const m = await material();
    const R1 = await reqDireta(m, q);
    const A = await nota(m, 4);
    const B = await nota(m, 4);
    assert.strictEqual((await dbGet(db, 'SELECT status FROM lotes_almoxarifado WHERE id = ?', [await loteId(m)])).status, 'BLOQUEADO',
      'premissa: o lote nasce bloqueado sem certificado');
    assert.deepStrictEqual(await reservas(R1), [], 'premissa: nada reservado sobre o lote bloqueado');
    return { m, R1, A, B };
  };

  // ── RN-247.01 / .02 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  let c01 = null;
  await test('[RN-247.01] L1 com A (4) e B (4), R1 espera 8 -> liberar: duas reservas, 4 de B e 4 de A; a resposta soma 8', async () => {
    const { m, R1, A, B } = await duasNotas();
    const r = await anexar(m);
    assert.deepStrictEqual(r.body.reservado_para_quem_esperava, { quantidade: 8, unidade: 'PC', requisicoes: 1 });
    assert.deepStrictEqual(await reservas(R1), [[4, B], [4, A]], 'C524: a reserva da liberacao nao foi repartida por nota');
    assert.strictEqual(await st(R1), 'TOTALMENTE_RESERVADA');
    c01 = { m, R1, A, B };
  });
  await test('[RN-247.02] depois da liberacao: estornar B -> 200 (sai a reserva de B, fica a de A); estornar A -> 200', async () => {
    assert.ok(c01, 'premissa: RN-247.01 montou o cenario');
    const { m, R1, A, B } = c01;
    const cb = await estornar(m, B);
    assert.strictEqual(cb.status, 200, `C524: o estorno de B recusou: ${JSON.stringify(cb.body)}`);
    assert.deepStrictEqual(await reservas(R1), [[4, A]]);
    assert.ok(EM_ESPERA.includes(await st(R1)) || (await st(R1)) === 'PARCIALMENTE_RESERVADA', `R1 volta a esperar (${await st(R1)})`);
    const ca = await estornar(m, A);
    assert.strictEqual(ca.status, 200, `C524: o estorno de A recusou: ${JSON.stringify(ca.body)}`);
    assert.deepStrictEqual(await reservas(R1), []);
    assert.ok(EM_ESPERA.includes(await st(R1)), `R1 volta a esperar (${await st(R1)})`);
    const fis = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    assert.strictEqual(Number(fis.quantidade_atual), 0);
  });

  // ── RN-247.03 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-247.03] R1 espera 5: B leva 4, A leva 1; estornar A -> 200 (solta 1); estornar B -> 200', async () => {
    const { m, R1, A, B } = await duasNotas(5);
    await anexar(m);
    assert.deepStrictEqual(await reservas(R1), [[4, B], [1, A]]);
    const ca = await estornar(m, A);
    assert.strictEqual(ca.status, 200, JSON.stringify(ca.body));
    assert.deepStrictEqual(await reservas(R1), [[4, B]], 'o estorno de A soltou mais do que a parte de A');
    const cb = await estornar(m, B);
    assert.strictEqual(cb.status, 200, JSON.stringify(cb.body));
    assert.deepStrictEqual(await reservas(R1), []);
  });

  // ── RN-247.04 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-247.04] B (a mais nova) estornada com o lote bloqueado nao conta: liberar -> a reserva de 4 leva a marca de A; o aviso cita A', async () => {
    const { m, R1, A, B } = await duasNotas();
    const cb = await estornar(m, B);
    assert.strictEqual(cb.status, 200, `premissa: estornar B com o lote bloqueado (${JSON.stringify(cb.body)})`);
    await anexar(m);
    assert.deepStrictEqual(await reservas(R1), [[4, A]], 'a nota estornada contou como nota do lote');
    const numeroA = (await dbGet(db, 'SELECT numero FROM recebimentos_material_almoxarifado WHERE id = ?', [A])).numero;
    const av = await dbAll(db, `SELECT corpo_texto FROM fila_notificacoes_almoxarifado WHERE evento = 'RECEBIMENTO_ENTRADA_REQUISITANTE'
      AND json_extract(payload, '$.requisicao_id') = ? AND json_extract(payload, '$.origem') = 'LOTE_LIBERADO'`, [R1]);
    assert.strictEqual(av.length, 1, 'premissa: o aviso da liberacao do lote saiu');
    assert.ok(av[0].corpo_texto.split('\n').includes(`Recebimento: ${numeroA}`), `lote de uma nota viva: o aviso cita A (${av[0].corpo_texto})`);
    const ca = await estornar(m, A);
    assert.strictEqual(ca.status, 200, JSON.stringify(ca.body));
    assert.deepStrictEqual(await reservas(R1), []);
  });

  // ── RN-247.05 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-247.05] L1 com a nota A (4) e uma entrada avulsa (4), R1 espera 8 -> as 8 com a marca de A; estornar A -> 200', async () => {
    const m = await material({ certificado: 0 });
    await ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'ENTRADA', quantidade: 4, motivo: 'e247', lote: 'L1' }), 201);
    const A = await nota(m, 4);
    await putStatus(m, 'BLOQUEADO');
    const R1 = await reqDireta(m, 8);
    await putStatus(m, 'ATIVO');
    assert.deepStrictEqual(await reservas(R1), [[8, A]]);
    const ca = await estornar(m, A);
    assert.strictEqual(ca.status, 200, JSON.stringify(ca.body));
    assert.deepStrictEqual(await reservas(R1), [[4, A]]);
  });

  // ── RN-247.05 b: o lote liberado de novo com reserva antiga ──────────────────────────────────────────────────────────────────────
  await test('[RN-247.05 b] liberado, bloqueado e liberado de novo com a nota C nova: a 2a liberacao marca so o que e de C', async () => {
    const m = await material({ certificado: 0 });
    const A = await nota(m, 4);
    await putStatus(m, 'BLOQUEADO');
    const R1 = await reqDireta(m, 8);
    await putStatus(m, 'ATIVO');
    assert.deepStrictEqual(await reservas(R1), [[4, A]]);
    await putStatus(m, 'BLOQUEADO');
    const C = await nota(m, 4);
    await putStatus(m, 'ATIVO');
    assert.deepStrictEqual(await reservas(R1), [[4, A], [4, C]]);
    const cc = await estornar(m, C);
    assert.strictEqual(cc.status, 200, JSON.stringify(cc.body));
    assert.deepStrictEqual(await reservas(R1), [[4, A]]);
  });

  await test('[RN-247.05 c] A e C no lote; R1 (4) leva a de C; bloqueado e liberado de novo para R2 (4): a cota de C ja esta reservada -> R2 leva a de A; estornar A -> 200', async () => {
    const m = await material({ certificado: 0 });
    const A = await nota(m, 4);
    const C = await nota(m, 4);
    await putStatus(m, 'BLOQUEADO');
    const R1 = await reqDireta(m, 4);
    await putStatus(m, 'ATIVO');
    assert.deepStrictEqual(await reservas(R1), [[4, C]]);
    await putStatus(m, 'BLOQUEADO');
    const R2 = await reqDireta(m, 4);
    await putStatus(m, 'ATIVO');
    assert.deepStrictEqual(await reservas(R2), [[4, A]], 'a 2a liberacao marcou de novo a nota C (a cota dela ja estava reservada)');
    const ca = await estornar(m, A);
    assert.strictEqual(ca.status, 200, JSON.stringify(ca.body));
    assert.deepStrictEqual(await reservas(R2), []);
    assert.deepStrictEqual(await reservas(R1), [[4, C]]);
  });

  // ── RN-247.08 (integracao pela rota)──────────────────────────────────────────────────────────────────────────────────────────────
  // Fase 2 (achados 1b, 2 e 3)
  await test('[RN-247.09] (Fase 2, 1b) B da OS deixa 4 em reserva da OS sobre L1, A geral 4, R1 geral espera 8 -> R1 leva 4 com a marca de A; estornar A -> 200', async () => {
    const numeroOs = `OS-E247-${++seq}`;
    const osId = (await dbRun(db, "INSERT INTO ordens_servico (numero_os, status) VALUES (?, 'em_andamento')", [numeroOs])).lastID;
    const m = await material();
    const A = await nota(m, 4);
    await nota(m, 4, 'L1', osId);
    const daOs = async () => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade - COALESCE(quantidade_utilizada,0)),0) q
      FROM reservas_material_almoxarifado WHERE status = 'ATIVA' AND origem = 'MANUAL' AND os_id = ? AND material_id = ?`, [osId, m.id])).q);
    assert.strictEqual(await daOs(), 4, 'premissa: a nota da OS reservou para a OS sobre o lote bloqueado');
    const R1 = await reqDireta(m, 8);
    await anexar(m);
    assert.deepStrictEqual(await reservas(R1), [[4, A]], 'a cota de B ja estava na reserva da OS e foi marcada de novo');
    const ca = await estornar(m, A);
    assert.strictEqual(ca.status, 200, JSON.stringify(ca.body));
    assert.deepStrictEqual(await reservas(R1), []);
    assert.strictEqual(await daOs(), 4);
  });
  await test('[RN-247.10] (Fase 2, 2) A aprovada na inspecao e B ainda em inspecao no mesmo lote, R1 espera 8 -> liberar: 4 com a marca de A; estornar A -> 200', async () => {
    await cfg('inspecao_material_critico', '1');
    try {
      const m = await material({ critico: 1 });
      const A = await nota(m, 4);
      const itA = await dbGet(db, 'SELECT id, quantidade_em_inspecao FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [A]);
      assert.strictEqual(Number(itA.quantidade_em_inspecao), 4, 'premissa: critico entra retido');
      await ok(request(app).post(`${API}/recebimentos/itens/${itA.id}/inspecionar`).send({ quantidade_aprovada: 4, quantidade_reprovada: 0 }), 201);
      const B = await nota(m, 4);
      const itB = await dbGet(db, 'SELECT quantidade_em_inspecao FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [B]);
      assert.strictEqual(Number(itB.quantidade_em_inspecao), 4, 'premissa: B em inspecao');
      const R1 = await reqDireta(m, 8);
      await anexar(m);
      assert.deepStrictEqual(await reservas(R1), [[4, A]], 'a parte de B em inspecao contou na cota de B');
      const ca = await estornar(m, A);
      assert.strictEqual(ca.status, 200, JSON.stringify(ca.body));
      assert.deepStrictEqual(await reservas(R1), []);
    } finally {
      await cfg('inspecao_material_critico', '0');
    }
  });
  await test('[RN-247.10 b] (Fase 2, 2) B (a mais nova) com 2 reprovados nunca se estorna e fica sem cota: R1 espera 6 -> 6 com a marca de A; estornar A -> 200', async () => {
    await cfg('inspecao_material_critico', '1');
    try {
      const m = await material({ critico: 1 });
      const A = await nota(m, 4);
      const itA = await dbGet(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [A]);
      await ok(request(app).post(`${API}/recebimentos/itens/${itA.id}/inspecionar`).send({ quantidade_aprovada: 4, quantidade_reprovada: 0 }), 201);
      const B = await nota(m, 4);
      const itB = await dbGet(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [B]);
      await ok(request(app).post(`${API}/recebimentos/itens/${itB.id}/inspecionar`)
        .send({ quantidade_aprovada: 2, quantidade_reprovada: 2, encaminhamento: 'DEVOLVER' }), 201);
      const R1 = await reqDireta(m, 6);
      await anexar(m);
      assert.deepStrictEqual(await reservas(R1), [[6, A]], 'a nota com reprovado (inestornavel) ficou com cota');
      const ca = await estornar(m, A);
      assert.strictEqual(ca.status, 200, JSON.stringify(ca.body));
      assert.deepStrictEqual(await reservas(R1), [[2, A]]);
    } finally {
      await cfg('inspecao_material_critico', '0');
    }
  });
  await test('[RN-247.11] (Fase 2, 3) o estorno de A com o claim gravado e ainda nao concluido: A conta como viva (a reserva reparte A e B)', async () => {
    const { m, R1, A, B } = await duasNotas();
    const movA = await movDaNota(m, A);
    await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET cancelado = 1 WHERE id = ?', [movA]);
    try {
      await anexar(m);
    } finally {
      await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET cancelado = 0 WHERE id = ?', [movA]);
    }
    assert.deepStrictEqual(await reservas(R1), [[4, B], [4, A]], 'o claim provisorio do estorno de A tirou A das notas do lote');
    const ca = await estornar(m, A);
    assert.strictEqual(ca.status, 200, JSON.stringify(ca.body));
  });

  await test('[RN-247.08] o gesto seguinte: separar 8 e entregar 8 de R1 consome as duas reservas e esvazia L1', async () => {
    const { m, R1 } = await duasNotas();
    await anexar(m);
    const it = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R1])).id;
    await ok(request(app).put(`${API}/requisicoes/${R1}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: 8 }] }));
    await ok(request(app).put(`${API}/requisicoes/${R1}/entregar`).send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 8 }] }));
    assert.deepStrictEqual(await reservas(R1), [], 'sobrou reserva ATIVA depois da entrega');
    const saldo = await dbGet(db, 'SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado WHERE lote_id = ?', [await loteId(m)]);
    assert.strictEqual(Number(saldo.q), 0);
  });

  // ── RN-247.08 b (pelo servico) ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-247.08 b] pelo servico, sob a trava: reservarLoteLiberadoSobTrava reparte (B 4, A 4)', async () => {
    const m = await material({ certificado: 0 });
    const A = await nota(m, 4);
    const B = await nota(m, 4);
    await putStatus(m, 'BLOQUEADO');
    const R1 = await reqDireta(m, 8);
    const L1 = await loteId(m);
    await dbRun(db, "UPDATE lotes_almoxarifado SET status = 'ATIVO' WHERE id = ?", [L1]);
    const lote = await dbGet(db, 'SELECT * FROM lotes_almoxarifado WHERE id = ?', [L1]);
    const r = await trava.comLockDoMaterial(m.id, () => reservaChegada.reservarLoteLiberadoSobTrava(db, ADMIN, lote, null));
    assert.strictEqual(r.reservas.reduce((s, x) => s + Number(x.quantidade), 0), 8);
    assert.deepStrictEqual(await reservas(R1), [[4, B], [4, A]]);
  });

  // ── RN-247.07 (fatia visivel): a lista de reservas diz a nota ───────────────────────────────────────────────────────────────────
  await test('[RN-247.07] GET /reservas traz recebimento_numero e recebimento_nota_fiscal (null sem nota); a fixture da tela bate', async () => {
    const { m, R1, B } = await duasNotas();
    await anexar(m);
    const r = await ok(request(app).get(`${API}/reservas`).query({ material_id: m.id, status: 'ATIVA' }));
    const daB = r.body.find((x) => Number(x.requisicao_id) === R1 && Number(x.recebimento_id) === B);
    assert.ok(daB, `sem a reserva de B: ${JSON.stringify(r.body)}`);
    const recB = await dbGet(db, 'SELECT numero, nota_fiscal FROM recebimentos_material_almoxarifado WHERE id = ?', [B]);
    assert.strictEqual(daB.recebimento_numero, recB.numero);
    assert.strictEqual(daB.recebimento_nota_fiscal, recB.nota_fiscal);
    // a reserva sem nota: os dois campos vem null (a metade positiva: a reserva existe e esta na lista)
    const m2 = await material({ certificado: 0 });
    await ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m2.id, tipo: 'ENTRADA', quantidade: 4, motivo: 'e247', lote: 'L1' }), 201);
    await ok(request(app).post(`${API}/reservas`).send({ material_id: m2.id, quantidade: 1, os_referencia: 'OS-247', justificativa: 'e247' }), 201);
    const r2 = await ok(request(app).get(`${API}/reservas`).query({ material_id: m2.id }));
    assert.strictEqual(r2.body.length, 1, JSON.stringify(r2.body));
    assert.strictEqual(r2.body[0].recebimento_numero, null);
    assert.strictEqual(r2.body[0].recebimento_nota_fiscal, null);
    if (GRAVAR) {
      fs.writeFileSync(FIXTURE, `${JSON.stringify(daB, null, 2)}\n`);
      console.log(`  (fixture regravada: ${FIXTURE})`);
    }
    assert.ok(fs.existsSync(FIXTURE), `fixture ausente: ${FIXTURE} (gere com CRM_GRAVAR_FIXTURE=1)`);
    const fx = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    assert.deepStrictEqual(Object.keys(fx).sort(), Object.keys(daB).sort(), 'a fixture da tela nao tem as chaves da rota — regrave');
    assert.strictEqual(typeof fx.recebimento_numero, 'string');
    assert.strictEqual(typeof fx.recebimento_nota_fiscal, 'string');
  });

  terminou = true;
  await close();
  console.log(`\n  ${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
