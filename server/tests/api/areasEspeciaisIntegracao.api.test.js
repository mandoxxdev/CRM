/**
 * Etapa 68, T6 (integracao, cruza os galhos T1-T3) — areas especiais ponta a ponta, TUDO PELAS ROTAS.
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa68-areas-especiais.md (T6 e a secao
 * "Fase 2 — revisao do plano", que prevalece: area EFETIVA pela arvore; D6 revisto — a area de
 * sucata so vira origem quando o saldo NELA cobre a quantidade inteira, e entao estrita).
 *
 * T1 (registro + cadastro), T2 (aviso + sugestao) e T3 (sucateamento baixa da area) foram testados
 * cada um no seu galho. Aqui se prova que as pecas conversam numa operacao real:
 *
 *  (1) POST /localizacoes cria a area de sucata S (raiz), uma posicao F dentro dela (tipo
 *      Prateleira, parent S) e uma prateleira comum P; o meta traz areas_especiais com o tipo de S.
 *  (2) material criado pela rota com padrao P; a sugestao de entrada NAO propoe S nem F (vazias
 *      que sao area efetiva), propoe P.
 *  (3) ENTRADA de 10 em P; aviso-area de F vem da area EFETIVA (frase literal de sucata com o
 *      codigo de F); de P vem nulo.
 *  (4) /transferencias 4 P->S (201); Mapa e saldos por localizacao mostram S com 4; a sugestao
 *      continua sem S (S e conteiner de F; o "ja tem" com saldo na area e provado pela posicao no (6)).
 *  (5) solicitar + aprovar as duas pernas (gestao primeiro) -> livro (GET /movimentacoes) com
 *      origem S; S vazia no Mapa e na lista de vazias; P com 6.
 *  (6) mesma coisa pela POSICAO F (almoxarifado primeiro, outros usuarios): origem F.
 *  (7) caso parcial: S com 2 nao cobre 4 -> comportamento de hoje (origem nula, baixa da padrao).
 *  (8) PUT de S sem tipo mantem 'Área de sucata' e a sugestao continua sem S; PUT que muda para
 *      tipo invalido -> 400 literal.
 *
 * NAO se promete a cadeia quarentena -> inspecao -> sucata: o material reprovado fica BLOQUEADO e o
 * solicitar do sucateamento recusa (declarada quebrada na Fase 2, anterior a etapa).
 *
 * Executar: cd server && node tests/api/areasEspeciaisIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 686, nome: 'Admin E68T6', role: 'admin', is_superadmin: 1, email: 'e68t6@test.com' };
const SOLICITANTE = { id: 6861, nome: 'Ana Almoxarife T6', perfil_almoxarifado: 'ALMOXARIFE' };
const APROV_ALM = { id: 6862, nome: 'Bia Almoxarife T6', perfil_almoxarifado: 'ALMOXARIFE' };
const GESTOR = { id: 6863, nome: 'Gil Gestor T6', perfil_almoxarifado: 'GESTOR' };
const APROV_ALM2 = { id: 6864, nome: 'Caio Almoxarife T6', perfil_almoxarifado: 'ALMOXARIFE' };
const GESTOR2 = { id: 6865, nome: 'Dora Gestora T6', perfil_almoxarifado: 'GESTOR' };

const SUF = `${Date.now() % 100000}`;
let seq = 0;
const cod = (p) => `E68I-${p}-${SUF}-${++seq}`;
const FRASE_SUCATA = (c) => `Localização ${c} é área de sucata, mas guardar aqui não sucateia — o material continua no estoque disponível até o sucateamento aprovado.`;

(async () => {
  console.log('\n=== Etapa 68 T6: areas especiais ponta a ponta (rotas) ===\n');
  const { app, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  const comoAdmin = () => setUser({ ...ADMIN });
  const ctx = {};

  const ok = (r, status, oque) => {
    assert.strictEqual(r.status, status, `${oque}: esperava ${status}, veio ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const novaLoc = async (tipo, extra = {}) => {
    comoAdmin();
    const codigo = cod('L');
    const b = ok(await request(app).post('/api/almoxarifado/localizacoes').send({ codigo, tipo, ...extra }), 201, `POST localizacao ${tipo}`);
    assert.ok(b.id, `201 sem id: ${JSON.stringify(b)}`);
    return { id: b.id, codigo };
  };
  const novoMat = async (padrao) => {
    comoAdmin();
    const codigo = cod('M');
    if (!ctx.familia) ctx.familia = ok(await request(app).post('/api/almoxarifado/familias').send({ nome: `Fam E68T6 ${SUF}` }), 201, 'POST familia').id;
    const b = ok(await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo, nome: `Chapa ${codigo}`, unidade: 'UN', familia_id: ctx.familia, localizacao_padrao_id: padrao }), 201, 'POST material');
    return { id: b.id, codigo };
  };
  const entrada = async (m, destino, q) => {
    comoAdmin();
    ok(await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: m, tipo: 'ENTRADA', quantidade: q, localizacao_destino_id: destino, motivo: 'compra e68t6' }), 201, 'ENTRADA');
  };
  const transferir = async (m, de, para, q) => {
    comoAdmin();
    return ok(await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: m, quantidade: q, localizacao_origem_id: de, localizacao_destino_id: para, motivo: 'para a area' }), 201, 'TRANSFERENCIA');
  };
  const sugestao = async (m) => {
    comoAdmin();
    return ok(await request(app).get(`/api/almoxarifado/materiais/${m}/sugestao-localizacao`), 200, 'sugestao');
  };
  const idsSug = (s) => s.sugestoes.map((x) => x.localizacao_id);
  const aviso = async (l, m) => {
    comoAdmin();
    return ok(await request(app).get(`/api/almoxarifado/localizacoes/${l}/aviso-area`).query({ material_id: m }), 200, 'aviso-area');
  };
  const mapaDe = async (l) => {
    comoAdmin();
    const mapa = ok(await request(app).get('/api/almoxarifado/mapa/localizacoes'), 200, 'mapa');
    const x = mapa.find((y) => y.id === l);
    assert.ok(x, `localizacao ${l} fora do Mapa`);
    return x;
  };
  /** Saldo do material em cada localizacao, pela consulta de saldos por localizacao. */
  const saldoEm = async (m, l) => {
    comoAdmin();
    const rows = ok(await request(app).get(`/api/almoxarifado/estoque/${m}/saldos`), 200, 'saldos');
    return rows.filter((r) => r.localizacao_id === l).reduce((a, r) => a + Number(r.quantidade), 0);
  };
  const vazias = async () => {
    comoAdmin();
    return ok(await request(app).get('/api/almoxarifado/localizacoes/vazias'), 200, 'vazias').map((x) => x.id);
  };
  const solicitar = async (m, q) => {
    setUser({ ...SOLICITANTE });
    return ok(await request(app).post('/api/almoxarifado/sucateamentos')
      .send({ material_id: m, quantidade: q, justificativa: 'descarte e68t6' }), 201, 'solicitar sucateamento').id;
  };
  const perna = async (id, qual, user) => {
    setUser({ ...user });
    return request(app).post(`/api/almoxarifado/sucateamentos/${id}/aprovar-${qual}`).send({});
  };
  /** Livro pela rota: a SUCATA do material (uma so). */
  const sucataNoLivro = async (m) => {
    comoAdmin();
    const rows = ok(await request(app).get('/api/almoxarifado/movimentacoes').query({ material_id: m, tipo: 'SUCATA' }), 200, 'livro');
    assert.strictEqual(rows.length, 1, `esperava 1 SUCATA no livro, veio ${rows.length}`);
    return rows[0];
  };

  await test('(1) cadastro pela rota: area de sucata raiz + posicao filha + prateleira; meta traz areas_especiais', async () => {
    ctx.S = await novaLoc('Área de sucata');
    ctx.F = await novaLoc('Prateleira', { parent_id: ctx.S.id });
    ctx.P = await novaLoc('Prateleira');
    comoAdmin();
    const meta = ok(await request(app).get('/api/almoxarifado/meta/tipos-material'), 200, 'meta');
    assert.ok(Array.isArray(meta.areas_especiais), `meta sem areas_especiais: ${JSON.stringify(meta)}`);
    const suc = meta.areas_especiais.find((a) => a.chave === 'SUCATA');
    assert.ok(suc, JSON.stringify(meta.areas_especiais));
    assert.strictEqual(suc.tipo, 'Área de sucata');
    assert.ok(meta.localizacoes_tipos.includes(suc.tipo));
    // O tipo gravado e o do cadastro (a posicao continua Prateleira: a area e herdada pela arvore).
    const loc = ok(await request(app).get('/api/almoxarifado/localizacoes'), 200, 'GET localizacoes');
    const lista = Array.isArray(loc) ? loc : (loc.localizacoes || loc.rows || []);
    const s = lista.find((x) => x.id === ctx.S.id); const f = lista.find((x) => x.id === ctx.F.id);
    assert.ok(s && f, 'S/F fora da listagem');
    assert.strictEqual(s.tipo, 'Área de sucata');
    assert.strictEqual(f.tipo, 'Prateleira');
    assert.strictEqual(f.parent_id, ctx.S.id);
  });

  await test('(2) sugestao de entrada de compra nao propoe a area nem a posicao dentro dela; propoe P', async () => {
    ctx.mA = await novoMat(ctx.P.id);
    const s = await sugestao(ctx.mA.id);
    const ids = idsSug(s);
    assert.ok(!ids.includes(ctx.S.id), `sugeriu a area: ${JSON.stringify(s.sugestoes)}`);
    assert.ok(!ids.includes(ctx.F.id), `sugeriu a posicao dentro da area: ${JSON.stringify(s.sugestoes)}`);
    assert.ok(ids.includes(ctx.P.id), `nao sugeriu P: ${JSON.stringify(s.sugestoes)}`);
    // Controle de que F estava elegivel como VAZIA se nao fosse area: ela esta na lista de vazias.
    const v = await vazias();
    assert.ok(v.includes(ctx.F.id) && v.includes(ctx.S.id), 'S/F nem estavam vazias — o (2) nao provaria nada');
  });

  await test('(3) ENTRADA de 10 em P; aviso-area da posicao vem da area EFETIVA (literal); P sem aviso', async () => {
    await entrada(ctx.mA.id, ctx.P.id, 10);
    assert.deepStrictEqual(await aviso(ctx.F.id, ctx.mA.id), { area: 'SUCATA', aviso: FRASE_SUCATA(ctx.F.codigo) });
    assert.deepStrictEqual(await aviso(ctx.S.id, ctx.mA.id), { area: 'SUCATA', aviso: FRASE_SUCATA(ctx.S.codigo) });
    assert.deepStrictEqual(await aviso(ctx.P.id, ctx.mA.id), { area: null, aviso: null });
  });

  await test('(4) transferir 4 P->S (o aviso nao recusa); Mapa e saldos mostram S com 4; sugestao continua sem S (tambem por ser conteiner de F; o "ja tem" da area e provado no (6))', async () => {
    await transferir(ctx.mA.id, ctx.P.id, ctx.S.id, 4);
    assert.strictEqual((await mapaDe(ctx.S.id)).quantidade_total, 4);
    assert.strictEqual(await saldoEm(ctx.mA.id, ctx.S.id), 4);
    assert.strictEqual(await saldoEm(ctx.mA.id, ctx.P.id), 6);
    const s = await sugestao(ctx.mA.id);
    assert.ok(!idsSug(s).includes(ctx.S.id), `"ja tem" trouxe a area: ${JSON.stringify(s.sugestoes)}`);
  });

  await test('(5) sucateamento de 4, pernas gestao -> almoxarifado: livro com origem S; S vazia no Mapa; P com 6', async () => {
    const id = await solicitar(ctx.mA.id, 4);
    ok(await perna(id, 'gestao', GESTOR), 200, '1a perna (gestao)');
    ok(await perna(id, 'almoxarifado', APROV_ALM), 200, '2a perna (almoxarifado)');
    const mv = await sucataNoLivro(ctx.mA.id);
    assert.strictEqual(mv.localizacao_origem_id, ctx.S.id, `origem gravada: ${mv.localizacao_origem_id}`);
    assert.strictEqual(Number(mv.quantidade), 4);
    assert.strictEqual((await mapaDe(ctx.S.id)).quantidade_total, 0, 'a area continua ocupada no Mapa');
    assert.ok((await vazias()).includes(ctx.S.id), 'S nao voltou para a lista de vazias');
    assert.strictEqual(await saldoEm(ctx.mA.id, ctx.S.id), 0);
    assert.strictEqual(await saldoEm(ctx.mA.id, ctx.P.id), 6, 'o descarte comeu a prateleira');
    assert.strictEqual((await mapaDe(ctx.P.id)).quantidade_total, 6);
  });

  await test('(6) pela POSICAO dentro da area, pernas almoxarifado -> gestao: origem F, F vazia', async () => {
    const m = await novoMat(ctx.P.id);
    await entrada(m.id, ctx.P.id, 10);
    await transferir(m.id, ctx.P.id, ctx.F.id, 4);
    assert.strictEqual(await saldoEm(m.id, ctx.F.id), 4);
    // "Ja tem" com saldo NA posicao: e o filtro de area que a tira (S fica fora tambem por ser conteiner).
    const sg = await sugestao(m.id);
    assert.ok(!idsSug(sg).includes(ctx.F.id), `"ja tem" trouxe a posicao da area: ${JSON.stringify(sg.sugestoes)}`);
    const id = await solicitar(m.id, 4);
    ok(await perna(id, 'almoxarifado', APROV_ALM2), 200, '1a perna (almoxarifado)');
    ok(await perna(id, 'gestao', GESTOR2), 200, '2a perna (gestao)');
    assert.strictEqual((await sucataNoLivro(m.id)).localizacao_origem_id, ctx.F.id);
    assert.strictEqual(await saldoEm(m.id, ctx.F.id), 0);
    assert.strictEqual(await saldoEm(m.id, ctx.P.id), 6);
    assert.strictEqual((await mapaDe(ctx.F.id)).quantidade_total, 0);
  });

  await test('(7) parcial: S com 2 nao cobre o sucateamento de 4 -> como hoje (origem nula, baixa da padrao)', async () => {
    const m = await novoMat(ctx.P.id);
    await entrada(m.id, ctx.P.id, 10);
    await transferir(m.id, ctx.P.id, ctx.S.id, 2);
    const id = await solicitar(m.id, 4);
    ok(await perna(id, 'gestao', GESTOR), 200, '1a perna');
    ok(await perna(id, 'almoxarifado', APROV_ALM), 200, '2a perna');
    assert.strictEqual((await sucataNoLivro(m.id)).localizacao_origem_id, null, 'livro diria "saiu da area" sem ela cobrir');
    assert.strictEqual(await saldoEm(m.id, ctx.S.id), 2, 'a area foi drenada parcialmente');
    assert.strictEqual(await saldoEm(m.id, ctx.P.id), 4);
  });

  await test('(8) PUT de S sem tipo mantem a area (e a sugestao continua sem ela); tipo invalido -> 400 literal', async () => {
    comoAdmin();
    ok(await request(app).put(`/api/almoxarifado/localizacoes/${ctx.S.id}`)
      .send({ codigo: ctx.S.codigo, descricao: 'Area de sucata do galpao' }), 200, 'PUT sem tipo');
    assert.deepStrictEqual(await aviso(ctx.S.id, ctx.mA.id), { area: 'SUCATA', aviso: FRASE_SUCATA(ctx.S.codigo) });
    const s = await sugestao(ctx.mA.id);
    assert.ok(!idsSug(s).includes(ctx.S.id) && !idsSug(s).includes(ctx.F.id), JSON.stringify(s.sugestoes));
    comoAdmin();
    const r = await request(app).put(`/api/almoxarifado/localizacoes/${ctx.S.id}`)
      .send({ codigo: ctx.S.codigo, tipo: 'Area de sucata' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Tipo de localização inválido: Area de sucata');
    assert.strictEqual((await aviso(ctx.S.id, ctx.mA.id)).area, 'SUCATA', 'o 400 gravou alguma coisa');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
