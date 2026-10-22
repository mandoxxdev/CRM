/**
 * Etapa 174 (T2) — o relatorio "Consumo por OS" ganha `devolvido` e `liquido` (RN-174.03, contrato congelado I1):
 * - `total_consumido`: SAIDA* nao canceladas com o os_id (regua historica, sem mudanca);
 * - `devolvido`: TIPOS_DEVOLUCAO (ENTRADA_DEVOLUCAO e o legado DEVOLUCAO) + a ENTRADA da exclusao de requisicao entregue
 *   (`tipo = 'ENTRADA' AND requisicao_id IS NOT NULL`), nao canceladas — MENOS a devolucao que foi para SUCATA (I2: a peca
 *   nao voltou a ser usavel). Quarentena conta;
 * - `liquido = total_consumido - devolvido`; cada linha conta pela data DELA (C2: com periodo, o liquido pode ser negativo);
 * - HAVING total_consumido > 0 OR devolvido > 0 — linha so com devolucao aparece; o saldo inicial (ENTRADA sem requisicao)
 *   nao conta;
 * - a exportacao projeta pelas colunas do registro e traz "Devolvido" e "Liquido".
 *
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa174-entrega-com-os-e-consumo-por-os.md
 * Executar: cd server && node tests/api/consumoPorOsDevolvido.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
function binaryParser(res, callback) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
}

(async () => {
  console.log('\n=== Etapa 174 (T2): consumo por OS com devolvido e liquido ===\n');
  const { app, db, close } = await createTestApp({ user: SUPER });
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, cliente_id INTEGER,
    tipo_os TEXT NOT NULL DEFAULT 'producao', status TEXT DEFAULT 'pendente', data_abertura DATE NOT NULL DEFAULT '2026-10-22')`);

  let seq = 0;
  const novaOs = async () => {
    seq += 1;
    return (await dbRun(db, "INSERT INTO ordens_servico (numero_os, status) VALUES (?, 'em_andamento')", [`E174T2-OS${seq}`])).lastID;
  };
  const ultima = async (m, tipo) => (await dbGet(db,
    'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1', [m, tipo])).id;
  const mov = async (m, body) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m, motivo: 'e174 t2',
      justificativa: 'e174 t2', documento_vinculado: 'NF-E174T2', ...body });
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    return ultima(m, body.tipo);
  };
  /** Material proprio com 50 de saldo inicial (ENTRADA sem requisicao — e com o os_id passado, para provar que nao conta). */
  const material = async (osDoSaldoInicial = null) => {
    seq += 1;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [`E174T2-M${seq}`, `Mat E174T2 ${seq}`])).lastID;
    await mov(id, { tipo: 'ENTRADA', quantidade: 50, ...(osDoSaldoInicial ? { os_id: osDoSaldoInicial } : {}) });
    return id;
  };
  const saida = (m, q, osId) => mov(m, { tipo: 'SAIDA', quantidade: q, os_id: osId });
  const devolver = async (m, saidaId, quantidade, destino = 'ESTOQUE') => {
    const r = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: m, quantidade, motivo: 'NAO_UTILIZADO', destino, movimentacao_saida_id: saidaId });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const rel = async (query) => {
    const r = await request(app).get('/api/almoxarifado/relatorios/consumo-os').query(query);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return Array.isArray(r.body) ? r.body : (r.body.dados || r.body.linhas || r.body);
  };
  /** As linhas da OS, como [material_id, consumido, devolvido, liquido]. */
  const linhas = async (osId, extra = {}) => (await rel({ os_id: osId, ...extra }))
    .map((l) => [l.material_id, Number(l.total_consumido), Number(l.devolvido), Number(l.liquido)]);

  await test('[RN-174.03] saida 10 + devolucao 3 (ESTOQUE): consumido 10, devolvido 3, liquido 7', async () => {
    const os = await novaOs();
    const m = await material();
    await devolver(m, await saida(m, 10, os), 3);
    assert.deepStrictEqual(await linhas(os), [[m, 10, 3, 7]]);
  });

  await test('[I2] devolucao para SUCATA nao conta como devolvida (e a perna SUCATA nao entra no consumido): 10/0/10', async () => {
    const os = await novaOs();
    const m = await material();
    await devolver(m, await saida(m, 10, os), 3, 'SUCATA');
    assert.deepStrictEqual(await linhas(os), [[m, 10, 0, 10]]);
  });

  await test('[I2] devolucao para QUARENTENA conta como devolvida: 10/4/6', async () => {
    const os = await novaOs();
    const m = await material();
    await devolver(m, await saida(m, 10, os), 4, 'QUARENTENA');
    assert.deepStrictEqual(await linhas(os), [[m, 10, 4, 6]]);
  });

  await test('[I3] estorno da devolucao (ENTRADA_DEVOLUCAO cancelada) sai do devolvido: 10/0/10', async () => {
    const os = await novaOs();
    const m = await material();
    await devolver(m, await saida(m, 10, os), 3);
    const e = await request(app).post(`/api/almoxarifado/movimentacoes/${await ultima(m, 'ENTRADA_DEVOLUCAO')}/cancelar`).send({ motivo: 'e174 t2' });
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.deepStrictEqual(await linhas(os), [[m, 10, 0, 10]]);
  });

  // ── a ENTRADA da exclusao de requisicao entregue ──
  const requisicaoEntregue = async (m, qtd, osId) => {
    seq += 1;
    const rq = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, os_id)
      VALUES (?, 1, 'Sol', 'APROVADO', ?)`, [`REQ-E174T2-${seq}`, osId])).lastID;
    const it = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [rq, m, qtd])).lastID;
    await requisitionService.separarRequisicao(db, rq, [{ item_id: it, quantidade_separada: qtd }], SUPER);
    const ent = await request(app).put(`/api/almoxarifado/requisicoes/${rq}/entregar`)
      .send({ itens_atendidos: [{ item_id: it, quantidade_atendida: qtd }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
    return rq;
  };
  const excluir = async (rq) => {
    const ex = await request(app).delete(`/api/almoxarifado/requisicoes/${rq}`).send({ justificativa: 'e174 t2' });
    assert.strictEqual(ex.status, 200, JSON.stringify(ex.body));
  };

  await test('[RN-174.03] requisicao com OS entregue 6 e excluida: o devolvido inclui a ENTRADA da exclusao (6/6/0)', async () => {
    const os = await novaOs();
    const m = await material();
    const rq = await requisicaoEntregue(m, 6, os);
    assert.deepStrictEqual(await linhas(os), [[m, 6, 0, 6]], 'entregue: aparece na OS');
    await excluir(rq);
    assert.deepStrictEqual(await linhas(os), [[m, 6, 6, 0]]);
  });

  await test('[C1] entregue ANTES da 174 (saida sem os_id) e excluida depois: nada vai para a OS (nem -6)', async () => {
    const os = await novaOs();
    const m = await material();
    const rq = await requisicaoEntregue(m, 6, os);
    await dbRun(db, "UPDATE movimentacoes_almoxarifado SET os_id = NULL WHERE requisicao_id = ? AND tipo = 'SAIDA'", [rq]);
    await excluir(rq);
    assert.deepStrictEqual(await linhas(os), []);
  });

  // Fase 5 (lacuna 4): entrega 10, devolve 5 citando a saida da entrega, exclui a requisicao -> a exclusao estorna so o
  // que nao voltou (5). Consumido 10, devolvido 5 (devolucao) + 5 (ENTRADA da exclusao) = 10, liquido 0.
  await test('[F5-4] entrega 10 com OS, devolucao parcial 5, exclusao: consumido 10, devolvido 10, liquido 0', async () => {
    const os = await novaOs();
    const m = await material();
    const rq = await requisicaoEntregue(m, 10, os);
    const s = (await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA'", [rq])).id;
    await devolver(m, s, 5);
    assert.deepStrictEqual(await linhas(os), [[m, 10, 5, 5]], 'depois da devolucao parcial');
    await excluir(rq);
    const ent = await dbGet(db, "SELECT SUM(quantidade) q, COUNT(*) n FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'ENTRADA' AND os_id = ?", [rq, os]);
    assert.deepStrictEqual([Number(ent.q), ent.n], [5, 1], 'a exclusao estorna so os 5 que nao voltaram, com a OS');
    assert.deepStrictEqual(await linhas(os), [[m, 10, 10, 0]]);
  });

  // Fase 5 (lacuna 4): o tipo legado DEVOLUCAO (livro antigo; o motor de hoje grava ENTRADA_DEVOLUCAO) conta como devolvido.
  await test('[F5-4] tipo legado DEVOLUCAO com a OS conta como devolvido: 10/4/6', async () => {
    const os = await novaOs();
    const m = await material();
    await saida(m, 10, os);
    await dbRun(db, `INSERT INTO movimentacoes_almoxarifado (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, os_id, motivo, cancelado)
      VALUES (?, 'DEVOLUCAO', 4, 40, 44, ?, 'legado e174', 0)`, [m, os]);
    assert.deepStrictEqual(await linhas(os), [[m, 10, 4, 6]]);
  });

  await test('[C2] filtro de periodo: saida em setembro, devolucao em outubro, filtro so outubro -> liquido negativo (0/3/-3)', async () => {
    const os = await novaOs();
    const m = await material();
    const s = await saida(m, 10, os);
    await dbRun(db, "UPDATE movimentacoes_almoxarifado SET created_at = '2026-09-15 15:00:00' WHERE id = ?", [s]);
    await devolver(m, s, 3);
    await dbRun(db, "UPDATE movimentacoes_almoxarifado SET created_at = '2026-10-10 15:00:00' WHERE id = ?", [await ultima(m, 'ENTRADA_DEVOLUCAO')]);
    assert.deepStrictEqual(await linhas(os, { data_inicio: '2026-10-01', data_fim: '2026-10-31' }), [[m, 0, 3, -3]]);
    assert.deepStrictEqual(await linhas(os, { data_inicio: '2026-09-01', data_fim: '2026-09-30' }), [[m, 10, 0, 10]]);
    assert.deepStrictEqual(await linhas(os, { data_inicio: '2026-09-01', data_fim: '2026-10-31' }), [[m, 10, 3, 7]]);
  });

  await test('[I1] linha so com devolucao aparece: devolucao AVULSA com OS digitada (0/2/-2)', async () => {
    const os = await novaOs();
    const m = await material();
    const r = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: m, quantidade: 2, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE', origem_os_id: os });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual(await linhas(os), [[m, 0, 2, -2]]);
  });

  await test('[I1] HAVING e saldo inicial: ENTRADA sem requisicao com a OS e saida estornada -> a OS nao tem linha', async () => {
    const os = await novaOs();
    const m = await material(os);
    const s = await saida(m, 4, os);
    const e = await request(app).post(`/api/almoxarifado/movimentacoes/${s}/cancelar`).send({ motivo: 'e174 t2' });
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.deepStrictEqual(await linhas(os), []);
    // controle: a mesma OS com uma saida viva aparece, e o saldo inicial continua fora do devolvido
    await saida(m, 5, os);
    assert.deepStrictEqual(await linhas(os), [[m, 5, 0, 5]]);
  });

  await test('[I1] ordem: total_consumido DESC; sem filtro de OS a linha traz os_id', async () => {
    const os = await novaOs();
    const a = await material();
    const b = await material();
    await saida(a, 2, os);
    await saida(b, 7, os);
    assert.deepStrictEqual((await linhas(os)).map((l) => l[0]), [b, a]);
    const todas = await rel({});
    assert.ok(todas.some((l) => l.material_id === b && l.os_id === os && Number(l.liquido) === 7), 'sem filtro de OS');
  });

  await test('[I1] registro e exportacao: colunas "Devolvido" e "Líquido"; a planilha traz os numeros', async () => {
    const os = await novaOs();
    const m = await material();
    await devolver(m, await saida(m, 10, os), 3);
    const lista = await request(app).get('/api/almoxarifado/relatorios');
    const cons = lista.body.relatorios.find((r) => r.tipo === 'consumo-os');
    assert.deepStrictEqual(cons.colunas.map((c) => [c.chave, c.rotulo]), [
      ['codigo', 'Código'], ['nome', 'Material'], ['total_consumido', 'Total consumido'],
      ['devolvido', 'Devolvido'], ['liquido', 'Líquido'], ['os_id', 'OS'],
    ]);
    assert.ok(cons.nota.includes('saídas diretas') && cons.nota.includes('sucata') && cons.nota.includes('negativo'), cons.nota);
    const res = await request(app).get('/api/almoxarifado/relatorios/consumo-os/export').query({ os_id: os })
      .buffer().parse(binaryParser);
    assert.strictEqual(res.status, 200, `export ${res.status}`);
    const XLSX = require('xlsx');
    const wb = XLSX.read(res.body, { type: 'buffer' });
    const planilha = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const cab = planilha[0];
    assert.ok(cab.includes('Devolvido') && cab.includes('Líquido'), JSON.stringify(cab));
    const linha = planilha[1];
    assert.deepStrictEqual([linha[cab.indexOf('Total consumido')], linha[cab.indexOf('Devolvido')], linha[cab.indexOf('Líquido')]]
      .map(Number), [10, 3, 7], JSON.stringify(planilha));
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
