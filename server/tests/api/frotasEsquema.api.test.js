/**
 * Frotas Etapa 1 — T1: o tronco do portal do motorista.
 *
 *   T1.a  o harness sobe o registrador real (`routes/frotas.js`) e espera o schema
 *   T1.b  as colunas novas (migracao aditiva): frotas_checklists (8), frotas_viagens.origem, frotas_abastecimentos.km_desde_anterior
 *   RN-F1.01  ITENS_CHECKLIST = os 12 do papel, em ordem; respostas OK/NA/FALHA; listas de avaria e combustivel no /meta
 *   RN-F1.02  situacaoDoRegistro com itens: PENDENCIA (falha ou avaria) > INCOMPLETO (falta item) > OK
 *   F2-7      situacaoDoRegistro sem itens (rota antiga): os 7 *_ok
 *   T1.c  ACAO_PERFIS.ver_painel = ADMIN_FROTA e CONSULTA
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa1-portal-do-motorista.md
 * Executar: cd server && node tests/api/frotasEsquema.api.test.js
 */
const assert = require('assert');
const { createFrotasTestApp, ADMIN, MOTORISTA, CONSULTA } = require('../helpers/frotasTestApp');
const { dbAll } = require('../../services/frotas/db');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

const CHAVES = ['pneus_estepe', 'farois_lanternas', 'setas_luz_freio', 'parabrisa_vidros', 'espelhos_retrovisores',
  'limpadores_agua', 'oleo_motor', 'arrefecimento', 'freios', 'buzina_cintos', 'documentos_equipamentos', 'carroceria_carga'];
const todosOk = () => Object.fromEntries(CHAVES.map((k) => [k, 'OK']));

let ctx;

test('T1.a harness sobe o registrador real e o /meta responde 200', async () => {
  ctx.setUser(ADMIN);
  const r = await ctx.req('get', '/api/frotas/meta');
  assert.strictEqual(r.status, 200);
  ctx.setUser(null);
  const s = await ctx.req('get', '/api/frotas/meta');
  assert.strictEqual(s.status, 401, 'sem usuario o stub responde 401');
});

test('T1.b colunas novas existem', async () => {
  const cols = async (t) => (await dbAll(ctx.db, `PRAGMA table_info(${t})`)).map((c) => c.name);
  const ch = await cols('frotas_checklists');
  for (const c of ['tipo_registro', 'km', 'horario', 'nivel_combustivel', 'itens_json', 'avarias_json', 'status_geral', 'viagem_id']) {
    assert(ch.includes(c), `frotas_checklists.${c}`);
  }
  assert((await cols('frotas_viagens')).includes('origem'));
  assert((await cols('frotas_abastecimentos')).includes('km_desde_anterior'));
});

// Frota Etapa 8 (T1) — plano docs/superpowers/plans/2026-10-28-frotas-etapa8-admin-destinos-condutor.md
test('RN-F8.15/16 colunas da Etapa 8: veiculos.uso_funcionarios (padrao 0), viagens.condutor_nome e destino_id; ORIGEM_PADRAO no /meta', async () => {
  const cols = async (t) => (await dbAll(ctx.db, `PRAGMA table_info(${t})`)).map((c) => c.name);
  assert((await cols('frotas_veiculos')).includes('uso_funcionarios'), 'frotas_veiculos.uso_funcionarios');
  const vi = await cols('frotas_viagens');
  assert(vi.includes('condutor_nome'), 'frotas_viagens.condutor_nome');
  assert(vi.includes('destino_id'), 'frotas_viagens.destino_id');
  ctx.setUser(ADMIN);
  const v = await ctx.req('post', '/api/frotas/veiculos', { placa: 'ESQ8A01' });
  assert.strictEqual(v.status, 201, JSON.stringify(v.body));
  const linha = (await dbAll(ctx.db, 'SELECT uso_funcionarios FROM frotas_veiculos WHERE id = ?', [v.body.id]))[0];
  assert.strictEqual(linha.uso_funcionarios, 0, 'o padrao da coluna e 0');
  const schema = require('../../services/frotas/schema');
  assert.strictEqual(schema.ORIGEM_PADRAO, 'GMP');
  const meta = await ctx.req('get', '/api/frotas/meta');
  assert.strictEqual(meta.body.origemPadrao, 'GMP');
});

test('RN-F8.26 frotas_destinos existe e o indice parcial recusa dois ativos com o mesmo nome (sem distinguir caixa); desativado libera', async () => {
  const cols = (await dbAll(ctx.db, 'PRAGMA table_info(frotas_destinos)')).map((c) => c.name);
  for (const c of ['id', 'nome', 'endereco', 'ativo', 'criado_por_id', 'criado_por_nome', 'created_at', 'updated_at']) {
    assert(cols.includes(c), `frotas_destinos.${c}`);
  }
  const idx = await dbAll(ctx.db, 'PRAGMA index_list(frotas_destinos)');
  const unico = idx.find((i) => i.name === 'ux_frotas_destinos_nome_ativo');
  assert(unico, 'indice ux_frotas_destinos_nome_ativo');
  assert.strictEqual(unico.unique, 1);
  assert.strictEqual(unico.partial, 1, 'o indice e parcial (WHERE ativo = 1)');
  const { dbRun } = require('../../services/frotas/db');
  await dbRun(ctx.db, "INSERT INTO frotas_destinos (nome) VALUES ('Cliente Alfa')");
  await assert.rejects(dbRun(ctx.db, "INSERT INTO frotas_destinos (nome) VALUES ('cliente alfa')"),
    (e) => /UNIQUE constraint failed: frotas_destinos\.nome/.test(e.message), 'o segundo ativo com o mesmo nome cai no indice');
  await dbRun(ctx.db, "UPDATE frotas_destinos SET ativo = 0 WHERE nome = 'Cliente Alfa'");
  await dbRun(ctx.db, "INSERT INTO frotas_destinos (nome) VALUES ('cliente alfa')"); // desativado liberou o nome
  await assert.rejects(dbRun(ctx.db, "UPDATE frotas_destinos SET ativo = 1 WHERE nome = 'Cliente Alfa'"),
    (e) => /UNIQUE constraint failed: frotas_destinos\.nome/.test(e.message), 'reativar com outro ativo igual tambem cai');
});

test('RN-F1.01 ITENS_CHECKLIST tem os 12 do papel em ordem, e o /meta expoe as listas', async () => {
  const schema = require('../../services/frotas/schema');
  assert.deepStrictEqual(schema.ITENS_CHECKLIST.map((i) => i.chave), CHAVES);
  assert.strictEqual(schema.ITENS_CHECKLIST[0].rotulo, 'Pneus e estepe');
  assert.strictEqual(schema.ITENS_CHECKLIST[11].rotulo, 'Carroceria / amarração da carga');
  assert.deepStrictEqual(schema.RESPOSTAS_ITEM, ['OK', 'NA', 'FALHA']);
  ctx.setUser(MOTORISTA);
  const r = await ctx.req('get', '/api/frotas/meta');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.itensChecklist.length, 12);
  assert.deepStrictEqual(r.body.vistasAvaria, ['lateral_esquerda', 'lateral_direita', 'superior', 'frente', 'traseira']);
  assert.deepStrictEqual(r.body.tiposAvaria, ['R', 'A', 'T', 'Q', 'O']);
  assert.deepStrictEqual(r.body.niveisCombustivel, ['vazio', '1/4', '1/2', '3/4', 'cheio']);
});

test('RN-F1.02 situacao com itens: 12 OK = OK; 11 OK = INCOMPLETO; FALHA = PENDENCIA; avaria = PENDENCIA; NA conta como respondido', async () => {
  const { situacaoDoRegistro } = require('../../services/frotas/schema');
  assert.strictEqual(situacaoDoRegistro({ itens: todosOk(), avarias: [] }), 'OK');
  const onze = todosOk(); delete onze.freios;
  assert.strictEqual(situacaoDoRegistro({ itens: onze, avarias: [] }), 'INCOMPLETO');
  assert.strictEqual(situacaoDoRegistro({ itens: { ...todosOk(), pneus_estepe: 'FALHA' } }), 'PENDENCIA');
  assert.strictEqual(situacaoDoRegistro({ itens: todosOk(), avarias: [{ vista: 'frente', tipo: 'R' }] }), 'PENDENCIA');
  assert.strictEqual(situacaoDoRegistro({ itens: onze, avarias: [{ vista: 'frente', tipo: 'R' }] }), 'PENDENCIA', 'pendencia vence incompleto');
  assert.strictEqual(situacaoDoRegistro({ itens: { ...todosOk(), freios: 'NA' } }), 'OK');
  assert.strictEqual(situacaoDoRegistro({ itens: {} }), 'INCOMPLETO');
});

test('F2-7 situacao sem itens (rota antiga): algum *_ok = 0 -> PENDENCIA; os 7 = 1 -> OK; algum ausente -> INCOMPLETO', async () => {
  const { situacaoDoRegistro } = require('../../services/frotas/schema');
  const sete = { pneus_ok: 1, oleo_ok: 1, luzes_ok: 1, freios_ok: 1, extintor_ok: 1, documentos_ok: 1, limpeza_ok: 1 };
  assert.strictEqual(situacaoDoRegistro({ legados: sete }), 'OK');
  assert.strictEqual(situacaoDoRegistro({ legados: { ...sete, freios_ok: 0 } }), 'PENDENCIA');
  assert.strictEqual(situacaoDoRegistro({ legados: { freios_ok: false } }), 'PENDENCIA');
  const seis = { ...sete }; delete seis.limpeza_ok;
  assert.strictEqual(situacaoDoRegistro({ legados: seis }), 'INCOMPLETO');
  assert.strictEqual(situacaoDoRegistro({ legados: {} }), 'INCOMPLETO');
  // B22: avaria e "Nao conforme" tambem na rota antiga (a coluna Avarias da planilha) — antes saia OK, sem alerta
  assert.strictEqual(situacaoDoRegistro({ legados: sete, avarias: [{ vista: 'frente', tipo: 'R' }] }), 'PENDENCIA');
  assert.strictEqual(situacaoDoRegistro({ legados: sete, avarias: [] }), 'OK');
});

test('T1.c ver_painel = ADMIN_FROTA e CONSULTA (MOTORISTA nao)', async () => {
  const { can, ACAO_PERFIS } = require('../../services/frotas/permissions');
  assert.deepStrictEqual(ACAO_PERFIS.ver_painel, ['ADMIN_FROTA', 'CONSULTA']);
  assert.strictEqual(can(ADMIN, 'ver_painel'), true);
  assert.strictEqual(can(CONSULTA, 'ver_painel'), true);
  assert.strictEqual(can(MOTORISTA, 'ver_painel'), false);
});

(async () => {
  ctx = await createFrotasTestApp();
  console.log('\nFrotas Etapa 1 — T1 (esquema e harness)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
