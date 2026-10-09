/**
 * Etapa 91 (T2, D1/B419, C131 + C142) — as tres portas que LIBERAM (decisao da inspecao, NC que aceita,
 * nota) seguram a trava do material desde ANTES do movimento do motor que poe saldo no disponivel ate a
 * distribuicao para quem esperava. Com a T1 (as tres portas que aprovam esperam a mesma trava e leem o
 * saldo dentro dela), uma aprovacao que cai no meio de uma liberacao nao inverte mais a fila: ela espera,
 * le o disponivel depois da distribuicao e a requisicao mais antiga leva o material.
 *
 * O recalculo da 76 e o aviso da 75 rodam DEPOIS de soltar a trava (`rcs.concluirPendencia` no `finally`
 * FORA da funcao passada a trava): a trava nao e reentrante e o recalculo pede a trava dos materiais da
 * requisicao tocada (RN-08).
 *
 * Tecnica (plano, "Tecnica dos testes de corrida"):
 * - usuario POR REQUISICAO (middleware logo depois do `jsonParser`, header `x-teste-usuario`); cada
 *   rodada afirma o perfil que agiu (`responsavel_id`, `aprovador_id`, `decidido_por_id`,
 *   `faturamento_responsavel_id`);
 * - gatilho no SQL (regex tolerante a espaco) no comando do motor que poe saldo no disponivel; quando ele
 *   RESOLVE, dispara a aprovacao (uma vez) e o PORTAO LIMITADO segura o callback ate a aprovacao responder
 *   ou 400 ms. Cada rodada afirma que o gatilho disparou exatamente uma vez e que o portao abriu PELO
 *   PRAZO (a aprovacao esperou a trava) — portao que abriu porque a aprovacao respondeu e inversao;
 * - `comPrazo` (5 s) em toda chamada que pode travar: deadlock vira vermelho legivel.
 *
 * Plano: docs/superpowers/plans/2026-10-08-almoxarifado-etapa91-inversao-inspecao-aprovar.md (T2:
 * RN-01, RN-02, RN-03, RN-04, RN-06, RN-07, RN-08, RN-09 das rotas de liberacao, e o caso L1 que saiu da T0).
 * Executar: cd server && node tests/api/filaLiberacaoAprovacaoCorrida.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const trava = require('../../services/almoxarifado/travaPorMaterial');
const rcs = require('../../services/almoxarifado/reservaChegadaService');
const stockService = require('../../services/almoxarifado/stockService');
const receiptNotificationService = require('../../services/almoxarifado/receiptNotificationService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 91t2', role: 'admin', is_superadmin: 1, email: 'a91t2@t.com' },
  QUAL: { id: 9121, nome: 'Qualidade 91t2', perfil_almoxarifado: 'QUALIDADE', email: 'q91t2@t.com' },
  GESTOR: { id: 9122, nome: 'Gestor 91t2', perfil_almoxarifado: 'GESTOR', email: 'g91t2@t.com' },
  ALMOX: { id: 9123, nome: 'Almox 91t2', perfil_almoxarifado: 'ALMOXARIFE', email: 'x91t2@t.com' },
};
const API = '/api/almoxarifado';
const N = 4;
const PRAZO_PORTAO = 400;
let seq = 0;

// Regex do gatilho, tolerante a espaco e quebra de linha (Fase 2, achado 11). Mudado na Etapa 96: o motor grava
// `col = ROUND((expr), 6)` — os gatilhos aceitam o embrulho opcional.
const RE_DECISAO = /UPDATE\s+materiais_almoxarifado\s+SET\s+quantidade_em_inspecao\s*=\s*(?:ROUND\(\(\s*)?COALESCE\(\s*quantidade_em_inspecao\s*,\s*0\s*\)\s*-\s*\?/;
const RE_DESBLOQUEIO = /UPDATE\s+materiais_almoxarifado\s+SET\s+quantidade_bloqueada\s*=\s*(?:ROUND\(\(\s*)?COALESCE\(\s*quantidade_bloqueada\s*,\s*0\s*\)\s*-\s*\?/;
// Nota: o credito do fisico do ENTRADA_COMPRA (stockService, ramo de entrada: `SET\n quantidade_atual =
// quantidade_atual + ?`, com ou sem custo; o id do material e o ultimo parametro). O plano previa a sincronizacao
// `SET quantidade_atual = ?`, mas ela so roda quando o material tem linha de saldo por localizacao — medido antes da
// T2: sem localizacao o gatilho com a regex do plano nunca disparava (0 de 8 rodadas).
const RE_SYNC = /UPDATE\s+materiais_almoxarifado\s+SET\s+quantidade_atual\s*=\s*(?:ROUND\(\(\s*)?quantidade_atual\s*\+\s*\?/;
// Onde o material_id esta nos parametros de cada comando (stockService: DECISAO [q, reprov, id, q]; DESBLOQUEIO [q, id, q]; sync [total, id]).
function materialDoComando(re, ps) {
  if (re === RE_DECISAO) return ps[2];
  if (re === RE_DESBLOQUEIO) return ps[1];
  return ps[ps.length - 1];
}

function comPrazo(p, ms, rotulo) {
  let t;
  const limite = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`${rotulo} não respondeu em ${ms / 1000} s — trava presa?`)), ms);
  });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}
const dormir = (ms) => new Promise((r) => { setTimeout(r, ms); });
/** Espera `p` ou `ms`, o que vier primeiro; nunca rejeita. */
function ateOu(p, ms) {
  let t;
  return Promise.race([Promise.resolve(p).then(() => true, () => true), new Promise((r) => { t = setTimeout(() => r(false), ms); })])
    .finally(() => clearTimeout(t));
}

(async () => {
  console.log('\n=== Etapa 91 (T2): as portas que liberam seguram a trava do movimento ate a distribuicao ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  // Usuario por requisicao (tecnica da sonda91-lib). `usuarioPorRequisicao = false` e o controle s7.
  let usuarioPorRequisicao = true;
  app.use((req, res, next) => {
    const k = req.headers['x-teste-usuario'];
    if (usuarioPorRequisicao && k && USERS[k]) setUser({ ...USERS[k] });
    next();
  });
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
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('F91T2','91000000000122','ativo')")).lastID;
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('inspecao_material_critico', '1');
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');

  // ── instrumentacao do SQL: gatilho + portao limitado ──────────────────────────────────────────
  let gatilho = null; // { re, materialId, aoDisparar, disparos, abriuPor, prazo }
  const espioesSql = []; // (sql, params) => void, chamados quando o comando RESOLVE
  const origDb = {};
  for (const metodo of ['run', 'get', 'all']) {
    origDb[metodo] = db[metodo].bind(db);
    db[metodo] = function embrulhado(sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      const s = String(sql);
      const ps = Array.isArray(params) ? params : [];
      return origDb[metodo](sql, params, function callback(...a) {
        const ctx = this;
        for (const f of espioesSql) f(s, ps);
        const g = gatilho;
        if (g && g.re.test(s) && Number(materialDoComando(g.re, ps)) === Number(g.materialId)) {
          g.disparos++;
          if (g.disparos === 1) {
            const pAcao = Promise.resolve().then(() => g.aoDisparar());
            g.acao = pAcao;
            const pAprov = pAcao.then(() => 'aprovacao', () => 'aprovacao');
            const pPrazo = dormir(g.prazo || PRAZO_PORTAO).then(() => 'prazo');
            Promise.race([pAprov, pPrazo]).then((por) => {
              g.abriuPor = por;
              if (cb) cb.apply(ctx, a);
            });
            return undefined;
          }
        }
        return cb && cb.apply(ctx, a);
      });
    };
  }
  const armar = (re, materialId, aoDisparar, prazo) => {
    gatilho = { re, materialId, aoDisparar, disparos: 0, abriuPor: null, acao: null, prazo };
    return gatilho;
  };
  const desarmar = () => { gatilho = null; };

  // ── fabricas ──────────────────────────────────────────────────────────────────────────────────
  const material = async (critico, extra = {}) => {
    const c = `E91T2-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', 0, 0, 1, ?, ?, ?)`, [c, `Mat ${c}`, extra.ativo === 0 ? 0 : 1, forn, critico ? 1 : 0])).lastID;
  };
  const req = async (status, itens, criado) => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo, data_aprovacao_valor)
      VALUES (?, 99, 'Sol', ?, 'NORMAL', ?, 1, '2026-09-01 10:00:00')`, [`REQ-E91T2-${++seq}`, status, criado])).lastID;
    for (const [m, q] of itens) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)', [id, m, q]);
    }
    return id;
  };
  const criarNota = async (itens, status = 'EM_ENTRADA_NF') => {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, ?, ?, 'F91T2', '2026-09-01', '2026-09-02', 10)`, [`REC-E91T2-${++seq}`, status, `NF91T2-${seq}`])).lastID;
    for (const [m, q] of itens) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, 'INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)', [r, m, q, q]);
    }
    const itensIds = (await dbAll(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? ORDER BY id', [r])).map((x) => x.id);
    return { r, item: itensIds[0], itens: itensIds };
  };
  const processar = (r) => como('ALMOX').post(`${API}/recebimentos/${r}/processar`);
  const inspecionar = (item, aprovada, reprovada) => como('QUAL').post(`${API}/recebimentos/itens/${item}/inspecionar`,
    { quantidade_aprovada: aprovada, quantidade_reprovada: reprovada });
  const aprovar = (R) => como('GESTOR').put(`${API}/requisicoes/${R}/aprovar`);
  const hold = async (rid) => (await dbAll(db, "SELECT quantidade - COALESCE(quantidade_utilizada,0) s FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status='ATIVA'", [rid])).reduce((a, x) => a + Number(x.s), 0);
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const mat = async (m) => dbGet(db, `SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r, COALESCE(quantidade_em_inspecao,0) i,
    COALESCE(quantidade_bloqueada,0) b FROM materiais_almoxarifado WHERE id = ?`, [m]);
  const chaves = (o) => Object.keys(o).sort();

  /** Material critico com 4 retidos de uma nota ja processada; devolve { m, item }. */
  const criticoRetido = async () => {
    const m = await material(true);
    const { r, item } = await criarNota([[m, 4]]);
    const p = await comPrazo(processar(r), 5000, 'setup: processar');
    assert.strictEqual(p.status, 200, `setup: processar ${JSON.stringify(p.body)}`);
    assert.strictEqual((await mat(m)).i, 4, 'setup: 4 retidos');
    return { m, item };
  };

  // As tres portas (RN-01, RN-02, RN-03). Cada `prep` monta R1 (antiga, AGUARDANDO_ESTOQUE, 4) e R3 (nova,
  // PENDENTE, 4) e devolve a liberacao, o gatilho e as provas de perfil.
  const portas = {
    INSPECAO: {
      rn: 'RN-01',
      re: RE_DECISAO,
      statusLib: 201,
      prep: async () => {
        const { m, item } = await criticoRetido();
        const R1 = await req('AGUARDANDO_ESTOQUE', [[m, 4]], '2026-09-01 08:00:00');
        const R3 = await req('PENDENTE', [[m, 4]], '2026-09-02 08:00:00');
        return {
          m, R1, R3,
          liberar: () => inspecionar(item, 4, 0),
          perfil: async (resp) => {
            const ins = await dbGet(db, 'SELECT responsavel_id FROM inspecoes_recebimento_almoxarifado WHERE id = ?', [resp.body.id]);
            assert.strictEqual(Number(ins.responsavel_id), USERS.QUAL.id, '[perfil] inspecao gravada pela QUALIDADE');
          },
        };
      },
    },
    NC: {
      rn: 'RN-02',
      re: RE_DESBLOQUEIO,
      statusLib: 200,
      prep: async () => {
        const { m, item } = await criticoRetido();
        const ins = await comPrazo(inspecionar(item, 0, 4), 5000, 'setup: reprovar');
        assert.strictEqual(ins.status, 201, `setup: reprovar ${JSON.stringify(ins.body)}`);
        const nc = await dbGet(db, "SELECT id FROM nao_conformidades_almoxarifado WHERE referencia_tipo='INSPECAO' AND referencia_id=?", [ins.body.id]);
        assert.ok(nc, 'setup: NC aberta pela reprovacao');
        assert.strictEqual((await mat(m)).b, 4, 'setup: 4 bloqueados');
        const R1 = await req('AGUARDANDO_ESTOQUE', [[m, 4]], '2026-09-01 08:00:00');
        const R3 = await req('PENDENTE', [[m, 4]], '2026-09-02 08:00:00');
        return {
          m, R1, R3,
          liberar: () => como('QUAL').post(`${API}/nao-conformidades/${nc.id}/decidir`, { decisao: 'ACEITAR', justificativa: 'aceito 91t2' }),
          perfil: async () => {
            const row = await dbGet(db, 'SELECT decidido_por_id FROM nao_conformidades_almoxarifado WHERE id = ?', [nc.id]);
            assert.strictEqual(Number(row.decidido_por_id), USERS.QUAL.id, '[perfil] NC decidida pela QUALIDADE');
          },
        };
      },
    },
    NOTA: {
      rn: 'RN-03',
      re: RE_SYNC,
      statusLib: 200,
      prep: async () => {
        const m = await material(false);
        const R1 = await req('AGUARDANDO_ESTOQUE', [[m, 4]], '2026-09-01 08:00:00');
        const { r } = await criarNota([[m, 4]]);
        const R3 = await req('PENDENTE', [[m, 4]], '2026-09-02 08:00:00');
        return {
          m, R1, R3,
          liberar: () => processar(r),
          perfil: async () => {
            const row = await dbGet(db, 'SELECT faturamento_responsavel_id FROM recebimentos_material_almoxarifado WHERE id = ?', [r]);
            assert.strictEqual(Number(row.faturamento_responsavel_id), USERS.ALMOX.id, '[perfil] nota processada pelo ALMOXARIFE');
          },
        };
      },
    },
  };

  /** Uma rodada de uma porta num modo. Devolve a descricao; lanca nas asserccoes de contrato. */
  async function rodada(nome, modo) {
    const P = portas[nome];
    const c = await P.prep();
    let lib; let apr; let g = null;
    try {
      if (modo === 'conc-lib1') {
        [lib, apr] = await comPrazo(Promise.all([c.liberar(), aprovar(c.R3)]), 5000, `${nome}/${modo}`);
      } else if (modo === 'conc-apr1') {
        [apr, lib] = await comPrazo(Promise.all([aprovar(c.R3), c.liberar()]), 5000, `${nome}/${modo}`);
      } else if (modo === 'janela') {
        g = armar(P.re, c.m, () => aprovar(c.R3));
        lib = await comPrazo(c.liberar(), 5000, `${nome}/${modo} liberacao`);
        assert.strictEqual(g.disparos, 1, `o gatilho do motor disparou ${g.disparos} vez(es) — tem de ser 1`);
        apr = await comPrazo(g.acao, 5000, `${nome}/${modo} aprovacao`);
      } else {
        lib = await comPrazo(c.liberar(), 5000, `${nome}/${modo} liberacao`);
        apr = await comPrazo(aprovar(c.R3), 5000, `${nome}/${modo} aprovacao`);
      }
    } finally { desarmar(); }
    const h1 = await hold(c.R1); const h3 = await hold(c.R3); const mm = await mat(c.m);
    const s1 = await st(c.R1); const s3 = await st(c.R3);
    const tag = h1 === 4 && h3 === 0 ? 'FILA-CERTA' : (h1 === 0 && h3 === 4 ? 'INVERTIDA' : `OUTRO(R1=${h1},R3=${h3})`);
    const desc = `${tag} lib=${lib.status} apr=${apr.status} R1=${h1}/${s1} R3=${h3}/${s3} mat q=${mm.q} r=${mm.r} i=${mm.i} b=${mm.b}${g ? ` portao=${g.abriuPor}` : ''}`;
    return { tag, desc, c, lib, apr, h1, h3, s1, s3, mm, g };
  }

  async function contratoDaRodada(P, x) {
    assert.strictEqual(x.lib.status, P.statusLib, `liberacao ${x.lib.status}: ${JSON.stringify(x.lib.body)}`);
    assert.strictEqual(x.apr.status, 200, `aprovacao ${x.apr.status}: ${JSON.stringify(x.apr.body)}`);
    assert.strictEqual(x.tag, 'FILA-CERTA', x.desc);
    assert.strictEqual(x.s1, 'TOTALMENTE_RESERVADA', x.desc);
    assert.strictEqual(x.s3, 'AGUARDANDO_ESTOQUE', x.desc);
    assert.deepStrictEqual([x.mm.q, x.mm.r, x.mm.i, x.mm.b], [4, 4, 0, 0], x.desc);
    if (x.g) assert.strictEqual(x.g.abriuPor, 'prazo', `o portao abriu por '${x.g.abriuPor}' — a aprovacao nao esperou a trava (${x.desc})`);
    const apv = await dbGet(db, 'SELECT aprovador_id FROM requisicoes_almoxarifado WHERE id = ?', [x.c.R3]);
    assert.strictEqual(Number(apv.aprovador_id), USERS.GESTOR.id, '[perfil] R3 aprovada pelo GESTOR');
    await x.c.perfil(x.lib);
    assert.strictEqual(trava.travado(x.c.m), false, 'a trava sobrou presa');
  }

  // ══════════════ RN-01 / RN-02 / RN-03 — as tres portas × tres encaixes ══════════════
  const MODOS = ['conc-lib1', 'conc-apr1', 'janela'];
  for (const nome of ['INSPECAO', 'NC', 'NOTA']) {
    const P = portas[nome];
    for (const modo of MODOS) {
      // eslint-disable-next-line no-await-in-loop
      await test(`[91 ${P.rn}] ${nome} × /aprovar (${modo}), ${N} rodadas: R1 (antiga) leva os 4 TOTALMENTE_RESERVADA, R3 fica 0 AGUARDANDO_ESTOQUE, perfis reais`, async () => {
        const res = [];
        let primeiroErro = null;
        for (let i = 0; i < N; i++) {
          let x = null;
          try {
            // eslint-disable-next-line no-await-in-loop
            x = await rodada(nome, modo);
            // eslint-disable-next-line no-await-in-loop
            await contratoDaRodada(P, x);
            res.push('ok');
          } catch (e) {
            res.push(x ? x.tag : 'ERRO');
            if (!primeiroErro) primeiroErro = e;
          }
        }
        const inv = res.filter((t) => t === 'INVERTIDA').length;
        if (primeiroErro) {
          throw new Error(`${nome}/${modo}: ok ${res.filter((t) => t === 'ok').length}/${N}, INVERTIDA ${inv}/${N} [${res.join(',')}] — primeiro: ${primeiroErro.message}`);
        }
      });
    }
  }

  // ══════════════ RN-04 — a janela ENTRADA_COMPRA -> QUARENTENA (C142) ══════════════
  await test(`[91 RN-04] janela da QUARENTENA (critico, ninguem esperando), ${N} rodadas: R3 aprovada no instante entre o ENTRADA_COMPRA e a QUARENTENA fica 0; disponivel nunca negativo; a reprovacao depois nao muda R3`, async () => {
    const res = [];
    let primeiroErro = null;
    for (let i = 0; i < N; i++) {
      /* eslint-disable no-await-in-loop */
      let desc = '';
      try {
        const m = await material(true);
        const { r, item } = await criarNota([[m, 4]]);
        const R3 = await req('PENDENTE', [[m, 4]], '2026-09-02 08:00:00');
        const g = armar(RE_SYNC, m, () => aprovar(R3));
        let p;
        try { p = await comPrazo(processar(r), 5000, 'nota'); } finally { desarmar(); }
        assert.strictEqual(g.disparos, 1, `gatilho disparou ${g.disparos} vez(es)`);
        const a = await comPrazo(g.acao, 5000, 'aprovacao');
        const mm = await mat(m); const h3 = await hold(R3);
        desc = `R3=${h3}/${await st(R3)} mat q=${mm.q} r=${mm.r} i=${mm.i} disp=${mm.q - mm.r - mm.i - mm.b} portao=${g.abriuPor}`;
        assert.strictEqual(p.status, 200, JSON.stringify(p.body));
        assert.strictEqual(a.status, 200, JSON.stringify(a.body));
        assert.strictEqual(h3, 0, desc);
        assert.strictEqual(await st(R3), 'AGUARDANDO_ESTOQUE', desc);
        assert.deepStrictEqual([mm.q, mm.r, mm.i], [4, 0, 4], desc);
        assert.ok(mm.q - mm.r - mm.i - mm.b >= -1e-9, `disponivel negativo: ${desc}`);
        assert.strictEqual(g.abriuPor, 'prazo', `o portao abriu por '${g.abriuPor}' (${desc})`);
        const rep = await comPrazo(inspecionar(item, 0, 4), 5000, 'reprovacao');
        assert.strictEqual(rep.status, 201, JSON.stringify(rep.body));
        const m2 = await mat(m);
        assert.strictEqual(await hold(R3), 0, 'R3 com reserva depois da reprovacao');
        assert.strictEqual(m2.b, 4);
        assert.strictEqual(m2.q - m2.r - m2.i - m2.b, 0, 'disponivel depois da reprovacao');
        assert.strictEqual(trava.travado(m), false);
        res.push('ok');
      } catch (e) {
        res.push(desc.includes('R3=4') ? 'RESERVOU-RETIDO' : 'ERRO');
        if (!primeiroErro) primeiroErro = e;
      }
      /* eslint-enable no-await-in-loop */
    }
    if (primeiroErro) {
      throw new Error(`QUARENTENA: ok ${res.filter((t) => t === 'ok').length}/${N} [${res.join(',')}] — primeiro: ${primeiroErro.message}`);
    }
  });

  // ══════════════ RN-06 — sem corrida, nada muda ══════════════
  for (const nome of ['INSPECAO', 'NC', 'NOTA']) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[91 RN-06 (a)] ${nome}: aprovacao DEPOIS de a liberacao responder -> R1=4, R3=0 (hoje tambem)`, async () => {
      const x = await rodada(nome, 'controle');
      await contratoDaRodada(portas[nome], x);
    });
  }

  await test('[91 RN-06 (b)] declarado, nao desejado (B397/D(74)): ENTRADA avulsa de 4 pela v2 nao distribui; a aprovacao de R3 depois leva os 4', async () => {
    const m = await material(false);
    const R1 = await req('AGUARDANDO_ESTOQUE', [[m, 4]], '2026-09-01 08:00:00');
    const R3 = await req('PENDENTE', [[m, 4]], '2026-09-02 08:00:00');
    const e = await comPrazo(como('ALMOX').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: 4, motivo: 'avulsa 91t2' }), 5000, 'v2 ENTRADA');
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
    assert.strictEqual(await hold(R1), 0, 'a entrada avulsa nao distribui (D(74))');
    const a = await comPrazo(aprovar(R3), 5000, '/aprovar');
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    assert.strictEqual(a.body.status, 'TOTALMENTE_RESERVADA');
    assert.strictEqual(await hold(R3), 4);
    assert.strictEqual(await hold(R1), 0);
  });

  // ══════════════ RN-07 — sem deadlock ══════════════
  await test('[91 RN-07 (a)] nota com DOIS itens do MESMO material (com uma requisicao esperando) responde; a trava solta', async () => {
    const m = await material(false);
    const R1 = await req('AGUARDANDO_ESTOQUE', [[m, 4]], '2026-09-01 08:00:00');
    const { r } = await criarNota([[m, 2], [m, 2]]);
    const p = await comPrazo(processar(r), 5000, 'nota com dois itens do mesmo material');
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    assert.strictEqual(await hold(R1), 4);
    assert.strictEqual(await st(R1), 'TOTALMENTE_RESERVADA', 'o recalculo rodou depois de soltar');
    assert.strictEqual(trava.travado(m), false);
  });

  await test('[91 RN-07 (b)] requisicao com dois itens do mesmo material aprovada (com outra esperando o material) responde', async () => {
    const m = await material(false);
    await req('AGUARDANDO_ESTOQUE', [[m, 4]], '2026-09-01 08:00:00');
    const R = await req('PENDENTE', [[m, 1], [m, 1]], '2026-09-02 08:00:00');
    const a = await comPrazo(aprovar(R), 5000, '/aprovar com dois itens do mesmo material');
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    assert.strictEqual(trava.travado(m), false);
  });

  await test('[91 RN-07 (c)] nota {A,B} × aprovacao de {B,A} × inspecao em A, na intercalacao que trava sem a ordem crescente: as tres respondem', async () => {
    const { m: A, item } = await criticoRetido();
    const B = await material(false);
    assert.ok(A < B, 'premissa: A < B');
    const Rq = await req('PENDENTE', [[B, 1], [A, 1]], '2026-09-02 08:00:00');
    const { r } = await criarNota([[A, 2], [B, 2]]);
    // espiao: quantas vezes alguem pediu a trava de A
    let pedidosA = 0; const avisosA = [];
    const origLock = trava.comLockDoMaterial;
    trava.comLockDoMaterial = (mm, fn) => {
      if (Number(mm) === A) { pedidosA++; avisosA.forEach((f) => f(pedidosA)); }
      return origLock(mm, fn);
    };
    const quandoPedidosA = (n, ms) => ateOu(new Promise((res) => { if (pedidosA >= n) res(); else avisosA.push((k) => { if (k >= n) res(); }); }), ms);
    let pNota; let pApr; let pIns;
    let soltarPortao; const portao = new Promise((res) => { soltarPortao = res; });
    try {
      // a inspecao segura A: portao no DECISAO_INSPECAO que so abre quando a aprovacao pediu A (ou 2 s)
      const g = armar(RE_DECISAO, A, () => portao, 2000);
      pIns = inspecionar(item, 4, 0);
      await comPrazo(new Promise((res) => { const t = setInterval(() => { if (g.disparos >= 1) { clearInterval(t); res(); } }, 5); }), 5000, 'gatilho da inspecao');
      const base = pedidosA;
      pNota = processar(r);
      await quandoPedidosA(base + 1, 1000); // a nota pediu A e espera
      pApr = aprovar(Rq);
      await quandoPedidosA(base + 2, 1000); // a aprovacao pediu A (depois de B, se a ordem nao for crescente)
      soltarPortao();
      const [ri, rn, ra] = await Promise.all([
        comPrazo(pIns, 5000, 'inspecao'), comPrazo(pNota, 5000, 'nota'), comPrazo(pApr, 5000, 'aprovacao'),
      ]);
      assert.strictEqual(ri.status, 201, JSON.stringify(ri.body));
      assert.strictEqual(rn.status, 200, JSON.stringify(rn.body));
      assert.strictEqual(ra.status, 200, JSON.stringify(ra.body));
    } finally {
      soltarPortao();
      desarmar();
      trava.comLockDoMaterial = origLock;
    }
    assert.strictEqual(trava.travado(A), false, 'A presa');
    assert.strictEqual(trava.travado(B), false, 'B presa');
  });

  await test('[91 RN-07 (e)] excecao DENTRO da secao solta a trava: inspecao do mesmo item duas vezes ao mesmo tempo (400), nota com item invalido (400), NC com o motor falhando (500 com rollback) — o /aprovar seguinte responde', async () => {
    // (e1) duas inspecoes simultaneas do mesmo item: as duas passam da leitura, a segunda perde o claim DENTRO da secao
    {
      const { m, item } = await criticoRetido();
      const [x, y] = await comPrazo(Promise.all([inspecionar(item, 4, 0), inspecionar(item, 4, 0)]), 5000, 'duas inspecoes');
      const sts = [x.status, y.status].sort();
      assert.deepStrictEqual(sts, [201, 400], `${JSON.stringify(x.body)} ${JSON.stringify(y.body)}`);
      const perdeu = x.status === 400 ? x : y;
      assert.strictEqual(perdeu.body.error, 'Item já foi decidido por outra inspeção');
      const R = await req('PENDENTE', [[m, 1]], '2026-09-03 08:00:00');
      const a = await comPrazo(aprovar(R), 5000, '/aprovar depois da inspecao recusada');
      assert.strictEqual(a.status, 200, JSON.stringify(a.body));
      assert.strictEqual(trava.travado(m), false);
    }
    // (e2) nota com um item de material inativo: 400 de darEntradaEstoque, de dentro da secao
    {
      const m = await material(false);
      const X = await material(false, { ativo: 0 });
      const { r } = await criarNota([[m, 4], [X, 1]]);
      const p = await comPrazo(processar(r), 5000, 'nota invalida');
      assert.strictEqual(p.status, 400, JSON.stringify(p.body));
      assert.match(p.body.error, /material inativo/);
      const R = await req('PENDENTE', [[m, 1]], '2026-09-03 08:00:00');
      const a = await comPrazo(aprovar(R), 5000, '/aprovar depois da nota recusada');
      assert.strictEqual(a.status, 200, JSON.stringify(a.body));
      assert.strictEqual(trava.travado(m), false);
      assert.strictEqual(trava.travado(X), false);
    }
    // (e3) NC com o motor falhando no DESBLOQUEIO: 500, a NC volta a ABERTA, a trava solta
    {
      const { m, item } = await criticoRetido();
      const ins = await comPrazo(inspecionar(item, 0, 4), 5000, 'reprovar');
      const nc = await dbGet(db, "SELECT id FROM nao_conformidades_almoxarifado WHERE referencia_tipo='INSPECAO' AND referencia_id=?", [ins.body.id]);
      const orig = stockService.registrarMovimentacao;
      stockService.registrarMovimentacao = async (...a) => {
        if (a[2] && a[2].tipo === 'DESBLOQUEIO') throw new Error('motor caiu 91');
        return orig(...a);
      };
      let d;
      try {
        d = await comPrazo(como('QUAL').post(`${API}/nao-conformidades/${nc.id}/decidir`, { decisao: 'ACEITAR', justificativa: 'x' }), 5000, 'NC');
      } finally { stockService.registrarMovimentacao = orig; }
      assert.strictEqual(d.status, 500, JSON.stringify(d.body));
      assert.strictEqual((await dbGet(db, 'SELECT status FROM nao_conformidades_almoxarifado WHERE id = ?', [nc.id])).status, 'ABERTA', 'rollback');
      assert.strictEqual(trava.travado(m), false);
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = quantidade_atual + 1 WHERE id = ?', [m]);
      const R = await req('PENDENTE', [[m, 1]], '2026-09-03 08:00:00');
      const a = await comPrazo(aprovar(R), 5000, '/aprovar depois da NC que falhou');
      assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    }
  });

  // ══════════════ RN-08 — o recalculo e o aviso rodam depois de soltar a trava ══════════════
  /**
   * Linha do tempo por marcador (Fase 2, achado 7 — sem `travado`, que e true tambem enquanto alguem
   * espera): o espiao em `trava.comLockDoMaterial` embrulha a `fn` de cada secao e grava `entrou`/`saiu`;
   * o comando do motor grava `motor`; o espiao em `rcs.recalcularStatusSobTrava` grava `recalculo`. A
   * PRIMEIRA secao do cenario e a da porta: o motor tem de cair DENTRO dela e o recalculo de R1 DEPOIS de
   * ela sair.
   */
  async function linhaDoTempo(reMotor, m, disparar) {
    const eventos = [];
    const origLock = trava.comLockDoMaterial;
    trava.comLockDoMaterial = (mm, fn) => origLock(mm, async () => {
      const k = eventos.length; eventos.push(`entrou#${k}:${mm}`);
      try { return await fn(); } finally { eventos.push(`saiu#${k}:${mm}`); }
    });
    const origRec = rcs.recalcularStatusSobTrava;
    rcs.recalcularStatusSobTrava = (dbx, id) => { eventos.push(`recalculo:${id}`); return origRec(dbx, id); };
    const origAvisoLib = receiptNotificationService.avisarLiberacao;
    const avisos = [];
    receiptNotificationService.avisarLiberacao = async (dbx, u, ctx, resultado) => {
      eventos.push('aviso'); avisos.push(JSON.parse(JSON.stringify(resultado))); return origAvisoLib(dbx, u, ctx, resultado);
    };
    const origAvisoEnt = receiptNotificationService.avisarEntradaConfirmada;
    receiptNotificationService.avisarEntradaConfirmada = async (...a) => { eventos.push('aviso'); return origAvisoEnt(...a); };
    const espiao = (s, ps) => { if (reMotor.test(s) && Number(materialDoComando(reMotor, ps)) === Number(m)) eventos.push('motor'); };
    espioesSql.push(espiao);
    let resp;
    try {
      resp = await comPrazo(disparar(), 5000, 'a porta');
    } finally {
      trava.comLockDoMaterial = origLock;
      rcs.recalcularStatusSobTrava = origRec;
      receiptNotificationService.avisarLiberacao = origAvisoLib;
      receiptNotificationService.avisarEntradaConfirmada = origAvisoEnt;
      espioesSql.splice(espioesSql.indexOf(espiao), 1);
    }
    return { resp, eventos, avisos };
  }
  function afirmarOrdem(eventos, R1) {
    const iEntrou = eventos.findIndex((e) => e.startsWith('entrou#'));
    assert.ok(iEntrou >= 0, `nenhuma secao: ${eventos.join(' > ')}`);
    const k = eventos[iEntrou].slice('entrou#'.length).split(':')[0];
    const iSaiu = eventos.findIndex((e) => e.startsWith(`saiu#${k}:`));
    const iMotor = eventos.indexOf('motor');
    const iRec = eventos.indexOf(`recalculo:${R1}`);
    const iAviso = eventos.indexOf('aviso');
    const linha = eventos.join(' > ');
    assert.ok(iMotor > iEntrou && iMotor < iSaiu, `o movimento do motor fora da secao da porta: ${linha}`);
    assert.ok(iRec > iSaiu, `o recalculo de R1 nao veio depois de a secao da porta sair: ${linha}`);
    assert.ok(iAviso > iRec, `o aviso nao veio depois do recalculo: ${linha}`);
  }

  await test('[91 RN-08] inspecao: o motor cai dentro da secao da porta; o recalculo da 76 roda depois de ela sair; o aviso recebe a reserva de R1 e o status ja recalculado', async () => {
    const { m, item } = await criticoRetido();
    const R1 = await req('AGUARDANDO_ESTOQUE', [[m, 4]], '2026-09-01 08:00:00');
    const { resp, eventos, avisos } = await linhaDoTempo(RE_DECISAO, m, () => inspecionar(item, 4, 0));
    assert.strictEqual(resp.status, 201, JSON.stringify(resp.body));
    afirmarOrdem(eventos, R1);
    assert.strictEqual(await st(R1), 'TOTALMENTE_RESERVADA');
    assert.strictEqual(avisos.length, 1);
    assert.ok(avisos[0].reservas.some((x) => Number(x.requisicao_id) === R1 && Number(x.quantidade) === 4), JSON.stringify(avisos[0]));
    assert.ok(avisos[0].status.some((x) => Number(x.requisicao_id) === R1 && x.para === 'TOTALMENTE_RESERVADA'), `o aviso nao viu o status recalculado: ${JSON.stringify(avisos[0])}`);
    assert.strictEqual(trava.travado(m), false);
  });

  await test('[91 RN-08] nota: o motor cai dentro da secao da porta; o recalculo roda depois de ela sair; o aviso de entrada vem por ultimo', async () => {
    const m = await material(false);
    const R1 = await req('AGUARDANDO_ESTOQUE', [[m, 4]], '2026-09-01 08:00:00');
    const { r } = await criarNota([[m, 4]]);
    const { resp, eventos } = await linhaDoTempo(RE_SYNC, m, () => processar(r));
    assert.strictEqual(resp.status, 200, JSON.stringify(resp.body));
    afirmarOrdem(eventos, R1);
    assert.strictEqual(await st(R1), 'TOTALMENTE_RESERVADA');
    assert.strictEqual(trava.travado(m), false);
  });

  // ══════════════ RN-09 — contratos das rotas de liberacao ══════════════
  await test('[91 RN-09] /inspecionar, /nao-conformidades/:id/decidir, /recebimentos/:id/processar e /recebimentos/:id/aprovar respondem com as MESMAS chaves de hoje', async () => {
    const { m, item } = await criticoRetido();
    await req('AGUARDANDO_ESTOQUE', [[m, 2]], '2026-09-01 08:00:00');
    const ins = await comPrazo(inspecionar(item, 2, 2), 5000, '/inspecionar');
    assert.strictEqual(ins.status, 201, JSON.stringify(ins.body));
    assert.deepStrictEqual(chaves(ins.body), ['divergencia_dimensional', 'divergencia_quantidade', 'id', 'medidas_registradas',
      'quantidade_aprovada', 'quantidade_reprovada'], '/inspecionar');
    const nc = await dbGet(db, "SELECT id FROM nao_conformidades_almoxarifado WHERE referencia_tipo='INSPECAO' AND referencia_id=?", [ins.body.id]);
    const d = await comPrazo(como('QUAL').post(`${API}/nao-conformidades/${nc.id}/decidir`, { decisao: 'ACEITAR', justificativa: 'ok' }), 5000, '/decidir');
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.deepStrictEqual(chaves(d.body), CHAVES_NC, `/decidir: ${JSON.stringify(chaves(d.body))}`);
    assert.deepStrictEqual(chaves(d.body.liberacao), ['efeito', 'material_id', 'mensagem', 'quantidade'], '/decidir liberacao');
    const m2 = await material(false);
    const { r } = await criarNota([[m2, 1]]);
    const p = await comPrazo(processar(r), 5000, '/processar');
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    assert.deepStrictEqual(chaves(p.body), ['contas_pagar_id', 'status', 'success'], '/processar');
    const { r: r2 } = await criarNota([[m2, 1]], 'RECEBIDO');
    const ap = await comPrazo(como('ALMOX').post(`${API}/recebimentos/${r2}/aprovar`), 5000, '/recebimentos/:id/aprovar');
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    assert.deepStrictEqual(chaves(ap.body), ['success'], '/recebimentos/:id/aprovar');
  });

  // ══════════════ L1 — a variante sob trava sem a trava (saiu da T0, Fase 2 achado 5) ══════════════
  await test('[91 L1] a nota chamando a distribuicao `sobTrava` SEM a trava (material sem ninguem): `reservarChegadaSemFalhar` engole e loga L1 dentro da literal de hoje; a nota responde 200', async () => {
    const m = await material(false);
    const R1 = await req('AGUARDANDO_ESTOQUE', [[m, 4]], '2026-09-01 08:00:00');
    const { r } = await criarNota([[m, 4]]);
    assert.strictEqual(trava.travado(m), false, 'premissa: ninguem segura nem espera');
    const origMats = trava.comLockDosMateriais;
    trava.comLockDosMateriais = (mats, fn) => fn(); // a porta "pega" a trava sem pegar
    const warns = []; const origWarn = console.warn;
    console.warn = (...a) => { warns.push(a.join(' ')); };
    let p;
    try { p = await comPrazo(processar(r), 5000, 'nota'); } finally {
      trava.comLockDosMateriais = origMats; console.warn = origWarn;
    }
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    const l1 = `[recebimento] reserva na chegada falhou (recebimento ${r}): distribuicao sob trava chamada sem a trava do material ${m}`;
    assert.ok(warns.includes(l1), `warn L1 ausente; warns: ${JSON.stringify(warns)}`);
    assert.strictEqual(await hold(R1), 0, 'distribuiu sem a trava');
  });

  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FALHA NO HARNESS', e); process.exit(1); });

// Chaves de hoje do corpo de `POST /nao-conformidades/:id/decidir` (medidas antes da T2: a NC inteira +
// `liberacao`). `var` (hoisting): o teste roda dentro da IIFE acima.
// eslint-disable-next-line no-var
var CHAVES_NC = ['aberto_automaticamente', 'aberto_por_id', 'aberto_por_nome', 'cancelado_em', 'cancelado_por_id',
  'cancelado_por_nome', 'created_at', 'decidido_em', 'decidido_por_id', 'decidido_por_nome', 'decisao', 'descricao',
  'divergencia', 'execucao_em', 'execucao_estado', 'execucao_movimentacao_id', 'execucao_observacoes', 'execucao_por_id',
  'execucao_por_nome', 'id', 'justificativa', 'liberacao', 'material_codigo', 'material_id', 'material_nome',
  'material_unidade', 'motivo_cancelamento', 'nota_fiscal', 'numero', 'origem', 'quantidade_esperada',
  'quantidade_recebida', 'recebimento_id', 'recebimento_numero', 'referencia_id', 'referencia_tipo', 'status', 'tipo',
  'updated_at'];
