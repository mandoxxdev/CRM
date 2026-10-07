/**
 * Etapa 48, T2 (RN-02/03) — critérios de URGÊNCIA e de MATERIAL DE CLIENTE nas regras de aprovação.
 *
 * Plano: docs/superpowers/plans/2026-09-30-almoxarifado-etapa48-regras-urgencia-cliente-fila-simples.md
 *
 * Cada critério com as DUAS metades (casa / não casa) — um critério ignorado pelo avaliador casaria
 * com TODA requisição e travaria a fábrica inteira, e só a metade negativa pega isso (foi assim
 * que a Fase 5 da Etapa 47 achou tipo e centro de custo sem teste).
 *
 * Executar: cd server && node tests/api/regrasUrgenciaCliente.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const SOLIC = { id: 10, nome: 'Solicitante', email: 'solic@test.com' };
const ANA = { id: 11, nome: 'Ana', email: 'ana@test.com', perfil_almoxarifado: 'GESTOR' };

(async () => {
  console.log('\n=== Etapa 48 T2: criterios de urgencia e de material de cliente ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  const como = (u) => { setUser(u); return request(app); };
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const u of [ADMIN, SOLIC, ANA]) {
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [u.id, u.nome, u.email]);
  }
  const clienteId = (await dbRun(db, "INSERT INTO clientes (razao_social, nome_fantasia) VALUES ('Cliente E48', 'Cliente E48')")
    .catch(() => dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente E48')"))).lastID;

  const fam = await como(ADMIN).post('/api/almoxarifado/familias').send({ codigo: 'FAME48R', nome: 'Família E48 regras' });
  let n = 0;
  async function material({ cliente = null } = {}) {
    n += 1;
    const res = await como(ADMIN).post('/api/almoxarifado/materiais')
      .send({ codigo: `MATE48R-${n}`, nome: `Material E48 ${n}`, familia_id: fam.body.id, unidade: 'UN' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 100, custo_unitario = 1, proprietario_cliente_id = ? WHERE id = ?',
      [cliente, res.body.id]);
    return res.body.id;
  }
  const matNosso = await material();
  const matCliente = await material({ cliente: clienteId });

  const enviar = async (itens, extra = {}) => {
    const res = await como(SOLIC).post('/api/almoxarifado/requisicoes')
      .send({ itens, urgencia: 'NORMAL', justificativa_urgencia: 'teste', os_referencia: 'OS-INT', ...extra });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    return (await dbAll(db, 'SELECT regra_nome FROM requisicao_aprovacoes_regra WHERE requisicao_id = ? ORDER BY regra_id', [res.body.id]))
      .map((p) => p.regra_nome);
  };
  const criar = (body) => como(ADMIN).post('/api/almoxarifado/regras-aprovacao').send({ aprovadores: [ANA.id], ...body });

  await test('(1) cadastro: urgencia fora da lista -> literal; material_cliente 0 sozinho -> sem criterio', async () => {
    const r1 = await criar({ nome: 'x', urgencia: 'ALTA' });
    assert.strictEqual(r1.status, 400);
    assert.strictEqual(r1.body.error, 'Urgência inválida: ALTA');
    // Fase 5 (MINOR-C): a lista e EXATA tambem no cadastro - 'urgente' minusculo criaria regra morta.
    const rMin = await criar({ nome: 'x', urgencia: 'urgente' });
    assert.strictEqual(rMin.status, 400);
    assert.strictEqual(rMin.body.error, 'Urgência inválida: urgente');
    const r2 = await criar({ nome: 'x', material_cliente: 0 });
    assert.strictEqual(r2.status, 400);
    assert.strictEqual(r2.body.error, 'Regra precisa de pelo menos um critério');
  });

  const rUrg = await criar({ nome: 'Urgente', urgencia: 'URGENTE' });
  await test('(2) a regra de urgencia volta com o criterio, e casa SO a urgencia dela', async () => {
    assert.strictEqual(rUrg.status, 201, JSON.stringify(rUrg.body));
    assert.strictEqual(rUrg.body.urgencia, 'URGENTE');
    assert.deepStrictEqual(await enviar([{ material_id: matNosso, quantidade: 1 }], { urgencia: 'URGENTE' }), ['Urgente']);
    assert.deepStrictEqual(await enviar([{ material_id: matNosso, quantidade: 1 }], { urgencia: 'NORMAL' }), []);
    assert.deepStrictEqual(await enviar([{ material_id: matNosso, quantidade: 1 }], { urgencia: 'CRITICO' }), []);
    await como(ADMIN).put(`/api/almoxarifado/regras-aprovacao/${rUrg.body.id}`).send({ ...rUrg.body, ativo: false });
  });

  const rCli = await criar({ nome: 'Material de cliente', material_cliente: true });
  await test('(3) a regra de material de cliente casa se ALGUM material tem dono, e so ai', async () => {
    assert.strictEqual(rCli.status, 201, JSON.stringify(rCli.body));
    assert.strictEqual(rCli.body.material_cliente, 1);
    assert.deepStrictEqual(await enviar([{ material_id: matNosso, quantidade: 1 }, { material_id: matCliente, quantidade: 1 }]),
      ['Material de cliente']);
    assert.deepStrictEqual(await enviar([{ material_id: matNosso, quantidade: 1 }]), []);
  });

  await test('(4) os dois criterios juntos sao E: urgente COM material de cliente', async () => {
    const r = await criar({ nome: 'Urgente de cliente', urgencia: 'URGENTE', material_cliente: true });
    assert.strictEqual(r.status, 201);
    const ambos = await enviar([{ material_id: matCliente, quantidade: 1 }], { urgencia: 'URGENTE' });
    assert.ok(ambos.includes('Urgente de cliente'), JSON.stringify(ambos));
    const soCliente = await enviar([{ material_id: matCliente, quantidade: 1 }], { urgencia: 'NORMAL' });
    assert.ok(!soCliente.includes('Urgente de cliente'), 'casou sem a urgencia');
    const soUrgente = await enviar([{ material_id: matNosso, quantidade: 1 }], { urgencia: 'URGENTE' });
    assert.ok(!soUrgente.includes('Urgente de cliente'), 'casou sem material de cliente');
  });

  await test('(5) PUT sem um campo PRESERVA o criterio; null explicito limpa (Fase 5, MINOR-1)', async () => {
    const r = await criar({ nome: 'Urgente e caro', urgencia: 'URGENTE', valor_minimo: 5 });
    assert.strictEqual(r.status, 201);
    // Cliente que não conhece `urgencia` (bundle antigo, script): só manda o valor.
    const put = await como(ADMIN).put(`/api/almoxarifado/regras-aprovacao/${r.body.id}`)
      .send({ nome: 'Urgente e caro', valor_minimo: 7, aprovadores: [ANA.id] });
    assert.strictEqual(put.status, 200, JSON.stringify(put.body));
    assert.strictEqual(put.body.regra.urgencia, 'URGENTE', 'o PUT sem o campo apagou o criterio de urgencia');
    assert.strictEqual(put.body.regra.valor_minimo, 7);
    const limpa = await como(ADMIN).put(`/api/almoxarifado/regras-aprovacao/${r.body.id}`).send({ urgencia: null });
    assert.strictEqual(limpa.status, 200, JSON.stringify(limpa.body));
    assert.strictEqual(limpa.body.regra.urgencia, null, 'null explicito nao limpou');
    assert.strictEqual(limpa.body.regra.valor_minimo, 7);
  });

  await test('(6) PUT so com o NOME: os dois criterios novos continuam gravados — relidos do banco (Fase 5, IMPORTANT-A)', async () => {
    const r = await criar({ nome: 'So urgente de cliente', urgencia: 'URGENTE', material_cliente: true });
    assert.strictEqual(r.status, 201);
    const put = await como(ADMIN).put(`/api/almoxarifado/regras-aprovacao/${r.body.id}`).send({ nome: 'Renomeada' });
    assert.strictEqual(put.status, 200, JSON.stringify(put.body));
    const { dbGet } = require('../../services/almoxarifado/db');
    const linha = await dbGet(db, 'SELECT nome, urgencia, material_cliente, ativo FROM regras_aprovacao WHERE id = ?', [r.body.id]);
    assert.deepStrictEqual({ ...linha }, { nome: 'Renomeada', urgencia: 'URGENTE', material_cliente: 1, ativo: 1 },
      'editar o nome apagou criterio — a regra passaria a valer para toda requisicao');
    await como(ADMIN).put(`/api/almoxarifado/regras-aprovacao/${r.body.id}`).send({ ativo: false });
  });

  await test('(7) urgencia NULA de requisicao legada casa a regra "Normal" (o padrao NORMAL, Fase 5 MINOR-B)', async () => {
    const r = await criar({ nome: 'N', urgencia: 'NORMAL' });
    assert.strictEqual(r.status, 201);
    const ins = await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, urgencia, os_referencia)
      VALUES (?, ?, 'Solic', 'RASCUNHO', NULL, 'OS-INT')`, [`REQ-E48N-${Date.now()}`, SOLIC.id]);
    await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,1)',
      [ins.lastID, matNosso]);
    const env = await como(SOLIC).post(`/api/almoxarifado/requisicoes/${ins.lastID}/enviar`);
    assert.strictEqual(env.status, 200, JSON.stringify(env.body));
    const nomes = (await dbAll(db, 'SELECT regra_nome FROM requisicao_aprovacoes_regra WHERE requisicao_id = ?', [ins.lastID]))
      .map((p) => p.regra_nome);
    assert.ok(nomes.includes('N'), `a urgencia nula nao casou a regra Normal: ${JSON.stringify(nomes)}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
