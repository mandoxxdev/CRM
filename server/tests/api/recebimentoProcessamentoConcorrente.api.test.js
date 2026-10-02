/**
 * Etapa 70, T0b — claim no nivel do RECEBIMENTO: dois "Processar Nota" ao mesmo tempo.
 *
 * O defeito (importante da Fase 2 da Etapa 70, sonda `sonda70r-corrida2.js`): os dois cliques
 * passavam a checagem de status (os dois liam `EM_ENTRADA_NF`), o claim POR ITEM fazia so um mover
 * cada item, mas OS DOIS seguiam ate o fim — `gerarContaPagar` duas vezes (a conta a pagar em
 * dobro, Surpresa 5 do plano) e o gancho pos-entrada rodando no PERDEDOR antes de o vencedor
 * terminar o laco (o perdedor lia o material critico como "disponivel", porque a QUARENTENA do
 * vencedor ainda nao tinha acontecido).
 *
 * A correcao: `processando_em` no recebimento, `UPDATE ... WHERE processando_em IS NULL` (ou velho
 * demais — processo que morreu no meio nao trava a nota para sempre) `AND status` nao terminal. O
 * perdedor toma 409 "Esta nota já está sendo processada"; o vencedor limpa a marca no `finally`
 * (a falha parcial continua retomavel). Vale para `processarNota` e para o ramo direto de
 * `aprovarRecebimento`.
 *
 * Executar: cd server && node tests/api/recebimentoProcessamentoConcorrente.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Corrida', role: 'admin' };
const LITERAL_409 = 'Esta nota já está sendo processada';

let seq = 0;
async function novoMaterial(db, { critico = 0 } = {}) {
  seq += 1;
  return (await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, ativo, material_critico) VALUES (?,?,'UN',0,1,?)`,
  [`C70-${seq}`, `Material corrida ${seq}`, critico])).lastID;
}
async function recebimentoCom(db, itens, status = 'EM_ENTRADA_NF') {
  seq += 1;
  const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
    (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
    VALUES (?, ?, ?, 'Acme Corrida', '2026-08-01', '2026-08-02', 100)`, [`REC-C70-${seq}`, status, `NF-C70-${seq}`]);
  for (const it of itens) {
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote) VALUES (?,?,?,?,?)`,
    [rec.lastID, it.material_id, it.qtd, it.qtd, it.lote ?? null]);
  }
  return rec.lastID;
}
const saldo = async (db, id) => (await dbGet(db,
  'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;
const recRow = (db, id) => dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [id]);
const contasDe = (db, numero) => dbAll(db, 'SELECT id FROM contas_pagar WHERE descricao LIKE ?', [`%${numero}`]);
const resultado = (p) => p.then((v) => ({ ok: v }), (e) => ({ erro: e.message, status: e.status }));

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  // A conta a pagar so e gerada quando a tabela existe (`gerarContaPagar`); o harness nao a cria.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS contas_pagar (id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT, fornecedor TEXT, valor REAL, data_vencimento TEXT, status TEXT, categoria TEXT, observacoes TEXT)`);

  await test('servico: dois processarNota simultaneos — um processa, o outro toma 409 literal; UMA conta a pagar', async () => {
    const critico = await novoMaterial(db, { critico: 1 });
    const comum = await novoMaterial(db);
    const r = await recebimentoCom(db, [{ material_id: comum, qtd: 5 }, { material_id: critico, qtd: 3 }]);
    const res = await Promise.all([1, 2].map(() => resultado(receiptService.processarNota(db, ADMIN, r))));
    const ok = res.filter((x) => x.ok);
    const erros = res.filter((x) => x.erro);
    assert.strictEqual(ok.length, 1, JSON.stringify(res));
    assert.strictEqual(erros.length, 1, JSON.stringify(res));
    assert.strictEqual(erros[0].erro, LITERAL_409);
    assert.strictEqual(erros[0].status, 409);
    assert.strictEqual(ok[0].ok.status, 'PROCESSADO');
    const rec = await recRow(db, r);
    assert.strictEqual(rec.status, 'PROCESSADO');
    assert.strictEqual(rec.processando_em, null, 'o vencedor limpa a marca no finally');
    assert.strictEqual((await contasDe(db, rec.numero)).length, 1, 'a conta a pagar nao pode sair em dobro');
    assert.strictEqual(await saldo(db, comum), 5);
    assert.strictEqual(await saldo(db, critico), 3);
    const retido = await dbGet(db, `SELECT quantidade_em_inspecao FROM recebimentos_material_itens_almoxarifado
      WHERE recebimento_id = ? AND material_id = ?`, [r, critico]);
    assert.strictEqual(retido.quantidade_em_inspecao, 3, 'o critico entrou retido uma vez');
  });

  await test('ROTA: dois /processar simultaneos -> [200, 409] com a literal', async () => {
    const m = await novoMaterial(db);
    const r = await recebimentoCom(db, [{ material_id: m, qtd: 4 }]);
    const res = await Promise.all([1, 2].map(() => request(app)
      .post(`/api/almoxarifado/recebimentos/${r}/processar`).send({})));
    const statuses = res.map((x) => x.status).sort();
    assert.deepStrictEqual(statuses, [200, 409], JSON.stringify(res.map((x) => x.body)));
    assert.strictEqual(res.find((x) => x.status === 409).body.error, LITERAL_409);
    assert.strictEqual(await saldo(db, m), 4);
    assert.strictEqual((await contasDe(db, (await recRow(db, r)).numero)).length, 1);
  });

  await test('servico: dois aprovarRecebimento (ramo direto) simultaneos — um aprova, o outro 409', async () => {
    const m = await novoMaterial(db);
    const r = await recebimentoCom(db, [{ material_id: m, qtd: 2 }], 'RECEBIDO');
    const res = await Promise.all([1, 2].map(() => resultado(receiptService.aprovarRecebimento(db, ADMIN, r))));
    assert.strictEqual(res.filter((x) => x.ok).length, 1, JSON.stringify(res));
    const erro = res.find((x) => x.erro);
    assert.ok(erro, JSON.stringify(res));
    assert.strictEqual(erro.erro, LITERAL_409);
    assert.strictEqual(erro.status, 409);
    const rec = await recRow(db, r);
    assert.strictEqual(rec.status, 'APROVADO');
    assert.strictEqual(rec.processando_em, null);
    assert.strictEqual(await saldo(db, m), 2);
  });

  await test('em sequencia (sem corrida) o segundo continua tomando o 400 "Nota já processada"', async () => {
    const m = await novoMaterial(db);
    const r = await recebimentoCom(db, [{ material_id: m, qtd: 1 }]);
    await receiptService.processarNota(db, ADMIN, r);
    await assert.rejects(() => receiptService.processarNota(db, ADMIN, r),
      (e) => e.message === 'Nota já processada' && e.status === 400);
  });

  await test('pre-checagem recusa (400): a marca e limpa e a nota corrigida processa', async () => {
    const inativo = await novoMaterial(db);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [inativo]);
    const r = await recebimentoCom(db, [{ material_id: inativo, qtd: 2 }]);
    await assert.rejects(() => receiptService.processarNota(db, ADMIN, r), (e) => e.status === 400);
    assert.strictEqual((await recRow(db, r)).processando_em, null, 'a recusa nao pode deixar a nota travada');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 1 WHERE id = ?', [inativo]);
    const ok = await receiptService.processarNota(db, ADMIN, r);
    assert.strictEqual(ok.status, 'PROCESSADO');
    assert.strictEqual(await saldo(db, inativo), 2);
  });

  await test('falha parcial (A entra, B lanca depois do claim): marca limpa e a retomada processa so o B', async () => {
    const a = await novoMaterial(db);
    const b = await novoMaterial(db);
    const r = await recebimentoCom(db, [{ material_id: a, qtd: 10 }, { material_id: b, qtd: 5, lote: 'L-C70' }]);
    const original = lotService.criarOuObterLote;
    lotService.criarOuObterLote = async () => { throw Object.assign(new Error('falha simulada no lote'), { status: 400 }); };
    try {
      await assert.rejects(() => receiptService.processarNota(db, ADMIN, r), /falha simulada/);
    } finally {
      lotService.criarOuObterLote = original;
    }
    const meio = await recRow(db, r);
    assert.strictEqual(meio.status, 'EM_ENTRADA_NF');
    assert.strictEqual(meio.processando_em, null, 'a falha parcial tem de continuar retomavel');
    const ok = await receiptService.processarNota(db, ADMIN, r);
    assert.strictEqual(ok.status, 'PROCESSADO');
    assert.strictEqual(await saldo(db, a), 10, 'A nao entra de novo');
    assert.strictEqual(await saldo(db, b), 5);
  });

  await test('marca recente de outro processamento -> 409; marca velha (processo que morreu) nao trava', async () => {
    const m = await novoMaterial(db);
    const r = await recebimentoCom(db, [{ material_id: m, qtd: 3 }]);
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET processando_em = datetime('now') WHERE id = ?", [r]);
    await assert.rejects(() => receiptService.processarNota(db, ADMIN, r),
      (e) => e.message === LITERAL_409 && e.status === 409);
    assert.strictEqual(await saldo(db, m), 0, 'o 409 nao move nada');
    assert.notStrictEqual((await recRow(db, r)).processando_em, null, 'o perdedor NAO limpa a marca do outro');
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET processando_em = datetime('now', '-11 minutes') WHERE id = ?", [r]);
    const ok = await receiptService.processarNota(db, ADMIN, r);
    assert.strictEqual(ok.status, 'PROCESSADO');
    assert.strictEqual(await saldo(db, m), 3);
    assert.strictEqual((await recRow(db, r)).processando_em, null);
  });


  // ---------------------------------------------------------------------------------------------
  // Etapa 70, Fase 5 (fix-round, MENOR) — o DONO da marca. A marca vence em 10 min (sem isso um
  // processo morto trava a nota), mas um processamento LONGO perdia a nota no meio: o segundo
  // reivindicava a marca vencida, os dois iam ate o fim e saiam DUAS contas a pagar (sonda
  // `sonda70f-claim.js` (b): contas [2, 3]); e `liberarProcessamento` zerava a marca sem conferir de
  // quem era — o primeiro, ao terminar, apagava a marca do segundo ainda em voo.
  // Agora a marca e unica por execucao; a liberacao so limpa a PROPRIA; e o ponto que cria a conta
  // a pagar confere que a marca ainda e sua (se perdeu: nao cria, `console.warn`, 409 literal).
  // ---------------------------------------------------------------------------------------------
  const envelhecerMarca = (r) => dbRun(db, `UPDATE recebimentos_material_almoxarifado
    SET processando_em = datetime('now', '-11 minutes') || substr(processando_em, 20) WHERE id = ?`, [r]);
  const capturarWarn = async (fn) => {
    const orig = console.warn; const msgs = [];
    console.warn = (...a) => { msgs.push(a.join(' ')); };
    try { return { valor: await fn(), msgs }; } finally { console.warn = orig; }
  };

  await test('DONO: processamento longo perde a marca vencida para outro — UMA conta a pagar, o primeiro toma 409 e avisa no log', async () => {
    const m = await novoMaterial(db);
    const r = await recebimentoCom(db, [{ material_id: m, qtd: 4, lote: 'L-DONO-1' }]);
    const original = lotService.criarOuObterLote;
    let resB; let disparou = false;
    lotService.criarOuObterLote = async (d, u, p) => {
      if (!disparou) {
        disparou = true;
        await envelhecerMarca(r); // A esta em voo ha mais de 10 min
        resB = await resultado(receiptService.processarNota(db, { ...ADMIN, nome: 'B' }, r));
      }
      return original(d, u, p);
    };
    let resA; let msgs;
    try {
      ({ valor: resA, msgs } = await capturarWarn(() => resultado(receiptService.processarNota(db, { ...ADMIN, nome: 'A' }, r))));
    } finally {
      lotService.criarOuObterLote = original;
    }
    assert.ok(resB.ok, `B assumiu a marca vencida e processou: ${JSON.stringify(resB)}`);
    const rec = await recRow(db, r);
    assert.strictEqual((await contasDe(db, rec.numero)).length, 1, 'a conta a pagar nao pode sair em dobro (era: 2)');
    assert.strictEqual(rec.contas_pagar_id, resB.ok.contas_pagar_id, 'A nao sobrescreve a conta de B');
    assert.deepStrictEqual(resA, { erro: LITERAL_409, status: 409 }, 'A perdeu a marca: recusa com a literal');
    assert.ok(msgs.some((x) => x.includes(`[recebimento] a marca de processamento passou a outra execucao (recebimento ${r})`)),
      `console.warn com a literal: ${JSON.stringify(msgs)}`);
    assert.strictEqual(rec.status, 'PROCESSADO');
    assert.strictEqual(await saldo(db, m), 4, 'o estoque entrou uma vez');
    assert.strictEqual(rec.processando_em, null);
  });

  await test('DONO: marca vencida mas NINGUEM assumiu — o dono termina normalmente, com a conta', async () => {
    const m = await novoMaterial(db);
    const r = await recebimentoCom(db, [{ material_id: m, qtd: 2, lote: 'L-DONO-2' }]);
    const original = lotService.criarOuObterLote;
    let disparou = false;
    lotService.criarOuObterLote = async (d, u, p) => {
      if (!disparou) { disparou = true; await envelhecerMarca(r); }
      return original(d, u, p);
    };
    let ok;
    try { ok = await receiptService.processarNota(db, ADMIN, r); } finally { lotService.criarOuObterLote = original; }
    assert.strictEqual(ok.status, 'PROCESSADO');
    const rec = await recRow(db, r);
    assert.strictEqual((await contasDe(db, rec.numero)).length, 1, 'a expiracao sozinha nao tira a posse');
    assert.strictEqual(rec.processando_em, null, 'e a propria marca (envelhecida) e liberada');
  });

  await test('DONO: a liberacao so limpa a PROPRIA marca — a do outro em voo continua', async () => {
    const m = await novoMaterial(db);
    const r = await recebimentoCom(db, [{ material_id: m, qtd: 3, lote: 'L-DONO-3' }]);
    const original = lotService.criarOuObterLote;
    const MARCA_DO_OUTRO = '2099-01-01 00:00:00 #outra-execucao';
    lotService.criarOuObterLote = async () => {
      // outra execucao assumiu a nota (marca vencida) e esta em voo; A falha em seguida
      await dbRun(db, 'UPDATE recebimentos_material_almoxarifado SET processando_em = ? WHERE id = ?', [MARCA_DO_OUTRO, r]);
      throw Object.assign(new Error('falha simulada depois de perder a marca'), { status: 400 });
    };
    try {
      await assert.rejects(() => receiptService.processarNota(db, ADMIN, r), /falha simulada/);
    } finally {
      lotService.criarOuObterLote = original;
    }
    assert.strictEqual((await recRow(db, r)).processando_em, MARCA_DO_OUTRO, 'o finally de A nao apaga a marca de quem esta em voo');
  });

  await test('DONO: o mesmo vale no ramo direto de aprovarRecebimento (liberacao confere o dono)', async () => {
    const m = await novoMaterial(db);
    const r = await recebimentoCom(db, [{ material_id: m, qtd: 3, lote: 'L-DONO-4' }], 'RECEBIDO');
    const original = lotService.criarOuObterLote;
    const MARCA_DO_OUTRO = '2099-01-01 00:00:00 #outra-execucao-aprovar';
    lotService.criarOuObterLote = async () => {
      await dbRun(db, 'UPDATE recebimentos_material_almoxarifado SET processando_em = ? WHERE id = ?', [MARCA_DO_OUTRO, r]);
      throw Object.assign(new Error('falha simulada no aprovar'), { status: 400 });
    };
    try {
      await assert.rejects(() => receiptService.aprovarRecebimento(db, ADMIN, r), /falha simulada/);
    } finally {
      lotService.criarOuObterLote = original;
    }
    assert.strictEqual((await recRow(db, r)).processando_em, MARCA_DO_OUTRO);
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
