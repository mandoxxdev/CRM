/**
 * Etapa 172 (T2) — o casamento da requisicao com a reserva da OS por `os_id` (RN-172.04/05, emendas I3 e I5), nas duas
 * portas da 171: a FILA da chegada (nota de pedido com OS -> requisicoes da OS primeiro) e a CONVERSAO na aprovacao.
 *
 * - Requisicao COM `os_id`: casa SO pelo id (o texto nao conta). Requisicao SEM `os_id`: pelo texto, como na 171.
 * - A reserva criada para a requisicao (fila e aprovacao) grava o `os_id` da requisicao (antes sempre null).
 * - I5: o `os_id` NAO vai para a saida da entrega.
 * - A "forma legada" (os_id 7 com texto "42") nao se cria mais pela rota (C2 sobrescreve o texto): e semeada por INSERT,
 *   com uma OUTRA OS de numero "42" — se o casamento fosse pelo texto, a requisicao iria para ela.
 * - Ponta a ponta: requisicao criada por POST /api/requisicoes-material com `os_id` (o payload que a cesta vai mandar,
 *   usuario sem modulo almoxarifado) -> pedido de compra da mesma OS recebido -> a reserva vai para a requisicao ->
 *   separar/entregar pela rota.
 *
 * O harness nao tem `ordens_servico` (tabela core): o teste a cria com as colunas que as portas leem.
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa172-requisicao-com-os-cadastrada-e-cesta-com-os.md
 * Executar: cd server && node tests/api/requisicaoOsIdCasaReservaDaOs.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1741, nome: 'Admin E172T2', role: 'admin', is_superadmin: 1, email: 'e172t2a@test.com' };
const SOL = { id: 1742, nome: 'Solicitante E172T2', role: 'admin', is_superadmin: 1, email: 'e172t2s@test.com' };
const COMERCIAL = { id: 1743, nome: 'Vendedor E172T2', role: 'usuario', email: 'e172t2c@test.com' };
const API = '/api/almoxarifado';
const EM_ESPERA = ['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'];

(async () => {
  console.log('\n=== Etapa 172 (T2): requisicao casa com a reserva da OS por os_id ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('liberacao_valor_ativo', '0');
  await cfg('aprovacao_automatica', '0');

  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, cliente_id INTEGER,
    tipo_os TEXT NOT NULL DEFAULT 'producao', status TEXT DEFAULT 'pendente', data_abertura DATE NOT NULL DEFAULT '2026-10-22')`);
  // A OS 7 e a OS de numero "42" (outra) — a forma legada do I3.
  await dbRun(db, "INSERT INTO ordens_servico (id, numero_os, status) VALUES (7, 'E172T2-SETE', 'em_andamento')");
  await dbRun(db, "INSERT INTO ordens_servico (id, numero_os, status) VALUES (8, '42', 'em_andamento')");
  const OS7 = { id: 7, numero: 'E172T2-SETE' };
  const OS42 = { id: 8, numero: '42' };
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn E172T2','17220000000172','ativo')")).lastID;

  let seq = 100;
  const novaOs = async (status = 'em_andamento') => {
    seq += 1;
    const numero = `E172T2-${seq}`;
    const id = (await dbRun(db, 'INSERT INTO ordens_servico (numero_os, status) VALUES (?, ?)', [numero, status])).lastID;
    return { id, numero };
  };
  const material = async () => {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, custo_unitario, ativo, fornecedor_id)
      VALUES (?, ?, 'PC', 0, 0, 0, 10, 1, ?)`, [`E172T2-M${seq}`, `Mat E172T2 ${seq}`, forn])).lastID;
  };
  const pedido = async (m, q, osId) => {
    const p = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn, status: 'pendente', ...(osId ? { os_id: osId } : {}),
      itens: [{ material_id: m, quantidade: q, valor_unitario: 1 }],
    });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    return { id: p.body.id, linha: (await dbGet(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ?', [p.body.id])).id };
  };
  const receber = async (ped, m, q) => {
    seq += 1;
    const itens = [{ material_id: m, pedido_item_id: ped.linha, quantidade: q, quantidade_recebida: q }];
    const c = await request(app).post(`${API}/recebimentos`).send({ tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: ped.id, itens });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const id = c.body.id;
    assert.strictEqual((await request(app).put(`${API}/recebimentos/${id}/conferir`).send({ itens })).status, 200);
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      // eslint-disable-next-line no-await-in-loop
      const r = await request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao });
      assert.strictEqual(r.status, 200, acao + JSON.stringify(r.body));
    }
    const f = await request(app).put(`${API}/recebimentos/${id}/fiscal`).send({
      nota_fiscal: `NF-E172T2-${seq}`, fornecedor_id: forn, fornecedor_nome: 'Forn E172T2',
      data_emissao_nf: '2026-10-20', data_entrada_nf: '2026-10-21', valor_total_nota: q, itens,
    });
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    const p = await request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    return id;
  };
  const ativasOs = (m) => dbAll(db, `SELECT * FROM reservas_material_almoxarifado
    WHERE material_id = ? AND origem = 'MANUAL' AND os_id IS NOT NULL AND status = 'ATIVA' ORDER BY id`, [m]);
  const saldoOsAtivo = async (m) => (await ativasOs(m)).reduce((s, r) => s + Number(r.quantidade) - Number(r.quantidade_utilizada || 0), 0);
  const reservasReq = (reqId) => dbAll(db, `SELECT quantidade, quantidade_utilizada, os_id, status FROM reservas_material_almoxarifado
    WHERE requisicao_id = ? ORDER BY id`, [reqId]);
  const holdReq = async (reqId) => (await reservasReq(reqId)).filter((r) => r.status === 'ATIVA')
    .reduce((s, r) => s + Number(r.quantidade) - Number(r.quantidade_utilizada || 0), 0);
  const mat = async (m) => ({ ...(await dbGet(db, `SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r
    FROM materiais_almoxarifado WHERE id = ?`, [m])) });
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const itemDe = async (reqId) => (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [reqId])).id;
  const aprovar = async (id) => {
    const r = await request(app).put(`${API}/requisicoes/${id}/aprovar`).send({});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.status;
  };
  /** Pela rota (o texto vira o numero da OS se houver os_id — C2). */
  const criar = async (m, q, { osId, osReferencia } = {}) => as(SOL, async () => {
    const r = await request(app).post(`${API}/requisicoes`).send({
      ...(osReferencia !== undefined ? { os_referencia: osReferencia } : {}), ...(osId ? { os_id: osId } : {}),
      itens: [{ material_id: m, quantidade: q }],
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body.id;
  });
  /** Semente LEGADA por INSERT: os_id e texto que a rota nao deixaria juntos (C2). */
  const semear = async (m, q, { osId, osReferencia }) => {
    seq += 1;
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, departamento, setor, os_referencia, os_id, status, tipo_requisicao, ativo)
      VALUES (?, ?, ?, NULL, NULL, ?, ?, 'PENDENTE', 'CONSUMO', 1)`,
    [`REQ-E172T2-${seq}`, SOL.id, SOL.nome, osReferencia, osId])).lastID;
    await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?, ?, ?)', [id, m, q]);
    return id;
  };
  const esperar = async (id) => {
    assert.ok(EM_ESPERA.includes(await aprovar(id)), 'premissa: sem saldo a aprovacao espera');
    return id;
  };

  // ══════════════ a FILA da chegada (RN-171.12 a com RN-172.04) ══════════════
  await test('[I3 fila] sem os_id e texto que casa: continua casando (fallback da 171) — a requisicao leva 4, a reserva dela fica com os_id NULL', async () => {
    const m = await material();
    const R = await esperar(await criar(m, 4, { osReferencia: ` os ${OS7.numero.toLowerCase()} ` }));
    await receber(await pedido(m, 10, OS7.id), m, 10);
    assert.strictEqual(await holdReq(R), 4);
    assert.deepStrictEqual((await reservasReq(R)).map((r) => r.os_id), [null], 'sem OS cadastrada, a reserva nao inventa uma');
    assert.strictEqual(await saldoOsAtivo(m), 6);
  });

  await test('[I3 fila, legado por INSERT] os_id 7 com texto "42" (e existe a OS "42"): casa com a OS 7 pelo id; a reserva da requisicao grava os_id 7 (RN-172.05)', async () => {
    const m = await material();
    const R = await esperar(await semear(m, 3, { osId: OS7.id, osReferencia: '42' }));
    await receber(await pedido(m, 10, OS7.id), m, 10);
    assert.strictEqual(await holdReq(R), 3, 'a fila da OS 7 serviu a requisicao da OS 7');
    assert.deepStrictEqual((await reservasReq(R)).map((r) => r.os_id), [OS7.id]);
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA');
    assert.strictEqual(await saldoOsAtivo(m), 7);
  });

  await test('[I3 fila, legado por INSERT] os_id 7 com texto "42": a nota da OS "42" NAO a serve (o texto nao conta com os_id)', async () => {
    const m = await material();
    const R = await esperar(await semear(m, 3, { osId: OS7.id, osReferencia: '42' }));
    await receber(await pedido(m, 10, OS42.id), m, 10);
    assert.strictEqual(await holdReq(R), 0);
    assert.ok(EM_ESPERA.includes(await st(R)), await st(R));
    assert.strictEqual(await saldoOsAtivo(m), 10, 'tudo virou reserva da OS "42"');
  });

  await test('[RN-172.04 fila] sem os_id, texto "42" e OS de numero "OS-042": continua NAO casando (C426, a regua do texto nao mudou)', async () => {
    const os = await dbRun(db, "INSERT INTO ordens_servico (numero_os, status) VALUES ('OS-042', 'em_andamento')");
    const m = await material();
    const R = await esperar(await criar(m, 2, { osReferencia: '42' }));
    await receber(await pedido(m, 5, os.lastID), m, 5);
    assert.strictEqual(await holdReq(R), 0);
  });

  // ══════════════ a CONVERSAO na aprovacao (RN-171.12 b com RN-172.04) ══════════════
  await test('[I3 aprovacao] sem os_id e texto que casa: aprovar continua convertendo da reserva da OS', async () => {
    const m = await material();
    await receber(await pedido(m, 10, OS7.id), m, 10);
    const R = await criar(m, 6, { osReferencia: OS7.numero.toUpperCase() });
    assert.strictEqual(await aprovar(R), 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual([await holdReq(R), await saldoOsAtivo(m)], [6, 4]);
    assert.deepStrictEqual((await reservasReq(R)).map((r) => r.os_id), [null]);
  });

  await test('[I3 aprovacao, legado por INSERT] os_id 7 com texto "42": aprovar converte da OS 7 (nao da "42"); a reserva da requisicao grava os_id 7', async () => {
    const m = await material();
    await receber(await pedido(m, 10, OS7.id), m, 10);
    await receber(await pedido(m, 10, OS42.id), m, 10);
    const R = await semear(m, 4, { osId: OS7.id, osReferencia: '42' });
    assert.strictEqual(await aprovar(R), 'TOTALMENTE_RESERVADA');
    assert.strictEqual(await holdReq(R), 4);
    assert.deepStrictEqual((await reservasReq(R)).map((r) => r.os_id), [OS7.id]);
    const porOs = await dbAll(db, `SELECT os_id, SUM(quantidade - COALESCE(quantidade_utilizada,0)) s FROM reservas_material_almoxarifado
      WHERE material_id = ? AND origem = 'MANUAL' AND status = 'ATIVA' GROUP BY os_id ORDER BY os_id`, [m]);
    assert.deepStrictEqual(porOs.map((x) => [x.os_id, Number(x.s)]), [[OS7.id, 6], [OS42.id, 10]], 'saiu da 7, a "42" intacta');
  });

  await test('[I3 aprovacao] os_id de OUTRA OS com texto igual ao numero da OS 7: nao converte a reserva da 7 (espera)', async () => {
    const outra = await novaOs();
    const m = await material();
    await receber(await pedido(m, 10, OS7.id), m, 10);
    const R = await semear(m, 2, { osId: outra.id, osReferencia: OS7.numero });
    assert.ok(EM_ESPERA.includes(await aprovar(R)), await st(R));
    assert.deepStrictEqual([await holdReq(R), await saldoOsAtivo(m)], [0, 10]);
  });

  await test('[RN-172.05 aprovacao] requisicao com os_id e saldo LIVRE (sem reserva da OS): a reserva comum da aprovacao grava o os_id', async () => {
    const os = await novaOs();
    const m = await material();
    const e = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m, tipo: 'ENTRADA', quantidade: 5, motivo: 'setup e172' });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
    const R = await criar(m, 2, { osId: os.id });
    assert.strictEqual(await aprovar(R), 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual((await reservasReq(R)).map((r) => r.os_id), [os.id]);
    const movRes = await dbGet(db, "SELECT os_id FROM movimentacoes_almoxarifado WHERE tipo = 'RESERVA' AND requisicao_id = ?", [R]);
    assert.strictEqual(movRes.os_id, os.id, 'o livro da reserva tambem leva a OS');
  });

  // ══════════════ ponta a ponta pela porta da cesta ══════════════
  const criarPelaCesta = async (m, q, osId) => as(COMERCIAL, async () => {
    const r = await request(app).post('/api/requisicoes-material').send({
      setor: 'Comercial', departamento: 'Comercial', modulo_origem: 'comercial', observacoes: '', tipo_requisicao: 'CONSUMO',
      justificativa: '', salvar_rascunho: false, os_id: String(osId), itens: [{ material_id: m, quantidade: q }],
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body.id;
  });
  const separarEntregar = async (R, q) => {
    const it = await itemDe(R);
    const sep = await request(app).put(`${API}/requisicoes/${R}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: q }] });
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
    const ent = await request(app).put(`${API}/requisicoes/${R}/entregar`).send({ itens_atendidos: [{ item_id: it, quantidade_atendida: q }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
  };

  await test('[ponta a ponta, fila] cesta (POST /requisicoes-material com os_id, usuario sem modulo) -> aprovar espera -> pedido da MESMA OS recebido -> a reserva vai para a requisicao -> separa e entrega 4; a saida NAO leva os_id (I5)', async () => {
    const os = await novaOs();
    const m = await material();
    const R = await criarPelaCesta(m, 4, os.id);
    assert.deepStrictEqual({ ...(await dbGet(db, 'SELECT os_id, os_referencia FROM requisicoes_almoxarifado WHERE id = ?', [R])) },
      { os_id: os.id, os_referencia: os.numero });
    await esperar(R);
    await receber(await pedido(m, 10, os.id), m, 10);
    assert.strictEqual(await holdReq(R), 4);
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual((await reservasReq(R)).map((r) => r.os_id), [os.id]);
    await separarEntregar(R, 4);
    assert.deepStrictEqual(await mat(m), { q: 6, r: 6 }, 'entregou 4; os 6 da OS continuam presos para ela');
    const saidas = await dbAll(db, "SELECT os_id FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA'", [R]);
    assert.ok(saidas.length > 0, 'premissa: houve saida');
    assert.deepStrictEqual(saidas.map((s) => s.os_id), saidas.map(() => null), 'I5: a saida da entrega nao leva os_id');
  });

  await test('[ponta a ponta, conversao] pedido da OS recebido ANTES -> cesta cria com os_id e texto de OUTRA OS (C2 o sobrescreve) -> aprovar converte da OS -> separa e entrega 3', async () => {
    const os = await novaOs();
    const m = await material();
    await receber(await pedido(m, 10, os.id), m, 10);
    const R = await as(COMERCIAL, async () => {
      const r = await request(app).post('/api/requisicoes-material').send({
        setor: 'Comercial', departamento: 'Comercial', modulo_origem: 'comercial', tipo_requisicao: 'CONSUMO',
        salvar_rascunho: false, os_id: os.id, os_referencia: OS42.numero, itens: [{ material_id: m, quantidade: 3 }],
      });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      return r.body.id;
    });
    assert.strictEqual((await dbGet(db, 'SELECT os_referencia FROM requisicoes_almoxarifado WHERE id = ?', [R])).os_referencia, os.numero);
    assert.strictEqual(await aprovar(R), 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual([await holdReq(R), await saldoOsAtivo(m)], [3, 7]);
    await separarEntregar(R, 3);
    assert.deepStrictEqual(await mat(m), { q: 7, r: 7 });
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
