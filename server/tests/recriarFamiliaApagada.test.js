/**
 * Recriar uma família que foi apagada precisa funcionar.
 * Executar: node server/tests/recriarFamiliaApagada.test.js
 *
 * Apagar família é exclusão lógica (ativo = 0), mas familias_produto.nome é
 * UNIQUE: a linha apagada continua ocupando o nome. O cadastro respondia
 * "Já existe uma família com este nome" apontando para uma família que não
 * aparecia em tela nenhuma — beco sem saída para quem estava cadastrando.
 *
 * A regra passou a ser reativar a MESMA linha, preservando o id e portanto os
 * vínculos de familia_variaveis.
 */

const assert = require('assert');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const dbRun = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const dbGet = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const dbAll = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r || []))));

/* Réplica exata das rotas do index.js sobre um banco em memória. */
async function subirServidor() {
  const db = new sqlite3.Database(':memory:');
  await dbRun(db, `CREATE TABLE familias_produto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    ordem INTEGER DEFAULT 0,
    codigo INTEGER,
    grupo_id INTEGER,
    marcadores_vista TEXT,
    ativo INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await dbRun(db, `CREATE TABLE familia_variaveis (
    id INTEGER PRIMARY KEY AUTOINCREMENT, familia_id INTEGER NOT NULL,
    variavel_chave TEXT NOT NULL, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1,
    UNIQUE(familia_id, variavel_chave))`);

  const app = express();
  app.use(express.json());

  function criarOuReativarFamilia(req, res) {
    var body = req.body || {};
    var nome = (body.nome || '').trim();
    if (!nome) return res.status(400).json({ error: 'Nome da família é obrigatório' });
    var ordem = parseInt(body.ordem, 10) || 0;
    var grupoId = body.grupo_id != null ? parseInt(body.grupo_id, 10) : null;
    if (grupoId === 0 || isNaN(grupoId)) grupoId = null;

    db.get('SELECT id, ativo FROM familias_produto WHERE nome = ?', [nome], function (errBusca, existente) {
      if (errBusca) return res.status(500).json({ error: errBusca.message });
      if (existente && existente.ativo === 1) {
        return res.status(400).json({ error: 'Já existe uma família com este nome' });
      }
      if (existente) {
        db.run(
          'UPDATE familias_produto SET ativo = 1, ordem = ?, grupo_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [ordem, grupoId, existente.id],
          function (errUp) {
            if (errUp) return res.status(500).json({ error: errUp.message });
            db.get('SELECT * FROM familias_produto WHERE id = ?', [existente.id], function (e, row) {
              if (e) return res.status(500).json({ error: e.message });
              res.json(Object.assign({}, row || {}, { reativada: true }));
            });
          }
        );
        return;
      }
      db.get('SELECT COALESCE(MAX(codigo), 0) + 10 AS proximo FROM familias_produto', [], function (err, row) {
        if (err) return res.status(500).json({ error: err.message });
        var codigo = row && row.proximo != null ? row.proximo : 10;
        db.run('INSERT INTO familias_produto (nome, ordem, codigo, ativo, grupo_id) VALUES (?, ?, ?, 1, ?)',
          [nome, ordem, codigo, grupoId], function (insertErr) {
            if (insertErr) {
              if (insertErr.message && insertErr.message.indexOf('UNIQUE') !== -1) return res.status(400).json({ error: 'Já existe uma família com este nome' });
              return res.status(500).json({ error: insertErr.message });
            }
            res.json({ id: this.lastID, nome: nome, ordem: ordem, codigo: codigo, grupo_id: grupoId, reativada: false });
          });
      });
    });
  }

  app.post('/api/familias', criarOuReativarFamilia);
  app.post('/familias', criarOuReativarFamilia);

  app.get('/api/familias/todas', (req, res) => {
    db.all('SELECT * FROM familias_produto WHERE ativo = 1 ORDER BY ordem ASC, nome ASC', [], (e, rows) => {
      if (e) return res.status(500).json({ error: e.message });
      res.json(rows || []);
    });
  });

  app.delete('/api/familias/:id', (req, res) => {
    db.run('UPDATE familias_produto SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id], function (e) {
      if (e) return res.status(500).json({ error: e.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Família não encontrada' });
      res.json({ message: 'Família desativada' });
    });
  });

  app.put('/api/familias/:id', (req, res) => {
    const nome = (req.body.nome || '').trim();
    if (!nome) return res.status(400).json({ error: 'Nome da família é obrigatório' });
    db.run('UPDATE familias_produto SET nome = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [nome, req.params.id], function (err) {
      if (err) {
        if (err.message && err.message.indexOf('UNIQUE') !== -1) {
          return db.get('SELECT id, ativo FROM familias_produto WHERE nome = ?', [nome], function (e2, conflito) {
            if (!e2 && conflito && conflito.ativo !== 1) {
              return res.status(400).json({
                error: 'Este nome pertence a uma família apagada. Recrie a família com esse nome (ela volta com a configuração antiga) ou escolha outro nome.',
                conflito_com_familia_apagada: true
              });
            }
            res.status(400).json({ error: 'Já existe uma família com este nome' });
          });
        }
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Família não encontrada' });
      db.get('SELECT * FROM familias_produto WHERE id = ?', [req.params.id], (e, row) => res.json(row));
    });
  });

  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  return { db, server, base: `http://127.0.0.1:${server.address().port}` };
}

const post = async (base, rota, corpo) => {
  const r = await fetch(base + rota, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo)
  });
  return { status: r.status, body: await r.json() };
};

(async () => {
  console.log('\n═══ Recriar família apagada ═══\n');
  const ctx = await subirServidor();

  let idOriginal = null;

  await test('cria a família normalmente', async () => {
    const r = await post(ctx.base, '/api/familias', { nome: 'Silos (SL)', ordem: 5 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.reativada, false);
    idOriginal = r.body.id;
  });

  await test('nome repetido enquanto ATIVA continua sendo recusado', async () => {
    const r = await post(ctx.base, '/api/familias', { nome: 'Silos (SL)' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Já existe uma família com este nome');
  });

  await test('vincula variáveis à família (para provar que voltam depois)', async () => {
    await dbRun(ctx.db, 'INSERT INTO familia_variaveis (familia_id, variavel_chave, ordem, ativo) VALUES (?, ?, 1, 1)', [idOriginal, 'volume_util']);
    await dbRun(ctx.db, 'INSERT INTO familia_variaveis (familia_id, variavel_chave, ordem, ativo) VALUES (?, ?, 2, 1)', [idOriginal, 'material_tanque']);
    const n = await dbAll(ctx.db, 'SELECT * FROM familia_variaveis WHERE familia_id = ?', [idOriginal]);
    assert.strictEqual(n.length, 2);
  });

  await test('apaga a família', async () => {
    const r = await fetch(`${ctx.base}/api/familias/${idOriginal}`, { method: 'DELETE' });
    assert.strictEqual(r.status, 200);
    const row = await dbGet(ctx.db, 'SELECT ativo FROM familias_produto WHERE id = ?', [idOriginal]);
    assert.strictEqual(row.ativo, 0, 'deveria ser exclusão lógica');
  });

  await test('some do seletor depois de apagada', async () => {
    const r = await fetch(`${ctx.base}/api/familias/todas`);
    const lista = await r.json();
    assert(!lista.some((f) => f.nome === 'Silos (SL)'), JSON.stringify(lista));
  });

  await test('O BUG: recriar com o mesmo nome agora funciona', async () => {
    const r = await post(ctx.base, '/api/familias', { nome: 'Silos (SL)', ordem: 9 });
    assert.strictEqual(r.status, 200, 'devolveu: ' + JSON.stringify(r.body));
    assert.strictEqual(r.body.reativada, true, 'deveria ter reativado a linha existente');
  });

  await test('reativa a MESMA linha, sem duplicar', async () => {
    const linhas = await dbAll(ctx.db, "SELECT id FROM familias_produto WHERE nome = 'Silos (SL)'");
    assert.strictEqual(linhas.length, 1, 'não pode criar uma segunda linha com o mesmo nome');
    assert.strictEqual(linhas[0].id, idOriginal, 'o id precisa ser preservado');
  });

  await test('volta a aparecer no seletor', async () => {
    const r = await fetch(`${ctx.base}/api/familias/todas`);
    const lista = await r.json();
    assert(lista.some((f) => f.nome === 'Silos (SL)'));
  });

  await test('os vínculos de variáveis voltam junto', async () => {
    const v = await dbAll(ctx.db, 'SELECT variavel_chave FROM familia_variaveis WHERE familia_id = ? AND ativo = 1 ORDER BY ordem', [idOriginal]);
    assert.deepStrictEqual(v.map((x) => x.variavel_chave), ['volume_util', 'material_tanque']);
  });

  await test('a ordem informada na recriação é aplicada', async () => {
    const row = await dbGet(ctx.db, 'SELECT ordem FROM familias_produto WHERE id = ?', [idOriginal]);
    assert.strictEqual(row.ordem, 9);
  });

  await test('a rota /familias (sem /api) segue a mesma regra', async () => {
    const criada = await post(ctx.base, '/familias', { nome: 'Tacho Móvel (TCRY)' });
    assert.strictEqual(criada.status, 200);
    await fetch(`${ctx.base}/api/familias/${criada.body.id}`, { method: 'DELETE' });
    const recriada = await post(ctx.base, '/familias', { nome: 'Tacho Móvel (TCRY)' });
    assert.strictEqual(recriada.status, 200, JSON.stringify(recriada.body));
    assert.strictEqual(recriada.body.reativada, true);
    assert.strictEqual(recriada.body.id, criada.body.id);
  });

  await test('diferença de caixa continua sendo nome distinto', async () => {
    // O UNIQUE do banco diferencia caixa; a checagem tem que acompanhar, senão
    // "DISCO DISPERSOR" reativaria "Disco Dispersor" por engano.
    const a = await post(ctx.base, '/api/familias', { nome: 'Disco Dispersor' });
    const b = await post(ctx.base, '/api/familias', { nome: 'DISCO DISPERSOR' });
    assert.strictEqual(a.status, 200);
    assert.strictEqual(b.status, 200, 'deveria aceitar como família diferente');
    assert.notStrictEqual(a.body.id, b.body.id);
  });

  await test('nome vazio continua sendo recusado', async () => {
    const r = await post(ctx.base, '/api/familias', { nome: '   ' });
    assert.strictEqual(r.status, 400);
  });

  await test('renomear para nome de família apagada explica o que houve', async () => {
    const viva = await post(ctx.base, '/api/familias', { nome: 'Familia Viva' });
    const morta = await post(ctx.base, '/api/familias', { nome: 'Familia Morta' });
    await fetch(`${ctx.base}/api/familias/${morta.body.id}`, { method: 'DELETE' });

    const r = await fetch(`${ctx.base}/api/familias/${viva.body.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Familia Morta' })
    });
    const body = await r.json();
    assert.strictEqual(r.status, 400);
    assert.strictEqual(body.conflito_com_familia_apagada, true, 'mensagem genérica não ajuda: ' + JSON.stringify(body));
    assert(/apagada/i.test(body.error));
  });

  await test('renomear para nome de família ATIVA mantém a mensagem antiga', async () => {
    const x = await post(ctx.base, '/api/familias', { nome: 'Outra Familia' });
    const r = await fetch(`${ctx.base}/api/familias/${x.body.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Familia Viva' })
    });
    const body = await r.json();
    assert.strictEqual(r.status, 400);
    assert.strictEqual(body.error, 'Já existe uma família com este nome');
    assert(!body.conflito_com_familia_apagada);
  });

  console.log(`\n${passed} passaram, ${failed} falharam`);

  // Fecha em cadeia e deixa o processo terminar sozinho. process.exit() com o
  // handle do sqlite ainda fechando derruba o libuv no Windows ("UV_HANDLE_
  // CLOSING") e o processo sai 127 mesmo com tudo verde.
  process.exitCode = failed === 0 ? 0 : 1;
  await new Promise((r) => ctx.server.close(r));
  await new Promise((r) => ctx.db.close(r));
})().catch((e) => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
