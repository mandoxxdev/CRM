/**
 * Etapa 91 (T0, D4/B422, D5/B423, D7/B425) — a trava por material sai para um modulo proprio, com UM `Map`
 * so, e o `reservaChegadaService` ganha as variantes "ja sob a trava" (`sobTrava` + `pendencia`).
 *
 * Nenhuma porta muda nesta task: o que se prova aqui e o tronco que a T1 (aprovacao) e a T2 (liberacao)
 * vao usar — FIFO por material, ordem crescente sem repetir material, excecao solta, a fila da 75/76 e a
 * das portas sendo A MESMA, o teto da liberacao lido DENTRO da trava (era fora — achado da Fase 0 da 91),
 * a guarda L1 e a pendencia que adia recalculo e aviso para depois de soltar a trava.
 *
 * Toda espera que pode travar passa por `comPrazo` (5 s): um deadlock vira vermelho legivel, nao um
 * processo pendurado.
 *
 * Plano: docs/superpowers/plans/2026-10-08-almoxarifado-etapa91-inversao-inspecao-aprovar.md (T0).
 * Executar: cd server && node tests/api/travaPorMaterial.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const trava = require('../../services/almoxarifado/travaPorMaterial');
const rcs = require('../../services/almoxarifado/reservaChegadaService');
const receiptNotificationService = require('../../services/almoxarifado/receiptNotificationService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Adm 91t0', role: 'admin', is_superadmin: 1, email: 'a91t0@t.com' };
const L1 = (m) => `distribuicao sob trava chamada sem a trava do material ${m}`;
let seq = 0;

// Toda chamada que pode travar: estoura -> falha legivel (timer vivo, sem .unref()).
function comPrazo(p, ms, rotulo) {
  let t;
  const limite = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`${rotulo} não respondeu em ${ms / 1000} s — trava presa?`)), ms);
  });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}
// 'resolveu' | 'rejeitou' | 'pendente' depois de `ms`.
function estadoEm(p, ms) {
  let t;
  const pend = new Promise((r) => { t = setTimeout(() => r('pendente'), ms); });
  return Promise.race([p.then(() => 'resolveu', () => 'rejeitou'), pend]).finally(() => clearTimeout(t));
}
// O teste segura a trava de `m` ate chamar `soltar()`. `pegou` resolve quando a fn do teste esta rodando.
function segurar(m) {
  let soltar; let pegou;
  const dentro = new Promise((r) => { pegou = r; });
  const fim = trava.comLockDoMaterial(m, () => new Promise((r) => { soltar = r; pegou(); }));
  return { dentro, fim, soltar: () => soltar() };
}
const capturarWarn = async (fn) => {
  const orig = console.warn; const msgs = [];
  console.warn = (...a) => { msgs.push(a.join(' ')); };
  try { return { r: await fn(), msgs }; } finally { console.warn = orig; }
};

(async () => {
  console.log('\n=== Etapa 91 (T0): a trava por material, um Map so, e as variantes sob a trava ===\n');
  const { db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('F91T0','91000000000100','ativo')")).lastID;

  const material = async (q) => {
    const c = `E91T0-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', ?, 0, 1, ?, 0)`, [c, `Mat ${c}`, q, forn])).lastID;
  };
  // Requisicao esperando (valor ja aprovado: a distribuicao nao avalia valor ao vivo).
  const esperando = async (m, q, criado = '2026-09-01 10:00:00') => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo, data_aprovacao_valor)
      VALUES (?, 99, 'Sol 91t0', 'AGUARDANDO_ESTOQUE', 'NORMAL', ?, 1, '2026-09-01 10:00:00')`,
    [`REQ-E91T0-${++seq}`, criado])).lastID;
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
      VALUES (?,?,?,0,0,0)`, [id, m, q]);
    return id;
  };
  // Nota ja com entrada dada (o que a chegada distribui): item livre, sem inspecao.
  const notaComEntrada = async (m, q) => {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'PROCESSADO', ?, 'F91T0', '2026-09-01', '2026-09-02', 10)`, [`REC-E91T0-${++seq}`, `NF-E91T0-${seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, entrada_estoque_em)
      VALUES (?,?,?,?, CURRENT_TIMESTAMP)`, [r, m, q, q]);
    return r;
  };
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const holdDe = async (id) => (await dbAll(db, `SELECT quantidade - COALESCE(quantidade_utilizada,0) AS s
    FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'`, [id])).reduce((s, x) => s + Number(x.s), 0);
  const ctxDe = (m, q, doc) => ({ origem: 'INSPECAO', documento_id: doc, documento_numero: null, material_id: m, quantidade: q, recebimento_id: null });
  const forma = (res) => res.reservas.map((x) => ({ quantidade: x.quantidade, temReserva: !!x.reserva_id }));

  // ══════════════ (1) FIFO por material; materiais diferentes nao esperam ══════════════
  await test('(1) FIFO por material: a segunda secao do MESMO material so entra depois da primeira; outro material nao espera', async () => {
    const ordem = [];
    const a = segurar(910001);
    await comPrazo(a.dentro, 5000, 'primeira secao');
    const segunda = trava.comLockDoMaterial(910001, async () => { ordem.push('segunda'); });
    const terceira = trava.comLockDoMaterial(910001, async () => { ordem.push('terceira'); });
    const outro = trava.comLockDoMaterial(910002, async () => { ordem.push('outro'); return 'ok'; });
    assert.strictEqual(await comPrazo(outro, 5000, 'outro material'), 'ok');
    assert.strictEqual(await estadoEm(segunda, 100), 'pendente', 'a segunda entrou com a primeira presa');
    assert.strictEqual(trava.travado(910001), true);
    ordem.push('primeira-solta');
    a.soltar();
    await comPrazo(Promise.all([a.fim, segunda, terceira]), 5000, 'fila do material');
    assert.deepStrictEqual(ordem, ['outro', 'primeira-solta', 'segunda', 'terceira']);
    assert.strictEqual(trava.travado(910001), false, 'ninguem segura nem espera: a chave sai do Map');
    assert.strictEqual(trava.travado(910002), false);
  });

  // ══════════════ (2) varios materiais: DISTINCT, crescente; lista vazia ══════════════
  await test('(2) comLockDosMateriais([900003,900001,900003]) pega 900001 e 900003 uma vez cada, em ordem crescente; lista vazia chama fn', async () => {
    const orig = trava.comLockDoMaterial;
    const pegou = [];
    trava.comLockDoMaterial = (m, fn) => { pegou.push(Number(m)); return orig(m, fn); };
    let dentro;
    try {
      dentro = await comPrazo(trava.comLockDosMateriais([900003, '900001', 900003, 'x', null],
        async () => [trava.travado(900001), trava.travado(900003)]), 5000, 'comLockDosMateriais');
    } finally { trava.comLockDoMaterial = orig; }
    assert.deepStrictEqual(pegou, [900001, 900003], 'uma vez cada, crescente, sem o id invalido');
    assert.deepStrictEqual(dentro, [true, true], 'a fn roda segurando os dois');
    assert.deepStrictEqual([trava.travado(900001), trava.travado(900003)], [false, false]);
    assert.strictEqual(await comPrazo(trava.comLockDosMateriais([], async () => 'vazia'), 5000, 'lista vazia'), 'vazia');
    assert.strictEqual(await comPrazo(trava.comLockDosMateriais(null, () => 'nula'), 5000, 'lista nula'), 'nula');
  });

  // ══════════════ (3) excecao solta e relanca ══════════════
  await test('(3) excecao dentro da fn solta a trava e e relancada; travado volta a false e o proximo entra', async () => {
    await assert.rejects(comPrazo(trava.comLockDoMaterial(910003, async () => { throw new Error('quebrou 91'); }), 5000, 'secao que lanca'),
      /quebrou 91/);
    assert.strictEqual(trava.travado(910003), false);
    assert.strictEqual(await comPrazo(trava.comLockDoMaterial(910003, async () => 'depois'), 5000, 'proxima secao'), 'depois');
    await assert.rejects(comPrazo(trava.comLockDosMateriais([910004, 910005], async () => { throw new Error('quebrou 91b'); }), 5000, 'varios'),
      /quebrou 91b/);
    assert.deepStrictEqual([trava.travado(910004), trava.travado(910005)], [false, false]);
  });

  // ══════════════ (4) o mesmo Map: o rcs espera a trava do modulo ══════════════
  await test('(4) mesmo Map: com a trava do modulo presa, recalcularStatusSobTrava e reservarLiberacaoParaQuemEspera (sem opcao) esperam', async () => {
    const m = await material(0);
    const R = await esperando(m, 4);
    const h = segurar(m);
    await comPrazo(h.dentro, 5000, 'segurar');
    const pRec = rcs.recalcularStatusSobTrava(db, R);
    const pLib = rcs.reservarLiberacaoParaQuemEspera(db, ADMIN, ctxDe(m, 4, 9101));
    try {
      assert.strictEqual(await estadoEm(pRec, 150), 'pendente', 'o recalculo nao esperou a trava do modulo (Map proprio?)');
      assert.strictEqual(await estadoEm(pLib, 150), 'pendente', 'a liberacao nao esperou a trava do modulo (Map proprio?)');
    } finally { h.soltar(); }
    await comPrazo(Promise.all([h.fim, pRec, pLib]), 5000, 'depois de soltar');
    assert.strictEqual(trava.travado(m), false);
  });

  // ══════════════ (5) o teto da liberacao e lido DENTRO da trava ══════════════
  await test('(5) teto sob a trava: disponivel 0 quando chamada, 4 postos enquanto a trava esta presa -> reserva 4 para R1', async () => {
    const m = await material(0);
    const R1 = await esperando(m, 4);
    const h = segurar(m);
    await comPrazo(h.dentro, 5000, 'segurar');

    // Marcador: o PRIMEIRO de (a) o SELECT do disponivel do material resolvido ou (b) a chamada enfileirada
    // na trava. Sem isto, no caminho antigo o teto poderia ser lido DEPOIS de os 4 entrarem.
    let marcar; const marcou = new Promise((r) => { marcar = r; });
    const origGet = db.get;
    db.get = function (sql, params, cb) {
      if (/disponivel/i.test(sql) && /FROM materiais_almoxarifado/.test(sql) && Array.isArray(params) && Number(params[0]) === m) {
        return origGet.call(this, sql, params, function (...a) { const r = cb.apply(this, a); marcar('select'); return r; });
      }
      return origGet.call(this, sql, params, cb);
    };
    const origLock = trava.comLockDoMaterial;
    trava.comLockDoMaterial = (mm, fn) => { if (Number(mm) === m) marcar('fila'); return origLock(mm, fn); };
    let p;
    try {
      p = rcs.reservarLiberacaoParaQuemEspera(db, ADMIN, ctxDe(m, 4, 9102));
      await comPrazo(marcou, 5000, 'marcador do teto');
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 4 WHERE id = ?', [m]);
    } finally {
      db.get = origGet; trava.comLockDoMaterial = origLock; h.soltar();
    }
    const res = await comPrazo(p, 5000, 'reservarLiberacaoParaQuemEspera');
    assert.deepStrictEqual(res.reservas.map((x) => [x.requisicao_id, x.quantidade]), [[R1, 4]],
      `o teto foi lido fora da trava (antes de os 4 entrarem): ${JSON.stringify(res)}`);
    assert.strictEqual(await st(R1), 'TOTALMENTE_RESERVADA');
    assert.strictEqual(await holdDe(R1), 4);
  });

  // ══════════════ (6) sobTrava SEM a trava -> L1 ══════════════
  await test('(6) sobTrava sem ninguem na trava: reservarLiberacao e reservarChegada lancam L1 e nao reservam; aposLiberacaoSemFalhar engole e loga L1', async () => {
    const m = await material(4);
    const R = await esperando(m, 4);
    const rec = await notaComEntrada(m, 4);
    assert.strictEqual(trava.travado(m), false, 'premissa: ninguem segura nem espera');
    const pend = rcs.novaPendencia();
    await assert.rejects(rcs.reservarLiberacaoParaQuemEspera(db, ADMIN, ctxDe(m, 4, 9103), undefined, { sobTrava: true, pendencia: pend }),
      (e) => e.message === L1(m));
    await assert.rejects(rcs.reservarChegadaParaQuemEspera(db, ADMIN, rec, { sobTrava: true, pendencia: pend }),
      (e) => e.message === L1(m));
    const { r, msgs } = await capturarWarn(() => rcs.aposLiberacaoSemFalhar(db, ADMIN, ctxDe(m, 4, 9104), { sobTrava: true, pendencia: pend }));
    assert.ok(msgs.includes(`[almoxarifado-reservas] reserva na liberacao falhou (INSPECAO 9104): ${L1(m)}`), JSON.stringify(msgs));
    assert.deepStrictEqual(r.reservas, []);
    assert.strictEqual(await holdDe(R), 0, 'nada reservado sem a trava');
    assert.strictEqual(await st(R), 'AGUARDANDO_ESTOQUE');
    await comPrazo(rcs.concluirPendencia(db, ADMIN, pend), 5000, 'concluirPendencia');
  });

  // ══════════════ (7) sobTrava COM a trava: mesmo resultado, status e aviso so depois ══════════════
  await test('(7) sobTrava com a trava: reservas iguais ao caminho sem opcao; status vazio ate concluirPendencia; aviso so no concluir', async () => {
    // Espelho: m1 pelo caminho sem opcao, m2 pela variante sob a trava (liberacao) e m3 (chegada).
    const m1 = await material(4); const R1 = await esperando(m1, 4);
    const m2 = await material(4); const R2 = await esperando(m2, 4);
    const m3 = await material(4); const R3 = await esperando(m3, 4); const rec3 = await notaComEntrada(m3, 4);
    const semOpcao = await comPrazo(rcs.reservarLiberacaoParaQuemEspera(db, ADMIN, ctxDe(m1, 4, 9105)), 5000, 'sem opcao');
    assert.deepStrictEqual(semOpcao.status.map((x) => [x.requisicao_id, x.de, x.para]), [[R1, 'AGUARDANDO_ESTOQUE', 'TOTALMENTE_RESERVADA']]);

    const origAviso = receiptNotificationService.avisarLiberacao;
    const avisos = [];
    receiptNotificationService.avisarLiberacao = async (dbx, u, ctx, resultado) => {
      avisos.push({ doc: ctx.documento_id, status: resultado.status.map((x) => x.para), reservas: resultado.reservas.length });
    };
    const pend = rcs.novaPendencia();
    let lib; let cheg; let apos; let durante;
    try {
      await comPrazo(trava.comLockDosMateriais([m2, m3], async () => {
        lib = await rcs.reservarLiberacaoParaQuemEspera(db, ADMIN, ctxDe(m2, 4, 9106), undefined, { sobTrava: true, pendencia: pend });
        cheg = await rcs.reservarChegadaParaQuemEspera(db, ADMIN, rec3, { sobTrava: true, pendencia: pend });
        durante = { st2: await st(R2), st3: await st(R3), lib: lib.status.length, cheg: cheg.status.length };
      }), 5000, 'secao sob a trava');
      assert.deepStrictEqual(forma(lib), forma(semOpcao), 'as reservas sob a trava sao as do caminho sem opcao');
      assert.deepStrictEqual(lib.reservas.map((x) => x.requisicao_id), [R2]);
      assert.deepStrictEqual(cheg.reservas.map((x) => [x.requisicao_id, x.quantidade]), [[R3, 4]]);
      assert.deepStrictEqual(durante, { st2: 'AGUARDANDO_ESTOQUE', st3: 'AGUARDANDO_ESTOQUE', lib: 0, cheg: 0 },
        'sob a trava ninguem recalcula');
      assert.strictEqual(pend.distribuicoes.length, 2);

      // aposLiberacaoSemFalhar sob a trava: o aviso vai para a pendencia, nao sai agora.
      const m4 = await material(4); const R4 = await esperando(m4, 4);
      await comPrazo(trava.comLockDoMaterial(m4, async () => {
        apos = await rcs.aposLiberacaoSemFalhar(db, ADMIN, ctxDe(m4, 4, 9107), { sobTrava: true, pendencia: pend });
      }), 5000, 'apos sob a trava');
      assert.deepStrictEqual(apos.reservas.map((x) => x.requisicao_id), [R4]);
      assert.deepStrictEqual(avisos, [], 'o aviso nao sai de dentro da secao');
      assert.strictEqual(pend.avisos.length, 1);

      await comPrazo(rcs.concluirPendencia(db, ADMIN, pend), 5000, 'concluirPendencia');
      assert.deepStrictEqual(lib.status.map((x) => [x.requisicao_id, x.para]), [[R2, 'TOTALMENTE_RESERVADA']]);
      assert.deepStrictEqual(cheg.status.map((x) => [x.requisicao_id, x.para]), [[R3, 'TOTALMENTE_RESERVADA']]);
      assert.deepStrictEqual([await st(R2), await st(R3), await st(R4)], ['TOTALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA']);
      assert.deepStrictEqual(avisos, [{ doc: 9107, status: ['TOTALMENTE_RESERVADA'], reservas: 1 }],
        'o aviso sai depois do recalculo, com o status ja preenchido');
    } finally { receiptNotificationService.avisarLiberacao = origAviso; }
  });

  await test('(7b) concluirPendencia com o recalculo lancando: nao lanca e loga a literal falhaRecalculo de hoje', async () => {
    const m = await material(4); const R = await esperando(m, 4);
    const pend = rcs.novaPendencia();
    await comPrazo(trava.comLockDoMaterial(m, () => rcs.reservarLiberacaoParaQuemEspera(db, ADMIN, ctxDe(m, 4, 9108), undefined,
      { sobTrava: true, pendencia: pend })), 5000, 'secao');
    const orig = rcs.recalcularStatusSobTrava;
    rcs.recalcularStatusSobTrava = async () => { throw new Error('recalculo caiu 91'); };
    let res;
    try {
      res = await capturarWarn(() => comPrazo(rcs.concluirPendencia(db, ADMIN, pend), 5000, 'concluirPendencia'));
    } finally { rcs.recalcularStatusSobTrava = orig; }
    assert.ok(res.msgs.includes(`[almoxarifado-reservas] recalculo do status apos a reserva na liberacao falhou (INSPECAO 9108, requisicao ${R}): recalculo caiu 91`),
      JSON.stringify(res.msgs));
    assert.strictEqual(await holdDe(R), 4, 'a reserva fica (o status e efeito)');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
