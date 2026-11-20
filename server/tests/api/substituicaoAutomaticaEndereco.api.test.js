/**
 * Etapa 252 (item 22, C495) — a troca da origem da separacao pelo automatico grava o endereco quando a saida foi de um so.
 *
 * RN-252.01: as linhas que as baixas do item debitaram sao de UM endereco (nao nulo) -> `localizacao_saida_id` = ele; senao, nulo (hoje).
 * RN-252.02: o livro nao muda (a SAIDA sem endereco continua sem); o motor so devolve os enderecos com `opcoes.comEnderecosDaSaida`.
 * Plano: docs/superpowers/plans/2026-11-19-almoxarifado-etapa252-endereco-da-troca-frase-do-irmao-e-serie.md
 *
 * Executar: cd server && node tests/api/substituicaoAutomaticaEndereco.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}

const ADMIN = { id: 1, nome: 'Adm 252', role: 'admin', is_superadmin: 1, email: 'a252@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 252 (C495): o endereco na troca para o automatico ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES ('aprovacao_automatica','0')
    ON CONFLICT(chave) DO UPDATE SET valor='0'`);
  const alm = await request(app).post(`${API}/almoxarifados`).send({ codigo: 'ALM252E', nome: 'Almox 252 E' });
  assert.ok(alm.status === 201 || alm.status === 200, JSON.stringify(alm.body));
  const loc = async (codigo) => {
    const r = await request(app).post(`${API}/localizacoes`).send({ codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('TE-A'); const B = await loc('TE-B'); const P = await loc('TE-P');
  const material = async ({ lote = false } = {}) => {
    const c = `E252E-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, 0, 0, ?)`, [c, c, lote ? 1 : 0, P.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, destino, q, lote) => {
    const r = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e252',
      localizacao_destino_id: destino, ...(lote ? { lote } : {}) });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m.id, codigo])).id;
  const reqDireta = async (itens) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E252E-${++seq}`])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      // eslint-disable-next-line no-await-in-loop
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m, q])).lastID);
    }
    return { R, ids };
  };
  const separar = async (R, linhas) => {
    const r = await request(app).put(`${API}/requisicoes/${R}/separacao`).send({ itens_separados: linhas });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  };
  const entregar = async (R, linhas) => {
    const r = await request(app).put(`${API}/requisicoes/${R}/entregar`).send({ itens_atendidos: linhas });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  };
  const subs = async (R) => (await request(app).get(`${API}/requisicoes/${R}`)).body.substituicoes
    .map((s) => ({ plan: s.planejada_codigo, saiu: s.saiu_codigo, lote: s.saiu_lote, auto: s.automatica, q: s.quantidade }));
  const livro = async (R, m) => (await dbAll(db, `SELECT l.codigo as loc, lt.codigo as lote, mv.quantidade q FROM movimentacoes_almoxarifado mv
      LEFT JOIN localizacoes_almoxarifado l ON l.id = mv.localizacao_origem_id LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id
      WHERE mv.requisicao_id = ? AND mv.material_id = ? AND mv.tipo = 'SAIDA' ORDER BY mv.id`, [R, m.id])).map((x) => [x.loc, x.lote, Number(x.q)]);
  const saldoEm = async (m, l) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND localizacao_id IS ?`, [m.id, l])).q);

  await test('[RN-252.01 a] sem lote: separado de A, automatico sai todo de B -> a troca diz B (automatica 1); o livro continua sem endereco', async () => {
    const m = await material();
    await entrar(m, A.id, 2); await entrar(m, B.id, 5);
    const { R, ids } = await reqDireta([[m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 2, origem_automatica: true }]);
    assert.deepStrictEqual([await saldoEm(m, A.id), await saldoEm(m, B.id)], [2, 3], 'premissa: saiu de B');
    assert.deepStrictEqual(await subs(R), [{ plan: 'TE-A', saiu: 'TE-B', lote: null, auto: 1, q: 2 }]);
    assert.deepStrictEqual(await livro(R, m), [[null, null, 2]], 'RN-252.02: o livro nao ganha endereco');
  });

  await test('[RN-252.01 b] com lote: LA em A separado, o automatico (FEFO, guarda solta) sai de LA em A -> a troca diz A e lote LA', async () => {
    const m = await material({ lote: true });
    await entrar(m, A.id, 2, 'LA'); await entrar(m, B.id, 5, 'LB');
    const { R, ids } = await reqDireta([[m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: A.id, lote_id: await loteId(m, 'LA') }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 2, origem_automatica: true }]);
    assert.deepStrictEqual([await saldoEm(m, A.id), await saldoEm(m, B.id)], [0, 5], 'premissa: saiu de A');
    assert.deepStrictEqual(await subs(R), [{ plan: 'TE-A', saiu: 'TE-A', lote: 'LA', auto: 1, q: 2 }]);
  });

  await test('[RN-252.01 c] dois enderecos: P 1 + A 1 (separado de A, a guarda solta) -> a troca continua sem endereco', async () => {
    const m = await material();
    await entrar(m, A.id, 2); await entrar(m, B.id, 1); await entrar(m, P.id, 1);
    const { R, ids } = await reqDireta([[m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 2, origem_automatica: true }]);
    assert.deepStrictEqual([await saldoEm(m, P.id), await saldoEm(m, A.id), await saldoEm(m, B.id)], [0, 1, 1], 'premissa: P 1 + A 1');
    assert.deepStrictEqual(await subs(R), [{ plan: 'TE-A', saiu: null, lote: null, auto: 1, q: 2 }]);
  });

  await test('[RN-252.01 d] o um clique acima da parte nao e troca; a troca escolhida a mao (Sai de B) continua com B e automatica 0', async () => {
    const m = await material();
    await entrar(m, A.id, 2); await entrar(m, B.id, 5);
    const { R, ids } = await reqDireta([[m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 2, localizacao_origem_id: B.id }]);
    assert.deepStrictEqual(await subs(R), [{ plan: 'TE-A', saiu: 'TE-B', lote: null, auto: 0, q: 2 }]);
  });

  await test('[RN-252.02] o motor so devolve os enderecos com a opcao: sem ela o retorno nao muda; com ela, os da linha debitada', async () => {
    const m = await material();
    await entrar(m, B.id, 5);
    const sem = await stockService.registrarMovimentacao(db, ADMIN, { material_id: m.id, tipo: 'SAIDA', quantidade: 1, motivo: 'e252',
      justificativa: 'e252' });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(sem, 'enderecos_saida'), false, JSON.stringify(sem));
    const com = await stockService.registrarMovimentacao(db, ADMIN, { material_id: m.id, tipo: 'SAIDA', quantidade: 1, motivo: 'e252',
      justificativa: 'e252' }, { comEnderecosDaSaida: true });
    assert.deepStrictEqual(com.enderecos_saida, [B.id]);
  });

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam\n`);
  terminou = true;
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
