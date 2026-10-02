/**
 * Etapa 70 (T2) — os GANCHOS do aviso de entrada, pelas ROTAS (e a corrida tambem pelo servico).
 *
 * `processarNota` e o ramo direto de `aprovarRecebimento` chamam
 * `receiptNotificationService.avisarEntradaConfirmada` DEPOIS do UPDATE de status terminal e do
 * `fecharSolicitacoesDoPedido`, em try/catch que so faz `console.warn` (RN-05). Quatro portas chegam
 * la: `/processar`, `/workflow` acao `processar`, `/aprovar` delegando (EM_ENTRADA_NF) e `/aprovar`
 * direto (RECEBIDO). O ramo que delega NAO chama de novo.
 *
 * Arquivo separado do da T1 (`recebimentoAvisoEntrada.api.test.js`, que chama o servico direto sobre
 * uma entrada feita sem gancho): aqui o gancho e quem chama, e chamar o servico de novo daria DUPLICADA.
 *
 * Executar: cd server && node tests/api/recebimentoAvisoEntradaRotas.api.test.js
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
const ADMIN = { id: 1, nome: 'Admin Ganchos', role: 'admin', is_superadmin: 1, email: 'admin-ganchos@x.com' };
const LITERAL_409 = 'Esta nota já está sendo processada';

let seq = 0;

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  const setCfg = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, "INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (601, 'Fulano', 'fulano@x.com', 1)");
  await setCfg('notificar_recebimento_entrada', '1');
  await setCfg('notificacoes_dest_recebimento', 'compras@x.com');

  async function material({ critico = 0, ativo = 1 } = {}) {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, material_critico)
      VALUES (?,?,'UN',0,?,?)`, [`G70-${seq}`, `Material gancho ${seq}`, ativo, critico])).lastID;
  }
  const codigo = async (id) => (await dbGet(db, 'SELECT codigo FROM materiais_almoxarifado WHERE id = ?', [id])).codigo;
  const saldo = async (id) => (await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;
  async function nota(itens, status = 'EM_ENTRADA_NF') {
    seq += 1;
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, ?, ?, 'Fornecedor Gancho', '2026-08-01', '2026-08-02', 100)`, [`REC-G70-${seq}`, status, `NF-G70-${seq}`])).lastID;
    for (const it of itens) {
      await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote) VALUES (?,?,?,?,?)`,
      [r, it.material_id, it.qtd, it.qtd, it.lote ?? null]);
    }
    return r;
  }
  async function requisicao(materialId, qtd) {
    seq += 1;
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 601, 'Fulano', 'AGUARDANDO_COMPRA')`, [`REQ-G70-${seq}`])).lastID;
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada)
      VALUES (?,?,?)`, [id, materialId, qtd]);
    return id;
  }
  const fila = (recId, evento) => dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado
    WHERE evento = ? AND json_extract(payload, '$.recebimento_id') = ? ORDER BY id`, [evento, recId]);
  const filaNota = (recId) => fila(recId, 'RECEBIMENTO_ENTRADA');
  const filaReq = (recId) => fila(recId, 'RECEBIMENTO_ENTRADA_REQUISITANTE');
  const post = (recId, acao, body = {}) => request(app).post(`/api/almoxarifado/recebimentos/${recId}/${acao}`).send(body);

  await test('RN-01 /processar: UMA linha da nota (nao uma por item), critico retido, resposta inalterada', async () => {
    const comum = await material(); const critico = await material({ critico: 1 });
    const rq = await requisicao(comum, 2);
    const r = await nota([{ material_id: comum, qtd: 5 }, { material_id: critico, qtd: 3 }]);
    const res = await post(r, 'processar');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body, { success: true, status: 'PROCESSADO', contas_pagar_id: null }, 'o aviso nao aparece na resposta');
    const linhas = await filaNota(r);
    assert.strictEqual(linhas.length, 1);
    assert.ok(new RegExp(`- ${await codigo(comum)} — [^\\n]*: 5 UN[^\\n]* — disponível`).test(linhas[0].corpo_texto), linhas[0].corpo_texto);
    assert.ok(new RegExp(`- ${await codigo(critico)} — [^\\n]*: 3 UN[^\\n]* — retido para inspeção`).test(linhas[0].corpo_texto), linhas[0].corpo_texto);
    const req = await filaReq(r);
    assert.strictEqual(req.length, 1);
    assert.strictEqual(JSON.parse(req[0].payload).requisicao_id, rq);
  });

  await test('RN-01 /workflow processar e /aprovar delegando: uma linha cada', async () => {
    const m1 = await material(); const r1 = await nota([{ material_id: m1, qtd: 1 }]);
    const w = await post(r1, 'workflow', { acao: 'processar' });
    assert.strictEqual(w.status, 200, JSON.stringify(w.body));
    assert.strictEqual((await filaNota(r1)).length, 1);
    const m2 = await material(); const r2 = await nota([{ material_id: m2, qtd: 1 }]);
    const a = await post(r2, 'aprovar');
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    assert.strictEqual(a.body.status, 'PROCESSADO');
    assert.strictEqual((await filaNota(r2)).length, 1);
  });

  await test('RN-01 /aprovar ramo direto (RECEBIDO -> APROVADO): uma linha', async () => {
    const m = await material(); const r = await nota([{ material_id: m, qtd: 2 }], 'RECEBIDO');
    const a = await post(r, 'aprovar');
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    assert.deepStrictEqual(a.body, { success: true });
    assert.strictEqual((await dbGet(db, 'SELECT status FROM recebimentos_material_almoxarifado WHERE id = ?', [r])).status, 'APROVADO');
    assert.strictEqual((await filaNota(r)).length, 1);
  });

  await test('RN-02 reprocessar: 400 nas duas portas e a fila continua com 1', async () => {
    const m = await material(); const r = await nota([{ material_id: m, qtd: 1 }]);
    assert.strictEqual((await post(r, 'processar')).status, 200);
    const p = await post(r, 'processar');
    assert.strictEqual(p.status, 400); assert.strictEqual(p.body.error, 'Nota já processada');
    const a = await post(r, 'aprovar');
    assert.strictEqual(a.status, 400); assert.strictEqual(a.body.error, 'Recebimento já aprovado/processado');
    assert.strictEqual((await filaNota(r)).length, 1);
  });

  await test('RN-02 corrida pela ROTA: [200, 409] e o aviso com o conteudo CERTO (critico retido, um requisitante)', async () => {
    const comum = await material(); const critico = await material({ critico: 1 });
    await requisicao(comum, 1); await requisicao(critico, 1);
    const r = await nota([{ material_id: comum, qtd: 5 }, { material_id: critico, qtd: 3 }]);
    const res = await Promise.all([1, 2].map(() => post(r, 'processar')));
    assert.deepStrictEqual(res.map((x) => x.status).sort(), [200, 409], JSON.stringify(res.map((x) => x.body)));
    assert.strictEqual(res.find((x) => x.status === 409).body.error, LITERAL_409);
    const linhas = await filaNota(r);
    assert.strictEqual(linhas.length, 1);
    assert.ok(new RegExp(`${await codigo(critico)} — [^\\n]* — retido para inspeção`).test(linhas[0].corpo_texto), linhas[0].corpo_texto);
    assert.strictEqual((await filaReq(r)).length, 1, 'so o material livre avisa o requisitante');
  });

  await test('RN-02 corrida pelo SERVICO (a sonda sonda70r-corrida2): um 409 e o critico "retido" no aviso', async () => {
    const a = await material({ critico: 1 }); const b = await material(); const c = await material();
    const r = await nota([{ material_id: b, qtd: 5 }, { material_id: c, qtd: 7 }, { material_id: a, qtd: 3 }]);
    const res = await Promise.all([1, 2].map(() => receiptService.processarNota(db, ADMIN, r)
      .then((v) => ({ ok: v }), (e) => ({ erro: e.message, status: e.status }))));
    // O CONTEUDO primeiro, de proposito: e o defeito da sonda (o perdedor chegava ao gancho antes de o
    // vencedor reter o critico, e o dedupe guardava "disponivel"). Asserido antes do 409 para que o
    // controle positivo (sem o claim da T0b) mostre ESTA falha, e nao so a contagem.
    const [l] = await filaNota(r);
    assert.ok(new RegExp(`${await codigo(a)} — [^\\n]* — retido para inspeção`).test(l.corpo_texto), l.corpo_texto);
    assert.ok(new RegExp(`${await codigo(b)} — [^\\n]* — disponível`).test(l.corpo_texto), l.corpo_texto);
    assert.strictEqual(JSON.parse(l.payload).itens, 3);
    assert.strictEqual(res.filter((x) => x.ok).length, 1, JSON.stringify(res));
    assert.deepStrictEqual(res.find((x) => x.erro), { erro: LITERAL_409, status: 409 });
  });

  await test('RN-03: pre-checagem recusa (400) sem aviso; corrigida, o aviso lista os dois itens', async () => {
    const bom = await material(); const inativo = await material({ ativo: 0 });
    const r = await nota([{ material_id: bom, qtd: 2 }, { material_id: inativo, qtd: 4 }]);
    const p = await post(r, 'processar');
    assert.strictEqual(p.status, 400, JSON.stringify(p.body));
    assert.strictEqual((await filaNota(r)).length, 0);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 1 WHERE id = ?', [inativo]);
    assert.strictEqual((await post(r, 'processar')).status, 200);
    const [l] = await filaNota(r);
    assert.ok(l.corpo_texto.includes(`${await codigo(bom)} — `) && l.corpo_texto.includes(`${await codigo(inativo)} — `), l.corpo_texto);
  });

  await test('RN-03 retomada apos falha PARCIAL (A entrou, B lancou): nenhum aviso; a retomada lista A e B', async () => {
    const a = await material(); const b = await material();
    const r = await nota([{ material_id: a, qtd: 10 }, { material_id: b, qtd: 5, lote: 'L-G70' }]);
    const original = lotService.criarOuObterLote;
    lotService.criarOuObterLote = async () => { throw Object.assign(new Error('falha simulada no lote'), { status: 400 }); };
    try {
      const p = await post(r, 'processar');
      assert.strictEqual(p.status, 400, JSON.stringify(p.body));
    } finally {
      lotService.criarOuObterLote = original;
    }
    assert.strictEqual(await saldo(a), 10);
    assert.strictEqual((await filaNota(r)).length, 0, 'a nota nao terminou: nada de aviso');
    assert.strictEqual((await post(r, 'processar')).status, 200);
    const [l] = await filaNota(r);
    assert.ok(l.corpo_texto.includes(`${await codigo(a)} — `), 'o A entrou na primeira passada e tem de estar no aviso');
    assert.ok(l.corpo_texto.includes(`${await codigo(b)} — `), l.corpo_texto);
  });

  await test('RN-07 pela rota: as duas chaves em 0 -> processar nao enfileira nada', async () => {
    await setCfg('notificar_recebimento_entrada', '0'); await setCfg('notificar_recebimento_solicitante', '0');
    const m = await material(); await requisicao(m, 1);
    const r = await nota([{ material_id: m, qtd: 1 }]);
    assert.strictEqual((await post(r, 'processar')).status, 200);
    assert.strictEqual((await filaNota(r)).length + (await filaReq(r)).length, 0);
    await setCfg('notificar_recebimento_entrada', '1'); await setCfg('notificar_recebimento_solicitante', '1');
  });

  await test('RN-10: com notificar_movimentacoes ligado, 2 MOVIMENTACAO + 1 RECEBIMENTO_ENTRADA', async () => {
    await setCfg('notificar_movimentacoes', '1'); await setCfg('notificacoes_dest_entradas', 'almox@x.com');
    const antes = (await dbGet(db, "SELECT COUNT(*) n FROM fila_notificacoes_almoxarifado WHERE evento = 'MOVIMENTACAO'")).n;
    const m1 = await material(); const m2 = await material();
    const r = await nota([{ material_id: m1, qtd: 1 }, { material_id: m2, qtd: 2 }]);
    assert.strictEqual((await post(r, 'processar')).status, 200);
    const depois = (await dbGet(db, "SELECT COUNT(*) n FROM fila_notificacoes_almoxarifado WHERE evento = 'MOVIMENTACAO'")).n;
    assert.strictEqual(depois - antes, 2);
    assert.strictEqual((await filaNota(r)).length, 1);
    await setCfg('notificar_movimentacoes', '0');
  });

  await test('D6: o status terminal NAO foi gravado (UPDATE falha) -> nenhum aviso; o gancho mora DEPOIS do UPDATE', async () => {
    const m = await material(); const r = await nota([{ material_id: m, qtd: 2 }]);
    await dbRun(db, `CREATE TRIGGER e70_trava_status BEFORE UPDATE OF status ON recebimentos_material_almoxarifado
      WHEN NEW.status = 'PROCESSADO' AND NEW.id = ${r} BEGIN SELECT RAISE(ABORT, 'falha simulada no UPDATE de status'); END`);
    try {
      const p = await post(r, 'processar');
      assert.strictEqual(p.status, 500, JSON.stringify(p.body));
    } finally {
      await dbRun(db, 'DROP TRIGGER e70_trava_status');
    }
    assert.strictEqual((await filaNota(r)).length, 0, 'aviso de nota que nao chegou a PROCESSADO');
  });

  // Por ultimo: quebra a tabela da fila.
  await test('RN-05: fila quebrada -> /processar 200, PROCESSADO, estoque creditado, console.warn com a literal', async () => {
    const m = await material(); const r = await nota([{ material_id: m, qtd: 4 }]);
    await dbRun(db, 'ALTER TABLE fila_notificacoes_almoxarifado RENAME TO fila_quebrada_e70');
    const avisos = [];
    const warn = console.warn;
    console.warn = (...a) => { avisos.push(a.join(' ')); };
    let res;
    try {
      res = await post(r, 'processar');
    } finally {
      console.warn = warn;
      await dbRun(db, 'ALTER TABLE fila_quebrada_e70 RENAME TO fila_notificacoes_almoxarifado');
    }
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'PROCESSADO');
    assert.strictEqual((await dbGet(db, 'SELECT status FROM recebimentos_material_almoxarifado WHERE id = ?', [r])).status, 'PROCESSADO');
    assert.strictEqual(await saldo(m), 4);
    assert.ok(avisos.some((x) => x.startsWith(`[recebimento] aviso de entrada confirmada falhou (recebimento ${r}): `)), JSON.stringify(avisos));
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
