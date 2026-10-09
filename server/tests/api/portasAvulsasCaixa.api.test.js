/**
 * Etapa 97 — as portas avulsas do motor nao levam o material que esta na caixa sem reserva de uma requisicao
 * (B466 iv, feature 03 com a 05 e a 07).
 *
 * Antes, a separacao sem reserva (95) deixava o material separado na prateleira — o motor nao sabe dele — e qualquer
 * porta avulsa (SAIDA, PERDA, AJUSTE, bloqueio, reserva manual, estorno de entrada, remessa, sucateamento, inventario)
 * o levava: fisico 0 com 4 separados, e a entrega da requisicao presa para sempre em "Maximo: 0". A regra nova:
 * as portas avulsas recusam pelo "livre de caixa" = disponivel do motor - caixa sem reserva de todas as requisicoes
 * com caixa (B491); a entrega e as reservas de requisicao ficam com a regua de hoje (B492); a literal de hoje ganha um
 * sufixo que nomeia a caixa so quando ela existe (B493); e o motor roda sob a trava por material quando a secao do
 * contexto nao segura o material (B494, com a correcao B-1 da Fase 2).
 *
 * Usuarios reais por header (molde 92-96): S sem perfil (PRODUCAO) cria pela rota; ADMIN superadmin aprova e
 * movimenta pela rota; ALMOX e ALMOX2 (ALMOXARIFE) separam e entregam. "Montagem" = S pede 4, ADMIN aprova sem
 * estoque (sem reserva), ENTRADA 4 solta, ALMOX separa 4 -> caixa sem reserva 4 sobre fisico 4.
 *
 * T0: RN-00 (o modulo caixaSql e naTravaDoMaterial). Casos `[97 RN-xx]`.
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa97-portas-avulsas-respeitam-a-caixa.md
 *
 * Executar: cd server && node tests/api/portasAvulsasCaixa.api.test.js
 */
const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const trava = require('../../services/almoxarifado/travaPorMaterial');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 97', role: 'admin', is_superadmin: 1, email: 'a97@t.com' },
  S: { id: 9701, nome: 'Solic 97', role: 'user', email: 's97@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9702, nome: 'Almox 97', role: 'user', email: 'x97@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
  ALMOX2: { id: 9703, nome: 'Almox2 97', role: 'user', email: 'y97@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const dormir = (ms) => new Promise((r) => { setTimeout(r, ms); });
// Corre `p` contra um prazo: 'resolveu' ou 'PRESO' (nunca rejeita pelo prazo — quem decide e a asserção).
const comPrazo = (p, ms) => Promise.race([Promise.resolve(p).then(() => 'resolveu'), dormir(ms).then(() => 'PRESO')]);
// Estado de uma promessa sem esperar por ela.
const estado = async (p) => {
  const marca = {};
  const r = await Promise.race([Promise.resolve(p).then(() => 'resolvida', () => 'rejeitada'), dormir(0).then(() => marca)]);
  return r === marca ? 'pendente' : r;
};

// Literal S (plano, "Literais"): o sufixo que nomeia a caixa.
const S_FIM = ' e só saem pela entrega (material perdido da caixa: entregue o que existe e encerre a requisição, ou peça '
  + 'ao administrador do almoxarifado para excluí-la)';
const S = (c, un, lista) => ` — ${c} ${un} estão separados para ${lista}${S_FIM}`;

(async () => {
  console.log('\n=== Etapa 97: as portas avulsas respeitam a caixa sem reserva ===\n');
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

  const material = async (fisico = 0) => {
    const c = `E97-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, custo_unitario) VALUES (?, ?, 'PC', ?, 0, 1, 0.1)`, [c, c, fisico])).lastID;
  };
  const req = async (itens) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-97',
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
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e97' });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const separar = (R, pares, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/separar`, {
    itens_separados: pares.map(([item_id, q]) => ({ item_id, quantidade_separada: q })),
  });
  // Montagem: caixa sem reserva `pede` sobre fisico `fisico` (a ENTRADA vem DEPOIS da aprovacao: sem reserva).
  const montagem = async ({ fisico = 4, pede = 4, m: mExistente } = {}) => {
    const m = mExistente || await material(0);
    const a = await req([[m, pede]]); await aprovar(a.R);
    await entrar(m, fisico);
    const s = await separar(a.R, [[a.ids[0], pede]]);
    assert.strictEqual(s.status, 200, `separar: ${JSON.stringify(s.body)}`);
    return { m, ...a };
  };

  // ── T0: o modulo caixaSql e a trava ───────────────────────────────────────────────────────────────────────────────
  let caixaSql = null;
  try {
    // eslint-disable-next-line global-require
    caixaSql = require('../../services/almoxarifado/caixaSql');
  } catch (e) {
    caixaSql = { erro: e.message };
  }
  const exigeModulo = () => { if (caixaSql.erro) throw new Error(`caixaSql nao carrega: ${caixaSql.erro}`); };

  await test('[97 RN-00] o modulo exporta exatamente caixaSemReservaSql, livreDeCaixaSql, lerCaixa, sufixoCaixa', async () => {
    exigeModulo();
    assert.deepStrictEqual(Object.keys(caixaSql).sort(), ['caixaSemReservaSql', 'lerCaixa', 'livreDeCaixaSql', 'sufixoCaixa']);
  });

  await test('[97 RN-00] requisitionService.caixaSemReservaSql e o MESMO do caixaSql (movido, re-exportado)', async () => {
    exigeModulo();
    assert.strictEqual(typeof requisitionService.caixaSemReservaSql, 'function');
    assert.strictEqual(requisitionService.caixaSemReservaSql, caixaSql.caixaSemReservaSql);
  });

  await test('[97 RN-00] carregar caixaSql e depois stockService (e o inverso) num processo novo: sem aviso de ciclo', async () => {
    exigeModulo();
    const server = path.join(__dirname, '..', '..');
    for (const ordem of [['caixaSql', 'stockService'], ['stockService', 'caixaSql'], ['caixaSql', 'requisitionService']]) {
      const codigo = ordem.map((x) => `require('./services/almoxarifado/${x}');`).join(' ')
        + " console.log(Object.keys(require('./services/almoxarifado/caixaSql')).length);";
      const r = spawnSync(process.execPath, ['--trace-warnings', '-e', codigo], { cwd: server, encoding: 'utf8' });
      assert.strictEqual(r.status, 0, `${ordem.join(' -> ')}: saiu ${r.status} ${r.stderr}`);
      assert.ok(!/circular|non-existent property/i.test(r.stderr), `${ordem.join(' -> ')}: aviso de ciclo: ${r.stderr}`);
      assert.strictEqual(r.stdout.trim().split('\n').pop(), '4', `${ordem.join(' -> ')}: exports parciais: ${r.stdout}`);
    }
  });

  await test('[97 RN-00] livreDeCaixaSql com alias e sem alias (UPDATE de tabela unica): 0 na montagem, 2 com fisico 6', async () => {
    exigeModulo();
    const ler = async (m) => {
      const comAlias = await dbGet(db, `SELECT ${caixaSql.livreDeCaixaSql('ma')} AS l FROM materiais_almoxarifado ma WHERE ma.id = ?`, [m]);
      const semAlias = await dbGet(db, `UPDATE materiais_almoxarifado SET updated_at = updated_at WHERE id = ?
        RETURNING ${caixaSql.livreDeCaixaSql()} AS l`, [m]);
      return [comAlias.l, semAlias.l];
    };
    const a = await montagem();
    assert.deepStrictEqual(await ler(a.m), [0, 0], 'montagem: fisico 4, caixa 4');
    const b = await montagem({ fisico: 6 });
    assert.deepStrictEqual(await ler(b.m), [2, 2], 'fisico 6, caixa 4');
    // o WHERE de um claim de tabela unica correlaciona por materiais_almoxarifado.id (controle da s4 da Fase 0)
    const passa = await dbGet(db, `UPDATE materiais_almoxarifado SET updated_at = updated_at
      WHERE id = ? AND ${caixaSql.livreDeCaixaSql()} >= ? RETURNING id`, [b.m, 2]);
    const recusa = await dbGet(db, `UPDATE materiais_almoxarifado SET updated_at = updated_at
      WHERE id = ? AND ${caixaSql.livreDeCaixaSql()} >= ? RETURNING id`, [b.m, 2.5]);
    assert.deepStrictEqual([!!passa, !!recusa], [true, false]);
    // e o disponivelSql nao mudou (B491): o disponivel da montagem continua 4
    const { disponivelSql } = require('../../services/almoxarifado/availabilitySql'); // eslint-disable-line global-require
    assert.strictEqual((await dbGet(db, `SELECT ${disponivelSql()} AS d FROM materiais_almoxarifado WHERE id = ?`, [a.m])).d, 4);
  });

  await test('[97 RN-00] lerCaixa: { caixa: 4, requisicoes: [numero] }; duas requisicoes por id; sem caixa -> 0 e []', async () => {
    exigeModulo();
    const a = await montagem();
    assert.deepStrictEqual(await caixaSql.lerCaixa(db, a.m), { caixa: 4, requisicoes: [a.numero] });
    const m = await material(0);
    const x = await montagem({ m, fisico: 2, pede: 2 });
    const y = await montagem({ m, fisico: 3, pede: 3 });
    assert.deepStrictEqual(await caixaSql.lerCaixa(db, m), { caixa: 5, requisicoes: [x.numero, y.numero] });
    const vazio = await material(7);
    assert.deepStrictEqual(await caixaSql.lerCaixa(db, vazio), { caixa: 0, requisicoes: [] });
  });

  await test('[97 RN-00] sufixoCaixa: vazio sem caixa; uma, duas, tres e quatro requisicoes ("e mais 1")', async () => {
    exigeModulo();
    const { sufixoCaixa } = caixaSql;
    assert.strictEqual(sufixoCaixa({ caixa: 0, requisicoes: [] }, 'PC'), '');
    assert.strictEqual(sufixoCaixa({ caixa: 1e-10, requisicoes: ['REQ-1'] }, 'PC'), '');
    assert.strictEqual(sufixoCaixa({ caixa: 4, requisicoes: ['REQ-1'] }, 'PC'), S(4, 'PC', 'a requisição REQ-1'));
    assert.strictEqual(sufixoCaixa({ caixa: 4, requisicoes: ['REQ-1', 'REQ-2'] }, 'PC'), S(4, 'PC', 'as requisições REQ-1 e REQ-2'));
    assert.strictEqual(sufixoCaixa({ caixa: 0.3, requisicoes: ['REQ-1', 'REQ-2', 'REQ-3'] }, 'KG'),
      S(0.3, 'KG', 'as requisições REQ-1, REQ-2 e REQ-3'));
    assert.strictEqual(sufixoCaixa({ caixa: 9, requisicoes: ['REQ-1', 'REQ-2', 'REQ-3', 'REQ-4'] }, 'PC'),
      S(9, 'PC', 'as requisições REQ-1, REQ-2, REQ-3 e mais 1'));
  });

  await test('[97 RN-00] naTravaDoMaterial fora de secao espera a trava presa e resolve ao soltar', async () => {
    assert.strictEqual(typeof trava.naTravaDoMaterial, 'function', 'naTravaDoMaterial nao existe');
    const m = 970001;
    let soltar;
    const segura = trava.comLockDoMaterial(m, () => new Promise((r) => { soltar = r; }));
    await dormir(10);
    // disparada FORA da fn da secao (o contexto do teste nao e o da secao)
    let rodou = false;
    const p = trava.naTravaDoMaterial(m, async () => { rodou = true; return 'ok'; });
    await dormir(150);
    assert.deepStrictEqual([await estado(p), rodou], ['pendente', false], 'devia esperar a trava presa');
    soltar();
    assert.strictEqual(await p, 'ok');
    await segura;
    assert.strictEqual(trava.travado(m), false, 'nenhuma trava sobrando');
  });

  await test('[97 RN-00] dentro de comLockDoMaterial(m) o naTravaDoMaterial(m) roda sem esperar (sem deadlock)', async () => {
    assert.strictEqual(typeof trava.naTravaDoMaterial, 'function', 'naTravaDoMaterial nao existe');
    const m = 970002;
    const r = await comPrazo(trava.comLockDoMaterial(m, () => trava.naTravaDoMaterial(m, async () => 'dentro')), 2000);
    assert.strictEqual(r, 'resolveu');
    // e numa secao ATIVA que nao segura o material: roda direto (hoje), sem aninhar
    const outro = 970003;
    let soltar;
    const segura = trava.comLockDoMaterial(outro, () => new Promise((x) => { soltar = x; }));
    await dormir(10);
    const r2 = await comPrazo(trava.comLockDoMaterial(m, () => trava.naTravaDoMaterial(outro, async () => 'direto')), 2000);
    soltar(); await segura;
    assert.strictEqual(r2, 'resolveu', 'secao ativa que nao segura o material roda direto (invariante da 91: nao aninha)');
    // material nulo ou invalido: fn() direto
    assert.strictEqual(await trava.naTravaDoMaterial(null, async () => 'nulo'), 'nulo');
    assert.strictEqual(await trava.naTravaDoMaterial('abc', async () => 'invalido'), 'invalido');
  });

  await test('[97 RN-00] (Fase 2, B-1 a) fluxo nascido dentro de uma secao que SEGURA m e chama o motor depois de a mae fechar: nao espera a si mesmo', async () => {
    assert.strictEqual(typeof trava.naTravaDoMaterial, 'function', 'naTravaDoMaterial nao existe');
    const m = 970004;
    let filho;
    await trava.comLockDoMaterial(m, async () => {
      // disparado dentro da secao e NAO aguardado (ex.: uma requisicao HTTP criada ali): herda o contexto
      filho = trava.comLockDoMaterial(m, async () => { await dormir(20); return trava.naTravaDoMaterial(m, async () => 'motor rodou'); });
    });
    assert.strictEqual(await comPrazo(filho, 1500), 'resolveu', 'o filho esperou a trava que ele mesmo segura');
    assert.strictEqual(trava.travado(m), false);
  });

  await test('[97 RN-00] (Fase 2, B-1 b) fluxo vazado que NAO segura m (a mae segurou e soltou m), com m preso por outro: espera', async () => {
    assert.strictEqual(typeof trava.naTravaDoMaterial, 'function', 'naTravaDoMaterial nao existe');
    const m = 970005;
    let filho; let rodou = false;
    await trava.comLockDoMaterial(m, async () => {
      filho = (async () => { await dormir(40); return trava.naTravaDoMaterial(m, async () => { rodou = true; return 'ok'; }); })();
    });
    // a mae ja soltou m; outro (fora de qualquer secao) pega m antes de o filho chamar o motor
    let soltar;
    const outro = trava.comLockDoMaterial(m, () => new Promise((x) => { soltar = x; }));
    await dormir(150);
    assert.deepStrictEqual([await estado(filho), rodou], ['pendente', false], 'o filho rodou sem a trava (o Set guardou m solto)');
    soltar(); await outro;
    assert.strictEqual(await filho, 'ok');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
