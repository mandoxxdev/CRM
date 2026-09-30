/**
 * Etapa 47, T8 — integração cruzando T1 (lembrete de valor), T3/T4 (regras, gate, segregação) e
 * T5 (lembrete por pendência), num fluxo só.
 *
 * Plano: docs/superpowers/plans/2026-09-30-almoxarifado-etapa47-aprovacoes-com-regras.md (T8)
 *
 * Entra pela SEGUNDA rota de criação (`/api/requisicoes-material`), que nenhum cenário das tasks
 * cobria — o avaliador mora em `dispararNotificacoesCriacao` e ela chega lá por construção, mas
 * "por construção" é o que a Etapa 25 aprendeu a não aceitar sem cenário. E entra também pelo
 * SERVIÇO (`createRequisicao` direto), que é a outra porta que a skill manda exercitar.
 *
 * O fluxo: requisição que casa DUAS regras E passa do limite de valor →
 *   a liberação por valor é barrada pelas regras →
 *   o job cobra CADA pendência da sua plateia, e cala a lane de valor →
 *   duas pessoas diferentes assinam (a segregação vale em cada perna) →
 *   o job volta a cobrar a liberação por valor, agora da plateia DELA →
 *   a liberação passa e reserva.
 *
 * Executar: cd server && node tests/api/integracaoAprovacoesRegra.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const reminder = require('../../services/almoxarifado/requisitionReminderService');
const alertService = require('../../services/almoxarifado/alertService');
const requisitionCreateService = require('../../services/almoxarifado/requisitionCreateService');

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
  console.log('\n=== Etapa 47 T8: integracao — regras + liberacao por valor + lembretes ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  const como = (u) => { setUser(u); return request(app); };
  const setConfig = (chave, valor) => dbRun(db,
    `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const u of [ADMIN, SOLIC, ANA, BIA, CAIO]) {
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [u.id, u.nome, u.email]);
  }
  await setConfig('requisicoes_lembrete_ativo', '1');
  await setConfig('requisicoes_lembrete_intervalo_horas', '24');
  await setConfig('requisicoes_notificar_emails', JSON.stringify(['geral@test.com']));
  await setConfig('liberacao_valor_ativo', '1');
  await setConfig('liberacao_valor_limite', '500');
  await setConfig('liberacao_valor_aprovadores', JSON.stringify([CAIO.id]));

  const fam = await como(ADMIN).post('/api/almoxarifado/familias').send({ codigo: 'FAME47I', nome: 'Família E47 integração' });
  let n = 0;
  async function material(custo, critico = 0) {
    n += 1;
    const res = await como(ADMIN).post('/api/almoxarifado/materiais')
      .send({ codigo: `MATE47I-${n}`, nome: `Material integração ${n}`, familia_id: fam.body.id, unidade: 'UN' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 100, custo_unitario = ?, custo_medio = 0, material_critico = ? WHERE id = ?',
      [custo, critico, res.body.id]);
    return res.body.id;
  }
  const matCaro = await material(600);
  const matCritico = await material(5, 1);

  const rValor = await como(ADMIN).post('/api/almoxarifado/regras-aprovacao')
    .send({ nome: 'Valor alto', valor_minimo: 1000, aprovadores: [ANA.id] });
  const rCritico = await como(ADMIN).post('/api/almoxarifado/regras-aprovacao')
    .send({ nome: 'Material crítico', material_critico: true, aprovadores: [BIA.id] });
  assert.strictEqual(rValor.status, 201); assert.strictEqual(rCritico.status, 201);

  // Coletor na porta do SMTP: o caminho do job é o real.
  let emails = [];
  const enviarOriginal = alertService.enviarEmail;
  alertService.enviarEmail = async (_db, dest, assunto) => {
    emails.push({ dest: [...dest].sort(), assunto });
    return { enviados: dest.length, erros: [] };
  };
  const rodarJob = async () => { emails = []; await reminder.processarLembretesPendentes(db); return emails; };
  const envelhecer = (reqId) => Promise.all([
    dbRun(db, "UPDATE requisicoes_almoxarifado SET updated_at = datetime('now','-30 hours'), ultimo_lembrete_enviado = NULL WHERE id = ?", [reqId]),
    dbRun(db, "UPDATE requisicao_aprovacoes_regra SET created_at = datetime('now','-30 hours'), ultimo_lembrete_enviado = NULL WHERE requisicao_id = ?", [reqId]),
  ]);

  let req;
  let pend;

  await test('(1) pela SEGUNDA rota de criacao: trava por valor E nasce com as duas pendencias', async () => {
    const res = await como(SOLIC).post('/api/requisicoes-material').send({
      setor: 'Produção', urgencia: 'NORMAL',
      itens: [{ material_id: matCaro, quantidade: 2 }, { material_id: matCritico, quantidade: 1 }],
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'AGUARDANDO_APROVACAO_VALOR');
    req = res.body;
    pend = await dbAll(db, 'SELECT * FROM requisicao_aprovacoes_regra WHERE requisicao_id = ? ORDER BY regra_id', [req.id]);
    assert.deepStrictEqual(pend.map((p) => p.regra_nome), ['Valor alto', 'Material crítico']);
  });

  await test('(2) a liberacao por valor e barrada pelas regras, sem mudar status nem reservar', async () => {
    const r = await como(CAIO).put(`/api/almoxarifado/requisicoes/${req.id}/aprovar-valor`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Requisição tem aprovação de regra pendente: Valor alto, Material crítico');
    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [req.id]);
    assert.strictEqual(row.status, 'AGUARDANDO_APROVACAO_VALOR');
  });

  await test('(3) o job cobra CADA pendencia da sua plateia — e cala a lane de valor', async () => {
    await envelhecer(req.id);
    const enviados = (await rodarJob()).filter((e) => e.assunto.includes(req.numero));
    const porRegra = Object.fromEntries(enviados.filter((e) => e.assunto.includes('da regra'))
      .map((e) => [e.assunto.match(/regra "([^"]+)"/)[1], e.dest]));
    assert.deepStrictEqual(porRegra, { 'Valor alto': ['ana@test.com'], 'Material crítico': ['bia@test.com'] },
      `as pendencias foram cobradas assim: ${JSON.stringify(enviados)}`);
    assert.ok(!enviados.some((e) => e.assunto.includes('liberação por valor')),
      'a lane de valor cobrou o Caio por um gesto que as regras estao barrando');
  });

  await test('(4) a segregacao vale em cada perna: fora da lista nao assina, a mesma pessoa nao assina duas', async () => {
    const [pValor, pCritico] = pend;
    const url = (p) => `/api/almoxarifado/requisicoes/${req.id}/aprovacoes-regra/${p.id}/aprovar`;
    const caio = await como(CAIO).put(url(pValor));
    assert.strictEqual(caio.status, 403);
    assert.strictEqual(caio.body.error, 'Você não está entre os aprovadores desta regra');
    // O admin vale para qualquer regra: assina a do valor...
    assert.strictEqual((await como(ADMIN).put(url(pValor))).status, 200);
    // ...e NÃO pode satisfazer a segunda com a mesma assinatura (RN-07).
    const dupla = await como(ADMIN).put(url(pCritico));
    assert.strictEqual(dupla.status, 403);
    assert.strictEqual(dupla.body.error, 'Você já assinou outra aprovação de regra desta requisição');
    // Uma SEGUNDA pessoa, da lista, sim.
    const bia = await como(BIA).put(url(pCritico));
    assert.strictEqual(bia.status, 200, JSON.stringify(bia.body));
    assert.strictEqual(bia.body.pendencias_abertas, 0);
  });

  await test('(5) sem pendencia aberta, o job volta a cobrar a liberacao por valor — da plateia DELA', async () => {
    await envelhecer(req.id);
    const enviados = (await rodarJob()).filter((e) => e.assunto.includes(req.numero));
    assert.strictEqual(enviados.length, 1, JSON.stringify(enviados));
    assert.ok(enviados[0].assunto.includes('aguardando liberação por valor'), enviados[0].assunto);
    assert.deepStrictEqual(enviados[0].dest, ['caio@test.com']);
  });

  await test('(6) a liberacao passa e reserva', async () => {
    const r = await como(CAIO).put(`/api/almoxarifado/requisicoes/${req.id}/aprovar-valor`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const reservas = await dbGet(db, "SELECT COUNT(*) n FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'", [req.id]);
    assert.ok(reservas.n > 0, 'liberou sem reservar');
    const aud = await dbAll(db, "SELECT acao FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ?", [req.id]);
    const acoes = aud.map((a) => a.acao);
    assert.strictEqual(acoes.filter((a) => a === 'APROVACAO_REGRA').length, 2, JSON.stringify(acoes));
    assert.ok(acoes.includes('APROVACAO_VALOR'), JSON.stringify(acoes));
  });

  await test('(7) pela porta do SERVICO: createRequisicao direto tambem gera a pendencia', async () => {
    const r = await requisitionCreateService.createRequisicao(db, SOLIC, {
      itens: [{ material_id: matCritico, quantidade: 1 }], urgencia: 'NORMAL', tipo_requisicao: 'CONSUMO',
    }, { modulo: 'teste' });
    const p = await dbAll(db, 'SELECT regra_nome FROM requisicao_aprovacoes_regra WHERE requisicao_id = ?', [r.id]);
    assert.deepStrictEqual(p.map((x) => x.regra_nome), ['Material crítico']);
  });

  alertService.enviarEmail = enviarOriginal;
  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
