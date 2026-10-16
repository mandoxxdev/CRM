/**
 * Etapa 130 (B841, do nucleo; RN-09..RN-12) — as tres leituras de usuario so exigiam estar logado (B836).
 *
 * Medido (Fase 0): `GET /api/usuarios/:id` e `/:id/grupos` devolviam a qualquer logado o cadastro e o mapa de permissoes de qualquer
 * usuario (papel, administrador do sistema, perfil do almoxarifado e da frota, permissao por acao, negacoes). Quem le de verdade: o
 * `permissionsCache` (o PROPRIO id) e o `UsuarioForm` (so o administrador do sistema chega). A lista e lida tambem por duas abas das
 * Configuracoes do almoxarifado (administrador do modulo), que usam so id, nome, email e ativo.
 *
 * As rotas rodam de verdade: registradas pelo modulo de producao (`registrarLeituraDeUsuarios`) num express com banco SQLite real
 * (DDL de producao das tabelas lidas). O `authenticateToken` e trocado por um que poe `req.user` (o usuario ja enriquecido); a regra
 * de quem gerencia usuarios e a real (`systemPermissions.canManageUsers`). A fiacao no index.js (que nao sobe em teste) e presa por
 * texto (RN-12).
 *
 * Executar: cd server && node tests/api/leituraDeUsuarios.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const sqlite3 = require('sqlite3');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${String(e.message).slice(0, 500)}`); }
}
const run = (db, sql, p = []) => new Promise((ok, ko) => db.run(sql, p, function (e) { return e ? ko(e) : ok(this); }));

const L10 = 'Acesso negado — apenas o próprio usuário ou administradores do sistema';

(async () => {
  console.log('\n═══ Etapa 130: as leituras de usuario (B841, nucleo) ═══\n');
  const db = new sqlite3.Database(':memory:');
  await run(db, `CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL, cargo TEXT, role TEXT DEFAULT 'usuario', ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_superadmin INTEGER DEFAULT 0, pode_aprovar_descontos INTEGER DEFAULT 0, setor TEXT, departamento TEXT, flag_vendedor INTEGER DEFAULT 0,
    flag_compras INTEGER DEFAULT 0, flag_ti INTEGER DEFAULT 0, admin_modulos TEXT, is_oculto INTEGER DEFAULT 0)`);
  await run(db, `CREATE TABLE permissoes (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, grupo_id INTEGER,
    modulo TEXT NOT NULL, acao TEXT NOT NULL, permissao INTEGER DEFAULT 0, restricao_cliente_id INTEGER,
    restricao_regiao TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(db, `CREATE TABLE grupos_permissoes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE,
    descricao TEXT, ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(db, `CREATE TABLE usuarios_grupos (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL,
    grupo_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(usuario_id, grupo_id))`);
  await run(db, `CREATE TABLE perfil_almoxarifado_usuario (usuario_id INTEGER PRIMARY KEY, perfil TEXT NOT NULL DEFAULT 'PRODUCAO',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(db, `CREATE TABLE perfil_frota_usuario (usuario_id INTEGER PRIMARY KEY, perfil TEXT NOT NULL DEFAULT 'MOTORISTA',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  // 1 super · 2 admin do sistema (role admin) · 3 admin do modulo almoxarifado · 4 perfil Administrador do almoxarifado · 5 comum
  const U = [
    [1, 'Super', 's@t', 'admin', 1, null], [2, 'Admin Sistema', 'a@t', 'admin', 0, null],
    [3, 'Admin Modulo', 'm@t', 'usuario', 0, '["almoxarifado"]'], [4, 'Perfil Adm Almox', 'p@t', 'usuario', 0, null],
    [5, 'Comum', 'c@t', 'usuario', 0, null],
  ];
  for (const [id, nome, email, role, sup, mods] of U) {
    await run(db, `INSERT INTO usuarios (id, nome, email, senha, cargo, role, is_superadmin, admin_modulos, setor, flag_compras)
      VALUES (?, ?, ?, 'x', 'Cargo', ?, ?, ?, 'Setor', 1)`, [id, nome, email, role, sup, mods]);
  }
  await run(db, "INSERT INTO perfil_almoxarifado_usuario (usuario_id, perfil) VALUES (4, 'ADMINISTRADOR'), (5, 'ALMOXARIFE')");
  await run(db, "INSERT INTO grupos_permissoes (id, nome, descricao) VALUES (10, 'Almox', 'Grupo do almoxarifado')");
  await run(db, 'INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES (5, 10), (3, 10)');
  await run(db, "INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (NULL, 10, 'almoxarifado', 'acesso', 1)");
  await run(db, "INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (5, NULL, 'compras', 'acesso', 0)");

  const { registrarLeituraDeUsuarios } = require('../../services/leituraDeUsuarios');
  // O usuario "logado" ja enriquecido (o que o enrichUserFromDb poe em req.user): id, role, is_superadmin, admin_modulos.
  const COMO = {
    super: { id: 1, role: 'admin', is_superadmin: 1, admin_modulos: [] },
    admin: { id: 2, role: 'admin', is_superadmin: 0, admin_modulos: [] },
    adminModulo: { id: 3, role: 'usuario', is_superadmin: 0, admin_modulos: ['almoxarifado'] },
    perfilAdm: { id: 4, role: 'usuario', is_superadmin: 0, admin_modulos: [], perfil_almoxarifado: 'ADMINISTRADOR' },
    comum: { id: 5, role: 'usuario', is_superadmin: 0, admin_modulos: [] },
  };
  let atual = COMO.comum;
  const authenticateToken = (req, res, next) => { req.user = { ...atual }; next(); };
  const app = express();
  app.use(express.json());
  registrarLeituraDeUsuarios(app, { getDb: () => db, authenticateToken });
  const get = (quem, url) => { atual = COMO[quem]; return request(app).get(url); };
  const negado = (r) => {
    assert.strictEqual(r.status, 403, `esperava 403: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L10);
  };

  await test('[RN-09] GET /usuarios/:id: super e admin do sistema leem qualquer um (e 404 no inexistente); o proprio le o seu', async () => {
    for (const quem of ['super', 'admin']) {
      const r = await get(quem, '/api/usuarios/5');
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.nome, 'Comum');
      assert.strictEqual(r.body.role, 'usuario');
      assert.ok(Array.isArray(r.body.admin_modulos));
      assert.strictEqual((await get(quem, '/api/usuarios/999')).status, 404);
    }
    const proprio = await get('comum', '/api/usuarios/5');
    assert.strictEqual(proprio.status, 200, JSON.stringify(proprio.body));
    assert.strictEqual(proprio.body.email, 'c@t');
  });

  await test('[RN-09] GET /usuarios/:id: admin do modulo, perfil Administrador do almoxarifado e comum nao leem o de outro (403 L10, tambem no inexistente)', async () => {
    for (const quem of ['adminModulo', 'perfilAdm', 'comum']) {
      negado(await get(quem, '/api/usuarios/1'));
      negado(await get(quem, '/api/usuarios/999'));
    }
    // a metade positiva: o mesmo admin de modulo le o proprio
    assert.strictEqual((await get('adminModulo', '/api/usuarios/3')).status, 200);
  });

  await test('[RN-10] GET /usuarios/:id/grupos: o proprio recebe grupos, permissoes e o contexto (o permissionsCache); o outro, 403', async () => {
    const r = await get('comum', '/api/usuarios/5/grupos');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.grupos.map((g) => g.nome), ['Almox']);
    assert.ok(r.body.permissoes.some((p) => p.modulo === 'almoxarifado' && p.permissao === 1 && p.grupo_id === 10));
    assert.ok(r.body.permissoes.some((p) => p.modulo === 'compras' && p.permissao === 0 && p.grupo_id === null), 'a negada direta');
    assert.strictEqual(r.body.usuario.perfil_almoxarifado, 'ALMOXARIFE');
    const ctxModulo = await get('adminModulo', '/api/usuarios/3/grupos');
    assert.strictEqual(ctxModulo.body.usuario.perfil_almoxarifado, 'ADMINISTRADOR', 'admin do modulo vira perfil Administrador');
    for (const quem of ['adminModulo', 'perfilAdm']) negado(await get(quem, '/api/usuarios/5/grupos'));
    negado(await get('comum', '/api/usuarios/4/grupos'));
    negado(await get('comum', '/api/usuarios/999/grupos'));
    for (const quem of ['super', 'admin']) {
      const x = await get(quem, '/api/usuarios/5/grupos');
      assert.strictEqual(x.status, 200);
      assert.strictEqual(x.body.usuario.perfil_almoxarifado, 'ALMOXARIFE');
    }
    assert.strictEqual((await get('admin', '/api/usuarios/999/grupos')).status, 404);
  });

  await test('[RN-11] GET /usuarios: quem gerencia recebe a forma de hoje; os outros, so id, nome, email e ativo', async () => {
    const cheia = await get('admin', '/api/usuarios');
    assert.strictEqual(cheia.status, 200);
    assert.deepStrictEqual(cheia.body.map((u) => u.id), [3, 2, 5, 4, 1]); // ORDER BY nome
    const c5 = cheia.body.find((u) => u.id === 5);
    for (const k of ['role', 'is_superadmin', 'admin_modulos', 'grupos', 'modulos', 'cargo', 'setor', 'created_at', 'flag_compras']) {
      assert.ok(k in c5, `a lista do admin perdeu ${k}`);
    }
    assert.deepStrictEqual(c5.grupos.map((g) => g.nome), ['Almox']);
    assert.deepStrictEqual(c5.modulos, ['almoxarifado']);
    for (const quem of ['adminModulo', 'perfilAdm', 'comum']) {
      const r = await get(quem, '/api/usuarios');
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.deepStrictEqual(r.body.map((u) => u.id), [3, 2, 5, 4, 1]);
      for (const u of r.body) assert.deepStrictEqual(Object.keys(u).sort(), ['ativo', 'email', 'id', 'nome'], `${quem}: ${JSON.stringify(u)}`);
      assert.strictEqual(r.body.find((u) => u.id === 5).ativo, 1, 'ativo continua numerico (a aba filtra ativo !== 0)');
    }
    const pag = await get('comum', '/api/usuarios?limit=2&offset=1');
    assert.deepStrictEqual(pag.body.map((u) => u.id), [2, 5]);
  });

  await test('[RN-12] a fiacao: o index.js registra as tres pelo modulo, no lugar certo, e nao sobra rota de leitura propria', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.js'), 'utf8');
    const chamadas = src.match(/registrarLeituraDeUsuarios\(app,/g) || [];
    assert.strictEqual(chamadas.length, 1, `registrarLeituraDeUsuarios(app, aparece ${chamadas.length} vezes`);
    const pos = src.indexOf('registrarLeituraDeUsuarios(app,');
    const porModulo = src.indexOf("app.get('/api/usuarios/por-modulo/:modulo'");
    const post = src.indexOf("app.post('/api/usuarios'");
    assert.ok(porModulo > 0 && post > 0, 'as ancoras sumiram do index.js');
    assert.ok(porModulo < pos && pos < post, 'registrado fora do lugar (tem de vir depois de /por-modulo e antes do POST)');
    for (const rota of ["app.get('/api/usuarios',", "app.get('/api/usuarios/:id',", "app.get('/api/usuarios/:id/grupos',"]) {
      assert.ok(!src.includes(rota), `o index.js ainda declara ${rota}`);
    }
    assert.ok(!/function getUsuarioModuleContext\s*\(/.test(src), 'getUsuarioModuleContext continua definida no index.js');
    // Fase 5 (r3 R29/R30): o import tem de trazer as DUAS (o login usa getUsuarioModuleContext) e a chamada leva o authenticateToken
    assert.ok(/const \{[^}]*\bregistrarLeituraDeUsuarios\b[^}]*\bgetUsuarioModuleContext\b[^}]*\} = require\('\.\/services\/leituraDeUsuarios'\);/.test(src),
      'o index.js nao importa registrarLeituraDeUsuarios e getUsuarioModuleContext do modulo');
    assert.ok(src.includes('registrarLeituraDeUsuarios(app, { getDb: () => db, authenticateToken });'), 'a chamada mudou (getDb/authenticateToken)');
  });

  // ── Fase 5 (r2, B842): o usuario INATIVO ou APAGADO com o token valido nao guarda o papel do token ──
  await test('[RN-13 F5 r2] com o enriquecimento real: o ex-administrador desativado ou apagado perde o papel do token (lista reduzida, 403 nos outros)', async () => {
    const { enrichUserFromDb } = require('../../services/systemPermissions');
    await run(db, `INSERT INTO usuarios (id, nome, email, senha, role, is_superadmin, ativo) VALUES (20, 'Ex Admin', 'x@t', 'x', 'admin', 1, 0)`);
    let token = null;
    const app2 = express();
    // o JWT carrega o papel de quando o token foi emitido; o enriquecimento le o banco
    app2.use((req, res, next) => { req.user = { ...token }; enrichUserFromDb(db)(req, res, next); });
    registrarLeituraDeUsuarios(app2, { getDb: () => db, authenticateToken: (req, res, next) => next() });
    const como = (t, url) => { token = t; return request(app2).get(url); };
    const tokenAdmin = (id) => ({ id, role: 'admin', is_superadmin: 1, admin_modulos: ['almoxarifado'], perfil_almoxarifado: 'ADMINISTRADOR' });
    // a metade positiva: o admin ativo (id 2) continua lendo tudo
    assert.strictEqual((await como(tokenAdmin(2), '/api/usuarios/5')).status, 200);
    assert.ok('role' in (await como(tokenAdmin(2), '/api/usuarios')).body[0]);
    for (const id of [20, 77]) { // 20 desativado, 77 apagado (sem linha)
      negado(await como(tokenAdmin(id), '/api/usuarios/5'));
      negado(await como(tokenAdmin(id), '/api/usuarios/5/grupos'));
      const lista = await como(tokenAdmin(id), '/api/usuarios');
      assert.strictEqual(lista.status, 200);
      for (const u of lista.body) assert.deepStrictEqual(Object.keys(u).sort(), ['ativo', 'email', 'id', 'nome']);
    }
  });

  await test('[RN-13 F5 r2] erro do banco no enriquecimento nao rebaixa ninguem (so a AUSENCIA da linha rebaixa)', async () => {
    const { enrichUserFromDb } = require('../../services/systemPermissions');
    const dbQuebrado = { get: (sql, p, cb) => cb(new Error('SQLITE_BUSY')) };
    const req = { user: { id: 2, role: 'admin', is_superadmin: 1, admin_modulos: [] } };
    await new Promise((ok) => enrichUserFromDb(dbQuebrado)(req, {}, ok));
    assert.strictEqual(req.user.role, 'admin');
    const req2 = { user: { id: 77, role: 'admin', is_superadmin: 1, admin_modulos: ['almoxarifado'], perfil_almoxarifado: 'ADMINISTRADOR', perfil_frota: 'ADMIN_FROTA' } };
    await new Promise((ok) => enrichUserFromDb(db)(req2, {}, ok));
    assert.deepStrictEqual([req2.user.role, req2.user.is_superadmin, req2.user.admin_modulos, req2.user.perfil_almoxarifado, req2.user.perfil_frota],
      ['usuario', 0, [], undefined, undefined]);
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  db.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
