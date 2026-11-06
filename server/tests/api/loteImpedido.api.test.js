/**
 * Etapa 205 (T0) — a regua e a conta do LOTE IMPEDIDO (RN-205.01, RN-205.02 a-h; Fase 2 I1, I2, M2).
 *
 * RN-205.01: o predicado SQL do fragmento == !elegivel de `listarLotesDoMaterial`, lote a lote (oito lotes). RN-205.02: o desconto
 * pelo servico — `saldoDisponivelParaItem` devolve `lote_impedido` e `disponivel_liberado`, e `disponivel` igual ao de hoje.
 * Validades RELATIVAS a hoje (diaLocal). Plano: docs/superpowers/plans/2026-11-06-almoxarifado-etapa205-lote-impedido-na-aprovacao-e-separacao.md
 *
 * Executar: cd server && node tests/api/loteImpedido.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const lotService = require('../../services/almoxarifado/lotService');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 205', role: 'admin', is_superadmin: 1, email: 'a205@t.com' };
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 205 (T0): a regua e a conta do lote impedido ===\n');
  let mod = {};
  try { mod = require('../../services/almoxarifado/loteImpedido'); } catch (e) { /* vermelho abaixo */ }

  await test('[T0] o modulo existe e recusa "hoje" invalido (B1376)', async () => {
    assert.strictEqual(typeof mod.loteImpedidoSql, 'function', 'loteImpedidoSql exportada');
    assert.strictEqual(typeof mod.predicadoLoteImpedidoSql, 'function', 'predicadoLoteImpedidoSql exportada');
    assert.throws(() => mod.loteImpedidoSql('m', "2026-01-01' OR 1=1 --"), (e) => e.message === mod.MSG_HOJE_INVALIDO);
    assert.throws(() => mod.predicadoLoteImpedidoSql('l', '06/11/2026'), (e) => e.message === mod.MSG_HOJE_INVALIDO);
    assert.strictEqual(mod.fraseLoteImpedido(6, 'un'), 'Não entram 6 un em lote bloqueado, reprovado ou vencido.');
    assert.strictEqual(mod.fraseLoteImpedido(0.30000000000000004, ''), 'Não entram 0.3 em lote bloqueado, reprovado ou vencido.');
  });
  if (typeof mod.loteImpedidoSql !== 'function') {
    console.log(`\n${passed} passaram, ${failed} falharam\n`); terminou = true; process.exit(1);
  }

  const { app, db, close } = await createTestApp({ user: { ...ADMIN } });
  const post = (u, b) => request(app).post(u).send(b);
  const alm = await post(`${API}/almoxarifados`, { codigo: 'ALM205', nome: 'Almox 205' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  await post(`${API}/localizacoes`, { codigo: 'Z205-01', descricao: 'Z205-01', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z205-01'");

  const material = async ({ unidade = 'un' } = {}) => {
    const c = `E205-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, ?, 0, 0, 1, 0, 0.1, 1, 0, ?)`, [c, c, unidade, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, q, lote) => {
    const r = await post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e205',
      localizacao_destino_id: P01.id, lote });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const status = async (m, codigo, st) => lotService.mudarStatusLote(db, ADMIN, await loteId(m, codigo), st, 'teste 205');
  const validade = async (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?',
    [data, await loteId(m, codigo)]);
  const itemDe = async (m, q = 1) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E205-${++seq}`])).lastID;
    const id = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m.id, q])).lastID;
    return dbGet(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE id = ?', [id]);
  };
  const saldo = async (m) => requisitionService.saldoDisponivelParaItem(db, await itemDe(m));
  const conta = (s) => ({ disponivel: s.disponivel, lote_impedido: s.lote_impedido, disponivel_liberado: s.disponivel_liberado });

  // ── RN-205.01: a regua e a de elegivel, lote a lote ────────────────────────────────────────────────────────────────────────────
  await test('[RN-205.01] oito lotes: o predicado SQL == !elegivel de listarLotesDoMaterial, lote a lote', async () => {
    const m = await material();
    const cods = ['SEMVAL', 'HOJE', 'ONTEM', 'ONTEMLIB', 'BLOQ', 'REPR', 'BLOQVENCLIB', 'AMANHA'];
    for (const c of cods) await entrar(m, 1, c); // eslint-disable-line no-await-in-loop
    await validade(m, 'HOJE', dia(0)); await validade(m, 'ONTEM', dia(-1)); await validade(m, 'ONTEMLIB', dia(-1));
    await validade(m, 'BLOQVENCLIB', dia(-1)); await validade(m, 'AMANHA', dia(1));
    await lotService.liberarVencimento(db, ADMIN, await loteId(m, 'ONTEMLIB'), 'teste 205');
    await lotService.liberarVencimento(db, ADMIN, await loteId(m, 'BLOQVENCLIB'), 'teste 205');
    await status(m, 'BLOQ', 'BLOQUEADO'); await status(m, 'REPR', 'REPROVADO'); await status(m, 'BLOQVENCLIB', 'BLOQUEADO');
    const sql = await dbAll(db, `SELECT l.codigo, ${mod.predicadoLoteImpedidoSql('l')} as imp FROM lotes_almoxarifado l
      WHERE l.material_id = ? ORDER BY l.codigo`, [m.id]);
    const js = new Map((await lotService.listarLotesDoMaterial(db, m.id)).map((l) => [l.codigo, !l.elegivel]));
    assert.strictEqual(sql.length, 8, 'premissa: oito lotes');
    for (const l of sql) assert.strictEqual(Number(l.imp) === 1, js.get(l.codigo), `lote ${l.codigo}`);
    assert.deepStrictEqual(sql.filter((l) => Number(l.imp) === 1).map((l) => l.codigo).sort(),
      ['BLOQ', 'BLOQVENCLIB', 'ONTEM', 'REPR'], 'os quatro impedidos');
    // e o desconto do material soma os quatro (1 cada)
    assert.strictEqual((await saldo(m)).lote_impedido, 4);
  });
  await test('[Fase 2 M2] validade vazia ("") nao vence: o predicado e elegivel concordam', async () => {
    const m = await material();
    await entrar(m, 1, 'VAZIA'); await validade(m, 'VAZIA', '');
    const r = await dbGet(db, `SELECT ${mod.predicadoLoteImpedidoSql('l')} as imp FROM lotes_almoxarifado l WHERE l.material_id = ?`, [m.id]);
    const [js] = await lotService.listarLotesDoMaterial(db, m.id);
    assert.strictEqual(js.elegivel, true, 'premissa: elegivel');
    assert.strictEqual(Number(r.imp), 0);
  });

  // ── RN-205.02: a conta ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  const l1l2 = async (opcoes = {}) => {
    const m = await material(opcoes);
    await entrar(m, opcoes.q1 ?? 4, 'L1'); await entrar(m, opcoes.q2 ?? 6, 'L2');
    return m;
  };
  await test('[RN-205.02 a] L1 ATIVO 4, L2 BLOQUEADO 6 -> lote_impedido 6, disponivel_liberado 4, disponivel 10 (igual a hoje)', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO');
    assert.deepStrictEqual(conta(await saldo(m)), { disponivel: 10, lote_impedido: 6, disponivel_liberado: 4 });
  });
  await test('[RN-205.02 b] L2 BLOQUEADO 6 inteiro em inspecao (item de recebimento do L2) -> lote_impedido 0, disponivel 4', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_inspecao = 6 WHERE id = ?', [m.id]);
    const rec = (await dbRun(db, "INSERT INTO recebimentos_material_almoxarifado (numero) VALUES (?)", [`REC-205-${++seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida,
      lote_id, quantidade_em_inspecao) VALUES (?, ?, 6, 6, ?, 6)`, [rec, m.id, await loteId(m, 'L2')]);
    assert.deepStrictEqual(conta(await saldo(m)), { disponivel: 4, lote_impedido: 0, disponivel_liberado: 4 });
  });
  await test('[RN-205.02 c] L2 REPROVADO 6, bloqueada do material 2 -> lote_impedido 4', async () => {
    const m = await l1l2(); await status(m, 'L2', 'REPROVADO');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 2 WHERE id = ?', [m.id]);
    assert.deepStrictEqual(conta(await saldo(m)), { disponivel: 8, lote_impedido: 4, disponivel_liberado: 4 });
  });
  await test('[RN-205.02 d] L2 BLOQUEADO com saldo -1 (legado) e L3 BLOQUEADO 3 -> lote_impedido 3 (o negativo nao abate)', async () => {
    const m = await l1l2({ q2: 1 }); await entrar(m, 3, 'L3');
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = -1 WHERE lote_id = ?', [await loteId(m, 'L2')]);
    await status(m, 'L2', 'BLOQUEADO'); await status(m, 'L3', 'BLOQUEADO');
    assert.strictEqual((await saldo(m)).lote_impedido, 3);
  });
  await test('[RN-205.02 e] o mesmo de (a) com controle_lote = 0 -> lote_impedido 0, disponivel_liberado = disponivel = 10', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 0 WHERE id = ?', [m.id]);
    assert.deepStrictEqual(conta(await saldo(m)), { disponivel: 10, lote_impedido: 0, disponivel_liberado: 10 });
  });
  await test('[RN-205.02 f] fracoes: L2 BLOQUEADO 0,3 com bloqueada 0,1 -> 0,2 (nao 0.19999999999999998)', async () => {
    const m = await l1l2({ unidade: 'KG', q1: 0.4, q2: 0.3 }); await status(m, 'L2', 'BLOQUEADO');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 0.1 WHERE id = ?', [m.id]);
    const s = await saldo(m);
    assert.strictEqual(s.lote_impedido, 0.2);
    assert.strictEqual(s.disponivel_liberado, 0.4);
  });
  await test('[RN-205.02 g, Fase 2 I1] L2 BLOQUEADO 6, em terceiros 3 -> lote_impedido 3, disponivel_liberado 4', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_terceiros = 3 WHERE id = ?', [m.id]);
    assert.deepStrictEqual(conta(await saldo(m)), { disponivel: 7, lote_impedido: 3, disponivel_liberado: 4 });
  });
  await test('[RN-205.02 h, Fase 2 I2] L1 ATIVO 4; L2 2 vencido ontem com 2 em inspecao SEM item de recebimento -> lote_impedido 0', async () => {
    const m = await l1l2({ q2: 2 }); await validade(m, 'L2', dia(-1));
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_inspecao = 2 WHERE id = ?', [m.id]);
    assert.deepStrictEqual(conta(await saldo(m)), { disponivel: 4, lote_impedido: 0, disponivel_liberado: 4 });
  });
  await test('[RN-205.02 h, pela rota] devolucao de 2 para Quarentena volta para L2, que vence depois -> lote_impedido 0 (a quarentena da devolucao e bloqueio)', async () => {
    const m = await l1l2({ q2: 2 });
    const s = await post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'SAIDA', quantidade: 2, motivo: 'e205', justificativa: 'teste 205',
      localizacao_origem_id: P01.id, lote_id: await loteId(m, 'L2') });
    assert.strictEqual(s.status, 201, JSON.stringify(s.body));
    const saida = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA' ORDER BY id DESC", [m.id]);
    const dv = await post(`${API}/devolucoes`, { material_id: m.id, quantidade: 2, motivo: 'NAO_UTILIZADO', destino: 'QUARENTENA',
      movimentacao_saida_id: saida.id, localizacao_id: P01.id });
    assert.strictEqual(dv.status, 201, JSON.stringify(dv.body));
    await validade(m, 'L2', dia(-1));
    const linha = await dbGet(db, 'SELECT SUM(quantidade) q FROM estoque_saldo_almoxarifado WHERE lote_id = ?', [await loteId(m, 'L2')]);
    assert.strictEqual(Number(linha.q), 2, 'premissa: a devolucao voltou para L2');
    assert.deepStrictEqual(conta(await saldo(m)), { disponivel: 4, lote_impedido: 0, disponivel_liberado: 4 });
  });
  await test('[B1368] sem lote impedido o retorno e o de hoje mais os dois campos (lote_impedido 0, liberado = disponivel)', async () => {
    const m = await l1l2();
    const s = await saldo(m);
    assert.deepStrictEqual(conta(s), { disponivel: 10, lote_impedido: 0, disponivel_liberado: 10 });
    assert.strictEqual(s.disponivel_material, 10);
  });

  // ── Fase 5 (P1, B1379): o saldo NEGATIVO sem lote (o que a entrega deixa ao sair de lote impedido, RN-205.10) abate o impedido ──
  // A conta: max(0, conta de antes - max(0, -SOMA das linhas sem lote)). So o sem lote LIQUIDO negativo abate: lote impedido negativo
  // continua sem abater o outro (RN-205.02 d) e lote elegivel negativo tambem nao. Linhas por SQL, quantidade_atual = soma das linhas.
  const linhasDiretas = async (m, linhas) => {
    let total = 0;
    for (const [codigo, q, st] of linhas) { // eslint-disable-line no-restricted-syntax
      let lote = null;
      if (codigo) {
        lote = (await dbRun(db, 'INSERT INTO lotes_almoxarifado (material_id, codigo, status) VALUES (?,?,?)', [m.id, codigo, st || 'ATIVO'])).lastID; // eslint-disable-line no-await-in-loop
      }
      await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade) VALUES (?,?,?,?)', [m.id, P01.id, lote, q]); // eslint-disable-line no-await-in-loop
      total += q;
    }
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ? WHERE id = ?', [total, m.id]);
  };
  await test('[RN-205.02 i, Fase 5 P1] L1 BLOQUEADO 10, sem lote -6, L3 ATIVO 5 -> lote_impedido 4, disponivel_liberado 5 (antes 10 e -1)', async () => {
    const m = await material(); await linhasDiretas(m, [['L1', 10, 'BLOQUEADO'], [null, -6], ['L3', 5]]);
    assert.deepStrictEqual(conta(await saldo(m)), { disponivel: 9, lote_impedido: 4, disponivel_liberado: 5 });
  });
  await test('[RN-205.02 j, Fase 5 P1] o negativo sem lote maior que o impedido: L1 BLOQUEADO 3, sem lote -6, L3 ATIVO 5 -> 0 (o liberado nunca passa do disponivel)', async () => {
    const m = await material(); await linhasDiretas(m, [['L1', 3, 'BLOQUEADO'], [null, -6], ['L3', 5]]);
    assert.deepStrictEqual(conta(await saldo(m)), { disponivel: 2, lote_impedido: 0, disponivel_liberado: 2 });
  });
  await test('[RN-205.02 k, Fase 5 P1] sem lote POSITIVO (legado) e livre e nao muda a conta: L1 BLOQUEADO 6, sem lote 2, L3 ATIVO 4 -> 6', async () => {
    const m = await material(); await linhasDiretas(m, [['L1', 6, 'BLOQUEADO'], [null, 2], ['L3', 4]]);
    assert.deepStrictEqual(conta(await saldo(m)), { disponivel: 12, lote_impedido: 6, disponivel_liberado: 6 });
  });
  await test('[Fase 5 P1, sorteio] 150 materiais sorteados: o impedido e o modelo (a conta antiga menos o sem lote liquido negativo), nunca passa do saldo dos lotes impedidos nem deixa o liberado acima do disponivel', async () => {
    let semente = 205;
    const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
    const STS = ['ATIVO', 'ATIVO', 'BLOQUEADO', 'REPROVADO'];
    let mordeu = 0;
    for (let k = 0; k < 150; k++) { // eslint-disable-line no-restricted-syntax
      const m = await material(); // eslint-disable-line no-await-in-loop
      const linhas = []; const n = 1 + Math.floor(rnd() * 4);
      for (let j = 0; j < n; j++) linhas.push([`L${j}`, Math.floor(rnd() * 13) - 3, STS[Math.floor(rnd() * STS.length)]]);
      if (rnd() < 0.7) linhas.push([null, Math.floor(rnd() * 15) - 10]);
      await linhasDiretas(m, linhas); // eslint-disable-line no-await-in-loop
      const bloq = rnd() < 0.3 ? Math.floor(rnd() * 3) : 0;
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = ? WHERE id = ?', [bloq, m.id]); // eslint-disable-line no-await-in-loop
      const imp = linhas.filter(([c, , st]) => c && st !== 'ATIVO');
      const somaImp = imp.reduce((a, [, q]) => a + Math.max(0, q), 0);
      const semLote = linhas.filter(([c]) => !c).reduce((a, [, q]) => a + q, 0);
      const antiga = Math.max(0, somaImp - bloq);
      const modelo = Math.max(0, antiga - Math.max(0, -semLote));
      if (modelo < antiga) mordeu++;
      const s = await saldo(m); // eslint-disable-line no-await-in-loop
      const ctx = JSON.stringify({ linhas, bloq, s: conta(s) });
      assert.strictEqual(s.lote_impedido, modelo, ctx);
      assert.ok(s.lote_impedido >= 0 && s.lote_impedido <= somaImp + 1e-9, ctx);
      assert.ok(s.disponivel_liberado <= s.disponivel + 1e-9, ctx);
    }
    assert.ok(mordeu >= 10, `premissa: o sem lote negativo mordeu em ${mordeu} sorteios`);
  });

  // ── Fase 5 (P2, B1380): o plano de consulta usa indice em todas as tabelas — sem SCAN (antes: SCAN lim_s, lim_ri e lim_ri2, a
  // tabela inteira por item; 200 leituras com 30 mil linhas de saldo e 20 mil itens de recebimento levavam ~1,8 s) ──
  await test('[Fase 5 P2] EXPLAIN QUERY PLAN do fragmento: nenhum SCAN; os itens de recebimento pelo idx_receb_itens_almox_lote', async () => {
    const plano = (await dbAll(db, `EXPLAIN QUERY PLAN SELECT ${mod.loteImpedidoSql('ma')} FROM materiais_almoxarifado ma WHERE ma.id = ?`, [1]))
      .map((r) => r.detail);
    assert.ok(plano.length > 3, `premissa: o plano veio (${plano.length} linhas)`);
    assert.deepStrictEqual(plano.filter((d) => /^SCAN\b/.test(d)), [], plano.join(' | '));
    assert.ok(plano.some((d) => /lim_ri USING (COVERING )?INDEX idx_receb_itens_almox_lote/.test(d)), plano.join(' | '));
    assert.ok(plano.some((d) => /lim_s USING (COVERING )?INDEX idx_saldo_almox_chave/.test(d)), plano.join(' | '));
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
