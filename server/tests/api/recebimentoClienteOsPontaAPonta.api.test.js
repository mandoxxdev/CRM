/**
 * Etapa 176 (T3) — integracao ponta a ponta do material de cliente para industrializacao, tudo pela ROTA:
 *
 *   Roteiro 1: material com dono (cliente A) + OS do cliente A -> POST /recebimentos SEM pedido com `os_id` e NF ->
 *   conferir -> workflow (compras, faturamento) -> PUT /fiscal -> workflow processar -> ENTRADA_COMPRA com a OS e o livre
 *   reservado para a OS (RN-176.05) -> requisicao com `os_id` e SEM projeto pela porta da cesta (POST /api/requisicoes-material,
 *   usuario sem modulo almoxarifado) -> aprovar (converte da reserva da OS, RN-171.12) -> separar -> entregar (a SAIDA grava
 *   a OS, RN-174.01) -> GET /materiais-cliente/posicao do cliente A mostra a aplicacao na OS -> relatorio "Consumo por OS"
 *   conta -> devolucao parcial (herda a OS da saida) -> devolvido/liquido.
 *
 *   Roteiro 2: o mesmo comeco; a OS e cancelada (`osEncerradaService.liberarReservasDaOs` — a rota da OS e core, fora do
 *   harness) -> a reserva da OS solta; o saldo do cliente fica intacto (fisico e disponivel) e segregado (nao aparece na
 *   posicao do estoque proprio nem na posicao do cliente B).
 *
 * O harness nao tem `ordens_servico`/`projetos` (tabelas core): o teste as cria com as colunas que as portas leem.
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa176-recebimento-com-os.md (T3)
 * Executar: cd server && node tests/api/recebimentoClienteOsPontaAPonta.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const osEncerradaService = require('../../services/almoxarifado/osEncerradaService');
const { assertSegregado } = require('../helpers/clienteInvariante');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}

const ADMIN = { id: 1763, nome: 'Admin E176T3', role: 'admin', is_superadmin: 1, email: 'e176t3a@test.com' };
const COMERCIAL = { id: 1764, nome: 'Vendedor E176T3', role: 'usuario', email: 'e176t3c@test.com' };
const API = '/api/almoxarifado';

(async () => {
  console.log('\n=== Etapa 176 (T3): NF de cliente com OS -> reserva -> requisicao da OS -> entrega -> posicao/consumo -> devolucao ===\n');
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
  const cliA = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente A E176T3')")).lastID;
  const cliB = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente B E176T3')")).lastID;
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn E176T3','17630000000176','ativo')")).lastID;

  let seq = 0;
  const novaOs = async (clienteId) => {
    seq += 1;
    const numero = `E176T3-OS${seq}`;
    const id = (await dbRun(db, "INSERT INTO ordens_servico (numero_os, cliente_id, status) VALUES (?, ?, 'em_andamento')",
      [numero, clienteId])).lastID;
    return { id, numero };
  };
  const material = async (cliente, qtd = 0) => {
    seq += 1;
    const codigo = `E176T3-M${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, custo_unitario, ativo, fornecedor_id,
       proprietario_cliente_id)
      VALUES (?, ?, 'PC', ?, 0, 0, 10, 1, ?, ?)`, [codigo, codigo, qtd, forn, cliente])).lastID;
    return { id, codigo };
  };

  /** A NF do cliente, sem pedido, com a OS — pelas rotas que a tela de Recebimentos usa, ate processar. */
  const receberNfDoCliente = async (m, q, osId) => {
    seq += 1;
    const nf = `NF-E176T3-${seq}`;
    const c = await request(app).post(`${API}/recebimentos`).send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: nf, fornecedor_nome: 'Cliente A E176T3', os_id: osId,
      itens: [{ material_id: m, quantidade: q, quantidade_recebida: q }],
    });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const rec = c.body.id;
    const det = await request(app).get(`${API}/recebimentos/${rec}`);
    assert.strictEqual(det.status, 200, JSON.stringify(det.body));
    assert.strictEqual(det.body.os_id, osId, 'RN-176.08: o detalhe mostra a OS do recebimento');
    const its = await dbAll(db, 'SELECT id, material_id, quantidade_recebida FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [rec]);
    const conf = await request(app).put(`${API}/recebimentos/${rec}/conferir`)
      .send({ itens: its.map((i) => ({ id: i.id, material_id: i.material_id, quantidade_recebida: i.quantidade_recebida })) });
    assert.strictEqual(conf.status, 200, JSON.stringify(conf.body));
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      // eslint-disable-next-line no-await-in-loop
      const r = await request(app).post(`${API}/recebimentos/${rec}/workflow`).send({ acao });
      assert.strictEqual(r.status, 200, acao + JSON.stringify(r.body));
    }
    const f = await request(app).put(`${API}/recebimentos/${rec}/fiscal`).send({
      fornecedor_nome: 'Cliente A E176T3', data_emissao_nf: '2026-10-20', data_entrada_nf: '2026-10-21', valor_total_nota: q,
    });
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    const p = await request(app).post(`${API}/recebimentos/${rec}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    return rec;
  };
  const entradaDoRec = (rec) => dbGet(db, "SELECT os_id, quantidade FROM movimentacoes_almoxarifado WHERE recebimento_id = ? AND tipo = 'ENTRADA_COMPRA'", [rec]);
  const reservasDaOs = (m, osId) => dbAll(db, `SELECT * FROM reservas_material_almoxarifado
    WHERE material_id = ? AND origem = 'MANUAL' AND os_id = ? AND status = 'ATIVA' ORDER BY id`, [m, osId]);
  const saldoDaOs = async (m, osId) => (await reservasDaOs(m, osId))
    .reduce((s, r) => s + Number(r.quantidade) - Number(r.quantidade_utilizada || 0), 0);
  const posicao = async (clienteId) => {
    const r = await request(app).get(`${API}/materiais-cliente/posicao`).query({ cliente_id: clienteId });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const consumoDaOs = async (osId) => {
    const r = await request(app).get(`${API}/relatorios/consumo-os`).query({ os_id: osId });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.map((l) => ({ material_id: l.material_id, os_id: l.os_id,
      consumido: Number(l.total_consumido), devolvido: Number(l.devolvido), liquido: Number(l.liquido) }));
  };
  const fisico = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m])).q);

  /** Comeco comum aos dois roteiros: material de A, OS de A, NF de 10 sem pedido com a OS -> entrada e reserva da OS. */
  const comeco = async () => {
    const os = await novaOs(cliA);
    const m = await material(cliA);
    const rec = await receberNfDoCliente(m.id, 10, os.id);
    const e = await entradaDoRec(rec);
    assert.ok(e, 'a nota processada gerou ENTRADA_COMPRA');
    assert.deepStrictEqual([e.os_id, Number(e.quantidade)], [os.id, 10], 'I2: a ENTRADA_COMPRA grava a OS do recebimento');
    const res = await reservasDaOs(m.id, os.id);
    assert.deepStrictEqual(res.map((r) => [r.recebimento_id, Number(r.quantidade)]), [[rec, 10]],
      'RN-176.05: o livre da nota sem pedido fica reservado para a OS');
    assert.strictEqual(await fisico(m.id), 10);
    return { os, m, rec };
  };

  await test('[T3 roteiro 1] NF do cliente A com OS -> reserva da OS -> requisicao da cesta com a OS (sem projeto) -> entrega 8 -> posicao e consumo -> devolucao 3 -> 8/3/5', async () => {
    const { os, m } = await comeco();

    // requisicao pela porta da cesta, com a OS e sem projeto
    const R = await as(COMERCIAL, async () => {
      const r = await request(app).post('/api/requisicoes-material').send({
        setor: 'Comercial', departamento: 'Comercial', modulo_origem: 'comercial', observacoes: '', tipo_requisicao: 'CONSUMO',
        justificativa: '', salvar_rascunho: false, os_id: os.id, itens: [{ material_id: m.id, quantidade: 8 }],
      });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      return r.body.id;
    });
    assert.strictEqual((await dbGet(db, 'SELECT os_id FROM requisicoes_almoxarifado WHERE id = ?', [R])).os_id, os.id);

    const ap = await request(app).put(`${API}/requisicoes/${R}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    assert.strictEqual(ap.body.status, 'TOTALMENTE_RESERVADA', 'RN-171.12: aprovar converte da reserva da OS');
    assert.strictEqual(await saldoDaOs(m.id, os.id), 2, 'a OS fica com o resto (10 - 8)');

    const it = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R])).id;
    const sep = await request(app).put(`${API}/requisicoes/${R}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: 8 }] });
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
    const ent = await request(app).put(`${API}/requisicoes/${R}/entregar`).send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 8 }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
    const saida = await dbGet(db, "SELECT id, os_id, quantidade FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA'", [R]);
    assert.deepStrictEqual([saida.os_id, Number(saida.quantidade)], [os.id, 8], 'RN-174.01: a saida leva a OS');
    assert.strictEqual(await fisico(m.id), 2);

    // posicao por cliente: a aplicacao na OS
    const pos = await posicao(cliA);
    const item = pos.itens.find((i) => i.material_id === m.id);
    assert.ok(item, 'o material esta na posicao do cliente A');
    assert.deepStrictEqual([Number(item.saldo), Number(item.recebido), Number(item.consumido)], [2, 10, 8]);
    const apl = pos.aplicacoes.filter((a) => a.material_id === m.id);
    assert.deepStrictEqual(apl.map((a) => [a.os_id, a.numero_os, a.projeto_id, Number(a.quantidade)]), [[os.id, os.numero, null, 8]],
      'a posicao do cliente mostra a aplicacao NA OS');
    assert.ok(!(await posicao(cliB)).itens.some((i) => i.material_id === m.id), 'nao aparece na posicao do cliente B');

    // consumo por OS conta; devolucao parcial herda a OS
    assert.deepStrictEqual(await consumoDaOs(os.id), [{ material_id: m.id, os_id: os.id, consumido: 8, devolvido: 0, liquido: 8 }]);
    const dv = await request(app).post(`${API}/devolucoes`)
      .send({ material_id: m.id, quantidade: 3, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE', movimentacao_saida_id: saida.id });
    assert.strictEqual(dv.status, 201, JSON.stringify(dv.body));
    assert.deepStrictEqual(await consumoDaOs(os.id), [{ material_id: m.id, os_id: os.id, consumido: 8, devolvido: 3, liquido: 5 }]);
    assert.strictEqual(await fisico(m.id), 5, 'as 3 voltaram ao estoque do cliente');
    const pos2 = await posicao(cliA);
    assert.strictEqual(Number(pos2.itens.find((i) => i.material_id === m.id).saldo), 5);
  });

  await test('[T3 roteiro 2] NF do cliente A com OS -> OS cancelada (osEncerradaService) -> reserva solta; saldo do cliente intacto e segregado', async () => {
    const { os, m } = await comeco();
    const proprio = await material(null, 5); // controle positivo da segregacao
    const posAntes = (await posicao(cliA)).itens.find((i) => i.material_id === m.id);
    assert.deepStrictEqual([Number(posAntes.saldo), Number(posAntes.saldo_disponivel)], [10, 0], 'premissa: os 10 presos na OS');

    await dbRun(db, "UPDATE ordens_servico SET status = 'cancelada' WHERE id = ?", [os.id]);
    assert.strictEqual(await osEncerradaService.liberarReservasDaOs(db, ADMIN, os.id, 'cancelada'), 1, 'soltou a reserva da OS');
    assert.strictEqual(await saldoDaOs(m.id, os.id), 0);

    assert.strictEqual(await fisico(m.id), 10, 'o fisico do cliente nao mexe');
    const posDepois = (await posicao(cliA)).itens.find((i) => i.material_id === m.id);
    assert.deepStrictEqual([Number(posDepois.saldo), Number(posDepois.saldo_disponivel)], [10, 10], 'o livre volta para o cliente');
    assert.strictEqual((await dbGet(db, 'SELECT proprietario_cliente_id d FROM materiais_almoxarifado WHERE id = ?', [m.id])).d, cliA);
    assert.ok(!(await posicao(cliB)).itens.some((i) => i.material_id === m.id), 'nao aparece na posicao do cliente B');
    const pe = await request(app).get(`${API}/relatorio/posicao-estoque`);
    assert.strictEqual(pe.status, 200, JSON.stringify(pe.body));
    assertSegregado(pe.body, { materialClienteId: m.id, materialProprioId: proprio.id, contexto: 'relatorio/posicao-estoque' });
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
