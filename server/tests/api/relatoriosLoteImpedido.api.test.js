/**
 * Etapa 225 (T1) — os relatorios de saldo dizem quanto esta em lote impedido (D (223); RN-225.01 a .09).
 *
 * `relatorios/estoque-atual` e `relatorios/saldos-comprometidos` devolvem `lote_impedido` em toda linha (B1488) — o numero do extrato,
 * `loteImpedido.loteImpedidoSql('m')` — e o registro declara a coluna *Em lote impedido* logo depois do *Disponivel* (a tela e a planilha
 * seguem o registro). O comprometido passa a listar o material so com lote impedido (B1489). O *Disponivel* nao muda.
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa225-relatorios-lote-impedido.md
 *
 * Executar: cd server && node tests/api/relatoriosLoteImpedido.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { loteImpedidoSql } = require('../../services/almoxarifado/loteImpedido');
const { RELATORIOS } = require('../../services/almoxarifado/reportRegistry');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 225', role: 'admin', is_superadmin: 1, email: 'a225@t.com' };
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
const tem = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const NOTA_ATUAL = 'Disponível = físico menos o reservado, o bloqueado, o em inspeção e o em terceiros. Em lote impedido = o que está em '
  + 'lote bloqueado, reprovado ou vencido, fora o que já é contado como bloqueado, em terceiros ou em inspeção: não é descontado do '
  + 'Disponível, mas não sai para uso até o lote ser liberado na tela Lotes e Séries.';
const NOTA_COMPROMETIDOS = 'Materiais ativos com saldo reservado, bloqueado, em inspeção, em terceiros ou em lote impedido. Disponível = '
  + 'físico menos essas quatro retenções. Em lote impedido = o que está em lote bloqueado, reprovado ou vencido, fora o que já aparece em '
  + 'Bloqueado, Em terceiros ou Em inspeção: não é descontado do Disponível, mas não sai para uso até o lote ser liberado na tela Lotes e '
  + 'Séries. Material inativado não aparece aqui (como em "Materiais bloqueados").';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

function binaryParser(res, cb) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (c) => { data += c; });
  res.on('end', () => cb(null, Buffer.from(data, 'binary')));
}

(async () => {
  console.log('\n=== Etapa 225: os relatorios de saldo dizem quanto esta em lote impedido ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const get = (u, q) => request(app).get(u).query(q || {});
  const post = (u, b = {}) => request(app).post(u).send(b);
  const put = (u, b = {}) => request(app).put(u).send(b);
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [ADMIN.id, ADMIN.nome, ADMIN.email]);
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY, razao_social TEXT, nome_fantasia TEXT)');

  const alm = await post(`${API}/almoxarifados`, { codigo: 'ALM225', nome: 'Almox 225' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  await post(`${API}/localizacoes`, { codigo: 'Z225-01', descricao: 'Z225-01', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z225-01'");

  const material = async ({ lote = 1, cliente = null } = {}) => {
    const c = `E225-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id, proprietario_cliente_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, 0, ?, ?)`, [c, c, lote, P01.id, cliente])).lastID;
  };
  const codigo = async (m) => (await dbGet(db, 'SELECT codigo FROM materiais_almoxarifado WHERE id = ?', [m])).codigo;
  const entrar = (m, q, lote) => ok(post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e225', localizacao_destino_id: P01.id, lote }), 201);
  const loteId = async (m, cod) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m, cod])).id;
  const status = async (m, cod, st) => ok(put(`${API}/lotes/${await loteId(m, cod)}/status`, { status: st, justificativa: 'teste 225' }));
  const validade = async (m, cod, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?',
    [data, await loteId(m, cod)]);
  const rel = async (tipo) => {
    const r = await ok(get(`${API}/relatorios/${tipo}`));
    assert.ok(Array.isArray(r.body), `${tipo} nao e um array`);
    return r.body;
  };
  const atual = async (m) => {
    const l = (await rel('estoque-atual')).find((x) => Number(x.id) === Number(m));
    assert.ok(l, `material ${m} fora do Estoque atual`);
    assert.ok(tem(l, 'lote_impedido'), 'Estoque atual sem lote_impedido');
    return l;
  };
  const comprometido = async (m) => {
    const cod = await codigo(m);
    const l = (await rel('saldos-comprometidos')).find((x) => x.material_codigo === cod);
    if (l) assert.ok(tem(l, 'lote_impedido'), 'Saldos comprometidos sem lote_impedido');
    return l || null;
  };
  const regua = async (m) => (await dbGet(db, `SELECT ${loteImpedidoSql('m')} AS v FROM materiais_almoxarifado m WHERE m.id = ?`, [m])).v;
  const l1l2 = async (opts) => {
    const m = await material(opts);
    await entrar(m, 4, 'L1'); await entrar(m, 6, 'L2');
    return m;
  };

  // ── RN-225.01 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  let M01;
  await test('[RN-225.01] Estoque atual: L1 ATIVO 4 + L2 BLOQUEADO 6 -> lote_impedido 6, Disponivel 10; sem bloqueio 0; sem controle 0', async () => {
    M01 = await l1l2(); await status(M01, 'L2', 'BLOQUEADO');
    const l = await atual(M01);
    assert.strictEqual(l.lote_impedido, 6);
    assert.strictEqual(Number(l.disponivel), 10);
    assert.ok(Math.abs(Number(l.valor_total) - 1) < 1e-9, `valor_total mudou: ${l.valor_total}`);
    const livre = await l1l2();
    assert.strictEqual((await atual(livre)).lote_impedido, 0);
    const semCtrl = await material({ lote: 0 }); await entrar(semCtrl, 3);
    assert.strictEqual((await atual(semCtrl)).lote_impedido, 0);
  });

  // ── RN-225.02 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-225.02 a] L2 REPROVADO -> 6 nos dois relatorios', async () => {
    const m = await l1l2(); await status(m, 'L2', 'REPROVADO');
    assert.strictEqual((await atual(m)).lote_impedido, 6);
    assert.strictEqual((await comprometido(m)).lote_impedido, 6);
  });
  await test('[RN-225.02 b/c] vencido ontem -> 6; liberar o vencimento -> 0 e sai do comprometido', async () => {
    const m = await l1l2(); await validade(m, 'L2', dia(-1));
    assert.strictEqual((await atual(m)).lote_impedido, 6);
    assert.strictEqual((await comprometido(m)).lote_impedido, 6);
    await ok(put(`${API}/lotes/${await loteId(m, 'L2')}/liberar-vencimento`, { justificativa: 'teste 225' }));
    assert.strictEqual((await atual(m)).lote_impedido, 0);
    assert.strictEqual(await comprometido(m), null, 'liberado o vencimento, continuou no comprometido');
  });
  await test('[RN-225.02 d] vence hoje -> 0 e fora do comprometido', async () => {
    const m = await l1l2(); await validade(m, 'L2', dia(0));
    assert.strictEqual((await atual(m)).lote_impedido, 0);
    assert.strictEqual(await comprometido(m), null);
  });

  // ── RN-225.03 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-225.03] comprometido: o material so com lote impedido aparece; so ATIVO nao; retencao sem lote aparece com 0', async () => {
    const l = await comprometido(M01);
    assert.ok(l, 'o material so com lote impedido ficou fora do comprometido');
    assert.deepStrictEqual(
      [l.fisico, l.quantidade_reservada, l.quantidade_bloqueada, l.quantidade_em_inspecao, l.quantidade_em_terceiros, l.disponivel, l.lote_impedido],
      [10, 0, 0, 0, 0, 10, 6]);
    const soAtivo = await material(); await entrar(soAtivo, 4, 'L1');
    assert.strictEqual(await comprometido(soAtivo), null, 'material so com lote ATIVO entrou no comprometido');
    const ret = await material({ lote: 0 }); await entrar(ret, 5);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = 1 WHERE id = ?', [ret]);
    const lr = await comprometido(ret);
    assert.ok(lr, 'material com retencao sumiu do comprometido');
    assert.strictEqual(lr.lote_impedido, 0);
    assert.strictEqual(lr.quantidade_reservada, 1);
  });

  // ── RN-225.04 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-225.04] sem controle de lote: lote BLOQUEADO 6 -> 0 no Estoque atual e fora do comprometido', async () => {
    const m = await material(); await entrar(m, 6, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    assert.strictEqual((await atual(m)).lote_impedido, 6, 'premissa: com o controle, 6');
    assert.ok(await comprometido(m), 'premissa: com o controle, no comprometido');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 0 WHERE id = ?', [m]);
    assert.strictEqual((await atual(m)).lote_impedido, 0);
    assert.strictEqual(await comprometido(m), null, 'sem controle de lote, entrou no comprometido pelo lote');
  });

  // ── RN-225.06 (antes da .05, que varre tudo) ──────────────────────────────────────────────────────────────────────────
  await test('[RN-225.06] o que ja esta em Bloqueado sai do impedido: bloqueada 2 -> Bloqueado 2, Em lote impedido 4 (C531)', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 2 WHERE id = ?', [m]);
    const l = await comprometido(m);
    assert.strictEqual(l.quantidade_bloqueada, 2);
    assert.strictEqual(l.lote_impedido, 4);
    assert.strictEqual((await atual(m)).lote_impedido, 4);
  });
  await test('[RN-225.06 b] em terceiros sem lote conhecido tambem sai: terceiros 2 -> Em terceiros 2, Em lote impedido 4 (Fase 2 I1)', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_terceiros = 2 WHERE id = ?', [m]);
    const l = await comprometido(m);
    assert.deepStrictEqual([l.quantidade_bloqueada, l.quantidade_em_terceiros, l.lote_impedido], [0, 2, 4]);
  });
  await test('[RN-225.06 c] o impedido nao desconta o reservado: reservado 8 -> Disponivel 2, Em lote impedido 6 (Fase 2 M1)', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = 8 WHERE id = ?', [m]);
    const l = await comprometido(m);
    assert.deepStrictEqual([l.quantidade_reservada, l.disponivel, l.lote_impedido], [8, 2, 6]);
  });

  // ── RN-225.07 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-225.07] material de cliente com L2 BLOQUEADO 6: no comprometido com o cliente; fora do Estoque atual', async () => {
    await dbRun(db, "INSERT OR REPLACE INTO clientes (id, razao_social, nome_fantasia) VALUES (225, 'Cliente 225 Ltda', 'Cliente 225')");
    const m = await l1l2({ cliente: 225 }); await status(m, 'L2', 'BLOQUEADO');
    const l = await comprometido(m);
    assert.ok(l, 'material de cliente so com lote impedido ficou fora do comprometido');
    assert.strictEqual(l.cliente, 'Cliente 225');
    assert.strictEqual(l.lote_impedido, 6);
    assert.ok(!(await rel('estoque-atual')).some((x) => Number(x.id) === Number(m)), 'material de cliente no Estoque atual');
  });

  // ── RN-225.05 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-225.05] toda linha dos dois relatorios e a regua, e bate com o extrato', async () => {
    const linhasA = await rel('estoque-atual');
    assert.ok(linhasA.length >= 8, `poucas linhas: ${linhasA.length}`);
    let impedidas = 0;
    for (const l of linhasA) {
      assert.ok(tem(l, 'lote_impedido'), `linha ${l.codigo} sem lote_impedido`);
      assert.strictEqual(l.lote_impedido, await regua(l.id), `Estoque atual ${l.codigo}`);
      if (l.lote_impedido > 0) impedidas++;
    }
    assert.ok(impedidas >= 3, `controle: poucas linhas impedidas (${impedidas}) — o teste nao prova nada`);
    const linhasC = await rel('saldos-comprometidos');
    for (const l of linhasC) {
      const m = (await dbGet(db, 'SELECT id FROM materiais_almoxarifado WHERE codigo = ?', [l.material_codigo])).id;
      assert.strictEqual(l.lote_impedido, await regua(m), `comprometido ${l.material_codigo}`);
    }
    const ext = (await ok(get(`${API}/materiais/${M01}/extrato`))).body.material.lote_impedido;
    assert.strictEqual(ext, 6);
    assert.strictEqual((await atual(M01)).lote_impedido, ext);
  });

  // ── RN-225.08 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-225.08] o registro e a lista: Em lote impedido logo depois do Disponivel, notas literais', async () => {
    const lista = (await ok(get(`${API}/relatorios`))).body.relatorios;
    for (const [tipo, nota] of [['estoque-atual', NOTA_ATUAL], ['saldos-comprometidos', NOTA_COMPROMETIDOS]]) {
      const r = lista.find((x) => x.tipo === tipo);
      assert.ok(r, `${tipo} fora da lista`);
      const chaves = r.colunas.map((c) => c.chave);
      const i = chaves.indexOf('disponivel');
      assert.ok(i >= 0, `${tipo} sem disponivel`);
      assert.deepStrictEqual(r.colunas[i + 1], { chave: 'lote_impedido', rotulo: 'Em lote impedido' }, `${tipo}: ${JSON.stringify(chaves)}`);
      assert.strictEqual(r.nota, nota, `${tipo}: nota`);
      assert.deepStrictEqual(RELATORIOS[tipo].colunas, r.colunas);
    }
  });
  await test('[RN-225.08] a planilha dos dois: Em lote impedido logo depois de Disponivel, e a celula do material vale 6', async () => {
    const XLSX = require('xlsx');
    const cod = await codigo(M01);
    for (const [tipo, colCodigo] of [['estoque-atual', 'Código'], ['saldos-comprometidos', 'Código']]) {
      const r = await request(app).get(`${API}/relatorios/${tipo}/export`).buffer().parse(binaryParser);
      assert.strictEqual(r.status, 200, `${tipo}/export ${r.status}`);
      const wb = XLSX.read(r.body, { type: 'buffer' });
      const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      const cab = linhas[0];
      const i = cab.indexOf('Disponível');
      assert.ok(i >= 0, `${tipo}: sem Disponível em ${JSON.stringify(cab)}`);
      assert.strictEqual(cab[i + 1], 'Em lote impedido', `${tipo}: ${JSON.stringify(cab)}`);
      const linha = linhas.find((x) => x[cab.indexOf(colCodigo)] === cod);
      assert.ok(linha, `${tipo}: ${cod} fora da planilha`);
      assert.strictEqual(linha[i + 1], 6, `${tipo}: celula ${JSON.stringify(linha)}`);
      assert.strictEqual(linha[i], 10, `${tipo}: Disponivel ${JSON.stringify(linha)}`);
    }
  });

  // ── RN-225.09 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-225.09] integracao: liberar o lote zera a coluna e tira o material do comprometido', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO');
    assert.strictEqual((await atual(m)).lote_impedido, 6);
    assert.strictEqual((await comprometido(m)).lote_impedido, 6);
    await status(m, 'L2', 'ATIVO');
    assert.strictEqual((await atual(m)).lote_impedido, 0);
    assert.strictEqual(await comprometido(m), null, 'lote liberado e o material continuou no comprometido');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
