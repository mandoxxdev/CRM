/**
 * Frotas Etapa 1 — Fase 5 (revisao adversarial): achados de autorizacao e de vinculo, reproduzidos e corrigidos.
 *
 *   RN-F1.20 / Fase5-8  perfil sem `aprovar_viagens` nao leva viagem a `aprovada` nem `cancelada` (POST e PUT /viagens) -> 403
 *   Fase5-9   vinculo usuario<->motorista sob concorrencia: indice unico parcial + 409 com o nome do motorista que ficou
 *   Fase5-10  motorista ligado a usuario DESATIVADO: salvar mantendo o mesmo usuario passa; trocar para inativo -> 400;
 *             /usuarios-vinculaveis devolve o ligado inativo com `ativo: false`
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa1-portal-do-motorista.md (secao "Fase 5")
 * Executar: cd server && node tests/api/frotasFase5Auth.api.test.js
 */
const assert = require('assert');
const { createFrotasTestApp, ADMIN, MOTORISTA } = require('../helpers/frotasTestApp');
const { dbRun, dbAll } = require('../../services/frotas/db');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

const MSG_RN20 = 'Só o gestor da frota pode aprovar ou cancelar viagem';

let ctx;
const S = {};
const como = (user, metodo, url, corpo) => ctx.como(user)(metodo, url, corpo);

async function cenario() {
  S.v1 = (await como(ADMIN, 'post', '/api/frotas/veiculos', { placa: 'AUT0001', km_atual: 100 })).body;
  S.ma = (await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Ana Motorista', usuario_id: 2 })).body;
  for (const [id, nome] of [[10, 'Carla'], [11, 'Davi'], [12, 'Edu']]) {
    await dbRun(ctx.db, 'INSERT INTO usuarios (id, nome, email, ativo, role) VALUES (?,?,?,1,?)', [id, nome, `${nome}@x.com`, 'usuario']);
  }
  assert(S.v1.id && S.ma.id);
}

// ── RN-F1.20 (Fase5-8) ──────────────────────────────────────────────────────────────────────
test('RN-F1.20 MOTORISTA: POST /viagens com status aprovada ou cancelada -> 403; sem status nasce solicitada', async () => {
  for (const status of ['aprovada', 'cancelada']) {
    const r = await como(MOTORISTA, 'post', '/api/frotas/viagens', { veiculo_id: S.v1.id, status });
    assert.strictEqual(r.status, 403, `${status}: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, MSG_RN20);
  }
  const ok = await como(MOTORISTA, 'post', '/api/frotas/viagens', { veiculo_id: S.v1.id, destino: 'Cliente' });
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  assert.strictEqual(ok.body.status, 'solicitada');
  assert.strictEqual(ok.body.aprovador_id, null);
  S.viagemAna = ok.body;
  const viagens = await dbAll(ctx.db, "SELECT id FROM frotas_viagens WHERE status IN ('aprovada', 'cancelada')");
  assert.strictEqual(viagens.length, 0, 'nada gravado pelos 403');
});

test('RN-F1.20 MOTORISTA: PUT /viagens/:id da propria viagem para aprovada ou cancelada -> 403; editar outro campo passa', async () => {
  for (const status of ['aprovada', 'cancelada']) {
    const r = await como(MOTORISTA, 'put', `/api/frotas/viagens/${S.viagemAna.id}`, { status });
    assert.strictEqual(r.status, 403, `${status}: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, MSG_RN20);
  }
  const ok = await como(MOTORISTA, 'put', `/api/frotas/viagens/${S.viagemAna.id}`, { status: 'solicitada', destino: 'Outro cliente' });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  assert.strictEqual(ok.body.status, 'solicitada');
  assert.strictEqual(ok.body.destino, 'Outro cliente');
});

test('RN-F1.20 o gestor aprova; o motorista edita a viagem ja aprovada mandando o mesmo status (o form manda tudo) e passa', async () => {
  assert.strictEqual((await como(ADMIN, 'post', `/api/frotas/viagens/${S.viagemAna.id}/aprovar`)).status, 200);
  const ok = await como(MOTORISTA, 'put', `/api/frotas/viagens/${S.viagemAna.id}`, { status: 'aprovada', finalidade: 'Entrega' });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  assert.strictEqual(ok.body.status, 'aprovada');
  const canc = await como(MOTORISTA, 'put', `/api/frotas/viagens/${S.viagemAna.id}`, { status: 'cancelada' });
  assert.strictEqual(canc.status, 403);
  const g = await como(ADMIN, 'put', `/api/frotas/viagens/${S.viagemAna.id}`, { status: 'cancelada' });
  assert.strictEqual(g.status, 200, 'o gestor cancela');
  assert.strictEqual(g.body.status, 'cancelada');
  const g2 = await como(ADMIN, 'post', '/api/frotas/viagens', { veiculo_id: S.v1.id, status: 'aprovada' });
  assert.strictEqual(g2.status, 201, 'o gestor cria ja aprovada');
});

// ── Fase5-9 ─────────────────────────────────────────────────────────────────────────────────
test('Fase5-9 seis POST /motoristas simultaneos com o mesmo usuario_id: um 201, cinco 409 com o nome de quem ficou', async () => {
  const rs = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => como(ADMIN, 'post', '/api/frotas/motoristas', { nome: `Corrida ${n}`, usuario_id: 10 })));
  const criados = rs.filter((r) => r.status === 201);
  assert.strictEqual(criados.length, 1, JSON.stringify(rs.map((r) => [r.status, r.body.error || r.body.nome])));
  const vencedor = criados[0].body.nome;
  for (const r of rs.filter((x) => x.status !== 201)) {
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Este usuário já está ligado ao motorista ${vencedor}`);
  }
  const ligados = await dbAll(ctx.db, 'SELECT id FROM frotas_motoristas WHERE usuario_id = 10 AND ativo = 1');
  assert.strictEqual(ligados.length, 1);
});

test('Fase5-9 dois PUT /motoristas simultaneos ligando o mesmo usuario: um 200, um 409', async () => {
  const a = (await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Sem vinculo A' })).body;
  const b = (await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Sem vinculo B' })).body;
  const rs = await Promise.all([a, b].map((m) => como(ADMIN, 'put', `/api/frotas/motoristas/${m.id}`, { usuario_id: 11 })));
  assert.deepStrictEqual(rs.map((r) => r.status).sort(), [200, 409], JSON.stringify(rs.map((r) => r.body)));
  const ok = rs.find((r) => r.status === 200).body;
  assert.strictEqual(rs.find((r) => r.status === 409).body.error, `Este usuário já está ligado ao motorista ${ok.nome}`);
  const ligados = await dbAll(ctx.db, 'SELECT id FROM frotas_motoristas WHERE usuario_id = 11 AND ativo = 1');
  assert.strictEqual(ligados.length, 1);
});

test('Fase5-9 o indice unico parcial existe e deixa o mesmo usuario em motorista INATIVO (excluido)', async () => {
  const idx = await dbAll(ctx.db, "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_frotas_motoristas_usuario_ativo'");
  assert.strictEqual(idx.length, 1);
  const m = (await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Vai sair', usuario_id: 12 })).body;
  assert.strictEqual((await como(ADMIN, 'delete', `/api/frotas/motoristas/${m.id}`)).status, 200);
  const novo = await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Entra no lugar', usuario_id: 12 });
  assert.strictEqual(novo.status, 201, JSON.stringify(novo.body));
});

test('Fase5-9 banco com usuario ja ligado a dois motoristas ativos: o initSchema loga e segue (o boot nao cai), sem o indice', async () => {
  const sqlite3 = require('sqlite3');
  const { initSchema } = require('../../services/frotas/schema');
  const db = new sqlite3.Database(':memory:');
  await initSchema(db);
  await dbRun(db, 'DROP INDEX idx_frotas_motoristas_usuario_ativo');
  await dbRun(db, "INSERT INTO frotas_motoristas (nome, usuario_id) VALUES ('Dup 1', 7), ('Dup 2', 7)");
  const erroOriginal = console.error;
  const logs = [];
  console.error = (...a) => logs.push(a.join(' '));
  try { await initSchema(db); } finally { console.error = erroOriginal; }
  assert(logs.some((l) => l.includes('indice unico do vinculo')), JSON.stringify(logs));
  const idx = await dbAll(db, "SELECT name FROM sqlite_master WHERE name = 'idx_frotas_motoristas_usuario_ativo'");
  assert.strictEqual(idx.length, 0);
  await new Promise((r) => db.close(r));
});

// ── Fase5-10 ────────────────────────────────────────────────────────────────────────────────
test('Fase5-10 motorista ligado a usuario desativado: salvar com o mesmo usuario passa; desvincular passa; religar ao inativo -> 400', async () => {
  const m = (await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Ligado ao inativo' })).body;
  await dbRun(ctx.db, 'UPDATE frotas_motoristas SET usuario_id = 5 WHERE id = ?', [m.id]); // ligado antes de o usuario 5 ser desativado
  const mesmo = await como(ADMIN, 'put', `/api/frotas/motoristas/${m.id}`, { nome: 'Ligado ao inativo (editado)', usuario_id: 5 });
  assert.strictEqual(mesmo.status, 200, JSON.stringify(mesmo.body));
  assert.strictEqual(mesmo.body.usuario_id, 5);
  const viz = await como(ADMIN, 'get', '/api/frotas/usuarios-vinculaveis');
  assert.strictEqual(viz.status, 200);
  const inativo = viz.body.find((u) => u.id === 5);
  assert(inativo, 'o usuario inativo ligado aparece');
  assert.strictEqual(inativo.ativo, false);
  assert.deepStrictEqual(inativo.motorista, { id: m.id, nome: 'Ligado ao inativo (editado)' });
  assert(viz.body.filter((u) => u.id !== 5).every((u) => u.ativo === true), 'os demais com ativo: true');
  const des = await como(ADMIN, 'put', `/api/frotas/motoristas/${m.id}`, { usuario_id: null });
  assert.strictEqual(des.status, 200);
  assert.strictEqual(des.body.usuario_id, null);
  const viz2 = await como(ADMIN, 'get', '/api/frotas/usuarios-vinculaveis');
  assert(!viz2.body.some((u) => u.id === 5), 'inativo sem vinculo nao aparece');
  const re = await como(ADMIN, 'put', `/api/frotas/motoristas/${m.id}`, { usuario_id: 5 });
  assert.strictEqual(re.status, 400);
  assert.strictEqual(re.body.error, 'Usuário não encontrado');
});

(async () => {
  ctx = await createFrotasTestApp();
  await cenario();
  console.log('\nFrotas Etapa 1 — Fase 5 (autorizacao e vinculo)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
