/**
 * Etapa 101 (T2, C202) — a criacao e o envio recusam fracao de material com controle por serie.
 *
 * Pedir 1,5 de um material com `controle_serie = 1` era aceito: a separacao so leva quantidade inteira
 * de material com serie (cada unidade e um numero de serie), entao o 0,5 ficava preso para sempre na
 * requisicao. Agora `createRequisicao` (as duas rotas de criacao e a copia; rascunho inclusive) recusa a
 * quantidade arredondada (`Q.qtd`) nao inteira com 400 S1 ANTES de qualquer escrita, e o
 * `POST /api/almoxarifado/requisicoes/:id/enviar` recusa o rascunho legado com a mesma literal (status
 * continua RASCUNHO).
 *
 * RN-08, RN-09. Plano: docs/superpowers/plans/2026-10-15-almoxarifado-etapa101-em-separacao-vazia-tem-saida.md (T2)
 *
 * Executar: cd server && node tests/api/requisicaoSerieInteira.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const requisitionCreateService = require('../../services/almoxarifado/requisitionCreateService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Adm 101T2', role: 'admin', is_superadmin: 1, email: 'a101t2@t.com' };
const S = { id: 10121, nome: 'Solicitante 101T2', role: 'user', email: 's101t2@t.com' }; // sem perfil
// Literal congelada do plano (Contrato, S1).
const S1 = (nome, q) => `${nome}: material com controle de série exige quantidade inteira na requisição (informado: ${q})`;
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 101 (T2): a criacao e o envio recusam fracao de material com serie (C202) ===\n');
  const { app, db, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };

  const material = async (serie) => {
    const c = `E101T2-${++seq}`;
    const nome = `Mat ${c}${serie ? ' serie' : ''}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, material_critico, controle_serie)
      VALUES (?, ?, 'PC', 10, 0, 1, 0, ?)`, [c, nome, serie ? 1 : 0])).lastID;
    return { id, nome };
  };
  const corpo = (itens, extra = {}) => ({
    setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-101T2', itens, ...extra,
  });
  const contar = async () => ({
    req: Number((await dbGet(db, 'SELECT COUNT(*) n FROM requisicoes_almoxarifado')).n),
    itens: Number((await dbGet(db, 'SELECT COUNT(*) n FROM itens_requisicao_almoxarifado')).n),
  });
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const postOutros = (u, body) => as(u, () => request(app).post('/api/requisicoes-material').send(body).then((x) => x));
  const postAlmox = (u, body) => as(u, () => request(app).post('/api/almoxarifado/requisicoes').send(body).then((x) => x));
  const recusaSemGravar = async (fn, esperado) => {
    const antes = await contar();
    const r = await fn();
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, esperado);
    assert.deepStrictEqual(await contar(), antes, 'gravou algo apesar da recusa');
  };

  // ══════════════ RN-08 — a criacao recusa ══════════════
  await test('[101 RN-08] POST /api/requisicoes-material com 1,5 de serie -> 400 S1, nada gravado', async () => {
    const m = await material(true);
    await recusaSemGravar(() => postOutros(S, corpo([{ material_id: m.id, quantidade: 1.5 }])), S1(m.nome, 1.5));
  });

  await test('[101 RN-08] POST /api/almoxarifado/requisicoes com 1,5 de serie -> 400 S1, nada gravado', async () => {
    const m = await material(true);
    await recusaSemGravar(() => postAlmox(ADMIN, corpo([{ material_id: m.id, quantidade: 1.5 }])), S1(m.nome, 1.5));
  });

  await test('[101 RN-08] rascunho (salvar_rascunho: true) com 1,5 de serie -> 400 S1, nada gravado', async () => {
    const m = await material(true);
    await recusaSemGravar(
      () => postAlmox(ADMIN, corpo([{ material_id: m.id, quantidade: 1.5 }], { salvar_rascunho: true })),
      S1(m.nome, 1.5));
  });

  await test('[101 RN-08] dois itens: o 1o comum 1,5 (aceito por si), o 2o de serie 2,5 -> S1 com o nome do 2o, nada gravado', async () => {
    const comum = await material(false);
    const serie = await material(true);
    await recusaSemGravar(() => postAlmox(ADMIN, corpo([
      { material_id: comum.id, quantidade: 1.5 },
      { material_id: serie.id, quantidade: 2.5 },
    ])), S1(serie.nome, 2.5));
  });

  await test('[101 RN-08] servico createRequisicao direto com 1,5 de serie -> lanca status 400 S1, nada gravado', async () => {
    const m = await material(true);
    const antes = await contar();
    let erro = null;
    try {
      await requisitionCreateService.createRequisicao(db, S, corpo([{ material_id: m.id, quantidade: 1.5 }]), { modulo: 'teste' });
    } catch (e) { erro = e; }
    assert.ok(erro, 'o servico aceitou 1,5 de material com serie');
    assert.strictEqual(erro.status, 400);
    assert.strictEqual(erro.message, S1(m.nome, 1.5));
    assert.deepStrictEqual(await contar(), antes);
  });

  await test('[101 RN-08] serie com 2 -> 201, item gravado com 2', async () => {
    const m = await material(true);
    const r = await postAlmox(ADMIN, corpo([{ material_id: m.id, quantidade: 2 }]));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const it = await dbGet(db, 'SELECT quantidade_solicitada q FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [r.body.id]);
    assert.strictEqual(Number(it.q), 2);
  });

  await test('[101 RN-08] serie com 1,0000001 -> 201 (arredonda a 1), item gravado com 1', async () => {
    const m = await material(true);
    const r = await postOutros(S, corpo([{ material_id: m.id, quantidade: 1.0000001 }]));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const it = await dbGet(db, 'SELECT quantidade_solicitada q FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [r.body.id]);
    assert.strictEqual(Number(it.q), 1);
  });

  await test('[101 RN-08] material SEM serie com 1,5 -> 201 (so a serie exige inteiro)', async () => {
    const m = await material(false);
    const r = await postOutros(S, corpo([{ material_id: m.id, quantidade: 1.5 }]));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const it = await dbGet(db, 'SELECT quantidade_solicitada q FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [r.body.id]);
    assert.strictEqual(Number(it.q), 1.5);
  });

  await test('[101 RN-08] copia de requisicao legada (serie 1,5 gravado direto no banco) -> 400 S1, nada gravado', async () => {
    const m = await material(true);
    const cr = await postAlmox(ADMIN, corpo([{ material_id: m.id, quantidade: 2 }]));
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_solicitada = 1.5 WHERE requisicao_id = ?', [cr.body.id]);
    await recusaSemGravar(
      () => as(ADMIN, () => request(app).post(`/api/almoxarifado/requisicoes/${cr.body.id}/copiar`).send({}).then((x) => x)),
      S1(m.nome, 1.5));
  });

  // ══════════════ RN-09 — o envio recusa o legado ══════════════
  const enviar = (u, id) => as(u, () => request(app).post(`/api/almoxarifado/requisicoes/${id}/enviar`).send({}).then((x) => x));

  await test('[101 RN-09] envio de rascunho legado (serie 1,5 gravado direto no banco) -> 400 S1, continua RASCUNHO, sem notificacao', async () => {
    const m = await material(true);
    const cr = await postOutros(S, corpo([{ material_id: m.id, quantidade: 2 }], { salvar_rascunho: true }));
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    assert.strictEqual(await st(cr.body.id), 'RASCUNHO');
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_solicitada = 1.5 WHERE requisicao_id = ?', [cr.body.id]);
    const orig = requisitionCreateService.dispararNotificacoesCriacao;
    let notificou = 0;
    requisitionCreateService.dispararNotificacoesCriacao = async (...a) => { notificou++; return orig(...a); };
    let r;
    try { r = await enviar(S, cr.body.id); } finally { requisitionCreateService.dispararNotificacoesCriacao = orig; }
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, S1(m.nome, 1.5));
    assert.strictEqual(await st(cr.body.id), 'RASCUNHO');
    assert.strictEqual(notificou, 0, 'disparou as notificacoes de envio');
  });

  await test('[101 RN-09] envio de rascunho de serie inteiro -> 200, sai do RASCUNHO', async () => {
    const m = await material(true);
    const cr = await postOutros(S, corpo([{ material_id: m.id, quantidade: 3 }], { salvar_rascunho: true }));
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    const r = await enviar(S, cr.body.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.notStrictEqual(await st(cr.body.id), 'RASCUNHO');
  });

  await test('[101 RN-09] envio de rascunho legado com 1,0000001 de serie no banco -> 200 (Q.qtd arredonda a 1)', async () => {
    const m = await material(true);
    const cr = await postOutros(S, corpo([{ material_id: m.id, quantidade: 1 }], { salvar_rascunho: true }));
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_solicitada = 1.0000001 WHERE requisicao_id = ?', [cr.body.id]);
    const r = await enviar(S, cr.body.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.notStrictEqual(await st(cr.body.id), 'RASCUNHO');
  });

  // ══════════════ a funcao unica (criacao e envio) ══════════════
  await test('[101 RN-08] recusaFracaoDeSerie: cru 1,0000001 -> null; 1,5 -> S1; sem serie 1,5 -> null; o 2o item tambem e olhado', async () => {
    const f = requisitionCreateService.recusaFracaoDeSerie;
    assert.strictEqual(f([{ nome: 'X', controle_serie: 1, quantidade: 1.0000001 }]), null);
    assert.strictEqual(f([{ nome: 'X', controle_serie: 1, quantidade: 1.5 }]), S1('X', 1.5));
    assert.strictEqual(f([{ nome: 'X', controle_serie: 0, quantidade: 1.5 }]), null);
    assert.strictEqual(f([
      { nome: 'A', controle_serie: 1, quantidade: 2 },
      { nome: 'B', controle_serie: 1, quantidade: 0.5 },
    ]), S1('B', 0.5));
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
