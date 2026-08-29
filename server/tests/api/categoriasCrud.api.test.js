/**
 * Etapa 26, Task 1 — o catalogo de categorias vira CADASTRO EDITAVEL.
 *
 * Plano:  docs/superpowers/plans/2026-08-29-almoxarifado-etapa26-categorias.md
 * Design: docs/superpowers/specs/2026-08-29-almoxarifado-etapa26-categorias-design.md
 *
 * Prova RN-02 (criar/renomear/desativar), RN-03 (gate `configurar`, com MATRIZ DE PERFIS e a
 * assercao negativa), RN-06 (duplicada recusada) e a promessa central da RN-02: **desativar nao
 * apaga** — o material que usa a categoria continua com ela.
 *
 * ── O MOLDE E HIBRIDO, POR ASSUNTO (C2 do plano) ─────────────────────────────────────────────
 * Gate + auditoria vem dos CENTROS DE CUSTO (mesmo arquivo, `extended.js`); a regua de nome e a
 * unicidade vem dos SETORES (400 nomeando o cadastro); o soft delete vem dos TIPOS DE MATERIAL
 * na versao ja corrigida pela Etapa 23 (`AND ativo = 1`, 404 para inexistente, 200 `ja_inativo`
 * idempotente SEM auditar). Familias NAO e molde de nada aqui: tem `parent_id`, validacao de
 * pai e codigo automatico que categoria nao precisa, e **nao tem unicidade de nome** — que e
 * exatamente o que a RN-06 pede.
 *
 * ── GUARDA ANTI-TESTE-VAZIO ──────────────────────────────────────────────────────────────────
 * O cenario de "desativar nao apaga" so vale se o GET TRAZIA a categoria antes: sem essa
 * afirmacao previa, "a categoria sumiu do GET" passaria identico se a criacao tivesse falhado,
 * se o filtro estivesse errado ou se o GET devolvesse lista vazia. Por isso cada cenario de
 * ausencia e precedido da presenca, no MESMO endpoint e com o MESMO filtro.
 *
 * A matriz de perfis tem a mesma armadilha ao contrario: uma matriz que so afirma 403 passa se a
 * rota nao existir (404 != 403 protege aqui, mas o 201 do perfil que DEVE passar e o que prova
 * que a rota esta viva). Por isso a matriz afirma os dois lados e a mensagem do vermelho NOMEIA
 * o perfil que passou indevidamente.
 *
 * Executar: cd server && node tests/api/categoriasCrud.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbAll, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// `is_superadmin: 1` da ADMINISTRADOR por `getPerfilFromUser`, que e o unico perfil de
// `configurar` (permissions.js:94).
const ADMIN = { id: 26, nome: 'Admin Etapa26', role: 'admin', is_superadmin: 1, email: 'e26@test.com' };

// Os SETE perfis que NAO tem `configurar`. PRODUCAO entra pelo usuario sem perfil nenhum (o
// fallback de `getPerfilFromUser`), que e o caso real do chao de fabrica.
const PERFIS_SEM_CONFIGURAR = [
  ['ALMOXARIFE', { id: 261, nome: 'Almoxarife', perfil_almoxarifado: 'ALMOXARIFE' }],
  ['GESTOR', { id: 262, nome: 'Gestor', perfil_almoxarifado: 'GESTOR' }],
  ['COMPRAS', { id: 263, nome: 'Compras', perfil_almoxarifado: 'COMPRAS' }],
  ['ENGENHARIA', { id: 264, nome: 'Engenharia', perfil_almoxarifado: 'ENGENHARIA' }],
  ['CONSULTA', { id: 265, nome: 'Consulta', perfil_almoxarifado: 'CONSULTA' }],
  ['QUALIDADE', { id: 266, nome: 'Qualidade', perfil_almoxarifado: 'QUALIDADE' }],
  ['PRODUCAO (sem perfil — fallback)', { id: 267, nome: 'Chao de Fabrica' }],
];

let seq = 0;
const uniq = (p) => `${p} ${Date.now() % 1000000}-${++seq}`;

(async () => {
  console.log('\n=== Etapa 26 Task 1: categoria e cadastro editavel ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });

  const listar = (query = {}) => request(app).get('/api/almoxarifado/categorias').query(query);
  const criar = (nome) => request(app).post('/api/almoxarifado/categorias').send({ nome });
  const nomesDe = (res) => res.body.map((c) => c.nome);

  // ── RN-02: criar ───────────────────────────────────────────────────────────────────────────
  await test('(1) RN-02 criar: POST devolve 201 e a categoria passa a aparecer no GET', async () => {
    const nome = uniq('Cat Nova');

    const antes = await listar();
    assert.strictEqual(antes.status, 200, `GET antes falhou: ${antes.status}`);
    assert.ok(Array.isArray(antes.body) && antes.body.length > 0,
      `GET devolveu lista vazia (${JSON.stringify(antes.body)}) — as 27 sementes deveriam estar la; `
      + 'sem isso todo cenario deste arquivo mede o nada');
    assert.ok(!nomesDe(antes).includes(nome), 'a categoria nao pode existir antes de ser criada');

    const res = await criar(nome);
    assert.strictEqual(res.status, 201, `POST falhou: ${res.status} ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.nome, nome, `corpo do 201 sem o nome: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.id, `corpo do 201 sem id: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.ativo, 1, `categoria nova nasce ativa: ${JSON.stringify(res.body)}`);

    const depois = await listar();
    assert.ok(nomesDe(depois).includes(nome),
      `a categoria criada nao aparece no GET: ${JSON.stringify(nomesDe(depois).slice(0, 5))}...`);
  });

  await test('(2) RN-02 criar: o nome e gravado com trim, e nome vazio e 400', async () => {
    const base = uniq('Cat Trim');
    const res = await request(app).post('/api/almoxarifado/categorias').send({ nome: `  ${base}  ` });
    assert.strictEqual(res.status, 201, `POST com espacos falhou: ${res.status} ${JSON.stringify(res.body)}`);
    const gravado = await dbGet(db, 'SELECT nome FROM categorias_material_almoxarifado WHERE id = ?', [res.body.id]);
    assert.strictEqual(gravado.nome, base,
      `gravou sem trim (${JSON.stringify(gravado.nome)}) — o UNIQUE nao veria "X" e " X " como o mesmo nome`);

    for (const vazio of ['', '   ', undefined]) {
      const r = await request(app).post('/api/almoxarifado/categorias').send({ nome: vazio });
      assert.strictEqual(r.status, 400,
        `nome ${JSON.stringify(vazio)} deveria dar 400, veio ${r.status} ${JSON.stringify(r.body)}`);
    }
  });

  // ── RN-06: duplicada recusada ──────────────────────────────────────────────────────────────
  await test('(3) RN-06: criar categoria com nome ja existente e recusada com 400 nomeando o cadastro', async () => {
    const nome = uniq('Cat Duplicada');
    const primeira = await criar(nome);
    assert.strictEqual(primeira.status, 201, `a 1a criacao precisa passar: ${primeira.status}`);

    const segunda = await criar(nome);
    assert.strictEqual(segunda.status, 400,
      `duplicada aceita (${segunda.status}) — o CREATE UNIQUE INDEX sobre `
      + `categorias_material_almoxarifado(nome) nao esta valendo: ${JSON.stringify(segunda.body)}`);
    assert.ok(/categoria/i.test(segunda.body.error || ''),
      `a mensagem tem de nomear o cadastro (regua dos setores), veio ${JSON.stringify(segunda.body)}`);

    // Com espacos ao redor tambem colide: o trim acontece ANTES do INSERT.
    const comEspaco = await request(app).post('/api/almoxarifado/categorias').send({ nome: `  ${nome} ` });
    assert.strictEqual(comEspaco.status, 400,
      `" ${nome} " passou (${comEspaco.status}) — sem trim antes do INSERT a lista ganha duplicatas visuais`);

    const linhas = await dbAll(db, 'SELECT id FROM categorias_material_almoxarifado WHERE nome = ?', [nome]);
    assert.strictEqual(linhas.length, 1, `${linhas.length} linhas com o mesmo nome no banco`);
  });

  await test('(4) RN-06: RENOMEAR para um nome que ja existe tambem e recusado', async () => {
    const ocupado = uniq('Cat Ocupada');
    const minha = uniq('Cat Minha');
    await criar(ocupado);
    const alvo = await criar(minha);
    assert.strictEqual(alvo.status, 201, `setup falhou: ${alvo.status}`);

    const res = await request(app).put(`/api/almoxarifado/categorias/${alvo.body.id}`).send({ nome: ocupado });
    assert.strictEqual(res.status, 400,
      `renomear para nome ocupado passou (${res.status}): o PUT precisa da mesma regua do POST`);

    const ainda = await dbGet(db, 'SELECT nome FROM categorias_material_almoxarifado WHERE id = ?', [alvo.body.id]);
    assert.strictEqual(ainda.nome, minha, `o nome mudou apesar do 400: ${ainda.nome}`);
  });

  // ── RN-02: renomear ────────────────────────────────────────────────────────────────────────
  await test('(5) RN-02 renomear: o GET passa a mostrar o nome novo, e o antigo some', async () => {
    const antigo = uniq('Cat Antiga');
    const novo = uniq('Cat Renomeada');
    const criada = await criar(antigo);
    assert.strictEqual(criada.status, 201, `setup falhou: ${criada.status}`);
    assert.ok(nomesDe(await listar()).includes(antigo), 'guarda: o nome antigo tem de estar no GET antes');

    const res = await request(app).put(`/api/almoxarifado/categorias/${criada.body.id}`).send({ nome: novo });
    assert.strictEqual(res.status, 200, `PUT falhou: ${res.status} ${JSON.stringify(res.body)}`);

    const nomes = nomesDe(await listar());
    assert.ok(nomes.includes(novo), 'o nome novo nao aparece no GET');
    assert.ok(!nomes.includes(antigo), 'o nome antigo continua no GET — o UPDATE nao gravou');
  });

  await test('(6) PUT em id inexistente e 404 (nao 200 sobre nada)', async () => {
    const res = await request(app).put('/api/almoxarifado/categorias/999888').send({ nome: uniq('Fantasma') });
    assert.strictEqual(res.status, 404, `esperava 404, veio ${res.status} ${JSON.stringify(res.body)}`);
  });

  // ── RN-02: desativar NAO APAGA — o cenario de peso ─────────────────────────────────────────
  await test('(7) RN-02 desativar NAO APAGA: o material que usa a categoria continua com ela', async () => {
    const nome = uniq('Cat Em Uso');
    const criada = await criar(nome);
    assert.strictEqual(criada.status, 201, `setup falhou: ${criada.status}`);

    // GUARDA ANTI-TESTE-VAZIO: afirmar que o GET TRAZIA antes de afirmar que sumiu.
    assert.ok(nomesDe(await listar()).includes(nome),
      `o GET NAO trazia a categoria antes da desativacao — sem esta guarda, "sumiu do GET" `
      + 'passaria identico com a criacao quebrada');

    const fam = await request(app).post('/api/almoxarifado/familias').send({ nome: uniq('Fam E26') });
    assert.strictEqual(fam.status, 201, `setup da familia falhou: ${fam.status} ${JSON.stringify(fam.body)}`);
    const codigo = `MAT-E26-${criada.body.id}`;
    const mat = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo, nome: `Material ${codigo}`, unidade: 'UN', familia_id: fam.body.id, categoria: nome });
    assert.strictEqual(mat.status, 201, `POST material falhou: ${mat.status} ${JSON.stringify(mat.body)}`);
    assert.strictEqual(mat.body.categoria, nome, `o material nao nasceu com a categoria: ${JSON.stringify(mat.body.categoria)}`);

    const del = await request(app).delete(`/api/almoxarifado/categorias/${criada.body.id}`);
    assert.strictEqual(del.status, 200, `DELETE falhou: ${del.status} ${JSON.stringify(del.body)}`);

    // 1) A LINHA CONTINUA NO BANCO, com ativo = 0. Se o DELETE apagar, este SELECT vem vazio.
    const linha = await dbGet(db, 'SELECT * FROM categorias_material_almoxarifado WHERE id = ?', [criada.body.id]);
    assert.ok(linha, `a linha da categoria ${criada.body.id} FOI APAGADA — desativar tem de ser soft delete`);
    assert.strictEqual(linha.ativo, 0, `esperava ativo = 0, veio ${linha.ativo}`);

    // 2) O MATERIAL CONTINUA CLASSIFICADO. E a promessa da RN-02 para o dado do cliente.
    const materialDepois = await dbGet(db, 'SELECT categoria FROM materiais_almoxarifado WHERE id = ?', [mat.body.id]);
    assert.strictEqual(materialDepois.categoria, nome,
      `o material ${mat.body.id} perdeu a categoria (${JSON.stringify(materialDepois.categoria)}) — `
      + 'desativar a categoria mexeu em dado de material');
    // E continua achavel PELA ROTA, filtrando por essa categoria: a leitura de material nao
    // depende de a categoria estar ativa no catalogo.
    const lido = await request(app).get('/api/almoxarifado/materiais').query({ categoria: nome });
    assert.strictEqual(lido.status, 200, `GET materiais falhou: ${lido.status}`);
    assert.ok(Array.isArray(lido.body) && lido.body.some((m) => m.id === mat.body.id),
      `o material ${mat.body.id} sumiu da listagem filtrada por "${nome}": `
      + JSON.stringify(lido.body.map((m) => m.id)));

    // 3) SOME do GET padrao...
    assert.ok(!nomesDe(await listar()).includes(nome),
      'a categoria desativada continua no GET padrao — o select do material seguiria oferecendo ela');

    // 4) ...e APARECE no GET com o parametro de inativas (C1) — sem isso a aba de CRUD nao tem
    //    como REATIVAR o que desativou, e "desativar nao apaga" vira promessa vazia.
    const todos = await listar({ todos: '1' });
    assert.strictEqual(todos.status, 200, `GET ?todos=1 falhou: ${todos.status}`);
    const inativa = todos.body.find((c) => c.id === criada.body.id);
    assert.ok(inativa, 'GET ?todos=1 nao traz a categoria inativa — a tela nao consegue reativar');
    assert.strictEqual(inativa.ativo, 0, `?todos=1 devolveu ativo = ${inativa.ativo}`);
  });

  await test('(8) reativar pelo PUT devolve a categoria ao GET padrao', async () => {
    const nome = uniq('Cat Ressuscita');
    const criada = await criar(nome);
    await request(app).delete(`/api/almoxarifado/categorias/${criada.body.id}`);
    assert.ok(!nomesDe(await listar()).includes(nome), 'guarda: tinha de estar fora do GET padrao');

    const res = await request(app).put(`/api/almoxarifado/categorias/${criada.body.id}`).send({ nome, ativo: 1 });
    assert.strictEqual(res.status, 200, `PUT de reativacao falhou: ${res.status} ${JSON.stringify(res.body)}`);
    assert.ok(nomesDe(await listar()).includes(nome), 'a categoria reativada nao voltou ao GET padrao');
  });

  // ── Soft delete no molde JA CORRIGIDO da Etapa 23 ──────────────────────────────────────────
  await test('(9) DELETE idempotente: 2a chamada e 200 `ja_inativo` SEM segunda linha de auditoria; id inexistente e 404', async () => {
    const nome = uniq('Cat Idem');
    const criada = await criar(nome);
    const primeira = await request(app).delete(`/api/almoxarifado/categorias/${criada.body.id}`);
    assert.strictEqual(primeira.status, 200, `1o DELETE falhou: ${primeira.status}`);
    assert.strictEqual(primeira.body.ja_inativo, undefined,
      `o 1o DELETE nao pode vir com ja_inativo: ${JSON.stringify(primeira.body)}`);

    const contarExclusoes = async () => (await dbAll(db,
      "SELECT id FROM auditoria_log_almoxarifado WHERE entidade = 'categoria' AND entidade_id = ? AND acao = 'EXCLUSAO'",
      [criada.body.id])).length;
    assert.strictEqual(await contarExclusoes(), 1,
      'o 1o DELETE tinha de deixar UMA linha de auditoria — sem ela o cenario abaixo mede zero contra zero');

    const segunda = await request(app).delete(`/api/almoxarifado/categorias/${criada.body.id}`);
    assert.strictEqual(segunda.status, 200, `2o DELETE deveria ser 200 idempotente, veio ${segunda.status}`);
    assert.strictEqual(segunda.body.ja_inativo, true,
      `2o DELETE sem ja_inativo: ${JSON.stringify(segunda.body)} — sem o AND ativo = 1 o changes conta a `
      + 'linha que o WHERE CASOU, nao a que MUDOU');
    assert.strictEqual(await contarExclusoes(), 1,
      'a 2a desativacao virou linha na trilha sem ter mudado nada (licao da Etapa 23)');

    const fantasma = await request(app).delete('/api/almoxarifado/categorias/999888');
    assert.strictEqual(fantasma.status, 404, `id inexistente deveria dar 404, veio ${fantasma.status}`);
  });

  // ── Auditoria: este cadastro nasce instrumentado ───────────────────────────────────────────
  await test('(10) os tres atos deixam rastro, lidos pela tela-contrato da auditoria com rotulo "Categoria"', async () => {
    const nome = uniq('Cat Auditada');
    const criada = await criar(nome);
    await request(app).put(`/api/almoxarifado/categorias/${criada.body.id}`).send({ nome: `${nome} v2` });
    await request(app).delete(`/api/almoxarifado/categorias/${criada.body.id}`);

    const trilha = await request(app).get('/api/almoxarifado/auditoria')
      .query({ entidade: 'categoria', entidade_id: criada.body.id });
    assert.strictEqual(trilha.status, 200, `GET auditoria falhou: ${trilha.status} ${JSON.stringify(trilha.body)}`);
    const itens = trilha.body.itens || trilha.body;
    assert.ok(itens.length >= 3,
      `a trilha da categoria ${criada.body.id} tem ${itens.length} atos, esperava 3 (CRIACAO/EDICAO/EXCLUSAO): `
      + JSON.stringify(itens.map((i) => i.acao)));
    const acoes = itens.map((i) => i.acao);
    for (const esperada of ['CRIACAO', 'EDICAO', 'EXCLUSAO']) {
      assert.ok(acoes.includes(esperada), `falta ${esperada} na trilha: ${JSON.stringify(acoes)}`);
    }
    // Sem `categoria: 'Categoria'` em ROTULOS_ENTIDADE a tela mostraria "categoria" cru no meio
    // de "Familia", "Setor" e "Centro de custo".
    assert.strictEqual(itens[0].entidade_rotulo, 'Categoria',
      `entidade_rotulo cru na tela de auditoria: ${JSON.stringify(itens[0].entidade_rotulo)}`);

    const edicao = itens.find((i) => i.acao === 'EDICAO');
    const deParaNome = (edicao.alteracoes || []).find((a) => a.campo === 'nome');
    assert.ok(deParaNome, `a EDICAO nao registrou o de/para do nome: ${JSON.stringify(edicao.alteracoes)}`);
    assert.strictEqual(deParaNome.de, nome, `de errado: ${JSON.stringify(deParaNome)}`);
    assert.strictEqual(deParaNome.para, `${nome} v2`, `para errado: ${JSON.stringify(deParaNome)}`);
  });

  // ── RN-03: a matriz de perfis, com a assercao negativa ─────────────────────────────────────
  await test('(11) RN-03 matriz de perfis: SO ADMINISTRADOR escreve; os outros sete tomam 403 nas tres rotas', async () => {
    // Setup com o admin, para haver um alvo real de PUT/DELETE (403 sobre id inexistente
    // passaria pelo motivo errado — o gate roda antes, mas o 404 mascararia um gate ausente).
    setUser({ ...ADMIN });
    const alvo = await criar(uniq('Cat Matriz'));
    assert.strictEqual(alvo.status, 201,
      `o LADO POSITIVO da matriz caiu: ADMINISTRADOR nao conseguiu criar (${alvo.status} `
      + `${JSON.stringify(alvo.body)}) — sem ele os 403 abaixo passariam ate com a rota inexistente`);

    const passaram = [];
    for (const [rotulo, user] of PERFIS_SEM_CONFIGURAR) {
      setUser(user);
      const tentativas = [
        ['POST', await request(app).post('/api/almoxarifado/categorias').send({ nome: uniq('Cat Proibida') })],
        ['PUT', await request(app).put(`/api/almoxarifado/categorias/${alvo.body.id}`).send({ nome: uniq('Cat Invadida') })],
        ['DELETE', await request(app).delete(`/api/almoxarifado/categorias/${alvo.body.id}`)],
      ];
      for (const [verbo, res] of tentativas) {
        if (res.status !== 403) passaram.push(`${rotulo} passou no ${verbo} com ${res.status}`);
      }
      // O GET continua aberto a qualquer usuario do modulo (gate `auth` so) — a tela de
      // material precisa da lista para exibir a categoria.
      const get = await request(app).get('/api/almoxarifado/categorias');
      assert.strictEqual(get.status, 200, `${rotulo} perdeu a LEITURA da lista: ${get.status}`);
    }
    assert.deepStrictEqual(passaram, [],
      `perfis SEM \`configurar\` escreveram categoria: ${JSON.stringify(passaram)}`);

    // E o cadastro nao foi tocado por nenhum deles.
    setUser({ ...ADMIN });
    const ainda = await dbGet(db, 'SELECT nome, ativo FROM categorias_material_almoxarifado WHERE id = ?', [alvo.body.id]);
    assert.strictEqual(ainda.nome, alvo.body.nome, `o nome mudou apesar dos 403: ${ainda.nome}`);
    assert.strictEqual(ainda.ativo, 1, `a categoria foi desativada apesar dos 403: ativo = ${ainda.ativo}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
