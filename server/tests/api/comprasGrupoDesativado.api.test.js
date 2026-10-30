/**
 * Etapa 103 — grupo de fornecedores desativado: reativar pela rota, ler com `incluir_inativos`, e
 * as portas de fornecedor deixam de vincular a grupo desativado ou inexistente.
 *
 * A Etapa 100 fez o "Remover grupo" funcionar (soft-delete) e deixou duas pontas declaradas: nao
 * havia como REATIVAR pela tela (so no banco), e a tela de um grupo desativado aberta por endereco
 * antigo (`FornecedoresDoGrupo`) VINCULAVA fornecedor a ele — as portas de fornecedor
 * (`routes/compras/fornecedores.js`) gravavam `grupo_id` sem olhar se o grupo existe ou esta ativo.
 *
 * RN-103.04 POST /grupos/:id/reativar · RN-103.05 ?incluir_inativos=1 · RN-103.08 vinculo recusado
 * quando o grupo e NOVO · RN-103.09 integracao pela rota.
 *
 * Parte 2 (FK de PRODUCAO): o harness monta `fornecedores` SEM a FK `grupo_id REFERENCES
 * grupos_compras`. Com a FK ligada (producao), reescrever um `grupo_id` orfao com ele mesmo FALHA —
 * entao "salvar repetindo o grupo" so e 200 em producao se o PUT nao reescrever a coluna (achado M1
 * da revisao do plano). A parte 2 monta o registrador sobre a DDL lida do `index.js`, com
 * `foreign_keys = ON` e controle positivo.
 *
 * Executar: cd server && node tests/api/comprasGrupoDesativado.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const COMPRAS = { id: 103, nome: 'Comprador E103', role: 'usuario', email: 'compras103@test.com' };

/** Literais do contrato, por extenso. */
const L_G = 'Grupo desativado — reative o grupo em Fornecedores homologados antes de vincular fornecedores';
const NAO_ENCONTRADO = 'Grupo não encontrado';

const DDL_GRUPOS = `CREATE TABLE IF NOT EXISTS grupos_compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, numero INTEGER DEFAULT 10, ordem INTEGER DEFAULT 0,
  foto TEXT, ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`;

/** DDL de PRODUCAO lida do arquivo que a cria (mesmo helper de comprasCotacaoFkProducao). */
function ddlDe(arquivo, tabela) {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', arquivo), 'utf8');
  const ini = src.indexOf(`CREATE TABLE IF NOT EXISTS ${tabela} (`);
  assert.ok(ini >= 0, `DDL de ${tabela} nao encontrada em ${arquivo}`);
  const fim = src.indexOf(')`', ini);
  return src.slice(ini, fim + 1);
}
function altersDe(arquivo, nomeDoArray) {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', arquivo), 'utf8');
  const ini = src.indexOf(`${nomeDoArray} = [`);
  assert.ok(ini >= 0, `array ${nomeDoArray} nao encontrado`);
  const corpo = src.slice(ini, src.indexOf('];', ini)).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  return (corpo.match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
}

(async () => {
  console.log('\n═══ Grupo desativado (Etapa 103) ═══\n');
  const { app, db, close } = await createTestApp({ user: COMPRAS });
  await dbRun(db, DDL_GRUPOS);
  const grupo = async (nome, ativo = 1, numero = 10) =>
    (await dbRun(db, 'INSERT INTO grupos_compras (nome, ativo, numero) VALUES (?,?,?)', [nome, ativo, numero])).lastID;
  const forn = async (razao, grupoId = null) =>
    (await dbRun(db, "INSERT INTO fornecedores (razao_social, status, grupo_id) VALUES (?, 'ativo', ?)", [razao, grupoId])).lastID;
  const grupoDe = async (id) => (await dbGet(db, 'SELECT grupo_id FROM fornecedores WHERE id = ?', [id])).grupo_id;

  /* ── RN-103.04 reativar ─────────────────────────────────────────────── */
  await test('RN-103.04 POST /grupos/:id/reativar -> 200 "Grupo reativado", ativo = 1; ja ativo -> 200; inexistente -> 404', async () => {
    const g = await grupo('Reativar 103', 0);
    const r = await request(app).post(`/api/compras/grupos/${g}/reativar`);
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.message, 'Grupo reativado');
    assert.strictEqual((await dbGet(db, 'SELECT ativo FROM grupos_compras WHERE id = ?', [g])).ativo, 1);
    const deNovo = await request(app).post(`/api/compras/grupos/${g}/reativar`);
    assert.strictEqual(deNovo.status, 200, 'idempotente');
    assert.strictEqual(deNovo.body.message, 'Grupo reativado');
    const nada = await request(app).post(`/api/compras/grupos/${g + 9000}/reativar`);
    assert.strictEqual(nada.status, 404);
    assert.strictEqual(nada.body.error, NAO_ENCONTRADO);
  });

  await test('RN-103.04 reativar nao mexe em fornecedores.grupo_id (quem ficou ligado volta com o grupo)', async () => {
    const g = await grupo('Volta junto 103', 0);
    const f = await forn('Forn ligado 103', g);
    const r = await request(app).post(`/api/compras/grupos/${g}/reativar`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(await grupoDe(f), g);
    const lista = await request(app).get(`/api/compras/grupos/${g}/fornecedores`);
    assert.ok(lista.body.some((x) => x.id === f), 'o fornecedor aparece na lista do grupo reativado');
  });

  /* ── RN-103.05 incluir_inativos ─────────────────────────────────────── */
  await test('RN-103.05 GET /grupos: sem parametro so ativos; ?incluir_inativos=1 todos, ATIVOS PRIMEIRO, com ativo', async () => {
    const ativo = await grupo('Ativo de numero alto 103', 1, 90);
    const inativo = await grupo('Inativo de numero baixo 103', 0, 10);
    const padrao = await request(app).get('/api/compras/grupos');
    assert.ok(padrao.body.some((g) => g.id === ativo));
    assert.ok(!padrao.body.some((g) => g.id === inativo), 'sem o parametro o desativado continua de fora');
    const todos = await request(app).get('/api/compras/grupos?incluir_inativos=1');
    assert.strictEqual(todos.status, 200);
    const ids = todos.body.map((g) => g.id);
    assert.ok(ids.includes(inativo) && ids.includes(ativo));
    assert.ok(ids.indexOf(ativo) < ids.indexOf(inativo), 'ativo (numero 90) antes do inativo (numero 10)');
    const primeiroInativo = todos.body.findIndex((g) => Number(g.ativo) !== 1);
    assert.ok(todos.body.slice(primeiroInativo).every((g) => Number(g.ativo) !== 1), 'nenhum ativo depois do primeiro inativo');
    // So '1' liga o parametro.
    const outro = await request(app).get('/api/compras/grupos?incluir_inativos=true');
    assert.ok(!outro.body.some((g) => g.id === inativo), "'true' nao e '1'");
  });

  await test('RN-103.05 GET /grupos/:id: desativado -> 404 sem parametro, 200 com ativo 0 com ?incluir_inativos=1; inexistente 404', async () => {
    const g = await grupo('Desativado por id 103', 0);
    const sem = await request(app).get(`/api/compras/grupos/${g}`);
    assert.strictEqual(sem.status, 404);
    assert.strictEqual(sem.body.error, NAO_ENCONTRADO);
    const com = await request(app).get(`/api/compras/grupos/${g}?incluir_inativos=1`);
    assert.strictEqual(com.status, 200, JSON.stringify(com.body));
    assert.strictEqual(com.body.id, g);
    assert.strictEqual(Number(com.body.ativo), 0);
    const nada = await request(app).get(`/api/compras/grupos/${g + 9000}?incluir_inativos=1`);
    assert.strictEqual(nada.status, 404);
    assert.strictEqual(nada.body.error, NAO_ENCONTRADO);
  });

  /* ── RN-103.08 vinculo ──────────────────────────────────────────────── */
  await test('RN-103.08 POST /fornecedores com grupo desativado -> 400 L-G; inexistente -> 400 "Grupo não encontrado"; nada gravado', async () => {
    const g = await grupo('Desativado POST 103', 0);
    const antes = (await dbGet(db, 'SELECT COUNT(*) AS n FROM fornecedores')).n;
    const r = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'NOVO NO DESATIVADO', grupo_id: String(g) });
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_G);
    const r2 = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'NOVO NO INEXISTENTE', grupo_id: g + 9000 });
    assert.strictEqual(r2.status, 400);
    assert.strictEqual(r2.body.error, NAO_ENCONTRADO);
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) AS n FROM fornecedores')).n, antes, 'nada gravado');
    // METADE POSITIVA: grupo ativo e sem grupo continuam 201.
    const ativo = await grupo('Ativo POST 103');
    const ok = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'NOVO NO ATIVO', grupo_id: ativo });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    const semGrupo = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'NOVO SEM GRUPO', grupo_id: '' });
    assert.strictEqual(semGrupo.status, 201);
  });

  await test('RN-103.08 PUT: grupo NOVO desativado/inexistente -> 400; o MESMO valor (texto da URL) -> 200; null limpa', async () => {
    const desat = await grupo('Desativado PUT 103', 0);
    const outro = await forn('Forn sem grupo 103');
    const r = await request(app).put(`/api/compras/fornecedores/${outro}`).send({ razao_social: 'Forn sem grupo 103', grupo_id: String(desat) });
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_G);
    assert.strictEqual(await grupoDe(outro), null, 'nada gravado');
    const r2 = await request(app).put(`/api/compras/fornecedores/${outro}`).send({ razao_social: 'Forn sem grupo 103', grupo_id: desat + 9000 });
    assert.strictEqual(r2.status, 400);
    assert.strictEqual(r2.body.error, NAO_ENCONTRADO);

    // Fornecedor que JA esta no grupo desativado: o corpo do "Editar" de FornecedoresDoGrupo manda o
    // id da URL em TEXTO ('7') e a ficha manda o numero — os dois sao "o mesmo" e passam.
    const dentro = await forn('Forn dentro 103', desat);
    const editar = await request(app).put(`/api/compras/fornecedores/${dentro}`).send({ razao_social: 'Forn dentro editado', grupo_id: String(desat) });
    assert.strictEqual(editar.status, 200, `editar repetindo o grupo: ${editar.status} ${JSON.stringify(editar.body)}`);
    const ficha = await request(app).put(`/api/compras/fornecedores/${dentro}`).send({ razao_social: 'Forn dentro ficha', grupo_id: desat });
    assert.strictEqual(ficha.status, 200);
    const row = await dbGet(db, 'SELECT razao_social, grupo_id FROM fornecedores WHERE id = ?', [dentro]);
    assert.strictEqual(row.razao_social, 'FORN DENTRO FICHA'); // Etapa 192 (RN-192.05): maiusculas
    assert.strictEqual(row.grupo_id, desat);
    // "Remover do grupo" (null) continua limpando.
    const remover = await request(app).put(`/api/compras/fornecedores/${dentro}`).send({ razao_social: 'Forn dentro ficha', grupo_id: null });
    assert.strictEqual(remover.status, 200);
    assert.strictEqual(await grupoDe(dentro), null);
  });

  await test('RN-103.08 ordem: razao vazia 400, "Grupo inválido" 400, "Status inválido" 400 antes do 404; fornecedor inexistente 404 antes do grupo', async () => {
    const desat = await grupo('Desativado ordem 103', 0);
    const semRazao = await request(app).put('/api/compras/fornecedores/999999').send({ grupo_id: desat });
    assert.strictEqual(semRazao.status, 400);
    assert.strictEqual(semRazao.body.error, 'Razão social é obrigatória');
    const statusRuim = await request(app).put('/api/compras/fornecedores/999999').send({ razao_social: 'X', grupo_id: desat, status: 'talvez' });
    assert.strictEqual(statusRuim.status, 400);
    assert.strictEqual(statusRuim.body.error, 'Status inválido');
    const inexistente = await request(app).put('/api/compras/fornecedores/999999').send({ razao_social: 'X', grupo_id: desat });
    assert.strictEqual(inexistente.status, 404, `${inexistente.status} ${JSON.stringify(inexistente.body)}`);
    assert.strictEqual(inexistente.body.error, 'Fornecedor não encontrado');
  });

  /* ── RN-103.09 integracao pela rota ─────────────────────────────────── */
  await test('RN-103.09 criar grupo -> vincular A -> desativar -> vincular B recusa -> editar A passa -> reativar -> vincular B passa', async () => {
    const criado = await request(app).post('/api/compras/grupos').send({ nome: 'Jornada 103', numero: 70 });
    assert.strictEqual(criado.status, 201);
    const g = criado.body.id;
    const a = await forn('Forn A jornada');
    const b = await forn('Forn B jornada');
    const vincA = await request(app).put(`/api/compras/fornecedores/${a}`).send({ razao_social: 'Forn A jornada', grupo_id: String(g) });
    assert.strictEqual(vincA.status, 200, JSON.stringify(vincA.body));
    const del = await request(app).delete(`/api/compras/grupos/${g}`);
    assert.strictEqual(del.status, 200);
    const vincB = await request(app).put(`/api/compras/fornecedores/${b}`).send({ razao_social: 'Forn B jornada', grupo_id: String(g) });
    assert.strictEqual(vincB.status, 400);
    assert.strictEqual(vincB.body.error, L_G);
    const editA = await request(app).put(`/api/compras/fornecedores/${a}`).send({ razao_social: 'Forn A editado', grupo_id: String(g) });
    assert.strictEqual(editA.status, 200, JSON.stringify(editA.body));
    const todos = await request(app).get('/api/compras/grupos?incluir_inativos=1');
    assert.strictEqual(Number(todos.body.find((x) => x.id === g).ativo), 0);
    const reat = await request(app).post(`/api/compras/grupos/${g}/reativar`);
    assert.strictEqual(reat.status, 200);
    const vincB2 = await request(app).put(`/api/compras/fornecedores/${b}`).send({ razao_social: 'Forn B jornada', grupo_id: String(g) });
    assert.strictEqual(vincB2.status, 200, JSON.stringify(vincB2.body));
    const lista = await request(app).get('/api/compras/grupos');
    assert.ok(lista.body.some((x) => x.id === g), 'reativado volta a lista padrao');
    const doGrupo = await request(app).get(`/api/compras/grupos/${g}/fornecedores`);
    assert.deepStrictEqual(doGrupo.body.map((x) => x.id).sort((x, y) => x - y), [a, b].sort((x, y) => x - y));
  });
  await close();

  /* ── Parte 2: FK de producao ligada ─────────────────────────────────── */
  console.log('\n(FK de producao ligada)');
  const pdb = new sqlite3.Database(':memory:');
  await dbRun(pdb, ddlDe('index.js', 'fornecedores'));
  await dbRun(pdb, ddlDe('index.js', 'grupos_compras'));
  for (const col of altersDe('index.js', 'ALTERS_FORNECEDORES')) await dbRun(pdb, `ALTER TABLE fornecedores ADD COLUMN ${col}`);
  await dbRun(pdb, 'PRAGMA foreign_keys = ON');
  const papp = express();
  papp.use(express.json());
  const passa = (req, res, next) => { req.user = COMPRAS; next(); };
  require('../../routes/compras/fornecedores')(papp, pdb, passa, () => passa);

  await test('FK ON: fornecedor com grupo_id ORFAO (grupo apagado do banco) salva repetindo o grupo -> 200, sem reescrever a coluna', async () => {
    const fkList = await dbAll(pdb, 'PRAGMA foreign_key_list(fornecedores)');
    assert.ok(fkList.some((f) => f.from === 'grupo_id' && f.table === 'grupos_compras'), 'a DDL lida tem de ter a FK de grupo_id');
    const g = (await dbRun(pdb, "INSERT INTO grupos_compras (nome) VALUES ('Some 103')")).lastID;
    const f = (await dbRun(pdb, "INSERT INTO fornecedores (razao_social, grupo_id) VALUES ('Orfao 103', ?)", [g])).lastID;
    await dbRun(pdb, 'PRAGMA foreign_keys = OFF');
    await dbRun(pdb, 'DELETE FROM grupos_compras WHERE id = ?', [g]);
    await dbRun(pdb, 'PRAGMA foreign_keys = ON');
    // CONTROLE POSITIVO: reescrever o orfao com ele mesmo FALHA com a FK ligada.
    let e; try { await dbRun(pdb, 'UPDATE fornecedores SET grupo_id = ? WHERE id = ?', [g, f]); } catch (x) { e = x; }
    assert.ok(e && /FOREIGN KEY/.test(e.message), `a FK nao vigiou: ${e ? e.message : 'passou'}`);
    const r = await request(papp).put(`/api/compras/fornecedores/${f}`).send({ razao_social: 'Orfao editado', grupo_id: String(g) });
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    const row = await dbGet(pdb, 'SELECT razao_social, grupo_id FROM fornecedores WHERE id = ?', [f]);
    assert.strictEqual(row.razao_social, 'ORFAO EDITADO'); // Etapa 192 (RN-192.05): maiusculas
    assert.strictEqual(row.grupo_id, g, 'o vinculo legado continua');
    // E vincular OUTRO fornecedor a esse grupo que nao existe e 400, nao 500 da FK.
    const outro = (await dbRun(pdb, "INSERT INTO fornecedores (razao_social) VALUES ('Outro 103')")).lastID;
    const r2 = await request(papp).put(`/api/compras/fornecedores/${outro}`).send({ razao_social: 'Outro 103', grupo_id: g });
    assert.strictEqual(r2.status, 400, `${r2.status} ${JSON.stringify(r2.body)}`);
    assert.strictEqual(r2.body.error, NAO_ENCONTRADO);
  });

  pdb.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
