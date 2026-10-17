/**
 * Etapa 133 (C273, do nucleo; RN-01..RN-05) — as rotas de `/api/permissoes/*` recusavam com `req.user.role !== 'admin'` exato.
 *
 * Medido (Fase 0, servidor real): o super administrador com outro papel e o papel "Admin" com maiuscula levavam 403 nas 13 rotas
 * (e nos logs), enquanto o cadastro de usuarios (`canManageUsers`) os aceitava — a aba Permissoes e a aba Logs quebravam, e o salvar
 * do UsuarioForm gravava o usuario e nao os modulos ("Usuario salvo, mas houve erro ao salvar permissoes de modulos").
 *
 * As rotas rodam de verdade: registradas pelo modulo de producao (`registrarRotasDePermissoes`) num express com SQLite real (DDL de
 * producao das tabelas). O `authenticateToken` e trocado por um que poe `req.user` ja enriquecido (o que o enrichUserFromDb poe); as
 * reguas sao as reais (`systemPermissions`). A fiacao no index.js e presa por texto (RN-05); o servidor real e o
 * `permissoesNoServidor.api.test.js` (RN-06).
 *
 * Executar: cd server && node tests/api/rotasDePermissoes.api.test.js
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
const all = (db, sql, p = []) => new Promise((ok, ko) => db.all(sql, p, (e, r) => (e ? ko(e) : ok(r))));

const L1 = 'Acesso negado';
const L2 = 'Apenas administradores podem gerenciar permissões';

(async () => {
  console.log('\n═══ Etapa 133: a regua das rotas de permissoes (C273, nucleo) ═══\n');
  const db = new sqlite3.Database(':memory:');
  await run(db, `CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL, cargo TEXT, role TEXT DEFAULT 'usuario', ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_superadmin INTEGER DEFAULT 0, setor TEXT, departamento TEXT, admin_modulos TEXT, is_oculto INTEGER DEFAULT 0)`);
  await run(db, `CREATE TABLE grupos_permissoes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE, descricao TEXT,
    ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(db, `CREATE TABLE permissoes (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, grupo_id INTEGER,
    modulo TEXT NOT NULL, acao TEXT NOT NULL, permissao INTEGER DEFAULT 0, restricao_cliente_id INTEGER, restricao_regiao TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (grupo_id) REFERENCES grupos_permissoes(id) ON DELETE CASCADE)`);
  await run(db, `CREATE TABLE usuarios_grupos (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, grupo_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (grupo_id) REFERENCES grupos_permissoes(id) ON DELETE CASCADE, UNIQUE(usuario_id, grupo_id))`);

  // 1 S super papel usuario · 2 A papel "Admin" · 3 a papel admin · 4 M admin do modulo "admin" · 5 P perfil Adm almox · 6 C comum
  // 7 e 8 alvos comuns
  const U = [[1, 'S', 'usuario', 1, null], [2, 'A', 'Admin', 0, null], [3, 'a', 'admin', 0, null], [4, 'M', 'usuario', 0, '["admin"]'],
    [5, 'P', 'usuario', 0, null], [6, 'C', 'usuario', 0, null], [7, 'Alvo7', 'usuario', 0, null], [8, 'Alvo8', 'usuario', 0, null]];
  for (const [id, nome, role, sup, mods] of U) {
    await run(db, 'INSERT INTO usuarios (id, nome, email, senha, role, is_superadmin, admin_modulos) VALUES (?, ?, ?, \'x\', ?, ?, ?)',
      [id, nome, `${nome.toLowerCase()}${id}@t`, role, sup, mods]);
  }

  const COMO = {
    S: { id: 1, role: 'usuario', is_superadmin: 1, admin_modulos: [] },
    A: { id: 2, role: 'Admin', is_superadmin: 0, admin_modulos: [] },
    a: { id: 3, role: 'admin', is_superadmin: 0, admin_modulos: [] },
    M: { id: 4, role: 'usuario', is_superadmin: 0, admin_modulos: ['admin'] },
    P: { id: 5, role: 'usuario', is_superadmin: 0, admin_modulos: [], perfil_almoxarifado: 'ADMINISTRADOR' },
    C: { id: 6, role: 'usuario', is_superadmin: 0, admin_modulos: [] },
  };
  const GERENCIAM = ['S', 'A', 'a'];
  const NAO = ['M', 'P', 'C'];

  let registrarRotasDePermissoes;
  try {
    ({ registrarRotasDePermissoes } = require('../../services/rotasDePermissoes'));
  } catch (e) {
    console.error(`  ✗ services/rotasDePermissoes nao carrega: ${e.message}`);
    failed++;
  }
  let atual = COMO.C;
  const authenticateToken = (req, res, next) => { req.user = { ...atual }; next(); };
  const app = express();
  app.use(express.json());
  if (registrarRotasDePermissoes) registrarRotasDePermissoes(app, { getDb: () => db, authenticateToken });
  const pede = (quem, m, url, body) => { atual = COMO[quem]; const r = request(app)[m](url); return body ? r.send(body) : r; };
  const recusa = (r, literal, ctx) => {
    assert.strictEqual(r.status, 403, `${ctx}: esperava 403: ${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(r.body, { error: literal }, ctx);
  };
  const foto = async () => JSON.stringify([
    await all(db, 'SELECT * FROM permissoes ORDER BY id'), await all(db, 'SELECT * FROM grupos_permissoes ORDER BY id'),
    await all(db, 'SELECT * FROM usuarios_grupos ORDER BY id')]);

  // estado de partida: um grupo com o alvo 8 e uma permissao direta do alvo 7 e do 6 (o proprio)
  await run(db, "INSERT INTO grupos_permissoes (id, nome, descricao) VALUES (10, 'G10', 'grupo')");
  await run(db, 'INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES (8, 10)');
  await run(db, "INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (NULL, 10, 'compras', 'visualizar', 1)");
  await run(db, "INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (7, NULL, 'frota', 'visualizar', 1)");
  await run(db, "INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (6, NULL, 'financeiro', 'visualizar', 1)");

  // As 12 de gestao, com o literal de recusa de hoje (RN-01)
  const GESTAO = [
    ['post', '/api/permissoes', L2, { usuario_id: 7, grupo_id: null, modulo: 'compras', acao: 'visualizar', permissao: 1 }],
    ['get', '/api/permissoes/grupos', L1], ['post', '/api/permissoes/grupos', L1, { nome: 'NOVO', descricao: 'x' }],
    ['get', '/api/permissoes/grupos/10', L1], ['put', '/api/permissoes/grupos/10', L1, { nome: 'G10', descricao: 'mudou', ativo: 1 }],
    ['delete', '/api/permissoes/grupos/10', L1], ['get', '/api/permissoes/grupos/10/usuarios', L1],
    ['post', '/api/permissoes/grupos/10/usuarios', L1, { usuario_id: 7 }], ['delete', '/api/permissoes/grupos/10/usuarios/8', L1],
    ['get', '/api/permissoes/grupos/10/permissoes', L1], ['delete', '/api/permissoes/usuario/7/modulos', L1],
  ];

  await test('[RN-01] M, P e C: 403 com o literal de hoje nas 11 de gestao, e a recusa nao grava nada', async () => {
    const antes = await foto();
    for (const quem of NAO) {
      for (const [m, url, lit, body] of GESTAO) recusa(await pede(quem, m, url, body), lit, `${quem} ${m} ${url}`);
    }
    assert.strictEqual(await foto(), antes, 'o banco mudou numa recusa');
  });

  await test('[RN-01] S, A e a leem: grupos, o grupo, os usuarios e as permissoes do grupo (o corpo de hoje)', async () => {
    for (const quem of GERENCIAM) {
      const g = await pede(quem, 'get', '/api/permissoes/grupos');
      assert.strictEqual(g.status, 200, `${quem}: ${JSON.stringify(g.body)}`);
      assert.deepStrictEqual(g.body.map((x) => x.nome), ['G10']);
      const um = await pede(quem, 'get', '/api/permissoes/grupos/10');
      assert.deepStrictEqual([um.status, um.body.nome], [200, 'G10'], quem);
      const nf = await pede(quem, 'get', '/api/permissoes/grupos/999');
      assert.deepStrictEqual([nf.status, nf.body], [404, { error: 'Grupo não encontrado' }], quem);
      const us = await pede(quem, 'get', '/api/permissoes/grupos/10/usuarios');
      assert.deepStrictEqual([us.status, us.body.map((x) => x.id)], [200, [8]], quem);
      const ps = await pede(quem, 'get', '/api/permissoes/grupos/10/permissoes');
      assert.deepStrictEqual([ps.status, ps.body.map((x) => x.modulo)], [200, ['compras']], quem);
    }
  });

  await test('[RN-01] S, A e a gravam: o salvar do UsuarioForm (DELETE dos modulos + POST) e o CRUD de grupo e de membro', async () => {
    const quemNoAlvo = { S: 7, A: 8, a: 7 };
    for (const quem of GERENCIAM) {
      const alvo = quemNoAlvo[quem];
      const d = await pede(quem, 'delete', `/api/permissoes/usuario/${alvo}/modulos`);
      assert.deepStrictEqual([d.status, d.body], [200, { message: 'Permissões de módulos removidas com sucesso' }], quem);
      assert.deepStrictEqual(await all(db, 'SELECT modulo FROM permissoes WHERE usuario_id = ? AND grupo_id IS NULL', [alvo]), [], quem);
      for (const modulo of ['financeiro', 'compras']) {
        const p = await pede(quem, 'post', '/api/permissoes', { usuario_id: alvo, grupo_id: null, modulo, acao: 'visualizar', permissao: 1,
          restricao_cliente_id: null, restricao_regiao: null });
        assert.deepStrictEqual([p.status, p.body.message], [200, 'Permissão criada com sucesso'], `${quem} ${modulo}`);
      }
      const gravadas = await all(db, 'SELECT modulo FROM permissoes WHERE usuario_id = ? AND grupo_id IS NULL ORDER BY modulo', [alvo]);
      assert.deepStrictEqual(gravadas.map((x) => x.modulo), ['compras', 'financeiro'], quem);

      const ng = await pede(quem, 'post', '/api/permissoes/grupos', { nome: `G-${quem}`, descricao: 'x' });
      assert.deepStrictEqual([ng.status, ng.body.message], [200, 'Grupo criado com sucesso'], quem);
      const gid = ng.body.id;
      const pg = await pede(quem, 'put', `/api/permissoes/grupos/${gid}`, { nome: `G-${quem}`, descricao: 'mudou', ativo: 0 });
      assert.deepStrictEqual([pg.status, pg.body.message], [200, 'Grupo atualizado com sucesso'], quem);
      const au = await pede(quem, 'post', `/api/permissoes/grupos/${gid}/usuarios`, { usuario_id: 6 });
      assert.deepStrictEqual([au.status, au.body.message], [200, 'Usuário adicionado ao grupo com sucesso'], quem);
      const inex = await pede(quem, 'post', `/api/permissoes/grupos/${gid}/usuarios`, { usuario_id: 999 });
      assert.deepStrictEqual([inex.status, inex.body], [404, { error: 'Usuário não encontrado' }], quem);
      const ru = await pede(quem, 'delete', `/api/permissoes/grupos/${gid}/usuarios/6`);
      assert.deepStrictEqual([ru.status, ru.body.message], [200, 'Usuário removido do grupo com sucesso'], quem);
      const dg = await pede(quem, 'delete', `/api/permissoes/grupos/${gid}`);
      assert.deepStrictEqual([dg.status, dg.body.message], [200, 'Grupo excluído com sucesso'], quem);
      assert.deepStrictEqual(await all(db, 'SELECT id, descricao, ativo FROM grupos_permissoes WHERE id = ?', [gid]), [], quem);
    }
  });

  await test('[RN-01] o POST /permissoes com permissao 0 apaga a existente, e com uma que nao existe nada faz (o corpo de hoje)', async () => {
    const r = await pede('A', 'post', '/api/permissoes', { usuario_id: 8, grupo_id: null, modulo: 'compras', acao: 'visualizar', permissao: 0 });
    assert.deepStrictEqual([r.status, r.body.message], [200, 'Permissão removida com sucesso']);
    const r2 = await pede('S', 'post', '/api/permissoes', { usuario_id: 8, grupo_id: null, modulo: 'compras', acao: 'visualizar', permissao: 0 });
    assert.deepStrictEqual([r2.status, r2.body.message], [200, 'Permissão não existe, nada a fazer']);
  });

  await test('[RN-02] GET /permissoes/usuario/:id: S, A e a leem qualquer um; M, P e C so o proprio (pelo numero: 06), 403 L1 no outro', async () => {
    for (const quem of GERENCIAM) {
      const r = await pede(quem, 'get', '/api/permissoes/usuario/7');
      assert.strictEqual(r.status, 200, `${quem}: ${JSON.stringify(r.body)}`);
      assert.deepStrictEqual(r.body.map((x) => x.modulo).sort(), ['compras', 'financeiro'], quem);
    }
    for (const quem of NAO) {
      const outro = await pede(quem, 'get', '/api/permissoes/usuario/7');
      recusa(outro, L1, `${quem} no 7`);
      const id = COMO[quem].id;
      for (const url of [`/api/permissoes/usuario/${id}`, `/api/permissoes/usuario/0${id}`]) {
        const meu = await pede(quem, 'get', url);
        assert.strictEqual(meu.status, 200, `${quem} ${url}: ${JSON.stringify(meu.body)}`);
      }
    }
    const meuC = await pede('C', 'get', '/api/permissoes/usuario/06');
    assert.deepStrictEqual(meuC.body.map((x) => x.modulo), ['financeiro']);
  });

  await test('[RN-03] /verificar: S, A e a -> permitido, motivo admin; os outros pelo banco (explicita, grupo, sem)', async () => {
    for (const quem of GERENCIAM) {
      const r = await pede(quem, 'get', '/api/permissoes/verificar?modulo=qualquer&acao=visualizar');
      assert.deepStrictEqual([r.status, r.body], [200, { permitido: true, motivo: 'admin' }], quem);
    }
    const c1 = await pede('C', 'get', '/api/permissoes/verificar?modulo=financeiro&acao=visualizar');
    assert.deepStrictEqual(c1.body, { permitido: true, motivo: 'permissao_explicita' });
    // o corpo de hoje: sem linha de grupo, `permitido` e undefined e some do JSON (so o motivo) — nao muda nesta etapa
    const c2 = await pede('M', 'get', '/api/permissoes/verificar?modulo=admin&acao=visualizar');
    assert.deepStrictEqual(c2.body, { motivo: 'sem_permissao' }, 'o admin do modulo nao e o administrador do sistema: ' + JSON.stringify(c2.body));
    await run(db, 'INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES (5, 10)');
    await run(db, "INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (NULL, 10, 'estoque', 'visualizar', 1)");
    const c3 = await pede('P', 'get', '/api/permissoes/verificar?modulo=estoque&acao=visualizar');
    assert.deepStrictEqual(c3.body, { permitido: true, motivo: 'permissao_grupo' });
  });

  // ── Fase 5 r3 (sabotagens que sobreviveram por falta de asserção): "o corpo de hoje" das rotas movidas ────────────
  await test('[RN-01 corpo] a lista de grupos sai por nome (nem por id crescente nem decrescente)', async () => {
    await run(db, "INSERT INTO grupos_permissoes (id, nome, descricao) VALUES (30, 'AAA', 'x'), (20, 'ZZZ', 'x')");
    const r = await pede('S', 'get', '/api/permissoes/grupos');
    assert.deepStrictEqual(r.body.map((x) => x.nome), ['AAA', 'G10', 'ZZZ']);
    await run(db, 'DELETE FROM grupos_permissoes WHERE id IN (20, 30)');
  });

  await test('[RN-01 corpo] o POST de uma permissao que ja existe atualiza (permissao 1 e as restricoes); o INSERT grava as restricoes', async () => {
    const base = { usuario_id: 8, grupo_id: null, modulo: 'frota', acao: 'visualizar', permissao: 1 };
    const c = await pede('a', 'post', '/api/permissoes', { ...base, restricao_cliente_id: 77, restricao_regiao: 'SUL' });
    assert.deepStrictEqual([c.status, c.body.message], [200, 'Permissão criada com sucesso']);
    const [l1] = await all(db, 'SELECT permissao, restricao_cliente_id, restricao_regiao FROM permissoes WHERE id = ?', [c.body.id]);
    assert.deepStrictEqual(l1, { permissao: 1, restricao_cliente_id: 77, restricao_regiao: 'SUL' });
    const u = await pede('A', 'post', '/api/permissoes', { ...base, restricao_cliente_id: null, restricao_regiao: 'NORTE' });
    assert.deepStrictEqual([u.status, u.body], [200, { message: 'Permissão atualizada com sucesso', id: c.body.id }]);
    const [l2] = await all(db, 'SELECT permissao, restricao_cliente_id, restricao_regiao FROM permissoes WHERE id = ?', [c.body.id]);
    assert.deepStrictEqual(l2, { permissao: 1, restricao_cliente_id: null, restricao_regiao: 'NORTE' });
    assert.strictEqual((await all(db, "SELECT id FROM permissoes WHERE usuario_id = 8 AND modulo = 'frota'")).length, 1, 'nao duplica');
  });

  await test('[RN-01 corpo] o grupo: POST sem ativo nasce ativo; PUT grava o ativo 0; o membro sai sozinho (o outro fica)', async () => {
    const g = await pede('S', 'post', '/api/permissoes/grupos', { nome: 'SEM-ATIVO', descricao: 'x' });
    const [l1] = await all(db, 'SELECT ativo FROM grupos_permissoes WHERE id = ?', [g.body.id]);
    assert.strictEqual(l1.ativo, 1);
    for (const uid of [6, 7]) await pede('S', 'post', `/api/permissoes/grupos/${g.body.id}/usuarios`, { usuario_id: uid });
    await pede('A', 'delete', `/api/permissoes/grupos/${g.body.id}/usuarios/6`);
    const membros = await pede('A', 'get', `/api/permissoes/grupos/${g.body.id}/usuarios`);
    assert.deepStrictEqual(membros.body.map((x) => x.id), [7], 'so o 6 saiu');
    await pede('a', 'put', `/api/permissoes/grupos/${g.body.id}`, { nome: 'SEM-ATIVO', descricao: 'y', ativo: 0 });
    const [l2] = await all(db, 'SELECT ativo, descricao FROM grupos_permissoes WHERE id = ?', [g.body.id]);
    assert.deepStrictEqual(l2, { ativo: 0, descricao: 'y' });
    // /verificar pelo grupo INATIVO: nao vale
    await run(db, "INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (NULL, ?, 'qualidade', 'visualizar', 1)", [g.body.id]);
    atual = { id: 7, role: 'usuario', is_superadmin: 0, admin_modulos: [] };
    const v = await request(app).get('/api/permissoes/verificar?modulo=qualidade&acao=visualizar');
    assert.deepStrictEqual(v.body, { motivo: 'sem_permissao' }, 'o grupo inativo nao da permissao');
    await run(db, 'UPDATE grupos_permissoes SET ativo = 1 WHERE id = ?', [g.body.id]);
    const v2 = await request(app).get('/api/permissoes/verificar?modulo=qualidade&acao=visualizar');
    assert.deepStrictEqual(v2.body, { permitido: true, motivo: 'permissao_grupo' }, 'metade positiva: o grupo ativo da');
  });

  // ── RN-05 — a fiacao (estatico, sem comentarios) ─────────────────────────────────────────
  const semComentario = (txt) => txt.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const indexJs = semComentario(fs.readFileSync(path.join(__dirname, '..', '..', 'index.js'), 'utf8'));
  const servicoArq = path.join(__dirname, '..', '..', 'services', 'rotasDePermissoes.js');

  await test('[RN-05] index.js: nenhuma rota /api/permissoes sobra e o registrador aparece uma vez, antes da busca global', () => {
    const sobra = indexJs.match(/app\.(get|post|put|patch|delete|use)\(\s*['"`]\/api\/permissoes/g) || [];
    assert.deepStrictEqual(sobra, [], 'rota de permissoes ainda no index.js');
    const chamada = 'registrarRotasDePermissoes(app, { getDb: () => db, authenticateToken });';
    assert.strictEqual(indexJs.split(chamada).length, 2, 'o registrador tem de aparecer uma vez');
    const busca = indexJs.indexOf("app.get('/api/busca-global'");
    assert.ok(busca > 0 && indexJs.indexOf(chamada) < busca, 'o registrador vem antes da busca global (o ponto das rotas antigas)');
  });

  await test('[RN-05] o servico nao compara papel (so as reguas de systemPermissions; o u.role da resposta fica — Fase 2 C2)', () => {
    const fonte = semComentario(fs.readFileSync(servicoArq, 'utf8'));
    assert.ok(!/role\s*(!==|===|!=|==)/.test(fonte), 'o servico compara papel');
    assert.ok(/u\.role/.test(fonte), 'o GET dos usuarios do grupo continua devolvendo o papel (contrato)');
    assert.ok(/canManageUsers\(req\.user\)/.test(fonte), 'canManageUsers');
    assert.ok(/bypassModuleRestrictions\(req\.user\)/.test(fonte), 'bypassModuleRestrictions no /verificar');
  });

  await test('[RN-04/RN-05] /auditoria/logs com canManageUsers; os usos de papel exato que ficam sao 6 (aprovacoes, 5 da Engenharia)', () => {
    const i = indexJs.indexOf("app.get('/api/auditoria/logs'");
    assert.ok(i > 0, 'rota dos logs');
    const corpo = indexJs.slice(i, indexJs.indexOf('const { tipo, modulo', i));
    assert.ok(corpo.includes('if (!canManageUsers(req.user)) {'), corpo);
    assert.ok(corpo.includes("'Acesso negado. Apenas administradores podem visualizar logs.'"), 'o literal de hoje');
    const exatos = indexJs.match(/role\s*(!==|===|!=|==)\s*'admin'/g) || [];
    assert.strictEqual(exatos.length, 6, `usos de papel exato no index.js: ${exatos.length}`);
  });

  await test('[RN-08] o portao da OS antecipa quem passa por bypassModuleRestrictions (Fase 2 C1)', () => {
    const i = indexJs.indexOf("app.post('/api/operacional/ordens-servico', authenticateToken, (req, res, next) => {");
    assert.ok(i > 0, 'rota da OS');
    const portao = indexJs.slice(i, indexJs.indexOf('const userId = req.user.id;', i));
    assert.ok(portao.includes('if (bypassModuleRestrictions(req.user)) {'), portao);
    assert.ok(!/role/.test(portao), portao);
  });

  console.log(`\n  ${passed} passaram, ${failed} falharam\n`);
  db.close();
  process.exit(failed ? 1 : 0);
})();
