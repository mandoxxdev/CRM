/**
 * Etapa 55 — o próximo código de localização vem do servidor, conta as inativas e a tabela inteira;
 * o POST do assistente não reativa em silêncio; o PUT não estoura o UNIQUE nem reativa sem `ativo`.
 *
 * Plano: docs/superpowers/plans/2026-09-30-almoxarifado-etapa55-codigo-localizacao-servidor.md
 *
 * Executar: cd server && node tests/api/localizacaoProximoCodigo.api.test.js
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

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

(async () => {
  console.log('\n=== Etapa 55: proximo codigo de localizacao no servidor ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const loc = async (codigo, extra = {}) => (await dbRun(db, `INSERT INTO localizacoes_almoxarifado
      (codigo, descricao, setor, parent_id, ativo) VALUES (?,?,?,?,?)`,
  [codigo, codigo, extra.setor === undefined ? null : extra.setor, extra.parent || null, extra.ativo ?? 1])).lastID;
  const proximo = async (q) => {
    const r = await request(app).get('/api/almoxarifado/localizacoes/proximo-codigo').query(q);
    return r;
  };
  const cod = async (q) => { const r = await proximo(q); assert.strictEqual(r.status, 200, JSON.stringify(r.body)); return r.body.codigo; };
  const ativoDe = async (id) => (await dbGet(db, 'SELECT ativo FROM localizacoes_almoxarifado WHERE id = ?', [id])).ativo;

  await test('RN-01 raiz: conta a INATIVA — nao propoe o codigo de uma localizacao desativada', async () => {
    await loc('SON-01', { setor: 'Sonda A' }); await loc('SON-02', { setor: 'Sonda A', ativo: 0 });
    // Controle: pelo gerador de hoje (so ativas) a proposta seria SON-02, o da desativada.
    assert.strictEqual(await cod({ setor: 'Sonda A' }), 'SON-03');
    // Com BURACO: a inativa SON-05 empurra para 06. Sem este caso, contar so ativas passava verde —
    // o laco de colisao compensava quando a proxima era exatamente a desativada (Fase 3, sabotagem).
    await loc('SON-05', { setor: 'Sonda A', ativo: 0 });
    assert.strictEqual(await cod({ setor: 'Sonda A' }), 'SON-06');
  });

  await test('RN-01 prefixo configurado do setor ATIVO; setor inativo cai no derivado do nome', async () => {
    await dbRun(db, "INSERT INTO setores_almoxarifado (nome, codigo_prefixo, tipo) VALUES ('Setor Pref', 'ZP', 'area')");
    await dbRun(db, "INSERT INTO setores_almoxarifado (nome, codigo_prefixo, tipo, ativo) VALUES ('Setor Morto', 'QQ', 'area', 0)");
    assert.strictEqual(await cod({ setor: 'Setor Pref' }), 'ZP-01');
    assert.strictEqual(await cod({ setor: 'Setor Morto' }), 'SET-01');
    assert.strictEqual(await cod({ setor: 'Corredor K' }), 'K-01');
  });

  await test('RN-01 setor vazio: prefixo LOC, e soma raizes com setor NULL e ""', async () => {
    // O MAIOR esta na linha com setor NULL: casar so '' daria LOC-03 (livre), e o teste nao veria.
    await loc('LOC-07', { setor: null }); await loc('LOC-02', { setor: '' });
    assert.strictEqual(await cod({ setor: '' }), 'LOC-08');
    assert.strictEqual(await cod({}), 'LOC-08');
  });

  await test('RN-01 filha: prefixo do pai, conta filha inativa; sem filhas parte do numero do pai e PULA colisao', async () => {
    const P = await loc('FP-01', { setor: 'Fil' });
    await loc('FP-02', { setor: 'Fil' }); // raiz irmã do pai: o 1º filho de FP-01 seria FP-02
    assert.strictEqual(await cod({ parent_id: P }), 'FP-03');
    const F1 = await loc('FP-03', { parent: P, setor: 'Fil' }); await loc('FP-04', { parent: P, setor: 'Fil', ativo: 0 });
    assert.strictEqual(await cod({ parent_id: P }), 'FP-05');
    // Buraco nas filhas: a inativa FP-09 empurra para FP-10.
    await loc('FP-09', { parent: P, setor: 'Fil', ativo: 0 });
    assert.strictEqual(await cod({ parent_id: P }), 'FP-10');
    assert.ok(F1);
  });

  await test('RN-01 pai inexistente e pai inativo: 400 com a literal', async () => {
    let r = await proximo({ parent_id: 999999 });
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, 'Localização pai não encontrada');
    await loc('PIN-01', { ativo: 0 });
    const PI = (await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'PIN-01'")).id;
    r = await proximo({ parent_id: PI });
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, 'Localização pai PIN-01 está inativa');
  });

  await test('RN-01 colisao GLOBAL: outro setor com o mesmo prefixo ja usou o numero', async () => {
    await dbRun(db, "INSERT INTO setores_almoxarifado (nome, codigo_prefixo, tipo) VALUES ('Dup Um', 'DU', 'area'), ('Dup Dois', 'DU', 'area')");
    await loc('DU-01', { setor: 'Dup Um' });
    assert.strictEqual(await cod({ setor: 'Dup Dois' }), 'DU-02');
  });

  await test('RN-01 excluir_id: mover para o mesmo lugar nao renumera; numero longo cresce', async () => {
    const X = await loc('MOV-07', { setor: 'Mov' });
    assert.strictEqual(await cod({ setor: 'Mov', excluir_id: X }), 'MOV-01');
    await loc('MOV-99', { setor: 'Mov' });
    assert.strictEqual(await cod({ setor: 'Mov' }), 'MOV-100');
    // Sem excluir_id, MOV-07 conta como irmã e como colisão.
    const Y = await loc('MX-01', { setor: 'Mx' });
    assert.strictEqual(await cod({ setor: 'Mx', excluir_id: Y }), 'MX-01');
    assert.strictEqual(await cod({ setor: 'Mx' }), 'MX-02');
  });

  await test('RN-05 POST somente_novo com codigo de INATIVA: 409 e nada reativado; sem o campo, reativa (Etapa 19)', async () => {
    const I = await loc('RN5-01', { setor: 'R5', ativo: 0 });
    const r = await request(app).post('/api/almoxarifado/localizacoes').send({ codigo: 'RN5-01', setor: 'R5', somente_novo: true });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'O código RN5-01 pertence a uma localização desativada — gere outro código');
    assert.strictEqual(await ativoDe(I), 0);
    const novo = await request(app).post('/api/almoxarifado/localizacoes').send({ codigo: 'RN5-02', setor: 'R5', somente_novo: true });
    assert.strictEqual(novo.status, 201, JSON.stringify(novo.body));
    const reat = await request(app).post('/api/almoxarifado/localizacoes').send({ codigo: 'RN5-01', setor: 'R5' });
    assert.strictEqual(reat.status, 201); assert.strictEqual(reat.body.id, I);
  });

  await test('RN-02 PUT com codigo de outra: 400 (ativa e desativada), sem codigo: 400 — nunca 500', async () => {
    const A = await loc('PT-01', { setor: 'Pt' }); await loc('PT-02', { setor: 'Pt' }); await loc('PT-03', { setor: 'Pt', ativo: 0 });
    let r = await request(app).put(`/api/almoxarifado/localizacoes/${A}`).send({ codigo: 'PT-02', setor: 'Pt' });
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, 'Código já existe');
    r = await request(app).put(`/api/almoxarifado/localizacoes/${A}`).send({ codigo: 'PT-03', setor: 'Pt' });
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, 'Código já existe (localização desativada)');
    r = await request(app).put(`/api/almoxarifado/localizacoes/${A}`).send({ setor: 'Pt' });
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, 'Código obrigatório');
    // Metade positiva: o próprio código e um livre passam.
    r = await request(app).put(`/api/almoxarifado/localizacoes/${A}`).send({ codigo: 'PT-01', setor: 'Pt', descricao: 'x' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    r = await request(app).put(`/api/almoxarifado/localizacoes/${A}`).send({ codigo: 'PT-09', setor: 'Pt' });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.codigo, 'PT-09');
  });

  await test('RN-03 PUT sem ativo PRESERVA (inativa continua inativa); com ativo:1 reativa', async () => {
    const I = await loc('AT-01', { setor: 'At', ativo: 0 });
    let r = await request(app).put(`/api/almoxarifado/localizacoes/${I}`).send({ codigo: 'AT-01', setor: 'At', descricao: 'renomeada' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await ativoDe(I), 0);
    r = await request(app).put(`/api/almoxarifado/localizacoes/${I}`).send({ codigo: 'AT-01', setor: 'At', ativo: 1 });
    assert.strictEqual(r.status, 200); assert.strictEqual(await ativoDe(I), 1);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
