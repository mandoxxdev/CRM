/**
 * Etapa 131 (C270, do nucleo; RN-01..RN-05) — as tres listas de usuario dos seletores devolviam papel, setor, departamento, oculto e
 * data de criacao de outros usuarios a qualquer logado.
 *
 * Medido (Fase 0): quem chama `/usuarios/comercial` (os seletores de responsavel do comercial, via `fetchComercialResponsaveis` e
 * `useComercialResponsaveis`) le `id` e `nome`, e dois seletores leem `cargo`; `/usuarios/por-modulo/:modulo` (Dashboard, OSForm) le
 * `id` e `nome`; `/usuarios/filtrar` nao tem chamador. Por isso: quem gerencia usuarios (`canManageUsers`) recebe as linhas de hoje;
 * os outros, so `id`, `nome`, `email`, `ativo` e `cargo` — os filtros de setor, modulo e flag ficam como estavam.
 *
 * As rotas rodam de verdade: registradas pelo modulo de producao (`registrarLeituraDeUsuarios`) num express com banco SQLite real
 * (DDL de producao das tabelas lidas). O `authenticateToken` e trocado por um que poe `req.user` (o usuario ja enriquecido); a regra
 * de quem gerencia usuarios e a real. A fiacao no index.js (que nao sobe em teste) e presa por texto (RN-05).
 *
 * Executar: cd server && node tests/api/listasDeUsuarios.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const sqlite3 = require('sqlite3');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${String(e.message).slice(0, 600)}`); }
}
const run = (db, sql, p = []) => new Promise((ok, ko) => db.run(sql, p, function (e) { return e ? ko(e) : ok(this); }));

const L10 = 'Acesso negado — apenas o próprio usuário ou administradores do sistema';
const PROJECAO = ['ativo', 'cargo', 'email', 'id', 'nome'];
const chaves = (u) => Object.keys(u).sort();

(async () => {
  console.log('\n═══ Etapa 131: as listas de usuario dos seletores (C270, nucleo) ═══\n');
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

  // id, nome, role, super, setor, ativo, flag_compras, cargo
  const U = [
    [1, 'A Super', 'usuario', 1, 'Vendas', 1, 0, 'Diretor'],
    [2, 'B Admin', 'admin', 0, 'Fabrica', 1, 0, 'TI'],
    [3, 'C Comum', 'usuario', 0, 'Vendas', 1, 1, 'Assistente'],
    [4, 'D Vendedor', 'usuario', 0, 'Vendas', 1, 1, 'Vendedor'],
    [5, 'E Grupo', 'usuario', 0, ' VENDAS ', 1, 0, null],
    [6, 'F Outro Setor', 'usuario', 0, 'Fabrica', 1, 1, 'Comprador'],
    [7, 'G Inativo', 'usuario', 0, 'Vendas', 0, 1, 'Ex'],
    [8, 'H Sem Modulo', 'usuario', 0, 'Vendas', 1, 0, 'Estagio'],
    [9, 'I Negado', 'usuario', 0, 'Vendas', 1, 0, 'Negado'],
    [10, 'J Admin Vendas', 'admin', 0, 'Vendas', 1, 0, 'Gerente'],
  ];
  for (const [id, nome, role, sup, setor, ativo, fc, cargo] of U) {
    await run(db, `INSERT INTO usuarios (id, nome, email, senha, cargo, role, is_superadmin, setor, ativo, flag_compras, departamento, is_oculto)
      VALUES (?, ?, ?, 'x', ?, ?, ?, ?, ?, ?, 'Depto', 0)`, [id, nome, `u${id}@t`, cargo, role, sup, setor, ativo, fc]);
  }
  await run(db, "INSERT INTO grupos_permissoes (id, nome) VALUES (10, 'Comercial e OS')");
  await run(db, 'INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES (5, 10)');
  await run(db, `INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES
    (NULL, 10, 'comercial', 'acesso', 1), (NULL, 10, 'operacional', 'acesso', 1),
    (4, NULL, 'comercial', 'acesso', 1), (6, NULL, 'comercial', 'acesso', 1), (6, NULL, 'operacional', 'acesso', 1),
    (7, NULL, 'comercial', 'acesso', 1), (9, NULL, 'comercial', 'acesso', 0), (8, NULL, 'admin', 'acesso', 1)`);

  const { registrarLeituraDeUsuarios, projetarListaDeUsuarios, CAMPOS_EXTRAS_DOS_SELETORES } = require('../../services/leituraDeUsuarios');
  const { fetchComercialResponsaveis, invalidateComercialResponsaveisCache } = require('../../services/comercialResponsaveisCache');
  const COMO = {
    super: { id: 1, role: 'usuario', is_superadmin: 1, admin_modulos: [] },
    admin: { id: 2, role: 'admin', is_superadmin: 0, admin_modulos: [] },
    comum: { id: 3, role: 'usuario', is_superadmin: 0, admin_modulos: [] },
    adminModulo: { id: 4, role: 'usuario', is_superadmin: 0, admin_modulos: ['almoxarifado'], perfil_almoxarifado: 'ADMINISTRADOR' },
  };
  let atual = COMO.comum;
  const authenticateToken = (req, res, next) => { req.user = { ...atual }; next(); };
  const app = express();
  app.use(express.json());
  registrarLeituraDeUsuarios(app, { getDb: () => db, authenticateToken });
  const get = (quem, url) => { atual = COMO[quem]; return request(app).get(url); };
  const ids = (r) => r.body.map((u) => u.id);
  const projetada = (r, quem) => {
    assert.strictEqual(r.status, 200, `${quem}: ${r.status} ${JSON.stringify(r.body)}`);
    for (const u of r.body) assert.deepStrictEqual(chaves(u), PROJECAO, `${quem}: ${JSON.stringify(u)}`);
  };
  const inteira = (r, quem) => {
    assert.strictEqual(r.status, 200, `${quem}: ${r.status} ${JSON.stringify(r.body)}`);
    for (const u of r.body) for (const k of ['role', 'setor', 'departamento', 'created_at', 'cargo']) assert.ok(k in u, `${quem} perdeu ${k}`);
  };

  await test('[RN-01] /usuarios/comercial: o comum recebe so os do setor com o comercial (direto, por grupo ou admin), projetados', async () => {
    invalidateComercialResponsaveisCache();
    const r = await get('comum', '/api/usuarios/comercial');
    projetada(r, 'comum');
    assert.deepStrictEqual(ids(r), [4, 5, 10], 'setor sem diferenca de caixa e espaco; sem o inativo, o sem modulo e o negado');
    assert.deepStrictEqual(r.body.find((u) => u.id === 4), { id: 4, nome: 'D Vendedor', email: 'u4@t', ativo: 1, cargo: 'Vendedor' });
    assert.strictEqual(r.body.find((u) => u.id === 5).cargo, null, 'cargo nulo continua presente (o seletor testa o falsy)');
    // o administrador do modulo almoxarifado nao gerencia usuarios: tambem projetado
    invalidateComercialResponsaveisCache();
    projetada(await get('adminModulo', '/api/usuarios/comercial'), 'adminModulo');
  });

  await test('[RN-01] /usuarios/comercial: o admin ve todos os setores com o papel; o super com role usuario, inteiro mas so do setor dele', async () => {
    invalidateComercialResponsaveisCache();
    const a = await get('admin', '/api/usuarios/comercial');
    inteira(a, 'admin');
    assert.deepStrictEqual(ids(a), [2, 4, 5, 6, 10]);
    assert.strictEqual(a.body.find((u) => u.id === 10).role, 'admin');
    invalidateComercialResponsaveisCache();
    const s = await get('super', '/api/usuarios/comercial');
    inteira(s, 'super');
    assert.deepStrictEqual(ids(s), [4, 5, 10], 'o filtro de setor segue o role, como antes');
  });

  await test('[RN-02] o cache nao serve a forma de um para o outro (mesma chave: o super com role usuario e o comum, mesmo setor)', async () => {
    invalidateComercialResponsaveisCache();
    projetada(await get('comum', '/api/usuarios/comercial'), 'comum primeiro');
    // (Fase 2 M2) prova de que o segundo pedido veio do cache: o usuario novo do setor, com o comercial, nao aparece nele
    await run(db, "INSERT INTO usuarios (id, nome, email, senha, role, setor, ativo) VALUES (11, 'K Novo', 'u11@t', 'x', 'usuario', 'Vendas', 1)");
    await run(db, "INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (11, NULL, 'comercial', 'acesso', 1)");
    const quente = await get('super', '/api/usuarios/comercial');
    inteira(quente, 'super depois (cache quente)');
    assert.deepStrictEqual(ids(quente), [4, 5, 10], 'o segundo pedido nao veio do cache');
    invalidateComercialResponsaveisCache();
    assert.deepStrictEqual(ids(await get('super', '/api/usuarios/comercial')), [4, 5, 10, 11], 'controle: sem o cache o novo aparece');
    await run(db, 'DELETE FROM permissoes WHERE usuario_id = 11');
    await run(db, 'DELETE FROM usuarios WHERE id = 11');
    invalidateComercialResponsaveisCache();
    inteira(await get('super', '/api/usuarios/comercial'), 'super primeiro');
    projetada(await get('comum', '/api/usuarios/comercial'), 'comum depois (cache quente)');
    // o servico guarda e devolve as linhas inteiras (quem projeta e a rota)
    const ctx = { id: 3, role: 'usuario', ativo: 1, setor: 'Vendas' };
    const rows = await new Promise((ok, ko) => fetchComercialResponsaveis(db, COMO.comum, ctx, (e, x) => (e ? ko(e) : ok(x))));
    assert.ok(rows.length === 3 && rows.every((u) => 'role' in u && 'setor' in u), JSON.stringify(rows));
    // e a projecao exportada e a mesma da rota
    assert.deepStrictEqual(CAMPOS_EXTRAS_DOS_SELETORES, ['cargo']);
    assert.deepStrictEqual(chaves(projetarListaDeUsuarios(COMO.comum, rows, CAMPOS_EXTRAS_DOS_SELETORES)[0]), PROJECAO);
    assert.strictEqual(projetarListaDeUsuarios(COMO.admin, rows, CAMPOS_EXTRAS_DOS_SELETORES), rows);
    // sem extras, a forma da 130 (a lista /api/usuarios nao muda)
    assert.deepStrictEqual(chaves(projetarListaDeUsuarios(COMO.comum, rows)[0]), ['ativo', 'email', 'id', 'nome']);
  });

  await test('[RN-03] /usuarios/por-modulo/:modulo: mesma forma e mesmos filtros, com o modulo da rota (inclui por-modulo/admin)', async () => {
    const c = await get('comum', '/api/usuarios/por-modulo/operacional');
    projetada(c, 'comum');
    assert.deepStrictEqual(ids(c), [5, 10]);
    const a = await get('admin', '/api/usuarios/por-modulo/operacional');
    inteira(a, 'admin');
    assert.ok(a.body.every((u) => 'is_oculto' in u));
    assert.deepStrictEqual(ids(a), [2, 5, 6, 10]);
    const adm = await get('comum', '/api/usuarios/por-modulo/admin');
    projetada(adm, 'comum admin');
    assert.deepStrictEqual(ids(adm), [8, 10], 'quem tem o modulo admin e os role admin, do setor');
    const s = await get('super', '/api/usuarios/por-modulo/comercial');
    inteira(s, 'super');
    assert.deepStrictEqual(ids(s), [4, 5, 10]);
  });

  await test('[RN-04] /usuarios/filtrar: o envelope igual, os items projetados para quem nao gerencia, inteiros para quem gerencia', async () => {
    const c = await get('comum', '/api/usuarios/filtrar?flag=compras');
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.deepStrictEqual(Object.keys(c.body).sort(), ['count', 'flag', 'items', 'limit', 'offset']);
    assert.deepStrictEqual([c.body.flag, c.body.limit, c.body.offset, c.body.count], ['compras', 50, 0, 2]);
    assert.deepStrictEqual(c.body.items.map((u) => u.id), [3, 4], 'o setor exato do /filtrar (sem TRIM/LOWER, como antes)');
    for (const u of c.body.items) assert.deepStrictEqual(chaves(u), PROJECAO, JSON.stringify(u));
    const todos = await get('comum', '/api/usuarios/filtrar?flag=compras&ativo=all&limit=1&offset=1');
    assert.deepStrictEqual(todos.body.items.map((u) => u.id), [4]);
    const comInativo = await get('comum', '/api/usuarios/filtrar?flag=compras&ativo=all');
    assert.deepStrictEqual(comInativo.body.items.map((u) => u.id), [3, 4, 7]);
    const ti = await get('comum', '/api/usuarios/filtrar?flag=ti');
    assert.strictEqual(ti.status, 403);
    assert.strictEqual(ti.body.error, 'Filtro não permitido para o seu perfil');
    const xx = await get('comum', '/api/usuarios/filtrar?flag=xx');
    assert.strictEqual(xx.status, 400);
    assert.strictEqual(xx.body.error, 'flag inválida. Use: vendedor | compras | ti');
    assert.deepStrictEqual(xx.body.allowed, ['vendedor', 'compras', 'ti']);
    const a = await get('admin', '/api/usuarios/filtrar?flag=compras');
    assert.deepStrictEqual(a.body.items.map((u) => u.id), [3, 4, 6]);
    for (const u of a.body.items) for (const k of ['role', 'setor', 'flag_compras', 'is_oculto']) assert.ok(k in u, `admin perdeu ${k}`);
  });

  await test('[RN-01/03/04 F2-M1] o contexto como antes: inativo 403, sem linha 401, erro do banco 503/500', async () => {
    COMO.inativo = { id: 7, role: 'usuario' };
    COMO.semLinha = { id: 77, role: 'admin', is_superadmin: 1 };
    for (const url of ['/api/usuarios/comercial', '/api/usuarios/filtrar?flag=compras', '/api/usuarios/por-modulo/comercial']) {
      const i = await get('inativo', url);
      assert.deepStrictEqual([i.status, i.body.error], [403, 'Usuário inativo'], url);
      const n = await get('semLinha', url);
      assert.deepStrictEqual([n.status, n.body.error], [401, 'Usuário não encontrado'], url);
    }
    const busy = Object.assign(new Error('SQLITE_BUSY: database is locked'), { code: 'SQLITE_BUSY' });
    const quebrado = { get: (sql, p, cb) => cb(busy), all: (sql, p, cb) => cb(busy) };
    const app2 = express();
    registrarLeituraDeUsuarios(app2, { getDb: () => quebrado, authenticateToken });
    atual = COMO.comum;
    const c = await request(app2).get('/api/usuarios/comercial');
    assert.deepStrictEqual([c.status, c.body.code, c.body.retryAfter, c.body.context], [503, 'SQLITE_BUSY', 3, 'usuarios/comercial:context']);
    for (const url of ['/api/usuarios/filtrar?flag=compras', '/api/usuarios/por-modulo/comercial']) {
      const x = await request(app2).get(url);
      assert.deepStrictEqual([x.status, x.body.error], [500, 'SQLITE_BUSY: database is locked'], url);
    }
  });

  await test('[RN-05] a fiacao no modulo: /comercial, /filtrar e /por-modulo antes do /:id (o comum recebe a lista, nao o 403 L10)', async () => {
    for (const url of ['/api/usuarios/comercial', '/api/usuarios/por-modulo/comercial']) {
      const r = await get('comum', url);
      assert.strictEqual(r.status, 200, `${url}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.notStrictEqual(r.body.error, L10);
      assert.ok(Array.isArray(r.body), url);
    }
    assert.strictEqual((await get('comum', '/api/usuarios/filtrar?flag=compras')).status, 200);
    const rotas = app._router.stack.filter((l) => l.route).map((l) => l.route.path);
    const pos = (p) => rotas.indexOf(p);
    for (const p of ['/api/usuarios/comercial', '/api/usuarios/filtrar', '/api/usuarios/por-modulo/:modulo', '/api/usuarios', '/api/usuarios/:id']) {
      assert.ok(pos(p) >= 0, `${p} nao registrada (${rotas.join(', ')})`);
    }
    for (const p of ['/api/usuarios/comercial', '/api/usuarios/filtrar', '/api/usuarios/por-modulo/:modulo']) {
      assert.ok(pos(p) < pos('/api/usuarios/:id'), `${p} registrada depois do /:id`);
    }
  });

  await test('[RN-05] a fiacao no index.js: as tres rotas e o buildSetorCondition sairam; a chamada do registro continua uma, antes do POST', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.js'), 'utf8');
    for (const rota of ["app.get('/api/usuarios/comercial'", "app.get('/api/usuarios/filtrar'", "app.get('/api/usuarios/por-modulo/:modulo'"]) {
      assert.ok(!src.includes(rota), `o index.js ainda declara ${rota}`);
    }
    assert.ok(!/function buildSetorCondition\s*\(/.test(src), 'o index.js ainda define buildSetorCondition');
    const chamada = 'registrarLeituraDeUsuarios(app, { getDb: () => db, authenticateToken });';
    assert.strictEqual(src.split(chamada).length - 1, 1, 'a chamada do registro mudou ou repetiu');
    assert.ok(src.indexOf(chamada) < src.indexOf("app.post('/api/usuarios'"), 'o registro tem de vir antes do POST');
  });

  // ── Fase 5 (r3): os filtros que a massa de cima nao separava (nomes na ordem dos ids, um departamento so, ninguem com setor com
  // espaco e flag). Linhas novas, todas ativas, no setor Vendas salvo onde dito; este bloco e o ultimo do arquivo.
  await run(db, `INSERT INTO usuarios (id, nome, email, senha, cargo, role, setor, ativo, flag_compras, departamento) VALUES
    (12, 'AA Primeiro', 'u12@t', 'x', 'Auxiliar', 'usuario', 'Vendas', 1, 1, 'Outro'),
    (13, 'M Espaco', 'u13@t', 'x', 'X', 'usuario', ' Vendas ', 1, 1, 'Depto'),
    (14, 'N Comum Espaco', 'u14@t', 'x', 'X', 'usuario', ' Vendas ', 1, 0, 'Depto'),
    (15, 'O Grupo Negado', 'u15@t', 'x', 'X', 'usuario', 'Vendas', 1, 0, 'Depto'),
    (16, 'P Direto Errado', 'u16@t', 'x', 'X', 'usuario', 'Vendas', 1, 0, 'Depto'),
    (17, 'Q Grupo Zero', 'u17@t', 'x', 'X', 'usuario', 'Vendas', 1, 0, 'Depto')`);
  await run(db, "INSERT INTO grupos_permissoes (id, nome) VALUES (20, 'Negado')");
  await run(db, 'INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES (15, 20)');
  await run(db, `INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES
    (12, NULL, 'operacional', 'acesso', 1), (13, NULL, 'comercial', 'acesso', 1), (NULL, 20, 'operacional', 'acesso', 0),
    (16, 99, 'operacional', 'acesso', 1), (17, 0, 'operacional', 'acesso', 1)`);
  COMO.comumEspaco = { id: 14, role: 'usuario', is_superadmin: 0, admin_modulos: [] };

  await test('[RN-03 F5-r3] /por-modulo: ordem por nome, grupo com permissao 0 nao conta, linha direta com grupo_id de outro nao conta, grupo_id 0 conta', async () => {
    const r = await get('comum', '/api/usuarios/por-modulo/operacional');
    projetada(r, 'comum');
    assert.deepStrictEqual(ids(r), [12, 5, 10, 17]);
  });

  await test('[RN-01/03 F5-r3] o setor do proprio com espaco e caixa diferente ve o mesmo que o setor limpo (comercial e por-modulo)', async () => {
    for (const url of ['/api/usuarios/comercial', '/api/usuarios/por-modulo/operacional']) {
      invalidateComercialResponsaveisCache();
      const limpo = ids(await get('comum', url));
      invalidateComercialResponsaveisCache();
      const espaco = ids(await get('comumEspaco', url));
      assert.deepStrictEqual(espaco, limpo, url);
      assert.ok(limpo.length >= 3, url);
    }
    invalidateComercialResponsaveisCache();
    assert.ok(ids(await get('comum', '/api/usuarios/comercial')).includes(13), 'o setor " Vendas " de outro casa no comercial');
  });

  await test('[RN-04 F5-r3] /filtrar: setor exato, ordem por nome, limit/offset e seus limites, flag em caixa alta, ativo, q, departamento, ?setor= do admin, super sem a flag', async () => {
    const f = async (quem, qs) => (await get(quem, `/api/usuarios/filtrar?${qs}`)).body;
    assert.deepStrictEqual((await f('comum', 'flag=compras')).items.map((u) => u.id), [12, 3, 4], 'ordem por nome e o setor " Vendas " fora');
    const pag = await f('comum', 'flag=compras&limit=1&offset=1');
    assert.deepStrictEqual([pag.limit, pag.offset, pag.count, pag.items.map((u) => u.id)], [1, 1, 1, [3]]);
    assert.strictEqual((await f('comum', 'flag=compras&limit=500')).limit, 200);
    const neg = await f('comum', 'flag=compras&limit=-5');
    assert.deepStrictEqual([neg.limit, neg.items.length], [1, 1]);
    assert.strictEqual((await f('comum', 'flag=compras&offset=-3')).offset, 0);
    const caixa = await get('comum', '/api/usuarios/filtrar?flag=COMPRAS');
    assert.deepStrictEqual([caixa.status, caixa.body.flag], [200, 'compras']);
    for (const a of ['0', 'false']) assert.deepStrictEqual((await f('comum', `flag=compras&ativo=${a}`)).items.map((u) => u.id), [7], a);
    assert.deepStrictEqual((await f('comum', 'flag=compras&ativo=xyz')).items.map((u) => u.id), [12, 3, 4], 'valor estranho = ativos');
    const todos = (await f('comum', 'flag=compras&ativo=all')).items;
    assert.strictEqual(todos.find((u) => u.id === 7).ativo, 0, 'a projecao leva o ativo real');
    assert.deepStrictEqual((await f('comum', 'flag=compras&q=Vended')).items.map((u) => u.id), [4]);
    assert.deepStrictEqual((await f('comum', 'flag=compras&q=Assist')).items.map((u) => u.id), [3], 'q tambem casa o cargo');
    assert.deepStrictEqual((await f('comum', 'flag=compras&departamento=Outro')).items.map((u) => u.id), [12]);
    assert.deepStrictEqual((await f('admin', 'flag=compras&setor=Vendas')).items.map((u) => u.id), [12, 3, 4], 'o ?setor= do admin');
    assert.ok((await f('admin', 'flag=compras')).items.some((u) => u.id === 6), 'controle: sem ?setor= o admin ve a Fabrica');
    const sup = await get('super', '/api/usuarios/filtrar?flag=compras');
    assert.deepStrictEqual([sup.status, sup.body.error], [403, 'Filtro não permitido para o seu perfil'], 'o filtro de flag segue o role, nao o super');
  });

  await test('[RN-01/03/04 F5-r3] erro do banco na LISTA (o contexto leu): 503 com o context da lista na /comercial, 500 na /filtrar e na /por-modulo', async () => {
    const busy = Object.assign(new Error('SQLITE_BUSY: database is locked'), { code: 'SQLITE_BUSY' });
    const ctx = { id: 3, role: 'usuario', ativo: 1, setor: 'Vendas', flag_compras: 1 };
    const listaFalha = { get: (sql, p, cb) => cb(null, ctx), all: (sql, p, cb) => cb(busy) };
    const app3 = express();
    registrarLeituraDeUsuarios(app3, { getDb: () => listaFalha, authenticateToken });
    atual = COMO.comum;
    invalidateComercialResponsaveisCache();
    const c = await request(app3).get('/api/usuarios/comercial');
    assert.deepStrictEqual([c.status, c.body.code, c.body.context], [503, 'SQLITE_BUSY', 'usuarios/comercial']);
    for (const url of ['/api/usuarios/filtrar?flag=compras', '/api/usuarios/por-modulo/comercial']) {
      const x = await request(app3).get(url);
      assert.deepStrictEqual([x.status, x.body.error], [500, 'SQLITE_BUSY: database is locked'], url);
    }
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  db.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
