/**
 * Etapa 19, Task 2 — auditoria dos 12 endpoints de CADASTRO de `routes/almoxarifado.js`
 * (tipos de material, localizações, setores e famílias).
 *
 * O que este arquivo prova (e por que cada asserção existe):
 *
 * - RN-01: criar / editar / excluir cada cadastro deixa linha com de/para. `dados_anteriores`
 *   é null na criação e a linha inteira na edição/exclusão.
 * - RN-03: quatro rotas (PUT e DELETE de tipo-material, DELETE de localização e de família)
 *   respondiam 200 para id INEXISTENTE. Auditar sem corrigir isso registraria um ato que não
 *   aconteceu. Aqui: 404 com a mensagem acentuada do módulo e ZERO linhas de auditoria.
 * - REATIVACAO: `POST /localizacoes` tem dois caminhos — cria, ou reativa a linha inativa que
 *   ainda ocupa o código. Auditar os dois como CRIACAO mentiria: a reativação TEM
 *   `dados_anteriores` (a linha inativa) e a criação não.
 * - RN-08: renomear um setor renomeia N localizações em cascata. O log diz QUANTAS. E há dois
 *   caminhos: quando o nome não muda o cascata nem roda — a EDICAO tem de ser auditada assim
 *   mesmo, com `localizacoes_renomeadas: 0` (senão uma edição de prefixo/ordem sumiria do log).
 * - RN-02: auditoria quebrada não derruba o ato. Stub com TRÊS asserções juntas (flag
 *   `chamado`, o ato responde e gravou, zero linhas) — sem a primeira, uma rota que
 *   simplesmente NÃO auditasse passaria verde e o teste seria vazio.
 *
 * LIMITAÇÃO DECLARADA NA ETAPA 19 — CORRIGIDA NA ETAPA 23 (Task 2). O texto original desta
 * seção dizia: "em SQLite um UPDATE numa linha existente conta `changes = 1` mesmo sem mudar
 * valor nenhum. Então DELETE numa linha JÁ INATIVA continua 200 e audita um EXCLUSAO que não
 * excluiu nada. Só id INEXISTENTE cai no 404." A primeira frase continua verdadeira sobre o
 * SQLite; as outras duas **deixaram de ser verdade** e ficariam mentindo para quem lesse este
 * arquivo. A Etapa 23 pôs `AND ativo = 1` no WHERE das quatro rotas (RN-04) — com o estado
 * dentro do WHERE, `changes === 0` na linha já inativa — e o SELECT que a rota já fazia separa
 * "não existe" (404, como sempre) de "já inativa" (200 `ja_inativo`, SEM auditar, RN-03).
 * O cenário do fim do arquivo foi atualizado de 2 linhas para 1 e continua aqui: a limitação
 * declarada virou pendência resolvida, e o histórico explica por que o cenário existe.
 * A cobertura completa das CINCO rotas está em `exclusaoIdempotente.api.test.js`.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbAll, dbGet, dbRun } = require('../../services/almoxarifado/db');
const auditModule = require('../../services/almoxarifado/audit');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ID_INEXISTENTE = 987654;
let seq = 0;
const uniq = (p) => `${p}${Date.now() % 100000}${++seq}`;

(async () => {
  // canConfigureAlmox NAO aceita role 'admin' sozinho: o usuario default do harness
  // ({id:1, role:'admin'}) toma 403 em TODAS as rotas deste arquivo e os cenarios passariam
  // "verdes" sem nunca ter escrito nada. Precedente: tests/api/materialCompleto.api.test.js:26.
  const { app, db, close } = await createTestApp({
    user: { id: 9, nome: 'Admin Cadastros', role: 'admin', is_superadmin: 1 },
  });

  const linhasDe = (entidade, acao, entidadeId) => {
    let sql = 'SELECT * FROM auditoria_log_almoxarifado WHERE entidade = ? AND acao = ?';
    const params = [entidade, acao];
    if (entidadeId !== undefined) { sql += ' AND entidade_id = ?'; params.push(entidadeId); }
    return dbAll(db, `${sql} ORDER BY id`, params);
  };
  const totalLinhas = async () => (await dbGet(db, 'SELECT COUNT(*) as c FROM auditoria_log_almoxarifado')).c;

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

  // ── Guarda anti-teste-vazio ─────────────────────────────────────────────────────────────
  await test('[guarda] o usuario do teste passa por canConfigureAlmox (senao tudo seria 403)', async () => {
    const res = await request(app).post('/api/almoxarifado/tipos-material').send({ nome: uniq('E19 Guarda ') });
    assert.strictEqual(res.status, 201, `POST recusado (${res.status}): ${JSON.stringify(res.body)} `
      + '— se for 403, o usuario do harness nao passa por canConfigureAlmox e TODOS os cenarios '
      + 'abaixo estariam provando nada');
  });

  // ── TIPOS DE MATERIAL ───────────────────────────────────────────────────────────────────
  await test('RN-01 tipo_material: POST audita CRIACAO com dados_anteriores null', async () => {
    const nome = uniq('E19 Tipo ');
    const criado = await criarTipo(nome);
    const linhas = await linhasDe('tipo_material', 'CRIACAO', criado.id);
    assert.strictEqual(linhas.length, 1, 'a criacao do tipo de material nao deixou rastro');
    assert.strictEqual(linhas[0].dados_anteriores, null, 'criacao nao tem "de"');
    assert.strictEqual(linhas[0].usuario_id, 9);
    const dn = JSON.parse(linhas[0].dados_novos);
    assert.strictEqual(dn.nome, nome);
  });

  await test('RN-01 tipo_material: PUT audita EDICAO com o de/para do nome', async () => {
    const antigo = uniq('E19 Tipo Antigo ');
    const novo = uniq('E19 Tipo Novo ');
    const criado = await criarTipo(antigo);
    const res = await request(app).put(`/api/almoxarifado/tipos-material/${criado.id}`).send({ nome: novo });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const linhas = await linhasDe('tipo_material', 'EDICAO', criado.id);
    assert.strictEqual(linhas.length, 1, 'a edicao do tipo de material nao deixou rastro');
    assert.strictEqual(JSON.parse(linhas[0].dados_anteriores).nome, antigo, 'o "de" nao e o nome anterior');
    assert.strictEqual(JSON.parse(linhas[0].dados_novos).nome, novo);
  });

  await test('RN-01 tipo_material: DELETE audita EXCLUSAO com o ativo indo de 1 para 0', async () => {
    const criado = await criarTipo(uniq('E19 Tipo Del '));
    const res = await request(app).delete(`/api/almoxarifado/tipos-material/${criado.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const linhas = await linhasDe('tipo_material', 'EXCLUSAO', criado.id);
    assert.strictEqual(linhas.length, 1, 'a exclusao do tipo de material nao deixou rastro');
    assert.strictEqual(Number(JSON.parse(linhas[0].dados_anteriores).ativo), 1);
    assert.strictEqual(Number(JSON.parse(linhas[0].dados_novos).ativo), 0);
    const col = await dbGet(db, 'SELECT ativo FROM tipos_material_almoxarifado WHERE id = ?', [criado.id]);
    assert.strictEqual(Number(col.ativo), 0, 'a rota nem inativou — o cenario nao exercitou nada');
  });

  // ── RN-03: as 4 rotas que respondiam 200 para id inexistente ────────────────────────────
  await test('RN-03: PUT /tipos-material/:id inexistente responde 404 e NAO audita', async () => {
    const antes = await totalLinhas();
    const res = await request(app).put(`/api/almoxarifado/tipos-material/${ID_INEXISTENTE}`)
      .send({ nome: 'Fantasma' });
    assert.strictEqual(res.status, 404, `respondeu ${res.status} para id inexistente: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, 'Tipo de material não encontrado');
    assert.strictEqual(await totalLinhas(), antes, 'auditou um ato que nao aconteceu');
  });

  await test('RN-03: DELETE /tipos-material/:id inexistente responde 404 e NAO audita', async () => {
    const antes = await totalLinhas();
    const res = await request(app).delete(`/api/almoxarifado/tipos-material/${ID_INEXISTENTE}`);
    assert.strictEqual(res.status, 404, `respondeu ${res.status} para id inexistente: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, 'Tipo de material não encontrado');
    assert.strictEqual(await totalLinhas(), antes, 'auditou um ato que nao aconteceu');
  });

  await test('RN-03: DELETE /localizacoes/:id inexistente responde 404 e NAO audita', async () => {
    const antes = await totalLinhas();
    const res = await request(app).delete(`/api/almoxarifado/localizacoes/${ID_INEXISTENTE}`);
    assert.strictEqual(res.status, 404, `respondeu ${res.status} para id inexistente: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, 'Localização não encontrada');
    assert.strictEqual(await totalLinhas(), antes, 'auditou um ato que nao aconteceu');
  });

  await test('RN-03: DELETE /familias/:id inexistente responde 404 e NAO audita', async () => {
    const antes = await totalLinhas();
    const res = await request(app).delete(`/api/almoxarifado/familias/${ID_INEXISTENTE}`);
    assert.strictEqual(res.status, 404, `respondeu ${res.status} para id inexistente: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, 'Família não encontrada');
    assert.strictEqual(await totalLinhas(), antes, 'auditou um ato que nao aconteceu');
  });

  // ── LOCALIZAÇÕES ────────────────────────────────────────────────────────────────────────
  await test('RN-01 localizacao: POST audita CRIACAO com dados_anteriores null', async () => {
    const codigo = uniq('E19LOC');
    const criada = await criarLocalizacao(codigo, { descricao: 'Prateleira A' });
    const linhas = await linhasDe('localizacao', 'CRIACAO', criada.id);
    assert.strictEqual(linhas.length, 1, 'a criacao da localizacao nao deixou rastro');
    assert.strictEqual(linhas[0].dados_anteriores, null);
    assert.strictEqual(JSON.parse(linhas[0].dados_novos).codigo, codigo);
  });

  await test('REATIVACAO: recriar codigo excluido audita REATIVACAO (com "de"), nao CRIACAO', async () => {
    const codigo = uniq('E19REAT');
    const criada = await criarLocalizacao(codigo, { descricao: 'Antes' });
    const del = await request(app).delete(`/api/almoxarifado/localizacoes/${criada.id}`);
    assert.strictEqual(del.status, 200, JSON.stringify(del.body));

    const revivida = await criarLocalizacao(codigo, { descricao: 'Depois' });
    assert.strictEqual(revivida.id, criada.id, 'a rota nao reaproveitou a linha — o cenario nao e o de reativacao');

    const criacoes = await linhasDe('localizacao', 'CRIACAO', criada.id);
    assert.strictEqual(criacoes.length, 1,
      `a 2a vez foi auditada como CRIACAO (${criacoes.length} linhas): a reativacao TEM "de" e a criacao nao`);
    const reativacoes = await linhasDe('localizacao', 'REATIVACAO', criada.id);
    assert.strictEqual(reativacoes.length, 1, 'a reativacao nao deixou rastro proprio');
    const da = JSON.parse(reativacoes[0].dados_anteriores);
    assert.strictEqual(Number(da.ativo), 0, 'o "de" da reativacao tem de ser a linha INATIVA');
    assert.strictEqual(da.descricao, 'Antes');
    assert.strictEqual(JSON.parse(reativacoes[0].dados_novos).descricao, 'Depois');
  });

  await test('RN-01 localizacao: PUT audita EDICAO com o de/para da descricao', async () => {
    const criada = await criarLocalizacao(uniq('E19PUT'), { descricao: 'Original' });
    const res = await request(app).put(`/api/almoxarifado/localizacoes/${criada.id}`)
      .send({ codigo: criada.codigo, descricao: 'Editada' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const linhas = await linhasDe('localizacao', 'EDICAO', criada.id);
    assert.strictEqual(linhas.length, 1, 'a edicao da localizacao nao deixou rastro');
    assert.strictEqual(JSON.parse(linhas[0].dados_anteriores).descricao, 'Original');
    assert.strictEqual(JSON.parse(linhas[0].dados_novos).descricao, 'Editada');
  });

  await test('RN-01 localizacao: DELETE audita EXCLUSAO com o codigo no "de"', async () => {
    const codigo = uniq('E19DEL');
    const criada = await criarLocalizacao(codigo);
    const res = await request(app).delete(`/api/almoxarifado/localizacoes/${criada.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const linhas = await linhasDe('localizacao', 'EXCLUSAO', criada.id);
    assert.strictEqual(linhas.length, 1, 'a exclusao da localizacao nao deixou rastro');
    assert.strictEqual(JSON.parse(linhas[0].dados_anteriores).codigo, codigo);
    assert.strictEqual(Number(JSON.parse(linhas[0].dados_novos).ativo), 0);
  });

  await test('localizacao com saldo continua 400 e NAO audita exclusao', async () => {
    const criada = await criarLocalizacao(uniq('E19SALDO'));
    const mat = await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
       VALUES (?,?,'UN',0,1)`, [uniq('E19M'), 'Material saldo']);
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade)
                     VALUES (?,?,5)`, [mat.lastID, criada.id]);
    const res = await request(app).delete(`/api/almoxarifado/localizacoes/${criada.id}`);
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual((await linhasDe('localizacao', 'EXCLUSAO', criada.id)).length, 0,
      'auditou uma exclusao que a rota recusou');
  });

  // ── SETORES ─────────────────────────────────────────────────────────────────────────────
  await test('RN-01 setor: POST audita CRIACAO sem o derivado qtd_localizacoes', async () => {
    const nome = uniq('E19 Setor ');
    const criado = await criarSetor(nome, 'E19A');
    const linhas = await linhasDe('setor', 'CRIACAO', criado.id);
    assert.strictEqual(linhas.length, 1, 'a criacao do setor nao deixou rastro');
    assert.strictEqual(linhas[0].dados_anteriores, null);
    const dn = JSON.parse(linhas[0].dados_novos);
    assert.strictEqual(dn.nome, nome);
    assert.ok(!('qtd_localizacoes' in dn),
      'qtd_localizacoes e CONTAGEM derivada, nao campo do cadastro — nao deve entrar no log');
  });

  await test('RN-08: renomear setor com 2 localizacoes registra localizacoes_renomeadas: 2', async () => {
    const nome = uniq('E19 Cascata ');
    const criado = await criarSetor(nome, 'E19C');
    await criarLocalizacao(uniq('E19CS1'), { setor: nome });
    await criarLocalizacao(uniq('E19CS2'), { setor: nome });

    const novoNome = `${nome} Renomeado`;
    const res = await request(app).put(`/api/almoxarifado/setores/${criado.id}`)
      .send({ nome: novoNome, codigo_prefixo: 'E19C', tipo: 'area', ordem: 1 });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const linhas = await linhasDe('setor', 'EDICAO', criado.id);
    assert.strictEqual(linhas.length, 1, 'a edicao do setor nao deixou rastro');
    const dn = JSON.parse(linhas[0].dados_novos);
    assert.strictEqual(dn.localizacoes_renomeadas, 2,
      `o cascata renomeou 2 localizacoes e o log diz ${JSON.stringify(dn.localizacoes_renomeadas)} `
      + '(undefined = o callback do cascata ainda e arrow e nao tem this.changes)');
    assert.strictEqual(JSON.parse(linhas[0].dados_anteriores).nome, nome);
    assert.strictEqual(dn.nome, novoNome);

    // o cascata realmente aconteceu (senao o "2" estaria contando o nada)
    const c = await dbGet(db, 'SELECT COUNT(*) as c FROM localizacoes_almoxarifado WHERE setor = ? AND ativo = 1',
      [novoNome]);
    assert.strictEqual(c.c, 2, 'as localizacoes nao foram renomeadas de fato');
  });

  await test('RN-08 (2o caminho): editar setor SEM trocar o nome audita com localizacoes_renomeadas: 0', async () => {
    const nome = uniq('E19 SemRename ');
    const criado = await criarSetor(nome, 'E19S');
    await criarLocalizacao(uniq('E19SR1'), { setor: nome });

    const res = await request(app).put(`/api/almoxarifado/setores/${criado.id}`)
      .send({ nome, codigo_prefixo: 'E19SX', tipo: 'corredor', ordem: 7 });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const linhas = await linhasDe('setor', 'EDICAO', criado.id);
    assert.strictEqual(linhas.length, 1,
      'edicao que nao troca o nome nao audita — o cascata nem roda nesse caminho, mas a EDICAO existe');
    const dn = JSON.parse(linhas[0].dados_novos);
    assert.strictEqual(dn.localizacoes_renomeadas, 0);
    assert.strictEqual(dn.ordem, 7);
    assert.strictEqual(JSON.parse(linhas[0].dados_anteriores).ordem, 1);
  });

  await test('RN-01 setor: DELETE audita EXCLUSAO com o nome no "de"', async () => {
    const nome = uniq('E19 SetorDel ');
    const criado = await criarSetor(nome, 'E19D');
    const res = await request(app).delete(`/api/almoxarifado/setores/${criado.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const linhas = await linhasDe('setor', 'EXCLUSAO', criado.id);
    assert.strictEqual(linhas.length, 1, 'a exclusao do setor nao deixou rastro');
    assert.strictEqual(JSON.parse(linhas[0].dados_anteriores).nome, nome);
    assert.strictEqual(Number(JSON.parse(linhas[0].dados_novos).ativo), 0);
  });

  // ── FAMÍLIAS ────────────────────────────────────────────────────────────────────────────
  await test('RN-01 familia: POST audita CRIACAO com dados_anteriores null', async () => {
    const nome = uniq('E19 Familia ');
    const criada = await criarFamilia(nome);
    const linhas = await linhasDe('familia', 'CRIACAO', criada.id);
    assert.strictEqual(linhas.length, 1, 'a criacao da familia nao deixou rastro');
    assert.strictEqual(linhas[0].dados_anteriores, null);
    assert.strictEqual(JSON.parse(linhas[0].dados_novos).nome, nome);
  });

  await test('RN-01 familia: PUT audita EDICAO com o de/para do nome', async () => {
    const antigo = uniq('E19 Fam Antiga ');
    const criada = await criarFamilia(antigo);
    const novo = uniq('E19 Fam Nova ');
    const res = await request(app).put(`/api/almoxarifado/familias/${criada.id}`).send({ nome: novo });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const linhas = await linhasDe('familia', 'EDICAO', criada.id);
    assert.strictEqual(linhas.length, 1, 'a edicao da familia nao deixou rastro');
    assert.strictEqual(JSON.parse(linhas[0].dados_anteriores).nome, antigo);
    assert.strictEqual(JSON.parse(linhas[0].dados_novos).nome, novo);
  });

  await test('RN-01 familia: DELETE audita EXCLUSAO com o nome no "de"', async () => {
    const nome = uniq('E19 Fam Del ');
    const criada = await criarFamilia(nome);
    const res = await request(app).delete(`/api/almoxarifado/familias/${criada.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const linhas = await linhasDe('familia', 'EXCLUSAO', criada.id);
    assert.strictEqual(linhas.length, 1, 'a exclusao da familia nao deixou rastro');
    assert.strictEqual(JSON.parse(linhas[0].dados_anteriores).nome, nome);
    assert.strictEqual(Number(JSON.parse(linhas[0].dados_novos).ativo), 0);
  });

  await test('familia com item ativo continua 400 e NAO audita exclusao', async () => {
    const criada = await criarFamilia(uniq('E19 Fam Ocupada '));
    await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, familia_id, ativo)
       VALUES (?,?,'UN',0,?,1)`, [uniq('E19F'), 'Material da familia', criada.id]);
    const res = await request(app).delete(`/api/almoxarifado/familias/${criada.id}`);
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual((await linhasDe('familia', 'EXCLUSAO', criada.id)).length, 0,
      'auditou uma exclusao que a rota recusou');
  });

  // ── Limitação da Etapa 19, CORRIGIDA na Etapa 23: DELETE de linha JÁ INATIVA ────────────
  await test('[E19 limitacao -> E23 corrigida] DELETE de linha JA INATIVA segue 200, mas NAO audita', async () => {
    // ATE A ETAPA 22 este cenario afirmava `length === 2` e existia para FIXAR uma limitacao:
    // em SQLite `changes` conta a linha ATINGIDA, nao a que mudou de valor, entao a guarda de
    // 404 da RN-03 (Etapa 19) so pegava id INEXISTENTE e o 2o DELETE gravava um EXCLUSAO que
    // nao excluiu nada. A Etapa 23 (RN-04) pos `AND ativo = 1` no WHERE e o numero virou 1.
    // O 200 permanece de proposito: a exclusao e IDEMPOTENTE — a tela deixa clicar de novo, e
    // transformar isso em erro quebraria o fluxo do usuario por causa de um conserto de log.
    const criado = await criarTipo(uniq('E19 Tipo Duplo '));
    const um = await request(app).delete(`/api/almoxarifado/tipos-material/${criado.id}`);
    assert.strictEqual(um.status, 200, JSON.stringify(um.body));
    assert.strictEqual((await linhasDe('tipo_material', 'EXCLUSAO', criado.id)).length, 1,
      'setup: a 1a exclusao devia deixar exatamente 1 linha');

    const dois = await request(app).delete(`/api/almoxarifado/tipos-material/${criado.id}`);
    assert.strictEqual(dois.status, 200,
      `a exclusao continua idempotente: esperado 200, veio ${dois.status} — ${JSON.stringify(dois.body)}`);
    assert.strictEqual((await linhasDe('tipo_material', 'EXCLUSAO', criado.id)).length, 1,
      'a Etapa 23 regrediu: o 2o DELETE voltou a gravar rastro de um ato sem efeito');
    assert.strictEqual(dois.body.ja_inativo, true, `esperado ja_inativo: ${JSON.stringify(dois.body)}`);
  });

  // ── RN-02: auditoria quebrada NAO derruba o ato ─────────────────────────────────────────
  await test('RN-02: registrarAuditoria explodindo nao derruba o POST /tipos-material', async () => {
    const antes = await totalLinhas();
    const nome = uniq('E19 Tipo Sabotado ');

    const original = auditModule.registrarAuditoria;
    let chamado = false;
    auditModule.registrarAuditoria = async () => {
      chamado = true;
      throw new Error('SABOTAGEM: auditoria explodiu');
    };
    let res;
    try {
      res = await request(app).post('/api/almoxarifado/tipos-material').send({ nome });
      // (1) o stub TEM de ter sido alcancado — sem isto, uma rota que simplesmente NAO
      //     auditasse passaria verde e este teste seria vazio.
      assert.ok(chamado, 'o stub sabotado nao foi alcancado: ou a rota nao audita, ou audita '
        + 'pelo binding desestruturado (import por objeto e o que torna o stub alcancavel)');
      // (2) o ato responde normal e GRAVOU
      assert.strictEqual(res.status, 201, `auditoria derrubou o ato: ${JSON.stringify(res.body)}`);
      const col = await dbGet(db, 'SELECT nome FROM tipos_material_almoxarifado WHERE nome = ?', [nome]);
      assert.ok(col, 'o tipo de material nao foi gravado');
    } finally {
      auditModule.registrarAuditoria = original;
    }
    // (3) nenhuma linha nasceu
    assert.strictEqual(await totalLinhas(), antes, 'a auditoria sabotada gravou linha assim mesmo');
  });

  await test('RN-02: registrarAuditoria explodindo nao derruba o PUT /setores/:id (caminho do cascata)', async () => {
    const nome = uniq('E19 Setor Sabotado ');
    const criado = await criarSetor(nome, 'E19Z');
    await criarLocalizacao(uniq('E19ZS1'), { setor: nome });
    const antes = await totalLinhas();
    const novoNome = `${nome} X`;

    const original = auditModule.registrarAuditoria;
    let chamado = false;
    auditModule.registrarAuditoria = async () => {
      chamado = true;
      throw new Error('SABOTAGEM: auditoria explodiu');
    };
    try {
      const res = await request(app).put(`/api/almoxarifado/setores/${criado.id}`)
        .send({ nome: novoNome, codigo_prefixo: 'E19Z', tipo: 'area', ordem: 2 });
      assert.ok(chamado, 'o stub sabotado nao foi alcancado no PUT de setor');
      assert.strictEqual(res.status, 200, `auditoria derrubou o ato: ${JSON.stringify(res.body)}`);
      const col = await dbGet(db, 'SELECT nome FROM setores_almoxarifado WHERE id = ?', [criado.id]);
      assert.strictEqual(col.nome, novoNome, 'o setor nao foi renomeado');
      const casc = await dbGet(db, 'SELECT COUNT(*) as c FROM localizacoes_almoxarifado WHERE setor = ?', [novoNome]);
      assert.strictEqual(casc.c, 1, 'o cascata nao rodou — a auditoria quebrou o efeito colateral');
    } finally {
      auditModule.registrarAuditoria = original;
    }
    assert.strictEqual(await totalLinhas(), antes, 'a auditoria sabotada gravou linha assim mesmo');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
