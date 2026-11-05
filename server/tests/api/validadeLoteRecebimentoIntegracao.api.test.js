/**
 * Etapa 194 (T3) — integracao: a validade da nota no recebimento cruzando as portas que o usuario usa.
 *
 * O caminho real: a data e digitada em Dados fiscais (`PUT /recebimentos/:id/fiscal`), a previa aparece no detalhe
 * (`GET /recebimentos/:id`, `avisos_validade_lote`), o Processar/Confirmar grava (`POST /processar`, `/workflow processar`, `/aprovar`
 * direto — `avisos_validade` so quando ha aviso) e a data certa se corrige pela porta da 191 (`PUT /lotes/:id/validade`), conferida na
 * lista de lotes do material (`GET /materiais/:id/lotes`). Mais: o estorno da entrada que preencheu (Fase 2, achado 6), a trava da
 * secao da nota contra a correcao da 191 (RN-194.09, Fase 2 achado 1 — controles (a) preencher depois da secao e (b) material fora de
 * `materiaisDaNota`) e o lote mudando entre a previa e o processar (Fase 2, achado 9).
 *
 * Os lotes nascem pela Entrada manual da 190 (`POST /movimentacoes/v2`). As literais sao COPIADAS do contrato congelado (plano da 194).
 * Teste de corrida: o gesto concorrente sai do contexto do TESTE; o gancho so sinaliza e segura (CLAUDE.md, molde
 * `exclusaoSerieQueVoltou` RN-15).
 * Plano: docs/superpowers/plans/2026-11-05-almoxarifado-etapa194-validade-do-lote-no-recebimento.md
 *
 * Executar: cd server && node tests/api/validadeLoteRecebimentoIntegracao.api.test.js
 */
process.env.TZ = 'UTC';
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const lotService = require('../../services/almoxarifado/lotService');
const trava = require('../../services/almoxarifado/travaPorMaterial');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const ADMIN = { id: 1, nome: 'Adm 194I', role: 'admin', is_superadmin: 1, email: 'a194i@t.com' };
const API = '/api/almoxarifado';

const BR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const ETIQUETA = ' A etiqueta do recebimento sai com a data da nota — imprima a do lote em Lotes e Séries.';
const MSG = {
  PREVIA_PREENCHER: (c, n) => `O lote ${c} não tem validade; ao processar, ele recebe a validade da nota (${BR(n)}). `
    + 'Confira a data antes de processar.',
  PREVIA_DIVERGENTE: (c, l, n) => `O lote ${c} já tem validade ${BR(l)}, e a nota informa ${BR(n)}. Ao processar, a validade do lote é `
    + 'mantida — confira a data da nota em Dados fiscais; se a do lote está errada, corrija-a em Lotes e Séries → "Corrigir validade".'
    + ETIQUETA,
  NOTA_DIVERGENTE: (c, l, n) => `O lote ${c} já tinha validade ${BR(l)}; a nota informou ${BR(n)}. A validade do lote foi mantida — se `
    + 'a da nota é a certa, corrija-a em Lotes e Séries → "Corrigir validade".' + ETIQUETA,
  AVISO_PREENCHIDA: (c, d) => `O lote ${c} não tinha validade; ela foi gravada agora (${BR(d)}) e vale também para o saldo que já estava nele.`,
};
const HOJE_PROCESSAR = (body) => ({ success: true, status: 'PROCESSADO', contas_pagar_id: null, ...body });

(async () => {
  console.log('\n=== Etapa 194 (T3): integracao da validade da nota no recebimento ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const get = (u) => request(app).get(u).then((x) => x);
  const post = (u, b = {}) => request(app).post(u).send(b).then((x) => x);
  const put = (u, b = {}) => request(app).put(u).send(b).then((x) => x);

  let seq = 0;
  const material = async () => {
    const c = `V194I-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario) VALUES (?, ?, 'UN', 0, 0, 1, 0, 1)`, [c, c])).lastID;
  };
  const lote = (m, codigo) => dbGet(db, 'SELECT * FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m, codigo]);
  const fisico = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual AS q FROM materiais_almoxarifado WHERE id = ?', [m])).q);
  /** Lote com saldo pela rota da Entrada manual (190), com ou sem validade. */
  const entrada = async (m, codigo, validade, qtd = 2) => {
    const r = await post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: qtd, lote: codigo, motivo: 'e194i',
      ...(validade ? { data_validade: validade } : {}) });
    assert.strictEqual(r.status, 201, `entrada: ${r.status} ${JSON.stringify(r.body)}`);
    return lote(m, codigo);
  };
  /** Nota direta no banco (como a conferencia a deixa); a validade entra depois, pelo /fiscal. */
  const nota = async (itens, { status = 'EM_ENTRADA_NF' } = {}) => {
    const rec = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, ?, ?, 'Acme I', '2026-11-01', '2026-11-02', 1000)`, [`REC-E194I-${++seq}`, status, `NF-E194I-${seq}`])).lastID;
    const ids = [];
    for (const it of itens) {
      ids.push((await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote, data_validade_lote)
        VALUES (?,?,3,3,?,?)`, [rec, it.m, it.lote, it.val === undefined ? null : it.val])).lastID);
    }
    return { rec, ids };
  };
  /** Dados fiscais pela rota, como o `salvarFiscal` da tela (reenvia a quantidade). */
  const fiscal = async (rec, id, val) => {
    const r = await put(`${API}/recebimentos/${rec}/fiscal`, { itens: [{ id, quantidade_recebida: 3, data_validade_lote: val }] });
    assert.strictEqual(r.status, 200, `fiscal ${val}: ${r.status} ${JSON.stringify(r.body)}`);
  };
  const previa = async (rec) => {
    const r = await get(`${API}/recebimentos/${rec}`);
    assert.strictEqual(r.status, 200, `GET ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.itens.map((i) => i.avisos_validade_lote);
  };
  const validadeNaLista = async (m, codigo) => {
    const r = await get(`${API}/materiais/${m}/lotes`);
    assert.strictEqual(r.status, 200, `lotes ${r.status} ${JSON.stringify(r.body)}`);
    const lista = Array.isArray(r.body) ? r.body : (r.body.lotes || r.body.data || []);
    const l = lista.find((x) => x.codigo === codigo);
    assert.ok(l, `lote ${codigo} fora da lista: ${JSON.stringify(r.body).slice(0, 300)}`);
    return l.data_validade;
  };
  const corrigir = (loteId, nova, vista) => put(`${API}/lotes/${loteId}/validade`,
    { data_validade: nova, validade_vista: vista, justificativa: 'a NF e a certa (e194i)' });
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const comPrazo = (p, ms, oque) => Promise.race([p, espera(ms).then(() => { throw new Error(`expirou: ${oque}`); })]);

  // ── 1. O fluxo do usuario pela rota ───────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-194.02/05/07 + 191] Dados fiscais -> previa no GET acompanha -> Processar avisa -> Corrigir validade (191) -> lista de lotes', async () => {
    const m = await material();
    const l = await entrada(m, 'L-FLX', '2027-03-31');
    const { rec, ids } = await nota([{ m, lote: 'L-FLX' }]);
    assert.deepStrictEqual(await previa(rec), [[]], 'sem data na nota: nada a avisar');
    await fiscal(rec, ids[0], '2027-06-30');
    assert.deepStrictEqual(await previa(rec), [[MSG.PREVIA_DIVERGENTE('L-FLX', '2027-03-31', '2027-06-30')]], 'previa depois do /fiscal');
    await fiscal(rec, ids[0], '2027-03-31');
    assert.deepStrictEqual(await previa(rec), [[]], 'a previa acompanha a correcao da data em Dados fiscais');
    await fiscal(rec, ids[0], '2027-06-30');
    const r = await post(`${API}/recebimentos/${rec}/processar`, {});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, HOJE_PROCESSAR({ avisos_validade: [MSG.NOTA_DIVERGENTE('L-FLX', '2027-03-31', '2027-06-30')] }));
    assert.strictEqual(await fisico(m), 5, 'a nota entrou');
    assert.deepStrictEqual(await previa(rec), [[]], 'item ja entrado: sem previa');
    // controle: sem a correcao, a lista mostra a validade de antes (a nota nao trocou a etiqueta sozinha)
    assert.strictEqual(await validadeNaLista(m, 'L-FLX'), '2027-03-31');
    const c = await corrigir(l.id, '2027-06-30', '2027-03-31');
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.strictEqual(await validadeNaLista(m, 'L-FLX'), '2027-06-30', 'a correcao da 191 vale na lista');
  });

  // ── 2. As outras portas + o estorno ───────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-194.04 + Fase 2 achado 6] /workflow processar preenche o lote sem validade; o estorno da entrada mantem a data', async () => {
    const m = await material();
    const l = await entrada(m, 'L-WF', null);
    const { rec, ids } = await nota([{ m, lote: 'L-WF' }]);
    await fiscal(rec, ids[0], '2030-06-30');
    assert.deepStrictEqual(await previa(rec), [[MSG.PREVIA_PREENCHER('L-WF', '2030-06-30')]]);
    assert.strictEqual((await lote(m, 'L-WF')).data_validade, null, 'controle: a previa nao grava');
    const r = await post(`${API}/recebimentos/${rec}/workflow`, { acao: 'processar' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.avisos_validade, [MSG.AVISO_PREENCHIDA('L-WF', '2030-06-30')]);
    assert.strictEqual(await validadeNaLista(m, 'L-WF'), '2030-06-30');
    assert.strictEqual(await fisico(m), 5);
    const movId = (await dbGet(db, 'SELECT movimentacao_entrada_id AS id FROM recebimentos_material_itens_almoxarifado WHERE id = ?',
      [ids[0]])).id;
    assert.ok(movId, 'premissa: o item tem o movimento da entrada');
    // estorno da entrada da nota pela rota de hoje
    const e = await post(`${API}/movimentacoes/${movId}/cancelar`, { motivo: 'estorno da nota e194i' });
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.strictEqual(await fisico(m), 2, 'o estorno tirou a nota');
    assert.ok((await dbGet(db, 'SELECT movimento_estorno_id AS x FROM movimentacoes_almoxarifado WHERE id = ?', [movId])).x,
      'premissa: o estorno concluiu');
    assert.strictEqual((await lote(m, 'L-WF')).data_validade, '2030-06-30', 'o estorno nao desfaz o preenchimento (mesma regra da 190)');
    const aud = await dbAll(db, `SELECT dados_novos FROM auditoria_log_almoxarifado WHERE entidade = 'lote' AND entidade_id = ?
      AND acao = 'VALIDADE_PREENCHIDA'`, [l.id]);
    assert.strictEqual(aud.length, 1);
    assert.strictEqual(JSON.parse(aud[0].dados_novos).movimento_id, movId, 'a auditoria aponta o movimento estornado');
    // a data se corrige pela 191 depois do estorno
    const c = await corrigir(l.id, '2030-12-31', '2030-06-30');
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
  });

  await test('[RN-194.07] /aprovar ramo direto (CONFERIDO_ALMOX) com a data do /fiscal divergente -> { success, avisos_validade }', async () => {
    const m = await material();
    await entrada(m, 'L-AP', '2027-03-31');
    const { rec, ids } = await nota([{ m, lote: 'L-AP' }], { status: 'CONFERIDO_ALMOX' });
    await fiscal(rec, ids[0], '2027-06-30');
    assert.deepStrictEqual(await previa(rec), [[MSG.PREVIA_DIVERGENTE('L-AP', '2027-03-31', '2027-06-30')]]);
    const r = await post(`${API}/recebimentos/${rec}/aprovar`, {});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, { success: true, avisos_validade: [MSG.NOTA_DIVERGENTE('L-AP', '2027-03-31', '2027-06-30')] });
    assert.strictEqual(await validadeNaLista(m, 'L-AP'), '2027-03-31');
    // controle: a mesma porta com a data que bate -> a resposta de hoje
    const b = await nota([{ m, lote: 'L-AP' }], { status: 'CONFERIDO_ALMOX' });
    await fiscal(b.rec, b.ids[0], '2027-03-31');
    const rb = await post(`${API}/recebimentos/${b.rec}/aprovar`, {});
    assert.deepStrictEqual(rb.body, { success: true });
  });

  // ── 3. A trava (RN-194.09, Fase 2 achado 1) ───────────────────────────────────────────────────────────────────────────────
  await test('[RN-194.09] a Corrigir validade (191) disparada durante o preencher da nota espera a secao soltar', async () => {
    const m = await material();
    const l = await entrada(m, 'L-TR', null);
    const { rec, ids } = await nota([{ m, lote: 'L-TR' }]);
    await fiscal(rec, ids[0], '2030-06-30');
    // O gancho so SINALIZA e segura; a correcao parte do contexto do teste (de dentro do gancho herdaria a secao e passaria direto).
    const original = lotService.preencherValidadeSeVazia;
    let sinal; const chegouNoPreencher = new Promise((r) => { sinal = r; });
    let abrir; const portao = new Promise((r) => { abrir = r; });
    lotService.preencherValidadeSeVazia = async (...args) => {
      if (args[2] === l.id) { sinal(); await portao; }
      return original.apply(lotService, args);
    };
    let proc; let correcao; let chegou = null;
    try {
      proc = post(`${API}/recebimentos/${rec}/processar`, {});
      await comPrazo(chegouNoPreencher, 5000, 'o processar nao chegou no preencher');
      correcao = corrigir(l.id, '2030-12-31', '2030-06-30').then((x) => { chegou = x; return x; });
      await espera(300);
      assert.strictEqual(chegou, null, `a correcao terminou com a secao da nota segura: ${chegou && chegou.status} `
        + `${chegou && JSON.stringify(chegou.body)}`);
      assert.strictEqual((await lote(m, 'L-TR')).data_validade, null, 'gravou com a secao segura');
    } finally {
      abrir();
      lotService.preencherValidadeSeVazia = original;
    }
    const rp = await comPrazo(proc, 5000, 'processar');
    assert.strictEqual(rp.status, 200, JSON.stringify(rp.body));
    assert.deepStrictEqual(rp.body.avisos_validade, [MSG.AVISO_PREENCHIDA('L-TR', '2030-06-30')]);
    const rc = await comPrazo(correcao, 5000, 'correcao');
    assert.strictEqual(rc.status, 200, `a correcao viu o lote ja preenchido como validade_vista: ${JSON.stringify(rc.body)}`);
    assert.strictEqual(await validadeNaLista(m, 'L-TR'), '2030-12-31');
  });

  // ── 4. O lote mudando entre a previa e o processar (Fase 2, achado 9) ─────────────────────────────────────────────────────
  /** Duas notas do mesmo lote INEXISTENTE (A sem data, B com), processadas juntas na ordem dada — forcada pela fila da trava. */
  const duasNotasJuntas = async (ordem) => {
    const m = await material();
    const a = await nota([{ m, lote: 'L-CC' }]);
    const b = await nota([{ m, lote: 'L-CC' }]);
    await fiscal(b.rec, b.ids[0], '2027-06-30');
    assert.deepStrictEqual(await previa(a.rec), [[]], 'previa A: lote inexistente');
    assert.deepStrictEqual(await previa(b.rec), [[]], 'previa B: lote inexistente');
    const notas = { A: a.rec, B: b.rec };
    let abrir; const portao = new Promise((r) => { abrir = r; });
    const segura = trava.comLockDoMaterial(m, () => portao); // do contexto do teste: a fila decide a ordem
    const original = trava.comLockDosMateriais; let naFila = 0;
    trava.comLockDosMateriais = (mats, fn) => {
      if ((mats || []).map(Number).includes(m)) naFila += 1;
      return original.call(trava, mats, fn);
    };
    const resp = {};
    try {
      const fila = async (n) => { const t0 = Date.now(); while (naFila < n) { if (Date.now() - t0 > 5000) throw new Error('fila'); await espera(5); } };
      const p1 = post(`${API}/recebimentos/${notas[ordem[0]]}/processar`, {});
      await fila(1);
      const p2 = post(`${API}/recebimentos/${notas[ordem[1]]}/processar`, {});
      await fila(2);
      abrir(); await segura;
      resp[ordem[0]] = await comPrazo(p1, 5000, ordem[0]);
      resp[ordem[1]] = await comPrazo(p2, 5000, ordem[1]);
    } finally { abrir(); trava.comLockDosMateriais = original; }
    for (const k of ['A', 'B']) assert.strictEqual(resp[k].status, 200, `${k}: ${JSON.stringify(resp[k].body)}`);
    assert.strictEqual(await fisico(m), 6);
    return { m, resp };
  };

  await test('[Fase 2 achado 9 (i)] duas /processar do mesmo lote inexistente, A (sem data) antes de B: B preenche e avisa', async () => {
    const { m, resp } = await duasNotasJuntas(['A', 'B']);
    assert.deepStrictEqual(resp.A.body, HOJE_PROCESSAR({}), 'A: lote nasce sem validade, sem aviso');
    assert.deepStrictEqual(resp.B.body, HOJE_PROCESSAR({ avisos_validade: [MSG.AVISO_PREENCHIDA('L-CC', '2027-06-30')] }),
      'B: a previa disse [] e a decisao foi refeita sob a trava');
    assert.strictEqual(await validadeNaLista(m, 'L-CC'), '2027-06-30');
  });

  await test('[Fase 2 achado 9 (i)] a ordem inversa, B (com data) antes de A: o lote nasce com a data, ninguem avisa', async () => {
    const { m, resp } = await duasNotasJuntas(['B', 'A']);
    assert.deepStrictEqual(resp.B.body, HOJE_PROCESSAR({}));
    assert.deepStrictEqual(resp.A.body, HOJE_PROCESSAR({}), 'A sem data num lote com validade: nada');
    assert.strictEqual(await validadeNaLista(m, 'L-CC'), '2027-06-30');
  });

  await test('[Fase 2 achado 9 (ii)] previa DIVERGENTE -> Corrigir validade (191) para a data da nota -> /processar e a resposta de hoje', async () => {
    const m = await material();
    const l = await entrada(m, 'L-MU', '2027-03-31');
    const { rec, ids } = await nota([{ m, lote: 'L-MU' }]);
    await fiscal(rec, ids[0], '2027-06-30');
    assert.deepStrictEqual(await previa(rec), [[MSG.PREVIA_DIVERGENTE('L-MU', '2027-03-31', '2027-06-30')]]);
    const c = await corrigir(l.id, '2027-06-30', '2027-03-31');
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.deepStrictEqual(await previa(rec), [[]], 'a previa relida acompanha a correcao');
    const r = await post(`${API}/recebimentos/${rec}/processar`, {});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, HOJE_PROCESSAR({}), 'o processar decide contra o lote de agora, nao contra a previa');
    // controle: o mesmo sem a correcao avisa
    const m2 = await material();
    await entrada(m2, 'L-MU', '2027-03-31');
    const n2 = await nota([{ m: m2, lote: 'L-MU' }]);
    await fiscal(n2.rec, n2.ids[0], '2027-06-30');
    const r2 = await post(`${API}/recebimentos/${n2.rec}/processar`, {});
    assert.deepStrictEqual(r2.body, HOJE_PROCESSAR({ avisos_validade: [MSG.NOTA_DIVERGENTE('L-MU', '2027-03-31', '2027-06-30')] }));
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
