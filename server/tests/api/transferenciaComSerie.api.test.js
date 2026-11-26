/**
 * Etapa 265 (item 10, C76, B1624/B1625) — a transferencia de material com numero de serie pede as series que mudam de prateleira, e
 * cada serie passa a constar no destino; o estorno devolve as series a origem.
 *
 * RN-265.01: material com serie -> quantidade inteira e uma serie por unidade (v2 e /transferencias). Sem serie: nada muda.
 * RN-265.02: serie repetida, inexistente, de outro material, fora do estoque, de outro lote -> recusa literal, nada muda.
 * RN-265.03: serie em outra prateleira cujo registro bate com o saldo -> recusa; registro velho ou sem prateleira -> aceita.
 * RN-265.04: efeito (saldo + series + registro); o livro falhando devolve linhas e series.
 * RN-265.05: estorno devolve as series a origem; serie que saiu ou mudou -> recusa; sem registro -> como antes; o livro do estorno
 *            falhando devolve tudo.
 * Retrato = linhas de saldo nao nulas + series presentes por prateleira.
 * Plano: docs/superpowers/plans/2026-11-26-almoxarifado-etapa265-transferencia-e-saida-com-numero-de-serie.md
 *
 * Executar: cd server && node tests/api/transferenciaComSerie.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`); });
}

const ADMIN = { id: 1, nome: 'Adm 265T', role: 'admin', is_superadmin: 1, email: 'a265t@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 265 (C76): transferencia de peca com numero de serie ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const alm = await request(app).post(`${API}/almoxarifados`).send({ codigo: 'ALM265T', nome: 'Almox 265 T' });
  assert.ok(alm.status === 201 || alm.status === 200, JSON.stringify(alm.body));
  const loc = async (codigo) => {
    const r = await request(app).post(`${API}/localizacoes`).send({ codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('TT-A'); const B = await loc('TT-B'); const C = await loc('TT-C'); const P = await loc('TT-P');
  const material = async ({ serie = 1, lote = 0 } = {}) => {
    const c = `E265T-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, ?, 0, ?)`, [c, c, lote, serie, P.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, destino, numeros, extra = {}) => {
    const r = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'ENTRADA', quantidade: numeros.length,
      motivo: 'e265', localizacao_destino_id: destino, series: numeros.map((n) => `${m.nome}-${n}`), ...extra });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const sid = async (m, n) => (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [m.id, `${m.nome}-${n}`])).id;
  const transferir = (m, origem, destino, serieIds, extra = {}, rota = 'v2') => (rota === 'v2'
    ? request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'TRANSFERENCIA', quantidade: serieIds.length,
      localizacao_origem_id: origem, localizacao_destino_id: destino, serie_ids: serieIds, ...extra })
    : request(app).post(`${API}/transferencias`).send({ material_id: m.id, quantidade: serieIds.length,
      localizacao_origem_id: origem, localizacao_destino_id: destino, serie_ids: serieIds, ...extra }));
  const retrato = async (m) => {
    const linhas = await dbAll(db, `SELECT l.codigo as loc, s.quantidade q FROM estoque_saldo_almoxarifado s
        LEFT JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id WHERE s.material_id = ? ORDER BY l.codigo`, [m.id]);
    const series = await dbAll(db, `SELECT s.numero, l.codigo as loc FROM series_almoxarifado s
        LEFT JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id WHERE s.material_id = ? AND s.status IN ('EM_ESTOQUE','BLOQUEADA')
        ORDER BY s.numero`, [m.id]);
    return {
      linhas: linhas.filter((x) => Math.abs(Number(x.q)) > 1e-9).map((x) => `${x.loc || '-'}=${Number(x.q)}`),
      series: series.map((x) => `${x.numero.replace(`${m.nome}-`, '')}@${x.loc || '-'}`),
    };
  };
  const ultimaTransf = async (m) => dbGet(db, `SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'TRANSFERENCIA'
    ORDER BY id DESC LIMIT 1`, [m.id]);
  const estornar = (movId) => request(app).post(`${API}/movimentacoes/${movId}/cancelar`).send({ motivo: 'estorno de teste 265' });
  const recusa = async (r, status, literal, m, antes) => {
    assert.strictEqual(r.status, status, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, literal);
    if (m) assert.deepStrictEqual(await retrato(m), antes, 'nada mudou');
  };

  await test('[RN-265.04] v2: S1 de A para B -> saldo A 2 / B 1 e S1 consta em B; o registro guarda de onde e para onde', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2', '3']);
    const r = await transferir(m, A.id, B.id, [await sid(m, '1')]);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual(await retrato(m), { linhas: ['TT-A=2', 'TT-B=1'], series: ['1@TT-B', '2@TT-A', '3@TT-A'] });
    const mv = await ultimaTransf(m);
    const reg = await dbAll(db, 'SELECT serie_id, localizacao_anterior_id a, localizacao_nova_id n FROM transferencia_series_almoxarifado WHERE movimentacao_id = ?', [mv.id]);
    assert.deepStrictEqual(reg.map((x) => [x.serie_id, x.a, x.n]), [[await sid(m, '1'), A.id, B.id]]);
  });

  await test('[RN-265.04] /transferencias tambem (exigeSerie): S2 e S3 de A para B', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2', '3']);
    const r = await transferir(m, A.id, B.id, [await sid(m, '2'), await sid(m, '3')], {}, 'rota');
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual(await retrato(m), { linhas: ['TT-A=1', 'TT-B=2'], series: ['1@TT-A', '2@TT-B', '3@TT-B'] });
  });

  await test('[RN-265.01] sem serie (v2 e /transferencias), quantidade fracionaria -> recusa literal, nada muda', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2']);
    const antes = await retrato(m);
    await recusa(await transferir(m, A.id, B.id, [], { quantidade: 1 }), 400,
      'material com controle de serie: informe 1 serie(s) para 1 unidade(s) — recebidas 0', m, antes);
    await recusa(await transferir(m, A.id, B.id, [], { quantidade: 1 }, 'rota'), 400,
      'material com controle de serie: informe 1 serie(s) para 1 unidade(s) — recebidas 0', m, antes);
    await recusa(await transferir(m, A.id, B.id, [await sid(m, '1')], { quantidade: 1.5 }), 400,
      'material com controle de serie exige quantidade inteira', m, antes);
  });

  await test('[RN-265.01] material SEM serie: serie_ids ignorado, transfere como antes', async () => {
    const m = await material({ serie: 0 });
    const e = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'ENTRADA', quantidade: 3, motivo: 'x',
      localizacao_destino_id: A.id });
    assert.strictEqual(e.status, 201);
    const r = await transferir(m, A.id, B.id, [999999], { quantidade: 2 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual((await retrato(m)).linhas, ['TT-A=1', 'TT-B=2']);
  });

  await test('[RN-265.02] repetida, inexistente, de outro material, fora do estoque -> literais; nada muda', async () => {
    const m = await material(); const outro = await material();
    await entrar(m, A.id, ['1', '2', '3']); await entrar(outro, A.id, ['9']);
    const s1 = await sid(m, '1');
    const antes = await retrato(m);
    await recusa(await transferir(m, A.id, B.id, [s1, s1]), 400, 'serie_ids repetidos na lista informada', m, antes);
    await recusa(await transferir(m, A.id, B.id, [987654]), 400, 'serie id 987654 nao existe', m, antes);
    await recusa(await transferir(m, A.id, B.id, [await sid(outro, '9')]), 400, `serie ${outro.nome}-9 nao pertence a este material`, m, antes);
    const sai = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'SAIDA', quantidade: 1, motivo: 'x',
      justificativa: 'x', localizacao_origem_id: A.id, serie_ids: [await sid(m, '3')] });
    assert.strictEqual(sai.status, 201, JSON.stringify(sai.body));
    const depois = await retrato(m);
    await recusa(await transferir(m, A.id, B.id, [await sid(m, '3')]), 400,
      `A série ${m.nome}-3 não está no estoque (situação ENTREGUE) — só a peça presente muda de prateleira`, m, depois);
  });

  await test('[RN-265.02] serie BLOQUEADA muda de prateleira (continua bloqueada)', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2']);
    const s1 = await sid(m, '1');
    const b = await request(app).put(`${API}/series/${s1}/status`).send({ status: 'BLOQUEADA', justificativa: 'qualidade' });
    assert.strictEqual(b.status, 200, JSON.stringify(b.body));
    const r = await transferir(m, A.id, B.id, [s1]);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual(await retrato(m), { linhas: ['TT-A=1', 'TT-B=1'], series: ['1@TT-B', '2@TT-A'] });
    assert.strictEqual((await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE id = ?', [s1])).status, 'BLOQUEADA');
  });

  await test('[RN-265.02] lote: serie do L1 sem lote na transferencia; serie sem lote com lote L1 -> literais', async () => {
    const m = await material();
    await entrar(m, A.id, ['1'], { lote: 'L1-265T' });
    await entrar(m, A.id, ['2']);
    const l1 = await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m.id, 'L1-265T']);
    const antes = await retrato(m);
    await recusa(await transferir(m, A.id, B.id, [await sid(m, '1')]), 400,
      `A série ${m.nome}-1 é do lote L1-265T — escolha o lote L1-265T na transferência`, m, antes);
    await recusa(await transferir(m, A.id, B.id, [await sid(m, '2')], { lote_id: l1.id }), 400,
      `A série ${m.nome}-2 não tem lote — deixe o lote em branco na transferência`, m, antes);
    // controle: com o lote certo, passa e move a linha do lote
    const r = await transferir(m, A.id, B.id, [await sid(m, '1')], { lote_id: l1.id });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual((await retrato(m)).series, ['1@TT-B', '2@TT-A']);
    const linhaL1B = await dbGet(db, 'SELECT quantidade q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ? AND lote_id = ?', [m.id, B.id, l1.id]);
    assert.strictEqual(Number(linhaL1B.q), 1);
  });

  await test('[RN-265.02] material COM controle de lote: serie sem lote -> a frase nao manda deixar em branco', async () => {
    const m = await material({ lote: 1 });
    await entrar(m, A.id, ['1'], { lote: 'L9-265T' });
    const l9 = await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m.id, 'L9-265T']);
    await dbRun(db, 'UPDATE series_almoxarifado SET lote_id = NULL WHERE id = ?', [await sid(m, '1')]); // legado: serie sem lote
    const antes = await retrato(m);
    await recusa(await transferir(m, A.id, B.id, [await sid(m, '1')], { lote_id: l9.id }), 400,
      `A série ${m.nome}-1 não tem lote, e o material exige lote na transferência — ela não muda de prateleira por aqui`, m, antes);
  });

  await test('[RN-265.03] serie registrada em B (bate com o saldo) transferida de A -> recusa literal', async () => {
    const m = await material();
    await entrar(m, A.id, ['1']); await entrar(m, B.id, ['2']);
    const antes = await retrato(m);
    await recusa(await transferir(m, A.id, C.id, [await sid(m, '2')]), 400,
      `A série ${m.nome}-2 está na prateleira TT-B, não na origem TT-A — marque as séries que estão em TT-A`, m, antes);
  });

  await test('[RN-265.03] registro velho (transferencia de antes: saldo em B, series em A) e serie sem prateleira -> aceitas', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2', '3']);
    // a transferencia de antes desta etapa: o saldo de 1 foi para B e as series ficaram em A
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = 2 WHERE material_id = ? AND localizacao_id = ?', [m.id, A.id]);
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade) VALUES (?, ?, NULL, 1)`, [m.id, B.id]);
    const r = await transferir(m, B.id, C.id, [await sid(m, '3')]);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual(await retrato(m), { linhas: ['TT-A=2', 'TT-C=1'], series: ['1@TT-A', '2@TT-A', '3@TT-C'] });
    await dbRun(db, 'UPDATE series_almoxarifado SET localizacao_id = NULL WHERE id = ?', [await sid(m, '1')]);
    const r2 = await transferir(m, A.id, B.id, [await sid(m, '1')]);
    assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));
    assert.deepStrictEqual(await retrato(m), { linhas: ['TT-A=1', 'TT-B=1', 'TT-C=1'], series: ['1@TT-B', '2@TT-A', '3@TT-C'] });
  });

  await test('[RN-265.04] o livro falha -> linhas e series voltam (nada fica trocado)', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2']);
    const antes = await retrato(m);
    await dbRun(db, `CREATE TRIGGER falha_265t BEFORE INSERT ON movimentacoes_almoxarifado WHEN NEW.tipo = 'TRANSFERENCIA'
      BEGIN SELECT RAISE(ABORT, 'falha forcada 265'); END`);
    try {
      const r = await transferir(m, A.id, B.id, [await sid(m, '1'), await sid(m, '2')]);
      assert.strictEqual(r.status, 500, JSON.stringify(r.body));
    } finally { await dbRun(db, 'DROP TRIGGER falha_265t'); }
    assert.deepStrictEqual(await retrato(m), antes);
  });

  await test('[RN-265.05] estorno: o saldo e S1 voltam para A; o registro velho (S1 sem prateleira) tambem volta para a ORIGEM', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2']);
    await dbRun(db, 'UPDATE series_almoxarifado SET localizacao_id = NULL WHERE id = ?', [await sid(m, '1')]);
    assert.strictEqual((await transferir(m, A.id, B.id, [await sid(m, '1'), await sid(m, '2')])).status, 201);
    assert.deepStrictEqual(await retrato(m), { linhas: ['TT-B=2'], series: ['1@TT-B', '2@TT-B'] });
    const r = await estornar((await ultimaTransf(m)).id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await retrato(m), { linhas: ['TT-A=2'], series: ['1@TT-A', '2@TT-A'] });
  });

  await test('[RN-265.05] estorno com S1 ja fora de B (saiu; transferida de novo) -> recusa literal, nada muda', async () => {
    const m = await material();
    await entrar(m, A.id, ['1']); await entrar(m, B.id, ['9']);
    assert.strictEqual((await transferir(m, A.id, B.id, [await sid(m, '1')])).status, 201);
    const t1 = (await ultimaTransf(m)).id;
    assert.strictEqual((await transferir(m, B.id, C.id, [await sid(m, '1')])).status, 201);
    const antes = await retrato(m);
    assert.deepStrictEqual(antes, { linhas: ['TT-B=1', 'TT-C=1'], series: ['1@TT-C', '9@TT-B'] });
    const lit = `Não é possível estornar: a série ${m.nome}-1 não está mais na prateleira TT-B (saiu ou mudou de lugar depois da transferência)`;
    await recusa(await estornar(t1), 400, lit, m, antes);
    assert.strictEqual((await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [t1])).cancelado, 0);
    // saiu: S1 entregue (de C) — o estorno da 1a continua recusado
    const sai = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'SAIDA', quantidade: 1, motivo: 'x',
      justificativa: 'x', localizacao_origem_id: C.id, serie_ids: [await sid(m, '1')] });
    assert.strictEqual(sai.status, 201, JSON.stringify(sai.body));
    await recusa(await estornar(t1), 400, lit, m, await retrato(m));
  });

  await test('[RN-265.05] estorno com a serie BLOQUEADA no destino -> volta (continua bloqueada)', async () => {
    const m = await material();
    await entrar(m, A.id, ['1']);
    const s1 = await sid(m, '1');
    assert.strictEqual((await transferir(m, A.id, B.id, [s1])).status, 201);
    assert.strictEqual((await request(app).put(`${API}/series/${s1}/status`).send({ status: 'BLOQUEADA', justificativa: 'q' })).status, 200);
    const r = await estornar((await ultimaTransf(m)).id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await retrato(m), { linhas: ['TT-A=1'], series: ['1@TT-A'] });
  });

  await test('[RN-265.05] o livro do estorno falha -> series, linhas e o claim voltam', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2']);
    assert.strictEqual((await transferir(m, A.id, B.id, [await sid(m, '1')])).status, 201);
    const t = (await ultimaTransf(m)).id;
    const antes = await retrato(m);
    await dbRun(db, `CREATE TRIGGER falha_265te BEFORE INSERT ON movimentacoes_almoxarifado WHEN NEW.tipo = 'ESTORNO'
      BEGIN SELECT RAISE(ABORT, 'falha forcada 265e'); END`);
    try {
      const r = await estornar(t);
      assert.strictEqual(r.status, 500, JSON.stringify(r.body));
    } finally { await dbRun(db, 'DROP TRIGGER falha_265te'); }
    assert.deepStrictEqual(await retrato(m), antes);
    assert.strictEqual((await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [t])).cancelado, 0);
    // e o estorno de novo passa
    assert.strictEqual((await estornar(t)).status, 200);
    assert.deepStrictEqual(await retrato(m), { linhas: ['TT-A=2'], series: ['1@TT-A', '2@TT-A'] });
  });

  await test('[RN-265.05] transferencia sem registro (antiga) -> o estorno faz o de antes (so o saldo volta)', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2']);
    assert.strictEqual((await transferir(m, A.id, B.id, [await sid(m, '1')])).status, 201);
    const t = (await ultimaTransf(m)).id;
    await dbRun(db, 'DELETE FROM transferencia_series_almoxarifado WHERE movimentacao_id = ?', [t]);
    const r = await estornar(t);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await retrato(m), { linhas: ['TT-A=2'], series: ['1@TT-B', '2@TT-A'] });
  });

  await test('[contrato] GET /materiais/:id/series traz localizacao_codigo', async () => {
    const m = await material();
    await entrar(m, A.id, ['1']);
    const r = await request(app).get(`${API}/materiais/${m.id}/series?status=EM_ESTOQUE`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body[0].localizacao_codigo, 'TT-A');
  });

  terminou = true;
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
