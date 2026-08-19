/**
 * Etapa 9b, Task 1 — Fundacao de ferramentas: tabelas, maquina de estados, acao de perfil.
 *
 * Executar: cd server && node tests/api/toolFundacao.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbAll, dbGet } = require('../../services/almoxarifado/db');
const { STATUS, TRANSICOES, podeTransicionar } = require('../../services/almoxarifado/toolStateMachine');
const { ACAO_PERFIS, can } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

(async () => {
  await test('tabelas novas existem com as colunas do design', async () => {
    const { db, close } = await createTestApp();
    for (const [tabela, coluna] of [
      ['calibracoes_ferramenta_almoxarifado', 'data_validade'],
      ['manutencoes_ferramenta_almoxarifado', 'data_fim'],
      ['ocorrencias_ferramenta_almoxarifado', 'foto_path'],
    ]) {
      const cols = await dbAll(db, `PRAGMA table_info(${tabela})`);
      assert.ok(cols.length > 0, `tabela ${tabela} nao existe`);
      assert.ok(cols.some(c => c.name === coluna), `${tabela} sem coluna ${coluna}`);
    }
    const fcols = await dbAll(db, 'PRAGMA table_info(ferramentas_almoxarifado)');
    for (const c of ['numero_serie', 'localizacao_id', 'exige_calibracao'])
      assert.ok(fcols.some(x => x.name === c), `ferramentas sem coluna ${c}`);
    await close();
  });

  await test('maquina de estados: transicoes do design valem, inventadas nao', async () => {
    assert.ok(podeTransicionar(STATUS.DISPONIVEL, STATUS.EMPRESTADA));
    assert.ok(podeTransicionar(STATUS.EMPRESTADA, STATUS.DISPONIVEL));   // devolucao
    assert.ok(podeTransicionar(STATUS.EMPRESTADA, STATUS.AVARIADA));     // RN-05
    assert.ok(podeTransicionar(STATUS.EMPRESTADA, STATUS.PERDIDA));      // RN-05
    assert.ok(podeTransicionar(STATUS.AVARIADA, STATUS.EM_MANUTENCAO));  // RN-07 conserto
    assert.ok(podeTransicionar(STATUS.EM_MANUTENCAO, STATUS.DISPONIVEL));
    assert.ok(podeTransicionar(STATUS.PERDIDA, STATUS.DISPONIVEL));      // RN-10
    assert.ok(!podeTransicionar(STATUS.EMPRESTADA, STATUS.EMPRESTADA));  // RN-01
    assert.ok(!podeTransicionar(STATUS.BLOQUEADA, STATUS.EMPRESTADA));   // RN-02
    assert.ok(!podeTransicionar(STATUS.EMPRESTADA, STATUS.EM_MANUTENCAO)); // RN-07 emprestada nao entra
  });

  await test('RN-09: acao gerenciar_ferramentas existe e nega PRODUCAO', async () => {
    assert.deepStrictEqual(ACAO_PERFIS.gerenciar_ferramentas.sort(), ['ADMINISTRADOR', 'ALMOXARIFE']);
    assert.ok(can({ id: 9, perfil_almoxarifado: 'ALMOXARIFE' }, 'gerenciar_ferramentas'));
    assert.ok(!can({ id: 9 }, 'gerenciar_ferramentas')); // sem perfil = PRODUCAO
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
