/**
 * Etapa 26, Task 4 (Step 1) — INTEGRACAO: o catalogo novo atravessa as tres camadas.
 *
 * Plano:  docs/superpowers/plans/2026-08-29-almoxarifado-etapa26-categorias.md
 * Design: docs/superpowers/specs/2026-08-29-almoxarifado-etapa26-categorias-design.md
 *
 * As tasks 1, 2 e 3 provaram cada camada isolada. Este arquivo prova o CAMINHO INTEIRO, na ordem
 * em que o usuario o percorre:
 *
 *   cadastrar a categoria (Task 3 / rota da Task 1)
 *     -> ela aparece na lista que o formulario de material le (Task 2, C1)
 *       -> um material e classificado com ela (a coluna `materiais.categoria`, texto)
 *         -> e o cadastro deixou RASTRO, lido pela TELA-CONTRATO da auditoria
 *            (`GET /auditoria?entidade=categoria`), com o rotulo "Categoria" que a Task 1
 *            acrescentou ao `auditLabels`.
 *
 * ── POR QUE LER PELA TELA-CONTRATO, E NAO PELA TABELA ────────────────────────────────────────
 * Um `SELECT` em `auditoria_log_almoxarifado` provaria que a linha existe, e e o que o cenario
 * (9) da Task 1 ja faz. O que ele NAO prova e que a trilha e LEGIVEL: o filtro `entidade=categoria`
 * so acha se o valor gravado for exatamente `categoria`, e o rotulo so sai humano se
 * `ROTULOS_ENTIDADE` conhecer a entidade nova. Sem esses dois, a etapa entrega um cadastro cujo
 * rastro existe no banco e nao aparece para quem audita — que e o mesmo que nao existir.
 *
 * ── NADA DE TOTAL FIXO ───────────────────────────────────────────────────────────────────────
 * Este arquivo NUNCA afirma "a trilha tem N atos". O banco de teste e compartilhado com os outros
 * cenarios e com as sementes; um numero fixo quebraria por motivo alheio e, pior, esconderia o
 * achado atras de um vermelho de contagem. O que se afirma e a COMPOSICAO: os atos DESTA
 * categoria estao la, com estas acoes, com este rotulo e com este autor.
 *
 * ── GUARDA ANTI-TESTE-VAZIO ──────────────────────────────────────────────────────────────────
 * Toda afirmacao sobre CONTEUDO e precedida da afirmacao de que a LEITURA TROUXE ALGUMA COISA.
 * `[].every(...)` e `undefined === undefined` sao verdadeiros: um filtro errado, um gate que
 * devolvesse 200 com lista vazia ou uma entidade gravada com outro nome fariam este arquivo
 * passar inteiro sem ter lido um unico ato. Por isso, em cada bloco: primeiro `itens.length > 0`
 * e "o ato DESTA categoria foi encontrado", so depois qualquer assercao sobre ele.
 *
 * O leitor da trilha precisa de `configurar` (`extended.js:1480`): ADMIN entra por
 * `is_superadmin: 1`, que `getPerfilFromUser` resolve como ADMINISTRADOR.
 *
 * Executar: cd server && node tests/api/categoriaIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = {
  id: 264, nome: 'Admin Integracao E26', role: 'admin', is_superadmin: 1, email: 'e26int@test.com',
};

const sufixo = `${Date.now() % 1000000}`;

(async () => {
  console.log('\n=== Etapa 26 Task 4: integracao do catalogo de categorias ===\n');
  const { app, db, close } = await createTestApp({ user: { ...ADMIN } });

  // Estado compartilhado entre os cenarios: o caminho e UM so, percorrido em ordem.
  const contexto = {};

  await test('(1) a categoria criada pela rota aparece na lista que o formulario de material le', async () => {
    contexto.nome = `Perfis de aluminio ${sufixo}`;

    const antes = await request(app).get('/api/almoxarifado/categorias');
    assert.strictEqual(antes.status, 200, `GET categorias falhou: ${antes.status}`);
    assert.ok(Array.isArray(antes.body) && antes.body.length > 0,
      `o GET devolveu lista vazia (${JSON.stringify(antes.body)}) — as 27 sementes deveriam estar la; `
      + 'com lista vazia todo cenario deste arquivo mediria o nada');
    assert.ok(!antes.body.some((c) => c.nome === contexto.nome),
      'a categoria nao pode existir antes de ser criada');

    const criada = await request(app).post('/api/almoxarifado/categorias').send({ nome: contexto.nome });
    assert.strictEqual(criada.status, 201,
      `POST categoria falhou: ${criada.status} ${JSON.stringify(criada.body)}`);
    contexto.id = criada.body.id;
    assert.ok(contexto.id, `o 201 nao trouxe id: ${JSON.stringify(criada.body)}`);

    // A MESMA rota que o hook `useCategoriasMaterial` consome nas tres telas (Task 2). Se o
    // catalogo tivesse cache de modulo, a categoria recem-criada nao estaria aqui — e o usuario
    // cadastraria a categoria e nao a acharia no select.
    const depois = await request(app).get('/api/almoxarifado/categorias');
    assert.strictEqual(depois.status, 200, `GET categorias (depois) falhou: ${depois.status}`);
    const encontrada = depois.body.find((c) => c.id === contexto.id);
    assert.ok(encontrada,
      `a categoria ${contexto.id} nao aparece no GET que as telas consomem: `
      + JSON.stringify(depois.body.map((c) => c.nome).slice(0, 5)) + '...');
    assert.strictEqual(encontrada.nome, contexto.nome, `nome divergente: ${JSON.stringify(encontrada)}`);
    assert.strictEqual(encontrada.ativo, 1, `categoria nova tinha de nascer ativa: ${JSON.stringify(encontrada)}`);
  });

  await test('(2) um material e classificado com a categoria nova, e a classificacao chega ao banco', async () => {
    assert.ok(contexto.id, 'guarda: o cenario (1) precisa ter criado a categoria');

    const fam = await request(app).post('/api/almoxarifado/familias').send({ nome: `Fam Int E26 ${sufixo}` });
    assert.strictEqual(fam.status, 201, `setup da familia falhou: ${fam.status} ${JSON.stringify(fam.body)}`);

    const codigo = `MAT-INT-E26-${sufixo}`;
    const mat = await request(app).post('/api/almoxarifado/materiais').send({
      codigo, nome: `Material ${codigo}`, unidade: 'UN', familia_id: fam.body.id, categoria: contexto.nome,
    });
    assert.strictEqual(mat.status, 201, `POST material falhou: ${mat.status} ${JSON.stringify(mat.body)}`);
    contexto.materialId = mat.body.id;

    // O que foi GRAVADO, nao o que a resposta ecoou. `createMaterial` faz
    // `categoria: categoria || 'OUTROS'` (materialService.js:179) — o fallback do servidor que a
    // Task 2 descobriu; aqui ele NAO pode ter agido, porque a categoria foi enviada.
    const gravado = await dbGet(db, 'SELECT categoria FROM materiais_almoxarifado WHERE id = ?', [contexto.materialId]);
    assert.ok(gravado, `o material ${contexto.materialId} nao esta no banco`);
    assert.strictEqual(gravado.categoria, contexto.nome,
      `o material foi gravado com ${JSON.stringify(gravado.categoria)} e nao com a categoria escolhida `
      + `(${JSON.stringify(contexto.nome)}) — o fallback \`|| 'OUTROS'\` agiu por cima da escolha`);

    // E a listagem filtrada por essa categoria o encontra: e o filtro que a tela de materiais
    // oferece (MateriaisAlmoxarifado.js), agora alimentado pelo catalogo.
    const filtrado = await request(app).get('/api/almoxarifado/materiais').query({ categoria: contexto.nome });
    assert.strictEqual(filtrado.status, 200, `GET materiais falhou: ${filtrado.status}`);
    assert.ok(Array.isArray(filtrado.body) && filtrado.body.length > 0,
      `o filtro por "${contexto.nome}" devolveu lista vazia — sem esta guarda o \`some\` abaixo `
      + 'passaria por vacuidade');
    assert.ok(filtrado.body.some((m) => m.id === contexto.materialId),
      `o material ${contexto.materialId} nao aparece filtrado por "${contexto.nome}": `
      + JSON.stringify(filtrado.body.map((m) => m.id)));
  });

  await test('(3) o cadastro deixou rastro na TELA-CONTRATO da auditoria, com o rotulo "Categoria"', async () => {
    assert.ok(contexto.id, 'guarda: o cenario (1) precisa ter criado a categoria');

    // A leitura da TELA: filtro por entidade, sem `entidade_id`. E como a trilha e consultada de
    // verdade — "o que aconteceu com categorias" —, e so acha se o valor gravado na coluna
    // `entidade` for exatamente `categoria`.
    const trilha = await request(app).get('/api/almoxarifado/auditoria').query({ entidade: 'categoria' });
    assert.strictEqual(trilha.status, 200,
      `GET auditoria falhou: ${trilha.status} ${JSON.stringify(trilha.body)} — o leitor precisa de \`configurar\``);

    // ── GUARDA ANTI-TESTE-VAZIO, EM DOIS DEGRAUS ────────────────────────────────────────────
    // (a) a leitura trouxe alguma coisa;
    const itens = trilha.body.itens;
    assert.ok(Array.isArray(itens),
      `a resposta nao tem \`itens\` (a forma paginada da Etapa 18): ${JSON.stringify(Object.keys(trilha.body))}`);
    assert.ok(itens.length > 0,
      'a trilha de `entidade=categoria` voltou VAZIA — ou a entidade foi gravada com outro nome, '
      + 'ou a auditoria nao rodou; toda assercao abaixo passaria por vacuidade');
    assert.ok(trilha.body.total >= itens.length,
      `total (${trilha.body.total}) menor que os itens devolvidos (${itens.length})`);

    // (b) o ato DESTA categoria foi encontrado. Nada de total fixo: o banco de teste e
    //     compartilhado, e o que importa e a COMPOSICAO desta trilha.
    const meus = itens.filter((i) => i.entidade_id === contexto.id);
    assert.ok(meus.length > 0,
      `nenhum ato da categoria ${contexto.id} na trilha (${itens.length} atos de categoria lidos) — `
      + `entidade_ids presentes: ${JSON.stringify([...new Set(itens.map((i) => i.entidade_id))].slice(0, 10))}`);

    // Agora, e so agora, o conteudo.
    const criacao = meus.find((i) => i.acao === 'CRIACAO');
    assert.ok(criacao,
      `a CRIACAO da categoria ${contexto.id} nao esta na trilha: ${JSON.stringify(meus.map((i) => i.acao))}`);
    assert.strictEqual(criacao.entidade, 'categoria',
      `entidade gravada como ${JSON.stringify(criacao.entidade)} — o filtro da tela nao a acharia`);
    // O rotulo: sem `categoria: 'Categoria'` em ROTULOS_ENTIDADE a tela mostraria `categoria`
    // cru, no meio de "Familia", "Setor" e "Centro de custo".
    assert.strictEqual(criacao.entidade_rotulo, 'Categoria',
      `entidade_rotulo cru na tela de auditoria: ${JSON.stringify(criacao.entidade_rotulo)}`);
    assert.strictEqual(criacao.acao_rotulo, 'Criação',
      `acao_rotulo cru: ${JSON.stringify(criacao.acao_rotulo)}`);
    // O AUTOR: a trilha responde "quem", nao so "o que".
    assert.strictEqual(criacao.usuario_id, ADMIN.id,
      `autor errado na trilha: ${JSON.stringify({ id: criacao.usuario_id, nome: criacao.usuario_nome })}`);
    // E o nome criado esta no de/para, para quem le a trilha sem acesso ao cadastro.
    const dados = JSON.parse(criacao.dados_novos || '{}');
    assert.strictEqual(dados.nome, contexto.nome,
      `dados_novos da CRIACAO sem o nome gravado: ${criacao.dados_novos}`);
  });

  await test('(4) o filtro de entidades da tela de auditoria passa a OFERECER "categoria"', async () => {
    assert.ok(contexto.id, 'guarda: o cenario (1) precisa ter criado a categoria');

    // `/auditoria/opcoes` monta o select da tela por `SELECT DISTINCT entidade` do que esta
    // REALMENTE gravado. Se a entidade nova nao aparecesse aqui, o rastro existiria e ninguem
    // teria como filtra-lo pela tela — o cadastro seria o 13o sem rastro NA PRATICA.
    const opcoes = await request(app).get('/api/almoxarifado/auditoria/opcoes');
    assert.strictEqual(opcoes.status, 200, `GET opcoes falhou: ${opcoes.status} ${JSON.stringify(opcoes.body)}`);
    const entidades = opcoes.body.entidades || [];
    assert.ok(entidades.length > 0,
      `\`entidades\` voltou vazio (${JSON.stringify(opcoes.body)}) — o \`includes\` abaixo passaria por vacuidade`);
    const valores = entidades.map((e) => (typeof e === 'string' ? e : e.valor ?? e.entidade));
    assert.ok(valores.includes('categoria'),
      `"categoria" nao esta entre as entidades oferecidas pelo filtro: ${JSON.stringify(valores)}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
