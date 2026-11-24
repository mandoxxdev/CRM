/**
 * Etapa 261 (D (258) 5, B1614) — o estorno do Ajuste DE PRATELEIRA respeita a contagem mais recente.
 *
 * Ate a 260 o estorno do AJUSTE com localizacao desfazia a diferenca na linha (prateleira, lote) sem olhar se uma contagem feita depois ja
 * dizia quanto ha: A 5, Ajuste de A para 3, Ajuste do total para 7, estorno do primeiro -> 9 (a contagem diz 7); com Ajuste de A para 6 no
 * lugar do total, 8 (a contagem de A diz 6). O ramo sem localizacao ja recusava desde a 258 (RN-258.07, B1606).
 * Agora (RN-261.01/02): recusa quando ha, vivo e depois, um AJUSTE sem localizacao, um AJUSTE_INVENTARIO ou um AJUSTE da mesma linha
 * (mesma prateleira E mesmo lote). Outra prateleira, outro lote, contagem anterior ou ja estornada: passa, pela diferenca, como antes.
 *
 * Cuidado com teste vazio: todo cenario de recusa confere a mensagem literal, o total, as linhas e que o Ajuste continua vivo; todo cenario
 * de "passa" confere o numero (a metade positiva).
 *
 * Plano: docs/superpowers/plans/2026-11-23-almoxarifado-etapa261-prateleiras-no-historico-e-estorno-ajuste-de-prateleira.md
 * Executar: cd server && node tests/api/estornoAjustePrateleiraContagem.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const trava = require('../../services/almoxarifado/travaPorMaterial');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const ADMIN = { id: 1, nome: 'Adm 261', role: 'admin', is_superadmin: 1, email: 'a261@t.com' };
const API = '/api/almoxarifado';
const AJUSTE_DEPOIS = (id) => `Não é possível estornar: há um ajuste deste material feito depois deste (movimentação #${id}) `
  + '— a contagem mais recente vale. Estorne primeiro o ajuste mais recente ou faça um novo ajuste.';
const INVENTARIO_DEPOIS = (id) => 'Não é possível estornar: há uma conferência de inventário deste material feita depois deste ajuste '
  + `(movimentação #${id}) — a contagem mais recente vale. Faça um novo ajuste.`;

(async () => {
  console.log('\n=== Etapa 261: o estorno do Ajuste de prateleira respeita a contagem mais recente (D (258) 5) ===\n');
  const { app, db } = await createTestApp({ user: { ...ADMIN } });
  const post = (u, b = {}) => request(app).post(u).send(b);
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0'); await cfg('liberacao_valor_ativo', '0');
  const alm = await post(`${API}/almoxarifados`, { codigo: 'ALM261T', nome: 'A261T' });
  const loc = async (codigo) => {
    await post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('A261T'); const B = await loc('B261T');
  let seq = 0;
  const material = async () => {
    const c = `EAP261-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote,
      controle_serie, permite_saldo_negativo, localizacao_padrao_id, custo_unitario) VALUES (?,?,'UN',0,1,0,0,0,?,1)`, [c, c, A.id])).lastID;
  };
  const v2 = (b) => post(`${API}/movimentacoes/v2`, { motivo: 'teste 261', justificativa: 'teste 261', ...b });
  const cancelar = (id) => post(`${API}/movimentacoes/${id}/cancelar`, { motivo: 'teste 261' });
  const linhas = async (m) => (await dbAll(db, `SELECT COALESCE(l.codigo,'-') loc, COALESCE(lt.codigo,'-') lote, s.quantidade q
    FROM estoque_saldo_almoxarifado s LEFT JOIN localizacoes_almoxarifado l ON l.id=s.localizacao_id
    LEFT JOIN lotes_almoxarifado lt ON lt.id=s.lote_id WHERE s.material_id=?`, [m]))
    .map((r) => `${r.loc}/${r.lote}=${Math.round(r.q * 1e6) / 1e6}`).sort().join(' ');
  const fis = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id=?', [m])).q);
  const vivo = async (movId) => Number((await dbGet(db, 'SELECT cancelado c FROM movimentacoes_almoxarifado WHERE id=?', [movId])).c) === 0;
  const estornos = async (m) => Number((await dbGet(db, "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE tipo='ESTORNO' AND material_id=?",
    [m])).n);
  const mov = async (m, tipo, q, extra = {}) => {
    const r = await v2({ material_id: m, tipo, quantidade: q, ...extra });
    assert.strictEqual(r.status, 201, `${tipo} de premissa: ${JSON.stringify(r.body)}`);
    return r.body.id;
  };
  const estornar = async (id) => {
    const r = await cancelar(id);
    assert.strictEqual(r.status, 200, `estorno: ${JSON.stringify(r.body)}`);
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id=? AND codigo=?', [m, codigo])).id;
  const recusado = async (aj, m, msg, total, lin) => {
    const r = await cancelar(aj);
    assert.strictEqual(r.status, 400, `o estorno passou: ${JSON.stringify(r.body)} (total ${await fis(m)}, ${await linhas(m)})`);
    assert.strictEqual(r.body.error, msg);
    assert.strictEqual(await fis(m), total, 'o total mudou na recusa');
    assert.strictEqual(await linhas(m), lin, 'as linhas mudaram na recusa');
    assert.ok(await vivo(aj), 'o Ajuste ficou cancelado depois da recusa (o claim nao voltou)');
    assert.strictEqual(await estornos(m), 0, 'a recusa gravou um ESTORNO');
  };

  // ── RN-261.01: a contagem feita depois trava ───────────────────────────────────────────────────────────────────────
  await test('[RN-261.01] A 5, Ajuste de A para 3, Ajuste do total para 7: o estorno do 1o e recusado (antes: 9); na ordem inversa, 3 e 5',
    async () => {
      const m = await material();
      await mov(m, 'ENTRADA', 5);
      const ajA = await mov(m, 'AJUSTE', 3, { localizacao_destino_id: A.id });
      const ajT = await mov(m, 'AJUSTE', 7);
      await recusado(ajA, m, AJUSTE_DEPOIS(ajT), 7, 'A261T/-=7');
      await estornar(ajT);
      assert.strictEqual(await fis(m), 3);
      await estornar(ajA);
      assert.strictEqual(await fis(m), 5);
      assert.strictEqual(await linhas(m), 'A261T/-=5');
    });

  await test('[RN-261.01] A 5, Ajuste de A para 3, Ajuste de A para 6: o estorno do 1o e recusado (antes: 8, por cima da contagem de A)',
    async () => {
      const m = await material();
      await mov(m, 'ENTRADA', 5);
      const aj1 = await mov(m, 'AJUSTE', 3, { localizacao_destino_id: A.id });
      const aj2 = await mov(m, 'AJUSTE', 6, { localizacao_destino_id: A.id });
      await recusado(aj1, m, AJUSTE_DEPOIS(aj2), 6, 'A261T/-=6');
      await estornar(aj2);
      await estornar(aj1);
      assert.strictEqual(await fis(m), 5);
      assert.strictEqual(await linhas(m), 'A261T/-=5');
    });

  await test('[RN-261.01] a conferencia de inventario feita depois trava, com a mensagem que manda so fazer um novo ajuste', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 5);
    const ajA = await mov(m, 'AJUSTE', 3, { localizacao_destino_id: A.id });
    const inv = await stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'AJUSTE_INVENTARIO', quantidade: 7,
      motivo: 'teste 261', justificativa: 'teste 261' });
    assert.strictEqual(await fis(m), 7, 'premissa: o inventario gravou');
    await recusado(ajA, m, INVENTARIO_DEPOIS(inv.id), 7, 'A261T/-=7');
  });

  await test('[RN-261.01] cita a contagem MAIS recente (dois ajustes depois: o de maior id)', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 5);
    const ajA = await mov(m, 'AJUSTE', 3, { localizacao_destino_id: A.id });
    await mov(m, 'AJUSTE', 6, { localizacao_destino_id: A.id });
    const ajT = await mov(m, 'AJUSTE', 8);
    await recusado(ajA, m, AJUSTE_DEPOIS(ajT), 8, 'A261T/-=8');
  });

  await test('[RN-261.01] lote: o Ajuste da mesma prateleira e do mesmo lote feito depois trava', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 5, { lote: 'L261A' });
    const L = await loteId(m, 'L261A');
    const aj1 = await mov(m, 'AJUSTE', 3, { localizacao_destino_id: A.id, lote_id: L });
    const aj2 = await mov(m, 'AJUSTE', 6, { localizacao_destino_id: A.id, lote_id: L });
    await recusado(aj1, m, AJUSTE_DEPOIS(aj2), 6, 'A261T/L261A=6');
  });

  // ── RN-261.02: o que nao trava ────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-261.02] o Ajuste de OUTRA prateleira feito depois nao trava: A 5, B 4, Ajuste de A para 3, Ajuste de B para 2 -> 7', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 5);
    await mov(m, 'ENTRADA', 4, { localizacao_destino_id: B.id });
    const ajA = await mov(m, 'AJUSTE', 3, { localizacao_destino_id: A.id });
    await mov(m, 'AJUSTE', 2, { localizacao_destino_id: B.id });
    await estornar(ajA);
    assert.strictEqual(await fis(m), 7);
    assert.strictEqual(await linhas(m), 'A261T/-=5 B261T/-=2');
  });

  await test('[RN-261.02] lote: o Ajuste de OUTRO lote na mesma prateleira nao trava', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 5, { lote: 'L261B' });
    await mov(m, 'ENTRADA', 4, { lote: 'L261C' });
    const L1 = await loteId(m, 'L261B'); const L2 = await loteId(m, 'L261C');
    const aj1 = await mov(m, 'AJUSTE', 3, { localizacao_destino_id: A.id, lote_id: L1 });
    await mov(m, 'AJUSTE', 2, { localizacao_destino_id: A.id, lote_id: L2 });
    await estornar(aj1);
    assert.strictEqual(await fis(m), 7);
    assert.strictEqual(await linhas(m), 'A261T/L261B=5 A261T/L261C=2');
  });

  await test('[RN-261.02] a contagem ANTERIOR nao trava: Ajuste do total para 7, depois Ajuste de A para 3, estorno -> 7', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 5);
    await mov(m, 'AJUSTE', 7);
    const ajA = await mov(m, 'AJUSTE', 3, { localizacao_destino_id: A.id });
    await estornar(ajA);
    assert.strictEqual(await fis(m), 7);
    assert.strictEqual(await linhas(m), 'A261T/-=7');
  });

  await test('[RN-261.02] Saida e Entrada depois nao travam: o estorno continua pela diferenca (A 5, Ajuste de A para 3, Saida 1, Entrada 4 em B)',
    async () => {
      const m = await material();
      await mov(m, 'ENTRADA', 5);
      const ajA = await mov(m, 'AJUSTE', 3, { localizacao_destino_id: A.id });
      await mov(m, 'SAIDA', 1, { localizacao_origem_id: A.id });
      await mov(m, 'ENTRADA', 4, { localizacao_destino_id: B.id });
      await estornar(ajA);
      assert.strictEqual(await fis(m), 8);
      assert.strictEqual(await linhas(m), 'A261T/-=4 B261T/-=4');
    });

  await test('[RN-261.02] pelo servico (compensacao: true) a guarda nao vale, como na RN-258.07', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 5);
    const ajA = await mov(m, 'AJUSTE', 3, { localizacao_destino_id: A.id });
    await mov(m, 'AJUSTE', 7);
    await stockService.cancelarMovimentacao(db, ADMIN, ajA, 'compensacao 261', { compensacao: true });
    assert.strictEqual(await fis(m), 9, 'a compensacao interna desfaz a diferenca sem a guarda');
    assert.ok(!(await vivo(ajA)));
  });

  await test('[RN-261.01, servico] pelo servico sem compensacao, a mesma recusa (status 400)', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 5);
    const ajA = await mov(m, 'AJUSTE', 3, { localizacao_destino_id: A.id });
    const ajT = await mov(m, 'AJUSTE', 7);
    let erro = null;
    try { await stockService.cancelarMovimentacao(db, ADMIN, ajA, 'teste 261'); } catch (e) { erro = e; }
    assert.ok(erro, 'o servico estornou');
    assert.strictEqual(erro.status, 400);
    assert.strictEqual(erro.message, AJUSTE_DEPOIS(ajT));
    assert.strictEqual(await fis(m), 7);
    assert.ok(await vivo(ajA));
  });

  // ── Fase 5, achado 1: o claim provisorio de outro estorno nao esconde a contagem mais recente ─────────────────────────────
  // Molde do CLAUDE.md: os dois estornos disparados do CONTEXTO DO TESTE; a trava do material segura pelo teste (sem gancho no motor). O
  // claim de cada estorno roda fora da trava, entao os dois ficam com `cancelado = 1` e esperam na fila; o de aj1 entra primeiro.
  const ate = async (cond, rotulo) => {
    for (let i = 0; i < 300; i++) { if (await cond()) return; await new Promise((r) => setTimeout(r, 10)); }
    throw new Error(`esperou demais: ${rotulo}`);
  };
  const claim = async (id) => Number((await dbGet(db, 'SELECT cancelado c FROM movimentacoes_almoxarifado WHERE id=?', [id])).c) === 1;
  const corrida = async (aj1, aj2, m) => {
    let soltar;
    const segura = trava.naTravaDoMaterial(m, () => new Promise((r) => { soltar = r; }));
    await ate(() => Promise.resolve(typeof soltar === 'function'), 'a trava do teste');
    const p1 = cancelar(aj1).then((r) => r);
    await ate(() => claim(aj1), 'o claim do estorno de aj1');
    const p2 = cancelar(aj2).then((r) => r);
    await ate(() => claim(aj2), 'o claim do estorno de aj2');
    soltar(); await segura;
    return Promise.all([p1, p2]);
  };

  await test('[RN-261.01, Fase 5 achado 1] dois estornos juntos (A 5, Ajuste de A para 8, para 10, Saida 6): o do mais antigo e recusado '
    + 'enquanto o do mais recente esta em andamento — total 2 (antes: os dois "passavam" e sobrava 1)', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 5);
    const aj1 = await mov(m, 'AJUSTE', 8, { localizacao_destino_id: A.id });
    const aj2 = await mov(m, 'AJUSTE', 10, { localizacao_destino_id: A.id });
    await mov(m, 'SAIDA', 6); // A 4
    const [r1, r2] = await corrida(aj1, aj2, m);
    assert.strictEqual(r1.status, 400, `o estorno do mais antigo passou: ${JSON.stringify(r1.body)} (total ${await fis(m)})`);
    assert.strictEqual(r1.body.error, AJUSTE_DEPOIS(aj2));
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.body));
    assert.strictEqual(await fis(m), 2);
    assert.ok(await vivo(aj1), 'o mais antigo ficou estornado');
  });

  await test('[RN-261.01, Fase 5 achado 1] o mesmo no ramo sem localizacao (5, Ajuste para 8, para 10, Saida 6)', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 5);
    const aj1 = await mov(m, 'AJUSTE', 8);
    const aj2 = await mov(m, 'AJUSTE', 10);
    await mov(m, 'SAIDA', 6);
    const [r1, r2] = await corrida(aj1, aj2, m);
    assert.strictEqual(r1.status, 400, `o estorno do mais antigo passou: ${JSON.stringify(r1.body)} (total ${await fis(m)})`);
    assert.strictEqual(r1.body.error, AJUSTE_DEPOIS(aj2));
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.body));
    assert.strictEqual(await fis(m), 2);
  });

  // ── Fase 5, achado 2: a fronteira sem lote x com lote na mesma prateleira ─────────────────────────────────────────────
  await test('[RN-261.02, Fase 5 achado 2] Ajuste de A sem lote, depois Ajuste de A no lote L1: o estorno do primeiro passa (e o do lote, '
    + 'com o sem lote depois, tambem)', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 5);
    await mov(m, 'ENTRADA', 4, { lote: 'L261D' });
    const L = await loteId(m, 'L261D');
    const ajSem = await mov(m, 'AJUSTE', 3, { localizacao_destino_id: A.id });
    await mov(m, 'AJUSTE', 2, { localizacao_destino_id: A.id, lote_id: L });
    await estornar(ajSem);
    assert.strictEqual(await linhas(m), 'A261T/-=5 A261T/L261D=2');
    const m2 = await material();
    await mov(m2, 'ENTRADA', 5);
    await mov(m2, 'ENTRADA', 4, { lote: 'L261E' });
    const L2 = await loteId(m2, 'L261E');
    const ajLote = await mov(m2, 'AJUSTE', 2, { localizacao_destino_id: A.id, lote_id: L2 });
    await mov(m2, 'AJUSTE', 3, { localizacao_destino_id: A.id });
    await estornar(ajLote);
    assert.strictEqual(await linhas(m2), 'A261T/-=3 A261T/L261E=4');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
