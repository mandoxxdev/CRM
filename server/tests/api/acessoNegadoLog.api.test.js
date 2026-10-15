/**
 * Etapa 111 (G17) — o log de acesso negado do SERVIDOR grava o nome do modulo da fonte unica.
 *
 * Ate a 110 `registrarTentativaAcessoNegado` (index.js) tinha um mapa proprio com 7 nomes; os 403 de
 * almoxarifado, engenharia_projetos, frota e todolist (e a combinacao do checkAnyModulePermission)
 * iam para a tela Logs de Auditoria com a chave crua, enquanto a negacao do cliente
 * (POST /api/auditoria/tentativa-acesso, tela AcessoNegado) gravava o nome — o mesmo modulo com dois
 * nomes na mesma coluna. Agora o nome vem de services/modulosSistema.js (`nome`).
 *
 * Executa o servico contra um SQLite de verdade com a DDL de producao de `logs_auditoria`.
 *
 * Executar: cd server && node tests/api/acessoNegadoLog.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

const run = (db, sql, p = []) => new Promise((ok, ko) => db.run(sql, p, function (e) { return e ? ko(e) : ok(this); }));
const get = (db, sql, p = []) => new Promise((ok, ko) => db.get(sql, p, (e, r) => (e ? ko(e) : ok(r))));

// DDL de producao (index.js, "Tabela de Logs de Auditoria").
const DDL_LOGS = `CREATE TABLE IF NOT EXISTS logs_auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  usuario_nome TEXT,
  usuario_email TEXT,
  tipo TEXT NOT NULL,
  modulo TEXT,
  nome_modulo TEXT,
  acao TEXT,
  detalhes TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
)`;

function reqDe(userId, email = 'jwt@test.com') {
  return { user: { id: userId, email }, ip: '10.0.0.7', connection: {}, get: (h) => (h === 'user-agent' ? 'agente-teste' : undefined) };
}

const ESPERADO = {
  comercial: 'Comercial',
  compras: 'Compras',
  financeiro: 'Financeiro',
  operacional: 'Operacional',
  engenharia: 'Cálculos de Engenharia',
  engenharia_projetos: 'Engenharia / Projetos',
  almoxarifado: 'Almoxarifado',
  frota: 'Frota',
  todolist: 'TODOLIST',
  administrativo: 'Administrativo',
  admin: 'Administração',
  relatorios: 'Relatórios',
};

(async () => {
  console.log('\n═══ Log de acesso negado do servidor: nome da fonte unica (Etapa 111, G17) ═══\n');

  const db = new sqlite3.Database(':memory:');
  await run(db, 'CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT)');
  await run(db, DDL_LOGS);
  await run(db, "INSERT INTO usuarios (id, nome, email) VALUES (1, 'MARIA', 'maria@gmp.ind.br')");

  const { registrarTentativaAcessoNegado } = require('../../services/acessoNegadoLog');
  const { nomeDoModulo } = require('../../services/modulosSistema');

  async function registrarELer(req, modulo) {
    await registrarTentativaAcessoNegado(db, req, modulo);
    return get(db, 'SELECT * FROM logs_auditoria ORDER BY id DESC LIMIT 1');
  }

  await test('RN-111.01 cada modulo do servidor vai para o log com o nome (12 de 12), a coluna modulo continua a chave', async () => {
    const errados = [];
    for (const [chave, nome] of Object.entries(ESPERADO)) {
      const row = await registrarELer(reqDe(1), chave);
      if (row.modulo !== chave || row.nome_modulo !== nome) errados.push(`${chave} → ${row.modulo}/${row.nome_modulo}`);
    }
    assert.deepStrictEqual(errados, []);
  });

  await test('RN-111.01 os quatro que iam crus: almoxarifado, engenharia_projetos, frota, todolist', async () => {
    for (const chave of ['almoxarifado', 'engenharia_projetos', 'frota', 'todolist']) {
      const row = await registrarELer(reqDe(1), chave);
      assert.notStrictEqual(row.nome_modulo, chave, `${chave} ainda vai cru`);
      assert.strictEqual(row.nome_modulo, ESPERADO[chave]);
    }
  });

  await test('RN-111.01 o resto da linha como antes: usuario do banco, tipo, ip, agente', async () => {
    const row = await registrarELer(reqDe(1), 'compras');
    assert.deepStrictEqual(
      { id: row.usuario_id, nome: row.usuario_nome, email: row.usuario_email, tipo: row.tipo, ip: row.ip_address, ua: row.user_agent },
      { id: 1, nome: 'MARIA', email: 'maria@gmp.ind.br', tipo: 'acesso_negado', ip: '10.0.0.7', ua: 'agente-teste' }
    );
    assert.ok(row.created_at, 'created_at preenchido');
  });

  await test('RN-111.01 usuario fora do banco: nome e e-mail do token (como antes)', async () => {
    const row = await registrarELer(reqDe(99, 'fantasma@test.com'), 'frota');
    assert.deepStrictEqual([row.usuario_nome, row.usuario_email, row.nome_modulo], ['fantasma@test.com', 'fantasma@test.com', 'Frota']);
  });

  await test('RN-111.02 a combinacao do checkAnyModulePermission vira os nomes unidos por " ou "', async () => {
    const row = await registrarELer(reqDe(1), 'engenharia|engenharia_projetos');
    assert.strictEqual(row.modulo, 'engenharia|engenharia_projetos');
    assert.strictEqual(row.nome_modulo, 'Cálculos de Engenharia ou Engenharia / Projetos');
  });

  await test('RN-111.02 chave desconhecida continua crua (sozinha e dentro da combinacao)', async () => {
    assert.strictEqual((await registrarELer(reqDe(1), 'xyz')).nome_modulo, 'xyz');
    assert.strictEqual((await registrarELer(reqDe(1), 'compras|xyz')).nome_modulo, 'Compras ou xyz');
    assert.strictEqual(nomeDoModulo('xyz'), 'xyz');
    assert.strictEqual(nomeDoModulo('almoxarifado'), 'Almoxarifado');
  });

  await test('RN-111.03 fiacao: index.js nao tem mapa de nomes proprio e chama o servico', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.js'), 'utf8');
    assert.ok(!/'admin':\s*'Administração'/.test(src) && !/admin:\s*'Administração'/.test(src), 'index.js voltou a ter o mapa de nomes');
    assert.ok(/require\('\.\/services\/acessoNegadoLog'\)/.test(src), 'index.js nao le services/acessoNegadoLog');
    const m = src.match(/function registrarTentativaAcessoNegado\(req, modulo\) \{([\s\S]*?)\n\}/);
    assert.ok(m, 'registrarTentativaAcessoNegado nao encontrada em index.js');
    assert.ok(/registrarAcessoNegadoNoLog\(db, req, modulo\)/.test(m[1]), 'registrarTentativaAcessoNegado nao delega ao servico');
    assert.ok(!/INSERT INTO logs_auditoria/.test(m[1]), 'registrarTentativaAcessoNegado ainda grava por conta propria');
  });

  db.close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
