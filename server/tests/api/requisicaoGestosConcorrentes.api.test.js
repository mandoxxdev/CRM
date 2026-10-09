/**
 * Etapa 93 (T0, B443) — dois gestos na mesma requisicao ao mesmo tempo nao passam um por cima do outro.
 *
 * Separar, entregar e excluir (e, na T1, liberar para retirada e encerrar) liam o estado, gravavam e so no
 * fim regravavam o status com `WHERE id=?`. Dois gestos da MESMA requisicao no mesmo instante se
 * atropelavam (Fase 0, 5/5 com gancho cada): a excluida voltava a EM_SEPARACAO (o achado 7 da 92), duas
 * entregas perdiam a entrega do item e deixavam sair material a mais (C156, 10/10 SEM gancho), duas
 * exclusoes estornavam duas vezes (C157, 10/10 sem gancho), a requisicao toda entregue ficava parada fora
 * de ENTREGUE (C159).
 *
 * Agora as portas seguram uma trava POR REQUISICAO (`travaPorRequisicao.serializarNaRequisicao`, FIFO, em
 * memoria, um processo — premissa C132). NAO e `requisitionService.comTravaDaRequisicao`: aquela e a trava
 * POR MATERIAL dos itens (Etapa 91). O segundo gesto ESPERA o primeiro e le o estado novo.
 *
 * Tecnica (plano, "Tecnica dos testes de corrida"): o gancho no SQL DISPARA o gesto concorrente e NAO o
 * aguarda (ele esperaria a trava que o gesto retido segura: deadlock); espera ate
 * `esperandoNaRequisicao(R) === 1` — "o segundo entrou na fila" — e so entao emite o comando retido. Afirmar
 * a fila e o que prova a serializacao.
 *
 * RN-01, RN-03..RN-07 (a) e RN-09 (T0); RN-02 e RN-07 (b) no fim (T1); a T2..T5 acrescentam a RN-08.
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa93-gestos-concorrentes-mesma-requisicao.md
 *
 * Executar: cd server && node tests/api/requisicaoGestosConcorrentes.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const { PERFIS } = require('../../services/almoxarifado/permissions');

// Sem o modulo (antes da T0) o arquivo roda e cai na asserção "entrou na fila" — o vermelho medido.
let trava = null;
try { trava = require('../../services/almoxarifado/travaPorRequisicao'); } catch (e) { trava = null; }
const esperandoNa = (R) => (trava ? trava.esperandoNaRequisicao(R) : 0);

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 93', role: 'admin', is_superadmin: 1, email: 'a93@t.com' },
  S: { id: 9301, nome: 'Solic 93', role: 'user', email: 's93@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9302, nome: 'Almox 93', role: 'user', email: 'x93@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
  ALMOX2: { id: 9303, nome: 'Almox2 93', role: 'user', email: 'y93@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
// Literais congeladas (plano, Contrato).
const S1 = 'Requisição deve estar aprovada, aguardando estoque/compra, em separação ou parcialmente atendida para separar';
const E0 = 'Requisição deve estar em separação, pronta para retirada ou parcialmente atendida';
const N0 = 'Requisição não encontrada';
const RE = {
  // a reivindicacao da separacao (92): `... WHERE id=? AND status IN (...)`
  CLAIM: /SET\s+status\s*=\s*'EM_SEPARACAO'[^;]*WHERE\s+id\s*=\s*\?\s+AND\s+status\s+IN/,
  // o compare-and-clear da separacao (depois da rodada)
  CAC: /SET\s+status\s*=\s*'EM_SEPARACAO'[\s\S]*conferido_por_id\s*=\s*NULL/,
  // o UPDATE final da exclusao
  EXCL: /SET\s+ativo\s*=\s*0,\s*status\s*=\s*'CANCELADO'/,
  // o UPDATE final da entrega (as duas formas)
  ENT: /SET\s+status\s*=\s*\?,\s*(data_entrega\s*=|updated_at\s*=\s*CURRENT_TIMESTAMP,\s*ultimo_lembrete_enviado\s*=\s*NULL\s+WHERE)/,
  // o UPDATE do item na entrega (a 4e: perda de atualizacao no item)
  ITEM_ENT: /UPDATE\s+itens_requisicao_almoxarifado\s+SET\s+quantidade_entregue\s*=/,
};
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const comPrazo = (p, ms, rotulo) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(`prazo de ${ms}ms estourado: ${rotulo}`)), ms).unref()),
]);
// "O segundo entrou na fila": espera `esperandoNaRequisicao(R) === 1` (prazo 3000 ms). false = nao entrou.
const esperarFila = async (R, ms = 3000) => {
  const ate = Date.now() + ms;
  while (Date.now() < ate) {
    if (esperandoNa(R) === 1) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 2));
  }
  return false;
};

(async () => {
  console.log('\n=== Etapa 93 (T0): dois gestos na mesma requisicao sao serializados ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  // Usuario por requisicao (sem header: ADMIN) — molde da 92.
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
    del: (u, b = {}) => request(app).delete(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });

  // ── gancho no SQL ──
  // fila: dispara o gesto SEM aguardar, espera ele entrar na fila da trava, emite o comando retido.
  // aguardar: o molde da 92 (gesto ate a resposta, depois o comando) — so para quem NAO disputa a trava.
  const origRun = db.run.bind(db);
  let ganchos = [];
  db.run = function (sql, ...rest) {
    const s = String(sql);
    for (const g of ganchos) {
      if (g.armado && g.re.test(s)) {
        g.armado = false; g.disparos++;
        if (g.aguardar) {
          comPrazo(Promise.resolve().then(g.fn), 5000, 'gesto aguardado no gancho')
            .then((r) => { g.resposta = r; }, (e) => { g.erro = e; })
            .then(() => origRun(sql, ...rest));
          return this;
        }
        g.promessa = Promise.resolve().then(g.fn).then((r) => { g.resposta = r; }, (e) => { g.erro = e; });
        esperarFila(g.R).then((ok) => { g.entrouNaFila = ok; origRun(sql, ...rest); });
        return this;
      }
    }
    return origRun(sql, ...rest);
  };
  const armarFila = (re, R, fn) => { const g = { re, R, fn, disparos: 0, armado: true }; ganchos.push(g); return g; };
  const armarAguardando = (re, fn) => { const g = { re, fn, aguardar: true, disparos: 0, armado: true }; ganchos.push(g); return g; };
  const desarmar = () => { ganchos = []; };
  // O gancho disparou 1 vez e o gesto respondeu (sem lancar). A FILA e afirmada no FIM de cada caso
  // (`afirmarFila`): assim, sem a trava, o caso cai primeiro no DESFECHO (o vermelho de regra) — e um gesto
  // que terminasse certo sem passar pela fila ainda cai na fila.
  const afirmarSerializado = async (g) => {
    await g.promessa;
    assert.strictEqual(g.disparos, 1, `o gancho disparou ${g.disparos} vez(es) — rodada sem valor`);
    assert.ok(!g.erro, `o gesto do gancho lancou: ${g.erro && g.erro.message}`);
    assert.ok(g.resposta, 'o gesto do gancho nao respondeu');
  };
  const afirmarFila = (g) => {
    assert.strictEqual(g.entrouNaFila, true, 'o segundo gesto NAO entrou na fila da trava (esperandoNaRequisicao != 1)');
  };

  const API = '/api/almoxarifado';
  const montar = async ({ critico = false, pede = 4, estoque = pede, status = 'TOTALMENTE_RESERVADA' } = {}) => {
    const c = `E93T0-${++seq}`;
    const m = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, material_critico)
      VALUES (?, ?, 'PC', ?, 0, 1, ?)`, [c, `Mat ${c}`, estoque, critico ? 1 : 0])).lastID;
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-93T0', itens: [{ material_id: m, quantidade: pede }],
    });
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    const R = cr.body.id;
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R])).id;
    const rid = (await stockService.criarReserva(db, USERS.ADMIN, { material_id: m, quantidade: pede },
      { requisicao_id: R, item_requisicao_id: item })).id;
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET status = ? WHERE id = ?', [status, R]);
    return { m, R, item, rid };
  };
  const separar = (k, R, item, q) => como(k).put(`${API}/requisicoes/${R}/separar`, {
    itens_separados: q ? [{ item_id: item, quantidade_separada: q }] : [],
  });
  const conferir = (k, R) => como(k).put(`${API}/requisicoes/${R}/conferir-separacao`);
  const entregar = (k, R, item, q) => como(k).put(`${API}/requisicoes/${R}/entregar`, {
    itens_atendidos: [{ item_id: item, quantidade_atendida: q }],
  });
  const excluir = (k, R) => como(k).del(`${API}/requisicoes/${R}`, { justificativa: 'teste 93' });
  const excluirOutros = (k, R) => como(k).del(`/api/requisicoes-material/${R}`, { justificativa: 'teste 93' });
  const cancelarOutros = (k, R) => como(k).put(`/api/requisicoes-material/${R}/cancelar`);

  const foto = async ({ m, R, item, rid }) => {
    const rq = await dbGet(db, `SELECT status, COALESCE(ativo,1) ativo, conferido_por_id, data_entrega
      FROM requisicoes_almoxarifado WHERE id = ?`, [R]);
    const it = await dbGet(db, 'SELECT quantidade_separada sep, quantidade_entregue ent FROM itens_requisicao_almoxarifado WHERE id = ?', [item]);
    const rv = await dbGet(db, 'SELECT status, quantidade_utilizada u FROM reservas_material_almoxarifado WHERE id = ?', [rid]);
    const mt = await dbGet(db, 'SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r FROM materiais_almoxarifado WHERE id = ?', [m]);
    const rods = await dbAll(db, 'SELECT * FROM separacoes_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [R]);
    const movs = await dbAll(db, `SELECT tipo, quantidade, motivo, usuario_id FROM movimentacoes_almoxarifado
      WHERE material_id = ? AND COALESCE(cancelado,0) = 0 ORDER BY id`, [m]);
    const trilha = await dbAll(db, `SELECT acao, usuario_id, dados_anteriores FROM auditoria_log_almoxarifado
      WHERE entidade = 'requisicao' AND entidade_id = ? ORDER BY id`, [R]);
    return {
      status: rq.status, ativo: Number(rq.ativo), conferido: rq.conferido_por_id, dataEntrega: !!rq.data_entrega,
      sep: Number(it.sep || 0), ent: Number(it.ent || 0), reserva: rv.status, u: Number(rv.u || 0),
      q: Number(mt.q), r: Number(mt.r), rodadas: rods,
      saidas: movs.filter((x) => x.tipo === 'SAIDA').reduce((s, x) => s + Number(x.quantidade), 0),
      estornos: movs.filter((x) => x.tipo === 'ENTRADA' && /^Estorno exclus/.test(x.motivo || '')),
      movs: movs.filter((x) => x.tipo === 'SAIDA' || x.tipo === 'ENTRADA').map((x) => `${x.tipo}:${Number(x.quantidade)}`).join(','),
      trilha, acoes: trilha.map((x) => x.acao),
    };
  };
  const posicao = (acoes, a) => acoes.indexOf(a);

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  await test('[93] o modulo travaPorRequisicao existe e exporta serializarNaRequisicao/esperandoNaRequisicao', async () => {
    assert.ok(trava, 'services/almoxarifado/travaPorRequisicao.js nao existe');
    assert.strictEqual(typeof trava.serializarNaRequisicao, 'function');
    assert.strictEqual(typeof trava.esperandoNaRequisicao, 'function');
  });

  // ── RN-01 — exclusao x separacao (o achado 7 da 92) ──
  await test('[93 RN-01] (a) no compare-and-clear da separacao, a exclusao (ADMIN) espera: separacao 200 e DEPOIS exclusao 200 -> CANCELADO, ativo=0, reserva LIBERADA, trilha SEPARACAO antes de EXCLUSAO', async () => {
    desarmar();
    const x = await montar();
    const g = armarFila(RE.CAC, x.R, () => excluir('ADMIN', x.R));
    const sep = await separar('ALMOX', x.R, x.item, 1);
    await afirmarSerializado(g);
    desarmar();
    assert.strictEqual(sep.status, 200, `separacao: ${sep.status} ${JSON.stringify(sep.body)}`);
    assert.strictEqual(sep.body.status, 'EM_SEPARACAO');
    assert.strictEqual(g.resposta.status, 200, `exclusao: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    const f = await foto(x);
    assert.strictEqual(f.status, 'CANCELADO', `status ${f.status} (a excluida voltou a ${f.status})`);
    assert.strictEqual(f.ativo, 0);
    assert.strictEqual(f.reserva, 'LIBERADA');
    assert.strictEqual(f.r, 0, `reservado ${f.r}`);
    assert.strictEqual(f.rodadas.length, 1);
    assert.strictEqual(Number(f.rodadas[0].usuario_id), USERS.ALMOX.id, 'a rodada e de ALMOX');
    const iSep = posicao(f.acoes, 'SEPARACAO'); const iExc = posicao(f.acoes, 'EXCLUSAO');
    assert.ok(iSep >= 0 && iExc > iSep, `trilha ${f.acoes.join(',')}: SEPARACAO antes de EXCLUSAO`);
    assert.strictEqual(Number(f.trilha[iExc].usuario_id), USERS.ADMIN.id, 'a exclusao e de ADMIN');
    afirmarFila(g);
  });

  await test('[93 RN-01] (b) no UPDATE ativo=0 da exclusao, a separacao (1) espera: exclusao 200; separacao 400 S1 (le CANCELADO); 0 rodadas, separado 0', async () => {
    desarmar();
    const x = await montar();
    const g = armarFila(RE.EXCL, x.R, () => separar('ALMOX', x.R, x.item, 1));
    const exc = await excluir('ADMIN', x.R);
    await afirmarSerializado(g);
    desarmar();
    assert.strictEqual(exc.status, 200, `exclusao: ${exc.status} ${JSON.stringify(exc.body)}`);
    assert.strictEqual(g.resposta.status, 400, `separacao: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    assert.strictEqual(g.resposta.body.error, S1);
    const f = await foto(x);
    assert.strictEqual(f.rodadas.length, 0, `rodadas ${f.rodadas.length} (a separacao gravou numa excluida)`);
    assert.strictEqual(f.sep, 0);
    assert.strictEqual(f.status, 'CANCELADO');
    assert.strictEqual(f.ativo, 0);
    afirmarFila(g);
  });

  await test('[93 RN-01] (c) (Fase 2, I2) na reivindicacao da separacao, a exclusao pela rota espera; a trilha EXCLUSAO grava o status lido DENTRO da trava (EM_SEPARACAO), nao o de antes da fila', async () => {
    desarmar();
    const x = await montar();
    const g = armarFila(RE.CLAIM, x.R, () => excluir('ADMIN', x.R));
    const sep = await separar('ALMOX', x.R, x.item, 1);
    await afirmarSerializado(g);
    desarmar();
    assert.strictEqual(sep.status, 200, `separacao: ${sep.status} ${JSON.stringify(sep.body)}`);
    assert.strictEqual(g.resposta.status, 200, `exclusao: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    assert.deepStrictEqual(Object.keys(g.resposta.body).sort(), ['estornos', 'reservas_liberadas', 'success'],
      'a resposta da exclusao nao muda de forma (anterior nao vai no JSON)');
    const f = await foto(x);
    const exc = f.trilha.filter((t) => t.acao === 'EXCLUSAO');
    assert.strictEqual(exc.length, 1);
    assert.strictEqual(JSON.parse(exc[0].dados_anteriores).status, 'EM_SEPARACAO',
      `dados_anteriores ${exc[0].dados_anteriores} (o status lido fora da trava)`);
    assert.strictEqual(f.status, 'CANCELADO');
    afirmarFila(g);
  });

  // ── RN-03 — entrega x entrega (C156) ──
  const rn03 = async (re, viaServico) => {
    const x = await montar({ estoque: 8 });
    const s = await separar('ALMOX', x.R, x.item, 4);
    assert.strictEqual(s.status, 200, JSON.stringify(s.body));
    const g = armarFila(re, x.R, () => (viaServico
      ? requisitionService.entregarRequisicao(db, Number(x.R), [{ item_id: x.item, quantidade_atendida: 2 }], { ...USERS.ALMOX2 })
        .then((body) => ({ status: 200, body }))
      : entregar('ALMOX2', x.R, x.item, 2)));
    const e1 = await entregar('ALMOX', x.R, x.item, 2);
    await afirmarSerializado(g);
    desarmar();
    assert.strictEqual(e1.status, 200, `primeira: ${e1.status} ${JSON.stringify(e1.body)}`);
    assert.strictEqual(e1.body.status, 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual(g.resposta.status, 200, `segunda: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    assert.strictEqual(g.resposta.body.status, 'ENTREGUE', 'a segunda le o estado novo e completa');
    const f = await foto(x);
    assert.strictEqual(f.ent, 4, `quantidade_entregue ${f.ent} para saidas ${f.saidas}`);
    assert.strictEqual(f.saidas, 4);
    assert.strictEqual(f.status, 'ENTREGUE', `status ${f.status}`);
    assert.ok(f.dataEntrega, 'data_entrega gravada');
    assert.strictEqual(f.reserva, 'CONSUMIDA'); assert.strictEqual(f.u, 4);
    const quem = (await dbAll(db, `SELECT DISTINCT usuario_id FROM movimentacoes_almoxarifado
      WHERE requisicao_id = ? AND tipo = 'SAIDA' ORDER BY usuario_id`, [x.R])).map((r) => Number(r.usuario_id));
    assert.deepStrictEqual(quem, [USERS.ALMOX.id, USERS.ALMOX2.id], 'cada almoxarife baixou a sua parte');
    const terceira = await entregar('ALMOX', x.R, x.item, 1);
    assert.strictEqual(terceira.status, 400, `terceira: ${terceira.status} ${JSON.stringify(terceira.body)}`);
    assert.strictEqual(terceira.body.error, E0);
    assert.strictEqual((await foto(x)).q, 4, 'q=4 (8 - 4 entregues)');
    afirmarFila(g);
  };
  await test('[93 RN-03] (a) no UPDATE do item da primeira entrega (2), a segunda (2) espera: ENTREGUE, entregue 4 = saidas 4, reserva CONSUMIDA u=4; terceira -> 400 E0', async () => {
    desarmar(); await rn03(RE.ITEM_ENT, false);
  });
  await test('[93 RN-03] (b) no UPDATE final da primeira entrega, a segunda espera: o mesmo (nada de PARCIALMENTE_ATENDIDA com tudo entregue)', async () => {
    desarmar(); await rn03(RE.ENT, false);
  });
  await test('[93 RN-03] (d) a segunda pelo SERVICO com id numerico, a primeira pela rota (id string): a mesma fila (a chave e normalizada)', async () => {
    desarmar(); await rn03(RE.ITEM_ENT, true);
  });
  await test('[93 RN-03] (c) sem gancho: duas entregas de 2 disparadas juntas (d=0), N=10 -> 0/10 com entregue != saidas', async () => {
    desarmar();
    let ruins = 0; const ex = [];
    for (let i = 0; i < 10; i++) {
      const x = await montar({ estoque: 8 });
      await separar('ALMOX', x.R, x.item, 4);
      // eslint-disable-next-line no-await-in-loop
      const [a, b] = await Promise.all([entregar('ALMOX', x.R, x.item, 2), entregar('ALMOX2', x.R, x.item, 2)]);
      const f = await foto(x);
      if (a.status !== 200 || b.status !== 200 || f.ent !== f.saidas || f.status !== 'ENTREGUE') {
        ruins++; if (ex.length < 2) ex.push(`${a.status}/${b.status} ent ${f.ent} saidas ${f.saidas} ${f.status}`);
      }
    }
    assert.strictEqual(ruins, 0, `${ruins}/10 divergentes: ${ex.join(' | ')}`);
  });

  // ── RN-04 — exclusao x exclusao (C157) ──
  const entregue4 = async () => {
    const x = await montar();
    assert.strictEqual((await separar('ALMOX', x.R, x.item, 4)).status, 200);
    const e = await entregar('ALMOX', x.R, x.item, 4);
    assert.strictEqual(e.body.status, 'ENTREGUE', JSON.stringify(e.body));
    assert.strictEqual((await foto(x)).q, 0);
    return x;
  };
  const rn04 = async (segunda) => {
    const x = await entregue4();
    const g = armarFila(RE.EXCL, x.R, () => segunda(x.R));
    const e1 = await excluir('ADMIN', x.R);
    await afirmarSerializado(g);
    desarmar();
    assert.strictEqual(e1.status, 200, `primeira: ${e1.status} ${JSON.stringify(e1.body)}`);
    assert.strictEqual(e1.body.estornos.length, 1);
    assert.strictEqual(g.resposta.status, 404, `segunda: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    assert.strictEqual(g.resposta.body.error, N0);
    const f = await foto(x);
    assert.strictEqual(f.estornos.length, 1, `estornos no livro: ${f.movs}`);
    assert.strictEqual(Number(f.estornos[0].quantidade), 4);
    assert.strictEqual(f.q, 4, `q=${f.q} (8 = estoque fantasma)`);
    assert.strictEqual(f.acoes.filter((a) => a === 'EXCLUSAO').length, 1, `trilha ${f.acoes.join(',')}`);
    assert.strictEqual(f.status, 'CANCELADO'); assert.strictEqual(f.ativo, 0);
    afirmarFila(g);
  };
  await test('[93 RN-04] (a) no UPDATE ativo=0 da primeira exclusao de uma ENTREGUE (4), a segunda espera: 200 + 404 N0, UM estorno de 4, q=4, UMA trilha EXCLUSAO', async () => {
    desarmar(); await rn04((R) => excluir('ADMIN', R));
  });
  await test('[93 RN-04] (b) a segunda pela OUTRA rota (DELETE /api/requisicoes-material/:id): o mesmo', async () => {
    desarmar(); await rn04((R) => excluirOutros('ADMIN', R));
  });
  await test('[93 RN-04] (c) sem gancho: duas exclusoes de uma ENTREGUE disparadas juntas (d=0), N=10 -> 0/10 com estorno > saida', async () => {
    desarmar();
    let ruins = 0; const ex = [];
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop
      const x = await entregue4();
      // eslint-disable-next-line no-await-in-loop
      const [a, b] = await Promise.all([excluir('ADMIN', x.R), excluirOutros('ADMIN', x.R)]);
      const f = await foto(x);
      const est = f.estornos.reduce((s, e) => s + Number(e.quantidade), 0);
      const st = [a.status, b.status].sort().join('/');
      if (st !== '200/404' || est !== 4 || f.q !== 4) { ruins++; if (ex.length < 2) ex.push(`${st} estornado ${est} q ${f.q}`); }
    }
    assert.strictEqual(ruins, 0, `${ruins}/10 divergentes: ${ex.join(' | ')}`);
  });

  // ── RN-05 — exclusao x entrega ──
  await test('[93 RN-05] (a) no UPDATE ativo=0 da exclusao, a entrega (4) espera: exclusao 200; entrega 400 E0 (le CANCELADO); nenhuma SAIDA; q=4; reserva LIBERADA', async () => {
    desarmar();
    const x = await montar();
    assert.strictEqual((await separar('ALMOX', x.R, x.item, 4)).status, 200);
    const g = armarFila(RE.EXCL, x.R, () => entregar('ALMOX', x.R, x.item, 4));
    const exc = await excluir('ADMIN', x.R);
    await afirmarSerializado(g);
    desarmar();
    assert.strictEqual(exc.status, 200, `exclusao: ${exc.status} ${JSON.stringify(exc.body)}`);
    assert.strictEqual(g.resposta.status, 400, `entrega: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    assert.strictEqual(g.resposta.body.error, E0);
    const f = await foto(x);
    assert.strictEqual(f.saidas, 0, `saidas ${f.movs}`);
    assert.strictEqual(f.q, 4);
    assert.strictEqual(f.reserva, 'LIBERADA');
    assert.strictEqual(f.status, 'CANCELADO'); assert.strictEqual(f.ativo, 0);
    afirmarFila(g);
  });

  await test('[93 RN-05] (b) no UPDATE final da entrega (4), a exclusao espera: entrega 200 ENTREGUE; exclusao 200 com estorno de 4; CANCELADO, ativo=0, SAIDA:4,ENTRADA:4, q=4', async () => {
    desarmar();
    const x = await montar();
    assert.strictEqual((await separar('ALMOX', x.R, x.item, 4)).status, 200);
    const g = armarFila(RE.ENT, x.R, () => excluir('ADMIN', x.R));
    const ent = await entregar('ALMOX', x.R, x.item, 4);
    await afirmarSerializado(g);
    desarmar();
    assert.strictEqual(ent.status, 200, `entrega: ${ent.status} ${JSON.stringify(ent.body)}`);
    assert.strictEqual(ent.body.status, 'ENTREGUE');
    assert.strictEqual(g.resposta.status, 200, `exclusao: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    assert.strictEqual(g.resposta.body.estornos.length, 1);
    const f = await foto(x);
    assert.strictEqual(f.status, 'CANCELADO', `status ${f.status} ativo ${f.ativo}`);
    assert.strictEqual(f.ativo, 0);
    assert.strictEqual(f.movs, 'SAIDA:4,ENTRADA:4');
    assert.strictEqual(f.q, 4);
    afirmarFila(g);
  });

  // ── RN-06 — separacao x entrega (1c) ──
  await test('[93 RN-06] no compare-and-clear da rodada de 4, a entrega (4) espera: separacao 200; entrega 200 ENTREGUE depois; final ENTREGUE', async () => {
    desarmar();
    const x = await montar();
    const g = armarFila(RE.CAC, x.R, () => entregar('ALMOX2', x.R, x.item, 4));
    const sep = await separar('ALMOX', x.R, x.item, 4);
    await afirmarSerializado(g);
    desarmar();
    assert.strictEqual(sep.status, 200, `separacao: ${sep.status} ${JSON.stringify(sep.body)}`);
    assert.strictEqual(g.resposta.status, 200, `entrega: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    assert.strictEqual(g.resposta.body.status, 'ENTREGUE');
    const f = await foto(x);
    assert.strictEqual(f.status, 'ENTREGUE', `status ${f.status} (a separacao regravou EM_SEPARACAO por cima da entrega)`);
    assert.strictEqual(f.ent, 4);
    assert.strictEqual(Number(f.rodadas[0].usuario_id), USERS.ALMOX.id);
    afirmarFila(g);
  });

  // ── RN-07 (a) — entrega x separacao critica (4c) ──
  await test('[93 RN-07] (a) critico separado 2 e conferido; no UPDATE final da entrega (1), a rodada 2 (1) espera: entrega 200 PARCIALMENTE_ATENDIDA; separacao 200 depois; EM_SEPARACAO, conferencia NULL, separado 3; conferir -> 200', async () => {
    desarmar();
    const x = await montar({ critico: true });
    assert.strictEqual((await separar('ALMOX', x.R, x.item, 2)).status, 200);
    const cf = await conferir('ALMOX2', x.R);
    assert.strictEqual(cf.status, 200, JSON.stringify(cf.body));
    const g = armarFila(RE.ENT, x.R, () => separar('ALMOX', x.R, x.item, 1));
    const ent = await entregar('ALMOX2', x.R, x.item, 1);
    await afirmarSerializado(g);
    desarmar();
    assert.strictEqual(ent.status, 200, `entrega: ${ent.status} ${JSON.stringify(ent.body)}`);
    assert.strictEqual(ent.body.status, 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual(g.resposta.status, 200, `separacao: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    const f = await foto(x);
    assert.strictEqual(f.status, 'EM_SEPARACAO', `status ${f.status}`);
    assert.strictEqual(f.conferido, null, 'a rodada 2 limpou a conferencia');
    assert.strictEqual(f.sep, 3);
    assert.strictEqual(f.rodadas.length, 2);
    assert.ok(f.rodadas.every((r) => Number(r.usuario_id) === USERS.ALMOX.id), 'as duas rodadas sao de ALMOX');
    const cf2 = await conferir('ALMOX2', x.R);
    assert.strictEqual(cf2.status, 200, `conferir: ${cf2.status} ${JSON.stringify(cf2.body)}`);
    afirmarFila(g);
  });

  // ── RN-09 — a trava nao prende quem nao disputa, e solta ──
  await test('[93 RN-09] (a) requisicoes DIFERENTES: no compare-and-clear de R1, a entrega de R2 roda ATE A RESPOSTA (aguardada) — sem deadlock', async () => {
    desarmar();
    const x1 = await montar(); const x2 = await montar();
    assert.strictEqual((await separar('ALMOX', x2.R, x2.item, 4)).status, 200);
    const g = armarAguardando(RE.CAC, () => entregar('ALMOX2', x2.R, x2.item, 4));
    const sep = await comPrazo(separar('ALMOX', x1.R, x1.item, 1), 8000, 'separacao de R1');
    desarmar();
    assert.strictEqual(g.disparos, 1);
    assert.ok(!g.erro, `a entrega de R2 no gancho: ${g.erro && g.erro.message}`);
    assert.strictEqual(g.resposta.status, 200, JSON.stringify(g.resposta.body));
    assert.strictEqual(g.resposta.body.status, 'ENTREGUE');
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
  });

  await test('[93 RN-09] (b) a separacao que LANCA (400, acima do maximo) solta a trava: a seguinte da mesma requisicao roda (200)', async () => {
    desarmar();
    const x = await montar();
    const ruim = await comPrazo(separar('ALMOX', x.R, x.item, 99), 5000, 'separacao acima do maximo');
    assert.strictEqual(ruim.status, 400, JSON.stringify(ruim.body));
    const boa = await comPrazo(separar('ALMOX', x.R, x.item, 1), 5000, 'separacao seguinte (a trava nao soltou?)');
    assert.strictEqual(boa.status, 200, JSON.stringify(boa.body));
    assert.strictEqual(esperandoNa(x.R), 0);
  });

  await test('[93 RN-09] (c) o cancelamento da 92 (fora da trava) na reivindicacao, AGUARDADO: sem deadlock; cancela 200, separacao 400 S1, CANCELADO', async () => {
    desarmar();
    const x = await montar();
    const g = armarAguardando(RE.CLAIM, () => cancelarOutros('S', x.R));
    const sep = await comPrazo(separar('ALMOX', x.R, x.item, 1), 8000, 'separacao');
    desarmar();
    assert.strictEqual(g.disparos, 1);
    assert.ok(!g.erro, `cancelamento no gancho: ${g.erro && g.erro.message}`);
    assert.strictEqual(g.resposta.status, 200, JSON.stringify(g.resposta.body));
    assert.strictEqual(sep.status, 400, JSON.stringify(sep.body));
    assert.strictEqual(sep.body.error, S1);
    assert.strictEqual((await foto(x)).status, 'CANCELADO');
  });

  await test('[93 RN-09] (d) unidade: FIFO na mesma chave (numero e string), esperandoNaRequisicao conta e volta a 0, a chave sai do Map', async () => {
    assert.ok(trava, 'sem modulo');
    const k = 930001; const ordem = [];
    let soltarA;
    const pA = trava.serializarNaRequisicao(k, () => new Promise((r) => { ordem.push('A'); soltarA = r; }));
    const pB = trava.serializarNaRequisicao(String(k), async () => { ordem.push('B'); });
    const pC = trava.serializarNaRequisicao(k, async () => { ordem.push('C'); return 'c'; });
    await new Promise((r) => setTimeout(r, 5));
    assert.deepStrictEqual(ordem, ['A']);
    assert.strictEqual(trava.esperandoNaRequisicao(k), 2, 'B e C esperando');
    assert.strictEqual(trava.esperandoNaRequisicao(930002), 0, 'outra chave: 0');
    assert.ok(trava.requisicoesTravadas().includes(k));
    soltarA('a');
    const [a, , c] = await Promise.all([pA, pB, pC]);
    assert.deepStrictEqual(ordem, ['A', 'B', 'C']);
    assert.strictEqual(a, 'a'); assert.strictEqual(c, 'c');
    assert.strictEqual(trava.esperandoNaRequisicao(k), 0);
    assert.ok(!trava.requisicoesTravadas().includes(k), 'a chave saiu do Map');
    // excecao solta e e relancada
    await assert.rejects(trava.serializarNaRequisicao(k, async () => { throw new Error('x93'); }), /x93/);
    assert.strictEqual(await trava.serializarNaRequisicao(k, async () => 'depois'), 'depois');
    assert.ok(!trava.requisicoesTravadas().includes(k));
  });

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // T1 (B443/B449): liberar para retirada e encerrar seguram a mesma trava, nas rotas.
  const RE_LIB = /SET\s+status\s*=\s*'PRONTA_PARA_RETIRADA'/;
  const liberar = (k, R) => como(k).put(`${API}/requisicoes/${R}/liberar-retirada`);
  const encerrar = (k, R) => como(k).put(`${API}/requisicoes/${R}/encerrar`, {});
  const ordemDe = (acoes, lista) => acoes.filter((a) => lista.includes(a)).join(',');

  // ── RN-02 — liberar x separacao, entrega, exclusao ──
  await test('[93 RN-02] (a) (1b) no compare-and-clear da rodada 2 (EM_SEPARACAO), liberar (ALMOX2) espera: separacao 200; liberar 200 depois; PRONTA_PARA_RETIRADA, trilha SEPARACAO,SEPARACAO,LIBERACAO_RETIRADA', async () => {
    desarmar();
    const x = await montar();
    assert.strictEqual((await separar('ALMOX', x.R, x.item, 2)).status, 200);
    const g = armarFila(RE.CAC, x.R, () => liberar('ALMOX2', x.R));
    const sep = await separar('ALMOX', x.R, x.item, 1);
    await afirmarSerializado(g);
    desarmar();
    assert.strictEqual(sep.status, 200, `separacao: ${sep.status} ${JSON.stringify(sep.body)}`);
    assert.strictEqual(g.resposta.status, 200, `liberar: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    const f = await foto(x);
    assert.strictEqual(f.status, 'PRONTA_PARA_RETIRADA', `status ${f.status} (a liberacao sumiu sob a rodada)`);
    assert.strictEqual(ordemDe(f.acoes, ['SEPARACAO', 'LIBERACAO_RETIRADA']), 'SEPARACAO,SEPARACAO,LIBERACAO_RETIRADA');
    const lib = f.trilha.find((t) => t.acao === 'LIBERACAO_RETIRADA');
    assert.strictEqual(Number(lib.usuario_id), USERS.ALMOX2.id, 'a liberacao e de ALMOX2');
    afirmarFila(g);
  });

  await test('[93 RN-02] (b) (3a) pede 1, separado 1; no UPDATE da liberacao, a entrega de tudo espera: liberar 200; entrega 200 ENTREGUE depois; final ENTREGUE, reserva CONSUMIDA', async () => {
    desarmar();
    const x = await montar({ pede: 1 });
    assert.strictEqual((await separar('ALMOX', x.R, x.item, 1)).status, 200);
    const g = armarFila(RE_LIB, x.R, () => entregar('ALMOX2', x.R, x.item, 1));
    const lib = await liberar('ALMOX', x.R);
    await afirmarSerializado(g);
    desarmar();
    assert.strictEqual(lib.status, 200, `liberar: ${lib.status} ${JSON.stringify(lib.body)}`);
    assert.strictEqual(g.resposta.status, 200, `entrega: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    assert.strictEqual(g.resposta.body.status, 'ENTREGUE');
    const f = await foto(x);
    assert.strictEqual(f.status, 'ENTREGUE', `status ${f.status} (presa em PRONTA com tudo entregue)`);
    assert.strictEqual(f.reserva, 'CONSUMIDA');
    afirmarFila(g);
  });

  await test('[93 RN-02] (c) (3b) no UPDATE da liberacao, a exclusao espera: liberar 200; exclusao 200 depois; CANCELADO, ativo=0', async () => {
    desarmar();
    const x = await montar();
    assert.strictEqual((await separar('ALMOX', x.R, x.item, 2)).status, 200);
    const g = armarFila(RE_LIB, x.R, () => excluir('ADMIN', x.R));
    const lib = await liberar('ALMOX', x.R);
    await afirmarSerializado(g);
    desarmar();
    assert.strictEqual(lib.status, 200, `liberar: ${lib.status} ${JSON.stringify(lib.body)}`);
    assert.strictEqual(g.resposta.status, 200, `exclusao: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    const f = await foto(x);
    assert.strictEqual(f.status, 'CANCELADO', `status ${f.status} ativo ${f.ativo}`);
    assert.strictEqual(f.ativo, 0);
    assert.strictEqual(ordemDe(f.acoes, ['LIBERACAO_RETIRADA', 'EXCLUSAO']), 'LIBERACAO_RETIRADA,EXCLUSAO');
    afirmarFila(g);
  });

  await test('[93 RN-02] (d) (3c) critico: rodada 1 de ALMOX conferida por ALMOX2; no UPDATE da liberacao, a rodada 2 espera: liberar 200; separacao 400 S1; PRONTA, conferido ALMOX2, separado 1, 1 rodada', async () => {
    desarmar();
    const x = await montar({ critico: true });
    assert.strictEqual((await separar('ALMOX', x.R, x.item, 1)).status, 200);
    const cf = await conferir('ALMOX2', x.R);
    assert.strictEqual(cf.status, 200, JSON.stringify(cf.body));
    const g = armarFila(RE_LIB, x.R, () => separar('ALMOX', x.R, x.item, 1));
    const lib = await liberar('ALMOX2', x.R);
    await afirmarSerializado(g);
    desarmar();
    assert.strictEqual(lib.status, 200, `liberar: ${lib.status} ${JSON.stringify(lib.body)}`);
    assert.strictEqual(g.resposta.status, 400, `rodada 2: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    assert.strictEqual(g.resposta.body.error, S1);
    const f = await foto(x);
    assert.strictEqual(f.status, 'PRONTA_PARA_RETIRADA');
    assert.strictEqual(Number(f.conferido), USERS.ALMOX2.id, `conferido_por_id ${f.conferido} (rodada nao conferida liberada)`);
    assert.strictEqual(f.sep, 1);
    assert.strictEqual(f.rodadas.length, 1);
    afirmarFila(g);
  });

  // ── RN-07 (b) — entrega x encerrar (7a, C160) ──
  await test('[93 RN-07] (b) (7a) de PARCIALMENTE_ATENDIDA, no UPDATE final da entrega (1), encerrar (ADMIN) espera: entrega 200; encerrar 200 depois; ENCERRADA, reserva LIBERADA', async () => {
    desarmar();
    const x = await montar();
    assert.strictEqual((await separar('ALMOX', x.R, x.item, 4)).status, 200);
    const e0 = await entregar('ALMOX', x.R, x.item, 1);
    assert.strictEqual(e0.body.status, 'PARCIALMENTE_ATENDIDA', JSON.stringify(e0.body));
    const g = armarFila(RE.ENT, x.R, () => encerrar('ADMIN', x.R));
    const ent = await entregar('ALMOX', x.R, x.item, 1);
    await afirmarSerializado(g);
    desarmar();
    assert.strictEqual(ent.status, 200, `entrega: ${ent.status} ${JSON.stringify(ent.body)}`);
    assert.strictEqual(g.resposta.status, 200, `encerrar: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    const f = await foto(x);
    assert.strictEqual(f.status, 'ENCERRADA', `status ${f.status} (a encerrada voltou a aberta)`);
    assert.strictEqual(f.reserva, 'LIBERADA');
    assert.strictEqual(f.ent, 2);
    const enc = f.trilha.find((t) => t.acao === 'ENCERRAMENTO');
    assert.ok(enc, 'trilha ENCERRAMENTO'); assert.strictEqual(Number(enc.usuario_id), USERS.ADMIN.id);
    afirmarFila(g);
  });

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // RN-08 (T2..T5): cada porta confere o status lido. Escritor FORA da trava, simulado por SQL direto no
  // gancho (aguardavel: nao pega trava) — com a trava, nenhum gesto alcanca estes caminhos.
  // `armarEscritor(re, escrever, vezes)`: nas `vezes` primeiras emissoes do SQL que casa `re`, roda
  // `escrever()` (SQL direto, sem passar pelo gancho) e so entao emite o comando retido. `g.emitidos` conta
  // TODAS as emissoes que casam, `g.sqls` guarda o texto.
  const raw = (sql, params = []) => new Promise((ok, ko) => origRun(sql, params, function (e) { return e ? ko(e) : ok(this); }));
  const armarEscritor = (re, escrever, vezes = 1) => {
    const g = { re, escrever, escritor: true, vezes, disparos: 0, emitidos: 0, sqls: [] };
    ganchos.push(g); return g;
  };
  // (o laco do gancho acima so conhece `armado`; o escritor tem o seu proprio despacho)
  const runComGancho = db.run;
  db.run = function (sql, ...rest) {
    const s = String(sql);
    for (const g of ganchos) {
      if (g.escritor && g.re.test(s)) {
        g.emitidos++; g.sqls.push(s);
        if (g.disparos < g.vezes) {
          g.disparos++;
          const n = g.disparos;
          Promise.resolve().then(() => g.escrever(n)).catch((e) => { g.erro = e; })
            .then(() => origRun(sql, ...rest));
          return this;
        }
      }
    }
    return runComGancho.call(this, sql, ...rest);
  };
  const capturar = (nivel) => {
    const orig = console[nivel]; const linhas = [];
    console[nivel] = (...a) => { linhas.push(a.map(String).join(' ')); };
    return { linhas, restaurar: () => { console[nivel] = orig; } };
  };
  const trilhaDe = (R, acao) => dbAll(db, `SELECT usuario_id, dados_anteriores, dados_novos FROM auditoria_log_almoxarifado
    WHERE entidade = 'requisicao' AND entidade_id = ? AND acao = ? ORDER BY id`, [R, acao]);

  // ── RN-08 (a)(a') — o compare-and-clear da separacao (T2, B444) ──
  const X1 = (st) => `A requisição mudou de status durante a separação (agora ${st}); a rodada ficou registrada — confira a caixa antes de separar de novo.`;
  const W3 = (R, st, rod) => `[almoxarifado-separacao] Requisicao ${R}: saiu de EM_SEPARACAO (agora ${st}) depois da rodada ${rod}; conferencia limpa, status nao regravado`;

  await test('[93 RN-08] (a) separacao: no compare-and-clear um escritor fora da trava poe PRONTA_PARA_RETIRADA -> 409 X1; rodada e separado gravados; status NAO regravado; conferencia limpa; trilha SEPARACAO da rodada; W3 1 vez; CAC emitido 1 vez com AND status', async () => {
    desarmar();
    const x = await montar({ critico: true });
    // rodada 1 (ALMOX) conferida por ALMOX2: ha conferencia previa a limpar
    assert.strictEqual((await separar('ALMOX', x.R, x.item, 1)).status, 200);
    const cf = await conferir('ALMOX2', x.R);
    assert.strictEqual(cf.status, 200, JSON.stringify(cf.body));
    assert.strictEqual(Number((await foto(x)).conferido), USERS.ALMOX2.id, 'premissa: conferida');
    const g = armarEscritor(RE.CAC, () => raw("UPDATE requisicoes_almoxarifado SET status = 'PRONTA_PARA_RETIRADA' WHERE id = ?", [x.R]));
    const w = capturar('warn');
    let sep;
    try { sep = await comPrazo(separar('ALMOX', x.R, x.item, 1), 8000, 'separacao'); } finally { w.restaurar(); desarmar(); }
    assert.ok(!g.erro, g.erro && g.erro.message);
    assert.strictEqual(g.disparos, 1, `o escritor disparou ${g.disparos} vez(es)`);
    assert.strictEqual(sep.status, 409, `separacao: ${sep.status} ${JSON.stringify(sep.body)}`);
    assert.strictEqual(sep.body.error, X1('PRONTA_PARA_RETIRADA'));
    const f = await foto(x);
    assert.strictEqual(f.rodadas.length, 2, 'a rodada 2 ficou gravada (append-only)');
    assert.strictEqual(Number(f.rodadas[1].usuario_id), USERS.ALMOX.id);
    assert.strictEqual(f.sep, 2, 'quantidade_separada gravada');
    assert.strictEqual(f.status, 'PRONTA_PARA_RETIRADA', `status ${f.status} (o compare-and-clear regravou EM_SEPARACAO)`);
    assert.strictEqual(f.conferido, null, `conferido_por_id ${f.conferido} (a conferencia da rodada velha ficou)`);
    const ts = await trilhaDe(x.R, 'SEPARACAO');
    assert.strictEqual(ts.length, 2, `trilha SEPARACAO ${ts.length}`);
    assert.strictEqual(JSON.parse(ts[1].dados_novos).rodada_id, f.rodadas[1].id, 'a trilha e da rodada 2');
    const w3 = w.linhas.filter((l) => l === W3(x.R, 'PRONTA_PARA_RETIRADA', f.rodadas[1].id));
    assert.strictEqual(w3.length, 1, `W3 ${w3.length} vez(es): ${JSON.stringify(w.linhas)}`);
    assert.strictEqual(g.emitidos, 1, `CAC emitido ${g.emitidos} vez(es)`);
    assert.ok(/conferido_por_id\s+IS\s+\?\s+AND\s+status\s*=\s*'EM_SEPARACAO'/.test(g.sqls[0]), `o CAC sem AND status: ${g.sqls[0]}`);
  });

  await test("[93 RN-08] (a') separacao: no compare-and-clear o escritor so troca a CONFERENCIA (status continua EM_SEPARACAO) -> o laco de hoje: 200, conferencia anterior em dados_anteriores, limpa", async () => {
    desarmar();
    const x = await montar();
    assert.strictEqual((await separar('ALMOX', x.R, x.item, 1)).status, 200);
    const g = armarEscritor(RE.CAC, () => raw(`UPDATE requisicoes_almoxarifado SET conferido_por_id = ?, conferido_por_nome = ?,
      conferido_em = CURRENT_TIMESTAMP WHERE id = ?`, [USERS.ALMOX2.id, USERS.ALMOX2.nome, x.R]));
    const sep = await comPrazo(separar('ALMOX', x.R, x.item, 1), 8000, 'separacao');
    desarmar();
    assert.ok(!g.erro, g.erro && g.erro.message);
    assert.strictEqual(g.disparos, 1);
    assert.strictEqual(sep.status, 200, `separacao: ${sep.status} ${JSON.stringify(sep.body)}`);
    assert.strictEqual(sep.body.status, 'EM_SEPARACAO');
    assert.strictEqual(g.emitidos, 2, `CAC emitido ${g.emitidos} vez(es) — perdeu pela conferencia, releu e limpou`);
    const f = await foto(x);
    assert.strictEqual(f.status, 'EM_SEPARACAO');
    assert.strictEqual(f.conferido, null);
    const ts = await trilhaDe(x.R, 'SEPARACAO');
    assert.strictEqual(ts.length, 2);
    const ant = JSON.parse(ts[1].dados_anteriores || 'null');
    assert.ok(ant && ant.conferencia, `dados_anteriores ${ts[1].dados_anteriores}`);
    assert.strictEqual(Number(ant.conferencia.usuario_id), USERS.ALMOX2.id);
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
