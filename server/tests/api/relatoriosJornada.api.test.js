/**
 * Etapa 13, Task 4 — teste-jornada do registro de relatórios (Task 1) + indicadores (Task 2)
 * pelo MOTOR REAL: semeia estoque/movimentações/requisição entregue e percorre
 * lista → consulta (indicadores) → export (paridade linhas/cabeçalho) → gates (403/200) →
 * tipo inventado (404 no dispatcher E no export).
 *
 * Plano: docs/superpowers/plans/2026-08-24-almoxarifado-etapa13-relatorios.md, Task 4.
 * Não duplica a cobertura já feita por relatoriosRegistro.api.test.js (Task 1, unitário por
 * rota) nem por relatoriosIndicadores.api.test.js (Task 2, cada bloco isolado) — esta suíte
 * prova que os DOIS pedaços continuam consistentes entre si numa jornada única, contra dados
 * semeados pelo motor de verdade (stockService.registrarMovimentacao,
 * PUT /requisicoes/:id/entregar).
 *
 * Executar: cd server && node tests/api/relatoriosJornada.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { RELATORIOS } = require('../../services/almoxarifado/reportRegistry');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const PRODUCAO = { id: 9, nome: 'Producao', role: 'usuario' };
const GESTOR = { id: 2, nome: 'Gestor', role: 'usuario', perfil_almoxarifado: 'GESTOR' };

// Le o corpo binario da resposta como Buffer (mesmo parser de relatoriosRegistro.api.test.js —
// supertest nao reconhece xlsx como binario por padrao).
function binaryParser(res, callback) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
}
function getBinary(req) {
  return req.buffer().parse(binaryParser);
}

async function criarMaterial(db, over = {}) {
  const cols = ['codigo', 'nome', 'unidade', 'quantidade_atual', 'custo_unitario', 'ativo'];
  const vals = [over.codigo, over.nome || `Material ${over.codigo}`, over.unidade || 'UN',
    over.quantidade_atual ?? 0, over.custo_unitario ?? 0, over.ativo ?? 1];
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado (${cols.join(',')})
    VALUES (${cols.map(() => '?').join(',')})`, vals);
  return r.lastID;
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // `projetos`/`ordens_servico` sao tabelas CORE (fora do initSchema do almoxarifado) —
  // clienteEstoqueService.posicaoPorCliente faz LEFT JOIN nelas (molde: relatoriosRegistro.api.
  // test.js). Sem elas, materiais-cliente com cliente_id valido responde 500 no harness.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS projetos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)`);
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT, cliente_id INTEGER,
    projeto_id INTEGER, status TEXT)`);
  const clienteIns = await dbRun(db, `INSERT INTO clientes (razao_social) VALUES ('Cliente Jornada LTDA')`);
  const clienteId = clienteIns.lastID;

  // ── Semeadura (motor real) ──────────────────────────────────────────────────────────────────
  // (a) estoque: material com custo_unitario=10, quantidade_atual=100.
  const matGiro = await criarMaterial(db, { codigo: 'JOR-GIRO', quantidade_atual: 100, custo_unitario: 10 });
  // (b) movimentação de SAIDA pelo MOTOR (stockService.registrarMovimentacao) — consome 20 un.
  // saida*custo = 200. A entrega da requisição (item d, abaixo) TAMBÉM é uma SAIDA pelo motor
  // (requisitionService.entregarRequisicao usa stockService) — os números finais do giro
  // (asserts do teste [2]) somam ESTE material com o da requisição, de propósito: a jornada
  // prova que o indicador agrega TODO consumo do módulo, não só o que este bloco semeia.
  await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: matGiro, tipo: 'SAIDA', quantidade: 20, justificativa: 'jornada etapa 13',
  });
  // (c) material que ZERA na mesma janela (ruptura) — custo_unitario=0 para não afetar o giro,
  // só a contagem de rupturas.
  const matRuptura = await criarMaterial(db, { codigo: 'JOR-RUPTURA', quantidade_atual: 5, custo_unitario: 0 });
  await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: matRuptura, tipo: 'SAIDA', quantidade: 5, justificativa: 'jornada etapa 13',
  });
  // (d) requisição ENTREGUE pelo MOTOR (PUT /requisicoes/:id/entregar) — data_entrega tem UM
  // escritor (requisitionService.js:376), so entrega COMPLETA grava. created_at backdatado 2h
  // ANTES de entregar, para o atendimento ter uma duração real e não-zero.
  const matReq = await criarMaterial(db, { codigo: 'JOR-REQ', quantidade_atual: 50, custo_unitario: 1 });
  const reqIns = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
    (numero, solicitante_id, solicitante_nome, status, created_at)
    VALUES ('JOR-REQ-1', 1, 'Solicitante Teste', 'EM_SEPARACAO', datetime('now', '-2 hours'))`);
  const requisicaoId = reqIns.lastID;
  const itemIns = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
    (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
    VALUES (?, ?, 10, 10, 0, 0)`, [requisicaoId, matReq]);
  const itemId = itemIns.lastID;

  setUser(ADMIN);
  const entregaRes = await request(app).put(`/api/almoxarifado/requisicoes/${requisicaoId}/entregar`)
    .send({ itens_atendidos: [{ item_id: itemId, quantidade_atendida: 10 }] });
  if (entregaRes.status !== 200) {
    throw new Error(`Falha ao semear requisição entregue (motor real): ${entregaRes.status} ${JSON.stringify(entregaRes.body)}`);
  }
  const reqRow = await dbGet(db, 'SELECT created_at, data_entrega FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  assert.ok(reqRow.data_entrega, 'semeadura: requisição deveria ter sido entregue pelo motor real');
  const horasEsperadas = Number((
    (new Date(`${reqRow.data_entrega}Z`).getTime() - new Date(`${reqRow.created_at}Z`).getTime()) / 3600000
  ).toFixed(2));

  // ── [1] Lista: GESTOR ve indicadores+solicitacoes-compra; PRODUCAO nao ve os 2 gated; ────────
  // paridade dispatcher x lista para os dois papeis (todo listado responde 200/400, nunca 404).
  await test('[1] lista como GESTOR contem indicadores e solicitacoes-compra; paridade 200/400', async () => {
    setUser(GESTOR);
    const res = await request(app).get('/api/almoxarifado/relatorios');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const tipos = res.body.relatorios.map((r) => r.tipo);
    assert.ok(tipos.includes('indicadores'), JSON.stringify(tipos));
    assert.ok(tipos.includes('solicitacoes-compra'), JSON.stringify(tipos));
    assert.strictEqual(tipos.length, Object.keys(RELATORIOS).length,
      `GESTOR deveria ver todas as ${Object.keys(RELATORIOS).length} chaves (tem inventario e gerenciar_reposicao)`);

    for (const { tipo } of res.body.relatorios) {
      const qs = tipo === 'materiais-cliente' ? `?cliente_id=${clienteId}` : '';
      const r = await request(app).get(`/api/almoxarifado/relatorios/${tipo}${qs}`);
      assert.ok([200, 400].includes(r.status),
        `${tipo} (GESTOR): esperava 200/400, veio ${r.status} — ${JSON.stringify(r.body)}`);
    }
  });

  await test('[1] lista como PRODUCAO NAO contem os 2 gated; paridade 200/400 do que sobrou', async () => {
    setUser(PRODUCAO);
    const res = await request(app).get('/api/almoxarifado/relatorios');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const tipos = res.body.relatorios.map((r) => r.tipo);
    assert.ok(!tipos.includes('inventario-divergencias'), JSON.stringify(tipos));
    assert.ok(!tipos.includes('solicitacoes-compra'), JSON.stringify(tipos));
    assert.ok(tipos.includes('indicadores'), 'indicadores tem acao:null — PRODUCAO deveria ve-lo');
    assert.strictEqual(tipos.length, Object.keys(RELATORIOS).length - 2, JSON.stringify(tipos));

    for (const { tipo } of res.body.relatorios) {
      const qs = tipo === 'materiais-cliente' ? `?cliente_id=${clienteId}` : '';
      const r = await request(app).get(`/api/almoxarifado/relatorios/${tipo}${qs}`);
      assert.notStrictEqual(r.status, 404, `${tipo} (PRODUCAO): 404 nao deveria acontecer para tipo listado`);
      assert.ok([200, 400].includes(r.status),
        `${tipo} (PRODUCAO): esperava 200/400, veio ${r.status} — ${JSON.stringify(r.body)}`);
    }
  });

  // ── [2] indicadores: numeros exatos contra o semeado ─────────────────────────────────────────
  await test('[2] indicadores: giro/rupturas/atendimento conferem EXATAMENTE contra o semeado', async () => {
    setUser(ADMIN);
    const res = await request(app).get('/api/almoxarifado/relatorios/indicadores');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    // valor_consumido: SAIDA direta de matGiro (20*10=200) + SAIDA da entrega da requisição
    // sobre matReq (10*1=10) — o indicador agrega as DUAS, mesmo motor (TIPOS_SAIDA).
    assert.strictEqual(res.body.giro.valor_consumido, 210, JSON.stringify(res.body.giro));
    // valor_estoque_atual: matGiro 80*10=800 (100-20) + matRuptura 0*0=0 + matReq 40*1=40 (50-10).
    assert.strictEqual(res.body.giro.valor_estoque_atual, 840, JSON.stringify(res.body.giro));
    assert.strictEqual(res.body.giro.indice, 0.25, JSON.stringify(res.body.giro)); // 210/840

    // Revisao final (lente A, M4): includes() sozinho aprovaria um relatorio que devolvesse
    // TODO material — o total exato fecha a tautologia. So JOR-RUPTURA zerou por tipo
    // qualificado nesta jornada (a SAIDA da entrega nao zera matReq: 50->40).
    const codigosRuptura = res.body.rupturas.materiais.map((m) => m.codigo);
    assert.ok(codigosRuptura.includes('JOR-RUPTURA'), JSON.stringify(res.body.rupturas));
    assert.strictEqual(res.body.rupturas.total, 1, JSON.stringify(res.body.rupturas));

    // Revisao final (lente A, M4): uma requisicao NAO entregue no mesmo banco — sem ela, o
    // COUNT fora do WHERE (a mutacao que a lente mediu) tambem daria 1 e o assert nao
    // distinguia nada.
    await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, status, created_at, data_entrega)
      VALUES ('JOR-REQ-PEND', 1, 'Solicitante', 'PENDENTE', datetime('now'), NULL)`);
    const resDepois = await request(app).get('/api/almoxarifado/relatorios/indicadores?janela_dias=30');
    assert.strictEqual(resDepois.body.atendimento_requisicoes.total_consideradas, 1,
      JSON.stringify(resDepois.body.atendimento_requisicoes)); // a PENDENTE nao conta

    assert.strictEqual(res.body.atendimento_requisicoes.total_consideradas, 1,
      JSON.stringify(res.body.atendimento_requisicoes)); // unica requisicao entregue no banco isolado
    assert.strictEqual(res.body.atendimento_requisicoes.media_horas, horasEsperadas,
      `esperava ${horasEsperadas}h (computado dos timestamps reais gravados pelo motor), veio ${JSON.stringify(res.body.atendimento_requisicoes)}`);
  });

  // ── [3] export estoque-atual: paridade de LINHAS e CABECALHO (rotulos declarados) ───────────
  await test('[3] export estoque-atual: paridade de linhas e cabecalho contra o dispatcher', async () => {
    setUser(ADMIN);
    const jsonRes = await request(app).get('/api/almoxarifado/relatorios/estoque-atual');
    assert.strictEqual(jsonRes.status, 200, JSON.stringify(jsonRes.body));
    assert.ok(jsonRes.body.length >= 3, JSON.stringify(jsonRes.body)); // os 3 materiais proprios semeados

    const exportRes = await getBinary(request(app).get('/api/almoxarifado/relatorios/estoque-atual/export'));
    assert.strictEqual(exportRes.status, 200, 'export deveria responder 200');

    const XLSX = require('xlsx');
    const wb = XLSX.read(exportRes.body, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const cabecalho = linhas[0];
    const rotulosDeclarados = RELATORIOS['estoque-atual'].colunas.map((c) => c.rotulo);
    assert.deepStrictEqual(cabecalho, rotulosDeclarados,
      `cabecalho do xlsx (${JSON.stringify(cabecalho)}) deveria bater EXATAMENTE com os rotulos declarados`);
    assert.strictEqual(linhas.length - 1, jsonRes.body.length,
      `xlsx tem ${linhas.length - 1} linhas de dados, JSON (dispatcher) tem ${jsonRes.body.length}`);
  });

  // ── [4] 403 do export gated como PRODUCAO; par positivo ADMIN 200 ───────────────────────────
  await test('[4] export gated (solicitacoes-compra): PRODUCAO 403, ADMIN 200 (par positivo+negativo)', async () => {
    setUser(PRODUCAO);
    let res = await request(app).get('/api/almoxarifado/relatorios/solicitacoes-compra/export');
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body, { error: 'Sem permissão para este relatório', acao: 'gerenciar_reposicao' });

    setUser(ADMIN);
    res = await getBinary(request(app).get('/api/almoxarifado/relatorios/solicitacoes-compra/export'));
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  // ── [5] 404 de tipo inventado — dispatcher E export ──────────────────────────────────────────
  await test('[5] tipo inventado: 404 no dispatcher e no export', async () => {
    setUser(ADMIN);
    let res = await request(app).get('/api/almoxarifado/relatorios/tipo-inventado-jornada');
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body, { error: 'Relatório não encontrado' });

    res = await request(app).get('/api/almoxarifado/relatorios/tipo-inventado-jornada/export');
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body, { error: 'Relatório não encontrado' });
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
