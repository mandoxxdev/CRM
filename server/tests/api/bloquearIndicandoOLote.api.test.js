/**
 * Etapa 249 (C500, B1419; C501) — o Bloquear Material (avulso) passa a aceitar o lote, com a regra "o lote tem livre para bloquear", e a
 * liberacao pela nao conformidade ganha a frase propria quando o "Sem lote" nao cobre a reprovacao.
 *
 * Cobre: RN-249.01 (bloquear com lote, rota e servico), .02 (o livre do lote: retido no lote e caixa separada no lote), .03 (ordem das
 * recusas), .04 (o Desbloquear depois), .05 (o estorno depois), .06 (os leitores do retido), .07 (a NC que aceita depois do bloqueio com
 * lote), .08 (dois bloqueios simultaneos, sob a trava), .09 (o GET da tela e a fixture), .20 (C501, a frase da NC).
 *
 * Usuarios reais por header (molde da entregaSaiDeRespeitaSeparado): S sem perfil cria; ADMIN aprova, da entrada, bloqueia; ALMOX separa.
 * Plano: docs/superpowers/plans/2026-11-19-almoxarifado-etapa249-bloquear-indicando-o-lote.md
 *
 * Executar: cd server && node tests/api/bloquearIndicandoOLote.api.test.js
 * Regravar a fixture da tela: cd server && CRM_GRAVAR_FIXTURE=1 node tests/api/bloquearIndicandoOLote.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const inspectionService = require('../../services/almoxarifado/inspectionService');
const nc = require('../../services/almoxarifado/nonConformityService');
const retidoDoLote = require('../../services/almoxarifado/retidoDoLote');

const FIXTURE = path.join(__dirname, '..', '..', '..', 'client', 'src', 'components', 'almoxarifado', '__fixtures__',
  'lotesParaBloquearDoServidor.json');
const GRAVAR = process.env.CRM_GRAVAR_FIXTURE === '1';

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 249', role: 'admin', is_superadmin: 1, email: 'a249@t.com' },
  S: { id: 24921, nome: 'Solic 249', role: 'user', email: 's249@t.com' },
  ALMOX: { id: 24922, nome: 'Almox 249', role: 'user', email: 'x249@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const QUALIDADE = { id: 24923, nome: 'Qualidade 249', perfil_almoxarifado: 'QUALIDADE', email: 'q249@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 249: bloquear indicando o lote (C500) e a frase da NC (C501) ===\n');
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
  });
  const adm = como('ADMIN');

  const alm = await adm.post(`${API}/almoxarifados`, { codigo: 'ALM249', nome: 'Almox 249' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await adm.post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const P01 = await loc('Z249-01');

  const material = async ({ lote = 1 } = {}) => {
    const c = `E249-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, ?, 0, ?)`, [c, c, lote, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, q, lote) => {
    const r = await adm.post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e249',
      localizacao_destino_id: P01.id, lote });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  // L1 4 e L2 4 (o padrao dos cenarios)
  const cenario = async ({ l1 = 4, l2 = 4 } = {}) => {
    const m = await material();
    await entrar(m, l1, 'L1');
    if (l2) await entrar(m, l2, 'L2');
    return { m, L1: await loteId(m, 'L1'), L2: l2 ? await loteId(m, 'L2') : null };
  };
  const bloquear = (m, q, loteIdArg, extra = {}) => adm.post(`${API}/materiais/${m.id}/bloquear`, {
    quantidade: q, justificativa: 'avaria 249', ...(loteIdArg !== undefined ? { lote_id: loteIdArg } : {}), ...extra });
  const desbloquear = (m, q, loteIdArg) => adm.post(`${API}/materiais/${m.id}/desbloquear`, {
    quantidade: q, justificativa: 'libera 249', ...(loteIdArg !== undefined ? { lote_id: loteIdArg } : {}) });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const livro = async (m, tipos = ['BLOQUEIO', 'DESBLOQUEIO']) => (await dbAll(db,
    `SELECT tipo, lote_id, quantidade, cancelado FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo IN (${tipos.map(() => '?').join(',')})
      ORDER BY id`, [m.id, ...tipos])).map((x) => [x.tipo, x.lote_id, Number(x.quantidade), Number(x.cancelado || 0)]);
  const bloqueada = async (m) => Number((await dbGet(db, 'SELECT quantidade_bloqueada b FROM materiais_almoxarifado WHERE id = ?', [m.id])).b);
  const porLote = async (m) => (await ok(adm.get(`${API}/materiais/${m.id}/bloqueado-por-lote`))).body;
  const paraBloquear = async (m) => (await ok(adm.get(`${API}/materiais/${m.id}/lotes-para-bloquear`))).body;
  const nMov = async (m) => Number((await dbGet(db, 'SELECT COUNT(*) as n FROM movimentacoes_almoxarifado WHERE material_id = ?', [m.id])).n);
  const recusaSemGravar = async (m, p, esperado) => {
    const antes = { b: await bloqueada(m), n: await nMov(m) };
    const r = await p;
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, esperado);
    assert.deepStrictEqual({ b: await bloqueada(m), n: await nMov(m) }, antes, 'nada gravado');
  };
  const LOTE_SEM_LIVRE = (codigo, n) => `Saldo livre do lote ${codigo} insuficiente para bloquear: ${n} UN`;

  // ---------------------------------------------------------------- RN-249.01
  await test('[RN-249.01 rota] L1 4 e L2 4: bloquear 2 indicando L1 -> 200; o livro tem BLOQUEIO com L1; por lote { total 2, sem_lote 0, L1 2 }', async () => {
    const { m, L1 } = await cenario();
    await ok(bloquear(m, 2, L1));
    assert.deepStrictEqual(await livro(m), [['BLOQUEIO', L1, 2, 0]]);
    assert.deepStrictEqual(await porLote(m), { material_id: m.id, total: 2, sem_lote: 0, lotes: [{ lote_id: L1, codigo: 'L1', quantidade: 2 }] });
  });
  await test('[RN-249.01 servico] inspectionService.bloquearMaterial com lote_id (texto "7" vale) grava o lote; sem lote_id fica sem lote (RN-209.03)', async () => {
    const { m, L1 } = await cenario();
    await inspectionService.bloquearMaterial(db, USERS.ADMIN, m.id, { quantidade: 1, justificativa: 'avaria 249', lote_id: String(L1) });
    await inspectionService.bloquearMaterial(db, USERS.ADMIN, m.id, { quantidade: 1, justificativa: 'avaria 249', lote_id: '' });
    await inspectionService.bloquearMaterial(db, USERS.ADMIN, m.id, { quantidade: 1, justificativa: 'avaria 249' });
    assert.deepStrictEqual(await livro(m), [['BLOQUEIO', L1, 1, 0], ['BLOQUEIO', null, 1, 0], ['BLOQUEIO', null, 1, 0]]);
    assert.strictEqual(await bloqueada(m), 3);
  });

  // ---------------------------------------------------------------- RN-249.02
  await test('[RN-249.02 retido] L1 4 com 3 ja bloqueados em L1: bloquear 2 em L1 -> 400 (livre 1), nada gravado; bloquear 1 -> 200; L2 continua bloqueavel', async () => {
    const { m, L1, L2 } = await cenario();
    await ok(bloquear(m, 3, L1));
    await recusaSemGravar(m, bloquear(m, 2, L1), LOTE_SEM_LIVRE('L1', 1));
    await ok(bloquear(m, 1, L1));
    await ok(bloquear(m, 4, L2));
    assert.deepStrictEqual((await porLote(m)).lotes.map((l) => [l.codigo, l.quantidade]), [['L1', 4], ['L2', 4]]);
    await recusaSemGravar(m, bloquear(m, 1, L1), 'Saldo disponível insuficiente para bloquear: 0 UN');
  });
  await test('[RN-249.02 caixa] R1 aprovou 4 e separou 4 de L1 (6); L2 9: bloquear 3 em L1 -> 400 (livre 2: a caixa no lote); 2 -> 200', async () => {
    const m = await material();
    await entrar(m, 6, 'L1'); await entrar(m, 9, 'L2');
    const L1 = await loteId(m, 'L1');
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-249', itens: [{ material_id: m.id, quantidade: 4 }] });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [cr.body.id])).id;
    await ok(adm.put(`${API}/requisicoes/${cr.body.id}/aprovar`, {}));
    await ok(como('ALMOX').put(`${API}/requisicoes/${cr.body.id}/separar`, {
      itens_separados: [{ item_id: item, quantidade_separada: 4, localizacao_origem_id: P01.id, lote_id: L1 }] }));
    const lista = await paraBloquear(m);
    assert.deepStrictEqual(lista.lotes.find((l) => l.lote_id === L1), { lote_id: L1, codigo: 'L1', saldo: 6, livre: 2 });
    await recusaSemGravar(m, bloquear(m, 3, L1), LOTE_SEM_LIVRE('L1', 2));
    await ok(bloquear(m, 2, L1));
  });

  // ---------------------------------------------------------------- RN-249.03
  await test('[RN-249.03] ordem: lote_id invalido -> formato; inexistente / de outro material -> as do motor; material antes do lote', async () => {
    const { m, L1 } = await cenario({ l1: 4, l2: 0 });
    const outro = await cenario();
    for (const v of ['x', 0, 1.5, -2]) {
      await recusaSemGravar(m, bloquear(m, 1, v), 'lote_id deve ser um número inteiro positivo');
    }
    await recusaSemGravar(m, bloquear(m, 1, 99999999), 'Lote nao encontrado');
    await recusaSemGravar(m, bloquear(m, 1, outro.L1), 'O lote informado pertence a outro material');
    // material: so L1 4 -> pedir 5 em L1 da a do material (livre do lote 4 tambem nao cobre: a do material vem primeiro)
    await recusaSemGravar(m, bloquear(m, 5, L1), 'Saldo disponível insuficiente para bloquear: 4 UN');
    // metade positiva: 4 cabe nos dois
    await ok(bloquear(m, 4, L1));
  });

  // ---------------------------------------------------------------- RN-249.04
  await test('[RN-249.04] bloquear 2 em L1 -> desbloquear "sem lote" 2 -> 400 M1; desbloquear L1 2 -> 200, L1 0', async () => {
    const { m, L1 } = await cenario();
    await ok(bloquear(m, 2, L1));
    await recusaSemGravar(m, desbloquear(m, 2), 'Informe o lote: só 0 UN bloqueado(s) sem lote — o resto está em lote (L1: 2)');
    await ok(desbloquear(m, 2, L1));
    assert.deepStrictEqual(await porLote(m), { material_id: m.id, total: 0, sem_lote: 0, lotes: [] });
  });

  // ---------------------------------------------------------------- RN-249.05
  await test('[RN-249.05] estornar o BLOQUEIO avulso com L1 -> 200, L1 some; L1 2 + sem lote 2, desbloqueia L1, estorna o de L1 -> 400 M3', async () => {
    const { m, L1 } = await cenario();
    await ok(bloquear(m, 2, L1));
    const bl = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'BLOQUEIO' ORDER BY id DESC", [m.id]);
    await ok(adm.post(`${API}/movimentacoes/${bl.id}/cancelar`, { motivo: 'estorno 249' }));
    assert.deepStrictEqual(await porLote(m), { material_id: m.id, total: 0, sem_lote: 0, lotes: [] });
    await ok(bloquear(m, 2, L1));
    await ok(bloquear(m, 2));
    await ok(desbloquear(m, 2, L1));
    const bl2 = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'BLOQUEIO' AND lote_id = ? AND cancelado = 0",
      [m.id, L1]);
    const r = await adm.post(`${API}/movimentacoes/${bl2.id}/cancelar`, { motivo: 'estorno 249 b' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Não é possível estornar: o bloqueio do lote L1 já foi desfeito (bloqueado no lote: 0 UN)');
    assert.strictEqual(await bloqueada(m), 2);
  });

  // ---------------------------------------------------------------- RN-249.06
  await test('[RN-249.06] bloquear 2 em L1 (L1 4, L2 4): o retido por lote diz L1 2; o "Sai de" ve L1 com 2 livres', async () => {
    const { m, L1, L2 } = await cenario();
    await ok(bloquear(m, 2, L1));
    const ret = await retidoDoLote.retidoPorLote(db, m.id);
    assert.deepStrictEqual([...ret.entries()], [[L1, 2]]);
    const saldos = (await ok(adm.get(`${API}/estoque/${m.id}/saldos`))).body;
    const doL1 = saldos.find((s) => s.lote_id === L1);
    assert.strictEqual(doL1.lote_livre, 2, JSON.stringify(doL1));
    assert.strictEqual(doL1.lote_bloqueado, 2);
    assert.strictEqual(saldos.find((s) => s.lote_id === L2).lote_livre, null, 'L2 sem peca presa: null (metade positiva: a linha existe)');
  });

  // ---------------------------------------------------------------- RN-249.07 e RN-249.20 (NC)
  // A reprovacao 3 de L1 bloqueada SEM lote no livro (o lote pela inspecao, B1418), como o motor deixa a decisao da inspecao.
  const comReprovacao = async ({ reprovada = 3 } = {}) => {
    const m = await material();
    await entrar(m, 10, 'L1');
    const L1 = await loteId(m, 'L1');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = COALESCE(quantidade_bloqueada,0) + ? WHERE id = ?', [reprovada, m.id]);
    const rec = await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal) VALUES (?,?,?)',
      [`REC-249-${++seq}`, 'RECEBIDO', `NF-249-${seq}`]);
    const it = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
        quantidade_recebida, lote_id, lote) VALUES (?,?,?,?,?,?)`, [rec.lastID, m.id, 10, 10, L1, 'L1']);
    const insp = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado (recebimento_item_id, conforme, quantidade_aprovada,
        quantidade_reprovada, responsavel_id, responsavel_nome) VALUES (?,?,?,?,?,?)`, [it.lastID, 0, 10 - reprovada, reprovada, QUALIDADE.id, QUALIDADE.nome]);
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, insp.lastID);
    assert.ok(doc && doc.id, 'premissa: a NC automatica abriu');
    return { m, L1, ncId: doc.id };
  };
  const decidir = (id, decisao = 'ACEITAR') => nc.decidirNaoConformidade(db, QUALIDADE, id, { decisao, justificativa: 'aceito 249' });

  await test('[RN-249.07] reprovacao 3 (sem lote) + bloqueio avulso 2 em L1: aceitar a NC libera os 3; L1 2 continua bloqueado', async () => {
    const { m, L1, ncId } = await comReprovacao();
    await ok(bloquear(m, 2, L1));
    assert.deepStrictEqual(await porLote(m), { material_id: m.id, total: 5, sem_lote: 3, lotes: [{ lote_id: L1, codigo: 'L1', quantidade: 2 }] });
    const res = await decidir(ncId);
    assert.strictEqual(res.liberacao.efeito, 'LIBERADA', JSON.stringify(res.liberacao));
    assert.deepStrictEqual(await porLote(m), { material_id: m.id, total: 2, sem_lote: 0, lotes: [{ lote_id: L1, codigo: 'L1', quantidade: 2 }] });
  });

  await test('[RN-249.20] (C501) o "Sem lote" consumido pelo Desbloquear: aceitar a NC -> a frase propria, NC ABERTA, nada liberado; o Desbloquear continua com a M1', async () => {
    const { m, L1, ncId } = await comReprovacao();
    await ok(bloquear(m, 2, L1));
    await ok(desbloquear(m, 1)); // "Sem lote" 3 -> 2
    let erro = null;
    try { await decidir(ncId, 'ACEITAR_SOB_DESVIO'); } catch (e) { erro = e; }
    assert.ok(erro, 'a decisao deveria ser recusada');
    assert.strictEqual(erro.status, 400);
    assert.strictEqual(erro.message, 'Não é possível liberar pela não conformidade: só 2 UN do bloqueado está sem lote e a reprovação tem 3 UN'
      + ' — parte dela pode já ter sido liberada pelo Desbloquear (o resto do bloqueado está em lote: L1: 2). Bloqueie de novo, sem lote,'
      + ' o que falta e aceite outra vez, ou registre outra decisão');
    const doc = await dbGet(db, 'SELECT status, decisao FROM nao_conformidades_almoxarifado WHERE id = ?', [ncId]);
    assert.deepStrictEqual([doc.status, doc.decisao], ['ABERTA', null]);
    assert.strictEqual(await bloqueada(m), 4);
    // metade positiva: pela tela de Inspecoes a frase continua a M1
    await recusaSemGravar(m, desbloquear(m, 3), 'Informe o lote: só 2 UN bloqueado(s) sem lote — o resto está em lote (L1: 2)');
  });

  // O total abaixo da reprovacao nao e recusa: e a RN-11 da 44 (o pool drenado por fora) — a decisao e gravada sem liberar. Nao muda.
  await test('[RN-249.20 total] o total abaixo da reprovacao continua a RN-11 da 44: decisao gravada, SEM_BLOQUEIO drenado, nada liberado', async () => {
    const { m, ncId } = await comReprovacao();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 1 WHERE id = ?', [m.id]);
    const res = await decidir(ncId);
    assert.deepStrictEqual([res.status, res.liberacao.efeito, res.liberacao.mensagem], ['DECIDIDA', 'SEM_BLOQUEIO',
      'O material já havia sido desbloqueado fora do documento — a decisão foi registrada sem liberar saldo']);
    assert.strictEqual(await bloqueada(m), 1);
  });

  // Fase 2 achado 1: a familia da reprovacao "cai" (B1436) quando o Desbloquear "Sem lote" come parte dela — a regua da entrega deixa de
  // reter a reprovada em L1; a do bloqueio usa as parcelas cruas e continua sem deixar bloquear a peca reprovada.
  await test('[RN-249.02 familia] L1 4 com 3 reprovadas (sem lote no livro), L2 4; Desbloquear "Sem lote" 1: L1 livre 1 (nao 4); bloquear 2 em L1 -> 400', async () => {
    const m = await material();
    await entrar(m, 4, 'L1'); await entrar(m, 4, 'L2');
    const L1 = await loteId(m, 'L1');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 3 WHERE id = ?', [m.id]);
    const rec = await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal) VALUES (?,?,?)',
      [`REC-249-${++seq}`, 'RECEBIDO', `NF-249-${seq}`]);
    const it = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
        quantidade_recebida, lote_id, lote) VALUES (?,?,?,?,?,?)`, [rec.lastID, m.id, 4, 4, L1, 'L1']);
    await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado (recebimento_item_id, conforme, quantidade_aprovada,
        quantidade_reprovada, responsavel_id, responsavel_nome) VALUES (?,?,?,?,?,?)`, [it.lastID, 0, 1, 3, QUALIDADE.id, QUALIDADE.nome]);
    await ok(desbloquear(m, 1));
    // premissa: a regua da entrega (familia cortada) ja nao retem a reprovada em L1
    assert.strictEqual((await retidoDoLote.situacaoDosLotes(db, m.id)).get(L1).livre, 4, 'premissa: a familia caiu na regua da entrega');
    assert.strictEqual((await paraBloquear(m)).lotes.find((l) => l.lote_id === L1).livre, 1);
    await recusaSemGravar(m, bloquear(m, 2, L1), LOTE_SEM_LIVRE('L1', 1));
    await ok(bloquear(m, 1, L1));
  });

  // ---------------------------------------------------------------- RN-249.11
  await test('[RN-249.11] material sem controle de lote, ou com serie: GET lotes [] e o POST com lote_id -> 400; sem lote_id passa', async () => {
    const MSG = 'Bloquear indicando o lote só vale para material com controle por lote e sem número de série';
    const semControle = await material({ lote: 0 });
    await entrar(semControle, 4, 'L1');
    const L1 = await loteId(semControle, 'L1');
    assert.deepStrictEqual(await paraBloquear(semControle), { material_id: semControle.id, lotes: [] });
    await recusaSemGravar(semControle, bloquear(semControle, 1, L1), MSG);
    await ok(bloquear(semControle, 1));
    const comSerie = await material();
    await entrar(comSerie, 2, 'S1');
    const S1 = await loteId(comSerie, 'S1');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_serie = 1 WHERE id = ?', [comSerie.id]);
    assert.deepStrictEqual(await paraBloquear(comSerie), { material_id: comSerie.id, lotes: [] });
    await recusaSemGravar(comSerie, bloquear(comSerie, 1, S1), MSG);
    // a ordem: o formato do lote_id vem antes
    await recusaSemGravar(comSerie, bloquear(comSerie, 1, 'x'), 'lote_id deve ser um número inteiro positivo');
  });

  // Fase 2 achado 2 (DECLARADO, aviso C): a Saida avulsa com lote nao confere o bloqueado do lote (como a quarentena da 209). Este teste
  // prende o comportamento de hoje — quando a saida passar a respeitar o lote, ele tem de mudar junto com o aviso.
  await test('[RN-249.06 saida, declarado] bloquear 2 em L1 (L1 4, L2 4): a Saida avulsa de 4 em L1 passa (o livro continua dizendo L1 2)', async () => {
    const { m, L1 } = await cenario();
    await ok(bloquear(m, 2, L1));
    await ok(adm.post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'SAIDA', quantidade: 4, motivo: 'e249', justificativa: 'saida 249',
      localizacao_origem_id: P01.id, lote_id: L1 }), 201);
    assert.deepStrictEqual((await porLote(m)).lotes, [{ lote_id: L1, codigo: 'L1', quantidade: 2 }]);
  });

  // ---------------------------------------------------------------- RN-249.08
  await test('[RN-249.08] dois bloqueios simultaneos de 3 em L1 (L1 4, L2 4): um 200, um 400 do lote; bloqueado 3, L1 3', async () => {
    const { m, L1 } = await cenario();
    const rs = await Promise.all([bloquear(m, 3, L1), bloquear(m, 3, L1)]);
    assert.deepStrictEqual(rs.map((r) => r.status).sort(), [200, 400], JSON.stringify(rs.map((r) => r.body)));
    assert.strictEqual(rs.find((r) => r.status === 400).body.error, LOTE_SEM_LIVRE('L1', 1));
    assert.strictEqual(await bloqueada(m), 3);
    assert.deepStrictEqual((await porLote(m)).lotes, [{ lote_id: L1, codigo: 'L1', quantidade: 3 }]);
  });

  // ---------------------------------------------------------------- RN-249.09
  await test('[RN-249.09] GET /lotes-para-bloquear: o contrato, so lote com saldo, o mesmo numero da guarda; inexistente -> 404; fixture da tela', async () => {
    const { m, L1, L2 } = await cenario({ l1: 4, l2: 5 });
    await entrar(m, 3, 'L3');
    const L3 = await loteId(m, 'L3');
    await ok(adm.post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'SAIDA', quantidade: 3, motivo: 'e249', justificativa: 'zera L3',
      localizacao_origem_id: P01.id, lote_id: L3 }), 201);
    await ok(bloquear(m, 1, L1));
    const body = await paraBloquear(m);
    assert.deepStrictEqual(body, { material_id: m.id, lotes: [
      { lote_id: L1, codigo: 'L1', saldo: 4, livre: 3 }, { lote_id: L2, codigo: 'L2', saldo: 5, livre: 5 }] });
    await recusaSemGravar(m, bloquear(m, 4, L1), LOTE_SEM_LIVRE('L1', 3));
    await ok(bloquear(m, 3, L1));
    const nao = await adm.get(`${API}/materiais/99999999/lotes-para-bloquear`);
    assert.strictEqual(nao.status, 404);
    assert.strictEqual(nao.body.error, 'Material não encontrado');
    if (GRAVAR) {
      fs.writeFileSync(FIXTURE, `${JSON.stringify(body, null, 2)}\n`);
      console.log(`  (fixture regravada: ${FIXTURE})`);
    }
    assert.ok(fs.existsSync(FIXTURE), `fixture ausente: ${FIXTURE} (gere com CRM_GRAVAR_FIXTURE=1)`);
    const fx = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    assert.deepStrictEqual(Object.keys(fx).sort(), Object.keys(body).sort(), 'a fixture da tela nao tem as chaves da rota — regrave');
    assert.deepStrictEqual(Object.keys(fx.lotes[0]).sort(), Object.keys(body.lotes[0]).sort(), 'as chaves do lote na fixture — regrave');
  });

  await test('[RN-249.09 permissao] sem perfil (PRODUCAO) le o GET (visualizar) e nao bloqueia (ajustar_estoque -> 403)', async () => {
    const { m, L1 } = await cenario();
    const g = await como('S').get(`${API}/materiais/${m.id}/lotes-para-bloquear`);
    assert.strictEqual(g.status, 200, JSON.stringify(g.body));
    const b = await como('S').post(`${API}/materiais/${m.id}/bloquear`, { quantidade: 1, justificativa: 'x', lote_id: L1 });
    assert.strictEqual(b.status, 403, JSON.stringify(b.body));
  });

  terminou = true;
  await close();
  console.log(`\n  ${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
