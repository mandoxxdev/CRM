/**
 * Etapa 60 — a divergência na separação: a rodada registra, por item, o máximo separável na hora, se
 * separou menos (divergente) e o motivo (opcional). Não recusa — o parcial legítimo é da spec 05.
 *
 * Plano: docs/superpowers/plans/2026-09-30-almoxarifado-etapa60-divergencia-na-separacao.md
 *
 * Executar: cd server && node tests/api/separacaoDivergencia.api.test.js
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
let seq = 0;

(async () => {
  console.log('\n=== Etapa 60: divergencia na separacao ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const loc = async (nome) => {
    const c = `E60-${nome}-${++seq}`;
    return { id: (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', [c, nome])).lastID, codigo: c };
  };
  const material = async () => {
    const c = `E60-M${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
      VALUES (?, ?, 'UN', 0, 1)`, [c, `Mat ${c}`])).lastID;
  };
  const entrar = async (m, destino, q) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e60', localizacao_destino_id: destino });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const req = async (itens) => {
    const r = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E60-${++seq}`])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
        VALUES (?,?,?,0,0,0)`, [r, m, q])).lastID);
    }
    return { id: r, ids };
  };
  const separar = async (reqId, itens) => {
    const r = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/separar`).send({ itens_separados: itens });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const rodadas = async (reqId) => {
    // As rodadas vem no detalhe da requisicao (`separacoes`), lidas por `listarSeparacoes`.
    const r = await request(app).get(`/api/almoxarifado/requisicoes/${reqId}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.separacoes;
  };
  const itensDa = (rodada) => rodada.itens || (rodada.itens_json ? JSON.parse(rodada.itens_json) : []);

  await test('RN-01/02 separa MENOS que o maximo (sem falta de saldo): divergente, com motivo, na rodada e na auditoria', async () => {
    const m = await material(); const A = await loc('A'); await entrar(m, A.id, 20);
    const { id, ids } = await req([[m, 10]]);
    const r = await separar(id, [{ item_id: ids[0], quantidade_separada: 6, motivo_divergencia: '  4 unidades avariadas na prateleira  ' }]);
    const lista = await rodadas(id);
    const it = itensDa(lista[0])[0];
    assert.strictEqual(it.maximo, 10); assert.strictEqual(it.divergente, true);
    assert.strictEqual(it.motivo_divergencia, '4 unidades avariadas na prateleira');
    const aud = await dbGet(db, "SELECT dados_novos FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ? AND acao = 'SEPARACAO' ORDER BY id DESC", [id]);
    const na = JSON.parse(aud.dados_novos).itens[0];
    assert.strictEqual(na.divergente, true); assert.strictEqual(na.motivo_divergencia, '4 unidades avariadas na prateleira');
    assert.ok(r.rodada_id);
  });

  await test('RN-01 NAO recusa sem motivo (parcial legitimo): divergente com motivo null', async () => {
    const m = await material(); const A = await loc('B'); await entrar(m, A.id, 20);
    const { id, ids } = await req([[m, 10]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 4 }]);
    const it = itensDa((await rodadas(id))[0])[0];
    assert.strictEqual(it.divergente, true); assert.strictEqual(it.motivo_divergencia, null);
  });

  await test('Separa menos por FALTA de saldo, ou exatamente o maximo: nao divergente; motivo ignorado', async () => {
    const m = await material(); const A = await loc('C'); await entrar(m, A.id, 3);
    const { id, ids } = await req([[m, 10]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 3, motivo_divergencia: 'nao era divergencia' }]);
    const it = itensDa((await rodadas(id))[0])[0];
    assert.strictEqual(it.maximo, 3); assert.strictEqual(it.divergente, false); assert.strictEqual(it.motivo_divergencia, null);
  });

  await test('Fase 2: UMA origem na rodada limita o maximo ao saldo nela (4 em A, 6 em B: separar 4 de A nao e divergencia)', async () => {
    const m = await material(); const A = await loc('OA'); const B = await loc('OB');
    await entrar(m, A.id, 4); await entrar(m, B.id, 6);
    const { id, ids } = await req([[m, 10]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 4, localizacao_origem_id: A.id }]);
    const it = itensDa((await rodadas(id))[0])[0];
    assert.strictEqual(it.maximo, 4); assert.strictEqual(it.divergente, false);
    // Metade positiva: 3 de B (que tem 6) é divergente.
    const r2 = await req([[m, 10]]);
    await separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 3, localizacao_origem_id: B.id }]);
    const it2 = itensDa((await rodadas(r2.id))[0])[0];
    assert.strictEqual(it2.maximo, 6); assert.strictEqual(it2.divergente, true);
  });

  await test('Fase 2: o mesmo item duas vezes no payload e UMA regua (4 + 6 de 10 nao e divergente)', async () => {
    const m = await material(); const A = await loc('D'); await entrar(m, A.id, 10);
    const { id, ids } = await req([[m, 10]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 4 }, { item_id: ids[0], quantidade_separada: 6 }]);
    const its = itensDa((await rodadas(id))[0]);
    assert.ok(its.length >= 1 && its.every((x) => x.divergente === false && x.maximo === 10), JSON.stringify(its));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
