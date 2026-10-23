/**
 * Frotas Etapa 1 — T2: km/L pela ordem do km (A1, A2), checklist antigo sem itens (A3), aprovar so solicitada (A4),
 * km do retorno no PUT (A5) e uma viagem em andamento por veiculo/motorista (F2-10).
 *
 *   RN-F1.11  km/L = (km - km do anterior EM KM) / litros; guarda km_desde_anterior; criar/editar/excluir recalcula o seguinte
 *   RN-F1.03  POST /checklists sem itens: item ausente nao vale OK (F2-7)
 *   RN-F1.17  aprovar so viagem solicitada
 *   RN-F1.07  PUT /viagens com km_retorno < km_saida -> 400
 *   RN-F1.05 / F2-10  POST/PUT /viagens que levam a em_andamento respeitam "uma por veiculo e uma por motorista"
 *   F2-9      o gestor fecha a viagem orfa pelo PUT
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa1-portal-do-motorista.md
 * Executar: cd server && node tests/api/frotasConsumoViagem.api.test.js
 */
const assert = require('assert');
const { createFrotasTestApp, ADMIN } = require('../helpers/frotasTestApp');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

let ctx;
let placaSeq = 0;
async function veiculo(km = 0) {
  placaSeq += 1;
  const r = await ctx.req('post', '/api/frotas/veiculos', { placa: `TST${String(placaSeq).padStart(4, '0')}`, km_atual: km });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
async function abastecer(veiculoId, km, litros, data = '2026-10-01', extra = {}) {
  const r = await ctx.req('post', '/api/frotas/abastecimentos', {
    veiculo_id: veiculoId, data_abastecimento: data, litros, valor_total: litros * 6, km_abastecimento: km, ...extra,
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
async function abast(id) {
  const r = await ctx.req('get', '/api/frotas/abastecimentos');
  return r.body.find((a) => a.id === id);
}
async function motorista(nome) {
  const r = await ctx.req('post', '/api/frotas/motoristas', { nome });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

// ── RN-F1.11 ────────────────────────────────────────────────────────────────────────────────
test('RN-F1.11 o primeiro nao tem km/L; o segundo = (1500-1000)/40 = 12.5 e km_desde_anterior = 500 (no GET)', async () => {
  const v = await veiculo(1000);
  const a1 = await abastecer(v.id, 1000, 40, '2026-10-01');
  const a2 = await abastecer(v.id, 1500, 40, '2026-10-05');
  assert.strictEqual(a1.consumo_medio, null);
  assert.strictEqual(a1.km_desde_anterior, null);
  assert.strictEqual(a2.consumo_medio, 12.5);
  assert.strictEqual(a2.km_desde_anterior, 500);
  const lido = await abast(a2.id);
  assert.strictEqual(lido.km_desde_anterior, 500, 'GET /abastecimentos traz km_desde_anterior');
});

test('RN-F1.11 (A1) retroativo: o anterior e o de km menor, nao o de data mais nova; e o seguinte e recalculado', async () => {
  const v = await veiculo(1000);
  await abastecer(v.id, 1000, 40, '2026-10-01');
  const a2 = await abastecer(v.id, 1500, 40, '2026-10-05');
  // lancado depois, com data anterior a do a2, km entre os dois
  const r = await abastecer(v.id, 1200, 20, '2026-10-03');
  assert.strictEqual(r.km_desde_anterior, 200);
  assert.strictEqual(r.consumo_medio, 10);
  const depois = await abast(a2.id);
  assert.strictEqual(depois.km_desde_anterior, 300, 'o seguinte em km passa a contar do retroativo');
  assert.strictEqual(depois.consumo_medio, 7.5);
  // data mais nova, km menor: o anterior continua sendo o de km menor
  const v2 = await veiculo(0);
  await abastecer(v2.id, 5000, 50, '2026-09-01');
  const x = await abastecer(v2.id, 4000, 50, '2026-10-20');
  assert.strictEqual(x.consumo_medio, null, 'nenhum abastecimento com km menor que 4000');
  const y = (await ctx.req('get', '/api/frotas/abastecimentos')).body.find((a) => a.veiculo_id === v2.id && a.km_abastecimento === 5000);
  assert.strictEqual(y.km_desde_anterior, 1000);
  assert.strictEqual(y.consumo_medio, 20);
});

test('RN-F1.11 (A2) editar so a observacao mantem o km/L', async () => {
  const v = await veiculo(1000);
  await abastecer(v.id, 1000, 40, '2026-10-01');
  const a2 = await abastecer(v.id, 1500, 40, '2026-10-05');
  const r = await ctx.req('put', `/api/frotas/abastecimentos/${a2.id}`, { observacoes: 'nota fiscal 123' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.consumo_medio, 12.5);
  assert.strictEqual(r.body.km_desde_anterior, 500);
  assert.strictEqual(r.body.observacoes, 'nota fiscal 123');
});

test('RN-F1.11 excluir o do meio recalcula o seguinte', async () => {
  const v = await veiculo(1000);
  await abastecer(v.id, 1000, 40);
  const meio = await abastecer(v.id, 1200, 20);
  const ult = await abastecer(v.id, 1500, 40);
  assert.strictEqual((await abast(ult.id)).consumo_medio, 7.5);
  const d = await ctx.req('delete', `/api/frotas/abastecimentos/${meio.id}`);
  assert.strictEqual(d.status, 200);
  const depois = await abast(ult.id);
  assert.strictEqual(depois.km_desde_anterior, 500);
  assert.strictEqual(depois.consumo_medio, 12.5);
});

test('RN-F1.11 (F2-8) PUT que muda o km recalcula o seguinte da posicao antiga e o da nova', async () => {
  const v = await veiculo(1000);
  await abastecer(v.id, 1000, 40);
  const meio = await abastecer(v.id, 1200, 20);
  const b = await abastecer(v.id, 1500, 40);
  const c = await abastecer(v.id, 2000, 50);
  // move o "meio" para depois do b: 1200 -> 1800
  const r = await ctx.req('put', `/api/frotas/abastecimentos/${meio.id}`, { km_abastecimento: 1800 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.km_desde_anterior, 300);
  assert.strictEqual(r.body.consumo_medio, 15);
  const bb = await abast(b.id);
  assert.strictEqual(bb.km_desde_anterior, 500, 'seguinte da posicao antiga');
  assert.strictEqual(bb.consumo_medio, 12.5);
  const cc = await abast(c.id);
  assert.strictEqual(cc.km_desde_anterior, 200, 'seguinte da posicao nova');
  assert.strictEqual(cc.consumo_medio, 4);
});

test('RN-F1.11 (F2-8) PUT que muda o veiculo recalcula o seguinte nos dois veiculos', async () => {
  const v1 = await veiculo(0);
  const v2 = await veiculo(0);
  await abastecer(v1.id, 1000, 10);
  const mover = await abastecer(v1.id, 1100, 10);
  const fica = await abastecer(v1.id, 1300, 10);
  await abastecer(v2.id, 1000, 10);
  const doV2 = await abastecer(v2.id, 1500, 10);
  assert.strictEqual((await abast(fica.id)).km_desde_anterior, 200);
  assert.strictEqual((await abast(doV2.id)).km_desde_anterior, 500);
  const r = await ctx.req('put', `/api/frotas/abastecimentos/${mover.id}`, { veiculo_id: v2.id, km_abastecimento: 1200 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.km_desde_anterior, 200);
  assert.strictEqual((await abast(fica.id)).km_desde_anterior, 300, 'v1: o seguinte volta a contar do 1000');
  assert.strictEqual((await abast(doV2.id)).km_desde_anterior, 300, 'v2: o seguinte passa a contar do 1200');
});

test('RN-F1.11 (F2-8) abastecimento sem km nao tem km/L e nao serve de anterior; empate de km desempata por id', async () => {
  const v = await veiculo(0);
  await abastecer(v.id, 1000, 10);
  const semKm = await abastecer(v.id, undefined, 10, '2026-10-02', { km_abastecimento: null });
  assert.strictEqual(semKm.consumo_medio, null);
  assert.strictEqual(semKm.km_desde_anterior, null);
  const d = await abastecer(v.id, 1100, 10);
  assert.strictEqual(d.km_desde_anterior, 100, 'pulou o sem km');
  const e = await abastecer(v.id, 1100, 10);
  assert.strictEqual(e.km_desde_anterior, 0, 'mesmo km: o anterior e o de id menor');
  assert.strictEqual(e.consumo_medio, null, 'sem km rodado nao ha km/L');
});

// ── RN-F1.03 ────────────────────────────────────────────────────────────────────────────────
test('RN-F1.03 POST /checklists so com veiculo e data: aprovado = 0 e status_geral = INCOMPLETO (A3)', async () => {
  const v = await veiculo(0);
  const r = await ctx.req('post', '/api/frotas/checklists', { veiculo_id: v.id, data_checklist: '2026-10-20' });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  assert.strictEqual(r.body.aprovado, 0);
  assert.strictEqual(r.body.status_geral, 'INCOMPLETO');
  assert.strictEqual(r.body.tipo_registro, 'inspecao');
});

test('RN-F1.03 (F2-7) os 7 marcados = OK e aprovado; um "nao" = PENDENCIA', async () => {
  const v = await veiculo(0);
  const sete = { pneus_ok: 1, oleo_ok: 1, luzes_ok: 1, freios_ok: 1, extintor_ok: 1, documentos_ok: 1, limpeza_ok: 1 };
  const ok = await ctx.req('post', '/api/frotas/checklists', { veiculo_id: v.id, data_checklist: '2026-10-20', ...sete });
  assert.strictEqual(ok.body.status_geral, 'OK');
  assert.strictEqual(ok.body.aprovado, 1);
  const pend = await ctx.req('post', '/api/frotas/checklists', { veiculo_id: v.id, data_checklist: '2026-10-20', ...sete, freios_ok: 0 });
  assert.strictEqual(pend.body.status_geral, 'PENDENCIA');
  assert.strictEqual(pend.body.aprovado, 0);
  const lista = await ctx.req('get', '/api/frotas/checklists');
  const lido = lista.body.find((c) => c.id === pend.body.id);
  assert.strictEqual(lido.status_geral, 'PENDENCIA', 'GET /checklists traz status_geral');
  assert('itens' in lido && 'avarias' in lido && 'tipo_registro' in lido && 'km' in lido && 'viagem_id' in lido);
});

// ── RN-F1.17 ────────────────────────────────────────────────────────────────────────────────
test('RN-F1.17 aprovar viagem solicitada = 200; aprovar de novo (aprovada) ou concluida = 409', async () => {
  const v = await veiculo(0);
  const vi = await ctx.req('post', '/api/frotas/viagens', { veiculo_id: v.id, destino: 'Cliente' });
  assert.strictEqual(vi.body.status, 'solicitada');
  const a = await ctx.req('post', `/api/frotas/viagens/${vi.body.id}/aprovar`);
  assert.strictEqual(a.status, 200);
  assert.strictEqual(a.body.status, 'aprovada');
  const b = await ctx.req('post', `/api/frotas/viagens/${vi.body.id}/aprovar`);
  assert.strictEqual(b.status, 409);
  assert.strictEqual(b.body.error, 'Só é possível aprovar viagem solicitada');
  const conc = await ctx.req('post', '/api/frotas/viagens', { veiculo_id: v.id, status: 'concluida', km_saida: 10, km_retorno: 20 });
  const c = await ctx.req('post', `/api/frotas/viagens/${conc.body.id}/aprovar`);
  assert.strictEqual(c.status, 409);
  const lida = (await ctx.req('get', '/api/frotas/viagens')).body.find((x) => x.id === conc.body.id);
  assert.strictEqual(lida.status, 'concluida', 'a concluida nao voltou para aprovada');
});

// ── RN-F1.07 ────────────────────────────────────────────────────────────────────────────────
test('RN-F1.07 PUT /viagens com km_retorno menor que km_saida -> 400 literal, nada gravado', async () => {
  const v = await veiculo(0);
  const vi = await ctx.req('post', '/api/frotas/viagens', { veiculo_id: v.id, km_saida: 2000 });
  const r = await ctx.req('put', `/api/frotas/viagens/${vi.body.id}`, { km_retorno: 1800, status: 'concluida' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.error, 'KM do retorno (1800) menor que o KM da saída (2000). Confira o hodômetro.');
  const lida = (await ctx.req('get', '/api/frotas/viagens')).body.find((x) => x.id === vi.body.id);
  assert.strictEqual(lida.km_retorno, null);
  assert.strictEqual(lida.status, 'solicitada');
  // baixar a saida para abaixo do retorno ja gravado tambem e recusado
  const ok = await ctx.req('put', `/api/frotas/viagens/${vi.body.id}`, { km_retorno: 2100 });
  assert.strictEqual(ok.status, 200);
  const s = await ctx.req('put', `/api/frotas/viagens/${vi.body.id}`, { km_saida: 2200 });
  assert.strictEqual(s.status, 400);
  assert.strictEqual(s.body.error, 'KM do retorno (2100) menor que o KM da saída (2200). Confira o hodômetro.');
});

// ── RN-F1.05 / F2-10 / F2-9 ─────────────────────────────────────────────────────────────────
test('RN-F1.05 (F2-10) POST/PUT /viagens: segundo em_andamento do veiculo ou do motorista -> 409; F2-9 o gestor fecha a orfa', async () => {
  const v = await veiculo(0);
  const v2 = await veiculo(0);
  const m = await motorista('Carlos');
  const m2 = await motorista('Dora');
  const a = await ctx.req('post', '/api/frotas/viagens', { veiculo_id: v.id, motorista_id: m.id, status: 'em_andamento', km_saida: 100 });
  assert.strictEqual(a.status, 201);
  const b = await ctx.req('post', '/api/frotas/viagens', { veiculo_id: v.id, motorista_id: m2.id, status: 'em_andamento' });
  assert.strictEqual(b.status, 409);
  assert.strictEqual(b.body.error, 'Este veículo já está em uso (saída sem retorno).');
  const c = await ctx.req('post', '/api/frotas/viagens', { veiculo_id: v2.id, motorista_id: m.id, status: 'em_andamento' });
  assert.strictEqual(c.status, 409);
  assert.strictEqual(c.body.error, 'Você já tem uma saída sem retorno. Registre o retorno primeiro.');
  // PUT levando outra viagem a em_andamento
  const sol = await ctx.req('post', '/api/frotas/viagens', { veiculo_id: v.id, motorista_id: m2.id });
  const d = await ctx.req('put', `/api/frotas/viagens/${sol.body.id}`, { status: 'em_andamento' });
  assert.strictEqual(d.status, 409);
  assert.strictEqual(d.body.error, 'Este veículo já está em uso (saída sem retorno).');
  // a propria viagem em andamento pode ser editada (nao conflita consigo)
  const e = await ctx.req('put', `/api/frotas/viagens/${a.body.id}`, { destino: 'Obra' });
  assert.strictEqual(e.status, 200);
  // F2-9: fecha a orfa
  const f = await ctx.req('put', `/api/frotas/viagens/${a.body.id}`, { status: 'concluida', km_retorno: 180 });
  assert.strictEqual(f.status, 200);
  assert.strictEqual(f.body.status, 'concluida');
  assert.strictEqual(f.body.km_rodado, 80);
  const g = await ctx.req('put', `/api/frotas/viagens/${sol.body.id}`, { status: 'em_andamento' });
  assert.strictEqual(g.status, 200, 'liberado depois de fechar a orfa');
});

(async () => {
  ctx = await createFrotasTestApp();
  ctx.setUser(ADMIN);
  console.log('\nFrotas Etapa 1 — T2 (km/L, checklist antigo, aprovar, km do retorno)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
