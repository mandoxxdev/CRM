/**
 * Etapa 193 (Compras) K1 — RN-193.02 a RN-193.06: o cadastro de material passa a ser SO do Compras.
 *
 *  - RN-193.02: as escritas de CADASTRO do almoxarifado (`PUT /api/almoxarifado/materiais/:id`, `DELETE .../:id`,
 *    `POST .../:id/foto`) recusam com 403 e a mensagem literal, para TODOS (superadmin inclusive) e sem gravar nada
 *    (a foto nem chega ao disco: a recusa roda antes do multer). O `POST /api/almoxarifado/materiais` CONTINUA: a sobra
 *    (retalho) e a remessa para terceiros criam material na operacao.
 *  - RN-193.03: a porta do Compras aceita so o administrador do modulo Compras e os administradores do sistema
 *    (superadmin / role admin). Almoxarife, Engenharia, o perfil Administrador do almoxarifado e o admin do modulo
 *    almoxarifado deixam de entrar.
 *  - RN-193.04: o Compras ganha foto e inativar/reativar, com as MESMAS regras do almoxarifado (saldo e retencoes prendem).
 *  - RN-193.05: o dono se define no cadastro (sobra e remessa so copiam o da origem) -> o Compras volta a ter o campo, com a
 *    lista minima de clientes sob o mesmo gate; trocar dono de material COM historico continua recusado (perfil COMPRAS).
 *  - RN-193.06: ligar lote/serie em material com saldo nao identificado continua recusado pelo Compras (B72).
 *
 * Executar: cd server && node tests/api/cadastroSoNoCompras.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const MSG_SO_NO_COMPRAS = 'O cadastro de material é feito em Compras → Materiais.';
const LITERAL_403 = 'Sem permissão para esta operação';

const SUPER = { id: 1, nome: 'Super', role: 'usuario', is_superadmin: 1, email: 'super@test.com' };
const ROLE_ADMIN = { id: 2, nome: 'Admin do sistema', role: 'admin', email: 'admin@test.com' };
const ADMIN_COMPRAS = { id: 3, nome: 'Chefe de Compras', role: 'usuario', admin_modulos: ['compras'], email: 'chefe@test.com' };
const ALMOXARIFE = { id: 4, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };
const ENGENHARIA = { id: 5, nome: 'Engenharia', role: 'usuario', perfil_almoxarifado: 'ENGENHARIA', email: 'eng@test.com' };
const ADMIN_PERFIL_ALMOX = { id: 6, nome: 'Adm Almox', role: 'usuario', perfil_almoxarifado: 'ADMINISTRADOR', email: 'aa@test.com' };
const ADMIN_MODULO_ALMOX = { id: 7, nome: 'Adm Modulo Almox', role: 'usuario', admin_modulos: ['almoxarifado'], email: 'am@test.com' };

(async () => {
  const { app, db, setUser, close, uploadsAlmoxDir } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); return fn(); };
  const arquivos = () => { try { return fs.readdirSync(uploadsAlmoxDir).length; } catch (e) { return 0; } };

  const FAM = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('K1F','Familia K1',1)")).lastID;
  const FAM_INATIVA = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('K1X','Familia off',0)")).lastID;
  const CLI = (await dbRun(db, "INSERT INTO clientes (razao_social, nome_fantasia, cnpj) VALUES ('Cliente K1 SA','K1','00000000000100')")).lastID;
  let seq = 0;
  const material = async (over = {}) => {
    seq += 1;
    const c = { codigo: `K1-${seq}`, nome: `Material ${seq}`, familia_id: FAM, ativo: 1, quantidade_atual: 0, ...over };
    const cols = Object.keys(c);
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado (unidade, categoria, ${cols.join(', ')})
      VALUES ('PC', 'OUTROS', ${cols.map(() => '?').join(', ')})`, cols.map((k) => c[k]));
    return r.lastID;
  };
  const corpo = (over = {}) => ({ nome: 'Material novo', unidade: 'PC', categoria: 'OUTROS', familia_id: FAM, ...over });

  // ── RN-193.02 ────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-193.02] PUT, DELETE e foto do almoxarifado -> 403 literal para todos; nada gravado, nenhum arquivo', async () => {
    const MAT = await material({ nome: 'Intocado' });
    const antesArquivos = arquivos();
    for (const u of [SUPER, ROLE_ADMIN, ADMIN_PERFIL_ALMOX, ALMOXARIFE, ADMIN_COMPRAS]) {
      const chamadas = [
        ['PUT', () => request(app).put(`/api/almoxarifado/materiais/${MAT}`).send({ nome: 'Mudado', ativo: 0 })],
        ['DELETE', () => request(app).delete(`/api/almoxarifado/materiais/${MAT}`)],
        ['foto', () => request(app).post(`/api/almoxarifado/materiais/${MAT}/foto`).attach('foto', PNG_1x1, 'f.png')],
      ];
      for (const [nome, fn] of chamadas) {
        const r = await as(u, fn);
        assert.deepStrictEqual([r.status, r.body.error], [403, MSG_SO_NO_COMPRAS], `${u.nome} ${nome}: ${r.status} ${JSON.stringify(r.body)}`);
      }
    }
    const m = await dbGet(db, 'SELECT nome, ativo, foto FROM materiais_almoxarifado WHERE id = ?', [MAT]);
    assert.deepStrictEqual(m, { nome: 'Intocado', ativo: 1, foto: null });
    assert.strictEqual(arquivos(), antesArquivos, 'a recusa roda antes do multer: nenhum arquivo no disco');
  });

  await test('[RN-193.02] POST /api/almoxarifado/materiais continua (sobra e remessa criam material na operacao)', async () => {
    const r = await as(ALMOXARIFE, () => request(app).post('/api/almoxarifado/materiais').send(corpo({ codigo: 'RET-K1' })));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  });

  await test('[RN-193.02, letra B] a chave ALMOX_CADASTRO_MATERIAL=liberado devolve a corrente de antes (o perfil decide); desligada, recusa de novo', async () => {
    const MAT = await material({ nome: 'Chave' });
    const PRODUCAO = { id: 8, nome: 'Producao', role: 'usuario', email: 'p@test.com' };
    process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
    try {
      const ok = await as(ALMOXARIFE, () => request(app).put(`/api/almoxarifado/materiais/${MAT}`).send({ nome: 'Pela chave' }));
      assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
      const neg = await as(PRODUCAO, () => request(app).delete(`/api/almoxarifado/materiais/${MAT}`));
      assert.deepStrictEqual([neg.status, neg.body.error], [403, LITERAL_403], JSON.stringify(neg.body));
    } finally {
      delete process.env.ALMOX_CADASTRO_MATERIAL;
    }
    const r = await as(ALMOXARIFE, () => request(app).put(`/api/almoxarifado/materiais/${MAT}`).send({ nome: 'Sem chave' }));
    assert.deepStrictEqual([r.status, r.body.error], [403, MSG_SO_NO_COMPRAS]);
    assert.deepStrictEqual(await dbGet(db, 'SELECT nome, ativo FROM materiais_almoxarifado WHERE id = ?', [MAT]), { nome: 'Pela chave', ativo: 1 });
  });

  // ── RN-193.03 ────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-193.03] o Compras aceita o admin do Compras, o superadmin e o role admin (lista, criar, editar)', async () => {
    const MAT = await material();
    for (const u of [ADMIN_COMPRAS, SUPER, ROLE_ADMIN]) {
      const p = await as(u, () => request(app).get('/api/compras/materiais/aux/minhas-permissoes'));
      assert.deepStrictEqual(p.body.acoes, { criar_material: true, editar_material: true }, `${u.nome}: ${JSON.stringify(p.body)}`);
      const l = await as(u, () => request(app).get('/api/compras/materiais/cadastro'));
      assert.strictEqual(l.status, 200, `${u.nome} lista: ${l.status}`);
      const c = await as(u, () => request(app).post('/api/compras/materiais/cadastro').send(corpo({ codigo: `OK-${u.id}` })));
      assert.strictEqual(c.status, 201, `${u.nome} criar: ${JSON.stringify(c.body)}`);
      const e = await as(u, () => request(app).put(`/api/compras/materiais/cadastro/${MAT}`).send({ ncm: `8481.80.${u.id}` }));
      assert.strictEqual(e.status, 200, `${u.nome} editar: ${JSON.stringify(e.body)}`);
    }
  });

  await test('[RN-193.03] Almoxarife, Engenharia, perfil Administrador e admin do modulo almoxarifado -> 403 no Compras', async () => {
    const MAT = await material({ nome: 'Fora do alcance' });
    for (const u of [ALMOXARIFE, ENGENHARIA, ADMIN_PERFIL_ALMOX, ADMIN_MODULO_ALMOX]) {
      const p = await as(u, () => request(app).get('/api/compras/materiais/aux/minhas-permissoes'));
      assert.deepStrictEqual(p.body.acoes, { criar_material: false, editar_material: false }, `${u.nome}: ${JSON.stringify(p.body)}`);
      const chamadas = [
        ['lista', () => request(app).get('/api/compras/materiais/cadastro')],
        ['clientes', () => request(app).get('/api/compras/materiais/aux/clientes')],
        ['criar', () => request(app).post('/api/compras/materiais/cadastro').send(corpo({ codigo: `NEG-${u.id}` }))],
        ['editar', () => request(app).put(`/api/compras/materiais/cadastro/${MAT}`).send({ nome: 'X' })],
        ['inativar', () => request(app).delete(`/api/compras/materiais/cadastro/${MAT}`)],
        ['foto', () => request(app).post(`/api/compras/materiais/cadastro/${MAT}/foto`).attach('foto', PNG_1x1, 'f.png')],
      ];
      for (const [nome, fn] of chamadas) {
        const r = await as(u, fn);
        assert.deepStrictEqual([r.status, r.body.error], [403, LITERAL_403], `${u.nome} ${nome}: ${r.status} ${JSON.stringify(r.body)}`);
      }
    }
    const m = await dbGet(db, 'SELECT nome, ativo, foto FROM materiais_almoxarifado WHERE id = ?', [MAT]);
    assert.deepStrictEqual(m, { nome: 'Fora do alcance', ativo: 1, foto: null });
    assert.strictEqual((await dbGet(db, "SELECT COUNT(*) n FROM materiais_almoxarifado WHERE codigo LIKE 'NEG-%'")).n, 0);
  });

  // ── RN-193.04 ────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-193.04] inativar pelo Compras: sem saldo -> 200, ativo 0, auditoria com a pessoa real', async () => {
    const MAT = await material();
    const r = await as(ADMIN_COMPRAS, () => request(app).delete(`/api/compras/materiais/cadastro/${MAT}`));
    assert.deepStrictEqual([r.status, r.body], [200, { success: true }]);
    assert.strictEqual((await dbGet(db, 'SELECT ativo FROM materiais_almoxarifado WHERE id = ?', [MAT])).ativo, 0);
    const a = await dbGet(db, "SELECT usuario_id, usuario_nome FROM auditoria_log_almoxarifado WHERE entidade = 'material' AND entidade_id = ? AND acao = 'DESATIVACAO'", [MAT]);
    assert.deepStrictEqual(a, { usuario_id: ADMIN_COMPRAS.id, usuario_nome: ADMIN_COMPRAS.nome });
  });

  await test('[RN-193.04] inativar pelo Compras com saldo ou reserva -> 400 com a mensagem do almoxarifado; nada gravado', async () => {
    const COM_SALDO = await material({ codigo: 'K1-SALDO', quantidade_atual: 5 });
    const COM_RESERVA = await material({ codigo: 'K1-RES', quantidade_atual: 2, quantidade_reservada: 2 });
    const r1 = await as(ADMIN_COMPRAS, () => request(app).delete(`/api/compras/materiais/cadastro/${COM_SALDO}`));
    assert.strictEqual(r1.status, 400, JSON.stringify(r1.body));
    assert.strictEqual(r1.body.error, 'Não é possível inativar o material K1-SALDO: o saldo físico é 5. Material inativo não pode ser '
      + 'movimentado, então esse saldo ficaria preso. Antes de inativar, zere o saldo com uma Saída ou um Ajuste. Seu perfil (COMPRAS) '
      + 'não movimenta estoque: peça isso ao almoxarifado.');
    const r2 = await as(ADMIN_COMPRAS, () => request(app).delete(`/api/compras/materiais/cadastro/${COM_RESERVA}`));
    assert.strictEqual(r2.status, 400, JSON.stringify(r2.body));
    assert.ok(r2.body.error.includes('o saldo físico é 2 (reservado 2)'), r2.body.error);
    // O PUT com `ativo: 0` segue a mesma regra (Etapa 113).
    const r3 = await as(ADMIN_COMPRAS, () => request(app).put(`/api/compras/materiais/cadastro/${COM_SALDO}`).send({ ativo: 0 }));
    assert.strictEqual(r3.status, 400, JSON.stringify(r3.body));
    const ativos = await dbGet(db, 'SELECT SUM(ativo) s FROM materiais_almoxarifado WHERE id IN (?, ?)', [COM_SALDO, COM_RESERVA]);
    assert.strictEqual(ativos.s, 2);
  });

  await test('[RN-193.04] reativar pelo Compras (PUT ativo: 1) -> 200; em familia inativa -> 400 e continua inativo', async () => {
    const MAT = await material({ ativo: 0 });
    const r = await as(ADMIN_COMPRAS, () => request(app).put(`/api/compras/materiais/cadastro/${MAT}`).send({ ativo: 1 }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await dbGet(db, 'SELECT ativo FROM materiais_almoxarifado WHERE id = ?', [MAT])).ativo, 1);
    const PRESO = await material({ ativo: 0, familia_id: FAM_INATIVA });
    const r2 = await as(ADMIN_COMPRAS, () => request(app).put(`/api/compras/materiais/cadastro/${PRESO}`).send({ ativo: 1 }));
    assert.strictEqual(r2.status, 400, JSON.stringify(r2.body));
    assert.strictEqual((await dbGet(db, 'SELECT ativo FROM materiais_almoxarifado WHERE id = ?', [PRESO])).ativo, 0);
  });

  await test('[RN-193.04] foto pelo Compras -> 200, gravada no material e no disco; material inexistente -> 404 sem arquivo', async () => {
    const MAT = await material();
    const antes = arquivos();
    const r = await as(ADMIN_COMPRAS, () => request(app).post(`/api/compras/materiais/cadastro/${MAT}/foto`).attach('foto', PNG_1x1, 'f.png'));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const m = await dbGet(db, 'SELECT foto FROM materiais_almoxarifado WHERE id = ?', [MAT]);
    assert.ok(m.foto && r.body.foto === m.foto, JSON.stringify({ body: r.body, m }));
    assert.ok(String(r.body.foto_url || '').startsWith('/api/uploads/almoxarifado/'), r.body.foto_url);
    assert.strictEqual(arquivos(), antes + 1);
    const n = await as(ADMIN_COMPRAS, () => request(app).post('/api/compras/materiais/cadastro/987654/foto').attach('foto', PNG_1x1, 'f.png'));
    assert.strictEqual(n.status, 404, JSON.stringify(n.body));
    assert.strictEqual(arquivos(), antes + 1, 'o 404 limpa o arquivo do multer');
  });

  // ── RN-193.05 ────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-193.05] lista minima de clientes no Compras (id, razao_social) e o dono definido no cadastro', async () => {
    const l = await as(ADMIN_COMPRAS, () => request(app).get('/api/compras/materiais/aux/clientes'));
    assert.strictEqual(l.status, 200, JSON.stringify(l.body));
    assert.deepStrictEqual(l.body.find((c) => c.id === CLI), { id: CLI, razao_social: 'Cliente K1 SA' });
    const c = await as(ADMIN_COMPRAS, () => request(app).post('/api/compras/materiais/cadastro')
      .send(corpo({ codigo: 'K1-DONO', proprietario_cliente_id: CLI })));
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    assert.strictEqual((await dbGet(db, 'SELECT proprietario_cliente_id p FROM materiais_almoxarifado WHERE id = ?', [c.body.id])).p, CLI);
    // Sem historico, a troca e livre (cadastro errado logo depois de criar): volta a ser nosso.
    const t = await as(ADMIN_COMPRAS, () => request(app).put(`/api/compras/materiais/cadastro/${c.body.id}`).send({ proprietario_cliente_id: null }));
    assert.strictEqual(t.status, 200, JSON.stringify(t.body));
    assert.strictEqual((await dbGet(db, 'SELECT proprietario_cliente_id p FROM materiais_almoxarifado WHERE id = ?', [c.body.id])).p, null);
  });

  await test('[RN-193.05] trocar o dono de material COM historico pelo Compras -> 403 (ajustar_material_cliente, perfil COMPRAS)', async () => {
    const MAT = await material({ quantidade_atual: 3 });
    const r = await as(ADMIN_COMPRAS, () => request(app).put(`/api/compras/materiais/cadastro/${MAT}`).send({ proprietario_cliente_id: CLI }));
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.ok(r.body.error.includes('"ajustar_material_cliente" (seu perfil: COMPRAS)'), r.body.error);
    assert.strictEqual((await dbGet(db, 'SELECT proprietario_cliente_id p FROM materiais_almoxarifado WHERE id = ?', [MAT])).p, null);
  });

  // ── RN-193.06 ────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-193.06] ligar lote em material com saldo sem lote pelo Compras -> 403 (B72); sem saldo, liga', async () => {
    const COM_SALDO = await material({ quantidade_atual: 4 });
    const r = await as(SUPER, () => request(app).put(`/api/compras/materiais/cadastro/${COM_SALDO}`).send({ controle_lote: 1 }));
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.ok(r.body.error.includes('"ajustar_estoque" (seu perfil: COMPRAS)'), r.body.error);
    assert.strictEqual((await dbGet(db, 'SELECT controle_lote c FROM materiais_almoxarifado WHERE id = ?', [COM_SALDO])).c, 0);
    const SEM_SALDO = await material();
    const ok = await as(SUPER, () => request(app).put(`/api/compras/materiais/cadastro/${SEM_SALDO}`).send({ controle_lote: 1 }));
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
