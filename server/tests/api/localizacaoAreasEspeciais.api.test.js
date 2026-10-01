/**
 * Etapa 68 — areas especiais de localizacao com semantica (feature 02).
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa68-areas-especiais.md (vale a secao
 * "Fase 2 — revisao do plano": ordem das recusas do PUT, POST com tipo ''/null = Almoxarifado,
 * area EFETIVA pela arvore).
 *
 * T1 — registro e cadastro: RN-01 (meta com `areas_especiais`), RN-02 (POST recusa tipo fora da
 * lista, inclusive no ramo que reativa codigo de inativa) e RN-03 (PUT sem tipo preserva, PUT com
 * o mesmo tipo legado passa, PUT que MUDA para fora da lista recusa). Tudo entra PELA ROTA.
 *
 * Executar: cd server && node tests/api/localizacaoAreasEspeciais.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbGet, dbRun } = require('../../services/almoxarifado/db');
const schema = require('../../services/almoxarifado/schema');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 68, nome: 'Admin Etapa68', role: 'admin', is_superadmin: 1, email: 'e68@test.com' };

const TREZE_ANTIGOS = [
  'Almoxarifado', 'Rua', 'Prateleira', 'Gaveta', 'Box', 'Área externa', 'Área de corte',
  'Área de montagem', 'Área de elétrica', 'Área de pintura', 'Área de expedição',
  'Área de materiais do cliente', 'Área de quarentena/inspeção',
];
const invalido = (t) => `Tipo de localização inválido: ${t}`;

let seq = 0;
const cod = () => `E68-${Date.now() % 100000}-${++seq}`;

(async () => {
  console.log('\n=== Etapa 68 T1: registro de areas especiais e cadastro ===\n');
  const { app, db, close } = await createTestApp({ user: { ...ADMIN } });
  const post = (body) => request(app).post('/api/almoxarifado/localizacoes').send(body);
  const put = (id, body) => request(app).put(`/api/almoxarifado/localizacoes/${id}`).send(body);
  const linha = (id) => dbGet(db, 'SELECT * FROM localizacoes_almoxarifado WHERE id = ?', [id]);
  const recusa = (r, literal, status = 400) => {
    assert.strictEqual(r.status, status, `esperava ${status} "${literal}", veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, literal);
  };

  // ── RN-01 ──────────────────────────────────────────────────────────────────────────────────
  await test('RN-01: meta devolve 15 tipos (13 antigos na mesma ordem + sucata + devolucoes)', async () => {
    const r = await request(app).get('/api/almoxarifado/meta/tipos-material');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.localizacoes_tipos.slice(0, 13), TREZE_ANTIGOS);
    assert.deepStrictEqual(r.body.localizacoes_tipos.slice(13), ['Área de sucata', 'Área de devoluções']);
    assert.ok(Array.isArray(r.body.tipos) && r.body.tipos.length > 0, 'tipos de material continuam vindo');
  });

  await test('RN-01: areas_especiais tem 5 entradas, cada tipo na lista, na ordem da lista', async () => {
    const r = await request(app).get('/api/almoxarifado/meta/tipos-material');
    const areas = r.body.areas_especiais;
    assert.ok(Array.isArray(areas), `areas_especiais ausente: ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(areas.map((a) => a.chave), ['EXPEDICAO', 'MATERIAIS_CLIENTE', 'QUARENTENA', 'SUCATA', 'DEVOLUCOES']);
    const idx = areas.map((a) => r.body.localizacoes_tipos.indexOf(a.tipo));
    assert.ok(idx.every((i) => i >= 0), `tipo fora da lista: ${JSON.stringify(areas)}`);
    assert.deepStrictEqual(idx, [...idx].sort((a, b) => a - b), 'ordem da lista');
    const sucata = areas.find((a) => a.tipo === 'Área de sucata');
    assert.strictEqual(sucata.chave, 'SUCATA');
    assert.strictEqual(sucata.descricao, schema.AREAS_ESPECIAIS['Área de sucata'].descricao);
    assert.ok(areas.every((a) => typeof a.descricao === 'string' && a.descricao.length > 20));
    // Em-terceiros fora por decisao (D7).
    assert.ok(!r.body.localizacoes_tipos.some((t) => /terceiro/i.test(t)));
  });

  // ── RN-02 ──────────────────────────────────────────────────────────────────────────────────
  await test('RN-02: POST com tipo sem acento -> 400 literal, nada gravado', async () => {
    const c = cod();
    recusa(await post({ codigo: c, tipo: 'Area de sucata' }), invalido('Area de sucata'));
    assert.strictEqual(await dbGet(db, 'SELECT id FROM localizacoes_almoxarifado WHERE codigo = ?', [c]), undefined);
  });

  await test('RN-02: POST com tipo da lista (area nova) -> 201 com o tipo gravado', async () => {
    const r = await post({ codigo: cod(), tipo: 'Área de sucata' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual((await linha(r.body.id)).tipo, 'Área de sucata');
    const r2 = await post({ codigo: cod(), tipo: 'Área de devoluções' });
    assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));
    assert.strictEqual(r2.body.tipo, 'Área de devoluções');
  });

  await test('RN-02: POST sem tipo, com tipo "" e com tipo null -> Almoxarifado (como hoje)', async () => {
    for (const extra of [{}, { tipo: '' }, { tipo: null }]) {
      const r = await post({ codigo: cod(), ...extra });
      assert.strictEqual(r.status, 201, `${JSON.stringify(extra)}: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.tipo, 'Almoxarifado');
    }
  });

  await test('RN-02: Codigo obrigatorio responde antes da recusa de tipo', async () => {
    recusa(await post({ tipo: 'Qualquer' }), 'Código obrigatório');
  });

  await test('RN-02: ramo de reativacao (Etapa 19) recusa tipo fora da lista e a inativa fica intacta', async () => {
    const c = cod();
    const id = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao, tipo, ativo) VALUES (?, 'velha', 'Rua', 0)`, [c])).lastID;
    recusa(await post({ codigo: c, descricao: 'nova', tipo: 'Galpao Z' }), invalido('Galpao Z'));
    const l = await linha(id);
    assert.deepStrictEqual({ ativo: l.ativo, tipo: l.tipo, descricao: l.descricao }, { ativo: 0, tipo: 'Rua', descricao: 'velha' });
    // Metade positiva: o mesmo ramo com tipo valido reativa e grava o tipo.
    const ok = await post({ codigo: c, descricao: 'nova', tipo: 'Área de devoluções' });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    assert.strictEqual(ok.body.id, id);
    assert.strictEqual((await linha(id)).tipo, 'Área de devoluções');
    assert.strictEqual((await linha(id)).ativo, 1);
  });

  // ── RN-03 ──────────────────────────────────────────────────────────────────────────────────
  await test('RN-03: PUT sem tipo preserva a area gravada', async () => {
    const r = await post({ codigo: cod(), tipo: 'Área de quarentena/inspeção' });
    const id = r.body.id;
    const u = await put(id, { codigo: r.body.codigo, descricao: 'so a descricao' });
    assert.strictEqual(u.status, 200, JSON.stringify(u.body));
    const l = await linha(id);
    assert.strictEqual(l.tipo, 'Área de quarentena/inspeção');
    assert.strictEqual(l.descricao, 'so a descricao');
  });

  await test('RN-03: PUT com tipo "" ou null -> Almoxarifado (como hoje)', async () => {
    for (const t of ['', null]) {
      const r = await post({ codigo: cod(), tipo: 'Área de sucata' });
      const u = await put(r.body.id, { codigo: r.body.codigo, tipo: t });
      assert.strictEqual(u.status, 200, JSON.stringify(u.body));
      assert.strictEqual((await linha(r.body.id)).tipo, 'Almoxarifado');
    }
  });

  await test('RN-03: legado gravado por SQL continua editavel com o MESMO tipo', async () => {
    const c = cod();
    const id = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, tipo, ativo) VALUES (?, 'Galpão X', 1)`, [c])).lastID;
    const u = await put(id, { codigo: c, descricao: 'editada', tipo: 'Galpão X' });
    assert.strictEqual(u.status, 200, JSON.stringify(u.body));
    const l = await linha(id);
    assert.strictEqual(l.tipo, 'Galpão X');
    assert.strictEqual(l.descricao, 'editada');
    // Metade positiva: o legado pode ir para um tipo da lista.
    const u2 = await put(id, { codigo: c, tipo: 'Área de sucata' });
    assert.strictEqual(u2.status, 200, JSON.stringify(u2.body));
    assert.strictEqual((await linha(id)).tipo, 'Área de sucata');
  });

  await test('RN-03: PUT que MUDA para fora da lista -> 400 literal, linha intacta', async () => {
    const r = await post({ codigo: cod(), descricao: 'antes', tipo: 'Prateleira' });
    recusa(await put(r.body.id, { codigo: r.body.codigo, descricao: 'depois', tipo: 'Qualquer' }), invalido('Qualquer'));
    const l = await linha(r.body.id);
    assert.deepStrictEqual({ tipo: l.tipo, descricao: l.descricao }, { tipo: 'Prateleira', descricao: 'antes' });
  });

  await test('RN-03: ordem — 404 antes do tipo; tipo antes da guarda de desativacao', async () => {
    recusa(await put(999999, { codigo: 'X', tipo: 'Qualquer' }), 'Localização não encontrada', 404);
    // Localizacao ocupada: desativar com tipo invalido responde o TIPO (guarda vem depois).
    const r = await post({ codigo: cod(), tipo: 'Prateleira' });
    const m = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, tipo_material, localizacao_padrao_id)
      VALUES (?, 'Mat E68', 'UN', 0, 1, 'ACO', ?)`, [cod(), r.body.id])).lastID;
    assert.ok(m);
    recusa(await put(r.body.id, { codigo: r.body.codigo, tipo: 'Qualquer', ativo: 0 }), invalido('Qualquer'));
    // Metade positiva: com tipo valido, a guarda da padrao responde como antes.
    const g = await put(r.body.id, { codigo: r.body.codigo, tipo: 'Prateleira', ativo: 0 });
    assert.strictEqual(g.status, 400);
    assert.ok(/padrão de 1 material/.test(g.body.error), g.body.error);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
