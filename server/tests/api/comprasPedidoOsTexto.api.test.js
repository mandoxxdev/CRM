/**
 * Etapa 192, P1 — a OS DIGITADA no pedido de compra (RN-192.07/08) e o NCM/peso na busca de material (RN-192.09).
 * Plano: `docs/superpowers/plans/2026-10-30-compras-etapa192-cpf-maiusculas-os-digitada-ncm-materiais.md`.
 *
 * O que este arquivo prova, seguindo o gesto do comprador ate o fim:
 * - criar com OS digitada (`os_texto`), sem `os_id`: grava o texto (aparado), `os_id` fica NULL;
 * - `os_id` e `os_texto` juntos -> 400 `Escolha a OS da lista ou digite, não os dois.` (rota E `criarPedido` direto);
 * - mais de 60 caracteres -> 400 `OS digitada: no máximo 60 caracteres.`; 60 exatos passam;
 * - `PUT`: chave ausente nao mexe; `''`/`null` limpa; trocar para OS da lista manda `os_texto` vazio; o ESTADO FINAL
 *   tambem e exclusivo (`os_id` sozinho num pedido com texto gravado -> 400, nada muda);
 * - lista: `os_texto` na linha, a busca textual acha pelo texto, o filtro `?os_id` NAO acha;
 * - documento: `OS: <texto>` (escapado);
 * - almoxarifado: o pedido com OS digitada e de ESTOQUE para o recebimento (`os_id` null, sem `os_texto`) — nao reserva;
 * - `GET /api/compras/materiais` devolve `ncm` e `peso_unitario`.
 *
 * Executar: cd server && node tests/api/comprasPedidoOsTexto.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const pedidoCompraService = require('../../services/compras/pedidoCompraService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1921, nome: 'Admin E192', role: 'admin' };
const OS_DOIS = 'Escolha a OS da lista ou digite, não os dois.';
const OS_LONGA = 'OS digitada: no máximo 60 caracteres.';
const textoDoHtml = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, cliente_id INTEGER,
    tipo_os TEXT NOT NULL DEFAULT 'producao', status TEXT DEFAULT 'pendente', data_abertura DATE NOT NULL DEFAULT '2026-10-30')`);
  const osLista = (await dbRun(db, "INSERT INTO ordens_servico (numero_os, status) VALUES ('E192-LISTA', 'pendente')")).lastID;

  const forn = await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor E192','19219219000192','ativo')");
  const mat = await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, ativo, ncm, peso_unitario)
    VALUES ('MAT-E192','Chapa E192','PC',1,'7208.51.00',2.5)`);
  const payload = (extra = {}) => ({
    fornecedor_id: forn.lastID,
    itens: [{ material_id: mat.lastID, quantidade: 3, valor_unitario: 7 }],
    ...extra,
  });
  const gravado = async (id) => dbGet(db, 'SELECT os_id, os_texto FROM pedidos_compra WHERE id = ?', [id]);
  const contar = async () => (await dbGet(db, 'SELECT COUNT(*) AS n FROM pedidos_compra')).n;

  console.log('\n═══ Etapa 192 P1 — OS digitada e NCM na busca de material ═══\n');

  let pTexto;

  await test('RN-192.07 POST com os_texto grava o texto aparado; os_id NULL; resposta traz os_texto', async () => {
    const r = await request(app).post('/api/compras/pedidos').send(payload({ os_id: '', os_texto: '  OS 4471 (cliente)  ' }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    pTexto = r.body.id;
    assert.deepStrictEqual(await gravado(pTexto), { os_id: null, os_texto: 'OS 4471 (cliente)' });
    assert.strictEqual(r.body.os_texto, 'OS 4471 (cliente)');
    assert.strictEqual(r.body.os_id, null);
    const g = await request(app).get(`/api/compras/pedidos/${pTexto}`);
    assert.strictEqual(g.body.os_texto, 'OS 4471 (cliente)');
  });

  await test('RN-192.07 os_id E os_texto juntos -> 400 literal, nada gravado (rota e criarPedido direto)', async () => {
    const antes = await contar();
    const r = await request(app).post('/api/compras/pedidos').send(payload({ os_id: osLista, os_texto: 'OS 9' }));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, OS_DOIS);
    let e; try { await pedidoCompraService.criarPedido(db, payload({ os_id: osLista, os_texto: 'OS 9' }), ADMIN); } catch (x) { e = x; }
    assert.ok(e, 'criarPedido aceitou os dois');
    assert.strictEqual(e.message, OS_DOIS);
    assert.strictEqual(e.status, 400);
    assert.strictEqual(await contar(), antes);
  });

  await test('RN-192.07 61 caracteres -> 400 literal; 60 exatos passam; so espacos = sem OS', async () => {
    const antes = await contar();
    const r = await request(app).post('/api/compras/pedidos').send(payload({ os_texto: 'x'.repeat(61) }));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, OS_LONGA);
    assert.strictEqual(await contar(), antes);
    const ok = await request(app).post('/api/compras/pedidos').send(payload({ os_texto: 'é'.repeat(60) }));
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    assert.strictEqual((await gravado(ok.body.id)).os_texto, 'é'.repeat(60));
    const vazio = await request(app).post('/api/compras/pedidos').send(payload({ os_texto: '   ' }));
    assert.strictEqual(vazio.status, 201, JSON.stringify(vazio.body));
    assert.deepStrictEqual(await gravado(vazio.body.id), { os_id: null, os_texto: null });
  });

  await test('RN-192.08 PUT sem a chave os_texto nao mexe; PUT com outro texto troca', async () => {
    const a = await request(app).put(`/api/compras/pedidos/${pTexto}`).send(payload());
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    assert.strictEqual((await gravado(pTexto)).os_texto, 'OS 4471 (cliente)');
    const b = await request(app).put(`/api/compras/pedidos/${pTexto}`).send(payload({ os_id: null, os_texto: 'OS 4472' }));
    assert.strictEqual(b.status, 200, JSON.stringify(b.body));
    assert.deepStrictEqual(await gravado(pTexto), { os_id: null, os_texto: 'OS 4472' });
  });

  await test('RN-192.08 PUT com os_id sozinho num pedido de OS digitada -> 400 literal, nada muda', async () => {
    const r = await request(app).put(`/api/compras/pedidos/${pTexto}`).send(payload({ os_id: osLista }));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, OS_DOIS);
    assert.deepStrictEqual(await gravado(pTexto), { os_id: null, os_texto: 'OS 4472' });
  });

  await test('RN-192.08 PUT trocando para OS da lista (os_texto "") limpa o texto; voltar ao texto com os_id null', async () => {
    const r = await request(app).put(`/api/compras/pedidos/${pTexto}`).send(payload({ os_id: String(osLista), os_texto: '' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await gravado(pTexto), { os_id: osLista, os_texto: null });
    assert.strictEqual(r.body.os_numero, 'E192-LISTA');
    const t = await request(app).put(`/api/compras/pedidos/${pTexto}`).send(payload({ os_texto: 'OS 4473' }));
    assert.strictEqual(t.status, 400, 'texto sozinho num pedido com OS da lista tem de recusar');
    assert.strictEqual(t.body.error, OS_DOIS);
    const v = await request(app).put(`/api/compras/pedidos/${pTexto}`).send(payload({ os_id: null, os_texto: 'OS 4473' }));
    assert.strictEqual(v.status, 200, JSON.stringify(v.body));
    assert.deepStrictEqual(await gravado(pTexto), { os_id: null, os_texto: 'OS 4473' });
    const n = await request(app).put(`/api/compras/pedidos/${pTexto}`).send(payload({ os_texto: null }));
    assert.strictEqual(n.status, 200, JSON.stringify(n.body));
    assert.deepStrictEqual(await gravado(pTexto), { os_id: null, os_texto: null });
    const de = await request(app).put(`/api/compras/pedidos/${pTexto}`).send(payload({ os_texto: 'OS 4474' }));
    assert.strictEqual(de.status, 200, JSON.stringify(de.body));
    const longa = await request(app).put(`/api/compras/pedidos/${pTexto}`).send(payload({ os_texto: 'y'.repeat(61) }));
    assert.strictEqual(longa.status, 400);
    assert.strictEqual(longa.body.error, OS_LONGA);
    assert.strictEqual((await gravado(pTexto)).os_texto, 'OS 4474');
  });

  await test('RN-192.08 lista: os_texto na linha; busca textual acha pelo texto; filtro ?os_id nao acha', async () => {
    const l = await request(app).get('/api/compras/pedidos');
    assert.strictEqual(l.status, 200);
    const linha = l.body.find((x) => x.id === pTexto);
    assert.strictEqual(linha.os_texto, 'OS 4474');
    assert.strictEqual(linha.os_numero, null);
    const s = await request(app).get('/api/compras/pedidos').query({ search: '4474' });
    assert.deepStrictEqual(s.body.map((x) => x.id), [pTexto]);
    const f = await request(app).get('/api/compras/pedidos').query({ os_id: osLista });
    assert.ok(!f.body.some((x) => x.id === pTexto), 'filtro por OS cadastrada achou o pedido de OS digitada');
  });

  await test('RN-192.08 documento mostra "OS: <texto>" escapado', async () => {
    await request(app).put(`/api/compras/pedidos/${pTexto}`).send(payload({ os_texto: 'OS <4474> & cia' }));
    const r = await request(app).get(`/api/compras/pedidos/${pTexto}/documento`);
    assert.strictEqual(r.status, 200);
    assert.ok(r.text.includes('OS &lt;4474&gt; &amp; cia'), 'texto nao escapado');
    assert.ok(textoDoHtml(r.text).includes('OS: OS &lt;4474&gt; &amp; cia'), 'documento sem a OS digitada');
  });

  await test('RN-192.08 almoxarifado: pedido de OS digitada e de ESTOQUE para o recebimento (os_id null, sem texto)', async () => {
    const p = await pedidoCompraService.lerPedidoParaRecebimento(db, pTexto);
    assert.strictEqual(p.os_id, null);
    assert.strictEqual(p.os_numero, null);
    assert.ok(!('os_texto' in p), 'a projecao do recebimento nao leva a OS digitada');
    const r = await request(app).get('/api/almoxarifado/recebimentos-aux/pedidos-compra');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const linha = (Array.isArray(r.body) ? r.body : []).find((x) => x.id === pTexto);
    assert.ok(linha, 'pedido nao apareceu para receber');
    assert.strictEqual(linha.os_id, null);
  });

  await test('RN-192.09 GET /api/compras/materiais devolve ncm e peso_unitario', async () => {
    const r = await request(app).get('/api/compras/materiais').query({ search: 'MAT-E192' });
    assert.strictEqual(r.status, 200);
    const m = r.body.find((x) => x.id === mat.lastID);
    assert.ok(m, 'material nao achado');
    assert.strictEqual(m.ncm, '7208.51.00');
    assert.strictEqual(m.peso_unitario, 2.5);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
