/**
 * Etapa 183 (T1) — a ficha de EPI devolve, em cada entrega, a confirmacao por matricula e o aparelho gravados NA EVIDENCIA do ato
 * (dentro do HMAC), para a tela e o PDF da ficha mostrarem. O `ip` continua gravado e no lacre, mas nao sai na ficha (B1202).
 *
 * Contrato: cada entrega = [...CHAVES_LISTA, 'arquivo_url', 'registro_sha256', 'confirmado_por_matricula', 'user_agent'];
 * `confirmado_por_matricula` e `1 | null` (Number), `user_agent` e `string | null`. Entrega antiga (evidencia anterior a Fase 5 da
 * 178) e entrega sem evidencia -> os dois `null`, chaves presentes.
 *
 * Executar: cd server && node tests/api/epiFichaConfirmacao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { wrapDatabase } = require('../../services/sqliteConcurrency');
const stockService = require('../../services/almoxarifado/stockService');

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${String(e && e.message).replace(/\s*\n\s*/g, ' ').slice(0, 800)}`);
  }
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almox', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const PRODUCAO = { id: 5, nome: 'Prod', role: 'user', email: 'prod@test.com' };
const GESTOR = { id: 7, nome: 'Gestor', role: 'user', email: 'g@test.com', perfil_almoxarifado: 'GESTOR' };

const CHAVES_LISTA = ['id', 'numero', 'criado_em', 'colaborador_id', 'colaborador_nome', 'matricula', 'material_id', 'material_codigo',
  'material_nome', 'ca_numero', 'ca_validade', 'quantidade', 'tamanho', 'motivo', 'entregue_por_nome'];
const CHAVES_FICHA = [...CHAVES_LISTA, 'arquivo_url', 'registro_sha256', 'confirmado_por_matricula', 'user_agent'].sort();
const UA = 'Tablet-Almox/2.1 (Android)';

(async () => {
  const t = await createTestApp({ user: ADMIN });
  const { app, db, setUser } = t;
  wrapDatabase(db);

  const m = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, categoria, quantidade_atual, ativo, ca_numero, ca_validade)
    VALUES ('EPI-183', 'Luva 183', 'EPIs', 0, 1, 'CA-183', '2099-01-01')`)).lastID;
  await stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'ENTRADA', quantidade: 10, justificativa: 'carga' });
  const c = (await dbRun(db, "INSERT INTO colaboradores (nome, matricula, cpf, status, setor) VALUES ('MARIA 183', 'M-100', '98765432100', 'ativo', 'Solda')")).lastID;

  // A entrega nova, pela rota: tablet com User-Agent proprio e a matricula digitada certa.
  const nova = await request(app).post('/api/almoxarifado/epi/entregas').set('User-Agent', UA)
    .field('colaborador_id', String(c)).field('material_id', String(m)).field('quantidade', '1').field('confirmacao_matricula', 'M-100')
    .attach('assinatura', PNG_1PX, { filename: 'a.png', contentType: 'image/png' });
  assert.strictEqual(nova.status, 201, JSON.stringify(nova.body));
  const ipGravado = (await dbGet(db, "SELECT ip FROM evidencias_assinatura_almoxarifado WHERE contexto = 'ENTREGA_EPI' AND contexto_id = ?",
    [nova.body.id])).ip;

  // A entrega antiga (evidencia anterior a Fase 5 da 178: flag, ip e user_agent NULL) e a sem evidencia, por INSERT direto
  // (os triggers barram so UPDATE/DELETE).
  async function entregaDireta(numero, movId) {
    return (await dbRun(db, `INSERT INTO entregas_epi_almoxarifado (numero, colaborador_id, colaborador_nome, matricula, setor, material_id,
      material_codigo, material_nome, ca_numero, ca_validade, quantidade, movimentacao_id, entregue_por, entregue_por_nome, criado_em)
      VALUES (?, ?, 'MARIA 183', 'M-100', 'Solda', ?, 'EPI-183', 'Luva 183', 'CA-183', '2099-01-01', 1, ?, 1, 'Admin Teste', '2026-01-0${movId % 9 + 1}T10:00:00.000Z')`,
    [numero, c, m, movId])).lastID;
  }
  const antiga = await entregaDireta('EPI-ANTIGA-183', 990001);
  await dbRun(db, `INSERT INTO evidencias_assinatura_almoxarifado (contexto, contexto_id, colaborador_id, colaborador_nome, matricula, cpf,
    arquivo, arquivo_sha256, registro_sha256, criado_por, criado_por_nome, criado_em, confirmado_por_matricula, ip, user_agent)
    VALUES ('ENTREGA_EPI', ?, ?, 'MARIA 183', 'M-100', '98765432100', 'assinatura-epi-antiga.png', 'aa', 'bb', 1, 'Admin Teste',
    '2026-01-01T10:00:00.000Z', NULL, NULL, NULL)`, [antiga, c]);
  const semEvidencia = await entregaDireta('EPI-SEMEV-183', 990002);

  async function ficha() {
    const r = await request(app).get(`/api/almoxarifado/epi/ficha/${c}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  }
  const porId = (body, id) => body.entregas.find((e) => e.id === id);

  await test('[RN-183.01] a entrega da rota traz confirmado_por_matricula === 1 e user_agent do tablet, lidos da evidencia', async () => {
    setUser(ADMIN);
    const e = porId(await ficha(), nova.body.id);
    assert.strictEqual(e.confirmado_por_matricula, 1);
    assert.strictEqual(e.user_agent, UA);
  });

  await test('[RN-183.01] confirmado_por_matricula sai como number', async () => {
    setUser(ADMIN);
    assert.strictEqual(typeof porId(await ficha(), nova.body.id).confirmado_por_matricula, 'number');
  });

  await test('[RN-183.01] cada entrega tem exatamente as chaves do contrato', async () => {
    setUser(ADMIN);
    for (const e of (await ficha()).entregas) assert.deepStrictEqual(Object.keys(e).sort(), CHAVES_FICHA, `entrega ${e.id}`);
  });

  await test('[RN-183.02] o ip nao sai: nenhuma entrega tem a chave ip e o JSON inteiro nao contem o IP gravado', async () => {
    setUser(ADMIN);
    assert.ok(ipGravado && String(ipGravado).length > 3, `ip da evidencia nao gravado: ${ipGravado}`);
    const body = await ficha();
    for (const e of body.entregas) assert.ok(!('ip' in e), `entrega ${e.id} com a chave ip`);
    assert.ok(!JSON.stringify(body).includes(String(ipGravado)), `o IP ${ipGravado} vazou na ficha`);
  });

  await test('[RN-183.05] a entrega antiga e a sem evidencia -> os dois campos null, chaves presentes', async () => {
    setUser(ADMIN);
    const body = await ficha();
    for (const id of [antiga, semEvidencia]) {
      const e = porId(body, id);
      assert.ok(e, `entrega ${id} fora da ficha`);
      assert.ok('confirmado_por_matricula' in e && 'user_agent' in e, `entrega ${id} sem as chaves`);
      assert.strictEqual(e.confirmado_por_matricula, null, `entrega ${id}: confirmado_por_matricula`);
      assert.strictEqual(e.user_agent, null, `entrega ${id}: user_agent`);
    }
  });

  await test('[RN-183.03 servidor] o cadastro muda para M-200: o topo diz M-200 e a matricula da entrega continua M-100', async () => {
    setUser(ADMIN);
    await dbRun(db, "UPDATE colaboradores SET matricula = 'M-200' WHERE id = ?", [c]);
    const body = await ficha();
    assert.strictEqual(body.colaborador.matricula, 'M-200');
    assert.strictEqual(porId(body, nova.body.id).matricula, 'M-100');
  });

  for (const [rotulo, user] of [['PRODUCAO (fallback)', PRODUCAO], ['GESTOR', GESTOR]]) {
    await test(`[RN-183.06] ${rotulo} -> 403 literal na ficha, sem o aparelho no corpo`, async () => {
      setUser(user);
      const r = await request(app).get(`/api/almoxarifado/epi/ficha/${c}`);
      assert.strictEqual(r.status, 403, `${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, 'Sem permissão para esta operação');
      assert.strictEqual(r.body.acao, 'entregar_epi');
      assert.ok(!JSON.stringify(r.body).includes('Tablet-Almox'), 'o aparelho vazou no 403');
    });
  }

  for (const [rotulo, user] of [['ALMOXARIFE', ALMOXARIFE], ['ADMINISTRADOR', ADMIN]]) {
    await test(`[RN-183.06] ${rotulo} -> 200 com as chaves novas`, async () => {
      setUser(user);
      const e = porId(await ficha(), nova.body.id);
      assert.deepStrictEqual(Object.keys(e).sort(), CHAVES_FICHA);
      assert.strictEqual(e.user_agent, UA);
    });
  }

  await t.cleanup?.();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
