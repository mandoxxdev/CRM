/**
 * Etapa 208 — o "Sai de" da entrega respeita a guarda do IRMAO da mesma requisicao (o C496 da 207 = o C472 da 200). Antes, a E1 (Etapa
 * 200) so descontava o que OUTRAS requisicoes separaram no par: a peca 1 escolhendo a mao o endereco que a peca 2 separou levava a parte
 * dela, e quem tomava a recusa era a peca 2 ("nao serve mais"). Agora a guarda que FICA dos irmaos entra na conta da E1 (B1407), o mesmo
 * par acima da propria parte entra pelo excesso (B1408, fecha tambem o C470) e a literal e a E1 estendida (B1409).
 *
 * Montagem (molde entregaGuardaSemLote): material sem lote (ou com, na RN-208.07), padrao P vazia, saldo por Entrada v2 com endereco,
 * requisicao APROVADO por SQL, separacao pela rota /separacao. "Nada gravado" = status, itens, linhas de saldo, livro e trocas iguais.
 * Plano: docs/superpowers/plans/2026-11-06-almoxarifado-etapa208-sai-de-respeita-guarda-do-irmao.md
 *
 * Executar: cd server && node tests/api/entregaSaiDeGuardaDoIrmao.api.test.js
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
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 208', role: 'admin', is_superadmin: 1, email: 'a208@t.com' },
  ALMOX: { id: 20822, nome: 'Almox 208', role: 'user', email: 'x208@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const CONSELHO = 'Escolha outro endereço ou deixe "Qualquer endereço (automático)"';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 208: o "Sai de" da entrega respeita a guarda do irmao ===\n');

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
  await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES ('aprovacao_automatica','0')
    ON CONFLICT(chave) DO UPDATE SET valor='0'`);

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM208', nome: 'Almox 208' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('GI-A'); const B = await loc('GI-B'); const P = await loc('GI-P');

  const material = async ({ lote = false } = {}) => {
    const c = `E208-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, 0, 0, ?)`, [c, c, lote ? 1 : 0, P.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, destino, q, lote) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id,
    tipo: 'ENTRADA', quantidade: q, motivo: 'e208', localizacao_destino_id: destino, ...(lote ? { lote } : {}) }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const reqDireta = async (itens) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E208-${++seq}`])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      // eslint-disable-next-line no-await-in-loop
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m, q])).lastID);
    }
    return { R, ids };
  };
  const numero = async (R) => (await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id = ?', [R])).numero;
  const separar = (R, linhas) => ok(como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: linhas }));
  const entregar = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: linhas });
  const entOk = async (R, linhas) => ok(entregar(R, linhas));
  const deA = (id, q, extra = {}) => ({ item_id: id, quantidade_separada: q, localizacao_origem_id: A.id, ...extra });
  const semOrigem = (id, q) => ({ item_id: id, quantidade_separada: q });
  const saiDe = (id, q, onde = A, extra = {}) => ({ item_id: id, quantidade_atendida: q, localizacao_origem_id: onde.id, ...extra });
  const clique = (id, q) => ({ item_id: id, quantidade_atendida: q });
  const retrato = async (m) => {
    const linhas = await dbAll(db, `SELECT l.codigo as loc, lt.codigo as lote, s.quantidade q FROM estoque_saldo_almoxarifado s
        LEFT JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id LEFT JOIN lotes_almoxarifado lt ON lt.id = s.lote_id
        WHERE s.material_id = ? ORDER BY l.codigo, lt.codigo`, [m.id]);
    const fis = await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    return {
      linhas: linhas.filter((x) => Math.abs(Number(x.q)) > 1e-9).map((x) => `${x.loc || '-'}/${x.lote || '-'}=${Number(x.q)}`),
      fisico: Number(fis.q),
    };
  };
  const foto = async (m, R) => ({
    st: (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status,
    itens: await dbAll(db, `SELECT id, quantidade_separada, quantidade_entregue, quantidade_atendida, origem_separacao_id, lote_separacao_id,
      quantidade_origem_separacao FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id`, [R]),
    saldo: await retrato(m),
    mov: Number((await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ?', [m.id])).n),
    trocas: Number((await dbGet(db, 'SELECT COUNT(*) n FROM substituicoes_origem_requisicao WHERE requisicao_id = ?', [R])).n),
  });
  const recusaSemGravar = async (m, R, linhas, esperado) => {
    const antes = await foto(m, R);
    const r = await entregar(R, linhas);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, esperado);
    assert.deepStrictEqual(await foto(m, R), antes, 'nada gravado');
  };
  const trocasDe = (R) => dbAll(db, 'SELECT item_id, quantidade FROM substituicoes_origem_requisicao WHERE requisicao_id = ? ORDER BY id', [R]);

  // A E1 estendida (contrato congelado): `irmaos` = { q, n } da guarda dos irmaos; `outras` = { q, numeros } das outras requisicoes.
  const e1 = (m, { cod = 'GI-A', saldo, contando = 0, outras = null, irmaos = null, sobra, qty }) => {
    const partes = [];
    if (outras) {
      partes.push(`${outras.q} ${outras.numeros.length > 1 ? 'já estão separados dali para outras requisições' : 'já está separado dali para outra requisição'} `
        + `(${outras.numeros.join(', ')})`);
    }
    if (irmaos) {
      partes.push(outras
        ? `${irmaos.q} para ${irmaos.n > 1 ? 'outras peças' : 'outra peça'} desta requisição`
        : `${irmaos.q} ${irmaos.n > 1 ? 'já estão separados dali para outras peças desta requisição' : 'já está separado dali para outra peça desta requisição'}`);
    }
    return `${m.nome}: em ${cod} há ${saldo}${contando ? ` (já contando ${contando} desta entrega)` : ''} para esta entrega, mas `
      + `${partes.join(' e ')}; sobra ${sobra}, que não cobre a quantidade (${qty}). ${CONSELHO}`;
  };
  const fisica = (m, saldo, qty, cod = 'GI-A') => `${m.nome}: O saldo em ${cod} (${saldo}) não cobre a quantidade (${qty}) — a saída tiraria de outros endereços`;
  const naoServeMais = (m, saldo, qty) => `${m.nome}: a origem da separação (GI-A) não serve mais (O saldo em GI-A (${saldo}) não cobre a `
    + `quantidade (${qty}) — a saída tiraria de outros endereços) — entregue escolhendo de onde sai`;

  // ── RN-208.01: o mesmo par acima da parte (a 1a forma do C496) ──────────────────────────────────────────────────────────────────
  // A 3, B 5; item 1 (2): 1 de A + 1 sem origem (parte 1); item 2 (2): 2 de A.
  const cenario01 = async () => {
    const m = await material();
    await entrar(m, A.id, 3); await entrar(m, B.id, 5);
    const { R, ids } = await reqDireta([[m.id, 2], [m.id, 2]]);
    await separar(R, [deA(ids[0], 1)]);
    await separar(R, [semOrigem(ids[0], 1)]);
    await separar(R, [deA(ids[1], 2)]);
    const it1 = await dbGet(db, 'SELECT quantidade_separada s, quantidade_origem_separacao p FROM itens_requisicao_almoxarifado WHERE id = ?', [ids[0]]);
    assert.deepStrictEqual([Number(it1.s), Number(it1.p)], [2, 1], 'premissa: caixa 2, parte 1');
    return { m, R, ids };
  };
  await test('[RN-208.01] item 1 (parte 1 em A) entrega 2 com Sai de A -> 400 E1 "para outra peca desta requisicao", nada gravado', async () => {
    const { m, R, ids } = await cenario01();
    await recusaSemGravar(m, R, [saiDe(ids[0], 2)], e1(m, { saldo: 3, irmaos: { q: 2, n: 1 }, sobra: 1, qty: 2 }));
  });
  await test('[RN-208.01 depois] item 1 1 com Sai de A -> 200 (sem excesso); item 2 num clique -> 200, A 0', async () => {
    const { m, R, ids } = await cenario01();
    await entOk(R, [saiDe(ids[0], 1)]);
    await entOk(R, [clique(ids[1], 2)]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['GI-B/-=5'], fisico: 5 });
  });

  // ── RN-208.02: item sem origem escolhendo o par do irmao (a 2a forma) ───────────────────────────────────────────────────────────
  const cenario02 = async (qa = 3) => {
    const m = await material();
    await entrar(m, A.id, qa); await entrar(m, B.id, 5);
    const { R, ids } = await reqDireta([[m.id, 2], [m.id, 2]]);
    await separar(R, [semOrigem(ids[0], 2)]);
    await separar(R, [deA(ids[1], 2)]);
    return { m, R, ids };
  };
  await test('[RN-208.02] item 1 sem origem entrega 2 com Sai de A (o irmao guardou 2) -> 400 E1, nada gravado', async () => {
    const { m, R, ids } = await cenario02();
    await recusaSemGravar(m, R, [saiDe(ids[0], 2)], e1(m, { saldo: 3, irmaos: { q: 2, n: 1 }, sobra: 1, qty: 2 }));
  });
  await test('[RN-208.02 depois] item 1 1 com Sai de A -> 200; item 2 num clique -> 200, A 0', async () => {
    const { m, R, ids } = await cenario02();
    await entOk(R, [saiDe(ids[0], 1)]);
    await entOk(R, [clique(ids[1], 2)]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['GI-B/-=5'], fisico: 5 });
  });
  await test('[RN-208.02 fronteira] A 4 -> 200 (sobra 2 cobre 2); A 3,999999 -> 400 (sobra 1,999999)', async () => {
    const c4 = await cenario02(4);
    await entOk(c4.R, [saiDe(c4.ids[0], 2)]);
    await entOk(c4.R, [clique(c4.ids[1], 2)]);
    assert.deepStrictEqual(await retrato(c4.m), { linhas: ['GI-B/-=5'], fisico: 5 });
    const c3 = await cenario02(3.999999);
    await recusaSemGravar(c3.m, c3.R, [saiDe(c3.ids[0], 2)], e1(c3.m, { saldo: 3.999999, irmaos: { q: 2, n: 1 }, sobra: 1.999999, qty: 2 }));
  });

  await test('[T1 unidade] guardaDosIrmaosNoPar: do item 1 ve 2 (n 1); do item 2 (o proprio) 0; com o fica do item 2 = 0, 0; outro par 0', async () => {
    const { m, R, ids } = await cenario02();
    const g = (itemId, fica, onde = A) => requisitionService.guardaDosIrmaosNoPar(db, R, itemId, m.id, onde.id, null, fica);
    assert.deepStrictEqual(await g(ids[0], new Map()), { q: 2, n: 1 });
    assert.deepStrictEqual(await g(ids[1], new Map()), { q: 0, n: 0 });
    assert.deepStrictEqual(await g(ids[0], new Map([[ids[1], 0]])), { q: 0, n: 0 });
    assert.deepStrictEqual(await g(ids[0], new Map([[ids[1], 0.5]])), { q: 0.5, n: 1 });
    assert.deepStrictEqual(await g(ids[0], new Map(), B), { q: 0, n: 0 });
    // sem irmaos, a frase e a de antes (a C1 e a E1 de outras requisicoes, byte a byte)
    const base = { gesto: 'entrega', cod: 'X', saldo: 4, jaPedido: 0, outrasQ: 2, numeros: ['R-1'], qty: 3 };
    assert.strictEqual(requisitionService.mensagemSeparadoDeOutras({ ...base, irmaosQ: 0, irmaosN: 0 }),
      requisitionService.mensagemSeparadoDeOutras(base));
    assert.strictEqual(requisitionService.mensagemSeparadoDeOutras({ ...base, gesto: 'separacao' }), 'em X há 4 para esta separação, mas 2 já está '
      + 'separado dali para outra requisição (R-1); sobra 2, que não cobre a quantidade (3). Escolha outro endereço ou reabra a janela para ver a sugestão atual');
  });

  // ── RN-208.03: o irmao que sai nesta entrega nao guarda mais ────────────────────────────────────────────────────────────────────
  await test('[RN-208.03 (a)] A 4: item 1 (sem origem) Sai de A 2 + item 2 (2 de A) num clique na mesma entrega -> 200, A 0', async () => {
    const { m, R, ids } = await cenario02(4);
    await entOk(R, [saiDe(ids[0], 2), clique(ids[1], 2)]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['GI-B/-=5'], fisico: 5 });
  });
  await test('[RN-208.03 (a\')] a variante da tela: o item 2 com Sai de = a origem dele (A) explicita -> 200, A 0, sem troca', async () => {
    const { m, R, ids } = await cenario02(4);
    await entOk(R, [saiDe(ids[0], 2), saiDe(ids[1], 2)]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['GI-B/-=5'], fisico: 5 });
    assert.deepStrictEqual(await trocasDe(R), []);
  });
  await test('[RN-208.03 (b)] A 3, B 5: item 1 Sai de A 2 + item 2 (2 de A) Sai de B 2 -> 200, A 1, B 3, troca de 2 no item 2', async () => {
    const { m, R, ids } = await cenario02(3);
    await entOk(R, [saiDe(ids[0], 2), saiDe(ids[1], 2, B)]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['GI-A/-=1', 'GI-B/-=3'], fisico: 4 });
    assert.deepStrictEqual((await trocasDe(R)).map((t) => [t.item_id, Number(t.quantidade)]), [[ids[1], 2]]);
  });

  // ── RN-208.04: sem excesso, nada muda (a B1338 entre irmaos) ────────────────────────────────────────────────────────────────────
  await test('[RN-208.04 (a)] item 1 (parte 1 em A) entrega 1 com Sai de A -> 200 (nao confere); A 2 e o item 2 ainda cabe', async () => {
    const { m, R, ids } = await cenario01();
    await entOk(R, [saiDe(ids[0], 1)]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['GI-A/-=2', 'GI-B/-=5'], fisico: 7 });
    await entOk(R, [clique(ids[1], 2)]);
  });
  await test('[RN-208.04 (b)] dado antigo entre irmaos (A 6, partes 4 + 4, por SQL): item 1 Sai de A 4 -> 200; item 2 depois -> 400 "nao serve mais"', async () => {
    const m = await material();
    await entrar(m, A.id, 6); await entrar(m, B.id, 5);
    const { R, ids } = await reqDireta([[m.id, 4], [m.id, 4]]);
    await separar(R, [semOrigem(ids[0], 4), semOrigem(ids[1], 4)]);
    await dbRun(db, `UPDATE itens_requisicao_almoxarifado SET origem_separacao_id = ?, lote_separacao_id = NULL, quantidade_origem_separacao = 4
      WHERE id IN (?, ?)`, [A.id, ids[0], ids[1]]);
    await entOk(R, [saiDe(ids[0], 4)]);
    assert.deepStrictEqual(await trocasDe(R), [], 'mesmo par: sem troca');
    await recusaSemGravar(m, R, [clique(ids[1], 4)], naoServeMais(m, 2, 4));
  });

  // ── RN-208.05: o excesso desconta as outras requisicoes tambem (o C470) ─────────────────────────────────────────────────────────
  const cenario05 = async () => {
    const m = await material();
    await entrar(m, A.id, 4); await entrar(m, B.id, 5);
    const r1 = await reqDireta([[m.id, 2]]);
    await separar(r1.R, [deA(r1.ids[0], 2)]);
    const r2 = await reqDireta([[m.id, 3]]);
    await separar(r2.R, [deA(r2.ids[0], 2)]);
    await separar(r2.R, [semOrigem(r2.ids[0], 1)]);
    return { m, r1, r2 };
  };
  await test('[RN-208.05] R1 guardou 2 em A (4); R2 (parte 2 em A + 1 sem origem) entrega 3 com Sai de A -> 400 E1 de hoje, byte a byte', async () => {
    const { m, r1, r2 } = await cenario05();
    await recusaSemGravar(m, r2.R, [saiDe(r2.ids[0], 3)],
      e1(m, { saldo: 4, outras: { q: 2, numeros: [await numero(r1.R)] }, sobra: 2, qty: 3 }));
  });
  await test('[RN-208.05 depois] R2 entrega 2 com Sai de A -> 200; R1 num clique -> 200, A 0', async () => {
    const { m, r1, r2 } = await cenario05();
    await entOk(r2.R, [saiDe(r2.ids[0], 2)]);
    await entOk(r1.R, [clique(r1.ids[0], 2)]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['GI-B/-=5'], fisico: 5 });
  });

  // ── RN-208.06: misto e plural ───────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-208.06 (b)] dois irmaos guardaram 1 + 1 em A (3): item 1 sem origem Sai de A 2 -> E1 no plural "outras pecas"', async () => {
    const m = await material();
    await entrar(m, A.id, 3); await entrar(m, B.id, 5);
    const { R, ids } = await reqDireta([[m.id, 2], [m.id, 1], [m.id, 1]]);
    await separar(R, [semOrigem(ids[0], 2), deA(ids[1], 1), deA(ids[2], 1)]);
    await recusaSemGravar(m, R, [saiDe(ids[0], 2)], e1(m, { saldo: 3, irmaos: { q: 2, n: 2 }, sobra: 1, qty: 2 }));
  });
  await test('[RN-208.06 (c)] contando: itens 1 e 2 (sem origem) Sai de A 1 + 1, item 3 guardou 2 em A (3) -> E1 "(ja contando 1 desta entrega)"', async () => {
    const m = await material();
    await entrar(m, A.id, 3); await entrar(m, B.id, 5);
    const { R, ids } = await reqDireta([[m.id, 1], [m.id, 1], [m.id, 2]]);
    await separar(R, [semOrigem(ids[0], 1), semOrigem(ids[1], 1), deA(ids[2], 2)]);
    await recusaSemGravar(m, R, [saiDe(ids[0], 1), saiDe(ids[1], 1)],
      e1(m, { saldo: 2, contando: 1, irmaos: { q: 2, n: 1 }, sobra: 0, qty: 1 }));
  });
  // Fase 5 (achado 2): o plural do texto MISTO ("e N para outras pecas desta requisicao") — o (b) acima so prova o plural sem outras.
  await test('[RN-208.06 (d)] misto e plural: R1 guardou 1 em A (4), dois irmaos 1 + 1 -> E1 "... (R1) e 2 para outras pecas desta requisicao"', async () => {
    const m = await material();
    await entrar(m, A.id, 4); await entrar(m, B.id, 5);
    const r1 = await reqDireta([[m.id, 1]]);
    await separar(r1.R, [deA(r1.ids[0], 1)]);
    const { R, ids } = await reqDireta([[m.id, 2], [m.id, 1], [m.id, 1]]);
    await separar(R, [semOrigem(ids[0], 2), deA(ids[1], 1), deA(ids[2], 1)]);
    const esperado = e1(m, { saldo: 4, outras: { q: 1, numeros: [await numero(r1.R)] }, irmaos: { q: 2, n: 2 }, sobra: 1, qty: 2 });
    assert.ok(esperado.includes('e 2 para outras peças desta requisição; sobra 1'), `premissa: a literal mista no plural (${esperado})`);
    await recusaSemGravar(m, R, [saiDe(ids[0], 2)], esperado);
  });

  // Fase 5 (achado 1): a guarda do irmao e do MESMO material — um item de outro material com guarda no mesmo endereco nao conta.
  await test('[RN-208.06 (e)] outro material: M2 guardou 2 em A, o item M1 (sem origem) entrega 2 com Sai de A -> 200', async () => {
    const m1 = await material(); const m2 = await material();
    await entrar(m1, A.id, 2); await entrar(m2, A.id, 2);
    const { R, ids } = await reqDireta([[m1.id, 2], [m2.id, 2]]);
    await separar(R, [semOrigem(ids[0], 2), deA(ids[1], 2)]);
    await entOk(R, [saiDe(ids[0], 2)]);
    const g = await requisitionService.guardaDosIrmaosNoPar(db, R, ids[0], m1.id, A.id, null, new Map());
    assert.deepStrictEqual(g, { q: 0, n: 0 }, 'a guarda do item M2 nao e do par de M1');
    assert.deepStrictEqual(await retrato(m1), { linhas: [], fisico: 0 });
    assert.deepStrictEqual(await retrato(m2), { linhas: ['GI-A/-=2'], fisico: 2 });
  });

  // ── RN-208.07: com lote, o par e exato (B1410) ──────────────────────────────────────────────────────────────────────────────────
  const cenario07 = async (loteGuarda) => {
    const m = await material({ lote: true });
    await entrar(m, A.id, 4, 'L1'); await entrar(m, A.id, 3, 'L2'); await entrar(m, B.id, 5, 'L1');
    const L1 = await loteId(m, 'L1'); const L2 = await loteId(m, 'L2');
    const { R, ids } = await reqDireta([[m.id, 3], [m.id, 2]]);
    await separar(R, [semOrigem(ids[0], 3)]);
    await separar(R, [deA(ids[1], 2, { lote_id: loteGuarda === 'L1' ? L1 : L2 })]);
    return { m, R, ids, L1, L2 };
  };
  await test('[RN-208.07] item 2 guardou 2 de (A, L1): item 1 Sai de (A, L1) 3 -> 400 (ha 4, 2, sobra 2); Sai de (A, L2) 3 -> 200', async () => {
    const { m, R, ids, L1, L2 } = await cenario07('L1');
    await recusaSemGravar(m, R, [saiDe(ids[0], 3, A, { lote_id: L1 })],
      e1(m, { cod: 'GI-A, lote L1', saldo: 4, irmaos: { q: 2, n: 1 }, sobra: 2, qty: 3 }));
    await entOk(R, [saiDe(ids[0], 3, A, { lote_id: L2 })]);
  });
  await test('[RN-208.07 outro par] item 2 guardou (A, L2) e item 1 escolhe (A, L1) 3 -> nao conta: 200', async () => {
    const { m, R, ids, L1 } = await cenario07('L2');
    await entOk(R, [saiDe(ids[0], 3, A, { lote_id: L1 })]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['GI-A/L1=1', 'GI-A/L2=3', 'GI-B/L1=5'], fisico: 9 });
  });

  // ── RN-208.08: precedencia ──────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-208.08] o fisico sozinho nao cobre (item 1 Sai de A 4 com A 3, o irmao guardou 2) -> a literal fisica de hoje', async () => {
    const m = await material();
    await entrar(m, A.id, 3); await entrar(m, B.id, 5);
    const { R, ids } = await reqDireta([[m.id, 4], [m.id, 2]]);
    await separar(R, [semOrigem(ids[0], 4)]);
    await separar(R, [deA(ids[1], 2)]);
    await recusaSemGravar(m, R, [saiDe(ids[0], 4)], fisica(m, 3, 4));
  });

  // ── RN-208.12 (Fase 2, item 2): as duas pecas juntas, o jeito normal da tela — a recusa cai em quem escolheu a mao ───────────────
  // `sem` = o item sem origem que escolhe A a mao; `com` = o item que guardou 2 em A, com A explicito (a pre-selecao da tela, caso b).
  const cenario12 = async (qa, qSem, semPrimeiro) => {
    const m = await material();
    await entrar(m, A.id, qa); await entrar(m, B.id, 5);
    const { R, ids } = await reqDireta(semPrimeiro ? [[m.id, qSem], [m.id, 2]] : [[m.id, 2], [m.id, qSem]]);
    const [sem, com] = semPrimeiro ? ids : [ids[1], ids[0]];
    assert.ok(semPrimeiro ? sem < com : sem > com, 'premissa: a ordem dos ids');
    await separar(R, [semOrigem(sem, qSem)]);
    await separar(R, [deA(com, 2)]);
    return { m, R, sem, com };
  };
  for (const semPrimeiro of [true, false]) {
    const ordem = semPrimeiro ? 'item a mao antes' : 'item a mao depois';
    // eslint-disable-next-line no-await-in-loop
    await test(`[RN-208.12 (a), ${ordem}] A 4: item sem origem Sai de A 2 + o irmao com A explicito 2 -> 200, A 0`, async () => {
      const { m, R, sem, com } = await cenario12(4, 2, semPrimeiro);
      await entOk(R, [saiDe(sem, 2), saiDe(com, 2)]);
      assert.deepStrictEqual(await retrato(m), { linhas: ['GI-B/-=5'], fisico: 5 });
    });
    // eslint-disable-next-line no-await-in-loop
    await test(`[RN-208.12 (b), ${ordem}] A 3: item sem origem Sai de A 3 + o irmao com A 2 -> 400 no item a mao (O saldo (1) ... (3)), nada gravado`, async () => {
      const { m, R, sem, com } = await cenario12(3, 3, semPrimeiro);
      await recusaSemGravar(m, R, [saiDe(sem, 3), saiDe(com, 2)], fisica(m, 1, 3));
    });
  }

  void requisitionService;
  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
