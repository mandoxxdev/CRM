/**
 * Etapa 200 (T2/T3) — a entrega com "Sai de" escolhido a mao, quando o par (endereco, lote) NAO e a origem guardada do item (outro par,
 * ou item separado no automatico), conta o que esta separado ali para OUTRAS requisicoes (caixa viva, a parte guardada — a regua da
 * 198). Antes aceitava: R2 tirava de XB-01/L1 as pecas separadas para R1, e quem tomava a recusa era R1 ("nao serve mais", C468).
 * Agora a entrega de R2 recusa na hora com a E1 (RN-200.01). A planejada (caso a) e o mesmo par escolhido (caso b, o que a tela manda)
 * nao mudam (RN-200.04).
 *
 * Todo cenario da E1 tem estoque em OUTRO endereco (XP-01, L2 9): sem ele o teto do item bate antes (licao da Fase 2 da 198).
 * Usuarios reais por header (molde da separacaoSeparadoDeOutras): S sem perfil cria; ADMIN aprova, da entrada e exclui; ALMOX separa e
 * entrega. Validades relativas a hoje (`dia(n)`).
 * Plano: docs/superpowers/plans/2026-11-05-almoxarifado-etapa200-entrega-a-mao-respeita-separado.md
 *
 * Executar: cd server && node tests/api/entregaSaiDeRespeitaSeparado.api.test.js
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
  ADMIN: { id: 1, nome: 'Adm 200', role: 'admin', is_superadmin: 1, email: 'a200@t.com' },
  S: { id: 20021, nome: 'Solic 200', role: 'user', email: 's200@t.com' },
  ALMOX: { id: 20022, nome: 'Almox 200', role: 'user', email: 'x200@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 200: entrega com "Sai de" a mao respeita o separado de outras ===\n');
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

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM200', nome: 'Almox 200' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const B01 = await loc('XB-01'); const P01 = await loc('XP-01');

  const material = async () => {
    const c = `E200-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, localizacao_padrao_id) VALUES (?, ?, 'PC', 0, 0, 1, 0, 0.1, 1, ?)`,
    [c, c, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, destino, q, lote) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e200',
      localizacao_destino_id: destino, lote });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const validade = (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE material_id = ? AND codigo = ?',
    [data, m.id, codigo]);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const req = async (itens) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-200',
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
  const itemDe = (id) => dbGet(db, `SELECT quantidade_separada, quantidade_entregue, quantidade_atendida, origem_separacao_id,
    lote_separacao_id, quantidade_origem_separacao FROM itens_requisicao_almoxarifado WHERE id = ?`, [id]);
  const saldoDe = async (m, locId, lid) => {
    const s = await dbGet(db, 'SELECT COALESCE(SUM(quantidade), 0) as q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ? AND lote_id IS ?',
      [m.id, locId, lid]);
    return Number(s.q);
  };
  const semLoteNaoZero = async (m) => (await dbAll(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id IS NULL',
    [m.id])).filter((x) => Math.abs(Number(x.quantidade)) > 1e-9);
  const trocas = (R) => dbAll(db, 'SELECT id FROM substituicoes_origem_requisicao WHERE requisicao_id = ?', [R]);
  const nMov = async (m) => Number((await dbGet(db, 'SELECT COUNT(*) as n FROM movimentacoes_almoxarifado WHERE material_id = ?', [m.id])).n);

  // A literal E1 (contrato congelado): o prefixo do material vem do laco da entrega.
  const e1 = (m, { saldo, contando = 0, outras, numeros, sobra, qty, cod = 'XB-01, lote L1' }) => `${m.nome}: em ${cod} há ${saldo}`
    + `${contando ? ` (já contando ${contando} desta entrega)` : ''} para esta entrega, mas ${outras} `
    + `${numeros.length > 1 ? 'já estão separados dali para outras requisições' : 'já está separado dali para outra requisição'} `
    + `(${numeros.join(', ')}); sobra ${sobra}, que não cobre a quantidade (${qty}). Escolha outro endereço ou deixe "Qualquer endereço (automático)"`;

  // L1 6 em XB-01 (vence antes), L2 9 na padrao XP-01 (o outro endereco).
  const cenario = async ({ l1 = 6 } = {}) => {
    const m = await material();
    await entrar(m, B01.id, l1, 'L1'); await entrar(m, P01.id, 9, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    return { m, L1: await loteId(m, 'L1'), L2: await loteId(m, 'L2') };
  };
  const doPar = (item, q, L1, locId = B01.id) => ({ item_id: item, quantidade_separada: q, localizacao_origem_id: locId, lote_id: L1 });
  const auto = (item, q) => ({ item_id: item, quantidade_separada: q });
  const saiDe = (item, q, L1, locId = B01.id) => ({ item_id: item, quantidade_atendida: q, localizacao_origem_id: locId, lote_id: L1 });
  const sepOk = async (R, linhas) => { const r = await separar(R, linhas); assert.strictEqual(r.status, 200, JSON.stringify(r.body)); };
  const entOk = async (R, linhas) => { const r = await entregar(R, linhas); assert.strictEqual(r.status, 200, JSON.stringify(r.body)); };
  // A recusa nao grava nada: status, itens (entregue), saldos, livro, trocas.
  const foto = async (m, r, L1, L2) => ({
    st: await statusDe(r.R), itens: await Promise.all(r.ids.map(itemDe)), b: await saldoDe(m, B01.id, L1), p: await saldoDe(m, P01.id, L2),
    mov: await nMov(m), trocas: (await trocas(r.R)).length,
  });
  const recusaSemGravar = async (m, r, L1, L2, linhas, esperado) => {
    const antes = await foto(m, r, L1, L2);
    const b = await entregar(r.R, linhas);
    assert.strictEqual(b.status, 400, JSON.stringify(b.body));
    assert.strictEqual(b.body.error, esperado);
    assert.deepStrictEqual(await foto(m, r, L1, L2), antes, 'nada gravado');
  };
  // O cenario do C468: R1 guarda 4 em XB-01/L1 (6); R2 separa 4 no automatico.
  const c468 = async () => {
    const c = await cenario();
    const r1 = await req([[c.m.id, 4]]); const r2 = await req([[c.m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, c.L1)]);
    await sepOk(r2.R, [auto(r2.ids[0], 4)]);
    return { ...c, r1, r2 };
  };

  // ---------------------------------------------------------------- RN-200.01
  await test('[RN-200.01 rota] R1 guardou 4 em XB-01/L1 (6); R2 (automatico) entrega 4 com "Sai de" XB-01/L1 -> 400 E1, nada gravado', async () => {
    const { m, L1, L2, r1, r2 } = await c468();
    await recusaSemGravar(m, r2, L1, L2, [saiDe(r2.ids[0], 4, L1)],
      e1(m, { saldo: 6, outras: 4, numeros: [await numero(r1.R)], sobra: 2, qty: 4 }));
  });

  await test('[RN-200.01 variante] R2 guardou XP-01/L2 e escolhe XB-01/L1 (outro par) -> a mesma E1, sem troca gravada', async () => {
    const { m, L1, L2 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    await sepOk(r2.R, [doPar(r2.ids[0], 4, L2, P01.id)]);
    await recusaSemGravar(m, r2, L1, L2, [saiDe(r2.ids[0], 4, L1)],
      e1(m, { saldo: 6, outras: 4, numeros: [await numero(r1.R)], sobra: 2, qty: 4 }));
  });

  await test('[RN-200.01 plural] R1 e R3 guardaram 2 cada em XB-01/L1; R2 entrega 4 de la -> E1 no plural, numeros na ordem do id', async () => {
    const { m, L1, L2 } = await cenario();
    const r1 = await req([[m.id, 2]]); const r3 = await req([[m.id, 2]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 2, L1)]);
    await sepOk(r3.R, [doPar(r3.ids[0], 2, L1)]);
    await sepOk(r2.R, [auto(r2.ids[0], 4)]);
    await recusaSemGravar(m, r2, L1, L2, [saiDe(r2.ids[0], 4, L1)],
      e1(m, { saldo: 6, outras: 4, numeros: [await numero(r1.R), await numero(r3.R)], sobra: 2, qty: 4 }));
  });

  // ---------------------------------------------------------------- RN-200.02
  await test('[RN-200.02] fronteira 2,000001 -> E1; 2 -> 200; R1 entrega pela planejada -> 200; XB-01/L1 0', async () => {
    const { m, L1, L2, r1, r2 } = await c468();
    await recusaSemGravar(m, r2, L1, L2, [saiDe(r2.ids[0], 2.000001, L1)],
      e1(m, { saldo: 6, outras: 4, numeros: [await numero(r1.R)], sobra: 2, qty: 2.000001 }));
    await entOk(r2.R, [saiDe(r2.ids[0], 2, L1)]);
    await entOk(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 4 }]);
    assert.strictEqual(await saldoDe(m, B01.id, L1), 0);
    assert.strictEqual(await saldoDe(m, P01.id, L2), 9);
    assert.deepStrictEqual(await semLoteNaoZero(m), []);
  });

  // ---------------------------------------------------------------- RN-200.03
  await test('[RN-200.03 precedencia] o fisico sozinho nao cobre (R2 pede 7 de XB-01/L1 6) -> a literal de hoje, nao a E1', async () => {
    const { m, L1, L2 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 7]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    await sepOk(r2.R, [auto(r2.ids[0], 7)]);
    await recusaSemGravar(m, r2, L1, L2, [saiDe(r2.ids[0], 7, L1)],
      `${m.nome}: O saldo em XB-01 (6) não cobre a quantidade (7) — a saída tiraria de outros endereços`);
  });

  // ---------------------------------------------------------------- RN-200.04
  // Dado antigo: 4 + 4 guardados em XB-01/L1 (6), semeado por SQL.
  const sobrecomprometido = async () => {
    const c = await c468();
    await dbRun(db, `UPDATE itens_requisicao_almoxarifado SET origem_separacao_id = ?, lote_separacao_id = ?, quantidade_origem_separacao = 4
      WHERE id = ?`, [B01.id, c.L1, c.r2.ids[0]]);
    return c;
  };
  const naoServeMais = (m) => `${m.nome}: a origem da separação (XB-01) não serve mais (O saldo em XB-01 (2) não cobre a `
    + 'quantidade (4) — a saída tiraria de outros endereços) — entregue escolhendo de onde sai';

  await test('[RN-200.04 (a)] planejada sem chave, dado antigo 4 + 4 em 6: R1 200; R2 400 "nao serve mais" (RN-198.06)', async () => {
    const { m, L1, L2, r1, r2 } = await sobrecomprometido();
    await entOk(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 4 }]);
    await recusaSemGravar(m, r2, L1, L2, [{ item_id: r2.ids[0], quantidade_atendida: 4 }], naoServeMais(m));
  });

  await test('[RN-200.04 (b)] dado antigo: R2 manda XB-01/L1 (o que a tela manda) primeiro -> 200; R1 pela planejada -> 400 "nao serve mais"', async () => {
    const { m, L1, L2, r1, r2 } = await sobrecomprometido();
    await entOk(r2.R, [saiDe(r2.ids[0], 4, L1)]);
    assert.deepStrictEqual(await trocas(r2.R), [], 'mesmo par: sem troca');
    await recusaSemGravar(m, r1, L1, L2, [{ item_id: r1.ids[0], quantidade_atendida: 4 }], naoServeMais(m));
  });

  await test('[RN-200.04 (b\')] guardada SEM lote em XB-01 e "Sai de" XB-01 com L1 -> mesmo par, nao desconta: 200', async () => {
    const { m, L1, L2, r2 } = await c468();
    await dbRun(db, `UPDATE itens_requisicao_almoxarifado SET origem_separacao_id = ?, lote_separacao_id = NULL, quantidade_origem_separacao = 4
      WHERE id = ?`, [B01.id, r2.ids[0]]);
    await entOk(r2.R, [saiDe(r2.ids[0], 4, L1)]);
    assert.strictEqual(await saldoDe(m, B01.id, L1), 2);
    assert.strictEqual(await saldoDe(m, P01.id, L2), 9);
    assert.deepStrictEqual(await trocas(r2.R), []);
  });

  // ---------------------------------------------------------------- RN-200.05
  await test('[RN-200.05 excluida] R1 guardou 4 e foi excluida (DELETE; a origem fica gravada): R2 entrega 4 de XB-01/L1 -> 200', async () => {
    const { m, L1, r1, r2 } = await c468();
    const d = await como('ADMIN').del(`${API}/requisicoes/${r1.R}`, { justificativa: 'exclusao 200' });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.strictEqual((await itemDe(r1.ids[0])).origem_separacao_id, B01.id, 'premissa C467: a origem fica');
    await entOk(r2.R, [saiDe(r2.ids[0], 4, L1)]);
    assert.strictEqual(await saldoDe(m, B01.id, L1), 2);
  });

  await test('[RN-200.05 cancelada legada, por SQL] CANCELADO com ativo=1 e a origem gravada nao compromete: R2 entrega 4 -> 200', async () => {
    const { m, L1, r1, r2 } = await c468();
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'CANCELADO', ativo = 1 WHERE id = ?", [r1.R]);
    await entOk(r2.R, [saiDe(r2.ids[0], 4, L1)]);
    assert.strictEqual(await saldoDe(m, B01.id, L1), 2);
  });

  await test('[RN-200.05 parte limitada] R1 separou 3 do par e 3 no automatico (parte 3): R2 entrega 3,5 -> E1 com 3; 3 -> 200', async () => {
    const { m, L1, L2 } = await cenario();
    const r1 = await req([[m.id, 6]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 3, L1)]);
    await sepOk(r1.R, [auto(r1.ids[0], 3)]);
    const it1 = await itemDe(r1.ids[0]);
    assert.deepStrictEqual([Number(it1.quantidade_separada), Number(it1.quantidade_origem_separacao)], [6, 3], 'premissa: caixa 6, parte 3');
    await sepOk(r2.R, [auto(r2.ids[0], 4)]);
    await recusaSemGravar(m, r2, L1, L2, [saiDe(r2.ids[0], 3.5, L1)],
      e1(m, { saldo: 6, outras: 3, numeros: [await numero(r1.R)], sobra: 3, qty: 3.5 }));
    await entOk(r2.R, [saiDe(r2.ids[0], 3, L1)]);
  });

  await test('[RN-200.05 NULL legado, por SQL] quantidade_origem_separacao NULL -> a caixa inteira (6) compromete: R2 entrega 1 -> E1, sobra 0', async () => {
    const { m, L1, L2 } = await cenario();
    const r1 = await req([[m.id, 6]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 3, L1)]);
    await sepOk(r1.R, [auto(r1.ids[0], 3)]);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_origem_separacao = NULL WHERE id = ?', [r1.ids[0]]);
    await sepOk(r2.R, [auto(r2.ids[0], 4)]);
    await recusaSemGravar(m, r2, L1, L2, [saiDe(r2.ids[0], 1, L1)],
      e1(m, { saldo: 6, outras: 6, numeros: [await numero(r1.R)], sobra: 0, qty: 1 }));
  });

  // ---------------------------------------------------------------- RN-200.06
  await test('[RN-200.06 (i)] a propria requisicao nao e "outra": R1 guardou 2, R2 item 1 guardou 2, item 2 (auto) entrega 3 de XB-01/L1 -> 200', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 2]]); const r2 = await req([[m.id, 2], [m.id, 3]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 2, L1)]);
    await sepOk(r2.R, [doPar(r2.ids[0], 2, L1), auto(r2.ids[1], 3)]);
    // so a parte de R1 (2) e "outra": 6 - 2 = 4 cobre 3 (contando o irmao, 6 - 4 = 2 nao cobriria — C472, B1340).
    await entOk(r2.R, [saiDe(r2.ids[1], 3, L1)]);
    assert.strictEqual(await saldoDe(m, B01.id, L1), 3);
  });

  await test('[RN-200.06 (ii)] R1 guardou 4; R2 entrega dois itens 1 + 2 de XB-01/L1 -> E1 no primeiro "(ja contando 2 desta entrega)"', async () => {
    const { m, L1, L2 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 1], [m.id, 2]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    await sepOk(r2.R, [auto(r2.ids[0], 1), auto(r2.ids[1], 2)]);
    // Fase 2 (item 1): a passada do caso (c) roda com o pedidoPorOrigem completo — o primeiro (c) ja ve o irmao.
    await recusaSemGravar(m, r2, L1, L2, [saiDe(r2.ids[0], 1, L1), saiDe(r2.ids[1], 2, L1)],
      e1(m, { saldo: 4, contando: 2, outras: 4, numeros: [await numero(r1.R)], sobra: 0, qty: 1 }));
  });

  // (iii) Fase 2, item 1: XB-01/L1 4; R1 guardou 2; R2 tem A (automatico, "Sai de" XB-01/L1, 2) e B (guardou 2 ali, caso b, 2).
  const caso3 = async (aPrimeiro) => {
    const { m, L1, L2 } = await cenario({ l1: 4 });
    const r1 = await req([[m.id, 2]]); const r2 = await req([[m.id, 2], [m.id, 2]]);
    const [A, B] = aPrimeiro ? r2.ids : [r2.ids[1], r2.ids[0]];
    assert.ok(aPrimeiro ? A < B : A > B, 'premissa: a ordem dos ids');
    await sepOk(r1.R, [doPar(r1.ids[0], 2, L1)]);
    await sepOk(r2.R, [doPar(B, 2, L1), auto(A, 2)]);
    await recusaSemGravar(m, r2, L1, L2, [saiDe(A, 2, L1), saiDe(B, 2, L1)],
      e1(m, { saldo: 2, contando: 2, outras: 2, numeros: [await numero(r1.R)], sobra: 0, qty: 2 }));
  };
  await test('[RN-200.06 (iii) A antes de B] item (c) de id menor que o irmao do caso (b) no mesmo par -> E1 no A', () => caso3(true));
  await test('[RN-200.06 (iii) B antes de A] item (c) de id maior -> a mesma E1 no A', () => caso3(false));

  // ---------------------------------------------------------------- RN-200.07
  await test('[RN-200.07] automatico e so lote nao mudam: R2 automatico 4 -> 200 (2 L1 + 2 L2); R3 so lote L1 4 -> 200 (C471)', async () => {
    const { m, L1, L2, r1, r2 } = await c468();
    await entOk(r2.R, [{ item_id: r2.ids[0], quantidade_atendida: 4 }]);
    assert.strictEqual(await saldoDe(m, B01.id, L1), 4);
    assert.strictEqual(await saldoDe(m, P01.id, L2), 7);
    const b = await c468();
    await entOk(b.r2.R, [{ item_id: b.r2.ids[0], quantidade_atendida: 4, lote_id: b.L1 }]);
    assert.strictEqual(await saldoDe(b.m, B01.id, b.L1), 2, 'so lote: tira de XB-01 sem olhar a guarda (registra o C471)');
    assert.ok(r1.R && b.r1.R);
  });

  // ---------------------------------------------------------------- pelo servico
  const ALMOX = { ...USERS.ALMOX };
  await test('[RN-200.01 servico] entregarRequisicao direto -> lanca 400 com a mesma E1', async () => {
    const { m, L1, r1, r2 } = await c468();
    let erro = null;
    try { await requisitionService.entregarRequisicao(db, r2.R, [saiDe(r2.ids[0], 4, L1)], ALMOX, null); } catch (e) { erro = e; }
    assert.ok(erro, 'a entrega de R2 tinha de lancar');
    assert.strictEqual(erro.status, 400);
    assert.strictEqual(erro.message, e1(m, { saldo: 6, outras: 4, numeros: [await numero(r1.R)], sobra: 2, qty: 4 }));
    assert.strictEqual(await saldoDe(m, B01.id, L1), 6);
  });

  const ordens = { separacaoPrimeiro: 0, entregaPrimeiro: 0 };
  await test('[RN-200.08 servico, corrida] R1 separa 4 de XB-01/L1 e R2 entrega 4 de la ao mesmo tempo (10x, alternando quem sai antes): nunca as duas', async () => {
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop
      const { m, L1 } = await cenario();
      // eslint-disable-next-line no-await-in-loop
      const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
      // eslint-disable-next-line no-await-in-loop
      await sepOk(r2.R, [auto(r2.ids[0], 4)]);
      const sep = () => requisitionService.separarRequisicao(db, r1.R, [doPar(r1.ids[0], 4, L1)], ALMOX);
      const ent = () => requisitionService.entregarRequisicao(db, r2.R, [saiDe(r2.ids[0], 4, L1)], ALMOX, null);
      // par: a separacao e lancada primeiro; impar: a entrega.
      const lancadas = i % 2 === 0 ? [sep(), ent()] : [ent(), sep()];
      // eslint-disable-next-line no-await-in-loop
      const res = await Promise.allSettled(lancadas);
      const [rSep, rEnt] = i % 2 === 0 ? res : [res[1], res[0]];
      assert.ok(!(rSep.status === 'fulfilled' && rEnt.status === 'fulfilled'), `volta ${i}: as duas passaram`);
      assert.strictEqual(res.filter((x) => x.status === 'fulfilled').length, 1, `volta ${i}: ${res.map((x) => x.reason && x.reason.message)}`);
      if (rSep.status === 'fulfilled') {
        ordens.separacaoPrimeiro++;
        // eslint-disable-next-line no-await-in-loop
        assert.strictEqual(rEnt.reason.message, e1(m, { saldo: 6, outras: 4, numeros: [await numero(r1.R)], sobra: 2, qty: 4 }));
      } else {
        ordens.entregaPrimeiro++;
        assert.strictEqual(rSep.reason.status, 400, rSep.reason.message);
      }
      // eslint-disable-next-line no-await-in-loop
      const soma = await dbGet(db, `SELECT COALESCE(SUM(quantidade_origem_separacao), 0) as q FROM itens_requisicao_almoxarifado
        WHERE material_id = ? AND origem_separacao_id = ? AND lote_separacao_id = ?`, [m.id, B01.id, L1]);
      // eslint-disable-next-line no-await-in-loop
      const fis = await saldoDe(m, B01.id, L1);
      assert.ok(Number(soma.q) <= fis + 1e-9, `volta ${i}: partes no par ${soma.q} > fisico ${fis}`);
    }
    console.log(`    ordens: separacao venceu ${ordens.separacaoPrimeiro}, entrega venceu ${ordens.entregaPrimeiro}`);
  });

  // ---------------------------------------------------------------- T3: RN-200.09, o caso do item ponta a ponta
  // R1 separa de XB-01/L1 (PUT .../separacao, a da tela); R2 separa no automatico; R2 entrega com "Sai de" XB-01/L1 -> E1; com XP-01/L2
  // -> 200; R1 entrega mandando o mesmo par como a tela (montarItensEntrega: localizacao_origem_id + lote_id) -> 200.
  const fimDoCaso = async (m, L1, L2, r1, r2) => {
    assert.strictEqual(await saldoDe(m, B01.id, L1), 2);
    assert.strictEqual(await saldoDe(m, P01.id, L2), 5);
    assert.deepStrictEqual(await semLoteNaoZero(m), []);
    assert.deepStrictEqual(await trocas(r1.R), []);
    assert.deepStrictEqual(await trocas(r2.R), []);
    const livro = await dbAll(db, `SELECT mv.quantidade, mv.localizacao_origem_id as loc, mv.lote_id as lote
      FROM movimentacoes_almoxarifado mv WHERE mv.material_id = ? AND mv.tipo = 'SAIDA' ORDER BY mv.id`, [m.id]);
    assert.deepStrictEqual(livro.map((x) => [Number(x.quantidade), x.loc, x.lote]), [[4, P01.id, L2], [4, B01.id, L1]],
      `livro: ${JSON.stringify(livro)}`);
    assert.strictEqual(await statusDe(r1.R), 'ENTREGUE');
    assert.strictEqual(await statusDe(r2.R), 'ENTREGUE');
  };

  await test('[T3 rota, RN-200.09] R1 separa de XB-01/L1 (/separacao); R2 automatico; R2 "Sai de" XB-01/L1 -> E1; XP-01/L2 -> 200; R1 pelo par -> 200', async () => {
    const { m, L1, L2 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    const a = await separacao(r1.R, [doPar(r1.ids[0], 4, L1)]);
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    const b = await separacao(r2.R, [auto(r2.ids[0], 4)]);
    assert.strictEqual(b.status, 200, JSON.stringify(b.body));
    await recusaSemGravar(m, r2, L1, L2, [saiDe(r2.ids[0], 4, L1)],
      e1(m, { saldo: 6, outras: 4, numeros: [await numero(r1.R)], sobra: 2, qty: 4 }));
    await entOk(r2.R, [saiDe(r2.ids[0], 4, L2, P01.id)]);
    await entOk(r1.R, [saiDe(r1.ids[0], 4, L1)]);
    await fimDoCaso(m, L1, L2, r1, r2);
  });

  await test('[T3 servico, RN-200.09] o mesmo pelo servico: separarRequisicao / entregarRequisicao', async () => {
    const { m, L1, L2 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await requisitionService.separarRequisicao(db, r1.R, [doPar(r1.ids[0], 4, L1)], ALMOX);
    await requisitionService.separarRequisicao(db, r2.R, [auto(r2.ids[0], 4)], ALMOX);
    let erro = null;
    try { await requisitionService.entregarRequisicao(db, r2.R, [saiDe(r2.ids[0], 4, L1)], ALMOX, null); } catch (e) { erro = e; }
    assert.ok(erro && erro.status === 400, `R2 em XB-01/L1 tinha de recusar: ${erro && erro.message}`);
    assert.strictEqual(erro.message, e1(m, { saldo: 6, outras: 4, numeros: [await numero(r1.R)], sobra: 2, qty: 4 }));
    assert.strictEqual(await saldoDe(m, B01.id, L1), 6);
    await requisitionService.entregarRequisicao(db, r2.R, [saiDe(r2.ids[0], 4, L2, P01.id)], ALMOX, null);
    await requisitionService.entregarRequisicao(db, r1.R, [saiDe(r1.ids[0], 4, L1)], ALMOX, null);
    await fimDoCaso(m, L1, L2, r1, r2);
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
