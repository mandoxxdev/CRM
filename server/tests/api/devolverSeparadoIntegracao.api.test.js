/**
 * Etapa 98 (T5) — integracao: devolver da caixa a prateleira, pela ROTA e pelo SERVICO, cada documento ate o ultimo
 * gesto (B502-B511).
 *
 * Cada porta certa sozinha (T0 a seta, T1 o gesto, T2 a literal S98, T3 a entrega que diz a verdade) nao prova o
 * documento: a devolucao muda a caixa que QUATRO leitores usam depois — a PERDA avulsa (97), a entrega e o teto da
 * separacao (95), a segunda conferencia (28) e a fila (64) — e o status que o liberar para retirada gravou. Aqui cada
 * documento vai ate o fim (Entregue ou Encerrada), com o saldo do material lido PELA ROTA e as consultas de producao
 * A48 (97) e A49 (98) vazias no fim (e a A48 em cada passo do C1).
 *
 * Cenarios: (C1) separar -> liberar -> PERDA recusa com S98 -> devolver -> PERDA -> entregar -> separar de novo ->
 * Entregue; (C1b) Pronta esvaziada -> Em Separacao -> fila -> separar de novo -> Entregue; (C2) critico: separar ->
 * conferir -> devolver parte (limpa) -> separar de novo -> conferir com a barreira "quem separou nao confere" ->
 * liberar -> entregar -> encerrar; (C2b) critico em Parcialmente Atendida -> devolver -> "Separar de novo para
 * conferir" (PUT /separar com []) -> conferir -> entregar; (C3) com reserva: o devolvido continua reservado; (C3b) a
 * caixa meio coberta: a porta avulsa recusa o reservado e aceita o que voltou ao livre sem reserva, o teto da 95 ve a
 * reserva; (C4) o C190 com e sem reserva ate a entrega sair; (C5) pelo servico: o liberar parado (RN-10 a) e o espiao
 * (uma trava por material, nenhum `registrarMovimentacao`).
 *
 * Usuarios reais por header (molde 92-97): S sem perfil (PRODUCAO) cria; ADMIN superadmin aprova, movimenta, bloqueia
 * e encerra; ALMOX e ALMOX2 (ALMOXARIFE) separam, conferem, liberam, devolvem e entregam. `requirePermission` real.
 * Cada gancho dispara UMA vez (`armado`).
 *
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa98-devolver-da-caixa-a-prateleira.md (T5)
 * Executar: cd server && node tests/api/devolverSeparadoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const stockService = require('../../services/almoxarifado/stockService');
const trava = require('../../services/almoxarifado/travaPorMaterial');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 98i', role: 'admin', is_superadmin: 1, email: 'a98i@t.com' },
  S: { id: 9821, nome: 'Solic 98i', role: 'user', email: 's98i@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9822, nome: 'Almox 98i', role: 'user', email: 'x98i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
  ALMOX2: { id: 9823, nome: 'Almox2 98i', role: 'user', email: 'y98i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const dormir = (ms) => new Promise((r) => { setTimeout(r, ms); });
const estado = async (p) => {
  const marca = {};
  const r = await Promise.race([Promise.resolve(p).then(() => 'resolvida', () => 'rejeitada'), dormir(0).then(() => marca)]);
  return r === marca ? 'pendente' : r;
};

// Literais do plano, inteiras.
// S98 (T2, B508): o sufixo da porta avulsa com a terceira saida.
const S98 = (c, lista) => ` — ${c} PC estão separados para ${lista} e só saem pela entrega (material perdido da caixa: `
  + 'devolva-o à prateleira na requisição e dê a baixa, entregue o que existe e encerre a requisição, ou peça ao '
  + 'administrador do almoxarifado para excluí-la)';
const M1 = (n) => `Saldo insuficiente. Disponível: ${n} PC`;
// C3 da Etapa 28 (a segunda conferencia) e a barreira R (quem separou nao confere).
const C3 = 'Esta requisição tem material crítico separado e ainda não passou pela segunda conferência. Peça a outra '
  + 'pessoa do almoxarifado para conferir a separação antes de liberar ou entregar.';
const R403 = (rodada) => `Quem separou não confere: você registrou a rodada de separação #${rodada} desta requisição. `
  + 'A segunda conferência tem de ser de outra pessoa.';
// E190 (T3, B509): a literal de hoje + o sufixo nas duas formas.
const BASE = (nome, q, p) => `${nome}: não é possível entregar ${q} PC. Máximo: 0 (pendente: ${p}, disponível: 0)`;
const E190_COM = (nome, partes) => ` — o disponível de ${nome} está negativo (${partes}): nada dele sai pela entrega até `
  + 'liberar da reserva desta requisição o que está retido, ou desbloquear';
// Fase 5: a forma sem reserva (ou com reserva que nao cobre o deficit) diz "outra reserva" — pode ser MANUAL.
const E190_OUTRA = (nome, partes) => ` — o disponível de ${nome} está negativo (${partes}): nada dele sai pela entrega até `
  + 'liberar outra reserva deste material ou desbloquear';

// A48 (97) e A49 (98): o texto dos planos, sem mudanca — e o que vai para producao.
const A48 = `SELECT ma.id AS material_id, ma.codigo,
       ROUND(ma.quantidade_atual - COALESCE(ma.quantidade_reservada,0) - COALESCE(ma.quantidade_bloqueada,0)
             - COALESCE(ma.quantidade_em_inspecao,0) - COALESCE(ma.quantidade_em_terceiros,0), 6) AS disponivel,
       ROUND(SUM(c.caixa), 6) AS caixa_sem_reserva,
       GROUP_CONCAT(c.numero || ' (' || c.status || ', ' || ROUND(c.caixa, 6) || ')', '; ') AS requisicoes
FROM materiais_almoxarifado ma
JOIN (
  SELECT ix.material_id, rq.numero, rq.status,
         MAX(COALESCE(ix.quantidade_separada,0) - COALESCE(ix.quantidade_entregue, ix.quantidade_atendida, 0)
             - COALESCE((SELECT SUM(rx.quantidade - COALESCE(rx.quantidade_utilizada,0))
                         FROM reservas_material_almoxarifado rx
                         WHERE rx.item_requisicao_id = ix.id AND rx.material_id = ix.material_id
                           AND rx.status = 'ATIVA' AND rx.origem = 'REQUISICAO'), 0), 0) AS caixa
  FROM itens_requisicao_almoxarifado ix
  JOIN requisicoes_almoxarifado rq ON rq.id = ix.requisicao_id
  WHERE COALESCE(rq.ativo, 1) = 1
    AND rq.status IN ('APROVADO','AGUARDANDO_ESTOQUE','AGUARDANDO_COMPRA','PARCIALMENTE_RESERVADA','TOTALMENTE_RESERVADA',
                      'EM_SEPARACAO','PARCIALMENTE_ATENDIDA','PRONTA_PARA_RETIRADA','AGUARDANDO_APROVACAO_VALOR')
) c ON c.material_id = ma.id AND c.caixa > 0.000001
GROUP BY ma.id
HAVING SUM(c.caixa) > ROUND(ma.quantidade_atual - COALESCE(ma.quantidade_reservada,0) - COALESCE(ma.quantidade_bloqueada,0)
             - COALESCE(ma.quantidade_em_inspecao,0) - COALESCE(ma.quantidade_em_terceiros,0), 6) + 0.000001
ORDER BY ma.codigo;`;
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

(async () => {
  console.log('\n=== Etapa 98 (T5): integracao — devolver da caixa a prateleira, pela rota e pelo servico ===\n');
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
  const ok = (x, st, rotulo) => { assert.strictEqual(x.status, st, `${rotulo}: ${x.status} ${JSON.stringify(x.body)}`); return x; };
  const recusou = (x, st, literal, rotulo) => {
    assert.strictEqual(x.status, st, `${rotulo}: esperava ${st}, veio ${x.status} ${JSON.stringify(x.body)}`);
    assert.strictEqual(x.body.error, literal, rotulo);
  };

  const material = async ({ fisico = 0, critico = 0 } = {}) => {
    const c = `E98I-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, custo_unitario, material_critico) VALUES (?, ?, 'PC', ?, 0, 1, 0.1, ?)`, [c, c, fisico, critico])).lastID;
  };
  const nomeDe = async (m) => (await dbGet(db, 'SELECT nome FROM materiais_almoxarifado WHERE id=?', [m])).nome;
  const req = async (itens) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-98I',
      itens: itens.map(([m, q]) => ({ material_id: m, quantidade: q })),
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    const { numero } = await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id=?', [cr.body.id]);
    return { R: cr.body.id, ids, numero };
  };
  const aprovar = async (R) => ok(await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {}), 200, 'aprovar');
  const mov = (m, tipo, q, u = 'ADMIN') => como(u).post(`${API}/movimentacoes/v2`, {
    material_id: m, tipo, quantidade: q, motivo: 'e98 T5', justificativa: 'teste da etapa 98 T5', os_referencia: 'OS-98I',
  });
  const entrar = async (m, q) => ok(await mov(m, 'ENTRADA', q), 201, 'entrada');
  const separar = (R, pares, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/separar`, {
    itens_separados: pares.map(([item_id, q]) => ({ item_id, quantidade_separada: q })),
  });
  const devolver = (R, pares, motivo, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/devolver-separado`, {
    motivo, itens: pares.map(([item_id, quantidade]) => ({ item_id, quantidade })),
  });
  const entregar = (R, pares, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/entregar`, {
    itens_atendidos: pares.map(([item_id, q]) => ({ item_id, quantidade_atendida: q })),
  });
  const conferir = (R, u = 'ALMOX2') => como(u).put(`${API}/requisicoes/${R}/conferir-separacao`, {});
  const liberar = (R, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/liberar-retirada`, {});
  const encerrar = (R) => como('ADMIN').put(`${API}/requisicoes/${R}/encerrar`, { motivo: 'e98 T5 encerra' });
  const bloquear = async (m, q) => ok(await como('ADMIN').post(`${API}/materiais/${m}/bloquear`,
    { quantidade: q, motivo: 'e98 T5', justificativa: 'teste da etapa 98 T5' }), 200, 'bloquear');
  const desbloquear = async (m, q) => ok(await como('ADMIN').post(`${API}/materiais/${m}/desbloquear`,
    { quantidade: q, motivo: 'e98 T5', justificativa: 'teste da etapa 98 T5' }), 200, 'desbloquear');
  const reservaAtiva = (R) => dbGet(db, "SELECT id FROM reservas_material_almoxarifado WHERE requisicao_id=? AND status='ATIVA'", [R]);
  const liberarReserva = async (R, q) => {
    const { id } = await reservaAtiva(R);
    return ok(await como('ALMOX').post(`${API}/reservas/${id}/liberar`, { ...(q ? { quantidade: q } : {}), motivo: 'e98 T5' }), 200, 'liberar reserva');
  };
  const resAtivas = async (R) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade - COALESCE(quantidade_utilizada,0)),0) AS q
    FROM reservas_material_almoxarifado WHERE requisicao_id=? AND status='ATIVA'`, [R])).q);
  // PELA ROTA: a requisicao (status, itens, conferencia, trilha) e o saldo do material.
  const detalhe = async (R) => ok(await como('ALMOX').get(`${API}/requisicoes/${R}`), 200, 'GET requisicao').body;
  const statusReq = async (R) => (await detalhe(R)).status;
  const saldo = async (m) => {
    const b = ok(await como('ADMIN').get(`${API}/materiais/${m}`), 200, 'GET material').body;
    return { fisico: b.quantidade_atual, reservado: b.quantidade_reservada || 0, bloqueado: b.quantidade_bloqueada || 0 };
  };
  const fila = async (R) => (await como('ALMOX').get(`${API}/fila-separacao`)).body.find((l) => Number(l.id) === Number(R)) || null;
  const etapas = async (R) => { const f = await fila(R); return f ? f.etapas : null; };
  const livro = async (m) => (await dbAll(db, 'SELECT tipo, quantidade FROM movimentacoes_almoxarifado WHERE material_id=? ORDER BY id', [m]))
    .map((x) => `${x.tipo} ${x.quantidade}`);
  const a48 = async (m) => (await dbAll(db, A48)).filter((x) => x.material_id === m);
  const a49 = async (numero) => (await dbAll(db, A49)).filter((l) => l.numero === numero);
  const vazias = async (m, numero, rotulo) => {
    assert.deepStrictEqual(await a48(m), [], `A48 ${rotulo}`);
    assert.deepStrictEqual(await a49(numero), [], `A49 ${rotulo}`);
  };

  // ═══════════ C1 — pela rota: separar -> liberar -> PERDA recusa (S98) -> devolver -> PERDA -> entregar -> separar de novo -> Entregue ═══════════
  await test('[98 T5 C1] pela rota: Pronta, PERDA 2 -> 400 M1+S98; devolve 2 -> Em Separacao; PERDA 2 -> 201; entrega 2; ENTRADA 2, separa 2, entrega 2 -> Entregue; a A48 vazia em cada passo; trilha 1, livro PERDA 1 e 2 SAIDA', async () => {
    const m = await material();
    const a = await req([[m, 4]]); await aprovar(a.R);
    await entrar(m, 4);
    ok(await separar(a.R, [[a.ids[0], 4]]), 200, 'separar');
    assert.deepStrictEqual(await a48(m), [], 'A48 depois de separar');
    ok(await liberar(a.R), 200, 'liberar');
    assert.strictEqual(await statusReq(a.R), 'PRONTA_PARA_RETIRADA');
    const livroAntes = await livro(m);
    recusou(await mov(m, 'PERDA', 2, 'ALMOX'), 400, M1(0) + S98(4, `a requisição ${a.numero}`), 'PERDA com a caixa cheia');
    assert.deepStrictEqual(await livro(m), livroAntes, 'a recusa nao escreve no livro');
    const d = ok(await devolver(a.R, [[a.ids[0], 2]], 'quebrou'), 200, 'devolver');
    assert.strictEqual(d.body.status, 'EM_SEPARACAO');
    assert.strictEqual(await statusReq(a.R), 'EM_SEPARACAO', 'a Pronta volta a Em Separacao (seta da T0)');
    assert.deepStrictEqual(await saldo(m), { fisico: 4, reservado: 0, bloqueado: 0 }, 'devolver nao move estoque');
    assert.deepStrictEqual(await livro(m), livroAntes, 'devolver nao escreve no livro');
    assert.deepStrictEqual(await a48(m), [], 'A48 depois de devolver');
    ok(await mov(m, 'PERDA', 2, 'ALMOX'), 201, 'PERDA do que voltou');
    assert.deepStrictEqual(await saldo(m), { fisico: 2, reservado: 0, bloqueado: 0 });
    assert.deepStrictEqual(await a48(m), [], 'A48 depois da PERDA');
    ok(await entregar(a.R, [[a.ids[0], 2]]), 200, 'entregar 2');
    assert.strictEqual(await statusReq(a.R), 'PARCIALMENTE_ATENDIDA');
    assert.deepStrictEqual(await saldo(m), { fisico: 0, reservado: 0, bloqueado: 0 });
    await entrar(m, 2);
    assert.deepStrictEqual(await a48(m), [], 'A48 depois da ENTRADA');
    ok(await separar(a.R, [[a.ids[0], 2]]), 200, 'separar de novo');
    assert.strictEqual(await statusReq(a.R), 'EM_SEPARACAO');
    assert.deepStrictEqual(await a48(m), [], 'A48 depois de separar de novo');
    ok(await entregar(a.R, [[a.ids[0], 2]]), 200, 'entregar o resto');
    const fim = await detalhe(a.R);
    assert.strictEqual(fim.status, 'ENTREGUE');
    assert.deepStrictEqual(fim.devolucoes_caixa.map((x) => [x.quantidade, x.separado_antes, x.separado_depois, x.motivo,
      x.status_antes, x.status_depois, x.conferencia_limpa, x.usuario_id]),
    [[2, 4, 2, 'quebrou', 'PRONTA_PARA_RETIRADA', 'EM_SEPARACAO', false, USERS.ALMOX.id]]);
    assert.deepStrictEqual(await livro(m), ['ENTRADA 4', 'PERDA 2', 'SAIDA 2', 'ENTRADA 2', 'SAIDA 2']);
    assert.deepStrictEqual(await saldo(m), { fisico: 0, reservado: 0, bloqueado: 0 });
    await vazias(m, a.numero, 'no fim');
  });

  // ═══════════ C1b — a Pronta esvaziada: Em Separacao -> fila -> separar de novo -> Entregue ═══════════
  await test('[98 T5 C1b] pela rota: Pronta esvaziada -> Em Separacao vazia; fila SEPARAR; liberar 400 e entregar 400; separa 4 de novo -> liberar -> entregar 4 -> Entregue', async () => {
    const m = await material();
    const a = await req([[m, 4]]); await aprovar(a.R);
    await entrar(m, 4);
    ok(await separar(a.R, [[a.ids[0], 4]]), 200, 'separar');
    ok(await liberar(a.R), 200, 'liberar');
    const d = ok(await devolver(a.R, [[a.ids[0], 4]], 'separei o errado'), 200, 'devolver tudo');
    assert.deepStrictEqual([d.body.status, d.body.devolucoes[0].caixa_depois], ['EM_SEPARACAO', 0]);
    assert.strictEqual(await statusReq(a.R), 'EM_SEPARACAO');
    const et = await etapas(a.R);
    assert.ok(et && et.includes('SEPARAR') && !et.includes('ENTREGAR'), `fila: ${JSON.stringify(et)}`);
    recusou(await liberar(a.R), 400, 'Nenhum item separado', 'liberar a vazia');
    const nome = await nomeDe(m);
    recusou(await entregar(a.R, [[a.ids[0], 1]]), 400,
      `${nome}: não é possível entregar 1 PC. Máximo: 0 (pendente: 4, disponível: 4)`, 'entregar a vazia');
    assert.deepStrictEqual(await a48(m), [], 'A48 com a caixa vazia');
    ok(await separar(a.R, [[a.ids[0], 4]]), 200, 'separar de novo');
    ok(await liberar(a.R), 200, 'liberar de novo');
    assert.strictEqual(await statusReq(a.R), 'PRONTA_PARA_RETIRADA');
    ok(await entregar(a.R, [[a.ids[0], 4]]), 200, 'entregar 4');
    assert.strictEqual(await statusReq(a.R), 'ENTREGUE');
    assert.deepStrictEqual(await saldo(m), { fisico: 0, reservado: 0, bloqueado: 0 });
    assert.deepStrictEqual(await livro(m), ['ENTRADA 4', 'SAIDA 4']);
    await vazias(m, a.numero, 'no fim');
  });

  // ═══════════ C2 — critico: separar -> conferir -> devolver parte -> separar de novo -> conferir (barreira) -> liberar -> entregar -> encerrar ═══════════
  await test('[98 T5 C2] critico pela rota: ALMOX separa 4, ALMOX2 confere; ALMOX2 devolve 2 -> conferencia limpa, entrega 400 C3; ALMOX separa 1 de novo; liberar 400 C3; ALMOX confere 403 R; ALMOX2 confere 200; liberar; entrega 3 -> Parcialmente Atendida; ADMIN encerra', async () => {
    const m = await material({ critico: 1 });
    const a = await req([[m, 4]]); await aprovar(a.R);
    await entrar(m, 4);
    ok(await separar(a.R, [[a.ids[0], 4]]), 200, 'separar');
    ok(await conferir(a.R, 'ALMOX2'), 200, 'primeira conferencia');
    const d = ok(await devolver(a.R, [[a.ids[0], 2]], 'amassou', 'ALMOX2'), 200, 'devolver 2');
    assert.strictEqual(d.body.conferencia_limpa, true);
    assert.strictEqual((await detalhe(a.R)).conferencia, null, 'o detalhe nao mostra conferencia depois de devolver');
    recusou(await entregar(a.R, [[a.ids[0], 2]]), 400, C3, 'entregar sem conferencia');
    ok(await separar(a.R, [[a.ids[0], 1]]), 200, 'separar 1 de novo');
    recusou(await liberar(a.R), 400, C3, 'liberar sem conferencia');
    const rodada1 = (await dbGet(db, 'SELECT MIN(id) AS id FROM separacoes_requisicao_almoxarifado WHERE requisicao_id=? AND usuario_id=?',
      [a.R, USERS.ALMOX.id])).id;
    recusou(await conferir(a.R, 'ALMOX'), 403, R403(rodada1), 'quem separou nao confere');
    ok(await conferir(a.R, 'ALMOX2'), 200, 'ALMOX2 (devolveu, nao separou) confere');
    ok(await liberar(a.R), 200, 'liberar');
    assert.strictEqual(await statusReq(a.R), 'PRONTA_PARA_RETIRADA');
    ok(await entregar(a.R, [[a.ids[0], 3]]), 200, 'entregar 3');
    assert.strictEqual(await statusReq(a.R), 'PARCIALMENTE_ATENDIDA');
    ok(await encerrar(a.R), 200, 'encerrar');
    const fim = await detalhe(a.R);
    assert.strictEqual(fim.status, 'ENCERRADA');
    assert.deepStrictEqual(fim.devolucoes_caixa.map((x) => [x.quantidade, x.status_antes, x.status_depois, x.conferencia_limpa, x.usuario_id]),
      [[2, 'EM_SEPARACAO', 'EM_SEPARACAO', true, USERS.ALMOX2.id]]);
    assert.deepStrictEqual(await saldo(m), { fisico: 1, reservado: 0, bloqueado: 0 }, 'o devolvido que nao saiu continua na prateleira');
    assert.deepStrictEqual(await livro(m), ['ENTRADA 4', 'SAIDA 3']);
    await vazias(m, a.numero, 'no fim');
  });

  // ═══════════ C2b — critico em Parcialmente Atendida: devolver -> "Separar de novo para conferir" -> conferir -> entregar ═══════════
  await test('[98 T5 C2b] critico em Parcialmente Atendida: entrega 2, devolve 1 -> fila REABRIR_SEPARACAO, entrega 1 -> 400 C3; PUT /separar com [] -> Em Separacao; ALMOX2 confere; entrega 1 -> Parcialmente Atendida; encerrar', async () => {
    const m = await material({ critico: 1 });
    const a = await req([[m, 4]]); await aprovar(a.R);
    await entrar(m, 4);
    ok(await separar(a.R, [[a.ids[0], 4]]), 200, 'separar');
    ok(await conferir(a.R, 'ALMOX2'), 200, 'conferir');
    ok(await entregar(a.R, [[a.ids[0], 2]]), 200, 'entregar 2');
    assert.strictEqual(await statusReq(a.R), 'PARCIALMENTE_ATENDIDA');
    const d = ok(await devolver(a.R, [[a.ids[0], 1]], 'riscado'), 200, 'devolver 1');
    assert.deepStrictEqual([d.body.status, d.body.conferencia_limpa], ['PARCIALMENTE_ATENDIDA', true]);
    const et = await etapas(a.R);
    assert.ok(et && et.includes('REABRIR_SEPARACAO'), `fila: ${JSON.stringify(et)}`);
    recusou(await entregar(a.R, [[a.ids[0], 1]]), 400, C3, 'entregar a caixa sem conferencia');
    // "Separar de novo para conferir" (T4): o PUT /separar com a lista vazia, sem rodada.
    const rodadasAntes = (await dbGet(db, 'SELECT COUNT(*) AS n FROM separacoes_requisicao_almoxarifado WHERE requisicao_id=?', [a.R])).n;
    ok(await como('ALMOX').put(`${API}/requisicoes/${a.R}/separar`, { itens_separados: [] }), 200, 'separar com []');
    assert.strictEqual(await statusReq(a.R), 'EM_SEPARACAO');
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) AS n FROM separacoes_requisicao_almoxarifado WHERE requisicao_id=?', [a.R])).n,
      rodadasAntes, 'a lista vazia nao grava rodada');
    ok(await conferir(a.R, 'ALMOX2'), 200, 'ALMOX2 confere');
    ok(await entregar(a.R, [[a.ids[0], 1]]), 200, 'entregar 1');
    assert.strictEqual(await statusReq(a.R), 'PARCIALMENTE_ATENDIDA');
    ok(await encerrar(a.R), 200, 'encerrar');
    assert.strictEqual(await statusReq(a.R), 'ENCERRADA');
    assert.deepStrictEqual(await saldo(m), { fisico: 1, reservado: 0, bloqueado: 0 });
    assert.deepStrictEqual(await livro(m), ['ENTRADA 4', 'SAIDA 2', 'SAIDA 1']);
    await vazias(m, a.numero, 'no fim');
  });

  // ═══════════ C3 — com reserva: o devolvido continua reservado; liberar a reserva solta a baixa ═══════════
  await test('[98 T5 C3] com reserva pela rota: devolve 4 -> reserva continua 4; PERDA 4 -> 400 M1(0) sem sufixo; ALMOX libera a reserva -> PERDA 4 -> 201; Em Separacao vazia na fila AGUARDANDO_SALDO; ENTRADA 4 -> separa -> entrega -> Entregue', async () => {
    const m = await material();
    await entrar(m, 4);
    const a = await req([[m, 4]]); await aprovar(a.R);
    assert.strictEqual(await resAtivas(a.R), 4, 'premissa: a aprovacao reservou 4');
    ok(await separar(a.R, [[a.ids[0], 4]]), 200, 'separar');
    const d = ok(await devolver(a.R, [[a.ids[0], 4]], 'caiu da bancada'), 200, 'devolver 4');
    assert.strictEqual(d.body.devolucoes[0].reserva_do_item, 4);
    assert.strictEqual(await resAtivas(a.R), 4, 'a reserva nao muda (B506)');
    assert.deepStrictEqual(await saldo(m), { fisico: 4, reservado: 4, bloqueado: 0 });
    recusou(await mov(m, 'PERDA', 4, 'ALMOX'), 400, M1(0), 'PERDA com reserva');
    await liberarReserva(a.R);
    ok(await mov(m, 'PERDA', 4, 'ALMOX'), 201, 'PERDA depois de liberar a reserva');
    assert.deepStrictEqual(await saldo(m), { fisico: 0, reservado: 0, bloqueado: 0 });
    assert.strictEqual(await statusReq(a.R), 'EM_SEPARACAO');
    const et = await etapas(a.R);
    assert.ok(et && et.includes('AGUARDANDO_SALDO') && !et.includes('ENTREGAR'), `fila: ${JSON.stringify(et)}`);
    await entrar(m, 4);
    ok(await separar(a.R, [[a.ids[0], 4]]), 200, 'separar o reposto');
    ok(await entregar(a.R, [[a.ids[0], 4]]), 200, 'entregar 4');
    assert.strictEqual(await statusReq(a.R), 'ENTREGUE');
    assert.deepStrictEqual(await saldo(m), { fisico: 0, reservado: 0, bloqueado: 0 });
    await vazias(m, a.numero, 'no fim');
  });

  // ═══════════ C3b — a caixa meio coberta: a porta avulsa recusa o reservado e aceita o que voltou ao livre ═══════════
  await test('[98 T5 C3b] caixa 6 com reserva 4: PERDA 1 -> 400 M1(0)+S98(2); devolve 3 -> reserva 4, caixa sem reserva 0; PERDA 3 -> 400 M1(2) sem sufixo; PERDA 2 -> 201; o teto da 95 so deixa separar o que a reserva cobre; entrega 4 -> encerrar', async () => {
    const m = await material();
    await entrar(m, 6);
    const a = await req([[m, 6]]); await aprovar(a.R);
    ok(await separar(a.R, [[a.ids[0], 6]]), 200, 'separar 6');
    await liberarReserva(a.R, 2);
    assert.strictEqual(await resAtivas(a.R), 4, 'premissa: reserva 4 sobre a caixa 6');
    recusou(await mov(m, 'PERDA', 1, 'ALMOX'), 400, M1(0) + S98(2, `a requisição ${a.numero}`), 'PERDA com 2 sem reserva na caixa');
    const d = ok(await devolver(a.R, [[a.ids[0], 3]], 'sobrou'), 200, 'devolver 3');
    assert.deepStrictEqual([d.body.devolucoes[0].caixa_depois, d.body.devolucoes[0].reserva_do_item], [3, 4]);
    assert.strictEqual(await resAtivas(a.R), 4, 'o devolvido continua reservado para o item');
    assert.deepStrictEqual(await a48(m), [], 'A48: a caixa 3 esta coberta pela reserva 4');
    recusou(await mov(m, 'PERDA', 3, 'ALMOX'), 400, M1(2), 'PERDA do reservado (sem sufixo: nada sem reserva na caixa)');
    ok(await mov(m, 'PERDA', 2, 'ALMOX'), 201, 'PERDA do que voltou ao livre');
    assert.deepStrictEqual(await saldo(m), { fisico: 4, reservado: 4, bloqueado: 0 });
    const it = (await detalhe(a.R)).itens[0];
    assert.strictEqual(it.quantidade_separavel, 1, `teto: ${JSON.stringify(it)}`);
    const nome = await nomeDe(m);
    const s2 = await separar(a.R, [[a.ids[0], 2]]);
    assert.strictEqual(s2.status, 400, `separar 2 acima do teto: ${JSON.stringify(s2.body)}`);
    assert.strictEqual(s2.body.error, `${nome}: não é possível separar 2 PC. Máximo: 1 (pendente: 3, disponível: 1)`);
    ok(await separar(a.R, [[a.ids[0], 1]]), 200, 'separar 1 (a reserva cobre)');
    ok(await entregar(a.R, [[a.ids[0], 4]]), 200, 'entregar 4');
    assert.strictEqual(await statusReq(a.R), 'PARCIALMENTE_ATENDIDA');
    ok(await encerrar(a.R), 200, 'encerrar');
    assert.deepStrictEqual(await saldo(m), { fisico: 0, reservado: 0, bloqueado: 0 });
    await vazias(m, a.numero, 'no fim');
  });

  // ═══════════ C4 — o C190 com e sem reserva, ate a entrega sair ═══════════
  await test('[98 T5 C4] C190 com reserva: bloqueio 1; fila AGUARDANDO_SALDO; entrega 1 -> 400 E190; A49 acha; ALMOX libera 1 da reserva; entrega 3 -> 200; desbloqueia; entrega 1 -> Entregue; A48/A49 vazias', async () => {
    const m = await material();
    await entrar(m, 4);
    const a = await req([[m, 4]]); await aprovar(a.R);
    ok(await separar(a.R, [[a.ids[0], 4]]), 200, 'separar');
    await bloquear(m, 1);
    const et = await etapas(a.R);
    assert.ok(et && et.includes('AGUARDANDO_SALDO') && !et.includes('ENTREGAR'), `fila: ${JSON.stringify(et)}`);
    assert.strictEqual((await detalhe(a.R)).itens[0].quantidade_entregavel, 0);
    assert.strictEqual((await a49(a.numero)).length, 1, 'a A49 acha a requisicao presa');
    const nome = await nomeDe(m);
    const livroAntes = await livro(m);
    recusou(await entregar(a.R, [[a.ids[0], 1]]), 400, BASE(nome, 1, 4) + E190_COM(nome, '1 PC bloqueados'), 'entregar com bloqueio');
    assert.deepStrictEqual(await livro(m), livroAntes, 'a E190 sai antes de qualquer baixa');
    await liberarReserva(a.R, 1);
    assert.deepStrictEqual(await a49(a.numero), [], 'A49 depois de liberar o retido');
    ok(await entregar(a.R, [[a.ids[0], 3]]), 200, 'entregar 3');
    assert.strictEqual(await statusReq(a.R), 'PARCIALMENTE_ATENDIDA');
    await desbloquear(m, 1);
    ok(await entregar(a.R, [[a.ids[0], 1]]), 200, 'entregar o ultimo');
    assert.strictEqual(await statusReq(a.R), 'ENTREGUE');
    assert.deepStrictEqual(await saldo(m), { fisico: 0, reservado: 0, bloqueado: 0 });
    await vazias(m, a.numero, 'no fim');
  });

  await test('[98 T5 C4b] C190 sem reserva no item: R1 reserva 4 sobre o fisico 6; bloqueio 3; R2 (caixa 2 sem reserva) fila AGUARDANDO_SALDO, detalhe 0, entrega 1 -> 400 E190 forma sem reserva; libera a reserva de R1 -> R2 entrega 2 -> Entregue; A48/A49 vazias', async () => {
    const m = await material();
    const r2 = await req([[m, 2]]); await aprovar(r2.R);
    await entrar(m, 6);
    ok(await separar(r2.R, [[r2.ids[0], 2]]), 200, 'R2 separa 2');
    const r1 = await req([[m, 4]]); await aprovar(r1.R);
    assert.strictEqual(await resAtivas(r1.R), 4, 'premissa: R1 reservou 4');
    await bloquear(m, 3);
    const et = await etapas(r2.R);
    assert.ok(et && et.includes('AGUARDANDO_SALDO') && !et.includes('ENTREGAR'), `fila: ${JSON.stringify(et)}`);
    assert.strictEqual((await detalhe(r2.R)).itens[0].quantidade_entregavel, 0);
    assert.strictEqual((await a49(r2.numero)).length, 1, 'a A49 acha R2');
    const nome = await nomeDe(m);
    recusou(await entregar(r2.R, [[r2.ids[0], 1]]), 400, BASE(nome, 1, 2) + E190_OUTRA(nome, '3 PC bloqueados'), 'R2 entrega com bloqueio');
    await liberarReserva(r1.R);
    ok(await entregar(r2.R, [[r2.ids[0], 2]]), 200, 'R2 entrega 2');
    assert.strictEqual(await statusReq(r2.R), 'ENTREGUE');
    assert.deepStrictEqual(await saldo(m), { fisico: 4, reservado: 0, bloqueado: 3 });
    await vazias(m, r2.numero, 'no fim (R2)');
    assert.deepStrictEqual(await a49(r1.numero), [], 'A49 (R1)');
  });

  // ═══════════ C5 — pelo servico ═══════════
  // (a) RN-10 (a) ate o fim: o liberar para retirada (so a trava por requisicao) parado DEPOIS de contar os separados; a
  // devolucao pelo servico espera; o liberar grava Pronta; a devolucao le Pronta e devolve -> Em Separacao com caixa 0 —
  // nunca Pronta vazia. Depois o documento segue pelo servico: separa de novo e `entregarRequisicao` -> Entregue.
  await test('[98 T5 C5] pelo servico: liberar parado depois de contar, devolverSeparado espera; nunca Pronta com caixa 0 (0/10); depois separarRequisicao + entregarRequisicao -> Entregue', async () => {
    const errados = [];
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop
      const m = await material();
      // eslint-disable-next-line no-await-in-loop
      const a = await req([[m, 4]]);
      // eslint-disable-next-line no-await-in-loop
      await aprovar(a.R);
      // eslint-disable-next-line no-await-in-loop
      await entrar(m, 4);
      // eslint-disable-next-line no-await-in-loop
      await requisitionService.separarRequisicao(db, a.R, [{ item_id: a.ids[0], quantidade_separada: 4 }], USERS.ALMOX);
      const orig = db.get;
      let solta; const parado = new Promise((r) => { solta = r; });
      let chegou; const chegada = new Promise((r) => { chegou = r; });
      let armado = true; let disparos = 0;
      db.get = function gancho(sql, ...args) {
        if (armado && /SELECT COUNT\(\*\) as n FROM itens_requisicao_almoxarifado WHERE requisicao_id = \? AND quantidade_separada > 0/.test(sql)) {
          armado = false; disparos++;
          const cb = args[args.length - 1];
          args[args.length - 1] = function aposContar(err, row) { const ctx = this; chegou(); parado.then(() => cb.call(ctx, err, row)); };
        }
        return orig.call(this, sql, ...args);
      };
      let lib; let dev; let pendente;
      try {
        lib = liberar(a.R);
        // eslint-disable-next-line no-await-in-loop
        await chegada;
        dev = requisitionService.devolverSeparado(db, a.R, { motivo: 'quebrou', itens: [{ item_id: a.ids[0], quantidade: 4 }] }, USERS.ALMOX)
          .then((x) => x, (e) => ({ erro: e.message }));
        // eslint-disable-next-line no-await-in-loop
        await dormir(30);
        // eslint-disable-next-line no-await-in-loop
        pendente = await estado(dev);
        solta();
        // eslint-disable-next-line no-await-in-loop
        lib = await lib; dev = await dev;
      } finally { db.get = orig; }
      // eslint-disable-next-line no-await-in-loop
      const meio = { st: (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id=?', [a.R])).status,
        // eslint-disable-next-line no-await-in-loop
        sep: (await dbGet(db, 'SELECT quantidade_separada AS s FROM itens_requisicao_almoxarifado WHERE id=?', [a.ids[0]])).s };
      // eslint-disable-next-line no-await-in-loop
      const sep2 = await requisitionService.separarRequisicao(db, a.R, [{ item_id: a.ids[0], quantidade_separada: 4 }], USERS.ALMOX)
        .then((x) => x, (e) => ({ erro: e.message }));
      // eslint-disable-next-line no-await-in-loop
      const ent = await requisitionService.entregarRequisicao(db, a.R, [{ item_id: a.ids[0], quantidade_atendida: 4 }], USERS.ALMOX)
        .then((x) => x, (e) => ({ erro: e.message }));
      // eslint-disable-next-line no-await-in-loop
      const fim = { st: await statusReq(a.R), saldo: await saldo(m), a48: await a48(m) };
      const certo = disparos === 1 && pendente === 'pendente' && lib.status === 200 && dev.status === 'EM_SEPARACAO'
        && meio.st === 'EM_SEPARACAO' && meio.sep === 0 && sep2.success === true && !ent.erro
        && fim.st === 'ENTREGUE' && fim.saldo.fisico === 0 && fim.a48.length === 0;
      if (!certo) errados.push({ disparos, pendente, lib: lib.status, dev, meio, sep2, ent: ent.erro || 'ok', fim });
    }
    assert.deepStrictEqual(errados, []);
  });

  // (b) o espiao (I-3 da Fase 2): a devolucao de tres itens (dois do mesmo material) pega a trava de CADA material uma
  // vez e nao chama `registrarMovimentacao` (nao move estoque). Controle positivo no mesmo teste: a entrega, espiada
  // igual, chama `registrarMovimentacao` — o espiao sabe ver.
  await test('[98 T5 C5] espiao pelo servico: devolverSeparado pega comLockDoMaterial uma vez por material e nenhum registrarMovimentacao; a entrega (controle) chama o motor', async () => {
    const m1 = await material(); const m2 = await material();
    const a = await req([[m1, 2], [m2, 3], [m1, 1]]); await aprovar(a.R);
    await entrar(m1, 3); await entrar(m2, 3);
    await requisitionService.separarRequisicao(db, a.R, [{ item_id: a.ids[0], quantidade_separada: 2 },
      { item_id: a.ids[1], quantidade_separada: 3 }, { item_id: a.ids[2], quantidade_separada: 1 }], USERS.ALMOX);
    const origLock = trava.comLockDoMaterial; const origMov = stockService.registrarMovimentacao;
    let travas = []; let movs = [];
    trava.comLockDoMaterial = function espiaLock(mid, fn) { travas.push(Number(mid)); return origLock.call(this, mid, fn); };
    stockService.registrarMovimentacao = function espiaMov(...args) { movs.push(args[2] && args[2].material_id); return origMov.apply(this, args); };
    let dev; let ent; let travasDev; let movsDev;
    try {
      dev = await requisitionService.devolverSeparado(db, a.R, { motivo: 'quebrou', itens: [
        { item_id: a.ids[0], quantidade: 1 }, { item_id: a.ids[1], quantidade: 2 }, { item_id: a.ids[2], quantidade: 1 }] }, USERS.ALMOX);
      travasDev = travas; movsDev = movs;
      travas = []; movs = [];
      ent = await requisitionService.entregarRequisicao(db, a.R, [{ item_id: a.ids[0], quantidade_atendida: 1 },
        { item_id: a.ids[1], quantidade_atendida: 1 }], USERS.ALMOX);
    } finally { trava.comLockDoMaterial = origLock; stockService.registrarMovimentacao = origMov; }
    assert.strictEqual(dev.status, 'EM_SEPARACAO');
    assert.deepStrictEqual(travasDev, [m1, m2].sort((x, y) => x - y), 'uma trava por material, em ordem crescente');
    assert.deepStrictEqual(movsDev, [], 'devolver nao chama o motor');
    assert.ok(ent && ent.success !== false, JSON.stringify(ent));
    assert.deepStrictEqual(movs.map(Number).sort((x, y) => x - y), [m1, m2].sort((x, y) => x - y), 'controle: a entrega chama o motor por item entregue');
    assert.deepStrictEqual(await livro(m1), ['ENTRADA 3', 'SAIDA 1']);
    assert.deepStrictEqual(await livro(m2), ['ENTRADA 3', 'SAIDA 1']);
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
