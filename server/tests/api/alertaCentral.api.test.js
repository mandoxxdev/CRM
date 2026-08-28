/**
 * Etapa 16, Task 2 — central de alertas: acao `ver_alertas` (C5, RN-04) e
 * GET /api/almoxarifado/alertas/central (C1, RN-01, RN-05) do plano
 * docs/superpowers/plans/2026-08-28-almoxarifado-etapa16-alertas.md.
 *
 * A logica da central vive em `montarCentral(db, registro = ALERT_REGISTRY)` com o registro
 * INJETAVEL — o cenario do `erro:true` passa um registro com um `listar` que lanca (achado da
 * revisao do plano: sem isso a resiliencia so seria provada por sabotagem manual nao
 * versionada).
 *
 * Matriz de perfis com usuarios `role:'usuario'` de proposito — getPerfilFromUser resolve
 * `role:'admin'` ANTES do perfil explicito, entao um "CONSULTA" com role admin seria
 * ADMINISTRADOR e a matriz nao provaria nada.
 *
 * Executar: cd server && node tests/api/alertaCentral.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const queueService = require('../../services/almoxarifado/notificationQueueService');
const alertRegistry = require('../../services/almoxarifado/alertRegistry');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// Usuario padrao das chamadas de setup/consulta: perfil explicito, NUNCA role:'admin'.
const USER_ADMINISTRADOR = { id: 1, nome: 'Adm Central', role: 'usuario', perfil_almoxarifado: 'ADMINISTRADOR' };

async function setConfig(db, chave, valor) {
  await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = ? WHERE chave = ?`, [valor, chave]);
}

function diasAtras(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

let seq = 0;
async function novoMaterial(db) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo)
     VALUES (?,?,?,?,1)`, [`ALC-${seq}`, `Material Central ${seq}`, 'UN', 10]);
  return r.lastID;
}

let seqR = 0;
async function novaRequisicaoAtrasada(db) {
  seqR += 1;
  await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, status, data_necessidade, ativo)
     VALUES (?,?,?,?,?,1)`,
    [`REQ-ALC-${seqR}`, 1, 'Solicitante Central', 'APROVADO', diasAtras(1)]);
}

async function novaReservaParada(db, materialId, idadeDias) {
  const r = await dbRun(db, `INSERT INTO reservas_material_almoxarifado
      (material_id, quantidade, status, created_at)
     VALUES (?,?, 'ATIVA', datetime('now', ?))`, [materialId, 2, `-${idadeDias} days`]);
  return r.lastID;
}

function entradaCentral(body, chave) {
  const e = body.alertas.find((a) => a.chave === chave);
  assert.ok(e, `central sem entrada ${chave}: ${JSON.stringify(body.alertas.map((a) => a.chave))}`);
  return e;
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: USER_ADMINISTRADOR });
  await setConfig(db, 'alertas_estoque_emails', '["a@b.c"]');
  await setConfig(db, 'alertas_estoque_notificar_email', '1');

  // ── RN-04 / C5: matriz de 8 perfis (7 explicitos + sem perfil = fallback PRODUCAO) ──────────
  await test('1. RN-04: matriz de 8 perfis — ADMINISTRADOR/ALMOXARIFE/GESTOR/COMPRAS entram, os demais tomam o 403 padrao', async () => {
    const PERMITIDOS = ['ADMINISTRADOR', 'ALMOXARIFE', 'GESTOR', 'COMPRAS'];
    const NEGADOS = ['PRODUCAO', 'ENGENHARIA', 'CONSULTA'];

    let uid = 100;
    for (const perfil of PERMITIDOS) {
      uid += 1;
      setUser({ id: uid, nome: `User ${perfil}`, role: 'usuario', perfil_almoxarifado: perfil });
      const res = await request(app).get('/api/almoxarifado/alertas/central');
      assert.strictEqual(res.status, 200, `${perfil} devia entrar: ${res.status} ${JSON.stringify(res.body)}`);
      assert.ok(Array.isArray(res.body.alertas), `${perfil}: resposta sem array alertas`);
    }
    for (const perfil of NEGADOS) {
      uid += 1;
      setUser({ id: uid, nome: `User ${perfil}`, role: 'usuario', perfil_almoxarifado: perfil });
      const res = await request(app).get('/api/almoxarifado/alertas/central');
      assert.strictEqual(res.status, 403, `${perfil} devia tomar 403: ${res.status}`);
      assert.strictEqual(res.body.error, 'Sem permissão para esta operação', JSON.stringify(res.body));
      assert.strictEqual(res.body.acao, 'ver_alertas', JSON.stringify(res.body));
    }
    // 8o perfil: usuario SEM perfil — fallback PRODUCAO do getPerfilFromUser (chao de fabrica,
    // nao "sem acesso") — e PRODUCAO esta fora.
    setUser({ id: 999, nome: 'Sem Perfil', role: 'usuario' });
    const semPerfil = await request(app).get('/api/almoxarifado/alertas/central');
    assert.strictEqual(semPerfil.status, 403, `sem perfil (fallback PRODUCAO) devia tomar 403: ${semPerfil.status}`);
    assert.strictEqual(semPerfil.body.perfil, 'PRODUCAO', JSON.stringify(semPerfil.body));

    // C5: a acao nova entra automaticamente em GET /minhas-permissoes (a rota itera ACAO_PERFIS).
    setUser({ id: 200, nome: 'Gestor Perm', role: 'usuario', perfil_almoxarifado: 'GESTOR' });
    const permGestor = await request(app).get('/api/almoxarifado/minhas-permissoes');
    assert.strictEqual(permGestor.body.acoes.ver_alertas, true, JSON.stringify(permGestor.body.acoes));
    setUser({ id: 201, nome: 'Consulta Perm', role: 'usuario', perfil_almoxarifado: 'CONSULTA' });
    const permConsulta = await request(app).get('/api/almoxarifado/minhas-permissoes');
    assert.strictEqual(permConsulta.body.acoes.ver_alertas, false, JSON.stringify(permConsulta.body.acoes));

    setUser(USER_ADMINISTRADOR);
  });

  // ── C1: shape — ordem do registro, dias por alerta, total cheio vs linhas cortadas em 50 ────
  await test('2. C1: ordem = registro, dias certo por alerta, e com 55 requisicoes atrasadas total=55 e linhas=50', async () => {
    for (let i = 0; i < 55; i++) await novaRequisicaoAtrasada(db);

    const res = await request(app).get('/api/almoxarifado/alertas/central');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    // Ordem do array = ordem do ALERT_REGISTRY (C1).
    assert.deepStrictEqual(
      res.body.alertas.map((a) => a.chave),
      alertRegistry.ALERT_REGISTRY.map((e) => e.chave),
      'ordem da central tem de ser a ordem do registro'
    );

    // `dias` resolvido por alerta (defaults semeados no schema); null quando nao ha janela.
    const diasEsperados = {
      CALIBRACAO_VENCENDO: 30,
      ESTOQUE_SEM_CONSUMO: 180,
      ESTOQUE_EXCESSIVO: null,
      QUARENTENA_PARADA: 7,
      MATERIAL_SEM_ENDERECO: null,
      REQUISICAO_ATRASADA: null,
      RESERVA_PARADA: 30,
    };
    for (const [chave, dias] of Object.entries(diasEsperados)) {
      assert.strictEqual(entradaCentral(res.body, chave).dias, dias, `dias de ${chave}`);
    }

    // titulo/descricao vem do registro; total e o numero CHEIO, linhas cortadas em 50.
    const req55 = entradaCentral(res.body, 'REQUISICAO_ATRASADA');
    assert.strictEqual(req55.titulo, 'Requisição atrasada');
    assert.ok(req55.descricao && req55.descricao.length > 0, 'descricao vazia');
    assert.strictEqual(req55.total, 55, `total tem de ser o numero cheio: ${req55.total}`);
    assert.strictEqual(req55.linhas.length, 50, `linhas cortadas em 50: ${req55.linhas.length}`);
    // Linha e o objeto CRU da condicao (o front trata por chave).
    assert.ok(req55.linhas[0].numero && req55.linhas[0].status, JSON.stringify(req55.linhas[0]));
  });

  // ── RN-05: central e ao vivo — condicao resolvida some; a fila NAO encolhe ──────────────────
  await test('3. RN-05: reserva parada aparece na central; resolvida some da central e a fila nao encolhe', async () => {
    const matId = await novoMaterial(db);
    const reservaId = await novaReservaParada(db, matId, 40);

    // Varredura enfileira a notificacao da condicao.
    await queueService.varrerAlertasRegistrados(db);
    const filaAntes = await dbGet(db, `SELECT COUNT(*) AS n FROM fila_notificacoes_almoxarifado WHERE evento = 'RESERVA_PARADA'`);
    assert.ok(filaAntes.n >= 1, 'varredura devia ter enfileirado RESERVA_PARADA');

    const antes = await request(app).get('/api/almoxarifado/alertas/central');
    const entAntes = entradaCentral(antes.body, 'RESERVA_PARADA');
    assert.ok(entAntes.linhas.some((l) => l.id === reservaId), 'condicao criada tem de aparecer na central');

    // Resolve a condicao (reserva deixa de ser ATIVA).
    await dbRun(db, `UPDATE reservas_material_almoxarifado SET status = 'CANCELADA' WHERE id = ?`, [reservaId]);

    const depois = await request(app).get('/api/almoxarifado/alertas/central');
    const entDepois = entradaCentral(depois.body, 'RESERVA_PARADA');
    assert.ok(!entDepois.linhas.some((l) => l.id === reservaId), 'condicao resolvida tem de SUMIR da central (ao vivo, nao e a fila)');
    assert.strictEqual(entDepois.total, entAntes.total - 1, 'total tem de refletir a condicao resolvida');

    const filaDepois = await dbGet(db, `SELECT COUNT(*) AS n FROM fila_notificacoes_almoxarifado WHERE evento = 'RESERVA_PARADA'`);
    assert.strictEqual(filaDepois.n, filaAntes.n, 'a fila NAO encolhe quando a condicao resolve (RN-05)');
  });

  // ── RN-01: fonte unica — total da central = enfileiradas+duplicadas da varredura ────────────
  await test('4. RN-01: no mesmo estado, o total da central bate com enfileiradas+duplicadas da varredura, alerta por alerta', async () => {
    const resultados = await queueService.varrerAlertasRegistrados(db);
    const central = await request(app).get('/api/almoxarifado/alertas/central');
    assert.strictEqual(central.status, 200, JSON.stringify(central.body));

    for (const r of resultados) {
      const ent = entradaCentral(central.body, r.chave);
      assert.strictEqual(r.sem_destinatario, 0, `${r.chave}: destinatario configurado, sem_destinatario devia ser 0`);
      assert.strictEqual(ent.total, r.enfileiradas + r.duplicadas,
        `${r.chave}: central (${ent.total}) e varredura (${r.enfileiradas}+${r.duplicadas}) leram reguas diferentes`);
    }
    // O cenario nao e vacuo: ha pelo menos um alerta com linhas de verdade (as 55 requisicoes).
    assert.ok(entradaCentral(central.body, 'REQUISICAO_ATRASADA').total >= 55, 'cenario vacuo nao prova RN-01');
  });

  // ── C1, erro:true — registro INJETAVEL: um listar que lanca nao derruba a central ───────────
  await test('5. erro num listar individual: entrada vem {erro:true, total:0, linhas:[]} e as demais respondem', async () => {
    const registroSabotado = [
      {
        chave: 'EXPLOSIVO',
        titulo: 'Alerta que explode',
        descricao: 'so existe para lancar',
        configDias: null,
        listar: async () => { throw new Error('boom no listar'); },
        dedupeChave: () => 'explosivo',
        assunto: () => 'x',
        corpo: () => 'x',
      },
      alertRegistry.ALERT_REGISTRY.find((e) => e.chave === 'RESERVA_PARADA'),
    ];

    const central = await alertRegistry.montarCentral(db, registroSabotado);
    assert.strictEqual(central.alertas.length, 2, 'central parcial honesta: TODAS as entradas respondem');
    assert.deepStrictEqual(central.alertas[0],
      { chave: 'EXPLOSIVO', titulo: 'Alerta que explode', erro: true, total: 0, linhas: [] },
      JSON.stringify(central.alertas[0]));
    const viva = central.alertas[1];
    assert.strictEqual(viva.chave, 'RESERVA_PARADA');
    assert.strictEqual(viva.erro, undefined, 'entrada saudavel nao pode vir marcada com erro');
    assert.strictEqual(viva.dias, 30, 'entrada saudavel resolve a config de dias normalmente');
    assert.ok(Array.isArray(viva.linhas));

    // E o GET usa o registro REAL por default: mesmo shape, todas as chaves, nenhuma com erro.
    const res = await request(app).get('/api/almoxarifado/alertas/central');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.alertas.every((a) => a.erro === undefined), 'registro real nao pode ter entrada com erro aqui');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
