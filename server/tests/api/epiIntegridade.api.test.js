/**
 * Etapa 178 (T1) — integridade e recuperacao da evidencia de entrega de EPI (RN-178.07, RN-178.08, RN-178.09; C1, I2, menores).
 *
 * - append-only no banco: os triggers barram UPDATE e DELETE nas duas tabelas (direto no SQLite);
 * - o hash de ida e volta: o que foi gravado, relido e recalculado da o mesmo `registro_sha256`;
 * - `GET /epi/entregas/:id/verificar`: integro; 1 byte trocado no PNG -> 'arquivo alterado'; linha alterada (o teste derruba o
 *   trigger para conseguir) -> 'registro alterado'; o hash do arquivo reescrito na linha para bater com o PNG adulterado ->
 *   'registro alterado'; o PNG apagado -> 'arquivo ausente'; 404 literal;
 * - a ficha: CPF mascarado (>= 2 digitos, senao null), colaborador excluido -> o snapshot (sem FK, I2), 404 literal;
 * - a lista: o contrato congelado, filtros e a ordem.
 *
 * Executar: cd server && node tests/api/epiIntegridade.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { wrapDatabase } = require('../../services/sqliteConcurrency');
const stockService = require('../../services/almoxarifado/stockService');
const epiService = require('../../services/almoxarifado/epiService');
const evidencia = require('../../services/almoxarifado/evidenciaAssinaturaService');
const diaLocal = require('../../services/diaLocal');

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${String(e && e.message).replace(/\s*\n\s*/g, ' ').slice(0, 800)}`);
  }
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const TRIGGER = /evidencia de assinatura nao pode ser alterada/;
const TABELAS = ['entregas_epi_almoxarifado', 'evidencias_assinatura_almoxarifado'];
let seq = 0;

(async () => {
  const t = await createTestApp({ user: ADMIN });
  const { app, db, uploadsAlmoxDir } = t;
  wrapDatabase(db);

  async function criarEpi({ qtd = 20 } = {}) {
    seq += 1;
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, categoria, quantidade_atual, ativo, ca_numero, ca_validade)
      VALUES (?, ?, 'EPIs', 0, 1, 'CA-777', '2099-12-31')`, [`EPI-I-${seq}`, `Oculos ${seq}`]);
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: r.lastID, tipo: 'ENTRADA', quantidade: qtd, justificativa: 'carga' });
    return r.lastID;
  }
  async function criarColaborador(extra = {}) {
    seq += 1;
    const r = await dbRun(db, 'INSERT INTO colaboradores (nome, matricula, cpf, status, setor) VALUES (?,?,?,?,?)',
      [extra.nome || `COLAB ${seq}`, `MI${seq}`, extra.cpf === undefined ? null : extra.cpf, 'ativo', 'Usinagem']);
    return r.lastID;
  }
  async function entregar(colaborador_id, material_id, quantidade = 1, extra = {}) {
    let r = request(app).post('/api/almoxarifado/epi/entregas')
      .field('colaborador_id', String(colaborador_id)).field('material_id', String(material_id)).field('quantidade', String(quantidade));
    for (const [k, v] of Object.entries(extra)) r = r.field(k, v);
    const res = await r.attach('assinatura', PNG_1PX, { filename: 'a.png', contentType: 'image/png' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    return res.body;
  }
  const verificar = (id) => request(app).get(`/api/almoxarifado/epi/entregas/${id}/verificar`);
  const arquivoDe = async (entregaId) => (await dbGet(db,
    "SELECT arquivo FROM evidencias_assinatura_almoxarifado WHERE contexto = 'ENTREGA_EPI' AND contexto_id = ?", [entregaId])).arquivo;
  /** Contorna o trigger SO no teste: derruba, roda o SQL, recria pelo initSchema (o mesmo DDL de producao). */
  async function semTrigger(tabela, sql, params = []) {
    await dbRun(db, `DROP TRIGGER trg_${tabela}_sem_update`);
    try { await dbRun(db, sql, params); } finally {
      await dbRun(db, `CREATE TRIGGER trg_${tabela}_sem_update BEFORE UPDATE ON ${tabela}
        BEGIN SELECT RAISE(ABORT, 'evidencia de assinatura nao pode ser alterada'); END`);
    }
  }

  const matA = await criarEpi();
  const colA = await criarColaborador({ nome: 'MARIA DE SOUZA', cpf: '987.654.321-09' });
  const e1 = await entregar(colA, matA, 2, { tamanho: 'M', motivo: 'TROCA' });

  // ── RN-178.07: append-only ──────────────────────────────────────────────────────────────────
  for (const tabela of TABELAS) {
    await test(`[RN-178.07] ${tabela}: UPDATE e DELETE direto no SQLite -> abortados pelo trigger, linha intacta`, async () => {
      const antes = await dbAll(db, `SELECT * FROM ${tabela} ORDER BY id`);
      await assert.rejects(dbRun(db, `UPDATE ${tabela} SET colaborador_nome = 'OUTRO'`), TRIGGER);
      await assert.rejects(dbRun(db, `DELETE FROM ${tabela}`), TRIGGER);
      assert.deepStrictEqual(await dbAll(db, `SELECT * FROM ${tabela} ORDER BY id`), antes);
    });
  }

  await test('[RN-178.07] controle positivo: sem o trigger o UPDATE passa (o teste de cima sabe falhar)', async () => {
    await semTrigger('entregas_epi_almoxarifado', 'UPDATE entregas_epi_almoxarifado SET tamanho = tamanho WHERE id = ?', [e1.id]);
  });

  // ── C1: hash de ida e volta ─────────────────────────────────────────────────────────────────
  await test('[C1] ida e volta: as linhas relidas do SQLite, normalizadas, dao o mesmo registro_sha256; o arquivo, o mesmo arquivo_sha256', async () => {
    const entrega = await dbGet(db, 'SELECT * FROM entregas_epi_almoxarifado WHERE id = ?', [e1.id]);
    const ev = await dbGet(db, 'SELECT * FROM evidencias_assinatura_almoxarifado WHERE id = ?', [e1.evidencia.id]);
    const campos = epiService.camposDoRegistro(entrega, ev);
    const SEGREDO = process.env.EVIDENCIA_ASSINATURA_SECRET;
    assert.strictEqual(evidencia.registroHmac(campos, SEGREDO), e1.evidencia.registro_sha256);
    assert.strictEqual(ev.registro_sha256, e1.evidencia.registro_sha256);
    // conferido por fora do servico: HMAC-SHA256 (Fase 5; era SHA-256 publico na T1) do JSON com as chaves ordenadas
    const ordenado = (o) => (o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, ordenado(o[k])])) : o);
    const porFora = crypto.createHmac('sha256', SEGREDO).update(JSON.stringify(ordenado(campos))).digest('hex');
    assert.strictEqual(porFora, e1.evidencia.registro_sha256);
    assert.strictEqual(campos.quantidade, 2);
    assert.strictEqual(campos.evidencia.arquivo_sha256, crypto.createHash('sha256').update(PNG_1PX).digest('hex'));
    assert.strictEqual(campos.criado_em, e1.evidencia.criado_em);
  });

  await test('[RN-178.07] JSON canonico: chaves ordenadas em todo nivel, undefined vira null', async () => {
    assert.strictEqual(evidencia.jsonCanonico({ b: 1, a: { d: undefined, c: 2 } }), '{"a":{"c":2,"d":null},"b":1}');
    assert.strictEqual(evidencia.registroHmac({ x: 1, y: 2 }, 's'), evidencia.registroHmac({ y: 2, x: 1 }, 's'));
    assert.throws(() => evidencia.registroHmac({ x: 1 }, ''), /Segredo da evidência de assinatura não configurado/);
  });

  // ── RN-178.08: verificar ────────────────────────────────────────────────────────────────────
  await test('[RN-178.08] verificar: { integro: true } exatamente', async () => {
    const r = await verificar(e1.id);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, { integro: true });
  });

  await test('[RN-178.08] 1 byte trocado no PNG -> { integro: false, motivo: "arquivo alterado" }', async () => {
    const e = await entregar(colA, matA);
    const caminho = path.join(uploadsAlmoxDir, await arquivoDe(e.id));
    const buf = fs.readFileSync(caminho);
    buf[buf.length - 5] ^= 0x01;
    fs.writeFileSync(caminho, buf);
    assert.deepStrictEqual((await verificar(e.id)).body, { integro: false, motivo: 'arquivo alterado' });
    buf[buf.length - 5] ^= 0x01; // desfeito -> integro de novo (controle)
    fs.writeFileSync(caminho, buf);
    assert.deepStrictEqual((await verificar(e.id)).body, { integro: true });
  });

  for (const [rotulo, tabela, sql] of [
    ['a quantidade da entrega', 'entregas_epi_almoxarifado', 'UPDATE entregas_epi_almoxarifado SET quantidade = 1 WHERE id = ?'],
    ['o nome do colaborador na entrega', 'entregas_epi_almoxarifado', "UPDATE entregas_epi_almoxarifado SET colaborador_nome = 'OUTRA' WHERE id = ?"],
    ['o criado_em da evidencia', 'evidencias_assinatura_almoxarifado',
      "UPDATE evidencias_assinatura_almoxarifado SET criado_em = '2020-01-01T00:00:00.000Z' WHERE contexto_id = ?"],
    ['o CPF do snapshot', 'evidencias_assinatura_almoxarifado',
      "UPDATE evidencias_assinatura_almoxarifado SET cpf = '111.111.111-11' WHERE contexto_id = ?"],
  ]) {
    await test(`[RN-178.08] linha alterada (${rotulo}, trigger contornado no teste) -> "registro alterado"`, async () => {
      const e = await entregar(colA, matA, 3);
      assert.deepStrictEqual((await verificar(e.id)).body, { integro: true });
      await semTrigger(tabela, sql, [e.id]);
      assert.deepStrictEqual((await verificar(e.id)).body, { integro: false, motivo: 'registro alterado' });
    });
  }

  await test('[RN-178.08] PNG trocado E arquivo_sha256 reescrito na linha para bater -> "registro alterado" (o hash do registro pega)', async () => {
    const e = await entregar(colA, matA);
    const caminho = path.join(uploadsAlmoxDir, await arquivoDe(e.id));
    const buf = fs.readFileSync(caminho);
    buf[buf.length - 5] ^= 0x02;
    fs.writeFileSync(caminho, buf);
    const novo = crypto.createHash('sha256').update(buf).digest('hex');
    await semTrigger('evidencias_assinatura_almoxarifado',
      "UPDATE evidencias_assinatura_almoxarifado SET arquivo_sha256 = ? WHERE contexto = 'ENTREGA_EPI' AND contexto_id = ?", [novo, e.id]);
    assert.deepStrictEqual((await verificar(e.id)).body, { integro: false, motivo: 'registro alterado' });
  });

  await test('[RN-178.08] PNG apagado -> "arquivo ausente"; entrega inexistente -> 404 literal', async () => {
    const e = await entregar(colA, matA);
    fs.unlinkSync(path.join(uploadsAlmoxDir, await arquivoDe(e.id)));
    assert.deepStrictEqual((await verificar(e.id)).body, { integro: false, motivo: 'arquivo ausente' });
    const r = await verificar(99999);
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'Entrega de EPI #99999 não encontrada');
  });

  // ── Contrato da lista ───────────────────────────────────────────────────────────────────────
  await test('[contrato] GET /epi/entregas: as chaves congeladas, mais recentes primeiro, filtros colaborador/material/de/ate', async () => {
    const matB = await criarEpi();
    const colB = await criarColaborador();
    const x1 = await entregar(colB, matB);
    const x2 = await entregar(colB, matA);
    const todas = await request(app).get('/api/almoxarifado/epi/entregas');
    assert.strictEqual(todas.status, 200);
    assert.deepStrictEqual(Object.keys(todas.body[0]).sort(), ['ca_numero', 'ca_validade', 'colaborador_id', 'colaborador_nome',
      'criado_em', 'entregue_por_nome', 'id', 'material_codigo', 'material_id', 'material_nome', 'matricula', 'motivo', 'numero',
      'quantidade', 'tamanho'].sort());
    const ordem = todas.body.map((r) => r.criado_em);
    assert.deepStrictEqual(ordem, [...ordem].sort().reverse());
    const porColab = await request(app).get(`/api/almoxarifado/epi/entregas?colaborador_id=${colB}`);
    assert.deepStrictEqual(porColab.body.map((r) => r.id), [x2.id, x1.id]);
    const porAmbos = await request(app).get(`/api/almoxarifado/epi/entregas?colaborador_id=${colB}&material_id=${matB}`);
    assert.deepStrictEqual(porAmbos.body.map((r) => r.id), [x1.id]);
    const hoje = diaLocal.hojeLocalISO();
    const hojeR = await request(app).get(`/api/almoxarifado/epi/entregas?colaborador_id=${colB}&de=${hoje}&ate=${hoje}`);
    assert.strictEqual(hojeR.body.length, 2);
    const futuro = await request(app).get(`/api/almoxarifado/epi/entregas?colaborador_id=${colB}&de=2099-01-01`);
    assert.strictEqual(futuro.body.length, 0);
    const passado = await request(app).get(`/api/almoxarifado/epi/entregas?colaborador_id=${colB}&ate=2000-01-01`);
    assert.strictEqual(passado.body.length, 0);
  });

  // ── RN-178.09: ficha ────────────────────────────────────────────────────────────────────────
  await test('[RN-178.09] ficha: colaborador com CPF mascarado, entregas com arquivo_url e registro_sha256, sem CPF completo', async () => {
    const r = await request(app).get(`/api/almoxarifado/epi/ficha/${colA}`);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.colaborador, {
      id: colA, nome: 'MARIA DE SOUZA', matricula: (await dbGet(db, 'SELECT matricula FROM colaboradores WHERE id = ?', [colA])).matricula,
      setor: 'Usinagem', cpf_mascarado: '***.***.***-09', excluido: false });
    assert.ok(r.body.entregas.length >= 1);
    const primeira = r.body.entregas.find((x) => x.id === e1.id);
    assert.strictEqual(primeira.registro_sha256, e1.evidencia.registro_sha256);
    assert.match(primeira.arquivo_url, /^\/api\/uploads\/almoxarifado\/assinatura-epi-.*sig=/);
    assert.strictEqual(primeira.tamanho, 'M');
    assert.strictEqual(primeira.motivo, 'TROCA');
    assert.ok(!JSON.stringify(r.body).includes('987.654.321'), 'CPF completo vazou');
    assert.ok(!JSON.stringify(r.body).includes('98765432109'), 'CPF completo vazou');
  });

  await test('[menores] CPF: so digitos contam, >= 2 -> ***.***.***-NN; nulo ou 1 digito -> null', async () => {
    assert.strictEqual(evidencia.mascararCpf('12345678901'), '***.***.***-01');
    assert.strictEqual(evidencia.mascararCpf('ab-7-x-3'), '***.***.***-73');
    assert.strictEqual(evidencia.mascararCpf('5'), null);
    assert.strictEqual(evidencia.mascararCpf(null), null);
    for (const [cpf, esperado] of [[null, null], ['7', null], ['12', '***.***.***-12']]) {
      const c = await criarColaborador({ cpf });
      const r = await request(app).get(`/api/almoxarifado/epi/ficha/${c}`);
      assert.strictEqual(r.status, 200, 'colaborador sem entregas -> 200 com lista vazia');
      assert.deepStrictEqual(r.body.entregas, []);
      assert.strictEqual(r.body.colaborador.cpf_mascarado, esperado);
    }
  });

  await test('[I2] colaborador excluido do cadastro -> a ficha continua, pelo snapshot (excluido: true); inexistente sem entrega -> 404', async () => {
    const c = await criarColaborador({ nome: 'JOSE EXCLUIDO', cpf: '222.333.444-55' });
    const e = await entregar(c, matA);
    await dbRun(db, 'DELETE FROM colaboradores WHERE id = ?', [c]);
    const r = await request(app).get(`/api/almoxarifado/epi/ficha/${c}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.colaborador.excluido, true);
    assert.strictEqual(r.body.colaborador.nome, 'JOSE EXCLUIDO');
    assert.strictEqual(r.body.colaborador.setor, 'Usinagem');
    assert.strictEqual(r.body.colaborador.cpf_mascarado, '***.***.***-55');
    assert.deepStrictEqual(r.body.entregas.map((x) => x.id), [e.id]);
    assert.deepStrictEqual((await verificar(e.id)).body, { integro: true }, 'excluir o colaborador nao altera a evidencia');
    const nf = await request(app).get('/api/almoxarifado/epi/ficha/424242');
    assert.strictEqual(nf.status, 404);
    assert.strictEqual(nf.body.error, 'Colaborador #424242 não encontrado');
  });

  await t.close();
  console.log(`\nepiIntegridade: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
