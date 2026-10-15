/**
 * Etapa 99 (T1, C197) — a porta da separacao recusa o que nao e separavel.
 *
 * Antes, `PUT /requisicoes/:id/separar` (e o alias `/separacao`, e `requisitionService.separarRequisicao` chamado direto)
 * PULAVA em silencio a entrada que nao conseguia ler — quantidade negativa, texto, item que nao e da requisicao — e
 * respondia 200 "Separacao registrada", reivindicando a requisicao para EM_SEPARACAO sem separar nada. Pior: `true`
 * separava 1 (`Number(true)`), a entrada valida do mesmo payload gravava enquanto a invalida sumia (a "tudo ou nada" da
 * 28 so valia para o que a passada 1 recusava), lista que nao era lista dava 500 ou iterava as letras, fracao de
 * material com serie gravava 1,5 na caixa (a entrega so tira inteiro), e com a alcada de valor armada o payload
 * invalido gravava AGUARDANDO_APROVACAO_VALOR e disparava o e-mail dos aprovadores.
 *
 * Agora (B516-B521): uma passada de FORMA, depois do status (PODE_SEPARAR) e ANTES da alcada de valor e da
 * reivindicacao, recusa com 400 e literal (Q1-Q4) e nada muda. 0, ausente, null, "" e [] continuam aceitos (28 RN-02).
 *
 * Usuarios reais por header (molde 95-98): S sem perfil (PRODUCAO) cria pela rota; ADMIN superadmin aprova e movimenta;
 * ALMOX (ALMOXARIFE) separa. Servico direto: `requisitionService.separarRequisicao(db, R, itens, SVC)`.
 * Casos `[99 RN-01]` a `[99 RN-08]`. Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa99-separacao-recusa-o-inseparavel.md
 *
 * Executar: cd server && node tests/api/separacaoFormaDaEntrada.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const valueApprovalService = require('../../services/almoxarifado/requisitionValueApprovalService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 99', role: 'admin', is_superadmin: 1, email: 'a99@t.com' },
  S: { id: 9901, nome: 'Solic 99', role: 'user', email: 's99@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9902, nome: 'Almox 99', role: 'user', email: 'x99@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const SVC = { id: 9904, nome: 'Svc 99', role: 'user', perfil_almoxarifado: PERFIS.ALMOXARIFE };
const API = '/api/almoxarifado';
const LIT_Q4 = 'Informe os itens separados em lista (itens_separados)';
const q1 = (nome, bruto) => `${nome}: quantidade inválida para separar (${bruto}) — informe um número positivo, ou 0 para não separar este item`;
const q2 = (id) => `Item ${id} não pertence a esta requisição`;
const q3 = (nome, q) => `${nome}: material com controle de série exige quantidade inteira na separação (informado: ${q})`;
const MSG_STATUS_SEPARAR = 'Requisição deve estar aprovada, aguardando estoque/compra, em separação ou parcialmente atendida para separar';

// Espiao de notificarAprovadoresValor pelo objeto do modulo (Etapa 94 I3: a verificacao chama por ele).
const notificados = [];
const notificarOriginal = valueApprovalService.notificarAprovadoresValor;
valueApprovalService.notificarAprovadoresValor = async (db, req) => { notificados.push(Number(req && req.id)); };

let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 99 T1: a separacao recusa o que nao e separavel ===\n');
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
    putCru: (u, texto) => request(app).put(u).set('x-teste-usuario', k).set('Content-Type', 'application/json').send(texto).then((x) => x),
  });

  const material = async ({ serie = 0, custo = 0.1 } = {}) => {
    const c = `E99-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, custo_unitario, controle_serie) VALUES (?, ?, 'PC', 0, 0, 1, ?, ?)`, [c, `Mat ${c}`, custo, serie])).lastID;
    return { id, nome: `Mat ${c}` };
  };
  const entrar = async (m, q, series) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, {
      material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e99', ...(series ? { series } : {}),
    });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const criar = async (pares) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-99',
      itens: pares.map(([m, q]) => ({ material_id: m.id, quantidade: q })),
    });
    assert.strictEqual(cr.status, 201, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    return { R: cr.body.id, ids };
  };
  const aprovar = async (R) => {
    const r = await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {});
    assert.strictEqual(r.status, 200, `aprovar: ${JSON.stringify(r.body)}`);
  };
  const conferenciaAMao = (R) => dbRun(db, `UPDATE requisicoes_almoxarifado SET conferido_por_id = 77,
      conferido_por_nome = 'Conf 77', conferido_em = '2026-10-09 10:00:00' WHERE id = ?`, [R]);
  // Montagem: material PC, entrada 4, S pede 4, ADMIN aprova (TOTALMENTE_RESERVADA), conferencia 77 gravada a mao.
  const montagem = async ({ itens = 1, q = 4, serie = 0 } = {}) => {
    const ms = [];
    for (let i = 0; i < itens; i++) {
      // eslint-disable-next-line no-await-in-loop
      const m = await material({ serie });
      // eslint-disable-next-line no-await-in-loop
      await entrar(m, q, serie ? Array.from({ length: q }, (_, k) => `S99-${seq}-${k}`) : undefined);
      ms.push(m);
    }
    const a = await criar(ms.map((m) => [m, q]));
    await aprovar(a.R);
    await conferenciaAMao(a.R);
    return { ms, m: ms[0], ...a };
  };
  const separar = (R, itens, u = 'ALMOX', rota = 'separar') => como(u).put(`${API}/requisicoes/${R}/${rota}`, { itens_separados: itens });
  const svc = async (R, itens) => {
    try { return { status: 200, body: await requisitionService.separarRequisicao(db, R, itens, SVC) }; } catch (e) {
      return { status: e.status || 500, body: { error: e.message } };
    }
  };
  // "Nada muda": status, separado de TODOS os itens, rodadas, SEPARACAO na trilha, conferencia, alcada.
  const retrato = async (R) => ({
    req: await dbGet(db, `SELECT status, conferido_por_id, conferido_por_nome, conferido_em, requer_aprovacao_valor
      FROM requisicoes_almoxarifado WHERE id=?`, [R]),
    itens: (await dbAll(db, 'SELECT id, quantidade_separada FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [R]))
      .map((i) => [i.id, Number(i.quantidade_separada || 0)]),
    rodadas: (await dbGet(db, 'SELECT COUNT(*) n FROM separacoes_requisicao_almoxarifado WHERE requisicao_id=?', [R])).n,
    trilha: (await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade='requisicao' AND entidade_id=?
      AND acao='SEPARACAO'`, [R])).n,
  });
  const recusa = async (R, fazer, codigo, literal, rotulo) => {
    const antes = await retrato(R);
    const r = await fazer();
    assert.strictEqual(r.status, codigo, `${rotulo}: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, literal, `${rotulo}: literal`);
    assert.deepStrictEqual(await retrato(R), antes, `${rotulo}: nada muda`);
  };
  const separado = async (itemId) => Number((await dbGet(db, 'SELECT quantidade_separada FROM itens_requisicao_almoxarifado WHERE id=?', [itemId])).quantidade_separada || 0);
  const status = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id=?', [R])).status;

  // ── RN-01 — quantidade invalida ──────────────────────────────────────────────────────────────────────────────────
  await test('[99 RN-01] pela rota: -2, "abc", "Infinity", true, {}, "-1" -> 400 Q1 com a literal e nada muda', async () => {
    const x = await montagem();
    for (const [bruto, mostrado] of [[-2, '-2'], ['abc', 'abc'], ['Infinity', 'Infinity'], [true, 'true'], [{}, '{}'], ['-1', '-1']]) {
      // eslint-disable-next-line no-await-in-loop
      await recusa(x.R, () => separar(x.R, [{ item_id: x.ids[0], quantidade_separada: bruto }]), 400, q1(x.m.nome, mostrado), `rota ${mostrado}`);
    }
    assert.strictEqual(await status(x.R), 'TOTALMENTE_RESERVADA');
  });

  await test('[99 RN-01] pela rota, JSON cru com 1e400 (Infinity no parse) e pelo alias /separacao -> 400 Q1', async () => {
    const x = await montagem();
    await recusa(x.R, () => como('ALMOX').putCru(`${API}/requisicoes/${x.R}/separar`,
      `{"itens_separados":[{"item_id":${x.ids[0]},"quantidade_separada":1e400}]}`), 400, q1(x.m.nome, 'Infinity'), '1e400');
    await recusa(x.R, () => separar(x.R, [{ item_id: x.ids[0], quantidade_separada: -2 }], 'ALMOX', 'separacao'), 400,
      q1(x.m.nome, '-2'), 'alias');
  });

  await test('[99 RN-01] pelo servico: -2, "abc", Infinity, NaN, true -> 400 Q1 e nada muda', async () => {
    const x = await montagem();
    for (const [bruto, mostrado] of [[-2, '-2'], ['abc', 'abc'], [Infinity, 'Infinity'], [NaN, 'NaN'], [true, 'true']]) {
      // eslint-disable-next-line no-await-in-loop
      await recusa(x.R, () => svc(x.R, [{ item_id: x.ids[0], quantidade_separada: bruto }]), 400, q1(x.m.nome, mostrado), `svc ${mostrado}`);
    }
  });

  // ── RN-02 — o que continua aceito ────────────────────────────────────────────────────────────────────────────────
  await test('[99 RN-02] 0, "0", ausente, null, "", [] e sem itens_separados -> 200 sem rodada, EM_SEPARACAO, conferencia fica', async () => {
    const x = await montagem();
    const casos = [
      [{ item_id: x.ids[0], quantidade_separada: 0 }], [{ item_id: x.ids[0], quantidade_separada: '0' }],
      [{ item_id: x.ids[0] }], [{ item_id: x.ids[0], quantidade_separada: null }], [{ item_id: x.ids[0], quantidade_separada: '' }], [{ item_id: x.ids[0], quantidade_separada: '  ' }],
      [{ item_id: String(x.ids[0]), quantidade_separada: 0 }], [],
    ];
    for (const itens of casos) {
      // eslint-disable-next-line no-await-in-loop
      const r = await separar(x.R, itens);
      assert.strictEqual(r.status, 200, `${JSON.stringify(itens)}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.rodada_id, null, `${JSON.stringify(itens)}: rodada`);
    }
    const semCampo = await como('ALMOX').put(`${API}/requisicoes/${x.R}/separar`, {});
    assert.strictEqual(semCampo.status, 200, `sem itens_separados: ${JSON.stringify(semCampo.body)}`);
    const nulo = await como('ALMOX').put(`${API}/requisicoes/${x.R}/separar`, { itens_separados: null });
    assert.strictEqual(nulo.status, 200, `itens_separados null: ${JSON.stringify(nulo.body)}`);
    const rs = await svc(x.R, [{ item_id: x.ids[0], quantidade_separada: 0 }]);
    assert.strictEqual(rs.status, 200, `svc 0: ${JSON.stringify(rs.body)}`);
    const rsVazio = await svc(x.R, []);
    assert.strictEqual(rsVazio.status, 200);
    const fim = await retrato(x.R);
    assert.strictEqual(fim.req.status, 'EM_SEPARACAO');
    assert.strictEqual(fim.req.conferido_por_id, 77, 'sem item efetivo a conferencia fica (28 RN-02)');
    assert.strictEqual(fim.rodadas, 0);
    assert.deepStrictEqual(fim.itens, [[x.ids[0], 0]]);
  });

  await test('[99 RN-02] "2" (texto numerico) separa 2', async () => {
    const x = await montagem();
    const r = await separar(x.R, [{ item_id: x.ids[0], quantidade_separada: '2' }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await separado(x.ids[0]), 2);
  });

  // ── RN-03 — item que nao pertence ────────────────────────────────────────────────────────────────────────────────
  await test('[99 RN-03] pela rota: 999999, item de OUTRA requisicao (com 3 e com 0), item_id null e "abc", entrada null -> 400 Q2', async () => {
    const x = await montagem();
    const outra = await montagem();
    const antesOutra = await retrato(outra.R);
    for (const [entrada, id] of [
      [{ item_id: 999999, quantidade_separada: 3 }, '999999'],
      [{ item_id: outra.ids[0], quantidade_separada: 3 }, String(outra.ids[0])],
      [{ item_id: outra.ids[0], quantidade_separada: 0 }, String(outra.ids[0])],
      [{ item_id: null, quantidade_separada: 1 }, 'null'],
      [{ item_id: 'abc', quantidade_separada: 1 }, 'abc'],
      [null, 'null'],
      [{ item_id: true, quantidade_separada: 1 }, 'true'],
      [{ item_id: [x.ids[0]], quantidade_separada: 1 }, String(x.ids[0])],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await recusa(x.R, () => separar(x.R, [entrada]), 400, q2(id), `rota ${JSON.stringify(entrada)}`);
    }
    assert.deepStrictEqual(await retrato(outra.R), antesOutra, 'a outra requisicao intacta');
  });

  await test('[99 RN-03] pelo servico: 999999, item de outra requisicao, entrada null (nao TypeError) -> 400 Q2', async () => {
    const x = await montagem();
    const outra = await montagem();
    await recusa(x.R, () => svc(x.R, [{ item_id: 999999, quantidade_separada: 3 }]), 400, q2('999999'), 'svc 999999');
    await recusa(x.R, () => svc(x.R, [{ item_id: outra.ids[0], quantidade_separada: 2 }]), 400, q2(String(outra.ids[0])), 'svc outra');
    await recusa(x.R, () => svc(x.R, [null]), 400, q2('null'), 'svc null');
    await recusa(x.R, () => svc(x.R, [7]), 400, q2('undefined'), 'svc entrada numero');
  });

  // ── RN-04 — serie inteira por entrada ────────────────────────────────────────────────────────────────────────────
  await test('[99 RN-04] serie: 1,5 e "1.5" -> 400 Q3; 0,5 + 0,5 do mesmo item -> 400 Q3; nada muda', async () => {
    const x = await montagem({ serie: 1 });
    await recusa(x.R, () => separar(x.R, [{ item_id: x.ids[0], quantidade_separada: 1.5 }]), 400, q3(x.m.nome, '1.5'), '1,5');
    await recusa(x.R, () => separar(x.R, [{ item_id: x.ids[0], quantidade_separada: '1.5' }]), 400, q3(x.m.nome, '1.5'), '"1.5"');
    await recusa(x.R, () => separar(x.R, [{ item_id: x.ids[0], quantidade_separada: 0.5 }, { item_id: x.ids[0], quantidade_separada: 0.5 }]),
      400, q3(x.m.nome, '0.5'), '0,5 + 0,5');
    await recusa(x.R, () => svc(x.R, [{ item_id: x.ids[0], quantidade_separada: 1.5 }]), 400, q3(x.m.nome, '1.5'), 'svc 1,5');
  });

  await test('[99 RN-04] serie: 2 -> 200; 1,0000001 arredonda a 1 e passa', async () => {
    const x = await montagem({ serie: 1 });
    let r = await separar(x.R, [{ item_id: x.ids[0], quantidade_separada: 2 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await separado(x.ids[0]), 2);
    r = await separar(x.R, [{ item_id: x.ids[0], quantidade_separada: 1.0000001 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await separado(x.ids[0]), 3);
  });

  await test('[99 RN-04] serie: legado com 0,5 na caixa + rodada inteira 1 -> 200 (separado 1,5; a regra e por entrada)', async () => {
    const x = await montagem({ serie: 1 });
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 0.5 WHERE id = ?', [x.ids[0]]);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'EM_SEPARACAO' WHERE id = ?", [x.R]);
    const r = await separar(x.R, [{ item_id: x.ids[0], quantidade_separada: 1 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await separado(x.ids[0]), 1.5);
  });

  await test('[99 RN-04] material SEM serie com fracao 1,5 continua aceito', async () => {
    const x = await montagem();
    const r = await separar(x.R, [{ item_id: x.ids[0], quantidade_separada: 1.5 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await separado(x.ids[0]), 1.5);
  });

  // ── RN-05 — tudo ou nada ─────────────────────────────────────────────────────────────────────────────────────────
  await test('[99 RN-05] pela rota: A 2 + B -1 -> 400 Q1 e A nao separado; A 2 + 999999 -> 400 Q2 e A nao separado', async () => {
    const x = await montagem({ itens: 2 });
    await recusa(x.R, () => separar(x.R, [{ item_id: x.ids[0], quantidade_separada: 2 }, { item_id: x.ids[1], quantidade_separada: -1 }]),
      400, q1(x.ms[1].nome, '-1'), 'A 2 + B -1');
    await recusa(x.R, () => separar(x.R, [{ item_id: x.ids[0], quantidade_separada: 2 }, { item_id: 999999, quantidade_separada: 1 }]),
      400, q2('999999'), 'A 2 + 999999');
    assert.strictEqual(await separado(x.ids[0]), 0);
    assert.strictEqual(await status(x.R), 'TOTALMENTE_RESERVADA');
  });

  await test('[99 RN-05] pelo servico: A 2 + B "abc" -> 400 Q1, A nao separado; a primeira invalida responde', async () => {
    const x = await montagem({ itens: 2 });
    await recusa(x.R, () => svc(x.R, [{ item_id: x.ids[0], quantidade_separada: 2 }, { item_id: x.ids[1], quantidade_separada: 'abc' }]),
      400, q1(x.ms[1].nome, 'abc'), 'svc A 2 + B abc');
    await recusa(x.R, () => svc(x.R, [{ item_id: 999999, quantidade_separada: 1 }, { item_id: x.ids[1], quantidade_separada: -1 }]),
      400, q2('999999'), 'svc a primeira invalida');
    await recusa(x.R, () => svc(x.R, [{ item_id: x.ids[1], quantidade_separada: -1 }, { item_id: 999999, quantidade_separada: 1 }]),
      400, q1(x.ms[1].nome, '-1'), 'svc a primeira invalida (ordem inversa)');
    assert.strictEqual(await separado(x.ids[0]), 0);
  });

  // ── RN-06 — a recusa vem antes da alcada e da reivindicacao ──────────────────────────────────────────────────────
  await test('[99 RN-06] PARCIALMENTE_ATENDIDA + -1 -> 400 e continua PARCIALMENTE_ATENDIDA', async () => {
    const x = await montagem();
    assert.strictEqual((await separar(x.R, [{ item_id: x.ids[0], quantidade_separada: 4 }])).status, 200);
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET conferido_por_id = NULL WHERE id = ?', [x.R]);
    const e = await como('ALMOX').put(`${API}/requisicoes/${x.R}/entregar`, { itens_atendidos: [{ item_id: x.ids[0], quantidade_atendida: 2 }] });
    assert.strictEqual(e.status, 200, `entregar: ${JSON.stringify(e.body)}`);
    assert.strictEqual(await status(x.R), 'PARCIALMENTE_ATENDIDA');
    await recusa(x.R, () => separar(x.R, [{ item_id: x.ids[0], quantidade_separada: -1 }]), 400, q1(x.m.nome, '-1'), 'parcial -1');
    await recusa(x.R, () => svc(x.R, [{ item_id: 999999, quantidade_separada: 1 }]), 400, q2('999999'), 'parcial svc 999999');
    assert.strictEqual(await status(x.R), 'PARCIALMENTE_ATENDIDA');
  });

  await test('[99 RN-06] AGUARDANDO_ESTOQUE + "abc" -> 400 e continua AGUARDANDO_ESTOQUE', async () => {
    const m = await material();
    const a = await criar([[m, 4]]);
    await aprovar(a.R);
    assert.strictEqual(await status(a.R), 'AGUARDANDO_ESTOQUE');
    await recusa(a.R, () => separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 'abc' }]), 400, q1(m.nome, 'abc'), 'aguardando abc');
  });

  await test('[99 RN-06] alcada armada (custo 5 x 4 = R$ 20, limite R$ 1) + -2 -> 400 Q1 (nao 403), nada gravado, espiao zero; + 4 -> 403', async () => {
    const m = await material({ custo: 5 });
    await entrar(m, 4);
    const a = await criar([[m, 4]]);
    await aprovar(a.R);
    for (const [k, v] of [['liberacao_valor_ativo', '1'], ['liberacao_valor_limite', '1'], ['liberacao_valor_aprovadores', '[2]']]) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
        ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
    }
    try {
      notificados.length = 0;
      const vtAntes = (await dbGet(db, 'SELECT valor_total FROM requisicoes_almoxarifado WHERE id=?', [a.R])).valor_total;
      await recusa(a.R, () => separar(a.R, [{ item_id: a.ids[0], quantidade_separada: -2 }]), 400, q1(m.nome, '-2'), 'alcada -2');
      await recusa(a.R, () => svc(a.R, [{ item_id: 999999, quantidade_separada: 1 }]), 400, q2('999999'), 'alcada svc 999999');
      assert.strictEqual((await dbGet(db, 'SELECT valor_total FROM requisicoes_almoxarifado WHERE id=?', [a.R])).valor_total, vtAntes,
        'valor_total nao regravado');
      await new Promise((r) => setImmediate(r));
      assert.deepStrictEqual(notificados, [], 'nenhum e-mail aos aprovadores');
      assert.strictEqual(await status(a.R), 'TOTALMENTE_RESERVADA');
      // guarda: a alcada continua valendo para o payload valido
      const r = await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 4 }]);
      assert.strictEqual(r.status, 403, `valido com a alcada: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.code, 'AGUARDANDO_APROVACAO_VALOR');
      assert.strictEqual(await status(a.R), 'AGUARDANDO_APROVACAO_VALOR');
      await new Promise((rr) => setImmediate(rr));
      assert.deepStrictEqual(notificados, [a.R], 'o valido notifica');
    } finally {
      await dbRun(db, "UPDATE configuracoes_almoxarifado SET valor = '0' WHERE chave = 'liberacao_valor_ativo'");
    }
  });

  // ── RN-07 — itens_separados que nao e lista ──────────────────────────────────────────────────────────────────────
  await test('[99 RN-07] itens_separados objeto (hoje 500) e texto (hoje 200) -> 400 Q4, nada muda; pelo servico tambem', async () => {
    const x = await montagem();
    await recusa(x.R, () => como('ALMOX').put(`${API}/requisicoes/${x.R}/separar`, { itens_separados: { item_id: x.ids[0], quantidade_separada: 1 } }),
      400, LIT_Q4, 'objeto');
    await recusa(x.R, () => como('ALMOX').put(`${API}/requisicoes/${x.R}/separar`, { itens_separados: 'abc' }), 400, LIT_Q4, 'texto');
    await recusa(x.R, () => svc(x.R, { item_id: x.ids[0], quantidade_separada: 1 }), 400, LIT_Q4, 'svc objeto');
    await recusa(x.R, () => svc(x.R, 'abc'), 400, LIT_Q4, 'svc texto');
  });

  await test('[99 RN-07] (Fase 2) pela rota, "", 0 e false -> 400 Q4 (a rota fazia `|| []` e respondia 200)', async () => {
    const x = await montagem();
    for (const v of ['', 0, false]) {
      // eslint-disable-next-line no-await-in-loop
      await recusa(x.R, () => como('ALMOX').put(`${API}/requisicoes/${x.R}/separar`, { itens_separados: v }), 400, LIT_Q4, `rota ${JSON.stringify(v)}`);
    }
  });

  await test('[99 RN-01] (Fase 2) o bruto da Q1 e cortado em 40 caracteres; objeto circular pelo servico nao vira 500', async () => {
    const x = await montagem();
    const longo = 'x'.repeat(5000);
    await recusa(x.R, () => separar(x.R, [{ item_id: x.ids[0], quantidade_separada: longo }]), 400, q1(x.m.nome, `${'x'.repeat(40)}…`), 'longo');
    const circ = {}; circ.eu = circ;
    await recusa(x.R, () => svc(x.R, [{ item_id: x.ids[0], quantidade_separada: circ }]), 400, q1(x.m.nome, '[object Object]'), 'circular');
  });

  // ── RN-08 — guardas ──────────────────────────────────────────────────────────────────────────────────────────────
  await test('[99 RN-08] o mesmo item 2 + 2 separa 4; acima do teto -> o 400 da 95 e nada muda', async () => {
    const x = await montagem();
    const r = await separar(x.R, [{ item_id: x.ids[0], quantidade_separada: 2 }, { item_id: x.ids[0], quantidade_separada: 2 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await separado(x.ids[0]), 4);
    const y = await montagem();
    const antes = await retrato(y.R);
    const t = await separar(y.R, [{ item_id: y.ids[0], quantidade_separada: 5 }]);
    assert.strictEqual(t.status, 400);
    assert.ok(t.body.error.startsWith(`${y.m.nome}: não é possível separar 5 PC. Máximo: 4`), t.body.error);
    assert.deepStrictEqual(await retrato(y.R), antes);
  });

  await test('[99 RN-08] fora de PODE_SEPARAR (cancelada) + -2 -> a literal do status, nao Q1; sem usuario -> a de sempre', async () => {
    const x = await montagem();
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'CANCELADA' WHERE id = ?", [x.R]);
    const r = await separar(x.R, [{ item_id: x.ids[0], quantidade_separada: -2 }]);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, MSG_STATUS_SEPARAR);
    let erro = null;
    try { await requisitionService.separarRequisicao(db, x.R, 'abc', {}); } catch (e) { erro = e; }
    assert.ok(erro, 'sem usuario tem de recusar');
    assert.strictEqual(erro.message, 'Separação exige usuário identificado');
    assert.strictEqual(erro.status, 400);
  });

  valueApprovalService.notificarAprovadoresValor = notificarOriginal;
  terminou = true;
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
