/**
 * Etapa 49, T4 — integração: as chaves novas pela LISTA que dirige a tela e pela EXPORTAÇÃO XLSX.
 *
 * O registro dirige a tela e o XLSX; o que só a integração prova é que a chave nova aparece para
 * o perfil certo, que o XLSX sai com o cabeçalho = rótulos do registro e as mesmas linhas do JSON,
 * e que o filtro novo do histórico (grupo) atravessa a exportação — a tela repassa os mesmos
 * parâmetros da consulta.
 *
 * Executar: cd server && node tests/api/integracaoRelatoriosSaldos.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const XLSX = require('xlsx');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');
const { RELATORIOS } = require('../../services/almoxarifado/reportRegistry');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
function binaryParser(res, callback) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin' };
const PRODUCAO = { id: 9, nome: 'Producao', role: 'usuario' };
const NOVAS = ['saldo-por-lote', 'series-em-estoque', 'saldos-comprometidos'];

(async () => {
  console.log('\n=== Etapa 49 T4: integracao dos relatorios de saldo ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  const cliente = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente E49')")).lastID;
  await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, quantidade_reservada, proprietario_cliente_id)
    VALUES ('E49-CLI', 'Material de cliente', 'UN', 10, 1, 4, ?)`, [cliente]);
  await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, quantidade_bloqueada)
    VALUES ('E49-NOSSO', 'Nosso', 'UN', 10, 1, 2)`);
  const mat = (await dbRun(db, "INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('E49-MOV','Mov','UN',0,1)")).lastID;
  for (const tipo of ['ENTRADA_COMPRA', 'SAIDA', 'ENTRADA_MANUAL']) {
    await dbRun(db, `INSERT INTO movimentacoes_almoxarifado (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, usuario_nome, cancelado)
      VALUES (?,?,1,0,0,'Ana',0)`, [mat, tipo]);
  }

  await test('(1) a lista que dirige a tela traz as tres chaves novas, na categoria Estoque, ate para PRODUCAO', async () => {
    setUser(PRODUCAO);
    const res = await request(app).get('/api/almoxarifado/relatorios');
    assert.strictEqual(res.status, 200);
    for (const tipo of NOVAS) {
      const item = res.body.relatorios.find((r) => r.tipo === tipo);
      assert.ok(item, `${tipo} nao esta na lista`);
      assert.strictEqual(item.categoria, 'Estoque');
    }
  });

  for (const tipo of NOVAS) {
    await test(`(2) [${tipo}] XLSX: cabecalho = rotulos do registro, mesmas linhas do JSON`, async () => {
      setUser(ADMIN);
      const json = await request(app).get(`/api/almoxarifado/relatorios/${tipo}`);
      assert.strictEqual(json.status, 200, JSON.stringify(json.body));
      const xls = await request(app).get(`/api/almoxarifado/relatorios/${tipo}/export`).buffer().parse(binaryParser);
      assert.strictEqual(xls.status, 200);
      const linhas = XLSX.utils.sheet_to_json(XLSX.read(xls.body, { type: 'buffer' }).Sheets.Sheet1
        || XLSX.read(xls.body, { type: 'buffer' }).Sheets[XLSX.read(xls.body, { type: 'buffer' }).SheetNames[0]], { header: 1 });
      assert.deepStrictEqual(linhas[0], RELATORIOS[tipo].colunas.map((c) => c.rotulo));
      assert.strictEqual(linhas.length - 1, json.body.length);
    });
  }

  await test('(3) saldos comprometidos mostra material de CLIENTE com o nome do cliente (escolha da letra B)', async () => {
    setUser(ADMIN);
    const res = await request(app).get('/api/almoxarifado/relatorios/saldos-comprometidos');
    const cli = res.body.find((l) => l.material_codigo === 'E49-CLI');
    assert.ok(cli, 'material de cliente sumiu dos saldos comprometidos');
    assert.strictEqual(cli.cliente, 'Cliente E49');
    assert.ok(res.body.find((l) => l.material_codigo === 'E49-NOSSO'));
  });

  await test('(4) o filtro GRUPO atravessa a exportacao do historico', async () => {
    setUser(ADMIN);
    const xls = await request(app).get('/api/almoxarifado/relatorios/historico-movimentacoes/export')
      .query({ material_id: mat, grupo: 'ENTRADA' }).buffer().parse(binaryParser);
    assert.strictEqual(xls.status, 200);
    const wb = XLSX.read(xls.body, { type: 'buffer' });
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const iTipo = linhas[0].indexOf('Tipo');
    assert.deepStrictEqual(linhas.slice(1).map((l) => l[iTipo]).sort(), ['ENTRADA_COMPRA', 'ENTRADA_MANUAL']);
    assert.ok(linhas[0].includes('Usuário') && linhas[0].includes('Centro de custo'), JSON.stringify(linhas[0]));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
