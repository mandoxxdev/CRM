/**
 * RN-12/13/14 (Etapa 36) — a mesma nota fiscal do mesmo fornecedor nao entra duas vezes, nas DUAS
 * portas de escrita do recebimento.
 *
 * Medido por sonda executada na Fase 0 desta etapa: dois `POST /almoxarifado/recebimentos` com a
 * MESMA `nota_fiscal` e o MESMO fornecedor respondiam **201 + 201**; processando as duas, o material
 * era creditado DUAS VEZES (20 em vez de 10) e nasciam DUAS contas a pagar. Ninguem no sistema
 * segurava essa porta.
 *
 * ⚠️ O MODO DE FALHA DESTE ARQUIVO E O TESTE VAZIO. `gerarContaPagar` (`receiptService.js:647-670`)
 * faz `SELECT name FROM sqlite_master ... 'contas_pagar'` e devolve NULL se a tabela nao existe — e
 * NENHUM arquivo de `tests/api/` a cria (medido na Fase 0; o molde do modulo e
 * `server/tests/almoxarifado.test.js:240-243`, que ja a cria, e por isso a afirmacao vale so para
 * `tests/api/`). Sem o CREATE do topo, a assercao "1 conta a pagar" passaria com ZERO dos dois
 * lados: o dano medido (2 contas para a mesma NF) ficaria sem prova.
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

const ADMIN = { id: 66, nome: 'Admin NF Duplicada', role: 'admin' };

const rec = (app) => request(app).post('/api/almoxarifado/recebimentos');
const wf = (app, id, acao) => request(app)
  .post(`/api/almoxarifado/recebimentos/${id}/workflow`).send({ acao });

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  // (Fase 2) O DDL abaixo espelha PRODUCAO (`server/index.js:19299-19311`), inclusive os dois
  // NOT NULL — `descricao` e `valor`. Manter os NOT NULL importa: sem eles um `valor_total_nota`
  // nulo passaria aqui e estouraria em producao, e o teste teria provado o contrario do que existe.
  // Subconjunto minimo das colunas que o INSERT de `gerarContaPagar` usa.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS contas_pagar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL, fornecedor TEXT, valor REAL NOT NULL, data_vencimento DATE,
    data_pagamento DATE, status TEXT DEFAULT 'pendente', categoria TEXT, observacoes TEXT
  )`);

  const fornA = await dbRun(db,
    `INSERT INTO fornecedores (razao_social, cnpj) VALUES ('Forn Dup A','55.555.555/0001-55')`);
  const fornB = await dbRun(db,
    `INSERT INTO fornecedores (razao_social, cnpj) VALUES ('Forn Dup B','66.666.666/0001-66')`);

  async function novoMaterial(codigo) {
    const m = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',0,1)`,
      [codigo, `Chapa ${codigo}`]);
    return m.lastID;
  }

  /**
   * Leva um recebimento de RECEBIDO ate PROCESSADO pelo workflow REAL, passando pelo
   * `PUT /fiscal` com os CINCO campos que `validarDadosProcessamento` (`receiptService.js:359-369`)
   * exige. Sem eles o `processar` recusa com "Preencha antes de processar: …" e o cenario (2)
   * ficaria vermelho pelo motivo errado — nao pelo dano que ele existe para medir.
   *
   * MEDIDO na rodada RED: `fornecedor_id` NAO satisfaz esse validador — ele exige
   * `fornecedor_nome` OU `fornecedor_cnpj` (`:361`), e o `POST` com so o id deixa os dois nulos.
   * A primeira versao deste helper caiu com `400 "Preencha antes de processar: fornecedor (CNPJ ou
   * nome)"`, que e exatamente o "vermelho pelo motivo errado" que o plano manda evitar. Por isso o
   * `PUT /fiscal` daqui manda tambem o NOME; a chave da guarda continua sendo o `fornecedor_id`,
   * que tem preferencia sobre CNPJ e nome.
   */
  async function processarAteOFim(id, { nota_fiscal, fornecedor_id, fornecedor_nome }) {
    for (const acao of ['iniciar_conferencia', 'finalizar_conferencia', 'encaminhar_compras',
      'finalizar_compras', 'iniciar_faturamento']) {
      const r = await wf(app, id, acao);
      assert.strictEqual(r.status, 200, `workflow ${acao} do ${id}: ${JSON.stringify(r.body)}`);
    }
    const fiscal = await request(app).put(`/api/almoxarifado/recebimentos/${id}/fiscal`).send({
      nota_fiscal, fornecedor_id, fornecedor_nome,
      data_emissao_nf: '2026-09-10', data_entrada_nf: '2026-09-11', valor_total_nota: 500,
    });
    assert.strictEqual(fiscal.status, 200, `fiscal do ${id}: ${JSON.stringify(fiscal.body)}`);
    const proc = await wf(app, id, 'processar');
    assert.strictEqual(proc.status, 200, `processar o ${id}: ${JSON.stringify(proc.body)}`);
  }

  const contarContas = async () => (await dbGet(db, 'SELECT COUNT(*) AS n FROM contas_pagar')).n;

  await test('(1) dois POST com a mesma NF e o mesmo fornecedor: o segundo e recusado com 409', async () => {
    const material = await novoMaterial('E36-DUP-1');
    const body = {
      nota_fiscal: 'NF-DUP-1', fornecedor_id: fornA.lastID,
      itens: [{ material_id: material, quantidade: 7 }],
    };
    const res1 = await rec(app).send(body);
    assert.strictEqual(res1.status, 201, JSON.stringify(res1.body));
    const res2 = await rec(app).send(body);
    assert.strictEqual(res2.status, 409, JSON.stringify(res2.body));

    // O numero do documento EXISTENTE vai na mensagem — sem ele o operador nao tem como achar
    // onde a nota ja esta. Lido do banco, nunca escrito a mao (o numero e gerado com entropia).
    const primeiro = await dbGet(db,
      'SELECT numero FROM recebimentos_material_almoxarifado WHERE id = ?', [res1.body.id]);
    assert.strictEqual(res2.body.error,
      `Nota fiscal NF-DUP-1 já lançada no recebimento ${primeiro.numero} para este fornecedor`);

    // (Fase 2) A CONTAGEM E O QUE TORNA A SABOTAGEM 3 (mover a guarda para DEPOIS do
    // `inserirComNumeroUnico`) visivel: sem ela, o documento duplicado e GRAVADO, a recusa
    // acontece, e nada mais no arquivo acusa — nao ha transacao neste modulo, entao o INSERT do
    // cabecalho PERSISTE quando o `throw` vem depois dele.
    // Divergencia declarada do brief: a contagem e ESCOPADA pela NF em vez de global
    // (`COUNT(*)` da tabela inteira). A sensibilidade a sabotagem 3 e a mesma — o documento
    // duplicado tem esta NF —, e assim o cenario nao depende de ser o PRIMEIRO do arquivo.
    const quantos = await dbGet(db,
      'SELECT COUNT(*) AS n FROM recebimentos_material_almoxarifado WHERE nota_fiscal = ?',
      ['NF-DUP-1']);
    assert.strictEqual(quantos.n, 1, 'o segundo POST nao pode ter GRAVADO documento antes de recusar');
  });

  await test('(2) A ASSERCAO QUE MEDE O DANO: saldo 10 e UMA conta a pagar, nao 20 e duas', async () => {
    const material = await novoMaterial('E36-DUP-2');
    const body = {
      nota_fiscal: 'NF-DUP-2', fornecedor_id: fornA.lastID,
      itens: [{ material_id: material, quantidade: 10 }],
    };
    const contasAntes = await contarContas();
    const res1 = await rec(app).send(body);
    const res2 = await rec(app).send(body);
    assert.strictEqual(res1.status, 201, JSON.stringify(res1.body));

    // Processa TODOS os documentos que a rota aceitou criar. Depois do conserto e um; antes do
    // conserto eram dois, e e dai que saem o 20 e as 2 contas que este cenario mede.
    const criados = [res1, res2].filter((r) => r.status === 201).map((r) => r.body.id);
    for (const id of criados) {
      await processarAteOFim(id,
        { nota_fiscal: 'NF-DUP-2', fornecedor_id: fornA.lastID, fornecedor_nome: 'Forn Dup A' });
    }

    const m = await dbGet(db,
      'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [material]);
    const contasNovas = await contarContas() - contasAntes;
    // As DUAS medidas do dano entram na mensagem da primeira assercao de proposito: a assercao que
    // cai primeiro esconderia a outra, e a rodada RED tem de mostrar o 20 E as 2 contas na mesma
    // linha do `✗` — senao metade do dano fica sem numero registrado.
    const medida = `documentos processados: ${criados.length}, contas a pagar novas: ${contasNovas}`;
    assert.strictEqual(m.quantidade_atual, 10,
      `a mesma NF nao pode creditar o material duas vezes (${medida})`);
    assert.strictEqual(contasNovas, 1, `a mesma NF nao pode gerar duas contas a pagar (${medida})`);
  });

  await test('(3) mesma NF, fornecedor DIFERENTE: os dois entram', async () => {
    const material = await novoMaterial('E36-DUP-3');
    const itens = [{ material_id: material, quantidade: 5 }];
    const r1 = await rec(app).send({ nota_fiscal: 'NF-DUP-3', fornecedor_id: fornA.lastID, itens });
    const r2 = await rec(app).send({ nota_fiscal: 'NF-DUP-3', fornecedor_id: fornB.lastID, itens });
    assert.strictEqual(r1.status, 201, JSON.stringify(r1.body));
    // Dois fornecedores emitem nota com o mesmo numero; barrar seria pior que o furo.
    assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));
  });

  await test('(4) sem nota fiscal: NULL nao e duplicata', async () => {
    const material = await novoMaterial('E36-DUP-4');
    const body = { fornecedor_id: fornA.lastID, itens: [{ material_id: material, quantidade: 5 }] };
    const r1 = await rec(app).send(body);
    const r2 = await rec(app).send(body);
    assert.strictEqual(r1.status, 201, JSON.stringify(r1.body));
    assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));
  });

  await test('(5) fornecedor NAO identificado nao caracteriza duplicata', async () => {
    const material = await novoMaterial('E36-DUP-5');
    // (Fase 2) os TRES identificadores ausentes — `fornecedor_id`, `fornecedor_cnpj` e
    // `fornecedor_nome` —, agora que o nome entrou na chave. Este cenario e o que protege os
    // arquivos existentes que criam recebimento pela rota sem fornecedor nenhum.
    const body = { nota_fiscal: 'NF-DUP-5', itens: [{ material_id: material, quantidade: 5 }] };
    const r1 = await rec(app).send(body);
    const r2 = await rec(app).send(body);
    assert.strictEqual(r1.status, 201, JSON.stringify(r1.body));
    assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));
  });

  // (Fase 2) CENARIO NOVO — e o unico que entra pelo caminho REAL da tela: `handleCriar` nunca
  // manda `fornecedor_id` (`RecebimentosAlmoxarifado.js:342-354`, e o campo nao existe no `form`,
  // `:86-93`); o `<select>` copia `razao_social` -> `fornecedor_nome` e `cnpj` -> `fornecedor_cnpj`.
  // Com a chave so em id/CNPJ, a guarda ficaria INALCANCAVEL pela tela sempre que o fornecedor nao
  // tivesse CNPJ digitado — regra entregue e porta faltando. E a regua da sabotagem 5.
  await test('(7) a chave que a TELA usa: mesma NF e mesmo fornecedor_nome, sem id e sem CNPJ', async () => {
    const material = await novoMaterial('E36-DUP-7');
    const body = {
      nota_fiscal: 'NF-TELA-1', fornecedor_nome: 'Acos Vale Ltda',
      itens: [{ material_id: material, quantidade: 5 }],
    };
    const r1 = await rec(app).send(body);
    assert.strictEqual(r1.status, 201, JSON.stringify(r1.body));
    const r2 = await rec(app).send(body);
    assert.strictEqual(r2.status, 409, JSON.stringify(r2.body));
    const primeiro = await dbGet(db,
      'SELECT numero FROM recebimentos_material_almoxarifado WHERE id = ?', [r1.body.id]);
    assert.strictEqual(r2.body.error,
      `Nota fiscal NF-TELA-1 já lançada no recebimento ${primeiro.numero} para este fornecedor`);
  });

  await test('(6) a SEGUNDA porta: PUT /fiscal nao pode trazer a NF de outro documento', async () => {
    const material = await novoMaterial('E36-DUP-6');
    const itens = [{ material_id: material, quantidade: 5 }];
    const a = await rec(app).send({ nota_fiscal: 'NF-X', fornecedor_id: fornB.lastID, itens });
    const b = await rec(app).send({ fornecedor_id: fornB.lastID, itens });
    assert.strictEqual(a.status, 201, JSON.stringify(a.body));
    assert.strictEqual(b.status, 201, JSON.stringify(b.body));

    // (Fase 2) OBRIGATORIO: `salvarDadosFiscal` recusa status RECEBIDO ANTES de olhar a NF
    // (`receiptService.js:253-259`). Sem este avanco as duas metades deste cenario responderiam
    // 400 "Dados fiscais só podem ser editados antes do processamento" — antes E depois do
    // conserto —, e a metade positiva seria inalcancavel.
    for (const id of [a.body.id, b.body.id]) {
      const r = await wf(app, id, 'iniciar_conferencia');
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    }

    // O `PUT` manda SO a NF: o fornecedor efetivo vem do registro, pelo COALESCE do UPDATE — e a
    // guarda tem de olhar o mesmo valor efetivo, senao deixa passar o caso mais comum.
    const dup = await request(app).put(`/api/almoxarifado/recebimentos/${b.body.id}/fiscal`)
      .send({ nota_fiscal: 'NF-X' });
    assert.strictEqual(dup.status, 409, JSON.stringify(dup.body));
    const docA = await dbGet(db,
      'SELECT numero FROM recebimentos_material_almoxarifado WHERE id = ?', [a.body.id]);
    assert.strictEqual(dup.body.error,
      `Nota fiscal NF-X já lançada no recebimento ${docA.numero} para este fornecedor`);
    const docB = await dbGet(db,
      'SELECT nota_fiscal FROM recebimentos_material_almoxarifado WHERE id = ?', [b.body.id]);
    assert.strictEqual(docB.nota_fiscal, null, 'a recusa e ANTES do UPDATE: B nao pode ter ficado com a NF de A');

    // METADE POSITIVA: salvar os dados fiscais do PROPRIO documento, com a PROPRIA NF, duas vezes
    // seguidas nao pode se autoacusar. E a regua da sabotagem 4 (tirar o `AND id <> ?`).
    const proprio = await request(app).put(`/api/almoxarifado/recebimentos/${a.body.id}/fiscal`)
      .send({ nota_fiscal: 'NF-X', nota_serie: '3' });
    assert.strictEqual(proprio.status, 200, JSON.stringify(proprio.body));
  });

  // ── (8)(9)(10) revisao final, R3/R4/R5 — a chave de fornecedor era contornavel de tres jeitos ──
  /**
   * Tres achados do segundo revisor, um conserto: a comparacao saiu do SQL e passou a ser feita em
   * JS sobre os candidatos buscados pela NF normalizada, casando se QUALQUER perna casar (id, ou
   * CNPJ so-digitos, ou nome sem acento/caixa/espaco duplo).
   *
   * R3 — `UPPER` do SQLite e ASCII-ONLY. Medido por sonda: 'José Aços Ltda' e 'JOSÉ AÇOS LTDA',
   * mesma NF, sem id e sem CNPJ -> 201 + 201, dois documentos, estoque creditado duas vezes. E o
   * caminho REAL da tela, que manda nome digitado a mao; basta o Caps Lock em uma das duas vezes.
   *
   * R4 — identificacao MISTA vencia a guarda inteira: o documento A digitado a mao (so nome) e o B
   * escolhido no `<select>` (nome E CNPJ) nao se encontravam, porque a ordem de preferencia
   * escolhia UMA perna e descartava as outras — o B comparava por CNPJ, e A nao tem CNPJ.
   *
   * R5 — a perna do CNPJ fazia `TRIM` na COLUNA mas nao no PARAMETRO, e nao normalizava
   * pontuacao: ' 12.345.678/0001-00 ' nao achava '12345678000100'.
   *
   * DESCARTADO: resolver no SQL. Nao ha como tirar acento em SQLite sem extensao (o `UPPER` e
   * ASCII-only justamente por isso), e um `REPLACE` encadeado por acento seria ilegivel e
   * incompleto. ⚠️ CONSEQUENCIA REGISTRADA: a consulta da letra A do fechamento, que mede
   * duplicatas em PRODUCAO, roda em SQL — ela NAO enxerga as duplicatas por acento e vai
   * SUB-REPORTAR. Esta dito no doc de fechamento.
   */
  await test('(8) R3: acento e caixa no nome do fornecedor nao criam dois documentos', async () => {
    const material = await novoMaterial('E36-DUP-8');
    const itens = [{ material_id: material, quantidade: 5 }];
    const r1 = await rec(app).send({ nota_fiscal: 'NF-ACENTO', fornecedor_nome: 'José Aços Ltda', itens });
    assert.strictEqual(r1.status, 201, JSON.stringify(r1.body));
    // Mesma empresa, digitada com Caps Lock ligado — e com espaco duplo, que a normalizacao colapsa.
    // ESTA metade e a que o `UPPER` do SQLite perdia: em JS, `toUpperCase()` e Unicode-aware.
    const r2 = await rec(app).send({ nota_fiscal: 'NF-ACENTO', fornecedor_nome: 'JOSÉ  AÇOS LTDA', itens });
    assert.strictEqual(r2.status, 409, JSON.stringify(r2.body));
    const primeiro = await dbGet(db,
      'SELECT numero FROM recebimentos_material_almoxarifado WHERE id = ?', [r1.body.id]);
    assert.strictEqual(r2.body.error,
      `Nota fiscal NF-ACENTO já lançada no recebimento ${primeiro.numero} para este fornecedor`);

    // ⚠️ E a metade que exige a REMOCAO DE ACENTO, e nao so a caixa — achado do controle positivo
    // desta onda: a sabotagem que o revisor previu ("tirar o strip de diacriticos derruba (8)")
    // NAO derrubava nada com as duas metades acima, porque `'José'.toUpperCase()` e `'JOSÉ'`
    // casam sem strip nenhum. Quem digita sem acento (teclado, copiar/colar de sistema legado,
    // importacao) e o caso que sobra — e sem esta linha a normalizacao NFD nao tem regua.
    const semAcento = await rec(app).send({ nota_fiscal: 'NF-ACENTO', fornecedor_nome: 'Jose Acos Ltda', itens });
    assert.strictEqual(semAcento.status, 409, JSON.stringify(semAcento.body));

    // Metade POSITIVA, no mesmo cenario: fornecedor REALMENTE outro continua entrando — sem isto,
    // "normalizar" poderia ter virado "achatar tudo" e a regua (3) e a unica a reclamar.
    const outro = await rec(app).send({ nota_fiscal: 'NF-ACENTO', fornecedor_nome: 'Joana Ferro ME', itens });
    assert.strictEqual(outro.status, 201, JSON.stringify(outro.body));
  });

  await test('(9) R4: identificacao MISTA (so nome x nome + CNPJ) tem de se encontrar', async () => {
    const material = await novoMaterial('E36-DUP-9');
    const itens = [{ material_id: material, quantidade: 5 }];
    // A: digitado a mao, so nome.
    const a = await rec(app).send({ nota_fiscal: 'NF-MISTA', fornecedor_nome: 'Metalurgica Sul', itens });
    assert.strictEqual(a.status, 201, JSON.stringify(a.body));
    // B: escolhido no <select>, que copia razao_social E cnpj. Pela ordem de preferencia antiga, o
    // B comparava por CNPJ — e o A nao tem CNPJ, entao nunca se achavam.
    const b = await rec(app).send({
      nota_fiscal: 'NF-MISTA', fornecedor_nome: 'Metalurgica Sul',
      fornecedor_cnpj: '99.888.777/0001-66', itens,
    });
    assert.strictEqual(b.status, 409, JSON.stringify(b.body));
    const docA = await dbGet(db,
      'SELECT numero FROM recebimentos_material_almoxarifado WHERE id = ?', [a.body.id]);
    assert.strictEqual(b.body.error,
      `Nota fiscal NF-MISTA já lançada no recebimento ${docA.numero} para este fornecedor`);
  });

  await test('(10) R5: CNPJ com espaco e pontuacao diferente e o MESMO CNPJ', async () => {
    const material = await novoMaterial('E36-DUP-10');
    const itens = [{ material_id: material, quantidade: 5 }];
    const a = await rec(app).send({
      nota_fiscal: 'NF-CNPJ', fornecedor_nome: 'Aluminio Norte SA',
      fornecedor_cnpj: '12.345.678/0001-00', itens,
    });
    assert.strictEqual(a.status, 201, JSON.stringify(a.body));
    // Nome DIFERENTE de proposito: assim o 409 so pode vir da perna do CNPJ. Com o nome igual, o
    // cenario passaria mesmo com a perna do CNPJ quebrada.
    const b = await rec(app).send({
      nota_fiscal: 'NF-CNPJ', fornecedor_nome: 'Aluminio Norte (matriz)',
      fornecedor_cnpj: ' 12345678000100 ', itens,
    });
    assert.strictEqual(b.status, 409, JSON.stringify(b.body));
    const docA = await dbGet(db,
      'SELECT numero FROM recebimentos_material_almoxarifado WHERE id = ?', [a.body.id]);
    assert.strictEqual(b.body.error,
      `Nota fiscal NF-CNPJ já lançada no recebimento ${docA.numero} para este fornecedor`);

    // Metade POSITIVA: CNPJ de digitos DIFERENTES nao e o mesmo fornecedor (e o nome tambem difere).
    const outro = await rec(app).send({
      nota_fiscal: 'NF-CNPJ', fornecedor_nome: 'Aluminio Oeste',
      fornecedor_cnpj: '12.345.678/0002-00', itens,
    });
    assert.strictEqual(outro.status, 201, JSON.stringify(outro.body));
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
