/**
 * Etapa 190 (T4) — integracao: a validade gravada pela Entrada manual (pela ROTA v2) entra em todas as regras de hoje, conferida
 * numa PORTA DIFERENTE, existente e sem mudanca (RN-190.11): o FEFO da lista de lotes, o e-mail "Lote vencendo", a saida de lote
 * vencido recusada (e liberada pela liberacao de vencimento) e a sugestao de coleta da fila de separacao (Etapa 188). E o
 * preenchimento pelo SERVICO (sem schema). Cada cenario tem o seu controle: a mesma entrada SEM a validade da o resultado de antes.
 *
 * Usuarios reais por header (molde da 188): S sem perfil cria a requisicao; ADMIN superadmin movimenta, aprova e libera; ALMOX le a
 * fila. Fuso: TZ=UTC no processo e as datas relativas lidas de `diaLocal.hojeLocalISO()` (o dia de Brasilia, a regua do motor e do
 * `isVencido`), com guarda.
 * Plano: docs/superpowers/plans/2026-10-23-almoxarifado-etapa190-validade-do-lote-na-entrada-manual.md
 *
 * Executar: cd server && node tests/api/validadeLoteEntradaManualIntegracao.api.test.js
 */
process.env.TZ = 'UTC';
const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const stockService = require('../../services/almoxarifado/stockService');
const queueService = require('../../services/almoxarifado/notificationQueueService');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 190', role: 'admin', is_superadmin: 1, email: 'a190@t.com' },
  S: { id: 19011, nome: 'Solic 190', role: 'user', email: 's190@t.com' },
  ALMOX: { id: 19012, nome: 'Almox 190', role: 'user', email: 'x190@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const BR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const AVISO_PREENCHIDA = (c, d) => `O lote ${c} não tinha validade; ela foi gravada agora (${BR(d)}) e vale também para o saldo que já estava nele.`;

(async () => {
  console.log('\n=== Etapa 190 (T4): integracao da validade do lote ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
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

  const hoje = diaLocal.hojeLocalISO();
  const dias = (n) => diaLocal.somarDiasISO(hoje, n);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(hoje) && dias(-1) < hoje && hoje < dias(1), `premissa do relogio: ${hoje}`);

  // Cadastro pela rota (molde da 188): ALM190 com Z190-A e Z190-B.
  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM190', nome: 'Almox 190' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return (await dbGet(db, 'SELECT id FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo])).id;
  };
  const ZA = await loc('Z190-A');
  const ZB = await loc('Z190-B');

  let seq = 0;
  const material = async () => {
    const c = `E190I-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario) VALUES (?, ?, 'UN', 0, 0, 1, 0, 1)`, [c, c])).lastID;
  };
  const entrada = async (m, corpo) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', motivo: 'e190', ...corpo });
    assert.strictEqual(r.status, 201, `entrada ${JSON.stringify(corpo)}: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m, codigo])).id;

  // ── 1. FEFO na lista de lotes ──────────────────────────────────────────────────────────────────────────────────────────
  const ordemDaLista = async (comValidade) => {
    const m = await material();
    await entrada(m, { quantidade: 5, lote: 'LS' }); // sem validade (a entrada antiga)
    await entrada(m, { quantidade: 5, lote: 'LV', ...(comValidade ? { data_validade: dias(60) } : {}) });
    const r = await como('ADMIN').get(`${API}/materiais/${m}/lotes`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.map((l) => l.codigo);
  };
  await test('[RN-190.11] FEFO na lista: o lote que entrou com validade vem antes do sem validade', async () => {
    assert.deepStrictEqual(await ordemDaLista(true), ['LV', 'LS']);
    // controle: a mesma entrada SEM a validade -> ordem por codigo (a ordem vem da validade)
    assert.deepStrictEqual(await ordemDaLista(false), ['LS', 'LV']);
  });

  // ── 2. E-mail "Lote vencendo" ──────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-190.11] e-mail Lote vencendo: a validade gravada pela Entrada entra na varredura (dedupe lote-vencendo-<id>-<data>)', async () => {
    const setConfig = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
    await setConfig('alertas_estoque_notificar_email', '1');
    await setConfig('alertas_estoque_emails', 'almox190@teste.com');
    await setConfig('alerta_lote_vencendo_dias', '30');
    const m = await material();
    await entrada(m, { quantidade: 3, lote: 'L-MAIL', data_validade: dias(10) });
    await entrada(m, { quantidade: 3, lote: 'L-MAIL-SEM' }); // controle: sem a validade
    const lv = await loteId(m, 'L-MAIL'); const ls = await loteId(m, 'L-MAIL-SEM');
    await queueService.varrerLotesVencendo(db);
    const linhas = await dbAll(db, "SELECT hash_dedupe, payload FROM fila_notificacoes_almoxarifado WHERE evento = 'LOTE_VENCENDO'");
    const doLote = (id) => linhas.filter((l) => JSON.parse(l.payload).lote_id === id);
    assert.strictEqual(doLote(lv).length, 1, 'o lote com validade nao foi avisado');
    const esperado = crypto.createHash('sha256').update(`LOTE_VENCENDO|lote-vencendo-${lv}-${dias(10)}`).digest('hex');
    assert.strictEqual(doLote(lv)[0].hash_dedupe, esperado, 'dedupe_chave');
    assert.strictEqual(doLote(ls).length, 0, 'controle: o lote sem validade foi avisado');
  });

  // ── 3. Saida de lote vencido ───────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-190.07/11] saida vencida recusada; liberar o vencimento; a saida passa', async () => {
    const m = await material();
    const ontem = dias(-1);
    await entrada(m, { quantidade: 4, lote: 'L-VENC', data_validade: ontem, localizacao_destino_id: ZA });
    const id = await loteId(m, 'L-VENC');
    const saida = { material_id: m, tipo: 'SAIDA', quantidade: 1, lote_id: id, localizacao_origem_id: ZA, motivo: 'e190',
      justificativa: 'teste e190' };
    const r1 = await como('ADMIN').post(`${API}/movimentacoes/v2`, saida);
    assert.strictEqual(r1.status, 400, JSON.stringify(r1.body));
    assert.ok(String(r1.body.error).startsWith(`Lote L-VENC vencido em ${ontem} nao pode sair para consumo.`), r1.body.error);
    const lib = await como('ADMIN').put(`${API}/lotes/${id}/liberar-vencimento`, { justificativa: 'teste e190' });
    assert.strictEqual(lib.status, 200, JSON.stringify(lib.body));
    const r2 = await como('ADMIN').post(`${API}/movimentacoes/v2`, saida);
    assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));
    // controle: o mesmo lote SEM a validade sai direto
    const m2 = await material();
    await entrada(m2, { quantidade: 4, lote: 'L-VENC', localizacao_destino_id: ZA });
    const r3 = await como('ADMIN').post(`${API}/movimentacoes/v2`, { ...saida, material_id: m2, lote_id: await loteId(m2, 'L-VENC') });
    assert.strictEqual(r3.status, 201, JSON.stringify(r3.body));
  });

  // ── 4. A sugestao de coleta (188) muda com o preenchimento ─────────────────────────────────────────────────────────────
  await test('[RN-190.05/11] preencher a validade muda a sugestao de coleta da fila de separacao', async () => {
    const m = await material();
    await entrada(m, { quantidade: 5, lote: 'L-A', data_validade: '2027-12-31', localizacao_destino_id: ZA });
    await entrada(m, { quantidade: 5, lote: 'L-B', localizacao_destino_id: ZB }); // sem validade
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-190', itens: [{ material_id: m, quantidade: 3 }] });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ap = await como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/aprovar`, {});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    const pegarEm = async () => {
      const f = await como('ALMOX').get(`${API}/fila-separacao`);
      assert.strictEqual(f.status, 200, JSON.stringify(f.body));
      const req = f.body.find((x) => x.id === cr.body.id);
      assert.ok(req, 'requisicao na fila');
      const pe = req.itens[0].pegar_em;
      assert.ok(pe, `sem pegar_em: ${JSON.stringify(req.itens[0])}`);
      return [pe.lote_codigo, pe.localizacao_id, pe.lote_validade];
    };
    assert.deepStrictEqual(await pegarEm(), ['L-A', ZA, '2027-12-31'], 'antes: o lote com validade (o sem validade vai por ultimo)');
    const r = await entrada(m, { quantidade: 1, lote: 'L-B', data_validade: '2027-06-30', localizacao_destino_id: ZB });
    assert.strictEqual(r.aviso_validade, AVISO_PREENCHIDA('L-B', '2027-06-30'));
    assert.deepStrictEqual(await pegarEm(), ['L-B', ZB, '2027-06-30'], 'depois: o lote preenchido vence antes');
  });

  // ── 5. Pelo servico ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-190.05] pelo servico: o mesmo preenchimento sem o schema (mesma validade, mesmo aviso)', async () => {
    const m = await material();
    await entrada(m, { quantidade: 6, lote: 'L-SRV' });
    const r = await stockService.registrarMovimentacao(db, USERS.ADMIN, {
      material_id: m, tipo: 'ENTRADA', quantidade: 1, lote: 'L-SRV', data_validade: '2027-01-31', motivo: 'e190' });
    assert.strictEqual(r.aviso_validade, AVISO_PREENCHIDA('L-SRV', '2027-01-31'));
    assert.strictEqual((await dbGet(db, 'SELECT data_validade FROM lotes_almoxarifado WHERE id = ?', [await loteId(m, 'L-SRV')])).data_validade,
      '2027-01-31');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
