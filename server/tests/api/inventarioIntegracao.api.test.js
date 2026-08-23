/**
 * Etapa 10, Task 4 — teste-jornada cruzando Task 1 (motor: tipo AJUSTE_INVENTARIO + guarda de
 * retencao RN-06) e Task 2 (rota: contagem cega, tolerancia+recontagem, aplicacao tudo-ou-nada).
 *
 * Task 1, Task 2 e Task 3 (front) ja tem cobertura unitaria/isolada propria — este arquivo NAO
 * repete aquilo. O objetivo aqui e provar que as pecas se COMPOEM como UMA jornada continua pela
 * API HTTP real, com uma sequencia de eventos que nenhum teste unitario de tarefa isolada monta:
 * contagem cega -> tolerancia estoura -> recontagem -> bloqueio aplicado pela ROTA REAL de
 * movimentacao (nao por INSERT direto na fixture, como conferenciaMotorAjuste.api.test.js faz) ->
 * ajuste tudo-ou-nada recusado por retencao -> desbloqueio -> ajuste aplicado -> historico ->
 * RN-03 e RN-10 no rescaldo.
 *
 * custo_unitario=10 no material E DE PROPOSITO: sem custo, o impactoFinanceiro fica 0 e a
 * asercao final nao prova nada (achado da Fase 2 do plano).
 *
 * Executar: cd server && node tests/api/inventarioIntegracao.api.test.js
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

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  await test('jornada completa: contagem cega, tolerancia, recontagem, bloqueio real e ajuste tudo-ou-nada', async () => {
    // ── Passo 1: material com custo, para o impactoFinanceiro final provar algo de verdade. ──
    setUser(ADMIN);
    const insMat = await dbRun(db, `INSERT INTO materiais_almoxarifado
        (codigo, nome, unidade, quantidade_atual, custo_unitario, quantidade_bloqueada, ativo)
       VALUES ('INTG-1','Material Integracao','UN',100,10,0,1)`);
    const materialId = insMat.lastID;

    // ── Passo 2: conferencia cega, tolerancia 5%. ──
    const confRes = await request(app).post('/api/almoxarifado/conferencias')
      .send({ modo_cego: true, tolerancia_percentual: 5 });
    assert.strictEqual(confRes.status, 201, JSON.stringify(confRes.body));
    const confId = confRes.body.id;
    assert.strictEqual(confRes.body.modo_cego, 1, JSON.stringify(confRes.body));
    assert.strictEqual(confRes.body.tolerancia_percentual, 5, JSON.stringify(confRes.body));

    const itemRow = await dbGet(db,
      `SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND material_id = ?`,
      [confId, materialId]);
    assert.ok(itemRow, 'item da conferencia nao encontrado');
    assert.strictEqual(Number(itemRow.quantidade_sistema), 100, 'esperado inicial e o quantidade_atual, sem em_terceiros');

    // ── Passo 3: GET como ALMOXARIFE (sem ajustar_estoque) — contagem cega esconde o esperado, ──
    // ── mas recontagem_necessaria (calculada no servidor) tem de aparecer mesmo assim. ──
    setUser(ALMOXARIFE);
    const getAntes = await request(app).get(`/api/almoxarifado/conferencias/${confId}`);
    assert.strictEqual(getAntes.status, 200, JSON.stringify(getAntes.body));
    const itemAntes = getAntes.body.itens.find((i) => i.material_id === materialId);
    assert.ok(itemAntes, 'item nao encontrado na resposta do GET');
    assert.ok(!('quantidade_sistema' in itemAntes), 'ALMOXARIFE sem ajustar_estoque nao deveria ver o esperado em modo cego');
    assert.ok(!('divergencia' in itemAntes), 'ALMOXARIFE sem ajustar_estoque nao deveria ver a divergencia em modo cego');
    assert.strictEqual(typeof itemAntes.recontagem_necessaria, 'boolean',
      'recontagem_necessaria tem de ser calculada no servidor mesmo sem o operador ver o numero');

    // ── Passo 4: contagem 90 contra esperado 100 -> divergencia -10%, acima da tolerancia 5%. ──
    const contagem1 = await request(app).put(`/api/almoxarifado/conferencias/${confId}/item/${itemRow.id}`)
      .send({ quantidade_contada: 90 });
    assert.strictEqual(contagem1.status, 200, JSON.stringify(contagem1.body));
    assert.strictEqual(contagem1.body.recontagem, false, 'primeira contagem nao e recontagem');

    // ── Passo 5: concluir SEM justificativa_ajuste, aplicar_ajustes=true -> RN-06b, ──
    // ── IMEDIATO, antes de qualquer outra validacao (a conferencia nem e buscada). ──
    setUser(ADMIN);
    const semJustificativa = await request(app).put(`/api/almoxarifado/conferencias/${confId}/concluir`)
      .send({ aplicar_ajustes: true });
    assert.strictEqual(semJustificativa.status, 400, JSON.stringify(semJustificativa.body));
    assert.strictEqual(semJustificativa.body.error, 'Justificativa deve ter pelo menos 5 caracteres');

    // ── Passo 6: concluir COM justificativa_ajuste, aplicar_ajustes=false -> RN-05 bloqueia ──
    // ── mesmo sem aplicar ajuste (a tolerancia protege o REGISTRO, nao so o ajuste). Nada muda. ──
    const semAplicar = await request(app).put(`/api/almoxarifado/conferencias/${confId}/concluir`)
      .send({ aplicar_ajustes: false, justificativa_ajuste: 'Tentando concluir mesmo assim' });
    assert.strictEqual(semAplicar.status, 400, JSON.stringify(semAplicar.body));
    assert.ok(semAplicar.body.error.startsWith('Recontagem necessária antes de concluir:'), JSON.stringify(semAplicar.body));
    assert.ok(semAplicar.body.error.includes('INTG-1'), JSON.stringify(semAplicar.body));

    const materialAposBloqueioTolerancia = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [materialId]);
    assert.strictEqual(Number(materialAposBloqueioTolerancia.quantidade_atual), 100, 'RN-05 nao pode ter tocado o material');
    const confAposTolerancia = await dbGet(db, 'SELECT status FROM conferencias_almoxarifado WHERE id = ?', [confId]);
    assert.strictEqual(confAposTolerancia.status, 'ABERTO');

    // ── Passo 7: recontar o MESMO item (RN-04) -> recontado=1, libera a conclusao qualquer que ──
    // ── seja o novo valor, sem rodar tolerancia de novo neste item. ──
    const recontagem = await request(app).put(`/api/almoxarifado/conferencias/${confId}/item/${itemRow.id}`)
      .send({ quantidade_contada: 88 });
    assert.strictEqual(recontagem.status, 200, JSON.stringify(recontagem.body));
    assert.strictEqual(recontagem.body.recontagem, true, 'segunda contagem do mesmo item tem de ser recontagem');
    const itemRecontado = await dbGet(db, 'SELECT recontado, divergencia FROM itens_conferencia_almoxarifado WHERE id = ?', [itemRow.id]);
    assert.strictEqual(Number(itemRecontado.recontado), 1);
    assert.strictEqual(Number(itemRecontado.divergencia), -12, '88 - 100 = -12');

    // ── Passo 8: bloquear 95 unidades do material FORA da conferencia, pela rota REAL de ──
    // ── bloqueio avulso (POST /materiais/:id/bloquear, tipo BLOQUEIO por dentro) — nao por ──
    // ── INSERT direto na fixture, que e como conferenciaMotorAjuste.api.test.js monta o cenario ──
    // ── de retencao. Deixa a retencao (95) maior que o contado (88). ──
    const bloqueio = await request(app).post(`/api/almoxarifado/materiais/${materialId}/bloquear`)
      .send({ quantidade: 95, justificativa: 'Lote em analise' });
    assert.strictEqual(bloqueio.status, 200, JSON.stringify(bloqueio.body));
    const materialBloqueado = await dbGet(db, 'SELECT quantidade_bloqueada FROM materiais_almoxarifado WHERE id = ?', [materialId]);
    assert.strictEqual(Number(materialBloqueado.quantidade_bloqueada), 95, 'BLOQUEIO real tinha de gravar quantidade_bloqueada');

    // ── Passo 9: concluir com aplicar_ajustes=true + justificativa_ajuste -> 400 por RETENCAO ──
    // ── (RN-06/RN-07), NAO por permissao (ADMIN tem ajustar_material_cliente) — so 400. Tudo ou ──
    // ── nada: conferencia continua ABERTO, quantidade_atual continua 100, nenhuma movimentacao ──
    // ── AJUSTE_INVENTARIO gravada. ──
    const bloqueadoPorRetencao = await request(app).put(`/api/almoxarifado/conferencias/${confId}/concluir`)
      .send({ aplicar_ajustes: true, justificativa_ajuste: 'Tentando aplicar com retencao' });
    assert.strictEqual(bloqueadoPorRetencao.status, 400, JSON.stringify(bloqueadoPorRetencao.body));
    assert.ok(bloqueadoPorRetencao.body.error.startsWith('Ajuste bloqueado:'), JSON.stringify(bloqueadoPorRetencao.body));
    assert.ok(bloqueadoPorRetencao.body.error.includes('INTG-1'), JSON.stringify(bloqueadoPorRetencao.body));

    const materialAposRetencao = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [materialId]);
    assert.strictEqual(Number(materialAposRetencao.quantidade_atual), 100, 'tudo-ou-nada: nao pode ter aplicado nada');
    const confAposRetencao = await dbGet(db, 'SELECT status FROM conferencias_almoxarifado WHERE id = ?', [confId]);
    assert.strictEqual(confAposRetencao.status, 'ABERTO', 'conferencia nao pode ter concluido com o ajuste bloqueado');
    const movsAntesDesbloqueio = await dbAll(db,
      `SELECT * FROM movimentacoes_almoxarifado WHERE tipo = 'AJUSTE_INVENTARIO' AND material_id = ?`, [materialId]);
    assert.strictEqual(movsAntesDesbloqueio.length, 0, 'nenhuma movimentacao de ajuste deveria existir ainda');

    // ── Passo 10: desbloquear o material (rota real de novo). ──
    const desbloqueio = await request(app).post(`/api/almoxarifado/materiais/${materialId}/desbloquear`)
      .send({ quantidade: 95, justificativa: 'Lote liberado' });
    assert.strictEqual(desbloqueio.status, 200, JSON.stringify(desbloqueio.body));
    const materialDesbloqueado = await dbGet(db, 'SELECT quantidade_bloqueada FROM materiais_almoxarifado WHERE id = ?', [materialId]);
    assert.strictEqual(Number(materialDesbloqueado.quantidade_bloqueada), 0, 'DESBLOQUEIO real tinha de zerar quantidade_bloqueada');

    // ── Passo 11: concluir de novo com aplicar_ajustes=true + justificativa_ajuste -> 200, ──
    // ── caminho feliz aplica o numero certo pelo MOTOR (AJUSTE_INVENTARIO), com auditoria de ──
    // ── verdade e impactoFinanceiro = |divergencia| * custo = 12 * 10 = 120. ──
    const concluirOk = await request(app).put(`/api/almoxarifado/conferencias/${confId}/concluir`)
      .send({ aplicar_ajustes: true, justificativa_ajuste: 'Ajuste homologado apos desbloqueio' });
    assert.strictEqual(concluirOk.status, 200, JSON.stringify(concluirOk.body));
    assert.strictEqual(concluirOk.body.ajustesAplicados, 1, JSON.stringify(concluirOk.body));
    assert.strictEqual(concluirOk.body.impactoFinanceiro, 120, JSON.stringify(concluirOk.body));

    const materialFinal = await dbGet(db, 'SELECT quantidade_atual, quantidade_em_terceiros FROM materiais_almoxarifado WHERE id = ?', [materialId]);
    assert.strictEqual(Number(materialFinal.quantidade_atual), 88, 'quantidade_atual final tem de ser o contado (88), sem em_terceiros neste cenario');
    assert.strictEqual(Number(materialFinal.quantidade_em_terceiros || 0), 0);

    const movsAjuste = await dbAll(db,
      `SELECT * FROM movimentacoes_almoxarifado WHERE tipo = 'AJUSTE_INVENTARIO' AND material_id = ?`, [materialId]);
    assert.strictEqual(movsAjuste.length, 1, 'esperava exatamente uma movimentacao AJUSTE_INVENTARIO gravada pelo motor');
    const movAjuste = movsAjuste[0];
    assert.strictEqual(movAjuste.usuario_id, ADMIN.id);
    assert.ok(movAjuste.motivo && movAjuste.motivo.includes(confRes.body.numero), 'motivo deveria citar o numero da conferencia');

    const auditoria = await dbGet(db,
      `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'movimentacao' AND entidade_id = ? AND acao = 'AJUSTE_INVENTARIO'`,
      [movAjuste.id]);
    assert.ok(auditoria, 'a homologacao do inventario tem de deixar auditoria de verdade, nao so o UPDATE cru de antes');

    const itemAjustado = await dbGet(db, 'SELECT ajustado FROM itens_conferencia_almoxarifado WHERE id = ?', [itemRow.id]);
    assert.strictEqual(Number(itemAjustado.ajustado), 1);

    // ── Passo 12: GET concluida -> mostra quantidade_sistema mesmo em modo cego, para o mesmo ──
    // ── usuario ALMOXARIFE que antes nao via (concluida/cancelada e o registro historico). ──
    setUser(ALMOXARIFE);
    const getDepois = await request(app).get(`/api/almoxarifado/conferencias/${confId}`);
    assert.strictEqual(getDepois.status, 200, JSON.stringify(getDepois.body));
    assert.strictEqual(getDepois.body.status, 'CONCLUIDO');
    const itemDepois = getDepois.body.itens.find((i) => i.material_id === materialId);
    assert.ok('quantidade_sistema' in itemDepois, 'conferencia concluida e o registro historico: o esperado tem de voltar a aparecer');
    assert.strictEqual(Number(itemDepois.quantidade_sistema), 100);

    // ── Passo 13: PUT /item numa conferencia ja CONCLUIDA -> RN-03, 400. ──
    setUser(ADMIN);
    const putEmConcluida = await request(app).put(`/api/almoxarifado/conferencias/${confId}/item/${itemRow.id}`)
      .send({ quantidade_contada: 5 });
    assert.strictEqual(putEmConcluida.status, 400, JSON.stringify(putEmConcluida.body));
    assert.strictEqual(putEmConcluida.body.error, 'Conferência não está aberta (status atual: CONCLUIDO)');

    // ── Passo 14: POST /movimentacoes/:id/cancelar na AJUSTE_INVENTARIO recem-criada -> RN-10, ──
    // ── 400 — o caminho de correcao e uma nova conferencia, nao estorno. ──
    const estorno = await request(app).post(`/api/almoxarifado/movimentacoes/${movAjuste.id}/cancelar`)
      .send({ motivo: 'Tentando estornar o ajuste de inventario' });
    assert.strictEqual(estorno.status, 400, JSON.stringify(estorno.body));
    assert.strictEqual(estorno.body.error,
      'Ajuste de inventário não pode ser estornado por aqui — o caminho de correção é uma '
      + 'nova conferência de inventário.');

    const materialAposTentativaEstorno = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [materialId]);
    assert.strictEqual(Number(materialAposTentativaEstorno.quantidade_atual), 88, 'RN-10 recusado nao pode ter mexido no saldo');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
