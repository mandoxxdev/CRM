/**
 * Etapa 128, T6 (integracao, RN-20) — o aviso da retencao (C209) pela ROTA e pelo SERVICO, e os dois caminhos que ele manda
 * seguir levados ate o fim (Fase 2, I1): "existe" (o Gestor estorna o ajuste e a entrega passa) e "se perdeu" (o Almoxarife
 * devolve a prateleira na requisicao e libera a reserva — so os dois juntos tiram o disponivel do negativo). E a frase "nada dele
 * sai pela entrega de requisicao enquanto for assim" conferida contra a entrega real.
 *
 * Plano: docs/superpowers/plans/2026-10-16-almoxarifado-etapa128-o-tempo-do-recebimento-e-o-aviso-da-retencao.md
 *
 * Executar: cd server && node tests/api/ajusteEnderecoRetencaoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const stockService = require('../../services/almoxarifado/stockService');
const caixaSql = require('../../services/almoxarifado/caixaSql');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 128i', role: 'admin', is_superadmin: 1, email: 'a128i@t.com' },
  S: { id: 12831, nome: 'Solic 128i', role: 'user', email: 's128i@t.com' },
  ALMOX: { id: 12832, nome: 'Almox 128i', role: 'user', email: 'x128i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
  GESTOR: { id: 12833, nome: 'Gestor 128i', role: 'user', email: 'g128i@t.com', perfil_almoxarifado: PERFIS.GESTOR },
};
const API = '/api/almoxarifado';
let seq = 0;

(async () => {
  console.log('\n=== Etapa 128 T6: aviso da retencao — rota, servico e os caminhos ate o fim ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });
  const material = async () => {
    const c = `E128I-${++seq}`;
    return { id: (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
      ativo, custo_unitario) VALUES (?, ?, 'PC', 0, 0, 1, 0.1)`, [c, c])).lastID, codigo: c };
  };
  const loc = async () => (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?, 'e128i', 1)",
    [`L128I-${++seq}`])).lastID;
  const mov = (b, u = 'ADMIN') => como(u).post(`${API}/movimentacoes/v2`, { motivo: 'e128i', justificativa: 'contagem e128i', ...b });
  const requisicao = async (m, q) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-128I', itens: [{ material_id: m, quantidade: q }],
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    const ap = await como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/aprovar`, {});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    return { R: cr.body.id, ids };
  };
  const separar = async (R, item, q) => {
    const s = await como('ALMOX').put(`${API}/requisicoes/${R}/separar`, { itens_separados: [{ item_id: item, quantidade_separada: q }] });
    assert.strictEqual(s.status, 200, `separar: ${JSON.stringify(s.body)}`);
  };
  const entregar = (R, item, q) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`,
    { itens_atendidos: [{ item_id: item, quantidade_atendida: q }] });
  const disponivel = async (m) => (await dbGet(db, `SELECT quantidade_atual - quantidade_reservada - COALESCE(quantidade_bloqueada,0)
    - COALESCE(quantidade_em_inspecao,0) - COALESCE(quantidade_em_terceiros,0) AS d FROM materiais_almoxarifado WHERE id=?`, [m])).d;
  // a C209 montada: fisico 4 no A, requisicao de 4 aprovada (reserva 4) e separada
  const c209 = async () => {
    const mat = await material(); const A = await loc();
    const e = await mov({ material_id: mat.id, tipo: 'ENTRADA', quantidade: 4, localizacao_destino_id: A });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
    const a = await requisicao(mat.id, 4);
    await separar(a.R, a.ids[0], 4);
    return { ...mat, A, ...a };
  };

  await test('[128 RN-20] a rota e o servico dao o MESMO aviso (C209 e reserva sem caixa)', async () => {
    const x = await c209();
    const r = await mov({ material_id: x.id, tipo: 'AJUSTE', quantidade: 0, localizacao_destino_id: x.A });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.ok(/devolva-o à prateleira na requisição e libere a reserva/.test(r.body.aviso_retencao), r.body.aviso_retencao);
    const y = await c209();
    const s = await stockService.registrarMovimentacao(db, USERS.ADMIN, {
      material_id: y.id, tipo: 'AJUSTE', quantidade: 0, localizacao_destino_id: y.A, motivo: 'e128i', justificativa: 'contagem e128i',
    });
    assert.strictEqual(s.aviso_retencao, r.body.aviso_retencao.split(x.codigo).join(y.codigo));
    // reserva sem caixa
    const m = await material(); const B = await loc();
    await mov({ material_id: m.id, tipo: 'ENTRADA', quantidade: 4, localizacao_destino_id: B });
    await requisicao(m.id, 3);
    const r2 = await mov({ material_id: m.id, tipo: 'AJUSTE', quantidade: 1, localizacao_destino_id: B });
    const m2 = await material(); const B2 = await loc();
    await mov({ material_id: m2.id, tipo: 'ENTRADA', quantidade: 4, localizacao_destino_id: B2 });
    await requisicao(m2.id, 3);
    const s2 = await stockService.registrarMovimentacao(db, USERS.ADMIN, {
      material_id: m2.id, tipo: 'AJUSTE', quantidade: 1, localizacao_destino_id: B2, motivo: 'e128i', justificativa: 'contagem e128i',
    });
    assert.ok(r2.body.aviso_retencao, JSON.stringify(r2.body));
    assert.strictEqual(s2.aviso_retencao, r2.body.aviso_retencao.split(m.codigo).join(m2.codigo));
    assert.ok(/se ele se perdeu, libere a reserva \(perfil Administrador ou Almoxarife\)\.$/.test(r2.body.aviso_retencao), r2.body.aviso_retencao);
  });

  await test('[128 RN-20] "nada dele sai pela entrega": depois do aviso, a entrega recusa com Maximo: 0', async () => {
    const x = await c209();
    const r = await mov({ material_id: x.id, tipo: 'AJUSTE', quantidade: 0, localizacao_destino_id: x.A });
    assert.ok(r.body.aviso_retencao);
    const e = await entregar(x.R, x.ids[0], 4);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.ok(/Máximo: 0 /.test(e.body.error), e.body.error);
  });

  await test('[128 RN-20] caminho "existe": o Gestor estorna o ajuste que baixou, o disponivel volta e a entrega passa', async () => {
    const x = await c209();
    const r = await mov({ material_id: x.id, tipo: 'AJUSTE', quantidade: 0, localizacao_destino_id: x.A });
    assert.ok(/estorne o ajuste que baixou o estoque \(perfil Administrador ou Gestor do almoxarifado\)/.test(r.body.aviso_retencao));
    const est = await como('GESTOR').post(`${API}/movimentacoes/${r.body.id}/cancelar`, { motivo: 'a contagem nao incluiu a caixa' });
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));
    assert.strictEqual(await disponivel(x.id), 0, 'fisico 4, reservado 4');
    const e = await entregar(x.R, x.ids[0], 4);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
  });

  await test('[128 RN-20] caminho "se perdeu": o Almoxarife devolve a prateleira E libera a reserva -> o disponivel sai do negativo e o ajuste seguinte nao avisa', async () => {
    const x = await c209();
    const r = await mov({ material_id: x.id, tipo: 'AJUSTE', quantidade: 0, localizacao_destino_id: x.A });
    assert.ok(r.body.aviso_retencao);
    assert.strictEqual(await disponivel(x.id), -4, 'premissa: negativo');
    const dv = await como('ALMOX').put(`${API}/requisicoes/${x.R}/devolver-separado`, { motivo: 'perdeu', itens: [{ item_id: x.ids[0], quantidade: 4 }] });
    assert.strictEqual(dv.status, 200, JSON.stringify(dv.body));
    assert.strictEqual(await disponivel(x.id), -4, 'so devolver nao basta: a reserva fica');
    const res = await dbGet(db, "SELECT id FROM reservas_material_almoxarifado WHERE material_id=? AND status='ATIVA'", [x.id]);
    assert.ok(res, 'premissa: a reserva continua ativa depois de devolver');
    const l = await como('ALMOX').post(`${API}/reservas/${res.id}/liberar`, { quantidade: 4, motivo: 'perdeu' });
    assert.strictEqual(l.status, 200, JSON.stringify(l.body));
    assert.strictEqual(await disponivel(x.id), 0, 'os dois gestos juntos tiram do negativo');
    const B = await loc();
    const r2 = await mov({ material_id: x.id, tipo: 'AJUSTE', quantidade: 0, localizacao_destino_id: B });
    assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));
    assert.ok(!('aviso_retencao' in r2.body), `nao devia avisar mais: ${JSON.stringify(r2.body)}`);
  });

  await test('[128 RN-19] (Fase 5 r3) a leitura do aviso que lanca nao derruba o ajuste: 201, sem aviso_retencao, e a contagem gravou', async () => {
    const x = await c209();
    const original = caixaSql.lerCaixaComReserva;
    caixaSql.lerCaixaComReserva = async () => { throw new Error('falha simulada'); };
    const avisos = []; const warn = console.warn; console.warn = (...a) => avisos.push(a.join(' '));
    let r;
    try { r = await mov({ material_id: x.id, tipo: 'AJUSTE', quantidade: 0, localizacao_destino_id: x.A }); } finally {
      caixaSql.lerCaixaComReserva = original; console.warn = warn;
    }
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.ok(!('aviso_retencao' in r.body), JSON.stringify(r.body));
    assert.ok(avisos.some((a) => a.includes('[almoxarifado-retencao]') && a.includes('falha simulada')), JSON.stringify(avisos));
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id=?', [x.id])).q, 0);
  });

  await test('[128 RN-20] (Fase 5 r1) caminho de terceiros: a frase manda recontar somando — a recontagem que soma os 3 tira do negativo, sem aviso', async () => {
    const mat = await material(); const A = await loc();
    await mov({ material_id: mat.id, tipo: 'ENTRADA', quantidade: 4, localizacao_destino_id: A });
    // 3 no terceiro (a remessa nao tira do endereco: o saldo do A continua 4)
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_terceiros = 3 WHERE id = ?', [mat.id]);
    const r = await mov({ material_id: mat.id, tipo: 'AJUSTE', quantidade: 1, localizacao_destino_id: A });
    assert.ok(/O que está em terceiros \(3 PC\) continua no saldo do endereço: refaça a contagem somando-o\./.test(r.body.aviso_retencao), r.body.aviso_retencao);
    const r2 = await mov({ material_id: mat.id, tipo: 'AJUSTE', quantidade: 4, localizacao_destino_id: A });
    assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));
    assert.ok(!('aviso_retencao' in r2.body), JSON.stringify(r2.body));
    assert.strictEqual(await disponivel(mat.id), 1);
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
