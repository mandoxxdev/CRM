/**
 * RN-15 (Etapa 36) — `avancar etapa fora de ordem falha`: a régua do workflow do recebimento.
 *
 * Esta é a dívida mais antiga da feature 08: a spec
 * (`specs/modulo-almoxarifado/08-recebimento/README.md`) exige este teste desde **2026-08-11** e o
 * manual 14.2 cita a literal do erro, mas nenhum arquivo de `tests/api/` exercitava a ordem das
 * transições. ZERO linhas de produção nesta task: a Fase 0 mediu por SONDA EXECUTADA que o servidor
 * já recusa —
 *   POST /:id/workflow {acao:'processar'} num EM_CONFERENCIA
 *     -> 400 {"error":"Não é possível \"processar\" no status atual (EM_CONFERENCIA)"}
 *   POST /:id/workflow {acao:'inexistente'}
 *     -> 400 {"error":"Ação de workflow inválida"}
 * O que não existia era a RÉGUA. Este arquivo é a régua.
 *
 * ⚠️ POR QUE A ASSERÇÃO QUE CARREGA O ACHADO É A **LITERAL**, E NÃO O STATUS — e isto é o
 * contrário do que a intuição diz. A barreira de ordem é `if (!t.de.includes(rec.status))` em
 * `avancarWorkflow` (`receiptService.js:378-380`). Se ela desaparecer, `processar` num `RECEBIDO`
 * NÃO passa: cai em `processarNota`, que tem barreira PRÓPRIA
 * (`statusPermitidos = [EM_ENTRADA_NF, ENCAMINHADO_FATURAMENTO]`, `receiptService.js:852-855`) e
 * responde **400** `'Processe a nota somente após entrada no faturamento'`. Ou seja: **o status
 * continua 400 com a barreira sabotada**. Um cenário que afirmasse só `res.status === 400` seria
 * verde com a régua arrancada — controle positivo no-op. É por isso que o cenário (1) afirma a
 * literal EXATA, com o status atual dentro dela: ela é a única coisa que distingue "a ordem foi
 * checada" de "o handler recusou por outro motivo".
 *
 * ⚠️ E POR QUE O CENÁRIO (3) EXISTE: sem ele, um `throw` incondicional no topo de `avancarWorkflow`
 * passaria os DOIS negativos com louvor. A metade positiva (regra (i) deste plano) é a sequência
 * completa respondendo 200 CINCO vezes, afirmando o status devolvido em CADA passo — é o que prova
 * que a régua mede o conjunto `de` de cada transição, e não uma recusa geral.
 *
 * Executar: cd server && node tests/api/recebimentoWorkflowOrdem.api.test.js
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

// (iii) Nenhum id de fixture `1`: o usuario de teste segue a numeracao de
// `minhasPermissoes.api.test.js`, e todo id de recebimento e LIDO do banco/da resposta.
const ADMIN = { id: 64, nome: 'Admin Workflow E36', role: 'admin' };

// As literais congeladas do contrato 4 do plano. Escritas como funcao porque o status entra na
// mensagem — e e exatamente esse pedaco que prova que a barreira de ordem foi a autora do 400.
const foraDeOrdem = (acao, status) => `Não é possível "${acao}" no status atual (${status})`;
const ACAO_INVALIDA = 'Ação de workflow inválida';
const NAO_ENCONTRADO = 'Recebimento não encontrado';

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  const material = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('E36-WF','Perfil E36 WF','UN',0,1)`);

  // Cada recebimento nasce com NF PROPRIA: a guarda de duplicata da T2 nao dispara sem fornecedor
  // (`assertNotaNaoDuplicada`, `receiptService.js:148`), mas depender disso acoplaria este arquivo
  // a uma regra de OUTRA task — se um dia a chave passar a considerar so a NF, este arquivo nao
  // fica vermelho por motivo alheio.
  let seqNf = 0;
  async function novoRecebimento() {
    seqNf += 1;
    const res = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL',
      nota_fiscal: `NF-E36-WF-${seqNf}`,
      itens: [{ material_id: material.lastID, quantidade: 6 }],
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'RECEBIDO', 'fixture: todo recebimento nasce em RECEBIDO');
    return res.body.id;
  }

  const workflow = (id, acao) => request(app)
    .post(`/api/almoxarifado/recebimentos/${id}/workflow`).send({ acao });

  const statusNoBanco = async (id) => (await dbGet(db,
    'SELECT status, etapa_atual FROM recebimentos_material_almoxarifado WHERE id = ?', [id]));

  await test('(1) processar em RECEBIDO e recusado com a literal do manual', async () => {
    const id = await novoRecebimento();

    const res = await workflow(id, 'processar');
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    // ⚠️ ESTA e a assercao que carrega o achado. O 400 acima sobrevive a arrancar a barreira de
    // ordem (a barreira de `processarNota` responde 400 tambem); a literal com `(RECEBIDO)` dentro
    // NAO sobrevive. Ver o cabecalho deste arquivo.
    assert.strictEqual(res.body.error, foraDeOrdem('processar', 'RECEBIDO'));

    // E nada andou: recusa fora de ordem nao pode ter efeito colateral de estado.
    const depois = await statusNoBanco(id);
    assert.strictEqual(depois.status, 'RECEBIDO', 'a recusa nao pode ter mexido no status');

    // A segunda metade da regua de POSICAO: o passo LEGITIMO a partir de RECEBIDO responde 200.
    // Sem isto, "processar recusa em RECEBIDO" tambem passaria com o workflow inteiro quebrado.
    const legitimo = await workflow(id, 'iniciar_conferencia');
    assert.strictEqual(legitimo.status, 200, JSON.stringify(legitimo.body));
    assert.strictEqual(legitimo.body.status, 'EM_CONFERENCIA');

    // E `processar` continua recusado no status NOVO, agora citando-o: a mensagem acompanha o
    // estado real do documento, e nao um texto fixo.
    const res2 = await workflow(id, 'processar');
    assert.strictEqual(res2.status, 400, JSON.stringify(res2.body));
    assert.strictEqual(res2.body.error, foraDeOrdem('processar', 'EM_CONFERENCIA'));
  });

  await test('(2) acao inexistente e recusada antes de olhar o status', async () => {
    const id = await novoRecebimento();

    const res = await workflow(id, 'inexistente');
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, ACAO_INVALIDA);

    // "ANTES de olhar o status" nao e retorica: a MESMA acao desconhecida tem de dar a MESMA
    // mensagem generica em outro status. Se a checagem de acao viesse depois da de ordem, aqui
    // sairia `Nao e possivel "inexistente" no status atual (EM_CONFERENCIA)`.
    assert.strictEqual((await workflow(id, 'iniciar_conferencia')).status, 200);
    const res2 = await workflow(id, 'inexistente');
    assert.strictEqual(res2.status, 400, JSON.stringify(res2.body));
    assert.strictEqual(res2.body.error, ACAO_INVALIDA);
    assert.strictEqual((await statusNoBanco(id)).status, 'EM_CONFERENCIA',
      'acao invalida nao pode mexer no status');

    // A ORDEM DAS CHECAGENS TAMBEM E CONTRATO: o documento e buscado ANTES da acao, logo id
    // inexistente com acao VALIDA responde 404 — nao 400. Id lido do banco (+1000), nunca `1`.
    const maior = await dbGet(db,
      'SELECT COALESCE(MAX(id), 0) AS m FROM recebimentos_material_almoxarifado');
    const fantasma = maior.m + 1000;
    const res404 = await workflow(fantasma, 'processar');
    assert.strictEqual(res404.status, 404, JSON.stringify(res404.body));
    assert.strictEqual(res404.body.error, NAO_ENCONTRADO);
  });

  await test('(3) POSITIVO: a sequencia completa responde 200 CINCO vezes', async () => {
    const id = await novoRecebimento();

    // A sequencia legitima do manual, passo a passo, com o status devolvido afirmado em CADA um.
    // Um `throw` incondicional em `avancarWorkflow` passaria (1) e (2) e morreria aqui.
    const sequencia = [
      ['iniciar_conferencia', 'EM_CONFERENCIA', 'ALMOXARIFADO'],
      ['finalizar_conferencia', 'CONFERIDO_ALMOX', 'ALMOXARIFADO'],
      ['encaminhar_compras', 'EM_COMPRAS', 'COMPRAS'],
      ['finalizar_compras', 'ENCAMINHADO_FATURAMENTO', 'FATURAMENTO'],
      ['iniciar_faturamento', 'EM_ENTRADA_NF', 'FATURAMENTO'],
    ];

    let passos = 0;
    for (const [acao, statusEsperado, etapaEsperada] of sequencia) {
      const res = await workflow(id, acao);
      assert.strictEqual(res.status, 200, `${acao}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.success, true, `${acao}: sem success`);
      assert.strictEqual(res.body.status, statusEsperado, `${acao}: status devolvido`);
      assert.strictEqual(res.body.etapa_atual, etapaEsperada, `${acao}: etapa devolvida`);
      // O status devolvido tem de ser o GRAVADO — a resposta nao pode prometer o que o UPDATE
      // nao fez (a resposta vem de `t.para`, nao de uma releitura do banco).
      const banco = await statusNoBanco(id);
      assert.strictEqual(banco.status, statusEsperado, `${acao}: status no banco`);
      assert.strictEqual(banco.etapa_atual, etapaEsperada, `${acao}: etapa no banco`);
      passos += 1;
    }
    assert.strictEqual(passos, 5, 'a sequencia tem de ter avancado CINCO vezes');

    // Fecha a regua pelo outro lado: em EM_ENTRADA_NF, quem esta fora de ordem agora e o PRIMEIRO
    // passo. A barreira nao e "do processar" — e de cada transicao.
    const volta = await workflow(id, 'iniciar_conferencia');
    assert.strictEqual(volta.status, 400, JSON.stringify(volta.body));
    assert.strictEqual(volta.body.error, foraDeOrdem('iniciar_conferencia', 'EM_ENTRADA_NF'));
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
