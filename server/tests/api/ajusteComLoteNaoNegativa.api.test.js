/**
 * Etapa 253 (C475; B1357 revista) — o Ajuste com lote nao deixa o lote negativo.
 *
 * O AJUSTE sem localizacao define o TOTAL do material e poe a diferenca na linha do lote citado (`syncSaldoLocalizacaoPadrao`). Ate a 253
 * a linha do lote ia a negativo quando a baixa passava do que o lote tinha (LB 5 + 3 sem lote, ajuste para 1 com LB -> LB -2), e o lote
 * noutro endereco deixava a linha padrao do lote negativa com o endereco dizendo o que nao tem. Agora: recusa (RN-253.10, com o piso do que
 * esta preso no lote — Fase 2 achado 1), drenar das linhas do lote (RN-253.11), e a mesma guarda e o mesmo drenar no estorno (RN-253.14).
 * So a integracao alcanca (`POST /movimentacoes/v2`; a tela Movimentacoes nao mostra lote no Ajuste; a v1 nao repassa — B1357).
 *
 * Cuidado com teste vazio: o 201 de hoje e o 201 de depois sao iguais no status — todo cenario confere as LINHAS e o livro.
 *
 * Plano: docs/superpowers/plans/2026-11-20-almoxarifado-etapa253-busca-de-entrega-e-ajuste-com-lote.md
 * Executar: cd server && node tests/api/ajusteComLoteNaoNegativa.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const { PERFIS } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 253', role: 'admin', is_superadmin: 1, email: 'a253@t.com' },
  ALMOX: { id: 25301, nome: 'Almox 253', role: 'user', email: 'x253@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const MSG = (x, l, d, f, m) => `Ajuste para ${x} UN indicando o lote ${l} deixaria o lote com saldo negativo (${d} UN): fora do lote ${l} `
  + `há ${f} UN. Para baixar só este lote, o novo total tem de ser de no mínimo ${m} UN; para baixar mais, faça o ajuste sem indicar o lote.`;
const MSG_EST = (t, l, f, d) => `Não é possível estornar: o estorno volta o total para ${t} UN, mas fora do lote ${l} já há ${f} UN — `
  + `o lote ${l} ficaria com saldo negativo (${d} UN). Faça um novo ajuste em vez de estornar.`;

(async () => {
  console.log('\n=== Etapa 253: o Ajuste com lote nao deixa o lote negativo ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  app.use((req, res, next) => { const k = req.headers['x-u']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  stack.splice(stack.findIndex((l) => l.name === 'jsonParser') + 1, 0, mw);
  const como = (k) => ({
    post: (u, b = {}) => request(app).post(u).set('x-u', k).send(b),
    put: (u, b = {}) => request(app).put(u).set('x-u', k).send(b),
  });
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0'); await cfg('liberacao_valor_ativo', '0');
  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM253T', nome: 'A253T' });
  const loc = async (codigo) => {
    await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('A253T'); const B = await loc('B253T'); const P = await loc('P253T');
  let seq = 0;
  const material = async ({ padrao = P.id, negativo = 0 } = {}) => {
    const c = `AJL253-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote,
      controle_serie, permite_saldo_negativo, localizacao_padrao_id, custo_unitario) VALUES (?,?,'UN',0,1,0,0,?,?,1)`,
    [c, c, negativo, padrao])).lastID;
  };
  const v2 = (b) => como('ADMIN').post(`${API}/movimentacoes/v2`, { motivo: 'teste 253', justificativa: 'teste 253', ...b });
  const cancelar = (id) => como('ADMIN').post(`${API}/movimentacoes/${id}/cancelar`, { motivo: 'teste 253' });
  const loteId = async (m, c) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id=? AND codigo=?', [m, c])).id;
  // As linhas como texto ordenado ("A253T/LB=5 P253T/-=3"), sem as linhas zeradas que nao existiam — o estado inteiro numa comparacao.
  const linhas = async (m) => (await dbAll(db, `SELECT COALESCE(l.codigo,'-') loc, COALESCE(lt.codigo,'-') lote, s.quantidade q
    FROM estoque_saldo_almoxarifado s LEFT JOIN localizacoes_almoxarifado l ON l.id=s.localizacao_id
    LEFT JOIN lotes_almoxarifado lt ON lt.id=s.lote_id WHERE s.material_id=?`, [m]))
    .map((r) => `${r.loc}/${r.lote}=${Math.round(r.q * 1e6) / 1e6}`).sort().join(' ');
  const fis = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id=?', [m])).q);
  const nLivro = async (m) => (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id=?', [m])).n;
  const foto = async (m) => ({ fisico: await fis(m), linhas: await linhas(m), livro: await nLivro(m) });
  const entrar = async (m, q, extra = {}) => {
    const r = await v2({ material_id: m, tipo: 'ENTRADA', quantidade: q, ...extra });
    assert.strictEqual(r.status, 201, `entrada de premissa: ${JSON.stringify(r.body)}`);
    return r.body.id;
  };
  // LB 5 (no endereco `onde`) + 3 sem lote na padrao P: fisico 8.
  const montar = async ({ onde = P.id, negativo = 0 } = {}) => {
    const m = await material({ negativo });
    await entrar(m, 5, { lote: 'LB', localizacao_destino_id: onde });
    await entrar(m, 3);
    return { m, LB: await loteId(m, 'LB') };
  };

  // ── RN-253.10: a recusa ───────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-253.10] C475: LB 5 + 3, ajuste para 1 com LB -> 400 com a literal, nada muda', async () => {
    const { m, LB } = await montar();
    const antes = await foto(m);
    assert.strictEqual(antes.linhas, 'P253T/-=3 P253T/LB=5', `premissa: ${antes.linhas}`);
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 1, lote_id: LB });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, MSG(1, 'LB', -2, 3, 3));
    assert.deepStrictEqual(await foto(m), antes);
  });

  await test('[RN-253.10] no limite (novo total = fora do lote) passa e zera o lote; o lote pelo codigo tambem e julgado', async () => {
    const { m, LB } = await montar();
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 3, lote_id: LB });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await linhas(m), 'P253T/-=3 P253T/LB=0');
    assert.strictEqual(await fis(m), 3);
    const r2 = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 2, lote: 'LB' });
    assert.strictEqual(r2.status, 400, JSON.stringify(r2.body));
    assert.strictEqual(r2.body.error, MSG(2, 'LB', -1, 3, 3));
  });

  await test('[RN-253.10] casas decimais: a literal e a conta pelo Q.qtd (0,3 - 0,1 nao vira 0.19999999999999998)', async () => {
    const m = await material();
    await entrar(m, 0.3, { lote: 'LD' });
    await entrar(m, 0.1);
    const LD = await loteId(m, 'LD');
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 0.05, lote_id: LD });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, MSG(0.05, 'LD', -0.05, 0.1, 0.1));
    const ok = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 0.2, lote_id: LD });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    assert.strictEqual(await linhas(m), 'P253T/-=0.1 P253T/LD=0.1');
  });

  await test('[RN-253.10] AJUSTE_INVENTARIO com lote (so pelo servico) tem a mesma recusa', async () => {
    const { m, LB } = await montar();
    const antes = await foto(m);
    await assert.rejects(() => stockService.registrarMovimentacao(db, USERS.ADMIN, {
      material_id: m, tipo: 'AJUSTE_INVENTARIO', quantidade: 1, lote_id: LB, motivo: 'conferencia', justificativa: 'conferencia' }),
    (e) => e.status === 400 && e.message === MSG(1, 'LB', -2, 3, 3));
    assert.deepStrictEqual(await foto(m), antes);
  });

  await test('[RN-253.10, Fase 2 achado 1] a caixa da requisicao separada do lote e piso: a recusa nomeia o preso; a entrega sai', async () => {
    const { m, LB } = await montar({ onde: A.id });
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?,1,'S','APROVADO')`, [`R253T-${++seq}`])).lastID;
    const item = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,4,0,0,0)`, [R, m])).lastID;
    const sep = await como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: item,
      quantidade_separada: 4, localizacao_origem_id: A.id, lote_id: LB }] });
    assert.strictEqual(sep.status, 200, `separacao de premissa: ${JSON.stringify(sep.body)}`);
    const antes = await foto(m);
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 4, lote_id: LB });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Ajuste para 4 UN indicando o lote LB deixaria o lote com 1 UN, abaixo do que está preso nele '
      + '(separada na caixa de requisição: 4; mínimo do lote: 4 UN): fora do lote LB há 3 UN. Para baixar só este lote, o novo total '
      + 'tem de ser de no mínimo 7 UN; para baixar mais, faça o ajuste sem indicar o lote.');
    assert.deepStrictEqual(await foto(m), antes);
    const ok = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 7, lote_id: LB });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    assert.strictEqual(await linhas(m), 'A253T/LB=4 P253T/-=3 P253T/LB=0');
    const ent = await como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: 4 }] });
    assert.strictEqual(ent.status, 200, `a caixa ficou presa: ${JSON.stringify(ent.body)}`);
    assert.strictEqual(await linhas(m), 'A253T/LB=0 P253T/-=3 P253T/LB=0');
  });

  await test('[RN-253.10] o bloqueado NO lote (Bloquear indicando o lote) tambem e piso; subir o lote nao e recusado pelo piso', async () => {
    const m = await material();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1 WHERE id = ?', [m]);
    await entrar(m, 5, { lote: 'LB' });
    await entrar(m, 3, { lote: 'LC' });
    const LB = await loteId(m, 'LB');
    await stockService.registrarMovimentacao(db, USERS.ADMIN, { material_id: m, tipo: 'BLOQUEIO', quantidade: 2, lote_id: LB,
      motivo: 'avaria', justificativa: 'avaria' });
    const antes = await foto(m);
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 4, lote_id: LB });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Ajuste para 4 UN indicando o lote LB deixaria o lote com 1 UN, abaixo do que está preso nele '
      + '(bloqueada no lote: 2; mínimo do lote: 2 UN): fora do lote LB há 3 UN. Para baixar só este lote, o novo total tem de ser de no '
      + 'mínimo 5 UN; para baixar mais, faça o ajuste sem indicar o lote.');
    assert.deepStrictEqual(await foto(m), antes);
    const ok = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 5, lote_id: LB });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    assert.strictEqual(await linhas(m), 'P253T/LB=2 P253T/LC=3');
    // Um lote ja ABAIXO do piso (legado: 0,5 com 2 bloqueados) que sobe para 1,5 — ainda abaixo do piso — nao e recusado: o piso so
    // vale quando o lote desce.
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = 0.5 WHERE material_id = ? AND lote_id = ?', [m, LB]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 3.5 WHERE id = ?', [m]);
    const sobe = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 4.5, lote_id: LB });
    assert.strictEqual(sobe.status, 201, JSON.stringify(sobe.body));
    assert.strictEqual(await linhas(m), 'P253T/LB=1.5 P253T/LC=3');
  });

  await test('[RN-253.10, Fase 5] em inspecao, reprovado e em terceiros no lote tambem sao piso (cada parcela nomeada)', async () => {
    const { m, LB } = await montar();
    const rec = (await dbRun(db, "INSERT INTO recebimentos_material_almoxarifado (numero) VALUES (?)", [`REC253-${++seq}`])).lastID;
    const ri = (await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
      quantidade_recebida, lote_id, quantidade_em_inspecao) VALUES (?, ?, 5, 5, ?, 1)`, [rec, m, LB])).lastID;
    await dbRun(db, 'INSERT INTO inspecoes_recebimento_almoxarifado (recebimento_item_id, quantidade_reprovada) VALUES (?, 1)', [ri]);
    const rem = (await dbRun(db, "INSERT INTO remessas_terceiro_almoxarifado (numero) VALUES (?)", [`REM253-${seq}`])).lastID;
    await dbRun(db, `INSERT INTO itens_remessa_terceiro_almoxarifado (remessa_id, material_id, quantidade, lote_id, enviado_em)
      VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)`, [rem, m, LB]);
    const antes = await foto(m);
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 5, lote_id: LB });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Ajuste para 5 UN indicando o lote LB deixaria o lote com 2 UN, abaixo do que está preso nele '
      + '(em inspeção: 1, reprovada na inspeção: 1, em terceiros: 1; mínimo do lote: 3 UN): fora do lote LB há 3 UN. Para baixar só este '
      + 'lote, o novo total tem de ser de no mínimo 6 UN; para baixar mais, faça o ajuste sem indicar o lote.');
    assert.deepStrictEqual(await foto(m), antes);
    const ok = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 6, lote_id: LB });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  });

  // Requisicao aprovada com um item do material, separada pelo ALMOXARIFE da origem e do lote dados. Devolve { R, item }.
  const separar = async (m, q, origem, lote) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?,1,'S','APROVADO')`, [`R253T-${++seq}`])).lastID;
    const item = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m, q])).lastID;
    const sep = await como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: item,
      quantidade_separada: q, localizacao_origem_id: origem, lote_id: lote }] });
    assert.strictEqual(sep.status, 200, `separacao de premissa: ${JSON.stringify(sep.body)}`);
    return { R, item };
  };
  const entregar = (R, item, q) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`,
    { itens_atendidos: [{ item_id: item, quantidade_atendida: q }] });

  await test('[RN-253.14, Fase 5] o estorno que desce o lote abaixo da caixa separada dele e recusado com o texto do estorno', async () => {
    const { m, LB } = await montar();
    const aj = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 10, lote_id: LB });
    assert.strictEqual(aj.status, 201, JSON.stringify(aj.body));
    await separar(m, 6, P.id, LB);
    const antes = await foto(m);
    const r = await cancelar(aj.body.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Não é possível estornar: o estorno volta o total para 8 UN, mas fora do lote LB já há 3 UN — o lote LB '
      + 'ficaria com 5 UN, abaixo do que está preso nele (separada na caixa de requisição: 6; mínimo do lote: 6 UN). Faça um novo ajuste em vez '
      + 'de estornar.');
    assert.deepStrictEqual(await foto(m), antes);
  });

  // ── RN-253.11: o drenar do lote ───────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-253.11] o lote noutro endereco: a baixa sai das linhas do lote, nenhuma linha do lote negativa', async () => {
    const { m, LB } = await montar({ onde: A.id });
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 4, lote_id: LB });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await linhas(m), 'A253T/LB=1 P253T/-=3 P253T/LB=0');
    assert.strictEqual(await fis(m), 4);
    // depois do drenar a saida do lote ve o que existe (antes saia 4 de A e o lote ia a -3)
    const sa = await v2({ material_id: m, tipo: 'SAIDA', quantidade: 4, lote_id: LB });
    assert.strictEqual(sa.status, 400, JSON.stringify(sa.body));
  });

  await test('[RN-253.11, Fase 2 achado 6] o drenar tira do endereco livre antes do bloqueado', async () => {
    const m = await material();
    await entrar(m, 3, { lote: 'LB', localizacao_destino_id: A.id });
    await entrar(m, 2, { lote: 'LB', localizacao_destino_id: B.id });
    await entrar(m, 3);
    const LB = await loteId(m, 'LB');
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id = ?', [A.id]);
    try {
      const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 5, lote_id: LB });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      // tira 3: B (livre, 2) primeiro, depois 1 de A (bloqueado, o maior)
      assert.strictEqual(await linhas(m), 'A253T/LB=2 B253T/LB=0 P253T/-=3 P253T/LB=0');
    } finally {
      await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 0 WHERE id = ?', [A.id]);
    }
  });

  await test('[RN-253.11, Fase 5 achado 1] o drenar nao tira da prateleira da caixa separada: a entrega sai', async () => {
    const m = await material();
    await entrar(m, 4, { lote: 'LB', localizacao_destino_id: A.id });
    await entrar(m, 3, { lote: 'LB', localizacao_destino_id: B.id });
    const LB = await loteId(m, 'LB');
    const { R, item } = await separar(m, 4, A.id, LB);
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 4, lote_id: LB });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await linhas(m), 'A253T/LB=4 B253T/LB=0 P253T/LB=0', 'o drenar levou a caixa de A');
    const ent = await entregar(R, item, 4);
    assert.strictEqual(ent.status, 200, `a entrega foi recusada: ${JSON.stringify(ent.body)}`);
    assert.strictEqual(await linhas(m), 'A253T/LB=0 B253T/LB=0 P253T/LB=0');
  });

  await test('[RN-253.14, Fase 5 achado 1] o drenar do estorno tambem poupa a caixa separada', async () => {
    const m = await material();
    await entrar(m, 6, { lote: 'LB', localizacao_destino_id: A.id });
    await entrar(m, 3, { lote: 'LB', localizacao_destino_id: B.id });
    const LB = await loteId(m, 'LB');
    const aj = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 12, lote_id: LB });
    assert.strictEqual(aj.status, 201, JSON.stringify(aj.body));
    const tr = await v2({ material_id: m, tipo: 'TRANSFERENCIA', quantidade: 3, lote_id: LB, localizacao_origem_id: P.id,
      localizacao_destino_id: B.id });
    assert.strictEqual(tr.status, 201, JSON.stringify(tr.body));
    // A e B empatam em 6: na passada unica o drenar tiraria de A (o id menor) — a caixa.
    const { R, item } = await separar(m, 6, A.id, LB);
    const r = await cancelar(aj.body.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await linhas(m), 'A253T/LB=6 B253T/LB=3 P253T/LB=0', 'o drenar do estorno levou a caixa de A');
    const ent = await entregar(R, item, 6);
    assert.strictEqual(ent.status, 200, `a entrega foi recusada: ${JSON.stringify(ent.body)}`);
  });

  // ── RN-253.12 e RN-253.13: o que nao muda ─────────────────────────────────────────────────────────────────────────────────
  await test('[RN-253.12] material que permite negativo: o C475 passa (201) como antes', async () => {
    const { m, LB } = await montar({ negativo: 1 });
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 1, lote_id: LB });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await linhas(m), 'P253T/-=3 P253T/LB=-2');
  });

  await test('[RN-253.13] ajuste para cima com lote, ajuste sem lote e ajuste com localizacao: como antes', async () => {
    const { m, LB } = await montar();
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 10, lote_id: LB });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await linhas(m), 'P253T/-=3 P253T/LB=7');
    const s = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 6 });
    assert.strictEqual(s.status, 201, JSON.stringify(s.body));
    assert.strictEqual(await linhas(m), 'P253T/-=-1 P253T/LB=7', 'o ajuste sem lote mudou');
    const c = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 2, lote_id: LB, localizacao_destino_id: P.id });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    assert.strictEqual(await linhas(m), 'P253T/-=-1 P253T/LB=2');
  });

  // ── RN-253.14: o estorno ──────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-253.14; RN-258.01] entrada sem lote depois do ajuste do lote: o estorno passa (total 18, LB 5) — ate a 257 era recusado',
    async () => {
      // Ate a Etapa 257 este cenario era a recusa do lote (MSG_EST(8, 'LB', 13, -5)): o estorno voltava o total ao valor fixo 8 e a Entrada
      // de 10 sem lote, feita depois, sumia da conta (C550). Desde a 258 o estorno desfaz a diferenca do ajuste (-2): 16 + 2 = 18, LB 5.
      const { m, LB } = await montar();
      const aj = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 6, lote_id: LB });
      assert.strictEqual(aj.status, 201, JSON.stringify(aj.body));
      await entrar(m, 10);
      assert.strictEqual(await linhas(m), 'P253T/-=13 P253T/LB=3', 'premissa');
      const r = await cancelar(aj.body.id);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(await fis(m), 18);
      assert.strictEqual(await linhas(m), 'P253T/-=13 P253T/LB=5');
    });

  await test('[RN-253.14] estorno que deixaria o lote negativo (o lote saiu depois do ajuste que o subiu) -> 400, claim volta, nada muda', async () => {
    const { m, LB } = await montar();
    const aj = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 10, lote_id: LB }); // LB 7
    assert.strictEqual(aj.status, 201, JSON.stringify(aj.body));
    const s = await v2({ material_id: m, tipo: 'SAIDA', quantidade: 7, lote_id: LB, localizacao_origem_id: P.id });
    assert.strictEqual(s.status, 201, JSON.stringify(s.body));
    const antes = await foto(m);
    assert.strictEqual(antes.linhas, 'P253T/-=3 P253T/LB=0');
    const r = await cancelar(aj.body.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, MSG_EST(1, 'LB', 3, -2));
    assert.deepStrictEqual(await foto(m), antes);
    const mov = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [aj.body.id]);
    assert.strictEqual(Number(mov.cancelado), 0, 'o claim nao voltou');
  });

  await test('[RN-253.14; RN-256.02] estorno que cabe depois do drenar: o lote volta ao total certo, em A (de onde o ajuste tirou)', async () => {
    const { m, LB } = await montar({ onde: A.id });
    const aj = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 4, lote_id: LB });
    assert.strictEqual(aj.status, 201, JSON.stringify(aj.body));
    const r = await cancelar(aj.body.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    // Ate a Etapa 255 as 4 voltavam na linha padrao do lote (A 1, P/LB 4 — declarado aqui); desde a 256 o estorno devolve a A, de onde o
    // ajuste as drenou (C549, RN-256.02).
    assert.strictEqual(await linhas(m), 'A253T/LB=5 P253T/-=3 P253T/LB=0');
    assert.strictEqual(await fis(m), 8);
  });

  await test('[RN-253.14, Fase 2 achado 2] ajuste para cima + transferencia do lote + estorno: drena, nenhuma linha negativa', async () => {
    const { m, LB } = await montar({ onde: A.id });
    const aj = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 10, lote_id: LB });
    assert.strictEqual(aj.status, 201, JSON.stringify(aj.body));
    assert.strictEqual(await linhas(m), 'A253T/LB=5 P253T/-=3 P253T/LB=2');
    const tr = await v2({ material_id: m, tipo: 'TRANSFERENCIA', quantidade: 2, lote_id: LB, localizacao_origem_id: P.id,
      localizacao_destino_id: A.id });
    assert.strictEqual(tr.status, 201, JSON.stringify(tr.body));
    const r = await cancelar(aj.body.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await linhas(m), 'A253T/LB=5 P253T/-=3 P253T/LB=0');
    assert.strictEqual(await fis(m), 8);
  });

  await test('[RN-253.14] o livro do estorno falha depois do drenar: o desfazer devolve as linhas drenadas, o total e o claim', async () => {
    const { m, LB } = await montar({ onde: A.id });
    const aj = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 10, lote_id: LB });
    await v2({ material_id: m, tipo: 'TRANSFERENCIA', quantidade: 2, lote_id: LB, localizacao_origem_id: P.id, localizacao_destino_id: A.id });
    const antes = await foto(m);
    assert.strictEqual(antes.linhas, 'A253T/LB=7 P253T/-=3 P253T/LB=0');
    await dbRun(db, `CREATE TRIGGER t253_falha BEFORE INSERT ON movimentacoes_almoxarifado WHEN NEW.tipo = 'ESTORNO'
      BEGIN SELECT RAISE(ABORT, 'falha forcada 253'); END`);
    let r;
    try { r = await cancelar(aj.body.id); } finally { await dbRun(db, 'DROP TRIGGER IF EXISTS t253_falha'); }
    assert.ok(r.status >= 400, `o estorno passou com o livro falhando: ${r.status}`);
    assert.deepStrictEqual(await foto(m), antes, 'o desfazer nao devolveu o estado');
    const mov = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [aj.body.id]);
    assert.strictEqual(Number(mov.cancelado), 0);
    const de = await cancelar(aj.body.id);
    assert.strictEqual(de.status, 200, `de novo, sem a falha: ${JSON.stringify(de.body)}`);
    assert.strictEqual(await linhas(m), 'A253T/LB=5 P253T/-=3 P253T/LB=0');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
