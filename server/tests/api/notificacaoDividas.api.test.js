/**
 * Etapa 12, Task 3 — RN-06: dividas pagas pela fila (lembrete de ferramenta, resumo de
 * solicitacoes de compra geradas, devolucao-sucata em ESTADO_PARCIAL).
 *
 * O harness nao tem SMTP configurado — isto NAO importa aqui: os tres caminhos so ENFILEIRAM
 * (RN-01), nunca enviam. `notificacaoFila.api.test.js` ja prova o worker/envio.
 *
 * Executar: cd server && node tests/api/notificacaoDividas.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const lotService = require('../../services/almoxarifado/lotService');
const queueService = require('../../services/almoxarifado/notificationQueueService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const COMPRAS = { id: 5, nome: 'Comprador', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'compras@test.com' };

async function setConfig(db, chave, valor) {
  await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = ? WHERE chave = ?`, [valor, chave]);
}

let seq = 0;
async function novoMaterial(db, over = {}) {
  seq += 1;
  const m = { codigo: `DIV-${seq}`, nome: `Material Dividas ${seq}`, unidade: 'UN', qtd: 0,
    minima: 0, maxima: 0, controle_lote: 0, ...over };
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, quantidade_minima, quantidade_maxima, controle_lote)
     VALUES (?,?,?,?,1,?,?,?)`,
    [m.codigo, m.nome, m.unidade, m.qtd, m.minima, m.maxima, m.controle_lote]);
  return { id: r.lastID, codigo: m.codigo, nome: m.nome };
}

async function criarFerramentaVencida(db, { diasVencido = 3 } = {}) {
  seq += 1;
  const f = await dbRun(db, `INSERT INTO ferramentas_almoxarifado (codigo_patrimonio, nome, ativo)
    VALUES (?, ?, 1)`, [`FERR-${seq}`, `Ferramenta ${seq}`]);
  const e = await dbRun(db, `INSERT INTO emprestimos_ferramenta_almoxarifado
    (ferramenta_id, colaborador_nome, data_retirada, data_prevista_devolucao, status)
    VALUES (?, ?, datetime('now', '-10 days'), datetime('now', '-' || ? || ' days'), 'EMPRESTADA')`,
    [f.lastID, `Colaborador ${seq}`, diasVencido]);
  return { ferramentaId: f.lastID, emprestimoId: e.lastID };
}

async function filaDe(db, evento) {
  return dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = ? ORDER BY id ASC`, [evento]);
}

async function criarLoteAtivo(db, materialId, over = {}) {
  const r = await dbRun(db, `INSERT INTO lotes_almoxarifado (material_id, codigo, status)
    VALUES (?, ?, 'ATIVO')`, [materialId, over.codigo || `LOTE-DIV-${materialId}`]);
  return r.lastID;
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });
  await setConfig(db, 'alertas_estoque_emails', '["admin-almox@teste.com"]');

  await test('RN-06: lembrete de ferramenta — vencido gera 1 item; 2a varredura no MESMO dia nao duplica', async () => {
    const { emprestimoId } = await criarFerramentaVencida(db, { diasVencido: 3 });

    const r1 = await queueService.varrerLembretesFerramenta(db);
    assert.ok(r1.total >= 1, JSON.stringify(r1));
    assert.ok(r1.enfileiradas >= 1, JSON.stringify(r1));

    const linhas1 = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado
      WHERE evento = 'FERRAMENTA_LEMBRETE' AND payload LIKE ?`, [`%"emprestimo_id":${emprestimoId}%`]);
    assert.strictEqual(linhas1.length, 1, JSON.stringify(linhas1));
    assert.ok(linhas1[0].assunto.startsWith('[Almoxarifado] '), linhas1[0].assunto);
    assert.ok(linhas1[0].corpo_texto.includes(`Empréstimo: #${emprestimoId}`), linhas1[0].corpo_texto);

    // Rodar de novo NO MESMO DIA: o dedupe (evento+chave com a data de hoje) tem de barrar.
    const r2 = await queueService.varrerLembretesFerramenta(db);
    assert.ok(r2.total >= 1, JSON.stringify(r2));

    const linhas2 = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado
      WHERE evento = 'FERRAMENTA_LEMBRETE' AND payload LIKE ?`, [`%"emprestimo_id":${emprestimoId}%`]);
    assert.strictEqual(linhas2.length, 1, 'segunda varredura no mesmo dia NAO pode duplicar o lembrete');
  });

  await test('RN-06: dedupe do lembrete inclui a DATA de hoje na chave (nao so o emprestimo_id)', async () => {
    // Controle de verdade contra a chave "so id": rodar a varredura DUAS VEZES no mesmo processo
    // nao prova que a data faz parte da chave (a data nao muda entre as duas chamadas de
    // qualquer jeito). Este teste calcula a chave-alvo INDEPENDENTE da implementacao
    // (ferramenta-lembrete-<id>-<hoje>) e pre-insere a linha como se o aviso de HOJE ja tivesse
    // saido; se a producao gerar essa MESMA chave, a varredura e no-op (1 linha so). Se a data
    // sair da chave da producao (sabotagem: `ferramenta-lembrete-<id>` sem data), a chave gerada
    // diverge da pre-inserida e um SEGUNDO aviso nasce — e o teste cai.
    const { emprestimoId } = await criarFerramentaVencida(db, { diasVencido: 1 });
    const hoje = new Date().toISOString().slice(0, 10);
    const pre = await queueService.enfileirar(db, {
      evento: 'FERRAMENTA_LEMBRETE',
      dedupe_chave: `ferramenta-lembrete-${emprestimoId}-${hoje}`,
      destinatarios: ['admin-almox@teste.com'],
      assunto: '[Almoxarifado] pre-inserido (simula aviso de hoje ja enviado)',
      payload: { emprestimo_id: emprestimoId },
    });
    assert.strictEqual(pre.enfileirada, true, JSON.stringify(pre));

    await queueService.varrerLembretesFerramenta(db);

    const linhas = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado
      WHERE evento = 'FERRAMENTA_LEMBRETE' AND payload LIKE ?`, [`%"emprestimo_id":${emprestimoId}%`]);
    assert.strictEqual(linhas.length, 1,
      `a chave gerada pela varredura deveria colidir com a pre-inserida (mesma data) — achou ${linhas.length}: ${JSON.stringify(linhas)}`);
  });

  await test('RN-06: lembrete de ferramenta — devolvida nao aparece na varredura', async () => {
    const { emprestimoId } = await criarFerramentaVencida(db, { diasVencido: 5 });
    await dbRun(db, `UPDATE emprestimos_ferramenta_almoxarifado SET status = 'DEVOLVIDA' WHERE id = ?`, [emprestimoId]);

    await queueService.varrerLembretesFerramenta(db);
    const linhas = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado
      WHERE evento = 'FERRAMENTA_LEMBRETE' AND payload LIKE ?`, [`%"emprestimo_id":${emprestimoId}%`]);
    assert.strictEqual(linhas.length, 0, 'emprestimo ja devolvido nao pode gerar lembrete');
  });

  await test('RN-06: solicitacao de compra gerada — UM resumo com os materiais para notificacoes_dest_compras', async () => {
    await setConfig(db, 'notificacoes_dest_compras', 'compras-dest@teste.com');
    const matA = await novoMaterial(db, { minima: 5, maxima: 20, qtd: 0 });
    const matB = await novoMaterial(db, { minima: 5, maxima: 20, qtd: 0 });

    setUser(COMPRAS);
    const res = await request(app).post('/api/almoxarifado/reposicao/gerar-solicitacoes')
      .send({ material_ids: [matA.id, matB.id] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.criadas.length, 2, JSON.stringify(res.body));

    const idsOrdenados = res.body.criadas.map((c) => c.solicitacao_id).sort((a, b) => a - b);
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(`SOLICITACAO_COMPRA|solicitacoes-${idsOrdenados.join('-')}`).digest('hex');
    const linha = await dbGet(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE hash_dedupe = ?`, [hash]);
    assert.ok(linha, 'deveria ter enfileirado o resumo com a chave de dedupe esperada');
    assert.deepStrictEqual(JSON.parse(linha.destinatarios), ['compras-dest@teste.com']);
    assert.ok(linha.corpo_texto.includes(matA.codigo), linha.corpo_texto);
    assert.ok(linha.corpo_texto.includes(matB.codigo), linha.corpo_texto);
    assert.ok(linha.assunto.includes('2'), linha.assunto);

    setUser(ADMIN);
  });

  await test('RN-06: solicitacao de compra — fallback compras_notificar_emails quando dest_compras vazio', async () => {
    await setConfig(db, 'notificacoes_dest_compras', '');
    await setConfig(db, 'compras_notificar_emails', '["fallback-compras@teste.com"]');
    const mat = await novoMaterial(db, { minima: 5, maxima: 20, qtd: 0 });

    setUser(COMPRAS);
    const res = await request(app).post('/api/almoxarifado/reposicao/gerar-solicitacoes')
      .send({ material_ids: [mat.id] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const solId = res.body.criadas.find((c) => c.material_id === mat.id).solicitacao_id;

    const linha = await dbGet(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = 'SOLICITACAO_COMPRA' AND payload LIKE ?`,
      [`%${solId}%`]);
    assert.ok(linha, JSON.stringify(res.body));
    assert.deepStrictEqual(JSON.parse(linha.destinatarios), ['fallback-compras@teste.com']);

    await setConfig(db, 'notificacoes_dest_compras', 'compras-dest@teste.com');
    setUser(ADMIN);
  });

  await test('RN-01: falha de enfileirar NAO derruba gerarSolicitacoesDaSugestao (rota ainda responde 200)', async () => {
    const mat = await novoMaterial(db, { minima: 5, maxima: 20, qtd: 0 });
    const original = queueService.enfileirar;
    queueService.enfileirar = async () => { throw new Error('SABOTAGEM: enfileirar explodiu'); };
    try {
      setUser(COMPRAS);
      const res = await request(app).post('/api/almoxarifado/reposicao/gerar-solicitacoes')
        .send({ material_ids: [mat.id] });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const criada = res.body.criadas.find((c) => c.material_id === mat.id);
      assert.ok(criada, 'a solicitacao tem de ter sido criada mesmo com a fila explodindo');
      const linha = await dbGet(db, `SELECT id FROM solicitacoes_compra_almoxarifado WHERE id = ?`, [criada.solicitacao_id]);
      assert.ok(linha, 'a linha de solicitacao tem de existir de verdade no banco');
    } finally {
      queueService.enfileirar = original;
      setUser(ADMIN);
    }
  });

  await test('RN-06: devolucao ESTADO_PARCIAL — aviso na fila com dedupe devolucao-parcial-<id>', async () => {
    // Engenharia do estado parcial (SUCATA = ENTRADA_DEVOLUCAO + SUCATA, dois registrarMovimentacao
    // separados): o lote esta ATIVO na pre-checagem de returnService E na ENTRADA (que so olha
    // material_id, nao status) — mas fica BLOQUEADO bem a tempo da 3a chamada a
    // lotService.getLote (a que o ramo de SAIDA do motor usa para checar status, stockService:718).
    // E exatamente a corrida que o comentario de returnService.js ja descreve: "um lote
    // BLOQUEADO/REPROVADO deixaria a ENTRADA passar e a SAIDA falhar". Monkeypatch de UMA funcao
    // de servico real (nao dos internos da notificacao), contando chamadas.
    const mat = await novoMaterial(db, { controle_lote: 1, qtd: 0 });
    const loteId = await criarLoteAtivo(db, mat.id);

    let chamadas = 0;
    const originalGetLote = lotService.getLote;
    lotService.getLote = async (dbArg, id) => {
      chamadas += 1;
      if (chamadas === 3) {
        await dbRun(dbArg, `UPDATE lotes_almoxarifado SET status = 'BLOQUEADO' WHERE id = ?`, [id]);
      }
      return originalGetLote(dbArg, id);
    };

    let devolucaoId = null;
    try {
      setUser(ADMIN);
      const res = await request(app).post('/api/almoxarifado/devolucoes').send({
        material_id: mat.id, quantidade: 5, motivo: 'SOBRA_PROJETO', destino: 'SUCATA', lote_id: loteId,
      });
      assert.strictEqual(res.status, 400, JSON.stringify(res.body));
      assert.ok(/bloqueado/i.test(res.body.error), res.body.error);

      const auditRow = await dbGet(db, `SELECT entidade_id FROM auditoria_log_almoxarifado
        WHERE entidade = 'devolucao' AND acao = 'ESTADO_PARCIAL' ORDER BY id DESC LIMIT 1`);
      assert.ok(auditRow, 'deveria ter auditado ESTADO_PARCIAL');
      devolucaoId = auditRow.entidade_id;

      const linha = await dbGet(db, `SELECT * FROM fila_notificacoes_almoxarifado
        WHERE evento = 'DEVOLUCAO_PARCIAL' AND payload LIKE ?`, [`%"devolucao_id":${devolucaoId}%`]);
      assert.ok(linha, 'deveria ter enfileirado o aviso de devolucao parcial');
      assert.deepStrictEqual(JSON.parse(linha.destinatarios), ['admin-almox@teste.com']);
      assert.ok(linha.corpo_texto.includes(mat.codigo), linha.corpo_texto);
      assert.ok(linha.corpo_texto.includes('bloqueado'), linha.corpo_texto);
    } finally {
      lotService.getLote = originalGetLote;
    }
  });

  await test('RN-01: falha de enfileirar NAO substitui nem engole o erro original da devolucao parcial', async () => {
    const mat = await novoMaterial(db, { controle_lote: 1, qtd: 0 });
    const loteId = await criarLoteAtivo(db, mat.id);

    let chamadas = 0;
    const originalGetLote = lotService.getLote;
    lotService.getLote = async (dbArg, id) => {
      chamadas += 1;
      if (chamadas === 3) {
        await dbRun(dbArg, `UPDATE lotes_almoxarifado SET status = 'BLOQUEADO' WHERE id = ?`, [id]);
      }
      return originalGetLote(dbArg, id);
    };
    const originalEnfileirar = queueService.enfileirar;
    queueService.enfileirar = async () => { throw new Error('SABOTAGEM: enfileirar explodiu'); };

    try {
      setUser(ADMIN);
      const res = await request(app).post('/api/almoxarifado/devolucoes').send({
        material_id: mat.id, quantidade: 5, motivo: 'SOBRA_PROJETO', destino: 'SUCATA', lote_id: loteId,
      });
      // O erro que volta para o operador tem de continuar sendo o do MOTOR (lote bloqueado),
      // nunca "SABOTAGEM: enfileirar explodiu" nem um 500 generico.
      assert.strictEqual(res.status, 400, JSON.stringify(res.body));
      assert.ok(/bloqueado/i.test(res.body.error), res.body.error);
      assert.ok(!/SABOTAGEM/.test(res.body.error), res.body.error);
    } finally {
      lotService.getLote = originalGetLote;
      queueService.enfileirar = originalEnfileirar;
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
