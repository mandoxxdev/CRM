/**
 * Etapa 56 — confirmação do endereço por leitura da etiqueta (`codigo_lido_origem`/`_destino`).
 *
 * Plano: docs/superpowers/plans/2026-09-30-almoxarifado-etapa56-confirmacao-leitura-localizacao.md
 *
 * Toda recusa confere que NADA foi gravado e tem a metade positiva (o mesmo gesto com o código
 * certo passa) — uma recusa que pegasse tudo passaria verde sem ela.
 *
 * Executar: cd server && node tests/api/confirmacaoLeituraLocalizacao.api.test.js
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

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
let seq = 0;

(async () => {
  console.log('\n=== Etapa 56: confirmacao do endereco por leitura ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const loc = async (codigo) => {
    const c = `E56-${codigo}-${++seq}`;
    return { id: (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', [c, codigo])).lastID, codigo: c };
  };
  const material = async (padrao = null) => (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, tipo_material, localizacao_padrao_id) VALUES (?, 'Mat', 'UN', 0, 1, 'ACO', ?)`,
  [`E56-M${++seq}`, padrao])).lastID;
  const mov = (body) => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ motivo: 'e56', justificativa: 'e56', ...body });
  const nMovs = async (m) => (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ?', [m])).n;
  const ultimo = async (m) => dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id DESC LIMIT 1', [m]);
  const ok = (r) => assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  const recusa = (r, literal) => { assert.strictEqual(r.status, 400, JSON.stringify(r.body)); assert.strictEqual(r.body.error, literal); };
  const NAO_CONFERE = (lido, papel, codigo) => `Endereço lido (${lido}) não confere com a localização de ${papel} (${codigo}) — se a etiqueta é antiga, reimprima`;

  await test('ENTRADA: o destino confere (maiusculas/espacos nao importam) e fica no livro; nao confere e recusado sem gravar', async () => {
    const A = await loc('A'); const B = await loc('B'); const m = await material();
    recusa(await mov({ material_id: m, tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: A.id, codigo_lido_destino: B.codigo }),
      NAO_CONFERE(B.codigo, 'destino', A.codigo));
    assert.strictEqual(await nMovs(m), 0);
    ok(await mov({ material_id: m, tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: A.id, codigo_lido_destino: `  ${A.codigo.toLowerCase()} ` }));
    const l = await ultimo(m);
    assert.strictEqual(l.codigo_lido_destino, A.codigo); assert.strictEqual(l.codigo_lido_origem, null);
  });

  await test('ENTRADA sem destino: confere contra a PADRAO (a localizacao efetiva)', async () => {
    const P = await loc('P'); const X = await loc('X'); const m = await material(P.id);
    recusa(await mov({ material_id: m, tipo: 'ENTRADA', quantidade: 2, codigo_lido_destino: X.codigo }), NAO_CONFERE(X.codigo, 'destino', P.codigo));
    ok(await mov({ material_id: m, tipo: 'ENTRADA', quantidade: 2, codigo_lido_destino: P.codigo }));
    assert.strictEqual((await ultimo(m)).codigo_lido_destino, P.codigo);
  });

  await test('ENTRADA sem destino e sem padrao: "nao tem localizacao de destino"', async () => {
    const m = await material();
    recusa(await mov({ material_id: m, tipo: 'ENTRADA', quantidade: 1, codigo_lido_destino: 'QUALQUER' }),
      'Endereço lido (QUALQUER), mas o movimento não tem localização de destino');
    assert.strictEqual(await nMovs(m), 0);
  });

  await test('SAIDA: origem confirmada exige origem informada e saldo NELA que cubra (a saida drena outros enderecos)', async () => {
    const A = await loc('SA'); const B = await loc('SB'); const m = await material();
    ok(await mov({ material_id: m, tipo: 'ENTRADA', quantidade: 10, localizacao_destino_id: A.id }));
    ok(await mov({ material_id: m, tipo: 'ENTRADA', quantidade: 50, localizacao_destino_id: B.id }));
    const antes = await nMovs(m);
    recusa(await mov({ material_id: m, tipo: 'SAIDA', quantidade: 5, codigo_lido_origem: A.codigo }),
      'Para confirmar a origem pela leitura, informe a localização de origem');
    recusa(await mov({ material_id: m, tipo: 'SAIDA', quantidade: 40, localizacao_origem_id: A.id, codigo_lido_origem: A.codigo }),
      `O saldo em ${A.codigo} (10) não cobre a quantidade (40) — a saída tiraria de outros endereços`);
    recusa(await mov({ material_id: m, tipo: 'SAIDA', quantidade: 5, localizacao_origem_id: A.id, codigo_lido_origem: B.codigo }),
      NAO_CONFERE(B.codigo, 'origem', A.codigo));
    assert.strictEqual(await nMovs(m), antes);
    // Metade positiva: cabe em A — e sai de A.
    ok(await mov({ material_id: m, tipo: 'SAIDA', quantidade: 10, localizacao_origem_id: A.id, codigo_lido_origem: A.codigo }));
    assert.strictEqual((await ultimo(m)).codigo_lido_origem, A.codigo);
    const emA = await dbGet(db, 'SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?', [m, A.id]);
    assert.strictEqual(Number(emA.q), 0);
  });

  await test('Papel que o tipo nao usa: ENTRADA com origem lida e recusada', async () => {
    const A = await loc('PU'); const m = await material();
    recusa(await mov({ material_id: m, tipo: 'ENTRADA', quantidade: 1, localizacao_destino_id: A.id, codigo_lido_origem: A.codigo }),
      `Endereço lido (${A.codigo}), mas o movimento não tem localização de origem`);
  });

  await test('TRANSFERENCIA pela rota dedicada (body cru): os dois papeis, e tipo invalido da a mesma mensagem', async () => {
    const A = await loc('TA'); const B = await loc('TB'); const m = await material();
    ok(await mov({ material_id: m, tipo: 'ENTRADA', quantidade: 10, localizacao_destino_id: A.id }));
    const transf = (extra) => request(app).post('/api/almoxarifado/transferencias').send({
      material_id: m, quantidade: 4, localizacao_origem_id: A.id, localizacao_destino_id: B.id, motivo: 'e56', ...extra,
    });
    recusa(await transf({ codigo_lido_origem: A.codigo, codigo_lido_destino: A.codigo }), NAO_CONFERE(A.codigo, 'destino', B.codigo));
    recusa(await transf({ codigo_lido_destino: {} }), 'Endereço lido inválido');
    recusa(await transf({ codigo_lido_destino: 'X'.repeat(101) }), 'Endereço lido inválido');
    ok(await transf({ codigo_lido_origem: A.codigo, codigo_lido_destino: B.codigo }));
    const l = await ultimo(m);
    assert.strictEqual(l.codigo_lido_origem, A.codigo); assert.strictEqual(l.codigo_lido_destino, B.codigo);
    // E pela v2 o tipo invalido da a MESMA literal (o Zod nao a troca).
    recusa(await mov({ material_id: m, tipo: 'ENTRADA', quantidade: 1, localizacao_destino_id: A.id, codigo_lido_destino: 5 }), 'Endereço lido inválido');
  });

  await test('AJUSTE com endereco: confere so contra a informada; sem endereco, "nao tem localizacao"', async () => {
    const A = await loc('AJ'); const m = await material(A.id);
    ok(await mov({ material_id: m, tipo: 'AJUSTE', quantidade: 3, localizacao_destino_id: A.id, codigo_lido_destino: A.codigo }));
    recusa(await mov({ material_id: m, tipo: 'AJUSTE', quantidade: 3, codigo_lido_destino: A.codigo }),
      `Endereço lido (${A.codigo}), mas o movimento não tem localização de destino`);
  });

  await test('Ausente ou vazio: comportamento de hoje, nada gravado no rastro', async () => {
    const A = await loc('AU'); const m = await material();
    ok(await mov({ material_id: m, tipo: 'ENTRADA', quantidade: 1, localizacao_destino_id: A.id, codigo_lido_destino: '   ' }));
    const l = await ultimo(m);
    assert.strictEqual(l.codigo_lido_destino, null);
  });

  await test('Fase 5: duas saidas CONCORRENTES confirmadas em A (A:10, B:50) — uma e recusada e B fica intacto', async () => {
    const A = await loc('RA'); const B = await loc('RB'); const m = await material();
    ok(await mov({ material_id: m, tipo: 'ENTRADA', quantidade: 10, localizacao_destino_id: A.id }));
    ok(await mov({ material_id: m, tipo: 'ENTRADA', quantidade: 50, localizacao_destino_id: B.id }));
    const s = { material_id: m, tipo: 'SAIDA', quantidade: 10, localizacao_origem_id: A.id, codigo_lido_origem: A.codigo };
    const rs = await Promise.all([mov(s), mov(s)]);
    const st = rs.map((r) => r.status).sort();
    assert.deepStrictEqual(st, [201, 400], JSON.stringify(rs.map((r) => r.body)));
    const recusada = rs.find((r) => r.status === 400);
    assert.strictEqual(recusada.body.error, `O saldo em ${A.codigo} mudou durante a saída e não cobre mais a quantidade — confira e tente de novo`);
    const emB = await dbGet(db, 'SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?', [m, B.id]);
    assert.strictEqual(Number(emB.q), 50);
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m])).q, 50);
  });

  await test('Fase 5: saida COM lote confirmada — conta so o saldo DAQUELE lote no endereco', async () => {
    const A = await loc('LA'); const m = await material();
    ok(await mov({ material_id: m, tipo: 'ENTRADA', quantidade: 2, localizacao_destino_id: A.id, lote: `L-${seq}` }));
    ok(await mov({ material_id: m, tipo: 'ENTRADA', quantidade: 50, localizacao_destino_id: A.id }));
    const lote = `L-${seq}`;
    recusa(await mov({ material_id: m, tipo: 'SAIDA', quantidade: 10, localizacao_origem_id: A.id, lote, codigo_lido_origem: A.codigo }),
      `O saldo em ${A.codigo} (2) não cobre a quantidade (10) — a saída tiraria de outros endereços`);
    ok(await mov({ material_id: m, tipo: 'SAIDA', quantidade: 2, localizacao_origem_id: A.id, lote, codigo_lido_origem: A.codigo }));
  });

  await test('Fase 5: TRANSFERENCIA com origem lida e saldo curto — a mensagem e a da transferencia, nao "outros enderecos"', async () => {
    const A = await loc('XA'); const B = await loc('XB'); const m = await material();
    ok(await mov({ material_id: m, tipo: 'ENTRADA', quantidade: 3, localizacao_destino_id: A.id }));
    const r = await request(app).post('/api/almoxarifado/transferencias').send({
      material_id: m, quantidade: 5, localizacao_origem_id: A.id, localizacao_destino_id: B.id, motivo: 'e56', codigo_lido_origem: A.codigo,
    });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(!/outros endereços/.test(r.body.error), r.body.error);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
