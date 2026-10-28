/**
 * Frotas Etapa 2 — T1: perfil do Frota pela tela (GET/PUT /api/frotas/perfis-usuario), perfil em /usuarios-vinculaveis e o C7.
 *
 *   RN-F2.01  GET lista ativos e nao ocultos, por nome, com explicito/efetivo/origem/motorista; so `configurar`
 *   RN-F2.02  regua unica (classificarPerfilFrota sobre getPerfilFromUser): forcado / admin_modulo (Etapa 8, RN-F8.01) / explicito / padrao
 *   RN-F2.03  PUT CONSULTA|MOTORISTA grava; null/'' apaga (padrao); o resto -> 400
 *   RN-F2.04  forcado -> 409 PERFIL_FORCADO, nada gravado
 *   RN-F2.05  inexistente/desativado/id torto -> 404
 *   RN-F2.07  linha ADMIN_FROTA sobrando num nao forcado: explicito, efetivo ADMIN_FROTA; o PUT troca
 *   RN-F2.08  /usuarios-vinculaveis traz perfil_frota (efetivo)
 *   RN-F2.11  lista negativa: CONSULTA nao grava no portal, nao aprova, nao abre perfis; MOTORISTA nao abre perfis
 *   RN-F2.12  (C7) MOTORISTA em GET /documentos -> []
 *   RN-F2.13  (Fase 2) o proprio perfil nao se muda por esta tela -> 409 PROPRIO_PERFIL
 *   C9        (Fase 2 T-2) conceder e revogar o admin do modulo apaga o Consulta — comportamento fixado, declarado na letra C
 *   Fase5-1   perfil com valor fora da lista (por SQL) le como MOTORISTA (escopo fechado), nao como gestor
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa2-perfis-pela-tela.md
 * Executar: cd server && node tests/api/frotasPerfis.api.test.js
 */
const assert = require('assert');
const { createFrotasTestApp, ADMIN, MOTORISTA, CONSULTA, MOTORISTA2 } = require('../helpers/frotasTestApp');
const { dbRun, dbGet } = require('../../services/frotas/db');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

// Etapa 8 (RN-F8.04/05): mensagens novas — o forcado e so superadmin/administrador do sistema; ADMIN_FROTA entrou na lista
const MSG_FORCADO = 'Este usuário é superadmin ou administrador do sistema e tem acesso total à frota. Isso não se altera por esta tela.';
const MSG_INVALIDO = 'Perfil inválido. Use CONSULTA, MOTORISTA, ADMIN_FROTA ou vazio para voltar ao padrão.';
const URL = '/api/frotas/perfis-usuario';

let ctx;
const S = {};
const como = (user, metodo, url, corpo) => ctx.como(user)(metodo, url, corpo);
const linha = (id) => dbGet(ctx.db, 'SELECT perfil FROM perfil_frota_usuario WHERE usuario_id = ?', [id]);
const listar = async () => {
  const r = await como(ADMIN, 'get', URL);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  return r.body;
};
const doUsuario = async (id) => (await listar()).usuarios.find((u) => u.id === id);

async function cenario() {
  // Usuarios so deste arquivo (a semente do harness e de todos): 6 admin do modulo, 7 oculto, 8 super, 9 admin de OUTRO modulo,
  // 10 com linha ADMIN_FROTA sobrando (RN-F2.07), 11 role 'Admin' (getPerfilFromUser compara 'admin' exato)
  const extra = [
    [6, 'Fabio AdminModulo', 'fabio@x.com', 1, 'usuario', 0, '["frota"]', 0],
    [7, 'Oculto', 'oculto@x.com', 1, 'usuario', 0, null, 1],
    [8, 'Super', 'super@x.com', 1, 'usuario', 1, null, 0],
    [9, 'Gil AdminAlmox', 'gil@x.com', 1, 'usuario', 0, '["almoxarifado"]', 0],
    [10, 'Helena Sobra', 'helena@x.com', 1, 'usuario', 0, '[]', 0],
    [11, 'Iris RoleMaiuscula', 'iris@x.com', 1, 'Admin', 0, null, 0],
    [12, 'Joao Minusculo', 'joao@x.com', 1, 'usuario', 0, null, 0],
  ];
  for (const u of extra) {
    await dbRun(ctx.db, `INSERT INTO usuarios (id, nome, email, ativo, role, is_superadmin, admin_modulos, is_oculto)
      VALUES (?,?,?,?,?,?,?,?)`, u);
  }
  await dbRun(ctx.db, "INSERT INTO perfil_frota_usuario (usuario_id, perfil) VALUES (3, 'CONSULTA')");
  await dbRun(ctx.db, "INSERT INTO perfil_frota_usuario (usuario_id, perfil) VALUES (6, 'ADMIN_FROTA')"); // o sync grava
  await dbRun(ctx.db, "INSERT INTO perfil_frota_usuario (usuario_id, perfil) VALUES (10, 'ADMIN_FROTA')");
  await dbRun(ctx.db, "INSERT INTO perfil_frota_usuario (usuario_id, perfil) VALUES (12, 'consulta')"); // gravado por SQL, caixa errada
  const m = await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Ana Motorista', usuario_id: 2 });
  assert.strictEqual(m.status, 201, JSON.stringify(m.body));
  S.ma = m.body;
  const v = await como(ADMIN, 'post', '/api/frotas/veiculos', { placa: 'PRF0001', km_atual: 100 });
  S.v = v.body;
  const d = await como(ADMIN, 'post', '/api/frotas/documentos', { veiculo_id: S.v.id, tipo: 'ipva', valor: 1234, data_vencimento: '2027-01-10' });
  assert.strictEqual(d.status, 201, JSON.stringify(d.body));
  S.doc = d.body;
  S.vi = (await como(ADMIN, 'post', '/api/frotas/viagens', { veiculo_id: S.v.id, motorista_id: S.ma.id, destino: 'X' })).body;
  await dbRun(ctx.db, "UPDATE frotas_viagens SET status = 'em_andamento' WHERE id = ?", [S.vi.id]); // a Ana esta com saida sem retorno
}

// ── RN-F2.01 / RN-F2.02 ─────────────────────────────────────────────────────
test('RN-F2.01 GET: perfis oferecidos, ativos e nao ocultos, por nome', async () => {
  const b = await listar();
  assert.deepStrictEqual(b.perfis, ['CONSULTA', 'MOTORISTA', 'ADMIN_FROTA'], 'Etapa 8 (RN-F8.05): ADMIN_FROTA entrou na lista');
  assert.deepStrictEqual(b.usuarios.map((u) => u.nome), [
    'Ana', 'Bruno', 'Consulta', 'Fabio AdminModulo', 'Gestor', 'Gil AdminAlmox', 'Helena Sobra', 'Iris RoleMaiuscula', 'Joao Minusculo', 'Super',
  ], 'Inativo (5) e Oculto (7) ficam fora');
  const ana = b.usuarios.find((u) => u.id === 2);
  assert.deepStrictEqual(Object.keys(ana).sort(), ['email', 'id', 'motorista', 'nome', 'origem', 'perfil_efetivo', 'perfil_explicito', 'viagem_aberta']);
  assert.strictEqual(ana.viagem_aberta, true, 'Fase 2 T-3: a Ana esta com saida sem retorno');
  assert.deepStrictEqual(ana.motorista, { id: S.ma.id, nome: 'Ana Motorista' });
  assert.strictEqual(b.usuarios.find((u) => u.id === 4).motorista, null);
  assert.strictEqual(b.usuarios.find((u) => u.id === 4).viagem_aberta, false);
});

test('RN-F2.02 a regua: forcado / admin_modulo / explicito / padrao para cada combinacao', async () => {
  const b = await listar();
  const v = (id) => { const u = b.usuarios.find((x) => x.id === id); return [u.perfil_explicito, u.perfil_efetivo, u.origem]; };
  assert.deepStrictEqual(v(1), [null, 'ADMIN_FROTA', 'forcado'], 'role admin');
  // Etapa 8 (RN-F8.01): dizia forcado; a spec 19 corrigiu — o admin do modulo e `admin_modulo` (a tela da e tira) e o explicito e
  // CALCULADO de admin_modulos (ajuste 20), nao lido da linha do sync
  assert.deepStrictEqual(v(6), ['ADMIN_FROTA', 'ADMIN_FROTA', 'admin_modulo'], 'admin do modulo (admin_modulos com frota)');
  assert.deepStrictEqual(v(8), [null, 'ADMIN_FROTA', 'forcado'], 'superadmin');
  assert.deepStrictEqual(v(2), [null, 'MOTORISTA', 'padrao'], 'sem linha');
  assert.deepStrictEqual(v(3), ['CONSULTA', 'CONSULTA', 'explicito']);
  assert.deepStrictEqual(v(9), [null, 'MOTORISTA', 'padrao'], 'admin de OUTRO modulo nao e admin da frota');
  assert.deepStrictEqual(v(10), ['ADMIN_FROTA', 'ADMIN_FROTA', 'explicito'], 'RN-F2.07 sobra');
  // Frota Etapa 3 (E5, RN-F3.12): ate a Etapa 2 o 'Admin' maiusculo saia [null, 'MOTORISTA', 'padrao'] aqui e ADMIN na tela; agora
  // o servidor ignora a caixa, como o nucleo (isSystemAdmin) e a tela (perfilFrota)
  assert.deepStrictEqual(v(11), [null, 'ADMIN_FROTA', 'forcado'], "role 'Admin' e administrador em qualquer caixa");
  assert.deepStrictEqual(v(12), ['consulta', 'consulta', 'explicito'], 'valor fora da lista aparece cru (Fase 2 achado 6)');
});

// ── RN-F2.03 ────────────────────────────────────────────────────────────────
test('RN-F2.03 PUT CONSULTA grava, responde o contrato e o GET reflete', async () => {
  const r = await como(ADMIN, 'put', `${URL}/2`, { perfil: 'CONSULTA' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body, { usuario_id: 2, perfil_explicito: 'CONSULTA', perfil_efetivo: 'CONSULTA', origem: 'explicito' });
  assert.deepStrictEqual(await linha(2), { perfil: 'CONSULTA' });
  const ana = await doUsuario(2);
  assert.deepStrictEqual([ana.perfil_explicito, ana.perfil_efetivo, ana.origem], ['CONSULTA', 'CONSULTA', 'explicito']);
});

test('RN-F2.03 PUT MOTORISTA grava explicito', async () => {
  const r = await como(ADMIN, 'put', `${URL}/2`, { perfil: 'MOTORISTA' });
  assert.deepStrictEqual(r.body, { usuario_id: 2, perfil_explicito: 'MOTORISTA', perfil_efetivo: 'MOTORISTA', origem: 'explicito' });
  assert.deepStrictEqual(await linha(2), { perfil: 'MOTORISTA' });
});

test("RN-F2.03 PUT null e '' apagam a linha (volta ao padrao)", async () => {
  for (const vazio of [null, '']) {
    await como(ADMIN, 'put', `${URL}/2`, { perfil: 'CONSULTA' });
    assert.ok(await linha(2), 'metade positiva: a linha existe antes');
    const r = await como(ADMIN, 'put', `${URL}/2`, { perfil: vazio });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, { usuario_id: 2, perfil_explicito: null, perfil_efetivo: 'MOTORISTA', origem: 'padrao' });
    assert.strictEqual(await linha(2), undefined, `perfil ${JSON.stringify(vazio)} apaga`);
  }
});

test('RN-F2.03 PUT com perfil fora da lista -> 400 literal e nada muda', async () => {
  await como(ADMIN, 'put', `${URL}/2`, { perfil: 'CONSULTA' });
  // Etapa 8 (RN-F8.05): { perfil: 'ADMIN_FROTA' } saiu desta lista — agora e valido (frotasPerfisAdmin.api.test.js)
  for (const corpo of [{ perfil: 'consulta' }, { perfil: 'GESTOR' }, {}, { perfil: 1 }]) {
    const r = await como(ADMIN, 'put', `${URL}/2`, corpo);
    assert.strictEqual(r.status, 400, `${JSON.stringify(corpo)} -> ${r.status}`);
    assert.strictEqual(r.body.error, MSG_INVALIDO);
  }
  assert.deepStrictEqual(await linha(2), { perfil: 'CONSULTA' }, 'nada gravado');
  await como(ADMIN, 'put', `${URL}/2`, { perfil: null });
});

// ── RN-F2.04 / RN-F2.05 ─────────────────────────────────────────────────────
test('RN-F2.04 forcado -> 409 PERFIL_FORCADO e nada e gravado', async () => {
  // Etapa 8 (RN-F8.01): dizia forcado para o 6 (admin do modulo); a spec 19 corrigiu — o 409 forcado e so para superadmin (8) e
  // role admin (1, 11). O 6 e `admin_modulo` e o PUT nele e coberto em frotasPerfisAdmin.api.test.js (RN-F8.03)
  for (const id of [1, 8, 11]) {
    const antes = await linha(id);
    const r = await como(ADMIN, 'put', `${URL}/${id}`, { perfil: 'CONSULTA' });
    assert.strictEqual(r.status, 409, `usuario ${id}: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, MSG_FORCADO);
    assert.strictEqual(r.body.code, 'PERFIL_FORCADO');
    assert.deepStrictEqual(await linha(id), antes, `usuario ${id}: linha intacta`);
  }
  const r = await como(ADMIN, 'put', `${URL}/1`, { perfil: null });
  assert.strictEqual(r.status, 409, 'voltar ao padrao tambem e recusado para o forcado');
  const r8 = await como(ADMIN, 'put', `${URL}/8`, { perfil: 'ADMIN_FROTA' });
  assert.strictEqual(r8.status, 409, 'ADMIN_FROTA num forcado tambem e recusado (ja tem tudo)');
  assert.strictEqual(r8.body.code, 'PERFIL_FORCADO');
});

test('RN-F2.04 ordem: perfil invalido num forcado da 400, nao 409', async () => {
  // Etapa 8: era { perfil: 'ADMIN_FROTA' }, que agora e valido; o invalido passou a ser GESTOR
  const r = await como(ADMIN, 'put', `${URL}/1`, { perfil: 'GESTOR' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.error, MSG_INVALIDO);
});

test('RN-F2.05 inexistente, desativado, oculto-mas-ativo e id torto', async () => {
  for (const id of ['5', '999', 'abc', '2.5', '0']) {
    const r = await como(ADMIN, 'put', `${URL}/${id}`, { perfil: 'CONSULTA' });
    assert.strictEqual(r.status, 404, `${id} -> ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, 'Usuário não encontrado');
  }
  assert.strictEqual(await linha(5), undefined, 'o desativado nao ganhou linha');
  // metade positiva do 404: o oculto ativo NAO e 404 (a lista o esconde, o PUT o aceita — como no almoxarifado)
  const ok = await como(ADMIN, 'put', `${URL}/7`, { perfil: 'CONSULTA' });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  await como(ADMIN, 'put', `${URL}/7`, { perfil: null });
});

// ── RN-F2.13 (Fase 2, achado 10) ────────────────────────────────────────────
test('RN-F2.13 quem e administrador pela linha sobrando nao muda o proprio perfil (409); muda o dos outros', async () => {
  const HELENA = { id: 10, nome: 'Helena Sobra', role: 'usuario', perfil_frota: 'ADMIN_FROTA' }; // como o enrich a montaria
  const r = await como(HELENA, 'put', `${URL}/10`, { perfil: 'CONSULTA' });
  assert.strictEqual(r.status, 409, JSON.stringify(r.body));
  assert.strictEqual(r.body.error, 'Você não pode mudar o seu próprio perfil por esta tela.');
  assert.strictEqual(r.body.code, 'PROPRIO_PERFIL');
  assert.deepStrictEqual(await linha(10), { perfil: 'ADMIN_FROTA' }, 'nada gravado');
  const outro = await como(HELENA, 'put', `${URL}/12`, { perfil: 'CONSULTA' });
  assert.strictEqual(outro.status, 200, 'metade positiva: ela da perfil aos outros');
  assert.deepStrictEqual(await linha(12), { perfil: 'CONSULTA' }, 'e o PUT corrige a caixa do valor gravado por SQL');
});

// ── Fase 2 T-2 (C9): o sync do cadastro de usuario apaga o Consulta ao conceder e revogar o admin do modulo ──
test('C9 conceder admin do modulo e revogar devolve a pessoa ao padrao (o Consulta se perde) — comportamento fixado', async () => {
  const { syncModuleAdminProfiles } = require('../../services/systemPermissions');
  await dbRun(ctx.db, `CREATE TABLE IF NOT EXISTS perfil_almoxarifado_usuario (usuario_id INTEGER PRIMARY KEY,
    perfil TEXT NOT NULL DEFAULT 'PRODUCAO', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`); // o sync mexe nas duas
  await como(ADMIN, 'put', `${URL}/4`, { perfil: 'CONSULTA' });
  assert.deepStrictEqual(await linha(4), { perfil: 'CONSULTA' });
  await syncModuleAdminProfiles(ctx.db, 4, '["frota"]');
  assert.deepStrictEqual(await linha(4), { perfil: 'ADMIN_FROTA' }, 'conceder troca a linha');
  await syncModuleAdminProfiles(ctx.db, 4, '[]');
  assert.strictEqual(await linha(4), undefined, 'revogar apaga a linha: nao volta ao Consulta');
  const bruno = await doUsuario(4);
  assert.deepStrictEqual([bruno.perfil_efetivo, bruno.origem], ['MOTORISTA', 'padrao']);
});

// ── RN-F2.07 ────────────────────────────────────────────────────────────────
test('RN-F2.07 a linha ADMIN_FROTA sobrando e trocada pelo PUT', async () => {
  const r = await como(ADMIN, 'put', `${URL}/10`, { perfil: 'CONSULTA' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body, { usuario_id: 10, perfil_explicito: 'CONSULTA', perfil_efetivo: 'CONSULTA', origem: 'explicito' });
  assert.deepStrictEqual(await linha(10), { perfil: 'CONSULTA' });
});

// ── RN-F2.08 ────────────────────────────────────────────────────────────────
test('RN-F2.08 /usuarios-vinculaveis traz perfil_frota efetivo', async () => {
  await como(ADMIN, 'put', `${URL}/4`, { perfil: 'CONSULTA' });
  const r = await como(ADMIN, 'get', '/api/frotas/usuarios-vinculaveis');
  assert.strictEqual(r.status, 200);
  const p = (id) => r.body.find((u) => u.id === id).perfil_frota;
  assert.strictEqual(p(1), 'ADMIN_FROTA');
  assert.strictEqual(p(2), 'MOTORISTA');
  assert.strictEqual(p(3), 'CONSULTA');
  assert.strictEqual(p(4), 'CONSULTA');
  assert.strictEqual(p(6), 'ADMIN_FROTA');
  assert.strictEqual(p(9), 'MOTORISTA');
  const ana = r.body.find((u) => u.id === 2);
  assert.deepStrictEqual(ana.motorista, { id: S.ma.id, nome: 'Ana Motorista' }, 'o resto do contrato da Etapa 1 nao muda');
  await como(ADMIN, 'put', `${URL}/4`, { perfil: null });
});

// ── RN-F2.11 lista negativa (controle positivo por CONCESSAO, ver o plano) ──
test('RN-F2.11 CONSULTA e MOTORISTA nao abrem nem gravam perfis (403 configurar)', async () => {
  for (const u of [CONSULTA, MOTORISTA, MOTORISTA2]) {
    const g = await como(u, 'get', URL);
    assert.strictEqual(g.status, 403, `${u.nome} abriu os perfis (configurar)`);
    assert.strictEqual(g.body.acao, 'configurar');
    const p = await como(u, 'put', `${URL}/4`, { perfil: 'CONSULTA' });
    assert.strictEqual(p.status, 403, `${u.nome} gravou perfil (configurar)`);
    assert.strictEqual(p.body.acao, 'configurar');
    assert.strictEqual(p.body.error, 'Sem permissão para esta operação');
  }
  assert.strictEqual(await linha(4), undefined, 'nada gravado');
});

test('RN-F2.11 CONSULTA nao grava no portal nem aprova viagem (e ve o painel)', async () => {
  const reg = await como(CONSULTA, 'post', '/api/frotas/portal/registros', { tipo: 'inspecao', veiculo_id: S.v.id, km: 200, itens: {} });
  assert.strictEqual(reg.status, 403, `CONSULTA gravou no portal (registrar_operacoes): ${reg.status} ${JSON.stringify(reg.body)}`);
  assert.strictEqual(reg.body.acao, 'registrar_operacoes');
  const ab = await como(CONSULTA, 'post', '/api/frotas/portal/abastecimentos', { veiculo_id: S.v.id, km: 200, litros: 10 });
  assert.strictEqual(ab.status, 403, `CONSULTA abasteceu pelo portal (registrar_operacoes): ${ab.status}`);
  assert.strictEqual(ab.body.acao, 'registrar_operacoes');
  const ap = await como(CONSULTA, 'post', `/api/frotas/viagens/${S.vi.id}/aprovar`);
  assert.strictEqual(ap.status, 403, `CONSULTA aprovou viagem (aprovar_viagens): ${ap.status}`);
  assert.strictEqual(ap.body.acao, 'aprovar_viagens');
  const nv = await como(CONSULTA, 'post', '/api/frotas/viagens', { veiculo_id: S.v.id, destino: 'Y' });
  assert.strictEqual(nv.status, 403, `CONSULTA criou viagem (registrar_operacoes): ${nv.status}`);
  assert.strictEqual(nv.body.acao, 'registrar_operacoes');
  // metade positiva: o que o CONSULTA PODE
  assert.strictEqual((await como(CONSULTA, 'get', '/api/frotas/dashboard')).status, 200);
  assert.strictEqual((await como(CONSULTA, 'get', '/api/frotas/relatorios/consumo')).status, 200);
});

// ── RN-F2.12 (C7) ───────────────────────────────────────────────────────────
test('RN-F2.12 MOTORISTA (ligado ou nao) le Documentos vazio; CONSULTA e ADMIN leem', async () => {
  for (const u of [MOTORISTA, MOTORISTA2]) {
    const r = await como(u, 'get', '/api/frotas/documentos');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, [], `${u.nome} ve documentos`);
    const v = await como(u, 'get', '/api/frotas/documentos?vencendo=1');
    assert.deepStrictEqual(v.body, [], `${u.nome} ve documentos vencendo`);
  }
  for (const u of [CONSULTA, ADMIN]) {
    const r = await como(u, 'get', '/api/frotas/documentos');
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.some((d) => d.id === S.doc.id && Number(d.valor) === 1234), `${u.nome} nao ve o documento`);
  }
});

// ── Fase5-1 (revisor com servidor real): perfil com valor fora da lista lia as listas de todos ──
test('Fase5-1 perfil fora da lista (consulta minusculo, por SQL) le como MOTORISTA, nao como gestor', async () => {
  const CRU = { id: 12, nome: 'Joao Minusculo', role: 'usuario', perfil_frota: 'consulta' }; // como o enrich monta da linha crua
  const docs = await como(CRU, 'get', '/api/frotas/documentos');
  assert.strictEqual(docs.status, 200);
  assert.deepStrictEqual(docs.body, [], 'valor cru via os documentos com valor');
  const mot = await como(CRU, 'get', '/api/frotas/motoristas');
  assert.deepStrictEqual(mot.body, [], 'valor cru via CPF/CNH de todos os motoristas');
  const via = await como(CRU, 'get', '/api/frotas/viagens');
  assert.deepStrictEqual(via.body, [], 'valor cru via as viagens de todos');
  assert.strictEqual((await como(CRU, 'get', `/api/frotas/motoristas/${S.ma.id}`)).status, 404);
  // metade positiva: o CONSULTA de verdade continua vendo tudo
  assert.ok((await como(CONSULTA, 'get', '/api/frotas/motoristas')).body.some((m) => m.id === S.ma.id));
  assert.ok((await como(CONSULTA, 'get', '/api/frotas/viagens')).body.length > 0);
});

(async () => {
  ctx = await createFrotasTestApp();
  await cenario();
  console.log('\nFrotas Etapa 2 — T1 (perfis pela tela, vinculaveis, C7)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
