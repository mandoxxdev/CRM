/**
 * Etapa 129 — integracao (RN-08 da C266 e RN-17 das perdas com valor). Cruza portas:
 *  - o recebimento pelo ramo direto (criar -> conferir -> finalizar -> /aprovar) e pelo fluxo fiscal (... -> faturamento -> /fiscal ->
 *    conferir -> /processar), com a conferencia depois da entrada recusada pela ROTA e pelo SERVICO, e a divergencia descoberta
 *    depois registrada pela NAO CONFORMIDADE manual (o caminho que sobra, B830);
 *  - a A77 (o SQL do documento de novidades, copiado aqui) contra estados legados montados por SQL e contra os limpos das portas;
 *  - a perda pela rota real (`/movimentacoes/v2`, motivo do cadastro), o relatorio `perdas-por-motivo` e o estorno pela rota.
 *
 * Executar: cd server && node tests/api/conferenciaDepoisDaEntradaIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };
const API = '/api/almoxarifado';
const L2 = 'Recebimento já deu entrada no estoque — a conferência não pode mais mudar quantidade nem situação; '
  + 'se a contagem estava errada, corrija o estoque por um ajuste (perfil Administrador ou Almoxarife do almoxarifado)';

// A77 — o MESMO texto do documento de novidades (letra A). Mudou la, muda aqui.
const A77 = `SELECT r.id AS recebimento_id, r.numero, r.status, r.created_at AS recebido_em, ri.id AS item_id, m.codigo AS material,
       CAST(COALESCE(CASE WHEN ri.quantidade_recebida IS NULL
              OR (typeof(ri.quantidade_recebida) = 'text' AND TRIM(ri.quantidade_recebida) = '')
            THEN ri.quantidade_esperada ELSE ri.quantidade_recebida END, 0) AS REAL) AS no_documento,
       mv.quantidade AS entrou, COALESCE(mv.cancelado, 0) AS entrada_estornada, ri.entrada_estoque_em,
       CASE WHEN ri.entrada_estoque_em IS NULL THEN 'SEM_ENTRADA' ELSE 'DIFERENTE_DA_ENTRADA' END AS achado
  FROM recebimentos_material_almoxarifado r
  JOIN recebimentos_material_itens_almoxarifado ri ON ri.recebimento_id = r.id
  JOIN materiais_almoxarifado m ON m.id = ri.material_id
  LEFT JOIN movimentacoes_almoxarifado mv ON mv.id = ri.movimentacao_entrada_id
 WHERE (r.status IN ('PROCESSADO', 'APROVADO') AND ri.entrada_estoque_em IS NULL
        AND CAST(COALESCE(CASE WHEN ri.quantidade_recebida IS NULL
              OR (typeof(ri.quantidade_recebida) = 'text' AND TRIM(ri.quantidade_recebida) = '')
            THEN ri.quantidade_esperada ELSE ri.quantidade_recebida END, 0) AS REAL) > 0.000001)
    OR (ri.entrada_estoque_em IS NOT NULL AND mv.id IS NOT NULL
        AND ABS(mv.quantidade - CAST(COALESCE(CASE WHEN ri.quantidade_recebida IS NULL
              OR (typeof(ri.quantidade_recebida) = 'text' AND TRIM(ri.quantidade_recebida) = '')
            THEN ri.quantidade_esperada ELSE ri.quantidade_recebida END, 0) AS REAL)) > 0.000001)
 ORDER BY r.id, ri.id;`;

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  setUser(SUPER);
  let seq = 0;
  const material = async (custo = 0) => {
    const c = `CDI129-${++seq}`;
    const loc = (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', [c, c])).lastID;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, tipo_material,
      localizacao_padrao_id, custo_unitario) VALUES (?, ?, 'UN', 0, 1, 'ACO', ?, ?)`, [c, c, loc, custo])).lastID;
  };
  const receber = async (qtds) => {
    const mats = []; const itens = [];
    for (const q of qtds) { const m = await material(); mats.push(m); itens.push({ material_id: m, quantidade: q }); }
    setUser(SUPER);
    const r = await request(app).post(`${API}/recebimentos`).send({ tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: `NF-CDI129-${++seq}`,
      fornecedor_nome: 'FORN-CDI129', itens });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const its = await dbAll(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? ORDER BY id', [r.body.id]);
    return { id: r.body.id, its: its.map((i) => i.id), mats };
  };
  const ok = async (req, status = 200) => {
    const r = await req;
    assert.strictEqual(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
    return r;
  };
  const wf = (id, acao) => ok(request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao }));
  const conferir = (id, body) => request(app).put(`${API}/recebimentos/${id}/conferir`).send(body);
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m])).q;
  const recusaServico = async (fn) => {
    let erro = null;
    try { await fn(); } catch (e) { erro = e; }
    assert.ok(erro, 'o servico nao recusou');
    assert.strictEqual(erro.status, 409);
    assert.strictEqual(erro.message, L2);
  };

  console.log('\n=== Etapa 129: integracao — conferencia depois da entrada, A77 e perdas com valor ===\n');

  await test('[RN-08] ramo direto: conferir -> finalizar -> /aprovar -> conferir recusa (rota e servico) -> a divergencia vai pela NC manual', async () => {
    const r = await receber([5, 2]);
    await wf(r.id, 'iniciar_conferencia');
    setUser(ALMOXARIFE);
    await ok(conferir(r.id, { itens: [{ id: r.its[0], quantidade_recebida: 4 }, { id: r.its[1], quantidade_recebida: 2 }] }));
    setUser(SUPER);
    await wf(r.id, 'finalizar_conferencia');
    await ok(request(app).post(`${API}/recebimentos/${r.id}/aprovar`).send({}));
    assert.strictEqual(await fisico(r.mats[0]), 4);
    setUser(ALMOXARIFE);
    const x = await conferir(r.id, { itens: [{ id: r.its[1], quantidade_recebida: 1 }] });
    assert.strictEqual(x.status, 409, JSON.stringify(x.body));
    assert.strictEqual(x.body.error, L2);
    await recusaServico(() => receiptService.conferirRecebimento(db, ALMOXARIFE, r.id, { itens: [{ id: r.its[1], quantidade_recebida: 1 }] }));
    // O caminho que sobra: a NC manual, pelo mesmo Almoxarife que confere.
    const nc = await request(app).post(`${API}/nao-conformidades`).send({ origem: 'RECEBIMENTO', referencia_tipo: 'RECEBIMENTO_ITEM',
      referencia_id: r.its[1], tipo: 'QUANTIDADE', descricao: 'Descoberto depois da entrada: chegou 1, nao 2' });
    setUser(SUPER);
    assert.strictEqual(nc.status, 201, JSON.stringify(nc.body));
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_recebida q FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [r.its[1]])).q, 2);
    assert.ok(!(await dbAll(db, A77)).some((l) => l.recebimento_id === r.id), 'a A77 acusou o recebimento limpo do ramo direto');
  });

  await test('[RN-08] fluxo fiscal: faturamento -> /fiscal -> conferir quantidade (200) -> /processar -> conferir recusa (status e itens)', async () => {
    const r = await receber([3]);
    for (const a of ['iniciar_conferencia', 'finalizar_conferencia', 'encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      await wf(r.id, a);
    }
    await ok(request(app).put(`${API}/recebimentos/${r.id}/fiscal`).send({ data_emissao_nf: '2026-10-16', data_entrada_nf: '2026-10-16',
      valor_total_nota: 30 }));
    await ok(conferir(r.id, { itens: [{ id: r.its[0], quantidade_recebida: 2 }] }));
    const st = await conferir(r.id, { status: 'EM_CONFERENCIA' });
    assert.strictEqual(st.status, 409, 'EM_ENTRADA_NF nao volta para a conferencia');
    await ok(request(app).post(`${API}/recebimentos/${r.id}/processar`).send({}));
    assert.strictEqual(await fisico(r.mats[0]), 2);
    for (const body of [{ itens: [{ id: r.its[0], quantidade_recebida: 3 }] }, { status: 'REPROVADO' }]) {
      const x = await conferir(r.id, body);
      assert.strictEqual(x.status, 409, JSON.stringify(x.body));
      assert.strictEqual(x.body.error, L2);
    }
    assert.ok(!(await dbAll(db, A77)).some((l) => l.recebimento_id === r.id), 'a A77 acusou o processado limpo');
  });

  await test('[RN-08] A77: acha os formatos do legado (SEM_ENTRADA / DIFERENTE_DA_ENTRADA) e nao acha o limpo, o item 0, o estornado sem mudanca nem o que nao foi aprovado', async () => {
    // (1) aprovado com item que ganhou quantidade sem entrar; (2) processado com o item reescrito depois da entrada;
    // (3) aprovado pela conferencia sem entrada nenhuma; (4) Fase 5 r1-M2: o Aprovado -> REPROVADO da conferencia antiga, item
    // entrado com a quantidade reescrita; (5) Fase 5 r3-A1: aprovado sem entrada com a recebida NULL (vale a esperada).
    // Montados pelas portas + o UPDATE que o /conferir antigo fazia.
    const a = await receber([5, 2]);
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET quantidade_recebida = 0 WHERE id = ?', [a.its[0]]);
    await ok(request(app).post(`${API}/recebimentos/${a.id}/aprovar`).send({}));
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET quantidade_recebida = 5 WHERE id = ?', [a.its[0]]);
    const b = await receber([3]);
    await ok(request(app).post(`${API}/recebimentos/${b.id}/aprovar`).send({}));
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET status = 'PROCESSADO' WHERE id = ?", [b.id]);
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET quantidade_recebida = 7 WHERE id = ?', [b.its[0]]);
    const c = await receber([4]);
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET status = 'APROVADO' WHERE id = ?", [c.id]);
    const d = await receber([3]);
    await ok(request(app).post(`${API}/recebimentos/${d.id}/aprovar`).send({}));
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET status = 'REPROVADO' WHERE id = ?", [d.id]);
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET quantidade_recebida = 1 WHERE id = ?', [d.its[0]]);
    const e = await receber([6]);
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET quantidade_recebida = NULL WHERE id = ?', [e.its[0]]);
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET status = 'APROVADO' WHERE id = ?", [e.id]);
    const zero = await receber([6]);
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET quantidade_recebida = 0 WHERE id = ?', [zero.its[0]]);
    await ok(request(app).post(`${API}/recebimentos/${zero.id}/aprovar`).send({}));
    // o estorno da entrada nao limpa `entrada_estoque_em` nem `movimentacao_entrada_id` (Fase 2, I2): sem mudanca de
    // quantidade, a A77 nao acusa — e mostra `entrada_estornada` quando acusa.
    const est = await receber([2]);
    await ok(request(app).post(`${API}/recebimentos/${est.id}/aprovar`).send({}));
    const movEst = (await dbGet(db, 'SELECT movimentacao_entrada_id m FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [est.its[0]])).m;
    await ok(request(app).post(`${API}/movimentacoes/${movEst}/cancelar`).send({ motivo: 'teste A77' }));
    const aberto = await receber([9]);
    const ids = [a.id, b.id, c.id, d.id, e.id, zero.id, est.id, aberto.id];
    const linhas = (await dbAll(db, A77)).filter((l) => ids.includes(l.recebimento_id));
    assert.deepStrictEqual(linhas.map((l) => [l.recebimento_id, l.item_id, l.no_documento, l.entrou, l.achado, l.entrada_estornada]), [
      [a.id, a.its[0], 5, null, 'SEM_ENTRADA', 0],
      [b.id, b.its[0], 7, 3, 'DIFERENTE_DA_ENTRADA', 0],
      [c.id, c.its[0], 4, null, 'SEM_ENTRADA', 0],
      [d.id, d.its[0], 1, 3, 'DIFERENTE_DA_ENTRADA', 0],
      [e.id, e.its[0], 6, null, 'SEM_ENTRADA', 0],
    ], JSON.stringify(linhas));
    // o estornado, reescrito depois: aparece, marcado
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET quantidade_recebida = 1 WHERE id = ?', [est.its[0]]);
    const doEst = (await dbAll(db, A77)).filter((l) => l.recebimento_id === est.id);
    assert.deepStrictEqual(doEst.map((l) => [l.achado, l.entrada_estornada]), [['DIFERENTE_DA_ENTRADA', 1]]);
  });

  await test('[RN-17] a perda pela rota real aparece com o valor; estornada pela rota, some', async () => {
    const m = await material(6);
    const loc = (await dbGet(db, 'SELECT localizacao_padrao_id l FROM materiais_almoxarifado WHERE id = ?', [m])).l;
    setUser(SUPER);
    await ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m, tipo: 'ENTRADA', quantidade: 10,
      localizacao_destino_id: loc, motivo: 'setup' }), 201);
    const mot = await ok(request(app).post(`${API}/motivos-movimentacao`).send({ nome: `Avaria E129 ${seq}`, tipos: ['PERDA'] }), 201);
    const perda = await ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m, tipo: 'PERDA', quantidade: 3,
      localizacao_origem_id: loc, motivo_id: mot.body.id, justificativa: 'caiu da empilhadeira' }), 201);
    const rel = async () => (await ok(request(app).get(`${API}/relatorios/perdas-por-motivo?material_id=${m}`))).body;
    const linhas = await rel();
    assert.deepStrictEqual(linhas.map((l) => [l.tipo, l.origem, l.motivo, l.valor, l.lancamentos]),
      [['PERDA', 'Cadastro', mot.body.nome, 18, 1]], JSON.stringify(linhas));
    const movId = perda.body.id || perda.body.movimentacao?.id || perda.body.movimentacao_id;
    assert.ok(movId, `id da movimentacao: ${JSON.stringify(perda.body)}`);
    await ok(request(app).post(`${API}/movimentacoes/${movId}/cancelar`).send({ motivo: 'lancada errada' }));
    assert.deepStrictEqual(await rel(), [], 'a perda estornada continua no relatorio');
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
