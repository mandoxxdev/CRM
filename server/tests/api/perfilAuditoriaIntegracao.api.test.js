/**
 * Etapa 24, Task 4 — INTEGRACAO: conceder e REVOGAR perfil aparecem na tela de auditoria.
 *
 * As Tasks 1-3 sao verdes por UNIDADE. `perfisUsuario.api.test.js` prova que o PUT grava linha
 * na tabela `auditoria_log_almoxarifado` (RN-06), mas prova isso lendo a tabela por `dbGet` —
 * o que NAO e o que a tela faz. Este arquivo fecha o outro lado: escreve pelas rotas REAIS
 * (`PUT /perfis-usuario/:id`, duas vezes: atribuir e depois revogar) e le pela TELA-CONTRATO
 * (`GET /auditoria?entidade=perfil_almoxarifado_usuario`, a C1 da Etapa 22), que e a rota que a
 * tela de auditoria consome. RN-05 (o ato aparece na trilha) + RN-06 (com o de/para).
 *
 * ── Tres armadilhas conhecidas, e o que este arquivo faz com cada uma ────────────────────────
 *
 * 1. NAO SE AFIRMA `total === N`. O plano da Etapa 23 errou exatamente assim, e a Task 2 avisou:
 *    um par atribuir+revogar rende DUAS linhas para o MESMO `entidade_id`, e a leitura da tela
 *    e por `entidade`, sem `entidade_id` — ou seja, ela traz o que qualquer outro ato de perfil
 *    tiver acumulado. O que se afirma aqui e a COMPOSICAO: quais verbos, em que ordem, para o
 *    usuario alvo. Contagem fixa e a forma de escrever um teste que quebra por motivo errado
 *    (outro cenario acrescenta um ato) e passa pelo motivo errado (dois atos somam N por acaso).
 *
 * 2. GUARDA ANTI-TESTE-VAZIO. A leitura da trilha e conferida DEPOIS DA ATRIBUICAO e ANTES DE
 *    REVOGAR: se a C1 nao devolvesse nem o primeiro ato (gate errado, filtro errado, entidade
 *    escrita com outro nome), o cenario cai ali, dizendo QUE A LEITURA NAO FUNCIONA — em vez de
 *    seguir e "provar" a ausencia do segundo ato numa lista que estava vazia desde o inicio.
 *    Cenario que afirma presenca so vale depois que a leitura provou trazer alguma coisa.
 *
 * 3. O LEITOR PRECISA DE PERFIL, NAO DE `role`. `GET /auditoria` esta atras de
 *    `requirePermission('configurar')`, resolvido por `getPerfilFromUser` — daí o usuario do
 *    harness ser `is_superadmin: 1` (o caminho mais curto e mais estavel para ADMINISTRADOR,
 *    `systemPermissions.isSuperAdmin`), e nao um `role: 'admin'` cru.
 *
 * ── O de/para, e por que a assercao e o CONJUNTO INTEIRO ─────────────────────────────────────
 *
 * `auditLabels.alteracoesDaLinha` e UNIAO DE CHAVES sem filtro de igualdade: chave presente so
 * de um lado sai como `null -> valor`, fingindo alteracao que nao houve (foi o que aconteceu com
 * `codigo`/`nome` da foto de material, congelado em `auditoriaFluxoCompleto`). A Task 2 gravou
 * os DOIS lados com a MESMA forma (`{usuario, perfil, perfil_efetivo, origem}`) justamente para
 * que isso nao acontecesse aqui. Conferir so o campo `perfil` deixaria essa decisao sem prova:
 * a assercao e o array inteiro, com `deepStrictEqual`, e `usuario` aparecendo com `de === para`
 * e a evidencia de que nenhuma chave esta entrando por um lado so.
 *
 * ── Divergencia declarada do plano ───────────────────────────────────────────────────────────
 * Nao ha "teste que falha primeiro" nesta task: ela nao cria codigo de producao, so cruza o que
 * as Tasks 1-3 entregaram. O papel do vermelho e cumprido pelo CONTROLE POSITIVO com alvo
 * (desligar a auditoria da revogacao), registrado no commit.
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

// `is_superadmin: 1` — ver a armadilha 3 do cabecalho.
const AUDITOR = {
  id: 11, nome: 'Gestora De Acessos', email: 'acessos@t.com', role: 'admin', is_superadmin: 1,
};

// O alvo: um usuario comum, sem perfil explicito, que vai receber QUALIDADE (o perfil que a
// Task 1 criou) e depois perde-lo. QUALIDADE de proposito: amarra as duas pontas da etapa —
// se o perfil sumisse de `PERFIS_VALIDOS`, o PUT daria 400 e este arquivo cairia junto.
const ALVO = { id: 200, nome: 'Inspetora Da Qualidade', email: 'qualidade@t.com' };

const ENTIDADE = 'perfil_almoxarifado_usuario';

(async () => {
  const { app, db, close } = await createTestApp({ user: { ...AUDITOR } });

  // `usuarios` e do app principal; o harness monta so o schema do modulo.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY, nome TEXT, email TEXT, role TEXT,
    is_superadmin INTEGER DEFAULT 0, admin_modulos TEXT DEFAULT '[]',
    ativo INTEGER DEFAULT 1, is_oculto INTEGER DEFAULT 0
  )`);
  await dbRun(db,
    `INSERT INTO usuarios (id, nome, email, role, is_superadmin, admin_modulos, ativo, is_oculto)
     VALUES (?,?,?,'usuario',0,'[]',1,0)`, [ALVO.id, ALVO.nome, ALVO.email]);

  // A LEITURA e sempre pela C1, com a query EXATA da tela (`entidade`, sem `entidade_id`) —
  // nunca por SELECT direto: sao os campos DERIVADOS dela (`alteracoes`, `acao_rotulo`,
  // `entidade_rotulo`) que esta task cruza.
  const lerTrilhaDaTela = () => request(app).get('/api/almoxarifado/auditoria')
    .query({ entidade: ENTIDADE });
  const atosDoAlvo = (body) => body.itens.filter((i) => Number(i.entidade_id) === ALVO.id);

  const trocarPerfil = (perfil) => request(app)
    .put(`/api/almoxarifado/perfis-usuario/${ALVO.id}`).send({ perfil });

  // Semeadura com valor CONHECIDO: sem a guarda de trilha vazia, "apareceram 2 atos" poderia
  // estar contando lixo herdado de outro cenario.
  await test('[arranjo] a trilha do alvo comeca vazia', async () => {
    const c = await dbGet(db,
      `SELECT COUNT(*) as c FROM auditoria_log_almoxarifado WHERE entidade = ? AND entidade_id = ?`,
      [ENTIDADE, ALVO.id]);
    assert.strictEqual(c.c, 0, `semeadura falhou: a trilha do alvo comecou com ${c.c} linha(s)`);
  });

  // ═══ Guarda anti-teste-vazio: a leitura tem de trazer o PRIMEIRO ato antes de qualquer
  //     afirmacao sobre o segundo (armadilha 2 do cabecalho). ═══

  let atoConcessao = null;

  await test('[RN-05] conceder QUALIDADE por rota real aparece na tela de auditoria, com autor', async () => {
    const put = await trocarPerfil('QUALIDADE');
    assert.strictEqual(put.status, 200, `PUT de concessao: ${JSON.stringify(put.body)}`);
    assert.strictEqual(put.body.perfil_efetivo, 'QUALIDADE', JSON.stringify(put.body));

    const res = await lerTrilhaDaTela();
    assert.strictEqual(res.status, 200,
      `a C1 respondeu ${res.status} para quem tem perfil ADMINISTRADOR: ${JSON.stringify(res.body)}`);
    const meus = atosDoAlvo(res.body);
    // ESTA e a guarda: sem ela, o cenario da revogacao afirmaria coisas sobre uma lista vazia.
    assert.strictEqual(meus.length, 1,
      `a tela de auditoria nao enxergou a concessao de perfil: ${meus.length} ato(s) para o alvo`);

    atoConcessao = meus[0];
    assert.strictEqual(atoConcessao.acao, 'ATUALIZAR', `verbo cru errado: ${atoConcessao.acao}`);
    assert.strictEqual(atoConcessao.acao_rotulo, 'Edição', `acao_rotulo: ${atoConcessao.acao_rotulo}`);
    assert.strictEqual(atoConcessao.entidade_rotulo, 'Perfil de usuário',
      `entidade_rotulo: ${atoConcessao.entidade_rotulo}`);
    // Quem concedeu acesso ao modulo e a informacao mais importante desta linha.
    assert.strictEqual(atoConcessao.usuario_id, AUDITOR.id, 'a trilha nao diz QUEM concedeu');
    assert.strictEqual(atoConcessao.usuario_nome, AUDITOR.nome, 'a trilha nao diz o NOME de quem concedeu');
  });

  await test('[RN-06] a concessao mostra o de/para inteiro — e nenhuma chave entra por um lado so', async () => {
    assert.ok(atoConcessao, 'o cenario anterior nao produziu o ato — este nao tem o que conferir');
    // Union de chaves sem filtro de igualdade (ver cabecalho): `usuario` aparece com `de === para`
    // porque a Task 2 grava os dois lados com a MESMA forma. Se um dos lados perdesse uma chave,
    // ela sairia aqui como `null -> valor` e a tela mostraria alteracao que nao houve.
    assert.deepStrictEqual(atoConcessao.alteracoes, [
      { campo: 'usuario', de: ALVO.nome, para: ALVO.nome },
      { campo: 'perfil', de: null, para: 'QUALIDADE' },
      { campo: 'perfil_efetivo', de: 'PRODUCAO', para: 'QUALIDADE' },
      { campo: 'origem', de: 'padrao', para: 'explicito' },
    ], `de/para da concessao fora do contrato: ${JSON.stringify(atoConcessao.alteracoes)}`);
  });

  // ═══ Agora sim: o segundo ato. ═══

  await test('[RN-06] revogar o perfil aparece na trilha como um ato PROPRIO (COMPOSICAO, nao total)', async () => {
    assert.ok(atoConcessao, 'sem a concessao lida, a revogacao nao tem contra o que ser comparada');

    const put = await trocarPerfil('');
    assert.strictEqual(put.status, 200, `PUT de revogacao: ${JSON.stringify(put.body)}`);
    assert.strictEqual(put.body.origem, 'padrao', `contrato C2 mudou: ${JSON.stringify(put.body)}`);

    const res = await lerTrilhaDaTela();
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const meus = atosDoAlvo(res.body);

    // COMPOSICAO, nao `total === 2`: a query da tela e por `entidade` e traz o que outros
    // usuarios acumularem. O que importa e QUAIS verbos o alvo tem e EM QUE ORDEM — a C1 ordena
    // `created_at DESC, id DESC`, entao a revogacao vem primeiro.
    assert.deepStrictEqual(meus.map((i) => i.acao), ['EXCLUSAO', 'ATUALIZAR'],
      `a composicao da trilha do alvo esta errada — falta a revogacao? veio ${JSON.stringify(meus.map((i) => i.acao))}`);
    assert.deepStrictEqual(meus.map((i) => i.acao_rotulo), ['Exclusão', 'Edição'],
      `os rotulos da tela: ${JSON.stringify(meus.map((i) => i.acao_rotulo))}`);

    const revogacao = meus[0];
    assert.strictEqual(revogacao.usuario_id, AUDITOR.id, 'a trilha nao diz QUEM revogou');
    assert.strictEqual(revogacao.usuario_nome, AUDITOR.nome, 'a trilha nao diz o NOME de quem revogou');
    // O de/para espelhado da concessao: o que entrou por ATUALIZAR sai por EXCLUSAO.
    assert.deepStrictEqual(revogacao.alteracoes, [
      { campo: 'usuario', de: ALVO.nome, para: ALVO.nome },
      { campo: 'perfil', de: 'QUALIDADE', para: null },
      { campo: 'perfil_efetivo', de: 'QUALIDADE', para: 'PRODUCAO' },
      { campo: 'origem', de: 'explicito', para: 'padrao' },
    ], `de/para da revogacao fora do contrato: ${JSON.stringify(revogacao.alteracoes)}`);

    // O ato antigo nao foi reescrito no caminho — a trilha e append-only, e a linha da concessao
    // continua contando a historia dela.
    assert.strictEqual(meus[1].id, atoConcessao.id,
      'a linha da concessao mudou de identidade — a trilha deveria ser append-only');
  });

  await test('[RN-05] o verbo da revogacao e filtravel na tela (`acao=EXCLUSAO` acha o ato)', async () => {
    // A Task 2 escolheu EXCLUSAO em vez de inventar um verbo novo justamente porque ele ja esta
    // nos grupos do `auditLabels` — ou seja, o filtro "Exclusão" da tela alcanca a revogacao.
    // Sem este cenario, "escolhemos um verbo filtravel" seria afirmacao sem prova.
    const res = await request(app).get('/api/almoxarifado/auditoria')
      .query({ entidade: ENTIDADE, entidade_id: ALVO.id, acao: 'EXCLUSAO' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body.itens.map((i) => i.acao), ['EXCLUSAO'],
      `o filtro por verbo nao isolou a revogacao: ${JSON.stringify(res.body.itens.map((i) => i.acao))}`);
    // A metade positiva do cenario negativo: o filtro EXCLUI a concessao porque ela tem outro
    // verbo, nao porque a lista veio vazia — e a concessao continua alcancavel pelo verbo dela.
    const outra = await request(app).get('/api/almoxarifado/auditoria')
      .query({ entidade: ENTIDADE, entidade_id: ALVO.id, acao: 'ATUALIZAR' });
    assert.deepStrictEqual(outra.body.itens.map((i) => i.acao), ['ATUALIZAR'],
      `o filtro por ATUALIZAR nao achou a concessao: ${JSON.stringify(outra.body.itens.map((i) => i.acao))}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
