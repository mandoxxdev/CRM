/**
 * Etapa 183 (T4) — integracao da ficha de EPI com a matricula confirmada e o aparelho (RN-183.01..07).
 *
 * - Pela ROTA: entregar no "tablet" (multipart, PNG real, User-Agent proprio, matricula certa) -> ficha com os campos novos ->
 *   /verificar integro -> cadeia sem problemas (ler a ficha nao grava nada) -> PRODUCAO 403 na ficha.
 * - Pelo SERVICO: `fichaDoColaborador` = o corpo da rota (menos a assinatura temporaria do `arquivo_url`): a rota nao filtra nem
 *   acrescenta nada.
 * - Cruzando com o CLIENT (emenda I3, molde listasNotificacoesPortao.api.test.js:323-326): o teste Jest de fichaEpiPdf.test.js le a
 *   fixture versionada client/src/utils/__fixtures__/fichaEpi.rota.json. Aqui, SEMPRE, as chaves de cada entrega da fixture = as da
 *   resposta real, e os tipos de `confirmado_por_matricula` (number) e `user_agent` (string) — se o servidor renomear um campo, este
 *   teste cai sem ninguem lembrar de regravar. Com CRM_GRAVAR_FIXTURE=1 ele so regrava a fixture com o corpo real.
 *
 * Executar: cd server && node tests/api/epiFichaConfirmacaoIntegracao.api.test.js
 * Regravar: cd server && CRM_GRAVAR_FIXTURE=1 node tests/api/epiFichaConfirmacaoIntegracao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { wrapDatabase } = require('../../services/sqliteConcurrency');
const stockService = require('../../services/almoxarifado/stockService');
const epiService = require('../../services/almoxarifado/epiService');

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');
const FIXTURE = path.join(__dirname, '..', '..', '..', 'client', 'src', 'utils', '__fixtures__', 'fichaEpi.rota.json');
const GRAVAR = process.env.CRM_GRAVAR_FIXTURE === '1';

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${String(e && e.message).replace(/\s*\n\s*/g, ' ').slice(0, 800)}`);
  }
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const PRODUCAO = { id: 5, nome: 'Prod', role: 'user', email: 'prod@test.com' };
const UA = 'Tablet-Almox/2.1 (Android)';
const URL_ASSINADA = /^\/api\/uploads\/almoxarifado\/assinatura-epi-[^/?]+\.png\?exp=\d+&sig=[0-9a-f]+$/;

(async () => {
  const t = await createTestApp({ user: ADMIN });
  const { app, db, setUser } = t;
  wrapDatabase(db);

  const m = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, categoria, quantidade_atual, ativo, ca_numero, ca_validade)
    VALUES ('EPI-183I', 'Protetor auricular', 'EPIs', 0, 1, 'CA-1830', '2099-01-01')`)).lastID;
  await stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'ENTRADA', quantidade: 5, justificativa: 'carga' });
  const c = (await dbRun(db, "INSERT INTO colaboradores (nome, matricula, cpf, status, setor) VALUES ('MARIA SOUZA', 'M-100', '12345678909', 'ativo', 'Caldeiraria')")).lastID;

  let entregaId; let corpoRota; let ipGravado;

  await test('[RN-183.01] pela rota: entregar no tablet -> a ficha traz confirmado_por_matricula 1 e o aparelho do tablet', async () => {
    setUser(ADMIN);
    const ent = await request(app).post('/api/almoxarifado/epi/entregas').set('User-Agent', UA)
      .field('colaborador_id', String(c)).field('material_id', String(m)).field('quantidade', '1').field('motivo', 'PRIMEIRA_ENTREGA')
      .field('confirmacao_matricula', 'M-100')
      .attach('assinatura', PNG_1PX, { filename: 'a.png', contentType: 'image/png' });
    assert.strictEqual(ent.status, 201, JSON.stringify(ent.body));
    entregaId = ent.body.id;
    ipGravado = (await dbGet(db, "SELECT ip FROM evidencias_assinatura_almoxarifado WHERE contexto = 'ENTREGA_EPI' AND contexto_id = ?",
      [entregaId])).ip;
    const r = await request(app).get(`/api/almoxarifado/epi/ficha/${c}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    corpoRota = r.body;
    const e = corpoRota.entregas.find((x) => x.id === entregaId);
    assert.strictEqual(e.confirmado_por_matricula, 1);
    assert.strictEqual(e.user_agent, UA);
    assert.strictEqual(e.matricula, 'M-100');
  });

  await test('[RN-183.02] o IP gravado (conferido nao nulo) nao sai na ficha', async () => {
    assert.ok(ipGravado && String(ipGravado).length > 3, `ip da evidencia nao gravado: ${ipGravado}`);
    assert.ok(corpoRota, 'a ficha de cima nao veio');
    assert.ok(!JSON.stringify(corpoRota).includes(String(ipGravado)), `o IP ${ipGravado} vazou na ficha`);
  });

  await test('[RN-183.07] depois de ler a ficha: /verificar integro e a cadeia sem problemas', async () => {
    setUser(ADMIN);
    await request(app).get(`/api/almoxarifado/epi/ficha/${c}`);
    assert.deepStrictEqual((await request(app).get(`/api/almoxarifado/epi/entregas/${entregaId}/verificar`)).body, { integro: true });
    const cadeia = (await request(app).get('/api/almoxarifado/evidencias/cadeia/verificar')).body;
    assert.strictEqual(cadeia.integra, true, JSON.stringify(cadeia));
    assert.deepStrictEqual(cadeia.problemas, []);
  });

  await test('[RN-183.06] PRODUCAO -> 403 literal na ficha', async () => {
    setUser(PRODUCAO);
    const r = await request(app).get(`/api/almoxarifado/epi/ficha/${c}`);
    assert.strictEqual(r.status, 403, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, 'Sem permissão para esta operação');
    assert.strictEqual(r.body.acao, 'entregar_epi');
  });

  await test('[RN-183.01] pelo servico: fichaDoColaborador = o corpo da rota (menos a assinatura temporaria da URL)', async () => {
    setUser(ADMIN);
    const rota = (await request(app).get(`/api/almoxarifado/epi/ficha/${c}`)).body;
    const servico = await epiService.fichaDoColaborador(db, c);
    const semUrl = (f) => ({ ...f, entregas: f.entregas.map(({ arquivo_url: _u, ...resto }) => resto) });
    assert.deepStrictEqual(semUrl(JSON.parse(JSON.stringify(servico))), semUrl(rota));
    for (const f of [rota, servico]) for (const e of f.entregas) assert.match(e.arquivo_url, URL_ASSINADA);
    assert.strictEqual(servico.entregas[0].user_agent, UA);
  });

  await test('[RN-183.01, I3, integracao com o client] a fixture versionada do Jest tem as chaves e os tipos da resposta real e nao tem o IP', async () => {
    assert.ok(corpoRota, 'a ficha de cima nao veio');
    if (GRAVAR) {
      fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
      fs.writeFileSync(FIXTURE, `${JSON.stringify(corpoRota, null, 2)}\n`);
      console.log(`  (fixture regravada: ${FIXTURE})`);
    }
    assert.ok(fs.existsSync(FIXTURE), `fixture ausente: ${FIXTURE} (gere com CRM_GRAVAR_FIXTURE=1)`);
    const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    assert.ok(Array.isArray(fixture.entregas) && fixture.entregas.length > 0, 'fixture sem entregas');
    const chavesReais = Object.keys(corpoRota.entregas[0]).sort();
    for (const e of fixture.entregas) assert.deepStrictEqual(Object.keys(e).sort(), chavesReais, 'a fixture do client nao e o corpo do servidor');
    assert.deepStrictEqual(Object.keys(fixture.colaborador).sort(), Object.keys(corpoRota.colaborador).sort());
    const f0 = fixture.entregas[0];
    assert.strictEqual(typeof f0.confirmado_por_matricula, 'number', 'confirmado_por_matricula da fixture');
    assert.strictEqual(typeof f0.user_agent, 'string', 'user_agent da fixture');
    assert.ok(!JSON.stringify(fixture).includes(String(ipGravado)), 'a fixture tem o IP');
  });

  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
