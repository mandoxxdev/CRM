/**
 * Etapa 205 (T3) — integracao: o lote impedido do comeco ao fim, pela ROTA e pelo SERVICO, com os mesmos numeros; e a entrega
 * (RN-205.10 — fixada na 205 para o item 7; desde a Etapa 206 a entrega recusa o lote impedido, RN-206.06/11).
 *
 * Fluxo: Entrada v2 em L1 (4) e L2 (6) -> L2 BLOQUEADO -> requisicao de 10 -> aprovar (reserva 4, PARCIALMENTE_RESERVADA) -> fila
 * (separavel 4) -> detalhe (quantidade_separavel 4) -> separar 5 (400, a literal com "Nao entram 6 un") -> separar 4 (200) -> entregar 4
 * (200, sai de L1 pelo automatico da 197) -> L2 volta a ATIVO -> R2 de 6 reserva 6.
 * Plano: docs/superpowers/plans/2026-11-06-almoxarifado-etapa205-lote-impedido-na-aprovacao-e-separacao.md (T3).
 *
 * Executar: cd server && node tests/api/loteImpedidoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const USERS = {
  ADMIN: { id: 1, nome: 'Adm 205i', role: 'admin', is_superadmin: 1, email: 'a205i@t.com' },
  SOL: { id: 20531, nome: 'Solic 205i', email: 's205i@t.com' },
  ALMOX: { id: 20532, nome: 'Almox 205i', role: 'user', email: 'x205i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});
const MSG_5 = (nome) => `${nome}: não é possível separar 5 un. Máximo: 4 (pendente: 10, disponível: 4). `
  + 'Não entram 6 un em lote bloqueado, reprovado ou vencido.';

(async () => {
  console.log('\n=== Etapa 205 (T3): integracao pela rota e pelo servico ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
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
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM205I', nome: 'Almox 205i' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  await como('ADMIN').post(`${API}/localizacoes`, { codigo: 'Z205I-01', descricao: 'Z205I-01', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z205I-01'");

  const material = async () => {
    const c = `E205I-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, 1, 0, ?)`, [c, c, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = (m, q, lote) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e205i', localizacao_destino_id: P01.id, lote }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const statusRota = async (m, codigo, st) => ok(como('ADMIN').put(`${API}/lotes/${await loteId(m, codigo)}/status`,
    { status: st, justificativa: 'teste 205' }));
  const criar = async (m, q) => {
    const r = await como('SOL').post(`${API}/requisicoes`, { os_referencia: 'OS-205', itens: [{ material_id: m.id, quantidade: q }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [r.body.id])).id;
    return { R: r.body.id, item };
  };
  const st = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
  const reservas = async (R) => (await dbAll(db, `SELECT quantidade, quantidade_utilizada u, status FROM reservas_material_almoxarifado
    WHERE requisicao_id = ? ORDER BY id`, [R])).map((x) => [Number(x.quantidade), x.status]);
  const livro = async (R, m) => (await dbAll(db, `SELECT mv.tipo, lt.codigo as lote, mv.quantidade q FROM movimentacoes_almoxarifado mv
      LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id
      WHERE mv.requisicao_id = ? AND mv.material_id = ? AND mv.tipo IN ('SAIDA', 'ENTRADA') ORDER BY mv.id`, [R, m.id]))
    .map((x) => [x.tipo, x.lote || null, Number(x.q)]);
  const linhas = async (m) => (await dbAll(db, `SELECT lt.codigo as lote, SUM(s.quantidade) q FROM estoque_saldo_almoxarifado s
      LEFT JOIN lotes_almoxarifado lt ON lt.id = s.lote_id WHERE s.material_id = ? GROUP BY lt.codigo ORDER BY lt.codigo`, [m.id]))
    .filter((x) => Math.abs(Number(x.q)) > 1e-9).map((x) => `${x.lote || '-'}=${Number(x.q)}`);
  // Fase 5 (P3): a regua da divergencia da ultima rodada — quem separou tudo o que o LIBERADO deixa nao e divergente.
  const ultimaRodada = async (R, item) => {
    const r = await dbGet(db, "SELECT itens_json FROM separacoes_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id DESC LIMIT 1", [R]);
    const x = JSON.parse(r.itens_json).find((i) => Number(i.item_id) === Number(item));
    return { maximo: x.maximo, divergente: x.divergente };
  };
  const montar = async () => {
    const m = await material(); await entrar(m, 4, 'L1'); await entrar(m, 6, 'L2');
    return m;
  };

  // ── pela ROTA ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[T3 rota] Entrada -> bloquear L2 -> requisicao 10 -> aprovar 4 -> fila 4 -> detalhe 4 -> separar 5 (400) / 4 -> entregar 4 de L1 -> L2 ATIVO -> R reserva os 6 que esperava (Etapa 220), R2 espera', async () => {
    const m = await montar();
    await statusRota(m, 'L2', 'BLOQUEADO');
    const { R, item } = await criar(m, 10);
    const ap = await ok(como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {}));
    assert.strictEqual(ap.body.status, 'PARCIALMENTE_RESERVADA');
    assert.deepStrictEqual(await reservas(R), [[4, 'ATIVA']]);
    const fila = (await ok(como('ALMOX').get(`${API}/fila-separacao`))).body.find((f) => Number(f.id) === Number(R));
    assert.strictEqual(fila.itens[0].separavel, 4, JSON.stringify(fila.itens[0]));
    const det = (await ok(como('ADMIN').get(`${API}/requisicoes/${R}`))).body.itens[0];
    assert.strictEqual(det.quantidade_separavel, 4); assert.strictEqual(det.lote_impedido, 6);
    const r5 = await como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: item, quantidade_separada: 5 }] });
    assert.strictEqual(r5.status, 400, JSON.stringify(r5.body));
    assert.strictEqual(r5.body.error, MSG_5(m.nome));
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: item, quantidade_separada: 4 }] }));
    assert.deepStrictEqual(await ultimaRodada(R, item), { maximo: 4, divergente: false }, 'a regua e o liberado (4), nao o disponivel (10)');
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: 4 }] }));
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'L1', 4]], 'saiu de L1 (o automatico da 197 nao toca L2)');
    assert.deepStrictEqual(await linhas(m), ['L2=6']);
    await statusRota(m, 'L2', 'ATIVO');
    // Etapa 220 (C480): liberar L2 reserva os 6 para R, que ainda esperava 6 (ate a 219 nada era reservado e a R2 aprovada depois levava
    // os 6). A R2 agora espera: o liberado ja e de quem esperava.
    assert.deepStrictEqual((await reservas(R)).slice(-1), [[6, 'ATIVA']], 'liberar L2 nao reservou para R, que esperava');
    const r2 = await criar(m, 6);
    assert.ok(['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'].includes((await ok(como('ADMIN').put(`${API}/requisicoes/${r2.R}/aprovar`, {}))).body.status));
    assert.deepStrictEqual(await reservas(r2.R), []);
  });

  // ── pelo SERVICO ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[T3 servico] o mesmo fluxo por prepararPosAprovacao (na trava), listarFilaSeparacao, separarRequisicao e entregarRequisicao — mesmos numeros', async () => {
    const m = await montar();
    await lotService.mudarStatusLote(db, USERS.ADMIN, await loteId(m, 'L2'), 'BLOQUEADO', 'teste 205');
    const { R, item } = await criar(m, 10);
    const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [R]);
    const pos = await requisitionService.comTravaDaRequisicao(db, R, async () => {
      const p = await requisitionService.prepararPosAprovacao(db, R, USERS.ADMIN, reqRow);
      await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = ?, aprovador_id = 1 WHERE id = ? AND status = 'PENDENTE'", [p.status, R]);
      return p;
    });
    assert.strictEqual(pos.status, 'PARCIALMENTE_RESERVADA');
    assert.deepStrictEqual(pos.reservas.map((x) => x.quantidade), [4]);
    const [f] = await requisitionService.listarFilaSeparacao(db, USERS.ALMOX, { requisicaoId: R });
    assert.strictEqual(f.itens[0].separavel, 4);
    await assert.rejects(requisitionService.separarRequisicao(db, R, [{ item_id: item, quantidade_separada: 5 }], USERS.ALMOX),
      (e) => e.status === 400 && e.message === MSG_5(m.nome));
    await requisitionService.separarRequisicao(db, R, [{ item_id: item, quantidade_separada: 4 }], USERS.ALMOX);
    assert.deepStrictEqual(await ultimaRodada(R, item), { maximo: 4, divergente: false });
    await requisitionService.entregarRequisicao(db, R, [{ item_id: item, quantidade_atendida: 4 }], USERS.ALMOX, null);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'L1', 4]]);
    assert.deepStrictEqual(await linhas(m), ['L2=6']);
    assert.strictEqual(await st(R), 'PARCIALMENTE_ATENDIDA');
  });

  // ── RN-205.10 -> RN-206.06/11 (Etapa 206): a entrega que tiraria do lote impedido recusa, e o detalhe ja nao a promete ──────────
  // Ate a 205 estes dois cenarios fixavam a entrega de hoje (sai sem lote, -6 e -10) para o item 7 encontra-la vermelha. Desde a 206 a
  // entrega recusa antes de baixar (B1383) e o entregavel do detalhe desconta o lote impedido (B1390).
  await test('[RN-205.10 -> RN-206.06] R1 reserva 6, L1 (10) bloqueado depois: separa 6, o detalhe entrega 0 e a entrega de 6 recusa nomeando L1 (nada sai, a reserva fica); L1 ATIVO -> a mesma entrega sai de L1', async () => {
    const m = await material(); await entrar(m, 10, 'L1');
    const { R, item } = await criar(m, 6);
    assert.strictEqual((await ok(como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {}))).body.status, 'TOTALMENTE_RESERVADA');
    await statusRota(m, 'L1', 'BLOQUEADO');
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: item, quantidade_separada: 6 }] }));
    const r6 = await como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: 6 }] });
    assert.strictEqual(r6.status, 400, JSON.stringify(r6.body));
    assert.strictEqual(r6.body.error, requisitionService.fraseEntregaLoteImpedido(m.nome, 6, 'un', 6,
      [{ codigo: 'L1', status: 'BLOQUEADO', data_validade: null, quantidade: 10 }]));
    assert.ok(r6.body.error.includes('L1 (bloqueado, 10 un)') && r6.body.error.includes('faltam 6 un'), r6.body.error);
    assert.deepStrictEqual(await livro(R, m), [], 'nada baixado');
    assert.deepStrictEqual(await linhas(m), ['L1=10'], 'nenhuma linha sem lote');
    assert.deepStrictEqual(await reservas(R), [[6, 'ATIVA']], 'a reserva continua');
    // RN-206.11 (T2): o detalhe nao promete o que a porta recusa (vermelho esperado entre a T1 e a T2)
    const det = (await ok(como('ADMIN').get(`${API}/requisicoes/${R}`))).body.itens[0];
    assert.strictEqual(det.quantidade_entregavel, 0, JSON.stringify(det));
    assert.strictEqual(det.saldo_entregavel, 0);
    await statusRota(m, 'L1', 'ATIVO');
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: 6 }] }));
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'L1', 6]]);
    assert.deepStrictEqual(await linhas(m), ['L1=4']);
  });

  // A segunda rodada e o unico lugar em que o teto do normalizarItem limita a entrega (maxEntregar e saldo_entregavel). Desde a 206 o
  // teto dela e o SEPARAVEL (com o lote impedido): R de 10, reserva 6, L1 6 + L2 4, separa 6, entrega 2 (de L1, antes do bloqueio), L2
  // BLOQUEADO -> caixa 4, tetoSeparavel 0: o detalhe promete 4 (com o teto de hoje prometeria 8 = caixa 4 + teto 4).
  await test('[RN-205.10 segunda rodada -> RN-206.11] R de 10 com reserva 6, entrega 2 antes, L2 (4) bloqueado: o detalhe promete 4 (caixa + tetoSeparavel), a entrega de 8 recusa "faltam 4" e a de 4 sai de L1', async () => {
    const m = await material(); await entrar(m, 6, 'L1');
    const { R, item } = await criar(m, 10);
    assert.strictEqual((await ok(como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {}))).body.status, 'PARCIALMENTE_RESERVADA');
    await entrar(m, 4, 'L2');
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: item, quantidade_separada: 6 }] }));
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: 2 }] }));
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'L1', 2]], 'premissa: a primeira entrega saiu de L1');
    await statusRota(m, 'L2', 'BLOQUEADO');
    const r8 = await como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: 8 }] });
    assert.strictEqual(r8.status, 400, JSON.stringify(r8.body));
    assert.strictEqual(r8.body.error, requisitionService.fraseEntregaLoteImpedido(m.nome, 8, 'un', 4,
      [{ codigo: 'L2', status: 'BLOQUEADO', data_validade: null, quantidade: 4 }]));
    // RN-206.11 (T2): vermelho esperado entre a T1 e a T2
    const det = (await ok(como('ADMIN').get(`${API}/requisicoes/${R}`))).body.itens[0];
    assert.strictEqual(det.saldo_entregavel, 4, JSON.stringify(det));
    assert.strictEqual(det.quantidade_entregavel, 4);
    assert.strictEqual(det.saldo_separavel, 0, 'o separavel desconta o lote impedido (a parte propria esta na caixa)');
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: 4 }] }));
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'L1', 2], ['SAIDA', 'L1', 4]]);
    assert.deepStrictEqual(await linhas(m), ['L2=4'], 'nenhuma linha sem lote');
  });

  // Fase 5, 2o fix-round (desfaz o P1, B1379 reescrita, C484): o "Sem lote atribuido" negativo NAO abate o lote impedido — ele e anonimo,
  // nao diz de qual lote saiu. O P1 abatia; o cenario do revisor abaixo mostra por que era inseguro. Sem abater, o cenario original do P1
  // falha do lado SEGURO: o liberado fica menor que o real (-1, tratado como 0) e nada sai.
  // Etapa 206 (Fase 2 item 3): a entrega nao gera mais esse negativo — os dois cenarios o montam por SQL (o legado continua no banco, C487).
  const negativoLegado = async (m, q) => {
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade) VALUES (?, ?, NULL, ?)',
      [m.id, P01.id, -q]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = quantidade_atual - ? WHERE id = ?', [q, m.id]);
  };
  await test('[Fase 5 P1 desfeito] L1 BLOQUEADO 10 + sem lote -6 (legado, por SQL); entra L3 ATIVO 5: disponivel 9, impedido 10, liberado -1 -> R2 de 5 AGUARDANDO_ESTOQUE sem reserva e a separacao de 5 recusada (lado seguro, C484)', async () => {
    const m = await material(); await entrar(m, 10, 'L1');
    await negativoLegado(m, 6);
    await statusRota(m, 'L1', 'BLOQUEADO');
    await entrar(m, 5, 'L3');
    assert.deepStrictEqual(await linhas(m), ['-=-6', 'L1=10', 'L3=5'], 'premissa: o sem lote negativo da entrega');
    const b = await criar(m, 5);
    const it = await dbGet(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE id = ?', [b.item]);
    const s = await requisitionService.saldoDisponivelParaItem(db, it);
    assert.deepStrictEqual([s.disponivel, s.lote_impedido, s.disponivel_liberado], [9, 10, -1]);
    assert.strictEqual((await ok(como('ADMIN').put(`${API}/requisicoes/${b.R}/aprovar`, {}))).body.status, 'AGUARDANDO_ESTOQUE');
    assert.deepStrictEqual(await reservas(b.R), []);
    const r5 = await como('ALMOX').put(`${API}/requisicoes/${b.R}/separacao`, { itens_separados: [{ item_id: b.item, quantidade_separada: 5 }] });
    assert.strictEqual(r5.status, 400, JSON.stringify(r5.body));
    assert.strictEqual(r5.body.error, `${m.nome}: não é possível separar 5 un. Máximo: 0 (pendente: 5, disponível: 0). `
      + 'Não entram 9 un em lote bloqueado, reprovado ou vencido.');
    assert.deepStrictEqual(await linhas(m), ['-=-6', 'L1=10', 'L3=5'], 'nada saiu');
  });

  // O cenario do revisor (a regressao do P1): o negativo veio de L1, que voltou a ATIVO; o lote impedido agora e L2 (6, inteiro na
  // prateleira). Fisicamente saem 4 de L1. Com o P1 a conta abatia o -6 do L2: liberado 10, reservava 10, separava 10 e a entrega tirava
  // as 6 de L2 bloqueadas com o livro dizendo "SAIDA L1 10". Sem abater: liberado 4, PARCIALMENTE 4, a separacao de 10 recusada.
  await test('[Fase 5 P1 desfeito, cenario do revisor] sem lote -6 de L1 (de volta a ATIVO 10) e L2 BLOQUEADO 6: R2 de 10 -> liberado 4, PARCIALMENTE_RESERVADA 4, separar 10 recusa "Maximo: 4 ... Nao entram 6 un"', async () => {
    const m = await material(); await entrar(m, 10, 'L1');
    await negativoLegado(m, 6);
    await entrar(m, 6, 'L2'); await statusRota(m, 'L2', 'BLOQUEADO');
    assert.deepStrictEqual(await linhas(m), ['-=-6', 'L1=10', 'L2=6'], 'premissa: as linhas do revisor');
    const b = await criar(m, 10);
    const it = await dbGet(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE id = ?', [b.item]);
    const s = await requisitionService.saldoDisponivelParaItem(db, it);
    assert.deepStrictEqual([s.disponivel, s.lote_impedido, s.disponivel_liberado], [10, 6, 4]);
    assert.strictEqual((await ok(como('ADMIN').put(`${API}/requisicoes/${b.R}/aprovar`, {}))).body.status, 'PARCIALMENTE_RESERVADA');
    assert.deepStrictEqual(await reservas(b.R), [[4, 'ATIVA']]);
    const fila = (await ok(como('ALMOX').get(`${API}/fila-separacao`))).body.find((f) => Number(f.id) === Number(b.R));
    assert.strictEqual(fila.itens[0].separavel, 4, JSON.stringify(fila.itens[0]));
    const r10 = await como('ALMOX').put(`${API}/requisicoes/${b.R}/separacao`, { itens_separados: [{ item_id: b.item, quantidade_separada: 10 }] });
    assert.strictEqual(r10.status, 400, JSON.stringify(r10.body));
    assert.strictEqual(r10.body.error, `${m.nome}: não é possível separar 10 un. Máximo: 4 (pendente: 10, disponível: 4). `
      + 'Não entram 6 un em lote bloqueado, reprovado ou vencido.');
    assert.deepStrictEqual(await linhas(m), ['-=-6', 'L1=10', 'L2=6'], 'nada saiu de L2');
    assert.deepStrictEqual(await livro(b.R, m), []);
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
