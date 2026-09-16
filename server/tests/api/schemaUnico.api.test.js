const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { initSchema } = require('../../services/almoxarifado/schema');

// Etapa 37 Task 6 — as 21 colunas que o registrador de rotas tentava criar por conta própria,
// agrupadas pela tabela que as recebe. A lista é afirmada POR NOME (e o total, contado) porque
// é ela que prova que apagar aquelas 21 linhas não tirou coluna nenhuma de ninguém: quem cria
// todas elas é o initSchema, via safeAlter.
const COLUNAS_DO_SCHEMA = {
  materiais_almoxarifado: ['tipo_material_id', 'ponto_pedido', 'prazo_reposicao_dias', 'familia_id'],
  localizacoes_almoxarifado: ['tipo', 'parent_id', 'pos_x', 'pos_y', 'largura', 'altura', 'subgrupo'],
  itens_requisicao_almoxarifado: ['quantidade_separada', 'quantidade_entregue'],
  requisicoes_almoxarifado: [
    'ativo', 'ultimo_lembrete_enviado', 'valor_total', 'requer_aprovacao_valor',
    'aprovador_valor_id', 'aprovador_valor_nome', 'data_aprovacao_valor', 'rejeicao_valor_motivo',
  ],
};

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

(async () => {
  // Nota de implementação (Step 2 do brief): POST /familias e GET /configuracoes exigem
  // canConfigureAlmox(req.user) (admin do módulo Almoxarifado ou Super Administrador).
  // O usuário default do harness ({ role: 'admin' }) não satisfaz essa checagem — é um
  // "admin" genérico, não necessariamente admin do módulo. Como o objetivo deste teste é
  // provar que o schema (initSchema) sozinho basta, não testar a matriz de permissões,
  // usamos um usuário com is_superadmin para não colidir com essa camada de autorização.
  const { app, db, close } = await createTestApp({
    user: { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1 },
  });

  await test('routes/almoxarifado.js nao contem mais DDL (CREATE TABLE)', async () => {
    const src = fs.readFileSync(path.join(__dirname, '../../routes/almoxarifado.js'), 'utf8');
    assert.ok(!src.includes('CREATE TABLE'), 'DDL ainda presente no arquivo de rotas');
  });

  await test('app inicializado só com initSchema atende o CRUD de material', async () => {
    const fam = await request(app).post('/api/almoxarifado/familias')
      .send({ codigo: 'FAM1', nome: 'Família Teste' });
    assert.strictEqual(fam.status, 201, JSON.stringify(fam.body));
    const mat = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: 'MAT-001', nome: 'Material Teste', familia_id: fam.body.id, unidade: 'UN' });
    assert.strictEqual(mat.status, 201, JSON.stringify(mat.body));
    const lista = await request(app).get('/api/almoxarifado/materiais');
    assert.strictEqual(lista.status, 200);
    assert.strictEqual(lista.body.length, 1);
  });

  await test('demais telas principais respondem (conferencias, requisicoes, configuracoes)', async () => {
    for (const rota of ['/api/almoxarifado/conferencias', '/api/almoxarifado/requisicoes', '/api/almoxarifado/configuracoes']) {
      const res = await request(app).get(rota);
      assert.strictEqual(res.status, 200, `${rota} -> ${res.status}`);
    }
  });

  // (4) Etapa 37 Task 6 — o arquivo de rotas não migra mais schema por conta própria.
  // A varredura é de TEXTO e recusa o DDL de alteração que NÃO esteja dentro de um safeAlter():
  // safeAlter só engole "duplicate column name", loga e propaga qualquer outro erro, enquanto o
  // padrão `db.run(..., () => {})` do registrador engolia TUDO em silêncio. A metade positiva é
  // contar as chamadas legítimas em schema.js: sem ela, a varredura passaria lendo arquivo vazio.
  await test('routes/almoxarifado.js nao contem DDL de alteracao fora de safeAlter', async () => {
    const src = fs.readFileSync(path.join(__dirname, '../../routes/almoxarifado.js'), 'utf8');
    assert.ok(src.length > 1000, 'arquivo de rotas nao foi lido (varredura seria vazia)');

    const soltos = src.split('\n')
      .map((linha, i) => ({ linha, n: i + 1 }))
      .filter(({ linha }) => /ALTER\s+TABLE/i.test(linha) && !linha.includes('safeAlter('));
    assert.strictEqual(
      soltos.length, 0,
      `DDL/ALTER ainda presente no arquivo de rotas: ${soltos.map((s) => `:${s.n}`).join(', ')}`,
    );

    const schemaSrc = fs.readFileSync(
      path.join(__dirname, '../../services/almoxarifado/schema.js'), 'utf8',
    );
    const chamadas = (schemaSrc.match(/safeAlter\(/g) || []).length;
    assert.ok(chamadas > 0, 'nenhum safeAlter( em schema.js — a varredura nao sabe contar');
  });

  // (5) CONTROLE POSITIVO de (4): banco novo, SÓ initSchema, nenhuma rota registrada — e as 21
  // colunas estão lá. É o cenário que distingue "apaguei porque era código morto" de "apaguei e
  // cruzei os dedos": sem ele, (4) provaria apenas que alguém apagou linhas.
  await test('CONTROLE POSITIVO: initSchema sozinho cria as 21 colunas (por nome e no total)', async () => {
    const dbSo = new sqlite3.Database(':memory:');
    try {
      await initSchema(dbSo);
      let total = 0;
      for (const [tabela, colunas] of Object.entries(COLUNAS_DO_SCHEMA)) {
        const info = await new Promise((resolve, reject) => {
          dbSo.all(`PRAGMA table_info(${tabela})`, [], (err, rows) => (err ? reject(err) : resolve(rows)));
        });
        assert.ok(info.length > 0, `tabela ${tabela} nao existe apos initSchema`);
        const nomes = info.map((c) => c.name);
        for (const coluna of colunas) {
          assert.ok(nomes.includes(coluna), `${tabela}.${coluna} ausente apos initSchema`);
          total++;
        }
      }
      assert.strictEqual(total, 21, `esperado 21 colunas afirmadas, contadas ${total}`);
    } finally {
      await new Promise((resolve) => dbSo.close(() => resolve()));
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
