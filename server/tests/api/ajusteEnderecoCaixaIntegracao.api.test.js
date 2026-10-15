/**
 * Etapa 104 (T3) — integracao: o documento ate o fim, pela ROTA e pelo SERVICO (C186, B704).
 *
 * Contar "0 no A" com 4 na caixa sem reserva grava e avisa (A1); os dois caminhos que a A1 ensina funcionam ate o
 * ultimo gesto: (J1) o estorno do ajuste (perfil com ajustar_estoque — o almoxarife nao tem) devolve o total e a entrega
 * passa; (J2) devolver a prateleira o que se perdeu esvazia a caixa, o ajuste seguinte nao avisa e a requisicao vazia sem
 * entrega e cancelada por quem pediu (Etapa 101); (J3) o teste da Etapa 10 (ajuste com endereco abaixo do reservado) segue
 * passando e sem aviso; (J4) o estorno com varias linhas e uma movimentacao no meio.
 *
 * Plano: docs/superpowers/plans/2026-10-15-almoxarifado-etapa104-ajuste-endereco-avisa-caixa.md
 * Executar: cd server && node tests/api/ajusteEnderecoCaixaIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const caixaSql = require('../../services/almoxarifado/caixaSql');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 104i', role: 'admin', is_superadmin: 1, email: 'a104i@t.com' },
  S: { id: 10421, nome: 'Solic 104i', role: 'user', email: 's104i@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 10422, nome: 'Almox 104i', role: 'user', email: 'x104i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

// Literal A1 (plano, "Contrato congelado").
const A1 = (cod, total, caixa, lista) => `Ajuste gravado, mas o disponível de ${cod} ficou em ${total} PC, abaixo dos ${caixa} PC `
  + `separados para ${lista}: a entrega fica limitada ao disponível. Se o material está na caixa, a contagem não o incluiu `
  + '— estorne o ajuste que baixou o estoque (perfil Administrador ou Gestor do almoxarifado); se ele se perdeu, devolva-o '
  + 'à prateleira na requisição.';

(async () => {
  console.log('\n=== Etapa 104 (T3): o ajuste com endereco ate o ultimo gesto ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
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
    const c = `E104I-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, custo_unitario) VALUES (?, ?, 'PC', 0, 0, 1, 0.1)`, [c, c])).lastID;
    return { id, codigo: c };
  };
  const loc = async () => (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?, 'e104i', 1)",
    [`L104I-${++seq}`])).lastID;
  const req = async (m, q) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-104', itens: [{ material_id: m, quantidade: q }],
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    const { numero } = await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id=?', [cr.body.id]);
    return { R: cr.body.id, ids, numero };
  };
  const aprovar = async (R) => {
    const r = await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {});
    assert.strictEqual(r.status, 200, `aprovar: ${JSON.stringify(r.body)}`);
  };
  const mov = (b, u = 'ADMIN') => como(u).post(`${API}/movimentacoes/v2`, { motivo: 'e104', justificativa: 'contagem e104', ...b });
  const entrar = async (m, q, l) => {
    const r = await mov({ material_id: m, tipo: 'ENTRADA', quantidade: q, localizacao_destino_id: l });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const ajuste = (m, q, l, u) => mov({ material_id: m, tipo: 'AJUSTE', quantidade: q, localizacao_destino_id: l }, u);
  const separar = async (R, item, q) => {
    const s = await como('ALMOX').put(`${API}/requisicoes/${R}/separar`, { itens_separados: [{ item_id: item, quantidade_separada: q }] });
    assert.strictEqual(s.status, 200, `separar: ${JSON.stringify(s.body)}`);
  };
  const entregar = (R, item, q) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, {
    itens_atendidos: [{ item_id: item, quantidade_atendida: q }],
  });
  const estornar = (id, u) => como(u).post(`${API}/movimentacoes/${id}/cancelar`, { motivo: 'a contagem nao viu a caixa' });
  const total = async (m) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id=?', [m])).q;
  const statusReq = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id=?', [R])).status;
  const semAviso = (r, rotulo) => {
    assert.strictEqual(r.status, 201, `${rotulo}: ${r.status} ${JSON.stringify(r.body)}`);
    assert.ok(!('aviso_caixa' in r.body), `${rotulo}: nao devia ter aviso_caixa: ${JSON.stringify(r.body)}`);
  };
  // caixa sem reserva `pede` no endereco A com `fisico` (a ENTRADA vem DEPOIS da aprovacao: sem reserva)
  const montagem = async ({ fisico = 4, pede = 4 } = {}) => {
    const mat = await material(); const A = await loc();
    const a = await req(mat.id, pede); await aprovar(a.R);
    await entrar(mat.id, fisico, A);
    await separar(a.R, a.ids[0], pede);
    return { ...mat, m: mat.id, A, ...a };
  };

  await test('[104 J1] pela ROTA: almoxarife conta 0 -> 201 com A1; a entrega presa em "Maximo: 0"; o almoxarife nao estorna (403); o ADMIN estorna; a entrega 4 passa', async () => {
    const x = await montagem();
    const r = await ajuste(x.m, 0, x.A, 'ALMOX');
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.aviso_caixa, A1(x.codigo, 0, 4, `a requisição ${x.numero}`));
    const presa = await entregar(x.R, x.ids[0], 4);
    assert.strictEqual(presa.status, 400);
    assert.ok(/Máximo: 0/.test(presa.body.error), presa.body.error);
    const semPerfil = await estornar(r.body.id, 'ALMOX');
    assert.strictEqual(semPerfil.status, 403, JSON.stringify(semPerfil.body));
    assert.strictEqual(semPerfil.body.error, 'Sem permissão para esta operação'); // a literal que o manual cita
    const est = await estornar(r.body.id, 'ADMIN');
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));
    assert.strictEqual(await total(x.m), 4);
    const e = await entregar(x.R, x.ids[0], 4);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.strictEqual(await statusReq(x.R), 'ENTREGUE');
  });

  await test('[104 J2] pelo SERVICO: o aviso no retorno; devolver a prateleira os 4 perdidos esvazia a caixa; novo ajuste sem aviso; quem pediu cancela a vazia', async () => {
    const x = await montagem();
    const r = await stockService.registrarMovimentacao(db, { ...USERS.ADMIN },
      { material_id: x.m, tipo: 'AJUSTE', quantidade: 0, localizacao_destino_id: x.A, motivo: 'e104', justificativa: 'contagem e104' });
    assert.strictEqual(r.aviso_caixa, A1(x.codigo, 0, 4, `a requisição ${x.numero}`));
    const d = await como('ALMOX').put(`${API}/requisicoes/${x.R}/devolver-separado`, {
      motivo: 'perdido da caixa', itens: [{ item_id: x.ids[0], quantidade: 4 }],
    });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.strictEqual((await caixaSql.lerCaixa(db, x.m)).caixa, 0);
    semAviso(await ajuste(x.m, 0, x.A), 'depois de devolver');
    assert.strictEqual(await statusReq(x.R), 'EM_SEPARACAO');
    const c = await como('S').put(`/api/requisicoes-material/${x.R}/cancelar`, { motivo: 'material perdido' });
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.strictEqual(await statusReq(x.R), 'CANCELADO');
  });

  await test('[104 J3] o teste da Etapa 10 segue valendo: ajuste com endereco abaixo do reservado (sem caixa) passa e nao avisa', async () => {
    const A = await loc();
    const mid = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_reservada, ativo)
      VALUES ('E104I-RES', 'reservado', 'PC', 10, 8, 1)`)).lastID;
    semAviso(await ajuste(mid, 2, A), 'Etapa 10');
    assert.strictEqual(await total(mid), 2);
  });

  await test('[104 J4] estorno com duas linhas e uma ENTRADA no meio: A:4 B:2, conta A->0 (aviso, total 2), entra 1 em B, estorna -> A 4, total 7, a entrega 4 passa', async () => {
    const mat = await material(); const A = await loc(); const B = await loc();
    const a = await req(mat.id, 4); await aprovar(a.R);
    await entrar(mat.id, 4, A); await entrar(mat.id, 2, B);
    await separar(a.R, a.ids[0], 4);
    const r = await ajuste(mat.id, 0, A);
    assert.strictEqual(r.body.aviso_caixa, A1(mat.codigo, 2, 4, `a requisição ${a.numero}`));
    await entrar(mat.id, 1, B);
    const est = await estornar(r.body.id, 'ADMIN');
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));
    const linhaA = await dbGet(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id=? AND localizacao_id=?', [mat.id, A]);
    assert.deepStrictEqual([linhaA.quantidade, await total(mat.id)], [4, 7]);
    const e = await entregar(a.R, a.ids[0], 4);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
  });

  await test('[104 J5] (Fase 2, achado 1) A->0 e depois A->3 (sobe, ainda abaixo): os dois avisam; estornar o A->3 e recusado (97); estornar o que BAIXOU destrava', async () => {
    const x = await montagem();
    const r0 = await ajuste(x.m, 0, x.A);
    assert.strictEqual(r0.body.aviso_caixa, A1(x.codigo, 0, 4, `a requisição ${x.numero}`));
    const r3 = await ajuste(x.m, 3, x.A);
    assert.strictEqual(r3.body.aviso_caixa, A1(x.codigo, 3, 4, `a requisição ${x.numero}`));
    // a A1 diz "o ajuste que baixou o estoque" — nao "este": o estorno do que subiu reduz e a guarda da 97 o recusa
    const errado = await estornar(r3.body.id, 'ADMIN');
    assert.strictEqual(errado.status, 400, JSON.stringify(errado.body));
    assert.ok(/separada na caixa de requisição: 4/.test(errado.body.error), errado.body.error);
    const certo = await estornar(r0.body.id, 'ADMIN');
    assert.strictEqual(certo.status, 200, JSON.stringify(certo.body));
    assert.strictEqual(await total(x.m), 7);
    const e = await entregar(x.R, x.ids[0], 4);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
