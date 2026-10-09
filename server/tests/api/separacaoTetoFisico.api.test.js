/**
 * Etapa 95 — a separacao nao aceita mais do que existe na prateleira (C169, D (60), features 05 com a 04 e a 07).
 *
 * Antes, o separavel de um item era `disponivel do material + reserva do item`: o separado ainda nao entregue nunca
 * era descontado — nem do proprio item (C1: pede 6, fisico 4, separou 4, separava +2) nem das outras requisicoes
 * (M2: duas requisicoes sem reserva separavam 4 cada com 4 fisicos) nem dos outros itens da mesma rodada (M4). A conta
 * nova e o TETO do item (plano, "Regras de negocio", forma da Fase 2):
 *   teto = max(0, r - c) + max(0, disp - csrOutros - max(0, c - r))
 * com disp = disponivel do motor (sem a reserva do item), r = reserva ativa do item, c = caixa do item (separado -
 * entregue) e csrOutros = caixa sem reserva dos outros itens ativos do material; arredondado a 1e-6.
 *
 * Usuarios reais por header (molde 92-94): S sem perfil (PRODUCAO) cria pela rota; ADMIN superadmin aprova pela rota e
 * da entrada solta (movimentacoes/v2 ENTRADA — sem reserva; a reserva na chegada e so da nota, D4 da 74); ALMOX e
 * ALMOX2 (ALMOXARIFE) separam, conferem, liberam e entregam. Material comum (exceto onde dito), custo 0,1.
 *
 * T0: RN-01, RN-02, RN-04, RN-06 (a)(b)(c) e os indices (B478). Casos `[95 RN-xx]`.
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa95-separacao-limitada-ao-fisico.md
 *
 * Executar: cd server && node tests/api/separacaoTetoFisico.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const reservaChegadaService = require('../../services/almoxarifado/reservaChegadaService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 95', role: 'admin', is_superadmin: 1, email: 'a95@t.com' },
  S: { id: 9501, nome: 'Solic 95', role: 'user', email: 's95@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9502, nome: 'Almox 95', role: 'user', email: 'x95@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
  ALMOX2: { id: 9503, nome: 'Almox2 95', role: 'user', email: 'y95@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

// Literal S2 (plano, Contrato): forma inalterada; o `disponível` passa a ser o teto (B471).
const S2 = (nome, q, max, pend, disp) => `${nome}: não é possível separar ${q} PC. Máximo: ${max} (pendente: ${pend}, disponível: ${disp})`;

(async () => {
  console.log('\n=== Etapa 95: a separacao nao aceita mais do que existe na prateleira ===\n');
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

  const nomes = new Map();
  const material = async (fisico = 0, critico = 0) => {
    const c = `E95-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, material_critico, custo_unitario) VALUES (?, ?, 'PC', ?, 0, 1, ?, 0.1)`, [c, c, fisico, critico])).lastID;
    nomes.set(id, c);
    return id;
  };
  const loc = async (n) => {
    const c = `E95L-${n}-${++seq}`;
    return { id: (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', [c, n])).lastID, codigo: c };
  };
  // Pela rota do solicitante; itens: [[material, qtd], ...]
  const req = async (itens) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-95',
      itens: itens.map(([m, q]) => ({ material_id: m, quantidade: q })),
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    return { R: cr.body.id, ids };
  };
  const aprovar = async (R) => {
    const r = await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {});
    assert.strictEqual(r.status, 200, `aprovar: ${JSON.stringify(r.body)}`);
    return r;
  };
  const entrar = async (m, q, destino) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, {
      material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e95', ...(destino ? { localizacao_destino_id: destino } : {}),
    });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const separar = (R, pares, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/separar`, {
    itens_separados: pares.map(([item_id, q, origem]) => ({ item_id, quantidade_separada: q, ...(origem ? { localizacao_origem_id: origem } : {}) })),
  });
  const entregar = (R, pares, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/entregar`, {
    itens_atendidos: pares.map(([item_id, q]) => ({ item_id, quantidade_atendida: q })),
  });
  const ok = (r, msg = '') => assert.strictEqual(r.status, 200, `${msg} ${JSON.stringify(r.body)}`);
  const recusa = (r, literal) => {
    assert.strictEqual(r.status, 400, `esperava 400, veio ${r.status} ${JSON.stringify(r.body)}`);
    if (literal) assert.strictEqual(r.body.error, literal);
  };
  const item = (id) => dbGet(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE id=?', [id]);
  const reqRow = (R) => dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id=?', [R]);
  const rodadas = (R) => dbAll(db, 'SELECT * FROM separacoes_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [R]);
  const mat = (m) => dbGet(db, 'SELECT quantidade_atual, quantidade_reservada FROM materiais_almoxarifado WHERE id=?', [m]);
  const reservaAtiva = async (R) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade - COALESCE(quantidade_utilizada,0)),0) q
    FROM reservas_material_almoxarifado WHERE requisicao_id=? AND status='ATIVA'`, [R])).q);
  // "nada gravado": item, rodadas, status e conferencia iguais ao retrato
  const retrato = async (R, ids) => JSON.stringify({
    itens: await Promise.all(ids.map(async (i) => (await item(i)).quantidade_separada)),
    rodadas: (await rodadas(R)).length,
    req: (({ status, conferido_por_id }) => ({ status, conferido_por_id }))(await reqRow(R)),
  });

  // Cenarios da sonda 1 (pede 6, fisico 4). Com reserva: a entrada vem ANTES da aprovacao (a aprovacao reserva 4).
  const comReserva = async (fisico = 4, pede = 6, critico = 0) => {
    const m = await material(0, critico); await entrar(m, fisico);
    const a = await req([[m, pede]]); await aprovar(a.R);
    assert.strictEqual(await reservaAtiva(a.R), Math.min(fisico, pede), 'premissa: a aprovacao reservou');
    return { m, ...a };
  };
  // Sem reserva: aprovada sem estoque; o material chega solto depois.
  const semReserva = async (fisico = 4, pede = 6) => {
    const m = await material(0);
    const a = await req([[m, pede]]); await aprovar(a.R);
    await entrar(m, fisico);
    assert.strictEqual(await reservaAtiva(a.R), 0, 'premissa: sem reserva');
    return { m, ...a };
  };

  // ───────────────────────────── RN-01 ─────────────────────────────
  await test('[95 RN-01] C1 (o C169): reserva 4, separou 4 de 6 -> +2 recusado (Maximo: 0), nada gravado', async () => {
    const { m, R, ids } = await comReserva();
    ok(await separar(R, [[ids[0], 4]]));
    const antes = await retrato(R, ids);
    recusa(await separar(R, [[ids[0], 2]]), S2(nomes.get(m), 2, 0, 2, 0));
    assert.strictEqual(await retrato(R, ids), antes, 'a recusa nao grava nada');
  });

  await test('[95 RN-01] C2: reserva 4, separou 3 -> +2 recusado (Maximo: 1), +1 aceito', async () => {
    const { m, R, ids } = await comReserva();
    ok(await separar(R, [[ids[0], 3]]));
    recusa(await separar(R, [[ids[0], 2]]), S2(nomes.get(m), 2, 1, 3, 1));
    ok(await separar(R, [[ids[0], 1]]));
  });

  await test('[95 RN-01] C3: legado PARCIALMENTE_RESERVADA com 4 separados (escritor direto) -> +2 recusado', async () => {
    const { m, R, ids } = await comReserva();
    assert.strictEqual((await reqRow(R)).status, 'PARCIALMENTE_RESERVADA', 'premissa');
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada=4 WHERE id=?', [ids[0]]);
    recusa(await separar(R, [[ids[0], 2]]), S2(nomes.get(m), 2, 0, 2, 0));
  });

  await test('[95 RN-01] C4: SEM reserva (4 chegam soltos), separou 4 -> +2 recusado', async () => {
    const { m, R, ids } = await semReserva();
    ok(await separar(R, [[ids[0], 4]]));
    recusa(await separar(R, [[ids[0], 2]]), S2(nomes.get(m), 2, 0, 2, 0));
  });

  await test('[95 RN-01] C5: reserva 4, separou 4, entregou 2 (PARCIALMENTE_ATENDIDA) -> +2 recusado', async () => {
    const { m, R, ids } = await comReserva();
    ok(await separar(R, [[ids[0], 4]]));
    ok(await entregar(R, [[ids[0], 2]]));
    assert.strictEqual((await reqRow(R)).status, 'PARCIALMENTE_ATENDIDA', 'premissa');
    recusa(await separar(R, [[ids[0], 2]]), S2(nomes.get(m), 2, 0, 2, 0));
  });

  await test('[95 RN-01] C6: reserva 4, separou 4, +1 livre depois -> +2 recusado (Maximo: 1), +1 aceito', async () => {
    const { m, R, ids } = await comReserva();
    ok(await separar(R, [[ids[0], 4]]));
    await entrar(m, 1);
    recusa(await separar(R, [[ids[0], 2]]), S2(nomes.get(m), 2, 1, 2, 1));
    ok(await separar(R, [[ids[0], 1]]));
  });

  await test('[95 RN-01] C7: sem reserva, separou 2 de 4 fisicos -> +3 recusado (Maximo: 2), +2 aceito', async () => {
    const { m, R, ids } = await semReserva();
    ok(await separar(R, [[ids[0], 2]]));
    recusa(await separar(R, [[ids[0], 3]]), S2(nomes.get(m), 3, 2, 4, 2));
    ok(await separar(R, [[ids[0], 2]]));
  });

  await test('[95 RN-01] M2: R1 e R2 sem reserva, R1 separa os 4 -> R2 separar 4 recusado (Maximo: 0); R1 entrega 4', async () => {
    const m = await material(0);
    const a = await req([[m, 4]]); await aprovar(a.R);
    const b = await req([[m, 4]]); await aprovar(b.R);
    await entrar(m, 4);
    ok(await separar(a.R, [[a.ids[0], 4]]));
    const antes = await retrato(b.R, b.ids);
    recusa(await separar(b.R, [[b.ids[0], 4]]), S2(nomes.get(m), 4, 0, 4, 0));
    assert.strictEqual(await retrato(b.R, b.ids), antes);
    ok(await entregar(a.R, [[a.ids[0], 4]]), 'a dona da caixa entrega');
  });

  await test('[95 RN-01] M5: dois itens do mesmo material sem reserva, em duas rodadas (4, depois 4) -> a 2a recusada', async () => {
    const m = await material(0);
    const a = await req([[m, 4], [m, 4]]); await aprovar(a.R);
    await entrar(m, 4);
    ok(await separar(a.R, [[a.ids[0], 4]]));
    recusa(await separar(a.R, [[a.ids[1], 4]]), S2(nomes.get(m), 4, 0, 4, 0));
  });

  await test('[95 RN-01] E3 (critico): separa 4 de 4, ALMOX2 confere, +2 recusado e a conferencia fica intacta', async () => {
    const { m, R, ids } = await comReserva(4, 6, 1);
    ok(await separar(R, [[ids[0], 4]]));
    ok(await como('ALMOX2').put(`${API}/requisicoes/${R}/conferir-separacao`, {}), 'conferir');
    assert.strictEqual(Number((await reqRow(R)).conferido_por_id), USERS.ALMOX2.id, 'premissa');
    recusa(await separar(R, [[ids[0], 2]]), S2(nomes.get(m), 2, 0, 2, 0));
    assert.strictEqual(Number((await reqRow(R)).conferido_por_id), USERS.ALMOX2.id, 'a recusa nao limpa a conferencia');
  });

  await test('[95 RN-01] (s6) R1 liberada para retirada com 4 na caixa sem reserva -> R2 separar 4 recusado', async () => {
    const m = await material(0);
    const a = await req([[m, 4]]); await aprovar(a.R);
    const b = await req([[m, 4]]); await aprovar(b.R);
    await entrar(m, 4);
    ok(await separar(a.R, [[a.ids[0], 4]]));
    ok(await como('ALMOX').put(`${API}/requisicoes/${a.R}/liberar-retirada`, {}), 'liberar');
    assert.strictEqual((await reqRow(a.R)).status, 'PRONTA_PARA_RETIRADA', 'premissa');
    recusa(await separar(b.R, [[b.ids[0], 4]]), S2(nomes.get(m), 4, 0, 4, 0));
  });

  await test('[95 RN-01] P4 (Fase 2, I1): caixa de outra sem reserva nao come a RESERVA do item -> R3 separa os 4 reservados', async () => {
    const m = await material(0);
    const a = await req([[m, 4]]); await aprovar(a.R);
    await entrar(m, 4);
    ok(await separar(a.R, [[a.ids[0], 4]]));
    await entrar(m, 4);
    const c = await req([[m, 4]]); await aprovar(c.R);
    assert.strictEqual(await reservaAtiva(c.R), 4, 'premissa: R3 reservou 4');
    const sai = await como('ADMIN').post(`${API}/movimentacoes/v2`, {
      material_id: m, tipo: 'SAIDA', quantidade: 4, motivo: 'e95 saida avulsa', justificativa: 'consumo avulso da manutencao',
    });
    assert.strictEqual(sai.status, 201, `saida avulsa: ${JSON.stringify(sai.body)}`);
    assert.deepStrictEqual(await mat(m), { quantidade_atual: 4, quantidade_reservada: 4 }, 'premissa: fisico 4, reservado 4');
    ok(await separar(c.R, [[c.ids[0], 4]]), 'R3 separa a propria reserva');
  });

  await test('[95 RN-01] decimal (Fase 2, I2): fisico 0,3, caixa de outra 0,1 -> 0,3 recusado (Maximo: 0.2), 0,2 aceito', async () => {
    const m = await material(0);
    const a = await req([[m, 0.1]]); await aprovar(a.R);
    const b = await req([[m, 0.3]]); await aprovar(b.R);
    await entrar(m, 0.3);
    ok(await separar(a.R, [[a.ids[0], 0.1]]));
    recusa(await separar(b.R, [[b.ids[0], 0.3]]), S2(nomes.get(m), 0.3, 0.2, 0.3, 0.2));
    ok(await separar(b.R, [[b.ids[0], 0.2]]), 'separar o teto exato');
  });

  await test('[95 RN-01] P1 (Fase 2, B1/B476): duas requisicoes sem reserva separam os mesmos 4 AO MESMO TEMPO -> so uma passa', async () => {
    const placar = [];
    for (let k = 0; k < 5; k++) {
      const m = await material(0);
      const a = await req([[m, 4]]); await aprovar(a.R);
      const b = await req([[m, 4]]); await aprovar(b.R);
      await entrar(m, 4);
      const [s1, s2] = await Promise.all([separar(a.R, [[a.ids[0], 4]], 'ALMOX'), separar(b.R, [[b.ids[0], 4]], 'ALMOX2')]);
      placar.push([s1.status, s2.status].sort().join('/'));
    }
    assert.deepStrictEqual(placar, Array(5).fill('200/400'), `rodadas: ${placar.join(' ')}`);
  });

  await test('[95 RN-01] guarda K1: reserva 4 de 4, separou 2 -> +2 aceito', async () => {
    const { R, ids } = await comReserva(4, 4);
    ok(await separar(R, [[ids[0], 2]]));
    ok(await separar(R, [[ids[0], 2]]));
  });

  await test('[95 RN-01] guarda K2: reserva total (fisico 10, pede 6), nada separado -> 6 aceito', async () => {
    const { R, ids } = await comReserva(10, 6);
    ok(await separar(R, [[ids[0], 6]]));
  });

  await test('[95 RN-01] guarda K3: reserva parcial (4 de 6), nada separado -> 4 aceito', async () => {
    const { R, ids } = await comReserva(4, 6);
    ok(await separar(R, [[ids[0], 4]]));
  });

  await test('[95 RN-01] guarda K4: a caixa de outra COBERTA pela reserva dela nao desconta duas vezes (fisico 8) -> 4 aceito', async () => {
    const m = await material(0); await entrar(m, 4);
    const a = await req([[m, 4]]); await aprovar(a.R);
    assert.strictEqual(await reservaAtiva(a.R), 4, 'premissa');
    ok(await separar(a.R, [[a.ids[0], 4]]));
    const b = await req([[m, 4]]); await aprovar(b.R);
    assert.strictEqual(await reservaAtiva(b.R), 0, 'premissa: R2 sem reserva');
    await entrar(m, 4);
    ok(await separar(b.R, [[b.ids[0], 4]]));
  });

  await test('[95 RN-01] guarda M1: R1 reserva 4 de 4 e separa 4; R2 sem reserva -> separar 1 recusado', async () => {
    const m = await material(0); await entrar(m, 4);
    const a = await req([[m, 4]]); await aprovar(a.R);
    ok(await separar(a.R, [[a.ids[0], 4]]));
    const b = await req([[m, 4]]); await aprovar(b.R);
    recusa(await separar(b.R, [[b.ids[0], 1]]));
  });

  await test('[95 RN-01] guarda M6: dois itens, o 1o com reserva 4 de 4 e separado -> o 2o separar 1 recusado', async () => {
    const m = await material(0); await entrar(m, 4);
    const a = await req([[m, 4], [m, 4]]); await aprovar(a.R);
    ok(await separar(a.R, [[a.ids[0], 4]]));
    recusa(await separar(a.R, [[a.ids[1], 1]]));
  });

  // ───────────────────────────── RN-02 ─────────────────────────────
  await test('[95 RN-02] M4: uma rodada, dois itens do mesmo material sem reserva, fisico 4: 4 + 4 recusado no 2o, nada gravado; 2 + 2 aceito', async () => {
    const m = await material(0);
    const a = await req([[m, 4], [m, 4]]); await aprovar(a.R);
    await entrar(m, 4);
    const antes = await retrato(a.R, a.ids);
    recusa(await separar(a.R, [[a.ids[0], 4], [a.ids[1], 4]]), S2(nomes.get(m), 4, 0, 4, 0));
    assert.strictEqual(await retrato(a.R, a.ids), antes, 'nada gravado');
    ok(await separar(a.R, [[a.ids[0], 2], [a.ids[1], 2]]));
  });

  await test('[95 RN-02] o mesmo item duas vezes no payload (4 + 1 com teto 4) -> recusado na 2a entrada', async () => {
    const { m, R, ids } = await semReserva(4, 6);
    recusa(await separar(R, [[ids[0], 4], [ids[0], 1]]), S2(nomes.get(m), 1, 0, 2, 0));
    assert.strictEqual(Number((await item(ids[0])).quantidade_separada), 0);
  });

  await test('[95 RN-02] guarda: cada item com a sua reserva (4 e 4, fisico 8) -> 4 + 4 aceito', async () => {
    const m = await material(0); await entrar(m, 8);
    const a = await req([[m, 4], [m, 4]]); await aprovar(a.R);
    assert.strictEqual(await reservaAtiva(a.R), 8, 'premissa');
    ok(await separar(a.R, [[a.ids[0], 4], [a.ids[1], 4]]));
  });

  // ───────────────────────────── RN-04 ─────────────────────────────
  await test('[95 RN-04] C2 separando 1 (o maximo real) grava maximo 1, nao divergente', async () => {
    const { R, ids } = await comReserva();
    ok(await separar(R, [[ids[0], 3]]));
    ok(await separar(R, [[ids[0], 1]]));
    const rs = await rodadas(R);
    const its = JSON.parse(rs[rs.length - 1].itens_json);
    assert.deepStrictEqual(its.map((x) => [x.maximo, x.divergente]), [[1, false]]);
  });

  // ───────────────────────────── RN-06 ─────────────────────────────
  await test('[95 RN-06 (a)] C1 depois da rodada recusada: entregar 4 -> PARCIALMENTE_ATENDIDA, fisico 0, item 4/4', async () => {
    const { m, R, ids } = await comReserva();
    ok(await separar(R, [[ids[0], 4]]));
    recusa(await separar(R, [[ids[0], 2]]));
    ok(await entregar(R, [[ids[0], 4]]));
    assert.strictEqual((await reqRow(R)).status, 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual(Number((await mat(m)).quantidade_atual), 0);
    const it = await item(ids[0]);
    assert.deepStrictEqual([Number(it.quantidade_separada), Number(it.quantidade_entregue)], [4, 4]);
  });

  await test('[95 RN-06 (a)] E1: segunda rodada sem separar (a propria reserva) -> 200 ENTREGUE como hoje', async () => {
    const m = await material(6);
    const a = await req([[m, 6]]); await aprovar(a.R);
    ok(await separar(a.R, [[a.ids[0], 2]]));
    ok(await entregar(a.R, [[a.ids[0], 2]]));
    ok(await entregar(a.R, [[a.ids[0], 4]]));
    assert.strictEqual((await reqRow(a.R)).status, 'ENTREGUE');
  });

  await test('[95 RN-06 (a)] E2: o mesmo com material critico -> 400 como hoje', async () => {
    const m = await material(6, 1);
    const a = await req([[m, 6]]); await aprovar(a.R);
    ok(await separar(a.R, [[a.ids[0], 2]]));
    ok(await como('ALMOX2').put(`${API}/requisicoes/${a.R}/conferir-separacao`, {}));
    ok(await entregar(a.R, [[a.ids[0], 2]]));
    const e = await entregar(a.R, [[a.ids[0], 4]]);
    recusa(e);
    assert.match(e.body.error, /material crítico só sai depois de separado e conferido/);
  });

  await test('[95 RN-06 (b)] O1: origem no mesmo par (com saldo em outro endereco, B474) -> a mesma mensagem da 59', async () => {
    const A = await loc('A'); const B = await loc('B'); const m = await material(0);
    await entrar(m, 4, A.id); await entrar(m, 10, B.id);
    const a = await req([[m, 10]]); await aprovar(a.R);
    ok(await separar(a.R, [[a.ids[0], 4, A.id]]));
    recusa(await separar(a.R, [[a.ids[0], 2, A.id]]),
      `${nomes.get(m)}: O saldo em ${A.codigo} (0) não cobre a quantidade (2) — a saída tiraria de outros endereços`);
  });

  await test('[95 RN-06 (c)] L1: a liberacao da 75 distribui como hoje; quem espera separa os 2 livres e nao mais', async () => {
    const m = await material(0);
    const a = await req([[m, 4]]); await aprovar(a.R);
    await entrar(m, 4);
    ok(await separar(a.R, [[a.ids[0], 4]]));
    const b = await req([[m, 4]]);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status='AGUARDANDO_ESTOQUE', aprovador_id=1 WHERE id=?", [b.R]);
    await entrar(m, 2);
    await reservaChegadaService.reservarLiberacaoParaQuemEspera(db, USERS.ADMIN, { material_id: m, quantidade: 2 });
    assert.strictEqual(await reservaAtiva(a.R), 2, 'como hoje (B475): o hold vai para quem tem caixa');
    assert.strictEqual(await reservaAtiva(b.R), 0);
    recusa(await separar(b.R, [[b.ids[0], 3]]), S2(nomes.get(m), 3, 2, 4, 2));
    ok(await separar(b.R, [[b.ids[0], 2]]), 'o hold de R1 cobre a caixa dela — os 2 que entraram continuam livres');
  });

  // ───────────────────────────── B478 ─────────────────────────────
  await test('[95 B478] os dois indices existem (fila sem varredura: itens por material, reservas por item)', async () => {
    const nomesIdx = async (t) => (await dbAll(db, `PRAGMA index_list(${t})`)).map((x) => x.name);
    assert.ok((await nomesIdx('itens_requisicao_almoxarifado')).includes('idx_itens_req_almox_material'));
    assert.ok((await nomesIdx('reservas_material_almoxarifado')).includes('idx_reservas_almox_item_req'));
  });

  terminou = true;
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
