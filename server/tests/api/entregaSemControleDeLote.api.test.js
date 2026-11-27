/**
 * Etapa 276 (C558) — a entrega de material SEM controle por lote com saldo em lote (Entradas que indicaram o lote).
 *
 * O C558 dizia que esse material "ainda pode sair 'sem lote' negativo pela prateleira bloqueada". Medido na Fase 0: estava errado na causa.
 * A parte automatica da entrega de material sem controle de lote NUNCA tira de lote (B204, revogada na 197 so para material com controle de
 * lote): sai sem lote e a linha sem lote vai a -q nos quatro casos — com ou sem guarda de outra caixa, com ou sem prateleira bloqueada. A
 * prateleira bloqueada nao entra na conta (a peca dela nao e tocada). Este arquivo prova o comportamento documentado (manual 4.5) e o
 * controle: com controle de lote, o mesmo cenario continua com a E2 da 273.
 *
 * Cobre: RN-276.01 (A a D, pela rota), RN-276.02 (o detalhe), RN-276.03 (o controle com controle de lote).
 * Plano: docs/superpowers/plans/2026-11-27-almoxarifado-etapa276-material-sem-controle-de-lote-com-saldo-em-lote.md
 * Executar: cd server && node tests/api/entregaSemControleDeLote.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const valueApprovalService = require('../../services/almoxarifado/requisitionValueApprovalService');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const USERS = {
  ADMIN: { id: 1, nome: 'Adm 276', role: 'admin', is_superadmin: 1, email: 'a276@t.com' },
  S: { id: 27661, nome: 'Solic 276', role: 'user', email: 's276@t.com' },
  ALMOX: { id: 27662, nome: 'Almox 276', role: 'user', email: 'x276@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
const tela = (iso) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };
const { fraseEntregaLoteImpedido: frase } = requisitionService;
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

// Espioes (RN-206.10 b): a alcada de valor e a notificacao, pelo objeto do modulo — a entrega chama `valueApprovalService.verificarBloqueioLiberacao`.
const alcadas = [];
const verificarOriginal = valueApprovalService.verificarBloqueioLiberacao;
valueApprovalService.verificarBloqueioLiberacao = async (db, id) => { alcadas.push(Number(id)); return verificarOriginal(db, id); };
const notificados = [];
valueApprovalService.notificarAprovadoresValor = async (db, req) => { notificados.push(Number(req && req.id)); };

(async () => {
  console.log('\n=== Etapa 276: a entrega de material sem controle por lote com saldo em lote (C558) ===\n');
  assert.strictEqual(typeof frase, 'function', 'fraseEntregaLoteImpedido exportada');
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

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM276', nome: 'Almox 276' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A01 = await loc('Z276A-01'); const B01 = await loc('Z276B-01'); const P01 = await loc('Z276P-01');

  const material = async ({ lote = true, negativo = false } = {}) => {
    const c = `E276-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, 0, ?, ?)`, [c, c, lote ? 1 : 0, negativo ? 1 : 0, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = (m, destino, q, lote) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e276', localizacao_destino_id: destino, ...(lote ? { lote } : {}) }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const validade = async (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?',
    [data, await loteId(m, codigo)]);
  const statusRota = async (m, codigo, st) => ok(como('ADMIN').put(`${API}/lotes/${await loteId(m, codigo)}/status`,
    { status: st, justificativa: 'teste 276' }));
  // requisicao gravada direto (APROVADO, sem reserva) — para varios itens do mesmo material
  const reqDireta = async (itens) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E276-${++seq}`])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      // eslint-disable-next-line no-await-in-loop
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m, q])).lastID);
    }
    return { R, ids };
  };
  const separar = (R, linhas) => ok(como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: linhas }));
  const entregar = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: linhas });
  const retrato = async (m) => {
    const linhas = await dbAll(db, `SELECT l.codigo as loc, lt.codigo as lote, s.quantidade q FROM estoque_saldo_almoxarifado s
        LEFT JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id LEFT JOIN lotes_almoxarifado lt ON lt.id = s.lote_id
        WHERE s.material_id = ? ORDER BY l.codigo, lt.codigo`, [m.id]);
    const fis = await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    return { linhas: linhas.filter((x) => Math.abs(Number(x.q)) > 1e-9).map((x) => `${x.loc}/${x.lote || '-'}=${Number(x.q)}`), fisico: Number(fis.q) };
  };
  const livro = async (R, m) => (await dbAll(db, `SELECT mv.tipo, l.codigo as loc, lt.codigo as lote, mv.quantidade q
      FROM movimentacoes_almoxarifado mv LEFT JOIN localizacoes_almoxarifado l ON l.id = COALESCE(mv.localizacao_origem_id, mv.localizacao_destino_id)
      LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id
      WHERE mv.requisicao_id = ? AND mv.material_id = ? AND mv.tipo IN ('SAIDA', 'ENTRADA') ORDER BY mv.id`, [R, m.id]))
    .map((x) => [x.tipo, x.loc || null, x.lote || null, Number(x.q)]);
  const negativas = async (m) => (await dbAll(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND quantidade < -1e-9',
    [m.id])).length;
  // "nada baixado": livro, retrato, entregue, status e substituicoes
  const foto = async (R, m) => ({
    livro: await livro(R, m),
    retrato: await retrato(m),
    entregue: (await dbAll(db, 'SELECT COALESCE(quantidade_entregue, 0) q FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [R]))
      .map((x) => Number(x.q)),
    status: (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status,
    subs: (await dbGet(db, 'SELECT COUNT(*) n FROM substituicoes_origem_requisicao WHERE requisicao_id = ?', [R])).n,
  });
  const recusa = async (R, m, linhas, esperado) => {
    const antes = await foto(R, m);
    const r = await entregar(R, linhas);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, esperado);
    const depois = await foto(R, m);
    assert.deepStrictEqual(depois, antes, 'nada baixado');
    assert.deepStrictEqual(depois.livro, [], 'livro vazio');
    return r;
  };
  // E2 (contrato congelado no plano)
  const E2 = (mat, n, f, lotes, reqs, nada) => `${mat}: não é possível entregar ${n} un — faltam ${f} un em lote que pode sair. O resto `
    + `${lotes.length > 1 ? 'dos lotes' : 'do lote'} ${lotes.join(', ')} está separado ${reqs.length > 1 ? 'nas caixas de' : 'na caixa de'} `
    + `${reqs.join(', ')} ou em prateleira bloqueada ou sem endereço. Desbloqueie a prateleira ou transfira as peças para uma prateleira `
    + `livre, ou ${nada ? 'nada sai deste material' : `entregue ${f} un a menos`}.`;
  const numero = async (R) => (await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id = ?', [R])).numero;
  const bloquearLoc = (L, v) => dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = ? WHERE id = ?', [v, L.id]);
  // L1 3 em A01 e 1 em B01 (Entradas com lote); a R1 guarda as 3 de (A01, L1) (opcional); R2 de 1 separada sem origem; B01 bloqueada (opcional)
  const montar = async ({ controle = false, guarda = true, bloq = true }) => {
    const m = await material({ lote: controle });
    await entrar(m, A01.id, 3, 'L1');
    await entrar(m, B01.id, 1, 'L1');
    const l1 = await loteId(m, 'L1');
    let n1 = null;
    if (guarda) {
      const a = await reqDireta([[m.id, 3]]);
      await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 3, localizacao_origem_id: A01.id, lote_id: l1 }]);
      n1 = await numero(a.R);
    }
    const b = await reqDireta([[m.id, 1]]);
    await separar(b.R, [{ item_id: b.ids[0], quantidade_separada: 1 }]);
    if (bloq) await bloquearLoc(B01, 1);
    return { m, R2: b.R, item: b.ids[0], n1 };
  };
  const entregavel = async (R, item) => {
    const r = await ok(como('ALMOX').get(`${API}/requisicoes/${R}`));
    const it = (r.body.itens || []).find((x) => Number(x.id) === Number(item));
    assert.ok(it, 'item no detalhe');
    return Number(it.quantidade_entregavel);
  };

  // ---------------------------------------------------------------- RN-276.01 / .02 (sem controle por lote: B204)
  const casos = [
    ['A', 'guarda da R1 e B01 bloqueada (o caso do C558)', { guarda: true, bloq: true }],
    ['B', 'guarda da R1 e B01 livre', { guarda: true, bloq: false }],
    ['C', 'sem guarda e B01 bloqueada', { guarda: false, bloq: true }],
    ['D', 'sem guarda e B01 livre', { guarda: false, bloq: false }],
  ];
  for (const [k, nome, opt] of casos) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[RN-276.01/.02 ${k}] sem controle por lote, ${nome}: detalhe 1, entrega 200 sem lote, lotes intactos (B204)`, async () => {
      const { m, R2, item } = await montar(opt);
      try {
        assert.strictEqual(await entregavel(R2, item), 1, 'o detalhe oferece o que a entrega aceita');
        await ok(entregar(R2, [{ item_id: item, quantidade_atendida: 1 }]));
        assert.deepStrictEqual(await livro(R2, m), [['SAIDA', null, null, 1]], 'a parte automatica sai sem lote');
        assert.deepStrictEqual(await retrato(m), { linhas: ['Z276A-01/L1=3', 'Z276B-01/L1=1', 'Z276P-01/-=-1'], fisico: 3 },
          'o lote fica com o atribuido, a prateleira bloqueada intacta, o sem lote atribuido -1');
        const st = await dbGet(db, 'SELECT COALESCE(quantidade_entregue, 0) q FROM itens_requisicao_almoxarifado WHERE id = ?', [item]);
        assert.strictEqual(Number(st.q), 1);
      } finally { await bloquearLoc(B01, 0); }
    });
  }

  // ---------------------------------------------------------------- RN-276.03 (o controle: com controle por lote, a E2 da 273)
  await test('[RN-276.03] o caso A com controle por lote: detalhe 0, entrega 400 E2 da 273, nada baixado', async () => {
    const { m, R2, item, n1 } = await montar({ controle: true, guarda: true, bloq: true });
    try {
      assert.strictEqual(await entregavel(R2, item), 0);
      await recusa(R2, m, [{ item_id: item, quantidade_atendida: 1 }], E2(m.nome, 1, 1, ['L1'], [n1], true));
      assert.deepStrictEqual(await retrato(m), { linhas: ['Z276A-01/L1=3', 'Z276B-01/L1=1'], fisico: 4 });
    } finally { await bloquearLoc(B01, 0); }
  });

  console.log(`\n  ${passed} passou, ${failed} falhou\n`);
  terminou = true;
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
