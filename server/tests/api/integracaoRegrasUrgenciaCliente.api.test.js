/**
 * Etapa 48, T5 — integração: os critérios novos × a segunda rota de criação × a auto-aprovação ×
 * a fila de regras da Etapa 47 × a requisição NÃO AVALIADA que a fila simples mostra marcada.
 *
 * Plano: docs/superpowers/plans/2026-09-30-almoxarifado-etapa48-regras-urgencia-cliente-fila-simples.md (T5)
 *
 * Executar: cd server && node tests/api/integracaoRegrasUrgenciaCliente.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const SOLIC = { id: 10, nome: 'Solicitante', email: 'solic@test.com' };
const ANA = { id: 11, nome: 'Ana', email: 'ana@test.com', perfil_almoxarifado: 'GESTOR' };
const BIA = { id: 12, nome: 'Bia', email: 'bia@test.com', perfil_almoxarifado: 'GESTOR' };
const CAIO = { id: 13, nome: 'Caio', email: 'caio@test.com', perfil_almoxarifado: 'GESTOR' };

(async () => {
  console.log('\n=== Etapa 48 T5: integracao ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  const como = (u) => { setUser(u); return request(app); };
  const setConfig = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const u of [ADMIN, SOLIC, ANA, BIA, CAIO]) {
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [u.id, u.nome, u.email]);
  }
  const clienteId = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente E48 int')")).lastID;
  const fam = await como(ADMIN).post('/api/almoxarifado/familias').send({ codigo: 'FAME48I', nome: 'Família E48 int' });
  let n = 0;
  const material = async (cliente = null) => {
    n += 1;
    const res = await como(ADMIN).post('/api/almoxarifado/materiais')
      .send({ codigo: `MATE48I-${n}`, nome: `Material E48 int ${n}`, familia_id: fam.body.id, unidade: 'UN' });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 100, custo_unitario = 1, proprietario_cliente_id = ? WHERE id = ?',
      [cliente, res.body.id]);
    return res.body.id;
  };
  const matNosso = await material();
  const matCliente = await material(clienteId);
  const pend = async (id) => (await dbAll(db, 'SELECT * FROM requisicao_aprovacoes_regra WHERE requisicao_id = ? ORDER BY regra_id', [id]));

  const rUrg = await como(ADMIN).post('/api/almoxarifado/regras-aprovacao').send({ nome: 'Urgente', urgencia: 'URGENTE', aprovadores: [ANA.id] });
  const rCli = await como(ADMIN).post('/api/almoxarifado/regras-aprovacao').send({ nome: 'De cliente', material_cliente: true, aprovadores: [BIA.id] });
  assert.strictEqual(rUrg.status, 201); assert.strictEqual(rCli.status, 201);

  let req;
  await test('(1) pela SEGUNDA rota: URGENTE com material de cliente nasce com as duas pendencias', async () => {
    const res = await como(SOLIC).post('/api/requisicoes-material').send({
      setor: 'Produção', urgencia: 'URGENTE', justificativa_urgencia: 'linha parada', os_referencia: 'OS-INT',
      itens: [{ material_id: matCliente, quantidade: 1 }],
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    req = res.body;
    assert.deepStrictEqual((await pend(req.id)).map((p) => p.regra_nome), ['Urgente', 'De cliente']);
    const bad = await como(SOLIC).post('/api/requisicoes-material').send({
      setor: 'Produção', urgencia: 'urgente', os_referencia: 'OS-INT', itens: [{ material_id: matNosso, quantidade: 1 }],
    });
    assert.strictEqual(bad.status, 400);
    assert.strictEqual(bad.body.error, 'Urgência inválida: urgente');
  });

  await test('(2) a fila de regras da Etapa 47 entrega cada pendencia a quem assina', async () => {
    const daAna = (await como(ANA).get('/api/almoxarifado/aprovacoes-regra/pendentes')).body.filter((p) => p.requisicao_id === req.id);
    const daBia = (await como(BIA).get('/api/almoxarifado/aprovacoes-regra/pendentes')).body.filter((p) => p.requisicao_id === req.id);
    assert.deepStrictEqual(daAna.map((p) => p.regra_nome), ['Urgente']);
    assert.deepStrictEqual(daBia.map((p) => p.regra_nome), ['De cliente']);
  });

  await test('(3) auto-aprovacao ligada: URGENTE com regra fica PENDENTE; NORMAL sem regra aprova', async () => {
    await setConfig('aprovacao_automatica', '1');
    try {
      const comRegra = await como(SOLIC).post('/api/almoxarifado/requisicoes')
        .send({ urgencia: 'URGENTE', justificativa_urgencia: 'x', os_referencia: 'OS-INT', itens: [{ material_id: matNosso, quantidade: 1 }] });
      assert.strictEqual(comRegra.body.status, 'PENDENTE', JSON.stringify(comRegra.body));
      const semRegra = await como(SOLIC).post('/api/almoxarifado/requisicoes')
        .send({ urgencia: 'NORMAL', os_referencia: 'OS-INT', itens: [{ material_id: matNosso, quantidade: 1 }] });
      // Etapa 73 (D4/B360): a aprovacao automatica reserva (C122) e responde o status gravado.
      assert.strictEqual(semRegra.body.status, 'TOTALMENTE_RESERVADA', JSON.stringify(semRegra.body));
      assert.strictEqual(semRegra.body.aprovacao, 'automatica');
    } finally {
      await setConfig('aprovacao_automatica', '0');
    }
  });

  await test('(4) a requisicao NAO AVALIADA aparece no GET da fila simples, e o /aprovar a barra com a literal', async () => {
    const res = await como(SOLIC).post('/api/almoxarifado/requisicoes')
      .send({ urgencia: 'NORMAL', os_referencia: 'OS-INT', itens: [{ material_id: matCliente, quantidade: 1 }] });
    // O estado de quando o avaliador falha no envio: sem carimbo, sem pendência.
    await dbRun(db, 'DELETE FROM requisicao_aprovacoes_regra WHERE requisicao_id = ?', [res.body.id]);
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET regras_avaliadas_em = NULL WHERE id = ?', [res.body.id]);
    const linha = (await como(CAIO).get('/api/almoxarifado/requisicoes').query({ status: 'PENDENTE' })).body
      .find((r) => r.id === res.body.id);
    assert.ok(linha, 'a requisicao nao avaliada sumiu do GET da fila simples');
    assert.strictEqual(linha.pendencias_regra_abertas, 0);
    assert.strictEqual(linha.regras_avaliadas_em, null, 'o GET nao expoe o carimbo que a tela usa para marcar');
    const ap = await como(CAIO).put(`/api/almoxarifado/requisicoes/${res.body.id}/aprovar`);
    assert.strictEqual(ap.status, 400, JSON.stringify(ap.body));
    assert.strictEqual(ap.body.error, 'Requisição tem aprovação de regra pendente: De cliente');
    const reservas = await dbGet(db, "SELECT COUNT(*) n FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'", [res.body.id]);
    assert.strictEqual(reservas.n, 0);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
