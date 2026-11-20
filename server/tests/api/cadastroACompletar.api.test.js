/**
 * Etapa 254 (item 27 da estimativa de 18/11; B74 do Compras) — o material criado pelo Almoxarifado (sobra e remessa) nasce com a marca
 * "cadastro a completar", e o Compras a tira ao salvar o cadastro.
 *
 * Desde a Etapa 193 o cadastro e so do Compras, mas a sobra (retalho) e a remessa a terceiros continuam criando material na operacao, pelo
 * `POST /api/almoxarifado/materiais`, so com codigo, nome, unidade, familia, categoria e dono. Nada marcava esse material: no Compras ele
 * ficava igual a qualquer outro, sem NCM, custo nem fornecedor. RN-254.10 a RN-254.12.
 *
 * Plano: docs/superpowers/plans/2026-11-20-almoxarifado-etapa254-ajuste-poupa-caixa-e-cadastro-a-completar.md
 * Executar: cd server && node tests/api/cadastroACompletar.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const ADMIN_COMPRAS = { id: 25403, nome: 'Chefe de Compras 254', role: 'usuario', admin_modulos: ['compras'], email: 'c254@test.com' };
const ALMOXARIFE = { id: 25404, nome: 'Almoxarife 254', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'x254@test.com' };

(async () => {
  console.log('\n=== Etapa 254: cadastro a completar (material da sobra e da remessa) ===\n');
  const { app, db, setUser } = await createTestApp({ user: ALMOXARIFE });
  const as = async (u, fn) => { setUser(u); return fn(); };
  const FAM = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('F254','Familia 254',1)")).lastID;
  let seq = 0;
  // Os corpos LITERAIS dos dois chamadores do client (SobrasAlmoxarifado.cadastrarMaterialDoRetalho e
  // RemessasTerceirosAlmoxarifado.cadastrarMaterialResultante).
  const corpoSobra = () => ({ codigo: `S254-${++seq}`, codigo_auto: 1, nome: `Retalho ${seq}`, unidade: 'UN', familia_id: FAM,
    subfamilia_id: null, proprietario_cliente_id: null, categoria: 'OUTROS' });
  const corpoRemessa = () => ({ codigo: `R254-${++seq}`, codigo_auto: 1, nome: `Resultado ${seq}`, unidade: 'UN', familia_id: FAM,
    subfamilia_id: null, proprietario_cliente_id: null });
  const criarPeloAlmox = async (corpo) => {
    const r = await as(ALMOXARIFE, () => request(app).post('/api/almoxarifado/materiais').send(corpo));
    assert.strictEqual(r.status, 201, `criacao pelo almoxarifado: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const marca = async (id) => Number((await dbGet(db, 'SELECT cadastro_a_completar c FROM materiais_almoxarifado WHERE id = ?', [id])).c);
  const listaCompras = (params = {}) => as(ADMIN_COMPRAS, () => request(app).get('/api/compras/materiais/cadastro').query(params));
  const ids = (r) => r.body.map((m) => m.id);

  // ── RN-254.10 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-254.10] a sobra e a remessa criam o material com a marca (resposta e banco)', async () => {
    for (const corpo of [corpoSobra(), corpoRemessa()]) {
      const m = await criarPeloAlmox(corpo);
      assert.strictEqual(Number(m.cadastro_a_completar), 1, `resposta: ${JSON.stringify(m)}`);
      assert.strictEqual(await marca(m.id), 1);
    }
  });

  await test('[RN-254.10] o material criado pelo Compras nasce sem a marca', async () => {
    const r = await as(ADMIN_COMPRAS, () => request(app).post('/api/compras/materiais/cadastro')
      .send({ codigo: `C254-${++seq}`, nome: 'Do Compras', unidade: 'UN', categoria: 'OUTROS', familia_id: FAM, ncm: '73181500' }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(Number(r.body.cadastro_a_completar), 0);
    assert.strictEqual(await marca(r.body.id), 0);
  });

  await test('[RN-254.10] com a chave de reversao (ALMOX_CADASTRO_MATERIAL=liberado) o Almoxarifado cadastra tudo e nao marca', async () => {
    process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
    let m;
    try {
      m = await criarPeloAlmox({ ...corpoSobra(), ncm: '73181500' });
    } finally {
      delete process.env.ALMOX_CADASTRO_MATERIAL;
    }
    assert.strictEqual(await marca(m.id), 0);
    const m2 = await criarPeloAlmox(corpoSobra());
    assert.strictEqual(await marca(m2.id), 1, 'desligada a chave, volta a marcar');
  });

  // ── RN-254.11 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-254.11] salvar o cadastro pelo Compras tira a marca, no mesmo salvar', async () => {
    const m = await criarPeloAlmox(corpoSobra());
    const r = await as(ADMIN_COMPRAS, () => request(app).put(`/api/compras/materiais/cadastro/${m.id}`)
      .send({ nome: m.nome, ncm: '73181500', custo_unitario: 12.5 }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(Number(r.body.cadastro_a_completar), 0, 'a resposta ainda diz a completar');
    assert.strictEqual(await marca(m.id), 0);
    const g = await dbGet(db, 'SELECT ncm FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    assert.strictEqual(g.ncm, '73181500');
  });

  await test('[RN-254.11] so reativar ({ ativo: 1 }) ou inativar pelo Compras nao tira a marca', async () => {
    const m = await criarPeloAlmox(corpoSobra());
    const ina = await as(ADMIN_COMPRAS, () => request(app).delete(`/api/compras/materiais/cadastro/${m.id}`));
    assert.strictEqual(ina.status, 200, JSON.stringify(ina.body));
    assert.strictEqual(await marca(m.id), 1, 'inativar tirou a marca');
    const rea = await as(ADMIN_COMPRAS, () => request(app).put(`/api/compras/materiais/cadastro/${m.id}`).send({ ativo: 1 }));
    assert.strictEqual(rea.status, 200, JSON.stringify(rea.body));
    assert.strictEqual(await marca(m.id), 1, 'reativar tirou a marca');
  });

  await test('[RN-254.11, Fase 5] um PUT do Compras sem campo do cadastro (so os de concorrencia) nao tira a marca', async () => {
    const m = await criarPeloAlmox(corpoSobra());
    for (const corpo of [{ controles_lidos: { controle_lote: 0, controle_serie: 0 } }, { campos_lidos: {} }, { familia_lida: null }]) {
      const r = await as(ADMIN_COMPRAS, () => request(app).put(`/api/compras/materiais/cadastro/${m.id}`).send(corpo));
      assert.ok(r.status < 500, `${JSON.stringify(corpo)}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(await marca(m.id), 1, `${JSON.stringify(corpo)} tirou a marca`);
    }
    const ok = await as(ADMIN_COMPRAS, () => request(app).put(`/api/compras/materiais/cadastro/${m.id}`)
      .send({ campos_lidos: {}, nome: m.nome }));
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.strictEqual(await marca(m.id), 0, 'com um campo do cadastro, tira');
  });

  await test('[RN-254.11] salvar recusado (familia inexistente -> 400) nao tira a marca', async () => {
    const m = await criarPeloAlmox(corpoSobra());
    const r = await as(ADMIN_COMPRAS, () => request(app).put(`/api/compras/materiais/cadastro/${m.id}`)
      .send({ nome: m.nome, ncm: '73181500', familia_id: 999999 }));
    assert.ok(r.status >= 400 && r.status < 500, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(await marca(m.id), 1);
  });

  await test('[RN-254.11] o PUT do Almoxarifado continua recusado (403) e nao mexe na marca', async () => {
    const m = await criarPeloAlmox(corpoSobra());
    const r = await as(ALMOXARIFE, () => request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ nome: 'X', ncm: '1' }));
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(await marca(m.id), 1);
  });

  // ── RN-254.12 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-254.12] a lista com a_completar=1 traz so os marcados (ativos); sem o parametro, todos com o campo', async () => {
    const marcado = await criarPeloAlmox(corpoSobra());
    const r0 = await as(ADMIN_COMPRAS, () => request(app).post('/api/compras/materiais/cadastro')
      .send({ codigo: `C254-${++seq}`, nome: 'Completo', unidade: 'UN', categoria: 'OUTROS', familia_id: FAM }));
    assert.strictEqual(r0.status, 201);
    const so = await listaCompras({ a_completar: '1' });
    assert.strictEqual(so.status, 200, JSON.stringify(so.body));
    assert.ok(ids(so).includes(marcado.id), 'o marcado nao veio no filtro');
    assert.ok(!ids(so).includes(r0.body.id), 'o completo veio no filtro');
    assert.ok(so.body.every((m) => Number(m.cadastro_a_completar) === 1));
    const todos = await listaCompras();
    assert.ok(ids(todos).includes(marcado.id) && ids(todos).includes(r0.body.id));
    const almox = await as(ALMOXARIFE, () => request(app).get('/api/almoxarifado/materiais').query({ a_completar: '1' }));
    assert.strictEqual(almox.status, 200);
    assert.ok(ids(almox).includes(marcado.id) && !ids(almox).includes(r0.body.id), 'a lista do almoxarifado tambem filtra');
    const outroValor = await listaCompras({ a_completar: 'sim' });
    assert.ok(ids(outroValor).includes(r0.body.id), 'so "1" filtra');
  });

  // ── Integracao (T4): criar na sobra -> aparece no filtro -> o Compras salva -> sai do filtro ──────────────────────────────
  await test('[integracao] sobra cria -> filtro do Compras mostra -> o Compras salva -> sai do filtro e continua na lista', async () => {
    const m = await criarPeloAlmox(corpoSobra());
    assert.ok(ids(await listaCompras({ a_completar: '1' })).includes(m.id));
    const put = await as(ADMIN_COMPRAS, () => request(app).put(`/api/compras/materiais/cadastro/${m.id}`).send({ nome: m.nome, ncm: '1' }));
    assert.strictEqual(put.status, 200, JSON.stringify(put.body));
    assert.ok(!ids(await listaCompras({ a_completar: '1' })).includes(m.id), 'continuou no filtro depois de salvar');
    assert.ok(ids(await listaCompras()).includes(m.id));
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
