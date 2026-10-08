/**
 * Etapa 91 (Fase 5 — revisao adversarial): os achados reproduzidos e as mutacoes que sobreviviam a suite.
 *
 * F1 — `comTravaDaRequisicao` lia os materiais da requisicao ANTES de pegar a trava. Um `/aprovar` que caia
 *      no meio da criacao (cabecalho e 1o item gravados, 2o item ainda nao) travava so o 1o material e
 *      `prepararPosAprovacao` reservava o 2o — gravado nesse meio-tempo — SEM a trava dele (sonda91f-c-bordas
 *      SO=1). Conserto: relê o conjunto DENTRO da trava; se cresceu, solta e tenta de novo com o novo conjunto
 *      (limitado).
 * Mutacoes sobreviventes da Fase 5 (cada uma deixava a suite inteira verde):
 *  (a1) o UPDATE guardado da aprovacao AUTOMATICA fora da trava (o RN-05 (f) da T1 so prendia o `/aprovar`);
 *  (a2) o `desfazerReservas` da automatica que perde, fora da trava;
 *  (b)  o UPDATE guardado do `/aprovar-valor` fora da trava;
 *  (c)  o `desfazerReservas` do `/aprovar` que perde, fora da trava;
 *  (d)  a recusa D(77) restrita a alguns tipos (o teste da T4 so passava ENTRADA/AJUSTE/DEVOLUCAO/TRANSFERENCIA);
 *  (e)  a chave da trava sem `Number()` ('5' e 5 seriam duas travas).
 * O dano de (a2)/(c): uma segunda aprovacao do mesmo material que esperava a trava entra assim que ela solta
 * e le o disponivel ANTES de o perdedor devolver a reserva -> fica AGUARDANDO_ESTOQUE e os 4 devolvidos
 * ficam parados (um C135 por corrida).
 *
 * Tecnica (a mesma da T1/T2): usuario por requisicao (middleware logo depois do jsonParser), portao
 * LIMITADO (400 ms) e `abriuPor` — na versao certa a porta concorrente espera a trava e o portao abre pelo
 * PRAZO; `comPrazo` (5 s) em tudo que pode travar.
 *
 * Plano: docs/superpowers/plans/2026-10-08-almoxarifado-etapa91-inversao-inspecao-aprovar.md (Fase 5).
 * Executar: cd server && node tests/api/travaRevisaoFase5.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const trava = require('../../services/almoxarifado/travaPorMaterial');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const stockService = require('../../services/almoxarifado/stockService');
const movementTypes = require('../../services/almoxarifado/movementTypes');
const { TIPOS_MOVIMENTO } = require('../../services/almoxarifado/schema');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 91f5', role: 'admin', is_superadmin: 1, email: 'a91f5@t.com' },
  GESTOR: { id: 9151, nome: 'Gestor 91f5', perfil_almoxarifado: 'GESTOR', email: 'g91f5@t.com' },
  APRV: { id: 9152, nome: 'Aprovador valor 91f5', perfil_almoxarifado: 'GESTOR', email: 'v91f5@t.com' },
  SOL: { id: 9153, nome: 'Solicitante 91f5', email: 's91f5@t.com' }, // sem perfil: fallback PRODUCAO
  QUAL: { id: 9154, nome: 'Qualidade 91f5', perfil_almoxarifado: 'QUALIDADE', email: 'q91f5@t.com' },
  ALMOX: { id: 9155, nome: 'Almox 91f5', perfil_almoxarifado: 'ALMOXARIFE', email: 'x91f5@t.com' },
};
const API = '/api/almoxarifado';
let seq = 0;

function comPrazo(p, ms, rotulo) {
  let t;
  const limite = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`${rotulo} não respondeu em ${ms / 1000} s — trava presa?`)), ms);
  });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}
function estadoEm(p, ms) {
  let t;
  const pend = new Promise((r) => { t = setTimeout(() => r('pendente'), ms); });
  return Promise.race([p.then(() => 'resolveu', () => 'rejeitou'), pend]).finally(() => clearTimeout(t));
}
function segurar(m) {
  let soltar; let pegou;
  const dentro = new Promise((r) => { pegou = r; });
  const fim = trava.comLockDoMaterial(m, () => new Promise((r) => { soltar = r; pegou(); }));
  return { dentro, fim, soltar: () => soltar() };
}
/** Portao limitado: abre quando `p` resolver ('<rotulo>') ou em 400 ms ('prazo'), o que vier primeiro. */
function portaoLimitado(p, rotulo) {
  let t;
  const prazo = new Promise((r) => { t = setTimeout(() => r('prazo'), 400); });
  return Promise.race([p.then(() => rotulo, () => rotulo), prazo]).finally(() => clearTimeout(t));
}

(async () => {
  console.log('\n=== Etapa 91 (Fase 5): achados reproduzidos e mutacoes sobreviventes ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; if (k && USERS[k]) setUser({ ...USERS[k] }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    post: (u, body = {}) => request(app).post(u).set('x-teste-usuario', k).send(body).then((x) => x),
    put: (u, body = {}) => request(app).put(u).set('x-teste-usuario', k).send(body).then((x) => x),
  });

  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const u of Object.values(USERS)) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [u.id, u.nome, u.email]);
  }
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('F91F5','91000000000555','ativo')")).lastID;
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');
  await cfg('inspecao_material_critico', '0');

  const material = async ({ custo = 1, critico = 0 } = {}) => {
    const c = `E91F5-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', 0, 0, ?, 1, ?, ?)`, [c, `Mat ${c}`, custo, forn, critico])).lastID;
  };
  const sobe = (m, q) => dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = quantidade_atual + ? WHERE id = ?', [q, m]);
  const criar = async (itens) => {
    const r = await como('SOL').post(`${API}/requisicoes`,
      { os_referencia: 'OS-91F5', itens: itens.map(([material_id, quantidade]) => ({ material_id, quantidade })) });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  /** Requisicao gravada direto no banco (o estado "no meio da criacao" ou uma fila montada). */
  const reqDireta = async (status, itens, criado = '2026-09-02 10:00:00') => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo, os_referencia)
      VALUES (?, ?, 'Sol 91f5', ?, 'NORMAL', ?, 1, 'OS-91F5')`, [`REQ-E91F5-${++seq}`, USERS.SOL.id, status, criado])).lastID;
    for (const [m, q] of itens) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [id, m, q]);
    }
    return id;
  };
  const criarNota = async (m, q) => {
    const rec = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F91F5', '2026-09-01', '2026-09-02', 10)`, [`REC-E91F5-${++seq}`, `NF-E91F5-${seq}`])).lastID;
    const item = (await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`, [rec, m, q, q])).lastID;
    return { rec, item };
  };
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const holdDe = async (id, m) => (await dbAll(db, `SELECT quantidade - COALESCE(quantidade_utilizada,0) s
    FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA' ${m ? 'AND material_id = ?' : ''}`,
  m ? [id, m] : [id])).reduce((a, x) => a + Number(x.s), 0);
  const mat = async (m) => {
    const x = await dbGet(db, `SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r, COALESCE(quantidade_em_inspecao,0) i
      FROM materiais_almoxarifado WHERE id = ?`, [m]);
    return [Number(x.q), Number(x.r), Number(x.i)];
  };

  /** Material critico com 4 retidos para inspecao por uma nota processada pela rota. */
  const quatroEmInspecao = async (opts = {}) => {
    const m = await material({ ...opts, critico: 1 });
    const { rec, item } = await criarNota(m, 4);
    const pn = await como('ALMOX').post(`${API}/recebimentos/${rec}/processar`);
    assert.strictEqual(pn.status, 200, JSON.stringify(pn.body));
    assert.deepStrictEqual(await mat(m), [4, 0, 4], 'premissa: 4 retidos para inspecao');
    return { m, item };
  };

  // ══════════════ F1 — o /aprovar no meio da criacao da requisicao ══════════════
  await test('[91 F5-F1] /aprovar no meio da criacao (2o item gravado depois da leitura dos materiais): espera tambem a trava do 2o material e reserva os dois', async () => {
    const A = await material(); const B = await material();
    await sobe(A, 4); await sobe(B, 4);
    const hB = segurar(B); // "uma liberacao de B em andamento"
    await comPrazo(hB.dentro, 5000, 'segurar B');
    const R = await reqDireta('PENDENTE', [[A, 4]]); // cabecalho e 1o item gravados; o 2o ainda nao
    // Na PRIMEIRA leitura dos materiais de R, o 2o item (B) e gravado antes de a leitura voltar a quem pediu:
    // o /aprovar fica com {A} na mao e B ja existe na requisicao.
    const origAll = db.all;
    let leituras = 0;
    db.all = function (sql, params, cb) {
      if (/SELECT DISTINCT material_id FROM itens_requisicao_almoxarifado/.test(String(sql)) && Array.isArray(params)
        && Number(params[0]) === R && leituras++ === 0) {
        return origAll.call(db, sql, params, (err, rows) => {
          db.run(`INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
            quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, B, 4], () => cb(err, rows));
        });
      }
      return origAll.call(this, sql, params, cb);
    };
    let p; let estado; let holdBPreso;
    try {
      p = como('GESTOR').put(`${API}/requisicoes/${R}/aprovar`);
      estado = await estadoEm(p, 400);
      holdBPreso = await holdDe(R, B);
    } finally {
      db.all = origAll;
      hB.soltar();
    }
    const r = await comPrazo(p, 5000, '/aprovar');
    await comPrazo(hB.fim, 5000, 'trava do teste');
    assert.ok(leituras >= 1, 'o gancho da leitura dos materiais nao disparou');
    assert.strictEqual(holdBPreso, 0, 'reservou B com a trava de B presa por outro');
    assert.strictEqual(estado, 'pendente', `o /aprovar respondeu com a trava de B presa: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.status, 'TOTALMENTE_RESERVADA', JSON.stringify(r.body));
    assert.strictEqual(await holdDe(R, A), 4);
    assert.strictEqual(await holdDe(R, B), 4);
    assert.strictEqual(trava.travado(A), false);
    assert.strictEqual(trava.travado(B), false);
  });

  /** Grava itens novos em R no instante em que a aprovacao, JA DENTRO da trava de A, le os itens a reservar. */
  const ITENS_SQL = /JOIN materiais_almoxarifado ma ON ir\.material_id = ma\.id\s+WHERE ir\.requisicao_id = \?/;
  function itemChegaNaLeitura(R, A, novos) {
    const origAll = db.all;
    const reg = { disparos: 0, dentroDaTrava: [] };
    db.all = function (sql, params, cb) {
      if (ITENS_SQL.test(String(sql)) && Array.isArray(params) && Number(params[0]) === R && novos.length > 0) {
        reg.disparos += 1;
        reg.dentroDaTrava.push(trava.travado(A)); // so a secao da aprovacao segura A
        const m = novos.shift();
        return db.run(`INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
          quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m, 4],
        () => origAll.call(db, sql, params, cb));
      }
      return origAll.call(this, sql, params, cb);
    };
    reg.restaurar = () => { db.all = origAll; };
    return reg;
  }

  await test('[91 F5-F1 (b)] o 2o item chega DEPOIS de a aprovacao pegar a trava e antes de ler os itens a reservar: ainda assim espera a trava do 2o material', async () => {
    const A = await material(); const B = await material();
    await sobe(A, 4); await sobe(B, 4);
    const hB = segurar(B);
    await comPrazo(hB.dentro, 5000, 'segurar B');
    const R = await reqDireta('PENDENTE', [[A, 4]]);
    const reg = itemChegaNaLeitura(R, A, [B]);
    let p; let estado; let holdBPreso;
    try {
      p = como('GESTOR').put(`${API}/requisicoes/${R}/aprovar`);
      estado = await estadoEm(p, 400);
      holdBPreso = await holdDe(R, B);
    } finally {
      reg.restaurar();
      hB.soltar();
    }
    const r = await comPrazo(p, 5000, '/aprovar');
    await comPrazo(hB.fim, 5000, 'trava do teste');
    assert.ok(reg.disparos >= 1 && reg.dentroDaTrava[0] === true, `o gancho tem de disparar dentro da secao: ${JSON.stringify(reg)}`);
    assert.strictEqual(holdBPreso, 0, 'reservou B com a trava de B presa por outro');
    assert.strictEqual(estado, 'pendente', `o /aprovar respondeu com a trava de B presa: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.status, 'TOTALMENTE_RESERVADA', JSON.stringify(r.body));
    assert.strictEqual(await holdDe(R, A), 4);
    assert.strictEqual(await holdDe(R, B), 4);
    assert.strictEqual(trava.travado(A), false);
    assert.strictEqual(trava.travado(B), false);
  });

  await test('[91 F5-F1 (c)] a requisicao ganha material novo a CADA tentativa: 409 com a literal, nada reservado, R continua PENDENTE, nenhuma trava sobrando', async () => {
    const A = await material(); await sobe(A, 4);
    const novos = [];
    for (let i = 0; i < 8; i++) {
      // eslint-disable-next-line no-await-in-loop
      const m = await material(); await sobe(m, 4); novos.push(m);
    }
    const todos = [A, ...novos];
    const R = await reqDireta('PENDENTE', [[A, 4]]);
    const reg = itemChegaNaLeitura(R, A, novos);
    let r;
    try {
      r = await comPrazo(como('GESTOR').put(`${API}/requisicoes/${R}/aprovar`), 5000, '/aprovar');
    } finally { reg.restaurar(); }
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'A requisição ganhou itens enquanto era aprovada (ainda está sendo gravada); tente aprovar de novo.');
    assert.ok(reg.disparos >= 3, `tres tentativas leem os itens: ${reg.disparos}`);
    assert.strictEqual(await holdDe(R), 0, 'reservou algo');
    assert.strictEqual(await st(R), 'PENDENTE');
    for (const m of todos) assert.strictEqual(trava.travado(m), false, `material ${m} ficou travado`);
  });

  // ══════════════ (a1) aprovacao automatica: o UPDATE guardado fica dentro ══════════════
  await test('[91 F5 RN-05 (f) automatica] POST /requisicoes com aprovacao automatica: com a EMISSAO do UPDATE guardado segura, a inspecao espera; R ja AGUARDANDO_ESTOQUE quando ela distribui e leva 4', async () => {
    await cfg('inspecao_material_critico', '1');
    try {
      const { m, item } = await quatroEmInspecao();
      await cfg('aprovacao_automatica', '1');
      const origRun = db.run;
      let disparos = 0; let abriuPor = null; let pInsp = null;
      db.run = function (sql, params, cb) {
        if (disparos === 0 && /aprovador_nome='Sistema \(autom/.test(String(sql))) {
          disparos += 1;
          pInsp = como('QUAL').post(`${API}/recebimentos/itens/${item}/inspecionar`, { quantidade_aprovada: 4, quantidade_reprovada: 0 });
          portaoLimitado(pInsp, 'inspecao').then((por) => { abriuPor = por; origRun.call(db, sql, params, cb); });
          return this;
        }
        return origRun.call(this, sql, params, cb);
      };
      let ra;
      try {
        ra = await comPrazo(como('SOL').post(`${API}/requisicoes`, { os_referencia: 'OS-91F5', itens: [{ material_id: m, quantidade: 4 }] }), 5000, 'POST /requisicoes');
      } finally { db.run = origRun; await cfg('aprovacao_automatica', '0'); }
      const ri = await comPrazo(pInsp || Promise.reject(new Error('o gatilho nao disparou')), 5000, 'inspecao');
      assert.strictEqual(disparos, 1);
      assert.strictEqual(ra.status, 201, JSON.stringify(ra.body));
      assert.strictEqual(ri.status, 201, JSON.stringify(ri.body));
      assert.strictEqual(abriuPor, 'prazo', 'o portao abriu porque a inspecao respondeu: ela nao esperou a trava da aprovacao automatica');
      assert.strictEqual(await holdDe(ra.body.id), 4, 'R ainda PENDENTE quando a inspecao distribuiu: os 4 ficaram parados');
      assert.strictEqual(await st(ra.body.id), 'TOTALMENTE_RESERVADA');
      assert.deepStrictEqual(await mat(m), [4, 4, 0]);
      assert.strictEqual(trava.travado(m), false);
    } finally { await cfg('inspecao_material_critico', '0'); }
  });

  /**
   * (a2)/(c): R perde o UPDATE guardado (cancelada no instante da emissao) e desfaz a propria reserva. No
   * instante em que o desfazer comeca, R2 (do mesmo material) e aprovada. Certo: R2 espera a trava, o
   * portao abre pelo PRAZO, o desfazer devolve os 4 e R2 os leva. Com o desfazer fora da trava, R2 entra
   * antes da devolucao, le disponivel 0 e fica AGUARDANDO_ESTOQUE com os 4 parados.
   */
  async function perdedorDesfazDentro({ reSql, idDe, disparaPerdedor, afirmaPerdedor }) {
    const m = await material(); await sobe(m, 4);
    const R2 = await reqDireta('PENDENTE', [[m, 4]], '2026-09-02 11:00:00');
    const ctx = { m, R2, pR2: null, abriuPor: null, idPerdedor: null };
    const origRun = db.run;
    let cancelou = false;
    db.run = function (sql, params, cb) {
      if (!cancelou && reSql.test(String(sql)) && Array.isArray(params)) {
        cancelou = true;
        ctx.idPerdedor = idDe(params);
        return origRun.call(db, "UPDATE requisicoes_almoxarifado SET status = 'CANCELADO' WHERE id = ?", [ctx.idPerdedor],
          () => origRun.call(db, sql, params, cb));
      }
      return origRun.call(this, sql, params, cb);
    };
    const origDesfazer = requisitionService.desfazerReservas;
    requisitionService.desfazerReservas = async (...a) => {
      if (!ctx.pR2) {
        ctx.pR2 = como('GESTOR').put(`${API}/requisicoes/${R2}/aprovar`);
        ctx.abriuPor = await portaoLimitado(ctx.pR2, 'aprovacao');
      }
      return origDesfazer(...a);
    };
    let rP;
    try {
      rP = await comPrazo(disparaPerdedor(m), 5000, 'o perdedor');
    } finally {
      db.run = origRun;
      requisitionService.desfazerReservas = origDesfazer;
    }
    const r2 = await comPrazo(ctx.pR2 || Promise.reject(new Error('o desfazer do perdedor nao rodou')), 5000, 'R2');
    afirmaPerdedor(rP, ctx);
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.body));
    assert.strictEqual(ctx.abriuPor, 'prazo', `R2 respondeu antes de o perdedor devolver a reserva (${r2.body.status}): o desfazer rodou fora da trava`);
    assert.strictEqual(r2.body.status, 'TOTALMENTE_RESERVADA', JSON.stringify(r2.body));
    assert.strictEqual(await holdDe(R2), 4);
    assert.strictEqual(await holdDe(ctx.idPerdedor), 0, 'o perdedor ficou com reserva');
    assert.deepStrictEqual(await mat(m), [4, 4, 0]);
    assert.strictEqual(trava.travado(m), false);
  }

  // ══════════════ (a2) aprovacao automatica que perde: o desfazer fica dentro ══════════════
  await test('[91 F5 RN-05 (g) automatica] a aprovacao automatica que perde o UPDATE desfaz a reserva DENTRO da trava: a aprovacao concorrente do mesmo material espera e leva os 4', async () => {
    await cfg('aprovacao_automatica', '1');
    try {
      await perdedorDesfazDentro({
        reSql: /aprovador_nome='Sistema \(autom/,
        idDe: (params) => Number(params[1]),
        disparaPerdedor: (m) => como('SOL').post(`${API}/requisicoes`, { os_referencia: 'OS-91F5', itens: [{ material_id: m, quantidade: 4 }] }),
        afirmaPerdedor: (rP, ctx) => {
          assert.strictEqual(rP.status, 201, JSON.stringify(rP.body));
          assert.strictEqual(rP.body.id, ctx.idPerdedor);
        },
      });
    } finally { await cfg('aprovacao_automatica', '0'); }
  });

  // ══════════════ (c) /aprovar que perde: o desfazer fica dentro ══════════════
  await test('[91 F5 RN-05 (g) desfazer] o /aprovar que perde o UPDATE desfaz a reserva DENTRO da trava: 400 de hoje, e a aprovacao concorrente do mesmo material espera e leva os 4', async () => {
    let R;
    await perdedorDesfazDentro({
      reSql: /UPDATE requisicoes_almoxarifado SET status=\?,\s*aprovador_id=\?/,
      idDe: (params) => Number(params[3]),
      disparaPerdedor: async (m) => {
        R = await reqDireta('PENDENTE', [[m, 4]], '2026-09-02 10:00:00');
        return como('GESTOR').put(`${API}/requisicoes/${R}/aprovar`);
      },
      afirmaPerdedor: (rP, ctx) => {
        assert.strictEqual(ctx.idPerdedor, R, 'o UPDATE cancelado era o de R (R2 so aprova depois)');
        assert.strictEqual(rP.status, 400, JSON.stringify(rP.body));
        assert.strictEqual(rP.body.error, 'Transição inválida: CANCELADO → APROVADO');
      },
    });
  });

  // ══════════════ (b) /aprovar-valor: o UPDATE guardado fica dentro ══════════════
  await test('[91 F5 RN-05 (f) valor] /aprovar-valor: com a EMISSAO do UPDATE guardado segura, a inspecao espera a trava; R sai TOTALMENTE_RESERVADA com os 4', async () => {
    await cfg('inspecao_material_critico', '1');
    await cfg('liberacao_valor_ativo', '1');
    await cfg('liberacao_valor_limite', '100');
    await cfg('liberacao_valor_aprovadores', JSON.stringify([USERS.APRV.id]));
    try {
      const { m, item } = await quatroEmInspecao({ custo: 100 });
      const R = await criar([[m, 4]]);
      assert.strictEqual(R.status, 'AGUARDANDO_APROVACAO_VALOR', `premissa: valor alto ${JSON.stringify(R)}`);
      const origRun = db.run;
      let disparos = 0; let abriuPor = null; let pInsp = null;
      db.run = function (sql, params, cb) {
        if (disparos === 0 && /UPDATE requisicoes_almoxarifado SET status=\?, updated_at=CURRENT_TIMESTAMP WHERE id=\? AND status='APROVADO'/.test(String(sql))
          && Array.isArray(params) && Number(params[1]) === R.id) {
          disparos += 1;
          pInsp = como('QUAL').post(`${API}/recebimentos/itens/${item}/inspecionar`, { quantidade_aprovada: 4, quantidade_reprovada: 0 });
          portaoLimitado(pInsp, 'inspecao').then((por) => { abriuPor = por; origRun.call(db, sql, params, cb); });
          return this;
        }
        return origRun.call(this, sql, params, cb);
      };
      let rv;
      try {
        rv = await comPrazo(como('APRV').put(`${API}/requisicoes/${R.id}/aprovar-valor`), 5000, '/aprovar-valor');
      } finally { db.run = origRun; }
      const ri = await comPrazo(pInsp || Promise.reject(new Error('o gatilho nao disparou')), 5000, 'inspecao');
      assert.strictEqual(disparos, 1);
      assert.strictEqual(rv.status, 200, JSON.stringify(rv.body));
      assert.strictEqual(ri.status, 201, JSON.stringify(ri.body));
      assert.strictEqual(abriuPor, 'prazo', 'o portao abriu porque a inspecao respondeu: ela nao esperou a trava do /aprovar-valor');
      assert.strictEqual(await st(R.id), 'TOTALMENTE_RESERVADA');
      assert.strictEqual(await holdDe(R.id), 4);
      assert.deepStrictEqual(await mat(m), [4, 4, 0]);
      assert.strictEqual(trava.travado(m), false);
    } finally {
      await cfg('liberacao_valor_ativo', '0');
      await cfg('inspecao_material_critico', '0');
    }
  });

  // ══════════════ (d) D(77): todo tipo que nao e saida, pelo servico ══════════════
  await test('[91 F5 RN-11 todos os tipos] pelo servico, TODO tipo fora de TIPOS_SAIDA (exceto RESERVA/LIBERACAO_RESERVA) com reserva_id -> 400 M1, nada muda; nenhum tipo de saida recebe M1', async () => {
    const m = await material(); await sobe(m, 10);
    const rv = (await dbRun(db, `INSERT INTO reservas_material_almoxarifado (material_id, quantidade, quantidade_utilizada, status, origem, solicitante_id)
      VALUES (?, 2, 0, 'ATIVA', 'MANUAL', ?)`, [m, USERS.ALMOX.id])).lastID;
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = 2 WHERE id = ?', [m]);
    const M1 = (tipo) => `reserva_id só vale numa saída que consome a reserva — o tipo ${tipo} não consome reserva; tire o reserva_id do movimento`;
    const livro = async () => (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ?', [m])).n;
    const foto = async () => JSON.stringify([await mat(m), await livro(), await dbGet(db, 'SELECT status, quantidade, quantidade_utilizada FROM reservas_material_almoxarifado WHERE id = ?', [rv])]);
    const naoSaida = TIPOS_MOVIMENTO.filter((t) => !movementTypes.TIPOS_SAIDA.includes(t)
      && !['RESERVA', 'LIBERACAO_RESERVA', 'ESTORNO'].includes(t));
    assert.ok(naoSaida.length >= 15, `premissa: a lista de tipos nao saida tem ${naoSaida.length}`);
    const antes = await foto();
    const errados = [];
    for (const tipo of naoSaida) {
      let erro = null;
      try {
        // eslint-disable-next-line no-await-in-loop
        await stockService.registrarMovimentacao(db, { ...USERS.ALMOX }, {
          material_id: m, tipo, quantidade: 1, reserva_id: rv, motivo: 'teste 91f5', justificativa: 'teste 91f5', recebimento_id: 1,
        });
      } catch (e) { erro = e; }
      if (!erro || erro.status !== 400 || erro.message !== M1(tipo)) errados.push(`${tipo}: ${erro ? `${erro.status} ${erro.message}` : 'ACEITOU'}`);
    }
    assert.deepStrictEqual(errados, [], `tipos sem a recusa M1: ${errados.join(' | ')}`);
    assert.strictEqual(await foto(), antes, 'algum tipo recusado mexeu no material, no livro ou na reserva');
    // a metade de la: nenhum tipo de SAIDA recebe a M1 (pode falhar por outra regra, nunca por esta)
    for (const tipo of movementTypes.TIPOS_SAIDA) {
      let msg = '';
      try {
        // eslint-disable-next-line no-await-in-loop
        await stockService.registrarMovimentacao(db, { ...USERS.ALMOX }, {
          material_id: m, tipo, quantidade: 1, reserva_id: rv, motivo: 'teste 91f5', justificativa: 'teste 91f5',
        });
      } catch (e) { msg = e.message; }
      assert.ok(!msg.startsWith('reserva_id só vale numa saída'), `a saida ${tipo} recebeu a M1`);
    }
  });

  // ══════════════ (e) chave da trava normalizada ══════════════
  await test('[91 F5 trava chave] comLockDoMaterial(\'900005\') e comLockDoMaterial(900005) sao a MESMA trava; travado(\'900005\') ve as duas', async () => {
    const h = (() => {
      let soltar; let pegou;
      const dentro = new Promise((r) => { pegou = r; });
      const fim = trava.comLockDoMaterial('900005', () => new Promise((r) => { soltar = r; pegou(); }));
      return { dentro, fim, soltar: () => soltar() };
    })();
    await comPrazo(h.dentro, 5000, 'segurar \'900005\'');
    let entrou = false;
    const p = trava.comLockDoMaterial(900005, async () => { entrou = true; });
    const estado = await estadoEm(p, 100);
    const travadoTexto = trava.travado('900005');
    const travadoNumero = trava.travado(900005);
    h.soltar();
    await comPrazo(Promise.all([h.fim, p]), 5000, 'as duas secoes');
    assert.strictEqual(estado, 'pendente', 'a chave numerica entrou com a textual presa: duas travas');
    assert.ok(travadoTexto && travadoNumero, `travado('900005')=${travadoTexto} travado(900005)=${travadoNumero}`);
    assert.strictEqual(entrou, true);
    assert.strictEqual(trava.travado('900005'), false);
    assert.strictEqual(trava.travado(900005), false);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await close();
  process.exit(failed ? 1 : 0);
})();
