/**
 * RN-A (Etapa 33) — nenhuma saída de material sem OS.
 * Executar: cd server && node tests/api/requisicaoExigeOS.api.test.js
 *
 * Pedido da Gerência de Compras (e-mail 15/09/2026): o número da OS passa a ser obrigatório,
 * para quem solicita e para quem libera, porque hoje se perde a rastreabilidade de em qual
 * serviço cada material foi usado.
 *
 * Decisão do P.O. (16/09/2026): o número é **digitado**, não escolhido de um cadastro. Logo,
 * NÃO existe validação contra `ordens_servico` — e um cenário abaixo trava isso de propósito,
 * porque "melhorar" a regra para validar o cadastro quebraria o uso real.
 *
 * Os dois furos que este arquivo protege são o rascunho (que pode nascer sem OS e viraria a
 * porta dos fundos no envio) e as requisições antigas, que não podem deixar de ser lidas.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const SOLICITANTE = {
  id: 7, nome: 'Solicitante', role: 'usuario',
  perfil_almoxarifado: 'PRODUCAO', email: 'producao@test.com',
};

const LITERAL = 'Informe o número da OS: toda saída de material precisa estar vinculada a uma OS';

let seq = 0;
async function novoMaterial(db) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, quantidade_minima, quantidade_maxima,
       ponto_reposicao, lote_economico, prazo_reposicao_dias, controle_lote)
     VALUES (?,?,?,100,1,0,0,0,0,0,0)`, [`OS-MAT-${seq}`, `Material OS ${seq}`, 'PC']);
  return r.lastID;
}

// SEM `departamento` de proposito: com setor preenchido, `validateMateriaisParaSetor` recusa
// o material antes de a RN-A ser alcancada, e os cenarios abaixo passariam a medir a regra de
// setor em vez da regra de OS.
const corpo = (materialId, over = {}) => ({
  os_referencia: 'OS 1714',
  itens: [{ material_id: materialId, quantidade: 2 }],
  ...over,
});

(async () => {
  console.log('\n═══ RN-A: requisição exige número de OS ═══\n');
  const ctx = await createTestApp({ user: SOLICITANTE });
  const { app, db } = ctx;
  const materialId = await novoMaterial(db);

  const criar = (body) => request(app).post('/api/almoxarifado/requisicoes').send(body);

  /* ── 1. a regra ───────────────────────────────────────────────────── */
  console.log('Criação');

  await test('requisição COM OS é criada normalmente', async () => {
    const r = await criar(corpo(materialId));
    assert.ok(r.status < 300, `status ${r.status}: ${JSON.stringify(r.body)}`);
    const row = await dbGet(db,
      'SELECT os_referencia, status FROM requisicoes_almoxarifado WHERE id = ?', [r.body.id]);
    assert.strictEqual(row.os_referencia, 'OS 1714');
    assert.strictEqual(row.status, 'PENDENTE');
  });

  await test('requisição SEM OS é recusada com a literal', async () => {
    const r = await criar(corpo(materialId, { os_referencia: undefined }));
    assert.strictEqual(r.status, 400, `esperava 400, veio ${r.status}`);
    assert.strictEqual(r.body.error, LITERAL);
  });

  await test('OS só com espaços é recusada — não vale "preencher de qualquer jeito"', async () => {
    const r = await criar(corpo(materialId, { os_referencia: '   ' }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, LITERAL);
  });

  await test('OS nula e OS vazia caem na mesma recusa', async () => {
    for (const valor of [null, '']) {
      const r = await criar(corpo(materialId, { os_referencia: valor }));
      assert.strictEqual(r.status, 400, `os_referencia=${JSON.stringify(valor)} passou`);
    }
  });

  await test('nada é gravado quando a OS falta', async () => {
    const antes = await dbGet(db, 'SELECT COUNT(*) n FROM requisicoes_almoxarifado');
    await criar(corpo(materialId, { os_referencia: '' }));
    const depois = await dbGet(db, 'SELECT COUNT(*) n FROM requisicoes_almoxarifado');
    assert.strictEqual(depois.n, antes.n, 'a requisição foi criada mesmo sem OS');
  });

  await test('o espaço em volta é removido na gravação', async () => {
    // Sem isto, "OS 1714" e " OS 1714 " viram dois serviços diferentes no relatório — que é
    // exatamente a perda de rastreabilidade que a regra existe para evitar.
    const r = await criar(corpo(materialId, { os_referencia: '  OS 2050  ' }));
    const row = await dbGet(db,
      'SELECT os_referencia FROM requisicoes_almoxarifado WHERE id = ?', [r.body.id]);
    assert.strictEqual(row.os_referencia, 'OS 2050');
  });

  /* ── 2. o número é DIGITADO, não puxado de cadastro ───────────────── */
  console.log('\nO número é livre (decisão do P.O.)');

  await test('OS que não existe em ordens_servico é aceita', async () => {
    // Trava deliberada: se alguém "melhorar" a regra para validar contra o cadastro de OS,
    // este cenário fica vermelho. A Gerência pediu obrigatoriedade, não vínculo com cadastro.
    const r = await criar(corpo(materialId, { os_referencia: 'OS-QUE-NAO-EXISTE-9999' }));
    assert.ok(r.status < 300,
      `a OS digitada foi recusada (${r.status}) — a regra passou a validar cadastro`);
  });

  await test('formatos diferentes são todos aceitos', async () => {
    for (const os of ['1714', 'OS 1714', 'OS-1714/A', 'MANUT 22']) {
      const r = await criar(corpo(materialId, { os_referencia: os }));
      assert.ok(r.status < 300, `"${os}" foi recusada com ${r.status}`);
    }
  });

  /* ── 3. o rascunho não é a porta dos fundos ───────────────────────── */
  console.log('\nRascunho');

  await test('rascunho PODE ser salvo sem OS', async () => {
    const r = await criar(corpo(materialId, { os_referencia: '', salvar_rascunho: true }));
    assert.ok(r.status < 300, `status ${r.status}: ${JSON.stringify(r.body)}`);
    const row = await dbGet(db,
      'SELECT status, os_referencia FROM requisicoes_almoxarifado WHERE id = ?', [r.body.id]);
    assert.strictEqual(row.status, 'RASCUNHO');
    assert.strictEqual(row.os_referencia, null);
  });

  await test('ENVIAR rascunho sem OS é recusado — o furo está fechado', async () => {
    const criado = await criar(corpo(materialId, { os_referencia: '', salvar_rascunho: true }));
    const r = await request(app).post(`/api/almoxarifado/requisicoes/${criado.body.id}/enviar`).send({});
    assert.strictEqual(r.status, 400, `o rascunho sem OS foi enviado (${r.status})`);
    assert.strictEqual(r.body.error, LITERAL);

    const row = await dbGet(db,
      'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [criado.body.id]);
    assert.strictEqual(row.status, 'RASCUNHO', 'o status mudou mesmo com a recusa');
  });

  await test('rascunho COM OS é enviado normalmente', async () => {
    const criado = await criar(corpo(materialId, { os_referencia: 'OS 3001', salvar_rascunho: true }));
    const r = await request(app).post(`/api/almoxarifado/requisicoes/${criado.body.id}/enviar`).send({});
    assert.ok(r.status < 300, `status ${r.status}: ${JSON.stringify(r.body)}`);
    const row = await dbGet(db,
      'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [criado.body.id]);
    assert.notStrictEqual(row.status, 'RASCUNHO');
  });

  /* ── 4. o histórico continua legível ──────────────────────────────── */
  console.log('\nRequisições antigas');

  await test('requisição antiga sem OS continua sendo lida, não some nem quebra', async () => {
    // Entra por INSERT direto DE PROPÓSITO: é como o histórico já está no banco. Preencher
    // retroativamente seria inventar dado que ninguém tem.
    const r = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, status, os_referencia)
      VALUES ('REQ-ANTIGA-1', ?, 'Alguem', 'PENDENTE', NULL)`, [SOLICITANTE.id]);

    const lida = await request(app).get(`/api/almoxarifado/requisicoes/${r.lastID}`);
    assert.ok(lida.status < 300, `a requisição antiga deixou de ser lida (${lida.status})`);

    const lista = await request(app).get('/api/almoxarifado/requisicoes');
    assert.ok(lista.status < 300, 'a lista quebrou com requisição antiga sem OS');
  });

  await ctx.close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
