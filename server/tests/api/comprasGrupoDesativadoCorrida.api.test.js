/**
 * Etapa 109 — corrida do B52: vincular fornecedor a um grupo e desativar o grupo no mesmo instante.
 *
 * A Etapa 103 (RN-103.08) recusa vinculo NOVO a grupo desativado, mas conferia o grupo (SELECT) e
 * gravava o fornecedor (INSERT/UPDATE) em dois comandos: um `DELETE /api/compras/grupos/:id` que caisse
 * entre os dois deixava o vinculo gravado DEPOIS da desativacao. Sonda da Fase 0 (30 rodadas por caso,
 * duas requisicoes HTTP disparadas juntas): POST com o vinculo saindo primeiro -> 30 de 30 gravados
 * depois do `ativo = 0`; PUT -> 0 de 30 pela HTTP (a leitura extra do PUT estreita a janela), mas a
 * janela existe (cenario injetado abaixo).
 *
 * Correcao (RN-109.01/02): a gravacao do vinculo novo e CONDICIONAL — `INSERT ... SELECT ... WHERE
 * EXISTS (grupo ativo)` e `UPDATE ... WHERE id = ? AND EXISTS (grupo ativo)` —, um comando so, que o
 * SQLite executa inteiro antes ou depois da desativacao. A conferencia previa continua (e ela que da a
 * mensagem certa no caso comum); quando a gravacao condicional nao grava, a rota rele e responde a
 * mesma literal da 103.
 *
 * Como os cenarios provam a ordem: o teste embrulha `db.run` e anota a ordem em que os comandos
 * TERMINAM na conexao (uma conexao SQLite executa um comando de cada vez). Violacao = fornecedor
 * gravado com o grupo depois do comando que desativou esse grupo.
 *
 * Executar: cd server && node tests/api/comprasGrupoDesativadoCorrida.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const COMPRAS = { id: 109, nome: 'Comprador E109', role: 'usuario', email: 'compras109@test.com' };
const L_G = 'Grupo desativado — reative o grupo em Fornecedores homologados antes de vincular fornecedores';
const RODADAS = 20;

const DDL_GRUPOS = `CREATE TABLE IF NOT EXISTS grupos_compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, numero INTEGER DEFAULT 10, ordem INTEGER DEFAULT 0,
  foto TEXT, ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`;

(async () => {
  console.log('\n═══ Corrida do B52: vincular x desativar grupo (Etapa 109) ═══\n');
  const { app, db, close } = await createTestApp({ user: COMPRAS });
  await dbRun(db, DDL_GRUPOS);
  const grupo = async (nome) => (await dbRun(db, 'INSERT INTO grupos_compras (nome) VALUES (?)', [nome])).lastID;
  const forn = async (razao, grupoId = null) =>
    (await dbRun(db, "INSERT INTO fornecedores (razao_social, status, grupo_id) VALUES (?, 'ativo', ?)", [razao, grupoId])).lastID;

  /* ── Instrumentacao: ordem de termino dos comandos e injecao na janela ─────────────── */
  let eventos = [];
  const runOriginal = db.run.bind(db);
  db.run = function (sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    const s = String(sql);
    return runOriginal(sql, params, function (err) {
      if (!err) {
        if (/UPDATE grupos_compras SET ativo = 0/.test(s)) eventos.push({ tipo: 'desativa', g: Number(params[0]) });
        else if (/INSERT INTO fornecedores/.test(s) && this.changes === 1) eventos.push({ tipo: 'grava', id: this.lastID });
        else if (/UPDATE fornecedores SET/.test(s) && this.changes === 1) eventos.push({ tipo: 'grava', id: null });
      }
      if (cb) cb.call(this, err);
    });
  };
  /** Acao a rodar ENTRE a conferencia do grupo e a gravacao (uma vez). */
  let injetar = null; let injetado = false;
  const getOriginal = db.get.bind(db);
  db.get = function (sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    if (injetar && /SELECT ativo FROM grupos_compras WHERE id = \?/.test(String(sql))) {
      const acao = injetar; injetar = null;
      return getOriginal(sql, params, (err, row) => {
        acao().then(() => { injetado = true; cb(err, row); }, (e) => cb(e));
      });
    }
    return getOriginal(sql, params, cb);
  };
  const desativarDireto = (g) => () => dbRun(db, 'UPDATE grupos_compras SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [g]);

  /** Indice do 1o evento de cada tipo na rodada. */
  const indice = (tipo) => eventos.findIndex((e) => e.tipo === tipo);

  /* ── RN-109.01 POST: corrida real pela rota, nas duas ordens ─────────────────────────── */
  for (const ordem of ['vincula-primeiro', 'desativa-primeiro']) {
    await test(`RN-109.01 POST /fornecedores x DELETE /grupos/:id (${RODADAS} rodadas, ${ordem}): nenhum vinculo gravado depois da desativacao`, async () => {
      const violacoes = []; let criados = 0; let recusados = 0;
      for (let i = 0; i < RODADAS; i++) {
        const g = await grupo(`Corrida POST ${ordem} ${i}`);
        const razao = `Forn corrida POST ${ordem} ${i}`;
        eventos = [];
        const vincula = () => request(app).post('/api/compras/fornecedores').send({ razao_social: razao, grupo_id: g });
        const desativa = () => request(app).delete(`/api/compras/grupos/${g}`);
        const ps = ordem === 'vincula-primeiro' ? [vincula(), desativa()] : [desativa(), vincula()];
        const rs = await Promise.all(ps);
        const rv = ordem === 'vincula-primeiro' ? rs[0] : rs[1];
        const rd = ordem === 'vincula-primeiro' ? rs[1] : rs[0];
        assert.strictEqual(rd.status, 200, `desativar ${rd.status} ${JSON.stringify(rd.body)}`);
        const linhas = await dbGet(db, 'SELECT COUNT(*) AS n FROM fornecedores WHERE razao_social = ?', [razao]);
        if (rv.status === 201) {
          criados++;
          assert.strictEqual(linhas.n, 1);
          const iG = indice('grava'); const iD = indice('desativa');
          assert.ok(iG >= 0 && iD >= 0, `eventos nao anotados: ${JSON.stringify(eventos)}`);
          if (iG > iD) violacoes.push(i);
        } else {
          recusados++;
          assert.strictEqual(rv.status, 400, `${rv.status} ${JSON.stringify(rv.body)}`);
          assert.strictEqual(rv.body.error, L_G);
          assert.strictEqual(linhas.n, 0, 'recusado e gravado');
        }
      }
      assert.deepStrictEqual(violacoes, [], `vinculo gravado DEPOIS da desativacao nas rodadas ${violacoes.join(', ')} (criados ${criados}, recusados ${recusados})`);
      assert.strictEqual(criados + recusados, RODADAS);
    });
  }

  /* ── RN-109.01 PUT: corrida real pela rota ───────────────────────────────────────────── */
  await test(`RN-109.01 PUT /fornecedores/:id x DELETE /grupos/:id (${RODADAS} rodadas, vincula-primeiro): nenhum vinculo gravado depois da desativacao`, async () => {
    const violacoes = [];
    for (let i = 0; i < RODADAS; i++) {
      const g = await grupo(`Corrida PUT ${i}`);
      const f = await forn(`Forn corrida PUT ${i}`);
      eventos = [];
      const [rv, rd] = await Promise.all([
        request(app).put(`/api/compras/fornecedores/${f}`).send({ razao_social: `Forn corrida PUT ${i}`, grupo_id: g }),
        request(app).delete(`/api/compras/grupos/${g}`),
      ]);
      assert.strictEqual(rd.status, 200);
      const atual = (await dbGet(db, 'SELECT grupo_id FROM fornecedores WHERE id = ?', [f])).grupo_id;
      if (rv.status === 200) {
        assert.strictEqual(atual, g);
        if (indice('grava') > indice('desativa')) violacoes.push(i);
      } else {
        assert.strictEqual(rv.status, 400, `${rv.status} ${JSON.stringify(rv.body)}`);
        assert.strictEqual(rv.body.error, L_G);
        assert.strictEqual(atual, null, 'recusado e gravado');
      }
    }
    assert.deepStrictEqual(violacoes, [], `rodadas ${violacoes.join(', ')}`);
  });

  /* ── RN-109.02 a janela, determinística: desativar ENTRE a conferencia e a gravacao ──── */
  await test('RN-109.02 POST: grupo desativado entre a conferencia e a gravacao -> 400 L-G, nada gravado', async () => {
    const g = await grupo('Janela POST');
    injetar = desativarDireto(g); injetado = false;
    const r = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'Forn janela POST', grupo_id: g });
    assert.ok(injetado, 'a injecao nao rodou: a conferencia previa do grupo sumiu? (teste vazio)');
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_G);
    const n = (await dbGet(db, "SELECT COUNT(*) AS n FROM fornecedores WHERE razao_social = 'Forn janela POST'")).n;
    assert.strictEqual(n, 0);
  });

  await test('RN-109.02 PUT: grupo desativado entre a conferencia e a gravacao -> 400 L-G, nada gravado (nem os outros campos)', async () => {
    const g = await grupo('Janela PUT');
    const f = await forn('Forn janela PUT');
    injetar = desativarDireto(g); injetado = false;
    const r = await request(app).put(`/api/compras/fornecedores/${f}`)
      .send({ razao_social: 'Forn janela PUT renomeado', cidade: 'Cidade nova', grupo_id: g });
    assert.ok(injetado, 'a injecao nao rodou (teste vazio)');
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_G);
    const row = await dbGet(db, 'SELECT razao_social, cidade, grupo_id FROM fornecedores WHERE id = ?', [f]);
    assert.deepStrictEqual({ ...row }, { razao_social: 'Forn janela PUT', cidade: null, grupo_id: null });
  });

  await test('RN-109.03 PUT: fornecedor apagado entre a conferencia e a gravacao -> 404 "Fornecedor não encontrado"', async () => {
    const g = await grupo('Janela PUT 404');
    const f = await forn('Forn janela apagado');
    injetar = () => dbRun(db, 'DELETE FROM fornecedores WHERE id = ?', [f]); injetado = false;
    const r = await request(app).put(`/api/compras/fornecedores/${f}`).send({ razao_social: 'X', grupo_id: g });
    assert.ok(injetado, 'a injecao nao rodou (teste vazio)');
    assert.strictEqual(r.status, 404, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, 'Fornecedor não encontrado');
  });

  await test('RN-109.03 a releitura depois da corrida: grupo APAGADO na janela -> 400 "Grupo não encontrado"; desativado e REATIVADO na janela -> grava (o comando ve o grupo ativo)', async () => {
    const g = await grupo('Janela apagado');
    injetar = () => dbRun(db, 'DELETE FROM grupos_compras WHERE id = ?', [g]); injetado = false;
    const r = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'Forn janela grupo apagado', grupo_id: g });
    assert.ok(injetado, 'a injecao nao rodou (teste vazio)');
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, 'Grupo não encontrado');
    const g2 = await grupo('Janela reativado');
    injetar = async () => { await desativarDireto(g2)(); await dbRun(db, 'UPDATE grupos_compras SET ativo = 1 WHERE id = ?', [g2]); };
    injetado = false;
    const r2 = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'Forn janela reativado', grupo_id: g2 });
    assert.ok(injetado, 'a injecao nao rodou (teste vazio)');
    assert.strictEqual(r2.status, 201, `${r2.status} ${JSON.stringify(r2.body)}`);
  });

  /* ── RN-109.04 metade positiva: nada do que a 103 aceitava muda ──────────────────────── */
  await test('RN-109.04 sem corrida: POST e PUT com grupo ativo gravam; vincular e DEPOIS desativar mantem o vinculo (B45); repetir o grupo desativado continua 200 (B52)', async () => {
    const g = await grupo('Positivo 109');
    const p = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'Forn positivo POST', grupo_id: g, cidade: 'Rio' });
    assert.strictEqual(p.status, 201, `${p.status} ${JSON.stringify(p.body)}`);
    const f = await forn('Forn positivo PUT');
    const u = await request(app).put(`/api/compras/fornecedores/${f}`).send({ razao_social: 'Forn positivo PUT 2', grupo_id: String(g) });
    assert.strictEqual(u.status, 200, `${u.status} ${JSON.stringify(u.body)}`);
    assert.strictEqual((await dbGet(db, 'SELECT grupo_id FROM fornecedores WHERE id = ?', [f])).grupo_id, g);
    const d = await request(app).delete(`/api/compras/grupos/${g}`);
    assert.strictEqual(d.status, 200);
    assert.strictEqual((await dbGet(db, 'SELECT grupo_id FROM fornecedores WHERE id = ?', [p.body.id])).grupo_id, g, 'B45: desativar nao desvincula');
    const repete = await request(app).put(`/api/compras/fornecedores/${f}`).send({ razao_social: 'Forn positivo PUT 3', grupo_id: g });
    assert.strictEqual(repete.status, 200, `B52: ${repete.status} ${JSON.stringify(repete.body)}`);
    assert.strictEqual((await dbGet(db, 'SELECT razao_social FROM fornecedores WHERE id = ?', [f])).razao_social, 'FORN POSITIVO PUT 3'); // Etapa 192 (RN-192.05): maiusculas
    const limpa = await request(app).put(`/api/compras/fornecedores/${f}`).send({ razao_social: 'Forn positivo PUT 4', grupo_id: null });
    assert.strictEqual(limpa.status, 200);
    assert.strictEqual((await dbGet(db, 'SELECT grupo_id FROM fornecedores WHERE id = ?', [f])).grupo_id, null);
    const semGrupo = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'Forn sem grupo 109' });
    assert.strictEqual(semGrupo.status, 201);
    const outro = await grupo('Positivo 109 b');
    const troca = await request(app).put(`/api/compras/fornecedores/${f}`).send({ razao_social: 'Forn positivo PUT 5', grupo_id: outro, cidade: 'SP' });
    assert.strictEqual(troca.status, 200);
    const row = await dbGet(db, 'SELECT razao_social, cidade, grupo_id FROM fornecedores WHERE id = ?', [f]);
    assert.deepStrictEqual({ ...row }, { razao_social: 'FORN POSITIVO PUT 5', cidade: 'SP', grupo_id: outro }); // Etapa 192: maiusculas
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
