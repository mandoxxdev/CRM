/**
 * Etapa 16, Task 1 — registro de alertas (`alertRegistry`), varredura `varrerAlertasRegistrados`
 * e configs novas (RN-02, RN-03, RN-06, RN-07; contratos C2/C3/C4 do plano
 * docs/superpowers/plans/2026-08-28-almoxarifado-etapa16-alertas.md).
 *
 * NOTA (achado da revisao do plano): materiais semeados sem movimentacao caem AUTOMATICAMENTE
 * em ESTOQUE_SEM_CONSUMO (`antigaOuNunca(null) === true`) — por isso TODA assercao deste
 * arquivo filtra a fila por `evento` (e payload), NUNCA por total global.
 *
 * Executar: cd server && node tests/api/alertaRegistro.api.test.js
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

function diasAtras(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function diasAFrente(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
const mesAtual = () => new Date().toISOString().slice(0, 7); // AAAA-MM (UTC, como o registro)

async function setConfig(db, chave, valor) {
  await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = ? WHERE chave = ?`, [valor, chave]);
}

let seq = 0;
async function novoMaterial(db, over = {}) {
  seq += 1;
  const m = { codigo: `ALR-${seq}`, nome: `Material Alerta Reg ${seq}`, unidade: 'UN', qtd: 10,
    cliente_id: null, ativo: 1, maxima: 0, ...over };
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_maxima, ativo, proprietario_cliente_id)
     VALUES (?,?,?,?,?,?,?)`,
    [m.codigo, m.nome, m.unidade, m.qtd, m.maxima, m.ativo, m.cliente_id]);
  return { id: r.lastID, codigo: m.codigo, nome: m.nome };
}

let seqF = 0;
async function novaFerramenta(db, over = {}) {
  seqF += 1;
  const r = await dbRun(db, `INSERT INTO ferramentas_almoxarifado
      (codigo_patrimonio, nome, exige_calibracao, ativo)
     VALUES (?,?,?,?)`,
    [over.codigo || `FER-ALR-${seqF}`, over.nome || `Ferramenta ${seqF}`, 1, over.ativo ?? 1]);
  return r.lastID;
}

async function novaCalibracao(db, ferramentaId, dataValidade) {
  await dbRun(db, `INSERT INTO calibracoes_ferramenta_almoxarifado
      (ferramenta_id, data_calibracao, data_validade) VALUES (?,?,?)`,
    [ferramentaId, diasAtras(300), dataValidade]);
}

let seqR = 0;
async function novaRequisicao(db, over = {}) {
  seqR += 1;
  const r = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, status, data_necessidade, ativo)
     VALUES (?,?,?,?,?,?)`,
    [`REQ-ALR-${seqR}`, 1, 'Solicitante Teste', over.status || 'APROVADO',
      over.data_necessidade || null, over.ativo ?? 1]);
  return r.lastID;
}

async function novaReserva(db, materialId, over = {}) {
  const r = await dbRun(db, `INSERT INTO reservas_material_almoxarifado
      (material_id, quantidade, status, expira_em, created_at)
     VALUES (?,?,?,?, datetime('now', ?))`,
    [materialId, over.quantidade || 2, over.status || 'ATIVA', over.expira_em || null,
      `-${over.idade_dias ?? 0} days`]);
  return r.lastID;
}

let seqRec = 0;
async function novoRecebimentoComInspecao(db, materialId, over = {}) {
  seqRec += 1;
  const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, nota_fiscal, created_at) VALUES (?,?, datetime('now', ?))`,
    [`REC-ALR-${seqRec}`, `NF-${seqRec}`, `-${over.idade_dias ?? 0} days`]);
  const item = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, quantidade_em_inspecao)
     VALUES (?,?,?,?,?)`,
    [rec.lastID, materialId, 5, 5, over.em_inspecao ?? 5]);
  return { recebimentoId: rec.lastID, itemId: item.lastID };
}

async function filaPorEvento(db, evento) {
  return dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = ? ORDER BY id ASC`, [evento]);
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

  // ── Cenario 1: CALIBRACAO_VENCENDO + RN-02 (dedupe estavel) ─────────────────────────────────
  await test('1. calibracao vencida enfileira CALIBRACAO_VENCENDO; 2a varredura -> duplicadas=1, enfileiradas=0 (RN-02)', async () => {
    const fid = await novaFerramenta(db);
    const validadeOntem = diasAtras(1);
    await novaCalibracao(db, fid, validadeOntem);

    const r1 = await queueService.varrerAlertasRegistrados(db);
    assert.strictEqual(resultadoDe(r1, 'CALIBRACAO_VENCENDO').enfileiradas, 1, JSON.stringify(r1));
    const hash = hashDedupe('CALIBRACAO_VENCENDO', `calibracao-${fid}-${validadeOntem}`);
    const linhas = await filaPorHash(db, hash);
    assert.strictEqual(linhas.length, 1, 'dedupe deveria ser calibracao-<id>-<data_validade>');
    assert.ok(linhas[0].assunto.startsWith('[Almoxarifado] '), linhas[0].assunto);

    const r2 = await queueService.varrerAlertasRegistrados(db);
    const cal2 = resultadoDe(r2, 'CALIBRACAO_VENCENDO');
    assert.strictEqual(cal2.enfileiradas, 0, JSON.stringify(cal2));
    assert.strictEqual(cal2.duplicadas, 1, JSON.stringify(cal2));
    assert.strictEqual((await filaPorHash(db, hash)).length, 1, '2a varredura nao pode duplicar');
  });

  await test('1b. ferramenta que NUNCA calibrou entra em vencidas com dedupe sem-calibracao (nota C3)', async () => {
    const fid = await novaFerramenta(db);
    // Sem calibracao nenhuma: painelCalibracoes devolve data_validade null em `vencidas`.
    const r = await queueService.varrerAlertasRegistrados(db);
    assert.strictEqual(resultadoDe(r, 'CALIBRACAO_VENCENDO').enfileiradas, 1, JSON.stringify(r));
    const hash = hashDedupe('CALIBRACAO_VENCENDO', `calibracao-${fid}-sem-calibracao`);
    assert.strictEqual((await filaPorHash(db, hash)).length, 1, 'dedupe da nunca-calibrada deveria usar sem-calibracao');
  });

  // ── Cenario 2: REQUISICAO_ATRASADA — status derivado da maquina ─────────────────────────────
  await test('2. requisicao atrasada em APROVADO e AGUARDANDO_COMPRA enfileira; SEGUNDA requisicao ENTREGUE atrasada NAO', async () => {
    const idAprovado = await novaRequisicao(db, { status: 'APROVADO', data_necessidade: diasAtras(1) });
    const idCompra = await novaRequisicao(db, { status: 'AGUARDANDO_COMPRA', data_necessidade: diasAtras(3) });
    // Achado da revisao: o negativo tem de ser uma requisicao NOVA e distinta — reusar a mesma
    // seria falso-verde (o dedupe req-atrasada-<id> mascararia o filtro de status).
    const idEntregue = await novaRequisicao(db, { status: 'ENTREGUE', data_necessidade: diasAtras(5) });

    await queueService.varrerAlertasRegistrados(db);
    assert.strictEqual((await filaPorHash(db, hashDedupe('REQUISICAO_ATRASADA', `req-atrasada-${idAprovado}`))).length, 1, 'APROVADO atrasada tinha de enfileirar');
    assert.strictEqual((await filaPorHash(db, hashDedupe('REQUISICAO_ATRASADA', `req-atrasada-${idCompra}`))).length, 1, 'AGUARDANDO_COMPRA atrasada tinha de enfileirar');
    assert.strictEqual((await filaPorHash(db, hashDedupe('REQUISICAO_ATRASADA', `req-atrasada-${idEntregue}`))).length, 0, 'ENTREGUE atrasada NAO pode enfileirar');

    // Requisicao sem data_necessidade nunca atrasa (limitacao declarada no design).
    const idSemData = await novaRequisicao(db, { status: 'APROVADO', data_necessidade: null });
    await queueService.varrerAlertasRegistrados(db);
    assert.strictEqual((await filaPorHash(db, hashDedupe('REQUISICAO_ATRASADA', `req-atrasada-${idSemData}`))).length, 0, 'sem data_necessidade nao pode enfileirar');
  });

  // ── Cenario 3: RESERVA_PARADA (config 30) + RN-02 pela reserva ──────────────────────────────
  await test('3. reserva ATIVA de 40 dias enfileira RESERVA_PARADA; reserva de 10 dias nao; 2a varredura nao duplica', async () => {
    const mat = await novoMaterial(db);
    const idVelha = await novaReserva(db, mat.id, { idade_dias: 40 });
    const idNova = await novaReserva(db, mat.id, { idade_dias: 10 });

    await queueService.varrerAlertasRegistrados(db);
    const hashVelha = hashDedupe('RESERVA_PARADA', `reserva-parada-${idVelha}`);
    assert.strictEqual((await filaPorHash(db, hashVelha)).length, 1, 'reserva de 40 dias (config 30) tinha de enfileirar');
    assert.strictEqual((await filaPorHash(db, hashDedupe('RESERVA_PARADA', `reserva-parada-${idNova}`))).length, 0, 'reserva de 10 dias nao pode enfileirar');

    // RN-02 pelo lado da reserva: 2a varredura no mesmo estado nao gera linha nova do evento.
    const antes = (await filaPorEvento(db, 'RESERVA_PARADA')).length;
    const r2 = await queueService.varrerAlertasRegistrados(db);
    const res2 = resultadoDe(r2, 'RESERVA_PARADA');
    assert.strictEqual(res2.enfileiradas, 0, JSON.stringify(res2));
    assert.ok(res2.duplicadas >= 1, JSON.stringify(res2));
    assert.strictEqual((await filaPorEvento(db, 'RESERVA_PARADA')).length, antes, '2a varredura nao pode criar linha nova de RESERVA_PARADA');

    // expira_em vencida tambem conta, mesmo com created_at recente.
    const idExpirada = await novaReserva(db, mat.id, { idade_dias: 2, expira_em: diasAtras(1) });
    await queueService.varrerAlertasRegistrados(db);
    assert.strictEqual((await filaPorHash(db, hashDedupe('RESERVA_PARADA', `reserva-parada-${idExpirada}`))).length, 1, 'reserva com expira_em vencida tinha de enfileirar');
  });

  // ── Cenario 4: MATERIAL_SEM_ENDERECO (regua REAL do relatorio) + RN-07 ──────────────────────
  await test('4. sem-endereco: 1 notificacao AGREGADA com total; material de cliente CONTA (RN-07); cliente fora de SEM_CONSUMO', async () => {
    const linhasAgregadas = await filaPorEvento(db, 'MATERIAL_SEM_ENDERECO');
    assert.strictEqual(linhasAgregadas.length, 1, `agregado semanal tem de ser UMA linha: ${JSON.stringify(linhasAgregadas.map((l) => l.id))}`);
    assert.ok(/Total/i.test(linhasAgregadas[0].corpo_texto), `corpo sem total: ${linhasAgregadas[0].corpo_texto}`);

    // Material de cliente sem endereco CONTA (mesma regua e porquê do relatorio homonimo).
    const cli = await dbRun(db, `INSERT INTO clientes (razao_social) VALUES ('Cliente Alerta Reg')`);
    const matCliente = await novoMaterial(db, { cliente_id: cli.lastID, qtd: 10 });
    const entradaSemEnd = alertRegistry.ALERT_REGISTRY.find((e) => e.chave === 'MATERIAL_SEM_ENDERECO');
    const linhas = await entradaSemEnd.listar(db, { dias: null });
    assert.strictEqual(linhas.length, 1, 'listar do sem-endereco devolve UMA linha agregada');
    assert.ok(linhas[0].materiais.some((m) => m.id === matCliente.id), 'material de cliente sem endereco TEM de contar (RN-07)');
    assert.ok(linhas[0].total >= linhas[0].materiais.length, 'total cheio >= janela de 20');

    // E a mesma regua e a do relatorio (fonte unica): o GET devolve o mesmo material.
    const rel = await request(app).get('/api/almoxarifado/relatorios/materiais-sem-endereco');
    assert.strictEqual(rel.status, 200);
    assert.ok(rel.body.find((m) => m.id === matCliente.id), 'relatorio homonimo tem de mostrar o mesmo conjunto');

    // RN-07 lado consumo: material de cliente parado ha 400 dias NAO aparece em ESTOQUE_SEM_CONSUMO.
    await dbRun(db, `UPDATE materiais_almoxarifado SET created_at = datetime('now', '-400 days') WHERE id = ?`, [matCliente.id]);
    await queueService.varrerAlertasRegistrados(db);
    const hashCliente = hashDedupe('ESTOQUE_SEM_CONSUMO', `sem-consumo-${matCliente.id}-${mesAtual()}`);
    assert.strictEqual((await filaPorHash(db, hashCliente)).length, 0, 'material de cliente NAO pode entrar em sem-consumo');
    // Controle positivo da ausencia: material NOSSO sem movimentacao entra.
    const matNosso = await novoMaterial(db, { qtd: 10 });
    await queueService.varrerAlertasRegistrados(db);
    const hashNosso = hashDedupe('ESTOQUE_SEM_CONSUMO', `sem-consumo-${matNosso.id}-${mesAtual()}`);
    assert.strictEqual((await filaPorHash(db, hashNosso)).length, 1, 'material nosso parado TEM de entrar em sem-consumo (senao a ausencia do cliente nao prova nada)');
  });

  // ── Cenario 5: ESTOQUE_EXCESSIVO ────────────────────────────────────────────────────────────
  await test('5. material acima da maxima enfileira ESTOQUE_EXCESSIVO com dedupe excessivo-<id>-<AAAA-MM>', async () => {
    const mat = await novoMaterial(db, { qtd: 10, maxima: 5 });
    await queueService.varrerAlertasRegistrados(db);
    const hash = hashDedupe('ESTOQUE_EXCESSIVO', `excessivo-${mat.id}-${mesAtual()}`);
    const linhas = await filaPorHash(db, hash);
    assert.strictEqual(linhas.length, 1, 'excessivo tinha de enfileirar com o dedupe do C3');
    assert.strictEqual(linhas[0].evento, 'ESTOQUE_EXCESSIVO');
  });

  // ── Cenario 6: QUARENTENA_PARADA (config 7) ─────────────────────────────────────────────────
  await test('6. quarentena de 10 dias enfileira QUARENTENA_PARADA; recebimento de ontem nao', async () => {
    const mat = await novoMaterial(db);
    const velha = await novoRecebimentoComInspecao(db, mat.id, { idade_dias: 10 });
    const nova = await novoRecebimentoComInspecao(db, mat.id, { idade_dias: 1 });

    await queueService.varrerAlertasRegistrados(db);
    assert.strictEqual((await filaPorHash(db, hashDedupe('QUARENTENA_PARADA', `quarentena-${velha.itemId}`))).length, 1, 'quarentena de 10 dias (config 7) tinha de enfileirar');
    assert.strictEqual((await filaPorHash(db, hashDedupe('QUARENTENA_PARADA', `quarentena-${nova.itemId}`))).length, 0, 'quarentena de ontem nao pode enfileirar');
  });

  // ── Cenario 7: RN-03 — toggle mestre desligado ──────────────────────────────────────────────
  await test('7. RN-03: toggle desligado -> varredura devolve tudo zerado e nao enfileira nada', async () => {
    await setConfig(db, 'alertas_estoque_notificar_email', '0');
    try {
      // Condicao NOVA que enfileiraria se o toggle estivesse ligado.
      const mat = await novoMaterial(db);
      const idReserva = await novaReserva(db, mat.id, { idade_dias: 50 });

      const antes = await dbGet(db, `SELECT COUNT(*) AS n FROM fila_notificacoes_almoxarifado`);
      const r = await queueService.varrerAlertasRegistrados(db);
      assert.strictEqual(r.length, alertRegistry.ALERT_REGISTRY.length, 'devolve uma entrada por alerta do registro');
      for (const item of r) {
        assert.strictEqual(item.enfileiradas, 0, JSON.stringify(item));
        assert.strictEqual(item.duplicadas, 0, JSON.stringify(item));
        assert.strictEqual(item.sem_destinatario, 0, JSON.stringify(item));
      }
      const depois = await dbGet(db, `SELECT COUNT(*) AS n FROM fila_notificacoes_almoxarifado`);
      assert.strictEqual(depois.n, antes.n, 'toggle OFF nao pode enfileirar NADA');

      // Controle positivo do cenario: religando, a MESMA condicao enfileira.
      await setConfig(db, 'alertas_estoque_notificar_email', '1');
      await queueService.varrerAlertasRegistrados(db);
      assert.strictEqual((await filaPorHash(db, hashDedupe('RESERVA_PARADA', `reserva-parada-${idReserva}`))).length, 1, 'com o toggle religado a condicao TEM de enfileirar (senao o zero acima nao prova nada)');
    } finally {
      await setConfig(db, 'alertas_estoque_notificar_email', '1');
    }
  });

  // ── Cenario 8: C4 — configs novas validam e a varredura usa o valor novo ────────────────────
  await test('8. C4: alerta_calibracao_dias=0 -> 400 literal; =45 -> 200 e a varredura passa a usar 45', async () => {
    const res0 = await request(app).put('/api/almoxarifado/configuracoes').send({ alerta_calibracao_dias: 0 });
    assert.strictEqual(res0.status, 400, JSON.stringify(res0.body));
    assert.strictEqual(res0.body.error, 'Configuração "alerta_calibracao_dias" deve ser um número de dias maior que zero');

    // Ferramenta com calibracao vencendo em 40 dias: fora da janela default (30).
    const fid = await novaFerramenta(db);
    const validade = diasAFrente(40);
    await novaCalibracao(db, fid, validade);
    await queueService.varrerAlertasRegistrados(db);
    const hash = hashDedupe('CALIBRACAO_VENCENDO', `calibracao-${fid}-${validade}`);
    assert.strictEqual((await filaPorHash(db, hash)).length, 0, 'com janela 30, +40 dias nao pode enfileirar');

    const res45 = await request(app).put('/api/almoxarifado/configuracoes').send({ alerta_calibracao_dias: 45 });
    assert.strictEqual(res45.status, 200, JSON.stringify(res45.body));
    await queueService.varrerAlertasRegistrados(db);
    assert.strictEqual((await filaPorHash(db, hash)).length, 1, 'com janela 45, +40 dias TEM de enfileirar');

    // As outras duas chaves novas tambem validam (mesmo prefixo unico 'alerta_' do C4).
    for (const chave of ['alerta_quarentena_dias', 'alerta_reserva_parada_dias']) {
      const r = await request(app).put('/api/almoxarifado/configuracoes').send({ [chave]: -1 });
      assert.strictEqual(r.status, 400, `${chave}: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, `Configuração "${chave}" deve ser um número de dias maior que zero`);
    }
  });

  await test('A1 do review: listar que lanca NAO silencia os alertas seguintes da varredura', async () => {
    // Reproducao do achado da revisao adversarial: sem try/catch por entrada, o throw da
    // primeira entrada abortava o for e os demais alertas nunca enfileiravam (em silencio).
    // Usa o app/db compartilhados do arquivo (destinatarios e toggle ja configurados no topo).
    const registroSabotado = [
      {
        chave: 'ALERTA_QUEBRADO', titulo: 'Quebrado', descricao: 'sempre lanca',
        configDias: null,
        listar: async () => { throw new Error('boom do listar'); },
        dedupeChave: () => 'nunca', assunto: () => 'x', corpo: () => 'x',
      },
      {
        chave: 'ALERTA_SAUDAVEL', titulo: 'Saudavel', descricao: 'uma linha fixa',
        configDias: null,
        listar: async () => [{ id: 1 }],
        dedupeChave: (l) => `saudavel-${l.id}`, assunto: () => 'ok', corpo: () => 'ok',
      },
    ];
    const r = await queueService.varrerAlertasRegistrados(db, registroSabotado);
    assert.strictEqual(r.length, 2, 'as DUAS entradas tem de aparecer no resultado');
    assert.strictEqual(r[0].chave, 'ALERTA_QUEBRADO');
    assert.strictEqual(r[0].erro, true, 'entrada quebrada marca erro:true');
    assert.ok(/boom do listar/.test(r[0].erro_mensagem));
    assert.strictEqual(r[1].chave, 'ALERTA_SAUDAVEL');
    assert.strictEqual(r[1].enfileiradas, 1, 'o alerta seguinte TEM de enfileirar mesmo com o anterior quebrado');
    const linhas = await filaPorEvento(db, 'ALERTA_SAUDAVEL');
    assert.strictEqual(linhas.length, 1);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
