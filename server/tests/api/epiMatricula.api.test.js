/**
 * Etapa 178 (Fase 5, revisao adversarial — importante 4): a identificacao do colaborador. A assinatura no tablet sozinha nao
 * dizia QUEM assinou (o almoxarife escolhia o nome na lista). Agora o colaborador digita a propria MATRICULA no tablet
 * (`confirmacao_matricula`), conferida com o cadastro; a evidencia guarda `confirmado_por_matricula = 1`, o `ip` e o `user_agent`
 * da requisicao — os tres dentro do HMAC.
 *
 * Letra B: descartado PIN/senha do colaborador (exigiria cadastro de credencial de chao de fabrica). A comparacao ignora caixa,
 * pontas e espacos internos; zeros a esquerda contam ('0123' != '123').
 *
 * Executar: cd server && node tests/api/epiMatricula.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { wrapDatabase } = require('../../services/sqliteConcurrency');
const stockService = require('../../services/almoxarifado/stockService');
const epiService = require('../../services/almoxarifado/epiService');

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
let seq = 0;

(async () => {
  const t = await createTestApp({ user: ADMIN });
  const { app, db, uploadsAlmoxDir } = t;
  wrapDatabase(db);
  const arquivosEpi = () => (fs.existsSync(uploadsAlmoxDir)
    ? fs.readdirSync(uploadsAlmoxDir).filter((f) => f.startsWith('assinatura-epi-')) : []);
  const limparDisco = () => { for (const f of arquivosEpi()) fs.unlinkSync(path.join(uploadsAlmoxDir, f)); };

  async function criarEpi() {
    seq += 1;
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, categoria, quantidade_atual, ativo, ca_numero, ca_validade)
      VALUES (?, ?, 'EPIs', 0, 1, 'CA-5', '2099-01-01')`, [`EPI-M-${seq}`, `Bota ${seq}`]);
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: r.lastID, tipo: 'ENTRADA', quantidade: 10, justificativa: 'carga' });
    return r.lastID;
  }
  async function criarColaborador(nome, matricula) {
    return (await dbRun(db, "INSERT INTO colaboradores (nome, matricula, status, setor) VALUES (?,?,'ativo','Pintura')",
      [nome, matricula])).lastID;
  }
  function post(campos, ua) {
    let r = request(app).post('/api/almoxarifado/epi/entregas');
    if (ua) r = r.set('User-Agent', ua);
    for (const [k, v] of Object.entries(campos)) if (v !== undefined) r = r.field(k, String(v));
    return r.attach('assinatura', PNG_1PX, { filename: 'a.png', contentType: 'image/png' });
  }
  async function nadaGravado(m) {
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM entregas_epi_almoxarifado WHERE material_id = ?', [m])).n, 0);
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m])).q, 10, 'houve saida');
    assert.deepStrictEqual(arquivosEpi(), [], 'upload orfao');
  }

  await test('[F5-4] matricula digitada diferente da do cadastro -> 400 literal; nada gravado', async () => {
    limparDisco();
    const m = await criarEpi();
    const c = await criarColaborador('PEDRO ALVES', 'M-100');
    const r = await post({ colaborador_id: c, material_id: m, quantidade: 1, confirmacao_matricula: 'M-101' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'A matrícula informada não confere com a do colaborador');
    await nadaGravado(m);
  });

  await test('[F5-4] sem a matricula digitada -> 400 literal (o colaborador tem de confirmar); nada gravado', async () => {
    limparDisco();
    const m = await criarEpi();
    const c = await criarColaborador('LIA ROCHA', 'M-200');
    for (const conf of [undefined, '', '   ']) {
      const r = await post({ colaborador_id: c, material_id: m, quantidade: 1, confirmacao_matricula: conf });
      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, 'O colaborador deve digitar a própria matrícula para confirmar o recebimento');
    }
    await nadaGravado(m);
  });

  await test('[F5-4] colaborador sem matricula no cadastro (null ou so espacos) -> 400 literal; nada gravado', async () => {
    limparDisco();
    const m = await criarEpi();
    for (const mat of [null, '  ']) {
      const c = await criarColaborador('SEM CADASTRO', mat);
      const r = await post({ colaborador_id: c, material_id: m, quantidade: 1, confirmacao_matricula: 'qualquer' });
      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, 'Colaborador SEM CADASTRO sem matrícula cadastrada — não é possível confirmar a identidade');
    }
    await nadaGravado(m);
  });

  await test('[F5-4] zeros a esquerda contam: cadastro "0123", digitado "123" -> 400', async () => {
    limparDisco();
    const m = await criarEpi();
    const c = await criarColaborador('ZERO', '0123');
    const r = await post({ colaborador_id: c, material_id: m, quantidade: 1, confirmacao_matricula: '123' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'A matrícula informada não confere com a do colaborador');
  });

  let ok;
  await test('[F5-4] confere (caixa, pontas e espacos internos nao contam) -> 201; evidencia com confirmado_por_matricula = 1, ip e user_agent', async () => {
    const m = await criarEpi();
    const c = await criarColaborador('ANA PAULA', 'ab-77 9');
    const r = await post({ colaborador_id: c, material_id: m, quantidade: 1, confirmacao_matricula: '  AB-77  9 ' }, 'Tablet-Almox/2.1 (Android)');
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    ok = r.body; // antes das assercoes: os testes do HMAC abaixo nao dependem delas (controle positivo na assercao certa)
    const ev = await dbGet(db, "SELECT * FROM evidencias_assinatura_almoxarifado WHERE contexto = 'ENTREGA_EPI' AND contexto_id = ?", [r.body.id]);
    assert.strictEqual(ev.confirmado_por_matricula, 1);
    assert.match(String(ev.ip), /127\.0\.0\.1|::1/);
    assert.strictEqual(ev.user_agent, 'Tablet-Almox/2.1 (Android)');
    const entrega = await dbGet(db, 'SELECT * FROM entregas_epi_almoxarifado WHERE id = ?', [r.body.id]);
    const campos = epiService.camposDoRegistro(entrega, ev);
    assert.strictEqual(campos.evidencia.confirmado_por_matricula, 1);
    assert.strictEqual(campos.evidencia.ip, ev.ip);
    assert.strictEqual(campos.evidencia.user_agent, 'Tablet-Almox/2.1 (Android)');
  });

  for (const [rotulo, sql] of [
    ['o user_agent', "UPDATE evidencias_assinatura_almoxarifado SET user_agent = 'Outro' WHERE contexto_id = ?"],
    ['o ip', "UPDATE evidencias_assinatura_almoxarifado SET ip = '10.0.0.9' WHERE contexto_id = ?"],
    ['o confirmado_por_matricula', 'UPDATE evidencias_assinatura_almoxarifado SET confirmado_por_matricula = 0 WHERE contexto_id = ?'],
  ]) {
    await test(`[F5-4] ${rotulo} entra no HMAC: alterado (trigger contornado) -> "registro alterado"`, async () => {
      assert.ok(ok, 'o 201 de cima nao aconteceu');
      const antes = await dbGet(db, 'SELECT ip, user_agent, confirmado_por_matricula FROM evidencias_assinatura_almoxarifado WHERE contexto_id = ?', [ok.id]);
      await dbRun(db, 'DROP TRIGGER trg_evidencias_assinatura_almoxarifado_sem_update');
      try {
        await dbRun(db, sql, [ok.id]);
        assert.deepStrictEqual((await request(app).get(`/api/almoxarifado/epi/entregas/${ok.id}/verificar`)).body,
          { integro: false, motivo: 'registro alterado' });
      } finally {
        await dbRun(db, `UPDATE evidencias_assinatura_almoxarifado SET ip = ?, user_agent = ?, confirmado_por_matricula = ?
          WHERE contexto_id = ?`, [antes.ip, antes.user_agent, antes.confirmado_por_matricula, ok.id]);
        await dbRun(db, `CREATE TRIGGER trg_evidencias_assinatura_almoxarifado_sem_update BEFORE UPDATE ON evidencias_assinatura_almoxarifado
          BEGIN SELECT RAISE(ABORT, 'evidencia de assinatura nao pode ser alterada'); END`);
      }
      assert.deepStrictEqual((await request(app).get(`/api/almoxarifado/epi/entregas/${ok.id}/verificar`)).body, { integro: true });
    });
  }

  await test('[F5-4] user_agent longo e cortado em 300 caracteres (e o hash bate)', async () => {
    const m = await criarEpi();
    const c = await criarColaborador('LONGO', 'L-1');
    const r = await post({ colaborador_id: c, material_id: m, quantidade: 1, confirmacao_matricula: 'L-1' }, 'X'.repeat(1000));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const ev = await dbGet(db, "SELECT user_agent FROM evidencias_assinatura_almoxarifado WHERE contexto = 'ENTREGA_EPI' AND contexto_id = ?", [r.body.id]);
    assert.strictEqual(ev.user_agent.length, 300);
    assert.deepStrictEqual((await request(app).get(`/api/almoxarifado/epi/entregas/${r.body.id}/verificar`)).body, { integro: true });
  });

  console.log(`\nepiMatricula: ${passed} ok, ${failed} falha(s)`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
