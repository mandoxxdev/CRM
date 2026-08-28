/**
 * Etapa 17, Task 1 — 4 entradas novas do registro de alertas + `dispararAlertaRegistrado` +
 * config `alerta_eventos_janela_dias` (contratos C1/C2/C3 do plano
 * docs/superpowers/plans/2026-08-28-almoxarifado-etapa17-alertas-evento.md).
 *
 * Mesma licao da Etapa 16: TODA assercao filtra a fila por evento/hash, NUNCA por total global
 * (materiais semeados caem sozinhos em ESTOQUE_SEM_CONSUMO e afins).
 *
 * Executar: cd server && node tests/api/alertaEvento.api.test.js
 */
const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const queueService = require('../../services/almoxarifado/notificationQueueService');
const alertRegistry = require('../../services/almoxarifado/alertRegistry');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

function hashDedupe(evento, dedupeChave) {
  return crypto.createHash('sha256').update(`${evento}|${dedupeChave}`).digest('hex');
}

const mesAtual = () => new Date().toISOString().slice(0, 7); // AAAA-MM (UTC, como o registro)

async function setConfig(db, chave, valor) {
  await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = ? WHERE chave = ?`, [valor, chave]);
}

let seq = 0;
async function novoMaterial(db, over = {}) {
  seq += 1;
  const m = { codigo: `ALE-${seq}`, nome: `Material Alerta Evento ${seq}`, unidade: 'UN', qtd: 10,
    cliente_id: null, ativo: 1, controle_certificado: 0, ...over };
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, proprietario_cliente_id, controle_certificado)
     VALUES (?,?,?,?,?,?,?)`,
    [m.codigo, m.nome, m.unidade, m.qtd, m.ativo, m.cliente_id, m.controle_certificado]);
  return { id: r.lastID, codigo: m.codigo, nome: m.nome };
}

let seqL = 0;
async function novoLote(db, materialId, over = {}) {
  seqL += 1;
  const r = await dbRun(db, `INSERT INTO lotes_almoxarifado
      (material_id, codigo, status, certificado_arquivo)
     VALUES (?,?,?,?)`,
    [materialId, over.codigo || `LT-ALE-${seqL}`, over.status || 'BLOQUEADO', over.certificado || null]);
  if (over.saldo) {
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, lote_id, quantidade)
       VALUES (?,?,?)`, [materialId, r.lastID, over.saldo]);
  }
  return r.lastID;
}

let seqRec = 0;
/**
 * Recebimento com created_at/updated_at controlados: `criado_dias` recua o created_at;
 * `atualizado_dias` recua o updated_at (0 = agora); `atualizado_dias: null` grava NULL
 * (prova o lado COALESCE -> created_at da janela).
 */
async function novoRecebimento(db, over = {}) {
  seqRec += 1;
  const upd = over.atualizado_dias === null
    ? null
    : `datetime('now', '-${over.atualizado_dias ?? 0} days')`;
  const r = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, nota_fiscal, created_at, updated_at)
     VALUES (?,?, datetime('now', '-${over.criado_dias ?? 0} days'), ${upd === null ? 'NULL' : upd})`,
    [`REC-ALE-${seqRec}`, `NF-ALE-${seqRec}`]);
  return { id: r.lastID, numero: `REC-ALE-${seqRec}` };
}

async function novoItemRecebimento(db, recebimentoId, materialId, esperada, recebida) {
  const r = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida)
     VALUES (?,?,?,?)`, [recebimentoId, materialId, esperada, recebida]);
  return r.lastID;
}

async function novaInspecao(db, itemId, over = {}) {
  const r = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
      (recebimento_item_id, conforme, quantidade_aprovada, quantidade_reprovada, encaminhamento,
       responsavel_nome, data_inspecao)
     VALUES (?,?,?,?,?,?, datetime('now', '-${over.idade_dias ?? 0} days'))`,
    [itemId, over.reprovada > 0 ? 0 : 1, over.aprovada ?? 0, over.reprovada ?? 0,
      over.encaminhamento || null, 'Inspetor Teste']);
  return r.lastID;
}

let seqC = 0;
async function novaConferencia(db, over = {}) {
  seqC += 1;
  const dataFim = over.status === 'CONCLUIDO'
    ? `datetime('now', '-${over.fim_dias ?? 0} days')` : 'NULL';
  const r = await dbRun(db, `INSERT INTO conferencias_almoxarifado (numero, status, data_fim)
     VALUES (?,?, ${dataFim})`, [`CONF-ALE-${seqC}`, over.status || 'EM_ANDAMENTO']);
  return { id: r.lastID, numero: `CONF-ALE-${seqC}` };
}

async function novoItemConferencia(db, conferenciaId, materialId, divergencia) {
  await dbRun(db, `INSERT INTO itens_conferencia_almoxarifado
      (conferencia_id, material_id, quantidade_sistema, quantidade_contada, divergencia)
     VALUES (?,?,?,?,?)`,
    [conferenciaId, materialId, 10, 10 + (divergencia ?? 0), divergencia]);
}

async function filaPorHash(db, hash) {
  return dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE hash_dedupe = ?`, [hash]);
}

function resultadoDe(resultados, chave) {
  const r = resultados.find((x) => x.chave === chave);
  assert.ok(r, `varredura nao devolveu entrada para ${chave}: ${JSON.stringify(resultados)}`);
  return r;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  await setConfig(db, 'alertas_estoque_emails', '["a@b.c"]');
  await setConfig(db, 'alertas_estoque_notificar_email', '1');

  // ── Cenario 1: LOTE_SEM_CERTIFICADO (varredura pura, RN-06) ─────────────────────────────────
  await test('1. lote BLOQUEADO sem certificado com saldo enfileira; com certificado, sem saldo e sem controle ficam fora; cliente ENTRA', async () => {
    const mat = await novoMaterial(db, { controle_certificado: 1 });
    // O caso principal REAL: lote sem certificado NASCE BLOQUEADO (receiptService/lotService) —
    // controle positivo contra a copia cega do filtro status='ATIVO' do molde varrerLotesVencendo.
    const loteBloqueado = await novoLote(db, mat.id, { status: 'BLOQUEADO', saldo: 5 });
    const loteComCert = await novoLote(db, mat.id, { certificado: 'uploads/cert.pdf', saldo: 5 });
    const loteSemSaldo = await novoLote(db, mat.id, {});
    // Material SEM controle de certificado: lote sem anexo NAO e pendencia.
    const matSemControle = await novoMaterial(db, { controle_certificado: 0 });
    const loteForaControle = await novoLote(db, matSemControle.id, { saldo: 5 });
    // DECISAO registrada no plano: material de CLIENTE com controle de certificado ENTRA
    // (certificado e rastreabilidade do lote, nao propriedade — coerente com B29/sem-endereco).
    const cli = await dbRun(db, `INSERT INTO clientes (razao_social) VALUES ('Cliente Alerta Evt')`);
    const matCliente = await novoMaterial(db, { controle_certificado: 1, cliente_id: cli.lastID });
    const loteCliente = await novoLote(db, matCliente.id, { saldo: 3 });

    const r = await queueService.varrerAlertasRegistrados(db);
    const res = resultadoDe(r, 'LOTE_SEM_CERTIFICADO');
    assert.ok(res.enfileiradas >= 2, JSON.stringify(res));

    // RN-06: o dedupe carrega o mes (re-lembrete mensal enquanto persistir).
    const hashBloq = hashDedupe('LOTE_SEM_CERTIFICADO', `sem-certificado-${loteBloqueado}-${mesAtual()}`);
    const linhas = await filaPorHash(db, hashBloq);
    assert.strictEqual(linhas.length, 1, 'lote BLOQUEADO sem certificado com saldo TINHA de enfileirar');
    assert.ok(linhas[0].assunto.startsWith('[Almoxarifado] '), linhas[0].assunto);
    assert.strictEqual(JSON.parse(linhas[0].payload).lote_id, loteBloqueado);

    assert.strictEqual((await filaPorHash(db, hashDedupe('LOTE_SEM_CERTIFICADO', `sem-certificado-${loteComCert}-${mesAtual()}`))).length, 0, 'lote com certificado anexado NAO pode enfileirar');
    assert.strictEqual((await filaPorHash(db, hashDedupe('LOTE_SEM_CERTIFICADO', `sem-certificado-${loteSemSaldo}-${mesAtual()}`))).length, 0, 'lote sem saldo NAO pode enfileirar');
    assert.strictEqual((await filaPorHash(db, hashDedupe('LOTE_SEM_CERTIFICADO', `sem-certificado-${loteForaControle}-${mesAtual()}`))).length, 0, 'material sem controle_certificado NAO pode enfileirar');
    assert.strictEqual((await filaPorHash(db, hashDedupe('LOTE_SEM_CERTIFICADO', `sem-certificado-${loteCliente}-${mesAtual()}`))).length, 1, 'material de CLIENTE com controle de certificado TEM de entrar (decisao do plano)');
  });

  // ── Cenario 2: MATERIAL_REPROVADO via listar (RN-03 lado listar + janela configuravel) ──────
  await test('2. listarReprovados: reprovada>0 de ontem dentro; reprovada=0 fora; 10 dias com janela 7 fora e com 15 dentro; dual-mode por inspecaoId', async () => {
    const mat = await novoMaterial(db);
    const rec = await novoRecebimento(db);
    const itemA = await novoItemRecebimento(db, rec.id, mat.id, 10, 10);
    const itemB = await novoItemRecebimento(db, rec.id, mat.id, 10, 10);
    const itemC = await novoItemRecebimento(db, rec.id, mat.id, 10, 10);
    const inspOntem = await novaInspecao(db, itemA, { reprovada: 3, aprovada: 7, idade_dias: 1, encaminhamento: 'DEVOLUCAO' });
    const inspAprovada = await novaInspecao(db, itemB, { reprovada: 0, aprovada: 10, idade_dias: 1 });
    const inspVelha = await novaInspecao(db, itemC, { reprovada: 2, aprovada: 8, idade_dias: 10 });

    const linhas = await alertRegistry.listarReprovados(db, { dias: 7 });
    const deOntem = linhas.find((l) => l.inspecao_id === inspOntem);
    assert.ok(deOntem, 'inspecao com reprovada>0 de ontem TINHA de estar na janela 7');
    assert.strictEqual(deOntem.material_codigo, mat.codigo);
    assert.strictEqual(deOntem.quantidade_reprovada, 3);
    assert.strictEqual(deOntem.encaminhamento, 'DEVOLUCAO');
    assert.strictEqual(deOntem.recebimento_numero, rec.numero);
    assert.ok(deOntem.data_inspecao, 'campo data_inspecao e contrato do C2');
    assert.strictEqual(deOntem.responsavel_nome, 'Inspetor Teste');
    assert.ok(!linhas.find((l) => l.inspecao_id === inspAprovada), 'reprovada=0 NAO pode listar (RN-03)');
    assert.ok(!linhas.find((l) => l.inspecao_id === inspVelha), '10 dias atras com janela 7 NAO pode listar');

    // Dual-mode: por inspecaoId devolve A LINHA do fato, mesmo fora da janela.
    const porId = await alertRegistry.listarReprovados(db, { inspecaoId: inspVelha });
    assert.strictEqual(porId.length, 1, 'modo inspecaoId devolve a linha do fato');
    assert.strictEqual(porId[0].inspecao_id, inspVelha);
    assert.strictEqual(porId[0].quantidade_reprovada, 2);

    // C3: janela configuravel — 0 recusa (prefixo alerta_), 15 passa a incluir a de 10 dias.
    const res0 = await request(app).put('/api/almoxarifado/configuracoes').send({ alerta_eventos_janela_dias: 0 });
    assert.strictEqual(res0.status, 400, JSON.stringify(res0.body));
    const res15 = await request(app).put('/api/almoxarifado/configuracoes').send({ alerta_eventos_janela_dias: 15 });
    assert.strictEqual(res15.status, 200, `seed do C3 precisa existir (PUT so grava chave semeada): ${JSON.stringify(res15.body)}`);
    try {
      await queueService.varrerAlertasRegistrados(db);
      assert.strictEqual((await filaPorHash(db, hashDedupe('MATERIAL_REPROVADO', `reprovado-${inspVelha}`))).length, 1, 'com janela 15, a inspecao de 10 dias TEM de enfileirar');
      assert.strictEqual((await filaPorHash(db, hashDedupe('MATERIAL_REPROVADO', `reprovado-${inspAprovada}`))).length, 0, 'reprovada=0 NAO pode enfileirar nem com janela larga');
    } finally {
      await setConfig(db, 'alerta_eventos_janela_dias', '7');
    }
  });

  // ── Cenario 3: DIVERGENCIA_RECEBIMENTO via listar (RN-04, float-safe, janela COALESCE) ──────
  await test('3. listarDivergenciasRecebimento: 8 de 10 dentro; exata/NULL/1e-10 fora; antigo com updated_at de hoje DENTRO; dual-mode por recebimentoId', async () => {
    const mat = await novoMaterial(db);
    const rec = await novoRecebimento(db);
    const itemDiverg = await novoItemRecebimento(db, rec.id, mat.id, 10, 8);
    const itemExato = await novoItemRecebimento(db, rec.id, mat.id, 10, 10);
    const itemNulo = await novoItemRecebimento(db, rec.id, mat.id, 10, null);
    // Float-safe: 1e-10 esta abaixo do EPSILON_DIVERGENCIA (1e-9) — comparar != cru listaria.
    const itemFloat = await novoItemRecebimento(db, rec.id, mat.id, 10, 10.0000000001);

    // Achado Critico da revisao: recebimento CRIADO ha 30 dias mas conferido HOJE tem de estar
    // na janela — a regua e COALESCE(r.updated_at, r.created_at), nao created_at puro.
    const recAntigo = await novoRecebimento(db, { criado_dias: 30, atualizado_dias: 0 });
    const itemAntigo = await novoItemRecebimento(db, recAntigo.id, mat.id, 5, 3);
    // Controle da janela: antigo E sem toque desde entao fica fora.
    const recParado = await novoRecebimento(db, { criado_dias: 30, atualizado_dias: 30 });
    const itemParado = await novoItemRecebimento(db, recParado.id, mat.id, 5, 3);
    // updated_at NULL: o COALESCE cai no created_at (recente) sem quebrar.
    const recSemUpdated = await novoRecebimento(db, { criado_dias: 1, atualizado_dias: null });
    const itemSemUpdated = await novoItemRecebimento(db, recSemUpdated.id, mat.id, 5, 4);

    const linhas = await alertRegistry.listarDivergenciasRecebimento(db, { dias: 7 });
    const l = linhas.find((x) => x.item_id === itemDiverg);
    assert.ok(l, 'item 8 de 10 TINHA de listar');
    assert.strictEqual(l.material_codigo, mat.codigo);
    assert.strictEqual(l.quantidade_esperada, 10);
    assert.strictEqual(l.quantidade_recebida, 8);
    assert.strictEqual(l.divergencia, -2);
    assert.strictEqual(l.recebimento_numero, rec.numero);
    assert.ok(l.nota_fiscal, 'campo nota_fiscal e contrato do C2');
    assert.ok(!linhas.find((x) => x.item_id === itemExato), 'recebida igual a esperada NAO pode listar');
    assert.ok(!linhas.find((x) => x.item_id === itemNulo), 'recebida NULL (nao conferido) NAO pode listar');
    assert.ok(!linhas.find((x) => x.item_id === itemFloat), '10.0000000001 NAO pode listar (divergenciaRealSql, float-safe)');
    assert.ok(linhas.find((x) => x.item_id === itemAntigo), 'recebimento antigo com updated_at de HOJE tem de estar DENTRO (COALESCE)');
    assert.ok(!linhas.find((x) => x.item_id === itemParado), 'recebimento antigo sem toque recente fica fora da janela');
    assert.ok(linhas.find((x) => x.item_id === itemSemUpdated), 'updated_at NULL cai no created_at recente (COALESCE)');

    // Dual-mode: por recebimentoId devolve OS MESMOS itens divergentes daquele recebimento.
    const porId = await alertRegistry.listarDivergenciasRecebimento(db, { recebimentoId: rec.id });
    assert.strictEqual(porId.length, 1, `modo recebimentoId devolve so os divergentes: ${JSON.stringify(porId.map((x) => x.item_id))}`);
    assert.strictEqual(porId[0].item_id, itemDiverg);
    // E o recebimento parado tambem responde por id (a janela e so do modo dias).
    const porIdParado = await alertRegistry.listarDivergenciasRecebimento(db, { recebimentoId: recParado.id });
    assert.strictEqual(porIdParado.length, 1);
    assert.strictEqual(porIdParado[0].item_id, itemParado);
  });

  // ── Cenario 4: DIVERGENCIA_INVENTARIO via listar (RN-05: agregado, sem impacto) ─────────────
  await test('4. listarDivergenciaConferencia: CONCLUIDO com 2 divergentes = UMA linha itens_divergentes=2 sem impacto_financeiro; EM_ANDAMENTO e zerada fora', async () => {
    const mat = await novoMaterial(db);
    const conf = await novaConferencia(db, { status: 'CONCLUIDO' });
    await novoItemConferencia(db, conf.id, mat.id, 2);
    await novoItemConferencia(db, conf.id, mat.id, -1);
    await novoItemConferencia(db, conf.id, mat.id, 0);
    const confAberta = await novaConferencia(db, { status: 'EM_ANDAMENTO' });
    await novoItemConferencia(db, confAberta.id, mat.id, 5);
    const confZerada = await novaConferencia(db, { status: 'CONCLUIDO' });
    await novoItemConferencia(db, confZerada.id, mat.id, 0);
    await novoItemConferencia(db, confZerada.id, mat.id, 0);

    const linhas = await alertRegistry.listarDivergenciaConferencia(db, { dias: 7 });
    const l = linhas.find((x) => x.conferencia_id === conf.id);
    assert.ok(l, 'conferencia CONCLUIDO divergente TINHA de listar');
    assert.strictEqual(l.itens_divergentes, 2, 'agrega: 2 divergentes (o item zerado nao conta)');
    assert.strictEqual(l.numero, conf.numero);
    assert.ok(l.data_fim, 'campo data_fim e contrato do C2');
    assert.ok(!('impacto_financeiro' in l), 'RN-05/B30: a linha NAO pode carregar impacto_financeiro');
    assert.strictEqual(linhas.filter((x) => x.conferencia_id === conf.id).length, 1, 'UMA linha por conferencia, nunca por item');
    assert.ok(!linhas.find((x) => x.conferencia_id === confAberta.id), 'EM_ANDAMENTO NAO pode listar');
    assert.ok(!linhas.find((x) => x.conferencia_id === confZerada.id), 'conferencia sem divergencia real NAO pode listar');

    // Dual-mode: por conferenciaId devolve a MESMA linha agregada (regua unica p/ o gancho).
    const porId = await alertRegistry.listarDivergenciaConferencia(db, { conferenciaId: conf.id });
    assert.strictEqual(porId.length, 1);
    assert.strictEqual(porId[0].itens_divergentes, 2);
    const porIdZerada = await alertRegistry.listarDivergenciaConferencia(db, { conferenciaId: confZerada.id });
    assert.strictEqual(porIdZerada.length, 0, 'conferencia sem divergencia devolve vazio tambem por id');

    // E o corpo do e-mail (varredura) tambem nao vaza o valor (B30).
    await queueService.varrerAlertasRegistrados(db);
    const fila = await filaPorHash(db, hashDedupe('DIVERGENCIA_INVENTARIO', `inv-diverg-${conf.id}`));
    assert.strictEqual(fila.length, 1, 'conferencia divergente TINHA de enfileirar na varredura');
    assert.ok(!/impacto/i.test(fila[0].corpo_texto), `corpo nao pode citar impacto financeiro: ${fila[0].corpo_texto}`);
    assert.ok(/2/.test(fila[0].corpo_texto), 'corpo diz o NUMERO de itens divergentes');
  });

  // ── Cenario 5: C1 — dispararAlertaRegistrado ────────────────────────────────────────────────
  await test('5. C1: dispara enfileira; repetir = DUPLICADA; chave inexistente lanca; toggle off = DESLIGADO com fila intacta', async () => {
    const mat = await novoMaterial(db);
    const rec = await novoRecebimento(db);
    const item = await novoItemRecebimento(db, rec.id, mat.id, 10, 10);
    const insp = await novaInspecao(db, item, { reprovada: 4, aprovada: 6 });
    const [linha] = await alertRegistry.listarReprovados(db, { inspecaoId: insp });
    assert.ok(linha, 'setup: dual-mode devolve a linha do fato');

    const r1 = await queueService.dispararAlertaRegistrado(db, 'MATERIAL_REPROVADO', linha);
    assert.strictEqual(r1.enfileirada, true, JSON.stringify(r1));
    const hash = hashDedupe('MATERIAL_REPROVADO', `reprovado-${insp}`);
    const fila = await filaPorHash(db, hash);
    assert.strictEqual(fila.length, 1, 'o disparo no ato TEM de estar na fila');
    assert.strictEqual(fila[0].evento, 'MATERIAL_REPROVADO');
    assert.strictEqual(JSON.parse(fila[0].payload).inspecao_id, insp);
    assert.ok(fila[0].corpo_html.includes('<p>'), 'corpo_html escapado linha a linha, como a varredura');

    const r2 = await queueService.dispararAlertaRegistrado(db, 'MATERIAL_REPROVADO', linha);
    assert.strictEqual(r2.enfileirada, false, JSON.stringify(r2));
    assert.strictEqual(r2.motivo, 'DUPLICADA', JSON.stringify(r2));
    assert.strictEqual((await filaPorHash(db, hash)).length, 1, 'repetir o disparo NAO pode duplicar');

    await assert.rejects(
      () => queueService.dispararAlertaRegistrado(db, 'ALERTA_QUE_NAO_EXISTE', linha),
      /Alerta desconhecido: ALERTA_QUE_NAO_EXISTE/,
    );

    // RN-07 lado gancho: toggle mestre off -> DESLIGADO, fila intacta.
    const item2 = await novoItemRecebimento(db, rec.id, mat.id, 10, 10);
    const insp2 = await novaInspecao(db, item2, { reprovada: 1, aprovada: 9 });
    const [linha2] = await alertRegistry.listarReprovados(db, { inspecaoId: insp2 });
    await setConfig(db, 'alertas_estoque_notificar_email', '0');
    try {
      const rOff = await queueService.dispararAlertaRegistrado(db, 'MATERIAL_REPROVADO', linha2);
      assert.strictEqual(rOff.enfileirada, false, JSON.stringify(rOff));
      assert.strictEqual(rOff.motivo, 'DESLIGADO', JSON.stringify(rOff));
      assert.strictEqual((await filaPorHash(db, hashDedupe('MATERIAL_REPROVADO', `reprovado-${insp2}`))).length, 0, 'toggle OFF nao pode enfileirar');
    } finally {
      await setConfig(db, 'alertas_estoque_notificar_email', '1');
    }
    // Controle positivo do desligado: religado, a MESMA linha enfileira.
    const rOn = await queueService.dispararAlertaRegistrado(db, 'MATERIAL_REPROVADO', linha2);
    assert.strictEqual(rOn.enfileirada, true, 'religado TEM de enfileirar (senao o zero acima nao prova nada)');
  });

  // ── Cenario 6: RN-01 — dedupe identico nos DOIS caminhos ────────────────────────────────────
  await test('6. RN-01: disparo no ato seguido de varredura no mesmo estado -> MATERIAL_REPROVADO reporta duplicadas>=1, enfileiradas=0', async () => {
    // Drena o estado pendente primeiro, senao inspecoes antigas ainda na janela contaminariam
    // o `enfileiradas=0` (assercao por evento, mas o contador e da entrada inteira).
    await queueService.varrerAlertasRegistrados(db);

    const mat = await novoMaterial(db);
    const rec = await novoRecebimento(db);
    const item = await novoItemRecebimento(db, rec.id, mat.id, 10, 10);
    const insp = await novaInspecao(db, item, { reprovada: 5, aprovada: 5 });
    const [linha] = await alertRegistry.listarReprovados(db, { inspecaoId: insp });

    const rAto = await queueService.dispararAlertaRegistrado(db, 'MATERIAL_REPROVADO', linha);
    assert.strictEqual(rAto.enfileirada, true, JSON.stringify(rAto));

    const r = await queueService.varrerAlertasRegistrados(db);
    const rep = resultadoDe(r, 'MATERIAL_REPROVADO');
    assert.strictEqual(rep.enfileiradas, 0, JSON.stringify(rep));
    assert.ok(rep.duplicadas >= 1, JSON.stringify(rep));
    assert.strictEqual((await filaPorHash(db, hashDedupe('MATERIAL_REPROVADO', `reprovado-${insp}`))).length, 1, 'ato + varredura = UMA linha na fila');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
