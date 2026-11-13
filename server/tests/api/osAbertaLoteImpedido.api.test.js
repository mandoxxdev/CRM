/**
 * Etapa 230 (C520) — a fila da OS aberta recebe so o que pode sair.
 *
 * A nota (e a inspecao/NC) de pedido com OS aberta dava a fila da OS peca de lote bloqueado, sem o desconto do lote (B1455/B1510): a
 * requisicao da OS ficava Reservada com o que so sai depois do certificado. Agora a fila da OS recebe so o que esta entrada trouxe fora de
 * lote impedido (B1513); o resto vai para a reserva da OS, como antes. Liberar o lote passa a reserva da OS daquela nota para a requisicao
 * da OS que espera (B1514). O estorno perde a excecao da OS (B1515).
 *
 * Pelas ROTAS: a nota por `/recebimentos/:id/processar`, a inspecao por `/recebimentos/itens/:id/inspecionar`, o lote por
 * `/lotes/:id/status`, o estorno por `/movimentacoes/:id/cancelar`, a separacao por `/requisicoes/:id/separar`.
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa230-os-aberta-lote-impedido.md
 * Executar: cd server && node tests/api/osAbertaLoteImpedido.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}

const ADMIN = { id: 1, nome: 'Adm 230', role: 'admin', is_superadmin: 1, email: 'a230@t.com' };
const SOL = { id: 23001, nome: 'Solic 230', role: 'admin', is_superadmin: 1, email: 's230@t.com' };
const API = '/api/almoxarifado';
const MOTIVO_CONVERSAO = (os, lote) => `Reserva da OS ${os} passada à requisição da OS na liberação do lote ${lote}`;
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 230: a fila da OS aberta recebe so o que pode sair (C520) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');
  await cfg('inspecao_material_critico', '1');
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [SOL.id, SOL.nome, SOL.email]);
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS projetos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)');
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, cliente_id INTEGER,
    tipo_os TEXT NOT NULL DEFAULT 'producao', status TEXT DEFAULT 'pendente', data_abertura DATE NOT NULL DEFAULT '2026-11-13')`);

  const novaOs = async () => {
    const numero = `OS-E230-${++seq}`;
    return { id: (await dbRun(db, "INSERT INTO ordens_servico (numero_os, status) VALUES (?, 'em_andamento')", [numero])).lastID, numero };
  };
  const material = async ({ critico = 0, certificado = 1, controleLote = 1 } = {}) => {
    const c = `E230-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, controle_certificado)
        VALUES (?, ?, 'PC', 0, 0, 1, ?, 0.1, ?, 0, ?)`, [c, `Mat ${c}`, critico, controleLote, certificado])).lastID;
    return { id, codigo: c, nome: `Mat ${c}` };
  };
  const entrar = (m, q, lote) => ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'ENTRADA',
    quantidade: q, motivo: 'e230', lote }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const statusLote = async (m, codigo, st) => ok(request(app).put(`${API}/lotes/${await loteId(m, codigo)}/status`)
    .send({ status: st, justificativa: 'teste 230' }));
  const statusLoteDe = async (m, codigo) => (await dbGet(db, 'SELECT status FROM lotes_almoxarifado WHERE id = ?',
    [await loteId(m, codigo)])).status;
  const reqDireta = async (m, q, os = null) => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo, os_id, os_referencia)
      VALUES (?, ?, ?, 'AGUARDANDO_ESTOQUE', 'NORMAL', ?, 1, ?, ?)`,
    [`REQ-E230-${++seq}`, SOL.id, SOL.nome, `2026-11-01 10:${String(seq % 60).padStart(2, '0')}:00`,
      os ? os.id : null, os ? os.numero : null])).lastID;
    await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,?)',
      [id, m.id, q]);
    return id;
  };
  const st = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
  const reservas = async (R) => (await dbAll(db, `SELECT quantidade - COALESCE(quantidade_utilizada,0) AS q FROM reservas_material_almoxarifado
    WHERE requisicao_id = ? AND status = 'ATIVA' ORDER BY id`, [R])).map((x) => Number(x.q));
  const daOs = async (os, m) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade - COALESCE(quantidade_utilizada,0)),0) q
    FROM reservas_material_almoxarifado WHERE status = 'ATIVA' AND origem = 'MANUAL' AND os_id = ? AND material_id = ?`, [os.id, m.id])).q);
  const linhasDaOs = (os, m) => dbAll(db, `SELECT id, status, quantidade, motivo_liberacao FROM reservas_material_almoxarifado
    WHERE origem = 'MANUAL' AND os_id = ? AND material_id = ? ORDER BY id`, [os.id, m.id]);
  const nota = async (linhas, extra = {}) => {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota, os_id)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F230', '2026-11-01', '2026-11-02', 10, ?)`, [`REC-E230-${++seq}`, `NF-E230-${seq}`,
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
    return rec;
  };
  const itemRec = (rec, m) => dbGet(db, `SELECT id, lote_id, quantidade_em_inspecao FROM recebimentos_material_itens_almoxarifado
    WHERE recebimento_id = ? AND material_id = ?`, [rec, m.id]);
  const inspecionar = (itemId, a, r) => request(app).post(`${API}/recebimentos/itens/${itemId}/inspecionar`)
    .send({ quantidade_aprovada: a, quantidade_reprovada: r, encaminhamento: r > 0 ? 'DEVOLVER' : undefined });
  const movDoLote = async (rec, m, codigo) => {
    const x = await dbGet(db, `SELECT id FROM movimentacoes_almoxarifado
      WHERE tipo = 'ENTRADA_COMPRA' AND recebimento_id = ? AND material_id = ? AND lote_id = ?`, [rec, m.id, await loteId(m, codigo)]);
    assert.ok(x, `premissa: a nota gravou uma ENTRADA_COMPRA no lote ${codigo}`);
    return x.id;
  };
  const estornar = (movId) => request(app).post(`${API}/movimentacoes/${movId}/cancelar`).send({ motivo: 'estorno e230' });

  // ── RN-230.01 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  let cenario01 = null;
  await test('[RN-230.01] nota com OS aberta, 4 em L1 BLOQUEADO, R1 da OS espera 4 -> R1 sem reserva, reserva da OS 4', async () => {
    const os = await novaOs();
    const m = await material();
    const R1 = await reqDireta(m, 4, os);
    const rec = await receber([[m, 4, 'L1']], { os_id: os.id });
    assert.strictEqual(await statusLoteDe(m, 'L1'), 'BLOQUEADO', 'premissa: sem certificado o lote nasce bloqueado');
    assert.deepStrictEqual(await reservas(R1), [], 'a fila da OS recebeu peca de lote bloqueado (B1455 revogada)');
    assert.strictEqual(await st(R1), 'AGUARDANDO_ESTOQUE');
    assert.strictEqual(await daOs(os, m), 4, 'a peca comprada para a OS ficou fora da reserva da OS');
    cenario01 = { os, m, R1, rec };
  });

  // ── RN-230.06 / .11 (integracao: nota -> lote -> separacao) ───────────────────────────────────────────────────────────────────
  await test('[RN-230.06] depois da .01, liberar L1 -> R1 com 4 (TOTALMENTE_RESERVADA, com a nota), reserva da OS 0, resposta conta 4', async () => {
    assert.ok(cenario01, 'premissa: RN-230.01 montou o cenario');
    const { os, m, R1, rec } = cenario01;
    const r = await statusLote(m, 'L1', 'ATIVO');
    assert.deepStrictEqual(await reservas(R1), [4], 'liberar o lote nao passou a reserva da OS para a requisicao da OS');
    assert.strictEqual(await st(R1), 'TOTALMENTE_RESERVADA');
    assert.strictEqual(await daOs(os, m), 0);
    const rsR1 = await dbGet(db, "SELECT recebimento_id FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'", [R1]);
    assert.strictEqual(Number(rsR1.recebimento_id), rec, 'a reserva de R1 sem a nota (o estorno nao a acharia)');
    assert.deepStrictEqual(r.body.reservado_para_quem_esperava, { quantidade: 4, unidade: 'PC', requisicoes: 1 });
    const linhas = await linhasDaOs(os, m);
    assert.deepStrictEqual(linhas.map((l) => [l.status, l.motivo_liberacao]), [['LIBERADA', MOTIVO_CONVERSAO(os.numero, 'L1')]]);
  });
  await test('[RN-230.11] depois da .06, separar 4 de R1 -> 200', async () => {
    const { R1 } = cenario01;
    const it = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R1])).id;
    await ok(request(app).put(`${API}/requisicoes/${R1}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: 4 }] }));
    assert.strictEqual(Number((await dbGet(db, 'SELECT quantidade_separada q FROM itens_requisicao_almoxarifado WHERE id = ?', [it])).q), 4);
  });

  // ── RN-230.02 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-230.02] nota com OS, 3 em L2 ATIVO + 4 em L1 BLOQUEADO, R1 da OS espera 4 -> R1 com 3, reserva da OS 4', async () => {
    const os = await novaOs();
    const m = await material({ certificado: 0 });
    await entrar(m, 1, 'L1');
    await statusLote(m, 'L1', 'BLOQUEADO');
    const R1 = await reqDireta(m, 4, os);
    await receber([[m, 3, 'L2'], [m, 4, 'L1']], { os_id: os.id });
    assert.strictEqual(await statusLoteDe(m, 'L2'), 'ATIVO', 'premissa');
    assert.deepStrictEqual(await reservas(R1), [3], 'a fila da OS levou alem do que pode sair');
    assert.strictEqual(await daOs(os, m), 4);
  });

  // ── RN-230.03 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-230.03] o avulso bom de outra entrada nao entra no lugar das pecas bloqueadas da nota da OS', async () => {
    const os = await novaOs();
    const m = await material({ certificado: 0 });
    await entrar(m, 4, 'L0');
    const R1 = await reqDireta(m, 4, os);
    const rec = await nota([[m, 4, 'L1']], { os_id: os.id });
    // O L1 nasce ATIVO sem certificado exigido: bloqueia-se o L1 antes de processar (o lote ja existe com saldo 0).
    await entrar(m, 1, 'L1');
    await statusLote(m, 'L1', 'BLOQUEADO');
    await ok(request(app).post(`${API}/recebimentos/${rec}/processar`).send({}));
    assert.strictEqual(await statusLoteDe(m, 'L1'), 'BLOQUEADO', 'premissa');
    assert.deepStrictEqual(await reservas(R1), [], 'a fila da OS levou o avulso de L0 no lugar das pecas bloqueadas');
    assert.strictEqual(await daOs(os, m), 4);
  });

  // ── RN-230.04 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-230.04 a controle] L1 ATIVO -> R1 da OS com 4, reserva da OS 0', async () => {
    const os = await novaOs();
    const m = await material({ certificado: 0 });
    const R1 = await reqDireta(m, 4, os);
    await receber([[m, 4, 'L1']], { os_id: os.id });
    assert.deepStrictEqual(await reservas(R1), [4]);
    assert.strictEqual(await daOs(os, m), 0);
  });
  await test('[RN-230.04 b] sem controle de lote (certificado exigido) -> R1 da OS com 4 (B1371)', async () => {
    const os = await novaOs();
    const m = await material({ controleLote: 0 });
    const R1 = await reqDireta(m, 4, os);
    await receber([[m, 4, 'L1']], { os_id: os.id });
    assert.deepStrictEqual(await reservas(R1), [4]);
  });

  // ── RN-230.05 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const montarInspecao = async ({ certificado = 1 } = {}) => {
    const os = await novaOs();
    const m = await material({ critico: 1, certificado });
    const R1 = await reqDireta(m, 4, os);
    const rec = await receber([[m, 4, 'L1']], { os_id: os.id });
    const it = await itemRec(rec, m);
    assert.strictEqual(Number(it.quantidade_em_inspecao), 4, 'premissa: critico entra retido');
    await entrar(m, 4, 'L0');
    assert.deepStrictEqual(await reservas(R1), [], 'premissa');
    return { os, m, R1, rec, it };
  };
  await test('[RN-230.05] inspecao de nota com OS, L1 BLOQUEADO, 4 em L0 -> R1 sem reserva, reserva da OS 4, lote_impedido L1', async () => {
    const c = await montarInspecao();
    assert.strictEqual(await statusLoteDe(c.m, 'L1'), 'BLOQUEADO', 'premissa');
    const r = await ok(inspecionar(c.it.id, 4, 0), 201);
    assert.deepStrictEqual(await reservas(c.R1), [], 'a fila da OS recebeu o que nao pode sair (B1510 revogada)');
    assert.strictEqual(await daOs(c.os, c.m), 4);
    assert.strictEqual(r.body.lote_impedido, 'L1');
  });
  await test('[RN-230.05 controle] o mesmo com L1 ATIVO -> R1 com 4, sem lote_impedido', async () => {
    const c = await montarInspecao({ certificado: 0 });
    const r = await ok(inspecionar(c.it.id, 4, 0), 201);
    assert.deepStrictEqual(await reservas(c.R1), [4]);
    assert.strictEqual(r.body.lote_impedido, undefined);
  });

  // ── RN-230.07 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-230.07] liberar o lote sem requisicao da OS esperando: a reserva da OS fica intacta; R2 sem OS nao leva', async () => {
    const os = await novaOs();
    const m = await material();
    await receber([[m, 4, 'L1']], { os_id: os.id });
    const antes = await linhasDaOs(os, m);
    assert.deepStrictEqual(antes.map((l) => [l.status, Number(l.quantidade)]), [['ATIVA', 4]], 'premissa');
    const R2 = await reqDireta(m, 4);
    const r = await statusLote(m, 'L1', 'ATIVO');
    assert.deepStrictEqual((await linhasDaOs(os, m)).map((l) => [l.id, l.status, Number(l.quantidade)]),
      [[antes[0].id, 'ATIVA', 4]], 'a reserva da OS foi solta e recriada sem ninguem da OS esperando');
    const lib = await dbGet(db, "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE reserva_id = ? AND tipo = 'LIBERACAO_RESERVA'", [antes[0].id]);
    assert.strictEqual(Number(lib.n), 0);
    assert.deepStrictEqual(await reservas(R2), [], 'a peca da OS foi para outra requisicao');
    assert.strictEqual(r.body.reservado_para_quem_esperava.quantidade, 0);
  });

  // ── RN-230.08 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-230.08] R1 da OS espera 2, R2 sem OS espera 4: liberar L1 -> R1 com 2, reserva da OS 2, R2 sem reserva', async () => {
    const os = await novaOs();
    const m = await material();
    const R1 = await reqDireta(m, 2, os);
    const R2 = await reqDireta(m, 4);
    await receber([[m, 4, 'L1']], { os_id: os.id });
    assert.deepStrictEqual([await reservas(R1), await daOs(os, m)], [[], 4], 'premissa');
    await statusLote(m, 'L1', 'ATIVO');
    assert.deepStrictEqual(await reservas(R1), [2]);
    assert.strictEqual(await daOs(os, m), 2, 'a conversao soltou alem da falta da fila da OS');
    assert.deepStrictEqual(await reservas(R2), [], 'a sobra da OS foi para a fila geral');
    assert.deepStrictEqual((await linhasDaOs(os, m)).map((l) => [l.status, Number(l.quantidade)]), [['ATIVA', 2]],
      'a conversao soltou a reserva da OS inteira e recriou a sobra (solta so a falta da fila da OS)');
  });
  await test('[RN-230.08 b] a reserva da OS de OUTRA nota nao e convertida pela liberacao do lote desta', async () => {
    const os = await novaOs();
    const m = await material();
    await receber([[m, 4, 'L1']], { os_id: os.id }); // reserva da OS 4 (nota A, L1)
    await receber([[m, 3, 'L2']], { os_id: os.id }); // reserva da OS +3 (nota B, L2)
    assert.strictEqual(await daOs(os, m), 7, 'premissa');
    const R1 = await reqDireta(m, 6, os);
    await statusLote(m, 'L2', 'ATIVO');
    assert.deepStrictEqual(await reservas(R1), [3], 'converteu a reserva da OS de outra nota (sobre o L1 ainda bloqueado)');
    assert.strictEqual(await daOs(os, m), 4);
    assert.deepStrictEqual((await linhasDaOs(os, m)).map((l) => [l.status, Number(l.quantidade)]), [['ATIVA', 4], ['LIBERADA', 3]],
      'a reserva da OS da nota A (L1) foi a convertida, no lugar da da nota B (L2)');
  });
  await test('[RN-230.16] reserva antiga (sem OS) de 4 sobre L1 que ficou BLOQUEADO; nota da OS com 4 em L2 ATIVO; R1 da OS espera 4 -> R1 sem reserva (B1456 vale para a OS)', async () => {
    const os = await novaOs();
    const m = await material({ certificado: 0 });
    await entrar(m, 4, 'L1');
    setUser({ ...SOL });
    let R0;
    try {
      R0 = (await ok(request(app).post(`${API}/requisicoes`)
        .send({ os_referencia: 'OS-230-R0', itens: [{ material_id: m.id, quantidade: 4 }] }), 201)).body.id;
    } finally { setUser({ ...ADMIN }); }
    await ok(request(app).put(`${API}/requisicoes/${R0}/aprovar`).send({}));
    assert.deepStrictEqual(await reservas(R0), [4], 'premissa: R0 reservou');
    await statusLote(m, 'L1', 'BLOQUEADO');
    const R1 = await reqDireta(m, 4, os);
    await receber([[m, 4, 'L2']], { os_id: os.id });
    assert.deepStrictEqual(await reservas(R1), [], 'a fila da OS nao descontou o lote bloqueado sob a reserva antiga (a entrega de R0 sai do L2)');
  });
  await test('[RN-230.17] liberar o lote depois de converter: a fila geral so leva o resto do lote, nao o avulso de outra entrada', async () => {
    const os = await novaOs();
    const m = await material({ certificado: 0 });
    await entrar(m, 1, 'L1');
    await statusLote(m, 'L1', 'BLOQUEADO');
    const R1 = await reqDireta(m, 4, os);
    const R2 = await reqDireta(m, 4);
    await receber([[m, 4, 'L1']], { os_id: os.id });
    assert.deepStrictEqual([await reservas(R1), await reservas(R2), await daOs(os, m)], [[], [], 4], 'premissa');
    await entrar(m, 4, 'L0');
    assert.deepStrictEqual(await reservas(R2), [], 'premissa: a entrada manual nao distribui (D4 da 74)');
    await statusLote(m, 'L1', 'ATIVO');
    assert.deepStrictEqual(await reservas(R1), [4]);
    assert.deepStrictEqual(await reservas(R2), [1], 'a fila geral levou o avulso de L0 alem do livre do lote (5 - 4 convertidas)');
  });

  // ── RN-230.14 / .15 (Fase 2, achados 1 e 2: o abono da OS, B1516) ─────────────────────────────────────────────────────────────
  await test('[RN-230.14] uma nota com OS, L1 e L3 BLOQUEADOS (4 + 4), R1 da OS espera 8: liberar L1 -> R1 com 4; liberar L3 -> R1 com 8, reserva da OS 0', async () => {
    const os = await novaOs();
    const m = await material();
    const R1 = await reqDireta(m, 8, os);
    await receber([[m, 4, 'L1'], [m, 4, 'L3']], { os_id: os.id });
    assert.deepStrictEqual([await reservas(R1), await daOs(os, m)], [[], 8], 'premissa');
    await statusLote(m, 'L1', 'ATIVO');
    assert.strictEqual((await reservas(R1)).reduce((s, x) => s + x, 0), 4, 'a reserva da OS sobre L3 contou duas vezes e R1 nao recebeu L1');
    await statusLote(m, 'L3', 'ATIVO');
    assert.strictEqual((await reservas(R1)).reduce((s, x) => s + x, 0), 8);
    assert.strictEqual(await daOs(os, m), 0);
  });
  await test('[RN-230.15] nota A da OS com 4 em L1 BLOQUEADO; nota B da mesma OS com 3 em L2 ATIVO; R1 da OS espera 4 -> R1 com 3, reserva da OS 4', async () => {
    const os = await novaOs();
    const m = await material({ certificado: 0 });
    await entrar(m, 1, 'L1');
    await statusLote(m, 'L1', 'BLOQUEADO');
    await receber([[m, 4, 'L1']], { os_id: os.id });
    assert.strictEqual(await daOs(os, m), 4, 'premissa');
    const R1 = await reqDireta(m, 4, os);
    await receber([[m, 3, 'L2']], { os_id: os.id });
    assert.deepStrictEqual(await reservas(R1), [3], 'as pecas boas da nota B foram para a reserva da OS e nao para R1');
    assert.strictEqual(await daOs(os, m), 4);
  });

  // ── RN-230.09 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-230.09] nota com OS 3 em L2 + 4 em L1 BLOQUEADO, R1 da OS com 2: estornar L2 -> R1 sem reserva, reserva da OS 2', async () => {
    const os = await novaOs();
    const m = await material({ certificado: 0 });
    const R1 = await reqDireta(m, 2, os);
    await entrar(m, 1, 'L1');
    await statusLote(m, 'L1', 'BLOQUEADO');
    const rec = await receber([[m, 3, 'L2'], [m, 4, 'L1']], { os_id: os.id });
    assert.deepStrictEqual(await reservas(R1), [2], 'premissa: a fila da OS levou 2 do L2');
    assert.strictEqual(await daOs(os, m), 5, 'premissa: o resto virou a reserva da OS');
    await ok(estornar(await movDoLote(rec, m, 'L2')));
    assert.deepStrictEqual(await reservas(R1), [], 'R1 ficou reservada so com peca de L1 bloqueado (a excecao B1508)');
    assert.strictEqual(await daOs(os, m), 2, 'a reserva da OS solta min(reserva, estornado), como na 171');
  });

  // ── RN-230.10 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-230.10] C522 nao muda: depois da .01 (outro material), nota SEM OS com 4 em L2 ATIVO e R2 esperando 4 -> R2 sem reserva', async () => {
    const os = await novaOs();
    const m = await material({ certificado: 0 });
    await entrar(m, 1, 'L1');
    await statusLote(m, 'L1', 'BLOQUEADO');
    const R1 = await reqDireta(m, 4, os);
    await receber([[m, 4, 'L1']], { os_id: os.id });
    assert.deepStrictEqual([await reservas(R1), await daOs(os, m)], [[], 4], 'premissa');
    const R2 = await reqDireta(m, 4);
    await receber([[m, 4, 'L2']]);
    assert.deepStrictEqual(await reservas(R2), [], 'a conta da B1460 mudou (C522)');
  });

  terminou = true;
  await close();
  console.log(`\n  ${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
