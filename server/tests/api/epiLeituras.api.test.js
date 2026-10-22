/**
 * Etapa 178 (Fase 5, revisao adversarial — importante 5): as LEITURAS da entrega de EPI deixam de ser do portao do modulo.
 *
 * A ficha traz nome, matricula, setor, CPF mascarado e a URL da assinatura de cada colaborador; a lista, quem recebeu o que; a
 * lista aux, todos os colaboradores ativos com matricula — e a matricula passou a ser o que confirma a entrega (importante 4).
 * Com o portao do modulo, qualquer usuario do almoxarifado (PRODUCAO e o fallback de quem nao tem perfil) lia tudo. Agora as
 * cinco leituras exigem `entregar_epi` (ADMINISTRADOR, ALMOXARIFE) — a mesma acao da entrega.
 *
 * Declarado (letra D): a URL assinada da imagem (~15 min, a mesma de todas as imagens do modulo) continua abrindo sem sessao para
 * quem a tiver em maos.
 *
 * Executar: cd server && node tests/api/epiLeituras.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');
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
const SEM_ENTREGAR = [
  ['PRODUCAO (sem perfil, fallback)', { id: 5, nome: 'Prod', role: 'user', email: 'prod@test.com' }],
  ['COMPRAS', { id: 6, nome: 'Compras', role: 'user', email: 'c@test.com', perfil_almoxarifado: 'COMPRAS' }],
  ['GESTOR', { id: 7, nome: 'Gestor', role: 'user', email: 'g@test.com', perfil_almoxarifado: 'GESTOR' }],
  ['CONSULTA', { id: 8, nome: 'Consulta', role: 'user', email: 'q@test.com', perfil_almoxarifado: 'CONSULTA' }],
];

(async () => {
  const t = await createTestApp({ user: ADMIN });
  const { app, db, setUser } = t;
  wrapDatabase(db);
  const m = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, categoria, quantidade_atual, ativo, ca_numero, ca_validade)
    VALUES ('EPI-L-1', 'Mascara', 'EPIs', 0, 1, 'CA-3', '2099-01-01')`)).lastID;
  await stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'ENTRADA', quantidade: 5, justificativa: 'carga' });
  const c = (await dbRun(db, "INSERT INTO colaboradores (nome, matricula, cpf, status, setor) VALUES ('RUI', 'R-1', '11122233344', 'ativo', 'X')")).lastID;
  const ent = await request(app).post('/api/almoxarifado/epi/entregas')
    .field('colaborador_id', String(c)).field('material_id', String(m)).field('quantidade', '1').field('confirmacao_matricula', 'R-1')
    .attach('assinatura', PNG_1PX, { filename: 'a.png', contentType: 'image/png' });
  assert.strictEqual(ent.status, 201, JSON.stringify(ent.body));

  const LEITURAS = [
    '/api/almoxarifado/epi/entregas',
    `/api/almoxarifado/epi/entregas/${ent.body.id}/verificar`,
    `/api/almoxarifado/epi/ficha/${c}`,
    '/api/almoxarifado/epi/cadeia/verificar',
    '/api/almoxarifado/aux/colaboradores',
  ];

  for (const [rotulo, user] of SEM_ENTREGAR) {
    await test(`[F5-5] ${rotulo}: as cinco leituras -> 403, sem dado nenhum no corpo`, async () => {
      setUser(user);
      for (const url of LEITURAS) {
        const r = await request(app).get(url);
        assert.strictEqual(r.status, 403, `${url}: ${r.status} ${JSON.stringify(r.body)}`);
        assert.ok(!JSON.stringify(r.body).includes('RUI'), `${url} vazou o nome`);
        assert.ok(!JSON.stringify(r.body).includes('R-1'), `${url} vazou a matricula`);
      }
    });
  }

  for (const [rotulo, user] of [['ALMOXARIFE', ALMOXARIFE], ['ADMIN', ADMIN]]) {
    await test(`[F5-5] ${rotulo}: as cinco leituras -> 200`, async () => {
      setUser(user);
      for (const url of LEITURAS) {
        const r = await request(app).get(url);
        assert.strictEqual(r.status, 200, `${url}: ${r.status} ${JSON.stringify(r.body)}`);
      }
    });
  }

  console.log(`\nepiLeituras: ${passed} ok, ${failed} falha(s)`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
