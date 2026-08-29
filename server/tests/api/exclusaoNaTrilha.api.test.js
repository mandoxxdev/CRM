/**
 * Etapa 23, Task 3 (Step 1) — INTEGRACAO: o conserto da RN-03 aparece PARA QUEM AUDITA.
 *
 * `exclusaoIdempotente.api.test.js` (Task 2) prova a RN-03 pelo BANCO: conta linhas em
 * `auditoria_log_almoxarifado` com SELECT direto. Isso nao prova que o conserto chega a quem
 * audita — e chegar a quem audita e o MOTIVO DE A ETAPA EXISTIR, porque a Etapa 22 acabou de dar
 * tela a trilha. Entre a tabela e o auditor ha uma rota com gate, cinco filtros, paginacao e tres
 * campos derivados (`acao_rotulo`, `entidade_rotulo`, `alteracoes`).
 *
 * Este arquivo fecha essa distancia: ESCREVE por rota real (excluir duas vezes) e LE pela
 * TELA-CONTRATO — `GET /api/almoxarifado/auditoria?entidade=...&entidade_id=...`, a mesma C1 que
 * a tela da Etapa 22 consome — afirmando que a trilha mostra UM ato, nao dois.
 *
 * ── O GATE, e por que ele e uma armadilha aqui ───────────────────────────────────────────────
 * A C1 exige `requirePermission('configurar')` (RN-06 da Etapa 18: so ADMINISTRADOR). E
 * `getPerfilFromUser` faz FALLBACK PARA PRODUCAO — usuario sem perfil nao e "sem acesso", e chao
 * de fabrica, e toma 403. Um `role: 'admin'` puro NAO passa por `denyUnlessAlmoxAdmin` nas rotas
 * de cadastro. Com o gate errado, todo cenario deste arquivo leria uma trilha vazia e afirmaria
 * "um ato so" sobre ZERO — o teste vazio classico desta base. Dai o par de guardas abaixo.
 *
 * ── GUARDA ANTI-TESTE-VAZIO, em toda leitura ─────────────────────────────────────────────────
 * ANTES de afirmar "so um ato", cada cenario afirma que a leitura devolveu PELO MENOS esse ato.
 * Um filtro errado (entidade trocada, id trocado, 403 engolido) devolveria `total: 0` e a
 * assercao "nao mostra dois" passaria provando nada.
 *
 * ── ORDEM DAS ASSERCOES ──────────────────────────────────────────────────────────────────────
 * Mesma licao do d507ccc e da Task 2: a contagem da TRILHA vem antes de qualquer checagem do
 * corpo do DELETE. Sem o `AND ativo = 1` a rota volta a responder `{ success: true }` sem
 * `ja_inativo`, entao checar o corpo primeiro derrubaria o controle positivo pelo campo errado.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// `is_superadmin: 1` e nao `role: 'admin'` puro: `denyUnlessAlmoxAdmin` (DELETE de tipo) e
// `requirePermission('configurar')` (a C1) recusam `admin` sozinho.
const AUDITOR = { id: 23, nome: 'Admin Etapa23 Trilha', role: 'admin', is_superadmin: 1, email: 'e23@test.com' };
// Sem perfil nenhum: `getPerfilFromUser` devolve PRODUCAO por fallback.
const CHAO_DE_FABRICA = { id: 24, nome: 'Operador Sem Perfil', email: 'chao@test.com' };

let seq = 0;
const uniq = (p) => `${p}${Date.now() % 100000}${++seq}`;

(async () => {
  const { app, close, setUser } = await createTestApp({ user: { ...AUDITOR } });

  // A LEITURA e sempre pela C1, nunca por SELECT na tabela — e o ponto do arquivo.
  const lerTrilha = (query) => request(app).get('/api/almoxarifado/auditoria').query(query);

  const criarTipo = async (nome) => {
    const res = await request(app).post('/api/almoxarifado/tipos-material').send({ nome });
    assert.strictEqual(res.status, 201, `POST tipo-material falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };
  const criarFamilia = async (nome) => {
    const res = await request(app).post('/api/almoxarifado/familias').send({ nome });
    assert.strictEqual(res.status, 201, `POST familia falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };
  const criarMaterial = async (codigo, familiaId) => {
    const res = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo, nome: `Material ${codigo}`, familia_id: familiaId, unidade: 'UN' });
    assert.strictEqual(res.status, 201, `POST material falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };

  // Resume o que a C1 devolve para UMA entidade+id, ja com a guarda anti-teste-vazio aplicada.
  const atosNaTrilha = async (entidade, entidadeId) => {
    const res = await lerTrilha({ entidade, entidade_id: entidadeId, limite: 1000 });
    assert.strictEqual(res.status, 200,
      `a tela-contrato respondeu ${res.status} (403 = gate errado; nesse caso TODOS os cenarios `
      + `deste arquivo estariam afirmando "um ato" sobre uma trilha vazia): ${JSON.stringify(res.body)}`);
    assert.deepStrictEqual(Object.keys(res.body).sort(), ['itens', 'limite', 'offset', 'total', 'truncado'],
      `a FORMA da resposta da C1 mudou: ${JSON.stringify(Object.keys(res.body))}`);
    // A C1 pagina: `total` e o que existe, `itens` e o que veio. Com `limite: 1000` e um id
    // isolado os dois tem de bater — se divergirem, contar `itens.length` mentiria.
    assert.strictEqual(res.body.itens.length, res.body.total,
      `a C1 truncou (${res.body.itens.length} de ${res.body.total}) e a contagem abaixo mentiria`);
    return res.body;
  };

  // Resumo legivel de uma resposta da C1, para as mensagens de falha NOMEAREM os atos vistos.
  const resumir = (corpo) => JSON.stringify(corpo.itens.map((i) => ({
    id: i.id, acao: i.acao, acao_rotulo: i.acao_rotulo, usuario_nome: i.usuario_nome,
    created_at: i.created_at,
  })));

  // ── Guardas: sem elas o arquivo inteiro pode passar lendo trilha vazia ───────────────────
  await test('[guarda] a tela-contrato EXIGE `configurar` — usuario sem perfil toma 403', async () => {
    setUser({ ...CHAO_DE_FABRICA });
    let res;
    try {
      res = await lerTrilha({ entidade: 'tipo_material' });
    } finally {
      // Sempre restaurado: vazar o usuario deixaria todos os cenarios seguintes lendo 403 —
      // que e exatamente o modo de falha que este arquivo tenta impedir.
      setUser({ ...AUDITOR });
    }
    assert.strictEqual(res.status, 403,
      `a C1 devolveu ${res.status} para usuario SEM perfil (fallback PRODUCAO). Se ela abriu, o `
      + `gate da RN-06 da Etapa 18 caiu: ${JSON.stringify(res.body)}`);
  });

  await test('[guarda] o AUDITOR passa pelos dois gates (escrita e leitura)', async () => {
    const tipo = await criarTipo(uniq('E23 Guarda Trilha '));
    const del = await request(app).delete(`/api/almoxarifado/tipos-material/${tipo.id}`);
    assert.strictEqual(del.status, 200,
      `DELETE recusado (${del.status}) — sem escrita nao ha trilha para ler: ${JSON.stringify(del.body)}`);
    const trilha = await atosNaTrilha('tipo_material', tipo.id);
    // A criacao TAMBEM e auditada, entao a trilha de um tipo criado-e-excluido tem DOIS atos, de
    // verbos diferentes. Sem esta guarda, um cenario que contasse a trilha INTEIRA esperando 1
    // estaria errado por outro motivo — foi o que a primeira execucao deste arquivo mostrou.
    assert.deepStrictEqual(trilha.itens.map((i) => i.acao), ['EXCLUSAO', 'CRIACAO'],
      `a trilha de um tipo criado-e-excluido nao chegou completa a tela-contrato: ${resumir(trilha)}`);
  });

  // ── O cenario que e o motivo da etapa: TIPO DE MATERIAL, excluido DUAS vezes ─────────────
  let atoTipo = null;

  await test('[Step 1] excluir um tipo de material DUAS vezes: a trilha mostra UM ato, nao dois', async () => {
    const nome = uniq('E23 Tipo Trilha ');
    const tipo = await criarTipo(nome);

    const primeira = await request(app).delete(`/api/almoxarifado/tipos-material/${tipo.id}`);
    assert.strictEqual(primeira.status, 200, `1a exclusao: ${JSON.stringify(primeira.body)}`);

    // Estado semeado com valor CONHECIDO antes da assercao de peso: se a 1a exclusao nao tiver
    // aparecido na trilha, o cenario cai AQUI dizendo isso, e nao na assercao final.
    const antes = await atosNaTrilha('tipo_material', tipo.id);
    assert.deepStrictEqual(antes.itens.map((i) => i.acao), ['EXCLUSAO', 'CRIACAO'],
      `setup: depois da 1a exclusao a trilha devia ter a criacao e UMA exclusao — ${resumir(antes)}`);

    const segunda = await request(app).delete(`/api/almoxarifado/tipos-material/${tipo.id}`);
    assert.strictEqual(segunda.status, 200, `2a exclusao: ${JSON.stringify(segunda.body)}`);

    const depois = await atosNaTrilha('tipo_material', tipo.id);
    const exclusoes = depois.itens.filter((i) => i.acao === 'EXCLUSAO');

    // GUARDA ANTI-TESTE-VAZIO: "nao mostra duas exclusoes" passaria com a trilha vazia. Antes de
    // negar o segundo ato, exija o primeiro.
    assert.ok(exclusoes.length >= 1,
      `a tela-contrato devolveu ZERO exclusao para tipo_material ${tipo.id} — filtro errado, gate `
      + `barrando ou nada gravado. A assercao de "uma exclusao so" logo abaixo passaria provando `
      + `nada. Trilha lida: ${resumir(depois)}`);

    // ASSERCAO DE PESO, e ela vem ANTES de qualquer checagem do corpo do DELETE (ver cabecalho).
    assert.strictEqual(exclusoes.length, 1,
      `QUEM AUDITA ve ${exclusoes.length} exclusoes do tipo de material ${tipo.id}, e so houve UM `
      + `ato de verdade: a 2a exclusao virou linha na trilha sem ter mudado nada no cadastro — `
      + resumir({ itens: exclusoes }));
    // E a trilha INTEIRA da entidade nao pode ter crescido por nenhum outro verbo.
    assert.deepStrictEqual(depois.itens.map((i) => i.acao), ['EXCLUSAO', 'CRIACAO'],
      `a 2a exclusao acrescentou ato a trilha do tipo ${tipo.id}: ${resumir(depois)}`);

    atoTipo = { item: exclusoes[0], tipo, nome };

    // Contrato da Task 2, conferido depois da trilha.
    assert.strictEqual(segunda.body.ja_inativo, true,
      `esperado ja_inativo no corpo da 2a exclusao, veio ${JSON.stringify(segunda.body)}`);
  });

  await test('[Step 1] o ato lido traz o vocabulario e o `alteracoes` que a tela mostra (tipo_material)', async () => {
    assert.ok(atoTipo, 'o cenario anterior nao produziu ato — este aqui nao tem o que conferir');
    const { item, tipo, nome } = atoTipo;

    assert.strictEqual(item.acao, 'EXCLUSAO', `verbo cru errado: ${item.acao}`);
    assert.strictEqual(item.acao_rotulo, 'Exclusão', `acao_rotulo errado: ${item.acao_rotulo}`);
    assert.strictEqual(item.entidade_rotulo, 'Tipo de material', `entidade_rotulo errado: ${item.entidade_rotulo}`);
    assert.strictEqual(item.entidade_id, tipo.id, 'a linha lida nao e a do tipo excluido');
    assert.strictEqual(item.usuario_id, AUDITOR.id, 'a linha nao carrega quem fez o ato');

    // `dados_anteriores` da rota e a linha INTEIRA (SELECT *); `dados_novos` e `{ ativo: 0 }`.
    // A regua de leitura e a UNIAO das chaves, sem filtro de igualdade — entao as 10 colunas de
    // contexto aparecem com `para: null`. Isso e o que esta GRAVADO, dito sem invencao (a
    // decisao esta no cabecalho de auditLabels.js). Congelar o CONJUNTO impede que "enxugar o
    // contexto" aconteca em silencio.
    assert.deepStrictEqual(item.alteracoes.map((a) => a.campo), [
      'id', 'nome', 'descricao', 'icone', 'cor', 'requer_assinatura', 'requer_termo',
      'is_epi', 'is_controlado', 'ativo', 'created_at',
    ], `conjunto de campos de \`alteracoes\` fora do contrato: ${JSON.stringify(item.alteracoes)}`);

    // A UNICA mudanca de verdade do ato.
    assert.deepStrictEqual(item.alteracoes.find((a) => a.campo === 'ativo'),
      { campo: 'ativo', de: 1, para: 0 },
      `o de/para do \`ativo\` e o ato em si: ${JSON.stringify(item.alteracoes.find((a) => a.campo === 'ativo'))}`);
    assert.deepStrictEqual(item.alteracoes.find((a) => a.campo === 'nome'),
      { campo: 'nome', de: nome, para: null },
      'o `nome` e contexto: sai do lado "de" e nao aparece no "para"');
    // Nenhum outro campo pode ter ganhado um lado "para" — se ganhasse, a tela renderizaria
    // alteracao que nao houve.
    const comPara = item.alteracoes.filter((a) => a.campo !== 'ativo' && a.para !== null).map((a) => a.campo);
    assert.deepStrictEqual(comPara, [],
      `campo(s) de contexto renderizados como alteracao: ${comPara.join(', ')}`);
  });

  // ── A QUINTA ROTA: material, cujo conserto foi diferente (so a condicao da auditoria) ────
  await test('[Step 1] desativar um material DUAS vezes: a trilha mostra UM ato, nao dois', async () => {
    const familia = await criarFamilia(uniq('E23 Fam Trilha '));
    const codigo = uniq('E23-TRILHA-');
    const mat = await criarMaterial(codigo, familia.id);

    const primeira = await request(app).delete(`/api/almoxarifado/materiais/${mat.id}`);
    assert.strictEqual(primeira.status, 200, `1a desativacao: ${JSON.stringify(primeira.body)}`);

    const antes = await atosNaTrilha('material', mat.id);
    assert.deepStrictEqual(antes.itens.map((i) => i.acao), ['DESATIVACAO', 'CRIACAO'],
      `setup: depois da 1a desativacao a trilha devia ter a criacao e UMA desativacao — ${resumir(antes)}`);

    const segunda = await request(app).delete(`/api/almoxarifado/materiais/${mat.id}`);
    assert.strictEqual(segunda.status, 200, `2a desativacao: ${JSON.stringify(segunda.body)}`);

    const depois = await atosNaTrilha('material', mat.id);
    const desativacoes = depois.itens.filter((i) => i.acao === 'DESATIVACAO');

    assert.ok(desativacoes.length >= 1,
      `a tela-contrato devolveu ZERO desativacao para o material ${mat.id} — filtro errado, gate `
      + `barrando ou nada gravado. A assercao de "uma so" logo abaixo passaria provando nada. `
      + `Trilha lida: ${resumir(depois)}`);

    assert.strictEqual(desativacoes.length, 1,
      `QUEM AUDITA ve ${desativacoes.length} desativacoes do material ${mat.id}, e so houve UM ato `
      + `de verdade: a 2a desativacao virou linha na trilha sem ter mudado nada no cadastro — `
      + resumir({ itens: desativacoes }));
    assert.deepStrictEqual(depois.itens.map((i) => i.acao), ['DESATIVACAO', 'CRIACAO'],
      `a 2a desativacao acrescentou ato a trilha do material ${mat.id}: ${resumir(depois)}`);

    const item = desativacoes[0];
    // DESATIVACAO e EXCLUSAO caem no MESMO grupo de rotulo (auditLabels): na tela as duas sao
    // "Exclusão". E por isso que uma DESATIVACAO sem efeito era indistinguivel de uma real —
    // o motivo de a RN-03 ter vencido o comentario que defendia registrar a tentativa.
    assert.strictEqual(item.acao_rotulo, 'Exclusão', `acao_rotulo errado: ${item.acao_rotulo}`);
    assert.strictEqual(item.entidade_rotulo, 'Material', `entidade_rotulo errado: ${item.entidade_rotulo}`);

    // Aqui `dados_anteriores` e `{ ativo: 1 }` e `dados_novos` e `{ ativo: 0, codigo, nome }` —
    // conjunto pequeno e deterministico, entao o contrato inteiro cabe num deepStrictEqual.
    assert.deepStrictEqual(item.alteracoes, [
      { campo: 'ativo', de: 1, para: 0 },
      { campo: 'codigo', de: null, para: codigo },
      { campo: 'nome', de: null, para: `Material ${codigo}` },
    ], `conjunto de alteracoes fora do contrato: ${JSON.stringify(item.alteracoes)}`);

    // Contrato INALTERADO desta rota (Etapa 19): sem `ja_inativo`, mesmo corpo de sempre.
    assert.strictEqual(segunda.body.ja_inativo, undefined,
      `esta rota NAO ganha ja_inativo: ${JSON.stringify(segunda.body)}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
