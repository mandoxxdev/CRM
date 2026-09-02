/**
 * Etapa 23, Task 2 — RN-03/RN-04: excluir o que JA ESTA INATIVO nao e um ato, e nao audita.
 *
 * O defeito que este arquivo guarda: `UPDATE ... SET ativo = 0 WHERE id = ?` reporta
 * `changes = 1` mesmo quando a linha ja estava inativa — em SQLite o contador conta a linha que
 * o WHERE CASOU, nao a linha que MUDOU de valor. Entao clicar Excluir duas vezes gravava duas
 * linhas `EXCLUSAO` do mesmo id, com autor e horario, indistinguiveis na tela de auditoria que a
 * Etapa 22 entregou. O log mentindo por EXCESSO — um ato sem efeito registrado com o mesmo verbo
 * do ato com efeito.
 *
 * O conserto (RN-04): o WHERE passa a carregar o estado (`AND ativo = 1`), e ai `changes === 0`
 * quer dizer alguma coisa. Quem sabe distinguir "nao existe" de "ja inativa" e o SELECT que as
 * rotas JA faziam antes do UPDATE.
 *
 * ORDEM DAS ASSERCOES E DELIBERADA nos cenarios de 2a exclusao: a contagem de linhas de
 * auditoria vem ANTES do `ja_inativo` do corpo. O status sozinho NAO pega o defeito (com o bug
 * presente a 2a exclusao ja respondia 200), e se o `ja_inativo` fosse checado primeiro o
 * controle positivo derrubaria o cenario pelo campo do corpo em vez de pela linha extra de
 * auditoria — vermelho pelo motivo errado, que foi a licao do commit d507ccc na Task 1.
 *
 * COBERTURA: CINCO rotas, nao quatro. A quinta e `DELETE /materiais/:id`, cujo conserto e
 * DIFERENTE: ela responde `success: true` tambem para id inexistente e isso fica INALTERADO
 * (contrato declarado na Etapa 19); o que muda ali e so a condicao da auditoria.
 *
 * CENARIO DECLARADO (nao e bug): setor JA INATIVO cujo nome ainda e usado por localizacao ATIVA
 * continua respondendo 400 do vinculo — ver o cenario no fim da secao de setores.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbAll, dbGet, dbRun } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ID_INEXISTENTE = 987654;
let seq = 0;
const uniq = (p) => `${p}${Date.now() % 100000}${++seq}`;

(async () => {
  // denyUnlessAlmoxAdmin (as quatro rotas de cadastro) NAO aceita role 'admin' puro — precisa de
  // is_superadmin. A quinta rota (materiais) passa por outro gate, requirePermission
  // ('editar_material'), que aceita ADMINISTRADOR; is_superadmin tambem resolve, via
  // getPerfilFromUser. O mesmo usuario serve para os dois gates — a guarda abaixo prova.
  const { app, db, close } = await createTestApp({
    user: { id: 23, nome: 'Admin Etapa23', role: 'admin', is_superadmin: 1 },
  });

  const linhasDe = (entidade, acao, entidadeId) => dbAll(db,
    `SELECT id, entidade_id, acao, usuario_nome, created_at FROM auditoria_log_almoxarifado
      WHERE entidade = ? AND acao = ? AND entidade_id = ? ORDER BY id`,
    [entidade, acao, entidadeId]);

  const ativoDe = async (tabela, id) => {
    const row = await dbGet(db, `SELECT ativo FROM ${tabela} WHERE id = ?`, [id]);
    return row ? row.ativo : null;
  };

  const criarTipo = async (nome) => {
    const res = await request(app).post('/api/almoxarifado/tipos-material').send({ nome });
    assert.strictEqual(res.status, 201, `POST tipo-material falhou: ${JSON.stringify(res.body)}`);
    return res.body;
  };
  const criarLocalizacao = async (codigo, extra = {}) => {
    const res = await request(app).post('/api/almoxarifado/localizacoes').send({ codigo, ...extra });
    assert.strictEqual(res.status, 201, `POST localizacao falhou: ${JSON.stringify(res.body)}`);
    return res.body;
  };
  const criarSetor = async (nome, prefixo) => {
    const res = await request(app).post('/api/almoxarifado/setores')
      .send({ nome, codigo_prefixo: prefixo, tipo: 'area', ordem: 1 });
    assert.strictEqual(res.status, 201, `POST setor falhou: ${JSON.stringify(res.body)}`);
    return res.body;
  };
  const criarFamilia = async (nome) => {
    const res = await request(app).post('/api/almoxarifado/familias').send({ nome });
    assert.strictEqual(res.status, 201, `POST familia falhou: ${JSON.stringify(res.body)}`);
    return res.body;
  };
  const criarMaterial = async (codigo, familiaId) => {
    const res = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo, nome: `Material ${codigo}`, familia_id: familiaId, unidade: 'UN' });
    assert.strictEqual(res.status, 201, `POST material falhou: ${JSON.stringify(res.body)}`);
    return res.body;
  };

  // ── Guardas anti-teste-vazio ────────────────────────────────────────────────────────────
  // Sem elas, um 403 em todas as rotas deixaria os cenarios abaixo "verdes" provando nada:
  // criar falharia no assert do helper, mas um DELETE recusado por 403 nunca gravaria linha de
  // auditoria nenhuma e a assercao "continua 1" viraria "continua 0 = 0".
  await test('[guarda] o usuario passa por denyUnlessAlmoxAdmin (as 4 rotas de cadastro)', async () => {
    const res = await request(app).post('/api/almoxarifado/tipos-material').send({ nome: uniq('E23 Guarda ') });
    assert.strictEqual(res.status, 201, `POST recusado (${res.status}): ${JSON.stringify(res.body)} `
      + '— se for 403 o usuario nao passa por denyUnlessAlmoxAdmin e TODOS os cenarios de '
      + 'tipo_material/localizacao/setor/familia estariam provando nada');
  });

  await test('[guarda] o usuario passa por requirePermission(editar_material) (5a rota)', async () => {
    const familia = await criarFamilia(uniq('E23 Fam Guarda '));
    const mat = await criarMaterial(uniq('E23-GUARDA-'), familia.id);
    const res = await request(app).delete(`/api/almoxarifado/materiais/${mat.id}`);
    assert.strictEqual(res.status, 200, `DELETE material recusado (${res.status}): ${JSON.stringify(res.body)} `
      + '— se for 403 o gate da 5a rota e outro e os cenarios de material provariam nada');
    assert.strictEqual(await ativoDe('materiais_almoxarifado', mat.id), 0,
      'a rota respondeu 200 mas o material continua ativo — o DELETE nao escreveu nada');
  });

  // ── TIPO DE MATERIAL ────────────────────────────────────────────────────────────────────
  await test('tipo_material: 1a exclusao é um ato — 200 e UMA linha EXCLUSAO', async () => {
    const criado = await criarTipo(uniq('E23 Tipo '));
    const res = await request(app).delete(`/api/almoxarifado/tipos-material/${criado.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(await ativoDe('tipos_material_almoxarifado', criado.id), 0,
      'a 1a exclusao respondeu 200 sem inativar a linha');
    const linhas = await linhasDe('tipo_material', 'EXCLUSAO', criado.id);
    assert.strictEqual(linhas.length, 1, `a 1a exclusao devia deixar 1 rastro, deixou ${linhas.length}`);
  });

  await test('RN-03 tipo_material: 2a exclusao NAO audita e responde ja_inativo', async () => {
    const criado = await criarTipo(uniq('E23 Tipo Duplo '));
    assert.strictEqual((await request(app).delete(`/api/almoxarifado/tipos-material/${criado.id}`)).status, 200);
    // Estado semeado com valor CONHECIDO antes da assercao de peso: se a 1a exclusao nao tiver
    // deixado exatamente 1 linha, o cenario cai AQUI dizendo isso, e nao na assercao final.
    const antes = await linhasDe('tipo_material', 'EXCLUSAO', criado.id);
    assert.strictEqual(antes.length, 1, `setup: a 1a exclusao devia deixar 1 linha, deixou ${antes.length}`);
    assert.strictEqual(await ativoDe('tipos_material_almoxarifado', criado.id), 0, 'setup: a linha devia estar inativa');

    const res = await request(app).delete(`/api/almoxarifado/tipos-material/${criado.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    // ASSERCAO DE PESO, e ela vem antes do `ja_inativo` de proposito (ver cabecalho).
    const depois = await linhasDe('tipo_material', 'EXCLUSAO', criado.id);
    assert.strictEqual(depois.length, 1,
      `a 2a exclusao de tipo_material ${criado.id} gravou linha de auditoria de um ato sem efeito: `
      + `antes ${antes.length}, depois ${depois.length} — ${JSON.stringify(depois)}`);
    assert.strictEqual(res.body.ja_inativo, true, `esperado ja_inativo no corpo, veio ${JSON.stringify(res.body)}`);
  });

  await test('RN-04 tipo_material: id INEXISTENTE continua 404, com a mensagem literal', async () => {
    const antes = await linhasDe('tipo_material', 'EXCLUSAO', ID_INEXISTENTE);
    assert.strictEqual(antes.length, 0, 'setup: o id inexistente ja tinha rastro');
    const res = await request(app).delete(`/api/almoxarifado/tipos-material/${ID_INEXISTENTE}`);
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Tipo de material não encontrado');
    assert.strictEqual((await linhasDe('tipo_material', 'EXCLUSAO', ID_INEXISTENTE)).length, 0,
      'auditou a exclusao de um id que nao existe');
  });

  // ── LOCALIZACAO ─────────────────────────────────────────────────────────────────────────
  await test('localizacao: 1a exclusao é um ato — 200 e UMA linha EXCLUSAO', async () => {
    const criada = await criarLocalizacao(uniq('E23L'));
    const res = await request(app).delete(`/api/almoxarifado/localizacoes/${criada.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(await ativoDe('localizacoes_almoxarifado', criada.id), 0,
      'a 1a exclusao respondeu 200 sem inativar a linha');
    assert.strictEqual((await linhasDe('localizacao', 'EXCLUSAO', criada.id)).length, 1);
  });

  await test('RN-03 localizacao: 2a exclusao NAO audita e responde ja_inativo', async () => {
    const criada = await criarLocalizacao(uniq('E23LD'));
    assert.strictEqual((await request(app).delete(`/api/almoxarifado/localizacoes/${criada.id}`)).status, 200);
    const antes = await linhasDe('localizacao', 'EXCLUSAO', criada.id);
    assert.strictEqual(antes.length, 1, `setup: a 1a exclusao devia deixar 1 linha, deixou ${antes.length}`);
    assert.strictEqual(await ativoDe('localizacoes_almoxarifado', criada.id), 0, 'setup: a linha devia estar inativa');

    const res = await request(app).delete(`/api/almoxarifado/localizacoes/${criada.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const depois = await linhasDe('localizacao', 'EXCLUSAO', criada.id);
    assert.strictEqual(depois.length, 1,
      `a 2a exclusao de localizacao ${criada.id} gravou linha de auditoria de um ato sem efeito: `
      + `antes ${antes.length}, depois ${depois.length} — ${JSON.stringify(depois)}`);
    assert.strictEqual(res.body.ja_inativo, true, `esperado ja_inativo no corpo, veio ${JSON.stringify(res.body)}`);
  });

  await test('RN-04 localizacao: id INEXISTENTE continua 404, com a mensagem literal', async () => {
    const res = await request(app).delete(`/api/almoxarifado/localizacoes/${ID_INEXISTENTE}`);
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Localização não encontrada');
    assert.strictEqual((await linhasDe('localizacao', 'EXCLUSAO', ID_INEXISTENTE)).length, 0,
      'auditou a exclusao de um id que nao existe');
  });

  // ── SETOR ───────────────────────────────────────────────────────────────────────────────
  await test('setor: 1a exclusao é um ato — 200 e UMA linha EXCLUSAO', async () => {
    const criado = await criarSetor(uniq('E23 Setor '), uniq('S'));
    const res = await request(app).delete(`/api/almoxarifado/setores/${criado.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(await ativoDe('setores_almoxarifado', criado.id), 0,
      'a 1a exclusao respondeu 200 sem inativar a linha');
    assert.strictEqual((await linhasDe('setor', 'EXCLUSAO', criado.id)).length, 1);
  });

  await test('RN-03 setor: 2a exclusao NAO audita e responde ja_inativo', async () => {
    const criado = await criarSetor(uniq('E23 Setor Duplo '), uniq('SD'));
    assert.strictEqual((await request(app).delete(`/api/almoxarifado/setores/${criado.id}`)).status, 200);
    const antes = await linhasDe('setor', 'EXCLUSAO', criado.id);
    assert.strictEqual(antes.length, 1, `setup: a 1a exclusao devia deixar 1 linha, deixou ${antes.length}`);
    assert.strictEqual(await ativoDe('setores_almoxarifado', criado.id), 0, 'setup: a linha devia estar inativa');

    const res = await request(app).delete(`/api/almoxarifado/setores/${criado.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const depois = await linhasDe('setor', 'EXCLUSAO', criado.id);
    assert.strictEqual(depois.length, 1,
      `a 2a exclusao de setor ${criado.id} gravou linha de auditoria de um ato sem efeito: `
      + `antes ${antes.length}, depois ${depois.length} — ${JSON.stringify(depois)}`);
    assert.strictEqual(res.body.ja_inativo, true, `esperado ja_inativo no corpo, veio ${JSON.stringify(res.body)}`);
  });

  await test('setor: id INEXISTENTE continua 404 — e o 404 vem do SELECT, nao do changes', async () => {
    const res = await request(app).delete(`/api/almoxarifado/setores/${ID_INEXISTENTE}`);
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Setor não encontrado');
    assert.strictEqual((await linhasDe('setor', 'EXCLUSAO', ID_INEXISTENTE)).length, 0,
      'auditou a exclusao de um id que nao existe');
    // Esta rota (unica das quatro) ja fazia `if (!setor) return 404` ANTES do UPDATE. Por isso o
    // ramo "404 por SELECT vazio" do contrato C2 e codigo MORTO aqui e nao foi implementado:
    // com o SELECT tendo achado a linha, `changes === 0` so pode significar "ja inativa".
  });

  await test('[cenario declarado] setor JA INATIVO com localizacao ativa usando o nome: segue 400, nao ja_inativo', async () => {
    // Decisao registrada no plano da Etapa 23: o 400 do vinculo continua valendo mesmo com o
    // setor ja inativo. A mensagem fala do vinculo, que e VERDADE, e responder `ja_inativo`
    // esconderia de quem esta limpando o cadastro que ha localizacao ativa presa a esse nome.
    const nome = uniq('E23 Setor Vinculado ');
    const criado = await criarSetor(nome, uniq('SV'));
    assert.strictEqual((await request(app).delete(`/api/almoxarifado/setores/${criado.id}`)).status, 200);
    assert.strictEqual(await ativoDe('setores_almoxarifado', criado.id), 0, 'setup: o setor devia estar inativo');
    await criarLocalizacao(uniq('E23LV'), { setor: nome });
    const antes = await linhasDe('setor', 'EXCLUSAO', criado.id);
    assert.strictEqual(antes.length, 1, `setup: esperado 1 rastro da 1a exclusao, veio ${antes.length}`);

    const res = await request(app).delete(`/api/almoxarifado/setores/${criado.id}`);
    assert.strictEqual(res.status, 400, `esperado o 400 do vinculo, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(/localiza/i.test(res.body.error || ''),
      `o 400 devia falar do vinculo com localizacao, veio: ${JSON.stringify(res.body)}`);
    assert.strictEqual((await linhasDe('setor', 'EXCLUSAO', criado.id)).length, 1,
      'o 400 do vinculo nao pode gravar rastro nenhum');
  });

  // ── FAMILIA ─────────────────────────────────────────────────────────────────────────────
  await test('familia: 1a exclusao é um ato — 200 e UMA linha EXCLUSAO', async () => {
    const criada = await criarFamilia(uniq('E23 Familia '));
    const res = await request(app).delete(`/api/almoxarifado/familias/${criada.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(await ativoDe('familias_material_almoxarifado', criada.id), 0,
      'a 1a exclusao respondeu 200 sem inativar a linha');
    assert.strictEqual((await linhasDe('familia', 'EXCLUSAO', criada.id)).length, 1);
  });

  await test('RN-03 familia: 2a exclusao NAO audita e responde ja_inativo', async () => {
    const criada = await criarFamilia(uniq('E23 Familia Dupla '));
    assert.strictEqual((await request(app).delete(`/api/almoxarifado/familias/${criada.id}`)).status, 200);
    const antes = await linhasDe('familia', 'EXCLUSAO', criada.id);
    assert.strictEqual(antes.length, 1, `setup: a 1a exclusao devia deixar 1 linha, deixou ${antes.length}`);
    assert.strictEqual(await ativoDe('familias_material_almoxarifado', criada.id), 0, 'setup: a linha devia estar inativa');

    const res = await request(app).delete(`/api/almoxarifado/familias/${criada.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const depois = await linhasDe('familia', 'EXCLUSAO', criada.id);
    assert.strictEqual(depois.length, 1,
      `a 2a exclusao de familia ${criada.id} gravou linha de auditoria de um ato sem efeito: `
      + `antes ${antes.length}, depois ${depois.length} — ${JSON.stringify(depois)}`);
    assert.strictEqual(res.body.ja_inativo, true, `esperado ja_inativo no corpo, veio ${JSON.stringify(res.body)}`);
  });

  await test('RN-04 familia: id INEXISTENTE continua 404, com a mensagem literal', async () => {
    const res = await request(app).delete(`/api/almoxarifado/familias/${ID_INEXISTENTE}`);
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Família não encontrada');
    assert.strictEqual((await linhasDe('familia', 'EXCLUSAO', ID_INEXISTENTE)).length, 0,
      'auditou a exclusao de um id que nao existe');
  });

  // ── MATERIAL (a 5a rota, com conserto DIFERENTE) ────────────────────────────────────────
  let familiaMat;
  await test('setup: familia para os materiais', async () => {
    familiaMat = await criarFamilia(uniq('E23 Fam Mat '));
  });

  await test('material: 1a desativacao é um ato — 200 e UMA linha DESATIVACAO', async () => {
    const mat = await criarMaterial(uniq('E23-MAT-'), familiaMat.id);
    const res = await request(app).delete(`/api/almoxarifado/materiais/${mat.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(await ativoDe('materiais_almoxarifado', mat.id), 0,
      'a 1a desativacao respondeu 200 sem inativar o material');
    assert.strictEqual((await linhasDe('material', 'DESATIVACAO', mat.id)).length, 1);
  });

  await test('RN-03 material: 2a desativacao NAO audita (o corpo segue success:true, sem ja_inativo)', async () => {
    const mat = await criarMaterial(uniq('E23-MATD-'), familiaMat.id);
    assert.strictEqual((await request(app).delete(`/api/almoxarifado/materiais/${mat.id}`)).status, 200);
    const antes = await linhasDe('material', 'DESATIVACAO', mat.id);
    assert.strictEqual(antes.length, 1, `setup: a 1a desativacao devia deixar 1 linha, deixou ${antes.length}`);
    assert.strictEqual(await ativoDe('materiais_almoxarifado', mat.id), 0, 'setup: o material devia estar inativo');

    const res = await request(app).delete(`/api/almoxarifado/materiais/${mat.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const depois = await linhasDe('material', 'DESATIVACAO', mat.id);
    assert.strictEqual(depois.length, 1,
      `a 2a desativacao do material ${mat.id} gravou linha de auditoria de um ato sem efeito: `
      + `antes ${antes.length}, depois ${depois.length} — ${JSON.stringify(depois)}`);
    // O CONTRATO DESTA ROTA NAO MUDA: ela nunca teve `ja_inativo` e continua sem. So a auditoria
    // muda. Um `ja_inativo` aqui seria mudanca de contrato fora do tema da etapa.
    assert.strictEqual(res.body.success, true, `o corpo desta rota nao muda: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.ja_inativo, undefined,
      `esta rota NAO ganha ja_inativo (contrato inalterado): ${JSON.stringify(res.body)}`);
  });

  await test('[contrato inalterado] material: id INEXISTENTE segue 200 success:true e NAO audita', async () => {
    // Declarado assim na Etapa 19 e mantido de proposito: virar 404 aqui seria mudanca de
    // contrato fora do tema da Etapa 23 (as outras quatro rotas ja eram 404 antes desta task).
    const res = await request(app).delete(`/api/almoxarifado/materiais/${ID_INEXISTENTE}`);
    assert.strictEqual(res.status, 200, `o contrato desta rota nao muda: ${res.status} ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.success, true, JSON.stringify(res.body));
    assert.strictEqual((await linhasDe('material', 'DESATIVACAO', ID_INEXISTENTE)).length, 0,
      'auditou a desativacao de um material que nao existe');
  });

  // ── Guarda final: o conserto nao quebrou a exclusao de quem TEM saldo/vinculo ───────────
  await test('[regressao] localizacao COM saldo continua 400 e sem rastro', async () => {
    const criada = await criarLocalizacao(uniq('E23LS'));
    const mat = await criarMaterial(uniq('E23-MATS-'), familiaMat.id);
    await dbRun(db,
      `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,?)`,
      [mat.id, criada.id, 5]);
    const res = await request(app).delete(`/api/almoxarifado/localizacoes/${criada.id}`);
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(await ativoDe('localizacoes_almoxarifado', criada.id), 1,
      'a rota recusou com 400 mas inativou a localizacao assim mesmo');
    assert.strictEqual((await linhasDe('localizacao', 'EXCLUSAO', criada.id)).length, 0,
      'auditou uma exclusao que a rota recusou');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
