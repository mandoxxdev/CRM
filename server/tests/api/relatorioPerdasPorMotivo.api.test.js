/**
 * Etapa 129 (feature 21; RN-10..RN-16) — perdas com valor: chave `perdas-por-motivo` do registro.
 *
 * Medido na 127: so existia o historico com `tipo=PERDA`, sem valor. A chave le o LIVRO (PERDA e PERDA_TERCEIRO nao estornadas),
 * agrupa por tipo e motivo (a mesma origem/motivo da `ajustes-por-motivo`) e valora pelo custo ATUAL (`custoUnitarioSql`, retroativo
 * como `custo-por-projeto` e `sucata-financeiro`). Fixture crua no livro (o relatorio so le); a perda pela rota real fica na
 * integracao (conferenciaDepoisDaEntradaIntegracao, RN-17).
 *
 * Executar: cd server && node tests/api/relatorioPerdasPorMotivo.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const XLSX = require('xlsx');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { RELATORIOS } = require('../../services/almoxarifado/reportRegistry');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };
const COMPRAS = { id: 5, nome: 'Comprador', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'compras@test.com' };
const GESTOR = { id: 7, nome: 'Gestor', role: 'usuario', perfil_almoxarifado: 'GESTOR', email: 'gestor@test.com' };
const URL_REL = '/api/almoxarifado/relatorios/perdas-por-motivo';
const FORMATO = 'Parâmetro "material_id" deve ser um número inteiro positivo';

function binaryParser(res, callback) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });
  let seq = 0;
  const material = async ({ medio = 0, unitario = 0, cliente = null, ativo = 1 } = {}) => (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, custo_unitario, custo_medio, proprietario_cliente_id)
     VALUES (?, ?, 'UN', 0, ?, ?, ?, ?)`, [`PPM129-${++seq}`, `PPM129-${seq}`, ativo, unitario, medio, cliente])).lastID;
  const motivo = async (nome, ativo = 1) => (await dbRun(db, `INSERT INTO motivos_movimentacao_almoxarifado (nome, nome_normalizado, tipos, ativo)
    VALUES (?, ?, '["PERDA","PERDA_TERCEIRO"]', ?)`, [nome, `${nome.toLowerCase()}-${++seq}`, ativo])).lastID;
  const mov = async (materialId, tipo, quantidade, { motivoId = null, motivoTexto = null, cancelado = 0, createdAt = null } = {}) => (await dbRun(db,
    `INSERT INTO movimentacoes_almoxarifado (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, usuario_id, cancelado,
       motivo, motivo_id, created_at)
     VALUES (?,?,?,0,0,1,?,?,?, COALESCE(?, CURRENT_TIMESTAMP))`,
    [materialId, tipo, quantidade, cancelado, motivoTexto, motivoId, createdAt])).lastID;
  const rel = async (qs = '', user = ADMIN) => {
    setUser(user);
    const r = await request(app).get(`${URL_REL}${qs}`);
    setUser(ADMIN);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.ok(Array.isArray(r.body), JSON.stringify(r.body));
    return r.body;
  };
  const linhaDo = (rows, tipo, motivo) => rows.filter((l) => l.tipo === tipo && l.motivo === motivo);

  console.log('\n=== Etapa 129: perdas por motivo (feature 21) ===\n');

  // Fixture principal, num material_id filtrado por motivo proprio (o banco e compartilhado entre cenarios).
  const QUEBRA = await motivo('Quebra E129');
  const M1 = await material({ medio: 8, unitario: 99 });
  const M2 = await material({ medio: 0, unitario: 5 });

  await test('[RN-11] o valor pelo custo atual: medio > 0 manda (8, nao 99), senao o unitario (5) — 2x8 + 3x5 = 31', async () => {
    await mov(M1, 'PERDA', 2, { motivoId: QUEBRA });
    await mov(M2, 'PERDA', 3, { motivoId: QUEBRA });
    const ls = linhaDo(await rel(), 'PERDA', 'Quebra E129');
    assert.strictEqual(ls.length, 1, JSON.stringify(ls));
    assert.strictEqual(ls[0].valor, 31);
    assert.strictEqual(ls[0].lancamentos, 2);
    assert.strictEqual(ls[0].materiais, 2);
    assert.strictEqual(ls[0].origem, 'Cadastro');
    assert.strictEqual(ls[0].motivo_id, QUEBRA);
    assert.ok(ls[0].ultimo_em, 'ultimo_em vazio');
    // o custo muda -> o valor do passado muda junto (retroativo, declarado na nota)
    await dbRun(db, 'UPDATE materiais_almoxarifado SET custo_medio = 10 WHERE id = ?', [M1]);
    assert.strictEqual(linhaDo(await rel(), 'PERDA', 'Quebra E129')[0].valor, 35);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET custo_medio = 8 WHERE id = ?', [M1]);
  });

  await test('[RN-10] so PERDA e PERDA_TERCEIRO nao estornadas; SUCATA, AJUSTE_NEGATIVO, CONSUMO_TERCEIRO e ESTORNO fora', async () => {
    const MOT = await motivo('Tipos E129');
    const m = await material({ unitario: 1 });
    await mov(m, 'PERDA_TERCEIRO', 4, { motivoId: MOT });
    await mov(m, 'PERDA', 100, { motivoId: MOT, cancelado: 1 });
    for (const t of ['SUCATA', 'AJUSTE_NEGATIVO', 'CONSUMO_TERCEIRO', 'ESTORNO']) await mov(m, t, 50, { motivoId: MOT });
    const rows = await rel(`?material_id=${m}`);
    assert.deepStrictEqual(rows.map((l) => [l.tipo, l.motivo, l.valor, l.lancamentos]), [['PERDA_TERCEIRO', 'Tipos E129', 4, 1]]);
  });

  await test('[RN-12] uma linha por tipo + motivo; motivo pelo nome ATUAL, (desativado), Motivo #id; sem cadastro junto', async () => {
    const MOT = await motivo('Antigo E129');
    const m = await material({ unitario: 2 });
    await mov(m, 'PERDA', 1, { motivoId: MOT });
    await mov(m, 'PERDA_TERCEIRO', 1, { motivoId: MOT });
    await mov(m, 'PERDA', 1, { motivoTexto: 'caiu da ponte' });
    await mov(m, 'PERDA', 2, { motivoTexto: 'outro texto' });
    await mov(m, 'PERDA', 5, { motivoId: 987654 });
    await dbRun(db, "UPDATE motivos_movimentacao_almoxarifado SET nome = 'Renomeado E129', ativo = 0 WHERE id = ?", [MOT]);
    const rows = await rel(`?material_id=${m}`);
    const vis = rows.map((l) => [l.tipo, l.origem, l.motivo, l.valor, l.lancamentos]);
    assert.deepStrictEqual(vis, [
      ['PERDA', 'Cadastro', 'Motivo #987654', 10, 1],
      ['PERDA', 'Texto livre', 'Sem motivo do cadastro', 6, 2],
      ['PERDA', 'Cadastro', 'Renomeado E129 (desativado)', 2, 1],
      ['PERDA_TERCEIRO', 'Cadastro', 'Renomeado E129 (desativado)', 2, 1],
    ], JSON.stringify(rows));
    assert.ok(rows.every((l) => !('quantidade' in l)), 'a quantidade nao e somada (unidades diferentes)');
  });

  await test('[RN-13] material de cliente fora; material inativado conta', async () => {
    const MOT = await motivo('Dono E129');
    await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente E129')").catch(() => {});
    const cli = (await dbGet(db, 'SELECT id FROM clientes ORDER BY id DESC LIMIT 1')) || { id: 1 };
    const doCliente = await material({ unitario: 7, cliente: cli.id });
    const inativo = await material({ unitario: 3, ativo: 0 });
    await mov(doCliente, 'PERDA', 1, { motivoId: MOT });
    await mov(inativo, 'PERDA', 1, { motivoId: MOT });
    const ls = linhaDo(await rel(), 'PERDA', 'Dono E129');
    assert.strictEqual(ls.length, 1);
    assert.strictEqual(ls[0].valor, 3, 'o cliente entrou ou o inativo saiu');
    assert.strictEqual(ls[0].materiais, 1);
  });

  await test('[RN-14] periodo pelo DIA em UTC e material_id validado (400 com a literal)', async () => {
    const MOT = await motivo('Periodo E129');
    const m = await material({ unitario: 1 });
    await mov(m, 'PERDA', 1, { motivoId: MOT, createdAt: '2026-01-10 23:59:59' });
    await mov(m, 'PERDA', 2, { motivoId: MOT, createdAt: '2026-01-11 00:00:00' });
    const val = async (qs) => (linhaDo(await rel(qs), 'PERDA', 'Periodo E129')[0] || { valor: 0 }).valor;
    assert.strictEqual(await val('?data_inicio=2026-01-11&data_fim=2026-01-11'), 2);
    assert.strictEqual(await val('?data_inicio=2026-01-10&data_fim=2026-01-10'), 1);
    assert.strictEqual(await val('?data_fim=2026-01-11'), 3);
    for (const bruto of ['abc', '0', '-1', '1.5']) {
      const r = await request(app).get(`${URL_REL}?material_id=${bruto}`);
      assert.strictEqual(r.status, 400, `${bruto}: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, FORMATO);
    }
  });

  await test('[RN-15] gate gerenciar_reposicao: Almoxarife 403 e fora da lista; Gestor e Compras 200; export so com as colunas', async () => {
    setUser(ALMOXARIFE);
    const r = await request(app).get(URL_REL);
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Sem permissão para este relatório');
    const lista = await request(app).get('/api/almoxarifado/relatorios');
    assert.ok(!lista.body.relatorios.some((x) => x.tipo === 'perdas-por-motivo'), 'a chave aparece para quem nao pode');
    setUser(ADMIN);
    const listaAdmin = await request(app).get('/api/almoxarifado/relatorios');
    assert.ok(listaAdmin.body.relatorios.some((x) => x.tipo === 'perdas-por-motivo'), 'a chave nao aparece para quem pode');
    await rel('', GESTOR);
    await rel('', COMPRAS);
    const x = await request(app).get(`${URL_REL}/export?material_id=${M1}`).buffer().parse(binaryParser);
    assert.strictEqual(x.status, 200);
    const wb = XLSX.read(x.body, { type: 'buffer' });
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    assert.deepStrictEqual(linhas[0], RELATORIOS['perdas-por-motivo'].colunas.map((c) => c.rotulo));
  });

  await test('[RN-11/RN-12 F5 r3] centavos (0,35 x 3 = 1,05), o mesmo material duas vezes, o ultimo_em e o desempate entre motivos', async () => {
    const AAA = await motivo('AAA F5 E129');
    const BBB = await motivo('BBB F5 E129');
    const m = await material({ unitario: 0.35 });
    await mov(m, 'PERDA', 1, { motivoId: AAA, createdAt: '2026-02-01 10:00:00' });
    await mov(m, 'PERDA', 2, { motivoId: AAA, createdAt: '2026-03-01 10:00:00' });
    const ls = linhaDo(await rel(`?material_id=${m}`), 'PERDA', 'AAA F5 E129');
    assert.strictEqual(ls[0].valor, 1.05, 'o valor nao foi arredondado a centavos');
    assert.strictEqual(ls[0].lancamentos, 2);
    assert.strictEqual(ls[0].materiais, 1, 'o mesmo material contou duas vezes');
    assert.strictEqual(ls[0].ultimo_em, '2026-03-01 10:00:00', 'ultimo_em nao e o mais recente');
    // desempate pelo motivo, depois pelo tipo: PERDA_TERCEIRO/AAA e PERDA/BBB valem 2 -> AAA antes de BBB
    const n = await material({ unitario: 1 });
    await mov(n, 'PERDA', 2, { motivoId: BBB });
    await mov(n, 'PERDA_TERCEIRO', 2, { motivoId: AAA });
    assert.deepStrictEqual((await rel(`?material_id=${n}`)).map((l) => [l.tipo, l.motivo]),
      [['PERDA_TERCEIRO', 'AAA F5 E129'], ['PERDA', 'BBB F5 E129']]);
    // o formulario enviado sem material (material_id vazio) nao e erro
    const vazio = await request(app).get(`${URL_REL}?material_id=`);
    assert.strictEqual(vazio.status, 200, JSON.stringify(vazio.body));
  });

  await test('[RN-12/RN-16] registro: titulo, categoria, gate, params, colunas e a nota', async () => {
    const e = RELATORIOS['perdas-por-motivo'];
    assert.ok(e, 'chave perdas-por-motivo nao declarada');
    assert.strictEqual(e.titulo, 'Perdas por motivo');
    assert.strictEqual(e.categoria, 'Gestão');
    assert.strictEqual(e.acao, 'gerenciar_reposicao');
    assert.strictEqual(e.exportavel, true);
    assert.deepStrictEqual(e.params.map((p) => [p.nome, p.tipo]), [['data_inicio', 'date'], ['data_fim', 'date'], ['material_id', 'number']]);
    assert.deepStrictEqual(e.colunas.map((c) => c.chave),
      ['tipo', 'origem', 'motivo_id', 'motivo', 'lancamentos', 'materiais', 'valor', 'ultimo_em']);
    for (const frase of ['PERDA_TERCEIRO', 'custo ATUAL', 'clientes ficam fora', 'nome ATUAL', 'Sucata', 'UTC']) {
      assert.ok(e.nota.includes(frase), `a nota nao diz "${frase}": ${e.nota}`);
    }
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
