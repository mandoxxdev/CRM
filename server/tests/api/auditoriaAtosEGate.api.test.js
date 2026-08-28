/**
 * Etapa 18, Task 2 — RN-05/RN-06/RN-07 + ordem estavel do log.
 *
 * O que este arquivo congela:
 *  - RN-05: `conferencias_almoxarifado.aprovador_id`/`aprovador_nome` existem no schema desde a
 *    Etapa 10 e NUNCA foram escritas por ninguem (duas colunas mortas). Passam a ser gravadas na
 *    conclusao COM `aplicar_ajustes` — quem conclui aplicando ajuste E quem homologa. Sem ajuste
 *    as colunas nao sao TOCADAS (nao e "gravar null": concluir sem mexer no saldo nao e
 *    homologacao, e um UPDATE que zerasse a coluna apagaria uma homologacao anterior).
 *  - RN-06: `GET /almoxarifado/auditoria` tinha SO `auth` — qualquer usuario com acesso ao modulo
 *    lia o log inteiro, inclusive `dados_anteriores/novos` de material, custo e requisicao. Passa
 *    a exigir `configurar` (so ADMINISTRADOR). A matriz usa usuarios `role:'usuario'` com
 *    `perfil_almoxarifado` DE PROPOSITO: com `role:'admin'`, `getPerfilFromUser` devolve
 *    ADMINISTRADOR para todos (permissions.js:93) e a matriz passaria vazia — todos os 8 casos
 *    dariam 200 e o teste nao saberia falhar.
 *  - RN-07: tres atos vizinhos que nao deixavam rastro nenhum passam a auditar. O DELETE de
 *    material precisa de SELECT ANTES do UPDATE por dois motivos: id inexistente NAO pode gerar
 *    linha fantasma (a rota responde `success:true` mesmo para id que nao existe), e
 *    `dados_anteriores.ativo` tem de ser o valor REAL lido, nao um `1` fixo.
 *  - Ordem estavel do log: `created_at` do SQLite tem resolucao de SEGUNDO, entao duas auditorias
 *    do mesmo ato empatam. Sem o desempate por `id DESC`, a ordem do GET e indefinida e a jornada
 *    da Task 4 seria flaky.
 *
 * Asserções sempre por entidade + acao + entidade_id, nunca por contagem global da tabela.
 *
 * Executar: cd server && node tests/api/auditoriaAtosEGate.api.test.js
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

// Usuario de SETUP (cria material/conferencia/requisicao e exclui requisicao): role admin.
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

// Matriz da RN-06: role 'usuario' + perfil_almoxarifado. NUNCA role 'admin' aqui.
const PERFIL_USERS = [
  { perfil: 'ADMINISTRADOR', user: { id: 60, nome: 'Administrador Almox', role: 'usuario', perfil_almoxarifado: 'ADMINISTRADOR', email: 'adm@test.com' }, esperado: 200 },
  { perfil: 'ALMOXARIFE', user: { id: 61, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' }, esperado: 403 },
  { perfil: 'COMPRAS', user: { id: 62, nome: 'Compras', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'compras@test.com' }, esperado: 403 },
  { perfil: 'PRODUCAO', user: { id: 63, nome: 'Producao', role: 'usuario', perfil_almoxarifado: 'PRODUCAO', email: 'prod@test.com' }, esperado: 403 },
  { perfil: 'ENGENHARIA', user: { id: 64, nome: 'Engenharia', role: 'usuario', perfil_almoxarifado: 'ENGENHARIA', email: 'eng@test.com' }, esperado: 403 },
  { perfil: 'GESTOR', user: { id: 65, nome: 'Gestor', role: 'usuario', perfil_almoxarifado: 'GESTOR', email: 'gestor@test.com' }, esperado: 403 },
  { perfil: 'CONSULTA', user: { id: 66, nome: 'Consulta', role: 'usuario', perfil_almoxarifado: 'CONSULTA', email: 'consulta@test.com' }, esperado: 403 },
  // 8o caso: sem perfil nenhum => getPerfilFromUser cai no fallback PRODUCAO (nao e "sem acesso",
  // e chao de fabrica) — tem de tomar 403 igual.
  { perfil: '(sem perfil -> fallback PRODUCAO)', user: { id: 67, nome: 'Sem Perfil', role: 'usuario', email: 'semperfil@test.com' }, esperado: 403 },
];

const GESTOR = { id: 65, nome: 'Gestor', role: 'usuario', perfil_almoxarifado: 'GESTOR', email: 'gestor@test.com' };

let seq = 0;
async function novoMaterial(db, { qtd = 100, categoria = null, custo = 10, ativo = 1 } = {}) {
  seq += 1;
  const codigo = `AT2-${seq}`;
  const nome = `Material Atos ${seq}`;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
     (codigo, nome, unidade, quantidade_atual, custo_unitario, categoria, ativo)
     VALUES (?,?,'UN',?,?,?,?)`, [codigo, nome, qtd, custo, categoria, ativo]);
  return { id: r.lastID, codigo, nome };
}

async function abrirConferencia(app, body = {}) {
  const res = await request(app).post('/api/almoxarifado/conferencias').send(body);
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function itemDoMaterial(db, confId, materialId) {
  const item = await dbGet(db,
    `SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND material_id = ?`,
    [confId, materialId]);
  assert.ok(item, 'item nao encontrado na conferencia');
  return item;
}

async function auditorias(db, entidade, entidadeId, acao) {
  const sql = `SELECT * FROM auditoria_log_almoxarifado
               WHERE entidade = ? AND entidade_id = ?${acao ? ' AND acao = ?' : ''}
               ORDER BY id`;
  const rows = await dbAll(db, sql, acao ? [entidade, entidadeId, acao] : [entidade, entidadeId]);
  return rows.map((r) => ({
    ...r,
    dados_anteriores: r.dados_anteriores ? JSON.parse(r.dados_anteriores) : null,
    dados_novos: r.dados_novos ? JSON.parse(r.dados_novos) : null,
  }));
}

let seqReq = 0;
async function criarRequisicao(db, { status = 'PENDENTE', itens = [], solicitanteId = ADMIN.id } = {}) {
  seqReq += 1;
  const numero = `REQ-AT2-${seqReq}`;
  const r = await dbRun(db,
    `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, ativo)
     VALUES (?,?,?,?,1)`, [numero, solicitanteId, 'Solicitante Atos', status]);
  const reqId = r.lastID;
  for (const item of itens) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(db,
      `INSERT INTO itens_requisicao_almoxarifado
       (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue)
       VALUES (?,?,?,?,?)`,
      [reqId, item.material_id, item.quantidade ?? 1, item.quantidade_separada ?? 0, item.quantidade_entregue ?? 0]);
  }
  return { id: reqId, numero };
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // ── RN-05: aprovador_* deixam de ser colunas mortas ──────────────────────────────────────
  await test('RN-05: concluir COM aplicar_ajustes grava aprovador_id/aprovador_nome do autor do ato', async () => {
    setUser(GESTOR); // GESTOR tem ajustar_estoque
    const categoria = 'CAT-AT2-APROVADOR-COM';
    const mat = await novoMaterial(db, { qtd: 100, categoria, custo: 10 });
    const conf = await abrirConferencia(app, { categoria, tolerancia_percentual: 100000 });
    const item = await itemDoMaterial(db, conf.id, mat.id);
    await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
      .send({ quantidade_contada: 90 });

    const res = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/concluir`)
      .send({ aplicar_ajustes: true, justificativa_ajuste: 'Homologando a diferenca contada' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const row = await dbGet(db, `SELECT status, aprovador_id, aprovador_nome
                                 FROM conferencias_almoxarifado WHERE id = ?`, [conf.id]);
    assert.strictEqual(row.status, 'CONCLUIDO');
    assert.strictEqual(row.aprovador_id, GESTOR.id, `esperava aprovador_id ${GESTOR.id}, veio ${row.aprovador_id}`);
    assert.strictEqual(row.aprovador_nome, GESTOR.nome, `esperava aprovador_nome, veio ${row.aprovador_nome}`);
  });

  await test('RN-05: concluir SEM ajuste nao preenche aprovador_* (fica nulo)', async () => {
    setUser(ADMIN);
    const categoria = 'CAT-AT2-APROVADOR-SEM';
    const mat = await novoMaterial(db, { qtd: 100, categoria, custo: 10 });
    const conf = await abrirConferencia(app, { categoria, tolerancia_percentual: 100000 });
    const item = await itemDoMaterial(db, conf.id, mat.id);
    await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
      .send({ quantidade_contada: 95 });

    const res = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/concluir`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const row = await dbGet(db, `SELECT status, aprovador_id, aprovador_nome
                                 FROM conferencias_almoxarifado WHERE id = ?`, [conf.id]);
    assert.strictEqual(row.status, 'CONCLUIDO');
    assert.strictEqual(row.aprovador_id, null, 'concluir sem mexer no saldo nao e homologacao');
    assert.strictEqual(row.aprovador_nome, null);
  });

  await test('RN-05: concluir SEM ajuste nao TOCA aprovador_* ja preenchido (nao e "gravar null")', async () => {
    setUser(ADMIN);
    const categoria = 'CAT-AT2-APROVADOR-INTACTO';
    const mat = await novoMaterial(db, { qtd: 100, categoria, custo: 10 });
    const conf = await abrirConferencia(app, { categoria, tolerancia_percentual: 100000 });
    const item = await itemDoMaterial(db, conf.id, mat.id);
    await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
      .send({ quantidade_contada: 95 });
    // Homologacao anterior ja registrada na linha: a conclusao sem ajuste nao pode apaga-la.
    await dbRun(db, `UPDATE conferencias_almoxarifado SET aprovador_id = 777, aprovador_nome = 'Homologador Antigo' WHERE id = ?`,
      [conf.id]);

    const res = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/concluir`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const row = await dbGet(db, 'SELECT aprovador_id, aprovador_nome FROM conferencias_almoxarifado WHERE id = ?', [conf.id]);
    assert.strictEqual(row.aprovador_id, 777, 'sem ajuste, as colunas nao sao tocadas');
    assert.strictEqual(row.aprovador_nome, 'Homologador Antigo');
  });

  // ── RN-06: matriz de 8 perfis no GET /auditoria ──────────────────────────────────────────
  for (const caso of PERFIL_USERS) {
    // eslint-disable-next-line no-await-in-loop
    await test(`RN-06 gate do log: ${caso.perfil} -> ${caso.esperado}`, async () => {
      setUser(caso.user);
      const res = await request(app).get('/api/almoxarifado/auditoria');
      assert.strictEqual(res.status, caso.esperado,
        `perfil ${caso.perfil}: esperava ${caso.esperado}, veio ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`);
      if (caso.esperado === 403) {
        assert.strictEqual(res.body.error, 'Sem permissão para esta operação');
        assert.strictEqual(res.body.acao, 'configurar', 'o 403 tem de nomear a acao `configurar`');
      } else {
        // A resposta declara o corte (achado A3 da revisao adversarial: o LIMIT 200 cru
        // truncava em silencio e engolia os atos MAIS VELHOS de um inventario grande).
        assert.ok(Array.isArray(res.body.itens), 'ADMINISTRADOR le o log (res.body.itens)');
        assert.strictEqual(typeof res.body.total, 'number', 'a resposta declara o total');
        assert.strictEqual(typeof res.body.truncado, 'boolean', 'a resposta declara se truncou');
      }
    });
  }

  // ── RN-07 (a): DELETE /materiais/:id audita DESATIVACAO ──────────────────────────────────
  await test('RN-07 material: DELETE /materiais/:id audita DESATIVACAO com o de/para real', async () => {
    setUser(ADMIN);
    const mat = await novoMaterial(db, { qtd: 5, ativo: 1 });

    const res = await request(app).delete(`/api/almoxarifado/materiais/${mat.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.success, true, 'resposta de sucesso inalterada');

    const depois = await dbGet(db, 'SELECT ativo FROM materiais_almoxarifado WHERE id = ?', [mat.id]);
    assert.strictEqual(depois.ativo, 0);

    const linhas = await auditorias(db, 'material', mat.id, 'DESATIVACAO');
    assert.strictEqual(linhas.length, 1, `esperava 1 DESATIVACAO, veio ${linhas.length}`);
    const [log] = linhas;
    assert.strictEqual(log.usuario_id, ADMIN.id);
    assert.strictEqual(log.usuario_nome, ADMIN.nome);
    assert.strictEqual(log.dados_anteriores.ativo, 1);
    assert.strictEqual(log.dados_novos.ativo, 0);
    assert.strictEqual(log.dados_novos.codigo, mat.codigo);
    assert.strictEqual(log.dados_novos.nome, mat.nome);
  });

  await test('RN-07 material: material JA inativo registra dados_anteriores.ativo = 0 (valor real, nao 1 fixo)', async () => {
    setUser(ADMIN);
    const mat = await novoMaterial(db, { qtd: 5, ativo: 0 });

    const res = await request(app).delete(`/api/almoxarifado/materiais/${mat.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const linhas = await auditorias(db, 'material', mat.id, 'DESATIVACAO');
    assert.strictEqual(linhas.length, 1, `esperava 1 DESATIVACAO, veio ${linhas.length}`);
    assert.strictEqual(linhas[0].dados_anteriores.ativo, 0,
      'o de/para tem de vir do SELECT, nao de um 1 chumbado');
  });

  await test('RN-07 material: id INEXISTENTE responde success e NAO audita (nada de linha fantasma)', async () => {
    setUser(ADMIN);
    const idFantasma = 999777;
    const existe = await dbGet(db, 'SELECT id FROM materiais_almoxarifado WHERE id = ?', [idFantasma]);
    assert.ok(!existe, 'pre-condicao: o id nao pode existir');

    const res = await request(app).delete(`/api/almoxarifado/materiais/${idFantasma}`);
    assert.strictEqual(res.status, 200, 'a resposta continua success (comportamento inalterado)');
    assert.strictEqual(res.body.success, true);

    const linhas = await auditorias(db, 'material', idFantasma);
    assert.strictEqual(linhas.length, 0, 'auditar cegamente criaria uma linha para um material que nao existe');
  });

  // ── RN-07 (b): PUT /requisicoes/:id/cancelar audita CANCELAMENTO ─────────────────────────
  await test('RN-07 requisicao: PUT /requisicoes/:id/cancelar audita CANCELAMENTO com status CANCELADO', async () => {
    setUser(ADMIN);
    const mat = await novoMaterial(db, { qtd: 50 });
    const req1 = await criarRequisicao(db, { status: 'PENDENTE', itens: [{ material_id: mat.id, quantidade: 4 }] });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${req1.id}/cancelar`)
      .send({ motivo: 'Obra suspensa pelo cliente' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.success, true);

    const depois = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [req1.id]);
    assert.strictEqual(depois.status, 'CANCELADO', 'o literal do modulo e CANCELADO (nao CANCELADA)');

    const linhas = await auditorias(db, 'requisicao', req1.id, 'CANCELAMENTO');
    assert.strictEqual(linhas.length, 1, `esperava 1 CANCELAMENTO, veio ${linhas.length}`);
    const [log] = linhas;
    assert.strictEqual(log.usuario_id, ADMIN.id);
    assert.strictEqual(log.usuario_nome, ADMIN.nome);
    assert.strictEqual(log.dados_anteriores.status, 'PENDENTE');
    assert.strictEqual(log.dados_novos.status, 'CANCELADO');
    assert.strictEqual(log.dados_novos.numero, req1.numero);
    assert.strictEqual(log.justificativa, 'Obra suspensa pelo cliente');
  });

  await test('RN-07 requisicao: cancelamento RECUSADO (transicao invalida) nao audita', async () => {
    setUser(ADMIN);
    const req1 = await criarRequisicao(db, { status: 'ENTREGUE' });
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${req1.id}/cancelar`)
      .send({ motivo: 'Tentativa fora da maquina de estados' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual((await auditorias(db, 'requisicao', req1.id, 'CANCELAMENTO')).length, 0,
      'nenhuma auditoria "de tentativa"');
  });

  // ── RN-07 (c): DELETE /requisicoes/:id audita EXCLUSAO ───────────────────────────────────
  await test('RN-07 requisicao: DELETE /requisicoes/:id audita EXCLUSAO com o status ANTERIOR e o total de estornos', async () => {
    setUser(ADMIN);
    const matA = await novoMaterial(db, { qtd: 50 });
    const matB = await novoMaterial(db, { qtd: 50 });
    const req1 = await criarRequisicao(db, {
      status: 'ENTREGUE',
      itens: [
        { material_id: matA.id, quantidade: 3, quantidade_separada: 3, quantidade_entregue: 3 },
        { material_id: matB.id, quantidade: 2, quantidade_separada: 2, quantidade_entregue: 2 },
      ],
    });

    const res = await request(app).delete(`/api/almoxarifado/requisicoes/${req1.id}`)
      .send({ justificativa: 'Requisicao lancada em duplicidade' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.estornos.length, 2, 'pre-condicao: dois estornos (estornos e ARRAY)');

    const linhas = await auditorias(db, 'requisicao', req1.id, 'EXCLUSAO');
    assert.strictEqual(linhas.length, 1, `esperava 1 EXCLUSAO, veio ${linhas.length}`);
    const [log] = linhas;
    assert.strictEqual(log.usuario_id, ADMIN.id);
    assert.strictEqual(log.usuario_nome, ADMIN.nome);
    // O status tem de ser o de ANTES da chamada do servico — depois dela ja virou CANCELADO.
    assert.strictEqual(log.dados_anteriores.status, 'ENTREGUE',
      'o dbGet tem de acontecer ANTES do servico, senao o status ja virou CANCELADO');
    assert.strictEqual(log.dados_novos.numero, req1.numero);
    assert.strictEqual(log.dados_novos.estornos, 2, '`estornos` e array — o log grava o .length');
    assert.strictEqual(log.justificativa, 'Requisicao lancada em duplicidade');
  });

  await test('RN-07 requisicao: DELETE de id inexistente -> 404 e ZERO auditoria', async () => {
    setUser(ADMIN);
    const res = await request(app).delete('/api/almoxarifado/requisicoes/999666').send({});
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    assert.strictEqual((await auditorias(db, 'requisicao', 999666)).length, 0);
  });

  // ── C5: ordem estavel do log (desempate por id) ──────────────────────────────────────────
  await test('C5 ordem: duas auditorias no MESMO segundo saem da mais nova para a mais velha (desempate por id)', async () => {
    setUser(ADMIN);
    const categoria = 'CAT-AT2-ORDEM';
    const mat = await novoMaterial(db, { qtd: 100, categoria });
    const conf = await abrirConferencia(app, { categoria, tolerancia_percentual: 100000 });
    const item = await itemDoMaterial(db, conf.id, mat.id);
    await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
      .send({ quantidade_contada: 90 });

    // Empate FORCADO: `created_at` do SQLite tem resolucao de segundo e na producao os dois atos
    // caem no mesmo segundo com facilidade. Sem `, id DESC` no ORDER BY a ordem e indefinida.
    await dbRun(db, `UPDATE auditoria_log_almoxarifado SET created_at = '2026-08-28 10:00:00'
                     WHERE entidade = 'conferencia' AND entidade_id = ?`, [conf.id]);

    const linhas = await auditorias(db, 'conferencia', conf.id);
    assert.strictEqual(linhas.length, 2, `pre-condicao: 2 auditorias, veio ${linhas.length}`);

    const res = await request(app).get(`/api/almoxarifado/auditoria?entidade=conferencia&entidade_id=${conf.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const acoes = res.body.itens.map((r) => r.acao);
    assert.deepStrictEqual(acoes, ['CONTAGEM', 'CRIACAO'],
      `ordem instavel sem o desempate por id: veio ${JSON.stringify(acoes)}`);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed > 0 ? 1 : 0);
})();
