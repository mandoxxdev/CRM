/**
 * Frotas Etapa 1 — Fase 5 (revisao adversarial): achados de regra, reproduzidos e corrigidos.
 *
 *   Fase5-1   PUT /abastecimentos que muda litros ou valor_total recalcula valor_litro (se o corpo nao manda valor_litro)
 *   Fase5-2   exportacao, aba Documentos: so documentos `ativo` (a mesma regua do alerta do painel)
 *   Fase5-3   retorno com data/hora anterior a saida -> 400 (portal, PUT /viagens e POST /viagens)
 *   Fase5-4   saida que consome viagem aprovada (B8) grava as observacoes na viagem
 *   Fase5-5   portal (registros e abastecimentos) recusa data depois de hoje (Brasilia) -> 400 `Data no futuro`
 *   Fase5-6   POST /checklists (gestor) valida as avarias como o portal -> 400 `Avaria inválida`
 *   Fase5-11  alerta do tipo checklist sai com dias_restantes null (nao e vencimento)
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa1-portal-do-motorista.md (secao "Fase 5")
 * Executar: cd server && node tests/api/frotasFase5Regras.api.test.js
 */
const assert = require('assert');
const XLSX = require('xlsx');
const { createFrotasTestApp, ADMIN, MOTORISTA } = require('../helpers/frotasTestApp');
const { hojeLocalISO } = require('../../services/diaLocal');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

const somaDias = (dia, n) => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
const HOJE = hojeLocalISO();
const ONTEM = somaDias(HOJE, -1);
const AMANHA = somaDias(HOJE, 1);

let ctx;
const S = {};
const como = (user, metodo, url, corpo) => ctx.como(user)(metodo, url, corpo);
const registrar = (user, corpo) => como(user, 'post', '/api/frotas/portal/registros', corpo);

function binario(res, cb) {
  res.setEncoding('binary');
  let d = '';
  res.on('data', (c) => { d += c; });
  res.on('end', () => cb(null, Buffer.from(d, 'binary')));
}

async function cenario() {
  const v = async (placa, extra = {}) => (await como(ADMIN, 'post', '/api/frotas/veiculos', { placa, ...extra })).body;
  S.v1 = await v('FAS0001', { km_atual: 1000 });
  S.v2 = await v('FAS0002', { km_atual: 1000 });
  S.v3 = await v('FAS0003', { km_atual: 1000 });
  S.ma = (await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Ana Motorista', usuario_id: 2 })).body;
  assert(S.v1.id && S.v2.id && S.v3.id && S.ma.id);
}

// ── Fase5-1 ─────────────────────────────────────────────────────────────────────────────────
test('Fase5-1 PUT /abastecimentos com litros ou valor_total novos recalcula valor_litro; valor_litro do corpo vale', async () => {
  const c = await como(ADMIN, 'post', '/api/frotas/abastecimentos', {
    veiculo_id: S.v3.id, data_abastecimento: ONTEM, litros: 40, valor_total: 200, km_abastecimento: 1100,
  });
  assert.strictEqual(c.status, 201, JSON.stringify(c.body));
  assert.strictEqual(c.body.valor_litro, 5);
  const a = await como(ADMIN, 'put', `/api/frotas/abastecimentos/${c.body.id}`, { litros: 50 });
  assert.strictEqual(a.status, 200, JSON.stringify(a.body));
  assert.strictEqual(a.body.valor_litro, 4, '200 / 50');
  const b = await como(ADMIN, 'put', `/api/frotas/abastecimentos/${c.body.id}`, { valor_total: 300 });
  assert.strictEqual(b.body.valor_litro, 6, '300 / 50');
  const d = await como(ADMIN, 'put', `/api/frotas/abastecimentos/${c.body.id}`, { observacoes: 'so a obs' });
  assert.strictEqual(d.body.valor_litro, 6, 'nada mudou');
  const e = await como(ADMIN, 'put', `/api/frotas/abastecimentos/${c.body.id}`, { valor_total: 350, valor_litro: 7.1 });
  assert.strictEqual(e.body.valor_litro, 7.1, 'o valor_litro do corpo vale');
});

// ── Fase5-2 ─────────────────────────────────────────────────────────────────────────────────
test('Fase5-2 exportacao: documento renovado/cancelado nao sai na aba Documentos (so os ativos, como o alerta)', async () => {
  const doc = (extra) => como(ADMIN, 'post', '/api/frotas/documentos', { veiculo_id: S.v3.id, data_vencimento: somaDias(HOJE, -10), ...extra });
  assert.strictEqual((await doc({ tipo: 'crlv', descricao: 'antigo', status: 'renovado' })).status, 201);
  assert.strictEqual((await doc({ tipo: 'seguro', descricao: 'vigente', status: 'ativo' })).status, 201);
  const r = await como(ADMIN, 'get', '/api/frotas/exportar.xlsx').buffer(true).parse(binario);
  assert.strictEqual(r.status, 200);
  const wb = XLSX.read(r.body, { type: 'buffer' });
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets.Documentos, { header: 1, defval: '' }).slice(1);
  assert.deepStrictEqual(linhas.map((l) => l[1]), ['SEGURO — vigente']);
  assert.strictEqual(linhas[0][4], 'VENCIDO');
});

// ── Fase5-3 ─────────────────────────────────────────────────────────────────────────────────
test('Fase5-3 portal: retorno com data/hora anterior a saida -> 400 literal; igual ou depois passa', async () => {
  const s = await registrar(MOTORISTA, { tipo: 'saida', veiculo_id: S.v1.id, km: 1010, data: ONTEM, horario: '10:00' });
  assert.strictEqual(s.status, 201, JSON.stringify(s.body));
  const antes = await registrar(MOTORISTA, { tipo: 'retorno', km: 1020, data: ONTEM, horario: '09:59' });
  assert.strictEqual(antes.status, 400);
  assert.strictEqual(antes.body.error, `Data/hora do retorno anterior à saída (${ONTEM} 10:00).`);
  const diaAntes = await registrar(MOTORISTA, { tipo: 'retorno', km: 1020, data: somaDias(ONTEM, -1), horario: '23:00' });
  assert.strictEqual(diaAntes.status, 400);
  const ok = await registrar(MOTORISTA, { tipo: 'retorno', km: 1020, data: ONTEM, horario: '10:00' });
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  S.viagemFechada = ok.body.viagem;
});

test('Fase5-3 PUT /viagens: data_retorno antes da data_saida (gravadas ou do corpo) -> 400; POST /viagens tambem', async () => {
  const id = S.viagemFechada.id;
  const a = await como(ADMIN, 'put', `/api/frotas/viagens/${id}`, { data_retorno: `${ONTEM}T08:00` });
  assert.strictEqual(a.status, 400);
  assert.strictEqual(a.body.error, `Data/hora do retorno anterior à saída (${ONTEM} 10:00).`);
  const b = await como(ADMIN, 'put', `/api/frotas/viagens/${id}`, { data_saida: `${ONTEM}T11:00` });
  assert.strictEqual(b.status, 400, 'saida nova depois do retorno gravado');
  assert.strictEqual(b.body.error, `Data/hora do retorno anterior à saída (${ONTEM} 11:00).`);
  const c = await como(ADMIN, 'put', `/api/frotas/viagens/${id}`, { data_retorno: `${ONTEM}T18:00` });
  assert.strictEqual(c.status, 200, JSON.stringify(c.body));
  const d = await como(ADMIN, 'post', '/api/frotas/viagens', {
    veiculo_id: S.v2.id, data_saida: `${ONTEM}T10:00`, data_retorno: `${somaDias(ONTEM, -1)}T10:00`, status: 'concluida',
  });
  assert.strictEqual(d.status, 400);
  assert.strictEqual(d.body.error, `Data/hora do retorno anterior à saída (${ONTEM} 10:00).`);
  const e = await como(ADMIN, 'put', `/api/frotas/viagens/${id}`, { data_retorno: null });
  assert.strictEqual(e.status, 200, 'so com as duas datas a regra vale');
});

// ── Fase5-4 ─────────────────────────────────────────────────────────────────────────────────
test('Fase5-4 saida que consome a viagem aprovada (B8) grava as observacoes da saida na viagem', async () => {
  const v = await como(ADMIN, 'post', '/api/frotas/viagens', { veiculo_id: S.v2.id, motorista_id: S.ma.id, destino: 'Obra' });
  assert.strictEqual(v.status, 201);
  assert.strictEqual((await como(ADMIN, 'post', `/api/frotas/viagens/${v.body.id}/aprovar`)).status, 200);
  const s = await registrar(MOTORISTA, { tipo: 'saida', veiculo_id: S.v2.id, km: 1050, data: HOJE, horario: '00:00', observacoes: 'leva a betoneira' });
  assert.strictEqual(s.status, 201, JSON.stringify(s.body));
  assert.strictEqual(s.body.viagem.id, v.body.id, 'consumiu a aprovada');
  assert.strictEqual(s.body.viagem.observacoes, 'leva a betoneira');
  assert.strictEqual(s.body.viagem.destino, 'Obra', 'sem destino no corpo, fica o da aprovada');
  const r = await registrar(MOTORISTA, { tipo: 'retorno', km: 1060, data: HOJE, horario: '00:00' });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
});

// ── Fase5-5 ─────────────────────────────────────────────────────────────────────────────────
test('Fase5-5 portal recusa data no futuro (registro e abastecimento) -> 400 `Data no futuro`; hoje passa', async () => {
  const a = await registrar(MOTORISTA, { tipo: 'inspecao', veiculo_id: S.v1.id, km: 1100, data: AMANHA });
  assert.strictEqual(a.status, 400);
  assert.strictEqual(a.body.error, 'Data no futuro');
  const b = await como(MOTORISTA, 'post', '/api/frotas/portal/abastecimentos', { veiculo_id: S.v1.id, km: 1100, litros: 10, data: AMANHA });
  assert.strictEqual(b.status, 400);
  assert.strictEqual(b.body.error, 'Data no futuro');
  const c = await registrar(MOTORISTA, { tipo: 'inspecao', veiculo_id: S.v1.id, km: 1100, data: HOJE });
  assert.strictEqual(c.status, 201, JSON.stringify(c.body));
});

// ── Fase5-6 ─────────────────────────────────────────────────────────────────────────────────
test('Fase5-6 POST /checklists (gestor) com avaria malformada -> 400 `Avaria inválida`; avaria valida grava limpa', async () => {
  const base = { veiculo_id: S.v1.id, data_checklist: HOJE };
  for (const avarias of [[{ vista: 'teto', tipo: 'R' }], [{ vista: 'frente', tipo: 'Z' }], ['x'], 'abc', [{ vista: 'frente', tipo: 'R', descricao: 5 }]]) {
    const r = await como(ADMIN, 'post', '/api/frotas/checklists', { ...base, avarias });
    assert.strictEqual(r.status, 400, `${JSON.stringify(avarias)} -> ${r.status}`);
    assert.strictEqual(r.body.error, 'Avaria inválida');
  }
  const ok = await como(ADMIN, 'post', '/api/frotas/checklists', { ...base, avarias: [{ vista: 'frente', tipo: 'R', descricao: 'risco', lixo: 1 }] });
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  assert.deepStrictEqual(ok.body.avarias, [{ vista: 'frente', tipo: 'R', descricao: 'risco' }]);
  S.checklistPendente = ok.body;
});

// ── Fase5-11 ────────────────────────────────────────────────────────────────────────────────
test('Fase5-11 alerta do tipo checklist sai com dias_restantes null (os outros tipos continuam com dias)', async () => {
  const p = await como(ADMIN, 'post', '/api/frotas/checklists', { veiculo_id: S.v1.id, data_checklist: somaDias(HOJE, -3), pneus_ok: 0 });
  assert.strictEqual(p.body.status_geral, 'PENDENCIA');
  const r = await como(ADMIN, 'get', '/api/frotas/alertas');
  assert.strictEqual(r.status, 200);
  const ck = r.body.filter((a) => a.tipo === 'checklist');
  assert(ck.length >= 1, 'ha alerta de checklist');
  for (const a of ck) assert.strictEqual(a.dias_restantes, null, JSON.stringify(a));
  const doc = r.body.find((a) => a.tipo === 'documento');
  assert.strictEqual(doc.dias_restantes, -10);
});

(async () => {
  ctx = await createFrotasTestApp();
  await cenario();
  console.log('\nFrotas Etapa 1 — Fase 5 (regras)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
