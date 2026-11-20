/**
 * Etapa 253 (C477; B1367 revista) — a Devolucao busca a entrega por requisicao, OS ou data.
 *
 * Ate a 253 a lista de "Entrega de origem" (`GET /devolucoes/saidas-elegiveis`) so andava de 30 em 30 ("Carregar entregas mais
 * antigas", Etapa 204): a entrega de dois meses atras de um material que sai todo dia exigia dezenas de cliques. Agora `busca`
 * (opcional) filtra por numero da requisicao (contem), OS (o numero que a tela mostra) ou data (o dia no fuso do negocio), com a
 * mesma ordem, a mesma pagina e o mesmo cursor. Sem `busca`, a resposta e a de sempre.
 *
 * Plano: docs/superpowers/plans/2026-11-20-almoxarifado-etapa253-busca-de-entrega-e-ajuste-com-lote.md
 * Executar: cd server && node tests/api/devolucaoBuscaEntrega.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const returnService = require('../../services/almoxarifado/returnService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});
const ADMIN = { id: 1, nome: 'Admin 253', role: 'admin', is_superadmin: 1, email: 'a253@test.com' };
const API = '/api/almoxarifado';
const MSG_LONGA = 'Busca muito longa — use até 60 caracteres';
const MSG_DATA = (t) => `Data inválida na busca: ${t} — use DD/MM/AAAA`;

let seq = 0;
async function novoMaterial(db) {
  seq += 1;
  return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
     VALUES (?,?,'UN',1000,1)`, [`DBE253-${seq}`, `Material busca ${seq}`])).lastID;
}
async function entregar(db, materialId, extra = {}) {
  return (await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: materialId, tipo: 'SAIDA', quantidade: 1, justificativa: 'entrega', ...extra })).id;
}
async function requisicao(db, numero) {
  return (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, ativo)
    VALUES (?, 1, 'Admin', 1)`, [numero])).lastID;
}
const lista = (app, m, q = '') => request(app).get(`${API}/devolucoes/saidas-elegiveis?material_id=${m}${q}`);
const ids = (r) => r.body.map((x) => x.id);

(async () => {
  console.log('\n=== Etapa 253: a Devolucao busca a entrega ===\n');
  const { app, db } = await createTestApp({ user: ADMIN });

  // Cenario: 12 entregas. R1 (REQ-2026-0101) em 3; R2 (REQ-2026-0102) em 2; OS 12 em 2; OS 120 em 1; 4 soltas.
  const M = await novoMaterial(db);
  const R1 = await requisicao(db, 'REQ-2026-0101');
  const R2 = await requisicao(db, 'REQ-2026-0102');
  const E = [];
  for (let i = 0; i < 12; i++) E.push(await entregar(db, M));
  const vincular = (id, col, v) => dbRun(db, `UPDATE movimentacoes_almoxarifado SET ${col} = ? WHERE id = ?`, [v, id]);
  for (const i of [0, 4, 8]) await vincular(E[i], 'requisicao_id', R1);
  for (const i of [1, 5]) await vincular(E[i], 'requisicao_id', R2);
  for (const i of [2, 6]) await vincular(E[i], 'os_id', 12);
  await vincular(E[3], 'os_id', 120);
  // Datas (UTC no banco): E[0..9] em 01/03/2026 por minuto; E[10] 10/03 14:00 UTC (11h local); E[11] 11/03 01:30 UTC
  // (10/03 22:30 local — a borda do fuso); e E[9] 10/03 02:00 UTC (09/03 23:00 local — fora do dia 10).
  for (let i = 0; i < 9; i++) {
    await dbRun(db, "UPDATE movimentacoes_almoxarifado SET created_at = datetime('2026-03-01 12:00:00', ?) WHERE id = ?",
      [`+${i} minutes`, E[i]]);
  }
  await dbRun(db, "UPDATE movimentacoes_almoxarifado SET created_at = '2026-03-10 02:00:00' WHERE id = ?", [E[9]]);
  await dbRun(db, "UPDATE movimentacoes_almoxarifado SET created_at = '2026-03-10 14:00:00' WHERE id = ?", [E[10]]);
  await dbRun(db, "UPDATE movimentacoes_almoxarifado SET created_at = '2026-03-11 01:30:00' WHERE id = ?", [E[11]]);

  await test('[RN-253.01] sem busca, busca vazia e so espacos: a mesma resposta de hoje', async () => {
    const base = await lista(app, M);
    assert.strictEqual(base.status, 200, JSON.stringify(base.body));
    assert.strictEqual(base.body.length, 12, 'premissa: as 12');
    for (const q of ['&busca=', '&busca=%20%20%20']) {
      const r = await lista(app, M, q);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.deepStrictEqual(r.body, base.body, `${q} mudou a resposta`);
    }
  });

  await test('[RN-253.03] requisicao: contem, sem diferenciar maiusculas, na ordem de sempre', async () => {
    const r = await lista(app, M, '&busca=0101');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(ids(r), [E[8], E[4], E[0]]);
    const r2 = await lista(app, M, `&busca=${encodeURIComponent(' req-2026-010 ')}`);
    assert.deepStrictEqual(ids(r2), [E[8], E[5], E[4], E[1], E[0]]);
    assert.ok(r2.body.every((x) => /^REQ-2026-010/.test(x.requisicao_numero)), 'veio entrega de outra requisicao');
  });

  await test('[RN-253.03] % e _ sao literais (nao casam tudo)', async () => {
    for (const t of ['%', '_', 'REQ%0101', 'REQ-2026-01_1']) {
      const r = await lista(app, M, `&busca=${encodeURIComponent(t)}`);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.deepStrictEqual(ids(r), [], `"${t}" casou ${ids(r)}`);
    }
  });

  await test('[RN-253.03] OS: "OS 12", "os12" e "12" acham so a OS 12 (nao a 120)', async () => {
    for (const t of ['OS 12', 'os12', '12']) {
      const r = await lista(app, M, `&busca=${encodeURIComponent(t)}`);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.deepStrictEqual(ids(r), [E[6], E[2]], `"${t}"`);
    }
    const r = await lista(app, M, '&busca=120');
    assert.deepStrictEqual(ids(r), [E[3]]);
  });

  await test('[RN-253.02] data: o dia no fuso do negocio (DD/MM/AAAA e AAAA-MM-DD), com a borda das 21h', async () => {
    for (const t of ['10/03/2026', '2026-03-10']) {
      const r = await lista(app, M, `&busca=${encodeURIComponent(t)}`);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.deepStrictEqual(ids(r), [E[11], E[10]], `"${t}" (E[9] e 09/03 local; E[11] e 10/03 22:30 local)`);
    }
    const r = await lista(app, M, `&busca=${encodeURIComponent('09/03/2026')}`);
    assert.deepStrictEqual(ids(r), [E[9]]);
    const vazio = await lista(app, M, `&busca=${encodeURIComponent('02/03/2026')}`);
    assert.deepStrictEqual(ids(vazio), []);
  });

  await test('[RN-253.02] data impossivel -> 400 com a literal', async () => {
    for (const t of ['31/02/2026', '2026-13-01', '00/03/2026']) {
      const r = await lista(app, M, `&busca=${encodeURIComponent(t)}`);
      assert.strictEqual(r.status, 400, `${t}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, MSG_DATA(t));
    }
  });

  await test('[RN-253.05] busca de 61 caracteres -> 400; 60 passa; a ordem das recusas', async () => {
    const r = await lista(app, M, `&busca=${'x'.repeat(61)}`);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, MSG_LONGA);
    const ok = await lista(app, M, `&busca=${'x'.repeat(60)}`);
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    const semMaterial = await lista(app, 999999, `&busca=${'x'.repeat(61)}`);
    assert.strictEqual(semMaterial.body.error, 'Material não encontrado');
    const antesRuim = await lista(app, M, `&busca=${'x'.repeat(61)}&antes_de=abc`);
    assert.strictEqual(antesRuim.body.error, MSG_LONGA, 'a busca e julgada antes do cursor');
  });

  // Paginacao dentro da busca: 35 entregas da REQ-2026-0200 e 3 soltas no meio.
  const M2 = await novoMaterial(db);
  const R3 = await requisicao(db, 'REQ-2026-0200');
  const F = [];
  for (let i = 0; i < 38; i++) F.push(await entregar(db, M2));
  const soltas = [F[3], F[20], F[37]];
  for (const id of F) if (!soltas.includes(id)) await vincular(id, 'requisicao_id', R3);
  for (let i = 0; i < F.length; i++) {
    await dbRun(db, "UPDATE movimentacoes_almoxarifado SET created_at = datetime('2026-04-01 12:00:00', ?) WHERE id = ?",
      [`+${i} minutes`, F[i]]);
  }

  await test('[RN-253.04] a pagina e o cursor dentro da busca: 30 + 5, sem as soltas, sem repetir', async () => {
    const p1 = await lista(app, M2, '&busca=0200');
    assert.strictEqual(p1.status, 200, JSON.stringify(p1.body));
    assert.strictEqual(p1.body.length, 30);
    const p2 = await lista(app, M2, `&busca=0200&antes_de=${p1.body[29].id}`);
    assert.strictEqual(p2.status, 200, JSON.stringify(p2.body));
    assert.strictEqual(p2.body.length, 5, `pagina 2: ${p2.body.length}`);
    const todas = [...ids(p1), ...ids(p2)];
    assert.strictEqual(new Set(todas).size, 35);
    for (const s of soltas) assert.ok(!todas.includes(s), `solta ${s} veio na busca`);
    const esperada = F.filter((id) => !soltas.includes(id)).reverse();
    assert.deepStrictEqual(todas, esperada, 'a ordem dentro da busca nao e a de sempre');
    const p3 = await lista(app, M2, `&busca=0200&antes_de=${p2.body[4].id}`);
    assert.deepStrictEqual(p3.body, []);
  });

  await test('[RN-253.04] o servico direto aceita a busca (contrato do servico)', async () => {
    const r = await returnService.listarSaidasElegiveis(db, M, { busca: 'OS 12' });
    assert.deepStrictEqual(r.map((x) => x.id), [E[6], E[2]]);
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
