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

  // ── T2: aviso (RN-04) e aviso nao recusa (RN-05) ───────────────────────────────────────────
  console.log('\n--- T2: aviso por area ---\n');
  const stock = require('../../services/almoxarifado/stockService');
  const FRASES = {
    QUARENTENA: (c) => `Localização ${c} é área de quarentena/inspeção, mas guardar aqui não retém o material — ele continua disponível. Para reter, use Inspeções ou o bloqueio.`,
    EXPEDICAO: (c) => `Localização ${c} é área de expedição, mas a requisição não usa este endereço — a entrega baixa da origem separada.`,
    SUCATA: (c) => `Localização ${c} é área de sucata, mas guardar aqui não sucateia — o material continua no estoque disponível até o sucateamento aprovado.`,
    DEVOLUCOES: (c) => `Localização ${c} é área de devoluções, mas guardar aqui não muda o estado do material — ele continua disponível.`,
    MATERIAIS_CLIENTE: (c, m) => `Localização ${c} é área de materiais do cliente, e ${m} é material próprio.`,
  };
  const TIPO_DA = {
    QUARENTENA: 'Área de quarentena/inspeção', EXPEDICAO: 'Área de expedição', SUCATA: 'Área de sucata',
    DEVOLUCOES: 'Área de devoluções', MATERIAIS_CLIENTE: 'Área de materiais do cliente',
  };
  const clienteId = (await dbRun(db, `INSERT INTO clientes (razao_social) VALUES ('Cliente E68')`)).lastID;
  const novaLoc = async (tipo, extra = {}) => {
    const c = cod();
    const id = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, tipo, parent_id, ativo) VALUES (?,?,?,?)`,
      [c, tipo, extra.parent || null, extra.ativo ?? 1])).lastID;
    return { id, codigo: c, tipo };
  };
  const novoMat = async (extra = {}) => {
    const c = cod();
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, tipo_material, localizacao_padrao_id, proprietario_cliente_id)
      VALUES (?, 'Mat E68', 'UN', 0, ?, 'ACO', ?, ?)`, [c, extra.ativo ?? 1, extra.padrao || null, extra.cliente || null])).lastID;
    return { id, codigo: c };
  };
  const aviso = (locId, matId) => request(app).get(`/api/almoxarifado/localizacoes/${locId}/aviso-area`)
    .query(matId !== undefined ? { material_id: matId } : {});

  await test('RN-04 (servico): areaEspecialDe e avisoAreaEspecial puros, frase literal por area', async () => {
    assert.strictEqual(stock.areaEspecialDe('Área de sucata'), 'SUCATA');
    assert.strictEqual(stock.areaEspecialDe('Prateleira'), null);
    assert.strictEqual(stock.areaEspecialDe(undefined), null);
    const proprio = { codigo: 'MP-1', proprietario_cliente_id: null };
    const deCliente = { codigo: 'MC-1', proprietario_cliente_id: 7 };
    for (const [chave, tipo] of Object.entries(TIPO_DA)) {
      assert.strictEqual(stock.avisoAreaEspecial({ codigo: 'L-1', tipo }, proprio), FRASES[chave]('L-1', 'MP-1'), chave);
    }
    // Metade negativa: cliente na area de cliente, outro tipo, sem localizacao.
    assert.strictEqual(stock.avisoAreaEspecial({ codigo: 'L-1', tipo: 'Área de materiais do cliente' }, deCliente), null);
    assert.strictEqual(stock.avisoAreaEspecial({ codigo: 'L-1', tipo: 'Área de materiais do cliente' }, null), null);
    assert.strictEqual(stock.avisoAreaEspecial({ codigo: 'L-1', tipo: 'Prateleira' }, proprio), null);
    assert.strictEqual(stock.avisoAreaEspecial(null, proprio), null);
    // Area EFETIVA precomputada (`area_especial`) vale sobre o tipo da propria linha.
    assert.strictEqual(stock.avisoAreaEspecial({ codigo: 'L-2', tipo: 'Prateleira', area_especial: 'SUCATA' }, proprio), FRASES.SUCATA('L-2'));
    // Material de cliente nas OUTRAS areas recebe o aviso da area normalmente.
    assert.strictEqual(stock.avisoAreaEspecial({ codigo: 'L-3', tipo: 'Área de sucata' }, deCliente), FRASES.SUCATA('L-3'));
  });

  await test('RN-04 (rota): cada area devolve { area, aviso } literal; Prateleira devolve nulls', async () => {
    const mp = await novoMat();
    for (const [chave, tipo] of Object.entries(TIPO_DA)) {
      const l = await novaLoc(tipo);
      const r = await aviso(l.id, mp.id);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.deepStrictEqual(r.body, { area: chave, aviso: FRASES[chave](l.codigo, mp.codigo) });
    }
    const p = await novaLoc('Prateleira');
    const r = await aviso(p.id, mp.id);
    assert.deepStrictEqual(r.body, { area: null, aviso: null });
  });

  await test('RN-04 (rota): area de cliente — material de cliente null, sem material_id null, proprio avisa', async () => {
    const l = await novaLoc('Área de materiais do cliente');
    const mc = await novoMat({ cliente: clienteId });
    const mp = await novoMat();
    assert.deepStrictEqual((await aviso(l.id, mc.id)).body, { area: 'MATERIAIS_CLIENTE', aviso: null });
    assert.deepStrictEqual((await aviso(l.id)).body, { area: 'MATERIAIS_CLIENTE', aviso: null });
    assert.deepStrictEqual((await aviso(l.id, '')).body, { area: 'MATERIAIS_CLIENTE', aviso: null });
    assert.deepStrictEqual((await aviso(l.id, mp.id)).body, { area: 'MATERIAIS_CLIENTE', aviso: FRASES.MATERIAIS_CLIENTE(l.codigo, mp.codigo) });
  });

  await test('RN-04 (rota): 404 da localizacao antes do 404 do material; inativos respondem normal', async () => {
    recusa(await aviso(999999, 999999), 'Localização não encontrada', 404);
    const l = await novaLoc('Área de sucata');
    recusa(await aviso(l.id, 999999), 'Material não encontrado', 404);
    recusa(await aviso(l.id, 'abc'), 'Material não encontrado', 404);
    const mi = await novoMat({ ativo: 0 });
    assert.deepStrictEqual((await aviso(l.id, mi.id)).body, { area: 'SUCATA', aviso: FRASES.SUCATA(l.codigo) });
    const li = await novaLoc('Área de devoluções', { ativo: 0 });
    const r = await aviso(li.id, mi.id);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.area, 'DEVOLUCOES');
  });

  await test('RN-04 (rota): area EFETIVA — posicao dentro da area herda pela arvore; ciclo nao trava', async () => {
    const area = await novaLoc('Área de sucata');
    const filho = await novaLoc('Prateleira', { parent: area.id });
    const neto = await novaLoc('Gaveta', { parent: filho.id });
    const mp = await novoMat();
    assert.deepStrictEqual((await aviso(filho.id, mp.id)).body, { area: 'SUCATA', aviso: FRASES.SUCATA(filho.codigo) });
    assert.deepStrictEqual((await aviso(neto.id, mp.id)).body, { area: 'SUCATA', aviso: FRASES.SUCATA(neto.codigo) });
    // O ancestral MAIS PROXIMO que e area vence: devolucoes dentro de sucata.
    const dev = await novaLoc('Área de devoluções', { parent: area.id });
    const pos = await novaLoc('Box', { parent: dev.id });
    assert.strictEqual((await aviso(pos.id, mp.id)).body.area, 'DEVOLUCOES');
    // Ciclo A <-> B (dado ruim gravado por SQL), nenhum e area: responde null sem travar.
    const a = await novaLoc('Prateleira'); const b = await novaLoc('Prateleira', { parent: a.id });
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET parent_id = ? WHERE id = ?', [b.id, a.id]);
    assert.deepStrictEqual((await aviso(a.id, mp.id)).body, { area: null, aviso: null });
    // Metade positiva: Prateleira solta, sem pai area, sem aviso.
    const solta = await novaLoc('Prateleira');
    assert.deepStrictEqual((await aviso(solta.id, mp.id)).body, { area: null, aviso: null });
  });

  await test('RN-05: ENTRADA (v2) e TRANSFERENCIA (/transferencias) para cada area entram como antes; Mapa mostra', async () => {
    for (const tipo of Object.values(TIPO_DA)) {
      const P = await novaLoc('Prateleira');
      const A = await novaLoc(tipo);
      const m = await novoMat({ padrao: P.id });
      const e = await request(app).post('/api/almoxarifado/movimentacoes/v2')
        .send({ material_id: m.id, tipo: 'ENTRADA', quantidade: 10, localizacao_destino_id: P.id, motivo: 'e68' });
      assert.strictEqual(e.status, 201, JSON.stringify(e.body));
      const t = await request(app).post('/api/almoxarifado/transferencias')
        .send({ material_id: m.id, quantidade: 3, localizacao_origem_id: P.id, localizacao_destino_id: A.id, motivo: 'e68' });
      assert.strictEqual(t.status, 201, `${tipo}: ${JSON.stringify(t.body)}`);
      const e2 = await request(app).post('/api/almoxarifado/movimentacoes/v2')
        .send({ material_id: m.id, tipo: 'ENTRADA', quantidade: 2, localizacao_destino_id: A.id, motivo: 'e68' });
      assert.strictEqual(e2.status, 201, `${tipo}: ${JSON.stringify(e2.body)}`);
      const mapa = (await request(app).get('/api/almoxarifado/mapa/localizacoes')).body;
      const naArea = mapa.find((x) => x.id === A.id);
      const naP = mapa.find((x) => x.id === P.id);
      assert.strictEqual(naArea.quantidade_total, 5, tipo);
      assert.strictEqual(naP.quantidade_total, 7, tipo);
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
