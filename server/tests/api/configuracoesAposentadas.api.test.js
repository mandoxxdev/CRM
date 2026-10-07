/**
 * Etapa 47, T2 (RN-04) — `limite_aprovacao_auto` sai da listagem de configurações do módulo.
 *
 * Plano:  docs/superpowers/plans/2026-09-30-almoxarifado-etapa47-aprovacoes-com-regras.md (T2)
 * Design: docs/superpowers/specs/2026-09-30-almoxarifado-etapa47-aprovacoes-com-regras-design.md (7.4)
 *
 * A chave prometia "Quantidade máxima para aprovação automática por item", e aprovação automática
 * por quantidade NÃO existe — o grep do repositório inteiro devolve só o seed. A spec 06 manda
 * escolher: "ou ganha leitor, ou sai". Escolhido: sair, de forma REVERSÍVEL.
 *
 * ── POR QUE TRÊS CAMADAS, E NÃO SÓ O SEED ───────────────────────────────────────────────────
 * Tirar do seed sozinho entregava ZERO em produção: a linha já gravada continua lá, e o
 * `GET /configuracoes` é `SELECT *`. Então:
 *   - o seed para de criar a chave (instalação nova não a tem) — cenário (1);
 *   - o GET esconde a linha órfã de produção — cenário (2);
 *   - o PUT a trata como desconhecida — cenário (3). Sem isso, a chave some da listagem mas
 *     continua gravável, e um formulário antigo (ou um script) a reescreveria com 200.
 * E SEM `DELETE`: a linha de produção fica parada e intacta — o (3) prova isso também. Apagar é
 * irreversível; dado que ninguém lê não faz mal.
 *
 * Executar: cd server && node tests/api/configuracoesAposentadas.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbGet, dbRun } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN_ALMOX = { id: 1, nome: 'Admin Almox', role: 'admin', perfil_almoxarifado: 'ADMINISTRADOR' };
const APOSENTADA = 'limite_aprovacao_auto';

(async () => {
  console.log('\n=== Etapa 47 T2: limite_aprovacao_auto sai da listagem ===\n');
  const { app, db, close } = await createTestApp({ user: ADMIN_ALMOX });

  await test('(1) instalacao nova: o seed NAO cria a chave — e a vizinha de aprovacao continua semeada', async () => {
    const aposentada = await dbGet(db, 'SELECT chave FROM configuracoes_almoxarifado WHERE chave = ?', [APOSENTADA]);
    assert.strictEqual(aposentada, undefined, 'o seed ainda cria limite_aprovacao_auto');
    // Metade positiva: a chave VIVA do mesmo bloco (a que tem leitor) continua. Sem isto, apagar o
    // bloco inteiro passaria.
    const viva = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'aprovacao_automatica'");
    assert.ok(viva, 'o seed perdeu aprovacao_automatica, que tem leitor real');
  });

  // A linha como ela existe em PRODUÇÃO: gravada por um seed anterior a esta etapa.
  await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor, descricao)
    VALUES (?, '5', 'Quantidade máxima para aprovação automática por item')`, [APOSENTADA]);

  await test('(2) a linha orfa de producao NAO aparece no GET — e as vizinhas de aprovacao aparecem', async () => {
    const res = await request(app).get('/api/almoxarifado/configuracoes');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(!(APOSENTADA in res.body), 'a listagem ainda devolve limite_aprovacao_auto');
    assert.ok('aprovacao_automatica' in res.body, 'a listagem perdeu aprovacao_automatica');
    assert.ok('prazo_atendimento_horas' in res.body, 'a listagem perdeu prazo_atendimento_horas');
  });

  await test('(3) o PUT a trata como desconhecida (400, mensagem literal) — e a linha de producao fica INTACTA', async () => {
    const res = await request(app).put('/api/almoxarifado/configuracoes').send({ [APOSENTADA]: '9' });
    assert.strictEqual(res.status, 400, `o PUT aceitou a chave aposentada: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, `Configuração desconhecida: ${APOSENTADA}`);
    const row = await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [APOSENTADA]);
    assert.ok(row, 'a linha de producao foi APAGADA — a decisao era nao apagar (reversivel)');
    assert.strictEqual(row.valor, '5', 'a linha de producao foi reescrita');
  });

  await test('(4) o PUT de uma chave viva continua funcionando', async () => {
    const res = await request(app).put('/api/almoxarifado/configuracoes').send({ aprovacao_automatica: '0' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
