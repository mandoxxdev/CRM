/**
 * Etapa 67, Task 1 (tronco) — os indicadores da spec 27 no `indicadores`: requisicoes no prazo,
 * requisicoes integrais, numero de ajustes; e os dois defeitos achados na medicao:
 *   C89 — o tempo de atendimento contava requisicao EXCLUIDA (o DELETE estorna e deixa
 *         data_entrega preenchido);
 *   M-1 — todosItensCompletos comparava sem epsilon: dez entregas de 0,1 somam 0,9999999999999999
 *         e a requisicao nunca virava ENTREGUE (nem ganhava data_entrega).
 * E a validacao de formato de data_necessidade na criacao (Fase 2, critico 1): 400
 * "data_necessidade deve estar no formato AAAA-MM-DD"; vazio/null = sem prazo.
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa67-indicadores-spec27.md (a secao
 * "Fase 2 — revisao do plano" prevalece).
 *
 * "Hoje" vem SEMPRE do SQLite (`date('now')`): a regua do relatorio e o dia UTC, e `new Date()`
 * local as 21h de Brasilia ja diz outro dia — o teste ficaria intermitente.
 *
 * Requisicoes entram pela ROTA (criar -> aprovar -> separar -> entregar/encerrar/excluir); so as
 * linhas que nenhuma rota consegue produzir sao semeadas a mao (legado DD/MM/AAAA, que a criacao
 * agora recusa; e `ativo = 0` com status VIVO, que o DELETE nunca deixa — ele grava CANCELADO —
 * e e a unica forma de provar que o filtro `ativo` de cada bloco novo existe de verdade).
 *
 * Executar: cd server && node tests/api/relatoriosIndicadoresSpec27.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbGet, dbRun, dbAll } = require('../../services/almoxarifado/db');
const reportService = require('../../services/almoxarifado/reportService');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 67, nome: 'Admin Etapa67', role: 'admin', is_superadmin: 1, email: 'e67@test.com' };
const APROVADOR = { id: 671, nome: 'Aprovador E67', role: 'admin', is_superadmin: 1, email: 'e67b@test.com' };
const FORMATO = 'data_necessidade deve estar no formato AAAA-MM-DD';
const JANELA = 30;

let seq = 0;

(async () => {
  console.log('\n=== Etapa 67 Task 1: indicadores da spec 27 (no prazo, integrais, ajustes) + C89 + M-1 ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });

  const dia = async (n) => (await dbGet(db, `SELECT date('now', ?) AS d`, [`${-n} days`])).d;
  const HOJE = await dia(0);

  const loc = async () => {
    const c = `E67-L${++seq}`;
    return (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', [c, c])).lastID;
  };
  // Material com saldo entrado PELO MOTOR (rota v2), para a entrega da requisicao baixar de verdade.
  const material = async ({ saldo = 100, cliente = null } = {}) => {
    const P = await loc();
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, tipo_material, localizacao_padrao_id, proprietario_cliente_id)
      VALUES (?, 'Mat E67', 'UN', 0, 1, 'ACO', ?, ?)`, [`E67-M${++seq}`, P, cliente])).lastID;
    setUser({ ...ADMIN });
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: id, tipo: 'ENTRADA', quantidade: saldo, localizacao_destino_id: P, motivo: 'setup' });
    assert.strictEqual(r.status, 201, `setup ENTRADA: ${JSON.stringify(r.body)}`);
    return id;
  };

  // Cria pela rota e aprova com OUTRO admin (segregacao). Devolve { id, itens: [itemId...] }.
  const criarAprovada = async (itens, dataNecessidade) => {
    setUser({ ...ADMIN });
    const body = { os_referencia: 'OS-INT', itens: itens.map(([material_id, quantidade]) => ({ material_id, quantidade })) };
    if (dataNecessidade !== undefined) body.data_necessidade = dataNecessidade;
    const cr = await request(app).post('/api/almoxarifado/requisicoes').send(body);
    assert.strictEqual(cr.status, 201, `criar: ${JSON.stringify(cr.body)}`);
    setUser({ ...APROVADOR });
    const ap = await request(app).put(`/api/almoxarifado/requisicoes/${cr.body.id}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    setUser({ ...ADMIN });
    const det = await request(app).get(`/api/almoxarifado/requisicoes/${cr.body.id}`);
    return { id: cr.body.id, itens: det.body.itens.map((i) => i.id) };
  };
  const separar = async (reqId, pares) => {
    setUser({ ...ADMIN });
    const r = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/separar`)
      .send({ itens_separados: pares.map(([item_id, quantidade_separada]) => ({ item_id, quantidade_separada })) });
    assert.strictEqual(r.status, 200, `separar: ${JSON.stringify(r.body)}`);
  };
  const entregar = async (reqId, pares) => {
    setUser({ ...ADMIN });
    const r = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: pares.map(([item_id, quantidade_atendida]) => ({ item_id, quantidade_atendida })) });
    assert.strictEqual(r.status, 200, `entregar: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const encerrar = async (reqId) => {
    setUser({ ...ADMIN });
    const r = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/encerrar`).send({ motivo: 'E67' });
    assert.strictEqual(r.status, 200, `encerrar: ${JSON.stringify(r.body)}`);
  };
  const excluir = async (reqId) => {
    setUser({ ...ADMIN });
    const r = await request(app).delete(`/api/almoxarifado/requisicoes/${reqId}`).send({ justificativa: 'E67' });
    assert.strictEqual(r.status, 200, `excluir: ${JSON.stringify(r.body)}`);
  };
  // Requisicao completa: criar -> aprovar -> separar tudo -> entregar tudo.
  const entregueCompleta = async (dataNecessidade, qtd = 2) => {
    const m = await material();
    const r = await criarAprovada([[m, qtd]], dataNecessidade);
    await separar(r.id, [[r.itens[0], qtd]]);
    const e = await entregar(r.id, [[r.itens[0], qtd]]);
    assert.strictEqual(e.status, 'ENTREGUE', JSON.stringify(e));
    return r;
  };
  // Parcial: dois itens, entrega so o primeiro.
  const entregueParcial = async (dataNecessidade) => {
    const m1 = await material(); const m2 = await material();
    const r = await criarAprovada([[m1, 2], [m2, 3]], dataNecessidade);
    await separar(r.id, [[r.itens[0], 2], [r.itens[1], 3]]);
    const e = await entregar(r.id, [[r.itens[0], 2]]);
    assert.strictEqual(e.status, 'PARCIALMENTE_ATENDIDA', JSON.stringify(e));
    return r;
  };

  const indic = async () => {
    setUser({ ...ADMIN });
    const r = await request(app).get(`/api/almoxarifado/relatorios/indicadores?janela_dias=${JANELA}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const delta = (antes, depois, bloco) => {
    const out = {};
    for (const k of Object.keys(depois[bloco])) {
      if (typeof depois[bloco][k] === 'number' && k !== 'percentual' && k !== 'media_horas') {
        out[k] = depois[bloco][k] - (antes[bloco]?.[k] ?? 0);
      }
    }
    return out;
  };

  // ══════════════ C89 — primeiro cenario: reproduzir o defeito (VERMELHO antes do fix) ══════════════
  await test('[C89/RN-04] excluir requisicao ENTREGUE pela rota tira do atendimento; a nao excluida continua', async () => {
    const antes = await indic();
    const viva = await entregueCompleta(HOJE);
    const morta = await entregueCompleta(HOJE);
    const meio = await indic();
    assert.strictEqual(meio.atendimento_requisicoes.total_consideradas - antes.atendimento_requisicoes.total_consideradas, 2,
      `as duas entregas completas tinham de contar: ${JSON.stringify(meio.atendimento_requisicoes)}`);
    await excluir(morta.id);
    const row = await dbGet(db, 'SELECT ativo, status, data_entrega FROM requisicoes_almoxarifado WHERE id = ?', [morta.id]);
    assert.strictEqual(row.ativo, 0); // a forma do dado que gera o defeito: excluida, data_entrega preenchido
    assert.ok(row.data_entrega, 'o DELETE nao limpa data_entrega — e por isso que o filtro tem de ser no relatorio');
    const depois = await indic();
    assert.strictEqual(depois.atendimento_requisicoes.total_consideradas - antes.atendimento_requisicoes.total_consideradas, 1,
      `C89: a requisicao excluida continuou no tempo de atendimento: ${JSON.stringify(depois.atendimento_requisicoes)}`);
    // metade positiva: a viva continua contada nos tres blocos
    assert.ok(viva.id);
    assert.strictEqual(depois.requisicoes_no_prazo.no_prazo - antes.requisicoes_no_prazo.no_prazo, 1,
      `RN-04: so a viva fica no prazo: ${JSON.stringify(depois.requisicoes_no_prazo)}`);
    assert.strictEqual(depois.requisicoes_integrais.integrais - antes.requisicoes_integrais.integrais, 1,
      `RN-04: so a viva fica integral: ${JSON.stringify(depois.requisicoes_integrais)}`);
  });

  await test('[RN-04] linha ativo=0 com status VIVO (ENTREGUE, prazo hoje) nao entra em nenhum bloco de requisicao', async () => {
    const antes = await indic();
    // Semeada a mao: o DELETE grava CANCELADO junto com ativo=0, entao so o status ja a tiraria —
    // esta linha prova que o filtro `ativo` existe em cada bloco, nao que o status a esconde.
    await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, status, ativo, data_necessidade, data_entrega, created_at)
      VALUES (?, 67, 'x', 'ENTREGUE', 0, ?, CURRENT_TIMESTAMP, datetime('now','-1 hours'))`, [`E67-INATIVA-${++seq}`, HOJE]);
    await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, status, ativo, data_necessidade, created_at)
      VALUES (?, 67, 'x', 'PARCIALMENTE_ATENDIDA', 0, ?, CURRENT_TIMESTAMP)`, [`E67-INATIVA-${++seq}`, await dia(2)]);
    await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, status, ativo, data_necessidade, created_at)
      VALUES (?, 67, 'x', 'PENDENTE', 0, NULL, CURRENT_TIMESTAMP)`, [`E67-INATIVA-${++seq}`]);
    const depois = await indic();
    assert.deepStrictEqual(delta(antes, depois, 'requisicoes_no_prazo'),
      { no_prazo: 0, fora_do_prazo: 0, consideradas: 0, em_aberto_no_dia: 0, sem_data_valida: 0 },
      `RN-04 no prazo: ${JSON.stringify(depois.requisicoes_no_prazo)}`);
    assert.deepStrictEqual(delta(antes, depois, 'requisicoes_integrais'),
      { integrais: 0, encerradas_incompletas: 0, consideradas: 0 },
      `RN-04 integrais: ${JSON.stringify(depois.requisicoes_integrais)}`);
    assert.strictEqual(depois.atendimento_requisicoes.total_consideradas, antes.atendimento_requisicoes.total_consideradas,
      `RN-04 atendimento: ${JSON.stringify(depois.atendimento_requisicoes)}`);
  });

  // ══════════════ RN-01 — no prazo ══════════════
  await test('[RN-01 +] prazo HOJE, entregue completa hoje -> no_prazo +1 (o dia do prazo conta)', async () => {
    const antes = await indic();
    await entregueCompleta(HOJE);
    const depois = await indic();
    assert.deepStrictEqual(delta(antes, depois, 'requisicoes_no_prazo'),
      { no_prazo: 1, fora_do_prazo: 0, consideradas: 1, em_aberto_no_dia: 0, sem_data_valida: 0 },
      JSON.stringify(depois.requisicoes_no_prazo));
  });

  await test('[RN-01 -] prazo ha 2 dias: entregue hoje e parcial -> fora_do_prazo +2, no_prazo igual', async () => {
    const antes = await indic();
    await entregueCompleta(await dia(2));
    await entregueParcial(await dia(2));
    const depois = await indic();
    assert.deepStrictEqual(delta(antes, depois, 'requisicoes_no_prazo'),
      { no_prazo: 0, fora_do_prazo: 2, consideradas: 2, em_aberto_no_dia: 0, sem_data_valida: 0 },
      JSON.stringify(depois.requisicoes_no_prazo));
  });

  await test('[RN-01/D2] PENDENTE com prazo vencido e parcial ENCERRADA contam como fora do prazo', async () => {
    const antes = await indic();
    const m = await material();
    setUser({ ...ADMIN });
    const cr = await request(app).post('/api/almoxarifado/requisicoes')
      .send({ os_referencia: 'OS-INT', itens: [{ material_id: m, quantidade: 1 }], data_necessidade: await dia(1) });
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    const p = await entregueParcial(await dia(3));
    await encerrar(p.id);
    const depois = await indic();
    assert.deepStrictEqual(delta(antes, depois, 'requisicoes_no_prazo'),
      { no_prazo: 0, fora_do_prazo: 2, consideradas: 2, em_aberto_no_dia: 0, sem_data_valida: 0 },
      JSON.stringify(depois.requisicoes_no_prazo));
  });

  // ══════════════ RN-02 — fora do denominador ══════════════
  await test('[RN-02] prazo HOJE nao entregue -> em_aberto_no_dia +1, consideradas igual', async () => {
    const antes = await indic();
    await criarAprovada([[await material(), 1]], HOJE);
    const depois = await indic();
    assert.deepStrictEqual(delta(antes, depois, 'requisicoes_no_prazo'),
      { no_prazo: 0, fora_do_prazo: 0, consideradas: 0, em_aberto_no_dia: 1, sem_data_valida: 0 },
      JSON.stringify(depois.requisicoes_no_prazo));
  });

  await test('[RN-02] sem data / legado DD/MM/AAAA -> sem_data_valida; o mesmo prazo em AAAA-MM-DD -> consideradas', async () => {
    const antes = await indic();
    await criarAprovada([[await material(), 1]], null); // sem prazo (rota)
    await criarAprovada([[await material(), 1]], ''); // vazio = sem prazo (rota)
    // legado: a criacao agora recusa, entao so semeado (a forma que ja esta no banco de producao)
    const legado = (await dia(3)).split('-').reverse().join('/');
    await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, status, data_necessidade) VALUES (?, 67, 'x', 'PENDENTE', ?)`,
    [`E67-LEG-${++seq}`, legado]);
    const meio = await indic();
    assert.deepStrictEqual(delta(antes, meio, 'requisicoes_no_prazo'),
      { no_prazo: 0, fora_do_prazo: 0, consideradas: 0, em_aberto_no_dia: 0, sem_data_valida: 3 },
      JSON.stringify(meio.requisicoes_no_prazo));
    // metade negativa: o MESMO dia no formato certo entra no denominador (PENDENTE vencida = fora)
    await criarAprovada([[await material(), 1]], await dia(3));
    const depois = await indic();
    assert.deepStrictEqual(delta(meio, depois, 'requisicoes_no_prazo'),
      { no_prazo: 0, fora_do_prazo: 1, consideradas: 1, em_aberto_no_dia: 0, sem_data_valida: 0 },
      JSON.stringify(depois.requisicoes_no_prazo));
  });

  await test('[RN-02] prazo antes da janela ou no futuro -> fora de tudo', async () => {
    const antes = await indic();
    await criarAprovada([[await material(), 1]], await dia(JANELA + 5));
    await criarAprovada([[await material(), 1]], await dia(-3));
    const depois = await indic();
    assert.deepStrictEqual(delta(antes, depois, 'requisicoes_no_prazo'),
      { no_prazo: 0, fora_do_prazo: 0, consideradas: 0, em_aberto_no_dia: 0, sem_data_valida: 0 },
      JSON.stringify(depois.requisicoes_no_prazo));
  });

  // ══════════════ Fase 5 (A): bordas que nenhum teste fixava (mutantes sobreviventes) ══════════════
  await test('[Fase5/A RN-01] entregue completa no dia SEGUINTE ao prazo -> fora do prazo (sem tolerancia de 1 dia)', async () => {
    const antes = await indic();
    const r = await entregueCompleta(await dia(2));
    // semeado (declarado): nenhuma rota entrega "ontem"; o prazo e D-2 e a entrega D-1 10:00 UTC
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET data_entrega = ? WHERE id = ?', [`${await dia(1)} 10:00:00`, r.id]);
    const depois = await indic();
    assert.deepStrictEqual(delta(antes, depois, 'requisicoes_no_prazo'),
      { no_prazo: 0, fora_do_prazo: 1, consideradas: 1, em_aberto_no_dia: 0, sem_data_valida: 0 },
      JSON.stringify(depois.requisicoes_no_prazo));
  });

  await test('[Fase5/A RN-04] RASCUNHO e REJEITADA com prazo vencido (pela rota) ficam fora de tudo', async () => {
    const antes = await indic();
    setUser({ ...ADMIN });
    const rasc = await request(app).post('/api/almoxarifado/requisicoes')
      .send({ itens: [{ material_id: await material(), quantidade: 1 }], data_necessidade: await dia(1), salvar_rascunho: true });
    assert.strictEqual(rasc.status, 201, JSON.stringify(rasc.body));
    const rjc = await request(app).post('/api/almoxarifado/requisicoes')
      .send({ os_referencia: 'OS-INT', itens: [{ material_id: await material(), quantidade: 1 }], data_necessidade: await dia(1) });
    assert.strictEqual(rjc.status, 201, JSON.stringify(rjc.body));
    setUser({ ...APROVADOR });
    const rej = await request(app).put(`/api/almoxarifado/requisicoes/${rjc.body.id}/rejeitar`).send({ motivo: 'E67 F5' });
    assert.strictEqual(rej.status, 200, JSON.stringify(rej.body));
    const st = await dbAll(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id IN (?, ?) ORDER BY id', [rasc.body.id, rjc.body.id]);
    assert.deepStrictEqual(st.map((x) => x.status), ['RASCUNHO', 'REJEITADO'], 'premissa: os dois status');
    const depois = await indic();
    assert.deepStrictEqual(delta(antes, depois, 'requisicoes_no_prazo'),
      { no_prazo: 0, fora_do_prazo: 0, consideradas: 0, em_aberto_no_dia: 0, sem_data_valida: 0 },
      `rascunho/rejeitada entraram como fora do prazo: ${JSON.stringify(depois.requisicoes_no_prazo)}`);
  });

  await test('[Fase5/A RN-02] sem prazo criada ha 60 dias fica fora de sem_data_valida (a janela vale)', async () => {
    const antes = await indic();
    const r = await criarAprovada([[await material(), 1]], null);
    // semeado (declarado): a rota grava created_at = agora
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET created_at = datetime('now', '-60 days') WHERE id = ?", [r.id]);
    const depois = await indic();
    assert.deepStrictEqual(delta(antes, depois, 'requisicoes_no_prazo'),
      { no_prazo: 0, fora_do_prazo: 0, consideradas: 0, em_aberto_no_dia: 0, sem_data_valida: 0 },
      JSON.stringify(depois.requisicoes_no_prazo));
  });

  await test('[Fase5/A RN-03] entregue completa ha 60 dias fica fora dos integrais (a janela vale)', async () => {
    const antes = await indic();
    const r = await entregueCompleta(null);
    // semeado (declarado): a rota grava data_entrega = agora
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET data_entrega = datetime('now', '-60 days') WHERE id = ?", [r.id]);
    const depois = await indic();
    assert.deepStrictEqual(delta(antes, depois, 'requisicoes_integrais'),
      { integrais: 0, encerradas_incompletas: 0, consideradas: 0 }, JSON.stringify(depois.requisicoes_integrais));
  });

  // ══════════════ RN-03 — integrais ══════════════
  await test('[RN-03 +] entregue completa -> integrais +1; entregue e depois ENCERRADA -> +1 uma vez so', async () => {
    const antes = await indic();
    await entregueCompleta(null);
    const r = await entregueCompleta(null);
    await encerrar(r.id);
    const depois = await indic();
    assert.deepStrictEqual(delta(antes, depois, 'requisicoes_integrais'),
      { integrais: 2, encerradas_incompletas: 0, consideradas: 2 }, JSON.stringify(depois.requisicoes_integrais));
  });

  await test('[RN-03 -] parcial + encerrada -> encerradas_incompletas +1; parcial ainda aberta -> fora', async () => {
    const antes = await indic();
    const p = await entregueParcial(null);
    await encerrar(p.id);
    await entregueParcial(null);
    const depois = await indic();
    assert.deepStrictEqual(delta(antes, depois, 'requisicoes_integrais'),
      { integrais: 0, encerradas_incompletas: 1, consideradas: 1 }, JSON.stringify(depois.requisicoes_integrais));
  });

  await test('[RN-01/RN-03/D12] percentual = round(100*x/consideradas, 2) e null quando o denominador e zero', async () => {
    const b = await indic();
    const np = b.requisicoes_no_prazo; const ni = b.requisicoes_integrais;
    assert.ok(np.consideradas > 0 && ni.consideradas > 0);
    assert.strictEqual(np.percentual, Number((100 * np.no_prazo / np.consideradas).toFixed(2)), JSON.stringify(np));
    assert.strictEqual(np.consideradas, np.no_prazo + np.fora_do_prazo, JSON.stringify(np));
    assert.strictEqual(ni.percentual, Number((100 * ni.integrais / ni.consideradas).toFixed(2)), JSON.stringify(ni));
    assert.strictEqual(ni.consideradas, ni.integrais + ni.encerradas_incompletas, JSON.stringify(ni));
    // denominador zero: banco novo, pelo servico
    const vazio = await createTestApp({ user: { ...ADMIN } });
    try {
      const r = await reportService.relatorioIndicadores(vazio.db, { janela_dias: JANELA });
      assert.deepStrictEqual(r.requisicoes_no_prazo,
        { percentual: null, no_prazo: 0, fora_do_prazo: 0, consideradas: 0, em_aberto_no_dia: 0, sem_data_valida: 0 });
      assert.deepStrictEqual(r.requisicoes_integrais,
        { percentual: null, integrais: 0, encerradas_incompletas: 0, consideradas: 0 });
      assert.deepStrictEqual(r.ajustes, { total: 0, por_tipo: [] });
    } finally { await vazio.close(); }
  });

  // ══════════════ RN-05 — numero de ajustes ══════════════
  const v2 = (body) => { setUser({ ...ADMIN }); return request(app).post('/api/almoxarifado/movimentacoes/v2').send(body); };

  await test('[RN-05 +] AJUSTE_NEGATIVO +1 e conclusao de conferencia com divergencia -> AJUSTE_INVENTARIO +1', async () => {
    const antes = await indic();
    const m = await material();
    const aj = await v2({ material_id: m, tipo: 'AJUSTE_NEGATIVO', quantidade: 1, motivo: 'E67 ajuste', justificativa: 'E67' });
    assert.strictEqual(aj.status, 201, JSON.stringify(aj.body));
    const mInv = await material({ saldo: 10 });
    setUser({ ...ADMIN });
    const conf = await request(app).post('/api/almoxarifado/conferencias').send({ tolerancia_percentual: 1000 });
    assert.strictEqual(conf.status, 201, JSON.stringify(conf.body));
    const item = await dbGet(db, 'SELECT id FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND material_id = ?', [conf.body.id, mInv]);
    const ct = await request(app).put(`/api/almoxarifado/conferencias/${conf.body.id}/item/${item.id}`).send({ quantidade_contada: 9 });
    assert.strictEqual(ct.status, 200, JSON.stringify(ct.body));
    const cc = await request(app).put(`/api/almoxarifado/conferencias/${conf.body.id}/concluir`)
      .send({ aplicar_ajustes: true, justificativa_ajuste: 'E67 inventario' });
    assert.strictEqual(cc.status, 200, JSON.stringify(cc.body));
    const depois = await indic();
    assert.strictEqual(depois.ajustes.total - antes.ajustes.total, 2, JSON.stringify(depois.ajustes));
    const porTipo = (b, t) => (b.ajustes.por_tipo.find((x) => x.tipo === t) || { total: 0 }).total;
    assert.strictEqual(porTipo(depois, 'AJUSTE_NEGATIVO') - porTipo(antes, 'AJUSTE_NEGATIVO'), 1, JSON.stringify(depois.ajustes));
    assert.strictEqual(porTipo(depois, 'AJUSTE_INVENTARIO') - porTipo(antes, 'AJUSTE_INVENTARIO'), 1, JSON.stringify(depois.ajustes));
    const tipos = depois.ajustes.por_tipo.map((x) => x.tipo);
    assert.deepStrictEqual(tipos, [...tipos].sort(), 'por_tipo ordenado por tipo');
    assert.ok(depois.ajustes.por_tipo.every((x) => x.total > 0), 'por_tipo so traz os tipos que aparecem');
    assert.strictEqual(depois.ajustes.por_tipo.reduce((s, x) => s + x.total, 0), depois.ajustes.total);
  });

  await test('[RN-05 -] PERDA nao conta; estornar o AJUSTE_NEGATIVO volta o total (nem a original nem o ESTORNO)', async () => {
    const m = await material();
    const antes = await indic();
    const perda = await v2({ material_id: m, tipo: 'PERDA', quantidade: 1, motivo: 'E67 perda', justificativa: 'E67' });
    assert.strictEqual(perda.status, 201, JSON.stringify(perda.body));
    const aj = await v2({ material_id: m, tipo: 'AJUSTE_NEGATIVO', quantidade: 1, motivo: 'E67 ajuste estornado', justificativa: 'E67' });
    assert.strictEqual(aj.status, 201, JSON.stringify(aj.body));
    const meio = await indic();
    assert.strictEqual(meio.ajustes.total - antes.ajustes.total, 1, `PERDA contou ou o ajuste nao: ${JSON.stringify(meio.ajustes)}`);
    const movId = aj.body.id || aj.body.movimentacao?.id
      || (await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'AJUSTE_NEGATIVO' ORDER BY id DESC LIMIT 1", [m])).id;
    setUser({ ...ADMIN });
    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'E67 estorno' });
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));
    const linhas = await dbAll(db, 'SELECT tipo, cancelado FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id', [m]);
    assert.ok(linhas.some((l) => l.tipo === 'AJUSTE_NEGATIVO' && l.cancelado === 1), JSON.stringify(linhas));
    const depois = await indic();
    assert.strictEqual(depois.ajustes.total, antes.ajustes.total, `estorno: ${JSON.stringify(depois.ajustes)}`);
  });

  await test('[RN-05/D9] ajuste em material de CLIENTE nao conta; em material depois INATIVADO conta', async () => {
    const cli = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente E67')")).lastID;
    const mCli = await material({ cliente: cli });
    const mInat = await material();
    const antes = await indic();
    const a1 = await v2({ material_id: mCli, tipo: 'AJUSTE_NEGATIVO', quantidade: 1, motivo: 'E67 cliente', justificativa: 'E67' });
    assert.strictEqual(a1.status, 201, JSON.stringify(a1.body));
    const a2 = await v2({ material_id: mInat, tipo: 'AJUSTE_NEGATIVO', quantidade: 1, motivo: 'E67 inativo', justificativa: 'E67' });
    assert.strictEqual(a2.status, 201, JSON.stringify(a2.body));
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [mInat]);
    const depois = await indic();
    assert.strictEqual(depois.ajustes.total - antes.ajustes.total, 1,
      `esperava so o do inativado (o de cliente fora): ${JSON.stringify(depois.ajustes)}`);
  });

  // ══════════════ pelo SERVICO: o mesmo payload da rota ══════════════
  await test('[servico] relatorioIndicadores(db, {janela_dias}) devolve os mesmos blocos novos da rota', async () => {
    const rota = await indic();
    const svc = await reportService.relatorioIndicadores(db, { janela_dias: JANELA });
    for (const k of ['requisicoes_no_prazo', 'requisicoes_integrais', 'ajustes', 'atendimento_requisicoes']) {
      assert.deepStrictEqual(svc[k], rota[k], k);
    }
    assert.ok(rota.requisicoes_no_prazo.consideradas > 0 && rota.ajustes.total > 0, 'paridade com blocos vazios provaria nada');
  });

  await test('[contrato] a nota do indicadores traz a regua nova e a frase de dono corrigida', async () => {
    setUser({ ...ADMIN });
    const lista = await request(app).get('/api/almoxarifado/relatorios');
    assert.strictEqual(lista.status, 200);
    const arr = Array.isArray(lista.body) ? lista.body : (lista.body.relatorios || []);
    const ind = arr.find((r) => r.tipo === 'indicadores');
    assert.ok(ind && ind.nota, JSON.stringify(arr).slice(0, 300));
    assert.ok(!ind.nota.includes('Materiais de clientes ficam fora de todos os blocos.'), 'frase errada continua');
    assert.ok(ind.nota.includes('Materiais de clientes ficam fora de giro, cobertura, rupturas, valor e ajustes; os blocos de requisição contam a requisição inteira.'));
    assert.ok(ind.nota.includes('de TODO o histórico (sem janela). Requisição excluída fica fora.'));
    assert.ok(ind.nota.includes('Requisições no prazo: as que têm o prazo (data de necessidade) entre o início da janela e hoje;'));
    assert.ok(ind.nota.includes('O detalhe por motivo está no relatório Ajustes por motivo.'));
  });

  // ══════════════ M-1 — epsilon em todosItensCompletos ══════════════
  await test('[M-1] dez entregas de 0,1 contra solicitada 1 -> ENTREGUE com data_entrega (e integral)', async () => {
    const m = await material({ saldo: 5 });
    const r = await criarAprovada([[m, 1]], null);
    await separar(r.id, [[r.itens[0], 1]]);
    let ultimo;
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop
      ultimo = await entregar(r.id, [[r.itens[0], 0.1]]);
    }
    const row = await dbGet(db, 'SELECT status, data_entrega FROM requisicoes_almoxarifado WHERE id = ?', [r.id]);
    const it = await dbGet(db, 'SELECT quantidade_entregue FROM itens_requisicao_almoxarifado WHERE id = ?', [r.itens[0]]);
    assert.notStrictEqual(it.quantidade_entregue, 1, 'controle: a soma em ponto flutuante NAO da 1 exato (senao o teste nao prova o epsilon)');
    assert.strictEqual(ultimo.status, 'ENTREGUE', `M-1: ${JSON.stringify(ultimo)} entregue=${it.quantidade_entregue}`);
    assert.strictEqual(row.status, 'ENTREGUE');
    assert.ok(row.data_entrega, 'data_entrega tem de ser gravado na entrega completa');
  });

  // ══════════════ Fase 5 (B): a RESERVA do fracionado tambem fecha (epsilon no motor) ══════════════
  const reservaDoItem = (itemId) => dbGet(db, `SELECT id, status, quantidade, quantidade_utilizada
    FROM reservas_material_almoxarifado WHERE item_requisicao_id = ? ORDER BY id DESC LIMIT 1`, [itemId]);
  const reservadoDo = async (m) => (await dbGet(db, 'SELECT quantidade_reservada q FROM materiais_almoxarifado WHERE id = ?', [m])).q;

  await test('[Fase5/B] dez entregas de 0,1 com reserva: a reserva fecha CONSUMIDA e o reservado do material volta a 0', async () => {
    const m = await material({ saldo: 5 });
    const r = await criarAprovada([[m, 1]], null);
    const res0 = await reservaDoItem(r.itens[0]);
    assert.ok(res0 && res0.status === 'ATIVA' && res0.quantidade === 1, `premissa: a aprovacao reservou 1 (${JSON.stringify(res0)})`);
    assert.strictEqual(await reservadoDo(m), 1, 'premissa: reservado 1 no material');
    await separar(r.id, [[r.itens[0], 1]]);
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop
      await entregar(r.id, [[r.itens[0], 0.1]]);
    }
    const res = await reservaDoItem(r.itens[0]);
    assert.notStrictEqual(res.quantidade_utilizada, 1, 'controle: a utilizada NAO e 1 exato (senao o teste nao prova o epsilon)');
    assert.strictEqual(res.status, 'CONSUMIDA', `reserva zumbi: ${JSON.stringify(res)}`);
    assert.strictEqual(await reservadoDo(m), 0, 'sobra de ponto flutuante ficou presa no reservado do material');
  });

  await test('[Fase5/B] consumo direto com reserva 0,3 em tres saidas de 0,1: a terceira passa e a reserva fecha', async () => {
    const m = await material({ saldo: 5 });
    const res = await stockService.criarReserva(db, ADMIN, { material_id: m, quantidade: 0.3 });
    const resId = res.id;
    for (let i = 0; i < 3; i++) {
      // eslint-disable-next-line no-await-in-loop
      const s = await v2({ material_id: m, tipo: 'SAIDA', quantidade: 0.1, reserva_id: resId, motivo: 'E67 F5', justificativa: 'E67 F5' });
      assert.strictEqual(s.status, 201, `saida ${i + 1}: ${JSON.stringify(s.body)}`);
    }
    const row = await dbGet(db, 'SELECT status, quantidade_utilizada FROM reservas_material_almoxarifado WHERE id = ?', [resId]);
    assert.notStrictEqual(row.quantidade_utilizada, 0.3, 'controle: 0,1+0,1+0,1 nao da 0,3 exato');
    assert.strictEqual(row.status, 'CONSUMIDA', JSON.stringify(row));
    assert.strictEqual(await reservadoDo(m), 0);
  });

  await test('[Fase5/B] liberar os 0,3 que sobram de uma reserva de 1 consumida em 0,7 = liberacao TOTAL, reservado 0', async () => {
    const m = await material({ saldo: 5 });
    const r = await criarAprovada([[m, 1]], null);
    await separar(r.id, [[r.itens[0], 1]]);
    await entregar(r.id, [[r.itens[0], 0.7]]);
    const res = await reservaDoItem(r.itens[0]);
    assert.notStrictEqual(res.quantidade - res.quantidade_utilizada, 0.3, 'controle: o saldo da reserva NAO e 0,3 exato');
    const out = await stockService.liberarReserva(db, ADMIN, res.id, 0.3, {});
    assert.strictEqual(out.status, 'LIBERADA', JSON.stringify(out));
    const row = await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [res.id]);
    assert.strictEqual(row.status, 'LIBERADA');
    assert.strictEqual(await reservadoDo(m), 0);
    // metade negativa: liberar MAIS do que o saldo continua recusado (o epsilon nao vira folga)
    const r2 = await criarAprovada([[await material({ saldo: 5 }), 1]], null);
    const res2 = await reservaDoItem(r2.itens[0]);
    await assert.rejects(stockService.liberarReserva(db, ADMIN, res2.id, 1.001, {}), /Quantidade acima do saldo da reserva/);
  });

  await test('[M-1 -] 0,9 de 1 continua PARCIAL (o epsilon nao vira tolerancia)', async () => {
    const m = await material({ saldo: 5 });
    const r = await criarAprovada([[m, 1]], null);
    await separar(r.id, [[r.itens[0], 1]]);
    const e = await entregar(r.id, [[r.itens[0], 0.9]]);
    assert.strictEqual(e.status, 'PARCIALMENTE_ATENDIDA', JSON.stringify(e));
  });

  // ══════════════ data_necessidade: formato na criacao ══════════════
  await test('[formato] criacao recusa DD/MM/AAAA, texto e data impossivel com 400 literal, sem gravar', async () => {
    const m = await material();
    const n0 = (await dbGet(db, 'SELECT COUNT(*) n FROM requisicoes_almoxarifado')).n;
    for (const ruim of ['15/09/2026', 'amanha', '2026-02-30', '2026-13-01', '2026-9-5', '2026-09-15T10:00:00']) {
      setUser({ ...ADMIN });
      // eslint-disable-next-line no-await-in-loop
      const r = await request(app).post('/api/almoxarifado/requisicoes')
        .send({ os_referencia: 'OS-INT', itens: [{ material_id: m, quantidade: 1 }], data_necessidade: ruim });
      assert.strictEqual(r.status, 400, `${ruim}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, FORMATO, ruim);
    }
    const n1 = (await dbGet(db, 'SELECT COUNT(*) n FROM requisicoes_almoxarifado')).n;
    assert.strictEqual(n1, n0, 'requisicao recusada nao pode ter sido gravada');
  });

  await test('[formato +] AAAA-MM-DD grava igual; vazio, null e ausente gravam NULL (sem prazo)', async () => {
    const m = await material();
    const casos = [['2026-09-15', '2026-09-15'], ['', null], [null, null], [undefined, null], ['2024-02-29', '2024-02-29']];
    for (const [entrada, gravado] of casos) {
      setUser({ ...ADMIN });
      const body = { os_referencia: 'OS-INT', itens: [{ material_id: m, quantidade: 1 }] };
      if (entrada !== undefined) body.data_necessidade = entrada;
      // eslint-disable-next-line no-await-in-loop
      const r = await request(app).post('/api/almoxarifado/requisicoes').send(body);
      assert.strictEqual(r.status, 201, `${entrada}: ${JSON.stringify(r.body)}`);
      // eslint-disable-next-line no-await-in-loop
      const row = await dbGet(db, 'SELECT data_necessidade FROM requisicoes_almoxarifado WHERE id = ?', [r.body.id]);
      assert.strictEqual(row.data_necessidade, gravado, String(entrada));
    }
  });

  await test('[formato] a outra porta de criacao (/requisicoes-material) recusa com a mesma mensagem', async () => {
    const m = await material();
    setUser({ ...ADMIN });
    const r = await request(app).post('/api/requisicoes-material')
      .send({ setor: 'Producao E67', os_referencia: 'OS-INT', itens: [{ material_id: m, quantidade: 1 }], data_necessidade: '15/09/2026' });
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, FORMATO);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
