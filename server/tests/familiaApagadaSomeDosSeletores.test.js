/**
 * Família apagada não pode continuar aparecendo nos seletores de configuração.
 * Executar: node server/tests/familiaApagadaSomeDosSeletores.test.js
 *
 * Apagar família é exclusão lógica (DELETE /api/familias/:id faz ativo = 0).
 * Dois lugares mostravam a família apagada mesmo assim:
 *
 *   1. GET /api/familias/todas  — a consulta não filtrava por ativo
 *   2. "Copiar ordem de outra família" — montado das chaves de
 *      variaveis_proposta_por_familia, que guardam NOME e não somem sozinhas
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => { passed++; console.log(`  ✓ ${name}`); })
        .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
    }
    passed++; console.log(`  ✓ ${name}`);
    return Promise.resolve();
  } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${e.message}`);
    return Promise.resolve();
  }
}

const dbRun = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, (e) => (e ? rej(e) : res())));
const dbAll = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r || []))));

/* ═══════════════════ 1. a consulta do endpoint ═══════════════════ */
// Mesma string SQL de GET /api/familias/todas. O teste de regressão abaixo
// confere que o index.js continua com ela.
const SQL_TODAS = 'SELECT * FROM familias_produto WHERE ativo = 1 ORDER BY ordem ASC, nome ASC';

async function testesConsulta() {
  console.log('\n── GET /api/familias/todas');

  const db = new sqlite3.Database(':memory:');
  await dbRun(db, `CREATE TABLE familias_produto (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE,
    ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1, grupo_id INTEGER)`);

  await dbRun(db, "INSERT INTO familias_produto (nome, ordem, ativo) VALUES ('Disco Dispersor', 1, 1)");
  await dbRun(db, "INSERT INTO familias_produto (nome, ordem, ativo) VALUES ('Masseira Bimix (MBY)', 2, 1)");
  await dbRun(db, "INSERT INTO familias_produto (nome, ordem, ativo) VALUES ('asdasd', 3, 0)");        // apagada
  await dbRun(db, "INSERT INTO familias_produto (nome, ordem, ativo) VALUES ('DISCO DISPERSOR', 4, 0)"); // apagada
  await dbRun(db, "INSERT INTO familias_produto (nome, ordem, ativo) VALUES ('a', 5, 0)");             // apagada

  const linhas = await dbAll(db, SQL_TODAS);
  const nomes = linhas.map((l) => l.nome);

  await test('não devolve nenhuma família apagada', () => {
    assert.deepStrictEqual(nomes.filter((n) => ['asdasd', 'a', 'DISCO DISPERSOR'].includes(n)), []);
  });

  await test('devolve todas as ativas', () => {
    assert.deepStrictEqual(nomes, ['Disco Dispersor', 'Masseira Bimix (MBY)']);
  });

  await test('duplicata só por diferença de caixa some junto quando está apagada', () => {
    // "Disco Dispersor" (ativa) fica; "DISCO DISPERSOR" (apagada) sai.
    assert(nomes.includes('Disco Dispersor'));
    assert(!nomes.includes('DISCO DISPERSOR'));
  });

  await test('apagar depois some da consulta', async () => {
    await dbRun(db, "UPDATE familias_produto SET ativo = 0 WHERE nome = 'Masseira Bimix (MBY)'");
    const depois = (await dbAll(db, SQL_TODAS)).map((l) => l.nome);
    assert.deepStrictEqual(depois, ['Disco Dispersor']);
  });

  db.close();
}

/* ═══════════════════ 2. guarda de regressão no index.js ═══════════════════ */
async function testeRegressao() {
  console.log('\n── Guarda de regressão no index.js');

  const fonte = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const rota = fonte.split("app.get('/api/familias/todas'")[1];

  await test('a rota /api/familias/todas existe', () => {
    assert(rota, 'rota não encontrada no index.js');
  });

  await test('a consulta da rota continua filtrando por ativo = 1', () => {
    const trecho = rota.slice(0, 400);
    assert(
      /FROM\s+familias_produto\s+WHERE\s+ativo\s*=\s*1/i.test(trecho),
      'o filtro "WHERE ativo = 1" saiu da consulta — família apagada volta a aparecer nos seletores'
    );
  });
}

/* ═══════════════════ 3. "Copiar ordem de outra família" ═══════════════════ */
// Replica a expressão do ConfigTemplateProposta para cobrir os casos de borda,
// no mesmo estilo de configVariaveisPorFamilia.test.js.
function familiasComOrdem({ config, familiasList, selecionada }) {
  const ativos = new Set(familiasList.map((f) => String(f.nome || '').trim()));
  return Object.entries(config || {})
    .filter(([fam, arr]) => fam !== selecionada && Array.isArray(arr) && arr.length > 0)
    .filter(([fam]) => familiasList.length === 0 || ativos.has(String(fam).trim()))
    .map(([fam, arr]) => ({ fam, total: arr.length }))
    .sort((a, b) => a.fam.localeCompare(b.fam, 'pt-BR'))
    .map((x) => x.fam);
}

async function testesCopiarOrdem() {
  console.log('\n── Seletor "Copiar ordem de outra família"');

  const config = {
    'Disco Dispersor': ['uso', 'dimensoes'],
    'Masseira Bimix (MBY)': ['uso'],
    'asdasd': ['uso', 'furacao'],        // família apagada, config ficou para trás
    'Silos (SL)': []                      // sem ordem gravada
  };
  const ativas = [{ nome: 'Disco Dispersor' }, { nome: 'Masseira Bimix (MBY)' }, { nome: 'Silos (SL)' }];

  await test('não oferece família apagada como origem da cópia', () => {
    const r = familiasComOrdem({ config, familiasList: ativas, selecionada: 'Disco Dispersor' });
    assert(!r.includes('asdasd'), JSON.stringify(r));
  });

  await test('oferece as ativas que têm ordem gravada', () => {
    const r = familiasComOrdem({ config, familiasList: ativas, selecionada: 'Disco Dispersor' });
    assert.deepStrictEqual(r, ['Masseira Bimix (MBY)']);
  });

  await test('não oferece a própria família selecionada', () => {
    const r = familiasComOrdem({ config, familiasList: ativas, selecionada: 'Masseira Bimix (MBY)' });
    assert(!r.includes('Masseira Bimix (MBY)'));
  });

  await test('família ativa sem ordem gravada não entra', () => {
    const r = familiasComOrdem({ config, familiasList: ativas, selecionada: 'Disco Dispersor' });
    assert(!r.includes('Silos (SL)'));
  });

  await test('lista ainda carregando não esconde tudo', () => {
    // familiasList vazia = requisição em voo; filtrar aqui faria a tela piscar vazia.
    const r = familiasComOrdem({ config, familiasList: [], selecionada: 'Disco Dispersor' });
    assert(r.length > 0, 'não pode zerar enquanto a lista não chegou');
  });

  await test('espaço em volta do nome não quebra o cruzamento', () => {
    const r = familiasComOrdem({
      config: { ' Masseira Bimix (MBY) ': ['uso'] },
      familiasList: ativas,
      selecionada: 'Disco Dispersor'
    });
    assert.deepStrictEqual(r, [' Masseira Bimix (MBY) ']);
  });
}

/* ═══════════════════════════════ RUN ═══════════════════════════════ */
(async () => {
  console.log('\n═══ Família apagada some dos seletores ═══');
  await testesConsulta();
  await testeRegressao();
  await testesCopiarOrdem();

  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
