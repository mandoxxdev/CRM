/**
 * Etapa 174 (T3) — integracao ponta a ponta, tudo pela ROTA: pedido de compra com OS (171) -> recebimento (a nota da OS
 * reserva para ela) -> requisicao com `os_id` pela porta da cesta (172, POST /api/requisicoes-material, usuario sem
 * modulo almoxarifado) -> aprovar (converte da reserva da OS) -> separar -> entregar (a saida grava a OS, RN-174.01) ->
 * devolucao parcial (herda a OS da saida) -> relatorio "Consumo por OS" com consumido/devolvido/liquido (RN-174.03) — e
 * a devolucao para SUCATA nao baixa o liquido (I2).
 *
 * O harness nao tem `ordens_servico` (tabela core): o teste a cria com as colunas que as portas leem.
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa174-entrega-com-os-e-consumo-por-os.md
 * Executar: cd server && node tests/api/consumoPorOsPontaAPonta.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}

const ADMIN = { id: 1744, nome: 'Admin E174T3', role: 'admin', is_superadmin: 1, email: 'e174t3a@test.com' };
const COMERCIAL = { id: 1745, nome: 'Vendedor E174T3', role: 'usuario', email: 'e174t3c@test.com' };
const API = '/api/almoxarifado';

(async () => {
  console.log('\n=== Etapa 174 (T3): pedido com OS -> requisicao com OS -> entrega -> devolucao -> consumo por OS ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('liberacao_valor_ativo', '0');
  await cfg('aprovacao_automatica', '0');
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, cliente_id INTEGER,
    tipo_os TEXT NOT NULL DEFAULT 'producao', status TEXT DEFAULT 'pendente', data_abertura DATE NOT NULL DEFAULT '2026-10-22')`);
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn E174T3','17430000000174','ativo')")).lastID;

  let seq = 0;
  const novaOs = async () => {
    seq += 1;
    const numero = `E174T3-OS${seq}`;
    return { id: (await dbRun(db, "INSERT INTO ordens_servico (numero_os, status) VALUES (?, 'em_andamento')", [numero])).lastID, numero };
  };
  const material = async () => {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, custo_unitario, ativo, fornecedor_id)
      VALUES (?, ?, 'PC', 0, 0, 0, 10, 1, ?)`, [`E174T3-M${seq}`, `Mat E174T3 ${seq}`, forn])).lastID;
  };
  const pedido = async (m, q, osId) => {
    const p = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn, status: 'pendente', os_id: osId, itens: [{ material_id: m, quantidade: q, valor_unitario: 1 }],
    });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    return { id: p.body.id, linha: (await dbGet(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ?', [p.body.id])).id };
  };
  const receber = async (ped, m, q) => {
    seq += 1;
    const itens = [{ material_id: m, pedido_item_id: ped.linha, quantidade: q, quantidade_recebida: q }];
    const c = await request(app).post(`${API}/recebimentos`).send({ tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: ped.id, itens });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const { id } = c.body;
    assert.strictEqual((await request(app).put(`${API}/recebimentos/${id}/conferir`).send({ itens })).status, 200);
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      // eslint-disable-next-line no-await-in-loop
      const r = await request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao });
      assert.strictEqual(r.status, 200, acao + JSON.stringify(r.body));
    }
    const f = await request(app).put(`${API}/recebimentos/${id}/fiscal`).send({
      nota_fiscal: `NF-E174T3-${seq}`, fornecedor_id: forn, fornecedor_nome: 'Forn E174T3',
      data_emissao_nf: '2026-10-20', data_entrada_nf: '2026-10-21', valor_total_nota: q, itens,
    });
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    const p = await request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
  };
  const criarPelaCesta = (m, q, osId) => as(COMERCIAL, async () => {
    const r = await request(app).post('/api/requisicoes-material').send({
      setor: 'Comercial', departamento: 'Comercial', modulo_origem: 'comercial', observacoes: '', tipo_requisicao: 'CONSUMO',
      justificativa: '', salvar_rascunho: false, os_id: osId, itens: [{ material_id: m, quantidade: q }],
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body.id;
  });
  const aprovarSepararEntregar = async (R, q) => {
    const ap = await request(app).put(`${API}/requisicoes/${R}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    assert.strictEqual(ap.body.status, 'TOTALMENTE_RESERVADA', 'premissa: aprovar converte da reserva da OS');
    const it = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R])).id;
    const sep = await request(app).put(`${API}/requisicoes/${R}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: q }] });
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
    const ent = await request(app).put(`${API}/requisicoes/${R}/entregar`).send({ itens_atendidos: [{ item_id: it, quantidade_atendida: q }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
    return (await dbGet(db, "SELECT id, os_id FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA'", [R]));
  };
  const devolver = async (m, saidaId, quantidade, destino) => {
    const r = await request(app).post(`${API}/devolucoes`)
      .send({ material_id: m, quantidade, motivo: 'NAO_UTILIZADO', destino, movimentacao_saida_id: saidaId });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const consumoDaOs = async (osId) => {
    const r = await request(app).get(`${API}/relatorios/consumo-os`).query({ os_id: osId });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.map((l) => ({ material_id: l.material_id, os_id: l.os_id,
      consumido: Number(l.total_consumido), devolvido: Number(l.devolvido), liquido: Number(l.liquido) }));
  };

  await test('[T3] pedido da OS recebido -> requisicao da cesta com a OS -> entrega 8 -> devolucao 3 -> consumo por OS 8/3/5', async () => {
    const os = await novaOs();
    const m = await material();
    await receber(await pedido(m, 10, os.id), m, 10);
    const R = await criarPelaCesta(m, 8, os.id);
    const saida = await aprovarSepararEntregar(R, 8);
    assert.strictEqual(saida.os_id, os.id, 'RN-174.01: a saida da entrega leva a OS da requisicao');
    assert.deepStrictEqual(await consumoDaOs(os.id), [{ material_id: m, os_id: os.id, consumido: 8, devolvido: 0, liquido: 8 }]);
    await devolver(m, saida.id, 3, 'ESTOQUE');
    assert.deepStrictEqual(await consumoDaOs(os.id), [{ material_id: m, os_id: os.id, consumido: 8, devolvido: 3, liquido: 5 }]);
    // e mais 1 para sucata: a peca nao voltou a ser usavel — o liquido nao cai (I2)
    await devolver(m, saida.id, 1, 'SUCATA');
    assert.deepStrictEqual(await consumoDaOs(os.id), [{ material_id: m, os_id: os.id, consumido: 8, devolvido: 3, liquido: 5 }]);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
