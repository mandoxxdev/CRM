/**
 * Etapa 48, T1 (RN-01) — a urgência da requisição vira lista fechada.
 *
 * Plano:  docs/superpowers/plans/2026-09-30-almoxarifado-etapa48-regras-urgencia-cliente-fila-simples.md
 * Design: docs/superpowers/specs/2026-09-30-almoxarifado-etapa48-regras-urgencia-cliente-fila-simples-design.md
 *
 * Era texto livre no servidor. Critério de regra sobre enum aberto nunca casaria com o que entrasse
 * por fora ('urgente', 'ALTA'), e — medido pela Fase 2 — a trava "Crítico nunca é auto-aprovada"
 * comparava o valor EXATO: um rascunho antigo com 'critico' minúsculo era auto-aprovado.
 *
 * Executar: cd server && node tests/api/requisicaoUrgencia.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const SOLIC = { id: 10, nome: 'Solicitante', email: 'solic@test.com' };

(async () => {
  console.log('\n=== Etapa 48 T1: urgencia como lista fechada ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  const como = (u) => { setUser(u); return request(app); };

  const fam = await como(ADMIN).post('/api/almoxarifado/familias').send({ codigo: 'FAME48U', nome: 'Família E48' });
  const mat = await como(ADMIN).post('/api/almoxarifado/materiais')
    .send({ codigo: 'MATE48U-1', nome: 'Material E48', familia_id: fam.body.id, unidade: 'UN' });
  await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 100, custo_unitario = 1 WHERE id = ?', [mat.body.id]);
  const ITENS = [{ material_id: mat.body.id, quantidade: 1 }];
  const contar = async () => (await dbGet(db, 'SELECT COUNT(*) n FROM requisicoes_almoxarifado')).n;

  const ROTAS = [
    { nome: 'almoxarifado', url: '/api/almoxarifado/requisicoes', extra: {} },
    // A segunda rota exige setor ANTES do serviço (Fase 2, MINOR 2).
    { nome: 'requisicoes-material', url: '/api/requisicoes-material', extra: { setor: 'Produção' } },
  ];

  for (const r of ROTAS) {
    await test(`(1) [${r.nome}] urgencia fora da lista -> 400 com a literal, e NADA gravado`, async () => {
      for (const valor of ['ALTA', 'urgente', 'Critico']) {
        const antes = await contar();
        const res = await como(SOLIC).post(r.url).send({ itens: ITENS, urgencia: valor, ...r.extra });
        assert.strictEqual(res.status, 400, `${valor}: ${res.status} ${JSON.stringify(res.body)}`);
        assert.strictEqual(res.body.error, `Urgência inválida: ${valor}`);
        assert.strictEqual(await contar(), antes, `${valor}: a requisicao recusada foi gravada`);
      }
    });

    await test(`(2) [${r.nome}] os tres valores validos passam, e vazio/ausente viram NORMAL`, async () => {
      for (const valor of ['NORMAL', 'URGENTE', 'CRITICO']) {
        const res = await como(SOLIC).post(r.url).send({
          itens: ITENS, urgencia: valor, justificativa_urgencia: 'linha parada', ...r.extra,
        });
        assert.strictEqual(res.status, 201, `${valor}: ${JSON.stringify(res.body)}`);
        const row = await dbGet(db, 'SELECT urgencia FROM requisicoes_almoxarifado WHERE id = ?', [res.body.id]);
        assert.strictEqual(row.urgencia, valor);
      }
      for (const body of [{ urgencia: '' }, { urgencia: null }, {}]) {
        const res = await como(SOLIC).post(r.url).send({ itens: ITENS, ...body, ...r.extra });
        assert.strictEqual(res.status, 201, `${JSON.stringify(body)}: ${JSON.stringify(res.body)}`);
        const row = await dbGet(db, 'SELECT urgencia FROM requisicoes_almoxarifado WHERE id = ?', [res.body.id]);
        assert.strictEqual(row.urgencia, 'NORMAL', `${JSON.stringify(body)} gravou ${row.urgencia}`);
      }
    });
  }

  await test('(3) rascunho ANTIGO com "critico" minusculo NAO e auto-aprovado (Fase 2, IMPORTANT-2)', async () => {
    // O passado não é reescrito (letra B): um rascunho gravado antes da lista fechar pode ter
    // qualquer texto — e o /enviar não passa por createRequisicao. A trava do Crítico tem de valer
    // para ele também.
    await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES ('aprovacao_automatica','1')
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`);
    try {
      const antigo = async (urg) => {
        const r = await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, urgencia)
          VALUES (?, ?, 'Solic', 'RASCUNHO', ?)`, [`REQ-E48-${urg}-${Date.now()}`, SOLIC.id, urg]);
        await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,1)',
          [r.lastID, mat.body.id]);
        return r.lastID;
      };
      const critMinusculo = await antigo('critico');
      const env = await como(SOLIC).post(`/api/almoxarifado/requisicoes/${critMinusculo}/enviar`);
      assert.strictEqual(env.status, 200, JSON.stringify(env.body));
      assert.strictEqual(env.body.status, 'PENDENTE', `o "critico" minusculo foi auto-aprovado: ${JSON.stringify(env.body)}`);
      // Metade positiva: um antigo NORMAL continua sendo auto-aprovado.
      const normal = await antigo('NORMAL');
      const env2 = await como(SOLIC).post(`/api/almoxarifado/requisicoes/${normal}/enviar`);
      assert.strictEqual(env2.body.status, 'APROVADO', JSON.stringify(env2.body));
    } finally {
      await dbRun(db, "UPDATE configuracoes_almoxarifado SET valor = '0' WHERE chave = 'aprovacao_automatica'");
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
