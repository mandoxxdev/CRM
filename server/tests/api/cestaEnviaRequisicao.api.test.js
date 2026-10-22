/**
 * Etapa 172, T0 — prova POR EXECUCAO do achado da cesta (plano
 * `docs/superpowers/plans/2026-10-22-almoxarifado-etapa172-requisicao-com-os-cadastrada-e-cesta-com-os.md`).
 *
 * O que a cesta faz HOJE (lido do client, nao suposto):
 * - `RequisicaoMaterialCesta.js` monta o catalogo com `GET /requisicoes-material/materiais?setor=<setor>` e envia com
 *   UM so request: `POST /requisicoes-material` com `{ setor, departamento: setor, modulo_origem, observacoes,
 *   tipo_requisicao, justificativa, [data_necessidade], salvar_rascunho: false, itens: [{ material_id, quantidade }] }`.
 *   Nao ha campo de OS e o payload nao tem `os_referencia`.
 * - Nao ha rascunho + `/enviar` no caminho da cesta: o botao "Salvar rascunho" so aparece em `ctx.warehouseMode`, e
 *   `RequisicoesMaterialPages.js` forca `warehouseMode: false` (inclusive no modulo almoxarifado). O `/enviar`
 *   (`RequisicoesList.js`, `POST /almoxarifado/requisicoes/:id/enviar`) e so da lista do almoxarife.
 * - Usuario tipico: modulo comercial/administrativo, sem modulo almoxarifado e sem `perfil_almoxarifado` (fallback
 *   PRODUCAO). A rota `/api/requisicoes-material` nao tem portao de modulo nem `requirePermission` — em producao e
 *   registrada so com `authenticateToken` (`index.js`, "cross-modulo — qualquer usuario autenticado"), e o harness
 *   a monta igual (so `fakeAuth`). O cenario 0 trava essa premissa: se alguem puser portao de modulo na rota em
 *   producao, este arquivo deixa de medir o que mede e falha avisando.
 *
 * Medido: o envio da cesta e recusado com 400 pela RN-A (`exigirOS`) — a cesta esta QUEBRADA para enviar, e o usuario
 * nao tem onde digitar a OS. Com `os_referencia` no mesmo payload, passa (201, PENDENTE): a unica barreira e a OS.
 *
 * Executar: cd server && node tests/api/cestaEnviaRequisicao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// Usuario de modulo da cesta, sem modulo almoxarifado e sem perfil (getPerfilFromUser -> PRODUCAO).
const COMERCIAL = { id: 1721, nome: 'Vendedor E172', role: 'usuario', email: 'vendas@test.com' };
const ADMINISTRATIVO = { id: 1722, nome: 'Adm E172', role: 'usuario', email: 'adm@test.com' };

const LITERAL_OS = 'Informe o número da OS: toda saída de material precisa estar vinculada a uma OS';

const RAIZ = path.join(__dirname, '..', '..', '..');
const lerFonte = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

// O payload LITERAL do `submit(false)` da cesta (RequisicaoMaterialCesta.js), com `ctx` do modulo.
function payloadDaCesta({ setor, moduloOrigem, materialId, quantidade = 1, tipo = 'CONSUMO', justificativa = '', dataNecessidade = '' }) {
  return {
    setor,
    departamento: setor,
    modulo_origem: moduloOrigem,
    observacoes: '',
    tipo_requisicao: tipo,
    justificativa,
    ...(dataNecessidade ? { data_necessidade: dataNecessidade } : {}),
    salvar_rascunho: false,
    itens: [{ material_id: materialId, quantidade }],
  };
}

(async () => {
  console.log('\n═══ Etapa 172 T0: a cesta consegue enviar uma requisicao? ═══\n');
  const ctx = await createTestApp({ user: COMERCIAL });
  const { app, db, setUser } = ctx;

  // Sem familia/categoria: o filtro de setor administrativo aceita (`buildTipoUsoAllowClause`), como o catalogo.
  const mat = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, quantidade_minima, quantidade_maxima,
       ponto_reposicao, lote_economico, prazo_reposicao_dias, controle_lote)
     VALUES ('E172-CESTA', 'Caneta E172', 'UN', 50, 1, 0, 0, 0, 0, 0, 0)`);
  const materialId = mat.lastID;
  const contarReqs = async () => (await dbGet(db, 'SELECT COUNT(*) AS n FROM requisicoes_almoxarifado')).n;

  console.log('Premissas (o teste mede o fluxo de verdade)');

  await test('0a. producao registra /api/requisicoes-material SO com authenticateToken (sem portao de modulo) — o harness e fiel', async () => {
    const indexJs = lerFonte('server/index.js');
    assert.ok(/require\('\.\/routes\/requisicoesMaterial'\)\(rotasModulos, db, authenticateToken\);/.test(indexJs),
      'registro da rota mudou em index.js — reavaliar se o harness (so fakeAuth) ainda mede o portao real');
    const rota = lerFonte('server/routes/requisicoesMaterial.js');
    assert.ok(!/checkModulePermission|requirePermission/.test(rota),
      'a rota passou a ter portao de modulo/perfil — este teste nao o exerce');
  });

  await test('0b. a cesta envia por POST /requisicoes-material, sem rascunho fora do warehouseMode, e forca warehouseMode false', async () => {
    const cesta = lerFonte('client/src/components/almoxarifado/RequisicaoMaterialCesta.js');
    assert.ok(cesta.includes("api.post('/requisicoes-material', {"), 'a cesta mudou de porta de envio');
    assert.ok(/\{ctx\.warehouseMode && \(/.test(cesta), 'o botao de rascunho deixou de depender de warehouseMode');
    const paginas = lerFonte('client/src/components/almoxarifado/RequisicoesMaterialPages.js');
    assert.ok(paginas.includes('warehouseMode: false'), 'as paginas deixaram de forcar warehouseMode false');
  });

  await test('0c. a cesta NAO manda os_referencia nem tem campo de OS', async () => {
    const cesta = lerFonte('client/src/components/almoxarifado/RequisicaoMaterialCesta.js');
    // T0 (Etapa 172): comportamento ATUAL medido — a T1/T3 inverte esta assercao
    assert.ok(!/os_referencia/.test(cesta), 'a cesta ja manda os_referencia — inverter (T3 entregue?)');
  });

  await test('0d. o catalogo da cesta (GET /requisicoes-material/materiais?setor=Comercial) lista o material', async () => {
    setUser(COMERCIAL);
    const r = await request(app).get('/api/requisicoes-material/materiais').query({ setor: 'Comercial' });
    assert.strictEqual(r.status, 200, `status ${r.status}: ${JSON.stringify(r.body)}`);
    const lista = Array.isArray(r.body) ? r.body : (r.body.materiais || r.body.data || []);
    assert.ok(lista.some((m) => Number(m.id) === materialId), `material ${materialId} fora do catalogo: ${JSON.stringify(r.body).slice(0, 300)}`);
  });

  console.log('\n(a) o payload atual da cesta');

  const casosA = [
    { nome: 'Comercial (modulo comercial)', user: COMERCIAL, setor: 'Comercial', moduloOrigem: 'comercial' },
    { nome: 'Administrativo (modulo administrativo)', user: ADMINISTRATIVO, setor: 'Administrativo', moduloOrigem: 'administrativo' },
    { nome: 'Administrativo (modulo admin)', user: ADMINISTRATIVO, setor: 'Administrativo', moduloOrigem: 'admin' },
  ];
  for (const c of casosA) {
    // eslint-disable-next-line no-await-in-loop
    await test(`a. ${c.nome}, usuario sem perfil: envio recusado 400 com a literal da RN-A, nada gravado`, async () => {
      setUser(c.user);
      const antes = await contarReqs();
      const r = await request(app).post('/api/requisicoes-material')
        .send(payloadDaCesta({ setor: c.setor, moduloOrigem: c.moduloOrigem, materialId }));
      console.log(`      medido: ${r.status} ${JSON.stringify(r.body)}`);
      // T0 (Etapa 172): comportamento ATUAL medido — a T1/T3 inverte esta assercao
      // (depois da T3 a cesta manda os_referencia e o envio passa: 201 PENDENTE).
      assert.strictEqual(r.status, 400, `esperava 400, veio ${r.status}: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, LITERAL_OS);
      assert.strictEqual(await contarReqs(), antes, 'gravou requisicao apesar do 400');
    });
  }

  await test('a. emergencial com justificativa e prazo (todos os campos da cesta preenchidos): mesmo 400', async () => {
    setUser(COMERCIAL);
    const r = await request(app).post('/api/requisicoes-material').send(payloadDaCesta({
      setor: 'Comercial', moduloOrigem: 'comercial', materialId, quantidade: 2,
      tipo: 'EMERGENCIAL', justificativa: 'cliente parado', dataNecessidade: '2026-10-30',
    }));
    console.log(`      medido: ${r.status} ${JSON.stringify(r.body)}`);
    // T0 (Etapa 172): comportamento ATUAL medido — a T1/T3 inverte esta assercao
    assert.strictEqual(r.status, 400, `esperava 400, veio ${r.status}: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, LITERAL_OS);
  });

  console.log('\n(b) o mesmo payload + os_referencia');

  for (const c of casosA) {
    // eslint-disable-next-line no-await-in-loop
    await test(`b. ${c.nome}, mesmo usuario sem perfil: com os_referencia passa (201 PENDENTE) — a unica barreira e a OS`, async () => {
      setUser(c.user);
      const r = await request(app).post('/api/requisicoes-material')
        .send({ ...payloadDaCesta({ setor: c.setor, moduloOrigem: c.moduloOrigem, materialId }), os_referencia: 'OS 1714' });
      console.log(`      medido: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.status, 201, `status ${r.status}: ${JSON.stringify(r.body)}`);
      const row = await dbGet(db, `SELECT status, os_referencia, solicitante_id, modulo_origem, departamento
        FROM requisicoes_almoxarifado WHERE id = ?`, [r.body.id]);
      assert.strictEqual(row.status, 'PENDENTE');
      assert.strictEqual(row.os_referencia, 'OS 1714');
      assert.strictEqual(row.solicitante_id, c.user.id);
      assert.strictEqual(row.modulo_origem, c.moduloOrigem);
      assert.strictEqual(row.departamento, c.setor);
    });
  }

  await ctx.close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
