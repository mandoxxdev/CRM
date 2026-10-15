/**
 * Etapa 106 (C211) — o estorno do ajuste de material de cliente exige a mesma permissao do ajuste.
 *
 * Desde a Etapa 8 (decisao 7) ajustar material de cliente exige `ajustar_material_cliente` (so Administrador), no
 * MOTOR (`ownerRules.assertAjustePermitido`). O estorno (`POST /movimentacoes/:id/cancelar`, gate `ajustar_estoque` =
 * Administrador e Gestor) nao conferia o dono: o Gestor desfazia o ajuste do Administrador e o numero do cliente voltava.
 * A guarda nova mora em `cancelarMovimentacao`, antes de qualquer efeito (RN-01..RN-07 do plano da Etapa 106).
 *
 * Perfis EXPLICITOS em toda negativa: usuario sem perfil cai em PRODUCAO, nao em "sem acesso".
 *
 * Executar: cd server && node tests/api/estornoAjusteCliente.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM_PERFIL = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ROLE_ADMIN = { id: 5, nome: 'Role Admin', role: 'admin', email: 'role@test.com' };
const GESTOR = { id: 2, nome: 'Gestor Teste', role: 'user', email: 'gestor@test.com', perfil_almoxarifado: 'GESTOR' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };

const e1 = (codigo, dono, perfil) => `Estornar o ajuste do material ${codigo}, que pertence ao cliente ${dono}, exige a `
  + `permissao "ajustar_material_cliente" (seu perfil: ${perfil}). Estornar ajuste de estoque de terceiro mexe no numero `
  + 'que o cliente vai cobrar.';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS projetos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)');
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT,
    cliente_id INTEGER, projeto_id INTEGER, status TEXT)`);
  const cli = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Metalurgica Alfa LTDA'])).lastID;
  const proj = (await dbRun(db, 'INSERT INTO projetos (cliente_id, nome) VALUES (?, ?)', [cli, 'Projeto Alfa'])).lastID;
  const os = (await dbRun(db, 'INSERT INTO ordens_servico (numero_os, cliente_id, projeto_id) VALUES (?, ?, ?)',
    ['OS-ALFA-1', cli, proj])).lastID;
  const loc = (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES ('E106-A','Rua A',1)")).lastID;

  let seq = 0;
  async function material({ dono = cli, serie = 0 } = {}) {
    seq += 1;
    const codigo = `E106-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, proprietario_cliente_id, controle_serie)
      VALUES (?, ?, 'PC', 0, 0, 10, 1, ?, ?)`, [codigo, `Chapa ${seq}`, dono, serie])).lastID;
    return { id, codigo };
  }
  const post = async (u, url, body) => { setUser(u); const r = await request(app).post(url).send(body); setUser(SUPER); return r; };
  const lancar = async (body) => {
    const r = await post(SUPER, '/api/almoxarifado/movimentacoes/v2', body);
    assert.strictEqual(r.status, 201, `preparo ${body.tipo}: ${JSON.stringify(r.body)}`);
    return r.body.id;
  };
  const comEntrada = async (opts) => {
    const m = await material(opts);
    m.entrada = await lancar({ material_id: m.id, tipo: 'ENTRADA', quantidade: 10, motivo: 'nf', documento_vinculado: 'NF-1',
      localizacao_destino_id: loc });
    return m;
  };
  const cancelar = (u, id, motivo = 'lancei errado') => post(u, `/api/almoxarifado/movimentacoes/${id}/cancelar`, { motivo });
  const total = async (id) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [id])).q;
  const linha = async (id) => (await dbGet(db, `SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND localizacao_id = ?`, [id, loc])).q;
  const original = (id) => dbGet(db, 'SELECT cancelado, movimento_estorno_id FROM movimentacoes_almoxarifado WHERE id = ?', [id]);
  const estornos = async (matId) => (await dbGet(db, `SELECT COUNT(*) n FROM movimentacoes_almoxarifado
    WHERE material_id = ? AND tipo = 'ESTORNO'`, [matId])).n;
  const auditorias = async () => (await dbGet(db, 'SELECT COUNT(*) n FROM auditoria_log_almoxarifado')).n;
  const auditoriaEstorno = (matId) => dbGet(db, `SELECT * FROM auditoria_log_almoxarifado
    WHERE entidade = 'material_cliente' AND acao = 'ESTORNO_AJUSTE' AND entidade_id = ? ORDER BY id DESC LIMIT 1`, [matId]);

  // Os quatro sabores da familia do ajuste que o estorno reverte (RN-01).
  const SABORES = [
    ['AJUSTE sem localizacao 10->4', (m) => ({ material_id: m.id, tipo: 'AJUSTE', quantidade: 4, justificativa: 'contagem' })],
    ['AJUSTE com localizacao 10->4', (m) => ({ material_id: m.id, tipo: 'AJUSTE', quantidade: 4, justificativa: 'contagem',
      localizacao_destino_id: loc })],
    ['AJUSTE com localizacao 10->15 (sobe)', (m) => ({ material_id: m.id, tipo: 'AJUSTE', quantidade: 15,
      justificativa: 'contagem', localizacao_destino_id: loc })],
    ['AJUSTE_POSITIVO +2', (m) => ({ material_id: m.id, tipo: 'AJUSTE_POSITIVO', quantidade: 2, justificativa: 'sobra' })],
    ['AJUSTE_NEGATIVO -2', (m) => ({ material_id: m.id, tipo: 'AJUSTE_NEGATIVO', quantidade: 2, justificativa: 'quebra' })],
  ];

  for (const [nome, corpo] of SABORES) {
    await test(`[RN-01] ${nome} de material de cliente: o Gestor recebe 403 E1 e nada muda`, async () => {
      const m = await comEntrada();
      const aj = await lancar(corpo(m));
      const antes = { total: await total(m.id), linha: await linha(m.id), aud: await auditorias() };
      const r = await cancelar(GESTOR, aj);
      assert.strictEqual(r.status, 403, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, e1(m.codigo, 'Metalurgica Alfa LTDA', 'GESTOR'));
      assert.deepStrictEqual(await original(aj), { cancelado: 0, movimento_estorno_id: null }, 'a original foi tocada');
      assert.strictEqual(await estornos(m.id), 0, 'nasceu linha de ESTORNO');
      assert.strictEqual(await total(m.id), antes.total, 'o total do cliente mudou');
      assert.strictEqual(await linha(m.id), antes.linha, 'a linha de saldo mudou');
      assert.strictEqual(await auditorias(), antes.aud, 'a recusa gravou auditoria');
    });
  }

  for (const [nomeU, u] of [['Administrador por perfil', ADM_PERFIL], ['superadmin', SUPER], ["role 'admin'", ROLE_ADMIN]]) {
    await test(`[RN-01] ${nomeU} estorna o ajuste de material de cliente (200, o total volta)`, async () => {
      for (const [, corpo] of SABORES) {
        const m = await comEntrada();
        const aj = await lancar(corpo(m));
        const r = await cancelar(u, aj);
        assert.strictEqual(r.status, 200, JSON.stringify(r.body));
        assert.strictEqual(await total(m.id), 10);
        assert.strictEqual((await original(aj)).cancelado, 1);
      }
    });
  }

  await test('[RN-02] material NOSSO: o Gestor continua estornando o ajuste, sem auditoria de material_cliente', async () => {
    const m = await comEntrada({ dono: null });
    const aj = await lancar({ material_id: m.id, tipo: 'AJUSTE', quantidade: 4, justificativa: 'contagem' });
    const r = await cancelar(GESTOR, aj);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await total(m.id), 10);
    assert.strictEqual(await auditoriaEstorno(m.id), undefined);
  });

  await test('[RN-03] ENTRADA e SAIDA de material de cliente: o Gestor segue estornando (fora da familia do ajuste)', async () => {
    const m = await comEntrada();
    const saida = await lancar({ material_id: m.id, tipo: 'SAIDA', quantidade: 3, motivo: 'uso', os_id: os,
      localizacao_origem_id: loc });
    const rS = await cancelar(GESTOR, saida);
    assert.strictEqual(rS.status, 200, JSON.stringify(rS.body));
    assert.strictEqual(await total(m.id), 10);
    const rE = await cancelar(GESTOR, m.entrada);
    assert.strictEqual(rE.status, 200, JSON.stringify(rE.body));
    assert.strictEqual(await total(m.id), 0);
    assert.strictEqual(await auditoriaEstorno(m.id), undefined, 'estorno fora da familia gravou ESTORNO_AJUSTE');
  });

  await test('[RN-04] AJUSTE_INVENTARIO de material de cliente: Gestor e Administrador recebem a recusa de sempre (400)', async () => {
    const m = await comEntrada();
    const inv = (await stockService.registrarMovimentacao(db, SUPER, { material_id: m.id, tipo: 'AJUSTE_INVENTARIO',
      quantidade: 6, justificativa: 'conferencia' })).id;
    for (const u of [GESTOR, SUPER]) {
      const r = await cancelar(u, inv);
      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, 'Ajuste de inventário não pode ser estornado por aqui — o caminho de correção é uma '
        + 'nova conferência de inventário.');
    }
    assert.strictEqual(await total(m.id), 6);
  });

  await test('[RN-05] ja cancelada: 400 antes do 403; com serie: 403 para o Gestor, 400 de serie para o Administrador', async () => {
    const m = await comEntrada();
    const aj = await lancar({ material_id: m.id, tipo: 'AJUSTE', quantidade: 4, justificativa: 'contagem' });
    assert.strictEqual((await cancelar(SUPER, aj)).status, 200);
    const rJa = await cancelar(GESTOR, aj);
    assert.strictEqual(rJa.status, 400, JSON.stringify(rJa.body));
    assert.strictEqual(rJa.body.error, 'Movimentação já cancelada');

    // Ajuste de material com serie: a linha do livro direto (o caminho real pede as series; aqui so importa a ordem).
    const ms = await material({ serie: 1 });
    const ajS = (await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, usuario_id, usuario_nome)
      VALUES (?, 'AJUSTE', 2, 0, 2, 'contagem', 1, 'Super')`, [ms.id])).lastID;
    const rG = await cancelar(GESTOR, ajS);
    assert.strictEqual(rG.status, 403, JSON.stringify(rG.body));
    assert.strictEqual(rG.body.error, e1(ms.codigo, 'Metalurgica Alfa LTDA', 'GESTOR'));
    const rA = await cancelar(SUPER, ajS);
    assert.strictEqual(rA.status, 400, JSON.stringify(rA.body));
    assert.strictEqual(rA.body.error, 'estorno de ajuste de material com serie recusado — faca um novo ajuste (ele pede as series)');
  });

  await test('[RN-06] o estorno autorizado audita nomeando o cliente; o recusado pelo saldo nao', async () => {
    const m = await comEntrada();
    const aj = await lancar({ material_id: m.id, tipo: 'AJUSTE', quantidade: 4, justificativa: 'contagem', localizacao_destino_id: loc });
    const r = await cancelar(ADM_PERFIL, aj, 'a contagem nao olhou a caixa');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const a = await auditoriaEstorno(m.id);
    assert.ok(a, 'sem auditoria ESTORNO_AJUSTE');
    assert.strictEqual(a.usuario_id, ADM_PERFIL.id);
    assert.strictEqual(a.usuario_nome, 'Adm Perfil');
    assert.strictEqual(a.justificativa, 'a contagem nao olhou a caixa');
    assert.deepStrictEqual(JSON.parse(a.dados_anteriores), { quantidade_atual: 4 });
    assert.deepStrictEqual(JSON.parse(a.dados_novos), {
      tipo: 'AJUSTE', movimentacao_id: aj, estorno_id: r.body.estorno_id, quantidade_atual: 10,
      proprietario_cliente_id: cli, proprietario_cliente_nome: 'Metalurgica Alfa LTDA',
    });

    // Fase 5 (rv2, S21): o tipo auditado e o do movimento estornado, nao um 'AJUSTE' fixo.
    for (const tipo of ['AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO']) {
      const mt = await comEntrada();
      const ajT = await lancar({ material_id: mt.id, tipo, quantidade: 2, justificativa: 'sobra' });
      assert.strictEqual((await cancelar(SUPER, ajT)).status, 200);
      const aT = await auditoriaEstorno(mt.id);
      assert.ok(aT, `${tipo}: sem auditoria ESTORNO_AJUSTE`);
      assert.strictEqual(JSON.parse(aT.dados_novos).tipo, tipo);
    }

    // Recusa do motor depois da guarda (a localizacao nao comporta a reversao): sem ESTORNO_AJUSTE.
    const m2 = await comEntrada();
    const aj2 = await lancar({ material_id: m2.id, tipo: 'AJUSTE', quantidade: 15, justificativa: 'contagem', localizacao_destino_id: loc });
    await lancar({ material_id: m2.id, tipo: 'SAIDA', quantidade: 12, motivo: 'uso', os_id: os, localizacao_origem_id: loc });
    const r2 = await cancelar(SUPER, aj2);
    assert.strictEqual(r2.status, 400, JSON.stringify(r2.body));
    assert.strictEqual(r2.body.error, 'Não é possível estornar: a localização não comporta a reversão (saldo já consumido)');
    assert.strictEqual(await auditoriaEstorno(m2.id), undefined, 'o estorno recusado gravou ESTORNO_AJUSTE');
  });

  await test('[RN-06] a falha ao gravar a auditoria nova nao derruba o estorno ja concluido', async () => {
    const m = await comEntrada();
    const aj = await lancar({ material_id: m.id, tipo: 'AJUSTE', quantidade: 4, justificativa: 'contagem' });
    const ownerRules = require('../../services/almoxarifado/ownerRules');
    const orig = ownerRules.auditarEstornoDeAjuste;
    const warn = console.warn; console.warn = () => {};
    let chamou = false;
    ownerRules.auditarEstornoDeAjuste = async () => { chamou = true; throw new Error('disco cheio'); };
    try {
      const r = await stockService.cancelarMovimentacao(db, SUPER, aj, 'lancei errado');
      assert.ok(chamou, 'o motor nao chamou a auditoria do estorno (o stub nao provaria nada)');
      assert.ok(r && r.estorno_id, JSON.stringify(r));
      assert.strictEqual(await total(m.id), 10);
    } finally { ownerRules.auditarEstornoDeAjuste = orig; console.warn = warn; }
  });

  await test('[RN-07] compensacao interna (compensacao: true) nao passa pela guarda', async () => {
    const m = await comEntrada();
    const aj = await lancar({ material_id: m.id, tipo: 'AJUSTE', quantidade: 4, justificativa: 'contagem' });
    const r = await stockService.cancelarMovimentacao(db, GESTOR, aj, 'compensa', { compensacao: true });
    assert.ok(r && r.estorno_id, JSON.stringify(r));
    assert.strictEqual(await total(m.id), 10);
  });

  await test('[RN-01] pelo servico direto: cancelarMovimentacao com o Gestor lanca 403 E1; com o Administrador passa', async () => {
    const m = await comEntrada();
    const aj = await lancar({ material_id: m.id, tipo: 'AJUSTE', quantidade: 4, justificativa: 'contagem' });
    await assert.rejects(() => stockService.cancelarMovimentacao(db, GESTOR, aj, 'lancei errado'),
      (e) => e.status === 403 && e.message === e1(m.codigo, 'Metalurgica Alfa LTDA', 'GESTOR'));
    assert.strictEqual(await total(m.id), 4);
    const r = await stockService.cancelarMovimentacao(db, ADM_PERFIL, aj, 'lancei errado');
    assert.ok(r.estorno_id);
    assert.strictEqual(await total(m.id), 10);
  });

  await test('[RN-01] o Almoxarife continua barrado pelo gate da rota (ajustar_estoque)', async () => {
    const m = await comEntrada();
    const aj = await lancar({ material_id: m.id, tipo: 'AJUSTE', quantidade: 4, justificativa: 'contagem' });
    const r = await cancelar(ALMOXARIFE, aj);
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Sem permissão para esta operação');
    assert.strictEqual(r.body.acao, 'ajustar_estoque');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
