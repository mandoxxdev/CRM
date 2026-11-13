/**
 * Etapa 219 (C478) — o que chega em lote bloqueado, reprovado ou vencido nao fica reservado para quem espera.
 *
 * As tres portas que distribuem para quem espera (a nota, a liberacao da inspecao/NC e a OS encerrada) passam pelo miolo
 * `reservaChegadaService.distribuirSemLock`, que limitava pelo disponivel do material — com o saldo de lote impedido dentro. Agora o
 * teto e `disponivel - loteImpedido` (a regua da aprovacao desde a 205, B1453), a nota nao conta como "entrou livre" o item que ela
 * pos em lote impedido (B1454), a OS aberta fica como hoje (B1455) e os avisos param de prometer o que nao sai (B1457).
 *
 * Pelas ROTAS (a nota por `/recebimentos/:id/processar`, a inspecao por `/recebimentos/itens/:id/inspecionar`, o lote por
 * `/lotes/:id/status`, a separacao por `/requisicoes/:id/separar`) e pelo SERVICO (a OS encerrada: `reservarLiberacaoParaQuemEspera`
 * com `origem: 'OS_ENCERRADA'`, como o `osEncerradaService` chama — a rota da OS e core, fora do harness).
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa219-chegada-em-lote-impedido-nao-reserva.md
 * Executar: cd server && node tests/api/chegadaLoteImpedido.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const reservaChegadaService = require('../../services/almoxarifado/reservaChegadaService');
const receiptNotificationService = require('../../services/almoxarifado/receiptNotificationService');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}

const ADMIN = { id: 1, nome: 'Adm 219', role: 'admin', is_superadmin: 1, email: 'a219@t.com' };
const SOL = { id: 21901, nome: 'Solic 219', role: 'admin', is_superadmin: 1, email: 's219@t.com' };
const API = '/api/almoxarifado';
const EM_ESPERA = ['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'];
const FRASE_IMPEDIDO = 'em lote bloqueado, reprovado ou vencido (não sai até o lote ser liberado)';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 219: o que chega em lote impedido nao fica reservado para quem espera (C478) ===\n');
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
  await cfg('notificacoes_dest_recebimento', 'almox219@t.com');
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [SOL.id, SOL.nome, SOL.email]);
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS projetos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)');
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, cliente_id INTEGER,
    tipo_os TEXT NOT NULL DEFAULT 'producao', status TEXT DEFAULT 'pendente', data_abertura DATE NOT NULL DEFAULT '2026-11-13')`);

  const material = async ({ critico = 0, certificado = 1, controleLote = 1 } = {}) => {
    const c = `E219-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, controle_certificado)
        VALUES (?, ?, 'PC', 0, 0, 1, ?, 0.1, ?, 0, ?)`, [c, `Mat ${c}`, critico, controleLote, certificado])).lastID;
    return { id, codigo: c, nome: `Mat ${c}` };
  };
  const entrar = (m, q, lote) => ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'ENTRADA',
    quantidade: q, motivo: 'e219', lote }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const statusLote = async (m, codigo, st) => ok(request(app).put(`${API}/lotes/${await loteId(m, codigo)}/status`)
    .send({ status: st, justificativa: 'teste 219' }));
  const criar = async (m, q) => as(SOL, async () => {
    const r = await request(app).post(`${API}/requisicoes`).send({ os_referencia: 'OS-219', itens: [{ material_id: m.id, quantidade: q }] });
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
  const reqDireta = async (m, q, extra = {}) => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo, os_id, os_referencia)
      VALUES (?, ?, ?, 'AGUARDANDO_ESTOQUE', 'NORMAL', ?, 1, ?, ?)`,
    [`REQ-E219D-${++seq}`, SOL.id, SOL.nome, `2026-11-01 10:${String(seq % 60).padStart(2, '0')}:00`,
      extra.os_id || null, extra.os_referencia || null])).lastID;
    await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,?)',
      [id, m.id, q]);
    return id;
  };
  const st = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
  const reservas = async (R) => (await dbAll(db, `SELECT quantidade FROM reservas_material_almoxarifado
    WHERE requisicao_id = ? AND status = 'ATIVA' ORDER BY id`, [R])).map((x) => Number(x.quantidade));
  const disponivel = async (m) => Number((await dbGet(db, `SELECT quantidade_atual - COALESCE(quantidade_reservada,0)
    - COALESCE(quantidade_bloqueada,0) - COALESCE(quantidade_em_inspecao,0) - COALESCE(quantidade_em_terceiros,0) AS d
    FROM materiais_almoxarifado WHERE id = ?`, [m.id])).d);
  /** Nota gravada pronta para `/processar` (EM_ENTRADA_NF). `linhas`: [[material, q, lote]]. */
  const nota = async (linhas, extra = {}) => {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota, os_id)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F219', '2026-11-01', '2026-11-02', 10, ?)`, [`REC-E219-${++seq}`, `NF-E219-${seq}`,
      extra.os_id || null])).lastID;
    for (const [m, q, lote] of linhas) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote) VALUES (?,?,?,?,?)`, [r, m.id, q, q, lote]);
    }
    return r;
  };
  const processar = (rec) => ok(request(app).post(`${API}/recebimentos/${rec}/processar`).send({}));
  const receber = async (linhas, extra) => { const rec = await nota(linhas, extra); await processar(rec); return rec; };
  const itemRec = (rec, m) => dbGet(db, 'SELECT id, lote_id, quantidade_em_inspecao FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? AND material_id = ?', [rec, m.id]);
  const inspecionar = (itemId, a, r) => request(app).post(`${API}/recebimentos/itens/${itemId}/inspecionar`)
    .send({ quantidade_aprovada: a, quantidade_reprovada: r, encaminhamento: r > 0 ? 'DEVOLVER' : undefined });
  const avisoNota = async (rec) => dbGet(db, `SELECT corpo_texto FROM fila_notificacoes_almoxarifado
    WHERE evento = 'RECEBIMENTO_ENTRADA' AND json_extract(payload, '$.recebimento_id') = ?`, [rec]);
  const avisosReq = async (R) => dbAll(db, `SELECT corpo_texto, payload FROM fila_notificacoes_almoxarifado
    WHERE evento = 'RECEBIMENTO_ENTRADA_REQUISITANTE' AND json_extract(payload, '$.requisicao_id') = ? ORDER BY id`, [R]);
  const statusLoteDe = async (m, codigo) => (await dbGet(db, 'SELECT status FROM lotes_almoxarifado WHERE id = ?',
    [await loteId(m, codigo)])).status;

  // ── RN-219.01 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  let cenario01 = null;
  await test('[RN-219.01] nota de 4 toda em lote BLOQUEADO (sem certificado): nenhuma reserva para R1, R1 continua esperando, disponivel 4', async () => {
    const m = await material();
    const R1 = await esperando(m, 4);
    const antes = await st(R1);
    const rec = await receber([[m, 4, 'L1']]);
    assert.strictEqual(await statusLoteDe(m, 'L1'), 'BLOQUEADO', 'premissa: o lote nasce bloqueado sem certificado');
    assert.deepStrictEqual(await reservas(R1), [], 'reservou peca de lote bloqueado');
    assert.strictEqual(await disponivel(m), 4, 'nao critico: o saldo entra livre no disponivel e ninguem o reserva');
    assert.strictEqual(await st(R1), antes);
    cenario01 = { m, R1, rec };
  });

  // ── RN-219.08 (b): sem aviso para quem nao ganhou nada e so tem lote bloqueado ─────────────────────────────────────────────────
  await test('[RN-219.08 b] na RN-219.01 o solicitante de R1 NAO recebe "Chegou material"; o aviso da nota diz que o item entrou em lote bloqueado', async () => {
    assert.ok(cenario01, 'premissa: RN-219.01 montou o cenario');
    assert.deepStrictEqual(await avisosReq(cenario01.R1), [], 'prometeu material que nao pode sair');
    const a = await avisoNota(cenario01.rec);
    assert.ok(a, 'premissa: o aviso da nota foi enfileirado');
    const linha = a.corpo_texto.split('\n').find((l) => l.startsWith(`- ${cenario01.m.codigo}`));
    assert.strictEqual(linha, `- ${cenario01.m.codigo} — ${cenario01.m.nome}: 4 PC — ${FRASE_IMPEDIDO}`);
  });

  // ── RN-219.06 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-219.06] depois da RN-219.01, o lote volta a ATIVO -> reserva os 4 para R1 (Etapa 220, C480 resolvido) -> separar 4 de R1 -> 200', async () => {
    assert.ok(cenario01, 'premissa: RN-219.01 montou o cenario');
    const { m, R1 } = cenario01;
    await statusLote(m, 'L1', 'ATIVO');
    assert.deepStrictEqual(await reservas(R1), [4], 'Etapa 220 (C480): liberar o lote reserva para quem esperava (ate a 219 nao distribuia)');
    const it = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R1])).id;
    await ok(request(app).put(`${API}/requisicoes/${R1}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: 4 }] }));
    assert.strictEqual(Number((await dbGet(db, 'SELECT quantidade_separada q FROM itens_requisicao_almoxarifado WHERE id = ?', [it])).q), 4);
  });

  // ── RN-219.02 + RN-219.08 a/c ──────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-219.02 + 08 a/c] nota mista (3 em L2 ATIVO + 4 em L1 BLOQUEADO), R1 espera 6 -> reserva 3, PARCIALMENTE; avisos com as duas frases e "reservado 3"', async () => {
    const m = await material({ certificado: 0 });
    await entrar(m, 1, 'L1');
    await statusLote(m, 'L1', 'BLOQUEADO');
    const R1 = await esperando(m, 6);
    const rec = await receber([[m, 3, 'L2'], [m, 4, 'L1']]);
    assert.strictEqual(await statusLoteDe(m, 'L2'), 'ATIVO');
    assert.strictEqual(await statusLoteDe(m, 'L1'), 'BLOQUEADO');
    assert.deepStrictEqual(await reservas(R1), [3]);
    assert.strictEqual(await st(R1), 'PARCIALMENTE_RESERVADA');
    const linhas = (await avisoNota(rec)).corpo_texto.split('\n').filter((l) => l.startsWith(`- ${m.codigo}`));
    assert.deepStrictEqual(linhas, [
      `- ${m.codigo} — ${m.nome}: 3 PC — disponível`,
      `- ${m.codigo} — ${m.nome}: 4 PC — ${FRASE_IMPEDIDO}`,
    ]);
    const [e] = await avisosReq(R1);
    assert.ok(e, 'quem ganhou 3 recebe o aviso');
    assert.ok(e.corpo_texto.includes('reservado para a sua requisição: 3 PC'), e.corpo_texto);
  });

  // ── RN-219.03 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-219.03] 4 livres de ajuste em L0 + nota de 4 em L1 BLOQUEADO, R1 esperando 4 -> nenhuma reserva (a nota nao distribui o ajuste, B1454)', async () => {
    const m = await material();
    const R1 = await esperando(m, 4);
    await entrar(m, 4, 'L0');
    assert.deepStrictEqual(await reservas(R1), [], 'premissa: a entrada manual nao distribui (D4 da 74)');
    await receber([[m, 4, 'L1']]);
    assert.strictEqual(await statusLoteDe(m, 'L1'), 'BLOQUEADO');
    assert.deepStrictEqual(await reservas(R1), [], 'a nota distribuiu o saldo do ajuste no lugar do que entrou bloqueado');
    assert.deepStrictEqual(await avisosReq(R1), [], 'B1457 b: "Chegou material" de uma nota que so trouxe peca bloqueada');
  });

  // ── RN-219.04 + RN-219.08 d ────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-219.04 + 08 d] critico: a inspecao aprova 4 de lote que continua BLOQUEADO -> nenhuma reserva, nenhum aviso de liberacao', async () => {
    const m = await material({ critico: 1, certificado: 1 });
    const R1 = await esperando(m, 4);
    const rec = await receber([[m, 4, 'L1']]);
    const it = await itemRec(rec, m);
    assert.strictEqual(Number(it.quantidade_em_inspecao), 4, 'premissa: critico entra retido');
    assert.strictEqual(await statusLoteDe(m, 'L1'), 'BLOQUEADO');
    const linhaNota = (await avisoNota(rec)).corpo_texto.split('\n').find((l) => l.startsWith(`- ${m.codigo}`));
    assert.strictEqual(linhaNota, `- ${m.codigo} — ${m.nome}: 4 PC — retido para inspeção`, 'Fase 2 item 3: o retido vem primeiro');
    await ok(inspecionar(it.id, 4, 0), 201);
    assert.strictEqual(await statusLoteDe(m, 'L1'), 'BLOQUEADO', 'premissa: a inspecao nao libera o certificado');
    assert.deepStrictEqual(await reservas(R1), [], 'a inspecao reservou peca de lote bloqueado');
    assert.ok(EM_ESPERA.includes(await st(R1)), await st(R1));
    const lib = (await avisosReq(R1)).filter((x) => JSON.parse(x.payload).origem === 'INSPECAO');
    assert.deepStrictEqual(lib, [], 'avisou "Material liberado" de lote bloqueado');
  });
  await test('[RN-219.04 controle] o mesmo com o lote ATIVO (sem certificado exigido) -> a inspecao reserva 4', async () => {
    const m = await material({ critico: 1, certificado: 0 });
    const R1 = await esperando(m, 4);
    const rec = await receber([[m, 4, 'L1']]);
    const it = await itemRec(rec, m);
    await ok(inspecionar(it.id, 4, 0), 201);
    assert.deepStrictEqual(await reservas(R1), [4]);
  });

  // ── RN-219.05 (servico) ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const osEncerrada = (m) => reservaChegadaService.reservarLiberacaoParaQuemEspera(db, ADMIN, {
    origem: 'OS_ENCERRADA', documento_id: 999, documento_numero: 'OS-E219', material_id: m.id, quantidade: 4, recebimento_id: null,
  });
  await test('[RN-219.05] OS encerrada solta 4 de material todo em L1 BLOQUEADO -> nenhuma reserva para quem espera', async () => {
    const m = await material({ certificado: 0 });
    await entrar(m, 4, 'L1');
    await statusLote(m, 'L1', 'BLOQUEADO');
    const R1 = await reqDireta(m, 4);
    const r = await osEncerrada(m);
    assert.deepStrictEqual(r.reservas, []);
    assert.deepStrictEqual(await reservas(R1), []);
  });
  await test('[RN-219.05 controle] o mesmo com L1 ATIVO -> reserva 4', async () => {
    const m = await material({ certificado: 0 });
    await entrar(m, 4, 'L1');
    const R1 = await reqDireta(m, 4);
    const r = await osEncerrada(m);
    assert.strictEqual(r.reservas.length, 1);
    assert.deepStrictEqual(await reservas(R1), [4]);
  });

  // ── RN-219.07 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-219.07] NF com OS ABERTA, 4 em L1 BLOQUEADO, requisicao da OS esperando 4 -> nada para ela, 4 na reserva da OS (Etapa 230, B1513)', async () => {
    const os = (await dbRun(db, "INSERT INTO ordens_servico (numero_os, status) VALUES ('OS-E219-A', 'em_andamento')")).lastID;
    const m = await material();
    const R1 = await reqDireta(m, 4, { os_id: os, os_referencia: 'OS-E219-A' });
    await receber([[m, 4, 'L1']], { os_id: os });
    assert.strictEqual(await statusLoteDe(m, 'L1'), 'BLOQUEADO');
    assert.deepStrictEqual(await reservas(R1), [], 'a fila da OS recebeu peca de lote bloqueado (B1455, revogada na 230)');
    const daOs = await dbGet(db, `SELECT COALESCE(SUM(quantidade),0) q FROM reservas_material_almoxarifado
      WHERE status = 'ATIVA' AND origem = 'MANUAL' AND os_id = ? AND material_id = ?`, [os, m.id]);
    assert.strictEqual(Number(daOs.q), 4, 'a peca comprada para a OS ficou fora da reserva da OS');
  });

  // ── RN-219.10 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-219.10] reserva antiga de 4 em L1 que ficou BLOQUEADO; nota de 4 em L2 ATIVO -> nenhuma reserva para R2 (B1456)', async () => {
    const m = await material({ certificado: 0 });
    await entrar(m, 4, 'L1');
    const R1 = await criar(m, 4);
    await aprovar(R1);
    assert.deepStrictEqual(await reservas(R1), [4], 'premissa: R1 reservou');
    await statusLote(m, 'L1', 'BLOQUEADO');
    const R2 = await esperando(m, 4);
    await receber([[m, 4, 'L2']]);
    assert.deepStrictEqual(await reservas(R2), [], 'a nota deu a R2 o que a entrega de R1 vai tirar do lote bom');
    assert.deepStrictEqual(await reservas(R1), [4], 'B1372: a reserva antiga continua');
    assert.deepStrictEqual(await avisosReq(R2), [], 'B1457 b: "Chegou material" sem nada que possa sair para R2');
  });

  // ── RN-219.11 (Fase 2, trava): a OS que fecha no meio devolve para a fila GERAL, que desconta ───────────────────────────────────
  const comOsFechandoNoMeio = async (fn) => {
    const reservaDaOs = require('../../services/almoxarifado/reservaDaOs');
    const original = reservaDaOs.reservarParaOsSobTrava;
    reservaDaOs.reservarParaOsSobTrava = async (db2, user, { materialId, quantidade, os }) => ({
      reserva_id: null, material_id: Number(materialId), os_id: os.id, quantidade, solta_os_fechada: true,
    });
    try { return await fn(); } finally { reservaDaOs.reservarParaOsSobTrava = original; }
  };
  await test('[RN-219.11] NF com OS que fecha no meio, 4 em L1 BLOQUEADO, R2 (sem OS) esperando 4 -> nenhuma reserva para R2', async () => {
    const os = (await dbRun(db, "INSERT INTO ordens_servico (numero_os, status) VALUES ('OS-E219-B', 'em_andamento')")).lastID;
    const m = await material();
    const R2 = await reqDireta(m, 4);
    await comOsFechandoNoMeio(() => receber([[m, 4, 'L1']], { os_id: os }));
    assert.strictEqual(await statusLoteDe(m, 'L1'), 'BLOQUEADO');
    assert.deepStrictEqual(await reservas(R2), [], 'a fila geral do desvio da OS fechada reservou peca de lote bloqueado');
  });
  await test('[RN-219.11 controle] o mesmo com o lote ATIVO -> R2 fica com 4 (o desvio funciona)', async () => {
    const os = (await dbRun(db, "INSERT INTO ordens_servico (numero_os, status) VALUES ('OS-E219-C', 'em_andamento')")).lastID;
    const m = await material({ certificado: 0 });
    const R2 = await reqDireta(m, 4);
    await comOsFechandoNoMeio(() => receber([[m, 4, 'L1']], { os_id: os }));
    assert.deepStrictEqual(await reservas(R2), [4]);
  });

  // ── RN-219.12 (Fase 2 item 2): sem controle de lote nada muda ───────────────────────────────────────────────────────────────────
  await test('[RN-219.12] material SEM controle de lote, lote nasce BLOQUEADO pelo certificado -> reserva 4 como hoje; aviso "disponível"', async () => {
    const m = await material({ controleLote: 0 });
    const R1 = await esperando(m, 4);
    const rec = await receber([[m, 4, 'L1']]);
    assert.strictEqual(await statusLoteDe(m, 'L1'), 'BLOQUEADO', 'premissa: o lote nasce bloqueado mesmo sem controle');
    assert.deepStrictEqual(await reservas(R1), [4], 'a aprovacao ignora lote neste material (B1371): a chegada tambem');
    const linha = (await avisoNota(rec)).corpo_texto.split('\n').find((l) => l.startsWith(`- ${m.codigo}`));
    assert.strictEqual(linha, `- ${m.codigo} — ${m.nome}: 4 PC — disponível`);
  });

  // ── RN-219.13 (Fase 5): lote VENCIDO sem a liberacao do vencimento tambem e impedido; liberado, volta a contar ──────────────────
  const ontem = diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), -1);
  const vencidoComAjuste = async (liberado) => {
    const m = await material({ certificado: 0 });
    const R1 = await esperando(m, 4);
    await entrar(m, 1, 'L1');
    await entrar(m, 4, 'L0');
    await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ?, vencimento_liberado_em = ? WHERE id = ?',
      [ontem, liberado ? '2026-11-13 08:00:00' : null, await loteId(m, 'L1')]);
    assert.deepStrictEqual(await reservas(R1), [], 'premissa: as entradas manuais nao distribuem');
    const rec = await receber([[m, 4, 'L1']]);
    const linha = (await avisoNota(rec)).corpo_texto.split('\n').find((l) => l.startsWith(`- ${m.codigo}`));
    return { m, R1, linha };
  };
  await test('[RN-219.13] nota de 4 num lote VENCIDO (sem liberar), 4 de ajuste livres, R1 esperando 4 -> nenhuma reserva; aviso com a frase', async () => {
    const { m, R1, linha } = await vencidoComAjuste(false);
    assert.deepStrictEqual(await reservas(R1), [], 'a nota distribuiu o ajuste no lugar do que entrou num lote vencido');
    assert.strictEqual(linha, `- ${m.codigo} — ${m.nome}: 4 PC — ${FRASE_IMPEDIDO}`);
  });
  await test('[RN-219.13 controle] o mesmo com o vencimento LIBERADO -> reserva 4; aviso "disponível"', async () => {
    const { m, R1, linha } = await vencidoComAjuste(true);
    assert.deepStrictEqual(await reservas(R1), [4]);
    assert.strictEqual(linha, `- ${m.codigo} — ${m.nome}: 4 PC — disponível`);
  });

  // ── RN-219.14 (Fase 5, B1460 — fixa a decisao): a reserva da OS sobre o lote bloqueado conta como a aprovacao conta ────────────
  await test('[RN-219.14] OS guardou 4 de L1 BLOQUEADO; nota comum de 4 em L2 ATIVO; R1 (sem OS) esperando 4 -> nada, como a aprovacao de R3 (C522)', async () => {
    const os = (await dbRun(db, "INSERT INTO ordens_servico (numero_os, status) VALUES ('OS-E219-D', 'em_andamento')")).lastID;
    const m = await material();
    const R1 = await esperando(m, 4);
    await receber([[m, 4, 'L1']], { os_id: os });
    const daOs = await dbAll(db, `SELECT quantidade FROM reservas_material_almoxarifado WHERE material_id = ? AND os_id = ?
      AND requisicao_id IS NULL AND status = 'ATIVA'`, [m.id, os]);
    assert.deepStrictEqual(daOs.map((x) => Number(x.quantidade)), [4], 'premissa: a sobra virou reserva da OS (B1455)');
    assert.deepStrictEqual(await reservas(R1), [], 'premissa: a fila geral nao leva nada da nota da OS');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_certificado = 0 WHERE id = ?', [m.id]);
    await receber([[m, 4, 'L2']]);
    assert.strictEqual(await statusLoteDe(m, 'L2'), 'ATIVO');
    assert.deepStrictEqual(await reservas(R1), [], 'B1460: a nota usa a regua da aprovacao (a reserva da OS nao abate o impedido)');
    const R3 = await criar(m, 4);
    const a3 = await aprovar(R3);
    assert.ok(EM_ESPERA.includes(a3.body.status), `a aprovacao tambem nao reserva (${a3.body.status}) — a mesma regua`);
  });

  // ── a funcao pura do aviso ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-219.08 a, pura] montarAvisoNota: item em lote impedido ganha a frase; retido continua "retido para inspeção"', async () => {
    const a = receiptNotificationService.montarAvisoNota({
      numero: 'REC-1', nota_fiscal: 'NF-1', fornecedor_nome: 'F', data_hora: 'x', usuario: 'u', link: 'l',
      itens: [
        { codigo: 'A', nome: 'a', quantidade: 2, unidade: 'PC', em_lote_impedido: true },
        { codigo: 'B', nome: 'b', quantidade: 1, unidade: 'PC', localizacao: 'P01', retido: true, em_lote_impedido: true },
        { codigo: 'C', nome: 'c', quantidade: 3, unidade: 'PC' },
      ],
    });
    assert.ok(a.linhas.includes(`- A — a: 2 PC — ${FRASE_IMPEDIDO}`), a.corpo_texto);
    assert.ok(a.linhas.includes('- B — b: 1 PC em P01 — retido para inspeção'), a.corpo_texto);
    assert.ok(a.linhas.includes('- C — c: 3 PC — disponível'), a.corpo_texto);
  });

  terminou = true;
  await close();
  console.log(`\n  ${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
