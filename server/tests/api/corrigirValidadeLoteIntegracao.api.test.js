/**
 * Etapa 191 (T4) — integracao: a validade corrigida pela rota nova (`PUT /lotes/:id/validade`) vale na hora em todas as regras de
 * hoje, conferida numa PORTA DIFERENTE, existente e sem mudanca (RN-191.07): a saida de consumo (desbarrada e barrada), o FEFO da
 * lista de lotes, o e-mail "Lote vencendo" (chave nova e a PENDENTE da data antiga suprimida — Fase 2, achado 5), a liberacao de
 * vencimento anulada (RN-191.08), a entrega da separacao planejada (recusada embrulhada; `origem_automatica` passa com a
 * substituicao gravada — Fase 2, achado 3; liberar destrava) e a dica de coleta da fila de separacao. E o 1 pelo SERVICO.
 *
 * O lote nasce pela rota da 190 (`POST /movimentacoes/v2` ENTRADA com `data_validade` errada — o caminho real do erro de digitacao).
 * Cada cenario tem o seu controle: a mesma conferencia SEM a correcao da o resultado de antes.
 *
 * Usuarios reais por header (molde da 190 T4): ADMIN superadmin movimenta, separa e entrega; QUAL (perfil QUALIDADE) corrige e
 * libera — o `requirePermission('inspecionar')` real; ALMOX le a fila. Fuso: TZ=UTC e as datas relativas de `diaLocal.hojeLocalISO()`.
 * Plano: docs/superpowers/plans/2026-10-23-almoxarifado-etapa191-corrigir-validade-de-lote.md
 *
 * Executar: cd server && node tests/api/corrigirValidadeLoteIntegracao.api.test.js
 */
process.env.TZ = 'UTC';
const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');
const queueService = require('../../services/almoxarifado/notificationQueueService');
const diaLocal = require('../../services/diaLocal');

const { MSG_VALIDADE } = lotService;

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
  ADMIN: { id: 1, nome: 'Adm 191', role: 'admin', is_superadmin: 1, email: 'a191@t.com' },
  QUAL: { id: 19121, nome: 'Qualidade 191', role: 'user', email: 'q191@t.com', perfil_almoxarifado: PERFIS.QUALIDADE },
  ALMOX: { id: 19122, nome: 'Almox 191', role: 'user', email: 'x191@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const VENCIDO = (codigo, data) => `Lote ${codigo} vencido em ${data} nao pode sair para consumo.`;
const hashLoteVencendo = (id, data) => crypto.createHash('sha256').update(`LOTE_VENCENDO|lote-vencendo-${id}-${data}`).digest('hex');

(async () => {
  console.log('\n=== Etapa 191 (T4): integracao da correcao da validade do lote ===\n');
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

  const hoje = diaLocal.hojeLocalISO();
  const dias = (n) => diaLocal.somarDiasISO(hoje, n);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(hoje) && dias(-1) < hoje && hoje < dias(1), `premissa do relogio: ${hoje}`);

  let seq = 0;
  const material = async () => {
    const c = `E191I-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario) VALUES (?, ?, 'UN', 0, 0, 1, 0, 1)`, [c, c])).lastID;
  };
  const novaLoc = async () => (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)',
    [`E191I-LOC-${++seq}`, 'loc 191 T4'])).lastID;
  const entrada = async (m, corpo) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', motivo: 'e191', ...corpo });
    assert.strictEqual(r.status, 201, `entrada ${JSON.stringify(corpo)}: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m, codigo])).id;
  const saida = (m, lote, extra = {}) => como('ADMIN').post(`${API}/movimentacoes/v2`, {
    material_id: m, tipo: 'SAIDA', quantidade: 1, lote_id: lote, motivo: 'e191', justificativa: 'consumo e191', ...extra });
  const corrigir = async (id, nova, vista, quem = 'QUAL') => {
    const r = await como(quem).put(`${API}/lotes/${id}/validade`, { data_validade: nova, validade_vista: vista, justificativa: 'NF diz outra data' });
    assert.strictEqual(r.status, 200, `corrigir ${id} ${vista} -> ${nova}: ${r.status} ${JSON.stringify(r.body)}`);
    // de proposito SEM conferir o banco aqui (a T1 confere): o efeito tem de ser visto pela porta de cada cenario
    return r.body;
  };
  const liberar = async (id) => {
    const r = await como('QUAL').put(`${API}/lotes/${id}/liberar-vencimento`, { justificativa: 'laudo ok e191' });
    assert.strictEqual(r.status, 200, `liberar: ${JSON.stringify(r.body)}`);
  };

  // ── 1. Saida desbarrada ───────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-191.07] saida desbarrada: 2025 digitado no lugar de 2027, corrigido pela rota, a saida passa', async () => {
    const m = await material();
    const e = await entrada(m, { quantidade: 10, lote: 'L-ERR', data_validade: '2025-03-10' });
    assert.strictEqual(e.aviso_validade, MSG_VALIDADE.AVISO_VENCIDO('L-ERR', '2025-03-10'), 'premissa: o aviso da 190');
    const id = await loteId(m, 'L-ERR');
    const r1 = await saida(m, id);
    assert.strictEqual(r1.status, 400, JSON.stringify(r1.body));
    assert.ok(String(r1.body.error).startsWith(VENCIDO('L-ERR', '2025-03-10')), r1.body.error);
    await corrigir(id, '2027-03-10', '2025-03-10');
    const r2 = await saida(m, id);
    assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));
    // controle: o mesmo lote, a mesma saida, SEM a correcao -> continua 400
    const m2 = await material();
    await entrada(m2, { quantidade: 10, lote: 'L-ERR', data_validade: '2025-03-10' });
    const r3 = await saida(m2, await loteId(m2, 'L-ERR'));
    assert.strictEqual(r3.status, 400, `controle: ${r3.status} ${JSON.stringify(r3.body)}`);
  });

  // ── 2. Saida barrada ──────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-191.07] saida barrada: 2027 digitado no lugar de 2025, corrigido pela rota, a saida e recusada', async () => {
    const m = await material();
    await entrada(m, { quantidade: 10, lote: 'L-OK', data_validade: '2027-03-10' });
    const id = await loteId(m, 'L-OK');
    const r1 = await saida(m, id);
    assert.strictEqual(r1.status, 201, `controle (sem a correcao a saida passa): ${JSON.stringify(r1.body)}`);
    const c = await corrigir(id, '2025-03-10', '2027-03-10');
    assert.ok(c.avisos.includes(MSG_VALIDADE.AVISO_CORRIGIDA_VENCIDO('L-OK', '2025-03-10')), JSON.stringify(c.avisos));
    const r2 = await saida(m, id);
    assert.strictEqual(r2.status, 400, JSON.stringify(r2.body));
    assert.ok(String(r2.body.error).startsWith(VENCIDO('L-OK', '2025-03-10')), r2.body.error);
  });

  // ── 3. FEFO na lista de lotes ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-191.07] FEFO na lista de lotes: corrigir LB para antes de LA inverte a ordem', async () => {
    const m = await material();
    await entrada(m, { quantidade: 5, lote: 'LA', data_validade: '2027-06-30' });
    await entrada(m, { quantidade: 5, lote: 'LB', data_validade: '2027-12-31' });
    const ordem = async () => {
      const r = await como('ADMIN').get(`${API}/materiais/${m}/lotes`);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      return r.body.map((l) => l.codigo);
    };
    assert.deepStrictEqual(await ordem(), ['LA', 'LB'], 'controle: sem a correcao, LA vence antes');
    await corrigir(await loteId(m, 'LB'), '2027-01-31', '2027-12-31');
    assert.deepStrictEqual(await ordem(), ['LB', 'LA']);
  });

  // ── 4. E-mail "Lote vencendo" ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-191.07 / B1297] e-mail Lote vencendo: chave nova a cada correcao e a PENDENTE da data anterior vira FALHA', async () => {
    const setConfig = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
    await setConfig('alertas_estoque_notificar_email', '1');
    await setConfig('alertas_estoque_emails', 'almox191@teste.com');
    await setConfig('alerta_lote_vencendo_dias', '30');
    const m = await material();
    const longe = dias(200);
    await entrada(m, { quantidade: 3, lote: 'L-MAIL', data_validade: longe });
    const id = await loteId(m, 'L-MAIL');
    const doLote = async () => (await dbAll(db, `SELECT id, hash_dedupe, status, ultimo_erro FROM fila_notificacoes_almoxarifado
      WHERE evento = 'LOTE_VENCENDO' ORDER BY id`)).filter((l) => [longe, dias(10), dias(12)].some((d) => l.hash_dedupe.startsWith(hashLoteVencendo(id, d)))); // Fase 5 F1: a suprimida ganha sufixo
    await queueService.varrerLotesVencendo(db);
    assert.strictEqual((await doLote()).length, 0, 'controle: fora da janela, sem a correcao, nenhum aviso');
    await queueService.varrerLotesVencendo(db);
    assert.strictEqual((await doLote()).length, 0, 'controle: varrer de novo sem a correcao continua sem aviso');

    await corrigir(id, dias(10), longe);
    await queueService.varrerLotesVencendo(db);
    let linhas = await doLote();
    assert.strictEqual(linhas.length, 1, JSON.stringify(linhas));
    assert.strictEqual(linhas[0].hash_dedupe, hashLoteVencendo(id, dias(10)), 'dedupe_chave lote-vencendo-<id>-<hoje+10>');
    assert.strictEqual(linhas[0].status, 'PENDENTE', 'premissa: a linha nova fica PENDENTE');

    await corrigir(id, dias(12), dias(10));
    await queueService.varrerLotesVencendo(db);
    linhas = await doLote();
    assert.strictEqual(linhas.length, 2, `mais 1 (chave nova): ${JSON.stringify(linhas)}`);
    const antiga = linhas.find((l) => l.hash_dedupe === `${hashLoteVencendo(id, dias(10))}:suprimida:${l.id}`);
    const nova = linhas.find((l) => l.hash_dedupe === hashLoteVencendo(id, dias(12)));
    assert.ok(antiga && nova, JSON.stringify(linhas));
    assert.strictEqual(antiga.status, 'FALHA', 'a PENDENTE da data anterior continuou PENDENTE (o e-mail errado sairia)');
    assert.strictEqual(antiga.ultimo_erro, 'Validade do lote corrigida antes do envio');
    assert.strictEqual(nova.status, 'PENDENTE');
  });

  // ── 4b. Vai-e-volta A -> B -> A (Fase 5, F1) ──────────────────────────────────────────────────────────────────────────────
  await test('[B1297 / Fase 5 F1] vai-e-volta A -> B -> A: a volta para A enfileira de novo (a FALHA antiga nao segura a chave)', async () => {
    const m = await material();
    const A = dias(10); const B = dias(200);
    await entrada(m, { quantidade: 3, lote: 'L-VV', data_validade: A });
    const id = await loteId(m, 'L-VV');
    const doLote = async () => (await dbAll(db, `SELECT id, hash_dedupe, status, ultimo_erro, payload FROM fila_notificacoes_almoxarifado
      WHERE evento = 'LOTE_VENCENDO' ORDER BY id`)).filter((l) => l.payload && JSON.parse(l.payload).lote_id === id);
    await queueService.varrerLotesVencendo(db);
    let linhas = await doLote();
    assert.strictEqual(linhas.length, 1, `premissa: A na janela enfileira: ${JSON.stringify(linhas)}`);
    assert.strictEqual(linhas[0].status, 'PENDENTE');
    await corrigir(id, B, A);
    await corrigir(id, A, B);
    await queueService.varrerLotesVencendo(db);
    linhas = await doLote();
    assert.strictEqual(linhas.length, 2, `a volta para A nao enfileirou (o lote venceria sem e-mail): ${JSON.stringify(linhas)}`);
    assert.strictEqual(linhas[0].status, 'FALHA');
    assert.strictEqual(linhas[0].ultimo_erro, 'Validade do lote corrigida antes do envio');
    assert.strictEqual(linhas[1].status, 'PENDENTE');
    assert.strictEqual(linhas[1].hash_dedupe, hashLoteVencendo(id, A), 'a nova tem a chave de A');
    await queueService.varrerLotesVencendo(db);
    assert.strictEqual((await doLote()).length, 2, 'varrer de novo nao duplica a PENDENTE de A');
  });

  // ── 5. Liberacao anulada ──────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-191.08] liberacao: corrigir a data anula a liberacao; liberar de novo destrava a saida', async () => {
    const m = await material();
    await entrada(m, { quantidade: 10, lote: 'L-LIB', data_validade: '2025-01-10' });
    const id = await loteId(m, 'L-LIB');
    await liberar(id);
    const r1 = await saida(m, id);
    assert.strictEqual(r1.status, 201, `controle (liberado, sem a correcao, a saida passa): ${JSON.stringify(r1.body)}`);
    const c = await corrigir(id, '2025-01-20', '2025-01-10');
    assert.deepStrictEqual(c.avisos.slice(0, 2), [MSG_VALIDADE.AVISO_LIBERACAO_ANULADA('L-LIB'),
      MSG_VALIDADE.AVISO_CORRIGIDA_VENCIDO('L-LIB', '2025-01-20')], JSON.stringify(c.avisos));
    const r2 = await saida(m, id);
    assert.strictEqual(r2.status, 400, JSON.stringify(r2.body));
    assert.ok(String(r2.body.error).startsWith(VENCIDO('L-LIB', '2025-01-20')), r2.body.error);
    await liberar(id);
    const r3 = await saida(m, id);
    assert.strictEqual(r3.status, 201, JSON.stringify(r3.body));
  });

  // ── 6. Separacao planejada ────────────────────────────────────────────────────────────────────────────────────────────────
  const reqDoItem = async (m, q) => {
    const r = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E191I-${++seq}`])).lastID;
    const item = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
      VALUES (?,?,?,0,0,0)`, [r, m, q])).lastID;
    return { id: r, item };
  };
  const separar = async (rq, q, loc, lote) => {
    const sep = await como('ADMIN').put(`${API}/requisicoes/${rq.id}/separar`,
      { itens_separados: [{ item_id: rq.item, quantidade_separada: q, localizacao_origem_id: loc, lote_id: lote }] });
    assert.strictEqual(sep.status, 200, `separar: ${JSON.stringify(sep.body)}`);
    assert.strictEqual((await dbGet(db, 'SELECT lote_separacao_id FROM itens_requisicao_almoxarifado WHERE id = ?', [rq.item]))
      .lote_separacao_id, lote, 'a separacao nao gravou o lote planejado');
  };
  const entregar = (rq, q, extra = {}) => como('ADMIN').put(`${API}/requisicoes/${rq.id}/entregar`,
    { itens_atendidos: [{ item_id: rq.item, quantidade_atendida: q, ...extra }] });
  const pegarEm = async (rq) => {
    const f = await como('ALMOX').get(`${API}/fila-separacao`);
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    const r = f.body.find((x) => x.id === rq.id);
    assert.ok(r, 'requisicao na fila');
    const pe = r.itens[0].pegar_em;
    return pe ? pe.lote_codigo : null;
  };

  await test('[RN-191.07/10] separacao planejada: a entrega recusa (embrulhada), automatica passa com a troca, liberar destrava, a dica muda', async () => {
    const m = await material();
    const LOC = await novaLoc(); const LOC2 = await novaLoc();
    await entrada(m, { quantidade: 10, lote: 'L-S', data_validade: '2027-02-28', localizacao_destino_id: LOC });
    await entrada(m, { quantidade: 10, lote: 'L-T', data_validade: '2028-12-31', localizacao_destino_id: LOC2 });
    const ls = await loteId(m, 'L-S'); const lt = await loteId(m, 'L-T');
    const rq = await reqDoItem(m, 3);
    await separar(rq, 3, LOC, ls);
    const outra = await reqDoItem(m, 2); // da fila, nao separada
    assert.strictEqual(await pegarEm(outra), 'L-S', 'controle: sem a correcao a dica e L-S (vence antes)');

    const c = await corrigir(ls, dias(-1), '2027-02-28');
    assert.deepStrictEqual(c.avisos, [MSG_VALIDADE.AVISO_CORRIGIDA_VENCIDO('L-S', dias(-1)), MSG_VALIDADE.AVISO_SEPARACAO('L-S', 1),
      MSG_VALIDADE.AVISO_ETIQUETA('L-S', '2027-02-28')]);
    assert.strictEqual(await pegarEm(outra), 'L-T', 'a dica de coleta continuou sugerindo o lote vencido');

    // a entrega pela origem planejada: a literal do lote vencido, embrulhada em "nao serve mais"
    const r1 = await entregar(rq, 1);
    assert.strictEqual(r1.status, 400, JSON.stringify(r1.body));
    assert.ok(String(r1.body.error).includes('não serve mais'), r1.body.error);
    assert.ok(String(r1.body.error).includes(VENCIDO('L-S', dias(-1))), r1.body.error);

    // Fase 2, achado 3: SEM liberar, a entrega automatica passa e a troca fica registrada. A automatica de hoje baixa SEM lote
    // (`lote_id` nulo no livro — comportamento da Etapa 63, o `saiu_codigo` nulo do substituicaoOrigem); o que importa aqui: nao sai
    // do lote vencido e o item nao fica preso.
    const r2 = await entregar(rq, 1, { origem_automatica: true });
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.body));
    let subs = await dbAll(db, 'SELECT * FROM substituicoes_origem_requisicao WHERE item_id = ? ORDER BY id', [rq.item]);
    assert.strictEqual(subs.length, 1, JSON.stringify(subs));
    assert.strictEqual(subs[0].automatica, 1);
    assert.strictEqual(Number(subs[0].lote_planejado_id), ls);
    assert.notStrictEqual(subs[0].lote_saida_id, ls, 'a automatica saiu do lote vencido');
    const movAuto = await dbGet(db, 'SELECT lote_id FROM movimentacoes_almoxarifado WHERE id = ?', [JSON.parse(subs[0].movimentacao_ids)[0]]);
    assert.notStrictEqual(movAuto.lote_id, ls, 'o livro diz que a automatica saiu do lote vencido');
    // e "entregue escolhendo outro lote" (o texto do aviso): outro lote explicito, troca registrada com o lote que saiu
    const r2b = await entregar(rq, 1, { localizacao_origem_id: LOC2, lote_id: lt, motivo_substituicao: 'L-S vencido' });
    assert.strictEqual(r2b.status, 200, JSON.stringify(r2b.body));
    subs = await dbAll(db, 'SELECT * FROM substituicoes_origem_requisicao WHERE item_id = ? ORDER BY id', [rq.item]);
    assert.strictEqual(subs.length, 2, JSON.stringify(subs));
    assert.strictEqual(subs[1].automatica, 0);
    assert.strictEqual(Number(subs[1].lote_saida_id), lt);
    assert.strictEqual(subs[1].motivo, 'L-S vencido');

    // o pendente ainda vem da planejada: recusado; liberar o vencimento destrava
    const r3 = await entregar(rq, 1);
    assert.strictEqual(r3.status, 400, `ainda planejada e vencida: ${JSON.stringify(r3.body)}`);
    assert.ok(String(r3.body.error).includes('não serve mais'), r3.body.error);
    await liberar(ls);
    const r4 = await entregar(rq, 1);
    assert.strictEqual(r4.status, 200, JSON.stringify(r4.body));
    const it = await dbGet(db, 'SELECT quantidade_entregue FROM itens_requisicao_almoxarifado WHERE id = ?', [rq.item]);
    assert.strictEqual(Number(it.quantidade_entregue), 3);

    // controle: a mesma separacao e a mesma entrega SEM a correcao -> 200 direto
    const m2 = await material(); const L3 = await novaLoc();
    await entrada(m2, { quantidade: 10, lote: 'L-S', data_validade: '2027-02-28', localizacao_destino_id: L3 });
    const rq2 = await reqDoItem(m2, 3);
    await separar(rq2, 3, L3, await loteId(m2, 'L-S'));
    const r5 = await entregar(rq2, 3);
    assert.strictEqual(r5.status, 200, `controle: ${JSON.stringify(r5.body)}`);
  });

  // ── 7. Pelo servico ───────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-191.14] pelo servico: corrigirValidadeDoLote + registrarMovimentacao (sem rota)', async () => {
    const m = await material();
    await stockService.registrarMovimentacao(db, USERS.ADMIN, {
      material_id: m, tipo: 'ENTRADA', quantidade: 10, lote: 'L-SRV', data_validade: '2025-03-10', motivo: 'e191' });
    const id = await loteId(m, 'L-SRV');
    const sai = () => stockService.registrarMovimentacao(db, USERS.ADMIN, {
      material_id: m, tipo: 'SAIDA', quantidade: 1, lote_id: id, motivo: 'e191', justificativa: 'consumo e191' });
    await assert.rejects(sai, (e) => e.status === 400 && String(e.message).startsWith(VENCIDO('L-SRV', '2025-03-10')),
      'controle: sem a correcao, a saida e recusada');
    const r = await lotService.corrigirValidadeDoLote(db, USERS.QUAL, id,
      { data_validade: '2027-03-10', validade_vista: '2025-03-10', justificativa: 'NF diz 2027' });
    const s = await sai(); // a porta primeiro (o retorno do servico vem depois)
    assert.ok(s, 'a saida nao voltou nada');
    assert.strictEqual(r.lote.data_validade, '2027-03-10');
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [m])).quantidade_atual, 9);
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
