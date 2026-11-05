/**
 * Etapa 198 (T2/T3) — a separacao com "Sai de" conta o que ja esta separado do mesmo par (endereco, lote) para OUTRAS requisicoes.
 * Antes so descontava a parte guardada da propria requisicao: R2 separava 4 de XB-01/L1 (6) depois de R1 ter separado 4 de la, e a
 * recusa so vinha na entrega de R2 ("nao serve mais", C449). Agora a separacao recusa com a conta a vista (C1, RN-198.01).
 *
 * Todo cenario da C1 tem estoque em OUTRO endereco (XP-01, L2 9 — emenda 3 da Fase 2): sem ele o teto do item ("nao e possivel
 * separar ... Maximo") bate antes e a sabotagem que tira a regua nova passaria verde.
 *
 * Usuarios reais por header (molde da preSelecaoColetaIntegracao): S sem perfil cria; ADMIN superadmin aprova, da entrada e exclui;
 * ALMOX separa e entrega. Validades relativas a hoje (`dia(n)`).
 * Plano: docs/superpowers/plans/2026-11-05-almoxarifado-etapa198-separado-de-outras-requisicoes.md
 *
 * Executar: cd server && node tests/api/separacaoSeparadoDeOutras.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const diaLocal = require('../../services/diaLocal');

const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 198', role: 'admin', is_superadmin: 1, email: 'a198@t.com' },
  S: { id: 19821, nome: 'Solic 198', role: 'user', email: 's198@t.com' },
  ALMOX: { id: 19822, nome: 'Almox 198', role: 'user', email: 'x198@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 198: separado de outras requisicoes no mesmo par ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    get: (u) => request(app).get(u).set('x-teste-usuario', k).then((x) => x),
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
    del: (u, b = {}) => request(app).delete(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM198', nome: 'Almox 198' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const B01 = await loc('XB-01'); const P01 = await loc('XP-01');

  const material = async () => {
    const c = `E198-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, localizacao_padrao_id) VALUES (?, ?, 'PC', 0, 0, 1, 0, 0.1, 1, ?)`,
    [c, c, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, destino, q, lote) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e198',
      localizacao_destino_id: destino, lote });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const validade = (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE material_id = ? AND codigo = ?',
    [data, m.id, codigo]);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const req = async (itens) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-198',
      itens: itens.map(([mid, q]) => ({ material_id: mid, quantidade: q })),
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    const ap = await como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/aprovar`, {});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    return { R: cr.body.id, ids };
  };
  const separar = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/separar`, { itens_separados: linhas });
  const separacao = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: linhas });
  const entregar = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: linhas });
  const numero = async (R) => (await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id = ?', [R])).numero;
  const statusDe = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
  const rodadas = async (R) => Number((await dbGet(db, 'SELECT COUNT(*) as n FROM separacoes_requisicao_almoxarifado WHERE requisicao_id = ?',
    [R])).n);
  const itemDe = (id) => dbGet(db, `SELECT quantidade_separada, origem_separacao_id, lote_separacao_id, quantidade_origem_separacao
    FROM itens_requisicao_almoxarifado WHERE id = ?`, [id]);
  const saldoDe = async (m, locId, lid) => {
    const s = await dbGet(db, 'SELECT COALESCE(SUM(quantidade), 0) as q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ? AND lote_id IS ?',
      [m.id, locId, lid]);
    return Number(s.q);
  };
  const semLoteNaoZero = async (m) => (await dbAll(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id IS NULL',
    [m.id])).filter((x) => Math.abs(Number(x.quantidade)) > 1e-9);
  const trocas = (R) => dbAll(db, 'SELECT id FROM substituicoes_origem_requisicao WHERE requisicao_id = ?', [R]);

  // A literal C1 (contrato da Fase 2, emenda 1): sem o prefixo vem do checarOrigemItem; a separacao poe o nome do material.
  const c1 = (m, { saldo, contando = 0, outras, numeros, sobra, qty }) => `${m.nome}: em XB-01, lote L1 há ${saldo}`
    + `${contando ? ` (já contando ${contando} desta requisição)` : ''} para esta separação, mas ${outras} `
    + `${numeros.length > 1 ? 'já estão separados dali para outras requisições' : 'já está separado dali para outra requisição'} `
    + `(${numeros.join(', ')}); sobra ${sobra}, que não cobre a quantidade (${qty}). Escolha outro endereço ou reabra a janela para ver a sugestão atual`;

  // L1 6 em XB-01 (vence antes), L2 9 na padrao XP-01 (o outro endereco).
  const cenario = async ({ l1 = 6 } = {}) => {
    const m = await material();
    await entrar(m, B01.id, l1, 'L1'); await entrar(m, P01.id, 9, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    return { m, L1: await loteId(m, 'L1'), L2: await loteId(m, 'L2') };
  };
  const doPar = (item, q, L1) => ({ item_id: item, quantidade_separada: q, localizacao_origem_id: B01.id, lote_id: L1 });
  const sepOk = async (R, linhas) => { const r = await separar(R, linhas); assert.strictEqual(r.status, 200, JSON.stringify(r.body)); };
  const recusaSemGravar = async (r2, linhas, esperado) => {
    const st = await statusDe(r2.R); const n = await rodadas(r2.R);
    const antes = await Promise.all(r2.ids.map(itemDe));
    const b = await separar(r2.R, linhas);
    assert.strictEqual(b.status, 400, JSON.stringify(b.body));
    assert.strictEqual(b.body.error, esperado);
    assert.strictEqual(await statusDe(r2.R), st, 'status igual');
    assert.strictEqual(await rodadas(r2.R), n, 'nenhuma rodada nova');
    assert.deepStrictEqual(await Promise.all(r2.ids.map(itemDe)), antes, 'itens iguais');
  };

  // ---------------------------------------------------------------- RN-198.01
  await test('[RN-198.01 rota] R1 separou 4 de XB-01/L1 (6); R2 pede 4 de la -> 400 C1, nada gravado', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    await recusaSemGravar(r2, [doPar(r2.ids[0], 4, L1)],
      c1(m, { saldo: 6, outras: 4, numeros: [await numero(r1.R)], sobra: 2, qty: 4 }));
    assert.strictEqual(await saldoDe(m, B01.id, L1), 6);
  });

  await test('[RN-198.01 precedencia] o fisico sozinho nao cobre (pede 7 de 6) -> a literal de antes, nao a C1', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 8]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    await recusaSemGravar(r2, [doPar(r2.ids[0], 7, L1)],
      `${m.nome}: O saldo em XB-01 (6) não cobre a quantidade (7) — a saída tiraria de outros endereços`);
  });

  await test('[RN-198.01 plural] R1 e R3 separaram 2 cada de XB-01/L1; R2 pede 4 -> C1 no plural, os numeros na ordem do id', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 2]]); const r2 = await req([[m.id, 4]]); const r3 = await req([[m.id, 2]]);
    await sepOk(r3.R, [doPar(r3.ids[0], 2, L1)]);
    await sepOk(r1.R, [doPar(r1.ids[0], 2, L1)]);
    await recusaSemGravar(r2, [doPar(r2.ids[0], 4, L1)],
      c1(m, { saldo: 6, outras: 4, numeros: [await numero(r1.R), await numero(r3.R)], sobra: 2, qty: 4 }));
  });

  // ---------------------------------------------------------------- RN-198.02
  await test('[RN-198.02] o que sobra cabe: 2,000001 recusa (fronteira); 2 -> 200 e grava XB-01/L1 com parte 2', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    await recusaSemGravar(r2, [doPar(r2.ids[0], 2.000001, L1)],
      c1(m, { saldo: 6, outras: 4, numeros: [await numero(r1.R)], sobra: 2, qty: 2.000001 }));
    await sepOk(r2.R, [doPar(r2.ids[0], 2, L1)]);
    const it = await itemDe(r2.ids[0]);
    assert.deepStrictEqual([Number(it.quantidade_separada), it.origem_separacao_id, it.lote_separacao_id, Number(it.quantidade_origem_separacao)],
      [2, B01.id, L1, 2]);
  });

  // ---------------------------------------------------------------- RN-198.03
  await test('[RN-198.03 entregue] R1 separou 4 e entregou (parte 0): R2 pede os 4 que sobram em XB-01/L1 (8) -> 200', async () => {
    const { m, L1 } = await cenario({ l1: 8 });
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    const e1 = await entregar(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 4 }]);
    assert.strictEqual(e1.status, 200, JSON.stringify(e1.body));
    assert.strictEqual(await saldoDe(m, B01.id, L1), 4);
    await sepOk(r2.R, [doPar(r2.ids[0], 4, L1)]);
  });

  await test('[RN-198.03 cancelada, controle] a rota de cancelar recusa requisicao com caixa (M1) -> 400, a caixa fica', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    const c = await como('ADMIN').put(`${API}/requisicoes/${r1.R}/cancelar`, { motivo: 'c198' });
    assert.strictEqual(c.status, 400, JSON.stringify(c.body));
    assert.strictEqual(await statusDe(r1.R), 'EM_SEPARACAO');
  });

  await test('[RN-198.03 cancelada legada, por SQL] CANCELADO com ativo=1 e a origem gravada nao compromete: R2 pede 4 -> 200', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'CANCELADO', ativo = 1 WHERE id = ?", [r1.R]);
    const it1 = await itemDe(r1.ids[0]);
    assert.deepStrictEqual([it1.origem_separacao_id, Number(it1.quantidade_origem_separacao)], [B01.id, 4], 'premissa: a caixa legada');
    await sepOk(r2.R, [doPar(r2.ids[0], 4, L1)]);
  });

  await test('[RN-198.03 excluida, C467] R1 separou 4 e foi excluida (a origem fica gravada): R2 pede 4 -> 200', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    const d = await como('ADMIN').del(`${API}/requisicoes/${r1.R}`, { justificativa: 'exclusao 198' });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    const it1 = await itemDe(r1.ids[0]);
    assert.strictEqual(it1.origem_separacao_id, B01.id, 'premissa C467: a exclusao nao limpa a origem');
    assert.ok(Number(it1.quantidade_separada) > 0, 'premissa C467: a caixa fica no item');
    await sepOk(r2.R, [doPar(r2.ids[0], 4, L1)]);
  });

  await test('[RN-198.03 parte limitada] R1 separou 3 de XB-01/L1 e 3 no automatico (caixa 6, parte 3): R2 pede 3 -> 200; 3,5 -> C1 com 3', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 6]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 3, L1)]);
    await sepOk(r1.R, [{ item_id: r1.ids[0], quantidade_separada: 3 }]);
    const it1 = await itemDe(r1.ids[0]);
    assert.deepStrictEqual([Number(it1.quantidade_separada), Number(it1.quantidade_origem_separacao)], [6, 3], 'premissa: caixa 6, parte 3');
    await recusaSemGravar(r2, [doPar(r2.ids[0], 3.5, L1)],
      c1(m, { saldo: 6, outras: 3, numeros: [await numero(r1.R)], sobra: 3, qty: 3.5 }));
    await sepOk(r2.R, [doPar(r2.ids[0], 3, L1)]);
  });

  await test('[RN-198.03 NULL legado, por SQL] quantidade_origem_separacao NULL -> a caixa inteira (6) compromete: R2 pede 1 -> C1, sobra 0', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 6]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 3, L1)]);
    await sepOk(r1.R, [{ item_id: r1.ids[0], quantidade_separada: 3 }]);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_origem_separacao = NULL WHERE id = ?', [r1.ids[0]]);
    await recusaSemGravar(r2, [doPar(r2.ids[0], 1, L1)],
      c1(m, { saldo: 6, outras: 6, numeros: [await numero(r1.R)], sobra: 0, qty: 1 }));
  });

  await test('[RN-198.03 AGUARDANDO_APROVACAO_VALOR, por SQL] a caixa nesse status compromete -> C1', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'AGUARDANDO_APROVACAO_VALOR' WHERE id = ?", [r1.R]);
    await recusaSemGravar(r2, [doPar(r2.ids[0], 4, L1)],
      c1(m, { saldo: 6, outras: 4, numeros: [await numero(r1.R)], sobra: 2, qty: 4 }));
  });

  await test('[RN-198.03 entregue em parte] R1 separou 4 e entregou 1 (parte 3, XB-01/L1 5): R2 pede 3 -> C1 (sobra 2); 2 -> 200', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    const e1 = await entregar(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 1 }]);
    assert.strictEqual(e1.status, 200, JSON.stringify(e1.body));
    assert.strictEqual(await saldoDe(m, B01.id, L1), 5);
    await recusaSemGravar(r2, [doPar(r2.ids[0], 3, L1)],
      c1(m, { saldo: 5, outras: 3, numeros: [await numero(r1.R)], sobra: 2, qty: 3 }));
    await sepOk(r2.R, [doPar(r2.ids[0], 2, L1)]);
  });

  // ---------------------------------------------------------------- RN-198.05
  await test('[RN-198.05] automatica e so lote nao mudam: com R1 4 em XB-01/L1, R2 so lote L1 6 -> 200, R3 automatico 4 -> 200', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 6]]); const r3 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    await sepOk(r2.R, [{ item_id: r2.ids[0], quantidade_separada: 6, lote_id: L1 }]);
    const it2 = await itemDe(r2.ids[0]);
    assert.strictEqual(it2.origem_separacao_id, null, 'so lote nao vira origem');
    await sepOk(r3.R, [{ item_id: r3.ids[0], quantidade_separada: 4 }]);
  });

  // ---------------------------------------------------------------- RN-198.06
  await test('[RN-198.06] a entrega nao muda: dado antigo 4 + 4 em XB-01/L1 (6) -> R1 entrega 200; R2 400 com a literal de antes, nada baixado', async () => {
    const { m, L1, L2 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    await sepOk(r2.R, [{ item_id: r2.ids[0], quantidade_separada: 4 }]);
    await dbRun(db, `UPDATE itens_requisicao_almoxarifado SET origem_separacao_id = ?, lote_separacao_id = ?, quantidade_origem_separacao = 4
      WHERE id = ?`, [B01.id, L1, r2.ids[0]]);
    const e1 = await entregar(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 4 }]);
    assert.strictEqual(e1.status, 200, JSON.stringify(e1.body));
    const e2 = await entregar(r2.R, [{ item_id: r2.ids[0], quantidade_atendida: 4 }]);
    assert.strictEqual(e2.status, 400, JSON.stringify(e2.body));
    assert.strictEqual(e2.body.error, `${m.nome}: a origem da separação (XB-01) não serve mais (O saldo em XB-01 (2) não cobre a `
      + 'quantidade (4) — a saída tiraria de outros endereços) — entregue escolhendo de onde sai');
    assert.strictEqual(await saldoDe(m, B01.id, L1), 2);
    assert.strictEqual(await saldoDe(m, P01.id, L2), 9);
    assert.deepStrictEqual(await trocas(r2.R), []);
    assert.deepStrictEqual(await semLoteNaoZero(m), []);
  });

  // ---------------------------------------------------------------- RN-198.08
  await test('[RN-198.08] a propria requisicao nao e "outra": 2a rodada no mesmo par (3 + 3 de 6) e dois itens do mesmo material (4 + 2) -> 200', async () => {
    const a = await cenario();
    const r1 = await req([[a.m.id, 8]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 3, a.L1)]);
    await sepOk(r1.R, [doPar(r1.ids[0], 3, a.L1)]);
    assert.strictEqual(Number((await itemDe(r1.ids[0])).quantidade_origem_separacao), 6);
    const b = await cenario();
    const r2 = await req([[b.m.id, 4], [b.m.id, 2]]);
    await sepOk(r2.R, [doPar(r2.ids[0], 4, b.L1), doPar(r2.ids[1], 2, b.L1)]);
  });

  await test('[RN-198.08 + C1 com o ja pedido] R1 separou 2; R2 com dois itens pede 2 + 3 do par -> C1 "ja contando 2 desta requisicao"', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 2]]); const r2 = await req([[m.id, 2], [m.id, 3]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 2, L1)]);
    await recusaSemGravar(r2, [doPar(r2.ids[0], 2, L1), doPar(r2.ids[1], 3, L1)],
      c1(m, { saldo: 4, contando: 2, outras: 2, numeros: [await numero(r1.R)], sobra: 2, qty: 3 }));
  });

  // ---------------------------------------------------------------- pelo servico
  const ALMOX = { ...USERS.ALMOX };
  await test('[RN-198.01 servico] separarRequisicao direto -> lanca 400 com a mesma C1', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await requisitionService.separarRequisicao(db, r1.R, [doPar(r1.ids[0], 4, L1)], ALMOX);
    let erro = null;
    try { await requisitionService.separarRequisicao(db, r2.R, [doPar(r2.ids[0], 4, L1)], ALMOX); } catch (e) { erro = e; }
    assert.ok(erro, 'a separacao de R2 tinha de lancar');
    assert.strictEqual(erro.status, 400);
    assert.strictEqual(erro.message, c1(m, { saldo: 6, outras: 4, numeros: [await numero(r1.R)], sobra: 2, qty: 4 }));
    assert.strictEqual(await rodadas(r2.R), 0);
  });

  await test('[RN-198.07 servico, corrida] R1 e R2 pedem 4 de XB-01/L1 (6) ao mesmo tempo (Promise.all, 10x): uma 200, uma 400 C1, partes <= 6', async () => {
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop
      const { m, L1 } = await cenario();
      // eslint-disable-next-line no-await-in-loop
      const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
      // eslint-disable-next-line no-await-in-loop
      const res = await Promise.allSettled([
        requisitionService.separarRequisicao(db, r1.R, [doPar(r1.ids[0], 4, L1)], ALMOX),
        requisitionService.separarRequisicao(db, r2.R, [doPar(r2.ids[0], 4, L1)], ALMOX),
      ]);
      const ok = res.filter((x) => x.status === 'fulfilled');
      const nok = res.filter((x) => x.status === 'rejected');
      assert.strictEqual(ok.length, 1, `volta ${i}: exatamente uma 200 (${res.map((x) => x.status).join(',')})`);
      const venceu = res[0].status === 'fulfilled' ? r1 : r2;
      assert.strictEqual(nok[0].reason.status, 400, `volta ${i}: ${nok[0].reason.message}`);
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual(nok[0].reason.message, c1(m, { saldo: 6, outras: 4, numeros: [await numero(venceu.R)], sobra: 2, qty: 4 }));
      // eslint-disable-next-line no-await-in-loop
      const soma = await dbGet(db, `SELECT COALESCE(SUM(quantidade_origem_separacao), 0) as q FROM itens_requisicao_almoxarifado
        WHERE material_id = ? AND origem_separacao_id = ? AND lote_separacao_id = ?`, [m.id, B01.id, L1]);
      assert.ok(Number(soma.q) <= 6 + 1e-9, `volta ${i}: partes no par ${soma.q} > 6`);
    }
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
