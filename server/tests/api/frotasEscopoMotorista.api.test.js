/**
 * Frotas Etapa 1 — T3: vinculo usuario <-> motorista e o que o perfil MOTORISTA ve e altera (A6).
 *
 *   RN-F1.12  um motorista por usuario (entre os ativos); usuario inexistente/inativo -> 400 (F2-5); null desvincula (F2-4)
 *   F2-5      GET /usuarios-vinculaveis (gerenciar_motoristas)
 *   RN-F1.14  MOTORISTA so lista o que e dele; motoristas = so ele; GET /motoristas/:id de outro -> 404 (F2-2); sem vinculo, vazio
 *   RN-F1.15  MOTORISTA so altera (PUT) o que e dele -> 403
 *   RN-F1.19  MOTORISTA: POST/PUT de abastecimentos, viagens e checklists forcam motorista_id = o do vinculo; sem vinculo -> 409
 *   RN-F1.16  painel e alertas = ver_painel; multas e documentos = gerenciar_veiculos (antes do cache — F2-13)
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa1-portal-do-motorista.md
 * Executar: cd server && node tests/api/frotasEscopoMotorista.api.test.js
 */
const assert = require('assert');
const { createFrotasTestApp, ADMIN, MOTORISTA, CONSULTA, MOTORISTA2 } = require('../helpers/frotasTestApp');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

const SEM_VINCULO = { id: 99, nome: 'Sem vinculo', role: 'usuario' };
const MSG_VINCULO = 'Seu usuário não está ligado a um motorista. Peça ao gestor da frota para fazer o vínculo.';
const MSG_ALHEIO = 'Você só pode alterar os seus próprios registros';

let ctx;
const S = {}; // cenario

async function como(user, metodo, url, corpo) {
  ctx.setUser(user);
  return ctx.req(metodo, url, corpo);
}

async function cenario() {
  const v = await como(ADMIN, 'post', '/api/frotas/veiculos', { placa: 'ESC0001', km_atual: 100 });
  S.v = v.body;
  const ma = await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Ana Motorista', usuario_id: 2, cpf: '111' });
  assert.strictEqual(ma.status, 201, JSON.stringify(ma.body));
  S.ma = ma.body;
  const mb = await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Bruno Motorista', usuario_id: 4, cpf: '222' });
  S.mb = mb.body;
  const ab = async (mid, km) => (await como(ADMIN, 'post', '/api/frotas/abastecimentos', {
    veiculo_id: S.v.id, motorista_id: mid, data_abastecimento: '2026-10-10', litros: 10, valor_total: 60, km_abastecimento: km,
  })).body;
  S.abA = await ab(S.ma.id, 1000);
  S.abB = await ab(S.mb.id, 1100);
  S.viA = (await como(ADMIN, 'post', '/api/frotas/viagens', { veiculo_id: S.v.id, motorista_id: S.ma.id, destino: 'A' })).body;
  S.viB = (await como(ADMIN, 'post', '/api/frotas/viagens', { veiculo_id: S.v.id, motorista_id: S.mb.id, destino: 'B' })).body;
  S.chA = (await como(ADMIN, 'post', '/api/frotas/checklists', { veiculo_id: S.v.id, motorista_id: S.ma.id, data_checklist: '2026-10-10' })).body;
  S.chB = (await como(ADMIN, 'post', '/api/frotas/checklists', { veiculo_id: S.v.id, motorista_id: S.mb.id, data_checklist: '2026-10-10' })).body;
  S.muA = (await como(ADMIN, 'post', '/api/frotas/multas', { veiculo_id: S.v.id, motorista_id: S.ma.id, valor: 100 })).body;
  S.muB = (await como(ADMIN, 'post', '/api/frotas/multas', { veiculo_id: S.v.id, motorista_id: S.mb.id, valor: 200 })).body;
  S.manAdmin = (await como(ADMIN, 'post', '/api/frotas/manutencoes', { veiculo_id: S.v.id, descricao: 'troca de oleo' })).body;
  S.manAna = (await como(MOTORISTA, 'post', '/api/frotas/manutencoes', { veiculo_id: S.v.id, descricao: 'pneu furado' })).body;
  assert(S.manAna.id, JSON.stringify(S.manAna));
}

// ── RN-F1.12 / F2-4 / F2-5 ──────────────────────────────────────────────────────────────────
test('RN-F1.12 ligar o mesmo usuario a 2 motoristas -> 409 com o nome; no PUT tambem', async () => {
  assert.strictEqual(S.ma.usuario_id, 2);
  const r = await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Outro', usuario_id: 2 });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.body.error, 'Este usuário já está ligado ao motorista Ana Motorista');
  const p = await como(ADMIN, 'put', `/api/frotas/motoristas/${S.mb.id}`, { usuario_id: 2 });
  assert.strictEqual(p.status, 409);
  assert.strictEqual(p.body.error, 'Este usuário já está ligado ao motorista Ana Motorista');
  const mesmo = await como(ADMIN, 'put', `/api/frotas/motoristas/${S.ma.id}`, { usuario_id: 2, telefone: '9999' });
  assert.strictEqual(mesmo.status, 200, 'regravar o proprio vinculo nao conflita');
});

test('RN-F1.12 (F2-5) usuario inexistente ou inativo -> 400 "Usuário não encontrado"', async () => {
  const a = await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'X', usuario_id: 777 });
  assert.strictEqual(a.status, 400);
  assert.strictEqual(a.body.error, 'Usuário não encontrado');
  const b = await como(ADMIN, 'put', `/api/frotas/motoristas/${S.mb.id}`, { usuario_id: 5 });
  assert.strictEqual(b.status, 400);
  assert.strictEqual(b.body.error, 'Usuário não encontrado');
});

test('RN-F1.12 (F2-4) usuario_id null desvincula; motorista excluido nao segura o usuario', async () => {
  const c = await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Temporario', usuario_id: 3 });
  assert.strictEqual(c.status, 201);
  const d = await como(ADMIN, 'put', `/api/frotas/motoristas/${c.body.id}`, { usuario_id: null });
  assert.strictEqual(d.status, 200);
  assert.strictEqual(d.body.usuario_id, null);
  const sem = await como(ADMIN, 'put', `/api/frotas/motoristas/${c.body.id}`, { telefone: '1' });
  assert.strictEqual(sem.body.usuario_id, null, 'PUT sem usuario_id nao mexe no vinculo');
  const e = await como(ADMIN, 'put', `/api/frotas/motoristas/${c.body.id}`, { usuario_id: 3 });
  assert.strictEqual(e.body.usuario_id, 3);
  await como(ADMIN, 'delete', `/api/frotas/motoristas/${c.body.id}`);
  const f = await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Novo do 3', usuario_id: 3 });
  assert.strictEqual(f.status, 201, 'o excluido (ativo = 0) nao conta');
  await como(ADMIN, 'delete', `/api/frotas/motoristas/${f.body.id}`);
});

test('F2-5 GET /usuarios-vinculaveis: ativos por nome, com o motorista ligado; MOTORISTA -> 403', async () => {
  const r = await como(ADMIN, 'get', '/api/frotas/usuarios-vinculaveis');
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.map((u) => u.nome), ['Ana', 'Bruno', 'Consulta', 'Gestor'], 'o inativo fica fora');
  const ana = r.body.find((u) => u.id === 2);
  assert.deepStrictEqual(ana.motorista, { id: S.ma.id, nome: 'Ana Motorista' });
  assert.strictEqual(ana.email, 'ana@x.com');
  assert.strictEqual(r.body.find((u) => u.id === 1).motorista, null);
  const m = await como(MOTORISTA, 'get', '/api/frotas/usuarios-vinculaveis');
  assert.strictEqual(m.status, 403);
});

// ── RN-F1.14 ────────────────────────────────────────────────────────────────────────────────
test('RN-F1.14 MOTORISTA lista so o dele: abastecimentos, viagens, checklists, multas, manutencoes, motoristas', async () => {
  const ids = async (url) => (await como(MOTORISTA, 'get', url)).body.map((x) => x.id).sort();
  assert.deepStrictEqual(await ids('/api/frotas/abastecimentos'), [S.abA.id]);
  assert.deepStrictEqual(await ids('/api/frotas/viagens'), [S.viA.id]);
  assert.deepStrictEqual(await ids('/api/frotas/checklists'), [S.chA.id]);
  assert.deepStrictEqual(await ids('/api/frotas/multas'), [S.muA.id]);
  assert.deepStrictEqual(await ids('/api/frotas/manutencoes'), [S.manAna.id]);
  assert.deepStrictEqual(await ids('/api/frotas/motoristas'), [S.ma.id]);
  // o gestor e a consulta continuam vendo tudo
  for (const u of [ADMIN, CONSULTA]) {
    const ab = (await como(u, 'get', '/api/frotas/abastecimentos')).body.map((x) => x.id);
    assert(ab.includes(S.abA.id) && ab.includes(S.abB.id), `${u.nome} ve todos`);
    const mo = (await como(u, 'get', '/api/frotas/motoristas')).body.length;
    assert(mo >= 2);
  }
});

test('RN-F1.14 (F2-2) GET /motoristas/:id de outro -> 404; o proprio -> 200', async () => {
  const outro = await como(MOTORISTA, 'get', `/api/frotas/motoristas/${S.mb.id}`);
  assert.strictEqual(outro.status, 404);
  assert.strictEqual(outro.body.error, 'Não encontrado');
  assert(!JSON.stringify(outro.body).includes('222'), 'sem o CPF do colega');
  const proprio = await como(MOTORISTA, 'get', `/api/frotas/motoristas/${S.ma.id}`);
  assert.strictEqual(proprio.status, 200);
  const admin = await como(ADMIN, 'get', `/api/frotas/motoristas/${S.mb.id}`);
  assert.strictEqual(admin.status, 200);
});

test('RN-F1.14 MOTORISTA sem vinculo: as listas vem vazias', async () => {
  for (const url of ['abastecimentos', 'viagens', 'checklists', 'multas', 'manutencoes', 'motoristas']) {
    const r = await como(SEM_VINCULO, 'get', `/api/frotas/${url}`);
    assert.strictEqual(r.status, 200, url);
    assert.deepStrictEqual(r.body, [], url);
  }
});

// ── RN-F1.15 ────────────────────────────────────────────────────────────────────────────────
test('RN-F1.15 MOTORISTA altera o dele (200) e nao o alheio (403 literal) em abastecimentos, viagens e manutencoes', async () => {
  const alheios = [
    ['abastecimentos', S.abB.id, { observacoes: 'x' }],
    ['viagens', S.viB.id, { destino: 'x' }],
    ['manutencoes', S.manAdmin.id, { descricao: 'x' }],
  ];
  for (const [ent, id, corpo] of alheios) {
    const r = await como(MOTORISTA, 'put', `/api/frotas/${ent}/${id}`, corpo);
    assert.strictEqual(r.status, 403, ent);
    assert.strictEqual(r.body.error, MSG_ALHEIO, ent);
  }
  const lidoB = (await como(ADMIN, 'get', '/api/frotas/abastecimentos')).body.find((a) => a.id === S.abB.id);
  assert.strictEqual(lidoB.observacoes, null, 'o alheio ficou intacto');
  const proprios = [
    ['abastecimentos', S.abA.id, { observacoes: 'minha nota' }],
    ['viagens', S.viA.id, { destino: 'Obra nova' }],
    ['manutencoes', S.manAna.id, { descricao: 'pneu trocado' }],
  ];
  for (const [ent, id, corpo] of proprios) {
    const r = await como(MOTORISTA, 'put', `/api/frotas/${ent}/${id}`, corpo);
    assert.strictEqual(r.status, 200, `${ent}: ${JSON.stringify(r.body)}`);
  }
  const outroMot = await como(MOTORISTA2, 'put', `/api/frotas/abastecimentos/${S.abA.id}`, { observacoes: 'y' });
  assert.strictEqual(outroMot.status, 403);
});

// ── RN-F1.19 ────────────────────────────────────────────────────────────────────────────────
test('RN-F1.19 MOTORISTA: motorista_id do corpo e ignorado no POST e no PUT (abastecimento, viagem, checklist)', async () => {
  const ab = await como(MOTORISTA, 'post', '/api/frotas/abastecimentos', {
    veiculo_id: S.v.id, motorista_id: S.mb.id, data_abastecimento: '2026-10-11', litros: 5, km_abastecimento: 1200,
  });
  assert.strictEqual(ab.status, 201);
  assert.strictEqual(ab.body.motorista_id, S.ma.id);
  const vi = await como(MOTORISTA, 'post', '/api/frotas/viagens', { veiculo_id: S.v.id, motorista_id: S.mb.id });
  assert.strictEqual(vi.body.motorista_id, S.ma.id);
  const ch = await como(MOTORISTA, 'post', '/api/frotas/checklists', { veiculo_id: S.v.id, motorista_id: S.mb.id, data_checklist: '2026-10-11' });
  assert.strictEqual(ch.body.motorista_id, S.ma.id);
  // PUT do proprio tentando passar para o colega
  const p = await como(MOTORISTA, 'put', `/api/frotas/abastecimentos/${S.abA.id}`, { motorista_id: S.mb.id });
  assert.strictEqual(p.status, 200);
  assert.strictEqual(p.body.motorista_id, S.ma.id);
  const pv = await como(MOTORISTA, 'put', `/api/frotas/viagens/${S.viA.id}`, { motorista_id: S.mb.id });
  assert.strictEqual(pv.body.motorista_id, S.ma.id);
  // o gestor escolhe
  const g = await como(ADMIN, 'post', '/api/frotas/viagens', { veiculo_id: S.v.id, motorista_id: S.mb.id });
  assert.strictEqual(g.body.motorista_id, S.mb.id);
});

test('RN-F1.19 MOTORISTA sem vinculo: POST/PUT de abastecimento, viagem e checklist -> 409 MOTORISTA_NAO_VINCULADO', async () => {
  const casos = [
    ['post', '/api/frotas/abastecimentos', { veiculo_id: S.v.id, data_abastecimento: '2026-10-11', litros: 5 }],
    ['post', '/api/frotas/viagens', { veiculo_id: S.v.id }],
    ['post', '/api/frotas/checklists', { veiculo_id: S.v.id, data_checklist: '2026-10-11' }],
    ['put', `/api/frotas/abastecimentos/${S.abA.id}`, { observacoes: 'z' }],
    ['put', `/api/frotas/viagens/${S.viA.id}`, { destino: 'z' }],
  ];
  for (const [m, url, corpo] of casos) {
    const r = await como(SEM_VINCULO, m, url, corpo);
    assert.strictEqual(r.status, 409, `${m} ${url}: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, MSG_VINCULO);
    assert.strictEqual(r.body.code, 'MOTORISTA_NAO_VINCULADO');
  }
});

// ── RN-F1.16 ────────────────────────────────────────────────────────────────────────────────
test('RN-F1.16 /dashboard e /alertas: MOTORISTA 403 (mesmo com o painel no cache); CONSULTA e ADMIN 200', async () => {
  const a = await como(ADMIN, 'get', '/api/frotas/dashboard');
  assert.strictEqual(a.status, 200);
  const m = await como(MOTORISTA, 'get', '/api/frotas/dashboard');
  assert.strictEqual(m.status, 403);
  assert.strictEqual(m.body.error, 'Sem permissão para esta operação');
  assert.strictEqual(m.body.custoTotal, undefined, 'o cache nao vazou');
  assert.strictEqual((await como(MOTORISTA, 'get', '/api/frotas/alertas')).status, 403);
  assert.strictEqual((await como(CONSULTA, 'get', '/api/frotas/dashboard')).status, 200);
  assert.strictEqual((await como(CONSULTA, 'get', '/api/frotas/alertas')).status, 200);
});

test('RN-F1.16 multas e documentos: MOTORISTA nao cria nem altera (403); ADMIN sim', async () => {
  const casos = [
    ['post', '/api/frotas/multas', { veiculo_id: S.v.id }],
    ['put', `/api/frotas/multas/${S.muA.id}`, { valor: 1 }],
    ['post', '/api/frotas/documentos', { veiculo_id: S.v.id, tipo: 'ipva' }],
  ];
  for (const [m, url, corpo] of casos) {
    const r = await como(MOTORISTA, m, url, corpo);
    assert.strictEqual(r.status, 403, `${m} ${url}`);
  }
  const doc = await como(ADMIN, 'post', '/api/frotas/documentos', { veiculo_id: S.v.id, tipo: 'ipva' });
  assert.strictEqual(doc.status, 201);
  assert.strictEqual((await como(MOTORISTA, 'put', `/api/frotas/documentos/${doc.body.id}`, { valor: 1 })).status, 403);
  assert.strictEqual((await como(ADMIN, 'put', `/api/frotas/multas/${S.muA.id}`, { valor: 150 })).status, 200);
});

(async () => {
  ctx = await createFrotasTestApp();
  await cenario();
  console.log('\nFrotas Etapa 1 — T3 (vinculo e escopo do motorista)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
