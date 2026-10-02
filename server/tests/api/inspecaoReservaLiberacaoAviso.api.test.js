/**
 * Etapa 75 (T3) — o solicitante é avisado de que o material saiu da inspeção (D7/B389, RN-09).
 *
 * Fase 0 (Surpresa 4): numa nota só de material crítico ninguém recebia e-mail — o aviso da 70 pula o
 * retido na chegada (D5 da 70) e a inspeção não avisava. Agora `aposLiberacaoSemFalhar` (T1), depois da
 * reserva, chama `receiptNotificationService.avisarLiberacao`: o mesmo evento da 70
 * (`RECEBIMENTO_ENTRADA_REQUISITANTE`, a mesma chave `notificar_recebimento_solicitante`), dedupe POR
 * DOCUMENTO (`inspecao-liberada-<id>-req-<rid>` / `nc-liberada-<id>-req-<rid>`), as frases L0/L1 da 74.
 * Recebe quem ganhou reserva NESTA liberação ou tem disponível livre do material para separar.
 *
 * Pelas ROTAS (inspeção e NC pela QUALIDADE) com a tabela `usuarios` criada (sem ela não há destinatário).
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa75-inspecao-libera-reserva.md
 *
 * Executar: cd server && node tests/api/inspecaoReservaLiberacaoAviso.api.test.js
 */
const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const receiptNotificationService = require('../../services/almoxarifado/receiptNotificationService');
const reservaChegadaService = require('../../services/almoxarifado/reservaChegadaService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Faturista 75', role: 'admin', is_superadmin: 1, email: 'fat75@t.com' };
const SOL = { id: 7501, nome: 'Solicitante 75', role: 'admin', is_superadmin: 1, email: 's75@t.com' };
const QUALIDADE = { id: 7503, nome: 'Inspetora 75', perfil_almoxarifado: 'QUALIDADE', email: 'q75@t.com' };
const API = '/api/almoxarifado';
const EVENTO = 'RECEBIMENTO_ENTRADA_REQUISITANTE';
// A fila guarda o hash (RN-02 da 19: sha256 de "evento|dedupe_chave"), nunca a chave.
const hash = (chave) => crypto.createHash('sha256').update(`${EVENTO}|${chave}`).digest('hex');
let seq = 0;

(async () => {
  console.log('\n=== Etapa 75 (T3): o solicitante é avisado da liberação ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('F75A','75000000000475','ativo')")).lastID;
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, "INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (7501, 'Solicitante 75', 's75@t.com', 1)");
  await dbRun(db, "INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (7505, 'Outro 75', 'o75@t.com', 1)");
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };
  const capturarWarn = async (fn) => {
    const orig = console.warn; const msgs = [];
    console.warn = (...a) => { msgs.push(a.join(' ')); };
    try { return { r: await fn(), msgs }; } finally { console.warn = orig; }
  };

  const material = async () => {
    const c = `E75A-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', 0, 0, 1, ?, 1)`, [c, `Mat ${c}`, forn])).lastID;
  };
  const entradaManual = async (m, q) => {
    const e = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'setup 75' });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
  };
  const reqDireta = async (q, m, solicitante = SOL.id, extra = {}) => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo, data_aprovacao_valor)
      VALUES (?, ?, 'Sol direto', 'AGUARDANDO_ESTOQUE', 'NORMAL', ?, 1, ?)`,
    [`REQ-E75A-${++seq}`, solicitante, extra.criado || `2026-09-01 10:${String(seq % 60).padStart(2, '0')}:00`,
      extra.aprovadoValor ? '2026-09-01 10:00:00' : null])).lastID;
    await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,?)', [id, m, q]);
    return id;
  };
  async function notaDireta(linhas) {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F75A', '2026-09-01', '2026-09-02', 10)`, [`REC-E75A-${++seq}`, `NF-E75A-${seq}`])).lastID;
    for (const [m, q] of linhas) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`, [r, m, q, q]);
    }
    const p = await request(app).post(`${API}/recebimentos/${r}/processar`).send({});
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    return r;
  }
  const itensRec = (rec) => dbAll(db, 'SELECT id, material_id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? ORDER BY id', [rec]);
  const inspecionarItem = async (itemId, a, r) => {
    const res = await as(QUALIDADE, () => request(app).post(`${API}/recebimentos/itens/${itemId}/inspecionar`)
      .send({ quantidade_aprovada: a, quantidade_reprovada: r, encaminhamento: r > 0 ? 'DEVOLVER' : undefined }));
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    return res.body.id;
  };
  const inspecionar = async (rec, a, r) => inspecionarItem((await itensRec(rec))[0].id, a, r);
  const numero = async (tab, id) => (await dbGet(db, `SELECT numero FROM ${tab} WHERE id = ?`, [id])).numero;
  const avisosDe = (rid) => dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = ?
    AND json_extract(payload, '$.requisicao_id') = ? ORDER BY id`, [EVENTO, rid]);
  const ativas = (rid) => dbAll(db, "SELECT quantidade FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'", [rid]);

  await cfg('inspecao_material_critico', '1');
  try {
    // ══════════════ RN-09 ══════════════
    await test('[RN-09] L1: R1 ganhou 4 de 4 na inspecao -> UM e-mail: assunto, 1a linha da inspecao, linha com o reservado, L1, destinatario, dedupe e payload; a nota nao avisou na chegada', async () => {
      const m = await material();
      const R1 = await reqDireta(4, m);
      const rec = await notaDireta([[m, 4]]);
      assert.deepStrictEqual(await avisosDe(R1), [], 'premissa: o retido nao avisa na chegada (D5 da 70)');
      const insp = await inspecionar(rec, 4, 0);
      const av = await avisosDe(R1);
      assert.strictEqual(av.length, 1, JSON.stringify(av));
      const a = av[0];
      const req = await numero('requisicoes_almoxarifado', R1);
      const codigo = (await dbGet(db, 'SELECT codigo, nome FROM materiais_almoxarifado WHERE id = ?', [m]));
      assert.strictEqual(a.assunto, `[Almoxarifado] Material liberado para a sua requisição ${req}`);
      assert.strictEqual(a.hash_dedupe, hash(`inspecao-liberada-${insp}-req-${R1}`));
      assert.deepStrictEqual(JSON.parse(a.destinatarios), ['s75@t.com']);
      assert.deepStrictEqual(JSON.parse(a.payload), { recebimento_id: rec, requisicao_id: R1, numero_requisicao: req, origem: 'INSPECAO', documento_id: insp });
      const l = a.corpo_texto.split('\n');
      assert.strictEqual(l[0], 'O material que a sua requisição aguardava foi aprovado na inspeção e está no estoque.');
      assert.strictEqual(l[2], 'Situação da requisição: Totalmente reservada', 'o status e relido DEPOIS da reserva');
      assert.strictEqual(l[3], `Recebimento: ${await numero('recebimentos_material_almoxarifado', rec)}`);
      assert.strictEqual(l[5], `- ${codigo.codigo} — ${codigo.nome}: liberado 4 PC (pendente na requisição: 4 PC; reservado para a sua requisição: 4 PC)`);
      assert.strictEqual(l[6], receiptNotificationService.FRASE_TUDO_RESERVADO);
    });

    await test('[RN-09] L0: a reserva forcada a falhar com disponivel > 0 -> o e-mail sai sem o reservado e com L0 (o e-mail diz a verdade)', async () => {
      const m = await material();
      const R = await reqDireta(3, m);
      const rec = await notaDireta([[m, 3]]);
      const original = stockService.criarReserva;
      stockService.criarReserva = async () => { throw new Error('falha simulada 75 aviso'); };
      try { await capturarWarn(() => inspecionar(rec, 3, 0)); } finally { stockService.criarReserva = original; }
      assert.deepStrictEqual(await ativas(R), []);
      const av = await avisosDe(R);
      assert.strictEqual(av.length, 1);
      const l = av[0].corpo_texto.split('\n');
      assert.ok(/: liberado 3 PC \(pendente na requisição: 3 PC\)$/.test(l[5]), l[5]);
      assert.strictEqual(l[6], receiptNotificationService.FRASE_SEM_RESERVA);
      assert.strictEqual(l[2], 'Situação da requisição: Aguardando estoque');
    });

    await test('[RN-09] R4 esperava e tudo foi para R1 (disponivel 0) -> NENHUM e-mail para R4; R1 recebe', async () => {
      const m = await material();
      const R1 = await reqDireta(4, m, SOL.id, { criado: '2026-08-01 08:00:00' });
      const R4 = await reqDireta(4, m, 7505, { criado: '2026-08-02 08:00:00' });
      const rec = await notaDireta([[m, 4]]);
      await inspecionar(rec, 4, 0);
      assert.deepStrictEqual((await ativas(R1)).map((x) => Number(x.quantidade)), [4]);
      assert.strictEqual((await avisosDe(R1)).length, 1);
      assert.deepStrictEqual(await avisosDe(R4), [], 'D7: nao promete material reservado para outra requisicao');
    });

    await test('[RN-09] quem nao ganhou reserva mas tem disponivel livre para separar recebe com L0 (a regua da 74)', async () => {
      const m = await material();
      const A = await reqDireta(2, m, SOL.id, { criado: '2026-08-01 08:00:00' });
      const B = await reqDireta(2, m, 7505, { criado: '2026-08-02 08:00:00' });
      const rec = await notaDireta([[m, 4]]);
      // A reserva de B forcada a falhar: B fica sem hold, mas os 2 dele continuam livres no estoque.
      const original = stockService.criarReserva;
      const itB = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [B])).id;
      stockService.criarReserva = async (d, u, data, op) => {
        if (op && op.item_requisicao_id === itB) throw new Error('so B');
        return original(d, u, data, op);
      };
      try { await capturarWarn(() => inspecionar(rec, 4, 0)); } finally { stockService.criarReserva = original; }
      const la = (await avisosDe(A))[0].corpo_texto.split('\n');
      const lb = (await avisosDe(B))[0].corpo_texto.split('\n');
      assert.strictEqual(la[6], receiptNotificationService.FRASE_TUDO_RESERVADO);
      assert.strictEqual(lb[6], receiptNotificationService.FRASE_SEM_RESERVA);
      assert.ok(/pendente na requisição: 2 PC\)$/.test(lb[5]), lb[5]);
    });

    await test('[RN-09] NC aceita -> e-mail com a 1a linha da NC e o dedupe da NC; o da inspecao (3 de 4) ja tinha saido com outra chave', async () => {
      const m = await material();
      const R = await reqDireta(4, m);
      const rec = await notaDireta([[m, 4]]);
      const insp = await inspecionar(rec, 3, 1);
      const nc = await dbGet(db, "SELECT id, numero FROM nao_conformidades_almoxarifado WHERE referencia_tipo = 'INSPECAO' AND referencia_id = ?", [insp]);
      const d = await as(QUALIDADE, () => request(app).post(`${API}/nao-conformidades/${nc.id}/decidir`).send({ decisao: 'ACEITAR', justificativa: 'ok 75' }));
      assert.strictEqual(d.status, 200, JSON.stringify(d.body));
      const av = await avisosDe(R);
      assert.deepStrictEqual(av.map((x) => x.hash_dedupe), [hash(`inspecao-liberada-${insp}-req-${R}`), hash(`nc-liberada-${nc.id}-req-${R}`)]);
      const l = av[1].corpo_texto.split('\n');
      assert.strictEqual(l[0], `O material que a sua requisição aguardava foi liberado pela não conformidade ${nc.numero} e está no estoque.`);
      assert.ok(/: liberado 1 PC \(pendente na requisição: 1 PC; reservado para a sua requisição: 1 PC\)$/.test(l[5]), l[5]);
      assert.strictEqual(l[2], 'Situação da requisição: Totalmente reservada');
      assert.deepStrictEqual(JSON.parse(av[1].payload), { recebimento_id: rec, requisicao_id: R, numero_requisicao: await numero('requisicoes_almoxarifado', R),
        origem: 'NAO_CONFORMIDADE', documento_id: nc.id });
    });

    await test('[RN-09] dedupe: dois itens do MESMO material na mesma nota decididos em sequencia -> DOIS e-mails para a mesma requisicao (chaves diferentes)', async () => {
      const m = await material();
      const R = await reqDireta(6, m);
      const rec = await notaDireta([[m, 2], [m, 3]]);
      const [i1, i2] = await itensRec(rec);
      const ins1 = await inspecionarItem(i1.id, 2, 0);
      const ins2 = await inspecionarItem(i2.id, 3, 0);
      const av = await avisosDe(R);
      assert.deepStrictEqual(av.map((x) => x.hash_dedupe), [hash(`inspecao-liberada-${ins1}-req-${R}`), hash(`inspecao-liberada-${ins2}-req-${R}`)]);
      assert.ok(av[1].corpo_texto.includes(': liberado 3 PC (pendente na requisição: 4 PC; reservado para a sua requisição: 3 PC)'), av[1].corpo_texto);
    });

    await test('[RN-09] a mesma liberacao nunca duas vezes: decidir de novo (400) nao enfileira; o gancho chamado de novo com o mesmo documento e DUPLICADA', async () => {
      const m = await material();
      const R = await reqDireta(2, m);
      const rec = await notaDireta([[m, 2]]);
      const insp = await inspecionar(rec, 2, 0);
      const it = (await itensRec(rec))[0];
      const de2 = await as(QUALIDADE, () => request(app).post(`${API}/recebimentos/itens/${it.id}/inspecionar`).send({ quantidade_aprovada: 2, quantidade_reprovada: 0 }));
      assert.strictEqual(de2.status, 400);
      await entradaManual(m, 1); // disponivel livre: o aviso teria a quem falar
      await reservaChegadaService.aposLiberacaoSemFalhar(db, QUALIDADE,
        { origem: 'INSPECAO', documento_id: insp, documento_numero: null, material_id: m, quantidade: 2, recebimento_id: rec });
      assert.strictEqual((await avisosDe(R)).length, 1);
    });

    await test('[RN-09] notificar_recebimento_solicitante = 0 -> a reserva acontece e nada e enfileirado', async () => {
      await cfg('notificar_recebimento_solicitante', '0');
      try {
        const m = await material();
        const R = await reqDireta(2, m);
        const rec = await notaDireta([[m, 2]]);
        await inspecionar(rec, 2, 0);
        assert.deepStrictEqual((await ativas(R)).map((x) => Number(x.quantidade)), [2]);
        assert.deepStrictEqual(await avisosDe(R), []);
      } finally { await cfg('notificar_recebimento_solicitante', '1'); }
    });

    // ══════════════ RN-06 (o aviso) ══════════════
    await test('[RN-06] o aviso forcado a lancar nao derruba nada: 201, a reserva existe, warn do contrato', async () => {
      const m = await material();
      const R = await reqDireta(2, m);
      const rec = await notaDireta([[m, 2]]);
      const it = (await itensRec(rec))[0];
      const original = receiptNotificationService.avisarLiberacao;
      receiptNotificationService.avisarLiberacao = async () => { throw new Error('smtp caiu 75'); };
      let res;
      try {
        res = await capturarWarn(() => as(QUALIDADE, () => request(app).post(`${API}/recebimentos/itens/${it.id}/inspecionar`)
          .send({ quantidade_aprovada: 2, quantidade_reprovada: 0 })));
      } finally { receiptNotificationService.avisarLiberacao = original; }
      assert.strictEqual(res.r.status, 201, JSON.stringify(res.r.body));
      assert.deepStrictEqual((await ativas(R)).map((x) => Number(x.quantidade)), [2]);
      assert.ok(res.msgs.includes(`[almoxarifado-reservas] aviso da liberacao falhou (INSPECAO ${res.r.body.id}): smtp caiu 75`), JSON.stringify(res.msgs));
    });

    await test('[Fase 2] resultado PARCIAL: a falha escapa depois da 1a reserva -> o e-mail de A diz reservado (L1), o de B nao (L0)', async () => {
      const valueApprovalService = require('../../services/almoxarifado/requisitionValueApprovalService');
      const m = await material();
      await entradaManual(m, 4);
      const A = await reqDireta(2, m, SOL.id, { criado: '2026-07-01 08:00:00', aprovadoValor: true });
      const B = await reqDireta(2, m, 7505, { criado: '2026-07-02 08:00:00' });
      const original = valueApprovalService.avaliarRequisicaoValor;
      valueApprovalService.avaliarRequisicaoValor = async () => { throw new Error('valor caiu 75'); };
      try {
        await capturarWarn(() => reservaChegadaService.aposLiberacaoSemFalhar(db, QUALIDADE,
          { origem: 'INSPECAO', documento_id: 90001, documento_numero: null, material_id: m, quantidade: 4, recebimento_id: null }));
      } finally { valueApprovalService.avaliarRequisicaoValor = original; }
      const la = (await avisosDe(A))[0].corpo_texto.split('\n');
      const lb = (await avisosDe(B))[0].corpo_texto.split('\n');
      assert.ok(la[4].endsWith('reservado para a sua requisição: 2 PC)'), la[4]);
      assert.strictEqual(la[5], receiptNotificationService.FRASE_TUDO_RESERVADO);
      assert.strictEqual(lb[5], receiptNotificationService.FRASE_SEM_RESERVA);
    });
  } finally { await cfg('inspecao_material_critico', '0'); }

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
