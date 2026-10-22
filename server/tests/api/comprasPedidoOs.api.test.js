/**
 * Etapa 171, T1 — o pedido de compra vinculado a uma OS (RN-171.01 a RN-171.06, emendas I6 e M2 do plano
 * `docs/superpowers/plans/2026-10-22-almoxarifado-etapa171-pedido-de-compra-vinculado-a-os.md`).
 *
 * O que este arquivo prova, e por que cada bloco existe:
 * - a OS mora no CABECALHO (`pedidos_compra.os_id`), opcional: sem ela o pedido e de estoque, igual a antes;
 * - as guardas de existencia e de OS fechada estao NO SERVICO — por isso a entrada e exercida pela rota E por
 *   `criarPedido` direto (cotacao, reposicao e importacao chamam o servico sem passar pelo Zod);
 * - `os_id: null` no `PUT` TIRA a OS, ausente nao mexe (I6: por isso `os_id` nao esta em `COLUNAS_CABECALHO`);
 * - manter no `PUT` a OS que ja estava passa mesmo com ela cancelada; trocar para uma cancelada e recusado;
 * - a guarda de recebimento do `PUT` continua valendo para a OS (sem excecao);
 * - o portao REAL de modulo (`criarPortoesDeModulo`) num app proprio, porque o harness libera a camada de modulo
 *   (`fakeCheckModulePermission`): usuario sem `compras` -> 403, com `compras` e admin passam;
 * - leitura viva (M2): lista com `os_numero` e filtro `?os_id`, detalhe com `os_status`, documento com `OS: <numero>`,
 *   e com a OS apagada `os_numero = null` e o documento com `OS #<id>`.
 *
 * O harness nao tem `ordens_servico` (tabela core do index.js): este teste a cria com as colunas que T1 le.
 *
 * Executar: cd server && node tests/api/comprasPedidoOs.api.test.js
 */
const assert = require('assert');
const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const pedidoCompraService = require('../../services/compras/pedidoCompraService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1711, nome: 'Admin E171', role: 'admin' };
const COMPRADOR = { id: 1712, nome: 'Comprador E171', role: 'user' };
const SEM_COMPRAS = { id: 1713, nome: 'Producao E171', role: 'user' };

const ERRO_OS_INVALIDA = 'Dados inválidos — os_id: OS inválida';
const textoDoHtml = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, cliente_id INTEGER,
    tipo_os TEXT NOT NULL DEFAULT 'producao', status TEXT DEFAULT 'pendente', data_abertura DATE NOT NULL DEFAULT '2026-10-22')`);
  const cli = await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente OS E171')");
  const novaOs = async (numero, status) => (await dbRun(db,
    'INSERT INTO ordens_servico (numero_os, cliente_id, status) VALUES (?, ?, ?)', [numero, cli.lastID, status])).lastID;
  const osAberta = await novaOs('E171-ABERTA', 'em_andamento');
  const osOutra = await novaOs('E171-OUTRA', 'pendente');
  // Caixa e espaco de proposito: a RN-171.03 compara com LOWER(TRIM()).
  const osCancelada = await novaOs('E171-CANC', ' Cancelado ');
  const osConcluida = await novaOs('E171-CONC', 'concluida');
  const osEncerrada = await novaOs('E171-ENC', 'ENCERRADA');
  const osVaiSumir = await novaOs('E171-SOME', 'pendente');

  const forn = await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor E171','17117117000171','ativo')");
  const mat = await dbRun(db, "INSERT INTO materiais_almoxarifado (codigo, nome, unidade, ativo) VALUES ('MAT-E171','Chapa E171','PC',1)");
  const payload = (extra = {}) => ({
    fornecedor_id: forn.lastID,
    itens: [{ material_id: mat.lastID, quantidade: 10, valor_unitario: 5 }],
    ...extra,
  });
  const osDoPedido = async (id) => (await dbGet(db, 'SELECT os_id FROM pedidos_compra WHERE id = ?', [id])).os_id;
  const contar = async () => (await dbGet(db, 'SELECT COUNT(*) AS n FROM pedidos_compra')).n;

  console.log('\n═══ Etapa 171 T1 — pedido de compra vinculado a OS ═══\n');

  let pedidoEstoque; let pedidoComOs;

  await test('RN-171.01 POST sem os_id cria pedido de ESTOQUE (os_id NULL), igual a antes', async () => {
    const r = await request(app).post('/api/compras/pedidos').send(payload());
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    pedidoEstoque = r.body.id;
    assert.strictEqual(await osDoPedido(pedidoEstoque), null);
    assert.strictEqual(r.body.os_id, null);
    assert.strictEqual(r.body.os_numero, null);
  });

  await test('RN-171.01 POST com os_id grava a OS e responde os_id/os_numero', async () => {
    const r = await request(app).post('/api/compras/pedidos').send(payload({ os_id: osAberta }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    pedidoComOs = r.body.id;
    assert.strictEqual(await osDoPedido(pedidoComOs), osAberta);
    assert.strictEqual(r.body.os_id, osAberta);
    assert.strictEqual(r.body.os_numero, 'E171-ABERTA');
  });

  await test('RN-171.01 (I6) os_id como string so de digitos (o <select>) e aceito; "" e null = sem OS', async () => {
    const a = await request(app).post('/api/compras/pedidos').send(payload({ os_id: String(osOutra) }));
    assert.strictEqual(a.status, 201, JSON.stringify(a.body));
    assert.strictEqual(await osDoPedido(a.body.id), osOutra);
    const b = await request(app).post('/api/compras/pedidos').send(payload({ os_id: '' }));
    assert.strictEqual(b.status, 201, JSON.stringify(b.body));
    assert.strictEqual(await osDoPedido(b.body.id), null);
    const c = await request(app).post('/api/compras/pedidos').send(payload({ os_id: null }));
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    assert.strictEqual(await osDoPedido(c.body.id), null);
  });

  for (const invalido of [0, -1, 1.5, true, 'abc']) {
    // eslint-disable-next-line no-await-in-loop
    await test(`RN-171.01 (I6) os_id ${JSON.stringify(invalido)} -> 400 "OS inválida" no POST e no PUT, nada gravado`, async () => {
      const antes = await contar();
      const r = await request(app).post('/api/compras/pedidos').send(payload({ os_id: invalido }));
      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, ERRO_OS_INVALIDA);
      assert.strictEqual(await contar(), antes);
      const p = await request(app).put(`/api/compras/pedidos/${pedidoComOs}`).send(payload({ os_id: invalido }));
      assert.strictEqual(p.status, 400, JSON.stringify(p.body));
      assert.strictEqual(p.body.error, ERRO_OS_INVALIDA);
      assert.strictEqual(await osDoPedido(pedidoComOs), osAberta);
    });
  }

  await test('RN-171.02 OS inexistente -> 400 "OS #999999 não encontrada", nada gravado', async () => {
    const antes = await contar();
    const r = await request(app).post('/api/compras/pedidos').send(payload({ os_id: 999999 }));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'OS #999999 não encontrada');
    assert.strictEqual(await contar(), antes);
  });

  await test('RN-171.03 OS cancelada (" Cancelado ") -> 400 literal, nada gravado', async () => {
    const antes = await contar();
    const r = await request(app).post('/api/compras/pedidos').send(payload({ os_id: osCancelada }));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'A OS E171-CANC está Cancelado — não aceita compra nova');
    assert.strictEqual(await contar(), antes);
  });

  await test('RN-171.03 OS concluida e ENCERRADA tambem recusam', async () => {
    const a = await request(app).post('/api/compras/pedidos').send(payload({ os_id: osConcluida }));
    assert.strictEqual(a.status, 400);
    assert.strictEqual(a.body.error, 'A OS E171-CONC está concluida — não aceita compra nova');
    const b = await request(app).post('/api/compras/pedidos').send(payload({ os_id: osEncerrada }));
    assert.strictEqual(b.status, 400);
    assert.strictEqual(b.body.error, 'A OS E171-ENC está ENCERRADA — não aceita compra nova');
  });

  await test('RN-171.02/03 pelo SERVICO (criarPedido direto, sem Zod): grava, recusa inexistente, fechada e invalida', async () => {
    const ok = await pedidoCompraService.criarPedido(db, payload({ os_id: osAberta }), ADMIN);
    assert.strictEqual(await osDoPedido(ok.id), osAberta);
    assert.strictEqual(ok.os_numero, 'E171-ABERTA');
    const semOs = await pedidoCompraService.criarPedido(db, payload(), ADMIN);
    assert.strictEqual(await osDoPedido(semOs.id), null, 'chamador de servico sem os_id (cotacao) segue de estoque');
    const antes = await contar();
    await assert.rejects(pedidoCompraService.criarPedido(db, payload({ os_id: 888888 }), ADMIN),
      (e) => e.status === 400 && e.message === 'OS #888888 não encontrada');
    await assert.rejects(pedidoCompraService.criarPedido(db, payload({ os_id: osCancelada }), ADMIN),
      (e) => e.status === 400 && e.message === 'A OS E171-CANC está Cancelado — não aceita compra nova');
    await assert.rejects(pedidoCompraService.criarPedido(db, payload({ os_id: 'abc' }), ADMIN),
      (e) => e.status === 400 && e.message === 'OS inválida');
    await assert.rejects(pedidoCompraService.criarPedido(db, payload({ os_id: 0 }), ADMIN),
      (e) => e.status === 400 && e.message === 'OS inválida');
    assert.strictEqual(await contar(), antes, 'recusa do servico nao pode deixar pedido gravado');
  });

  await test('RN-171.04 PUT sem a chave os_id NAO mexe na OS', async () => {
    const r = await request(app).put(`/api/compras/pedidos/${pedidoComOs}`).send(payload({ observacoes: 'so obs' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await osDoPedido(pedidoComOs), osAberta);
    assert.strictEqual(r.body.os_numero, 'E171-ABERTA');
  });

  await test('RN-171.04 PUT troca a OS', async () => {
    const r = await request(app).put(`/api/compras/pedidos/${pedidoComOs}`).send(payload({ os_id: osOutra }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await osDoPedido(pedidoComOs), osOutra);
  });

  await test('RN-171.04 (I6) PUT com os_id null TIRA a OS; com "" tambem', async () => {
    const r = await request(app).put(`/api/compras/pedidos/${pedidoComOs}`).send(payload({ os_id: null }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await osDoPedido(pedidoComOs), null);
    assert.strictEqual(r.body.os_id, null);
    await request(app).put(`/api/compras/pedidos/${pedidoComOs}`).send(payload({ os_id: osOutra })).expect(200);
    const v = await request(app).put(`/api/compras/pedidos/${pedidoComOs}`).send(payload({ os_id: '' }));
    assert.strictEqual(v.status, 200, JSON.stringify(v.body));
    assert.strictEqual(await osDoPedido(pedidoComOs), null);
  });

  await test('RN-171.03 PUT mantendo a MESMA OS que ja estava passa mesmo com ela cancelada; trocar para cancelada recusa', async () => {
    // A OS fecha DEPOIS do vinculo (o pedido nasceu com ela aberta).
    const os2 = await novaOs('E171-FECHA-DEPOIS', 'pendente');
    const c = await request(app).post('/api/compras/pedidos').send(payload({ os_id: os2 }));
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    await dbRun(db, "UPDATE ordens_servico SET status = 'cancelada' WHERE id = ?", [os2]);
    const manter = await request(app).put(`/api/compras/pedidos/${c.body.id}`).send(payload({ os_id: os2, observacoes: 'editado' }));
    assert.strictEqual(manter.status, 200, JSON.stringify(manter.body));
    assert.strictEqual(await osDoPedido(c.body.id), os2);
    // como string tambem e "a mesma"
    const manterStr = await request(app).put(`/api/compras/pedidos/${c.body.id}`).send(payload({ os_id: String(os2) }));
    assert.strictEqual(manterStr.status, 200, JSON.stringify(manterStr.body));
    const trocar = await request(app).put(`/api/compras/pedidos/${pedidoEstoque}`).send(payload({ os_id: osCancelada }));
    assert.strictEqual(trocar.status, 400, JSON.stringify(trocar.body));
    assert.strictEqual(trocar.body.error, 'A OS E171-CANC está Cancelado — não aceita compra nova');
    assert.strictEqual(await osDoPedido(pedidoEstoque), null);
    const inexistente = await request(app).put(`/api/compras/pedidos/${pedidoEstoque}`).send(payload({ os_id: 777777 }));
    assert.strictEqual(inexistente.status, 400);
    assert.strictEqual(inexistente.body.error, 'OS #777777 não encontrada');
  });

  await test('RN-171.04 pedido JA RECEBIDO: o PUT com OS continua 400 da guarda de recebimento (sem excecao)', async () => {
    const c = await request(app).post('/api/compras/pedidos').send(payload());
    assert.strictEqual(c.status, 201);
    await dbRun(db, 'UPDATE itens_pedido_compra SET quantidade_recebida = 1 WHERE pedido_id = ?', [c.body.id]);
    const r = await request(app).put(`/api/compras/pedidos/${c.body.id}`).send(payload({ os_id: osAberta }));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Pedido de compra ${c.body.numero} já teve recebimento — não pode mais ser editado`);
    assert.strictEqual(await osDoPedido(c.body.id), null);
  });

  // ── O portao REAL de modulo (o harness o libera): app proprio com `routes/compras.js` e `criarPortoesDeModulo`.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS permissoes (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER,
    grupo_id INTEGER, modulo TEXT NOT NULL, acao TEXT NOT NULL, permissao INTEGER DEFAULT 0)`);
  await dbRun(db, `CREATE TABLE IF NOT EXISTS grupos_permissoes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE,
    ativo INTEGER DEFAULT 1)`);
  await dbRun(db, `CREATE TABLE IF NOT EXISTS usuarios_grupos (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL,
    grupo_id INTEGER NOT NULL)`);
  await dbRun(db, "INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, NULL, 'compras', 'acesso', 1)", [COMPRADOR.id]);
  const { criarPortoesDeModulo } = require('../../services/portaoDeModulo');
  const portoes = criarPortoesDeModulo({ getDb: () => db, registrar: () => {} });
  const appReal = express();
  appReal.use(express.json());
  let usuarioReal = null;
  const authReal = (req, res, next) => { req.user = { ...usuarioReal }; next(); };
  const upStub = multer({ dest: path.join(os.tmpdir(), 'e171-upload-stub') });
  require('../../routes/compras')(appReal, db, authReal, portoes.checkModulePermission, {
    uploadGrupoCompras: upStub, uploadFornecedor: upStub, uploadsGruposComprasDir: os.tmpdir(), uploadsFornecedoresDir: os.tmpdir(),
    gerarPdfDeHtml: async () => Buffer.from('%PDF'),
  });

  await test('RN-171.04 usuario SEM o modulo compras -> 403 do portao no POST, no PUT e na aux; a OS nao muda', async () => {
    usuarioReal = SEM_COMPRAS;
    const antes = await contar();
    const p = await request(appReal).post('/api/compras/pedidos').send(payload({ os_id: osAberta }));
    assert.strictEqual(p.status, 403, JSON.stringify(p.body));
    assert.strictEqual(await contar(), antes);
    const u = await request(appReal).put(`/api/compras/pedidos/${pedidoEstoque}`).send(payload({ os_id: osAberta }));
    assert.strictEqual(u.status, 403, JSON.stringify(u.body));
    assert.strictEqual(await osDoPedido(pedidoEstoque), null);
    const a = await request(appReal).get('/api/compras/aux/ordens-servico');
    assert.strictEqual(a.status, 403);
  });

  await test('RN-171.04 usuario COM compras e admin (bypass) colocam/tiram a OS pelo PUT', async () => {
    usuarioReal = COMPRADOR;
    const c = await request(appReal).put(`/api/compras/pedidos/${pedidoEstoque}`).send(payload({ os_id: osAberta }));
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.strictEqual(await osDoPedido(pedidoEstoque), osAberta);
    usuarioReal = ADMIN;
    const a = await request(appReal).put(`/api/compras/pedidos/${pedidoEstoque}`).send(payload({ os_id: null }));
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    assert.strictEqual(await osDoPedido(pedidoEstoque), null);
    const aux = await request(appReal).get('/api/compras/aux/ordens-servico');
    assert.strictEqual(aux.status, 200);
  });

  // ── Leitura (RN-171.05)
  setUser(ADMIN);
  const pA = (await request(app).post('/api/compras/pedidos').send(payload({ os_id: osAberta }))).body.id;
  const pB = (await request(app).post('/api/compras/pedidos').send(payload({ os_id: osAberta }))).body.id;
  const pSome = (await request(app).post('/api/compras/pedidos').send(payload({ os_id: osVaiSumir }))).body.id;

  await test('RN-171.05 a lista traz os_id e os_numero em cada linha (null no pedido de estoque)', async () => {
    const r = await request(app).get('/api/compras/pedidos');
    assert.strictEqual(r.status, 200);
    const a = r.body.find((p) => p.id === pA);
    assert.strictEqual(a.os_id, osAberta);
    assert.strictEqual(a.os_numero, 'E171-ABERTA');
    const e = r.body.find((p) => p.id === pedidoEstoque);
    assert.strictEqual(e.os_id, null);
    assert.strictEqual(e.os_numero, null);
  });

  await test('RN-171.05 ?os_id=N devolve so os pedidos da OS; invalido e ignorado', async () => {
    const r = await request(app).get(`/api/compras/pedidos?os_id=${osAberta}`);
    assert.strictEqual(r.status, 200);
    const esperados = (await new Promise((ok, ko) => db.all('SELECT id FROM pedidos_compra WHERE os_id = ?', [osAberta],
      (e, rows) => (e ? ko(e) : ok(rows))))).map((x) => x.id).sort((x, y) => x - y);
    assert.ok(esperados.includes(pA) && esperados.includes(pB));
    assert.deepStrictEqual(r.body.map((p) => p.id).sort((x, y) => x - y), esperados);
    const todos = await request(app).get('/api/compras/pedidos');
    for (const lixo of ['abc', '0', '-1', '1.5']) {
      // eslint-disable-next-line no-await-in-loop
      const x = await request(app).get(`/api/compras/pedidos?os_id=${encodeURIComponent(lixo)}`);
      assert.strictEqual(x.status, 200, `os_id=${lixo}`);
      assert.strictEqual(x.body.length, todos.body.length, `os_id=${lixo} deveria ser ignorado`);
    }
  });

  await test('RN-171.05 detalhe traz os_id, os_numero e os_status', async () => {
    const r = await request(app).get(`/api/compras/pedidos/${pA}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.os_id, osAberta);
    assert.strictEqual(r.body.os_numero, 'E171-ABERTA');
    assert.strictEqual(r.body.os_status, 'em_andamento');
    const e = await request(app).get(`/api/compras/pedidos/${pedidoEstoque}`);
    assert.strictEqual(e.body.os_id, null);
    assert.strictEqual(e.body.os_numero, null);
    assert.strictEqual(e.body.os_status, null);
  });

  await test('RN-171.05 documento com OS mostra "OS: <numero_os>"; sem OS nao tem a linha', async () => {
    const r = await request(app).get(`/api/compras/pedidos/${pA}/documento`);
    assert.strictEqual(r.status, 200);
    assert.ok(textoDoHtml(r.text).includes('OS: E171-ABERTA'), 'documento sem a OS');
    const pdf = await request(app).get(`/api/compras/pedidos/${pA}/documento.pdf`).buffer(true)
      .parse((res, cb) => { const b = []; res.on('data', (d) => b.push(d)); res.on('end', () => cb(null, Buffer.concat(b))); });
    assert.strictEqual(pdf.status, 200);
    assert.ok(textoDoHtml(pdf.body.toString('utf8')).includes('OS: E171-ABERTA'), 'PDF sem a OS');
    const s = await request(app).get(`/api/compras/pedidos/${pedidoEstoque}/documento`);
    assert.strictEqual(s.status, 200);
    assert.ok(!/<b>OS[:<]/.test(s.text), 'pedido de estoque nao pode ter linha de OS');
  });

  await test('RN-171.05 (M2) OS apagada: os_numero null na lista e no detalhe; documento mostra "OS #<id>"', async () => {
    await dbRun(db, 'DELETE FROM ordens_servico WHERE id = ?', [osVaiSumir]);
    const d = await request(app).get(`/api/compras/pedidos/${pSome}`);
    assert.strictEqual(d.status, 200);
    assert.strictEqual(d.body.os_id, osVaiSumir);
    assert.strictEqual(d.body.os_numero, null);
    assert.strictEqual(d.body.os_status, null);
    const l = (await request(app).get('/api/compras/pedidos')).body.find((p) => p.id === pSome);
    assert.strictEqual(l.os_id, osVaiSumir);
    assert.strictEqual(l.os_numero, null);
    const doc = await request(app).get(`/api/compras/pedidos/${pSome}/documento`);
    assert.strictEqual(doc.status, 200);
    assert.ok(textoDoHtml(doc.text).includes(`OS #${osVaiSumir}`), 'documento sem OS #<id>');
  });

  // ── Aux (RN-171.06)
  await test('RN-171.06 aux lista so OS abertas, com id/numero_os/status/cliente_nome, ordem id DESC', async () => {
    const r = await request(app).get('/api/compras/aux/ordens-servico');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const ids = r.body.map((o) => o.id);
    assert.ok(ids.includes(osAberta) && ids.includes(osOutra), 'faltou OS aberta');
    for (const fechada of [osCancelada, osConcluida, osEncerrada]) assert.ok(!ids.includes(fechada), `OS fechada ${fechada} apareceu`);
    assert.deepStrictEqual([...ids].sort((x, y) => y - x), ids, 'ordem nao e id DESC');
    const a = r.body.find((o) => o.id === osAberta);
    assert.deepStrictEqual(Object.keys(a).sort(), ['cliente_nome', 'id', 'numero_os', 'status']);
    assert.strictEqual(a.cliente_nome, 'Cliente OS E171');
    assert.strictEqual(a.numero_os, 'E171-ABERTA');
  });

  await test('RN-171.06 aux ?incluir=<id> devolve tambem a OS fechada; incluir invalido ignorado', async () => {
    const r = await request(app).get(`/api/compras/aux/ordens-servico?incluir=${osCancelada}`);
    assert.strictEqual(r.status, 200);
    const c = r.body.find((o) => o.id === osCancelada);
    assert.ok(c, 'incluir nao trouxe a OS cancelada');
    assert.strictEqual(c.numero_os, 'E171-CANC');
    assert.strictEqual(r.body.filter((o) => o.id === osCancelada).length, 1);
    const aberta = await request(app).get(`/api/compras/aux/ordens-servico?incluir=${osAberta}`);
    assert.strictEqual(aberta.body.filter((o) => o.id === osAberta).length, 1, 'incluir de OS aberta nao pode duplicar');
    const lixo = await request(app).get('/api/compras/aux/ordens-servico?incluir=abc');
    assert.strictEqual(lixo.status, 200);
    assert.ok(!lixo.body.some((o) => o.id === osCancelada));
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
