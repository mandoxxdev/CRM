/**
 * Etapa 23, Task 1 (C1) — `PUT /almoxarifado/configuracoes` passa a ser tudo-ou-nada.
 *
 * O DEFEITO (medido na Fase 0 da etapa): a rota gravava **um UPDATE por chave, em sequencia**
 * (`routes/almoxarifado.js:2506-2511`) e chamava `registrarAuditoria` DEPOIS do laco. A tela
 * manda as 18 chaves a cada Salvar. Falhando o 3o UPDATE:
 *   - as duas primeiras chaves JA estao gravadas;
 *   - o `catch` responde 500;
 *   - a auditoria NUNCA roda (o `try` foi abortado antes dela).
 * Ou seja: configuracao alterada, usuario ve erro, e a trilha nao tem uma linha sequer — a pior
 * combinacao possivel numa etapa cujo tema e o log nao mentir, e que a tela de auditoria da
 * Etapa 22 agora expoe como ausencia.
 *
 * O CONSERTO (RN-01) NAO E TRANSACAO, e isso e o ponto mais contraintuitivo desta etapa:
 * `server/index.js:1026` abre UMA UNICA conexao SQLite para o CRM inteiro, e transacao em SQLite
 * e por CONEXAO, nao por requisicao. Entre um `BEGIN` e um `COMMIT` desta rota, a escrita de
 * qualquer outra requisicao em voo entraria na MINHA transacao — e o meu `ROLLBACK`, disparado
 * por falha ao salvar configuracao, desfaria a movimentacao de estoque de outra pessoa.
 * (A Fase 2 reproduziu isso, inclusive que `db.serialize()` NAO salva: ele ordena a fila, nao da
 * exclusividade.) A atomicidade vem de UM `UPDATE` SO, com `CASE chave WHEN ... THEN ...`,
 * porque o SQLite e atomico POR STATEMENT — sem prender a conexao.
 *
 * RN-02, com o enunciado JA CORRIGIDO pela Fase 2 (achado A5): esta etapa NAO promete
 * "escrita que aconteceu tem rastro" — `registrarAuditoria` roda num try/catch que engole o erro
 * e a rota responde 200 mesmo se o log falhar (best-effort, decidido na Etapa 19: o UPDATE ja foi
 * commitado, derrubar a resposta por causa do log nao desfaz nada). O que a etapa garante e a
 * outra metade, que hoje e falsa: **o 500 descreve um banco intocado**.
 *
 * DUAS ARMADILHAS DESTE ARQUIVO, medidas pela Fase 2 — leia antes de mexer:
 *
 * 1. **O patch de `db.run` tem de ser SELETIVO PELA 3a CHAVE** (achado A3). Um patch ingenuo,
 *    que lance em QUALQUER `UPDATE configuracoes_almoxarifado`, nao sabe distinguir os dois
 *    codigos: no laco antigo o PRIMEIRO UPDATE ja lanca, o banco fica limpo do mesmo jeito, e o
 *    controle positivo passaria VERDE deixando sem prova exatamente a assercao que interessa.
 *    Contagem de chamadas tambem nao serve: no codigo corrigido existe UMA chamada so.
 *    Lancando so quando os params carregam a 3a chave: UPDATE unico -> nada gravado (os params
 *    do statement unico ja contem as tres chaves); laco -> as duas primeiras gravadas.
 *
 * 2. **O caminho feliz precisa de valores DIFERENTES dos que estao no banco** (achado A9): a
 *    auditoria so e gravada `if (Object.keys(diff.novos).length)` (`:2525`), entao reenviar o
 *    valor que ja esta la produz ZERO linhas e o cenario falharia por motivo alheio a RN-01.
 *
 * As tres chaves usadas sao `notificacoes_dest_*` — semeadas (a rota so grava chave que ja
 * existe) e de TEXTO LIVRE, entao nenhuma cai nas validacoes de dias/inteiro/booleano/segredo
 * que rodam antes da escrita. O que se prova aqui e a gravacao, nao a validacao.
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

const CHAVE_1 = 'notificacoes_dest_entradas';
const CHAVE_2 = 'notificacoes_dest_saidas';
const CHAVE_3 = 'notificacoes_dest_ajustes'; // a 3a — e o alvo do patch seletivo
const CHAVES = [CHAVE_1, CHAVE_2, CHAVE_3];

(async () => {
  // `denyUnlessAlmoxAdmin` -> `canConfigureAlmox` NAO aceita `role: 'admin'` puro
  // (systemPermissions.js:76-83): so `is_superadmin`, admin de modulo ou
  // `perfil_almoxarifado: 'ADMINISTRADOR'`. Com o usuario default do harness esta rota daria 403
  // em TODOS os cenarios e o arquivo passaria provando nada sobre a gravacao.
  const { app, db, close } = await createTestApp({
    user: { id: 42, nome: 'Super Config', email: 'config@test.com', is_superadmin: 1 },
  });

  const valorDe = (chave) => dbGet(db,
    'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [chave])
    .then((r) => (r ? r.valor : undefined));

  // Retrato "chave=valor" das tres, na ordem — e o que nomeia QUAL chave ficou gravada quando a
  // assercao cai (o controle positivo depende disso para ser legivel).
  const retrato = async () => {
    const out = [];
    for (const c of CHAVES) out.push(`${c}=${await valorDe(c)}`);
    return out;
  };

  const semearConhecido = async (a, b, c) => {
    const valores = [a, b, c];
    for (let i = 0; i < CHAVES.length; i++) {
      await dbRun(db, 'UPDATE configuracoes_almoxarifado SET valor = ? WHERE chave = ?',
        [valores[i], CHAVES[i]]);
    }
    // GUARDA ANTI-TESTE-VAZIO: antes de qualquer afirmacao de "nada mudou", provar que as chaves
    // EXISTEM e estao com o valor que eu acho que estao. Sem isto, uma chave inexistente (ou uma
    // tabela vazia) faria "nada mudou" passar sem que a rota tivesse feito coisa alguma.
    assert.deepStrictEqual(await retrato(), CHAVES.map((k, i) => `${k}=${valores[i]}`),
      'setup: as tres chaves precisam EXISTIR com o valor semeado antes do cenario');
  };

  const linhasConfig = () => dbAll(db,
    `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'configuracao' ORDER BY id`);

  const salvar = (corpo) => request(app).put('/api/almoxarifado/configuracoes').send(corpo);

  // ══════════════ RN-01 — caminho feliz: as tres gravam, UMA linha de auditoria ══════════════

  await test('[RN-01] salvar 3 chaves -> 200, as tres com o valor NOVO e uma linha de auditoria', async () => {
    await semearConhecido('antes-A', 'antes-B', 'antes-C');
    const antesAudit = (await linhasConfig()).length;

    // Valores DIFERENTES dos atuais de proposito (achado A9): o diff vazio nao gera auditoria.
    const res = await salvar({
      [CHAVE_1]: 'novo-a@x.com', [CHAVE_2]: 'novo-b@x.com', [CHAVE_3]: 'novo-c@x.com',
    });
    assert.strictEqual(res.status, 200, `esperava 200, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.deepStrictEqual(await retrato(),
      [`${CHAVE_1}=novo-a@x.com`, `${CHAVE_2}=novo-b@x.com`, `${CHAVE_3}=novo-c@x.com`],
      'as tres chaves tinham de estar com o valor novo');

    const depois = await linhasConfig();
    assert.strictEqual(depois.length, antesAudit + 1,
      `esperava UMA linha de auditoria nova, veio ${depois.length - antesAudit}`);
    const novos = JSON.parse(depois[depois.length - 1].dados_novos);
    assert.deepStrictEqual(Object.keys(novos).sort(), [...CHAVES].sort(),
      `a linha de auditoria tinha de trazer o diff das TRES chaves: ${depois[depois.length - 1].dados_novos}`);
  });

  // ══════════ RN-01/RN-02 — falha no meio: nada gravado, nenhum rastro (O CENARIO) ══════════

  await test('[RN-01] falha na gravacao da 3a chave -> 500 e NENHUMA chave alterada', async () => {
    await semearConhecido('A', 'B', 'C');
    const antesAudit = (await linhasConfig()).length;

    const runOriginal = db.run;
    let disparos = 0;
    // Alvo: a INSTANCIA do banco, que e o 1o argumento de `dbRun(db, ...)` — patchar o MODULO
    // nao alcanca, porque `routes/almoxarifado.js:35` desestrutura `const { dbRun }` e o binding
    // fica cacheado no require (tecnica estabelecida em fotoMaterialRastro.api.test.js).
    // SELETIVO PELA 3a CHAVE, nao por SQL: ver a armadilha 1 no cabecalho.
    db.run = function (sql, params, cb) {
      const ehConfig = typeof sql === 'string' && sql.includes('UPDATE configuracoes_almoxarifado');
      if (ehConfig && Array.isArray(params) && params.includes(CHAVE_3)) {
        disparos++;
        const callback = typeof params === 'function' ? params : cb;
        return callback(new Error('SQLITE_FULL: disco cheio simulado na 3a chave'));
      }
      return runOriginal.apply(this, arguments);
    };

    try {
      const res = await salvar({ [CHAVE_1]: '1', [CHAVE_2]: '2', [CHAVE_3]: '3' });
      assert.strictEqual(res.status, 500, `esperava 500, veio ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(disparos > 0, 'o patch nunca disparou — o cenario nao provaria nada');

      // A ASSERCAO DE PESO desta suite. O status sozinho ja era 500 ANTES do conserto; o que a
      // Etapa 23 muda e o estado do banco por tras dele.
      assert.deepStrictEqual(await retrato(), [`${CHAVE_1}=A`, `${CHAVE_2}=B`, `${CHAVE_3}=C`],
        'o 500 tem de descrever um banco INTOCADO — alguma chave foi gravada mesmo com a falha');

      // RN-02 (metade que a etapa garante): escrita que nao aconteceu nao deixa rastro.
      assert.strictEqual((await linhasConfig()).length, antesAudit,
        'nao pode existir linha de auditoria para uma gravacao que nao aconteceu');
    } finally {
      db.run = runOriginal;
    }
  });

  // Depois de restaurar o `db.run`, a rota volta a funcionar: sem isto, um patch que vazasse do
  // `finally` deixaria os cenarios seguintes (de outra pessoa, um dia) vermelhos por setup.
  await test('[RN-01] com o db.run restaurado, salvar volta a gravar normalmente', async () => {
    await semearConhecido('X', 'Y', 'Z');
    const res = await salvar({ [CHAVE_1]: 'ok-1', [CHAVE_2]: 'ok-2', [CHAVE_3]: 'ok-3' });
    assert.strictEqual(res.status, 200, `esperava 200, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.deepStrictEqual(await retrato(),
      [`${CHAVE_1}=ok-1`, `${CHAVE_2}=ok-2`, `${CHAVE_3}=ok-3`], 'a rota nao voltou ao normal');
  });

  // ══════════ O UPDATE unico nao pode gravar quem NAO foi pedido (regressao do CASE) ══════════
  // Um `CASE` sem `ELSE` devolve NULL para chave que nao casou; se o `WHERE chave IN (...)`
  // fosse esquecido ou frouxo, TODA a tabela viraria NULL num Salvar de tres chaves. Este
  // cenario e o que segura isso.

  await test('[RN-01] salvar 2 chaves nao encosta na 3a nem em outra configuracao', async () => {
    await semearConhecido('P', 'Q', 'R');
    // A chave de controle e SEMEADA aqui, nao apenas lida. Medido no controle positivo desta
    // task: com o `WHERE chave IN` frouxo (`OR 1=1`), o CASE sem ELSE ja tinha zerado esta chave
    // nos cenarios ANTERIORES, e o cenario caia na guarda de setup — a assercao de peso ficava
    // encoberta. Semeando, a guarda so pega banco vazio/chave inexistente (o defeito que ela
    // existe para pegar) e quem cai e a assercao que interessa.
    const TOLERANCIA_CONTROLE = '7';
    await dbRun(db, 'UPDATE configuracoes_almoxarifado SET valor = ? WHERE chave = ?',
      [TOLERANCIA_CONTROLE, 'tolerancia_inventario_percentual']);
    const toleranciaAntes = await valorDe('tolerancia_inventario_percentual');
    assert.strictEqual(toleranciaAntes, TOLERANCIA_CONTROLE,
      'setup: a chave de controle precisa EXISTIR com o valor semeado');

    const res = await salvar({ [CHAVE_1]: 'so-1', [CHAVE_2]: 'so-2' });
    assert.strictEqual(res.status, 200, `esperava 200, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.deepStrictEqual(await retrato(), [`${CHAVE_1}=so-1`, `${CHAVE_2}=so-2`, `${CHAVE_3}=R`],
      'a 3a chave nao foi enviada e nao podia ter mudado');
    assert.strictEqual(await valorDe('tolerancia_inventario_percentual'), toleranciaAntes,
      'uma configuracao fora do payload mudou — o WHERE chave IN nao esta segurando o CASE');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
