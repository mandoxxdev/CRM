/**
 * Etapa 172 (T1) — a requisicao com OS CADASTRADA (opcional) ao lado do texto livre da RN-A.
 *
 * RN-172.02/03 e emendas C2/I2/I4/I6 do plano
 * `docs/superpowers/plans/2026-10-22-almoxarifado-etapa172-requisicao-com-os-cadastrada-e-cesta-com-os.md`:
 * - `os_id` invalido -> 400 `OS inválida` (Zod: `Dados inválidos — os_id: OS inválida`); OS inexistente -> 400
 *   `OS #<id> não encontrada`; ESSA ordem vem antes da `exigirOS` (I6).
 * - Com `os_id`, o servidor grava `os_referencia = numero_os` (C2), na criacao e no rascunho; OS fechada e aceita.
 * - Sem `os_id`, nada muda (RN-172.01: o numero livre continua — `requisicaoExigeOS` trava isso sem mudanca).
 * - `/copiar` leva o `os_id` so se a OS ainda existir (I2).
 * - `GET /api/requisicoes-material/aux/ordens-servico`: so `id, numero_os, status` (I4), OS abertas pela regua
 *   `osFechada` ANTES do LIMIT 300, sem `?incluir` (removido na Fase 5 — ignorado); para quem cria requisicao sem modulo almoxarifado.
 *
 * O harness nao tem `ordens_servico` (tabela core): o teste a cria (depois de provar a rota aux sem ela).
 * Executar: cd server && node tests/api/requisicaoComOsCadastrada.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const requisitionCreateService = require('../../services/almoxarifado/requisitionCreateService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const SOL = { id: 1731, nome: 'Solicitante E172T1', role: 'usuario', perfil_almoxarifado: 'PRODUCAO', email: 'e172t1s@test.com' };
// Usuario da cesta: sem modulo almoxarifado e sem perfil (fallback PRODUCAO) — como o COMERCIAL da T0.
const COMERCIAL = { id: 1732, nome: 'Vendedor E172T1', role: 'usuario', email: 'e172t1c@test.com' };
const ADMIN = { id: 1733, nome: 'Admin E172T1', role: 'admin', is_superadmin: 1, email: 'e172t1a@test.com' };

const LITERAL_OS = 'Informe o número da OS: toda saída de material precisa estar vinculada a uma OS';
const ZOD_OS_INVALIDA = 'Dados inválidos — os_id: OS inválida';
const AUX = '/api/requisicoes-material/aux/ordens-servico';

(async () => {
  console.log('\n═══ Etapa 172 T1: requisicao com OS cadastrada ═══\n');
  const ctx = await createTestApp({ user: { ...SOL } });
  const { app, db, setUser } = ctx;
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...SOL }); } };

  const mat = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, quantidade_minima, quantidade_maxima,
       ponto_reposicao, lote_economico, prazo_reposicao_dias, controle_lote)
     VALUES ('E172T1-M', 'Mat E172T1', 'PC', 100, 1, 0, 0, 0, 0, 0, 0)`)).lastID;
  const contar = async () => (await dbGet(db, 'SELECT COUNT(*) AS n FROM requisicoes_almoxarifado')).n;
  const linha = (id) => dbGet(db, 'SELECT status, os_id, os_referencia FROM requisicoes_almoxarifado WHERE id = ?', [id]);
  // Sem departamento (o setor recusaria o material antes da OS, como em requisicaoExigeOS).
  const corpo = (over = {}) => ({ itens: [{ material_id: mat, quantidade: 1 }], ...over });
  const criarAlmox = (body) => request(app).post('/api/almoxarifado/requisicoes').send(body);
  const criarRm = (body) => request(app).post('/api/requisicoes-material').send({ setor: 'Comercial', ...body });

  // ══════════ I4: rota aux SEM a tabela core (ambiente parcial) ══════════
  await test('[RN-172.08] rota aux sem a tabela ordens_servico (harness/ambiente parcial) -> 200 [] (nao 500)', async () => {
    const r = await as(COMERCIAL, () => request(app).get(AUX));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, []);
  });

  await test('[RN-172.02] sem a tabela ordens_servico, os_id informado -> 400 "OS #5 não encontrada" (nao 500), nada gravado', async () => {
    const antes = await contar();
    const r = await criarAlmox(corpo({ os_id: 5, os_referencia: 'OS 1' }));
    assert.deepStrictEqual([r.status, r.body.error], [400, 'OS #5 não encontrada']);
    assert.strictEqual(await contar(), antes);
  });

  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, cliente_id INTEGER,
    tipo_os TEXT NOT NULL DEFAULT 'producao', status TEXT DEFAULT 'pendente', data_abertura DATE NOT NULL DEFAULT '2026-10-22')`);
  let seq = 0;
  const novaOs = async (status = 'em_andamento') => {
    seq += 1;
    const numero = `OS-E172T1-${seq}`;
    const id = (await dbRun(db, 'INSERT INTO ordens_servico (numero_os, status) VALUES (?, ?)', [numero, status])).lastID;
    return { id, numero };
  };

  // ══════════ RN-172.03 / I6 ══════════
  for (const invalido of ['abc', 0, -1, 1.5, true, '7a', ' ']) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[RN-172.03, I6] os_id ${JSON.stringify(invalido)} -> 400 "OS inválida" nas duas rotas de criacao, mesmo SEM texto (vem antes da exigirOS), nada gravado`, async () => {
      const antes = await contar();
      const a = await criarAlmox(corpo({ os_id: invalido }));
      assert.deepStrictEqual([a.status, a.body.error], [400, ZOD_OS_INVALIDA], JSON.stringify(a.body));
      const b = await criarRm(corpo({ os_id: invalido }));
      assert.deepStrictEqual([b.status, b.body.error], [400, ZOD_OS_INVALIDA], JSON.stringify(b.body));
      assert.strictEqual(await contar(), antes);
    });
  }

  await test('[RN-172.03] servico direto (quem nao passa pelo Zod, como a copia): os_id "abc" -> erro 400 "OS inválida"', async () => {
    await assert.rejects(
      requisitionCreateService.createRequisicao(db, SOL, corpo({ os_id: 'abc', os_referencia: 'OS 1' })),
      (e) => e.status === 400 && e.message === 'OS inválida',
    );
  });

  await test('[RN-172.02, I6] OS inexistente -> 400 "OS #9999 não encontrada", mesmo sem texto (antes da exigirOS), nada gravado', async () => {
    const antes = await contar();
    const a = await criarAlmox(corpo({ os_id: 9999 }));
    assert.deepStrictEqual([a.status, a.body.error], [400, 'OS #9999 não encontrada']);
    const b = await criarRm(corpo({ os_id: '9999', os_referencia: 'qualquer' }));
    assert.deepStrictEqual([b.status, b.body.error], [400, 'OS #9999 não encontrada']);
    assert.strictEqual(await contar(), antes);
  });

  await test('[RN-172.03] os_id null e "" = sem OS: o texto continua obrigatorio (literal da RN-A) e, com texto, grava os_id NULL', async () => {
    for (const vazio of [null, '']) {
      // eslint-disable-next-line no-await-in-loop
      const sem = await criarAlmox(corpo({ os_id: vazio }));
      assert.deepStrictEqual([sem.status, sem.body.error], [400, LITERAL_OS]);
      // eslint-disable-next-line no-await-in-loop
      const com = await criarAlmox(corpo({ os_id: vazio, os_referencia: 'MANUT 22' }));
      assert.strictEqual(com.status, 201, JSON.stringify(com.body));
      // eslint-disable-next-line no-await-in-loop
      assert.deepStrictEqual({ ...(await linha(com.body.id)) }, { status: 'PENDENTE', os_id: null, os_referencia: 'MANUT 22' });
    }
  });

  // ══════════ RN-172.02 / C2 ══════════
  await test('[RN-172.02, C2] os_id com texto VAZIO -> 201, os_id gravado e os_referencia = numero_os (nas duas rotas; string de digitos tambem)', async () => {
    const os = await novaOs();
    const a = await criarAlmox(corpo({ os_id: os.id }));
    assert.strictEqual(a.status, 201, JSON.stringify(a.body));
    assert.deepStrictEqual({ ...(await linha(a.body.id)) }, { status: 'PENDENTE', os_id: os.id, os_referencia: os.numero });
    const b = await criarRm(corpo({ os_id: String(os.id), os_referencia: '   ' }));
    assert.strictEqual(b.status, 201, JSON.stringify(b.body));
    assert.deepStrictEqual({ ...(await linha(b.body.id)) }, { status: 'PENDENTE', os_id: os.id, os_referencia: os.numero });
  });

  await test('[C2] os_id com texto DIGITADO diferente -> o servidor sobrescreve com o numero_os (o seletor e a fonte forte)', async () => {
    const os = await novaOs();
    const r = await criarAlmox(corpo({ os_id: os.id, os_referencia: 'OS 42 do papel' }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual({ ...(await linha(r.body.id)) }, { status: 'PENDENTE', os_id: os.id, os_referencia: os.numero });
  });

  await test('[RN-172.02] OS FECHADA (cancelado, concluida) NAO e recusada na requisicao', async () => {
    for (const status of ['cancelado', ' Concluida ']) {
      // eslint-disable-next-line no-await-in-loop
      const os = await novaOs(status);
      // eslint-disable-next-line no-await-in-loop
      const r = await criarAlmox(corpo({ os_id: os.id }));
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual((await linha(r.body.id)).os_id, os.id);
    }
  });

  await test('[C2, I6] RASCUNHO com os_id e sem texto: grava os_id e o texto preenchido; /enviar passa (a RN-A ve o numero)', async () => {
    const os = await novaOs();
    const r = await criarAlmox(corpo({ os_id: os.id, salvar_rascunho: true }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual({ ...(await linha(r.body.id)) }, { status: 'RASCUNHO', os_id: os.id, os_referencia: os.numero });
    const e = await request(app).post(`/api/almoxarifado/requisicoes/${r.body.id}/enviar`).send({});
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    const depois = await linha(r.body.id);
    assert.notStrictEqual(depois.status, 'RASCUNHO');
    assert.deepStrictEqual([depois.os_id, depois.os_referencia], [os.id, os.numero]);
  });

  await test('[RN-172.01] sem os_id o numero livre continua aceito e os_id fica NULL (rascunho sem nada tambem)', async () => {
    const r = await criarAlmox(corpo({ os_referencia: 'OS-QUE-NAO-EXISTE-9999' }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual({ ...(await linha(r.body.id)) }, { status: 'PENDENTE', os_id: null, os_referencia: 'OS-QUE-NAO-EXISTE-9999' });
    const ras = await criarAlmox(corpo({ salvar_rascunho: true }));
    assert.strictEqual(ras.status, 201, JSON.stringify(ras.body));
    assert.deepStrictEqual({ ...(await linha(ras.body.id)) }, { status: 'RASCUNHO', os_id: null, os_referencia: null });
  });

  // ══════════ RN-172.06 / I2 ══════════
  await test('[RN-172.06] copiar requisicao com OS cadastrada: o rascunho copiado leva os_id e o numero', async () => {
    const os = await novaOs();
    const orig = await criarAlmox(corpo({ os_id: os.id }));
    const c = await request(app).post(`/api/almoxarifado/requisicoes/${orig.body.id}/copiar`).send({});
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    assert.deepStrictEqual({ ...(await linha(c.body.id)) }, { status: 'RASCUNHO', os_id: os.id, os_referencia: os.numero });
  });

  await test('[I2] copiar com a OS EXCLUIDA depois: a copia nao falha, leva so o texto (os_id NULL)', async () => {
    const os = await novaOs();
    const orig = await criarAlmox(corpo({ os_id: os.id }));
    await dbRun(db, 'DELETE FROM ordens_servico WHERE id = ?', [os.id]);
    const c = await request(app).post(`/api/almoxarifado/requisicoes/${orig.body.id}/copiar`).send({});
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    assert.deepStrictEqual({ ...(await linha(c.body.id)) }, { status: 'RASCUNHO', os_id: null, os_referencia: os.numero });
  });

  await test('[RN-172.06] copiar requisicao SEM os_id: como antes (texto, os_id NULL)', async () => {
    const orig = await criarAlmox(corpo({ os_referencia: 'MANUT 22' }));
    const c = await request(app).post(`/api/almoxarifado/requisicoes/${orig.body.id}/copiar`).send({});
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    assert.deepStrictEqual({ ...(await linha(c.body.id)) }, { status: 'RASCUNHO', os_id: null, os_referencia: 'MANUT 22' });
  });

  // ══════════ RN-172.08 / I4 ══════════
  await test('[RN-172.08, I4] rota aux para quem NAO tem modulo almoxarifado: 200, so id/numero_os/status, so OS abertas; nao cai na /:id', async () => {
    const aberta = await novaOs('em_andamento');
    const fechada = await novaOs(' Cancelado ');
    const r = await as(COMERCIAL, () => request(app).get(AUX));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.ok(Array.isArray(r.body), JSON.stringify(r.body));
    const ids = r.body.map((o) => Number(o.id));
    assert.ok(ids.includes(aberta.id), 'a OS aberta esta na lista');
    assert.ok(!ids.includes(fechada.id), 'a OS fechada nao esta (regua osFechada: caixa e espacos ignorados)');
    for (const o of r.body) assert.deepStrictEqual(Object.keys(o).sort(), ['id', 'numero_os', 'status'], JSON.stringify(o));
  });

  // Fase 5 da 172: o `?incluir` saiu (nenhum client usava; deixava qualquer logado ler numero e status de OS fechada
  // por id). O parametro e IGNORADO: a fechada nao vem nem pedida pelo id. Metade positiva: a aberta continua vindo.
  await test('[RN-172.08, I4, Fase 5] ?incluir=<id da fechada> e IGNORADO: a fechada nao vem; a aberta continua', async () => {
    const fechada = await novaOs('concluido');
    const aberta = await novaOs('aberta');
    const r = await as(COMERCIAL, () => request(app).get(AUX).query({ incluir: String(fechada.id) }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.ok(!r.body.some((o) => Number(o.id) === fechada.id), 'a fechada nao vem pelo ?incluir');
    assert.ok(r.body.some((o) => Number(o.id) === aberta.id), 'a aberta vem');
  });

  await test('[I4] o filtro de fechadas vem ANTES do LIMIT 300: uma OS aberta antiga aparece com 300 fechadas mais novas', async () => {
    const antiga = await novaOs('pendente');
    for (let i = 0; i < 301; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await novaOs('cancelada');
    }
    // SEM incluir: a aberta antiga so aparece se o filtro vier antes do LIMIT (controle S2b: filtrar depois a perde).
    const semIncluir = await as(COMERCIAL, () => request(app).get(AUX));
    assert.strictEqual(semIncluir.status, 200);
    assert.ok(semIncluir.body.some((o) => Number(o.id) === antiga.id), 'a aberta antiga aparece sem precisar de incluir');
    assert.ok(semIncluir.body.every((o) => !/cancelad/i.test(o.status)), 'nenhuma fechada');
  });

  // ══════════ a cesta com o seletor ══════════
  await test('[RN-172.07, servidor] o payload da cesta + os_id (sem texto) passa: 201 PENDENTE com os_referencia = numero_os', async () => {
    const os = await novaOs();
    const r = await as(COMERCIAL, () => request(app).post('/api/requisicoes-material').send({
      setor: 'Comercial', departamento: 'Comercial', modulo_origem: 'comercial', observacoes: '', tipo_requisicao: 'CONSUMO',
      justificativa: '', salvar_rascunho: false, os_id: String(os.id), itens: [{ material_id: mat, quantidade: 1 }],
    }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual({ ...(await linha(r.body.id)) }, { status: 'PENDENTE', os_id: os.id, os_referencia: os.numero });
  });

  await test('[admin] o detalhe da requisicao devolve o os_id (GET /api/requisicoes-material/:id)', async () => {
    const os = await novaOs();
    const r = await criarAlmox(corpo({ os_id: os.id }));
    const d = await as(ADMIN, () => request(app).get(`/api/requisicoes-material/${r.body.id}`));
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    const reqBody = d.body.requisicao || d.body;
    assert.strictEqual(Number(reqBody.os_id), os.id, JSON.stringify(d.body).slice(0, 300));
  });

  await ctx.close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
