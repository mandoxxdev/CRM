/**
 * Etapa 265 (item 11, C545, B1626) — a Saida avulsa (v2) de peca com numero de serie, sem escolher de onde sai, baixa o saldo da prateleira
 * em que cada serie esta (uma baixa por prateleira), quando o registro das series serve; senao, como antes (a padrao, depois a maior).
 *
 * RN-265.10: series com prateleira, prateleira usavel, linha cobre, registro bate -> uma baixa por prateleira da serie.
 * RN-265.11: serie sem prateleira, prateleira bloqueada, linha nao cobre, registro velho, origem escolhida, ou sem a opcao (o servico
 *            chamado direto) -> como hoje.
 * RN-265.12: o estorno da Saida devolve a cada prateleira o que saiu dela (o registro da 257).
 * RN-265.13: integracao (transferencia -> saida -> estornos), pela rota.
 * Retrato = linhas de saldo nao nulas + series presentes por prateleira.
 * Plano: docs/superpowers/plans/2026-11-26-almoxarifado-etapa265-transferencia-e-saida-com-numero-de-serie.md
 *
 * Executar: cd server && node tests/api/saidaDaPrateleiraDaSerie.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`); });
}

const ADMIN = { id: 1, nome: 'Adm 265S', role: 'admin', is_superadmin: 1, email: 'a265s@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 265 (C545): a saida de peca com serie sai da prateleira da serie ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const alm = await request(app).post(`${API}/almoxarifados`).send({ codigo: 'ALM265S', nome: 'Almox 265 S' });
  assert.ok(alm.status === 201 || alm.status === 200, JSON.stringify(alm.body));
  const loc = async (codigo) => {
    const r = await request(app).post(`${API}/localizacoes`).send({ codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('SS-A'); const B = await loc('SS-B'); const C = await loc('SS-C'); const P = await loc('SS-P');
  const material = async ({ lote = 0 } = {}) => {
    const c = `E265S-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, 1, 0, ?)`, [c, c, lote, P.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, destino, numeros, extra = {}) => {
    const r = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'ENTRADA', quantidade: numeros.length,
      motivo: 'e265', localizacao_destino_id: destino, series: numeros.map((n) => `${m.nome}-${n}`), ...extra });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const sid = async (m, n) => (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [m.id, `${m.nome}-${n}`])).id;
  const sair = async (m, numeros, extra = {}, st = 201) => {
    const ids = [];
    // eslint-disable-next-line no-await-in-loop
    for (const n of numeros) ids.push(await sid(m, n));
    const r = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'SAIDA', quantidade: ids.length,
      motivo: 'uso', justificativa: 'uso', serie_ids: ids, ...extra });
    assert.strictEqual(r.status, st, JSON.stringify(r.body));
    return r;
  };
  const retrato = async (m) => {
    const linhas = await dbAll(db, `SELECT l.codigo as loc, s.quantidade q FROM estoque_saldo_almoxarifado s
        LEFT JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id WHERE s.material_id = ? ORDER BY l.codigo`, [m.id]);
    const series = await dbAll(db, `SELECT l.codigo as loc, COUNT(*) n FROM series_almoxarifado s
        LEFT JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id WHERE s.material_id = ? AND s.status IN ('EM_ESTOQUE','BLOQUEADA')
        GROUP BY l.codigo ORDER BY l.codigo`, [m.id]);
    return {
      linhas: linhas.filter((x) => Math.abs(Number(x.q)) > 1e-9).map((x) => `${x.loc || '-'}=${Number(x.q)}`),
      series: series.map((x) => `${x.loc || '-'}=${Number(x.n)}`),
    };
  };
  const ultima = async (m, tipo) => dbGet(db, `SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ?
    ORDER BY id DESC LIMIT 1`, [m.id, tipo]);
  const estornar = (movId) => request(app).post(`${API}/movimentacoes/${movId}/cancelar`).send({ motivo: 'estorno de teste 265' });

  await test('[RN-265.10] S3 em B (A 2 com S1, S2; B 1 com S3): a Saida de S3 sem origem baixa B, nao a maior (A)', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2']); await entrar(m, B.id, ['3']);
    await sair(m, ['3']);
    assert.deepStrictEqual(await retrato(m), { linhas: ['SS-A=2'], series: ['SS-A=2'] });
  });

  await test('[RN-265.10] S1 (A) e S3 (B) numa saida so: uma baixa em cada prateleira; o registro da 257 guarda as duas', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2']); await entrar(m, B.id, ['3', '4']); await entrar(m, C.id, ['5', '6', '7']);
    await sair(m, ['1', '3']);
    assert.deepStrictEqual(await retrato(m), { linhas: ['SS-A=1', 'SS-B=1', 'SS-C=3'], series: ['SS-A=1', 'SS-B=1', 'SS-C=3'] });
    const mv = await ultima(m, 'SAIDA');
    const reg = await dbAll(db, `SELECT l.codigo loc, d.quantidade q FROM ajuste_linhas_drenadas_almoxarifado d
      JOIN estoque_saldo_almoxarifado s ON s.id = d.saldo_id LEFT JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id
      WHERE d.movimentacao_id = ? ORDER BY l.codigo`, [mv.id]);
    assert.deepStrictEqual(reg.map((x) => `${x.loc}=${Number(x.q)}`), ['SS-A=1', 'SS-B=1']);
  });

  await test('[RN-265.10] com lote: a serie do L1 em B sai de B (linha do L1 em B), nao da maior linha do lote', async () => {
    const m = await material({ lote: 1 });
    await entrar(m, A.id, ['1', '2', '3'], { lote: 'L1-265S' }); await entrar(m, B.id, ['4'], { lote: 'L1-265S' });
    const l1 = await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m.id, 'L1-265S']);
    await sair(m, ['4'], { lote_id: l1.id });
    assert.deepStrictEqual(await retrato(m), { linhas: ['SS-A=3'], series: ['SS-A=3'] });
  });

  await test('[RN-265.10 Fase 5] duas series na mesma prateleira (S5, S6 em B): uma baixa de 2 em B; o estorno devolve 2', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2', '3']); await entrar(m, B.id, ['5', '6', '7']);
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = 4 WHERE material_id = ? AND localizacao_id = ?', [m.id, A.id]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 7 WHERE id = ?', [m.id]);
    await entrar(m, P.id, ['9']); // fisico 8; A 4 (3 series, bate), B 3, P 1
    await sair(m, ['5', '6']);
    assert.deepStrictEqual((await retrato(m)).linhas, ['SS-A=4', 'SS-B=1', 'SS-P=1']);
    assert.strictEqual(Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q), 6);
    assert.strictEqual((await estornar((await ultima(m, 'SAIDA')).id)).status, 200);
    assert.deepStrictEqual((await retrato(m)).linhas, ['SS-A=4', 'SS-B=3', 'SS-P=1']);
  });

  await test('[RN-265.11 f Fase 5] a peca de B esta separada (origem B) para uma requisicao -> como hoje, e a entrega dela sai', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2']); await entrar(m, B.id, ['3']);
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E265S-${++seq}`])).lastID;
    const it = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,1,0,0,0)`, [R, m.id])).lastID;
    const sep = await request(app).put(`${API}/requisicoes/${R}/separacao`).send({ itens_separados: [{ item_id: it, quantidade_separada: 1,
      localizacao_origem_id: B.id }] });
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
    await sair(m, ['3']);
    assert.deepStrictEqual((await retrato(m)).linhas, ['SS-A=1', 'SS-B=1']);
    const ent = await request(app).put(`${API}/requisicoes/${R}/entregar`).send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 1,
      serie_ids: [await sid(m, '1')] }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
  });

  await test('[RN-265.11 g Fase 5] Ajuste negativo pela v2 (fora do formulario) -> como hoje', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2']); await entrar(m, B.id, ['3']);
    const r = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'AJUSTE_NEGATIVO', quantidade: 1,
      motivo: 'x', justificativa: 'x', serie_ids: [await sid(m, '3')] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual((await retrato(m)).linhas, ['SS-A=1', 'SS-B=1']);
  });

  await test('[RN-265.12] o estorno da Saida devolve a cada prateleira o que saiu dela', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2']); await entrar(m, B.id, ['3']);
    await sair(m, ['1', '3']);
    assert.deepStrictEqual(await retrato(m), { linhas: ['SS-A=1'], series: ['SS-A=1'] });
    const r = await estornar((await ultima(m, 'SAIDA')).id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await retrato(m), { linhas: ['SS-A=2', 'SS-B=1'], series: ['SS-A=2', 'SS-B=1'] });
  });

  await test('[RN-265.11 a] serie sem prateleira -> como hoje (a maior)', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2']); await entrar(m, B.id, ['3']);
    await dbRun(db, 'UPDATE series_almoxarifado SET localizacao_id = NULL WHERE id = ?', [await sid(m, '3')]);
    await sair(m, ['3']);
    assert.deepStrictEqual((await retrato(m)).linhas, ['SS-A=1', 'SS-B=1']);
  });

  await test('[RN-265.11 b] prateleira da serie bloqueada -> como hoje', async () => {
    const m = await material();
    const D = await loc(`SS-D${seq}`);
    await entrar(m, A.id, ['1', '2']); await entrar(m, D.id, ['3']);
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id = ?', [D.id]);
    try {
      await sair(m, ['3']);
    } finally { await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 0 WHERE id = ?', [D.id]); }
    assert.deepStrictEqual((await retrato(m)).linhas, ['SS-A=1', `${D.codigo}=1`]);
  });

  await test('[RN-265.11 c] registro velho (saldo de B levado para A antes da 265, series em B) -> como hoje', async () => {
    const m = await material();
    await entrar(m, A.id, ['1']); await entrar(m, B.id, ['2', '3']);
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade - 1 WHERE material_id = ? AND localizacao_id = ?', [m.id, B.id]);
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade + 1 WHERE material_id = ? AND localizacao_id = ?', [m.id, A.id]);
    // B: linha 1, 2 series presentes -> o registro de B nao vale; a saida de S2 vai pela maior (A 2)
    await sair(m, ['2']);
    assert.deepStrictEqual((await retrato(m)).linhas, ['SS-A=1', 'SS-B=1']);
  });

  await test('[RN-265.11 c] a serie BLOQUEADA conta no registro: B linha 1 com S2 em estoque e S3 bloqueada -> como hoje', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '9']); await entrar(m, B.id, ['2', '3']);
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade - 1 WHERE material_id = ? AND localizacao_id = ?', [m.id, B.id]);
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade + 1 WHERE material_id = ? AND localizacao_id = ?', [m.id, A.id]);
    assert.strictEqual((await request(app).put(`${API}/series/${await sid(m, '3')}/status`).send({ status: 'BLOQUEADA', justificativa: 'q' })).status, 200);
    await sair(m, ['2']);
    assert.deepStrictEqual((await retrato(m)).linhas, ['SS-A=2', 'SS-B=1']);
  });

  await test('[RN-265.11 d] origem escolhida -> como hoje (sai da origem, mesmo com a serie em outra prateleira)', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2']); await entrar(m, B.id, ['3']);
    await sair(m, ['3'], { localizacao_origem_id: A.id });
    assert.deepStrictEqual((await retrato(m)).linhas, ['SS-A=1', 'SS-B=1']);
  });

  await test('[RN-265.11 e] pelo servico, sem a opcao (os chamadores internos) -> como hoje', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2']); await entrar(m, B.id, ['3']);
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m.id, tipo: 'SAIDA', quantidade: 1, motivo: 'x', justificativa: 'x',
      serie_ids: [await sid(m, '3')] }, { exigeSerie: true });
    assert.deepStrictEqual((await retrato(m)).linhas, ['SS-A=1', 'SS-B=1']);
  });

  await test('[RN-265.10] o livro falha -> a baixa da prateleira da serie volta (linhas, fisico e serie)', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2']); await entrar(m, B.id, ['3']);
    const antes = await retrato(m);
    await dbRun(db, `CREATE TRIGGER falha_265s BEFORE INSERT ON movimentacoes_almoxarifado WHEN NEW.tipo = 'SAIDA'
      BEGIN SELECT RAISE(ABORT, 'falha forcada 265s'); END`);
    try {
      await sair(m, ['3'], {}, 500);
    } finally { await dbRun(db, 'DROP TRIGGER falha_265s'); }
    assert.deepStrictEqual(await retrato(m), antes);
    const fis = await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    assert.strictEqual(Number(fis.q), 3);
    // controle (Fase 5, achado 3): sem o gatilho, a mesma saida baixa B — o cenario passa pelo caminho novo
    await sair(m, ['3']);
    assert.deepStrictEqual((await retrato(m)).linhas, ['SS-A=2']);
  });

  await test('[RN-265.13] integracao: transfere S1 de A para B, sai S1 sem origem (baixa B), estorna a saida e a transferencia', async () => {
    const m = await material();
    await entrar(m, A.id, ['1', '2', '3']);
    const t = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'TRANSFERENCIA', quantidade: 1,
      localizacao_origem_id: A.id, localizacao_destino_id: B.id, serie_ids: [await sid(m, '1')] });
    assert.strictEqual(t.status, 201, JSON.stringify(t.body));
    const tid = (await ultima(m, 'TRANSFERENCIA')).id;
    assert.deepStrictEqual(await retrato(m), { linhas: ['SS-A=2', 'SS-B=1'], series: ['SS-A=2', 'SS-B=1'] });
    await sair(m, ['1']);
    assert.deepStrictEqual(await retrato(m), { linhas: ['SS-A=2'], series: ['SS-A=2'] });
    // com a saida viva, o estorno da transferencia e recusado (S1 nao esta mais em B)
    const r0 = await estornar(tid);
    assert.strictEqual(r0.status, 400, JSON.stringify(r0.body));
    assert.strictEqual((await estornar((await ultima(m, 'SAIDA')).id)).status, 200);
    assert.deepStrictEqual(await retrato(m), { linhas: ['SS-A=2', 'SS-B=1'], series: ['SS-A=2', 'SS-B=1'] });
    const r = await estornar(tid);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await retrato(m), { linhas: ['SS-A=3'], series: ['SS-A=3'] });
  });

  terminou = true;
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
