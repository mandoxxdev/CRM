/**
 * Etapa 111 (G17, revisao da Fase 5) — os portoes de modulo do servidor, executados com banco de verdade.
 *
 * `checkModulePermission` e `checkAnyModulePermission` moravam no index.js e nenhum teste os rodava (o harness
 * `testApp` usa um portao falso). A revisao adversarial da 111 trocou a regra do "sem grupo" por
 * `MODULOS_LIBERADOS_SEM_GRUPO.length` (quem nao tem grupo ganharia todos os modulos) e apagou a chamada do log —
 * a suite inteira continuou verde. Este teste prende o comportamento de HOJE (RN-111.08, congelado — B63) e o
 * registro no log (RN-111.01/02) pelo caminho real: portao -> registrarTentativaAcessoNegado -> logs_auditoria.
 *
 * Executar: cd server && node tests/api/portaoDeModulo.api.test.js
 */
const assert = require('assert');
const sqlite3 = require('sqlite3');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}
const run = (db, sql, p = []) => new Promise((ok, ko) => db.run(sql, p, function (e) { return e ? ko(e) : ok(this); }));
const all = (db, sql, p = []) => new Promise((ok, ko) => db.all(sql, p, (e, r) => (e ? ko(e) : ok(r))));

(async () => {
  console.log('\n═══ Portoes de modulo do servidor com banco de verdade (Etapa 111, G17) ═══\n');
  const db = new sqlite3.Database(':memory:');
  // DDL de producao (index.js) das tabelas que os portoes e o log leem.
  await run(db, 'CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT)');
  await run(db, `CREATE TABLE permissoes (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, grupo_id INTEGER,
    modulo TEXT NOT NULL, acao TEXT NOT NULL, permissao INTEGER DEFAULT 0, restricao_cliente_id INTEGER,
    restricao_regiao TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(db, `CREATE TABLE grupos_permissoes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE,
    descricao TEXT, ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(db, `CREATE TABLE usuarios_grupos (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL,
    grupo_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(usuario_id, grupo_id))`);
  await run(db, `CREATE TABLE logs_auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, usuario_nome TEXT,
    usuario_email TEXT, tipo TEXT NOT NULL, modulo TEXT, nome_modulo TEXT, acao TEXT, detalhes TEXT, ip_address TEXT,
    user_agent TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  // 1 sem nada · 2 so em grupo ativo sem linhas · 3 permissao direta so de compras, sem grupo
  // 4 grupo ativo com almoxarifado · 5 so em grupo INATIVO (com linha de compras) · 6 admin
  for (let i = 1; i <= 6; i++) await run(db, 'INSERT INTO usuarios (id, nome, email) VALUES (?, ?, ?)', [i, `U${i}`, `u${i}@t`]);
  await run(db, "INSERT INTO grupos_permissoes (id, nome, ativo) VALUES (10, 'Vazio', 1), (11, 'Almox', 1), (12, 'Inativo', 0)");
  await run(db, 'INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES (2, 10), (4, 11), (5, 12)');
  await run(db, "INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (3, NULL, 'compras', 'acesso', 1)");
  await run(db, "INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (NULL, 11, 'almoxarifado', 'acesso', 1)");
  await run(db, "INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (NULL, 12, 'compras', 'acesso', 1)");

  const { criarPortoesDeModulo } = require('../../services/portaoDeModulo');
  const { registrarTentativaAcessoNegado } = require('../../services/acessoNegadoLog');
  const registros = [];
  const portoes = criarPortoesDeModulo({
    getDb: () => db,
    registrar: (req, modulo) => { registros.push(registrarTentativaAcessoNegado(db, req, modulo)); },
  });

  const USER = (id) => (id === 6 ? { id, email: 'u6@t', role: 'admin' } : { id, email: `u${id}@t`, role: 'usuario' });
  function passa(mw, userId) {
    return new Promise((resolve) => {
      const req = { user: USER(userId), ip: '1.2.3.4', connection: {}, get: () => 'ua' };
      const res = { status(c) { this.c = c; return this; }, json(b) { resolve({ status: this.c, body: b }); } };
      mw(req, res, () => resolve({ status: 'next' }));
    });
  }
  const ONZE = ['comercial', 'compras', 'financeiro', 'operacional', 'engenharia', 'engenharia_projetos',
    'almoxarifado', 'frota', 'todolist', 'administrativo', 'admin'];
  async function liberados(userId) {
    const out = [];
    for (const m of ONZE) if ((await passa(portoes.checkModulePermission(m), userId)).status === 'next') out.push(m);
    return out;
  }
  async function ultimoLog() { await Promise.all(registros); return (await all(db, 'SELECT * FROM logs_auditoria ORDER BY id DESC LIMIT 1'))[0]; }

  await test('RN-111.08 sem permissao e sem grupo: so comercial (congelado — B63)', async () => {
    assert.deepStrictEqual(await liberados(1), ['comercial']);
  });
  await test('RN-111.08 em grupo ativo sem a linha: nada, nem comercial ("sem grupo" nao e "sem linha")', async () => {
    assert.deepStrictEqual(await liberados(2), []);
  });
  await test('RN-111.08 permissao direta so de compras, sem grupo: compras E comercial (o cliente nega comercial)', async () => {
    assert.deepStrictEqual(await liberados(3), ['comercial', 'compras']);
  });
  await test('RN-111.08 grupo ativo com almoxarifado: so almoxarifado', async () => {
    assert.deepStrictEqual(await liberados(4), ['almoxarifado']);
  });
  await test('RN-111.08 so em grupo inativo: conta como sem grupo — comercial (a linha do grupo inativo nao vale)', async () => {
    assert.deepStrictEqual(await liberados(5), ['comercial']);
  });
  await test('admin do sistema passa em todos', async () => {
    assert.deepStrictEqual(await liberados(6), ONZE);
  });

  await test('RN-111.08 checkAnyModulePermission: sem grupo libera se a lista tem comercial; recusa as engenharias', async () => {
    assert.strictEqual((await passa(portoes.checkAnyModulePermission(['engenharia', 'comercial']), 1)).status, 'next');
    const r = await passa(portoes.checkAnyModulePermission(['engenharia', 'engenharia_projetos']), 1);
    assert.deepStrictEqual([r.status, r.body], [403, { error: 'Acesso negado ao módulo', modulo: ['engenharia', 'engenharia_projetos'] }]);
    assert.strictEqual((await passa(portoes.checkAnyModulePermission(['almoxarifado', 'frota']), 4)).status, 'next');
    assert.strictEqual((await passa(portoes.checkAnyModulePermission(['comercial', 'frota']), 2)).status, 403);
    // lista vazia cai no portao de comercial
    assert.strictEqual((await passa(portoes.checkAnyModulePermission([]), 1)).status, 'next');
    assert.strictEqual((await passa(portoes.checkAnyModulePermission([]), 2)).status, 403);
  });

  await test('RN-111.01 o 403 do portao grava o log com o nome (sem grupo, com grupo; 403 com a mensagem de sempre)', async () => {
    const r1 = await passa(portoes.checkModulePermission('almoxarifado'), 1);
    assert.deepStrictEqual([r1.status, r1.body], [403, { error: 'Acesso negado ao módulo', modulo: 'almoxarifado' }]);
    let row = await ultimoLog();
    assert.deepStrictEqual([row.usuario_id, row.tipo, row.modulo, row.nome_modulo], [1, 'acesso_negado', 'almoxarifado', 'Almoxarifado']);
    await passa(portoes.checkModulePermission('frota'), 2);
    row = await ultimoLog();
    assert.deepStrictEqual([row.usuario_id, row.modulo, row.nome_modulo], [2, 'frota', 'Frota']);
  });

  await test('RN-111.02 o 403 do checkAnyModulePermission grava a combinacao com os dois nomes', async () => {
    await passa(portoes.checkAnyModulePermission(['engenharia', 'engenharia_projetos']), 1);
    let row = await ultimoLog();
    assert.deepStrictEqual([row.modulo, row.nome_modulo], ['engenharia|engenharia_projetos', 'Cálculos de Engenharia ou Engenharia / Projetos']);
    await passa(portoes.checkAnyModulePermission(['todolist', 'frota']), 2);
    row = await ultimoLog();
    assert.deepStrictEqual([row.usuario_id, row.modulo, row.nome_modulo], [2, 'todolist|frota', 'TODOLIST ou Frota']);
  });

  await test('liberar nao grava log (metade negativa com a positiva acima)', async () => {
    await Promise.all(registros);
    const antes = (await all(db, 'SELECT COUNT(*) AS n FROM logs_auditoria'))[0].n;
    await passa(portoes.checkModulePermission('comercial'), 1);
    await passa(portoes.checkModulePermission('almoxarifado'), 4);
    await Promise.all(registros);
    assert.strictEqual((await all(db, 'SELECT COUNT(*) AS n FROM logs_auditoria'))[0].n, antes);
    assert.ok(antes > 0, 'o cenario anterior tinha de ter gravado');
  });

  await test('fiacao: index.js usa a fabrica e nao tem mais o corpo dos portoes', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'index.js'), 'utf8');
    assert.ok(/require\('\.\/services\/portaoDeModulo'\)/.test(src), 'index.js nao le services/portaoDeModulo');
    assert.ok(/criarPortoesDeModulo\(\{ getDb: \(\) => db, registrar: registrarTentativaAcessoNegado \}\)/.test(src), 'fabrica nao criada com o db e o log');
    assert.ok(!src.includes('Se não tem grupos, apenas comercial por padrão'), 'index.js ainda tem o corpo do portao');
    assert.ok(!src.includes('AND modulo = ? AND permissao = 1 LIMIT 1'), 'index.js ainda tem a consulta do portao');
  });

  await Promise.all(registros);
  db.close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
