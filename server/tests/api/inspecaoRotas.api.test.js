/**
 * Etapa 5, Task 5 — rotas HTTP de inspecao e bloqueio avulso sobre o inspectionService (Task 4).
 *
 * inspectionService ja existe e funciona (inspecaoDecisao.api.test.js cobre o motor direto).
 * Este arquivo cobre so a camada HTTP: permissao certa por rota (inspecionar vs ajustar_estoque),
 * 403 sem permissao SEM mexer no saldo, e 400 com mensagem clara (nao 500) quando falta
 * justificativa em bloqueio/desbloqueio.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };
// Sem role/perfil => getPerfilFromUser cai no fallback PRODUCAO: nao tem `inspecionar`
// nem `ajustar_estoque` — e assim que o 403 e testado (ver permissoesRotas.api.test.js).
const PRODUCAO = { id: 77, nome: 'Chao de Fabrica', role: 'user', email: 'prod@test.com' };

// ── Helpers copiados (padrao do repo: cada arquivo de tests/api/ e autocontido) ──

let seq = 0;
async function novoMaterial(db, qtd = 0, { critico = false } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, material_critico)
     VALUES (?,?,'UN',?,1,?)`,
    [`INSPR-${seq}`, `Material inspecao rotas ${seq}`, qtd, critico ? 1 : 0]);
  return r.lastID;
}

const material = (db, id) => dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
const disponivel = async (db, id) => stockService.getSaldoDisponivel(await material(db, id));

const setConfig = (db, chave, valor) => dbRun(db,
  `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
   ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

async function recebimentoComItem(db, materialId, qtd) {
  const rec = await receiptService.criarRecebimento(db, ADMIN, {
    nota_fiscal: `NF-${Date.now()}-${materialId}`,
    itens: [{ material_id: materialId, quantidade: qtd }],
  });
  return rec.id;
}

// Cria material critico + recebimento + aprova (entra retido, via QUARENTENA), e devolve o
// item pronto para a rota de inspecionar — exercita o fluxo real em vez de fabricar
// quantidade_em_inspecao na mao.
async function itemRetido(db, qtd) {
  await setConfig(db, 'inspecao_material_critico', '1');
  const mat = await novoMaterial(db, 0, { critico: true });
  const recId = await recebimentoComItem(db, mat, qtd);
  await receiptService.aprovarRecebimento(db, ADMIN, recId);
  const item = await dbGet(db,
    'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [recId]);
  return { mat, itemId: item.id, recId };
}

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });

  await test('POST inspecionar sem permissao retorna 403 e nao mexe no saldo', async () => {
    const { mat, itemId } = await itemRetido(db, 10);
    setUser(PRODUCAO);
    try {
      const res = await request(app).post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`)
        .send({ quantidade_aprovada: 10, quantidade_reprovada: 0 });
      assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    } finally { setUser(ADMIN); }
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 10, 'liberou apesar do 403');
  });

  await test('POST inspecionar aprova e o disponivel sobe', async () => {
    const { mat, itemId } = await itemRetido(db, 10);
    const res = await request(app).post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`)
      .send({ quantidade_aprovada: 10, quantidade_reprovada: 0 });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await disponivel(db, mat), 10);
  });

  await test('POST inspecionar com conta que nao fecha retorna 400', async () => {
    const { mat, itemId } = await itemRetido(db, 10);
    const res = await request(app).post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`)
      .send({ quantidade_aprovada: 4, quantidade_reprovada: 2 });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 10, 'mexeu no saldo apesar do 400');
  });

  await test('POST bloquear sem justificativa retorna 400', async () => {
    const mat = await novoMaterial(db, 50);
    const res = await request(app).post(`/api/almoxarifado/materiais/${mat}/bloquear`)
      .send({ quantidade: 5 });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(await disponivel(db, mat), 50);
  });

  await test('POST bloquear sem permissao retorna 403 e nao mexe no saldo', async () => {
    const mat = await novoMaterial(db, 50);
    setUser(PRODUCAO);
    try {
      const res = await request(app).post(`/api/almoxarifado/materiais/${mat}/bloquear`)
        .send({ quantidade: 5, justificativa: 'avaria' });
      assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    } finally { setUser(ADMIN); }
    assert.strictEqual(await disponivel(db, mat), 50, 'bloqueou apesar do 403');
  });

  await test('POST bloquear com justificativa tira do disponivel', async () => {
    const mat = await novoMaterial(db, 50);
    const res = await request(app).post(`/api/almoxarifado/materiais/${mat}/bloquear`)
      .send({ quantidade: 5, justificativa: 'avaria na prateleira' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(await disponivel(db, mat), 45);
  });

  await test('POST desbloquear sem justificativa retorna 400', async () => {
    const mat = await novoMaterial(db, 50);
    await request(app).post(`/api/almoxarifado/materiais/${mat}/bloquear`)
      .send({ quantidade: 5, justificativa: 'avaria' });
    const res = await request(app).post(`/api/almoxarifado/materiais/${mat}/desbloquear`)
      .send({ quantidade: 5 });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(await disponivel(db, mat), 45, 'desbloqueou apesar de faltar justificativa');
  });

  await test('POST desbloquear sem permissao retorna 403 e nao devolve o saldo', async () => {
    const mat = await novoMaterial(db, 50);
    await request(app).post(`/api/almoxarifado/materiais/${mat}/bloquear`)
      .send({ quantidade: 5, justificativa: 'avaria' });
    setUser(PRODUCAO);
    try {
      const res = await request(app).post(`/api/almoxarifado/materiais/${mat}/desbloquear`)
        .send({ quantidade: 5, justificativa: 'quero de volta' });
      assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    } finally { setUser(ADMIN); }
    assert.strictEqual(await disponivel(db, mat), 45, 'desbloqueou apesar do 403');
  });

  await test('POST desbloquear acima do bloqueado retorna 400', async () => {
    const mat = await novoMaterial(db, 50);
    await request(app).post(`/api/almoxarifado/materiais/${mat}/bloquear`)
      .send({ quantidade: 5, justificativa: 'avaria' });
    const res = await request(app).post(`/api/almoxarifado/materiais/${mat}/desbloquear`)
      .send({ quantidade: 40, justificativa: 'engano' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(await disponivel(db, mat), 45, 'saturou e devolveu saldo errado');
  });

  // ── Quantidade não numérica (achado do review final da Etapa 5) ───────────────
  // `Number('dez')` é NaN e `Math.abs(NaN - retido) > 1e-6` é FALSE: a guarda de fechamento
  // deixava passar, o retido inteiro ia para o disponível e a inspeção era gravada com
  // quantidade_aprovada NULL. Em bloquear/desbloquear, `'dez' <= 0` também é false e o SQLite
  // coagia o valor para 0 — bloqueio de zero, gravado no livro como se fosse um bloqueio.
  await test('POST inspecionar com quantidade nao numerica retorna 400 e nao mexe no saldo', async () => {
    const { mat, itemId } = await itemRetido(db, 10);
    const res = await request(app).post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`)
      .send({ quantidade_aprovada: 'dez', quantidade_reprovada: 0 });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 10, 'liberou a quarentena com quantidade NaN');
    const item = await dbGet(db,
      'SELECT quantidade_em_inspecao FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [itemId]);
    assert.strictEqual(item.quantidade_em_inspecao, 10, 'baixou o retido do item com quantidade NaN');
  });

  await test('POST bloquear/desbloquear com quantidade nao numerica retorna 400', async () => {
    const mat = await novoMaterial(db, 50);
    const blq = await request(app).post(`/api/almoxarifado/materiais/${mat}/bloquear`)
      .send({ quantidade: 'dez', justificativa: 'avaria' });
    assert.strictEqual(blq.status, 400, JSON.stringify(blq.body));
    assert.strictEqual((await material(db, mat)).quantidade_bloqueada || 0, 0, 'gravou bloqueio NaN');

    await request(app).post(`/api/almoxarifado/materiais/${mat}/bloquear`)
      .send({ quantidade: 5, justificativa: 'avaria' });
    const des = await request(app).post(`/api/almoxarifado/materiais/${mat}/desbloquear`)
      .send({ quantidade: 'cinco', justificativa: 'engano' });
    assert.strictEqual(des.status, 400, JSON.stringify(des.body));
    assert.strictEqual((await material(db, mat)).quantidade_bloqueada, 5, 'desbloqueou com quantidade NaN');
  });

  await test('GET inspecoes/pendentes lista o retido com material e recebimento', async () => {
    const { mat, recId } = await itemRetido(db, 15);
    const res = await request(app).get('/api/almoxarifado/inspecoes/pendentes');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const linha = res.body.find((l) => l.material_id === mat);
    assert.ok(linha, 'item retido fora da fila');
    assert.strictEqual(linha.recebimento_id, recId);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
