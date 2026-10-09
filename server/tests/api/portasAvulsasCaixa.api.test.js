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
const stockService = require('../../services/almoxarifado/stockService');

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

  // ── T1: o motor ───────────────────────────────────────────────────────────────────────────────────────────────────
  const ADM = { ...USERS.ADMIN };
  const svc = (params, opcoes) => stockService.registrarMovimentacao(db, ADM, { motivo: 'e97', justificativa: 'sonda e97', ...params }, opcoes)
    .then((r) => ({ status: 201, r }), (e) => ({ status: e.status || 500, error: e.message }));
  const reservaManual = (m, q) => stockService.criarReserva(db, ADM, { material_id: m, quantidade: q, os_referencia: 'OS-97', observacoes: 'e97' })
    .then((r) => ({ status: 201, r }), (e) => ({ status: e.status || 500, error: e.message }));
  const estornar = (movId, opcoes) => stockService.cancelarMovimentacao(db, ADM, movId, 'sonda e97', opcoes)
    .then((r) => ({ status: 200, r }), (e) => ({ status: e.status || 500, error: e.message }));
  const entregar = (R, pares, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/entregar`, {
    itens_atendidos: pares.map(([item_id, q]) => ({ item_id, quantidade_atendida: q })),
  });
  const statusReq = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id=?', [R])).status;
  // estado do material (fisico, retencoes) + contagem do livro: a recusa nao pode mexer em nada
  const foto = async (m) => JSON.stringify({
    ...(await dbGet(db, `SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r, COALESCE(quantidade_bloqueada,0) b,
      COALESCE(quantidade_em_terceiros,0) t FROM materiais_almoxarifado WHERE id=?`, [m])),
    livro: (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id=?', [m])).n,
    reservas: (await dbGet(db, "SELECT COUNT(*) n FROM reservas_material_almoxarifado WHERE material_id=? AND status='ATIVA'", [m])).n,
  });
  const recusou = (x, literal, rotulo = '') => {
    assert.strictEqual(x.status, 400, `${rotulo} esperava 400, veio ${x.status} ${x.error || ''}`);
    assert.strictEqual(x.error, literal, rotulo);
  };
  const entregaTudo = async (a, q = 4) => {
    const e = await entregar(a.R, [[a.ids[0], q]]);
    assert.strictEqual(e.status, 200, `A entrega ${q}: ${JSON.stringify(e.body)}`);
    assert.strictEqual(await statusReq(a.R), 'ENTREGUE');
  };
  const reservaAtiva = async (R) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade - COALESCE(quantidade_utilizada,0)),0) q
    FROM reservas_material_almoxarifado WHERE requisicao_id=? AND status='ATIVA'`, [R])).q);
  const SA = (a, c = 4) => S(c, 'PC', `a requisição ${a.numero}`);
  const M1 = (n) => `Saldo insuficiente. Disponível: ${n} PC`;
  const M6 = (total, partes, minimo) => `Ajuste para ${total} PC deixaria o disponível negativo (${partes}, mínimo aceitável: `
    + `${minimo} PC). Resolva a retenção antes de ajustar para menos, ou ajuste para um valor maior ou igual ao mínimo.`;
  const ultimaMov = async (m, tipo) => (await dbGet(db, 'SELECT id FROM movimentacoes_almoxarifado WHERE material_id=? AND tipo=? ORDER BY id DESC LIMIT 1', [m, tipo])).id;

  await test('[97 RN-01] saida comum pelo servico, em laco de tipos (SAIDA, SAIDA_PRODUCAO emergencial, SAIDA_MONTAGEM, SAIDA_ASSISTENCIA, AJUSTE_NEGATIVO, PERDA, SUCATA): cada um 400 M1+S, nada muda, e A entrega 4', async () => {
    const a = await montagem();
    const antes = await foto(a.m);
    for (const tipo of ['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'AJUSTE_NEGATIVO', 'PERDA', 'SUCATA']) {
      // eslint-disable-next-line no-await-in-loop
      recusou(await svc({ material_id: a.m, tipo, quantidade: 4, emergencial: true, os_referencia: 'OS-97' }), M1(0) + SA(a), tipo);
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual(await foto(a.m), antes, `${tipo}: a recusa mexeu no material`);
    }
    await entregaTudo(a);
  });

  await test('[97 RN-01] AJUSTE para 3 e para 1 SEM localizacao: 400 M6 com a caixa na guarda de retencao; A entrega 4', async () => {
    const a = await montagem();
    const antes = await foto(a.m);
    // AJUSTE para 0 SEM localizacao ja e recusado antes, pela regra "obrigatorios" (Etapa 96, Fase 2 M2) — por isso 1 e 3.
    recusou(await svc({ material_id: a.m, tipo: 'AJUSTE', quantidade: 3 }), M6(3, 'separada na caixa de requisição: 4', 4), 'AJUSTE 3');
    recusou(await svc({ material_id: a.m, tipo: 'AJUSTE', quantidade: 1 }), M6(1, 'separada na caixa de requisição: 4', 4), 'AJUSTE 1');
    assert.strictEqual(await foto(a.m), antes);
    await entregaTudo(a);
  });

  await test('[97 RN-01] reserva manual 4 (M3), REMESSA_TERCEIRO 4 (M2), bloqueio avulso 1 (M4): 400 com S, nada muda; A entrega 4', async () => {
    const a = await montagem();
    const antes = await foto(a.m);
    recusou(await reservaManual(a.m, 4), `Saldo disponível insuficiente: 0${SA(a)}`, 'reserva manual');
    recusou(await svc({ material_id: a.m, tipo: 'REMESSA_TERCEIRO', quantidade: 4 }),
      `Saldo disponível insuficiente para enviar ao terceiro: 0 PC${SA(a)}`, 'remessa');
    recusou(await svc({ material_id: a.m, tipo: 'BLOQUEIO', quantidade: 1 }, { bloqueioAvulso: true }),
      `Saldo disponível insuficiente para bloquear: 0 PC${SA(a)}`, 'bloqueio avulso');
    assert.strictEqual(await foto(a.m), antes);
    await entregaTudo(a);
  });

  await test('[97 RN-01] estorno da ENTRADA dos 4 (M5): 400 com S, nada muda; A entrega 4', async () => {
    const a = await montagem();
    const ent = await ultimaMov(a.m, 'ENTRADA');
    const antes = await foto(a.m);
    recusou(await estornar(ent), `Não é possível estornar: saldo disponível insuficiente (material já consumido)${SA(a)}`);
    assert.strictEqual(await foto(a.m), antes);
    assert.strictEqual((await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id=?', [ent])).cancelado, 0);
    await entregaTudo(a);
  });

  // montagem em que o fisico chega por outro gesto (AJUSTE, com ou sem endereco) em vez da ENTRADA
  const montagemPor = async (chegar) => {
    const m = await material(0);
    const a = await req([[m, 4]]); await aprovar(a.R);
    const movId = await chegar(m);
    const s = await separar(a.R, [[a.ids[0], 4]]);
    assert.strictEqual(s.status, 200, `separar: ${JSON.stringify(s.body)}`);
    return { m, ...a, movId };
  };
  const locSeq = async () => (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?, 'e97', 1)", [`E97L-${++seq}`])).lastID;

  await test('[97 RN-01] (Fase 2, B-2) estorno do AJUSTE 0->4 SEM localizacao: 400 M8; A entrega 4', async () => {
    const a = await montagemPor(async (m) => { const x = await svc({ material_id: m, tipo: 'AJUSTE', quantidade: 4 }); assert.strictEqual(x.status, 201, x.error); return x.r.id; });
    const antes = await foto(a.m);
    recusou(await estornar(a.movId), `Não é possível estornar: ${M6(0, 'separada na caixa de requisição: 4', 4)}`);
    assert.strictEqual(await foto(a.m), antes);
    await entregaTudo(a);
  });

  await test('[97 RN-01] (Fase 2, B-2) estorno do AJUSTE 0->4 COM localizacao: 400 M8; A entrega 4', async () => {
    const a = await montagemPor(async (m) => {
      const x = await svc({ material_id: m, tipo: 'AJUSTE', quantidade: 4, localizacao_destino_id: await locSeq() });
      assert.strictEqual(x.status, 201, x.error); return x.r.id;
    });
    const antes = await foto(a.m);
    const linhas = async () => JSON.stringify(await dbAll(db, 'SELECT id, quantidade FROM estoque_saldo_almoxarifado WHERE material_id=? ORDER BY id', [a.m]));
    const l0 = await linhas();
    recusou(await estornar(a.movId), `Não é possível estornar: ${M6(0, 'separada na caixa de requisição: 4', 4)}`);
    assert.deepStrictEqual([await foto(a.m), await linhas()], [antes, l0]);
    await entregaTudo(a);
  });

  await test('[97 RN-01] (Fase 2, B-2) estorno do DESBLOQUEIO avulso (entra 4, bloqueia 4, desbloqueia 4, separa 4): 400 M9; A entrega 4', async () => {
    const a = await montagemPor(async (m) => {
      await entrar(m, 4);
      assert.strictEqual((await svc({ material_id: m, tipo: 'BLOQUEIO', quantidade: 4 }, { bloqueioAvulso: true })).status, 201);
      assert.strictEqual((await svc({ material_id: m, tipo: 'DESBLOQUEIO', quantidade: 4 })).status, 201);
      return ultimaMov(m, 'DESBLOQUEIO');
    });
    const antes = await foto(a.m);
    recusou(await estornar(a.movId), `Não é possível estornar o desbloqueio: saldo disponível insuficiente para bloquear de novo: 0 PC${SA(a)}`);
    assert.strictEqual(await foto(a.m), antes);
    await entregaTudo(a);
  });

  await test('[97 RN-01] (Fase 2, B-2/r1b) sem caixa: AJUSTE 0->4, reserva manual 4, estorno do AJUSTE -> 400 M8 (antes 200 com reservado 4 sobre fisico 0)', async () => {
    const m = await material(0);
    const aj = await svc({ material_id: m, tipo: 'AJUSTE', quantidade: 4 });
    assert.strictEqual(aj.status, 201, aj.error);
    assert.strictEqual((await reservaManual(m, 4)).status, 201);
    const antes = await foto(m);
    recusou(await estornar(aj.r.id), `Não é possível estornar: ${M6(0, 'reservada: 4', 4)}`);
    assert.strictEqual(await foto(m), antes);
  });

  await test('[97 RN-02] fisico 6, caixa 4: SAIDA 3 -> 400 "Disponivel: 2" + S; SAIDA 2 -> 201', async () => {
    const a = await montagem({ fisico: 6 });
    recusou(await svc({ material_id: a.m, tipo: 'SAIDA', quantidade: 3 }), M1(2) + SA(a));
    assert.strictEqual((await svc({ material_id: a.m, tipo: 'SAIDA', quantidade: 2 })).status, 201);
    await entregaTudo(a);
  });

  await test('[97 RN-02] caixa parcialmente coberta (reserva 2 do item, separou 4, fisico 4): livre 0 -> SAIDA 2 recusa com S de 2; A entrega 4', async () => {
    const m = await material(0); await entrar(m, 2);
    const a = await req([[m, 4]]); await aprovar(a.R);
    assert.strictEqual(await reservaAtiva(a.R), 2, 'premissa: a aprovacao reservou 2');
    await entrar(m, 2);
    assert.strictEqual((await separar(a.R, [[a.ids[0], 4]])).status, 200);
    recusou(await svc({ material_id: m, tipo: 'SAIDA', quantidade: 2 }), M1(0) + S(2, 'PC', `a requisição ${a.numero}`));
    await entregaTudo({ m, ...a });
  });

  await test('[97 RN-02] caixa de duas requisicoes soma (A 2 + B 2, fisico 6): SAIDA 3 -> 400 "Disponivel: 2" com as duas no sufixo', async () => {
    const m = await material(0);
    const x = await montagem({ m, fisico: 2, pede: 2 });
    const y = await montagem({ m, fisico: 4, pede: 2 });
    recusou(await svc({ material_id: m, tipo: 'SAIDA', quantidade: 3 }), M1(2) + S(4, 'PC', `as requisições ${x.numero} e ${y.numero}`));
  });

  await test('[97 RN-03] s5: caixas 8 sobre fisico 4 (legado): A entrega a propria caixa -> 200 (a entrega fica na regua de hoje)', async () => {
    const m = await material(0);
    const A = await req([[m, 4]]); await aprovar(A.R);
    const B = await req([[m, 4]]); await aprovar(B.R);
    await entrar(m, 8);
    assert.strictEqual((await separar(A.R, [[A.ids[0], 4]])).status, 200);
    assert.strictEqual((await separar(B.R, [[B.ids[0], 4]])).status, 200);
    // mudado na Etapa 97: o estado legado (caixas > fisico) era montado pela SAIDA avulsa que agora recusa —
    // escritor de legado direto, como a 96 fez com o torto.
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 4 WHERE id = ?', [m]);
    await entregaTudo({ m, ...A });
  });

  await test('[97 RN-03] a aprovacao de C com a caixa de A presente reserva disponivel - caixa dos outros (B469 da 95, igual a hoje)', async () => {
    const a = await montagem({ fisico: 6 });
    const C = await req([[a.m, 4]]); await aprovar(C.R);
    assert.strictEqual(await reservaAtiva(C.R), 2);
  });

  await test('[97 RN-04] sem caixa, toda recusa e byte a byte a de hoje (saida, reserva manual, remessa, ajuste, estorno de entrada)', async () => {
    const m = await material(0); await entrar(m, 2);
    recusou(await svc({ material_id: m, tipo: 'SAIDA', quantidade: 3 }), M1(2), 'saida');
    recusou(await reservaManual(m, 3), 'Saldo disponível insuficiente: 2', 'reserva manual');
    recusou(await svc({ material_id: m, tipo: 'REMESSA_TERCEIRO', quantidade: 3 }), 'Saldo disponível insuficiente para enviar ao terceiro: 2 PC', 'remessa');
    assert.strictEqual((await reservaManual(m, 1)).status, 201);
    recusou(await svc({ material_id: m, tipo: 'AJUSTE', quantidade: 0.5 }), M6(0.5, 'reservada: 1', 1), 'ajuste');
    const ent = await ultimaMov(m, 'ENTRADA');
    assert.strictEqual((await svc({ material_id: m, tipo: 'SAIDA', quantidade: 1 })).status, 201);
    recusou(await estornar(ent), 'Não é possível estornar: saldo disponível insuficiente (material já consumido)', 'estorno');
  });

  await test('[97 RN-05] pelo servico, com o gancho da s4b (separacao parada depois de ler o teto): a SAIDA avulsa espera e recusa — 0/10 com separado > fisico', async () => {
    let errados = 0;
    const origRun = db.run;
    try {
      for (let i = 0; i < 10; i++) {
        const m = await material(0); // eslint-disable-line no-await-in-loop
        const a = await req([[m, 4]]); await aprovar(a.R); // eslint-disable-line no-await-in-loop
        await entrar(m, 4); // eslint-disable-line no-await-in-loop
        let parou; const parada = new Promise((r) => { parou = r; });
        let liberar; const liberado = new Promise((r) => { liberar = r; });
        let armado = true;
        db.run = function ganchoE97(sql, ...resto) {
          if (armado && /UPDATE itens_requisicao_almoxarifado SET quantidade_separada/.test(sql)) {
            armado = false; parou();
            liberado.then(() => origRun.call(db, sql, ...resto));
            return db;
          }
          return origRun.call(db, sql, ...resto);
        };
        const sep = requisitionService.separarRequisicao(db, a.R, [{ item_id: a.ids[0], quantidade_separada: 4 }], { ...USERS.ALMOX })
          .then(() => 200, (e) => e.status || 500);
        await parada; // eslint-disable-line no-await-in-loop
        const saida = svc({ material_id: m, tipo: 'SAIDA', quantidade: 4 }); // disparada FORA da secao da separacao
        await dormir(30); // eslint-disable-line no-await-in-loop
        liberar();
        const [s, x] = await Promise.all([sep, saida]); // eslint-disable-line no-await-in-loop
        db.run = origRun;
        const est = await dbGet(db, `SELECT ma.quantidade_atual q, ix.quantidade_separada sep FROM materiais_almoxarifado ma
          JOIN itens_requisicao_almoxarifado ix ON ix.material_id = ma.id WHERE ma.id = ?`, [m]); // eslint-disable-line no-await-in-loop
        if (est.sep > est.q + 1e-9) errados++;
        assert.strictEqual(s, 200, 'a separacao conclui');
        if (i === 0) recusou(x, M1(0) + SA(a), 'a SAIDA depois da separacao');
      }
    } finally { db.run = origRun; }
    assert.strictEqual(errados, 0, `${errados}/10 rodadas com separado > fisico`);
  });

  await test('[97 RN-05] com a trava do material presa por um teste, a SAIDA avulsa pelo servico fica pendente e resolve ao soltar; dentro da entrega o motor nao espera', async () => {
    const m = await material(0); await entrar(m, 4);
    let soltar;
    const segura = trava.comLockDoMaterial(m, () => new Promise((r) => { soltar = r; }));
    await dormir(10);
    const saida = svc({ material_id: m, tipo: 'SAIDA', quantidade: 1 }); // FORA da fn da secao
    await dormir(150);
    assert.strictEqual(await estado(saida), 'pendente', 'a SAIDA nao esperou a trava');
    soltar(); await segura;
    assert.strictEqual((await saida).status, 201);
    const a = await montagem();
    assert.strictEqual(await comPrazo(entregaTudo(a), 3000), 'resolveu', 'a entrega esperou a si mesma');
  });

  await test('[97 RN-07] (Fase 2, I-1) permite_saldo_negativo: a caixa vale com a flag (SAIDA 4 -> 400, A entrega); a flag dispensa a reserva; sem caixa deixa negativar; o AJUSTE nao', async () => {
    const m = await material(0);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET permite_saldo_negativo = 1 WHERE id = ?', [m]);
    const a = await montagem({ m });
    recusou(await svc({ material_id: m, tipo: 'SAIDA', quantidade: 4 }), M1(0) + SA(a), 'SAIDA 4 com a flag');
    recusou(await svc({ material_id: m, tipo: 'AJUSTE', quantidade: 1 }), M6(1, 'separada na caixa de requisição: 4', 4), 'AJUSTE 1 com a flag');
    await entregaTudo(a);
    const n = await material(0);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET permite_saldo_negativo = 1 WHERE id = ?', [n]);
    const b = await montagem({ m: n, fisico: 10 });
    assert.strictEqual((await reservaManual(n, 6)).status, 201, 'reserva manual 6 (livre de caixa 6)');
    assert.strictEqual((await svc({ material_id: n, tipo: 'SAIDA', quantidade: 6 })).status, 201, 'a flag dispensa a reserva');
    recusou(await svc({ material_id: n, tipo: 'SAIDA', quantidade: 1 }), M1(0) + SA(b), 'SAIDA 1 a mais');
    const z = await material(0);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET permite_saldo_negativo = 1 WHERE id = ?', [z]);
    await entrar(z, 4);
    assert.strictEqual((await svc({ material_id: z, tipo: 'SAIDA', quantidade: 5 })).status, 201, 'sem caixa a flag negativa');
  });

  await test('[97 RN-08] (forma da Fase 2, I-5) bloqueio avulso pelo servico: bloquear 10 com fisico 4 -> 400; com reserva manual 4: 5 -> 400, 4 -> 201; montagem: 1 -> 400 com S; o BLOQUEIO interno (sem a opcao) passa', async () => {
    const m = await material(0); await entrar(m, 4);
    recusou(await svc({ material_id: m, tipo: 'BLOQUEIO', quantidade: 10 }, { bloqueioAvulso: true }), 'Saldo disponível insuficiente para bloquear: 4 PC');
    assert.strictEqual((await svc({ material_id: m, tipo: 'BLOQUEIO', quantidade: 4 }, { bloqueioAvulso: true })).status, 201);
    const r = await material(0); await entrar(r, 4);
    assert.strictEqual((await reservaManual(r, 4)).status, 201);
    recusou(await svc({ material_id: r, tipo: 'BLOQUEIO', quantidade: 5 }, { bloqueioAvulso: true }), 'Saldo disponível insuficiente para bloquear: 4 PC');
    assert.strictEqual((await svc({ material_id: r, tipo: 'BLOQUEIO', quantidade: 4 }, { bloqueioAvulso: true })).status, 201, 'a qualidade retem o reservado');
    const a = await montagem();
    recusou(await svc({ material_id: a.m, tipo: 'BLOQUEIO', quantidade: 1 }, { bloqueioAvulso: true }), `Saldo disponível insuficiente para bloquear: 0 PC${SA(a)}`);
    assert.strictEqual((await svc({ material_id: a.m, tipo: 'BLOQUEIO', quantidade: 1 })).status, 201, 'o BLOQUEIO interno fica como hoje');
  });

  await test('[97 I-4] (Fase 2) devolucao para SUCATA no legado (caixa 4 > fisico 2): 201, as duas pernas no livro', async () => {
    const m = await material(0);
    const a = await req([[m, 4]]); await aprovar(a.R);
    await entrar(m, 6);
    assert.strictEqual((await separar(a.R, [[a.ids[0], 4]])).status, 200);
    const sp = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'SAIDA', quantidade: 2, motivo: 'e97', justificativa: 'x', os_referencia: 'OS-97' });
    assert.strictEqual(sp.status, 201, JSON.stringify(sp.body));
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 2 WHERE id = ?', [m]); // legado A48
    const d = await como('ADMIN').post(`${API}/devolucoes`, { material_id: m, quantidade: 1, destino: 'SUCATA', motivo: 'sucata', observacoes: 'e97', movimentacao_saida_id: sp.body.id });
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    const tipos = (await dbAll(db, "SELECT tipo FROM movimentacoes_almoxarifado WHERE material_id=? AND referencia LIKE 'DEV-%' ORDER BY id", [m])).map((x) => x.tipo);
    assert.deepStrictEqual(tipos, ['ENTRADA_DEVOLUCAO', 'SUCATA']);
  });

  await test('[97 I-4] (Fase 2) estorno de entrada como compensacao (opcoes.compensacao) fica na regua de hoje; sem a opcao recusa', async () => {
    const a = await montagem({ fisico: 6 });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 2 WHERE id = ?', [a.m]); // legado: caixa 4 > fisico 2
    const x = await svc({ material_id: a.m, tipo: 'ENTRADA', quantidade: 1 });
    assert.strictEqual(x.status, 201, x.error);
    recusou(await estornar(x.r.id), `Não é possível estornar: saldo disponível insuficiente (material já consumido)${SA(a)}`, 'sem a opcao');
    assert.strictEqual((await estornar(x.r.id, { compensacao: true })).status, 200, 'a compensacao do mesmo evento');
  });

  await test('[97 I-3] (Fase 2) duas SAIDAs concorrentes pelo motor travado SERIALIZAM: a segunda le o resultado da primeira', async () => {
    const m = await material(0); await entrar(m, 10);
    // C = o claim do fisico (as duas tentam); L = a linha do livro (so a vencedora grava). Sob a trava a perdedora
    // so chega ao claim DEPOIS de a vencedora gravar o livro; solta, os dois claims correm antes do livro.
    const eventos = [];
    const origRun = db.run; const origGet = db.get;
    db.get = function claimE97(sql, ...resto) {
      if (/UPDATE materiais_almoxarifado\s+SET quantidade_atual = /.test(sql)) eventos.push('C');
      return origGet.call(db, sql, ...resto);
    };
    db.run = function livroE97(sql, ...resto) {
      if (/INSERT INTO movimentacoes_almoxarifado/.test(sql)) eventos.push('L');
      return origRun.call(db, sql, ...resto);
    };
    let rs;
    try {
      rs = await Promise.all([svc({ material_id: m, tipo: 'SAIDA', quantidade: 6 }), svc({ material_id: m, tipo: 'SAIDA', quantidade: 6 })]);
    } finally { db.run = origRun; db.get = origGet; }
    assert.deepStrictEqual(rs.map((x) => x.status).sort(), [201, 400]);
    assert.strictEqual(rs.find((x) => x.status === 400).error, M1(4), 'a segunda viu o disponivel que a primeira deixou');
    // a perdedora le o disponivel ja baixado (pre-checagem) e nem chega ao claim
    assert.deepStrictEqual(eventos, ['C', 'L'], `os dois correram juntos: ${eventos.join('')}`);
  });

  // ── T2: as portas fora do motor, pela rota ────────────────────────────────────────────────────────────────────────
  const rota = (x) => ({ status: x.status, error: x.body && x.body.error });
  const codigoDe = async (m) => (await dbGet(db, 'SELECT codigo FROM materiais_almoxarifado WHERE id=?', [m])).codigo;
  const bloquearRota = (m, q, u = 'ADMIN') => como(u).post(`${API}/materiais/${m}/bloquear`, { quantidade: q, motivo: 'e97', justificativa: 'teste da etapa 97 T2' });
  const M4 = (n) => `Saldo disponível insuficiente para bloquear: ${n} PC`;

  await test('[97 RN-08] pela rota (POST /materiais/:id/bloquear): 10 com fisico 4 -> 400 M4; 4 -> 200; com reserva manual 4: 5 -> 400, 4 -> 200; montagem: 1 -> 400 M4+S e A entrega 4', async () => {
    const m = await material(0); await entrar(m, 4);
    recusou(rota(await bloquearRota(m, 10)), M4(4), 'bloquear 10 com fisico 4');
    assert.strictEqual((await bloquearRota(m, 4)).status, 200, 'bloquear 4');
    const r = await material(0); await entrar(r, 4);
    assert.strictEqual((await reservaManual(r, 4)).status, 201);
    recusou(rota(await bloquearRota(r, 5)), M4(4), 'bloquear 5 com reserva 4');
    assert.strictEqual((await bloquearRota(r, 4)).status, 200, 'a qualidade retem o reservado');
    const a = await montagem();
    const antes = await foto(a.m);
    recusou(rota(await bloquearRota(a.m, 1)), M4(0) + SA(a), 'bloquear 1 na montagem');
    assert.strictEqual(await foto(a.m), antes);
    await entregaTudo(a);
  });

  await test('[97 RN-08] a devolucao para QUARENTENA (BLOQUEIO interno, sem a opcao) continua 201 e bloqueia o devolvido, mesmo com caixa', async () => {
    const a = await montagem({ fisico: 6 });
    const sp = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: a.m, tipo: 'SAIDA', quantidade: 2, motivo: 'e97', justificativa: 'x', os_referencia: 'OS-97' });
    assert.strictEqual(sp.status, 201, JSON.stringify(sp.body));
    const d = await como('ADMIN').post(`${API}/devolucoes`, { material_id: a.m, quantidade: 1, destino: 'QUARENTENA', motivo: 'quarentena', observacoes: 'e97', movimentacao_saida_id: sp.body.id });
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    const c = await dbGet(db, 'SELECT quantidade_atual q, quantidade_bloqueada b FROM materiais_almoxarifado WHERE id=?', [a.m]);
    assert.deepStrictEqual([c.q, c.b], [5, 1]);
    await entregaTudo(a);
  });

  await test('[97 RN-01] remessa pela rota: criar 201, enviar 400 M2b com o S DENTRO do fragmento do material com caixa; nada muda; A entrega 4', async () => {
    const a = await montagem();
    const n = await material(0); await entrar(n, 1);
    const [ca, cn] = [await codigoDe(a.m), await codigoDe(n)];
    const cr = await como('ADMIN').post(`${API}/remessas-terceiros`, {
      fornecedor_nome: 'Terceiro 97', tipo_servico: 'Galvanizacao', itens: [{ material_id: a.m, quantidade: 4 }, { material_id: n, quantidade: 2 }],
    });
    assert.strictEqual(cr.status, 201, `criar remessa: ${JSON.stringify(cr.body)}`);
    const { numero } = await dbGet(db, 'SELECT numero FROM remessas_terceiro_almoxarifado WHERE id=?', [cr.body.id]);
    const [fa, fn] = [await foto(a.m), await foto(n)];
    recusou(rota(await como('ADMIN').post(`${API}/remessas-terceiros/${cr.body.id}/enviar`)),
      `Nao foi possivel enviar a remessa ${numero}: ${ca}: disponivel 0 PC, a remessa pede 4${SA(a)}; ${cn}: disponivel 1 PC, a remessa pede 2`,
      'enviar');
    assert.deepStrictEqual([await foto(a.m), await foto(n)], [fa, fn]);
    assert.strictEqual((await dbGet(db, 'SELECT status FROM remessas_terceiro_almoxarifado WHERE id=?', [cr.body.id])).status, 'ABERTA');
    await entregaTudo(a);
  });

  await test('[97 RN-04] remessa sem caixa: a recusa do envio e byte a byte a de hoje', async () => {
    const n = await material(0); await entrar(n, 1);
    const cn = await codigoDe(n);
    const cr = await como('ADMIN').post(`${API}/remessas-terceiros`, {
      fornecedor_nome: 'Terceiro 97', tipo_servico: 'Galvanizacao', itens: [{ material_id: n, quantidade: 2 }],
    });
    assert.strictEqual(cr.status, 201, `criar remessa: ${JSON.stringify(cr.body)}`);
    const { numero } = await dbGet(db, 'SELECT numero FROM remessas_terceiro_almoxarifado WHERE id=?', [cr.body.id]);
    recusou(rota(await como('ADMIN').post(`${API}/remessas-terceiros/${cr.body.id}/enviar`)),
      `Nao foi possivel enviar a remessa ${numero}: ${cn}: disponivel 1 PC, a remessa pede 2`);
  });

  const M7 = (cod, n, q, sufixo = '') => `Saldo disponivel insuficiente para sucatear ${cod}: disponivel ${n} PC, solicitado ${q}. `
    + `O disponivel ja desconta reservado, bloqueado, em inspecao e em poder de terceiros${sufixo ? ' e o separado na caixa de requisições' : ''} — `
    + `sucatear alem dele apagaria material que esta comprometido com outra OS.${sufixo}`;
  const solicitarSucata = (m, q) => como('ADMIN').post(`${API}/sucateamentos`, { material_id: m, quantidade: q, justificativa: 'sucata e97' });
  const nSucata = async (m) => (await dbGet(db, 'SELECT COUNT(*) n FROM sucateamentos_almoxarifado WHERE material_id=?', [m])).n;

  await test('[97 RN-01] sucateamento: a recusa vem NA SOLICITACAO (400 M7 com a frase da caixa e o S), nenhuma solicitacao criada; A entrega 4', async () => {
    const a = await montagem();
    const antes = await foto(a.m);
    recusou(rota(await solicitarSucata(a.m, 4)), M7(await codigoDe(a.m), 0, 4, SA(a)), 'solicitar 4');
    assert.deepStrictEqual([await foto(a.m), await nSucata(a.m)], [antes, 0]);
    await entregaTudo(a);
  });

  await test('[97 RN-04] sucateamento sem caixa: a recusa e byte a byte a de hoje (sem a frase da caixa, sem S); fisico 6 caixa 4: 3 recusa com S, 2 passa', async () => {
    const n = await material(0); await entrar(n, 2);
    recusou(rota(await solicitarSucata(n, 3)), M7(await codigoDe(n), 2, 3), 'solicitar 3 com 2');
    const a = await montagem({ fisico: 6 });
    recusou(rota(await solicitarSucata(a.m, 3)), M7(await codigoDe(a.m), 2, 3, SA(a)), 'solicitar 3 com livre 2');
    assert.strictEqual((await solicitarSucata(a.m, 2)).status, 201, 'solicitar 2 com livre 2');
  });

  const conferencia = async (categoria) => {
    const conf = await como('ADMIN').post(`${API}/conferencias`, { categoria, tolerancia_percentual: 100 });
    assert.ok(conf.body.id, `abrir conferencia: ${conf.status} ${JSON.stringify(conf.body)}`);
    return conf.body.id;
  };
  const contar = async (conf, m, q) => {
    const ic = await dbGet(db, 'SELECT id FROM itens_conferencia_almoxarifado WHERE conferencia_id=? AND material_id=?', [conf, m]);
    assert.ok(ic, `o material ${m} entrou na conferencia`);
    const r = await como('ADMIN').put(`${API}/conferencias/${conf}/item/${ic.id}`, { quantidade_contada: q });
    assert.strictEqual(r.status, 200, `contar: ${JSON.stringify(r.body)}`);
  };
  const concluir = (conf) => como('ADMIN').put(`${API}/conferencias/${conf}/concluir`, { aplicar_ajustes: true, justificativa_ajuste: 'contagem da etapa 97' });
  const M6CX = (total) => M6(total, 'separada na caixa de requisição: 4', 4);

  await test('[97 RN-01] inventario pela rota: conta 0 na montagem e conclui aplicando -> 400 "Ajuste bloqueado:" + M6 com a caixa; nada muda, conferencia aberta; A entrega 4', async () => {
    const cat = `CAT-E97-${++seq}`;
    const a = await montagem();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET categoria=? WHERE id=?', [cat, a.m]);
    const conf = await conferencia(cat);
    await contar(conf, a.m, 0);
    const antes = await foto(a.m);
    recusou(rota(await concluir(conf)), `Ajuste bloqueado: ${await codigoDe(a.m)}: ${M6CX(0)}`, 'concluir');
    assert.strictEqual(await foto(a.m), antes);
    assert.strictEqual((await dbGet(db, 'SELECT status FROM conferencias_almoxarifado WHERE id=?', [conf])).status, 'ABERTO');
    await entregaTudo(a);
  });

  await test('[97 RN-09] inventario tudo ou nada com a caixa: o primeiro sem caixa (conta 3 de 5), o segundo com caixa (conta 0) -> 400 da pre-validacao e NENHUM item ajustado', async () => {
    const cat = `CAT-E97-${++seq}`;
    const p = await material(0); await entrar(p, 5);
    const a = await montagem();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET categoria=? WHERE id IN (?, ?)', [cat, p, a.m]);
    const conf = await conferencia(cat);
    await contar(conf, p, 3);
    await contar(conf, a.m, 0);
    const [fp, fa] = [await foto(p), await foto(a.m)];
    recusou(rota(await concluir(conf)), `Ajuste bloqueado: ${await codigoDe(a.m)}: ${M6CX(0)}`, 'concluir');
    assert.deepStrictEqual([await foto(p), await foto(a.m)], [fp, fa], 'algum item foi ajustado');
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id=?', [p])).q, 5);
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM itens_conferencia_almoxarifado WHERE conferencia_id=? AND ajustado=1', [conf])).n, 0);
  });

  await test('[97 T2] (Fase 2, menor 3) a conclusao inteira (pre-validacao + aplicacao) roda sob comLockDosMateriais: a retencao criada enquanto a trava estava presa e vista pela PRE-VALIDACAO, e nenhum item e ajustado', async () => {
    // p1 sem trava (conta 3 de 5); p2 com a trava presa por um teste (conta 4 de 5). Enquanto a conclusao espera,
    // DENTRO da secao que segura p2, uma reserva manual de 5 em p2 (o motor roda direto: a secao segura p2).
    // Sob a trava: a pre-validacao le depois de soltar -> "Ajuste bloqueado: p2 ..." e p1 continua 5.
    // Solta (antes da 97): a pre-validacao passava, p1 era ajustado para 3 e o motor recusava p2 sem o prefixo.
    const cat = `CAT-E97-${++seq}`;
    const p1 = await material(0); await entrar(p1, 5);
    const p2 = await material(0); await entrar(p2, 5);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET categoria=? WHERE id IN (?, ?)', [cat, p1, p2]);
    const conf = await conferencia(cat);
    await contar(conf, p1, 3);
    await contar(conf, p2, 4);
    let soltar; const sinal = new Promise((r) => { soltar = r; });
    const segura = trava.comLockDoMaterial(p2, async () => { await sinal; return reservaManual(p2, 5); });
    await dormir(10);
    const pc = concluir(conf); // FORA da fn da secao
    await dormir(150);
    assert.strictEqual(await estado(pc), 'pendente', 'a conclusao nao esperou a trava');
    soltar();
    assert.strictEqual((await segura).status, 201, 'a reserva manual dentro da secao');
    const r = await pc;
    recusou(rota(r), `Ajuste bloqueado: ${await codigoDe(p2)}: Ajuste para 4 PC deixaria o disponível negativo (reservada: 5, `
      + 'mínimo aceitável: 5 PC). Resolva a retenção antes de ajustar para menos, ou ajuste para um valor maior ou igual ao mínimo.', 'concluir');
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id=?', [p1])).q, 5, 'p1 foi ajustado: o tudo-ou-nada quebrou');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
