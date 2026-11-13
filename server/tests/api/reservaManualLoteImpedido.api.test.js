/**
 * Etapa 221 (T1, T3) — a reserva manual nao conta o lote impedido (C479; RN-221.01 a .09).
 *
 * `POST /api/almoxarifado/reservas` -> `stockService.criarReserva` -> o `hold` de `criarReservaSemTrava` compara com
 * `livre de caixa - loteImpedidoSql` so na reserva manual (`!sistema && !requisicao_id`, B1469); a recusa diz o que o lote cortou
 * (B1470). As reservas do sistema (aprovacao, chegada, reserva da OS) nao mudam.
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa221-reserva-manual-lote-impedido.md
 *
 * Executar: cd server && node tests/api/reservaManualLoteImpedido.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const USERS = {
  ADMIN: { id: 1, nome: 'Adm 221', role: 'admin', is_superadmin: 1, email: 'a221@t.com' },
  SOL: { id: 22111, nome: 'Solic 221', email: 's221@t.com' },
};
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
const FRASE = (n) => `Não entram ${n} un em lote bloqueado, reprovado ou vencido.`;
const RECUSA = (base, cortado) => `Saldo disponível insuficiente: ${base}. ${FRASE(cortado)}`;
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 221: a reserva manual nao conta o lote impedido ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
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
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const u of Object.values(USERS)) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [u.id, u.nome, u.email]);
  }
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM221', nome: 'Almox 221' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  await como('ADMIN').post(`${API}/localizacoes`, { codigo: 'Z221-01', descricao: 'Z221-01', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z221-01'");

  const material = async ({ lote = 1 } = {}) => {
    const c = `E221-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, 0, ?)`, [c, c, lote, P01.id])).lastID;
  };
  const entrar = (m, q, lote) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e221', localizacao_destino_id: P01.id, lote }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m, codigo])).id;
  const status = async (m, codigo, st) => ok(como('ADMIN').put(`${API}/lotes/${await loteId(m, codigo)}/status`,
    { status: st, justificativa: 'teste 221' }));
  const validade = async (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?',
    [data, await loteId(m, codigo)]);
  const reservar = (m, q) => como('ADMIN').post(`${API}/reservas`, { material_id: m, quantidade: q, os_referencia: 'OS-221',
    observacoes: 'e221' });
  const recusou = (r, literal) => {
    assert.strictEqual(r.status, 400, `esperava 400, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, literal);
  };
  // o material e o livro: a recusa nao pode mexer em nada
  const foto = async (m) => JSON.stringify({
    ...(await dbGet(db, `SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r FROM materiais_almoxarifado WHERE id=?`, [m])),
    livro: (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id=?', [m])).n,
    reservas: (await dbGet(db, "SELECT COUNT(*) n FROM reservas_material_almoxarifado WHERE material_id=? AND status='ATIVA'", [m])).n,
  });
  const reservado = async (m) => Number((await dbGet(db, 'SELECT COALESCE(quantidade_reservada,0) r FROM materiais_almoxarifado WHERE id=?',
    [m])).r);
  const l1l2 = async ({ lote = 1 } = {}) => {
    const m = await material({ lote });
    await entrar(m, 4, 'L1'); await entrar(m, 6, 'L2');
    return m;
  };

  // ── RN-221.01 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-221.01] L1 ATIVO 4 + L2 BLOQUEADO 6: reserva manual de 4 -> 201; de 5 -> 400 com o corte; nada muda', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO');
    const antes = await foto(m);
    recusou(await reservar(m, 5), RECUSA(4, 6));
    assert.strictEqual(await foto(m), antes, 'a recusa mexeu no material');
    await ok(reservar(m, 4), 201);
    assert.strictEqual(await reservado(m), 4);
  });

  // ── RN-221.02 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-221.02 a] L2 REPROVADO -> o mesmo 400', async () => {
    const m = await l1l2(); await status(m, 'L2', 'REPROVADO');
    recusou(await reservar(m, 5), RECUSA(4, 6));
  });
  await test('[RN-221.02 b] L2 ATIVO vencido ontem -> o mesmo 400', async () => {
    const m = await l1l2(); await validade(m, 'L2', dia(-1));
    recusou(await reservar(m, 5), RECUSA(4, 6));
  });
  await test('[RN-221.02 c] L2 vencido com o vencimento liberado conta: reserva de 10 -> 201', async () => {
    const m = await l1l2(); await validade(m, 'L2', dia(-1));
    await ok(como('ADMIN').put(`${API}/lotes/${await loteId(m, 'L2')}/liberar-vencimento`, { justificativa: 'teste 221' }));
    await ok(reservar(m, 10), 201);
    assert.strictEqual(await reservado(m), 10);
  });

  // ── RN-221.03 / .04 / .05 ─────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-221.03] so L2 BLOQUEADO 6: reserva de 1 -> 400 "0. Nao entram 6"', async () => {
    const m = await material(); await entrar(m, 6, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    recusou(await reservar(m, 1), RECUSA(0, 6));
    assert.strictEqual(await reservado(m), 0);
  });
  await test('[RN-221.04] sem controle de lote, lote BLOQUEADO 6: reserva de 6 -> 201 (igual a antes)', async () => {
    const m = await material(); await entrar(m, 6, 'L2');
    await dbRun(db, "UPDATE lotes_almoxarifado SET status = 'BLOQUEADO' WHERE material_id = ?", [m]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 0 WHERE id = ?', [m]);
    await ok(reservar(m, 6), 201);
    assert.strictEqual(await reservado(m), 6);
  });
  await test('[RN-221.05] sem lote impedido, a recusa e a de hoje byte a byte', async () => {
    const m = await material(); await entrar(m, 4, 'L1');
    recusou(await reservar(m, 5), 'Saldo disponível insuficiente: 4');
  });

  // ── RN-221.06 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-221.06] a manual de antes do bloqueio fica; a nova ve 0 e o corte e so o que o lote tirou (4, nao 6)', async () => {
    const m = await l1l2();
    const r = await ok(reservar(m, 6), 201);
    await status(m, 'L2', 'BLOQUEADO');
    const viva = await dbGet(db, 'SELECT status, quantidade FROM reservas_material_almoxarifado WHERE id = ?', [r.body.id]);
    assert.deepStrictEqual([viva.status, Number(viva.quantidade)], ['ATIVA', 6], 'a reserva de antes foi mexida');
    recusou(await reservar(m, 1), RECUSA(0, 4));
  });

  // ── RN-221.07 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-221.07 a] reserva do sistema sem requisicao (a recriacao da reserva da OS) sobre so lote BLOQUEADO -> criada', async () => {
    const m = await material(); await entrar(m, 6, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    const r = await stockService.criarReserva(db, { ...USERS.ADMIN }, { material_id: m, quantidade: 6, os_referencia: 'OS-221' },
      { sistema: true, motivo: 'Reserva da OS 221', semExpiracao: true });
    assert.ok(r && r.id, 'nao criou');
    assert.strictEqual(await reservado(m), 6);
  });
  await test('[RN-221.07 b] a aprovacao continua reservando 4 de L1 (L2 BLOQUEADO 6, requisicao de 10)', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO');
    const cr = await como('SOL').post(`${API}/requisicoes`, { os_referencia: 'OS-221', itens: [{ material_id: m, quantidade: 10 }] });
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    const ap = await ok(como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/aprovar`, {}));
    assert.strictEqual(ap.body.status, 'PARCIALMENTE_RESERVADA', JSON.stringify(ap.body));
    assert.strictEqual(await reservado(m), 4);
  });

  // ── RN-221.08 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-221.08] pelo servico (criarReserva sem 4o argumento) -> o mesmo erro, status 400', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO');
    const e = await stockService.criarReserva(db, { ...USERS.ADMIN }, { material_id: m, quantidade: 5 })
      .then(() => null, (x) => x);
    assert.ok(e, 'o servico aceitou');
    assert.deepStrictEqual([e.status, e.message], [400, RECUSA(4, 6)]);
  });

  // ── RN-221.09 (T3, integracao pela rota) ──────────────────────────────────────────────────────────────────────────
  await test('[RN-221.09] recusada -> liberar o lote (status ATIVO) -> a reserva passa -> a saida contra ela baixa 6', async () => {
    const m = await material(); await entrar(m, 6, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    recusou(await reservar(m, 6), RECUSA(0, 6));
    await status(m, 'L2', 'ATIVO');
    const r = await ok(reservar(m, 6), 201);
    const s = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'SAIDA', quantidade: 6, motivo: 'e221',
      reserva_id: r.body.id, localizacao_origem_id: P01.id, lote: 'L2', os_referencia: 'OS-221', justificativa: 'teste 221' });
    assert.strictEqual(s.status, 201, JSON.stringify(s.body));
    const fim = await dbGet(db, 'SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r FROM materiais_almoxarifado WHERE id=?', [m]);
    assert.deepStrictEqual([Number(fim.q), Number(fim.r)], [0, 0]);
    const rs = await dbAll(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [r.body.id]);
    assert.strictEqual(rs[0].status, 'CONSUMIDA');
  });

  // ── Fase 2 (achados I1, I2, M1) ───────────────────────────────────────────────────────────────────────────────────
  const caixaSql = require('../../services/almoxarifado/caixaSql');
  await test('[RN-221.12] com caixa: L1 4 + L2 BLOQUEADO 6, 3 separados sem reserva -> manual de 2: "1<sufixo da caixa>. Nao entram 6"; de 1 -> 201', async () => {
    const m = await material();
    const cr = await como('SOL').post(`${API}/requisicoes`, { os_referencia: 'OS-221', itens: [{ material_id: m, quantidade: 3 }] });
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    const ap = await ok(como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/aprovar`, {}));
    assert.strictEqual(ap.body.status, 'AGUARDANDO_ESTOQUE', `premissa: ${JSON.stringify(ap.body)}`);
    await entrar(m, 4, 'L1'); await entrar(m, 6, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    const item = await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [cr.body.id]);
    await ok(como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/separar`, { itens_separados: [{ item_id: item.id, quantidade_separada: 3 }] }));
    const sufixo = caixaSql.sufixoCaixa(await caixaSql.lerCaixa(db, m), 'un');
    assert.ok(sufixo.startsWith(' — 3 un estão separados para'), `premissa: caixa 3, veio "${sufixo}"`);
    recusou(await reservar(m, 2), `Saldo disponível insuficiente: 1${sufixo}. ${FRASE(6)}`);
    await ok(reservar(m, 1), 201);
  });
  await test('[RN-221.13] (B1474) a reserva da OS sobre o lote bloqueado conta contra a manual (como na aprovacao): manual de 1 -> "0. Nao entram 4"', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO');
    await stockService.criarReserva(db, { ...USERS.ADMIN }, { material_id: m, quantidade: 6, os_referencia: 'OS-221' },
      { sistema: true, motivo: 'Reserva da OS 221', semExpiracao: true });
    recusou(await reservar(m, 1), RECUSA(0, 4));
  });
  await test('[RN-221.05 b] base negativa (legado, reservado acima do fisico) com lote impedido: a recusa de hoje byte a byte', async () => {
    const m = await material(); await entrar(m, 6, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = 8 WHERE id = ?', [m]);
    const com = await reservar(m, 1);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 0 WHERE id = ?', [m]);
    const sem = await reservar(m, 1);
    assert.strictEqual(sem.status, 400, JSON.stringify(sem.body));
    assert.ok(!/Não entram/.test(sem.body.error), sem.body.error);
    recusou(com, sem.body.error);
  });

  await test('[RN-221.05 c] lote ATIVO que vence daqui a 30 dias nao corta: reserva de 5 sobre 4 -> a recusa de hoje (o mesmo "hoje" no hold e na frase)', async () => {
    const m = await material(); await entrar(m, 4, 'L1'); await validade(m, 'L1', dia(30));
    recusou(await reservar(m, 5), 'Saldo disponível insuficiente: 4');
    await ok(reservar(m, 4), 201);
  });

  // ── Fase 5 (revisao dos testes): unidade, a base certa com caixa, o "hoje" exato ──────────────────────────────────────────────────
  await test('[RN-221.03 b] a unidade do material na frase (PC, nao un)', async () => {
    const m = await material(); await dbRun(db, "UPDATE materiais_almoxarifado SET unidade = 'PC' WHERE id = ?", [m]);
    await entrar(m, 6, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    recusou(await reservar(m, 1), 'Saldo disponível insuficiente: 0. Não entram 6 PC em lote bloqueado, reprovado ou vencido.');
  });
  await test('[RN-221.12 b] caixa maior que o livre: o corte e contra o livre de caixa (4), nao contra o disponivel (10) -> "0<sufixo>. Nao entram 4"', async () => {
    const m = await material();
    const cr = await como('SOL').post(`${API}/requisicoes`, { os_referencia: 'OS-221', itens: [{ material_id: m, quantidade: 6 }] });
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    await ok(como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/aprovar`, {}));
    await entrar(m, 4, 'L1'); await entrar(m, 6, 'L2');
    const item = await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [cr.body.id]);
    await ok(como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/separar`, { itens_separados: [{ item_id: item.id, quantidade_separada: 6 }] }));
    await status(m, 'L2', 'BLOQUEADO'); // depois de separar: a caixa de 6 fica, o livre fora dela e 4 (D (221) item 3)
    const sufixo = caixaSql.sufixoCaixa(await caixaSql.lerCaixa(db, m), 'un');
    assert.ok(sufixo.startsWith(' — 6 un estão separados para'), `premissa: caixa 6, veio "${sufixo}"`);
    recusou(await reservar(m, 1), `Saldo disponível insuficiente: 0${sufixo}. ${FRASE(4)}`);
  });
  await test('[RN-221.05 d] lote que vence HOJE ainda nao venceu: reserva de 5 sobre 4 -> a recusa de hoje; de 4 -> 201', async () => {
    const m = await material(); await entrar(m, 4, 'L1'); await validade(m, 'L1', dia(0));
    recusou(await reservar(m, 5), 'Saldo disponível insuficiente: 4');
    await ok(reservar(m, 4), 201);
  });

  // ── Fase 5 (revisao das travas, B1475): o claim da transformacao no terceiro sob a trava do material ─────────────────────────────
  // Sem gancho em producao: o teste segura a trava do material (S), enfileira a reserva, dispara a transformacao e solta S. Antes, o claim
  // do item rodava fora da trava (o retido do lote perdia a parte em terceiros do L1 e o impedido caia de 6 para 4): a reserva passava (201).
  const trava = require('../../services/almoxarifado/travaPorMaterial');
  const terceiro = require('../../services/almoxarifado/thirdPartyService');
  const espera = (ms) => new Promise((r) => { setTimeout(r, ms); });
  await test('[RN-221.14] (B1475) transformacao no terceiro em voo: a reserva manual na fila nao le o impedido pela metade -> 400; o final bate', async () => {
    const m = await material(); await entrar(m, 2, 'L1'); await entrar(m, 6, 'L2');
    const l1 = await loteId(m, 'L1');
    await status(m, 'L2', 'BLOQUEADO');
    const rem = await terceiro.criarRemessa(db, { ...USERS.ADMIN }, { fornecedor_nome: 'Corte 221', tipo_servico: 'Corte',
      prazo_previsto: dia(30), itens: [{ material_id: m, quantidade: 2, lote_id: l1 }] });
    await terceiro.enviarRemessa(db, { ...USERS.ADMIN }, rem.id);
    const item = await dbGet(db, 'SELECT id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?', [rem.id]);
    const peca = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, custo_unitario)
      VALUES (?, ?, 'un', 0, 1, 0)`, [`E221P-${++seq}`, `E221P-${seq}`])).lastID;
    recusou(await reservar(m, 2), RECUSA(0, 6)); // controle: sem corrida, recusa
    let soltar; const portao = new Promise((r) => { soltar = r; });
    let entrou; const dentro = new Promise((r) => { entrou = r; });
    const segura = trava.comLockDoMaterial(m, async () => { entrou(); await portao; });
    await dentro;
    const pReserva = reservar(m, 2).then((x) => x);
    await espera(200);
    assert.strictEqual(trava.travado(m), true, 'premissa: a trava do material presa pelo teste');
    const pTransf = terceiro.registrarTransformacao(db, { ...USERS.ADMIN }, rem.id, { nota_fiscal: 'NF-221', itens: [{ item_remessa_id: item.id,
      quantidade_consumida: 2, resultados: [{ material_id: peca, quantidade: 1, tipo_resultado: 'PECA' }] }] })
      .then(() => 'ok', (e) => `erro: ${e.message}`);
    await espera(300); // tempo para o claim acontecer, se ele estivesse fora da trava
    soltar(); await segura;
    const r = await pReserva;
    assert.strictEqual(await pTransf, 'ok');
    recusou(r, RECUSA(0, 6));
    const fim = await dbGet(db, `SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r, COALESCE(quantidade_em_terceiros,0) t
      FROM materiais_almoxarifado WHERE id = ?`, [m]);
    assert.deepStrictEqual([Number(fim.q), Number(fim.r), Number(fim.t)], [6, 0, 0]);
  });

  terminou = true;
  console.log(`\n  ${passed} passou, ${failed} falhou\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
