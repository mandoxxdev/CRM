/**
 * Etapa 91 (T3) — integracao das duas metades da Opcao A (B419), pela ROTA e pelo SERVICO, com a 74
 * (reserva na chegada), a 75 (reserva na liberacao + aviso), a 76 (recalculo do status) e a 77 (a reserva
 * da requisicao so sai pela requisicao).
 *
 * Por que integracao: a trava e FIACAO entre modulos (`receiptService`, `inspectionService`,
 * `nonConformityService`, `routes`, `requisitionService`, `reservaChegadaService`). Um `Map` por modulo
 * passaria em todo teste de unidade de cada porta e so falharia quando a porta de um modulo encontra a de
 * outro — por isso ha a jornada pelas ROTAS (as portas HTTP, perfis reais) e os pares pelo SERVICO
 * (`decidirInspecao` / `processarNota` chamados direto contra rotas de aprovacao).
 *
 * Jornada (material critico M):
 *   1. S1 (sem perfil -> PRODUCAO) cria R1 (4 M) pela rota; o GESTOR aprova -> AGUARDANDO_ESTOQUE.
 *   2. S3 (sem perfil) cria R3 (4 M) por `POST /api/requisicoes-material` -> PENDENTE.
 *   3. O ALMOXARIFE processa a nota de 4 e o GESTOR aprova R3 NA JANELA DA QUARENTENA (portao limitado no
 *      credito do fisico do ENTRADA_COMPRA) -> R3 0 AGUARDANDO_ESTOQUE, M q4 r0 i4 (C142).
 *   4. S4 cria R4 pela rota (PENDENTE). A QUALIDADE aprova os 4 e o GESTOR aprova R4 NA JANELA DO
 *      DECISAO_INSPECAO -> R1 4 TOTALMENTE_RESERVADA (recalculo da 76), R3 0, R4 0; o aviso da liberacao
 *      (espiao + fila de e-mail) diz "reservado" para R1 (75).
 *   5. ALM1 separa R1, ALM2 faz a SEGUNDA conferencia (M e critico — sem ela a entrega da 400 de
 *      `assertConferidaSeObrigatorio`; Fase 2, achado 4) e ALM1 entrega -> ENTREGUE, a reserva CONSUMIDA
 *      (a marca da 77 compoe).
 * Pelo servico:
 *   6. `inspectionService.decidirInspecao` (QUALIDADE) ∥ `PUT /aprovar` (rota) na janela -> fila certa.
 *   7. `receiptService.processarNota` (ALMOXARIFE) ∥ `POST /requisicoes` com aprovacao automatica (rota) na
 *      janela -> fila certa.
 * Cada janela afirma: o gatilho disparou exatamente uma vez e o portao abriu PELO PRAZO (a aprovacao esperou
 * a trava que a liberacao segurava) — portao aberto porque a aprovacao respondeu e a inversao.
 *
 * Plano: docs/superpowers/plans/2026-10-08-almoxarifado-etapa91-inversao-inspecao-aprovar.md (T3).
 * Executar: cd server && node tests/api/filaTravaIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const trava = require('../../services/almoxarifado/travaPorMaterial');
const inspectionService = require('../../services/almoxarifado/inspectionService');
const receiptService = require('../../services/almoxarifado/receiptService');
const receiptNotificationService = require('../../services/almoxarifado/receiptNotificationService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  CONSULTA: { id: 9130, nome: 'Consulta 91t3', perfil_almoxarifado: 'CONSULTA', email: 'c91t3@t.com' },
  S1: { id: 9131, nome: 'Solicitante 1 91t3', email: 's1-91t3@t.com' }, // sem perfil -> PRODUCAO
  S3: { id: 9132, nome: 'Solicitante 3 91t3', email: 's3-91t3@t.com' },
  S4: { id: 9133, nome: 'Solicitante 4 91t3', email: 's4-91t3@t.com' },
  GESTOR: { id: 9134, nome: 'Gestor 91t3', perfil_almoxarifado: 'GESTOR', email: 'g91t3@t.com' },
  QUAL: { id: 9135, nome: 'Qualidade 91t3', perfil_almoxarifado: 'QUALIDADE', email: 'q91t3@t.com' },
  ALM1: { id: 9136, nome: 'Almoxarife 1 91t3', perfil_almoxarifado: 'ALMOXARIFE', email: 'a1-91t3@t.com' },
  ALM2: { id: 9137, nome: 'Almoxarife 2 91t3', perfil_almoxarifado: 'ALMOXARIFE', email: 'a2-91t3@t.com' },
};
const API = '/api/almoxarifado';
const PRAZO_PORTAO = 400;
const { FRASE_TUDO_RESERVADO: L1 } = receiptNotificationService;

const RE_DECISAO = /UPDATE\s+materiais_almoxarifado\s+SET\s+quantidade_em_inspecao\s*=\s*COALESCE\(\s*quantidade_em_inspecao\s*,\s*0\s*\)\s*-\s*\?/;
// O credito do fisico do ENTRADA_COMPRA (o material sem localizacao nao passa pela sincronizacao `= ?`).
const RE_CREDITO = /UPDATE\s+materiais_almoxarifado\s+SET\s+quantidade_atual\s*=\s*quantidade_atual\s*\+\s*\?/;
function materialDoComando(re, ps) { return re === RE_DECISAO ? ps[2] : ps[ps.length - 1]; }

function comPrazo(p, ms, rotulo) {
  let t;
  const limite = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`${rotulo} não respondeu em ${ms / 1000} s — trava presa?`)), ms);
  });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}
const dormir = (ms) => new Promise((r) => { setTimeout(r, ms); });

(async () => {
  console.log('\n=== Etapa 91 (T3): a trava das seis portas, pela rota e pelo servico (A x 74 x 75 x 76 x 77) ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.CONSULTA } });
  setUser({ ...USERS.CONSULTA });
  // Usuario por requisicao (sem header: CONSULTA — uma rota chamada sem perfil cai com 403).
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.CONSULTA) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    post: (u, body = {}) => request(app).post(u).set('x-teste-usuario', k).send(body).then((x) => x),
    put: (u, body = {}) => request(app).put(u).set('x-teste-usuario', k).send(body).then((x) => x),
    get: (u) => request(app).get(u).set('x-teste-usuario', k).then((x) => x),
  });

  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const u of Object.values(USERS)) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [u.id, u.nome, u.email]);
  }
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('F91T3','91000000000133','ativo')")).lastID;
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('inspecao_material_critico', '1');
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');
  await cfg('notificar_recebimento_solicitante', '1');

  // ── gatilho + portao limitado (a tecnica da T2) ──────────────────────────────────────────────
  let gatilho = null;
  for (const metodo of ['run', 'get', 'all']) {
    const orig = db[metodo].bind(db);
    db[metodo] = function embrulhado(sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      const s = String(sql);
      const ps = Array.isArray(params) ? params : [];
      return orig(sql, params, function callback(...a) {
        const ctx = this;
        const g = gatilho;
        if (g && g.re.test(s) && Number(materialDoComando(g.re, ps)) === Number(g.materialId)) {
          g.disparos++;
          if (g.disparos === 1) {
            g.acao = Promise.resolve().then(() => g.aoDisparar());
            Promise.race([g.acao.then(() => 'aprovacao', () => 'aprovacao'), dormir(PRAZO_PORTAO).then(() => 'prazo')])
              .then((por) => { g.abriuPor = por; if (cb) cb.apply(ctx, a); });
            return undefined;
          }
        }
        return cb && cb.apply(ctx, a);
      });
    };
  }
  /** Roda `liberar()` com a aprovacao disparada quando o comando do motor `re` do material `m` resolve. */
  async function naJanela(re, m, liberar, aprovar, rotulo) {
    const g = { re, materialId: m, aoDisparar: aprovar, disparos: 0, abriuPor: null, acao: null };
    gatilho = g;
    let lib;
    try { lib = await comPrazo(Promise.resolve().then(liberar), 5000, `${rotulo}: a liberacao`); } finally { gatilho = null; }
    assert.strictEqual(g.disparos, 1, `${rotulo}: o gatilho do motor disparou ${g.disparos} vez(es) — tem de ser 1`);
    const apr = await comPrazo(g.acao, 5000, `${rotulo}: a aprovacao`);
    return { lib, apr, abriuPor: g.abriuPor };
  }

  // ── fabricas ──────────────────────────────────────────────────────────────────────────────────
  let seq = 0;
  const material = async (critico) => {
    const c = `E91T3-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', 0, 0, 10, 1, ?, ?)`, [c, `Mat ${c}`, forn, critico ? 1 : 0])).lastID;
  };
  const criarNota = async (m, q) => {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F91T3', '2026-09-01', '2026-09-02', 10)`, [`REC-E91T3-${++seq}`, `NF91T3-${seq}`])).lastID;
    await dbRun(db, 'INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)', [r, m, q, q]);
    const item = (await dbGet(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [r])).id;
    return { r, item };
  };
  const criarPelaRota = async (k, m, q) => {
    const r = await comPrazo(como(k).post(`${API}/requisicoes`, { os_referencia: 'OS-91T3', itens: [{ material_id: m, quantidade: q }] }), 5000, 'POST /requisicoes');
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const aprovar = (R) => como('GESTOR').put(`${API}/requisicoes/${R}/aprovar`);
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const reservas = (id) => dbAll(db, 'SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ? ORDER BY id', [id]);
  const hold = async (id) => (await reservas(id)).filter((x) => x.status === 'ATIVA')
    .reduce((s, x) => s + Number(x.quantidade) - Number(x.quantidade_utilizada || 0), 0);
  const mat = async (m) => dbGet(db, `SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r, COALESCE(quantidade_em_inspecao,0) i,
    COALESCE(quantidade_bloqueada,0) b FROM materiais_almoxarifado WHERE id = ?`, [m]);
  const itemDe = async (id) => (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [id])).id;

  // espiao do aviso da liberacao (75): pelo objeto do modulo, como o `concluirPendencia` chama
  const avisos = [];
  const origAviso = receiptNotificationService.avisarLiberacao;
  receiptNotificationService.avisarLiberacao = async (dbx, u, ctx, resultado) => {
    avisos.push({ ctx: { ...ctx }, resultado: JSON.parse(JSON.stringify(resultado)) });
    return origAviso(dbx, u, ctx, resultado);
  };

  // ══════════════ A jornada pela ROTA ══════════════
  const j = {};
  await test('[91 T3 jornada 1-2] R1 (S1, PRODUCAO) criada e aprovada pela rota -> AGUARDANDO_ESTOQUE; R3 (S3) por POST /api/requisicoes-material -> PENDENTE', async () => {
    j.M = await material(true);
    const r1 = await criarPelaRota('S1', j.M, 4);
    assert.strictEqual(r1.status, 'PENDENTE', JSON.stringify(r1));
    const a = await comPrazo(aprovar(r1.id), 5000, '/aprovar R1');
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    assert.strictEqual(a.body.status, 'AGUARDANDO_ESTOQUE', JSON.stringify(a.body));
    j.R1 = r1.id;
    const r3 = await comPrazo(como('S3').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-91T3', itens: [{ material_id: j.M, quantidade: 4 }],
    }), 5000, 'POST /api/requisicoes-material');
    assert.strictEqual(r3.status, 201, JSON.stringify(r3.body));
    assert.strictEqual(r3.body.status, 'PENDENTE', JSON.stringify(r3.body));
    j.R3 = r3.body.id;
    assert.strictEqual(Number((await dbGet(db, 'SELECT solicitante_id FROM requisicoes_almoxarifado WHERE id = ?', [j.R3])).solicitante_id), USERS.S3.id);
  });

  await test('[91 T3 jornada 3] nota de 4 (ALMOXARIFE) x /aprovar de R3 (GESTOR) na janela ENTRADA_COMPRA -> QUARENTENA: R3 0 AGUARDANDO_ESTOQUE, M q4 r0 i4 (C142)', async () => {
    const { r, item } = await criarNota(j.M, 4);
    j.itemNota = item;
    const { lib, apr, abriuPor } = await naJanela(RE_CREDITO, j.M,
      () => como('ALM1').post(`${API}/recebimentos/${r}/processar`), () => aprovar(j.R3), 'QUARENTENA');
    assert.strictEqual(lib.status, 200, JSON.stringify(lib.body));
    assert.strictEqual(apr.status, 200, JSON.stringify(apr.body));
    const mm = await mat(j.M);
    const desc = `R3=${await hold(j.R3)}/${await st(j.R3)} M q=${mm.q} r=${mm.r} i=${mm.i} portao=${abriuPor}`;
    assert.strictEqual(await hold(j.R3), 0, desc);
    assert.strictEqual(await st(j.R3), 'AGUARDANDO_ESTOQUE', desc);
    assert.deepStrictEqual([mm.q, mm.r, mm.i, mm.b], [4, 0, 4, 0], desc);
    assert.strictEqual(abriuPor, 'prazo', `o portao abriu por '${abriuPor}' — a aprovacao nao esperou a trava da nota (${desc})`);
    assert.strictEqual(await hold(j.R1), 0, 'o retido nao se reserva (74 RN-03)');
    assert.strictEqual(Number((await dbGet(db, 'SELECT aprovador_id FROM requisicoes_almoxarifado WHERE id = ?', [j.R3])).aprovador_id), USERS.GESTOR.id);
    assert.strictEqual(trava.travado(j.M), false);
  });

  await test('[91 T3 jornada 4] R4 (S4) pela rota; inspecao 4/0 (QUALIDADE) x /aprovar de R4 (GESTOR) na janela do DECISAO_INSPECAO: R1 4 TOTALMENTE_RESERVADA (76), R3 0, R4 0; o aviso diz "reservado" para R1 (75)', async () => {
    const r4 = await criarPelaRota('S4', j.M, 4);
    assert.strictEqual(r4.status, 'PENDENTE');
    j.R4 = r4.id;
    avisos.length = 0;
    const { lib, apr, abriuPor } = await naJanela(RE_DECISAO, j.M,
      () => como('QUAL').post(`${API}/recebimentos/itens/${j.itemNota}/inspecionar`, { quantidade_aprovada: 4, quantidade_reprovada: 0 }),
      () => aprovar(j.R4), 'DECISAO_INSPECAO');
    assert.strictEqual(lib.status, 201, JSON.stringify(lib.body));
    assert.strictEqual(apr.status, 200, JSON.stringify(apr.body));
    const mm = await mat(j.M);
    const desc = `R1=${await hold(j.R1)}/${await st(j.R1)} R3=${await hold(j.R3)} R4=${await hold(j.R4)}/${await st(j.R4)} M q=${mm.q} r=${mm.r} i=${mm.i} portao=${abriuPor}`;
    assert.strictEqual(await hold(j.R1), 4, desc);
    assert.strictEqual(await st(j.R1), 'TOTALMENTE_RESERVADA', desc);
    assert.strictEqual(await hold(j.R3), 0, desc);
    assert.strictEqual(await hold(j.R4), 0, desc);
    assert.strictEqual(await st(j.R4), 'AGUARDANDO_ESTOQUE', desc);
    assert.deepStrictEqual([mm.q, mm.r, mm.i, mm.b], [4, 4, 0, 0], desc);
    assert.strictEqual(abriuPor, 'prazo', `o portao abriu por '${abriuPor}' — a aprovacao nao esperou a trava da inspecao (${desc})`);
    const ins = await dbGet(db, 'SELECT responsavel_id FROM inspecoes_recebimento_almoxarifado WHERE id = ?', [lib.body.id]);
    assert.strictEqual(Number(ins.responsavel_id), USERS.QUAL.id);
    assert.strictEqual(Number((await dbGet(db, 'SELECT aprovador_id FROM requisicoes_almoxarifado WHERE id = ?', [j.R4])).aprovador_id), USERS.GESTOR.id);
    // o aviso da 75: o espiao ve a reserva de R1 e o status ja recalculado; o e-mail de R1 diz "reservado" (L1)
    const av = avisos.find((x) => x.ctx.origem === 'INSPECAO');
    assert.ok(av, 'o aviso da liberacao nao saiu');
    assert.ok(av.resultado.reservas.some((x) => Number(x.requisicao_id) === j.R1 && Number(x.quantidade) === 4), JSON.stringify(av.resultado));
    assert.ok(av.resultado.status.some((x) => Number(x.requisicao_id) === j.R1 && x.para === 'TOTALMENTE_RESERVADA'), JSON.stringify(av.resultado));
    const emails = await dbAll(db, `SELECT corpo_texto FROM fila_notificacoes_almoxarifado
      WHERE json_extract(payload, '$.requisicao_id') = ? ORDER BY id`, [j.R1]);
    assert.ok(emails.some((e) => String(e.corpo_texto).includes(L1)), `nenhum e-mail de R1 com a frase de reservado: ${JSON.stringify(emails)}`);
    const reservaR1 = (await reservas(j.R1)).find((x) => x.status === 'ATIVA');
    assert.strictEqual(reservaR1.origem, 'REQUISICAO');
    assert.ok(reservaR1.recebimento_id, 'a reserva da liberacao leva a nota (B386)');
    j.reservaR1 = reservaR1.id;
    assert.strictEqual(trava.travado(j.M), false);
  });

  await test('[91 T3 jornada 5] ALM1 separa R1, ALM2 faz a segunda conferencia (critico), ALM1 entrega -> ENTREGUE; a reserva nascida sob a trava fica CONSUMIDA (77)', async () => {
    const it = await itemDe(j.R1);
    const s = await comPrazo(como('ALM1').put(`${API}/requisicoes/${j.R1}/separar`, { itens_separados: [{ item_id: it, quantidade_separada: 4 }] }), 5000, 'separar');
    assert.strictEqual(s.status, 200, JSON.stringify(s.body));
    const semConf = await comPrazo(como('ALM1').put(`${API}/requisicoes/${j.R1}/entregar`, { itens_atendidos: [{ item_id: it, quantidade_atendida: 4 }] }), 5000, 'entregar sem conferencia');
    assert.strictEqual(semConf.status, 400, `premissa: critico sem a segunda conferencia nao sai: ${JSON.stringify(semConf.body)}`);
    const c = await comPrazo(como('ALM2').put(`${API}/requisicoes/${j.R1}/conferir-separacao`), 5000, 'conferir');
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    const e = await comPrazo(como('ALM1').put(`${API}/requisicoes/${j.R1}/entregar`, { itens_atendidos: [{ item_id: it, quantidade_atendida: 4 }] }), 5000, 'entregar');
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.strictEqual(await st(j.R1), 'ENTREGUE');
    const rr = (await reservas(j.R1)).find((x) => x.id === j.reservaR1);
    assert.strictEqual(rr.status, 'CONSUMIDA', JSON.stringify(rr));
    const mm = await mat(j.M);
    assert.deepStrictEqual([mm.q, mm.r, mm.i, mm.b], [0, 0, 0, 0]);
    assert.strictEqual(await hold(j.R3), 0);
    assert.strictEqual(await hold(j.R4), 0);
  });

  // ══════════════ Pelo SERVICO contra a ROTA: o mesmo Map atravessando modulos ══════════════
  await test('[91 T3 servico 6] inspectionService.decidirInspecao (QUALIDADE, servico) x PUT /aprovar (rota) na janela: a requisicao antiga leva os 4', async () => {
    const M = await material(true);
    const RA = await criarPelaRota('S1', M, 4);
    const aa = await comPrazo(aprovar(RA.id), 5000, '/aprovar RA');
    assert.strictEqual(aa.body.status, 'AGUARDANDO_ESTOQUE', JSON.stringify(aa.body));
    const { r, item } = await criarNota(M, 4);
    const p = await comPrazo(como('ALM1').post(`${API}/recebimentos/${r}/processar`), 5000, 'processar');
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    const RB = await criarPelaRota('S3', M, 4);
    const { lib, apr, abriuPor } = await naJanela(RE_DECISAO, M,
      () => inspectionService.decidirInspecao(db, { ...USERS.QUAL }, item, { quantidade_aprovada: 4, quantidade_reprovada: 0 }),
      () => aprovar(RB.id), 'servico inspecao');
    assert.ok(lib && lib.id, JSON.stringify(lib));
    assert.strictEqual(apr.status, 200, JSON.stringify(apr.body));
    const desc = `RA=${await hold(RA.id)}/${await st(RA.id)} RB=${await hold(RB.id)}/${await st(RB.id)} portao=${abriuPor}`;
    assert.strictEqual(await hold(RA.id), 4, desc);
    assert.strictEqual(await st(RA.id), 'TOTALMENTE_RESERVADA', desc);
    assert.strictEqual(await hold(RB.id), 0, desc);
    assert.strictEqual(await st(RB.id), 'AGUARDANDO_ESTOQUE', desc);
    assert.strictEqual(abriuPor, 'prazo', `o portao abriu por '${abriuPor}' (${desc})`);
    assert.strictEqual(trava.travado(M), false);
  });

  await test('[91 T3 servico 7] receiptService.processarNota (ALMOXARIFE, servico) x POST /requisicoes com aprovacao automatica (rota) na janela: a requisicao antiga leva os 4; a nova nasce AGUARDANDO_ESTOQUE (201)', async () => {
    const M = await material(false);
    const RA = await criarPelaRota('S1', M, 4);
    const aa = await comPrazo(aprovar(RA.id), 5000, '/aprovar RA');
    assert.strictEqual(aa.body.status, 'AGUARDANDO_ESTOQUE', JSON.stringify(aa.body));
    const { r } = await criarNota(M, 4);
    await cfg('aprovacao_automatica', '1');
    let out;
    try {
      out = await naJanela(RE_CREDITO, M,
        () => receiptService.processarNota(db, { ...USERS.ALM1 }, r, {}),
        () => como('S3').post(`${API}/requisicoes`, { os_referencia: 'OS-91T3', itens: [{ material_id: M, quantidade: 4 }] }),
        'servico nota');
    } finally { await cfg('aprovacao_automatica', '0'); }
    const { lib, apr, abriuPor } = out;
    assert.strictEqual(lib.success, true, JSON.stringify(lib));
    assert.strictEqual(apr.status, 201, JSON.stringify(apr.body));
    const RB = apr.body.id;
    const desc = `RA=${await hold(RA.id)}/${await st(RA.id)} RB=${await hold(RB)}/${await st(RB)} portao=${abriuPor}`;
    assert.strictEqual(await hold(RA.id), 4, desc);
    assert.strictEqual(await st(RA.id), 'TOTALMENTE_RESERVADA', desc);
    assert.strictEqual(await hold(RB), 0, desc);
    assert.strictEqual(await st(RB), 'AGUARDANDO_ESTOQUE', desc);
    assert.strictEqual(apr.body.status, 'AGUARDANDO_ESTOQUE', desc);
    assert.strictEqual(abriuPor, 'prazo', `o portao abriu por '${abriuPor}' (${desc})`);
    assert.strictEqual(trava.travado(M), false);
  });

  receiptNotificationService.avisarLiberacao = origAviso;
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FALHA NO HARNESS', e); process.exit(1); });
