/**
 * Etapa 91 (T1, D1/B419) — as tres portas de aprovacao seguram a trava de TODOS os materiais da
 * requisicao em volta de `prepararPosAprovacao` E do `UPDATE` guardado.
 *
 * A C131: a aprovacao de uma requisicao mais nova caia entre o movimento do motor que poe saldo no
 * disponivel e a distribuicao para quem esperava, e levava o material (fila invertida). A Opcao A tem
 * DUAS metades — as portas que liberam seguram a trava do movimento ate a distribuicao (T2) e as que
 * aprovam esperam essa trava e leem o saldo DENTRO dela (esta task). So a T1 nao conserta a C131 (e a
 * medicao da B403); o que se prova aqui e que cada porta de aprovacao espera e le o saldo sob a trava,
 * e que o `UPDATE` guardado fica dentro (sem ele, a distribuicao ve R ainda PENDENTE e deixa a sobra
 * parada — um C135 por corrida).
 *
 * Perfis reais POR REQUISICAO: um middleware logo depois do `jsonParser` faz `setUser` pelo header
 * `x-teste-usuario` (tecnica da sonda91-lib) — duas requisicoes concorrentes nunca rodam com o mesmo
 * usuario por acidente; cada caso afirma quem agiu (`aprovador_id`, `responsavel_id`).
 * Toda espera que pode travar passa por `comPrazo` (5 s): deadlock vira vermelho legivel.
 *
 * Plano: docs/superpowers/plans/2026-10-08-almoxarifado-etapa91-inversao-inspecao-aprovar.md (T1, RN-05, RN-09).
 * Executar: cd server && node tests/api/aprovacaoEsperaTrava.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const trava = require('../../services/almoxarifado/travaPorMaterial');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 91t1', role: 'admin', is_superadmin: 1, email: 'a91t1@t.com' },
  GESTOR: { id: 9111, nome: 'Gestor 91t1', perfil_almoxarifado: 'GESTOR', email: 'g91t1@t.com' },
  APRV: { id: 9112, nome: 'Aprovador valor 91t1', perfil_almoxarifado: 'GESTOR', email: 'v91t1@t.com' },
  SOL: { id: 9113, nome: 'Solicitante 91t1', email: 's91t1@t.com' }, // sem perfil: fallback PRODUCAO
  QUAL: { id: 9114, nome: 'Qualidade 91t1', perfil_almoxarifado: 'QUALIDADE', email: 'q91t1@t.com' },
  ALMOX: { id: 9115, nome: 'Almox 91t1', perfil_almoxarifado: 'ALMOXARIFE', email: 'x91t1@t.com' },
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

(async () => {
  console.log('\n=== Etapa 91 (T1): as tres portas de aprovacao esperam a trava e leem o saldo dentro dela ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  // Usuario por requisicao: logo depois do jsonParser, no mesmo tick sincrono do fakeAuth de cada rota.
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
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('F91T1','91000000000111','ativo')")).lastID;
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');

  const material = async ({ custo = 1, critico = 0 } = {}) => {
    const c = `E91T1-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', 0, 0, ?, 1, ?, ?)`, [c, `Mat ${c}`, custo, forn, critico])).lastID;
  };
  const porQuatro = (m) => dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = quantidade_atual + 4 WHERE id = ?', [m]);
  const criar = async (itens, extra = {}) => {
    const r = await como('SOL').post(`${API}/requisicoes`,
      { os_referencia: 'OS-91', itens: itens.map(([material_id, quantidade]) => ({ material_id, quantidade })), ...extra });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const ativas = (id) => dbAll(db, `SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA' ORDER BY material_id, id`, [id]);
  const holdDe = async (id) => (await ativas(id)).reduce((s, x) => s + Number(x.quantidade) - Number(x.quantidade_utilizada || 0), 0);
  const chaves = (o) => Object.keys(o).sort();

  /**
   * Segura a trava de `segurados`, dispara a porta e espera o marcador "a porta chegou ao ponto de ler o
   * saldo": o PRIMEIRO de (a) a porta pedindo a trava de um material da requisicao (caminho com a trava)
   * ou (b) `prepararPosAprovacao` resolvido (caminho sem a trava — a leitura ja aconteceu). Depois
   * afirma que a porta NAO respondeu em 150 ms, poe 4 em `abastecer` com a trava presa e solta.
   */
  async function portaEsperaTrava({ segurados, abastecer, mats, disparar }) {
    const hs = [];
    for (const m of segurados) {
      const h = segurar(m);
      // eslint-disable-next-line no-await-in-loop
      await comPrazo(h.dentro, 5000, `segurar ${m}`);
      hs.push(h);
    }
    let marcar; const marcou = new Promise((r) => { marcar = r; });
    const origLock = trava.comLockDoMaterial;
    trava.comLockDoMaterial = (m, fn) => { if (mats.includes(Number(m))) marcar('trava'); return origLock(m, fn); };
    const origPrep = requisitionService.prepararPosAprovacao;
    requisitionService.prepararPosAprovacao = async (...a) => { const r = await origPrep(...a); marcar('preparou'); return r; };
    let p; let estado; let marcador;
    try {
      p = disparar();
      marcador = await comPrazo(marcou, 5000, 'marcador da porta');
      estado = await estadoEm(p, 150);
      for (const m of abastecer) {
        // eslint-disable-next-line no-await-in-loop
        await porQuatro(m);
      }
    } finally {
      trava.comLockDoMaterial = origLock;
      requisitionService.prepararPosAprovacao = origPrep;
      hs.forEach((h) => h.soltar());
    }
    const r = await comPrazo(p, 5000, 'a porta');
    await comPrazo(Promise.all(hs.map((h) => h.fim)), 5000, 'trava do teste');
    return { r, estado, marcador };
  }

  // ══════════════ RN-05 (a) /aprovar ══════════════
  await test('[91 RN-05 (a)] /aprovar espera a trava presa e le o saldo DENTRO dela: 4 postos com a trava presa -> TOTALMENTE_RESERVADA', async () => {
    const m = await material();
    const R = (await criar([[m, 4]])).id;
    assert.strictEqual(await st(R), 'PENDENTE', 'premissa: sem aprovacao automatica');
    const { r, estado, marcador } = await portaEsperaTrava({
      segurados: [m], abastecer: [m], mats: [m], disparar: () => como('GESTOR').put(`${API}/requisicoes/${R}/aprovar`),
    });
    assert.strictEqual(estado, 'pendente', `o /aprovar respondeu com a trava presa (marcador: ${marcador}): ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.status, 'TOTALMENTE_RESERVADA', JSON.stringify(r.body));
    assert.deepStrictEqual(chaves(r.body), ['reservas', 'status', 'success'], '[RN-09] chaves do /aprovar');
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA');
    assert.strictEqual(await holdDe(R), 4);
    assert.strictEqual((await dbGet(db, 'SELECT aprovador_id FROM requisicoes_almoxarifado WHERE id = ?', [R])).aprovador_id, USERS.GESTOR.id);
    assert.strictEqual(trava.travado(m), false);
  });

  // ══════════════ RN-05 (b) /aprovar-valor ══════════════
  await test('[91 RN-05 (b)] /aprovar-valor (aprovador de valor real) espera a trava; sai TOTALMENTE_RESERVADA com a trilha APROVACAO_VALOR certa', async () => {
    await cfg('liberacao_valor_ativo', '1');
    await cfg('liberacao_valor_limite', '100');
    await cfg('liberacao_valor_aprovadores', JSON.stringify([USERS.APRV.id]));
    try {
      const m = await material({ custo: 100 });
      const R = await criar([[m, 4]]);
      assert.strictEqual(R.status, 'AGUARDANDO_APROVACAO_VALOR', `premissa: valor alto ${JSON.stringify(R)}`);
      const { r, estado, marcador } = await portaEsperaTrava({
        segurados: [m], abastecer: [m], mats: [m], disparar: () => como('APRV').put(`${API}/requisicoes/${R.id}/aprovar-valor`),
      });
      assert.strictEqual(estado, 'pendente', `o /aprovar-valor respondeu com a trava presa (marcador: ${marcador}): ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.status, 'TOTALMENTE_RESERVADA', JSON.stringify(r.body));
      assert.deepStrictEqual(chaves(r.body), ['reservas', 'status', 'success'], '[RN-09] chaves do /aprovar-valor');
      assert.strictEqual(await st(R.id), 'TOTALMENTE_RESERVADA');
      assert.strictEqual(await holdDe(R.id), 4);
      const row = await dbGet(db, 'SELECT aprovador_valor_id FROM requisicoes_almoxarifado WHERE id = ?', [R.id]);
      assert.strictEqual(row.aprovador_valor_id, USERS.APRV.id);
      const aud = await dbGet(db, `SELECT usuario_id, dados_novos FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao'
        AND entidade_id = ? AND acao = 'APROVACAO_VALOR' ORDER BY id DESC LIMIT 1`, [R.id]);
      assert.ok(aud, 'trilha APROVACAO_VALOR');
      assert.strictEqual(JSON.parse(aud.dados_novos).status, 'TOTALMENTE_RESERVADA', aud.dados_novos);
      assert.strictEqual(Number(aud.usuario_id), USERS.APRV.id);
    } finally { await cfg('liberacao_valor_ativo', '0'); }
  });

  // ══════════════ RN-05 (c) POST /requisicoes com aprovacao automatica ══════════════
  await test('[91 RN-05 (c)] POST /requisicoes com aprovacao automatica espera a trava; 201 TOTALMENTE_RESERVADA/automatica, reserva no nome do solicitante', async () => {
    await cfg('aprovacao_automatica', '1');
    try {
      const m = await material();
      const { r, estado, marcador } = await portaEsperaTrava({
        segurados: [m], abastecer: [m], mats: [m],
        disparar: () => como('SOL').post(`${API}/requisicoes`, { os_referencia: 'OS-91', itens: [{ material_id: m, quantidade: 4 }] }),
      });
      assert.strictEqual(estado, 'pendente', `o POST respondeu com a trava presa (marcador: ${marcador}): ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      assert.strictEqual(r.body.status, 'TOTALMENTE_RESERVADA', JSON.stringify(r.body));
      assert.strictEqual(r.body.aprovacao, 'automatica');
      assert.deepStrictEqual(chaves(r.body), ['aprovacao', 'id', 'numero', 'status', 'valor_total'], '[RN-09] chaves do POST');
      const res = await ativas(r.body.id);
      assert.deepStrictEqual(res.map((x) => [Number(x.quantidade), Number(x.solicitante_id)]), [[4, USERS.SOL.id]]);
    } finally { await cfg('aprovacao_automatica', '0'); }
  });

  // ══════════════ RN-05 (d) /enviar de rascunho com aprovacao automatica ══════════════
  await test('[91 RN-05 (d)] /enviar de um rascunho com aprovacao automatica espera a trava; 200 TOTALMENTE_RESERVADA/automatica', async () => {
    const m = await material();
    const rasc = await criar([[m, 4]], { salvar_rascunho: true });
    assert.strictEqual(rasc.status, 'RASCUNHO', 'premissa: rascunho');
    await cfg('aprovacao_automatica', '1');
    try {
      const { r, estado, marcador } = await portaEsperaTrava({
        segurados: [m], abastecer: [m], mats: [m], disparar: () => como('SOL').post(`${API}/requisicoes/${rasc.id}/enviar`),
      });
      assert.strictEqual(estado, 'pendente', `o /enviar respondeu com a trava presa (marcador: ${marcador}): ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.status, 'TOTALMENTE_RESERVADA', JSON.stringify(r.body));
      assert.deepStrictEqual(chaves(r.body), ['aprovacao', 'id', 'numero', 'status', 'valor_total'], '[RN-09] chaves do /enviar');
      assert.strictEqual(await holdDe(rasc.id), 4);
    } finally { await cfg('aprovacao_automatica', '0'); }
  });

  // ══════════════ RN-05 (e) dois materiais, so o SEGUNDO preso ══════════════
  await test('[91 RN-05 (e)] requisicao {m1, m2} com a trava presa so em m2 (o maior): o /aprovar tambem espera', async () => {
    const m1 = await material(); const m2 = await material();
    assert.ok(m1 < m2, 'premissa: m2 e o maior id');
    const R = (await criar([[m1, 4], [m2, 4]])).id;
    const { r, estado, marcador } = await portaEsperaTrava({
      segurados: [m2], abastecer: [m1, m2], mats: [m1, m2], disparar: () => como('GESTOR').put(`${API}/requisicoes/${R}/aprovar`),
    });
    assert.strictEqual(estado, 'pendente', `o /aprovar respondeu com m2 preso (marcador: ${marcador}): ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.status, 'TOTALMENTE_RESERVADA', JSON.stringify(r.body));
    assert.deepStrictEqual((await ativas(R)).map((x) => [Number(x.material_id), Number(x.quantidade)]), [[m1, 4], [m2, 4]]);
    assert.deepStrictEqual([trava.travado(m1), trava.travado(m2)], [false, false]);
  });

  // ══════════════ RN-05 (f) o UPDATE guardado fica DENTRO da trava ══════════════
  await test('[91 RN-05 (f)] o UPDATE guardado fica dentro: com a EMISSAO do UPDATE segura, a inspecao espera; R3 ja AGUARDANDO_ESTOQUE quando ela distribui e leva 4', async () => {
    await cfg('inspecao_material_critico', '1');
    try {
      const m = await material({ critico: 1 });
      const rec = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
        (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
        VALUES (?, 'EM_ENTRADA_NF', ?, 'F91T1', '2026-09-01', '2026-09-02', 10)`, [`REC-E91T1-${++seq}`, `NF-E91T1-${seq}`])).lastID;
      const itemRec = (await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`, [rec, m, 4, 4])).lastID;
      const pn = await como('ALMOX').post(`${API}/recebimentos/${rec}/processar`);
      assert.strictEqual(pn.status, 200, JSON.stringify(pn.body));
      const mat0 = await dbGet(db, 'SELECT quantidade_atual q, quantidade_em_inspecao i FROM materiais_almoxarifado WHERE id = ?', [m]);
      assert.deepStrictEqual([Number(mat0.q), Number(mat0.i)], [4, 4], 'premissa: 4 retidos para inspecao');
      const R3 = (await criar([[m, 4]])).id;

      // Segura a EMISSAO do UPDATE do /aprovar (status=?, aprovador_id=?): o comando so vai ao banco quando
      // o portao abre — a inspecao responder ou 400 ms (portao limitado: com a trava, a inspecao nao
      // responde enquanto o UPDATE esta preso, e esperar sem prazo seria deadlock do proprio teste).
      const origRun = db.run;
      let disparos = 0; let abriuPor = null; let pInsp = null;
      let abrir; const portao = new Promise((r) => { abrir = r; });
      db.run = function (sql, params, cb) {
        if (disparos === 0 && /UPDATE requisicoes_almoxarifado SET status=\?,\s*aprovador_id=\?/.test(sql) && Array.isArray(params)
          && Number(params[3]) === R3) {
          disparos += 1;
          pInsp = como('QUAL').post(`${API}/recebimentos/itens/${itemRec}/inspecionar`, { quantidade_aprovada: 4, quantidade_reprovada: 0 });
          const t = setTimeout(() => { if (!abriuPor) abriuPor = 'prazo'; abrir(); }, 400);
          pInsp.then(() => { if (!abriuPor) abriuPor = 'inspecao'; clearTimeout(t); abrir(); }, () => { clearTimeout(t); abrir(); });
          portao.then(() => origRun.call(db, sql, params, cb));
          return this;
        }
        return origRun.call(this, sql, params, cb);
      };
      let ra;
      try {
        ra = await comPrazo(como('GESTOR').put(`${API}/requisicoes/${R3}/aprovar`), 5000, '/aprovar');
      } finally { db.run = origRun; }
      const ri = await comPrazo(pInsp || Promise.reject(new Error('o gatilho nao disparou')), 5000, 'inspecao');
      assert.strictEqual(disparos, 1, 'o gatilho dispara exatamente uma vez');
      assert.strictEqual(ra.status, 200, JSON.stringify(ra.body));
      assert.strictEqual(ri.status, 201, JSON.stringify(ri.body));
      assert.strictEqual(abriuPor, 'prazo', 'o portao abriu porque a inspecao respondeu: ela nao esperou a trava da aprovacao');
      assert.strictEqual(await holdDe(R3), 4, 'R3 ainda PENDENTE quando a inspecao distribuiu: os 4 ficaram parados');
      assert.strictEqual(await st(R3), 'TOTALMENTE_RESERVADA');
      const mat = await dbGet(db, 'SELECT quantidade_atual q, quantidade_reservada r, quantidade_em_inspecao i FROM materiais_almoxarifado WHERE id = ?', [m]);
      assert.deepStrictEqual([Number(mat.q), Number(mat.r), Number(mat.i)], [4, 4, 0]);
      const insp = await dbGet(db, 'SELECT responsavel_id FROM inspecoes_recebimento_almoxarifado WHERE recebimento_item_id = ?', [itemRec]);
      assert.strictEqual(Number(insp.responsavel_id), USERS.QUAL.id, 'a inspecao rodou como a QUALIDADE');
      assert.strictEqual((await dbGet(db, 'SELECT aprovador_id FROM requisicoes_almoxarifado WHERE id = ?', [R3])).aprovador_id, USERS.GESTOR.id);
      assert.strictEqual(trava.travado(m), false);
    } finally { await cfg('inspecao_material_critico', '0'); }
  });

  // ══════════════ RN-05 (g) aprovacao perdedora ══════════════
  await test('[91 RN-05 (g)] dois /aprovar do mesmo R ao mesmo tempo (4 rodadas): um 200, um 400 com a mensagem de hoje, UMA reserva, nenhuma trava sobrando', async () => {
    for (let i = 0; i < 4; i++) {
      // eslint-disable-next-line no-await-in-loop
      const m = await material();
      // eslint-disable-next-line no-await-in-loop
      await porQuatro(m);
      // eslint-disable-next-line no-await-in-loop
      const R = (await criar([[m, 4]])).id;
      // eslint-disable-next-line no-await-in-loop
      const rs = await comPrazo(Promise.all([
        como('GESTOR').put(`${API}/requisicoes/${R}/aprovar`),
        como('GESTOR').put(`${API}/requisicoes/${R}/aprovar`),
      ]), 5000, `rodada ${i}`);
      const codes = rs.map((x) => x.status).sort();
      assert.deepStrictEqual(codes, [200, 400], `rodada ${i}: ${JSON.stringify(rs.map((x) => x.body))}`);
      const perdeu = rs.find((x) => x.status === 400);
      assert.strictEqual(perdeu.body.error, 'Transição inválida: TOTALMENTE_RESERVADA → APROVADO', `rodada ${i}`);
      // eslint-disable-next-line no-await-in-loop
      const at = await ativas(R);
      assert.deepStrictEqual(at.map((x) => Number(x.quantidade)), [4], `rodada ${i}: reservas ${JSON.stringify(at)}`);
      assert.strictEqual(trava.travado(m), false, `rodada ${i}: trava sobrando`);
    }
  });

  // ══════════════ costura: prepararPosAprovacao pelo OBJETO nas portas ══════════════
  await test('[91 costura] o patch de requisitionService.prepararPosAprovacao morde pelo /aprovar e pela aprovacao automatica', async () => {
    const orig = requisitionService.prepararPosAprovacao;
    const vistos = [];
    requisitionService.prepararPosAprovacao = async (dbx, id, ...resto) => { vistos.push(Number(id)); return orig(dbx, id, ...resto); };
    let R; let auto;
    try {
      const m = await material();
      R = (await criar([[m, 1]])).id;
      const a = await comPrazo(como('GESTOR').put(`${API}/requisicoes/${R}/aprovar`), 5000, '/aprovar');
      assert.strictEqual(a.status, 200, JSON.stringify(a.body));
      await cfg('aprovacao_automatica', '1');
      auto = await comPrazo(como('SOL').post(`${API}/requisicoes`, { os_referencia: 'OS-91', itens: [{ material_id: m, quantidade: 1 }] }), 5000, 'POST');
      assert.strictEqual(auto.status, 201, JSON.stringify(auto.body));
    } finally { requisitionService.prepararPosAprovacao = orig; await cfg('aprovacao_automatica', '0'); }
    assert.deepStrictEqual(vistos, [R, auto.body.id], 'as portas chamam prepararPosAprovacao pelo objeto do modulo');
  });

  // ══════════════ a trava da automatica falhando: a requisicao fica PENDENTE (Etapa 73 Fase 5) ══════════════
  await test('[91 Fase 2 achado 2] a leitura dos materiais/trava da aprovacao automatica falha: 201 PENDENTE, nada reservado (nunca 500)', async () => {
    const orig = requisitionService.comTravaDaRequisicao;
    assert.strictEqual(typeof orig, 'function', 'requisitionService.comTravaDaRequisicao existe');
    requisitionService.comTravaDaRequisicao = async () => { throw new Error('trava caiu 91'); };
    const warns = []; const ow = console.warn; console.warn = (...a) => { warns.push(a.join(' ')); };
    let r;
    try {
      await cfg('aprovacao_automatica', '1');
      const m = await material(); await porQuatro(m);
      r = await comPrazo(como('SOL').post(`${API}/requisicoes`, { os_referencia: 'OS-91', itens: [{ material_id: m, quantidade: 4 }] }), 5000, 'POST');
    } finally { requisitionService.comTravaDaRequisicao = orig; console.warn = ow; await cfg('aprovacao_automatica', '0'); }
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.status, 'PENDENTE');
    assert.deepStrictEqual(await ativas(r.body.id), []);
    assert.ok(warns.some((w) => w.includes(`Falha ao aprovar automaticamente a requisição ${r.body.id}; fica PENDENTE: trava caiu 91`)), JSON.stringify(warns));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
