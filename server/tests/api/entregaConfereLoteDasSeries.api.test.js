/**
 * Etapa 266 (C486, B1627; RN-266.01) — a entrega de VARIOS itens com uma serie de lote impedido (bloqueado, reprovado, vencido sem a
 * liberacao) e recusada ANTES de qualquer baixa: nenhum item sai, nenhuma movimentacao nova, saldos e series como antes.
 *
 * A C486 (Etapa 206) dizia que a serie de lote impedido so era recusada na baixa, depois de outros itens sairem — estava errada: o lote
 * das series vira o lote do item e passa pela conferencia por item (checarOrigemItem) antes da 1a baixa. Este arquivo e a prova que faltava
 * (o teste da 232 tem um item so). Controle positivo: sabotar a guarda de status de checarOrigemItem ou a derivacao `loteId = loteSeries`
 * faz o item comum sair antes da recusa e os cenarios caem.
 *
 * Plano: docs/superpowers/plans/2026-11-26-almoxarifado-etapa266-entrega-confere-lote-e-dica-da-fila.md
 * Executar: cd server && node tests/api/entregaConfereLoteDasSeries.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 266', role: 'admin', is_superadmin: 1, email: 'a266@t.com' };
const API = '/api/almoxarifado';
const ontem = () => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), -1);
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 266 (RN-266.01): a entrega confere o lote das series antes da 1a baixa ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');

  // Uma prateleira de verdade: sem ela o saldo nasce sem endereco e "escolher a prateleira" nao seria escolher nada.
  const alm = await ok(request(app).post(`${API}/almoxarifados`).send({ codigo: 'ALM266', nome: 'Almox 266' }), 201);
  await ok(request(app).post(`${API}/localizacoes`).send({ codigo: 'P266', descricao: 'P266', almoxarifado_id: alm.body.id, tipo: 'Prateleira' }), 201);
  const P = (await dbGet(db, 'SELECT id FROM localizacoes_almoxarifado WHERE codigo = ?', ['P266'])).id;
  const material = async ({ lote = 1, serie = 1 } = {}) => {
    const c = `E266-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, ?, ?, 0)`, [c, `Mat ${c}`, lote, serie])).lastID;
    return { id, nome: `Mat ${c}` };
  };
  const entrar = (m, q, numeros, lote) => ok(request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e266', localizacao_destino_id: P, ...(numeros ? { series: numeros } : {}), ...(lote ? { lote } : {}),
  }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const serieId = async (m, n) => (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [m.id, n])).id;
  const impedir = async (m, motivo) => {
    const id = await loteId(m, 'L2');
    if (motivo === 'vencido') await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?', [ontem(), id]);
    else await ok(request(app).put(`${API}/lotes/${id}/status`).send({ status: motivo, justificativa: 'teste 266' }));
  };
  // A requisicao: os itens na ordem dada, separados (a separacao grava a origem planejada — o um clique sai dela).
  const requisicao = async (linhas) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E266-${++seq}`])).lastID;
    const ids = [];
    for (const [m, q] of linhas) {
      // eslint-disable-next-line no-await-in-loop
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m.id, q])).lastID);
    }
    await requisitionService.separarRequisicao(db, R, ids.map((id, i) => ({ item_id: id, quantidade_separada: linhas[i][1] })), ADMIN);
    return { R, ids };
  };
  const entregar = (R, linhas) => request(app).put(`${API}/requisicoes/${R}/entregar`).send({ itens_atendidos: linhas });
  // O retrato do que a entrega mexe: o entregue de cada item, o fisico e as linhas dos materiais, as series e o livro.
  const retrato = async (R, mats) => ({
    entregue: (await dbAll(db, 'SELECT quantidade_entregue q FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [R]))
      .map((r) => Number(r.q)),
    fisico: await Promise.all(mats.map(async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?',
      [m.id])).q))),
    linhas: await Promise.all(mats.map(async (m) => (await dbAll(db, `SELECT localizacao_id, lote_id, quantidade FROM estoque_saldo_almoxarifado
      WHERE material_id = ? ORDER BY id`, [m.id])).map((l) => [l.localizacao_id, l.lote_id, Number(l.quantidade)]))),
    series: await Promise.all(mats.map(async (m) => (await dbAll(db, 'SELECT numero, status FROM series_almoxarifado WHERE material_id = ? ORDER BY numero',
      [m.id])).map((s) => `${s.numero}:${s.status}`))),
    livro: Number((await dbGet(db, `SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id IN (${mats.map(() => '?').join(',')})`,
      mats.map((m) => m.id))).n),
  });
  const montar = async ({ lote }) => {
    const comum = await material({ lote: 0, serie: 0 });
    await entrar(comum, 5);
    const ms = await material({ lote });
    await entrar(ms, 2, ['S1', 'S2'], 'L1');
    await entrar(ms, 2, ['S3', 'S4'], 'L2');
    return { comum, ms };
  };
  const prateleiraDo = async (m) => (await dbGet(db, 'SELECT localizacao_id FROM estoque_saldo_almoxarifado WHERE material_id = ? AND quantidade > 0',
    [m.id])).localizacao_id;
  const linhaDaSerie = async (ms, itemId, modo, numero = 'S3') => {
    const l = { item_id: itemId, quantidade_atendida: 1, serie_ids: [await serieId(ms, numero)] };
    if (modo === 'automatico') l.origem_automatica = true;
    if (modo === 'prateleira') {
      l.localizacao_origem_id = (await dbGet(db, 'SELECT localizacao_id FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id = ?',
        [ms.id, await loteId(ms, 'L2')])).localizacao_id;
    }
    return l; // 'um clique': sem origem, a planejada da separacao
  };
  const frase = (ms, motivo) => (motivo === 'vencido'
    ? `${ms.nome}: Lote L2 vencido em ${ontem()} nao pode sair para consumo. Libere o vencimento do lote `
      + '(PUT /api/almoxarifado/lotes/:id/liberar-vencimento) com justificativa, ou baixe por SUCATA/PERDA ou corrija por AJUSTE.'
    : `${ms.nome}: Lote L2 esta ${motivo.toLowerCase()} e nao pode ser utilizado`);

  for (const motivo of ['BLOQUEADO', 'REPROVADO', 'vencido']) {
    for (const lote of [1, 0]) {
      for (const modo of ['automatico', 'um clique', 'prateleira']) {
        // eslint-disable-next-line no-await-in-loop
        await test(`[RN-266.01] ${motivo}, controle de lote ${lote}, ${modo}: o item comum (1o) nao sai; 400 com a frase do motor`, async () => {
          const { comum, ms } = await montar({ lote });
          const { R, ids } = await requisicao([[comum, 2], [ms, 1]]);
          await impedir(ms, motivo);
          const antes = await retrato(R, [comum, ms]);
          assert.deepStrictEqual(antes.entregue, [0, 0], 'premissa');
          // O comum sai de uma prateleira escolhida (a passada 0, a primeira): sem a conferencia antes da 1a baixa ele sairia antes da recusa.
          const r = await entregar(R, [{ item_id: ids[0], quantidade_atendida: 2, localizacao_origem_id: await prateleiraDo(comum) },
            await linhaDaSerie(ms, ids[1], modo)]);
          assert.strictEqual(r.status, 400, JSON.stringify(r.body));
          assert.deepStrictEqual(await retrato(R, [comum, ms]), antes, 'nada saiu');
          assert.strictEqual(r.body.error, frase(ms, motivo));
        });
      }
    }
  }

  for (const motivo of ['BLOQUEADO', 'REPROVADO', 'vencido']) {
  // eslint-disable-next-line no-await-in-loop
  await test(`[RN-266.01] ${motivo}: o item da serie ANTES do comum, e um irmao da serie em lote bom antes dele: nada sai`, async () => {
    const { comum, ms } = await montar({ lote: 1 });
    const { R, ids } = await requisicao([[ms, 1], [ms, 1], [comum, 2]]);
    await impedir(ms, motivo);
    const antes = await retrato(R, [comum, ms]);
    const r = await entregar(R, [await linhaDaSerie(ms, ids[0], 'automatico', 'S1'), await linhaDaSerie(ms, ids[1], 'automatico', 'S3'),
      { item_id: ids[2], quantidade_atendida: 2 }]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.deepStrictEqual(await retrato(R, [comum, ms]), antes, 'nada saiu — nem a S1 do lote bom');
    assert.strictEqual(r.body.error, frase(ms, motivo));
  });
  }

  // Fase 2 (achado 1): com a origem planejada NO lote impedido (separada de P266/L2), o um clique leva o envelope da planejada com a frase do
  // motor dentro — e tambem nada sai.
  await test('[RN-266.01] separada de P266/L2, L2 bloqueado depois, um clique: o envelope da planejada; nada sai', async () => {
    const { comum, ms } = await montar({ lote: 1 });
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E266-${++seq}`])).lastID;
    const ids = [];
    for (const [m, q] of [[comum, 2], [ms, 1]]) {
      // eslint-disable-next-line no-await-in-loop
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m.id, q])).lastID);
    }
    await requisitionService.separarRequisicao(db, R, [{ item_id: ids[0], quantidade_separada: 2 },
      { item_id: ids[1], quantidade_separada: 1, localizacao_origem_id: P, lote_id: await loteId(ms, 'L2') }], ADMIN);
    const plan = await dbGet(db, 'SELECT origem_separacao_id o, lote_separacao_id l FROM itens_requisicao_almoxarifado WHERE id = ?', [ids[1]]);
    assert.deepStrictEqual([Number(plan.o), Number(plan.l)], [P, await loteId(ms, 'L2')], 'premissa: a planejada em P266/L2');
    await impedir(ms, 'BLOQUEADO');
    const antes = await retrato(R, [comum, ms]);
    const r = await entregar(R, [{ item_id: ids[0], quantidade_atendida: 2, localizacao_origem_id: await prateleiraDo(comum) },
      await linhaDaSerie(ms, ids[1], 'um clique')]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.deepStrictEqual(await retrato(R, [comum, ms]), antes, 'nada saiu');
    assert.strictEqual(r.body.error, `${ms.nome}: a origem da separação (P266) não serve mais (Lote L2 esta bloqueado e nao pode ser `
      + 'utilizado) — entregue escolhendo de onde sai');
  });

  await test('[RN-266.01] metade positiva: o vencimento liberado -> 200, os dois itens saem e a S3 fica ENTREGUE', async () => {
    const { comum, ms } = await montar({ lote: 1 });
    const { R, ids } = await requisicao([[comum, 2], [ms, 1]]);
    await impedir(ms, 'vencido');
    await dbRun(db, 'UPDATE lotes_almoxarifado SET vencimento_liberado_em = CURRENT_TIMESTAMP WHERE id = ?', [await loteId(ms, 'L2')]);
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }, await linhaDaSerie(ms, ids[1], 'automatico')]));
    const depois = await retrato(R, [comum, ms]);
    assert.deepStrictEqual(depois.entregue, [2, 1]);
    assert.deepStrictEqual(depois.series[1], ['S1:EM_ESTOQUE', 'S2:EM_ESTOQUE', 'S3:ENTREGUE', 'S4:EM_ESTOQUE']);
  });

  terminou = true;
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
