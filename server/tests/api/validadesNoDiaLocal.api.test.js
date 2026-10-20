/**
 * Etapa 163 (Almoxarifado) — as validades e os prazos sem hora no dia de Brasilia (C406), pelas rotas reais (createTestApp, com o
 * requirePermission de verdade) e, onde so ha varredura, pelo servico.
 *
 *   RN-163.03 (B1041) calibracao vigente = validade >= hoje de Brasilia: o emprestimo, a medicao na inspecao e o selo da lista
 *   RN-163.04 (B1041) dias_restantes do painel = validade - hoje de Brasilia
 *   RN-163.05 (B1041) emprestimo vencido = prevista < hoje de Brasilia (o filtro, o dias_vencido e a chave do lembrete)
 *   RN-163.06 (B1042) lote vencido = validade < hoje de Brasilia: a lista, a saida e a liberacao do vencimento
 *   RN-163.07 (B1042) o aviso Lote vencendo: validade <= hoje de Brasilia + N
 *   RN-163.08 (B1043) remessa vencida = prazo < referencia ou hoje de Brasilia (o selo, a /vencidas e o aviso)
 *   RN-163.09 (B1044) o mes e a semana das chaves dos avisos no calendario de Brasilia
 *   T4 (integracao)   o mesmo lote de validade HOJE: elegivel, sai, e a liberacao o recusa; o de HOJE-1: o inverso, e liberado sai
 *
 * DEPENDE DO RELOGIO E DO FUSO — e por isso fixa os dois NO PROPRIO PROCESSO (antes de qualquer `Date` do codigo): `TZ=UTC` e o relogio do
 * JavaScript adiantado (tests/helpers/relogioAdiantado.js) para as 22h de Brasilia do ULTIMO DIA DO MES SEGUINTE (HOJE). O hoje de Brasilia
 * (HOJE), o dia UTC do JavaScript (HOJE+1, o dia 1 do outro mes) e o `date('now')` do SQLite (o dia real, semanas antes) sao tres dias e dois
 * meses diferentes a qualquer hora em que a suite rode. A guarda abre os cenarios.
 *
 * Qual borda pega qual sabotagem (Fase 2 I1): a volta ao `date('now')` (o dia real, ANTES de HOJE) so cai no lado HOJE-1 (e nos numeros); a
 * volta ao `toISOString` (HOJE+1) e o modificador do fuso na coluna so caem no lado HOJE. Por isso cada regua tem as DUAS bordas.
 *
 * Plano: docs/superpowers/plans/2026-10-20-almoxarifado-etapa163-a-atividade-editada-e-as-validades-no-dia-de-brasilia.md
 * Executar: cd server && node tests/api/validadesNoDiaLocal.api.test.js
 */
process.env.TZ = 'UTC';
const hojeBrtReal = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date());
const somaDias = (dia, n) => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
const HOJE = (() => { const [a, m] = hojeBrtReal.split('-').map(Number); return new Date(Date.UTC(a, m + 1, 0)).toISOString().slice(0, 10); })();
const ALVO = Date.UTC(...HOJE.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))), 22 + 3, 0); // 22h de Brasilia (UTC-3)
process.env.RELOGIO_ADIANTADO_MS = String(ALVO - Date.now());
require('../helpers/relogioAdiantado');

const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const diaLocal = require('../../services/diaLocal');
const toolReminderService = require('../../services/almoxarifado/toolReminderService');
const queueService = require('../../services/almoxarifado/notificationQueueService');
const receiptService = require('../../services/almoxarifado/receiptService');
const alertRegistry = require('../../services/almoxarifado/alertRegistry');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ONTEM = somaDias(HOJE, -1);
const AMANHA = somaDias(HOJE, 1);
const JUST = { justificativa: 'teste 163', motivo: 'teste 163' };
const hashDedupe = (evento, chave) => crypto.createHash('sha256').update(`${evento}|${chave}`).digest('hex');
const ids = (l) => (Array.isArray(l) ? l.map((x) => x.id) : ['nao e lista: ' + JSON.stringify(l)]);

let seq = 0;
async function novaFerramenta(db, validade, nome = 'Paquimetro 163') {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO ferramentas_almoxarifado (codigo_patrimonio, nome, status, exige_calibracao) VALUES (?,?,'DISPONIVEL',1)`,
    [`FER-163-${seq}`, `${nome} ${seq}`]);
  if (validade) {
    await dbRun(db, `INSERT INTO calibracoes_ferramenta_almoxarifado (ferramenta_id, data_calibracao, data_validade) VALUES (?, '2020-01-01', ?)`,
      [r.lastID, validade]);
  }
  return r.lastID;
}
async function novoMaterial(db, extra = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, material_critico)
    VALUES (?,?,'UN',0,1,?)`, [`MAT-163-${seq}`, `Material 163 ${seq}`, extra.critico ? 1 : 0]);
  return r.lastID;
}
const setConfig = (db, chave, valor) => dbRun(db,
  `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
async function novoEmprestimo(db, prevista) {
  const f = await novaFerramenta(db, null);
  await dbRun(db, `UPDATE ferramentas_almoxarifado SET exige_calibracao = 0, status = 'EMPRESTADA' WHERE id = ?`, [f]);
  const r = await dbRun(db, `INSERT INTO emprestimos_ferramenta_almoxarifado (ferramenta_id, colaborador_nome, data_prevista_devolucao, status)
    VALUES (?, 'Fulano 163', ?, 'EMPRESTADA')`, [f, prevista]);
  return r.lastID;
}

(async () => {
  console.log('\n=== Etapa 163: as validades e os prazos no dia de Brasilia (C406) ===\n');
  const { app, db, close } = await createTestApp({ user: ADMIN });
  const http = (m, u, body) => { const r = request(app)[m](u); return body === undefined ? r : r.send(body); };

  // ── a guarda do relogio ───────────────────────────────────────────────────────────────────────────────────────────────
  let guardaOk = false;
  await test('[guarda] o processo esta nas 22h de Brasilia do ultimo dia do mes seguinte: hoje local, dia UTC e date(now) sao tres dias', async () => {
    const { agora } = await dbGet(db, "SELECT date('now') AS agora");
    assert.strictEqual(diaLocal.hojeLocalISO(), HOJE, 'o hoje de Brasilia do processo nao e o HOJE adiantado');
    assert.strictEqual(new Date().toISOString().slice(0, 10), AMANHA, 'o dia UTC do JavaScript nao e o de amanha');
    assert.notStrictEqual(HOJE.slice(0, 7), AMANHA.slice(0, 7), 'HOJE nao e o ultimo dia do mes');
    assert.ok(agora < ONTEM, `o date('now') do SQLite (${agora}) tem de ser anterior a ONTEM (${ONTEM}) — senao o lado HOJE-1 nao prova nada`);
    guardaOk = true;
  });
  if (!guardaOk) { console.log(`\n${passed} passed, ${failed + 1} failed (guarda)\n`); await close(); process.exit(1); }

  // ── RN-163.03 e .04: calibracao ───────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-163.03, B1041] a calibracao que vale ate HOJE empresta e e vigente na lista; a de ONTEM recusa com a literal e nao e', async () => {
    const vale = await novaFerramenta(db, HOJE);
    const venceu = await novaFerramenta(db, ONTEM);
    const ok = await http('post', `/api/almoxarifado/ferramentas/${vale}/emprestar`, { colaborador_nome: 'Ciclano 163' });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    const nao = await http('post', `/api/almoxarifado/ferramentas/${venceu}/emprestar`, { colaborador_nome: 'Ciclano 163' });
    assert.strictEqual(nao.status, 400, JSON.stringify(nao.body));
    assert.strictEqual(nao.body.error, 'Ferramenta com calibração vencida ou sem calibração registrada');
    const lista = await http('get', '/api/almoxarifado/ferramentas');
    assert.strictEqual(lista.status, 200, JSON.stringify(lista.body));
    const de = (id) => lista.body.find((f) => f.id === id);
    assert.strictEqual(de(vale).calibracao_vigente, true, 'a de HOJE nao e vigente na lista');
    assert.strictEqual(de(venceu).calibracao_vigente, false, 'a de ONTEM e vigente na lista');
  });

  await test('[RN-163.04, B1041] o painel: HOJE = 0 dia (a vencer), ONTEM = -1 (vencida), HOJE+5 = 5', async () => {
    const f0 = await novaFerramenta(db, HOJE);
    const fm1 = await novaFerramenta(db, ONTEM);
    const f5 = await novaFerramenta(db, somaDias(HOJE, 5));
    const r = await http('get', '/api/almoxarifado/calibracoes/painel?dias=30');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const em = (lista, id) => (lista.find((x) => x.id === id) || {}).dias_restantes;
    assert.strictEqual(em(r.body.a_vencer, f0), 0, 'a de HOJE');
    assert.strictEqual(em(r.body.vencidas, fm1), -1, 'a de ONTEM');
    assert.strictEqual(em(r.body.a_vencer, f5), 5, 'a de HOJE+5');
    assert.ok(!r.body.vencidas.some((x) => x.id === f0), 'a de HOJE entre as vencidas');
  });

  await test('[RN-163.03, B1041] a medicao na inspecao (pela rota): o instrumento calibrado ate HOJE mede; o de ONTEM recusa com a literal', async () => {
    await setConfig(db, 'inspecao_material_critico', '1');
    const item = async () => {
      const mat = await novoMaterial(db, { critico: true });
      const rec = await receiptService.criarRecebimento(db, ADMIN, { nota_fiscal: `NF-163-${mat}`, itens: [{ material_id: mat, quantidade: 4 }] });
      await receiptService.aprovarRecebimento(db, ADMIN, rec.id);
      const it = await dbGet(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [rec.id]);
      const plano = await dbRun(db, `INSERT INTO planos_inspecao_almoxarifado (material_id, caracteristica, unidade, valor_nominal, desvio_inferior,
        desvio_superior, ativo) VALUES (?, 'Diametro 163', 'mm', 10, -0.1, 0.1, 1)`, [mat]);
      return { itemId: it.id, plano: plano.lastID };
    };
    const a = await item();
    const vale = await novaFerramenta(db, HOJE, 'Micrometro 163');
    const ok = await http('post', `/api/almoxarifado/recebimentos/itens/${a.itemId}/inspecionar`, {
      quantidade_aprovada: 4, quantidade_reprovada: 0, medidas: [{ plano_id: a.plano, valor_medido: 10, ferramenta_id: vale }] });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    const b = await item();
    const venceu = await novaFerramenta(db, ONTEM, 'Relogio 163');
    const nomeVenceu = (await dbGet(db, 'SELECT nome FROM ferramentas_almoxarifado WHERE id = ?', [venceu])).nome;
    const nao = await http('post', `/api/almoxarifado/recebimentos/itens/${b.itemId}/inspecionar`, {
      quantidade_aprovada: 4, quantidade_reprovada: 0, medidas: [{ plano_id: b.plano, valor_medido: 10, ferramenta_id: venceu }] });
    assert.strictEqual(nao.status, 400, JSON.stringify(nao.body));
    assert.strictEqual(nao.body.error, `Ferramenta com calibração vencida ou sem calibração registrada (${nomeVenceu})`);
  });

  // ── RN-163.05: emprestimos ────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-163.05, B1041] emprestimos vencidos: o que volta HOJE nao; o de ONTEM (1 dia) e o de HOJE-3 (3 dias) sim', async () => {
    const eHoje = await novoEmprestimo(db, HOJE);
    const eOntem = await novoEmprestimo(db, ONTEM);
    const e3 = await novoEmprestimo(db, somaDias(HOJE, -3));
    const r = await http('get', '/api/almoxarifado/emprestimos?vencidos=1');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const vistos = ids(r.body);
    assert.ok(vistos.includes(eOntem) && vistos.includes(e3), 'o de ONTEM e o de HOJE-3 tem de estar vencidos');
    assert.ok(!vistos.includes(eHoje), 'o que volta HOJE saiu vencido');
    const lista = await toolReminderService.listarEmprestimosVencidos(db);
    const dias = (id) => (lista.find((x) => x.id === id) || {}).dias_vencido;
    assert.deepStrictEqual([dias(eOntem), dias(e3), dias(eHoje)], [1, 3, undefined], 'dias_vencido (Fase 2 M3)');
    // o hoje passado explicito manda (a varredura passa o mesmo da chave — Fase 2 I3)
    const comOntem = await toolReminderService.listarEmprestimosVencidos(db, ONTEM);
    assert.ok(!ids(comOntem).includes(eOntem) && ids(comOntem).includes(e3), 'o hojeISO explicito nao foi usado');
  });

  await test('[RN-163.05, B1041] o lembrete: a chave e ferramenta-lembrete-<id>-<HOJE>, so para os vencidos de Brasilia', async () => {
    await setConfig(db, 'alertas_estoque_notificar_email', '1');
    await setConfig(db, 'alertas_estoque_emails', 'almox163@teste.com');
    const eHoje = await novoEmprestimo(db, HOJE);
    const eOntem = await novoEmprestimo(db, ONTEM);
    await queueService.varrerLembretesFerramenta(db);
    const porChave = async (id, dia) => dbAll(db, 'SELECT * FROM fila_notificacoes_almoxarifado WHERE hash_dedupe = ?',
      [hashDedupe('FERRAMENTA_LEMBRETE', `ferramenta-lembrete-${id}-${dia}`)]);
    assert.strictEqual((await porChave(eOntem, HOJE)).length, 1, 'o lembrete do de ONTEM com a chave de HOJE');
    assert.strictEqual((await porChave(eOntem, AMANHA)).length, 0, 'a chave saiu no dia UTC');
    const doHoje = await dbAll(db, "SELECT payload FROM fila_notificacoes_almoxarifado WHERE evento = 'FERRAMENTA_LEMBRETE'");
    assert.ok(!doHoje.some((l) => JSON.parse(l.payload).emprestimo_id === eHoje), 'o que volta HOJE recebeu lembrete');
  });

  // ── RN-163.06 e T4: lote ──────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-163.06, B1042, T4] o lote de validade HOJE: elegivel, sai, e a liberacao o recusa; o de ONTEM: vencido, a saida recusa, liberado sai', async () => {
    const mat = await novoMaterial(db);
    const lote = async (codigo, validade) => (await dbRun(db,
      `INSERT INTO lotes_almoxarifado (material_id, codigo, data_validade, status) VALUES (?,?,?, 'ATIVO')`, [mat, codigo, validade])).lastID;
    const lHoje = await lote('L163-HOJE', HOJE);
    const lOntem = await lote('L163-ONTEM', ONTEM);
    for (const lote_id of [lHoje, lOntem]) {
      const e = await http('post', '/api/almoxarifado/movimentacoes/v2', { material_id: mat, tipo: 'ENTRADA', quantidade: 10, lote_id, ...JUST });
      assert.strictEqual(e.status, 201, JSON.stringify(e.body));
    }
    const lista = await http('get', `/api/almoxarifado/materiais/${mat}/lotes`);
    assert.strictEqual(lista.status, 200, JSON.stringify(lista.body));
    const de = (id) => lista.body.find((l) => l.id === id);
    assert.deepStrictEqual([de(lHoje).vencido, de(lHoje).elegivel], [false, true], 'o de HOJE na lista');
    assert.deepStrictEqual([de(lOntem).vencido, de(lOntem).elegivel], [true, false], 'o de ONTEM na lista');

    const sai = (lote_id, quantidade) => http('post', '/api/almoxarifado/movimentacoes/v2', { material_id: mat, tipo: 'SAIDA', quantidade, lote_id, ...JUST });
    const s1 = await sai(lHoje, 3);
    assert.strictEqual(s1.status, 201, `o lote que vence HOJE nao saiu: ${JSON.stringify(s1.body)}`);
    const s2 = await sai(lOntem, 2);
    assert.strictEqual(s2.status, 400, JSON.stringify(s2.body));
    assert.strictEqual(s2.body.error, 'Lote L163-ONTEM vencido em ' + ONTEM + ' nao pode sair para consumo. '
      + 'Libere o vencimento do lote (PUT /api/almoxarifado/lotes/:id/liberar-vencimento) com justificativa, '
      + 'ou baixe por SUCATA/PERDA ou corrija por AJUSTE.');

    const libHoje = await http('put', `/api/almoxarifado/lotes/${lHoje}/liberar-vencimento`, { justificativa: 'usar mesmo assim' });
    assert.strictEqual(libHoje.status, 400, JSON.stringify(libHoje.body));
    assert.strictEqual(libHoje.body.error, 'Lote nao esta vencido; nao ha vencimento para liberar');
    const semJust = await http('put', `/api/almoxarifado/lotes/${lOntem}/liberar-vencimento`, {});
    assert.strictEqual(semJust.status, 400, JSON.stringify(semJust.body));
    const libOntem = await http('put', `/api/almoxarifado/lotes/${lOntem}/liberar-vencimento`, { justificativa: 'ensaio refeito, aprovado' });
    assert.strictEqual(libOntem.status, 200, JSON.stringify(libOntem.body));
    const s3 = await sai(lOntem, 2);
    assert.strictEqual(s3.status, 201, `liberado, o de ONTEM nao saiu: ${JSON.stringify(s3.body)}`);
    const saldo = async (loteId) => (await dbGet(db, 'SELECT COALESCE(SUM(quantidade),0) AS q FROM estoque_saldo_almoxarifado WHERE lote_id = ?', [loteId])).q;
    assert.deepStrictEqual([await saldo(lHoje), await saldo(lOntem)], [7, 8], 'o saldo dos dois lotes');
  });

  await test('[RN-163.07, B1042] o aviso Lote vencendo com N = 10: HOJE+10 entra, HOJE+11 nao', async () => {
    await setConfig(db, 'alertas_estoque_notificar_email', '1');
    await setConfig(db, 'alertas_estoque_emails', 'almox163@teste.com');
    await setConfig(db, 'alerta_lote_vencendo_dias', '10');
    const mat = await novoMaterial(db);
    const lote = async (codigo, validade) => {
      const id = (await dbRun(db, `INSERT INTO lotes_almoxarifado (material_id, codigo, data_validade, status) VALUES (?,?,?, 'ATIVO')`,
        [mat, codigo, validade])).lastID;
      const e = await http('post', '/api/almoxarifado/movimentacoes/v2', { material_id: mat, tipo: 'ENTRADA', quantidade: 5, lote_id: id, ...JUST });
      assert.strictEqual(e.status, 201, JSON.stringify(e.body));
      return id;
    };
    const dentro = await lote('L163-N', somaDias(HOJE, 10));
    const fora = await lote('L163-N1', somaDias(HOJE, 11));
    await queueService.varrerLotesVencendo(db);
    const avisados = (await dbAll(db, "SELECT payload FROM fila_notificacoes_almoxarifado WHERE evento = 'LOTE_VENCENDO'"))
      .map((l) => JSON.parse(l.payload).lote_id);
    assert.ok(avisados.includes(dentro), 'o de HOJE+10 nao foi avisado');
    assert.ok(!avisados.includes(fora), 'o de HOJE+11 foi avisado (o teto contou do dia UTC)');
  });

  // ── RN-163.08: remessa ────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-163.08, B1043] remessa: a de prazo HOJE nao e vencida, a de ONTEM e — no selo, na /vencidas (com e sem referencia) e no aviso', async () => {
    const remessa = async (prazo) => (await dbRun(db, `INSERT INTO remessas_terceiro_almoxarifado (numero, fornecedor_nome, prazo_previsto, status)
      VALUES (?, 'Galvanizadora 163', ?, 'ENVIADA')`, [`REM-163-${++seq}`, prazo])).lastID;
    const rHoje = await remessa(HOJE);
    const rOntem = await remessa(ONTEM);
    const lista = await http('get', '/api/almoxarifado/remessas-terceiros');
    assert.strictEqual(lista.status, 200, JSON.stringify(lista.body));
    const selo = (id) => lista.body.find((r) => r.id === id).vencida;
    assert.deepStrictEqual([selo(rHoje), selo(rOntem)], [0, 1], 'o selo vencida');
    const v = await http('get', '/api/almoxarifado/remessas-terceiros/vencidas');
    assert.strictEqual(v.status, 200, JSON.stringify(v.body));
    assert.ok(ids(v.body.remessas).includes(rOntem) && !ids(v.body.remessas).includes(rHoje), 'a /vencidas sem referencia');
    assert.strictEqual(v.body.referencia, null, 'o contrato: sem referencia na query, null na resposta');
    const vazia = await http('get', '/api/almoxarifado/remessas-terceiros/vencidas?referencia=');
    assert.ok(ids(vazia.body.remessas).includes(rOntem) && !ids(vazia.body.remessas).includes(rHoje), 'a referencia vazia e o hoje');
    const amanha = await http('get', `/api/almoxarifado/remessas-terceiros/vencidas?referencia=${AMANHA}`);
    assert.ok(ids(amanha.body.remessas).includes(rHoje), 'a referencia explicita nao foi usada');
    assert.strictEqual(amanha.body.referencia, AMANHA);
    const filtro = await http('get', '/api/almoxarifado/remessas-terceiros?vencidas=1');
    assert.ok(ids(filtro.body).includes(rOntem) && !ids(filtro.body).includes(rHoje), 'o filtro vencidas=1 da lista');
    await setConfig(db, 'alertas_estoque_notificar_email', '1');
    await setConfig(db, 'alertas_estoque_emails', 'almox163@teste.com');
    await queueService.varrerRemessasVencidas(db);
    const avisadas = (await dbAll(db, "SELECT payload FROM fila_notificacoes_almoxarifado WHERE evento = 'REMESSA_VENCIDA'"))
      .map((l) => JSON.parse(l.payload).remessa_id);
    assert.ok(avisadas.includes(rOntem) && !avisadas.includes(rHoje), 'o aviso de remessa vencida');
  });

  // ── RN-163.09: as chaves ──────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-163.09, B1044] as chaves mensais (pela dedupeChave do registro) no mes de Brasilia; a semana no dia de Brasilia', async () => {
    const entrada = (chave) => alertRegistry.ALERT_REGISTRY.find((e) => e.chave === chave);
    const mes = HOJE.slice(0, 7);
    assert.strictEqual(entrada('ESTOQUE_SEM_CONSUMO').dedupeChave({ material_id: 7 }), `sem-consumo-7-${mes}`);
    assert.strictEqual(entrada('ESTOQUE_EXCESSIVO').dedupeChave({ material_id: 7 }), `excessivo-7-${mes}`);
    assert.strictEqual(entrada('LOTE_SEM_CERTIFICADO').dedupeChave({}), `sem-certificado-${mes}`);
    // a semana: domingo 2026-11-01 as 22h de Brasilia (UTC: segunda 02/11 01h) ainda e a semana 44 (a de segunda 26/10); a segunda 00h30 e a 45
    assert.strictEqual(alertRegistry.semanaIso(new Date('2026-11-02T01:00:00Z')), '2026-W44');
    assert.strictEqual(alertRegistry.semanaIso(new Date('2026-11-02T03:30:00Z')), '2026-W45');
    // a virada do ano ISO continua: quinta 31/12/2026 23h de Brasilia = 2026-W53; sexta 01/01/2027 = 2026-W53 (o ano ISO do meio da semana)
    assert.strictEqual(alertRegistry.semanaIso(new Date('2027-01-01T02:00:00Z')), '2026-W53');
    assert.strictEqual(alertRegistry.semanaIso(new Date('2027-01-04T12:00:00Z')), '2027-W01');
    assert.strictEqual(entrada('MATERIAL_SEM_ENDERECO').dedupeChave({}), `sem-endereco-${alertRegistry.semanaIso()}`);
    assert.strictEqual(alertRegistry.mesAtual(new Date('2026-11-01T02:30:00Z')), '2026-10', 'as 23h30 de 31/10 ainda e outubro');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
