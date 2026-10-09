/**
 * Etapa 98 T3 — o C190 (B509): a entrega, a fila e o detalhe dizem o que o motor deixa sair quando o disponivel do
 * material esta negativo, e a recusa nomeia a retencao e a saida (literal E190). Com a A49 (consulta de producao).
 *
 * Antes: reserva 4 cobrindo a caixa 4 e o ADMIN bloqueia 1 (a guarda da B496 nao conta o reservado). A previa da
 * entrega somava o disponivel do material (-1) com a reserva do item (4) e anunciava "Maximo: 3"; a fila dizia
 * ENTREGAR e o detalhe `quantidade_entregavel` 3 — e o motor recusava QUALQUER quantidade ("Saldo fisico insuficiente
 * para consumir a reserva. Disponivel: -1 PC"): o claim do consumo exige o disponivel do material >= 0. Sem reserva no
 * item, quando a reserva de OUTRA requisicao ocupa o fisico, o detalhe dizia -1 e a recusa "Maximo: -1".
 *
 * Agora `entregavelPeloMotor(disponivelDoMaterial, reservaDoItem, permiteNegativo)` = 0 quando o disponivel do material
 * (sem a reserva do item) e negativo e o motor nao permite negativo; a previa recusa com E190 antes de qualquer baixa.
 *
 * Casos `[98 RN-12]`. Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa98-devolver-da-caixa-a-prateleira.md
 * Executar: cd server && node tests/api/entregaDisponivelNegativo.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 98c', role: 'admin', is_superadmin: 1, email: 'a98c@t.com' },
  S: { id: 9811, nome: 'Solic 98c', role: 'user', email: 's98c@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9812, nome: 'Almox 98c', role: 'user', email: 'x98c@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

// A49 (plano, "Letra A"), o texto do plano — rodado como o almoxarife rodaria em producao.
const A49 = `SELECT rq.numero, rq.status, ma.codigo,
       ROUND(COALESCE(ix.quantidade_separada,0) - COALESCE(ix.quantidade_entregue, ix.quantidade_atendida, 0), 6) AS na_caixa,
       ROUND(ma.quantidade_atual - COALESCE(ma.quantidade_reservada,0) - COALESCE(ma.quantidade_bloqueada,0)
             - COALESCE(ma.quantidade_em_inspecao,0) - COALESCE(ma.quantidade_em_terceiros,0), 6) AS disponivel_material,
       ROUND(COALESCE(ma.quantidade_bloqueada,0), 6) AS bloqueado
FROM itens_requisicao_almoxarifado ix
JOIN requisicoes_almoxarifado rq ON rq.id = ix.requisicao_id
JOIN materiais_almoxarifado ma ON ma.id = ix.material_id
WHERE COALESCE(rq.ativo, 1) = 1
  AND rq.status IN ('EM_SEPARACAO','PRONTA_PARA_RETIRADA','PARCIALMENTE_ATENDIDA')
  AND COALESCE(ix.quantidade_separada,0) - COALESCE(ix.quantidade_entregue, ix.quantidade_atendida, 0) > 0.000001
  AND COALESCE(ma.permite_saldo_negativo, 0) = 0
  AND ma.quantidade_atual - COALESCE(ma.quantidade_reservada,0) - COALESCE(ma.quantidade_bloqueada,0)
      - COALESCE(ma.quantidade_em_inspecao,0) - COALESCE(ma.quantidade_em_terceiros,0) < -0.000001
ORDER BY rq.numero, ma.codigo;`;

// Literais (plano, "O C190"): a de hoje e o sufixo E190 nas suas formas.
const BASE = (nome, q, p) => `${nome}: não é possível entregar ${q} PC. Máximo: 0 (pendente: ${p}, disponível: 0)`;
const E190_COM = (nome, partes) => ` — o disponível de ${nome} está negativo (${partes}): nada dele sai pela entrega até `
  + 'liberar da reserva desta requisição o que está retido, ou desbloquear';
const E190_COM_LEGADO = (nome) => ` — o disponível de ${nome} está negativo (reservado além do físico): nada dele sai pela `
  + 'entrega até liberar da reserva desta requisição o que passa do físico';
// Fase 5 (revisor 1, e98rv1-a S2 e e98rv1-b B1): sem reserva no item, OU com reserva que nao cobre o deficit
// (reserva do item + disponivel <= 0: liberar dela nao muda o que sai), a saida e OUTRA reserva — de outra requisicao
// ou MANUAL (o "(de outra requisição)" de antes mentia com a manual) — ou desbloquear.
const E190_OUTRA = (nome, partes) => ` — o disponível de ${nome} está negativo (${partes}): nada dele sai pela entrega até `
  + 'liberar outra reserva deste material ou desbloquear';
const E190_OUTRA_LEGADO = (nome) => ` — o disponível de ${nome} está negativo (reservado além do físico): nada dele sai pela `
  + 'entrega até liberar outra reserva deste material';

(async () => {
  console.log('\n=== Etapa 98 T3: a entrega com o disponivel do material negativo (C190) ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    get: (u) => request(app).get(u).set('x-teste-usuario', k).then((x) => x),
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });

  const material = async (fisico = 0, permiteNeg = 0) => {
    const c = `E98C-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, custo_unitario, permite_saldo_negativo) VALUES (?, ?, 'PC', ?, 0, 1, 0.1, ?)`, [c, c, fisico, permiteNeg])).lastID;
  };
  const nomeDe = async (m) => (await dbGet(db, 'SELECT nome FROM materiais_almoxarifado WHERE id=?', [m])).nome;
  const req = async (itens) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-98C',
      itens: itens.map(([m, q]) => ({ material_id: m, quantidade: q })),
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
  const entrar = async (m, q) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e98c' });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const separar = async (R, pares, u = 'ALMOX') => {
    const s = await como(u).put(`${API}/requisicoes/${R}/separar`, {
      itens_separados: pares.map(([item_id, q]) => ({ item_id, quantidade_separada: q })),
    });
    assert.strictEqual(s.status, 200, `separar: ${JSON.stringify(s.body)}`);
  };
  const bloquear = async (m, q) => {
    const r = await como('ADMIN').post(`${API}/materiais/${m}/bloquear`, { quantidade: q, motivo: 'e98c', justificativa: 'teste da etapa 98 T3' });
    assert.strictEqual(r.status, 200, `bloquear: ${JSON.stringify(r.body)}`);
  };
  const entregar = (R, pares, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/entregar`, {
    itens_atendidos: pares.map(([item_id, q]) => ({ item_id, quantidade_atendida: q })),
  });
  const liberarReserva = async (R, q) => {
    const rid = (await dbGet(db, "SELECT id FROM reservas_material_almoxarifado WHERE requisicao_id=? AND status='ATIVA'", [R])).id;
    const l = await como('ALMOX').post(`${API}/reservas/${rid}/liberar`, { ...(q ? { quantidade: q } : {}), motivo: 'e98c retido' });
    assert.strictEqual(l.status, 200, `liberar reserva: ${JSON.stringify(l.body)}`);
  };
  const filaDe = async (R) => (await como('ALMOX').get(`${API}/fila-separacao`)).body.find((l) => Number(l.id) === Number(R)) || null;
  const detalheItem = async (R, item) => {
    const d = await como('ALMOX').get(`${API}/requisicoes/${R}`);
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    return d.body.itens.find((i) => Number(i.id) === Number(item));
  };
  // O que uma recusa da previa nao pode mudar: o livro, o material, a reserva, o item.
  const retrato = async (c) => ({
    mov: (await dbGet(db, 'SELECT COUNT(*) AS n FROM movimentacoes_almoxarifado WHERE material_id=?', [c.m])).n,
    mat: await dbGet(db, 'SELECT quantidade_atual, quantidade_reservada, quantidade_bloqueada FROM materiais_almoxarifado WHERE id=?', [c.m]),
    res: await dbAll(db, 'SELECT id, quantidade, quantidade_utilizada, status FROM reservas_material_almoxarifado WHERE material_id=? ORDER BY id', [c.m]),
    item: await dbGet(db, 'SELECT quantidade_separada, quantidade_entregue, quantidade_atendida FROM itens_requisicao_almoxarifado WHERE id=?', [c.ids[0]]),
  });
  const a49 = async (numero) => (await dbAll(db, A49)).filter((l) => l.numero === numero);
  // Montagem com reserva (Fase 0): entra 4, S pede 4, a aprovacao reserva 4, ALMOX separa 4.
  const comReserva = async ({ permiteNeg = 0 } = {}) => {
    const m = await material(0, permiteNeg);
    await entrar(m, 4);
    const a = await req([[m, 4]]); await aprovar(a.R);
    await separar(a.R, [[a.ids[0], 4]]);
    return { m, ...a };
  };

  await test('[98 RN-12] premissa da montagem: reserva 4 cobre a caixa 4; sem bloqueio a fila diz ENTREGAR e o detalhe 4', async () => {
    const c = await comReserva();
    const r = await dbGet(db, "SELECT SUM(quantidade - COALESCE(quantidade_utilizada,0)) AS s FROM reservas_material_almoxarifado WHERE requisicao_id=? AND status='ATIVA'", [c.R]);
    assert.strictEqual(r.s, 4);
    const f = await filaDe(c.R);
    assert.ok(f && f.etapas.includes('ENTREGAR'), JSON.stringify(f));
    assert.strictEqual((await detalheItem(c.R, c.ids[0])).quantidade_entregavel, 4);
  });

  await test('[98 RN-12] bloqueio 1 sobre a reserva separada: fila AGUARDANDO_SALDO (entregavel 0), detalhe 0, entregar 1 -> 400 E190 antes de qualquer baixa; liberar 1 da reserva -> entregar 3 -> 200; a A49 acha antes e nao acha depois', async () => {
    const c = await comReserva();
    const nome = await nomeDe(c.m);
    await bloquear(c.m, 1);
    const f = await filaDe(c.R);
    assert.ok(f, 'a requisicao sumiu da fila');
    assert.ok(!f.etapas.includes('ENTREGAR'), `fila: ${JSON.stringify(f.etapas)}`);
    assert.ok(f.etapas.includes('AGUARDANDO_SALDO'), `fila: ${JSON.stringify(f.etapas)}`);
    assert.strictEqual(f.itens[0].entregavel, 0);
    assert.strictEqual((await detalheItem(c.R, c.ids[0])).quantidade_entregavel, 0);
    assert.deepStrictEqual((await a49(c.numero)).map((l) => [l.na_caixa, l.disponivel_material, l.bloqueado]), [[4, -1, 1]]);
    const antes = await retrato(c);
    const e = await entregar(c.R, [[c.ids[0], 1]]);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, BASE(nome, 1, 4) + E190_COM(nome, '1 PC bloqueados'));
    assert.deepStrictEqual(await retrato(c), antes, 'a recusa mudou o livro, o material, a reserva ou o item');
    await liberarReserva(c.R, 1);
    const ok = await entregar(c.R, [[c.ids[0], 3]]);
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.deepStrictEqual(await a49(c.numero), []);
  });

  // Fase 5: era E190_COM ("liberar da reserva desta requisição") — com reserva 4 e deficit 4, liberar a propria reserva
  // leva o disponivel a 0 e a reserva a 0: nada sai. Mandava a uma saida que nao destrava (o S2 do revisor 1).
  await test('[98 RN-12] (Fase 5) bloqueio 4 sobre reserva 4: a reserva nao cobre o deficit -> E190 "outra reserva"; liberar a propria nao destrava; desbloquear destrava', async () => {
    const c = await comReserva();
    const nome = await nomeDe(c.m);
    await bloquear(c.m, 4);
    const e = await entregar(c.R, [[c.ids[0], 4]]);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, BASE(nome, 4, 4) + E190_OUTRA(nome, '4 PC bloqueados'));
    assert.strictEqual((await detalheItem(c.R, c.ids[0])).quantidade_entregavel, 0);
    const d = await como('ADMIN').post(`${API}/materiais/${c.m}/desbloquear`, { quantidade: 4, motivo: 'e98c', justificativa: 'teste da etapa 98 F5' });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.strictEqual((await entregar(c.R, [[c.ids[0], 4]])).status, 200);
  });

  // Fase 5 (revisor 1, e98rv1-a S2): R1 reserva 1, R3 reserva 3, fisico 4, bloqueio 1 -> disponivel -1. A E190 de R1
  // mandava "liberar da reserva desta requisição": R1 liberava a propria reserva, continuava presa (0 + 0) e perdia a
  // prioridade. A saida e "desta" so quando reserva do item + disponivel > folga; aqui 1 + (-1) = 0.
  await test('[98 RN-12] (Fase 5) reserva do item = deficit (1 e -1): E190 "outra reserva"; liberar a propria reserva NAO destrava; liberar 1 da reserva de R3 destrava', async () => {
    const m = await material(0);
    const nome = await nomeDe(m);
    await entrar(m, 4);
    const r1 = await req([[m, 1]]); await aprovar(r1.R);
    const r3 = await req([[m, 3]]); await aprovar(r3.R);
    await separar(r1.R, [[r1.ids[0], 1]]);
    await bloquear(m, 1);
    const e = await entregar(r1.R, [[r1.ids[0], 1]]);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, BASE(nome, 1, 1) + E190_OUTRA(nome, '1 PC bloqueados'));
    // a prova de que "desta requisição" mentia: liberada a propria reserva, a entrega continua recusada
    await liberarReserva(r1.R, 1);
    const e2 = await entregar(r1.R, [[r1.ids[0], 1]]);
    assert.strictEqual(e2.status, 400, JSON.stringify(e2.body));
    await liberarReserva(r3.R, 1);
    const ok = await entregar(r1.R, [[r1.ids[0], 1]]);
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  });

  await test('[98 RN-12] (Fase 5) a fronteira: reserva do item 2 e deficit 1 (2 + (-1) > 0) -> E190 "desta requisição"; liberar 1 da propria destrava 1', async () => {
    const m = await material(0);
    const nome = await nomeDe(m);
    await entrar(m, 4);
    const r1 = await req([[m, 2]]); await aprovar(r1.R);
    const r3 = await req([[m, 2]]); await aprovar(r3.R);
    await separar(r1.R, [[r1.ids[0], 2]]);
    await bloquear(m, 1);
    const e = await entregar(r1.R, [[r1.ids[0], 1]]);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, BASE(nome, 1, 2) + E190_COM(nome, '1 PC bloqueados'));
    await liberarReserva(r1.R, 1);
    const ok = await entregar(r1.R, [[r1.ids[0], 1]]);
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  });

  // Fase 5 (revisor 1, e98rv1-b B1): sem reserva no item e a unica reserva do material e MANUAL — a E190 dizia "(de outra
  // requisição)". Agora "outra reserva deste material" vale para as duas origens.
  await test('[98 RN-12] (Fase 5) sem reserva no item e o deficit e de reserva MANUAL: E190 "outra reserva" (sem "de outra requisição"); liberar a manual destrava', async () => {
    const m = await material(0);
    const nome = await nomeDe(m);
    const r2 = await req([[m, 2]]); await aprovar(r2.R);
    await entrar(m, 6);
    await separar(r2.R, [[r2.ids[0], 2]]);
    const man = await como('ADMIN').post(`${API}/reservas`, { material_id: m, quantidade: 4, observacoes: 'e98c manual' });
    assert.strictEqual(man.status, 201, JSON.stringify(man.body));
    await bloquear(m, 3);
    const origens = await dbAll(db, "SELECT origem FROM reservas_material_almoxarifado WHERE material_id=? AND status='ATIVA'", [m]);
    assert.deepStrictEqual(origens.map((o) => o.origem), ['MANUAL'], 'premissa: so a reserva manual');
    const e = await entregar(r2.R, [[r2.ids[0], 1]]);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, BASE(nome, 1, 2) + E190_OUTRA(nome, '3 PC bloqueados'));
    assert.ok(!/de outra requisição/.test(e.body.error), e.body.error);
    const rid = (await dbGet(db, "SELECT id FROM reservas_material_almoxarifado WHERE material_id=? AND status='ATIVA'", [m])).id;
    const l = await como('ADMIN').post(`${API}/reservas/${rid}/liberar`, { motivo: 'e98c manual' });
    assert.strictEqual(l.status, 200, JSON.stringify(l.body));
    assert.strictEqual((await entregar(r2.R, [[r2.ids[0], 2]])).status, 200);
  });

  await test('[98 RN-12] (Fase 5) legado sem retencao e sem reserva no item: E190 "reservado alem do fisico" e "liberar outra reserva deste material"', async () => {
    const m = await material(0);
    const nome = await nomeDe(m);
    const r2 = await req([[m, 2]]); await aprovar(r2.R);
    await entrar(m, 6);
    await separar(r2.R, [[r2.ids[0], 2]]);
    const r1 = await req([[m, 4]]); await aprovar(r1.R); // reserva 4
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 3 WHERE id=?', [m]); // escritor de legado: 3 - 4 = -1
    const e = await entregar(r2.R, [[r2.ids[0], 1]]);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, BASE(nome, 1, 2) + E190_OUTRA_LEGADO(nome));
  });

  await test('[98 RN-12] retencoes em ordem: bloqueado e em inspecao (escritor de legado) nas ⟨partes⟩', async () => {
    const c = await comReserva();
    const nome = await nomeDe(c.m);
    await bloquear(c.m, 1);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_inspecao = 2, quantidade_em_terceiros = 0.5 WHERE id=?', [c.m]);
    const e = await entregar(c.R, [[c.ids[0], 1]]);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, BASE(nome, 1, 4) + E190_COM(nome, '1 PC bloqueados, 2 PC em inspeção, 0.5 PC em terceiros'));
  });

  await test('[98 RN-12] legado: reserva maior que o fisico sem retencao -> E190 "reservado alem do fisico" e "o que passa do fisico"', async () => {
    const c = await comReserva();
    const nome = await nomeDe(c.m);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 3 WHERE id=?', [c.m]); // escritor de legado
    const e = await entregar(c.R, [[c.ids[0], 1]]);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, BASE(nome, 1, 4) + E190_COM_LEGADO(nome));
  });

  await test('[98 RN-12] guarda: sem bloqueio a recusa da entrega e byte a byte a de hoje (acima do pendente)', async () => {
    const c = await comReserva();
    const nome = await nomeDe(c.m);
    const e = await entregar(c.R, [[c.ids[0], 5]]);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, `${nome}: não é possível entregar 5 PC. Máximo: 4 (pendente: 4, disponível: 4)`);
    const ok = await entregar(c.R, [[c.ids[0], 4]]);
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  });

  await test('[98 RN-12] guarda: com permite_saldo_negativo e bloqueio 1 o motor passa — fila ENTREGAR, detalhe 3, entregar 3 -> 200 (como hoje); a A49 nao acha', async () => {
    const c = await comReserva({ permiteNeg: 1 });
    await bloquear(c.m, 1);
    const f = await filaDe(c.R);
    assert.ok(f && f.etapas.includes('ENTREGAR'), JSON.stringify(f));
    assert.strictEqual(f.itens[0].entregavel, 3);
    assert.strictEqual((await detalheItem(c.R, c.ids[0])).quantidade_entregavel, 3);
    assert.deepStrictEqual(await a49(c.numero), []);
    const ok = await entregar(c.R, [[c.ids[0], 3]]);
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  });

  await test('[98 RN-12] guarda: com permite_saldo_negativo_global (a regra do motor le tambem a global) e bloqueio 1 — fila ENTREGAR, detalhe 3, entregar 3 -> 200', async () => {
    const c = await comReserva();
    await bloquear(c.m, 1);
    const antes = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave='permite_saldo_negativo_global'");
    await dbRun(db, "INSERT OR REPLACE INTO configuracoes_almoxarifado (chave, valor) VALUES ('permite_saldo_negativo_global', '1')");
    try {
      const f = await filaDe(c.R);
      assert.ok(f && f.etapas.includes('ENTREGAR'), JSON.stringify(f));
      assert.strictEqual(f.itens[0].entregavel, 3);
      assert.strictEqual((await detalheItem(c.R, c.ids[0])).quantidade_entregavel, 3);
      const ok = await entregar(c.R, [[c.ids[0], 3]]);
      assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    } finally {
      if (antes) await dbRun(db, "UPDATE configuracoes_almoxarifado SET valor=? WHERE chave='permite_saldo_negativo_global'", [antes.valor]);
      else await dbRun(db, "DELETE FROM configuracoes_almoxarifado WHERE chave='permite_saldo_negativo_global'");
    }
  });

  await test('[98 RN-12] (Fase 2, B-2) sem reserva no item: a reserva de OUTRA requisicao ocupa o fisico; R2 fila AGUARDANDO_SALDO, detalhe 0 (era -1), entregar 1 -> 400 E190 forma sem reserva; liberar a reserva de R1 -> R2 entrega 2; a A49 acha R2 antes e nao depois', async () => {
    const m = await material(0);
    const nome = await nomeDe(m);
    const r2 = await req([[m, 2]]); await aprovar(r2.R); // sem saldo: nada reservado
    await entrar(m, 6);
    await separar(r2.R, [[r2.ids[0], 2]]);
    const r1 = await req([[m, 4]]); await aprovar(r1.R); // reserva 4
    const res1 = await dbGet(db, "SELECT SUM(quantidade) AS s FROM reservas_material_almoxarifado WHERE requisicao_id=? AND status='ATIVA'", [r1.R]);
    assert.strictEqual(res1.s, 4, 'premissa: R1 reservou 4');
    await bloquear(m, 3);
    const f = await filaDe(r2.R);
    assert.ok(f && !f.etapas.includes('ENTREGAR') && f.etapas.includes('AGUARDANDO_SALDO'), JSON.stringify(f && f.etapas));
    assert.strictEqual((await detalheItem(r2.R, r2.ids[0])).quantidade_entregavel, 0);
    assert.deepStrictEqual((await a49(r2.numero)).map((l) => [l.na_caixa, l.disponivel_material]), [[2, -1]]);
    const e = await entregar(r2.R, [[r2.ids[0], 1]]);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, BASE(nome, 1, 2) + E190_OUTRA(nome, '3 PC bloqueados'));
    await liberarReserva(r1.R);
    const ok = await entregar(r2.R, [[r2.ids[0], 2]]);
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.deepStrictEqual(await a49(r2.numero), []);
  });

  await test('[98 RN-12] entregavelPeloMotor puro: negativo sem flag -> 0; com flag -> disp + r; nao negativo -> disp + r; folga', async () => {
    const f = requisitionService.entregavelPeloMotor;
    assert.strictEqual(typeof f, 'function');
    assert.strictEqual(f(-1, 4, false), 0);
    assert.strictEqual(f(-1, 4, true), 3);
    assert.strictEqual(f(0, 4, false), 4);
    assert.strictEqual(f(2, 0, false), 2);
    assert.strictEqual(f(-1e-12, 4, false), 4 - 1e-12);
    assert.strictEqual(f(-1, 0, false), 0);
  });

  await test('[98 A49][CONTROLE] a consulta acha so o C190: nao acha reserva sem bloqueio nem caixa sem reserva com fisico; coluna trocada -> o banco recusa', async () => {
    const y = await comReserva(); // reserva sem bloqueio
    const mz = await material(0); // caixa sem reserva, fisico sobrando
    const z = await req([[mz, 2]]); await aprovar(z.R); await entrar(mz, 5); await separar(z.R, [[z.ids[0], 2]]);
    await bloquear(mz, 1);
    assert.deepStrictEqual(await a49(y.numero), []);
    assert.deepStrictEqual(await a49(z.numero), []);
    await assert.rejects(() => dbAll(db, A49.replace('COALESCE(ma.quantidade_bloqueada,0), 6) AS bloqueado', 'COALESCE(ma.quantidade_bloqueadx,0), 6) AS bloqueado')),
      /no such column: ma\.quantidade_bloqueadx/);
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
