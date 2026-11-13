/**
 * Etapa 229 (C519) — a inspecao e a nao conformidade olham o lote do item que liberaram.
 *
 * A liberacao (`reservaChegadaService.reservarLiberacaoParaQuemEspera`) limitava pelo que pode sair do MATERIAL (B1453): com a peca
 * aprovada num lote que continua bloqueado e saldo livre de uma entrada manual em outro lote, ela reservava o livre avulso no lugar do
 * que foi aprovado (B1458). Agora a inspecao e a NC passam o `lote_id` do item; sem OS aberta, com o lote impedido AGORA (lido sob a
 * trava), nada e reservado (B1509), o aviso de liberacao nao sai (B1511) e a resposta da inspecao diz o lote (B1512).
 *
 * Pelas ROTAS (a nota por `/recebimentos/:id/processar`, a inspecao por `/recebimentos/itens/:id/inspecionar`, a NC por
 * `/nao-conformidades/:id/decidir`, o lote por `/lotes/:id/status`, a separacao por `/requisicoes/:id/separar`) e pelo SERVICO
 * (`reservarLiberacaoParaQuemEspera` com e sem `lote_id`, como a OS encerrada chama).
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa229-liberacao-lote-impedido.md
 * Executar: cd server && node tests/api/liberacaoLoteImpedido.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const reservaChegadaService = require('../../services/almoxarifado/reservaChegadaService');
const reservaDaOs = require('../../services/almoxarifado/reservaDaOs');
const trava = require('../../services/almoxarifado/travaPorMaterial');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}

const ADMIN = { id: 1, nome: 'Adm 229', role: 'admin', is_superadmin: 1, email: 'a229@t.com' };
const SOL = { id: 22901, nome: 'Solic 229', role: 'admin', is_superadmin: 1, email: 's229@t.com' };
const API = '/api/almoxarifado';
const EM_ESPERA = ['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'];
const CHAVES_RESPOSTA = ['divergencia_dimensional', 'divergencia_quantidade', 'id', 'medidas_registradas', 'quantidade_aprovada',
  'quantidade_reprovada'];
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 229: a inspecao e a NC olham o lote do item que liberaram (C519) ===\n');
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
  await cfg('notificacoes_dest_recebimento', 'almox229@t.com');
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [SOL.id, SOL.nome, SOL.email]);
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS projetos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)');
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, cliente_id INTEGER,
    tipo_os TEXT NOT NULL DEFAULT 'producao', status TEXT DEFAULT 'pendente', data_abertura DATE NOT NULL DEFAULT '2026-11-13')`);

  const material = async ({ critico = 1, certificado = 1, controleLote = 1 } = {}) => {
    const c = `E229-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, controle_certificado)
        VALUES (?, ?, 'PC', 0, 0, 1, ?, 0.1, ?, 0, ?)`, [c, `Mat ${c}`, critico, controleLote, certificado])).lastID;
    return { id, codigo: c, nome: `Mat ${c}` };
  };
  const entrar = (m, q, lote) => ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'ENTRADA',
    quantidade: q, motivo: 'e229', lote }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const statusLote = async (m, codigo, st) => ok(request(app).put(`${API}/lotes/${await loteId(m, codigo)}/status`)
    .send({ status: st, justificativa: 'teste 229' }));
  const statusLoteDe = async (m, codigo) => (await dbGet(db, 'SELECT status FROM lotes_almoxarifado WHERE id = ?',
    [await loteId(m, codigo)])).status;
  const criar = async (m, q) => as(SOL, async () => {
    const r = await request(app).post(`${API}/requisicoes`).send({ os_referencia: 'OS-229', itens: [{ material_id: m.id, quantidade: q }] });
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
    [`REQ-E229D-${++seq}`, SOL.id, SOL.nome, `2026-11-01 10:${String(seq % 60).padStart(2, '0')}:00`,
      extra.os_id || null, extra.os_referencia || null])).lastID;
    await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,?)',
      [id, m.id, q]);
    return id;
  };
  const st = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
  const reservas = async (R) => (await dbAll(db, `SELECT quantidade FROM reservas_material_almoxarifado
    WHERE requisicao_id = ? AND status = 'ATIVA' ORDER BY id`, [R])).map((x) => Number(x.quantidade));
  const reservasCompletas = (R) => dbAll(db, `SELECT * FROM reservas_material_almoxarifado
    WHERE requisicao_id = ? AND status = 'ATIVA' ORDER BY id`, [R]);
  const nota = async (linhas, extra = {}) => {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota, os_id)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F229', '2026-11-01', '2026-11-02', 10, ?)`, [`REC-E229-${++seq}`, `NF-E229-${seq}`,
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
  const avisosLib = async (R, origem) => (await dbAll(db, `SELECT corpo_texto, payload FROM fila_notificacoes_almoxarifado
    WHERE evento = 'RECEBIMENTO_ENTRADA_REQUISITANTE' AND json_extract(payload, '$.requisicao_id') = ? ORDER BY id`, [R]))
    .filter((x) => JSON.parse(x.payload).origem === origem);
  const ontem = () => {
    const d = new Date(`${diaLocal.hojeLocalISO()}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };

  /**
   * A montagem padrao: R1 esperando 4; a nota traz 4 em L1 (retido para inspecao; BLOQUEADO se `certificado`); depois 4 manuais em L0
   * (livres, sem distribuir). `antesDaInspecao(m)` mexe no lote antes de inspecionar.
   */
  const montar = async (opts = {}) => {
    const m = await material(opts);
    const R1 = opts.os ? await reqDireta(m, 4, { os_id: opts.os.id, os_referencia: opts.os.numero }) : await esperando(m, 4);
    const rec = await receber([[m, 4, 'L1']], opts.os ? { os_id: opts.os.id } : undefined);
    const it = await itemRec(rec, m);
    assert.strictEqual(Number(it.quantidade_em_inspecao), 4, 'premissa: critico entra retido');
    await entrar(m, 4, 'L0');
    assert.deepStrictEqual(await reservas(R1), [], 'premissa: a entrada manual nao distribui (D4 da 74)');
    return { m, R1, rec, it };
  };

  // ── RN-229.01 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  let cenario01 = null;
  await test('[RN-229.01] a inspecao aprova 4 de L1 que continua BLOQUEADO, com 4 livres em L0 -> nenhuma reserva, lote_impedido L1, sem aviso', async () => {
    const c = await montar();
    assert.strictEqual(await statusLoteDe(c.m, 'L1'), 'BLOQUEADO', 'premissa: sem certificado o lote nasce bloqueado');
    const r = await ok(inspecionar(c.it.id, 4, 0), 201);
    assert.strictEqual(await statusLoteDe(c.m, 'L1'), 'BLOQUEADO', 'premissa: a inspecao nao libera o certificado');
    assert.deepStrictEqual(await reservas(c.R1), [], 'a inspecao reservou o livre avulso de L0 no lugar do aprovado em L1 bloqueado');
    assert.ok(EM_ESPERA.includes(await st(c.R1)), await st(c.R1));
    assert.strictEqual(r.body.lote_impedido, 'L1');
    assert.deepStrictEqual(Object.keys(r.body).sort(), [...CHAVES_RESPOSTA, 'lote_impedido'].sort());
    assert.deepStrictEqual(await avisosLib(c.R1, 'INSPECAO'), [], 'avisou "Material liberado" de uma liberacao que nao deu nada');
    cenario01 = c;
  });

  // ── RN-229.02 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-229.02 controle] o mesmo com L1 ATIVO (sem certificado exigido) -> reserva 4, resposta sem lote_impedido, com aviso', async () => {
    const c = await montar({ certificado: 0 });
    assert.strictEqual(await statusLoteDe(c.m, 'L1'), 'ATIVO');
    const r = await ok(inspecionar(c.it.id, 4, 0), 201);
    assert.deepStrictEqual(await reservas(c.R1), [4]);
    assert.deepStrictEqual(Object.keys(r.body).sort(), CHAVES_RESPOSTA, 'D5 da 75: sem a chave fora do caso impedido');
    assert.strictEqual((await avisosLib(c.R1, 'INSPECAO')).length, 1, 'quem ganhou 4 e avisado');
  });

  // ── RN-229.03 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const decidir = (ncId, decisao) => request(app).post(`${API}/nao-conformidades/${ncId}/decidir`)
    .send({ decisao, justificativa: `teste 229 ${decisao}` });
  const ncDa = (inspecaoId) => dbGet(db, "SELECT * FROM nao_conformidades_almoxarifado WHERE referencia_tipo = 'INSPECAO' AND referencia_id = ?", [inspecaoId]);
  const cenarioNc = async (certificado) => {
    const m = await material({ certificado });
    const R1 = await esperando(m, 4);
    const rec = await receber([[m, 4, 'L1']]);
    const it = await itemRec(rec, m);
    const insp = (await ok(inspecionar(it.id, 0, 4), 201)).body.id;
    const nc = await ncDa(insp);
    assert.strictEqual(nc && nc.status, 'ABERTA', 'premissa: NC aberta automaticamente');
    await entrar(m, 4, 'L0');
    assert.deepStrictEqual(await reservas(R1), [], 'premissa: a entrada manual nao distribui');
    const d = await ok(decidir(nc.id, 'ACEITAR'));
    return { m, R1, d };
  };
  await test('[RN-229.03] a NC aceita as 4 reprovadas de L1 BLOQUEADO, com 4 livres em L0 -> LIBERADA, nenhuma reserva, sem aviso', async () => {
    const { m, R1 } = await cenarioNc(1);
    assert.strictEqual(await statusLoteDe(m, 'L1'), 'BLOQUEADO');
    const q = await dbGet(db, 'SELECT quantidade_bloqueada b FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    assert.strictEqual(Number(q.b), 0, 'premissa: a aceitacao liberou o bloqueado (efeito LIBERADA)');
    assert.deepStrictEqual(await reservas(R1), [], 'a NC reservou o livre avulso de L0 no lugar do aceito em L1 bloqueado');
    assert.deepStrictEqual(await avisosLib(R1, 'NAO_CONFORMIDADE'), []);
  });
  await test('[RN-229.03 controle] a NC com L1 ATIVO -> reserva 4 e avisa', async () => {
    const { R1 } = await cenarioNc(0);
    assert.deepStrictEqual(await reservas(R1), [4]);
    assert.strictEqual((await avisosLib(R1, 'NAO_CONFORMIDADE')).length, 1);
  });

  // ── RN-229.04 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-229.04] L1 ATIVO mas vencido ontem -> nada, lote_impedido L1', async () => {
    const c = await montar({ certificado: 0 });
    await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?', [ontem(), await loteId(c.m, 'L1')]);
    const r = await ok(inspecionar(c.it.id, 4, 0), 201);
    assert.deepStrictEqual(await reservas(c.R1), []);
    assert.strictEqual(r.body.lote_impedido, 'L1');
  });
  await test('[RN-229.04 controle] vencido ontem com o vencimento liberado -> reserva 4', async () => {
    const c = await montar({ certificado: 0 });
    await dbRun(db, "UPDATE lotes_almoxarifado SET data_validade = ?, vencimento_liberado_em = '2026-11-12 10:00:00' WHERE id = ?",
      [ontem(), await loteId(c.m, 'L1')]);
    const r = await ok(inspecionar(c.it.id, 4, 0), 201);
    assert.deepStrictEqual(await reservas(c.R1), [4]);
    assert.strictEqual(r.body.lote_impedido, undefined);
  });

  // ── RN-229.05 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-229.05] sem controle de lote (L1 BLOQUEADO mas o material nao controla) -> reserva 4 como hoje (B1371)', async () => {
    const c = await montar({ controleLote: 0 });
    const r = await ok(inspecionar(c.it.id, 4, 0), 201);
    assert.deepStrictEqual(await reservas(c.R1), [4]);
    assert.strictEqual(r.body.lote_impedido, undefined);
  });

  // ── RN-229.06 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-229.06] OS aberta, L1 BLOQUEADO, R1 da OS esperando 4 -> a inspecao reserva 4 para a OS como hoje (B1510)', async () => {
    const numero = `OS-E229-${++seq}`;
    const os = { id: (await dbRun(db, "INSERT INTO ordens_servico (numero_os, status) VALUES (?, 'em_andamento')", [numero])).lastID, numero };
    const c = await montar({ os });
    assert.strictEqual(await statusLoteDe(c.m, 'L1'), 'BLOQUEADO');
    const r = await ok(inspecionar(c.it.id, 4, 0), 201);
    assert.deepStrictEqual(await reservas(c.R1), [4], 'a fila da OS deixou de receber (B1510: a OS aberta fica como antes)');
    assert.strictEqual(r.body.lote_impedido, undefined);
  });

  // ── RN-229.07 (servico) ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const liberarServico = (m, extra = {}) => reservaChegadaService.reservarLiberacaoParaQuemEspera(db, ADMIN, {
    origem: 'OS_ENCERRADA', documento_id: 999, documento_numero: 'OS-E229', material_id: m.id, quantidade: 4, recebimento_id: null, ...extra,
  });
  await test('[RN-229.07] servico: com lote_id de L1 BLOQUEADO -> nenhuma reserva e lote_impedido {id, codigo}; sem lote_id -> 4', async () => {
    const m = await material({ critico: 0, certificado: 0 });
    await entrar(m, 4, 'L1');
    await statusLote(m, 'L1', 'BLOQUEADO');
    await entrar(m, 4, 'L0');
    const R1 = await reqDireta(m, 4);
    const l1 = await loteId(m, 'L1');
    const r = await liberarServico(m, { lote_id: l1 });
    assert.deepStrictEqual(r.reservas, []);
    assert.deepStrictEqual(r.lote_impedido, { id: l1, codigo: 'L1' });
    assert.deepStrictEqual(await reservas(R1), []);
    const r2 = await liberarServico(m);
    assert.strictEqual(r2.reservas.length, 1);
    assert.strictEqual(r2.lote_impedido, undefined);
    assert.deepStrictEqual(await reservas(R1), [4]);
  });
  await test('[RN-229.07 controle] servico: com lote_id de L1 ATIVO -> reserva 4, sem lote_impedido', async () => {
    const m = await material({ critico: 0, certificado: 0 });
    await entrar(m, 4, 'L1');
    const R1 = await reqDireta(m, 4);
    const r = await liberarServico(m, { lote_id: await loteId(m, 'L1') });
    assert.strictEqual(r.reservas.length, 1);
    assert.strictEqual(r.lote_impedido, undefined);
    assert.deepStrictEqual(await reservas(R1), [4]);
  });

  await test('[RN-229.07b Fase 5] servico: lote_id de um lote BLOQUEADO de OUTRO material -> ignorado, reserva 4 (D (229) 3)', async () => {
    const m = await material({ critico: 0, certificado: 0 });
    await entrar(m, 4, 'L1');
    const outro = await material({ critico: 0, certificado: 0 });
    await entrar(outro, 1, 'LX');
    await statusLote(outro, 'LX', 'BLOQUEADO');
    const R1 = await reqDireta(m, 4);
    const r = await liberarServico(m, { lote_id: await loteId(outro, 'LX') });
    assert.strictEqual(r.lote_impedido, undefined);
    assert.deepStrictEqual(await reservas(R1), [4]);
  });

  // ── RN-229.04b (Fase 5): REPROVADO tambem impede ─────────────────────────────────────────────────────────────────────────────
  await test('[RN-229.04b Fase 5] L1 ATIVO posto em REPROVADO antes da inspecao -> nada, lote_impedido L1', async () => {
    const c = await montar({ certificado: 0 });
    await statusLote(c.m, 'L1', 'REPROVADO');
    const r = await ok(inspecionar(c.it.id, 4, 0), 201);
    assert.deepStrictEqual(await reservas(c.R1), []);
    assert.strictEqual(r.body.lote_impedido, 'L1');
  });

  // ── RN-229.08 (integracao) ────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-229.08] depois da RN-229.01, liberar L1 reserva 4 para R1 (Etapa 220) -> TOTALMENTE_RESERVADA -> separar 4 -> 200', async () => {
    assert.ok(cenario01, 'premissa: RN-229.01 montou o cenario');
    const { m, R1 } = cenario01;
    await statusLote(m, 'L1', 'ATIVO');
    assert.deepStrictEqual(await reservas(R1), [4]);
    assert.strictEqual(await st(R1), 'TOTALMENTE_RESERVADA');
    const [res] = await reservasCompletas(R1);
    assert.ok(String(res.observacoes || '').includes('liberação do lote L1'), `a reserva veio da liberacao do lote: ${res.observacoes}`);
    const it = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R1])).id;
    await ok(request(app).put(`${API}/requisicoes/${R1}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: 4 }] }));
  });

  // ── RN-229.09 (trava) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-229.09] o lote liberado durante a secao da inspecao espera a trava: a inspecao le BLOQUEADO e nao reserva; a liberacao do lote reserva depois', async () => {
    const c = await montar();
    const original = reservaDaOs.osAbertaDoRecebimento;
    let sinal; const entrou = new Promise((res) => { sinal = res; });
    let soltar; const segura = new Promise((res) => { soltar = res; });
    reservaDaOs.osAbertaDoRecebimento = async (...a) => { sinal(); await segura; return original(...a); };
    let pInsp; let pLote;
    try {
      pInsp = Promise.resolve(inspecionar(c.it.id, 4, 0)); // o supertest so dispara no then: uma vez so
      await entrou;
      assert.ok(trava.travado(c.m.id), 'premissa: a inspecao esta dentro da secao do material');
      pLote = statusLote(c.m, 'L1', 'ATIVO');
      await new Promise((res) => setTimeout(res, 60));
      assert.strictEqual(await statusLoteDe(c.m, 'L1'), 'BLOQUEADO', 'a mudanca de status do lote nao esperou a trava');
    } finally {
      reservaDaOs.osAbertaDoRecebimento = original;
      soltar();
    }
    const r = await pInsp;
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.lote_impedido, 'L1');
    await pLote;
    assert.deepStrictEqual(await reservas(c.R1), [4]);
    const [res] = await reservasCompletas(c.R1);
    assert.ok(String(res.observacoes || '').includes('liberação do lote L1'), `quem reservou foi a liberacao do lote: ${res.observacoes}`);
  });

  // ── RN-229.09b (Fase 2, achado 1): a leitura do lote e DENTRO da secao — a liberacao do lote enfileirada antes da inspecao vale ──────
  await test('[RN-229.09b] trava segurada pelo teste; o PUT L1 -> ATIVO entra na fila ANTES da inspecao; soltar -> a inspecao le ATIVO e reserva 4', async () => {
    const c = await montar();
    let soltar; const segura = new Promise((res) => { soltar = res; });
    const pTrava = trava.comLockDoMaterial(c.m.id, () => segura);
    let pLote; let pInsp;
    try {
      await new Promise((res) => setTimeout(res, 20));
      pLote = Promise.resolve(statusLote(c.m, 'L1', 'ATIVO'));
      await new Promise((res) => setTimeout(res, 80));
      assert.strictEqual(await statusLoteDe(c.m, 'L1'), 'BLOQUEADO', 'premissa: o PUT espera a trava');
      pInsp = Promise.resolve(inspecionar(c.it.id, 4, 0)); // as leituras de antes da trava (o item, as medidas) veem L1 BLOQUEADO
      await new Promise((res) => setTimeout(res, 80));
      assert.strictEqual(Number((await itemRec(c.rec, c.m)).quantidade_em_inspecao), 4, 'premissa: a inspecao espera a trava');
    } finally {
      soltar();
    }
    await pTrava;
    await pLote;
    const r = await pInsp;
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await statusLoteDe(c.m, 'L1'), 'ATIVO');
    assert.strictEqual(r.body.lote_impedido, undefined, 'a inspecao usou o status do lote lido antes da secao');
    assert.deepStrictEqual(await reservas(c.R1), [4]);
  });

  terminou = true;
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
