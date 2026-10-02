/**
 * Etapa 74 (T2) — o e-mail da Etapa 70 diz a verdade depois da reserva na chegada (RN-10, D7/B373).
 *
 * Pelas ROTAS (`POST /recebimentos/:id/processar`, o gancho da T1 reserva e o aviso da 70 lê o banco
 * depois), com a tabela `usuarios` para o aviso ter destinatário. Quem ganhou reserva lê quanto ficou
 * reservado (L1/L2); quem não ganhou nada e não tem nada livre para separar não recebe e-mail; com a
 * reserva falhando, a literal da 70 (L0).
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa74-reserva-na-chegada.md
 *
 * Executar: cd server && node tests/api/recebimentoReservaChegadaAviso.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Faturista 74', role: 'admin', is_superadmin: 1, email: 'fat74@t.com' };
const L0 = 'O material ainda não está reservado para a sua requisição — a separação é feita pelo almoxarifado.';
const L1 = 'O material indicado como reservado fica guardado para a sua requisição — outra requisição não pode levá-lo. A separação é feita pelo almoxarifado.';
const L2 = 'Só o material indicado como reservado fica guardado para a sua requisição; o restante ainda não está reservado — a separação é feita pelo almoxarifado.';
let seq = 0;

(async () => {
  console.log('\n=== Etapa 74 (T2): o e-mail diz a verdade ===\n');
  const { app, db, close } = await createTestApp({ user: ADMIN });
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const id of [7411, 7412, 7413, 7414]) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?, ?, ?, 1)', [id, `Sol ${id}`, `s${id}@t.com`]);
  }

  const material = async () => {
    const c = `E74A-${++seq}`;
    return { id: (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
      VALUES (?, ?, 'PC', 0, 1)`, [c, `Mat ${c}`])).lastID, codigo: c, nome: `Mat ${c}` };
  };
  const req = async (sol, status, itens, extra = {}) => {
    const numero = `REQ-E74A-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo)
      VALUES (?, ?, ?, ?, ?, ?, 1)`, [numero, sol, `Sol ${sol}`, status, extra.urgencia || 'NORMAL',
      extra.criado || `2026-09-01 10:00:${String(seq % 60).padStart(2, '0')}`])).lastID;
    for (const [m, q] of itens) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,?)', [id, m.id, q]);
    }
    return { id, numero };
  };
  const nota = async (linhas) => {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F74', '2026-09-01', '2026-09-02', 10)`, [`REC-E74A-${++seq}`, `NF-E74A-${seq}`])).lastID;
    for (const [m, q] of linhas) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`, [r, m.id, q, q]);
    }
    return r;
  };
  const processar = async (rec) => {
    const p = await request(app).post(`/api/almoxarifado/recebimentos/${rec}/processar`).send({});
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
  };
  const emailDe = async (rec, reqId) => dbAll(db, `SELECT corpo_texto, destinatarios FROM fila_notificacoes_almoxarifado
    WHERE evento = 'RECEBIMENTO_ENTRADA_REQUISITANTE' AND json_extract(payload, '$.recebimento_id') = ?
      AND json_extract(payload, '$.requisicao_id') = ?`, [rec, reqId]);
  const linhasDe = (corpo) => corpo.split('\n');

  await test('[RN-10] R2 ganhou 3 de 3 e R1 ganhou 1 de 6: as duas leem o reservado e a frase L1; a situacao e a nova', async () => {
    const m = await material();
    const R1 = await req(7411, 'AGUARDANDO_ESTOQUE', [[m, 6]], { criado: '2026-08-01 08:00:00' });
    const R2 = await req(7412, 'AGUARDANDO_ESTOQUE', [[m, 3]], { urgencia: 'URGENTE', criado: '2026-08-02 08:00:00' });
    const rec = await nota([[m, 4]]);
    await processar(rec);
    const [e2] = await emailDe(rec, R2.id);
    assert.ok(e2, 'quem ganhou TUDO recebe e-mail (Surpresa 1: o hold desta nota nao desconta o pendente)');
    assert.deepStrictEqual(JSON.parse(e2.destinatarios), ['s7412@t.com']);
    const l2 = linhasDe(e2.corpo_texto);
    assert.strictEqual(l2[2], 'Situação da requisição: Totalmente reservada');
    assert.strictEqual(l2[5], `- ${m.codigo} — ${m.nome}: entrou 4 PC (pendente na requisição: 3 PC; reservado para a sua requisição: 3 PC)`);
    assert.strictEqual(l2[6], L1);
    const [e1] = await emailDe(rec, R1.id);
    assert.ok(e1, 'R1 ganhou parte e recebe');
    const l1 = linhasDe(e1.corpo_texto);
    assert.strictEqual(l1[2], 'Situação da requisição: Parcialmente reservada');
    assert.strictEqual(l1[5], `- ${m.codigo} — ${m.nome}: entrou 4 PC (pendente na requisição: 6 PC; reservado para a sua requisição: 1 PC)`);
    assert.strictEqual(l1[6], L1);
  });

  await test('[RN-10] negativa: R4 esperava, a nota foi toda para R1/R2 e nao sobrou nada livre -> NENHUM e-mail para R4', async () => {
    const m = await material();
    const R1 = await req(7411, 'AGUARDANDO_ESTOQUE', [[m, 6]], { criado: '2026-08-01 08:00:00' });
    const R2 = await req(7412, 'AGUARDANDO_ESTOQUE', [[m, 3]], { criado: '2026-08-01 08:00:01' });
    const R4 = await req(7414, 'AGUARDANDO_ESTOQUE', [[m, 2]], { criado: '2026-08-01 08:00:02' });
    const rec = await nota([[m, 9]]);
    await processar(rec);
    assert.strictEqual((await emailDe(rec, R1.id)).length, 1);
    assert.strictEqual((await emailDe(rec, R2.id)).length, 1);
    assert.deepStrictEqual(await emailDe(rec, R4.id), [], 'prometeria material reservado para outra requisicao');
  });

  await test('[RN-10] positiva da negativa: sobrou livre -> quem nao ganhou (pulada) recebe, sem reserva, com L0', async () => {
    const m = await material();
    const R = await req(7413, 'AGUARDANDO_ESTOQUE', [[m, 2]]);
    const rec = await nota([[m, 5]]);
    const original = stockService.criarReserva;
    stockService.criarReserva = async () => { throw new Error('falha simulada 74'); };
    try { await processar(rec); } finally { stockService.criarReserva = original; }
    const [e] = await emailDe(rec, R.id);
    assert.ok(e, 'com saldo livre o aviso sai');
    const l = linhasDe(e.corpo_texto);
    assert.strictEqual(l[2], 'Situação da requisição: Aguardando estoque');
    assert.strictEqual(l[5], `- ${m.codigo} — ${m.nome}: entrou 5 PC (pendente na requisição: 2 PC)`);
    assert.strictEqual(l[6], L0, 'RN-07: a reserva falhou -> a literal de hoje (L0)');
  });

  await test('[RN-10] L2: dois materiais, um ganhou a reserva e o outro nao (a reserva dele falhou, saldo livre sobrando)', async () => {
    const a = await material(); const b = await material();
    const R = await req(7413, 'AGUARDANDO_ESTOQUE', [[a, 2], [b, 3]]);
    const rec = await nota([[a, 2], [b, 5]]);
    const original = stockService.criarReserva;
    stockService.criarReserva = async (dbx, user, data, opcoes) => {
      if (data.material_id === b.id) throw new Error('falha simulada so no B');
      return original(dbx, user, data, opcoes);
    };
    try { await processar(rec); } finally { stockService.criarReserva = original; }
    const [e] = await emailDe(rec, R.id);
    assert.ok(e);
    const l = linhasDe(e.corpo_texto);
    assert.strictEqual(l[2], 'Situação da requisição: Parcialmente reservada');
    assert.deepStrictEqual(l.slice(5, 8), [
      `- ${a.codigo} — ${a.nome}: entrou 2 PC (pendente na requisição: 2 PC; reservado para a sua requisição: 2 PC)`,
      `- ${b.codigo} — ${b.nome}: entrou 5 PC (pendente na requisição: 3 PC)`,
      L2,
    ]);
  });

  await test('[RN-10, Fase 2] a LINHA de material que foi todo para outra requisicao sai do e-mail (L2 nao promete o alheio)', async () => {
    const a = await material(); const b = await material();
    const outra = await req(7411, 'AGUARDANDO_ESTOQUE', [[b, 4]], { urgencia: 'CRITICO', criado: '2026-08-01 08:00:00' });
    const R = await req(7413, 'AGUARDANDO_ESTOQUE', [[a, 2], [b, 3]], { criado: '2026-08-02 08:00:00' });
    const rec = await nota([[a, 2], [b, 4]]);
    await processar(rec);
    const [e] = await emailDe(rec, R.id);
    assert.ok(e);
    const l = linhasDe(e.corpo_texto);
    assert.deepStrictEqual(l.slice(4, 7), ['Materiais que chegaram:',
      `- ${a.codigo} — ${a.nome}: entrou 2 PC (pendente na requisição: 2 PC; reservado para a sua requisição: 2 PC)`, L1]);
    assert.ok(!e.corpo_texto.includes(b.codigo), 'o B foi todo para a CRITICA: nao aparece no e-mail de R');
    assert.strictEqual((await emailDe(rec, outra.id)).length, 1);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
