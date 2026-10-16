/**
 * Etapa 131 (B842, do nucleo; RN-06..RN-08) — a sessao do usuario desativado ou apagado.
 *
 * Ate a 130 o `enrichUserFromDb` sem a linha ativa rebaixava o usuario (sem papel, sem super, sem modulos) e seguia: o desativado
 * continuava usando o sistema como usuario comum ate o token vencer (24 h). Agora: 401 com `code: 'USUARIO_INATIVO'` — o client ja
 * desloga em qualquer 401 (`services/api.js`). O erro do banco continua deixando passar com o token (o SQLITE_BUSY nao desloga
 * ninguem). E o cache de 30 s saiu: era codigo morto (o index.js cria uma instancia por pedido), e como instancia unica faria a
 * retirada de papel demorar ate 30 s.
 *
 * RN-08 roda o caminho inteiro: `criarAuthenticateToken` (JWT de verdade) + `enrichUserFromDb` + as rotas do `registrarLeituraDeUsuarios`.
 *
 * Executar: cd server && node tests/api/sessaoDoInativo.api.test.js
 */
const assert = require('assert');
const express = require('express');
const request = require('supertest');
const sqlite3 = require('sqlite3');
const jwt = require('jsonwebtoken');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${String(e.message).slice(0, 600)}`); }
}
const run = (db, sql, p = []) => new Promise((ok, ko) => db.run(sql, p, function (e) { return e ? ko(e) : ok(this); }));

const L11 = 'Sessão encerrada — o usuário foi desativado ou removido';

/**
 * Roda o middleware como o express roda: devolve { proximo, status, corpo, req }. (Fase 5 r3 N35/N36) Espera o laco assentar depois da
 * primeira saida e falha se houve DUAS (resposta e next, ou duas respostas) — senao o "respondeu e seguiu" passava pela primeira.
 */
function rodar(mw, user) {
  return new Promise((ok, ko) => {
    const req = { user: user === undefined ? undefined : { ...user } };
    const saidas = [];
    const assentar = () => setImmediate(() => setImmediate(() => {
      if (saidas.length !== 1) return ko(new Error(`o middleware saiu ${saidas.length} vezes: ${JSON.stringify(saidas)}`));
      return ok({ ...saidas[0], req });
    }));
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(b) { saidas.push({ proximo: false, status: this.statusCode, corpo: b }); if (saidas.length === 1) assentar(); return this; },
    };
    mw(req, res, () => { saidas.push({ proximo: true, status: null, corpo: null }); if (saidas.length === 1) assentar(); });
  });
}

(async () => {
  console.log('\n═══ Etapa 131: a sessao do inativo (B842, nucleo) ═══\n');
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
  // 1 admin ativo · 2 comum ativo (perfil Almoxarife, frota Motorista) · 3 ex-admin desativado · (77 apagado: sem linha)
  await run(db, `INSERT INTO usuarios (id, nome, email, senha, cargo, role, is_superadmin, admin_modulos, setor, ativo) VALUES
    (1, 'Admin', 'a@t', 'x', 'TI', 'admin', 0, '["frota"]', 'Vendas', 1),
    (2, 'Comum', 'c@t', 'x', 'Vendedor', 'usuario', 0, NULL, 'Vendas', 1),
    (3, 'Ex Admin', 'x@t', 'x', 'Ex', 'admin', 1, '["almoxarifado"]', 'Vendas', 0),
    (4, 'Admin Almox', 'm@t', 'x', 'Chefe', 'usuario', 0, '["almoxarifado"]', 'Vendas', 1)`);
  // 4: administrador do modulo almoxarifado ATIVO, com uma linha PRODUCAO no perfil (Fase 5 r3 N31/N32)
  await run(db, "INSERT INTO perfil_almoxarifado_usuario (usuario_id, perfil) VALUES (4, 'PRODUCAO')");
  await run(db, "INSERT INTO perfil_almoxarifado_usuario (usuario_id, perfil) VALUES (2, 'ALMOXARIFE')");
  await run(db, "INSERT INTO perfil_frota_usuario (usuario_id, perfil) VALUES (2, 'MOTORISTA')");
  await run(db, "INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (2, NULL, 'comercial', 'acesso', 1), (3, NULL, 'comercial', 'acesso', 1)");

  const sp = require('../../services/systemPermissions');
  const { enrichUserFromDb, LITERAL_SESSAO_ENCERRADA } = sp;
  const tokenAdmin = (id) => ({ id, role: 'admin', is_superadmin: 1, admin_modulos: ['almoxarifado'], perfil_almoxarifado: 'ADMINISTRADOR', perfil_frota: 'ADMIN_FROTA' });

  await test('[RN-06] desativado ou apagado com o token valido: 401 L11 (USUARIO_INATIVO) e o pedido nao segue', async () => {
    assert.strictEqual(LITERAL_SESSAO_ENCERRADA, L11);
    for (const id of [3, 77]) {
      const r = await rodar(enrichUserFromDb(db), tokenAdmin(id));
      assert.strictEqual(r.proximo, false, `id ${id}: o pedido seguiu`);
      assert.strictEqual(r.status, 401, `id ${id}`);
      assert.deepStrictEqual(r.corpo, { error: L11, code: 'USUARIO_INATIVO' });
    }
  });

  await test('[RN-06] ativo: enriquecido como antes (nome, e-mail, papel, super, modulos, perfis do almoxarifado e da frota)', async () => {
    const a = await rodar(enrichUserFromDb(db), { id: 1, role: 'usuario', is_superadmin: 1 });
    assert.strictEqual(a.proximo, true);
    assert.deepStrictEqual([a.req.user.nome, a.req.user.email, a.req.user.role, a.req.user.is_superadmin, a.req.user.admin_modulos, a.req.user.perfil_frota],
      ['Admin', 'a@t', 'admin', 0, ['frota'], 'ADMIN_FROTA'], 'o banco manda, nao o token');
    const c = await rodar(enrichUserFromDb(db), { id: 2, role: 'admin' });
    assert.strictEqual(c.proximo, true);
    assert.deepStrictEqual([c.req.user.role, c.req.user.perfil_almoxarifado, c.req.user.perfil_frota], ['usuario', 'ALMOXARIFE', 'MOTORISTA']);
    // (Fase 5 r3 N31/N32) o administrador do modulo almoxarifado e ADMINISTRADOR, mesmo com outra linha no perfil
    const m = await rodar(enrichUserFromDb(db), { id: 4 });
    assert.deepStrictEqual([m.proximo, m.req.user.admin_modulos, m.req.user.perfil_almoxarifado], [true, ['almoxarifado'], 'ADMINISTRADOR']);
  });

  await test('[RN-06 F2-I1] banco ocupado: 503 e o pedido nao segue (o client repete; ninguem e deslogado nem fica com o papel do token)', async () => {
    for (const erro of [Object.assign(new Error('x'), { code: 'SQLITE_BUSY' }), new Error('SQLITE_BUSY: database is locked')]) {
      const r = await rodar(enrichUserFromDb({ get: (sql, p, cb) => cb(erro) }), tokenAdmin(3));
      assert.strictEqual(r.proximo, false, 'o pedido seguiu com o papel do token');
      assert.strictEqual(r.status, 503);
      assert.deepStrictEqual(r.corpo, { error: 'Banco temporariamente ocupado. Tente novamente em alguns segundos.', code: 'SQLITE_BUSY', retryAfter: 3, context: 'auth:enrich' });
    }
  });

  await test('[RN-06 F5-r2 M2] outro erro do banco: 500 e o pedido nao segue (nem com o papel do token, nem como comum)', async () => {
    const quebrado = { get: (sql, p, cb) => cb(new Error('SQLITE_IOERR: disco')) };
    const r = await rodar(enrichUserFromDb(quebrado), tokenAdmin(3));
    assert.deepStrictEqual([r.proximo, r.status, r.corpo], [false, 500, { error: 'SQLITE_IOERR: disco' }]);
  });

  await test('[RN-06 F5-r2 M2] BUSY ou erro na leitura do perfil (almoxarifado ou frota): 503/500, nao vira Producao naquele pedido', async () => {
    const busy = Object.assign(new Error('x'), { code: 'SQLITE_BUSY' });
    for (const tabela of ['perfil_almoxarifado_usuario', 'perfil_frota_usuario']) {
      const falhaNo = { get: (sql, p, cb) => (sql.includes(tabela) ? cb(busy) : db.get(sql, p, cb)) };
      const r = await rodar(enrichUserFromDb(falhaNo), { id: 2 });
      assert.deepStrictEqual([r.proximo, r.status, r.corpo && r.corpo.context], [false, 503, 'auth:enrich'], tabela);
      const outro = { get: (sql, p, cb) => (sql.includes(tabela) ? cb(new Error('SQLITE_IOERR')) : db.get(sql, p, cb)) };
      const o = await rodar(enrichUserFromDb(outro), { id: 2 });
      assert.deepStrictEqual([o.proximo, o.status], [false, 500], tabela);
    }
  });

  await test('[RN-06 F5-r2 M1] token sem id, ou com id que nao e inteiro positivo: 401 L11 sem ler o banco', async () => {
    let leu = 0;
    const espiao = { get: (sql, p, cb) => { leu++; cb(null, { id: 1, role: 'admin', is_superadmin: 1 }); } };
    for (const t of [{ email: 'sem@id', role: 'admin', is_superadmin: 1 }, { id: 0, role: 'admin' }, { id: '', role: 'admin' }, { id: 'abc' },
      { id: -1 }, { id: 1.5 }, { id: true }, { id: null }]) {
      const r = await rodar(enrichUserFromDb(espiao), t);
      assert.deepStrictEqual([r.proximo, r.status, r.corpo], [false, 401, { error: L11, code: 'USUARIO_INATIVO' }], JSON.stringify(t));
    }
    const semUser = await rodar(enrichUserFromDb(espiao), undefined);
    assert.strictEqual(semUser.status, 401);
    assert.strictEqual(leu, 0, 'leu o banco com id invalido');
    // a metade positiva: o id numerico em texto le o banco e segue
    const t = await rodar(enrichUserFromDb(db), { id: '2' });
    assert.deepStrictEqual([t.proximo, t.req.user.nome], [true, 'Comum']);
  });

  await test('[RN-07] sem cache: a MESMA instancia ve o papel trocado no banco e a desativacao no pedido seguinte', async () => {
    const mw = enrichUserFromDb(db);
    assert.strictEqual((await rodar(mw, { id: 2 })).req.user.role, 'usuario');
    await run(db, "UPDATE usuarios SET role = 'admin' WHERE id = 2");
    assert.strictEqual((await rodar(mw, { id: 2 })).req.user.role, 'admin', 'o segundo pedido levou o papel guardado');
    await run(db, "UPDATE usuarios SET role = 'usuario', ativo = 0 WHERE id = 2");
    const d = await rodar(mw, { id: 2 });
    assert.strictEqual(d.status, 401, 'o desativado entre os dois pedidos seguiu');
    await run(db, 'UPDATE usuarios SET ativo = 1 WHERE id = 2');
  });

  // ── RN-08: o caminho inteiro (JWT real + enriquecimento real + as rotas do modulo) ──
  const { criarAuthenticateToken } = require('../../services/authenticateToken');
  const { registrarLeituraDeUsuarios, projetarListaDeUsuarios, CAMPOS_EXTRAS_DOS_SELETORES } = require('../../services/leituraDeUsuarios');
  const { invalidateComercialResponsaveisCache } = require('../../services/comercialResponsaveisCache');
  const SEGREDO = 'segredo-e131';
  const authenticateToken = criarAuthenticateToken({ jwtSecret: SEGREDO, enrich: (req, res, next) => enrichUserFromDb(db)(req, res, next) });
  const app = express();
  app.use(express.json());
  registrarLeituraDeUsuarios(app, { getDb: () => db, authenticateToken });
  const assina = (p) => jwt.sign(p, SEGREDO, { expiresIn: '1h' });
  const get = (tok, url) => request(app).get(url).set('Authorization', `Bearer ${tok}`);

  await test('[RN-08] rota: admin ativo recebe a lista inteira; comum, a projetada; o ex-admin desativado e o apagado levam 401 L11 em todas', async () => {
    invalidateComercialResponsaveisCache();
    const a = await get(assina({ id: 1, role: 'admin' }), '/api/usuarios/comercial');
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    assert.ok(a.body.length >= 2 && a.body.every((u) => 'role' in u), JSON.stringify(a.body));
    const c = await get(assina({ id: 2, role: 'admin', is_superadmin: 1 }), '/api/usuarios/comercial');
    assert.strictEqual(c.status, 200);
    assert.ok(c.body.length >= 1);
    for (const u of c.body) assert.deepStrictEqual(Object.keys(u).sort(), ['ativo', 'cargo', 'email', 'id', 'nome'], 'o token de admin do comum nao vale');
    // (Fase 5 r3 N36) o BUSY pela rota: 503 e a rota nao roda (nem "headers already sent")
    const busyDb = { get: (sql, p, cb) => cb(Object.assign(new Error('x'), { code: 'SQLITE_BUSY' })) };
    const appBusy = express();
    let rotaRodou = 0;
    appBusy.get('/x', criarAuthenticateToken({ jwtSecret: SEGREDO, enrich: (req, res, next) => enrichUserFromDb(busyDb)(req, res, next) }),
      (req, res) => { rotaRodou++; res.json({ ok: 1 }); });
    const b = await request(appBusy).get('/x').set('Authorization', `Bearer ${assina({ id: 1, role: 'admin' })}`);
    await new Promise((r) => setImmediate(r));
    assert.deepStrictEqual([b.status, b.body.code, rotaRodou], [503, 'SQLITE_BUSY', 0]);
    for (const id of [3, 77]) {
      const tok = assina(tokenAdmin(id));
      for (const url of ['/api/usuarios', '/api/usuarios/comercial', '/api/usuarios/por-modulo/comercial', '/api/usuarios/filtrar?flag=compras', '/api/usuarios/2', '/api/usuarios/2/grupos']) {
        const r = await get(tok, url);
        assert.strictEqual(r.status, 401, `id ${id} ${url}: ${r.status} ${JSON.stringify(r.body)}`);
        assert.deepStrictEqual(r.body, { error: L11, code: 'USUARIO_INATIVO' });
      }
    }
    // a metade positiva do 401: o token invalido continua com a frase de antes (o client mostra "sessao expirada" so nela)
    const inv = await get(jwt.sign({ id: 1 }, 'outro'), '/api/usuarios');
    assert.deepStrictEqual([inv.status, inv.body.error], [401, 'Token inválido ou expirado']);
  });

  await test('[RN-08] servico: a projecao com o usuario enriquecido de verdade (o comum com token de admin vira comum)', async () => {
    const r = await rodar(enrichUserFromDb(db), tokenAdmin(2));
    assert.strictEqual(r.proximo, true);
    const linhas = [{ id: 9, nome: 'N', email: 'n@t', ativo: 1, cargo: 'K', role: 'admin', setor: 'S' }];
    assert.deepStrictEqual(projetarListaDeUsuarios(r.req.user, linhas, CAMPOS_EXTRAS_DOS_SELETORES), [{ id: 9, nome: 'N', email: 'n@t', ativo: 1, cargo: 'K' }]);
    const adm = await rodar(enrichUserFromDb(db), { id: 1 });
    assert.strictEqual(projetarListaDeUsuarios(adm.req.user, linhas, CAMPOS_EXTRAS_DOS_SELETORES), linhas);
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  db.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
