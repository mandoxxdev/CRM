/**
 * Etapa 192 (Compras) Fase 5, X1 — as portas do Compras para o cadastro de material NUNCA mexem em estoque nem nos controles
 * de estoque (`services/compras/cadastroDeMaterial.js`).
 *
 * O bug (revisao adversarial da Fase 5): quem tinha o modulo Compras e um perfil do almoxarifado que sobrou (ALMOXARIFE,
 * ADMINISTRADOR) — mas NAO o modulo almoxarifado — lancava saldo inicial pela porta do Compras (o POST gravava uma ENTRADA no
 * estoque), ligava o controle por lote num material com saldo sem lote e trocava o dono de material com historico: as guardas
 * do handler compartilhado (`movimentar`, `ajustar_estoque`, `ajustar_material_cliente`) liam o perfil dele.
 *
 *   RN-1  POST com saldo inicial (`quantidade_atual` > 0) -> 400 `Saldo inicial é lançado no Almoxarifado.` para TODOS
 *         (perfil ADMINISTRADOR, ALMOXARIFE, superadmin, administrador do Compras); nada gravado, nenhuma movimentacao.
 *         `quantidade_atual: 0` continua cadastrando.
 *   RN-2  PUT pelo Compras: as guardas do handler leem o perfil COMPRAS (o usuario do handler e uma copia sem o perfil do
 *         almoxarifado) — ligar lote com saldo nao identificado e trocar dono com historico -> 403 "(seu perfil: COMPRAS)",
 *         nada gravado. Pela rota do almoxarifado o mesmo usuario continua podendo (controle: a guarda e so da porta).
 *   RN-3  o que nao toca estoque segue igual pelo Compras: ligar lote em material SEM saldo, trocar dono SEM historico; e a
 *         auditoria do cadastro grava o usuario de verdade (id e nome), nao a copia.
 *
 * Etapa 193 (RN-193.03): a porta do Compras passou a aceitar so o administrador do modulo Compras e os do sistema. O cenario da
 * X1 continua o mesmo — quem entra pela porta do Compras com um perfil do almoxarifado que sobrou —, agora como o admin do
 * Compras que TAMBEM tem o perfil ADMINISTRADOR ou ALMOXARIFE (antes o perfil sozinho ja abria a porta). O controle "pelo
 * almoxarifado, 200" liga a chave `ALMOX_CADASTRO_MATERIAL=liberado` (sem ela o PUT do almoxarifado recusa para todos,
 * RN-193.02). O G1 passou de 10 para 13 portas (foto, inativar e a lista de clientes, RN-193.04/05).
 *
 * Executar: cd server && node tests/api/comprasMaterialSemEstoque.api.test.js
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

const SUPER = { id: 1, nome: 'Super', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ROLE_ADMIN = { id: 6, nome: 'Role admin', role: 'admin', email: 'roleadmin@test.com' };
const ALMOXARIFE = { id: 10, nome: 'Ex-almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'x@test.com' };
const PERFIL_ADM = { id: 11, nome: 'Perfil adm', role: 'usuario', perfil_almoxarifado: 'ADMINISTRADOR', email: 'y@test.com' };
const ADMIN_COMPRAS = { id: 2, nome: 'Chefe compras', role: 'usuario', admin_modulos: ['compras'], email: 'c@test.com' };
// Etapa 193: o admin do Compras com o perfil do almoxarifado que sobrou (o caso da X1, agora pela unica porta que o aceita).
const ADMIN_COMPRAS_PERFIL_ADM = { ...PERFIL_ADM, id: 12, nome: 'Chefe compras ex-adm', admin_modulos: ['compras'] };
const ADMIN_COMPRAS_ALMOXARIFE = { ...ALMOXARIFE, id: 13, nome: 'Chefe compras ex-almoxarife', admin_modulos: ['compras'] };
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const MSG_SALDO = 'Saldo inicial é lançado no Almoxarifado.';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); return fn(); };
  const comChave = async (fn) => {
    process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
    try { return await fn(); } finally { delete process.env.ALMOX_CADASTRO_MATERIAL; }
  };

  const FAM = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('VLV','Valvulas',1)")).lastID;
  const corpo = (over = {}) => ({ nome: 'Valvula', unidade: 'PC', categoria: 'OUTROS', familia_id: FAM, ...over });
  const CLI = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente X')")).lastID;
  const material = async (codigo, qtd) => (await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, categoria, familia_id, quantidade_atual, controle_lote, ativo) VALUES (?, 'Mat', 'PC', 'OUTROS', ?, ?, 0, 1)`,
  [codigo, FAM, qtd])).lastID;

  await test('[RN-1] saldo inicial pelo Compras -> 400 para os 5 usuarios que cadastram; nada gravado, nenhuma movimentacao', async () => {
    for (const u of [ADMIN_COMPRAS_PERFIL_ADM, ADMIN_COMPRAS_ALMOXARIFE, SUPER, ROLE_ADMIN, ADMIN_COMPRAS]) {
      const codigo = `S-${u.id}`;
      const r = await as(u, () => request(app).post('/api/compras/materiais/cadastro').send(corpo({ codigo, quantidade_atual: 5 })));
      assert.strictEqual(r.status, 400, `${u.nome}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, MSG_SALDO);
      assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM materiais_almoxarifado WHERE codigo = ?', [codigo])).n, 0);
    }
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado')).n, 0);
    // controle: pela rota do almoxarifado o mesmo perfil lanca (a recusa e da porta do Compras). Fase 5 (R3b): saldo inicial no
    // POST do almoxarifado so com a chave de reversao — sem ela a porta aceita so o formato da sobra/remessa.
    process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
    let a;
    try {
      a = await as(PERFIL_ADM, () => request(app).post('/api/almoxarifado/materiais').send(corpo({ codigo: 'S-ALMOX', quantidade_atual: 5 })));
    } finally { delete process.env.ALMOX_CADASTRO_MATERIAL; }
    assert.strictEqual(a.status, 201, JSON.stringify(a.body));
  });

  await test('[RN-1] quantidade_atual 0 pelo Compras cadastra (201) e a auditoria grava o usuario de verdade', async () => {
    const r = await as(ADMIN_COMPRAS_ALMOXARIFE, () => request(app).post('/api/compras/materiais/cadastro').send(corpo({ codigo: 'Z-0', quantidade_atual: 0 })));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [r.body.id]);
    assert.strictEqual(Number(m.quantidade_atual || 0), 0);
    const aud = await dbGet(db, `SELECT usuario_id, usuario_nome FROM auditoria_log_almoxarifado
      WHERE entidade = 'material' AND entidade_id = ? AND acao = 'CRIACAO'`, [r.body.id]);
    assert.deepStrictEqual(aud, { usuario_id: ADMIN_COMPRAS_ALMOXARIFE.id, usuario_nome: ADMIN_COMPRAS_ALMOXARIFE.nome });
  });

  await test('[RN-2] ligar lote com saldo sem lote pelo Compras -> 403 "(seu perfil: COMPRAS)" para perfil ADMINISTRADOR, superadmin e role admin', async () => {
    const id = await material('L-1', 5);
    for (const u of [ADMIN_COMPRAS_PERFIL_ADM, SUPER, ROLE_ADMIN]) {
      const r = await as(u, () => request(app).put(`/api/compras/materiais/cadastro/${id}`).send({ controle_lote: 1 }));
      assert.strictEqual(r.status, 403, `${u.nome}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.ok(/ajustar_estoque/.test(r.body.error) && /seu perfil: COMPRAS/.test(r.body.error), r.body.error);
      assert.strictEqual((await dbGet(db, 'SELECT controle_lote FROM materiais_almoxarifado WHERE id = ?', [id])).controle_lote, 0);
    }
    const a = await comChave(() => as(PERFIL_ADM, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send({ controle_lote: 1 })));
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
  });

  await test('[RN-2] trocar dono de material com historico pelo Compras -> 403 "(seu perfil: COMPRAS)"; pelo almoxarifado, 200', async () => {
    const id = await material('D-1', 3);
    const r = await as(ADMIN_COMPRAS_PERFIL_ADM, () => request(app).put(`/api/compras/materiais/cadastro/${id}`).send({ proprietario_cliente_id: CLI }));
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.ok(/ajustar_material_cliente/.test(r.body.error) && /seu perfil: COMPRAS/.test(r.body.error), r.body.error);
    assert.strictEqual((await dbGet(db, 'SELECT proprietario_cliente_id p FROM materiais_almoxarifado WHERE id = ?', [id])).p, null);
    const a = await comChave(() => as(PERFIL_ADM, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send({ proprietario_cliente_id: CLI })));
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
  });

  await test('[RN-3] sem estoque envolvido, o Compras segue cadastrando: ligar lote sem saldo e trocar dono sem historico -> 200', async () => {
    const id = await material('N-1', 0);
    const r = await as(ADMIN_COMPRAS_ALMOXARIFE, () => request(app).put(`/api/compras/materiais/cadastro/${id}`).send({ controle_lote: 1, proprietario_cliente_id: CLI }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const m = await dbGet(db, 'SELECT controle_lote, proprietario_cliente_id p FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.deepStrictEqual([m.controle_lote, m.p], [1, CLI]);
  });

  await close();

  // ══ G1: as 13 portas exigem o modulo COMPRAS (nao o almoxarifado) ═══════════════════════════════════════════════════
  // O harness libera a camada 2; aqui ela e trocada (`options.checkModulePermission`) por uma que confere `user.modulos`.
  const checkModulo = (modulo) => (req, res, next) => ((req.user && req.user.modulos) || []).includes(modulo)
    ? next() : res.status(403).json({ error: 'MODULO', modulo });
  const h = await createTestApp({ user: SUPER, checkModulePermission: checkModulo });
  const fam2 = (await dbRun(h.db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('VLV','Valvulas',1)")).lastID;
  const mat2 = (await dbRun(h.db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, categoria, familia_id, ativo)
    VALUES ('G1-1','Mat','PC','OUTROS',?,1)`, [fam2])).lastID;
  const PORTAS = [
    ['get', '/api/compras/materiais/aux/minhas-permissoes'],
    ['get', '/api/compras/materiais/cadastro'],
    ['get', `/api/compras/materiais/cadastro/${mat2}`],
    ['post', '/api/compras/materiais/cadastro', { codigo: 'G1-2', nome: 'X', unidade: 'PC', categoria: 'OUTROS', familia_id: fam2 }],
    ['put', `/api/compras/materiais/cadastro/${mat2}`, { nome: 'Mat 2' }],
    ['get', '/api/compras/materiais/aux/familias'],
    ['get', '/api/compras/materiais/aux/categorias'],
    ['get', '/api/compras/materiais/aux/almoxarifados'],
    ['get', '/api/compras/materiais/aux/localizacoes'],
    ['get', `/api/compras/materiais/aux/proximo-codigo?familia_id=${fam2}`],
    // Etapa 193 (RN-193.04/05): a lista de clientes, a foto e o inativar (por ultimo: inativa o material)
    ['get', '/api/compras/materiais/aux/clientes'],
    ['post', `/api/compras/materiais/cadastro/${mat2}/foto`, 'FOTO'],
    ['delete', `/api/compras/materiais/cadastro/${mat2}`],
  ];
  await test('[G1] com o modulo Compras (sem o almoxarifado) as 13 portas atendem; so com o almoxarifado, 403 do modulo compras', async () => {
    for (const [verbo, url, body] of PORTAS) {
      const pedir = () => (body === 'FOTO' ? request(h.app).post(url).attach('foto', PNG_1x1, 'f.png') : request(h.app)[verbo](url).send(body));
      h.setUser({ ...ADMIN_COMPRAS_ALMOXARIFE, modulos: ['almoxarifado'] });
      const nao = await pedir();
      assert.deepStrictEqual([nao.status, nao.body], [403, { error: 'MODULO', modulo: 'compras' }], `${verbo} ${url}`);
      h.setUser({ ...ADMIN_COMPRAS_ALMOXARIFE, modulos: ['compras'] });
      const ok = await pedir();
      assert.ok(ok.status < 400, `${verbo} ${url} com compras: ${ok.status} ${JSON.stringify(ok.body)}`);
      assert.deepStrictEqual([nao.status, nao.body], [403, { error: 'MODULO', modulo: 'compras' }], `${verbo} ${url}`);
    }
  });
  await h.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
