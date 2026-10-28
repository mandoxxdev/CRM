/**
 * Frota Etapa 8 — Fase 5 (revisao adversarial): os achados reproduzidos pelos revisores, travados aqui.
 *
 *   Fase5-A2  dois PUT /perfis-usuario simultaneos no mesmo usuario: a resposta da ULTIMA bate com o banco (fila por usuario)
 *   Fase5-A4  PUT /destinos com ativo null/'' mantem o status (a opcao vazia "Selecione..." desativava em silencio); fora de 0/1 -> 400
 *   Fase5-A5  condutor so de caractere invisivel/controle nao cumpre o "condutor obrigatorio"; quebra de linha vira espaco
 *   Fase5-B8  o 409 DESTINO_DUPLICADO devolve so { id, nome, endereco, ativo } — nao o criado_por de outra pessoa
 *   Fase5-B11 portas sem teste negativo na rota: Motorista/Consulta em PUT /veiculos (uso_funcionarios); Consulta em PUT/DELETE /destinos
 *
 * Plano: docs/superpowers/plans/2026-10-28-frotas-etapa8-admin-destinos-condutor.md (Fase 5)
 * Executar: cd server && node tests/api/frotasEtapa8Fase5.api.test.js
 */
const assert = require('assert');
const { createFrotasTestApp, ADMIN, MOTORISTA, CONSULTA } = require('../helpers/frotasTestApp');
const { dbRun, dbGet } = require('../../services/frotas/db');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

let ctx;
const S = {};
const gestor = (m, u, c) => ctx.como(ADMIN)(m, u, c);
const ana = (m, u, c) => ctx.como(MOTORISTA)(m, u, c);
const consulta = (m, u, c) => ctx.como(CONSULTA)(m, u, c);
const ITENS_OK = Object.fromEntries(['pneus_estepe', 'farois_lanternas', 'setas_luz_freio', 'parabrisa_vidros', 'espelhos_retrovisores',
  'limpadores_agua', 'oleo_motor', 'arrefecimento', 'freios', 'buzina_cintos', 'documentos_equipamentos', 'carroceria_carga']
  .map((k) => [k, 'OK']));

async function cenario() {
  await dbRun(ctx.db, `INSERT INTO usuarios (id, nome, email, ativo, role, is_superadmin, admin_modulos, is_oculto)
    VALUES (20, 'Gil', 'gil@x.com', 1, 'usuario', 0, '["almoxarifado"]', 0)`);
  S.v = (await gestor('post', '/api/frotas/veiculos', { placa: 'FAS5A01', km_atual: 100, uso_funcionarios: 1 })).body;
  const m = await gestor('post', '/api/frotas/motoristas', { nome: 'Ana Motorista', usuario_id: 2 });
  assert.strictEqual(m.status, 201, JSON.stringify(m.body));
}

test('Fase5-A2 dois PUT simultaneos (ADMIN_FROTA e CONSULTA): a resposta do que rodou por ultimo e o que o banco guarda', async () => {
  for (let rodada = 0; rodada < 5; rodada++) {
    const [a, b] = await Promise.all([
      gestor('put', '/api/frotas/perfis-usuario/20', { perfil: 'ADMIN_FROTA' }),
      gestor('put', '/api/frotas/perfis-usuario/20', { perfil: 'CONSULTA' }),
    ]);
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    assert.strictEqual(b.status, 200, JSON.stringify(b.body));
    const u = await dbGet(ctx.db, 'SELECT admin_modulos FROM usuarios WHERE id = 20');
    const l = await dbGet(ctx.db, 'SELECT perfil FROM perfil_frota_usuario WHERE usuario_id = 20');
    // a fila roda na ordem de chegada: o CONSULTA (segundo) vence, e o banco diz o mesmo que a resposta dele
    assert.strictEqual(b.body.perfil_efetivo, 'CONSULTA');
    assert.deepStrictEqual(JSON.parse(u.admin_modulos), ['almoxarifado'], `rodada ${rodada}: o banco ficou administrador`);
    assert.strictEqual(l.perfil, 'CONSULTA');
  }
});

test('Fase5-A4 PUT /destinos com ativo null ou "" mantem; "true", 2 -> 400; 0/1 continuam', async () => {
  const d = (await gestor('post', '/api/frotas/destinos', { nome: 'Fase5 Destino' })).body;
  for (const v of [null, '']) {
    const r = await gestor('put', `/api/frotas/destinos/${d.id}`, { nome: 'Fase5 Destino', ativo: v });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.ativo, 1, `ativo ${JSON.stringify(v)} desativou o destino`);
  }
  for (const v of ['true', 2, 'sim']) {
    const r = await gestor('put', `/api/frotas/destinos/${d.id}`, { ativo: v });
    assert.strictEqual(r.status, 400, `${JSON.stringify(v)} -> ${r.status}`);
    assert.strictEqual(r.body.error, 'Status inválido. Use 1 (ativo) ou 0 (desativado).');
  }
  assert.strictEqual((await gestor('put', `/api/frotas/destinos/${d.id}`, { ativo: '0' })).body.ativo, 0);
  assert.strictEqual((await gestor('put', `/api/frotas/destinos/${d.id}`, { ativo: 1 })).body.ativo, 1);
});

test('Fase5-A5 carro liberado: condutor so invisivel (U+200B, controle) -> 400; "Car\\nlos" grava "Car los"', async () => {
  const saida = (condutor) => ana('post', '/api/frotas/portal/registros', {
    tipo: 'saida', veiculo_id: S.v.id, km: 150, itens: ITENS_OK, condutor_nome: condutor,
  });
  for (const c of ['​', '\u0000\u0007', ' ‍ ﻿ ', '...']) {
    const r = await saida(c);
    assert.strictEqual(r.status, 400, `${JSON.stringify(c)} -> ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, 'Informe quem vai dirigir (condutor)');
  }
  const ok = await saida('Car\nlos   da  Silva');
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  assert.strictEqual(ok.body.viagem.condutor_nome, 'Car los da Silva');
});

test('Fase5-B8 o 409 DESTINO_DUPLICADO traz so id, nome, endereco e ativo do existente', async () => {
  await ana('post', '/api/frotas/destinos', { nome: 'Fase5 Dup', endereco: 'Rua X' });
  const r = await gestor('post', '/api/frotas/destinos', { nome: 'fase5 dup' });
  assert.strictEqual(r.status, 409);
  assert.deepStrictEqual(Object.keys(r.body.destino).sort(), ['ativo', 'endereco', 'id', 'nome']);
  assert.strictEqual(r.body.destino.nome, 'Fase5 Dup');
});

test('Fase5-B11 Motorista e Consulta nao ligam uso_funcionarios (PUT /veiculos 403); Consulta nao altera nem exclui destino', async () => {
  for (const quem of [ana, consulta]) {
    const r = await quem('put', `/api/frotas/veiculos/${S.v.id}`, { uso_funcionarios: 0 });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
  }
  assert.strictEqual((await dbGet(ctx.db, 'SELECT uso_funcionarios FROM frotas_veiculos WHERE id = ?', [S.v.id])).uso_funcionarios, 1);
  const d = (await gestor('post', '/api/frotas/destinos', { nome: 'Fase5 Consulta' })).body;
  assert.strictEqual((await consulta('put', `/api/frotas/destinos/${d.id}`, { nome: 'Outro' })).status, 403);
  assert.strictEqual((await consulta('delete', `/api/frotas/destinos/${d.id}`)).status, 403);
  assert.strictEqual((await dbGet(ctx.db, 'SELECT nome, ativo FROM frotas_destinos WHERE id = ?', [d.id])).ativo, 1);
});

(async () => {
  ctx = await createFrotasTestApp();
  await cenario();
  console.log('\nFrota Etapa 8 — Fase 5 (achados da revisao adversarial)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
