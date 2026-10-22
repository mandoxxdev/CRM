/**
 * Etapa 176 (T1) — o recebimento informa a OS (material de cliente para industrializacao).
 *
 * Regras (plano + emendas da Revisao da Fase 2, que prevalecem):
 *   RN-176.01  `os_id` opcional no POST, regua da 171 (`OS inválida`; `OS #<id> não encontrada`).
 *   RN-176.02  recebimento de pedido: a OS e a do pedido (payload divergente -> 400; igual -> aceito e NAO gravado — C1).
 *   RN-176.03  OS fechada no POST (sem pedido) -> 400 `A OS <n> está <status> — não aceita entrada nova`.
 *   RN-176.04  guarda do dono por item (+ M2: OS sem cliente recusa material de cliente; um item ruim recusa a nota inteira),
 *              na criacao E na pre-checagem do processamento (I4).
 *   RN-176.05  `osDoRecebimento` e a regua unica (C1/I1): pedido gravado -> a OS VIVA do pedido; senao o `os_id` proprio.
 *              A entrada grava o `os_id` (I2), o livre vira reserva da OS, a fila da OS e servida (I3 — a regra do dono ve a
 *              OS), a requisicao da OS converte (M1 confere o dono antes), a OS que fecha solta.
 *   RN-176.06  `PREDICADO_RESERVA_DA_OS` com uma definicao so (M5: reexport).
 *   RN-176.08  leituras (M3/M4): aux de OS com `?abertas=1` e `cliente_id`; pedido para recebimento e lista com
 *              `os_id`/`os_numero`; lista e detalhe do recebimento com o `os_id` efetivo e `os_numero` (`OS #<id>` se sumiu).
 *
 * Tudo pela ROTA (recebimento pelas seis portas, requisicao criada/aprovada/separada/entregue pela rota). Excecoes declaradas:
 * a troca do dono do material e da OS do pedido sao `UPDATE` (o que esta em prova e a leitura viva no processamento, nao a
 * porta que troca), e a OS fechando chama `osEncerradaService.liberarReservasDaOs` (a rota da OS e core, fora do harness).
 * O harness nao tem `ordens_servico`/`projetos` (tabelas core): o teste as cria.
 *
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa176-recebimento-com-os.md
 * Executar: cd server && node tests/api/recebimentoComOs.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const reservaDaOs = require('../../services/almoxarifado/reservaDaOs');
const osEncerradaService = require('../../services/almoxarifado/osEncerradaService');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}

const ADMIN = { id: 1761, nome: 'Admin E176T1', role: 'admin', is_superadmin: 1, email: 'e176t1a@test.com' };
const SOL = { id: 1762, nome: 'Solicitante E176T1', role: 'admin', is_superadmin: 1, email: 'e176t1s@test.com' };
const API = '/api/almoxarifado';
const EM_ESPERA = ['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'];

(async () => {
  console.log('\n=== Etapa 176 (T1): o recebimento informa a OS ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('liberacao_valor_ativo', '0');
  await cfg('aprovacao_automatica', '0');
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, cliente_id INTEGER,
    tipo_os TEXT NOT NULL DEFAULT 'producao', status TEXT DEFAULT 'pendente', data_abertura DATE NOT NULL DEFAULT '2026-10-22')`);
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS projetos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)');
  const cliA = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente A E176')")).lastID;
  const cliB = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente B E176')")).lastID;
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn E176','17600000000176','ativo')")).lastID;

  let seq = 0;
  const novaOs = async (clienteId, status = 'em_andamento') => {
    seq += 1;
    const numero = `E176-OS${seq}`;
    const id = (await dbRun(db, 'INSERT INTO ordens_servico (numero_os, cliente_id, status) VALUES (?, ?, ?)',
      [numero, clienteId, status])).lastID;
    return { id, numero };
  };
  const material = async (cliente = null) => {
    seq += 1;
    const codigo = `E176-M${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, custo_unitario, ativo, fornecedor_id,
       proprietario_cliente_id)
      VALUES (?, ?, 'PC', 0, 0, 0, 10, 1, ?, ?)`, [codigo, codigo, forn, cliente])).lastID;
    return { id, codigo };
  };
  const pedido = async (m, q, osId) => {
    const p = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn, status: 'pendente', ...(osId ? { os_id: osId } : {}),
      itens: [{ material_id: m, quantidade: q, valor_unitario: 1 }],
    });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    return { id: p.body.id, linha: (await dbGet(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ?', [p.body.id])).id };
  };
  const contarRecebimentos = async () => (await dbGet(db, 'SELECT COUNT(*) n FROM recebimentos_material_almoxarifado')).n;
  /** POST da NF de cliente (sem pedido). `itens`: [{ m, q }]. */
  const postNf = (itens, extra = {}) => {
    seq += 1;
    return request(app).post(`${API}/recebimentos`).send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: `NF-E176-${seq}`, fornecedor_nome: 'Cliente remetente E176',
      itens: itens.map(({ m, q }) => ({ material_id: m, quantidade: q, quantidade_recebida: q })), ...extra,
    });
  };
  const postPedido = (ped, m, q, extra = {}) => request(app).post(`${API}/recebimentos`).send({
    tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: ped.id,
    itens: [{ material_id: m, pedido_item_id: ped.linha, quantidade: q, quantidade_recebida: q }], ...extra,
  });
  /** Leva o recebimento criado ate EM_ENTRADA_NF (conferir -> compras -> faturamento -> fiscal). */
  const ateFaturamento = async (rec) => {
    const its = await dbAll(db, 'SELECT id, material_id, quantidade_recebida FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [rec]);
    const itens = its.map((i) => ({ id: i.id, material_id: i.material_id, quantidade_recebida: i.quantidade_recebida }));
    const c = await request(app).put(`${API}/recebimentos/${rec}/conferir`).send({ itens });
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      // eslint-disable-next-line no-await-in-loop
      const r = await request(app).post(`${API}/recebimentos/${rec}/workflow`).send({ acao });
      assert.strictEqual(r.status, 200, acao + JSON.stringify(r.body));
    }
    const f = await request(app).put(`${API}/recebimentos/${rec}/fiscal`).send({
      fornecedor_nome: 'Cliente remetente E176', data_emissao_nf: '2026-10-20', data_entrada_nf: '2026-10-21',
      valor_total_nota: 1, ...(await dbGet(db, 'SELECT nota_fiscal FROM recebimentos_material_almoxarifado WHERE id = ?', [rec])).nota_fiscal
        ? {} : { nota_fiscal: `NF-E176-P${rec}` },
    });
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
  };
  const processar = (rec) => request(app).post(`${API}/recebimentos/${rec}/workflow`).send({ acao: 'processar' });
  const receberNf = async (itens, osId) => {
    const c = await postNf(itens, { os_id: osId });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    await ateFaturamento(c.body.id);
    const p = await processar(c.body.id);
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    return c.body.id;
  };
  const movEntrada = (rec) => dbGet(db, "SELECT * FROM movimentacoes_almoxarifado WHERE recebimento_id = ? AND tipo = 'ENTRADA_COMPRA'", [rec]);
  const ativasOs = (m) => dbAll(db, `SELECT * FROM reservas_material_almoxarifado
    WHERE material_id = ? AND origem = 'MANUAL' AND os_id IS NOT NULL AND status = 'ATIVA' ORDER BY id`, [m]);
  const saldoOs = async (m) => (await ativasOs(m)).reduce((s, r) => s + Number(r.quantidade) - Number(r.quantidade_utilizada || 0), 0);
  const holdReq = async (reqId) => (await dbAll(db, `SELECT quantidade, quantidade_utilizada FROM reservas_material_almoxarifado
    WHERE requisicao_id = ? AND status = 'ATIVA'`, [reqId])).reduce((s, r) => s + Number(r.quantidade) - Number(r.quantidade_utilizada || 0), 0);
  const criarReq = async (m, q, { osId = null, projetoId = null } = {}) => as(SOL, async () => {
    const r = await request(app).post(`${API}/requisicoes`)
      .send({ os_id: osId, ...(projetoId ? { projeto_id: projetoId } : {}), itens: [{ material_id: m, quantidade: q }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body.id;
  });
  const aprovar = async (id) => {
    const r = await request(app).put(`${API}/requisicoes/${id}/aprovar`).send({});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.status;
  };
  const osDoRec = async (rec) => (await dbGet(db, 'SELECT os_id FROM recebimentos_material_almoxarifado WHERE id = ?', [rec])).os_id;
  const msgDono = (codigo, dono, os, outro) => `Material ${codigo} pertence ao cliente ${dono}, mas a OS ${os} é do cliente ${outro}`;

  // ══════════════ RN-176.01 / RN-176.05 / I2 — o fluxo do cliente ══════════════
  await test('[RN-176.01, RN-176.05, I2] NF de cliente A sem pedido com OS de A: grava os_id; ENTRADA_COMPRA com os_id; o livre vira reserva da OS', async () => {
    const os = await novaOs(cliA);
    const m = await material(cliA);
    const rec = await receberNf([{ m: m.id, q: 10 }], os.id);
    assert.strictEqual(await osDoRec(rec), os.id, 'RN-176.01: o recebimento gravou a OS');
    assert.strictEqual((await movEntrada(rec)).os_id, os.id, 'I2: a entrada grava a OS do recebimento');
    const res = await ativasOs(m.id);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].os_id, os.id);
    assert.strictEqual(res[0].recebimento_id, rec);
    assert.strictEqual(Number(res[0].quantidade), 10, 'RN-176.05: a reserva da OS nasce da nota sem pedido');
  });

  await test('[RN-176.01] os_id invalido -> 400 "OS inválida"; inexistente -> 400 "OS #<id> não encontrada"; nada gravado', async () => {
    const m = await material(cliA);
    const antes = await contarRecebimentos();
    for (const v of ['abc', 0, -1, 1.5, true]) {
      // eslint-disable-next-line no-await-in-loop
      const r = await postNf([{ m: m.id, q: 1 }], { os_id: v });
      assert.strictEqual(r.status, 400, `${v}: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, 'Dados inválidos — os_id: OS inválida', 'a regua da 171/172 (Zod)');
    }
    // a mesma regua no SERVICO, para quem chama sem passar pelo Zod
    await assert.rejects(receiptService.criarRecebimento(db, ADMIN, { tipo_recebimento: 'NOTA_FISCAL', os_id: 'abc',
      itens: [{ material_id: m.id, quantidade: 1 }] }), (e) => e.status === 400 && e.message === 'OS inválida');
    const r = await postNf([{ m: m.id, q: 1 }], { os_id: 987654 });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'OS #987654 não encontrada');
    assert.strictEqual(await contarRecebimentos(), antes);
  });

  await test('[RN-176.01] sem os_id (ausente, null, "") nada muda: 201 com os_id NULL', async () => {
    const m = await material();
    for (const extra of [{}, { os_id: null }, { os_id: '' }]) {
      // eslint-disable-next-line no-await-in-loop
      const r = await postNf([{ m: m.id, q: 1 }], extra);
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual(await osDoRec(r.body.id), null);
    }
  });

  await test('[RN-176.03] OS fechada no POST -> 400 "A OS <n> está <status> — não aceita entrada nova"; nada gravado', async () => {
    const os = await novaOs(cliA, 'concluida');
    const m = await material(cliA);
    const antes = await contarRecebimentos();
    const r = await postNf([{ m: m.id, q: 1 }], { os_id: os.id });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `A OS ${os.numero} está concluida — não aceita entrada nova`);
    assert.strictEqual(await contarRecebimentos(), antes);
  });

  // ══════════════ RN-176.04 + M2 — a guarda do dono na criacao ══════════════
  await test('[RN-176.04] material do cliente A + OS do cliente B -> 400 com a frase literal; nada gravado', async () => {
    const os = await novaOs(cliB);
    const m = await material(cliA);
    const antes = await contarRecebimentos();
    const r = await postNf([{ m: m.id, q: 3 }], { os_id: os.id });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, msgDono(m.codigo, 'Cliente A E176', os.numero, 'Cliente B E176'));
    assert.strictEqual(await contarRecebimentos(), antes);
  });

  await test('[RN-176.04, M2] material de cliente + OS SEM cliente -> 400 "... mas a OS <n> não tem cliente"', async () => {
    const os = await novaOs(null);
    const m = await material(cliA);
    const r = await postNf([{ m: m.id, q: 3 }], { os_id: os.id });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Material ${m.codigo} pertence ao cliente Cliente A E176, mas a OS ${os.numero} não tem cliente`);
  });

  await test('[RN-176.04] material proprio passa com OS de qualquer cliente e com OS sem cliente', async () => {
    const m = await material(null);
    for (const os of [await novaOs(cliB), await novaOs(null)]) {
      // eslint-disable-next-line no-await-in-loop
      const r = await postNf([{ m: m.id, q: 1 }], { os_id: os.id });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual(await osDoRec(r.body.id), os.id);
    }
  });

  await test('[RN-176.04, M2] itens de donos diferentes: o item do outro cliente recusa a nota INTEIRA (nada gravado)', async () => {
    const os = await novaOs(cliA);
    const mA = await material(cliA);
    const mB = await material(cliB);
    const mP = await material(null);
    const antes = await contarRecebimentos();
    const r = await postNf([{ m: mA.id, q: 1 }, { m: mP.id, q: 1 }, { m: mB.id, q: 1 }], { os_id: os.id });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, msgDono(mB.codigo, 'Cliente B E176', os.numero, 'Cliente A E176'));
    assert.strictEqual(await contarRecebimentos(), antes);
  });

  // ══════════════ I4 — a guarda roda tambem no processamento ══════════════
  await test('[I4] dono trocado entre criar e processar -> a nota e recusada no processamento (nada entra)', async () => {
    const os = await novaOs(cliA);
    const m = await material(cliA);
    const c = await postNf([{ m: m.id, q: 4 }], { os_id: os.id });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    await ateFaturamento(c.body.id);
    // material sem historico troca de dono sem permissao (ownerRules.js:412-421) — aqui por UPDATE, o que esta em prova e a releitura
    await dbRun(db, 'UPDATE materiais_almoxarifado SET proprietario_cliente_id = ? WHERE id = ?', [cliB, m.id]);
    const p = await processar(c.body.id);
    assert.strictEqual(p.status, 400, JSON.stringify(p.body));
    assert.strictEqual(p.body.error, `Nao foi possivel dar entrada no estoque: ${msgDono(m.codigo, 'Cliente B E176', os.numero, 'Cliente A E176')}`);
    assert.strictEqual(Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q), 0);
    assert.strictEqual(await movEntrada(c.body.id), undefined);
  });

  await test('[M2] OS que sumiu entre criar e processar -> a nota processa (com a marca os_id) e NAO reserva', async () => {
    const os = await novaOs(cliA);
    const m = await material(cliA);
    const c = await postNf([{ m: m.id, q: 4 }], { os_id: os.id });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    await ateFaturamento(c.body.id);
    await dbRun(db, 'DELETE FROM ordens_servico WHERE id = ?', [os.id]);
    const p = await processar(c.body.id);
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    assert.strictEqual((await movEntrada(c.body.id)).os_id, os.id);
    assert.strictEqual(await saldoOs(m.id), 0);
  });

  // ══════════════ RN-176.02 / C1 — recebimento de pedido ══════════════
  await test('[RN-176.02, C1] pedido com OS + os_id divergente -> 400 "(<numero do pedido>)"; pedido sem OS + os_id -> "(sem OS)"; igual -> 201 sem gravar', async () => {
    const os1 = await novaOs(cliA);
    const os2 = await novaOs(cliA);
    const m = await material(null);
    const pedCom = await pedido(m.id, 10, os1.id);
    const pedSem = await pedido(m.id, 10, null);
    const antes = await contarRecebimentos();
    const r1 = await postPedido(pedCom, m.id, 2, { os_id: os2.id });
    assert.strictEqual(r1.status, 400, JSON.stringify(r1.body));
    assert.strictEqual(r1.body.error, `A OS do recebimento tem de ser a do pedido (${os1.numero})`);
    const r2 = await postPedido(pedSem, m.id, 2, { os_id: os2.id });
    assert.strictEqual(r2.status, 400, JSON.stringify(r2.body));
    assert.strictEqual(r2.body.error, 'A OS do recebimento tem de ser a do pedido (sem OS)');
    assert.strictEqual(await contarRecebimentos(), antes);
    const ok = await postPedido(pedCom, m.id, 2, { os_id: os1.id });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    assert.strictEqual(await osDoRec(ok.body.id), null, 'C1: recebimento de pedido NAO grava os_id proprio');
    const sem = await postPedido(pedCom, m.id, 2, { os_id: null });
    assert.strictEqual(sem.status, 201, JSON.stringify(sem.body));
  });

  // Fase 5 (B1153): ESTAVA "a guarda do dono usa a OS do pedido -> 400". Com pedido a guarda NAO recusa (o almoxarife nao
  // escolheu a OS, e o pedido ja recebido nao se edita: recusar travava o pedido para sempre) — o material entra LIVRE e a
  // reserva da OS nao nasce (a conferencia do dono sob a trava, `reservarParaOsSobTrava`).
  await test('[Fase 5, B1153] recebimento de pedido com OS ABERTA de outro cliente: 201, processa e o material entra LIVRE (sem reserva da OS)', async () => {
    const osB = await novaOs(cliB);
    const m = await material(cliA);
    const ped = await pedido(m.id, 10, osB.id);
    const r = await postPedido(ped, m.id, 2);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    await ateFaturamento(r.body.id);
    const p = await processar(r.body.id);
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    assert.strictEqual((await movEntrada(r.body.id)).os_id, osB.id, 'a marca de origem fica');
    assert.strictEqual(await saldoOs(m.id), 0, 'sem reserva da OS do outro cliente');
    const mat = await dbGet(db, 'SELECT quantidade_atual q, quantidade_reservada r FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    assert.deepStrictEqual([Number(mat.q), Number(mat.r)], [2, 0]);
  });

  await test('[I1] trocar a OS do pedido depois de criar o recebimento -> a entrada e a reserva vao para a OS NOVA', async () => {
    const os1 = await novaOs(cliA);
    const os2 = await novaOs(cliA);
    const m = await material(null);
    const ped = await pedido(m.id, 6, os1.id);
    const c = await postPedido(ped, m.id, 6);
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    await dbRun(db, 'UPDATE pedidos_compra SET os_id = ? WHERE id = ?', [os2.id, ped.id]);
    await ateFaturamento(c.body.id);
    const p = await processar(c.body.id);
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    assert.strictEqual((await movEntrada(c.body.id)).os_id, os2.id);
    const res = await ativasOs(m.id);
    assert.deepStrictEqual(res.map((x) => [x.os_id, Number(x.quantidade)]), [[os2.id, 6]]);
  });

  await test('[C1, /fiscal] ligar pedido de OUTRA OS a um recebimento com OS propria -> 400; de MESMA OS -> 200 e limpa o os_id proprio', async () => {
    const osA = await novaOs(cliA);
    const osB = await novaOs(cliA);
    const m = await material(cliA);
    const c = await postNf([{ m: m.id, q: 2 }], { os_id: osA.id });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const pedOutra = await pedido(m.id, 2, osB.id);
    const pedMesma = await pedido(m.id, 2, osA.id);
    const pedSem = await pedido(m.id, 2, null);
    // o recebimento precisa estar num status que aceita /fiscal
    const its = await dbAll(db, 'SELECT id, material_id, quantidade_recebida FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [c.body.id]);
    assert.strictEqual((await request(app).put(`${API}/recebimentos/${c.body.id}/conferir`).send({ itens: its })).status, 200);
    assert.strictEqual((await request(app).post(`${API}/recebimentos/${c.body.id}/workflow`).send({ acao: 'encaminhar_compras' })).status, 200);
    const r1 = await request(app).put(`${API}/recebimentos/${c.body.id}/fiscal`).send({ pedido_compra_id: pedOutra.id });
    assert.strictEqual(r1.status, 400, JSON.stringify(r1.body));
    assert.strictEqual(r1.body.error, `A OS do recebimento tem de ser a do pedido (${osB.numero})`);
    const r0 = await request(app).put(`${API}/recebimentos/${c.body.id}/fiscal`).send({ pedido_compra_id: pedSem.id });
    assert.strictEqual(r0.status, 400, JSON.stringify(r0.body));
    assert.strictEqual(r0.body.error, 'A OS do recebimento tem de ser a do pedido (sem OS)');
    const antes = await dbGet(db, 'SELECT pedido_compra_id, os_id FROM recebimentos_material_almoxarifado WHERE id = ?', [c.body.id]);
    assert.deepStrictEqual(antes, { pedido_compra_id: null, os_id: osA.id }, 'o 400 nao gravou nada');
    const r2 = await request(app).put(`${API}/recebimentos/${c.body.id}/fiscal`).send({ pedido_compra_id: pedMesma.id });
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.body));
    const depois = await dbGet(db, 'SELECT pedido_compra_id, os_id FROM recebimentos_material_almoxarifado WHERE id = ?', [c.body.id]);
    assert.deepStrictEqual(depois, { pedido_compra_id: pedMesma.id, os_id: null }, 'C1: passa a valer a OS do pedido');
  });

  // ══════════════ I3 / RN-171.12 / M1 / RN-171.09 — a OS do cliente na fila, na conversao e no fechamento ══════════════
  await test('[I3] requisicao da OS SEM projeto, aprovada ANTES da nota do material de cliente, e servida pela fila (o resto vira reserva da OS)', async () => {
    const os = await novaOs(cliA);
    const m = await material(cliA);
    const R = await criarReq(m.id, 4, { osId: os.id });
    assert.ok(EM_ESPERA.includes(await aprovar(R)), 'premissa: sem saldo a aprovacao espera');
    await receberNf([{ m: m.id, q: 10 }], os.id);
    assert.strictEqual(await holdReq(R), 4, 'I3: a regra do dono ve a OS da requisicao — a fila a serve');
    assert.strictEqual(await saldoOs(m.id), 6);
  });

  await test('[RN-176.05, RN-171.12] requisicao da OS criada DEPOIS da nota converte a reserva da OS e entrega com a OS', async () => {
    const os = await novaOs(cliA);
    const m = await material(cliA);
    await receberNf([{ m: m.id, q: 10 }], os.id);
    const R = await criarReq(m.id, 5, { osId: os.id });
    assert.strictEqual(await aprovar(R), 'TOTALMENTE_RESERVADA');
    assert.strictEqual(await saldoOs(m.id), 5);
    const it = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R])).id;
    const sep = await request(app).put(`${API}/requisicoes/${R}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: 5 }] });
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
    const ent = await request(app).put(`${API}/requisicoes/${R}/entregar`).send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 5 }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
    const saida = await dbGet(db, "SELECT os_id, quantidade FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA'", [R]);
    assert.deepStrictEqual([saida.os_id, Number(saida.quantidade)], [os.id, 5]);
  });

  await test('[M1] requisicao com projeto do cliente B + OS do cliente A NAO converte a reserva da OS (a entrega recusaria)', async () => {
    const os = await novaOs(cliA);
    const m = await material(cliA);
    await receberNf([{ m: m.id, q: 10 }], os.id);
    const projB = (await dbRun(db, "INSERT INTO projetos (cliente_id, nome) VALUES (?, 'Projeto B E176')", [cliB])).lastID;
    const R = await criarReq(m.id, 3, { osId: os.id, projetoId: projB });
    assert.ok(EM_ESPERA.includes(await aprovar(R)), 'M1: nao converteu');
    assert.strictEqual(await holdReq(R), 0);
    assert.strictEqual(await saldoOs(m.id), 10, 'a reserva da OS ficou inteira');
  });

  await test('[RN-176.05, RN-171.09] a OS que fecha solta a reserva que a nota sem pedido criou', async () => {
    const os = await novaOs(cliA);
    const m = await material(cliA);
    await receberNf([{ m: m.id, q: 7 }], os.id);
    assert.strictEqual(await saldoOs(m.id), 7);
    await dbRun(db, "UPDATE ordens_servico SET status = 'concluida' WHERE id = ?", [os.id]);
    assert.strictEqual(await osEncerradaService.liberarReservasDaOs(db, ADMIN, os.id, 'concluida'), 1);
    assert.strictEqual(await saldoOs(m.id), 0);
  });

  // ══════════════ RN-176.06 / M5 ══════════════
  await test('[RN-176.06, M5] o predicado da reserva da OS tem UMA definicao (osEncerradaService reexporta a de reservaDaOs)', async () => {
    assert.strictEqual(osEncerradaService.PREDICADO_RESERVA_DA_OS, reservaDaOs.PREDICADO_RESERVA_DA_OS_SQL);
    const fonte = fs.readFileSync(path.join(__dirname, '../../services/almoxarifado/osEncerradaService.js'), 'utf8');
    assert.ok(!/recebimento_id IS NOT NULL/.test(fonte), 'osEncerradaService nao pode ter a sua copia do predicado');
  });

  // ══════════════ RN-176.08 / M3 / M4 — leituras ══════════════
  await test('[M3] aux de OS: ?abertas=1 tira as fechadas e toda linha traz cliente_id; sem o parametro nada muda', async () => {
    const aberta = await novaOs(cliA);
    const fechada = await novaOs(cliB, ' Cancelado ');
    const todas = await request(app).get(`${API}/aux/ordens-servico`);
    assert.strictEqual(todas.status, 200);
    assert.ok(todas.body.some((o) => o.id === fechada.id), 'sem ?abertas a fechada continua');
    const abertas = await request(app).get(`${API}/aux/ordens-servico`).query({ abertas: 1 });
    assert.strictEqual(abertas.status, 200);
    assert.ok(!abertas.body.some((o) => o.id === fechada.id), '?abertas=1 tira a fechada');
    const a = abertas.body.find((o) => o.id === aberta.id);
    assert.ok(a, 'a aberta esta la');
    assert.strictEqual(a.cliente_id, cliA);
    assert.strictEqual(a.cliente_nome, 'Cliente A E176');
    assert.strictEqual(todas.body.find((o) => o.id === fechada.id).cliente_id, cliB);
  });

  await test('[M3] pedido para recebimento (detalhe e lista) traz os_id e os_numero', async () => {
    const os = await novaOs(cliA);
    const m = await material(null);
    const ped = await pedido(m.id, 3, os.id);
    const sem = await pedido(m.id, 3, null);
    const d = await request(app).get(`${API}/recebimentos-aux/pedidos-compra/${ped.id}`);
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.deepStrictEqual([d.body.os_id, d.body.os_numero], [os.id, os.numero]);
    const d2 = await request(app).get(`${API}/recebimentos-aux/pedidos-compra/${sem.id}`);
    assert.deepStrictEqual([d2.body.os_id, d2.body.os_numero], [null, null]);
    const l = await request(app).get(`${API}/recebimentos-aux/pedidos-compra`);
    assert.strictEqual(l.status, 200);
    const linha = l.body.find((p) => p.id === ped.id);
    assert.deepStrictEqual([linha.os_id, linha.os_numero], [os.id, os.numero]);
    const linhaSem = l.body.find((p) => p.id === sem.id);
    assert.deepStrictEqual([linhaSem.os_id, linhaSem.os_numero], [null, null]);
  });

  await test('[RN-176.08, M4] lista e detalhe do recebimento: os_id efetivo (proprio ou do pedido) e os_numero vivo; "OS #<id>" se sumiu', async () => {
    const osP = await novaOs(cliA);
    const osN = await novaOs(cliA);
    const osSome = await novaOs(cliA);
    const mP = await material(null);
    const mN = await material(cliA);
    const ped = await pedido(mP.id, 3, osP.id);
    const rp = (await postPedido(ped, mP.id, 3)).body.id;
    const rn = (await postNf([{ m: mN.id, q: 1 }], { os_id: osN.id })).body.id;
    const rs = (await postNf([{ m: mN.id, q: 1 }], { os_id: osSome.id })).body.id;
    const r0 = (await postNf([{ m: mP.id, q: 1 }])).body.id;
    await dbRun(db, 'DELETE FROM ordens_servico WHERE id = ?', [osSome.id]);
    const lista = await request(app).get(`${API}/recebimentos`);
    assert.strictEqual(lista.status, 200);
    const ver = (id) => { const x = lista.body.find((r) => r.id === id); return [x.os_id, x.os_numero]; };
    assert.deepStrictEqual(ver(rp), [osP.id, osP.numero], 'pedido: a OS do pedido');
    assert.deepStrictEqual(ver(rn), [osN.id, osN.numero], 'sem pedido: a OS propria');
    assert.deepStrictEqual(ver(rs), [osSome.id, `OS #${osSome.id}`], 'OS que sumiu');
    assert.deepStrictEqual(ver(r0), [null, null]);
    for (const [id, esperado] of [[rp, [osP.id, osP.numero]], [rn, [osN.id, osN.numero]], [rs, [osSome.id, `OS #${osSome.id}`]], [r0, [null, null]]]) {
      // eslint-disable-next-line no-await-in-loop
      const d = await request(app).get(`${API}/recebimentos/${id}`);
      assert.strictEqual(d.status, 200);
      assert.deepStrictEqual([d.body.os_id, d.body.os_numero], esperado, `detalhe ${id}`);
    }
  });

  // ══════════════ Fase 5 — revisao adversarial ══════════════
  const matQR = async (m) => {
    const x = await dbGet(db, 'SELECT quantidade_atual q, quantidade_reservada r FROM materiais_almoxarifado WHERE id = ?', [m]);
    return [Number(x.q), Number(x.r)];
  };
  await test('[Fase 5, item 1] pedido com OS FECHADA (de outro cliente) + material de cliente: 201, processa e entra como estoque, sem reserva (a 171)', async () => {
    const osB = await novaOs(cliB);
    const m = await material(cliA);
    const ped = await pedido(m.id, 10, osB.id);
    await dbRun(db, "UPDATE ordens_servico SET status = 'concluida' WHERE id = ?", [osB.id]);
    const r = await postPedido(ped, m.id, 3);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    await ateFaturamento(r.body.id);
    const p = await processar(r.body.id);
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    assert.strictEqual(await saldoOs(m.id), 0);
    assert.deepStrictEqual(await matQR(m.id), [3, 0]);
  });

  await test('[Fase 5, item 1, B1153] pedido com OS ABERTA SEM cliente + material de cliente: 201, processa e entra LIVRE (sem reserva)', async () => {
    const os0 = await novaOs(null);
    const m = await material(cliA);
    const ped = await pedido(m.id, 10, os0.id);
    const r = await postPedido(ped, m.id, 4);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    await ateFaturamento(r.body.id);
    const p = await processar(r.body.id);
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    assert.strictEqual(await saldoOs(m.id), 0);
    assert.deepStrictEqual(await matQR(m.id), [4, 0]);
  });

  await test('[Fase 5, item 1] recebimento criado ANTES da 176 (sem a guarda) processa: pedido cuja OS fechou, pedido cuja OS ficou sem cliente, NF propria cuja OS fechou', async () => {
    // O estado "pre-176" e simulado trocando a OS DEPOIS de criar (a criacao de hoje recusaria/aceitaria por outro motivo):
    // o que esta em prova e a pre-checagem do processamento.
    const casos = [];
    for (const [rotulo, mudar] of [['fechada', "status = 'cancelada'"], ['sem cliente', 'cliente_id = NULL']]) {
      const os = await novaOs(cliA);
      const m = await material(cliA);
      const ped = await pedido(m.id, 10, os.id);
      const r = await postPedido(ped, m.id, 5);
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      await dbRun(db, `UPDATE ordens_servico SET ${mudar} WHERE id = ?`, [os.id]);
      casos.push([rotulo, r.body.id, m.id]);
    }
    {
      const os = await novaOs(cliA);
      const m = await material(cliA);
      const c = await postNf([{ m: m.id, q: 5 }], { os_id: os.id });
      assert.strictEqual(c.status, 201, JSON.stringify(c.body));
      await dbRun(db, "UPDATE ordens_servico SET status = 'concluida', cliente_id = ? WHERE id = ?", [cliB, os.id]);
      casos.push(['NF propria fechada', c.body.id, m.id]);
    }
    for (const [rotulo, rec, m] of casos) {
      await ateFaturamento(rec);
      const p = await processar(rec);
      assert.strictEqual(p.status, 200, `${rotulo}: ${JSON.stringify(p.body)}`);
      assert.strictEqual(await saldoOs(m), 0, rotulo);
      assert.deepStrictEqual(await matQR(m), [5, 0], rotulo);
    }
  });

  await test('[Fase 5, item 1] a guarda continua no recebimento SEM pedido com OS aberta: OS sem cliente trocada depois de criar -> 400 no processamento', async () => {
    const os = await novaOs(cliA);
    const m = await material(cliA);
    const c = await postNf([{ m: m.id, q: 2 }], { os_id: os.id });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    await ateFaturamento(c.body.id);
    await dbRun(db, 'UPDATE ordens_servico SET cliente_id = NULL WHERE id = ?', [os.id]);
    const p = await processar(c.body.id);
    assert.strictEqual(p.status, 400, JSON.stringify(p.body));
    assert.strictEqual(p.body.error, `Nao foi possivel dar entrada no estoque: Material ${m.codigo} pertence ao cliente Cliente A E176, mas a OS ${os.numero} não tem cliente`);
  });

  await test('[Fase 5, item 3] retomada parcial: o item que JA entrou nao entra na guarda do processamento (so os que entram agora)', async () => {
    const os = await novaOs(cliA);
    const m1 = await material(cliA);
    const m2 = await material(cliA);
    const c = await postNf([{ m: m1.id, q: 2 }, { m: m2.id, q: 3 }], { os_id: os.id });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    await ateFaturamento(c.body.id);
    // Simula a tentativa anterior que deu entrada no item 1 (por UPDATE: a falha no meio nao e alcancavel pela rota) e o dono
    // do material 1 trocado depois — a guarda nao pode olhar o item que nao entra agora.
    await dbRun(db, `UPDATE recebimentos_material_itens_almoxarifado SET entrada_estoque_em = '2026-10-22 10:00:00'
      WHERE recebimento_id = ? AND material_id = ?`, [c.body.id, m1.id]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET proprietario_cliente_id = ? WHERE id = ?', [cliB, m1.id]);
    const p = await processar(c.body.id);
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    assert.deepStrictEqual(await matQR(m2.id), [3, 3], 'o item 2 entra e vira reserva da OS');
    assert.strictEqual(await saldoOs(m2.id), 3);
    assert.deepStrictEqual(await matQR(m1.id), [0, 0], 'o item 1 nao entra de novo');
  });

  await test('[Fase 5, item 3] tipo NOTA_FISCAL com pedido_compra_id cru (o pedido nao e resolvido): a OS do pedido vale; divergente -> 400 com o numero; igual -> 201 sem gravar', async () => {
    const os1 = await novaOs(cliA);
    const os2 = await novaOs(cliA);
    const m = await material(null);
    const ped = await pedido(m.id, 10, os1.id);
    const r = await postNf([{ m: m.id, q: 1 }], { pedido_compra_id: ped.id, os_id: os2.id });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `A OS do recebimento tem de ser a do pedido (${os1.numero})`);
    const ok = await postNf([{ m: m.id, q: 1 }], { pedido_compra_id: ped.id, os_id: os1.id });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    assert.strictEqual(await osDoRec(ok.body.id), null);
  });

  await test('[Fase 5, item 3] /fiscal com pedido_compra_id que nao resolve (pedido inexistente) num recebimento com OS propria -> 400 "(sem OS)"', async () => {
    const os = await novaOs(cliA);
    const m = await material(null);
    const c = await postNf([{ m: m.id, q: 1 }], { os_id: os.id });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const its = await dbAll(db, 'SELECT id, material_id, quantidade_recebida FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [c.body.id]);
    const cf = await request(app).put(`${API}/recebimentos/${c.body.id}/conferir`).send({ itens: its });
    assert.strictEqual(cf.status, 200, JSON.stringify(cf.body));
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      // eslint-disable-next-line no-await-in-loop
      const w = await request(app).post(`${API}/recebimentos/${c.body.id}/workflow`).send({ acao });
      assert.strictEqual(w.status, 200, acao + JSON.stringify(w.body));
    }
    const f = await request(app).put(`${API}/recebimentos/${c.body.id}/fiscal`).send({ pedido_compra_id: 987654 });
    assert.strictEqual(f.status, 400, JSON.stringify(f.body));
    assert.strictEqual(f.body.error, 'A OS do recebimento tem de ser a do pedido (sem OS)');
    assert.strictEqual(await osDoRec(c.body.id), os.id, 'nada gravado');
  });

  await cfg('inspecao_material_critico', '1');
  try {
    const receberRetido = async (os, q) => {
      const m = await material(cliA);
      await dbRun(db, 'UPDATE materiais_almoxarifado SET material_critico = 1 WHERE id = ?', [m.id]);
      const rec = await receberNf([{ m: m.id, q }], os.id);
      assert.strictEqual(await saldoOs(m.id), 0, 'premissa: retido nao se reserva na chegada');
      return { m, rec };
    };
    const inspecionar = async (rec, m, a) => {
      const it = await dbGet(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? AND material_id = ?', [rec, m]);
      const res = await request(app).post(`${API}/recebimentos/itens/${it.id}/inspecionar`).send({ quantidade_aprovada: a, quantidade_reprovada: 0 });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    };
    await test('[Fase 5, item 3] inspecao de recebimento com OS PROPRIA (NF sem pedido): o aprovado vira reserva da OS', async () => {
      const os = await novaOs(cliA);
      const { m, rec } = await receberRetido(os, 4);
      await inspecionar(rec, m.id, 4);
      const rs = await ativasOs(m.id);
      assert.deepStrictEqual(rs.map((r) => [Number(r.quantidade), r.recebimento_id, r.os_id]), [[4, rec, os.id]]);
    });
    await test('[Fase 5, item 2] a OS troca de cliente entre a chegada e a inspecao: a inspecao NAO reserva para a OS do outro cliente (dono conferido sob a trava)', async () => {
      const os = await novaOs(cliA);
      const { m, rec } = await receberRetido(os, 4);
      // A troca de cliente da OS existe pela rota core (`PUT /api/operacional/ordens-servico/:id` com `cliente_id`), fora do
      // harness — aqui por UPDATE; o que esta em prova e a releitura do dono no momento da reserva.
      await dbRun(db, 'UPDATE ordens_servico SET cliente_id = ? WHERE id = ?', [cliB, os.id]);
      await inspecionar(rec, m.id, 4);
      assert.strictEqual(await saldoOs(m.id), 0, 'sem reserva da OS do cliente B');
      assert.deepStrictEqual(await matQR(m.id), [4, 0], 'o aprovado fica livre');
    });
  } finally { await cfg('inspecao_material_critico', '0'); }

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
